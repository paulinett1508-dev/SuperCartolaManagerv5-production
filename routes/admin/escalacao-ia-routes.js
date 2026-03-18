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

// Salvar escalacao gerada
// POST /api/admin/escalacao-ia/salvar
router.post('/salvar', requireAdmin, escalacaoIAController.salvarEscalacao);

// Buscar escalacao salva
// GET /api/admin/escalacao-ia/salva?rodada=10
router.get('/salva', requireAdmin, escalacaoIAController.buscarSalva);

// =====================================================================
// GATOMESTRE: Conexao do token de sistema
// =====================================================================

// Status do token de sistema
// GET /api/admin/escalacao-ia/gatomestre/status
router.get('/gatomestre/status', requireAdmin, escalacaoIAController.gatoMestreStatus);

// Conectar: autentica na Globo e salva token de sistema
// POST /api/admin/escalacao-ia/gatomestre/conectar
router.post('/gatomestre/conectar', requireAdmin, escalacaoIAController.gatoMestreConectar);

// Desconectar: revoga token de sistema
// DELETE /api/admin/escalacao-ia/gatomestre/desconectar
router.delete('/gatomestre/desconectar', requireAdmin, escalacaoIAController.gatoMestreDesconectar);

export default router;
