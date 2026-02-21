// participante-copa-2026-mundo.js
// v1.0 - Controller da Landing Page "Hub da Copa do Mundo 2026"
//
// Fontes de dados:
//   - API: /api/copa-2026/dados (grupos, jogos, estádios, período)
//   - API: /api/copa-2026/noticias (Google News RSS, cache 30min)
//   - Ao Vivo: /api/jogos-ao-vivo (quando Copa ativa, via api-orchestrator)

// ═══════════════════════════════════════════════════
// ESTADO DO MÓDULO
// ═══════════════════════════════════════════════════

let dadosCopa = null; // Cache local dos dados estáticos
let countdownInterval = null;

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarCopa2026Mundo(params) {
    if (window.Log) Log.info('COPA-MUNDO', 'Inicializando Hub da Copa do Mundo 2026...');

    try {
        // 1. Carregar dados estáticos da Copa via API
        await carregarDadosCopa();

        if (!dadosCopa) {
            console.error('[COPA-MUNDO] Falha ao carregar dados da Copa');
            return;
        }

        // 2. Renderizar seções estáticas (instantâneo com dados em memória)
        renderizarCountdown();
        renderizarJogosBrasil();
        renderizarGrupos();
        renderizarFaseEliminatoria();
        renderizarSedes();

        // 3. Iniciar countdown timer
        countdownInterval = setInterval(renderizarCountdown, 60000);

        // 4. Carregar notícias (assíncrono, não bloqueia render)
        carregarNoticias('geral');

        // 5. Setup tabs de notícias
        setupNoticiaTabs();

        if (window.Log) Log.info('COPA-MUNDO', 'Hub renderizado com sucesso');
    } catch (erro) {
        console.error('[COPA-MUNDO] Erro na inicialização:', erro);
    }
}

// Cleanup ao sair do módulo
export function destruirCopa2026Mundo() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// ═══════════════════════════════════════════════════
// CARREGAR DADOS (via API)
// ═══════════════════════════════════════════════════

async function carregarDadosCopa() {
    try {
        const resp = await fetch('/api/copa-2026/dados');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.success) throw new Error('API retornou erro');
        dadosCopa = data;
        if (window.Log) Log.debug('COPA-MUNDO', `Dados carregados: ${data.jogosFaseGrupos?.length} jogos`);
    } catch (erro) {
        console.error('[COPA-MUNDO] Erro ao carregar dados:', erro);
        dadosCopa = null;
    }
}

// Helper: buscar bandeira
function getBandeira(nome) {
    if (!nome || !dadosCopa?.bandeiras) return '';
    return dadosCopa.bandeiras[nome] || dadosCopa.bandeiras[nome?.trim()] || '';
}

// ═══════════════════════════════════════════════════
// COUNTDOWN
// ═══════════════════════════════════════════════════

function renderizarCountdown() {
    if (!dadosCopa?.periodo) return;

    const agora = new Date();
    const abertura = new Date(`${dadosCopa.periodo.inicio}T17:00:00-05:00`);
    const diff = abertura - agora;

    const elDias = document.getElementById('copa-countdown-dias');
    const elHoras = document.getElementById('copa-countdown-horas');
    const elMin = document.getElementById('copa-countdown-min');

    if (!elDias) return;

    if (diff <= 0) {
        const countdownEl = document.getElementById('copa-countdown');
        if (countdownEl) {
            countdownEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.5rem;background:rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.4);border-radius:999px;padding:0.35rem 1rem;">
                    <span style="width:0.5rem;height:0.5rem;background:var(--app-success);border-radius:50%;animation:pulse 2s infinite;"></span>
                    <span style="font-family:var(--app-font-brand);font-size:0.85rem;color:var(--app-success);">COPA EM ANDAMENTO</span>
                </div>
            `;
        }
        return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    elDias.textContent = dias;
    elHoras.textContent = String(horas).padStart(2, '0');
    elMin.textContent = String(minutos).padStart(2, '0');
}

// ═══════════════════════════════════════════════════
// JOGOS DO BRASIL
// ═══════════════════════════════════════════════════

/**
 * Renderiza uma linha compacta de fixture (scoreboard style)
 * Usado em Jogos do Brasil e Tabela de Grupos da LP.
 */
function renderizarLpFxRow(jogo) {
    const mandanteIsBrasil = jogo.mandante === 'Brasil';
    const visitanteIsBrasil = jogo.visitante === 'Brasil';
    const isBrasil = mandanteIsBrasil || visitanteIsBrasil;

    const dataFmt = formatarData(jogo.data); // ex: "14/jun"

    return `
    <div class="copa-lp-fx-row${isBrasil ? ' brasil-jogo' : ''}">
        <div class="copa-lp-fx-home">
            <span class="copa-lp-fx-name${mandanteIsBrasil ? ' destaque' : ''}">${jogo.mandante}</span>
            <span class="copa-lp-fx-flag">${getBandeira(jogo.mandante)}</span>
        </div>
        <div class="copa-lp-fx-score">
            <span class="copa-lp-fx-time">${jogo.horarioBR || 'TBD'}</span>
            <span class="copa-lp-fx-date">${dataFmt}</span>
        </div>
        <div class="copa-lp-fx-away">
            <span class="copa-lp-fx-flag">${getBandeira(jogo.visitante)}</span>
            <span class="copa-lp-fx-name${visitanteIsBrasil ? ' destaque' : ''}">${jogo.visitante}</span>
        </div>
        <div class="copa-lp-fx-round">R${jogo.rodada}</div>
    </div>`;
}

function renderizarJogosBrasil() {
    const container = document.getElementById('copa-brasil-jogos');
    if (!container || !dadosCopa?.jogosFaseGrupos) return;

    const jogosBrasil = dadosCopa.jogosFaseGrupos.filter(
        j => j.mandante === 'Brasil' || j.visitante === 'Brasil'
    );

    if (!jogosBrasil.length) {
        container.innerHTML = '<p class="copa-loading-placeholder">Jogos do Brasil ainda não definidos</p>';
        return;
    }

    container.innerHTML = `<div class="copa-lp-fx-table">${jogosBrasil.map(renderizarLpFxRow).join('')}</div>`;
}

// ═══════════════════════════════════════════════════
// NOTÍCIAS
// ═══════════════════════════════════════════════════

async function carregarNoticias(categoria) {
    const container = document.getElementById('copa-noticias-lista');
    if (!container) return;

    container.innerHTML = '<div class="copa-loading-placeholder">Carregando notícias...</div>';

    try {
        const resp = await fetch(`/api/copa-2026/noticias?categoria=${categoria}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();

        if (!data.success || !data.noticias?.length) {
            container.innerHTML = '<div class="copa-loading-placeholder">Nenhuma notícia encontrada</div>';
            return;
        }

        container.innerHTML = data.noticias.map(noticia => `
            <a href="${escapeHtml(noticia.link)}" target="_blank" rel="noopener" class="copa-noticia-card">
                <div class="copa-noticia-titulo">${escapeHtml(noticia.titulo)}</div>
                <div class="copa-noticia-meta">
                    ${noticia.fonte ? `<span class="copa-noticia-fonte">${escapeHtml(noticia.fonte)}</span>` : ''}
                    ${noticia.tempoRelativo ? `<span class="copa-noticia-tempo">${noticia.tempoRelativo}</span>` : ''}
                </div>
            </a>
        `).join('');

    } catch (erro) {
        console.error('[COPA-MUNDO] Erro ao carregar notícias:', erro);
        container.innerHTML = '<div class="copa-loading-placeholder">Erro ao carregar notícias. Tente novamente.</div>';
    }
}

function setupNoticiaTabs() {
    const tabsContainer = document.getElementById('copa-noticias-tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.copa-tab');
        if (!tab) return;

        const categoria = tab.dataset.categoria;
        if (!categoria) return;

        // Atualizar estado ativo
        tabsContainer.querySelectorAll('.copa-tab').forEach(t => t.classList.remove('copa-tab-active'));
        tab.classList.add('copa-tab-active');

        // Carregar notícias da categoria
        carregarNoticias(categoria);
    });
}

// ═══════════════════════════════════════════════════
// GRUPOS (Accordion)
// ═══════════════════════════════════════════════════

function renderizarGrupos() {
    const container = document.getElementById('copa-grupos-container');
    if (!container || !dadosCopa?.grupos) return;

    const gruposOrdenados = Object.entries(dadosCopa.grupos).sort((a, b) => a[0].localeCompare(b[0]));
    const jogos = dadosCopa.jogosFaseGrupos || [];

    container.innerHTML = gruposOrdenados.map(([letra, selecoes]) => {
        const isBrasil = letra === 'C';
        const jogosDoGrupo = jogos.filter(j => j.grupo === letra);

        // Preview: bandeiras das seleções
        const flagsPreview = selecoes.map(s => getBandeira(s)).join(' ');

        return `
        <details class="copa-grupo-details" data-grupo="${letra}" ${isBrasil ? 'open' : ''}>
            <summary class="copa-grupo-summary">
                <span class="copa-grupo-letra">${letra}</span>
                <div class="copa-grupo-selecoes-preview">
                    <span class="copa-grupo-selecao-flag">${flagsPreview}</span>
                    <span class="copa-grupo-selecao-name">${selecoes.join(' · ')}</span>
                </div>
                <span class="copa-grupo-arrow">&#9654;</span>
            </summary>
            <div class="copa-grupo-content">
                <div class="copa-lp-fx-table" style="padding: 0 4px;">
                    ${jogosDoGrupo.map(renderizarLpFxRow).join('')}
                </div>
            </div>
        </details>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════
// FASE ELIMINATÓRIA (Timeline)
// ═══════════════════════════════════════════════════

function renderizarFaseEliminatoria() {
    const container = document.getElementById('copa-eliminatoria-timeline');
    if (!container || !dadosCopa?.faseEliminatoria) return;

    const fases = Object.entries(dadosCopa.faseEliminatoria);

    container.innerHTML = fases.map(([nome, info]) => {
        const isFinal = nome === 'Final';
        const datas = info.data
            ? formatarData(info.data)
            : `${formatarData(info.inicio)} a ${formatarData(info.fim)}`;

        return `
        <div class="copa-timeline-item ${isFinal ? 'copa-timeline-item-final' : ''}">
            <div class="copa-timeline-fase">${nome}</div>
            <div class="copa-timeline-info">
                ${datas}
                ${info.estadio ? ` · ${info.estadio}` : ''}
            </div>
            <div class="copa-timeline-jogos">${info.jogos} ${info.jogos === 1 ? 'jogo' : 'jogos'}</div>
        </div>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════
// SEDES E ESTÁDIOS
// ═══════════════════════════════════════════════════

function renderizarSedes() {
    const container = document.getElementById('copa-sedes-grid');
    if (!container || !dadosCopa?.estadios) return;

    const estadiosOrdenados = Object.entries(dadosCopa.estadios)
        .sort((a, b) => {
            const ordemPais = { 'EUA': 0, 'MEX': 1, 'CAN': 2 };
            const pA = ordemPais[a[1].pais] ?? 9;
            const pB = ordemPais[b[1].pais] ?? 9;
            if (pA !== pB) return pA - pB;
            return b[1].capacidade - a[1].capacidade;
        });

    container.innerHTML = estadiosOrdenados.map(([nome, info]) => {
        const bandeiraPais = getBandeira(info.pais);
        const temFoto = !!info.foto;
        const nomeEscaped = escapeHtml(nome);
        const cidadeEscaped = escapeHtml(info.cidade);

        const verso = temFoto
            ? `<div class="copa-sede-card-back">
                <img class="copa-sede-back-foto"
                     src="${escapeHtml(info.foto)}"
                     loading="lazy"
                     alt="${nomeEscaped}">
                <div class="copa-sede-back-overlay">
                    <span class="copa-sede-back-nome">${nomeEscaped}</span>
                    <span class="copa-sede-back-cidade">${cidadeEscaped}</span>
                </div>
                <div class="copa-sede-back-flip-hint" aria-hidden="true">
                    <span class="material-icons">flip</span>
                </div>
               </div>`
            : `<div class="copa-sede-card-back copa-sede-card-back--empty">
                <span class="material-icons">stadium</span>
               </div>`;

        return `
        <div class="copa-sede-card"
             data-estadio="${nomeEscaped}"
             data-cidade="${cidadeEscaped}"
             data-capacidade="${info.capacidade}"
             role="button"
             tabindex="0"
             aria-label="${nomeEscaped}, ${cidadeEscaped}. Toque para ver foto.">
            <div class="copa-sede-card-front">
                <div class="copa-sede-header">
                    <span class="copa-sede-pais-flag">${bandeiraPais}</span>
                    <span class="copa-sede-pais-label">${info.pais}</span>
                    ${temFoto ? `<span class="copa-sede-foto-hint"><span class="material-icons">photo_camera</span></span>` : ''}
                </div>
                <span class="copa-sede-cidade">${cidadeEscaped}</span>
                <span class="copa-sede-estadio">${nomeEscaped}</span>
                <span class="copa-sede-capacidade">${info.capacidade.toLocaleString('pt-BR')} lugares</span>
            </div>
            ${verso}
        </div>`;
    }).join('');

    // Adicionar event listeners aos cards
    setupSedesClique();
}

// ═══════════════════════════════════════════════════
// MODAL ESTÁDIO
// ═══════════════════════════════════════════════════

function setupSedesClique() {
    const container = document.getElementById('copa-sedes-grid');
    if (!container) return;

    const toggleFlip = (card) => {
        if (!card) return;
        const virandoPara = card.classList.toggle('flipped');
        card.setAttribute('aria-label',
            virandoPara
                ? `${card.dataset.estadio} — toque para voltar`
                : `${card.dataset.estadio}, ${card.dataset.cidade}. Toque para ver foto.`
        );
    };

    container.addEventListener('click', (e) => {
        toggleFlip(e.target.closest('.copa-sede-card'));
    });

    // Acessibilidade: Enter/Space vira o card
    container.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const card = e.target.closest('.copa-sede-card');
            if (card) {
                e.preventDefault();
                toggleFlip(card);
            }
        }
    });
}

function abrirModalEstadio(nome, fotoUrl, cidade, capacidade) {
    const modal = document.getElementById('copa-estadio-modal');
    const imgEl = document.getElementById('copa-modal-foto');
    const nomeEl = document.getElementById('copa-modal-nome');
    const detalhesEl = document.getElementById('copa-modal-detalhes');
    const fallbackEl = modal?.querySelector('.copa-modal-fallback');

    if (!modal || !imgEl) return;

    // Reset estado
    imgEl.classList.remove('loaded');
    imgEl.src = '';
    if (fallbackEl) fallbackEl.style.display = 'flex';

    // Preencher dados
    nomeEl.textContent = nome;
    detalhesEl.textContent = `${cidade} • ${capacidade.toLocaleString('pt-BR')} lugares`;

    // Carregar imagem com fallback
    if (fotoUrl) {
        imgEl.onload = () => {
            imgEl.classList.add('loaded');
            if (fallbackEl) fallbackEl.style.display = 'none';
        };
        imgEl.onerror = () => {
            imgEl.classList.remove('loaded');
            if (fallbackEl) fallbackEl.style.display = 'flex';
        };
        imgEl.src = fotoUrl;
        imgEl.alt = nome;
    }

    // Abrir modal
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Setup fechar modal
    setupFecharModal(modal);
}

function setupFecharModal(modal) {
    const closeBtn = modal.querySelector('.copa-modal-close');
    const backdrop = modal.querySelector('.copa-modal-backdrop');

    const handleEsc = (e) => {
        if (e.key === 'Escape') fechar();
    };

    const fechar = () => {
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        // Remove ESC listener independente de como o modal foi fechado
        document.removeEventListener('keydown', handleEsc);
    };

    closeBtn?.addEventListener('click', fechar, { once: true });
    backdrop?.addEventListener('click', fechar, { once: true });
    document.addEventListener('keydown', handleEsc);
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════

function formatarData(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-');
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${parseInt(dia)}/${meses[parseInt(mes) - 1]}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Log de carregamento
if (window.Log) Log.info('COPA-MUNDO', 'Módulo participante-copa-2026-mundo.js carregado');
