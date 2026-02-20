/**
 * ADMIN TIRO CERTO - Dashboard de Gerenciamento
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Visualizar edicoes existentes (com status)
 * - Criar nova edicao (inscreve todos participantes)
 * - Ver participantes com status (vivo/eliminado/campeao)
 *
 * @version 1.0.0
 */

class AdminTiroCerto {
    constructor() {
        this.ligaId = null;
        this.ligas = [];
        this.edicoes = [];
        this.edicaoSelecionada = null;
    }

    // ==========================================================================
    // INICIALIZACAO
    // ==========================================================================

    async init() {
        await this.carregarLigas();
    }

    async carregarLigas() {
        const select = document.getElementById('tcLigaSelect');
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
            console.error('[ADMIN-TC] Erro ao carregar ligas:', err);
        }
    }

    async onLigaChange() {
        const select = document.getElementById('tcLigaSelect');
        this.ligaId = select?.value || null;
        this.edicaoSelecionada = null;

        if (!this.ligaId) {
            document.getElementById('tcAdminContent').innerHTML = `
                <div class="tc-empty">
                    <span class="material-icons" style="font-size:3rem;opacity:0.3;">gps_fixed</span>
                    <p>Selecione uma liga para gerenciar o Tiro Certo</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD PRINCIPAL
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('tcAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="tc-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const res = await fetch(`/api/tiro-certo/${this.ligaId}/edicoes`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.edicoes = data.edicoes || [];
        } catch (err) {
            // 404 = sem edicoes ainda (normal)
            this.edicoes = [];
        }

        this.renderDashboard(container);
    }

    renderDashboard(container) {
        const liga = this.ligas.find(l => l._id === this.ligaId);
        const ligaNome = liga?.nome || liga?.name || 'Liga';
        const totalParticipantes = (liga?.times || []).filter(t => t.ativo !== false).length;

        // Calcular stats
        const emAndamento = this.edicoes.find(e => e.status === 'em_andamento');
        const finalizadas = this.edicoes.filter(e => e.status === 'finalizada').length;
        const totalEdicoes = this.edicoes.length;

        container.innerHTML = `
            <!-- Stats -->
            <div class="tc-stats-grid">
                <div class="tc-stat">
                    <div class="tc-stat-value">${totalEdicoes}</div>
                    <div class="tc-stat-label">Edicoes</div>
                </div>
                <div class="tc-stat">
                    <div class="tc-stat-value" style="color:var(--app-success);">${emAndamento ? 1 : 0}</div>
                    <div class="tc-stat-label">Em Andamento</div>
                </div>
                <div class="tc-stat">
                    <div class="tc-stat-value">${finalizadas}</div>
                    <div class="tc-stat-label">Finalizadas</div>
                </div>
                <div class="tc-stat">
                    <div class="tc-stat-value">${totalParticipantes}</div>
                    <div class="tc-stat-label">Participantes</div>
                </div>
            </div>

            <!-- Edicoes Existentes -->
            <div class="tc-card">
                <div class="tc-card-header">
                    <span class="tc-card-title">
                        <span class="material-icons">list</span>
                        Edicoes
                    </span>
                </div>
                <div id="tcEdicoesLista">
                    ${this.edicoes.length === 0
                        ? '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-4);">Nenhuma edicao criada ainda</p>'
                        : this.edicoes.map(e => this.renderEdicaoCard(e)).join('')}
                </div>
            </div>

            <!-- Criar Nova Edicao -->
            <div class="tc-card">
                <div class="tc-card-header">
                    <span class="tc-card-title">
                        <span class="material-icons">add_circle</span>
                        Criar Nova Edicao
                    </span>
                </div>
                <div class="tc-form-row">
                    <div>
                        <label>Numero da Edicao</label>
                        <input type="number" id="tcNovaEdicao" value="${totalEdicoes + 1}" min="1" max="10">
                    </div>
                    <div>
                        <label>Rodada Inicial</label>
                        <input type="number" id="tcRodadaInicial" value="" min="1" max="38" placeholder="Ex: 7">
                    </div>
                    <div>
                        <label>Rodada Final</label>
                        <input type="number" id="tcRodadaFinal" value="" min="1" max="38" placeholder="Ex: 15">
                    </div>
                </div>
                <button class="tc-btn tc-btn-primary" onclick="window.adminTiroCerto.criarEdicao()">
                    <span class="material-icons">rocket_launch</span>
                    Criar Edicao
                </button>
            </div>

            <!-- Participantes da Edicao Selecionada -->
            <div class="tc-card" id="tcParticipantesCard" style="display:none;">
                <div class="tc-card-header">
                    <span class="tc-card-title">
                        <span class="material-icons">groups</span>
                        Participantes
                        <span id="tcParticipantesEdicaoLabel" style="font-size:var(--app-font-xs);color:var(--app-text-muted);"></span>
                    </span>
                </div>
                <div id="tcParticipantesLista">
                </div>
            </div>
        `;
    }

    renderEdicaoCard(edicao) {
        const statusLabel = { pendente: 'Pendente', em_andamento: 'Em Andamento', finalizada: 'Finalizada' };
        return `
            <div class="tc-edicao-card" style="cursor:pointer;" onclick="window.adminTiroCerto.selecionarEdicao(${edicao.id})">
                <div class="tc-edicao-info">
                    <span class="material-icons" style="color:var(--app-primary);font-size:1.25rem;">gps_fixed</span>
                    <div>
                        <div class="tc-edicao-nome">${edicao.nome || edicao.id + 'a Edicao'}</div>
                        <div class="tc-edicao-rodadas">R${edicao.rodadaInicial} - R${edicao.rodadaFinal} | ${edicao.totalParticipantes || 0} participantes | ${edicao.vivosCount || 0} vivos</div>
                    </div>
                </div>
                <span class="tc-edicao-status ${edicao.status}">${statusLabel[edicao.status] || edicao.status}</span>
            </div>
        `;
    }

    // ==========================================================================
    // SELECIONAR EDICAO → VER PARTICIPANTES
    // ==========================================================================

    async selecionarEdicao(edicaoId) {
        this.edicaoSelecionada = edicaoId;
        const card = document.getElementById('tcParticipantesCard');
        const lista = document.getElementById('tcParticipantesLista');
        const label = document.getElementById('tcParticipantesEdicaoLabel');
        if (!card || !lista) return;

        card.style.display = '';
        lista.innerHTML = `<div class="tc-loading"><span class="material-icons">sync</span> Carregando...</div>`;
        if (label) label.textContent = `(Edicao ${edicaoId})`;

        try {
            const res = await fetch(`/api/tiro-certo/${this.ligaId}/participantes?edicao=${edicaoId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (!data.participantes || data.participantes.length === 0) {
                lista.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-3);">Nenhum participante</p>';
                return;
            }

            lista.innerHTML = data.participantes.map(p => `
                <div class="tc-participante-row">
                    <img src="/escudos/${p.escudoId || 'default'}.png"
                         onerror="this.src='/escudos/default.png'" alt="">
                    <span class="tc-participante-nome">${p.nomeTime || p.nomeCartoleiro || 'Time'}</span>
                    <span style="font-family:var(--app-font-mono);font-size:var(--app-font-xs);color:var(--app-text-muted);">
                        ${p.rodadasSobrevividas || 0}R
                    </span>
                    <span class="tc-participante-status ${p.status}">
                        ${p.status === 'vivo' ? 'VIVO' : p.status === 'campeao' ? 'CAMPEAO' : 'ELIMINADO'}
                    </span>
                    ${p.motivoEliminacao ? `<span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${p.motivoEliminacao} R${p.rodadaEliminacao || ''})</span>` : ''}
                </div>
            `).join('');
        } catch (err) {
            console.error('[ADMIN-TC] Erro ao carregar participantes:', err);
            lista.innerHTML = '<p style="color:var(--app-danger);text-align:center;">Erro ao carregar participantes</p>';
        }
    }

    // ==========================================================================
    // CRIAR NOVA EDICAO
    // ==========================================================================

    async criarEdicao() {
        const edicao = parseInt(document.getElementById('tcNovaEdicao')?.value);
        const rodadaInicial = parseInt(document.getElementById('tcRodadaInicial')?.value);
        const rodadaFinal = parseInt(document.getElementById('tcRodadaFinal')?.value);

        if (!edicao || !rodadaInicial || !rodadaFinal) {
            if (window.SuperModal) {
                SuperModal.toast.warn('Preencha todos os campos: edicao, rodada inicial e final');
            } else {
                alert('Preencha todos os campos');
            }
            return;
        }

        if (rodadaInicial >= rodadaFinal) {
            if (window.SuperModal) {
                SuperModal.toast.warn('Rodada inicial deve ser menor que a final');
            } else {
                alert('Rodada inicial deve ser menor que a final');
            }
            return;
        }

        try {
            const res = await fetch(`/api/tiro-certo/${this.ligaId}/iniciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ edicao, rodadaInicial, rodadaFinal }),
            });

            const data = await res.json();

            if (data.success) {
                if (window.SuperModal) {
                    SuperModal.toast.success(`Edicao ${edicao} criada com ${data.edicao.participantes} participantes!`);
                }
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) {
                    SuperModal.toast.error(data.error || 'Erro ao criar edicao');
                } else {
                    alert(data.error || 'Erro ao criar edicao');
                }
            }
        } catch (err) {
            console.error('[ADMIN-TC] Erro ao criar edicao:', err);
            if (window.SuperModal) {
                SuperModal.toast.error('Erro de conexao ao criar edicao');
            }
        }
    }
}

// Instanciar e inicializar
const adminTiroCerto = new AdminTiroCerto();
window.adminTiroCerto = adminTiroCerto;

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adminTiroCerto.init());
} else {
    adminTiroCerto.init();
}
