/**
 * TOOL: minhas_pontuacoes_recentes
 *
 * Retorna as ultimas N rodadas do participante logado (pontos, posicao
 * na rodada, capitao, valor financeiro), ordenadas da mais recente para
 * a mais antiga.
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'minhas_pontuacoes_recentes',
    description:
        'Retorna a pontuacao do participante logado nas ultimas rodadas: pontos, posicao na rodada e valor financeiro ganho/perdido. Use para perguntas tipo "quanto fiz na ultima rodada", "minhas pontuacoes recentes", "como fui nas ultimas 5 rodadas".',
    parameters: {
        type: 'object',
        properties: {
            limite: {
                type: 'integer',
                description:
                    'Numero de rodadas a retornar (entre 1 e 10). Default 5.',
                minimum: 1,
                maximum: 10,
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const filtro = filtroLiga('rodadas', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const limite = Math.min(Math.max(Number(args?.limite) || 5, 1), 10);

        const docs = await db
            .collection('rodadas')
            .find({
                ...filtro,
                timeId: Number(ctx.timeId),
                ...(ctx.temporada ? { temporada: ctx.temporada } : {}),
            })
            .project({
                rodada: 1,
                pontos: 1,
                posicao: 1,
                valorFinanceiro: 1,
                capitao_id: 1,
            })
            .sort({ rodada: -1 })
            .limit(limite)
            .toArray();

        if (!docs.length) {
            return {
                mensagem:
                    'Nenhuma rodada consolidada encontrada para seu time ainda.',
                rodadas: [],
            };
        }

        return {
            total_rodadas_retornadas: docs.length,
            rodadas: docs.map(d => ({
                rodada: d.rodada,
                pontos: d.pontos,
                posicao_na_rodada: d.posicao ?? null,
                valor_financeiro: d.valorFinanceiro ?? null,
                capitao_id: d.capitao_id ?? null,
            })),
        };
    },
};
