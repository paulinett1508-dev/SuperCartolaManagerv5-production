// controllers/pontosCorridosCacheController.js
// ✅ v3.0: Configuração dinâmica via ModuleConfig (sem hardcodes)
// ✅ v2.1: Enriquecimento de dados ao ler cache (fix undefined)
// ✅ v2.0: Integração com filtro de participantes inativos
import PontosCorridosCache from "../models/PontosCorridosCache.js";
import Liga from "../models/Liga.js";
import Rodada from "../models/Rodada.js";
import axios from "axios";
import {
    buscarStatusParticipantes,
    obterUltimaRodadaValida,
} from "../utils/participanteHelper.js";
import { buscarConfigSimplificada } from "../utils/moduleConfigHelper.js";
import { CURRENT_SEASON } from "../config/seasons.js";
import logger from '../utils/logger.js';
import { truncarPontosNum } from '../utils/type-helpers.js';

// ✅ v3.0: Função para buscar configuração dinâmica do módulo
async function buscarConfigPontosCorridos(ligaId, temporada = CURRENT_SEASON) {
    try {
        const config = await buscarConfigSimplificada(ligaId, 'pontos_corridos', temporada);
        logger.log(`[CACHE-PC] 📋 Config carregada: rodada ${config.rodadaInicial}, source: ${config.source}`);
        return config;
    } catch (error) {
        logger.error('[CACHE-PC] ❌ Erro ao buscar config, usando defaults:', error.message);
        // Fallback para defaults em caso de erro
        return {
            rodadaInicial: 7,
            turnos: 1,
            criterios: {
                empateTolerancia: 0.3,
                goleadaMinima: 50.0,
            },
            financeiro: {
                vitoria: 5.0,
                empate: 3.0,
                derrota: -5.0,
                goleada: 7.0,
            },
            pontuacao_tabela: {
                vitoria: 3,
                empate: 1,
                derrota: 0,
                bonus_goleada: 1
            },
            source: 'fallback',
            temporada
        };
    }
}

// ✅ v2.1: Função para buscar dados enriquecidos dos times
async function buscarDadosTimesEnriquecidos(ligaId) {
    try {
        // Buscar dados da liga
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) return {};

        const participantes = liga.participantes || [];
        const timesMap = {};

        // Mapear participantes
        participantes.forEach((p) => {
            const tid = String(p.time_id || p.timeId || p.id || p);
            if (tid && tid !== "undefined") {
                timesMap[tid] = {
                    nome: p.nome_time || p.nome || `Time ${tid}`,
                    nome_cartola: p.nome_cartola || "",
                    escudo: p.url_escudo_png || p.foto_time || p.escudo || "",
                };
            }
        });

        // Enriquecer com dados da collection Rodada (tem nome_cartola correto)
        try {
            const rodadas = await Rodada.find({ ligaId: ligaId })
                .sort({ rodada: -1 })
                .limit(100)
                .lean();

            rodadas.forEach((r) => {
                const tid = String(r.timeId);
                if (tid && timesMap[tid]) {
                    // Atualizar apenas se tiver dados melhores
                    if (r.nome_cartola && !timesMap[tid].nome_cartola) {
                        timesMap[tid].nome_cartola = r.nome_cartola;
                    }
                    if (
                        r.nome_time &&
                        (!timesMap[tid].nome ||
                            timesMap[tid].nome.startsWith("Time "))
                    ) {
                        timesMap[tid].nome = r.nome_time;
                    }
                } else if (tid) {
                    // Time não estava no mapa, adicionar
                    timesMap[tid] = {
                        nome: r.nome_time || `Time ${tid}`,
                        nome_cartola: r.nome_cartola || "",
                        escudo: r.foto_time || "",
                    };
                }
            });
        } catch (e) {
            logger.warn(
                "[CACHE-PC] ⚠️ Erro ao enriquecer com rodadas:",
                e.message,
            );
        }

        return timesMap;
    } catch (error) {
        logger.error("[CACHE-PC] ❌ Erro ao buscar dados dos times:", error);
        return {};
    }
}

// ✅ v2.1: Função para enriquecer classificação com dados corretos
function enriquecerClassificacao(classificacao, timesMap) {
    if (!Array.isArray(classificacao)) return [];

    return classificacao.map((t, idx) => {
        const tid = String(t.timeId || t.time_id || t.id);
        const dadosTime = timesMap[tid] || {};

        return {
            // IDs
            timeId: tid,
            time_id: tid,
            id: tid,
            posicao: t.posicao || idx + 1,

            // Nomes (com fallbacks robustos)
            nome: dadosTime.nome || t.nome || t.nome_time || `Time ${tid}`,
            nome_time: dadosTime.nome || t.nome || t.nome_time || `Time ${tid}`,
            nome_cartola:
                dadosTime.nome_cartola || t.nome_cartola || t.cartoleiro || "",

            // Visual
            escudo:
                dadosTime.escudo ||
                t.escudo ||
                t.url_escudo_png ||
                t.foto_time ||
                "",

            // Estatísticas (com fallbacks para 0)
            pontos: Number(t.pontos) || 0,
            jogos: Number(t.jogos) || 0,
            vitorias: Number(t.vitorias) || 0,
            empates: Number(t.empates) || 0,
            derrotas: Number(t.derrotas) || 0,
            pontosGoleada: Number(t.pontosGoleada) || 0,
            gols_pro: Number(t.gols_pro) || 0,
            gols_contra: Number(t.gols_contra) || 0,
            saldo_gols: Number(t.saldo_gols) || 0,
            financeiro: Number(t.financeiro) || 0,

            // Status
            ativo: t.ativo !== false,
            rodada_desistencia: t.rodada_desistencia || null,
        };
    });
}

// ✅ v2.1: Função para enriquecer confrontos
function enriquecerConfrontos(confrontos, timesMap) {
    if (!Array.isArray(confrontos)) return [];

    return confrontos.map((c) => {
        const tid1 = String(c.time1?.id || c.time1?.timeId || c.time1);
        const tid2 = String(c.time2?.id || c.time2?.timeId || c.time2);
        const dados1 = timesMap[tid1] || {};
        const dados2 = timesMap[tid2] || {};

        return {
            time1: {
                id: tid1,
                nome: dados1.nome || c.time1?.nome || `Time ${tid1}`,
                nome_cartola:
                    dados1.nome_cartola || c.time1?.nome_cartola || "",
                escudo: dados1.escudo || c.time1?.escudo || "",
                pontos: Number(c.time1?.pontos) || 0,
                ativo: c.time1?.ativo !== false,
            },
            time2: {
                id: tid2,
                nome: dados2.nome || c.time2?.nome || `Time ${tid2}`,
                nome_cartola:
                    dados2.nome_cartola || c.time2?.nome_cartola || "",
                escudo: dados2.escudo || c.time2?.escudo || "",
                pontos: Number(c.time2?.pontos) || 0,
                ativo: c.time2?.ativo !== false,
            },
            diferenca:
                c.diferenca ??
                (c.time1?.pontos != null && c.time2?.pontos != null
                    ? Math.abs(Number(c.time1.pontos) - Number(c.time2.pontos))
                    : null),
            valor: Number(c.valor) || 0,
            tipo: c.tipo || "pendente",
            pontos1: c.pontos1,
            pontos2: c.pontos2,
            financeiro1: c.financeiro1,
            financeiro2: c.financeiro2,
        };
    });
}

// ✅ SALVAR CACHE (CONFRONTOS + CLASSIFICAÇÃO)
export const salvarCachePontosCorridos = async (req, res) => {
    try {
        const { ligaId } = req.params;
        const { rodada, classificacao, confrontos, permanent } = req.body;

        if (!rodada) {
            return res.status(400).json({ error: "Rodada é obrigatória" });
        }

        if (!classificacao && !confrontos) {
            return res.status(400).json({
                error: "Dados incompletos (classificação ou confrontos)",
            });
        }

        const updateData = {
            cache_permanente: permanent || false,
            ultima_atualizacao: new Date(),
        };

        if (classificacao) updateData.classificacao = classificacao;
        if (confrontos) updateData.confrontos = confrontos;

        // ✅ AUDIT-FIX: Incluir temporada no filtro para segregação correta
        const temporada = req.body.temporada || CURRENT_SEASON;
        const result = await PontosCorridosCache.findOneAndUpdate(
            { liga_id: ligaId, rodada_consolidada: rodada, temporada: temporada },
            updateData,
            { new: true, upsert: true },
        );

        const tipoCache = permanent ? "PERMANENTE" : "temporário";
        logger.log(
            `[CACHE-PC] ✅ Cache ${tipoCache} salvo: Liga ${ligaId}, Rodada ${rodada}`,
        );

        res.json({
            success: true,
            permanent,
            id: result._id,
            confrontos: confrontos?.length || 0,
            classificacao: classificacao?.length || 0,
        });
    } catch (error) {
        logger.error("[CACHE-PC] ❌ Erro ao salvar:", error);
        res.status(500).json({ error: "Erro interno" });
    }
};

// ✅ v2.1: LER CACHE COM ENRIQUECIMENTO
export const lerCachePontosCorridos = async (req, res) => {
    try {
        const { ligaId } = req.params;
        const { rodada, temporada } = req.query;

        // ✅ AUDIT-FIX: Incluir temporada no filtro
        const query = { liga_id: ligaId };
        if (temporada) query.temporada = Number(temporada);
        if (rodada) query.rodada_consolidada = Number(rodada);

        const cache = await PontosCorridosCache.findOne(query).sort({
            rodada_consolidada: -1,
        }).lean();

        if (!cache) {
            return res.status(404).json({ cached: false });
        }

        // ✅ v2.1: Buscar dados enriquecidos dos times
        const timesMap = await buscarDadosTimesEnriquecidos(ligaId);
        logger.log(
            `[CACHE-PC] 📋 Dados de ${Object.keys(timesMap).length} times carregados para enriquecimento`,
        );

        // ✅ v2.1: Enriquecer classificação
        let classificacaoEnriquecida = enriquecerClassificacao(
            cache.classificacao || [],
            timesMap,
        );

        // Adicionar status de ativos/inativos
        if (classificacaoEnriquecida.length > 0) {
            const timeIds = classificacaoEnriquecida
                .map((t) => t.timeId)
                .filter(Boolean);

            if (timeIds.length > 0) {
                try {
                    const statusMap = await buscarStatusParticipantes(timeIds);

                    classificacaoEnriquecida = classificacaoEnriquecida.map(
                        (t) => {
                            const status = statusMap[t.timeId] || {
                                ativo: true,
                            };
                            return {
                                ...t,
                                ativo: status.ativo !== false,
                                rodada_desistencia:
                                    status.rodada_desistencia || null,
                            };
                        },
                    );
                } catch (statusError) {
                    logger.warn(
                        "[CACHE-PC] ⚠️ Erro ao buscar status:",
                        statusError.message,
                    );
                }
            }
        }

        // ✅ v2.1: Enriquecer confrontos
        const confrontosEnriquecidos = enriquecerConfrontos(
            cache.confrontos || [],
            timesMap,
        );

        logger.log(
            `[CACHE-PC] ✅ Cache R${cache.rodada_consolidada} enriquecido: ${classificacaoEnriquecida.length} times, ${confrontosEnriquecidos.length} confrontos`,
        );

        res.json({
            cached: true,
            rodada: cache.rodada_consolidada,
            confrontos: confrontosEnriquecidos,
            classificacao: classificacaoEnriquecida,
            permanent: cache.cache_permanente,
            updatedAt: cache.ultima_atualizacao,
        });
    } catch (error) {
        logger.error("[CACHE-PC] ❌ Erro ao ler:", error);
        res.status(500).json({ error: "Erro interno" });
    }
};

// ✅ OBTER TODAS AS RODADAS PARA O PARTICIPANTE (COM PARCIAIS AO VIVO)
export const obterConfrontosPontosCorridos = async (
    ligaId,
    temporada, // ✅ AUDIT-FIX: Temporada obrigatória (sem default)
    rodadaFiltro = null
) => {
    try {
        // ✅ AUDIT-FIX: Validar temporada obrigatória
        if (!temporada) {
            throw new Error('Parâmetro temporada é obrigatório');
        }

        logger.log(`[PONTOS-CORRIDOS] 📊 Buscando dados: Liga ${ligaId}, Temporada ${temporada}`);

        // 0. Buscar configuração do módulo
        const config = await buscarConfigPontosCorridos(ligaId, temporada);

        // 1. Buscar status do mercado
        let mercadoStatus = { rodada_atual: 37, status_mercado: 1 };
        try {
            const mercadoRes = await axios.get(
                "https://api.cartola.globo.com/mercado/status",
                {
                    timeout: 5000,
                },
            );
            mercadoStatus = mercadoRes.data;
        } catch (err) {
            logger.warn(
                "[PONTOS-CORRIDOS] ⚠️ Erro ao buscar mercado, usando padrão",
            );
        }

        const rodadaAtualBrasileirao = mercadoStatus.rodada_atual;
        const mercadoFechado = mercadoStatus.status_mercado === 2;
        const rodadaAtualLiga =
            rodadaAtualBrasileirao - config.rodadaInicial + 1;

        logger.log(
            `[PONTOS-CORRIDOS] 📊 Mercado: ${mercadoFechado ? "FECHADO" : "ABERTO"}, Rodada BR: ${rodadaAtualBrasileirao}, Rodada Liga: ${rodadaAtualLiga}`,
        );

        // ✅ v2.1: Buscar dados dos times para enriquecimento
        const timesMap = await buscarDadosTimesEnriquecidos(ligaId);

        // 2. Buscar rodadas consolidadas do cache
        // ✅ AUDIT-FIX: Filtrar por temporada para evitar mistura de dados entre temporadas
        const query = { liga_id: ligaId, temporada: temporada };
        if (rodadaFiltro) {
            query.rodada_consolidada = Number(rodadaFiltro);
        }

        const caches = await PontosCorridosCache.find(query)
            .sort({ rodada_consolidada: 1 })
            .lean();

        // ✅ v2.1: Estrutura completa por rodada COM ENRIQUECIMENTO
        let dadosPorRodada = caches.map((cache) => ({
            rodada: cache.rodada_consolidada,
            confrontos: enriquecerConfrontos(cache.confrontos || [], timesMap),
            classificacao: enriquecerClassificacao(
                cache.classificacao || [],
                timesMap,
            ),
            permanent: cache.cache_permanente,
            updatedAt: cache.ultima_atualizacao,
        }));

        // ✅ AUDIT-FIX: Se cache vazio, tentar reconstruir a partir das rodadas consolidadas
        if (dadosPorRodada.length === 0) {
            // Para temporadas passadas, sempre tentar reconstruir (rodadaAtualLiga pode ser negativo)
            // Para temporada atual, só reconstruir se já começou (rodadaAtualLiga > 0)
            const mercadoTemporada = mercadoStatus.temporada || CURRENT_SEASON;
            const isTemporadaPassada = temporada < mercadoTemporada;

            if (isTemporadaPassada || rodadaAtualLiga > 0) {
                logger.log(`[PONTOS-CORRIDOS] 🔄 Cache vazio - tentando reconstruir de rodadas históricas (T${temporada}, passada=${isTemporadaPassada})...`);
                dadosPorRodada = await reconstruirCacheDeRodadas(ligaId, temporada, config, timesMap);
            }
        } else if (!mercadoFechado && rodadaAtualLiga > 1) {
            // ✅ FIX: Cache parcialmente desatualizado — nova rodada consolidada pode não estar salva.
            // Ocorre quando a consolidação avança o mercado mas o admin não salvou o cache explicitamente.
            // Solução: se max(rodada no cache) < última rodada consolidada, reconstruir do zero.
            const ultimaRodadaNoCache = Math.max(...dadosPorRodada.map(r => r.rodada));
            const ultimaRodadaConsolidada = rodadaAtualLiga - 1;
            if (ultimaRodadaConsolidada > 0 && ultimaRodadaNoCache < ultimaRodadaConsolidada) {
                logger.log(`[PONTOS-CORRIDOS] 🔄 Cache desatualizado (R${ultimaRodadaNoCache} no cache, R${ultimaRodadaConsolidada} já consolidada) — reconstruindo rodadas faltantes...`);
                dadosPorRodada = await reconstruirCacheDeRodadas(ligaId, temporada, config, timesMap);
            }
        }

        // ✅ FIX: Atualizar caches permanentes com scores zerados usando dados reais da coleção rodadas.
        // Isso ocorre quando o admin pré-gerou todas as rodadas antes dos jogos serem disputados.
        if (dadosPorRodada.length > 0) {
            dadosPorRodada = await atualizarCachesComScoresReais(
                dadosPorRodada, ligaId, temporada, config, rodadaAtualBrasileirao, timesMap
            );
        }

        // 3. Se mercado fechado E rodada atual não está no cache (ou precisa atualização), calcular parciais ao vivo
        if (mercadoFechado && rodadaAtualLiga > 0) {
            const rodadaAtualNoCache = dadosPorRodada.find(
                (r) => r.rodada === rodadaAtualLiga,
            );
            const cacheDesatualizado =
                !rodadaAtualNoCache ||
                (rodadaAtualNoCache &&
                    !rodadaAtualNoCache.permanent &&
                    Date.now() -
                        new Date(rodadaAtualNoCache.updatedAt).getTime() >
                        60000);

            if (!rodadaAtualNoCache || cacheDesatualizado) {
                logger.log(
                    `[PONTOS-CORRIDOS] 🔥 Calculando rodada ${rodadaAtualLiga} com PARCIAIS AO VIVO...`,
                );

                const rodadaAoVivo = await calcularRodadaComParciais(
                    ligaId,
                    rodadaAtualLiga,
                    rodadaAtualBrasileirao,
                    dadosPorRodada,
                    config,
                    dadosPorRodada, // ✅ FIX: passa caches existentes para extração do bracket admin
                );

                if (rodadaAoVivo) {
                    const idx = dadosPorRodada.findIndex(
                        (r) => r.rodada === rodadaAtualLiga,
                    );
                    if (idx >= 0) {
                        dadosPorRodada[idx] = rodadaAoVivo;
                    } else {
                        dadosPorRodada.push(rodadaAoVivo);
                        dadosPorRodada.sort((a, b) => a.rodada - b.rodada);
                    }
                }
            }
        }

        logger.log(
            `[PONTOS-CORRIDOS] ✅ ${dadosPorRodada.length} rodadas carregadas: Liga ${ligaId}, Temporada ${temporada}`,
        );
        return dadosPorRodada;
    } catch (error) {
        logger.error(`[PONTOS-CORRIDOS] ❌ Erro ao obter dados (T${temporada}):`, error.message);
        return [];
    }
};

// 🔥 CALCULAR RODADA COM PARCIAIS AO VIVO
// ✅ FIX: Aceita dadosExistentes para extrair o bracket salvo pelo admin.
//         NUNCA gera confrontos independentes — usa o chaveamento do admin como verdade absoluta.
async function calcularRodadaComParciais(
    ligaId,
    rodadaLiga,
    rodadaBrasileirao,
    dadosAnteriores,
    config,
    dadosExistentes = [],
) {
    try {
        // 1. Buscar liga e times
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            logger.error("[PONTOS-CORRIDOS] ❌ Liga não encontrada");
            return null;
        }

        const times = liga.participantes || [];
        if (times.length === 0) {
            logger.error("[PONTOS-CORRIDOS] ❌ Nenhum time na liga");
            return null;
        }

        // ✅ v2.0: Buscar status de todos os times
        const statusMap = await buscarStatusParticipantes(times);
        logger.log(
            `[PONTOS-CORRIDOS] 📋 Status de ${times.length} times carregado`,
        );

        // ✅ FIX: Determinar chaveamento da rodada.
        // PRIORIDADE 1: Usar bracket extraído do cache salvo pelo admin (fonte da verdade absoluta).
        // PRIORIDADE 2: Fallback para liga.participantes APENAS se não há nenhum cache anterior.
        let jogosDaRodada;
        let listaIdsDoCache = extrairOrdemDoCache(dadosExistentes);

        // ✅ Detecção de divergência: participante adicionado após bracket gerado
        if (listaIdsDoCache) {
            const idsAtivos = new Set(times.filter(t => t.ativo !== false).map(t => String(t.time_id)));
            const idsDoBracket = new Set(listaIdsDoCache.map(String));
            const ausentes = [...idsAtivos].filter(id => !idsDoBracket.has(id));
            if (ausentes.length > 0) {
                logger.warn(`[PONTOS-CORRIDOS] ⚠️ BRACKET DESATUALIZADO: ${ausentes.length} participante(s) ativo(s) ausente(s) no bracket cacheado. IDs: [${ausentes.join(', ')}]. Forçando regeneração a partir de liga.participantes.`);
                listaIdsDoCache = null; // Invalida cache → fallback para gerarConfrontos
            }
        }

        if (listaIdsDoCache) {
            // ✅ Usa o bracket do admin — garante que os confrontos do app = confrontos do admin
            const bracket = gerarBracketFromIds(listaIdsDoCache);
            const rodadaBracket = bracket[rodadaLiga - 1];
            if (!rodadaBracket) {
                logger.warn(`[PONTOS-CORRIDOS] ⚠️ Rodada ${rodadaLiga} fora do bracket (${bracket.length} rodadas no cache)`);
                return null;
            }
            // Converter {timeAId, timeBId} para o formato esperado pelo restante da função
            jogosDaRodada = rodadaBracket.map(j => ({
                timeA: { time_id: j.timeAId, id: j.timeAId },
                timeB: { time_id: j.timeBId, id: j.timeBId },
            }));
            logger.log(`[PONTOS-CORRIDOS] ✅ Chaveamento R${rodadaLiga} extraído do cache admin (${jogosDaRodada.length} jogos)`);
        } else {
            // ⚠️ Fallback: nenhum cache disponível — gera a partir de liga.participantes
            // Isso só ocorre se o admin ainda não salvou nenhuma rodada
            logger.warn(`[PONTOS-CORRIDOS] ⚠️ Nenhum cache do admin disponível — usando liga.participantes como fallback para R${rodadaLiga}`);
            const confrontosBase = gerarConfrontos(times);
            jogosDaRodada = confrontosBase[rodadaLiga - 1];
        }

        if (!jogosDaRodada) {
            logger.warn(
                `[PONTOS-CORRIDOS] ⚠️ Rodada ${rodadaLiga} não existe nos confrontos`,
            );
            return null;
        }

        // 3. Buscar parciais ao vivo
        let parciaisMap = {};
        let timesDataMap = {};

        try {
            const parciaisRes = await axios.get(
                "https://api.cartola.globo.com/atletas/pontuados",
                {
                    timeout: 5000,
                },
            );
            const atletasPontuados = parciaisRes.data?.atletas || {};

            // Para cada time, buscar escalação e calcular pontuação
            for (const time of times) {
                const timeId =
                    typeof time === "object" ? time.time_id || time.id : time;

                // ✅ v2.0: Verificar se time está ativo
                const status = statusMap[String(timeId)] || { ativo: true };
                if (status.ativo === false) {
                    logger.log(
                        `⏭️ [PONTOS-CORRIDOS] Pulando time inativo: ${timeId}`,
                    );
                    timesDataMap[String(timeId)] = {
                        nome: `Time ${timeId}`,
                        nome_cartola: "",
                        escudo: "",
                        ativo: false,
                        rodada_desistencia: status.rodada_desistencia,
                    };
                    parciaisMap[String(timeId)] = 0;
                    continue;
                }

                try {
                    const escRes = await axios.get(
                        `https://api.cartola.globo.com/time/id/${timeId}/${rodadaBrasileirao}`,
                        { timeout: 5000 },
                    );

                    const timeData = escRes.data;
                    const atletas = timeData.atletas || [];

                    // Guardar dados do time
                    timesDataMap[String(timeId)] = {
                        nome: timeData.time?.nome || `Time ${timeId}`,
                        nome_cartola: timeData.time?.nome_cartola || "",
                        escudo: timeData.time?.url_escudo_png || "",
                        ativo: true,
                        rodada_desistencia: null,
                    };

                    // Calcular pontuação baseada nos atletas pontuados
                    let pontuacao = 0;
                    for (const atleta of atletas) {
                        const pontuado = atletasPontuados[atleta.atleta_id];
                        if (pontuado) {
                            pontuacao += pontuado.pontuacao || 0;
                        }
                    }

                    parciaisMap[String(timeId)] = pontuacao;
                } catch (err) {
                    parciaisMap[String(timeId)] = 0;
                    timesDataMap[String(timeId)] = {
                        nome: `Time ${timeId}`,
                        nome_cartola: "",
                        escudo: "",
                        ativo: true,
                    };
                }
            }
        } catch (err) {
            logger.warn("[PONTOS-CORRIDOS] ⚠️ Erro ao buscar parciais");
        }

        // 4. Montar confrontos com resultados
        const confrontos = [];
        for (const jogo of jogosDaRodada) {
            const tid1 = String(typeof jogo.timeA === 'object' ? jogo.timeA.time_id || jogo.timeA.id || jogo.timeA._id : jogo.timeA);
            const tid2 = String(typeof jogo.timeB === 'object' ? jogo.timeB.time_id || jogo.timeB.id || jogo.timeB._id : jogo.timeB);
            const p1 = parciaisMap[tid1] || 0;
            const p2 = parciaisMap[tid2] || 0;
            const resultado = calcularResultado(p1, p2, config);

            // ✅ v2.0: Incluir status nos confrontos
            const status1 = statusMap[tid1] || { ativo: true };
            const status2 = statusMap[tid2] || { ativo: true };

            confrontos.push({
                time1: {
                    id: tid1,
                    nome: timesDataMap[tid1]?.nome || `Time ${tid1}`,
                    nome_cartola: timesDataMap[tid1]?.nome_cartola || "",
                    escudo: timesDataMap[tid1]?.escudo || "",
                    pontos: truncarPontosNum(p1),
                    ativo: status1.ativo !== false,
                },
                time2: {
                    id: tid2,
                    nome: timesDataMap[tid2]?.nome || `Time ${tid2}`,
                    nome_cartola: timesDataMap[tid2]?.nome_cartola || "",
                    escudo: timesDataMap[tid2]?.escudo || "",
                    pontos: truncarPontosNum(p2),
                    ativo: status2.ativo !== false,
                },
                pontos1: resultado.pontosA,
                pontos2: resultado.pontosB,
                financeiro1: Math.round(resultado.financeiroA, 0),
                financeiro2: Math.round(resultado.financeiroB, 0),
                tipo: resultado.tipo,
            });
        }

        // 5. Calcular classificação acumulada
        const classificacao = calcularClassificacaoAcumulada(
            times,
            timesDataMap,
            dadosAnteriores,
            confrontos,
            rodadaLiga,
            statusMap,
            config,
        );

        return {
            rodada: rodadaLiga,
            confrontos,
            classificacao,
            permanent: false,
            updatedAt: new Date(),
            aoVivo: true,
        };
    } catch (error) {
        logger.error(
            "[PONTOS-CORRIDOS] ❌ Erro ao calcular rodada ao vivo:",
            error,
        );
        return null;
    }
}

// ✅ AUDIT-FIX: Reconstruir cache a partir das rodadas históricas (collection rodadas)
async function reconstruirCacheDeRodadas(ligaId, temporada, config, timesMap) {
    try {
        // Buscar liga e times
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) return [];

        const times = liga.participantes || [];
        if (times.length === 0) return [];

        // Buscar rodadas históricas desta liga/temporada
        const rodadasHistoricas = await Rodada.find({
            ligaId: ligaId,
            temporada: temporada
        }).lean();

        if (rodadasHistoricas.length === 0) {
            logger.log(`[PONTOS-CORRIDOS] ℹ️ Nenhuma rodada histórica encontrada para T${temporada}`);
            return [];
        }

        // Agrupar por rodada brasileirão
        const porRodadaBR = {};
        rodadasHistoricas.forEach(r => {
            if (!porRodadaBR[r.rodada]) porRodadaBR[r.rodada] = [];
            porRodadaBR[r.rodada].push(r);
        });

        // Converter rodadas BR para rodadas da liga
        const rodadasBR = Object.keys(porRodadaBR).map(Number).sort((a, b) => a - b);
        const rodadasLiga = rodadasBR
            .filter(br => br >= config.rodadaInicial)
            .map(br => ({ br, liga: br - config.rodadaInicial + 1 }));

        if (rodadasLiga.length === 0) {
            logger.log(`[PONTOS-CORRIDOS] ℹ️ Nenhuma rodada após rodadaInicial ${config.rodadaInicial}`);
            return [];
        }

        logger.log(`[PONTOS-CORRIDOS] 🔄 Reconstruindo ${rodadasLiga.length} rodadas de dados históricos...`);

        // ✅ FIX: Verificar se já existe algum cache de outra temporada ou do mesmo que
        //          o admin tenha gerado anteriormente. Se sim, extrai ordem canônica.
        //          Se não (liga completamente nova), ordena times por ID para ser determinístico.
        const cachesExistentes = await PontosCorridosCache.find({ liga_id: ligaId })
            .sort({ rodada_consolidada: 1 })
            .lean();

        let listaIdsDoCache = extrairOrdemDoCache(
            cachesExistentes.map(c => ({ rodada: c.rodada_consolidada, confrontos: c.confrontos }))
        );

        // ✅ Detecção de divergência: participante adicionado após bracket gerado
        if (listaIdsDoCache) {
            const idsAtivos = new Set(times.filter(t => t.ativo !== false).map(t => String(t.time_id)));
            const idsDoBracket = new Set(listaIdsDoCache.map(String));
            const ausentes = [...idsAtivos].filter(id => !idsDoBracket.has(id));
            if (ausentes.length > 0) {
                logger.warn(`[PONTOS-CORRIDOS] ⚠️ BRACKET DESATUALIZADO (reconstrução): ${ausentes.length} participante(s) ausente(s). IDs: [${ausentes.join(', ')}]. Forçando regeneração.`);
                listaIdsDoCache = null;
            }
        }

        let confrontosBase;
        if (listaIdsDoCache) {
            // Usa a ordem estabelecida pelo admin
            logger.log(`[PONTOS-CORRIDOS] ✅ Usando bracket do admin para reconstrução`);
            confrontosBase = gerarBracketFromIds(listaIdsDoCache).map(rodada =>
                rodada.map(j => ({
                    timeA: { time_id: j.timeAId, id: j.timeAId },
                    timeB: { time_id: j.timeBId, id: j.timeBId },
                }))
            );
        } else {
            // Liga nova sem histórico: ordena por ID para garantir determinismo
            const timesOrdenados = [...times].sort((a, b) => {
                const idA = Number(a.time_id || a.id || 0);
                const idB = Number(b.time_id || b.id || 0);
                return idA - idB;
            });
            logger.log(`[PONTOS-CORRIDOS] ℹ️ Sem cache do admin — usando liga.participantes ordenado por ID`);
            confrontosBase = gerarConfrontos(timesOrdenados);
        }

        // Buscar status dos participantes
        const statusMap = await buscarStatusParticipantes(times);

        // Construir dados por rodada sequencialmente (cada uma depende da anterior)
        const dadosPorRodada = [];

        for (const { br, liga: rodadaLiga } of rodadasLiga) {
            const jogosRodada = confrontosBase[rodadaLiga - 1];
            if (!jogosRodada) continue;

            // Montar mapa de pontos a partir da collection rodadas
            const pontosRodada = {};
            const timesDataMap = {};

            (porRodadaBR[br] || []).forEach(r => {
                const tid = String(r.timeId);
                pontosRodada[tid] = r.pontos || 0;
                timesDataMap[tid] = {
                    nome: r.nome_time || `Time ${tid}`,
                    nome_cartola: r.nome_cartola || '',
                    escudo: r.escudo || '',
                    ativo: true,
                };
            });

            // Montar confrontos com resultados
            const confrontos = [];
            for (const jogo of jogosRodada) {
                const tid1 = String(typeof jogo.timeA === 'object' ? jogo.timeA.time_id || jogo.timeA.id : jogo.timeA);
                const tid2 = String(typeof jogo.timeB === 'object' ? jogo.timeB.time_id || jogo.timeB.id : jogo.timeB);
                const p1 = pontosRodada[tid1] || 0;
                const p2 = pontosRodada[tid2] || 0;
                const resultado = calcularResultado(p1, p2, config);

                confrontos.push({
                    time1: {
                        id: tid1,
                        nome: timesDataMap[tid1]?.nome || timesMap[tid1]?.nome || `Time ${tid1}`,
                        nome_cartola: timesDataMap[tid1]?.nome_cartola || timesMap[tid1]?.nome_cartola || '',
                        escudo: timesDataMap[tid1]?.escudo || timesMap[tid1]?.escudo || '',
                        pontos: truncarPontosNum(p1),
                        ativo: true,
                    },
                    time2: {
                        id: tid2,
                        nome: timesDataMap[tid2]?.nome || timesMap[tid2]?.nome || `Time ${tid2}`,
                        nome_cartola: timesDataMap[tid2]?.nome_cartola || timesMap[tid2]?.nome_cartola || '',
                        escudo: timesDataMap[tid2]?.escudo || timesMap[tid2]?.escudo || '',
                        pontos: truncarPontosNum(p2),
                        ativo: true,
                    },
                    pontos1: resultado.pontosA,
                    pontos2: resultado.pontosB,
                    financeiro1: Math.round(resultado.financeiroA),
                    financeiro2: Math.round(resultado.financeiroB),
                    tipo: resultado.tipo,
                });
            }

            // Calcular classificação acumulada
            const classificacao = calcularClassificacaoAcumulada(
                times,
                { ...timesMap, ...timesDataMap },
                dadosPorRodada,
                confrontos,
                rodadaLiga,
                statusMap,
                config,
            );

            const rodadaData = {
                rodada: rodadaLiga,
                confrontos,
                classificacao,
                permanent: true,
                updatedAt: new Date(),
            };

            dadosPorRodada.push(rodadaData);

            // Salvar no MongoDB para futuras consultas
            try {
                await PontosCorridosCache.findOneAndUpdate(
                    { liga_id: ligaId, rodada_consolidada: rodadaLiga, temporada: temporada },
                    {
                        confrontos: confrontos,
                        classificacao: classificacao,
                        cache_permanente: true,
                        ultima_atualizacao: new Date(),
                        temporada: temporada,
                    },
                    { upsert: true, new: true }
                );
            } catch (saveErr) {
                logger.warn(`[PONTOS-CORRIDOS] ⚠️ Erro ao salvar cache rodada ${rodadaLiga}:`, saveErr.message);
            }
        }

        logger.log(`[PONTOS-CORRIDOS] ✅ Cache reconstruído: ${dadosPorRodada.length} rodadas salvas (T${temporada})`);
        return dadosPorRodada;
    } catch (error) {
        logger.error('[PONTOS-CORRIDOS] ❌ Erro ao reconstruir cache:', error.message);
        return [];
    }
}

// ✅ FIX: Detecta caches permanentes com scores zerados e os atualiza com dados reais da coleção rodadas.
// Isso ocorre quando o admin pré-gerou rodadas antes dos jogos serem disputados.
// A função preserva o bracket do admin (quem joga contra quem) e só preenche os scores.
async function atualizarCachesComScoresReais(dadosPorRodada, ligaId, temporada, config, rodadaAtualBrasileirao, timesMap) {
    const resultado = [...dadosPorRodada];
    let houveAtualizacao = false;

    for (let i = 0; i < resultado.length; i++) {
        const d = resultado[i];

        // Só processar caches permanentes
        if (!d.permanent) continue;

        // Calcular rodada BR correspondente
        const rodadaBR = d.rodada + config.rodadaInicial - 1;

        // Só atualizar se a rodada BR não é futura (permite corrigir inclusive a rodada atual)
        if (rodadaBR > rodadaAtualBrasileirao) continue;

        // Buscar scores reais da coleção rodadas para esta rodada BR
        // (verifica divergência mesmo quando os scores no cache são não-zero)
        let rodadasBR;
        try {
            rodadasBR = await Rodada.find({
                ligaId: ligaId,
                temporada: temporada,
                rodada: rodadaBR
            }).lean();
        } catch (e) {
            logger.warn(`[PONTOS-CORRIDOS] ⚠️ Erro ao buscar Rodada BR ${rodadaBR}:`, e.message);
            continue;
        }

        if (!rodadasBR || rodadasBR.length === 0) continue;

        // Verificar se existem scores não-zero na fonte
        const temScoresReais = rodadasBR.some(r => (r.pontos || 0) > 0);
        if (!temScoresReais) continue;

        // Mapear scores por timeId
        const scoresMap = {};
        rodadasBR.forEach(r => {
            scoresMap[String(r.timeId)] = r.pontos || 0;
        });

        // Verificar divergência: scores zerados OU scores de rodada errada
        const temDivergencia = (d.confrontos || []).some(c => {
            const tid1 = String(c.time1?.id || c.time1?.timeId || '');
            const tid2 = String(c.time2?.id || c.time2?.timeId || '');
            const p1Real = scoresMap[tid1] != null ? truncarPontosNum(scoresMap[tid1]) : null;
            const p2Real = scoresMap[tid2] != null ? truncarPontosNum(scoresMap[tid2]) : null;
            return (p1Real != null && p1Real !== (Number(c.time1?.pontos) || 0)) ||
                   (p2Real != null && p2Real !== (Number(c.time2?.pontos) || 0));
        });
        if (!temDivergencia) continue;

        // Atualizar confrontos: substituir qualquer score divergente do valor real
        const confrontosAtualizados = d.confrontos.map(c => {
            const tid1 = String(c.time1?.id || c.time1?.timeId || '');
            const tid2 = String(c.time2?.id || c.time2?.timeId || '');
            const p1Atual = Number(c.time1?.pontos) || 0;
            const p2Atual = Number(c.time2?.pontos) || 0;

            // Usar score real se disponível; preservar apenas se não há dado na fonte
            const novoP1 = scoresMap[tid1] != null ? scoresMap[tid1] : p1Atual;
            const novoP2 = scoresMap[tid2] != null ? scoresMap[tid2] : p2Atual;

            if (novoP1 === p1Atual && novoP2 === p2Atual) return c;

            const res = calcularResultado(novoP1, novoP2, config);
            return {
                ...c,
                time1: { ...c.time1, pontos: truncarPontosNum(novoP1) },
                time2: { ...c.time2, pontos: truncarPontosNum(novoP2) },
                pontos1: res.pontosA,
                pontos2: res.pontosB,
                financeiro1: Math.round(res.financeiroA),
                financeiro2: Math.round(res.financeiroB),
                tipo: res.tipo,
            };
        });

        // Verificar se houve mudanças reais
        const houveMudanca = confrontosAtualizados.some((c, idx) =>
            Number(c.time1?.pontos) !== Number(d.confrontos[idx]?.time1?.pontos) ||
            Number(c.time2?.pontos) !== Number(d.confrontos[idx]?.time2?.pontos)
        );
        if (!houveMudanca) continue;

        logger.log(`[PONTOS-CORRIDOS] 🔄 Atualizando cache permanente R${d.rodada} (BR R${rodadaBR}) — scores divergentes detectados, corrigindo com dados reais (${rodadasBR.length} times encontrados)`);

        // Recalcular classificação acumulada com os novos scores
        const liga = await Liga.findById(ligaId).lean();
        const times = liga?.participantes || [];
        const statusMap = await buscarStatusParticipantes(times);

        const classificacaoNova = calcularClassificacaoAcumulada(
            times,
            timesMap,
            resultado.slice(0, i), // rodadas anteriores já processadas (correta sequência)
            confrontosAtualizados,
            d.rodada,
            statusMap,
            config,
        );

        // Atualizar in-memory
        resultado[i] = {
            ...d,
            confrontos: confrontosAtualizados,
            classificacao: classificacaoNova,
            updatedAt: new Date(),
        };

        houveAtualizacao = true;

        // Persistir no MongoDB para que próximas requisições sirvam dados corretos
        try {
            await PontosCorridosCache.findOneAndUpdate(
                { liga_id: ligaId, rodada_consolidada: d.rodada, temporada: temporada },
                { $set: {
                    confrontos: confrontosAtualizados,
                    classificacao: classificacaoNova,
                    ultima_atualizacao: new Date(),
                }}
            );
            logger.log(`[PONTOS-CORRIDOS] ✅ Cache permanente R${d.rodada} atualizado com scores reais no MongoDB`);
        } catch (saveErr) {
            logger.warn(`[PONTOS-CORRIDOS] ⚠️ Erro ao salvar cache atualizado R${d.rodada}:`, saveErr.message);
        }
    }

    if (houveAtualizacao) {
        logger.log(`[PONTOS-CORRIDOS] ✅ Scores divergentes em caches permanentes foram corrigidos com dados reais da coleção rodadas`);
    }

    return resultado;
}

// ✅ FIX: Extrai a ordem original dos times a partir dos confrontos da rodada MAIS RECENTE salva pelo admin.
//
// ESTRATÉGIA: usa a rodada mais recente (não necessariamente rodada 1) porque:
//   - Times podem entrar/sair da liga entre rodadas
//   - A rodada mais recente reflete a composição atual da liga
//   - Rodadas futuras (ao vivo) devem usar o mesmo conjunto de times
//
// MATEMÁTICA do round-robin:
//   Para QUALQUER rodada R, a posição do bracket é:
//     lista_R[i] = time1[i], lista_R[n-1-i] = time2[i]
//   Para recuperar a lista ORIGINAL (rodada 1), aplica-se R-1 rotações reversas:
//     Rotação direta:  lista.splice(1, 0, lista.pop())  ← [a,b,c,d,e] → [a,e,b,c,d]
//     Rotação reversa: x = lista.splice(1,1)[0]; lista.push(x) ← [a,e,b,c,d] → [a,b,c,d,e]
//
function extrairOrdemDoCache(caches) {
    if (!caches || caches.length === 0) return null;

    // Usar a rodada MAIS RECENTE com confrontos (reflete composição atual da liga)
    const cacheBase = [...caches]
        .sort((a, b) => b.rodada - a.rodada) // decrescente → mais recente primeiro
        .find(c => c.confrontos?.length > 0);

    if (!cacheBase) {
        logger.warn('[CACHE-PC] ⚠️ extrairOrdemDoCache: Nenhum cache com confrontos encontrado.');
        return null;
    }

    const rodadaNum = cacheBase.rodada;
    const confrontos = cacheBase.confrontos;
    const n = confrontos.length * 2;

    // Passo 1: reconstruir a lista na posição da rodada R
    const listaRodada = new Array(n);
    for (let i = 0; i < confrontos.length; i++) {
        listaRodada[i] = String(confrontos[i].time1?.id || confrontos[i].time1);
        listaRodada[n - 1 - i] = String(confrontos[i].time2?.id || confrontos[i].time2);
    }

    // Passo 2: desfazer (R-1) rotações para obter a lista original
    const lista = [...listaRodada];
    for (let r = 0; r < rodadaNum - 1; r++) {
        const x = lista.splice(1, 1)[0]; // remove da posição 1
        lista.push(x);                   // envia para o final
    }

    logger.log(`[CACHE-PC] 📐 Ordem canônica extraída da Rodada ${rodadaNum} (admin): ${lista.length} times`);
    return lista;
}

// ✅ FIX: Gera bracket completo usando apenas IDs (sem objetos completos de time).
// Algoritmo idêntico ao gerarConfrontos, mas trabalha com IDs simples.
function gerarBracketFromIds(listaIds) {
    const rodadas = [];
    const lista = [...listaIds];
    if (lista.length % 2 !== 0) lista.push(null);

    const total = lista.length - 1;
    for (let rodada = 0; rodada < total; rodada++) {
        const jogos = [];
        for (let i = 0; i < lista.length / 2; i++) {
            const tidA = lista[i];
            const tidB = lista[lista.length - 1 - i];
            if (tidA && tidB) jogos.push({ timeAId: tidA, timeBId: tidB });
        }
        rodadas.push(jogos);
        lista.splice(1, 0, lista.pop());
    }
    return rodadas;
}

// Gerar confrontos round-robin
function gerarConfrontos(times) {
    const n = times.length;
    const rodadas = [];
    const lista = [...times];
    if (n % 2 !== 0) lista.push(null);

    const total = lista.length - 1;
    for (let rodada = 0; rodada < total; rodada++) {
        const jogos = [];
        for (let i = 0; i < lista.length / 2; i++) {
            const timeA = lista[i];
            const timeB = lista[lista.length - 1 - i];
            if (timeA && timeB) jogos.push({ timeA, timeB });
        }
        rodadas.push(jogos);
        lista.splice(1, 0, lista.pop());
    }
    return rodadas;
}

// Calcular resultado do confronto
function calcularResultado(pontosA, pontosB, config) {
    const diferenca = Math.abs(pontosA - pontosB);
    const { empateTolerancia, goleadaMinima } = config.criterios;
    const fin = config.financeiro;
    const bonusPontos = config.pontuacao_tabela?.bonus_goleada || 1;

    if (diferenca <= empateTolerancia) {
        return {
            financeiroA: fin.empate,
            financeiroB: fin.empate,
            pontosA: 1,
            pontosB: 1,
            tipo: "empate",
        };
    }

    if (diferenca >= goleadaMinima) {
        const pontosVitoria = 3 + bonusPontos; // 3 pts vitória + bônus goleada
        return pontosA > pontosB
            ? {
                  financeiroA: fin.goleada,
                  financeiroB: -fin.goleada,
                  pontosA: pontosVitoria,
                  pontosB: 0,
                  tipo: "goleada",
              }
            : {
                  financeiroA: -fin.goleada,
                  financeiroB: fin.goleada,
                  pontosA: 0,
                  pontosB: pontosVitoria,
                  tipo: "goleada",
              };
    }

    return pontosA > pontosB
        ? {
              financeiroA: fin.vitoria,
              financeiroB: -fin.vitoria,
              pontosA: 3,
              pontosB: 0,
              tipo: "vitoria",
          }
        : {
              financeiroA: -fin.vitoria,
              financeiroB: fin.vitoria,
              pontosA: 0,
              pontosB: 3,
              tipo: "vitoria",
          };
}

// ✅ v2.0: Calcular classificação acumulada COM STATUS
function calcularClassificacaoAcumulada(
    times,
    timesDataMap,
    dadosAnteriores,
    confrontosRodadaAtual,
    rodadaAtual,
    statusMap = {},
    config,
) {
    // Inicializar classificação
    const classificacao = {};
    times.forEach((time) => {
        const tid = String(
            typeof time === "object"
                ? time.time_id || time.timeId || time.id || time._id
                : time,
        );

        if (!tid || tid === "undefined") return;

        const dadosTime = timesDataMap[tid] || {};
        const status = statusMap[tid] || { ativo: true };

        classificacao[tid] = {
            timeId: tid,
            nome: dadosTime.nome || `Time ${tid}`,
            nome_cartola: dadosTime.nome_cartola || "",
            escudo: dadosTime.escudo || "",
            pontos: 0,
            jogos: 0,
            vitorias: 0,
            empates: 0,
            derrotas: 0,
            pontosGoleada: 0,
            gols_pro: 0,
            gols_contra: 0,
            saldo_gols: 0,
            financeiro: 0,
            ativo: status.ativo !== false,
            rodada_desistencia: status.rodada_desistencia || null,
        };
    });

    // ✅ FIX: Carregar classificação da ÚLTIMA rodada disponível anterior
    // (não necessariamente rodadaAtual - 1, pois pode não haver cache sequencial)
    const rodadasAnteriores = dadosAnteriores
        .filter((r) => r.rodada < rodadaAtual)
        .sort((a, b) => b.rodada - a.rodada); // Ordenar decrescente

    const rodadaAnterior = rodadasAnteriores[0]; // Pega a última disponível

    if (rodadaAnterior?.classificacao) {
        logger.log(`[CACHE-PC] 📊 Carregando classificação acumulada da rodada ${rodadaAnterior.rodada} para calcular rodada ${rodadaAtual}`);
        rodadaAnterior.classificacao.forEach((t) => {
            const tid = String(t.timeId || t.time_id || t.id);
            if (tid && classificacao[tid]) {
                Object.assign(classificacao[tid], {
                    pontos: Number(t.pontos) || 0,
                    jogos: Number(t.jogos) || 0,
                    vitorias: Number(t.vitorias) || 0,
                    empates: Number(t.empates) || 0,
                    derrotas: Number(t.derrotas) || 0,
                    pontosGoleada: Number(t.pontosGoleada) || 0,
                    gols_pro: Number(t.gols_pro) || 0,
                    gols_contra: Number(t.gols_contra) || 0,
                    saldo_gols: Number(t.saldo_gols) || 0,
                    financeiro: Number(t.financeiro) || 0,
                });
            }
        });
    } else {
        logger.log(`[CACHE-PC] ℹ️ Nenhuma rodada anterior encontrada para rodada ${rodadaAtual}, iniciando do zero`);
    }

    // Processar confrontos da rodada atual
    for (const confronto of confrontosRodadaAtual) {
        const tid1 = String(confronto.time1.id);
        const tid2 = String(confronto.time2.id);
        const p1 = Number(confronto.time1.pontos) || 0;
        const p2 = Number(confronto.time2.pontos) || 0;

        const resultado = calcularResultado(p1, p2, config);

        // Time 1
        if (classificacao[tid1]) {
            classificacao[tid1].jogos += 1;
            classificacao[tid1].pontos += resultado.pontosA;
            classificacao[tid1].gols_pro += p1;
            classificacao[tid1].gols_contra += p2;
            classificacao[tid1].saldo_gols =
                classificacao[tid1].gols_pro - classificacao[tid1].gols_contra;
            classificacao[tid1].financeiro += resultado.financeiroA;
            if (resultado.pontosA >= 3) {
                // Vitória (pode ser 3 ou 3+bonus)
                classificacao[tid1].vitorias += 1;
                if (resultado.tipo === "goleada") {
                    classificacao[tid1].pontosGoleada += 1;
                }
            } else if (resultado.pontosA === 1) {
                classificacao[tid1].empates += 1;
            } else {
                classificacao[tid1].derrotas += 1;
            }
        }

        // Time 2
        if (classificacao[tid2]) {
            classificacao[tid2].jogos += 1;
            classificacao[tid2].pontos += resultado.pontosB;
            classificacao[tid2].gols_pro += p2;
            classificacao[tid2].gols_contra += p1;
            classificacao[tid2].saldo_gols =
                classificacao[tid2].gols_pro - classificacao[tid2].gols_contra;
            classificacao[tid2].financeiro += resultado.financeiroB;
            if (resultado.pontosB >= 3) {
                // Vitória (pode ser 3 ou 3+bonus)
                classificacao[tid2].vitorias += 1;
                if (resultado.tipo === "goleada") {
                    classificacao[tid2].pontosGoleada += 1;
                }
            } else if (resultado.pontosB === 1) {
                classificacao[tid2].empates += 1;
            } else {
                classificacao[tid2].derrotas += 1;
            }
        }
    }

    // ✅ v2.0: Ordenar com ativos primeiro, depois inativos
    const todos = Object.values(classificacao);
    const ativos = todos.filter((t) => t.ativo !== false);
    const inativos = todos.filter((t) => t.ativo === false);

    const sortFn = (a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;                // 1º: Pts tabela
        if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro;        // 2º: Pts Ranking Geral
        if (b.saldo_gols !== a.saldo_gols) return b.saldo_gols - a.saldo_gols; // 3º: Saldo
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;        // 4º: Vitórias
        return b.pontosGoleada - a.pontosGoleada;                              // 5º: Pts Goleada
    };

    ativos.sort(sortFn);
    inativos.sort(sortFn);

    // Ativos primeiro, depois inativos
    const resultado = [...ativos, ...inativos];

    return resultado.map((t, idx) => ({
        ...t,
        posicao: t.ativo !== false ? ativos.indexOf(t) + 1 : null,
    }));
}

// ✅ OBTER CLASSIFICAÇÃO GERAL (última rodada disponível)
export const obterClassificacaoGeral = async (ligaId) => {
    try {
        const cache = await PontosCorridosCache.findOne({ liga_id: ligaId })
            .sort({ rodada_consolidada: -1 })
            .lean();

        if (!cache) {
            logger.log(
                `[PONTOS-CORRIDOS] ⚠️ Nenhuma classificação encontrada: Liga ${ligaId}`,
            );
            return null;
        }

        // ✅ v2.1: Buscar dados dos times para enriquecimento
        const timesMap = await buscarDadosTimesEnriquecidos(ligaId);

        // ✅ v2.1: Enriquecer classificação
        let classificacaoEnriquecida = enriquecerClassificacao(
            cache.classificacao || [],
            timesMap,
        );

        // Adicionar status
        if (classificacaoEnriquecida.length > 0) {
            const timeIds = classificacaoEnriquecida
                .map((t) => t.timeId)
                .filter(Boolean);

            if (timeIds.length > 0) {
                try {
                    const statusMap = await buscarStatusParticipantes(timeIds);

                    classificacaoEnriquecida = classificacaoEnriquecida.map(
                        (t) => {
                            const status = statusMap[t.timeId] || {
                                ativo: true,
                            };
                            return {
                                ...t,
                                ativo: status.ativo !== false,
                                rodada_desistencia:
                                    status.rodada_desistencia || null,
                            };
                        },
                    );
                } catch (e) {
                    // Ignorar erro de status
                }
            }
        }

        return {
            rodada: cache.rodada_consolidada,
            classificacao: classificacaoEnriquecida,
            permanent: cache.cache_permanente,
            updatedAt: cache.ultima_atualizacao,
        };
    } catch (error) {
        logger.error(
            "[PONTOS-CORRIDOS] ❌ Erro ao obter classificação:",
            error,
        );
        return null;
    }
};

logger.log(
    "[CACHE-PC] ✅ Controller v3.0 carregado (configuração dinâmica via ModuleConfig)",
);
