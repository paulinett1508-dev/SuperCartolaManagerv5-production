/**
 * RESTA UM CONTROLLER v1.1
 *
 * Endpoints para o módulo Resta Um (eliminação progressiva).
 * - GET status da disputa (participante)
 * - GET parciais ao vivo (live experience)
 * - POST iniciar edição (admin)
 */
import RestaUmCache from '../models/RestaUmCache.js';
import Rodada from '../models/Rodada.js';
import Liga from '../models/Liga.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import logger from '../utils/logger.js';
import { truncarPontosNum } from '../utils/type-helpers.js';
import { buscarRankingParcial } from '../services/parciaisRankingService.js';

/**
 * Monta pontosLiveMap a partir do parciaisRankingService (fallback quando
 * a collection Rodada ainda não tem dados da rodada em andamento).
 * Retorna { pontosLiveMap: Map<String, number>, isLive: boolean }
 */
async function _buscarPontosViaParciais(ligaId) {
    try {
        const parciais = await buscarRankingParcial(ligaId);
        if (!parciais?.disponivel || !parciais.ranking?.length) {
            return { pontosLiveMap: new Map(), isLive: false };
        }
        const map = new Map();
        parciais.ranking.forEach(r => {
            map.set(String(r.timeId), r.pontos_rodada_atual || 0);
        });
        return { pontosLiveMap: map, isLive: true };
    } catch (err) {
        logger.warn('[RESTA-UM] Fallback parciais falhou:', err.message);
        return { pontosLiveMap: new Map(), isLive: false };
    }
}

/**
 * GET /:ligaId/status
 * Retorna o estado atual da disputa para o participante
 */
export async function obterStatus(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;
        const edicaoNum = parseInt(req.query.edicao) || null;

        // Se edicao especifica foi pedida (admin), buscar direto
        const queryAtiva = { liga_id: ligaId, temporada };
        if (edicaoNum) {
            queryAtiva.edicao = edicaoNum;
        } else {
            queryAtiva.status = { $in: ['em_andamento', 'finalizada'] };
        }

        const edicao = await RestaUmCache.findOne(queryAtiva).sort({ edicao: -1 }).lean();

        if (!edicao) {
            // Tentar buscar edição pendente
            const queryPendente = { liga_id: ligaId, temporada, status: 'pendente' };
            if (edicaoNum) queryPendente.edicao = edicaoNum;

            const pendente = await RestaUmCache.findOne(queryPendente).sort({ edicao: -1 }).lean();

            if (pendente) {
                // Tentar buscar pontos parciais da rodadaInicial na collection Rodada
                let pontosLiveMap = new Map();
                let isLive = false;
                let rodadaAtualProvisoria = null;

                if (pendente.rodadaInicial) {
                    const rodadasLive = await Rodada.find({
                        ligaId,
                        rodada: pendente.rodadaInicial,
                        temporada,
                    }).lean();

                    if (rodadasLive.length > 0) {
                        isLive = true;
                        rodadaAtualProvisoria = pendente.rodadaInicial;
                        rodadasLive.forEach(r => {
                            pontosLiveMap.set(String(r.timeId), r.pontos || 0);
                        });
                    } else {
                        // Rodada em andamento mas ainda não consolidada → fallback parciais
                        const fb = await _buscarPontosViaParciais(ligaId);
                        if (fb.isLive) {
                            isLive = true;
                            rodadaAtualProvisoria = pendente.rodadaInicial;
                            pontosLiveMap = fb.pontosLiveMap;
                        }
                    }
                }

                // Mesclar pontos live com participantes
                const participantesComPontos = (pendente.participantes || []).map(p => {
                    const pontosLive = pontosLiveMap.get(String(p.timeId));
                    return {
                        ...p,
                        pontosRodada: pontosLive != null ? truncarPontosNum(pontosLive) : null,
                        pontosAcumulados: truncarPontosNum(p.pontosAcumulados || 0),
                    };
                });

                // Ordenar vivos por pontos DESC (lanterna último) quando live
                let participantesOrdenados = participantesComPontos;
                if (isLive) {
                    const vivos = participantesComPontos
                        .filter(p => p.status === 'vivo' || p.status === 'campeao')
                        .sort((a, b) => (b.pontosRodada || 0) - (a.pontosRodada || 0));
                    const eliminados = participantesComPontos
                        .filter(p => p.status === 'eliminado')
                        .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));
                    participantesOrdenados = [...vivos, ...eliminados];
                }

                return res.json({
                    edicao: {
                        id: pendente.edicao,
                        nome: pendente.nome,
                        status: pendente.status,
                        rodadaInicial: pendente.rodadaInicial,
                        eliminadosPorRodada: pendente.eliminadosPorRodada || 1,
                    },
                    participantes: participantesOrdenados,
                    rodadaAtual: rodadaAtualProvisoria,
                    eliminadosDaRodada: [],
                    isLive,
                    isProvisional: isLive, // prévia, edição ainda não ativada oficialmente
                    premiacao: {
                        campeao: pendente.premiacao?.campeao || 0,
                        vice: pendente.premiacao?.viceHabilitado !== false ? (pendente.premiacao?.vice || 0) : null,
                        viceHabilitado: pendente.premiacao?.viceHabilitado !== false,
                        terceiro: pendente.premiacao?.terceiroHabilitado !== false ? (pendente.premiacao?.terceiro || 0) : null,
                        terceiroHabilitado: pendente.premiacao?.terceiroHabilitado !== false,
                    },
                });
            }

            return res.status(404).json({ error: 'Nenhuma edição encontrada' });
        }

        // ✅ Live Experience: buscar pontos da rodada atual da collection Rodada
        let pontosLiveMap = new Map();
        let isLive = false;

        if (edicao.status === 'em_andamento' && edicao.rodadaAtual) {
            const rodadasLive = await Rodada.find({
                ligaId,
                rodada: edicao.rodadaAtual,
                temporada,
            }).lean();

            if (rodadasLive.length > 0) {
                isLive = true;
                rodadasLive.forEach(r => {
                    pontosLiveMap.set(String(r.timeId), r.pontos || 0);
                });
            } else {
                // Rodada em andamento mas ainda não consolidada → fallback parciais
                const fb = await _buscarPontosViaParciais(ligaId);
                if (fb.isLive) {
                    isLive = true;
                    pontosLiveMap = fb.pontosLiveMap;
                }
            }
        }

        // Separar vivos e eliminados, mesclar pontos live
        const participantes = (edicao.participantes || []).map(p => {
            const pontosLive = pontosLiveMap.get(String(p.timeId));
            return {
                ...p,
                // Se temos pontos live, usar; senão usar o cache
                pontosRodada: pontosLive != null
                    ? truncarPontosNum(pontosLive)
                    : (p.pontosRodada != null ? truncarPontosNum(p.pontosRodada) : null),
                pontosAcumulados: truncarPontosNum(p.pontosAcumulados || 0),
            };
        });

        // Ordenar vivos por pontos da rodada (DESC) para lanterna aparecer por último
        const vivos = participantes
            .filter(p => p.status === 'vivo' || p.status === 'campeao')
            .sort((a, b) => {
                // Durante live, ordenar por pontosRodada; senão por acumulados
                if (isLive && a.pontosRodada != null && b.pontosRodada != null) {
                    return (b.pontosRodada || 0) - (a.pontosRodada || 0);
                }
                return (b.pontosAcumulados || 0) - (a.pontosAcumulados || 0);
            });

        const eliminados = participantes
            .filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        return res.json({
            edicao: {
                id: edicao.edicao,
                nome: edicao.nome,
                status: edicao.status,
                rodadaInicial: edicao.rodadaInicial,
                rodadaFinal: edicao.rodadaFinal,
                eliminadosPorRodada: edicao.eliminadosPorRodada,
            },
            participantes: [...vivos, ...eliminados],
            rodadaAtual: edicao.rodadaAtual,
            historicoEliminacoes: edicao.historicoEliminacoes || [],
            premiacao: {
                campeao: edicao.premiacao?.campeao || 0,
                vice: edicao.premiacao?.viceHabilitado !== false ? (edicao.premiacao?.vice || 0) : null,
                viceHabilitado: edicao.premiacao?.viceHabilitado !== false,
                terceiro: edicao.premiacao?.terceiroHabilitado !== false ? (edicao.premiacao?.terceiro || 0) : null,
                terceiroHabilitado: edicao.premiacao?.terceiroHabilitado !== false,
            },
            isLive, // ✅ Sinaliza ao frontend se está em modo ao vivo
        });

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao obter status:', error);
        return res.status(500).json({ error: 'Erro interno ao buscar status do Resta Um' });
    }
}

/**
 * POST /:ligaId/iniciar
 * Admin inicia uma nova edição do Resta Um
 */
export async function iniciarEdicao(req, res) {
    try {
        const { ligaId } = req.params;
        const {
            edicao = 1,
            rodadaInicial,
            rodadaFinal,
            eliminadosPorRodada = 1,
            protecaoPrimeiraRodada = false,
            premiacao = {},
            bonusSobrevivencia = {},
            fluxoFinanceiroHabilitado = false,
        } = req.body;

        // Validar liga
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            return res.status(404).json({ error: 'Liga não encontrada' });
        }

        // Validar mínimo de participantes
        const participantesAtivos = (liga.participantes || []).filter(p => p.ativo !== false);
        if (participantesAtivos.length < 8) {
            return res.status(400).json({
                error: `Mínimo de 8 participantes necessário. Liga tem ${participantesAtivos.length}.`,
            });
        }

        // Verificar se já existe edição ativa
        const edicaoExistente = await RestaUmCache.findOne({
            liga_id: ligaId,
            temporada: CURRENT_SEASON,
            edicao,
            status: { $in: ['em_andamento', 'pendente'] },
        });

        if (edicaoExistente) {
            return res.status(409).json({
                error: `Já existe edição ${edicao} ${edicaoExistente.status} para esta temporada.`,
            });
        }

        // Criar participantes iniciais (todos vivos)
        const participantesRestaUm = participantesAtivos.map(p => ({
            timeId: p.time_id,
            nomeTime: p.nome_time || p.nome_cartola,
            nomeCartoleiro: p.nome_cartola,
            escudoId: p.clube_id || null,
            status: 'vivo',
            pontosAcumulados: 0,
            rodadaEliminacao: null,
            rodadasSobrevividas: 0,
            vezesNaZona: 0,
        }));

        // Calcular taxa de eliminação (pool ÷ pagadores, truncado)
        const premiacaoFinal = {
            campeao: premiacao.campeao || 100,
            vice: premiacao.vice || 50,
            viceHabilitado: premiacao.viceHabilitado !== false,
            terceiro: premiacao.terceiro || 25,
            terceiroHabilitado: premiacao.terceiroHabilitado !== false,
        };
        const numGanhadores = 2 + (premiacaoFinal.terceiroHabilitado ? 1 : 0);
        const pool = premiacaoFinal.campeao
            + (premiacaoFinal.viceHabilitado ? premiacaoFinal.vice : 0)
            + (premiacaoFinal.terceiroHabilitado ? premiacaoFinal.terceiro : 0);
        const payers = participantesAtivos.length - numGanhadores;
        const taxaEliminacao = payers > 0 ? Math.trunc(pool / payers * 100) / 100 : 0;

        // Criar edição
        const novaEdicao = await RestaUmCache.create({
            liga_id: ligaId,
            edicao,
            temporada: CURRENT_SEASON,
            nome: `${edicao}a Edição`,
            rodadaInicial: rodadaInicial || 1,
            rodadaFinal: rodadaFinal || 38,
            eliminadosPorRodada,
            protecaoPrimeiraRodada,
            status: 'pendente',
            participantes: participantesRestaUm,
            premiacao: premiacaoFinal,
            bonusSobrevivencia: {
                habilitado: bonusSobrevivencia.habilitado !== false,
                valorBase: bonusSobrevivencia.valorBase || 2,
                incremento: bonusSobrevivencia.incremento || 0.5,
            },
            fluxoFinanceiroHabilitado: Boolean(fluxoFinanceiroHabilitado),
            taxaEliminacao,
        });

        logger.log(`[RESTA-UM] Edição ${edicao} criada para liga ${ligaId} com ${participantesRestaUm.length} participantes`);

        return res.status(201).json({
            success: true,
            edicao: novaEdicao.edicao,
            participantes: novaEdicao.participantes.length,
            rodadaInicial: novaEdicao.rodadaInicial,
        });

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao iniciar edição:', error);
        return res.status(500).json({ error: 'Erro interno ao iniciar edição' });
    }
}

/**
 * GET /:ligaId/edicoes
 * Lista todas as edições de uma liga na temporada
 */
export async function listarEdicoes(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

        const edicoes = await RestaUmCache.find({
            liga_id: ligaId,
            temporada,
        }).sort({ edicao: 1 }).lean();

        return res.json(edicoes.map(e => ({
            edicao: e.edicao,
            nome: e.nome,
            status: e.status,
            rodadaInicial: e.rodadaInicial,
            rodadaFinal: e.rodadaFinal,
            eliminadosPorRodada: e.eliminadosPorRodada || 1,
            protecaoPrimeiraRodada: e.protecaoPrimeiraRodada || false,
            totalParticipantes: (e.participantes || []).length,
            vivosRestantes: (e.participantes || []).filter(p => p.status === 'vivo').length,
            rodadaAtual: e.rodadaAtual,
            premiacao: e.premiacao || {},
            bonusSobrevivencia: e.bonusSobrevivencia || {},
            fluxoFinanceiroHabilitado: e.fluxoFinanceiroHabilitado || false,
            taxaEliminacao: e.taxaEliminacao || 0,
        })));

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao listar edições:', error);
        return res.status(500).json({ error: 'Erro interno' });
    }
}

/**
 * GET /:ligaId/parciais
 * Retorna ranking parcial ao vivo (durante rodada em andamento).
 * Busca pontos em tempo real da collection Rodada.
 */
export async function obterParciais(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

        const edicao = await RestaUmCache.findOne({
            liga_id: ligaId,
            temporada,
            status: { $in: ['em_andamento', 'pendente'] },
        }).sort({ edicao: -1 }).lean();

        if (!edicao) {
            return res.status(404).json({ error: 'Nenhuma edição em andamento' });
        }

        // ✅ Live Experience: buscar pontos da rodada atual da collection Rodada
        // Para edicão 'pendente', usar rodadaInicial como fallback (1ª rodada em andamento)
        const rodadaParaBuscar = edicao.rodadaAtual || edicao.rodadaInicial;
        let pontosLiveMap = new Map();
        let isLive = false;

        if (rodadaParaBuscar) {
            const rodadasLive = await Rodada.find({
                ligaId,
                rodada: rodadaParaBuscar,
                temporada,
            }).lean();

            if (rodadasLive.length > 0) {
                isLive = true;
                rodadasLive.forEach(r => {
                    pontosLiveMap.set(String(r.timeId), r.pontos || 0);
                });
            } else {
                // Rodada em andamento mas ainda não consolidada → fallback parciais
                const fb = await _buscarPontosViaParciais(ligaId);
                if (fb.isLive) {
                    isLive = true;
                    pontosLiveMap = fb.pontosLiveMap;
                }
            }
        }

        // Mesclar pontos live com participantes
        const participantes = (edicao.participantes || []).map(p => {
            const pontosLive = pontosLiveMap.get(String(p.timeId));
            return {
                ...p,
                pontosRodada: pontosLive != null
                    ? truncarPontosNum(pontosLive)
                    : (p.pontosRodada != null ? truncarPontosNum(p.pontosRodada) : null),
                pontosAcumulados: truncarPontosNum(p.pontosAcumulados || 0),
            };
        });

        // Ordenar vivos por pontosRodada (DESC) para lanterna aparecer por último
        const vivos = participantes
            .filter(p => p.status === 'vivo')
            .sort((a, b) => {
                if (isLive && a.pontosRodada != null && b.pontosRodada != null) {
                    return (b.pontosRodada || 0) - (a.pontosRodada || 0);
                }
                return (b.pontosAcumulados || 0) - (a.pontosAcumulados || 0);
            });

        // Marcar os bottom N vivos como zonaRisco (projeção de eliminação ao vivo)
        const n = edicao.eliminadosPorRodada || 1;
        if (isLive && vivos.length > n) {
            const zonaRiscoIds = new Set(
                vivos.slice(-n).map(p => String(p.timeId))
            );
            vivos.forEach(p => {
                p.zonaRisco = zonaRiscoIds.has(String(p.timeId));
            });
        }

        const eliminados = participantes
            .filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        return res.json({
            parcial: true,
            isLive,
            edicao: {
                id: edicao.edicao,
                nome: edicao.nome,
                status: edicao.status,
                eliminadosPorRodada: edicao.eliminadosPorRodada,
            },
            participantes: [...vivos, ...eliminados],
            rodadaAtual: rodadaParaBuscar,
            ultimaAtualizacao: edicao.ultima_atualizacao,
        });

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao obter parciais:', error);
        return res.status(500).json({ error: 'Erro interno ao buscar parciais' });
    }
}

/**
 * PUT /:ligaId/editar/:edicao
 * Admin edita configurações de uma edição existente (pendente ou em_andamento).
 * Edições finalizadas não podem ser editadas.
 */
export async function editarEdicao(req, res) {
    try {
        const { ligaId, edicao: edicaoParam } = req.params;
        const edicaoNum = parseInt(edicaoParam);

        if (!edicaoNum) {
            return res.status(400).json({ error: 'Número da edição inválido' });
        }

        const edicao = await RestaUmCache.findOne({
            liga_id: ligaId,
            temporada: CURRENT_SEASON,
            edicao: edicaoNum,
        });

        if (!edicao) {
            return res.status(404).json({ error: `Edição ${edicaoNum} não encontrada` });
        }

        if (edicao.status === 'finalizada') {
            return res.status(400).json({ error: 'Edição finalizada não pode ser editada' });
        }

        const { premiacao, bonusSobrevivencia, rodadaFinal, eliminadosPorRodada, protecaoPrimeiraRodada, fluxoFinanceiroHabilitado } = req.body;
        const isPendente = edicao.status === 'pendente';

        // Campos editáveis sempre (pendente e em_andamento)
        if (premiacao) {
            if (premiacao.campeao !== undefined) edicao.premiacao.campeao = premiacao.campeao;
            if (premiacao.vice !== undefined) edicao.premiacao.vice = premiacao.vice;
            if (premiacao.viceHabilitado !== undefined) edicao.premiacao.viceHabilitado = premiacao.viceHabilitado;
            if (premiacao.terceiro !== undefined) edicao.premiacao.terceiro = premiacao.terceiro;
            if (premiacao.terceiroHabilitado !== undefined) edicao.premiacao.terceiroHabilitado = premiacao.terceiroHabilitado;
        }

        if (bonusSobrevivencia) {
            if (bonusSobrevivencia.habilitado !== undefined) edicao.bonusSobrevivencia.habilitado = bonusSobrevivencia.habilitado;
            if (bonusSobrevivencia.valorBase !== undefined) edicao.bonusSobrevivencia.valorBase = bonusSobrevivencia.valorBase;
            if (bonusSobrevivencia.incremento !== undefined) edicao.bonusSobrevivencia.incremento = bonusSobrevivencia.incremento;
        }

        if (rodadaFinal !== undefined) {
            edicao.rodadaFinal = rodadaFinal;
        }

        // Campos editáveis apenas quando pendente
        if (isPendente) {
            if (eliminadosPorRodada !== undefined) edicao.eliminadosPorRodada = eliminadosPorRodada;
            if (protecaoPrimeiraRodada !== undefined) edicao.protecaoPrimeiraRodada = protecaoPrimeiraRodada;
        }

        // Fluxo financeiro
        if (fluxoFinanceiroHabilitado !== undefined) {
            edicao.fluxoFinanceiroHabilitado = Boolean(fluxoFinanceiroHabilitado);
        }

        // Recalcular taxa se premiação ou fluxo mudaram
        if (premiacao !== undefined || fluxoFinanceiroHabilitado !== undefined) {
            const p = edicao.premiacao;
            const numGanhadores = 2 + (p.terceiroHabilitado ? 1 : 0);
            const pool = p.campeao
                + (p.viceHabilitado ? p.vice : 0)
                + (p.terceiroHabilitado ? p.terceiro : 0);
            const payers = (edicao.participantes || []).length - numGanhadores;
            edicao.taxaEliminacao = payers > 0 ? Math.trunc(pool / payers * 100) / 100 : 0;
        }

        edicao.ultima_atualizacao = new Date();
        await edicao.save();

        logger.log(`[RESTA-UM] Edição ${edicaoNum} da liga ${ligaId} atualizada (status: ${edicao.status})`);

        return res.json({
            success: true,
            edicao: edicaoNum,
            status: edicao.status,
        });

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao editar edição:', error);
        return res.status(500).json({ error: 'Erro interno ao editar edição' });
    }
}

/**
 * DELETE /:ligaId/edicoes/:edicao
 * Deleta uma edição — apenas edições com status 'pendente' podem ser removidas.
 */
export async function deletarEdicao(req, res) {
    try {
        const { ligaId, edicao } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;
        const edicaoNum = parseInt(edicao);

        const cache = await RestaUmCache.findOne({ liga_id: ligaId, temporada, edicao: edicaoNum });

        if (!cache) {
            return res.status(404).json({ error: `Edição ${edicaoNum} não encontrada` });
        }

        if (cache.status !== 'pendente') {
            return res.status(400).json({ error: 'Apenas edições pendentes podem ser deletadas. Edições em andamento ou finalizadas não podem ser removidas.' });
        }

        await RestaUmCache.deleteOne({ liga_id: ligaId, temporada, edicao: edicaoNum });

        logger.log(`[RESTA-UM] Edição ${edicaoNum} da liga ${ligaId} deletada (temporada ${temporada})`);

        return res.json({ success: true, mensagem: `Edição ${edicaoNum} deletada com sucesso` });

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao deletar edição:', error);
        return res.status(500).json({ error: 'Erro interno ao deletar edição' });
    }
}

export default {
    obterStatus,
    iniciarEdicao,
    editarEdicao,
    listarEdicoes,
    obterParciais,
    deletarEdicao,
};
