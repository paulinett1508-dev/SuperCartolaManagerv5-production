/**
 * CARTOLA WEB SCRAPER SERVICE v1.0
 * Scraper generico para blogs e sites de analise Cartola FC.
 *
 * Padrao extensivel: configs de sites com seletores CSS.
 * Para SPAs que nao funcionam com fetch simples, delega ao Perplexity.
 *
 * Sites suportados:
 *   - cartoleiros.com (blog com dicas)
 *   - cartolafcbrasil.com.br (analises)
 *   - Sites que servem HTML renderizado (SSR)
 *
 * Cache: NodeCache 30min
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 1800 }); // 30 min
const LOG_PREFIX = '[WEB-SCRAPER]';

// =====================================================================
// CONFIGS DE SITES (extensivel)
// =====================================================================
const SITES_CONFIG = [
    {
        id: 'cartoleiros',
        nome: 'Cartoleiros',
        baseUrl: 'https://www.cartoleiros.com',
        dicasUrl: 'https://www.cartoleiros.com/dicas',
        tipo: 'ssr', // Server-Side Rendered (cheerio funciona)
        seletores: {
            artigo: 'article, .post, .entry',
            titulo: 'h1, h2, .title',
            conteudo: '.content, .entry-content, .post-content, p',
            jogador: '.player-name, .atleta, strong',
        },
        ativo: true,
    },
    {
        id: 'cartolafcbrasil',
        nome: 'Cartola FC Brasil',
        baseUrl: 'https://www.cartolafcbrasil.com.br',
        dicasUrl: 'https://www.cartolafcbrasil.com.br/dicas',
        tipo: 'ssr',
        seletores: {
            artigo: 'article, .post',
            titulo: 'h1, h2',
            conteudo: '.content, .entry-content, p',
            jogador: 'strong, b',
        },
        ativo: true,
    },
];

// User-Agents
const USER_AGENTS = [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// =====================================================================
// SCRAPER SSR (sites que servem HTML renderizado)
// =====================================================================
async function scrapeSiteSSR(config) {
    const cacheKey = `webscraper_${config.id}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const resp = await fetch(config.dicasUrl || config.baseUrl, {
            headers: {
                'User-Agent': randomUA(),
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'pt-BR,pt;q=0.9',
            },
            timeout: 12000,
        });

        if (!resp.ok) {
            console.warn(`${LOG_PREFIX} ${config.nome}: HTTP ${resp.status}`);
            return null;
        }

        const html = await resp.text();
        const $ = cheerio.load(html);

        // Extrair artigos/dicas
        const dicas = [];
        const artigos = $(config.seletores.artigo);

        artigos.each((i, el) => {
            if (i >= 10) return false; // Max 10 artigos

            const titulo = $(el).find(config.seletores.titulo).first().text().trim();
            const conteudo = $(el).find(config.seletores.conteudo).text().trim();

            if (!titulo && !conteudo) return;

            // Extrair nomes de jogadores mencionados (heuristica)
            const jogadoresMencionados = extrairJogadoresMencionados(conteudo);

            dicas.push({
                titulo: titulo.substring(0, 200),
                resumo: conteudo.substring(0, 500),
                jogadores: jogadoresMencionados,
                fonte: config.id,
            });
        });

        // Se nao encontrou artigos estruturados, tenta extrair texto geral
        if (dicas.length === 0) {
            const textoGeral = $('main, .content, #content, article').text().trim();
            if (textoGeral.length > 100) {
                const jogadores = extrairJogadoresMencionados(textoGeral);
                if (jogadores.length > 0) {
                    dicas.push({
                        titulo: `Analise ${config.nome}`,
                        resumo: textoGeral.substring(0, 1000),
                        jogadores,
                        fonte: config.id,
                    });
                }
            }
        }

        const resultado = {
            site: config.id,
            nome: config.nome,
            dicas,
            totalDicas: dicas.length,
            scrapedAt: new Date().toISOString(),
        };

        if (dicas.length > 0) {
            cache.set(cacheKey, resultado);
        }

        console.log(`${LOG_PREFIX} ${config.nome}: ${dicas.length} dicas extraidas`);
        return resultado;
    } catch (error) {
        console.warn(`${LOG_PREFIX} ${config.nome}: Erro - ${error.message}`);
        return null;
    }
}

// =====================================================================
// EXTRAIR NOMES DE JOGADORES (heuristica)
// =====================================================================
function extrairJogadoresMencionados(texto) {
    if (!texto) return [];

    // Posicoes comuns mencionadas junto com nomes
    const padroesPosicao = /(?:goleiro|lateral|zagueiro|meia|atacante|tecnico|t[eé]cnico)\s*:?\s*([A-Z][a-záéíóúãõâêô]+(?:\s+[A-Z][a-záéíóúãõâêô]+)*)/gi;

    // Nomes proprios em contexto de futebol (2+ palavras maiusculas)
    const padroesNome = /\b([A-Z][a-záéíóúãõâêô]+(?:\s+(?:de|da|do|dos|das)\s+)?[A-Z][a-záéíóúãõâêô]+)\b/g;

    const nomes = new Set();

    let match;
    while ((match = padroesPosicao.exec(texto)) !== null) {
        if (match[1] && match[1].length > 3) {
            nomes.add(match[1].trim());
        }
    }

    while ((match = padroesNome.exec(texto)) !== null) {
        if (match[1] && match[1].length > 3) {
            nomes.add(match[1].trim());
        }
    }

    // Filtrar palavras comuns que nao sao nomes de jogadores
    const stopWords = new Set([
        'Cartola', 'Brasil', 'Brasileirao', 'Copa', 'Liga', 'Rodada',
        'Campeonato', 'Escalacao', 'Pontuacao', 'Serie', 'Final',
        'Para', 'Como', 'Mais', 'Melhor', 'Pior', 'Grande',
    ]);

    return Array.from(nomes).filter(n => !stopWords.has(n)).slice(0, 30);
}

// =====================================================================
// BUSCAR TODOS OS SITES
// =====================================================================
async function buscarTodosSites() {
    const cacheKey = 'webscraper_all';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const sitesAtivos = SITES_CONFIG.filter(s => s.ativo);

    const resultados = await Promise.allSettled(
        sitesAtivos.map(config => {
            if (config.tipo === 'ssr') {
                return scrapeSiteSSR(config);
            }
            // SPAs nao suportadas por scraping direto
            return Promise.resolve(null);
        })
    );

    const dados = {
        sites: [],
        totalDicas: 0,
        jogadoresMencionados: new Set(),
    };

    for (const resultado of resultados) {
        if (resultado.status === 'fulfilled' && resultado.value) {
            dados.sites.push(resultado.value);
            dados.totalDicas += resultado.value.totalDicas;
            for (const dica of resultado.value.dicas) {
                for (const j of dica.jogadores) {
                    dados.jogadoresMencionados.add(j);
                }
            }
        }
    }

    const final = {
        sites: dados.sites,
        totalDicas: dados.totalDicas,
        jogadoresMencionados: Array.from(dados.jogadoresMencionados),
        scrapedAt: new Date().toISOString(),
    };

    if (dados.totalDicas > 0) {
        cache.set(cacheKey, final);
    }

    return final;
}

// =====================================================================
// VERIFICAR DISPONIBILIDADE
// =====================================================================
async function verificarDisponibilidade() {
    const status = {};
    for (const config of SITES_CONFIG) {
        try {
            const resp = await fetch(config.baseUrl, {
                method: 'HEAD',
                headers: { 'User-Agent': randomUA() },
                timeout: 5000,
            });
            status[config.id] = { disponivel: resp.ok, status: resp.ok ? 'ONLINE' : `HTTP_${resp.status}` };
        } catch {
            status[config.id] = { disponivel: false, status: 'OFFLINE' };
        }
    }
    return status;
}

export default {
    buscarTodosSites,
    scrapeSiteSSR,
    verificarDisponibilidade,
    SITES_CONFIG,
};
