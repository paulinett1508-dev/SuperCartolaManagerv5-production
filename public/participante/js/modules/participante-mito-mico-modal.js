// =====================================================================
// PARTICIPANTE MITO/MICO MODAL v1.0
// Modal celebratório que aparece 1x por rodada após consolidação.
// Exibe o MITO (1º lugar) e o MICO (último) da última rodada consolidada.
// Controle de exibição via localStorage (uma vez por rodada/liga/temporada).
// =====================================================================

/**
 * Inicializa o modal de Mito & Mico.
 * Chamado após a navegação inicial do app participante.
 *
 * @param {Object} opts
 * @param {string} opts.ligaId
 * @param {string|number} opts.timeId
 * @param {number} opts.temporada
 */
export async function initMitoMicoModal({ ligaId, timeId, temporada }) {
    if (!ligaId) return;

    try {
        // 1. Buscar status do mercado
        const mercadoRes = await fetch('/api/cartola/mercado/status');
        if (!mercadoRes.ok) return;
        const mercado = await mercadoRes.json();

        const rodadaAtual = Number(mercado.rodada_atual || 0);
        const statusMercado = Number(mercado.status_mercado || 0);
        if (!rodadaAtual) return;

        // 2. Calcular última rodada consolidada
        // status=1 (mercado aberto): rodada_atual = próxima rodada → última consolidada = rodada_atual-1
        // status!=1 (mercado fechado/ao vivo): rodada_atual = rodada em andamento
        const ultimaConsolidada = statusMercado === 1 ? rodadaAtual - 1 : rodadaAtual;
        if (ultimaConsolidada < 1) return;

        // 3. Verificar se já foi exibido nessa rodada (uma exibição por rodada)
        const storageKey = `mmm_${ligaId}_${ultimaConsolidada}_${temporada}`;
        if (localStorage.getItem(storageKey)) return;

        // 4. Buscar dados de top10 cache
        const top10Res = await fetch(
            `/api/top10/cache/${ligaId}?rodada=${ultimaConsolidada}&temporada=${temporada}`
        );
        if (!top10Res.ok) return;
        const top10 = await top10Res.json();

        if (!top10.cached || !top10.mitos?.length || !top10.micos?.length) return;

        // 5. Marcar como exibido antes de mostrar (previne loop em erro)
        localStorage.setItem(storageKey, '1');

        // 6. Determinar mito e mico (mito = maior pontuação, mico = menor)
        const mito = [...top10.mitos].sort((a, b) => (b.pontos || 0) - (a.pontos || 0))[0];
        const mico = [...top10.micos].sort((a, b) => (a.pontos || 0) - (b.pontos || 0))[0];

        // 7. Detectar se o viewer é o mito ou o mico
        const viewerTimeId = String(timeId);
        const isMito = String(mito.timeId || mito.time_id) === viewerTimeId;
        const isMico = String(mico.timeId || mico.time_id) === viewerTimeId;

        // 8. Injetar e exibir modal
        _injetarModal({ mito, mico, rodada: ultimaConsolidada, isMito, isMico });

    } catch {
        // Silencioso — feature não-crítica, nunca deve quebrar o app
    }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function _pts(item) {
    const n = parseFloat(item.pontos) || 0;
    // Truncar (regra do projeto: nunca arredondar)
    const t = Math.trunc(n * 100) / 100;
    return t.toFixed(2);
}

function _escudoHTML(item, tipo) {
    const cls = `mmm-escudo mmm-escudo--${tipo}`;
    const fallback = `onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"`;
    if (item.clube_id) {
        return `<img class="${cls}" src="/escudos/${item.clube_id}.png" alt="" ${fallback}><span class="material-symbols-outlined mmm-escudo-fallback" style="display:none">shield</span>`;
    }
    const src = item.escudo || item.url_escudo_png;
    if (src) {
        return `<img class="${cls}" src="${src}" alt="" ${fallback}><span class="material-symbols-outlined mmm-escudo-fallback" style="display:none">shield</span>`;
    }
    return `<span class="material-symbols-outlined mmm-escudo-fallback">shield</span>`;
}

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _injetarModal({ mito, mico, rodada, isMito, isMico }) {
    document.getElementById('mmm-overlay')?.remove();

    const mitoMsg = isMito
        ? `<p class="mmm-viewer-badge mmm-viewer-badge--mito"><span class="material-symbols-outlined">emoji_events</span> Você foi o MITO desta rodada!</p>`
        : '';
    const micoMsg = isMico
        ? `<p class="mmm-viewer-badge mmm-viewer-badge--mico"><span class="material-symbols-outlined">sentiment_very_dissatisfied</span> Você foi o MICO desta rodada!</p>`
        : '';

    const html = `
<div class="mmm-overlay" id="mmm-overlay" role="dialog" aria-modal="true" aria-label="Mito e Mico da Rodada ${rodada}">
    <div class="mmm-card" id="mmm-card">
        <button class="mmm-close" id="mmm-close" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
        </button>

        <div class="mmm-header">
            <p class="mmm-label-rodada">Rodada ${rodada}</p>
            <h2 class="mmm-titulo">Mito &amp; Mico</h2>
        </div>

        <div class="mmm-duo">
            <div class="mmm-bloco mmm-bloco--mito">
                <span class="mmm-tag mmm-tag--mito">
                    <span class="material-symbols-outlined">emoji_events</span> MITO
                </span>
                <div class="mmm-escudo-wrap">
                    ${_escudoHTML(mito, 'mito')}
                </div>
                <p class="mmm-nome-time">${_esc(mito.nome_time || 'Time')}</p>
                <p class="mmm-nome-cartola">${_esc(mito.nome_cartola || '')}</p>
                <p class="mmm-pontos mmm-pontos--mito">${_pts(mito)} pts</p>
            </div>

            <div class="mmm-bloco mmm-bloco--mico">
                <span class="mmm-tag mmm-tag--mico">
                    <span class="material-symbols-outlined">sentiment_very_dissatisfied</span> MICO
                </span>
                <div class="mmm-escudo-wrap">
                    ${_escudoHTML(mico, 'mico')}
                </div>
                <p class="mmm-nome-time">${_esc(mico.nome_time || 'Time')}</p>
                <p class="mmm-nome-cartola">${_esc(mico.nome_cartola || '')}</p>
                <p class="mmm-pontos mmm-pontos--mico">${_pts(mico)} pts</p>
            </div>
        </div>

        ${mitoMsg}
        ${micoMsg}

        <button class="mmm-btn-fechar" id="mmm-btn-fechar">
            Ver Top 10 completo
        </button>
    </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('mmm-overlay');
    const closeBtn = document.getElementById('mmm-close');
    const verBtn = document.getElementById('mmm-btn-fechar');

    const fechar = () => overlay?.remove();

    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    closeBtn?.addEventListener('click', fechar);
    verBtn?.addEventListener('click', () => {
        fechar();
        if (window.participanteNav?.navegarPara) {
            window.participanteNav.navegarPara('top10');
        }
    });

    const onKey = (e) => {
        if (e.key === 'Escape') {
            fechar();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);

    // Ativar animação de entrada no próximo frame
    requestAnimationFrame(() => overlay.classList.add('mmm-overlay--visible'));
}
