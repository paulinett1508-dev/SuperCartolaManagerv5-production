/**
 * MATA-MATA MANAGER v1.1.0
 * Módulo OPCIONAL - Confrontos eliminatórios
 *
 * STATUS: STUBS — Hooks registrados mas NÃO executam cálculos automaticamente.
 *
 * FLUXO ATUAL (manual via admin):
 *   1. Admin abre tela Mata-Mata → Frontend calcula fases via orquestrador
 *   2. Frontend salva cache → POST /api/mata-mata/cache/:ligaId/:edicao
 *   Controller: mataMataCacheController.js
 *   Frontend: mata-mata-orquestrador.js (coordena módulos)
 *
 * FUTURO: Quando o orchestrator for implementado end-to-end, estes hooks
 * devem delegar ao controller via chamadas internas.
 */
import BaseManager from './BaseManager.js';

export default class MataMataManager extends BaseManager {
    constructor() {
        super({
            id: 'mata_mata',
            nome: 'Mata-Mata',
            moduloKey: 'mataMata',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 45,
            temColeta: false,
            temFinanceiro: false,
        });
    }

    async onRoundFinalize(ctx) {
        return { pronto: false, stub: true, rodada: ctx.rodada };
    }

    async onConsolidate(ctx) {
        return { consolidado: false, stub: true, rodada: ctx.rodada };
    }
}
