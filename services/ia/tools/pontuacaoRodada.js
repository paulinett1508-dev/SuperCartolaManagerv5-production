/**
 * TOOL: pontuacao_rodada
 *
 * Retorna a pontuacao do participante logado em uma rodada especifica.
 * Sem argumento: retorna a rodada consolidada mais recente.
 * Com rodada: retorna os dados daquela rodada.
 *
 * Inclui: pontos, posicao no ranking, escalacao resumida (atleta + pontos)
 * e capitao. Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga, toObjectId } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'pontuacao_rodada',
    description:
        'Retorna a pontuacao do participante logado em uma rodada especifica: pontos, posicao no ranking, escalacao (atletas + pontos) e capitao. Sem rodada especificada, retorna a rodada consolidada mais recente. Use quando perguntarem "quantos pontos fiz na rodada X", "minha escalacao na rodada X", "qual foi minha melhor rodada", "como fui na rodada passada".',
    parameters: {
        type: 'object',
        properties: {
            rodada: {
                type: 'integer',
                minimum: 1,
                maximum: 38,
                description:
                    'Numero da rodada. Omitir para retornar a rodada consolidada mais recente.',
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const filtroBase = filtroLiga('rodadas', ctx.ligaId);
        if (!filtroBase) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const timeId = Number(ctx.timeId);

        // Se nao foi passada rodada, buscar a mais recente consolidada para o usuario
        let rodadaNum = args?.rodada ? Number(args.rodada) : null;

        if (!rodadaNum) {
            const ultimo = await db
                .collection('rodadas')
                .findOne(
                    { ...filtroBase, timeId, temporada, pontos: { $gt: 0 } },
                    { sort: { rodada: -1 }, projection: { rodada: 1 } }
                );
            if (!ultimo) {
                return {
                    mensagem: 'Ainda nao ha rodadas consolidadas para voce nesta liga.',
                    rodadas_disponiveis: 0,
                };
            }
            rodadaNum = ultimo.rodada;
        }

        // Buscar o documento do usuario nessa rodada
        const doc = await db.collection('rodadas').findOne({
            ...filtroBase,
            timeId,
            rodada: rodadaNum,
            temporada,
        });

        if (!doc) {
            return {
                rodada: rodadaNum,
                mensagem: `Nao ha dados para voce na rodada ${rodadaNum}. Talvez voce nao estivesse na liga nessa rodada.`,
            };
        }

        // Buscar total de participantes nessa rodada para calcular posicao
        const totalParticipantes = await db
            .collection('rodadas')
            .countDocuments({ ...filtroBase, rodada: rodadaNum, temporada });

        // Escalacao resumida
        const atletas = (doc.atletas || []).map(a => ({
            apelido: a.apelido || null,
            posicao_id: a.posicao_id || null,
            pontos: truncarPontosNum(a.pontos_num ?? 0),
            capitao: a.atleta_id === doc.capitao_id,
        }));

        return {
            rodada: doc.rodada,
            pontos: truncarPontosNum(doc.pontos ?? 0),
            posicao: doc.posicao ?? null,
            total_participantes: doc.totalParticipantesAtivos ?? totalParticipantes,
            rodada_nao_jogada: !!doc.rodadaNaoJogada,
            atletas,
            capitao_id: doc.capitao_id ?? null,
        };
    },
};
