// participante-copa-brasil.js
// v1.0 - Controller da Landing Page "Copa do Brasil 2026"
//
// Fontes de dados:
//   - API: /api/noticias/copa-brasil (Google News RSS, cache 30min)


// Eventos futuros da Copa do Brasil 2026 — countdown dinâmico para o próximo
const EVENTOS_COPA_BRASIL = [
    { label: 'Sorteio da 5ª Fase',    data: new Date('2026-03-23T14:00:00-03:00') },
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
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarCopaBrasilParticipante(params) {
    if (window.Log) Log.info('COPA-BRASIL', 'Inicializando LP Copa do Brasil 2026...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirCopaBrasilParticipante = destruirCopaBrasilParticipante;

    try {
        renderizarInfoHero();
        renderizarFases();
        await carregarNoticias();

        if (window.Log) Log.info('COPA-BRASIL', 'LP renderizada com sucesso');
    } catch (erro) {
        console.error('[COPA-BRASIL] Erro na inicialização:', erro);
    }
}

export function destruirCopaBrasilParticipante() {
    // noop — sem intervalos ativos
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

async function carregarNoticias() {
    const container = document.getElementById('copabr-noticias-lista');
    if (!container) return;

    try {
        const res = await fetch('/api/noticias/copa-brasil');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.noticias) && data.noticias.length > 0) {
            container.innerHTML = data.noticias.map(n => {
                const link = (n.link || '').replace(/"/g, '&quot;');
                const titulo = (n.titulo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const fonte = n.fonte || 'Notícia';
                const tempo = n.tempoRelativo ? `<span class="copabr-noticia-tempo">${n.tempoRelativo}</span>` : '';
                return `
                <div class="copabr-noticia-card"
                     onclick="window.open('${link}', '_blank')"
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
                </div>`;
            }).join('');
        } else {
            container.innerHTML = renderizarNoticiasFallback();
        }
    } catch (err) {
        if (window.Log) Log.warn('COPA-BRASIL', 'Erro ao carregar notícias:', err);
        container.innerHTML = renderizarNoticiasFallback();
    }
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
