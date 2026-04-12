/**
 * TOOL: minha_posicao_ranking_geral
 *
 * Retorna a posicao do participante logado no Ranking Geral (acumulado
 * de todas as rodadas consolidadas) + diferenca para o lider.
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'minha_posicao_ranking_geral',
    description:
        'Retorna a posicao, pontos totais e diferenca para o lider do participante logado no Ranking Geral (acumulado da temporada). Use quando o usuario perguntar "minha colocacao no ranking", "como estou no geral", "estou em que lugar", "quantos pontos tenho".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('rankinggeralcaches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const cache = await db
            .collection('rankinggeralcaches')
            .find({ ...filtro, temporada: ctx.temporada || undefined })
            .sort({ rodadaFinal: -1 })
            .limit(1)
            .toArray();

        // Fallback sem temporada (caso session nao tenha)
        const snap = cache[0] || (await db
            .collection('rankinggeralcaches')
            .find(filtro)
            .sort({ rodadaFinal: -1 })
            .limit(1)
            .toArray())[0];

        if (!snap || !Array.isArray(snap.ranking) || !snap.ranking.length) {
            return { modulo_ativo: false };
        }

        const meuId = Number(ctx.timeId);
        const idx = snap.ranking.findIndex(
            t => Number(t.timeId ?? t.time_id) === meuId
        );

        if (idx === -1) {
            return {
                rodada_final: snap.rodadaFinal,
                total_participantes: snap.ranking.length,
                mensagem:
                    'Seu time nao aparece no ranking geral. Pode ter entrado depois da ultima consolidacao.',
            };
        }

        const meu = snap.ranking[idx];
        const lider = snap.ranking[0];

        return {
            rodada_final: snap.rodadaFinal,
            posicao: idx + 1,
            pontos_totais: meu.pontos_totais ?? meu.pontos,
            lider: {
                nome: lider.nome_cartola || lider.nome_time,
                pontos: lider.pontos_totais ?? lider.pontos,
            },
            diferenca_para_lider:
                (lider.pontos_totais ?? lider.pontos) -
                (meu.pontos_totais ?? meu.pontos),
            total_participantes: snap.ranking.length,
            meu_time: ctx.nomeTime || null,
        };
    },
};
