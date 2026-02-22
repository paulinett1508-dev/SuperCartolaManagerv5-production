/**
 * ADMIN CAPITAO DE LUXO - Dashboard de Gerenciamento
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Visualizar ranking de capitaes (pontos acumulados)
 * - Consolidar temporada
 *
 * @version 1.0.0
 */

class AdminCapitao {
    constructor() {
        this.ligaId = null;
        this.ligas = [];
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
                    <p>Selecione uma liga para gerenciar o Capitao de Luxo</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD PRINCIPAL
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('clAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="cl-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const rankingRes = await fetch(`/api/capitao/${this.ligaId}/ranking`);
            const ranking = rankingRes.ok ? await rankingRes.json() : [];

            this.renderDashboard(container, ranking);
        } catch (err) {
            console.error('[ADMIN-CL] Erro ao carregar dashboard:', err);
            container.innerHTML = '<div class="cl-empty"><p style="color:var(--app-danger);">Erro ao carregar dados</p></div>';
        }
    }

    renderDashboard(container, ranking) {
        const rankingArr = Array.isArray(ranking) ? ranking : (ranking.ranking || []);
        const totalParticipantes = rankingArr.length;
        const lider = rankingArr[0];
        const pontosLider = lider ? (Math.trunc((lider.pontos_total || lider.totalPontos || 0) * 100) / 100).toFixed(2) : '-';
        const mediaLider = lider ? (Math.trunc((lider.media || 0) * 100) / 100).toFixed(2) : '-';

        container.innerHTML = `
            <!-- Stats -->
            <div class="cl-stats-grid">
                <div class="cl-stat">
                    <div class="cl-stat-value">${totalParticipantes}</div>
                    <div class="cl-stat-label">Participantes</div>
                </div>
                <div class="cl-stat">
                    <div class="cl-stat-value" style="color:var(--module-capitao-primary);">${pontosLider}</div>
                    <div class="cl-stat-label">Pts Lider</div>
                </div>
                <div class="cl-stat">
                    <div class="cl-stat-value">${mediaLider}</div>
                    <div class="cl-stat-label">Media Lider</div>
                </div>
            </div>

            <!-- Acoes Admin -->
            <div class="cl-card">
                <div class="cl-card-header">
                    <span class="cl-card-title">
                        <span class="material-icons">build</span>
                        Acoes
                    </span>
                </div>
                <div style="display:flex;gap:var(--app-space-2);flex-wrap:wrap;">
                    <button class="cl-btn cl-btn-primary" onclick="window.adminCapitao.consolidar()">
                        <span class="material-icons">sync</span>
                        Consolidar Temporada
                    </button>
                </div>
            </div>

            <!-- Ranking -->
            <div class="cl-card">
                <div class="cl-card-header">
                    <span class="cl-card-title">
                        <span class="material-icons">emoji_events</span>
                        Ranking Capitaes
                        <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${totalParticipantes} participantes)</span>
                    </span>
                </div>
                <div id="clRankingLista">
                    ${rankingArr.length === 0
                        ? '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-4);">Nenhum dado consolidado</p>'
                        : rankingArr.map((r, i) => this.renderRankingRow(r, i + 1)).join('')}
                </div>
            </div>
        `;
    }

    renderRankingRow(participante, posicao) {
        const pontos = (Math.trunc((participante.pontos_total || participante.totalPontos || 0) * 100) / 100).toFixed(2);
        const media = (Math.trunc((participante.media || 0) * 100) / 100).toFixed(2);
        return `
            <div class="cl-ranking-row">
                <span class="cl-ranking-pos">${posicao}</span>
                <img src="/escudos/${participante.escudoId || 'default'}.png"
                     onerror="this.src='/escudos/default.png'" alt="">
                <span class="cl-ranking-nome">${participante.nomeTime || participante.nome_time || 'Time'}</span>
                <span class="cl-ranking-pontos">${pontos} pts</span>
                <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${media}/rod)</span>
            </div>
        `;
    }

    // ==========================================================================
    // ACOES ADMIN
    // ==========================================================================

    async consolidar() {
        if (!confirm('Confirma consolidar a temporada do Capitao de Luxo?')) return;

        try {
            const res = await fetch(`/api/capitao/${this.ligaId}/consolidar`, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) SuperModal.toast.success(data.mensagem || 'Consolidado!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao consolidar');
            }
        } catch (err) {
            console.error('[ADMIN-CL] Erro ao consolidar:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
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
