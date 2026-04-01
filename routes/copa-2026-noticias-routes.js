// routes/copa-2026-noticias-routes.js
// v1.0 - Notícias da Copa do Mundo 2026 via Google News RSS
// Reutiliza padrão de noticias-time-routes.js (parse RSS, cache, tempo relativo)
// Cache: 30min por categoria | Fonte: Google News RSS (zero API key)

import express from 'express';
import fetch from 'node-fetch';
import copaConfig from '../config/copa-do-mundo-2026.js';
import { parseRSSItems, calcularTempoRelativo } from '../utils/rss-parser.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════
const cacheNoticias = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// ═══════════════════════════════════════════════════════
// CATEGORIAS DE BUSCA
// ═══════════════════════════════════════════════════════
const CATEGORIAS = {
    geral: {
        query: '"Copa do Mundo 2026"',
        label: 'Copa do Mundo 2026'
    },
    brasil: {
        query: '"Seleção Brasileira" Copa 2026',
        label: 'Seleção Brasileira'
    },
    selecoes: {
        query: 'Copa do Mundo 2026 seleções convocação',
        label: 'Seleções'
    },
    sedes: {
        query: 'Copa do Mundo 2026 estádios sedes cidades',
        label: 'Sedes e Estádios'
    }
};

// Funções RSS (parseRSSItems, calcularTempoRelativo)
// importadas de ../utils/rss-parser.js

// ═══════════════════════════════════════════════════════
// BUSCA
// ═══════════════════════════════════════════════════════

async function buscarNoticiasCopa(categoria) {
    const config = CATEGORIAS[categoria];
    if (!config) {
        return { noticias: [], categoria: null, erro: 'Categoria inválida' };
    }

    // Verificar cache
    const cached = cacheNoticias[categoria];
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return { noticias: cached.noticias, categoria: config.label, cache: true };
    }

    try {
        const query = encodeURIComponent(config.query);
        const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

        console.log(`[COPA-NOTICIAS] Buscando: ${config.label}...`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaManager/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            },
            timeout: 10000
        });

        if (!response.ok) {
            console.error(`[COPA-NOTICIAS] Erro HTTP ${response.status} para ${config.label}`);
            if (cached) {
                return { noticias: cached.noticias, categoria: config.label, cache: true, stale: true };
            }
            return { noticias: [], categoria: config.label, erro: `HTTP ${response.status}` };
        }

        const xml = await response.text();
        const noticias = parseRSSItems(xml).slice(0, 10);

        console.log(`[COPA-NOTICIAS] ${noticias.length} notícias para ${config.label}`);

        cacheNoticias[categoria] = { noticias, timestamp: Date.now() };

        return { noticias, categoria: config.label, cache: false };
    } catch (error) {
        console.error(`[COPA-NOTICIAS] Erro: ${error.message}`);
        if (cached) {
            return { noticias: cached.noticias, categoria: config.label, cache: true, stale: true };
        }
        return { noticias: [], categoria: config.label, erro: error.message };
    }
}

// ═══════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════

/**
 * GET /api/copa-2026/noticias?categoria=geral
 * Categorias: geral, brasil, selecoes, sedes
 */
router.get('/noticias', async (req, res) => {
    try {
        const categoria = req.query.categoria || 'geral';
        const forceRefresh = req.query.force === '1';

        if (!CATEGORIAS[categoria]) {
            return res.status(400).json({
                success: false,
                erro: `Categoria inválida. Opções: ${Object.keys(CATEGORIAS).join(', ')}`
            });
        }

        if (forceRefresh) {
            delete cacheNoticias[categoria];
            console.log(`[COPA-NOTICIAS] Force refresh: cache de '${categoria}' invalidado`);
        }

        const resultado = await buscarNoticiasCopa(categoria);

        res.json({
            success: true,
            categoria: resultado.categoria,
            noticias: resultado.noticias,
            total: resultado.noticias.length,
            cache: resultado.cache || false,
            stale: resultado.stale || false,
            atualizadoEm: new Date().toISOString()
        });
    } catch (error) {
        console.error('[COPA-NOTICIAS] Erro na rota:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar notícias' });
    }
});

/**
 * GET /api/copa-2026/noticias/todas
 * Retorna notícias de TODAS as categorias (para carregamento inicial da landing page)
 */
router.get('/noticias/todas', async (req, res) => {
    try {
        const [geral, brasil] = await Promise.all([
            buscarNoticiasCopa('geral'),
            buscarNoticiasCopa('brasil')
        ]);

        res.json({
            success: true,
            geral: { noticias: geral.noticias, total: geral.noticias.length },
            brasil: { noticias: brasil.noticias, total: brasil.noticias.length },
            atualizadoEm: new Date().toISOString()
        });
    } catch (error) {
        console.error('[COPA-NOTICIAS] Erro /todas:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar notícias' });
    }
});

/**
 * GET /api/copa-2026/categorias
 * Lista categorias disponíveis
 */
router.get('/categorias', (req, res) => {
    const categorias = Object.entries(CATEGORIAS).map(([id, config]) => ({
        id,
        label: config.label
    }));
    res.json({ success: true, categorias });
});

/**
 * GET /api/copa-2026/dados
 * Retorna dados estáticos da Copa (grupos, jogos, estádios, período, fase eliminatória)
 * Usado pelo frontend para renderizar a landing page sem importar config backend
 */
router.get('/dados', (req, res) => {
    const { PERIODO, GRUPOS, ESTADIOS, JOGOS_FASE_GRUPOS, FASE_ELIMINATORIA, BANDEIRAS, getStatusCopa } = copaConfig;

    res.json({
        success: true,
        periodo: PERIODO,
        status: getStatusCopa(),
        grupos: GRUPOS,
        estadios: ESTADIOS,
        jogosFaseGrupos: JOGOS_FASE_GRUPOS,
        faseEliminatoria: FASE_ELIMINATORIA,
        bandeiras: BANDEIRAS
    });
});

export default router;
