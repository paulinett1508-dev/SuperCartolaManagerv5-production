// =====================================================================
// PARTICIPANTE-REFRESH-BUTTON.JS - Botão de Atualização Inteligente v3.0
// =====================================================================
// v3.0: Refresh incremental com comparação de versão servidor vs local
//       - Mesma versão: limpa apenas dados voláteis (status, rankings)
//       - Versão nova: limpeza completa + reload (assets + dados)
//       - Preserva dados históricos imutáveis (rodadas consolidadas)
//       - Botão sempre disponível (não apenas temporada encerrada)
// v2.1: Fix duplicação de botão (verifica existência antes de adicionar)
// =====================================================================

if (window.Log) Log.info('REFRESH-BUTTON', 'Carregando componente v3.0...');

const RefreshButton = {
    // Modal HTML — atualizado em showModal() com info de versão
    _modalHTML: `
        <div id="refreshModal" class="refresh-modal-overlay">
            <div class="refresh-modal-content">
                <div class="refresh-modal-header">
                    <div class="refresh-modal-icon" id="refreshModalIconContainer">
                        <span class="material-symbols-outlined" id="refreshModalIcon">cached</span>
                    </div>
                    <h3 class="refresh-modal-title" id="refreshModalTitle">Atualizar App</h3>
                </div>
                <div class="refresh-modal-body">
                    <p id="refreshModalDesc">Verificando versão...</p>
                    <p class="refresh-modal-hint" id="refreshModalHint">Dados históricos (rodadas anteriores) são preservados.</p>
                </div>
                <div class="refresh-modal-actions">
                    <button id="refreshModalCancel" class="refresh-modal-btn refresh-modal-btn-cancel">
                        Cancelar
                    </button>
                    <button id="refreshModalConfirm" class="refresh-modal-btn refresh-modal-btn-confirm">
                        <span class="material-symbols-outlined">refresh</span>
                        Atualizar
                    </button>
                </div>
            </div>
        </div>
    `,

    // CSS do componente
    _styles: `
        /* ============================================
           BOTÃO DE ATUALIZAÇÃO
           ============================================ */
        .refresh-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            padding: 0;
            gap: 0;
            background: rgba(255, 255, 255, 0.09);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 999px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0;
            font-weight: 600;
            min-width: 30px;
            line-height: 1;
            cursor: pointer;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
        }

        .refresh-button:hover {
            background: rgba(255, 255, 255, 0.22);
            border-color: rgba(255, 255, 255, 0.40);
            color: rgba(255, 255, 255, 1);
            transform: scale(1.05);
        }

        .refresh-button:active {
            transform: scale(0.95);
            background: rgba(255, 255, 255, 0.28);
            border-color: rgba(255, 255, 255, 0.50);
        }

        .refresh-button .material-symbols-outlined {
            font-size: 18px;
        }

        .refresh-button-container,
        .refresh-button-inline-wrapper {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: auto;
            padding: 0;
        }

        /* ============================================
           MODAL DE CONFIRMAÇÃO
           ============================================ */
        .refresh-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.2s ease;
        }

        .refresh-modal-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        .refresh-modal-content {
            background: linear-gradient(180deg, #1f1f1f 0%, #171717 100%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            max-width: 340px;
            width: 90%;
            transform: scale(0.9);
            transition: transform 0.2s ease;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .refresh-modal-overlay.active .refresh-modal-content {
            transform: scale(1);
        }

        .refresh-modal-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        }

        .refresh-modal-icon {
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, rgba(255, 69, 0, 0.2), rgba(255, 69, 0, 0.1));
            border: 2px solid rgba(255, 69, 0, 0.4);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .refresh-modal-icon .material-symbols-outlined {
            font-size: 28px;
            color: #ff4500;
        }

        .refresh-modal-icon--update {
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(76, 175, 80, 0.1));
            border-color: rgba(76, 175, 80, 0.5);
        }

        .refresh-modal-icon--update .material-symbols-outlined {
            color: #4caf50;
        }

        .refresh-modal-title {
            color: white;
            font-size: 18px;
            font-weight: 600;
            margin: 0;
        }

        .refresh-modal-body {
            text-align: center;
            margin-bottom: 24px;
        }

        .refresh-modal-body p {
            color: rgba(255, 255, 255, 0.7);
            font-size: 14px;
            line-height: 1.5;
            margin: 0 0 8px 0;
        }

        .refresh-modal-hint {
            color: rgba(255, 255, 255, 0.5) !important;
            font-size: 12px !important;
            font-style: italic;
        }

        .refresh-modal-version-tag {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 600;
        }

        .refresh-modal-version-tag--current {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.6);
        }

        .refresh-modal-version-tag--new {
            background: rgba(76, 175, 80, 0.2);
            color: #4caf50;
        }

        .refresh-modal-actions {
            display: flex;
            gap: 12px;
        }

        .refresh-modal-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 12px 16px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
        }

        .refresh-modal-btn-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.7);
        }

        .refresh-modal-btn-cancel:active {
            background: rgba(255, 255, 255, 0.15);
            transform: scale(0.95);
        }

        .refresh-modal-btn-confirm {
            background: linear-gradient(135deg, #ff4500, var(--app-primary-light));
            color: white;
        }

        .refresh-modal-btn-confirm:active {
            transform: scale(0.95);
            filter: brightness(0.9);
        }

        .refresh-modal-btn-confirm--update {
            background: linear-gradient(135deg, #4caf50, #66bb6a);
        }

        .refresh-modal-btn .material-symbols-outlined {
            font-size: 18px;
        }
    `,

    // Estado interno
    _initialized: false,
    _hasNewVersion: false,
    _serverVersion: null,
    _localVersion: null,

    /**
     * Inicializar o componente (injeta CSS e modal)
     */
    init() {
        if (this._initialized) return;

        // Injetar CSS
        if (!document.getElementById('refreshButtonStyles')) {
            const style = document.createElement('style');
            style.id = 'refreshButtonStyles';
            style.textContent = this._styles;
            document.head.appendChild(style);
        }

        // Injetar Modal
        if (!document.getElementById('refreshModal')) {
            document.body.insertAdjacentHTML('beforeend', this._modalHTML);
            this._setupModalEvents();
        }

        this._initialized = true;
        if (window.Log) Log.info('REFRESH-BUTTON', 'Componente v3.0 inicializado');
    },

    /**
     * Configurar eventos do modal
     */
    _setupModalEvents() {
        const modal = document.getElementById('refreshModal');
        const cancelBtn = document.getElementById('refreshModalCancel');
        const confirmBtn = document.getElementById('refreshModalConfirm');

        // Fechar ao clicar no overlay
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideModal();
            }
        });

        // Botão cancelar
        cancelBtn?.addEventListener('click', () => {
            this.hideModal();
        });

        // Botão confirmar — decide refresh seletivo ou completo
        confirmBtn?.addEventListener('click', async () => {
            if (this._hasNewVersion) {
                await this._executeFullRefresh();
            } else {
                await this._executeSmartRefresh();
            }
        });
    },

    /**
     * Verificar versão no servidor vs local
     */
    async _checkVersion() {
        try {
            const response = await fetch('/api/app/check-version', {
                headers: { 'x-client-type': 'app' }
            });
            if (!response.ok) return { hasNew: false, server: null, local: null };

            const data = await response.json();
            const serverVersion = data.version;
            const localVersion = localStorage.getItem('app_version');

            const hasNew = localVersion && serverVersion && localVersion !== serverVersion;

            this._hasNewVersion = hasNew;
            this._serverVersion = serverVersion;
            this._localVersion = localVersion;

            return { hasNew, server: serverVersion, local: localVersion };
        } catch (error) {
            if (window.Log) Log.warn('REFRESH-BUTTON', 'Erro ao verificar versão:', error);
            return { hasNew: false, server: null, local: null };
        }
    },

    /**
     * Mostrar modal com verificação de versão
     */
    async showModal() {
        const modal = document.getElementById('refreshModal');
        if (!modal) return;

        // Reset estado visual
        const iconContainer = document.getElementById('refreshModalIconContainer');
        const icon = document.getElementById('refreshModalIcon');
        const title = document.getElementById('refreshModalTitle');
        const desc = document.getElementById('refreshModalDesc');
        const hint = document.getElementById('refreshModalHint');
        const confirmBtn = document.getElementById('refreshModalConfirm');

        // Mostrar modal com "Verificando..."
        if (icon) icon.textContent = 'sync';
        if (title) title.textContent = 'Verificando...';
        if (desc) desc.textContent = 'Comparando versão com o servidor...';
        if (hint) hint.textContent = '';
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Aguarde';
        }

        modal.classList.add('active');

        // Verificar versão
        const { hasNew, server, local } = await this._checkVersion();

        if (hasNew) {
            // Versão nova disponível
            if (iconContainer) {
                iconContainer.classList.add('refresh-modal-icon--update');
            }
            if (icon) icon.textContent = 'system_update';
            if (title) title.textContent = 'Nova Versão Disponível';
            if (desc) {
                desc.innerHTML = `
                    Versão atual: <span class="refresh-modal-version-tag refresh-modal-version-tag--current">v${local}</span><br>
                    Nova versão: <span class="refresh-modal-version-tag refresh-modal-version-tag--new">v${server}</span>
                `;
            }
            if (hint) hint.textContent = 'Atualizar agora traz a versão mais recente do servidor.';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.classList.add('refresh-modal-btn-confirm--update');
                confirmBtn.innerHTML = '<span class="material-symbols-outlined">system_update</span> Atualizar App';
            }
        } else {
            // Mesma versão — refresh de dados da rodada
            if (iconContainer) {
                iconContainer.classList.remove('refresh-modal-icon--update');
            }
            if (icon) icon.textContent = 'refresh';
            if (title) title.textContent = 'Atualizar Dados';
            if (desc) {
                const vTag = server ? `<span class="refresh-modal-version-tag refresh-modal-version-tag--current">v${server}</span>` : '';
                desc.innerHTML = `App na versão mais recente ${vTag}<br>Atualizar dados da rodada atual.`;
            }
            if (hint) hint.textContent = 'Dados históricos (rodadas anteriores) são preservados.';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('refresh-modal-btn-confirm--update');
                confirmBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span> Atualizar Dados';
            }
        }
    },

    /**
     * Esconder modal
     */
    hideModal() {
        const modal = document.getElementById('refreshModal');
        if (modal) {
            modal.classList.remove('active');
        }
    },

    /**
     * Refresh SELETIVO — mesma versão, apenas dados voláteis da rodada atual
     * Preserva: rodadas consolidadas, histórico, assets do SW, localStorage
     */
    async _executeSmartRefresh() {
        if (window.Log) Log.info('REFRESH-BUTTON', 'Refresh seletivo — dados voláteis da rodada atual');

        this._setConfirmLoading();

        try {
            // 1. Limpar stores voláteis no CacheV2 (IndexedDB)
            if (window.Cache?.invalidateStore) {
                await window.Cache.invalidateStore('status');    // mercado status
                await window.Cache.invalidateStore('rankings');  // ranking atual
            }

            // 2. Limpar memória (ParticipanteCache)
            if (window.ParticipanteCache) {
                window.ParticipanteCache.clear();
            }

            // 3. Feedback tátil
            if (navigator.vibrate) navigator.vibrate(50);

            // 4. Ativar overlay e recarregar
            this._activateOverlayAndReload();

        } catch (error) {
            if (window.Log) Log.error('REFRESH-BUTTON', 'Erro no refresh seletivo:', error);
            this.hideModal();
        }
    },

    /**
     * Refresh COMPLETO — versão nova, limpa tudo e recarrega assets
     */
    async _executeFullRefresh() {
        if (window.Log) Log.info('REFRESH-BUTTON', `Refresh completo — nova versão detectada (${this._localVersion} → ${this._serverVersion})`);

        this._setConfirmLoading();

        try {
            // 1. Limpar version keys do localStorage
            localStorage.removeItem('app_version');
            localStorage.removeItem('app_server_boot');

            // 2. Limpar CacheV2 completo (IndexedDB + memória)
            if (window.Cache?.clearAll) {
                await window.Cache.clearAll();
            }

            // 3. Limpar OfflineCache (IndexedDB)
            if (window.OfflineCache?.clearAll) {
                await window.OfflineCache.clearAll();
            }

            // 4. Limpar ParticipanteCache (memória)
            if (window.ParticipanteCache) {
                window.ParticipanteCache.clear();
            }

            // 5. Limpar caches do Service Worker (preservando cache ativo)
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                } catch (e) { /* ignorar — prosseguir com reload */ }
            }

            // 6. Forçar update do Service Worker
            if ('serviceWorker' in navigator) {
                try {
                    const reg = await navigator.serviceWorker.getRegistration();
                    if (reg) {
                        if (reg.waiting) {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                        await reg.update();
                    }
                } catch (e) { /* ignorar */ }
            }

            // 7. Limpar sessionStorage
            sessionStorage.clear();

            // 8. Feedback tátil
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

            // 9. Ativar overlay e recarregar
            this._activateOverlayAndReload();

        } catch (error) {
            if (window.Log) Log.error('REFRESH-BUTTON', 'Erro no refresh completo:', error);
            this.hideModal();
        }
    },

    /**
     * Helper: alterar botão para "Atualizando..."
     */
    _setConfirmLoading() {
        const confirmBtn = document.getElementById('refreshModalConfirm');
        if (confirmBtn) {
            confirmBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Atualizando...';
            confirmBtn.disabled = true;
        }
    },

    /**
     * Helper: ativar overlay e reload
     */
    _activateOverlayAndReload() {
        const glassOverlay = document.getElementById('reload-glass-overlay');
        if (glassOverlay) {
            glassOverlay.classList.add('is-active');
        }

        setTimeout(() => {
            window.location.reload();
        }, 300);
    },

    /**
     * Criar botão de atualização
     */
    createButton(options = {}) {
        this.init();

        const text = options.text || '';
        const showIcon = options.showIcon !== false;

        const button = document.createElement('button');
        button.className = 'refresh-button';
        if (!text.trim()) {
            button.setAttribute('aria-label', options.ariaLabel || 'Atualizar dados');
            button.setAttribute('title', options.title || 'Atualizar dados');
        }

        button.innerHTML = `
            ${showIcon ? '<span class="material-symbols-outlined">refresh</span>' : ''}
            ${text ? `<span class="refresh-button-text" style="display:inline-block;font-size:12px;margin-left:4px;">${text}</span>` : ''}
        `;

        button.addEventListener('click', () => {
            this.showModal();
        });

        return button;
    },

    /**
     * Adicionar botão a um container
     */
    addTo(container, options = {}) {
        this.init();

        const containerEl = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!containerEl) {
            if (window.Log) Log.warn('REFRESH-BUTTON', 'Container não encontrado');
            return null;
        }

        // v2.1: Evitar duplicação
        const existingButton = containerEl.querySelector('.refresh-button-container');
        if (existingButton) {
            if (window.Log) Log.debug('REFRESH-BUTTON', 'Botão já existe no container, ignorando duplicação');
            return existingButton;
        }

        // Criar container para o botão
        const wrapper = document.createElement('div');
        wrapper.className = 'refresh-button-inline-wrapper';
        wrapper.appendChild(this.createButton(options));

        // Tentar injetar em um elemento header/linha existente
        const headerSlot = containerEl.querySelector('.flex.justify-between, .flex.items-center, .module-header, .section-heading, .text-center, h1, h2');
        if (headerSlot && headerSlot !== containerEl) {
            // Se o container pai for bloco, força linha com display:flex
            const host = headerSlot.closest('.flex.justify-between, .flex.items-center') || headerSlot;
            if (host && !(host.classList.contains('refresh-button-inline-wrapper'))) {
                host.style.display = host.style.display || 'flex';
                host.style.alignItems = host.style.alignItems || 'center';
                host.style.justifyContent = host.style.justifyContent || 'space-between';
                host.appendChild(wrapper);
                return wrapper;
            }
        }

        // Fallback tradicional: adiciona no topo (sem ocupar linha separada)
        containerEl.style.position = containerEl.style.position || 'relative';
        wrapper.style.position = 'absolute';
        wrapper.style.top = '12px';
        wrapper.style.right = '12px';
        wrapper.style.zIndex = '10';
        containerEl.insertBefore(wrapper, containerEl.firstChild);

        return wrapper;
    },

    /**
     * Sempre disponível (v3.0)
     */
    shouldShow() {
        return true;
    }
};

// Inicializar automaticamente
RefreshButton.init();

// Expor globalmente
window.RefreshButton = RefreshButton;

if (window.Log) Log.info('REFRESH-BUTTON', 'Componente v3.0 pronto');
