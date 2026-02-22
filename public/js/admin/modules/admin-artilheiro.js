/**
 * ADMIN ARTILHEIRO CAMPEAO - Dashboard de Gerenciamento
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Visualizar ranking de gols
 * - Ver estatisticas do modulo
 * - Consolidar rodada
 * - Coletar dados de rodada
 * - Limpar cache
 *
 * @version 1.0.0
 */

class AdminArtilheiro {
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
                    <p>Selecione uma liga para gerenciar o Artilheiro Campeao</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD PRINCIPAL
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('acAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="ac-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const [rankingRes, statsRes, rodadaRes] = await Promise.all([
                fetch(`/api/artilheiro-campeao/${this.ligaId}/ranking`),
                fetch(`/api/artilheiro-campeao/${this.ligaId}/estatisticas`),
                fetch(`/api/artilheiro-campeao/${this.ligaId}/detectar-rodada`),
            ]);

            const ranking = rankingRes.ok ? await rankingRes.json() : [];
            const stats = statsRes.ok ? await statsRes.json() : {};
            const rodadaData = rodadaRes.ok ? await rodadaRes.json() : {};

            this.renderDashboard(container, ranking, stats, rodadaData);
        } catch (err) {
            console.error('[ADMIN-AC] Erro ao carregar dashboard:', err);
            container.innerHTML = '<div class="ac-empty"><p style="color:var(--app-danger);">Erro ao carregar dados</p></div>';
        }
    }

    renderDashboard(container, ranking, stats, rodadaData) {
        const rankingArr = Array.isArray(ranking) ? ranking : (ranking.ranking || []);
        const totalParticipantes = rankingArr.length;
        const totalGols = rankingArr.reduce((acc, r) => acc + (r.gols_pro || r.saldo_gols || 0), 0);
        const rodadaAtual = rodadaData.rodada || rodadaData.ultimaRodada || '-';
        const lider = rankingArr[0];

        container.innerHTML = `
            <!-- Stats -->
            <div class="ac-stats-grid">
                <div class="ac-stat">
                    <div class="ac-stat-value">${totalParticipantes}</div>
                    <div class="ac-stat-label">Participantes</div>
                </div>
                <div class="ac-stat">
                    <div class="ac-stat-value" style="color:var(--module-artilheiro-primary);">${totalGols}</div>
                    <div class="ac-stat-label">Total Gols</div>
                </div>
                <div class="ac-stat">
                    <div class="ac-stat-value">${rodadaAtual}</div>
                    <div class="ac-stat-label">Ultima Rodada</div>
                </div>
                <div class="ac-stat">
                    <div class="ac-stat-value" style="color:var(--app-warning);">${lider ? (lider.gols_pro || lider.saldo_gols || 0) : '-'}</div>
                    <div class="ac-stat-label">Lider (Gols)</div>
                </div>
            </div>

            <!-- Acoes Admin -->
            <div class="ac-card">
                <div class="ac-card-header">
                    <span class="ac-card-title">
                        <span class="material-icons">build</span>
                        Acoes
                    </span>
                </div>
                <div style="display:flex;gap:var(--app-space-2);flex-wrap:wrap;">
                    <button class="ac-btn ac-btn-primary" onclick="window.adminArtilheiro.consolidarRodada()">
                        <span class="material-icons">sync</span>
                        Consolidar Rodada
                    </button>
                    <button class="ac-btn ac-btn-ghost" onclick="window.adminArtilheiro.coletarRodada()">
                        <span class="material-icons">download</span>
                        Coletar Dados
                    </button>
                    <button class="ac-btn ac-btn-ghost" onclick="window.adminArtilheiro.limparCache()">
                        <span class="material-icons">delete_sweep</span>
                        Limpar Cache
                    </button>
                </div>
            </div>

            <!-- Ranking -->
            <div class="ac-card">
                <div class="ac-card-header">
                    <span class="ac-card-title">
                        <span class="material-icons">emoji_events</span>
                        Ranking
                        <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${totalParticipantes} participantes)</span>
                    </span>
                </div>
                <div id="acRankingLista">
                    ${rankingArr.length === 0
                        ? '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-4);">Nenhum dado consolidado</p>'
                        : rankingArr.map((r, i) => this.renderRankingRow(r, i + 1)).join('')}
                </div>
            </div>
        `;
    }

    renderRankingRow(participante, posicao) {
        const gols = participante.gols_pro || participante.saldo_gols || 0;
        return `
            <div class="ac-ranking-row">
                <span class="ac-ranking-pos">${posicao}</span>
                <img src="/escudos/${participante.escudoId || 'default'}.png"
                     onerror="this.src='/escudos/default.png'" alt="">
                <span class="ac-ranking-nome">${participante.nomeTime || participante.nome_time || 'Time'}</span>
                <span class="ac-ranking-gols">${gols} gols</span>
            </div>
        `;
    }

    // ==========================================================================
    // ACOES ADMIN
    // ==========================================================================

    async consolidarRodada() {
        const rodada = prompt('Numero da rodada para consolidar:');
        if (!rodada) return;

        try {
            const res = await fetch(`/api/artilheiro-campeao/${this.ligaId}/consolidar/${rodada}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) SuperModal.toast.success(data.mensagem || `Rodada ${rodada} consolidada!`);
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao consolidar');
            }
        } catch (err) {
            console.error('[ADMIN-AC] Erro ao consolidar:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
    }

    async coletarRodada() {
        const rodada = prompt('Numero da rodada para coletar dados:');
        if (!rodada) return;

        try {
            const res = await fetch(`/api/artilheiro-campeao/${this.ligaId}/coletar/${rodada}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) SuperModal.toast.success(data.mensagem || `Dados da rodada ${rodada} coletados!`);
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao coletar');
            }
        } catch (err) {
            console.error('[ADMIN-AC] Erro ao coletar:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
    }

    async limparCache() {
        if (!confirm('Confirma limpar o cache do Artilheiro para esta liga?')) return;

        try {
            const res = await fetch(`/api/artilheiro-campeao/${this.ligaId}/cache`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                if (window.SuperModal) SuperModal.toast.success(data.mensagem || 'Cache limpo!');
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) SuperModal.toast.error(data.error || 'Erro ao limpar cache');
            }
        } catch (err) {
            console.error('[ADMIN-AC] Erro ao limpar cache:', err);
            if (window.SuperModal) SuperModal.toast.error('Erro de conexao');
        }
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
