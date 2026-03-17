/**
 * TOP 10 MANAGER v2.0.0
 * Módulo OPCIONAL - Mito/Mico da rodada (ranking extremos históricos)
 *
 * STATUS: IMPLEMENTADO — Invalida cache após consolidação de rodada.
 *
 * FLUXO AUTOMÁTICO (orchestrator):
 *   1. onRoundFinalize → invalida cache não-permanente da rodada consolidada
 *   2. onConsolidate   → invalida cache não-permanente da rodada consolidada
 *
 * CONTEXTO: Top10 é frontend-driven (cálculo de mitos/micos acontece no browser).
 * O backend apenas armazena e recupera o cache (Top10Cache).
 * Ao invalidar o cache não-permanente, forçamos o frontend a recalcular
 * com os dados definitivos da rodada na próxima vez que o admin abrir a tela.
 *
 * FLUXO MANUAL (ainda disponível via admin):
 *   1. Admin abre tela Top 10 → Frontend recalcula automaticamente
 *   Controller: top10CacheController.js
 *   Frontend: artilheiro-campeao.js (seção Top 10 integrada)
 */
import BaseManager from './BaseManager.js';
import Top10Cache from '../../../models/Top10Cache.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

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

    // Invalida cache da rodada que acabou de ser finalizada
    async onRoundFinalize(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[TOP10-MANAGER] onRoundFinalize: invalidando cache R${rodada} liga ${ligaId}`);

        try {
            const result = await Top10Cache.deleteMany({
                liga_id: String(ligaId),
                rodada_consolidada: rodada,
                temporada: CURRENT_SEASON,
                cache_permanente: { $ne: true },
            });
            console.log(`[TOP10-MANAGER] Cache R${rodada} invalidado: ${result.deletedCount} entradas removidas`);
            return { pronto: true, rodada, cacheInvalidado: result.deletedCount };
        } catch (err) {
            console.error(`[TOP10-MANAGER] Erro ao invalidar cache R${rodada}:`, err.message);
            return { pronto: false, erro: err.message };
        }
    }

    // Consolida: invalida cache para forçar recálculo com dados definitivos
    async onConsolidate(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[TOP10-MANAGER] onConsolidate: invalidando cache definitivo R${rodada} liga ${ligaId}`);

        try {
            const result = await Top10Cache.deleteMany({
                liga_id: String(ligaId),
                rodada_consolidada: rodada,
                temporada: CURRENT_SEASON,
                cache_permanente: { $ne: true },
            });
            console.log(`[TOP10-MANAGER] Cache definitivo R${rodada} invalidado: ${result.deletedCount} entradas`);
            return { consolidado: true, rodada, cacheInvalidado: result.deletedCount };
        } catch (err) {
            console.error(`[TOP10-MANAGER] Erro ao invalidar cache definitivo R${rodada}:`, err.message);
            return { consolidado: false, erro: err.message };
        }
    }
}
