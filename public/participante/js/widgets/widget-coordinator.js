/**
 * WIDGET COORDINATOR v1.1
 * ========================
 * Coordena exibicao de widgets flutuantes baseado em estado do mercado
 * Garante que apenas um widget esteja visivel por vez
 *
 * v1.1 - Fix: usar campos reais da API Cartola (status_mercado)
 *        em vez de rodada_em_andamento (campo inexistente)
 *
 * Widgets gerenciados:
 * - WhatsHappening (foguinho): mercado fechado (status_mercado === 2)
 * - RoundXray (bola): mercado aberto (status_mercado === 1)
 *
 * Campos reais da API /api/cartola/mercado-status:
 * - status_mercado: 1=ABERTO, 2=FECHADO, 3=DESBLOQUEADO, 4=ENCERRADO, 6=TEMPORADA_ENCERRADA
 * - rodada_atual: numero da rodada corrente
 * - bola_rolando: boolean (indica que parciais existem, NAO necessariamente jogos ao vivo)
 * - temporada: ano da temporada
 */

if (window.Log) Log.info("[WIDGET-COORD] Coordenador v1.1 carregando...");

class WidgetCoordinator {
    constructor() {
        this.mercadoStatus = null;
        this.participante = null;
        this.checkInterval = null;
        this.CHECK_INTERVAL_MS = 60000; // 60 segundos
    }

    /**
     * Inicializa o coordenador
     */
    init(participante) {
        this.participante = participante;

        if (window.Log) Log.info("[WIDGET-COORD] Inicializando coordenador...");

        // Verificar estado imediatamente
        this.verificarEstadoMercado();

        // Iniciar monitoramento periodico
        this.iniciarMonitoramento();
    }

    /**
     * Inicia monitoramento periodico do estado do mercado
     */
    iniciarMonitoramento() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.checkInterval = setInterval(() => {
            this.verificarEstadoMercado();
        }, this.CHECK_INTERVAL_MS);

        if (window.Log) Log.info("[WIDGET-COORD] Monitoramento iniciado (60s)");
    }

    /**
     * Para o monitoramento
     */
    pararMonitoramento() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            if (window.Log) Log.info("[WIDGET-COORD] Monitoramento parado");
        }
    }

    /**
     * Verifica estado atual do mercado e atualiza widgets
     */
    async verificarEstadoMercado() {
        if (!this.participante || !this.participante.ligaId) {
            return;
        }

        try {
            const response = await fetch('/api/cartola/mercado-status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.mercadoStatus = await response.json();
            this.atualizarWidgets();

        } catch (error) {
            console.error("[WIDGET-COORD] Erro ao buscar status:", error);
        }
    }

    /**
     * Atualiza widgets baseado no estado do mercado
     */
    atualizarWidgets() {
        if (!this.mercadoStatus) return;

        const { status_mercado, rodada_atual } = this.mercadoStatus;

        // Decisao: qual widget mostrar?
        if (this.deveExibirRaioX()) {
            // Rodada consolidada + mercado aberto
            this.exibirRaioX();
            this.esconderWhatsHappening();
        } else if (this.deveExibirWhatsHappening()) {
            // Mercado fechado + rodada em andamento
            this.exibirWhatsHappening();
            this.esconderRaioX();
        } else {
            // Nenhum widget (pre-temporada ou outro estado)
            this.esconderAmbos();
        }
    }

    /**
     * Determina se deve exibir Raio-X
     * Condicao: mercado ABERTO (status=1) + rodada > 0 (tem dados consolidados)
     */
    deveExibirRaioX() {
        if (!this.mercadoStatus) return false;

        // Verificar se modulo esta ativo na liga
        if (!window.participanteNavigation?.verificarModuloAtivo?.('raioX')) return false;

        // Mercado aberto (status === 1) = rodada anterior consolidada
        const mercadoAberto = this.mercadoStatus.status_mercado === 1;

        // Tem rodada com dados (rodada_atual > 0)
        const temDados = this.mercadoStatus.rodada_atual > 0;

        return mercadoAberto && temDados;
    }

    /**
     * Determina se deve exibir WhatsHappening
     * Condicao: mercado FECHADO (status=2) = rodada em andamento
     */
    deveExibirWhatsHappening() {
        if (!this.mercadoStatus) return false;

        // Mercado fechado (status === 2) indica rodada em andamento
        // O WhatsHappening tem sua propria maquina de estados (WAITING/LIVE/INTERVAL/etc)
        // que determina a granularidade (jogos ao vivo vs aguardando vs intervalo)
        return this.mercadoStatus.status_mercado === 2;
    }

    /**
     * Exibe widget Raio-X
     */
    exibirRaioX() {
        if (window.RaioXWidget && window.RaioXWidget.shouldShow(this.mercadoStatus)) {
            window.RaioXWidget.show(this.participante, this.mercadoStatus);
        }
    }

    /**
     * Exibe widget WhatsHappening
     */
    exibirWhatsHappening() {
        // WhatsHappening gerencia seu proprio estado
        // Apenas garantir que esta visivel (ele tem logica interna)
    }

    /**
     * Esconde widget Raio-X
     */
    esconderRaioX() {
        if (window.RaioXWidget) {
            window.RaioXWidget.hide();
        }
    }

    /**
     * Esconde widget WhatsHappening
     */
    esconderWhatsHappening() {
        // WhatsHappening gerencia seu proprio estado
        // Nao forcar hide aqui para nao interferir com logica interna
    }

    /**
     * Esconde ambos os widgets
     */
    esconderAmbos() {
        this.esconderRaioX();
        // WhatsHappening se esconde sozinho quando nao ha dados
    }
}

// Singleton global
window.widgetCoordinator = new WidgetCoordinator();

export default window.widgetCoordinator;
