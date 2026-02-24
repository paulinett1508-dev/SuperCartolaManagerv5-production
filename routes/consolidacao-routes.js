import express from "express";
import {
    consolidarRodada,
    consolidarTodasRodadasPassadas,
    buscarHistoricoCompleto,
    verificarStatusConsolidacao,
} from "../controllers/consolidacaoController.js";
import { verificarAdmin } from "../middleware/auth.js";

const router = express.Router();

// Consolida uma rodada específica
router.post("/ligas/:ligaId/rodadas/:rodada/consolidar", verificarAdmin, consolidarRodada);

// Consolida múltiplas rodadas (script de recuperação)
router.post(
    "/ligas/:ligaId/consolidar-historico",
    verificarAdmin,
    consolidarTodasRodadasPassadas,
);

// 📊 Busca histórico completo consolidado
// 🔒 SEC-FIX: Apenas admin
router.get("/ligas/:ligaId/historico-completo", verificarAdmin, buscarHistoricoCompleto);

// Verificar status de consolidação da liga
// 🔒 SEC-FIX: Apenas admin
router.get("/ligas/:ligaId/status", verificarAdmin, verificarStatusConsolidacao);

export default router;
