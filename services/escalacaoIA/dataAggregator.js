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

        // Usar endpoint REAL confirmado: /auth/time (retorna time do admin autenticado)
        // Endpoints especulativos (/auth/dicas/sugestoes, /auth/mercado/destaques,
        // /auth/escalacao/sugestao) NÃO existem na API oficial do Cartola
        const authTimeResult = await systemTokenService.fazerRequisicaoAutenticada('/auth/time');

        if (!authTimeResult.success || !authTimeResult.data) {
            console.log(`${LOG_PREFIX} GatoMestre Premium: /auth/time falhou`);
            return null;
        }

        const timeData = authTimeResult.data;
        const timeInfo = timeData.time || timeData;

        // Extrair dados úteis do time autenticado
        const patrimonioReal = timeInfo.patrimonio || 0;
        const esquemaIdReal = timeInfo.esquema_id || 3;

        // Jogadores escalados pelo admin = sinal de preferência pessoal
        // Se o admin escalou esses jogadores no Cartola real, eles recebem boost
        const atletasEscalados = timeInfo.atletas || [];
        const sugestoesMap = {};

        for (const atleta of atletasEscalados) {
            const id = atleta.atleta_id || atleta.id;
            if (!id) continue;
            sugestoesMap[id] = {
                score: atleta.pontos_num || atleta.media_num || 0,
                recomendado: true,
                naEscalacaoOficial: true,
                fonte: 'gatomestre-time-admin',
            };
        }

        const resultado = {
            sugestoes: null,
            sugestoesMap,
            destaques: null,
            escalacaoOficial: atletasEscalados,
            patrimonioReal,
            esquemaIdReal,
            disponivel: true,
        };

        cache.set(cacheKey, resultado);
        const totalMapeados = Object.keys(sugestoesMap).length;
        console.log(`${LOG_PREFIX} GatoMestre Premium: dados reais obtidos (patrimonio=C$${patrimonioReal}, ${totalMapeados} jogadores escalados)`);

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
// NORMALIZAR SUGESTOES GATOMESTRE EM MAPA POR ATLETA_ID
// =====================================================================
/**
 * Normaliza dados do GatoMestre Premium em mapa { [atleta_id]: { score, projecao, ... } }.
 * A API pode retornar formatos variados — tenta todos os formatos conhecidos.
 */
function normalizarSugestoesGatoMestre(sugestoesRaw, destaquesRaw, escalacaoRaw) {
    const mapa = {};

    function extrairAtletas(data) {
        if (!data) return [];
        // Array direto: [{ atleta_id, ... }]
        if (Array.isArray(data)) return data;
        // Objeto com .atletas: { atletas: [...] }
        if (Array.isArray(data.atletas)) return data.atletas;
        // Objeto com .jogadores: { jogadores: [...] }
        if (Array.isArray(data.jogadores)) return data.jogadores;
        // Objeto com .sugestoes: { sugestoes: [...] }
        if (Array.isArray(data.sugestoes)) return data.sugestoes;
        // Objeto com .data: { data: [...] }
        if (Array.isArray(data.data)) return data.data;
        // Mapa direto por ID: { "123": { ... } }
        if (typeof data === 'object') {
            const entries = Object.entries(data);
            if (entries.length > 0 && typeof entries[0][1] === 'object') {
                return entries.map(([id, obj]) => ({ atleta_id: parseInt(id), ...obj }));
            }
        }
        return [];
    }

    // Processar sugestões
    for (const atleta of extrairAtletas(sugestoesRaw)) {
        const id = atleta.atleta_id || atleta.atletaId || atleta.id;
        if (!id) continue;
        mapa[id] = {
            score: atleta.score || atleta.pontos_projetados || atleta.projecao || 0,
            recomendado: true,
            fonte: 'gatomestre-sugestoes',
            ...(atleta.motivo && { motivo: atleta.motivo }),
        };
    }

    // Processar destaques (complementar)
    for (const atleta of extrairAtletas(destaquesRaw)) {
        const id = atleta.atleta_id || atleta.atletaId || atleta.id;
        if (!id) continue;
        if (!mapa[id]) {
            mapa[id] = { score: 0, recomendado: false, fonte: 'gatomestre-destaques' };
        }
        mapa[id].destaque = true;
        if (atleta.score || atleta.pontos_projetados) {
            mapa[id].score = Math.max(mapa[id].score, atleta.score || atleta.pontos_projetados || 0);
        }
    }

    // Processar escalação oficial sugerida
    for (const atleta of extrairAtletas(escalacaoRaw)) {
        const id = atleta.atleta_id || atleta.atletaId || atleta.id;
        if (!id) continue;
        if (!mapa[id]) {
            mapa[id] = { score: 0, recomendado: false, fonte: 'gatomestre-escalacao' };
        }
        mapa[id].naEscalacaoOficial = true;
        mapa[id].recomendado = true;
    }

    return mapa;
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
    // Sem cache no nível do aggregator — cada sub-fonte tem seu próprio cache
    // (cartola API 15min, gatomestre 15min, cedidos 10min, etc.)
    // Isso permite que cada clique em "Gerar" recalcule o ranking com patrimônio diferente

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

    // Criar listas de jogadores mencionados por nome (web + perplexity)
    // Armazenar como arrays para matching fuzzy (apelidos vs nomes completos)
    const nomesRecomendadosWeb = [];
    const nomesRiscoWeb = [];

    if (webScraper?.jogadoresMencionados) {
        for (const nome of webScraper.jogadoresMencionados) {
            nomesRecomendadosWeb.push(nome.toLowerCase());
        }
    }
    if (perplexity?.melhoresJogadores?.jogadores) {
        for (const j of perplexity.melhoresJogadores.jogadores) {
            nomesRecomendadosWeb.push(j.nome.toLowerCase());
        }
    }
    if (perplexity?.jogadoresDuvida?.jogadoresRisco) {
        for (const j of perplexity.jogadoresDuvida.jogadoresRisco) {
            nomesRiscoWeb.push(j.nome.toLowerCase());
        }
    }

    // Mapa de disponibilidade real (Perplexity) — array para matching fuzzy
    const listaDisponibilidadeReal = [];
    if (perplexity?.disponibilidadeReal?.jogadores) {
        for (const j of perplexity.disponibilidadeReal.jogadores) {
            if (j.nome) {
                listaDisponibilidadeReal.push({
                    nomeOriginal: j.nome.toLowerCase(),
                    status: j.status,
                    motivo: j.motivo || '',
                    fonte: j.fonte || '',
                    confianca: j.confianca || 0,
                });
            }
        }
    }

    /**
     * Matching fuzzy: verifica se o apelido do Cartola aparece em algum nome externo
     * ou se algum nome externo contém o apelido.
     * Ex: apelido "Veiga" matches "Raphael Veiga", "R. Veiga", "veiga"
     *     apelido "Gabigol" matches "Gabriel Barbosa (Gabigol)", "gabigol"
     * Exige match de pelo menos 4 chars para evitar falsos positivos.
     */
    function matchNomeFuzzy(apelidoNorm, listaNomes) {
        if (!apelidoNorm || apelidoNorm.length < 3) return false;
        for (const nomeExterno of listaNomes) {
            // Match exato
            if (nomeExterno === apelidoNorm) return true;
            // Apelido contido no nome externo (ex: "veiga" em "raphael veiga")
            if (apelidoNorm.length >= 4 && nomeExterno.includes(apelidoNorm)) return true;
            // Nome externo contido no apelido (ex: raro mas possível)
            if (nomeExterno.length >= 4 && apelidoNorm.includes(nomeExterno)) return true;
            // Match por última palavra (ex: "raphael veiga" → "veiga")
            const palavrasExterno = nomeExterno.split(/\s+/);
            const ultimaPalavra = palavrasExterno[palavrasExterno.length - 1];
            if (ultimaPalavra.length >= 4 && ultimaPalavra === apelidoNorm) return true;
        }
        return false;
    }

    function buscarDisponibilidadeRealFuzzy(apelidoNorm) {
        if (!apelidoNorm || apelidoNorm.length < 3) return null;
        for (const item of listaDisponibilidadeReal) {
            if (item.nomeOriginal === apelidoNorm) return item;
            if (apelidoNorm.length >= 4 && item.nomeOriginal.includes(apelidoNorm)) return item;
            if (item.nomeOriginal.length >= 4 && apelidoNorm.includes(item.nomeOriginal)) return item;
            const palavras = item.nomeOriginal.split(/\s+/);
            const ultima = palavras[palavras.length - 1];
            if (ultima.length >= 4 && ultima === apelidoNorm) return item;
        }
        return null;
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

            // Checar se mencionado na web (match fuzzy: apelido vs nome completo)
            const nomeNorm = (a.apelido || a.nome || '').toLowerCase();
            const mencionadoWeb = matchNomeFuzzy(nomeNorm, nomesRecomendadosWeb);
            const riscoWeb = matchNomeFuzzy(nomeNorm, nomesRiscoWeb);

            // Disponibilidade real (Perplexity) — match fuzzy
            const disponibilidadeReal = buscarDisponibilidadeRealFuzzy(nomeNorm);

            // Projecao do CartolaAnalitico
            const projecaoAnalitico = projecoesAnalitico[a.atleta_id] || null;

            // Contar fontes INDEPENDENTES que recomendam este jogador
            // Critérios discriminantes: cada fonte deve trazer info DIFERENCIAL
            let fontesConfirmam = 1; // Cartola API sempre conta (media > 0 = provável)
            // GatoMestre público: só conta se media contextual acima da media geral
            const gmPublico = a.gato_mestre;
            if (gmPublico) {
                const mediaGM = confronto.mandante ? (gmPublico.media_mandante || 0) : (gmPublico.media_visitante || 0);
                if (mediaGM > (a.media_num || 0) * 1.1) fontesConfirmam++; // >10% acima = diferencial
            }
            // GatoMestre Premium: dados autenticados recomendam este jogador
            const gmPremiumData = gatoMestre?.sugestoesMap?.[a.atleta_id];
            if (gmPremiumData?.recomendado) fontesConfirmam++;
            // Confronto favorável: adversário cede > 5 pts na posição (criterio alto)
            if (cedidoAdv > 5) fontesConfirmam++;
            // CartolaAnalitico: projeção significativa
            if (projecaoAnalitico?.projecao > 5) fontesConfirmam++;
            // Fontes web (blogs + Perplexity): mencionado como recomendação
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
                    gatoMestrePremium: gatoMestre?.sugestoesMap?.[a.atleta_id] || null,
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
    // Limpar caches das sub-fontes (cada uma tem NodeCache próprio)
    try { cartolaAnaliticoScraper.limparCache?.(); } catch { /* ignore */ }
    try { cartolaWebScraper.limparCache?.(); } catch { /* ignore */ }
    try { perplexityService.limparCache?.(); } catch { /* ignore */ }
    console.log(`${LOG_PREFIX} Cache limpo (aggregator + sub-fontes)`);
}

export default {
    agregarDados,
    buscarCartolaAPI,
    buscarGatoMestrePremium,
    buscarCedidosPorClube,
    buscarUltimoSnapshot,
    limparCache,
};
