
// SISTEMA DE CACHE SUPER INTELIGENTE PARA PARTICIPANTE v3.1
// ✅ v3.1: Adiciona utilitário global aguardarContainerDOM
console.log('[PARTICIPANTE-CACHE] 🚀 Carregando sistema de cache inteligente v3.1...');

const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

class ParticipanteCache {
    constructor() {
        this.db = null;
        this.dbName = 'ParticipanteCacheDB';
        this.version = 3; // v3: Força limpeza de cache 2025 para nova temporada 2026
        this.RODADA_MAXIMA = RODADA_FINAL_CAMPEONATO;
        this.RODADA_FECHADA_LIMITE = 35; // Rodadas até 35 são permanentes
        this.rodadaAtual = null;
        this.inicializar();
    }

    async inicializar() {
        try {
            this.db = await this.abrirIndexedDB();
            await this.detectarRodadaAtual();
            console.log('[PARTICIPANTE-CACHE] ✅ IndexedDB inicializado');
            console.log(`[PARTICIPANTE-CACHE] 📊 Rodada atual: ${this.rodadaAtual || 'detectando...'}`);
        } catch (error) {
            console.error('[PARTICIPANTE-CACHE] ❌ Erro ao inicializar:', error);
        }
    }

    async detectarRodadaAtual() {
        try {
            const response = await fetch('/api/cartola/mercado/status');
            if (response.ok) {
                const data = await response.json();
                this.rodadaAtual = data.rodada_atual || 36;
            } else {
                this.rodadaAtual = 36; // Fallback
            }
        } catch (error) {
            console.warn('[PARTICIPANTE-CACHE] Erro ao detectar rodada, usando fallback:', error);
            this.rodadaAtual = 36;
        }
    }

    abrirIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store para dados dos módulos
                if (!db.objectStoreNames.contains('modulos')) {
                    db.createObjectStore('modulos', { keyPath: 'id' });
                }

                // Store para ranking
                if (!db.objectStoreNames.contains('ranking')) {
                    db.createObjectStore('ranking', { keyPath: 'id' });
                }

                // Store para rodadas (PERMANENTE para rodadas fechadas)
                if (!db.objectStoreNames.contains('rodadas')) {
                    db.createObjectStore('rodadas', { keyPath: 'id' });
                }

                // Store para extrato
                if (!db.objectStoreNames.contains('extrato')) {
                    db.createObjectStore('extrato', { keyPath: 'id' });
                }

                console.log('[PARTICIPANTE-CACHE] 🔧 Database upgraded para v' + this.version);
            };
        });
    }

    /**
     * Calcula TTL inteligente baseado na rodada
     * Rodadas fechadas (1-35): NUNCA EXPIRA (100 anos)
     * Rodadas abertas (36+): 5 minutos
     */
    calcularTTL(chave) {
        // Extrair número da rodada da chave (formato: "ranking_ligaId_rodadaNum")
        const match = chave.match(/_rodada_?(\d+)/i) || chave.match(/_(\d+)$/);
        
        if (match) {
            const rodadaNum = parseInt(match[1]);
            
            if (rodadaNum <= this.RODADA_FECHADA_LIMITE) {
                // ✅ Rodada fechada = cache de 30 DIAS (não 100 anos!)
                const TTL_RODADA_FECHADA = 30 * 24 * 60 * 60 * 1000; // 30 dias
                console.log(`[PARTICIPANTE-CACHE] 🔒 Rodada ${rodadaNum} FECHADA - Cache 30 dias`);
                return TTL_RODADA_FECHADA;
            }
        }

        // Rodada aberta ou dado não relacionado a rodada = 5 minutos
        console.log(`[PARTICIPANTE-CACHE] ⏱️ Cache temporário (5 min)`);
        return 5 * 60 * 1000;
    }

    async salvar(store, chave, dados, ttl = null) {
        try {
            // Se TTL não fornecido, calcular automaticamente
            if (ttl === null) {
                ttl = this.calcularTTL(chave);
            }

            const transaction = this.db.transaction([store], 'readwrite');
            const objectStore = transaction.objectStore(store);

            const ehPermanente = ttl > (50 * 365 * 24 * 60 * 60 * 1000); // > 50 anos = permanente

            const registro = {
                id: chave,
                dados: dados,
                timestamp: Date.now(),
                expira: ehPermanente ? null : Date.now() + ttl, // null = nunca expira
                permanente: ehPermanente
            };

            await objectStore.put(registro);
            
            const tipo = ehPermanente ? '🔒 PERMANENTE' : `⏱️ ${Math.floor(ttl / 60000)}min`;
            console.log(`[PARTICIPANTE-CACHE] 💾 ${tipo} - ${store}/${chave}`);
            
            return true;
        } catch (error) {
            console.error('[PARTICIPANTE-CACHE] Erro ao salvar:', error);
            return false;
        }
    }

    async buscar(store, chave) {
        try {
            const transaction = this.db.transaction([store], 'readonly');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.get(chave);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const resultado = request.result;

                    if (!resultado) {
                        console.log(`[PARTICIPANTE-CACHE] ❌ Miss: ${store}/${chave}`);
                        resolve(null);
                        return;
                    }

                    // Se é permanente, nunca expira
                    if (resultado.permanente || resultado.expira === null) {
                        console.log(`[PARTICIPANTE-CACHE] ✅ Hit PERMANENTE: ${store}/${chave}`);
                        resolve(resultado.dados);
                        return;
                    }

                    // Verificar expiração para cache temporário
                    if (Date.now() > resultado.expira) {
                        console.log(`[PARTICIPANTE-CACHE] ⏰ Expirado: ${store}/${chave}`);
                        this.remover(store, chave);
                        resolve(null);
                        return;
                    }

                    const tempoRestante = Math.floor((resultado.expira - Date.now()) / 60000);
                    console.log(`[PARTICIPANTE-CACHE] ✅ Hit (${tempoRestante}min): ${store}/${chave}`);
                    resolve(resultado.dados);
                };

                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[PARTICIPANTE-CACHE] Erro ao buscar:', error);
            return null;
        }
    }

    async remover(store, chave) {
        try {
            const transaction = this.db.transaction([store], 'readwrite');
            const objectStore = transaction.objectStore(store);
            await objectStore.delete(chave);
            console.log(`[PARTICIPANTE-CACHE] 🗑️ Removido: ${store}/${chave}`);
        } catch (error) {
            console.error('[PARTICIPANTE-CACHE] Erro ao remover:', error);
        }
    }

    async limpar(store) {
        try {
            const transaction = this.db.transaction([store], 'readwrite');
            const objectStore = transaction.objectStore(store);
            await objectStore.clear();
            console.log(`[PARTICIPANTE-CACHE] 🧹 Store limpo: ${store}`);
        } catch (error) {
            console.error('[PARTICIPANTE-CACHE] Erro ao limpar:', error);
        }
    }

    async limparExpirados() {
        const stores = ['modulos', 'ranking', 'rodadas', 'extrato'];
        
        for (const store of stores) {
            try {
                const transaction = this.db.transaction([store], 'readwrite');
                const objectStore = transaction.objectStore(store);
                const request = objectStore.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (Date.now() > cursor.value.expira) {
                            cursor.delete();
                        }
                        cursor.continue();
                    }
                };
            } catch (error) {
                console.error(`[PARTICIPANTE-CACHE] Erro ao limpar ${store}:`, error);
            }
        }
    }
}

// Instância global
const participanteCache = new ParticipanteCache();

// Limpar expirados a cada 5 minutos
setInterval(() => participanteCache.limparExpirados(), 300000);

// =====================================================================
// ✅ v3.1: UTILITÁRIO GLOBAL - Aguardar Container no DOM
// Usado por módulos para garantir que container existe após refresh
// =====================================================================
window.aguardarContainerDOM = async function(containerId, maxTentativas = 10, intervalo = 100) {
    // Double RAF primeiro
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    let container = document.getElementById(containerId);
    if (container) return container;

    // Polling com retry
    return new Promise((resolve) => {
        let tentativas = 0;
        const poll = setInterval(() => {
            tentativas++;
            const el = document.getElementById(containerId);
            if (el) {
                clearInterval(poll);
                resolve(el);
            } else if (tentativas >= maxTentativas) {
                clearInterval(poll);
                console.warn(`[PARTICIPANTE-CACHE] Container #${containerId} não encontrado após ${maxTentativas} tentativas`);
                resolve(null);
            }
        }, intervalo);
    });
};

console.log('[PARTICIPANTE-CACHE] ✅ Sistema v3.1 carregado (+ aguardarContainerDOM)');
