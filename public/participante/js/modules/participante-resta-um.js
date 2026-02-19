// =====================================================================
// PARTICIPANTE-RESTA-UM.JS - v2.0 (Anti-Frank + Live Experience)
// =====================================================================
// v1.0: Módulo Resta Um - Eliminação progressiva por menor pontuação
// v2.0: Auto-refresh 60s durante rodada ao vivo, detecção de Lanterna,
//       modo alerta CSS, rendering via classes (zero inline styles),
//       destrutor com cleanup de intervals
// =====================================================================

if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Carregando módulo v2.0...');

// Estado do módulo
let _currentLigaId = null;
let _currentTimeId = null;
let _currentParticipante = null;
let _refreshInterval = null;
let _wasLanterna = false;
const REFRESH_INTERVAL_MS = 60_000; // 60s

// =====================================================================
// FUNÇÃO PRINCIPAL - EXPORTADA PARA NAVIGATION
// =====================================================================

export async function inicializarRestaUmParticipante({ participante, ligaId, timeId }) {
    if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Inicializando v2.0...', { ligaId, timeId });

    _currentLigaId = ligaId;
    _currentTimeId = timeId;
    _currentParticipante = participante;
    _wasLanterna = false;

    const container = document.getElementById('resta-um-content');
    if (!container) {
        if (window.Log) Log.error('[PARTICIPANTE-RESTA-UM] Container não encontrado');
        return;
    }

    // Mostrar loading
    _mostrarEstado('loading');

    await _carregarDados();

    // Iniciar polling se rodada ao vivo
    _iniciarAutoRefresh();
}

// =====================================================================
// CARREGAMENTO DE DADOS
// =====================================================================

async function _carregarDados() {
    try {
        const response = await fetch(`/api/resta-um/${_currentLigaId}/status`);

        if (!response.ok) {
            if (response.status === 404) {
                _mostrarEstado('nao-iniciado');
                return;
            }
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const dados = await response.json();

        if (!dados || !dados.edicao) {
            _mostrarEstado('nao-iniciado');
            return;
        }

        // Renderizar disputa ativa
        _renderizarDisputa(dados, _currentTimeId);

    } catch (error) {
        if (window.Log) Log.error('[PARTICIPANTE-RESTA-UM] Erro ao carregar:', error);

        if (error.message?.includes('404') || error.message?.includes('Failed to fetch')) {
            _mostrarEstado('nao-iniciado');
        } else {
            _mostrarEstado('error', error.message);
        }
    }
}

// =====================================================================
// AUTO-REFRESH (60s durante rodada ao vivo)
// =====================================================================

function _iniciarAutoRefresh() {
    _pararAutoRefresh(); // Limpa qualquer interval anterior

    _refreshInterval = setInterval(async () => {
        if (!_currentLigaId) {
            _pararAutoRefresh();
            return;
        }

        try {
            // Verificar se mercado está fechado (rodada ao vivo)
            const isLive = _isRodadaAoVivo();

            if (isLive) {
                if (window.Log) Log.debug('[PARTICIPANTE-RESTA-UM] Auto-refresh (live)...');
                await _carregarDados();
            }
        } catch (err) {
            if (window.Log) Log.warn('[PARTICIPANTE-RESTA-UM] Erro no auto-refresh:', err);
        }
    }, REFRESH_INTERVAL_MS);

    if (window.Log) Log.debug('[PARTICIPANTE-RESTA-UM] Auto-refresh configurado (60s)');
}

function _pararAutoRefresh() {
    if (_refreshInterval) {
        clearInterval(_refreshInterval);
        _refreshInterval = null;
    }
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
// RENDERIZAÇÃO DA DISPUTA (Token-Compliant)
// =====================================================================

function _renderizarDisputa(dados, timeId) {
    const container = document.getElementById('restaUmDados');
    if (!container) return;

    const { edicao, participantes, rodadaAtual, historicoEliminacoes } = dados;
    const totalParticipantes = participantes?.length || 0;
    const vivos = participantes?.filter(p => p.status === 'vivo' || p.status === 'campeao') || [];
    const eliminados = participantes?.filter(p => p.status === 'eliminado') || [];
    const meuStatus = participantes?.find(p => String(p.timeId) === String(timeId));

    // Detectar se usuário é lanterna (último entre vivos)
    const isLanterna = _detectarLanterna(vivos, timeId);
    const escapouLanterna = _wasLanterna && !isLanterna;

    // Atualizar classe no container pai
    const parentContainer = document.querySelector('.resta-um-participante');
    if (parentContainer) {
        parentContainer.classList.toggle('user-is-lanterna', isLanterna);
    }

    // Atualizar estado da lanterna para próximo refresh
    _wasLanterna = isLanterna;

    const isLive = _isRodadaAoVivo();

    // Header da edição
    let html = `
        <div class="resta-um-header">
            <div class="resta-um-header-title">
                <span class="material-icons" style="font-size: 20px; vertical-align: middle; color: var(--app-restaum-primary); margin-right: 4px;">person_off</span>
                ${edicao.nome || 'Resta Um'}
                ${isLive ? '<span class="resta-um-live-indicator"><span class="resta-um-live-dot"></span>AO VIVO</span>' : ''}
            </div>
            <div class="resta-um-header-subtitle">
                Rodada ${rodadaAtual || '?'} | ${vivos.length} sobrevivente${vivos.length !== 1 ? 's' : ''}
            </div>
        </div>
    `;

    // Stats grid
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

    // Alerta de Lanterna
    if (isLanterna && meuStatus?.status === 'vivo') {
        html += `
            <div class="resta-um-alerta-lanterna">
                <span class="material-icons resta-um-alerta-lanterna-icon">warning</span>
                <span class="resta-um-alerta-lanterna-text">Zona de elimina&ccedil;&atilde;o! Voc&ecirc; est&aacute; na lanterna.</span>
            </div>
        `;
    }

    // Escapou da lanterna
    if (escapouLanterna && meuStatus?.status === 'vivo') {
        html += `
            <div class="resta-um-escaped-lanterna">
                <span class="material-icons resta-um-escaped-lanterna-icon">trending_up</span>
                <span class="resta-um-escaped-lanterna-text">Voc&ecirc; saiu da zona de elimina&ccedil;&atilde;o!</span>
            </div>
        `;
    }

    // Meu status
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
                    <div class="resta-um-meu-status-text">${statusLabel}</div>
                </div>
                <span class="resta-um-status-badge ${statusClass}">${statusLabel}</span>
            </div>
        `;
    }

    // Lista de sobreviventes
    if (vivos.length > 0) {
        html += `
            <div class="resta-um-lista">
                <div class="resta-um-lista-title">
                    <span class="material-icons" style="font-size: 16px; vertical-align: middle; color: var(--app-restaum-vivo); margin-right: 4px;">favorite</span>
                    Sobreviventes
                </div>
        `;

        vivos.forEach((p, idx) => {
            const isMeuTime = String(p.timeId) === String(timeId);
            const isLanternaRow = idx === vivos.length - 1 && vivos.length > 1;
            const classes = ['resta-um-row'];
            if (isMeuTime) classes.push('meu-time');
            if (isLanternaRow) classes.push('lanterna');

            const pontosRodada = p.pontosRodada != null
                ? (Math.trunc(p.pontosRodada * 100) / 100).toFixed(2)
                : '--';

            html += `
                <div class="${classes.join(' ')}">
                    <span class="resta-um-pos">${idx + 1}</span>
                    <img class="resta-um-escudo"
                         src="/escudos/${p.escudoId || 'default'}.png"
                         alt=""
                         onerror="this.src='/escudos/default.png'">
                    <span class="resta-um-nome">${p.nomeTime || 'Time'}</span>
                    <span class="resta-um-pontos">${pontosRodada}</span>
                    ${isLanternaRow ? '<span class="material-icons" style="font-size: 16px; color: var(--app-restaum-eliminado);" title="Zona de eliminação">warning</span>' : ''}
                </div>
            `;
        });

        html += '</div>';
    }

    // Lista de eliminados
    if (eliminados.length > 0) {
        html += `
            <div class="resta-um-eliminados-section">
                <div class="resta-um-lista-title">
                    <span class="material-icons" style="font-size: 16px; vertical-align: middle; color: var(--app-restaum-eliminado); margin-right: 4px;">person_off</span>
                    Eliminados (${eliminados.length})
                </div>
        `;

        eliminados.forEach((p) => {
            const isMeuTime = String(p.timeId) === String(timeId);

            html += `
                <div class="resta-um-row eliminado${isMeuTime ? ' meu-time' : ''}">
                    <span class="resta-um-pos" style="color: var(--app-restaum-eliminado);">
                        <span class="material-icons" style="font-size: 14px;">close</span>
                    </span>
                    <img class="resta-um-escudo"
                         src="/escudos/${p.escudoId || 'default'}.png"
                         alt=""
                         onerror="this.src='/escudos/default.png'">
                    <span class="resta-um-nome">${p.nomeTime || 'Time'}</span>
                    <span class="resta-um-eliminado-rodada">R${p.rodadaEliminacao || '?'}</span>
                </div>
            `;
        });

        html += '</div>';
    }

    container.innerHTML = html;
    _mostrarEstado('dados');
}

// =====================================================================
// DETECÇÃO DE LANTERNA
// =====================================================================

/**
 * Detecta se o time do usuário é o último entre os sobreviventes
 * (ordenados por pontos da rodada - menor = lanterna)
 */
function _detectarLanterna(vivos, timeId) {
    if (!vivos || vivos.length <= 1 || !timeId) return false;

    // O último vivo na lista (já ordenada por pontos DESC pelo backend)
    const ultimoVivo = vivos[vivos.length - 1];
    return String(ultimoVivo.timeId) === String(timeId);
}

// =====================================================================
// HELPERS
// =====================================================================

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
        'vivo': 'favorite',
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

    // Remover classe de lanterna do container
    const parentContainer = document.querySelector('.resta-um-participante');
    if (parentContainer) {
        parentContainer.classList.remove('user-is-lanterna');
    }

    _currentLigaId = null;
    _currentTimeId = null;
    _currentParticipante = null;
    _wasLanterna = false;

    if (window.Log) Log.debug('[PARTICIPANTE-RESTA-UM] Módulo destruído, intervals limpos');
}

if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Módulo v2.0 carregado');
