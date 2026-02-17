/**
 * Logger Configurável - Super Cartola Manager
 *
 * Em DEV: loga em formato humano (console.* padrão)
 * Em PROD: loga em JSON estruturado { timestamp, level, module, message }
 *
 * Uso:
 *   import logger from '../utils/logger.js';
 *   logger.log('[MODULO] Mensagem de debug');   // Só aparece em DEV
 *   logger.warn('[MODULO] Aviso importante');   // Sempre aparece
 *   logger.error('[MODULO] Erro crítico');      // Sempre aparece
 *   logger.info('[MODULO] Info geral');         // Só aparece em DEV
 *
 * Forçar logs em PROD (debug temporário):
 *   DEBUG=true npm start
 *
 * @version 2.0.0
 * @since 2026-02-17
 */

const isProd = process.env.NODE_ENV === 'production';
const debugEnabled = process.env.DEBUG === 'true';

// Em PROD, só loga debug se DEBUG=true
const shouldLogDebug = !isProd || debugEnabled;

/**
 * Extrai nome do módulo de mensagens no padrão "[MODULO] texto"
 */
function extractModule(args) {
    if (typeof args[0] === 'string') {
        const m = args[0].match(/^\[([^\]]+)\]/);
        if (m) return m[1];
    }
    return 'APP';
}

/**
 * Serializa argumentos para string (suporta objetos)
 */
function stringify(args) {
    return args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
    }).join(' ');
}

/**
 * Emite log estruturado em JSON (PROD)
 */
function jsonLog(level, args) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        module: extractModule(args),
        message: stringify(args)
    };
    if (level === 'error' || level === 'warn') {
        process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
        process.stdout.write(JSON.stringify(entry) + '\n');
    }
}

const logger = {
    /**
     * Log de debug - silenciado em produção
     * Use para informações de fluxo, debugging, etc.
     */
    log: (...args) => {
        if (!shouldLogDebug) return;
        if (isProd) {
            jsonLog('debug', args);
        } else {
            console.log(...args);
        }
    },

    /**
     * Log de informação - silenciado em produção
     * Use para informações gerais não críticas
     */
    info: (...args) => {
        if (!shouldLogDebug) return;
        if (isProd) {
            jsonLog('info', args);
        } else {
            console.info(...args);
        }
    },

    /**
     * Log de aviso - sempre aparece
     * Use para situações anormais mas não críticas
     */
    warn: (...args) => {
        if (isProd) {
            jsonLog('warn', args);
        } else {
            console.warn(...args);
        }
    },

    /**
     * Log de erro - sempre aparece
     * Use para erros e exceções
     */
    error: (...args) => {
        if (isProd) {
            jsonLog('error', args);
        } else {
            console.error(...args);
        }
    },

    /**
     * Log forçado - sempre aparece (mesmo em PROD)
     * Use para logs críticos que precisam aparecer sempre
     */
    force: (...args) => {
        if (isProd) {
            jsonLog('info', args);
        } else {
            console.log(...args);
        }
    },

    /**
     * Log de debug com timestamp
     * Útil para profiling e análise de performance
     */
    debug: (...args) => {
        if (!shouldLogDebug) return;
        if (isProd) {
            jsonLog('debug', args);
        } else {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}]`, ...args);
        }
    }
};

export default logger;
