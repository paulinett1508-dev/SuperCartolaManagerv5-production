/**
 * ADMIN LUVA DE OURO - Dashboard de Gerenciamento
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Visualizar ranking de goleiros (media de pontos)
 * - Ver estatisticas do modulo
 * - Coletar dados
 * - Consolidar temporada
 * - Executar diagnostico
 *
 * @version 1.0.0
 */

class AdminLuvaOuro {
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
                    <p>Selecione uma liga para gerenciar a Luva de Ouro</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD PRINCIPAL
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('loAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="lo-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const [rankingRes, statsRes, rodadaRes] = await Promise.all([
                fetch(`/api/luva-de-ouro/${this.ligaId}/ranking`),
                fetch(`/api/luva-de-ouro/${this.ligaId}/estatisticas`),
                fetch(`/api/luva-de-ouro/${this.ligaId}/detectar-rodada`),
            ]);

            const ranking = rankingRes.ok ? await rankingRes.json() : [];
            const stats = statsRes.ok ? await statsRes.json() : {};
            const rodadaData = rodadaRes.ok ? await rodadaRes.json() : {};

            this.renderDashboard(container, ranking, stats, rodadaData);
        } catch (err) {
            console.error('[ADMIN-LO] Erro ao carregar dashboard:', err);
            container.innerHTML = '<div class="lo-empty"><p style="color:var(--app-danger);">Erro ao carregar dados</p></div>';
        }
    }

    renderDashboard(container, ranking, stats, rodadaData) {
        const rankingArr = Array.isArray(ranking) ? ranking : (ranking.ranking || []);
        const totalParticipantes = rankingArr.length;
        const rodadaAtual = rodadaData.rodada || rodadaData.ultimaRodada || '-';
        const lider = rankingArr[0];
        const mediaLider = lider ? (Math.trunc((lider.media || 0) * 100) / 100).toFixed(2) : '-';

        container.innerHTML = `
            <!-- Stats -->
            <div class="lo-stats-grid">
                <div class="lo-stat">
                    <div class="lo-stat-value">${totalParticipantes}</div>
                    <div class="lo-stat-label">Participantes</div>
                </div>
                <div class="lo-stat">
                    <div class="lo-stat-value">${rodadaAtual}</div>
                    <div class="lo-stat-label">Ultima Rodada</div>
                </div>
                <div class="lo-stat">
                    <div class="lo-stat-value" style="color:var(--module-luva-primary);">${mediaLider}</div>
                    <div class="lo-stat-label">Media Lider</div>
                </div>
                <div class="lo-stat">
                    <div class="lo-stat-value">${stats.rodadasConsolidadas || '-'}</div>
                    <div class="lo-stat-label">Rodadas Cons.</div>
                </div>
            </div>

            <!-- Acoes Admin -->
            <div class="lo-card">
                <div class="lo-card-header">
                    <span class="lo-card-title">
                        <span class="material-icons">build</span>
                        Acoes
                    </span>
                </div>
                <div style="display:flex;gap:var(--app-space-2);flex-wrap:wrap;">
                    <button class="lo-btn lo-btn-primary" onclick="window.adminLuvaOuro.coletarDados()">
                        <span class="material-icons">download</span>
                        Coletar Dados
                    </button>
                    <button class="lo-btn lo-btn-ghost" onclick="window.adminLuvaOuro.consolidar()">
                        <span class="material-icons">sync</span>
                        Consolidar
                    </button>
                    <button class="lo-btn lo-btn-ghost" onclick="window.adminLuvaOuro.diagnostico()">
                        <span class="material-icons">troubleshoot</span>
                        Diagnostico
                    </button>
                </div>
            </div>

            <!-- Ranking -->
            <div class="lo-card">
                <div class="lo-card-header">
                    <span class="lo-card-title">
                        <span class="material-icons">emoji_events</span>
                        Ranking Goleiros
                        <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${totalParticipantes} participantes)</span>
                    </span>
                </div>
                <div id="loRankingLista">
                    ${rankingArr.length === 0
                        ? '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-4);">Nenhum dado consolidado</p>'
                        : rankingArr.map((r, i) => this.renderRankingRow(r, i + 1)).join('')}
                </div>
            </div>
        `;
    }

    renderRankingRow(participante, posicao) {
        const media = (Math.trunc((participante.media || 0) * 100) / 100).toFixed(2);
        return `
            <div class="lo-ranking-row">
                <span class="lo-ranking-pos">${posicao}</span>
                <img src="/escudos/${participante.escudoId || 'default'}.png"
                     onerror="this.src='/escudos/default.png'" alt="">
                <span class="lo-ranking-nome">${participante.nomeTime || participante.nome_time || 'Time'}</span>
                <span class="lo-ranking-media">${media} pts</span>
            </div>
        `;
    }

    // ==========================================================================
    // ACOES ADMIN
    // ==========================================================================

    async coletarDados() {
        try {
            const res = await fetch(`/api/luva-de-ouro/${this.ligaId}/coletar`, { credentials: 'include' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) SuperModal.toast.success(data.mensagem || 'Dados coletados!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao coletar');
            }
        } catch (err) {
            console.error('[ADMIN-LO] Erro ao coletar:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
    }

    async consolidar() {
        if (!confirm('Confirma consolidar a temporada da Luva de Ouro?')) return;

        try {
            const res = await fetch(`/api/luva-de-ouro/${this.ligaId}/consolidar`, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) SuperModal.toast.success(data.mensagem || 'Consolidado!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao consolidar');
            }
        } catch (err) {
            console.error('[ADMIN-LO] Erro ao consolidar:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
    }

    async diagnostico() {
        try {
            const res = await fetch(`/api/luva-de-ouro/${this.ligaId}/diagnostico`, { credentials: 'include' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) {
                    SuperModal.toast.success('Diagnostico completo - veja o console');
                }
                console.log('[ADMIN-LO] Diagnostico:', data);
                alert(JSON.stringify(data, null, 2));
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro no diagnostico');
            }
        } catch (err) {
            console.error('[ADMIN-LO] Erro no diagnostico:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
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
