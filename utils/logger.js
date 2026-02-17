/**
 * Logger Estruturado - Super Cartola Manager
 *
 * Em DEV: formato legivel com cores + timestamp
 * Em PROD: formato JSON estruturado (parseable por ferramentas de log)
 *
 * Uso:
 *   import logger from '../utils/logger.js';
 *   logger.log('[MODULO] Mensagem de debug');   // Só aparece em DEV
 *   logger.warn('[MODULO] Aviso importante');   // Sempre aparece
 *   logger.error('[MODULO] Erro crítico', err); // Sempre aparece (captura stack)
 *   logger.info('[MODULO] Info geral');         // Só aparece em DEV
 *   logger.force('[MODULO] Sempre visivel');    // Sempre aparece
 *   logger.debug('[MODULO] Com timestamp');     // DEV only + timestamp
 *
 * Forçar logs em PROD (debug temporário):
 *   DEBUG=true npm start
 *
 * Formato JSON em PROD:
 *   LOG_FORMAT=json npm start
 *   → {"level":"error","timestamp":"...","message":"[MODULO] Erro","stack":"..."}
 *
 * @version 2.0.0
 * @since 2026-01-22
 * @updated 2026-02-15
 */

const isProd = process.env.NODE_ENV === 'production';
const debugEnabled = process.env.DEBUG === 'true';
const jsonFormat = process.env.LOG_FORMAT === 'json' || isProd;

// Em PROD, só loga debug se DEBUG=true
const shouldLogDebug = !isProd || debugEnabled;

/**
 * Formata timestamp ISO em formato curto para DEV
 */
function shortTimestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Serializa erro para JSON (captura message + stack)
 */
function serializeError(args) {
  return args.map(arg => {
    if (arg instanceof Error) {
      return { message: arg.message, stack: arg.stack, name: arg.name };
    }
    return arg;
  });
}

/**
 * Emite log em formato JSON estruturado
 */
function emitJSON(level, args) {
  const message = args.map(a => {
    if (a instanceof Error) return a.message;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message
  };

  // Capturar stack de erros
  const errorArg = args.find(a => a instanceof Error);
  if (errorArg) {
    entry.stack = errorArg.stack;
  }

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

const logger = {
  /**
   * Log de debug - silenciado em produção
   * Use para informações de fluxo, debugging, etc.
   */
  log: (...args) => {
    if (!shouldLogDebug) return;
    if (jsonFormat) return emitJSON('debug', args);
    console.log(...args);
  },

  /**
   * Log de informação - silenciado em produção
   * Use para informações gerais não críticas
   */
  info: (...args) => {
    if (!shouldLogDebug) return;
    if (jsonFormat) return emitJSON('info', args);
    console.info(...args);
  },

  /**
   * Log de aviso - sempre aparece
   * Use para situações anormais mas não críticas
   */
  warn: (...args) => {
    if (jsonFormat) return emitJSON('warn', args);
    console.warn(...args);
  },

  /**
   * Log de erro - sempre aparece
   * Use para erros e exceções
   */
  error: (...args) => {
    if (jsonFormat) return emitJSON('error', serializeError(args));
    console.error(...args);
  },

  /**
   * Log forçado - sempre aparece (mesmo em PROD)
   * Use para logs críticos que precisam aparecer sempre (startup, shutdown)
   */
  force: (...args) => {
    if (jsonFormat) return emitJSON('info', args);
    // Bypass do override de console.log em produção
    process.stdout.write(args.map(String).join(' ') + '\n');
  },

  /**
   * Log de debug com timestamp
   * Útil para profiling e análise de performance
   */
  debug: (...args) => {
    if (!shouldLogDebug) return;
    if (jsonFormat) return emitJSON('debug', args);
    console.log(`[${shortTimestamp()}]`, ...args);
  }
};

export default logger;
