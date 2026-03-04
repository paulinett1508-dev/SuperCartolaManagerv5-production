// =====================================================================
// extratoFinanceiroCacheRoutes.js v2.0 - REMOVIDO rotas de limpeza perigosas
// ✅ v2.0: REMOVIDO rotas limparCacheLiga, limparCacheTime, limparTodosCaches
//   - Causavam perda de dados IRRECUPERÁVEIS em temporadas históricas
//   - Mantido apenas limparCachesCorrompidos para manutenção técnica
// =====================================================================

import express from "express";
import { verificarAdmin, verificarAdminOuDono } from "../middleware/auth.js";
import {
    getExtratoCache,
    salvarExtratoCache,
    verificarCacheValido,
    lerCacheExtratoFinanceiro,
    limparCachesCorrompidos,
    estatisticasCache,
} from "../controllers/extratoFinanceiroCacheController.js";

const router = express.Router();

// =====================================================================
// ROTAS DE LEITURA E ESCRITA
// =====================================================================

// Obter cache de um time específico
// 🔒 SEC-FIX v1.1: Requer admin OU participante acessando seu próprio timeId
router.get("/:ligaId/times/:timeId/cache", verificarAdminOuDono, getExtratoCache);

// Salvar/atualizar cache de um time
// 🔒 SEC-FIX: Escrita de cache requer admin
router.post("/:ligaId/times/:timeId/cache", verificarAdmin, salvarExtratoCache);

// Verificar se cache é válido (validação inteligente)
// 🔒 SEC-FIX v1.1: Requer admin OU participante acessando seu próprio timeId
router.get("/:ligaId/times/:timeId/cache/valido", verificarAdminOuDono, verificarCacheValido);

// Ler cache com validação
// 🔒 SEC-FIX v1.1: Requer admin OU participante acessando seu próprio timeId
router.get("/:ligaId/times/:timeId", verificarAdminOuDono, lerCacheExtratoFinanceiro);

// =====================================================================
// ROTAS DE ESTATÍSTICAS
// =====================================================================

// Estatísticas gerais de cache
// 🔒 ADMIN ONLY - expõe dados financeiros agregados de todos os participantes
router.get("/stats", verificarAdmin, estatisticasCache);

// Estatísticas de uma liga específica
// 🔒 ADMIN ONLY - expõe dados financeiros agregados de uma liga
router.get("/:ligaId/stats", verificarAdmin, estatisticasCache);

// =====================================================================
// ROTAS DE MANUTENÇÃO (apenas para caches corrompidos)
// =====================================================================

// Limpar caches corrompidos (todas as ligas)
// DELETE /api/extrato-cache/corrompidos/limpar
// 🔒 ADMIN ONLY - operação destrutiva requer autenticação
router.delete("/corrompidos/limpar", verificarAdmin, limparCachesCorrompidos);

// Limpar caches corrompidos de uma liga específica
// DELETE /api/extrato-cache/:ligaId/corrompidos/limpar
// 🔒 ADMIN ONLY - operação destrutiva requer autenticação
router.delete("/:ligaId/corrompidos/limpar", verificarAdmin, limparCachesCorrompidos);

// =====================================================================
// ✅ v2.0: REMOVIDO - Rotas perigosas que causavam perda de dados
// As seguintes rotas foram REMOVIDAS por segurança:
// - DELETE /:ligaId/limpar (limparCacheLiga)
// - DELETE /:ligaId/times/:timeId/limpar (limparCacheTime)
// - DELETE /:ligaId/times/:timeId/cache (limparCacheTime)
// - DELETE /todos/limpar (limparTodosCaches)
// =====================================================================

export default router;
