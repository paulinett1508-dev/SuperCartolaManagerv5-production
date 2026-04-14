/**
 * TOOL: top_dez_mitos_micos
 *
 * Retorna os top-10 mitos (maiores pontuadores) e top-10 micos (menores
 * pontuadores) da rodada mais recente ou de uma rodada especifica.
 *
 * Consome `top10caches` (liga_id String). Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'top_dez_mitos_micos',
    description:
        'Retorna os top-10 mitos (maiores pontuadores) e top-10 micos (menores pontuadores) da rodada. Sem rodada especificada, usa a mais recente consolidada. Use quando perguntarem "quem sao os mitos", "quem sao os micos", "top 10 da rodada", "quem pontuou mais/menos".',
    parameters: {
        type: 'object',
        properties: {
            rodada: {
                type: 'integer',
                minimum: 1,
                maximum: 38,
                description:
                    'Numero da rodada. Omitir para usar a rodada consolidada mais recente.',
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const filtro = filtroLiga('top10caches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);

        let cache;
        if (args?.rodada) {
            cache = await db
                .collection('top10caches')
                .findOne({ ...filtro, rodada_consolidada: Number(args.rodada), temporada });
        } else {
            cache = await db
                .collection('top10caches')
                .findOne(
                    { ...filtro, temporada },
                    { sort: { rodada_consolidada: -1 } }
                );
        }

        if (!cache) {
            return {
                mensagem: args?.rodada
                    ? `Nao ha dados de top-10 para a rodada ${args.rodada}.`
                    : 'Ainda nao ha dados de top-10 consolidados para esta liga.',
            };
        }

        const mapItem = (item, pos) => ({
            posicao: pos,
            nome_cartola: item.nome_cartola || null,
            nome_time: item.nome_time || null,
            pontos: truncarPontosNum(item.pontos ?? 0),
            meu_time: Number(item.timeId) === Number(ctx.timeId),
        });

        const mitos = (cache.mitos || []).map((m, i) => mapItem(m, i + 1));
        const micos = (cache.micos || []).map((m, i) => mapItem(m, i + 1));

        return {
            rodada: cache.rodada_consolidada,
            mitos,
            micos,
        };
    },
};
