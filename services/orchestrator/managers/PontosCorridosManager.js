/**
 * PONTOS CORRIDOS MANAGER v2.0.0
 * Módulo OPCIONAL - Liga em formato pontos corridos (round-robin)
 *
 * STATUS: IMPLEMENTADO — Invalida cache após consolidação de rodada.
 *
 * FLUXO AUTOMÁTICO (orchestrator):
 *   1. onRoundFinalize → invalida cache não-permanente da rodada consolidada
 *   2. onConsolidate   → invalida cache não-permanente da rodada consolidada
 *
 * CONTEXTO: PontosCorridos é frontend-driven (cálculo acontece no browser).
 * O backend apenas armazena e recupera o cache (PontosCorridosCache).
 * Ao invalidar o cache não-permanente, forçamos o frontend a recalcular
 * com os dados definitivos da rodada na próxima vez que o admin abrir a tela.
 *
 * FLUXO MANUAL (ainda disponível via admin):
 *   1. Admin abre tela Pontos Corridos → Frontend recalcula automaticamente
 *   Controller: pontosCorridosCacheController.js
 *   Frontend: pontos-corridos-orquestrador.js
 */
import BaseManager from './BaseManager.js';
import PontosCorridosCache from '../../../models/PontosCorridosCache.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

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

    // Invalida cache da rodada que acabou de ser finalizada
    async onRoundFinalize(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[PC-MANAGER] onRoundFinalize: invalidando cache R${rodada} liga ${ligaId}`);

        try {
            const result = await PontosCorridosCache.deleteMany({
                liga_id: String(ligaId),
                rodada_consolidada: rodada,
                temporada: CURRENT_SEASON,
                cache_permanente: { $ne: true },
            });
            console.log(`[PC-MANAGER] Cache R${rodada} invalidado: ${result.deletedCount} entradas removidas`);
            return { pronto: true, rodada, cacheInvalidado: result.deletedCount };
        } catch (err) {
            console.error(`[PC-MANAGER] Erro ao invalidar cache R${rodada}:`, err.message);
            return { pronto: false, erro: err.message };
        }
    }

    // Consolida: invalida cache para forçar recálculo com dados definitivos
    async onConsolidate(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[PC-MANAGER] onConsolidate: invalidando cache definitivo R${rodada} liga ${ligaId}`);

        try {
            const result = await PontosCorridosCache.deleteMany({
                liga_id: String(ligaId),
                rodada_consolidada: rodada,
                temporada: CURRENT_SEASON,
                cache_permanente: { $ne: true },
            });
            console.log(`[PC-MANAGER] Cache definitivo R${rodada} invalidado: ${result.deletedCount} entradas`);
            return { consolidado: true, rodada, cacheInvalidado: result.deletedCount };
        } catch (err) {
            console.error(`[PC-MANAGER] Erro ao invalidar cache definitivo R${rodada}:`, err.message);
            return { consolidado: false, erro: err.message };
        }
    }
}
