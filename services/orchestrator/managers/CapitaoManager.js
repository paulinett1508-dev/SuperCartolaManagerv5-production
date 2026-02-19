/**
 * CAPITAO MANAGER v1.1.0
 * Módulo OPCIONAL - Capitão de Luxo (ranking de pontuação dos capitães)
 *
 * STATUS: STUBS — Hooks registrados mas NÃO executam coleta automaticamente.
 *
 * FLUXO ATUAL (manual via admin):
 *   1. Admin clica "Consolidar" → POST /api/capitao/:ligaId/consolidar
 *   Controller: capitaoController.js (v1.1.0)
 *   Service: capitaoService.js (busca dados da API Cartola por rodada)
 *
 * FUTURO: Quando o orchestrator for implementado end-to-end, estes hooks
 * devem delegar ao controller via chamadas internas (fetch localhost).
 */
import BaseManager from './BaseManager.js';

export default class CapitaoManager extends BaseManager {
    constructor() {
        super({
            id: 'capitao',
            nome: 'Capitão de Luxo',
            moduloKey: 'capitao_luxo',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 40,
            temColeta: true,
            temFinanceiro: true,
        });

        this._coletaAtiva = false;
    }

    // STUB: Coleta real é feita manualmente pelo admin via POST /:ligaId/consolidar
    async onMarketClose(ctx) {
        this._coletaAtiva = true;
        return { coletaIniciada: false, stub: true, rodada: ctx.rodada };
    }

    // STUB: Parciais são calculadas pelo controller via ranking-live endpoint
    async onLiveUpdate(ctx) {
        if (!this._coletaAtiva) return null;
        return { coletando: false, stub: true };
    }

    // STUB: Não há ação automática ao abrir mercado
    async onMarketOpen(ctx) {
        this._coletaAtiva = false;
        return { coletaEncerrada: true, stub: true };
    }

    // STUB: Consolidação é feita pelo admin via POST /:ligaId/consolidar
    async onRoundFinalize(ctx) {
        this._coletaAtiva = false;
        return { pronto: false, stub: true };
    }

    // STUB: Premiação é aplicada durante consolidação manual
    async onConsolidate(ctx) {
        return { consolidado: false, stub: true };
    }
}
