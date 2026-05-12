// routes/live-routes.js
// LIVE-001 — GET /api/live/:ligaId?include=parciais,ranking
// Endpoint agregador unificado de dados da rodada em andamento.

import express from "express";
import { getLiveSnapshot, getLiveStream } from "../controllers/liveController.js";

const router = express.Router();

function verificarSessao(req, res, next) {
  if (!req.session?.participante) {
    return res.status(401).json({ erro: "Não autenticado" });
  }
  next();
}

router.get("/:ligaId/stream", verificarSessao, getLiveStream);
router.get("/:ligaId", verificarSessao, getLiveSnapshot);

export default router;
