/**
 * MODULE LP ENGINE
 * ================
 * Exported function `injectModuleLP(config)` that creates and injects
 * a Landing Page block (Hero + accordions) before a module's content container.
 *
 * Used by all participant-app modules to provide a consistent LP experience.
 *
 * CSS dependency: /public/participante/css/module-lp.css
 *
 * NOTE: innerHTML is used intentionally for admin-sourced conteudo_html content.
 * This is consistent with the project-wide pattern (participante-artilheiro.js, etc.)
 * and is acceptable per project security guidelines (admin-controlled content only).
 */

/**
 * @typedef {Object} ModuleLPConfig
 * @property {string}   wrapperId                  - ID of the LP wrapper div to create
 * @property {string}   insertBefore               - ID of the anchor element (LP is inserted before it)
 * @property {string}   ligaId                     - Active liga ID
 * @property {string}   moduloKey                  - Module key for regras-modulos API (e.g. 'ranking_geral')
 * @property {string}   titulo                     - Hero title text
 * @property {string}   tagline                    - Hero tagline text
 * @property {string}   icon                       - Material Icons name for hero
 * @property {string}   colorClass                 - CSS color-scoping class (e.g. 'module-lp-artilheiro')
 * @property {string}   [premiacaoLabel]            - Label for premiacao accordion. Default: 'Premiação'
 * @property {string}   [premiacaoSource]           - 'regra' (default) or 'moduleconfig'
 * @property {Function} [premiacaoModuleConfigFn]   - async (ligaId) => htmlString, used when premiacaoSource='moduleconfig'
 * @property {boolean}  [showPremiacaoAccordion]    - Default true. Pass false to hide the premiacao accordion (e.g. Extrato)
 * @property {boolean}  [showComoFuncionaAccordion] - Default true. Pass false to hide the "Como Funciona" accordion (e.g. Raio-X)
 * @property {boolean}  [showCloseBtn]              - Default true. Pass false to hide the close (X) button in the hero.
 */

/**
 * Builds the LP HTML string using existing CSS classes from module-lp.css.
 * @param {ModuleLPConfig} config
 * @returns {string}
 */
function _buildLPHtml(config) {
    const {
        wrapperId,
        moduloKey,
        titulo,
        tagline,
        icon,
        colorClass,
        premiacaoLabel,
        showPremiacaoAccordion,
        showComoFuncionaAccordion,
        showCloseBtn,
    } = config;

    const labelPremio = premiacaoLabel || 'Premiação';
    const mostrarPremio = showPremiacaoAccordion !== false;
    const mostrarComoFunciona = showComoFuncionaAccordion !== false;
    const mostrarClose = showCloseBtn !== false;

    const closeBtnHtml = mostrarClose
        ? `<button class="module-lp-close-btn" aria-label="Fechar"><span class="material-icons">close</span></button>`
        : '';

    const comoFuncionaAccordionHtml = mostrarComoFunciona ? `
  <div class="module-lp-accordion" id="${wrapperId}-acc-como">
    <button class="module-lp-accordion-btn" aria-expanded="false">
      <div class="module-lp-accordion-btn-inner">
        <span class="material-icons">menu_book</span>
        <span class="module-lp-accordion-btn-label">Como Funciona</span>
      </div>
      <span class="material-icons module-lp-accordion-chevron">expand_more</span>
    </button>
    <div class="module-lp-accordion-body" id="lp-regras-body-${moduloKey}">
      <div class="module-lp-accordion-inner">
        <div class="lp-loading"><span class="material-icons lp-loading-icon">hourglass_empty</span></div>
      </div>
    </div>
  </div>` : '';

    const premiacaoAccordionHtml = mostrarPremio ? `
    <div class="module-lp-accordion" id="${wrapperId}-acc-prem">
      <button class="module-lp-accordion-btn" aria-expanded="false">
        <div class="module-lp-accordion-btn-inner">
          <span class="material-icons">emoji_events</span>
          <span class="module-lp-accordion-btn-label">${labelPremio}</span>
        </div>
        <span class="material-icons module-lp-accordion-chevron">expand_more</span>
      </button>
      <div class="module-lp-accordion-body" id="lp-premiacoes-body-${moduloKey}">
        <div class="module-lp-accordion-inner">
          <div class="lp-loading"><span class="material-icons lp-loading-icon">hourglass_empty</span></div>
        </div>
      </div>
    </div>` : '';

    return `
<div id="${wrapperId}" class="module-lp ${colorClass}">
  <div class="module-lp-strip">
    ${closeBtnHtml}
    <span class="material-icons module-lp-strip-icon">${icon}</span>
    <div class="module-lp-strip-text">
      <h1 class="module-lp-strip-title">${titulo}</h1>
      <p class="module-lp-strip-tagline">${tagline}</p>
    </div>
  </div>
  ${comoFuncionaAccordionHtml}
  ${premiacaoAccordionHtml}
</div>`;
}

/**
 * Initializes click listeners on all accordion buttons inside the LP wrapper.
 * Uses cloneNode(true) to safely replace buttons and avoid SPA listener leaks.
 * The CSS drives max-height animation via [aria-expanded="true"] ~ .module-lp-accordion-body,
 * so toggling aria-expanded on the button is sufficient.
 * @param {string} wrapperId
 */
function _initLPAccordions(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    wrapper.querySelectorAll('.module-lp-accordion-btn').forEach(btn => {
        // Clone to remove any previously attached listeners (SPA safety)
        const fresh = btn.cloneNode(true);
        btn.parentNode.replaceChild(fresh, btn);

        fresh.addEventListener('click', () => {
            const isOpen = fresh.getAttribute('aria-expanded') === 'true';
            fresh.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        });
    });
}

/**
 * Fetches "Como Funciona" content from regras-modulos API and renders into the body element.
 * @param {string} ligaId
 * @param {string} moduloKey
 */
function _fetchComoFunciona(ligaId, moduloKey) {
    const body = document.getElementById('lp-regras-body-' + moduloKey);
    if (!body) return;

    fetch('/api/regras-modulos/' + ligaId + '/' + moduloKey)
        .then(function(r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
        .then(function(data) {
            var inner = body.querySelector('.module-lp-accordion-inner');
            if (!inner) return;
            if (data && data.regra && data.regra.conteudo_html) {
                // admin-sourced HTML — acceptable per project pattern
                inner.innerHTML = '<div class="module-lp-regras-content">' + data.regra.conteudo_html + '</div>';
            } else {
                inner.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);">Regras ainda nao configuradas pelo organizador.</p>';
            }
        })
        .catch(function() {
            var inner = body.querySelector('.module-lp-accordion-inner');
            if (inner) {
                inner.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);">Nao foi possivel carregar as regras.</p>';
            }
        });
}

/**
 * Returns placeholder HTML shown when premiacao is not yet configured.
 * @returns {string}
 */
function _premiacaoPlaceholderHtml() {
    return '<div class="lp-premiacao-placeholder">'
        + '<span class="material-icons lp-premiacao-placeholder-icon">info_outline</span>'
        + 'Premiação definida pelo organizador da liga'
        + '</div>';
}

/**
 * Fallback: fetches premiacao from regras-modulos API (key: moduloKey + '_premiacao').
 * @param {string} ligaId
 * @param {string} moduloKey
 * @param {HTMLElement} inner - The .module-lp-accordion-inner element to render into
 * @returns {Promise<void>}
 */
function _fetchPremiacaoRegra(ligaId, moduloKey, inner) {
    return fetch('/api/regras-modulos/' + ligaId + '/' + moduloKey + '_premiacao')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (data && data.regra && data.regra.conteudo_html) {
                // admin-sourced HTML — acceptable per project pattern
                inner.innerHTML = '<div class="module-lp-premiacoes-content">' + data.regra.conteudo_html + '</div>';
            } else {
                inner.innerHTML = _premiacaoPlaceholderHtml();
            }
        })
        .catch(function() {
            inner.innerHTML = _premiacaoPlaceholderHtml();
        });
}

/**
 * Fetches and renders the Premiacao accordion content.
 * Handles both 'regra' and 'moduleconfig' sources with appropriate fallbacks.
 * @param {ModuleLPConfig} config
 * @returns {Promise<void>}
 */
async function _fetchPremiacao(config) {
    var ligaId = config.ligaId;
    var moduloKey = config.moduloKey;
    var premiacaoSource = config.premiacaoSource || 'regra';
    var premiacaoModuleConfigFn = config.premiacaoModuleConfigFn;

    var body = document.getElementById('lp-premiacoes-body-' + moduloKey);
    if (!body) return;

    var inner = body.querySelector('.module-lp-accordion-inner');
    if (!inner) return;

    if (premiacaoSource === 'moduleconfig' && typeof premiacaoModuleConfigFn === 'function') {
        try {
            var html = await premiacaoModuleConfigFn(ligaId);
            if (html && html.trim()) {
                // caller-provided HTML — acceptable per project pattern
                inner.innerHTML = html;
                return;
            }
            // Fallback to regra if moduleconfig returns empty
            await _fetchPremiacaoRegra(ligaId, moduloKey, inner);
        } catch (_err) {
            try {
                await _fetchPremiacaoRegra(ligaId, moduloKey, inner);
            } catch (_err2) {
                inner.innerHTML = _premiacaoPlaceholderHtml();
            }
        }
    } else {
        try {
            await _fetchPremiacaoRegra(ligaId, moduloKey, inner);
        } catch (_err) {
            inner.innerHTML = _premiacaoPlaceholderHtml();
        }
    }
}

/**
 * Injects a module Landing Page block (Hero + accordions) before a given DOM element.
 *
 * SPA-safe: if the wrapper already exists, re-initializes accordion listeners only
 * (does NOT re-inject HTML to avoid duplicate content on re-navigation).
 *
 * @param {ModuleLPConfig} config
 */
export function injectModuleLP(config) {
    var wrapperId = config.wrapperId;
    var insertBeforeId = config.insertBefore;
    var ligaId = config.ligaId;
    var moduloKey = config.moduloKey;
    var showPremiacaoAccordion = config.showPremiacaoAccordion !== false;
    var showComoFuncionaAccordion = config.showComoFuncionaAccordion !== false;

    if (!moduloKey) {
        console.warn('[module-lp-engine] moduloKey is required');
        return;
    }

    // --- SPA Guard: idempotency ---
    var existing = document.getElementById(wrapperId);
    if (existing) {
        // Already in DOM — re-attach accordion listeners and bail
        _initLPAccordions(wrapperId);
        return;
    }

    // --- Find anchor element ---
    var anchor = document.getElementById(insertBeforeId);
    if (!anchor) {
        console.warn('[module-lp-engine] insertBefore element #' + insertBeforeId + ' not found in DOM');
        return;
    }

    // --- Inject HTML before anchor ---
    anchor.insertAdjacentHTML('beforebegin', _buildLPHtml(config));

    // --- Init accordion click listeners ---
    _initLPAccordions(wrapperId);

    // --- Init close button ---
    var wrapper = document.getElementById(wrapperId);
    var closeBtn = wrapper ? wrapper.querySelector('.module-lp-close-btn') : null;
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            if (wrapper) wrapper.style.display = 'none';
            // Hide the sibling divider (immediately follows the wrapper)
            var divider = wrapper && wrapper.nextElementSibling;
            if (divider && divider.classList.contains('module-lp-divider')) {
                divider.style.display = 'none';
            }
        });
    }

    // --- Eager data fetch: Como Funciona ---
    if (showComoFuncionaAccordion) {
        _fetchComoFunciona(ligaId, moduloKey);
    }

    // --- Eager data fetch: Premiacao ---
    if (showPremiacaoAccordion) {
        _fetchPremiacao(config);
    }
}
