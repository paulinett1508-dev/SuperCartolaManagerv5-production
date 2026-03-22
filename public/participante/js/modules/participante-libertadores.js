// participante-libertadores.js
// v2.0 - Controller da Landing Page "Libertadores 2026"
// v2.0 - Atualizado com grupos definidos (sorteio 19/Mar/2026)
//
// Fontes de dados:
//   - API: /api/noticias/libertadores (Google News RSS, cache 30min)
//   - Grupos: dados estáticos do sorteio oficial CONMEBOL

let countdownInterval = null;

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
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarLibertadoresParticipante(params) {
    if (window.Log) Log.info('LIBERTADORES', 'Inicializando LP Libertadores 2026...');

    // Registrar cleanup no window para o navigation poder chamar ao sair
    window.destruirLibertadoresParticipante = destruirLibertadoresParticipante;

    try {
        renderizarCountdown();
        countdownInterval = setInterval(renderizarCountdown, 60000);

        renderizarGrupos();
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
// GRUPOS
// ═══════════════════════════════════════════════════

function renderizarGrupos() {
    const container = document.getElementById('liberta-grupos-grid');
    if (!container) return;

    container.innerHTML = GRUPOS_LIBERTADORES.map(g => {
        const timesHtml = g.times.map(t => {
            const cls = t.brasileiro ? 'liberta-grupo-time liberta-grupo-time--br' : 'liberta-grupo-time';
            return `<div class="${cls}">
                <span class="liberta-grupo-pais">${t.pais}</span>
                <span class="liberta-grupo-nome">${t.nome}</span>
            </div>`;
        }).join('');

        return `<div class="liberta-grupo-card">
            <div class="liberta-grupo-header">Grupo ${g.grupo}</div>
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
