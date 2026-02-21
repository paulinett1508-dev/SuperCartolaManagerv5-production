// capitaoController.js v1.2.0 - Controller do módulo Capitão de Luxo
// v1.2.0: FIX - Substituído new Date().getFullYear() por CURRENT_SEASON (config/seasons.js)
// v1.1.0: Fix ranking-live para retornar pontos do CAPITÃO (não pontos totais do time)
import capitaoService from '../services/capitaoService.js';
import { buscarCapitaoRodada } from '../services/capitaoService.js';
import CapitaoCaches from '../models/CapitaoCaches.js';
import cartolaApiService from '../services/cartolaApiService.js';
import { CURRENT_SEASON } from '../config/seasons.js';

/**
 * GET /api/capitao/:ligaId/ranking
 * Retorna ranking consolidado de capitães
 */
export async function getRankingCapitao(req, res) {
  try {
    const { ligaId } = req.params;
    const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

    if (!ligaId) {
      return res.status(400).json({ success: false, error: 'ligaId obrigatório' });
    }

    const ranking = await CapitaoCaches.buscarRanking(ligaId, temporada);

    res.json({
      success: true,
      ranking,
      temporada,
      total: ranking.length
    });
  } catch (error) {
    console.error('[CAPITAO-CONTROLLER] Erro getRankingCapitao:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/capitao/:ligaId/ranking-live
 * Retorna ranking de capitães em tempo real (parciais)
 * v1.1.0: Usa buscarCapitaoRodada para pontos REAIS do capitão (não pontos totais do time)
 */
export async function getRankingCapitaoLive(req, res) {
  try {
    const { ligaId } = req.params;
    const temporada = parseInt(req.query.temporada) || CURRENT_SEASON;

    if (!ligaId) {
      return res.status(400).json({ success: false, error: 'ligaId obrigatório' });
    }

    // 1. Verificar se mercado está fechado (rodada ativa)
    let rodadaAtual;
    try {
      const statusResp = await cartolaApiService.httpClient.get(
        `${cartolaApiService.baseUrl}/mercado/status`
      );
      const mercadoStatus = statusResp.data;
      if (mercadoStatus.status_mercado !== 2) {
        return res.json({ success: false, disponivel: false, motivo: 'mercado_aberto' });
      }
      rodadaAtual = mercadoStatus.rodada_atual;
    } catch (err) {
      return res.json({ success: false, disponivel: false, motivo: 'erro_mercado' });
    }

    // 2. Buscar pontuados (scores ao vivo) UMA vez
    let pontuadosMap;
    try {
      const pontuadosResp = await cartolaApiService.httpClient.get(
        `${cartolaApiService.baseUrl}/atletas/pontuados`
      );
      pontuadosMap = pontuadosResp.data?.atletas || {};
    } catch (err) {
      return res.json({ success: false, disponivel: false, motivo: 'sem_pontuados' });
    }

    if (Object.keys(pontuadosMap).length === 0) {
      return res.json({ success: false, disponivel: false, motivo: 'sem_pontuados' });
    }

    // 3. Buscar ranking consolidado (totais das rodadas anteriores)
    const cacheRanking = await CapitaoCaches.buscarRanking(ligaId, temporada);

    if (!cacheRanking || cacheRanking.length === 0) {
      return res.json({ success: false, disponivel: false, motivo: 'sem_cache_consolidado' });
    }

    // 4. Para cada participante, buscar pontos do CAPITÃO na rodada atual (em paralelo)
    const rankingLive = await Promise.all(
      cacheRanking.map(async (cached) => {
        const capitaoVivo = await buscarCapitaoRodada(cached.timeId, rodadaAtual, pontuadosMap);
        return {
          timeId: cached.timeId,
          nome_cartola: cached.nome_cartola,
          nome_time: cached.nome_time,
          escudo: cached.escudo,
          pontuacao_historica: cached.pontuacao_total,
          pontos_capitao_rodada: capitaoVivo.pontuacao,
          capitao_nome: capitaoVivo.capitao_nome,
          capitao_jogou: capitaoVivo.jogou,
          pontuacao_total: cached.pontuacao_total + capitaoVivo.pontuacao,
          media_capitao: cached.media_capitao,
        };
      })
    );

    // 5. Ordenar por pontuação total (histórico + rodada atual)
    rankingLive.sort((a, b) => b.pontuacao_total - a.pontuacao_total);

    res.json({
      success: true,
      disponivel: true,
      ranking: rankingLive,
      rodada: rodadaAtual,
      live: true,
      atualizado_em: new Date()
    });
  } catch (error) {
    console.error('[CAPITAO-CONTROLLER] Erro getRankingCapitaoLive:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/capitao/:ligaId/consolidar
 * Consolidar ranking de capitães (admin only - incremental ou fim temporada)
 * Body params:
 *   - temporada: number (optional, default: ano atual)
 *   - rodadaFinal: number (optional, default: 38)
 */
export async function consolidarCapitaoTemporada(req, res) {
  try {
    const { ligaId } = req.params;
    const temporada = parseInt(req.body.temporada) || CURRENT_SEASON;
    const rodadaFinal = parseInt(req.body.rodadaFinal) || 38;

    if (!ligaId) {
      return res.status(400).json({ success: false, error: 'ligaId obrigatório' });
    }

    const ranking = await capitaoService.consolidarRankingCapitao(ligaId, temporada, rodadaFinal);

    res.json({
      success: true,
      message: `Ranking consolidado com sucesso até rodada ${rodadaFinal}`,
      ranking,
      temporada,
      rodadaFinal
    });
  } catch (error) {
    console.error('[CAPITAO-CONTROLLER] Erro consolidarCapitaoTemporada:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

export default {
  getRankingCapitao,
  getRankingCapitaoLive,
  consolidarCapitaoTemporada
};
