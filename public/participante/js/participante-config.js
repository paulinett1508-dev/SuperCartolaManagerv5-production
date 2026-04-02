// =====================================================================
// PARTICIPANTE-CONFIG.JS - Configurações globais do App do Participante
// =====================================================================
// ✅ v2.0: Valores hardcoded agora são FALLBACKS
//          Use SeasonStatusManager para dados dinâmicos em tempo real
// ✅ v1.1 FIX: Removidos exports ES6 pois arquivo é carregado como script normal

// Temporada atual (sincronizado com config/seasons.js do backend)
// ⚠️ FALLBACK ESTÁTICO - Para dados dinâmicos use SeasonStatusManager
const CURRENT_SEASON = 2026;
const PREVIOUS_SEASON = CURRENT_SEASON - 1; // ✅ v2.1 FIX: Calculado dinamicamente (não hardcoded)

// Status da temporada: 'ativa' | 'preparando' | 'encerrada'
// 'preparando' = Brasileirao nao iniciou, modulos bloqueados
// ⚠️ FALLBACK ESTÁTICO - Use SeasonStatusManager.getStatus() para dinâmico
const SEASON_STATUS = 'ativa';

// Datas importantes da temporada 2026
const MARKET_OPEN_DATE = '2026-01-12';  // Abertura do mercado Cartola FC
const SEASON_START_DATE = '2026-01-28'; // Inicio do Brasileirao

// Feature flags
const FEATURES = {
    SHOW_HISTORY_BANNER: true,      // Mostrar banner de resumo da temporada anterior
    SHOW_SEASON_SELECTOR: true,     // Mostrar seletor de temporada no header
    ENABLE_OFFLINE_MODE: true,      // Habilitar modo offline com IndexedDB
    SHOW_VEM_AI_MODAL: true,        // Mostrar modal "Vem Ai" na entrada (pre-temporada)
};

// Mapeamento de badges para exibição
// icon: nome do Material Icon (renderizar com <span class="material-icons">)
const BADGES_CONFIG = {
    campeao: { icon: "emoji_events", nome: "Campeão", cor: "var(--app-gold)" },
    campeao_2025: { icon: "emoji_events", nome: "Campeão", cor: "var(--app-gold)" },
    vice: { icon: "military_tech", nome: "Vice", cor: "var(--app-silver)" },
    vice_2025: { icon: "military_tech", nome: "Vice", cor: "var(--app-silver)" },
    terceiro: { icon: "workspace_premium", nome: "3º Lugar", cor: "var(--app-bronze)" },
    terceiro_2025: { icon: "workspace_premium", nome: "3º Lugar", cor: "var(--app-bronze)" },
    top10_mito: { icon: "star", nome: "Top Mito", cor: "var(--app-success)" },
    top10_mito_2025: { icon: "star", nome: "Top Mito", cor: "var(--app-success)" },
    top10_mico: { icon: "trending_down", nome: "Top Mico", cor: "var(--app-danger)" },
    top10_mico_2025: { icon: "trending_down", nome: "Top Mico", cor: "var(--app-danger)" },
    artilheiro: { icon: "sports_soccer", nome: "Artilheiro", cor: "var(--app-info)" },
    luva_ouro: { icon: "sports_handball", nome: "Luva Ouro", cor: "var(--app-amber)" },
    capitao_luxo: { icon: "stars", nome: "Capitão Luxo", cor: "var(--app-purple)" },
    melhor_mes: { icon: "calendar_month", nome: "Melhor Mês", cor: "var(--app-purple)" },
    mata_mata_campeao: { icon: "swords", nome: "Mata-Mata", cor: "var(--app-pink)" },
};

// Exportar para uso global
window.ParticipanteConfig = {
    CURRENT_SEASON,
    PREVIOUS_SEASON,
    SEASON_STATUS,
    MARKET_OPEN_DATE,
    SEASON_START_DATE,
    FEATURES,
    BADGES_CONFIG,

    // Helpers
    isPreparando: () => SEASON_STATUS === 'preparando',
    isAtiva: () => SEASON_STATUS === 'ativa',

    // ✅ v1.2 FIX: Retorna temporada correta para dados FINANCEIROS
    // Durante pré-temporada, retorna temporada anterior (CURRENT_SEASON - 1)
    getFinancialSeason: () => {
        if (SEASON_STATUS === 'preparando') {
            return PREVIOUS_SEASON; // Temporada anterior durante pré-temporada
        }
        return CURRENT_SEASON;
    },

    // Contagem regressiva ate abertura do mercado
    getMarketCountdown: () => {
        const open = new Date(MARKET_OPEN_DATE);
        const now = new Date();
        const diff = Math.ceil((open - now) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 0;
    },

    // Contagem regressiva ate inicio do Brasileirao
    getCountdownDays: () => {
        const start = new Date(SEASON_START_DATE);
        const now = new Date();
        const diff = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 0;
    },

    // Verifica se mercado ja abriu
    isMarketOpen: () => {
        const open = new Date(MARKET_OPEN_DATE);
        const now = new Date();
        return now >= open;
    }
};
