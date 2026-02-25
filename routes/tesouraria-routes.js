/**
 * ROTAS DE TESOURARIA - Gestão Financeira Centralizada
 *
 * Thin router — toda a lógica de negócio vive em controllers/tesourariaController.js
 *
 * @version 3.3.0
 * ✅ v3.3.0: E1 FIX — Extraído 1603 linhas para tesourariaController.js (E1)
 * ✅ v3.2.0: E2 FIX — cartolaApiService substituiu fetch inline em inscricoesController
 * ✅ v3.1.0: FIX CRÍTICO - Filtro de temporada e performance
 * ✅ v3.0.0: C1/C2 FIX — acertoService unificou POST/DELETE duplicados
 */

import express from "express";
import { verificarAdmin } from "../middleware/auth.js";
import {
    getParticipantes,
    getLiga,
    getParticipante,
    postAcerto,
    deleteAcerto,
    getResumo,
} from "../controllers/tesourariaController.js";

const router = express.Router();

router.get("/participantes", verificarAdmin, getParticipantes);
router.get("/liga/:ligaId", verificarAdmin, getLiga);
router.get("/participante/:ligaId/:timeId", verificarAdmin, getParticipante);
router.post("/acerto", verificarAdmin, postAcerto);
router.delete("/acerto/:id", verificarAdmin, deleteAcerto);
router.get("/resumo", verificarAdmin, getResumo);

console.log("[TESOURARIA] ✅ v3.3 Rotas carregadas (E1: business logic extraído para tesourariaController.js)");

export default router;
