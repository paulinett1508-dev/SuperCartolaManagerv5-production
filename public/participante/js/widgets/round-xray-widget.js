/**
 * ROUND X-RAY WIDGET - "Raio-X da Rodada"
 * ========================================
 * Widget flutuante pós-rodada com análise de disputas internas
 * Aparece quando rodada encerra (consolidada + mercado aberto)
 *
 * @version 2.0.0 - Conformidade com Design System
 *   - Usa tokens de _app-tokens.css (zero variáveis próprias)
 *   - Material Icons em vez de emojis
 *   - Truncamento correto de pontos (Math.trunc)
 *   - Aria-labels e role="dialog" para acessibilidade
 *   - FAB bola estática (sem animações)
 *   - Modal com narrativa inteligente
 *   - Foco em disputas (PC, MM, Artilheiro, Luva, Capitão)
 *   - Draggable com persistência
 *   - Coordenação com WhatsHappening (nunca ambos visíveis)
 *
 * Ciclo de vida:
 * - Rodada consolida → Widget aparece
 * - Mercado fecha (nova rodada) → Widget desaparece, foguinho volta
 */

if (window.Log) Log.info("[ROUND-XRAY] Widget v2.0 carregando...");

// ============================================
// ESTADO DO WIDGET
// ============================================
const RXrayState = {
    isVisible: false,
    isModalOpen: false,
    isLoading: false,
    ligaId: null,
    timeId: null,
    rodadaConsolidada: null,
    temporada: null,
    contexto: null, // Dados da API /rodada-contexto
    fabPosition: { right: 16, bottom: 148 },
};

// ============================================
// CONSTANTES
// ============================================
const RXRAY_STORAGE_KEY = "rxray-fab-position";
const RXRAY_CACHE_KEY = "rxray-cache-v2";
const RXRAY_CACHE_DURATION = 30 * 60 * 1000; // 30 minutos
const RXRAY_SEEN_KEY = "rxray-seen-rodada";

// ============================================
// INICIALIZAÇÃO
// ============================================
export async function inicializarRaioXWidget(participante, mercadoStatus) {
    if (window.Log) Log.info("[ROUND-XRAY] Inicializando widget...");

    RXrayState.ligaId = participante.ligaId;
    RXrayState.timeId = participante.timeId;
    RXrayState.temporada = participante.temporada || new Date().getFullYear();

    // Verificar se deve exibir
    if (deveExibirWidget(mercadoStatus)) {
        RXrayState.rodadaConsolidada = mercadoStatus.rodada_atual - 1;
        await mostrarWidget();
    } else {
        esconderWidget();
    }
}

/**
 * Determina se widget deve ser exibido
 */
function deveExibirWidget(mercadoStatus) {
    if (!mercadoStatus) return false;

    // Verificar se módulo está ativo na liga
    if (!window.participanteNavigation?.verificarModuloAtivo?.('raioX')) return false;

    // Rodada consolidada (não em andamento)
    const rodadaConsolidada = mercadoStatus.rodada_atual > 0
        && !mercadoStatus.rodada_em_andamento;

    // Mercado aberto (aguardando próxima rodada)
    const mercadoAberto = mercadoStatus.status_mercado === 1; // ABERTO

    // Não está em pré-temporada
    const naoPreTemporada = mercadoStatus.temporada === RXrayState.temporada;

    return rodadaConsolidada && mercadoAberto && naoPreTemporada;
}

/**
 * Mostra o widget (FAB bola)
 */
async function mostrarWidget() {
    if (RXrayState.isVisible) return;

    if (window.Log) Log.info("[ROUND-XRAY] Mostrando widget...");

    // Criar FAB se não existe
    let fab = document.getElementById("rxrayFab");
    if (!fab) {
        fab = criarFAB();
        document.body.appendChild(fab);
    }

    // Carregar posição salva
    carregarPosicaoFAB();
    aplicarPosicaoFAB(fab);

    // Inicializar drag & drop
    inicializarDragFAB(fab);

    // Adicionar event listener
    fab.addEventListener("click", abrirModal);

    // Mostrar
    fab.style.display = "flex";
    RXrayState.isVisible = true;

    // Esconder badge se rodada já foi vista
    atualizarBadgeVisto(fab);

    if (window.Log) Log.info("[ROUND-XRAY] Widget visível");
}

/**
 * Esconde o widget
 */
function esconderWidget() {
    if (!RXrayState.isVisible) return;

    const fab = document.getElementById("rxrayFab");
    if (fab) {
        fab.style.display = "none";
    }

    RXrayState.isVisible = false;

    if (window.Log) Log.info("[ROUND-XRAY] Widget escondido");
}

/**
 * Cria elemento FAB (bola)
 */
function criarFAB() {
    const fab = document.createElement("div");
    fab.id = "rxrayFab";
    fab.className = "rxray-fab";
    fab.setAttribute("role", "button");
    fab.setAttribute("aria-label", "Abrir Raio-X da Rodada");
    fab.innerHTML = `
        <div class="rxray-fab-icon"><span class="material-icons">sports_soccer</span></div>
        <div class="rxray-fab-badge" id="rxrayBadge">${RXrayState.rodadaConsolidada || ""}</div>
    `;
    return fab;
}

// ============================================
// DRAG & DROP
// ============================================
function carregarPosicaoFAB() {
    try {
        const saved = localStorage.getItem(RXRAY_STORAGE_KEY);
        if (saved) {
            RXrayState.fabPosition = JSON.parse(saved);
        }
    } catch (e) {
        // Manter posição padrão
    }
}

function salvarPosicaoFAB() {
    try {
        localStorage.setItem(RXRAY_STORAGE_KEY, JSON.stringify(RXrayState.fabPosition));
    } catch (e) {
        // Ignorar erro
    }
}

function aplicarPosicaoFAB(fab) {
    fab.style.right = `${RXrayState.fabPosition.right}px`;
    fab.style.bottom = `${RXrayState.fabPosition.bottom}px`;
    fab.style.left = "auto";
    fab.style.top = "auto";
}

function inicializarDragFAB(fab) {
    let startX, startY, startRight, startBottom;
    let hasMoved = false;

    // Touch events (mobile)
    fab.addEventListener("touchstart", handleDragStart, { passive: true });
    fab.addEventListener("touchmove", handleDragMove, { passive: false });
    fab.addEventListener("touchend", handleDragEnd);

    // Mouse events (desktop)
    fab.addEventListener("mousedown", handleDragStart);
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);

    function handleDragStart(e) {
        if (RXrayState.isModalOpen) return; // Não arrastar se modal aberto

        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;

        const rect = fab.getBoundingClientRect();
        startRight = window.innerWidth - rect.right;
        startBottom = window.innerHeight - rect.bottom;

        hasMoved = false;
        fab.style.cursor = "grabbing";
    }

    function handleDragMove(e) {
        if (startX === undefined) return;
        if (RXrayState.isModalOpen) return;

        const touch = e.touches ? e.touches[0] : e;
        const deltaX = startX - touch.clientX;
        const deltaY = touch.clientY - startY;

        // Mínimo movimento para considerar drag (evita clicks acidentais)
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            hasMoved = true;
            e.preventDefault(); // Prevenir scroll durante drag
        }

        if (hasMoved) {
            const newRight = Math.max(0, Math.min(window.innerWidth - 56, startRight + deltaX));
            const newBottom = Math.max(0, Math.min(window.innerHeight - 56, startBottom - deltaY));

            RXrayState.fabPosition = { right: newRight, bottom: newBottom };
            aplicarPosicaoFAB(fab);
        }
    }

    function handleDragEnd(e) {
        if (startX === undefined) return;

        startX = undefined;
        startY = undefined;
        fab.style.cursor = "move";

        if (hasMoved) {
            salvarPosicaoFAB();
            // Prevenir click após drag
            e.preventDefault();
            e.stopPropagation();
        }
    }
}

// ============================================
// MODAL
// ============================================
async function abrirModal() {
    if (RXrayState.isModalOpen) return;

    if (window.Log) Log.info("[ROUND-XRAY] Abrindo modal...");

    RXrayState.isModalOpen = true;

    // Esconder FAB enquanto modal está aberto
    const fab = document.getElementById("rxrayFab");
    if (fab) fab.style.display = "none";

    // Criar modal se não existe
    let modal = document.getElementById("rxrayModal");
    if (!modal) {
        modal = criarModal();
        document.body.appendChild(modal);
    }

    // Mostrar modal
    modal.style.display = "flex";

    // Carregar dados
    await carregarContexto();

    // Renderizar
    if (RXrayState.contexto) {
        renderizarModal(RXrayState.contexto);
    }
}

function fecharModal() {
    const modal = document.getElementById("rxrayModal");
    if (modal) {
        modal.style.display = "none";
    }
    RXrayState.isModalOpen = false;

    // Mostrar FAB novamente
    const fab = document.getElementById("rxrayFab");
    if (fab) fab.style.display = "flex";

    // Marcar rodada como vista e esconder badge
    marcarRodadaComoVista();

    if (window.Log) Log.info("[ROUND-XRAY] Modal fechado");
}

/**
 * Marca rodada atual como vista no localStorage
 */
function marcarRodadaComoVista() {
    try {
        localStorage.setItem(RXRAY_SEEN_KEY, String(RXrayState.rodadaConsolidada));
    } catch (e) { /* ignore */ }

    const fab = document.getElementById("rxrayFab");
    if (fab) atualizarBadgeVisto(fab);
}

/**
 * Esconde badge se rodada já foi vista, mostra se é nova
 */
function atualizarBadgeVisto(fab) {
    const badge = fab.querySelector(".rxray-fab-badge");
    if (!badge) return;

    try {
        const rodadaVista = localStorage.getItem(RXRAY_SEEN_KEY);
        if (rodadaVista === String(RXrayState.rodadaConsolidada)) {
            badge.style.display = "none";
        } else {
            badge.style.display = "";
        }
    } catch (e) {
        badge.style.display = "";
    }
}

function criarModal() {
    const modal = document.createElement("div");
    modal.id = "rxrayModal";
    modal.className = "rxray-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Raio-X da Rodada");
    modal.innerHTML = `
        <div class="rxray-modal-overlay"></div>
        <div class="rxray-modal-content">
            <!-- Header -->
            <div class="rxray-modal-header">
                <h3><span class="material-icons">biotech</span> Raio-X da Rodada <span id="rxrayModalRodada"></span></h3>
                <div class="rxray-header-actions">
                    <button id="rxrayRefreshBtn" class="rxray-refresh-btn" title="Atualizar dados" aria-label="Atualizar dados do raio-x">
                        <span class="material-icons">refresh</span>
                    </button>
                    <button id="rxrayCloseBtn" class="rxray-close-btn" aria-label="Fechar modal raio-x">
                        <span class="material-icons">close</span>
                    </button>
                </div>
            </div>

            <!-- Loading -->
            <div id="rxrayLoading" class="rxray-loading">
                <div class="spinner"></div>
                <p>Carregando analise...</p>
            </div>

            <!-- Conteudo -->
            <div id="rxrayContent" class="rxray-content" style="display:none;">

                <!-- NARRATIVA -->
                <div class="rxray-section">
                    <div class="rxray-section-header">
                        <div class="rxray-section-icon icon-narrative">
                            <span class="material-icons">chat</span>
                        </div>
                        <h4>Resumo Inteligente</h4>
                    </div>
                    <div id="rxrayNarrativa" class="rxray-narrative-box"></div>
                </div>

                <!-- DISPUTAS -->
                <div class="rxray-section">
                    <div class="rxray-section-header">
                        <div class="rxray-section-icon icon-disputas">
                            <span class="material-icons">casino</span>
                        </div>
                        <h4>Suas Disputas</h4>
                    </div>
                    <div id="rxrayDisputas"></div>
                </div>

                <!-- PERFORMANCE -->
                <div class="rxray-section">
                    <div class="rxray-section-header">
                        <div class="rxray-section-icon icon-performance">
                            <span class="material-icons">insights</span>
                        </div>
                        <h4>Performance Geral</h4>
                    </div>
                    <div id="rxrayPerformance" class="rxray-stats-grid"></div>
                </div>

                <!-- MOVIMENTACOES -->
                <div class="rxray-section">
                    <div class="rxray-section-header">
                        <div class="rxray-section-icon icon-movimentacoes">
                            <span class="material-icons">swap_vert</span>
                        </div>
                        <h4>Mudancas no Ranking Geral</h4>
                    </div>
                    <p class="rxray-section-sub" id="rxrayMovSub"></p>
                    <div id="rxrayMovimentacoes"></div>
                </div>

                <!-- Botao analise completa -->
                <button id="rxrayVerCompleto" class="rxray-btn-primary">
                    Ver Analise Completa
                    <span class="material-icons">arrow_forward</span>
                </button>

            </div>
        </div>
    `;

    // Event listeners
    modal.querySelector(".rxray-modal-overlay").addEventListener("click", fecharModal);
    modal.querySelector("#rxrayCloseBtn").addEventListener("click", fecharModal);
    modal.querySelector("#rxrayRefreshBtn").addEventListener("click", atualizarContextoForce);
    modal.querySelector("#rxrayVerCompleto").addEventListener("click", navegarParaAnaliseCompleta);

    return modal;
}

// ============================================
// REFRESH FORÇADO
// ============================================
async function atualizarContextoForce() {
    const btn = document.getElementById("rxrayRefreshBtn");
    if (btn) {
        btn.disabled = true;
        btn.classList.add("spinning");
    }
    try {
        // Limpar cache localStorage para forçar nova busca
        try {
            localStorage.removeItem(`${RXRAY_CACHE_KEY}-${RXrayState.rodadaConsolidada}`);
        } catch (e) { /* ignore */ }

        await carregarContexto(true);

        if (RXrayState.contexto) {
            renderizarModal(RXrayState.contexto);
        }
    } finally {
        if (btn) {
            btn.classList.remove("spinning");
            btn.disabled = false;
        }
    }
}

// ============================================
// DADOS
// ============================================
async function carregarContexto(forceRefresh = false) {
    // Verificar cache primeiro (apenas quando não é refresh forçado)
    if (!forceRefresh) {
        const cached = getCachedContexto();
        if (cached) {
            RXrayState.contexto = cached;
            return;
        }
    }

    // Mostrar loading
    document.getElementById("rxrayLoading").style.display = "flex";
    document.getElementById("rxrayContent").style.display = "none";

    try {
        const url = `/api/rodada-contexto/${RXrayState.ligaId}/${RXrayState.rodadaConsolidada}/${RXrayState.timeId}?temporada=${RXrayState.temporada}`;
        const fetchOptions = forceRefresh ? { cache: 'no-store' } : {};
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }

        RXrayState.contexto = await response.json();
        cacheContexto(RXrayState.contexto);

        if (window.Log) Log.info("[ROUND-XRAY] Contexto carregado");

    } catch (error) {
        console.error("[ROUND-XRAY] Erro ao carregar contexto:", error);
        mostrarErro("Erro ao carregar dados. Tente novamente.");
    }
}

function getCachedContexto() {
    try {
        const cached = localStorage.getItem(`${RXRAY_CACHE_KEY}-${RXrayState.rodadaConsolidada}`);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < RXRAY_CACHE_DURATION) {
                if (window.Log) Log.info("[ROUND-XRAY] Usando cache");
                return data;
            }
        }
    } catch (e) {
        // Ignorar erro de cache
    }
    return null;
}

function cacheContexto(contexto) {
    try {
        localStorage.setItem(
            `${RXRAY_CACHE_KEY}-${RXrayState.rodadaConsolidada}`,
            JSON.stringify({ data: contexto, timestamp: Date.now() })
        );
    } catch (e) {
        // Ignorar erro
    }
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderizarModal(contexto) {
    document.getElementById("rxrayLoading").style.display = "none";
    document.getElementById("rxrayContent").style.display = "block";

    // Rodada no header
    document.getElementById("rxrayModalRodada").textContent = contexto.rodada;

    // 1. Narrativa (com bullet points por assunto)
    const narrativaEl = document.getElementById("rxrayNarrativa");
    if (contexto.narrativa.eventos && contexto.narrativa.eventos.length > 0) {
        const abertura = escapeHtml(contexto.narrativa.abertura || "");
        const bullets = contexto.narrativa.eventos
            .map(ev => `<li>${escapeHtml(ev)}</li>`)
            .join("");
        narrativaEl.innerHTML = `
            <p style="margin-bottom:8px;">${abertura}</p>
            <ul class="rxray-narrative-list">${bullets}</ul>
        `;
    } else {
        narrativaEl.innerHTML = `<p>${escapeHtml(contexto.narrativa.resumida)}</p>`;
    }

    // 2. Disputas
    renderizarDisputas(contexto.disputas);

    // 3. Performance
    renderizarPerformance(contexto.performance);

    // 4. Movimentações
    renderizarMovimentacoes(contexto.movimentacoes);
}

function renderizarDisputas(disputas) {
    const container = document.getElementById("rxrayDisputas");
    const disputasHTML = [];

    // Pontos Corridos
    if (disputas.pontos_corridos) {
        const pc = disputas.pontos_corridos;
        const resultadoClass = pc.seu_confronto.resultado === "vitoria" ? "vitoria" :
                               pc.seu_confronto.resultado === "derrota" ? "derrota" : "empate";
        const resultadoIcon = pc.seu_confronto.resultado === "vitoria" ? "check_circle" :
                             pc.seu_confronto.resultado === "derrota" ? "cancel" : "drag_handle";

        disputasHTML.push(`
            <div class="rxray-disputa-card mod-pc">
                <div class="rxray-disputa-header">
                    <span class="material-icons">sports_soccer</span>
                    <span class="rxray-disputa-label">Pontos Corridos</span>
                </div>
                <div class="rxray-disputa-confronto">
                    <span class="voce">Voce ${truncarPontos(pc.seu_confronto.voce||0)}</span>
                    <span class="vs">&times;</span>
                    <span class="adv">${truncarPontos(pc.seu_confronto.adversario.pontos||0)} ${escapeHtml(pc.seu_confronto.adversario.nome)}</span>
                    <span class="resultado ${resultadoClass}"><span class="material-icons">${resultadoIcon}</span></span>
                </div>
                <div class="rxray-disputa-status">
                    <span class="material-icons">leaderboard</span>
                    ${pc.minha_posicao}o lugar &bull; ${escapeHtml(pc.zona)}
                </div>
            </div>
        `);
    }

    // Mata-Mata
    if (disputas.mata_mata && disputas.mata_mata.seu_confronto) {
        const mm = disputas.mata_mata;
        const isClassificado = mm.seu_confronto.resultado === "classificado";
        disputasHTML.push(`
            <div class="rxray-disputa-card mod-mm">
                <div class="rxray-disputa-header">
                    <span class="material-icons">emoji_events</span>
                    <span class="rxray-disputa-label">Mata-Mata (${escapeHtml(mm.fase_atual)})</span>
                </div>
                <div class="rxray-disputa-status">
                    <span class="material-icons ${isClassificado ? 'status-classificado' : 'status-eliminado'}">${isClassificado ? 'check_circle' : 'cancel'}</span>
                    <span class="${isClassificado ? 'status-classificado' : 'status-eliminado'}">${isClassificado ? 'Classificado' : 'Eliminado'}</span>
                </div>
            </div>
        `);
    }

    // Artilheiro
    if (disputas.artilheiro) {
        const art = disputas.artilheiro;
        disputasHTML.push(`
            <div class="rxray-disputa-card mod-art">
                <div class="rxray-disputa-header">
                    <span class="material-icons">military_tech</span>
                    <span class="rxray-disputa-label">Artilheiro Campeao</span>
                </div>
                <div class="rxray-disputa-status">
                    <span class="material-icons">leaderboard</span>
                    ${art.sua_posicao}o lugar &bull; ${art.seus_gols || 0} gols
                </div>
            </div>
        `);
    }

    // Capitao de Luxo
    if (disputas.capitao_luxo) {
        const cap = disputas.capitao_luxo;
        disputasHTML.push(`
            <div class="rxray-disputa-card mod-cap">
                <div class="rxray-disputa-header">
                    <span class="material-icons">shield</span>
                    <span class="rxray-disputa-label">Capitao de Luxo</span>
                </div>
                <div class="rxray-disputa-status">
                    <span class="material-icons">leaderboard</span>
                    ${cap.sua_posicao}o lugar &bull; ${truncarPontos(cap.seus_pontos || 0)} pts
                </div>
            </div>
        `);
    }

    container.innerHTML = disputasHTML.length > 0
        ? disputasHTML.join("")
        : '<p class="rxray-empty">Nenhuma disputa ativa nesta rodada.</p>';
}

function renderizarPerformance(performance) {
    const container = document.getElementById("rxrayPerformance");
    const positiveClass = performance.vs_media >= 0 ? "positive" : "negative";
    const finClass = performance.financeiro >= 0 ? "positive" : "negative";
    const vsMediaTrunc = truncarPontos(performance.vs_media || 0);

    container.innerHTML = `
        <div class="rxray-stat-card stat-posicao">
            <div class="rxray-stat-icon"><span class="material-icons">emoji_events</span></div>
            <div class="rxray-stat-info">
                <div class="rxray-stat-label">Posicao</div>
                <div class="rxray-stat-value">${performance.posicao}o de ${performance.total_participantes}</div>
            </div>
        </div>
        <div class="rxray-stat-card stat-pontos">
            <div class="rxray-stat-icon"><span class="material-icons">star</span></div>
            <div class="rxray-stat-info">
                <div class="rxray-stat-label">Pontos</div>
                <div class="rxray-stat-value">${truncarPontos(performance.pontos)}</div>
            </div>
        </div>
        <div class="rxray-stat-card stat-media ${positiveClass}">
            <div class="rxray-stat-icon"><span class="material-icons">trending_up</span></div>
            <div class="rxray-stat-info">
                <div class="rxray-stat-label">vs Media</div>
                <div class="rxray-stat-value">${performance.vs_media >= 0 ? "+" : ""}${vsMediaTrunc}</div>
            </div>
        </div>
        <div class="rxray-stat-card stat-financeiro ${finClass}">
            <div class="rxray-stat-icon"><span class="material-icons">account_balance_wallet</span></div>
            <div class="rxray-stat-info">
                <div class="rxray-stat-label">Financeiro</div>
                <div class="rxray-stat-value">${performance.financeiro >= 0 ? "+" : ""}R$ ${Math.abs(performance.financeiro)}</div>
            </div>
        </div>
    `;
}

function renderizarMovimentacoes(movimentacoes) {
    const container = document.getElementById("rxrayMovimentacoes");
    const subEl = document.getElementById("rxrayMovSub");

    if (subEl) {
        subEl.textContent = `Variacoes de posicao apos a Rodada ${RXrayState.rodadaConsolidada}`;
    }

    if (!movimentacoes || movimentacoes.length === 0) {
        container.innerHTML = '<p class="rxray-empty">Sem mudancas significativas nesta rodada.</p>';
        return;
    }

    const meuTimeId = RXrayState.timeId;

    const movHTML = movimentacoes.slice(0, 5).map(mov => {
        const isMe = Number(mov.timeId) === Number(meuTimeId);
        const meClass = isMe ? " mov-item-me" : "";
        const tipoClass = mov.tipo === "subida" ? "subida" : "descida";
        const tipoIcon = mov.tipo === "subida" ? "trending_up" : "trending_down";
        const label = isMe ? "Voce" : escapeHtml(mov.time);
        return `
            <div class="rxray-mov-item${meClass}">
                <div class="rxray-mov-icon ${tipoClass}">
                    <span class="material-icons">${tipoIcon}</span>
                </div>
                <span class="rxray-mov-name">${label}</span>
                <span class="rxray-mov-positions">
                    ${mov.de}o
                    <span class="material-icons">arrow_forward</span>
                    ${mov.para}o
                </span>
            </div>`;
    }).join("");

    container.innerHTML = movHTML;
}

function mostrarErro(mensagem) {
    document.getElementById("rxrayLoading").style.display = "none";
    document.getElementById("rxrayContent").innerHTML = `
        <div class="rxray-error">
            <span class="material-icons">error_outline</span>
            <p>${escapeHtml(mensagem)}</p>
        </div>
    `;
    document.getElementById("rxrayContent").style.display = "block";
}

// ============================================
// NAVEGAÇÃO
// ============================================
function navegarParaAnaliseCompleta() {
    // Passar parâmetros para o Raio-X completo
    window.xrayParams = {
        rodada: RXrayState.rodadaConsolidada,
        temporada: RXrayState.temporada,
        focusMode: "disputas", // Flag para renderizar com foco em disputas
    };

    // Navegar
    if (window.participanteNav) {
        window.participanteNav.navegarPara("rodada-xray");
    }

    // Fechar modal
    fecharModal();
}

// ============================================
// HELPERS
// ============================================
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// API PÚBLICA
// ============================================
window.RaioXWidget = {
    show: mostrarWidget,
    hide: esconderWidget,
    shouldShow: deveExibirWidget,
};

export default { inicializarRaioXWidget };
