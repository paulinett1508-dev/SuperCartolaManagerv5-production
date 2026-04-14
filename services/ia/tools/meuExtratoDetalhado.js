/**
 * TOOL: meu_extrato_detalhado
 *
 * Retorna a lista itemizada de lancamentos financeiros do participante logado:
 * historico de rodadas (bonus/onus, premios, top10, mata-mata) + ajustes
 * manuais (admin). Ordena do mais recente para o mais antigo.
 *
 * Fontes:
 *   - extratofinanceirocaches.historico_transacoes (liga_id String, time_id Number)
 *   - ajustesfinanceiros (liga_id String, time_id Number)
 *
 * Multi-tenant: ligaId/timeId vem do ctx.
 */

import { filtroLiga, toObjectId } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'meu_extrato_detalhado',
    description:
        'Retorna a lista itemizada de lancamentos financeiros do participante: bonus/onus por rodada, premios, ajustes manuais, saldo acumulado. Use quando perguntarem "meu extrato detalhado", "quais foram meus ganhos/perdas", "quanto ganhei na rodada X", "meus lancamentos financeiros", "por que meu saldo e esse".',
    parameters: {
        type: 'object',
        properties: {
            ultimas_rodadas: {
                type: 'integer',
                minimum: 1,
                maximum: 38,
                description:
                    'Quantas rodadas retornar (padrao 10, max 38). Retorna as mais recentes primeiro.',
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const filtroExtrato = filtroLiga('extratofinanceirocaches', ctx.ligaId);
        if (!filtroExtrato) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const timeId = Number(ctx.timeId);
        const limite = Math.min(Number(args?.ultimas_rodadas) || 10, 38);

        // Buscar extrato do cache
        const extrato = await db
            .collection('extratofinanceirocaches')
            .findOne({ ...filtroExtrato, time_id: timeId, temporada });

        if (!extrato) {
            return {
                mensagem: 'Ainda nao ha extrato financeiro consolidado para voce nesta liga.',
                saldo_consolidado: 0,
                lancamentos: [],
            };
        }

        // Historico de rodadas, do mais recente para o mais antigo
        const historico = (extrato.historico_transacoes || [])
            .slice()
            .sort((a, b) => b.rodada - a.rodada)
            .slice(0, limite)
            .map(h => ({
                rodada: h.rodada,
                posicao: h.posicao ?? null,
                bonus_onus: truncarPontosNum(h.bonusOnus ?? h.valor ?? 0),
                pontos_corridos: truncarPontosNum(h.pontosCorridos ?? 0),
                mata_mata: truncarPontosNum(h.mataMata ?? 0),
                top10: truncarPontosNum(h.top10 ?? 0),
                saldo_rodada: truncarPontosNum(h.saldo ?? 0),
                saldo_acumulado: truncarPontosNum(h.saldoAcumulado ?? 0),
                foi_mito: !!h.isMito,
                foi_mico: !!h.isMico,
                descricao: h.descricao ?? null,
            }));

        // Ajustes manuais (tipo AJUSTE, rodada: null)
        const filtroAjuste = filtroLiga('ajustesfinanceiros', ctx.ligaId);
        let ajustes = [];
        if (filtroAjuste) {
            const docs = await db
                .collection('ajustesfinanceiros')
                .find({ ...filtroAjuste, time_id: timeId, temporada, ativo: true })
                .sort({ createdAt: -1 })
                .limit(10)
                .toArray();

            ajustes = docs.map(a => ({
                tipo: 'AJUSTE',
                rodada: null,
                descricao: a.descricao || 'Ajuste manual',
                valor: truncarPontosNum(a.valor ?? 0),
                data: a.createdAt ?? null,
            }));
        }

        return {
            saldo_consolidado: truncarPontosNum(extrato.saldo_consolidado ?? 0),
            ganhos_consolidados: truncarPontosNum(extrato.ganhos_consolidados ?? 0),
            perdas_consolidadas: truncarPontosNum(extrato.perdas_consolidadas ?? 0),
            ultima_rodada_consolidada: extrato.ultima_rodada_consolidada ?? 0,
            historico_rodadas: historico,
            ajustes_manuais: ajustes,
        };
    },
};
