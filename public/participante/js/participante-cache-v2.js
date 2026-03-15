// =============================================================================
// PARTICIPANTE-CACHE-V2.JS — Super Cache Inteligente (L1 Memória + L2 IndexedDB)
// =============================================================================
// Substitui 3 sistemas sobrepostos (ParticipanteCacheDB, SuperCartolaOffline,
// ParticipanteCacheManager) por um cache unificado com SWR inteligente.
//
// Estratégia:
//   L1 (memória JS) → instantâneo, TTL 5min
//   L2 (IndexedDB)  → persistente, TTL do cacheHint do backend
//   Network          → fetch com cacheHint no response
//
// Regra crítica: dados com imutavel:true NUNCA disparam fetch de background.
//
// API pública (window.Cache):
//   .get(key, fetchFn, opts)       → SWR inteligente
//   .getSync(key)                  → leitura síncrona (L1 only)
//   .set(key, data, opts)          → escrita direta
//   .invalidate(key)               → invalida chave
//   .invalidatePrefix(prefix)      → invalida por prefixo
//   .preload(ligaId, timeId, temp) → cold start otimizado
//   .getStats()                    → métricas para debug
// =============================================================================

(function () {
    'use strict';

    const DB_NAME = 'SuperCartolaCacheV2';
    const DB_VERSION = 1;
    const STORE_NAME = 'cache';
    const L1_TTL_MS = 5 * 60 * 1000; // 5min para L1
    const CLEAN_INTERVAL_MS = 10 * 60 * 1000; // 10min

    // ─── L1: Memória ──────────────────────────────────────────────
    const _l1 = {};

    // ─── Métricas ─────────────────────────────────────────────────
    const _metrics = {
        l1Hits: 0,
        l2Hits: 0,
        l2Immutable: 0,
        networkFetches: 0,
        swr: 0,
        misses: 0
    };

    // ─── Deduplicação de fetches em voo ──────────────────────────
    const _pendingFetches = new Map();

    // ─── IndexedDB (L2) ──────────────────────────────────────────
    let _db = null;
    let _dbReady = null;

    function _openDB() {
        if (_dbReady) return _dbReady;

        _dbReady = new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    }
                };

                request.onsuccess = (event) => {
                    _db = event.target.result;
                    resolve(_db);
                };

                request.onerror = () => {
                    console.warn('[CACHE-V2] IndexedDB open failed, L2 disabled');
                    resolve(null);
                };
            } catch (e) {
                console.warn('[CACHE-V2] IndexedDB not available');
                resolve(null);
            }
        });

        return _dbReady;
    }

    async function _getL2(key) {
        const db = await _openDB();
        if (!db) return null;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }

    async function _setL2(key, entry) {
        const db = await _openDB();
        if (!db) return;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put(entry);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    async function _deleteL2(key) {
        const db = await _openDB();
        if (!db) return;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    async function _getAllL2() {
        const db = await _openDB();
        if (!db) return [];

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => resolve([]);
            } catch {
                resolve([]);
            }
        });
    }

    // ─── L1: Memória ──────────────────────────────────────────────
    function _getL1(key) {
        const entry = _l1[key];
        if (!entry) return null;
        // L1 tem TTL fixo de 5min
        if (Date.now() - entry.timestamp > L1_TTL_MS) {
            delete _l1[key];
            return null;
        }
        return entry;
    }

    function _setL1(key, entry) {
        _l1[key] = { ...entry, timestamp: Date.now() };
    }

    function _deleteL1(key) {
        delete _l1[key];
    }

    // ─── Helpers ──────────────────────────────────────────────────
    function _isExpired(entry) {
        if (!entry) return true;
        if (entry.imutavel) return false; // Imutáveis nunca expiram
        if (!entry.ttl || entry.ttl <= 0) return true; // ttl=0 → sempre expirado
        return Date.now() > entry.timestamp + (entry.ttl * 1000);
    }

    function _extractCacheHint(responseData) {
        if (!responseData) return null;
        const hint = responseData.cacheHint;
        if (!hint) return null;
        return {
            ttl: hint.ttl || 0,
            imutavel: hint.imutavel || false,
            versao: hint.versao || '',
            motivo: hint.motivo || ''
        };
    }

    // ─── API: get (SWR inteligente) ──────────────────────────────
    async function get(key, fetchFn, opts) {
        // 1. L1 hit
        const l1 = _getL1(key);
        if (l1) {
            _metrics.l1Hits++;
            return l1.data;
        }

        // 2. L2 hit
        const l2 = await _getL2(key);
        if (l2) {
            // 2a. Imutável → retorna, NUNCA revalida
            if (l2.imutavel) {
                _metrics.l2Immutable++;
                _setL1(key, l2);
                return l2.data;
            }

            // 2b. Expirado → retorna stale + revalida em background
            if (_isExpired(l2)) {
                _metrics.swr++;
                _setL1(key, l2); // Serve stale imediato
                if (fetchFn) {
                    _refreshInBackground(key, fetchFn, opts);
                }
                return l2.data;
            }

            // 2c. Válido → retorna e promove para L1
            _metrics.l2Hits++;
            _setL1(key, l2);
            return l2.data;
        }

        // 3. Miss total → fetch network
        if (!fetchFn) {
            _metrics.misses++;
            return null;
        }

        return _fetchAndStore(key, fetchFn, opts);
    }

    async function _fetchAndStore(key, fetchFn, opts) {
        // Deduplicar fetches em voo para a mesma chave
        if (_pendingFetches.has(key)) {
            return _pendingFetches.get(key);
        }

        const promise = (async () => {
            try {
                _metrics.networkFetches++;
                const data = await fetchFn();
                if (data == null) return null;

                // Extrair cacheHint do response
                const hint = _extractCacheHint(data) || opts || {};

                const entry = {
                    key,
                    data,
                    timestamp: Date.now(),
                    ttl: hint.ttl || opts?.ttl || 300,
                    imutavel: hint.imutavel || opts?.imutavel || false,
                    versao: hint.versao || opts?.versao || '',
                    motivo: hint.motivo || opts?.motivo || ''
                };

                _setL1(key, entry);
                await _setL2(key, entry);

                return data;
            } catch (e) {
                if (window.Log) Log.warn('[CACHE-V2] Fetch failed for', key, e.message);
                return null;
            } finally {
                _pendingFetches.delete(key);
            }
        })();

        _pendingFetches.set(key, promise);
        return promise;
    }

    function _refreshInBackground(key, fetchFn, opts) {
        // Fire-and-forget: não bloqueia o retorno do stale data
        _fetchAndStore(key, fetchFn, opts).catch(() => {});
    }

    // ─── API: getSync (L1 only) ──────────────────────────────────
    function getSync(key) {
        const l1 = _getL1(key);
        return l1 ? l1.data : null;
    }

    // ─── API: set (escrita direta) ───────────────────────────────
    async function set(key, data, opts) {
        const entry = {
            key,
            data,
            timestamp: Date.now(),
            ttl: opts?.ttl || 300,
            imutavel: opts?.imutavel || false,
            versao: opts?.versao || '',
            motivo: opts?.motivo || ''
        };
        _setL1(key, entry);
        await _setL2(key, entry);
    }

    // ─── API: invalidate ─────────────────────────────────────────
    async function invalidate(key) {
        _deleteL1(key);
        await _deleteL2(key);
    }

    // ─── API: invalidatePrefix ───────────────────────────────────
    async function invalidatePrefix(prefix) {
        // L1: limpar chaves com prefixo
        for (const key of Object.keys(_l1)) {
            if (prefix === '*' || key.startsWith(prefix)) {
                delete _l1[key];
            }
        }

        // L2: buscar todas e deletar matching
        const all = await _getAllL2();
        const db = await _openDB();
        if (!db) return;

        try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (const entry of all) {
                if (prefix === '*' || entry.key.startsWith(prefix)) {
                    store.delete(entry.key);
                }
            }
        } catch {
            // Silencioso
        }
    }

    // ─── API: preload (cold start) ───────────────────────────────
    async function preload(ligaId, timeId, temporada) {
        // 1. Ler TUDO do IndexedDB para L1
        const all = await _getAllL2();
        let loaded = 0;
        let expired = 0;

        for (const entry of all) {
            // Popular L1 com tudo que não expirou ou é imutável
            if (entry.imutavel || !_isExpired(entry)) {
                _setL1(entry.key, entry);
                loaded++;
            } else {
                expired++;
            }
        }

        if (window.Log) {
            Log.info('[CACHE-V2] Preload:', `${loaded} entries loaded, ${expired} expired, ${all.length} total`);
        }

        return { loaded, expired, total: all.length };
    }

    // ─── Limpeza periódica ───────────────────────────────────────
    async function cleanExpired() {
        const all = await _getAllL2();
        const db = await _openDB();
        if (!db || !all.length) return;

        const now = Date.now();
        let cleaned = 0;

        try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (const entry of all) {
                // Não limpar imutáveis
                if (entry.imutavel) continue;
                // Limpar se expirou há mais de 2x o TTL
                const maxAge = (entry.ttl || 300) * 1000 * 2;
                if (now > entry.timestamp + maxAge) {
                    store.delete(entry.key);
                    delete _l1[entry.key];
                    cleaned++;
                }
            }
        } catch {
            // Silencioso
        }

        if (cleaned > 0 && window.Log) {
            Log.info('[CACHE-V2] Cleaned', cleaned, 'expired entries');
        }
    }

    // ─── API: getStats ───────────────────────────────────────────
    function getStats() {
        const l1Size = Object.keys(_l1).length;
        const immutableCount = Object.values(_l1).filter(e => e.imutavel).length;
        return {
            l1Size,
            immutableInL1: immutableCount,
            pending: _pendingFetches.size,
            metrics: { ..._metrics }
        };
    }

    // ─── Migração do legado ──────────────────────────────────────
    async function _migrateLegacy() {
        if (localStorage.getItem('scm_cache_v2_migrated')) return;

        try {
            // Tentar migrar dados do SuperCartolaOffline
            const dbs = await indexedDB.databases?.() || [];
            const hasLegacy = dbs.some(d =>
                d.name === 'SuperCartolaOffline' || d.name === 'ParticipanteCacheDB'
            );

            if (hasLegacy) {
                if (window.Log) Log.info('[CACHE-V2] Migrando caches legados...');
                // Deletar DBs antigos — dados serão re-buscados com cacheHint
                indexedDB.deleteDatabase('SuperCartolaOffline');
                indexedDB.deleteDatabase('ParticipanteCacheDB');
                if (window.Log) Log.info('[CACHE-V2] DBs legados deletados');
            }
        } catch (e) {
            // Falha silenciosa
        }

        localStorage.setItem('scm_cache_v2_migrated', 'true');
    }

    // ─── Logging periódico de métricas ─────────────────────────
    function _logMetrics() {
        if (!window.Log) return;
        const s = getStats();
        const m = s.metrics;
        const total = m.l1Hits + m.l2Hits + m.l2Immutable + m.swr + m.networkFetches + m.misses;
        if (total === 0) return;
        const hitRate = total > 0 ? Math.round(((m.l1Hits + m.l2Hits + m.l2Immutable + m.swr) / total) * 100) : 0;
        Log.info('[CACHE-V2]',
            `L1:${m.l1Hits} L2:${m.l2Hits} Immutable:${m.l2Immutable} SWR:${m.swr} Net:${m.networkFetches} Miss:${m.misses} | HitRate:${hitRate}% | L1Size:${s.l1Size} Pending:${s.pending}`
        );
    }

    // ─── Bootstrap ───────────────────────────────────────────────
    async function _init() {
        await _openDB();
        await _migrateLegacy();

        // Limpeza periódica
        setInterval(cleanExpired, CLEAN_INTERVAL_MS);

        // Log de métricas a cada 60s
        setInterval(_logMetrics, 60000);

        if (window.Log) Log.info('[CACHE-V2] Super Cache Inteligente v2 inicializado');
    }

    // ─── API pública ─────────────────────────────────────────────
    window.Cache = {
        get,
        getSync,
        set,
        invalidate,
        invalidatePrefix,
        preload,
        getStats,
        cleanExpired
    };

    // Inicializar
    _init();

})();
