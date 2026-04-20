/**
 * COPA SC CONTROLLER
 *
 * Endpoints para o módulo Copa SC (torneio mata-mata com grupos de classificação).
 * - GET config, grupos, bracket (participante)
 * - GET minha Copa (dados específicos do time)
 * - POST admin: configurar, sortear, processar rodadas
 */

import CopaSCConfig from '../models/CopaSCConfig.js';
import CopaSCMatch from '../models/CopaSCMatch.js';
import { realizarSorteio } from '../services/copaSCService.js';
import { processarRodada } from '../services/copaSCProcessorService.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import logger from '../utils/logger.js';

/**
 * Helpers: extrair liga_id e temporada do request
 */
function _ligaId(req) {
    return req.params.ligaId;
}

function _temp(req) {
    return Number(req.query.temporada) || CURRENT_SEASON;
}

/**
 * GET /:ligaId/config
 * Retorna a configuração geral da Copa SC (premiacao, calendario, etc)
 */
export async function getConfig(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);

        const config = await CopaSCConfig.findOne({
            liga_id: ligaId,
            temporada,
        }).lean();

        if (!config) {
            return res.status(404).json({ erro: 'Copa SC não configurada para esta temporada.' });
        }

        res.json(config);
    } catch (e) {
        logger.error('[COPA-SC] getConfig falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}

/**
 * GET /:ligaId/grupos
 * Retorna apenas os grupos de classificação (fase de entrada)
 */
export async function getGrupos(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);

        const config = await CopaSCConfig.findOne({
            liga_id: ligaId,
            temporada,
        }).lean();

        if (!config) {
            return res.status(404).json({ erro: 'Copa SC não configurada.' });
        }

        res.json({ grupos: config.grupos || [] });
    } catch (e) {
        logger.error('[COPA-SC] getGrupos falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}

/**
 * GET /:ligaId/bracket
 * Retorna confrontos do mata-mata (oitavas, quartas, semis, final, 3º lugar)
 */
export async function getBracket(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);
        const fasesMM = ['oitavas', 'quartas', 'semis', 'terceiro_lugar', 'final'];

        const matches = await CopaSCMatch.find({
            liga_id: ligaId,
            temporada,
            fase: { $in: fasesMM },
        })
            .sort({ confronto_num: 1 })
            .lean();

        res.json({ matches });
    } catch (e) {
        logger.error('[COPA-SC] getBracket falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}

/**
 * GET /:ligaId/classificatorio
 * Retorna todos os confrontos da fase de grupos (classificatorio)
 */
export async function getClassificatorio(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);

        const matches = await CopaSCMatch.find({
            liga_id: ligaId,
            temporada,
            fase: 'classificatorio',
        })
            .sort({ confronto_num: 1 })
            .lean();

        res.json({ matches });
    } catch (e) {
        logger.error('[COPA-SC] getClassificatorio falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}

/**
 * GET /:ligaId/minha-copa/:participanteId
 * Retorna os confrontos específicos de um time + configuração geral
 */
export async function getMinhaCopa(req, res) {
    try {
        const ligaId = _ligaId(req);
        const { participanteId } = req.params;
        const temporada = _temp(req);
        const timeId = Number(participanteId);

        // Buscar config
        const config = await CopaSCConfig.findOne({
            liga_id: ligaId,
            temporada,
        }).lean();

        if (!config) {
            return res.status(404).json({ erro: 'Copa SC não configurada.' });
        }

        // Buscar confrontos do time (como mandante ou visitante)
        const matches = await CopaSCMatch.find({
            liga_id: ligaId,
            temporada,
            $or: [{ mandante_id: timeId }, { visitante_id: timeId }],
        }).lean();

        res.json({ config, matches });
    } catch (e) {
        logger.error('[COPA-SC] getMinhaCopa falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}

/**
 * ==================== ROTAS ADMIN ====================
 */

/**
 * POST /:ligaId/admin/configurar
 * Atualiza configuração: premiacao, calendario, cabecas_de_chave, times_classificados
 */
export async function adminConfigurar(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);
        const { premiacao, calendario, cabecas_de_chave, times_classificados } = req.body;

        const update = {};
        if (premiacao !== undefined) update.premiacao = premiacao;
        if (calendario !== undefined) update.calendario = calendario;
        if (cabecas_de_chave !== undefined) update.cabecas_de_chave = cabecas_de_chave;
        if (times_classificados !== undefined) update.times_classificados = times_classificados;

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
        }

        const result = await CopaSCConfig.findOneAndUpdate(
            { liga_id: ligaId, temporada },
            { $set: update },
            { upsert: true, new: true, runValidators: true }
        );

        logger.info(`[COPA-SC] Admin configurou copa (liga: ${ligaId}, temp: ${temporada})`);
        res.json({ ok: true, config: result });
    } catch (e) {
        logger.error('[COPA-SC] adminConfigurar falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}

/**
 * POST /:ligaId/admin/sortear
 * Realiza sorteio dos grupos e mata-mata
 */
export async function adminSortear(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);

        logger.info(`[COPA-SC] Admin iniciando sorteio (liga: ${ligaId}, temp: ${temporada})`);
        const result = await realizarSorteio(ligaId, temporada);

        logger.info(`[COPA-SC] Sorteio concluído com sucesso`);
        res.json(result);
    } catch (e) {
        logger.error('[COPA-SC] adminSortear falhou:', e);
        const status = e.status || 500;
        res.status(status).json({ erro: e.message });
    }
}

/**
 * POST /:ligaId/admin/processar/:rodada
 * Processa resultados e avança a copa na rodada especificada
 */
export async function adminProcessarRodada(req, res) {
    try {
        const ligaId = _ligaId(req);
        const temporada = _temp(req);
        const rodada = Number(req.params.rodada);

        if (!rodada || rodada < 1) {
            return res.status(400).json({ erro: 'Rodada inválida.' });
        }

        logger.info(`[COPA-SC] Admin processando rodada ${rodada} (liga: ${ligaId}, temp: ${temporada})`);
        await processarRodada(rodada, ligaId, temporada);

        logger.info(`[COPA-SC] Rodada ${rodada} processada`);
        res.json({ ok: true, rodada });
    } catch (e) {
        logger.error('[COPA-SC] adminProcessarRodada falhou:', e);
        res.status(500).json({ erro: e.message });
    }
}
