// participante-libertadores.js
// v1.0 - Controller da Landing Page "Libertadores 2026"
//
// Fontes de dados:
//   - API: /api/noticias/libertadores (Google News RSS, cache 30min)

let countdownInterval = null;

// Data da Final da Libertadores 2026 (estimada — 3ª semana de novembro)
const FINAL_DATE = new Date('2026-11-21T21:00:00-03:00');

// Fases estáticas da competição
const FASES_LIBERTADORES = [
    { fase: 'Fase de Grupos',       info: 'Fevereiro — Maio 2026',  times: '32 clubes • 8 grupos',  ativa: false },
    { fase: 'Oitavas de Final',     info: 'Maio — Junho 2026',      times: '16 clubes',              ativa: false },
    { fase: 'Quartas de Final',     info: 'Julho — Agosto 2026',    times: '8 clubes',               ativa: false },
    { fase: 'Semifinais',           info: 'Setembro — Outubro 2026',times: '4 clubes',               ativa: false },
    { fase: 'Grande Final',         info: 'Novembro 2026',          times: 'Jogo único',             final: true  },
];

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarLibertadoresParticipante(params) {
    if (window.Log) Log.info('LIBERTADORES', 'Inicializando LP Libertadores 2026...');

    try {
        renderizarCountdown();
        countdownInterval = setInterval(renderizarCountdown, 60000);

        renderizarFases();

        await carregarNoticias();

        if (window.Log) Log.info('LIBERTADORES', 'LP renderizada com sucesso');
    } catch (erro) {
        console.error('[LIBERTADORES] Erro na inicialização:', erro);
    }
}

export function destruirLibertadoresParticipante() {
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

    const elDias = document.getElementById('liberta-countdown-dias');
    const elHoras = document.getElementById('liberta-countdown-horas');
    const elMin = document.getElementById('liberta-countdown-min');
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
    const container = document.getElementById('liberta-timeline');
    if (!container) return;

    container.innerHTML = FASES_LIBERTADORES.map(f => {
        const isFinal = !!f.final;
        const isAtiva = !!f.ativa;
        const cls = isFinal
            ? 'liberta-timeline-item liberta-timeline-item--final'
            : isAtiva
            ? 'liberta-timeline-item liberta-timeline-item--active'
            : 'liberta-timeline-item';

        const badge = isAtiva ? '<span class="liberta-timeline-badge">em andamento</span>' : '';

        return `
        <div class="${cls}">
            <p class="liberta-timeline-fase">${f.fase}${badge}</p>
            <p class="liberta-timeline-info">${f.info} &bull; ${f.times}</p>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════
// NOTÍCIAS
// ═══════════════════════════════════════════════════

async function carregarNoticias() {
    const container = document.getElementById('liberta-noticias-lista');
    if (!container) return;

    try {
        const res = await fetch('/api/noticias/libertadores');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.noticias) && data.noticias.length > 0) {
            container.innerHTML = data.noticias.map(n => {
                const link = (n.link || '').replace(/"/g, '&quot;');
                const titulo = (n.titulo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const fonte = n.fonte || 'Notícia';
                const tempo = n.tempoRelativo ? `<span class="liberta-noticia-tempo">${n.tempoRelativo}</span>` : '';
                return `
                <div class="liberta-noticia-card"
                     onclick="window.open('${link}', '_blank')"
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
                </div>`;
            }).join('');
        } else {
            container.innerHTML = renderizarNoticiasFallback();
        }
    } catch (err) {
        if (window.Log) Log.warn('LIBERTADORES', 'Erro ao carregar notícias:', err);
        container.innerHTML = renderizarNoticiasFallback();
    }
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
