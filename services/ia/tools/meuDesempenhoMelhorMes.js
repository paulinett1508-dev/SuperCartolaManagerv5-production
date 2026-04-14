/**
 * TOOL: meu_desempenho_melhor_mes
 *
 * Retorna o desempenho do participante logado em TODAS as edicoes do
 * Melhor do Mes da sua liga: posicao por edicao, pontos, edicoes que ja
 * venceu (conquistas).
 *
 * Consome `melhorMesService.buscarParticipanteMelhorMes`.
 * Multi-tenant: ligaId e timeId vem do ctx.
 */

import melhorMesService from '../../melhorMesService.js';
import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';

async function obterRodadaAtual(db, ctx) {
    try {
        const m = await db.collection('mercadostatus').findOne({});
        if (m?.rodada_atual) return Number(m.rodada_atual);
    } catch { /* fallback */ }
    try {
        const orch = await db
            .collection('orchestrator_states')
            .findOne(
                { chave: 'round_market_orchestrator' },
                { projection: { rodada_atual: 1 } }
            );
        if (orch?.rodada_atual) return Number(orch.rodada_atual);
    } catch { /* fallback */ }
    return 0;
}

async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, { projection: { modulos_ativos: 1 } });
    return liga?.modulos_ativos?.melhorMes === true;
}

export default {
    name: 'meu_desempenho_melhor_mes',
    description:
        'Retorna o desempenho do participante logado em todas as edicoes do Melhor do Mes: posicao por edicao, pontos, media e total de conquistas (edicoes vencidas). Use quando perguntarem "como estou no melhor do mes", "ja ganhei alguma edicao", "minha posicao no melhor do mes".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const ativo = await moduloAtivo(db, ctx.ligaId);
        if (!ativo) {
            return {
                modulo_ativo: false,
                mensagem: 'O modulo Melhor do Mes nao esta ativo nesta liga.',
            };
        }

        const rodadaAtual = await obterRodadaAtual(db, ctx);
        const temporada = ctx.temporada || undefined;

        const dados = await melhorMesService.buscarParticipanteMelhorMes(
            ctx.ligaId,
            ctx.timeId,
            rodadaAtual,
            temporada
        );

        const edicoes = Array.isArray(dados?.edicoes) ? dados.edicoes : [];
        const edicoesFormatadas = edicoes.map(e => ({
            id: e.id,
            nome: e.nome,
            rodadas: `${e.inicio}-${e.fim}`,
            status: e.status,
            eh_campeao: !!e.eh_campeao,
            minha_posicao: e.participante?.posicao ?? null,
            meus_pontos: e.participante
                ? truncarPontosNum(e.participante.pontos_total)
                : null,
            minha_media: e.participante
                ? truncarPontosNum(e.participante.media)
                : null,
            minhas_rodadas_jogadas: e.participante?.rodadas_jogadas ?? null,
        }));

        return {
            modulo_ativo: true,
            rodada_sistema: dados?.rodada_sistema ?? rodadaAtual,
            temporada_encerrada: !!dados?.temporada_encerrada,
            conquistas: dados?.conquistas ?? 0,
            total_edicoes: edicoesFormatadas.length,
            meu_time: ctx.nomeTime || null,
            edicoes: edicoesFormatadas,
        };
    },
};
