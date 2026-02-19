// routes/resta-um-routes.js - VERSÃO 1.0
// Rotas do módulo Resta Um (eliminação progressiva)

import express from 'express';
import { verificarAdmin } from '../middleware/auth.js';
import * as RestaUmController from '../controllers/restaUmController.js';

const router = express.Router();

console.log('[ROUTES] Carregando rotas do Resta Um v1.0...');

// =====================================================================
// ROTAS PÚBLICAS (participante)
// =====================================================================

// GET /api/resta-um/:ligaId/status - Estado atual da disputa
router.get('/:ligaId/status', async (req, res) => {
    await RestaUmController.obterStatus(req, res);
});

// GET /api/resta-um/:ligaId/edicoes - Listar edições da temporada
router.get('/:ligaId/edicoes', async (req, res) => {
    await RestaUmController.listarEdicoes(req, res);
});

// =====================================================================
// ROTAS ADMIN (protegidas)
// =====================================================================

// POST /api/resta-um/:ligaId/iniciar - Iniciar nova edição
router.post('/:ligaId/iniciar', verificarAdmin, async (req, res) => {
    await RestaUmController.iniciarEdicao(req, res);
});

export default router;
