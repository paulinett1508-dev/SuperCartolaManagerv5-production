/**
 * Raio-X Analytics Controller
 * Endpoints para análises internas via MongoDB
 */

import {
  raioXFinanceiro,
  saudeLiga,
  performanceRanking,
  diagnosticoSistema,
  visaoGeral,
  ligasDisponiveis
} from '../services/analyticsService.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import logger from '../utils/logger.js';

function responder(res, tipo, dados, startTime) {
  res.json({
    success: true,
    tipo,
    dados,
    tempoMs: Date.now() - startTime
  });
}

function erroResponse(res, mensagem, error) {
  logger.error(`[RAIO-X] ${mensagem}:`, error);
  res.status(500).json({
    success: false,
    error: mensagem,
    detalhes: error.message
  });
}

export async function getRaioXFinanceiro(req, res) {
  const start = Date.now();
  try {
    const { ligaId, temporada } = req.query;
    if (!ligaId) return res.status(400).json({ success: false, error: 'ligaId é obrigatório' });
    const dados = await raioXFinanceiro(ligaId, Number(temporada) || CURRENT_SEASON);
    responder(res, 'raio-x-financeiro', dados, start);
  } catch (e) {
    erroResponse(res, 'Erro no Raio-X Financeiro', e);
  }
}

export async function getSaudeLiga(req, res) {
  const start = Date.now();
  try {
    const { ligaId, temporada } = req.query;
    if (!ligaId) return res.status(400).json({ success: false, error: 'ligaId é obrigatório' });
    const dados = await saudeLiga(ligaId, Number(temporada) || CURRENT_SEASON);
    responder(res, 'saude-liga', dados, start);
  } catch (e) {
    erroResponse(res, 'Erro na Saúde da Liga', e);
  }
}

export async function getPerformanceRanking(req, res) {
  const start = Date.now();
  try {
    const { ligaId, temporada } = req.query;
    if (!ligaId) return res.status(400).json({ success: false, error: 'ligaId é obrigatório' });
    const dados = await performanceRanking(ligaId, Number(temporada) || CURRENT_SEASON);
    responder(res, 'performance', dados, start);
  } catch (e) {
    erroResponse(res, 'Erro na Performance', e);
  }
}

export async function getDiagnosticoSistema(req, res) {
  const start = Date.now();
  try {
    const dados = await diagnosticoSistema();
    responder(res, 'diagnostico', dados, start);
  } catch (e) {
    erroResponse(res, 'Erro no Diagnóstico', e);
  }
}

export async function getVisaoGeral(req, res) {
  const start = Date.now();
  try {
    const { temporada } = req.query;
    const dados = await visaoGeral(Number(temporada) || CURRENT_SEASON);
    responder(res, 'visao-geral', dados, start);
  } catch (e) {
    erroResponse(res, 'Erro na Visão Geral', e);
  }
}

export async function getLigasDisponiveis(req, res) {
  try {
    const { temporada } = req.query;
    const ligas = await ligasDisponiveis(Number(temporada) || CURRENT_SEASON);
    res.json({ success: true, ligas });
  } catch (e) {
    erroResponse(res, 'Erro ao listar ligas', e);
  }
}
