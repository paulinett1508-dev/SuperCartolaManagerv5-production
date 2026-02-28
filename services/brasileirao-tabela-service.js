// =====================================================================
// BRASILEIRAO TABELA SERVICE - v1.1
// Service para buscar tabela completa do Brasileirão de múltiplas fontes
// Ordem de prioridade: API-Football → Globo Scraper → Cache
// v1.1: Integração com jogos-ao-vivo para placares em tempo real
// =====================================================================

import fetch from 'node-fetch';
import CalendarioBrasileirao from '../models/CalendarioBrasileirao.js';

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
    'coritiba': 270,
    'america mineiro': 273,
    'américa-mg': 273,
    'chapecoense': 274,
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
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Formata hora ISO para HH:MM (horário de Brasília)
 */
function formatarHora(dataISO) {
    if (!dataISO) return '00:00';
    const date = new Date(dataISO);
    return date.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// =====================================================================
// FONTE 1: API-FOOTBALL
// =====================================================================

/**
 * Busca todos os jogos do Brasileirão via API-Football
 * @param {number} temporada - Ano da temporada (ex: 2026)
 * @returns {Promise<Array>} Array de partidas formatadas
 */
async function buscarViaApiFootball(temporada) {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) {
        console.warn('[BRASILEIRAO-SERVICE] API_FOOTBALL_KEY não configurada');
        return null;
    }

    console.log(`[BRASILEIRAO-SERVICE] Buscando temporada ${temporada} via API-Football...`);

    try {
        const url = `https://v3.football.api-sports.io/fixtures?league=${CONFIG.API_FOOTBALL_LEAGUE_ID}&season=${temporada}`;

        const response = await fetch(url, {
            headers: {
                'x-apisports-key': apiKey,
            },
            timeout: CONFIG.REQUEST_TIMEOUT_MS,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.response || !Array.isArray(data.response)) {
            console.warn('[BRASILEIRAO-SERVICE] Resposta inválida da API-Football');
            return null;
        }

        console.log(`[BRASILEIRAO-SERVICE] API-Football retornou ${data.response.length} jogos`);

        // Converter para nosso formato
        const partidas = data.response.map(fixture => ({
            id_externo: String(fixture.fixture.id),
            rodada: extrairRodada(fixture.league.round),
            data: formatarData(fixture.fixture.date),
            horario: formatarHora(fixture.fixture.date),
            mandante: fixture.teams.home.name,
            visitante: fixture.teams.away.name,
            mandante_id: getCartolaId(fixture.teams.home.name),
            visitante_id: getCartolaId(fixture.teams.away.name),
            placar_mandante: fixture.goals.home,
            placar_visitante: fixture.goals.away,
            status: converterStatusApiFootball(fixture.fixture.status.short),
            estadio: fixture.fixture.venue?.name || null,
            cidade: fixture.fixture.venue?.city || null,
        }));

        // Filtrar apenas partidas com rodada válida (1-38)
        return partidas.filter(p => p.rodada >= 1 && p.rodada <= 38);

    } catch (error) {
        console.error('[BRASILEIRAO-SERVICE] Erro API-Football:', error.message);
        state.stats.lastError = { fonte: 'api-football', erro: error.message, data: new Date() };
        return null;
    }
}

/**
 * Extrai número da rodada do formato "Regular Season - 5"
 */
function extrairRodada(roundString) {
    if (!roundString) return 0;
    const match = roundString.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// =====================================================================
// FONTE 2: GLOBO ESPORTE (SCRAPER)
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

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SuperCartolaBot/1.0)',
            },
            timeout: CONFIG.REQUEST_TIMEOUT_MS,
        });

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
            const calendario = await CalendarioBrasileirao.findOne({ temporada });
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

    // Tentar API-Football primeiro
    partidas = await buscarViaApiFootball(temporada);
    if (partidas && partidas.length > 0) {
        fonte = 'api-football';
    }

    // Fallback para Globo
    if (!partidas) {
        partidas = await buscarViaGlobo(temporada);
        if (partidas && partidas.length > 0) {
            fonte = 'globo';
        }
    }

    // Se conseguiu dados, salvar
    if (partidas && partidas.length > 0) {
        const calendario = await CalendarioBrasileirao.importarPartidas(temporada, partidas, fonte);

        state.ultimoSync = new Date();
        state.fonteAtual = fonte;
        state.erro = null;
        state.stats.syncCount++;
        state.stats.lastSuccess = { fonte, jogos: partidas.length, data: new Date() };

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
    const calendarioCache = await CalendarioBrasileirao.findOne({ temporada });
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

    const rodadaAtual = calendario.obterRodadaAtual();
    const proximoJogo = calendario.obterProximoJogo();
    const temAoVivo = calendario.temJogosAoVivo();

    // Pegar jogos da rodada atual
    const jogosRodadaAtual = calendario.obterRodada(rodadaAtual);

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

    return {
        success: true,
        temporada,
        rodada_atual: rodadaAtual,
        tem_jogos_ao_vivo: temAoVivo,
        proximo_jogo: proximoJogo,
        jogos_rodada_atual: jogosRodadaAtual,
        proximas_rodadas: proximasRodadas,
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

    const rodadas = calendario.agruparPorRodada();

    return {
        success: true,
        temporada,
        total_rodadas: Object.keys(rodadas).length,
        rodadas,
        stats: calendario.stats,
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

    // Persistir se houve mudanças
    if (atualizados > 0) {
        calendario.ultima_atualizacao = new Date();
        calendario.atualizarStats();
        await calendario.save();
        console.log(`[BRASILEIRAO-SERVICE] Placares ao vivo: ${atualizados} partidas atualizadas`);
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
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jogos-ao-vivo`, {
            timeout: 10000,
        });

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
};
