import mongoose from 'mongoose';
import CopaSCConfig from '../models/CopaSCConfig.js';
import CopaSCMatch from '../models/CopaSCMatch.js';
import Rodada from '../models/Rodada.js';
import AjusteFinanceiro from '../models/AjusteFinanceiro.js';
import { invalidarExtratoCache } from '../utils/cache-invalidator.js';
import { CURRENT_SEASON } from '../config/seasons.js';

// =============================================================================
// HELPERS
// =============================================================================

function _shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

async function _getRankingMap(ligaId, rodada, temporada) {
    const todasRodadas = await Rodada.aggregate([
        { $match: {
            ligaId: new mongoose.Types.ObjectId(ligaId),
            temporada: Number(temporada),
            rodada: { $lte: Number(rodada) },
            populacaoFalhou: { $ne: true }
        }},
        { $group: { _id: '$timeId', pontuacaoTotal: { $sum: '$pontos' } } },
        { $sort: { pontuacaoTotal: -1 } }
    ]);
    // Map timeId → posição (1-based)
    const map = new Map();
    todasRodadas.forEach((r, i) => map.set(Number(r._id), i + 1));
    return map;
}

// =============================================================================
// SORTEIO DOS GRUPOS
// =============================================================================

export async function realizarSorteio(ligaId, temporada = CURRENT_SEASON) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    if (!config) throw { status: 404, message: 'Copa SC não configurada para esta liga.' };
    if (config.sorteio_realizado_em) throw { status: 409, message: 'Sorteio já realizado.' };

    const totalClassificatorio = await CopaSCMatch.countDocuments({
        liga_id: ligaId, temporada, fase: 'classificatorio'
    });
    const finalizadosClassificatorio = await CopaSCMatch.countDocuments({
        liga_id: ligaId, temporada, fase: 'classificatorio', status: 'finalizado'
    });
    if (totalClassificatorio === 0 || finalizadosClassificatorio < totalClassificatorio) {
        throw { status: 400, message: 'Fase Classificatória ainda não concluída.' };
    }

    const cabecas = [...config.cabecas_de_chave]; // [Number]
    const sobreviventes = await _getSobreviventesClassificatorio(ligaId, temporada);
    const todos32 = _montar32Classificados(config, sobreviventes);

    const restantes = _shuffleArray(
        todos32.filter(id => !cabecas.includes(id))
    );

    const nomeGrupos = ['A','B','C','D','E','F','G','H'];
    const grupos = nomeGrupos.map((nome, i) => ({
        nome,
        times: [cabecas[i]],
        standings: [_standingVazio(cabecas[i])]
    }));

    let grupoIdx = 0;
    for (const timeId of restantes) {
        grupos[grupoIdx].times.push(timeId);
        grupos[grupoIdx].standings.push(_standingVazio(timeId));
        grupoIdx = (grupoIdx + 1) % 8;
    }

    // Gerar confrontos round-robin (3 jornadas × 4 times = 6 confrontos por grupo × 8 = 48)
    const rodadas = config.calendario.grupos;
    const jornadasTemplate = [
        [[0,3],[1,2]],
        [[0,2],[3,1]],
        [[0,1],[2,3]]
    ];

    const matchesDraft = [];
    for (const grupo of grupos) {
        const t = grupo.times;
        jornadasTemplate.forEach(([par1, par2], jIdx) => {
            [par1, par2].forEach(([a, b]) => {
                matchesDraft.push({
                    liga_id: ligaId,
                    temporada,
                    fase: 'grupos',
                    rodadas_cartola: [rodadas[jIdx]],
                    grupo: grupo.nome,
                    confronto_num: jIdx + 1,
                    jornada: jIdx + 1,
                    mandante_id: t[a],
                    visitante_id: t[b],
                    pontos: { mandante: [], visitante: [] },
                    total: { mandante: 0, visitante: 0 },
                    vencedor_id: null,
                    status: 'agendado'
                });
            });
        });
    }

    await CopaSCMatch.insertMany(matchesDraft);
    await CopaSCConfig.updateOne(
        { liga_id: ligaId, temporada },
        { $set: { grupos, sorteio_realizado_em: new Date(), status: 'grupos' } }
    );

    return { message: 'Sorteio realizado com sucesso.', grupos };
}

function _standingVazio(timeId) {
    return { participante_id: timeId, pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, pontos_marcados: 0, pontos_sofridos: 0, saldo: 0 };
}

async function _getSobreviventesClassificatorio(ligaId, temporada) {
    const matches = await CopaSCMatch.find({ liga_id: ligaId, temporada, fase: 'classificatorio', status: 'finalizado' }).lean();
    // O sobrevivente final é o vencedor do último confronto (confronto_num mais alto)
    if (!matches.length) return [];
    const ultimo = matches.reduce((acc, m) => m.confronto_num > acc.confronto_num ? m : acc, matches[0]);
    return ultimo.vencedor_id ? [ultimo.vencedor_id] : [];
}

function _montar32Classificados(config, sobreviventes) {
    // Os 32 classificados = cabecas_de_chave + participantes adicionais até 32
    // A config deve ter been populada com os 32 antes do sorteio pelo admin
    // Aqui retornamos todos os times configurados nas cabecas + sobreviventes
    // Note: a config completa deve ter todos os 32 time_ids em cabecas_de_chave (8) + outros 24
    // Para simplificar: retornamos os cabecas + sobreviventes e o admin configura corretamente
    const todos = [...new Set([...config.cabecas_de_chave, ...sobreviventes])];
    return todos.slice(0, 32);
}

// =============================================================================
// STANDINGS DE GRUPO
// =============================================================================

export async function atualizarStandingsGrupo(ligaId, temporada, grupoNome) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada });
    if (!config) return;

    const grupo = config.grupos.find(g => g.nome === grupoNome);
    if (!grupo) return;

    const matches = await CopaSCMatch.find({
        liga_id: ligaId, temporada, fase: 'grupos', grupo: grupoNome, status: 'finalizado'
    }).lean();

    grupo.standings.forEach(s => {
        s.pontos = 0; s.jogos = 0; s.vitorias = 0; s.empates = 0;
        s.derrotas = 0; s.pontos_marcados = 0; s.pontos_sofridos = 0; s.saldo = 0;
    });

    const findS = (pid) => grupo.standings.find(s => s.participante_id === pid);

    for (const m of matches) {
        const sm = findS(m.mandante_id);
        const sv = findS(m.visitante_id);
        if (!sm || !sv) continue;

        sm.jogos++; sv.jogos++;
        sm.pontos_marcados += m.total.mandante;
        sv.pontos_marcados += m.total.visitante;
        sm.pontos_sofridos += m.total.visitante;
        sv.pontos_sofridos += m.total.mandante;

        if (m.total.mandante > m.total.visitante) {
            sm.pontos += 3; sm.vitorias++; sv.derrotas++;
        } else if (m.total.visitante > m.total.mandante) {
            sv.pontos += 3; sv.vitorias++; sm.derrotas++;
        } else {
            sm.pontos += 1; sm.empates++;
            sv.pontos += 1; sv.empates++;
        }
    }

    grupo.standings.forEach(s => { s.saldo = s.pontos_marcados - s.pontos_sofridos; });
    await config.save();
}

// =============================================================================
// CLASSIFICADOS DOS GRUPOS
// =============================================================================

export async function getClassificadosGrupos(ligaId, temporada, rodadaAtual) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const rankingMap = await _getRankingMap(ligaId, rodadaAtual || 26, temporada);

    return config.grupos.map(grupo => {
        const sorted = [...grupo.standings].sort((a, b) => {
            if (a.pontos !== b.pontos) return b.pontos - a.pontos;
            if (a.vitorias !== b.vitorias) return b.vitorias - a.vitorias;
            if (a.saldo !== b.saldo) return b.saldo - a.saldo;
            if (a.pontos_marcados !== b.pontos_marcados) return b.pontos_marcados - a.pontos_marcados;
            const posA = rankingMap.get(Number(a.participante_id)) ?? 9999;
            const posB = rankingMap.get(Number(b.participante_id)) ?? 9999;
            return posA - posB;
        });
        return { nome: grupo.nome, classificados: sorted.slice(0, 2), eliminados: sorted.slice(2) };
    });
}

// =============================================================================
// GERAÇÃO DE CONFRONTOS MATA-MATA
// =============================================================================

export async function gerarOitavas(ligaId, temporada, rodadaAtual) {
    const grupos = await getClassificadosGrupos(ligaId, temporada, rodadaAtual);
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const rodadas = config.calendario.oitavas;

    // Chaveamento Copa do Mundo: 1A×2B, 1B×2A, 1C×2D, 1D×2C, 1E×2F, 1F×2E, 1G×2H, 1H×2G
    const pares = [['A','B'],['C','D'],['E','F'],['G','H']];
    const matches = [];
    let confrontoNum = 1;

    for (const [nomeA, nomeB] of pares) {
        const gA = grupos.find(g => g.nome === nomeA);
        const gB = grupos.find(g => g.nome === nomeB);
        matches.push(
            { liga_id: ligaId, temporada, fase: 'oitavas', rodadas_cartola: rodadas, grupo: null, confronto_num: confrontoNum++, mandante_id: gA.classificados[0].participante_id, visitante_id: gB.classificados[1].participante_id, pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 }, vencedor_id: null, status: 'agendado' },
            { liga_id: ligaId, temporada, fase: 'oitavas', rodadas_cartola: rodadas, grupo: null, confronto_num: confrontoNum++, mandante_id: gB.classificados[0].participante_id, visitante_id: gA.classificados[1].participante_id, pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 }, vencedor_id: null, status: 'agendado' }
        );
    }

    await CopaSCMatch.insertMany(matches);
    await CopaSCConfig.updateOne({ liga_id: ligaId, temporada }, { $set: { status: 'oitavas' } });
}

export async function gerarProximaFaseMM(ligaId, temporada, faseAtual, proximaFase) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const matchesFase = await CopaSCMatch.find({ liga_id: ligaId, temporada, fase: faseAtual }).sort({ confronto_num: 1 }).lean();

    const vencedores = matchesFase.map(m => m.vencedor_id);
    const perdedores = matchesFase.map(m =>
        m.vencedor_id === m.mandante_id ? m.visitante_id : m.mandante_id
    );

    const matchesDraft = [];

    if (proximaFase === 'terceiro_lugar') {
        matchesDraft.push({
            liga_id: ligaId, temporada, fase: 'terceiro_lugar',
            rodadas_cartola: config.calendario.terceiro_lugar, grupo: null, confronto_num: 1,
            mandante_id: perdedores[0], visitante_id: perdedores[1],
            pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 },
            vencedor_id: null, status: 'agendado'
        });
        matchesDraft.push({
            liga_id: ligaId, temporada, fase: 'final',
            rodadas_cartola: config.calendario.final, grupo: null, confronto_num: 1,
            mandante_id: vencedores[0], visitante_id: vencedores[1],
            pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 },
            vencedor_id: null, status: 'agendado'
        });
        await CopaSCMatch.insertMany(matchesDraft);
        await CopaSCConfig.updateOne({ liga_id: ligaId, temporada }, { $set: { status: 'terceiro_lugar' } });
        return;
    }

    const rodadas = config.calendario[proximaFase];
    for (let i = 0; i < vencedores.length; i += 2) {
        matchesDraft.push({
            liga_id: ligaId, temporada, fase: proximaFase,
            rodadas_cartola: rodadas, grupo: null, confronto_num: Math.floor(i / 2) + 1,
            mandante_id: vencedores[i], visitante_id: vencedores[i + 1],
            pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 },
            vencedor_id: null, status: 'agendado'
        });
    }
    await CopaSCMatch.insertMany(matchesDraft);
    await CopaSCConfig.updateOne({ liga_id: ligaId, temporada }, { $set: { status: proximaFase } });
}

// =============================================================================
// PREMIAÇÃO FINANCEIRA
// =============================================================================

export async function aplicarPremiacao(ligaId, temporada) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const { campeao: vCampeao, vice: vVice, terceiro: vTerceiro } = config.premiacao;

    const finalMatch = await CopaSCMatch.findOne({ liga_id: ligaId, temporada, fase: 'final', status: 'finalizado' }).lean();
    const terceiroMatch = await CopaSCMatch.findOne({ liga_id: ligaId, temporada, fase: 'terceiro_lugar', status: 'finalizado' }).lean();

    if (!finalMatch || !terceiroMatch) return;

    const campeaoId = finalMatch.vencedor_id;
    const viceId = campeaoId === finalMatch.mandante_id ? finalMatch.visitante_id : finalMatch.mandante_id;
    const terceiroId = terceiroMatch.vencedor_id;

    const premios = [
        { timeId: campeaoId, valor: vCampeao, label: 'campeao' },
        { timeId: viceId, valor: vVice, label: 'vice' },
        { timeId: terceiroId, valor: vTerceiro, label: 'terceiro' }
    ];

    for (const { timeId, valor, label } of premios) {
        if (!valor || valor <= 0 || !timeId) continue;
        const chave = `copa_sc_${label}_${ligaId}_${temporada}_t${timeId}`;
        const jaExiste = await AjusteFinanceiro.findOne({
            liga_id: String(ligaId),
            time_id: Number(timeId),
            temporada: Number(temporada),
            chaveIdempotencia: chave
        }).lean();
        if (jaExiste) continue;

        await AjusteFinanceiro.criar({
            liga_id: String(ligaId),
            time_id: Number(timeId),
            temporada,
            descricao: `Copa SC ${temporada} - ${label === 'campeao' ? 'Campeão' : label === 'vice' ? 'Vice' : '3° Lugar'}`,
            valor: Math.abs(valor),
            criado_por: 'CopaSCManager',
            chaveIdempotencia: chave,
            metadata: { modulo: 'copa_sc', posicao: label }
        });
        await invalidarExtratoCache(String(ligaId), Number(timeId), temporada, `Copa SC ${label}`);
        console.log(`[COPA-SC] Prêmio ${label}: timeId=${timeId} +R$${valor}`);
    }

    await CopaSCConfig.updateOne(
        { liga_id: ligaId, temporada },
        { $set: { status: 'encerrado', encerrado_em: new Date() } }
    );
}
