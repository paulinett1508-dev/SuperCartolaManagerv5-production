/**
 * TOOL: meu_proximo_confronto_pontos_corridos
 *
 * Retorna o confronto atual ou o mais recente do participante logado na
 * tabela de Pontos Corridos. Como o cache guarda apenas os confrontos
 * consolidados, "proximo" significa o do snapshot mais recente.
 * Util para perguntas do tipo "contra quem estou jogando", "quem e meu
 * adversario agora", "como foi meu ultimo jogo".
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'meu_proximo_confronto_pontos_corridos',
    description:
        'Retorna o confronto mais recente (ou atual) do participante logado no Pontos Corridos: adversario, pontos de cada lado, valor financeiro em disputa. Use quando o usuario perguntar sobre seu jogo, confronto, adversario ou duelo no Pontos Corridos.',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('pontoscorridoscaches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const cache = await db
            .collection('pontoscorridoscaches')
            .find(filtro)
            .sort({ rodada_consolidada: -1 })
            .limit(1)
            .toArray();

        if (!cache.length) return { modulo_ativo: false };

        const snap = cache[0];
        const meuId = Number(ctx.timeId);

        const confronto = (snap.confrontos || []).find(
            c =>
                Number(c.time1?.id) === meuId || Number(c.time2?.id) === meuId
        );

        if (!confronto) {
            return {
                rodada_consolidada: snap.rodada_consolidada,
                mensagem:
                    'Nao foi encontrado confronto seu nesta rodada (pode ter entrado BYE ou nao estar no bracket).',
            };
        }

        const euSouTime1 = Number(confronto.time1?.id) === meuId;
        const meu = euSouTime1 ? confronto.time1 : confronto.time2;
        const adv = euSouTime1 ? confronto.time2 : confronto.time1;

        let resultado = 'indefinido';
        if (meu?.pontos != null && adv?.pontos != null) {
            if (meu.pontos > adv.pontos) resultado = 'vitoria';
            else if (meu.pontos < adv.pontos) resultado = 'derrota';
            else resultado = 'empate';
        }

        return {
            rodada_consolidada: snap.rodada_consolidada,
            meu_time: meu?.nome || ctx.nomeTime,
            meus_pontos: meu?.pontos ?? null,
            adversario: adv?.nome || adv?.nome_cartola || '(sem nome)',
            adversario_cartoleiro: adv?.nome_cartola || null,
            pontos_adversario: adv?.pontos ?? null,
            diferenca: confronto.diferenca ?? null,
            valor_financeiro_em_jogo: confronto.valor ?? null,
            resultado,
        };
    },
};
