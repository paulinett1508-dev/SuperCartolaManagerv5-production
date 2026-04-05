// participante-libertadores.js
// v3.0 - Controller da Landing Page "Libertadores 2026"
// v3.0: Dados dinâmicos via /api/competicao/libertadores (SoccerDataAPI + Globo)
// v2.0 - Atualizado com grupos definidos (sorteio 19/Mar/2026)
//
// Fontes de dados:
//   - API: /api/competicao/libertadores/resumo (classificação, resultados dinâmicos)
//   - API: /api/noticias/libertadores (Google News RSS, cache 30min)
//   - Fallback: dados estáticos do sorteio oficial CONMEBOL

let countdownInterval = null;
let dadosAPILiberta = null;
let _autoRefreshInterval = null;
let _visibilityHandler = null;
let _ultimaAtualizacao = null;
let _statusInterval = null;
const _AUTO_REFRESH_MS = 5 * 60 * 1000;

// Data da Final da Libertadores 2026 — 28 Nov, Estádio Centenário, Montevidéu
const FINAL_DATE = new Date('2026-11-28T21:00:00-03:00');

// Fases da competição (datas confirmadas CONMEBOL)
const FASES_LIBERTADORES = [
    { fase: 'Fase de Grupos',       info: '7 Abr — 28 Mai 2026',   times: '32 clubes • 8 grupos',  proxima: true },
    { fase: 'Oitavas de Final',     info: 'Julho 2026',             times: '16 clubes',              ativa: false },
    { fase: 'Quartas de Final',     info: 'Setembro 2026',          times: '8 clubes',               ativa: false },
    { fase: 'Semifinais',           info: 'Outubro 2026',           times: '4 clubes',               ativa: false },
    { fase: 'Grande Final',         info: '28 Nov 2026 · Centenário, Montevidéu', times: 'Jogo único', final: true },
];

// Grupos definidos — Sorteio 19/Mar/2026 (CONMEBOL, Luque/PAR)
const GRUPOS_LIBERTADORES = [
    { grupo: 'A', times: [
        { nome: 'Flamengo', pais: 'BRA', brasileiro: true },
        { nome: 'Estudiantes', pais: 'ARG' },
        { nome: 'Cusco', pais: 'PER' },
        { nome: 'Ind. Medellín', pais: 'COL' },
    ]},
    { grupo: 'B', times: [
        { nome: 'Nacional', pais: 'URU' },
        { nome: 'Universitario', pais: 'PER' },
        { nome: 'Coquimbo Unido', pais: 'CHI' },
        { nome: 'Tolima', pais: 'COL' },
    ]},
    { grupo: 'C', times: [
        { nome: 'Fluminense', pais: 'BRA', brasileiro: true },
        { nome: 'Bolívar', pais: 'BOL' },
        { nome: 'Dep. La Guaira', pais: 'VEN' },
        { nome: 'Ind. Rivadavia', pais: 'ARG' },
    ]},
    { grupo: 'D', times: [
        { nome: 'Boca Juniors', pais: 'ARG' },
        { nome: 'Cruzeiro', pais: 'BRA', brasileiro: true },
        { nome: 'Univ. Católica', pais: 'CHI' },
        { nome: 'Barcelona', pais: 'ECU' },
    ]},
    { grupo: 'E', times: [
        { nome: 'Peñarol', pais: 'URU' },
        { nome: 'Corinthians', pais: 'BRA', brasileiro: true },
        { nome: 'Santa Fe', pais: 'COL' },
        { nome: 'Platense', pais: 'ARG' },
    ]},
    { grupo: 'F', times: [
        { nome: 'Palmeiras', pais: 'BRA', brasileiro: true },
        { nome: 'Cerro Porteño', pais: 'PAR' },
        { nome: 'Junior Barranquilla', pais: 'COL' },
        { nome: 'Sporting Cristal', pais: 'PER' },
    ]},
    { grupo: 'G', times: [
        { nome: 'LDU', pais: 'ECU' },
        { nome: 'Lanús', pais: 'ARG' },
        { nome: 'Always Ready', pais: 'BOL' },
        { nome: 'Mirassol', pais: 'BRA', brasileiro: true },
    ]},
    { grupo: 'H', times: [
        { nome: 'Ind. del Valle', pais: 'ECU' },
        { nome: 'Libertad', pais: 'PAR' },
        { nome: 'Rosario Central', pais: 'ARG' },
        { nome: 'Univ. Central', pais: 'VEN' },
    ]},
];

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    if (!url) return '#';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '#';
}

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarLibertadoresParticipante(params) {
    if (window.Log) Log.info('LIBERTADORES', 'Inicializando LP Libertadores 2026...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirLibertadoresParticipante = destruirLibertadoresParticipante;

    try {
        // Carregar dados dinâmicos em paralelo
        dadosAPILiberta = await carregarDadosAPILiberta();

        renderizarStatusHero();
        countdownInterval = setInterval(renderizarStatusHero, 60000);

        renderizarGrupos();
        renderizarFases();
        renderizarJogos();

        await carregarNoticias();
        _setupRefreshButton();
        _iniciarAutoRefresh();
        _statusInterval = setInterval(_atualizarStatusTexto, 60000);

        if (window.Log) Log.info('LIBERTADORES', 'LP renderizada com sucesso');
    } catch (erro) {
        console.error('[LIBERTADORES] Erro na inicialização:', erro);
    }
}

export function destruirLibertadoresParticipante() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    _pararAutoRefresh();
    if (_statusInterval) { clearInterval(_statusInterval); _statusInterval = null; }
    _ultimaAtualizacao = null;
}

// ═══════════════════════════════════════════════════
// API DINÂMICA
// ═══════════════════════════════════════════════════

async function carregarDadosAPILiberta() {
    try {
        const res = await fetch('/api/competicao/libertadores/resumo');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.success && (data.grupos?.length > 0 || data.ultimos_resultados?.length > 0)) ? data : null;
    } catch (err) {
        if (window.Log) Log.warn('LIBERTADORES', 'API indisponível, usando fallback:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// STATUS CONTEXTUAL DO HERO
// ═══════════════════════════════════════════════════

// Datas-chave das fases (início)
const DATAS_FASES = [
    { fase: 'Fase de Grupos',   inicio: new Date('2026-04-07T00:00:00-03:00'), fim: new Date('2026-05-28T23:59:59-03:00') },
    { fase: 'Oitavas de Final', inicio: new Date('2026-07-01T00:00:00-03:00'), fim: new Date('2026-07-31T23:59:59-03:00') },
    { fase: 'Quartas de Final', inicio: new Date('2026-09-01T00:00:00-03:00'), fim: new Date('2026-09-30T23:59:59-03:00') },
    { fase: 'Semifinais',       inicio: new Date('2026-10-01T00:00:00-03:00'), fim: new Date('2026-10-31T23:59:59-03:00') },
    { fase: 'Grande Final',     inicio: FINAL_DATE,                             fim: FINAL_DATE },
];

function renderizarStatusHero() {
    const el = document.getElementById('liberta-hero-status');
    if (!el) return;

    const agora = new Date();

    // Competição encerrada
    if (agora > FINAL_DATE) {
        el.innerHTML = '<span class="liberta-hero-status-text">Competição encerrada</span>';
        return;
    }

    // Verificar se alguma fase está em andamento
    for (const f of DATAS_FASES) {
        if (agora >= f.inicio && agora <= f.fim) {
            el.innerHTML = `<span class="liberta-hero-status-badge liberta-hero-status-badge--active"><span class="material-icons">play_circle</span>${escapeHtml(f.fase)} em andamento</span>`;
            return;
        }
    }

    // Encontrar a próxima fase
    for (const f of DATAS_FASES) {
        if (agora < f.inicio) {
            const diff = f.inicio - agora;
            const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
            const label = dias === 1 ? 'dia' : 'dias';
            el.innerHTML = `<span class="liberta-hero-status-badge"><span class="material-icons">schedule</span>${escapeHtml(f.fase)} em <strong>${dias}</strong> ${label}</span>`;
            return;
        }
    }
}

// ═══════════════════════════════════════════════════
// GRUPOS
// ═══════════════════════════════════════════════════

function renderizarGrupos() {
    const container = document.getElementById('liberta-grupos-grid');
    if (!container) return;

    // Preferir dados dinâmicos da API quando disponíveis (com classificação/pontos)
    if (dadosAPILiberta?.grupos?.length > 0) {
        container.innerHTML = dadosAPILiberta.grupos.map(grupo => {
            const timesHtml = grupo.classificacao.map((t, i) => {
                const cls = i < 2 ? 'liberta-grupo-time liberta-grupo-time--br' : 'liberta-grupo-time';
                return `<div class="${cls}">
                    <span class="liberta-grupo-pais">${escapeHtml(String(i + 1))}.</span>
                    <span class="liberta-grupo-nome">${escapeHtml(t.time)}</span>
                    <span class="liberta-grupo-pts" style="margin-left:auto;font-family:var(--app-font-mono);font-size:0.7rem;opacity:0.7">${t.pontos}pts</span>
                </div>`;
            }).join('');

            return `<div class="liberta-grupo-card">
                <div class="liberta-grupo-header">Grupo ${escapeHtml(grupo.nome)}</div>
                <div class="liberta-grupo-times">${timesHtml}</div>
            </div>`;
        }).join('');
        return;
    }

    // Fallback: dados estáticos do sorteio
    container.innerHTML = GRUPOS_LIBERTADORES.map(g => {
        const timesHtml = g.times.map(t => {
            const cls = t.brasileiro ? 'liberta-grupo-time liberta-grupo-time--br' : 'liberta-grupo-time';
            return `<div class="${cls}">
                <span class="liberta-grupo-pais">${escapeHtml(t.pais)}</span>
                <span class="liberta-grupo-nome">${escapeHtml(t.nome)}</span>
            </div>`;
        }).join('');

        return `<div class="liberta-grupo-card">
            <div class="liberta-grupo-header">Grupo ${escapeHtml(g.grupo)}</div>
            <div class="liberta-grupo-times">${timesHtml}</div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// FASES (TIMELINE)
// ═══════════════════════════════════════════════════

function renderizarFases() {
    const container = document.getElementById('liberta-timeline');
    if (!container) return;

    container.innerHTML = FASES_LIBERTADORES.map(f => {
        const isFinal = !!f.final;
        const isAtiva = !!f.ativa;
        const isProxima = !!f.proxima;

        let cls = 'liberta-timeline-item';
        if (isFinal) cls += ' liberta-timeline-item--final';
        else if (isAtiva) cls += ' liberta-timeline-item--active';
        else if (isProxima) cls += ' liberta-timeline-item--upcoming';

        let badge = '';
        if (isAtiva) badge = '<span class="liberta-timeline-badge">em andamento</span>';
        else if (isProxima) badge = '<span class="liberta-timeline-badge liberta-timeline-badge--upcoming">em breve</span>';

        return `
        <div class="${cls}">
            <p class="liberta-timeline-fase">${f.fase}${badge}</p>
            <p class="liberta-timeline-info">${f.info} &bull; ${f.times}</p>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// TABELA DE JOGOS — Lista unificada
// ═══════════════════════════════════════════════════

function _formatarDataCurta(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const date = new Date(ano, mes - 1, dia);
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${diasSemana[date.getDay()]}, ${dia} ${meses[mes - 1]}`;
}

function _buildJogoBadge(j) {
    if (j.status === 'ao_vivo') {
        return '<span class="liberta-jogo-badge liberta-jogo-badge--live"><span class="liberta-jogo-live-dot"></span>AO VIVO</span>';
    }
    if (j.status === 'encerrado') {
        return '<span class="liberta-jogo-badge liberta-jogo-badge--enc">Encerrado</span>';
    }
    return `<span class="liberta-jogo-badge liberta-jogo-badge--agd">${escapeHtml(j.horario || 'A definir')}</span>`;
}

function _buildJogoPlacar(j) {
    const gm = Number.isInteger(j.placar_mandante) ? j.placar_mandante : null;
    const gv = Number.isInteger(j.placar_visitante) ? j.placar_visitante : null;
    if (gm !== null && gv !== null) {
        const liveClass = j.status === 'ao_vivo' ? ' liberta-jogo-placar--live' : '';
        return `<span class="liberta-jogo-placar${liveClass}">${gm}<span class="liberta-jogo-placar-sep">-</span>${gv}</span>`;
    }
    return '<span class="liberta-jogo-placar liberta-jogo-placar--vs">vs</span>';
}

function _buildListaJogos(jogos) {
    if (!jogos || jogos.length === 0) {
        return '<div class="liberta-jogos-vazio"><span class="material-icons">calendar_today</span><p>Nenhum jogo no momento</p></div>';
    }

    const porData = {};
    for (const j of jogos) {
        const dt = j.data || 'sem-data';
        if (!porData[dt]) porData[dt] = [];
        porData[dt].push(j);
    }

    const datasOrdenadas = Object.keys(porData).sort();
    const partes = [];

    for (const dt of datasOrdenadas) {
        const jogosData = porData[dt].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

        if (datasOrdenadas.length > 1 && dt !== 'sem-data') {
            partes.push(
                `<div class="liberta-jogo-data-sep"><span class="material-icons">calendar_today</span>${escapeHtml(_formatarDataCurta(dt))}</div>`
            );
        }

        for (const j of jogosData) {
            const aoVivo = j.status === 'ao_vivo';
            const encerrado = j.status === 'encerrado';
            const modClass = aoVivo ? ' liberta-jogo-card--live' : encerrado ? ' liberta-jogo-card--enc' : '';
            const faseBadge = j.grupo
                ? `<span class="liberta-jogo-fase">Grupo ${escapeHtml(j.grupo)}</span>`
                : j.fase ? `<span class="liberta-jogo-fase">${escapeHtml(j.fase)}</span>` : '';
            const footer = j.estadio
                ? `<div class="liberta-jogo-footer"><span class="material-icons">stadium</span>${escapeHtml(j.estadio)}${j.cidade ? `, ${escapeHtml(j.cidade)}` : ''}</div>`
                : '';

            partes.push(`<div class="liberta-jogo-card${modClass}">
                <div class="liberta-jogo-header">${faseBadge}${_buildJogoBadge(j)}</div>
                <div class="liberta-jogo-main">
                    <div class="liberta-jogo-team liberta-jogo-team--home"><span class="liberta-jogo-nome">${escapeHtml(j.mandante || '')}</span></div>
                    <div class="liberta-jogo-centro">${_buildJogoPlacar(j)}</div>
                    <div class="liberta-jogo-team liberta-jogo-team--away"><span class="liberta-jogo-nome">${escapeHtml(j.visitante || '')}</span></div>
                </div>${footer}
            </div>`);
        }
    }
    return partes.join('');
}

function renderizarJogos() {
    const container = document.getElementById('liberta-jogos-container');
    if (!container) return;

    if (!dadosAPILiberta) {
        container.innerHTML = '<div class="liberta-jogos-vazio"><span class="material-icons">sports_soccer</span><p>Fase de Grupos começa em <strong>7 de Abril</strong></p><p class="liberta-jogos-vazio-sub">32 clubes · 8 grupos · 10 países</p></div>';
        return;
    }

    // Mesclar todos os jogos em uma lista única, ordenada por data
    const jogosAoVivo   = (dadosAPILiberta.jogos_ao_vivo     || []).map(j => ({ ...j, status: j.status || 'ao_vivo' }));
    const resultados    = (dadosAPILiberta.ultimos_resultados || []).map(j => ({ ...j, status: j.status || 'encerrado' }));
    const proximosJogos = (dadosAPILiberta.proximos_jogos     || []).map(j => ({ ...j, status: j.status || 'agendado' }));

    const todosJogos = [...resultados, ...jogosAoVivo, ...proximosJogos];

    if (todosJogos.length === 0) {
        container.innerHTML = '<div class="liberta-jogos-vazio"><span class="material-icons">sports_soccer</span><p>Nenhum jogo disponível</p></div>';
        return;
    }

    container.innerHTML = _buildListaJogos(todosJogos);
}

// ═══════════════════════════════════════════════════
// NOTÍCIAS
// ═══════════════════════════════════════════════════

async function carregarNoticias(force = false) {
    const container = document.getElementById('liberta-noticias-lista');
    if (!container) return;

    try {
        const forceParam = force ? '?force=1' : '';
        const res = await fetch(`/api/noticias/libertadores${forceParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.noticias) && data.noticias.length > 0) {
            container.innerHTML = data.noticias.map(n => {
                const link = sanitizeUrl(n.link);
                const titulo = escapeHtml(n.titulo);
                const fonte = escapeHtml(n.fonte || 'Notícia');
                const tempo = n.tempoRelativo ? `<span class="liberta-noticia-tempo">${escapeHtml(n.tempoRelativo)}</span>` : '';
                return `
                <a href="${escapeHtml(link)}" target="_blank" rel="noopener"
                   class="liberta-noticia-card"
                   role="link" tabindex="0">
                    <div class="liberta-noticia-icon">
                        <span class="material-icons">article</span>
                    </div>
                    <div class="liberta-noticia-text">
                        <p class="liberta-noticia-title">${titulo}</p>
                        <div class="liberta-noticia-meta">
                            <span class="liberta-noticia-fonte">${fonte}</span>
                            ${tempo}
                        </div>
                    </div>
                    <span class="material-icons liberta-noticia-chevron">chevron_right</span>
                </a>`;
            }).join('');
        } else {
            container.innerHTML = renderizarNoticiasFallback();
        }
        _ultimaAtualizacao = Date.now();
        _atualizarStatusTexto();
    } catch (err) {
        if (window.Log) Log.warn('LIBERTADORES', 'Erro ao carregar notícias:', err);
        container.innerHTML = renderizarNoticiasFallback();
    }
}

// ═══════════════════════════════════════════════════
// REFRESH BUTTON + AUTO-REFRESH — Organismo vivo
// ═══════════════════════════════════════════════════

function _setupRefreshButton() {
    const btn = document.getElementById('liberta-noticias-refresh');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const icon = btn.querySelector('.material-icons');
        if (!icon || btn.disabled) return;
        btn.disabled = true;
        icon.classList.add('spinning');
        try { await carregarNoticias(true); }
        finally { icon.classList.remove('spinning'); btn.disabled = false; }
    });
}

function _iniciarAutoRefresh() {
    _pararAutoRefresh();
    _autoRefreshInterval = setInterval(() => {
        if (!document.hidden) carregarNoticias();
    }, _AUTO_REFRESH_MS);
    _visibilityHandler = () => {
        if (!document.hidden && _ultimaAtualizacao && (Date.now() - _ultimaAtualizacao > _AUTO_REFRESH_MS)) {
            carregarNoticias();
        }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
}

function _pararAutoRefresh() {
    if (_autoRefreshInterval) { clearInterval(_autoRefreshInterval); _autoRefreshInterval = null; }
    if (_visibilityHandler) { document.removeEventListener('visibilitychange', _visibilityHandler); _visibilityHandler = null; }
}

function _atualizarStatusTexto() {
    const el = document.getElementById('liberta-noticias-status');
    if (!el || !_ultimaAtualizacao) { if (el) el.textContent = ''; return; }
    const diffMin = Math.floor((Date.now() - _ultimaAtualizacao) / 60000);
    if (diffMin < 1) el.textContent = 'Atualizado agora';
    else if (diffMin < 60) el.textContent = `Atualizado há ${diffMin} min`;
    else el.textContent = `Atualizado há ${Math.floor(diffMin / 60)}h`;
}

function renderizarNoticiasFallback() {
    return `
    <div class="liberta-noticia-card">
        <div class="liberta-noticia-icon">
            <span class="material-icons">emoji_events</span>
        </div>
        <div class="liberta-noticia-text">
            <p class="liberta-noticia-title">CONMEBOL Libertadores da América 2026</p>
            <div class="liberta-noticia-meta">
                <span class="liberta-noticia-fonte">CONMEBOL</span>
            </div>
        </div>
    </div>
    <div class="liberta-noticia-card">
        <div class="liberta-noticia-icon">
            <span class="material-icons">groups</span>
        </div>
        <div class="liberta-noticia-text">
            <p class="liberta-noticia-title">32 clubes de 10 países disputam o título continental</p>
            <div class="liberta-noticia-meta">
                <span class="liberta-noticia-fonte">Libertadores 2026</span>
            </div>
        </div>
    </div>`;
}
