// =====================================================================
// QUICK ACCESS BAR v4.0 - Especial Sheet (Copa + Libertadores)
// =====================================================================
// 4 botões: Início (home), Ranking, Especial (sheet), Financeiro
// GPU-accelerated, 60fps guaranteed, DOM caching
// v4.0: Botão "Menu" substituído por "Especial" com Landing Pages
//       Módulos movidos para grid inline na Home
// v3.0: Botão "Ao Vivo" removido - substituído por Raio-X da Rodada (acessível via módulo Rodadas)
// v2.7: Módulo inicial agora é "home" (temporada 2026 em andamento - rodada 1+)
// v2.5: Menu dinâmico baseado em modulosAtivos e isLigaEstreante
//       - Hall da Fama oculto para ligas estreantes
//       - Módulos não configurados mostram "Aguarde"
// v2.2: Aguarda splash fechar antes de renderizar (evita conflito)
// =====================================================================

if (window.Log) Log.info('QUICK-BAR', '🚀 Carregando Quick Access Bar v4.0...');

class QuickAccessBar {
    constructor() {
        this.menuAberto = false;
        this.modulosAtivos = {};
        // ✅ v2.7: Módulo inicial agora é "home" (temporada 2026 em andamento)
        this.moduloAtual = 'home';

        // DOM Cache - populated on render
        this._dom = {
            bottomNav: null,
            menuOverlay: null,
            menuSheet: null,
            menuButton: null,
            navItems: null
        };

        this.statusMercado = null;
        this.mercadoAberto = false;
        this._ultimaStatusAtualizado = 0;

        // Touch state
        this._touchStartY = 0;
        this._isAnimating = false;
    }

    async inicializar() {
        if (window.Log) Log.info('QUICK-BAR', 'Inicializando...');

        // ✅ v2.2: Aguardar splash fechar na primeira visita
        await this.aguardarSplashFechar();

        await this.aguardarNavegacao();
        await this.carregarModulosAtivos();

        this.renderizar();
        this.cacheDOM();
        this.configurarEventos();

        if (window.Log) Log.info('QUICK-BAR', '✅ Quick Access Bar v2.2 pronta');
    }

    /**
     * ✅ v2.2: Aguarda splash fechar antes de renderizar a barra
     * Evita conflito visual onde a barra aparece por cima da splash
     */
    async aguardarSplashFechar() {
        const STORAGE_KEY = 'participante_app_loaded';
        const isReload = sessionStorage.getItem(STORAGE_KEY);

        // Em reload, splash não aparece - continuar imediatamente
        if (isReload) {
            if (window.Log) Log.debug('QUICK-BAR', 'Reload detectado - inicializando imediatamente');
            return;
        }

        // Primeira visita: aguardar splash fechar
        if (window.Log) Log.info('QUICK-BAR', 'Primeira visita - aguardando splash fechar...');

        return new Promise((resolve) => {
            // Verificar se SplashScreen existe e está visível
            const checkSplash = () => {
                // Se SplashScreen não existe ou não está visível, continuar
                if (!window.SplashScreen || !window.SplashScreen.isVisible) {
                    if (window.Log) Log.debug('QUICK-BAR', 'Splash fechou - continuando inicialização');
                    resolve();
                    return true;
                }
                return false;
            };

            // Verificar imediatamente
            if (checkSplash()) return;

            // Polling a cada 100ms até splash fechar (max 8s)
            const interval = setInterval(() => {
                if (checkSplash()) {
                    clearInterval(interval);
                }
            }, 100);

            // Timeout de segurança (8s)
            setTimeout(() => {
                clearInterval(interval);
                if (window.Log) Log.warn('QUICK-BAR', 'Timeout aguardando splash - forçando inicialização');
                resolve();
            }, 8000);
        });
    }

    async aguardarNavegacao() {
        if (window.participanteNav) return;

        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (window.participanteNav) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);

            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, 3000);
        });
    }

    async carregarModulosAtivos() {
        if (window.participanteNav?.modulosAtivos) {
            this.modulosAtivos = window.participanteNav.modulosAtivos;
        }
    }

    async atualizarStatusMercado(force = false) {
        const agora = Date.now();
        if (
            !force &&
            this._ultimaStatusAtualizado &&
            agora - this._ultimaStatusAtualizado < 60000
        ) {
            return this.statusMercado;
        }

        let sucesso = false;
        try {
            const response = await fetch('/api/cartola/mercado/status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const status = await response.json();
            this.statusMercado = status;
            this.mercadoAberto = status?.status_mercado === 1;
            sucesso = true;
            return status;
        } catch (error) {
            if (window.Log) Log.warn('QUICK-BAR', 'Erro ao carregar status do mercado', error);
            return this.statusMercado;
        } finally {
            if (sucesso) {
                this._ultimaStatusAtualizado = agora;
            }
        }
    }

    renderizar() {
        // Skip if already rendered
        if (document.querySelector('.bottom-nav')) {
            if (window.Log) Log.warn('QUICK-BAR', 'Já existe');
            return;
        }

        // Create fragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        // Menu Overlay
        const menuOverlay = document.createElement('div');
        menuOverlay.className = 'menu-overlay';
        menuOverlay.id = 'menuOverlay';
        fragment.appendChild(menuOverlay);

        // Menu Sheet (lazy content - rendered on first open)
        const menuSheet = document.createElement('div');
        menuSheet.className = 'menu-sheet';
        menuSheet.id = 'menuSheet';
        menuSheet.innerHTML = '<div class="menu-handle"></div>';
        fragment.appendChild(menuSheet);

        // Bottom Navigation
        const bottomNav = document.createElement('nav');
        bottomNav.className = 'bottom-nav';
        bottomNav.innerHTML = `
            <div class="nav-container">
                <button class="nav-item active" data-page="home" type="button" aria-current="page">
                    <span class="material-icons nav-icon">home</span>
                    <span class="nav-label">Início</span>
                </button>
                <button class="nav-item" data-page="ranking" type="button">
                    <span class="material-icons nav-icon">trending_up</span>
                    <span class="nav-label">Ranking Geral</span>
                </button>
                <button class="nav-item especial-btn" data-page="menu" id="menuButton" type="button">
                    <span class="material-icons nav-icon">star</span>
                    <span class="nav-label">Especial</span>
                </button>
                <button class="nav-item" data-page="extrato" type="button">
                    <span class="material-icons nav-icon">account_balance_wallet</span>
                    <span class="nav-label">Financeiro</span>
                </button>
            </div>
        `;
        fragment.appendChild(bottomNav);

        // Single DOM insertion
        document.body.appendChild(fragment);

        if (window.Log) Log.debug('QUICK-BAR', '✅ Renderizado');
    }

    cacheDOM() {
        this._dom.bottomNav = document.querySelector('.bottom-nav');
        this._dom.menuOverlay = document.getElementById('menuOverlay');
        this._dom.menuSheet = document.getElementById('menuSheet');
        this._dom.menuButton = document.getElementById('menuButton');
        this._dom.navItems = document.querySelectorAll('.nav-item');
    }

    /**
     * ✅ v4.0: Sheet "Especial" — Landing Pages (Copa do Mundo + Libertadores)
     * Módulos foram movidos para grid inline na Home
     */
    renderizarMenuContent() {
        return `
            <div class="especial-sheet-header">
                <div class="especial-sheet-title">
                    <span class="material-icons">star</span>
                    Especial
                </div>
                <button class="especial-sheet-close" type="button" aria-label="Fechar">
                    <span class="material-icons">close</span>
                </button>
            </div>

            <div class="especial-card especial-card-copa" data-module="copa-2026-mundo">
                <div class="especial-card-icon">
                    <span class="material-icons">public</span>
                </div>
                <div class="especial-card-text">
                    <div class="especial-card-name">Copa do Mundo 2026</div>
                    <div class="especial-card-desc">Jogos, grupos e tabela ao vivo</div>
                </div>
                <span class="material-icons especial-chevron">chevron_right</span>
            </div>

            <div class="especial-card especial-card-liberta" data-module="libertadores">
                <div class="especial-card-icon">
                    <span class="material-icons">emoji_events</span>
                </div>
                <div class="especial-card-text">
                    <div class="especial-card-name">Libertadores 2026</div>
                    <div class="especial-card-desc">Notícias e resultados da Liberta</div>
                </div>
                <span class="material-icons especial-chevron">chevron_right</span>
            </div>

            <div class="especial-card especial-card-copabr" data-module="copa-brasil">
                <div class="especial-card-icon">
                    <span class="material-icons">workspace_premium</span>
                </div>
                <div class="especial-card-text">
                    <div class="especial-card-name">Copa do Brasil 2026</div>
                    <div class="especial-card-desc">Mata-mata nacional — 92 clubes</div>
                </div>
                <span class="material-icons especial-chevron">chevron_right</span>
            </div>

            <div class="especial-card especial-card-copane" data-module="copa-nordeste">
                <div class="especial-card-icon">
                    <span class="material-icons">flare</span>
                </div>
                <div class="especial-card-text">
                    <div class="especial-card-name">Copa do Nordeste 2026</div>
                    <div class="especial-card-desc">Nordestão — 20 clubes, 4 grupos</div>
                </div>
                <span class="material-icons especial-chevron">chevron_right</span>
            </div>

            <div class="especial-card especial-card-brasileirao" data-module="brasileirao">
                <div class="especial-card-icon">
                    <span class="material-icons">sports_soccer</span>
                </div>
                <div class="especial-card-text">
                    <div class="especial-card-name">Brasileirão Série A 2026</div>
                    <div class="especial-card-desc">Tabela de classificação ao vivo</div>
                </div>
                <span class="material-icons especial-chevron">chevron_right</span>
            </div>
        `;
    }

    /**
     * ✅ v4.0: Gera HTML do grid de módulos para renderização inline na Home
     * Reutiliza lógica de modulosAtivos, manutenção e liga estreante
     */
    gerarModulosInlineHTML() {
        const modulosAtivos = this.modulosAtivos || {};
        const isLigaEstreante = window.isLigaEstreante || false;

        const modulosBase = ['extrato', 'ranking', 'rodadas'];

        const isAtivo = (configKey) => {
            if (modulosBase.includes(configKey)) return true;
            return modulosAtivos[configKey] === true;
        };

        const isPremium = window.participanteNav?._isPremium === true;
        const modulosBloqueadosManutencao = Array.isArray(window.participanteModulosBloqueados)
            ? window.participanteModulosBloqueados
            : [];
        const isEmManutencao = (configKey) => {
            if (isPremium) return false;
            const bloqueadoLiga = modulosBase.includes(configKey) && modulosAtivos[configKey] === false;
            const bloqueadoManutencao = modulosBloqueadosManutencao.includes(configKey);
            return bloqueadoLiga || bloqueadoManutencao;
        };

        const renderCard = (moduleId, configKey, icon, label) => {
            const manutencao = isEmManutencao(configKey);
            const ativo = isAtivo(configKey);
            const aguarde = !ativo && !manutencao;

            if (manutencao) {
                return `
                    <div class="home-module-card manutencao"
                         data-module="${moduleId}"
                         data-disabled="true"
                         data-disabled-message="O módulo ${label} está em manutenção.">
                        <span class="material-icons">${icon}</span>
                        <span class="home-module-card-label">${label}</span>
                        <span class="home-badge-aguarde" style="background:rgba(255,85,0,0.2);color:var(--app-primary)">Em manutenção</span>
                    </div>
                `;
            }

            return `
                <div class="home-module-card${aguarde ? ' aguarde' : ''}"
                     data-module="${moduleId}"
                     ${aguarde ? 'data-action="aguarde-config"' : ''}>
                    <span class="material-icons">${icon}</span>
                    <span class="home-module-card-label">${label}</span>
                    ${aguarde ? '<span class="home-badge-aguarde">Aguarde</span>' : ''}
                </div>
            `;
        };

        const hallDaFamaCard = isLigaEstreante ? '' : `
            <div class="home-module-card" data-module="historico">
                <span class="material-icons">history</span>
                <span class="home-module-card-label">Hall da Fama</span>
            </div>
        `;

        return `
            <div class="home-module-category">
                <div class="home-module-category-title">
                    <span class="material-icons">emoji_events</span>
                    Competições
                </div>
                <div class="home-module-grid">
                    <div class="home-module-card" data-module="rodadas">
                        <span class="material-icons">view_week</span>
                        <span class="home-module-card-label">Rodadas</span>
                    </div>
                    ${renderCard('pontos-corridos', 'pontosCorridos', 'format_list_numbered', 'Pontos Corridos')}
                    ${renderCard('mata-mata', 'mataMata', 'military_tech', 'Mata-Mata')}
                    ${renderCard('top10', 'top10', 'leaderboard', 'TOP 10')}
                    ${renderCard('campinho', 'campinho', 'sports_soccer', 'Meu Time da Rodada')}
                    ${renderCard('resta-um', 'restaUm', 'person_off', 'Resta Um')}
                </div>
            </div>

            <div class="home-module-category">
                <div class="home-module-category-title">
                    <span class="material-icons">workspace_premium</span>
                    Prêmios & Estatísticas
                </div>
                <div class="home-module-grid">
                    ${renderCard('artilheiro', 'artilheiro', 'sports_soccer', 'Artilheiro')}
                    ${renderCard('luva-ouro', 'luvaOuro', 'sports_handball', 'Luva de Ouro')}
                    ${renderCard('capitao', 'capitaoLuxo', 'emoji_events', 'Capitão de Luxo')}
                    ${renderCard('melhor-mes', 'melhorMes', 'calendar_month', 'Melhor do Mês')}
                    ${hallDaFamaCard}
                </div>
            </div>

            <div class="home-module-category">
                <div class="home-module-category-title">
                    <span class="material-icons">upcoming</span>
                    Em Breve
                </div>
                <div class="home-module-grid">
                    <div class="home-module-card" data-module="copa-times-sc">
                        <span class="material-icons" style="color: var(--app-gold);">emoji_events</span>
                        <span class="home-module-card-label">Copa de Times SC</span>
                        <span class="home-badge-em-breve" style="background:rgba(255,215,0,0.2);color:var(--app-gold);border:1px solid var(--app-gold);">EM BREVE</span>
                    </div>
                    ${isPremium ? `
                    <div class="home-module-card" data-module="tiro-certo">
                        <span class="material-icons" style="color: var(--app-primary);">gps_fixed</span>
                        <span class="home-module-card-label">Tiro Certo</span>
                        <span class="home-badge-em-breve" style="background:rgba(255,85,0,0.12);color:var(--app-primary);border:1px solid rgba(255,85,0,0.25);">EM BREVE</span>
                    </div>` : ''}
                    <div class="home-module-card" data-module="bolao-copa" data-action="em-breve" style="opacity:0.4">
                        <span class="material-icons">sports</span>
                        <span class="home-module-card-label">Bolão Copa</span>
                    </div>
                </div>
            </div>
        `;
    }

    configurarEventos() {
        const { menuOverlay, menuSheet, bottomNav } = this._dom;

        // Event Delegation for nav items (single listener)
        if (bottomNav) {
            bottomNav.addEventListener('click', (e) => {
                const navItem = e.target.closest('.nav-item');
                if (!navItem) return;

                const page = navItem.dataset.page;
                if (page === 'menu') {
                    this.toggleMenu();
                } else {
                    this.navegarPara(page);
                    this.atualizarNavAtivo(page);
                }
            }, { passive: true });
        }

        // Overlay click
        if (menuOverlay) {
            menuOverlay.addEventListener('click', () => this.fecharMenu(), { passive: true });
        }

        // Menu sheet - Event Delegation + Swipe
        if (menuSheet) {
            // Click delegation for Especial sheet cards
            menuSheet.addEventListener('click', (e) => {
                const card = e.target.closest('.especial-card');
                const closeBtn = e.target.closest('.especial-sheet-close');

                if (closeBtn) {
                    this.fecharMenu();
                    return;
                }

                if (!card) return;

                const module = card.dataset.module;
                if (module) {
                    this.fecharMenu();
                    this.navegarPara(module);
                    this._dom.navItems.forEach(nav => nav.classList.remove('active'));
                }
            }, { passive: true });

            // Swipe down to close
            menuSheet.addEventListener('touchstart', (e) => {
                this._touchStartY = e.touches[0].clientY;
            }, { passive: true });

            menuSheet.addEventListener('touchend', (e) => {
                const deltaY = e.changedTouches[0].clientY - this._touchStartY;
                if (deltaY > 60) {
                    this.fecharMenu();
                }
            }, { passive: true });
        }

        // Keyboard support (ref stored for future cleanup)
        this._keydownHandler = (e) => {
            if (e.key === 'Escape' && this.menuAberto) {
                this.fecharMenu();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);

        if (window.Log) Log.debug('QUICK-BAR', '✅ Eventos configurados');
    }

    toggleMenu() {
        if (this._isAnimating) return;
        this.menuAberto ? this.fecharMenu() : this.abrirMenu();
    }

    /**
     * ✅ v2.9: Recarrega modulosAtivos do backend via participanteNav
     * Garante que o menu sempre mostra o estado real dos módulos.
     */
    async _refreshModulosAtivos() {
        if (window.participanteNav?.refreshModulosAtivos) {
            await window.participanteNav.refreshModulosAtivos();
            this.modulosAtivos = window.participanteNav.modulosAtivos;
        }
    }

    async abrirMenu() {
        if (this._isAnimating) return;
        this._isAnimating = true;

        const { menuOverlay, menuSheet } = this._dom;

        // ✅ v2.9: Atualizar status do mercado e módulos ativos em paralelo
        try {
            await Promise.all([
                this.atualizarStatusMercado(),
                this._refreshModulosAtivos()
            ]);
        } catch (error) {
            if (window.Log) Log.warn('QUICK-BAR', 'Erro ao atualizar dados antes do menu', error);
        }

        if (menuSheet) {
            menuSheet.innerHTML = this.renderizarMenuContent();
        }

        // Use RAF for smooth animation start
        requestAnimationFrame(() => {
            if (menuOverlay) menuOverlay.classList.add('visible');
            if (menuSheet) menuSheet.classList.add('visible');
            this.menuAberto = true;
            this.atualizarNavAtivo('menu');

            setTimeout(() => {
                this._isAnimating = false;
            }, 350);
        });
    }

    fecharMenu() {
        if (this._isAnimating) return;
        this._isAnimating = true;

        const { menuOverlay, menuSheet } = this._dom;

        requestAnimationFrame(() => {
            if (menuOverlay) menuOverlay.classList.remove('visible');
            if (menuSheet) menuSheet.classList.remove('visible');
            this.menuAberto = false;
            this.atualizarNavAtivo(this.moduloAtual);

            setTimeout(() => {
                this._isAnimating = false;
            }, 350);
        });
    }

    navegarPara(modulo) {
        if (window.participanteNav) {
            // ✅ v5.9: Respeitar double-init guard — se já está carregando este módulo, ignorar
            if (window.participanteNav._carregandoModulo === modulo) {
                if (window.Log) Log.debug('QUICK-BAR', `⏸️ Módulo ${modulo} já em carregamento, ignorando`);
                return;
            }
            window.participanteNav.navegarPara(modulo);
            this.moduloAtual = modulo;
        }
    }

    // REMOVIDO: navegarParaAoVivo() - funcionalidade substituída por Raio-X da Rodada

    atualizarNavAtivo(page) {
        this._dom.navItems.forEach(item => {
            const isActive = item.dataset.page === page;
            item.classList.toggle('active', isActive);
            if (isActive) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
        });
    }

    mostrarToast(mensagem, tipo = 'info') {
        // Remove existing
        const existente = document.querySelector('.quick-toast');
        if (existente) existente.remove();

        const toast = document.createElement('div');
        toast.className = 'quick-toast';

        // Configuracao por tipo
        const configs = {
            info: { icone: 'info', cor: 'var(--app-info)', duracao: 2500 },
            success: { icone: 'check_circle', cor: 'var(--app-success-light)', duracao: 2500 },
            warning: { icone: 'warning', cor: 'var(--app-amber)', duracao: 3500 },
            urgente: { icone: 'alarm', cor: 'var(--app-pos-gol)', duracao: 4500 },
            critico: { icone: 'alarm_on', cor: 'var(--app-danger)', duracao: 5500 }
        };
        const config = configs[tipo] || configs.info;

        // Adicionar classe de tipo para estilos customizados
        toast.classList.add(`toast-${tipo}`);

        toast.innerHTML = `
            <span class="material-icons" style="color: ${config.cor}">${config.icone}</span>
            <span>${mensagem}</span>
        `;

        document.body.appendChild(toast);

        // RAF for animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        // Auto hide com duracao variavel por tipo
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, config.duracao);
    }

    atualizarModulosAtivos(modulosAtivos) {
        this.modulosAtivos = modulosAtivos;
        if (window.Log) Log.debug('QUICK-BAR', 'Módulos atualizados');

        // v4.7: Aplicar/remover visual de manutenção nos botões da bottom nav
        // ✅ v4.10: Premium bypass - sem visual de manutenção para premium
        // ✅ v4.11: 'ranking' removido — Ranking Geral é navegação fundamental (como Início), nunca bloqueável na Quick Bar
        const isPremiumNav = window.participanteNav?._isPremium === true;
        const modulosBase = ['extrato', 'rodadas'];
        modulosBase.forEach(key => {
            const btn = document.querySelector(`.nav-item[data-page="${key}"]`);
            if (!btn) return;
            // FIX BUG#3: considerar também bloqueios do manutencao.json (modo módulos)
            const bloqueadoLiga = modulosAtivos[key] === false;
            const bloqueadoManutencao = Array.isArray(window.participanteModulosBloqueados) &&
                window.participanteModulosBloqueados.includes(key);
            if ((bloqueadoLiga || bloqueadoManutencao) && !isPremiumNav) {
                btn.style.opacity = '0.35';
                btn.style.filter = 'grayscale(0.5)';
            } else {
                btn.style.opacity = '';
                btn.style.filter = '';
            }
        });
        // ✅ v2.9: Removido renderizarMenuContent() que era no-op (descartava HTML).
        // O menu é re-renderizado de fato em abrirMenu() a cada abertura.
    }

    /**
     * FIX BUG#3+4 v2.10: Sincroniza visual de bloqueio pontual (manutencao.json modo 'modulos')
     * com a bottom nav e o menu. Chamado pelo polling e pelo _verificarManutencao().
     * @param {string[]} modulosBloqueados — lista de IDs de módulos bloqueados (ex: ['extrato', 'ranking'])
     */
    sincronizarBloqueioManutencao(modulosBloqueados) {
        const isPremiumNav = window.participanteNav?._isPremium === true;
        if (isPremiumNav) return;

        // IDs da bottom nav (kebab ou direto) que mapeiam para módulos base
        // 'ranking' removido — Ranking Geral é navegação fundamental, nunca bloqueável na Quick Bar
        const modulosBase = ['extrato', 'rodadas'];
        modulosBase.forEach(key => {
            const btn = document.querySelector(`.nav-item[data-page="${key}"]`);
            if (!btn) return;
            const bloqueadoLiga = this.modulosAtivos?.[key] === false;
            const bloqueadoManutencao = modulosBloqueados.includes(key);
            if (bloqueadoLiga || bloqueadoManutencao) {
                btn.style.opacity = '0.35';
                btn.style.filter = 'grayscale(0.5)';
            } else {
                btn.style.opacity = '';
                btn.style.filter = '';
            }
        });

        if (window.Log) Log.debug('QUICK-BAR', 'Bloqueio manutencao sincronizado:', modulosBloqueados);
    }

    /**
     * ✅ v2.5: Modal para módulos não configurados pelo admin
     */
    mostrarModalAguardeConfig(moduloId) {
        const nomesModulos = {
            'pontos-corridos': 'Pontos Corridos',
            'mata-mata': 'Mata-Mata',
            'top10': 'TOP 10',
            'melhor-mes': 'Melhor do Mês',
            'artilheiro': 'Artilheiro',
            'luva-ouro': 'Luva de Ouro',
            'campinho': 'Meu Time da Rodada',
            'dicas': 'Dicas',
            'resta-um': 'Resta Um'
        };

        const nomeModulo = nomesModulos[moduloId] || moduloId;

        // Verificar se já existe modal no DOM
        let modal = document.getElementById('modal-aguarde-config');
        if (!modal) {
            // Criar modal
            modal = document.createElement('div');
            modal.id = 'modal-aguarde-config';
            modal.className = 'fixed inset-0 flex items-center justify-center z-[99999999] px-4';
            modal.style.background = 'rgba(0,0,0,0.85)';
            modal.style.backdropFilter = 'blur(8px)';
            modal.innerHTML = `
                <div class="bg-gray-900 rounded-2xl p-6 max-w-xs w-full text-center border border-gray-700/50 shadow-2xl">
                    <div class="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <span class="material-icons text-3xl text-amber-500">hourglass_empty</span>
                    </div>
                    <h3 id="aguarde-titulo" class="text-lg font-bold text-white mb-2" style="font-family: 'Russo One', sans-serif;">
                        ${typeof window.escapeHtml === 'function' ? window.escapeHtml(nomeModulo) : nomeModulo}
                    </h3>
                    <p class="text-gray-400 text-sm mb-5">
                        Aguarde o administrador<br>configurar este módulo
                    </p>
                    <button id="btn-aguarde-fechar"
                            class="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors">
                        Entendi
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#btn-aguarde-fechar')?.addEventListener('click', () => {
                document.getElementById('modal-aguarde-config')?.remove();
            });
        } else {
            // Atualizar título e mostrar
            const titulo = modal.querySelector('#aguarde-titulo');
            if (titulo) titulo.textContent = nomeModulo;
            modal.classList.remove('hidden');
        }

        // Click fora fecha
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        }, { once: true });

        if (window.Log) Log.debug('QUICK-BAR', `Modal "Aguarde" exibido para: ${moduloId}`);
    }
}

// Singleton instance
const quickAccessBar = new QuickAccessBar();

// Global exports
window.quickAccessBar = quickAccessBar;
window.QuickBar = quickAccessBar;

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => quickAccessBar.inicializar());
} else {
    quickAccessBar.inicializar();
}

if (window.Log) Log.info('QUICK-BAR', '✅ v4.0 carregado (Especial + Módulos Inline)');
