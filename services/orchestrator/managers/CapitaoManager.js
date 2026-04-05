/**
 * CAPITAO MANAGER v2.0.0
 * Módulo OPCIONAL - Capitão de Luxo (ranking de pontuação dos capitães)
 *
 * STATUS: IMPLEMENTADO — Hooks de consolidação automáticos.
 *
 * FLUXO AUTOMÁTICO (orchestrator):
 *   1. onRoundFinalize → consolidarRankingCapitao(ligaId, temporada, rodada) [await]
 *   2. onConsolidate   → consolidarRankingCapitao(ligaId, temporada, rodada) [await]
 *
 * FLUXO MANUAL (ainda disponível via admin):
 *   1. Admin clica "Consolidar" → POST /api/capitao/:ligaId/consolidar
 *   Controller: capitaoController.js
 *   Service: capitaoService.js
 *
 * NOTA: consolidarRankingCapitao faz a coleta via API Cartola internamente
 * (calcularEstatisticasCapitao por participante). Não precisa de onMarketClose separado.
 */
import BaseManager from './BaseManager.js';
import { consolidarRankingCapitao } from '../../capitaoService.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

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
    }

    // Não há ação automática ao fechar mercado (consolidarRankingCapitao faz tudo)
    async onMarketClose(ctx) {
        return { aguardando: true, rodada: ctx.rodada };
    }

    // Não há ação automática ao abrir mercado
    async onMarketOpen(ctx) {
        return { pronto: true };
    }

    // Rodada finalizou: consolida ranking acumulado até esta rodada
    async onRoundFinalize(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[CAPITAO-MANAGER] onRoundFinalize: consolidando ranking até R${rodada} liga ${ligaId}`);

        try {
            await consolidarRankingCapitao(ligaId, CURRENT_SEASON, rodada);
            console.log(`[CAPITAO-MANAGER] Ranking R${rodada} consolidado com sucesso`);
            return { pronto: true, rodada };
        } catch (err) {
            console.error(`[CAPITAO-MANAGER] Erro na consolidação R${rodada}:`, err.message);
            return { pronto: false, erro: err.message };
        }
    }

    // ✅ Fix LIVE-02: onConsolidate não re-consolida (onRoundFinalize já fez)
    // Evita 2x 760 API calls redundantes por rodada
    async onConsolidate(ctx) {
        const { rodada } = ctx;
        console.log(`[CAPITAO-MANAGER] onConsolidate: R${rodada} já consolidado em onRoundFinalize, skip`);
        return { consolidado: true, rodada, skipped: true };
    }
}
