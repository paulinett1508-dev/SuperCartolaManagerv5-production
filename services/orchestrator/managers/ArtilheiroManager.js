/**
 * ARTILHEIRO MANAGER v1.1.0
 * Módulo OPCIONAL - Artilheiro Campeão (coleta gols da API Cartola)
 *
 * STATUS: STUBS — Hooks registrados mas NÃO executam coleta automaticamente.
 *
 * FLUXO ATUAL (manual via admin):
 *   1. Admin clica "Coletar" → POST /api/artilheiro-campeao/:ligaId/coletar/:rodada
 *   2. Admin clica "Consolidar" → POST /api/artilheiro-campeao/:ligaId/consolidar/:rodada
 *   3. Admin clica "Premiar" → POST /api/artilheiro-campeao/:ligaId/premiar
 *   Controller: artilheiroCampeaoController.js (v5.2.0)
 *
 * FUTURO: Quando o orchestrator for implementado end-to-end, estes hooks
 * devem delegar ao controller via chamadas internas (fetch localhost).
 */
import BaseManager from './BaseManager.js';

export default class ArtilheiroManager extends BaseManager {
    constructor() {
        super({
            id: 'artilheiro',
            nome: 'Artilheiro Campeão',
            moduloKey: 'artilheiro',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 30,
            temColeta: true,
            temFinanceiro: true,
        });

        this._coletaAtiva = false;
    }

    // STUB: Coleta real é feita manualmente pelo admin via POST /:ligaId/coletar/:rodada
    async onMarketClose(ctx) {
        this._coletaAtiva = true;
        return { coletaIniciada: false, stub: true, rodada: ctx.rodada };
    }

    // STUB: Parciais são calculadas pelo controller quando admin acessa o ranking
    async onLiveUpdate(ctx) {
        if (!this._coletaAtiva) return null;
        return { coletando: false, stub: true };
    }

    // STUB: Não há ação automática ao abrir mercado
    async onMarketOpen(ctx) {
        this._coletaAtiva = false;
        return { coletaEncerrada: true, stub: true };
    }

    // STUB: Consolidação é feita pelo admin via POST /:ligaId/consolidar/:rodada
    async onRoundFinalize(ctx) {
        this._coletaAtiva = false;
        return { pronto: false, stub: true };
    }

    // STUB: Premiação é feita pelo admin via POST /:ligaId/premiar
    async onConsolidate(ctx) {
        return { consolidado: false, stub: true };
    }
}
