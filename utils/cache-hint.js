// =============================================================================
// CACHE-HINT.JS — Helper centralizado para cacheHint em responses de API
// =============================================================================
// Gera metadados de cache (ttl, imutavel, versao) que o frontend usa para
// decidir quanto tempo cachear cada response. Fonte única de verdade para
// regras de TTL do Super Cache Inteligente.
//
// Uso em controllers:
//   import { buildCacheHint, getMercadoContext } from '../utils/cache-hint.js';
//   const ctx = await getMercadoContext();
//   const cacheHint = buildCacheHint({ rodada: 5, ...ctx, tipo: 'ranking' });
//   res.json({ data: resultado, cacheHint });
// =============================================================================

import marketGate from './marketGate.js';

// TTLs em segundos
export const TTL = {
  TEMPORADA_ENCERRADA: 365 * 24 * 3600,  // 1 ano
  RODADA_CONSOLIDADA: 30 * 24 * 3600,     // 30 dias
  CONFIG: 24 * 3600,                       // 24h
  MERCADO_ABERTO: 30 * 60,                // 30 min
  ENTRE_RODADAS: 3600,                     // 1h
  RANKING_ATIVA: 60,                       // 60s
  RODADA_ATIVA: 30,                        // 30s
  NAO_CACHEAR: 0
};

/**
 * Gera cacheHint para responses de API do participante.
 *
 * @param {Object} params
 * @param {number} [params.rodada] - Rodada dos dados retornados
 * @param {number} [params.rodadaAtual] - Rodada atual do mercado
 * @param {number} [params.statusMercado] - Status do mercado (1=aberto, 2=fechado, 4=encerrado, 6=temporada)
 * @param {number} [params.temporada] - Temporada dos dados
 * @param {number} [params.temporadaAtual] - Temporada atual
 * @param {string} [params.tipo] - Tipo: 'ranking', 'rodada', 'extrato', 'config', 'mercado'
 * @returns {{ ttl: number, imutavel: boolean, motivo: string, versao: string }}
 */
export function buildCacheHint({ rodada, rodadaAtual, statusMercado, temporada, temporadaAtual, tipo } = {}) {
  // Temporada passada = totalmente imutavel
  if (temporada && temporadaAtual && temporada < temporadaAtual) {
    return {
      ttl: TTL.TEMPORADA_ENCERRADA,
      imutavel: true,
      motivo: 'temporada_encerrada',
      versao: `t${temporada}`
    };
  }

  // Temporada encerrada (status 6)
  if (statusMercado === 6) {
    return {
      ttl: TTL.TEMPORADA_ENCERRADA,
      imutavel: true,
      motivo: 'temporada_encerrada',
      versao: `r${rodada || rodadaAtual}_t${temporada}`
    };
  }

  // Rodada consolidada (rodada < atual e mercado aberto)
  if (rodada && rodadaAtual && rodada < rodadaAtual && statusMercado === 1) {
    return {
      ttl: TTL.RODADA_CONSOLIDADA,
      imutavel: true,
      motivo: 'rodada_consolidada',
      versao: `r${rodada}_t${temporada}`
    };
  }

  // Config de liga / modulos
  if (tipo === 'config') {
    return {
      ttl: TTL.CONFIG,
      imutavel: false,
      motivo: 'config',
      versao: `cfg_r${rodadaAtual || 0}_t${temporada}`
    };
  }

  // Mercado status (nunca cachear no frontend — polling próprio)
  if (tipo === 'mercado') {
    return {
      ttl: TTL.NAO_CACHEAR,
      imutavel: false,
      motivo: 'mercado_status',
      versao: `mkt_r${rodadaAtual}_s${statusMercado}`
    };
  }

  // Extrato entre rodadas (check antes de rodada_ativa para não ser engolido)
  if (tipo === 'extrato' && statusMercado !== 2) {
    return {
      ttl: TTL.ENTRE_RODADAS,
      imutavel: false,
      motivo: 'entre_rodadas',
      versao: `ext_r${rodadaAtual}_t${temporada}`
    };
  }

  // Rodada ativa (mercado fechado)
  if (statusMercado === 2) {
    const ttl = tipo === 'ranking' ? TTL.RANKING_ATIVA : TTL.RODADA_ATIVA;
    return {
      ttl,
      imutavel: false,
      motivo: 'rodada_ativa',
      versao: `r${rodada || rodadaAtual}_t${temporada}_live`
    };
  }

  // Default: mercado aberto
  return {
    ttl: TTL.MERCADO_ABERTO,
    imutavel: false,
    motivo: 'mercado_aberto',
    versao: `r${rodadaAtual || 0}_t${temporada}`
  };
}

/**
 * Helper para obter contexto do mercado atual.
 * Usa MarketGate (singleton com cache interno de 2-5min).
 *
 * @returns {Promise<{ rodadaAtual: number|null, statusMercado: number|null, temporadaAtual: number|null }>}
 */
export async function getMercadoContext() {
  try {
    const status = await marketGate.fetchStatus();
    return {
      rodadaAtual: status?.rodada_atual || null,
      statusMercado: status?.status_mercado || null,
      temporadaAtual: status?.temporada || null
    };
  } catch {
    return { rodadaAtual: null, statusMercado: null, temporadaAtual: null };
  }
}
