/**
 * routes/copa-sc-routes.js
 * Rotas do módulo Copa SC (torneio mata-mata com grupos)
 */

import express from 'express';
import { verificarAdmin } from '../middleware/auth.js';
import {
    getConfig,
    getGrupos,
    getBracket,
    getClassificatorio,
    getMinhaCopa,
    adminConfigurar,
    adminSortear,
    adminProcessarRodada,
} from '../controllers/copaSCController.js';

const router = express.Router();

console.log('[ROUTES] Carregando rotas da Copa SC...');

/**
 * =====================================================================
 * ROTAS PÚBLICAS (participante)
 * =====================================================================
 */

// GET /api/copa-sc/:ligaId/config - Configuração geral
router.get('/:ligaId/config', async (req, res) => {
    await getConfig(req, res);
});

// GET /api/copa-sc/:ligaId/grupos - Grupos de classificação
router.get('/:ligaId/grupos', async (req, res) => {
    await getGrupos(req, res);
});

// GET /api/copa-sc/:ligaId/bracket - Mata-mata (oitavas, quartas, etc)
router.get('/:ligaId/bracket', async (req, res) => {
    await getBracket(req, res);
});

// GET /api/copa-sc/:ligaId/classificatorio - Fase de grupos
router.get('/:ligaId/classificatorio', async (req, res) => {
    await getClassificatorio(req, res);
});

// GET /api/copa-sc/:ligaId/minha-copa/:participanteId - Confrontos do time
router.get('/:ligaId/minha-copa/:participanteId', async (req, res) => {
    await getMinhaCopa(req, res);
});

/**
 * =====================================================================
 * ROTAS ADMIN (protegidas)
 * =====================================================================
 */

// POST /api/copa-sc/:ligaId/admin/configurar - Atualizar configuração
router.post('/:ligaId/admin/configurar', verificarAdmin, async (req, res) => {
    await adminConfigurar(req, res);
});

// POST /api/copa-sc/:ligaId/admin/sortear - Realizar sorteio
router.post('/:ligaId/admin/sortear', verificarAdmin, async (req, res) => {
    await adminSortear(req, res);
});

// POST /api/copa-sc/:ligaId/admin/processar/:rodada - Processar rodada
router.post('/:ligaId/admin/processar/:rodada', verificarAdmin, async (req, res) => {
    await adminProcessarRodada(req, res);
});

export default router;
