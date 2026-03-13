/**
 * PERPLEXITY ANALYSIS SERVICE v1.0
 * Usa a API HTTP da Perplexity para pesquisa web inteligente sobre Cartola FC.
 *
 * Diferente do MCP tool (usado pelo Claude interativamente), este servico
 * faz chamadas diretas a API da Perplexity em runtime para enriquecer
 * a analise de escalacao com dados frescos da web.
 *
 * Env: PERPLEXITY_API_KEY
 * Cache: NodeCache 1h (pesquisa web nao muda rapido)
 * Modelo: sonar (otimizado para pesquisa)
 */

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hora
const LOG_PREFIX = '[PERPLEXITY]';
const API_URL = 'https://api.perplexity.ai/chat/completions';

// =====================================================================
// VERIFICAR API KEY
// =====================================================================
function getApiKey() {
    return process.env.PERPLEXITY_API_KEY || null;
}

function isDisponivel() {
    return !!getApiKey();
}

// =====================================================================
// CHAMADA GENERICA A PERPLEXITY
// =====================================================================
async function perguntarPerplexity(pergunta, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log(`${LOG_PREFIX} API key nao configurada (PERPLEXITY_API_KEY)`);
        return null;
    }

    const cacheKey = `perplexity_${Buffer.from(pergunta).toString('base64').substring(0, 50)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: options.model || 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'Voce e um analista especializado em Cartola FC (fantasy football brasileiro). Responda sempre em portugues. Seja objetivo, preciso e baseie-se em dados reais e atuais.',
                    },
                    {
                        role: 'user',
                        content: pergunta,
                    },
                ],
                max_tokens: options.maxTokens || 2000,
                temperature: 0.1, // Baixa para respostas factuais
            }),
        });

        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            console.error(`${LOG_PREFIX} HTTP ${resp.status}: ${errBody.substring(0, 200)}`);
            return null;
        }

        const data = await resp.json();
        const resposta = data.choices?.[0]?.message?.content;

        if (!resposta) {
            console.warn(`${LOG_PREFIX} Resposta vazia da Perplexity`);
            return null;
        }

        const resultado = {
            resposta,
            citations: data.citations || [],
            modelo: data.model,
            pergunta,
            buscadoEm: new Date().toISOString(),
        };

        cache.set(cacheKey, resultado);
        return resultado;
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro: ${error.message}`);
        return null;
    }
}

// =====================================================================
// PESQUISAS ESPECIFICAS PARA ESCALACAO
// =====================================================================

/**
 * Busca analise de melhores jogadores para escalar na rodada.
 */
async function buscarMelhoresJogadores(rodada) {
    const pergunta = `Quais sao os melhores jogadores para escalar no Cartola FC na rodada ${rodada} do Brasileirao 2026? `
        + `Liste os top 3 jogadores por posicao (goleiro, lateral, zagueiro, meia, atacante, tecnico) `
        + `com justificativa baseada em confronto, mandante/visitante e momento. `
        + `Formato: Posicao - Nome (Clube) - Motivo breve.`;

    const resultado = await perguntarPerplexity(pergunta);
    if (!resultado) return null;

    return {
        tipo: 'melhores_jogadores',
        rodada,
        ...resultado,
        jogadores: parsearJogadoresDoTexto(resultado.resposta),
    };
}

/**
 * Busca jogadores que sao duvida para a rodada.
 */
async function buscarJogadoresDuvida(rodada) {
    const pergunta = `Quais jogadores do Brasileirao 2026 sao duvida ou desfalque para a rodada ${rodada}? `
        + `Liste jogadores lesionados, suspensos ou com duvida medica. `
        + `Inclua o clube e o motivo da duvida.`;

    const resultado = await perguntarPerplexity(pergunta);
    if (!resultado) return null;

    return {
        tipo: 'jogadores_duvida',
        rodada,
        ...resultado,
        jogadoresRisco: parsearJogadoresRisco(resultado.resposta),
    };
}

/**
 * Busca analise de confrontos da rodada.
 */
async function buscarAnaliseConfrontos(rodada) {
    const pergunta = `Analise os confrontos da rodada ${rodada} do Brasileirao 2026 para o Cartola FC. `
        + `Para cada jogo, indique: qual time favorito, se a defesa do adversario e fragil (cede muitos gols), `
        + `e quais jogadores podem se destacar. Foque nos jogos mais desequilibrados.`;

    const resultado = await perguntarPerplexity(pergunta);
    if (!resultado) return null;

    return {
        tipo: 'analise_confrontos',
        rodada,
        ...resultado,
    };
}

/**
 * Busca consenso geral da comunidade sobre escalacao.
 */
async function buscarConsensoEscalacao(rodada) {
    const pergunta = `Qual o consenso dos principais sites e analistas de Cartola FC para a rodada ${rodada} do Brasileirao 2026? `
        + `Quais jogadores estao sendo mais escalados e recomendados? `
        + `Cite fontes como Cartola Analitico, Cartoleiros, GatoMestre, e analistas conhecidos.`;

    const resultado = await perguntarPerplexity(pergunta);
    if (!resultado) return null;

    return {
        tipo: 'consenso_escalacao',
        rodada,
        ...resultado,
    };
}

// =====================================================================
// PESQUISA COMPLETA (todas as analises em paralelo)
// =====================================================================
async function pesquisaCompleta(rodada) {
    if (!isDisponivel()) {
        return {
            disponivel: false,
            motivo: 'PERPLEXITY_API_KEY nao configurada',
        };
    }

    const cacheKey = `perplexity_completa_r${rodada}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    console.log(`${LOG_PREFIX} Iniciando pesquisa completa para rodada ${rodada}...`);

    const [melhores, duvida, confrontos, consenso] = await Promise.allSettled([
        buscarMelhoresJogadores(rodada),
        buscarJogadoresDuvida(rodada),
        buscarAnaliseConfrontos(rodada),
        buscarConsensoEscalacao(rodada),
    ]);

    const resultado = {
        disponivel: true,
        rodada,
        melhoresJogadores: melhores.status === 'fulfilled' ? melhores.value : null,
        jogadoresDuvida: duvida.status === 'fulfilled' ? duvida.value : null,
        analiseConfrontos: confrontos.status === 'fulfilled' ? confrontos.value : null,
        consensoEscalacao: consenso.status === 'fulfilled' ? consenso.value : null,
        pesquisadoEm: new Date().toISOString(),
        fontesUsadas: [],
    };

    // Coletar citations de todas as fontes
    for (const r of [melhores, duvida, confrontos, consenso]) {
        if (r.status === 'fulfilled' && r.value?.citations) {
            resultado.fontesUsadas.push(...r.value.citations);
        }
    }
    resultado.fontesUsadas = [...new Set(resultado.fontesUsadas)];

    cache.set(cacheKey, resultado);
    console.log(`${LOG_PREFIX} Pesquisa completa rodada ${rodada}: ${resultado.fontesUsadas.length} fontes`);

    return resultado;
}

// =====================================================================
// PARSERS DE TEXTO
// =====================================================================

/**
 * Extrai nomes de jogadores mencionados no texto da Perplexity.
 * Retorna array de { nome, clube, posicao, motivo }
 */
function parsearJogadoresDoTexto(texto) {
    if (!texto) return [];

    const jogadores = [];
    const linhas = texto.split('\n');

    // Padroes comuns: "Nome (Clube)" ou "Nome - Clube"
    const padrao = /([A-Z][a-záéíóúãõâêô]+(?:\s+[A-Z]?[a-záéíóúãõâêô]+)*)\s*[\(\-–]\s*([A-Za-záéíóúãõâêô\s]+)\)?/g;

    for (const linha of linhas) {
        let match;
        while ((match = padrao.exec(linha)) !== null) {
            const nome = match[1].trim();
            const clube = match[2].trim().replace(/\)$/, '');

            // Filtrar falsos positivos
            if (nome.length < 3 || nome.length > 30) continue;
            if (['Cartola', 'Brasileirao', 'Rodada', 'Serie'].includes(nome)) continue;

            jogadores.push({
                nome,
                clube,
                contexto: linha.trim().substring(0, 200),
            });
        }
    }

    // Remover duplicatas por nome
    const vistos = new Set();
    return jogadores.filter(j => {
        if (vistos.has(j.nome)) return false;
        vistos.add(j.nome);
        return true;
    });
}

/**
 * Extrai jogadores em risco (duvida/lesionado/suspenso).
 */
function parsearJogadoresRisco(texto) {
    if (!texto) return [];

    const jogadores = [];
    const padraoRisco = /([A-Z][a-záéíóúãõâêô]+(?:\s+[A-Z]?[a-záéíóúãõâêô]+)*)\s*.*?(lesion|suspend|duvida|d[uú]vida|contund|desfalque|fora|ausent)/gi;

    let match;
    while ((match = padraoRisco.exec(texto)) !== null) {
        const nome = match[1].trim();
        if (nome.length < 3 || nome.length > 30) continue;

        jogadores.push({
            nome,
            motivo: match[2].toLowerCase(),
            contexto: texto.substring(Math.max(0, match.index - 50), match.index + 100).trim(),
        });
    }

    const vistos = new Set();
    return jogadores.filter(j => {
        if (vistos.has(j.nome)) return false;
        vistos.add(j.nome);
        return true;
    });
}

// =====================================================================
// GERAR JUSTIFICATIVA IA PARA ESCALACAO
// =====================================================================
async function gerarJustificativaEscalacao(escalacao, contexto) {
    if (!isDisponivel()) return null;

    const jogadoresTexto = escalacao
        .map(j => `${j.posicao} - ${j.nome} (${j.clubeAbrev}) C$ ${j.preco} | Score: ${j.scoreFinal?.toFixed(1)}`)
        .join('\n');

    const pergunta = `Analise esta escalacao sugerida para o Cartola FC rodada ${contexto.rodada} do Brasileirao 2026:\n\n`
        + `${jogadoresTexto}\n\n`
        + `Patrimonio: C$ ${contexto.patrimonio} | Modo: ${contexto.modo} | Formacao: ${contexto.formacao}\n\n`
        + `Para cada jogador, escreva uma justificativa de 1-2 linhas explicando POR QUE ele foi escolhido `
        + `(confronto favoravel, momento, mandante, defesa adversaria fragil, etc). `
        + `No final, de um resumo executivo da escalacao em 2-3 frases.`;

    return perguntarPerplexity(pergunta, { maxTokens: 3000 });
}

export default {
    isDisponivel,
    perguntarPerplexity,
    buscarMelhoresJogadores,
    buscarJogadoresDuvida,
    buscarAnaliseConfrontos,
    buscarConsensoEscalacao,
    pesquisaCompleta,
    gerarJustificativaEscalacao,
};
