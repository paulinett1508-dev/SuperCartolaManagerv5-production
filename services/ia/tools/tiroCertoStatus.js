/**
 * TOOL: tiro_certo_status
 *
 * Retorna o status do participante logado no modulo Tiro Certo:
 * - Status (vivo, eliminado, campeao)
 * - Rodadas sobrevividas
 * - Ultimas 3 escolhas com resultado
 * - Ranking de sobreviventes (quantos vivos restam + posicao no ranking de resistencia)
 *
 * Busca a edicao mais recente em andamento ou, se nenhuma ativa, a ultima finalizada.
 * Verifica Liga.modulos_ativos.tiroCerto. Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, { projection: { modulos_ativos: 1 } });
    return liga?.modulos_ativos?.tiroCerto === true;
}

export default {
    name: 'tiro_certo_status',
    description:
        'Retorna o status do participante logado no Tiro Certo: se esta vivo, eliminado ou campeao; rodadas sobrevividas; ultimas escolhas com resultado; e ranking de resistencia. Use quando perguntarem "como estou no tiro certo", "ainda estou vivo no tiro certo", "quantas rodadas sobrevivi", "qual minha escolha no tiro certo".',
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
                mensagem: 'O modulo Tiro Certo nao esta ativo nesta liga.',
            };
        }

        const filtro = filtroLiga('tirocertocaches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const timeId = Number(ctx.timeId);

        // Buscar edicao em andamento; fallback para a mais recente (finalizada ou pendente)
        let edicao = await db
            .collection('tirocertocaches')
            .findOne({ ...filtro, temporada, status: 'em_andamento' }, { sort: { edicao: -1 } });

        if (!edicao) {
            edicao = await db
                .collection('tirocertocaches')
                .findOne({ ...filtro, temporada }, { sort: { edicao: -1 } });
        }

        if (!edicao) {
            return {
                modulo_ativo: true,
                mensagem: 'Ainda nao ha edicao de Tiro Certo para esta liga.',
            };
        }

        const participantes = Array.isArray(edicao.participantes) ? edicao.participantes : [];
        const eu = participantes.find(p => Number(p.timeId) === timeId);

        if (!eu) {
            return {
                modulo_ativo: true,
                edicao: edicao.edicao,
                nome: edicao.nome,
                status_edicao: edicao.status,
                mensagem: 'Voce nao esta inscrito nesta edicao do Tiro Certo.',
            };
        }

        // Ultimas 3 escolhas, da mais recente para a mais antiga
        const escolhas = (eu.escolhas || [])
            .slice()
            .sort((a, b) => b.rodada - a.rodada)
            .slice(0, 3)
            .map(e => ({
                rodada: e.rodada,
                time_escolhido: e.timeEscolhidoNome || null,
                adversario: e.adversarioNome || null,
                resultado: e.resultado,
                placar: e.placarMandante != null && e.placarVisitante != null
                    ? `${e.placarMandante}x${e.placarVisitante}`
                    : null,
            }));

        // Ranking de sobrevivencia: ordenar por rodadasSobrevividas desc
        const rankingSobrevivencia = participantes
            .filter(p => p.status === 'vivo' || p.status === 'campeao')
            .sort((a, b) => b.rodadasSobrevividas - a.rodadasSobrevividas);

        const minhaPosicaoVivos = rankingSobrevivencia.findIndex(p => Number(p.timeId) === timeId);

        return {
            modulo_ativo: true,
            edicao: edicao.edicao,
            nome: edicao.nome,
            status_edicao: edicao.status,
            rodada_atual: edicao.rodadaAtual ?? null,
            vivos_restantes: edicao.vivosCount ?? rankingSobrevivencia.length,
            total_participantes: participantes.length,
            meu_status: {
                status: eu.status,
                rodadas_sobrevividas: eu.rodadasSobrevividas ?? 0,
                posicao_resistencia: minhaPosicaoVivos >= 0 ? minhaPosicaoVivos + 1 : null,
                rodada_eliminacao: eu.rodadaEliminacao ?? null,
                motivo_eliminacao: eu.motivoEliminacao ?? null,
            },
            ultimas_escolhas: escolhas,
        };
    },
};
