/**
 * MATA-MATA MANAGER v2.0.0
 * Módulo OPCIONAL - Confrontos eliminatórios
 *
 * v2.0: Implementação real dos hooks — calcula bracket e persiste no MataMataCache
 *   durante consolidação, sem depender do admin abrir a tela manualmente.
 *
 * FLUXO:
 *   1. Orchestrator detecta consolidação → chama onRoundFinalize / onConsolidate
 *   2. Manager delega ao calcularBracketParaConsolidacao (mata-mata-backend.js)
 *   3. Bracket é calculado e persistido no MataMataCache automaticamente
 *   4. Admin pode abrir a tela a qualquer momento e verá dados atualizados
 */
import BaseManager from './BaseManager.js';
import { calcularBracketParaConsolidacao } from '../../../controllers/mata-mata-backend.js';
import logger from '../../../utils/logger.js';

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
            temFinanceiro: true,
        });
    }

    async onRoundFinalize(ctx) {
        try {
            logger.log(`[MATA-MANAGER] onRoundFinalize: liga ${ctx.ligaId}, R${ctx.rodada}`);
            const resultados = await calcularBracketParaConsolidacao(ctx.ligaId, ctx.rodada);
            return {
                pronto: true,
                rodada: ctx.rodada,
                edicoesProcessadas: resultados.length
            };
        } catch (error) {
            logger.error(`[MATA-MANAGER] Erro onRoundFinalize:`, error);
            return { pronto: false, erro: error.message, rodada: ctx.rodada };
        }
    }

    async onConsolidate(ctx) {
        try {
            logger.log(`[MATA-MANAGER] onConsolidate: liga ${ctx.ligaId}, R${ctx.rodada}`);
            const resultados = await calcularBracketParaConsolidacao(ctx.ligaId, ctx.rodada);
            return {
                consolidado: true,
                rodada: ctx.rodada,
                edicoesProcessadas: resultados.length
            };
        } catch (error) {
            logger.error(`[MATA-MANAGER] Erro onConsolidate:`, error);
            return { consolidado: false, erro: error.message, rodada: ctx.rodada };
        }
    }
}
