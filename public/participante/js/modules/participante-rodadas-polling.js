// =====================================================================
// PARTICIPANTE-RODADAS-POLLING.JS - v1.0
// Sistema de Polling Inteligente - Ativa/desativa baseado em calendário
// =====================================================================

if (window.Log) Log.info("[POLLING] 🎯 Carregando módulo v1.0...");

import * as CalendarModule from './participante-rodadas-calendar.js';
import * as ParciaisModule from './participante-rodada-parcial.js';

// Estado do polling inteligente
let estadoPolling = {
    ativo: false,
    temporada: null,
    rodada: null,
    ligaId: null,
    timeId: null,
    calendarioDisponivel: false,
    pollingAtivo: false,
    onUpdate: null,
    onStatus: null,
    verificacaoCalendarioAtiva: false,
};

// =====================================================================
// INICIALIZAR POLLING INTELIGENTE
// =====================================================================
export async function inicializar({
    temporada,
    rodada,
    ligaId,
    timeId,
    onUpdate = null,
    onStatus = null,
}) {
    if (window.Log) {
        Log.info("[POLLING] 🚀 Inicializando polling inteligente...", {
            temporada,
            rodada,
            ligaId,
            timeId,
        });
    }

    estadoPolling.ativo = true;
    estadoPolling.temporada = temporada;
    estadoPolling.rodada = rodada;
    estadoPolling.ligaId = ligaId;
    estadoPolling.timeId = timeId;
    estadoPolling.onUpdate = onUpdate;
    estadoPolling.onStatus = onStatus;

    try {
        // 1. Inicializar calendário
        const calendarInfo = await CalendarModule.inicializarCalendario(temporada, rodada);

        if (calendarInfo.disponivel) {
            estadoPolling.calendarioDisponivel = true;

            if (window.Log) {
                Log.info("[POLLING] 📅 Calendário disponível:", {
                    deve_ativar_polling: calendarInfo.deve_ativar_polling,
                    tem_jogos_ao_vivo: calendarInfo.tem_jogos_ao_vivo,
                    proximo_jogo: calendarInfo.proximo_jogo,
                });
            }

            // 2. Ativar polling se necessário
            if (calendarInfo.deve_ativar_polling) {
                await ativarPolling();
            } else {
                if (window.Log) {
                    Log.info("[POLLING] ⏸️ Polling pausado - aguardando horário dos jogos");

                    if (calendarInfo.proximo_jogo) {
                        const proximoJogo = calendarInfo.proximo_jogo;
                        Log.info("[POLLING] ⏰ Próximo jogo:", {
                            data: proximoJogo.data,
                            horario: proximoJogo.horario,
                            partida: `${proximoJogo.time_casa} x ${proximoJogo.time_fora}`,
                        });
                    }
                }
            }

            // 3. Iniciar verificação periódica do calendário
            iniciarVerificacaoCalendario();

            return {
                sucesso: true,
                calendarioDisponivel: true,
                pollingAtivo: estadoPolling.pollingAtivo,
            };
        } else {
            // Calendário não disponível - usar polling padrão (fallback para bola_rolando)
            if (window.Log) {
                Log.info("[POLLING] ℹ️ Calendário indisponível - usando modo fallback (bola_rolando)");
            }

            estadoPolling.calendarioDisponivel = false;

            // Verificar se mercado está fechado (bola rolando)
            const parciaisInfo = await ParciaisModule.inicializarParciais(ligaId, timeId);

            if (parciaisInfo && parciaisInfo.disponivel && parciaisInfo.bolaRolando) {
                await ativarPolling();
            }

            return {
                sucesso: true,
                calendarioDisponivel: false,
                pollingAtivo: estadoPolling.pollingAtivo,
                modo: 'fallback',
            };
        }
    } catch (error) {
        if (window.Log) Log.error("[POLLING] ❌ Erro ao inicializar:", error);
        return {
            sucesso: false,
            erro: error.message,
        };
    }
}

// =====================================================================
// ATIVAR POLLING (iniciar auto-refresh dos parciais)
// =====================================================================
async function ativarPolling() {
    if (estadoPolling.pollingAtivo) {
        if (window.Log) Log.info("[POLLING] ℹ️ Polling já ativo");
        return;
    }

    if (window.Log) Log.info("[POLLING] ▶️ Ativando polling...");

    try {
        // Iniciar auto-refresh do módulo de parciais
        ParciaisModule.iniciarAutoRefresh(
            (dados) => {
                // Callback de atualização
                if (typeof estadoPolling.onUpdate === 'function') {
                    estadoPolling.onUpdate(dados);
                }
            },
            (status) => {
                // Callback de status
                if (typeof estadoPolling.onStatus === 'function') {
                    estadoPolling.onStatus({
                        tipo: 'parciais',
                        ...status,
                    });
                }
            }
        );

        estadoPolling.pollingAtivo = true;

        if (window.Log) Log.info("[POLLING] ✅ Polling ativado");

        // Notificar mudança de status
        notificarStatus('ativado');
    } catch (error) {
        if (window.Log) Log.error("[POLLING] Erro ao ativar polling:", error);
    }
}

// =====================================================================
// DESATIVAR POLLING
// =====================================================================
function desativarPolling() {
    if (!estadoPolling.pollingAtivo) {
        if (window.Log) Log.info("[POLLING] ℹ️ Polling já inativo");
        return;
    }

    if (window.Log) Log.info("[POLLING] ⏸️ Desativando polling...");

    try {
        ParciaisModule.pararAutoRefresh();
        estadoPolling.pollingAtivo = false;

        if (window.Log) Log.info("[POLLING] ✅ Polling desativado");

        // Notificar mudança de status
        notificarStatus('desativado');
    } catch (error) {
        if (window.Log) Log.error("[POLLING] Erro ao desativar polling:", error);
    }
}

// =====================================================================
// INICIAR VERIFICAÇÃO PERIÓDICA DO CALENDÁRIO
// =====================================================================
function iniciarVerificacaoCalendario() {
    if (estadoPolling.verificacaoCalendarioAtiva) return;

    if (window.Log) Log.info("[POLLING] 🔄 Iniciando verificação periódica do calendário...");

    CalendarModule.iniciarVerificacaoPeriodica(
        estadoPolling.temporada,
        estadoPolling.rodada,
        (statusCalendario) => {
            // Callback quando calendário muda
            if (window.Log) {
                Log.info("[POLLING] 📅 Atualização do calendário:", statusCalendario);
            }

            // Ativar ou desativar polling baseado no calendário
            if (statusCalendario.deve_ativar_polling && !estadoPolling.pollingAtivo) {
                if (window.Log) {
                    Log.info("[POLLING] 🔔 Hora de ativar polling! Jogos começando em breve.");
                }
                ativarPolling();
            } else if (!statusCalendario.deve_ativar_polling && estadoPolling.pollingAtivo) {
                // Só desativar se não houver jogos ao vivo
                if (!statusCalendario.tem_jogos_ao_vivo) {
                    if (window.Log) {
                        Log.info("[POLLING] 🔕 Desativando polling - sem jogos agendados no momento.");
                    }
                    desativarPolling();
                }
            }
        }
    );

    estadoPolling.verificacaoCalendarioAtiva = true;
}

// =====================================================================
// PARAR VERIFICAÇÃO DO CALENDÁRIO
// =====================================================================
function pararVerificacaoCalendario() {
    if (!estadoPolling.verificacaoCalendarioAtiva) return;

    CalendarModule.pararVerificacaoPeriodica();
    estadoPolling.verificacaoCalendarioAtiva = false;

    if (window.Log) Log.info("[POLLING] ⏹️ Verificação do calendário parada");
}

// =====================================================================
// NOTIFICAR MUDANÇA DE STATUS
// =====================================================================
function notificarStatus(tipo) {
    if (typeof estadoPolling.onStatus === 'function') {
        estadoPolling.onStatus({
            tipo: 'polling',
            ativo: estadoPolling.pollingAtivo,
            calendarioDisponivel: estadoPolling.calendarioDisponivel,
            motivo: tipo,
        });
    }
}

// =====================================================================
// PAGE VISIBILITY API - Pausa/retoma polling ao sair/voltar à aba
// =====================================================================
function setupVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
        if (!estadoPolling.ativo) return;

        if (document.hidden) {
            // Aba oculta: parar polling para economia de bateria
            if (estadoPolling.pollingAtivo) {
                if (window.Log) Log.info("[POLLING] 👁️ Aba oculta - pausando polling");
                desativarPolling();
            }
        } else {
            // Aba visível novamente: reativar se calendário permite
            if (window.Log) Log.info("[POLLING] 👁️ Aba visível - verificando se deve reativar polling");

            if (estadoPolling.calendarioDisponivel) {
                // Re-verificar calendário antes de reativar
                CalendarModule.inicializarCalendario(
                    estadoPolling.temporada,
                    estadoPolling.rodada
                ).then(calendarInfo => {
                    if (calendarInfo.disponivel && calendarInfo.deve_ativar_polling) {
                        ativarPolling();
                    }
                }).catch(err => {
                    if (window.Log) Log.error("[POLLING] Erro ao reativar após visibility:", err);
                });
            } else {
                // Fallback: reativar direto (bola_rolando será verificado internamente)
                ativarPolling();
            }
        }
    });

    if (window.Log) Log.info("[POLLING] 👁️ Visibility listener configurado");
}

// Configurar listener imediatamente
setupVisibilityListener();

// =====================================================================
// PARAR POLLING INTELIGENTE (cleanup)
// =====================================================================
export function parar() {
    if (window.Log) Log.info("[POLLING] 🛑 Parando polling inteligente...");

    desativarPolling();
    pararVerificacaoCalendario();

    estadoPolling.ativo = false;
    estadoPolling.onUpdate = null;
    estadoPolling.onStatus = null;

    if (window.Log) Log.info("[POLLING] ✅ Polling inteligente parado");
}

// =====================================================================
// FORÇAR ATIVAÇÃO MANUAL (para debug/admin)
// =====================================================================
export function forcarAtivar() {
    if (window.Log) Log.info("[POLLING] 🔧 Forçando ativação manual do polling...");
    ativarPolling();
}

// =====================================================================
// FORÇAR DESATIVAÇÃO MANUAL
// =====================================================================
export function forcarDesativar() {
    if (window.Log) Log.info("[POLLING] 🔧 Forçando desativação manual do polling...");
    desativarPolling();
}

// =====================================================================
// OBTER STATUS ATUAL
// =====================================================================
export function status() {
    return {
        ativo: estadoPolling.ativo,
        pollingAtivo: estadoPolling.pollingAtivo,
        calendarioDisponivel: estadoPolling.calendarioDisponivel,
        temporada: estadoPolling.temporada,
        rodada: estadoPolling.rodada,
        proximoJogo: CalendarModule.obterProximoJogo(),
    };
}

// Expor no window para debug
window.PollingInteligenteModule = {
    inicializar,
    parar,
    forcarAtivar,
    forcarDesativar,
    status,
};

if (window.Log) Log.info("[POLLING] ✅ Módulo v1.0 carregado");
