// routes/luva-de-ouro-routes.js v2.1
// v2.1: verificarAdmin na rota diagnostico (expunha internals sem auth)
// v2.0: verificarAdmin em rotas admin, endpoints ranking-live e consolidar
import express from "express";
import LuvaDeOuroController from "../controllers/luvaDeOuroController.js";
import { verificarAdmin } from "../middleware/auth.js";

const router = express.Router();

// Rota principal: obter ranking de goleiros
router.get("/:ligaId/ranking", LuvaDeOuroController.obterRanking);

// Rota para ranking ao vivo (parciais)
router.get("/:ligaId/ranking-live", LuvaDeOuroController.getRankingLive);

// Rota para coletar dados específicos (admin only)
router.get("/:ligaId/coletar", verificarAdmin, LuvaDeOuroController.coletarDados);

// Rota para consolidar rodada (admin only)
router.post("/:ligaId/consolidar", verificarAdmin, LuvaDeOuroController.consolidarTemporada);

// Rota para detectar última rodada concluída
router.get("/:ligaId/detectar-rodada", LuvaDeOuroController.detectarRodada);

// Rota para obter estatísticas gerais
router.get("/:ligaId/estatisticas", LuvaDeOuroController.obterEstatisticas);

// Rota para listar participantes válidos
router.get("/:ligaId/participantes", LuvaDeOuroController.listarParticipantes);

// GET /api/luva-de-ouro/:ligaId/diagnostico - Diagnóstico do sistema (admin only)
router.get("/:ligaId/diagnostico", verificarAdmin, LuvaDeOuroController.diagnostico);

// GET /api/luva-de-ouro/:ligaId/participante/:participanteId/detalhes
router.get("/:ligaId/participante/:participanteId/detalhes", LuvaDeOuroController.obterDetalhesParticipante);

export default router;
