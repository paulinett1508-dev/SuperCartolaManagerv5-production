/**
 * CHATBOT ROUTES — Big Cartola IA v2
 *
 * POST /api/chatbot/ask    — Perguntar ao bot
 * GET  /api/chatbot/status — Status do servico
 *
 * Rate limit por timeId:
 *   - 5 perguntas a cada 60s (janela fixa).
 *   - Se estourar a 6a, entra em COOLDOWN de 120s (bloqueia tudo).
 *   - Apos o cooldown, contador zera e o ciclo recomeca.
 */

import express from 'express';
import {
    perguntarChatbot,
    statusChatbot,
} from '../controllers/chatbotController.js';
import { verificarSessaoParticipante } from './participante-auth.js';

const router = express.Router();

const WINDOW_MS = 60_000; // 1 minuto
const MAX_REQUESTS = 5; // 5 perguntas por janela
const COOLDOWN_MS = 120_000; // 2 minutos de bloqueio ao estourar

const chatbotRateLimit = (() => {
    /**
     * Mapa por timeId (ou IP fallback) com estado do usuario:
     *   { count, janelaResetAt, cooldownUntil }
     */
    const estado = new Map();

    return (req, res, next) => {
        const key =
            req.session?.participante?.timeId ||
            req.session?.participante?.time_id ||
            req.ip;

        const agora = Date.now();
        const atual = estado.get(key) || {
            count: 0,
            janelaResetAt: agora + WINDOW_MS,
            cooldownUntil: null,
        };

        // 1) Em cooldown? bloqueia e devolve tempo restante.
        if (atual.cooldownUntil && agora < atual.cooldownUntil) {
            const segundosRestantes = Math.ceil(
                (atual.cooldownUntil - agora) / 1000
            );
            res.setHeader('Retry-After', String(segundosRestantes));
            return res.status(429).json({
                success: false,
                error: `Voce excedeu o limite de 5 perguntas por minuto. Aguarde ${segundosRestantes} segundos.`,
                cooldownSegundos: segundosRestantes,
            });
        }

        // 2) Cooldown acabou ou janela encerrou -> resetar contador.
        if (atual.cooldownUntil && agora >= atual.cooldownUntil) {
            atual.count = 0;
            atual.janelaResetAt = agora + WINDOW_MS;
            atual.cooldownUntil = null;
        } else if (agora >= atual.janelaResetAt) {
            atual.count = 0;
            atual.janelaResetAt = agora + WINDOW_MS;
        }

        atual.count++;
        estado.set(key, atual);

        // 3) Estourou? entra em cooldown de 120s.
        if (atual.count > MAX_REQUESTS) {
            atual.cooldownUntil = agora + COOLDOWN_MS;
            estado.set(key, atual);
            res.setHeader('Retry-After', String(COOLDOWN_MS / 1000));
            return res.status(429).json({
                success: false,
                error: `Voce fez 5 perguntas em menos de 1 minuto. Aguarde 120 segundos para voltar a perguntar.`,
                cooldownSegundos: COOLDOWN_MS / 1000,
            });
        }

        // 4) Limpeza periodica de entries antigas.
        if (estado.size > 200) {
            for (const [k, v] of estado) {
                const expirou =
                    (v.cooldownUntil && agora > v.cooldownUntil + WINDOW_MS) ||
                    (!v.cooldownUntil && agora > v.janelaResetAt + WINDOW_MS);
                if (expirou) estado.delete(k);
            }
        }

        next();
    };
})();

router.post(
    '/ask',
    verificarSessaoParticipante,
    chatbotRateLimit,
    perguntarChatbot
);
router.get('/status', statusChatbot);

export default router;
