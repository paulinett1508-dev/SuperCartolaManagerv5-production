// LOG MANAGER v4.0 - Sistema de Controle de Logs por Ambiente
// Carregado ANTES de todos os outros scripts
// Em PRODUÇÃO: Silencia TODOS os console.* (log, warn, error, info, debug)
// Em DEV (localhost/127.0.0.1): Mantém logs normais
// Debug em PROD: __enableDebug() no console (requer sessão admin) → logs por 30min
(function () {
    "use strict";

    const DEBUG_KEY = "__scm_d";

    // Detectar ambiente automaticamente
    const hostname = window.location.hostname;
    const isDevelopment = (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.includes("staging.") ||
        hostname.includes("webcontainer")
    );
    const isProduction = !isDevelopment;

    // Verificar debug token via backend (síncrono — roda 1x no boot)
    let devDebugActive = false;
    if (isProduction) {
        try {
            const storedToken = localStorage.getItem(DEBUG_KEY);
            if (storedToken) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/api/admin/auth/debug-validate/" + encodeURIComponent(storedToken), false);
                xhr.timeout = 3000;
                xhr.send(null);
                if (xhr.status === 200) {
                    var resp = JSON.parse(xhr.responseText);
                    devDebugActive = resp.valid === true;
                }
                if (!devDebugActive) {
                    localStorage.removeItem(DEBUG_KEY);
                }
            }
        } catch (_) {
            // Falha na validação — segue silencioso
            localStorage.removeItem(DEBUG_KEY);
        }
    }

    // =========================================================================
    // SILENCIAMENTO TOTAL EM PRODUÇÃO (exceto se dev debug ativo)
    // =========================================================================
    if (isProduction) {
        // Guardar referências originais SEMPRE
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
            const noop = function() {};
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

        // Logs críticos (erros fatais do sistema)
        window.__criticalLog = originalConsole.error;

        // Ativar debug — requer sessão admin no browser
        Object.defineProperty(window, "__enableDebug", {
            value: function () {
                originalConsole.log("[SCM] Solicitando debug token ao servidor...");
                fetch("/api/admin/auth/debug-token", { credentials: "include" })
                    .then(function (r) {
                        if (r.status === 401) throw new Error("Sessão admin não encontrada. Faça login no painel admin primeiro.");
                        if (!r.ok) throw new Error("Erro do servidor: " + r.status);
                        return r.json();
                    })
                    .then(function (data) {
                        if (!data.success || !data.token) throw new Error("Resposta inválida do servidor.");
                        try {
                            localStorage.setItem(DEBUG_KEY, data.token);
                        } catch (_) {
                            throw new Error("localStorage indisponível.");
                        }
                        originalConsole.log("[SCM] Debug ativado por 30 minutos. Recarregando...");
                        setTimeout(function () { location.reload(); }, 500);
                    })
                    .catch(function (err) {
                        originalConsole.error("[SCM] Falha ao ativar debug:", err.message);
                    });
            },
            writable: false,
            enumerable: false,
            configurable: false,
        });

        Object.defineProperty(window, "__disableDebug", {
            value: function () {
                try {
                    localStorage.removeItem(DEBUG_KEY);
                } catch (_) {}
                originalConsole.log("[SCM] Debug desativado. Recarregando...");
                setTimeout(function () { location.reload(); }, 500);
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
        isProduction: isProduction,
        devDebugActive: devDebugActive,

        setLevel: function (level) {
            if (LOG_LEVELS[level] !== undefined) {
                config.level = LOG_LEVELS[level];
            }
        },

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

        dev: function (module, ...args) {
            if (!isProduction || devDebugActive) {
                console.log(formatMessage("DEV", module, ""), ...args);
            }
        },

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

        table: function (module, data) {
            if (config.level >= LOG_LEVELS.DEBUG && (!isProduction || devDebugActive)) {
                console.log(formatMessage("TABLE", module, ""));
                console.table(data);
            }
        },
    };

    if (window.sistemaModulos) {
        window.sistemaModulos.registrar("LogManager", LogManager);
    }

    window.Log = LogManager;

    // Auto-log de inicialização
    if (!isProduction) {
        console.log(
            `%c[LOG-MANAGER] v4.0 | Ambiente: DESENVOLVIMENTO | Logs: ATIVOS`,
            "color: #10b981; font-weight: bold;",
        );
    } else if (devDebugActive) {
        console.log(
            `%c[LOG-MANAGER] v4.0 | PROD DEBUG MODE | Expira em 30min | __disableDebug() para desativar`,
            "color: #f59e0b; font-weight: bold; background: #1a1a2e; padding: 4px 8px; border-radius: 4px;",
        );
    }
})();
