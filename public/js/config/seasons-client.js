/**
 * CONFIGURAÇÃO DE TEMPORADAS - Cliente (Frontend)
 *
 * Espelho do config/seasons.js para uso em módulos ES6 do frontend.
 * Atualizar CURRENT_SEASON aqui quando virar o ano.
 *
 * @version 1.0.0
 */

// =============================================================================
// TEMPORADA ATUAL - MUDE APENAS AQUI PARA VIRAR O ANO
// =============================================================================
export const CURRENT_SEASON = 2026;

// Brasileirão = 38 rodadas (espelho de config/seasons.js:rodadaFinal)
export const RODADA_FINAL_CAMPEONATO = 38;

// Default de participantes por liga (fallback quando API não retorna total_participantes)
export const DEFAULT_TOTAL_PARTICIPANTES = 32;

// =============================================================================
// FUNÇÕES AUXILIARES
// =============================================================================

/**
 * Verifica se uma temporada é a atual
 * @param {number} temporada
 * @returns {boolean}
 */
export const isCurrentSeason = (temporada) => temporada === CURRENT_SEASON;

/**
 * Retorna a temporada anterior
 * @returns {number}
 */
export const getPreviousSeason = () => CURRENT_SEASON - 1;

console.log(`[SEASONS-CLIENT] ⚙️ Temporada atual: ${CURRENT_SEASON}`);
