/**
 * LINEUP OPTIMIZER v1.0
 * Otimizador de escalacao por orcamento (Cartoletas).
 *
 * Algoritmo greedy melhorado com reserva de orcamento para posicoes restantes.
 * Respeita regras do Cartola FC:
 *   - Max 3 jogadores por clube
 *   - Suporte a 7 esquemas taticos
 *   - Selecao automatica de capitao
 *
 * Gera 3 cenarios simultaneos (Mitar, Equilibrado, Valorizar).
 */

import scoringEngine, { MODOS, MODOS_CONFIG } from './scoringEngine.js';
import { sugerirModo } from '../estrategia-sugestao.js';

const LOG_PREFIX = '[LINEUP-OPTIMIZER]';

// =====================================================================
// CONSTANTES (mesmas do assistenteEscalacaoService)
// =====================================================================
const POSICOES = {
    1: { id: 1, nome: 'Goleiro', abrev: 'GOL' },
    2: { id: 2, nome: 'Lateral', abrev: 'LAT' },
    3: { id: 3, nome: 'Zagueiro', abrev: 'ZAG' },
    4: { id: 4, nome: 'Meia', abrev: 'MEI' },
    5: { id: 5, nome: 'Atacante', abrev: 'ATA' },
    6: { id: 6, nome: 'Tecnico', abrev: 'TEC' },
};

const ESQUEMAS = {
    1: { nome: '3-4-3', posicoes: { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3, 6: 1 } },
    2: { nome: '3-5-2', posicoes: { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2, 6: 1 } },
    3: { nome: '4-3-3', posicoes: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 1 } },
    4: { nome: '4-4-2', posicoes: { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2, 6: 1 } },
    5: { nome: '4-5-1', posicoes: { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1, 6: 1 } },
    6: { nome: '5-3-2', posicoes: { 1: 1, 2: 2, 3: 3, 4: 3, 5: 2, 6: 1 } },
    7: { nome: '5-4-1', posicoes: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 1, 6: 1 } },
};

// =====================================================================
// MONTAR ESCALACAO OTIMIZADA (Greedy com reserva de orcamento)
// =====================================================================

/**
 * Monta escalacao otimizada para um modo especifico.
 *
 * @param {Array} atletasRankeados - Atletas ja rankeados pelo scoringEngine
 * @param {number} esquemaId - ID do esquema tatico (1-7)
 * @param {number} patrimonio - Cartoletas disponiveis
 * @param {string} modo - Modo de estrategia
 * @returns {Object} Cenario com escalacao, gastos, pontuacao esperada
 */
function montarEscalacao(atletasRankeados, esquemaId, patrimonio, modo) {
    const esquema = ESQUEMAS[esquemaId] || ESQUEMAS[3]; // default 4-3-3
    const formacao = esquema.posicoes;

    // Agrupar por posicao e pegar top 20 candidatos
    const porPosicao = {};
    for (let pos = 1; pos <= 6; pos++) {
        porPosicao[pos] = atletasRankeados
            .filter(a => a.posicaoId === pos)
            .sort((a, b) => b.scoreFinal - a.scoreFinal)
            .slice(0, 20);
    }

    // Greedy com reserva de orcamento
    const escalacao = [];
    const clubesUsados = {};
    let gastoTotal = 0;
    let orcamentoRestante = patrimonio;

    for (let pos = 1; pos <= 6; pos++) {
        const qtdNecessaria = formacao[pos] || 0;
        if (qtdNecessaria === 0) continue;

        const candidatos = porPosicao[pos];

        for (let i = 0; i < qtdNecessaria; i++) {
            // Calcular reserva para posicoes restantes
            let reserva = 0;
            for (let p = pos; p <= 6; p++) {
                const qtdRestante = formacao[p] - (p === pos ? (i + 1) : 0);
                if (qtdRestante <= 0) continue;
                const disponiveis = porPosicao[p]
                    .filter(a => !escalacao.find(e => e.atletaId === a.atletaId))
                    .filter(a => (clubesUsados[a.clubeId] || 0) < 3)
                    .sort((a, b) => a.preco - b.preco);
                for (let j = 0; j < Math.min(qtdRestante, disponiveis.length); j++) {
                    reserva += disponiveis[j]?.preco || 0;
                }
            }

            const orcamentoDisponivel = orcamentoRestante - reserva;

            const selecionado = candidatos.find(a => {
                if (escalacao.find(e => e.atletaId === a.atletaId)) return false;
                if ((clubesUsados[a.clubeId] || 0) >= 3) return false;
                if (a.preco > orcamentoDisponivel) return false;
                return true;
            });

            if (selecionado) {
                escalacao.push({
                    ...selecionado,
                    posicaoNome: POSICOES[selecionado.posicaoId]?.nome || 'N/D',
                    posicaoAbrev: POSICOES[selecionado.posicaoId]?.abrev || 'N/D',
                    capitao: false,
                });
                clubesUsados[selecionado.clubeId] = (clubesUsados[selecionado.clubeId] || 0) + 1;
                gastoTotal += selecionado.preco;
                orcamentoRestante -= selecionado.preco;
            }
        }
    }

    // Selecionar capitao: maior score entre jogadores de campo (exceto tecnico)
    const jogadoresSemTec = escalacao.filter(a => a.posicaoId !== 6);
    if (jogadoresSemTec.length > 0) {
        const melhor = jogadoresSemTec.reduce((best, curr) =>
            curr.scoreFinal > best.scoreFinal ? curr : best
        );
        const idx = escalacao.findIndex(a => a.atletaId === melhor.atletaId);
        if (idx !== -1) escalacao[idx].capitao = true;
    }

    // Pontuacao esperada
    const pontuacaoBase = escalacao.reduce((sum, a) => {
        const pts = a.scoreDetalhe?.base || a.media;
        return sum + (a.capitao ? pts * 1.5 : pts);
    }, 0);

    return {
        modo,
        modoConfig: MODOS_CONFIG[modo],
        formacao: esquema.nome,
        esquemaId,
        escalacao,
        totalJogadores: escalacao.length,
        gastoTotal: Number(gastoTotal.toFixed(2)),
        sobra: Number((patrimonio - gastoTotal).toFixed(2)),
        pontuacaoEsperada: {
            min: Math.round(pontuacaoBase * 0.7),
            max: Math.round(pontuacaoBase * 1.3),
            media: Math.round(pontuacaoBase),
        },
    };
}

// =====================================================================
// GERAR 3 CENARIOS
// =====================================================================

/**
 * Gera 3 cenarios de escalacao simultaneos (Mitar, Equilibrado, Valorizar).
 *
 * @param {Array} atletasNormalizados - Atletas do dataAggregator
 * @param {number} patrimonio - Cartoletas
 * @param {number} esquemaId - Esquema tatico (1-7)
 * @returns {Object} { cenarios, modoSugerido }
 */
function gerarCenarios(atletasNormalizados, patrimonio, esquemaId = 3) {
    console.log(`${LOG_PREFIX} Gerando cenarios: patrimonio=C$${patrimonio}, esquema=${esquemaId}`);

    const cenarios = [];

    for (const modo of [MODOS.MITAR, MODOS.EQUILIBRADO, MODOS.VALORIZAR]) {
        // Rankear atletas para este modo
        const rankeados = scoringEngine.rankearAtletas(atletasNormalizados, modo);

        // Montar escalacao
        const cenario = montarEscalacao(rankeados, esquemaId, patrimonio, modo);
        cenarios.push(cenario);
    }

    return {
        cenarios,
        modoSugerido: sugerirModo(patrimonio),
    };
}

/**
 * Gera cenario para um modo especifico.
 */
function gerarCenarioUnico(atletasNormalizados, patrimonio, esquemaId, modo) {
    const rankeados = scoringEngine.rankearAtletas(atletasNormalizados, modo);
    return montarEscalacao(rankeados, esquemaId, patrimonio, modo);
}

/**
 * Encontrar melhor esquema automaticamente.
 * Testa todos os esquemas e retorna o que da maior pontuacao esperada.
 */
function encontrarMelhorEsquema(atletasNormalizados, patrimonio, modo = MODOS.MITAR) {
    const rankeados = scoringEngine.rankearAtletas(atletasNormalizados, modo);

    let melhorCenario = null;
    let melhorPontuacao = -1;

    for (const [id, esquema] of Object.entries(ESQUEMAS)) {
        const cenario = montarEscalacao(rankeados, parseInt(id), patrimonio, modo);
        if (cenario.pontuacaoEsperada.media > melhorPontuacao) {
            melhorPontuacao = cenario.pontuacaoEsperada.media;
            melhorCenario = cenario;
        }
    }

    return melhorCenario;
}

export default {
    montarEscalacao,
    gerarCenarios,
    gerarCenarioUnico,
    encontrarMelhorEsquema,
    POSICOES,
    ESQUEMAS,
};
