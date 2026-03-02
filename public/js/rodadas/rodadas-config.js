// =====================================================================
// RODADAS CONFIG v5.0.0 - SaaS DINAMICO
// Responsavel por: configuracoes de banco, ligas, endpoints
// ✅ v5.0.0: Busca configs do endpoint /api/ligas/:id/configuracoes
// ✅ v4.0: Sistema de tabelas contextuais por rodada (mantido para fallback)
// =====================================================================

// VERSAO DO SISTEMA FINANCEIRO (para invalidacao de cache)
export const VERSAO_SISTEMA_FINANCEIRO = "5.0.0";

// Default de participantes (fallback quando API não retorna total_participantes)
const DEFAULT_TOTAL_PARTICIPANTES = 32;

// =====================================================================
// CACHE LOCAL DE CONFIGS (carregado do servidor)
// =====================================================================
let configsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Busca configuracoes da liga do servidor
 * @param {string} ligaId - ID da liga
 * @param {boolean} forceRefresh - Forcar refresh
 * @returns {Promise<Object>}
 */
export async function fetchLigaConfig(ligaId, forceRefresh = false) {
  if (!ligaId) return null;

  const cached = configsCache.get(ligaId);
  if (cached && !forceRefresh && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`/api/ligas/${ligaId}/configuracoes`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.success) throw new Error(data.erro);

    configsCache.set(ligaId, { data, timestamp: Date.now() });
    console.log(`[RODADAS-CONFIG] Configs carregadas: ${data.liga_nome}`);
    return data;
  } catch (error) {
    console.warn(`[RODADAS-CONFIG] Erro ao buscar configs, usando fallback:`, error.message);
    return cached?.data || null;
  }
}

// =====================================================================
// FALLBACK VALUES (usados se API falhar)
// =====================================================================

// Valores de banco fallback - SuperCartola (32 times)
const FALLBACK_VALORES_SUPERCARTOLA = {
  1: 20.0, 2: 19.0, 3: 18.0, 4: 17.0, 5: 16.0,
  6: 15.0, 7: 14.0, 8: 13.0, 9: 12.0, 10: 11.0, 11: 10.0,
  12: 0.0, 13: 0.0, 14: 0.0, 15: 0.0, 16: 0.0, 17: 0.0,
  18: 0.0, 19: 0.0, 20: 0.0, 21: 0.0,
  22: -10.0, 23: -11.0, 24: -12.0, 25: -13.0, 26: -14.0,
  27: -15.0, 28: -16.0, 29: -17.0, 30: -18.0, 31: -19.0, 32: -20.0,
};

// =====================================================================
// EXPORT LEGADO (compatibilidade com rodadas-core.js)
// =====================================================================
export const valoresBancoPadrao = FALLBACK_VALORES_SUPERCARTOLA;

// =====================================================================
// ✅ v5.0: FUNCOES DINAMICAS (buscam do servidor)
// =====================================================================

/**
 * Obtem valores de banco para uma rodada especifica
 * @param {string} ligaId - ID da liga
 * @param {number} rodada - Numero da rodada
 * @returns {Promise<Object>} Mapa de posicao -> valor
 */
export async function getBancoPorRodadaAsync(ligaId, rodada) {
  const config = await fetchLigaConfig(ligaId);

  if (config?.ranking_rodada) {
    const rankingConfig = config.ranking_rodada;

    if (rankingConfig.temporal) {
      const rodadaTransicao = rankingConfig.rodada_transicao || 30;
      const fase = rodada < rodadaTransicao ? "fase1" : "fase2";
      return rankingConfig[fase]?.valores || {};
    }

    return rankingConfig.valores || {};
  }

  // Fallback para valores hardcoded
  return getBancoPorRodada(ligaId, rodada);
}

/**
 * Obtem faixas de premiacao para uma rodada
 * @param {string} ligaId - ID da liga
 * @param {number} rodada - Numero da rodada
 * @returns {Promise<Object>}
 */
export async function getFaixasPorRodadaAsync(ligaId, rodada) {
  const config = await fetchLigaConfig(ligaId);

  if (config?.ranking_rodada) {
    const rankingConfig = config.ranking_rodada;

    if (rankingConfig.temporal) {
      const rodadaTransicao = rankingConfig.rodada_transicao || 30;
      const fase = rodada < rodadaTransicao ? "fase1" : "fase2";
      const faseConfig = rankingConfig[fase];
      return {
        totalTimes: faseConfig?.total_participantes || 0,
        ...faseConfig?.faixas,
      };
    }

    return {
      totalTimes: rankingConfig.total_participantes || DEFAULT_TOTAL_PARTICIPANTES,
      ...rankingConfig.faixas,
    };
  }

  // Fallback
  return getFaixasPorRodada(ligaId, rodada);
}

/**
 * Obtem total de times ativos para uma rodada
 * @param {string} ligaId - ID da liga
 * @param {number} rodada - Numero da rodada
 * @returns {Promise<number>}
 */
export async function getTotalTimesPorRodadaAsync(ligaId, rodada) {
  const config = await fetchLigaConfig(ligaId);

  if (config?.ranking_rodada) {
    const rankingConfig = config.ranking_rodada;

    if (rankingConfig.temporal) {
      const rodadaTransicao = rankingConfig.rodada_transicao || 30;
      const fase = rodada < rodadaTransicao ? "fase1" : "fase2";
      return rankingConfig[fase]?.total_participantes || 0;
    }

    return rankingConfig.total_participantes || config.total_participantes || 0;
  }

  // Fallback
  return getTotalTimesPorRodada(ligaId, rodada);
}

/**
 * Verifica se um modulo esta habilitado
 * @param {string} ligaId - ID da liga
 * @param {string} modulo - Nome do modulo
 * @returns {Promise<boolean>}
 */
export async function isModuloHabilitadoAsync(ligaId, modulo) {
  const config = await fetchLigaConfig(ligaId);
  if (!config) return false;

  const configModulo = config.configuracoes?.[modulo];
  if (configModulo?.habilitado !== undefined) {
    return configModulo.habilitado;
  }

  const moduloCamel = modulo.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return config.modulos_ativos?.[moduloCamel] || false;
}

/**
 * Obtem cards desabilitados da liga
 * @param {string} ligaId - ID da liga
 * @returns {Promise<Array>}
 */
export async function getCardsDesabilitadosAsync(ligaId) {
  const config = await fetchLigaConfig(ligaId);
  return config?.cards_desabilitados || [];
}

// =====================================================================
// FUNCOES SINCRONAS (fallback - compatibilidade)
// =====================================================================

// Helper: tenta obter config do cache local (sincrono, sem fetch)
function _getCachedConfig(ligaId) {
  const cached = configsCache.get(ligaId);
  return cached?.data || null;
}

export function getBancoPorRodada(ligaId, rodada) {
  // 1. Tentar cache do servidor (funciona para QUALQUER liga)
  const config = _getCachedConfig(ligaId);
  if (config?.ranking_rodada) {
    const rc = config.ranking_rodada;
    if (rc.temporal) {
      const fase = rodada < (rc.rodada_transicao || 30) ? "fase1" : "fase2";
      return rc[fase]?.valores || {};
    }
    return rc.valores || {};
  }
  // 2. Fallback generico (sem cache = usa defaults SuperCartola)
  return FALLBACK_VALORES_SUPERCARTOLA;
}

export function getBancoPorLiga(ligaId) {
  const config = _getCachedConfig(ligaId);
  if (config?.ranking_rodada) {
    return config.ranking_rodada.valores || {};
  }
  return FALLBACK_VALORES_SUPERCARTOLA;
}

export function getFaixasPorRodada(ligaId, rodada) {
  const config = _getCachedConfig(ligaId);
  if (config?.ranking_rodada) {
    const rc = config.ranking_rodada;
    if (rc.temporal) {
      const fase = rodada < (rc.rodada_transicao || 30) ? "fase1" : "fase2";
      const faseConfig = rc[fase];
      return {
        totalTimes: faseConfig?.total_participantes || 0,
        ...faseConfig?.faixas,
      };
    }
    return {
      totalTimes: rc.total_participantes || config.total_participantes || 0,
      ...rc.faixas,
    };
  }
  // Fallback generico
  return {
    totalTimes: 32,
    credito: { inicio: 1, fim: 11 },
    neutro: { inicio: 12, fim: 21 },
    debito: { inicio: 22, fim: 32 },
  };
}

export function getTotalTimesPorRodada(ligaId, rodada) {
  const config = _getCachedConfig(ligaId);
  if (config?.ranking_rodada) {
    const rc = config.ranking_rodada;
    if (rc.temporal) {
      const fase = rodada < (rc.rodada_transicao || 30) ? "fase1" : "fase2";
      return rc[fase]?.total_participantes || 0;
    }
    return rc.total_participantes || config.total_participantes || 0;
  }
  return 32;
}

// =====================================================================
// CONFIGURACAO DE ENDPOINTS
// =====================================================================

export const RODADAS_ENDPOINTS = {
  getEndpoints: (ligaId, rodadaNum, baseUrl = "") => [
    `${baseUrl}/api/rodadas/${ligaId}/rodadas?inicio=${rodadaNum}&fim=${rodadaNum}`,
    `${baseUrl}/api/ligas/${ligaId}/rodadas?rodada=${rodadaNum}`,
    `${baseUrl}/api/ligas/${ligaId}/ranking/${rodadaNum}`,
  ],
  mercadoStatus: "/api/cartola/mercado/status",
  liga: (ligaId, baseUrl = "") => `${baseUrl}/api/ligas/${ligaId}`,
  configuracoes: (ligaId, baseUrl = "") => `${baseUrl}/api/ligas/${ligaId}/configuracoes`,
  pontuacoesParciais: "/api/cartola/atletas/pontuados",
  timeEscalacao: (timeId, rodada, baseUrl = "") =>
    `${baseUrl}/api/cartola/time/id/${timeId}/${rodada}`,
};

// ✅ v4.4 FIX: Adicionar temporada ao default para pré-temporada funcionar
export const STATUS_MERCADO_DEFAULT = {
  rodada_atual: 1,
  status_mercado: 1,  // Mercado aberto (pré-temporada padrão)
  temporada: new Date().getFullYear(),  // Ano atual
};

export const TIMEOUTS_CONFIG = {
  renderizacao: 500,
  imageLoad: 3000,
  apiTimeout: 8000,
  retryDelay: 1000,
};

console.log("[RODADAS-CONFIG] v5.0.0 SaaS Dinamico carregado");
