/**
 * TOOL: artilheiro_campeao
 *
 * Retorna o ranking do modulo "Artilheiro Campeao" (gols pro x gols contra
 * dos atletas escalados pelos participantes). Usa cache consolidado em
 * `artilheirocampeaos` (ligaId String, temporada).
 *
 * - Sem `top_n`: top-5 por saldo de gols + posicao do participante logado.
 * - Com `top_n`: top N (max 20).
 *
 * Multi-tenant: ligaId vem do ctx, nunca de argumento.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, { projection: { modulos_ativos: 1 } });
    return liga?.modulos_ativos?.artilheiro === true;
}

export default {
    name: 'artilheiro_campeao',
    description:
        'Retorna o ranking do modulo Artilheiro Campeao (atletas do cartola que mais fizeram gols pro time do participante vs gols contra). Use quando perguntarem "quem e o artilheiro", "ranking de gols", "quem tem mais gols pro", "como esta o artilheiro".',
    parameters: {
        type: 'object',
        properties: {
            top_n: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                description: 'Quantos participantes retornar no ranking (padrao 5, max 20).',
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const ativo = await moduloAtivo(db, ctx.ligaId);
        if (!ativo) {
            return {
                modulo_ativo: false,
                mensagem: 'O modulo Artilheiro nao esta ativo nesta liga.',
            };
        }

        const filtro = filtroLiga('artilheirocampeaos', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const doc = await db
            .collection('artilheirocampeaos')
            .findOne({ ...filtro, temporada });

        if (!doc || !Array.isArray(doc.dados) || !doc.dados.length) {
            return {
                modulo_ativo: true,
                mensagem: 'Ainda nao ha ranking consolidado do Artilheiro para esta liga.',
                rodada_atual: doc?.rodadaAtual ?? null,
            };
        }

        // Ordenar por saldo de gols desc (fonte ja ordena, mas reforca)
        const ordenado = [...doc.dados].sort((a, b) => {
            if (b.saldoGols !== a.saldoGols) return b.saldoGols - a.saldoGols;
            return b.golsPro - a.golsPro;
        });

        const topN = Math.min(Number(args?.top_n) || 5, 20);
        const top = ordenado.slice(0, topN).map((r, i) => ({
            posicao: i + 1,
            nome_cartola: r.nomeCartoleiro,
            nome_time: r.nomeTime,
            gols_pro: r.golsPro,
            gols_contra: r.golsContra,
            saldo_gols: r.saldoGols,
            rodadas_processadas: r.rodadasProcessadas,
        }));

        // Posicao do usuario logado
        const idxEu = ordenado.findIndex(r => Number(r.timeId) === Number(ctx.timeId));
        const eu = idxEu >= 0
            ? {
                  posicao: idxEu + 1,
                  gols_pro: ordenado[idxEu].golsPro,
                  gols_contra: ordenado[idxEu].golsContra,
                  saldo_gols: ordenado[idxEu].saldoGols,
              }
            : null;

        return {
            modulo_ativo: true,
            rodada_atual: doc.rodadaAtual,
            total_participantes: ordenado.length,
            top,
            meu_desempenho: eu,
        };
    },
};
