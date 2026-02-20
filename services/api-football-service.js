// services/api-football-service.js
// v1.0 - Smart Client API-Football v3 com proteções anti-banimento
//
// PROTEÇÕES IMPLEMENTADAS:
// 1. Quota tracker persistente (MongoDB) - nunca perde contagem mesmo com restart
// 2. Circuit breaker - auto-desabilita quando quota < QUOTA_SAFETY_BUFFER
// 3. Rate limiter por minuto - max 2 req/min (respeita API-Football TOS)
// 4. Intervalo mínimo entre requests - 30 segundos
// 5. Exponential backoff em 429 - para, respira, tenta depois
// 6. Hard cap em DAILY_HARD_CAP (90) - nunca chega a 100
// 7. Deduplicação de requests - mesma query em <60s retorna cache
// 8. Headers de resposta parseados - quota real-time da API

import fetch from 'node-fetch';

// ════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO - Ajustáveis sem risco
// ════════════════════════════════════════════════════════════════
const CONFIG = {
  BASE_URL: 'https://v3.football.api-sports.io',
  DAILY_LIMIT: 100,           // Limite real da API (free plan)
  DAILY_HARD_CAP: 90,         // Hard cap nosso (buffer de 10)
  QUOTA_SAFETY_BUFFER: 10,    // Circuit breaker ativa quando restam < 10
  MAX_REQUESTS_PER_MINUTE: 2, // Respeitar TOS (free = ~2/min)
  MIN_INTERVAL_MS: 30000,     // 30s mínimo entre requests
  REQUEST_TIMEOUT_MS: 15000,  // Timeout por request
  CACHE_DEDUP_TTL_MS: 60000,  // 60s deduplicação de requests idênticos
  BACKOFF_BASE_MS: 2000,      // Base do exponential backoff
  BACKOFF_MAX_MS: 60000,      // Max backoff (1 min)
  MAX_RETRIES: 2,             // Max retries em 429
  QUOTA_COLLECTION: 'apiQuotaTracker', // Collection MongoDB
};

// ════════════════════════════════════════════════════════════════
// ESTADO EM MEMÓRIA
// ════════════════════════════════════════════════════════════════
let state = {
  apiKey: null,
  enabled: false,

  // Quota tracking (sincronizado com MongoDB)
  dailyRequests: 0,
  dailyDate: null,           // YYYY-MM-DD (UTC)
  remainingFromApi: null,    // Vindo do header x-ratelimit-requests-remaining

  // Rate limiting
  lastRequestTimestamp: 0,
  requestsThisMinute: 0,
  minuteWindowStart: 0,

  // Circuit breaker
  circuitOpen: false,        // true = API bloqueada (quota esgotando)
  circuitReason: null,

  // Deduplicação
  deduplicationCache: new Map(), // key -> { data, timestamp }

  // Stats para dashboard
  stats: {
    totalRequestsToday: 0,
    successCount: 0,
    errorCount: 0,
    rateLimitHits: 0,
    circuitBreakerTrips: 0,
    cacheHits: 0,
    lastError: null,
    lastSuccess: null,
  }
};

// Referência ao DB MongoDB (injetada em init())
let db = null;

// ════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * Inicializa o serviço API-Football.
 * DEVE ser chamado no startup do app com a instância do MongoDB.
 *
 * @param {Db} mongoDb - Instância do MongoDB (native driver)
 */
async function init(mongoDb) {
  db = mongoDb;

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.warn('[API-FOOTBALL] API_FOOTBALL_KEY não configurada - serviço desabilitado');
    state.enabled = false;
    return;
  }

  state.apiKey = apiKey;
  state.enabled = true;

  // Restaurar quota do MongoDB
  await restaurarQuotaDoBanco();

  console.log(`[API-FOOTBALL] ✅ Serviço inicializado - ${state.dailyRequests}/${CONFIG.DAILY_HARD_CAP} requests hoje`);
}

/**
 * Restaura contagem de quota do MongoDB (sobrevive a restarts)
 */
async function restaurarQuotaDoBanco() {
  if (!db) return;

  try {
    const hoje = getDataUTC();
    const doc = await db.collection(CONFIG.QUOTA_COLLECTION).findOne({
      api: 'api-football',
      date: hoje
    });

    if (doc) {
      state.dailyRequests = doc.requestCount || 0;
      state.dailyDate = hoje;
      state.stats.totalRequestsToday = doc.requestCount || 0;
      console.log(`[API-FOOTBALL] Quota restaurada: ${state.dailyRequests} requests em ${hoje}`);
    } else {
      state.dailyRequests = 0;
      state.dailyDate = hoje;
    }

    // Verificar se circuit breaker deve estar ativo
    verificarCircuitBreaker();
  } catch (err) {
    console.error('[API-FOOTBALL] Erro ao restaurar quota:', err.message);
  }
}

/**
 * Persiste contagem de quota no MongoDB
 */
async function persistirQuota() {
  if (!db) return;

  try {
    const hoje = getDataUTC();
    await db.collection(CONFIG.QUOTA_COLLECTION).updateOne(
      { api: 'api-football', date: hoje },
      {
        $set: {
          requestCount: state.dailyRequests,
          remainingFromApi: state.remainingFromApi,
          updatedAt: new Date(),
          circuitOpen: state.circuitOpen,
          stats: state.stats
        },
        $setOnInsert: {
          api: 'api-football',
          date: hoje,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('[API-FOOTBALL] Erro ao persistir quota:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// VERIFICAÇÕES DE SEGURANÇA (pré-request)
// ════════════════════════════════════════════════════════════════

/**
 * Verifica e reseta a quota se o dia mudou (UTC)
 */
function verificarResetDiario() {
  const hoje = getDataUTC();
  if (state.dailyDate !== hoje) {
    console.log(`[API-FOOTBALL] 🔄 Novo dia detectado (${state.dailyDate} → ${hoje}) - resetando quota`);
    state.dailyRequests = 0;
    state.dailyDate = hoje;
    state.circuitOpen = false;
    state.circuitReason = null;
    state.stats = {
      totalRequestsToday: 0,
      successCount: 0,
      errorCount: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      cacheHits: 0,
      lastError: null,
      lastSuccess: null,
    };
    state.deduplicationCache.clear();
  }
}

/**
 * Verifica se o circuit breaker deve abrir/fechar
 */
function verificarCircuitBreaker() {
  const restante = CONFIG.DAILY_HARD_CAP - state.dailyRequests;

  if (restante <= CONFIG.QUOTA_SAFETY_BUFFER) {
    if (!state.circuitOpen) {
      state.circuitOpen = true;
      state.circuitReason = `Quota baixa: ${restante} restantes (buffer: ${CONFIG.QUOTA_SAFETY_BUFFER})`;
      state.stats.circuitBreakerTrips++;
      console.warn(`[API-FOOTBALL] 🔴 CIRCUIT BREAKER ABERTO - ${state.circuitReason}`);
    }
    return false; // Não permitir requests
  }

  // Se o circuit breaker estava aberto mas agora tem quota (novo dia), fechar
  if (state.circuitOpen && restante > CONFIG.QUOTA_SAFETY_BUFFER) {
    state.circuitOpen = false;
    state.circuitReason = null;
    console.log('[API-FOOTBALL] 🟢 Circuit breaker fechado - quota disponível');
  }

  return true;
}

/**
 * Verifica rate limit por minuto
 * @returns {boolean} true se pode fazer request
 */
function verificarRateLimitMinuto() {
  const agora = Date.now();

  // Reset window se passou 1 minuto
  if (agora - state.minuteWindowStart >= 60000) {
    state.requestsThisMinute = 0;
    state.minuteWindowStart = agora;
  }

  return state.requestsThisMinute < CONFIG.MAX_REQUESTS_PER_MINUTE;
}

/**
 * Verifica intervalo mínimo entre requests
 * @returns {number} ms para esperar (0 = pode fazer agora)
 */
function calcularEspera() {
  const agora = Date.now();
  const elapsed = agora - state.lastRequestTimestamp;

  if (elapsed < CONFIG.MIN_INTERVAL_MS) {
    return CONFIG.MIN_INTERVAL_MS - elapsed;
  }

  return 0;
}

/**
 * Verifica cache de deduplicação
 * @param {string} cacheKey - Chave de deduplicação
 * @returns {Object|null} Dados em cache ou null
 */
function verificarDeduplicacao(cacheKey) {
  const cached = state.deduplicationCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_DEDUP_TTL_MS) {
    state.stats.cacheHits++;
    return cached.data;
  }
  // Limpar cache expirado
  if (cached) {
    state.deduplicationCache.delete(cacheKey);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
// REQUEST PRINCIPAL (com todas as proteções)
// ════════════════════════════════════════════════════════════════

/**
 * Faz uma requisição segura à API-Football.
 * Todas as proteções são aplicadas automaticamente.
 *
 * @param {string} endpoint - Ex: '/fixtures'
 * @param {Object} params - Query params ex: { date: '2026-02-12', league: 71 }
 * @param {Object} options - Opções extras
 * @param {boolean} options.skipDedup - Pular deduplicação (forçar fetch)
 * @param {string} options.priority - 'high' | 'normal' | 'low' (low pode ser rejeitado se quota baixa)
 * @returns {Object} { success, data, error, source, quotaInfo }
 */
async function request(endpoint, params = {}, options = {}) {
  // 0. Verificar se o serviço está habilitado
  if (!state.enabled || !state.apiKey) {
    return {
      success: false,
      data: null,
      error: 'API-Football não configurada',
      source: 'disabled'
    };
  }

  // 1. Reset diário se necessário
  verificarResetDiario();

  // 2. Circuit breaker
  if (!verificarCircuitBreaker()) {
    return {
      success: false,
      data: null,
      error: `Circuit breaker aberto: ${state.circuitReason}`,
      source: 'circuit-breaker',
      quotaInfo: getQuotaInfo()
    };
  }

  // 3. Rejeitar requests de baixa prioridade quando quota < 30%
  const quotaPercent = (state.dailyRequests / CONFIG.DAILY_HARD_CAP) * 100;
  if (options.priority === 'low' && quotaPercent > 70) {
    return {
      success: false,
      data: null,
      error: `Request de baixa prioridade rejeitado (quota ${Math.round(quotaPercent)}%)`,
      source: 'priority-filter',
      quotaInfo: getQuotaInfo()
    };
  }

  // 4. Deduplicação
  const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
  if (!options.skipDedup) {
    const cached = verificarDeduplicacao(cacheKey);
    if (cached) {
      console.log(`[API-FOOTBALL] 📦 Dedup cache hit: ${endpoint}`);
      return {
        success: true,
        data: cached,
        source: 'dedup-cache',
        quotaInfo: getQuotaInfo()
      };
    }
  }

  // 5. Rate limit por minuto
  if (!verificarRateLimitMinuto()) {
    const waitMs = 60000 - (Date.now() - state.minuteWindowStart);
    console.warn(`[API-FOOTBALL] ⏳ Rate limit/min atingido. Espere ${Math.round(waitMs/1000)}s`);
    return {
      success: false,
      data: null,
      error: `Rate limit por minuto (espere ${Math.round(waitMs/1000)}s)`,
      source: 'rate-limit',
      quotaInfo: getQuotaInfo()
    };
  }

  // 6. Intervalo mínimo
  const esperaMs = calcularEspera();
  if (esperaMs > 0) {
    console.log(`[API-FOOTBALL] ⏳ Aguardando ${Math.round(esperaMs/1000)}s (intervalo mínimo)...`);
    await sleep(esperaMs);
  }

  // 7. Executar request com retry
  return await executarComRetry(endpoint, params, cacheKey);
}

/**
 * Executa o request com exponential backoff em 429
 */
async function executarComRetry(endpoint, params, cacheKey, tentativa = 0) {
  try {
    // Construir URL
    const queryString = new URLSearchParams(params).toString();
    const url = `${CONFIG.BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;

    console.log(`[API-FOOTBALL] 🔄 Request: ${endpoint} (tentativa ${tentativa + 1}, quota: ${state.dailyRequests}/${CONFIG.DAILY_HARD_CAP})`);

    // Fazer request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': state.apiKey,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip'
      },
      timeout: CONFIG.REQUEST_TIMEOUT_MS
    });

    // Registrar request ANTES de processar resposta
    state.dailyRequests++;
    state.requestsThisMinute++;
    state.lastRequestTimestamp = Date.now();
    state.stats.totalRequestsToday = state.dailyRequests;

    // Parsear headers de quota
    parseQuotaHeaders(response.headers);

    // Verificar circuit breaker após incremento
    verificarCircuitBreaker();

    // Persistir quota assincronamente
    persistirQuota().catch(() => {}); // fire-and-forget

    // 429 - Rate limit
    if (response.status === 429) {
      state.stats.rateLimitHits++;
      console.warn(`[API-FOOTBALL] ⚠️ 429 Rate Limited! (tentativa ${tentativa + 1})`);

      if (tentativa < CONFIG.MAX_RETRIES) {
        const backoffMs = Math.min(
          CONFIG.BACKOFF_BASE_MS * Math.pow(2, tentativa) + Math.random() * 1000,
          CONFIG.BACKOFF_MAX_MS
        );
        console.log(`[API-FOOTBALL] ⏳ Backoff: ${Math.round(backoffMs/1000)}s`);
        await sleep(backoffMs);
        return await executarComRetry(endpoint, params, cacheKey, tentativa + 1);
      }

      state.stats.lastError = { code: 429, message: 'Rate limit exceeded after retries', at: new Date().toISOString() };
      return {
        success: false,
        data: null,
        error: 'Rate limit excedido após retries',
        source: 'rate-limit-429',
        quotaInfo: getQuotaInfo()
      };
    }

    // Erro HTTP genérico
    if (!response.ok) {
      state.stats.errorCount++;
      const errorBody = await response.text().catch(() => '');
      state.stats.lastError = { code: response.status, message: errorBody.substring(0, 200), at: new Date().toISOString() };
      console.error(`[API-FOOTBALL] ❌ HTTP ${response.status}: ${errorBody.substring(0, 100)}`);

      return {
        success: false,
        data: null,
        error: `HTTP ${response.status}`,
        source: 'http-error',
        quotaInfo: getQuotaInfo()
      };
    }

    // Sucesso
    const data = await response.json();
    state.stats.successCount++;
    state.stats.lastSuccess = new Date().toISOString();

    // Verificar erros dentro do JSON da API-Football
    if (data.errors && Object.keys(data.errors).length > 0) {
      const erroMsg = Object.values(data.errors).join(', ');
      console.warn(`[API-FOOTBALL] ⚠️ API retornou erro: ${erroMsg}`);

      // Se erro de token/acesso, desabilitar
      if (erroMsg.toLowerCase().includes('token') || erroMsg.toLowerCase().includes('key')) {
        state.enabled = false;
        console.error('[API-FOOTBALL] 🔴 API Key inválida - serviço desabilitado');
      }

      return {
        success: false,
        data: null,
        error: erroMsg,
        source: 'api-error',
        quotaInfo: getQuotaInfo()
      };
    }

    // Guardar em cache de deduplicação
    state.deduplicationCache.set(cacheKey, {
      data: data.response || data,
      timestamp: Date.now()
    });

    console.log(`[API-FOOTBALL] ✅ Sucesso: ${endpoint} (${(data.response || []).length} resultados, quota: ${state.dailyRequests}/${CONFIG.DAILY_HARD_CAP})`);

    return {
      success: true,
      data: data.response || data,
      source: 'api-football',
      quotaInfo: getQuotaInfo(),
      paging: data.paging || null
    };

  } catch (err) {
    state.stats.errorCount++;
    state.stats.lastError = { code: 'NETWORK', message: err.message, at: new Date().toISOString() };
    console.error(`[API-FOOTBALL] ❌ Erro de rede: ${err.message}`);

    return {
      success: false,
      data: null,
      error: err.message,
      source: 'network-error',
      quotaInfo: getQuotaInfo()
    };
  }
}

// ════════════════════════════════════════════════════════════════
// ENDPOINTS ESPECÍFICOS (helpers de alto nível)
// ════════════════════════════════════════════════════════════════

/**
 * Busca fixtures do dia para ligas brasileiras.
 * Custo: 1 request (todas as ligas BR do dia em 1 chamada)
 *
 * @param {string} date - Data YYYY-MM-DD (default: hoje)
 * @returns {Object} { success, data, quotaInfo }
 */
async function buscarFixturesDoDia(date) {
  const dataAlvo = date || getDataSaoPaulo();

  // Buscar com timezone correto (São Paulo = America/Sao_Paulo)
  return await request('/fixtures', {
    date: dataAlvo,
    timezone: 'America/Sao_Paulo'
  }, { priority: 'normal' });
}

/**
 * Busca jogos ao vivo (apenas Brasil).
 * Custo: 1 request
 * Usar APENAS quando SoccerDataAPI falhar.
 *
 * @returns {Object} { success, data, quotaInfo }
 */
async function buscarJogosAoVivo() {
  return await request('/fixtures', {
    live: 'all',
    timezone: 'America/Sao_Paulo'
  }, { priority: 'high' });
}

/**
 * Busca fixtures de uma rodada especifica do Brasileirao Serie A.
 * Custo: 1 request
 * Usado pelo TiroCertoManager para obter resultados reais por rodada.
 *
 * @param {number} rodada - Numero da rodada (1-38)
 * @param {number} liga - ID da liga (default: 71 = Brasileirao A)
 * @returns {Object} { success, data, quotaInfo }
 */
async function buscarFixturesPorRodada(rodada, liga = 71) {
  return await request('/fixtures', {
    league: liga,
    season: new Date().getFullYear(),
    round: `Regular Season - ${rodada}`,
    timezone: 'America/Sao_Paulo'
  }, { priority: 'normal' });
}

/**
 * Busca eventos de um jogo específico (gols, cartões, substituições).
 * Custo: 1 request
 * Usar APENAS quando usuário clicar em um jogo (on-demand).
 *
 * @param {number} fixtureId - ID do fixture na API-Football
 * @returns {Object} { success, data, quotaInfo }
 */
async function buscarEventosJogo(fixtureId) {
  return await request('/fixtures/events', {
    fixture: fixtureId
  }, { priority: 'low' });
}

/**
 * Busca estatísticas de um jogo (posse, chutes, etc.).
 * Custo: 1 request
 * Usar on-demand (clique do usuário).
 *
 * @param {number} fixtureId - ID do fixture
 * @returns {Object} { success, data, quotaInfo }
 */
async function buscarEstatisticasJogo(fixtureId) {
  return await request('/fixtures/statistics', {
    fixture: fixtureId
  }, { priority: 'low' });
}

// ════════════════════════════════════════════════════════════════
// QUOTA & STATUS (para dashboard admin)
// ════════════════════════════════════════════════════════════════

/**
 * Retorna informações de quota para o dashboard
 */
function getQuotaInfo() {
  const restante = CONFIG.DAILY_HARD_CAP - state.dailyRequests;
  const percentUsado = Math.round((state.dailyRequests / CONFIG.DAILY_HARD_CAP) * 100);

  return {
    dailyRequests: state.dailyRequests,
    dailyLimit: CONFIG.DAILY_LIMIT,
    dailyHardCap: CONFIG.DAILY_HARD_CAP,
    remaining: restante,
    remainingFromApi: state.remainingFromApi,
    percentUsed: percentUsado,
    circuitOpen: state.circuitOpen,
    circuitReason: state.circuitReason,
    enabled: state.enabled,
    date: state.dailyDate,
    resetAt: '00:00 UTC',
    stats: { ...state.stats }
  };
}

/**
 * Retorna status completo do serviço (para endpoint /status)
 */
function getStatus() {
  verificarResetDiario();

  return {
    configurado: !!state.apiKey,
    habilitado: state.enabled,
    tipo: state.enabled ? '🟡 SECUNDÁRIA' : '🔴 DESABILITADA',
    quota: getQuotaInfo(),
    config: {
      dailyHardCap: CONFIG.DAILY_HARD_CAP,
      minIntervalMs: CONFIG.MIN_INTERVAL_MS,
      maxReqPerMinute: CONFIG.MAX_REQUESTS_PER_MINUTE,
      quotaSafetyBuffer: CONFIG.QUOTA_SAFETY_BUFFER,
      dedupTtlMs: CONFIG.CACHE_DEDUP_TTL_MS
    }
  };
}

/**
 * Força reset manual da quota (admin only)
 */
async function resetQuota() {
  state.dailyRequests = 0;
  state.circuitOpen = false;
  state.circuitReason = null;
  state.stats.totalRequestsToday = 0;
  state.deduplicationCache.clear();
  await persistirQuota();
  console.log('[API-FOOTBALL] 🔄 Quota resetada manualmente');
  return getQuotaInfo();
}

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════

function parseQuotaHeaders(headers) {
  const remaining = headers.get('x-ratelimit-requests-remaining');
  if (remaining !== null) {
    state.remainingFromApi = parseInt(remaining, 10);

    // Se API diz que restam menos do que pensamos, ajustar
    if (state.remainingFromApi < (CONFIG.DAILY_LIMIT - state.dailyRequests)) {
      console.warn(`[API-FOOTBALL] ⚠️ API reporta ${state.remainingFromApi} restantes (nosso count: ${CONFIG.DAILY_LIMIT - state.dailyRequests}). Ajustando...`);
      state.dailyRequests = CONFIG.DAILY_LIMIT - state.remainingFromApi;
      verificarCircuitBreaker();
    }
  }
}

function getDataUTC() {
  return new Date().toISOString().split('T')[0];
}

function getDataSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════

export default {
  init,
  request,
  buscarFixturesDoDia,
  buscarFixturesPorRodada,
  buscarJogosAoVivo,
  buscarEventosJogo,
  buscarEstatisticasJogo,
  getQuotaInfo,
  getStatus,
  resetQuota,
  CONFIG
};

export {
  init,
  request,
  buscarFixturesDoDia,
  buscarFixturesPorRodada,
  buscarJogosAoVivo,
  buscarEventosJogo,
  buscarEstatisticasJogo,
  getQuotaInfo,
  getStatus,
  resetQuota,
  CONFIG
};
