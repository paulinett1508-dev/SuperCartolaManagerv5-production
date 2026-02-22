/**
 * ADMIN LUVA DE OURO - Parametrizacao do Modulo
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Configurar premiacoes (1o, 2o, 3o lugar)
 * - Salvar configuracoes via API module-config
 *
 * @version 2.0.0
 */

class AdminLuvaOuro {
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
        const select = document.getElementById('loLigaSelect');
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
            console.error('[ADMIN-LO] Erro ao carregar ligas:', err);
        }
    }

    async onLigaChange() {
        const select = document.getElementById('loLigaSelect');
        this.ligaId = select?.value || null;

        if (!this.ligaId) {
            document.getElementById('loAdminContent').innerHTML = `
                <div class="lo-empty">
                    <span class="material-icons" style="font-size:3rem;opacity:0.3;">sports_mma</span>
                    <p>Selecione uma liga para parametrizar a Luva de Ouro</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD DE PARAMETRIZACAO
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('loAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="lo-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const res = await fetch(`/api/liga/${this.ligaId}/modulos/luva_ouro`);
            const data = res.ok ? await res.json() : {};

            this.config = data.config || {};
            this.wizard = data.wizard || data.regras_default?.wizard || null;

            this.renderDashboard(container, data);
        } catch (err) {
            console.error('[ADMIN-LO] Erro ao carregar config:', err);
            container.innerHTML = '<div class="lo-empty"><p style="color:var(--app-danger);">Erro ao carregar configuracao</p></div>';
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

        const isAtivo = config.ativo === true;
        const configuradoPor = config.configurado_por || '-';
        const temporada = config.temporada || new Date().getFullYear();

        container.innerHTML = `
            <!-- Status do Modulo -->
            <div class="lo-stats-grid">
                <div class="lo-stat">
                    <div class="lo-stat-value" style="color:${isAtivo ? 'var(--app-success)' : 'var(--app-text-muted)'};">
                        ${isAtivo ? 'Ativo' : 'Inativo'}
                    </div>
                    <div class="lo-stat-label">Status</div>
                </div>
                <div class="lo-stat">
                    <div class="lo-stat-value">${temporada}</div>
                    <div class="lo-stat-label">Temporada</div>
                </div>
                <div class="lo-stat">
                    <div class="lo-stat-value" style="font-size:var(--app-font-xs);word-break:break-all;">${configuradoPor}</div>
                    <div class="lo-stat-label">Configurado por</div>
                </div>
            </div>

            <!-- Formulario de Configuracao -->
            <div class="lo-card">
                <div class="lo-card-header">
                    <span class="lo-card-title">
                        <span class="material-icons">settings</span>
                        Premiacao
                    </span>
                </div>

                <div class="lo-form-section">Premiacao (R$)</div>
                <div class="lo-form-row">
                    <div>
                        <label>Luva de Ouro (1o lugar)</label>
                        <input type="number" id="loValorCampeao" value="${valorCampeao}" min="0" max="500" step="5">
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="loViceHabilitado" ${viceHabilitado ? 'checked' : ''}
                                   onchange="window.adminLuvaOuro.onToggleVice()"
                                   style="width:auto;margin:0;">
                            Vice (2o lugar)
                        </label>
                        <input type="number" id="loValorVice" value="${valorVice}" min="0" max="300" step="5"
                               ${!viceHabilitado ? 'disabled style="opacity:0.4;"' : ''}>
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="loTerceiroHabilitado" ${terceiroHabilitado ? 'checked' : ''}
                                   onchange="window.adminLuvaOuro.onToggleTerceiro()"
                                   style="width:auto;margin:0;">
                            Terceiro (3o lugar)
                        </label>
                        <input type="number" id="loValorTerceiro" value="${valorTerceiro}" min="0" max="200" step="5"
                               ${!terceiroHabilitado ? 'disabled style="opacity:0.4;"' : ''}>
                    </div>
                </div>

                <div style="display:flex;gap:var(--app-space-2);margin-top:var(--app-space-3);">
                    <button class="lo-btn lo-btn-salvar" onclick="window.adminLuvaOuro.salvarConfig()">
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
        const checkbox = document.getElementById('loViceHabilitado');
        const input = document.getElementById('loValorVice');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    onToggleTerceiro() {
        const checkbox = document.getElementById('loTerceiroHabilitado');
        const input = document.getElementById('loValorTerceiro');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    // ==========================================================================
    // SALVAR
    // ==========================================================================

    async salvarConfig() {
        const viceHabilitado = document.getElementById('loViceHabilitado')?.checked ?? true;
        const terceiroHabilitado = document.getElementById('loTerceiroHabilitado')?.checked ?? true;

        const wizard_respostas = {
            valor_campeao: parseFloat(document.getElementById('loValorCampeao')?.value) || 0,
            vice_habilitado: viceHabilitado,
            valor_vice: viceHabilitado ? (parseFloat(document.getElementById('loValorVice')?.value) || 0) : 0,
            terceiro_habilitado: terceiroHabilitado,
            valor_terceiro: terceiroHabilitado ? (parseFloat(document.getElementById('loValorTerceiro')?.value) || 0) : 0,
        };

        try {
            const res = await fetch(`/api/liga/${this.ligaId}/modulos/luva_ouro/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ wizard_respostas }),
            });

            const data = await res.json();

            if (data.sucesso) {
                if (window.SuperModal) SuperModal.toast.success('Configuracao da Luva de Ouro salva!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.erro || 'Erro ao salvar');
            }
        } catch (err) {
            console.error('[ADMIN-LO] Erro ao salvar config:', err);
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
const adminLuvaOuro = new AdminLuvaOuro();
window.adminLuvaOuro = adminLuvaOuro;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adminLuvaOuro.init());
} else {
    adminLuvaOuro.init();
}
