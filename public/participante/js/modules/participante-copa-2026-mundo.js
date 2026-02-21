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

        // 2. Renderizar secoes estaticas (instantaneo com dados em memoria)
        renderizarCountdown();
        renderizarJogosBrasil();
        renderizarGrupos();
        renderizarClassificacao();
        renderizarFaseEliminatoria();
        renderizarSedes();

        // 3. Iniciar countdown timer
        countdownInterval = setInterval(renderizarCountdown, 60000);

        // 4. Carregar noticias (assincrono, nao bloqueia render)
        carregarNoticias('geral');

        // 5. Setup tabs de noticias e toggles
        setupNoticiaTabs();
        setupGruposToggle();

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
// JOGOS DO BRASIL — Card-style (Stitch design)
// ═══════════════════════════════════════════════════

// Siglas de selecoes (3 letras)
const SIGLAS = {
    'Brasil': 'BRA', 'Marrocos': 'MAR', 'Haiti': 'HAI', 'Escocia': 'ESC',
    'Mexico': 'MEX', 'Coreia do Sul': 'COR', 'Africa do Sul': 'AFS',
    'Canada': 'CAN', 'Suica': 'SUI', 'Catar': 'CAT',
    'Estados Unidos': 'EUA', 'Paraguai': 'PAR', 'Australia': 'AUS',
    'Alemanha': 'ALE', 'Costa do Marfim': 'CDM', 'Equador': 'EQU', 'Curacao': 'CUR',
    'Holanda': 'HOL', 'Japao': 'JAP', 'Tunisia': 'TUN',
    'Belgica': 'BEL', 'Egito': 'EGI', 'Ira': 'IRA', 'Nova Zelandia': 'NZL',
    'Espanha': 'ESP', 'Uruguai': 'URU', 'Arabia Saudita': 'ARS', 'Cabo Verde': 'CPV',
    'Franca': 'FRA', 'Senegal': 'SEN', 'Noruega': 'NOR',
    'Argentina': 'ARG', 'Argelia': 'ARG', 'Austria': 'AUT', 'Jordania': 'JOR',
    'Portugal': 'POR', 'Colombia': 'COL', 'Uzbequistao': 'UZB',
    'Inglaterra': 'ING', 'Croacia': 'CRO', 'Gana': 'GAN', 'Panama': 'PAN',
};

function getSigla(nome) {
    if (!nome) return '???';
    // Tenta match direto, depois sem acentos
    if (SIGLAS[nome]) return SIGLAS[nome];
    const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (SIGLAS[semAcento]) return SIGLAS[semAcento];
    // Fallback: primeiras 3 letras
    return nome.substring(0, 3).toUpperCase();
}

/**
 * Renderiza uma linha compacta de fixture (scoreboard style)
 * Usado dentro dos grupos expandidos.
 */
function renderizarLpFxRow(jogo) {
    const mandanteIsBrasil = jogo.mandante === 'Brasil';
    const visitanteIsBrasil = jogo.visitante === 'Brasil';
    const isBrasil = mandanteIsBrasil || visitanteIsBrasil;

    const dataFmt = formatarData(jogo.data);

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

/**
 * Renderiza card individual de match (Stitch-style)
 * Usado na secao Jogos do Brasil.
 */
function renderizarMatchCard(jogo) {
    const dataFmt = formatarDataCurta(jogo.data);

    return `
    <div class="copa-match-card">
        <div class="copa-match-team">
            <span class="copa-match-team-sigla">${getSigla(jogo.mandante)}</span>
            <span class="copa-match-team-flag">${getBandeira(jogo.mandante)}</span>
        </div>
        <div class="copa-match-center">
            <span class="copa-match-horario">${jogo.horarioBR || 'TBD'}</span>
            <span class="copa-match-data">${dataFmt}</span>
        </div>
        <div class="copa-match-team copa-match-team--away">
            <span class="copa-match-team-flag">${getBandeira(jogo.visitante)}</span>
            <span class="copa-match-team-sigla">${getSigla(jogo.visitante)}</span>
        </div>
    </div>`;
}

function renderizarJogosBrasil() {
    const container = document.getElementById('copa-brasil-jogos');
    if (!container || !dadosCopa?.jogosFaseGrupos) return;

    const jogosBrasil = dadosCopa.jogosFaseGrupos.filter(
        j => j.mandante === 'Brasil' || j.visitante === 'Brasil'
    );

    if (!jogosBrasil.length) {
        container.innerHTML = '<p class="copa-loading-placeholder">Jogos do Brasil ainda nao definidos</p>';
        return;
    }

    container.innerHTML = jogosBrasil.map(renderizarMatchCard).join('');
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

        // Overlapping flags stack
        const flagsStack = selecoes.map(s =>
            `<span class="copa-grupo-flag-item">${getBandeira(s)}</span>`
        ).join('');

        // Nomes truncados (ex: "Brasil, Marrocos, Haiti, Esc...")
        const nomesTexto = selecoes.map(s => {
            const nome = s.length > 8 ? s.substring(0, 6) + '...' : s;
            return nome;
        }).join(', ');

        // Jogos formatados para dentro do grupo expandido (Stitch-style)
        const jogosHtml = jogosDoGrupo.map(jogo => {
            const mandanteIsBrasil = jogo.mandante === 'Brasil';
            const visitanteIsBrasil = jogo.visitante === 'Brasil';
            const dataFmt = formatarDataCurta(jogo.data);
            return `
            <div class="copa-grupo-game">
                <span class="copa-grupo-game-team${mandanteIsBrasil ? ' copa-grupo-game-team--brasil' : ''}">${jogo.mandante}</span>
                <span class="copa-grupo-game-info">${dataFmt} &bull; ${jogo.horarioBR || 'TBD'}</span>
                <span class="copa-grupo-game-team copa-grupo-game-team--away${visitanteIsBrasil ? ' copa-grupo-game-team--brasil' : ''}">${jogo.visitante}</span>
            </div>`;
        }).join('');

        return `
        <details class="copa-grupo-details" data-grupo="${letra}" ${isBrasil ? 'open' : ''}>
            <summary class="copa-grupo-summary">
                <span class="copa-grupo-letra ${isBrasil ? 'copa-grupo-letra--brasil' : 'copa-grupo-letra--default'}">${letra}</span>
                <div class="copa-grupo-flags-stack">${flagsStack}</div>
                <span class="copa-grupo-nomes">${nomesTexto}</span>
                <span class="copa-grupo-arrow"><span class="material-icons">${isBrasil ? 'expand_less' : 'chevron_right'}</span></span>
            </summary>
            <div class="copa-grupo-content">
                ${jogosHtml}
            </div>
        </details>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════
// CLASSIFICACAO — Standings por grupo (Stitch-inspired)
// ═══════════════════════════════════════════════════

/**
 * Calcula classificacao de um grupo a partir dos jogos finalizados.
 * Pre-torneio: retorna todos com 0 pts em ordem alfabetica.
 * @returns {Array<{time, bandeira, j, v, e, d, gp, gc, sg, pts, forma}>}
 */
function calcularClassificacaoGrupo(grupoLetra, selecoes, jogos) {
    // Inicializar tabela
    const tabela = {};
    selecoes.forEach(time => {
        tabela[time] = {
            time,
            bandeira: getBandeira(time),
            j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0,
            forma: [] // ultimos resultados: 'W', 'D', 'L'
        };
    });

    // Processar jogos finalizados (se houver resultados)
    const jogosDoGrupo = jogos.filter(j => j.grupo === grupoLetra && j.golsMandante != null);
    jogosDoGrupo.forEach(jogo => {
        const m = tabela[jogo.mandante];
        const v = tabela[jogo.visitante];
        if (!m || !v) return;

        const gm = jogo.golsMandante;
        const gv = jogo.golsVisitante;

        m.j++; v.j++;
        m.gp += gm; m.gc += gv;
        v.gp += gv; v.gc += gm;

        if (gm > gv) {
            m.v++; m.pts += 3; m.forma.push('W');
            v.d++; v.forma.push('L');
        } else if (gm < gv) {
            v.v++; v.pts += 3; v.forma.push('W');
            m.d++; m.forma.push('L');
        } else {
            m.e++; m.pts += 1; m.forma.push('D');
            v.e++; v.pts += 1; v.forma.push('D');
        }
    });

    // Calcular saldo de gols
    Object.values(tabela).forEach(t => { t.sg = t.gp - t.gc; });

    // Ordenar: pts DESC, sg DESC, gp DESC, nome ASC
    return Object.values(tabela).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.sg !== a.sg) return b.sg - a.sg;
        if (b.gp !== a.gp) return b.gp - a.gp;
        return a.time.localeCompare(b.time);
    });
}

/**
 * Determina o status da fase de grupos para exibicao
 */
function getStatusGrupos() {
    if (!dadosCopa?.periodo) return { fase: 'pre', label: 'Aguardando', rodada: 0 };

    const agora = new Date();
    const inicio = new Date(dadosCopa.periodo.inicio);
    const fimGrupos = new Date(dadosCopa.periodo.fimFaseGrupos || dadosCopa.periodo.inicio);

    if (agora < inicio) return { fase: 'pre', label: 'Aguardando', rodada: 0 };
    if (agora <= fimGrupos) return { fase: 'live', label: 'Ao Vivo', rodada: 0 };
    return { fase: 'done', label: 'Encerrada', rodada: 3 };
}

function renderizarClassificacao() {
    const container = document.getElementById('copa-standings-container');
    if (!container || !dadosCopa?.grupos) return;

    const gruposOrdenados = Object.entries(dadosCopa.grupos).sort((a, b) => a[0].localeCompare(b[0]));
    const jogos = dadosCopa.jogosFaseGrupos || [];
    const status = getStatusGrupos();

    // Mostrar apenas Brasil (C) e mais 2 grupos vizinhos no pre-torneio
    // Na Copa ativa, mostrar todos
    const gruposParaMostrar = status.fase === 'pre'
        ? gruposOrdenados.filter(([l]) => ['A', 'B', 'C', 'D'].includes(l))
        : gruposOrdenados;

    container.innerHTML = gruposParaMostrar.map(([letra, selecoes]) => {
        const classificacao = calcularClassificacaoGrupo(letra, selecoes, jogos);
        const isBrasil = letra === 'C';
        const temJogos = classificacao.some(t => t.j > 0);

        // Status label e dot
        const statusClass = status.fase === 'live' ? 'copa-standings-status--live'
            : status.fase === 'done' ? 'copa-standings-status--done'
            : 'copa-standings-status--pre';
        const dotClass = status.fase === 'live' ? 'copa-standings-live-dot--active' : '';

        // Rows dos times
        const rowsHtml = classificacao.map((time, idx) => {
            const isQualified = idx < 2; // Top 2 classificam direto
            const isEliminated = idx >= 3 && temJogos; // 4o nao avanca (se ja jogou)
            const rowClass = isQualified && temJogos ? 'copa-standings-row--qualified'
                : isEliminated ? 'copa-standings-row--eliminated' : '';

            // Saldo de gols colorido
            const sgClass = time.sg > 0 ? 'copa-standings-stat-value--positive'
                : time.sg < 0 ? 'copa-standings-stat-value--negative'
                : 'copa-standings-stat-value--neutral';
            const sgText = time.sg > 0 ? `+${time.sg}` : `${time.sg}`;

            // Form dots (ultimos 3 jogos)
            const formaDots = time.forma.slice(-3).map(f => {
                const dotClass = f === 'W' ? 'copa-standings-form-dot--win'
                    : f === 'D' ? 'copa-standings-form-dot--draw'
                    : 'copa-standings-form-dot--loss';
                return `<span class="copa-standings-form-dot ${dotClass}"></span>`;
            }).join('');

            return `
            <div class="copa-standings-row ${rowClass}">
                <div class="copa-standings-team">
                    <span class="copa-standings-rank">${idx + 1}</span>
                    <span class="copa-standings-flag">${time.bandeira}</span>
                    <div class="copa-standings-name-wrap">
                        <span class="copa-standings-name">${time.time}</span>
                        ${formaDots ? `<div class="copa-standings-form">${formaDots}</div>` : ''}
                    </div>
                </div>
                <div class="copa-standings-stats">
                    <div class="copa-standings-stat">
                        <span class="copa-standings-stat-value ${sgClass}">${sgText}</span>
                    </div>
                    <span class="copa-standings-pts">${time.pts}</span>
                </div>
            </div>`;
        }).join('');

        // Mensagem pre-torneio
        const preMsg = !temJogos
            ? '<div class="copa-standings-pre-msg">Classificacao sera atualizada apos inicio dos jogos</div>'
            : '';

        return `
        <div class="copa-standings-card" data-grupo="${letra}">
            <div class="copa-standings-header">
                <div class="copa-standings-header-left">
                    <span class="copa-standings-grupo-nome">Grupo ${letra}</span>
                    <span class="copa-standings-status ${statusClass}">${status.label}</span>
                </div>
                <div class="copa-standings-header-right">
                    <span class="copa-standings-live-dot ${dotClass}"></span>
                    <span class="copa-standings-matchday">Rodada ${temJogos ? Math.max(...classificacao.map(t => t.j)) : 0}/3</span>
                </div>
            </div>
            <div class="copa-standings-columns">
                <span class="copa-standings-col-label">SG</span>
                <span class="copa-standings-col-label">PTS</span>
            </div>
            ${rowsHtml}
            ${preMsg}
        </div>`;
    }).join('');

    // Se pre-torneio e mostrando subconjunto, adicionar nota
    if (status.fase === 'pre' && gruposParaMostrar.length < gruposOrdenados.length) {
        container.innerHTML += `
        <div class="copa-standings-pre-msg" style="padding:0.5rem 0;">
            ${gruposOrdenados.length - gruposParaMostrar.length} grupos restantes disponiveis apos inicio da Copa
        </div>`;
    }
}

// ═══════════════════════════════════════════════════
// TOGGLE — Jogos / Classificacao
// ═══════════════════════════════════════════════════

function setupGruposToggle() {
    const toggleContainer = document.getElementById('copa-grupos-toggle');
    if (!toggleContainer) return;

    const jogosView = document.getElementById('copa-grupos-container');
    const standingsView = document.getElementById('copa-standings-container');

    toggleContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.copa-view-toggle-btn');
        if (!btn) return;

        const view = btn.dataset.view;
        if (!view) return;

        // Atualizar botoes
        toggleContainer.querySelectorAll('.copa-view-toggle-btn').forEach(b =>
            b.classList.remove('copa-view-toggle-btn--active')
        );
        btn.classList.add('copa-view-toggle-btn--active');

        // Alternar views
        if (view === 'jogos') {
            if (jogosView) jogosView.style.display = '';
            if (standingsView) standingsView.style.display = 'none';
        } else {
            if (jogosView) jogosView.style.display = 'none';
            if (standingsView) standingsView.style.display = '';
        }
    });
}

// ═══════════════════════════════════════════════════
// FASE ELIMINATORIA (Timeline)
// ═══════════════════════════════════════════════════

function renderizarFaseEliminatoria() {
    const container = document.getElementById('copa-eliminatoria-timeline');
    if (!container || !dadosCopa?.faseEliminatoria) return;

    const fases = Object.entries(dadosCopa.faseEliminatoria);

    container.innerHTML = fases.map(([nome, info]) => {
        const isFinal = nome === 'Final';
        const datas = info.data
            ? formatarDataCurta(info.data)
            : `${formatarDataCurta(info.inicio)} A ${formatarDataCurta(info.fim)}`;
        const jogosInfo = `${info.jogos} ${info.jogos === 1 ? 'JOGO' : 'JOGOS'}`;

        return `
        <div class="copa-timeline-item ${isFinal ? 'copa-timeline-item-final' : ''}">
            <div class="copa-timeline-fase">${nome}</div>
            <div class="copa-timeline-info">${datas} &bull; ${jogosInfo}</div>
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

/**
 * Formato curto para match cards: "13 JUN"
 */
function formatarDataCurta(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-');
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    return `${parseInt(dia)} ${meses[parseInt(mes) - 1]}`;
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
