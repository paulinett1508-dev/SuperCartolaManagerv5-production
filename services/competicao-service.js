// =====================================================================
// COMPETICAO SERVICE - v1.0
// Serviço genérico para dados dinâmicos de qualquer competição
// Fontes: SoccerDataAPI + Globo Esporte scraper (zero API-Football)
// Padrão: brasileirao-tabela-service.js
// =====================================================================

import CalendarioCompeticao from '../models/CalendarioCompeticao.js';

// =====================================================================
// CONFIGURAÇÃO
// =====================================================================
const CONFIG = {
    CACHE_TTL_MS: 6 * 60 * 60 * 1000,       // 6 horas para sync completo
    AO_VIVO_CACHE_TTL_MS: 30 * 1000,         // 30s cache para dados ao vivo
    REQUEST_TIMEOUT_MS: 10000,
};

// Mapeamento competição → nomes que aparecem no Globo/SoccerData
const MAPA_NOMES = {
    'copa-nordeste':  ['Copa do Nordeste', 'Copa Nordeste', 'Nordestão'],
    'copa-brasil':    ['Copa do Brasil'],
    'libertadores':   ['Libertadores', 'Copa Libertadores', 'CONMEBOL Libertadores'],
    'copa-mundo':     ['Copa do Mundo', 'FIFA World Cup', 'World Cup'],
};

// Cache em memória por competição (ao-vivo)
const aoVivoCache = {};

// Estado por competição
const statePerComp = {};

// =====================================================================
// FUNÇÕES AUXILIARES
// =====================================================================

/**
 * Normaliza nome para comparação fuzzy
 */
function normalizar(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Verifica se o nome da liga no jogo corresponde a uma competição
 */
function ligaCorresponde(ligaNome, competicao) {
    const nomesEsperados = MAPA_NOMES[competicao];
    if (!nomesEsperados) return false;
    const ligaNorm = normalizar(ligaNome);
    return nomesEsperados.some(n => ligaNorm.includes(normalizar(n)));
}

/**
 * Converte statusRaw (jogos-ao-vivo / Globo) para nosso enum
 */
function converterStatus(statusRaw) {
    const map = {
        '1H': 'ao_vivo', 'HT': 'ao_vivo', '2H': 'ao_vivo',
        'ET': 'ao_vivo', 'P': 'ao_vivo', 'BT': 'ao_vivo', 'LIVE': 'ao_vivo',
        'FT': 'encerrado', 'AET': 'encerrado', 'PEN': 'encerrado',
        'NS': 'agendado', 'TBD': 'a_definir',
        'PST': 'adiado', 'CANC': 'cancelado',
        'INT': 'adiado', 'SUSP': 'adiado', 'ABD': 'cancelado',
        'AWD': 'encerrado', 'WO': 'encerrado',
    };
    return map[statusRaw] || null;
}

/**
 * Infere fase/grupo a partir do nome da liga e contexto
 * Copa do Nordeste: grupos na 1ª fase, depois quartas/semis/final
 * Copa do Brasil: fases nomeadas (5a-fase, oitavas, etc.)
 * Libertadores: grupos na 1ª fase, depois oitavas em diante
 */
function inferirFaseGrupo(competicao, jogo) {
    // Por enquanto, retorna null — a fase/grupo será populada via seed ou update manual
    // Quando mais dados estiverem disponíveis, heurísticas podem ser adicionadas
    return { fase: null, grupo: null };
}

// =====================================================================
// SYNC COM GLOBO ESPORTE
// =====================================================================

/**
 * Sincroniza partidas de uma competição a partir dos dados do jogos-ao-vivo
 * (que já contém dados do Globo + SoccerDataAPI mesclados)
 *
 * @param {string} competicao - Slug da competição
 * @param {number} temporada - Ano
 * @param {Array} todosJogos - Array de jogos do /api/jogos-ao-vivo
 */
async function sincronizarDeJogosAoVivo(competicao, temporada, todosJogos) {
    if (!todosJogos || todosJogos.length === 0) return null;

    // Filtrar jogos desta competição
    const jogosCompeticao = todosJogos.filter(j => ligaCorresponde(j.liga || j.ligaOriginal, competicao));

    if (jogosCompeticao.length === 0) return null;

    const partidasNovas = jogosCompeticao.map(j => {
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const { fase, grupo } = inferirFaseGrupo(competicao, j);

        return {
            id_externo: j.id ? String(j.id) : null,
            fase,
            grupo,
            data: hoje,
            horario: j.horario || '00:00',
            mandante: j.mandante,
            visitante: j.visitante,
            placar_mandante: typeof j.golsMandante === 'number' ? j.golsMandante : null,
            placar_visitante: typeof j.golsVisitante === 'number' ? j.golsVisitante : null,
            status: converterStatus(j.statusRaw) || 'agendado',
            estadio: j.estadio || null,
        };
    });

    try {
        const calendario = await CalendarioCompeticao.importarPartidas(competicao, temporada, partidasNovas, 'globo');
        console.log(`[COMPETICAO-SERVICE] ${competicao}: ${partidasNovas.length} partidas sincronizadas`);
        return calendario;
    } catch (err) {
        console.error(`[COMPETICAO-SERVICE] Erro ao sincronizar ${competicao}:`, err.message);
        return null;
    }
}

// =====================================================================
// ATUALIZAÇÃO DE PLACARES AO VIVO
// =====================================================================

/**
 * Atualiza placares de uma competição usando dados do jogos-ao-vivo
 * Segue padrão de brasileirao-tabela-service.js:atualizarPlacaresAoVivo
 */
async function atualizarPlacaresAoVivo(competicao, temporada, jogosAoVivo) {
    if (!jogosAoVivo || jogosAoVivo.length === 0) {
        return { success: true, atualizados: 0 };
    }

    // Filtrar jogos desta competição
    const jogosComp = jogosAoVivo.filter(j => ligaCorresponde(j.liga || j.ligaOriginal, competicao));
    if (jogosComp.length === 0) {
        return { success: true, atualizados: 0 };
    }

    const calendario = await CalendarioCompeticao.findOne({ competicao, temporada });
    if (!calendario) {
        // Primeiro contato — criar e popular
        return sincronizarDeJogosAoVivo(competicao, temporada, jogosAoVivo)
            ? { success: true, atualizados: jogosComp.length, criado: true }
            : { success: true, atualizados: 0 };
    }

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let atualizados = 0;

    for (const jogo of jogosComp) {
        const novoStatus = converterStatus(jogo.statusRaw);
        if (!novoStatus) continue;

        // Match por id_externo
        let idx = -1;
        if (jogo.id) {
            idx = calendario.partidas.findIndex(p => p.id_externo === String(jogo.id));
        }

        // Fallback: match por nomes normalizados + data
        if (idx < 0) {
            const normM = normalizar(jogo.mandante);
            const normV = normalizar(jogo.visitante);

            idx = calendario.partidas.findIndex(p => {
                if (p.data !== hoje) return false;
                const pM = normalizar(p.mandante);
                const pV = normalizar(p.visitante);
                return (pM.includes(normM) || normM.includes(pM)) &&
                       (pV.includes(normV) || normV.includes(pV));
            });
        }

        if (idx < 0) {
            // Jogo novo — adicionar
            calendario.partidas.push({
                id_externo: jogo.id ? String(jogo.id) : null,
                data: hoje,
                horario: jogo.horario || '00:00',
                mandante: jogo.mandante,
                visitante: jogo.visitante,
                placar_mandante: typeof jogo.golsMandante === 'number' ? jogo.golsMandante : null,
                placar_visitante: typeof jogo.golsVisitante === 'number' ? jogo.golsVisitante : null,
                status: novoStatus,
                estadio: jogo.estadio || null,
            });
            atualizados++;
            continue;
        }

        const partida = calendario.partidas[idx];
        let mudou = false;

        if (partida.status !== novoStatus) {
            partida.status = novoStatus;
            mudou = true;
        }

        if (typeof jogo.golsMandante === 'number' && typeof jogo.golsVisitante === 'number') {
            if (partida.placar_mandante !== jogo.golsMandante || partida.placar_visitante !== jogo.golsVisitante) {
                partida.placar_mandante = jogo.golsMandante;
                partida.placar_visitante = jogo.golsVisitante;
                mudou = true;
            }
        }

        if (!partida.id_externo && jogo.id) {
            partida.id_externo = String(jogo.id);
            mudou = true;
        }

        if (mudou) atualizados++;
    }

    if (atualizados > 0) {
        calendario.ultima_atualizacao = new Date();
        calendario.atualizarStats();
        calendario.calcularClassificacao();
        await calendario.save();
        console.log(`[COMPETICAO-SERVICE] ${competicao}: ${atualizados} partidas atualizadas ao vivo`);
    }

    return { success: true, atualizados };
}

// =====================================================================
// API PÚBLICA
// =====================================================================

/**
 * Obtém calendário completo de uma competição
 */
async function obterCalendario(competicao, temporada) {
    const calendario = await CalendarioCompeticao.findOne({ competicao, temporada }).lean();

    if (!calendario) {
        return { success: false, erro: 'Calendário não encontrado. Aguardando dados dos jogos.' };
    }

    return {
        success: true,
        competicao,
        temporada,
        partidas: calendario.partidas,
        grupos: calendario.grupos,
        stats: calendario.stats,
        ultima_atualizacao: calendario.ultima_atualizacao,
    };
}

/**
 * Obtém classificação/standings de uma competição
 */
async function obterClassificacao(competicao, temporada) {
    const calendario = await CalendarioCompeticao.findOne({ competicao, temporada });

    if (!calendario) {
        return { success: false, erro: 'Calendário não encontrado' };
    }

    // Recalcular classificação (sempre fresca)
    calendario.calcularClassificacao();
    await calendario.save();

    return {
        success: true,
        competicao,
        temporada,
        grupos: calendario.grupos,
        stats: calendario.stats,
        ultima_atualizacao: calendario.ultima_atualizacao,
    };
}

/**
 * Obtém resumo para exibição na LP (fase atual + próximos jogos + últimos resultados + standings)
 */
async function obterResumo(competicao, temporada) {
    const calendario = await CalendarioCompeticao.findOne({ competicao, temporada });

    if (!calendario) {
        return {
            success: false,
            erro: 'Sem dados ainda. Os dados são populados automaticamente quando há jogos.',
        };
    }

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const temAoVivo = calendario.temJogosAoVivo();
    const proximoJogo = calendario.obterProximoJogo();

    // Últimos 5 resultados
    const ultimosResultados = calendario.partidas
        .filter(p => p.status === 'encerrado')
        .sort((a, b) => b.data.localeCompare(a.data) || b.horario.localeCompare(a.horario))
        .slice(0, 5);

    // Próximos 5 jogos
    const proximosJogos = calendario.partidas
        .filter(p => p.status === 'agendado' || p.status === 'a_definir')
        .sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario))
        .slice(0, 5);

    // Jogos ao vivo
    const jogosAoVivo = calendario.partidas
        .filter(p => p.status === 'ao_vivo')
        .sort((a, b) => a.horario.localeCompare(b.horario));

    // Classificação atualizada
    calendario.calcularClassificacao();

    return {
        success: true,
        competicao,
        temporada,
        tem_jogos_ao_vivo: temAoVivo,
        proximo_jogo: proximoJogo,
        jogos_ao_vivo: jogosAoVivo,
        ultimos_resultados: ultimosResultados,
        proximos_jogos: proximosJogos,
        grupos: calendario.grupos,
        stats: calendario.stats,
        ultima_atualizacao: calendario.ultima_atualizacao,
    };
}

/**
 * Obtém resumo com dados ao vivo (busca no jogos-ao-vivo e atualiza MongoDB)
 * Cache 30s em memória
 */
async function obterResumoAoVivo(competicao, temporada) {
    const agora = Date.now();
    const cacheKey = `${competicao}-${temporada}`;

    if (aoVivoCache[cacheKey] && (agora - aoVivoCache[cacheKey].timestamp) < CONFIG.AO_VIVO_CACHE_TTL_MS) {
        return aoVivoCache[cacheKey].data;
    }

    try {
        // Buscar jogos ao vivo internamente
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jogos-ao-vivo`, {
            timeout: CONFIG.REQUEST_TIMEOUT_MS,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const dados = await response.json();
        const jogos = dados.jogos || [];

        // Atualizar MongoDB com jogos desta competição
        const jogosComp = jogos.filter(j => ligaCorresponde(j.liga || j.ligaOriginal, competicao));
        if (jogosComp.length > 0) {
            await atualizarPlacaresAoVivo(competicao, temporada, jogos);
        }

        // Retornar resumo atualizado
        const resumo = await obterResumo(competicao, temporada);
        const resultado = {
            ...resumo,
            fonte_ao_vivo: jogosComp.length > 0,
        };

        aoVivoCache[cacheKey] = { data: resultado, timestamp: agora };
        return resultado;

    } catch (err) {
        console.warn(`[COMPETICAO-SERVICE] Erro ao-vivo ${competicao}:`, err.message);
        return obterResumo(competicao, temporada);
    }
}

/**
 * Hook chamado pelo jogos-ao-vivo quando retorna dados.
 * Atualiza TODAS as competições que tiverem jogos no retorno.
 */
async function hookAtualizarCompeticoes(todosJogos) {
    if (!todosJogos || todosJogos.length === 0) return;

    const temporada = new Date().getFullYear();

    for (const [competicao, nomes] of Object.entries(MAPA_NOMES)) {
        const temJogos = todosJogos.some(j => ligaCorresponde(j.liga || j.ligaOriginal, competicao));
        if (temJogos) {
            try {
                await atualizarPlacaresAoVivo(competicao, temporada, todosJogos);
            } catch (err) {
                console.error(`[COMPETICAO-SERVICE] Erro hook ${competicao}:`, err.message);
            }
        }
    }
}

// =====================================================================
// EXPORTS
// =====================================================================

export default {
    obterCalendario,
    obterClassificacao,
    obterResumo,
    obterResumoAoVivo,
    atualizarPlacaresAoVivo,
    sincronizarDeJogosAoVivo,
    hookAtualizarCompeticoes,
    ligaCorresponde,
    MAPA_NOMES,
};

export {
    obterCalendario,
    obterClassificacao,
    obterResumo,
    obterResumoAoVivo,
    atualizarPlacaresAoVivo,
    sincronizarDeJogosAoVivo,
    hookAtualizarCompeticoes,
    ligaCorresponde,
    MAPA_NOMES,
};
