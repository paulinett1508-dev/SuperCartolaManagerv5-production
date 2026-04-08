/**
 * CHATBOT CONTROLLER — Big Cartola IA
 * Endpoints para o chatbot RAG do app participante.
 */

import ragChatbotService from '../services/ragChatbotService.js';
import mongoose from 'mongoose';

const LOG_PREFIX = '[CHATBOT-CTRL]';

/**
 * POST /api/chatbot/ask
 * Recebe pergunta do participante e retorna resposta RAG.
 */
export async function perguntarChatbot(req, res) {
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

        // Chamar pipeline RAG
        const resultado = await ragChatbotService.perguntarBot(perguntaLimpa, ligaId, db);

        return res.json({
            success: true,
            data: {
                resposta: resultado.resposta,
                fontes: resultado.fontes,
                cached: resultado.cached,
            },
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro: ${error.message}`);
        return res.status(500).json({ success: false, error: 'Erro interno ao processar pergunta' });
    }
}

/**
 * GET /api/chatbot/status
 * Retorna status do chatbot (disponivel, indexado, etc.)
 */
export async function statusChatbot(req, res) {
    try {
        const status = await ragChatbotService.getStatus();
        return res.json({ success: true, data: status });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro status: ${error.message}`);
        return res.status(500).json({ success: false, error: 'Erro ao verificar status' });
    }
}
