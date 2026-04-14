/**
 * TOOL: regras_liga_gerais
 *
 * Retorna as regras configuradas pelo administrador da liga:
 * taxa de inscricao, parcelamento, prazo de renovacao, permissoes
 * (devedor pode renovar, aproveitar credito, etc.).
 *
 * Consome `ligarules` (liga_id ObjectId). Sem module check —
 * e um dado da liga sempre disponivel.
 * Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'regras_liga_gerais',
    description:
        'Retorna as regras gerais da liga configuradas pelo admin: taxa de inscricao, parcelamento, prazo de renovacao, permissoes (devedor pode renovar, credito anterior pode ser usado). Use quando perguntarem "qual a taxa da liga", "posso parcelar a inscricao", "quando e o prazo", "quais as regras da liga", "posso entrar devendo".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('ligarules', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);

        const regras = await db
            .collection('ligarules')
            .findOne({ ...filtro, temporada });

        if (!regras) {
            return {
                mensagem: 'Nao ha regras configuradas para esta liga nesta temporada.',
                temporada,
            };
        }

        const insc = regras.inscricao || {};

        // Parcelamento
        const parcOpcoes = Array.isArray(insc.parcelamento?.opcoes)
            ? insc.parcelamento.opcoes.map(o => ({
                  parcelas: o.parcelas,
                  descricao: o.descricao ?? null,
              }))
            : [];

        return {
            temporada,
            inscricao: {
                taxa: truncarPontosNum(insc.taxa ?? 0),
                prazo_renovacao: insc.prazo_renovacao ?? null,
                parcelamento_permitido: !!insc.parcelamento?.permitir,
                opcoes_parcelamento: parcOpcoes,
                devedor_pode_renovar: !!insc.permitir_devedor_renovar,
                aproveitar_credito_anterior: !!insc.aproveitar_saldo_positivo,
                gerar_debito_inscricao: insc.gerar_debito_inscricao_renovacao !== false,
            },
        };
    },
};
