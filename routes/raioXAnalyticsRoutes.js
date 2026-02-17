/**
 * Raio-X Analytics Routes
 * Endpoints para análises internas de dados do sistema
 */

import express from 'express';
import { verificarAdmin } from '../middleware/auth.js';
import {
  getRaioXFinanceiro,
  getSaudeLiga,
  getPerformanceRanking,
  getDiagnosticoSistema,
  getVisaoGeral,
  getLigasDisponiveis
} from '../controllers/raioXAnalyticsController.js';

const router = express.Router();

// Helper: ligas para select
router.get('/ligas-disponiveis', verificarAdmin, getLigasDisponiveis);

// Análises por liga
router.get('/raio-x-financeiro', verificarAdmin, getRaioXFinanceiro);
router.get('/saude-liga', verificarAdmin, getSaudeLiga);
router.get('/performance', verificarAdmin, getPerformanceRanking);

// Análises globais
router.get('/diagnostico', verificarAdmin, getDiagnosticoSistema);
router.get('/visao-geral', verificarAdmin, getVisaoGeral);

export default router;
