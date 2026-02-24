// routes/artilheiro-campeao-routes.js - VERSÃO 5.4
// Rotas do módulo Artilheiro Campeão com persistência MongoDB
// ✅ v5.2: Session validation, audit logging, premiação endpoint
// ✅ v5.3: verificarAdmin middleware nas rotas mutantes (fix auth bug)
// ✅ v5.4: Endpoint ranking-live para integração com MatchdayService

import express from "express";
import { verificarAdmin } from "../middleware/auth.js";
import ArtilheiroCampeaoController from "../controllers/artilheiroCampeaoController.js";

const router = express.Router();

console.log("[ROUTES] Carregando rotas do Artilheiro Campeao v5.4...");

// ========================================
// ROTAS PÚBLICAS (GET)
// ========================================

router.get("/:ligaId/ranking", async (req, res) => {
    await ArtilheiroCampeaoController.obterRanking(req, res);
});

router.get("/:ligaId/ranking-live", async (req, res) => {
    await ArtilheiroCampeaoController.getRankingLive(req, res);
});

router.get("/:ligaId/detectar-rodada", async (req, res) => {
    await ArtilheiroCampeaoController.detectarRodada(req, res);
});

router.get("/:ligaId/estatisticas", async (req, res) => {
    await ArtilheiroCampeaoController.obterEstatisticas(req, res);
});

router.get("/:ligaId/participantes", async (req, res) => {
    await ArtilheiroCampeaoController.listarParticipantes(req, res);
});

router.get("/:ligaId/time/:timeId", async (req, res) => {
    await ArtilheiroCampeaoController.getDetalheTime(req, res);
});

// ========================================
// ROTAS ADMIN (POST/DELETE - requerem autenticação admin)
// ========================================

router.post("/:ligaId/consolidar/:rodada", verificarAdmin, async (req, res) => {
    await ArtilheiroCampeaoController.consolidarRodada(req, res);
});

router.post("/:ligaId/coletar/:rodada", verificarAdmin, async (req, res) => {
    await ArtilheiroCampeaoController.coletarRodada(req, res);
});

router.post("/:ligaId/premiar", verificarAdmin, async (req, res) => {
    await ArtilheiroCampeaoController.consolidarPremiacao(req, res);
});

router.delete("/:ligaId/cache", verificarAdmin, async (req, res) => {
    await ArtilheiroCampeaoController.limparCache(req, res);
});

// ========================================
// ROTAS DE COMPATIBILIDADE (v1.x/v2.x)
// ========================================

router.get("/:ligaId/acumulado", async (req, res) => {
    await ArtilheiroCampeaoController.obterRanking(req, res);
});

console.log("[ROUTES] Rotas do Artilheiro Campeao v5.4 carregadas");

export default router;
