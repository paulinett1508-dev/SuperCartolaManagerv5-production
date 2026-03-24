/**
 * Controller: Tesouraria
 *
 * Gestão financeira centralizada — saldos de todos os participantes de todas as ligas.
 * Extraído de routes/tesouraria-routes.js (E1 fix — business logic fora de route files).
 *
 * @version 1.0.0 (E1: extração de tesouraria-routes.js)
 */

import mongoose from "mongoose";
import Liga from "../models/Liga.js";
import ExtratoFinanceiroCache from "../models/ExtratoFinanceiroCache.js";
import FluxoFinanceiroCampos from "../models/FluxoFinanceiroCampos.js";
import AcertoFinanceiro from "../models/AcertoFinanceiro.js";
import InscricaoTemporada from "../models/InscricaoTemporada.js";
import AjusteFinanceiro from "../models/AjusteFinanceiro.js";
import Top10Cache from "../models/Top10Cache.js";
import { CURRENT_SEASON, PREVIOUS_SEASON } from "../config/seasons.js";
import {
    calcularResumoDeRodadas,
    transformarTransacoesEmRodadas,
} from "./extratoFinanceiroCacheController.js";
import {
    calcularSaldoParticipante,
    aplicarAjusteInscricaoBulk,
} from "../utils/saldo-calculator.js";
import { salvarAcertoTransacional, desativarAcerto } from "../services/acertoService.js";
// C4 FIX: Invalidar ExtratoFinanceiroCache quando acerto é criado/deletado
import { onAcertoCreated } from "../utils/cache-invalidator.js";

// =============================================================================
// ✅ C3 FIX: Helper interno — elimina cálculo de saldo triplicado nos 3 GET endpoints
// =============================================================================

const TIPOS_ESPECIAIS_SALDO = ['INSCRICAO_TEMPORADA', 'SALDO_TEMPORADA_ANTERIOR', 'LEGADO_ANTERIOR'];

/**
 * Calcula saldo de um participante a partir de dados pré-carregados (bulk-safe).
 * Usado por getParticipantes, getLiga e getResumo para evitar duplicação.
 *
 * @param {object} p
 * @param {string}   p.ligaId
 * @param {number}   p.temporadaNum
 * @param {Array}    p.historico      - historico_transacoes do ExtratoFinanceiroCache
 * @param {object}   p.extrato        - documento ExtratoFinanceiroCache (lean)
 * @param {Array}    p.camposAtivos   - campos com valor !== 0 (FluxoFinanceiroCampos)
 * @param {object}   p.inscricaoData  - documento InscricaoTemporada (lean) ou null
 * @param {Array}    p.ajustesList    - array de AjusteFinanceiro para este time
 * @returns {{ saldoConsolidado, resumoCalculado, saldoAjustes, inscricaoInfo }}
 */
function _calcularSaldoCore({ ligaId, temporadaNum, historico, extrato, camposAtivos, inscricaoData, ajustesList }) {
    const apenasTransacoesEspeciais = historico.length > 0 &&
        historico.every(t => TIPOS_ESPECIAIS_SALDO.includes(t.tipo));

    let saldoConsolidado = 0;
    let resumoCalculado = { bonus: 0, onus: 0, pontosCorridos: 0, mataMata: 0, top10: 0, camposManuais: 0 };

    if (apenasTransacoesEspeciais) {
        if (temporadaNum >= CURRENT_SEASON) {
            historico.forEach(t => {
                if (t.tipo && t.tipo !== 'INSCRICAO_TEMPORADA' && t.tipo !== 'SALDO_TEMPORADA_ANTERIOR') {
                    saldoConsolidado += t.valor || 0;
                }
            });
        } else {
            saldoConsolidado = extrato?.saldo_consolidado || 0;
        }
    } else {
        const rodadasProcessadas = transformarTransacoesEmRodadas(historico, ligaId);
        // C4 FIX: FluxoFinanceiroCampos apenas para temporadas <= PREVIOUS_SEASON
        // Para CURRENT_SEASON+, AjusteFinanceiro é o sistema vigente — incluir ambos causava double-count
        // (alinhado com saldo-calculator.js A3 FIX)
        const camposParaCalculo = temporadaNum <= PREVIOUS_SEASON ? camposAtivos : [];
        resumoCalculado = calcularResumoDeRodadas(rodadasProcessadas, camposParaCalculo);
        saldoConsolidado = resumoCalculado.saldo;
    }

    let inscricaoInfo = { saldoAjustado: saldoConsolidado, taxaInscricao: 0, pagouInscricao: true, saldoAnteriorTransferido: 0, dividaAnterior: 0 };
    if (temporadaNum >= CURRENT_SEASON) {
        inscricaoInfo = aplicarAjusteInscricaoBulk(saldoConsolidado, inscricaoData, historico);
        saldoConsolidado = inscricaoInfo.saldoAjustado;
    }

    let saldoAjustes = 0;
    if (temporadaNum >= CURRENT_SEASON) {
        saldoAjustes = (ajustesList || []).reduce((acc, a) => acc + (a.valor || 0), 0);
        saldoConsolidado += saldoAjustes;
    }

    return { saldoConsolidado, resumoCalculado, saldoAjustes, inscricaoInfo };
}

// =============================================================================
// GET /api/tesouraria/participantes
// Retorna TODOS os participantes de TODAS as ligas com saldos
// =============================================================================

export async function getParticipantes(req, res) {
    try {
        const { temporada = CURRENT_SEASON } = req.query;
        const startTime = Date.now();

        console.log(`[TESOURARIA] Buscando participantes - Temporada ${temporada}`);

        // Buscar todas as ligas ativas
        const ligas = await Liga.find({ ativo: { $ne: false } }).lean();

        if (!ligas || ligas.length === 0) {
            return res.json({
                success: true,
                participantes: [],
                totais: { credores: 0, devedores: 0, quitados: 0, total: 0 },
            });
        }

        // ✅ v2.0: Coletar todos os timeIds para bulk queries
        const allTimeIds = [];
        const ligaMap = new Map();

        for (const liga of ligas) {
            const ligaId = liga._id.toString();
            ligaMap.set(ligaId, liga);
            for (const p of liga.participantes || []) {
                allTimeIds.push(p.time_id);
            }
        }

        // ✅ v2.0: Bulk queries para todos os dados
        // ✅ v3.0: Adicionar InscricaoTemporada ao bulk query
        // ✅ v3.1 FIX CRÍTICO: Adicionar filtro de temporada em ExtratoFinanceiroCache e FluxoFinanceiroCampos
        const temporadaNum = Number(temporada);
        const [todosExtratos, todosCampos, todosAcertos, todasInscricoes, todosAjustes] = await Promise.all([
            ExtratoFinanceiroCache.find({ time_id: { $in: allTimeIds }, temporada: temporadaNum }).lean(),
            FluxoFinanceiroCampos.find({ time_id: { $in: allTimeIds.map(Number) }, temporada: temporadaNum }).lean(),
            AcertoFinanceiro.find({ temporada: temporadaNum, ativo: true }).lean(),
            temporadaNum >= CURRENT_SEASON
                ? InscricaoTemporada.find({ temporada: temporadaNum }).lean()
                : Promise.resolve([]),
            temporadaNum >= CURRENT_SEASON
                ? AjusteFinanceiro.find({ temporada: temporadaNum, ativo: true }).lean()
                : Promise.resolve([])
        ]);

        // Mapa de inscrições por liga_time
        const inscricoesMapAll = new Map();
        todasInscricoes.forEach(i => {
            const key = `${String(i.liga_id)}_${i.time_id}`;
            inscricoesMapAll.set(key, i);
        });

        // ✅ v3.2 FIX BUG-001: Mapa de ajustes financeiros por liga_time
        const ajustesFinMap = new Map();
        todosAjustes.forEach(a => {
            const key = `${String(a.liga_id)}_${a.time_id}`;
            if (!ajustesFinMap.has(key)) ajustesFinMap.set(key, []);
            ajustesFinMap.get(key).push(a);
        });

        // Criar mapas para acesso O(1) - chave composta liga_time
        const extratoMap = new Map();
        todosExtratos.forEach(e => {
            const key = `${e.liga_id}_${e.time_id}`;
            extratoMap.set(key, e);
        });

        const camposMap = new Map();
        todosCampos.forEach(c => {
            const key = `${c.liga_id}_${c.time_id}`;
            camposMap.set(key, c);
        });

        // Agrupar acertos por liga_time
        const acertosMap = new Map();
        todosAcertos.forEach(a => {
            const key = `${a.liga_id}_${a.time_id}`;
            if (!acertosMap.has(key)) acertosMap.set(key, []);
            acertosMap.get(key).push(a);
        });

        const participantes = [];
        let totalCredores = 0;
        let totalDevedores = 0;
        let quantidadeCredores = 0;
        let quantidadeDevedores = 0;
        let quantidadeQuitados = 0;

        // Processar cada liga
        for (const liga of ligas) {
            const ligaId = liga._id.toString();
            const ligaNome = liga.nome || "Liga sem nome";

            // ✅ v2.1: Extrair módulos ativos desta liga
            const modulosAtivos = {
                banco: liga.modulos_ativos?.banco !== false,
                pontosCorridos: liga.modulos_ativos?.pontosCorridos === true || liga.configuracoes?.pontos_corridos?.habilitado === true,
                mataMata: liga.modulos_ativos?.mataMata === true || liga.configuracoes?.mata_mata?.habilitado === true,
                top10: liga.modulos_ativos?.top10 === true || liga.configuracoes?.top10?.habilitado === true,
                melhorMes: liga.modulos_ativos?.melhorMes === true || liga.configuracoes?.melhor_mes?.habilitado === true,
                artilheiro: liga.modulos_ativos?.artilheiro === true || liga.configuracoes?.artilheiro?.habilitado === true,
                luvaOuro: liga.modulos_ativos?.luvaOuro === true || liga.configuracoes?.luva_ouro?.habilitado === true,
                restaUm: liga.modulos_ativos?.restaUm === true,
                capitaoLuxo: liga.modulos_ativos?.capitaoLuxo === true,
            };

            // Processar cada participante da liga
            for (const participante of liga.participantes || []) {
                const timeId = String(participante.time_id);
                const nomeTime = participante.nome_time || "Time sem nome";
                const nomeCartola = participante.nome_cartola || "";
                const escudo = participante.escudo_url || participante.escudo || null;
                const ativo = participante.ativo !== false;

                const key = `${ligaId}_${timeId}`;

                // Buscar dados do cache
                const extrato = extratoMap.get(key);
                const historico = extrato?.historico_transacoes || [];
                const camposDoc = camposMap.get(key);
                const camposAtivos = camposDoc?.campos?.filter(c => c.valor !== 0) || [];

                // ✅ C3 FIX: _calcularSaldoCore elimina bloco de 40 linhas triplicado
                const { saldoConsolidado, resumoCalculado, saldoAjustes, inscricaoInfo } = _calcularSaldoCore({
                    ligaId, temporadaNum, historico, extrato, camposAtivos,
                    inscricaoData: inscricoesMapAll.get(key),
                    ajustesList: ajustesFinMap.get(key) || [],
                });
                const saldoCampos = resumoCalculado.camposManuais || 0;
                const { taxaInscricao, pagouInscricao, saldoAnteriorTransferido, dividaAnterior } = inscricaoInfo;

                const breakdown = {
                    banco: resumoCalculado.bonus + resumoCalculado.onus,
                    pontosCorridos: resumoCalculado.pontosCorridos,
                    mataMata: resumoCalculado.mataMata,
                    top10: resumoCalculado.top10,
                    melhorMes: 0,
                    artilheiro: 0,
                    luvaOuro: 0,
                    restaUm: 0,
                    capitaoLuxo: 0,
                    campos: saldoCampos,
                    ajustes: saldoAjustes,
                    acertos: 0,
                    taxaInscricao,
                    pagouInscricao,
                    saldoAnteriorTransferido,
                    dividaAnterior,
                };

                historico.forEach(t => {
                    if (t.tipo === 'MELHOR_MES') breakdown.melhorMes += t.valor || 0;
                    else if (t.tipo === 'ARTILHEIRO' || t.tipo === 'ARTILHEIRO_PREMIACAO') breakdown.artilheiro += t.valor || 0;
                    else if (t.tipo === 'LUVA_OURO') breakdown.luvaOuro += t.valor || 0;
                    else if (t.tipo === 'RESTA_UM' || (t.tipo === 'AJUSTE' && t.descricao?.startsWith('Resta Um'))) breakdown.restaUm += t.valor || 0;
                });

                const acertosList = acertosMap.get(key) || [];
                const acertosTemporada = acertosList.filter(a => Number(a.temporada) === temporadaNum);
                let totalPago = 0;
                let totalRecebido = 0;
                acertosTemporada.forEach(a => {
                    // ✅ v8.21.0 FIX: Alinhado com AcertoFinanceiro.calcularSaldoAcertos() (catch-all)
                    if (a.tipo === 'pagamento') totalPago += a.valor || 0;
                    else totalRecebido += a.valor || 0;
                });
                const saldoAcertos = totalPago - totalRecebido;

                breakdown.acertos = saldoAcertos;

                const saldoTemporada = saldoConsolidado;
                const saldoFinal = saldoTemporada + saldoAcertos;

                let situacao = "quitado";
                if (saldoFinal < -0.01) {
                    situacao = "devedor";
                    totalDevedores += Math.abs(saldoFinal);
                    quantidadeDevedores++;
                } else if (saldoFinal > 0.01) {
                    situacao = "credor";
                    totalCredores += saldoFinal;
                    quantidadeCredores++;
                } else {
                    quantidadeQuitados++;
                }

                if (participante.time_id) {
                    console.log(`[TESOURARIA-API] ${nomeTime}: saldoFinal=${saldoFinal.toFixed(2)} | situacao=${situacao}`);
                }

                participantes.push({
                    ligaId,
                    ligaNome,
                    timeId,
                    nomeTime,
                    nomeCartola,
                    escudo,
                    ativo,
                    temporada,
                    saldoTemporada: parseFloat(saldoTemporada.toFixed(2)),
                    saldo_temporada: parseFloat(saldoTemporada.toFixed(2)),  // C5: alias snake_case
                    saldoAcertos: parseFloat(saldoAcertos.toFixed(2)),
                    saldo_acertos: parseFloat(saldoAcertos.toFixed(2)),      // C5: alias snake_case
                    totalPago: parseFloat(totalPago.toFixed(2)),
                    totalRecebido: parseFloat(totalRecebido.toFixed(2)),
                    saldoFinal: parseFloat(saldoFinal.toFixed(2)),
                    saldo_final: parseFloat(saldoFinal.toFixed(2)),          // C5: alias snake_case
                    situacao,
                    quantidadeAcertos: acertosTemporada.length,
                    breakdown: {
                        banco: parseFloat(breakdown.banco.toFixed(2)),
                        pontosCorridos: parseFloat(breakdown.pontosCorridos.toFixed(2)),
                        mataMata: parseFloat(breakdown.mataMata.toFixed(2)),
                        top10: parseFloat(breakdown.top10.toFixed(2)),
                        melhorMes: parseFloat(breakdown.melhorMes.toFixed(2)),
                        artilheiro: parseFloat(breakdown.artilheiro.toFixed(2)),
                        luvaOuro: parseFloat(breakdown.luvaOuro.toFixed(2)),
                        campos: breakdown.campos,
                        ajustes: parseFloat((breakdown.ajustes || 0).toFixed(2)),
                        acertos: parseFloat(breakdown.acertos.toFixed(2)),
                        taxaInscricao: parseFloat((breakdown.taxaInscricao || 0).toFixed(2)),
                        pagouInscricao: breakdown.pagouInscricao,
                        saldoAnteriorTransferido: parseFloat((breakdown.saldoAnteriorTransferido || 0).toFixed(2)),
                        dividaAnterior: parseFloat((breakdown.dividaAnterior || 0).toFixed(2)),
                    },
                    modulosAtivos,
                });
            }
        }

        participantes.sort((a, b) => a.saldoFinal - b.saldoFinal);

        const elapsed = Date.now() - startTime;
        console.log(`[TESOURARIA] ✅ ${participantes.length} participantes em ${elapsed}ms`);

        console.log(`[TESOURARIA-API] 📊 TOTAIS calculados:`);
        console.log(`  Total participantes: ${participantes.length}`);
        console.log(`  Devedores: ${quantidadeDevedores}`);
        console.log(`  Credores: ${quantidadeCredores}`);
        console.log(`  Quitados: ${quantidadeQuitados}`);
        console.log(`  Validação: ${quantidadeDevedores + quantidadeCredores + quantidadeQuitados} = ${participantes.length}`);

        res.json({
            success: true,
            temporada,
            participantes,
            totais: {
                totalParticipantes: participantes.length,
                quantidadeCredores,
                quantidadeDevedores,
                quantidadeQuitados,
                totalAReceber: parseFloat(totalDevedores.toFixed(2)),
                totalAPagar: parseFloat(totalCredores.toFixed(2)),
                saldoGeral: parseFloat((totalDevedores - totalCredores).toFixed(2)),
            },
        });
    } catch (error) {
        console.error("[TESOURARIA] Erro ao buscar participantes:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// GET /api/tesouraria/liga/:ligaId
// Retorna participantes de UMA LIGA específica com saldos
// =============================================================================

export async function getLiga(req, res) {
    try {
        const { ligaId } = req.params;
        const { temporada = CURRENT_SEASON } = req.query;
        const startTime = Date.now();

        console.log(`[TESOURARIA] Buscando participantes da liga ${ligaId}`);

        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            return res.status(404).json({ success: false, error: "Liga não encontrada" });
        }

        const temporadaNum = Number(temporada);
        const ligaIdStr = String(ligaId);

        let participantesFiltrados = liga.participantes || [];
        let inscricoesMap = new Map();

        if (temporadaNum >= CURRENT_SEASON) {
            const inscricoesAtivas = await InscricaoTemporada.find({
                liga_id: new mongoose.Types.ObjectId(ligaId),
                temporada: temporadaNum,
                status: { $in: ['renovado', 'novo'] }
            }).lean();

            inscricoesAtivas.forEach(i => inscricoesMap.set(String(i.time_id), i));

            const ligaParticipantesMap = new Map();
            (liga.participantes || []).forEach(p => ligaParticipantesMap.set(String(p.time_id), p));

            participantesFiltrados = inscricoesAtivas.map(insc => {
                const timeIdStr = String(insc.time_id);
                const participanteLiga = ligaParticipantesMap.get(timeIdStr);

                return {
                    time_id: insc.time_id,
                    nome_time: insc.dados_participante?.nome_time || participanteLiga?.nome_time || "N/D",
                    nome_cartola: insc.dados_participante?.nome_cartoleiro || participanteLiga?.nome_cartola || "N/D",
                    escudo: insc.dados_participante?.escudo || participanteLiga?.foto_time || "",
                    clube_id: participanteLiga?.clube_id || insc.dados_participante?.time_coracao || null,
                    contato: insc.dados_participante?.contato || participanteLiga?.contato || null,
                    ativo: true,
                    status_inscricao: insc.status,
                    pagou_inscricao: insc.pagou_inscricao || false,
                    saldo_transferido: insc.saldo_transferido || 0
                };
            });

            console.log(`[TESOURARIA] Temporada ${temporadaNum}: ${participantesFiltrados.length} participantes (fonte: inscricoestemporada + liga.participantes)`);
        }

        const timeIds = participantesFiltrados.map(p => p.time_id);

        console.log(`[TESOURARIA] Buscando dados para temporada ${temporadaNum}`);

        const [todosExtratos, todosCampos, todosAcertos, todosAjustes] = await Promise.all([
            // C7 FIX: liga_id normalizado para String (sem mais $or com ObjectId)
            mongoose.connection.db.collection('extratofinanceirocaches').find({
                liga_id: ligaIdStr,
                // ✅ G2 FIX: coerção defensiva — extratofinanceirocaches armazena time_id como Number
                time_id: { $in: timeIds.map(Number) },
                temporada: { $in: [temporadaNum, temporadaNum - 1] }
            }).toArray(),

            FluxoFinanceiroCampos.find({
                liga_id: ligaIdStr,
                time_id: { $in: timeIds.map(Number) },
                temporada: { $in: [temporadaNum, temporadaNum - 1] }
            }).lean(),

            AcertoFinanceiro.find({
                liga_id: String(ligaId),
                temporada: { $in: [temporadaNum, temporadaNum - 1] },
                ativo: true
            }).lean(),

            temporadaNum >= CURRENT_SEASON
                ? AjusteFinanceiro.find({
                    liga_id: ligaIdStr,
                    temporada: temporadaNum,
                    ativo: true
                }).lean()
                : Promise.resolve([])
        ]);

        const extratoMap = new Map();
        const extratoAnteriorMap = new Map();
        const extratosOrdenados = [...todosExtratos].sort((a, b) => {
            const aIsSolicitada = a.temporada === temporadaNum;
            const bIsSolicitada = b.temporada === temporadaNum;
            if (aIsSolicitada && !bIsSolicitada) return 1;
            if (!aIsSolicitada && bIsSolicitada) return -1;
            return (a.temporada || 0) - (b.temporada || 0);
        });
        extratosOrdenados.forEach(e => {
            extratoMap.set(String(e.time_id), e);
            if (e.temporada === temporadaNum - 1) {
                extratoAnteriorMap.set(String(e.time_id), e);
            }
        });
        console.log(`[TESOURARIA] Extratos carregados: ${todosExtratos.length} (temporadas: ${[...new Set(todosExtratos.map(e => e.temporada))].join(', ')}) | Prioridade: ${temporadaNum}`);

        const camposMap = new Map();
        const camposOrdenados = [...todosCampos].sort((a, b) => {
            const aIsSolicitada = a.temporada === temporadaNum;
            const bIsSolicitada = b.temporada === temporadaNum;
            if (aIsSolicitada && !bIsSolicitada) return 1;
            if (!aIsSolicitada && bIsSolicitada) return -1;
            return (a.temporada || 0) - (b.temporada || 0);
        });
        camposOrdenados.forEach(c => camposMap.set(String(c.timeId), c));
        console.log(`[TESOURARIA] Campos carregados: ${todosCampos.length} (temporadas: ${[...new Set(todosCampos.map(c => c.temporada))].join(', ')}) | Prioridade: ${temporadaNum}`);

        const acertosMap = new Map();
        todosAcertos.forEach(a => {
            // ✅ G2/G3 FIX: AcertoFinanceiro migrado para time_id (Number) — a.timeId seria undefined
            const key = String(a.time_id ?? a.timeId);
            if (!acertosMap.has(key)) acertosMap.set(key, []);
            acertosMap.get(key).push(a);
        });

        const ajustesFinMap = new Map();
        todosAjustes.forEach(a => {
            const key = String(a.time_id);
            if (!ajustesFinMap.has(key)) ajustesFinMap.set(key, []);
            ajustesFinMap.get(key).push(a);
        });

        console.log(`[TESOURARIA] Bulk queries: ${todosExtratos.length} extratos, ${todosCampos.length} campos, ${todosAcertos.length} acertos, ${todosAjustes.length} ajustes`);

        const modulosAtivos = {
            banco: liga.modulos_ativos?.banco !== false,
            pontosCorridos: liga.modulos_ativos?.pontosCorridos === true || liga.configuracoes?.pontos_corridos?.habilitado === true,
            mataMata: liga.modulos_ativos?.mataMata === true || liga.configuracoes?.mata_mata?.habilitado === true,
            top10: liga.modulos_ativos?.top10 === true || liga.configuracoes?.top10?.habilitado === true,
            melhorMes: liga.modulos_ativos?.melhorMes === true || liga.configuracoes?.melhor_mes?.habilitado === true,
            artilheiro: liga.modulos_ativos?.artilheiro === true || liga.configuracoes?.artilheiro?.habilitado === true,
            luvaOuro: liga.modulos_ativos?.luvaOuro === true || liga.configuracoes?.luva_ouro?.habilitado === true,
            restaUm: liga.modulos_ativos?.restaUm === true,
            capitaoLuxo: liga.modulos_ativos?.capitaoLuxo === true,
        };

        // ✅ FIX Bug2: Bulk TOP10 lookup — cache pode não ter MICO/MITO se getExtratoFinanceiro nunca rodou
        // Top10Cache é criado pela consolidação e contém posições; valores R$ vêm da config da liga
        const top10DeltaMap = new Map();
        if (modulosAtivos.top10) {
            try {
                const top10Cache = await Top10Cache.findOne({
                    liga_id: ligaIdStr,
                    temporada: temporadaNum
                }).sort({ rodada_consolidada: -1 }).lean();

                if (top10Cache?.mitos?.length || top10Cache?.micos?.length) {
                    const configTop10 = liga.configuracoes?.top10 || {};
                    const valoresMito = configTop10.valores_mito || {};
                    const valoresMico = configTop10.valores_mico || {};

                    (top10Cache.mitos || []).slice(0, 10).forEach((m, i) => {
                        const tId = String(m.timeId || m.time_id);
                        const pos = i + 1;
                        const valor = valoresMito[pos] || valoresMito[String(pos)] || 0;
                        if (valor) top10DeltaMap.set(tId, (top10DeltaMap.get(tId) || 0) + valor);
                    });
                    (top10Cache.micos || []).slice(0, 10).forEach((m, i) => {
                        const tId = String(m.timeId || m.time_id);
                        const pos = i + 1;
                        const valor = valoresMico[pos] || valoresMico[String(pos)] || 0;
                        if (valor) top10DeltaMap.set(tId, (top10DeltaMap.get(tId) || 0) + valor);
                    });

                    if (top10DeltaMap.size > 0) {
                        console.log(`[TESOURARIA] TOP10 bulk lookup: ${top10DeltaMap.size} participantes com delta TOP10`);
                    }
                }
            } catch (err) {
                console.warn(`[TESOURARIA] Erro ao buscar Top10Cache (não-fatal):`, err.message);
            }
        }

        const participantes = [];
        let totalCredores = 0;
        let totalDevedores = 0;
        let quantidadeCredores = 0;
        let quantidadeDevedores = 0;
        let quantidadeQuitados = 0;

        for (const participante of participantesFiltrados) {
            const timeId = String(participante.time_id);

            const extrato = extratoMap.get(timeId);
            const historico = extrato?.historico_transacoes || [];
            const camposDoc = camposMap.get(timeId);
            const camposAtivos = camposDoc?.campos?.filter(c => c.valor !== 0) || [];

            // ✅ C3 FIX: _calcularSaldoCore elimina bloco triplicado
            let { saldoConsolidado, resumoCalculado, saldoAjustes, inscricaoInfo } = _calcularSaldoCore({
                ligaId, temporadaNum, historico, extrato, camposAtivos,
                inscricaoData: inscricoesMap.get(timeId),
                ajustesList: ajustesFinMap.get(timeId) || [],
            });
            const saldoCampos = resumoCalculado.camposManuais || 0;

            // ✅ FIX Bug2: Se TOP10 habilitado mas cache sem MICO/MITO, injetar delta do Top10Cache
            const temTop10NoHistorico = historico.some(t => t.tipo === 'MITO' || t.tipo === 'MICO');
            if (!temTop10NoHistorico && top10DeltaMap.has(timeId)) {
                const deltaTop10 = top10DeltaMap.get(timeId);
                saldoConsolidado += deltaTop10;
                resumoCalculado.top10 = (resumoCalculado.top10 || 0) + deltaTop10;
            }

            // B3-FALLBACK: Se inscrição sem saldo anterior, recalcular da temporada anterior
            if (temporadaNum >= CURRENT_SEASON &&
                (inscricaoInfo.saldoAnteriorTransferido === 0 || inscricaoInfo.saldoAnteriorTransferido == null)) {
                    const extratoAnt = extratoAnteriorMap.get(timeId);
                    if (extratoAnt) {
                        const histAnt = extratoAnt.historico_transacoes || [];
                        const camposAnt = camposMap.get(timeId)?.campos?.filter(c => c.valor !== 0) || [];
                        const rodadasAnt = transformarTransacoesEmRodadas(histAnt, ligaIdStr);
                        const resumoAnt = calcularResumoDeRodadas(rodadasAnt, camposAnt);
                        const acertosAntList = acertosMap.get(timeId) || [];
                        const acertos2025 = acertosAntList.filter(a => Number(a.temporada) === temporadaNum - 1);
                        let totalPago2025 = 0, totalRecebido2025 = 0;
                        acertos2025.forEach(a => {
                            if (a.tipo === 'pagamento') totalPago2025 += a.valor || 0;
                            else if (a.tipo === 'recebimento') totalRecebido2025 += a.valor || 0;
                        });
                        const saldoAcertos2025 = totalPago2025 - totalRecebido2025;
                        const saldoFinal2025 = resumoAnt.saldo + saldoAcertos2025;
                        if (Math.abs(saldoFinal2025) > 0.01) {
                            inscricaoInfo.saldoAnteriorTransferido = parseFloat(saldoFinal2025.toFixed(2));
                            console.log(`[TESOURARIA] B3-FALLBACK time=${timeId}: saldoAnterior2025=${saldoFinal2025.toFixed(2)} (InscricaoTemporada ausente/zerada)`);
                        }
                    }
            }

            const breakdown = {
                banco: resumoCalculado.bonus + resumoCalculado.onus,
                pontosCorridos: resumoCalculado.pontosCorridos,
                mataMata: resumoCalculado.mataMata,
                top10: resumoCalculado.top10,
                melhorMes: 0,
                artilheiro: 0,
                luvaOuro: 0,
                restaUm: 0,
                capitaoLuxo: 0,
                ajustes: saldoAjustes,
                acertos: 0,
                taxaInscricao: inscricaoInfo.taxaInscricao || 0,
                pagouInscricao: inscricaoInfo.pagouInscricao ?? true,
                saldoAnteriorTransferido: inscricaoInfo.saldoAnteriorTransferido || 0,
                dividaAnterior: inscricaoInfo.dividaAnterior || 0,
            };

            historico.forEach(t => {
                if (t.tipo === 'MELHOR_MES') breakdown.melhorMes += t.valor || 0;
                else if (t.tipo === 'ARTILHEIRO' || t.tipo === 'ARTILHEIRO_PREMIACAO') breakdown.artilheiro += t.valor || 0;
                else if (t.tipo === 'LUVA_OURO') breakdown.luvaOuro += t.valor || 0;
                else if (t.tipo === 'RESTA_UM' || (t.tipo === 'AJUSTE' && t.descricao?.startsWith('Resta Um'))) breakdown.restaUm += t.valor || 0;
            });

            const acertosList = acertosMap.get(timeId) || [];
            const acertosTemporada = acertosList.filter(a => Number(a.temporada) === temporadaNum);
            let totalPago = 0;
            let totalRecebido = 0;
            acertosTemporada.forEach(a => {
                // ✅ v8.21.0 FIX: Alinhado com AcertoFinanceiro.calcularSaldoAcertos() (catch-all)
                if (a.tipo === 'pagamento') totalPago += a.valor || 0;
                else totalRecebido += a.valor || 0;
            });
            const saldoAcertos = totalPago - totalRecebido;

            breakdown.acertos = saldoAcertos;

            const saldoTemporada = saldoConsolidado;
            const saldoFinal = saldoTemporada + saldoAcertos;

            let situacao = "quitado";
            if (saldoFinal < -0.01) {
                situacao = "devedor";
                totalDevedores += Math.abs(saldoFinal);
                quantidadeDevedores++;
            } else if (saldoFinal > 0.01) {
                situacao = "credor";
                totalCredores += saldoFinal;
                quantidadeCredores++;
            } else {
                quantidadeQuitados++;
            }

            participantes.push({
                ligaId,
                ligaNome: liga.nome || "Liga sem nome",
                timeId,
                nomeTime: participante.nome_time || "Time sem nome",
                nomeCartola: participante.nome_cartola || "",
                escudo: participante.escudo_url || participante.escudo || null,
                ativo: participante.ativo !== false,
                temporada: Number(temporada),
                contato: participante.contato || null,
                clube_id: participante.clube_id || participante.time_coracao || null,
                saldoTemporada: parseFloat(saldoTemporada.toFixed(2)),
                saldo_temporada: parseFloat(saldoTemporada.toFixed(2)),  // C5: alias snake_case
                saldoAcertos: parseFloat(saldoAcertos.toFixed(2)),
                saldo_acertos: parseFloat(saldoAcertos.toFixed(2)),      // C5: alias snake_case
                totalPago: parseFloat(totalPago.toFixed(2)),
                totalRecebido: parseFloat(totalRecebido.toFixed(2)),
                saldoFinal: parseFloat(saldoFinal.toFixed(2)),
                saldo_final: parseFloat(saldoFinal.toFixed(2)),          // C5: alias snake_case
                situacao,
                quantidadeAcertos: acertosTemporada.length,
                breakdown: {
                    banco: parseFloat(breakdown.banco.toFixed(2)),
                    pontosCorridos: parseFloat(breakdown.pontosCorridos.toFixed(2)),
                    mataMata: parseFloat(breakdown.mataMata.toFixed(2)),
                    top10: parseFloat(breakdown.top10.toFixed(2)),
                    melhorMes: parseFloat(breakdown.melhorMes.toFixed(2)),
                    artilheiro: parseFloat(breakdown.artilheiro.toFixed(2)),
                    luvaOuro: parseFloat(breakdown.luvaOuro.toFixed(2)),
                    restaUm: parseFloat((breakdown.restaUm || 0).toFixed(2)),
                    capitaoLuxo: parseFloat((breakdown.capitaoLuxo || 0).toFixed(2)),
                    campos: parseFloat(saldoCampos.toFixed(2)),
                    ajustes: parseFloat((breakdown.ajustes || 0).toFixed(2)),
                    acertos: parseFloat(breakdown.acertos.toFixed(2)),
                    taxaInscricao: parseFloat((breakdown.taxaInscricao || 0).toFixed(2)),
                    pagouInscricao: breakdown.pagouInscricao ?? true,
                    saldoAnteriorTransferido: parseFloat((breakdown.saldoAnteriorTransferido || 0).toFixed(2)),
                    dividaAnterior: parseFloat((breakdown.dividaAnterior || 0).toFixed(2)),
                },
                modulosAtivos,
                quitacao: extrato?.quitacao || null,
            });
        }

        participantes.sort((a, b) => (a.nomeCartola || '').localeCompare(b.nomeCartola || ''));

        const elapsed = Date.now() - startTime;
        console.log(`[TESOURARIA] ✅ ${participantes.length} participantes em ${elapsed}ms`);

        const primeiraTemporada = liga.criadaEm ? new Date(liga.criadaEm).getFullYear() : (liga.temporada || CURRENT_SEASON);

        console.log(`[TESOURARIA-API] 📊 TOTAIS para liga ${ligaId}:`);
        console.log(`  Total participantes: ${participantes.length}`);
        console.log(`  Devedores: ${quantidadeDevedores}`);
        console.log(`  Credores: ${quantidadeCredores}`);
        console.log(`  Quitados: ${quantidadeQuitados}`);
        console.log(`  Validação: ${quantidadeDevedores + quantidadeCredores + quantidadeQuitados} = ${participantes.length}`);
        console.log(`  📅 primeiraTemporada: ${primeiraTemporada} (criadaEm: ${liga.criadaEm})`);

        res.json({
            success: true,
            ligaId,
            ligaNome: liga.nome,
            temporada,
            primeiraTemporada,
            modulosAtivos,
            participantes,
            totais: {
                totalParticipantes: participantes.length,
                quantidadeCredores,
                quantidadeDevedores,
                quantidadeQuitados,
                totalAReceber: parseFloat(totalDevedores.toFixed(2)),
                totalAPagar: parseFloat(totalCredores.toFixed(2)),
                saldoGeral: parseFloat((totalDevedores - totalCredores).toFixed(2)),
            },
        });
    } catch (error) {
        console.error("[TESOURARIA] Erro ao buscar participantes da liga:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// GET /api/tesouraria/participante/:ligaId/:timeId
// Retorna detalhes completos de um participante
// =============================================================================

export async function getParticipante(req, res) {
    try {
        const { ligaId, timeId } = req.params;
        const { temporada = CURRENT_SEASON } = req.query;
        const tempNum = Number(temporada);

        console.log(`[TESOURARIA] Buscando detalhes: liga=${ligaId} time=${timeId} temporada=${tempNum}`);

        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            return res.status(404).json({ success: false, error: "Liga não encontrada" });
        }

        const participante = liga.participantes?.find(
            p => String(p.time_id) === String(timeId)
        );
        if (!participante) {
            return res.status(404).json({ success: false, error: "Participante não encontrado" });
        }

        const [saldo, acertos, cache, inscricao, inscricaoProxima, ajustes] = await Promise.all([
            calcularSaldoParticipante(ligaId, timeId, tempNum),
            AcertoFinanceiro.buscarPorTime(ligaId, timeId, tempNum),
            ExtratoFinanceiroCache.findOne({
                liga_id: String(ligaId),
                time_id: Number(timeId),
                temporada: tempNum
            }).lean(),
            InscricaoTemporada.findOne({
                liga_id: new mongoose.Types.ObjectId(ligaId),
                time_id: Number(timeId),
                temporada: tempNum
            }).lean(),
            InscricaoTemporada.findOne({
                liga_id: new mongoose.Types.ObjectId(ligaId),
                time_id: Number(timeId),
                temporada: tempNum + 1
            }).lean(),
            tempNum >= CURRENT_SEASON
                ? AjusteFinanceiro.listarPorParticipante(ligaId, timeId, tempNum)
                : Promise.resolve([])
        ]);

        let situacao = "quitado";
        if (saldo.saldoFinal > 0.01) situacao = "credor";
        else if (saldo.saldoFinal < -0.01) situacao = "devedor";

        const resumo = {
            bonus: 0,
            onus: 0,
            pontosCorridos: 0,
            mataMata: 0,
            top10: 0,
            camposManuais: saldo.saldoCampos || 0,
            saldo_final: saldo.saldoFinal
        };

        if (cache?.historico_transacoes?.length > 0) {
            cache.historico_transacoes.forEach(t => {
                if (t.tipo) {
                    if (t.tipo === 'INSCRICAO_TEMPORADA') {
                        resumo.inscricao = t.valor || 0;
                    } else if (t.tipo === 'SALDO_TEMPORADA_ANTERIOR' || t.tipo === 'LEGADO_ANTERIOR') {
                        resumo.legado = t.valor || 0;
                    }
                    return;
                }

                const bonusOnus = t.bonusOnus || 0;
                if (bonusOnus > 0) resumo.bonus += bonusOnus;
                if (bonusOnus < 0) resumo.onus += bonusOnus;

                resumo.pontosCorridos += t.pontosCorridos ?? t.pontos_corridos ?? 0;
                resumo.mataMata += t.mataMata ?? t.mata_mata ?? 0;
                resumo.top10 += t.top10 ?? ((t.top10_mito || 0) + (t.top10_mico || 0));
            });

            if (resumo.inscricao !== undefined || resumo.legado !== undefined) {
                const saldoTransacoesEspeciais = (resumo.inscricao || 0) + (resumo.legado || 0);
                resumo.saldo_final = saldo.saldoFinal || saldoTransacoesEspeciais;
            }
        }

        const historico = cache?.historico_transacoes?.map(t => {
            if (t.tipo) {
                return {
                    rodada: t.rodada || 0,
                    tipo: t.tipo,
                    descricao: t.descricao || t.tipo,
                    valor: t.valor || 0,
                    saldo: t.valor || 0,
                    saldoAcumulado: t.valor || 0,
                    data: t.data,
                    isTransacaoEspecial: true
                };
            }
            return {
                rodada: t.rodada,
                posicao: t.posicao || t.colocacao,
                bonusOnus: t.bonusOnus ?? ((t.bonus || 0) + (t.onus || 0)),
                pontosCorridos: t.pontosCorridos ?? t.pontos_corridos,
                mataMata: t.mataMata ?? t.mata_mata,
                top10: t.top10 || 0,
                saldo: t.saldo || 0,
                saldoAcumulado: t.saldoAcumulado ?? t.saldo_acumulado,
                isMito: t.isMito || false,
                isMico: t.isMico || false,
                top10Status: t.top10Status,
                top10Posicao: t.top10Posicao
            };
        }) || [];

        if (cache?.saldo_consolidado && historico.length > 0) {
            const temTransacaoEspecial = historico.some(h => h.isTransacaoEspecial);
            if (temTransacaoEspecial) {
                historico.filter(h => h.isTransacaoEspecial).forEach(h => {
                    if (h.tipo === 'INSCRICAO_TEMPORADA') {
                        resumo.inscricao = h.valor;
                    } else if (h.tipo === 'SALDO_TEMPORADA_ANTERIOR' || h.tipo === 'LEGADO_ANTERIOR') {
                        resumo.legado = h.valor;
                    }
                });
            }
        }

        res.json({
            success: true,
            participante: {
                ligaId,
                ligaNome: liga.nome,
                timeId: String(timeId),
                nomeTime: participante.nome_time,
                nomeCartola: participante.nome_cartola,
                escudo: participante.escudo_url || participante.escudo,
                ativo: participante.ativo !== false,
            },
            financeiro: {
                temporada: tempNum,
                saldoConsolidado: parseFloat(((saldo.saldoTemporada || 0) - (saldo.saldoAjustes || 0)).toFixed(2)),
                saldoCampos: saldo.saldoAjustes || 0,
                saldoTemporada: saldo.saldoTemporada,
                saldo_temporada: saldo.saldoTemporada,    // C5: alias snake_case canônico
                saldoAcertos: saldo.saldoAcertos,
                saldo_acertos: saldo.saldoAcertos,         // C5: alias snake_case canônico
                totalPago: saldo.totalPago,
                totalRecebido: saldo.totalRecebido,
                saldoFinal: saldo.saldoFinal,
                saldo_final: saldo.saldoFinal,             // C5: alias snake_case canônico
                situacao,
            },
            resumo,
            historico,
            rodadas: historico,
            acertos: acertos.map(a => ({
                _id: a._id,
                tipo: a.tipo,
                valor: a.valor,
                descricao: a.descricao,
                metodoPagamento: a.metodoPagamento,
                dataAcerto: a.dataAcerto,
                observacoes: a.observacoes,
                registradoPor: a.registradoPor,
                createdAt: a.createdAt,
            })),
            quitacao: cache?.quitacao || null,
            legado_manual: inscricao?.legado_manual || null,
            inscricao_proxima: inscricaoProxima ? {
                temporada: inscricaoProxima.temporada,
                status: inscricaoProxima.status,
                processado: inscricaoProxima.processado,
                pagou_inscricao: inscricaoProxima.pagou_inscricao,
                taxa_inscricao: inscricaoProxima.taxa_inscricao || 0,
                legado_manual: inscricaoProxima.legado_manual
            } : null,
            ajustes: tempNum >= CURRENT_SEASON ? ajustes : [],
            ajustes_total: saldo.saldoAjustes || 0
        });
    } catch (error) {
        console.error("[TESOURARIA] Erro ao buscar detalhes:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// POST /api/tesouraria/acerto
// Registra um novo acerto financeiro
// =============================================================================

export async function postAcerto(req, res) {
    try {
        const {
            ligaId,
            timeId,
            nomeTime,
            tipo,
            valor,
            descricao,
            metodoPagamento = "pix",
            observacoes,
            dataAcerto,
            temporada = String(CURRENT_SEASON),
        } = req.body;

        const registradoPor = req.session?.admin?.email
            || req.session?.admin?.nome
            || "admin_tesouraria";

        if (!ligaId || !timeId) {
            return res.status(400).json({
                success: false,
                error: "ligaId e timeId são obrigatórios",
            });
        }

        if (!tipo || !["pagamento", "recebimento"].includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: "Tipo inválido. Use 'pagamento' ou 'recebimento'",
            });
        }

        if (!valor || isNaN(valor) || parseFloat(valor) <= 0) {
            return res.status(400).json({
                success: false,
                error: "Valor deve ser um número positivo",
            });
        }

        const valorNumerico = parseFloat(valor);
        const dataAcertoFinal = dataAcerto ? new Date(dataAcerto) : new Date();

        const sessentaSegundosAtras = new Date(Date.now() - 60000);
        const duplicata = await AcertoFinanceiro.findOne({
            liga_id: String(ligaId),
            time_id: Number(timeId),
            tipo,
            valor: valorNumerico,
            temporada: Number(temporada),
            createdAt: { $gte: sessentaSegundosAtras },
        }).lean();

        if (duplicata) {
            console.warn(`[TESOURARIA] ⚠️ Duplicata detectada para time ${timeId}: ${tipo} R$ ${valorNumerico}`);
            return res.status(409).json({
                success: false,
                error: "Acerto duplicado detectado. Aguarde 60s antes de registrar outro idêntico.",
                duplicata: { id: duplicata._id, criadoEm: duplicata.createdAt },
            });
        }

        let nomeTimeFinal = nomeTime;
        if (!nomeTimeFinal) {
            const liga = await Liga.findById(ligaId).lean();
            const participante = liga?.participantes?.find(
                p => String(p.time_id) === String(timeId)
            );
            nomeTimeFinal = participante?.nome_time || `Time ${timeId}`;
        }

        let acertoTroco = null;
        let valorTroco = 0;

        if (tipo === "pagamento") {
            const saldoAntes = await calcularSaldoParticipante(ligaId, timeId, temporada);
            const dividaAtual = saldoAntes.saldoFinal < 0 ? Math.abs(saldoAntes.saldoFinal) : 0;

            console.log(`[TESOURARIA] Verificando troco para ${nomeTimeFinal}:`);
            console.log(`  - Saldo antes: R$ ${saldoAntes.saldoFinal.toFixed(2)}`);
            console.log(`  - Dívida atual: R$ ${dividaAtual.toFixed(2)}`);
            console.log(`  - Pagamento: R$ ${valorNumerico.toFixed(2)}`);

            if (dividaAtual > 0 && valorNumerico > dividaAtual) {
                valorTroco = parseFloat((valorNumerico - dividaAtual).toFixed(2));

                console.log(`[TESOURARIA] ✅ TROCO DETECTADO: R$ ${valorTroco.toFixed(2)}`);

                acertoTroco = new AcertoFinanceiro({
                    liga_id: String(ligaId),
                    time_id: Number(timeId),
                    nomeTime: nomeTimeFinal,
                    temporada,
                    tipo: "recebimento",
                    valor: valorTroco,
                    descricao: `TROCO - Pagamento a maior (Dívida: R$ ${dividaAtual.toFixed(2)})`,
                    metodoPagamento,
                    comprovante: null,
                    observacoes: `Gerado automaticamente via Tesouraria. Pagamento original: R$ ${valorNumerico.toFixed(2)}`,
                    dataAcerto: dataAcertoFinal,
                    registradoPor: "sistema_troco_tesouraria",
                });
            }
        }

        const novoAcerto = new AcertoFinanceiro({
            liga_id: String(ligaId),
            time_id: Number(timeId),
            nomeTime: nomeTimeFinal,
            temporada,
            tipo,
            valor: valorNumerico,
            descricao: descricao || `Acerto via Tesouraria - ${tipo}`,
            metodoPagamento,
            comprovante: null,
            observacoes: observacoes || null,
            dataAcerto: dataAcertoFinal,
            registradoPor,
        });

        if (acertoTroco) {
            console.log(`[TESOURARIA] ✅ Troco de R$ ${valorTroco.toFixed(2)} calculado`);
        }
        await salvarAcertoTransacional(novoAcerto, acertoTroco);

        const tempNum = parseInt(temporada);
        if (tipo === "pagamento" && tempNum >= CURRENT_SEASON) {
            const ehPagamentoInscricao = req.body.ehPagamentoInscricao === true;

            if (ehPagamentoInscricao) {
                const inscricao = await InscricaoTemporada.findOne({
                    liga_id: String(ligaId),
                    time_id: Number(timeId),
                    temporada: tempNum
                });

                if (inscricao) {
                    const taxaInscricao = inscricao.taxa_inscricao || 0;

                    if (valorNumerico >= taxaInscricao) {
                        inscricao.pagou_inscricao = true;
                        inscricao.data_pagamento = dataAcertoFinal;
                        inscricao.metodo_pagamento = metodoPagamento;
                        await inscricao.save();

                        console.log(`[TESOURARIA] ✅ Inscrição ${tempNum} marcada como PAGA para time ${timeId}`);
                    } else {
                        console.log(`[TESOURARIA] ⚠️ Pagamento parcial (R$ ${valorNumerico.toFixed(2)} < R$ ${taxaInscricao.toFixed(2)}). Inscrição ainda não quitada.`);
                    }
                }
            }
        }

        // C4 FIX: Invalidar cache para que leituras cached reflitam o novo acerto
        setImmediate(() => onAcertoCreated(ligaId, timeId, temporada));
        console.log(`[TESOURARIA] ✅ Acerto registrado para time ${timeId} (cache invalidado)`);

        const novoSaldo = await calcularSaldoParticipante(ligaId, timeId, temporada);

        const temporadaNum = Number(temporada);
        let autoQuitacaoInfo = null;

        if (Math.abs(novoSaldo.saldoFinal) < 0.01 && temporadaNum < CURRENT_SEASON) {
            try {
                await ExtratoFinanceiroCache.updateOne(
                    {
                        liga_id: String(ligaId),
                        time_id: Number(timeId),
                        temporada: temporadaNum
                    },
                    {
                        $set: {
                            'quitacao.quitado': true,
                            'quitacao.data_quitacao': new Date(),
                            'quitacao.admin_responsavel': 'auto_quitacao',
                            'quitacao.tipo': 'zerado',
                            'quitacao.saldo_no_momento': 0,
                            'quitacao.observacao': 'Quitação automática - saldo zerado via acerto'
                        }
                    }
                );
                console.log(`[TESOURARIA] ✅ AUTO-QUITAÇÃO: ${nomeTimeFinal} - Temporada ${temporadaNum} marcada como quitada`);

                autoQuitacaoInfo = {
                    ativada: true,
                    temporada: temporadaNum,
                    mensagem: `Temporada ${temporadaNum} marcada como QUITADA automaticamente!`
                };
            } catch (quitError) {
                console.warn(`[TESOURARIA] ⚠️ Falha na auto-quitação:`, quitError.message);
            }
        }

        const response = {
            success: true,
            message: acertoTroco
                ? `Pagamento de R$ ${valorNumerico.toFixed(2)} registrado. TROCO de R$ ${valorTroco.toFixed(2)} creditado!`
                : `Acerto de R$ ${valorNumerico.toFixed(2)} registrado com sucesso`,
            acerto: {
                _id: novoAcerto._id,
                tipo: novoAcerto.tipo,
                valor: novoAcerto.valor,
                descricao: novoAcerto.descricao,
                dataAcerto: novoAcerto.dataAcerto,
            },
            novoSaldo: {
                saldoTemporada: novoSaldo.saldoTemporada,
                saldoAcertos: novoSaldo.saldoAcertos,
                saldoFinal: novoSaldo.saldoFinal,
            },
        };

        if (acertoTroco) {
            response.troco = {
                valor: valorTroco,
                mensagem: `Pagamento excedeu a dívida. R$ ${valorTroco.toFixed(2)} creditados.`,
            };
        }

        if (autoQuitacaoInfo) {
            response.autoQuitacao = autoQuitacaoInfo;
        }

        res.status(201).json(response);
    } catch (error) {
        console.error("[TESOURARIA] Erro ao registrar acerto:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// DELETE /api/tesouraria/acerto/:id
// Remove um acerto financeiro (soft delete)
// =============================================================================

export async function deleteAcerto(req, res) {
    try {
        const { id } = req.params;

        const acerto = await desativarAcerto(id);

        if (!acerto) {
            return res.status(404).json({
                success: false,
                error: "Acerto não encontrado",
            });
        }

        // C4 FIX: Invalidar cache para que leituras cached reflitam a remoção
        setImmediate(() => onAcertoCreated(acerto.liga_id, acerto.time_id, acerto.temporada));
        console.log(`[TESOURARIA] ✅ Acerto desativado para time ${acerto.time_id} (cache invalidado)`);

        const novoSaldo = await calcularSaldoParticipante(
            acerto.liga_id,
            acerto.time_id,
            acerto.temporada
        );

        res.json({
            success: true,
            message: "Acerto desativado",
            novoSaldo: {
                saldoTemporada: novoSaldo.saldoTemporada,
                saldoAcertos: novoSaldo.saldoAcertos,
                saldoFinal: novoSaldo.saldoFinal,
            },
        });
    } catch (error) {
        console.error("[TESOURARIA] Erro ao remover acerto:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// GET /api/tesouraria/resumo
// Retorna resumo financeiro geral (totais por liga)
// =============================================================================

export async function getResumo(req, res) {
    try {
        const { temporada = CURRENT_SEASON } = req.query;
        const temporadaNum = Number(temporada);
        const startTime = Date.now();

        const ligas = await Liga.find({ ativo: { $ne: false } }).lean();

        const allTimeIds = [];
        const ligaMap = new Map();

        for (const liga of ligas) {
            const ligaId = liga._id.toString();
            ligaMap.set(ligaId, liga);
            for (const p of liga.participantes || []) {
                allTimeIds.push(p.time_id);
            }
        }

        const [todosExtratos, todosCampos, todosAcertos, todasInscricoes, todosAjustes] = await Promise.all([
            ExtratoFinanceiroCache.find({ time_id: { $in: allTimeIds }, temporada: temporadaNum }).lean(),
            FluxoFinanceiroCampos.find({ time_id: { $in: allTimeIds.map(Number) }, temporada: temporadaNum }).lean(),
            AcertoFinanceiro.find({ temporada: temporadaNum, ativo: true }).lean(),
            temporadaNum >= CURRENT_SEASON
                ? InscricaoTemporada.find({ temporada: temporadaNum }).lean()
                : Promise.resolve([]),
            temporadaNum >= CURRENT_SEASON
                ? AjusteFinanceiro.find({ temporada: temporadaNum, ativo: true }).lean()
                : Promise.resolve([])
        ]);

        const extratoMap = new Map();
        todosExtratos.forEach(e => {
            const key = `${e.liga_id}_${e.time_id}`;
            extratoMap.set(key, e);
        });

        const camposMap = new Map();
        todosCampos.forEach(c => {
            const key = `${c.ligaId}_${c.timeId}`;
            camposMap.set(key, c);
        });

        const acertosMap = new Map();
        todosAcertos.forEach(a => {
            const key = `${a.ligaId}_${a.timeId}`;
            if (!acertosMap.has(key)) acertosMap.set(key, []);
            acertosMap.get(key).push(a);
        });

        const inscricoesMap = new Map();
        todasInscricoes.forEach(i => {
            const key = `${String(i.liga_id)}_${i.time_id}`;
            inscricoesMap.set(key, i);
        });

        const ajustesFinMap = new Map();
        todosAjustes.forEach(a => {
            const key = `${String(a.liga_id)}_${a.time_id}`;
            if (!ajustesFinMap.has(key)) ajustesFinMap.set(key, []);
            ajustesFinMap.get(key).push(a);
        });

        const resumoPorLiga = [];
        let totalGeralCredores = 0;
        let totalGeralDevedores = 0;

        for (const liga of ligas) {
            const ligaId = liga._id.toString();
            let credores = 0;
            let devedores = 0;
            let qtdCredores = 0;
            let qtdDevedores = 0;
            let qtdQuitados = 0;

            for (const participante of liga.participantes || []) {
                const timeId = String(participante.time_id);
                const key = `${ligaId}_${timeId}`;

                const extrato = extratoMap.get(key);
                const historico = extrato?.historico_transacoes || [];
                const camposDoc = camposMap.get(key);
                const camposAtivos = camposDoc?.campos?.filter(c => c.valor !== 0) || [];

                // ✅ C3 FIX: _calcularSaldoCore elimina bloco triplicado
                const { saldoConsolidado } = _calcularSaldoCore({
                    ligaId, temporadaNum, historico, extrato, camposAtivos,
                    inscricaoData: inscricoesMap.get(key),
                    ajustesList: ajustesFinMap.get(key) || [],
                });

                const acertosList = acertosMap.get(key) || [];
                const acertosTemporada = acertosList.filter(a => Number(a.temporada) === temporadaNum);
                let totalPago = 0;
                let totalRecebido = 0;
                acertosTemporada.forEach(a => {
                    // ✅ v8.21.0 FIX: Alinhado com AcertoFinanceiro.calcularSaldoAcertos() (catch-all)
                    if (a.tipo === 'pagamento') totalPago += a.valor || 0;
                    else totalRecebido += a.valor || 0;
                });
                const saldoAcertos = totalPago - totalRecebido;

                const saldoFinal = saldoConsolidado + saldoAcertos;

                if (saldoFinal < -0.01) {
                    devedores += Math.abs(saldoFinal);
                    qtdDevedores++;
                } else if (saldoFinal > 0.01) {
                    credores += saldoFinal;
                    qtdCredores++;
                } else {
                    qtdQuitados++;
                }
            }

            totalGeralCredores += credores;
            totalGeralDevedores += devedores;

            resumoPorLiga.push({
                ligaId,
                ligaNome: liga.nome,
                totalParticipantes: liga.participantes?.length || 0,
                qtdCredores,
                qtdDevedores,
                qtdQuitados,
                totalAReceber: parseFloat(credores.toFixed(2)),
                totalAPagar: parseFloat(devedores.toFixed(2)),
                saldoLiga: parseFloat((credores - devedores).toFixed(2)),
            });
        }

        const elapsed = Date.now() - startTime;
        console.log(`[TESOURARIA] ✅ Resumo calculado em ${elapsed}ms (bulk queries)`);

        res.json({
            success: true,
            temporada,
            ligas: resumoPorLiga,
            totaisGerais: {
                totalAReceber: parseFloat(totalGeralCredores.toFixed(2)),
                totalAPagar: parseFloat(totalGeralDevedores.toFixed(2)),
                saldoGeral: parseFloat((totalGeralCredores - totalGeralDevedores).toFixed(2)),
            },
        });
    } catch (error) {
        console.error("[TESOURARIA] Erro ao gerar resumo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}
