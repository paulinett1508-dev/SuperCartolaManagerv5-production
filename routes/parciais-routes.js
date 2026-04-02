// routes/parciais-routes.js
// GET /api/parciais/:ligaId  — endpoint unificado de parciais da rodada em andamento

import express from "express";
import mongoose from "mongoose";
import { getParciais } from "../controllers/parciaisController.js";

const router = express.Router();

// Middleware: valida sessão do participante
function verificarSessao(req, res, next) {
  if (!req.session?.usuario) {
    return res.status(401).json({ erro: "Não autenticado" });
  }
  next();
}

// GET /api/parciais/:ligaId
router.get("/:ligaId", verificarSessao, async (req, res) => {
  const { ligaId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(ligaId)) {
    return res.status(400).json({ erro: "ligaId inválido" });
  }

  return getParciais(req, res);
});

export default router;
