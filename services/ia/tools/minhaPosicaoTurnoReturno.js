/**
 * TOOL: minha_posicao_turno_returno
 *
 * Retorna posicao e pontos do participante nos turnos ativos (1o e 2o),
 * se o modulo Turno/Returno estiver habilitado.
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'minha_posicao_turno_returno',
    description:
        'Retorna a posicao e pontos do participante logado nos turnos ativos (1o e 2o). Use quando perguntarem "como estou no turno", "minha posicao no returno", "quem lidera o 2o turno".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('rankingturnos', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const turnos = await db
            .collection('rankingturnos')
            .find({
                ...filtro,
                ...(ctx.temporada ? { temporada: ctx.temporada } : {}),
                turno: { $in: ['1', '2'] },
            })
            .toArray();

        if (!turnos.length) return { modulo_ativo: false };

        const meuId = Number(ctx.timeId);
        const out = [];

        for (const t of turnos.sort((a, b) => a.turno.localeCompare(b.turno))) {
            const ranking = t.ranking || [];
            const idx = ranking.findIndex(
                r => Number(r.timeId ?? r.time_id) === meuId
            );
            const lider = ranking[0] || null;

            out.push({
                turno: t.turno === '1' ? '1o Turno' : '2o Turno',
                status: t.status,
                rodada_inicio: t.rodada_inicio,
                rodada_fim: t.rodada_fim,
                minha_posicao: idx >= 0 ? idx + 1 : null,
                meus_pontos: idx >= 0 ? ranking[idx].pontos : null,
                lider: lider
                    ? {
                          nome: lider.nome_cartola || lider.nome_time,
                          pontos: lider.pontos,
                      }
                    : null,
                total_participantes: ranking.length,
            });
        }

        return { turnos: out };
    },
};
