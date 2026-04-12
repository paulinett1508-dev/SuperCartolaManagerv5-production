/**
 * CHATBOT CONTROLLER — Big Cartola IA v2.0
 *
 * Endpoints:
 *   POST /api/chatbot/ask    — pergunta + historico; usa sessionContext + tools.
 *   GET  /api/chatbot/status — retorna disponibilidade do servico.
 */

import mongoose from 'mongoose';
import chatbotService from '../services/ia/chatbotService.js';
import { extrairSessionContext, resumoCtx } from '../services/ia/sessionContext.js';

const LOG_PREFIX = '[CHATBOT-CTRL]';

/**
 * POST /api/chatbot/ask
 */
export async function perguntarChatbot(req, res) {
    const inicio = Date.now();
    try {
        const ctx = extrairSessionContext(req);
        if (!ctx) {
            return res.status(401).json({
                success: false,
                error: 'Sessao invalida',
                needsLogin: true,
            });
        }

        const { pergunta, historico } = req.body || {};
        if (!pergunta || typeof pergunta !== 'string') {
            return res
                .status(400)
                .json({ success: false, error: 'Pergunta e obrigatoria' });
        }

        const perguntaLimpa = pergunta
            .trim()
            .replace(/<[^>]*>/g, '')
            .substring(0, 500);

        if (perguntaLimpa.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Pergunta muito curta (minimo 3 caracteres)',
            });
        }

        // Sanitizar historico (ate 10 msgs, campos tipo e texto, cap 500 chars)
        const historicoValidado = Array.isArray(historico)
            ? historico
                  .slice(-10)
                  .filter(
                      m =>
                          m &&
                          typeof m.tipo === 'string' &&
                          typeof m.texto === 'string'
                  )
                  .map(m => ({
                      tipo: m.tipo,
                      texto: m.texto.substring(0, 500),
                  }))
            : [];

        const db = mongoose.connection.db;

        const resultado = await chatbotService.perguntar({
            pergunta: perguntaLimpa,
            historico: historicoValidado,
            ctx,
            db,
        });

        const duracaoMs = Date.now() - inicio;
        console.log(
            `${LOG_PREFIX} ${resumoCtx(ctx)} | modo=${resultado.modo} cached=${resultado.cached} | ${duracaoMs}ms`
        );

        return res.json({
            success: true,
            data: {
                resposta: resultado.resposta,
                toolsUsadas: (resultado.toolsUsadas || []).map(t => ({
                    name: t.name,
                    ok: t.ok,
                })),
                cached: resultado.cached,
                modo: resultado.modo,
            },
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Erro interno ao processar pergunta',
        });
    }
}

/**
 * GET /api/chatbot/status
 */
export async function statusChatbot(req, res) {
    try {
        return res.json({ success: true, data: chatbotService.getStatus() });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro status: ${error.message}`);
        return res
            .status(500)
            .json({ success: false, error: 'Erro ao verificar status' });
    }
}
