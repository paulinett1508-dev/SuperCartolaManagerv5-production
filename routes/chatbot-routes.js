/**
 * CHATBOT ROUTES — Big Cartola IA
 * POST /api/chatbot/ask    — Perguntar ao bot
 * GET  /api/chatbot/status — Status do servico
 */

import express from 'express';
import { perguntarChatbot, statusChatbot } from '../controllers/chatbotController.js';
import { verificarSessaoParticipante } from './participante-auth.js';

const router = express.Router();

// Rate limit especifico para chatbot: 10 req/min por session
const chatbotRateLimit = (() => {
    const requests = new Map();
    const WINDOW_MS = 60 * 1000; // 1 minuto
    const MAX_REQUESTS = 10;

    return (req, res, next) => {
        const key = req.session?.participante?.timeId || req.ip;
        const agora = Date.now();
        const registro = requests.get(key) || { count: 0, resetAt: agora + WINDOW_MS };

        if (agora > registro.resetAt) {
            registro.count = 0;
            registro.resetAt = agora + WINDOW_MS;
        }

        registro.count++;
        requests.set(key, registro);

        if (registro.count > MAX_REQUESTS) {
            return res.status(429).json({
                success: false,
                error: 'Muitas perguntas. Aguarde 1 minuto antes de perguntar novamente.',
            });
        }

        // Limpar entries antigas a cada 100 requests
        if (requests.size > 100) {
            for (const [k, v] of requests) {
                if (agora > v.resetAt) requests.delete(k);
            }
        }

        next();
    };
})();

router.post('/ask', verificarSessaoParticipante, chatbotRateLimit, perguntarChatbot);
router.get('/status', statusChatbot);

export default router;
