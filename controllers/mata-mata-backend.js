/**
 * MATA-MATA-BACKEND.JS v1.2
 * Lógica de Mata-Mata para Node.js - Espelho do frontend
 * Calcula todas as fases: primeira, oitavas, quartas, semis, final
 *
 * v1.2: FIX CRÍTICO - Usar tamanhoTorneio do MataMataCache (bracket salvo pelo admin)
 *   - Resolve bug onde participantes não classificados recebiam cobrança indevida
 *   - O cálculo financeiro agora respeita o bracket salvo em vez de recalcular independente
 * v1.1: Fix conversão ligaId + logging detalhado
 */

import mongoose from "mongoose";
import Rodada from "../models/Rodada.js";
import Time from "../models/Time.js"; // Importar modelo Time
import ModuleConfig from "../models/ModuleConfig.js"; // Importar ModuleConfig
import MataMataCache from "../models/MataMataCache.js"; // ✅ v1.2: Ler tamanhoTorneio do cache
import { calcularTamanhoIdealMataMata } from "../utils/tournamentUtils.js"; // Importar nova função
import mataMataRules from "../config/rules/mata_mata.json" with { type: "json" }; // Importar regras padrão
import { CURRENT_SEASON } from "../config/seasons.js";
import _ from 'lodash';
import logger from '../utils/logger.js';


// ============================================================================
// CONFIGURAÇÃO DINÂMICA
// ============================================================================

/**
 * Busca e mescla a configuração do mata-mata para uma liga específica.
 * Carrega as regras padrão do JSON e sobrepõe com as configurações
 * salvas no ModuleConfig para a liga.
 */
async function getMataMataConfig(ligaId) {
    try {
        const defaultConfig = _.cloneDeep(mataMataRules);

        const moduleConfig = await ModuleConfig.findOne({
            liga_id: ligaId,
            temporada: CURRENT_SEASON,
            modulo: 'mata_mata'
        }).lean();

        if (moduleConfig) {
            // Mescla configurações, dando prioridade ao que está no DB
            const mergedConfig = _.merge(defaultConfig, moduleConfig.configuracao_override || {});
            // ✅ FIX: Incluir wizard_respostas para que calcularResultadosEdicao respeite total_times configurado
            mergedConfig.wizard_respostas = moduleConfig.wizard_respostas || {};
            return mergedConfig;
        }

        return defaultConfig;
    } catch (error) {
        logger.error(`[MATA-BACKEND] Erro ao carregar configuração do mata-mata para liga ${ligaId}:`, error);
        // Retorna o padrão em caso de erro para não quebrar a execução
        return _.cloneDeep(mataMataRules);
    }
}


// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Busca ranking de uma rodada específica do MongoDB
 */
async function getRankingRodada(ligaId, rodada) {
    try {
        // Converter ligaId para ObjectId se necessário
        let ligaIdQuery;
        if (typeof ligaId === "string") {
            ligaIdQuery = new mongoose.Types.ObjectId(ligaId);
        } else if (ligaId instanceof mongoose.Types.ObjectId) {
            ligaIdQuery = ligaId;
        } else {
            ligaIdQuery = ligaId;
        }

        logger.log(
            `[MATA-BACKEND] Buscando ranking: liga=${ligaId}, rodada=${rodada}`,
        );

        const registros = await Rodada.find({
            ligaId: ligaIdQuery,
            rodada: rodada,
        })
            .select("timeId pontos nome_time nome_cartola")
            .lean();

        logger.log(
            `[MATA-BACKEND] Encontrados ${registros?.length || 0} registros para R${rodada}`,
        );

        if (!registros || registros.length === 0) {
            logger.warn(`[MATA-BACKEND] Sem dados para rodada ${rodada}`);
            return [];
        }

        // Ordenar por pontos (maior primeiro) e adicionar posição
        const ranking = registros
            .sort((a, b) => b.pontos - a.pontos)
            .map((r, idx) => ({
                timeId: String(r.timeId),
                pontos: r.pontos,
                nome_time: r.nome_time,
                nome_cartola: r.nome_cartola,
                posicao: idx + 1,
            }));

        return ranking;
    } catch (error) {
        logger.error(
            `[MATA-BACKEND] Erro ao buscar ranking rodada ${rodada}:`,
            error.message,
        );
        return [];
    }
}

/**
 * Converte ranking em mapa de pontos
 */
function criarMapaPontos(ranking) {
    const mapa = {};
    ranking.forEach((t) => {
        mapa[t.timeId] = t.pontos;
    });
    return mapa;
}

/**
 * Retorna as fases aplicáveis para o tamanho do torneio (espelho do frontend)
 * 32 times → 5 fases: primeira, oitavas, quartas, semis, final
 * 16 times → 4 fases: oitavas, quartas, semis, final
 * 8 times  → 3 fases: quartas, semis, final
 */
function getFasesParaTamanho(tamanho) {
    if (tamanho >= 32) return ["primeira", "oitavas", "quartas", "semis", "final"];
    if (tamanho >= 16) return ["oitavas", "quartas", "semis", "final"];
    if (tamanho >= 8)  return ["quartas", "semis", "final"];
    return [];
}

/**
 * ✅ v1.3: Extrai todos os timeIds presentes no bracket (dados_torneio)
 * Percorre todas as fases e coleta timeIds dos confrontos salvos.
 * Retorna Set<string> com os timeIds que realmente participam do torneio.
 */
function extrairTimeIdsDoBracket(dadosTorneio) {
    const timeIds = new Set();
    if (!dadosTorneio || typeof dadosTorneio !== 'object') return timeIds;

    const fasesDoTorneio = ['primeira', 'oitavas', 'quartas', 'semis', 'final'];
    for (const fase of fasesDoTorneio) {
        const confrontosFase = dadosTorneio[fase];
        if (!Array.isArray(confrontosFase)) continue;

        for (const confronto of confrontosFase) {
            // Suportar ambos formatos: { timeA: { timeId } } e { timeA: { id } }
            const idA = confronto?.timeA?.timeId || confronto?.timeA?.id;
            const idB = confronto?.timeB?.timeId || confronto?.timeB?.id;
            if (idA) timeIds.add(String(idA));
            if (idB) timeIds.add(String(idB));
        }
    }
    return timeIds;
}

// ============================================================================
// MONTAGEM DE CONFRONTOS (espelho do frontend)
// ============================================================================

/**
 * Monta confrontos da 1ª Fase (1º vs 32º, 2º vs 31º, etc.)
 */
function montarConfrontosPrimeiraFase(rankingBase, pontosRodadaAtual, tamanhoTorneio) {
    const confrontos = [];
    const metade = tamanhoTorneio / 2;

    for (let i = 0; i < metade; i++) {
        const timeA = rankingBase[i];
        const timeB = rankingBase[tamanhoTorneio - 1 - i];

        if (!timeA || !timeB) continue;

        const pontosA = pontosRodadaAtual[timeA.timeId] ?? null;
        const pontosB = pontosRodadaAtual[timeB.timeId] ?? null;

        confrontos.push({
            jogo: i + 1,
            timeA: {
                timeId: timeA.timeId,
                nome: timeA.nome_time || timeA.nome_cartola,
                pontos: pontosA,
                rankR2: i + 1,
            },
            timeB: {
                timeId: timeB.timeId,
                nome: timeB.nome_time || timeB.nome_cartola,
                pontos: pontosB,
                rankR2: tamanhoTorneio - i,
            },
        });
    }

    return confrontos;
}

/**
 * Monta confrontos de fases eliminatórias (oitavas, quartas, semis, final)
 */
function montarConfrontosFase(
    vencedoresAnteriores,
    pontosRodadaAtual,
    numJogos,
    tamanhoTorneio // Adicionado para referência
) {
    const confrontos = [];

    // Ordenar por jogo anterior para manter chaveamento correto
    const vencedoresOrdenados = [...vencedoresAnteriores].sort(
        (a, b) => (a.jogoAnterior || 0) - (b.jogoAnterior || 0),
    );

    for (let i = 0; i < numJogos; i++) {
        const timeA = vencedoresOrdenados[i * 2];
        const timeB = vencedoresOrdenados[i * 2 + 1];

        if (!timeA || !timeB) continue;

        const pontosA = pontosRodadaAtual[timeA.timeId] ?? null;
        const pontosB = pontosRodadaAtual[timeB.timeId] ?? null;

        confrontos.push({
            jogo: i + 1,
            timeA: {
                ...timeA,
                pontos: pontosA,
            },
            timeB: {
                ...timeB,
                pontos: pontosB,
            },
        });
    }

    return confrontos;
}

/**
 * Determina vencedor de um confronto
 * Critério: maior pontuação, empate decide por ranking na rodada de definição
 */
function determinarVencedor(confronto) {
    const { timeA, timeB } = confronto;

    const pontosAValidos = typeof timeA.pontos === "number";
    const pontosBValidos = typeof timeB.pontos === "number";

    let vencedor, perdedor;

    if (pontosAValidos && pontosBValidos) {
        if (timeA.pontos > timeB.pontos) {
            vencedor = timeA;
            perdedor = timeB;
        } else if (timeB.pontos > timeA.pontos) {
            vencedor = timeB;
            perdedor = timeA;
        } else {
            // Empate: vence quem tem melhor ranking (menor rankR2)
            if ((timeA.rankR2 || 999) < (timeB.rankR2 || 999)) {
                vencedor = timeA;
                perdedor = timeB;
            } else {
                vencedor = timeB;
                perdedor = timeA;
            }
        }
    } else {
        // Sem pontos: decide por ranking
        if ((timeA.rankR2 || 999) < (timeB.rankR2 || 999)) {
            vencedor = timeA;
            perdedor = timeB;
        } else {
            vencedor = timeB;
            perdedor = timeA;
        }
    }

    return { vencedor, perdedor };
}

// ============================================================================
// CÁLCULO PRINCIPAL
// ============================================================================

/**
 * Calcula resultados financeiros de uma edição do Mata-Mata
 * Retorna array de { timeId, fase, rodadaPontos, valor }
 */
async function calcularResultadosEdicao(ligaId, edicao, rodadaAtual, config) {
    const resultadosFinanceiros = [];

    try {
        // ✅ FIX #4: Buscar ranking histórico PRIMEIRO para determinar participantes elegíveis
        // Usar rankingBase.length em vez de Time.countDocuments() (contagem atual)
        // Razão: participantes que ingressaram APÓS rodadaDefinicao não estavam no mata-mata original
        // e não devem ser classificados mesmo que seus dados históricos tenham sido preenchidos depois
        const rankingBase = await getRankingRodada(
            ligaId,
            edicao.rodadaDefinicao,
        );

        if (!rankingBase || rankingBase.length === 0) {
            logger.warn(`[MATA-BACKEND] Sem dados de ranking para rodada de definição R${edicao.rodadaDefinicao} de ${edicao.nome}.`);
            return [];
        }

        // 2. Calcular tamanho ideal baseado em participantes HISTÓRICOS (quem jogou na rodada de definição)
        const totalParticipantesHistorico = rankingBase.length;
        let tamanhoTorneio;

        // ✅ v1.3 FIX CRÍTICO: Ler tamanhoTorneio E dados_torneio do MataMataCache
        // O bracket salvo é a FONTE DE VERDADE para quem participa do torneio.
        // v1.3: Também lê dados_torneio para cross-validar quais timeIds realmente
        // estão no bracket — resolve bug onde participantes não classificados eram cobrados.
        let participantesNoBracket = null; // Set de timeIds que realmente estão nos confrontos
        try {
            const cacheEdicao = await MataMataCache.findOne({
                liga_id: String(ligaId),
                edicao: edicao.id,
                temporada: CURRENT_SEASON,
            }).select('tamanhoTorneio dados_torneio').lean();

            if (cacheEdicao && cacheEdicao.tamanhoTorneio && [8, 16, 32, 64].includes(cacheEdicao.tamanhoTorneio)) {
                tamanhoTorneio = cacheEdicao.tamanhoTorneio;
                logger.log(`[MATA-BACKEND] ✅ tamanhoTorneio do cache: ${tamanhoTorneio} (bracket salvo pelo admin)`);
            }

            // ✅ v1.3: Extrair timeIds do bracket real (dados_torneio) como whitelist
            if (cacheEdicao?.dados_torneio) {
                participantesNoBracket = extrairTimeIdsDoBracket(cacheEdicao.dados_torneio);
                if (participantesNoBracket.size > 0) {
                    logger.log(`[MATA-BACKEND] ✅ Bracket real: ${participantesNoBracket.size} participantes extraídos dos confrontos`);
                }
            }
        } catch (err) {
            logger.warn(`[MATA-BACKEND] ⚠️ Erro ao ler MataMataCache para edição ${edicao.id}:`, err.message);
        }

        // Fallback: calcular dinamicamente se não há cache
        if (!tamanhoTorneio) {
            tamanhoTorneio = calcularTamanhoIdealMataMata(totalParticipantesHistorico);

            // Respeitar total_times configurado no wizard como teto
            const totalTimesConfig = Number(config.wizard_respostas?.total_times);
            if (totalTimesConfig && [8, 16, 32].includes(totalTimesConfig)) {
                tamanhoTorneio = Math.min(tamanhoTorneio, totalTimesConfig);
            }
            logger.log(`[MATA-BACKEND] ⚠️ Sem cache, tamanhoTorneio calculado: ${tamanhoTorneio} (fallback dinâmico)`);
        }

        if (tamanhoTorneio === 0) {
            logger.warn(`[MATA-BACKEND] Participantes históricos na R${edicao.rodadaDefinicao} (${totalParticipantesHistorico}) insuficientes para o mata-mata.`);
            return [];
        }

        // Verificar se ranking base tem participantes suficientes para o tamanho calculado
        if (rankingBase.length < tamanhoTorneio) {
            logger.warn(
                `[MATA-BACKEND] Ranking base insuficiente para ${edicao.nome}: ${rankingBase.length} times históricos (esperado: ${tamanhoTorneio})`,
            );
            return [];
        }

        const rankingClassificados = rankingBase.slice(0, tamanhoTorneio);

        // ✅ FIX #3: Usar fases dinâmicas baseadas no tamanho do torneio
        // 32 times → 5 fases, 16 times → 4 fases, 8 times → 3 fases
        const fases = getFasesParaTamanho(tamanhoTorneio);

        logger.log(
            `[MATA-BACKEND] ${edicao.nome}: Torneio com ${tamanhoTorneio} times. ${fases.length} fases: [${fases.join(', ')}].`,
        );

        // Mapear rodadas de cada fase (dinâmico)
        const rodadasFases = {};
        fases.forEach((fase, idx) => {
            rodadasFases[fase] = edicao.rodadaInicial + idx;
        });

        let vencedoresAnteriores = rankingClassificados.map((r, idx) => ({
            ...r,
            rankR2: idx + 1,
        }));

        const primeiraFase = fases[0];

        for (const fase of fases) {
            const rodadaPontosNum = rodadasFases[fase];

            // Verificar se rodada já foi concluída
            if (rodadaPontosNum >= rodadaAtual) {
                logger.log(
                    `[MATA-BACKEND] Fase ${fase} (R${rodadaPontosNum}) ainda não concluída`,
                );
                break;
            }

            const numJogos = Math.ceil(vencedoresAnteriores.length / 2);

            // Buscar pontos da rodada
            const rankingRodada = await getRankingRodada(
                ligaId,
                rodadaPontosNum,
            );
            const pontosRodada = criarMapaPontos(rankingRodada);

            // ✅ FIX #2: Usar montarConfrontosPrimeiraFase para a 1ª fase (pareamento cruzado: 1v32, 2v31)
            // Fases subsequentes mantêm montarConfrontosFase (pareamento por chaveamento)
            const confrontos = fase === primeiraFase
                ? montarConfrontosPrimeiraFase(rankingClassificados, pontosRodada, tamanhoTorneio)
                : montarConfrontosFase(vencedoresAnteriores, pontosRodada, numJogos, tamanhoTorneio);

            // Processar confrontos e determinar vencedores
            const proximosVencedores = [];

            confrontos.forEach((confronto) => {
                const { vencedor, perdedor } = determinarVencedor(confronto);

                if (vencedor && perdedor) {
                    // Usar valor da configuração
                    const valorVitoria = config.financeiro.valores_por_fase[fase]?.vitoria || 10.0;
                    const valorDerrota = config.financeiro.valores_por_fase[fase]?.derrota || -10.0;

                    // Registrar resultado financeiro do vencedor
                    resultadosFinanceiros.push({
                        timeId: String(vencedor.timeId),
                        fase: fase,
                        rodadaPontos: rodadaPontosNum,
                        valor: valorVitoria,
                        edicao: edicao.id,
                        temporada: CURRENT_SEASON,
                        chaveIdempotencia: `matamata-${edicao.id}-${fase}-${vencedor.timeId}-${CURRENT_SEASON}`,
                    });

                    // Registrar resultado financeiro do perdedor
                    resultadosFinanceiros.push({
                        timeId: String(perdedor.timeId),
                        fase: fase,
                        rodadaPontos: rodadaPontosNum,
                        valor: valorDerrota,
                        edicao: edicao.id,
                        temporada: CURRENT_SEASON,
                        chaveIdempotencia: `matamata-${edicao.id}-${fase}-${perdedor.timeId}-${CURRENT_SEASON}`,
                    });

                    // Preparar vencedor para próxima fase
                    vencedor.jogoAnterior = confronto.jogo;
                    proximosVencedores.push(vencedor);
                }
            });

            vencedoresAnteriores = proximosVencedores;

            logger.log(
                `[MATA-BACKEND] ${edicao.nome} - ${fase}: ${confrontos.length} confrontos, ${proximosVencedores.length} vencedores`,
            );
        }

        // ✅ v1.3 FIX: Cross-validar resultados contra o bracket real
        // Se temos dados do bracket (dados_torneio), filtrar para garantir que
        // APENAS participantes que realmente estão nos confrontos sejam cobrados.
        // Resolve bug onde participantes fora do bracket recebiam cobrança indevida.
        if (participantesNoBracket && participantesNoBracket.size > 0) {
            const antes = resultadosFinanceiros.length;
            const resultadosFiltrados = resultadosFinanceiros.filter(
                r => participantesNoBracket.has(String(r.timeId))
            );
            const removidos = antes - resultadosFiltrados.length;
            if (removidos > 0) {
                logger.warn(
                    `[MATA-BACKEND] ⚠️ ${edicao.nome}: ${removidos} transações removidas (participantes fora do bracket real)`
                );
            }
            return resultadosFiltrados;
        }

        return resultadosFinanceiros;
    } catch (error) {
        logger.error(`[MATA-BACKEND] Erro ao calcular ${edicao.nome}:`, error);
        return [];
    }
}

// ============================================================================
// FUNÇÕES EXPORTADAS
// ============================================================================

/**
 * Calcula resultados de TODAS as edições do Mata-Mata para uma liga
 * Retorna array consolidado de transações financeiras
 */
export async function getResultadosMataMataCompleto(ligaId, rodadaAtual) {
    logger.log(
        `[MATA-BACKEND] Calculando Mata-Mata para liga ${ligaId}, rodada ${rodadaAtual}`,
    );

    const config = await getMataMataConfig(ligaId);
    const todosResultados = [];

    // Filtrar edições que já começaram
    const edicoesProcessaveis = config.calendario.edicoes.filter(
        (edicao) => rodadaAtual > edicao.rodadaInicial,
    );

    logger.log(
        `[MATA-BACKEND] ${edicoesProcessaveis.length} edições para processar`,
    );

    for (const edicao of edicoesProcessaveis) {
        const dadosEdicao = await calcularResultadosEdicao(
            ligaId,
            edicao,
            rodadaAtual,
            config,
        );
        
        // ✅ Extrair resultados (compatibilidade com novo formato)
        const resultadosEdicao = Array.isArray(dadosEdicao) 
            ? dadosEdicao 
            : dadosEdicao.resultados || [];
        
        todosResultados.push(...resultadosEdicao);
    }

    logger.log(
        `[MATA-BACKEND] Total: ${todosResultados.length} transações calculadas`,
    );

    return todosResultados;
}

/**
 * Calcula resultado do Mata-Mata para um time específico em uma rodada
 * Usado pelo fluxoFinanceiroController
 */
export async function calcularMataMataParaTime(
    ligaId,
    timeId,
    rodadaNumero,
    rodadaAtual,
) {
    const config = await getMataMataConfig(ligaId);

    // Verificar se a rodada faz parte de alguma edição
    const edicao = config.calendario.edicoes.find(
        (e) => rodadaNumero >= e.rodadaInicial && rodadaNumero <= e.rodadaFinal,
    );

    if (!edicao) {
        // Não logar para cada rodada - só para rodadas de MM
        return null;
    }

    logger.log(
        `[MATA-BACKEND] Calculando R${rodadaNumero} para time ${timeId} (${edicao.nome})`,
    );

    // Verificar se rodada já foi concluída
    if (rodadaNumero >= rodadaAtual) {
        logger.log(
            `[MATA-BACKEND] R${rodadaNumero} ainda não concluída (atual: ${rodadaAtual})`,
        );
        return null;
    }

    // Calcular resultados da edição
    const resultados = await calcularResultadosEdicao(
        ligaId,
        edicao,
        rodadaAtual,
        config,
    );

    logger.log(
        `[MATA-BACKEND] Resultados da edição: ${resultados.length} transações`,
    );

    // Encontrar resultado do time na rodada específica
    const resultado = resultados.find(
        (r) => r.timeId === String(timeId) && r.rodadaPontos === rodadaNumero,
    );

    if (!resultado) {
        logger.log(
            `[MATA-BACKEND] Nenhum resultado para time ${timeId} na R${rodadaNumero}`,
        );
        return null;
    }

    const faseLabel =
        {
            primeira: "1ª Fase",
            oitavas: "Oitavas",
            quartas: "Quartas",
            semis: "Semis",
            final: "Final",
        }[resultado.fase] || resultado.fase;

    logger.log(
        `[MATA-BACKEND] ✅ Time ${timeId}: ${resultado.valor > 0 ? "Vitória" : "Derrota"} (${faseLabel})`,
    );

    return {
        valor: resultado.valor,
        descricao: `${resultado.valor > 0 ? "Vitória" : "Derrota"} M-M ${faseLabel}`,
        fase: resultado.fase,
        edicao: resultado.edicao,
    };
}

/**
 * Retorna mapa de resultados por timeId e rodada
 * Formato: Map<"timeId_rodada", valor>
 */
export async function criarMapaMataMata(ligaId, rodadaAtual) {
    const resultados = await getResultadosMataMataCompleto(ligaId, rodadaAtual);
    const mapa = new Map();

    resultados.forEach((r) => {
        const key = `${r.timeId}_${r.rodadaPontos}`;
        mapa.set(key, {
            valor: r.valor,
            fase: r.fase,
            edicao: r.edicao,
        });
    });

    logger.log(`[MATA-BACKEND] Mapa criado com ${mapa.size} entradas`);

    return mapa;
}

logger.log("[MATA-BACKEND] ✅ Módulo v1.2 carregado (fix tamanhoTorneio do cache)");
