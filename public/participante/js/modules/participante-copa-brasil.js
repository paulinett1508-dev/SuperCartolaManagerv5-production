// participante-copa-brasil.js
// v2.0 - Controller da Landing Page "Copa do Brasil 2026"
// v2.0: Dados dinâmicos via /api/competicao/copa-brasil (SoccerDataAPI + Globo)
// v1.1: Atualiza 5ª Fase com confrontos do sorteio (23/03/2026)
//
// Fontes de dados:
//   - API: /api/competicao/copa-brasil/resumo (resultados dinâmicos)
//   - API: /api/noticias/copa-brasil (Google News RSS, cache 30min)
//   - Fallback: confrontos hardcoded abaixo

// Dados dinâmicos da API
let dadosAPICopaBR = null;
let _autoRefreshInterval = null;
let _visibilityHandler = null;
let _ultimaAtualizacao = null;
let _statusInterval = null;
const _AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos


// Confrontos da 5ª Fase — Sorteio realizado em 23/03/2026 na CBF
// Formato: { mandanteIda: 'Time A', visitanteIda: 'Time B' }
// O mandante da ida joga em casa primeiro; volta no campo do outro
const CONFRONTOS_5A_FASE = [
    { mandanteIda: 'Ceará',          visitanteIda: 'Atlético-MG' },
    { mandanteIda: 'Goiás',          visitanteIda: 'Cruzeiro' },
    { mandanteIda: 'Atlético-GO',    visitanteIda: 'Athletico-PR' },
    { mandanteIda: 'Vitória',        visitanteIda: 'Flamengo' },
    { mandanteIda: 'Confiança',      visitanteIda: 'Grêmio' },
    { mandanteIda: 'Paysandu',       visitanteIda: 'Vasco' },
    { mandanteIda: 'CRB',            visitanteIda: 'Fortaleza' },
    { mandanteIda: 'Remo',           visitanteIda: 'Bahia' },
    { mandanteIda: 'Chapecoense',    visitanteIda: 'Botafogo' },
    { mandanteIda: 'Mirassol',       visitanteIda: 'RB Bragantino' },
    { mandanteIda: 'Barra-SC',       visitanteIda: 'Corinthians' },
    { mandanteIda: 'Operário-PR',    visitanteIda: 'Fluminense' },
    { mandanteIda: 'Jacuipense',     visitanteIda: 'Palmeiras' },
    { mandanteIda: 'Athletic-MG',    visitanteIda: 'Internacional' },
    { mandanteIda: 'Coritiba',       visitanteIda: 'Santos' },
    { mandanteIda: 'Juventude',      visitanteIda: 'São Paulo' },
];


// Eventos futuros da Copa do Brasil 2026 — countdown dinâmico para o próximo
const EVENTOS_COPA_BRASIL = [
    { label: '5ª Fase — Ida',         data: new Date('2026-04-22T00:00:00-03:00') },
    { label: '5ª Fase — Volta',       data: new Date('2026-05-13T00:00:00-03:00') },
    { label: 'Oitavas de Final — Ida',data: new Date('2026-08-02T00:00:00-03:00') },
    { label: 'Oitavas de Final — Volta',data: new Date('2026-08-05T00:00:00-03:00') },
    { label: 'Quartas de Final — Ida',data: new Date('2026-08-26T00:00:00-03:00') },
    { label: 'Quartas de Final — Volta',data: new Date('2026-09-02T00:00:00-03:00') },
    { label: 'Semifinais — Ida',      data: new Date('2026-11-01T00:00:00-03:00') },
    { label: 'Semifinais — Volta',    data: new Date('2026-11-08T00:00:00-03:00') },
    { label: 'Grande Final',          data: new Date('2026-12-06T21:00:00-03:00') },
];

// Retorna o próximo evento que ainda não ocorreu
function proximoEvento() {
    const agora = new Date();
    return EVENTOS_COPA_BRASIL.find(e => e.data > agora) || EVENTOS_COPA_BRASIL[EVENTOS_COPA_BRASIL.length - 1];
}

// Fases estáticas da competição (formato mata-mata) — 9 fases
const FASES_COPA_BRASIL = [
    { fase: '1ª Fase',      info: 'Fevereiro 2026',         times: '28 clubes',           concluida: true  },
    { fase: '2ª Fase',      info: '24 Fev — 5 Mar 2026',   times: '88 clubes',           concluida: true  },
    { fase: '3ª Fase',      info: 'Março 2026',             times: '48 clubes',           concluida: true  },
    { fase: '4ª Fase',      info: '17-19 Mar 2026',         times: '24 clubes',           concluida: true  },
    { fase: '5ª Fase',      info: '22 Abr + 13 Mai 2026',  times: '32 clubes — ida/volta', proxima: true   },
    { fase: 'Oitavas',      info: '2 + 5 Ago 2026',        times: '16 clubes — ida/volta'                  },
    { fase: 'Quartas',      info: '26 Ago + 2 Set 2026',   times: '8 clubes — ida/volta'                   },
    { fase: 'Semifinais',   info: '1 + 8 Nov 2026',        times: '4 clubes — ida/volta'                   },
    { fase: 'Grande Final', info: '6 Dez 2026',            times: 'Jogo único',           final: true      },
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

export async function inicializarCopaBrasilParticipante(params) {
    if (window.Log) Log.info('COPA-BRASIL', 'Inicializando LP Copa do Brasil 2026...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirCopaBrasilParticipante = destruirCopaBrasilParticipante;

    try {
        // Carregar dados dinâmicos e notícias em paralelo
        const [apiData] = await Promise.all([
            carregarDadosAPICopaBR(),
            carregarNoticias(),
        ]);
        dadosAPICopaBR = apiData;

        renderizarInfoHero();
        renderizarConfrontos5aFase();
        renderizarFases();
        _setupRefreshButton();
        _iniciarAutoRefresh();
        _statusInterval = setInterval(_atualizarStatusTexto, 60000);

        if (window.Log) Log.info('COPA-BRASIL', dadosAPICopaBR ? 'LP com dados dinâmicos' : 'LP com dados estáticos');
    } catch (erro) {
        console.error('[COPA-BRASIL] Erro na inicialização:', erro);
    }
}

export function destruirCopaBrasilParticipante() {
    _pararAutoRefresh();
    if (_statusInterval) { clearInterval(_statusInterval); _statusInterval = null; }
    _ultimaAtualizacao = null;
}

// ═══════════════════════════════════════════════════
// API DINÂMICA
// ═══════════════════════════════════════════════════

async function carregarDadosAPICopaBR() {
    try {
        const res = await fetch('/api/competicao/copa-brasil/resumo');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.success && (data.ultimos_resultados?.length > 0 || data.proximos_jogos?.length > 0)) ? data : null;
    } catch (err) {
        if (window.Log) Log.warn('COPA-BRASIL', 'API indisponível, usando fallback:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// INFO HERO — Status dinâmico da competição
// ═══════════════════════════════════════════════════

function renderizarInfoHero() {
    const container = document.getElementById('copabr-status-chips');
    if (!container) return;

    const faseAtual = [...FASES_COPA_BRASIL].reverse().find(f => f.concluida);
    const fasePendente = FASES_COPA_BRASIL.find(f => f.proxima);
    const evento = proximoEvento();

    let html = '';

    if (faseAtual) {
        html += `<div class="copabr-chip copabr-chip--done">
            <span class="material-icons">check_circle</span>
            ${faseAtual.fase} concluída
        </div>`;
    }
    if (fasePendente) {
        html += `<div class="copabr-chip copabr-chip--next">
            <span class="material-icons">hourglass_top</span>
            Próxima: ${fasePendente.fase}
        </div>`;
    }
    if (evento) {
        const dataStr = evento.data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        html += `<div class="copabr-chip copabr-chip--event">
            <span class="material-icons">event</span>
            ${evento.label} — ${dataStr}
        </div>`;
    }

    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// CONFRONTOS 5ª FASE — Sorteio 23/03/2026
// ═══════════════════════════════════════════════════

function renderizarConfrontos5aFase() {
    const container = document.getElementById('copabr-confrontos-5fase');
    if (!container) return;

    // Se API tem resultados, tentar enriquecer confrontos com placares
    const resultadosAPI = dadosAPICopaBR?.ultimos_resultados || [];

    container.innerHTML = CONFRONTOS_5A_FASE.map(c => {
        // Procurar resultado da API para este confronto
        const resultado = resultadosAPI.find(r =>
            (r.mandante?.toLowerCase().includes(c.mandanteIda.toLowerCase()) &&
             r.visitante?.toLowerCase().includes(c.visitanteIda.toLowerCase())) ||
            (r.mandante?.toLowerCase().includes(c.visitanteIda.toLowerCase()) &&
             r.visitante?.toLowerCase().includes(c.mandanteIda.toLowerCase()))
        );

        const placar = resultado && resultado.placar_mandante !== null
            ? `<span class="copabr-confronto-placar">${resultado.placar_mandante} x ${resultado.placar_visitante}</span>`
            : '<span class="copabr-confronto-vs">vs</span>';

        return `
        <div class="copabr-confronto-card${resultado?.status === 'ao_vivo' ? ' copabr-confronto-card--live' : ''}">
            <span class="copabr-confronto-time">${c.mandanteIda}</span>
            ${placar}
            <span class="copabr-confronto-time">${c.visitanteIda}</span>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// FASES (TIMELINE)
// ═══════════════════════════════════════════════════

function renderizarFases() {
    const container = document.getElementById('copabr-timeline');
    if (!container) return;

    container.innerHTML = FASES_COPA_BRASIL.map(f => {
        const isFinal    = !!f.final;
        const isConcluida = !!f.concluida;
        const isProxima  = !!f.proxima;

        const cls = isFinal
            ? 'copabr-timeline-item copabr-timeline-item--final'
            : isProxima
            ? 'copabr-timeline-item copabr-timeline-item--active'
            : isConcluida
            ? 'copabr-timeline-item copabr-timeline-item--done'
            : 'copabr-timeline-item';

        const badge = isProxima
            ? '<span class="copabr-timeline-badge">próxima</span>'
            : isConcluida
            ? '<span class="copabr-timeline-badge copabr-timeline-badge--done">concluída</span>'
            : '';

        return `
        <div class="${cls}">
            <p class="copabr-timeline-fase">${f.fase}${badge}</p>
            <p class="copabr-timeline-info">${f.info} &bull; ${f.times}</p>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// NOTÍCIAS
// ═══════════════════════════════════════════════════

async function carregarNoticias(force = false) {
    const container = document.getElementById('copabr-noticias-lista');
    if (!container) return;

    try {
        const forceParam = force ? '?force=1' : '';
        const res = await fetch(`/api/noticias/copa-brasil${forceParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.noticias) && data.noticias.length > 0) {
            container.innerHTML = data.noticias.map(n => {
                const link = sanitizeUrl(n.link);
                const titulo = escapeHtml(n.titulo);
                const fonte = escapeHtml(n.fonte || 'Notícia');
                const tempo = n.tempoRelativo ? `<span class="copabr-noticia-tempo">${escapeHtml(n.tempoRelativo)}</span>` : '';
                return `
                <a href="${escapeHtml(link)}" target="_blank" rel="noopener"
                   class="copabr-noticia-card"
                   role="link" tabindex="0">
                    <div class="copabr-noticia-icon">
                        <span class="material-icons">article</span>
                    </div>
                    <div class="copabr-noticia-text">
                        <p class="copabr-noticia-title">${titulo}</p>
                        <div class="copabr-noticia-meta">
                            <span class="copabr-noticia-fonte">${fonte}</span>
                            ${tempo}
                        </div>
                    </div>
                    <span class="material-icons copabr-noticia-chevron">chevron_right</span>
                </a>`;
            }).join('');
        } else {
            container.innerHTML = renderizarNoticiasFallback();
        }
        _ultimaAtualizacao = Date.now();
        _atualizarStatusTexto();
    } catch (err) {
        if (window.Log) Log.warn('COPA-BRASIL', 'Erro ao carregar notícias:', err);
        container.innerHTML = renderizarNoticiasFallback();
    }
}

// ═══════════════════════════════════════════════════
// REFRESH BUTTON + AUTO-REFRESH — Organismo vivo
// ═══════════════════════════════════════════════════

function _setupRefreshButton() {
    const btn = document.getElementById('copabr-noticias-refresh');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const icon = btn.querySelector('.material-icons');
        if (!icon || btn.disabled) return;
        btn.disabled = true;
        icon.classList.add('spinning');
        try {
            await carregarNoticias(true);
        } finally {
            icon.classList.remove('spinning');
            btn.disabled = false;
        }
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
    const el = document.getElementById('copabr-noticias-status');
    if (!el || !_ultimaAtualizacao) { if (el) el.textContent = ''; return; }
    const diffMin = Math.floor((Date.now() - _ultimaAtualizacao) / 60000);
    if (diffMin < 1) el.textContent = 'Atualizado agora';
    else if (diffMin < 60) el.textContent = `Atualizado há ${diffMin} min`;
    else el.textContent = `Atualizado há ${Math.floor(diffMin / 60)}h`;
}

function renderizarNoticiasFallback() {
    return `
    <div class="copabr-noticia-card">
        <div class="copabr-noticia-icon">
            <span class="material-icons">emoji_events</span>
        </div>
        <div class="copabr-noticia-text">
            <p class="copabr-noticia-title">Copa do Brasil 2026 — Maior competição de mata-mata do futebol brasileiro</p>
            <div class="copabr-noticia-meta">
                <span class="copabr-noticia-fonte">CBF</span>
            </div>
        </div>
    </div>
    <div class="copabr-noticia-card">
        <div class="copabr-noticia-icon">
            <span class="material-icons">groups</span>
        </div>
        <div class="copabr-noticia-text">
            <p class="copabr-noticia-title">126 clubes de todo o Brasil disputam o troféu mais desejado do futebol nacional</p>
            <div class="copabr-noticia-meta">
                <span class="copabr-noticia-fonte">Copa do Brasil 2026</span>
            </div>
        </div>
    </div>`;
}
