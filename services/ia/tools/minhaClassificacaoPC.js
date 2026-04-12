/**
 * TOOL: minha_classificacao_pontos_corridos
 *
 * Retorna a classificacao do participante logado no modulo "Pontos Corridos"
 * da liga: posicao na tabela, pontos acumulados, V/E/D, saldo e rodada consolidada.
 *
 * Multi-tenant: liga_id vem do ctx, nao aceita argumento.
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'minha_classificacao_pontos_corridos',
    description:
        'Retorna a classificacao do participante logado no modulo Pontos Corridos: posicao, pontos totais, V/E/D, saldo de gols (se houver) e rodada consolidada. Use quando o usuario perguntar "como estou no pontos corridos", "minha posicao na tabela", "minhas vitorias/derrotas", etc.',
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

        if (!cache.length) {
            return {
                modulo_ativo: false,
                mensagem:
                    'Ainda nao ha cache de Pontos Corridos consolidado para esta liga.',
            };
        }

        const snap = cache[0];
        const minha = (snap.classificacao || []).find(
            t => Number(t.timeId) === Number(ctx.timeId)
        );

        if (!minha) {
            return {
                modulo_ativo: true,
                rodada_consolidada: snap.rodada_consolidada,
                mensagem:
                    'Seu time nao foi encontrado na tabela de Pontos Corridos. Voce pode ter entrado na liga depois do bracket ter sido gerado.',
            };
        }

        return {
            rodada_consolidada: snap.rodada_consolidada,
            posicao: minha.posicao,
            pontos: minha.pontos,
            jogos: minha.jogos,
            vitorias: minha.vitorias,
            empates: minha.empates,
            derrotas: minha.derrotas,
            saldo_gols: minha.saldo_gols ?? null,
            financeiro: minha.financeiro ?? null,
            total_participantes: (snap.classificacao || []).length,
            meu_time: ctx.nomeTime || null,
        };
    },
};
