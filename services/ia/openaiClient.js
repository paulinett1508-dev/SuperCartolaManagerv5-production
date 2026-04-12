/**
 * OPENAI CLIENT — Big Cartola IA v2
 *
 * Wrapper fino sobre o SDK `openai` que executa um loop de function
 * calling: envia mensagens -> se houver tool_calls, executa os handlers
 * locais injetando `ctx` (SessionContext) e `db`, devolve os resultados
 * para o modelo, repete ate que o modelo produza a resposta final.
 *
 * Nunca passa `ligaId`/`timeId` vindos do modelo — essas chaves vem
 * SEMPRE do ctx da sessao (isolamento multi-tenant).
 */

import OpenAI from 'openai';
import { getTool, listarToolsParaOpenAI } from './toolRegistry.js';

const LOG_PREFIX = '[IA-OPENAI]';

let _client = null;
function getClient() {
    if (_client) return _client;
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY nao configurada');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _client;
}

export function isClientDisponivel() {
    return !!process.env.OPENAI_API_KEY;
}

/**
 * Executa uma conversa com tool calling ate convergir em uma resposta de texto.
 *
 * @param {object} params
 * @param {Array<{ role: string, content: string }>} params.messages - mensagens iniciais (system + historico + user)
 * @param {object} params.ctx - SessionContext (timeId, ligaId, etc.)
 * @param {object} params.db - mongoose.connection.db
 * @param {object} [params.opts] - overrides (model, temperature, maxRounds)
 *
 * @returns {Promise<{
 *   resposta: string,
 *   toolsUsadas: Array<{ name: string, args: object, ms: number, ok: boolean }>,
 *   tokensIn: number,
 *   tokensOut: number,
 *   rounds: number
 * }>}
 */
export async function chatWithTools({ messages, ctx, db, opts = {} }) {
    const client = getClient();
    const model = opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature =
        opts.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0.2');
    const maxTokens = opts.maxTokens || 500;
    const maxRounds = opts.maxRounds || 4; // seguranca: no maximo 4 round-trips de tools

    const tools = listarToolsParaOpenAI();

    const conversa = [...messages];
    const toolsUsadas = [];
    let tokensIn = 0;
    let tokensOut = 0;
    let rounds = 0;

    while (rounds < maxRounds) {
        rounds++;

        const resp = await client.chat.completions.create({
            model,
            messages: conversa,
            tools,
            tool_choice: 'auto',
            temperature,
            max_tokens: maxTokens,
        });

        tokensIn += resp.usage?.prompt_tokens || 0;
        tokensOut += resp.usage?.completion_tokens || 0;

        const choice = resp.choices?.[0];
        const msg = choice?.message;
        if (!msg) {
            return {
                resposta:
                    'Nao foi possivel gerar resposta agora. Tente reformular a pergunta.',
                toolsUsadas,
                tokensIn,
                tokensOut,
                rounds,
            };
        }

        // Caso terminal: resposta textual pronta
        if (choice.finish_reason !== 'tool_calls' || !msg.tool_calls?.length) {
            return {
                resposta: (msg.content || '').trim(),
                toolsUsadas,
                tokensIn,
                tokensOut,
                rounds,
            };
        }

        // Adicionar o assistant message (com os tool_calls) na conversa
        conversa.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.tool_calls,
        });

        // Executar cada tool call em paralelo e devolver resultados
        const execucoes = await Promise.all(
            msg.tool_calls.map(async call => {
                const nome = call.function?.name;
                let args = {};
                try {
                    args = call.function?.arguments
                        ? JSON.parse(call.function.arguments)
                        : {};
                } catch {
                    args = {};
                }

                const tool = getTool(nome);
                const t0 = Date.now();
                let resultado;
                let ok = true;

                if (!tool) {
                    resultado = { erro: 'tool_desconhecida', nome };
                    ok = false;
                } else {
                    try {
                        resultado = await tool.handler({ args, ctx, db });
                    } catch (error) {
                        ok = false;
                        resultado = { erro: 'erro_execucao', detalhe: error.message };
                        console.warn(
                            `${LOG_PREFIX} tool ${nome} falhou: ${error.message}`
                        );
                    }
                }

                const ms = Date.now() - t0;
                toolsUsadas.push({ name: nome, args, ms, ok });

                return {
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(resultado),
                };
            })
        );

        conversa.push(...execucoes);
    }

    // Estourou rounds — forcar uma resposta final sem tools
    const finalResp = await client.chat.completions.create({
        model,
        messages: [
            ...conversa,
            {
                role: 'system',
                content:
                    'Voce ja chamou varias ferramentas. Agora responda ao usuario com os dados obtidos, sem chamar mais ferramentas.',
            },
        ],
        temperature,
        max_tokens: maxTokens,
    });
    tokensIn += finalResp.usage?.prompt_tokens || 0;
    tokensOut += finalResp.usage?.completion_tokens || 0;

    return {
        resposta:
            finalResp.choices?.[0]?.message?.content?.trim() ||
            'Nao consegui concluir a resposta.',
        toolsUsadas,
        tokensIn,
        tokensOut,
        rounds,
    };
}
