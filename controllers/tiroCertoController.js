/**
 * TIRO CERTO CONTROLLER v1.0
 *
 * Endpoints para o modulo Tiro Certo (survival - acertar vencedor).
 * - GET status da disputa (participante)
 * - GET minhas escolhas (participante)
 * - POST registrar escolha (participante)
 * - GET participantes vivos (participante)
 * - POST iniciar edicao (admin)
 */
import TiroCertoCache from '../models/TiroCertoCache.js';
import Liga from '../models/Liga.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import logger from '../utils/logger.js';

/**
 * GET /:ligaId/status
 * Retorna o estado atual da edicao ativa para o participante
 */
export async function obterStatus(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

        // Buscar edicao ativa (em_andamento primeiro, depois pendente)
        let edicao = await TiroCertoCache.findOne({
            liga_id: ligaId,
            temporada,
            status: { $in: ['em_andamento'] },
        }).sort({ edicao: -1 }).lean();

        if (!edicao) {
            edicao = await TiroCertoCache.findOne({
                liga_id: ligaId,
                temporada,
                status: 'pendente',
            }).sort({ edicao: 1 }).lean();
        }

        if (!edicao) {
            return res.status(404).json({ error: 'Nenhuma edicao encontrada' });
        }

        const vivos = (edicao.participantes || []).filter(p => p.status === 'vivo');
        const eliminados = (edicao.participantes || []).filter(p => p.status === 'eliminado');

        return res.json({
            edicao: {
                id: edicao.edicao,
                nome: edicao.nome,
                status: edicao.status,
                rodadaInicial: edicao.rodadaInicial,
                rodadaFinal: edicao.rodadaFinal,
                rodadaAtual: edicao.rodadaAtual,
            },
            vivosCount: vivos.length,
            eliminadosCount: eliminados.length,
            totalParticipantes: (edicao.participantes || []).length,
            premiacao: edicao.premiacao,
            permitirRepeticaoTime: edicao.permitirRepeticaoTime,
        });
    } catch (err) {
        logger.error('[TIRO-CERTO] Erro obterStatus:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar status do Tiro Certo' });
    }
}

/**
 * GET /:ligaId/minhas-escolhas
 * Retorna escolhas do participante logado na edicao ativa
 */
export async function obterMinhasEscolhas(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;
        const edicaoNum = parseInt(req.query.edicao) || null;
        const timeId = parseInt(req.query.timeId);

        if (!timeId) {
            return res.status(400).json({ error: 'timeId obrigatorio' });
        }

        const filtro = {
            liga_id: ligaId,
            temporada,
        };
        if (edicaoNum) {
            filtro.edicao = edicaoNum;
        } else {
            filtro.status = { $in: ['em_andamento', 'pendente'] };
        }

        const edicao = await TiroCertoCache.findOne(filtro)
            .sort({ edicao: -1 }).lean();

        if (!edicao) {
            return res.status(404).json({ error: 'Nenhuma edicao encontrada' });
        }

        const participante = (edicao.participantes || []).find(
            p => p.timeId === timeId
        );

        if (!participante) {
            return res.status(404).json({ error: 'Participante nao encontrado nesta edicao' });
        }

        return res.json({
            edicao: edicao.edicao,
            nomeEdicao: edicao.nome,
            status: participante.status,
            escolhas: participante.escolhas || [],
            timesUsados: participante.timesUsados || [],
            rodadasSobrevividas: participante.rodadasSobrevividas,
            rodadaEliminacao: participante.rodadaEliminacao,
            motivoEliminacao: participante.motivoEliminacao,
        });
    } catch (err) {
        logger.error('[TIRO-CERTO] Erro obterMinhasEscolhas:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar escolhas' });
    }
}

/**
 * POST /:ligaId/escolher
 * Registra escolha de time para a rodada
 * Body: { timeId, rodada, timeEscolhidoId, timeEscolhidoNome }
 */
export async function registrarEscolha(req, res) {
    try {
        const { ligaId } = req.params;
        const { timeId, rodada, timeEscolhidoId, timeEscolhidoNome } = req.body;

        if (!timeId || !rodada || !timeEscolhidoId) {
            return res.status(400).json({
                error: 'Campos obrigatorios: timeId, rodada, timeEscolhidoId',
            });
        }

        const temporada = parseInt(req.body.temporada) || CURRENT_SEASON;

        // Buscar edicao em andamento
        const edicao = await TiroCertoCache.findOne({
            liga_id: ligaId,
            temporada,
            status: 'em_andamento',
        });

        if (!edicao) {
            return res.status(404).json({ error: 'Nenhuma edicao em andamento' });
        }

        // Validar se rodada pertence a esta edicao
        if (rodada < edicao.rodadaInicial || rodada > edicao.rodadaFinal) {
            return res.status(400).json({
                error: `Rodada ${rodada} fora do intervalo da edicao (${edicao.rodadaInicial}-${edicao.rodadaFinal})`,
            });
        }

        // Buscar participante
        const participante = edicao.participantes.find(
            p => p.timeId === parseInt(timeId)
        );

        if (!participante) {
            return res.status(404).json({ error: 'Participante nao encontrado nesta edicao' });
        }

        // Validar se esta vivo
        if (participante.status !== 'vivo') {
            return res.status(400).json({
                error: `Participante com status '${participante.status}' nao pode fazer escolhas`,
            });
        }

        // Validar se ja escolheu nesta rodada (idempotencia)
        const escolhaExistente = participante.escolhas.find(
            e => e.rodada === parseInt(rodada)
        );
        if (escolhaExistente) {
            return res.status(409).json({
                error: 'Voce ja fez sua escolha para esta rodada',
                escolha: escolhaExistente,
            });
        }

        // Validar restricao de repeticao de time
        if (!edicao.permitirRepeticaoTime && participante.timesUsados.includes(parseInt(timeEscolhidoId))) {
            return res.status(400).json({
                error: 'Voce ja usou este time nesta edicao. Escolha outro.',
                timesUsados: participante.timesUsados,
            });
        }

        // Registrar escolha
        const novaEscolha = {
            rodada: parseInt(rodada),
            timeEscolhidoId: parseInt(timeEscolhidoId),
            timeEscolhidoNome: timeEscolhidoNome || '',
            resultado: 'pendente',
            dataEscolha: new Date(),
        };

        await TiroCertoCache.updateOne(
            {
                _id: edicao._id,
                'participantes.timeId': parseInt(timeId),
            },
            {
                $push: {
                    'participantes.$.escolhas': novaEscolha,
                    'participantes.$.timesUsados': parseInt(timeEscolhidoId),
                },
                $set: { ultima_atualizacao: new Date() },
            }
        );

        logger.info(`[TIRO-CERTO] Escolha registrada: time ${timeId} escolheu ${timeEscolhidoNome} (${timeEscolhidoId}) na R${rodada}`);

        return res.json({
            success: true,
            escolha: novaEscolha,
            mensagem: `Escolha registrada: ${timeEscolhidoNome} na rodada ${rodada}`,
        });
    } catch (err) {
        logger.error('[TIRO-CERTO] Erro registrarEscolha:', err.message);
        return res.status(500).json({ error: 'Erro ao registrar escolha' });
    }
}

/**
 * GET /:ligaId/participantes
 * Lista todos os participantes da edicao ativa com status
 */
export async function listarParticipantes(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;
        const edicaoNum = parseInt(req.query.edicao) || null;

        const filtro = { liga_id: ligaId, temporada };
        if (edicaoNum) {
            filtro.edicao = edicaoNum;
        } else {
            filtro.status = { $in: ['em_andamento', 'pendente', 'finalizada'] };
        }

        const edicao = await TiroCertoCache.findOne(filtro)
            .sort({ edicao: -1 }).lean();

        if (!edicao) {
            return res.status(404).json({ error: 'Nenhuma edicao encontrada' });
        }

        const participantes = (edicao.participantes || []).map(p => ({
            timeId: p.timeId,
            nomeTime: p.nomeTime,
            nomeCartoleiro: p.nomeCartoleiro,
            escudoId: p.escudoId,
            status: p.status,
            rodadasSobrevividas: p.rodadasSobrevividas,
            rodadaEliminacao: p.rodadaEliminacao,
            motivoEliminacao: p.motivoEliminacao,
            totalEscolhas: (p.escolhas || []).length,
        }));

        // Ordenar: vivos primeiro, depois eliminados (mais recentes primeiro)
        const vivos = participantes.filter(p => p.status === 'vivo' || p.status === 'campeao')
            .sort((a, b) => b.rodadasSobrevividas - a.rodadasSobrevividas);
        const eliminados = participantes.filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        return res.json({
            edicao: {
                id: edicao.edicao,
                nome: edicao.nome,
                status: edicao.status,
            },
            participantes: [...vivos, ...eliminados],
            vivosCount: vivos.length,
            eliminadosCount: eliminados.length,
        });
    } catch (err) {
        logger.error('[TIRO-CERTO] Erro listarParticipantes:', err.message);
        return res.status(500).json({ error: 'Erro ao listar participantes' });
    }
}

/**
 * GET /:ligaId/edicoes
 * Lista todas as edicoes da temporada
 */
export async function listarEdicoes(req, res) {
    try {
        const { ligaId } = req.params;
        const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

        const edicoes = await TiroCertoCache.find({
            liga_id: ligaId,
            temporada,
        }).sort({ edicao: 1 }).lean();

        return res.json({
            temporada,
            edicoes: edicoes.map(e => ({
                id: e.edicao,
                nome: e.nome,
                status: e.status,
                rodadaInicial: e.rodadaInicial,
                rodadaFinal: e.rodadaFinal,
                rodadaAtual: e.rodadaAtual,
                vivosCount: e.vivosCount,
                eliminadosCount: e.eliminadosCount,
                totalParticipantes: (e.participantes || []).length,
            })),
        });
    } catch (err) {
        logger.error('[TIRO-CERTO] Erro listarEdicoes:', err.message);
        return res.status(500).json({ error: 'Erro ao listar edicoes' });
    }
}

/**
 * POST /:ligaId/iniciar (ADMIN)
 * Inicia uma nova edicao do Tiro Certo para a liga
 * Body: { edicao, rodadaInicial, rodadaFinal }
 */
export async function iniciarEdicao(req, res) {
    try {
        const { ligaId } = req.params;
        const { edicao, rodadaInicial, rodadaFinal } = req.body;
        const temporada = parseInt(req.body.temporada) || CURRENT_SEASON;

        if (!edicao || !rodadaInicial || !rodadaFinal) {
            return res.status(400).json({
                error: 'Campos obrigatorios: edicao, rodadaInicial, rodadaFinal',
            });
        }

        // Verificar se ja existe
        const existente = await TiroCertoCache.findOne({
            liga_id: ligaId,
            edicao: parseInt(edicao),
            temporada,
        });

        if (existente) {
            return res.status(409).json({
                error: `Edicao ${edicao} ja existe para esta liga/temporada`,
                status: existente.status,
            });
        }

        // Buscar participantes ativos da liga
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            return res.status(404).json({ error: 'Liga nao encontrada' });
        }

        const timesAtivos = (liga.times || []).filter(t => t.ativo !== false);
        const participantes = timesAtivos.map(t => ({
            timeId: t.id || t.time_id,
            nomeTime: t.nome_time || t.nome,
            nomeCartoleiro: t.nome_cartoleiro || '',
            escudoId: t.escudo || null,
            status: 'vivo',
            escolhas: [],
            timesUsados: [],
            rodadasSobrevividas: 0,
            rodadaEliminacao: null,
            motivoEliminacao: null,
        }));

        const novaEdicao = new TiroCertoCache({
            liga_id: ligaId,
            edicao: parseInt(edicao),
            temporada,
            nome: `${edicao}a Edicao`,
            rodadaInicial: parseInt(rodadaInicial),
            rodadaFinal: parseInt(rodadaFinal),
            status: 'pendente',
            participantes,
            vivosCount: participantes.length,
            eliminadosCount: 0,
        });

        await novaEdicao.save();

        logger.info(`[TIRO-CERTO] Edicao ${edicao} criada para liga ${ligaId} com ${participantes.length} participantes`);

        return res.json({
            success: true,
            edicao: {
                id: novaEdicao.edicao,
                nome: novaEdicao.nome,
                status: novaEdicao.status,
                participantes: participantes.length,
                rodadaInicial,
                rodadaFinal,
            },
        });
    } catch (err) {
        logger.error('[TIRO-CERTO] Erro iniciarEdicao:', err.message);
        return res.status(500).json({ error: 'Erro ao iniciar edicao' });
    }
}
