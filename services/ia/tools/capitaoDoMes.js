/**
 * TOOL: capitao_de_luxo
 *
 * Retorna o ranking do modulo "Capitao de Luxo" (somatorio de pontuacao
 * dos capitaes escolhidos pelos participantes na temporada). Le
 * `capitaocaches` (ligaId ObjectId, timeId Number).
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
        .findOne(filtro, { projection: { modulos_ativos: 1 } });
    return liga?.modulos_ativos?.capitaoLuxo === true;
}

export default {
    name: 'capitao_de_luxo',
    description:
        'Retorna o ranking do modulo Capitao de Luxo (pontuacao somada dos capitaes escolhidos por cada participante na temporada), incluindo melhor e pior capitao historico do usuario. Use quando perguntarem "quem e o melhor capitao", "ranking dos capitaes", "como esta o capitao de luxo", "meu desempenho com capitao".',
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
                mensagem: 'O modulo Capitao de Luxo nao esta ativo nesta liga.',
            };
        }

        const filtro = filtroLiga('capitaocaches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);

        const resultados = await db
            .collection('capitaocaches')
            .find({ ...filtro, temporada })
            .sort({ pontuacao_total: -1 })
            .toArray();

        if (!resultados.length) {
            return {
                modulo_ativo: true,
                mensagem: 'Ainda nao ha dados consolidados de Capitao de Luxo nesta liga.',
                total_participantes: 0,
                top: [],
            };
        }

        const topN = Math.min(Number(args?.top_n) || 5, 20);
        const top = resultados.slice(0, topN).map((r, i) => ({
            posicao: i + 1,
            nome_cartola: r.nome_cartola || null,
            nome_time: r.nome_time || null,
            pontuacao_total: truncarPontosNum(r.pontuacao_total),
            rodadas_jogadas: r.rodadas_jogadas,
            media_capitao: truncarPontosNum(r.media_capitao),
            capitaes_distintos: r.capitaes_distintos,
        }));

        // Dados do usuario logado
        const idxEu = resultados.findIndex(
            r => Number(r.timeId) === Number(ctx.timeId)
        );
        const meuDoc = idxEu >= 0 ? resultados[idxEu] : null;
        const eu = meuDoc
            ? {
                  posicao: idxEu + 1,
                  pontuacao_total: truncarPontosNum(meuDoc.pontuacao_total),
                  rodadas_jogadas: meuDoc.rodadas_jogadas,
                  media_capitao: truncarPontosNum(meuDoc.media_capitao),
                  capitaes_distintos: meuDoc.capitaes_distintos,
                  melhor_capitao: meuDoc.melhor_capitao
                      ? {
                            rodada: meuDoc.melhor_capitao.rodada,
                            atleta_nome: meuDoc.melhor_capitao.atleta_nome,
                            pontuacao: truncarPontosNum(meuDoc.melhor_capitao.pontuacao),
                        }
                      : null,
                  pior_capitao: meuDoc.pior_capitao
                      ? {
                            rodada: meuDoc.pior_capitao.rodada,
                            atleta_nome: meuDoc.pior_capitao.atleta_nome,
                            pontuacao: truncarPontosNum(meuDoc.pior_capitao.pontuacao),
                        }
                      : null,
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
