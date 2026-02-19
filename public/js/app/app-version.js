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

    // ✅ FIX MOBILE: Limpeza seletiva - remove apenas caches obsoletos, preserva SW ativo
    async limparCachesAntigos() {
        const FLAG_KEY = 'sw_emergency_clean_v11';
        if (localStorage.getItem(FLAG_KEY)) {
            return; // Já foi feito
        }

        try {
            // Limpar apenas caches com nomes antigos (não o atual do SW)
            const CURRENT_SW_CACHE = 'super-cartola-v22-logo-ano12';
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

        // ✅ EMERGENCY: Limpar caches antigos UMA VEZ
        await this.limparCachesAntigos();

        // Registrar Service Worker do PWA
        this.registrarServiceWorker();

        // Buscar versão e verificar atualização
        await this.verificarVersao();

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
        // Bypass TTL se manutenção pendente de avaliação (aguardando auth)
        if (!this._manutencaoPendente && agora - this.lastCheck < this.CACHE_TTL) {
            if (window.Log) Log.debug('APP-VERSION', 'Verificação em cache, aguardando TTL');
            return;
        }
        this.lastCheck = agora;

        try {
            // Usar novo endpoint com identificação de cliente
            const response = await fetch("/api/app/check-version", {
                headers: {
                    "x-client-type": this.CLIENT_TYPE
                }
            });
            if (!response.ok) return;

            const servidor = await response.json();

            // Verificar modo manutenção (whitelist/blacklist por timeId)
            if (servidor.manutencao?.ativo && window.ManutencaoScreen) {
                const controleAcesso = servidor.manutencao.controle_acesso || {};
                const modoLista = controleAcesso.modo_lista || 'whitelist';
                const timeId = String(window.participanteAuth?.timeId || '');

                // HARDCODE: Owner/Dev (Paulinett) NUNCA vê tela de manutenção
                const OWNER_TIME_ID = '13935277';
                if (timeId === OWNER_TIME_ID) {
                    this._manutencaoPendente = false;
                    if (window.Log) Log.info('APP-VERSION', `Owner bypass: timeId ${timeId} sempre liberado`);
                    // Desativar manutenção se já foi ativada por race condition
                    if (window.ManutencaoScreen.estaAtivo()) {
                        window.ManutencaoScreen.desativar();
                    }
                } else if (!timeId) {
                    // Auth ainda não completou - marcar pendente para bypass TTL na próxima chamada
                    this._manutencaoPendente = true;
                    if (window.Log) Log.debug('APP-VERSION', 'Aguardando auth para verificar manutenção (pendente)');
                } else {
                    // timeId disponível - avaliar manutenção de verdade
                    this._manutencaoPendente = false;
                    let deveMostrarManutencao = false;

                    if (modoLista === 'blacklist') {
                        // Modo blacklist: bloquear apenas IDs na lista
                        const blacklistIds = controleAcesso.blacklist_timeIds || [];
                        deveMostrarManutencao = timeId && blacklistIds.includes(timeId);
                        if (deveMostrarManutencao && window.Log) {
                            Log.info('APP-VERSION', `Blacklist: timeId ${timeId} bloqueado`);
                        }
                    } else {
                        // Modo whitelist: bloquear todos exceto IDs na lista
                        const whitelistIds = controleAcesso.whitelist_timeIds || [];
                        const isWhitelisted = timeId && whitelistIds.includes(timeId);
                        deveMostrarManutencao = !isWhitelisted;
                        if (isWhitelisted && window.Log) {
                            Log.info('APP-VERSION', `Whitelist: timeId ${timeId} liberado durante manutencao`);
                        }
                    }

                    // Verificar modo de bloqueio
                    const modo = servidor.manutencao.modo || 'global';

                    // Modo global: bloqueia tudo
                    if (modo === 'global' && deveMostrarManutencao) {
                        if (window.Log) Log.warn('APP-VERSION', `Manutenção ativada para timeId ${timeId} (modo: ${modo})`);
                        window.ManutencaoScreen.ativar(servidor.manutencao);
                        return;
                    }

                    // Modo usuarios: bloqueia apenas por controle de acesso
                    if (modo === 'usuarios' && deveMostrarManutencao) {
                        if (window.Log) Log.warn('APP-VERSION', `Manutenção ativada para timeId ${timeId} (modo: ${modo})`);
                        window.ManutencaoScreen.ativar(servidor.manutencao);
                        return;
                    }

                    // Whitelisted/não bloqueado: desativar se estava ativo por race condition
                    if (!deveMostrarManutencao && window.ManutencaoScreen.estaAtivo()) {
                        if (window.Log) Log.info('APP-VERSION', `Whitelisted: desativando tela manutenção para timeId ${timeId}`);
                        window.ManutencaoScreen.desativar();
                    }

                    // Modo modulos: setar lista e desativar splash global se ativa por race condition
                    if (modo === 'modulos') {
                        window.participanteModulosBloqueados = servidor.manutencao.modulos_bloqueados || [];
                        if (window.ManutencaoScreen && window.ManutencaoScreen.estaAtivo()) {
                            if (window.Log) Log.info('APP-VERSION', `Modo modulos: desativando splash global (race condition fix)`);
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

        const overlay = document.createElement('div');
        overlay.id = 'update-modal-overlay';
        overlay.innerHTML = `
            <div class="update-modal">
                <div class="update-modal-icon">
                    <span class="material-symbols-outlined">autorenew</span>
                </div>
                <h3>Atualizando agora...</h3>
                <p>Estamos carregando a versão mais recente${novaVersao ? ` (v${novaVersao})` : ''}.</p>
                <p class="update-modal-sub">Aguarde alguns segundos.</p>
            </div>
        `;

        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            backdrop-filter: blur(6px);
        `;

        const modal = overlay.querySelector('.update-modal');
        modal.style.cssText = `
            background: linear-gradient(145deg, #1a1a1a, #2d2d2d);
            border-radius: 16px;
            padding: 24px;
            max-width: 320px;
            width: 90%;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 69, 0, 0.3);
        `;

        const icon = overlay.querySelector('.update-modal-icon');
        icon.style.cssText = `
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #ff4500, #ff6b35);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            animation: spin 1.2s linear infinite;
        `;

        const iconSpan = overlay.querySelector('.update-modal-icon span');
        iconSpan.style.cssText = `
            font-size: 32px;
            color: white;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);

        const h3 = overlay.querySelector('h3');
        h3.style.cssText = `
            color: #fff;
            font-size: 1.1rem;
            margin: 0 0 8px;
        `;

        const p = overlay.querySelector('p');
        p.style.cssText = `
            color: #ccc;
            font-size: 0.95rem;
            margin: 0 0 4px;
        `;

        const subP = overlay.querySelector('.update-modal-sub');
        subP.style.cssText = `
            color: #888;
            font-size: 0.85rem;
            margin: 0;
        `;

        document.body.appendChild(overlay);
    },

    // ✅ Atualizar agora
    async atualizarAgora() {
        // Limpar versão local para forçar recarga limpa
        localStorage.removeItem(this.LOCAL_KEY);
        localStorage.removeItem(this.LOCAL_BOOT_KEY);

        // Forçar atualização do Service Worker
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }

        // Limpar cache do SW (aguardar conclusão antes de recarregar)
        if ('caches' in window) {
            try {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
            } catch (e) {
                // Ignorar erros de cache — prosseguir com reload de qualquer forma
            }
        }

        // Recarregar página (sem race condition com deleção de caches)
        window.location.reload(true);
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
