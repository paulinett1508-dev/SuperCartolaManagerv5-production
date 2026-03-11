import RodadaSnapshot from "../models/RodadaSnapshot.js";
import Rodada from "../models/Rodada.js";
import Liga from "../models/Liga.js";
import SchedulerState from "../models/SchedulerState.js";
import marketGate from "./marketGate.js";
import { CURRENT_SEASON } from "../config/seasons.js";

// ============================================================================
// ⏰ SCHEDULER DE CONSOLIDAÇÃO AUTOMÁTICA - v4.0
// v4.0: PERSISTÊNCIA DE ESTADO + SAFETY NET ROBUSTO
//   - ultimoStatusMercado persistido no MongoDB (sobrevive restart)
//   - garantirRodadaConsolidada verifica TODAS as rodadas passadas
//   - Não faz break após primeira liga sem consolidação
// v3.0: POPULA rodadas automaticamente antes de consolidar
// v2.0: Usa MarketGate singleton ao invés de fetch direto
// ============================================================================

let ultimoStatusMercado = null;
let schedulerAtivo = false;
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Busca status do mercado via MarketGate (centralizado)
async function getStatusMercado() {
    try {
        const status = await marketGate.fetchStatus();
        return status;
    } catch (error) {
        console.error(
            "[SCHEDULER] Erro ao buscar status mercado:",
            error.message,
        );
        return null;
    }
}

// ============================================================================
// ✅ v3.0: POPULAR RODADA AUTOMATICAMENTE
// Chama o endpoint POST /api/rodadas/:ligaId/rodadas para buscar dados da API Cartola
// ============================================================================

async function popularRodadaParaLiga(ligaId, ligaNome, rodada) {
    try {
        const url = `${BASE_URL}/api/rodadas/${ligaId}/rodadas`;

        console.log(`[SCHEDULER] 📥 Populando R${rodada} para liga ${ligaNome}...`);

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rodada }),
        });

        const result = await response.json();

        if (result.success) {
            console.log(
                `[SCHEDULER] ✅ Liga ${ligaNome} R${rodada} populada: ${result.resumo?.atualizadas || 0} registros`,
            );
            return true;
        } else {
            console.error(
                `[SCHEDULER] ❌ Liga ${ligaNome} R${rodada} falhou ao popular:`,
                result.error,
            );
            return false;
        }
    } catch (error) {
        console.error(
            `[SCHEDULER] ❌ Erro ao popular R${rodada} para liga ${ligaNome}:`,
            error.message,
        );
        return false;
    }
}

// ============================================================================
// ✅ v3.0: VERIFICAR E POPULAR RODADAS FALTANTES
// Verifica se existem dados na collection "rodadas" para a temporada atual
// Se não, popula automaticamente
// ============================================================================

async function garantirRodadasPopuladas(rodadaFinal) {
    if (rodadaFinal < 1) return;

    try {
        const ligas = await Liga.find({ ativa: { $ne: false } }).select("_id nome").lean();

        for (const liga of ligas) {
            for (let rodada = 1; rodada <= rodadaFinal; rodada++) {
                // Verificar se existem dados para esta rodada/temporada
                const existente = await Rodada.findOne({
                    ligaId: liga._id,
                    rodada: rodada,
                    temporada: CURRENT_SEASON,
                }).lean();

                if (!existente) {
                    console.log(
                        `[SCHEDULER] ⚠️ Liga ${liga.nome} R${rodada} T${CURRENT_SEASON} sem dados, populando...`,
                    );
                    await popularRodadaParaLiga(liga._id.toString(), liga.nome, rodada);

                    // Delay entre chamadas para não sobrecarregar a API Cartola
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }
        }
    } catch (error) {
        console.error("[SCHEDULER] ❌ Erro ao garantir rodadas populadas:", error.message);
    }
}

// Verifica se deve consolidar
async function verificarEConsolidar() {
    try {
        const statusAtual = await getStatusMercado();

        if (!statusAtual) {
            console.log(
                "[SCHEDULER] ⚠️ Não foi possível obter status do mercado",
            );
            return;
        }

        const rodadaAtual = statusAtual.rodada_atual;
        const mercadoAberto = statusAtual.status_mercado === 1; // 1 = aberto, 2 = fechado

        console.log(
            `[SCHEDULER] 📊 Status: Rodada ${rodadaAtual}, Mercado ${mercadoAberto ? "ABERTO" : "FECHADO"}, Temporada ${CURRENT_SEASON}`,
        );

        // ✅ v3.0: Garantir que TODAS as rodadas finalizadas estejam populadas
        // Quando mercado está aberto para rodada X, rodadas 1 até X-1 estão finalizadas
        // Quando mercado está fechado (jogos em andamento), rodadas 1 até X-1 também
        const ultimaRodadaFinalizada = mercadoAberto ? rodadaAtual - 1 : rodadaAtual - 1;

        if (ultimaRodadaFinalizada >= 1) {
            await garantirRodadasPopuladas(ultimaRodadaFinalizada);
        }

        // Detectar transição: mercado abriu (era fechado, agora aberto)
        // Isso significa que uma rodada acabou de ser finalizada
        if (
            ultimoStatusMercado?.status_mercado === 2 &&
            statusAtual.status_mercado === 1
        ) {
            const rodadaFinalizada = rodadaAtual - 1;

            // v4.1: Verificar se orchestrator já consolidou esta rodada (evitar trabalho duplicado)
            const jaConsolidadaPeloOrchestrator = await RodadaSnapshot.findOne({
                rodada: rodadaFinalizada,
                status: "consolidada",
            }).lean();

            if (jaConsolidadaPeloOrchestrator) {
                console.log(
                    `[SCHEDULER] ⏭️ R${rodadaFinalizada} já consolidada (orchestrator processou primeiro)`,
                );
            } else {
                console.log(
                    `[SCHEDULER] 🔔 TRANSIÇÃO DETECTADA: Mercado abriu! R${rodadaFinalizada} finalizada - populando e consolidando`,
                );

                // Primeiro popular, depois consolidar
                await popularRodadaParaTodasLigas(rodadaFinalizada);
                await consolidarRodadaAutomatica(rodadaFinalizada);
            }
        }

        // Detectar transição: mercado fechou (era aberto, agora fechado)
        if (
            ultimoStatusMercado?.status_mercado === 1 &&
            statusAtual.status_mercado === 2
        ) {
            console.log(
                `[SCHEDULER] 🔔 TRANSIÇÃO DETECTADA: Mercado fechou! Rodada ${rodadaAtual} em andamento`,
            );
        }

        // ✅ v4.0: Garantir consolidação independente do status do mercado
        // Quando mercado aberto: rodadas 1 até rodadaAtual-1 devem estar consolidadas
        // Quando mercado fechado: rodadas 1 até rodadaAtual-1 também (rodada atual está em andamento)
        if (rodadaAtual > 1) {
            await garantirRodadaConsolidada(rodadaAtual - 1);
        }

        ultimoStatusMercado = statusAtual;

        // ✅ v4.0: Persistir estado no MongoDB (sobrevive restart)
        try {
            await SchedulerState.salvarStatusMercado(statusAtual);
        } catch (e) {
            console.warn("[SCHEDULER] ⚠️ Falha ao persistir estado:", e.message);
        }
    } catch (error) {
        console.error("[SCHEDULER] ❌ Erro na verificação:", error);
    }
}

// ✅ v3.0: Popular uma rodada para todas as ligas
async function popularRodadaParaTodasLigas(rodada) {
    try {
        console.log(
            `[SCHEDULER] 📥 Populando R${rodada} para todas as ligas...`,
        );

        const ligas = await Liga.find({ ativa: { $ne: false } }).select("_id nome").lean();

        for (const liga of ligas) {
            await popularRodadaParaLiga(liga._id.toString(), liga.nome, rodada);

            // Delay entre ligas
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        console.log(`[SCHEDULER] ✅ População R${rodada} concluída`);
    } catch (error) {
        console.error("[SCHEDULER] ❌ Erro ao popular rodada para todas ligas:", error);
    }
}

// Consolida uma rodada específica para todas as ligas
async function consolidarRodadaAutomatica(rodada) {
    try {
        console.log(
            `[SCHEDULER] 🏭 Consolidando R${rodada} para todas as ligas...`,
        );

        const ligas = await Liga.find({ ativa: { $ne: false } }).select("_id nome").lean();

        for (const liga of ligas) {
            try {
                // Verificar se já consolidada
                const existente = await RodadaSnapshot.findOne({
                    liga_id: liga._id.toString(),
                    rodada: rodada,
                    status: "consolidada",
                }).lean();

                if (existente) {
                    console.log(
                        `[SCHEDULER] ⏭️ Liga ${liga.nome} R${rodada} já consolidada`,
                    );
                    continue;
                }

                // ✅ v3.0: Verificar se existem dados para consolidar
                const dadosExistem = await Rodada.findOne({
                    ligaId: liga._id,
                    rodada: rodada,
                    temporada: CURRENT_SEASON,
                }).lean();

                if (!dadosExistem) {
                    console.warn(
                        `[SCHEDULER] ⚠️ Liga ${liga.nome} R${rodada} sem dados na collection rodadas, pulando consolidação`,
                    );
                    continue;
                }

                // Chamar endpoint de consolidação internamente
                const url = `${BASE_URL}/api/consolidacao/ligas/${liga._id}/rodadas/${rodada}/consolidar`;

                const response = await fetch(url, { method: "POST" });
                const result = await response.json();

                if (result.success) {
                    console.log(
                        `[SCHEDULER] ✅ Liga ${liga.nome} R${rodada} consolidada`,
                    );
                } else {
                    console.error(
                        `[SCHEDULER] ❌ Liga ${liga.nome} R${rodada} falhou:`,
                        result.error,
                    );
                }

                // Delay entre ligas
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(
                    `[SCHEDULER] ❌ Erro na liga ${liga.nome}:`,
                    error.message,
                );
            }
        }

        console.log(`[SCHEDULER] ✅ Consolidação R${rodada} concluída`);
    } catch (error) {
        console.error("[SCHEDULER] ❌ Erro na consolidação automática:", error);
    }
}

// ✅ v4.0: Garante que TODAS as rodadas até a rodada indicada estão consolidadas
// Verifica cada liga independentemente (sem break prematuro)
async function garantirRodadaConsolidada(rodadaFinal) {
    try {
        const ligas = await Liga.find({ ativa: { $ne: false } }).select("_id nome").lean();

        for (const liga of ligas) {
            for (let rodada = 1; rodada <= rodadaFinal; rodada++) {
                const existente = await RodadaSnapshot.findOne({
                    liga_id: liga._id.toString(),
                    rodada: rodada,
                    status: "consolidada",
                }).lean();

                if (!existente) {
                    // Verificar se existem dados para consolidar
                    const dadosExistem = await Rodada.findOne({
                        ligaId: liga._id,
                        rodada: rodada,
                        temporada: CURRENT_SEASON,
                    }).lean();

                    if (dadosExistem) {
                        console.log(
                            `[SCHEDULER] ⚠️ Liga ${liga.nome} R${rodada} não consolidada (dados existem), disparando...`,
                        );
                        await consolidarRodadaAutomatica(rodada);
                        // Delay entre consolidações para não sobrecarregar
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    } else {
                        console.log(
                            `[SCHEDULER] ℹ️ Liga ${liga.nome} R${rodada} sem dados e sem snapshot (aguardando população)`,
                        );
                    }
                }
            }
        }
    } catch (error) {
        console.error("[SCHEDULER] Erro ao garantir consolidação:", error);
    }
}

// ============================================================================
// 🚀 INICIAR SCHEDULER
// ============================================================================

export async function iniciarSchedulerConsolidacao() {
    if (schedulerAtivo) {
        console.log("[SCHEDULER] ⚠️ Scheduler já está ativo");
        return null;
    }

    console.log("[SCHEDULER] 🚀 Iniciando scheduler v4.0 (persistência + safety net robusto)...");
    console.log("[SCHEDULER] ⏰ Intervalo: 30 minutos");

    // ✅ v4.0: Carregar último estado persistido do MongoDB
    try {
        const estadoSalvo = await SchedulerState.carregarStatusMercado();
        if (estadoSalvo) {
            ultimoStatusMercado = estadoSalvo;
            console.log(
                `[SCHEDULER] 📂 Estado restaurado: status_mercado=${estadoSalvo.status_mercado}, rodada=${estadoSalvo.rodada_atual}`,
            );
        } else {
            console.log("[SCHEDULER] 📂 Nenhum estado anterior encontrado (primeira execução)");
        }
    } catch (e) {
        console.warn("[SCHEDULER] ⚠️ Falha ao carregar estado salvo:", e.message);
    }

    // Executar imediatamente na inicialização
    verificarEConsolidar();

    // Configurar intervalo (30 minutos)
    const INTERVALO = 30 * 60 * 1000; // 30 minutos em ms

    const intervalId = setInterval(verificarEConsolidar, INTERVALO);

    schedulerAtivo = true;
    console.log("[SCHEDULER] ✅ Scheduler v4.0 ativo!");

    // Retornar intervalId para permitir clearInterval durante graceful shutdown
    return intervalId;
}

// ============================================================================
// 🛑 PARAR SCHEDULER (para testes)
// ============================================================================

export function pararSchedulerConsolidacao() {
    schedulerAtivo = false;
    console.log("[SCHEDULER] 🛑 Scheduler desativado");
}

export { verificarEConsolidar, getStatusMercado };
