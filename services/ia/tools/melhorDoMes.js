/**
 * TOOL: melhor_do_mes
 *
 * Retorna dados do modulo "Melhor do Mes" da liga do participante.
 *   - Sem argumento: resumo de TODAS as edicoes (id, nome, status, campeao).
 *   - Com edicao_id: top-5 da edicao + campeao consolidado (quando houver).
 *
 * Consome `melhorMesService.buscarMelhorMes` para respeitar cache
 * MongoDB + NodeCache ja existentes. Multi-tenant: liga_id vem do ctx.
 */

import melhorMesService from '../../melhorMesService.js';
import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';

/**
 * Tenta descobrir a rodada atual lendo mercadostatus / orchestrator_states /
 * calendariorodadas. Fallback 0 (service tolera rodada=0 → retorna edicoes
 * marcadas como "pendente").
 */
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
    try {
        const temporada = ctx.temporada;
        const cal = await db
            .collection('calendariorodadas')
            .findOne(temporada ? { temporada } : {});
        if (cal?.rodadas?.length) {
            const agora = new Date();
            const atual = cal.rodadas.find(r => {
                const i = new Date(r.inicio);
                const f = new Date(r.fim);
                return agora >= i && agora <= f;
            });
            if (atual?.rodada) return Number(atual.rodada);
            // Se nenhuma rodada ativa, pega a ultima finalizada
            const ultima = [...cal.rodadas]
                .reverse()
                .find(r => new Date(r.fim) < agora);
            if (ultima?.rodada) return Number(ultima.rodada);
        }
    } catch { /* fallback */ }
    return 0;
}

/**
 * Verifica se o modulo esta ativo na liga (Liga.modulos_ativos.melhorMes).
 */
async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, { projection: { modulos_ativos: 1 } });
    return liga?.modulos_ativos?.melhorMes === true;
}

export default {
    name: 'melhor_do_mes',
    description:
        'Retorna dados do modulo "Melhor do Mes" da liga: resumo de todas as edicoes, ou detalhe (top-5 + campeao) de uma edicao especifica. Use quando o usuario perguntar "quem ganhou o melhor do mes", "melhor do mes edicao X", "quem esta liderando o melhor do mes". Se o usuario mencionar "edicao 2", "edicao 3" etc., passe edicao_id numerico.',
    parameters: {
        type: 'object',
        properties: {
            edicao_id: {
                type: 'integer',
                minimum: 1,
                maximum: 12,
                description:
                    'ID numerico da edicao (1 a 7 por padrao, ate 12 em ligas customizadas). Omitir para obter resumo de todas as edicoes.',
            },
        },
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const ativo = await moduloAtivo(db, ctx.ligaId);
        if (!ativo) {
            return {
                modulo_ativo: false,
                mensagem: 'O modulo Melhor do Mes nao esta ativo nesta liga.',
            };
        }

        const rodadaAtual = await obterRodadaAtual(db, ctx);
        const temporada = ctx.temporada || undefined;

        const dados = await melhorMesService.buscarMelhorMes(
            ctx.ligaId,
            rodadaAtual,
            temporada
        );

        const edicoes = Array.isArray(dados?.edicoes) ? dados.edicoes : [];

        // Caso 1: sem edicao_id → resumo compacto de todas
        if (args?.edicao_id == null) {
            return {
                modulo_ativo: true,
                rodada_sistema: dados?.rodada_sistema ?? rodadaAtual,
                temporada_encerrada: !!dados?.temporada_encerrada,
                total_edicoes: edicoes.length,
                edicoes: edicoes.map(e => ({
                    id: e.id,
                    nome: e.nome,
                    rodadas: `${e.inicio}-${e.fim}`,
                    status: e.status,
                    campeao: e.campeao
                        ? {
                              nome_cartola: e.campeao.nome_cartola,
                              nome_time: e.campeao.nome_time,
                              pontos_total: truncarPontosNum(e.campeao.pontos_total),
                          }
                        : null,
                })),
            };
        }

        // Caso 2: com edicao_id → detalhe
        const edicao = edicoes.find(e => Number(e.id) === Number(args.edicao_id));
        if (!edicao) {
            return {
                modulo_ativo: true,
                erro: 'edicao_nao_encontrada',
                edicao_id: args.edicao_id,
                edicoes_disponiveis: edicoes.map(e => e.id),
            };
        }

        const top5 = (edicao.ranking || []).slice(0, 5).map(r => ({
            posicao: r.posicao,
            nome_cartola: r.nome_cartola,
            nome_time: r.nome_time,
            pontos_total: truncarPontosNum(r.pontos_total),
            rodadas_jogadas: r.rodadas_jogadas,
            media: truncarPontosNum(r.media),
        }));

        return {
            modulo_ativo: true,
            rodada_sistema: dados?.rodada_sistema ?? rodadaAtual,
            edicao: {
                id: edicao.id,
                nome: edicao.nome,
                rodadas: `${edicao.inicio}-${edicao.fim}`,
                status: edicao.status,
                total_participantes: edicao.total_participantes,
                campeao: edicao.campeao
                    ? {
                          nome_cartola: edicao.campeao.nome_cartola,
                          nome_time: edicao.campeao.nome_time,
                          pontos_total: truncarPontosNum(edicao.campeao.pontos_total),
                      }
                    : null,
                top_5: top5,
            },
        };
    },
};
