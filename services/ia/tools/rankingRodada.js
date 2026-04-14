/**
 * TOOL: ranking_rodada
 *
 * Retorna o ranking de pontuacao de uma rodada especifica:
 * top-5 cartoleiros + lanterna (ultimo colocado).
 * Sem rodada: usa a mais recente consolidada.
 *
 * Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'ranking_rodada',
    description:
        'Retorna o ranking de pontuacao de uma rodada: top-5 cartoleiros (mitos) e o lanterna (mico) da rodada. Sem rodada especificada, usa a mais recente consolidada. Use quando perguntarem "quem foi o cartoleiro da rodada X", "quem pontuou mais na rodada X", "quem foi o mico da rodada", "ranking da rodada".',
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
        const filtroBase = filtroLiga('rodadas', ctx.ligaId);
        if (!filtroBase) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);

        // Determinar rodada
        let rodadaNum = args?.rodada ? Number(args.rodada) : null;

        if (!rodadaNum) {
            const ultimo = await db
                .collection('rodadas')
                .findOne(
                    { ...filtroBase, temporada, pontos: { $gt: 0 } },
                    { sort: { rodada: -1 }, projection: { rodada: 1 } }
                );
            if (!ultimo) {
                return { mensagem: 'Ainda nao ha rodadas consolidadas nesta liga.' };
            }
            rodadaNum = ultimo.rodada;
        }

        const docs = await db
            .collection('rodadas')
            .find({ ...filtroBase, rodada: rodadaNum, temporada })
            .sort({ pontos: -1 })
            .toArray();

        if (!docs.length) {
            return {
                rodada: rodadaNum,
                mensagem: `Nao ha dados para a rodada ${rodadaNum}.`,
            };
        }

        const mapParticipante = (d, pos) => ({
            posicao: pos,
            nome_cartola: d.nome_cartola || null,
            nome_time: d.nome_time || null,
            pontos: truncarPontosNum(d.pontos ?? 0),
            meu_time: Number(d.timeId) === Number(ctx.timeId),
        });

        const top5 = docs.slice(0, 5).map((d, i) => mapParticipante(d, i + 1));
        const lanterna = docs.length > 5 ? mapParticipante(docs[docs.length - 1], docs.length) : null;

        // Posicao do usuario logado (se nao estiver no top-5)
        const euIdx = docs.findIndex(d => Number(d.timeId) === Number(ctx.timeId));
        const eu = euIdx >= 0 && euIdx >= 5
            ? mapParticipante(docs[euIdx], euIdx + 1)
            : null;

        return {
            rodada: rodadaNum,
            total_participantes: docs.length,
            top_5: top5,
            lanterna,
            minha_posicao: eu,
        };
    },
};
