/**
 * TOOL: rodada_atual_mercado
 *
 * Retorna a rodada atual, status do mercado e data da proxima virada,
 * lendo as mesmas fontes usadas pelo orquestrador do projeto
 * (mercadostatus, calendariorodadas, orchestrator_states).
 */

export default {
    name: 'rodada_atual_mercado',
    description:
        'Retorna a rodada atual, status do mercado (aberto/fechado/encerrado) e rodada de referencia. Use quando perguntarem "em qual rodada estamos", "o mercado esta aberto", "quando fecha o mercado", "qual a rodada".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const statusMap = {
            1: 'aberto',
            2: 'fechado (rodada em andamento)',
            4: 'encerrado',
        };

        // 1) mercadostatus (fonte primaria)
        let rodada = null;
        let statusMercado = null;
        let fonte = null;

        try {
            const m = await db.collection('mercadostatus').findOne({});
            if (m) {
                rodada = m.rodada_atual ?? null;
                statusMercado = statusMap[m.status_mercado] || null;
                fonte = 'mercadostatus';
            }
        } catch { /* continua */ }

        // 2) orchestrator_states (fallback canonico)
        if (!rodada || !statusMercado) {
            try {
                const orch = await db
                    .collection('orchestrator_states')
                    .findOne(
                        { chave: 'round_market_orchestrator' },
                        { projection: { rodada_atual: 1, status_mercado: 1 } }
                    );
                if (orch) {
                    if (!rodada && orch.rodada_atual) rodada = orch.rodada_atual;
                    if (!statusMercado && orch.status_mercado) {
                        statusMercado = statusMap[orch.status_mercado] || null;
                    }
                    fonte = fonte || 'orchestrator_states';
                }
            } catch { /* continua */ }
        }

        // 3) calendariorodadas (ultimo fallback)
        if (!rodada) {
            try {
                const temporada = ctx.temporada;
                const cal = await db
                    .collection('calendariorodadas')
                    .findOne(
                        temporada ? { temporada } : {},
                        { sort: { 'rodadas.rodada': -1 } }
                    );
                if (cal?.rodadas?.length) {
                    const agora = new Date();
                    const atual = cal.rodadas.find(r => {
                        const i = new Date(r.inicio);
                        const f = new Date(r.fim);
                        return agora >= i && agora <= f;
                    });
                    if (atual) {
                        rodada = atual.rodada;
                        fonte = fonte || 'calendariorodadas';
                    }
                }
            } catch { /* continua */ }
        }

        return {
            rodada_atual: rodada,
            status_mercado: statusMercado,
            fonte: fonte || 'nenhuma',
        };
    },
};
