// =====================================================================
// PARTICIPANTE-RESTA-UM.JS - v1.0
// =====================================================================
// v1.0: Módulo Resta Um - Eliminação progressiva por menor pontuação
//       Busca estado da disputa e renderiza ranking de sobreviventes
// =====================================================================

if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Carregando módulo v1.0...');

// Estado do módulo
let _currentLigaId = null;
let _currentTimeId = null;
let _currentParticipante = null;

// =====================================================================
// FUNÇÃO PRINCIPAL - EXPORTADA PARA NAVIGATION
// =====================================================================

export async function inicializarRestaUmParticipante({ participante, ligaId, timeId }) {
    if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Inicializando v1.0...', { ligaId, timeId });

    _currentLigaId = ligaId;
    _currentTimeId = timeId;
    _currentParticipante = participante;

    const container = document.getElementById('resta-um-content');
    if (!container) {
        if (window.Log) Log.error('[PARTICIPANTE-RESTA-UM] Container não encontrado');
        return;
    }

    // Mostrar loading
    _mostrarEstado('loading');

    try {
        // Buscar dados da disputa
        const response = await fetch(`/api/resta-um/${ligaId}/status`);

        if (!response.ok) {
            if (response.status === 404) {
                // Módulo não configurado ou sem edição ativa
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
        _renderizarDisputa(dados, timeId);

    } catch (error) {
        if (window.Log) Log.error('[PARTICIPANTE-RESTA-UM] Erro ao carregar:', error);

        // Se a API ainda não existe, mostrar estado "não iniciado"
        if (error.message?.includes('404') || error.message?.includes('Failed to fetch')) {
            _mostrarEstado('nao-iniciado');
        } else {
            _mostrarEstado('error', error.message);
        }
    }
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
// RENDERIZAÇÃO DA DISPUTA
// =====================================================================

function _renderizarDisputa(dados, timeId) {
    const container = document.getElementById('restaUmDados');
    if (!container) return;

    const { edicao, participantes, rodadaAtual, eliminadosDaRodada } = dados;
    const totalParticipantes = participantes?.length || 0;
    const vivos = participantes?.filter(p => p.status === 'vivo') || [];
    const eliminados = participantes?.filter(p => p.status === 'eliminado') || [];
    const meuStatus = participantes?.find(p => String(p.timeId) === String(timeId));

    // Header da edição
    let html = `
        <div class="resta-um-header">
            <div class="resta-um-header-title">
                <span class="material-icons" style="font-size: 20px; vertical-align: middle; color: var(--resta-um-primary); margin-right: 4px;">person_off</span>
                ${edicao.nome || 'Resta Um'}
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
                <div class="resta-um-stat-value" style="color: var(--resta-um-vivo);">${vivos.length}</div>
                <div class="resta-um-stat-label">Vivos</div>
            </div>
            <div class="resta-um-stat">
                <div class="resta-um-stat-value" style="color: var(--resta-um-eliminado);">${eliminados.length}</div>
                <div class="resta-um-stat-label">Eliminados</div>
            </div>
            <div class="resta-um-stat">
                <div class="resta-um-stat-value">${totalParticipantes}</div>
                <div class="resta-um-stat-label">Total</div>
            </div>
        </div>
    `;

    // Meu status
    if (meuStatus) {
        const statusClass = meuStatus.status || 'vivo';
        const statusLabel = _getStatusLabel(statusClass);
        const statusIcon = _getStatusIcon(statusClass);

        html += `
            <div class="resta-um-meu-status ${statusClass}">
                <span class="material-icons" style="font-size: 28px; color: ${_getStatusColor(statusClass)};">${statusIcon}</span>
                <div style="flex: 1;">
                    <div style="font-size: 12px; color: var(--app-text-muted); margin-bottom: 2px;">Seu status</div>
                    <div style="font-size: 15px; font-weight: 600; color: var(--app-text-primary);">${statusLabel}</div>
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
                    <span class="material-icons" style="font-size: 16px; vertical-align: middle; color: var(--resta-um-vivo); margin-right: 4px;">favorite</span>
                    Sobreviventes
                </div>
        `;

        vivos.forEach((p, idx) => {
            const isMeuTime = String(p.timeId) === String(timeId);
            const isLanterna = idx === vivos.length - 1 && vivos.length > 1;
            const classes = ['resta-um-row'];
            if (isMeuTime) classes.push('meu-time');
            if (isLanterna) classes.push('lanterna');

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
                    ${isLanterna ? '<span class="material-icons" style="font-size: 16px; color: var(--resta-um-eliminado);" title="Zona de eliminação">warning</span>' : ''}
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
                    <span class="material-icons" style="font-size: 16px; vertical-align: middle; color: var(--resta-um-eliminado); margin-right: 4px;">person_off</span>
                    Eliminados (${eliminados.length})
                </div>
        `;

        eliminados.forEach((p, idx) => {
            const isMeuTime = String(p.timeId) === String(timeId);

            html += `
                <div class="resta-um-row eliminado${isMeuTime ? ' meu-time' : ''}">
                    <span class="resta-um-pos" style="color: var(--resta-um-eliminado);">
                        <span class="material-icons" style="font-size: 14px;">close</span>
                    </span>
                    <img class="resta-um-escudo"
                         src="/escudos/${p.escudoId || 'default'}.png"
                         alt=""
                         onerror="this.src='/escudos/default.png'">
                    <span class="resta-um-nome">${p.nomeTime || 'Time'}</span>
                    <span style="font-size: 10px; color: var(--app-text-dim);">R${p.rodadaEliminacao || '?'}</span>
                </div>
            `;
        });

        html += '</div>';
    }

    container.innerHTML = html;
    _mostrarEstado('dados');
}

// =====================================================================
// HELPERS
// =====================================================================

function _getStatusLabel(status) {
    const labels = {
        'vivo': 'Sobrevivente',
        'zona_perigo': 'Zona de Perigo',
        'eliminado': 'Eliminado',
        'campeao': 'Campeão',
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
        'vivo': 'var(--resta-um-vivo)',
        'zona_perigo': 'var(--resta-um-perigo)',
        'eliminado': 'var(--resta-um-eliminado)',
        'campeao': 'var(--resta-um-campeao)',
    };
    return colors[status] || 'var(--app-text-muted)';
}

// =====================================================================
// DESTRUTOR (chamado quando navega para outro módulo)
// =====================================================================

export function destruirRestaUmParticipante() {
    _currentLigaId = null;
    _currentTimeId = null;
    _currentParticipante = null;
    if (window.Log) Log.debug('[PARTICIPANTE-RESTA-UM] Módulo destruído');
}

if (window.Log) Log.info('[PARTICIPANTE-RESTA-UM] Módulo v1.0 carregado');
