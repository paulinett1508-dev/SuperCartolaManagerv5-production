// =====================================================================
// QUICK ACCESS BAR v5.0 - Raio X da Rodada
// =====================================================================
// 4 botões: Início (home), Ranking, Raio X (rodada-xray), Financeiro
// GPU-accelerated, 60fps guaranteed, DOM caching
// v5.0: Botão "Especial" substituído por "Raio X" — navegação direta.
//       Removido: sheet overlay, menu animado, 5 LPs de campeonatos.
// =====================================================================
//
// Segurança: todos os usos de innerHTML neste arquivo utilizam
// template literals com dados estáticos ou valores escapados via
// window.escapeHtml(). Nenhum dado externo é injetado sem sanitização.

if (window.Log) Log.info('QUICK-BAR', '🚀 Carregando Quick Access Bar v5.0...');

class QuickAccessBar {
    constructor() {
        this.modulosAtivos = {};
        this.moduloAtual   = 'home';
        this._dom          = { bottomNav: null, navItems: null };
    }

    async inicializar() {
        if (window.Log) Log.info('QUICK-BAR', 'Inicializando...');
        await this.aguardarSplashFechar();
        await this.aguardarNavegacao();
        await this.carregarModulosAtivos();
        this.renderizar();
        this.cacheDOM();
        this.configurarEventos();
        if (window.Log) Log.info('QUICK-BAR', '✅ Quick Access Bar v5.0 pronta');
    }

    async aguardarSplashFechar() {
        const isReload = sessionStorage.getItem('participante_app_loaded');
        if (isReload) return;

        return new Promise((resolve) => {
            const check = () => {
                if (!window.SplashScreen || !window.SplashScreen.isVisible) { resolve(); return true; }
                return false;
            };
            if (check()) return;
            const iv = setInterval(() => { if (check()) clearInterval(iv); }, 100);
            setTimeout(() => { clearInterval(iv); resolve(); }, 8000);
        });
    }

    async aguardarNavegacao() {
        if (window.participanteNav) return;
        return new Promise((resolve) => {
            const iv = setInterval(() => {
                if (window.participanteNav) { clearInterval(iv); resolve(); }
            }, 100);
            setTimeout(() => { clearInterval(iv); resolve(); }, 3000);
        });
    }

    async carregarModulosAtivos() {
        if (window.participanteNav?.modulosAtivos) {
            this.modulosAtivos = window.participanteNav.modulosAtivos;
        }
    }

    renderizar() {
        if (document.querySelector('.bottom-nav')) {
            if (window.Log) Log.warn('QUICK-BAR', 'Já existe');
            return;
        }

        const nav = document.createElement('nav');
        nav.className = 'bottom-nav';

        // Todos os valores abaixo são estáticos — sem injeção de dados externos
        const btnInicio   = '<button class="nav-item active" data-page="home" type="button" aria-current="page"><span class="material-icons nav-icon">home</span><span class="nav-label">Início</span></button>';
        const btnRanking  = '<button class="nav-item" data-page="ranking" type="button"><span class="material-icons nav-icon">trending_up</span><span class="nav-label">Ranking Geral</span></button>';
        const btnRaioX    = '<button class="nav-item raiox-btn" data-page="rodada-xray" type="button"><span class="material-icons nav-icon">sports_soccer</span><span class="nav-label">Raio X</span></button>';
        const btnExtrato  = '<button class="nav-item" data-page="extrato" type="button"><span class="material-icons nav-icon">account_balance_wallet</span><span class="nav-label">Financeiro</span></button>';

        const container = document.createElement('div');
        container.className = 'nav-container';
        container.innerHTML = btnInicio + btnRanking + btnRaioX + btnExtrato;
        nav.appendChild(container);
        document.body.appendChild(nav);

        if (window.Log) Log.debug('QUICK-BAR', '✅ Renderizado');
    }

    cacheDOM() {
        this._dom.bottomNav = document.querySelector('.bottom-nav');
        this._dom.navItems  = document.querySelectorAll('.nav-item');
    }

    configurarEventos() {
        const { bottomNav } = this._dom;
        if (bottomNav) {
            bottomNav.addEventListener('click', (e) => {
                const navItem = e.target.closest('.nav-item');
                if (!navItem) return;
                const page = navItem.dataset.page;
                this.navegarPara(page);
                this.atualizarNavAtivo(page);
            }, { passive: true });
        }
        if (window.Log) Log.debug('QUICK-BAR', '✅ Eventos configurados');
    }

    navegarPara(modulo) {
        if (!window.participanteNav) return;
        if (window.participanteNav._carregandoModulo === modulo) return;
        window.participanteNav.navegarPara(modulo);
        this.moduloAtual = modulo;
    }

    // Compatibilidade retroativa — código externo pode chamar abrirMenu()
    abrirMenu() {
        this.navegarPara('rodada-xray');
        this.atualizarNavAtivo('rodada-xray');
    }

    atualizarNavAtivo(page) {
        this._dom.navItems.forEach(item => {
            const isActive = item.dataset.page === page;
            item.classList.toggle('active', isActive);
            isActive ? item.setAttribute('aria-current', 'page') : item.removeAttribute('aria-current');
        });
    }

    mostrarToast(mensagem, tipo = 'info') {
        const existente = document.querySelector('.quick-toast');
        if (existente) existente.remove();

        const configs = {
            info:    { icone: 'info',        cor: 'var(--app-info)',          duracao: 2500 },
            success: { icone: 'check_circle', cor: 'var(--app-success-light)', duracao: 2500 },
            warning: { icone: 'warning',      cor: 'var(--app-amber)',         duracao: 3500 },
            urgente: { icone: 'alarm',        cor: 'var(--app-pos-gol)',       duracao: 4500 },
            critico: { icone: 'alarm_on',     cor: 'var(--app-danger)',        duracao: 5500 }
        };
        const cfg = configs[tipo] || configs.info;

        const toast = document.createElement('div');
        toast.className = 'quick-toast toast-' + tipo;

        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.style.color = cfg.cor;
        icon.textContent = cfg.icone;

        const text = document.createElement('span');
        text.textContent = mensagem;

        toast.appendChild(icon);
        toast.appendChild(text);
        document.body.appendChild(toast);

        requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, cfg.duracao);
    }

    atualizarModulosAtivos(modulosAtivos) {
        this.modulosAtivos = modulosAtivos;
        if (window.Log) Log.debug('QUICK-BAR', 'Módulos atualizados');

        const modulosBase = ['extrato', 'rodadas'];
        modulosBase.forEach(key => {
            const btn = document.querySelector('.nav-item[data-page="' + key + '"]');
            if (!btn) return;
            const bloqueadoLiga = modulosAtivos[key] === false;
            const bloqueadoMnt  = Array.isArray(window.participanteModulosBloqueados) &&
                window.participanteModulosBloqueados.includes(key);
            if (bloqueadoLiga || bloqueadoMnt) {
                btn.style.opacity = '0.35';
                btn.style.filter  = 'grayscale(0.5)';
            } else {
                btn.style.opacity = '';
                btn.style.filter  = '';
            }
        });
    }

    sincronizarBloqueioManutencao(modulosBloqueados) {
        const modulosBase = ['extrato', 'rodadas'];
        modulosBase.forEach(key => {
            const btn = document.querySelector('.nav-item[data-page="' + key + '"]');
            if (!btn) return;
            const bloq = this.modulosAtivos?.[key] === false || modulosBloqueados.includes(key);
            if (bloq) { btn.style.opacity = '0.35'; btn.style.filter = 'grayscale(0.5)'; }
            else       { btn.style.opacity = '';    btn.style.filter = ''; }
        });
    }

    mostrarModalAguardeConfig(moduloId) {
        const nomesModulos = {
            'pontos-corridos': 'Pontos Corridos', 'mata-mata': 'Mata-Mata',
            'top10': 'TOP 10',   'melhor-mes': 'Melhor do Mês',
            'artilheiro': 'Artilheiro', 'luva-ouro': 'Luva de Ouro',
            'campinho': 'Meu Time da Rodada', 'resta-um': 'Resta Um'
        };
        const nome = nomesModulos[moduloId] || moduloId;
        const nomeEscapado = typeof window.escapeHtml === 'function' ? window.escapeHtml(nome) : nome;

        let modal = document.getElementById('modal-aguarde-config');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-aguarde-config';
            modal.className = 'fixed inset-0 flex items-center justify-center z-[99999999] px-4';
            modal.style.cssText = 'background:rgba(0,0,0,0.85);backdrop-filter:blur(8px)';

            const card = document.createElement('div');
            card.className = 'bg-gray-900 rounded-2xl p-6 max-w-xs w-full text-center border border-gray-700/50 shadow-2xl';
            card.innerHTML = [
                '<div class="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">',
                '  <span class="material-icons text-3xl text-amber-500">hourglass_empty</span>',
                '</div>',
                '<h3 id="aguarde-titulo" class="text-lg font-bold text-white mb-2" style="font-family:\'Russo One\',sans-serif;">' + nomeEscapado + '</h3>',
                '<p class="text-gray-400 text-sm mb-5">Aguarde o administrador<br>configurar este módulo</p>',
                '<button id="btn-aguarde-fechar" class="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors">Entendi</button>'
            ].join('');

            modal.appendChild(card);
            document.body.appendChild(modal);
            modal.querySelector('#btn-aguarde-fechar')?.addEventListener('click', () => {
                document.getElementById('modal-aguarde-config')?.remove();
            });
        } else {
            const titulo = modal.querySelector('#aguarde-titulo');
            if (titulo) titulo.textContent = nome;
            modal.classList.remove('hidden');
        }

        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); }, { once: true });
    }

    gerarModulosInlineHTML() {
        const modulosAtivos   = this.modulosAtivos || {};
        const isLigaEstreante = window.isLigaEstreante || false;
        const modulosBase     = ['extrato', 'ranking', 'rodadas'];
        const bloqMnt         = Array.isArray(window.participanteModulosBloqueados) ? window.participanteModulosBloqueados : [];

        const isAtivo = (k) => modulosBase.includes(k) || modulosAtivos[k] === true;
        const isEmMnt = (k) => {
            return (modulosBase.includes(k) && modulosAtivos[k] === false) || bloqMnt.includes(k);
        };

        const card = (moduleId, configKey, icon, label) => {
            if (isEmMnt(configKey)) {
                return '<div class="home-module-card manutencao" data-module="' + moduleId + '" data-disabled="true" data-disabled-message="O módulo ' + label + ' está em manutenção.">' +
                    '<span class="material-icons">' + icon + '</span>' +
                    '<span class="home-module-card-label">' + label + '</span>' +
                    '<span class="home-badge-aguarde" style="background:rgba(255,85,0,0.2);color:var(--app-primary)">Em manutenção</span></div>';
            }
            const aguarde = !isAtivo(configKey);
            return '<div class="home-module-card' + (aguarde ? ' aguarde' : '') + '" data-module="' + moduleId + '"' + (aguarde ? ' data-action="aguarde-config"' : '') + '>' +
                '<span class="material-icons">' + icon + '</span>' +
                '<span class="home-module-card-label">' + label + '</span>' +
                (aguarde ? '<span class="home-badge-aguarde">Aguarde</span>' : '') + '</div>';
        };

        const hallDaFama = isLigaEstreante ? '' :
            '<div class="home-module-card" data-module="historico"><span class="material-icons">history</span><span class="home-module-card-label">Hall da Fama</span></div>';

        return [
            '<div class="home-module-category">',
            '<div class="home-module-category-title"><span class="material-icons">emoji_events</span>Competições</div>',
            '<div class="home-module-grid">',
            '<div class="home-module-card" data-module="rodadas"><span class="material-icons">view_week</span><span class="home-module-card-label">Rodadas</span></div>',
            card('pontos-corridos', 'pontosCorridos', 'format_list_numbered', 'Pontos Corridos'),
            card('mata-mata',       'mataMata',       'military_tech',        'Mata-Mata'),
            card('top10',           'top10',          'leaderboard',          'TOP 10'),
            card('campinho',        'campinho',       'sports_soccer',        'Meu Time da Rodada'),
            card('resta-um',        'restaUm',        'person_off',           'Resta Um'),
            '</div></div>',
            '<div class="home-module-category">',
            '<div class="home-module-category-title"><span class="material-icons">workspace_premium</span>Prêmios &amp; Estatísticas</div>',
            '<div class="home-module-grid">',
            card('artilheiro', 'artilheiro',  'sports_soccer',   'Artilheiro'),
            card('luva-ouro',  'luvaOuro',    'sports_handball', 'Luva de Ouro'),
            card('capitao',    'capitaoLuxo', 'emoji_events',    'Capitão de Luxo'),
            card('melhor-mes', 'melhorMes',   'calendar_month',  'Melhor do Mês'),
            hallDaFama,
            '</div></div>',
            '<div class="home-module-category">',
            '<div class="home-module-category-title"><span class="material-icons">upcoming</span>Em Breve</div>',
            '<div class="home-module-grid">',
            '<div class="home-module-card" data-module="copa-times-sc"><span class="material-icons" style="color:var(--app-gold)">emoji_events</span><span class="home-module-card-label">Copa de Times SC</span><span class="home-badge-em-breve" style="background:rgba(255,215,0,0.2);color:var(--app-gold);border:1px solid var(--app-gold)">EM BREVE</span></div>',
            '<div class="home-module-card" data-module="bolao-copa" data-action="em-breve" style="opacity:0.4"><span class="material-icons">sports</span><span class="home-module-card-label">Bolão Copa</span></div>',
            '</div></div>'
        ].join('');
    }
}

const quickAccessBar = new QuickAccessBar();
window.quickAccessBar = quickAccessBar;
window.QuickBar       = quickAccessBar;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => quickAccessBar.inicializar());
} else {
    quickAccessBar.inicializar();
}

if (window.Log) Log.info('QUICK-BAR', '✅ v5.0 carregado (Raio X)');
