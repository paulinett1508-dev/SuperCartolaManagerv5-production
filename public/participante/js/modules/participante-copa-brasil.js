// participante-copa-brasil.js
// v1.0 - Controller da Landing Page "Copa do Brasil 2026"
//
// Fontes de dados:
//   - API: /api/noticias/copa-brasil (Google News RSS, cache 30min)

let countdownInterval = null;

// Data da Final da Copa do Brasil 2026 (estimada — final de outubro)
const FINAL_DATE = new Date('2026-10-28T21:30:00-03:00');

// Fases estáticas da competição (formato mata-mata)
const FASES_COPA_BRASIL = [
    { fase: '1ª Fase',             info: 'Fevereiro — Março 2026',      times: '92 clubes',       ativa: false },
    { fase: '2ª Fase',             info: 'Março — Abril 2026',          times: '64 clubes',        ativa: false },
    { fase: '3ª Fase',             info: 'Abril — Maio 2026',           times: '32 clubes',        ativa: false },
    { fase: 'Oitavas de Final',    info: 'Maio — Junho 2026',           times: '16 clubes',        ativa: false },
    { fase: 'Quartas de Final',    info: 'Julho — Agosto 2026',         times: '8 clubes',         ativa: false },
    { fase: 'Semifinais',          info: 'Setembro — Outubro 2026',     times: '4 clubes',         ativa: false },
    { fase: 'Grande Final',        info: 'Outubro 2026',                times: 'Jogo de ida e volta', final: true },
];

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarCopaBrasilParticipante(params) {
    if (window.Log) Log.info('COPA-BRASIL', 'Inicializando LP Copa do Brasil 2026...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirCopaBrasilParticipante = destruirCopaBrasilParticipante;

    try {
        renderizarCountdown();
        countdownInterval = setInterval(renderizarCountdown, 60000);

        renderizarFases();

        await carregarNoticias();

        if (window.Log) Log.info('COPA-BRASIL', 'LP renderizada com sucesso');
    } catch (erro) {
        console.error('[COPA-BRASIL] Erro na inicialização:', erro);
    }
}

export function destruirCopaBrasilParticipante() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// ═══════════════════════════════════════════════════
// COUNTDOWN
// ═══════════════════════════════════════════════════

function renderizarCountdown() {
    const agora = new Date();
    const diff = FINAL_DATE - agora;

    const elDias = document.getElementById('copabr-countdown-dias');
    const elHoras = document.getElementById('copabr-countdown-horas');
    const elMin = document.getElementById('copabr-countdown-min');
    if (!elDias || !elHoras || !elMin) return;

    if (diff <= 0) {
        elDias.textContent = '0';
        elHoras.textContent = '00';
        elMin.textContent = '00';
        return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    elDias.textContent = dias;
    elHoras.textContent = String(horas).padStart(2, '0');
    elMin.textContent = String(mins).padStart(2, '0');
}

// ═══════════════════════════════════════════════════
// FASES (TIMELINE)
// ═══════════════════════════════════════════════════

function renderizarFases() {
    const container = document.getElementById('copabr-timeline');
    if (!container) return;

    container.innerHTML = FASES_COPA_BRASIL.map(f => {
        const isFinal = !!f.final;
        const isAtiva = !!f.ativa;
        const cls = isFinal
            ? 'copabr-timeline-item copabr-timeline-item--final'
            : isAtiva
            ? 'copabr-timeline-item copabr-timeline-item--active'
            : 'copabr-timeline-item';

        const badge = isAtiva ? '<span class="copabr-timeline-badge">em andamento</span>' : '';

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
            <p class="copabr-noticia-title">92 clubes de todo o Brasil disputam o troféu mais desejado do futebol nacional</p>
            <div class="copabr-noticia-meta">
                <span class="copabr-noticia-fonte">Copa do Brasil 2026</span>
            </div>
        </div>
    </div>`;
}
