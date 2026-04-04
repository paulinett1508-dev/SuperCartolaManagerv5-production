// PARTICIPANTE-BRASILEIRAO.JS - v2.2
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

// Navegação de rodadas
let _rodadaExibida = null;   // rodada atualmente visível no card
let _rodadaAtualRef = null;  // rodada "atual" da temporada (âncora para nav)
let _temporadaAtual = null;  // temporada carregada

// ═══════════════════════════════════════════════════
// DADOS ESTÁTICOS — FALLBACK (Série A 2026 — 20 times)
// ═══════════════════════════════════════════════════

// ATENÇÃO: atualizar a cada temporada conforme promoções/rebaixamentos
// 2026: Fortaleza, Juventude e Sport foram rebaixados.
//       Chapecoense, Coritiba e Remo foram promovidos.
const TIMES_SERIE_A_2026 = [
    { posicao: 1,  time: 'Athletico-PR',         time_id: 293,  sigla: 'CAP' },
    { posicao: 2,  time: 'Atlético-MG',          time_id: 282,  sigla: 'CAM' },
    { posicao: 3,  time: 'Bahia',                time_id: 265,  sigla: 'BAH' },
    { posicao: 4,  time: 'Botafogo',             time_id: 263,  sigla: 'BOT' },
    { posicao: 5,  time: 'Chapecoense',          time_id: 315,  sigla: 'CHA' },
    { posicao: 6,  time: 'Corinthians',          time_id: 264,  sigla: 'COR' },
    { posicao: 7,  time: 'Coritiba',             time_id: 294,  sigla: 'CFC' },
    { posicao: 8,  time: 'Cruzeiro',             time_id: 283,  sigla: 'CRU' },
    { posicao: 9,  time: 'Flamengo',             time_id: 262,  sigla: 'FLA' },
    { posicao: 10, time: 'Fluminense',           time_id: 266,  sigla: 'FLU' },
    { posicao: 11, time: 'Grêmio',              time_id: 284,  sigla: 'GRE' },
    { posicao: 12, time: 'Internacional',        time_id: 285,  sigla: 'INT' },
    { posicao: 13, time: 'Mirassol',             time_id: 2305, sigla: 'MIR' },
    { posicao: 14, time: 'Palmeiras',            time_id: 275,  sigla: 'PAL' },
    { posicao: 15, time: 'Red Bull Bragantino',  time_id: 280,  sigla: 'RBB' },
    { posicao: 16, time: 'Remo',                 time_id: 364,  sigla: 'REM' },
    { posicao: 17, time: 'Santos',               time_id: 277,  sigla: 'SAN' },
    { posicao: 18, time: 'São Paulo',            time_id: 276,  sigla: 'SAO' },
    { posicao: 19, time: 'Vasco da Gama',        time_id: 267,  sigla: 'VAS' },
    { posicao: 20, time: 'Vitória',              time_id: 287,  sigla: 'VIT' },
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
    if (window.Log) Log.info('BRASILEIRAO-LP', 'Inicializando LP Brasileirão 2026 v2.2...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirBrasileiraoParticipante = destruirBrasileiraoParticipante;

    try {
        _temporadaAtual = new Date().getFullYear();

        // Carregar dados dinâmicos em paralelo (com timeout defensivo)
        const [apiClassificacao, apiResumo] = await Promise.all([
            _carregarClassificacao(),
            _carregarResumo(),
        ]);

        // Guardar referência da rodada atual para nav prev/next
        if (apiResumo?.rodada_atual) {
            _rodadaAtualRef = apiResumo.rodada_atual;
            _rodadaExibida = apiResumo.rodada_atual;
        }

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
    _rodadaExibida = null;
    _rodadaAtualRef = null;
    _temporadaAtual = null;
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

/**
 * Formata data YYYY-MM-DD para exibição curta: "Qua, 28 Jan"
 */
function _formatarDataCurta(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const date = new Date(ano, mes - 1, dia);
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${diasSemana[date.getDay()]}, ${dia} ${meses[mes - 1]}`;
}

/**
 * Renderiza badge de status do jogo
 */
function _buildStatusBadge(j) {
    if (j.status === 'ao_vivo') {
        return `<span class="brasileirao-badge brasileirao-badge--live">
            <span class="brasileirao-live-dot"></span>AO VIVO
        </span>`;
    }
    if (j.status === 'encerrado') {
        return `<span class="brasileirao-badge brasileirao-badge--enc">Encerrado</span>`;
    }
    // agendado / a_definir
    return `<span class="brasileirao-badge brasileirao-badge--agd">${escapeHtml(j.horario || 'A definir')}</span>`;
}

/**
 * Renderiza area de placar central
 */
function _buildPlacar(j) {
    const gm = Number.isInteger(j.placar_mandante) ? j.placar_mandante : null;
    const gv = Number.isInteger(j.placar_visitante) ? j.placar_visitante : null;

    if (gm !== null && gv !== null) {
        const placarClass = j.status === 'ao_vivo' ? 'brasileirao-placar--live' : '';
        return `<span class="brasileirao-placar ${placarClass}">${gm} <span class="brasileirao-placar-x">-</span> ${gv}</span>`;
    }
    return `<span class="brasileirao-placar brasileirao-placar--vs">vs</span>`;
}

/**
 * Constrói HTML de jogos — v2.0: cards profissionais com escudos, agrupados por data
 * Escudos via /escudos/{cartola_id}.png, badges de status, estádio, data/hora
 */
function _buildJogosHtml(jogos) {
    if (!jogos.length) return '<div class="brasileirao-jogos-vazio">Nenhum jogo encontrado</div>';

    // Agrupar jogos por data
    const porData = {};
    for (const j of jogos) {
        const dt = j.data || 'sem-data';
        if (!porData[dt]) porData[dt] = [];
        porData[dt].push(j);
    }

    // Ordenar datas e jogos dentro de cada data por horário
    const datasOrdenadas = Object.keys(porData).sort();

    let html = '';
    for (const dt of datasOrdenadas) {
        const jogosData = porData[dt].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

        // Separador de data (só se tiver mais de 1 data na rodada)
        if (datasOrdenadas.length > 1 && dt !== 'sem-data') {
            html += `<div class="brasileirao-data-sep">
                <span class="material-icons" style="font-size: 0.7rem;">calendar_today</span>
                ${escapeHtml(_formatarDataCurta(dt))}
            </div>`;
        }

        for (const j of jogosData) {
            const aoVivo = j.status === 'ao_vivo';
            const encerrado = j.status === 'encerrado';
            const statusMod = aoVivo ? ' brasileirao-jogo--live' : encerrado ? ' brasileirao-jogo--enc' : '';
            const mandanteId = j.mandante_id || 0;
            const visitanteId = j.visitante_id || 0;

            html += `<div class="brasileirao-jogo-card${statusMod}">
                <div class="brasileirao-jogo-header">
                    <span class="brasileirao-jogo-hora">${escapeHtml(j.horario || '')}</span>
                    ${_buildStatusBadge(j)}
                </div>
                <div class="brasileirao-jogo-main">
                    <div class="brasileirao-jogo-team brasileirao-jogo-team--home">
                        <span class="brasileirao-jogo-nome">${escapeHtml(j.mandante || '')}</span>
                        <img src="/escudos/${mandanteId}.png" alt="" class="brasileirao-jogo-escudo"
                             onerror="this.src='/escudos/default.png'">
                    </div>
                    <div class="brasileirao-jogo-centro">
                        ${_buildPlacar(j)}
                    </div>
                    <div class="brasileirao-jogo-team brasileirao-jogo-team--away">
                        <img src="/escudos/${visitanteId}.png" alt="" class="brasileirao-jogo-escudo"
                             onerror="this.src='/escudos/default.png'">
                        <span class="brasileirao-jogo-nome">${escapeHtml(j.visitante || '')}</span>
                    </div>
                </div>
                ${j.estadio ? `<div class="brasileirao-jogo-footer">
                    <span class="material-icons" style="font-size: 0.6rem;">stadium</span>
                    ${escapeHtml(j.estadio)}${j.cidade ? `, ${escapeHtml(j.cidade)}` : ''}
                </div>` : ''}
            </div>`;
        }
    }

    return html;
}

// Constrói card de rodada com navegação prev/next
function _buildRodadaCard(rodada, jogos, isAtual) {
    const rodadaNum = Number(rodada) || 1;
    const todosEncerrados = jogos.length > 0 && jogos.every(j => j.status === 'encerrado');
    const temAoVivo = jogos.some(j => j.status === 'ao_vivo');

    let badgeClass, badgeLabel;
    if (temAoVivo) {
        badgeClass = 'brasileirao-rodada-status-badge--atual';
        badgeLabel = 'AO VIVO';
    } else if (todosEncerrados) {
        badgeClass = 'brasileirao-rodada-status-badge--encerrada';
        badgeLabel = 'ENCERRADA';
    } else if (isAtual) {
        badgeClass = 'brasileirao-rodada-status-badge--atual';
        badgeLabel = 'ATUAL';
    } else {
        badgeClass = 'brasileirao-rodada-status-badge--futura';
        badgeLabel = 'PRÓXIMA';
    }

    const prevDisabled = rodadaNum <= 1 ? 'disabled' : '';
    const nextDisabled = rodadaNum >= 38 ? 'disabled' : '';

    return `<div class="brasileirao-rodada-card">
        <div class="brasileirao-rodada-header">
            <span class="material-icons" style="color: var(--app-success-light); font-size: 1rem;">sports_soccer</span>
            <div class="brasileirao-rodada-nav">
                <button class="brasileirao-rodada-nav-btn" id="brasileirao-nav-prev" aria-label="Rodada anterior" ${prevDisabled}>
                    <span class="material-icons">chevron_left</span>
                </button>
                <span class="brasileirao-rodada-nav-label">
                    Rodada ${rodadaNum}
                    <span class="brasileirao-rodada-status-badge ${badgeClass}">${badgeLabel}</span>
                </span>
                <button class="brasileirao-rodada-nav-btn" id="brasileirao-nav-next" aria-label="Pr\u00f3xima rodada" ${nextDisabled}>
                    <span class="material-icons">chevron_right</span>
                </button>
            </div>
        </div>
        <div class="brasileirao-jogos-lista">${_buildJogosHtml(jogos)}</div>
    </div>`;
}

function _setupNavButtons() {
    const btnPrev = document.getElementById('brasileirao-nav-prev');
    const btnNext = document.getElementById('brasileirao-nav-next');
    if (btnPrev) btnPrev.addEventListener('click', () => _navegarRodada((_rodadaExibida || 1) - 1));
    if (btnNext) btnNext.addEventListener('click', () => _navegarRodada((_rodadaExibida || 1) + 1));
}

async function _navegarRodada(novaRodada) {
    if (!_temporadaAtual || novaRodada < 1 || novaRodada > 38) return;
    const container = document.getElementById('brasileirao-tabela-container');
    if (!container) return;

    const btnPrev = document.getElementById('brasileirao-nav-prev');
    const btnNext = document.getElementById('brasileirao-nav-next');
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;

    try {
        const res = await _fetchComTimeout(`/api/brasileirao/rodada/${_temporadaAtual}/${novaRodada}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success || !data.rodada) throw new Error('sem dados');

        _rodadaExibida = novaRodada;
        const jogos = data.rodada.partidas || [];
        const isAtual = novaRodada === _rodadaAtualRef;
        container.innerHTML = _buildRodadaCard(novaRodada, jogos, isAtual);
        _setupNavButtons();
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', `Erro ao navegar rodada ${novaRodada}:`, err.message);
        if (btnPrev) btnPrev.disabled = novaRodada <= 1;
        if (btnNext) btnNext.disabled = novaRodada >= 38;
    }
}

function _renderizarJogosRodada(apiData) {
    const container = document.getElementById('brasileirao-tabela-container');
    if (!container) return;

    if (apiData && apiData.jogos_rodada_atual && apiData.jogos_rodada_atual.length > 0) {
        const rodada = apiData.rodada_atual || 1;
        container.innerHTML = _buildRodadaCard(rodada, apiData.jogos_rodada_atual, true);
        _setupNavButtons();
    } else {
        // Fallback: info do campeonato
        container.innerHTML = `<div class="brasileirao-info-card">
            <div class="brasileirao-info-header">
                <span class="material-icons" style="color: var(--app-success-light); font-size: 1rem;">info</span>
                <span>Sobre o Campeonato</span>
            </div>
            <div class="brasileirao-info-items">
                <div class="brasileirao-info-item">
                    <span class="material-icons">calendar_month</span>
                    <div>
                        <p class="brasileirao-info-label">Per\u00edodo</p>
                        <p class="brasileirao-info-value">${escapeHtml(INFO_CAMPEONATO.inicio)} a ${escapeHtml(INFO_CAMPEONATO.termino)}</p>
                    </div>
                </div>
                <div class="brasileirao-info-item">
                    <span class="material-icons">format_list_numbered</span>
                    <div>
                        <p class="brasileirao-info-label">Formato</p>
                        <p class="brasileirao-info-value">${escapeHtml(INFO_CAMPEONATO.formato)}</p>
                    </div>
                </div>
                <div class="brasileirao-info-item">
                    <span class="material-icons">emoji_events</span>
                    <div>
                        <p class="brasileirao-info-label">Libertadores</p>
                        <p class="brasileirao-info-value">${escapeHtml(INFO_CAMPEONATO.vagas_liberta)}</p>
                    </div>
                </div>
                <div class="brasileirao-info-item">
                    <span class="material-icons">trending_down</span>
                    <div>
                        <p class="brasileirao-info-label">Rebaixamento</p>
                        <p class="brasileirao-info-value">${escapeHtml(INFO_CAMPEONATO.rebaixamento)}</p>
                    </div>
                </div>
            </div>
        </div>`;
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
            if (apiResumo?.rodada_atual) {
                _rodadaAtualRef = apiResumo.rodada_atual;
                _rodadaExibida = apiResumo.rodada_atual;
            }
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
        // Só atualiza a rodada visível se o usuário estiver na rodada atual
        if (apiResumo) {
            if (apiResumo.rodada_atual) _rodadaAtualRef = apiResumo.rodada_atual;
            if (_rodadaExibida === _rodadaAtualRef || _rodadaExibida === null) {
                if (apiResumo.rodada_atual) _rodadaExibida = apiResumo.rodada_atual;
                _renderizarJogosRodada(apiResumo);
            }
        }
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
