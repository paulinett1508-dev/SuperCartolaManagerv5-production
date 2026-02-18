/**
 * MELHOR MES MANAGER v1.1.0
 * Módulo OPCIONAL - Prêmio melhor do mês (competição mensal por edições)
 *
 * STATUS: STUBS — Hooks registrados mas NÃO executam cálculos automaticamente.
 *
 * FLUXO ATUAL (manual via admin):
 *   1. Admin abre tela Melhor do Mês → Frontend calcula rankings via orquestrador
 *   2. Frontend salva cache → via melhorMesService.js
 *   Service: melhorMesService.js
 *   Frontend: melhor-mes-orquestrador.js (coordena módulos core/ui/config)
 *
 * FUTURO: Quando o orchestrator for implementado end-to-end, estes hooks
 * devem delegar ao service via chamadas internas.
 */
import BaseManager from './BaseManager.js';

export default class MelhorMesManager extends BaseManager {
    constructor() {
        super({
            id: 'melhor_mes',
            nome: 'Melhor do Mês',
            moduloKey: 'melhorMes',
            sempreAtivo: false,
            dependencias: ['ranking_geral'],
            prioridade: 60,
            temColeta: false,
            temFinanceiro: true,
        });
    }

    async onRoundFinalize(ctx) {
        return { pronto: false, stub: true, rodada: ctx.rodada };
    }

    async onConsolidate(ctx) {
        return { consolidado: false, stub: true, rodada: ctx.rodada };
    }
}
