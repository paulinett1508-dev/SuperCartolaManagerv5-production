/**
 * CHATBOT CONTROLLER — Big Cartola IA v2.0
 * Endpoints para o chatbot do app participante.
 * Suporta modo basico (sem LLM) e modo completo (com LLM/RAG).
 */

import ragChatbotService from '../services/ragChatbotService.js';
import mongoose from 'mongoose';

const LOG_PREFIX = '[CHATBOT-CTRL]';

/**
 * POST /api/chatbot/ask
 * Recebe pergunta do participante e retorna resposta.
 */
export async function perguntarChatbot(req, res) {
    const inicio = Date.now();
    try {
        // Validar sessao
        if (!req.session?.participante) {
            return res.status(401).json({ success: false, error: 'Sessao invalida', needsLogin: true });
        }

        const { pergunta } = req.body;
        const ligaId = req.session.participante.ligaId;

        // Validar input
        if (!pergunta || typeof pergunta !== 'string') {
            return res.status(400).json({ success: false, error: 'Pergunta e obrigatoria' });
        }

        const perguntaLimpa = pergunta.trim().replace(/<[^>]*>/g, '').substring(0, 500);
        if (perguntaLimpa.length < 3) {
            return res.status(400).json({ success: false, error: 'Pergunta muito curta (minimo 3 caracteres)' });
        }

        if (!ligaId) {
            return res.status(400).json({ success: false, error: 'Liga nao identificada na sessao' });
        }

        // Obter referencia ao database nativo
        const db = mongoose.connection.db;

        // Chamar pipeline
        const resultado = await ragChatbotService.perguntarBot(perguntaLimpa, ligaId, db);

        const duracao = Date.now() - inicio;
        console.log(`${LOG_PREFIX} Resposta em ${duracao}ms | modo=${resultado.modo || '?'} | cached=${resultado.cached} | liga=${ligaId}`);

        return res.json({
            success: true,
            data: {
                resposta: resultado.resposta,
                fontes: resultado.fontes,
                cached: resultado.cached,
                modo: resultado.modo,
            },
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro: ${error.message}`);
        return res.status(500).json({ success: false, error: 'Erro interno ao processar pergunta' });
    }
}

/**
 * GET /api/chatbot/status
 * Retorna status do chatbot (disponivel, modo, indexacao, etc.)
 */
export async function statusChatbot(req, res) {
    try {
        const db = mongoose.connection.db;
        const status = await ragChatbotService.getStatus(db);
        return res.json({ success: true, data: status });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro status: ${error.message}`);
        return res.status(500).json({ success: false, error: 'Erro ao verificar status' });
    }
}
