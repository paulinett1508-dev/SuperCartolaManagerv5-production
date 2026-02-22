/**
 * ADMIN CAPITAO DE LUXO - Parametrizacao do Modulo
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Configurar premiacoes (1o, 2o, 3o lugar)
 * - Habilitar/desabilitar bonus de rodada
 * - Salvar configuracoes via API module-config
 *
 * @version 2.0.0
 */

class AdminCapitao {
    constructor() {
        this.ligaId = null;
        this.ligas = [];
        this.config = null;
        this.wizard = null;
    }

    // ==========================================================================
    // INICIALIZACAO
    // ==========================================================================

    async init() {
        await this.carregarLigas();
    }

    async carregarLigas() {
        const select = document.getElementById('clLigaSelect');
        if (!select) return;

        try {
            const res = await fetch('/api/ligas');
            const ligas = await res.json();
            this.ligas = Array.isArray(ligas)
                ? ligas.filter(l => l.ativa !== false && l.status !== 'aposentada')
                : [];

            select.innerHTML = '<option value="">Selecione uma liga...</option>';
            this.ligas.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l._id;
                opt.textContent = l.nome || l.name || `Liga ${l._id}`;
                select.appendChild(opt);
            });
        } catch (err) {
            console.error('[ADMIN-CL] Erro ao carregar ligas:', err);
        }
    }

    async onLigaChange() {
        const select = document.getElementById('clLigaSelect');
        this.ligaId = select?.value || null;

        if (!this.ligaId) {
            document.getElementById('clAdminContent').innerHTML = `
                <div class="cl-empty">
                    <span class="material-icons" style="font-size:3rem;opacity:0.3;">shield</span>
                    <p>Selecione uma liga para parametrizar o Capitao de Luxo</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD DE PARAMETRIZACAO
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('clAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="cl-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const res = await fetch(`/api/liga/${this.ligaId}/modulos/capitao_luxo`);
            const data = res.ok ? await res.json() : {};

            this.config = data.config || {};
            this.wizard = data.wizard || data.regras_default?.wizard || null;

            this.renderDashboard(container, data);
        } catch (err) {
            console.error('[ADMIN-CL] Erro ao carregar config:', err);
            container.innerHTML = '<div class="cl-empty"><p style="color:var(--app-danger);">Erro ao carregar configuracao</p></div>';
        }
    }

    renderDashboard(container, data) {
        const config = this.config;
        const respostas = config.wizard_respostas || {};
        const perguntas = this.wizard?.perguntas || [];

        const valorCampeao = respostas.valor_campeao ?? this._getDefault(perguntas, 'valor_campeao');
        const viceHabilitado = respostas.vice_habilitado ?? this._getDefault(perguntas, 'vice_habilitado');
        const valorVice = respostas.valor_vice ?? this._getDefault(perguntas, 'valor_vice');
        const terceiroHabilitado = respostas.terceiro_habilitado ?? this._getDefault(perguntas, 'terceiro_habilitado');
        const valorTerceiro = respostas.valor_terceiro ?? this._getDefault(perguntas, 'valor_terceiro');
        const bonusRodada = respostas.bonus_rodada ?? this._getDefault(perguntas, 'bonus_rodada');

        const isAtivo = config.ativo === true;
        const configuradoPor = config.configurado_por || '-';
        const temporada = config.temporada || new Date().getFullYear();

        container.innerHTML = `
            <!-- Status do Modulo -->
            <div class="cl-stats-grid">
                <div class="cl-stat">
                    <div class="cl-stat-value" style="color:${isAtivo ? 'var(--app-success)' : 'var(--app-text-muted)'};">
                        ${isAtivo ? 'Ativo' : 'Inativo'}
                    </div>
                    <div class="cl-stat-label">Status</div>
                </div>
                <div class="cl-stat">
                    <div class="cl-stat-value">${temporada}</div>
                    <div class="cl-stat-label">Temporada</div>
                </div>
                <div class="cl-stat">
                    <div class="cl-stat-value" style="font-size:var(--app-font-xs);word-break:break-all;">${configuradoPor}</div>
                    <div class="cl-stat-label">Configurado por</div>
                </div>
            </div>

            <!-- Formulario de Configuracao -->
            <div class="cl-card">
                <div class="cl-card-header">
                    <span class="cl-card-title">
                        <span class="material-icons">settings</span>
                        Premiacao
                    </span>
                </div>

                <div class="cl-form-section">Premiacao (R$)</div>
                <div class="cl-form-row">
                    <div>
                        <label>Capitao de Luxo (1o lugar)</label>
                        <input type="number" id="clValorCampeao" value="${valorCampeao}" min="0" max="500" step="5">
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="clViceHabilitado" ${viceHabilitado ? 'checked' : ''}
                                   onchange="window.adminCapitao.onToggleVice()"
                                   style="width:auto;margin:0;">
                            Vice (2o lugar)
                        </label>
                        <input type="number" id="clValorVice" value="${valorVice}" min="0" max="300" step="5"
                               ${!viceHabilitado ? 'disabled style="opacity:0.4;"' : ''}>
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="clTerceiroHabilitado" ${terceiroHabilitado ? 'checked' : ''}
                                   onchange="window.adminCapitao.onToggleTerceiro()"
                                   style="width:auto;margin:0;">
                            Terceiro (3o lugar)
                        </label>
                        <input type="number" id="clValorTerceiro" value="${valorTerceiro}" min="0" max="200" step="5"
                               ${!terceiroHabilitado ? 'disabled style="opacity:0.4;"' : ''}>
                    </div>
                </div>

                <div class="cl-form-section">Regras</div>
                <div class="cl-form-row">
                    <div class="cl-form-checkbox">
                        <input type="checkbox" id="clBonusRodada" ${bonusRodada ? 'checked' : ''}>
                        <span>Premiar melhor capitao de cada rodada</span>
                    </div>
                </div>

                <div style="display:flex;gap:var(--app-space-2);margin-top:var(--app-space-3);">
                    <button class="cl-btn cl-btn-salvar" onclick="window.adminCapitao.salvarConfig()">
                        <span class="material-icons">save</span>
                        Salvar Configuracoes
                    </button>
                </div>
            </div>
        `;
    }

    // ==========================================================================
    // TOGGLES
    // ==========================================================================

    onToggleVice() {
        const checkbox = document.getElementById('clViceHabilitado');
        const input = document.getElementById('clValorVice');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    onToggleTerceiro() {
        const checkbox = document.getElementById('clTerceiroHabilitado');
        const input = document.getElementById('clValorTerceiro');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    // ==========================================================================
    // SALVAR
    // ==========================================================================

    async salvarConfig() {
        const viceHabilitado = document.getElementById('clViceHabilitado')?.checked ?? true;
        const terceiroHabilitado = document.getElementById('clTerceiroHabilitado')?.checked ?? true;

        const wizard_respostas = {
            valor_campeao: parseFloat(document.getElementById('clValorCampeao')?.value) || 0,
            vice_habilitado: viceHabilitado,
            valor_vice: viceHabilitado ? (parseFloat(document.getElementById('clValorVice')?.value) || 0) : 0,
            terceiro_habilitado: terceiroHabilitado,
            valor_terceiro: terceiroHabilitado ? (parseFloat(document.getElementById('clValorTerceiro')?.value) || 0) : 0,
            bonus_rodada: document.getElementById('clBonusRodada')?.checked ?? false,
        };

        try {
            const res = await fetch(`/api/liga/${this.ligaId}/modulos/capitao_luxo/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ wizard_respostas }),
            });

            const data = await res.json();

            if (data.sucesso) {
                if (window.SuperModal) SuperModal.toast.success('Configuracao do Capitao de Luxo salva!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.erro || 'Erro ao salvar');
            }
        } catch (err) {
            console.error('[ADMIN-CL] Erro ao salvar config:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
    }

    // ==========================================================================
    // HELPERS
    // ==========================================================================

    _getDefault(perguntas, id) {
        const p = perguntas.find(q => q.id === id);
        return p?.default ?? null;
    }
}

// Instanciar e inicializar
const adminCapitao = new AdminCapitao();
window.adminCapitao = adminCapitao;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adminCapitao.init());
} else {
    adminCapitao.init();
}
