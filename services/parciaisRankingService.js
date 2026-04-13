// services/parciaisRankingService.js
// ✅ v1.3: PERF-004 - Retry com backoff exponencial para 429 (rate limit)
// ✅ v1.2: Calcula ranking parcial em tempo real (rodada em andamento)
// v1.2: Usa CURRENT_SEASON + fallback liga.times quando liga.participantes ausente
import axios from "axios";
import NodeCache from "node-cache";
import Liga from "../models/Liga.js";
import Time from "../models/Time.js";
import mongoose from "mongoose";
import { CURRENT_SEASON } from "../config/seasons.js";
import { truncarPontosNum } from "../utils/type-helpers.js";
import scoutSnapshotService from "./scoutSnapshotService.js";

const LOG_PREFIX = "[PARCIAIS-RANKING-SERVICE]";
const CARTOLA_API_BASE = "https://api.cartola.globo.com";
const REQUEST_TIMEOUT = 10000;

// ✅ PERF-FIX: Cache centralizado — compartilhado por todos os consumidores (TTL 60s)
const parciaisCache = new NodeCache({ stdTTL: 60 });

// Config de retry para 429 (PERF-004)
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,  // 1s, 2s, 4s
};

// Headers padrão para API Cartola
const CARTOLA_HEADERS = {
    "User-Agent": "Super-Cartola-Manager/1.0.0",
    "Accept": "application/json",
};

/**
 * Retry com backoff exponencial - retenta em 429 e erros de rede
 * PERF-004: Resiliência durante picos (fechamento de mercado)
 */
async function retryComBackoff(requestFn, label = '') {
    for (let tentativa = 1; tentativa <= RETRY_CONFIG.maxRetries; tentativa++) {
        try {
            return await requestFn();
        } catch (error) {
            const status = error.response?.status;
            const isRetryable = status === 429 || !error.response; // 429 ou erro de rede

            if (!isRetryable || tentativa === RETRY_CONFIG.maxRetries) {
                throw error;
            }

            const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, tentativa - 1);
            console.warn(
                `${LOG_PREFIX} ⚠️ ${label} - Tentativa ${tentativa}/${RETRY_CONFIG.maxRetries} falhou` +
                `${status ? ` (HTTP ${status})` : ' (erro de rede)'}. Retry em ${delayMs}ms...`
            );
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

/**
 * Busca status do mercado para verificar se rodada está em andamento
 */
async function buscarStatusMercado() {
    try {
        const response = await retryComBackoff(
            () => axios.get(`${CARTOLA_API_BASE}/mercado/status`, {
                timeout: REQUEST_TIMEOUT,
                headers: CARTOLA_HEADERS,
            }),
            'buscarStatusMercado'
        );
        return response.data;
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao buscar status mercado:`, error.message);
        return null;
    }
}

/**
 * Busca atletas pontuados da rodada atual
 * ✅ FIX: Endpoint correto é /atletas/pontuados (SEM número da rodada)
 * ✅ v3.1: Retorna também partidas com data/hora dos jogos
 */
async function buscarAtletasPontuados() {
    try {
        const response = await retryComBackoff(
            () => axios.get(`${CARTOLA_API_BASE}/atletas/pontuados`, {
                timeout: REQUEST_TIMEOUT,
                headers: {
                    ...CARTOLA_HEADERS,
                    "Cache-Control": "no-cache",
                },
            }),
            'buscarAtletasPontuados'
        );
        return {
            atletas: response.data?.atletas || {},
            partidas: response.data?.partidas || {}
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao buscar atletas pontuados:`, error.message);
        return { atletas: {}, partidas: {} };
    }
}

/**
 * Busca escalação de um time em uma rodada específica
 */
async function buscarEscalacaoTime(timeId, rodada) {
    try {
        const response = await retryComBackoff(
            () => axios.get(`${CARTOLA_API_BASE}/time/id/${timeId}/${rodada}`, {
                timeout: REQUEST_TIMEOUT,
                headers: CARTOLA_HEADERS,
            }),
            `buscarEscalacaoTime(${timeId})`
        );
        return response.data;
    } catch (error) {
        // Time pode não ter escalado ainda
        return null;
    }
}

/**
 * Calcula pontuação de um time baseado na escalação e atletas pontuados.
 * ✅ v2.0: Lógica completa com reservas comuns + reserva de luxo
 *          (porta fiel de parciaisController.js::calcularPontuacao)
 */
function calcularPontuacaoTime(escalacao, atletasPontuados) {
    if (!escalacao || !escalacao.atletas || escalacao.atletas.length === 0) {
        return { pontos: 0, calculado: false, atletasEmCampo: 0, totalAtletas: 0 };
    }

    let pontosTotais = 0;
    let atletasEmCampo = 0;
    const capitaoId = escalacao.capitao_id;
    const reservaLuxoId = escalacao.reserva_luxo_id;
    const totalAtletas = escalacao.atletas?.length || 0;

    // ── FASE 1: Titulares ──
    const titularesProcessados = [];
    for (const atleta of escalacao.atletas) {
        const atletaId = atleta.atleta_id;
        const ap = atletasPontuados[atletaId];
        const pontuacao = ap?.pontuacao || 0;
        const entrouEmCampo = ap?.entrou_em_campo;
        // Conservador: só ausente quando confirmado false; null/undefined = jogo não iniciado
        const jogou = entrouEmCampo !== false || pontuacao !== 0;
        if (entrouEmCampo === true) atletasEmCampo++;

        const isCapitao = atletaId === capitaoId;
        const pontosEfetivos = isCapitao ? pontuacao * 1.5 : pontuacao;
        pontosTotais += pontosEfetivos;

        titularesProcessados.push({
            atleta_id: atletaId,
            posicao_id: atleta.posicao_id,
            pontos: pontuacao,
            pontos_efetivos: pontosEfetivos,
            entrou_em_campo: jogou,
            entrou_em_campo_real: entrouEmCampo === true,
            is_capitao: isCapitao,
        });
    }

    // ── FASE 2: Mapear ausentes por posição ──
    // Usa entrou_em_campo_real (=== true estrito): null/undefined → ausente para substituição.
    const ausentesPorPosicao = {};
    for (const t of titularesProcessados) {
        if (!t.entrou_em_campo_real) {
            if (!ausentesPorPosicao[t.posicao_id]) ausentesPorPosicao[t.posicao_id] = [];
            ausentesPorPosicao[t.posicao_id].push(t);
        }
    }

    // ── FASE 3: Reservas ──
    if (escalacao.reservas?.length) {
        // 3a. Reservas comuns (não-luxo)
        for (const atleta of escalacao.reservas) {
            if (atleta.atleta_id === reservaLuxoId) continue;

            const ap = atletasPontuados[atleta.atleta_id];
            const pontuacao = ap?.pontuacao || 0;
            const entrouEmCampo = ap?.entrou_em_campo;
            // Estrito para reservas: só entra quando confirmadamente jogou
            const jogou = entrouEmCampo === true || pontuacao !== 0;

            if (jogou && ausentesPorPosicao[atleta.posicao_id]?.length > 0) {
                ausentesPorPosicao[atleta.posicao_id].shift();
                pontosTotais += pontuacao;
                atletasEmCampo++;
            }
        }

        // 3b. Reserva de Luxo
        const luxoAtleta = escalacao.reservas.find(a => a.atleta_id === reservaLuxoId);
        if (luxoAtleta) {
            const ap = atletasPontuados[luxoAtleta.atleta_id];
            const pontuacao = ap?.pontuacao || 0;
            const entrouEmCampo = ap?.entrou_em_campo;
            const jogou = entrouEmCampo === true || pontuacao !== 0;

            // Cenário A: entra como reserva comum (titular ausente na posição)
            if (jogou && ausentesPorPosicao[luxoAtleta.posicao_id]?.length > 0) {
                ausentesPorPosicao[luxoAtleta.posicao_id].shift();
                pontosTotais += pontuacao;
                atletasEmCampo++;
            }
            // Cenário B: habilidade especial — substitui pior titular se pontuou mais
            else if (jogou) {
                const titularesDaPosicao = titularesProcessados.filter(
                    t => t.posicao_id === luxoAtleta.posicao_id &&
                         (t.pontos > 0 || atletasPontuados[t.atleta_id]?.entrou_em_campo === true)
                );
                if (titularesDaPosicao.length > 0) {
                    const piorTitular = titularesDaPosicao.reduce(
                        (pior, t) => (t.pontos < pior.pontos ? t : pior),
                        titularesDaPosicao[0]
                    );
                    if (pontuacao > piorTitular.pontos) {
                        pontosTotais -= piorTitular.pontos_efetivos;
                        const pontosLuxo = piorTitular.is_capitao ? pontuacao * 1.5 : pontuacao;
                        pontosTotais += pontosLuxo;
                    }
                }
            }
        }
    }

    return { pontos: pontosTotais, calculado: true, atletasEmCampo, totalAtletas };
}

/**
 * Busca ranking parcial de uma liga (rodada em andamento)
 * @param {string} ligaId - ID da liga
 * @returns {object|null} - Ranking parcial ou null se não disponível
 */
export async function buscarRankingParcial(ligaId) {
    // ✅ PERF-FIX: Cache centralizado — evita recalcular para cada consumidor
    const cacheKey = `parciais_${ligaId}`;
    const cached = parciaisCache.get(cacheKey);
    if (cached) {
        console.debug(`${LOG_PREFIX} Cache hit para liga ${ligaId}`);
        return cached;
    }

    console.debug(`${LOG_PREFIX} Buscando ranking parcial para liga ${ligaId}`);

    try {
        // 1. Verificar status do mercado
        const statusMercado = await buscarStatusMercado();

        if (!statusMercado) {
            console.warn(`${LOG_PREFIX} Não foi possível obter status do mercado`);
            return null;
        }

        const rodadaAtual = statusMercado.rodada_atual;
        const mercadoAberto = statusMercado.status_mercado === 1; // 1 = aberto, 2 = fechado

        console.debug(`${LOG_PREFIX} Status mercado - Rodada: ${rodadaAtual}, Status: ${statusMercado.status_mercado}`);

        // Se mercado aberto, não há parciais (rodada não iniciou)
        if (mercadoAberto) {
            console.debug(`${LOG_PREFIX} Mercado aberto - sem parciais disponíveis`);
            return {
                disponivel: false,
                motivo: "mercado_aberto",
                rodada: rodadaAtual,
                message: "O mercado está aberto. Aguarde o início da rodada para ver as parciais.",
            };
        }

        // 2. Buscar atletas pontuados + frozen scouts em paralelo
        const temporada = statusMercado.temporada || CURRENT_SEASON;
        const [dadosApi, scoutsFrozen] = await Promise.all([
            buscarAtletasPontuados(),
            scoutSnapshotService.buscarScoutsFrozen(rodadaAtual),
        ]);
        // Frozen tem prioridade: dados definitivos do banco sobrescrevem a API live
        const atletasPontuados = { ...dadosApi.atletas, ...scoutsFrozen };
        const partidasInfo = dadosApi.partidas;
        const numAtletasPontuados = Object.keys(atletasPontuados).length;
        const numFrozen = Object.keys(scoutsFrozen).length;

        console.debug(`${LOG_PREFIX} Atletas pontuados: ${numAtletasPontuados} (${numFrozen} frozen)`);
        console.debug(`${LOG_PREFIX} Partidas da rodada: ${Object.keys(partidasInfo).length}`);

        // Persistência assíncrona (não bloqueia resposta)
        if (Object.keys(dadosApi.atletas).length > 0) {
            scoutSnapshotService.salvarScouts(rodadaAtual, temporada, dadosApi.atletas).catch(() => {});
            scoutSnapshotService
                .detectarClubesCongelados(rodadaAtual, temporada)
                .then(clubes => scoutSnapshotService.congelarAtletasDeClubes(rodadaAtual, clubes))
                .catch(() => {});
        }

        if (numAtletasPontuados === 0) {
            console.debug(`${LOG_PREFIX} Nenhum atleta pontuado ainda`);
            return {
                disponivel: false,
                motivo: "sem_pontuacao",
                retry: true,
                rodada: rodadaAtual,
                message: "Aguardando os jogos começarem para computar os pontos.",
            };
        }

        // 3. Buscar liga e participantes
        const ligaObjectId = typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

        const liga = await Liga.findById(ligaObjectId).lean();

        if (!liga) {
            console.warn(`${LOG_PREFIX} Liga não encontrada: ${ligaId}`);
            return null;
        }

        // ✅ v1.2: Usar liga.participantes se disponível, senão fallback para liga.times
        let participantesAtivos;
        if (liga.participantes && liga.participantes.length > 0) {
            participantesAtivos = liga.participantes.filter(p => p.ativo !== false);
        } else if (liga.times && liga.times.length > 0) {
            // Fallback: buscar dados dos times pela collection Time
            const timesData = await Time.find({ id: { $in: liga.times }, ativo: { $ne: false } })
                .select("id nome_time nome_cartoleiro clube_id")
                .lean();
            participantesAtivos = timesData.map(t => ({
                time_id: t.id,
                nome_time: t.nome_time || "N/D",
                nome_cartola: t.nome_cartoleiro || "N/D",
                clube_id: t.clube_id || null,
            }));
        } else {
            console.warn(`${LOG_PREFIX} Liga sem participantes nem times: ${ligaId}`);
            return null;
        }

        console.debug(`${LOG_PREFIX} Processando ${participantesAtivos.length} participantes ativos`);

        // ✅ v1.2: Buscar pontos acumulados das rodadas anteriores (1 até rodadaAtual-1)
        const Rodada = (await import("../models/Rodada.js")).default;
        const pontosAcumulados = {};

        if (rodadaAtual > 1) {
            console.debug(`${LOG_PREFIX} Buscando pontos acumulados rodadas 1-${rodadaAtual - 1}`);
            const rodadasAnteriores = await Rodada.find({
                ligaId: ligaObjectId,
                temporada: CURRENT_SEASON,
                rodada: { $gte: 1, $lt: rodadaAtual },
            }).lean();

            // Agrupar por timeId e somar pontos
            rodadasAnteriores.forEach((registro) => {
                const pontos = registro.rodadaNaoJogada ? 0 : registro.pontos || 0;
                if (!pontosAcumulados[registro.timeId]) {
                    pontosAcumulados[registro.timeId] = 0;
                }
                pontosAcumulados[registro.timeId] += pontos;
            });

            console.debug(`${LOG_PREFIX} Pontos acumulados de ${Object.keys(pontosAcumulados).length} times`);
        }

        // 4. Buscar escalação e calcular pontos de cada time
        const resultados = [];

        // ✅ v1.4: Fallback DB — buscar dados da rodada atual já salvos localmente
        // Quando a API Cartola está em manutenção, usamos os dados do banco como fallback
        const fallbackRodadaMap = new Map();
        const rodadaAtualDB = await Rodada.find({
            ligaId: ligaObjectId,
            temporada: CURRENT_SEASON,
            rodada: rodadaAtual,
        }).lean();

        rodadaAtualDB.forEach((reg) => {
            fallbackRodadaMap.set(reg.timeId, reg);
        });

        if (fallbackRodadaMap.size > 0) {
            console.debug(`${LOG_PREFIX} Fallback DB: ${fallbackRodadaMap.size} registros da rodada ${rodadaAtual}`);
        }

        // Processar em lotes para não sobrecarregar a API
        // ✅ PERF-FIX: 5→10 paralelos (retry com backoff protege contra 429)
        const BATCH_SIZE = 10;
        for (let i = 0; i < participantesAtivos.length; i += BATCH_SIZE) {
            const batch = participantesAtivos.slice(i, i + BATCH_SIZE);

            const promessas = batch.map(async (participante) => {
                const escalacao = await buscarEscalacaoTime(participante.time_id, rodadaAtual);
                let pontos, calculado, atletasEmCampo, totalAtletas;

                if (escalacao) {
                    // API respondeu: calcular pontos via atletas pontuados
                    ({ pontos, calculado, atletasEmCampo, totalAtletas } = calcularPontuacaoTime(escalacao, atletasPontuados));
                } else {
                    // ✅ v1.4: API falhou — usar fallback do banco de dados
                    const fallback = fallbackRodadaMap.get(participante.time_id);
                    if (fallback && !fallback.rodadaNaoJogada) {
                        pontos = fallback.pontos || 0;
                        calculado = true;
                        console.debug(`${LOG_PREFIX} Fallback DB: time ${participante.time_id} = ${pontos} pts`);
                    } else {
                        pontos = 0;
                        calculado = false;
                    }
                    // Sem dados da API — frontend esconde indicador "X/12"
                    atletasEmCampo = null;
                    totalAtletas = null;
                }

                // ✅ v1.1: Somar com pontos acumulados das rodadas anteriores
                const pontosAnteriores = pontosAcumulados[participante.time_id] || 0;
                const pontosTotais = pontosAnteriores + pontos;

                // ✅ v1.4: clube_id com fallback encadeado: API > DB > Liga.participantes
                const fallbackDB = fallbackRodadaMap.get(participante.time_id);
                const clubeIdFinal = escalacao?.time?.time_id_do_coracao
                    || fallbackDB?.clube_id
                    || participante.clube_id;

                return {
                    timeId: participante.time_id,
                    nome_time: escalacao?.time?.nome || participante.nome_time || "N/D",
                    nome_cartola: escalacao?.time?.nome_cartola || participante.nome_cartola || "N/D",
                    escudo: escalacao?.time?.url_escudo_png || participante.foto_time || "",
                    clube_id: clubeIdFinal,
                    pontos: truncarPontosNum(pontosTotais), // ✅ Pontos totais (acumulado + parcial)
                    pontos_rodada_atual: truncarPontosNum(pontos), // Pontos apenas da rodada atual
                    pontos_acumulados: truncarPontosNum(pontosAnteriores), // Pontos das rodadas anteriores
                    escalou: calculado,
                    ativo: participante.ativo !== false,
                    atletasEmCampo: atletasEmCampo ?? null,
                    totalAtletas: totalAtletas ?? null,
                };
            });

            const resultadosBatch = await Promise.all(promessas);
            resultados.push(...resultadosBatch);

            // Pequeno delay entre batches
            if (i + BATCH_SIZE < participantesAtivos.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // 5. Ordenar por pontos e atribuir posições
        resultados.sort((a, b) => b.pontos - a.pontos);
        resultados.forEach((item, index) => {
            item.posicao = index + 1;
        });

        console.debug(`${LOG_PREFIX} Ranking parcial: ${resultados.length} times`);

        const resultado = {
            disponivel: true,
            rodada: rodadaAtual,
            status: "em_andamento",
            parcial: true,
            total_times: resultados.length,
            ranking: resultados,
            atualizado_em: new Date().toISOString(),
            message: `Parciais da Rodada ${rodadaAtual} (atualizado às ${new Date().toLocaleTimeString('pt-BR')})`,
        };

        // ✅ PERF-FIX: Cachear resultado para próximos consumidores
        parciaisCache.set(cacheKey, resultado);
        return resultado;

    } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Erro ao buscar ranking parcial:`, error);
        return null;
    }
}

/**
 * Invalida cache de parciais para uma liga (ou todas).
 * @param {string|null} ligaId - Se null, limpa todo o cache
 */
export function invalidarCacheParciais(ligaId) {
    if (ligaId) {
        parciaisCache.del(`parciais_${ligaId}`);
    } else {
        parciaisCache.flushAll();
    }
}

export default {
    buscarRankingParcial,
    buscarStatusMercado,
    invalidarCacheParciais,
};
