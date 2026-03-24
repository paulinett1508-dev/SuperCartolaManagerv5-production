// participante-copa-nordeste.js
// v1.0 - Controller da Landing Page "Copa do Nordeste 2026"
//
// Fontes de dados:
//   - API: /api/noticias/copa-nordeste (Google News RSS, cache 1h)


// Grupos da Copa do Nordeste 2026 — 20 times, 4 grupos de 5
const GRUPOS_COPA_NORDESTE = {
    A: {
        label: 'Grupo A',
        times: [
            { nome: 'Vitória',        destaque: true },
            { nome: 'ASA' },
            { nome: 'Sousa' },
            { nome: 'Itabaiana' },
            { nome: 'Fluminense-PI' },
        ]
    },
    B: {
        label: 'Grupo B',
        times: [
            { nome: 'Juazeirense' },
            { nome: 'CRB',            destaque: true },
            { nome: 'Botafogo-PB' },
            { nome: 'Confiança' },
            { nome: 'Piauí' },
        ]
    },
    C: {
        label: 'Grupo C',
        times: [
            { nome: 'Ceará',          destaque: true },
            { nome: 'Sport',          destaque: true },
            { nome: 'América-RN' },
            { nome: 'Imperatriz' },
            { nome: 'Ferroviário' },
        ]
    },
    D: {
        label: 'Grupo D',
        times: [
            { nome: 'Fortaleza',      destaque: true },
            { nome: 'Retrô' },
            { nome: 'ABC' },
            { nome: 'Maranhão' },
            { nome: 'Jacuipense' },
        ]
    }
};

// Eventos futuros da Copa do Nordeste 2026 — countdown dinâmico
const EVENTOS_COPA_NORDESTE = [
    { label: 'Início da Fase de Grupos',  data: new Date('2026-03-25T00:00:00-03:00') },
    { label: 'Fim da Fase de Grupos',     data: new Date('2026-05-04T00:00:00-03:00') },
    { label: 'Quartas de Final',          data: new Date('2026-05-11T00:00:00-03:00') },
    { label: 'Semifinais — Ida',          data: new Date('2026-05-18T00:00:00-03:00') },
    { label: 'Semifinais — Volta',        data: new Date('2026-05-25T00:00:00-03:00') },
    { label: 'Grande Final — Ida',        data: new Date('2026-05-31T00:00:00-03:00') },
    { label: 'Grande Final — Volta',      data: new Date('2026-06-07T00:00:00-03:00') },
];

// Retorna o próximo evento que ainda não ocorreu
function proximoEvento() {
    const agora = new Date();
    return EVENTOS_COPA_NORDESTE.find(e => e.data > agora) || EVENTOS_COPA_NORDESTE[EVENTOS_COPA_NORDESTE.length - 1];
}

// Fases da competição — 4 fases
const FASES_COPA_NORDESTE = [
    { fase: 'Fase de Grupos',    info: '25 Mar — 4 Mai 2026',  times: '20 clubes — 4 grupos de 5',        proxima: true },
    { fase: 'Quartas de Final',  info: '11 Mai 2026',          times: '8 clubes — jogo único'                             },
    { fase: 'Semifinais',        info: '18 + 25 Mai 2026',     times: '4 clubes — ida/volta'                              },
    { fase: 'Grande Final',      info: '31 Mai + 7 Jun 2026',  times: 'Ida e volta',                      final: true     },
];

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarCopaNordesteParticipante(params) {
    if (window.Log) Log.info('COPA-NORDESTE', 'Inicializando LP Copa do Nordeste 2026...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirCopaNordesteParticipante = destruirCopaNordesteParticipante;

    try {
        renderizarInfoHero();
        renderizarGrupos();
        renderizarFases();
        await carregarNoticias();

        if (window.Log) Log.info('COPA-NORDESTE', 'LP renderizada com sucesso');
    } catch (erro) {
        console.error('[COPA-NORDESTE] Erro na inicialização:', erro);
    }
}

export function destruirCopaNordesteParticipante() {
    // noop — sem intervalos ativos
}

// ═══════════════════════════════════════════════════
// INFO HERO — Status dinâmico da competição
// ═══════════════════════════════════════════════════

function renderizarInfoHero() {
    const container = document.getElementById('copane-status-chips');
    if (!container) return;

    const faseAtual = [...FASES_COPA_NORDESTE].reverse().find(f => f.concluida);
    const fasePendente = FASES_COPA_NORDESTE.find(f => f.proxima);
    const evento = proximoEvento();

    let html = '';

    if (faseAtual) {
        html += `<div class="copane-chip copane-chip--done">
            <span class="material-icons">check_circle</span>
            ${faseAtual.fase} concluída
        </div>`;
    }
    if (fasePendente) {
        html += `<div class="copane-chip copane-chip--next">
            <span class="material-icons">hourglass_top</span>
            Próxima: ${fasePendente.fase}
        </div>`;
    }
    if (evento) {
        const dataStr = evento.data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        html += `<div class="copane-chip copane-chip--event">
            <span class="material-icons">event</span>
            ${evento.label} — ${dataStr}
        </div>`;
    }

    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// GRUPOS — Grid 2x2
// ═══════════════════════════════════════════════════

function renderizarGrupos() {
    const container = document.getElementById('copane-grupos');
    if (!container) return;

    container.innerHTML = Object.values(GRUPOS_COPA_NORDESTE).map(grupo => {
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
// FASES (TIMELINE)
// ═══════════════════════════════════════════════════

function renderizarFases() {
    const container = document.getElementById('copane-timeline');
    if (!container) return;

    container.innerHTML = FASES_COPA_NORDESTE.map(f => {
        const isFinal    = !!f.final;
        const isConcluida = !!f.concluida;
        const isProxima  = !!f.proxima;

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
