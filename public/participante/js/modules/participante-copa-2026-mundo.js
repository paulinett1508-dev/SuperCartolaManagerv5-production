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
                    <span style="width:0.5rem;height:0.5rem;background:#22c55e;border-radius:50%;animation:pulse 2s infinite;"></span>
                    <span style="font-family:var(--app-font-brand);font-size:0.85rem;color:#22c55e;">COPA EM ANDAMENTO</span>
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

    container.innerHTML = jogosBrasil.map(jogo => {
        const mandanteIsBrasil = jogo.mandante === 'Brasil';
        const visitanteIsBrasil = jogo.visitante === 'Brasil';
        const dataFormatada = formatarData(jogo.data);

        return `
        <div class="copa-jogo-brasil">
            <span class="copa-jogo-rodada">R${jogo.rodada}</span>
            <div class="copa-jogo-times">
                <div class="copa-jogo-time ${mandanteIsBrasil ? 'copa-jogo-time-brasil' : ''}">
                    <span>${getBandeira(jogo.mandante)}</span>
                    <span class="copa-jogo-time-nome">${jogo.mandante}</span>
                </div>
                <span class="copa-jogo-vs">vs</span>
                <div class="copa-jogo-time ${visitanteIsBrasil ? 'copa-jogo-time-brasil' : ''}">
                    <span class="copa-jogo-time-nome">${jogo.visitante}</span>
                    <span>${getBandeira(jogo.visitante)}</span>
                </div>
            </div>
            <div class="copa-jogo-info">
                <span class="copa-jogo-data">${dataFormatada} ${jogo.horarioBR}</span>
                <span class="copa-jogo-local">${jogo.estadio}</span>
            </div>
        </div>
        `;
    }).join('');
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
                ${jogosDoGrupo.map(jogo => {
                    const mandanteIsBrasil = jogo.mandante === 'Brasil';
                    const visitanteIsBrasil = jogo.visitante === 'Brasil';
                    return `
                    <div class="copa-grupo-jogo">
                        <span class="copa-grupo-jogo-rodada">R${jogo.rodada}</span>
                        <div class="copa-grupo-jogo-times">
                            <span>${getBandeira(jogo.mandante)}</span>
                            <span class="copa-grupo-jogo-team ${mandanteIsBrasil ? 'copa-grupo-jogo-team-brasil' : ''}">${jogo.mandante}</span>
                            <span class="copa-grupo-jogo-vs">vs</span>
                            <span class="copa-grupo-jogo-team ${visitanteIsBrasil ? 'copa-grupo-jogo-team-brasil' : ''}">${jogo.visitante}</span>
                            <span>${getBandeira(jogo.visitante)}</span>
                        </div>
                        <span class="copa-grupo-jogo-info">${formatarData(jogo.data)} ${jogo.horarioBR}</span>
                    </div>
                    `;
                }).join('')}
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
            const ordemPais = { '\u{1F1FA}\u{1F1F8}': 0, '\u{1F1F2}\u{1F1FD}': 1, '\u{1F1E8}\u{1F1E6}': 2 };
            const pA = ordemPais[a[1].pais] ?? 9;
            const pB = ordemPais[b[1].pais] ?? 9;
            if (pA !== pB) return pA - pB;
            return b[1].capacidade - a[1].capacidade;
        });

    container.innerHTML = estadiosOrdenados.map(([nome, info]) => `
        <div class="copa-sede-card">
            <span class="copa-sede-pais">${info.pais}</span>
            <span class="copa-sede-cidade">${info.cidade}</span>
            <span class="copa-sede-estadio">${nome}</span>
            <span class="copa-sede-capacidade">${info.capacidade.toLocaleString('pt-BR')} lugares</span>
        </div>
    `).join('');
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
