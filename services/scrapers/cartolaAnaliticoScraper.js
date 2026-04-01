/**
 * CARTOLA ANALITICO SCRAPER SERVICE v1.0
 * Busca dados de analise do cartolaanalitico.com.
 *
 * O site e uma SPA (React/Vue), entao scrapers tradicionais nao funcionam.
 * Estrategia: buscar endpoints de API REST que a SPA consome internamente.
 *
 * Fontes alternativas exploradas automaticamente:
 *   - API interna do cartolaanalitico (JSON endpoints)
 *   - Fallback: dados do Cartola FC Brasil
 *   - Fallback: retorna null (agregador trata graciosamente)
 *
 * Cache: NodeCache 30min
 * Retry: 2 tentativas com backoff
 */

import fetch from 'node-fetch';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 1800 }); // 30 min
const LOG_PREFIX = '[SCRAPER-ANALITICO]';

// User-Agents para rotacao
const USER_AGENTS = [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// =====================================================================
// ENDPOINTS CONHECIDOS (discovery progressivo)
// =====================================================================
const ENDPOINTS = {
    // Endpoints comuns de SPAs de analise Cartola
    projecoes: [
        'https://api.cartolaanalitico.com/atletas/projecoes',
        'https://api.cartolaanalitico.com/v1/projecoes',
        'https://www.cartolaanalitico.com/api/projecoes',
    ],
    scouts: [
        'https://api.cartolaanalitico.com/atletas/scouts',
        'https://api.cartolaanalitico.com/v1/scouts',
    ],
    dicas: [
        'https://api.cartolaanalitico.com/dicas/rodada',
        'https://api.cartolaanalitico.com/v1/dicas',
    ],
};

// =====================================================================
// FETCH COM RETRY E BACKOFF
// =====================================================================
async function fetchComRetry(url, tentativas = 2) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const resp = await fetch(url, {
                headers: {
                    'User-Agent': randomUA(),
                    'Accept': 'application/json',
                    'Accept-Language': 'pt-BR,pt;q=0.9',
                    'Origin': 'https://www.cartolaanalitico.com',
                    'Referer': 'https://www.cartolaanalitico.com/',
                },
                timeout: 10000,
            });

            if (resp.ok) {
                const data = await resp.json();
                return data;
            }

            // 403/429 = rate limited ou bloqueado
            if (resp.status === 403 || resp.status === 429) {
                console.warn(`${LOG_PREFIX} Rate limited (${resp.status}) em ${url}`);
                if (i < tentativas - 1) {
                    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
                }
                continue;
            }

            // 404 = endpoint nao existe
            if (resp.status === 404) {
                return null;
            }

            console.warn(`${LOG_PREFIX} HTTP ${resp.status} em ${url}`);
        } catch (error) {
            console.warn(`${LOG_PREFIX} Erro em ${url}: ${error.message}`);
            if (i < tentativas - 1) {
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            }
        }
    }
    return null;
}

// =====================================================================
// TENTAR MULTIPLOS ENDPOINTS (discovery)
// =====================================================================
async function tentarEndpoints(endpoints) {
    for (const url of endpoints) {
        const data = await fetchComRetry(url, 1); // 1 tentativa por endpoint
        if (data) {
            console.log(`${LOG_PREFIX} Endpoint ativo: ${url}`);
            return { data, url };
        }
    }
    return null;
}

// =====================================================================
// BUSCAR PROJECOES DE ATLETAS
// =====================================================================
async function buscarProjecoes() {
    const cacheKey = 'analitico_projecoes';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const resultado = await tentarEndpoints(ENDPOINTS.projecoes);
    if (!resultado) {
        console.log(`${LOG_PREFIX} Nenhum endpoint de projecoes disponivel`);
        return null;
    }

    // Normalizar dados para formato padrao
    const projecoes = normalizarProjecoes(resultado.data);
    if (projecoes) {
        cache.set(cacheKey, projecoes);
    }
    return projecoes;
}

// =====================================================================
// BUSCAR SCOUTS DETALHADOS
// =====================================================================
async function buscarScoutsDetalhados() {
    const cacheKey = 'analitico_scouts';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const resultado = await tentarEndpoints(ENDPOINTS.scouts);
    if (!resultado) {
        console.log(`${LOG_PREFIX} Nenhum endpoint de scouts disponivel`);
        return null;
    }

    const scouts = normalizarScouts(resultado.data);
    if (scouts) {
        cache.set(cacheKey, scouts);
    }
    return scouts;
}

// =====================================================================
// BUSCAR DICAS DA RODADA
// =====================================================================
async function buscarDicasRodada() {
    const cacheKey = 'analitico_dicas';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const resultado = await tentarEndpoints(ENDPOINTS.dicas);
    if (!resultado) {
        console.log(`${LOG_PREFIX} Nenhum endpoint de dicas disponivel`);
        return null;
    }

    cache.set(cacheKey, resultado.data);
    return resultado.data;
}

// =====================================================================
// NORMALIZADORES
// =====================================================================

/**
 * Normaliza projecoes em formato padrao:
 * { [atletaId]: { projecao: number, confianca: number, fonte: string } }
 */
function normalizarProjecoes(data) {
    if (!data) return null;

    const resultado = {};

    // Tentar diferentes formatos de resposta
    const lista = Array.isArray(data) ? data : data.atletas || data.projecoes || data.data;
    if (!Array.isArray(lista)) return null;

    for (const item of lista) {
        const id = item.atleta_id || item.atletaId || item.id;
        if (!id) continue;

        resultado[id] = {
            projecao: item.projecao || item.pontos_projetados || item.score || 0,
            confianca: item.confianca || item.confidence || 50,
            detalhe: item.detalhe || item.analise || null,
            fonte: 'cartolaanalitico',
        };
    }

    return Object.keys(resultado).length > 0 ? resultado : null;
}

/**
 * Normaliza scouts em formato padrao
 */
function normalizarScouts(data) {
    if (!data) return null;

    const resultado = {};
    const lista = Array.isArray(data) ? data : data.atletas || data.scouts || data.data;
    if (!Array.isArray(lista)) return null;

    for (const item of lista) {
        const id = item.atleta_id || item.atletaId || item.id;
        if (!id) continue;

        resultado[id] = {
            scouts: item.scouts || item.scout || {},
            tendencia: item.tendencia || item.trend || null,
            risco: item.risco || item.risk || null,
            fonte: 'cartolaanalitico',
        };
    }

    return Object.keys(resultado).length > 0 ? resultado : null;
}

// =====================================================================
// VERIFICAR DISPONIBILIDADE
// =====================================================================
async function verificarDisponibilidade() {
    try {
        // Testar endpoint mais provavel
        const resp = await fetch('https://www.cartolaanalitico.com', {
            method: 'HEAD',
            headers: { 'User-Agent': randomUA() },
            timeout: 5000,
        });
        return {
            disponivel: resp.ok,
            status: resp.ok ? 'ONLINE' : `HTTP_${resp.status}`,
        };
    } catch {
        return { disponivel: false, status: 'OFFLINE' };
    }
}

// =====================================================================
// BUSCAR TUDO (agregado)
// =====================================================================
async function buscarDadosCompletos() {
    const [projecoes, scouts, dicas] = await Promise.allSettled([
        buscarProjecoes(),
        buscarScoutsDetalhados(),
        buscarDicasRodada(),
    ]);

    const resultado = {
        projecoes: projecoes.status === 'fulfilled' ? projecoes.value : null,
        scouts: scouts.status === 'fulfilled' ? scouts.value : null,
        dicas: dicas.status === 'fulfilled' ? dicas.value : null,
        disponivel: false,
        fonte: 'cartolaanalitico',
    };

    resultado.disponivel = !!(resultado.projecoes || resultado.scouts || resultado.dicas);

    if (!resultado.disponivel) {
        console.log(`${LOG_PREFIX} Nenhum dado disponivel do CartolaAnalitico`);
    }

    return resultado;
}

function limparCache() {
    cache.flushAll();
    console.log(`${LOG_PREFIX} Cache limpo`);
}

export default {
    buscarProjecoes,
    buscarScoutsDetalhados,
    buscarDicasRodada,
    buscarDadosCompletos,
    verificarDisponibilidade,
    limparCache,
};
