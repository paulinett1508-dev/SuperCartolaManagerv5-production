/**
 * Analytics Service v1.0
 * Análises locais via aggregation pipelines MongoDB
 * Substitui integração com LLM externo — 100% gratuito e instantâneo
 */

import mongoose from 'mongoose';
import { truncarPontosNum } from '../utils/type-helpers.js';
import ExtratoFinanceiroCache from '../models/ExtratoFinanceiroCache.js';
import AcertoFinanceiro from '../models/AcertoFinanceiro.js';
import AjusteFinanceiro from '../models/AjusteFinanceiro.js';
import InscricaoTemporada from '../models/InscricaoTemporada.js';
import AccessLog from '../models/AccessLog.js';
import Liga from '../models/Liga.js';
import Time from '../models/Time.js';
import Rodada from '../models/Rodada.js';
import RankingGeralCache from '../models/RankingGeralCache.js';
import { CURRENT_SEASON } from '../config/seasons.js';

// ============================================
// 1. RAIO-X FINANCEIRO
// ============================================
export async function raioXFinanceiro(ligaId, temporada = CURRENT_SEASON) {
  const liga = await Liga.findById(ligaId).lean();
  if (!liga) throw new Error('Liga não encontrada');

  const [extratos, acertos, ajustes] = await Promise.all([
    ExtratoFinanceiroCache.find({ liga_id: ligaId, temporada }).lean(),
    AcertoFinanceiro.buscarPorLiga(ligaId, temporada),
    AjusteFinanceiro.listarPorLiga(ligaId, temporada)
  ]);

  // Saldo consolidado por participante
  const participantes = extratos.map(e => {
    const acertosTime = acertos.filter(a => String(a.timeId) === String(e.time_id));
    const ajustesTime = ajustes.filter(a => String(a.time_id) === String(e.time_id));

    const totalPago = acertosTime
      .filter(a => a.tipo === 'pagamento')
      .reduce((sum, a) => sum + a.valor, 0);
    const totalRecebido = acertosTime
      .filter(a => a.tipo === 'recebimento')
      .reduce((sum, a) => sum + a.valor, 0);
    const totalAjustes = ajustesTime.reduce((sum, a) => sum + a.valor, 0);

    return {
      time_id: e.time_id,
      nome: buscarNomeParticipante(liga, e.time_id),
      saldo_consolidado: e.saldo_consolidado || 0,
      ganhos: e.ganhos_consolidados || 0,
      perdas: e.perdas_consolidadas || 0,
      total_pago: totalPago,
      total_recebido: totalRecebido,
      total_ajustes: totalAjustes,
      ultima_rodada: e.ultima_rodada_consolidada || 0,
      quitado: e.quitacao?.quitado || false
    };
  });

  // Ordenar por saldo
  const devedores = [...participantes]
    .filter(p => p.saldo_consolidado < 0)
    .sort((a, b) => a.saldo_consolidado - b.saldo_consolidado);

  const credores = [...participantes]
    .filter(p => p.saldo_consolidado > 0)
    .sort((a, b) => b.saldo_consolidado - a.saldo_consolidado);

  const totalPositivo = credores.reduce((s, p) => s + p.saldo_consolidado, 0);
  const totalNegativo = devedores.reduce((s, p) => s + p.saldo_consolidado, 0);
  const totalPagamentos = participantes.reduce((s, p) => s + p.total_pago, 0);
  const totalRecebimentos = participantes.reduce((s, p) => s + p.total_recebido, 0);

  // Anomalias: quem tem extrato mas saldo zerado apesar de rodadas jogadas
  const anomalias = participantes.filter(p =>
    p.saldo_consolidado === 0 && p.ultima_rodada > 0 && p.ganhos === 0 && p.perdas === 0
  );

  return {
    ligaNome: liga.nome,
    resumo: {
      total_participantes: participantes.length,
      total_saldo_positivo: totalPositivo,
      total_saldo_negativo: totalNegativo,
      balanco_geral: totalPositivo + totalNegativo,
      total_pagamentos: totalPagamentos,
      total_recebimentos: totalRecebimentos,
      total_acertos: acertos.length,
      total_ajustes: ajustes.length,
      taxa_quitacao: participantes.length > 0
        ? ((participantes.filter(p => p.quitado).length / participantes.length) * 100).toFixed(1)
        : 0
    },
    maiores_devedores: devedores.slice(0, 10),
    maiores_credores: credores.slice(0, 10),
    anomalias,
    todos_participantes: participantes.sort((a, b) => a.saldo_consolidado - b.saldo_consolidado)
  };
}

// ============================================
// 2. SAÚDE DA LIGA
// ============================================
export async function saudeLiga(ligaId, temporada = CURRENT_SEASON) {
  const liga = await Liga.findById(ligaId).lean();
  if (!liga) throw new Error('Liga não encontrada');

  const [times, inscricoes, acessos] = await Promise.all([
    Time.find({ liga_id: ligaId, temporada }).lean(),
    InscricaoTemporada.estatisticas(ligaId, temporada).catch(() => null),
    AccessLog.getLigasComAcessos(30).catch(() => [])
  ]);

  const ativos = times.filter(t => t.ativo !== false);
  const inativos = times.filter(t => t.ativo === false);
  const desistentes = times.filter(t => t.rodada_desistencia);

  // Módulos ativos
  const modulos = liga.modulos_ativos || {};
  const modulosAtivos = Object.entries(modulos)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const modulosInativos = Object.entries(modulos)
    .filter(([, v]) => v !== true)
    .map(([k]) => k);

  // Acesso da liga
  const acessoLiga = acessos.find(a => String(a.liga_id) === String(ligaId));

  return {
    ligaNome: liga.nome,
    participantes: {
      total: times.length,
      ativos: ativos.length,
      inativos: inativos.length,
      desistentes: desistentes.length,
      taxa_atividade: times.length > 0
        ? ((ativos.length / times.length) * 100).toFixed(1)
        : 0,
      lista_desistentes: desistentes.map(t => ({
        time_id: t.id,
        nome: t.nome_cartoleiro || t.nome_time,
        rodada_desistencia: t.rodada_desistencia
      }))
    },
    inscricoes: inscricoes || { pendentes: 0, renovados: 0, nao_participa: 0, novos: 0, total: 0 },
    modulos: {
      ativos: modulosAtivos,
      inativos: modulosInativos,
      total_ativos: modulosAtivos.length,
      total_disponiveis: Object.keys(modulos).length
    },
    engajamento: {
      acessos_30d: acessoLiga?.total_acessos || 0,
      usuarios_unicos_30d: acessoLiga?.usuarios_unicos || 0
    }
  };
}

// ============================================
// 3. PERFORMANCE RANKING
// ============================================
export async function performanceRanking(ligaId, temporada = CURRENT_SEASON) {
  const liga = await Liga.findById(ligaId).lean();
  if (!liga) throw new Error('Liga não encontrada');

  // Aggregation: pontos por participante
  const stats = await Rodada.aggregate([
    {
      $match: {
        ligaId: new mongoose.Types.ObjectId(ligaId),
        temporada,
        rodadaNaoJogada: { $ne: true }
      }
    },
    {
      $group: {
        _id: '$timeId',
        nome_cartola: { $first: '$nome_cartola' },
        nome_time: { $first: '$nome_time' },
        escudo: { $first: '$escudo' },
        total_pontos: { $sum: '$pontos' },
        media_pontos: { $avg: '$pontos' },
        rodadas_jogadas: { $sum: 1 },
        melhor_rodada: { $max: '$pontos' },
        pior_rodada: { $min: '$pontos' },
        pontos_array: { $push: '$pontos' }
      }
    },
    { $sort: { total_pontos: -1 } }
  ]);

  // Calcular variância (consistência) e posição
  const ranking = stats.map((s, i) => {
    const pontos = s.pontos_array || [];
    const media = s.media_pontos || 0;
    const variancia = pontos.length > 0
      ? pontos.reduce((sum, p) => sum + Math.pow(p - media, 2), 0) / pontos.length
      : 0;

    return {
      posicao: i + 1,
      time_id: s._id,
      nome: s.nome_cartola || s.nome_time,
      escudo: s.escudo,
      total_pontos: s.total_pontos,
      media_pontos: truncarPontosNum(media),
      rodadas_jogadas: s.rodadas_jogadas,
      melhor_rodada: s.melhor_rodada,
      pior_rodada: s.pior_rodada,
      desvio_padrao: truncarPontosNum(Math.sqrt(variancia)),
      amplitude: truncarPontosNum((s.melhor_rodada || 0) - (s.pior_rodada || 0))
    };
  });

  // Mito/Mico contagem via extratos
  const extratos = await ExtratoFinanceiroCache.find({ liga_id: ligaId, temporada }).lean();
  const mitoMico = {};
  for (const e of extratos) {
    const hist = e.historico_transacoes || [];
    const mitos = hist.filter(h => h.isMito).length;
    const micos = hist.filter(h => h.isMico).length;
    if (mitos > 0 || micos > 0) {
      mitoMico[e.time_id] = { mitos, micos };
    }
  }

  // Enriquecer ranking com mito/mico
  for (const r of ranking) {
    const mm = mitoMico[r.time_id] || { mitos: 0, micos: 0 };
    r.mitos = mm.mitos;
    r.micos = mm.micos;
  }

  // Top/bottom e mais consistentes
  const maisConsistentes = [...ranking]
    .filter(r => r.rodadas_jogadas >= 3)
    .sort((a, b) => a.desvio_padrao - b.desvio_padrao);

  return {
    ligaNome: liga.nome,
    resumo: {
      total_participantes: ranking.length,
      media_geral: ranking.length > 0
        ? truncarPontosNum(ranking.reduce((s, r) => s + r.media_pontos, 0) / ranking.length)
        : 0,
      total_rodadas: ranking.length > 0 ? ranking[0].rodadas_jogadas : 0
    },
    top_5: ranking.slice(0, 5),
    bottom_5: ranking.slice(-5).reverse(),
    mais_consistentes: maisConsistentes.slice(0, 5),
    menos_consistentes: maisConsistentes.slice(-5).reverse(),
    ranking_completo: ranking
  };
}

// ============================================
// 4. DIAGNÓSTICO DO SISTEMA
// ============================================
export async function diagnosticoSistema() {
  const db = mongoose.connection.db;

  // Collections e tamanhos
  const collections = await db.listCollections().toArray();
  const colSizes = [];
  for (const col of collections) {
    const count = await db.collection(col.name).estimatedDocumentCount();
    colSizes.push({ nome: col.name, documentos: count });
  }
  colSizes.sort((a, b) => b.documentos - a.documentos);

  // Status do banco
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'desconectado', 1: 'conectado', 2: 'conectando', 3: 'desconectando' };

  // Memória
  const mem = process.memoryUsage();

  // Ligas e consolidação
  const ligas = await Liga.find({ ativa: true, status: { $nin: ['aposentada', 'suspensa'] } })
    .select('nome temporada')
    .lean();

  const consolidacao = [];
  for (const liga of ligas) {
    const ultimaRodada = await Rodada.findOne({ ligaId: liga._id, temporada: liga.temporada })
      .sort({ rodada: -1 })
      .select('rodada')
      .lean();

    const ultimoExtrato = await ExtratoFinanceiroCache.findOne({ liga_id: liga._id, temporada: liga.temporada })
      .sort({ ultima_rodada_consolidada: -1 })
      .select('ultima_rodada_consolidada')
      .lean();

    consolidacao.push({
      liga_id: liga._id,
      ligaNome: liga.nome,
      ultima_rodada_dados: ultimaRodada?.rodada || 0,
      ultima_rodada_consolidada: ultimoExtrato?.ultima_rodada_consolidada || 0,
      gap: (ultimaRodada?.rodada || 0) - (ultimoExtrato?.ultima_rodada_consolidada || 0)
    });
  }

  // Health score simples
  let score = 100;
  if (dbState !== 1) score -= 30;
  if (mem.heapUsed / mem.heapTotal > 0.85) score -= 15;
  const gapsCount = consolidacao.filter(c => c.gap > 0).length;
  if (gapsCount > 0) score -= Math.min(gapsCount * 5, 20);

  return {
    health_score: Math.max(0, score),
    banco: {
      status: dbStates[dbState] || 'desconhecido',
      total_collections: collections.length,
      collections: colSizes.slice(0, 20)
    },
    memoria: {
      heap_usado_mb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
      heap_total_mb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(1)),
      rss_mb: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
      uso_percentual: parseFloat(((mem.heapUsed / mem.heapTotal) * 100).toFixed(1))
    },
    processo: {
      uptime_horas: parseFloat((process.uptime() / 3600).toFixed(2)),
      node_version: process.version
    },
    consolidacao: {
      ligas_ativas: ligas.length,
      com_gap: gapsCount,
      detalhes: consolidacao
    }
  };
}

// ============================================
// 5. VISÃO GERAL
// ============================================
export async function visaoGeral(temporada = CURRENT_SEASON) {
  const [ligas, times, volumeFinanceiro, ultimaRodada] = await Promise.all([
    Liga.countDocuments({ ativa: true, temporada, status: { $nin: ['aposentada', 'suspensa'] } }),
    Time.countDocuments({ temporada }),
    ExtratoFinanceiroCache.aggregate([
      { $match: { temporada } },
      {
        $group: {
          _id: null,
          total_ganhos: { $sum: '$ganhos_consolidados' },
          total_perdas: { $sum: '$perdas_consolidadas' },
          total_extratos: { $sum: 1 }
        }
      }
    ]),
    Rodada.findOne({ temporada }).sort({ rodada: -1 }).select('rodada').lean()
  ]);

  const vol = volumeFinanceiro[0] || { total_ganhos: 0, total_perdas: 0, total_extratos: 0 };

  // Acesso geral (30 dias)
  const acessos = await AccessLog.getLigasComAcessos(30).catch(() => []);
  const totalAcessos = acessos.reduce((s, a) => s + (a.total_acessos || 0), 0);
  const totalUsuarios = acessos.reduce((s, a) => s + (a.usuarios_unicos || 0), 0);

  return {
    temporada,
    ligas_ativas: ligas,
    total_participantes: times,
    rodada_atual: ultimaRodada?.rodada || 0,
    financeiro: {
      volume_ganhos: vol.total_ganhos,
      volume_perdas: vol.total_perdas,
      volume_total: vol.total_ganhos + Math.abs(vol.total_perdas),
      total_extratos: vol.total_extratos
    },
    engajamento: {
      acessos_30d: totalAcessos,
      usuarios_unicos_30d: totalUsuarios,
      ligas_com_acesso: acessos.length
    }
  };
}

// ============================================
// HELPER: Ligas disponíveis para select
// ============================================
export async function ligasDisponiveis(temporada = CURRENT_SEASON) {
  return Liga.find(
    { ativa: true, temporada, status: { $nin: ['aposentada', 'suspensa'] } },
    { nome: 1, temporada: 1 }
  ).sort({ nome: 1 }).lean();
}

// ============================================
// HELPER INTERNO
// ============================================
function buscarNomeParticipante(liga, timeId) {
  const p = (liga.participantes || []).find(p => String(p.time_id) === String(timeId));
  return p?.nome_cartoleiro || p?.nome_time || `Time ${timeId}`;
}
