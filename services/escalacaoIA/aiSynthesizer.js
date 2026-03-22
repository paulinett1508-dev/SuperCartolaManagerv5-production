/**
 * AI SYNTHESIZER v1.0
 * Gera justificativas em linguagem natural para cada jogador da escalacao.
 *
 * Usa Perplexity API para gerar textos explicativos baseados nos dados
 * coletados pelo dataAggregator e scoring do scoringEngine.
 *
 * Funcionalidades:
 *   - Justificativa individual por jogador
 *   - Resumo executivo da escalacao completa
 *   - Cache junto com snapshot da analise
 */

import perplexityService from '../perplexityAnalysisService.js';
import professorPrompt from './professorPrompt.js';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 1800 }); // 30 min
const LOG_PREFIX = '[AI-SYNTHESIZER]';

// =====================================================================
// GERAR JUSTIFICATIVAS LOCAIS (sem IA - fallback)
// =====================================================================

/**
 * Gera justificativa local baseada nos dados disponiveis (sem chamada externa).
 * Usado como fallback quando Perplexity nao esta disponivel.
 */
function gerarJustificativaLocal(jogador) {
    const partes = [];

    // Media
    if (jogador.media > 0) {
        partes.push(`Media ${jogador.media.toFixed(1)} pts`);
    }

    // Mandante/Visitante
    if (jogador.fontes?.confrontos?.mandante === true) {
        partes.push('joga em casa');
    } else if (jogador.fontes?.confrontos?.mandante === false) {
        partes.push('joga fora');
    }

    // Adversario
    const advNome = jogador.fontes?.confrontos?.adversarioNome;
    if (advNome) {
        partes.push(`contra ${advNome}`);
    }

    // Defesa adversaria vulneravel
    const cedido = jogador.fontes?.confrontos?.cedidoAdv || 0;
    if (cedido > 5) {
        partes.push(`defesa adversaria fragil (cede ${cedido.toFixed(1)} pts na posicao)`);
    } else if (cedido > 3) {
        partes.push(`adversario cede ${cedido.toFixed(1)} pts na posicao`);
    }

    // GatoMestre
    const gm = jogador.fontes?.cartolaApi?.gato_mestre;
    if (gm) {
        const mediaGM = jogador.fontes?.confrontos?.mandante
            ? gm.media_mandante
            : gm.media_visitante;
        if (mediaGM > 0) {
            partes.push(`GatoMestre projeta ${mediaGM.toFixed(1)} pts`);
        }
    }

    // Valorizacao
    if (jogador.variacao > 0) {
        partes.push(`valorizou C$ ${jogador.variacao.toFixed(2)}`);
    }

    // Confianca
    if (jogador.confianca >= 70) {
        partes.push(`alta confianca (${jogador.confianca}%)`);
    }

    // Mencionado em fontes web
    if (jogador.fontes?.webResearch?.mencionado) {
        partes.push('recomendado por analistas');
    }

    // CartolaAnalitico
    const projecao = jogador.fontes?.cartolaAnalitico?.projecao;
    if (projecao > 0) {
        partes.push(`projecao Analitico: ${projecao.toFixed(1)} pts`);
    }

    return partes.length > 0
        ? `${jogador.nome} (C$ ${jogador.preco.toFixed(2)}) - ${partes.join('. ')}.`
        : `${jogador.nome} (C$ ${jogador.preco.toFixed(2)}) - Selecionado por score geral.`;
}

// =====================================================================
// GERAR JUSTIFICATIVAS VIA IA (Perplexity)
// =====================================================================

/**
 * Gera justificativas detalhadas usando Perplexity IA.
 * Fallback: justificativas locais se Perplexity indisponivel.
 *
 * @param {Object} cenario - Cenario do lineupOptimizer
 * @param {Object} contexto - { rodada, patrimonio, fontesAtivas }
 * @returns {Object} { justificativas: { [atletaId]: string }, resumo: string, usouIA: bool }
 */
async function gerarJustificativas(cenario, contexto = {}) {
    const modoProfessor = contexto.modoProfessor || false;
    const cacheKey = `synth_${cenario.modo}_r${contexto.rodada}${modoProfessor ? '_prof' : ''}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const escalacao = cenario.escalacao || [];

    // Gerar justificativas locais (sempre disponiveis)
    const justificativasLocais = {};
    for (const jogador of escalacao) {
        justificativasLocais[jogador.atletaId] = gerarJustificativaLocal(jogador);
    }

    // Tentar Perplexity para justificativas mais ricas
    let justificativasIA = null;
    let resumoIA = null;
    let usouIA = false;

    if (perplexityService.isDisponivel()) {
        try {
            console.log(`${LOG_PREFIX} Gerando justificativas via Perplexity (Modo Professor: ${modoProfessor})...`);
            
            let resultado;
            if (modoProfessor) {
                console.log(`${LOG_PREFIX} Iniciando Modo Professor...`);
                const systemPrompt = professorPrompt.getSystemPromptProfessor(cenario.modo);
                const jogadoresTexto = escalacao
                    .map(j => `**${j.nome}** (${j.clubeAbrev}) - ${j.posicaoAbrev} | C$ ${j.preco} | Score: ${j.scoreFinal?.toFixed(1)}`)
                    .join('\n');
                
                const userPrompt = `Professor, analise esta escalacao para a rodada ${contexto.rodada} (Modo: ${cenario.modo.toUpperCase()}):\n\n${jogadoresTexto}\n\nExplique a estrategia por tras de cada escolha e de uma aula sobre a rodada.`;
                
                resultado = await perplexityService.perguntarPerplexityCustom(userPrompt, systemPrompt, { temperature: 0.4 });
            } else {
                resultado = await perplexityService.gerarJustificativaEscalacao(
                    escalacao.map(j => ({
                        posicao: j.posicaoAbrev,
                        nome: j.nome,
                        clubeAbrev: j.clubeAbrev,
                        preco: j.preco,
                        scoreFinal: j.scoreFinal,
                    })),
                    {
                        rodada: contexto.rodada,
                        patrimonio: contexto.patrimonio,
                        modo: cenario.modo,
                        formacao: cenario.formacao,
                    }
                );
            }

            if (resultado?.resposta) {
                // Parsear resposta da IA em justificativas por jogador
                justificativasIA = parsearJustificativasIA(resultado.resposta, escalacao);
                resumoIA = extrairResumoExecutivo(resultado.resposta);
                usouIA = true;
            }
        } catch (error) {
            console.warn(`${LOG_PREFIX} Perplexity falhou, usando justificativas locais: ${error.message}`);
        }
    }

    // Mesclar: IA tem prioridade, local como fallback
    const justificativasFinal = {};
    for (const jogador of escalacao) {
        justificativasFinal[jogador.atletaId] =
            justificativasIA?.[jogador.atletaId] ||
            justificativasLocais[jogador.atletaId];
    }

    // Resumo executivo
    const resumo = resumoIA || gerarResumoLocal(cenario, contexto);

    const resultado = {
        justificativas: justificativasFinal,
        resumo,
        usouIA,
        geradoEm: new Date().toISOString(),
    };

    cache.set(cacheKey, resultado);
    return resultado;
}

// =====================================================================
// PARSERS
// =====================================================================

/**
 * Extrai justificativas por jogador do texto da IA.
 */
function parsearJustificativasIA(texto, escalacao) {
    if (!texto) return null;

    const resultado = {};
    const linhas = texto.split('\n');

    for (const jogador of escalacao) {
        const nomeNorm = jogador.nome.toLowerCase();

        // Buscar linha que menciona o jogador
        for (const linha of linhas) {
            if (linha.toLowerCase().includes(nomeNorm)) {
                // Pegar a linha inteira como justificativa
                const justificativa = linha.replace(/^[-*•\d.]+\s*/, '').trim();
                if (justificativa.length > 20) {
                    resultado[jogador.atletaId] = justificativa;
                    break;
                }
            }
        }
    }

    return Object.keys(resultado).length > 0 ? resultado : null;
}

/**
 * Extrai resumo executivo do final do texto.
 */
function extrairResumoExecutivo(texto) {
    if (!texto) return null;

    // Procurar secao de resumo
    const marcadores = ['resumo', 'conclus', 'em resumo', 'no geral', 'esta escalacao'];
    const linhas = texto.split('\n');

    for (let i = linhas.length - 1; i >= 0; i--) {
        const linhaNorm = linhas[i].toLowerCase();
        for (const marcador of marcadores) {
            if (linhaNorm.includes(marcador)) {
                // Pegar daqui ate o final
                return linhas.slice(i).join(' ').replace(/^[-*•#]+\s*/, '').trim();
            }
        }
    }

    // Fallback: ultimas 2 linhas nao vazias
    const naoVazias = linhas.filter(l => l.trim().length > 20);
    if (naoVazias.length >= 2) {
        return naoVazias.slice(-2).join(' ').trim();
    }

    return null;
}

/**
 * Gera resumo executivo local (sem IA).
 */
function gerarResumoLocal(cenario, contexto) {
    const capitao = cenario.escalacao.find(j => j.capitao);
    const totalJogadores = cenario.escalacao.length;
    const modoNome = cenario.modoConfig?.nome || cenario.modo;

    const partes = [
        `Escalacao ${modoNome} com ${totalJogadores} jogadores na formacao ${cenario.formacao}.`,
        `Gasto: C$ ${cenario.gastoTotal} (sobra C$ ${cenario.sobra}).`,
        `Pontuacao esperada: ${cenario.pontuacaoEsperada.min}-${cenario.pontuacaoEsperada.max} pts.`,
    ];

    if (capitao) {
        partes.push(`Capitao: ${capitao.nome} (${capitao.clubeAbrev}).`);
    }

    const fontesAtivas = contexto.fontesAtivas || [];
    if (fontesAtivas.length > 1) {
        partes.push(`Analise baseada em ${fontesAtivas.length} fontes de dados.`);
    }

    return partes.join(' ');
}

export default {
    gerarJustificativas,
    gerarJustificativaLocal,
    gerarResumoLocal,
};
