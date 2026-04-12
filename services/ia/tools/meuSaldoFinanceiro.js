/**
 * TOOL: meu_saldo_financeiro
 *
 * Retorna o saldo financeiro do participante logado, agregando campos
 * manuais (FluxoFinanceiroCampos) e o extrato consolidado.
 */

import { filtroLiga } from '../mongoHelpers.js';

export default {
    name: 'meu_saldo_financeiro',
    description:
        'Retorna o saldo financeiro do participante logado: campos configurados pela admin (inscricao, multas) + saldo do extrato consolidado. Use quando o usuario perguntar sobre saldo, quanto deve, quanto tem a receber, dinheiro, financeiro.',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtroFluxo = filtroLiga('fluxofinanceirocampos', ctx.ligaId);
        const filtroExtrato = filtroLiga('extratofinanceirocaches', ctx.ligaId);
        const timeId = Number(ctx.timeId);

        const [fluxo, extrato] = await Promise.all([
            db
                .collection('fluxofinanceirocampos')
                .findOne({ ...filtroFluxo, time_id: timeId }),
            db
                .collection('extratofinanceirocaches')
                .findOne({ ...filtroExtrato, time_id: timeId }),
        ]);

        const camposManuais = (fluxo?.campos || []).map(c => ({
            nome: c.nome,
            valor: c.valor,
        }));

        const totalManual = camposManuais.reduce(
            (acc, c) => acc + Number(c.valor || 0),
            0
        );

        const saldoExtrato = extrato?.saldo_total ?? extrato?.total ?? null;

        return {
            campos_manuais: camposManuais,
            total_campos_manuais: totalManual,
            saldo_extrato: saldoExtrato,
            saldo_total_estimado:
                saldoExtrato != null
                    ? Number(saldoExtrato) + totalManual
                    : totalManual,
            observacao:
                'Campos manuais sao definidos pela admin (inscricao, multas, etc). O extrato soma pontuacoes e premiacoes consolidadas.',
        };
    },
};
