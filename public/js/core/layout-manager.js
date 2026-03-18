/**
 * LAYOUT MANAGER
 * Centraliza o carregamento de layout.html
 * Elimina duplicação de código entre páginas
 */

export class LayoutManager {
    constructor() {
        this.layoutLoaded = false;
        this.layoutPromise = null;
    }

    async load(pageConfig = {}) {
        // Evitar múltiplos carregamentos simultâneos
        if (this.layoutPromise) {
            return this.layoutPromise;
        }

        this.layoutPromise = this._loadLayout(pageConfig);
        return this.layoutPromise;
    }

    async _loadLayout(pageConfig) {
        if (this.layoutLoaded) {
            this._updatePageHeader(pageConfig);
            return;
        }

        try {
            const response = await fetch("layout.html");
            if (!response.ok) {
                throw new Error(`Layout request failed: ${response.status}`);
            }

            const layoutHtml = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(layoutHtml, "text/html");

            this._injectSidebar(doc);
            this._injectHeader(doc, pageConfig);
            this._executeLayoutScripts(doc);

            // Garantir que AccordionManager seja inicializado e dados do admin carregados
            setTimeout(() => {
                if (window.AccordionManager && !window.AccordionManager._initialized) {
                    window.AccordionManager.init();
                }
                // Carregar dados do admin (menu Super Admin)
                if (typeof window.verificarMenuSuperAdmin === 'function') {
                    window.verificarMenuSuperAdmin();
                }
                // Notificar que o layout (sidebar) está 100% pronto
                window.dispatchEvent(new CustomEvent('layout:ready'));
            }, 150);

            this.layoutLoaded = true;
        } catch (error) {
            console.error('Erro ao carregar layout:', error);
            throw new Error('Falha ao carregar layout do sistema');
        }
    }

    _injectSidebar(doc) {
        const sidebar = doc.querySelector(".app-sidebar");
        const toggleBtn = doc.querySelector(".sidebar-toggle-btn");
        const mobileToggle = doc.querySelector(".mobile-sidebar-toggle");
        const overlay = doc.querySelector(".sidebar-overlay");
        const placeholder = document.getElementById("sidebar-placeholder");

        if (sidebar && placeholder) {
            // ✅ v1.1: Incluir botão toggle junto com sidebar
            // ✅ v1.2: Incluir mobile toggle + overlay para responsividade
            const fragment = document.createDocumentFragment();
            if (toggleBtn) fragment.appendChild(toggleBtn);
            if (mobileToggle && !document.getElementById('mobileSidebarToggle')) {
                fragment.appendChild(mobileToggle);
            }
            if (overlay && !document.getElementById('sidebarOverlay')) {
                fragment.appendChild(overlay);
            }
            fragment.appendChild(sidebar);
            placeholder.replaceWith(fragment);
        }
    }

    _injectHeader(doc, pageConfig) {
        const header = doc.querySelector(".page-header");
        const placeholder = document.getElementById("header-placeholder");

        if (header && placeholder) {
            this._updatePageHeader(pageConfig, header);
            placeholder.replaceWith(header);
        }
    }

    _updatePageHeader(pageConfig, headerElement = null) {
        const header = headerElement || document.querySelector(".page-header");
        if (!header) return;

        const pageTitle = header.querySelector("#pageTitle");
        const pageSubtitle = header.querySelector("#pageSubtitle");

        if (pageTitle && pageConfig.title) {
            pageTitle.textContent = pageConfig.title;
        }
        if (pageSubtitle && pageConfig.subtitle) {
            pageSubtitle.textContent = pageConfig.subtitle;
        }
    }

    _executeLayoutScripts(doc) {
        const scripts = doc.querySelectorAll("script");
        scripts.forEach((script) => {
            if (script.textContent.trim()) {
                try {
                    const newScript = document.createElement("script");
                    newScript.textContent = `(function(){${script.textContent}})();`;
                    document.head.appendChild(newScript);
                } catch (error) {
                    console.error('Erro ao executar script do layout:', error);
                }
            }
        });
    }

    updatePageTitle(title, subtitle = null) {
        this._updatePageHeader({ title, subtitle });
        document.title = `${title} - Super Cartola Manager`;
    }
}