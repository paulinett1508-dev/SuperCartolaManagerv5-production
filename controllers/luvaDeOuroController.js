// controllers/luvaDeOuroController.js v3.1.0 - SaaS DINÂMICO
// v3.1.0: ranking-live com MatchdayService (paridade com Capitão)
// v3.0.0: ranking-live, consolidar, temporada, desempate
// v2.0.0: Configurações dinâmicas via liga.configuracoes (White Label)
import {
  coletarDadosGoleiros,
  obterRankingGoleiros,
  detectarUltimaRodadaConcluida,
  consolidarRodada,
} from "../services/goleirosService.js";
import Liga from "../models/Liga.js";
import Goleiros from "../models/Goleiros.js";
import cartolaApiService from '../services/cartolaApiService.js';
import { truncarPontosNum } from '../utils/type-helpers.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import logger from '../utils/logger.js';

// =====================================================================
// ✅ v2.0: VALIDAÇÃO DINÂMICA DE LIGA (SaaS)
// =====================================================================

/**
 * Verifica se a liga suporta o módulo Luva de Ouro
 * @param {string} ligaId - ID da liga
 * @returns {Promise<{valid: boolean, liga: Object|null, error: string|null}>}
 */
async function validarLigaLuvaOuro(ligaId) {
  try {
    const liga = await Liga.findById(ligaId).lean();

    if (!liga) {
      return { valid: false, liga: null, error: "Liga não encontrada" };
    }

    // ✅ v2.0: Verificar se o módulo está habilitado nas configurações
    const luvaOuroConfig = liga.configuracoes?.luva_ouro;
    const moduloAtivo = liga.modulos_ativos?.luvaOuro;

    if (!luvaOuroConfig?.habilitado && !moduloAtivo) {
      return {
        valid: false,
        liga,
        error: `Liga "${liga.nome}" não tem o módulo Luva de Ouro habilitado`
      };
    }

    return { valid: true, liga, error: null };
  } catch (error) {
    return { valid: false, liga: null, error: error.message };
  }
}

class LuvaDeOuroController {
  // GET /api/luva-de-ouro/:ligaId/ranking
  static async obterRanking(req, res) {
    try {
      const { ligaId } = req.params;
      const { inicio = 1, fim = null, forcar_coleta = false } = req.query;

      logger.log(`🥅 [LUVA-OURO] Solicitação de ranking - Liga: ${ligaId}`);
      logger.log(
        `📊 Parâmetros: início=${inicio}, fim=${fim}, forcar_coleta=${forcar_coleta}`,
      );

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
          ligaId,
        });
      }

      const rodadaInicio = parseInt(inicio);
      const rodadaFim = fim ? parseInt(fim) : null;

      // Validar parâmetros
      if (rodadaInicio < 1 || rodadaInicio > 38) {
        return res.status(400).json({
          success: false,
          error: "Rodada de início deve estar entre 1 e 38",
          inicio: rodadaInicio,
        });
      }

      if (rodadaFim && (rodadaFim < rodadaInicio || rodadaFim > 38)) {
        return res.status(400).json({
          success: false,
          error: "Rodada de fim inválida",
          fim: rodadaFim,
          inicio: rodadaInicio,
        });
      }

      // Se forçar coleta, coletar dados primeiro
      if (forcar_coleta === "true") {
        logger.log("🔄 Forçando coleta de dados...");
        try {
          const fimColeta =
            rodadaFim ||
            (await detectarUltimaRodadaConcluida().then((r) => r.recomendacao));
          await coletarDadosGoleiros(ligaId, rodadaInicio, fimColeta);
        } catch (coletaError) {
          logger.error("❌ Erro na coleta forçada:", coletaError);
          // Continua mesmo com erro na coleta
        }
      }

      // Obter ranking
      const resultado = await obterRankingGoleiros(
        ligaId,
        rodadaInicio,
        rodadaFim,
      );

      logger.log(
        `✅ Ranking gerado: ${resultado.ranking.length} participantes`,
      );

      res.json({
        success: true,
        data: resultado,
        timestamp: new Date().toISOString(),
        parametros: {
          inicio: rodadaInicio,
          fim: rodadaFim,
          forcar_coleta: forcar_coleta === "true",
        },
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro ao obter ranking:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/detectar-rodada
  static async detectarRodada(req, res) {
    try {
      const { ligaId } = req.params;

      logger.log(`🥅 [LUVA-OURO] Detectando rodada - Liga: ${ligaId}`);

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      const deteccao = await detectarUltimaRodadaConcluida();

      logger.log(`✅ Rodada detectada:`, deteccao);

      res.json({
        success: true,
        data: deteccao,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro ao detectar rodada:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/coletar
  static async coletarDados(req, res) {
    try {
      const { ligaId } = req.params;
      const { rodada, inicio, fim, forcar = false } = req.query;

      logger.log(`🥅 [LUVA-OURO] Solicitação de coleta - Liga: ${ligaId}`);

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      let resultado;

      if (rodada) {
        // Coletar rodada específica
        const numeroRodada = parseInt(rodada);
        if (numeroRodada < 1 || numeroRodada > 38) {
          return res.status(400).json({
            success: false,
            error: "Rodada deve estar entre 1 e 38",
          });
        }

        resultado = await coletarDadosGoleiros(
          ligaId,
          numeroRodada,
          numeroRodada,
        );
      } else if (inicio && fim) {
        // Coletar múltiplas rodadas
        const rodadaInicio = parseInt(inicio);
        const rodadaFim = parseInt(fim);

        if (rodadaInicio < 1 || rodadaFim > 38 || rodadaInicio > rodadaFim) {
          return res.status(400).json({
            success: false,
            error: "Parâmetros de rodada inválidos",
          });
        }

        resultado = await coletarDadosGoleiros(ligaId, rodadaInicio, rodadaFim);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Especifique "rodada" ou "inicio" e "fim"',
        });
      }

      logger.log(`✅ Coleta concluída:`, resultado);

      res.json({
        success: true,
        data: resultado,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro na coleta:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/diagnostico
  static async diagnostico(req, res) {
    try {
      const { ligaId } = req.params;

      logger.log(`🔍 [LUVA-OURO] Executando diagnóstico - Liga: ${ligaId}`);

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      const Goleiros = (await import("../models/Goleiros.js")).default;

      // Buscar dados no MongoDB
      const filtroBase = { ligaId, temporada: CURRENT_SEASON };
      const totalRegistros = await Goleiros.countDocuments(filtroBase);
      const registrosComGoleiro = await Goleiros.countDocuments({
        ...filtroBase,
        goleiroNome: { $nin: [null, "Sem goleiro"] }, // ✅ v3.1: Fix $ne duplicado → $nin
      });
      const registrosComPontos = await Goleiros.countDocuments({
        ...filtroBase,
        pontos: { $gt: 0 },
      });

      const rodadasDisponiveis = await Goleiros.distinct("rodada", filtroBase);
      const participantes = await Goleiros.distinct("participanteId", filtroBase);

      // Buscar alguns exemplos
      const exemplos = await Goleiros.find(filtroBase)
        .limit(5)
        .sort({ rodada: -1 })
        .select("participanteNome rodada goleiroNome pontos dataColeta")
        .lean();

      const diagnostico = {
        ligaId,
        mongodb: {
          totalRegistros,
          registrosComGoleiro,
          registrosComPontos,
          rodadasDisponiveis: rodadasDisponiveis.sort(),
          totalParticipantes: participantes.length,
          participantes,
          exemplos: exemplos.map((e) => ({
            participante: e.participanteNome,
            rodada: e.rodada,
            goleiro: e.goleiroNome || "N/D",
            pontos: e.pontos || 0,
            dataColeta: e.dataColeta,
          })),
        },
        api: {
          status: "Testando...",
          ultimaRodada: null,
          erro: null,
        },
        recomendacoes: [],
      };

      // Testar API
      try {
        const deteccao = await (
          await import("../services/goleirosService.js")
        ).detectarUltimaRodadaConcluida();
        diagnostico.api.status = "OK";
        diagnostico.api.ultimaRodada = deteccao.recomendacao;
      } catch (apiError) {
        diagnostico.api.status = "ERRO";
        diagnostico.api.erro = apiError.message;
      }

      // Gerar recomendações
      if (totalRegistros === 0) {
        diagnostico.recomendacoes.push("Executar coleta inicial de dados");
      }
      if (registrosComPontos < totalRegistros * 0.1) {
        diagnostico.recomendacoes.push(
          "Verificar estrutura da API - poucos registros com pontuação",
        );
      }
      if (rodadasDisponiveis.length < 5) {
        diagnostico.recomendacoes.push(
          "Coletar mais rodadas para análise completa",
        );
      }

      res.json({
        success: true,
        data: diagnostico,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro no diagnóstico:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/estatisticas
  static async obterEstatisticas(req, res) {
    try {
      const { ligaId } = req.params;

      logger.log(`🥅 [LUVA-OURO] Obtendo estatísticas - Liga: ${ligaId}`);

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      // For now, return basic statistics
      const estatisticas = {
        message: "Estatísticas não implementadas ainda",
        ligaId,
        timestamp: new Date().toISOString(),
      };

      logger.log(`✅ Estatísticas obtidas:`, estatisticas);

      res.json({
        success: true,
        data: estatisticas,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro ao obter estatísticas:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/participantes
  static async listarParticipantes(req, res) {
    try {
      const { ligaId } = req.params;

      logger.log(`🥅 [LUVA-OURO] Listando participantes - Liga: ${ligaId}`);

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      // ✅ v2.0: Buscar participantes da liga no banco (não mais hardcoded)
      const liga = validacao.liga;
      const participantes = (liga.participantes || [])
        .filter(p => p.ativo !== false) // Apenas ativos
        .map(p => ({
          timeId: p.time_id,
          nome: p.nome_cartola,
          clubeId: p.clube_id,
        }));

      res.json({
        success: true,
        data: {
          ligaId,
          ligaNome: liga.nome,
          totalParticipantes: participantes.length,
          participantes,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro ao listar participantes:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/ranking-live
  // v3.1.0: Lógica live real com MatchdayService (paridade com Capitão)
  static async getRankingLive(req, res) {
    try {
      const { ligaId } = req.params;

      logger.log(`🔥 [LUVA-OURO] Ranking LIVE (parciais) - Liga: ${ligaId}`);

      // Validar liga
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
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

      // 3. Buscar ranking consolidado (rodadas anteriores) do MongoDB
      const rankingConsolidado = await obterRankingGoleiros(ligaId, 1, rodadaAtual - 1);

      if (!rankingConsolidado || !rankingConsolidado.ranking || rankingConsolidado.ranking.length === 0) {
        return res.json({ success: false, disponivel: false, motivo: 'sem_cache_consolidado' });
      }

      // 4. Para cada participante, buscar pontos do GOLEIRO na rodada atual
      const rankingLive = await Promise.all(
        rankingConsolidado.ranking.map(async (cached) => {
          const goleiroVivo = await LuvaDeOuroController._buscarGoleiroRodadaLive(
            cached.participanteId, rodadaAtual, pontuadosMap
          );

          const pontosHistorico = cached.pontosTotais || 0;
          const pontosRodadaAtual = goleiroVivo.pontuacao || 0;

          return {
            participanteId: cached.participanteId,
            participanteNome: cached.participanteNome,
            nomeTime: cached.nomeTime || '',
            clubeId: cached.clubeId,
            pontosTotais: truncarPontosNum(pontosHistorico + pontosRodadaAtual),
            pontuacao_historica: truncarPontosNum(pontosHistorico),
            pontos_goleiro_rodada: truncarPontosNum(pontosRodadaAtual),
            goleiro_nome: goleiroVivo.goleiro_nome,
            goleiro_clube: goleiroVivo.goleiro_clube,
            goleiro_jogou: goleiroVivo.jogou,
            rodadasJogadas: (cached.rodadasJogadas || 0) + (goleiroVivo.jogou !== false ? 1 : 0),
            rodadas: [
              ...(cached.rodadas || []),
              {
                rodada: rodadaAtual,
                pontos: truncarPontosNum(pontosRodadaAtual),
                goleiroNome: goleiroVivo.goleiro_nome || 'N/D',
                goleiroClube: goleiroVivo.goleiro_clube || '',
                parcial: true,
                jogou: goleiroVivo.jogou,
              }
            ],
            ativo: cached.ativo,
            ultimaRodada: {
              rodada: rodadaAtual,
              goleiroNome: goleiroVivo.goleiro_nome || 'N/D',
              goleiroClube: goleiroVivo.goleiro_clube || '',
              pontos: truncarPontosNum(pontosRodadaAtual),
              parcial: true,
            },
          };
        })
      );

      // 5. Ordenar por pontuação total (histórico + rodada atual)
      rankingLive.sort((a, b) => b.pontosTotais - a.pontosTotais);

      res.json({
        success: true,
        disponivel: true,
        data: {
          ranking: rankingLive,
          rodadaInicio: 1,
          rodadaFim: rodadaAtual,
          rodadaParcial: rodadaAtual,
          mercadoFechado: true,
          totalParticipantes: rankingLive.length,
        },
        live: true,
        rodada: rodadaAtual,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro no ranking live:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Busca pontuação LIVE do goleiro de um participante na rodada atual.
   * Equivalente ao buscarCapitaoRodada do Capitão.
   * @param {number} timeId - ID do time/participante
   * @param {number} rodada - Rodada atual
   * @param {Object} pontuadosMap - Mapa de atletas pontuados (buscado uma vez)
   * @returns {Object} { pontuacao, goleiro_nome, goleiro_clube, jogou }
   */
  static async _buscarGoleiroRodadaLive(timeId, rodada, pontuadosMap) {
    try {
      // Buscar escalação do time na rodada atual
      const resp = await cartolaApiService.httpClient.get(
        `${cartolaApiService.baseUrl}/time/id/${timeId}/${rodada}`
      );
      const dados = resp.data;

      if (!dados || !dados.atletas) {
        return { pontuacao: 0, goleiro_nome: null, goleiro_clube: null, jogou: false };
      }

      // Encontrar goleiro (posicao_id === 1)
      const atletas = Array.isArray(dados.atletas) ? dados.atletas : Object.values(dados.atletas);
      const goleiro = atletas.find(a => a.posicao_id === 1);

      if (!goleiro) {
        return { pontuacao: 0, goleiro_nome: 'Sem goleiro', goleiro_clube: null, jogou: false };
      }

      const atletaId = String(goleiro.atleta_id);
      const pontuado = pontuadosMap[atletaId];

      // Se está nos pontuados, pegamos a pontuação live
      if (pontuado) {
        return {
          pontuacao: parseFloat(pontuado.pontuacao) || 0,
          goleiro_nome: goleiro.apelido || goleiro.nome || 'Goleiro',
          goleiro_clube: goleiro.clube?.nome || null,
          jogou: true,
        };
      }

      // Goleiro escalado mas ainda não jogou (jogo não começou)
      return {
        pontuacao: 0,
        goleiro_nome: goleiro.apelido || goleiro.nome || 'Goleiro',
        goleiro_clube: goleiro.clube?.nome || null,
        jogou: false,
      };
    } catch (error) {
      logger.warn(`⚠️ [LUVA-OURO] Erro ao buscar goleiro live do time ${timeId}:`, error.message);
      return { pontuacao: 0, goleiro_nome: null, goleiro_clube: null, jogou: false };
    }
  }

  // POST /api/luva-de-ouro/:ligaId/consolidar (admin only)
  static async consolidarTemporada(req, res) {
    try {
      const { ligaId } = req.params;
      const { rodada } = req.body || req.query;

      logger.log(`🔒 [LUVA-OURO] Consolidar rodada ${rodada} - Liga: ${ligaId}`);

      // Validar liga
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      if (!rodada) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro "rodada" é obrigatório',
        });
      }

      const resultado = await consolidarRodada(ligaId, rodada);

      res.json({
        success: true,
        data: resultado,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ [LUVA-OURO] Erro ao consolidar:", error);
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // GET /api/luva-de-ouro/:ligaId/participante/:participanteId/detalhes
  static async obterDetalhesParticipante(req, res) {
    try {
      const { ligaId, participanteId } = req.params;
      const { inicio = 1, fim } = req.query;

      logger.log(
        `🥅 [LUVA-OURO] Detalhes do participante ${participanteId} - Liga: ${ligaId}`,
      );
      logger.log(`📊 Parâmetros: início=${inicio}, fim=${fim}`);

      // ✅ v2.0: Validar liga dinamicamente
      const validacao = await validarLigaLuvaOuro(ligaId);
      if (!validacao.valid) {
        return res.status(400).json({
          success: false,
          error: validacao.error,
        });
      }

      const rodadaInicio = parseInt(inicio);
      // ✅ CORREÇÃO: Detectar rodada fim se não fornecida
      let rodadaFim = fim ? parseInt(fim) : null;

      // Se fim não foi especificado, detectar automaticamente
      if (!rodadaFim || isNaN(rodadaFim)) {
        try {
          const { detectarUltimaRodadaConcluida } = await import(
            "../services/goleirosService.js"
          );
          const deteccao = await detectarUltimaRodadaConcluida();
          rodadaFim = deteccao.recomendacao || 26;
          logger.log(`📅 Rodada fim detectada automaticamente: ${rodadaFim}`);
        } catch (error) {
          rodadaFim = 26; // fallback
        }
      }

      const timeId = parseInt(participanteId);

      // Validar parâmetros
      if (
        rodadaInicio < 1 ||
        rodadaInicio > 38 ||
        rodadaFim < 1 ||
        rodadaFim > 38 ||
        rodadaInicio > rodadaFim
      ) {
        return res.status(400).json({
          success: false,
          error: "Parâmetros de rodada inválidos",
        });
      }

      if (isNaN(timeId)) {
        return res.status(400).json({
          success: false,
          error: "ID do participante inválido",
        });
      }

      const Goleiros = (await import("../models/Goleiros.js")).default;

      // Buscar dados do participante
      const dadosParticipante = await Goleiros.find({
        ligaId,
        temporada: CURRENT_SEASON, // ✅ v3.1: Filtro temporada obrigatório
        participanteId: timeId,
        rodada: { $gte: rodadaInicio, $lte: rodadaFim },
      })
        .sort({ rodada: 1 })
        .lean();

      if (dadosParticipante.length === 0) {
        return res.json({
          success: true,
          data: {
            participanteId: timeId,
            ligaId,
            rodadaInicio,
            rodadaFim,
            totalPontos: 0,
            totalRodadas: 0,
            rodadas: [],
            estatisticas: {
              melhorRodada: 0,
              piorRodada: 0,
              mediaPontos: 0,
              rodadasComGoleiro: 0,
            },
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Processar dados
      const rodadas = dadosParticipante.map((item) => ({
        rodada: item.rodada,
        goleiroNome: item.goleiroNome,
        goleiroClube: item.goleiroClube,
        pontos: item.pontos || 0,
        status: item.status,
        dataColeta: item.dataColeta,
      }));

      const totalPontos = rodadas.reduce((acc, r) => acc + r.pontos, 0);
      const rodadasComGoleiro = rodadas.filter(
        (r) => r.goleiroNome && r.goleiroNome !== "Sem goleiro",
      ).length;
      // ✅ v3.1: Fix C2 — Incluir pontos negativos no cálculo (goleiros frequentemente têm pontos < 0)
      const pontosComGoleiro = rodadas
        .filter((r) => r.goleiroNome && r.goleiroNome !== "Sem goleiro")
        .map((r) => r.pontos);

      const estatisticas = {
        melhorRodada: pontosComGoleiro.length > 0 ? Math.max(...pontosComGoleiro) : 0,
        piorRodada: pontosComGoleiro.length > 0 ? Math.min(...pontosComGoleiro) : 0,
        mediaPontos: rodadas.length > 0 ? totalPontos / rodadas.length : 0,
        rodadasComGoleiro,
      };

      const resultado = {
        participanteId: timeId,
        participanteNome: dadosParticipante[0].participanteNome,
        ligaId,
        rodadaInicio,
        rodadaFim,
        totalPontos,
        totalRodadas: rodadas.length,
        rodadas,
        estatisticas,
      };

      logger.log(
        `✅ Detalhes obtidos: ${rodadas.length} rodadas, ${(Math.trunc(totalPontos * 10) / 10).toFixed(1)} pontos totais`,
      );

      res.json({
        success: true,
        data: resultado,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        "❌ [LUVA-OURO] Erro ao obter detalhes do participante:",
        error,
      );
      res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export default LuvaDeOuroController;
