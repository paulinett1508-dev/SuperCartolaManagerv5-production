/**
 * TOOL: minhas_inscricoes
 *
 * Retorna os dados de inscricao do participante logado na temporada atual:
 * taxa, status (ativo/devedor/suspenso), se pagou, saldo inicial, parcelamento.
 *
 * Consome `inscricoestemporada` (liga_id ObjectId, time_id Number).
 * Multi-tenant: ligaId/timeId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'minhas_inscricoes',
    description:
        'Retorna os dados de inscricao do participante na temporada: taxa de inscricao, status (ativo, devedor, suspenso), se pagou a inscricao, saldo inicial, parcelamento. Use quando perguntarem "minha inscricao", "status da minha inscricao", "quanto paguei para entrar", "estou em dia com a liga", "sou devedor?".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('inscricoestemporada', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const timeId = Number(ctx.timeId);

        const inscricao = await db
            .collection('inscricoestemporada')
            .findOne({ ...filtro, time_id: timeId, temporada });

        if (!inscricao) {
            return {
                mensagem: 'Nao ha registro de inscricao para voce nesta liga nesta temporada.',
                temporada,
            };
        }

        // Parcelamento (se existir)
        const parcelas = Array.isArray(inscricao.parcelamento?.parcelas)
            ? inscricao.parcelamento.parcelas.map(p => ({
                  numero: p.numero,
                  valor: truncarPontosNum(p.valor ?? 0),
                  status: p.status ?? null,
                  vencimento: p.vencimento ?? null,
              }))
            : [];

        return {
            temporada,
            status: inscricao.status ?? null,
            taxa_inscricao: truncarPontosNum(inscricao.taxa_inscricao ?? 0),
            pagou_inscricao: !!inscricao.pagou_inscricao,
            saldo_inicial_temporada: truncarPontosNum(inscricao.saldo_inicial_temporada ?? 0),
            saldo_transferido: truncarPontosNum(inscricao.saldo_transferido ?? 0),
            parcelamento: parcelas.length
                ? { total_parcelas: parcelas.length, parcelas }
                : null,
        };
    },
};
