/**
 * COPA SC MANAGER v1.0.0
 *
 * Gerente do módulo Copa de Times SC — integrado ao orchestrador.
 * Executa pós-rodada para processar atualizações de placar e avanço de fases.
 *
 * Hook:
 * - onConsolidate: Processa confrontos da rodada e avança fases automaticamente
 *
 * Dependências: ranking_geral (para desempates)
 */
import BaseManager from './BaseManager.js';
import { processarRodada } from '../../copaSCProcessorService.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default class CopaSCManager extends BaseManager {
    constructor() {
        super({
            id: 'copa_sc',
            nome: 'Copa de Times SC',
            moduloKey: 'copaSC',
            sempreAtivo: false,
            dependencias: ['ranking_geral'],
            prioridade: 75,
            temColeta: false,
            temFinanceiro: true,
        });
    }

    /**
     * Processa confrontos e avanço de fase pós-rodada
     *
     * @param {Object} ctx - Contexto da rodada
     * @param {string} ctx.ligaId - ID da liga
     * @param {number} ctx.rodada - Número da rodada
     * @param {number} ctx.temporada - Temporada (padrão: CURRENT_SEASON)
     */
    async onConsolidate(ctx) {
        const { ligaId, rodada, temporada = CURRENT_SEASON } = ctx;

        try {
            await processarRodada(Number(rodada), ligaId, Number(temporada));
            console.log(`[COPA-SC] R${rodada} processada — liga ${ligaId}`);
        } catch (err) {
            console.error(
                `[COPA-SC] Erro ao processar R${rodada} liga ${ligaId}:`,
                err.message || err
            );
        }
    }
}
