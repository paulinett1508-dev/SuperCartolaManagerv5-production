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
        this.consolidando = false;
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

    async renderDashboard(container, data) {
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

        // Buscar ranking consolidado para exibir no dashboard
        let rankingHtml = '';
        let ultimaRodada = '-';
        let ultimaAtualizacao = '-';
        let totalParticipantes = 0;
        try {
            const rankRes = await fetch(`/api/capitao/${this.ligaId}/ranking?temporada=${temporada}`);
            const rankData = rankRes.ok ? await rankRes.json() : {};
            if (rankData.success && rankData.ranking?.length > 0) {
                const ranking = rankData.ranking;
                totalParticipantes = ranking.length;
                // Última rodada = maior rodada no histórico do 1o colocado
                const historico = ranking[0]?.historico_rodadas || [];
                ultimaRodada = historico.length > 0 ? Math.max(...historico.map(h => h.rodada)) : '-';
                rankingHtml = this._renderRankingPreview(ranking);
            }
        } catch (e) {
            console.warn('[ADMIN-CL] Erro ao buscar ranking:', e);
        }

        // Buscar rodada atual do mercado
        let rodadaAtual = '-';
        let mercadoAberto = true;
        try {
            const mRes = await fetch('/api/cartola/mercado/status');
            if (mRes.ok) {
                const mData = await mRes.json();
                rodadaAtual = mData.rodada_atual || '-';
                mercadoAberto = mData.status_mercado === 1;
            }
        } catch (e) { /* silencioso */ }

        // Calcular rodada sugerida para consolidação
        const rodadaSugerida = mercadoAberto && typeof rodadaAtual === 'number'
            ? rodadaAtual - 1
            : rodadaAtual;
        const precisaConsolidar = typeof ultimaRodada === 'number' && typeof rodadaSugerida === 'number' && ultimaRodada < rodadaSugerida;

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
                    <div class="cl-stat-value" style="color:${precisaConsolidar ? 'var(--app-warning)' : 'var(--app-success)'};">R${ultimaRodada}</div>
                    <div class="cl-stat-label">Consolidado ate</div>
                </div>
                <div class="cl-stat">
                    <div class="cl-stat-value">${totalParticipantes}</div>
                    <div class="cl-stat-label">Participantes</div>
                </div>
            </div>

            <!-- Consolidacao -->
            <div class="cl-card">
                <div class="cl-card-header">
                    <span class="cl-card-title">
                        <span class="material-icons">update</span>
                        Consolidacao
                    </span>
                    ${precisaConsolidar ? '<span style="font-size:var(--app-font-xs);color:var(--app-warning);display:flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">warning</span> Pendente</span>' : '<span style="font-size:var(--app-font-xs);color:var(--app-success);display:flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">check_circle</span> Em dia</span>'}
                </div>

                <div style="display:flex;align-items:center;gap:var(--app-space-3);flex-wrap:wrap;">
                    <div>
                        <label style="font-size:var(--app-font-xs);color:var(--app-text-muted);display:block;margin-bottom:4px;">Consolidar ate rodada</label>
                        <input type="number" id="clRodadaFinal" value="${rodadaSugerida}" min="1" max="38"
                               style="width:80px;padding:0.5rem;background:var(--app-bg);color:white;border:1px solid var(--app-border);border-radius:var(--app-radius-md);font-family:var(--app-font-mono);font-size:var(--app-font-sm);">
                    </div>
                    <div style="padding-top:18px;">
                        <button class="cl-btn cl-btn-primary" id="clBtnConsolidar" onclick="window.adminCapitao.consolidar()">
                            <span class="material-icons">sync</span>
                            Consolidar Ranking
                        </button>
                    </div>
                    <div style="padding-top:18px;font-size:var(--app-font-xs);color:var(--app-text-muted);">
                        Mercado: ${mercadoAberto ? 'Aberto' : 'Fechado'} | Rodada API: ${rodadaAtual}
                    </div>
                </div>
                <div id="clConsolidacaoStatus" style="margin-top:var(--app-space-2);"></div>
            </div>

            <!-- Ranking Preview -->
            <div class="cl-card">
                <div class="cl-card-header">
                    <span class="cl-card-title">
                        <span class="material-icons">leaderboard</span>
                        Ranking Atual
                    </span>
                    <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">Top 10 de ${totalParticipantes}</span>
                </div>
                <div id="clRankingPreview">
                    ${rankingHtml || '<div class="cl-empty" style="padding:var(--app-space-3);"><p>Nenhum dado consolidado ainda</p></div>'}
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
    // CONSOLIDACAO
    // ==========================================================================

    async consolidar() {
        if (this.consolidando) return;

        const rodadaFinal = parseInt(document.getElementById('clRodadaFinal')?.value);
        if (!rodadaFinal || rodadaFinal < 1 || rodadaFinal > 38) {
            if (window.SuperModal) SuperModal.toast.error('Rodada invalida (1-38)');
            return;
        }

        const btn = document.getElementById('clBtnConsolidar');
        const statusEl = document.getElementById('clConsolidacaoStatus');
        this.consolidando = true;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons" style="animation:spin 1s linear infinite;">sync</span> Consolidando...';
        }
        if (statusEl) {
            statusEl.innerHTML = '<span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">Processando rodadas 1-' + rodadaFinal + '... Pode demorar alguns segundos.</span>';
        }

        try {
            const res = await fetch(`/api/capitao/${this.ligaId}/consolidar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rodadaFinal, temporada: new Date().getFullYear() }),
            });

            if (!res.ok) throw new Error(`Erro ${res.status}`);
            const data = await res.json();

            if (data.success) {
                if (window.SuperModal) SuperModal.toast.success('Ranking consolidado ate R' + rodadaFinal + '!');
                await this.carregarDashboard();
            } else {
                if (statusEl) statusEl.innerHTML = '<span style="font-size:var(--app-font-xs);color:var(--app-danger);">' + (data.error || 'Erro desconhecido') + '</span>';
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao consolidar');
            }
        } catch (err) {
            console.error('[ADMIN-CL] Erro ao consolidar:', err);
            if (statusEl) statusEl.innerHTML = '<span style="font-size:var(--app-font-xs);color:var(--app-danger);">Erro de conexao</span>';
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        } finally {
            this.consolidando = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons">sync</span> Consolidar Ranking';
            }
        }
    }

    // ==========================================================================
    // RENDER: RANKING PREVIEW (Top 10)
    // ==========================================================================

    _renderRankingPreview(ranking) {
        const top = ranking.slice(0, 10);
        return top.map((p, i) => {
            const pos = p.posicao_final || (i + 1);
            const pts = (Math.trunc((p.pontuacao_total || 0) * 100) / 100).toFixed(2);
            const media = (Math.trunc((p.media_capitao || 0) * 100) / 100).toFixed(2);
            const rodadas = p.rodadas_jogadas || 0;
            const escudo = p.escudo || '/escudos/default.png';
            return '<div class="cl-ranking-row">'
                + '<span class="cl-ranking-pos">' + pos + 'o</span>'
                + '<img src="' + escudo + '" alt="" onerror="this.style.display=\'none\'">'
                + '<span class="cl-ranking-nome">' + (p.nome_cartola || '---') + '</span>'
                + '<span style="font-size:var(--app-font-xs);color:var(--app-text-muted);min-width:30px;text-align:center;">' + rodadas + 'R</span>'
                + '<span style="font-size:var(--app-font-xs);color:var(--app-text-muted);min-width:45px;text-align:right;">' + media + '</span>'
                + '<span class="cl-ranking-pontos">' + pts + '</span>'
                + '</div>';
        }).join('');
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
