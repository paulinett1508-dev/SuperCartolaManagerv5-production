import express from "express";
import { verificarAdmin, verificarAdminOuDono } from "../middleware/auth.js";
import * as fluxoController from "../controllers/fluxoFinanceiroController.js";
import * as projecaoController from "../controllers/projecaoFinanceiraController.js";

const router = express.Router();

// === PROJEÇÃO FINANCEIRA EM TEMPO REAL (v1.0) ===
// Projeção efêmera durante rodada em andamento (status_mercado === 2)
// Retorna { projecao: false } quando mercado aberto (rodada finalizada)
// 🔒 SEC-FIX: Participante pode ver sua propria projecao, admin ve todas
router.get("/:ligaId/projecao/:timeId", verificarAdminOuDono, projecaoController.getProjecaoTime);

// Projeção de todos os participantes (admin/tesouraria)
// 🔒 SEC-FIX: Apenas admin pode ver projecao de toda a liga
router.get("/:ligaId/projecao", verificarAdmin, projecaoController.getProjecaoLiga);

// === ROTA PRINCIPAL (EXTRATO FINANCEIRO) ===
// 🔒 SEC-FIX: Participante pode ver seu proprio extrato, admin ve todos
router.get("/:ligaId/extrato/:timeId", verificarAdminOuDono, fluxoController.getExtratoFinanceiro);

// === ROTAS DE CAMPOS EDITÁVEIS (MANUAIS) ===

// 🔒 SEC-FIX: Participante pode ver seus campos, admin ve todos
router.get("/:ligaId/times/:timeId", verificarAdminOuDono, fluxoController.getCampos);

// Buscar campos de todos os times de uma liga
// 🔒 SEC-FIX: Apenas admin pode ver campos de toda a liga
router.get("/:ligaId", verificarAdmin, fluxoController.getCamposLiga);

// Salvar/atualizar todos os campos de um time
// 🔒 ADMIN ONLY - escrita requer autenticação
router.put("/:ligaId/times/:timeId", verificarAdmin, fluxoController.salvarCampos);

// Salvar campo individual (nome ou valor) - Rota mais usada pelo frontend novo
// 🔒 ADMIN ONLY - escrita requer autenticação
router.patch(
  "/:ligaId/times/:timeId/campo/:campoIndex",
  verificarAdmin,
  fluxoController.salvarCampo,
);

// Resetar campos para padrão
// 🔒 ADMIN ONLY - escrita requer autenticação
router.post("/:ligaId/times/:timeId/reset", verificarAdmin, fluxoController.resetarCampos);

// Deletar campos
// 🔒 ADMIN ONLY - escrita requer autenticação
router.delete("/:ligaId/times/:timeId", verificarAdmin, fluxoController.deletarCampos);

export default router;
