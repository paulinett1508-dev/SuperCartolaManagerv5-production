/**
 * ADMIN ARTILHEIRO CAMPEAO - Parametrizacao do Modulo
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Configurar premiacoes (1o, 2o, 3o lugar)
 * - Definir criterio de ranking (saldo_gols ou gols_pro)
 * - Salvar configuracoes via API module-config
 *
 * @version 2.0.0
 */

class AdminArtilheiro {
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
        const select = document.getElementById('acLigaSelect');
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
            console.error('[ADMIN-AC] Erro ao carregar ligas:', err);
        }
    }

    async onLigaChange() {
        const select = document.getElementById('acLigaSelect');
        this.ligaId = select?.value || null;

        if (!this.ligaId) {
            document.getElementById('acAdminContent').innerHTML = `
                <div class="ac-empty">
                    <span class="material-icons" style="font-size:3rem;opacity:0.3;">military_tech</span>
                    <p>Selecione uma liga para parametrizar o Artilheiro Campeao</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD DE PARAMETRIZACAO
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('acAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="ac-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const res = await fetch(`/api/liga/${this.ligaId}/modulos/artilheiro`);
            const data = res.ok ? await res.json() : {};

            this.config = data.config || {};
            this.wizard = data.wizard || data.regras_default?.wizard || null;

            this.renderDashboard(container, data);
        } catch (err) {
            console.error('[ADMIN-AC] Erro ao carregar config:', err);
            container.innerHTML = '<div class="ac-empty"><p style="color:var(--app-danger);">Erro ao carregar configuracao</p></div>';
        }
    }

    renderDashboard(container, data) {
        const config = this.config;
        const respostas = config.wizard_respostas || {};
        const perguntas = this.wizard?.perguntas || [];

        // Extrair valores atuais ou defaults do wizard
        const valorCampeao = respostas.valor_campeao ?? this._getDefault(perguntas, 'valor_campeao');
        const viceHabilitado = respostas.vice_habilitado ?? this._getDefault(perguntas, 'vice_habilitado');
        const valorVice = respostas.valor_vice ?? this._getDefault(perguntas, 'valor_vice');
        const terceiroHabilitado = respostas.terceiro_habilitado ?? this._getDefault(perguntas, 'terceiro_habilitado');
        const valorTerceiro = respostas.valor_terceiro ?? this._getDefault(perguntas, 'valor_terceiro');
        const criterioRanking = respostas.criterio_ranking ?? this._getDefault(perguntas, 'criterio_ranking');

        const isAtivo = config.ativo === true;
        const configuradoPor = config.configurado_por || '-';
        const temporada = config.temporada || new Date().getFullYear();

        container.innerHTML = `
            <!-- Status do Modulo -->
            <div class="ac-stats-grid">
                <div class="ac-stat">
                    <div class="ac-stat-value" style="color:${isAtivo ? 'var(--app-success)' : 'var(--app-text-muted)'};">
                        ${isAtivo ? 'Ativo' : 'Inativo'}
                    </div>
                    <div class="ac-stat-label">Status</div>
                </div>
                <div class="ac-stat">
                    <div class="ac-stat-value">${temporada}</div>
                    <div class="ac-stat-label">Temporada</div>
                </div>
                <div class="ac-stat">
                    <div class="ac-stat-value" style="font-size:var(--app-font-xs);word-break:break-all;">${configuradoPor}</div>
                    <div class="ac-stat-label">Configurado por</div>
                </div>
            </div>

            <!-- Formulario de Configuracao -->
            <div class="ac-card">
                <div class="ac-card-header">
                    <span class="ac-card-title">
                        <span class="material-icons">settings</span>
                        Premiacao
                    </span>
                </div>

                <div class="ac-form-section">Premiacao (R$)</div>
                <div class="ac-form-row">
                    <div>
                        <label>Campeao (1o lugar)</label>
                        <input type="number" id="acValorCampeao" value="${valorCampeao}" min="0" max="500" step="5">
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="acViceHabilitado" ${viceHabilitado ? 'checked' : ''}
                                   onchange="window.adminArtilheiro.onToggleVice()"
                                   style="width:auto;margin:0;">
                            Vice (2o lugar)
                        </label>
                        <input type="number" id="acValorVice" value="${valorVice}" min="0" max="300" step="5"
                               ${!viceHabilitado ? 'disabled style="opacity:0.4;"' : ''}>
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="acTerceiroHabilitado" ${terceiroHabilitado ? 'checked' : ''}
                                   onchange="window.adminArtilheiro.onToggleTerceiro()"
                                   style="width:auto;margin:0;">
                            Terceiro (3o lugar)
                        </label>
                        <input type="number" id="acValorTerceiro" value="${valorTerceiro}" min="0" max="200" step="5"
                               ${!terceiroHabilitado ? 'disabled style="opacity:0.4;"' : ''}>
                    </div>
                </div>

                <div class="ac-form-section">Regras</div>
                <div class="ac-form-row">
                    <div>
                        <label>Criterio do Ranking</label>
                        <select id="acCriterioRanking">
                            <option value="saldo_gols" ${criterioRanking === 'saldo_gols' ? 'selected' : ''}>Saldo de Gols (G - GC)</option>
                            <option value="gols_pro" ${criterioRanking === 'gols_pro' ? 'selected' : ''}>Apenas Gols Marcados</option>
                        </select>
                    </div>
                </div>

                <div style="display:flex;gap:var(--app-space-2);margin-top:var(--app-space-3);">
                    <button class="ac-btn ac-btn-salvar" onclick="window.adminArtilheiro.salvarConfig()">
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
        const checkbox = document.getElementById('acViceHabilitado');
        const input = document.getElementById('acValorVice');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    onToggleTerceiro() {
        const checkbox = document.getElementById('acTerceiroHabilitado');
        const input = document.getElementById('acValorTerceiro');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    // ==========================================================================
    // SALVAR
    // ==========================================================================

    async salvarConfig() {
        const viceHabilitado = document.getElementById('acViceHabilitado')?.checked ?? true;
        const terceiroHabilitado = document.getElementById('acTerceiroHabilitado')?.checked ?? true;

        const wizard_respostas = {
            valor_campeao: parseFloat(document.getElementById('acValorCampeao')?.value) || 0,
            vice_habilitado: viceHabilitado,
            valor_vice: viceHabilitado ? (parseFloat(document.getElementById('acValorVice')?.value) || 0) : 0,
            terceiro_habilitado: terceiroHabilitado,
            valor_terceiro: terceiroHabilitado ? (parseFloat(document.getElementById('acValorTerceiro')?.value) || 0) : 0,
            criterio_ranking: document.getElementById('acCriterioRanking')?.value || 'saldo_gols',
        };

        try {
            const res = await fetch(`/api/liga/${this.ligaId}/modulos/artilheiro/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ wizard_respostas }),
            });

            const data = await res.json();

            if (data.sucesso) {
                if (window.SuperModal) SuperModal.toast.success('Configuracao do Artilheiro salva!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.erro || 'Erro ao salvar');
            }
        } catch (err) {
            console.error('[ADMIN-AC] Erro ao salvar config:', err);
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
const adminArtilheiro = new AdminArtilheiro();
window.adminArtilheiro = adminArtilheiro;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adminArtilheiro.init());
} else {
    adminArtilheiro.init();
}
