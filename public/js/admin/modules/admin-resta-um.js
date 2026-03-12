/**
 * ADMIN RESTA UM - Dashboard de Gerenciamento
 *
 * Permite ao admin:
 * - Selecionar liga
 * - Visualizar edicoes existentes (com status)
 * - Criar nova edicao (inscreve todos participantes)
 * - Ver participantes com status (vivo/eliminado/campeao)
 * - Ver historico de eliminacoes (timeline)
 * - Sugestao inteligente de rodadas baseada na qtd de participantes
 * - Premiacao de vice/terceiro opcionais
 *
 * @version 2.0.0
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

class AdminRestaUm {
    constructor() {
        this.ligaId = null;
        this.ligas = [];
        this.edicoes = [];
        this.edicaoSelecionada = null;
        this.edicaoEditando = null; // Edição carregada no form para edição
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
    // INTELIGENCIA DE SUGESTAO DE RODADAS
    // ==========================================================================

    /**
     * Calcula a sugestao de rodadas baseada na quantidade de participantes,
     * eliminados por rodada, protecao e edicoes ja existentes.
     *
     * @returns {{ rodadaInicial: number, rodadaFinal: number, rodadasNecessarias: number, info: string, alerta: string|null }}
     */
    calcularSugestaoRodadas() {
        const liga = this.ligas.find(l => l._id === this.ligaId);
        const totalParticipantes = (liga?.participantes || liga?.times || []).filter(t => t.ativo !== false).length;

        const eliminadosPorRodada = parseInt(document.getElementById('ruEliminadosPorRodada')?.value) || 1;
        const protecao = document.getElementById('ruProtecao')?.checked || false;

        if (totalParticipantes < 2) {
            return { rodadaInicial: 1, rodadaFinal: 38, rodadasNecessarias: 0, info: 'Participantes insuficientes', alerta: 'Minimo 8 participantes' };
        }

        // Eliminacoes necessarias = participantes - 1 (sobra o campeao)
        const eliminacoesNecessarias = totalParticipantes - 1;
        const rodadasDeEliminacao = Math.ceil(eliminacoesNecessarias / eliminadosPorRodada);
        const rodadasNecessarias = rodadasDeEliminacao + (protecao ? 1 : 0);

        // Encontrar rodadas ja ocupadas por edicoes existentes
        const rodadasOcupadas = [];
        for (const ed of this.edicoes) {
            if (ed.status !== 'finalizada') { // Ignorar edicoes finalizadas
                for (let r = (ed.rodadaInicial || 1); r <= (ed.rodadaFinal || 38); r++) {
                    rodadasOcupadas.push(r);
                }
            }
        }

        // Encontrar primeiro bloco livre de tamanho suficiente
        let rodadaInicial = 1;
        let rodadaFinal = rodadaInicial + rodadasNecessarias - 1;
        let alerta = null;

        // Tentar encontrar bloco livre
        for (let inicio = 1; inicio <= RODADA_FINAL_CAMPEONATO - rodadasNecessarias + 1; inicio++) {
            let blocoLivre = true;
            for (let r = inicio; r < inicio + rodadasNecessarias; r++) {
                if (rodadasOcupadas.includes(r)) {
                    blocoLivre = false;
                    break;
                }
            }
            if (blocoLivre) {
                rodadaInicial = inicio;
                rodadaFinal = inicio + rodadasNecessarias - 1;
                break;
            }
        }

        if (rodadaFinal > RODADA_FINAL_CAMPEONATO) {
            rodadaFinal = RODADA_FINAL_CAMPEONATO;
            alerta = `Precisa de ${rodadasNecessarias} rodadas mas so restam ${RODADA_FINAL_CAMPEONATO - rodadaInicial + 1} disponiveis. Considere aumentar eliminados/rodada.`;
        }

        const rodadasLivresRestantes = RODADA_FINAL_CAMPEONATO - rodadaFinal;
        const info = `${totalParticipantes} participantes, ${eliminacoesNecessarias} eliminacoes, ${rodadasNecessarias} rodadas necessarias` +
            (rodadasLivresRestantes > 0 ? ` (sobram ${rodadasLivresRestantes} rodadas para outra edicao)` : '');

        return { rodadaInicial, rodadaFinal, rodadasNecessarias, info, alerta };
    }

    /**
     * Atualiza os campos de rodada e o painel de sugestao no form
     */
    atualizarSugestaoRodadas() {
        const sugestao = this.calcularSugestaoRodadas();
        const inputInicial = document.getElementById('ruRodadaInicial');
        const inputFinal = document.getElementById('ruRodadaFinal');
        const painelSugestao = document.getElementById('ruSugestaoRodadas');

        if (inputInicial && !inputInicial.dataset.editadoManualmente) {
            inputInicial.value = sugestao.rodadaInicial;
        }
        if (inputFinal && !inputFinal.dataset.editadoManualmente) {
            inputFinal.value = sugestao.rodadaFinal;
        }

        if (painelSugestao) {
            const alertaHtml = sugestao.alerta
                ? `<div style="color:var(--app-warning);margin-top:4px;font-weight:600;">
                       <span class="material-icons" style="font-size:14px;vertical-align:middle;">warning</span>
                       ${sugestao.alerta}
                   </div>`
                : '';

            painelSugestao.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <span class="material-icons" style="font-size:16px;color:var(--module-restaum-primary);">auto_awesome</span>
                    <strong style="color:var(--app-text-primary);">Sugestao: R${sugestao.rodadaInicial} a R${sugestao.rodadaFinal}</strong>
                    <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${sugestao.rodadasNecessarias} rodadas)</span>
                </div>
                <div style="font-size:var(--app-font-xs);color:var(--app-text-muted);">${sugestao.info}</div>
                ${alertaHtml}
            `;
            painelSugestao.style.display = '';
        }
    }

    /**
     * Chamado quando o admin digita a rodada inicial.
     * Recalcula automaticamente a rodada final = inicial + rodadasNecessarias - 1 (max 38).
     */
    onRodadaInicialChange() {
        const inputInicial = document.getElementById('ruRodadaInicial');
        const inputFinal = document.getElementById('ruRodadaFinal');
        if (!inputInicial || !inputFinal) return;

        inputInicial.dataset.editadoManualmente = 'true';

        const rodadaInicial = parseInt(inputInicial.value);
        if (!rodadaInicial || rodadaInicial < 1 || rodadaInicial > RODADA_FINAL_CAMPEONATO) return;

        const liga = this.ligas.find(l => l._id === this.ligaId);
        const totalParticipantes = (liga?.participantes || liga?.times || []).filter(t => t.ativo !== false).length;
        const eliminadosPorRodada = parseInt(document.getElementById('ruEliminadosPorRodada')?.value) || 1;
        const protecao = document.getElementById('ruProtecao')?.checked || false;

        if (totalParticipantes < 2) return;

        const eliminacoesNecessarias = totalParticipantes - 1;
        const rodadasDeEliminacao = Math.ceil(eliminacoesNecessarias / eliminadosPorRodada);
        const rodadasNecessarias = rodadasDeEliminacao + (protecao ? 1 : 0);
        const rodadaFinalCalculada = Math.min(rodadaInicial + rodadasNecessarias - 1, RODADA_FINAL_CAMPEONATO);

        inputFinal.value = rodadaFinalCalculada;
        delete inputFinal.dataset.editadoManualmente;

        // Atualizar painel de sugestao com alerta se necessario
        const painelSugestao = document.getElementById('ruSugestaoRodadas');
        if (painelSugestao) {
            const rodadasDisponiveis = RODADA_FINAL_CAMPEONATO - rodadaInicial + 1;
            const cabe = rodadasNecessarias <= rodadasDisponiveis;
            const alertaHtml = !cabe
                ? `<div style="color:var(--app-warning);margin-top:4px;font-weight:600;">
                       <span class="material-icons" style="font-size:14px;vertical-align:middle;">warning</span>
                       Precisa de ${rodadasNecessarias} rodadas mas so restam ${rodadasDisponiveis} a partir de R${rodadaInicial}. Aumente eliminados/rodada.
                   </div>`
                : '';

            painelSugestao.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <span class="material-icons" style="font-size:16px;color:var(--module-restaum-primary);">auto_awesome</span>
                    <strong style="color:var(--app-text-primary);">R${rodadaInicial} a R${rodadaFinalCalculada}</strong>
                    <span style="font-size:var(--app-font-xs);color:var(--app-text-muted);">(${rodadasNecessarias} rodadas necessarias para ${totalParticipantes} participantes)</span>
                </div>
                ${alertaHtml}
            `;
            painelSugestao.style.display = '';
        }
    }

    /**
     * Chamado quando o admin altera manualmente o campo de rodada final
     */
    onRodadaManualChange(inputId) {
        const input = document.getElementById(inputId);
        if (input) input.dataset.editadoManualmente = 'true';
    }

    /**
     * Reseta flags de edicao manual e recalcula sugestao
     */
    resetarSugestao() {
        const inputInicial = document.getElementById('ruRodadaInicial');
        const inputFinal = document.getElementById('ruRodadaFinal');
        if (inputInicial) delete inputInicial.dataset.editadoManualmente;
        if (inputFinal) delete inputFinal.dataset.editadoManualmente;
        this.atualizarSugestaoRodadas();
    }

    // ==========================================================================
    // TOGGLES DE PREMIACAO
    // ==========================================================================

    onToggleVice() {
        const checkbox = document.getElementById('ruViceHabilitado');
        const input = document.getElementById('ruPremiacaoVice');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    onToggleTerceiro() {
        const checkbox = document.getElementById('ruTerceiroHabilitado');
        const input = document.getElementById('ruPremiacaoTerceiro');
        if (input) {
            input.disabled = !checkbox?.checked;
            input.style.opacity = checkbox?.checked ? '1' : '0.4';
        }
    }

    atualizarTaxaPreview() {
        const fluxoEl = document.getElementById('ruFluxoHabilitado');
        const previewRow = document.getElementById('ruTaxaPreviewRow');
        if (!previewRow) return;

        if (!fluxoEl?.checked) {
            previewRow.style.display = 'none';
            return;
        }
        previewRow.style.display = '';

        const liga = this.ligas.find(l => l._id === this.ligaId);
        const totalPart = (liga?.participantes || liga?.times || []).filter(t => t.ativo !== false).length;

        const campeao = parseFloat(document.getElementById('ruPremiacaoCampeao')?.value) || 0;
        const viceHab = document.getElementById('ruViceHabilitado')?.checked !== false;
        const vice = viceHab ? (parseFloat(document.getElementById('ruPremiacaoVice')?.value) || 0) : 0;
        const terceiroHab = document.getElementById('ruTerceiroHabilitado')?.checked !== false;
        const terceiro = terceiroHab ? (parseFloat(document.getElementById('ruPremiacaoTerceiro')?.value) || 0) : 0;

        const numGanhadores = 2 + (terceiroHab ? 1 : 0);
        const pool = campeao + vice + terceiro;
        const payers = totalPart - numGanhadores;
        const taxa = payers > 0 ? Math.trunc(pool / payers * 100) / 100 : 0;

        const valorEl = document.getElementById('ruTaxaPreviewValor');
        const detalheEl = document.getElementById('ruTaxaPreviewDetalhe');
        if (valorEl) valorEl.textContent = `R$ ${taxa.toFixed(2).replace('.', ',')}`;
        if (detalheEl) detalheEl.textContent = `(pool R$ ${pool.toFixed(0)} ÷ ${payers} pagadores)`;
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

            <!-- Form: Criar Nova / Editar Edicao -->
            <div class="ru-card" id="ruFormCard">
                <div class="ru-card-header">
                    <span class="ru-card-title" id="ruFormTitulo">
                        <span class="material-icons">add_circle</span>
                        Criar Nova Edicao
                    </span>
                    <button id="ruBtnNovaEdicao" style="display:none;background:none;border:1px solid var(--app-border);color:var(--app-text-muted);padding:4px 10px;border-radius:var(--app-radius-md);cursor:pointer;font-size:var(--app-font-xs);"
                            onclick="window.adminRestaUm.limparFormParaNova()">
                        <span class="material-icons" style="font-size:14px;vertical-align:middle;">add</span> Nova
                    </button>
                </div>

                <!-- Banner de edicao (visivel ao editar) -->
                <div id="ruEditBanner" style="display:none;background:var(--module-restaum-muted);border:1px solid var(--module-restaum-border);border-radius:var(--app-radius-md);padding:var(--app-space-2) var(--app-space-3);margin-bottom:var(--app-space-3);font-size:var(--app-font-sm);">
                    <span class="material-icons" style="font-size:16px;vertical-align:middle;color:var(--module-restaum-primary);">edit</span>
                    <span id="ruEditBannerText"></span>
                </div>

                <div class="ru-form-row-2col">
                    <div>
                        <label>Eliminados por Rodada</label>
                        <select id="ruEliminadosPorRodada" onchange="window.adminRestaUm.resetarSugestao()">
                            <option value="1" selected>1 eliminado</option>
                            <option value="2">2 eliminados</option>
                            <option value="3">3 eliminados</option>
                        </select>
                    </div>
                    <div class="ru-form-checkbox">
                        <input type="checkbox" id="ruProtecao" onchange="window.adminRestaUm.resetarSugestao()">
                        <span>Protecao na 1a rodada</span>
                    </div>
                </div>

                <!-- Painel de Sugestao Inteligente -->
                <div id="ruSugestaoRodadas" class="ru-sugestao-rodadas" style="display:none;"></div>

                <div class="ru-form-row">
                    <div>
                        <label>Numero da Edicao</label>
                        <input type="number" id="ruNovaEdicao" value="${totalEdicoes + 1}" min="1" max="10">
                    </div>
                    <div>
                        <label>Rodada Inicial</label>
                        <input type="number" id="ruRodadaInicial" value="" min="1" max="38" placeholder="Ex: 1"
                               oninput="window.adminRestaUm.onRodadaInicialChange()">
                    </div>
                    <div>
                        <label>Rodada Final</label>
                        <input type="number" id="ruRodadaFinal" value="" min="1" max="38" placeholder="Ex: 19"
                               onfocus="window.adminRestaUm.onRodadaManualChange('ruRodadaFinal')">
                    </div>
                </div>

                <div class="ru-form-section">Premiacao (R$)</div>
                <div class="ru-form-row">
                    <div>
                        <label>Campeao</label>
                        <input type="number" id="ruPremiacaoCampeao" value="100" min="0" step="10"
                               oninput="window.adminRestaUm.atualizarTaxaPreview()">
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="ruViceHabilitado" checked
                                   onchange="window.adminRestaUm.onToggleVice(); window.adminRestaUm.atualizarTaxaPreview();"
                                   style="width:auto;margin:0;">
                            Vice
                        </label>
                        <input type="number" id="ruPremiacaoVice" value="50" min="0" step="10"
                               oninput="window.adminRestaUm.atualizarTaxaPreview()">
                    </div>
                    <div>
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="ruTerceiroHabilitado" checked
                                   onchange="window.adminRestaUm.onToggleTerceiro(); window.adminRestaUm.atualizarTaxaPreview();"
                                   style="width:auto;margin:0;">
                            Terceiro
                        </label>
                        <input type="number" id="ruPremiacaoTerceiro" value="25" min="0" step="5"
                               oninput="window.adminRestaUm.atualizarTaxaPreview()">
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

                <div class="ru-form-section">Fluxo Financeiro Automatico</div>
                <div class="ru-form-row">
                    <div class="ru-form-checkbox">
                        <input type="checkbox" id="ruFluxoHabilitado"
                               onchange="window.adminRestaUm.atualizarTaxaPreview()">
                        <span>Lancar debitos/creditos automaticamente ao eliminar</span>
                    </div>
                </div>
                <div id="ruTaxaPreviewRow" style="display:none;font-size:var(--app-font-sm);color:var(--app-text-muted);margin-top:var(--app-space-1);padding:var(--app-space-2) var(--app-space-3);background:var(--module-restaum-muted);border-radius:var(--app-radius-md);">
                    <span class="material-icons" style="font-size:14px;vertical-align:middle;color:var(--module-restaum-primary);">calculate</span>
                    Taxa por eliminado: <strong id="ruTaxaPreviewValor" style="color:var(--app-text-primary);">R$ 0,00</strong>
                    <span id="ruTaxaPreviewDetalhe" style="color:var(--app-text-muted);margin-left:4px;"></span>
                </div>

                <!-- Botoes contextuais -->
                <div style="display:flex;gap:var(--app-space-2);margin-top:var(--app-space-2);">
                    <button class="ru-btn ru-btn-primary" id="ruBtnCriar" onclick="window.adminRestaUm.criarEdicao()">
                        <span class="material-icons">rocket_launch</span>
                        Criar Edicao
                    </button>
                    <button class="ru-btn ru-btn-salvar" id="ruBtnSalvar" onclick="window.adminRestaUm.salvarConfiguracoes()" style="display:none;">
                        <span class="material-icons">save</span>
                        Salvar Configuracoes
                    </button>
                </div>
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

        // Disparar calculo de sugestao apos render
        this.atualizarSugestaoRodadas();
    }

    renderEdicaoCard(edicao) {
        const statusLabel = { pendente: 'Pendente', em_andamento: 'Em Andamento', finalizada: 'Finalizada' };
        const isEditavel = edicao.status !== 'finalizada';
        const btnEditar = isEditavel
            ? `<button class="ru-btn-ghost" title="Editar configuracoes"
                       onclick="event.stopPropagation(); window.adminRestaUm.selecionarEdicao(${edicao.edicao})">
                   <span class="material-icons" style="font-size:14px;">edit</span> Editar
               </button>`
            : '';
        const btnDeletar = edicao.status === 'pendente'
            ? `<button class="ru-btn-deletar-edicao" title="Deletar edicao pendente"
                       onclick="event.stopPropagation(); window.adminRestaUm.deletarEdicao(${edicao.edicao})">
                   <span class="material-icons" style="font-size:14px;">delete</span> Deletar
               </button>`
            : '';
        return `
            <div class="ru-edicao-card">
                <div class="ru-edicao-info" onclick="window.adminRestaUm.selecionarEdicao(${edicao.edicao})">
                    <span class="material-icons" style="color:var(--module-restaum-primary);font-size:1.25rem;">sports_kabaddi</span>
                    <div>
                        <div class="ru-edicao-nome">${escapeHtml(edicao.nome || edicao.edicao + 'a Edicao')}</div>
                        <div class="ru-edicao-rodadas">R${edicao.rodadaInicial} - R${edicao.rodadaFinal} | ${edicao.totalParticipantes || 0} participantes | ${edicao.vivosRestantes || 0} vivos</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${btnEditar}
                    ${btnDeletar}
                    <span class="ru-edicao-status ${edicao.status}">${statusLabel[edicao.status] || edicao.status}</span>
                </div>
            </div>
        `;
    }

    async deletarEdicao(edicaoNum) {
        const confirmMsg = `Confirma a exclusao da Edicao ${edicaoNum}?\n\nEsta acao e irreversivel. Apenas edicoes pendentes podem ser deletadas.`;
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/edicoes/${edicaoNum}`, {
                method: 'DELETE',
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (window.SuperModal) {
                    SuperModal.toast.success(data.mensagem || `Edicao ${edicaoNum} deletada`);
                } else {
                    alert(data.mensagem || `Edicao ${edicaoNum} deletada`);
                }
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) {
                    SuperModal.toast.error(data.error || 'Erro ao deletar edicao');
                } else {
                    alert(data.error || 'Erro ao deletar edicao');
                }
            }
        } catch (err) {
            console.error('[ADMIN-RU] Erro ao deletar edicao:', err);
            if (window.SuperModal) {
                SuperModal.toast.error('Erro de conexao ao deletar edicao');
            }
        }
    }

    // ==========================================================================
    // SELECIONAR EDICAO → VER PARTICIPANTES + HISTORICO
    // ==========================================================================

    async selecionarEdicao(edicaoNum) {
        this.edicaoSelecionada = edicaoNum;

        // Carregar dados da edicao no form
        this.carregarEdicaoNoForm(edicaoNum);

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
            const isLive = data.isLive === true;

            const participantes = data.participantes || [];
            if (participantes.length === 0) {
                partLista.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;padding:var(--app-space-3);">Nenhum participante</p>';
            } else {
                partLista.innerHTML = participantes.map(p => `
                    <div class="ru-participante-row">
                        <img src="/escudos/${p.escudoId || 'default'}.png"
                             onerror="this.src='/escudos/default.png'" alt="">
                        <span class="ru-participante-nome">${escapeHtml(p.nomeTime || p.nomeCartoleiro || 'Time')}</span>
                        <span class="ru-participante-pontos">
                            ${isLive && p.pontosRodada != null
                                ? `${(Math.trunc((p.pontosRodada || 0) * 100) / 100).toFixed(2)} pts <small style="color:var(--app-warning);font-size:10px;opacity:0.85;">PARCIAL</small>`
                                : `${(Math.trunc((p.pontosAcumulados || 0) * 100) / 100).toFixed(2)} pts`
                            }
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
                                <span class="ru-timeline-nome">${escapeHtml(e.nomeTime || 'Time')}</span>
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
    // CARREGAR EDICAO NO FORM / SALVAR CONFIGURACOES
    // ==========================================================================

    /**
     * Carrega os dados de uma edicao existente no form para edicao.
     * Chamado ao clicar numa edicao na lista.
     */
    carregarEdicaoNoForm(edicaoNum) {
        const ed = this.edicoes.find(e => e.edicao === edicaoNum);
        if (!ed) return;

        this.edicaoEditando = ed;
        const isPendente = ed.status === 'pendente';
        const isFinalizada = ed.status === 'finalizada';

        // Atualizar titulo e banner
        const titulo = document.getElementById('ruFormTitulo');
        if (titulo) titulo.innerHTML = `<span class="material-icons">edit</span> Editar ${escapeHtml(ed.nome || ed.edicao + 'a Edicao')}`;

        const banner = document.getElementById('ruEditBanner');
        const bannerText = document.getElementById('ruEditBannerText');
        if (banner && bannerText) {
            const statusLabel = { pendente: 'Pendente', em_andamento: 'Em Andamento', finalizada: 'Finalizada' };
            bannerText.textContent = `Editando edicao ${ed.edicao} (${statusLabel[ed.status] || ed.status})` +
                (!isPendente ? ' — Eliminados/rodada e protecao nao editaveis' : '');
            banner.style.display = '';
        }

        // Botoes
        const btnCriar = document.getElementById('ruBtnCriar');
        const btnSalvar = document.getElementById('ruBtnSalvar');
        const btnNova = document.getElementById('ruBtnNovaEdicao');
        if (btnCriar) btnCriar.style.display = 'none';
        if (btnSalvar) btnSalvar.style.display = isFinalizada ? 'none' : '';
        if (btnNova) btnNova.style.display = '';

        // Preencher campos
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        setVal('ruNovaEdicao', ed.edicao);
        setVal('ruRodadaInicial', ed.rodadaInicial);
        setVal('ruRodadaFinal', ed.rodadaFinal);
        setVal('ruEliminadosPorRodada', ed.eliminadosPorRodada || 1);
        setChecked('ruProtecao', ed.protecaoPrimeiraRodada || false);

        // Premiacao
        setVal('ruPremiacaoCampeao', ed.premiacao?.campeao || 100);
        setVal('ruPremiacaoVice', ed.premiacao?.vice || 50);
        setChecked('ruViceHabilitado', ed.premiacao?.viceHabilitado !== false);
        setVal('ruPremiacaoTerceiro', ed.premiacao?.terceiro || 25);
        setChecked('ruTerceiroHabilitado', ed.premiacao?.terceiroHabilitado !== false);
        this.onToggleVice();
        this.onToggleTerceiro();

        // Bonus
        setChecked('ruBonusHabilitado', ed.bonusSobrevivencia?.habilitado !== false);
        setVal('ruBonusValorBase', ed.bonusSobrevivencia?.valorBase || 2);
        setVal('ruBonusIncremento', ed.bonusSobrevivencia?.incremento || 0.5);

        // Fluxo financeiro
        setChecked('ruFluxoHabilitado', ed.fluxoFinanceiroHabilitado || false);
        this.atualizarTaxaPreview();

        // Desabilitar campos que nao podem ser editados
        const edNumInput = document.getElementById('ruNovaEdicao');
        const rodIniInput = document.getElementById('ruRodadaInicial');
        const elimSelect = document.getElementById('ruEliminadosPorRodada');
        const protCheckbox = document.getElementById('ruProtecao');

        if (edNumInput) { edNumInput.disabled = true; edNumInput.style.opacity = '0.4'; }
        if (rodIniInput) { rodIniInput.disabled = !isPendente; rodIniInput.style.opacity = isPendente ? '1' : '0.4'; }
        if (elimSelect) { elimSelect.disabled = !isPendente; elimSelect.style.opacity = isPendente ? '1' : '0.4'; }
        if (protCheckbox) { protCheckbox.disabled = !isPendente; protCheckbox.style.opacity = isPendente ? '1' : '0.4'; }

        // Scroll para o form
        document.getElementById('ruFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Limpa o form e volta para modo "Criar Nova Edicao"
     */
    limparFormParaNova() {
        this.edicaoEditando = null;

        const liga = this.ligas.find(l => l._id === this.ligaId);
        const totalEdicoes = this.edicoes.length;

        // Titulo e banner
        const titulo = document.getElementById('ruFormTitulo');
        if (titulo) titulo.innerHTML = `<span class="material-icons">add_circle</span> Criar Nova Edicao`;

        const banner = document.getElementById('ruEditBanner');
        if (banner) banner.style.display = 'none';

        // Botoes
        const btnCriar = document.getElementById('ruBtnCriar');
        const btnSalvar = document.getElementById('ruBtnSalvar');
        const btnNova = document.getElementById('ruBtnNovaEdicao');
        if (btnCriar) btnCriar.style.display = '';
        if (btnSalvar) btnSalvar.style.display = 'none';
        if (btnNova) btnNova.style.display = 'none';

        // Resetar valores default
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        setVal('ruNovaEdicao', totalEdicoes + 1);
        setVal('ruRodadaInicial', '');
        setVal('ruRodadaFinal', '');
        setVal('ruEliminadosPorRodada', '1');
        setChecked('ruProtecao', false);
        setVal('ruPremiacaoCampeao', 100);
        setVal('ruPremiacaoVice', 50);
        setChecked('ruViceHabilitado', true);
        setVal('ruPremiacaoTerceiro', 25);
        setChecked('ruTerceiroHabilitado', true);
        this.onToggleVice();
        this.onToggleTerceiro();
        setChecked('ruBonusHabilitado', true);
        setVal('ruBonusValorBase', 2);
        setVal('ruBonusIncremento', 0.5);
        setChecked('ruFluxoHabilitado', false);
        this.atualizarTaxaPreview();

        // Reabilitar campos
        ['ruNovaEdicao', 'ruRodadaInicial', 'ruEliminadosPorRodada', 'ruProtecao'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = false; el.style.opacity = '1'; }
        });

        // Recalcular sugestao
        const ini = document.getElementById('ruRodadaInicial');
        const fin = document.getElementById('ruRodadaFinal');
        if (ini) delete ini.dataset.editadoManualmente;
        if (fin) delete fin.dataset.editadoManualmente;
        this.atualizarSugestaoRodadas();
    }

    /**
     * Salva configuracoes de uma edicao existente via PUT
     */
    async salvarConfiguracoes() {
        if (!this.edicaoEditando) return;

        const edicaoNum = this.edicaoEditando.edicao;
        const viceHabilitado = document.getElementById('ruViceHabilitado')?.checked !== false;
        const terceiroHabilitado = document.getElementById('ruTerceiroHabilitado')?.checked !== false;

        const body = {
            rodadaFinal: parseInt(document.getElementById('ruRodadaFinal')?.value) || undefined,
            eliminadosPorRodada: parseInt(document.getElementById('ruEliminadosPorRodada')?.value) || undefined,
            protecaoPrimeiraRodada: document.getElementById('ruProtecao')?.checked || false,
            premiacao: {
                campeao: parseFloat(document.getElementById('ruPremiacaoCampeao')?.value) || 100,
                vice: viceHabilitado ? (parseFloat(document.getElementById('ruPremiacaoVice')?.value) || 50) : 0,
                viceHabilitado,
                terceiro: terceiroHabilitado ? (parseFloat(document.getElementById('ruPremiacaoTerceiro')?.value) || 25) : 0,
                terceiroHabilitado,
            },
            bonusSobrevivencia: {
                habilitado: document.getElementById('ruBonusHabilitado')?.checked !== false,
                valorBase: parseFloat(document.getElementById('ruBonusValorBase')?.value) || 2,
                incremento: parseFloat(document.getElementById('ruBonusIncremento')?.value) || 0.5,
            },
            fluxoFinanceiroHabilitado: document.getElementById('ruFluxoHabilitado')?.checked || false,
        };

        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/editar/${edicaoNum}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.success) {
                if (window.SuperModal) {
                    SuperModal.toast.success(`Edicao ${edicaoNum} atualizada!`);
                }
                this.edicaoEditando = null;
                await this.carregarDashboard();
            } else {
                if (window.SuperModal) {
                    SuperModal.toast.error(data.error || 'Erro ao salvar');
                } else {
                    alert(data.error || 'Erro ao salvar');
                }
            }
        } catch (err) {
            console.error('[ADMIN-RU] Erro ao salvar configuracoes:', err);
            if (window.SuperModal) {
                SuperModal.toast.error('Erro de conexao ao salvar');
            }
        }
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
        const viceHabilitado = document.getElementById('ruViceHabilitado')?.checked !== false;
        const premiacaoVice = viceHabilitado ? (parseFloat(document.getElementById('ruPremiacaoVice')?.value) || 50) : 0;
        const terceiroHabilitado = document.getElementById('ruTerceiroHabilitado')?.checked !== false;
        const premiacaoTerceiro = terceiroHabilitado ? (parseFloat(document.getElementById('ruPremiacaoTerceiro')?.value) || 25) : 0;
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

        // Validar se rodadas sao suficientes para a disputa acontecer
        const liga = this.ligas.find(l => l._id === this.ligaId);
        const totalParticipantes = (liga?.participantes || liga?.times || []).filter(t => t.ativo !== false).length;
        const eliminacoesNecessarias = totalParticipantes - 1;
        const rodadasDisponiveis = rodadaFinal - rodadaInicial + 1 - (protecaoPrimeiraRodada ? 1 : 0);
        const eliminacoesPossiveis = rodadasDisponiveis * eliminadosPorRodada;

        if (eliminacoesPossiveis < eliminacoesNecessarias) {
            const msg = `Rodadas insuficientes! ${totalParticipantes} participantes precisam de ${eliminacoesNecessarias} eliminacoes, mas o intervalo R${rodadaInicial}-R${rodadaFinal} so comporta ${eliminacoesPossiveis} eliminacoes (${eliminadosPorRodada}/rodada).`;
            if (window.SuperModal) {
                SuperModal.toast.warn(msg);
            } else {
                alert(msg);
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
                    premiacao: {
                        campeao: premiacaoCampeao,
                        vice: premiacaoVice,
                        viceHabilitado,
                        terceiro: premiacaoTerceiro,
                        terceiroHabilitado,
                    },
                    bonusSobrevivencia: { habilitado: bonusHabilitado, valorBase: bonusValorBase, incremento: bonusIncremento },
                    fluxoFinanceiroHabilitado: document.getElementById('ruFluxoHabilitado')?.checked || false,
                }),
            });

            const data = await res.json();

            if (data.success) {
                if (window.SuperModal) {
                    SuperModal.toast.success(`Edicao ${edicao} criada com ${data.participantes} participantes!`);
                }
                await this.carregarDashboard();
                // Auto-selecionar a edicao recem-criada para edição imediata
                await this.selecionarEdicao(edicao);
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
