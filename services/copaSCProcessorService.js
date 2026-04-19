/**
 * copaSCProcessorService.js
 *
 * Processor para Copa SC que executa pós-rodada:
 * 1. Busca pontuações dos participantes na Rodada
 * 2. Atualiza placar dos confrontos
 * 3. Finaliza confrontos completos (desempate por ranking geral)
 * 4. Avança de fase automaticamente quando etapa está concluída
 *
 * Padrão: `processarRodada(rodada, ligaId, temporada)` é o entry point
 * para jobs disparados pelo consolidador de rodadas.
 */

import mongoose from 'mongoose';
import CopaSCConfig from '../models/CopaSCConfig.js';
import CopaSCMatch from '../models/CopaSCMatch.js';
import Rodada from '../models/Rodada.js';
import {
    atualizarStandingsGrupo,
    gerarOitavas,
    gerarProximaFaseMM,
    aplicarPremiacao
} from './copaSCService.js';
import { CURRENT_SEASON } from '../config/seasons.js';

// =============================================================================
// CONSTANTES
// =============================================================================

const PROXIMA_FASE = {
    oitavas:  'quartas',
    quartas:  'semis',
    semis:    'terceiro_lugar'
};

const TOTAL_CONFRONTOS_POR_FASE = {
    classificatorio: null,  // Admin gerencia
    grupos: 48,             // 8 grupos × 6 confrontos
    oitavas: 8,
    quartas: 4,
    semis: 2,
    terceiro_lugar: 1,
    final: 1
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Busca pontuação de um time numa rodada específica.
 * Exclui registros com populacaoFalhou (falha de API).
 *
 * @param {ObjectId|string} ligaId
 * @param {number} temporada
 * @param {number} rodada
 * @param {number} timeId
 * @returns {Promise<number>} Pontos (0 se não encontrado)
 */
async function _getPontosRodada(ligaId, temporada, rodada, timeId) {
    const r = await Rodada.findOne({
        ligaId: new mongoose.Types.ObjectId(ligaId),
        temporada: Number(temporada),
        rodada: Number(rodada),
        timeId: Number(timeId),
        populacaoFalhou: { $ne: true }
    }).lean();
    return r?.pontos ?? 0;
}

/**
 * Calcula posição no ranking geral acumulado até rodada atual.
 * Usado para desempate: menor posição = vence (1º lugar > 2º lugar).
 *
 * @param {ObjectId|string} ligaId
 * @param {number} temporada
 * @param {number} rodadaAtual
 * @param {number} timeId
 * @returns {Promise<number>} Posição (1-based), 9999 se não encontrado
 */
async function _getRankingPosicao(ligaId, temporada, rodadaAtual, timeId) {
    const agg = await Rodada.aggregate([
        {
            $match: {
                ligaId: new mongoose.Types.ObjectId(ligaId),
                temporada: Number(temporada),
                rodada: { $lte: Number(rodadaAtual) },
                populacaoFalhou: { $ne: true }
            }
        },
        {
            $group: {
                _id: '$timeId',
                total: { $sum: '$pontos' }
            }
        },
        {
            $sort: { total: -1 }
        }
    ]);

    const pos = agg.findIndex(r => Number(r._id) === Number(timeId));
    return pos === -1 ? 9999 : pos + 1;
}

/**
 * Verifica se todas as rodadas de um confronto já foram processadas.
 *
 * @param {object} confronto - Documento CopaSCMatch
 * @returns {boolean}
 */
function _todasRodadasProcessadas(confronto) {
    return confronto.rodadas_cartola.every((_, i) =>
        confronto.pontos.mandante[i] !== undefined &&
        confronto.pontos.mandante[i] !== null &&
        confronto.pontos.visitante[i] !== undefined &&
        confronto.pontos.visitante[i] !== null
    );
}

// =============================================================================
// PROCESSAMENTO PRINCIPAL
// =============================================================================

/**
 * Entry point: processa rodada, atualiza confrontos, avança fases se necessário.
 *
 * @param {number} rodada - Número da rodada Cartola
 * @param {ObjectId|string} ligaId - ID da liga
 * @param {number} temporada - Temporada (default: CURRENT_SEASON)
 * @returns {Promise<void>}
 */
export async function processarRodada(rodada, ligaId, temporada = CURRENT_SEASON) {
    console.log(`[COPA-SC] Processando rodada ${rodada} para liga ${ligaId}, temporada ${temporada}`);

    const config = await CopaSCConfig.findOne({
        liga_id: new mongoose.Types.ObjectId(ligaId),
        temporada: Number(temporada)
    }).lean();

    if (!config) {
        console.log(`[COPA-SC] Config não encontrada para liga ${ligaId}`);
        return;
    }

    if (config.status === 'encerrado' || config.status === 'pre_sorteio') {
        console.log(`[COPA-SC] Torneio em status "${config.status}" — ignorando rodada ${rodada}`);
        return;
    }

    try {
        // Buscar confrontos ativos que incluem esta rodada
        const confrontosAtivos = await CopaSCMatch.find({
            liga_id: new mongoose.Types.ObjectId(ligaId),
            temporada: Number(temporada),
            rodadas_cartola: { $in: [Number(rodada)] },
            status: { $in: ['agendado', 'em_andamento'] }
        });

        console.log(`[COPA-SC] ${confrontosAtivos.length} confrontos ativos para R${rodada}`);

        for (const confronto of confrontosAtivos) {
            const idxRodada = confronto.rodadas_cartola.indexOf(Number(rodada));

            // Buscar pontos desta rodada
            const ptsMandante = await _getPontosRodada(ligaId, temporada, rodada, confronto.mandante_id);
            const ptsVisitante = await _getPontosRodada(ligaId, temporada, rodada, confronto.visitante_id);

            // Atualizar placar parcial
            confronto.pontos.mandante[idxRodada] = ptsMandante;
            confronto.pontos.visitante[idxRodada] = ptsVisitante;

            // Calcular totais parciais
            confronto.total.mandante = confronto.pontos.mandante.reduce((s, v) => s + (v ?? 0), 0);
            confronto.total.visitante = confronto.pontos.visitante.reduce((s, v) => s + (v ?? 0), 0);
            confronto.status = 'em_andamento';

            // Verificar se todas as rodadas deste confronto foram processadas
            if (_todasRodadasProcessadas(confronto)) {
                // Definir vencedor
                if (confronto.total.mandante !== confronto.total.visitante) {
                    // Vitória clara
                    confronto.vencedor_id = confronto.total.mandante > confronto.total.visitante
                        ? confronto.mandante_id
                        : confronto.visitante_id;
                } else {
                    // Empate: desempate por ranking geral
                    const posM = await _getRankingPosicao(ligaId, temporada, rodada, confronto.mandante_id);
                    const posV = await _getRankingPosicao(ligaId, temporada, rodada, confronto.visitante_id);
                    confronto.vencedor_id = posM <= posV ? confronto.mandante_id : confronto.visitante_id;

                    console.log(
                        `[COPA-SC] Desempate em confronto ${confronto._id}: ` +
                        `M(T${confronto.mandante_id}, pos${posM}) vs V(T${confronto.visitante_id}, pos${posV}) → Vencedor T${confronto.vencedor_id}`
                    );
                }

                confronto.status = 'finalizado';
                console.log(
                    `[COPA-SC] Confronto finalizado: T${confronto.mandante_id}(${confronto.total.mandante}) × T${confronto.visitante_id}(${confronto.total.visitante}) → Vencedor: T${confronto.vencedor_id}`
                );
            }

            await confronto.save();
        }

        // Verificar avanço de fase
        await _verificarAvancamentoDeFase(ligaId, temporada, config.status, rodada);

    } catch (error) {
        console.error(`[COPA-SC] Erro ao processar rodada ${rodada} da liga ${ligaId}:`, error);
        throw error;
    }
}

// =============================================================================
// AVANÇO DE FASES
// =============================================================================

/**
 * Verifica se a fase atual foi completada e avança se necessário.
 *
 * @param {ObjectId|string} ligaId
 * @param {number} temporada
 * @param {string} status - Status atual da Copa SC
 * @param {number} rodada - Última rodada processada
 * @returns {Promise<void>}
 */
async function _verificarAvancamentoDeFase(ligaId, temporada, status, rodada) {
    const ligaIdObj = new mongoose.Types.ObjectId(ligaId);

    switch (status) {
        case 'classificatorio':
            await _verificarClassificatorio(ligaIdObj, temporada);
            break;

        case 'grupos':
            await _verificarGrupos(ligaIdObj, temporada, rodada);
            break;

        case 'oitavas':
        case 'quartas':
        case 'semis':
            await _verificarMataMata(ligaIdObj, temporada, status, rodada);
            break;

        case 'terceiro_lugar':
        case 'final':
            await _verificarFinal(ligaIdObj, temporada);
            break;

        default:
            console.log(`[COPA-SC] Status desconhecido: ${status}`);
    }
}

/**
 * Verifica se classificatória foi concluída.
 * Não avança automaticamente — admin dispara sorteio manualmente.
 */
async function _verificarClassificatorio(ligaId, temporada) {
    const total = await CopaSCMatch.countDocuments({
        liga_id: ligaId,
        temporada,
        fase: 'classificatorio'
    });

    const finalizados = await CopaSCMatch.countDocuments({
        liga_id: ligaId,
        temporada,
        fase: 'classificatorio',
        status: 'finalizado'
    });

    if (total > 0 && total === finalizados) {
        console.log(`[COPA-SC] Classificatória concluída para liga ${ligaId} — aguardando sorteio admin.`);
    }
}

/**
 * Verifica se fase de grupos foi concluída e gera oitavas.
 */
async function _verificarGrupos(ligaId, temporada, rodada) {
    const totalEsperado = TOTAL_CONFRONTOS_POR_FASE.grupos;
    const finalizados = await CopaSCMatch.countDocuments({
        liga_id: ligaId,
        temporada,
        fase: 'grupos',
        status: 'finalizado'
    });

    if (finalizados < totalEsperado) {
        console.log(
            `[COPA-SC] Grupos: ${finalizados}/${totalEsperado} confrontos finalizados`
        );
        return;
    }

    console.log(`[COPA-SC] Fase de Grupos concluída para liga ${ligaId}`);

    const config = await CopaSCConfig.findOne({
        liga_id: ligaId,
        temporada
    });

    if (!config) {
        console.error(`[COPA-SC] Config não encontrada ao avanço de grupos`);
        return;
    }

    // Atualizar standings de cada grupo
    for (const grupo of config.grupos) {
        await atualizarStandingsGrupo(ligaId, temporada, grupo.nome);
    }

    // Gerar oitavas
    await gerarOitavas(ligaId, temporada, rodada);
    console.log(`[COPA-SC] Oitavas geradas para liga ${ligaId}`);
}

/**
 * Verifica se mata-mata foi concluída e gera próxima fase.
 */
async function _verificarMataMata(ligaId, temporada, faseAtual, rodada) {
    const totalEsperado = TOTAL_CONFRONTOS_POR_FASE[faseAtual];

    if (!totalEsperado) {
        console.warn(`[COPA-SC] Fase desconhecida para mata-mata: ${faseAtual}`);
        return;
    }

    const finalizados = await CopaSCMatch.countDocuments({
        liga_id: ligaId,
        temporada,
        fase: faseAtual,
        status: 'finalizado'
    });

    if (finalizados < totalEsperado) {
        console.log(
            `[COPA-SC] ${faseAtual}: ${finalizados}/${totalEsperado} confrontos finalizados`
        );
        return;
    }

    console.log(`[COPA-SC] ${faseAtual} concluída para liga ${ligaId}`);

    const proximaFase = PROXIMA_FASE[faseAtual];
    if (!proximaFase) {
        console.warn(`[COPA-SC] Nenhuma fase seguinte após ${faseAtual}`);
        return;
    }

    await gerarProximaFaseMM(ligaId, temporada, faseAtual, proximaFase, rodada);
    console.log(`[COPA-SC] ${proximaFase} gerada para liga ${ligaId}`);
}

/**
 * Verifica se terceiro lugar e final foram concluídos, aplicando premiação.
 */
async function _verificarFinal(ligaId, temporada) {
    const finalFinalizado = await CopaSCMatch.countDocuments({
        liga_id: ligaId,
        temporada,
        fase: 'final',
        status: 'finalizado'
    });

    const terceiroFinalizado = await CopaSCMatch.countDocuments({
        liga_id: ligaId,
        temporada,
        fase: 'terceiro_lugar',
        status: 'finalizado'
    });

    if (finalFinalizado >= 1 && terceiroFinalizado >= 1) {
        console.log(`[COPA-SC] Torneio concluído para liga ${ligaId}`);
        await aplicarPremiacao(ligaId, temporada);
        console.log(`[COPA-SC] Premiação aplicada para liga ${ligaId}`);
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
    processarRodada
};
