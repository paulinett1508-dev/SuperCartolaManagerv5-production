// routes/noticias-time-routes.js
// v1.2 - Notícias personalizadas do time do coração
// Busca notícias via Google News RSS por clube (sem API key)
// Cache inteligente: 30min por clube
// v1.2: Adiciona extração de thumbnails (<media:thumbnail> e <enclosure>)
import express from 'express';
import fetch from 'node-fetch';
import { CLUBES as CLUBES_NOTICIAS } from '../public/js/shared/clubes-data.js';
import { limparTexto, extrairTag, parseRSSItems, calcularTempoRelativo } from '../utils/rss-parser.js';

const router = express.Router();

// Cache em memória: { [clubeId]: { noticias, timestamp } }
const cacheNoticias = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// Cache separado para Libertadores (TTL maior - notícias menos frequentes)
let cacheLibertadores = null;
const CACHE_TTL_LIBERTA = 60 * 60 * 1000; // 1 hora

// Cache separado para Copa do Brasil
let cacheCopaBrasil = null;
const CACHE_TTL_COPABR = 60 * 60 * 1000; // 1 hora

// Cache separado para Copa do Nordeste
let cacheCopaNordeste = null;
const CACHE_TTL_COPANE = 60 * 60 * 1000; // 1 hora

// Funções RSS (limparTexto, extrairTag, parseRSSItems, calcularTempoRelativo)
// importadas de ../utils/rss-parser.js

/**
 * Busca notícias do Google News RSS para um clube
 */
async function buscarNoticiasClube(clubeId) {
    const clube = CLUBES_NOTICIAS[Number(clubeId)];
    if (!clube) {
        return { noticias: [], clube: null, erro: 'Clube não encontrado' };
    }

    // Verificar cache
    const cached = cacheNoticias[clubeId];
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return { noticias: cached.noticias, clube: clube.nome, cache: true };
    }

    try {
        const query = encodeURIComponent(clube.busca);
        const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

        console.log(`[NOTICIAS] Buscando notícias para ${clube.nome} (ID: ${clubeId})...`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaManager/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            },
            timeout: 10000
        });

        if (!response.ok) {
            console.error(`[NOTICIAS] Erro HTTP ${response.status} ao buscar notícias de ${clube.nome}`);
            // Retornar cache stale se disponível
            if (cached) {
                return { noticias: cached.noticias, clube: clube.nome, cache: true, stale: true };
            }
            return { noticias: [], clube: clube.nome, erro: 'Falha ao buscar notícias' };
        }

        const xml = await response.text();
        const noticias = parseRSSItems(xml).slice(0, 10); // Máximo 10 notícias

        console.log(`[NOTICIAS] ${noticias.length} notícias encontradas para ${clube.nome}`);

        // Atualizar cache
        cacheNoticias[clubeId] = {
            noticias,
            timestamp: Date.now()
        };

        return { noticias, clube: clube.nome, cache: false };
    } catch (error) {
        console.error(`[NOTICIAS] Erro ao buscar notícias de ${clube.nome}:`, error.message);

        // Retornar cache stale se disponível
        if (cached) {
            return { noticias: cached.noticias, clube: clube.nome, cache: true, stale: true };
        }
        return { noticias: [], clube: clube.nome, erro: error.message };
    }
}

/**
 * Busca notícias da Libertadores via Google News RSS
 */
async function buscarNoticiasLibertadores() {
    // Verificar cache
    if (cacheLibertadores && (Date.now() - cacheLibertadores.timestamp) < CACHE_TTL_LIBERTA) {
        return { noticias: cacheLibertadores.noticias, cache: true };
    }

    try {
        const query = encodeURIComponent('CONMEBOL Libertadores 2026');
        const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

        console.log('[NOTICIAS] Buscando notícias da Libertadores 2026...');

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaManager/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            },
            timeout: 10000
        });

        if (!response.ok) {
            console.error(`[NOTICIAS] Erro HTTP ${response.status} ao buscar Libertadores`);
            if (cacheLibertadores) {
                return { noticias: cacheLibertadores.noticias, cache: true, stale: true };
            }
            return { noticias: [], erro: 'Falha ao buscar notícias' };
        }

        const xml = await response.text();
        const noticias = parseRSSItems(xml).slice(0, 6); // Máximo 6 notícias

        console.log(`[NOTICIAS] ${noticias.length} notícias da Libertadores encontradas`);

        // Atualizar cache
        cacheLibertadores = { noticias, timestamp: Date.now() };

        return { noticias, cache: false };
    } catch (error) {
        console.error('[NOTICIAS] Erro ao buscar Libertadores:', error.message);
        if (cacheLibertadores) {
            return { noticias: cacheLibertadores.noticias, cache: true, stale: true };
        }
        return { noticias: [], erro: error.message };
    }
}

/**
 * Busca notícias da Copa do Brasil via Google News RSS
 */
async function buscarNoticiasCopaBrasil() {
    // Verificar cache
    if (cacheCopaBrasil && (Date.now() - cacheCopaBrasil.timestamp) < CACHE_TTL_COPABR) {
        return { noticias: cacheCopaBrasil.noticias, cache: true };
    }

    try {
        const query = encodeURIComponent('Copa do Brasil 2026');
        const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

        console.log('[NOTICIAS] Buscando notícias da Copa do Brasil 2026...');

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaManager/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            },
            timeout: 10000
        });

        if (!response.ok) {
            console.error(`[NOTICIAS] Erro HTTP ${response.status} ao buscar Copa do Brasil`);
            if (cacheCopaBrasil) {
                return { noticias: cacheCopaBrasil.noticias, cache: true, stale: true };
            }
            return { noticias: [], erro: 'Falha ao buscar notícias' };
        }

        const xml = await response.text();
        const noticias = parseRSSItems(xml).slice(0, 6); // Máximo 6 notícias

        console.log(`[NOTICIAS] ${noticias.length} notícias da Copa do Brasil encontradas`);

        // Atualizar cache
        cacheCopaBrasil = { noticias, timestamp: Date.now() };

        return { noticias, cache: false };
    } catch (error) {
        console.error('[NOTICIAS] Erro ao buscar Copa do Brasil:', error.message);
        if (cacheCopaBrasil) {
            return { noticias: cacheCopaBrasil.noticias, cache: true, stale: true };
        }
        return { noticias: [], erro: error.message };
    }
}

/**
 * Busca notícias da Copa do Nordeste via Google News RSS
 */
async function buscarNoticiasCopaNordeste() {
    // Verificar cache
    if (cacheCopaNordeste && (Date.now() - cacheCopaNordeste.timestamp) < CACHE_TTL_COPANE) {
        return { noticias: cacheCopaNordeste.noticias, cache: true };
    }

    try {
        const query = encodeURIComponent('Copa do Nordeste 2026');
        const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

        console.log('[NOTICIAS] Buscando notícias da Copa do Nordeste 2026...');

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaManager/1.0)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            },
            timeout: 10000
        });

        if (!response.ok) {
            console.error(`[NOTICIAS] Erro HTTP ${response.status} ao buscar Copa do Nordeste`);
            if (cacheCopaNordeste) {
                return { noticias: cacheCopaNordeste.noticias, cache: true, stale: true };
            }
            return { noticias: [], erro: 'Falha ao buscar notícias' };
        }

        const xml = await response.text();
        const noticias = parseRSSItems(xml).slice(0, 6); // Máximo 6 notícias

        console.log(`[NOTICIAS] ${noticias.length} notícias da Copa do Nordeste encontradas`);

        // Atualizar cache
        cacheCopaNordeste = { noticias, timestamp: Date.now() };

        return { noticias, cache: false };
    } catch (error) {
        console.error('[NOTICIAS] Erro ao buscar Copa do Nordeste:', error.message);
        if (cacheCopaNordeste) {
            return { noticias: cacheCopaNordeste.noticias, cache: true, stale: true };
        }
        return { noticias: [], erro: error.message };
    }
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ ROTAS                                                                │
// └──────────────────────────────────────────────────────────────────────┘

/**
 * GET /api/noticias/time/:clubeId
 * Retorna notícias personalizadas para um clube específico
 */
router.get('/time/:clubeId', async (req, res) => {
    try {
        const { clubeId } = req.params;

        if (!clubeId || isNaN(clubeId)) {
            return res.status(400).json({ success: false, erro: 'clubeId inválido' });
        }

        const resultado = await buscarNoticiasClube(clubeId);

        res.json({
            success: true,
            clubeId: Number(clubeId),
            clube: resultado.clube,
            noticias: resultado.noticias,
            total: resultado.noticias.length,
            cache: resultado.cache || false,
            stale: resultado.stale || false,
            atualizadoEm: new Date().toISOString()
        });
    } catch (error) {
        console.error('[NOTICIAS] Erro na rota:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar notícias' });
    }
});

/**
 * GET /api/noticias/libertadores
 * Retorna notícias da Libertadores 2026 via Google News RSS
 */
router.get('/libertadores', async (req, res) => {
    try {
        const resultado = await buscarNoticiasLibertadores();

        res.json({
            success: true,
            noticias: resultado.noticias,
            total: resultado.noticias.length,
            cache: resultado.cache || false,
            stale: resultado.stale || false,
            atualizadoEm: new Date().toISOString()
        });
    } catch (error) {
        console.error('[NOTICIAS] Erro na rota libertadores:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar notícias da Libertadores' });
    }
});

/**
 * GET /api/noticias/copa-brasil
 * Retorna notícias da Copa do Brasil 2026 via Google News RSS
 */
router.get('/copa-brasil', async (req, res) => {
    try {
        const resultado = await buscarNoticiasCopaBrasil();

        res.json({
            success: true,
            noticias: resultado.noticias,
            total: resultado.noticias.length,
            cache: resultado.cache || false,
            stale: resultado.stale || false,
            atualizadoEm: new Date().toISOString()
        });
    } catch (error) {
        console.error('[NOTICIAS] Erro na rota copa-brasil:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar notícias da Copa do Brasil' });
    }
});

/**
 * GET /api/noticias/copa-nordeste
 * Retorna notícias da Copa do Nordeste 2026 via Google News RSS
 */
router.get('/copa-nordeste', async (req, res) => {
    try {
        const resultado = await buscarNoticiasCopaNordeste();

        res.json({
            success: true,
            noticias: resultado.noticias,
            total: resultado.noticias.length,
            cache: resultado.cache || false,
            stale: resultado.stale || false,
            atualizadoEm: new Date().toISOString()
        });
    } catch (error) {
        console.error('[NOTICIAS] Erro na rota copa-nordeste:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar notícias da Copa do Nordeste' });
    }
});

/**
 * GET /api/noticias/clubes
 * Lista todos os clubes disponíveis para notícias
 */
router.get('/clubes', (req, res) => {
    const clubes = Object.entries(CLUBES_NOTICIAS).map(([id, info]) => ({
        id: Number(id),
        nome: info.nome,
        slug: info.slug
    }));

    res.json({ success: true, clubes, total: clubes.length });
});

/**
 * GET /api/noticias/cache/status
 * Status do cache de notícias
 */
router.get('/cache/status', (req, res) => {
    const status = Object.entries(cacheNoticias).map(([clubeId, cache]) => ({
        clubeId: Number(clubeId),
        clube: CLUBES_NOTICIAS[Number(clubeId)]?.nome || 'Desconhecido',
        noticias: cache.noticias.length,
        idadeMinutos: Math.round((Date.now() - cache.timestamp) / 60000),
        valido: (Date.now() - cache.timestamp) < CACHE_TTL
    }));

    res.json({
        success: true,
        caches: status,
        ttlMinutos: CACHE_TTL / 60000
    });
});

export default router;
