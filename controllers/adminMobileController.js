/**
 * Admin Mobile Controller
 * Lógica de negócio para rotas mobile
 */

import { generateToken, isAdminAutorizado } from '../middleware/adminMobileAuth.js';
import { getDB } from '../config/database.js';
import logger from '../utils/logger.js';
import marketGate from '../utils/marketGate.js';
import cartolaApiService from '../services/cartolaApiService.js';
import Liga from '../models/Liga.js';
import { CURRENT_SEASON } from '../config/seasons.js';

/**
 * POST /api/admin/mobile/auth
 * Gera JWT token após autenticação via Replit Auth
 */
async function authenticate(req, res) {
  try {
    // Verifica se usuário está autenticado via session (Replit Auth ou Email/Senha)
    if (!req.session || !req.session.admin) {
      return res.status(401).json({
        error: 'Não autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const { email, nome } = req.session.admin;

    // Verifica se é admin
    const db = req.app.locals.db || getDB();
    const isAdmin = await isAdminAutorizado(email, db);

    if (!isAdmin) {
      return res.status(403).json({
        error: 'Acesso negado. Você não é um administrador.',
        code: 'ACCESS_DENIED'
      });
    }

    // Gera JWT token
    const token = generateToken(email, nome);

    // Log de atividade
    try {
      await db.collection('adminactivitylogs').insertOne({
        email,
        action: 'login',
        details: { platform: 'mobile' },
        result: 'success',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        timestamp: new Date()
      });
    } catch (logError) {
      logger.error('[adminMobile] Erro ao registrar log:', logError);
      // Não bloqueia o login se log falhar
    }

    res.json({
      token,
      email,
      nome,
      expiresIn: '24h'
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no authenticate:', error);
    res.status(500).json({
      error: 'Erro ao autenticar',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * GET /api/admin/mobile/dashboard
 * Retorna dados do dashboard (ligas, health, últimas ações)
 */
async function getDashboard(req, res) {
  try {
    const db = req.app.locals.db || getDB();
    const adminEmail = req.admin.email;

    // Busca ligas ativas (campo real é "ativa", não "ativo")
    const ligas = await db.collection('ligas').find({
      ativa: true
    }).sort({ nome: 1 }).toArray();

    // Para cada liga, busca dados agregados
    const ligasComDados = await Promise.all(
      ligas.map(async (liga) => {
        try {
          // Participantes estão no array liga.participantes[], não na collection times
          const todosParticipantes = liga.participantes || [];
          const participantesTotais = todosParticipantes.length;
          const participantesAtivos = todosParticipantes.filter(p => p.ativo !== false).length;

          const ligaIdStr = liga._id.toString();

          // Busca última consolidação (via logs de atividade)
          const ultimaConsolidacao = await db.collection('adminactivitylogs')
            .find({
              action: 'consolidacao_manual',
              'details.ligaId': ligaIdStr,
              result: 'success'
            })
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();

          let ultimaConsolidacaoData = null;
          if (ultimaConsolidacao.length > 0) {
            ultimaConsolidacaoData = {
              rodada: ultimaConsolidacao[0].details?.rodada || 0,
              timestamp: ultimaConsolidacao[0].timestamp,
              status: 'success'
            };
          }

          // Calcula saldo total da liga (soma dos saldos dos participantes)
          const extratos = await db.collection('extratofinanceirocaches').find({
            liga_id: liga._id,
            temporada: liga.temporada || 2026
          }).toArray();

          let saldoTotal = 0;
          let inadimplentes = 0;

          extratos.forEach(extrato => {
            const saldo = extrato.saldo_final || 0;
            saldoTotal += saldo;
            if (saldo < 0) {
              inadimplentes++;
            }
          });

          // Busca módulos ativos
          const modulosAtivos = [];
          if (liga.modulos_ativos) {
            Object.entries(liga.modulos_ativos).forEach(([modulo, ativo]) => {
              if (ativo) {
                modulosAtivos.push(modulo);
              }
            });
          }

          return {
            id: liga._id.toString(),
            nome: liga.nome,
            temporada: liga.temporada || 2026,
            participantesAtivos,
            participantesTotais,
            rodadaAtual: liga.rodada_atual || 0,
            ultimaConsolidacao: ultimaConsolidacaoData,
            saldoTotal: parseFloat(saldoTotal.toFixed(2)),
            inadimplentes,
            modulosAtivos
          };
        } catch (ligaError) {
          logger.error(`[adminMobile] Erro ao processar liga ${liga.id}:`, ligaError);
          return null;
        }
      })
    );

    // Remove ligas com erro
    const ligasValidas = ligasComDados.filter(l => l !== null);

    // Busca últimas 10 ações do admin
    const ultimasAcoes = await db.collection('adminactivitylogs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    const acoesFormatadas = ultimasAcoes.map(acao => {
      const tipoMap = {
        'consolidacao_manual': 'consolidacao',
        'novo_acerto': 'acerto',
        'aprovar_quitacao': 'quitacao',
        'login': 'login'
      };

      return {
        tipo: tipoMap[acao.action] || 'outro',
        ligaNome: acao.details?.ligaNome || 'N/A',
        rodada: acao.details?.rodada,
        participante: acao.details?.participante,
        valor: acao.details?.valor,
        timestamp: acao.timestamp,
        status: acao.result
      };
    });

    // Health score (TODO: implementar lógica real de health check)
    // Por enquanto, retorna mock
    const healthScore = 95;
    const healthStatus = healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical';

    res.json({
      healthScore,
      healthStatus,
      ligas: ligasValidas,
      ultimasAcoes: acoesFormatadas
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getDashboard:', error);
    res.status(500).json({
      error: 'Erro ao carregar dashboard',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * GET /api/admin/mobile/ligas
 * Lista todas as ligas gerenciadas
 */
async function getLigas(req, res) {
  try {
    const db = req.app.locals.db || getDB();
    const { temporada, ativo } = req.query;

    // Monta filtro (campo real é "ativa", não "ativo")
    const filtro = {};
    if (ativo !== undefined) {
      filtro.ativa = ativo === 'true';
    } else {
      filtro.ativa = true; // Padrão: apenas ativas
    }
    if (temporada) {
      filtro.temporada = parseInt(temporada);
    }

    const ligas = await db.collection('ligas').find(filtro).sort({ nome: 1 }).toArray();

    // Retorna array de ligas com dados resumidos
    const ligasFormatadas = ligas.map(liga => ({
      id: liga._id.toString(),
      nome: liga.nome,
      temporada: liga.temporada || 2026,
      ativa: liga.ativa,
      rodadaAtual: liga.rodada_atual || 0
    }));

    res.json(ligasFormatadas);
  } catch (error) {
    logger.error('[adminMobile] Erro no getLigas:', error);
    res.status(500).json({
      error: 'Erro ao listar ligas',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * POST /api/admin/mobile/consolidacao
 * Inicia consolidação manual
 */
async function consolidarRodada(req, res) {
  try {
    const { ligaId, rodada, forcar } = req.body;
    const db = req.app.locals.db || getDB();

    // Validações
    if (!ligaId || !rodada) {
      return res.status(400).json({
        error: 'ligaId e rodada são obrigatórios',
        code: 'MISSING_PARAMS'
      });
    }

    const ligaIdNum = parseInt(ligaId);
    const rodadaNum = parseInt(rodada);

    if (isNaN(ligaIdNum) || isNaN(rodadaNum)) {
      return res.status(400).json({
        error: 'ligaId e rodada devem ser números válidos',
        code: 'INVALID_PARAMS'
      });
    }

    // Verifica se liga existe
    const liga = await db.collection('ligas').findOne({ id: ligaIdNum });
    if (!liga) {
      return res.status(404).json({
        error: 'Liga não encontrada',
        code: 'LIGA_NOT_FOUND'
      });
    }

    // Verifica se rodada já foi consolidada (a menos que forcar=true)
    if (!forcar) {
      const jaConsolidada = await db.collection('rodasnapshots').findOne({
        liga_id: String(liga._id),
        rodada: rodadaNum,
        status: 'consolidada',
        versao_schema: { $gte: 2 }
      });

      if (jaConsolidada) {
        return res.json({
          success: true,
          jaConsolidada: true,
          rodada: rodadaNum,
          consolidadaEm: jaConsolidada.data_consolidacao,
          message: 'Rodada já consolidada anteriormente'
        });
      }
    }

    // Importa dinamicamente o controller de consolidação para evitar dependências circulares
    const { consolidarRodada: consolidarRodadaOriginal } = await import('./consolidacaoController.js');

    // Cria um objeto req/res mockado para chamar o controller original
    const mockReq = {
      params: {
        ligaId: String(liga._id),
        rodada: String(rodadaNum)
      },
      query: {
        forcar: forcar ? 'true' : 'false'
      }
    };

    // Captura a resposta do controller original
    let consolidacaoResult = null;
    let consolidacaoError = null;
    let statusCode = 200;

    const mockRes = {
      json: (data) => {
        consolidacaoResult = data;
        return mockRes;
      },
      status: (code) => {
        statusCode = code;
        return mockRes;
      }
    };

    // Executa consolidação usando o controller existente
    await consolidarRodadaOriginal(mockReq, mockRes);

    // Registra ação no log de auditoria
    await db.collection('adminactivitylogs').insertOne({
      action: 'consolidacao_manual',
      user: req.admin.email,
      timestamp: new Date(),
      details: {
        ligaId: ligaIdNum,
        ligaNome: liga.nome,
        rodada: rodadaNum,
        forcar: !!forcar
      },
      result: consolidacaoResult?.success ? 'success' : 'error',
      error: consolidacaoError || null
    });

    // Retorna resultado
    if (statusCode !== 200) {
      return res.status(statusCode).json(consolidacaoResult);
    }

    res.json({
      success: consolidacaoResult?.success || false,
      jaConsolidada: consolidacaoResult?.jaConsolidada || false,
      rodada: rodadaNum,
      ligaId: ligaIdNum,
      ligaNome: liga.nome,
      consolidadaEm: consolidacaoResult?.consolidadaEm || new Date().toISOString(),
      message: consolidacaoResult?.jaConsolidada
        ? 'Rodada já estava consolidada'
        : 'Rodada consolidada com sucesso'
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no consolidarRodada:', error);
    res.status(500).json({
      error: 'Erro ao consolidar rodada: ' + error.message,
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * GET /api/admin/mobile/consolidacao/status/:ligaId/:rodada
 * Status de consolidação de uma rodada específica
 */
async function getConsolidacaoStatus(req, res) {
  try {
    const { ligaId, rodada } = req.params;
    const db = req.app.locals.db || getDB();

    const ligaIdNum = parseInt(ligaId);
    const rodadaNum = parseInt(rodada);

    // Busca liga para obter _id do MongoDB
    const liga = await db.collection('ligas').findOne({ id: ligaIdNum });
    if (!liga) {
      return res.status(404).json({
        error: 'Liga não encontrada',
        code: 'LIGA_NOT_FOUND'
      });
    }

    // Busca snapshot consolidado
    const snapshot = await db.collection('rodasnapshots').findOne({
      liga_id: String(liga._id),
      rodada: rodadaNum
    });

    if (!snapshot) {
      return res.json({
        ligaId: ligaIdNum,
        rodada: rodadaNum,
        status: 'nao_consolidada',
        consolidada: false,
        message: 'Rodada ainda não foi consolidada'
      });
    }

    // Retorna detalhes do snapshot
    res.json({
      ligaId: ligaIdNum,
      rodada: rodadaNum,
      status: snapshot.status || 'consolidada',
      consolidada: snapshot.status === 'consolidada',
      versaoSchema: snapshot.versao_schema || 1,
      dataConsolidacao: snapshot.data_consolidacao,
      totalParticipantes: snapshot.dados_consolidados?.ranking_geral?.length || 0,
      temRankingRodada: (snapshot.dados_consolidados?.ranking_rodada?.length || 0) > 0,
      temFinanceiro: !!snapshot.dados_consolidados?.financeiro,
      modulosProcessados: {
        pontosCorridos: (snapshot.dados_consolidados?.confrontos_pontos_corridos?.length || 0) > 0,
        mataMata: (snapshot.dados_consolidados?.confrontos_mata_mata?.length || 0) > 0,
        top10: (snapshot.dados_consolidados?.top_10?.mitos?.length || 0) > 0,
        artilheiro: !!snapshot.dados_consolidados?.artilheiro_campeao
      }
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getConsolidacaoStatus:', error);
    res.status(500).json({
      error: 'Erro ao buscar status: ' + error.message,
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * GET /api/admin/mobile/consolidacao/historico/:ligaId
 * Histórico de consolidações de uma liga
 * Query params: temporada, limit
 */
async function getConsolidacaoHistorico(req, res) {
  try {
    const ligaId = parseInt(req.params.ligaId);
    const db = req.app.locals.db || getDB();

    // Query params opcionais
    const temporada = req.query.temporada ? parseInt(req.query.temporada) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    // Busca liga
    const liga = await db.collection('ligas').findOne({ id: ligaId });
    if (!liga) {
      return res.status(404).json({
        error: 'Liga não encontrada',
        code: 'LIGA_NOT_FOUND'
      });
    }

    // Busca snapshots consolidados
    const query = {
      liga_id: String(liga._id),
      status: 'consolidada'
    };

    // Filtra por temporada se especificado
    if (temporada) {
      query.temporada = temporada;
    }

    const snapshots = await db.collection('rodasnapshots')
      .find(query)
      .sort({ rodada: -1 }) // Mais recentes primeiro
      .limit(limit)
      .toArray();

    // Formata histórico para resposta mobile
    const historico = snapshots.map(snapshot => {
      const rankingGeral = snapshot.dados_consolidados?.ranking_geral || [];
      const rankingRodada = snapshot.dados_consolidados?.ranking_rodada || [];
      const top10 = snapshot.dados_consolidados?.top_10 || {};

      // Identifica campeão da rodada e lider geral
      const campeaoRodada = rankingRodada[0] || null;
      const liderGeral = rankingGeral[0] || null;

      return {
        rodada: snapshot.rodada,
        temporada: snapshot.temporada || liga.temporada || 2026,
        dataConsolidacao: snapshot.data_consolidacao,
        versaoSchema: snapshot.versao_schema || 1,
        totalParticipantes: rankingGeral.length,
        campeaoRodada: campeaoRodada ? {
          timeId: campeaoRodada.time_id,
          nome: campeaoRodada.nome_time || campeaoRodada.nome,
          pontos: campeaoRodada.pontos_rodada || campeaoRodada.pontos
        } : null,
        liderGeral: liderGeral ? {
          timeId: liderGeral.time_id,
          nome: liderGeral.nome_time || liderGeral.nome,
          pontos: liderGeral.pontos_acumulados || liderGeral.pontos
        } : null,
        mito: top10.mitos?.[0] || null,
        mico: top10.micos?.[0] || null,
        modulosAtivos: {
          pontosCorridos: (snapshot.dados_consolidados?.confrontos_pontos_corridos?.length || 0) > 0,
          mataMata: (snapshot.dados_consolidados?.confrontos_mata_mata?.length || 0) > 0,
          artilheiro: !!snapshot.dados_consolidados?.artilheiro_campeao,
          luvaOuro: !!snapshot.dados_consolidados?.luva_ouro
        }
      };
    });

    // Busca informações de rodadas não consolidadas (se temporada atual)
    const temporadaAtual = liga.temporada || 2026;
    const rodadaAtual = liga.rodada_atual || 1;

    let rodadasPendentes = [];
    if (!temporada || temporada === temporadaAtual) {
      const rodadasConsolidadas = snapshots.map(s => s.rodada);
      rodadasPendentes = [];

      // Verificar status do mercado para não incluir rodada em andamento
      let ultimaConsolidavel = rodadaAtual;
      try {
        const statusMercado = await fetch('https://api.cartola.globo.com/mercado/status').then(r => r.json());
        if (statusMercado?.status_mercado === 1) {
          ultimaConsolidavel = rodadaAtual - 1;
        }
      } catch (e) {
        // Se falhar, mantém rodadaAtual como limite
      }

      for (let r = 1; r <= ultimaConsolidavel; r++) {
        if (!rodadasConsolidadas.includes(r)) {
          rodadasPendentes.push(r);
        }
      }
    }

    res.json({
      ligaId,
      ligaNome: liga.nome,
      temporada: temporada || temporadaAtual,
      totalConsolidadas: snapshots.length,
      rodadaAtual,
      rodadasPendentes,
      historico
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getConsolidacaoHistorico:', error);
    res.status(500).json({
      error: 'Erro ao buscar histórico: ' + error.message,
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * GET /api/admin/mobile/quitacoes/pendentes
 * Lista quitações pendentes
 */
async function getQuitacoesPendentes(req, res) {
  try {
    const db = req.app.locals.db || getDB();

    // Busca quitações com status pendente
    const quitacoes = await db.collection('quitacoes')
      .find({ status: 'pendente' })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json({
      quitacoes: quitacoes.map(q => ({
        id: q._id,
        ligaId: q.ligaId,
        timeId: q.timeId,
        nomeTime: q.nomeTime,
        valor: q.valor,
        comprovante: q.comprovante,
        observacao: q.observacao,
        status: q.status,
        createdAt: q.createdAt
      })),
      total: quitacoes.length
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getQuitacoesPendentes:', error);
    res.status(500).json({
      error: 'Erro ao buscar quitações',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * PUT /api/admin/mobile/quitacoes/:id/aprovar
 * Aprova quitação
 */
async function aprovarQuitacao(req, res) {
  try {
    const { id } = req.params;
    const { observacao } = req.body;
    const db = req.app.locals.db || getDB();
    const { ObjectId } = await import('mongodb');

    const result = await db.collection('quitacoes').findOneAndUpdate(
      { _id: new ObjectId(id), status: 'pendente' },
      {
        $set: {
          status: 'aprovado',
          observacao: observacao || '',
          aprovadoPor: req.admin.email,
          aprovadoEm: new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({
        error: 'Quitação não encontrada ou já processada',
        code: 'QUITACAO_NOT_FOUND'
      });
    }

    // Log de auditoria
    await db.collection('adminactivitylogs').insertOne({
      action: 'aprovar_quitacao',
      user: req.admin.email,
      timestamp: new Date(),
      details: {
        quitacaoId: id,
        ligaId: result.ligaId,
        timeId: result.timeId,
        valor: result.valor
      },
      result: 'success'
    });

    res.json({
      id,
      status: 'aprovado',
      observacao
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no aprovarQuitacao:', error);
    res.status(500).json({
      error: 'Erro ao aprovar quitação',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * PUT /api/admin/mobile/quitacoes/:id/recusar
 * Recusa quitação
 */
async function recusarQuitacao(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const db = req.app.locals.db || getDB();
    const { ObjectId } = await import('mongodb');

    if (!motivo) {
      return res.status(400).json({
        error: 'motivo é obrigatório para recusar',
        code: 'MISSING_MOTIVO'
      });
    }

    const result = await db.collection('quitacoes').findOneAndUpdate(
      { _id: new ObjectId(id), status: 'pendente' },
      {
        $set: {
          status: 'recusado',
          motivo,
          recusadoPor: req.admin.email,
          recusadoEm: new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({
        error: 'Quitação não encontrada ou já processada',
        code: 'QUITACAO_NOT_FOUND'
      });
    }

    res.json({
      id,
      status: 'recusado',
      motivo
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no recusarQuitacao:', error);
    res.status(500).json({
      error: 'Erro ao recusar quitação',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * GET /api/admin/mobile/health
 * Dashboard de saúde adaptado
 */
async function getHealth(req, res) {
  try {
    const db = req.app.locals.db || getDB();
    let healthScore = 100;
    const components = [];

    // 1. Database Status
    try {
      const dbStats = await db.command({ dbStats: 1 });
      const collections = await db.listCollections().toArray();
      components.push({
        nome: 'Database',
        icone: '🗄️',
        status: 'healthy',
        detalhes: `${collections.length} collections`,
        valor: `${(dbStats.dataSize / 1024 / 1024).toFixed(1)} MB`
      });
    } catch {
      healthScore -= 25;
      components.push({
        nome: 'Database',
        icone: '🗄️',
        status: 'critical',
        detalhes: 'Sem conexão',
        valor: null
      });
    }

    // 2. Ligas ativas
    try {
      const ligasAtivas = await db.collection('ligas').countDocuments({ ativa: true });
      // Participantes estão no array liga.participantes[], não como docs individuais em times
      const allLigas = await db.collection('ligas').find({ ativa: true }).toArray();
      const totalParticipantes = allLigas.reduce((sum, l) => sum + (l.participantes?.length || 0), 0);
      components.push({
        nome: 'Ligas Ativas',
        icone: '🏆',
        status: ligasAtivas > 0 ? 'healthy' : 'warning',
        detalhes: `${ligasAtivas} ligas, ${totalParticipantes} participantes`,
        valor: String(ligasAtivas)
      });
      if (ligasAtivas === 0) healthScore -= 10;
    } catch {
      healthScore -= 10;
      components.push({
        nome: 'Ligas Ativas',
        icone: '🏆',
        status: 'warning',
        detalhes: 'Erro ao verificar',
        valor: null
      });
    }

    // 3. Consolidação recente
    try {
      const ultimaConsolidacao = await db.collection('adminactivitylogs')
        .find({ action: 'consolidacao_manual', result: 'success' })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();

      const totalSnapshots = await db.collection('rodasnapshots').countDocuments({ status: 'consolidada' });

      if (ultimaConsolidacao.length > 0) {
        const horasAtras = Math.round((Date.now() - new Date(ultimaConsolidacao[0].timestamp).getTime()) / 3600000);
        components.push({
          nome: 'Consolidação',
          icone: '⚙️',
          status: horasAtras < 168 ? 'healthy' : 'warning',
          detalhes: `Última: ${horasAtras}h atrás`,
          valor: `${totalSnapshots} snapshots`
        });
        if (horasAtras >= 168) healthScore -= 15;
      } else {
        components.push({
          nome: 'Consolidação',
          icone: '⚙️',
          status: 'warning',
          detalhes: 'Nenhuma consolidação registrada',
          valor: `${totalSnapshots} snapshots`
        });
        healthScore -= 15;
      }
    } catch {
      healthScore -= 15;
      components.push({
        nome: 'Consolidação',
        icone: '⚙️',
        status: 'warning',
        detalhes: 'Erro ao verificar',
        valor: null
      });
    }

    // 4. Financeiro - inadimplentes
    try {
      const extratosNegativos = await db.collection('extratofinanceirocaches')
        .countDocuments({ saldo_final: { $lt: 0 } });
      const totalExtratos = await db.collection('extratofinanceirocaches').countDocuments({});

      components.push({
        nome: 'Financeiro',
        icone: '💰',
        status: extratosNegativos === 0 ? 'healthy' : extratosNegativos <= 5 ? 'warning' : 'critical',
        detalhes: extratosNegativos > 0 ? `${extratosNegativos} inadimplente(s)` : 'Nenhum inadimplente',
        valor: `${totalExtratos} extratos`
      });
      if (extratosNegativos > 5) healthScore -= 10;
    } catch {
      components.push({
        nome: 'Financeiro',
        icone: '💰',
        status: 'warning',
        detalhes: 'Erro ao verificar',
        valor: null
      });
    }

    // 5. Sistema
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const memUsage = process.memoryUsage();
    const memMB = (memUsage.rss / 1024 / 1024).toFixed(0);

    components.push({
      nome: 'Sistema',
      icone: '🖥️',
      status: 'healthy',
      detalhes: `Uptime: ${hours}h ${minutes}m`,
      valor: `${memMB} MB RAM`
    });

    healthScore = Math.max(0, Math.min(100, healthScore));
    const status = healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical';

    res.json({
      healthScore,
      status,
      components,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getHealth:', error);
    res.status(500).json({
      error: 'Erro ao buscar health',
      code: 'INTERNAL_ERROR'
    });
  }
}

// ========== CACHE SENTINEL ========== //

/**
 * POST /api/admin/mobile/cache/flush
 * Flush seletivo de caches do sistema
 * Body: { targets: ['marketgate', 'cartola', 'jogos', 'ranking', 'top10'] }
 */
async function flushCache(req, res) {
  try {
    const { targets = [] } = req.body;
    const adminEmail = req.admin?.email || 'sistema';
    const results = [];

    // MarketGate
    if (targets.includes('marketgate')) {
      try {
        marketGate.clearCache();
        results.push({ target: 'marketgate', success: true, label: 'MarketGate' });
      } catch (err) {
        results.push({ target: 'marketgate', success: false, label: 'MarketGate', error: err.message });
      }
    }

    // Cartola API Service
    if (targets.includes('cartola')) {
      try {
        cartolaApiService.limparCache();
        results.push({ target: 'cartola', success: true, label: 'API Cartola' });
      } catch (err) {
        results.push({ target: 'cartola', success: false, label: 'API Cartola', error: err.message });
      }
    }

    // Jogos ao Vivo (via internal fetch)
    if (targets.includes('jogos')) {
      try {
        const port = process.env.PORT || 3000;
        const resp = await fetch(`http://localhost:${port}/api/jogos-ao-vivo/invalidar`);
        const data = await resp.json();
        results.push({ target: 'jogos', success: true, label: 'Jogos ao Vivo' });
      } catch (err) {
        results.push({ target: 'jogos', success: false, label: 'Jogos ao Vivo', error: err.message });
      }
    }

    // Ranking cache (per league)
    if (targets.includes('ranking')) {
      try {
        const db = req.app.locals.db || getDB();
        const ligas = await db.collection('ligas').find({ ativa: true }).project({ _id: 1 }).toArray();
        let cleared = 0;
        for (const liga of ligas) {
          const port = process.env.PORT || 3000;
          try {
            await fetch(`http://localhost:${port}/api/ranking-cache/${liga._id}`, { method: 'DELETE' });
            cleared++;
          } catch (_) { /* skip */ }
        }
        results.push({ target: 'ranking', success: true, label: 'Ranking Cache', detail: `${cleared} ligas` });
      } catch (err) {
        results.push({ target: 'ranking', success: false, label: 'Ranking Cache', error: err.message });
      }
    }

    // Top10 cache (per league)
    if (targets.includes('top10')) {
      try {
        const db = req.app.locals.db || getDB();
        const ligas = await db.collection('ligas').find({ ativa: true }).project({ _id: 1 }).toArray();
        let cleared = 0;
        for (const liga of ligas) {
          const port = process.env.PORT || 3000;
          try {
            await fetch(`http://localhost:${port}/api/top10/cache/${liga._id}`, { method: 'DELETE' });
            cleared++;
          } catch (_) { /* skip */ }
        }
        results.push({ target: 'top10', success: true, label: 'Top 10 Cache', detail: `${cleared} ligas` });
      } catch (err) {
        results.push({ target: 'top10', success: false, label: 'Top 10 Cache', error: err.message });
      }
    }

    // Log activity
    const db = req.app.locals.db || getDB();
    await db.collection('adminactivitylogs').insertOne({
      email: adminEmail,
      action: 'cache_flush',
      details: { targets, results },
      result: results.every(r => r.success) ? 'success' : 'partial',
      timestamp: new Date()
    });

    res.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no flushCache:', error);
    res.status(500).json({ error: 'Erro ao limpar cache', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/admin/mobile/cache/status
 * Status de todas as camadas de cache
 */
async function getCacheStatus(req, res) {
  try {
    const port = process.env.PORT || 3000;
    const layers = [];

    // MarketGate
    try {
      const mgStatus = marketGate.getStatus ? marketGate.getStatus() : { hasCache: !!marketGate._cache };
      layers.push({
        id: 'marketgate',
        label: 'MarketGate',
        icon: 'storefront',
        description: 'Cache do mercado Cartola',
        status: mgStatus.hasCache || mgStatus.has_cache ? 'cached' : 'empty'
      });
    } catch (_) {
      layers.push({ id: 'marketgate', label: 'MarketGate', icon: 'storefront', description: 'Cache do mercado Cartola', status: 'unknown' });
    }

    // Cartola API
    layers.push({
      id: 'cartola',
      label: 'API Cartola',
      icon: 'sports_soccer',
      description: 'Cache de dados da API Cartola FC',
      status: 'active'
    });

    // Jogos ao Vivo
    try {
      const resp = await fetch(`http://localhost:${port}/api/jogos-ao-vivo/status`);
      const data = await resp.json();
      const hasCache = data.cache?.temJogos || data.cacheGeral?.jogosEmCache > 0;
      layers.push({
        id: 'jogos',
        label: 'Jogos ao Vivo',
        icon: 'live_tv',
        description: `Fonte: ${data.cacheGeral?.fonte || 'N/A'}`,
        status: hasCache ? 'cached' : 'empty'
      });
    } catch (_) {
      layers.push({ id: 'jogos', label: 'Jogos ao Vivo', icon: 'live_tv', description: 'Cache de jogos do dia', status: 'unknown' });
    }

    // Ranking
    layers.push({
      id: 'ranking',
      label: 'Ranking Cache',
      icon: 'leaderboard',
      description: 'Cache consolidado de rankings',
      status: 'active'
    });

    // Top10
    layers.push({
      id: 'top10',
      label: 'Top 10 Cache',
      icon: 'emoji_events',
      description: 'Cache do Top 10 (Mito/Mico)',
      status: 'active'
    });

    res.json({ layers, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('[adminMobile] Erro no getCacheStatus:', error);
    res.status(500).json({ error: 'Erro ao buscar status do cache', code: 'INTERNAL_ERROR' });
  }
}

// ========== FORCE UPDATE APP ========== //

// Mutable version override (persists in memory between requests, resets on server restart)
let _versionOverride = null;

/**
 * POST /api/admin/mobile/force-update
 * Gera nova versao forçada para invalidar cache dos clientes
 * Body: { scope: 'app' | 'admin' | 'all' }
 */
async function forceAppUpdate(req, res) {
  try {
    const { scope = 'all' } = req.body;
    const adminEmail = req.admin?.email || 'sistema';
    const now = new Date();

    // Gerar version string baseado no timestamp atual de Brasilia
    const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const version = [
      String(brDate.getDate()).padStart(2, '0'),
      String(brDate.getMonth() + 1).padStart(2, '0'),
      String(brDate.getFullYear()).slice(-2),
      String(brDate.getHours()).padStart(2, '0') + String(brDate.getMinutes()).padStart(2, '0')
    ].join('.');

    _versionOverride = { version, scope, timestamp: now.toISOString(), by: adminEmail };

    // Log activity
    const db = req.app.locals.db || getDB();
    await db.collection('adminactivitylogs').insertOne({
      email: adminEmail,
      action: 'force_app_update',
      details: { scope, version },
      result: 'success',
      timestamp: now
    });

    res.json({
      success: true,
      version,
      scope,
      message: `Versao forcada: ${version} (${scope})`,
      timestamp: now.toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no forceAppUpdate:', error);
    res.status(500).json({ error: 'Erro ao forcar atualizacao', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/admin/mobile/version-status
 * Status atual das versoes (participante + admin + override)
 */
async function getVersionStatus(req, res) {
  try {
    const port = process.env.PORT || 3000;
    let participante = null, admin = null;

    try {
      const resp = await fetch(`http://localhost:${port}/api/app/versao/all`);
      const data = await resp.json();
      participante = data.participante;
      admin = data.admin;
    } catch (_) { /* fallback */ }

    res.json({
      participante,
      admin,
      override: _versionOverride,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getVersionStatus:', error);
    res.status(500).json({ error: 'Erro ao buscar versoes', code: 'INTERNAL_ERROR' });
  }
}

// Export version override for use by appVersionRoutes
export function getVersionOverride() {
  return _versionOverride;
}

// ========== CHECKLIST PRE-RODADA ========== //

/**
 * GET /api/admin/mobile/checklist
 * Aggregates multiple system checks for pre-round readiness
 */
async function getChecklist(req, res) {
  try {
    const port = process.env.PORT || 3000;
    const db = req.app.locals.db || getDB();
    const checks = [];

    // 1. Orchestrator rodando?
    try {
      const resp = await fetch(`http://localhost:${port}/api/orchestrator/status`);
      const data = await resp.json();
      const ativo = data.success && data.live;
      checks.push({
        id: 'orchestrator',
        label: 'Orchestrator',
        description: ativo ? `Fase: ${data.live?.faseRodada || 'idle'}` : 'Indisponivel',
        status: ativo ? 'ok' : 'error',
        icon: 'precision_manufacturing'
      });
    } catch (_) {
      checks.push({ id: 'orchestrator', label: 'Orchestrator', description: 'Sem resposta', status: 'error', icon: 'precision_manufacturing' });
    }

    // 2. Ultima rodada consolidada?
    try {
      const resp = await fetch(`http://localhost:${port}/api/orchestrator/status`);
      const data = await resp.json();
      const rodadaAtual = data.live?.rodadaAtual || 0;
      const lastConsolidacao = await db.collection('adminactivitylogs')
        .findOne({ action: 'consolidacao_manual' }, { sort: { timestamp: -1 } });
      const consolidadaEm = lastConsolidacao?.timestamp;
      checks.push({
        id: 'consolidacao',
        label: 'Consolidacao',
        description: consolidadaEm ? `Ultima: ${new Date(consolidadaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Nenhuma registrada',
        status: consolidadaEm ? 'ok' : 'warning',
        icon: 'sync'
      });
    } catch (_) {
      checks.push({ id: 'consolidacao', label: 'Consolidacao', description: 'Erro ao verificar', status: 'error', icon: 'sync' });
    }

    // 3. APIs de jogos saudaveis?
    try {
      const resp = await fetch(`http://localhost:${port}/api/jogos-ao-vivo/status`);
      const data = await resp.json();
      const fontes = data.fontes || {};
      const apiFootball = fontes['api-football'] || {};
      const quota = apiFootball.quota || {};
      const restante = quota.restante ?? '?';
      checks.push({
        id: 'apis_jogos',
        label: 'APIs de Jogos',
        description: `API-Football: ${restante} req restantes`,
        status: quota.circuitBreaker ? 'error' : (restante > 20 ? 'ok' : 'warning'),
        icon: 'live_tv'
      });
    } catch (_) {
      checks.push({ id: 'apis_jogos', label: 'APIs de Jogos', description: 'Sem resposta', status: 'error', icon: 'live_tv' });
    }

    // 4. Banco de dados OK?
    try {
      const collections = await db.listCollections().toArray();
      checks.push({
        id: 'database',
        label: 'Banco de Dados',
        description: `${collections.length} collections`,
        status: 'ok',
        icon: 'storage'
      });
    } catch (_) {
      checks.push({ id: 'database', label: 'Banco de Dados', description: 'Conexao falhou', status: 'error', icon: 'storage' });
    }

    // 5. Ligas ativas com modulos?
    try {
      const ligas = await db.collection('ligas').find({ ativa: true }).toArray();
      const totalModulosAtivos = ligas.reduce((sum, l) => {
        const mods = l.modulos_ativos || {};
        return sum + Object.values(mods).filter(v => v === true).length;
      }, 0);
      checks.push({
        id: 'ligas_modulos',
        label: 'Ligas & Modulos',
        description: `${ligas.length} ligas, ${totalModulosAtivos} modulos ativos`,
        status: ligas.length > 0 ? 'ok' : 'warning',
        icon: 'groups'
      });
    } catch (_) {
      checks.push({ id: 'ligas_modulos', label: 'Ligas & Modulos', description: 'Erro ao verificar', status: 'error', icon: 'groups' });
    }

    // 6. Manutencao ativa?
    try {
      const resp = await fetch(`http://localhost:${port}/api/admin/manutencao`);
      const data = await resp.json();
      const ativo = data.ativo || data.manutencao?.ativo;
      checks.push({
        id: 'manutencao',
        label: 'Modo Manutencao',
        description: ativo ? 'ATIVO - participantes bloqueados' : 'Desativado',
        status: ativo ? 'warning' : 'ok',
        icon: 'build'
      });
    } catch (_) {
      checks.push({ id: 'manutencao', label: 'Modo Manutencao', description: 'Erro ao verificar', status: 'warning', icon: 'build' });
    }

    // 7. Participantes sincronizados? (absorbs ligas-gerenciar)
    try {
      const ligas = await db.collection('ligas').find({ ativa: true }).toArray();
      let totalTimes = 0;
      for (const liga of ligas) {
        const count = await db.collection('times').countDocuments({
          liga_id: liga._id.toString(),
          ativo: true
        });
        totalTimes += count;
      }
      checks.push({
        id: 'participantes',
        label: 'Participantes',
        description: `${totalTimes} participantes ativos`,
        status: totalTimes > 0 ? 'ok' : 'warning',
        icon: 'people'
      });
    } catch (_) {
      checks.push({ id: 'participantes', label: 'Participantes', description: 'Erro ao verificar', status: 'error', icon: 'people' });
    }

    const score = checks.filter(c => c.status === 'ok').length;
    const total = checks.length;
    const allOk = checks.every(c => c.status === 'ok');

    res.json({
      ready: allOk,
      score: `${score}/${total}`,
      checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getChecklist:', error);
    res.status(500).json({ error: 'Erro ao gerar checklist', code: 'INTERNAL_ERROR' });
  }
}

// ========== TOGGLE MODULOS ========== //

/**
 * GET /api/admin/mobile/modulos/:ligaId
 * Lista modulos de uma liga com status
 */
async function getModulos(req, res) {
  try {
    const { ligaId } = req.params;
    const temporada = Number(req.query.temporada) || CURRENT_SEASON;

    const liga = await Liga.findById(ligaId).select('nome modulos_ativos').lean();
    if (!liga) {
      return res.status(404).json({ error: 'Liga nao encontrada', code: 'NOT_FOUND' });
    }

    const modulos_ativos = liga.modulos_ativos || {};

    // Map to a clean list
    const modulosList = [
      { id: 'extrato', label: 'Extrato', icon: 'receipt_long', base: true },
      { id: 'ranking', label: 'Ranking', icon: 'leaderboard', base: true },
      { id: 'rodadas', label: 'Rodadas', icon: 'calendar_month', base: true },
      { id: 'historico', label: 'Historico', icon: 'history', base: true },
      { id: 'top10', label: 'Top 10', icon: 'star', base: false },
      { id: 'melhorMes', label: 'Melhor do Mes', icon: 'workspace_premium', base: false },
      { id: 'pontosCorridos', label: 'Pontos Corridos', icon: 'format_list_numbered', base: false },
      { id: 'mataMata', label: 'Mata-Mata', icon: 'account_tree', base: false },
      { id: 'artilheiro', label: 'Artilheiro', icon: 'sports_soccer', base: false },
      { id: 'luvaOuro', label: 'Luva de Ouro', icon: 'sports_handball', base: false },
      { id: 'capitaoLuxo', label: 'Capitao de Luxo', icon: 'military_tech', base: false },
      { id: 'campinho', label: 'Campinho', icon: 'grid_on', base: false },
      { id: 'dicas', label: 'Dicas', icon: 'lightbulb', base: false },
    ];

    const result = modulosList.map(m => ({
      ...m,
      ativo: modulos_ativos[m.id] === true || (m.base && modulos_ativos[m.id] !== false)
    }));

    res.json({
      liga: { id: ligaId, nome: liga.nome },
      modulos: result,
      temporada,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getModulos:', error);
    res.status(500).json({ error: 'Erro ao listar modulos', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/admin/mobile/modulos/:ligaId/:modulo/toggle
 * Toggle a module on/off
 * Body: { ativo: boolean }
 */
async function toggleModulo(req, res) {
  try {
    const { ligaId, modulo } = req.params;
    const { ativo } = req.body;
    const adminEmail = req.admin?.email || 'sistema';

    if (typeof ativo !== 'boolean') {
      return res.status(400).json({ error: 'Campo ativo (boolean) obrigatorio', code: 'INVALID_INPUT' });
    }

    const result = await Liga.updateOne(
      { _id: ligaId },
      { $set: { [`modulos_ativos.${modulo}`]: ativo } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Liga nao encontrada', code: 'NOT_FOUND' });
    }

    // Log activity
    const db = req.app.locals.db || getDB();
    await db.collection('adminactivitylogs').insertOne({
      email: adminEmail,
      action: 'modulo_toggle',
      details: { ligaId, modulo, ativo },
      result: 'success',
      timestamp: new Date()
    });

    res.json({
      success: true,
      modulo,
      ativo,
      message: `Modulo ${modulo} ${ativo ? 'ativado' : 'desativado'}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no toggleModulo:', error);
    res.status(500).json({ error: 'Erro ao alterar modulo', code: 'INTERNAL_ERROR' });
  }
}

// ========== ACTIVITY LOGS ========== //

/**
 * GET /api/admin/mobile/logs
 * Query admin activity logs
 * Query: ?limit=50&offset=0&action=login
 */
async function getActivityLogs(req, res) {
  try {
    const db = req.app.locals.db || getDB();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const actionFilter = req.query.action;

    const query = {};
    if (actionFilter) query.action = actionFilter;

    const [logs, total] = await Promise.all([
      db.collection('adminactivitylogs')
        .find(query)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      db.collection('adminactivitylogs').countDocuments(query)
    ]);

    res.json({
      logs,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[adminMobile] Erro no getActivityLogs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs', code: 'INTERNAL_ERROR' });
  }
}

export {
  authenticate,
  getDashboard,
  getLigas,
  consolidarRodada,
  getConsolidacaoStatus,
  getConsolidacaoHistorico,
  getQuitacoesPendentes,
  aprovarQuitacao,
  recusarQuitacao,
  getHealth,
  flushCache,
  getCacheStatus,
  forceAppUpdate,
  getVersionStatus,
  getChecklist,
  getModulos,
  toggleModulo,
  getActivityLogs
};
