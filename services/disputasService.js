// =====================================================================
// disputasService.js v1.0 - Cálculos de Disputas Internas
// Funções para calcular dados de cada módulo competitivo da liga
// =====================================================================

import mongoose from "mongoose";
import PontosCorridosCache from "../models/PontosCorridosCache.js";
import MataMataCache from "../models/MataMataCache.js";
// ArtilheiroCampeao removido - agora usa GolsConsolidados diretamente
import Goleiros from "../models/Goleiros.js";
import CapitaoCaches from "../models/CapitaoCaches.js";
import MelhorMesCache from "../models/MelhorMesCache.js";
import Rodada from "../models/Rodada.js";
import { truncarPontosNum } from "../utils/type-helpers.js";

const LOG_PREFIX = "[DISPUTAS-SERVICE]";

/**
 * Retorna as fases aplicáveis de acordo com o tamanho do torneio
 * Replica lógica do frontend (participante-mata-mata.js)
 */
function getFasesParaTamanho(tamanho) {
    if (tamanho >= 32) return ["primeira", "oitavas", "quartas", "semis", "final"];
    if (tamanho >= 16) return ["oitavas", "quartas", "semis", "final"];
    if (tamanho >= 8) return ["quartas", "semis", "final"];
    return [];
}

/**
 * Nomes legíveis das fases do Mata-Mata
 */
const NOMES_FASES = {
    primeira: "1ª Fase",
    oitavas: "Oitavas",
    quartas: "Quartas",
    semis: "Semifinal",
    final: "Final",
};

/**
 * Calcula dados completos de Pontos Corridos
 * @param {String} ligaId
 * @param {Number} rodada
 * @param {Number} timeId
 * @param {Number} temporada
 * @returns {Object} Dados do confronto, classificação, zona, mudanças
 */
export async function calcularPontosCorridos(ligaId, rodada, timeId, temporada) {
    try {
        // IMPORTANTE: rodada_consolidada no PontosCorridosCache é a rodada da LIGA PC,
        // NÃO a rodada do Brasileirão/Cartola. A numeração é independente.
        // Ex: Liga PC rodada 2 pode ter sido disputada na rodada 3 do Brasileirão.
        // Buscamos os caches mais recentes e escolhemos o primeiro com dados completos.
        const caches = await PontosCorridosCache.find({
            liga_id: String(ligaId),
            temporada: temporada,
        })
            .sort({ rodada_consolidada: -1 })
            .lean();

        if (!caches || caches.length === 0) {
            console.log(`${LOG_PREFIX} [PC] Nenhum cache encontrado para liga=${ligaId} temp=${temporada}`);
            return null;
        }

        // Encontrar o cache mais recente que tenha dados reais para este time
        // (ignora caches incompletos onde confrontos estão zerados/N/D)
        let cache = null;
        let meuConfronto = null;

        for (const candidato of caches) {
            const confronto = candidato.confrontos?.find(c =>
                c.time1.id === timeId || c.time2.id === timeId
            );

            if (!confronto) continue;

            // Verificar se o confronto tem dados reais (não é 0×0 com nomes vazios)
            const temDados = (confronto.time1.pontos !== 0 || confronto.time2.pontos !== 0)
                && confronto.time1.nome_cartola !== "N/D"
                && confronto.time2.nome_cartola !== "N/D";

            if (temDados) {
                cache = candidato;
                meuConfronto = confronto;
                break;
            }

            console.log(`${LOG_PREFIX} [PC] Cache PC R${candidato.rodada_consolidada} incompleto (confronto sem dados), tentando anterior...`);
        }

        if (!cache || !meuConfronto) {
            console.log(`${LOG_PREFIX} [PC] Nenhum cache com dados completos encontrado para time ${timeId}`);
            return null;
        }

        const rodadaPC = cache.rodada_consolidada;
        console.log(`${LOG_PREFIX} [PC] Usando cache da rodada PC ${rodadaPC} (Brasileirão rodada ${rodada})`);


        // Determinar quem é quem
        const sou_time1 = meuConfronto.time1.id === timeId;
        const eu = sou_time1 ? meuConfronto.time1 : meuConfronto.time2;
        const adversario = sou_time1 ? meuConfronto.time2 : meuConfronto.time1;

        // Determinar resultado
        let resultado = "empate";
        let pontos_ganhos = 1;

        if (eu.pontos > adversario.pontos) {
            resultado = "vitoria";
            pontos_ganhos = 3;
        } else if (eu.pontos < adversario.pontos) {
            resultado = "derrota";
            pontos_ganhos = 0;
        }

        // Buscar minha posição na classificação
        const minhaClassificacao = cache.classificacao?.find(c => c.timeId === timeId);
        const posicaoAtual = minhaClassificacao?.posicao || 0;
        const pontosTabela = minhaClassificacao?.pontos || 0;

        // Buscar rodada PC anterior para detectar mudança de posição
        const cacheAnterior = await PontosCorridosCache.findOne({
            liga_id: String(ligaId),
            rodada_consolidada: rodadaPC - 1,
            temporada: temporada,
        }).lean();

        let mudancaPosicao = 0;
        let posicaoAnterior = posicaoAtual;

        if (cacheAnterior) {
            const classificacaoAnterior = cacheAnterior.classificacao?.find(c => c.timeId === timeId);
            if (classificacaoAnterior) {
                posicaoAnterior = classificacaoAnterior.posicao;
                mudancaPosicao = posicaoAnterior - posicaoAtual; // Positivo = subiu
            }
        }

        // Definir zona (G4, G6, Z4, etc)
        const totalParticipantes = cache.classificacao?.length || 0;
        let zona = "Neutro";

        if (posicaoAtual <= 4) zona = "G4";
        else if (posicaoAtual <= 6) zona = "G6";
        else if (posicaoAtual >= totalParticipantes - 3) zona = "Z4";

        // Calcular vantagem/desvantagem em relação ao G4 e Z4
        let vantagem_g4 = 0;
        let desvantagem_z4 = 0;

        if (zona === "G4" && cache.classificacao && cache.classificacao.length > 4) {
            const quinto = cache.classificacao[4];
            vantagem_g4 = pontosTabela - (quinto?.pontos || 0);
        } else if (zona !== "G4" && cache.classificacao && cache.classificacao.length >= 4) {
            const quarto = cache.classificacao[3];
            vantagem_g4 = -(Math.abs(pontosTabela - (quarto?.pontos || 0)));
        }

        // Buscar próximo confronto (rodada PC + 1)
        let proximoConfronto = null;
        const cacheProximo = await PontosCorridosCache.findOne({
            liga_id: String(ligaId),
            rodada_consolidada: rodadaPC + 1,
            temporada: temporada,
        }).lean();

        if (cacheProximo) {
            const confrontoProx = cacheProximo.confrontos?.find(c =>
                c.time1.id === timeId || c.time2.id === timeId
            );

            if (confrontoProx) {
                const sou_time1_prox = confrontoProx.time1.id === timeId;
                const adversarioProx = sou_time1_prox ? confrontoProx.time2 : confrontoProx.time1;
                let nomeAdv = adversarioProx.nome_cartola || adversarioProx.nome;

                // Fallback: se nome é "N/D" mas tem ID, buscar na collection Rodada
                if ((!nomeAdv || nomeAdv === "N/D") && adversarioProx.id) {
                    const advRodada = await Rodada.findOne({
                        ligaId: ligaId,
                        temporada: temporada,
                        timeId: adversarioProx.id,
                    }).select("nome_cartola escudo").lean();

                    if (advRodada) {
                        nomeAdv = advRodada.nome_cartola;
                        if (!adversarioProx.escudo && advRodada.escudo) {
                            adversarioProx.escudo = advRodada.escudo;
                        }
                    }
                }

                if (nomeAdv && nomeAdv !== "N/D") {
                    proximoConfronto = {
                        rodada: rodadaPC + 1,
                        adversario: {
                            nome: nomeAdv,
                            timeId: adversarioProx.id,
                            escudo: adversarioProx.escudo,
                        },
                    };
                }
            }
        }

        // Fallback: derivar do bracket round-robin quando não há cache da próxima rodada
        if (!proximoConfronto && caches.length > 0) {
            try {
                const listaIds = _extrairOrdemCanonica(caches);
                if (listaIds && listaIds.length >= 2) {
                    const bracket = _gerarBracketRoundRobin(listaIds);
                    const rodadaIndex = rodadaPC; // bracket 0-based → rodadaPC+1 = index rodadaPC
                    if (rodadaIndex < bracket.length) {
                        const jogos = bracket[rodadaIndex];
                        const meuJogo = jogos.find(j =>
                            String(j.timeAId) === String(timeId) || String(j.timeBId) === String(timeId)
                        );

                        if (meuJogo) {
                            const advId = String(meuJogo.timeAId) === String(timeId)
                                ? Number(meuJogo.timeBId)
                                : Number(meuJogo.timeAId);

                            // Resolver nome: primeiro via classificação do cache atual
                            let nomeAdv = null;
                            let escudoAdv = null;
                            const advClassif = cache.classificacao?.find(c => c.timeId === advId);
                            if (advClassif) {
                                nomeAdv = advClassif.nome_cartola || advClassif.nome;
                                escudoAdv = advClassif.escudo || null;
                            }

                            // Fallback: buscar na collection Rodada
                            if (!nomeAdv || nomeAdv === "N/D") {
                                const advRodada = await Rodada.findOne({
                                    ligaId: ligaId,
                                    temporada: temporada,
                                    timeId: advId,
                                }).select("nome_cartola escudo").lean();
                                if (advRodada) {
                                    nomeAdv = advRodada.nome_cartola;
                                    escudoAdv = escudoAdv || advRodada.escudo || null;
                                }
                            }

                            if (nomeAdv && nomeAdv !== "N/D") {
                                proximoConfronto = {
                                    rodada: rodadaPC + 1,
                                    adversario: {
                                        nome: nomeAdv,
                                        timeId: advId,
                                        escudo: escudoAdv,
                                    },
                                };
                                console.log(`${LOG_PREFIX} [PC] Próximo confronto derivado via bracket: vs ${nomeAdv} (R${rodadaPC + 1})`);
                            }
                        }
                    }
                }
            } catch (bracketError) {
                console.log(`${LOG_PREFIX} [PC] Fallback bracket falhou:`, bracketError.message);
            }
        }

        return {
            seu_confronto: {
                voce: truncarPontosNum(eu.pontos),
                adversario: {
                    nome: adversario.nome_cartola || adversario.nome,
                    pontos: truncarPontosNum(adversario.pontos),
                    timeId: adversario.id,
                    escudo: adversario.escudo,
                },
                resultado, // "vitoria", "empate", "derrota"
                diferenca: truncarPontosNum(Math.abs(eu.pontos - adversario.pontos)),
                pontos_ganhos,
            },
            classificacao_atual: (cache.classificacao || []).slice(0, 10).map(c => ({
                posicao: c.posicao,
                timeId: c.timeId,
                nome: c.nome_cartola || c.nome,
                pontos: c.pontos,
                jogos: c.jogos,
                vitorias: c.vitorias,
                empates: c.empates,
                derrotas: c.derrotas,
                saldo_pontos: c.saldo_pontos || 0,
            })),
            rodada_pc: rodadaPC, // Rodada da Liga PC (diferente da rodada Brasileirão)
            minha_posicao: posicaoAtual,
            posicao_anterior: posicaoAnterior,
            mudanca_posicao: mudancaPosicao, // +2 = subiu 2, -1 = caiu 1
            zona,
            vantagem_g4: parseFloat(vantagem_g4.toFixed(1)),
            proximo_confronto: proximoConfronto,
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} [PC] Erro:`, error);
        return null;
    }
}

/**
 * Calcula dados de Mata-Mata
 * @param {String} ligaId
 * @param {Number} rodada
 * @param {Number} timeId
 * @param {Number} temporada
 * @returns {Object} Confronto, fase, resultado, próxima fase
 */
export async function calcularMataMata(ligaId, rodada, timeId, temporada) {
    try {
        // Buscar todas as edições do mata-mata para esta liga/temporada
        const caches = await MataMataCache.find({
            liga_id: String(ligaId),
            temporada: temporada,
        })
            .sort({ edicao: -1 })
            .lean();

        if (!caches || caches.length === 0) {
            console.log(`${LOG_PREFIX} [MM] Nenhum cache encontrado`);
            return null;
        }

        // Iterar edições (mais recente primeiro) até encontrar o time
        for (const cache of caches) {
            const torneio = cache.dados_torneio;
            if (!torneio) continue;

            const tamanho = torneio.metadata?.tamanhoTorneio || cache.tamanhoTorneio || 16;
            const fases = getFasesParaTamanho(tamanho);

            let ultimaFase = null;
            let meuConfronto = null;
            let foiEliminado = false;

            // Iterar fases em ordem para encontrar a última participação do time
            for (const fase of fases) {
                const confrontos = torneio[fase];
                if (!confrontos || !Array.isArray(confrontos) || confrontos.length === 0) continue;

                const confronto = confrontos.find(c =>
                    Number(c.timeA?.timeId) === timeId || Number(c.timeB?.timeId) === timeId
                );

                if (confronto) {
                    ultimaFase = fase;
                    meuConfronto = confronto;

                    // Verificar se foi eliminado nesta fase
                    const souTimeA = Number(confronto.timeA?.timeId) === timeId;
                    const meusPts = parseFloat(souTimeA ? confronto.timeA?.pontos : confronto.timeB?.pontos) || 0;
                    const advPts = parseFloat(souTimeA ? confronto.timeB?.pontos : confronto.timeA?.pontos) || 0;

                    if (meusPts > 0 && advPts > 0 && meusPts < advPts) {
                        foiEliminado = true;
                    }
                }
            }

            // Se não encontrou o time em nenhuma fase desta edição, pular
            if (!ultimaFase || !meuConfronto) continue;

            // Montar resposta com dados reais
            const souTimeA = Number(meuConfronto.timeA?.timeId) === timeId;
            const eu = souTimeA ? meuConfronto.timeA : meuConfronto.timeB;
            const adversario = souTimeA ? meuConfronto.timeB : meuConfronto.timeA;

            const meusPontos = parseFloat(eu?.pontos) || 0;
            const advPontos = parseFloat(adversario?.pontos) || 0;

            // Determinar resultado
            let resultado = "pendente";
            if (meusPontos > 0 && advPontos > 0) {
                resultado = meusPontos > advPontos ? "classificado" : "eliminado";
            }

            // Calcular próxima fase
            let proximaFase = null;
            if (resultado === "classificado") {
                const idx = fases.indexOf(ultimaFase);
                if (idx >= 0 && idx < fases.length - 1) {
                    proximaFase = NOMES_FASES[fases[idx + 1]] || fases[idx + 1];
                }
            }

            // Montar chave completa da fase atual (todos os confrontos)
            const chaveCompleta = (torneio[ultimaFase] || []).map(c => ({
                jogo: c.jogo,
                timeA: {
                    nome: c.timeA?.nome_cartola || c.timeA?.nome_cartoleiro || "?",
                    pontos: parseFloat(c.timeA?.pontos) || 0,
                    timeId: Number(c.timeA?.timeId) || 0,
                },
                timeB: {
                    nome: c.timeB?.nome_cartola || c.timeB?.nome_cartoleiro || "?",
                    pontos: parseFloat(c.timeB?.pontos) || 0,
                    timeId: Number(c.timeB?.timeId) || 0,
                },
            }));

            return {
                edicao: cache.edicao,
                fase_atual: NOMES_FASES[ultimaFase] || ultimaFase,
                seu_confronto: {
                    voce: meusPontos,
                    adversario: {
                        nome: adversario?.nome_cartola || adversario?.nome_cartoleiro || "Adversário",
                        pontos: advPontos,
                        timeId: Number(adversario?.timeId) || 0,
                        escudo: adversario?.url_escudo_png || null,
                    },
                    resultado,
                    diferenca: truncarPontosNum(Math.abs(meusPontos - advPontos)),
                },
                proxima_fase: proximaFase,
                chave_completa: chaveCompleta,
            };
        }

        // Time não participou de nenhuma edição
        console.log(`${LOG_PREFIX} [MM] Time ${timeId} não encontrado em nenhuma edição`);
        return null;
    } catch (error) {
        console.error(`${LOG_PREFIX} [MM] Erro:`, error);
        return null;
    }
}

/**
 * Calcula dados de Artilheiro Campeão
 * @param {String} ligaId
 * @param {Number} rodada
 * @param {Number} timeId
 * @param {Number} temporada
 * @returns {Object} Classificação, posição, atacante da rodada
 */
export async function calcularArtilheiro(ligaId, rodada, timeId, temporada) {
    try {
        // ✅ v1.1: Usa GolsConsolidados diretamente (agregação) em vez de ArtilheiroCampeao
        // Isso garante que dados coletados via script apareçam no Raio-X
        let GolsConsolidados;
        try {
            GolsConsolidados = mongoose.model("GolsConsolidados");
        } catch (e) {
            // Model não registrado ainda, tentar registrar
            const GolsConsolidadosSchema = new mongoose.Schema({
                ligaId: String,
                timeId: Number,
                rodada: Number,
                temporada: Number,
                golsPro: { type: Number, default: 0 },
                golsContra: { type: Number, default: 0 },
                saldo: { type: Number, default: 0 },
                jogadores: [{ atletaId: Number, nome: String, gols: Number, golsContra: Number }],
            });
            GolsConsolidados = mongoose.model("GolsConsolidados", GolsConsolidadosSchema);
        }

        // Buscar todos os gols consolidados até a rodada atual
        const golsConsolidados = await GolsConsolidados.find({
            ligaId: String(ligaId),
            temporada: temporada,
            rodada: { $lte: rodada },
        }).lean();

        if (!golsConsolidados || golsConsolidados.length === 0) {
            console.log(`${LOG_PREFIX} [ART] Nenhum dado em GolsConsolidados para liga=${ligaId} temp=${temporada}`);
            return null;
        }

        // Agregar por timeId
        const agregado = {};
        const detalhePorTime = {}; // Para calcular mudanças de posição

        golsConsolidados.forEach(g => {
            const tid = g.timeId;
            if (!agregado[tid]) {
                agregado[tid] = {
                    timeId: tid,
                    nome: '', // Será preenchido depois
                    gols: 0,
                    golsContra: 0,
                    saldo: 0,
                };
                detalhePorTime[tid] = {};
            }
            agregado[tid].gols += g.golsPro || 0;
            agregado[tid].golsContra += g.golsContra || 0;
            agregado[tid].saldo += (g.golsPro || 0) - (g.golsContra || 0);

            // Guardar detalhe por rodada para calcular mudanças
            detalhePorTime[tid][g.rodada] = { golsPro: g.golsPro || 0 };
        });

        // Buscar nomes dos participantes via Rodada (mais confiável)
        const rodadaDoc = await Rodada.findOne({
            ligaId: mongoose.Types.ObjectId.isValid(ligaId) ? new mongoose.Types.ObjectId(ligaId) : ligaId,
            rodada: rodada,
            temporada: temporada,
        }).lean();

        if (rodadaDoc) {
            // Buscar todos os participantes da rodada para pegar os nomes
            const participantes = await Rodada.find({
                ligaId: mongoose.Types.ObjectId.isValid(ligaId) ? new mongoose.Types.ObjectId(ligaId) : ligaId,
                rodada: rodada,
                temporada: temporada,
            }, { timeId: 1, nome_cartola: 1 }).lean();

            participantes.forEach(p => {
                if (agregado[p.timeId]) {
                    agregado[p.timeId].nome = p.nome_cartola || `Time ${p.timeId}`;
                }
            });
        }

        // Converter para array e ordenar por gols (critério padrão)
        const ranking = Object.values(agregado)
            .sort((a, b) => {
                if (b.gols !== a.gols) return b.gols - a.gols;
                return b.saldo - a.saldo;
            });

        if (ranking.length === 0) {
            console.log(`${LOG_PREFIX} [ART] Ranking vazio após agregação`);
            return null;
        }

        const minhaPosicao = ranking.findIndex(r => r.timeId === timeId) + 1;
        const meusDados = ranking.find(r => r.timeId === timeId);

        // Detectar eventos especiais
        let perdeu_lideranca = false;
        let assumiu_lideranca = false;
        let rival = null;

        if (ranking.length > 1) {
            const lider = ranking[0];
            const segundo = ranking[1];

            // Se estou em 1º e há empate
            if (minhaPosicao === 1 && segundo.gols === lider.gols) {
                rival = segundo.nome;
            }

            // Recalcular ranking da rodada anterior
            if (rodada > 1) {
                const rankingAnterior = ranking
                    .map(r => {
                        const golsEstaRodada = detalhePorTime[r.timeId]?.[rodada]?.golsPro || 0;
                        return {
                            timeId: r.timeId,
                            gols: r.gols - golsEstaRodada,
                        };
                    })
                    .sort((a, b) => b.gols - a.gols);

                const minhaPosAnterior = rankingAnterior.findIndex(r => r.timeId === timeId) + 1;

                if (minhaPosicao === 1 && minhaPosAnterior > 1) {
                    assumiu_lideranca = true;
                } else if (minhaPosAnterior === 1 && minhaPosicao > 1) {
                    perdeu_lideranca = true;
                }
            }
        }

        // Buscar artilheiro da rodada específica
        let atletaRodada = null;
        const golsRodada = golsConsolidados.find(g => g.timeId === timeId && g.rodada === rodada);
        if (golsRodada && golsRodada.jogadores && golsRodada.jogadores.length > 0) {
            const artilheiroRodada = [...golsRodada.jogadores]
                .filter(j => j.gols > 0)
                .sort((a, b) => b.gols - a.gols)[0];

            if (artilheiroRodada) {
                atletaRodada = {
                    nome: artilheiroRodada.nome,
                    gols: artilheiroRodada.gols,
                    pontos: 0,
                };
            }
        }

        return {
            classificacao: ranking.slice(0, 5).map((r, i) => ({
                posicao: i + 1,
                timeId: r.timeId,
                nome: r.nome,
                gols: r.gols,
                saldo: r.saldo,
            })),
            sua_posicao: minhaPosicao,
            seus_gols: meusDados?.gols || 0,
            seu_saldo: meusDados?.saldo || 0,
            perdeu_lideranca,
            assumiu_lideranca,
            rival,
            seu_atacante_rodada: atletaRodada,
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} [ART] Erro:`, error);
        return null;
    }
}

/**
 * Extrai gols de uma rodada específica do detalhePorRodada
 * Trata tanto Map (mongoose) quanto Object/Array (após .lean())
 */
function extrairGolsDaRodada(detalhePorRodada, rodada) {
    if (!detalhePorRodada) return 0;

    // Caso 1: É um Object (Map convertido por .lean()) com chaves string
    if (typeof detalhePorRodada === "object" && !Array.isArray(detalhePorRodada)) {
        const entrada = detalhePorRodada[String(rodada)] || detalhePorRodada[rodada];
        return entrada?.golsPro || 0;
    }

    // Caso 2: É um Array (formato do controller)
    if (Array.isArray(detalhePorRodada)) {
        const entrada = detalhePorRodada.find(d => d.rodada === rodada || d.rodada === String(rodada));
        return entrada?.golsPro || 0;
    }

    return 0;
}

/**
 * Calcula dados de Luva de Ouro (similar ao Artilheiro, mas com goleiros e SGs)
 */
export async function calcularLuvaOuro(ligaId, rodada, timeId, temporada) {
    try {
        // Goleiros armazena 1 doc por participante/rodada.
        // Usar o método buscarRanking() do model que faz aggregation.
        const ranking = await Goleiros.buscarRanking(
            String(ligaId),
            1,    // rodadaInicio
            null, // rodadaFim (todas até a mais recente)
            temporada
        );

        if (!ranking || ranking.length === 0) {
            console.log(`${LOG_PREFIX} [LUVA] Nenhum dado de goleiros para liga=${ligaId} temp=${temporada}`);
            return null;
        }

        // ranking já vem ordenado por pontosTotais desc
        const minhaPosicao = ranking.findIndex(r => r.participanteId === timeId) + 1;
        const meusDados = ranking.find(r => r.participanteId === timeId);

        // Buscar goleiro da última rodada do participante
        let goleiroRodada = null;
        if (meusDados?.ultimaRodada) {
            goleiroRodada = {
                nome: meusDados.ultimaRodada.goleiroNome,
                pontos: meusDados.ultimaRodada.pontos || 0,
            };
        }

        return {
            classificacao: ranking.slice(0, 5).map((r, i) => ({
                posicao: i + 1,
                timeId: r.participanteId,
                nome: r.participanteNome,
                pontos: r.pontosTotais,
            })),
            sua_posicao: minhaPosicao,
            seus_pontos: meusDados?.pontosTotais || 0,
            rodadas_jogadas: meusDados?.rodadasJogadas || 0,
            seu_goleiro_rodada: goleiroRodada,
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} [LUVA] Erro:`, error);
        return null;
    }
}

/**
 * Calcula dados de Capitão de Luxo
 */
export async function calcularCapitaoLuxo(ligaId, rodada, timeId, temporada) {
    try {
        // CapitaoCaches armazena 1 doc por participante (ligaId é ObjectId).
        // Usar buscarRanking() do model que já ordena por pontuacao_total desc.
        const ranking = await CapitaoCaches.buscarRanking(ligaId, temporada);

        if (!ranking || ranking.length === 0) {
            console.log(`${LOG_PREFIX} [CAP] Nenhum dado de capitão para liga=${ligaId} temp=${temporada}`);
            return null;
        }

        const lider = ranking[0];
        const minhaPosicao = ranking.findIndex(r => r.timeId === timeId) + 1;
        const meusDados = ranking.find(r => r.timeId === timeId);

        // Buscar último capitão do participante via historico_rodadas
        let capitaoRodada = null;
        if (meusDados?.historico_rodadas?.length > 0) {
            const ultimoCapitao = [...meusDados.historico_rodadas]
                .sort((a, b) => b.rodada - a.rodada)[0];
            if (ultimoCapitao) {
                capitaoRodada = {
                    nome: ultimoCapitao.atleta_nome,
                    pontuacao: ultimoCapitao.pontuacao || 0,
                };
            }
        }

        return {
            classificacao_acumulada: ranking.slice(0, 5).map((r, i) => ({
                posicao: i + 1,
                timeId: r.timeId,
                nome: r.nome_cartola,
                pontos: r.pontuacao_total,
                diferenca: i === 0 ? 0 : truncarPontosNum(r.pontuacao_total - lider.pontuacao_total),
            })),
            sua_posicao: minhaPosicao,
            seus_pontos: meusDados?.pontuacao_total || 0,
            media_capitao: meusDados?.media_capitao || 0,
            seu_capitao_rodada: capitaoRodada,
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} [CAP] Erro:`, error);
        return null;
    }
}

/**
 * Calcula dados de Melhor do Mês
 */
export async function calcularMelhorMes(ligaId, rodada, timeId, temporada) {
    try {
        // Determinar o mês atual
        const data = new Date();
        const mes = data.getMonth() + 1; // 1-12
        const ano = data.getFullYear();

        const cache = await MelhorMesCache.findOne({
            liga_id: String(ligaId),
            mes: mes,
            ano: ano,
            temporada: temporada,
        }).lean();

        if (!cache || !cache.ranking) {
            console.log(`${LOG_PREFIX} [MES] Cache não encontrado para ${mes}/${ano}`);
            return null;
        }

        const ranking = cache.ranking
            .map(r => ({
                timeId: r.timeId,
                nome: r.nomeCartoleiro || r.nome,
                pontos: r.pontos || 0,
            }))
            .sort((a, b) => b.pontos - a.pontos);

        const minhaPosicao = ranking.findIndex(r => r.timeId === timeId) + 1;
        const lider = ranking[0];
        const meusDados = ranking.find(r => r.timeId === timeId);

        // Calcular rodadas restantes no mês (estimativa)
        const rodadasRestantes = cache.rodadasRestantes || 0;

        return {
            mes: mes,
            ano: ano,
            classificacao: ranking.slice(0, 5).map((r, i) => ({
                posicao: i + 1,
                ...r,
                diferenca: i === 0 ? 0 : truncarPontosNum(r.pontos - lider.pontos),
            })),
            sua_posicao: minhaPosicao,
            seus_pontos: meusDados?.pontos || 0,
            rodadas_restantes: rodadasRestantes,
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} [MES] Erro:`, error);
        return null;
    }
}

/**
 * Extrai ordem canônica dos IDs a partir do cache PC mais recente.
 * Replica lógica de extrairOrdemDoCache do controller.
 */
function _extrairOrdemCanonica(caches) {
    const cacheBase = [...caches]
        .sort((a, b) => (b.rodada_consolidada || 0) - (a.rodada_consolidada || 0))
        .find(c => c.confrontos?.length > 0);

    if (!cacheBase) return null;

    const rodadaNum = cacheBase.rodada_consolidada;
    const confrontos = cacheBase.confrontos;
    const n = confrontos.length * 2;

    // Reconstruir a lista na posição da rodada R
    const listaRodada = new Array(n);
    for (let i = 0; i < confrontos.length; i++) {
        listaRodada[i] = String(confrontos[i].time1?.id || confrontos[i].time1);
        listaRodada[n - 1 - i] = String(confrontos[i].time2?.id || confrontos[i].time2);
    }

    // Desfazer (R-1) rotações para obter a lista original
    const lista = [...listaRodada];
    for (let r = 0; r < rodadaNum - 1; r++) {
        const x = lista.splice(1, 1)[0];
        lista.push(x);
    }

    return lista;
}

/**
 * Gera bracket round-robin completo a partir de lista de IDs.
 * Replica lógica de gerarBracketFromIds do controller.
 */
function _gerarBracketRoundRobin(listaIds) {
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

export default {
    calcularPontosCorridos,
    calcularMataMata,
    calcularArtilheiro,
    calcularLuvaOuro,
    calcularCapitaoLuxo,
    calcularMelhorMes,
};
