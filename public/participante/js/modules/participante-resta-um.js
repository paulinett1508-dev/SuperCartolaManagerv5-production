// =====================================================================
// PARTICIPANTE-RESTA-UM.JS - v3.0 (Parciais ao Vivo + Modo PROJETADO)
// =====================================================================
// v1.0: Módulo Resta Um - Eliminação progressiva por menor pontuação
// v2.0: Auto-refresh 60s, detecção de Lanterna, modo alerta CSS
// v3.0: Integração parciais ao vivo → ranking PROJETADO durante rodada
//       Quando status_mercado=2: sobrepõe pontosRodada com scores parciais,
//       reordena ranking, destaca zona de perigo projetada (âmbar).
//       Quando mercado abre: consolida automaticamente com dados reais.
// =====================================================================

import * as ParciaisModule from './participante-rodada-parcial.js';

if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Carregando módulo v3.0...');

// Estado do módulo
let _currentLigaId = null;
let _currentTimeId = null;
let _currentParticipante = null;
let _refreshInterval = null;
let _wasLanterna = false;
let _isLiveMode = false;
let _parciaisIniciados = false;
const REFRESH_INTERVAL_MS = 60_000;    // 60s normal
const REFRESH_INTERVAL_LIVE_MS = 30_000; // 30s ao vivo

// =====================================================================
// FUNÇÃO PRINCIPAL - EXPORTADA PARA NAVIGATION
// =====================================================================

export async function inicializarRestaUmParticipante({ participante, ligaId, timeId }) {
    if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Inicializando v2.0...', { ligaId, timeId });

    _currentLigaId = ligaId;
    _currentTimeId = timeId;
    _currentParticipante = participante;
    _wasLanterna = false;

    // ✅ LP: Init acordeons + carregar regras e premiações (non-blocking via regras-modulos)
    _initLPAccordions('restaum-lp-wrapper');
    _lpCarregarComoFunciona(ligaId, 'resta_um', 'lp-regras-body-resta-um');
    _lpCarregarPremiacoesDynamic(ligaId, 'resta_um_premiacao', 'lp-premiacoes-body-resta-um');

    const container = document.getElementById('resta-um-content');
    if (!container) {
        if (window.Log) Log.error('[PARTICIPANTE-RESTA-UM] Container não encontrado');
        return;
    }

    // Mostrar loading
    _mostrarEstado('loading');

    await _carregarDados();
    // _iniciarAutoRefresh() já foi chamado dentro de _carregarDados via _reiniciarAutoRefresh
    // quando live mode é detectado — não chamar novamente para evitar double interval
    if (!_refreshInterval) {
        _iniciarAutoRefresh();
    }
}

// =====================================================================
// CARREGAMENTO DE DADOS
// =====================================================================

async function _carregarDados() {
    try {
        // Buscar dados do Resta Um + status do mercado em paralelo
        const [response, isLive] = await Promise.all([
            fetch(`/api/resta-um/${_currentLigaId}/status`),
            _detectarRodadaAoVivo(),
        ]);

        if (!response.ok) {
            if (response.status === 404) { _mostrarEstado('nao-iniciado'); return; }
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const dados = await response.json();
        if (!dados?.edicao) { _mostrarEstado('nao-iniciado'); return; }

        dados.isLive = isLive;

        // Modo PROJETADO: edição ativa + rodada ao vivo → sobrepor com parciais
        if (isLive && dados.edicao?.status === 'em_andamento') {
            const parciais = await _buscarParciais();
            if (parciais?.length) {
                _mergeParciaisNaDados(dados, parciais);
                dados.isProjetado = true;
            }
        }

        // Ajustar intervalo de refresh se mudou de estado
        if (isLive !== _isLiveMode) {
            _isLiveMode = isLive;
            _reiniciarAutoRefresh();
        }

        _renderizarDisputa(dados, _currentTimeId);
        if (dados.premiacao) _lpRenderRestaUmPremiacoes(dados.premiacao);

    } catch (error) {
        if (window.Log) Log.error('[PARTICIPANTE-RESTA-UM] Erro ao carregar:', error);
        if (error.message?.includes('404') || error.message?.includes('Failed to fetch')) {
            _mostrarEstado('nao-iniciado');
        } else {
            _mostrarEstado('error', error.message);
        }
    }
}

async function _detectarRodadaAoVivo() {
    // Ground truth: usa game-status real + calendário de janelas
    // Evita falso-positivo quando status_mercado=2 mas jogos já terminaram
    if (window.isRodadaRealmenteAoVivo) {
        return window.isRodadaRealmenteAoVivo();
    }
    // Fallback conservador se helper ainda não carregou
    if (window.cartolaState) {
        return window.cartolaState.statusMercado === 2 ||
               window.cartolaState.mercadoFechado === true;
    }
    return false;
}

async function _buscarParciais() {
    try {
        if (!_parciaisIniciados) {
            await ParciaisModule.inicializarParciais(_currentLigaId, _currentTimeId);
            _parciaisIniciados = true;
        }
        const dados = await ParciaisModule.carregarParciais();
        return dados?.participantes || null;
    } catch (err) {
        if (window.Log) Log.warn('[PARTICIPANTE-RESTA-UM] Parciais indisponível:', err?.message);
        return null;
    }
}

function _mergeParciaisNaDados(dados, parciais) {
    const map = new Map(parciais.map(p => [String(p.timeId), p.pontos || 0]));
    dados.participantes?.forEach(p => {
        const pts = map.get(String(p.timeId));
        if (pts !== undefined) p.pontosRodada = pts;
    });
}

// =====================================================================
// AUTO-REFRESH (60s durante rodada ao vivo)
// =====================================================================

function _iniciarAutoRefresh() {
    _pararAutoRefresh();
    if (!document.getElementById('resta-um-content')) return;

    const interval = _isLiveMode ? REFRESH_INTERVAL_LIVE_MS : REFRESH_INTERVAL_MS;

    _refreshInterval = setInterval(async () => {
        if (!_currentLigaId) { _pararAutoRefresh(); return; }
        try {
            await _carregarDados();
        } catch (err) {
            if (window.Log) Log.warn('[PARTICIPANTE-RESTA-UM] Erro no auto-refresh:', err);
        }
    }, interval);

    if (window.Log) Log.debug(`[PARTICIPANTE-RESTA-UM] Auto-refresh: ${interval / 1000}s (${_isLiveMode ? 'ao vivo' : 'normal'})`);
}

function _pararAutoRefresh() {
    if (_refreshInterval) {
        clearInterval(_refreshInterval);
        _refreshInterval = null;
    }
}

function _reiniciarAutoRefresh() {
    _pararAutoRefresh();
    _iniciarAutoRefresh();
}

/**
 * Detecta se há rodada ao vivo com base no estado global do app
 */
function _isRodadaAoVivo() {
    // Verificar estado global do mercado (set by participante-utils.js or similar)
    if (window.cartolaState) {
        return window.cartolaState.mercadoFechado === true ||
               window.cartolaState.statusMercado === 2;
    }

    // Fallback: verificar se há indicador de live no DOM
    const liveIndicator = document.querySelector('.live-indicator, .ao-vivo-badge, [data-live="true"]');
    return !!liveIndicator;
}

// =====================================================================
// CONTROLE DE ESTADOS
// =====================================================================

function _mostrarEstado(estado, mensagem) {
    const ids = ['restaUmLoading', 'restaUmNaoIniciado', 'restaUmEmpty', 'restaUmError', 'restaUmDados'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    switch (estado) {
        case 'loading':
            _show('restaUmLoading');
            break;
        case 'nao-iniciado':
            _show('restaUmNaoIniciado');
            break;
        case 'empty':
            _show('restaUmEmpty');
            break;
        case 'error':
            _show('restaUmError');
            if (mensagem) {
                const msgEl = document.getElementById('restaUmErrorMsg');
                if (msgEl) msgEl.textContent = mensagem;
            }
            break;
        case 'dados':
            _show('restaUmDados');
            break;
    }
}

function _show(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
}

// =====================================================================
// RENDERIZAÇÃO DA DISPUTA v3.0 (Hero Card + Progress + Zona de Perigo)
// =====================================================================

function _formatPontos(valor) {
    const num = parseFloat(valor) || 0;
    const truncado = Math.trunc(num * 100) / 100;
    return truncado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _renderizarDisputa(dados, timeId) {
    const container = document.getElementById('restaUmDados');
    if (!container) return;

    const { edicao, participantes, rodadaAtual } = dados;
    const totalParticipantes = participantes?.length || 0;
    const qtdPerigo = edicao?.eliminadosPorRodada || 1;

    // Ordenar vivos por pontosRodada DESC (líder primeiro), acumulado como desempate
    const vivos = (participantes?.filter(p => p.status === 'vivo' || p.status === 'campeao') || [])
        .sort((a, b) => {
            const diff = (b.pontosRodada || 0) - (a.pontosRodada || 0);
            return diff !== 0 ? diff : (b.pontosAcumulados || 0) - (a.pontosAcumulados || 0);
        });

    // Ordenar eliminados por rodadaEliminacao DESC (mais recente primeiro)
    const eliminados = (participantes?.filter(p => p.status === 'eliminado') || [])
        .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

    const meuStatus = participantes?.find(p => String(p.timeId) === String(timeId));

    // Zona de perigo: últimos min(qtdPerigo, vivos.length-1) da lista
    const qtdPerigoDisplay = Math.min(qtdPerigo, Math.max(0, vivos.length - 1));
    const isNaZonaPerigo = qtdPerigoDisplay > 0 &&
        vivos.slice(-qtdPerigoDisplay).some(v => String(v.timeId) === String(timeId));

    const escapouLanterna = _wasLanterna && !isNaZonaPerigo;
    _wasLanterna = isNaZonaPerigo;

    const parentContainer = document.querySelector('.resta-um-participante');
    if (parentContainer) {
        parentContainer.classList.toggle('user-is-lanterna', isNaZonaPerigo);
    }

    const isLive = dados.isLive || _isRodadaAoVivo();
    const isProjetado = dados.isProjetado === true;
    const lider = vivos[0];
    const isCampeao = lider?.status === 'campeao';

    // ── HEADER ──────────────────────────────────────────────────────
    let html = `
        <div class="resta-um-header">
            <div class="resta-um-header-title">
                <span class="material-icons" style="font-size: 20px; vertical-align: middle; color: var(--app-restaum-primary); margin-right: 4px;">person_off</span>
                ${escapeHtml(edicao.nome || 'Resta Um')}
                ${isLive ? '<span class="resta-um-live-indicator"><span class="resta-um-live-dot"></span>AO VIVO</span>' : ''}
            </div>
            <div class="resta-um-header-subtitle">
                Rodada ${rodadaAtual || edicao.rodadaInicial || '?'} | ${vivos.length} sobrevivente${vivos.length !== 1 ? 's' : ''}
                ${isProjetado ? '&nbsp;<span class="ru-badge-projetado">PROJETADO</span>' : ''}
            </div>
        </div>
    `;

    // ── BARRA DE PROGRESSO ──────────────────────────────────────────
    const pct = totalParticipantes > 0 ? Math.round(vivos.length / totalParticipantes * 100) : 0;
    html += `
        <div class="ru-progress-wrap">
            <div class="ru-progress-bar">
                <div class="ru-progress-fill" style="width: ${pct}%"></div>
            </div>
            <div class="ru-progress-label">
                <span class="ru-progress-vivos">${vivos.length} sobrevivente${vivos.length !== 1 ? 's' : ''}</span>
                <span class="ru-progress-total">${eliminados.length} eliminado${eliminados.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
    `;

    // ── STATS ────────────────────────────────────────────────────────
    html += `
        <div class="resta-um-stats">
            <div class="resta-um-stat">
                <div class="resta-um-stat-value" style="color: var(--app-restaum-vivo);">${vivos.length}</div>
                <div class="resta-um-stat-label">Vivos</div>
            </div>
            <div class="resta-um-stat">
                <div class="resta-um-stat-value" style="color: var(--app-restaum-eliminado);">${eliminados.length}</div>
                <div class="resta-um-stat-label">Eliminados</div>
            </div>
            <div class="resta-um-stat">
                <div class="resta-um-stat-value">${totalParticipantes}</div>
                <div class="resta-um-stat-label">Total</div>
            </div>
        </div>
    `;

    // ── ALERTAS ──────────────────────────────────────────────────────
    if (isNaZonaPerigo && meuStatus?.status === 'vivo') {
        html += `
            <div class="resta-um-alerta-lanterna">
                <span class="material-icons resta-um-alerta-lanterna-icon">warning</span>
                <span class="resta-um-alerta-lanterna-text">Zona de elimina&ccedil;&atilde;o! Voc&ecirc; est&aacute; sendo eliminado.</span>
            </div>
        `;
    }
    if (escapouLanterna && meuStatus?.status === 'vivo') {
        html += `
            <div class="resta-um-escaped-lanterna">
                <span class="material-icons resta-um-escaped-lanterna-icon">trending_up</span>
                <span class="resta-um-escaped-lanterna-text">Voc&ecirc; saiu da zona de elimina&ccedil;&atilde;o!</span>
            </div>
        `;
    }

    // ── MEU STATUS ───────────────────────────────────────────────────
    if (meuStatus) {
        const statusClass = meuStatus.status || 'vivo';
        const statusLabel = _getStatusLabel(statusClass);
        const statusIcon = _getStatusIcon(statusClass);
        const statusColor = _getStatusColor(statusClass);
        html += `
            <div class="resta-um-meu-status ${statusClass}">
                <span class="material-icons resta-um-meu-status-icon" style="color: ${statusColor};">${statusIcon}</span>
                <div style="flex: 1;">
                    <div class="resta-um-meu-status-label">Seu status</div>
                </div>
                <span class="resta-um-status-badge ${statusClass}">${statusLabel}</span>
            </div>
        `;
    }

    // ── HERO CARD — LÍDER ────────────────────────────────────────────
    if (lider) {
        const isMeuTimeLider = String(lider.timeId) === String(timeId);
        const pontosLider = lider.pontosRodada != null ? _formatPontos(lider.pontosRodada) : '--';
        const ptsClass = isProjetado ? 'ru-lider-pts ru-pts-projetado' : 'ru-lider-pts';
        html += `
            <div class="ru-lider-card${isMeuTimeLider ? ' meu-time' : ''}${isProjetado ? ' projetado' : ''}">
                <div class="ru-lider-topo">
                    <span class="ru-lider-badge${isProjetado ? ' projetado' : ''}">
                        <span class="material-icons" style="font-size: 13px; vertical-align: middle; margin-right: 2px;">emoji_events</span>
                        ${isCampeao ? 'Campe&atilde;o' : 'The Best Survivor'}
                    </span>
                    <span class="ru-lider-pos${isProjetado ? ' projetado' : ''}">1&deg;</span>
                </div>
                <div class="ru-lider-body">
                    <img class="ru-lider-escudo"
                         src="/escudos/${lider.escudoId || 'default'}.png"
                         alt=""
                         onerror="this.src='/escudos/default.png'">
                    <div class="ru-lider-info">
                        <div class="ru-lider-cartoleiro">${escapeHtml(lider.nomeCartoleiro || lider.nome_cartola || lider.nome || 'N/D')}</div>
                        <div class="ru-lider-time">${escapeHtml(lider.nomeTime || '')}</div>
                    </div>
                    <div class="${ptsClass}">${pontosLider}</div>
                </div>
            </div>
        `;
    }

    // ── LISTA UNIFICADA ──────────────────────────────────────────────
    html += `<div class="resta-um-lista">`;

    const vivosRestantes = vivos.slice(1); // líder já está no hero card
    const idxZonaInicio = vivosRestantes.length - qtdPerigoDisplay;

    if (vivosRestantes.length > 0) {
        vivosRestantes.forEach((p, idx) => {
            const pos = idx + 2;
            const isMeuTime = String(p.timeId) === String(timeId);
            const isNaZona = idx >= idxZonaInicio;

            // Separador antes da zona de perigo (só quando há vivos fora da zona)
            if (idx === idxZonaInicio && idxZonaInicio > 0) {
                html += `
                    <div class="ru-zona-perigo${isProjetado ? ' projetado' : ''}">
                        <span class="material-icons" style="font-size: 13px; margin-right: 4px;">warning</span>
                        Zona de Elimina&ccedil;&atilde;o${isProjetado ? ' &bull; PROJETADO' : ''}
                    </div>
                `;
            }

            const pontosStr = p.pontosRodada != null ? _formatPontos(p.pontosRodada) : '--';
            const ptsClass = isProjetado ? 'ru-pts-projetado' : 'ru-pts-sobrevivente';
            const classes = ['resta-um-row'];
            if (isMeuTime) classes.push('meu-time');
            if (isNaZona) classes.push('lanterna');

            html += `
                <div class="${classes.join(' ')}">
                    <span class="resta-um-pos">${pos}</span>
                    <img class="resta-um-escudo"
                         src="/escudos/${p.escudoId || 'default'}.png"
                         alt=""
                         onerror="this.src='/escudos/default.png'">
                    <div class="resta-um-nome">
                        <div>${escapeHtml(p.nomeCartoleiro || p.nome_cartola || p.nome || 'N/D')}</div>
                        <div class="ru-nome-time">${escapeHtml(p.nomeTime || '')}</div>
                    </div>
                    ${isNaZona
                        ? `<span class="ru-tag-eliminado"><span class="material-icons" style="font-size: 11px; vertical-align: middle;">person_off</span>&nbsp;ELIMINADO</span>`
                        : `<span class="resta-um-pontos ${ptsClass}">${pontosStr}</span>`
                    }
                </div>
            `;
        });
    }

    // ── DIVIDER + ELIMINADOS ─────────────────────────────────────────
    if (eliminados.length > 0) {
        html += `
            <div class="ru-elim-divider">
                <span class="ru-elim-divider-line"></span>
                <span class="ru-elim-divider-label">ELIMINADOS</span>
                <span class="ru-elim-divider-line"></span>
            </div>
        `;
        eliminados.forEach((p) => {
            const isMeuTime = String(p.timeId) === String(timeId);
            html += `
                <div class="resta-um-row eliminado${isMeuTime ? ' meu-time' : ''}">
                    <span class="resta-um-pos resta-um-pos-elim">
                        <span class="material-icons" style="font-size: 14px;">close</span>
                    </span>
                    <img class="resta-um-escudo"
                         src="/escudos/${p.escudoId || 'default'}.png"
                         alt=""
                         onerror="this.src='/escudos/default.png'">
                    <div class="resta-um-nome">
                        <div>${escapeHtml(p.nomeCartoleiro || p.nome_cartola || p.nome || 'N/D')}</div>
                        <div class="ru-nome-time">${escapeHtml(p.nomeTime || '')}</div>
                    </div>
                    <span class="resta-um-eliminado-rodada">R${p.rodadaEliminacao || '?'}</span>
                </div>
            `;
        });
    }

    html += `</div>`; // .resta-um-lista

    container.innerHTML = html;
    _mostrarEstado('dados');
}

// =====================================================================
// DETECÇÃO DE LANTERNA
// =====================================================================

/**
 * Detecta se o time do usuário é o último entre os sobreviventes
 * (vivos já ordenados por pontosRodada DESC — último = menor pontuação)
 */
function _detectarLanterna(vivos, timeId) {
    if (!vivos || vivos.length <= 1 || !timeId) return false;
    const ultimoVivo = vivos[vivos.length - 1];
    return String(ultimoVivo.timeId) === String(timeId);
}

// =====================================================================
// HELPERS
// =====================================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _getStatusLabel(status) {
    const labels = {
        'vivo': 'Sobrevivente',
        'zona_perigo': 'Zona de Perigo',
        'eliminado': 'Eliminado',
        'campeao': 'Campe\u00e3o',
    };
    return labels[status] || status;
}

function _getStatusIcon(status) {
    const icons = {
        'vivo': 'shield',
        'zona_perigo': 'warning',
        'eliminado': 'person_off',
        'campeao': 'emoji_events',
    };
    return icons[status] || 'help';
}

function _getStatusColor(status) {
    const colors = {
        'vivo': 'var(--app-restaum-vivo)',
        'zona_perigo': 'var(--app-restaum-perigo)',
        'eliminado': 'var(--app-restaum-eliminado)',
        'campeao': 'var(--app-restaum-campeao)',
    };
    return colors[status] || 'var(--app-text-muted)';
}

// =====================================================================
// DESTRUTOR (chamado quando navega para outro módulo)
// =====================================================================

export function destruirRestaUmParticipante() {
    _pararAutoRefresh();

    const parentContainer = document.querySelector('.resta-um-participante');
    if (parentContainer) {
        parentContainer.classList.remove('user-is-lanterna');
    }

    _currentLigaId = null;
    _currentTimeId = null;
    _currentParticipante = null;
    _wasLanterna = false;
    _isLiveMode = false;
    _parciaisIniciados = false;

    if (window.Log) Log.debug('[PARTICIPANTE-RESTA-UM] Módulo destruído, intervals limpos');
}

if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Módulo v2.0 carregado');

// =====================================================================
// MODULE LP — Landing Page Utils (Resta Um)
// =====================================================================

/** Carrega "Como Funciona" da API regras-modulos (admin editável) */
function _lpCarregarComoFunciona(ligaId, moduloKey, bodyId) {
    const body = document.getElementById(bodyId);
    if (!body || !ligaId) return;
    fetch(`/api/regras-modulos/${ligaId}/${moduloKey}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (data?.regra?.conteudo_html) {
                body.innerHTML = `<div class="module-lp-regras-content">${data.regra.conteudo_html}</div>`;
            } else {
                body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);">Regras ainda nao configuradas pelo admin.</p>';
            }
        })
        .catch(() => {
            body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);">Nao foi possivel carregar as regras.</p>';
        });
}

function _initLPAccordions(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.querySelectorAll('.module-lp-accordion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!isOpen));
        });
    });
}

function _lpFormatCurrency(val) {
    const n = parseFloat(val) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


/**
 * Fallback: carrega texto descritivo de regras-modulos (exibido até dados reais do status chegarem).
 * Se _carregarDados encontrar dados.premiacao, _lpRenderRestaUmPremiacoes sobrescreve.
 */
function _lpCarregarPremiacoesDynamic(ligaId, moduloKey, bodyId) {
    const body = document.getElementById(bodyId);
    if (!body || !ligaId) return;
    fetch(`/api/regras-modulos/${ligaId}/${moduloKey}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (data?.regra?.conteudo_html) {
                body.innerHTML = `<div class="module-lp-premiacoes-content">${data.regra.conteudo_html}</div>`;
            } else {
                body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);text-align:center;">Premiacoes ainda nao configuradas pelo admin.</p>';
            }
        })
        .catch(() => { body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);text-align:center;">Nao foi possivel carregar as premiacoes.</p>'; });
}

/**
 * Render premiações com valores reais do RestaUmCache (sobrescreve fallback de regras-modulos).
 * Respects viceHabilitado/terceiroHabilitado flags.
 */
function _lpRenderRestaUmPremiacoes(premiacao) {
    const body = document.getElementById('lp-premiacoes-body-resta-um');
    if (!body || !premiacao) return;

    let html = '';
    if (premiacao.campeao) {
        html += `<div class="module-lp-premiacoes-item">
            <span class="module-lp-premiacoes-pos pos-1">Campeao</span>
            <span class="module-lp-premiacoes-val">${_lpFormatCurrency(premiacao.campeao)}</span>
        </div>`;
    }
    if (premiacao.viceHabilitado && premiacao.vice) {
        html += `<div class="module-lp-premiacoes-item">
            <span class="module-lp-premiacoes-pos pos-2">Vice</span>
            <span class="module-lp-premiacoes-val">${_lpFormatCurrency(premiacao.vice)}</span>
        </div>`;
    }
    if (premiacao.terceiroHabilitado && premiacao.terceiro) {
        html += `<div class="module-lp-premiacoes-item">
            <span class="module-lp-premiacoes-pos pos-3">Terceiro</span>
            <span class="module-lp-premiacoes-val">${_lpFormatCurrency(premiacao.terceiro)}</span>
        </div>`;
    }
    if (html) {
        body.innerHTML = `<div class="module-lp-premiacoes-grid">${html}</div>`;
    }
}
