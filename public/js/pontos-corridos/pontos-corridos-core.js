// PONTOS CORRIDOS CORE - v2.4 REFATORADO
// Salva cada rodada INDIVIDUALMENTE no MongoDB
// Responsável por: processamento de dados, chamadas de API e CACHE INTELIGENTE
// ✅ v2.1: Correção do limite de rodadas (liga encerrada)
// ✅ v2.2: Adicionado nome_cartola em classificação e confrontos
// ✅ v2.3: CORREÇÃO do mapeamento nome_cartola (campo correto do MongoDB)
// ✅ v2.4: Implementação de pontosGoleada (PG) - bônus +4 por goleada aplicada

import {
    RODADAS_ENDPOINTS,
    STATUS_MERCADO_DEFAULT,
} from "../rodadas/rodadas-config.js";

import { PONTOS_CORRIDOS_CONFIG, getLigaId } from "./pontos-corridos-config.js";

// ESTADO GLOBAL
let statusMercadoGlobal = STATUS_MERCADO_DEFAULT;
let getRankingRodadaEspecifica = null;

// ============================================================================
// 🧠 SISTEMA DE CACHE - OPERAÇÕES INDIVIDUAIS POR RODADA
// ============================================================================

async function lerCacheRodada(ligaId, rodadaLiga) {
    try {
        const response = await fetch(
            `/api/pontos-corridos/cache/${ligaId}?rodada=${rodadaLiga}&_=${Date.now()}`,
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (data.cached && data.confrontos?.length > 0) {
            console.log(
                `[CORE] 💾 Cache R${rodadaLiga} encontrado (${data.confrontos.length} confrontos)`,
            );
            return {
                confrontos: data.confrontos,
                classificacao: data.classificacao || [],
                permanent: data.permanent,
            };
        }
        return null;
    } catch (error) {
        console.warn(
            `[CORE] ⚠️ Erro ao ler cache R${rodadaLiga}:`,
            error.message,
        );
        return null;
    }
}

async function salvarCacheRodada(
    ligaId,
    rodadaLiga,
    confrontos,
    classificacao,
    isPermanent = false,
) {
    try {
        const response = await fetch(`/api/pontos-corridos/cache/${ligaId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                rodada: rodadaLiga,
                confrontos: confrontos,
                classificacao: classificacao,
                permanent: isPermanent,
            }),
        });

        if (response.ok) {
            const tipo = isPermanent ? "PERMANENTE" : "temporário";
            console.log(
                `[CORE] 💾 Cache ${tipo} salvo: R${rodadaLiga} (${confrontos.length} confrontos)`,
            );
            return true;
        }
        return false;
    } catch (error) {
        console.error(`[CORE] ❌ Erro ao salvar cache R${rodadaLiga}:`, error);
        return false;
    }
}

async function buscarTodosOsCaches(ligaId) {
    try {
        // ✅ FIX: incluir temporada obrigatória (sem ela a rota retorna 400)
        const temporada = PONTOS_CORRIDOS_CONFIG.temporada || new Date().getFullYear();
        const response = await fetch(`/api/pontos-corridos/${ligaId}?temporada=${temporada}`);
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.warn("[CORE] ⚠️ Erro ao buscar caches:", error.message);
        return [];
    }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

export function setRankingFunction(rankingFunction) {
    getRankingRodadaEspecifica = rankingFunction;
}

export async function atualizarStatusMercado() {
    try {
        const res = await fetch(RODADAS_ENDPOINTS.mercadoStatus);
        if (res.ok) {
            const data = await res.json();
            statusMercadoGlobal = {
                rodada_atual: data.rodada_atual,
                status_mercado: data.status_mercado,
            };
        }
    } catch (err) {
        console.error("[CORE] Erro ao buscar status do mercado:", err);
    }
}

export function getStatusMercado() {
    return statusMercadoGlobal;
}

export async function buscarTimesLiga(ligaId) {
    try {
        const response = await fetch(`/api/ligas/${ligaId}/times`);
        if (!response.ok) throw new Error("Falha ao carregar times");
        const times = await response.json();

        // ✅ v2.3: Enriquecer com nome_cartola da collection rodadas
        // A collection rodadas tem nome_cartola correto
        try {
            const rodadasRes = await fetch(
                `/api/rodadas/${ligaId}/rodadas?inicio=7&fim=7`,
            );
            if (rodadasRes.ok) {
                const rodadasData = await rodadasRes.json();
                const dadosArray = Array.isArray(rodadasData)
                    ? rodadasData
                    : rodadasData.data || [];

                // Criar mapa de nome_cartola por timeId
                const cartolaMap = {};
                dadosArray.forEach((r) => {
                    if (r.timeId && r.nome_cartola) {
                        cartolaMap[String(r.timeId)] = r.nome_cartola;
                    }
                });

                // Enriquecer times com nome_cartola
                times.forEach((time) => {
                    const tid = String(time.id || time.time_id);
                    if (cartolaMap[tid] && !time.nome_cartola) {
                        time.nome_cartola = cartolaMap[tid];
                    }
                });

                console.log(
                    `[CORE] ✅ Times enriquecidos com ${Object.keys(cartolaMap).length} nomes de cartoleiros`,
                );
            }
        } catch (e) {
            console.warn(
                "[CORE] ⚠️ Não foi possível enriquecer times com nome_cartola:",
                e.message,
            );
        }

        return times;
    } catch (error) {
        console.error("[CORE] Erro ao buscar times:", error);
        return [];
    }
}

export function getRodadaPontosText(rodadaLiga) {
    if (!rodadaLiga) return "Rodada não definida";
    const rodadaBr = PONTOS_CORRIDOS_CONFIG.rodadaInicial + (rodadaLiga - 1);
    return `${rodadaLiga}ª Rodada da Liga (${rodadaBr}ª do Brasileirão)`;
}

export function gerarConfrontos(times) {
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

export function calcularFinanceiroConfronto(
    pontosA,
    pontosB,
    config = PONTOS_CORRIDOS_CONFIG,
) {
    const A = parseFloat(pontosA || 0);
    const B = parseFloat(pontosB || 0);
    const diferenca = Math.abs(A - B);

    const { empateTolerancia, goleadaMinima } = config.criterios;
    const fin = config.financeiro;

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
        // ✅ v2.4: Goleada = 3 pts vitória + 1 pt bônus = 4 pts
        console.log(
            `[CORE] ⚡ Goleada detectada! Diferença: ${diferenca.toFixed(1)} >= ${goleadaMinima}`,
        );
        return A > B
            ? {
                  financeiroA: fin.goleada,
                  financeiroB: -fin.goleada,
                  pontosA: 4,
                  pontosB: 0,
                  tipo: "goleada",
              }
            : {
                  financeiroA: -fin.goleada,
                  financeiroB: fin.goleada,
                  pontosA: 0,
                  pontosB: 4,
                  tipo: "goleada",
              };
    }

    return A > B
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

// ============================================================================
// ✅ v2.3: Função auxiliar para extrair nome do time e cartoleiro
// Suporta múltiplas estruturas de dados (API Cartola, MongoDB, etc)
// ============================================================================

function extrairNomes(time) {
    // Prioridade para nome do TIME:
    // 1. nome_time (campo correto do MongoDB)
    // 2. nome (fallback se for o nome do time)
    const nomeTime = time.nome_time || time.nome || "N/D";

    // Prioridade para nome do CARTOLEIRO:
    // 1. nome_cartola (campo correto do MongoDB)
    // 2. nome (se nome_time existir, então nome pode ser cartoleiro - API Cartola)
    // 3. Vazio se não encontrar
    let nomeCartoleiro = "";

    if (time.nome_cartola) {
        // Campo correto do MongoDB
        nomeCartoleiro = time.nome_cartola;
    } else if (time.nome_time && time.nome && time.nome !== time.nome_time) {
        // API Cartola: time.nome = cartoleiro quando time.nome_time existe
        nomeCartoleiro = time.nome;
    }

    return { nomeTime, nomeCartoleiro };
}

// ============================================================================
// ⚡ FUNÇÃO PRINCIPAL - PROCESSA CONFRONTOS E SALVA CADA RODADA
// ============================================================================

export async function getConfrontosLigaPontosCorridos(ligaId, rodadaAtualLiga) {
    console.log(
        `[CORE] 🚀 Processando Pontos Corridos até R${rodadaAtualLiga}...`,
    );

    try {
        // 1. Buscar todos os caches existentes
        const cachesExistentes = await buscarTodosOsCaches(ligaId);
        const rodadasComCache = new Set(cachesExistentes.map((c) => c.rodada));

        console.log(`[CORE] 📦 ${rodadasComCache.size} rodadas já em cache`);

        // 2. Identificar rodadas que faltam
        const rodadasFaltando = [];
        for (let r = 1; r <= rodadaAtualLiga; r++) {
            if (!rodadasComCache.has(r)) {
                rodadasFaltando.push(r);
            }
        }

        // Se não falta nada, retorna do cache
        if (rodadasFaltando.length === 0) {
            console.log(
                `[CORE] ✅ Todas as ${rodadaAtualLiga} rodadas em cache`,
            );
            return {
                confrontos: cachesExistentes.filter(
                    (c) => c.rodada <= rodadaAtualLiga,
                ),
                classificacao:
                    cachesExistentes.find((c) => c.rodada === rodadaAtualLiga)
                        ?.classificacao || [],
            };
        }

        console.log(
            `[CORE] ⚙️ Calculando ${rodadasFaltando.length} rodadas: [${rodadasFaltando.join(", ")}]`,
        );

        // 3. Buscar times e gerar confrontos base
        const times = await buscarTimesLiga(ligaId);
        if (!times.length) {
            console.error("[CORE] ❌ Nenhum time encontrado");
            return { confrontos: [], classificacao: [] };
        }

        const confrontosBase = gerarConfrontos(times);

        // 4. Carregar função de ranking se necessário
        if (!getRankingRodadaEspecifica) {
            try {
                const rodadasModule = await import("../rodadas.js");
                getRankingRodadaEspecifica =
                    rodadasModule.getRankingRodadaEspecifica;
            } catch (e) {
                console.error("[CORE] ❌ Função de ranking indisponível");
                return { confrontos: [], classificacao: [] };
            }
        }

        // 5. Inicializar classificação acumulada
        // ✅ v2.3: Usando função extrairNomes para mapear corretamente
        const classificacaoAcumulada = {};
        times.forEach((time) => {
            const tid = String(time.id || time.time_id);
            const { nomeTime, nomeCartoleiro } = extrairNomes(time);

            classificacaoAcumulada[tid] = {
                timeId: tid,
                nome: nomeTime,
                nome_cartola: nomeCartoleiro,
                escudo:
                    time.url_escudo_png || time.foto_time || time.escudo || "",
                pontos: 0,
                jogos: 0,
                vitorias: 0,
                empates: 0,
                derrotas: 0,
                pontosGoleada: 0, // ✅ v2.4: PG - pontos bônus por goleada aplicada
                gols_pro: 0,
                gols_contra: 0,
                saldo_gols: 0,
                financeiro: 0,
            };
        });

        // 6. Carregar classificação anterior se houver
        const ultimoCache = cachesExistentes
            .filter((c) => c.rodada < rodadasFaltando[0])
            .sort((a, b) => b.rodada - a.rodada)[0];

        if (ultimoCache?.classificacao) {
            ultimoCache.classificacao.forEach((t) => {
                const tid = String(t.timeId || t.time_id);
                if (classificacaoAcumulada[tid]) {
                    Object.assign(classificacaoAcumulada[tid], {
                        pontos: t.pontos || 0,
                        jogos: t.jogos || 0,
                        vitorias: t.vitorias || 0,
                        empates: t.empates || 0,
                        derrotas: t.derrotas || 0,
                        pontosGoleada: t.pontosGoleada || 0, // ✅ v2.4
                        gols_pro: t.gols_pro || 0,
                        gols_contra: t.gols_contra || 0,
                        saldo_gols: t.saldo_gols || 0,
                        financeiro: t.financeiro || 0,
                    });
                }
            });
            console.log(
                `[CORE] 📊 Classificação carregada de R${ultimoCache.rodada}`,
            );
        }

        // 7. Processar cada rodada faltante
        const statusMercado = getStatusMercado();
        const todosConfrontos = [
            ...cachesExistentes.filter((c) => c.rodada < rodadasFaltando[0]),
        ];

        for (const rodadaLiga of rodadasFaltando) {
            const jogosDaRodada = confrontosBase[rodadaLiga - 1];
            if (!jogosDaRodada) continue;

            // Buscar pontuações da rodada
            const rodadaBr =
                PONTOS_CORRIDOS_CONFIG.rodadaInicial + (rodadaLiga - 1);
            let pontuacoes = {};

            try {
                const ranking = await getRankingRodadaEspecifica(
                    ligaId,
                    rodadaBr,
                );
                if (Array.isArray(ranking)) {
                    ranking.forEach((p) => {
                        const tid = String(p.time_id || p.timeId || p.id);
                        pontuacoes[tid] = p.pontos;
                    });
                }
            } catch (err) {
                console.warn(
                    `[CORE] ⚠️ Erro ao buscar R${rodadaBr}:`,
                    err.message,
                );
            }

            // Se não tem pontuações, pular rodada
            if (Object.keys(pontuacoes).length === 0) {
                console.log(
                    `[CORE] ⏭️ R${rodadaLiga} sem pontuações, pulando...`,
                );
                continue;
            }

            // Processar confrontos da rodada
            const confrontosRodada = [];

            for (const jogo of jogosDaRodada) {
                const tidA = String(jogo.timeA.id || jogo.timeA.time_id);
                const tidB = String(jogo.timeB.id || jogo.timeB.time_id);

                const pontosA = pontuacoes[tidA] ?? null;
                const pontosB = pontuacoes[tidB] ?? null;

                const resultado = calcularFinanceiroConfronto(pontosA, pontosB);

                // Atualizar classificação acumulada
                if (pontosA !== null && pontosB !== null) {
                    // Time A
                    if (classificacaoAcumulada[tidA]) {
                        classificacaoAcumulada[tidA].jogos += 1;
                        classificacaoAcumulada[tidA].pontos +=
                            resultado.pontosA;
                        classificacaoAcumulada[tidA].gols_pro += pontosA;
                        classificacaoAcumulada[tidA].gols_contra += pontosB;
                        classificacaoAcumulada[tidA].saldo_gols =
                            classificacaoAcumulada[tidA].gols_pro -
                            classificacaoAcumulada[tidA].gols_contra;
                        classificacaoAcumulada[tidA].financeiro +=
                            resultado.financeiroA;
                        // ✅ v2.4: Vitória = 3 pts, Goleada = 4 pts
                        if (resultado.pontosA >= 3)
                            classificacaoAcumulada[tidA].vitorias += 1;
                        else if (resultado.pontosA === 1)
                            classificacaoAcumulada[tidA].empates += 1;
                        else classificacaoAcumulada[tidA].derrotas += 1;

                        // ✅ v2.4: PG - bônus por goleada aplicada (só vencedor, +1 pt)
                        if (
                            resultado.tipo === "goleada" &&
                            resultado.pontosA === 4
                        ) {
                            classificacaoAcumulada[tidA].pontosGoleada += 1;
                            console.log(
                                `[CORE] 🎯 GOLEADA! ${jogo.timeA.nome || tidA} venceu por ${Math.abs(pontosA - pontosB).toFixed(1)} pts de diferença (PG: ${classificacaoAcumulada[tidA].pontosGoleada})`,
                            );
                        }
                    }

                    // Time B
                    if (classificacaoAcumulada[tidB]) {
                        classificacaoAcumulada[tidB].jogos += 1;
                        classificacaoAcumulada[tidB].pontos +=
                            resultado.pontosB;
                        classificacaoAcumulada[tidB].gols_pro += pontosB;
                        classificacaoAcumulada[tidB].gols_contra += pontosA;
                        classificacaoAcumulada[tidB].saldo_gols =
                            classificacaoAcumulada[tidB].gols_pro -
                            classificacaoAcumulada[tidB].gols_contra;
                        classificacaoAcumulada[tidB].financeiro +=
                            resultado.financeiroB;
                        // ✅ v2.4: Vitória = 3 pts, Goleada = 4 pts
                        if (resultado.pontosB >= 3)
                            classificacaoAcumulada[tidB].vitorias += 1;
                        else if (resultado.pontosB === 1)
                            classificacaoAcumulada[tidB].empates += 1;
                        else classificacaoAcumulada[tidB].derrotas += 1;

                        // ✅ v2.4: PG - bônus por goleada aplicada (só vencedor, +1 pt)
                        if (
                            resultado.tipo === "goleada" &&
                            resultado.pontosB === 4
                        ) {
                            classificacaoAcumulada[tidB].pontosGoleada += 1;
                            console.log(
                                `[CORE] 🎯 GOLEADA! ${jogo.timeB.nome || tidB} venceu por ${Math.abs(pontosA - pontosB).toFixed(1)} pts de diferença (PG: ${classificacaoAcumulada[tidB].pontosGoleada})`,
                            );
                        }
                    }
                }

                // ✅ v2.3: Usando função extrairNomes para confrontos
                const nomesA = extrairNomes(jogo.timeA);
                const nomesB = extrairNomes(jogo.timeB);

                confrontosRodada.push({
                    time1: {
                        id: tidA,
                        nome: nomesA.nomeTime,
                        nome_cartola: nomesA.nomeCartoleiro,
                        escudo:
                            jogo.timeA.url_escudo_png ||
                            jogo.timeA.foto_time ||
                            jogo.timeA.escudo ||
                            "",
                        pontos: pontosA,
                    },
                    time2: {
                        id: tidB,
                        nome: nomesB.nomeTime,
                        nome_cartola: nomesB.nomeCartoleiro,
                        escudo:
                            jogo.timeB.url_escudo_png ||
                            jogo.timeB.foto_time ||
                            jogo.timeB.escudo ||
                            "",
                        pontos: pontosB,
                    },
                    diferenca:
                        pontosA !== null && pontosB !== null
                            ? Math.abs(pontosA - pontosB)
                            : null,
                    valor: Math.max(
                        resultado.financeiroA,
                        resultado.financeiroB,
                        0,
                    ),
                    tipo: resultado.tipo,
                });
            }

            // Ordenar classificação
            const classificacaoOrdenada = Object.values(classificacaoAcumulada)
                .sort((a, b) => {
                    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
                    if (b.saldo_gols !== a.saldo_gols)
                        return b.saldo_gols - a.saldo_gols;
                    return b.vitorias - a.vitorias;
                })
                .map((t, idx) => ({ ...t, posicao: idx + 1 }));

            // Salvar cache da rodada
            const isPermanent = statusMercado.rodada_atual > rodadaBr;
            await salvarCacheRodada(
                ligaId,
                rodadaLiga,
                confrontosRodada,
                classificacaoOrdenada,
                isPermanent,
            );

            // Adicionar aos resultados
            todosConfrontos.push({
                rodada: rodadaLiga,
                confrontos: confrontosRodada,
                classificacao: classificacaoOrdenada,
            });
        }

        // Ordenar por rodada
        todosConfrontos.sort((a, b) => a.rodada - b.rodada);

        // Fallback: quando a rodada alvo ainda não tem scores (skippada),
        // usar classificação da última rodada com dados disponíveis
        const rodadaAlvo = todosConfrontos.find((c) => c.rodada === rodadaAtualLiga);
        const classificacaoFinal = rodadaAlvo?.classificacao?.length > 0
            ? rodadaAlvo.classificacao
            : ([...todosConfrontos]
                .sort((a, b) => b.rodada - a.rodada)
                .find((c) => c.classificacao?.length > 0)?.classificacao || []);

        const ultimaRodadaUsada = rodadaAlvo?.classificacao?.length > 0
            ? rodadaAtualLiga
            : (todosConfrontos.filter(c => c.classificacao?.length > 0).length > 0
                ? Math.max(...todosConfrontos.filter(c => c.classificacao?.length > 0).map(c => c.rodada))
                : 0);

        console.log(
            `[CORE] ✅ Processamento concluído: ${todosConfrontos.length} rodadas (classificação de R${ultimaRodadaUsada})`,
        );

        return {
            confrontos: todosConfrontos,
            classificacao: classificacaoFinal,
            ultimaRodadaComDados: ultimaRodadaUsada,
        };
    } catch (error) {
        console.error("[CORE] ❌ Erro fatal:", error);
        return { confrontos: [], classificacao: [] };
    }
}

// ============================================================================
// CALCULAR CLASSIFICAÇÃO (Para compatibilidade)
// ✅ v2.1: Correção do limite de rodadas
// ============================================================================

export async function calcularClassificacao(
    ligaId,
    times,
    confrontos,
    rodadaAtualBrasileirao,
) {
    // ✅ v2.1: Calcular máximo de rodadas baseado no número de times
    const totalTimes = Array.isArray(times) ? times.length : 0;
    const maxRodadasLiga = totalTimes > 1 ? totalTimes - 1 : 31; // fallback para 31

    // Calcular rodada da liga (limitada ao máximo)
    let rodadaLiga =
        rodadaAtualBrasileirao - PONTOS_CORRIDOS_CONFIG.rodadaInicial + 1;

    // ✅ v2.1: Limitar ao máximo de rodadas da liga
    if (rodadaLiga > maxRodadasLiga) {
        console.log(
            `[CORE] ⚠️ Rodada calculada (${rodadaLiga}) excede máximo (${maxRodadasLiga}). Usando última rodada.`,
        );
        rodadaLiga = maxRodadasLiga;
    }

    if (rodadaLiga < 1) {
        console.log(
            "[CORE] ⚠️ Rodada do Brasileirão anterior ao início do Pontos Corridos",
        );
        return {
            classificacao: [],
            confrontos: [],
            houveErro: false,
            fromCache: false,
        };
    }

    console.log(
        `[CORE] 📊 Buscando classificação: R${rodadaLiga} Liga (R${rodadaAtualBrasileirao} BR, max: ${maxRodadasLiga})`,
    );

    // Verificar cache primeiro
    const cache = await lerCacheRodada(ligaId, rodadaLiga);
    if (cache?.classificacao?.length > 0) {
        return {
            classificacao: cache.classificacao,
            confrontos: cache.confrontos,
            ultimaRodadaComDados: rodadaAtualBrasileirao,
            houveErro: false,
            fromCache: true,
        };
    }

    // Calcular usando função principal
    const resultado = await getConfrontosLigaPontosCorridos(ligaId, rodadaLiga);

    // Usar ultimaRodadaComDados do resultado quando a rodada alvo não tinha dados
    const ultimaRodada = resultado.ultimaRodadaComDados
        ? PONTOS_CORRIDOS_CONFIG.rodadaInicial + resultado.ultimaRodadaComDados - 1
        : rodadaAtualBrasileirao;

    return {
        classificacao: resultado.classificacao,
        confrontos: resultado.confrontos,
        ultimaRodadaComDados: ultimaRodada,
        houveErro: false,
        fromCache: false,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const buscarStatusMercado = atualizarStatusMercado;
export { getLigaId };

// Exports adicionais para compatibilidade
// ✅ v2.3: Usando função extrairNomes
export function normalizarDadosParaExportacao(jogo, pontuacoesMap = {}) {
    const tidA = jogo.timeA?.id || jogo.timeA?.time_id;
    const tidB = jogo.timeB?.id || jogo.timeB?.time_id;

    const nomesA = extrairNomes(jogo.timeA || {});
    const nomesB = extrairNomes(jogo.timeB || {});

    return {
        time1: {
            id: tidA,
            nome_time: nomesA.nomeTime,
            nome_cartola: nomesA.nomeCartoleiro,
            foto_perfil: jogo.timeA?.foto_perfil || "",
            foto_time: jogo.timeA?.foto_time || jogo.timeA?.escudo || "",
        },
        time2: {
            id: tidB,
            nome_time: nomesB.nomeTime,
            nome_cartola: nomesB.nomeCartoleiro,
            foto_perfil: jogo.timeB?.foto_perfil || "",
            foto_time: jogo.timeB?.foto_time || jogo.timeB?.escudo || "",
        },
        pontos1: pontuacoesMap[tidA] || null,
        pontos2: pontuacoesMap[tidB] || null,
    };
}

export function normalizarClassificacaoParaExportacao(classificacao) {
    if (!Array.isArray(classificacao)) return [];
    return classificacao.map((t) => ({
        time_id: t.timeId || t.time_id,
        nome_time: t.nome || t.nome_time || "N/D",
        nome_cartola: t.nome_cartola || "",
        escudo: t.escudo || "",
        pontos: t.pontos || 0,
        vitorias: t.vitorias || 0,
        empates: t.empates || 0,
        derrotas: t.derrotas || 0,
        pontosGoleada: t.pontosGoleada || 0, // ✅ v2.4
        gols_pro: t.gols_pro || 0,
        gols_contra: t.gols_contra || 0,
        saldo_gols: t.saldo_gols || 0,
        financeiro: t.financeiro || 0,
    }));
}

export async function processarDadosRodada(ligaId, rodadaCartola, jogos) {
    const pontuacoesMap = {};
    try {
        if (getRankingRodadaEspecifica) {
            const ranking = await getRankingRodadaEspecifica(
                ligaId,
                rodadaCartola,
            );
            if (Array.isArray(ranking)) {
                ranking.forEach((p) => {
                    const tid = p.time_id || p.timeId || p.id;
                    pontuacoesMap[tid] = p.pontos || 0;
                });
            }
        }
    } catch (error) {
        console.warn(
            `[CORE] Erro ao buscar pontuações R${rodadaCartola}:`,
            error,
        );
    }
    return { pontuacoesMap };
}

export function validarDadosEntrada(times, confrontos) {
    if (!Array.isArray(times) || times.length === 0)
        throw new Error("Times inválidos ou vazios");
    if (!Array.isArray(confrontos) || confrontos.length === 0)
        throw new Error("Confrontos inválidos ou vazios");
    return true;
}

console.log(
    "[PONTOS-CORRIDOS-CORE] ✅ v2.4 carregado (pontosGoleada implementado)",
);
