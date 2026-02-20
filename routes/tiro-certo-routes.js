// routes/tiro-certo-routes.js - VERSAO 1.1
// Rotas do modulo Tiro Certo (survival - acertar vencedor)

import express from 'express';
import { verificarAdmin, verificarParticipante } from '../middleware/auth.js';
import * as TiroCertoController from '../controllers/tiroCertoController.js';

const router = express.Router();

console.log('[ROUTES] Carregando rotas do Tiro Certo v1.1...');

// =====================================================================
// ROTAS PARTICIPANTE (protegidas por sessao)
// =====================================================================

// GET /api/tiro-certo/:ligaId/status - Estado atual da edicao ativa
router.get('/:ligaId/status', verificarParticipante, async (req, res) => {
    await TiroCertoController.obterStatus(req, res);
});

// GET /api/tiro-certo/:ligaId/minhas-escolhas - Escolhas do participante
router.get('/:ligaId/minhas-escolhas', verificarParticipante, async (req, res) => {
    await TiroCertoController.obterMinhasEscolhas(req, res);
});

// GET /api/tiro-certo/:ligaId/participantes - Lista participantes com status
router.get('/:ligaId/participantes', verificarParticipante, async (req, res) => {
    await TiroCertoController.listarParticipantes(req, res);
});

// GET /api/tiro-certo/:ligaId/edicoes - Lista edicoes da temporada
router.get('/:ligaId/edicoes', async (req, res) => {
    await TiroCertoController.listarEdicoes(req, res);
});

// POST /api/tiro-certo/:ligaId/escolher - Registrar escolha de time
router.post('/:ligaId/escolher', verificarParticipante, async (req, res) => {
    await TiroCertoController.registrarEscolha(req, res);
});

// =====================================================================
// ROTAS ADMIN (protegidas)
// =====================================================================

// POST /api/tiro-certo/:ligaId/iniciar - Iniciar nova edicao
router.post('/:ligaId/iniciar', verificarAdmin, async (req, res) => {
    await TiroCertoController.iniciarEdicao(req, res);
});

// POST /api/tiro-certo/:ligaId/ativar - Ativar edicao (pendente → em_andamento)
router.post('/:ligaId/ativar', verificarAdmin, async (req, res) => {
    await TiroCertoController.ativarEdicao(req, res);
});

export default router;
