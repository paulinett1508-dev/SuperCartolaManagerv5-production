/**
 * TOP 10 MANAGER v1.1.0
 * Módulo OPCIONAL - Mito/Mico da rodada (ranking extremos históricos)
 *
 * STATUS: STUBS — Hooks registrados mas NÃO executam cálculos automaticamente.
 *
 * FLUXO ATUAL (manual via admin):
 *   1. Admin abre tela Top 10 → Frontend calcula mitos/micos via fluxoFinanceiroController
 *   2. Frontend salva cache → POST /api/top10/cache/:ligaId
 *   Controller: top10CacheController.js
 *   Frontend: artilheiro-campeao.js (seção Top 10 integrada)
 *
 * FUTURO: Quando o orchestrator for implementado end-to-end, estes hooks
 * devem delegar ao controller via chamadas internas.
 */
import BaseManager from './BaseManager.js';

export default class Top10Manager extends BaseManager {
    constructor() {
        super({
            id: 'top10',
            nome: 'Top 10 (Mito/Mico)',
            moduloKey: 'top10',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 55,
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
