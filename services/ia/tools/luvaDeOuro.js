/**
 * TOOL: luva_de_ouro
 *
 * Retorna o ranking do modulo "Luva de Ouro" (somatorio de pontos dos
 * goleiros escalados pelos participantes ao longo da temporada). Le a
 * collection `goleiros` (ligaId String) com aggregation simples e
 * respeita segregacao por temporada.
 *
 * Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';

async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, {
            projection: { modulos_ativos: 1, configuracoes: 1 },
        });
    // O modulo pode estar flaggado em `modulos_ativos.luvaOuro` OU via
    // `configuracoes.luva_ouro.habilitado` (v2.0 SaaS override).
    return (
        liga?.modulos_ativos?.luvaOuro === true ||
        liga?.configuracoes?.luva_ouro?.habilitado === true
    );
}

export default {
    name: 'luva_de_ouro',
    description:
        'Retorna o ranking do modulo Luva de Ouro (goleiros escalados pelos participantes) consolidado na temporada: top N + posicao do usuario. Use quando perguntarem "quem esta liderando a luva de ouro", "ranking dos goleiros", "como esta o luva de ouro".',
    parameters: {
        type: 'object',
        properties: {
            top_n: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                description: 'Quantos participantes retornar (padrao 5, max 20).',
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const ativo = await moduloAtivo(db, ctx.ligaId);
        if (!ativo) {
            return {
                modulo_ativo: false,
                mensagem: 'O modulo Luva de Ouro nao esta ativo nesta liga.',
            };
        }

        const filtro = filtroLiga('goleiros', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);

        // Aggregation: soma pontos dos goleiros por participante na temporada.
        const pipeline = [
            {
                $match: {
                    ...filtro,
                    temporada,
                    rodadaConcluida: true,
                },
            },
            {
                $group: {
                    _id: {
                        participanteId: '$participanteId',
                        participanteNome: '$participanteNome',
                    },
                    pontos_total: { $sum: '$pontos' },
                    rodadas_jogadas: { $sum: 1 },
                },
            },
            { $sort: { pontos_total: -1 } },
        ];

        const resultados = await db
            .collection('goleiros')
            .aggregate(pipeline)
            .toArray();

        if (!resultados.length) {
            return {
                modulo_ativo: true,
                mensagem: 'Ainda nao ha rodadas concluidas de Luva de Ouro nesta liga.',
                total_participantes: 0,
                top: [],
            };
        }

        const topN = Math.min(Number(args?.top_n) || 5, 20);
        const top = resultados.slice(0, topN).map((r, i) => ({
            posicao: i + 1,
            nome_cartola: r._id.participanteNome,
            pontos_total: truncarPontosNum(r.pontos_total),
            rodadas_jogadas: r.rodadas_jogadas,
            media: r.rodadas_jogadas
                ? truncarPontosNum(r.pontos_total / r.rodadas_jogadas)
                : 0,
        }));

        // Posicao do usuario logado
        const idxEu = resultados.findIndex(
            r => Number(r._id.participanteId) === Number(ctx.timeId)
        );
        const eu = idxEu >= 0
            ? {
                  posicao: idxEu + 1,
                  pontos_total: truncarPontosNum(resultados[idxEu].pontos_total),
                  rodadas_jogadas: resultados[idxEu].rodadas_jogadas,
              }
            : null;

        return {
            modulo_ativo: true,
            temporada,
            total_participantes: resultados.length,
            top,
            meu_desempenho: eu,
        };
    },
};
