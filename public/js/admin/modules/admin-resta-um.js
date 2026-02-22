/**
 * ADMIN RESTA UM - Dashboard de Gerenciamento
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Visualizar edicoes existentes (com status)
 * - Criar nova edicao (inscreve todos participantes)
 * - Ver participantes com status (vivo/eliminado/campeao)
 * - Ver historico de eliminacoes (timeline)
 *
 * @version 1.0.0
 */

class AdminRestaUm {
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
        const select = document.getElementById('ruLigaSelect');
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
            console.error('[ADMIN-RU] Erro ao carregar ligas:', err);
        }
    }

    async onLigaChange() {
        const select = document.getElementById('ruLigaSelect');
        this.ligaId = select?.value || null;
        this.edicaoSelecionada = null;

        if (!this.ligaId) {
            document.getElementById('ruAdminContent').innerHTML = `
                <div class="ru-empty">
                    <span class="material-icons" style="font-size:3rem;opacity:0.3;">sports_kabaddi</span>
                    <p>Selecione uma liga para gerenciar o Resta Um</p>
                </div>`;
            return;
        }

        await this.carregarDashboard();
    }

    // ==========================================================================
    // DASHBOARD PRINCIPAL
    // ==========================================================================

    async carregarDashboard() {
        const container = document.getElementById('ruAdminContent');
        if (!container) return;

        container.innerHTML = `<div class="ru-loading"><span class="material-icons">sync</span> Carregando...</div>`;

        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/edicoes`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.edicoes = Array.isArray(data) ? data : [];
        } catch (err) {
            this.edicoes = [];
        }

        this.renderDashboard(container);
    }

    renderDashboard(container) {
        const liga = this.ligas.find(l => l._id === this.ligaId);
        const totalParticipantes = (liga?.participantes || liga?.times || []).filter(t => t.ativo !== false).length;

        const emAndamento = this.edicoes.find(e => e.status === 'em_andamento');
        const finalizadas = this.edicoes.filter(e => e.status === 'finalizada').length;
        const totalEdicoes = this.edicoes.length;
        const vivosAtual = emAndamento ? (emAndamento.vivosRestantes || 0) : '-';

        container.innerHTML = `
            <!-- Stats -->
            <div class="ru-stats-grid">
                <div class="ru-stat">
                    <div class="ru-stat-value">${totalEdicoes}</div>
                    <div class="ru-stat-label">Edicoes</div>
                </div>
                <div class="ru-stat">
                    <div class="ru-stat-value" style="color:var(--app-success);">${emAndamento ? 1 : 0}</div>
                    <div class="ru-stat-label">Em Andamento</div>
                </div>
                <div class="ru-stat">
                    <div class="ru-stat-value">${finalizadas}</div>
                    <div class="ru-stat-label">Finalizadas</div>
                </div>
                <div class="ru-stat">
                    <div class="ru-stat-value">${totalParticipantes}</div>
                    <div class="ru-stat-label">Participantes</div>
                </div>
                <div class="ru-stat">
                    <div class="ru-stat-value" style="color:var(--module-restaum-primary);">${vivosAtual}</div>
                    <div class="ru-stat-label">Vivos</div>
                </div>
            </div>

            <!-- Edicoes Existentes -->
            <div class="ru-card">
                <div class="ru-card-header">
                    <span class="ru-card-title">
                        <span class="material-icons">list</span>
                        Edicoes
                    </span>
                </div>
                <div id="ruEdicoesLista">
                    ${this.edicoes.length === 0
                        ? '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-4);">Nenhuma edicao criada ainda</p>'
                        : this.edicoes.map(e => this.renderEdicaoCard(e)).join('')}
                </div>
            </div>

            <!-- Criar Nova Edicao -->
            <div class="ru-card">
                <div class="ru-card-header">
                    <span class="ru-card-title">
                        <span class="material-icons">add_circle</span>
                        Criar Nova Edicao
                    </span>
                </div>

                <div class="ru-form-row">
                    <div>
                        <label>Numero da Edicao</label>
                        <input type="number" id="ruNovaEdicao" value="${totalEdicoes + 1}" min="1" max="10">
                    </div>
                    <div>
                        <label>Rodada Inicial</label>
                        <input type="number" id="ruRodadaInicial" value="" min="1" max="38" placeholder="Ex: 1">
                    </div>
                    <div>
                        <label>Rodada Final</label>
                        <input type="number" id="ruRodadaFinal" value="" min="1" max="38" placeholder="Ex: 19">
                    </div>
                </div>

                <div class="ru-form-row-2col">
                    <div>
                        <label>Eliminados por Rodada</label>
                        <select id="ruEliminadosPorRodada">
                            <option value="1" selected>1 eliminado</option>
                            <option value="2">2 eliminados</option>
                            <option value="3">3 eliminados</option>
                        </select>
                    </div>
                    <div class="ru-form-checkbox">
                        <input type="checkbox" id="ruProtecao">
                        <span>Protecao na 1a rodada</span>
                    </div>
                </div>

                <div class="ru-form-section">Premiacao (R$)</div>
                <div class="ru-form-row">
                    <div>
                        <label>Campeao</label>
                        <input type="number" id="ruPremiacaoCampeao" value="100" min="0" step="10">
                    </div>
                    <div>
                        <label>Vice</label>
                        <input type="number" id="ruPremiacaoVice" value="50" min="0" step="10">
                    </div>
                    <div>
                        <label>Terceiro</label>
                        <input type="number" id="ruPremiacaoTerceiro" value="25" min="0" step="5">
                    </div>
                </div>

                <div class="ru-form-section">Bonus Sobrevivencia</div>
                <div class="ru-form-row">
                    <div class="ru-form-checkbox">
                        <input type="checkbox" id="ruBonusHabilitado" checked>
                        <span>Habilitado</span>
                    </div>
                    <div>
                        <label>Valor Base (R$)</label>
                        <input type="number" id="ruBonusValorBase" value="2" min="0" step="0.5">
                    </div>
                    <div>
                        <label>Incremento (R$)</label>
                        <input type="number" id="ruBonusIncremento" value="0.5" min="0" step="0.1">
                    </div>
                </div>

                <button class="ru-btn ru-btn-primary" onclick="window.adminRestaUm.criarEdicao()" style="margin-top:var(--app-space-2);">
                    <span class="material-icons">rocket_launch</span>
                    Criar Edicao
                </button>
            </div>

            <!-- Participantes da Edicao Selecionada -->
            <div class="ru-card" id="ruParticipantesCard" style="display:none;">
                <div class="ru-card-header">
                    <span class="ru-card-title">
                        <span class="material-icons">groups</span>
                        Participantes
                        <span id="ruParticipantesEdicaoLabel" style="font-size:var(--app-font-xs);color:var(--app-text-muted);"></span>
                    </span>
                </div>
                <div id="ruParticipantesLista"></div>
            </div>

            <!-- Historico de Eliminacoes -->
            <div class="ru-card" id="ruHistoricoCard" style="display:none;">
                <div class="ru-card-header">
                    <span class="ru-card-title">
                        <span class="material-icons">timeline</span>
                        Historico de Eliminacoes
                        <span id="ruHistoricoEdicaoLabel" style="font-size:var(--app-font-xs);color:var(--app-text-muted);"></span>
                    </span>
                </div>
                <div id="ruHistoricoLista" class="ru-timeline"></div>
            </div>
        `;
    }

    renderEdicaoCard(edicao) {
        const statusLabel = { pendente: 'Pendente', em_andamento: 'Em Andamento', finalizada: 'Finalizada' };
        return `
            <div class="ru-edicao-card">
                <div class="ru-edicao-info" onclick="window.adminRestaUm.selecionarEdicao(${edicao.edicao})">
                    <span class="material-icons" style="color:var(--module-restaum-primary);font-size:1.25rem;">sports_kabaddi</span>
                    <div>
                        <div class="ru-edicao-nome">${edicao.nome || edicao.edicao + 'a Edicao'}</div>
                        <div class="ru-edicao-rodadas">R${edicao.rodadaInicial} - R${edicao.rodadaFinal} | ${edicao.totalParticipantes || 0} participantes | ${edicao.vivosRestantes || 0} vivos</div>
                    </div>
                </div>
                <span class="ru-edicao-status ${edicao.status}">${statusLabel[edicao.status] || edicao.status}</span>
            </div>
        `;
    }

    // ==========================================================================
    // SELECIONAR EDICAO → VER PARTICIPANTES + HISTORICO
    // ==========================================================================

    async selecionarEdicao(edicaoNum) {
        this.edicaoSelecionada = edicaoNum;

        const partCard = document.getElementById('ruParticipantesCard');
        const partLista = document.getElementById('ruParticipantesLista');
        const partLabel = document.getElementById('ruParticipantesEdicaoLabel');
        const histCard = document.getElementById('ruHistoricoCard');
        const histLista = document.getElementById('ruHistoricoLista');
        const histLabel = document.getElementById('ruHistoricoEdicaoLabel');

        if (!partCard || !partLista) return;

        partCard.style.display = '';
        partLista.innerHTML = `<div class="ru-loading"><span class="material-icons">sync</span> Carregando...</div>`;
        if (partLabel) partLabel.textContent = `(Edicao ${edicaoNum})`;

        if (histCard) histCard.style.display = '';
        if (histLabel) histLabel.textContent = `(Edicao ${edicaoNum})`;

        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/status?edicao=${edicaoNum}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const participantes = data.participantes || [];
            if (participantes.length === 0) {
                partLista.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-3);">Nenhum participante</p>';
            } else {
                partLista.innerHTML = participantes.map(p => `
                    <div class="ru-participante-row">
                        <img src="/escudos/${p.escudoId || 'default'}.png"
                             onerror="this.src='/escudos/default.png'" alt="">
                        <span class="ru-participante-nome">${p.nomeTime || p.nomeCartoleiro || 'Time'}</span>
                        <span class="ru-participante-pontos">
                            ${(Math.trunc((p.pontosAcumulados || 0) * 100) / 100).toFixed(2)} pts
                        </span>
                        <span class="ru-participante-status ${p.status}">
                            ${p.status === 'vivo' ? 'VIVO' : p.status === 'campeao' ? 'CAMPEAO' : 'ELIMINADO'}
                        </span>
                        ${p.rodadaEliminacao ? `<span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">R${p.rodadaEliminacao}</span>` : ''}
                    </div>
                `).join('');
            }

            // Historico de eliminacoes
            if (histLista) {
                histLista.innerHTML = this.renderHistoricoEliminacoes(data.historicoEliminacoes);
            }

            // Scroll para participantes
            partCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            console.error('[ADMIN-RU] Erro ao carregar edicao:', err);
            partLista.innerHTML = '<p style="color:var(--app-danger);text-align:center;">Erro ao carregar participantes</p>';
            if (histLista) histLista.innerHTML = '';
        }
    }

    renderHistoricoEliminacoes(historico) {
        if (!historico || historico.length === 0) {
            return '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-3);">Nenhuma eliminacao ainda</p>';
        }

        // Agrupar por rodada, ordenar decrescente
        const byRodada = {};
        historico.forEach(h => {
            const r = h.rodada || 0;
            if (!byRodada[r]) byRodada[r] = [];
            byRodada[r].push(h);
        });

        const rodadas = Object.keys(byRodada).sort((a, b) => b - a);

        return rodadas.map(rodada => {
            const elims = byRodada[rodada];
            return `
                <div class="ru-timeline-item">
                    <div class="ru-timeline-rodada">R${rodada}</div>
                    <div class="ru-timeline-content">
                        ${elims.map(e => `
                            <div class="ru-timeline-entry">
                                <span class="ru-timeline-nome">${e.nomeTime || 'Time'}</span>
                                <span class="ru-timeline-pontos">${(Math.trunc((e.pontosRodada || 0) * 100) / 100).toFixed(2)}</span>
                                <span class="ru-timeline-date">${e.dataEliminacao ? new Date(e.dataEliminacao).toLocaleDateString('pt-BR') : ''}</span>
                            </div>
                            ${e.criterioDesempate ? `<div class="ru-timeline-desempate">Desempate: ${e.criterioDesempate}</div>` : ''}
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==========================================================================
    // CRIAR NOVA EDICAO
    // ==========================================================================

    async criarEdicao() {
        const edicao = parseInt(document.getElementById('ruNovaEdicao')?.value);
        const rodadaInicial = parseInt(document.getElementById('ruRodadaInicial')?.value);
        const rodadaFinal = parseInt(document.getElementById('ruRodadaFinal')?.value);
        const eliminadosPorRodada = parseInt(document.getElementById('ruEliminadosPorRodada')?.value) || 1;
        const protecaoPrimeiraRodada = document.getElementById('ruProtecao')?.checked || false;
        const premiacaoCampeao = parseFloat(document.getElementById('ruPremiacaoCampeao')?.value) || 100;
        const premiacaoVice = parseFloat(document.getElementById('ruPremiacaoVice')?.value) || 50;
        const premiacaoTerceiro = parseFloat(document.getElementById('ruPremiacaoTerceiro')?.value) || 25;
        const bonusHabilitado = document.getElementById('ruBonusHabilitado')?.checked !== false;
        const bonusValorBase = parseFloat(document.getElementById('ruBonusValorBase')?.value) || 2;
        const bonusIncremento = parseFloat(document.getElementById('ruBonusIncremento')?.value) || 0.5;

        if (!edicao || !rodadaInicial || !rodadaFinal) {
            if (window.SuperModal) {
                SuperModal.toast.warn('Preencha os campos obrigatorios: edicao, rodada inicial e final');
            } else {
                alert('Preencha todos os campos obrigatorios');
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
            const res = await fetch(`/api/resta-um/${this.ligaId}/iniciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    edicao,
                    rodadaInicial,
                    rodadaFinal,
                    eliminadosPorRodada,
                    protecaoPrimeiraRodada,
                    premiacao: { campeao: premiacaoCampeao, vice: premiacaoVice, terceiro: premiacaoTerceiro },
                    bonusSobrevivencia: { habilitado: bonusHabilitado, valorBase: bonusValorBase, incremento: bonusIncremento },
                }),
            });

            const data = await res.json();

            if (data.success) {
                if (window.SuperModal) {
                    SuperModal.toast.success(`Edicao ${edicao} criada com ${data.participantes} participantes!`);
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
            console.error('[ADMIN-RU] Erro ao criar edicao:', err);
            if (window.SuperModal) {
                SuperModal.toast.error('Erro de conexao ao criar edicao');
            }
        }
    }
}

// Instanciar e inicializar
const adminRestaUm = new AdminRestaUm();
window.adminRestaUm = adminRestaUm;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adminRestaUm.init());
} else {
    adminRestaUm.init();
}
