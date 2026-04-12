/**
 * TOOL: minha_posicao_resta_um
 *
 * Retorna o status do participante no modulo Resta Um da edicao em
 * andamento (vivo ou eliminado, pontos da rodada).
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'minha_posicao_resta_um',
    description:
        'Retorna o status do participante no Resta Um: vivo ou eliminado, pontos da rodada atual, rodada em que foi eliminado (se aplicavel). Use para perguntas "estou vivo no resta um", "fui eliminado", "como estou no resta um".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('restaumcaches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const edicoes = await db
            .collection('restaumcaches')
            .find({
                ...filtro,
                ...(ctx.temporada ? { temporada: ctx.temporada } : {}),
            })
            .sort({ edicao: -1 })
            .limit(3)
            .toArray();

        if (!edicoes.length) return { modulo_ativo: false };

        const meuId = Number(ctx.timeId);
        const out = [];

        for (const ed of edicoes) {
            const participantes = ed.participantes || [];
            const eu = participantes.find(
                p => Number(p.timeId ?? p.time_id) === meuId
            );

            out.push({
                edicao: ed.edicao,
                nome: ed.nome || `Edicao ${ed.edicao}`,
                status: ed.status,
                rodada_atual: ed.rodada_atual ?? ed.rodadaAtual ?? null,
                vivos: ed.vivosCount ?? ed.vivos_count ?? null,
                eliminados: ed.eliminadosCount ?? ed.eliminados_count ?? null,
                minha_situacao: eu
                    ? {
                          vivo: eu.vivo === true || eu.eliminado !== true,
                          pontos_rodada: eu.pontosRodada ?? eu.pontos ?? null,
                          pontos_acumulados: eu.pontosAcumulados ?? null,
                          rodada_eliminacao:
                              eu.rodadaEliminacao ?? eu.rodada_eliminacao ?? null,
                      }
                    : { mensagem: 'Seu time nao esta nesta edicao.' },
            });
        }

        return { edicoes: out };
    },
};
