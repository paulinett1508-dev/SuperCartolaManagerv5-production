/**
 * RESTA UM CONTROLLER v1.1
 *
 * Endpoints para o módulo Resta Um (eliminação progressiva).
 * - GET status da disputa (participante)
 * - GET parciais ao vivo (live experience)
 * - POST iniciar edição (admin)
 */
import RestaUmCache from '../models/RestaUmCache.js';
import Liga from '../models/Liga.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import logger from '../utils/logger.js';
import { truncarPontosNum } from '../utils/type-helpers.js';

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
                return res.json({
                    edicao: {
                        id: pendente.edicao,
                        nome: pendente.nome,
                        status: pendente.status,
                        rodadaInicial: pendente.rodadaInicial,
                    },
                    participantes: pendente.participantes || [],
                    rodadaAtual: null,
                    eliminadosDaRodada: [],
                });
            }

            return res.status(404).json({ error: 'Nenhuma edição encontrada' });
        }

        // Separar vivos e eliminados, ordenar por pontos
        const participantes = (edicao.participantes || []).map(p => ({
            ...p,
            pontosRodada: p.pontosRodada != null ? truncarPontosNum(p.pontosRodada) : null,
            pontosAcumulados: truncarPontosNum(p.pontosAcumulados || 0),
        }));

        const vivos = participantes
            .filter(p => p.status === 'vivo' || p.status === 'campeao')
            .sort((a, b) => (b.pontosAcumulados || 0) - (a.pontosAcumulados || 0));

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
            escudoId: p.escudo_id || null,
            status: 'vivo',
            pontosAcumulados: 0,
            rodadaEliminacao: null,
            rodadasSobrevividas: 0,
            vezesNaZona: 0,
        }));

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
            premiacao: {
                campeao: premiacao.campeao || 100,
                vice: premiacao.vice || 50,
                viceHabilitado: premiacao.viceHabilitado !== false,
                terceiro: premiacao.terceiro || 25,
                terceiroHabilitado: premiacao.terceiroHabilitado !== false,
            },
            bonusSobrevivencia: {
                habilitado: bonusSobrevivencia.habilitado !== false,
                valorBase: bonusSobrevivencia.valorBase || 2,
                incremento: bonusSobrevivencia.incremento || 0.5,
            },
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
        })));

    } catch (error) {
        logger.error('[RESTA-UM] Erro ao listar edições:', error);
        return res.status(500).json({ error: 'Erro interno' });
    }
}

/**
 * GET /:ligaId/parciais
 * Retorna ranking parcial ao vivo (durante rodada em andamento).
 * Usa mesma lógica do status, mas sinaliza que é parcial.
 */
export async function obterParciais(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

        const edicao = await RestaUmCache.findOne({
            liga_id: ligaId,
            temporada,
            status: 'em_andamento',
        }).sort({ edicao: -1 }).lean();

        if (!edicao) {
            return res.status(404).json({ error: 'Nenhuma edição em andamento' });
        }

        const participantes = (edicao.participantes || []).map(p => ({
            ...p,
            pontosRodada: p.pontosRodada != null ? truncarPontosNum(p.pontosRodada) : null,
            pontosAcumulados: truncarPontosNum(p.pontosAcumulados || 0),
        }));

        const vivos = participantes
            .filter(p => p.status === 'vivo')
            .sort((a, b) => (b.pontosAcumulados || 0) - (a.pontosAcumulados || 0));

        const eliminados = participantes
            .filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        return res.json({
            parcial: true,
            edicao: {
                id: edicao.edicao,
                nome: edicao.nome,
                status: edicao.status,
                eliminadosPorRodada: edicao.eliminadosPorRodada,
            },
            participantes: [...vivos, ...eliminados],
            rodadaAtual: edicao.rodadaAtual,
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

        const { premiacao, bonusSobrevivencia, rodadaFinal, eliminadosPorRodada, protecaoPrimeiraRodada } = req.body;
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

export default {
    obterStatus,
    iniciarEdicao,
    editarEdicao,
    listarEdicoes,
    obterParciais,
};
