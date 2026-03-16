/**
 * DATA AGGREGATOR v1.0
 * Orquestrador multi-fonte para coleta de dados de escalacao IA.
 *
 * Coleta dados de todas as fontes disponiveis via Promise.allSettled
 * (resiliencia - cada fonte e opcional) e normaliza em formato unificado.
 *
 * Fontes:
 *   1. Cartola API publica (mercado + partidas + cedidos)
 *   2. GatoMestre autenticado (endpoints premium)
 *   3. CartolaAnalitico scraper
 *   4. Web scraper (blogs)
 *   5. Perplexity (pesquisa web)
 *
 * Salva snapshot no MongoDB: collection escalacao_ia_cache
 */

import axios from 'axios';
import NodeCache from 'node-cache';
import mongoose from 'mongoose';
import systemTokenService from '../systemTokenService.js';
import dicasPremiumService from '../dicasPremiumService.js';
import cartolaAnaliticoScraper from '../scrapers/cartolaAnaliticoScraper.js';
import cartolaWebScraper from '../scrapers/cartolaWebScraper.js';
import perplexityService from '../perplexityAnalysisService.js';

const cache = new NodeCache({ stdTTL: 900 }); // 15 min
const LOG_PREFIX = '[DATA-AGGREGATOR]';

const CARTOLA_API = {
    mercado: 'https://api.cartola.globo.com/atletas/mercado',
    partidas: 'https://api.cartola.globo.com/partidas',
    clubes: 'https://api.cartola.globo.com/clubes',
    status: 'https://api.cartola.globo.com/mercado/status',
};

// =====================================================================
// FONTE 1: CARTOLA API PUBLICA
// =====================================================================
async function buscarCartolaAPI() {
    const cacheKey = 'agg_cartola_api';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const [mercadoResp, partidasResp, statusResp] = await Promise.all([
            axios.get(CARTOLA_API.mercado, { timeout: 15000, headers: { 'User-Agent': 'Super-Cartola-Manager/2.0' } }),
            axios.get(CARTOLA_API.partidas, { timeout: 10000, headers: { 'User-Agent': 'Super-Cartola-Manager/2.0' } }),
            axios.get(CARTOLA_API.status, { timeout: 10000, headers: { 'User-Agent': 'Super-Cartola-Manager/2.0' } }).catch((e) => { console.warn(`${LOG_PREFIX} /mercado/status indisponivel: ${e.message}`); return null; }),
        ]);

        const atletas = mercadoResp.data?.atletas || [];
        const clubes = mercadoResp.data?.clubes || {};
        // rodada_atual vem de /mercado/status (fonte confiável), com fallback para /atletas/mercado
        const rodada = statusResp?.data?.rodada_atual || mercadoResp.data?.rodada_atual;
        const partidas = partidasResp.data?.partidas || [];

        // Mapear confrontos
        const mapaConfrontos = {};
        for (const p of partidas) {
            mapaConfrontos[p.clube_casa_id] = { mandante: true, adversarioId: p.clube_visitante_id };
            mapaConfrontos[p.clube_visitante_id] = { mandante: false, adversarioId: p.clube_casa_id };
        }

        const resultado = { atletas, clubes, rodada, mapaConfrontos, partidas };
        cache.set(cacheKey, resultado);
        console.log(`${LOG_PREFIX} Cartola API: ${atletas.length} atletas, rodada ${rodada}`);
        return resultado;
    } catch (error) {
        console.error(`${LOG_PREFIX} Cartola API falhou: ${error.message}`);
        throw error; // Fonte critica - propagar erro
    }
}

// =====================================================================
// FONTE 2: GATOMESTRE AUTENTICADO
// =====================================================================
async function buscarGatoMestrePremium() {
    const cacheKey = 'agg_gatomestre';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const status = await systemTokenService.statusToken();
        if (!status.disponivel) {
            console.log(`${LOG_PREFIX} GatoMestre: Token nao disponivel`);
            return null;
        }

        // Tentar multiplos endpoints premium em paralelo
        const [sugestoes, destaques, escalacao] = await Promise.allSettled([
            systemTokenService.fazerRequisicaoAutenticada('/auth/dicas/sugestoes'),
            systemTokenService.fazerRequisicaoAutenticada('/auth/mercado/destaques'),
            systemTokenService.fazerRequisicaoAutenticada('/auth/escalacao/sugestao'),
        ]);

        const resultado = {
            sugestoes: sugestoes.status === 'fulfilled' && sugestoes.value?.success ? sugestoes.value.data : null,
            destaques: destaques.status === 'fulfilled' && destaques.value?.success ? destaques.value.data : null,
            escalacaoOficial: escalacao.status === 'fulfilled' && escalacao.value?.success ? escalacao.value.data : null,
            disponivel: false,
        };

        resultado.disponivel = !!(resultado.sugestoes || resultado.destaques || resultado.escalacaoOficial);

        if (resultado.disponivel) {
            cache.set(cacheKey, resultado);
            console.log(`${LOG_PREFIX} GatoMestre Premium: dados obtidos`);
        } else {
            console.log(`${LOG_PREFIX} GatoMestre Premium: nenhum endpoint retornou dados`);
        }

        return resultado;
    } catch (error) {
        console.warn(`${LOG_PREFIX} GatoMestre Premium falhou: ${error.message}`);
        return null;
    }
}

// =====================================================================
// FONTE 3: PONTUACAO CEDIDA (defesas vulneraveis)
// =====================================================================
async function buscarCedidosPorClube() {
    const cacheKey = 'agg_cedidos';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const resultados = await Promise.allSettled([
            dicasPremiumService.buscarPontuacaoCedida(1, 5), // GOL
            dicasPremiumService.buscarPontuacaoCedida(2, 5), // LAT
            dicasPremiumService.buscarPontuacaoCedida(3, 5), // ZAG
            dicasPremiumService.buscarPontuacaoCedida(4, 5), // MEI
            dicasPremiumService.buscarPontuacaoCedida(5, 5), // ATA
        ]);

        const cedidosPorClube = {};
        resultados.forEach((resultado, idx) => {
            if (resultado.status !== 'fulfilled') return;
            const posicaoId = idx + 1;
            for (const item of resultado.value) {
                if (!cedidosPorClube[item.clubeId]) {
                    cedidosPorClube[item.clubeId] = { clubeNome: item.clubeNome };
                }
                cedidosPorClube[item.clubeId][`pos${posicaoId}`] = item.mediaCedida;
            }
        });

        cache.set(cacheKey, cedidosPorClube, 600); // 10 min
        return cedidosPorClube;
    } catch (error) {
        console.warn(`${LOG_PREFIX} Cedidos falhou: ${error.message}`);
        return {};
    }
}

// =====================================================================
// AGREGACAO COMPLETA
// =====================================================================

/**
 * Agrega dados de todas as fontes e normaliza por atleta.
 * @param {Object} options - { rodada?: number }
 * @returns {Object} Dados agregados normalizados
 */
async function agregarDados(options = {}) {
    const cacheKey = 'agg_completo';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    console.log(`${LOG_PREFIX} Iniciando agregacao multi-fonte...`);
    const inicio = Date.now();

    // FASE 1: Buscar Cartola API primeiro (critica + fornece rodada)
    const cartolaApi = await buscarCartolaAPI();
    const rodada = options.rodada || cartolaApi.rodada;

    // FASE 2: Buscar demais fontes em paralelo (incluindo Perplexity com rodada conhecida)
    const [
        gatoMestreResult,
        cedidosResult,
        analiticoResult,
        webScraperResult,
        perplexityResult,
    ] = await Promise.allSettled([
        buscarGatoMestrePremium(),                                   // OPCIONAL
        buscarCedidosPorClube(),                                     // OPCIONAL
        cartolaAnaliticoScraper.buscarDadosCompletos(),             // OPCIONAL
        cartolaWebScraper.buscarTodosSites(),                       // OPCIONAL
        rodada ? perplexityService.pesquisaCompleta(rodada) : Promise.resolve(null), // OPCIONAL
    ]);

    const gatoMestre = gatoMestreResult.status === 'fulfilled' ? gatoMestreResult.value : null;
    const cedidos = cedidosResult.status === 'fulfilled' ? cedidosResult.value : {};
    const analitico = analiticoResult.status === 'fulfilled' ? analiticoResult.value : null;
    const webScraper = webScraperResult.status === 'fulfilled' ? webScraperResult.value : null;
    const perplexity = perplexityResult.status === 'fulfilled' ? perplexityResult.value : null;

    // Fontes ativas
    const fontesAtivas = ['cartola-api'];
    if (Object.keys(cartolaApi.mapaConfrontos).length > 0) fontesAtivas.push('confrontos');
    if (Object.keys(cedidos).length > 0) fontesAtivas.push('cedidos');
    if (gatoMestre?.disponivel) fontesAtivas.push('gato-mestre-premium');
    if (analitico?.disponivel) fontesAtivas.push('cartola-analitico');
    if (webScraper?.totalDicas > 0) fontesAtivas.push('web-scraper');
    if (perplexity?.disponivel) fontesAtivas.push('perplexity');

    // Criar mapa de jogadores mencionados por nome (web + perplexity)
    const jogadoresRecomendadosWeb = new Set();
    const jogadoresRiscoWeb = new Set();

    if (webScraper?.jogadoresMencionados) {
        for (const nome of webScraper.jogadoresMencionados) {
            jogadoresRecomendadosWeb.add(nome.toLowerCase());
        }
    }
    if (perplexity?.melhoresJogadores?.jogadores) {
        for (const j of perplexity.melhoresJogadores.jogadores) {
            jogadoresRecomendadosWeb.add(j.nome.toLowerCase());
        }
    }
    if (perplexity?.jogadoresDuvida?.jogadoresRisco) {
        for (const j of perplexity.jogadoresDuvida.jogadoresRisco) {
            jogadoresRiscoWeb.add(j.nome.toLowerCase());
        }
    }

    // Mapa de disponibilidade real (Perplexity)
    const mapaDisponibilidadeReal = {};
    if (perplexity?.disponibilidadeReal?.jogadores) {
        for (const j of perplexity.disponibilidadeReal.jogadores) {
            if (j.nome) {
                mapaDisponibilidadeReal[j.nome.toLowerCase()] = {
                    status: j.status, // 'confirmado', 'duvida', 'descartado', 'poupado'
                    motivo: j.motivo || '',
                    fonte: j.fonte || '',
                    confianca: j.confianca || 0,
                };
            }
        }
    }

    // Criar mapa de projecoes do CartolaAnalitico
    const projecoesAnalitico = analitico?.projecoes || {};

    // Normalizar atletas
    const atletasNormalizados = cartolaApi.atletas
        .filter(a => a.status_id === 7) // Apenas provaveis
        .map(a => {
            const clubeId = a.clube_id;
            const clube = cartolaApi.clubes[clubeId] || {};
            const confronto = cartolaApi.mapaConfrontos[clubeId] || {};
            const adversarioId = confronto.adversarioId;
            const cedidoAdv = adversarioId && cedidos[adversarioId]
                ? cedidos[adversarioId][`pos${a.posicao_id}`] || 0
                : 0;

            // Checar se mencionado na web (match por apelido ou nome)
            const nomeNorm = (a.apelido || a.nome || '').toLowerCase();
            const mencionadoWeb = jogadoresRecomendadosWeb.has(nomeNorm);
            const riscoWeb = jogadoresRiscoWeb.has(nomeNorm);

            // Disponibilidade real (Perplexity)
            const disponibilidadeReal = mapaDisponibilidadeReal[nomeNorm] || null;

            // Projecao do CartolaAnalitico
            const projecaoAnalitico = projecoesAnalitico[a.atleta_id] || null;

            // Contar fontes que recomendam este jogador
            let fontesConfirmam = 1; // Cartola API sempre conta
            if (a.gato_mestre?.media_mandante > 0 || a.gato_mestre?.media_visitante > 0) fontesConfirmam++;
            if (cedidoAdv > 3) fontesConfirmam++; // Adversario cede > 3 pts na posicao
            if (confronto.mandante) fontesConfirmam++;
            if (projecaoAnalitico?.projecao > 5) fontesConfirmam++;
            if (mencionadoWeb) fontesConfirmam++;

            // Score de confianca (0-100)
            const maxFontes = 6;
            const confianca = Math.round((fontesConfirmam / maxFontes) * 100);

            return {
                atletaId: a.atleta_id,
                nome: a.apelido || a.nome,
                foto: a.foto ? a.foto.replace('FORMATO', '140x140') : null,
                posicaoId: a.posicao_id,
                clubeId,
                clubeNome: clube.nome || 'N/D',
                clubeAbrev: clube.abreviacao || '???',
                preco: a.preco_num || 0,
                media: a.media_num || 0,
                variacao: a.variacao_num || 0,
                jogos: a.jogos_num || 0,
                statusId: a.status_id,
                fontes: {
                    cartolaApi: {
                        media: a.media_num || 0,
                        scouts: a.scout || {},
                        status: a.status_id,
                        gato_mestre: a.gato_mestre || null,
                        minutoJogados: a.gato_mestre?.minutos_jogados || null,
                    },
                    confrontos: {
                        mandante: confronto.mandante ?? null,
                        adversarioId,
                        adversarioNome: adversarioId ? (cartolaApi.clubes[adversarioId]?.abreviacao || '???') : null,
                        cedidoAdv,
                    },
                    cartolaAnalitico: projecaoAnalitico,
                    webResearch: {
                        mencionado: mencionadoWeb,
                        emRisco: riscoWeb,
                    },
                    gatoMestrePremium: gatoMestre?.sugestoes?.[a.atleta_id] || null,
                },
                confianca,
                fontesConfirmam,
                disponibilidadeReal,
            };
        });

    const resultado = {
        atletas: atletasNormalizados,
        clubes: cartolaApi.clubes,
        rodada,
        fontesAtivas,
        totalAtletas: atletasNormalizados.length,
        perplexityData: perplexity,
        webScraperData: webScraper,
        tempoMs: Date.now() - inicio,
        geradoEm: new Date().toISOString(),
    };

    cache.set(cacheKey, resultado);

    // Salvar snapshot no MongoDB
    await salvarSnapshot(resultado);

    console.log(`${LOG_PREFIX} Agregacao completa: ${atletasNormalizados.length} atletas, ${fontesAtivas.length} fontes, ${resultado.tempoMs}ms`);

    return resultado;
}

// =====================================================================
// PERSISTENCIA MONGODB
// =====================================================================
async function salvarSnapshot(dados) {
    try {
        const db = mongoose.connection.db;
        if (!db) return;

        await db.collection('escalacao_ia_cache').updateOne(
            { tipo: 'agregacao', rodada: dados.rodada },
            {
                $set: {
                    tipo: 'agregacao',
                    rodada: dados.rodada,
                    fontesAtivas: dados.fontesAtivas,
                    totalAtletas: dados.totalAtletas,
                    tempoMs: dados.tempoMs,
                    geradoEm: dados.geradoEm,
                    // Nao salvar atletas completos (muito grande) - salvar resumo
                    topAtletas: dados.atletas
                        .sort((a, b) => b.confianca - a.confianca)
                        .slice(0, 50)
                        .map(a => ({
                            atletaId: a.atletaId,
                            nome: a.nome,
                            posicaoId: a.posicaoId,
                            preco: a.preco,
                            confianca: a.confianca,
                        })),
                    expireAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // TTL 2h
                },
            },
            { upsert: true }
        );
    } catch (error) {
        console.warn(`${LOG_PREFIX} Erro ao salvar snapshot: ${error.message}`);
    }
}

/**
 * Buscar ultimo snapshot do cache MongoDB.
 */
async function buscarUltimoSnapshot(rodada) {
    try {
        const db = mongoose.connection.db;
        if (!db) return null;

        return await db.collection('escalacao_ia_cache').findOne(
            { tipo: 'agregacao', rodada },
            { sort: { geradoEm: -1 } }
        );
    } catch {
        return null;
    }
}

// =====================================================================
// LIMPAR CACHE
// =====================================================================
function limparCache() {
    cache.flushAll();
    console.log(`${LOG_PREFIX} Cache limpo`);
}

export default {
    agregarDados,
    buscarCartolaAPI,
    buscarGatoMestrePremium,
    buscarCedidosPorClube,
    buscarUltimoSnapshot,
    limparCache,
};
