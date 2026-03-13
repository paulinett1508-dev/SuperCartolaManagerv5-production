/**
 * SCORING ENGINE v1.0
 * Motor de scoring multi-fonte para escalacao IA.
 *
 * Calcula score final de cada atleta ponderando dados de multiplas fontes.
 * Reutiliza MODOS e MODOS_CONFIG do estrategia-sugestao.js existente.
 *
 * Pesos por fonte:
 *   Cartola API (media/scouts):  35%
 *   GatoMestre Premium:          25%
 *   Confrontos (mandante+cedidos): 15%
 *   Scrapers (Analitico+blogs):  15%
 *   Pesquisa Web (Perplexity):   10%
 *
 * Bonus/Penalidades:
 *   +15% se mandante
 *   +10% por fonte adicional que confirma
 *   -20% se "duvida" em qualquer fonte
 *   -30% se suspenso/contundido
 */

import {
    MODOS,
    MODOS_CONFIG,
    resolverPesoValorizacao,
} from '../estrategia-sugestao.js';

const LOG_PREFIX = '[SCORING-ENGINE]';

// =====================================================================
// PESOS POR FONTE
// =====================================================================
const PESOS_FONTE = {
    cartolaApi: 0.35,
    gatoMestre: 0.25,
    confrontos: 0.15,
    scrapers: 0.15,
    perplexity: 0.10,
};

// =====================================================================
// CALCULAR SCORE BASE DO ATLETA
// =====================================================================
function calcularScoreBase(atleta) {
    const media = atleta.media || 0;
    const preco = atleta.preco || 0;
    const jogos = atleta.jogos || 0;

    // Media ponderada por jogos (mais jogos = mais confiavel)
    const fatorConfiabilidade = jogos >= 5 ? 1.0 : jogos >= 3 ? 0.9 : 0.75;

    return media * fatorConfiabilidade;
}

// =====================================================================
// CALCULAR SCORE GATOMESTRE
// =====================================================================
function calcularScoreGatoMestre(atleta) {
    const gm = atleta.fontes?.cartolaApi?.gato_mestre;
    const gmPremium = atleta.fontes?.gatoMestrePremium;

    if (!gm && !gmPremium) return 0;

    let score = 0;

    // GatoMestre da API publica (campo gato_mestre)
    if (gm) {
        const mandante = atleta.fontes?.confrontos?.mandante;
        const mediaGM = mandante ? (gm.media_mandante || 0) : (gm.media_visitante || 0);
        if (mediaGM > 0) {
            score = mediaGM;
        }

        // Bonus por minutos jogados (jogador titular que joga bastante)
        if (gm.minutos_jogados && gm.minutos_jogados > 70) {
            score *= 1.05;
        }
    }

    // GatoMestre Premium (endpoint autenticado)
    if (gmPremium) {
        const scorePremium = gmPremium.score || gmPremium.pontos_projetados || 0;
        if (scorePremium > 0) {
            // Usar o maior entre API publica e premium
            score = Math.max(score, scorePremium);
        }
    }

    return score;
}

// =====================================================================
// CALCULAR SCORE CONFRONTOS
// =====================================================================
function calcularScoreConfrontos(atleta) {
    const confrontos = atleta.fontes?.confrontos;
    if (!confrontos) return 0;

    let score = atleta.media || 0;

    // Bonus mandante
    if (confrontos.mandante) {
        score *= 1.15;
    }

    // Bonus por defesa adversaria vulneravel
    const cedido = confrontos.cedidoAdv || 0;
    if (cedido > 0) {
        // Quanto mais o adversario cede na posicao, melhor
        const fatorCedido = Math.min(cedido / 5, 1.5); // Cap em 1.5x
        score *= (1 + fatorCedido * 0.3);
    }

    return score;
}

// =====================================================================
// CALCULAR SCORE SCRAPERS
// =====================================================================
function calcularScoreScrapers(atleta) {
    let score = 0;

    // CartolaAnalitico projecao
    const analitico = atleta.fontes?.cartolaAnalitico;
    if (analitico?.projecao) {
        score = analitico.projecao;
    }

    // Bonus se mencionado em blogs/web
    if (atleta.fontes?.webResearch?.mencionado) {
        score = Math.max(score, atleta.media * 1.1); // Pelo menos media + 10%
    }

    return score;
}

// =====================================================================
// CALCULAR SCORE PERPLEXITY
// =====================================================================
function calcularScorePerplexity(atleta) {
    // Perplexity contribui com mencoes qualitativas
    // Score baseado em se o jogador foi mencionado como recomendacao
    const web = atleta.fontes?.webResearch;
    if (!web) return 0;

    if (web.mencionado) return atleta.media * 1.15;
    if (web.emRisco) return atleta.media * 0.5;

    return 0;
}

// =====================================================================
// CALCULAR SCORE FINAL PONDERADO
// =====================================================================

/**
 * Calcula o score final de um atleta ponderando todas as fontes.
 *
 * @param {Object} atleta - Atleta normalizado do dataAggregator
 * @param {string} modo - Modo de estrategia (mitar, equilibrado, valorizar)
 * @returns {{ scoreFinal, scoreDetalhe, penalidades }}
 */
function calcularScoreFinal(atleta, modo = MODOS.EQUILIBRADO) {
    const pesoValorizacao = resolverPesoValorizacao(modo);

    // Scores por fonte
    const scoreBase = calcularScoreBase(atleta);
    const scoreGM = calcularScoreGatoMestre(atleta);
    const scoreConfrontos = calcularScoreConfrontos(atleta);
    const scoreScrapers = calcularScoreScrapers(atleta);
    const scorePerplexity = calcularScorePerplexity(atleta);

    // Ponderacao
    let scorePonderado = 0;

    // Cartola API (media + scouts)
    scorePonderado += scoreBase * PESOS_FONTE.cartolaApi;

    // GatoMestre (usar score se disponivel, senao zero contribuicao)
    if (scoreGM > 0) {
        scorePonderado += scoreGM * PESOS_FONTE.gatoMestre;
    } else {
        // Redistribuir peso para Cartola API
        scorePonderado += scoreBase * PESOS_FONTE.gatoMestre;
    }

    // Confrontos
    if (scoreConfrontos > 0) {
        scorePonderado += scoreConfrontos * PESOS_FONTE.confrontos;
    } else {
        scorePonderado += scoreBase * PESOS_FONTE.confrontos;
    }

    // Scrapers
    if (scoreScrapers > 0) {
        scorePonderado += scoreScrapers * PESOS_FONTE.scrapers;
    } else {
        scorePonderado += scoreBase * PESOS_FONTE.scrapers;
    }

    // Perplexity
    if (scorePerplexity > 0) {
        scorePonderado += scorePerplexity * PESOS_FONTE.perplexity;
    } else {
        scorePonderado += scoreBase * PESOS_FONTE.perplexity;
    }

    // Aplicar fator valorizacao (para modo VALORIZAR, priorizar baratos com potencial)
    if (pesoValorizacao > 0 && atleta.variacao > 0) {
        const fatorValorizacao = 1 + (atleta.variacao / 10) * (pesoValorizacao / 100);
        scorePonderado *= fatorValorizacao;
    }

    // Penalidades
    const penalidades = [];

    // -20% se em risco/duvida
    if (atleta.fontes?.webResearch?.emRisco) {
        scorePonderado *= 0.8;
        penalidades.push({ tipo: 'duvida_web', fator: 0.8, motivo: 'Jogador em duvida segundo fontes web' });
    }

    // Bonus por consenso (multiplas fontes confirmam)
    const fontesConfirmam = atleta.fontesConfirmam || 1;
    if (fontesConfirmam >= 4) {
        scorePonderado *= 1.10;
    } else if (fontesConfirmam >= 3) {
        scorePonderado *= 1.05;
    }

    return {
        scoreFinal: Number(scorePonderado.toFixed(2)),
        scoreDetalhe: {
            base: Number(scoreBase.toFixed(2)),
            gatoMestre: Number(scoreGM.toFixed(2)),
            confrontos: Number(scoreConfrontos.toFixed(2)),
            scrapers: Number(scoreScrapers.toFixed(2)),
            perplexity: Number(scorePerplexity.toFixed(2)),
        },
        penalidades,
        confianca: atleta.confianca || 0,
        fontesConfirmam,
    };
}

// =====================================================================
// RANKEAR ATLETAS POR POSICAO
// =====================================================================

/**
 * Rankeia todos os atletas por score final, agrupados por posicao.
 *
 * @param {Array} atletasNormalizados - Atletas do dataAggregator
 * @param {string} modo - Modo de estrategia
 * @returns {Array} Atletas com scoreFinal calculado, ordenados por score
 */
function rankearAtletas(atletasNormalizados, modo = MODOS.EQUILIBRADO) {
    console.log(`${LOG_PREFIX} Rankeando ${atletasNormalizados.length} atletas em modo ${modo}...`);

    const atletasComScore = atletasNormalizados.map(atleta => {
        const scoring = calcularScoreFinal(atleta, modo);
        return {
            ...atleta,
            scoreFinal: scoring.scoreFinal,
            scoreDetalhe: scoring.scoreDetalhe,
            penalidades: scoring.penalidades,
        };
    });

    // Ordenar por score final (maior primeiro)
    atletasComScore.sort((a, b) => b.scoreFinal - a.scoreFinal);

    return atletasComScore;
}

export default {
    calcularScoreFinal,
    rankearAtletas,
    PESOS_FONTE,
};

export { MODOS, MODOS_CONFIG };
