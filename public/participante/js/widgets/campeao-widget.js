/**
 * CAMPEAO WIDGET - "Celebracao de Campeao"
 * ==========================================
 * Widget reutilizavel para celebrar campeoes de modulos.
 * Exibe overlay com trofeu, confetti e dados do campeao.
 * Tambem fornece banner inline para uso dentro de modulos.
 *
 * @version 1.0.0
 *
 * Modulos suportados:
 * - artilheiro, luva, capitao, mata-mata, pontos-corridos
 * - resta-um, copa
 *
 * Uso (celebracao full-screen):
 *   window.CampeaoWidget.celebrar({
 *       modulo: 'artilheiro',
 *       titulo: 'CAMPEAO ARTILHEIRO',
 *       subtitulo: 'Temporada 2026',
 *       nome: 'Neymar FC',
 *       time: 'Mengo do Ney',
 *       escudo: '/escudos/262.png',
 *       valor: 42,
 *       valorLabel: 'gols',
 *   });
 *
 * Uso (banner inline):
 *   const html = window.CampeaoWidget.renderBanner({
 *       modulo: 'artilheiro',
 *       titulo: 'CAMPEAO ARTILHEIRO',
 *       nome: 'Neymar FC',
 *       valor: 42,
 *       valorLabel: 'gols',
 *       consolidado: true,
 *   });
 *   container.innerHTML = html;
 */

if (window.Log) Log.info("[CAMPEAO-WIDGET] Widget v1.0 carregando...");

// ============================================
// ESTADO
// ============================================
const CWState = {
    isVisible: false,
    overlayEl: null,
    autoDismissTimer: null,
    confettiFired: false,
};

const CW_AUTO_DISMISS_MS = 12000; // 12 segundos
const CW_SEEN_PREFIX = "cw-seen-";

// ============================================
// ESCAPEHTML (local, padrao do projeto)
// ============================================
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// CELEBRACAO (full-screen overlay)
// ============================================

/**
 * Exibe celebracao de campeao com overlay + confetti.
 * @param {Object} config
 * @param {string} config.modulo - Tipo do modulo (artilheiro, luva, capitao, etc.)
 * @param {string} config.titulo - Titulo principal (ex: "CAMPEAO ARTILHEIRO")
 * @param {string} [config.subtitulo] - Subtitulo (ex: "Temporada 2026")
 * @param {string} config.nome - Nome do campeao
 * @param {string} [config.time] - Nome do time
 * @param {string} [config.escudo] - URL do escudo
 * @param {number|string} [config.valor] - Valor destaque (gols, pontos, etc.)
 * @param {string} [config.valorLabel] - Label do valor (ex: "gols", "pts")
 * @param {string} [config.seenKey] - Chave para evitar exibir novamente
 * @param {boolean} [config.forceShow=false] - Ignorar seenKey
 */
function celebrar(config) {
    if (!config || !config.titulo || !config.nome) {
        if (window.Log) Log.warn("[CAMPEAO-WIDGET] Config invalida para celebrar()");
        return;
    }

    // Verificar se ja viu
    if (config.seenKey && !config.forceShow) {
        const seen = localStorage.getItem(CW_SEEN_PREFIX + config.seenKey);
        if (seen) {
            if (window.Log) Log.debug("[CAMPEAO-WIDGET] Celebracao ja vista:", config.seenKey);
            return;
        }
    }

    // Fechar overlay anterior se existir
    if (CWState.isVisible) {
        esconderCelebracao(false);
    }

    const modClass = config.modulo ? `cw--${config.modulo}` : '';

    // Criar overlay
    const overlay = document.createElement('div');
    overlay.id = 'cw-overlay';
    overlay.className = `cw-overlay ${modClass}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', config.titulo);

    overlay.innerHTML = `
        <div class="cw-celebration">
            <button class="cw-close" aria-label="Fechar">
                <span class="material-icons" style="font-size: 18px;">close</span>
            </button>

            <div class="cw-trophy-area">
                <div class="cw-trophy-glow">
                    <span class="material-icons cw-trophy-icon">emoji_events</span>
                </div>
                <div class="cw-title">${escapeHtml(config.titulo)}</div>
                ${config.subtitulo ? `<div class="cw-subtitle">${escapeHtml(config.subtitulo)}</div>` : ''}
            </div>

            <div class="cw-champion-info">
                <div class="cw-champion-card">
                    <div class="cw-champion-left">
                        ${config.escudo ? `<img class="cw-champion-escudo" src="${escapeHtml(config.escudo)}" alt="Escudo" onerror="this.src='/escudos/default.png'" />` : ''}
                        <div class="cw-champion-details">
                            <div class="cw-champion-label">Campeao</div>
                            <div class="cw-champion-name">${escapeHtml(config.nome)}</div>
                            ${config.time ? `<div class="cw-champion-team">${escapeHtml(config.time)}</div>` : ''}
                        </div>
                    </div>
                    ${config.valor != null ? `
                        <div class="cw-champion-value">
                            <div class="cw-value-number">${escapeHtml(String(config.valor))}</div>
                            ${config.valorLabel ? `<div class="cw-value-label">${escapeHtml(config.valorLabel)}</div>` : ''}
                        </div>
                    ` : ''}
                </div>

                <div style="text-align: center;">
                    <span class="cw-status">
                        <span class="material-icons">check_circle</span>
                        CONSOLIDADO
                    </span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    CWState.overlayEl = overlay;

    // Fechar ao clicar fora ou no botao
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.cw-close')) {
            esconderCelebracao(true);
        }
    });

    // Fechar com ESC
    const onEsc = (e) => {
        if (e.key === 'Escape' && CWState.isVisible) {
            esconderCelebracao(true);
            document.removeEventListener('keydown', onEsc);
        }
    };
    document.addEventListener('keydown', onEsc);

    // Animar entrada (proximo frame)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('cw-visible');
            CWState.isVisible = true;

            // Disparar confetti
            dispararConfetti(config.modulo);
        });
    });

    // Marcar como visto
    if (config.seenKey) {
        localStorage.setItem(CW_SEEN_PREFIX + config.seenKey, Date.now().toString());
    }

    // Auto-dismiss
    CWState.autoDismissTimer = setTimeout(() => {
        esconderCelebracao(true);
    }, CW_AUTO_DISMISS_MS);

    if (window.Log) Log.info("[CAMPEAO-WIDGET] Celebracao exibida:", config.titulo);
}

/**
 * Esconde a celebracao
 * @param {boolean} animate - Se deve animar a saida
 */
function esconderCelebracao(animate = true) {
    if (CWState.autoDismissTimer) {
        clearTimeout(CWState.autoDismissTimer);
        CWState.autoDismissTimer = null;
    }

    const overlay = CWState.overlayEl || document.getElementById('cw-overlay');
    if (!overlay) return;

    if (animate) {
        overlay.classList.remove('cw-visible');
        setTimeout(() => {
            overlay.remove();
        }, 400);
    } else {
        overlay.remove();
    }

    CWState.isVisible = false;
    CWState.overlayEl = null;
    CWState.confettiFired = false;
}

// ============================================
// CONFETTI
// ============================================

/**
 * Dispara confetti tematizado pelo modulo
 */
function dispararConfetti(modulo) {
    if (CWState.confettiFired) return;
    if (typeof window.confetti !== 'function') {
        if (window.Log) Log.warn("[CAMPEAO-WIDGET] canvas-confetti nao disponivel");
        return;
    }

    CWState.confettiFired = true;

    // Cores por modulo
    const cores = {
        artilheiro: ['#22c55e', '#16a34a', '#ffffff'],
        luva:       ['#ffd700', '#f59e0b', '#ffffff'],
        capitao:    ['#8b5cf6', '#7c3aed', '#ffffff'],
        'mata-mata':['#FF5500', '#e8472b', '#ffffff'],
        'pontos-corridos': ['#FF5500', '#e8472b', '#ffffff'],
        'resta-um': ['#ffd700', '#f43f5e', '#ffffff'],
        copa:       ['#ffd700', '#FF5500', '#ffffff'],
    };

    const confettiColors = cores[modulo] || ['#ffd700', '#FF5500', '#ffffff'];

    // Burst central
    window.confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 },
        colors: confettiColors,
        disableForReducedMotion: true,
    });

    // Burst laterais com delay
    setTimeout(() => {
        window.confetti({
            particleCount: 40,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.6 },
            colors: confettiColors,
            disableForReducedMotion: true,
        });
        window.confetti({
            particleCount: 40,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.6 },
            colors: confettiColors,
            disableForReducedMotion: true,
        });
    }, 250);
}

// ============================================
// BANNER (inline, dentro de modulos)
// ============================================

/**
 * Retorna HTML de banner de campeao para inserir em modulos.
 * @param {Object} config
 * @param {string} config.modulo - Tipo do modulo
 * @param {string} config.titulo - Titulo (ex: "CAMPEAO ARTILHEIRO")
 * @param {string} config.nome - Nome do campeao
 * @param {string} [config.time] - Nome do time
 * @param {number|string} [config.valor] - Valor destaque
 * @param {string} [config.valorLabel] - Label do valor
 * @param {boolean} [config.consolidado=true] - Mostra badge CONSOLIDADO
 * @returns {string} HTML do banner
 */
function renderBanner(config) {
    if (!config || !config.titulo || !config.nome) return '';

    const modClass = config.modulo ? `cw--${config.modulo}` : '';
    const consolidado = config.consolidado !== false;

    return `
        <div class="cw-banner ${modClass}">
            <div class="cw-banner-header">
                <div class="cw-banner-title">
                    <span class="material-icons">emoji_events</span>
                    <span class="cw-banner-badge">${escapeHtml(config.titulo)}</span>
                </div>
                ${consolidado ? `
                    <span class="cw-banner-status">
                        <span class="material-icons">check_circle</span>
                        CONSOLIDADO
                    </span>
                ` : ''}
            </div>
            <div class="cw-banner-body">
                <div>
                    <div class="cw-banner-champion-label">Campeao</div>
                    <div class="cw-banner-champion-name">${escapeHtml(config.nome)}</div>
                    ${config.time ? `<div class="cw-banner-champion-team">${escapeHtml(config.time)}</div>` : ''}
                </div>
                ${config.valor != null ? `
                    <div class="cw-banner-value">
                        <div class="cw-banner-value-number">${escapeHtml(String(config.valor))}</div>
                        ${config.valorLabel ? `<div class="cw-banner-value-label">${escapeHtml(config.valorLabel)}</div>` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================
// RESET (limpar seenKeys por temporada)
// ============================================

/**
 * Limpa celebracoes vistas para uma nova temporada.
 * @param {number} temporada - Ano da nova temporada
 */
function resetTemporada(temporada) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CW_SEEN_PREFIX)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    if (window.Log) Log.info("[CAMPEAO-WIDGET] Reset temporada: removidas", keysToRemove.length, "celebracoes vistas");
}

// ============================================
// API PUBLICA
// ============================================
window.CampeaoWidget = {
    celebrar,
    esconder: esconderCelebracao,
    renderBanner,
    resetTemporada,
};

if (window.Log) Log.info("[CAMPEAO-WIDGET] Widget v1.0 pronto");

export default { celebrar, esconderCelebracao, renderBanner, resetTemporada };
