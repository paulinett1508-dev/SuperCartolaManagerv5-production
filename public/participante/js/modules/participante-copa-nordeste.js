// participante-copa-nordeste.js
// v3.0 - Controller da Landing Page "Copa do Nordeste 2026"
// v3.0: Live Experience — polling adaptativo, endpoint /ao-vivo, indicadores live/stale
// v2.0: Dados dinâmicos via /api/competicao/copa-nordeste (SoccerDataAPI + Globo)
//       Fallback: dados hardcoded para quando API ainda não tem dados
//
// Fontes de dados:
//   - API: /api/competicao/copa-nordeste/ao-vivo (atualiza MongoDB + retorna dados frescos)
//   - API: /api/noticias/copa-nordeste (Google News RSS, cache 1h)
//   - Fallback: dados estáticos hardcoded abaixo


// ═══════════════════════════════════════════════════
// DADOS ESTÁTICOS (FALLBACK)
// ═══════════════════════════════════════════════════

// Grupos da Copa do Nordeste 2026 — 20 times, 4 grupos de 5
const GRUPOS_FALLBACK = {
    A: { label: 'Grupo A', times: [{ nome: 'Vitória', destaque: true }, { nome: 'ASA' }, { nome: 'Sousa' }, { nome: 'Itabaiana' }, { nome: 'Fluminense-PI' }] },
    B: { label: 'Grupo B', times: [{ nome: 'Juazeirense' }, { nome: 'CRB', destaque: true }, { nome: 'Botafogo-PB' }, { nome: 'Confiança' }, { nome: 'Piauí' }] },
    C: { label: 'Grupo C', times: [{ nome: 'Ceará', destaque: true }, { nome: 'Sport', destaque: true }, { nome: 'América-RN' }, { nome: 'Imperatriz' }, { nome: 'Ferroviário' }] },
    D: { label: 'Grupo D', times: [{ nome: 'Fortaleza', destaque: true }, { nome: 'Retrô' }, { nome: 'ABC' }, { nome: 'Maranhão' }, { nome: 'Jacuipense' }] }
};

// Eventos countdown
const EVENTOS_COPA_NORDESTE = [
    { label: 'Início da Fase de Grupos',  data: new Date('2026-03-25T00:00:00-03:00') },
    { label: 'Fim da Fase de Grupos',     data: new Date('2026-05-04T00:00:00-03:00') },
    { label: 'Quartas de Final',          data: new Date('2026-05-11T00:00:00-03:00') },
    { label: 'Semifinais — Ida',          data: new Date('2026-05-18T00:00:00-03:00') },
    { label: 'Semifinais — Volta',        data: new Date('2026-05-25T00:00:00-03:00') },
    { label: 'Grande Final — Ida',        data: new Date('2026-05-31T00:00:00-03:00') },
    { label: 'Grande Final — Volta',      data: new Date('2026-06-07T00:00:00-03:00') },
];

function proximoEvento() {
    const agora = new Date();
    return EVENTOS_COPA_NORDESTE.find(e => e.data > agora) || EVENTOS_COPA_NORDESTE[EVENTOS_COPA_NORDESTE.length - 1];
}

// Fases da competição — 4 fases
const FASES_COPA_NORDESTE = [
    { fase: 'Fase de Grupos',    info: '25 Mar — 4 Mai 2026',  times: '20 clubes — 4 grupos de 5',  proxima: true },
    { fase: 'Quartas de Final',  info: '11 Mai 2026',          times: '8 clubes — jogo único'                     },
    { fase: 'Semifinais',        info: '18 + 25 Mai 2026',     times: '4 clubes — ida/volta'                      },
    { fase: 'Grande Final',      info: '31 Mai + 7 Jun 2026',  times: 'Ida e volta',                 final: true  },
];

// Dados dinâmicos da API (preenchidos após fetch)
let dadosAPI = null;

// ═══════════════════════════════════════════════════
// POLLING & LIVE STATE
// ═══════════════════════════════════════════════════

let _pollingTimer = null;
let _lastUpdateTs = null;
let _isLive = false;
const POLL_NORMAL_MS = 60_000;          // 60s sem jogos ao vivo
const POLL_LIVE_MS = 30_000;            // 30s com jogos ao vivo
const STALE_THRESHOLD_MS = 5 * 60_000;  // 5min = warning de dados desatualizados

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarCopaNordesteParticipante(params) {
    if (window.Log) Log.info('COPA-NORDESTE', 'Inicializando LP Copa do Nordeste 2026 v3.0...');

    window.destruirCopaNordesteParticipante = destruirCopaNordesteParticipante;

    try {
        // Carregar dados dinâmicos e notícias em paralelo
        const [apiData] = await Promise.all([
            carregarDadosAPI(),
            carregarNoticias(),
        ]);

        dadosAPI = apiData;
        _lastUpdateTs = Date.now();
        _isLive = !!(dadosAPI?.tem_jogos_ao_vivo);

        renderizarInfoHero();
        renderizarGrupos();
        renderizarResultados();
        renderizarFases();
        _atualizarStatsStrip();

        // Iniciar polling adaptativo
        _iniciarPolling();

        if (window.Log) Log.info('COPA-NORDESTE', dadosAPI ? 'LP com dados dinâmicos' : 'LP com dados estáticos (fallback)');
    } catch (erro) {
        console.error('[COPA-NORDESTE] Erro na inicialização:', erro);
    }
}

export function destruirCopaNordesteParticipante() {
    _pararPolling();
    dadosAPI = null;
    _lastUpdateTs = null;
    _isLive = false;
}

// ═══════════════════════════════════════════════════
// POLLING ADAPTATIVO
// ═══════════════════════════════════════════════════

function _iniciarPolling() {
    _pararPolling();
    const intervalo = _isLive ? POLL_LIVE_MS : POLL_NORMAL_MS;
    _pollingTimer = setInterval(_atualizarDados, intervalo);
    if (window.Log) Log.info('COPA-NORDESTE', `Polling ativo: ${intervalo / 1000}s (${_isLive ? 'LIVE' : 'normal'})`);
}

function _pararPolling() {
    if (_pollingTimer) {
        clearInterval(_pollingTimer);
        _pollingTimer = null;
    }
}

async function _atualizarDados() {
    try {
        const apiData = await carregarDadosAPI();
        if (!apiData) return; // Falha silenciosa — mantém dados anteriores

        dadosAPI = apiData;
        _lastUpdateTs = Date.now();

        // Detectar mudança de estado live → ajustar intervalo
        const eraLive = _isLive;
        _isLive = !!(dadosAPI?.tem_jogos_ao_vivo);
        if (_isLive !== eraLive) {
            _iniciarPolling(); // reiniciar com novo intervalo
        }

        // Re-renderizar seções afetadas
        renderizarInfoHero();
        renderizarGrupos();
        renderizarResultados();
        renderizarFases();
        _atualizarStatsStrip();
    } catch (err) {
        if (window.Log) Log.warn('COPA-NORDESTE', 'Erro no polling:', err.message);
    }
}

// ═══════════════════════════════════════════════════
// API DINÂMICA — /ao-vivo (atualiza MongoDB + retorna dados frescos)
// ═══════════════════════════════════════════════════

async function carregarDadosAPI() {
    try {
        const res = await fetch('/api/competicao/copa-nordeste/ao-vivo');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && (data.grupos?.length > 0 || data.ultimos_resultados?.length > 0)) {
            return data;
        }
        return null;
    } catch (err) {
        if (window.Log) Log.warn('COPA-NORDESTE', 'API indisponível, usando fallback:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// INFO HERO — com indicadores live + stale
// ═══════════════════════════════════════════════════

function renderizarInfoHero() {
    const container = document.getElementById('copane-status-chips');
    if (!container) return;

    const evento = proximoEvento();
    let html = '';

    // Chip de jogos ao vivo com live dot pulsante
    if (dadosAPI?.tem_jogos_ao_vivo) {
        html += `<div class="copane-chip copane-chip--live">
            <span class="copane-live-dot"></span>
            <span class="material-icons">sports_soccer</span>
            Jogos ao vivo agora
        </div>`;
    }

    const fasePendente = FASES_COPA_NORDESTE.find(f => f.proxima);
    if (fasePendente) {
        html += `<div class="copane-chip copane-chip--next">
            <span class="material-icons">hourglass_top</span>
            ${fasePendente.fase}
        </div>`;
    }

    if (evento) {
        const dataStr = evento.data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        html += `<div class="copane-chip copane-chip--event">
            <span class="material-icons">event</span>
            ${evento.label} — ${dataStr}
        </div>`;
    }

    // Indicador de atualização com detecção de stale
    if (_lastUpdateTs) {
        const diffMs = Date.now() - _lastUpdateTs;
        const isStale = diffMs > STALE_THRESHOLD_MS;
        const atualizacao = dadosAPI?.ultima_atualizacao
            ? new Date(dadosAPI.ultima_atualizacao)
            : new Date(_lastUpdateTs);
        const tempoStr = atualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (isStale) {
            html += `<div class="copane-chip copane-chip--stale">
                <span class="material-icons">warning</span>
                Dados podem estar desatualizados (${tempoStr})
            </div>`;
        } else {
            html += `<div class="copane-chip copane-chip--done">
                <span class="material-icons">sync</span>
                Atualizado ${tempoStr}
            </div>`;
        }
    }

    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// STATS STRIP DINÂMICO
// ═══════════════════════════════════════════════════

function _atualizarStatsStrip() {
    if (!dadosAPI?.stats) return;

    const items = document.querySelectorAll('.copane-stat-item');
    if (items.length < 4) return;

    const { jogos_realizados, fase_atual } = dadosAPI.stats;

    // Item[2]: trocar "23ª Edição" → jogos realizados
    if (typeof jogos_realizados === 'number') {
        const val2 = items[2].querySelector('.copane-stat-value');
        const lbl2 = items[2].querySelector('.copane-stat-label');
        if (val2 && lbl2) {
            val2.textContent = `${jogos_realizados}`;
            lbl2.textContent = 'Jogos';
        }
    }

    // Item[3]: trocar "7 Jun Final" → fase atual
    if (fase_atual) {
        const val3 = items[3].querySelector('.copane-stat-value');
        const lbl3 = items[3].querySelector('.copane-stat-label');
        if (val3 && lbl3) {
            const faseLabel = fase_atual === 'grupos' ? 'Grupos'
                : fase_atual === 'quartas' ? 'Quartas'
                : fase_atual === 'semis' ? 'Semis'
                : fase_atual === 'final' ? 'Final'
                : fase_atual;
            val3.textContent = faseLabel;
            lbl3.textContent = 'Fase Atual';
        }
    }
}

// ═══════════════════════════════════════════════════
// GRUPOS — Dinâmico (API) ou Estático (fallback)
// ═══════════════════════════════════════════════════

function renderizarGrupos() {
    const container = document.getElementById('copane-grupos');
    if (!container) return;

    // Se tem dados da API com classificação, renderizar tabela
    if (dadosAPI?.grupos?.length > 0) {
        container.innerHTML = dadosAPI.grupos.map(grupo => {
            const timesHtml = grupo.classificacao.map((t, i) => {
                const cls = i < 2 ? 'copane-grupo-time copane-grupo-time--destaque' : 'copane-grupo-time';
                return `<div class="${cls}">
                    <span class="copane-grupo-pos">${i + 1}.</span>
                    <span class="copane-grupo-nome">${t.time}</span>
                    <span class="copane-grupo-pts">${t.pontos}pts</span>
                </div>`;
            }).join('');

            return `
            <div class="copane-grupo-card">
                <div class="copane-grupo-header">
                    <span class="copane-grupo-label">Grupo ${grupo.nome}</span>
                </div>
                <div class="copane-grupo-times">${timesHtml}</div>
            </div>`;
        }).join('');
        return;
    }

    // Fallback: dados estáticos
    container.innerHTML = Object.values(GRUPOS_FALLBACK).map(grupo => {
        const timesHtml = grupo.times.map(t => {
            const cls = t.destaque ? 'copane-grupo-time copane-grupo-time--destaque' : 'copane-grupo-time';
            return `<div class="${cls}">${t.nome}</div>`;
        }).join('');

        return `
        <div class="copane-grupo-card">
            <div class="copane-grupo-header">
                <span class="copane-grupo-label">${grupo.label}</span>
            </div>
            <div class="copane-grupo-times">${timesHtml}</div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// RESULTADOS + PRÓXIMOS JOGOS (só com API)
// ═══════════════════════════════════════════════════

function renderizarResultados() {
    const container = document.getElementById('copane-resultados');
    if (!container) return;

    if (!dadosAPI) {
        container.innerHTML = '<p class="copane-loading-placeholder">Resultados disponíveis quando houver jogos realizados</p>';
        return;
    }

    let html = '';

    // Jogos ao vivo
    if (dadosAPI.jogos_ao_vivo?.length > 0) {
        html += '<div class="copane-resultados-section"><p class="copane-resultados-label">Ao Vivo</p>';
        html += dadosAPI.jogos_ao_vivo.map(j => renderizarJogoCard(j, true)).join('');
        html += '</div>';
    }

    // Últimos resultados
    if (dadosAPI.ultimos_resultados?.length > 0) {
        html += '<div class="copane-resultados-section"><p class="copane-resultados-label">Últimos Resultados</p>';
        html += dadosAPI.ultimos_resultados.map(j => renderizarJogoCard(j, false)).join('');
        html += '</div>';
    }

    // Próximos jogos
    if (dadosAPI.proximos_jogos?.length > 0) {
        html += '<div class="copane-resultados-section"><p class="copane-resultados-label">Próximos Jogos</p>';
        html += dadosAPI.proximos_jogos.map(j => renderizarJogoCard(j, false)).join('');
        html += '</div>';
    }

    container.innerHTML = html || '<p class="copane-loading-placeholder">Nenhum jogo registrado ainda</p>';
}

function renderizarJogoCard(jogo, aoVivo) {
    const placar = jogo.placar_mandante !== null
        ? `${jogo.placar_mandante} x ${jogo.placar_visitante}`
        : jogo.horario || 'A definir';
    const dataStr = jogo.data ? new Date(jogo.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
    const liveClass = aoVivo ? ' copane-jogo--live' : '';
    const liveDot = aoVivo ? '<span class="copane-live-dot copane-live-dot--small"></span>' : '';

    return `
    <div class="copane-jogo-card${liveClass}">
        ${liveDot}
        <span class="copane-jogo-time">${jogo.mandante}</span>
        <span class="copane-jogo-placar">${placar}</span>
        <span class="copane-jogo-time">${jogo.visitante}</span>
        ${dataStr ? `<span class="copane-jogo-data">${dataStr}</span>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════
// FASES (TIMELINE)
// ═══════════════════════════════════════════════════

function renderizarFases() {
    const container = document.getElementById('copane-timeline');
    if (!container) return;

    // Se API tem stats.fase_atual, usar para marcar fase ativa
    const faseAtualAPI = dadosAPI?.stats?.fase_atual;

    container.innerHTML = FASES_COPA_NORDESTE.map(f => {
        const isFinal    = !!f.final;
        let isProxima  = !!f.proxima;
        let isConcluida = !!f.concluida;

        // Override com dados da API se disponível
        if (faseAtualAPI) {
            const faseSlug = f.fase.toLowerCase().replace(/\s+/g, '-').replace('fase-de-', '');
            isProxima = faseSlug.includes(faseAtualAPI) || (faseAtualAPI === 'grupos' && f.proxima);
        }

        const cls = isFinal
            ? 'copane-timeline-item copane-timeline-item--final'
            : isProxima
            ? 'copane-timeline-item copane-timeline-item--active'
            : isConcluida
            ? 'copane-timeline-item copane-timeline-item--done'
            : 'copane-timeline-item';

        const badge = isProxima
            ? '<span class="copane-timeline-badge">em andamento</span>'
            : isConcluida
            ? '<span class="copane-timeline-badge copane-timeline-badge--done">concluída</span>'
            : '';

        return `
        <div class="${cls}">
            <p class="copane-timeline-fase">${f.fase}${badge}</p>
            <p class="copane-timeline-info">${f.info} &bull; ${f.times}</p>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// NOTÍCIAS
// ═══════════════════════════════════════════════════

async function carregarNoticias() {
    const container = document.getElementById('copane-noticias-lista');
    if (!container) return;

    try {
        const res = await fetch('/api/noticias/copa-nordeste');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.noticias) && data.noticias.length > 0) {
            container.innerHTML = data.noticias.map(n => {
                const link = (n.link || '').replace(/"/g, '&quot;');
                const titulo = (n.titulo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const fonte = n.fonte || 'Notícia';
                const tempo = n.tempoRelativo ? `<span class="copane-noticia-tempo">${n.tempoRelativo}</span>` : '';
                return `
                <div class="copane-noticia-card"
                     onclick="window.open('${link}', '_blank')"
                     role="link" tabindex="0">
                    <div class="copane-noticia-icon">
                        <span class="material-icons">article</span>
                    </div>
                    <div class="copane-noticia-text">
                        <p class="copane-noticia-title">${titulo}</p>
                        <div class="copane-noticia-meta">
                            <span class="copane-noticia-fonte">${fonte}</span>
                            ${tempo}
                        </div>
                    </div>
                    <span class="material-icons copane-noticia-chevron">chevron_right</span>
                </div>`;
            }).join('');
        } else {
            container.innerHTML = renderizarNoticiasFallback();
        }
    } catch (err) {
        if (window.Log) Log.warn('COPA-NORDESTE', 'Erro ao carregar notícias:', err);
        container.innerHTML = renderizarNoticiasFallback();
    }
}

function renderizarNoticiasFallback() {
    return `
    <div class="copane-noticia-card">
        <div class="copane-noticia-icon">
            <span class="material-icons">emoji_events</span>
        </div>
        <div class="copane-noticia-text">
            <p class="copane-noticia-title">Copa do Nordeste 2026 — O Nordestão com novo formato: 20 clubes e 4 grupos</p>
            <div class="copane-noticia-meta">
                <span class="copane-noticia-fonte">Liga do Nordeste</span>
            </div>
        </div>
    </div>
    <div class="copane-noticia-card">
        <div class="copane-noticia-icon">
            <span class="material-icons">groups</span>
        </div>
        <div class="copane-noticia-text">
            <p class="copane-noticia-title">Fortaleza, Vitória, Ceará e Sport são os destaques da 23ª edição do torneio regional</p>
            <div class="copane-noticia-meta">
                <span class="copane-noticia-fonte">Copa do Nordeste 2026</span>
            </div>
        </div>
    </div>`;
}
