// routes/jogos-ao-vivo-routes.js
// v5.0 - API-Football reativada como SECUNDÁRIA com proteções anti-ban
// v4.3 - TTL dinâmico blindado para jogos ao vivo
// ✅ v5.0: API-FOOTBALL REATIVADA como SECUNDÁRIA via orquestrador multi-API
//          Proteções: circuit breaker, rate limiter, quota tracker MongoDB, hard cap 90/dia
//          Eventos de jogo reativados (on-demand via API-Football)
// ✅ v4.3: TTL DINÂMICO BLINDADO - Cache da agenda usa 30s com jogos ao vivo, 5min sem
//          Proteção: verifica jogos ao vivo no cache antigo e força refresh
// ✅ v4.2: Campo atualizadoEm (ISO timestamp) em todas as respostas para exibir no frontend
// ✅ v4.1: CACHE_TTL_AO_VIVO reduzido de 2min para 30s (melhora experiência ao vivo)
//          Resolve: usuários reclamaram de demora excessiva na atualização de placares
// ✅ v4.0: Busca agenda do dia do ge.globo.com (SSR data) e mescla com livescores
//          Resolve: jogos agendados apareciam como "Sem jogos" quando SoccerDataAPI retornava vazio
// ✅ v3.6: Cache invalida automaticamente quando data muda (virou o dia)
//          Corrige bug: jogos de ontem apareciam hoje
// ✅ v3.5: SoccerDataAPI - fallback entre API-Football e Cache Stale
// ✅ v3.4: Cache stale - quando API falhar, usa ultimo cache valido com aviso
// ✅ v3.3: Fix LIGAS_PRINCIPAIS - removido IDs de estaduais (variam entre temporadas)
//          Estaduais tratados via formatarNomeLiga() por nome
// ✅ v3.2: Nomes populares de estaduais (Paulistão, Cariocão, etc)
//          + resumoStats para modal com tabs
// ✅ v3.1: Correção do mapeamento de ligas brasileiras (IDs corretos)
// ✅ v3.0: Campos extras: golsMandante, golsVisitante, placarHT, estadio, cidade, tempoExtra
// ✅ v3.0: Nova rota GET /:fixtureId/eventos para buscar gols, cartoes, escalacoes
// ✅ v2.0: Cache inteligente - 2min com jogos ao vivo, 10min sem jogos ao vivo
import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import obterJogosGloboEsporte, { obterJogosGloboMultiDatas } from '../scripts/scraper-jogos-globo.js';
import apiOrchestrator from '../services/api-orchestrator.js';
import copaDoMundo from '../config/copa-do-mundo-2026.js';

const router = express.Router();

// ┌──────────────────────────────────────────────────────────────────────┐
// │ MAPEAMENTO DE LIGAS - IDs ESTÁVEIS DA API-FOOTBALL                   │
// │ Documentação: docs/JOGOS-DO-DIA-API.md                               │
// ├──────────────────────────────────────────────────────────────────────┤
// │ APENAS ligas com IDs que NÃO mudam entre temporadas.                 │
// │                                                                      │
// │ ⚠️  ESTADUAIS NÃO DEVEM SER ADICIONADOS AQUI!                        │
// │     IDs de estaduais VARIAM a cada temporada na API-Football.        │
// │     Tratá-los via formatarNomeLiga() pelo NOME, não pelo ID.         │
// │                                                                      │
// │ Exemplo de problema se adicionar estaduais:                          │
// │   - 2025: Cariocão tinha ID 123                                      │
// │   - 2026: Cariocão passou a ter ID 456                               │
// │   - Resultado: mapeamento quebra silenciosamente                     │
// └──────────────────────────────────────────────────────────────────────┘
const LIGAS_PRINCIPAIS = {
  1: 'Copa do Mundo',           // ⚽ FIFA World Cup 2026
  71: 'Brasileirão A',
  72: 'Brasileirão B',
  73: 'Copa do Brasil',
  75: 'Série C',
  76: 'Série D',
  77: 'Supercopa',
  618: 'Copinha'
  // ⛔ NÃO adicionar estaduais - usar formatarNomeLiga() para eles
};

/**
 * Formata nome da liga da API para exibicao amigavel
 * Trata padroes da API-Football como "Paulista - A1", "Carioca - 1"
 *
 * @param {string} nome - Nome original da API
 * @returns {string} Nome formatado para exibicao
 */
function formatarNomeLiga(nome) {
  if (!nome) return 'Liga Brasileira';

  // Mapeamentos especiais de nome (prioridade maxima)
  const mapeamentos = {
    // Copa do Mundo FIFA 2026
    'FIFA World Cup': 'Copa do Mundo',
    'World Cup': 'Copa do Mundo',
    'FIFA World Cup 2026': 'Copa do Mundo',
    'Copa do Mundo FIFA': 'Copa do Mundo',
    'Copa do Mundo FIFA 2026': 'Copa do Mundo',
    'Coupe du Monde': 'Copa do Mundo',
    // Copas e nomes em ingles
    'São Paulo Youth Cup': 'Copinha',
    'Copa Sao Paulo de Futebol Junior': 'Copinha',
    'Brazil Serie A': 'Brasileirão A',
    'Brazil Serie B': 'Brasileirão B',
    'Brazil Serie C': 'Série C',
    'Brazil Serie D': 'Série D',
    'Brazil Cup': 'Copa do Brasil',
    'Copa do Nordeste': 'Copa do Nordeste',
    'Supercopa do Brasil': 'Supercopa'
  };

  // Verificar mapeamento exato primeiro
  if (mapeamentos[nome]) return mapeamentos[nome];

  // Transformacoes em cadeia para padroes da API
  let resultado = nome
    // Remover prefixos
    .replace(/^Brazil(ian)?\s+/i, '')
    .replace(/^Campeonato\s+/i, '')

    // Tratar divisoes - remover sufixos de primeira divisao
    .replace(/\s+-\s+1$/, '')           // "Mineiro - 1" → "Mineiro"
    .replace(/\s+-\s+A1$/i, '')         // "Paulista - A1" → "Paulista"
    .replace(/\s+-\s+2$/, ' B')         // "Mineiro - 2" → "Mineiro B"
    .replace(/\s+-\s+A2$/i, ' A2')      // "Paulista - A2" → "Paulista A2"
    .replace(/\s+-\s+B$/i, ' B')

    .trim();

  // Aplicar nomes populares apos limpeza
  const nomesPopulares = {
    'Paulista': 'Paulistão',
    'Carioca': 'Cariocão',
    'Gaucho': 'Gauchão',
    'Gaúcho': 'Gauchão',
    'Mineiro': 'Mineirão',
    'Baiano': 'Baianão',
    'Pernambucano': 'Pernambucano',
    'Cearense': 'Cearense',
    'Paranaense': 'Paranaense',
    'Catarinense': 'Catarinense',
    'Goiano': 'Goianão',
    'Sergipano': 'Sergipano',
    'Paraibano': 'Paraibano',
    'Potiguar': 'Potiguar',
    'Alagoano': 'Alagoano',
    'Maranhense': 'Maranhense',
    'Piauiense': 'Piauiense',
    'Amazonense': 'Amazonense',
    'Paraense': 'Paraense',
    'Capixaba': 'Capixaba',
    'Brasiliense': 'Brasiliense'
  };

  return nomesPopulares[resultado] || resultado || 'Liga Brasileira';
}

/**
 * Retorna nome da liga: primeiro tenta mapeamento fixo, senão formata o original
 */
function getNomeLiga(ligaId, nomeOriginal) {
  return LIGAS_PRINCIPAIS[ligaId] || formatarNomeLiga(nomeOriginal);
}

// Status que indicam jogo ao vivo
const STATUS_AO_VIVO = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const STATUS_ENCERRADO = ['FT', 'AET', 'PEN'];
const STATUS_AGENDADO = ['NS', 'TBD'];

// Cache inteligente
let cacheJogosDia = null;
let cacheTimestamp = 0;
let cacheTemJogosAoVivo = false;
let cacheFonte = 'soccerdata'; // ✅ Fonte do cache atual (SoccerDataAPI agora é PRINCIPAL)
let cacheDataReferencia = null;  // ✅ v3.5: Data de referência do cache (YYYY-MM-DD)

// TTL dinâmico baseado em jogos ao vivo
const CACHE_TTL_AO_VIVO = 30 * 1000;        // 30 segundos se tem jogos ao vivo (reduzido de 2min)
const CACHE_TTL_SEM_JOGOS = 10 * 60 * 1000; // 10 minutos se não tem jogos ao vivo
const CACHE_STALE_MAX = 30 * 60 * 1000;     // 30 minutos máximo para cache stale

// Path do scraper Globo (fallback legado - arquivo JSON)
const GLOBO_CACHE_PATH = path.join(process.cwd(), 'data', 'jogos-globo.json');

// ✅ v4.3: Cache da agenda com TTL DINÂMICO (blindagem para jogos ao vivo)
let cacheAgendaDia = null;
let cacheAgendaTimestamp = 0;
let cacheAgendaDataRef = null;
let cacheAgendaTemAoVivo = false; // 🛡️ BLINDAGEM: marca se cache tem jogos ao vivo

// TTLs da agenda (dinâmico baseado em jogos ao vivo)
const CACHE_AGENDA_TTL_AO_VIVO = 30 * 1000;      // 30 segundos com jogos ao vivo
const CACHE_AGENDA_TTL_SEM_JOGOS = 5 * 60 * 1000; // 5 minutos sem jogos ao vivo

// ✅ v4.1: Cache de jogos do mês (multi-datas ge.globo.com)
let cacheMesDados = null;
let cacheMesTimestamp = 0;
const CACHE_MES_TTL = 4 * 60 * 60 * 1000; // 4 horas

/**
 * 🛡️ BLINDAGEM: Verifica se há jogos ao vivo em um array de jogos
 */
function temJogosAoVivoNoArray(jogos) {
  if (!jogos || !Array.isArray(jogos)) return false;
  return jogos.some(j => STATUS_AO_VIVO.includes(j.statusRaw));
}

/**
 * 🛡️ BLINDAGEM: Calcula TTL dinâmico baseado em jogos ao vivo
 * - Com jogos ao vivo: 30 segundos (atualização frequente)
 * - Sem jogos ao vivo: 5 minutos (economia de recursos)
 */
function calcularTTLAgenda() {
  return cacheAgendaTemAoVivo ? CACHE_AGENDA_TTL_AO_VIVO : CACHE_AGENDA_TTL_SEM_JOGOS;
}

/**
 * Busca agenda do dia do ge.globo.com com TTL DINÂMICO BLINDADO
 * 🛡️ PROTEÇÃO: TTL varia automaticamente baseado em jogos ao vivo
 * Retorna jogos no formato padrão (compatível com SoccerDataAPI)
 */
async function buscarAgendaDoDia() {
  const agora = Date.now();
  const dataHoje = getDataHoje();

  // Invalidar cache se a data mudou
  if (cacheAgendaDataRef && cacheAgendaDataRef !== dataHoje) {
    console.log(`[JOGOS-DIA] 🔄 Data mudou (${cacheAgendaDataRef} → ${dataHoje}) - invalidando cache agenda`);
    cacheAgendaDia = null;
    cacheAgendaTimestamp = 0;
    cacheAgendaDataRef = null;
    cacheAgendaTemAoVivo = false;
  }

  // 🛡️ BLINDAGEM: Calcular TTL dinâmico baseado em jogos ao vivo
  const ttlAtual = calcularTTLAgenda();
  const cacheValido = cacheAgendaDia && (agora - cacheAgendaTimestamp) < ttlAtual;

  if (cacheValido) {
    const idadeSegundos = Math.round((agora - cacheAgendaTimestamp) / 1000);
    console.log(`[JOGOS-DIA] 📦 Cache agenda válido (${idadeSegundos}s/${ttlAtual/1000}s, aoVivo=${cacheAgendaTemAoVivo})`);
    return cacheAgendaDia;
  }

  try {
    console.log(`[JOGOS-DIA] 🔄 Buscando agenda via ge.globo.com (TTL=${ttlAtual/1000}s)...`);
    const jogos = await obterJogosGloboEsporte(dataHoje);

    // 🛡️ BLINDAGEM: Detectar se há jogos ao vivo para ajustar TTL da próxima vez
    const temAoVivo = temJogosAoVivoNoArray(jogos);

    cacheAgendaDia = jogos;
    cacheAgendaTimestamp = agora;
    cacheAgendaDataRef = dataHoje;
    cacheAgendaTemAoVivo = temAoVivo; // 🛡️ Atualiza flag de blindagem

    const proximoTTL = temAoVivo ? CACHE_AGENDA_TTL_AO_VIVO : CACHE_AGENDA_TTL_SEM_JOGOS;
    console.log(`[JOGOS-DIA] ✅ Agenda ge.globo.com: ${jogos.length} jogos (aoVivo=${temAoVivo}, próximoTTL=${proximoTTL/1000}s)`);

    return jogos;
  } catch (err) {
    console.error('[JOGOS-DIA] ❌ Erro ao buscar agenda ge.globo.com:', err.message);
    // Retornar cache stale se disponível
    if (cacheAgendaDia) {
      console.log('[JOGOS-DIA] ⚠️ Usando cache stale da agenda');
      return cacheAgendaDia;
    }
    return [];
  }
}

/**
 * Normaliza nome de time para comparação (lowercase, sem acentos)
 */
function normalizarNome(nome) {
  if (!nome) return '';
  return nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

/**
 * Mescla jogos ao vivo (SoccerDataAPI) com agenda do dia (Globo)
 * - Jogos ao vivo têm prioridade (dados mais ricos: placar, tempo, etc.)
 * - Jogos da agenda que não existem no ao vivo são adicionados como agendados
 *
 * @param {Array} jogosAoVivo - Jogos da SoccerDataAPI (ao vivo + encerrados)
 * @param {Array} jogosAgenda - Jogos da agenda ge.globo.com
 * @returns {Array} Array mesclado sem duplicatas
 */
function mesclarJogos(jogosAoVivo, jogosAgenda) {
  if (!jogosAgenda || jogosAgenda.length === 0) return jogosAoVivo;
  if (!jogosAoVivo || jogosAoVivo.length === 0) return jogosAgenda;

  // Criar set de jogos ao vivo normalizados para lookup
  const aoVivoSet = new Set();
  for (const j of jogosAoVivo) {
    const key = normalizarNome(j.mandante) + ' x ' + normalizarNome(j.visitante);
    aoVivoSet.add(key);
  }

  // Adicionar jogos da agenda que NÃO existem no ao vivo
  const jogosExtras = [];
  for (const j of jogosAgenda) {
    const key = normalizarNome(j.mandante) + ' x ' + normalizarNome(j.visitante);
    if (!aoVivoSet.has(key)) {
      jogosExtras.push(j);
    }
  }

  const mesclado = [...jogosAoVivo, ...jogosExtras];

  // Re-ordenar: ao vivo primeiro, depois agendados, depois encerrados
  mesclado.sort((a, b) => {
    const aVivo = STATUS_AO_VIVO.includes(a.statusRaw) ? 0 : 1;
    const bVivo = STATUS_AO_VIVO.includes(b.statusRaw) ? 0 : 1;
    if (aVivo !== bVivo) return aVivo - bVivo;

    const aEncerrado = STATUS_ENCERRADO.includes(a.statusRaw) ? 1 : 0;
    const bEncerrado = STATUS_ENCERRADO.includes(b.statusRaw) ? 1 : 0;
    if (aEncerrado !== bEncerrado) return aEncerrado - bEncerrado;

    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  return mesclado;
}

/**
 * Retorna a data atual no formato YYYY-MM-DD (timezone São Paulo)
 */
function getDataHoje() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * ❌ API-FOOTBALL REMOVIDA - Usuário banido
 * Função desativada. SoccerDataAPI agora é a fonte principal.
 */
// async function buscarJogosDoDia() { ... CÓDIGO REMOVIDO ... }

/**
 * ✅ API-FOOTBALL REATIVADA (v5.0) - Eventos de jogo via orquestrador
 * Endpoint: GET /api/jogos-ao-vivo/:fixtureId/eventos
 * Custo: 1 request API-Football (on-demand, baixa prioridade)
 */
async function buscarEventosJogoViaOrquestrador(fixtureId) {
  try {
    const result = await apiOrchestrator.buscarEventos(fixtureId);
    return result;
  } catch (err) {
    console.error('[JOGOS-DIA] Erro ao buscar eventos:', err.message);
    return { eventos: [], error: err.message };
  }
}

/**
 * Mapeia tipo de evento para icone/texto
 */
function mapearTipoEvento(type, detail) {
  const mapa = {
    'Goal': detail === 'Penalty' ? 'gol_penalti' : detail === 'Own Goal' ? 'gol_contra' : 'gol',
    'Card': detail === 'Yellow Card' ? 'cartao_amarelo' : detail === 'Red Card' ? 'cartao_vermelho' : 'cartao_segundo_amarelo',
    'subst': 'substituicao',
    'Var': 'var'
  };
  return mapa[type] || type.toLowerCase();
}

/**
 * Extrai resumo das estatisticas principais para exibicao no modal
 * @param {Array} statistics - Array de estatisticas da API
 * @returns {Object|null} Objeto com stats organizadas por time ou null
 */
function extrairResumoStats(statistics) {
  if (!statistics || statistics.length < 2) return null;

  const homeStats = statistics[0]?.statistics || [];
  const awayStats = statistics[1]?.statistics || [];

  /**
   * Busca valor de uma estatistica especifica
   */
  const getStat = (stats, type) => {
    const stat = stats.find(s => s.type === type);
    return stat?.value ?? null;
  };

  return {
    mandante: {
      posse: getStat(homeStats, 'Ball Possession'),
      chutesTotal: getStat(homeStats, 'Total Shots'),
      chutesGol: getStat(homeStats, 'Shots on Goal'),
      escanteios: getStat(homeStats, 'Corner Kicks'),
      faltas: getStat(homeStats, 'Fouls'),
      impedimentos: getStat(homeStats, 'Offsides'),
      defesas: getStat(homeStats, 'Goalkeeper Saves')
    },
    visitante: {
      posse: getStat(awayStats, 'Ball Possession'),
      chutesTotal: getStat(awayStats, 'Total Shots'),
      chutesGol: getStat(awayStats, 'Shots on Goal'),
      escanteios: getStat(awayStats, 'Corner Kicks'),
      faltas: getStat(awayStats, 'Fouls'),
      impedimentos: getStat(awayStats, 'Offsides'),
      defesas: getStat(awayStats, 'Goalkeeper Saves')
    }
  };
}

/**
 * Mapeia status da API para texto amigável
 */
function mapearStatus(status) {
  const mapa = {
    '1H': 'Ao vivo - 1º tempo',
    '2H': 'Ao vivo - 2º tempo',
    'HT': 'Intervalo',
    'ET': 'Prorrogação',
    'P': 'Pênaltis',
    'BT': 'Intervalo Prorrog.',
    'SUSP': 'Suspenso',
    'INT': 'Interrompido',
    'FT': 'Encerrado',
    'AET': 'Encerrado (Prorrog.)',
    'PEN': 'Encerrado (Pên.)',
    'NS': 'Agendado',
    'TBD': 'A definir',
    'PST': 'Adiado',
    'CANC': 'Cancelado',
    'ABD': 'Abandonado',
    'AWD': 'W.O.',
    'WO': 'W.O.',
    'LIVE': 'Ao vivo'
  };
  return mapa[status] || status;
}

/**
 * Busca jogos do dia do scraper Globo (fallback)
 */
async function buscarJogosGlobo() {
  try {
    const raw = await fs.readFile(GLOBO_CACHE_PATH, 'utf-8');
    const jogos = JSON.parse(raw);
    return jogos.map(j => ({
      ...j,
      status: j.status || 'Agendado',
      statusRaw: 'NS',
      fonte: 'globo'
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Busca jogos ao vivo do SoccerDataAPI (fallback secundário)
 * Free tier: 75 req/dia, sem cartão de crédito
 * Cobre: Brasileirão A, B e outras ligas
 */
async function buscarJogosSoccerDataAPI() {
  const apiKey = process.env.SOCCERDATA_API_KEY;
  if (!apiKey) {
    console.warn('[JOGOS-DIA] SOCCERDATA_API_KEY não configurada');
    return { jogos: [], temAoVivo: false };
  }

  try {
    const url = `https://api.soccerdataapi.com/livescores/?auth_token=${apiKey}`;

    console.log('[JOGOS-DIA] Tentando SoccerDataAPI...');

    const response = await fetch(url, {
      headers: {
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (!response.ok) {
      console.error(`[JOGOS-DIA] SoccerDataAPI erro HTTP: ${response.status}`);
      return { jogos: [], temAoVivo: false };
    }

    const data = await response.json();

    // A API retorna array de jogos ou objeto com 'data'
    const jogosRaw = Array.isArray(data) ? data : (data.data || []);

    // Filtrar jogos do Brasil + Copa do Mundo (quando ativa)
    const statusCopa = copaDoMundo.getStatusCopa();
    const copaAtiva = statusCopa.ativo && statusCopa.fase !== 'pre-torneio';

    const jogosFiltrados = jogosRaw.filter(jogo => {
      const pais = (jogo.country || jogo.league_country || '').toLowerCase();
      const liga = jogo.league || jogo.league_name || '';

      // Sempre incluir jogos brasileiros
      if (pais === 'brazil' || pais === 'brasil') return true;

      // Incluir Copa do Mundo quando torneio ativo
      if (copaAtiva && (pais === 'world' || copaDoMundo.isCopaDoMundo(liga))) return true;

      return false;
    });

    // Marcar jogos de Copa com flag isCopa
    jogosFiltrados.forEach(jogo => {
      const liga = jogo.league || jogo.league_name || '';
      if (copaDoMundo.isCopaDoMundo(liga)) {
        jogo._isCopa = true;
      }
    });

    console.log(`[JOGOS-DIA] SoccerDataAPI: ${jogosFiltrados.length} jogos (Brasil + Copa)`);

    if (jogosFiltrados.length === 0) {
      return { jogos: [], temAoVivo: false };
    }

    // Mapear para formato padrão
    const jogos = jogosFiltrados.map(jogo => {
      const statusRaw = mapearStatusSoccerData(jogo.status || jogo.match_status);

      return {
        id: jogo.match_id || jogo.id,
        mandante: jogo.home_team || jogo.home_name,
        visitante: jogo.away_team || jogo.away_name,
        logoMandante: jogo.home_logo || null,
        logoVisitante: jogo.away_logo || null,
        golsMandante: parseInt(jogo.home_score || jogo.home_goals || 0),
        golsVisitante: parseInt(jogo.away_score || jogo.away_goals || 0),
        placar: `${jogo.home_score || 0} x ${jogo.away_score || 0}`,
        placarHT: jogo.ht_score || null,
        tempo: jogo.elapsed || jogo.minute || '',
        tempoExtra: null,
        status: mapearStatus(statusRaw),
        statusRaw,
        liga: formatarNomeLiga(jogo.league || jogo.league_name),
        ligaId: jogo.league_id || null,
        ligaOriginal: jogo.league || jogo.league_name,
        ligaLogo: jogo.league_logo || null,
        estadio: jogo.stadium || jogo.venue || null,
        cidade: jogo.city || null,
        horario: jogo.time || jogo.match_time || '--:--',
        timestamp: jogo.timestamp ? jogo.timestamp * 1000 : Date.now(),
        fonte: 'soccerdata',
        isCopa: !!jogo._isCopa,
      };
    });

    // Ordenar: Ao vivo primeiro, depois agendados, depois encerrados
    jogos.sort((a, b) => {
      const aVivo = STATUS_AO_VIVO.includes(a.statusRaw) ? 0 : 1;
      const bVivo = STATUS_AO_VIVO.includes(b.statusRaw) ? 0 : 1;
      if (aVivo !== bVivo) return aVivo - bVivo;

      const aEncerrado = STATUS_ENCERRADO.includes(a.statusRaw) ? 1 : 0;
      const bEncerrado = STATUS_ENCERRADO.includes(b.statusRaw) ? 1 : 0;
      if (aEncerrado !== bEncerrado) return aEncerrado - bEncerrado;

      return a.timestamp - b.timestamp;
    });

    const temAoVivo = jogos.some(j => STATUS_AO_VIVO.includes(j.statusRaw));

    return { jogos, temAoVivo };
  } catch (err) {
    console.error('[JOGOS-DIA] SoccerDataAPI erro:', err.message);
    return { jogos: [], temAoVivo: false };
  }
}

/**
 * Mapeia status do SoccerDataAPI para padrão API-Football
 */
function mapearStatusSoccerData(status) {
  if (!status) return 'NS';

  const s = status.toLowerCase();

  if (s.includes('live') || s.includes('playing') || s === '1h') return '1H';
  if (s === '2h' || s.includes('second')) return '2H';
  if (s.includes('half') || s === 'ht') return 'HT';
  if (s.includes('finished') || s.includes('ended') || s === 'ft') return 'FT';
  if (s.includes('postponed')) return 'PST';
  if (s.includes('cancelled') || s.includes('canceled')) return 'CANC';
  if (s.includes('scheduled') || s.includes('not started') || s === 'ns') return 'NS';
  if (s.includes('extra')) return 'ET';
  if (s.includes('penalty') || s.includes('penalties')) return 'P';

  return 'NS';
}

/**
 * Calcula estatísticas dos jogos
 */
function calcularEstatisticas(jogos) {
  return {
    total: jogos.length,
    aoVivo: jogos.filter(j => STATUS_AO_VIVO.includes(j.statusRaw)).length,
    agendados: jogos.filter(j => STATUS_AGENDADO.includes(j.statusRaw)).length,
    encerrados: jogos.filter(j => STATUS_ENCERRADO.includes(j.statusRaw)).length
  };
}

// ✅ v3.6: Rota para limpar cache manualmente
// DELETE /api/jogos-ao-vivo/cache
router.delete('/cache', (req, res) => {
  const cacheAnterior = {
    dataReferencia: cacheDataReferencia,
    timestamp: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null,
    qtdJogos: cacheJogosDia?.length || 0
  };

  // Limpar todas as variáveis de cache (livescores + agenda + mês)
  cacheJogosDia = null;
  cacheTimestamp = 0;
  cacheTemJogosAoVivo = false;
  cacheDataReferencia = null;
  cacheAgendaDia = null;
  cacheAgendaTimestamp = 0;
  cacheAgendaDataRef = null;
  cacheAgendaTemAoVivo = false; // 🛡️ Reset blindagem
  cacheMesDados = null;
  cacheMesTimestamp = 0;

  console.log('[JOGOS-DIA] 🧹 Cache limpo manualmente (livescores + agenda + mês + blindagem)');

  res.json({
    sucesso: true,
    mensagem: 'Cache limpo com sucesso',
    cacheAnterior,
    dataAtual: getDataHoje()
  });
});

// ════════════════════════════════════════════════════════════════
// COPA DO MUNDO 2026 - Dados para seção separada
// ════════════════════════════════════════════════════════════════

/**
 * Monta dados da Copa do Mundo para o frontend (seção separada).
 * Retorna null se Copa não está ativa, ou objeto com jogos e metadados.
 *
 * Fontes:
 *   - Pré-torneio: JSON estático (config/copa-do-mundo-2026.js)
 *   - Durante torneio: Mesclagem de APIs ao vivo + estático como fallback
 *
 * @param {string} dataHoje - Data YYYY-MM-DD
 * @param {Array} [jogosAoVivoAll] - Todos os jogos ao vivo (para extrair Copa live)
 * @returns {Object|null}
 */
function montarDadosCopa(dataHoje, jogosAoVivoAll = []) {
  const statusCopa = copaDoMundo.getStatusCopa(dataHoje);

  if (!statusCopa.ativo) return null;

  // Extrair jogos de Copa que vieram de APIs ao vivo
  const jogosCopaLive = jogosAoVivoAll.filter(j => j.isCopa || copaDoMundo.isCopaDoMundo(j.liga || j.ligaOriginal));

  // Jogos estáticos do dia (pré-torneio ou fallback)
  const jogosCopaStatic = copaDoMundo.getJogosDoDia(dataHoje);

  // Mesclar: ao vivo têm prioridade sobre estáticos
  let jogosCopa;
  if (jogosCopaLive.length > 0) {
    // Marcar todos com isCopa e bandeiras
    jogosCopaLive.forEach(j => {
      j.isCopa = true;
      if (!j.bandeirasMandante) j.bandeirasMandante = copaDoMundo.getBandeira(j.mandante);
      if (!j.bandeirasVisitante) j.bandeirasVisitante = copaDoMundo.getBandeira(j.visitante);
    });
    jogosCopa = mesclarJogos(jogosCopaLive, jogosCopaStatic);
  } else {
    jogosCopa = jogosCopaStatic;
  }

  // Próximos jogos (para pré-torneio quando não há jogos hoje)
  const proximosJogos = jogosCopa.length === 0 ? copaDoMundo.getProximosJogos(6) : [];

  // Jogos do Brasil
  const jogosBrasil = copaDoMundo.getJogosBrasil();

  return {
    fase: statusCopa.fase,
    grupos: copaDoMundo.GRUPOS,
    jogosDoDia: jogosCopa,
    proximosJogos,
    jogosBrasil,
    temAoVivo: jogosCopa.some(j => STATUS_AO_VIVO.includes(j.statusRaw)),
  };
}

// GET /api/jogos-ao-vivo
router.get('/', async (req, res) => {
  try {
    const agora = Date.now();
    const dataHoje = getDataHoje();

    // ✅ v3.5: Invalidar cache se a data mudou (virou o dia)
    if (cacheDataReferencia && cacheDataReferencia !== dataHoje) {
      console.log(`[JOGOS-DIA] Data mudou de ${cacheDataReferencia} para ${dataHoje} - invalidando cache`);
      cacheJogosDia = null;
      cacheTimestamp = 0;
      cacheDataReferencia = null;
    }

    // Calcular TTL baseado em jogos ao vivo
    const ttlAtual = cacheTemJogosAoVivo ? CACHE_TTL_AO_VIVO : CACHE_TTL_SEM_JOGOS;
    const cacheValido = cacheJogosDia && (agora - cacheTimestamp) < ttlAtual;
    const cacheStaleValido = cacheJogosDia && (agora - cacheTimestamp) < CACHE_STALE_MAX;

    // Copa do Mundo 2026 - dados para seção separada (calculado sempre)
    const copa = montarDadosCopa(dataHoje, cacheJogosDia || []);

    // 1º Cache válido (fresh)
    if (cacheValido) {
      const stats = calcularEstatisticas(cacheJogosDia);
      return res.json({
        jogos: cacheJogosDia,
        fonte: cacheFonte,
        aoVivo: cacheTemJogosAoVivo,
        estatisticas: stats,
        cache: true,
        ttl: ttlAtual / 1000,
        atualizadoEm: new Date(cacheTimestamp).toISOString(),
        copa,
      });
    }

    // 2º Buscar SoccerDataAPI + Agenda do Globo em paralelo
    // Se SoccerDataAPI falhar, orquestrador ativa API-Football como fallback
    console.log('[JOGOS-DIA] Buscando SoccerDataAPI + agenda ge.globo.com em paralelo...');

    const [livescoresResult, jogosAgenda] = await Promise.all([
      apiOrchestrator.buscarLivescores(buscarJogosSoccerDataAPI),
      buscarAgendaDoDia()
    ]);

    const soccerData = {
      jogos: livescoresResult.jogos || [],
      temAoVivo: livescoresResult.temAoVivo || false
    };
    const livescoreFonte = livescoresResult.fonte || 'nenhuma';

    // 3º Mesclar livescores com agenda (livescores têm prioridade)
    const jogosMesclados = mesclarJogos(soccerData.jogos, jogosAgenda);

    if (jogosMesclados.length > 0) {
      const temAoVivo = jogosMesclados.some(j => STATUS_AO_VIVO.includes(j.statusRaw));
      const fontePrincipal = soccerData.jogos.length > 0 ? `${livescoreFonte}+globo` : 'globo';

      cacheJogosDia = jogosMesclados;
      cacheTimestamp = agora;
      cacheTemJogosAoVivo = temAoVivo;
      cacheDataReferencia = dataHoje;
      cacheFonte = fontePrincipal;

      const stats = calcularEstatisticas(jogosMesclados);

      console.log(`[JOGOS-DIA] ✅ Mesclado: ${soccerData.jogos.length} ao vivo (${livescoreFonte}) + ${jogosAgenda.length} agenda = ${jogosMesclados.length} jogos`);

      // Recalcular Copa com dados ao vivo mesclados
      const copaFresh = montarDadosCopa(dataHoje, jogosMesclados);

      return res.json({
        jogos: jogosMesclados,
        fonte: fontePrincipal,
        aoVivo: temAoVivo,
        estatisticas: stats,
        quantidade: jogosMesclados.length,
        atualizadoEm: new Date(agora).toISOString(),
        mensagem: soccerData.jogos.length > 0
          ? `Livescores (${livescoreFonte}) + agenda (${soccerData.jogos.length} ao vivo, ${jogosMesclados.length - soccerData.jogos.length} agendados)`
          : `Agenda do dia (${jogosMesclados.length} jogos programados)`,
        copa: copaFresh,
      });
    }

    // 4º Cache stale (todas as fontes falharam mas temos cache antigo válido até 30min)
    console.warn('[JOGOS-DIA] ⚠️ Todas as fontes falharam. Tentando cache stale...');
    if (cacheStaleValido) {
      const stats = calcularEstatisticas(cacheJogosDia);
      const idadeMinutos = Math.round((agora - cacheTimestamp) / 60000);

      console.warn(`[JOGOS-DIA] ✅ Usando cache stale (${idadeMinutos}min atrás) - Fonte: ${cacheFonte}`);

      return res.json({
        jogos: cacheJogosDia,
        fonte: cacheFonte,
        aoVivo: cacheTemJogosAoVivo,
        estatisticas: stats,
        cache: true,
        stale: true,
        idadeMinutos,
        mensagem: `Dados de ${idadeMinutos} min atrás (limite de requisições atingido)`,
        atualizadoEm: new Date(cacheTimestamp).toISOString(),
        copa,
      });
    }

    // 5º Fallback final: arquivo JSON estático (legado)
    console.warn('[JOGOS-DIA] ⚠️ Cache stale expirado/vazio. Tentando fallback final: arquivo globo JSON...');
    const jogosGlobo = await buscarJogosGlobo();

    if (jogosGlobo.length > 0) {
      console.log(`[JOGOS-DIA] ✅ Globo arquivo JSON retornou ${jogosGlobo.length} jogos`);
    } else {
      console.warn('[JOGOS-DIA] ⚠️ Nenhuma fonte disponível. Sem jogos brasileiros hoje.');
    }

    return res.json({
      jogos: jogosGlobo,
      fonte: 'globo-arquivo',
      aoVivo: false,
      estatisticas: calcularEstatisticas(jogosGlobo),
      atualizadoEm: new Date().toISOString(),
      mensagem: jogosGlobo.length > 0
        ? 'Dados do arquivo Globo (agenda legada)'
        : 'Sem jogos brasileiros hoje',
      copa,
    });

  } catch (err) {
    console.error('[JOGOS-DIA] Erro na rota:', err);
    res.status(500).json({
      error: 'Erro ao buscar jogos',
      detalhes: err.message
    });
  }
});

// GET /api/jogos-ao-vivo/status
router.get('/status', async (req, res) => {
  const soccerDataKey = process.env.SOCCERDATA_API_KEY;
  const agora = Date.now();

  // Calcular idade do cache
  const cacheIdadeMs = cacheTimestamp ? agora - cacheTimestamp : null;
  const cacheIdadeMin = cacheIdadeMs ? Math.round(cacheIdadeMs / 60000) : null;
  const cacheStale = cacheIdadeMs && cacheIdadeMs > (cacheTemJogosAoVivo ? CACHE_TTL_AO_VIVO : CACHE_TTL_SEM_JOGOS);

  // Obter status do orquestrador (inclui API-Football)
  const orquestradorStatus = apiOrchestrator.getStatusConsolidado();
  const apiFootballStatus = orquestradorStatus.apiFootball || {};
  const apiFootballQuota = apiFootballStatus.quota || {};

  const resultado = {
    fluxo: '✅ SoccerDataAPI (PRIMÁRIA) + API-Football (SECUNDÁRIA/FALLBACK) + Agenda ge.globo.com (PARALELO) → Cache Stale (30min) → Arquivo JSON',
    observacao: 'v5.0: API-Football reativada como SECUNDÁRIA com proteções anti-ban (circuit breaker, rate limiter, quota tracker)',
    fontes: {
      'soccerdata': {
        ordem: 1,
        configurado: !!soccerDataKey,
        tipo: '🟢 PRINCIPAL',
        limite: '75 req/dia (free)',
        descricao: 'Fonte principal de livescores'
      },
      'api-football': {
        ordem: 2,
        configurado: apiFootballStatus.configurado || false,
        habilitado: apiFootballStatus.habilitado || false,
        tipo: apiFootballStatus.tipo || '🔴 DESABILITADA',
        descricao: 'Fallback de livescores + eventos on-demand',
        plano: 'Free (100 req/dia)',
        quota: {
          usadas: apiFootballQuota.dailyRequests || 0,
          limite: apiFootballQuota.dailyHardCap || 90,
          limiteReal: apiFootballQuota.dailyLimit || 100,
          restante: apiFootballQuota.remaining ?? 0,
          restanteApi: apiFootballQuota.remainingFromApi,
          percentUsado: apiFootballQuota.percentUsed || 0,
          circuitBreaker: apiFootballQuota.circuitOpen || false,
          circuitReason: apiFootballQuota.circuitReason || null,
          resetAt: '00:00 UTC'
        },
        protecoes: {
          hardCap: '90 req/dia (buffer 10)',
          rateLimitMinuto: '2 req/min max',
          intervaloMinimo: '30s entre requests',
          circuitBreaker: 'Auto-desabilita com < 10 restantes',
          deduplicacao: '60s cache por endpoint',
          backoff: 'Exponential em 429'
        },
        stats: apiFootballQuota.stats || {}
      },
      'globo-agenda': {
        ordem: 3,
        configurado: true,
        tipo: '🟢 PARALELO',
        limite: 'Sem limite (scraper SSR)',
        descricao: 'Agenda do dia via ge.globo.com (jogos agendados)',
        cacheAgenda: {
          jogosEmCache: cacheAgendaDia?.length || 0,
          idadeSegundos: cacheAgendaTimestamp ? Math.round((agora - cacheAgendaTimestamp) / 1000) : null,
          temAoVivo: cacheAgendaTemAoVivo,
          ttlAtual: cacheAgendaTemAoVivo ? '30s (ao vivo)' : '5min (sem jogos)',
          blindagem: '🛡️ TTL dinâmico ativo'
        }
      },
      'cache-stale': {
        ordem: 4,
        ativo: cacheStale && cacheJogosDia?.length > 0,
        tipo: 'fallback-2',
        maxIdade: '30 min',
        descricao: 'Ultimo cache valido quando todas as APIs falharem'
      },
      'globo-arquivo': {
        ordem: 5,
        configurado: true,
        tipo: 'fallback-final',
        limite: 'Arquivo JSON estático',
        descricao: 'Legado: arquivo jogos-globo.json (backup)'
      }
    },
    orquestrador: orquestradorStatus.orquestrador,
    cache: {
      temJogosAoVivo: cacheTemJogosAoVivo,
      fonte: cacheFonte,
      ttlAtual: cacheTemJogosAoVivo ? '30s' : '10 min',
      idadeMinutos: cacheIdadeMin,
      stale: cacheStale,
      jogosEmCache: cacheJogosDia?.length || 0,
      ultimaAtualizacao: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null
    }
  };

  // Info do SoccerDataAPI
  if (!soccerDataKey) {
    resultado.fontes['soccerdata'].aviso = '⚠️ SOCCERDATA_API_KEY nao configurada - Configure URGENTE!';
    resultado.fontes['soccerdata'].statusCritico = true;
  } else {
    resultado.fontes['soccerdata'].statusOk = true;
    resultado.fontes['soccerdata'].mensagem = '✅ Configurado e operacional';
  }

  res.json(resultado);
});

// GET /api/jogos-ao-vivo/invalidar - Força refresh do cache
router.get('/invalidar', async (req, res) => {
  cacheJogosDia = null;
  cacheTimestamp = 0;
  cacheTemJogosAoVivo = false;
  cacheDataReferencia = null;
  cacheAgendaDia = null;
  cacheAgendaTimestamp = 0;
  cacheAgendaDataRef = null;
  cacheAgendaTemAoVivo = false; // 🛡️ Reset blindagem
  cacheMesDados = null;
  cacheMesTimestamp = 0;

  console.log('[JOGOS-DIA] 🔄 Cache invalidado via API (+ blindagem resetada)');

  res.json({
    success: true,
    mensagem: 'Cache invalidado (livescores + agenda + mês + blindagem). Próxima requisição buscará dados frescos.'
  });
});

// GET /api/jogos-ao-vivo/mes - Jogos do mês (multi-datas) filtrados por time
router.get('/mes', async (req, res) => {
  try {
    const agora = Date.now();
    const time = (req.query.time || '').trim().toLowerCase();

    // Cache válido?
    if (cacheMesDados && (agora - cacheMesTimestamp) < CACHE_MES_TTL) {
      const filtrado = time ? filtrarJogosPorTime(cacheMesDados, time) : cacheMesDados;
      return res.json({ jogos: filtrado, cache: true, fonte: 'globo-multidatas' });
    }

    console.log('[JOGOS-MES] Buscando jogos multi-datas via ge.globo.com...');
    const dados = await obterJogosGloboMultiDatas();
    const totalDatas = Object.keys(dados).length;
    const totalJogos = Object.values(dados).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[JOGOS-MES] ✅ ${totalJogos} jogos em ${totalDatas} datas`);

    cacheMesDados = dados;
    cacheMesTimestamp = agora;

    const filtrado = time ? filtrarJogosPorTime(dados, time) : dados;
    res.json({ jogos: filtrado, cache: false, fonte: 'globo-multidatas', totalDatas, totalJogos });
  } catch (err) {
    console.error('[JOGOS-MES] Erro:', err.message);
    if (cacheMesDados) {
      const time = (req.query.time || '').trim().toLowerCase();
      const filtrado = time ? filtrarJogosPorTime(cacheMesDados, time) : cacheMesDados;
      return res.json({ jogos: filtrado, cache: true, stale: true, fonte: 'globo-multidatas' });
    }
    res.status(500).json({ error: 'Erro ao buscar jogos do mês' });
  }
});

function filtrarJogosPorTime(dadosMultiDatas, nomeTime) {
  const nomeNorm = normalizarNome(nomeTime);
  const resultado = {};
  for (const [data, jogos] of Object.entries(dadosMultiDatas)) {
    const filtrados = jogos.filter(j => {
      return normalizarNome(j.mandante).includes(nomeNorm) ||
             normalizarNome(j.visitante).includes(nomeNorm);
    });
    if (filtrados.length > 0) {
      resultado[data] = filtrados;
    }
  }
  return resultado;
}

// =====================================================================
// GET /api/jogos-ao-vivo/game-status
// Endpoint otimizado para o FAB - retorna estado consolidado dos jogos
// Usado pela máquina de estados do foguinho para sincronismo total
// =====================================================================
router.get('/game-status', async (req, res) => {
  try {
    const agora = Date.now();
    const dataHoje = getDataHoje();

    // Usar cache existente se disponível, senão buscar fresh
    let jogos = cacheJogosDia;
    let fonte = cacheFonte || 'cache';

    // Se cache está muito velho ou não existe, tentar refresh
    const cacheIdade = cacheTimestamp ? agora - cacheTimestamp : Infinity;
    const ttlAtual = cacheTemJogosAoVivo ? CACHE_TTL_AO_VIVO : CACHE_TTL_SEM_JOGOS;

    if (!jogos || cacheIdade > ttlAtual) {
      try {
        const [livescoresResult, jogosAgenda] = await Promise.all([
          apiOrchestrator.buscarLivescores(buscarJogosSoccerDataAPI),
          buscarAgendaDoDia()
        ]);
        jogos = mesclarJogos(livescoresResult.jogos || [], jogosAgenda);

        if (jogos.length > 0) {
          const temAoVivo = jogos.some(j => STATUS_AO_VIVO.includes(j.statusRaw));
          cacheJogosDia = jogos;
          cacheTimestamp = agora;
          cacheTemJogosAoVivo = temAoVivo;
          cacheDataReferencia = dataHoje;
          cacheFonte = livescoresResult.jogos?.length > 0 ? `${livescoresResult.fonte}+globo` : 'globo';
          fonte = cacheFonte;
        }
      } catch (e) {
        if (cacheJogosDia) {
          jogos = cacheJogosDia;
          fonte = 'cache-stale';
        }
      }
    }

    // Estatísticas granulares
    const stats = jogos ? calcularEstatisticas(jogos) : { total: 0, aoVivo: 0, agendados: 0, encerrados: 0 };

    // Próximo jogo agendado (para WAITING/INTERVAL)
    let proximoJogo = null;
    if (jogos && jogos.length > 0) {
      const agendados = jogos
        .filter(j => STATUS_AGENDADO.includes(j.statusRaw) && j.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (agendados.length > 0) {
        const prox = agendados[0];
        proximoJogo = {
          mandante: prox.mandante,
          visitante: prox.visitante,
          horario: prox.horario,
          liga: prox.liga,
          timestamp: prox.timestamp,
          minutosRestantes: prox.timestamp ? Math.max(0, Math.round((prox.timestamp - agora / 1000) / 60)) : null
        };
      }
    }

    // FAB state recomendado (frontend decide, backend sugere)
    let fabStateRecomendado = 'hidden';
    if (stats.aoVivo > 0) {
      fabStateRecomendado = 'live';
    } else if (stats.agendados > 0 && stats.encerrados > 0) {
      fabStateRecomendado = 'interval';
    } else if (stats.agendados > 0 && stats.encerrados === 0) {
      fabStateRecomendado = 'waiting';
    } else if (stats.encerrados > 0 && stats.agendados === 0) {
      fabStateRecomendado = 'cooling';
    }

    // TTL recomendado para próximo poll do FAB (segundos)
    let pollInterval = 300;
    if (fabStateRecomendado === 'live') pollInterval = 30;
    else if (fabStateRecomendado === 'interval') pollInterval = 120;
    else if (fabStateRecomendado === 'waiting') pollInterval = 300;
    else if (fabStateRecomendado === 'cooling') pollInterval = 180;

    res.json({
      fabState: fabStateRecomendado,
      pollInterval,
      stats,
      proximoJogo,
      atualizadoEm: new Date(cacheTimestamp || agora).toISOString(),
      fonte
    });
  } catch (err) {
    console.error('[JOGOS-DIA] Erro em /game-status:', err.message);
    res.json({
      fabState: 'hidden',
      pollInterval: 300,
      stats: { total: 0, aoVivo: 0, agendados: 0, encerrados: 0 },
      proximoJogo: null,
      atualizadoEm: new Date().toISOString(),
      fonte: 'fallback-error'
    });
  }
});

// GET /api/jogos-ao-vivo/:fixtureId/eventos - Eventos de um jogo especifico
// ✅ v5.0: Reativado via API-Football (on-demand, 1 req por clique)
router.get('/:fixtureId/eventos', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    if (!fixtureId || isNaN(fixtureId)) {
      return res.status(400).json({ error: 'fixtureId invalido' });
    }

    const result = await buscarEventosJogoViaOrquestrador(fixtureId);
    res.json(result);
  } catch (err) {
    console.error('[JOGOS-EVENTOS] Erro na rota:', err);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

export default router;
