// =====================================================================
// BRASILEIRAO TABELA SERVICE - v1.2
// Service para buscar tabela completa do Brasileirão de múltiplas fontes
// Ordem de prioridade: API-Football → ESPN → Globo Scraper → Cache
// v1.1: Integração com jogos-ao-vivo para placares em tempo real
// v1.2: API-Football como fonte primária (rodadas exatas, fonte da verdade)
// =====================================================================

import fetch from 'node-fetch';
import CalendarioBrasileirao from '../models/CalendarioBrasileirao.js';
import apiFootball from './api-football-service.js';

// =====================================================================
// CONFIGURAÇÃO
// =====================================================================
const CONFIG = {
    API_FOOTBALL_LEAGUE_ID: 71, // Brasileirão Série A
    CACHE_TTL_MS: 6 * 60 * 60 * 1000, // 6 horas
    SYNC_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 horas
    REQUEST_TIMEOUT_MS: 30000,
    AO_VIVO_CACHE_TTL_MS: 30 * 1000, // 30s cache para dados ao vivo
};

// Mapeamento de nomes de times API-Football → ID Cartola
const TIMES_CARTOLA_MAP = {
    'flamengo': 262,
    'botafogo': 263,
    'corinthians': 264,
    'bahia': 265,
    'fluminense': 266,
    'vasco da gama': 267,
    'vasco': 267,
    'palmeiras': 275,
    'sao paulo': 276,
    'são paulo': 276,
    'santos': 277,
    'red bull bragantino': 280,
    'bragantino': 280,
    'atletico mineiro': 282,
    'atlético mineiro': 282,
    'atletico-mg': 282,
    'atlético-mg': 282,
    'cruzeiro': 283,
    'gremio': 284,
    'grêmio': 284,
    'internacional': 285,
    'juventude': 286,
    'vitoria': 287,
    'vitória': 287,
    'goias': 290,
    'goiás': 290,
    'sport recife': 292,
    'sport': 292,
    'athletico paranaense': 293,
    'athletico-pr': 293,
    'ceara': 354,
    'ceará': 354,
    'fortaleza': 356,
    'cuiaba': 1371,
    'cuiabá': 1371,
    'mirassol': 2305,
    'coritiba': 294,
    'america mineiro': 273,
    'américa-mg': 273,
    'chapecoense': 315,
    'clube do remo': 364,
    'remo': 364,
    'novorizontino': 315,
};

// Estado do serviço
let state = {
    ultimoSync: null,
    fonteAtual: null,
    erro: null,
    stats: {
        syncCount: 0,
        lastSuccess: null,
        lastError: null,
    }
};

// Cache em memória para dados ao vivo (evita writes repetidos)
let aoVivoCache = {
    data: null,
    timestamp: 0,
};

// =====================================================================
// FUNÇÕES AUXILIARES
// =====================================================================

/**
 * Converte nome do time para ID do Cartola
 */
function getCartolaId(nomeTime) {
    if (!nomeTime) return null;
    const normalizado = nomeTime.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    return TIMES_CARTOLA_MAP[normalizado] || null;
}

/**
 * Converte status da API-Football para nosso formato
 */
function converterStatusApiFootball(status) {
    const statusMap = {
        'TBD': 'a_definir',
        'NS': 'agendado',
        '1H': 'ao_vivo',
        'HT': 'ao_vivo',
        '2H': 'ao_vivo',
        'ET': 'ao_vivo',
        'P': 'ao_vivo',
        'FT': 'encerrado',
        'AET': 'encerrado',
        'PEN': 'encerrado',
        'PST': 'adiado',
        'CANC': 'cancelado',
        'ABD': 'cancelado',
        'AWD': 'encerrado',
        'WO': 'encerrado',
    };
    return statusMap[status] || 'agendado';
}

/**
 * Formata data ISO para YYYY-MM-DD
 */
function formatarData(dataISO) {
    if (!dataISO) return null;
    const date = new Date(dataISO);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Formata hora ISO para HH:MM (horário de Brasília)
 */
function formatarHora(dataISO) {
    if (!dataISO) return '00:00';
    const date = new Date(dataISO);
    if (isNaN(date.getTime())) return '00:00';
    return date.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// =====================================================================
// FONTE 2 (FALLBACK): ESPN (gratuita, sem autenticação, rodadas inferidas)
// =====================================================================

// Data de início do Brasileirão por temporada.
// Jogos ANTERIORES a essa data são de outras competições (Copa do Brasil,
// Supercopa, Libertadores preliminar) e devem ser ignorados.
// ATENÇÃO: atualizar a cada temporada.
// 2026: temporada adiantada por causa da Copa do Mundo 2026 (jun-jul) — início em janeiro.
const BRASILEIRAO_INICIO = {
    2025: '2025-04-12',
    2026: '2026-01-01', // Brasileirão 2026 adiantado — Copa do Mundo em junho/julho
};

// Mapeamento ESPN displayName → ID Cartola (Série A 2026 — 20 times)
// ATENÇÃO: atualizar a cada temporada conforme promoções/rebaixamentos
const TIMES_ESPN_MAP = {
    'Athletico-PR':          293,
    'Athletico Paranaense':  293,
    'Atlético-MG':           282,
    'Atlético Mineiro':      282,
    'Bahia':                 265,
    'Botafogo':              263,
    'Chapecoense':           315, // promovido para Série A 2026
    'Corinthians':           264,
    'Coritiba':              294, // promovido para Série A 2026
    'Cruzeiro':              283,
    'Flamengo':              262,
    'Fluminense':            266,
    'Grêmio':                284,
    'Internacional':         285,
    'Mirassol':              2305,
    'Palmeiras':             275,
    'Red Bull Bragantino':   280,
    'RB Bragantino':         280,
    'Remo':                  364, // promovido para Série A 2026
    'Santos':                277,
    'São Paulo':             276,
    'Vasco da Gama':         267,
    'Vitória':               287,
};

/**
 * Converte status ESPN para nosso enum de status
 */
function converterStatusEspn(stateStr, completed) {
    if (stateStr === 'in') return 'ao_vivo';
    if (stateStr === 'post' || completed) return 'encerrado';
    return 'agendado';
}

/**
 * Infere número da rodada usando algoritmo greedy:
 * cada time só pode jogar uma vez por rodada.
 * Jogos são processados em ordem cronológica; o primeiro round disponível
 * onde ambos os times ainda não jogaram é atribuído.
 *
 * v1.1: Preserva rodadas já definidas (vindas da ESPN notes ou do MongoDB).
 *       Só infere para partidas com rodada === 0 ou ausente.
 */
function inferirRodadas(partidas) {
    if (!partidas.length) return partidas;

    partidas.sort((a, b) => new Date(a.data) - new Date(b.data));

    // rodada -> Set de IDs de times que já jogaram nessa rodada
    const timesPorRodada = {};

    // 1) Registrar partidas que JÁ possuem rodada válida (preserve-first)
    for (const p of partidas) {
        if (p.rodada && p.rodada >= 1 && p.rodada <= 38) {
            if (!timesPorRodada[p.rodada]) timesPorRodada[p.rodada] = new Set();
            timesPorRodada[p.rodada].add(p.mandante_id);
            timesPorRodada[p.rodada].add(p.visitante_id);
        }
    }

    // 2) Inferir apenas para partidas sem rodada definida
    for (const p of partidas) {
        if (p.rodada && p.rodada >= 1 && p.rodada <= 38) continue; // já tem rodada

        let rodada = 1;
        while (true) {
            if (!timesPorRodada[rodada]) timesPorRodada[rodada] = new Set();
            const times = timesPorRodada[rodada];
            if (!times.has(p.mandante_id) && !times.has(p.visitante_id)) {
                times.add(p.mandante_id);
                times.add(p.visitante_id);
                p.rodada = rodada;
                break;
            }
            rodada++;
            if (rodada > 38) { p.rodada = 0; break; } // segurança
        }
    }

    return partidas;
}

/**
 * Busca calendário completo do Brasileirão via ESPN API (sem autenticação).
 * @param {number} temporada - Ano da temporada (ex: 2026)
 * @returns {Promise<Array|null>} Array de partidas formatadas
 */
async function buscarViaEspn(temporada) {
    console.log(`[BRASILEIRAO-SERVICE] Buscando temporada ${temporada} via ESPN (chamadas mensais)...`);

    // ESPN scoreboard não suporta ranges longos confiávelmente.
    // Brasileirão vai de março a dezembro — buscar mês a mês e mesclar.
    // Meses dinâmicos baseados em BRASILEIRAO_INICIO (2026 começa em janeiro por causa da Copa do Mundo)
    const mesInicio = parseInt((BRASILEIRAO_INICIO[temporada] || '').substring(5, 7) || '04', 10);
    const MESES_TEMPORADA = [];
    for (let m = mesInicio; m <= 12; m++) MESES_TEMPORADA.push(String(m).padStart(2, '0'));

    /**
     * Busca jogos de um mês específico via ESPN scoreboard.
     * Retorna array de events (pode ser vazio).
     */
    async function fetchMes(mes) {
        const inicio = `${temporada}${mes}01`;
        // Último dia do mês: usar próximo mês dia 00 = último dia do mês atual
        const mesNum = parseInt(mes, 10);
        const anoFim = mesNum === 12 ? temporada + 1 : temporada;
        const mesFim = String(mesNum === 12 ? 1 : mesNum + 1).padStart(2, '0');
        const fim = `${anoFim}${mesFim}01`;

        // ESPN interpreta "fim" como exclusivo, então usar o primeiro dia do próximo mês
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard` +
            `?limit=200&dates=${inicio}-${fim}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'SuperCartolaManager/1.0' },
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[BRASILEIRAO-SERVICE] ESPN ${mes}/${temporada}: HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return data.events || [];
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[BRASILEIRAO-SERVICE] ESPN ${mes}/${temporada}: ${err.message}`);
            return [];
        }
    }

    try {
        // Chamadas mensais em paralelo (sem sobrecarregar ESPN — máx 5 paralelas)
        const allEvents = [];
        const idsVistos = new Set();

        for (let i = 0; i < MESES_TEMPORADA.length; i += 5) {
            const lote = MESES_TEMPORADA.slice(i, i + 5);
            const resultados = await Promise.all(lote.map(mes => fetchMes(mes)));
            for (const events of resultados) {
                for (const ev of events) {
                    if (!idsVistos.has(ev.id)) {
                        idsVistos.add(ev.id);
                        allEvents.push(ev);
                    }
                }
            }
        }

        if (!allEvents.length) {
            console.warn('[BRASILEIRAO-SERVICE] ESPN retornou 0 jogos em todas as chamadas mensais');
            return null;
        }

        console.log(`[BRASILEIRAO-SERVICE] ESPN retornou ${allEvents.length} jogos (total mensal)`);

        const partidas = allEvents.filter(event => {
            const comp = event.competitions?.[0];
            return comp && Array.isArray(comp.competitors) && comp.competitors.length >= 2;
        }).map(event => {
            const comp = event.competitions[0];
            const competitors = comp.competitors;
            const home = competitors.find(c => c.homeAway === 'home') || {};
            const away = competitors.find(c => c.homeAway === 'away') || {};
            const status = event.status?.type || {};
            const venue = comp.venue || event.venue || {};

            const mandante = home.team?.displayName || '';
            const visitante = away.team?.displayName || '';
            const dataISO = event.date || comp.date || '';

            // Tentar extrair rodada dos dados ESPN (notes, season.slug, week)
            // ESPN costuma incluir "Matchday X" ou "Regular Season - X" em notes
            let rodadaEspn = 0;
            const notes = comp.notes || event.notes || [];
            for (const note of notes) {
                const headline = note?.headline || note?.text || '';
                if (headline) {
                    rodadaEspn = extrairRodada(headline);
                    if (rodadaEspn >= 1 && rodadaEspn <= 38) break;
                    rodadaEspn = 0;
                }
            }
            // Fallback: week.number (usado em algumas ligas ESPN)
            if (!rodadaEspn && event.week?.number) {
                const wk = parseInt(event.week.number, 10);
                if (wk >= 1 && wk <= 38) rodadaEspn = wk;
            }

            return {
                id_externo: `espn_${event.id}`,
                rodada: rodadaEspn, // 0 = será inferido por inferirRodadas()
                data: formatarData(dataISO),
                horario: formatarHora(dataISO),
                mandante,
                visitante,
                mandante_id: TIMES_ESPN_MAP[mandante] || null,
                visitante_id: TIMES_ESPN_MAP[visitante] || null,
                placar_mandante: status.state === 'post' ? parseInt(home.score || 0) : null,
                placar_visitante: status.state === 'post' ? parseInt(away.score || 0) : null,
                status: converterStatusEspn(status.state, status.completed),
                estadio: venue.fullName || null,
                cidade: venue.address?.city || null,
            };
        });

        // Log de diagnóstico: times não encontrados no mapa (nome diferente do esperado)
        const semId = partidas.filter(p => !p.mandante_id || !p.visitante_id);
        if (semId.length > 0) {
            const timesDesconhecidos = new Set();
            semId.forEach(p => {
                if (!p.mandante_id) timesDesconhecidos.add(p.mandante);
                if (!p.visitante_id) timesDesconhecidos.add(p.visitante);
            });
            console.warn(`[BRASILEIRAO-SERVICE] ⚠️ ${semId.length} jogos ignorados — times não mapeados: ${[...timesDesconhecidos].join(', ')}`);
        }

        // Filtrar por data de início do Brasileirão.
        // ESPN retorna jogos de Copa do Brasil, Supercopa e Libertadores
        // preliminar nos mesmos resultados — todos anteriores ao início da Série A.
        const dataInicio = BRASILEIRAO_INICIO[temporada] || `${temporada}-04-01`;
        const totalBruto = partidas.length;
        const partidasFiltradas = partidas.filter(p => p.mandante_id && p.visitante_id && p.data && p.data >= dataInicio);
        const descartados = totalBruto - partidasFiltradas.length;
        if (descartados > 0) {
            console.log(`[BRASILEIRAO-SERVICE] ESPN: ${descartados} jogos descartados (antes de ${dataInicio} — Copa do Brasil/Supercopa)`);
        }

        // Inferir rodadas por clusters de data (só para jogos sem rodada ESPN)
        inferirRodadas(partidasFiltradas);

        // Filtrar rodadas válidas (1-38)
        const validas = partidasFiltradas.filter(p => p.rodada >= 1 && p.rodada <= 38);

        // Sanidade: avisar se alguma rodada tem > 12 jogos (sinal de contaminação residual)
        const jogosParaRodada = {};
        for (const p of validas) {
            jogosParaRodada[p.rodada] = (jogosParaRodada[p.rodada] || 0) + 1;
        }
        for (const [r, count] of Object.entries(jogosParaRodada)) {
            if (count > 12) {
                console.warn(`[BRASILEIRAO-SERVICE] ESPN: Rodada ${r} com ${count} jogos (esperado ≤ 10) — possível contaminação residual`);
            }
        }

        // Desduplicar: mesmo par mandante_id+visitante_id pode aparecer 2x
        // (jogo original adiado + remarcado, cada um com ID diferente no ESPN)
        // Prioridade: ao_vivo > encerrado > agendado; entre iguais, manter data mais recente
        const statusPrioridade = { ao_vivo: 3, encerrado: 2, agendado: 1, a_definir: 1, adiado: 0, cancelado: 0 };
        const dedupMap = new Map();
        for (const p of validas) {
            const chave = `${p.mandante_id}-${p.visitante_id}`;
            const existente = dedupMap.get(chave);
            if (!existente) {
                dedupMap.set(chave, p);
                continue;
            }
            const prioNova = statusPrioridade[p.status] ?? 0;
            const prioExist = statusPrioridade[existente.status] ?? 0;
            if (prioNova > prioExist || (prioNova === prioExist && p.data > existente.data)) {
                dedupMap.set(chave, p);
            }
        }
        return [...dedupMap.values()];

    } catch (error) {
        console.error('[BRASILEIRAO-SERVICE] Erro ESPN:', error.message);
        state.stats.lastError = { fonte: 'espn', erro: error.message, data: new Date() };
        return null;
    }
}

/**
 * Extrai número da rodada do formato "Regular Season - 5" (legado)
 */
function extrairRodada(roundString) {
    if (!roundString) return 0;
    const match = roundString.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// =====================================================================
// FONTE 2: API-FOOTBALL v3 (paga, fonte da verdade — rodadas exatas)
// Endpoint: https://v3.football.api-sports.io/fixtures?league=71&season=YEAR
// Header: x-apisports-key
// Limite free tier: 100 req/dia — usado apenas no sync diário (1 req/chamada)
// =====================================================================

/**
 * Busca calendário completo do Brasileirão via API-Football v3.
 * Delega ao api-football-service (quota tracker, circuit breaker, rate limit).
 * Retorna null se chave não configurada ou circuit breaker aberto → fallback ESPN.
 * Custo: 1 request por sync diário (toda a temporada de uma vez).
 * @param {number} temporada - Ano da temporada
 * @returns {Promise<Array|null>}
 */
async function buscarViaApiFootball(temporada) {
    const status = apiFootball.getStatus();

    if (!status.configurado) {
        console.log('[BRASILEIRAO-SERVICE] API_FOOTBALL_KEY não configurada — pulando API-Football');
        return null;
    }

    // Inicialização lazy sem MongoDB (sem quota persistence, mas funcional).
    // Se já foi inicializado pelo app com MongoDB, este bloco é ignorado.
    if (!status.habilitado) {
        await apiFootball.init(null);
        const statusPosInit = apiFootball.getStatus();
        if (!statusPosInit.habilitado) {
            console.warn('[BRASILEIRAO-SERVICE] API-Football desabilitada (circuit breaker?) — pulando');
            return null;
        }
    }

    if (status.quota?.circuitOpen) {
        console.warn(`[BRASILEIRAO-SERVICE] API-Football circuit breaker aberto: ${status.quota.circuitReason}`);
        return null;
    }

    console.log(`[BRASILEIRAO-SERVICE] Buscando temporada ${temporada} via API-Football (fonte da verdade)...`);

    // 1 request para toda a temporada — muito mais eficiente que busca por rodada
    const resultado = await apiFootball.request('/fixtures', {
        league: CONFIG.API_FOOTBALL_LEAGUE_ID,
        season: temporada,
    }, { priority: 'normal' });

    if (!resultado.success) {
        console.warn(`[BRASILEIRAO-SERVICE] API-Football falhou: ${resultado.error}`);
        state.stats.lastError = { fonte: 'api-football', erro: resultado.error, data: new Date() };
        return null;
    }

    const fixtures = resultado.data;
    if (!Array.isArray(fixtures) || fixtures.length === 0) {
        console.warn('[BRASILEIRAO-SERVICE] API-Football retornou 0 fixtures');
        return null;
    }

    console.log(`[BRASILEIRAO-SERVICE] API-Football retornou ${fixtures.length} fixtures`);

    const dataInicio = BRASILEIRAO_INICIO[temporada] || `${temporada}-04-01`;

    const partidas = fixtures.map(f => {
        const fixture = f.fixture || {};
        const league = f.league || {};
        const teams = f.teams || {};
        const goals = f.goals || {};

        const mandante = teams.home?.name || '';
        const visitante = teams.away?.name || '';
        const mandante_id = getCartolaId(mandante);
        const visitante_id = getCartolaId(visitante);
        const data = formatarData(fixture.date);
        const horario = formatarHora(fixture.date);
        const statusPartida = converterStatusApiFootball(fixture.status?.short || 'NS');
        const rodada = extrairRodada(league.round || '');

        const isEncerrado = statusPartida === 'encerrado';

        return {
            id_externo: `apifootball_${fixture.id}`,
            rodada,
            data,
            horario,
            mandante,
            visitante,
            mandante_id,
            visitante_id,
            placar_mandante: isEncerrado ? (goals.home ?? null) : null,
            placar_visitante: isEncerrado ? (goals.away ?? null) : null,
            status: statusPartida,
            estadio: fixture.venue?.name || null,
            cidade: fixture.venue?.city || null,
        };
    });

    // Log de times sem mapeamento
    const semId = partidas.filter(p => !p.mandante_id || !p.visitante_id);
    if (semId.length > 0) {
        const desconhecidos = new Set();
        semId.forEach(p => {
            if (!p.mandante_id) desconhecidos.add(p.mandante);
            if (!p.visitante_id) desconhecidos.add(p.visitante);
        });
        console.warn(`[BRASILEIRAO-SERVICE] API-Football: ${semId.length} jogos sem mapeamento — times: ${[...desconhecidos].join(', ')}`);
    }

    // Filtrar: apenas Brasileirão real (rodadas 1-38, a partir da data de início)
    const validas = partidas.filter(p =>
        p.mandante_id && p.visitante_id &&
        p.data && p.data >= dataInicio &&
        p.rodada >= 1 && p.rodada <= 38
    );

    const descartados = partidas.length - validas.length;
    if (descartados > 0) {
        console.log(`[BRASILEIRAO-SERVICE] API-Football: ${descartados} fixtures descartados (sem ID, fora de data ou rodada inválida)`);
    }

    console.log(`[BRASILEIRAO-SERVICE] API-Football: ${validas.length} partidas válidas (quota restante: ${resultado.quotaInfo?.remaining ?? '?'})`);
    return validas;
}

// =====================================================================
// FONTE 3 (FALLBACK FINAL): GLOBO ESPORTE (SCRAPER)
// =====================================================================

/**
 * Busca tabela do Brasileirão via Globo Esporte (scraper)
 * @param {number} temporada - Ano da temporada
 * @returns {Promise<Array>} Array de partidas formatadas
 */
async function buscarViaGlobo(temporada) {
    console.log(`[BRASILEIRAO-SERVICE] Tentando Globo Esporte para ${temporada}...`);

    try {
        // Globo usa API interna para tabela de jogos
        const url = `https://ge.globo.com/futebol/brasileirao-serie-a/`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaBot/1.0)',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extrair dados do JSON embutido no HTML (padrão Globo)
        const jsonMatch = html.match(/__NEXT_DATA__\s*=\s*({.*?})\s*<\/script>/s);
        if (!jsonMatch) {
            console.warn('[BRASILEIRAO-SERVICE] Não encontrou dados JSON no Globo');
            return null;
        }

        const nextData = JSON.parse(jsonMatch[1]);
        // A estrutura do Next.js do Globo varia, adaptar conforme necessário
        // Por enquanto, retornar null e usar API-Football como principal

        console.warn('[BRASILEIRAO-SERVICE] Scraper Globo não implementado completamente');
        return null;

    } catch (error) {
        console.error('[BRASILEIRAO-SERVICE] Erro Globo scraper:', error.message);
        state.stats.lastError = { fonte: 'globo', erro: error.message, data: new Date() };
        return null;
    }
}

// =====================================================================
// ORQUESTRADOR DE SYNC
// =====================================================================

/**
 * Sincroniza tabela do Brasileirão de todas as fontes disponíveis
 * @param {number} temporada - Ano da temporada
 * @param {boolean} forcar - Ignorar cache e forçar sync
 * @returns {Promise<Object>} Resultado do sync
 */
async function sincronizarTabela(temporada, forcar = false) {
    console.log(`[BRASILEIRAO-SERVICE] Iniciando sync para temporada ${temporada}...`);

    // Verificar se precisa sincronizar
    if (!forcar && state.ultimoSync) {
        const diff = Date.now() - state.ultimoSync.getTime();
        if (diff < CONFIG.CACHE_TTL_MS) {
            console.log('[BRASILEIRAO-SERVICE] Usando cache (sync recente)');
            const calendario = await CalendarioBrasileirao.findOne({ temporada }).lean();
            return {
                success: true,
                fonte: 'cache',
                calendario,
                ultimoSync: state.ultimoSync,
            };
        }
    }

    let partidas = null;
    let fonte = null;

    // 1) API-Football: fonte da verdade (rodadas exatas, dados confiáveis)
    //    Requer API_FOOTBALL_KEY no .env. Fallback automático para ESPN se ausente.
    partidas = await buscarViaApiFootball(temporada);
    if (partidas && partidas.length > 0) {
        fonte = 'api-football';
    }

    // 2) ESPN: fallback gratuito (sem key, rodadas inferidas pelo greedy algorithm)
    if (!partidas) {
        partidas = await buscarViaEspn(temporada);
        if (partidas && partidas.length > 0) {
            fonte = 'espn';
            // Preservar rodadas do MongoDB para partidas ESPN sem rodada definida.
            const cal = await CalendarioBrasileirao.findOne({ temporada });
            if (cal) {
                for (const p of partidas) {
                    if (!p.rodada || p.rodada === 0) {
                        const existente = cal.partidas.find(e =>
                            e.mandante_id === p.mandante_id &&
                            e.visitante_id === p.visitante_id &&
                            e.rodada >= 1 && e.rodada <= 38
                        );
                        if (existente) p.rodada = existente.rodada;
                    }
                }
            }
        }
    }

    // 3) Globo: fallback scraper (não implementado completamente)
    if (!partidas) {
        partidas = await buscarViaGlobo(temporada);
        if (partidas && partidas.length > 0) {
            fonte = 'globo';
        }
    }

    // Se conseguiu dados, salvar
    if (partidas && partidas.length > 0) {
        // Full sync: replaceMode elimina lixo de seeds/syncs antigos
        const calendario = await CalendarioBrasileirao.importarPartidas(temporada, partidas, fonte, { replaceMode: true });

        state.ultimoSync = new Date();
        state.fonteAtual = fonte;
        state.erro = null;
        state.stats.syncCount++;
        state.stats.lastSuccess = { fonte, jogos: partidas.length, data: new Date() };

        // Invalidar cache de classificação — dados mudaram
        _classificacaoCache.ts = 0;

        console.log(`[BRASILEIRAO-SERVICE] ✅ Sync completo: ${partidas.length} jogos via ${fonte}`);

        return {
            success: true,
            fonte,
            calendario,
            jogosImportados: partidas.length,
            ultimoSync: state.ultimoSync,
        };
    }

    // Se não conseguiu dados de nenhuma fonte, retornar cache
    const calendarioCache = await CalendarioBrasileirao.findOne({ temporada }).lean();
    if (calendarioCache) {
        console.log('[BRASILEIRAO-SERVICE] Usando cache (fontes indisponíveis)');
        return {
            success: true,
            fonte: 'cache',
            calendario: calendarioCache,
            aviso: 'Dados podem estar desatualizados',
            ultimoSync: calendarioCache.ultima_atualizacao,
        };
    }

    // Nenhum dado disponível
    state.erro = 'Nenhuma fonte de dados disponível';
    return {
        success: false,
        erro: state.erro,
    };
}

// =====================================================================
// CARTOLA FC — FONTE DE VERDADE PARA RODADA ATUAL
// =====================================================================

let rodadaCartolaCache = { valor: null, timestamp: 0 };
const RODADA_CARTOLA_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Consulta a API do Cartola FC para obter a rodada atual.
 * Cache de 5min. AbortController para timeout (node-fetch v3).
 * @returns {Promise<number|null>}
 */
async function obterRodadaCartola() {
    if (rodadaCartolaCache.valor && Date.now() - rodadaCartolaCache.timestamp < RODADA_CARTOLA_TTL) {
        return rodadaCartolaCache.valor;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch('https://api.cartola.globo.com/mercado/status', {
            signal: controller.signal,
            headers: { 'User-Agent': 'SuperCartolaManager/1.0' },
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        const rodada = data?.rodada_atual;

        if (Number.isInteger(rodada) && rodada >= 1 && rodada <= 38) {
            rodadaCartolaCache = { valor: rodada, timestamp: Date.now() };
            return rodada;
        }

        console.warn('[BRASILEIRAO-SERVICE] Cartola FC retornou rodada invalida:', rodada);
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== 'AbortError') {
            console.warn('[BRASILEIRAO-SERVICE] Falha ao consultar Cartola FC:', err.message);
        }
    }

    return null;
}

// =====================================================================
// API PÚBLICA DO SERVICE
// =====================================================================

/**
 * Obtém calendário completo do Brasileirão
 */
async function obterCalendarioCompleto(temporada, forcarSync = false) {
    // Tentar buscar do banco primeiro (se não forçar sync)
    if (!forcarSync) {
        const calendario = await CalendarioBrasileirao.findOne({ temporada }).lean();
        if (calendario && calendario.partidas.length > 0) {
            // Verificar se está muito desatualizado
            const horasDesdeUpdate = (Date.now() - new Date(calendario.ultima_atualizacao).getTime()) / (1000 * 60 * 60);

            if (horasDesdeUpdate < 24) {
                return {
                    success: true,
                    fonte: 'cache',
                    calendario,
                    stats: calendario.stats,
                };
            }
        }
    }

    // Sincronizar de fontes externas
    return sincronizarTabela(temporada, forcarSync);
}

/**
 * Enriquece um array de jogos com flags de remarcação ativas.
 * Adiciona remarcado=true + data_original/horario_original/rodada_original
 * em jogos que possuem remarcações pendentes (resolvido=false).
 * @param {Array} jogos - partidas do calendário
 * @param {Array} remarcacoes - array de remarcacoes do documento
 * @returns {Array} jogos enriquecidos (novos objetos, sem mutação)
 */
function enriquecerComRemarcacoes(jogos, remarcacoes) {
    if (!remarcacoes || remarcacoes.length === 0) return jogos;

    // Índice de remarcações ativas por mandante_id+visitante_id
    const ativas = new Map();
    for (const rem of remarcacoes) {
        if (rem.resolvido) continue;
        const chave = `${rem.mandante_id}-${rem.visitante_id}`;
        // Guardar apenas a mais recente (último detectado_em)
        const existente = ativas.get(chave);
        if (!existente || rem.detectado_em > existente.detectado_em) {
            ativas.set(chave, rem);
        }
    }

    if (ativas.size === 0) return jogos;

    return jogos.map(jogo => {
        const chave = `${jogo.mandante_id}-${jogo.visitante_id}`;
        const rem = ativas.get(chave);
        if (!rem) return jogo;
        return {
            ...jogo,
            remarcado: true,
            data_original: rem.data_original,
            horario_original: rem.horario_original,
            rodada_original: rem.rodada_original,
        };
    });
}

/**
 * Obtém resumo para exibição (rodada atual + próximas)
 */
async function obterResumoParaExibicao(temporada) {
    const calendario = await CalendarioBrasileirao.findOne({ temporada });

    if (!calendario) {
        return {
            success: false,
            erro: 'Calendário não encontrado',
        };
    }

    // Background sync se dados estão > 2h — não bloqueia a resposta
    if (calendario.ultima_atualizacao) {
        const horasDesde = (Date.now() - new Date(calendario.ultima_atualizacao).getTime()) / 3600000;
        if (horasDesde > 2) {
            sincronizarTabela(temporada, false).catch(e => {
                console.warn('[BRASILEIRAO-SERVICE] Background sync falhou:', e.message);
                state.stats.lastError = { fonte: 'background-sync', erro: e.message, data: new Date() };
            });
        }
    }

    let rodadaAtual = calendario.obterRodadaAtual();
    const rodadaCartola = await obterRodadaCartola();
    if (rodadaCartola) rodadaAtual = rodadaCartola;

    const proximoJogo = calendario.obterProximoJogo();
    const temAoVivo = calendario.temJogosAoVivo();

    // Pegar jogos da rodada atual (enriquecidos com remarcações)
    const remarcacoes = calendario.remarcacoes || [];
    const jogosRodadaAtual = enriquecerComRemarcacoes(
        calendario.obterRodada(rodadaAtual),
        remarcacoes
    );

    // Pegar próximas 3 rodadas
    const proximasRodadas = [];
    for (let r = rodadaAtual + 1; r <= Math.min(rodadaAtual + 3, 38); r++) {
        const jogos = calendario.obterRodada(r);
        if (jogos.length > 0) {
            const datas = [...new Set(jogos.map(j => j.data))].sort();
            proximasRodadas.push({
                numero: r,
                data_inicio: datas[0],
                data_fim: datas[datas.length - 1],
                total_jogos: jogos.length,
            });
        }
    }

    // Remarcações ativas (para exibição na LP)
    const remarcacoesAtivas = remarcacoes.filter(r => !r.resolvido);

    return {
        success: true,
        temporada,
        rodada_atual: rodadaAtual,
        tem_jogos_ao_vivo: temAoVivo,
        proximo_jogo: proximoJogo,
        jogos_rodada_atual: jogosRodadaAtual,
        proximas_rodadas: proximasRodadas,
        remarcacoes_ativas: remarcacoesAtivas,
        stats: calendario.stats,
        ultima_atualizacao: calendario.ultima_atualizacao,
    };
}

/**
 * Obtém status do serviço (para admin)
 */
function obterStatus() {
    return {
        ultimoSync: state.ultimoSync,
        fonteAtual: state.fonteAtual,
        erro: state.erro,
        stats: state.stats,
        config: {
            cacheTtlHoras: CONFIG.CACHE_TTL_MS / (1000 * 60 * 60),
            syncIntervalHoras: CONFIG.SYNC_INTERVAL_MS / (1000 * 60 * 60),
        },
    };
}

/**
 * Obtém todas as rodadas agrupadas (para tela completa)
 */
async function obterTodasRodadas(temporada) {
    const calendario = await CalendarioBrasileirao.findOne({ temporada });

    if (!calendario) {
        return {
            success: false,
            erro: 'Calendário não encontrado',
        };
    }

    const remarcacoesTodas = calendario.remarcacoes || [];

    // Enriquecer partidas de cada rodada com flags de remarcação
    const rodasBruto = calendario.agruparPorRodada();
    const rodadas = {};
    for (const [num, rodada] of Object.entries(rodasBruto)) {
        rodadas[num] = {
            ...rodada,
            partidas: enriquecerComRemarcacoes(rodada.partidas, remarcacoesTodas),
        };
    }

    // Recalcular rodada_atual dinamicamente (stats do MongoDB podem estar stale)
    // NOTA: ...calendario.stats não funciona em subdocumento Mongoose — extrair explicitamente
    let rodadaAtualDinamica = calendario.obterRodadaAtual();
    const rodadaCartolaRodadas = await obterRodadaCartola();
    if (rodadaCartolaRodadas) rodadaAtualDinamica = rodadaCartolaRodadas;

    const s = calendario.stats;

    return {
        success: true,
        temporada,
        total_rodadas: Object.keys(rodadas).length,
        rodadas,
        remarcacoes_ativas: remarcacoesTodas.filter(r => !r.resolvido),
        stats: {
            total_jogos:           s.total_jogos,
            jogos_realizados:      s.jogos_realizados,
            jogos_restantes:       s.jogos_restantes,
            ultima_rodada_completa: s.ultima_rodada_completa,
            rodada_atual:          rodadaAtualDinamica, // sempre recalculado
        },
        ultima_atualizacao: calendario.ultima_atualizacao,
    };
}

// =====================================================================
// INTEGRAÇÃO COM JOGOS AO VIVO
// =====================================================================

/**
 * Converte statusRaw do jogos-ao-vivo para nosso enum de status
 */
function converterStatusAoVivo(statusRaw) {
    const statusMap = {
        '1H': 'ao_vivo', 'HT': 'ao_vivo', '2H': 'ao_vivo',
        'ET': 'ao_vivo', 'P': 'ao_vivo', 'BT': 'ao_vivo', 'LIVE': 'ao_vivo',
        'FT': 'encerrado', 'AET': 'encerrado', 'PEN': 'encerrado',
        'NS': 'agendado', 'TBD': 'a_definir',
        'PST': 'adiado', 'CANC': 'cancelado',
        'INT': 'adiado', 'SUSP': 'adiado', 'ABD': 'cancelado',
        'AWD': 'encerrado', 'WO': 'encerrado',
    };
    return statusMap[statusRaw] || null;
}

/**
 * Atualiza placares e status das partidas do CalendarioBrasileirao
 * usando dados do sistema jogos-ao-vivo (tempo real)
 *
 * @param {number} temporada - Ano da temporada
 * @param {Array} jogosAoVivo - Array de jogos do /api/jogos-ao-vivo filtrados para Brasileirão A
 * @returns {Promise<Object>} Resultado com quantidade de atualizações
 */
async function atualizarPlacaresAoVivo(temporada, jogosAoVivo) {
    if (!jogosAoVivo || jogosAoVivo.length === 0) {
        return { success: true, atualizados: 0 };
    }

    const calendario = await CalendarioBrasileirao.findOne({ temporada });
    if (!calendario) {
        return { success: false, erro: 'Calendário não encontrado' };
    }

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let atualizados = 0;

    for (const jogo of jogosAoVivo) {
        const novoStatus = converterStatusAoVivo(jogo.statusRaw);
        if (!novoStatus) continue;

        // Tentar match por id_externo primeiro (mais preciso)
        let idx = -1;
        if (jogo.id) {
            idx = calendario.partidas.findIndex(p => p.id_externo === String(jogo.id));
        }

        // Fallback: match por mandante_id + visitante_id + data
        if (idx < 0) {
            const mandanteId = getCartolaId(jogo.mandante);
            const visitanteId = getCartolaId(jogo.visitante);

            if (mandanteId && visitanteId) {
                idx = calendario.partidas.findIndex(p =>
                    p.mandante_id === mandanteId &&
                    p.visitante_id === visitanteId &&
                    p.data === hoje
                );
            }
        }

        // Fallback final: match por nomes normalizados + data
        if (idx < 0) {
            const normMandante = (jogo.mandante || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const normVisitante = (jogo.visitante || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

            idx = calendario.partidas.findIndex(p => {
                const pMandante = (p.mandante || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const pVisitante = (p.visitante || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                return p.data === hoje &&
                    (pMandante.includes(normMandante) || normMandante.includes(pMandante)) &&
                    (pVisitante.includes(normVisitante) || normVisitante.includes(pVisitante));
            });
        }

        if (idx < 0) continue;

        const partida = calendario.partidas[idx];
        let mudou = false;

        // Atualizar status
        if (partida.status !== novoStatus) {
            partida.status = novoStatus;
            mudou = true;
        }

        // Atualizar placar (só se tiver dados)
        if (typeof jogo.golsMandante === 'number' && typeof jogo.golsVisitante === 'number') {
            if (partida.placar_mandante !== jogo.golsMandante || partida.placar_visitante !== jogo.golsVisitante) {
                partida.placar_mandante = jogo.golsMandante;
                partida.placar_visitante = jogo.golsVisitante;
                mudou = true;
            }
        }

        // Guardar id_externo se não tinha
        if (!partida.id_externo && jogo.id) {
            partida.id_externo = String(jogo.id);
            mudou = true;
        }

        if (mudou) atualizados++;
    }

    // Persistir se houve mudanças e invalidar caches dependentes
    if (atualizados > 0) {
        calendario.ultima_atualizacao = new Date();
        calendario.atualizarStats();
        await calendario.save();
        // Invalidar cache de classificação (depende dos placares)
        _classificacaoCache.ts = 0;
        console.log(`[BRASILEIRAO-SERVICE] Placares ao vivo: ${atualizados} partidas atualizadas (cache classificação invalidado)`);
    }

    return { success: true, atualizados };
}

/**
 * Busca jogos ao vivo do Brasileirão via endpoint interno e atualiza MongoDB.
 * Retorna resumo com dados frescos. Cache de 30s em memória.
 *
 * @param {number} temporada - Ano da temporada
 * @returns {Promise<Object>} Resumo atualizado
 */
async function obterResumoAoVivo(temporada) {
    const agora = Date.now();

    // Retornar cache se ainda fresco (30s)
    if (aoVivoCache.data && (agora - aoVivoCache.timestamp) < CONFIG.AO_VIVO_CACHE_TTL_MS) {
        return aoVivoCache.data;
    }

    try {
        // Buscar jogos ao vivo internamente (via fetch local)
        // node-fetch v3 não suporta 'timeout' — usar AbortController
        const aoVivoController = new AbortController();
        const aoVivoTimeoutId = setTimeout(() => aoVivoController.abort(), 10000);
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jogos-ao-vivo`, {
            signal: aoVivoController.signal,
        });
        clearTimeout(aoVivoTimeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const dados = await response.json();
        const jogos = dados.jogos || [];

        // Filtrar apenas Brasileirão Série A
        const jogosBrasileirao = jogos.filter(j =>
            j.ligaId === CONFIG.API_FOOTBALL_LEAGUE_ID ||
            (j.liga && j.liga.toLowerCase().includes('brasileir') && j.liga.toLowerCase().includes(' a'))
        );

        // Atualizar MongoDB com placares ao vivo
        if (jogosBrasileirao.length > 0) {
            await atualizarPlacaresAoVivo(temporada, jogosBrasileirao);
        }

        // Retornar resumo atualizado
        const resumo = await obterResumoParaExibicao(temporada);

        // Enriquecer com flag de fonte ao vivo
        const resultado = {
            ...resumo,
            fonte_ao_vivo: jogosBrasileirao.length > 0,
            jogos_ao_vivo_count: jogosBrasileirao.filter(j =>
                ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'].includes(j.statusRaw)
            ).length,
        };

        // Atualizar cache em memória
        aoVivoCache = { data: resultado, timestamp: agora };

        return resultado;

    } catch (error) {
        console.warn('[BRASILEIRAO-SERVICE] Erro ao buscar jogos ao vivo:', error.message);
        // Fallback: retornar resumo normal do MongoDB
        return obterResumoParaExibicao(temporada);
    }
}

/**
 * Retorna classificação calculada a partir dos jogos encerrados
 * Cache em memória: 5 minutos
 */
let _classificacaoCache = { data: null, ts: 0 };
const CLASSIFICACAO_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function obterClassificacao(temporada) {
    const agora = Date.now();
    if (_classificacaoCache.data && (agora - _classificacaoCache.ts) < CLASSIFICACAO_CACHE_TTL) {
        return _classificacaoCache.data;
    }

    try {
        const calendario = await CalendarioBrasileirao.findOne({ temporada });

        if (!calendario || !calendario.partidas || calendario.partidas.length === 0) {
            return { success: false, erro: 'Calendário não encontrado' };
        }

        const classificacao = calendario.calcularClassificacao();
        let rodadaAtual = calendario.obterRodadaAtual();
        const rodadaCartola = await obterRodadaCartola();
        if (rodadaCartola) rodadaAtual = rodadaCartola;

        const resultado = {
            success: true,
            temporada,
            rodada_atual: rodadaAtual,
            classificacao,
            ultima_atualizacao: calendario.ultima_atualizacao,
        };

        _classificacaoCache = { data: resultado, ts: agora };
        return resultado;

    } catch (error) {
        console.error('[BRASILEIRAO-SERVICE] Erro classificacao:', error);
        return { success: false, erro: 'Erro ao calcular classificação' };
    }
}

// =====================================================================
// EXPORTS
// =====================================================================

export default {
    sincronizarTabela,
    obterCalendarioCompleto,
    obterResumoParaExibicao,
    obterResumoAoVivo,
    atualizarPlacaresAoVivo,
    obterTodasRodadas,
    obterStatus,
    getCartolaId,
    obterRodadaCartola,
    obterClassificacao,
};

export {
    sincronizarTabela,
    obterCalendarioCompleto,
    obterResumoParaExibicao,
    obterResumoAoVivo,
    atualizarPlacaresAoVivo,
    obterTodasRodadas,
    obterStatus,
    getCartolaId,
    obterRodadaCartola,
    obterClassificacao,
};
