// =============================================
// CONSOLIDACAO SCHEDULER - v1.0
// =============================================
// Scheduler centralizado para detectar rodadas consolidadas.
// Monitora o status do mercado a cada 5 minutos e dispara o
// evento 'consolidacao-detectada' quando detecta que uma rodada
// foi encerrada (mercado fechado → aberto).
//
// Complementa o LuvaDeOuroScheduler (que tem lógica própria de coleta).
// Este scheduler apenas notifica — cada módulo decide como reagir.
// =============================================

const ConsolidacaoScheduler = {
    config: {
        intervalo: 5 * 60 * 1000, // 5 minutos
    },

    estado: {
        ativo: false,
        intervalId: null,
        mercadoAberto: null,      // null = ainda não verificou
        rodadaAtual: null,
        ultimaConsolidacao: null, // Última rodada que disparou o evento
    },

    iniciar() {
        if (this.estado.ativo) return;
        this.estado.ativo = true;

        // Verificar imediatamente ao iniciar
        this.verificar();

        this.estado.intervalId = setInterval(() => {
            this.verificar();
        }, this.config.intervalo);

        console.log('[CONSOLIDACAO-SCHEDULER] Ativo — verificando a cada 5min');
    },

    parar() {
        if (this.estado.intervalId) {
            clearInterval(this.estado.intervalId);
            this.estado.intervalId = null;
        }
        this.estado.ativo = false;
        console.log('[CONSOLIDACAO-SCHEDULER] Parado');
    },

    async verificar() {
        try {
            const response = await fetch('/api/cartola/mercado/status');
            if (!response.ok) return;

            const status = await response.json();
            const mercadoAberto = status.mercado_aberto === true;
            const rodadaAtual   = status.rodada_atual || null;

            // Detectar transição: mercado estava fechado e agora abriu
            // Isso significa que a rodada anterior foi encerrada/consolidada
            const mercadoAcabouDeAbrir =
                this.estado.mercadoAberto === false && mercadoAberto === true;

            const rodadaAnterior = this.estado.rodadaAtual;

            // Atualizar estado
            this.estado.mercadoAberto = mercadoAberto;
            this.estado.rodadaAtual   = rodadaAtual;

            if (mercadoAcabouDeAbrir && rodadaAnterior) {
                // Evitar disparar o mesmo evento duas vezes para a mesma rodada
                if (this.estado.ultimaConsolidacao === rodadaAnterior) return;
                this.estado.ultimaConsolidacao = rodadaAnterior;

                console.log(`[CONSOLIDACAO-SCHEDULER] Rodada ${rodadaAnterior} encerrada — disparando evento`);
                this._dispararEvento(rodadaAnterior);
            }
        } catch (error) {
            // Silencioso — não deve interromper o fluxo
        }
    },

    _dispararEvento(rodada) {
        const evento = new CustomEvent('consolidacao-detectada', {
            detail: {
                rodada,
                timestamp: new Date().toISOString(),
            },
        });
        window.dispatchEvent(evento);
    },

    // Força disparo manual (útil para testes no console)
    forcarEvento(rodada) {
        const r = rodada || this.estado.rodadaAtual || 1;
        console.log(`[CONSOLIDACAO-SCHEDULER] Forçando evento para rodada ${r}`);
        this._dispararEvento(r);
    },

    getStatus() {
        return { ...this.estado };
    },
};

window.ConsolidacaoScheduler = ConsolidacaoScheduler;

// Auto-iniciar quando a página carrega
(function () {
    const iniciar = () => ConsolidacaoScheduler.iniciar();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
