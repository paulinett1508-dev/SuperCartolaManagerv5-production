/**
 * MELHOR MES MANAGER v2.0.0
 * Módulo OPCIONAL - Prêmio melhor do mês (competição mensal por edições)
 *
 * STATUS: IMPLEMENTADO — Hooks de consolidação automáticos.
 *
 * FLUXO AUTOMÁTICO (orchestrator):
 *   1. onRoundFinalize → forcarReconsolidacao(ligaId, rodada, temporada) [await]
 *   2. onConsolidate   → forcarReconsolidacao(ligaId, rodada, temporada) [await]
 *
 * FLUXO MANUAL (ainda disponível via admin):
 *   1. Admin abre tela Melhor do Mês → Frontend calcula rankings via orquestrador
 *   2. Frontend salva cache via melhorMesService.js
 *   Service: melhorMesService.js
 *   Frontend: melhor-mes-orquestrador.js
 *
 * NOTA: forcarReconsolidacao recalcula ignorando imutabilidade do cache existente.
 * Ideal para ser chamado após consolidação de cada rodada.
 */
import BaseManager from './BaseManager.js';
import { forcarReconsolidacao } from '../../melhorMesService.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

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

    // Rodada finalizou: recalcular ranking do mês incluindo esta rodada
    async onRoundFinalize(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[MELHOR-MES-MANAGER] onRoundFinalize: reconsolidando após R${rodada} liga ${ligaId}`);

        try {
            await forcarReconsolidacao(ligaId, rodada, CURRENT_SEASON);
            console.log(`[MELHOR-MES-MANAGER] Reconsolidação R${rodada} concluída`);
            return { pronto: true, rodada };
        } catch (err) {
            console.error(`[MELHOR-MES-MANAGER] Erro na reconsolidação R${rodada}:`, err.message);
            return { pronto: false, erro: err.message };
        }
    }

    // Consolida ranking definitivo do mês
    async onConsolidate(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[MELHOR-MES-MANAGER] onConsolidate: reconsolidando definitivo R${rodada} liga ${ligaId}`);

        try {
            await forcarReconsolidacao(ligaId, rodada, CURRENT_SEASON);
            console.log(`[MELHOR-MES-MANAGER] Consolidação definitiva R${rodada} concluída`);
            return { consolidado: true, rodada };
        } catch (err) {
            console.error(`[MELHOR-MES-MANAGER] Erro na consolidação definitiva R${rodada}:`, err.message);
            return { consolidado: false, erro: err.message };
        }
    }
}
