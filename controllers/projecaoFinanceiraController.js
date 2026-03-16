/**
 * PROJEÇÃO FINANCEIRA CONTROLLER v1.0.0
 *
 * Calcula projeção financeira em tempo real durante rodada em andamento.
 *
 * ARQUITETURA:
 * - Usa parciais (pontuação ao vivo) via parciaisRankingService
 * - Reutiliza MESMAS fórmulas da consolidação real (calcularBanco, calcularConfrontoPontosCorridos)
 * - Dados EFÊMEROS (NÃO persistidos) — substituídos pela consolidação real após rodada finalizar
 * - Responde apenas quando status_mercado === 2 (rodada em andamento)
 *
 * FLUXO DE RE-VALIDAÇÃO:
 * status_mercado === 2 → projeção ao vivo (este controller)
 * status_mercado === 1 → projeção retorna { projecao: false }
 *                       → scheduler detecta transição 2→1
 *                       → consolida rodada com dados reais
 *                       → extrato financeiro assume valores definitivos
 */

import Liga from "../models/Liga.js";
import ExtratoFinanceiroCache from "../models/ExtratoFinanceiroCache.js";
import { buscarRankingParcial } from "../services/parciaisRankingService.js";
import {
    calcularBanco,
    calcularConfrontoPontosCorridos,
    isModuloHabilitado,
} from "./fluxoFinanceiroController.js";
import { getFinancialSeason } from "../config/seasons.js";
import logger from "../utils/logger.js"; // ✅ E4 FIX

const LOG_PREFIX = "[PROJECAO-FINANCEIRA]";

// ✅ PERF-FIX: Cache removido — agora centralizado em parciaisRankingService.js (TTL 60s)

/**
 * Converte ranking parcial para formato de pontuações por rodada
 * (mesmo formato que calcularBanco e calcularConfrontoPontosCorridos esperam)
 */
function rankingParaPontuacoes(ranking) {
    return ranking.map(r => ({
        timeId: r.timeId,
        pontos: r.pontos_rodada_atual,
        nome_time: r.nome_time,
        nome_cartola: r.nome_cartola,
    }));
}

// ============================================================================
// 📊 PROJEÇÃO INDIVIDUAL (Participante)
// GET /api/fluxo-financeiro/:ligaId/projecao/:timeId
// ============================================================================

export const getProjecaoTime = async (req, res) => {
    try {
        const { ligaId, timeId } = req.params;

        logger.log(`${LOG_PREFIX} Projeção time ${timeId} liga ${ligaId}`);

        // 1. Buscar ranking parcial (já valida status_mercado === 2)
        const rankingParcial = await buscarRankingParcial(ligaId);

        if (!rankingParcial || !rankingParcial.disponivel) {
            return res.json({
                projecao: false,
                motivo: rankingParcial?.motivo || "indisponivel",
                retry: rankingParcial?.retry || false, // v1.1: Indica se frontend deve continuar tentando
                message: rankingParcial?.message || "Projeção não disponível no momento",
                rodada: rankingParcial?.rodada || null,
            });
        }

        const rodadaAtual = rankingParcial.rodada;

        // 2. Buscar liga para configurações financeiras
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) return res.status(404).json({ error: "Liga não encontrada" });

        // 3. Converter ranking parcial para formato de pontuações
        const pontuacoes = rankingParaPontuacoes(rankingParcial.ranking);

        // 4. Encontrar dados do time solicitado
        const meuRanking = rankingParcial.ranking.find(
            r => String(r.timeId) === String(timeId)
        );

        if (!meuRanking) {
            return res.json({
                projecao: false,
                motivo: "time_nao_encontrado",
                message: "Time não encontrado no ranking parcial",
            });
        }

        // 5. Calcular projeção do BANCO (bônus/ônus por posição)
        const resultadoBanco = calcularBanco(liga, timeId, rodadaAtual, pontuacoes);

        // 6. Calcular projeção de PONTOS CORRIDOS (se módulo ativo)
        let resultadoPC = null;
        const pcHabilitado = isModuloHabilitado(liga, 'pontos_corridos')
            || liga.modulos_ativos?.pontosCorridos;

        if (pcHabilitado) {
            resultadoPC = await calcularConfrontoPontosCorridos(
                liga,
                timeId,
                rodadaAtual,
                meuRanking.pontos_rodada_atual,
                pontuacoes,
            );
        }

        // 7. Calcular impacto projetado
        const impactoBanco = resultadoBanco?.valor || 0;
        const impactoPC = resultadoPC?.valor || 0;
        const impactoTotal = impactoBanco + impactoPC;

        // 8. Buscar saldo consolidado atual para contexto
        const temporadaAtual = getFinancialSeason();
        const cache = await ExtratoFinanceiroCache.findOne({
            liga_id: ligaId,
            time_id: timeId,
            temporada: temporadaAtual,
        }).lean();

        const saldoConsolidado = cache?.saldo_consolidado || 0;

        // 9. Retornar projeção
        res.json({
            projecao: true,
            rodada: rodadaAtual,
            status_mercado: 2,
            atualizado_em: rankingParcial.atualizado_em,
            time: {
                timeId: meuRanking.timeId,
                nome_time: meuRanking.nome_time,
                nome_cartola: meuRanking.nome_cartola,
                escudo: meuRanking.escudo,
                pontos_parciais: meuRanking.pontos_rodada_atual,
                posicao_parcial: meuRanking.posicao,
                total_times: rankingParcial.total_times,
            },
            financeiro: {
                banco: resultadoBanco ? {
                    valor: resultadoBanco.valor,
                    descricao: resultadoBanco.descricao,
                    posicao: resultadoBanco.posicao,
                    totalTimes: resultadoBanco.totalTimes,
                } : null,
                pontosCorridos: resultadoPC ? {
                    valor: resultadoPC.valor,
                    descricao: resultadoPC.descricao,
                    oponente: resultadoPC.oponente,
                } : null,
                impactoProjetado: impactoTotal,
            },
            saldo: {
                consolidado: saldoConsolidado,
                projetado: saldoConsolidado + impactoTotal,
            },
        });

    } catch (error) {
        logger.error(`${LOG_PREFIX} ❌ Erro:`, error);
        res.status(500).json({ error: "Erro ao calcular projeção financeira" });
    }
};

// ============================================================================
// 📊 PROJEÇÃO DA LIGA (Admin - Todos os participantes)
// GET /api/fluxo-financeiro/:ligaId/projecao
// ============================================================================

export const getProjecaoLiga = async (req, res) => {
    try {
        const { ligaId } = req.params;

        logger.log(`${LOG_PREFIX} Projeção liga ${ligaId} (todos participantes)`);

        // 1. Buscar ranking parcial
        const rankingParcial = await buscarRankingParcial(ligaId);

        if (!rankingParcial || !rankingParcial.disponivel) {
            return res.json({
                projecao: false,
                motivo: rankingParcial?.motivo || "indisponivel",
                message: rankingParcial?.message || "Projeção não disponível",
                rodada: rankingParcial?.rodada || null,
            });
        }

        const rodadaAtual = rankingParcial.rodada;

        // 2. Buscar liga
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) return res.status(404).json({ error: "Liga não encontrada" });

        // 3. Pontuações no formato esperado
        const pontuacoes = rankingParaPontuacoes(rankingParcial.ranking);

        const pcHabilitado = isModuloHabilitado(liga, 'pontos_corridos')
            || liga.modulos_ativos?.pontosCorridos;

        // 4. Buscar todos os caches de extrato
        const temporadaAtual = getFinancialSeason();
        const caches = await ExtratoFinanceiroCache.find({
            liga_id: ligaId,
            temporada: temporadaAtual,
        }).lean();

        const cachePorTime = {};
        caches.forEach(c => { cachePorTime[String(c.time_id)] = c; });

        // 5. Calcular projeção para cada participante
        const projecoes = [];

        for (const meuRanking of rankingParcial.ranking) {
            const timeId = meuRanking.timeId;

            // Banco
            const resultadoBanco = calcularBanco(liga, timeId, rodadaAtual, pontuacoes);

            // Pontos Corridos
            let resultadoPC = null;
            if (pcHabilitado) {
                resultadoPC = await calcularConfrontoPontosCorridos(
                    liga, timeId, rodadaAtual,
                    meuRanking.pontos_rodada_atual, pontuacoes,
                );
            }

            const impactoBanco = resultadoBanco?.valor || 0;
            const impactoPC = resultadoPC?.valor || 0;
            const impactoTotal = impactoBanco + impactoPC;

            const cacheTime = cachePorTime[String(timeId)];
            const saldoConsolidado = cacheTime?.saldo_consolidado || 0;

            projecoes.push({
                timeId: meuRanking.timeId,
                nome_time: meuRanking.nome_time,
                nome_cartola: meuRanking.nome_cartola,
                escudo: meuRanking.escudo,
                pontos_parciais: meuRanking.pontos_rodada_atual,
                posicao_parcial: meuRanking.posicao,
                banco: impactoBanco,
                pontosCorridos: impactoPC,
                impactoProjetado: impactoTotal,
                saldoConsolidado,
                saldoProjetado: saldoConsolidado + impactoTotal,
                bancoDescricao: resultadoBanco?.descricao || null,
                pcDescricao: resultadoPC?.descricao || null,
            });
        }

        // Ordenar por saldo projetado
        projecoes.sort((a, b) => b.saldoProjetado - a.saldoProjetado);

        // KPIs
        const totalBonusProjetado = projecoes
            .filter(p => p.impactoProjetado > 0)
            .reduce((acc, p) => acc + p.impactoProjetado, 0);
        const totalOnusProjetado = projecoes
            .filter(p => p.impactoProjetado < 0)
            .reduce((acc, p) => acc + p.impactoProjetado, 0);

        res.json({
            projecao: true,
            rodada: rodadaAtual,
            status_mercado: 2,
            atualizado_em: rankingParcial.atualizado_em,
            total_times: projecoes.length,
            kpis: {
                totalBonusProjetado,
                totalOnusProjetado,
                saldoGeralProjetado: projecoes.reduce((acc, p) => acc + p.saldoProjetado, 0),
            },
            projecoes,
        });

    } catch (error) {
        logger.error(`${LOG_PREFIX} ❌ Erro:`, error);
        res.status(500).json({ error: "Erro ao calcular projeção da liga" });
    }
};

logger.log(`${LOG_PREFIX} ✅ v1.0.0 carregado`);
