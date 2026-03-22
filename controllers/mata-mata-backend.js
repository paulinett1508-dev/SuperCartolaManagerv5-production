/**
 * MATA-MATA-BACKEND.JS v1.4
 * Lógica de Mata-Mata para Node.js - Espelho do frontend
 * Calcula todas as fases: primeira, oitavas, quartas, semis, final
 *
 * v1.4: FIX CRÍTICO - Consolidação não deve pular fases com pontos null
 *   - Confrontos salvos durante rodada ao vivo (pts null) eram considerados "calculados"
 *   - Agora verifica se os pontos existem antes de considerar cache como válido
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
// GERAÇÃO DINÂMICA DE CALENDÁRIO (espelho de module-config-routes.js)
// ============================================================================

/**
 * Gera edições do mata-mata a partir dos parâmetros do wizard.
 * Retorna array com id, nome, rodadaInicial, rodadaFinal, rodadaDefinicao.
 */
function _gerarCalendarioBackend(totalTimes, qtdEdicoes, rodadaFinalCampeonato = 38) {
    let numFases;
    if (totalTimes >= 32) numFases = 5;
    else if (totalTimes >= 16) numFases = 4;
    else if (totalTimes >= 8) numFases = 3;
    else return [];

    const edicoes = [];
    let rodadaAtual = 2; // Rodada 1 é aquecimento; definição começa na rodada 2

    for (let i = 0; i < qtdEdicoes; i++) {
        const rodadaDefinicao = rodadaAtual;
        const rodadaInicial = rodadaDefinicao + 1;
        const rodadaFinal = rodadaInicial + numFases - 1;

        if (rodadaFinal > rodadaFinalCampeonato) break;

        edicoes.push({
            id: i + 1,
            nome: `${i + 1}ª Edição`,
            rodadaInicial,
            rodadaFinal,
            rodadaDefinicao
        });

        rodadaAtual = rodadaFinal + 1;
    }

    return edicoes;
}

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

            // ✅ FIX: Usar calendario_override do admin (gerado dinamicamente)
            // Prioridade 1: calendario_override (salvo no DB pelo admin)
            // Prioridade 2: gerado de wizard_respostas (fix PR#176 incompleto — override vazio mas wizard configurado)
            // Prioridade 3: JSON default hardcoded (fallback final)
            if (moduleConfig.calendario_override?.length > 0) {
                mergedConfig.calendario.edicoes = moduleConfig.calendario_override.map(e => ({
                    id: e.edicao,
                    nome: e.nome,
                    rodadaInicial: e.rodada_inicial,
                    rodadaFinal: e.rodada_final,
                    rodadaDefinicao: e.rodada_definicao
                }));
                logger.log(`[MATA-BACKEND] ✅ Usando calendario_override: ${mergedConfig.calendario.edicoes.length} edições (admin config)`);
            } else if (mergedConfig.wizard_respostas?.total_times && mergedConfig.wizard_respostas?.qtd_edicoes) {
                const totalTimes = Number(mergedConfig.wizard_respostas.total_times);
                const qtdEdicoes = Number(mergedConfig.wizard_respostas.qtd_edicoes);
                const gerado = _gerarCalendarioBackend(totalTimes, qtdEdicoes);
                if (gerado.length > 0) {
                    mergedConfig.calendario.edicoes = gerado;
                    logger.log(`[MATA-BACKEND] ✅ Calendário gerado de wizard_respostas: ${gerado.length} edições (${totalTimes} times)`);
                }
            }

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
            temporada: CURRENT_SEASON,
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
                nome_time: timeA.nome_time || null,
                nome_cartola: timeA.nome_cartola || null,
                pontos: pontosA,
                rankR2: i + 1,
            },
            timeB: {
                timeId: timeB.timeId,
                nome: timeB.nome_time || timeB.nome_cartola,
                nome_time: timeB.nome_time || null,
                nome_cartola: timeB.nome_cartola || null,
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
 * Retorna o campeão da edição anterior (edicaoId - 1) para a liga/temporada informada.
 * Retorna null se não houver edição anterior ou se o campeão não estiver salvo.
 */
async function getCampeaoEdicaoAnterior(ligaId, edicaoId, temporada) {
    if (edicaoId <= 1) return null;
    try {
        const cacheAnterior = await MataMataCache.findOne({
            liga_id: String(ligaId),
            edicao: edicaoId - 1,
            temporada,
        }).select('dados_torneio').lean();
        return cacheAnterior?.dados_torneio?.campeao ?? null;
    } catch (err) {
        logger.warn(`[MATA-BACKEND] ⚠️ Erro ao buscar campeão da edição anterior:`, err.message);
        return null;
    }
}

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

        // ✅ FIX: wizard_respostas.total_times é a FONTE DE VERDADE para o tamanho do torneio.
        // O cache MongoDB pode ter valor stale (ex: 32) quando admin reconfigurou para 8.
        const totalTimesConfig = Number(config.wizard_respostas?.total_times);
        const tetoWizard = (totalTimesConfig && [8, 16, 32].includes(totalTimesConfig))
            ? totalTimesConfig
            : null;

        // ✅ v1.3: Ler dados_torneio do MataMataCache para cross-validar quais timeIds
        // realmente estão no bracket — resolve bug onde participantes não classificados eram cobrados.
        let participantesNoBracket = null; // Set de timeIds que realmente estão nos confrontos
        try {
            const cacheEdicao = await MataMataCache.findOne({
                liga_id: String(ligaId),
                edicao: edicao.id,
                temporada: CURRENT_SEASON,
            }).select('tamanhoTorneio dados_torneio').lean();

            if (cacheEdicao && cacheEdicao.tamanhoTorneio && [8, 16, 32, 64].includes(cacheEdicao.tamanhoTorneio)) {
                tamanhoTorneio = cacheEdicao.tamanhoTorneio;
                // ✅ FIX: Respeitar teto do wizard — cache pode ter valor stale
                if (tetoWizard && tamanhoTorneio > tetoWizard) {
                    logger.warn(`[MATA-BACKEND] ⚠️ Cache tem tamanho ${tamanhoTorneio} mas wizard diz ${tetoWizard} — usando wizard`);
                    tamanhoTorneio = tetoWizard;
                } else {
                    logger.log(`[MATA-BACKEND] ✅ tamanhoTorneio do cache: ${tamanhoTorneio} (bracket salvo pelo admin)`);
                }
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
            if (tetoWizard) {
                // Wizard é a fonte de verdade — usar direto
                tamanhoTorneio = tetoWizard;
                logger.log(`[MATA-BACKEND] ✅ tamanhoTorneio do wizard: ${tamanhoTorneio}`);
            } else {
                tamanhoTorneio = calcularTamanhoIdealMataMata(totalParticipantesHistorico);
                logger.log(`[MATA-BACKEND] ⚠️ Sem cache/wizard, tamanhoTorneio calculado: ${tamanhoTorneio} (fallback dinâmico)`);
            }
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

        // ✅ Regra: Campeão da edição anterior tem vaga garantida na edição seguinte.
        // Exceção: se todos os participantes já se classificam (rankingBase.length <= tamanhoTorneio),
        // não há necessidade — o bloco abaixo simplesmente não executa.
        if (rankingBase.length > tamanhoTorneio) {
            const campeaoAnterior = await getCampeaoEdicaoAnterior(ligaId, edicao.id, CURRENT_SEASON);
            if (campeaoAnterior?.timeId) {
                const jaClassificado = rankingClassificados.some(
                    (p) => String(p.timeId) === String(campeaoAnterior.timeId)
                );
                if (!jaClassificado) {
                    const campeaoNoRanking = rankingBase.find(
                        (p) => String(p.timeId) === String(campeaoAnterior.timeId)
                    );
                    if (campeaoNoRanking) {
                        rankingClassificados.pop(); // Remove o último classificado pelo ranking
                        rankingClassificados.push(campeaoNoRanking);
                        logger.log(
                            `[MATA-BACKEND] 🏆 Campeão da edição ${edicao.id - 1} (${campeaoAnterior.timeId}) garantido na edição ${edicao.id} pela regra de campeão`
                        );
                    }
                }
            }
        }

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

            // Verificar se rodada ainda não chegou (fase futura)
            if (rodadaPontosNum > rodadaAtual) {
                logger.log(
                    `[MATA-BACKEND] Fase ${fase} (R${rodadaPontosNum}) ainda não chegou`,
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

    // ✅ FIX: Respeitar qtd_edicoes do wizard (admin pode ter definido menos edições que o calendário)
    const qtdEdicoes = Number(config.wizard_respostas?.qtd_edicoes) || config.calendario.edicoes.length;
    const edicoesAtivas = config.calendario.edicoes.slice(0, qtdEdicoes);

    // Filtrar edições que já começaram
    const edicoesProcessaveis = edicoesAtivas.filter(
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

// ============================================================================
// CÁLCULO DE BRACKET PARA CONSOLIDAÇÃO AUTOMÁTICA
// ============================================================================

/**
 * Calcula os confrontos (bracket) de TODAS as edições ativas e persiste no MataMataCache.
 * Chamada durante a consolidação para garantir que o cache está atualizado
 * ANTES de ser lido para o RodadaSnapshot.
 *
 * Se o cache já possui dados atualizados para a edição (admin abriu a tela),
 * respeita os dados existentes e não sobrescreve.
 *
 * @returns Array de { edicao, rodada_atual, dados_torneio, ultima_atualizacao }
 */
export async function calcularBracketParaConsolidacao(ligaId, rodadaAtual) {
    logger.log(`[MATA-CONSOLIDAÇÃO-CALC] Calculando bracket para liga ${ligaId}, rodada ${rodadaAtual}`);

    const config = await getMataMataConfig(ligaId);
    const qtdEdicoes = Number(config.wizard_respostas?.qtd_edicoes) || config.calendario.edicoes.length;
    const edicoesAtivas = config.calendario.edicoes.slice(0, qtdEdicoes);
    const resultados = [];

    for (const edicao of edicoesAtivas) {
        // Edição ainda não começou
        if (rodadaAtual < edicao.rodadaInicial) continue;

        try {
            // 1. Ler cache existente
            const cacheExistente = await MataMataCache.findOne({
                liga_id: String(ligaId),
                edicao: edicao.id,
                temporada: CURRENT_SEASON
            }).lean();

            // 2. Verificar se cache está atualizado para esta rodada
            // Checar se a fase correspondente à rodada já existe no bracket
            const fasesDaEdicao = getFasesParaTamanho(
                cacheExistente?.tamanhoTorneio || Number(config.wizard_respostas?.total_times) || 8
            );
            const indiceFaseAtual = rodadaAtual - edicao.rodadaInicial;
            const faseEsperada = fasesDaEdicao[Math.min(indiceFaseAtual, fasesDaEdicao.length - 1)];

            // ✅ v1.4: Verificar se a fase tem confrontos COM pontos reais (não null)
            // Confrontos salvos durante rodada ao vivo podem ter pts null — não são "calculados"
            const confrontosFaseEsperada = cacheExistente?.dados_torneio?.[faseEsperada];
            const faseTemPontosReais = Array.isArray(confrontosFaseEsperada) && confrontosFaseEsperada.length > 0 &&
                confrontosFaseEsperada.every(c =>
                    typeof c.timeA?.pontos === 'number' && typeof c.timeB?.pontos === 'number'
                );

            if (faseTemPontosReais) {
                // Cache já tem dados COM pontos reais para a fase esperada — admin já calculou
                logger.log(`[MATA-CONSOLIDAÇÃO-CALC] ✅ Edição ${edicao.id}: cache já atualizado (fase ${faseEsperada} com pontos reais)`);
                resultados.push({
                    edicao: edicao.id,
                    rodada_atual: cacheExistente.rodada_atual,
                    dados_torneio: cacheExistente.dados_torneio,
                    ultima_atualizacao: cacheExistente.ultima_atualizacao
                });
                continue;
            }

            if (Array.isArray(confrontosFaseEsperada) && confrontosFaseEsperada.length > 0 && !faseTemPontosReais) {
                logger.warn(`[MATA-CONSOLIDAÇÃO-CALC] ⚠️ Edição ${edicao.id}: fase ${faseEsperada} tem confrontos com pontos null — recalculando`);
            }

            // 3. Cache stale ou inexistente — calcular bracket
            logger.log(`[MATA-CONSOLIDAÇÃO-CALC] ⚠️ Edição ${edicao.id}: cache stale/vazio, calculando...`);

            const rankingBase = await getRankingRodada(ligaId, edicao.rodadaDefinicao);
            if (!rankingBase || rankingBase.length === 0) {
                logger.warn(`[MATA-CONSOLIDAÇÃO-CALC] Sem ranking para R${edicao.rodadaDefinicao}, pulando edição ${edicao.id}`);
                continue;
            }

            // Determinar tamanho do torneio
            const totalTimesConfig = Number(config.wizard_respostas?.total_times);
            const tetoWizard = (totalTimesConfig && [8, 16, 32].includes(totalTimesConfig))
                ? totalTimesConfig : null;

            let tamanhoTorneio;
            if (cacheExistente?.tamanhoTorneio && [8, 16, 32].includes(cacheExistente.tamanhoTorneio)) {
                tamanhoTorneio = cacheExistente.tamanhoTorneio;
                if (tetoWizard && tamanhoTorneio > tetoWizard) tamanhoTorneio = tetoWizard;
            } else if (tetoWizard) {
                tamanhoTorneio = tetoWizard;
            } else {
                tamanhoTorneio = calcularTamanhoIdealMataMata(rankingBase.length);
            }

            if (tamanhoTorneio === 0 || rankingBase.length < tamanhoTorneio) {
                logger.warn(`[MATA-CONSOLIDAÇÃO-CALC] Participantes insuficientes para edição ${edicao.id}`);
                continue;
            }

            const rankingClassificados = rankingBase.slice(0, tamanhoTorneio);

            // ✅ Regra: Campeão da edição anterior tem vaga garantida na edição seguinte.
            // Exceção: se todos os participantes já se classificam (rankingBase.length <= tamanhoTorneio),
            // não há necessidade — o bloco abaixo simplesmente não executa.
            if (rankingBase.length > tamanhoTorneio) {
                const campeaoAnterior = await getCampeaoEdicaoAnterior(ligaId, edicao.id, CURRENT_SEASON);
                if (campeaoAnterior?.timeId) {
                    const jaClassificado = rankingClassificados.some(
                        (p) => String(p.timeId) === String(campeaoAnterior.timeId)
                    );
                    if (!jaClassificado) {
                        const campeaoNoRanking = rankingBase.find(
                            (p) => String(p.timeId) === String(campeaoAnterior.timeId)
                        );
                        if (campeaoNoRanking) {
                            rankingClassificados.pop(); // Remove o último classificado pelo ranking
                            rankingClassificados.push(campeaoNoRanking);
                            logger.log(
                                `[MATA-CONSOLIDAÇÃO-CALC] 🏆 Campeão da edição ${edicao.id - 1} (${campeaoAnterior.timeId}) garantido na edição ${edicao.id} pela regra de campeão`
                            );
                        }
                    }
                }
            }

            const fases = getFasesParaTamanho(tamanhoTorneio);
            const rodadasFases = {};
            fases.forEach((fase, idx) => { rodadasFases[fase] = edicao.rodadaInicial + idx; });

            // Iniciar com dados existentes do cache (preservar fases já calculadas)
            const dadosTorneio = cacheExistente?.dados_torneio
                ? { ...cacheExistente.dados_torneio }
                : {};

            let vencedoresAnteriores = rankingClassificados.map((r, idx) => ({
                ...r, rankR2: idx + 1
            }));
            const primeiraFase = fases[0];

            for (const fase of fases) {
                const rodadaPontosNum = rodadasFases[fase];

                // Fase futura — parar
                if (rodadaPontosNum > rodadaAtual) {
                    logger.log(`[MATA-CONSOLIDAÇÃO-CALC] Fase ${fase} (R${rodadaPontosNum}) futura, parando`);
                    break;
                }

                // Se fase já existe no cache COM pontos reais, usar dados existentes para avançar vencedores
                // ✅ v1.4: Não reutilizar confrontos com pontos null (salvos durante rodada ao vivo)
                const confrontosCacheFase = dadosTorneio[fase];
                const cacheFaseTemPontos = Array.isArray(confrontosCacheFase) && confrontosCacheFase.length > 0 &&
                    confrontosCacheFase.every(c =>
                        typeof c.timeA?.pontos === 'number' && typeof c.timeB?.pontos === 'number'
                    );

                if (cacheFaseTemPontos) {
                    const proximosVencedores = [];
                    confrontosCacheFase.forEach(confronto => {
                        const { vencedor } = determinarVencedor(confronto);
                        if (vencedor) {
                            vencedor.jogoAnterior = confronto.jogo;
                            proximosVencedores.push(vencedor);
                        }
                    });
                    vencedoresAnteriores = proximosVencedores;
                    continue;
                }

                if (Array.isArray(confrontosCacheFase) && confrontosCacheFase.length > 0 && !cacheFaseTemPontos) {
                    logger.warn(`[MATA-CONSOLIDAÇÃO-CALC] ⚠️ Edição ${edicao.id} - fase ${fase}: confrontos com pontos null no cache, recalculando`);
                }

                // Calcular fase
                const numJogos = Math.ceil(vencedoresAnteriores.length / 2);
                const rankingRodada = await getRankingRodada(ligaId, rodadaPontosNum);
                const pontosRodada = criarMapaPontos(rankingRodada);

                const confrontos = fase === primeiraFase
                    ? montarConfrontosPrimeiraFase(rankingClassificados, pontosRodada, tamanhoTorneio)
                    : montarConfrontosFase(vencedoresAnteriores, pontosRodada, numJogos, tamanhoTorneio);

                dadosTorneio[fase] = confrontos;

                // Determinar vencedores para próxima fase
                const proximosVencedores = [];
                confrontos.forEach(confronto => {
                    const { vencedor } = determinarVencedor(confronto);
                    if (vencedor) {
                        vencedor.jogoAnterior = confronto.jogo;
                        proximosVencedores.push(vencedor);
                    }
                });
                vencedoresAnteriores = proximosVencedores;

                // Se final, salvar campeão
                if (fase === 'final' && confrontos.length > 0) {
                    const { vencedor } = determinarVencedor(confrontos[0]);
                    if (vencedor) dadosTorneio.campeao = vencedor;
                }

                logger.log(`[MATA-CONSOLIDAÇÃO-CALC] Edição ${edicao.id} - ${fase}: ${confrontos.length} confrontos calculados`);
            }

            // Metadata
            dadosTorneio.metadata = {
                tamanhoTorneio,
                participantesAtivos: rankingBase.length,
                calculadoEm: new Date().toISOString(),
                fonte: 'consolidacao-automatica'
            };

            // 4. Persistir no MataMataCache
            await MataMataCache.findOneAndUpdate(
                { liga_id: String(ligaId), edicao: edicao.id, temporada: CURRENT_SEASON },
                {
                    rodada_atual: rodadaAtual,
                    dados_torneio: dadosTorneio,
                    tamanhoTorneio: tamanhoTorneio,
                    participantesAtivos: rankingBase.length,
                    ultima_atualizacao: new Date()
                },
                { upsert: true, new: true }
            );

            logger.log(`[MATA-CONSOLIDAÇÃO-CALC] ✅ Edição ${edicao.id}: bracket calculado e persistido`);

            resultados.push({
                edicao: edicao.id,
                rodada_atual: rodadaAtual,
                dados_torneio: dadosTorneio,
                ultima_atualizacao: new Date()
            });
        } catch (error) {
            logger.error(`[MATA-CONSOLIDAÇÃO-CALC] ❌ Erro na edição ${edicao.id}:`, error);
        }
    }

    logger.log(`[MATA-CONSOLIDAÇÃO-CALC] ✅ ${resultados.length} edições processadas`);
    return resultados;
}

logger.log("[MATA-BACKEND] ✅ Módulo v1.3 carregado (consolidação automática de bracket)");
