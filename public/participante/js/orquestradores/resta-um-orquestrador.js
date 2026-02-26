/**
 * RESTA UM PARTICIPANTE - Módulo Frontend
 *
 * Exibe o ranking ao vivo durante rodadas em andamento.
 * Carrega pontos parciais da API e faz polling automático.
 *
 * @version 1.0.0
 */

class RestaUmModule {
    constructor() {
        this.ligaId = null;
        this.edicaoAtual = null;
        this.participantes = [];
        this.isLive = false;
        this.pollingInterval = null;
        this.pollingIntervalMs = 15000; // 15 segundos
        this.container = null;
    }

    async init(ligaId, container = null) {
        this.ligaId = ligaId;
        this.container = container || document.getElementById('restaUmDados');

        if (!this.container) {
            console.warn('[RESTA-UM] Container não encontrado');
            return false;
        }

        try {
            // Carregar dados iniciais
            await this.carregarStatus();

            // Se edição está em andamento, iniciar polling
            if (this.edicaoAtual?.status === 'em_andamento') {
                this.iniciarPolling();
            }

            return true;
        } catch (error) {
            console.error('[RESTA-UM] Erro ao inicializar:', error);
            this.renderErro();
            return false;
        }
    }

    async carregarStatus() {
        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/status`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            
            this.edicaoAtual = data.edicao;
            this.participantes = data.participantes || [];
            this.isLive = data.isLive || false;

            this.renderizar();
        } catch (error) {
            console.error('[RESTA-UM] Erro ao carregar status:', error);
            throw error;
        }
    }

    async carregarParciais() {
        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/parciais`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            
            this.edicaoAtual = data.edicao;
            this.participantes = data.participantes || [];
            this.isLive = data.isLive || false;

            this.renderizar();
        } catch (error) {
            console.error('[RESTA-UM] Erro ao carregar parciais:', error);
        }
    }

    iniciarPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log('[RESTA-UM] Iniciando polling de parciais...');
        
        // Atualizar imediatamente
        this.carregarParciais();

        // Depois a cada 15s
        this.pollingInterval = setInterval(() => {
            this.carregarParciais();
        }, this.pollingIntervalMs);
    }

    pararPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('[RESTA-UM] Polling parado');
        }
    }

    renderizar() {
        if (!this.container) return;

        // Se nenhuma edição, mostrar mensagem
        if (!this.edicaoAtual) {
            this.container.innerHTML = `
                <div class="ru-container">
                    <div class="ru-empty">
                        <p>Nenhuma edição ativa do Resta Um</p>
                    </div>
                </div>
            `;
            return;
        }

        // Separar vivos e eliminados
        const vivos = this.participantes.filter(p => p.status === 'vivo');
        const campeao = this.participantes.find(p => p.status === 'campeao');
        const eliminados = this.participantes.filter(p => p.status === 'eliminado');

        let html = `
            <div class="ru-container">
                <div class="ru-header">
                    <h2>${this.edicaoAtual.nome}</h2>
                    <span class="ru-status ${this.edicaoAtual.status}">
                        ${this._formatStatus(this.edicaoAtual.status)}
                    </span>
                </div>

                ${this.isLive ? '<div class="ru-live-badge">🔴 AO VIVO</div>' : ''}

                <div class="ru-content">
        `;

        // Se tem campeão
        if (campeao) {
            html += `
                <div class="ru-campeao">
                    <div class="ru-trophy">🏆</div>
                    <div class="ru-campeao-info">
                        <p class="ru-label">CAMPEÃO</p>
                        <p class="ru-campeao-nome">${campeao.nomeTime}</p>
                        <p class="ru-campeao-cartoleiro">${campeao.nomeCartoleiro}</p>
                    </div>
                </div>
            `;
        }

        // Rankings vivos
        if (vivos.length > 0) {
            html += '<div class="ru-ranking"><h3>Participantes Vivos</h3>';
            html += '<table class="ru-table">';
            html += '<thead><tr><th>Pos</th><th>Time</th><th>Rodada Atual</th><th>Acumulado</th><th>Rodadas Sobrevividas</th></tr></thead>';
            html += '<tbody>';

            vivos.forEach((p, idx) => {
                const sobraNome = (p.nomeTime || '').length > 20 
                    ? p.nomeTime.substring(0, 17) + '...' 
                    : p.nomeTime;
                
                html += `
                    <tr class="ru-vivo">
                        <td class="ru-pos">${idx + 1}</td>
                        <td class="ru-time">${sobraNome}</td>
                        <td class="ru-rodada-atual ${p.pontosRodada !== null ? 'hasPoints' : ''}">${p.pontosRodada != null ? p.pontosRodada.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                        <td class="ru-acumulado">${(p.pontosAcumulados || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td class="ru-rodadas">${p.rodadasSobrevividas || 0}</td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
        }

        // Eliminados
        if (eliminados.length > 0) {
            html += '<div class="ru-eliminados"><h3>Eliminados</h3>';
            html += '<table class="ru-table-eliminados">';
            html += '<thead><tr><th>Rodada</th><th>Time</th><th>Pontos Rodada</th></tr></thead>';
            html += '<tbody>';

            eliminados.forEach(p => {
                const sobraNome = (p.nomeTime || '').length > 20 
                    ? p.nomeTime.substring(0, 17) + '...' 
                    : p.nomeTime;
                
                html += `
                    <tr class="ru-eliminado">
                        <td class="ru-rodada-elim">R${p.rodadaEliminacao || '?'}</td>
                        <td class="ru-time-elim">${sobraNome}</td>
                        <td class="ru-pontos-elim">${(p.pontosRodada || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
        }

        html += '</div></div>';

        this.container.innerHTML = html;
        this._aplicarEventos();
    }

    renderErro() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="ru-container">
                <div class="ru-error">
                    <p>Erro ao carregar RestaUm</p>
                </div>
            </div>
        `;
    }

    _formatStatus(status) {
        const map = {
            'pendente': 'Pendente',
            'em_andamento': 'Em Andamento',
            'finalizada': 'Finalizada'
        };
        return map[status] || status;
    }

    _aplicarEventos() {
        // Eventual interatividade futura
    }

    destroy() {
        this.pararPolling();
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export para uso global
window.RestaUmModule = RestaUmModule;
