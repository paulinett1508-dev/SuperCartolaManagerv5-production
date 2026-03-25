// =====================================================================
// COMPETICAO ROUTES - v1.0
// Endpoints REST genéricos para qualquer competição
// Padrão: brasileirao-tabela-routes.js
// =====================================================================

import express from 'express';
import competicaoService from '../services/competicao-service.js';
import { COMPETICOES_VALIDAS } from '../models/CalendarioCompeticao.js';

const router = express.Router();

// Middleware: validar slug da competição
function validarCompeticao(req, res, next) {
    const { slug } = req.params;
    if (!COMPETICOES_VALIDAS.includes(slug)) {
        return res.status(400).json({
            success: false,
            erro: `Competição inválida: "${slug}". Válidas: ${COMPETICOES_VALIDAS.join(', ')}`,
        });
    }
    req.competicao = slug;
    req.temporada = parseInt(req.query.temporada, 10) || new Date().getFullYear();
    next();
}

// =====================================================================
// ENDPOINTS PÚBLICOS
// =====================================================================

/**
 * GET /api/competicao/:slug/resumo
 * Classificação + próximos jogos + últimos resultados
 */
router.get('/:slug/resumo', validarCompeticao, async (req, res) => {
    try {
        const resultado = await competicaoService.obterResumo(req.competicao, req.temporada);
        res.json(resultado);
    } catch (error) {
        console.error(`[COMPETICAO-ROUTES] Erro resumo ${req.competicao}:`, error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar resumo' });
    }
});

/**
 * GET /api/competicao/:slug/ao-vivo
 * Atualiza placares via jogos-ao-vivo e retorna dados frescos
 */
router.get('/:slug/ao-vivo', validarCompeticao, async (req, res) => {
    try {
        const resultado = await competicaoService.obterResumoAoVivo(req.competicao, req.temporada);
        res.json(resultado);
    } catch (error) {
        console.error(`[COMPETICAO-ROUTES] Erro ao-vivo ${req.competicao}:`, error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar dados ao vivo' });
    }
});

/**
 * GET /api/competicao/:slug/calendario
 * Todas as partidas da competição
 */
router.get('/:slug/calendario', validarCompeticao, async (req, res) => {
    try {
        const resultado = await competicaoService.obterCalendario(req.competicao, req.temporada);
        res.json(resultado);
    } catch (error) {
        console.error(`[COMPETICAO-ROUTES] Erro calendario ${req.competicao}:`, error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar calendário' });
    }
});

/**
 * GET /api/competicao/:slug/standings
 * Classificação/grupos calculada dos resultados
 */
router.get('/:slug/standings', validarCompeticao, async (req, res) => {
    try {
        const resultado = await competicaoService.obterClassificacao(req.competicao, req.temporada);
        res.json(resultado);
    } catch (error) {
        console.error(`[COMPETICAO-ROUTES] Erro standings ${req.competicao}:`, error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar classificação' });
    }
});

export default router;
