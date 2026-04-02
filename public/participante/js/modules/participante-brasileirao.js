// PARTICIPANTE-BRASILEIRAO.JS - v2.0
// Controller da Landing Page "Brasileirão Série A 2026"
// v2.0: Padrão resiliente com fallback estático (alinhado com Libertadores/Copa-BR/Copa-NE)
//       Fetch API direto com timeout defensivo. Renderização própria no DOM.
//       BrasileiraoTabela (home faixa) NÃO é mais dependência obrigatória.
//
// Fontes de dados:
//   - API: /api/brasileirao/classificacao/:temporada (classificação dinâmica)
//   - API: /api/brasileirao/resumo/:temporada (jogos da rodada)
//   - Fallback: dados estáticos dos 20 times da Série A 2026

if (window.Log) Log.info('BRASILEIRAO-LP', 'Carregando modulo v2.0...');

// ═══════════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════════

let _ultimaAtualizacao = null;
let _statusInterval = null;
let _autoRefreshInterval = null;
let _visibilityHandler = null;
const _AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 min
const _FETCH_TIMEOUT_MS = 8000; // 8s (< 10s do BrasileiraoTabela, < 15s do nav timeout)

// ═══════════════════════════════════════════════════
// DADOS ESTÁTICOS — FALLBACK (Série A 2026 — 20 times)
// ═══════════════════════════════════════════════════

const TIMES_SERIE_A_2026 = [
    { posicao: 1,  time: 'Palmeiras',           time_id: 275,  sigla: 'PAL' },
    { posicao: 2,  time: 'Botafogo',            time_id: 263,  sigla: 'BOT' },
    { posicao: 3,  time: 'Flamengo',            time_id: 262,  sigla: 'FLA' },
    { posicao: 4,  time: 'Fortaleza',           time_id: 356,  sigla: 'FOR' },
    { posicao: 5,  time: 'Internacional',        time_id: 285,  sigla: 'INT' },
    { posicao: 6,  time: 'São Paulo',            time_id: 276,  sigla: 'SAO' },
    { posicao: 7,  time: 'Bahia',               time_id: 265,  sigla: 'BAH' },
    { posicao: 8,  time: 'Cruzeiro',            time_id: 283,  sigla: 'CRU' },
    { posicao: 9,  time: 'Atlético-MG',         time_id: 282,  sigla: 'CAM' },
    { posicao: 10, time: 'Corinthians',          time_id: 264,  sigla: 'COR' },
    { posicao: 11, time: 'Vasco da Gama',        time_id: 267,  sigla: 'VAS' },
    { posicao: 12, time: 'Grêmio',              time_id: 284,  sigla: 'GRE' },
    { posicao: 13, time: 'Vitória',              time_id: 287,  sigla: 'VIT' },
    { posicao: 14, time: 'Fluminense',           time_id: 266,  sigla: 'FLU' },
    { posicao: 15, time: 'Athletico-PR',         time_id: 293,  sigla: 'CAP' },
    { posicao: 16, time: 'Red Bull Bragantino',  time_id: 280,  sigla: 'RBB' },
    { posicao: 17, time: 'Juventude',            time_id: 286,  sigla: 'JUV' },
    { posicao: 18, time: 'Santos',               time_id: 277,  sigla: 'SAN' },
    { posicao: 19, time: 'Sport',                time_id: 292,  sigla: 'SPT' },
    { posicao: 20, time: 'Mirassol',             time_id: 2305, sigla: 'MIR' },
];

const INFO_CAMPEONATO = {
    formato: '38 rodadas — pontos corridos (turno e returno)',
    inicio: 'Março 2026',
    termino: 'Dezembro 2026',
    times: 20,
    jogos_total: 380,
    vagas_liberta: '4 primeiros → Libertadores 2027',
    vagas_sula: '5º ao 12º → Sul-Americana 2027',
    rebaixamento: '17º ao 20º → Série B 2027',
};

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function _fetchComTimeout(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), _FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        return res;
    } catch (err) {
        clearTimeout(t);
        throw err;
    }
}

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO — Padrão resiliente (igual Copa-NE/Copa-BR/Libertadores)
// ═══════════════════════════════════════════════════

export async function inicializarBrasileiraoParticipante() {
    if (window.Log) Log.info('BRASILEIRAO-LP', 'Inicializando LP Brasileirão 2026 v2.1...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirBrasileiraoParticipante = destruirBrasileiraoParticipante;

    try {
        // Carregar dados dinâmicos em paralelo (com timeout defensivo)
        const [apiClassificacao, apiResumo] = await Promise.all([
            _carregarClassificacao(),
            _carregarResumo(),
        ]);

        // Renderizar — usa fallback se API retornou null
        _renderizarClassificacao(apiClassificacao);
        _renderizarJogosRodada(apiResumo);

        _ultimaAtualizacao = Date.now();
        _atualizarStatus();
        _setupRefreshButton();
        _iniciarAutoRefresh();
        _statusInterval = setInterval(_atualizarStatus, 60000);

        if (window.Log) Log.info('BRASILEIRAO-LP', apiClassificacao ? 'LP com dados dinâmicos' : 'LP com dados estáticos (fallback)');
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', 'Erro na inicialização, usando fallback:', err);
        _renderizarFallbackCompleto();
    }
}

export function destruirBrasileiraoParticipante() {
    _pararAutoRefresh();
    if (_statusInterval) { clearInterval(_statusInterval); _statusInterval = null; }
    _ultimaAtualizacao = null;
}

// ═══════════════════════════════════════════════════
// API — Fetches diretos com try/catch (retornam data ou null)
// ═══════════════════════════════════════════════════

async function _carregarClassificacao() {
    try {
        const temporada = new Date().getFullYear();
        const res = await _fetchComTimeout(`/api/brasileirao/classificacao/${temporada}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.success && data.classificacao && data.classificacao.length > 0) ? data : null;
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', 'API classificação indisponível:', err.message);
        return null;
    }
}

async function _carregarResumo() {
    try {
        const temporada = new Date().getFullYear();
        const res = await _fetchComTimeout(`/api/brasileirao/resumo/${temporada}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.success ? data : null;
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', 'API resumo indisponível:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// RENDERIZAÇÃO — CLASSIFICAÇÃO (dinâmica ou fallback)
// ═══════════════════════════════════════════════════

function _renderizarClassificacao(apiData) {
    const container = document.getElementById('brasileirao-classificacao-container');
    if (!container) return;

    const classificacao = apiData?.classificacao || TIMES_SERIE_A_2026;
    const rodadaAtual = apiData?.rodada_atual || null;
    const isFallback = !apiData;

    // Resolver clube do participante para destaque
    const meuClubeId = window.participanteAuth?.participante?.participante?.clube_id
                    || window.participanteAuth?.participante?.clube_id
                    || null;

    const zonaClass = (pos) => {
        if (pos <= 4) return 'brasileirao-zona-liberta';
        if (pos <= 6) return 'brasileirao-zona-pre-liberta';
        if (pos <= 12) return 'brasileirao-zona-sula';
        if (pos <= 16) return '';
        return 'brasileirao-zona-rebaixa';
    };

    const headerSub = isFallback
        ? 'Aguardando dados — classificação provisória'
        : `Após ${rodadaAtual}ª rodada`;

    const rows = classificacao.map(t => {
        const pos = t.posicao;
        const isMeu = meuClubeId && Number(t.time_id) === Number(meuClubeId);
        const zona = zonaClass(pos);
        const meuClass = isMeu ? ' brasileirao-row-meu' : '';

        if (isFallback) {
            return `<tr class="${zona}${meuClass}">
                <td class="brasileirao-pos">${pos}</td>
                <td class="brasileirao-time">${escapeHtml(t.time)}</td>
                <td class="brasileirao-pts" style="opacity:0.4">-</td>
                <td class="brasileirao-j" style="opacity:0.4">-</td>
                <td class="brasileirao-sg" style="opacity:0.4">-</td>
            </tr>`;
        }

        return `<tr class="${zona}${meuClass}">
            <td class="brasileirao-pos">${pos}</td>
            <td class="brasileirao-time">${escapeHtml(t.time)}</td>
            <td class="brasileirao-pts">${t.pontos}</td>
            <td class="brasileirao-j">${t.jogos}</td>
            <td class="brasileirao-sg">${t.saldo > 0 ? '+' : ''}${t.saldo}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="brasileirao-class-card">
            <div class="brasileirao-class-header">
                <span class="material-icons" style="color: var(--app-success-light); font-size: 1.1rem;">leaderboard</span>
                <div>
                    <p class="brasileirao-class-title">Classificação</p>
                    <p class="brasileirao-class-sub">${headerSub}</p>
                </div>
            </div>
            <div class="brasileirao-class-table-wrap">
                <table class="brasileirao-class-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Time</th>
                            <th>P</th>
                            <th>J</th>
                            <th>SG</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="brasileirao-class-legenda">
                <span class="brasileirao-leg-item"><span class="brasileirao-leg-dot" style="background:#1B5E20;"></span>Libertadores</span>
                <span class="brasileirao-leg-item"><span class="brasileirao-leg-dot" style="background:#2E7D32;"></span>Pré-Libertadores</span>
                <span class="brasileirao-leg-item"><span class="brasileirao-leg-dot" style="background:#FF9800;"></span>Sul-Americana</span>
                <span class="brasileirao-leg-item"><span class="brasileirao-leg-dot" style="background:#c62828;"></span>Rebaixamento</span>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════
// RENDERIZAÇÃO — JOGOS DA RODADA (dinâmico ou fallback info)
// ═══════════════════════════════════════════════════

function _renderizarJogosRodada(apiData) {
    const container = document.getElementById('brasileirao-tabela-container');
    if (!container) return;

    if (apiData && apiData.jogos_rodada_atual && apiData.jogos_rodada_atual.length > 0) {
        // Renderizar jogos reais
        const rodada = apiData.rodada_atual || '?';
        const jogosHtml = apiData.jogos_rodada_atual.map(j => {
            const statusClass = j.status === 'ao_vivo' ? ' brasileirao-jogo--live' : '';
            const liveDot = j.status === 'ao_vivo' ? '<span class="brasileirao-live-dot"></span>' : '';
            const placar = j.placar_mandante !== null && j.placar_mandante !== undefined
                ? `${j.placar_mandante} x ${j.placar_visitante}`
                : j.horario || 'A definir';

            return `<div class="brasileirao-jogo-card${statusClass}">
                ${liveDot}
                <span class="brasileirao-jogo-time">${escapeHtml(j.mandante)}</span>
                <span class="brasileirao-jogo-placar">${placar}</span>
                <span class="brasileirao-jogo-time">${escapeHtml(j.visitante)}</span>
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="brasileirao-rodada-card">
                <div class="brasileirao-rodada-header">
                    <span class="material-icons" style="color: var(--app-success-light); font-size: 1rem;">sports_soccer</span>
                    <span>Rodada ${rodada}</span>
                </div>
                <div class="brasileirao-jogos-lista">${jogosHtml}</div>
            </div>
        `;
    } else {
        // Fallback: info do campeonato (mesmo padrão das fases do Copa-NE/Copa-BR)
        container.innerHTML = `
            <div class="brasileirao-info-card">
                <div class="brasileirao-info-header">
                    <span class="material-icons" style="color: var(--app-success-light); font-size: 1rem;">info</span>
                    <span>Sobre o Campeonato</span>
                </div>
                <div class="brasileirao-info-items">
                    <div class="brasileirao-info-item">
                        <span class="material-icons">calendar_month</span>
                        <div>
                            <p class="brasileirao-info-label">Período</p>
                            <p class="brasileirao-info-value">${INFO_CAMPEONATO.inicio} a ${INFO_CAMPEONATO.termino}</p>
                        </div>
                    </div>
                    <div class="brasileirao-info-item">
                        <span class="material-icons">format_list_numbered</span>
                        <div>
                            <p class="brasileirao-info-label">Formato</p>
                            <p class="brasileirao-info-value">${INFO_CAMPEONATO.formato}</p>
                        </div>
                    </div>
                    <div class="brasileirao-info-item">
                        <span class="material-icons">emoji_events</span>
                        <div>
                            <p class="brasileirao-info-label">Libertadores</p>
                            <p class="brasileirao-info-value">${INFO_CAMPEONATO.vagas_liberta}</p>
                        </div>
                    </div>
                    <div class="brasileirao-info-item">
                        <span class="material-icons">trending_down</span>
                        <div>
                            <p class="brasileirao-info-label">Rebaixamento</p>
                            <p class="brasileirao-info-value">${INFO_CAMPEONATO.rebaixamento}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════
// FALLBACK COMPLETO (catch do try principal)
// ═══════════════════════════════════════════════════

function _renderizarFallbackCompleto() {
    _renderizarClassificacao(null);
    _renderizarJogosRodada(null);
    _ultimaAtualizacao = Date.now();
    _atualizarStatus();
    _setupRefreshButton();
}

// ═══════════════════════════════════════════════════
// REFRESH BUTTON + AUTO-REFRESH (padrão Copa-NE/Libertadores)
// ═══════════════════════════════════════════════════

function _setupRefreshButton() {
    const btn = document.getElementById('brasileirao-refresh');
    if (!btn) return;
    // cloneNode to clear stale listeners on SPA re-navigation
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', async () => {
        const icon = fresh.querySelector('.material-icons');
        if (!icon || fresh.disabled) return;
        fresh.disabled = true;
        icon.classList.add('spinning');
        try {
            const [apiClassificacao, apiResumo] = await Promise.all([
                _carregarClassificacao(),
                _carregarResumo(),
            ]);
            _renderizarClassificacao(apiClassificacao);
            _renderizarJogosRodada(apiResumo);
            _ultimaAtualizacao = Date.now();
            _atualizarStatus();
        } finally {
            icon.classList.remove('spinning');
            fresh.disabled = false;
        }
    });
}

function _iniciarAutoRefresh() {
    _pararAutoRefresh();
    _autoRefreshInterval = setInterval(() => {
        if (!document.hidden) _atualizarDados();
    }, _AUTO_REFRESH_MS);
    _visibilityHandler = () => {
        if (!document.hidden && _ultimaAtualizacao && (Date.now() - _ultimaAtualizacao > _AUTO_REFRESH_MS)) {
            _atualizarDados();
        }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
}

function _pararAutoRefresh() {
    if (_autoRefreshInterval) { clearInterval(_autoRefreshInterval); _autoRefreshInterval = null; }
    if (_visibilityHandler) { document.removeEventListener('visibilitychange', _visibilityHandler); _visibilityHandler = null; }
}

async function _atualizarDados() {
    try {
        const [apiClassificacao, apiResumo] = await Promise.all([
            _carregarClassificacao(),
            _carregarResumo(),
        ]);
        if (apiClassificacao) _renderizarClassificacao(apiClassificacao);
        if (apiResumo) _renderizarJogosRodada(apiResumo);
        _ultimaAtualizacao = Date.now();
        _atualizarStatus();
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', 'Erro no auto-refresh:', err.message);
    }
}

// ═══════════════════════════════════════════════════
// STATUS (padrão Libertadores/Copa-NE)
// ═══════════════════════════════════════════════════

function _atualizarStatus() {
    const el = document.getElementById('brasileirao-status');
    if (!el || !_ultimaAtualizacao) { if (el) el.textContent = ''; return; }
    const diffMin = Math.floor((Date.now() - _ultimaAtualizacao) / 60000);
    if (diffMin < 1) el.textContent = 'Atualizado agora';
    else if (diffMin < 60) el.textContent = `Atualizado há ${diffMin} min`;
    else el.textContent = `Atualizado há ${Math.floor(diffMin / 60)}h`;
}
