// services/api-orchestrator.js
// v1.0 - Orquestrador Multi-API para Jogos ao Vivo
//
// HIERARQUIA DE FONTES:
//   1. SoccerDataAPI (PRIMÁRIA - livescores em polling)
//   2. API-Football (SECUNDÁRIA - fallback + enriquecimento)
//   3. Globo SSR (PARALELO - agenda ilimitada)
//   4. Cache Stale (FALLBACK - até 30min)
//   5. Globo JSON arquivo (FALLBACK FINAL - legado)
//
// REGRA CHAVE: API-Football NUNCA é chamada se SoccerDataAPI retornou dados.
// API-Football é ativada APENAS quando:
//   - SoccerDataAPI falha/indisponível
//   - Requisição de eventos/stats de jogo (on-demand)
//   - Fixtures do dia (1x de manhã para enriquecer agenda)

import apiFootball from './api-football-service.js';
import copaDoMundo from '../config/copa-do-mundo-2026.js';

// Status codes padrão
const STATUS_AO_VIVO = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const STATUS_ENCERRADO = ['FT', 'AET', 'PEN'];

// ════════════════════════════════════════════════════════════════
// ESTADO DO ORQUESTRADOR
// ════════════════════════════════════════════════════════════════
let orchestratorState = {
  initialized: false,
  lastSoccerDataSuccess: null,  // Timestamp do último sucesso SoccerData
  lastApiFootballSuccess: null, // Timestamp do último sucesso API-Football
  soccerDataConsecutiveFailures: 0,  // Contador de falhas consecutivas

  // Cache de fixtures do dia (API-Football) - 1 request/dia
  fixturesDoDia: null,
  fixturesDoDiaDate: null,
  fixturesDoDiaTimestamp: 0,
};

/**
 * Inicializa o orquestrador (chamado no startup)
 * @param {Db} mongoDb - Instância MongoDB
 */
async function init(mongoDb) {
  await apiFootball.init(mongoDb);
  orchestratorState.initialized = true;
  console.log('[ORQUESTRADOR] ✅ Multi-API orquestrador inicializado');
}

// ════════════════════════════════════════════════════════════════
// ORQUESTRAÇÃO PRINCIPAL - LIVESCORES
// ════════════════════════════════════════════════════════════════

/**
 * Busca livescores usando a hierarquia de APIs.
 * Retorna jogos brasileiros formatados no formato padrão.
 *
 * Fluxo:
 *   1. SoccerDataAPI → se sucesso, retorna
 *   2. Se SoccerData falhou → tenta API-Football como fallback
 *   3. Retorna { jogos, fonte, temAoVivo }
 *
 * @param {Function} buscarSoccerData - Função que busca SoccerDataAPI (injetada do router)
 * @returns {Object} { jogos, temAoVivo, fonte }
 */
async function buscarLivescores(buscarSoccerData) {
  // 1. Tentar SoccerDataAPI primeiro (primária)
  try {
    const soccerResult = await buscarSoccerData();

    if (soccerResult.jogos && soccerResult.jogos.length > 0) {
      // SoccerDataAPI respondeu com jogos
      orchestratorState.soccerDataConsecutiveFailures = 0;
      orchestratorState.lastSoccerDataSuccess = Date.now();

      return {
        jogos: soccerResult.jogos,
        temAoVivo: soccerResult.temAoVivo,
        fonte: 'soccerdata'
      };
    }

    // SoccerDataAPI respondeu mas sem jogos brasileiros
    // Pode ser que não há jogos mesmo, ou pode ser falha silenciosa
    // Se não há jogos, não gastar API-Football - pode realmente não ter jogos
    if (soccerResult.jogos && soccerResult.jogos.length === 0) {
      orchestratorState.soccerDataConsecutiveFailures = 0;
      return {
        jogos: [],
        temAoVivo: false,
        fonte: 'soccerdata'
      };
    }
  } catch (err) {
    orchestratorState.soccerDataConsecutiveFailures++;
    console.warn(`[ORQUESTRADOR] SoccerDataAPI falhou (${orchestratorState.soccerDataConsecutiveFailures}x): ${err.message}`);
  }

  // 2. SoccerDataAPI falhou → Tentar API-Football como fallback
  console.log('[ORQUESTRADOR] 🔄 Ativando API-Football como fallback de livescores...');
  const apiFootballResult = await buscarLivescoresViaApiFootball();

  if (apiFootballResult.jogos.length > 0) {
    orchestratorState.lastApiFootballSuccess = Date.now();
    return apiFootballResult;
  }

  // 3. Nenhuma API retornou jogos
  return {
    jogos: [],
    temAoVivo: false,
    fonte: 'nenhuma'
  };
}

/**
 * Busca livescores via API-Football (formato padrão)
 */
async function buscarLivescoresViaApiFootball() {
  const result = await apiFootball.buscarJogosAoVivo();

  if (!result.success || !result.data) {
    return { jogos: [], temAoVivo: false, fonte: 'api-football-error' };
  }

  // Filtrar jogos do Brasil + Copa do Mundo (quando ativa)
  const statusCopa = copaDoMundo.getStatusCopa();
  const copaAtiva = statusCopa.ativo && statusCopa.fase !== 'pre-torneio';

  const jogosFiltrados = result.data.filter(fixture => {
    const pais = (fixture.league?.country || '').toLowerCase();
    const ligaId = fixture.league?.id;
    const ligaNome = fixture.league?.name || '';

    // Sempre incluir jogos brasileiros
    if (pais === 'brazil') return true;

    // Incluir Copa do Mundo quando torneio ativo
    if (copaAtiva && (ligaId === copaDoMundo.LEAGUE_IDS.apiFootball || pais === 'world' || copaDoMundo.isCopaDoMundo(ligaNome))) return true;

    return false;
  });

  // Mapear para formato padrão do sistema
  const jogos = jogosFiltrados.map(fixture => {
    const mapped = mapearFixtureParaFormato(fixture);
    // Marcar jogos de Copa
    if (copaDoMundo.isCopaDoMundo(fixture.league?.name) || fixture.league?.id === copaDoMundo.LEAGUE_IDS.apiFootball) {
      mapped.isCopa = true;
      mapped.bandeirasMandante = copaDoMundo.getBandeira(mapped.mandante);
      mapped.bandeirasVisitante = copaDoMundo.getBandeira(mapped.visitante);
    }
    return mapped;
  });

  const temAoVivo = jogos.some(j => STATUS_AO_VIVO.includes(j.statusRaw));

  return {
    jogos,
    temAoVivo,
    fonte: 'api-football'
  };
}

// ════════════════════════════════════════════════════════════════
// FIXTURES DO DIA (enriquecimento - 1 request/dia)
// ════════════════════════════════════════════════════════════════

/**
 * Busca fixtures do dia via API-Football (chamada econômica: 1x/dia max).
 * Retorna TODOS os jogos brasileiros agendados/em andamento/encerrados.
 *
 * @returns {Object} { jogos, fonte }
 */
async function buscarFixturesDoDia() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // Cache de fixtures do dia (evitar re-fetch)
  if (orchestratorState.fixturesDoDia &&
      orchestratorState.fixturesDoDiaDate === hoje &&
      (Date.now() - orchestratorState.fixturesDoDiaTimestamp) < 4 * 60 * 60 * 1000) { // 4h
    return {
      jogos: orchestratorState.fixturesDoDia,
      fonte: 'api-football-cache',
      cache: true
    };
  }

  const result = await apiFootball.buscarFixturesDoDia(hoje);

  if (!result.success || !result.data) {
    // Se temos cache antigo, retornar
    if (orchestratorState.fixturesDoDia && orchestratorState.fixturesDoDiaDate === hoje) {
      return {
        jogos: orchestratorState.fixturesDoDia,
        fonte: 'api-football-stale',
        cache: true
      };
    }
    return { jogos: [], fonte: 'api-football-error', cache: false };
  }

  // Filtrar Brasil + Copa do Mundo
  const statusCopaFixtures = copaDoMundo.getStatusCopa();
  const copaAtivaFixtures = statusCopaFixtures.ativo && statusCopaFixtures.fase !== 'pre-torneio';

  const jogosFiltradosFixtures = result.data.filter(fixture => {
    const pais = (fixture.league?.country || '').toLowerCase();
    const ligaId = fixture.league?.id;
    const ligaNome = fixture.league?.name || '';

    if (pais === 'brazil') return true;
    if (copaAtivaFixtures && (ligaId === copaDoMundo.LEAGUE_IDS.apiFootball || pais === 'world' || copaDoMundo.isCopaDoMundo(ligaNome))) return true;

    return false;
  });

  const jogos = jogosFiltradosFixtures.map(fixture => {
    const mapped = mapearFixtureParaFormato(fixture);
    if (copaDoMundo.isCopaDoMundo(fixture.league?.name) || fixture.league?.id === copaDoMundo.LEAGUE_IDS.apiFootball) {
      mapped.isCopa = true;
      mapped.bandeirasMandante = copaDoMundo.getBandeira(mapped.mandante);
      mapped.bandeirasVisitante = copaDoMundo.getBandeira(mapped.visitante);
    }
    return mapped;
  });

  // Cachear
  orchestratorState.fixturesDoDia = jogos;
  orchestratorState.fixturesDoDiaDate = hoje;
  orchestratorState.fixturesDoDiaTimestamp = Date.now();

  console.log(`[ORQUESTRADOR] 📅 Fixtures do dia: ${jogos.length} jogos brasileiros`);

  return { jogos, fonte: 'api-football', cache: false };
}

// ════════════════════════════════════════════════════════════════
// EVENTOS & STATS (on-demand, custo: 1 req cada)
// ════════════════════════════════════════════════════════════════

/**
 * Busca eventos de um jogo (gols, cartões, etc.)
 * Custo: 1 request API-Football
 * Chamar SOMENTE quando o usuário clicar em um jogo.
 *
 * @param {number} fixtureId - ID do fixture
 * @returns {Object}
 */
async function buscarEventos(fixtureId) {
  const result = await apiFootball.buscarEventosJogo(fixtureId);

  if (!result.success) {
    return {
      eventos: [],
      error: result.error,
      quotaInfo: result.quotaInfo
    };
  }

  const eventos = (result.data || []).map(evento => ({
    tempo: evento.time?.elapsed || 0,
    tempoExtra: evento.time?.extra || null,
    tipo: mapearTipoEvento(evento.type, evento.detail),
    tipoOriginal: evento.type,
    detalhe: evento.detail,
    jogador: evento.player?.name || null,
    assistencia: evento.assist?.name || null,
    time: evento.team?.name || null,
    timeLogo: evento.team?.logo || null
  }));

  return {
    eventos,
    fonte: 'api-football',
    quotaInfo: result.quotaInfo
  };
}

/**
 * Busca estatísticas de um jogo (posse, chutes, etc.)
 * Custo: 1 request API-Football
 *
 * @param {number} fixtureId - ID do fixture
 * @returns {Object}
 */
async function buscarEstatisticas(fixtureId) {
  const result = await apiFootball.buscarEstatisticasJogo(fixtureId);

  if (!result.success) {
    return {
      stats: null,
      error: result.error,
      quotaInfo: result.quotaInfo
    };
  }

  const statistics = result.data || [];
  if (statistics.length < 2) {
    return { stats: null, error: 'Estatísticas não disponíveis', quotaInfo: result.quotaInfo };
  }

  const getStat = (stats, type) => {
    const stat = stats.find(s => s.type === type);
    return stat?.value ?? null;
  };

  const homeStats = statistics[0]?.statistics || [];
  const awayStats = statistics[1]?.statistics || [];

  return {
    stats: {
      mandante: {
        time: statistics[0]?.team?.name,
        posse: getStat(homeStats, 'Ball Possession'),
        chutesTotal: getStat(homeStats, 'Total Shots'),
        chutesGol: getStat(homeStats, 'Shots on Goal'),
        escanteios: getStat(homeStats, 'Corner Kicks'),
        faltas: getStat(homeStats, 'Fouls'),
        impedimentos: getStat(homeStats, 'Offsides'),
        defesas: getStat(homeStats, 'Goalkeeper Saves')
      },
      visitante: {
        time: statistics[1]?.team?.name,
        posse: getStat(awayStats, 'Ball Possession'),
        chutesTotal: getStat(awayStats, 'Total Shots'),
        chutesGol: getStat(awayStats, 'Shots on Goal'),
        escanteios: getStat(awayStats, 'Corner Kicks'),
        faltas: getStat(awayStats, 'Fouls'),
        impedimentos: getStat(awayStats, 'Offsides'),
        defesas: getStat(awayStats, 'Goalkeeper Saves')
      }
    },
    fonte: 'api-football',
    quotaInfo: result.quotaInfo
  };
}

// ════════════════════════════════════════════════════════════════
// STATUS CONSOLIDADO (para dashboard admin)
// ════════════════════════════════════════════════════════════════

/**
 * Retorna status consolidado de todas as fontes de dados
 */
function getStatusConsolidado() {
  const apiFootballStatus = apiFootball.getStatus();

  return {
    orquestrador: {
      initialized: orchestratorState.initialized,
      soccerDataConsecutiveFailures: orchestratorState.soccerDataConsecutiveFailures,
      lastSoccerDataSuccess: orchestratorState.lastSoccerDataSuccess
        ? new Date(orchestratorState.lastSoccerDataSuccess).toISOString()
        : null,
      lastApiFootballSuccess: orchestratorState.lastApiFootballSuccess
        ? new Date(orchestratorState.lastApiFootballSuccess).toISOString()
        : null,
      fixturesDoDia: {
        cached: !!orchestratorState.fixturesDoDia,
        date: orchestratorState.fixturesDoDiaDate,
        count: orchestratorState.fixturesDoDia?.length || 0,
        age: orchestratorState.fixturesDoDiaTimestamp
          ? Math.round((Date.now() - orchestratorState.fixturesDoDiaTimestamp) / 60000) + ' min'
          : null
      }
    },
    apiFootball: apiFootballStatus
  };
}

// ════════════════════════════════════════════════════════════════
// MAPEAMENTO DE DADOS (API-Football → formato padrão)
// ════════════════════════════════════════════════════════════════

/**
 * Mapeia um fixture da API-Football v3 para o formato padrão do sistema
 */
function mapearFixtureParaFormato(fixture) {
  const statusRaw = mapearStatusApiFootball(fixture.fixture?.status?.short);
  const goalsHome = fixture.goals?.home ?? 0;
  const goalsAway = fixture.goals?.away ?? 0;

  return {
    id: fixture.fixture?.id,
    mandante: fixture.teams?.home?.name || 'TBD',
    visitante: fixture.teams?.away?.name || 'TBD',
    logoMandante: fixture.teams?.home?.logo || null,
    logoVisitante: fixture.teams?.away?.logo || null,
    golsMandante: goalsHome,
    golsVisitante: goalsAway,
    placar: STATUS_AO_VIVO.includes(statusRaw) || STATUS_ENCERRADO.includes(statusRaw)
      ? `${goalsHome} x ${goalsAway}`
      : 'vs',
    placarHT: fixture.score?.halftime?.home !== null
      ? `${fixture.score.halftime.home} x ${fixture.score.halftime.away}`
      : null,
    tempo: fixture.fixture?.status?.elapsed || '',
    tempoExtra: fixture.fixture?.status?.extra || null,
    status: mapearStatusTexto(statusRaw),
    statusRaw,
    liga: fixture.league?.name || 'Liga Brasileira',
    ligaId: fixture.league?.id || null,
    ligaOriginal: fixture.league?.name,
    ligaLogo: fixture.league?.logo || null,
    estadio: fixture.fixture?.venue?.name || null,
    cidade: fixture.fixture?.venue?.city || null,
    horario: fixture.fixture?.date
      ? new Date(fixture.fixture.date).toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '--:--',
    timestamp: fixture.fixture?.timestamp ? fixture.fixture.timestamp * 1000 : Date.now(),
    fonte: 'api-football'
  };
}

function mapearStatusApiFootball(statusShort) {
  const mapa = {
    'TBD': 'TBD', 'NS': 'NS', 'PST': 'PST', 'CANC': 'CANC',
    '1H': '1H', 'HT': 'HT', '2H': '2H', 'ET': 'ET', 'BT': 'BT', 'P': 'P',
    'SUSP': 'SUSP', 'INT': 'INT',
    'FT': 'FT', 'AET': 'AET', 'PEN': 'PEN',
    'ABD': 'ABD', 'AWD': 'AWD', 'WO': 'WO',
    'LIVE': 'LIVE'
  };
  return mapa[statusShort] || statusShort || 'NS';
}

function mapearStatusTexto(statusRaw) {
  const mapa = {
    '1H': 'Ao vivo - 1o tempo', '2H': 'Ao vivo - 2o tempo',
    'HT': 'Intervalo', 'ET': 'Prorrogacao', 'P': 'Penaltis',
    'BT': 'Intervalo Prorrog.', 'SUSP': 'Suspenso', 'INT': 'Interrompido',
    'FT': 'Encerrado', 'AET': 'Encerrado (Prorrog.)', 'PEN': 'Encerrado (Pen.)',
    'NS': 'Agendado', 'TBD': 'A definir', 'PST': 'Adiado',
    'CANC': 'Cancelado', 'ABD': 'Abandonado', 'AWD': 'W.O.', 'WO': 'W.O.',
    'LIVE': 'Ao vivo'
  };
  return mapa[statusRaw] || statusRaw;
}

function mapearTipoEvento(type, detail) {
  const mapa = {
    'Goal': detail === 'Penalty' ? 'gol_penalti' : detail === 'Own Goal' ? 'gol_contra' : 'gol',
    'Card': detail === 'Yellow Card' ? 'cartao_amarelo' : detail === 'Red Card' ? 'cartao_vermelho' : 'cartao_segundo_amarelo',
    'subst': 'substituicao',
    'Var': 'var'
  };
  return mapa[type] || type?.toLowerCase() || 'outro';
}

// ════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════

export default {
  init,
  buscarLivescores,
  buscarFixturesDoDia,
  buscarEventos,
  buscarEstatisticas,
  getStatusConsolidado,
  apiFootball
};

export {
  init,
  buscarLivescores,
  buscarFixturesDoDia,
  buscarEventos,
  buscarEstatisticas,
  getStatusConsolidado,
  apiFootball
};
