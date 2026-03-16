// =====================================================================
// PARTICIPANTE CACHE MANAGER - v2.0 (PERSISTENTE COM IndexedDB)
// =====================================================================
// Cache em 2 camadas:
// - L1: Memória (instantâneo, volátil)
// - L2: IndexedDB (persistente entre sessões)
// Estratégia: Cache-First com Stale-While-Revalidate
// =====================================================================

const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

if (window.Log) Log.info('CACHE-MANAGER', '🚀 Carregando sistema v2.1...');

const CACHE_PREFIX = 'participante_cache_';
const MEMORY_TTL = 5 * 60 * 1000; // 5 minutos (cache memória mais curto)

class ParticipanteCacheManager {
    constructor() {
        this.memoryCache = {};
        this.pendingFetches = {}; // Evitar requisições duplicadas
    }

    // =========================================================================
    // MÉTODOS INTERNOS
    // =========================================================================

    _getCacheKey(key) {
        return `${CACHE_PREFIX}${key}`;
    }

    _isMemoryExpired(timestamp) {
        return Date.now() - timestamp > MEMORY_TTL;
    }

    // =========================================================================
    // CACHE L1 - MEMÓRIA (instantâneo)
    // =========================================================================

    setMemory(key, data) {
        this.memoryCache[key] = {
            data,
            timestamp: Date.now()
        };
    }

    getMemory(key) {
        const cached = this.memoryCache[key];
        if (cached && !this._isMemoryExpired(cached.timestamp)) {
            return cached.data;
        }
        return null;
    }

    // =========================================================================
    // CACHE L2 - IndexedDB (persistente)
    // =========================================================================

    async setPersistent(store, key, data) {
        // Salvar em memória primeiro (sempre)
        this.setMemory(`${store}_${key}`, data);

        // Salvar em IndexedDB se disponível
        if (window.OfflineCache) {
            await window.OfflineCache.set(store, key, data);
        }
    }

    async getPersistent(store, key, ignoreExpiry = false) {
        // L1: Tentar memória primeiro
        const memKey = `${store}_${key}`;
        const memCached = this.getMemory(memKey);
        if (memCached) {
            return memCached;
        }

        // L2: Tentar IndexedDB
        if (window.OfflineCache) {
            const dbCached = await window.OfflineCache.get(store, key, ignoreExpiry);
            if (dbCached) {
                // Promover para L1
                this.setMemory(memKey, dbCached);
                return dbCached;
            }
        }

        return null;
    }

    // =========================================================================
    // API PRINCIPAL - CACHE-FIRST COM FALLBACK
    // =========================================================================

    /**
     * Buscar dado com estratégia cache-first + stale-while-revalidate
     * @param {string} store - Store do IndexedDB
     * @param {string} key - Chave única
     * @param {Function} fetchFn - Função que busca da API
     * @param {Function} onUpdate - Callback quando dados atualizam em background
     * @returns {any} Dados do cache ou da API
     */
    async getWithFallback(store, key, fetchFn, onUpdate = null) {
        const cacheKey = `${store}_${key}`;

        // Evitar requisições duplicadas
        if (this.pendingFetches[cacheKey]) {
            return this.pendingFetches[cacheKey];
        }

        // L1: Memória (instantâneo)
        const memCached = this.getMemory(cacheKey);
        if (memCached) {
            if (window.Log) Log.debug('CACHE-MANAGER', `⚡ L1 hit: ${cacheKey}`);
            return memCached;
        }

        // L2: IndexedDB
        if (window.OfflineCache) {
            const result = await window.OfflineCache.getWithFallback(
                store,
                key,
                fetchFn,
                (freshData) => {
                    // Atualizar L1 quando dados chegarem
                    this.setMemory(cacheKey, freshData);
                    if (onUpdate) onUpdate(freshData);
                }
            );

            if (result) {
                this.setMemory(cacheKey, result);
                return result;
            }
        }

        // Fallback: Buscar da API diretamente
        try {
            this.pendingFetches[cacheKey] = fetchFn();
            const data = await this.pendingFetches[cacheKey];
            delete this.pendingFetches[cacheKey];

            if (data) {
                this.setMemory(cacheKey, data);
            }
            return data;
        } catch (error) {
            delete this.pendingFetches[cacheKey];
            throw error;
        }
    }

    // =========================================================================
    // MÉTODOS ESPECÍFICOS - COMPATIBILIDADE COM v1.0
    // =========================================================================

    // ----- SET (síncrono para compatibilidade, salva em background) -----

    set(key, data) {
        this.setMemory(key, data);
        // Salvar em IndexedDB em background
        if (window.OfflineCache) {
            window.OfflineCache.set('config', key, data);
        }
    }

    get(key) {
        return this.getMemory(key);
    }

    // ----- DADOS DO PARTICIPANTE -----

    setParticipanteBasico(ligaId, timeId, dados) {
        const key = `${ligaId}_${timeId}`;
        this.setMemory(`participante_${key}`, dados);
        if (window.OfflineCache) {
            window.OfflineCache.saveParticipante(ligaId, timeId, dados);
        }
        if (window.Log) Log.debug('CACHE-MANAGER', '✅ Participante salvo');
    }

    getParticipanteBasico(ligaId, timeId) {
        const key = `participante_${ligaId}_${timeId}`;
        return this.getMemory(key);
    }

    async getParticipanteBasicoAsync(ligaId, timeId) {
        const memKey = `participante_${ligaId}_${timeId}`;
        const mem = this.getMemory(memKey);
        if (mem) return mem;

        if (window.OfflineCache) {
            const db = await window.OfflineCache.getParticipante(ligaId, timeId);
            if (db) {
                this.setMemory(memKey, db);
                return db;
            }
        }
        return null;
    }

    // ----- LIGA -----

    setLiga(ligaId, dados) {
        this.setMemory(`liga_${ligaId}`, dados);
        if (window.OfflineCache) {
            window.OfflineCache.saveLiga(ligaId, dados);
        }
    }

    getLiga(ligaId) {
        return this.getMemory(`liga_${ligaId}`);
    }

    async getLigaAsync(ligaId, fetchFn = null, onUpdate = null) {
        if (fetchFn) {
            return this.getWithFallback('liga', ligaId, fetchFn, onUpdate);
        }
        return this.getPersistent('liga', ligaId, true);
    }

    // ----- RANKING -----

    // ✅ v2.1: Ranking com segregação por temporada
    setRanking(ligaId, dados, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        this.setMemory(`ranking_${key}`, dados);
        if (window.OfflineCache) {
            window.OfflineCache.saveRanking(ligaId, dados, temp);
        }
    }

    getRanking(ligaId, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        return this.getMemory(`ranking_${key}`);
    }

    async getRankingAsync(ligaId, fetchFn = null, onUpdate = null, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        if (fetchFn) {
            return this.getWithFallback('ranking', key, fetchFn, onUpdate);
        }
        return this.getPersistent('ranking', key, true);
    }

    // ----- EXTRATO -----

    setExtrato(ligaId, timeId, dados) {
        const key = `${ligaId}_${timeId}`;
        this.setMemory(`extrato_${key}`, dados);
        if (window.OfflineCache) {
            window.OfflineCache.saveExtrato(ligaId, timeId, dados);
        }
    }

    getExtrato(ligaId, timeId) {
        return this.getMemory(`extrato_${ligaId}_${timeId}`);
    }

    async getExtratoAsync(ligaId, timeId, fetchFn = null, onUpdate = null) {
        const key = `${ligaId}_${timeId}`;
        if (fetchFn) {
            return this.getWithFallback('extrato', key, fetchFn, onUpdate);
        }
        return this.getPersistent('extrato', key, true);
    }

    // ----- RODADAS -----

    // ✅ v2.2: Rodadas com segregação por temporada (similar ao ranking)
    setRodadas(ligaId, dados, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        this.setMemory(`rodadas_${key}`, dados);
        if (window.OfflineCache) {
            window.OfflineCache.set('rodadas', key, dados);
        }
    }

    getRodadas(ligaId, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        return this.getMemory(`rodadas_${key}`);
    }

    async getRodadasAsync(ligaId, fetchFn = null, onUpdate = null, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        if (fetchFn) {
            return this.getWithFallback('rodadas', key, fetchFn, onUpdate);
        }
        return this.getPersistent('rodadas', key, true);
    }

    // ----- MÓDULOS ATIVOS -----

    setModulosAtivos(ligaId, dados) {
        this.setMemory(`modulos_${ligaId}`, dados);
        if (window.OfflineCache) {
            window.OfflineCache.set('config', `modulos_${ligaId}`, dados);
        }
    }

    getModulosAtivos(ligaId) {
        return this.getMemory(`modulos_${ligaId}`);
    }

    // =========================================================================
    // LIMPEZA
    // =========================================================================

    clear(key) {
        delete this.memoryCache[key];
    }

    clearAll() {
        this.memoryCache = {};
        if (window.OfflineCache) {
            window.OfflineCache.clearAll();
        }
    }

    // =========================================================================
    // UTILITÁRIOS
    // =========================================================================

    has(key) {
        return this.getMemory(key) !== null;
    }

    /**
     * Verificar se tem dados para carregamento instantâneo
     */
    async hasInstantData(ligaId, timeId) {
        // Verificar memória
        if (this.getParticipanteBasico(ligaId, timeId)) {
            return true;
        }

        // Verificar IndexedDB
        if (window.OfflineCache) {
            return window.OfflineCache.hasInstantData(ligaId, timeId);
        }

        return false;
    }

    /**
     * Pré-carregar dados essenciais para carregamento instantâneo
     */
    async preloadEssentials(ligaId, timeId) {
        if (window.Log) Log.info('CACHE-MANAGER', '📦 Pré-carregando dados essenciais...');

        const promises = [];

        // Liga
        promises.push(
            this.getLigaAsync(ligaId, async () => {
                const res = await fetch(`/api/ligas/${ligaId}`);
                return res.ok ? res.json() : null;
            })
        );

        // ✅ v9.0: Passar temporada para segregar dados por ano
        const temporada = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();

        // Ranking - ✅ v2.1: Passar temporada para segregar cache
        promises.push(
            this.getRankingAsync(ligaId, async () => {
                const res = await fetch(`/api/ligas/${ligaId}/ranking?temporada=${temporada}`);
                return res.ok ? res.json() : [];
            }, null, temporada)
        );

        // Rodadas
        promises.push(
            this.getRodadasAsync(ligaId, async () => {
                const res = await fetch(`/api/rodadas/${ligaId}/rodadas?inicio=1&fim=${RODADA_FINAL_CAMPEONATO}&temporada=${temporada}`);
                return res.ok ? res.json() : [];
            }, null, temporada)
        );

        await Promise.all(promises);

        if (window.Log) Log.info('CACHE-MANAGER', '✅ Dados essenciais pré-carregados');
    }
}

// Singleton global
const _legacyCacheManager = new ParticipanteCacheManager();
window.ParticipanteCache = _legacyCacheManager;

// ✅ Super Cache v2 shim: redirecionar métodos-chave para Cache v2 quando disponível
if (window.Cache) {
    const _v2 = window.Cache;
    const _orig = window.ParticipanteCache;

    // Sobrescrever métodos que devem usar Cache v2
    _orig.setParticipanteBasico = function(ligaId, timeId, data) {
        _v2.set(`participante:${ligaId}:${timeId}`, data, { ttl: 86400, motivo: 'auth' });
    };

    _orig.preloadEssentials = async function(ligaId, timeId) {
        const temp = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        return _v2.preload(ligaId, timeId, temp);
    };

    _orig.clear = function() {
        _v2.invalidatePrefix('*');
    };

    if (window.Log) Log.info('CACHE-MANAGER', '✅ Shim v2 ativo — redirecionando para Super Cache');
} else {
    if (window.Log) Log.info('CACHE-MANAGER', '✅ Sistema legado v2.0 inicializado');
}
