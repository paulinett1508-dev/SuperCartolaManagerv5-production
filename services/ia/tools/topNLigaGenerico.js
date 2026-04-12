/**
 * TOOL: top_n_liga
 *
 * Retorna o top N de um modulo (ranking_geral, pontos_corridos, top_10),
 * sem filtrar pelo participante. Util para perguntas tipo
 * "quem lidera a liga", "quem esta em primeiro", "top 3 do ranking".
 */

import { filtroLiga } from '../mongoHelpers.js';

async function topRankingGeral({ ctx, db, limite }) {
    const filtro = filtroLiga('rankinggeralcaches', ctx.ligaId);
    if (!filtro) return null;

    const snap = (await db
        .collection('rankinggeralcaches')
        .find(filtro)
        .sort({ rodadaFinal: -1 })
        .limit(1)
        .toArray())[0];

    if (!snap || !Array.isArray(snap.ranking)) return null;

    return {
        modulo: 'ranking_geral',
        rodada_final: snap.rodadaFinal,
        top: snap.ranking.slice(0, limite).map((t, i) => ({
            posicao: i + 1,
            nome: t.nome_cartola || t.nome_time,
            pontos_totais: t.pontos_totais ?? t.pontos,
        })),
    };
}

async function topPontosCorridos({ ctx, db, limite }) {
    const filtro = filtroLiga('pontoscorridoscaches', ctx.ligaId);
    if (!filtro) return null;

    const snap = (await db
        .collection('pontoscorridoscaches')
        .find(filtro)
        .sort({ rodada_consolidada: -1 })
        .limit(1)
        .toArray())[0];

    if (!snap || !Array.isArray(snap.classificacao)) return null;

    return {
        modulo: 'pontos_corridos',
        rodada_consolidada: snap.rodada_consolidada,
        top: snap.classificacao.slice(0, limite).map(t => ({
            posicao: t.posicao,
            nome: t.nome_cartola || t.nome,
            pontos: t.pontos,
            V: t.vitorias,
            E: t.empates,
            D: t.derrotas,
        })),
    };
}

async function topMelhoresRodada({ ctx, db, limite }) {
    const filtro = filtroLiga('rodadas', ctx.ligaId);
    if (!filtro) return null;

    const ultimaRodadaDoc = await db
        .collection('rodadas')
        .find(filtro)
        .project({ rodada: 1 })
        .sort({ rodada: -1 })
        .limit(1)
        .toArray();

    const ultimaRodada = ultimaRodadaDoc[0]?.rodada;
    if (!ultimaRodada) return null;

    const docs = await db
        .collection('rodadas')
        .find({ ...filtro, rodada: ultimaRodada })
        .project({ nome_cartola: 1, nome_time: 1, pontos: 1, posicao: 1 })
        .sort({ posicao: 1 })
        .limit(limite)
        .toArray();

    return {
        modulo: 'ranking_rodada',
        rodada: ultimaRodada,
        top: docs.map(d => ({
            posicao: d.posicao,
            nome: d.nome_cartola || d.nome_time,
            pontos: d.pontos,
        })),
    };
}

export default {
    name: 'top_n_liga',
    description:
        'Retorna os primeiros colocados de um modulo da liga. Modulos suportados: "ranking_geral" (acumulado da temporada), "pontos_corridos" (tabela de PC) ou "ranking_rodada" (ultima rodada). Use para perguntas sobre quem lidera, pódio, top 3.',
    parameters: {
        type: 'object',
        properties: {
            modulo: {
                type: 'string',
                enum: ['ranking_geral', 'pontos_corridos', 'ranking_rodada'],
                description: 'Qual ranking consultar.',
            },
            limite: {
                type: 'integer',
                minimum: 1,
                maximum: 10,
                description: 'Quantos primeiros colocados retornar. Default 3.',
            },
        },
        required: ['modulo'],
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const limite = Math.min(Math.max(Number(args?.limite) || 3, 1), 10);

        let resultado = null;
        if (args.modulo === 'ranking_geral') {
            resultado = await topRankingGeral({ ctx, db, limite });
        } else if (args.modulo === 'pontos_corridos') {
            resultado = await topPontosCorridos({ ctx, db, limite });
        } else if (args.modulo === 'ranking_rodada') {
            resultado = await topMelhoresRodada({ ctx, db, limite });
        }

        if (!resultado) {
            return {
                modulo: args.modulo,
                mensagem:
                    'Ainda nao ha dados consolidados para esse modulo nesta liga.',
            };
        }
        return resultado;
    },
};
