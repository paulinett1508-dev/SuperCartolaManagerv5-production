// =====================================================================
// app-version.js - Sistema de Versionamento v5.2
// =====================================================================
// v5.2: Fix race condition manutenção vs auth
//       - _manutencaoPendente flag bypassa TTL quando auth incompleto
//       - init() guarda contra re-inicialização completa
// v5.1: Modal obrigatório - Removido botão "Depois"
// v5.0: Suporte a versionamento separado Admin/App
// v4.1: Otimização - Remove polling de 5min, usa visibilitychange
// v4.0: Modal de atualização RESTAURADO
// =====================================================================

const AppVersion = {
    LOCAL_KEY: "app_version",
    LOCAL_BOOT_KEY: "app_server_boot",
    CLIENT_TYPE: "app", // Identificador do cliente (app = participante)
    CACHE_TTL: 60000, // ✅ FIX MOBILE: 60s entre checks (era 5s - bombardeava rede mobile)
    CHECK_INTERVAL_MS: 300000, // ✅ FIX MOBILE: 5min entre polls (era 5s - saturava conexões)
    lastCheck: 0, // Timestamp da última verificação
    isUpdating: false,
    _initDone: false, // Guarda contra init() duplicado
    _manutencaoPendente: false, // true = manutenção precisa ser reavaliada com timeId
    _manutencaoPendenteAt: 0, // Timestamp de quando _manutencaoPendente foi ativado
    MANUTENCAO_PENDING_TIMEOUT: 30000, // 30s: máximo de espera pelo timeId de auth
    _swCacheName: null, // Carregado do servidor via check-version (evita hardcode)

    // ✅ FIX MOBILE: Limpeza seletiva - remove apenas caches obsoletos, preserva SW ativo
    async limparCachesAntigos() {
        const FLAG_KEY = 'sw_emergency_clean_v12';
        if (localStorage.getItem(FLAG_KEY)) {
            return; // Já foi feito
        }

        try {
            // Usar nome do cache carregado do servidor (evita hardcode manual)
            // Fonte canônica: config/sw-cache-name.js → exposto via /api/app/check-version
            const CURRENT_SW_CACHE = this._swCacheName;
            if (!CURRENT_SW_CACHE) return; // Aguardar check-version carregar o nome

            const cacheNames = await caches.keys();
            const obsoletos = cacheNames.filter(name => name !== CURRENT_SW_CACHE);

            if (obsoletos.length > 0) {
                await Promise.all(obsoletos.map(name => caches.delete(name)));
                if (window.Log) Log.info('APP-VERSION', `🧹 ${obsoletos.length} caches antigos removidos`);
            }

            // NÃO unregister o SW - ele cuida do próprio versionamento via activate event

            // Marcar como feito
            localStorage.setItem(FLAG_KEY, 'done');

            if (window.Log) Log.info('APP-VERSION', '🧹 Limpeza seletiva concluída');
        } catch (error) {
            if (window.Log) Log.warn('APP-VERSION', 'Erro na limpeza:', error);
        }
    },

    // ✅ Inicializar
    async init() {
        if (this._initDone) {
            // Chamada duplicada (ex: participante-auth após login)
            // Apenas re-executar verificação de versão/manutenção
            return this.verificarVersao();
        }
        this._initDone = true;

        // Registrar Service Worker do PWA
        this.registrarServiceWorker();

        // Buscar versão (seta _swCacheName via resposta do servidor)
        await this.verificarVersao();

        // ✅ EMERGENCY: Limpar caches antigos UMA VEZ (após ter _swCacheName)
        await this.limparCachesAntigos();

        // Forçar checagem periódica (foreground)
        this.iniciarAutoCheck();

        // Verificar quando app volta do background
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.verificarVersao();
            }
        });
    },

    // ✅ Registrar Service Worker
    async registrarServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/participante/service-worker.js', {
                    updateViaCache: 'none' // Força buscar SW sempre do servidor
                });

                // Forçar verificação de atualização
                registration.update();

                // Detectar quando SW é atualizado
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Nova versão do SW disponível - força atualização imediata
                            if (registration.waiting) {
                                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                            }
                            this.forcarAtualizacao('sw-update');
                        }
                    });
                });

                // Quando o SW assume controle, recarregar
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (this.isUpdating) {
                        window.location.reload(true);
                    }
                });

                // Mensagens do SW (ex: push force update)
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event?.data?.type === 'FORCE_UPDATE') {
                        this.forcarAtualizacao('sw-message');
                    }
                });

                if (window.Log) Log.info('APP-VERSION', 'Service Worker registrado');
            } catch (error) {
                if (window.Log) Log.warn('APP-VERSION', 'Erro ao registrar SW:', error);
            }
        }
    },

    // ✅ Verificar versão no servidor
    async verificarVersao() {
        const agora = Date.now();

        // Reset de _manutencaoPendente se auth demorou mais que o timeout
        if (this._manutencaoPendente &&
            (agora - this._manutencaoPendenteAt) > this.MANUTENCAO_PENDING_TIMEOUT) {
            if (window.Log) Log.warn('APP-VERSION', 'Timeout de manutenção pendente — resetando');
            this._manutencaoPendente = false;
        }

        // Bypass TTL se manutenção pendente de avaliação (aguardando auth)
        if (!this._manutencaoPendente && agora - this.lastCheck < this.CACHE_TTL) {
            if (window.Log) Log.debug('APP-VERSION', 'Verificação em cache, aguardando TTL');
            return;
        }
        this.lastCheck = agora;

        try {
            // Enviar timeId para backend avaliar whitelist/blacklist server-side
            const timeId = String(window.participanteAuth?.timeId || '');
            const response = await fetch("/api/app/check-version", {
                headers: {
                    "x-client-type": this.CLIENT_TYPE,
                    ...(timeId && { "x-time-id": timeId })
                }
            });
            if (!response.ok) return;

            const servidor = await response.json();

            // Verificar modo manutenção — backend já filtrou whitelist/blacklist
            if (servidor.manutencao?.ativo && window.ManutencaoScreen) {
                if (!timeId) {
                    // Auth ainda não completou — re-verificar quando timeId disponível
                    if (!this._manutencaoPendente) {
                        this._manutencaoPendenteAt = Date.now(); // Iniciar timeout
                    }
                    this._manutencaoPendente = true;
                    if (window.Log) Log.debug('APP-VERSION', 'Aguardando auth para verificar manutenção (pendente)');
                } else {
                    this._manutencaoPendente = false;
                    const modo = servidor.manutencao.modo || 'global';

                    if (modo === 'global' || modo === 'usuarios') {
                        if (window.Log) Log.warn('APP-VERSION', `Manutenção ativa (modo: ${modo})`);
                        window.ManutencaoScreen.ativar(servidor.manutencao);
                        return;
                    }

                    if (modo === 'modulos') {
                        window.participanteModulosBloqueados = servidor.manutencao.modulos_bloqueados || [];
                        if (window.ManutencaoScreen.estaAtivo()) {
                            if (window.Log) Log.info('APP-VERSION', 'Modo modulos: desativando splash global');
                            window.ManutencaoScreen.desativar();
                        }
                    }
                }
            } else {
                // Manutenção não ativa - limpar pendência e desativar se necessário
                this._manutencaoPendente = false;
                if (window.ManutencaoScreen?.estaAtivo()) {
                    window.ManutencaoScreen.desativar();
                    window.participanteModulosBloqueados = [];
                }
            }

            const versaoServidor = servidor.version;
            const bootServidor = servidor.serverBoot;
            const versaoLocal = localStorage.getItem(this.LOCAL_KEY);
            const bootLocal = localStorage.getItem(this.LOCAL_BOOT_KEY);

            // Armazenar nome do cache SW (fonte: config/sw-cache-name.js via servidor)
            if (servidor.swCacheName) {
                this._swCacheName = servidor.swCacheName;
            }

            // Log de debug (só em dev)
            if (window.Log && servidor.clientDetected) {
                Log.debug('APP-VERSION', `Cliente detectado: ${servidor.clientDetected}`);
            }

            // Atualizar badge
            this.atualizarBadgeHeader(versaoServidor);

            // Se é primeira vez, apenas salvar
            if (!versaoLocal) {
                localStorage.setItem(this.LOCAL_KEY, versaoServidor);
                if (bootServidor) localStorage.setItem(this.LOCAL_BOOT_KEY, bootServidor);
                return;
            }

            if (bootServidor && !bootLocal) {
                localStorage.setItem(this.LOCAL_BOOT_KEY, bootServidor);
            }

            // Se versão ou boot mudou, forçar atualização
            if (versaoLocal !== versaoServidor || (bootServidor && bootLocal && bootLocal !== bootServidor)) {
                this.forcarAtualizacao('version-check', versaoServidor);
            }
        } catch (error) {
            // Usar versão do cache se falhar
            const cached = localStorage.getItem(this.LOCAL_KEY);
            if (cached) this.atualizarBadgeHeader(cached);
        }
    },

    // ✅ Atualizar badge no header
    atualizarBadgeHeader(version) {
        const badge = document.getElementById("app-version-badge");
        if (badge) {
            badge.textContent = `v${version}`;
        }
    },

    iniciarAutoCheck() {
        if (this._autoCheckId) return;
        this._autoCheckId = setInterval(() => {
            this.verificarVersao();
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration('/participante/').then((reg) => {
                    if (reg) reg.update();
                });
            }
        }, this.CHECK_INTERVAL_MS);
    },

    forcarAtualizacao(reason, novaVersao) {
        if (this.isUpdating) return;
        this.isUpdating = true;

        if (window.Log) Log.warn('APP-VERSION', `⚡ Forçando atualização (${reason})`);

        this.mostrarOverlayAtualizacao(novaVersao);
        this.atualizarAgora();
    },

    mostrarOverlayAtualizacao(novaVersao) {
        if (document.getElementById('update-modal-overlay')) return;

        // Usa classes de /css/app/app-version.css (sem inline styles nem cores hardcoded)
        // Construção via DOM segura (sem innerHTML com dados dinâmicos)
        const overlay = document.createElement('div');
        overlay.id = 'update-modal-overlay';
        overlay.className = 'app-update-overlay';

        const modal = document.createElement('div');
        modal.className = 'app-update-modal';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'app-update-icon';
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined';
        iconSpan.textContent = 'autorenew';
        iconDiv.appendChild(iconSpan);

        const title = document.createElement('h3');
        title.textContent = 'Atualizando agora...';

        modal.appendChild(iconDiv);
        modal.appendChild(title);

        if (novaVersao) {
            const versionEl = document.createElement('p');
            versionEl.className = 'app-update-version';
            versionEl.textContent = `v${novaVersao}`;
            modal.appendChild(versionEl);
        }

        const notes = document.createElement('p');
        notes.className = 'app-update-notes';
        notes.textContent = 'Estamos carregando a versão mais recente. Aguarde alguns segundos.';
        modal.appendChild(notes);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Forçar reflow para a animação de opacity funcionar
        requestAnimationFrame(() => overlay.classList.add('visible'));
    },

    // ✅ Atualizar agora
    async atualizarAgora() {
        // Limpar versão local para forçar recarga limpa
        localStorage.removeItem(this.LOCAL_KEY);
        localStorage.removeItem(this.LOCAL_BOOT_KEY);

        // Forçar atualização do Service Worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }

        // ✅ FIX MOBILE: Limpar apenas caches OBSOLETOS (preservar SW cache ativo)
        // Antes deletava TODOS os caches, causando tela branca no mobile pós-Republish
        // porque o SW perdia seus assets e tudo precisava ser re-baixado do zero.
        if ('caches' in window) {
            try {
                // Nome do cache carregado do servidor (config/sw-cache-name.js)
                const CURRENT_SW_CACHE = this._swCacheName;
                if (CURRENT_SW_CACHE) {
                    const names = await caches.keys();
                    const obsoletos = names.filter(name => name !== CURRENT_SW_CACHE);
                    if (obsoletos.length > 0) {
                        await Promise.all(obsoletos.map(name => caches.delete(name)));
                    }
                }
            } catch (e) {
                // Ignorar erros de cache — prosseguir com reload de qualquer forma
            }
        }

        // Recarregar página
        window.location.reload();
    }
};

// Expor globalmente
window.AppVersion = AppVersion;

// Auto-inicializar quando DOM estiver pronto
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => AppVersion.init());
} else {
    AppVersion.init();
}

if (window.Log) Log.info('APP-VERSION', '✅ Sistema de versionamento v5.2 carregado (modal obrigatório)');
