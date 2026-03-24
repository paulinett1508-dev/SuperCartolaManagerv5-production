// LOG MANAGER v3.0 - Sistema de Controle de Logs por Ambiente
// Carregado ANTES de todos os outros scripts
// Em PRODUÇÃO: Silencia TODOS os console.* (log, warn, error, info, debug)
// Em DEV (localhost/127.0.0.1): Mantém logs normais
// Debug em PROD: __enableDebug('token') no console → reload → logs por 30min
(function () {
    "use strict";

    // Token de ativação — valor não-óbvio para dificultar discovery
    const DEBUG_TOKEN = "scm@2024#dev";
    const DEBUG_KEY = "__scm_d";
    const DEBUG_TS_KEY = "__scm_dt";
    const DEBUG_TTL_MS = 30 * 60 * 1000; // 30 minutos

    // Detectar ambiente automaticamente
    const hostname = window.location.hostname;
    const isDevelopment = (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.includes("staging.") ||
        hostname.includes("webcontainer")
    );
    const isProduction = !isDevelopment;

    // Verificar se debug foi ativado pelo dev (apenas em prod)
    let devDebugActive = false;
    if (isProduction) {
        try {
            const storedToken = localStorage.getItem(DEBUG_KEY);
            const storedTs = parseInt(localStorage.getItem(DEBUG_TS_KEY), 10);
            if (storedToken === DEBUG_TOKEN && storedTs) {
                const elapsed = Date.now() - storedTs;
                if (elapsed < DEBUG_TTL_MS) {
                    devDebugActive = true;
                } else {
                    // Expirou — limpar silenciosamente
                    localStorage.removeItem(DEBUG_KEY);
                    localStorage.removeItem(DEBUG_TS_KEY);
                }
            }
        } catch (_) {
            // localStorage indisponível — segue silencioso
        }
    }

    // =========================================================================
    // SILENCIAMENTO TOTAL EM PRODUÇÃO (exceto se dev debug ativo)
    // =========================================================================
    if (isProduction) {
        // Guardar referências originais SEMPRE (necessário para __criticalLog e debug mode)
        const originalConsole = {
            log: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            info: console.info.bind(console),
            debug: console.debug.bind(console),
            table: console.table.bind(console),
            group: console.group.bind(console),
            groupEnd: console.groupEnd.bind(console),
            trace: console.trace.bind(console),
        };

        if (!devDebugActive) {
            // Função vazia (no-op)
            const noop = function() {};

            // Sobrescrever TODOS os métodos de console
            console.log = noop;
            console.warn = noop;
            console.error = noop;
            console.info = noop;
            console.debug = noop;
            console.table = noop;
            console.group = noop;
            console.groupEnd = noop;
            console.trace = noop;
        }

        // Expor método para logs críticos (apenas erros fatais do sistema)
        window.__criticalLog = originalConsole.error;

        // Escape hatch: ativar/desativar debug em prod via console
        Object.defineProperty(window, "__enableDebug", {
            value: function (token) {
                if (token !== DEBUG_TOKEN) {
                    originalConsole.warn("[SCM] Token inválido.");
                    return;
                }
                try {
                    localStorage.setItem(DEBUG_KEY, token);
                    localStorage.setItem(DEBUG_TS_KEY, String(Date.now()));
                    originalConsole.log("[SCM] Debug ativado por 30 minutos. Recarregando...");
                    setTimeout(function () { location.reload(); }, 500);
                } catch (_) {
                    originalConsole.error("[SCM] Falha ao ativar debug (localStorage indisponível).");
                }
            },
            writable: false,
            enumerable: false,
            configurable: false,
        });

        Object.defineProperty(window, "__disableDebug", {
            value: function () {
                try {
                    localStorage.removeItem(DEBUG_KEY);
                    localStorage.removeItem(DEBUG_TS_KEY);
                    originalConsole.log("[SCM] Debug desativado. Recarregando...");
                    setTimeout(function () { location.reload(); }, 500);
                } catch (_) {
                    originalConsole.error("[SCM] Falha ao desativar debug.");
                }
            },
            writable: false,
            enumerable: false,
            configurable: false,
        });
    }

    // Níveis de log
    const LOG_LEVELS = {
        OFF: 0,
        ERROR: 1,
        WARN: 2,
        INFO: 3,
        DEBUG: 4,
    };

    // Configuração por ambiente
    const config = {
        level: (isProduction && !devDebugActive) ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG,
        showTimestamp: !isProduction || devDebugActive,
        prefix: "[SCM]",
    };

    // Formatador de mensagem
    function formatMessage(level, module, message) {
        const parts = [];
        if (config.showTimestamp) {
            parts.push(new Date().toLocaleTimeString("pt-BR"));
        }
        if (module) {
            parts.push(`[${module}]`);
        }
        parts.push(message);
        return parts.join(" ");
    }

    // LogManager
    const LogManager = {
        // Verificar se é produção
        isProduction: isProduction,

        // Debug ativo em prod?
        devDebugActive: devDebugActive,

        // Alterar nível em runtime (útil para debug temporário)
        setLevel: function (level) {
            if (LOG_LEVELS[level] !== undefined) {
                config.level = LOG_LEVELS[level];
            }
        },

        // Métodos de log
        debug: function (module, ...args) {
            if (config.level >= LOG_LEVELS.DEBUG) {
                console.log(formatMessage("DEBUG", module, ""), ...args);
            }
        },

        info: function (module, ...args) {
            if (config.level >= LOG_LEVELS.INFO) {
                console.log(formatMessage("INFO", module, ""), ...args);
            }
        },

        warn: function (module, ...args) {
            if (config.level >= LOG_LEVELS.WARN) {
                console.warn(formatMessage("WARN", module, ""), ...args);
            }
        },

        error: function (module, ...args) {
            if (config.level >= LOG_LEVELS.ERROR) {
                console.error(formatMessage("ERROR", module, ""), ...args);
            }
        },

        // Log condicional (sempre executa em dev, nunca em prod — exceto debug ativo)
        dev: function (module, ...args) {
            if (!isProduction || devDebugActive) {
                console.log(formatMessage("DEV", module, ""), ...args);
            }
        },

        // Grupo de logs (útil para debug complexo)
        group: function (module, label) {
            if (config.level >= LOG_LEVELS.DEBUG && (!isProduction || devDebugActive)) {
                console.group(formatMessage("", module, label));
            }
        },

        groupEnd: function () {
            if (config.level >= LOG_LEVELS.DEBUG && (!isProduction || devDebugActive)) {
                console.groupEnd();
            }
        },

        // Tabela (útil para arrays/objetos)
        table: function (module, data) {
            if (config.level >= LOG_LEVELS.DEBUG && (!isProduction || devDebugActive)) {
                console.log(formatMessage("TABLE", module, ""));
                console.table(data);
            }
        },
    };

    // Registrar no sistema de módulos
    if (window.sistemaModulos) {
        window.sistemaModulos.registrar("LogManager", LogManager);
    }

    // Expor globalmente para fácil acesso
    window.Log = LogManager;

    // Auto-log de inicialização
    if (!isProduction) {
        console.log(
            `%c[LOG-MANAGER] v3.0 | Ambiente: DESENVOLVIMENTO | Logs: ATIVOS`,
            "color: #10b981; font-weight: bold;",
        );
    } else if (devDebugActive) {
        console.log(
            `%c[LOG-MANAGER] v3.0 | PROD DEBUG MODE | Expira em 30min | __disableDebug() para desativar`,
            "color: #f59e0b; font-weight: bold; background: #1a1a2e; padding: 4px 8px; border-radius: 4px;",
        );
    }
    // Em produção sem debug: Silêncio total
})();
