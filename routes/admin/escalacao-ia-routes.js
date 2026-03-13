/**
 * ESCALACAO IA ROUTES v1.0
 * Rotas API para o modulo admin de escalacao inteligente.
 *
 * Todas as rotas exigem autenticacao admin (req.session.admin).
 *
 * Endpoints:
 *   GET  /api/admin/escalacao-ia/gerar    - Gerar analise sob demanda
 *   GET  /api/admin/escalacao-ia/cached   - Buscar ultima analise pre-computada
 *   GET  /api/admin/escalacao-ia/status   - Status das fontes de dados
 *   POST /api/admin/escalacao-ia/refresh  - Forcar re-analise
 */

import { Router } from 'express';
import escalacaoIAController from '../../controllers/admin/escalacaoIAController.js';

const router = Router();

// =====================================================================
// MIDDLEWARE: Verificar admin autenticado
// =====================================================================
function requireAdmin(req, res, next) {
    if (!req.session?.admin) {
        return res.status(401).json({
            success: false,
            message: 'Acesso restrito a administradores',
        });
    }
    next();
}

// =====================================================================
// ROUTES
// =====================================================================

// Gerar analise sob demanda
// GET /api/admin/escalacao-ia/gerar?patrimonio=100&esquemaId=3&modo=mitar
router.get('/gerar', requireAdmin, escalacaoIAController.gerarAnalise);

// Buscar analise cached (pre-computada)
// GET /api/admin/escalacao-ia/cached?rodada=10
router.get('/cached', requireAdmin, escalacaoIAController.buscarCached);

// Status das fontes de dados
// GET /api/admin/escalacao-ia/status
router.get('/status', requireAdmin, escalacaoIAController.statusFontes);

// Forcar refresh (limpa cache e re-gera)
// POST /api/admin/escalacao-ia/refresh?patrimonio=100&esquemaId=3
router.post('/refresh', requireAdmin, escalacaoIAController.refresh);

export default router;
