import express from "express";
import {
    consolidarRodada,
    verificarStatusConsolidacao,
} from "../controllers/consolidacaoController.js";
import { verificarAdmin } from "../middleware/auth.js";

const router = express.Router();

// Consolida uma rodada específica
router.post("/ligas/:ligaId/rodadas/:rodada/consolidar", verificarAdmin, consolidarRodada);

// Verificar status de consolidação da liga
// 🔒 SEC-FIX: Apenas admin
router.get("/ligas/:ligaId/status", verificarAdmin, verificarStatusConsolidacao);

export default router;
