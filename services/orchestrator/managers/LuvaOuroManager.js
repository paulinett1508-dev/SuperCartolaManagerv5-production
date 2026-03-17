/**
 * LUVA DE OURO MANAGER v2.0.0
 * Módulo OPCIONAL - Luva de Ouro (ranking de pontuação dos goleiros)
 *
 * STATUS: IMPLEMENTADO — Hooks de coleta e consolidação automáticos.
 *
 * FLUXO AUTOMÁTICO (orchestrator):
 *   1. onMarketClose  → coletarDadosGoleiros(ligaId, rodada) [background, não bloqueia]
 *   2. onLiveUpdate   → recoleta parciais a cada ciclo [background]
 *   3. onRoundFinalize→ coleta final garantida antes de consolidar [aguarda]
 *   4. onConsolidate  → consolidarRodada(ligaId, rodada) [síncrono, rápido]
 *
 * FLUXO MANUAL (ainda disponível via admin):
 *   1. Admin clica "Coletar"     → GET /api/luva-de-ouro/:ligaId/coletar
 *   2. Admin clica "Consolidar"  → POST /api/luva-de-ouro/:ligaId/consolidar
 *   Controller: luvaDeOuroController.js
 *   Service: goleirosService.js
 *
 * NOTA: coletarDadosGoleiros tem rate limit de 500ms/participante (~17s para 35 times).
 * Por isso onMarketClose e onLiveUpdate rodam em background (fire-and-forget).
 * onRoundFinalize aguarda para garantir dados completos antes de consolidar.
 */
import BaseManager from './BaseManager.js';
import { coletarDadosGoleiros, consolidarRodada } from '../../goleirosService.js';

export default class LuvaOuroManager extends BaseManager {
    constructor() {
        super({
            id: 'luva_ouro',
            nome: 'Luva de Ouro',
            moduloKey: 'luvaOuro',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 35,
            temColeta: true,
            temFinanceiro: true,
        });

        this._coletaAtiva = false;
        this._coletaPromise = null; // referência à promise em andamento
    }

    // Inicia coleta de dados dos goleiros em background (não bloqueia o orchestrator)
    async onMarketClose(ctx) {
        this._coletaAtiva = true;
        const { ligaId, rodada } = ctx;

        console.log(`[LUVA-OURO-MANAGER] onMarketClose: iniciando coleta R${rodada} liga ${ligaId}`);

        // Fire-and-forget: coleta pode demorar ~30s (500ms × participantes)
        this._coletaPromise = coletarDadosGoleiros(ligaId, rodada, rodada)
            .then(result => {
                console.log(`[LUVA-OURO-MANAGER] Coleta R${rodada} concluída: ${result.totalColetados} registros`);
                this._coletaPromise = null;
            })
            .catch(err => {
                console.error(`[LUVA-OURO-MANAGER] Erro na coleta R${rodada}:`, err.message);
                this._coletaPromise = null;
            });

        return { coletaIniciada: true, rodada };
    }

    // Atualiza parciais a cada ciclo de live update
    async onLiveUpdate(ctx) {
        if (!this._coletaAtiva) return null;

        // Não iniciar nova coleta se a anterior ainda está rodando
        if (this._coletaPromise) {
            console.log(`[LUVA-OURO-MANAGER] onLiveUpdate: coleta em andamento, pulando ciclo`);
            return { coletando: true, aguardando: true };
        }

        const { ligaId, rodada } = ctx;
        console.log(`[LUVA-OURO-MANAGER] onLiveUpdate: atualizando parciais R${rodada}`);

        this._coletaPromise = coletarDadosGoleiros(ligaId, rodada, rodada)
            .then(() => {
                console.log(`[LUVA-OURO-MANAGER] Parciais R${rodada} atualizados`);
                this._coletaPromise = null;
            })
            .catch(err => {
                console.error(`[LUVA-OURO-MANAGER] Erro parciais R${rodada}:`, err.message);
                this._coletaPromise = null;
            });

        return { coletando: true, rodada };
    }

    // Reset de estado quando mercado abre (rodada anterior finalizou)
    async onMarketOpen(ctx) {
        this._coletaAtiva = false;
        this._coletaPromise = null;
        return { coletaEncerrada: true };
    }

    // Rodada finalizou: aguarda coleta em andamento e faz coleta final definitiva
    async onRoundFinalize(ctx) {
        this._coletaAtiva = false;
        const { ligaId, rodada } = ctx;

        // Aguardar coleta em andamento antes de prosseguir
        if (this._coletaPromise) {
            console.log(`[LUVA-OURO-MANAGER] onRoundFinalize: aguardando coleta em andamento...`);
            await this._coletaPromise;
        }

        // Coleta final para garantir dados completos da rodada encerrada
        console.log(`[LUVA-OURO-MANAGER] onRoundFinalize: coleta final R${rodada}`);
        try {
            const result = await coletarDadosGoleiros(ligaId, rodada, rodada);
            return { pronto: true, rodada, totalColetados: result.totalColetados };
        } catch (err) {
            console.error(`[LUVA-OURO-MANAGER] Erro na coleta final R${rodada}:`, err.message);
            return { pronto: false, erro: err.message };
        }
    }

    // Consolida rodada: marca registros como definitivos (rodadaConcluida: true)
    async onConsolidate(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[LUVA-OURO-MANAGER] onConsolidate: consolidando R${rodada} liga ${ligaId}`);

        try {
            const resultado = await consolidarRodada(ligaId, rodada);
            console.log(`[LUVA-OURO-MANAGER] Consolidação R${rodada}: ${resultado.registrosAtualizados} registros atualizados`);
            return { consolidado: true, rodada, registrosAtualizados: resultado.registrosAtualizados };
        } catch (err) {
            console.error(`[LUVA-OURO-MANAGER] Erro na consolidação R${rodada}:`, err.message);
            return { consolidado: false, erro: err.message };
        }
    }
}
