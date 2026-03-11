// routes/matchday-routes.js - Rotas do Modo Matchday
import express from 'express';
import cartolaApiService from '../services/cartolaApiService.js';
import { buscarRankingParcial } from '../services/parciaisRankingService.js';
import brasileiraoService from '../services/brasileirao-tabela-service.js';

const router = express.Router();

/**
 * GET /api/matchday/status
 * Retorna status do mercado + informações do calendário para polling inteligente
 */
router.get('/status', async (req, res) => {
  try {
    const status = await cartolaApiService.obterStatusMercado();

    // Matchday ativo quando mercado fechado (status_mercado === 2) ou mercadoAberto === false
    const matchdayAtivo = status.status_mercado != null
      ? status.status_mercado === 2
      : status.mercadoAberto === false;

    // Buscar informações do calendário para polling inteligente
    let calendario = null;
    try {
      const temporada = new Date().getFullYear();
      const resumo = await brasileiraoService.obterResumoParaExibicao(temporada);
      if (resumo.success) {
        calendario = {
          proximo_jogo: resumo.proximo_jogo,
          tem_jogos_ao_vivo: resumo.tem_jogos_ao_vivo,
          rodada_atual_brasileirao: resumo.rodada_atual,
        };
      }
    } catch (err) {
      console.warn('[MATCHDAY] Calendário não disponível:', err.message);
    }

    res.json({
      success: true,
      matchday_ativo: matchdayAtivo,
      rodada_atual: status.rodadaAtual,
      mercado_aberto: status.mercadoAberto,
      status_mercado: status.status_mercado,
      calendario
    });
  } catch (error) {
    console.error('[MATCHDAY] Erro obterStatus:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/matchday/parciais/:ligaId
 * Retorna parciais da liga (reusa parciaisRankingService)
 */
router.get('/parciais/:ligaId', async (req, res) => {
  try {
    const { ligaId } = req.params;

    if (!ligaId) {
      return res.status(400).json({ success: false, error: 'ligaId obrigatório' });
    }

    const parciais = await buscarRankingParcial(ligaId);

    res.json(parciais);
  } catch (error) {
    console.error('[MATCHDAY] Erro parciais:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
