/**
 * PONTOS CORRIDOS MANAGER v1.1.0
 * Módulo OPCIONAL - Liga em formato pontos corridos (round-robin)
 *
 * STATUS: STUBS — Hooks registrados mas NÃO executam cálculos automaticamente.
 *
 * FLUXO ATUAL (manual via admin):
 *   1. Admin abre tela Pontos Corridos → Frontend calcula confrontos via orquestrador
 *   2. Frontend salva cache → POST /api/pontos-corridos/cache/:ligaId
 *   Controller: pontosCorridosCacheController.js (v3.0)
 *   Frontend: pontos-corridos-orquestrador.js (coordena módulos)
 *
 * FUTURO: Quando o orchestrator for implementado end-to-end, estes hooks
 * devem delegar ao controller via chamadas internas.
 */
import BaseManager from './BaseManager.js';

export default class PontosCorridosManager extends BaseManager {
    constructor() {
        super({
            id: 'pontos_corridos',
            nome: 'Pontos Corridos',
            moduloKey: 'pontosCorridos',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 50,
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
