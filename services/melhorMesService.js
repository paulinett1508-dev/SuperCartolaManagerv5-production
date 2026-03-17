/**
 * MELHOR DO MÊS SERVICE v1.0.0
 * services/melhorMesService.js
 *
 * Service backend para o módulo Melhor do Mês.
 * Agrega pontos da collection Rodada por edição, gerencia cache MongoDB
 * (MelhorMesCache) e cache em memória (NodeCache).
 *
 * Exports:
 *   default  — objeto com { buscarMelhorMes, buscarParticipanteMelhorMes, forcarReconsolidacao, invalidarCache }
 *   named    — forcarReconsolidacao (usado por scripts)
 */

import mongoose from "mongoose";
import NodeCache from "node-cache";
import MelhorMesCache, { MELHOR_MES_EDICOES } from "../models/MelhorMesCache.js";
import Rodada from "../models/Rodada.js";
import ModuleConfig from "../models/ModuleConfig.js";
import { CURRENT_SEASON } from "../config/seasons.js";
import { truncarPontosNum } from "../utils/type-helpers.js";

const LOG_PREFIX = "[MELHOR-MES-SERVICE]";
const cache = new NodeCache({ stdTTL: 300 }); // 5 min

// =====================================================================
// HELPERS INTERNOS
// =====================================================================

/**
 * Obtém edições configuradas para a liga (ModuleConfig override ou default)
 */
async function _obterEdicoes(ligaId, temporada) {
    const config = await ModuleConfig.buscarConfig(ligaId, "melhor_mes", temporada);

    if (config?.wizard_respostas?.edicoes_intervalos) {
        const intervalos = config.wizard_respostas.edicoes_intervalos;
        const edicoes = [];

        for (const [key, val] of Object.entries(intervalos)) {
            const id = Number(key);
            edicoes.push({
                id,
                nome: `Edição ${String(id).padStart(2, "0")}`,
                inicio: Number(val.inicio),
                fim: Number(val.fim),
            });
        }

        edicoes.sort((a, b) => a.id - b.id);
        console.log(`${LOG_PREFIX} Edições customizadas (ModuleConfig): ${edicoes.length}`);
        return edicoes;
    }

    console.log(`${LOG_PREFIX} Edições default (MELHOR_MES_EDICOES): ${MELHOR_MES_EDICOES.length}`);
    return MELHOR_MES_EDICOES;
}

/**
 * Agrega pontos de participantes para um intervalo de rodadas
 */
async function _agregarRanking(ligaId, temporada, inicio, fim, rodadaAtual) {
    const limFim = Math.min(fim, rodadaAtual);
    if (limFim < inicio) return [];

    const ligaObjectId = new mongoose.Types.ObjectId(ligaId);

    const pipeline = [
        {
            $match: {
                ligaId: ligaObjectId,
                temporada: Number(temporada),
                rodada: { $gte: inicio, $lte: limFim },
            },
        },
        {
            $group: {
                _id: "$timeId",
                pontos_total: { $sum: "$pontos" },
                rodadas_jogadas: { $sum: 1 },
                nome_time: { $last: "$nome_time" },
                nome_cartola: { $last: "$nome_cartola" },
                escudo: { $last: "$escudo" },
                clube_id: { $last: "$clube_id" },
            },
        },
        { $sort: { pontos_total: -1 } },
    ];

    const resultado = await Rodada.aggregate(pipeline);

    return resultado.map((r, index) => ({
        posicao: index + 1,
        timeId: r._id,
        nome_time: r.nome_time || "N/D",
        nome_cartola: r.nome_cartola || "N/D",
        escudo: r.escudo || "",
        clube_id: r.clube_id || null,
        pontos_total: truncarPontosNum(r.pontos_total),
        rodadas_jogadas: r.rodadas_jogadas,
        media: r.rodadas_jogadas > 0
            ? truncarPontosNum(r.pontos_total / r.rodadas_jogadas)
            : 0,
    }));
}

/**
 * Determina status de uma edição baseado na rodada atual
 * (não usa static do model porque edições customizadas têm intervalos diferentes)
 */
function _getStatusEdicao(edicao, rodadaAtual) {
    if (rodadaAtual < edicao.inicio) return "pendente";
    if (rodadaAtual >= edicao.fim) return "consolidado";
    return "em_andamento";
}

/**
 * Processa todas as edições e gera dados completos
 */
async function _processarEdicoes(ligaId, rodadaAtual, temporada, cacheExistente) {
    const edicoes = await _obterEdicoes(ligaId, temporada);
    const edicoesProcessadas = [];

    for (const edicao of edicoes) {
        const status = _getStatusEdicao(edicao, rodadaAtual);

        // Edições consolidadas e já cacheadas: preservar (imutáveis)
        if (status === "consolidado" && cacheExistente) {
            const edicaoCacheada = cacheExistente.edicoes?.find(e => e.id === edicao.id);
            if (edicaoCacheada && edicaoCacheada.status === "consolidado") {
                edicoesProcessadas.push(edicaoCacheada);
                continue;
            }
        }

        // Edições pendentes: sem ranking
        if (status === "pendente") {
            edicoesProcessadas.push({
                id: edicao.id,
                nome: edicao.nome,
                inicio: edicao.inicio,
                fim: edicao.fim,
                status: "pendente",
                rodada_atual: 0,
                ranking: [],
                campeao: null,
                total_participantes: 0,
                consolidado_em: null,
                atualizado_em: new Date(),
            });
            continue;
        }

        // Em andamento ou consolidado sem cache: calcular
        const ranking = await _agregarRanking(ligaId, temporada, edicao.inicio, edicao.fim, rodadaAtual);

        const campeao = (status === "consolidado" && ranking.length > 0)
            ? {
                timeId: ranking[0].timeId,
                nome_time: ranking[0].nome_time,
                nome_cartola: ranking[0].nome_cartola,
                pontos_total: ranking[0].pontos_total,
            }
            : null;

        edicoesProcessadas.push({
            id: edicao.id,
            nome: edicao.nome,
            inicio: edicao.inicio,
            fim: edicao.fim,
            status,
            rodada_atual: Math.min(rodadaAtual, edicao.fim),
            ranking,
            campeao,
            total_participantes: ranking.length,
            consolidado_em: status === "consolidado" ? new Date() : null,
            atualizado_em: new Date(),
        });
    }

    return edicoesProcessadas;
}

// =====================================================================
// MÉTODOS PÚBLICOS
// =====================================================================

/**
 * Busca dados do Melhor do Mês para todos os participantes de uma liga
 */
async function buscarMelhorMes(ligaId, rodadaAtual, temporadaFiltro) {
    const temporada = temporadaFiltro || CURRENT_SEASON;
    const cacheKey = `melhor-mes-${ligaId}-${temporada}`;

    // 1. Cache em memória
    const memoriaCache = cache.get(cacheKey);
    if (memoriaCache) {
        console.log(`${LOG_PREFIX} Cache NodeCache hit: ${cacheKey}`);
        return memoriaCache;
    }

    const ligaObjectId = new mongoose.Types.ObjectId(ligaId);

    // 2. Cache MongoDB
    const mongoCache = await MelhorMesCache.findOne({
        ligaId: ligaObjectId,
        temporada: Number(temporada),
    }).lean();

    if (mongoCache && mongoCache.rodada_sistema >= rodadaAtual && rodadaAtual > 0) {
        console.log(`${LOG_PREFIX} Cache MongoDB hit (rodada_sistema=${mongoCache.rodada_sistema})`);
        const resultado = {
            edicoes: mongoCache.edicoes || [],
            rodada_sistema: mongoCache.rodada_sistema,
            temporada_encerrada: mongoCache.temporada_encerrada || false,
        };
        cache.set(cacheKey, resultado);
        return resultado;
    }

    // 3. Recalcular
    console.log(`${LOG_PREFIX} Recalculando para liga=${ligaId}, rodada=${rodadaAtual}, temporada=${temporada}`);

    const edicoesProcessadas = await _processarEdicoes(ligaId, rodadaAtual, temporada, mongoCache);
    const temporadaEncerrada = edicoesProcessadas.length > 0 &&
        edicoesProcessadas.every(e => e.status === "consolidado");

    // 4. Salvar no MongoDB (upsert)
    await MelhorMesCache.updateOne(
        { ligaId: ligaObjectId, temporada: Number(temporada) },
        {
            $set: {
                edicoes: edicoesProcessadas,
                rodada_sistema: rodadaAtual,
                temporada_encerrada: temporadaEncerrada,
                atualizado_em: new Date(),
            },
            $setOnInsert: {
                criado_em: new Date(),
            },
        },
        { upsert: true },
    );

    const resultado = {
        edicoes: edicoesProcessadas,
        rodada_sistema: rodadaAtual,
        temporada_encerrada: temporadaEncerrada,
    };

    // 5. Salvar em memória
    cache.set(cacheKey, resultado);
    console.log(`${LOG_PREFIX} Processado: ${edicoesProcessadas.length} edições, rodada=${rodadaAtual}`);

    return resultado;
}

/**
 * Busca dados de um participante específico em todas as edições
 */
async function buscarParticipanteMelhorMes(ligaId, timeId, rodadaAtual, temporadaFiltro) {
    const temporada = temporadaFiltro || CURRENT_SEASON;
    const dados = await buscarMelhorMes(ligaId, rodadaAtual, temporada);
    const timeIdNum = Number(timeId);

    const edicoesParticipante = (dados.edicoes || []).map(edicao => {
        const participante = (edicao.ranking || []).find(r => Number(r.timeId) === timeIdNum);
        return {
            id: edicao.id,
            nome: edicao.nome,
            inicio: edicao.inicio,
            fim: edicao.fim,
            status: edicao.status,
            participante: participante || null,
            eh_campeao: edicao.campeao && Number(edicao.campeao.timeId) === timeIdNum,
        };
    });

    const conquistas = edicoesParticipante.filter(e => e.eh_campeao).length;

    return {
        timeId: timeIdNum,
        edicoes: edicoesParticipante,
        conquistas,
        rodada_sistema: dados.rodada_sistema,
        temporada_encerrada: dados.temporada_encerrada,
    };
}

/**
 * Força reconsolidação completa (deleta cache e recalcula tudo)
 */
async function forcarReconsolidacao(ligaId, rodadaAtual, temporada) {
    const temp = temporada || CURRENT_SEASON;
    const ligaObjectId = new mongoose.Types.ObjectId(ligaId);
    const cacheKey = `melhor-mes-${ligaId}-${temp}`;

    console.log(`${LOG_PREFIX} Forçando reconsolidação: liga=${ligaId}, rodada=${rodadaAtual}, temporada=${temp}`);

    // Deletar cache existente
    await MelhorMesCache.deleteOne({ ligaId: ligaObjectId, temporada: Number(temp) });
    cache.del(cacheKey);

    // Recalcular sem cache existente (ignora imutabilidade)
    const edicoesProcessadas = await _processarEdicoes(ligaId, rodadaAtual, temp, null);
    const temporadaEncerrada = edicoesProcessadas.length > 0 &&
        edicoesProcessadas.every(e => e.status === "consolidado");

    // Salvar
    await MelhorMesCache.updateOne(
        { ligaId: ligaObjectId, temporada: Number(temp) },
        {
            $set: {
                edicoes: edicoesProcessadas,
                rodada_sistema: rodadaAtual,
                temporada_encerrada: temporadaEncerrada,
                atualizado_em: new Date(),
            },
            $setOnInsert: {
                criado_em: new Date(),
            },
        },
        { upsert: true },
    );

    const resultado = {
        edicoes: edicoesProcessadas,
        rodada_sistema: rodadaAtual,
        temporada_encerrada: temporadaEncerrada,
    };

    cache.set(cacheKey, resultado);
    console.log(`${LOG_PREFIX} Reconsolidação concluída: ${edicoesProcessadas.length} edições`);

    return resultado;
}

/**
 * Invalida cache (remove do MongoDB e memória)
 */
async function invalidarCache(ligaId, temporada) {
    const temp = temporada || CURRENT_SEASON;
    const ligaObjectId = new mongoose.Types.ObjectId(ligaId);
    const cacheKey = `melhor-mes-${ligaId}-${temp}`;

    console.log(`${LOG_PREFIX} Invalidando cache: liga=${ligaId}, temporada=${temp}`);

    const resultado = await MelhorMesCache.deleteOne({
        ligaId: ligaObjectId,
        temporada: Number(temp),
    });

    cache.del(cacheKey);

    return { deletedCount: resultado.deletedCount };
}

// =====================================================================
// EXPORTS
// =====================================================================

export { forcarReconsolidacao };

export default {
    buscarMelhorMes,
    buscarParticipanteMelhorMes,
    forcarReconsolidacao,
    invalidarCache,
};
