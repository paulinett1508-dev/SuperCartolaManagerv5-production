/**
 * RESTA UM MANAGER v1.1.0
 * Módulo 2026 - Eliminação progressiva por menor pontuação
 *
 * Hooks:
 * - onRoundFinalize: Identifica o(s) pior(es) pontuador(es) da rodada entre os vivos
 * - onConsolidate: Efetua a eliminação e atualiza o cache
 *
 * Dependências: rodada (pontuações), ranking_geral (desempate)
 */
import BaseManager from './BaseManager.js';
import RestaUmCache from '../../../models/RestaUmCache.js';
import Rodada from '../../../models/Rodada.js';
import AjusteFinanceiro from '../../../models/AjusteFinanceiro.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default class RestaUmManager extends BaseManager {
    constructor() {
        super({
            id: 'resta_um',
            nome: 'Resta Um',
            moduloKey: 'resta_um',
            sempreAtivo: false,
            dependencias: ['rodada', 'ranking_geral'],
            prioridade: 72,
            temColeta: false,
            temFinanceiro: true,
        });
    }

    /**
     * onRoundFinalize - Identifica quem será eliminado nesta rodada
     *
     * @param {Object} ctx - Contexto da rodada
     * @param {string} ctx.ligaId - ID da liga
     * @param {number} ctx.rodada - Número da rodada
     */
    async onRoundFinalize(ctx) {
        const { ligaId, rodada } = ctx;
        console.log(`[RESTA-UM] Processando R${rodada} para liga ${ligaId}`);

        // Buscar pontuações da rodada da collection Rodada
        const rodadasDb = await Rodada.find({
            ligaId,
            rodada,
            temporada: CURRENT_SEASON,
        }).lean();

        const pontuacoes = rodadasDb.map(r => ({
            timeId: r.timeId,
            pontos: r.pontos || 0,
        }));

        // Calcular ranking geral (soma de todas as rodadas até agora) para desempate
        const todasRodadas = await Rodada.aggregate([
            { $match: { ligaId: ligaId.toString ? ligaId : ligaId, temporada: CURRENT_SEASON, rodada: { $lte: rodada } } },
            { $group: { _id: '$timeId', pontuacaoTotal: { $sum: '$pontos' } } },
            { $sort: { pontuacaoTotal: -1 } },
        ]);
        const rankingGeral = todasRodadas.map(r => ({ timeId: r._id, pontuacaoTotal: r.pontuacaoTotal }));

        console.log(`[RESTA-UM] Dados: ${pontuacoes.length} pontuações, ${rankingGeral.length} no ranking`);

        try {
            // Buscar edição em andamento
            const edicao = await RestaUmCache.findOne({
                liga_id: ligaId,
                temporada: CURRENT_SEASON,
                status: 'em_andamento',
            });

            if (!edicao) {
                // Verificar se existe edição pendente que deve iniciar nesta rodada
                const pendente = await RestaUmCache.findOne({
                    liga_id: ligaId,
                    temporada: CURRENT_SEASON,
                    status: 'pendente',
                    rodadaInicial: { $lte: rodada },
                });

                if (pendente) {
                    pendente.status = 'em_andamento';
                    pendente.rodadaAtual = rodada;
                    await pendente.save();
                    console.log(`[RESTA-UM] Edição ${pendente.edicao} iniciada na R${rodada}`);

                    // Proteção da primeira rodada: não eliminar ninguém
                    if (pendente.protecaoPrimeiraRodada) {
                        console.log(`[RESTA-UM] Proteção da 1ª rodada ativa - sem eliminações`);
                        await this._atualizarPontosParticipantes(pendente, pontuacoes, rodada);
                        return { pronto: true, eliminados: [], protecao: true };
                    }

                    return await this._processarEliminacao(pendente, pontuacoes, rankingGeral, rodada);
                }

                console.log(`[RESTA-UM] Nenhuma edição ativa/pendente para liga ${ligaId}`);
                return { pronto: true, ignorado: true };
            }

            // Verificar se rodada está dentro do range da edição
            if (edicao.rodadaFinal && rodada > edicao.rodadaFinal) {
                console.log(`[RESTA-UM] Rodada ${rodada} fora do range da edição (até R${edicao.rodadaFinal})`);
                return { pronto: true, ignorado: true };
            }

            edicao.rodadaAtual = rodada;
            return await this._processarEliminacao(edicao, pontuacoes, rankingGeral, rodada);

        } catch (error) {
            console.error(`[RESTA-UM] Erro no onRoundFinalize R${rodada}:`, error);
            return { pronto: false, error: error.message };
        }
    }

    /**
     * Processa a eliminação da rodada
     */
    async _processarEliminacao(edicao, pontuacoes, rankingGeral, rodada) {
        const vivos = edicao.participantes.filter(p => p.status === 'vivo');

        if (vivos.length <= 1) {
            // Só resta 1: é o campeão!
            if (vivos.length === 1) {
                vivos[0].status = 'campeao';
                edicao.status = 'finalizada';
                await edicao.save();
                console.log(`[RESTA-UM] CAMPEÃO: ${vivos[0].nomeTime} (edição ${edicao.edicao})`);
                await this._lancaCremiacao(edicao.liga_id, edicao.temporada, edicao)
                    .catch(err => console.error('[RESTA-UM-FIN] Erro nos créditos:', err.message));
            }
            return { pronto: true, finalizada: true, campeao: vivos[0]?.nomeTime };
        }

        // Mapear pontuações da rodada para os vivos
        const pontuacoesMap = new Map();
        if (pontuacoes && Array.isArray(pontuacoes)) {
            pontuacoes.forEach(p => {
                pontuacoesMap.set(String(p.timeId || p.time_id), p.pontos || p.pontuacao || 0);
            });
        }

        // Atualizar pontos dos participantes vivos
        for (const p of vivos) {
            const pontosRodada = pontuacoesMap.get(String(p.timeId)) || 0;
            p.pontosAcumulados = (p.pontosAcumulados || 0) + pontosRodada;
            p.rodadasSobrevividas = (p.rodadasSobrevividas || 0) + 1;
            p.pontosRodada = pontosRodada;
        }

        // Ordenar vivos por pontuação da rodada (ASC = piores primeiro)
        const vivosOrdenados = [...vivos].sort((a, b) => {
            const pontosA = pontuacoesMap.get(String(a.timeId)) || 0;
            const pontosB = pontuacoesMap.get(String(b.timeId)) || 0;

            // 1º critério: menor pontuação da rodada
            if (pontosA !== pontosB) return pontosA - pontosB;

            // 2º critério (desempate): menor pontuação acumulada
            if ((a.pontosAcumulados || 0) !== (b.pontosAcumulados || 0)) {
                return (a.pontosAcumulados || 0) - (b.pontosAcumulados || 0);
            }

            // 3º critério: mais vezes na zona de eliminação
            if ((a.vezesNaZona || 0) !== (b.vezesNaZona || 0)) {
                return (b.vezesNaZona || 0) - (a.vezesNaZona || 0);
            }

            // 4º critério: pior posição no ranking geral
            if (rankingGeral && Array.isArray(rankingGeral)) {
                const posA = rankingGeral.findIndex(r => String(r.timeId || r.time_id) === String(a.timeId));
                const posB = rankingGeral.findIndex(r => String(r.timeId || r.time_id) === String(b.timeId));
                return posB - posA;
            }

            return 0;
        });

        // Determinar quantos serão eliminados (nunca eliminar todos)
        const qtdEliminar = Math.min(
            edicao.eliminadosPorRodada || 1,
            vivos.length - 1
        );

        const eliminadosRodada = [];

        for (let i = 0; i < qtdEliminar; i++) {
            const eliminado = vivosOrdenados[i];
            const participante = edicao.participantes.find(
                p => String(p.timeId) === String(eliminado.timeId)
            );

            if (participante) {
                participante.status = 'eliminado';
                participante.rodadaEliminacao = rodada;

                eliminadosRodada.push({
                    rodada,
                    timeId: participante.timeId,
                    nomeTime: participante.nomeTime,
                    pontosRodada: pontuacoesMap.get(String(participante.timeId)) || 0,
                    dataEliminacao: new Date(),
                });
            }
        }

        // Incrementar vezesNaZona para quem ficou na próxima zona de corte
        const zonaSize = edicao.eliminadosPorRodada || 1;
        const naProximaZona = vivosOrdenados.slice(qtdEliminar, qtdEliminar + zonaSize);
        for (const p of naProximaZona) {
            const participante = edicao.participantes.find(
                pp => String(pp.timeId) === String(p.timeId) && pp.status === 'vivo'
            );
            if (participante) {
                participante.vezesNaZona = (participante.vezesNaZona || 0) + 1;
            }
        }

        // Adicionar ao histórico de eliminações
        edicao.historicoEliminacoes.push(...eliminadosRodada);

        // Verificar se só resta 1 vivo → campeão!
        const vivosAposEliminacao = edicao.participantes.filter(p => p.status === 'vivo');
        if (vivosAposEliminacao.length === 1) {
            vivosAposEliminacao[0].status = 'campeao';
            edicao.status = 'finalizada';
            console.log(`[RESTA-UM] CAMPEÃO: ${vivosAposEliminacao[0].nomeTime}`);
        }

        edicao.ultima_atualizacao = new Date();
        await edicao.save();

        // Fluxo financeiro: débitos para eliminados desta rodada
        if (edicao.fluxoFinanceiroHabilitado && edicao.taxaEliminacao > 0) {
            for (const el of eliminadosRodada) {
                await this._lancarDebitoEliminacao(
                    edicao.liga_id, edicao.temporada,
                    el.timeId, el.nomeTime,
                    edicao.taxaEliminacao, edicao.edicao, rodada,
                ).catch(err => console.error('[RESTA-UM-FIN] Erro no débito:', err.message));
            }
        }

        // Fluxo financeiro: créditos para premiados quando finalizar
        if (edicao.status === 'finalizada') {
            await this._lancaCremiacao(edicao.liga_id, edicao.temporada, edicao)
                .catch(err => console.error('[RESTA-UM-FIN] Erro nos créditos:', err.message));
        }

        console.log(`[RESTA-UM] R${rodada}: ${eliminadosRodada.length} eliminado(s), ${vivosAposEliminacao.length} vivos restantes`);

        return {
            pronto: true,
            eliminados: eliminadosRodada.map(e => e.nomeTime),
            vivosRestantes: vivosAposEliminacao.length,
            finalizada: edicao.status === 'finalizada',
        };
    }

    /**
     * Atualiza pontos dos participantes sem eliminar (usado na proteção da 1ª rodada)
     */
    async _atualizarPontosParticipantes(edicao, pontuacoes, rodada) {
        const pontuacoesMap = new Map();
        if (pontuacoes && Array.isArray(pontuacoes)) {
            pontuacoes.forEach(p => {
                pontuacoesMap.set(String(p.timeId || p.time_id), p.pontos || p.pontuacao || 0);
            });
        }

        for (const p of edicao.participantes) {
            if (p.status === 'vivo') {
                const pontosRodada = pontuacoesMap.get(String(p.timeId)) || 0;
                p.pontosAcumulados = (p.pontosAcumulados || 0) + pontosRodada;
                p.rodadasSobrevividas = (p.rodadasSobrevividas || 0) + 1;
                p.pontosRodada = pontosRodada;
            }
        }

        edicao.rodadaAtual = rodada;
        edicao.ultima_atualizacao = new Date();
        await edicao.save();
    }

    async onConsolidate(ctx) {
        console.log(`[RESTA-UM] Consolidando eliminação R${ctx.rodada}`);
        // Consolidação já é feita no onRoundFinalize
        return { consolidado: true };
    }

    /**
     * Cria débito idempotente para participante eliminado.
     * Usa descricao única como chave de idempotência.
     */
    async _lancarDebitoEliminacao(ligaId, temporada, timeId, nomeTime, taxaEliminacao, edicaoNum, rodada) {
        const descricao = `Resta Um E${edicaoNum} - Eliminado R${rodada}`;
        const jaExiste = await AjusteFinanceiro.findOne({
            liga_id: String(ligaId),
            time_id: Number(timeId),
            temporada: Number(temporada),
            descricao,
            ativo: true,
        }).lean();

        if (jaExiste) {
            console.log(`[RESTA-UM-FIN] Débito já registrado: ${nomeTime} R${rodada} (idempotência)`);
            return;
        }

        await AjusteFinanceiro.criar({
            liga_id: String(ligaId),
            time_id: timeId,
            temporada,
            descricao,
            valor: -Math.abs(taxaEliminacao), // débito = negativo
            criado_por: 'RestaUmManager',
        });
        console.log(`[RESTA-UM-FIN] Débito criado: ${nomeTime} -R$${taxaEliminacao} (R${rodada})`);
    }

    /**
     * Cria créditos para campeão / vice / terceiro ao finalizar.
     */
    async _lancaCremiacao(ligaId, temporada, edicao) {
        if (!edicao.fluxoFinanceiroHabilitado) return;

        const prem = edicao.premiacao || {};
        const campeao = edicao.participantes.find(p => p.status === 'campeao');

        // Ordenar eliminados por rodadaEliminacao DESC → os últimos eliminados são vice/terceiro
        const eliminadosOrdenados = edicao.participantes
            .filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        const premiados = [];
        if (campeao) {
            premiados.push({ p: campeao, valor: prem.campeao || 0, label: 'Campeao' });
        }
        if (prem.viceHabilitado !== false && eliminadosOrdenados[0]) {
            premiados.push({ p: eliminadosOrdenados[0], valor: prem.vice || 0, label: 'Vice' });
        }
        if (prem.terceiroHabilitado !== false && eliminadosOrdenados[1]) {
            premiados.push({ p: eliminadosOrdenados[1], valor: prem.terceiro || 0, label: '3o Lugar' });
        }

        for (const { p, valor, label } of premiados) {
            if (!valor || valor <= 0) continue;

            const descricao = `Resta Um E${edicao.edicao} - ${label}`;
            const jaExiste = await AjusteFinanceiro.findOne({
                liga_id: String(ligaId),
                time_id: Number(p.timeId),
                temporada: Number(temporada),
                descricao,
                ativo: true,
            }).lean();

            if (jaExiste) {
                console.log(`[RESTA-UM-FIN] Crédito já registrado: ${p.nomeTime} ${label} (idempotência)`);
                continue;
            }

            await AjusteFinanceiro.criar({
                liga_id: String(ligaId),
                time_id: p.timeId,
                temporada,
                descricao,
                valor: Math.abs(valor), // crédito = positivo
                criado_por: 'RestaUmManager',
            });
            console.log(`[RESTA-UM-FIN] Crédito criado: ${p.nomeTime} +R$${valor} (${label})`);
        }
    }
}
