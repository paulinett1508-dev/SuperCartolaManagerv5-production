// =====================================================================
// PARTICIPANTE-OFFLINE-CACHE.JS - Sistema de Cache Persistente v2.3
// =====================================================================
// v2.3: FIX Ranking cache segregado por temporada (evita dados de anos anteriores)
// v2.2: FIX Race condition no init() - reutiliza Promise se já em andamento
// v2.1: Novos stores para artilheiro, luvaOuro, melhorMes
// v2.0: Temporada encerrada = Cache PERMANENTE (dados imutáveis)
// v1.0: Cache offline usando IndexedDB para carregamento instantâneo
// Estratégia: Stale-While-Revalidate (mostra cache, atualiza em background)
// =====================================================================

if (window.Log) Log.info('OFFLINE-CACHE', 'Carregando sistema v2.3...');

const OfflineCache = {
    DB_NAME: 'SuperCartolaOffline',
    DB_VERSION: 2, // v2.1: Novos stores
    db: null,
    _initPromise: null, // ✅ v2.2: Evita race condition no init()

    // =====================================================================
    // FLAG DE TEMPORADA ENCERRADA - Cache permanente
    // =====================================================================
    TEMPORADA_ENCERRADA: false, // Calculado dinamicamente via ParticipanteConfig

    // TTL infinito para temporada encerrada (10 anos em ms)
    TTL_INFINITO: 10 * 365 * 24 * 60 * 60 * 1000,

    // Stores e seus TTLs (em milissegundos)
    // Quando TEMPORADA_ENCERRADA = true, usa TTL_INFINITO
    STORES: {
        participante: { ttl: 24 * 60 * 60 * 1000 },  // 24 horas
        liga: { ttl: 24 * 60 * 60 * 1000 },          // 24 horas
        ranking: { ttl: 30 * 60 * 1000 },            // 30 minutos
        rodadas: { ttl: 60 * 60 * 1000 },            // 1 hora
        extrato: { ttl: 30 * 60 * 1000 },            // 30 minutos
        top10: { ttl: 60 * 60 * 1000 },              // 1 hora
        pontosCorridos: { ttl: 60 * 60 * 1000 },     // 1 hora
        mataMata: { ttl: 60 * 60 * 1000 },           // 1 hora
        artilheiro: { ttl: 60 * 60 * 1000 },         // 1 hora (v2.1)
        luvaOuro: { ttl: 60 * 60 * 1000 },           // 1 hora (v2.1)
        melhorMes: { ttl: 60 * 60 * 1000 },          // 1 hora (v2.1)
        config: { ttl: 24 * 60 * 60 * 1000 },        // 24 horas
    },

    // Detecta se a temporada atual está encerrada
    isTemporadaEncerrada() {
        const status = window.ParticipanteConfig?.SEASON_STATUS;
        if (!status) return this.TEMPORADA_ENCERRADA;
        return status === 'encerrada';
    },

    // Retorna TTL efetivo (infinito se temporada encerrada)
    getTTL(store) {
        if (this.isTemporadaEncerrada()) {
            return this.TTL_INFINITO;
        }
        return this.STORES[store]?.ttl || 30 * 60 * 1000;
    },

    // =========================================================================
    // INICIALIZAÇÃO (v2.2: Race condition fix)
    // =========================================================================
    async init() {
        // ✅ Se já inicializado, retorna imediatamente
        if (this.db) return this.db;

        // ✅ v2.2: Se já há uma inicialização em andamento, reutiliza a Promise
        // Isso evita race condition quando múltiplas operações chamam init() simultaneamente
        if (this._initPromise) {
            return this._initPromise;
        }

        // ✅ Criar e armazenar a Promise de inicialização
        this._initPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                if (window.Log) Log.warn('OFFLINE-CACHE', 'IndexedDB não suportado');
                resolve(null);
                return;
            }

            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = (event) => {
                if (window.Log) Log.error('OFFLINE-CACHE', 'Erro ao abrir DB:', event.target.error);
                this._initPromise = null; // Reset para permitir retry
                resolve(null);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                if (window.Log) Log.info('OFFLINE-CACHE', '✅ IndexedDB inicializado');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Criar stores para cada tipo de dado
                Object.keys(this.STORES).forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: 'key' });
                        if (window.Log) Log.debug('OFFLINE-CACHE', `Store criada: ${storeName}`);
                    }
                });
            };
        });

        return this._initPromise;
    },

    // =========================================================================
    // OPERAÇÕES CRUD
    // =========================================================================

    /**
     * Salvar dado no cache
     * @param {string} store - Nome do store (participante, liga, etc)
     * @param {string} key - Chave única (ex: ligaId, timeId)
     * @param {any} data - Dados a armazenar
     */
    async set(store, key, data) {
        await this.init();
        if (!this.db) return false;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([store], 'readwrite');
                const objectStore = transaction.objectStore(store);

                const record = {
                    key: key,
                    data: data,
                    timestamp: Date.now(),
                    ttl: this.getTTL(store)
                };

                const request = objectStore.put(record);

                request.onsuccess = () => {
                    if (window.Log) Log.debug('OFFLINE-CACHE', `✅ Salvo: ${store}/${key}`);
                    resolve(true);
                };

                request.onerror = () => {
                    if (window.Log) Log.warn('OFFLINE-CACHE', `Erro ao salvar: ${store}/${key}`);
                    resolve(false);
                };
            } catch (e) {
                if (window.Log) Log.warn('OFFLINE-CACHE', `Exceção ao salvar: ${e.message}`);
                resolve(false);
            }
        });
    },

    /**
     * Buscar dado do cache
     * @param {string} store - Nome do store
     * @param {string} key - Chave única
     * @param {boolean} ignoreExpiry - Ignorar expiração (retorna mesmo expirado)
     * @returns {any|null} Dados ou null se não encontrado/expirado
     */
    async get(store, key, ignoreExpiry = false) {
        await this.init();
        if (!this.db) return null;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([store], 'readonly');
                const objectStore = transaction.objectStore(store);
                const request = objectStore.get(key);

                request.onsuccess = (event) => {
                    const record = event.target.result;

                    if (!record) {
                        resolve(null);
                        return;
                    }

                    // Verificar expiração
                    const age = Date.now() - record.timestamp;
                    const isExpired = age > record.ttl;

                    if (isExpired && !ignoreExpiry) {
                        if (window.Log) Log.debug('OFFLINE-CACHE', `⏰ Expirado: ${store}/${key}`);
                        resolve(null);
                        return;
                    }

                    if (window.Log) Log.debug('OFFLINE-CACHE', `📦 Cache hit: ${store}/${key} (${isExpired ? 'expirado' : 'válido'})`);
                    resolve(record.data);
                };

                request.onerror = () => {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    },

    /**
     * Buscar dado com fallback para API (stale-while-revalidate)
     * @param {string} store - Nome do store
     * @param {string} key - Chave única
     * @param {Function} fetchFn - Função que busca da API
     * @param {Function} onUpdate - Callback quando dados são atualizados em background
     * @returns {any} Dados do cache ou da API
     */
    async getWithFallback(store, key, fetchFn, onUpdate = null) {
        // 1. Tentar cache (mesmo expirado para mostrar algo rápido)
        const cached = await this.get(store, key, true);

        // =====================================================================
        // TEMPORADA ENCERRADA: Cache é definitivo, não precisa atualizar
        // =====================================================================
        if (this.isTemporadaEncerrada() && cached) {
            if (window.Log) Log.debug('OFFLINE-CACHE', `📦 Temporada encerrada - usando cache permanente: ${store}/${key}`);
            return cached;
        }

        // 2. Verificar se cache está válido
        const validCached = await this.get(store, key, false);

        if (validCached) {
            // Cache válido - retorna imediatamente
            if (window.Log) Log.debug('OFFLINE-CACHE', `🚀 Cache válido: ${store}/${key}`);
            return validCached;
        }

        if (cached) {
            // Cache expirado - retorna stale e atualiza em background
            if (window.Log) Log.debug('OFFLINE-CACHE', `🔄 Stale cache: ${store}/${key} - atualizando em background`);

            // Atualizar em background
            this._refreshInBackground(store, key, fetchFn, onUpdate);

            return cached;
        }

        // 3. Sem cache - buscar da API
        if (window.Log) Log.debug('OFFLINE-CACHE', `🌐 Sem cache: ${store}/${key} - buscando da API`);

        try {
            const freshData = await fetchFn();
            if (freshData) {
                await this.set(store, key, freshData);
            }
            return freshData;
        } catch (error) {
            if (window.Log) Log.error('OFFLINE-CACHE', `Erro ao buscar: ${store}/${key}`, error);
            return null;
        }
    },

    /**
     * Atualizar dados em background
     */
    async _refreshInBackground(store, key, fetchFn, onUpdate) {
        try {
            const freshData = await fetchFn();
            if (freshData) {
                await this.set(store, key, freshData);
                if (onUpdate) {
                    onUpdate(freshData);
                }
            }
        } catch (error) {
            if (window.Log) Log.debug('OFFLINE-CACHE', `Background refresh falhou: ${store}/${key}`);
        }
    },

    /**
     * Deletar dado do cache
     */
    async delete(store, key) {
        await this.init();
        if (!this.db) return false;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([store], 'readwrite');
                const objectStore = transaction.objectStore(store);
                const request = objectStore.delete(key);

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    },

    /**
     * Limpar todo o cache de um store
     */
    async clearStore(store) {
        await this.init();
        if (!this.db) return false;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([store], 'readwrite');
                const objectStore = transaction.objectStore(store);
                const request = objectStore.clear();

                request.onsuccess = () => {
                    if (window.Log) Log.info('OFFLINE-CACHE', `🗑️ Store limpo: ${store}`);
                    resolve(true);
                };
                request.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    },

    /**
     * Limpar todo o cache
     */
    async clearAll() {
        await this.init();
        if (!this.db) return false;

        const promises = Object.keys(this.STORES).map(store => this.clearStore(store));
        await Promise.all(promises);

        if (window.Log) Log.info('OFFLINE-CACHE', '🗑️ Todo cache limpo');
        return true;
    },

    /**
     * Limpar cache expirado (manutenção)
     */
    async cleanExpired() {
        await this.init();
        if (!this.db) return;

        for (const store of Object.keys(this.STORES)) {
            try {
                const transaction = this.db.transaction([store], 'readwrite');
                const objectStore = transaction.objectStore(store);
                const request = objectStore.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const record = cursor.value;
                        const age = Date.now() - record.timestamp;

                        // Limpar se expirado há mais de 2x o TTL
                        if (age > record.ttl * 2) {
                            cursor.delete();
                            if (window.Log) Log.debug('OFFLINE-CACHE', `🧹 Limpando expirado: ${store}/${record.key}`);
                        }
                        cursor.continue();
                    }
                };
            } catch (e) {
                // Ignorar erros de limpeza
            }
        }
    },

    // =========================================================================
    // HELPERS ESPECÍFICOS DO SUPER CARTOLA
    // =========================================================================

    /**
     * Salvar dados do participante logado
     */
    async saveParticipante(ligaId, timeId, data) {
        const key = `${ligaId}_${timeId}`;
        return this.set('participante', key, data);
    },

    /**
     * Buscar dados do participante
     */
    async getParticipante(ligaId, timeId) {
        const key = `${ligaId}_${timeId}`;
        return this.get('participante', key, true); // Sempre retorna, mesmo expirado
    },

    /**
     * Salvar ranking da liga
     * ✅ v2.3: Incluir temporada na chave para segregação correta
     */
    async saveRanking(ligaId, data, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        return this.set('ranking', key, data);
    },

    /**
     * Buscar ranking com fallback
     * ✅ v2.3: Incluir temporada na chave
     */
    async getRankingWithFallback(ligaId, fetchFn, onUpdate, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${temp}`;
        return this.getWithFallback('ranking', key, fetchFn, onUpdate);
    },

    /**
     * Salvar rodadas do time
     */
    async saveRodadas(ligaId, timeId, data) {
        const key = `${ligaId}_${timeId}`;
        return this.set('rodadas', key, data);
    },

    /**
     * Buscar rodadas com fallback
     */
    async getRodadasWithFallback(ligaId, timeId, fetchFn, onUpdate) {
        const key = `${ligaId}_${timeId}`;
        return this.getWithFallback('rodadas', key, fetchFn, onUpdate);
    },

    /**
     * Salvar extrato financeiro
     */
    async saveExtrato(ligaId, timeId, data, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${timeId}_${temp}`;
        return this.set('extrato', key, data);
    },

    /**
     * Buscar extrato com fallback
     */
    async getExtratoWithFallback(ligaId, timeId, fetchFn, onUpdate, temporada = null) {
        const temp = temporada || window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const key = `${ligaId}_${timeId}_${temp}`;
        return this.getWithFallback('extrato', key, fetchFn, onUpdate);
    },

    /**
     * Salvar dados da liga
     */
    async saveLiga(ligaId, data) {
        return this.set('liga', ligaId, data);
    },

    /**
     * Buscar liga com fallback
     */
    async getLigaWithFallback(ligaId, fetchFn, onUpdate) {
        return this.getWithFallback('liga', ligaId, fetchFn, onUpdate);
    },

    /**
     * Verificar se tem cache para carregamento instantâneo
     */
    async hasInstantData(ligaId, timeId) {
        const key = `${ligaId}_${timeId}`;
        const participante = await this.get('participante', key, true);
        return !!participante;
    }
};

// Inicializar automaticamente
OfflineCache.init().then(() => {
    // Temporada encerrada: NÃO limpar cache (dados são imutáveis)
    if (!OfflineCache.TEMPORADA_ENCERRADA) {
        setTimeout(() => OfflineCache.cleanExpired(), 5000);
    }
});

// Expor globalmente
window.OfflineCache = OfflineCache;

// ✅ Super Cache v2 shim: clearAll também limpa Cache v2
const _origClearAll = OfflineCache.clearAll?.bind(OfflineCache);
OfflineCache.clearAll = async function() {
    if (_origClearAll) await _origClearAll();
    if (window.Cache) await window.Cache.invalidatePrefix('*');
};

if (window.Log) {
    if (OfflineCache.TEMPORADA_ENCERRADA) {
        Log.info('OFFLINE-CACHE', '✅ Sistema pronto (MODO ARQUIVO - Cache permanente)');
    } else {
        Log.info('OFFLINE-CACHE', '✅ Sistema pronto');
    }
}
