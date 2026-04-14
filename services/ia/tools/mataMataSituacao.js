/**
 * TOOL: mata_mata_situacao
 *
 * Lista todas as edicoes do Mata-Mata da liga, indicando em qual o
 * participante logado tem confronto ativo/pendente (fase atual) e
 * qual a situacao de cada confronto encontrado.
 *
 * Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { truncarPontosNum } from '../../../utils/type-helpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

const FASES_ORDEM = ['primeira', 'oitavas', 'quartas', 'semis', 'final'];

/**
 * Verifica se o modulo mata-mata esta ativo na liga.
 */
async function moduloAtivo(db, ligaId) {
    const filtro = filtroLiga('ligas', ligaId);
    if (!filtro) return false;
    const liga = await db
        .collection('ligas')
        .findOne(filtro, { projection: { modulos_ativos: 1 } });
    return liga?.modulos_ativos?.mataMata === true;
}

/**
 * Procura o confronto do timeId em todas as fases do dados_torneio.
 * Retorna { fase, confronto } ou null.
 */
function encontrarMeuConfronto(dadosTorneio, timeId) {
    if (!dadosTorneio) return null;
    const tid = Number(timeId);

    for (const fase of FASES_ORDEM) {
        const confrontos = dadosTorneio[fase];
        if (!Array.isArray(confrontos)) continue;

        for (const c of confrontos) {
            const idA = Number(c?.timeA?.timeId ?? c?.timeA?.id ?? -1);
            const idB = Number(c?.timeB?.timeId ?? c?.timeB?.id ?? -1);

            if (idA === tid || idB === tid) {
                return { fase, confronto: c };
            }
        }
    }
    return null;
}

/**
 * Deriva a fase atual diretamente dos confrontos em dados_torneio.
 * - Retorna a fase mais avancada com confrontos pendentes/em_andamento.
 * - Se todos concluidos, retorna a ultima fase com dados (torneio encerrado).
 * Nao depende de dados_torneio.fases (campo inexistente no schema atual).
 */
function derivarFaseAtual(dadosTorneio) {
    if (!dadosTorneio) return null;

    // Fase mais avancada com confronto ainda nao concluido
    for (let i = FASES_ORDEM.length - 1; i >= 0; i--) {
        const fase = FASES_ORDEM[i];
        const confrontos = dadosTorneio[fase];
        if (!Array.isArray(confrontos) || confrontos.length === 0) continue;
        if (confrontos.some(c => statusConfronto(c) !== 'concluido')) return fase;
    }

    // Tudo concluido — retornar a ultima fase com dados
    for (let i = FASES_ORDEM.length - 1; i >= 0; i--) {
        const fase = FASES_ORDEM[i];
        const confrontos = dadosTorneio[fase];
        if (Array.isArray(confrontos) && confrontos.length > 0) return fase;
    }

    return null;
}

/**
 * Determina status do confronto: 'aguardando', 'em_andamento', 'concluido'.
 */
function statusConfronto(c) {
    const pA = c?.timeA?.pontos;
    const pB = c?.timeB?.pontos;
    if (typeof pA !== 'number' && typeof pB !== 'number') return 'aguardando';
    if (typeof pA !== 'number' || typeof pB !== 'number') return 'em_andamento';
    return 'concluido';
}

/**
 * Determina o vencedor do confronto (timeId), ou null se inconclusivo.
 */
function vencedorConfronto(c) {
    const pA = c?.timeA?.pontos;
    const pB = c?.timeB?.pontos;
    if (typeof pA !== 'number' || typeof pB !== 'number') return null;
    if (pA > pB) return Number(c.timeA.timeId ?? c.timeA.id);
    if (pB > pA) return Number(c.timeB.timeId ?? c.timeB.id);
    // Empate: timeA vence por ser classificado melhor
    return Number(c.timeA.timeId ?? c.timeA.id);
}

export default {
    name: 'mata_mata_situacao',
    description:
        'Lista todas as edicoes do Mata-Mata desta liga com o confronto do participante logado em cada uma. Retorna a fase atual (quartas, semis, final, etc.), o adversario, pontos e resultado. Use quando perguntarem "qual a fase atual do mata-mata", "em que fase estou", "minha chave no mata-mata", "contra quem jogo", "como estou no mata-mata", "passei de fase?", "fui eliminado?".',
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
                mensagem: 'O modulo Mata-Mata nao esta ativo nesta liga.',
            };
        }

        const filtro = filtroLiga('matamatacaches', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);
        const timeId = Number(ctx.timeId);

        const edicoes = await db
            .collection('matamatacaches')
            .find({ ...filtro, temporada })
            .sort({ edicao: 1 })
            .toArray();

        if (!edicoes.length) {
            return {
                modulo_ativo: true,
                mensagem: 'Ainda nao ha dados de Mata-Mata consolidados para esta liga.',
                total_edicoes: 0,
                edicoes: [],
            };
        }

        const resultado = edicoes.map(ed => {
            const dadosTorneio = ed.dados_torneio;
            const faseAtual = derivarFaseAtual(dadosTorneio);
            const encontrado = encontrarMeuConfronto(dadosTorneio, timeId);

            let meuConfronto = null;
            if (encontrado) {
                const { fase, confronto: c } = encontrado;
                const idA = Number(c?.timeA?.timeId ?? c?.timeA?.id);
                const euSouA = idA === timeId;
                const adversario = euSouA ? c.timeB : c.timeA;
                const eu = euSouA ? c.timeA : c.timeB;
                const venc = vencedorConfronto(c);
                const status = statusConfronto(c);

                meuConfronto = {
                    fase,
                    fase_atual: faseAtual,
                    adversario: {
                        nome_cartola: adversario.nome_cartola || adversario.nome || null,
                        nome_time: adversario.nome_time || null,
                        pontos: typeof adversario.pontos === 'number'
                            ? truncarPontosNum(adversario.pontos)
                            : null,
                    },
                    meus_pontos: typeof eu.pontos === 'number'
                        ? truncarPontosNum(eu.pontos)
                        : null,
                    status,
                    resultado: status === 'concluido'
                        ? (venc === timeId ? 'classificado' : 'eliminado')
                        : null,
                };
            }

            // Determinar se esta edicao precisa de atencao
            const precisaAtencao =
                encontrado !== null &&
                meuConfronto?.resultado !== 'eliminado' &&
                (meuConfronto?.status === 'aguardando' ||
                    meuConfronto?.status === 'em_andamento');

            return {
                edicao: ed.edicao,
                rodada_atual: ed.rodada_atual ?? null,
                fase_atual: faseAtual,
                tamanho_torneio: ed.tamanhoTorneio ?? null,
                meu_confronto: meuConfronto,
                atencao_necessaria: precisaAtencao,
            };
        });

        // Edicao que precisa de atencao (ativa para o usuario)
        const edicaoAtiva = resultado.find(e => e.atencao_necessaria) ?? null;

        return {
            modulo_ativo: true,
            total_edicoes: resultado.length,
            edicao_com_atencao: edicaoAtiva ? edicaoAtiva.edicao : null,
            edicoes: resultado,
        };
    },
};
