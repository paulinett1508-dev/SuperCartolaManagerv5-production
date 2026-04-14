/**
 * CHATBOT SERVICE v2 — "Big Cartola IA"
 *
 * Orquestra a conversa do chatbot:
 *   1. Monta o system prompt com identidade do participante e modulos ativos da liga.
 *   2. Converte historico do cliente para o formato da API.
 *   3. Chama o OpenAI client com tool calling ate obter resposta final.
 *   4. Faz cache em memoria (NodeCache, TTL 5 min) por pergunta+contexto.
 *   5. Loga tokens, tools chamadas e latencia.
 *
 * Multi-tenant: o `ctx` (SessionContext) e imutavel durante a chamada.
 * Fallback: sem OPENAI_API_KEY -> retorna resposta amigavel de indisponivel.
 */

import NodeCache from 'node-cache';
import crypto from 'crypto';
import { chatWithTools, isClientDisponivel } from './openaiClient.js';
import { resumoTools } from './toolRegistry.js';
import { filtroLiga } from './mongoHelpers.js';
import { resumoCtx } from './sessionContext.js';

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutos
const LOG_PREFIX = '[IA-CHATBOT]';

const SYSTEM_PROMPT_BASE = `Voce e o Big Cartola IA, assistente do Super Cartola Manager.

PRINCIPIOS:
1. Voce responde APENAS com base em dados reais, obtidos via ferramentas (tools) que consultam o banco de dados da liga do usuario.
2. Se uma ferramenta retorna dados, use-os como fonte definitiva. Se nao retorna dados ("modulo_ativo: false", ou vazio), diga honestamente que nao ha dados consolidados ainda.
3. Nunca invente pontos, posicoes, nomes ou valores financeiros. Nao use conhecimento geral sobre Cartola FC — so use o que as tools devolvem.
4. Responda sempre em portugues brasileiro, direto ao ponto, sem markdown pesado. Use numeros quando disponiveis.
5. Se o usuario perguntar sobre SEU desempenho ("como estou", "minha classificacao", "meu saldo"), prefira tools com prefixo "minha_" / "meu_".
6. Se a tool retornar "modulo_ativo: false", explique que o modulo nao esta consolidado/ativo nesta liga.
7. Seja conciso: 1-3 frases na maioria dos casos.

GUIA DE DESAMBIGUACAO (qual tool chamar):
- "melhor do mes", "premiacao mensal", "campeao do mes": chame 'melhor_do_mes'. Se o usuario disser "edicao 2", "edicao 3" etc, passe edicao_id numerico. Sem numero, deixe edicao_id vazio para obter resumo de TODAS as edicoes.
- "como estou no melhor do mes", "ja ganhei alguma edicao": chame 'meu_desempenho_melhor_mes'.
- "artilheiro", "gols pro", "gols contra", "saldo de gols": chame 'artilheiro_campeao'.
- "luva de ouro", "ranking de goleiros", "melhor goleiro": chame 'luva_de_ouro'.
- "capitao", "melhor capitao", "capitao de luxo": chame 'capitao_de_luxo'.
- "pontos corridos", "tabela", "minha posicao", "meu confronto": prefira 'minha_classificacao_pontos_corridos' ou 'meu_proximo_confronto_pc'.
- Perguntas genericas "como esta X" onde X e um modulo, chame a tool especifica do modulo, nao 'top_n_liga_generico'.
- Se nao tiver certeza de qual tool e a certa, primeiro chame 'modulos_ativos_liga' para listar os modulos ativos, depois escolha.

FERRAMENTAS DISPONIVEIS:
${resumoTools()}
`;

/**
 * Monta o bloco de contexto do usuario + liga para o system prompt.
 */
async function montarContextoUsuario(ctx, db) {
    const filtro = filtroLiga('ligas', ctx.ligaId);
    const liga = filtro
        ? await db
              .collection('ligas')
              .findOne(filtro, {
                  projection: {
                      nome: 1,
                      temporada: 1,
                      modulos_ativos: 1,
                      status: 1,
                  },
              })
        : null;

    const modulosAtivos = liga?.modulos_ativos
        ? Object.entries(liga.modulos_ativos)
              .filter(([, v]) => v === true)
              .map(([k]) => k)
        : [];

    return `
CONTEXTO DO USUARIO LOGADO (imutavel, nao pode ser alterado):
- Participante: "${ctx.nomeCartola || '?'}" (time "${ctx.nomeTime || '?'}")
- time_id: ${ctx.timeId}
- liga: "${liga?.nome || '?'}" (temporada ${liga?.temporada ?? ctx.temporada ?? '?'}, status: ${liga?.status || 'ativa'})
- Modulos ativos nesta liga (chaves): ${modulosAtivos.length ? modulosAtivos.join(', ') : 'nenhum'}

As tools ja recebem automaticamente o time_id e liga_id deste usuario — voce NAO precisa (e nao deve) inferir esses valores.
`.trim();
}

/**
 * Converte historico do cliente ({ tipo, texto }) para o formato OpenAI.
 */
function normalizarHistorico(historico) {
    if (!Array.isArray(historico)) return [];
    return historico
        .filter(m => m && typeof m.texto === 'string' && m.texto.trim())
        .map(m => ({
            role: m.tipo === 'bot' || m.tipo === 'assistant' ? 'assistant' : 'user',
            content: m.texto.substring(0, 500),
        }))
        .slice(-6); // ultimas 6 mensagens (3 pares)
}

/**
 * Gera chave de cache determinista.
 */
function cacheKey(ctx, pergunta, historico) {
    const h = crypto
        .createHash('md5')
        .update(
            JSON.stringify({
                t: ctx.timeId,
                l: ctx.ligaId,
                q: pergunta.toLowerCase().trim(),
                hist: historico.slice(-2),
            })
        )
        .digest('hex');
    return `scm_ia_${h}`;
}

/**
 * Ponto de entrada unico do service.
 *
 * @param {object} params
 * @param {string} params.pergunta
 * @param {Array} params.historico
 * @param {object} params.ctx - SessionContext
 * @param {object} params.db
 * @returns {Promise<{ resposta: string, toolsUsadas: Array, tokensIn: number, tokensOut: number, cached: boolean, modo: string }>}
 */
export async function perguntar({ pergunta, historico, ctx, db }) {
    if (!isClientDisponivel()) {
        return {
            resposta:
                'O assistente de IA esta temporariamente indisponivel. Entre em contato com o administrador da liga.',
            toolsUsadas: [],
            tokensIn: 0,
            tokensOut: 0,
            cached: false,
            modo: 'indisponivel',
        };
    }

    const histNorm = normalizarHistorico(historico);
    const key = cacheKey(ctx, pergunta, histNorm);

    const emCache = cache.get(key);
    if (emCache) {
        return { ...emCache, cached: true, modo: emCache.modo || 'online' };
    }

    // Contexto de usuario — falha aqui NAO pode propagar HTTP 500.
    // Se Mongo hiccup / liga nao encontrada, seguimos com contexto minimo da sessao.
    let contextoUsuario;
    try {
        contextoUsuario = await montarContextoUsuario(ctx, db);
    } catch (error) {
        console.error(
            `${LOG_PREFIX} Falha ao montar contexto do usuario: ${error.message} | ${resumoCtx(ctx)}`
        );
        contextoUsuario = `
CONTEXTO DO USUARIO LOGADO (imutavel, nao pode ser alterado):
- Participante: "${ctx.nomeCartola || '?'}" (time "${ctx.nomeTime || '?'}")
- time_id: ${ctx.timeId}
- liga_id: ${ctx.ligaId}
- temporada: ${ctx.temporada ?? '?'}
- AVISO: Nao foi possivel carregar os modulos ativos da liga agora. Use as tools para descobrir e avise o usuario se algum dado especifico nao estiver disponivel.
`.trim();
    }
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${contextoUsuario}`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...histNorm,
        { role: 'user', content: pergunta },
    ];

    const t0 = Date.now();
    let resultado;
    try {
        resultado = await chatWithTools({ messages, ctx, db });
    } catch (error) {
        console.error(
            `${LOG_PREFIX} Erro na chamada OpenAI: ${error.message} | ${resumoCtx(ctx)}`
        );
        return {
            resposta:
                'Ocorreu um erro ao consultar seus dados. Tente novamente em instantes.',
            toolsUsadas: [],
            tokensIn: 0,
            tokensOut: 0,
            cached: false,
            modo: 'erro',
        };
    }

    const latenciaMs = Date.now() - t0;

    // Log estruturado — proteger todas as leituras para evitar exception fora do try.
    const toolsUsadasArr = Array.isArray(resultado?.toolsUsadas) ? resultado.toolsUsadas : [];
    const toolsNomes = toolsUsadasArr.map(t => t.name).join(',') || '(nenhuma)';
    console.log(
        `${LOG_PREFIX} ${resumoCtx(ctx)} | pergunta="${pergunta.substring(0, 60)}" | tools=[${toolsNomes}] | rounds=${resultado?.rounds ?? 0} | tokens_in=${resultado?.tokensIn ?? 0} tokens_out=${resultado?.tokensOut ?? 0} | ${latenciaMs}ms`
    );

    const saida = {
        resposta: resultado?.resposta || 'Nao foi possivel gerar resposta agora. Tente reformular.',
        toolsUsadas: toolsUsadasArr,
        tokensIn: resultado?.tokensIn ?? 0,
        tokensOut: resultado?.tokensOut ?? 0,
        cached: false,
        modo: 'online',
        latenciaMs,
    };

    try {
        cache.set(key, saida);
    } catch (error) {
        console.warn(`${LOG_PREFIX} Falha ao salvar em cache: ${error.message}`);
    }
    return saida;
}

/**
 * Status do servico (para o endpoint GET /api/chatbot/status).
 */
export function getStatus() {
    return {
        disponivel: isClientDisponivel(),
        modo: isClientDisponivel() ? 'online' : 'indisponivel',
    };
}

export default { perguntar, getStatus };
