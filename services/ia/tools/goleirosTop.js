/**
 * TOOL: goleiros_top
 *
 * Retorna o ranking de goleiros (Luva de Ouro) de uma rodada especifica.
 * Complementa `luva_de_ouro` (acumulado da temporada) com o ranking por rodada.
 *
 * Usa aggregation na collection `goleiros` (ligaId String).
 * Verifica Liga.modulos_ativos.luvaOuro. Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, { projection: { modulos_ativos: 1, configuracoes: 1 } });
    return (
        liga?.modulos_ativos?.luvaOuro === true ||
        liga?.configuracoes?.luva_ouro?.habilitado === true
    );
}

export default {
    name: 'goleiros_top',
    description:
        'Retorna o ranking defensivo (Luva de Ouro) de uma rodada especifica: quem escolheu o melhor goleiro naquela rodada. Sem rodada, usa a rodada concluida mais recente. Diferente de luva_de_ouro (que e o acumulado da temporada). Use quando perguntarem "quem ganhou o goleiro na rodada X", "melhor goleiro da rodada X", "ranking de goleiros da rodada".',
    parameters: {
        type: 'object',
        properties: {
            rodada: {
                type: 'integer',
                minimum: 1,
                maximum: 38,
                description:
                    'Numero da rodada. Omitir para usar a rodada concluida mais recente.',
            },
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

        const filtroBase = filtroLiga('goleiros', ctx.ligaId);
        if (!filtroBase) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const topN = Math.min(Number(args?.top_n) || 5, 20);

        // Determinar rodada
        let rodadaNum = args?.rodada ? Number(args.rodada) : null;

        if (!rodadaNum) {
            const ultima = await db
                .collection('goleiros')
                .findOne(
                    { ...filtroBase, temporada, rodadaConcluida: true },
                    { sort: { rodada: -1 }, projection: { rodada: 1 } }
                );
            if (!ultima) {
                return {
                    modulo_ativo: true,
                    mensagem: 'Ainda nao ha rodadas concluidas de goleiros nesta liga.',
                };
            }
            rodadaNum = ultima.rodada;
        }

        // Aggregation: agrupar por participanteId para a rodada especifica
        const pipeline = [
            {
                $match: {
                    ...filtroBase,
                    temporada,
                    rodada: rodadaNum,
                    rodadaConcluida: true,
                },
            },
            {
                $group: {
                    _id: '$participanteId',
                    nome_cartola: { $first: '$nomeCartoleiro' },
                    nome_time: { $first: '$nomeTime' },
                    timeId: { $first: '$timeId' },
                    pontos_rodada: { $sum: '$pontos' },
                },
            },
            { $sort: { pontos_rodada: -1 } },
            { $limit: topN + 1 }, // +1 para capturar posicao do usuario se necessario
        ];

        const resultados = await db
            .collection('goleiros')
            .aggregate(pipeline)
            .toArray();

        if (!resultados.length) {
            return {
                modulo_ativo: true,
                rodada: rodadaNum,
                mensagem: `Nao ha dados de goleiros consolidados para a rodada ${rodadaNum}.`,
            };
        }

        const top = resultados.slice(0, topN).map((r, i) => ({
            posicao: i + 1,
            nome_cartola: r.nome_cartola || null,
            nome_time: r.nome_time || null,
            pontos: truncarPontosNum(r.pontos_rodada ?? 0),
            meu_time: Number(r.timeId) === Number(ctx.timeId),
        }));

        return {
            modulo_ativo: true,
            rodada: rodadaNum,
            top,
        };
    },
};
