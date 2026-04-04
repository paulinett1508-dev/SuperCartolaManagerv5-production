/**
 * ARTILHEIRO MANAGER v2.0.0
 * Módulo OPCIONAL - Artilheiro Campeão (coleta gols da API Cartola)
 *
 * STATUS: IMPLEMENTADO — Hooks de coleta e consolidação automáticos.
 *
 * FLUXO AUTOMÁTICO (orchestrator):
 *   1. onMarketClose  → coleta gols de todos participantes [background]
 *   2. onLiveUpdate   → recoleta parciais a cada ciclo [background]
 *   3. onRoundFinalize→ coleta final aguardada antes de consolidar [await]
 *   4. onConsolidate  → marca GolsConsolidados.parcial = false [rápido]
 *
 * FLUXO MANUAL (ainda disponível via admin):
 *   1. Admin clica "Coletar"     → POST /api/artilheiro-campeao/:ligaId/coletar/:rodada
 *   2. Admin clica "Consolidar"  → POST /api/artilheiro-campeao/:ligaId/consolidar/:rodada
 *   3. Admin clica "Premiar"     → POST /api/artilheiro-campeao/:ligaId/premiar
 *   Controller: artilheiroCampeaoController.js
 *
 * NOTA: coletarDadosRodada é chamado por participante (com rate limit via fetchCartolaComRateLimit).
 * onMarketClose e onLiveUpdate rodam em background para não bloquear o orchestrator.
 */
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import BaseManager from './BaseManager.js';
import ArtilheiroCampeaoController from '../../../controllers/artilheiroCampeaoController.js';
import Liga from '../../../models/Liga.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

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
        this._coletaPromise = null;
    }

    // Busca participantes ativos da liga (para iteração de coleta)
    // ✅ Fix A10: Suportar tanto liga.participantes quanto liga.times (consistência com controller)
    async _getParticipantes(ligaId) {
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) return [];

        // Prioridade: liga.participantes (contém nome, time_id, etc.)
        if (liga.participantes && liga.participantes.length > 0) {
            return liga.participantes.filter(p => p.ativo !== false);
        }

        // Fallback: liga.times (array de IDs) — mapear para formato compatível
        if (liga.times && liga.times.length > 0) {
            return liga.times.map(id => ({ time_id: id, ativo: true }));
        }

        return [];
    }

    // Dispara coleta de gols para todos os participantes em background
    // ✅ v5.4: Fix C3 — Aceita atletasPontuados para coleta live correta
    _dispararColeta(ligaId, rodada, atletasPontuados = null) {
        return this._getParticipantes(ligaId)
            .then(async participantes => {
                console.log(`[ARTILHEIRO-MANAGER] Coletando R${rodada}: ${participantes.length} participantes${atletasPontuados ? ' (com scouts live)' : ''}`);
                for (const p of participantes) {
                    try {
                        await ArtilheiroCampeaoController.coletarDadosRodada(ligaId, p.time_id, rodada, atletasPontuados);
                    } catch (err) {
                        console.error(`[ARTILHEIRO-MANAGER] Erro coleta ${p.nome || p.time_id} R${rodada}:`, err.message);
                    }
                }
                console.log(`[ARTILHEIRO-MANAGER] Coleta R${rodada} concluída`);
                this._coletaPromise = null;
            })
            .catch(err => {
                console.error(`[ARTILHEIRO-MANAGER] Erro na coleta R${rodada}:`, err.message);
                this._coletaPromise = null;
            });
    }

    // ✅ v5.4: Buscar pontuados para coleta live
    async _buscarPontuados() {
        try {
            const resp = await fetch('https://api.cartola.globo.com/atletas/pontuados', {
                headers: { 'User-Agent': 'Super-Cartola-Manager/1.0', 'Accept': 'application/json' },
                timeout: 10000,
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.atletas || null;
        } catch (err) {
            console.warn(`[ARTILHEIRO-MANAGER] Erro ao buscar pontuados:`, err.message);
            return null;
        }
    }

    // Mercado fechou: inicia coleta em background
    async onMarketClose(ctx) {
        this._coletaAtiva = true;
        const { ligaId, rodada } = ctx;

        console.log(`[ARTILHEIRO-MANAGER] onMarketClose: iniciando coleta R${rodada} liga ${ligaId}`);

        // ✅ v5.4: Fix C3 — Buscar pontuados para coleta live correta
        const atletasPontuados = await this._buscarPontuados();
        this._coletaPromise = this._dispararColeta(ligaId, rodada, atletasPontuados);

        return { coletaIniciada: true, rodada };
    }

    // Live update: recoleta parciais se coleta anterior concluiu
    async onLiveUpdate(ctx) {
        if (!this._coletaAtiva) return null;

        if (this._coletaPromise) {
            console.log(`[ARTILHEIRO-MANAGER] onLiveUpdate: coleta em andamento, pulando ciclo`);
            return { coletando: true, aguardando: true };
        }

        const { ligaId, rodada } = ctx;
        console.log(`[ARTILHEIRO-MANAGER] onLiveUpdate: atualizando parciais R${rodada}`);

        // ✅ v5.4: Fix C3 — Buscar pontuados para coleta live correta
        const atletasPontuados = await this._buscarPontuados();
        this._coletaPromise = this._dispararColeta(ligaId, rodada, atletasPontuados);

        return { coletando: true, rodada };
    }

    // Reset ao abrir mercado
    async onMarketOpen(ctx) {
        this._coletaAtiva = false;
        this._coletaPromise = null;
        return { coletaEncerrada: true };
    }

    // Rodada finalizou: aguarda coleta em andamento e faz coleta final
    async onRoundFinalize(ctx) {
        this._coletaAtiva = false;
        const { ligaId, rodada } = ctx;

        if (this._coletaPromise) {
            console.log(`[ARTILHEIRO-MANAGER] onRoundFinalize: aguardando coleta em andamento...`);
            await this._coletaPromise;
        }

        console.log(`[ARTILHEIRO-MANAGER] onRoundFinalize: coleta final R${rodada}`);
        try {
            await this._dispararColeta(ligaId, rodada);
            return { pronto: true, rodada };
        } catch (err) {
            console.error(`[ARTILHEIRO-MANAGER] Erro coleta final R${rodada}:`, err.message);
            return { pronto: false, erro: err.message };
        }
    }

    // Consolida rodada: marca registros parciais como definitivos
    async onConsolidate(ctx) {
        const { ligaId, rodada } = ctx;

        console.log(`[ARTILHEIRO-MANAGER] onConsolidate: consolidando R${rodada} liga ${ligaId}`);

        try {
            // GolsConsolidados é definido no controller — acessar via mongoose.models após import
            const GolsConsolidados = mongoose.models.GolsConsolidados;
            if (!GolsConsolidados) throw new Error('GolsConsolidados model não registrado');

            const resultado = await GolsConsolidados.updateMany(
                { ligaId, rodada: parseInt(rodada, 10), temporada: CURRENT_SEASON, parcial: true },
                { $set: { parcial: false } },
            );
            console.log(`[ARTILHEIRO-MANAGER] Consolidação R${rodada}: ${resultado.modifiedCount} registros atualizados`);
            return { consolidado: true, rodada, registrosAtualizados: resultado.modifiedCount };
        } catch (err) {
            console.error(`[ARTILHEIRO-MANAGER] Erro na consolidação R${rodada}:`, err.message);
            return { consolidado: false, erro: err.message };
        }
    }
}
