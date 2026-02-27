/**
 * WHATS HAPPENING WIDGET - "O que tá rolando?"
 * =============================================
 * Widget flutuante de engajamento em tempo real
 * Mostra disputas internas ativas nos módulos da liga
 *
 * @version 3.1.0 - Parciais ao vivo + Carrossel total
 *   - getPontosAoVivo() overlay em TODOS os confrontos (PC + MM)
 *   - Ranking da Rodada ao vivo via parciais (substitui ranking geral)
 *   - Artilheiro/Luva/Capitão redesenhados com top 3 em carrossel
 *   - Rank cards horizontais com destaque no participante logado
 *   - Badge AO VIVO no ranking quando parciais disponíveis
 *
 * @version 3.0.0 - Confrontos Diretos: interatividade total
 *   - Todos os confrontos PC e MM visíveis em carrossel horizontal
 *   - Insights dinâmicos por nível (inferno/hot/warm/tied/blowout)
 *   - Barra visual de proporção de pontos
 *   - Tap-to-navigate: clicar no confronto abre o módulo
 *   - Badge numérico (contagem de disputas quentes)
 *   - Mata-Mata mostra todos os confrontos da fase atual
 *
 * @version 2.1.0 - FIX: FAB LIVE state falso (bola_rolando → gameStatus real)
 *
 * Máquina de Estados do Foguinho:
 * - HIDDEN:   FAB invisível (mercado aberto, pré-temporada, sem rodada)
 * - WAITING:  Fogo dim/cinza (mercado fechou, jogos não começaram)
 * - LIVE:     Fogo vibrante máximo (jogos em andamento)
 * - INTERVAL: Fogo sutil/pulsação lenta (entre blocos de jogos)
 * - COOLING:  Fogo diminuindo (jogos acabaram, rodada não finalizada)
 * - FINISHED: Fogo apagado/estático (todos jogos encerrados)
 *
 * Módulos suportados:
 * - Pontos Corridos, Mata-Mata, Artilheiro, Luva de Ouro
 * - Capitão de Luxo, Ranking da Rodada, Resta Um
 */

if (window.Log) Log.info("[WHATS-HAPPENING] 🔥 Widget v3.1 carregando...");

// ============================================
// MÁQUINA DE ESTADOS DO FOGUINHO
// ============================================
const FAB_GAME_STATE = {
    HIDDEN:   'hidden',   // FAB não visível
    WAITING:  'waiting',  // Mercado fechou, jogos não começaram
    LIVE:     'live',     // Jogos em andamento
    INTERVAL: 'interval', // Entre blocos de jogos
    COOLING:  'cooling',  // Jogos acabaram, rodada não finalizada
    FINISHED: 'finished', // Todos jogos da rodada encerrados
};

/**
 * v2.1: Helper centralizado para verificar se jogos estão REALMENTE ao vivo
 * Usa gameStatusData.stats.aoVivo (fonte confiável) ao invés de bola_rolando
 */
function isJogosAoVivo() {
    return WHState.gameStatusData?.stats?.aoVivo > 0
        || WHState.fabState === FAB_GAME_STATE.LIVE;
}

// ============================================
// ESTADO DO WIDGET
// ============================================
const WHState = {
    isOpen: false,
    isLoading: false,
    ligaId: null,
    timeId: null,
    temporada: null,
    modulosAtivos: {},
    mercadoStatus: null,
    lastUpdate: null,
    pollingInterval: null,
    // Máquina de estados do FAB
    fabState: FAB_GAME_STATE.HIDDEN,
    fabPreviousState: null,
    gameStatusData: null,      // Dados do /api/jogos-ao-vivo/game-status
    gameStatusPollTimer: null, // Timer de polling do game-status
    data: {
        pontosCorridos: null,
        mataMata: null,
        artilheiro: null,
        luvaOuro: null,
        capitao: null,
        ranking: null,
        restaUm: null,
        parciais: null,
        meuConfrontoPc: null,
        meuConfrontoMm: null,
    },
    hasUpdates: false,
    // Drag state
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    fabPosition: { right: 16, bottom: 80 },
};

// ============================================
// DRAG & DROP - FAB SOLTO
// ============================================
const FAB_STORAGE_KEY = "wh-fab-position";

function loadFabPosition() {
    try {
        const saved = localStorage.getItem(FAB_STORAGE_KEY);
        if (saved) {
            const pos = JSON.parse(saved);
            WHState.fabPosition = pos;
        }
    } catch (e) {
        // Manter posição padrão
    }
}

function saveFabPosition() {
    try {
        localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(WHState.fabPosition));
    } catch (e) {
        // Ignorar erro de storage
    }
}

function applyFabPosition(fab) {
    fab.style.right = `${WHState.fabPosition.right}px`;
    fab.style.bottom = `${WHState.fabPosition.bottom}px`;
    // Limpar left/top se existirem
    fab.style.left = "auto";
    fab.style.top = "auto";
}

function initFabDrag(fab) {
    let startX, startY, startRight, startBottom;
    let hasMoved = false;
    let touchStartTime = 0;

    // Mostrar hint de drag na primeira vez
    showDragHintIfNeeded(fab);

    // Touch events (mobile)
    fab.addEventListener("touchstart", handleDragStart, { passive: true }); // passive para melhor performance
    fab.addEventListener("touchmove", handleDragMove, { passive: false });
    fab.addEventListener("touchend", handleDragEnd);

    // Mouse events (desktop)
    fab.addEventListener("mousedown", handleDragStart);
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);

    function handleDragStart(e) {
        if (WHState.isOpen) return; // Não arrastar se painel aberto

        WHState.isDragging = true;
        hasMoved = false;
        touchStartTime = Date.now();
        fab.classList.add("dragging");
        fab.classList.remove("show-drag-hint");

        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        startRight = WHState.fabPosition.right;
        startBottom = WHState.fabPosition.bottom;

        // NÃO chamar preventDefault aqui - permite click/tap funcionar
    }

    function handleDragMove(e) {
        if (!WHState.isDragging) return;

        const touch = e.touches ? e.touches[0] : e;
        const deltaX = startX - touch.clientX;
        const deltaY = startY - touch.clientY;

        // Considerar como "moveu" se deslocou mais de 10px (aumentado para evitar falsos positivos)
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            hasMoved = true;
            // Só prevenir scroll DEPOIS de confirmar que é drag
            if (e.type === "touchmove" && e.cancelable) {
                e.preventDefault();
            }
        }

        if (!hasMoved) return; // Não mover até confirmar drag

        // Calcular nova posição
        let newRight = startRight + deltaX;
        let newBottom = startBottom + deltaY;

        // Limites da tela
        const fabSize = 60;
        const margin = 8;
        const maxRight = window.innerWidth - fabSize - margin;
        const maxBottom = window.innerHeight - fabSize - margin;

        newRight = Math.max(margin, Math.min(maxRight, newRight));
        newBottom = Math.max(margin, Math.min(maxBottom, newBottom));

        WHState.fabPosition.right = newRight;
        WHState.fabPosition.bottom = newBottom;

        applyFabPosition(fab);
    }

    function handleDragEnd(e) {
        if (!WHState.isDragging) return;

        const wasDragging = hasMoved;
        const touchDuration = Date.now() - touchStartTime;

        WHState.isDragging = false;
        fab.classList.remove("dragging");

        if (wasDragging) {
            // Efeito visual de "soltar"
            fab.classList.add("just-dropped");
            setTimeout(() => fab.classList.remove("just-dropped"), 400);

            // Salvar posição
            saveFabPosition();
            markDragHintShown();
        } else if (e.type === "touchend" && touchDuration < 300) {
            // TAP detectado no mobile - abrir painel diretamente
            // (click event pode não disparar em alguns dispositivos)
            setTimeout(() => {
                if (!WHState.isOpen) {
                    togglePanel();
                }
            }, 10);
        }

        hasMoved = false;
    }
}

function showDragHintIfNeeded(fab) {
    const HINT_KEY = "wh-fab-drag-hint-shown";
    try {
        if (!localStorage.getItem(HINT_KEY)) {
            // Mostrar hint após 2 segundos
            setTimeout(() => {
                fab.classList.add("show-drag-hint");
                // Remover automaticamente após a animação (3s)
                setTimeout(() => {
                    fab.classList.remove("show-drag-hint");
                }, 3000);
            }, 2000);
        }
    } catch (e) {
        // Ignorar
    }
}

function markDragHintShown() {
    const HINT_KEY = "wh-fab-drag-hint-shown";
    try {
        localStorage.setItem(HINT_KEY, "1");
    } catch (e) {
        // Ignorar
    }
}

// ============================================
// CONFIGURAÇÃO
// ============================================
const WH_CONFIG = {
    POLLING_INTERVAL: 60000, // 60 segundos
    API_TIMEOUT: 5000, // Timeout padrão (aumentado de 3s para 5s)
    API_TIMEOUT_SLOW: 10000, // Timeout para APIs lentas (luva, parciais) - 10s
    MIN_DIFF_HOT: 10, // Diferença mínima para ser "disputa quente"
};

// ============================================
// MÁQUINA DE ESTADOS - TRANSIÇÕES DO FOGUINHO
// ============================================

/**
 * Determina o estado do FAB baseado no mercado + jogos ao vivo
 * Prioridade: mercado status > game status da API
 */
function calcularFabState(mercadoStatus, gameStatusData) {
    // 1. Mercado aberto → HIDDEN (FAB some)
    if (mercadoStatus?.status_mercado === 1 || mercadoStatus?.mercado_aberto) {
        return FAB_GAME_STATE.HIDDEN;
    }

    // 2. Pré-temporada → HIDDEN
    if (mercadoStatus?.temporada_encerrada || mercadoStatus?.status_mercado === 6) {
        return FAB_GAME_STATE.HIDDEN;
    }

    // 3. Rodada encerrada oficialmente (status >= 4) → FINISHED
    if (mercadoStatus?.status_mercado >= 4 && mercadoStatus?.status_mercado < 6) {
        return FAB_GAME_STATE.FINISHED;
    }

    // 4. Mercado fechado (status === 2) → consultar game-status para granularidade
    if (mercadoStatus?.status_mercado === 2 || mercadoStatus?.mercado_fechado) {
        if (!gameStatusData) {
            // v2.1 FIX: Sem dados de jogos → WAITING (seguro)
            // bola_rolando NÃO indica jogos ao vivo, apenas que parciais existem
            return FAB_GAME_STATE.WAITING;
        }

        // Usar recomendação do backend
        const state = gameStatusData.fabState;
        if (state && FAB_GAME_STATE[state.toUpperCase()]) {
            return state;
        }

        // Fallback por stats
        const stats = gameStatusData.stats;
        if (stats?.aoVivo > 0) return FAB_GAME_STATE.LIVE;
        if (stats?.agendados > 0 && stats?.encerrados > 0) return FAB_GAME_STATE.INTERVAL;
        if (stats?.agendados > 0) return FAB_GAME_STATE.WAITING;
        if (stats?.encerrados > 0) return FAB_GAME_STATE.COOLING;

        return FAB_GAME_STATE.WAITING;
    }

    // 5. Mercado reaberto (status === 3) → HIDDEN
    if (mercadoStatus?.status_mercado === 3) {
        return FAB_GAME_STATE.HIDDEN;
    }

    return FAB_GAME_STATE.HIDDEN;
}

/**
 * Aplica transição de estado no FAB com classes CSS
 */
function transicionarFabState(novoEstado) {
    const estadoAnterior = WHState.fabState;
    if (estadoAnterior === novoEstado) return;

    WHState.fabPreviousState = estadoAnterior;
    WHState.fabState = novoEstado;

    const fab = document.getElementById("wh-fab");
    if (!fab) return;

    if (window.Log) {
        Log.info(`[WHATS-HAPPENING] 🔄 FAB State: ${estadoAnterior} → ${novoEstado}`);
    }

    // Remover todas as classes de estado
    Object.values(FAB_GAME_STATE).forEach(state => {
        fab.classList.remove(`wh-fab--${state}`);
    });

    // Aplicar novo estado
    fab.classList.add(`wh-fab--${novoEstado}`);

    // Visibilidade: HIDDEN = esconder com fade
    if (novoEstado === FAB_GAME_STATE.HIDDEN) {
        fab.classList.add('wh-fab--hiding');
        setTimeout(() => {
            fab.style.display = 'none';
            fab.classList.remove('wh-fab--hiding');
        }, 400); // Tempo da animação de fade out
    } else if (estadoAnterior === FAB_GAME_STATE.HIDDEN) {
        // Reaparecendo: fade in
        fab.style.display = 'flex';
        fab.classList.add('wh-fab--appearing');
        setTimeout(() => {
            fab.classList.remove('wh-fab--appearing');
        }, 600);
    }

    // Ajustar polling baseado no estado
    ajustarPollingPorEstado(novoEstado);
}

/**
 * Ajusta frequência de polling baseado no estado do FAB
 */
function ajustarPollingPorEstado(estado) {
    // Parar polling existente de game-status
    if (WHState.gameStatusPollTimer) {
        clearInterval(WHState.gameStatusPollTimer);
        WHState.gameStatusPollTimer = null;
    }

    // Definir intervalo baseado no estado
    let intervalo;
    switch (estado) {
        case FAB_GAME_STATE.LIVE:
            intervalo = 30000;   // 30s - jogos rolando, máxima frequência
            break;
        case FAB_GAME_STATE.INTERVAL:
            intervalo = 120000;  // 2min - entre blocos de jogos
            break;
        case FAB_GAME_STATE.WAITING:
            intervalo = 300000;  // 5min - aguardando jogos
            break;
        case FAB_GAME_STATE.COOLING:
            intervalo = 180000;  // 3min - jogos acabaram
            break;
        case FAB_GAME_STATE.FINISHED:
            intervalo = 600000;  // 10min - rodada acabou, polling lento
            break;
        case FAB_GAME_STATE.HIDDEN:
        default:
            intervalo = 600000;  // 10min - verificar se mercado fechou
            break;
    }

    WHState.gameStatusPollTimer = setInterval(() => {
        syncFabGameState();
    }, intervalo);

    if (window.Log) {
        Log.info(`[WHATS-HAPPENING] ⏱️ Polling game-status: ${intervalo / 1000}s (estado: ${estado})`);
    }
}

/**
 * Busca /api/jogos-ao-vivo/game-status e atualiza o estado do FAB
 * v2.1: Timeout 5s + cache stale fallback (último dado válido < 10min)
 */
let _lastValidGameStatus = null;
let _lastValidGameStatusAt = 0;
const GAME_STATUS_STALE_TTL = 600000; // 10 minutos

async function fetchGameStatus() {
    try {
        const res = await fetchWithTimeout("/api/jogos-ao-vivo/game-status", 5000);
        if (res.ok) {
            WHState.gameStatusData = await res.json();
            // Salvar como último dado válido
            _lastValidGameStatus = WHState.gameStatusData;
            _lastValidGameStatusAt = Date.now();
            return WHState.gameStatusData;
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro ao buscar game-status:", e.name === 'AbortError' ? 'Timeout' : e.message);
    }
    // v2.1: Fallback para último dado válido (se < 10min)
    if (_lastValidGameStatus && (Date.now() - _lastValidGameStatusAt) < GAME_STATUS_STALE_TTL) {
        if (window.Log) Log.debug("[WHATS-HAPPENING] 📦 Usando game-status stale (idade: " + Math.round((Date.now() - _lastValidGameStatusAt) / 1000) + "s)");
        WHState.gameStatusData = _lastValidGameStatus;
        return _lastValidGameStatus;
    }
    return null;
}

/**
 * Sincroniza o estado do FAB com mercado + jogos ao vivo
 * Chamado periodicamente e na inicialização
 */
async function syncFabGameState() {
    // 1. Buscar mercado status
    await fetchMercadoStatus();

    // 2. Buscar game status (jogos ao vivo)
    await fetchGameStatus();

    // 3. Calcular e transicionar
    const novoEstado = calcularFabState(WHState.mercadoStatus, WHState.gameStatusData);
    transicionarFabState(novoEstado);

    // 4. Se está em estado ativo, buscar dados dos módulos
    if (novoEstado === FAB_GAME_STATE.LIVE ||
        novoEstado === FAB_GAME_STATE.INTERVAL ||
        novoEstado === FAB_GAME_STATE.COOLING) {
        await fetchAllData();
    }
}

// Helper: fetch com timeout
async function fetchWithTimeout(url, timeout = WH_CONFIG.API_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            if (window.Log) Log.warn(`[WHATS-HAPPENING] ⏱️ Timeout em ${url}`);
        }
        throw e;
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
export async function initWhatsHappeningWidget(params = {}) {
    if (window.Log) Log.info("[WHATS-HAPPENING] 🚀 Inicializando widget v2.0...", params);

    // Extrair parâmetros
    WHState.ligaId = params.ligaId || window.participanteData?.ligaId;
    WHState.timeId = params.timeId || window.participanteData?.timeId;
    WHState.temporada = params.temporada || new Date().getFullYear();
    WHState.modulosAtivos = params.modulosAtivos || {};

    if (!WHState.ligaId) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ ligaId não definido, widget não será renderizado");
        return;
    }

    // 1) Criar FAB (inicialmente HIDDEN até determinar estado)
    createWidgetElements();
    const fab = document.getElementById("wh-fab");
    if (fab) fab.style.display = 'none'; // Esconder até saber o estado

    // 2) Sincronizar estado: mercado + jogos ao vivo
    //    Isso determina se o FAB aparece ou não
    await syncFabGameState();

    // 3) Se estado é ativo, buscar dados dos módulos em background
    const estadoAtivo = [
        FAB_GAME_STATE.LIVE,
        FAB_GAME_STATE.INTERVAL,
        FAB_GAME_STATE.WAITING,
        FAB_GAME_STATE.COOLING,
        FAB_GAME_STATE.FINISHED
    ].includes(WHState.fabState);

    if (estadoAtivo) {
        fetchAllData().then(() => {
            // 4) Iniciar polling de dados dos módulos se LIVE
            if (WHState.fabState === FAB_GAME_STATE.LIVE) {
                startPolling();
            }
            if (window.Log) Log.info("[WHATS-HAPPENING] ✅ Widget v3.1 inicializado", { fabState: WHState.fabState });
        });
    } else {
        if (window.Log) Log.info("[WHATS-HAPPENING] ℹ️ FAB oculto - estado:", WHState.fabState);
    }
}

// ============================================
// CRIAR ELEMENTOS DO DOM
// ============================================
function createWidgetElements() {
    // Remover elementos existentes (se houver)
    const existingFab = document.getElementById("wh-fab");
    const existingPanel = document.getElementById("wh-panel");
    const existingBackdrop = document.getElementById("wh-backdrop");

    if (existingFab) existingFab.remove();
    if (existingPanel) existingPanel.remove();
    if (existingBackdrop) existingBackdrop.remove();

    // Carregar posição salva
    loadFabPosition();

    // Criar FAB
    const fab = document.createElement("button");
    fab.id = "wh-fab";
    fab.className = "wh-fab";
    fab.innerHTML = `
        <span class="material-icons wh-fab-icon">local_fire_department</span>
    `;

    // Aplicar posição salva
    applyFabPosition(fab);

    // Click handler que ignora se estava arrastando
    fab.addEventListener("click", (e) => {
        if (WHState.isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        togglePanel();
    });

    document.body.appendChild(fab);

    // Inicializar drag
    initFabDrag(fab);

    // Criar Backdrop
    const backdrop = document.createElement("div");
    backdrop.id = "wh-backdrop";
    backdrop.className = "wh-backdrop";
    backdrop.addEventListener("click", closePanel);
    document.body.appendChild(backdrop);

    // Criar Panel
    const panel = document.createElement("div");
    panel.id = "wh-panel";
    panel.className = "wh-panel";
    panel.innerHTML = `
        <div class="wh-handle"></div>
        <div class="wh-header">
            <div class="wh-title">
                <span class="material-icons wh-title-icon">local_fire_department</span>
                O que tá rolando?
            </div>
            <button class="wh-close-btn" id="wh-close-btn">
                <span class="material-icons">close</span>
            </button>
        </div>
        <div class="wh-content" id="wh-content">
            <div class="wh-loading">
                <div class="wh-loading-spinner"></div>
                <div class="wh-loading-text">Buscando disputas...</div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // Event listener para fechar
    document.getElementById("wh-close-btn").addEventListener("click", closePanel);

    // Swipe down para fechar
    setupSwipeToClose(panel);
}

// ============================================
// TOGGLE / OPEN / CLOSE
// ============================================
function togglePanel() {
    if (WHState.isOpen) {
        closePanel();
    } else {
        openPanel();
    }
}

function openPanel() {
    WHState.isOpen = true;
    document.getElementById("wh-fab").classList.add("open");
    document.getElementById("wh-panel").classList.add("open");
    document.getElementById("wh-backdrop").classList.add("visible");

    // Remover badge de novidades
    WHState.hasUpdates = false;
    updateFabBadge();

    // Renderizar conteúdo
    renderContent();
}

function closePanel() {
    WHState.isOpen = false;
    closeCardModal(); // v6.0: fechar modal se aberto
    document.getElementById("wh-fab").classList.remove("open");
    document.getElementById("wh-panel").classList.remove("open");
    document.getElementById("wh-backdrop").classList.remove("visible");
}

// ============================================
// SWIPE TO CLOSE
// ============================================
function setupSwipeToClose(panel) {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    panel.addEventListener("touchstart", (e) => {
        if (e.target.closest(".wh-content")) return; // Não interferir no scroll
        startY = e.touches[0].clientY;
        isDragging = true;
    });

    panel.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0) {
            panel.style.transform = `translateY(${diff}px)`;
        }
    });

    panel.addEventListener("touchend", () => {
        if (!isDragging) return;
        isDragging = false;

        const diff = currentY - startY;
        if (diff > 100) {
            closePanel();
        }

        panel.style.transform = "";
    });
}

// ============================================
// BUSCAR DADOS
// ============================================
async function fetchMercadoStatus() {
    try {
        // Usar proxy interno para evitar CORS (timeout 2s)
        const res = await fetchWithTimeout("/api/cartola/mercado-status", 2000);
        if (res.ok) {
            WHState.mercadoStatus = await res.json();
        }
    } catch (e) {
        // Fallback: tentar cache do window se disponível
        if (window.mercadoStatusCache) {
            WHState.mercadoStatus = window.mercadoStatusCache;
        }
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Usando cache de mercado status");
    }
}

async function fetchAllData() {
    WHState.isLoading = true;

    const promises = [];

    // Pontos Corridos
    if (WHState.modulosAtivos.pontosCorridos) {
        promises.push(fetchPontosCorridos());
    }

    // Mata-Mata
    if (WHState.modulosAtivos.mataMata) {
        promises.push(fetchMataMata());
    }

    // Artilheiro
    if (WHState.modulosAtivos.artilheiro) {
        promises.push(fetchArtilheiro());
    }

    // Luva de Ouro
    if (WHState.modulosAtivos.luvaOuro) {
        promises.push(fetchLuvaOuro());
    }

    // Capitão de Luxo
    if (WHState.modulosAtivos.capitaoLuxo) {
        promises.push(fetchCapitao());
    }

    // Resta Um
    if (WHState.modulosAtivos.restaUm) {
        promises.push(fetchRestaUm());
    }

    // Ranking da Rodada (sempre ativo)
    promises.push(fetchRanking());

    // Parciais (para confrontos em tempo real) - v2.1: usa game-status ao invés de bola_rolando
    if (isJogosAoVivo()) {
        promises.push(fetchParciais());
    }

    await Promise.allSettled(promises);

    WHState.isLoading = false;
    WHState.lastUpdate = new Date();

    // Se painel está aberto, atualizar conteúdo
    if (WHState.isOpen) {
        renderContent();
    }

    // Verificar se há novidades
    checkForUpdates();
}

async function fetchPontosCorridos() {
    try {
        const rodadaAtual = WHState.mercadoStatus?.rodada_atual || 1;
        // API pontos-corridos é lenta (~6s), usar timeout maior
        const res = await fetchWithTimeout(
            `/api/pontos-corridos/${WHState.ligaId}?temporada=${WHState.temporada}`,
            WH_CONFIG.API_TIMEOUT_SLOW // 10s
        );
        if (res.ok) {
            const data = await res.json();
            // Encontrar rodada: tentar match exato, senão pegar a mais recente
            const rodadaData = data.find((r) => r.rodada === rodadaAtual)
                || (Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null);
            WHState.data.pontosCorridos = rodadaData;

            // Encontrar MEU confronto nesta rodada
            if (rodadaData?.confrontos) {
                const meuConfronto = rodadaData.confrontos.find((c) => {
                    const id1 = String(c.time1?.id);
                    const id2 = String(c.time2?.id);
                    const meuId = String(WHState.timeId);
                    return id1 === meuId || id2 === meuId;
                });

                if (meuConfronto) {
                    // Normalizar para sempre ter "eu" como time1
                    const sou1 = String(meuConfronto.time1?.id) === String(WHState.timeId);
                    WHState.data.meuConfrontoPc = {
                        rodada: rodadaData.rodada || rodadaAtual,
                        eu: sou1 ? meuConfronto.time1 : meuConfronto.time2,
                        adversario: sou1 ? meuConfronto.time2 : meuConfronto.time1,
                        meusPontos: sou1 ? meuConfronto.time1?.pontos : meuConfronto.time2?.pontos,
                        pontosAdv: sou1 ? meuConfronto.time2?.pontos : meuConfronto.time1?.pontos,
                        tipo: meuConfronto.tipo,
                        raw: meuConfronto
                    };
                    if (window.Log) Log.info("[WHATS-HAPPENING] Meu confronto PC encontrado:", WHState.data.meuConfrontoPc);
                }
            }
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Pontos Corridos:", e);
    }
}

async function fetchParciais() {
    try {
        // Parciais é lento (~4s), usar timeout maior
        const res = await fetchWithTimeout(`/api/matchday/parciais/${WHState.ligaId}`, WH_CONFIG.API_TIMEOUT_SLOW);
        if (res.ok) {
            const data = await res.json();
            WHState.data.parciais = data;
            if (window.Log) Log.info("[WHATS-HAPPENING] Parciais:", data.ranking?.length, "times");
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Parciais:", e.name === 'AbortError' ? 'Timeout' : e);
    }
}

async function fetchMataMata() {
    try {
        // Primeiro buscar edições disponíveis
        const edicoesRes = await fetchWithTimeout(
            `/api/mata-mata/cache/${WHState.ligaId}/edicoes?temporada=${WHState.temporada}`
        );

        if (!edicoesRes.ok) return;

        const edicoesData = await edicoesRes.json();
        if (!edicoesData.edicoes || edicoesData.edicoes.length === 0) return;

        // Pegar a última edição (mais recente)
        const ultimaEdicao = edicoesData.edicoes[edicoesData.edicoes.length - 1];

        // Buscar dados da edição
        const res = await fetchWithTimeout(
            `/api/mata-mata/cache/${WHState.ligaId}/${ultimaEdicao.edicao}?temporada=${WHState.temporada}`
        );

        if (res.ok) {
            const data = await res.json();
            WHState.data.mataMata = {
                edicao: ultimaEdicao.edicao,
                confrontos: data.confrontos || [],
                faseAtual: data.fase_atual || "quartas",
                dados: data.dados
            };

            // Encontrar MEU confronto no Mata-Mata
            const meuId = String(WHState.timeId);
            const fases = ["primeira", "oitavas", "quartas", "semis", "final"]; // ✅ FIX: "semi" → "semis"

            for (const fase of fases) {
                const confrontosFase = data.dados?.[fase];
                if (!confrontosFase || !Array.isArray(confrontosFase)) continue;

                const meuConfronto = confrontosFase.find((c) => {
                    const idA = String(c.timeA?.timeId || c.timeA?.time_id);
                    const idB = String(c.timeB?.timeId || c.timeB?.time_id);
                    return idA === meuId || idB === meuId;
                });

                if (meuConfronto) {
                    const souA = String(meuConfronto.timeA?.timeId || meuConfronto.timeA?.time_id) === meuId;
                    WHState.data.meuConfrontoMm = {
                        fase,
                        edicao: ultimaEdicao.edicao,
                        jogo: meuConfronto.jogo,
                        eu: souA ? meuConfronto.timeA : meuConfronto.timeB,
                        adversario: souA ? meuConfronto.timeB : meuConfronto.timeA,
                        raw: meuConfronto
                    };
                    if (window.Log) Log.info("[WHATS-HAPPENING] Meu confronto MM encontrado:", WHState.data.meuConfrontoMm);
                    break;
                }
            }
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Mata-Mata:", e);
    }
}

async function fetchArtilheiro() {
    try {
        const res = await fetchWithTimeout(
            `/api/artilheiro-campeao/${WHState.ligaId}/ranking?temporada=${WHState.temporada}`
        );
        if (res.ok) {
            const data = await res.json();
            // API retorna: { success, data: { ranking: [...] } }
            const ranking = data?.data?.ranking || data?.ranking || [];
            WHState.data.artilheiro = { ranking };
            if (window.Log) Log.info("[WHATS-HAPPENING] Artilheiro:", ranking.length, "participantes");
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Artilheiro:", e.name === 'AbortError' ? 'Timeout' : e);
    }
}

async function fetchLuvaOuro() {
    try {
        // API luva-de-ouro é MUITO lenta (~8s), usar timeout curto e aceitar falha
        const res = await fetchWithTimeout(
            `/api/luva-de-ouro/${WHState.ligaId}/ranking?temporada=${WHState.temporada}`,
            WH_CONFIG.API_TIMEOUT_SLOW
        );
        if (res.ok) {
            const data = await res.json();
            // API retorna: { success, data: { ranking: [...] } }
            const ranking = data?.data?.ranking || data?.ranking || [];
            WHState.data.luvaOuro = { ranking };
            if (window.Log) Log.info("[WHATS-HAPPENING] Luva de Ouro:", ranking.length, "participantes");
        }
    } catch (e) {
        // Luva de Ouro é lenta, timeout é esperado
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Luva de Ouro:", e.name === 'AbortError' ? 'Timeout (API lenta)' : e);
    }
}

async function fetchCapitao() {
    try {
        const res = await fetchWithTimeout(
            `/api/capitao/${WHState.ligaId}/ranking?temporada=${WHState.temporada}`
        );
        if (res.ok) {
            const data = await res.json();
            // API retorna: { success, ranking: [...] }
            const ranking = data?.ranking || data?.data?.ranking || [];
            WHState.data.capitao = { ranking };
            if (window.Log) Log.info("[WHATS-HAPPENING] Capitão:", ranking.length, "participantes");
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Capitão:", e.name === 'AbortError' ? 'Timeout' : e);
    }
}

async function fetchRestaUm() {
    try {
        const res = await fetchWithTimeout(
            `/api/resta-um/${WHState.ligaId}/parciais`
        );
        if (res.ok) {
            const data = await res.json();
            const participantes = data?.participantes || [];
            const vivos = participantes.filter(p => p.status === 'vivo' && !p.zonaRisco);
            const zonaRisco = participantes.filter(p => p.status === 'vivo' && p.zonaRisco);
            const eliminados = participantes.filter(p => p.status === 'eliminado');
            WHState.data.restaUm = {
                edicao: data.edicao,
                vivos,
                zonaRisco,
                eliminados,
                totalParticipantes: participantes.length,
                rodadaAtual: data.rodadaAtual,
                isLive: data.isLive || false,
                parcial: data.parcial || false,
            };
            if (window.Log) Log.info("[WHATS-HAPPENING] Resta Um:", vivos.length, "vivos,", zonaRisco.length, "em risco,", eliminados.length, "eliminados");
        }
    } catch (e) {
        // 404 = nenhuma edição ativa (normal)
        if (window.Log && e.name !== 'AbortError') Log.debug("[WHATS-HAPPENING] Resta Um: sem edição ativa ou erro:", e.message);
    }
}

async function fetchRanking() {
    try {
        const rodada = WHState.mercadoStatus?.rodada_atual || 1;
        let isRankingGeral = false;

        // Tentar ranking da rodada específica primeiro
        let res = await fetchWithTimeout(
            `/api/ligas/${WHState.ligaId}/ranking/${rodada}?temporada=${WHState.temporada}`
        );

        // Se 404 (rodada não consolidada), usar ranking geral
        if (res.status === 404) {
            if (window.Log) Log.info(`[WHATS-HAPPENING] 📊 Rodada ${rodada} não consolidada, usando ranking geral`);
            res = await fetchWithTimeout(
                `/api/ligas/${WHState.ligaId}/ranking?temporada=${WHState.temporada}`
            );
            isRankingGeral = true;
        }

        if (res.ok) {
            const data = await res.json();
            // Normalizar formato (API geral retorna array direto)
            const ranking = Array.isArray(data) ? data : (data.ranking || data.data || []);
            WHState.data.ranking = { ranking, isRankingGeral, rodada };
            if (window.Log) Log.info("[WHATS-HAPPENING] 📊 Ranking:", ranking.length, "participantes", isRankingGeral ? "(geral)" : `(rodada ${rodada})`);
        }
    } catch (e) {
        if (window.Log) Log.warn("[WHATS-HAPPENING] ⚠️ Erro Ranking:", e.name === 'AbortError' ? 'Timeout' : e);
    }
}

// ============================================
// POLLING (ATUALIZAÇÃO AUTOMÁTICA DE DADOS)
// ============================================
function startPolling() {
    if (WHState.pollingInterval) return;

    if (window.Log) Log.info("[WHATS-HAPPENING] 🔄 Iniciando polling de dados (60s)...");

    WHState.pollingInterval = setInterval(async () => {
        // Verificar estado do FAB - só faz polling de dados se LIVE
        if (WHState.fabState !== FAB_GAME_STATE.LIVE) {
            stopPolling();
            return;
        }

        await fetchAllData();
    }, WH_CONFIG.POLLING_INTERVAL);
}

function stopPolling() {
    if (WHState.pollingInterval) {
        clearInterval(WHState.pollingInterval);
        WHState.pollingInterval = null;
        if (window.Log) Log.info("[WHATS-HAPPENING] ⏹️ Polling de dados parado");
    }
}

// ============================================
// VERIFICAR NOVIDADES
// ============================================
function checkForUpdates() {
    // Contar disputas "quentes" para badge numérico
    const hotCount = countHotDisputes();

    if (hotCount > 0 && !WHState.isOpen) {
        WHState.hasUpdates = true;
        WHState.hotCount = hotCount;
        updateFabBadge();
    }
}

/**
 * Conta total de disputas quentes para badge numérico
 */
function countHotDisputes() {
    let count = 0;

    // Pontos Corridos: confrontos com < MIN_DIFF_HOT
    const pcData = WHState.data.pontosCorridos;
    if (pcData?.confrontos) {
        count += pcData.confrontos.filter(c => {
            const diff = Math.abs((c.time1?.pontos || 0) - (c.time2?.pontos || 0));
            return diff < WH_CONFIG.MIN_DIFF_HOT;
        }).length;
    }

    // Mata-Mata: confrontos da fase atual com < 15pts
    const mmData = WHState.data.mataMata;
    if (mmData?.dados) {
        const faseAtual = mmData.faseAtual || 'quartas';
        const confrontosFase = mmData.dados[faseAtual];
        if (Array.isArray(confrontosFase)) {
            count += confrontosFase.filter(c => {
                const diff = Math.abs((c.timeA?.pontos || 0) - (c.timeB?.pontos || 0));
                return diff < 15 && !c.vencedor;
            }).length;
        }
    }

    // Artilheiro: top 2 com <= 1 gol de diferença
    if (hasHotArtilheiro()) count++;

    return count;
}

function hasHotPontosCorridos() {
    const data = WHState.data.pontosCorridos;
    if (!data?.confrontos) return false;

    return data.confrontos.some((c) => {
        const diff = Math.abs((c.time1?.pontos || 0) - (c.time2?.pontos || 0));
        return diff < WH_CONFIG.MIN_DIFF_HOT;
    });
}

function hasHotMataMata() {
    const data = WHState.data.mataMata;
    if (!data?.confrontos) return false;

    return data.confrontos.some((c) => {
        const diff = Math.abs((c.timeA?.pontos || 0) - (c.timeB?.pontos || 0));
        return diff < WH_CONFIG.MIN_DIFF_HOT;
    });
}

function hasHotArtilheiro() {
    const data = WHState.data.artilheiro;
    if (!data?.ranking || data.ranking.length < 2) return false;

    const diff = (data.ranking[0]?.gols || 0) - (data.ranking[1]?.gols || 0);
    return diff <= 1;
}

function updateFabBadge() {
    const fab = document.getElementById("wh-fab");
    if (!fab) return;

    // Remover badge existente
    const existingBadge = fab.querySelector(".wh-fab-badge");
    if (existingBadge) existingBadge.remove();

    // Adicionar classe de pulsação e badge numérico se há updates
    if (WHState.hasUpdates) {
        fab.classList.add("has-updates");
        const badge = document.createElement("span");
        badge.className = "wh-fab-badge";
        badge.textContent = WHState.hotCount > 0 ? String(WHState.hotCount) : "!";
        fab.appendChild(badge);
    } else {
        fab.classList.remove("has-updates");
    }
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderContent() {
    const content = document.getElementById("wh-content");
    if (!content) return;

    if (WHState.isLoading) {
        content.innerHTML = `
            <div class="wh-loading">
                <div class="wh-loading-spinner"></div>
                <div class="wh-loading-text">Buscando disputas...</div>
            </div>
        `;
        return;
    }

    const cards = [];

    // ========== GRID CARDS ==========
    // Pontos Corridos (meu confronto + outros confrontos no modal)
    if (WHState.modulosAtivos.pontosCorridos) {
        const pcCard = renderCardPontosCorridos();
        if (pcCard) cards.push(pcCard);
    }

    // Ranking da Rodada
    const rankCard = renderCardRanking();
    if (rankCard) cards.push(rankCard);

    // Mata-Mata (meu confronto + outros no modal)
    if (WHState.modulosAtivos.mataMata) {
        const mmCard = renderCardMataMataUnified();
        if (mmCard) cards.push(mmCard);
    }

    if (WHState.modulosAtivos.artilheiro) {
        const artCard = renderCardModulo('artilheiro');
        if (artCard) cards.push(artCard);
    }

    if (WHState.modulosAtivos.luvaOuro) {
        const luvaCard = renderCardModulo('luva-ouro');
        if (luvaCard) cards.push(luvaCard);
    }

    if (WHState.modulosAtivos.capitaoLuxo) {
        const capCard = renderCardModulo('capitao');
        if (capCard) cards.push(capCard);
    }

    if (WHState.modulosAtivos.restaUm) {
        const ruCard = renderCardRestaUm();
        if (ruCard) cards.push(ruCard);
    }

    if (cards.length === 0) {
        content.innerHTML = `
            <div class="wh-empty">
                <span class="material-icons wh-empty-icon">sports_soccer</span>
                <div class="wh-empty-title">Nenhuma disputa ativa</div>
                <div class="wh-empty-desc">Aguardando inicio da rodada</div>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        ${renderTimestamp()}
        <div class="wh-card-grid">
            ${cards.join("")}
        </div>
    `;

    // Event delegation: tap em card → abrir modal
    content.querySelectorAll('.wh-card[data-modal]').forEach(card => {
        card.addEventListener('click', () => {
            const modalType = card.dataset.modal;
            if (modalType) openCardModal(modalType);
        });
    });
}

function renderTimestamp() {
    const now = WHState.lastUpdate || new Date();
    const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const isLive = isJogosAoVivo();
    const rodada = WHState.mercadoStatus?.rodada_atual || '?';

    return `
        <div class="wh-timestamp">
            ${isLive
                ? `<span class="wh-live-indicator"><span class="wh-live-dot"></span> AO VIVO</span> <span class="wh-timestamp-time">Rodada ${rodada} · ${time}</span>`
                : `<span class="material-icons">schedule</span> Rodada ${rodada} · ${time}`
            }
        </div>
    `;
}

// ============================================
// v6.0 CARD RENDERERS — Summary cards no grid
// ============================================

/** Truncar pontos helper (1 casa decimal) */
function _tp(val) {
    return (Math.trunc((val || 0) * 10) / 10).toFixed(1);
}

/** Helper: resolve nome do participante (cartoleiro) e nome do time */
function _nomes(item) {
    const participante = item.nome_cartola || item.nomeCartola || item.nome_cartoleiro || item.nomeCartoleiro || item.participanteNome || '';
    const time = item.nome_time || item.nomeTime || item.nome || item.slug || '';
    return { participante, time };
}

/** Card: Pontos Corridos (meu confronto + todos confrontos no modal) */
function renderCardPontosCorridos() {
    const data = WHState.data.pontosCorridos;
    const confronto = WHState.data.meuConfrontoPc;
    // Precisa de pelo menos confrontos OU meu confronto
    if (!data?.confrontos && !confronto) return null;

    const isLive = isJogosAoVivo();
    const totalConfrontos = data?.confrontos?.length || 0;

    // Se tenho meu confronto, mostrar score vs adversario
    if (confronto) {
        const { eu, adversario } = confronto;
        const parciais = WHState.data.parciais?.ranking || [];
        const minhaParcial = parciais.find(p => String(p.timeId) === String(WHState.timeId));
        const advParcial = parciais.find(p => String(p.timeId) === String(adversario?.id));

        const meusPontos = minhaParcial?.pontos_rodada_atual || eu?.pontos || 0;
        const pontosAdv = advParcial?.pontos_rodada_atual || adversario?.pontos || 0;
        const vencendo = meusPontos > pontosAdv;
        const perdendo = meusPontos < pontosAdv;
        const statusClass = vencendo ? 'winning' : perdendo ? 'losing' : 'tied';

        const advNomes = _nomes(adversario || {});
        const advDisplay = advNomes.participante
            ? `${escapeHtml(advNomes.participante)} · ${escapeHtml(advNomes.time)}`
            : escapeHtml(advNomes.time || 'Adversario');

        return `
            <div class="wh-card wh-card--pontos-corridos wh-card--hero ${statusClass}" data-modal="pontos-corridos">
                <div class="wh-card-header">
                    <div class="wh-card-icon">
                        <span class="material-icons">swap_horiz</span>
                    </div>
                    <span class="wh-card-title">Pontos Corridos</span>
                    ${isLive ? '<span class="wh-card-badge wh-card-badge--live"><span class="material-icons" style="font-size:8px">sensors</span> LIVE</span>' : ''}
                </div>
                <div class="wh-card-metric">${_tp(meusPontos)} <span style="font-size:var(--app-font-xs);color:var(--app-text-dim)">x</span> ${_tp(pontosAdv)}</div>
                <div class="wh-card-subtitle" style="font-size:9px;line-height:1.2">vs ${advDisplay}</div>
            </div>
        `;
    }

    // Sem meu confronto: mostrar qtde de confrontos
    return `
        <div class="wh-card wh-card--pontos-corridos" data-modal="pontos-corridos">
            <div class="wh-card-header">
                <div class="wh-card-icon">
                    <span class="material-icons">swap_horiz</span>
                </div>
                <span class="wh-card-title">Pontos Corridos</span>
                ${isLive ? '<span class="wh-card-badge wh-card-badge--live"><span class="material-icons" style="font-size:8px">sensors</span> LIVE</span>' : ''}
            </div>
            <div class="wh-card-metric">${totalConfrontos} <span style="font-size:var(--app-font-xs);color:var(--app-text-muted)">jogos</span></div>
            <div class="wh-card-subtitle">Confrontos da rodada</div>
        </div>
    `;
}

/** Card: Ranking da Rodada (com nome participante + time) */
function renderCardRanking() {
    const parciais = WHState.data.parciais?.ranking || [];
    const isLive = isJogosAoVivo() && parciais.length > 0;

    let ranking;
    if (isLive) {
        ranking = [...parciais]
            .map(p => ({
                timeId: String(p.timeId || p.time_id),
                nome_time: p.nome_time || p.nomeTime || p.slug || 'Time',
                nome_cartola: p.nome_cartola || p.nomeCartola || p.nome_cartoleiro || '',
                pontos: p.pontos_rodada_atual ?? p.pontos ?? 0,
            }))
            .sort((a, b) => b.pontos - a.pontos);
    } else {
        const data = WHState.data.ranking;
        if (!data?.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) return null;
        ranking = data.ranking.map(r => ({
            timeId: String(r.timeId),
            nome_time: r.nome_time || r.nomeTime,
            nome_cartola: r.nome_cartola || r.nomeCartola || r.nome_cartoleiro || '',
            pontos: r.pontos_totais || r.pontos || 0,
        }));
    }

    if (ranking.length === 0) return null;

    const meuId = String(WHState.timeId);
    const minhaPosicao = ranking.findIndex(r => r.timeId === meuId);
    const meuDado = minhaPosicao >= 0 ? ranking[minhaPosicao] : null;
    const pos = minhaPosicao >= 0 ? minhaPosicao + 1 : '?';
    const meuPontos = meuDado ? _tp(meuDado.pontos) : '--';

    return `
        <div class="wh-card wh-card--ranking" data-modal="ranking">
            <div class="wh-card-header">
                <div class="wh-card-icon">
                    <span class="material-icons">leaderboard</span>
                </div>
                <span class="wh-card-title">Ranking</span>
                ${isLive ? '<span class="wh-card-badge wh-card-badge--live"><span class="material-icons" style="font-size:8px">sensors</span> LIVE</span>' : ''}
            </div>
            <div class="wh-card-metric">#${pos} <span style="font-size:var(--app-font-xs);color:var(--app-text-muted)">de ${ranking.length}</span></div>
            <div class="wh-card-subtitle" style="font-size:9px;line-height:1.2">Voce · ${meuPontos} pts</div>
        </div>
    `;
}

/** Card: Mata-Mata (meu confronto + todos confrontos no modal) */
function renderCardMataMataUnified() {
    const data = WHState.data.mataMata;
    if (!data?.dados) return null;

    const fases = ["final", "semis", "quartas", "oitavas", "primeira"];
    let faseAtual = data.faseAtual || null;
    let confrontosFase = [];

    if (!faseAtual) {
        for (const fase of fases) {
            const cf = data.dados[fase];
            if (Array.isArray(cf) && cf.length > 0 && cf.some(c => !c.vencedor)) {
                faseAtual = fase;
                confrontosFase = cf;
                break;
            }
        }
    } else {
        confrontosFase = data.dados[faseAtual] || [];
    }

    if (!faseAtual || confrontosFase.length === 0) {
        for (const fase of fases) {
            const cf = data.dados[fase];
            if (Array.isArray(cf) && cf.length > 0) {
                faseAtual = fase;
                confrontosFase = cf;
                break;
            }
        }
    }

    if (confrontosFase.length === 0) return null;

    const faseLabel = { primeira: "1a Fase", oitavas: "Oitavas", quartas: "Quartas", semis: "Semi", final: "FINAL" }[faseAtual] || faseAtual;
    const isLive = isJogosAoVivo();
    const confrontoMm = WHState.data.meuConfrontoMm;

    // Se tenho meu confronto MM, mostrar score vs adversario
    if (confrontoMm) {
        const { eu, adversario } = confrontoMm;
        const parciais = WHState.data.parciais?.ranking || [];
        const minhaParcial = parciais.find(p => String(p.timeId) === String(WHState.timeId));
        const advId = adversario?.timeId || adversario?.time_id;
        const advParcial = parciais.find(p => String(p.timeId) === String(advId));

        const meusPontos = minhaParcial?.pontos_rodada_atual || eu?.pontos || 0;
        const pontosAdv = advParcial?.pontos_rodada_atual || adversario?.pontos || 0;
        const vencendo = meusPontos > pontosAdv;
        const perdendo = meusPontos < pontosAdv;
        const statusClass = vencendo ? 'winning' : perdendo ? 'losing' : 'tied';

        const advNomes = _nomes(adversario || {});
        const advDisplay = advNomes.participante
            ? `${escapeHtml(advNomes.participante)} · ${escapeHtml(advNomes.time)}`
            : escapeHtml(advNomes.time || 'Adversario');

        return `
            <div class="wh-card wh-card--mata-mata wh-card--hero ${statusClass}" data-modal="mata-mata">
                <div class="wh-card-header">
                    <div class="wh-card-icon">
                        <span class="material-icons">emoji_events</span>
                    </div>
                    <span class="wh-card-title">MM · ${faseLabel}</span>
                    ${isLive ? '<span class="wh-card-badge wh-card-badge--live"><span class="material-icons" style="font-size:8px">sensors</span> LIVE</span>' : ''}
                </div>
                <div class="wh-card-metric">${_tp(meusPontos)} <span style="font-size:var(--app-font-xs);color:var(--app-text-dim)">x</span> ${_tp(pontosAdv)}</div>
                <div class="wh-card-subtitle" style="font-size:9px;line-height:1.2">vs ${advDisplay}</div>
            </div>
        `;
    }

    // Sem meu confronto: participante ja foi eliminado ou nao participa
    const meuId = String(WHState.timeId);
    // Verificar se o participante foi eliminado em alguma fase anterior
    let foiEliminado = false;
    for (const fase of fases) {
        const cf = data.dados[fase];
        if (Array.isArray(cf)) {
            for (const c of cf) {
                const idA = String(c.timeA?.timeId || c.timeA?.time_id || '');
                const idB = String(c.timeB?.timeId || c.timeB?.time_id || '');
                if ((idA === meuId || idB === meuId) && c.vencedor && String(c.vencedor) !== meuId) {
                    foiEliminado = true;
                    break;
                }
            }
        }
        if (foiEliminado) break;
    }

    return `
        <div class="wh-card wh-card--mata-mata" data-modal="mata-mata">
            <div class="wh-card-header">
                <div class="wh-card-icon">
                    <span class="material-icons">emoji_events</span>
                </div>
                <span class="wh-card-title">Mata-Mata</span>
                ${isLive ? '<span class="wh-card-badge wh-card-badge--live"><span class="material-icons" style="font-size:8px">sensors</span> LIVE</span>' : ''}
            </div>
            <div class="wh-card-metric">${faseLabel}</div>
            <div class="wh-card-subtitle" style="font-size:9px;line-height:1.2">${foiEliminado ? '<span style="color:var(--app-danger)">Voce foi eliminado</span>' : `${confrontosFase.length} confronto${confrontosFase.length > 1 ? 's' : ''}`}</div>
        </div>
    `;
}

/** Card: Modulo generico (Artilheiro, Luva, Capitao) — com nome participante + time */
function renderCardModulo(tipo) {
    const config = {
        artilheiro: {
            data: WHState.data.artilheiro,
            title: 'Artilheiro',
            icon: 'sports_soccer',
            getValue: (r) => `${r.golsPro || r.gols || 0} gols`,
        },
        'luva-ouro': {
            data: WHState.data.luvaOuro,
            title: 'Luva de Ouro',
            icon: 'sports_handball',
            getValue: (r) => `${_tp(r.pontosTotais || r.pontos || 0)} pts`,
        },
        capitao: {
            data: WHState.data.capitao,
            title: 'Capitao',
            icon: 'military_tech',
            getValue: (r) => `${(r.pontuacao_total || r.total || 0).toFixed(0)} pts`,
        },
    }[tipo];

    if (!config) return null;
    const data = config.data;
    if (!data?.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) return null;

    const meuId = String(WHState.timeId);
    const matchId = (r) => String(r.timeId || r.time_id || r.participanteId || '') === meuId;
    const meuIndex = data.ranking.findIndex(matchId);
    const meuDado = meuIndex >= 0 ? data.ranking[meuIndex] : null;
    const pos = meuIndex >= 0 ? meuIndex + 1 : '?';

    const metricText = meuDado ? config.getValue(meuDado) : config.getValue(data.ranking[0]);
    const subtitleText = meuIndex === 0 ? 'Voce lidera!' : `Voce · #${pos} de ${data.ranking.length}`;

    return `
        <div class="wh-card wh-card--${tipo}" data-modal="${tipo}">
            <div class="wh-card-header">
                <div class="wh-card-icon">
                    <span class="material-icons">${config.icon}</span>
                </div>
                <span class="wh-card-title">${config.title}</span>
            </div>
            <div class="wh-card-metric">${metricText}</div>
            <div class="wh-card-subtitle" style="font-size:9px;line-height:1.2">${subtitleText}</div>
        </div>
    `;
}

/** Card: Resta Um — com nome participante + time */
function renderCardRestaUm() {
    const data = WHState.data.restaUm;
    const totalVivosSeguro = (data?.vivos?.length || 0) + (data?.zonaRisco?.length || 0);
    if (!data || totalVivosSeguro === 0) return null;

    const meuId = String(WHState.timeId);
    const vivosSeguro = data.vivos.length;
    const emRisco = data.zonaRisco?.length || 0;
    const totalEliminados = data.eliminados?.length || 0;
    const total = data.totalParticipantes || (totalVivosSeguro + totalEliminados);
    const pctVivos = total > 0 ? Math.round((totalVivosSeguro / total) * 100) : 0;

    const euVivo = data.vivos.find(p => String(p.timeId) === meuId);
    const euEmRisco = data.zonaRisco?.find(p => String(p.timeId) === meuId);
    const euEliminado = !euVivo && !euEmRisco && data.eliminados?.find(p => String(p.timeId) === meuId);

    let statusText;
    if (euEliminado) {
        statusText = '<span style="color:var(--app-danger)">Voce foi eliminado</span>';
    } else if (euEmRisco && data.isLive) {
        statusText = '<span style="color:var(--app-warning)">Voce esta em risco!</span>';
    } else if (euVivo) {
        statusText = '<span style="color:var(--app-success)">Voce vivo!</span>';
    } else {
        statusText = `${totalVivosSeguro} sobreviventes`;
    }

    const riscoLabel = emRisco > 0 && data.isLive
        ? `<span style="color:var(--app-warning);font-size:9px;font-weight:700">${emRisco} em risco</span>`
        : '';

    return `
        <div class="wh-card wh-card--resta-um" data-modal="resta-um">
            <div class="wh-card-header">
                <div class="wh-card-icon">
                    <span class="material-icons">person_off</span>
                </div>
                <span class="wh-card-title">Resta Um</span>
            </div>
            <div class="wh-card-metric">${vivosSeguro}/${total} <span style="font-size:var(--app-font-xs);color:var(--app-text-muted)">vivos</span></div>
            <div class="wh-card-progress">
                <div class="wh-card-progress-bar" style="width:${pctVivos}%"></div>
            </div>
            <div class="wh-card-subtitle" style="font-size:9px;line-height:1.4">${statusText}${riscoLabel ? ' · ' + riscoLabel : ''}</div>
        </div>
    `;
}

// ============================================
// v6.0 MODAL SYSTEM — Detalhes ao clicar no card
// ============================================

/** Abre modal flutuante com detalhes do módulo */
function openCardModal(tipo) {
    // Remove modal existente
    closeCardModal();

    const modalContent = renderModalContent(tipo);
    if (!modalContent) return;

    const overlay = document.createElement('div');
    overlay.id = 'wh-modal-overlay';
    overlay.className = 'wh-modal-overlay';
    overlay.innerHTML = `
        <div class="wh-modal">
            <div class="wh-modal-handle"></div>
            ${modalContent}
        </div>
    `;

    document.body.appendChild(overlay);

    // Abrir com animação
    requestAnimationFrame(() => {
        overlay.classList.add('open');
    });

    // Fechar ao clicar no backdrop
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCardModal();
    });

    // Fechar ao clicar no X
    overlay.querySelector('.wh-modal-close')?.addEventListener('click', () => {
        closeCardModal();
    });

    // Navegação: botão "Ver módulo completo"
    overlay.querySelector('.wh-modal-navigate-btn')?.addEventListener('click', () => {
        const modulo = overlay.querySelector('.wh-modal-navigate-btn').dataset.navigate;
        if (modulo && window.participanteNav) {
            closeCardModal();
            closePanel();
            setTimeout(() => {
                window.participanteNav.navegarPara(modulo);
            }, 300);
        }
    });
}

/** Fecha modal */
function closeCardModal() {
    const overlay = document.getElementById('wh-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
}

/** Roteador de conteúdo do modal */
function renderModalContent(tipo) {
    switch (tipo) {
        case 'ranking': return renderModalRanking();
        case 'pontos-corridos': return renderModalConfrontos();
        case 'mata-mata': return renderModalMataMata();
        case 'artilheiro': return renderModalModulo('artilheiro');
        case 'luva-ouro': return renderModalModulo('luva-ouro');
        case 'capitao': return renderModalModulo('capitao');
        case 'resta-um': return renderModalRestaUm();
        default: return null;
    }
}

/** Modal: Ranking completo */
function renderModalRanking() {
    const parciais = WHState.data.parciais?.ranking || [];
    const isLive = isJogosAoVivo() && parciais.length > 0;

    let ranking;
    if (isLive) {
        ranking = [...parciais]
            .map(p => ({
                timeId: String(p.timeId || p.time_id),
                nome_time: p.nome_time || p.nomeTime || p.slug || 'Time',
                pontos: p.pontos_rodada_atual ?? p.pontos ?? 0,
                escudo: p.url_escudo_png || p.escudo || '/escudos/default.png',
            }))
            .sort((a, b) => b.pontos - a.pontos);
    } else {
        const data = WHState.data.ranking;
        if (!data?.ranking) return null;
        ranking = data.ranking.map(r => ({
            timeId: String(r.timeId),
            nome_time: r.nome_time || r.nomeTime,
            pontos: r.pontos_totais || r.pontos || 0,
            escudo: r.url_escudo_png || r.escudo || '/escudos/default.png',
        }));
    }

    if (ranking.length === 0) return null;

    const meuId = String(WHState.timeId);
    const posColors = ['gold', 'silver', 'bronze'];

    // Show top 5 + user
    const top = ranking.slice(0, 5);
    const minhaPosicao = ranking.findIndex(r => r.timeId === meuId);

    let rows = top.map((r, i) => {
        const isMe = r.timeId === meuId;
        return `
            <div class="wh-modal-rank-row ${posColors[i] || ''} ${isMe ? 'me' : ''}">
                <span class="wh-modal-rank-pos">${i + 1}</span>
                <img class="wh-modal-rank-escudo" src="${r.escudo}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-modal-rank-nome">${escapeHtml(r.nome_time)}</span>
                <span class="wh-modal-rank-pontos">${_tp(r.pontos)}</span>
            </div>
        `;
    }).join('');

    if (minhaPosicao >= 5) {
        const meuTime = ranking[minhaPosicao];
        rows += `
            <div class="wh-modal-separator">···</div>
            <div class="wh-modal-rank-row me">
                <span class="wh-modal-rank-pos">${minhaPosicao + 1}</span>
                <img class="wh-modal-rank-escudo" src="${meuTime.escudo}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-modal-rank-nome">${escapeHtml(meuTime.nome_time)}</span>
                <span class="wh-modal-rank-pontos">${_tp(meuTime.pontos)}</span>
            </div>
        `;
    }

    return `
        <div class="wh-modal-header wh-modal--ranking">
            <div class="wh-modal-icon">
                <span class="material-icons">leaderboard</span>
            </div>
            <span class="wh-modal-title">Ranking da Rodada</span>
            <button class="wh-modal-close"><span class="material-icons">close</span></button>
        </div>
        <div class="wh-modal-body">
            ${rows}
        </div>
        <div class="wh-modal-footer">
            <button class="wh-modal-navigate-btn" data-navigate="home">
                <span class="material-icons">open_in_new</span> Ver ranking completo
            </button>
        </div>
    `;
}

/** Modal: Pontos Corridos (meu confronto + outros confrontos) */
function renderModalConfrontos() {
    const data = WHState.data.pontosCorridos;
    const confronto = WHState.data.meuConfrontoPc;
    const isLive = isJogosAoVivo();

    // --- Bloco "Meu Confronto" no topo ---
    let heroHtml = '';
    if (confronto) {
        const { eu, adversario } = confronto;
        const parciais = WHState.data.parciais?.ranking || [];
        const minhaParcial = parciais.find(p => String(p.timeId) === String(WHState.timeId));
        const advParcial = parciais.find(p => String(p.timeId) === String(adversario?.id));
        const meusPontos = minhaParcial?.pontos_rodada_atual || eu?.pontos || 0;
        const pontosAdv = advParcial?.pontos_rodada_atual || adversario?.pontos || 0;
        const diff = meusPontos - pontosAdv;
        const vencendo = diff > 0;
        const perdendo = diff < 0;
        const statusClass = vencendo ? 'winning' : perdendo ? 'losing' : 'tied';
        const statusText = vencendo ? 'Vencendo' : perdendo ? 'Perdendo' : 'Empatado';
        const euEscudo = eu?.escudo || eu?.url_escudo_png || '/escudos/default.png';
        const advEscudo = adversario?.escudo || adversario?.url_escudo_png || '/escudos/default.png';

        heroHtml = `
            <div style="text-align:center;font-size:var(--app-font-xs);color:var(--app-text-muted);margin-bottom:4px;">
                Rodada ${confronto.rodada || '?'}
                ${isLive ? ' · <span style="color:var(--app-danger);font-weight:700">AO VIVO</span>' : ''}
            </div>
            <div class="wh-mc-scoreboard" style="padding:8px 0;">
                <div class="wh-mc-side ${vencendo ? 'winning' : perdendo ? 'losing' : ''}">
                    <img class="wh-mc-escudo" src="${euEscudo}" onerror="this.src='/escudos/default.png'" alt="">
                    <div class="wh-mc-label">VOCE</div>
                    <div class="wh-mc-nome">${escapeHtml(eu?.nome || eu?.nome_time || 'Meu Time')}</div>
                </div>
                <div class="wh-mc-score-center">
                    <div class="wh-mc-score-row">
                        <span class="wh-mc-pontos ${vencendo ? 'winning' : ''}">${_tp(meusPontos)}</span>
                        <span class="wh-mc-score-x">x</span>
                        <span class="wh-mc-pontos ${perdendo ? 'winning' : ''}">${_tp(pontosAdv)}</span>
                    </div>
                    <div class="wh-mc-vs-diff ${statusClass}">${diff > 0 ? '+' : ''}${_tp(diff)}</div>
                </div>
                <div class="wh-mc-side ${perdendo ? 'winning' : vencendo ? 'losing' : ''}">
                    <img class="wh-mc-escudo" src="${advEscudo}" onerror="this.src='/escudos/default.png'" alt="">
                    <div class="wh-mc-label">ADVERSARIO</div>
                    <div class="wh-mc-nome">${escapeHtml(adversario?.nome || adversario?.nome_time || adversario?.nome_cartola || 'Rival')}</div>
                </div>
            </div>
            <div class="wh-mc-status ${statusClass}">
                <span class="material-icons">${vencendo ? 'trending_up' : perdendo ? 'trending_down' : 'trending_flat'}</span>
                ${statusText} por ${_tp(Math.abs(diff))} pts
            </div>
            <hr style="border:0;border-top:1px solid var(--app-border);margin:10px 0 6px;">
            <div style="font-size:var(--app-font-xs);color:var(--app-text-muted);text-align:center;margin-bottom:6px;">Outros Confrontos</div>
        `;
    }

    // --- Outros confrontos ---
    let rowsHtml = '';
    if (data?.confrontos) {
        const meuId = String(WHState.timeId);
        const outros = confronto
            ? data.confrontos.filter(c => String(c.time1?.id) !== meuId && String(c.time2?.id) !== meuId)
            : [...data.confrontos];

        outros.sort((a, b) => {
            const diffA = Math.abs((getPontosAoVivo(a.time1?.id, a.time1?.pontos || 0)) - (getPontosAoVivo(a.time2?.id, a.time2?.pontos || 0)));
            const diffB = Math.abs((getPontosAoVivo(b.time1?.id, b.time1?.pontos || 0)) - (getPontosAoVivo(b.time2?.id, b.time2?.pontos || 0)));
            return diffA - diffB;
        });

        rowsHtml = outros.map(c => {
            const t1 = c.time1 || {};
            const t2 = c.time2 || {};
            const pA = getPontosAoVivo(t1.id, t1.pontos || 0);
            const pB = getPontosAoVivo(t2.id, t2.pontos || 0);
            const diff = Math.abs(pA - pB);
            const isHot = diff < WH_CONFIG.MIN_DIFF_HOT;
            const aWin = pA > pB;
            const bWin = pB > pA;

            const insight = getConfrontoInsight(diff);
            const showBadge = isHot || (insight && (insight.level === 'inferno' || insight.level === 'tied'));

            return `
                <div class="wh-modal-confronto ${isHot ? 'hot' : ''}">
                    <img class="wh-modal-confronto-escudo" src="${t1.escudo || '/escudos/default.png'}" onerror="this.src='/escudos/default.png'" alt="">
                    <span class="wh-modal-confronto-nome">${escapeHtml(t1.nome || t1.nome_cartola || 'Time 1')}</span>
                    <span class="wh-modal-confronto-pts ${aWin ? 'winning' : ''}">${_tp(pA)}</span>
                    <span class="wh-modal-confronto-x">x</span>
                    <span class="wh-modal-confronto-pts ${bWin ? 'winning' : ''}">${_tp(pB)}</span>
                    <span class="wh-modal-confronto-nome wh-modal-confronto-nome--away">${escapeHtml(t2.nome || t2.nome_cartola || 'Time 2')}</span>
                    <img class="wh-modal-confronto-escudo" src="${t2.escudo || '/escudos/default.png'}" onerror="this.src='/escudos/default.png'" alt="">
                </div>
                ${showBadge ? `<div class="wh-modal-badge-row">
                    ${isHot ? '<span class="wh-confronto-status tight"><span class="material-icons" style="font-size:10px">local_fire_department</span> Quente!</span>' : ''}
                    ${insight && insight.level === 'inferno' ? `<span class="wh-confronto-status wh-insight--inferno"><span class="material-icons" style="font-size:10px">${insight.icon}</span> ${insight.text}</span>` : ''}
                    ${insight && insight.level === 'tied' ? `<span class="wh-confronto-status wh-insight--tied"><span class="material-icons" style="font-size:10px">${insight.icon}</span> ${insight.text}</span>` : ''}
                </div>` : ''}
            `;
        }).join('');
    }

    if (!heroHtml && !rowsHtml) return null;

    return `
        <div class="wh-modal-header wh-modal--pontos-corridos">
            <div class="wh-modal-icon">
                <span class="material-icons">swap_horiz</span>
            </div>
            <span class="wh-modal-title">Pontos Corridos</span>
            <button class="wh-modal-close"><span class="material-icons">close</span></button>
        </div>
        <div class="wh-modal-body">
            ${heroHtml}
            ${rowsHtml}
        </div>
        <div class="wh-modal-footer">
            <button class="wh-modal-navigate-btn" data-navigate="pontos-corridos">
                <span class="material-icons">open_in_new</span> Ver Pontos Corridos
            </button>
        </div>
    `;
}

/** Modal: Mata-Mata (meu confronto + outros da fase) */
function renderModalMataMata() {
    const data = WHState.data.mataMata;
    if (!data?.dados) return null;
    const confrontoMm = WHState.data.meuConfrontoMm;
    const isLive = isJogosAoVivo();

    const fases = ["final", "semis", "quartas", "oitavas", "primeira"];
    let faseAtual = data.faseAtual || null;
    let confrontosFase = [];

    if (!faseAtual) {
        for (const fase of fases) {
            const cf = data.dados[fase];
            if (Array.isArray(cf) && cf.length > 0 && cf.some(c => !c.vencedor)) {
                faseAtual = fase;
                confrontosFase = cf;
                break;
            }
        }
    } else {
        confrontosFase = data.dados[faseAtual] || [];
    }

    if (!faseAtual || confrontosFase.length === 0) {
        for (const fase of fases) {
            const cf = data.dados[fase];
            if (Array.isArray(cf) && cf.length > 0) {
                faseAtual = fase;
                confrontosFase = cf;
                break;
            }
        }
    }

    const faseLabel = { primeira: "1a Fase", oitavas: "Oitavas", quartas: "Quartas", semis: "Semifinal", final: "FINAL" }[faseAtual] || faseAtual || '';

    // --- Bloco "Meu Confronto" no topo ---
    let heroHtml = '';
    if (confrontoMm) {
        const { eu, adversario } = confrontoMm;
        const parciais = WHState.data.parciais?.ranking || [];
        const minhaParcial = parciais.find(p => String(p.timeId) === String(WHState.timeId));
        const advId = adversario?.timeId || adversario?.time_id;
        const advParcial = parciais.find(p => String(p.timeId) === String(advId));
        const meusPontos = minhaParcial?.pontos_rodada_atual || eu?.pontos || 0;
        const pontosAdv = advParcial?.pontos_rodada_atual || adversario?.pontos || 0;
        const diff = meusPontos - pontosAdv;
        const vencendo = diff > 0;
        const perdendo = diff < 0;
        const statusClass = vencendo ? 'winning' : perdendo ? 'losing' : 'tied';
        const statusText = vencendo ? 'Vencendo' : perdendo ? 'Perdendo' : 'Empatado';
        const euEscudo = eu?.escudo || eu?.url_escudo_png || '/escudos/default.png';
        const advEscudo = adversario?.escudo || adversario?.url_escudo_png || '/escudos/default.png';
        const mmFaseLabel = { primeira: "1a Fase", oitavas: "Oitavas", quartas: "Quartas", semis: "Semifinal", final: "FINAL" }[confrontoMm.fase] || confrontoMm.fase || '';

        heroHtml = `
            <div style="text-align:center;font-size:var(--app-font-xs);color:var(--app-text-muted);margin-bottom:4px;">
                ${mmFaseLabel}
                ${isLive ? ' · <span style="color:var(--app-danger);font-weight:700">AO VIVO</span>' : ''}
            </div>
            <div class="wh-mc-scoreboard" style="padding:8px 0;">
                <div class="wh-mc-side ${vencendo ? 'winning' : perdendo ? 'losing' : ''}">
                    <img class="wh-mc-escudo" src="${euEscudo}" onerror="this.src='/escudos/default.png'" alt="">
                    <div class="wh-mc-label">VOCE</div>
                    <div class="wh-mc-nome">${escapeHtml(eu?.nome || eu?.nome_time || 'Meu Time')}</div>
                </div>
                <div class="wh-mc-score-center">
                    <div class="wh-mc-score-row">
                        <span class="wh-mc-pontos ${vencendo ? 'winning' : ''}">${_tp(meusPontos)}</span>
                        <span class="wh-mc-score-x">x</span>
                        <span class="wh-mc-pontos ${perdendo ? 'winning' : ''}">${_tp(pontosAdv)}</span>
                    </div>
                    <div class="wh-mc-vs-diff ${statusClass}">${diff > 0 ? '+' : ''}${_tp(diff)}</div>
                </div>
                <div class="wh-mc-side ${perdendo ? 'winning' : vencendo ? 'losing' : ''}">
                    <img class="wh-mc-escudo" src="${advEscudo}" onerror="this.src='/escudos/default.png'" alt="">
                    <div class="wh-mc-label">ADVERSARIO</div>
                    <div class="wh-mc-nome">${escapeHtml(adversario?.nome || adversario?.nome_time || adversario?.nome_cartola || 'Rival')}</div>
                </div>
            </div>
            <div class="wh-mc-status ${statusClass}">
                <span class="material-icons">${vencendo ? 'trending_up' : perdendo ? 'trending_down' : 'trending_flat'}</span>
                ${statusText} por ${_tp(Math.abs(diff))} pts
            </div>
            ${confrontosFase.length > 1 ? `<hr style="border:0;border-top:1px solid var(--app-border);margin:10px 0 6px;">
            <div style="font-size:var(--app-font-xs);color:var(--app-text-muted);text-align:center;margin-bottom:6px;">Outros Confrontos</div>` : ''}
        `;
    }

    // --- Outros confrontos da fase ---
    const meuId = String(WHState.timeId);
    const filtered = confrontoMm
        ? confrontosFase.filter(c => String(c.timeA?.timeId || c.timeA?.time_id) !== meuId && String(c.timeB?.timeId || c.timeB?.time_id) !== meuId)
        : confrontosFase;

    const sorted = [...filtered].sort((a, b) => {
        const diffA = Math.abs((a.timeA?.pontos || 0) - (a.timeB?.pontos || 0));
        const diffB = Math.abs((b.timeA?.pontos || 0) - (b.timeB?.pontos || 0));
        return diffA - diffB;
    });

    const rowsHtml = sorted.map(c => {
        const idA = String(c.timeA?.timeId || c.timeA?.time_id);
        const idB = String(c.timeB?.timeId || c.timeB?.time_id);
        const pA = getPontosAoVivo(idA, parseFloat(c.timeA?.pontos) || 0);
        const pB = getPontosAoVivo(idB, parseFloat(c.timeB?.pontos) || 0);
        const diff = Math.abs(pA - pB);
        const aWin = pA > pB;
        const bWin = pB > pA;
        const isDecided = !!c.vencedor;
        const isHot = diff < 15 && !isDecided;

        return `
            <div class="wh-modal-confronto ${isHot ? 'hot' : ''}" style="${isDecided ? 'opacity:0.6' : ''}">
                <img class="wh-modal-confronto-escudo" src="${resolverEscudo({timeId: idA, escudo: c.timeA?.escudo || c.timeA?.url_escudo_png})}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-modal-confronto-nome">${escapeHtml(c.timeA?.nome_time || c.timeA?.nome || 'Time A')}</span>
                <span class="wh-modal-confronto-pts ${aWin ? 'winning' : ''}">${_tp(pA)}</span>
                <span class="wh-modal-confronto-x">x</span>
                <span class="wh-modal-confronto-pts ${bWin ? 'winning' : ''}">${_tp(pB)}</span>
                <span class="wh-modal-confronto-nome wh-modal-confronto-nome--away">${escapeHtml(c.timeB?.nome_time || c.timeB?.nome || 'Time B')}</span>
                <img class="wh-modal-confronto-escudo" src="${resolverEscudo({timeId: idB, escudo: c.timeB?.escudo || c.timeB?.url_escudo_png})}" onerror="this.src='/escudos/default.png'" alt="">
            </div>
        `;
    }).join('');

    if (!heroHtml && !rowsHtml) return null;

    return `
        <div class="wh-modal-header wh-modal--mata-mata">
            <div class="wh-modal-icon">
                <span class="material-icons">emoji_events</span>
            </div>
            <span class="wh-modal-title">Mata-Mata${faseLabel ? ' · ' + faseLabel : ''}</span>
            <button class="wh-modal-close"><span class="material-icons">close</span></button>
        </div>
        <div class="wh-modal-body">
            ${heroHtml}
            ${rowsHtml}
        </div>
        <div class="wh-modal-footer">
            <button class="wh-modal-navigate-btn" data-navigate="mata-mata">
                <span class="material-icons">open_in_new</span> Ver Mata-Mata completo
            </button>
        </div>
    `;
}

/** Modal: Módulo genérico (Artilheiro, Luva, Capitão) */
function renderModalModulo(tipo) {
    const config = {
        artilheiro: {
            data: WHState.data.artilheiro,
            title: 'Artilheiro Campeao',
            icon: 'sports_soccer',
            navigateTo: 'artilheiro',
            getValue: (r) => `${r.golsPro || r.gols || 0} gols`,
            getLabel: (r) => r.nome || r.nome_cartola || r.nomeCartola || 'Jogador',
        },
        'luva-ouro': {
            data: WHState.data.luvaOuro,
            title: 'Luva de Ouro',
            icon: 'sports_handball',
            navigateTo: 'luva-de-ouro',
            getValue: (r) => `${_tp(r.pontosTotais || r.pontos || 0)} pts`,
            getLabel: (r) => r.participanteNome || r.nome_cartola || r.nomeCartola || 'Jogador',
        },
        capitao: {
            data: WHState.data.capitao,
            title: 'Capitao de Luxo',
            icon: 'military_tech',
            navigateTo: 'capitao',
            getValue: (r) => `${(r.pontuacao_total || r.total || 0).toFixed(0)} pts`,
            getLabel: (r) => r.nome_cartola || r.nomeCartola || 'Jogador',
        },
    }[tipo];

    if (!config) return null;
    const data = config.data;
    if (!data?.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) return null;

    const meuId = String(WHState.timeId);
    const matchId = (r) => String(r.timeId || r.time_id || r.participanteId || '') === meuId;

    // Top 5 + user
    const top = data.ranking.slice(0, 5);
    const meuIndex = data.ranking.findIndex(matchId);

    let rows = top.map((r, i) => {
        const isMe = matchId(r);
        return `
            <div class="wh-modal-leader-row ${isMe ? 'me' : ''}">
                <span style="font-family:var(--app-font-mono);font-weight:700;font-size:13px;min-width:20px;text-align:center;color:${i === 0 ? 'var(--app-gold)' : 'var(--app-text-muted)'};">${i + 1}</span>
                <img style="width:26px;height:26px;border-radius:50%;object-fit:contain;flex-shrink:0;" src="${resolverEscudo(r)}" onerror="this.src='/escudos/default.png'" alt="">
                <span style="flex:1;font-size:var(--app-font-sm);font-weight:600;color:var(--app-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(config.getLabel(r))}</span>
                <span style="font-family:var(--app-font-mono);font-size:var(--app-font-sm);font-weight:700;color:var(--app-text-secondary);flex-shrink:0;">${config.getValue(r)}</span>
            </div>
        `;
    }).join('');

    if (meuIndex >= 5) {
        const meuItem = data.ranking[meuIndex];
        rows += `
            <div class="wh-modal-separator">···</div>
            <div class="wh-modal-leader-row me">
                <span style="font-family:var(--app-font-mono);font-weight:700;font-size:13px;min-width:20px;text-align:center;color:var(--app-primary);">${meuIndex + 1}</span>
                <img style="width:26px;height:26px;border-radius:50%;object-fit:contain;flex-shrink:0;" src="${resolverEscudo(meuItem)}" onerror="this.src='/escudos/default.png'" alt="">
                <span style="flex:1;font-size:var(--app-font-sm);font-weight:600;color:var(--app-primary-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(config.getLabel(meuItem))}</span>
                <span style="font-family:var(--app-font-mono);font-size:var(--app-font-sm);font-weight:700;color:var(--app-primary);flex-shrink:0;">${config.getValue(meuItem)}</span>
            </div>
        `;
    }

    return `
        <div class="wh-modal-header wh-modal--${tipo}">
            <div class="wh-modal-icon">
                <span class="material-icons">${config.icon}</span>
            </div>
            <span class="wh-modal-title">${config.title}</span>
            <button class="wh-modal-close"><span class="material-icons">close</span></button>
        </div>
        <div class="wh-modal-body">
            ${rows}
        </div>
        <div class="wh-modal-footer">
            <button class="wh-modal-navigate-btn" data-navigate="${config.navigateTo}">
                <span class="material-icons">open_in_new</span> Ver ${config.title} completo
            </button>
        </div>
    `;
}

/** Modal: Resta Um */
function renderModalRestaUm() {
    const data = WHState.data.restaUm;
    if (!data || !data.vivos || data.vivos.length === 0) return null;

    const meuId = String(WHState.timeId);
    const vivos = data.vivos;
    const totalVivos = vivos.length;
    const totalEliminados = data.eliminados?.length || 0;
    const total = data.totalParticipantes || (totalVivos + totalEliminados);
    const pctVivos = total > 0 ? Math.round((totalVivos / total) * 100) : 0;

    // Meu status
    const meuVivo = vivos.find(p => String(p.timeId) === meuId);
    const meuElim = data.eliminados?.find(p => String(p.timeId) === meuId);
    const meuPosVivo = vivos.findIndex(p => String(p.timeId) === meuId);
    const isLanterna = meuPosVivo === vivos.length - 1 && vivos.length > 1;

    let meuStatusHtml = '';
    if (meuVivo) {
        meuStatusHtml = `
            <div class="wh-modal-ru-status ${isLanterna ? 'wh-modal-ru-status--perigo' : 'wh-modal-ru-status--vivo'}">
                <span class="material-icons">${isLanterna ? 'warning' : 'check_circle'}</span>
                ${isLanterna ? 'Voce esta na zona de eliminacao!' : `Voce esta vivo! Posicao #${meuPosVivo + 1}`}
            </div>
        `;
    } else if (meuElim) {
        meuStatusHtml = `
            <div class="wh-modal-ru-status wh-modal-ru-status--eliminado">
                <span class="material-icons">cancel</span>
                Eliminado na Rodada ${meuElim.rodadaEliminacao || '?'}
            </div>
        `;
    }

    // Top 3 + lanterna
    const leader = vivos[0];
    const lanterna = vivos.length > 1 ? vivos[vivos.length - 1] : null;

    let listHtml = `
        <div class="wh-modal-rank-row gold">
            <span class="wh-modal-rank-pos">1</span>
            <img class="wh-modal-rank-escudo" src="${resolverEscudo(leader)}" onerror="this.src='/escudos/default.png'" alt="">
            <span class="wh-modal-rank-nome">${escapeHtml(leader.nomeTime || leader.nomeCartoleiro || 'Time')}</span>
            <span class="wh-modal-rank-pontos" style="color:var(--app-success)">Vivo</span>
        </div>
    `;

    if (vivos.length > 2) {
        listHtml += `
            <div class="wh-modal-rank-row silver">
                <span class="wh-modal-rank-pos">2</span>
                <img class="wh-modal-rank-escudo" src="${resolverEscudo(vivos[1])}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-modal-rank-nome">${escapeHtml(vivos[1].nomeTime || vivos[1].nomeCartoleiro || 'Time')}</span>
                <span class="wh-modal-rank-pontos" style="color:var(--app-success)">Vivo</span>
            </div>
        `;
    }

    if (lanterna && String(lanterna.timeId) !== String(leader.timeId)) {
        const isMe = String(lanterna.timeId) === meuId;
        listHtml += `
            <div class="wh-modal-separator">···</div>
            <div class="wh-modal-rank-row ${isMe ? 'me' : ''}" style="border-left:3px solid var(--app-danger)">
                <span class="wh-modal-rank-pos">${vivos.length}</span>
                <img class="wh-modal-rank-escudo" src="${resolverEscudo(lanterna)}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-modal-rank-nome">${escapeHtml(lanterna.nomeTime || lanterna.nomeCartoleiro || 'Time')}</span>
                <span class="wh-modal-rank-pontos" style="color:var(--app-danger)">Zona!</span>
            </div>
        `;
    }

    return `
        <div class="wh-modal-header wh-modal--resta-um">
            <div class="wh-modal-icon">
                <span class="material-icons">person_off</span>
            </div>
            <span class="wh-modal-title">Resta Um</span>
            <button class="wh-modal-close"><span class="material-icons">close</span></button>
        </div>
        <div class="wh-modal-body">
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:var(--app-font-sm);margin-bottom:8px;">
                <span style="color:var(--app-text-muted)">Sobreviventes</span>
                <span><span style="color:var(--app-success);font-weight:700">${totalVivos}</span>/<span style="color:var(--app-text-muted)">${total}</span></span>
            </div>
            <div class="wh-ru-progress" style="margin:0 0 12px">
                <div class="wh-ru-bar" style="width:${pctVivos}%"></div>
            </div>
            ${meuStatusHtml}
            ${listHtml}
        </div>
        <div class="wh-modal-footer">
            <button class="wh-modal-navigate-btn" data-navigate="resta-um">
                <span class="material-icons">open_in_new</span> Ver Resta Um completo
            </button>
        </div>
    `;
}

// ============================================
// LEGACY RENDER FUNCTIONS — Kept for compatibility
// (Old section-based renderers, still used by some data paths)
// ============================================

function renderRankingSection() {
    // v3.1: Priorizar parciais ao vivo como ranking da rodada
    const parciais = WHState.data.parciais?.ranking || [];
    const isLive = isJogosAoVivo() && parciais.length > 0;

    let ranking;
    let rankingTitle;

    if (isLive) {
        // Ranking ao vivo baseado em parciais
        ranking = [...parciais]
            .map(p => ({
                timeId: String(p.timeId || p.time_id),
                nome_time: p.nome_time || p.nomeTime || p.slug || 'Time',
                pontos: p.pontos_rodada_atual ?? p.pontos ?? 0,
                escudo: p.url_escudo_png || p.escudo || `/escudos/default.png`
            }))
            .sort((a, b) => b.pontos - a.pontos);
        const rodada = WHState.mercadoStatus?.rodada_atual || '?';
        rankingTitle = `Ranking Rodada ${rodada}`;
    } else {
        // Fallback: ranking salvo
        const data = WHState.data.ranking;
        if (!data?.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) return null;
        ranking = data.ranking.map(r => ({
            timeId: String(r.timeId),
            nome_time: r.nome_time || r.nomeTime,
            pontos: r.pontos_totais || r.pontos || 0,
            escudo: r.url_escudo_png || r.escudo || `/escudos/default.png`
        }));
        rankingTitle = data.isRankingGeral
            ? "Ranking Geral"
            : `Ranking Rodada ${data.rodada || WHState.mercadoStatus?.rodada_atual || "?"}`;
    }

    if (ranking.length === 0) return null;

    const meuId = String(WHState.timeId);
    const minhaPosicao = ranking.findIndex(r => r.timeId === meuId) + 1;

    // v5.0: Top 3 como lista vertical compacta + minha posição
    const top3 = ranking.slice(0, 3);
    const posColors = ['gold', 'silver', 'bronze'];

    let items = top3.map((r, i) => {
        const isMe = r.timeId === meuId;
        return `
            <div class="wh-rank-row ${posColors[i]} ${isMe ? 'me' : ''}">
                <span class="wh-rank-pos">${i + 1}</span>
                <img class="wh-rank-escudo" src="${r.escudo}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-rank-nome">${escapeHtml(r.nome_time)}</span>
                <span class="wh-rank-pontos">${(Math.trunc((r.pontos||0) * 10) / 10).toFixed(1)}</span>
            </div>
        `;
    }).join('');

    // Minha posição se fora do top 3
    let meuItemHtml = '';
    if (minhaPosicao > 3) {
        const meuTime = ranking[minhaPosicao - 1];
        meuItemHtml = `
            <div class="wh-ranking-separator">···</div>
            <div class="wh-rank-row me">
                <span class="wh-rank-pos">${minhaPosicao}º</span>
                <img class="wh-rank-escudo" src="${meuTime.escudo}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-rank-nome">${escapeHtml(meuTime.nome_time)}</span>
                <span class="wh-rank-pontos">${(Math.trunc((meuTime.pontos||0) * 10) / 10).toFixed(1)}</span>
            </div>
        `;
    }

    return `
        <div class="wh-section wh-section--ranking">
            <div class="wh-section-header" data-navigate="home">
                <div class="wh-section-icon">
                    <span class="material-icons">leaderboard</span>
                </div>
                <div class="wh-section-title">${rankingTitle}</div>
                ${isLive ? '<span class="wh-live-badge">AO VIVO</span>' : ''}
                <span class="material-icons wh-navigate-hint">open_in_new</span>
            </div>
            <div class="wh-section-body wh-section-body--list">
                ${items}
                ${meuItemHtml}
            </div>
        </div>
    `;
}

/**
 * Helper: busca pontuação ao vivo de um time via parciais
 * Retorna a pontuação parcial se disponível, senão o fallback
 */
function getPontosAoVivo(timeId, fallback = 0) {
    if (!isJogosAoVivo()) return fallback;
    const parciais = WHState.data.parciais?.ranking || [];
    const found = parciais.find(p => String(p.timeId || p.time_id) === String(timeId));
    return found?.pontos_rodada_atual ?? found?.pontos ?? fallback;
}

/**
 * Resolve escudo de um participante usando todas as fontes disponíveis no WHState
 */
function resolverEscudo(item) {
    // Campos diretos do item
    const direto = item.escudo || item.url_escudo_png;
    if (direto) return direto;

    // Lookup por timeId em múltiplas fontes
    const timeId = String(item.timeId || item.time_id || item.participanteId || '');
    if (timeId) {
        // 1. Parciais (ao vivo)
        const parciais = WHState.data.parciais?.ranking || [];
        const p = parciais.find(r => String(r.timeId || r.time_id) === timeId);
        if (p?.url_escudo_png || p?.escudo) return p.url_escudo_png || p.escudo;

        // 2. Ranking salvo
        const rankSalvo = WHState.data.ranking?.ranking || [];
        const rs = rankSalvo.find(r => String(r.timeId || r.time_id) === timeId);
        if (rs?.url_escudo_png || rs?.escudo) return rs.url_escudo_png || rs.escudo;

        // 3. Pontos Corridos classificação (tem escudos)
        const pcClass = WHState.data.pontosCorridos?.classificacao || [];
        const pc = pcClass.find(r => String(r.timeId) === timeId);
        if (pc?.escudo) return pc.escudo;
    }

    // Fallback local por clubeId / escudoId
    const clubeId = item.clubeId || item.clube_id || item.escudoId || item.escudo_id;
    if (clubeId) return `/escudos/${clubeId}.png`;

    return '/escudos/default.png';
}

/**
 * Gera insight dinâmico baseado na diferença de pontos
 */
function getConfrontoInsight(diff) {
    if (diff === 0) return { text: "Empatado! Qualquer lance decide", icon: "balance", level: "tied" };
    if (diff < 3) return { text: `Ponto a ponto! Apenas ${(Math.trunc(diff * 10) / 10).toFixed(1)} pts`, icon: "local_fire_department", level: "inferno" };
    if (diff < 5) return { text: `Virada iminente! ${(Math.trunc(diff * 10) / 10).toFixed(1)} pts de diferença`, icon: "whatshot", level: "hot" };
    if (diff < 10) return { text: `Disputa acirrada! ${(Math.trunc(diff * 10) / 10).toFixed(1)} pts`, icon: "trending_flat", level: "warm" };
    if (diff >= 25) return { text: `Goleada à vista! ${(Math.trunc(diff * 10) / 10).toFixed(1)} pts`, icon: "rocket_launch", level: "blowout" };
    return null;
}

/**
 * Renderiza barra visual de proporção de pontos entre dois times
 */
function renderBarraProporção(pontosA, pontosB) {
    const total = (pontosA || 0) + (pontosB || 0);
    if (total === 0) return '';
    const pctA = ((pontosA || 0) / total * 100).toFixed(0);
    const pctB = (100 - pctA);
    return `
        <div class="wh-barra-proporcao">
            <div class="wh-barra-a" style="width:${pctA}%"><span>${pctA}%</span></div>
            <div class="wh-barra-b" style="width:${pctB}%"><span>${pctB}%</span></div>
        </div>
    `;
}

function renderPontosCorridosSection() {
    const data = WHState.data.pontosCorridos;
    if (!data?.confrontos || data.confrontos.length === 0) return null;

    const meuId = String(WHState.timeId);

    // v3.0: Remover confronto do usuário desta seção (já aparece em "Meu Confronto" acima)
    const hasMeuConfrontoAbove = !!WHState.data.meuConfrontoPc;
    const filteredConfrontos = hasMeuConfrontoAbove
        ? data.confrontos.filter(c => {
            const id1 = String(c.time1?.id);
            const id2 = String(c.time2?.id);
            return id1 !== meuId && id2 !== meuId;
        })
        : [...data.confrontos];

    // Se só tinha o confronto do usuário, não mostra esta seção
    if (filteredConfrontos.length === 0) return null;

    // Ordenar: hot (< 10pts) primeiro (menores diferenças)
    filteredConfrontos.sort((a, b) => {
        const diffA = Math.abs((a.time1?.pontos || 0) - (a.time2?.pontos || 0));
        const diffB = Math.abs((b.time1?.pontos || 0) - (b.time2?.pontos || 0));
        return diffA - diffB; // Menores diferenças primeiro
    });

    const allConfrontos = filteredConfrontos;

    // Separar: primeiros 3 visíveis, restante colapsado
    const visibleCount = 3;
    const visible = allConfrontos.slice(0, visibleCount);
    const collapsed = allConfrontos.slice(visibleCount);

    function renderSingleConfronto(c, index) {
        const t1 = c.time1 || {};
        const t2 = c.time2 || {};
        // v3.1: Overlay de parciais ao vivo
        const pontosA = getPontosAoVivo(t1.id, t1.pontos || 0);
        const pontosB = getPontosAoVivo(t2.id, t2.pontos || 0);
        const diff = Math.abs(pontosA - pontosB);
        const isHot = diff < WH_CONFIG.MIN_DIFF_HOT;
        const isMyGame = String(t1.id) === meuId || String(t2.id) === meuId;
        const aWinning = pontosA > pontosB;
        const bWinning = pontosB > pontosA;

        // v5.0: Apenas insights "inferno" e "tied" como badges
        const insight = getConfrontoInsight(diff);
        const showInsight = insight && (insight.level === 'inferno' || insight.level === 'tied');

        // v5.0: Badges compactos
        const isLive = isJogosAoVivo();
        const badgesHtml = (isLive || isHot || showInsight) ? `
            <div class="wh-confronto-badges">
                ${isLive ? '<span class="wh-confronto-status live"><span class="material-icons" style="font-size:10px">sensors</span> AO VIVO</span>' : ''}
                ${isHot ? '<span class="wh-confronto-status tight"><span class="material-icons" style="font-size:10px">local_fire_department</span> Quente!</span>' : ''}
                ${showInsight ? `<span class="wh-confronto-status wh-insight--${insight.level}"><span class="material-icons" style="font-size:10px">${insight.icon}</span> ${insight.text}</span>` : ''}
            </div>
        ` : '';

        return `
            <div class="wh-confronto ${isHot ? "hot" : ""} ${isMyGame ? "mine" : ""}" data-navigate="pontos-corridos">
                <div class="wh-confronto-scoreboard">
                    <img class="wh-confronto-escudo" src="${t1.escudo || "/escudos/default.png"}" onerror="this.src='/escudos/default.png'" alt="">
                    <span class="wh-confronto-nome">${escapeHtml(t1.nome || t1.nome_cartola || "Time 1")}</span>
                    <span class="wh-confronto-pts ${aWinning ? "winning" : ""}">${(Math.trunc((pontosA||0) * 10) / 10).toFixed(1)}</span>
                    <span class="wh-confronto-x">x</span>
                    <span class="wh-confronto-pts ${bWinning ? "winning" : ""}">${(Math.trunc((pontosB||0) * 10) / 10).toFixed(1)}</span>
                    <span class="wh-confronto-nome wh-confronto-nome--away">${escapeHtml(t2.nome || t2.nome_cartola || "Time 2")}</span>
                    <img class="wh-confronto-escudo" src="${t2.escudo || "/escudos/default.png"}" onerror="this.src='/escudos/default.png'" alt="">
                </div>
                ${badgesHtml}
            </div>
        `;
    }

    const allHtml = allConfrontos.map((c, i) => renderSingleConfronto(c, i)).join("");
    const useCarousel = allConfrontos.length > 2;
    const hotCount = allConfrontos.filter(c => Math.abs((c.time1?.pontos || 0) - (c.time2?.pontos || 0)) < WH_CONFIG.MIN_DIFF_HOT).length;

    // Dots do carrossel
    const dotsHtml = useCarousel ? `
        <div class="wh-carousel-dots" id="wh-pc-dots">
            ${allConfrontos.map((_, i) => `<span class="wh-carousel-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
        </div>
    ` : '';

    // Hint de swipe
    const swipeHint = useCarousel ? `
        <div class="wh-swipe-hint">
            <span class="material-icons">swipe</span>
            Arraste para ver ${allConfrontos.length} confrontos
        </div>
    ` : '';

    return `
        <div class="wh-section wh-section--pontos-corridos">
            <div class="wh-section-header" data-navigate="pontos-corridos">
                <div class="wh-section-icon">
                    <span class="material-icons">swap_horiz</span>
                </div>
                <div class="wh-section-title">Confrontos da Rodada</div>
                ${hotCount > 0 ? `<span class="wh-section-badge wh-badge--hot">${hotCount} quente${hotCount > 1 ? 's' : ''}</span>` : ''}
                <span class="material-icons wh-navigate-hint">open_in_new</span>
            </div>
            <div class="wh-section-body ${useCarousel ? 'wh-section-body--carousel' : ''}" ${useCarousel ? 'id="wh-pc-carousel"' : ''}>
                ${allHtml}
            </div>
            ${dotsHtml}
            ${swipeHint}
        </div>
    `;
}

function renderMataMataSection() {
    const data = WHState.data.mataMata;
    if (!data?.dados) return null;

    // Determinar fase atual - percorrer do final para o início
    const fases = ["final", "semis", "quartas", "oitavas", "primeira"];
    let faseAtual = data.faseAtual || null;
    let confrontosFase = [];

    // Se faseAtual não definida, encontrar a fase com confrontos sem vencedor
    if (!faseAtual) {
        for (const fase of fases) {
            const cf = data.dados[fase];
            if (Array.isArray(cf) && cf.length > 0) {
                const temAberto = cf.some(c => !c.vencedor);
                if (temAberto) {
                    faseAtual = fase;
                    confrontosFase = cf;
                    break;
                }
            }
        }
    } else {
        confrontosFase = data.dados[faseAtual] || [];
    }

    // Se não encontrou fase aberta, pegar a última com dados
    if (!faseAtual || confrontosFase.length === 0) {
        for (const fase of fases) {
            const cf = data.dados[fase];
            if (Array.isArray(cf) && cf.length > 0) {
                faseAtual = fase;
                confrontosFase = cf;
                break;
            }
        }
    }

    if (confrontosFase.length === 0) return null;

    const meuId = String(WHState.timeId);
    const faseLabel = {
        primeira: "1a Fase", oitavas: "Oitavas", quartas: "Quartas",
        semis: "Semifinal", final: "FINAL"
    }[faseAtual] || faseAtual;

    const isLive = isJogosAoVivo();

    // v3.0: Remover confronto do usuário desta seção (já aparece em "Meu Confronto" acima)
    const hasMeuConfrontoAbove = !!WHState.data.meuConfrontoMm;
    const filteredConfrontos = hasMeuConfrontoAbove
        ? confrontosFase.filter(c => {
            const idA = String(c.timeA?.timeId || c.timeA?.time_id);
            const idB = String(c.timeB?.timeId || c.timeB?.time_id);
            return idA !== meuId && idB !== meuId;
        })
        : confrontosFase;

    // Se só tinha o confronto do usuário, não mostra esta seção
    if (filteredConfrontos.length === 0) return null;

    // Ordenar: hot (menor diferença) primeiro
    const sorted = [...filteredConfrontos].sort((a, b) => {
        const diffA = Math.abs((a.timeA?.pontos || 0) - (a.timeB?.pontos || 0));
        const diffB = Math.abs((b.timeA?.pontos || 0) - (b.timeB?.pontos || 0));
        return diffA - diffB;
    });

    // Primeiros 2 visíveis, restante colapsado
    const visibleCount = 2;
    const visible = sorted.slice(0, visibleCount);
    const collapsed = sorted.slice(visibleCount);

    function renderMmConfronto(c) {
        // v3.1: Overlay de parciais ao vivo
        const idA = String(c.timeA?.timeId || c.timeA?.time_id);
        const idB = String(c.timeB?.timeId || c.timeB?.time_id);
        const pontosA = getPontosAoVivo(idA, parseFloat(c.timeA?.pontos) || 0);
        const pontosB = getPontosAoVivo(idB, parseFloat(c.timeB?.pontos) || 0);
        const diff = Math.abs(pontosA - pontosB);
        const aWinning = pontosA > pontosB;
        const bWinning = pontosB > pontosA;
        const isMyGame = idA === meuId || idB === meuId;
        const isDecided = !!c.vencedor;
        const isHot = diff < 15 && !isDecided;

        // v5.0: Status de decisão e badges
        let decisionBadge = '';
        if (isDecided) {
            const vencedorNome = String(c.vencedor) === idA
                ? (c.timeA?.nome_time || c.timeA?.nome || 'Time A')
                : (c.timeB?.nome_time || c.timeB?.nome || 'Time B');
            decisionBadge = `<span class="wh-confronto-status decided"><span class="material-icons" style="font-size:10px">check_circle</span> ${escapeHtml(vencedorNome)}</span>`;
        }

        // v5.0: Apenas insights "inferno" e "tied" como badges
        const insight = !isDecided ? getConfrontoInsight(diff) : null;
        const showInsight = insight && (insight.level === 'inferno' || insight.level === 'tied');

        const badgesHtml = (isLive || isHot || isDecided || showInsight) ? `
            <div class="wh-confronto-badges">
                ${isLive && !isDecided ? '<span class="wh-confronto-status live"><span class="material-icons" style="font-size:10px">sensors</span> AO VIVO</span>' : ''}
                ${isHot ? '<span class="wh-confronto-status tight"><span class="material-icons" style="font-size:10px">local_fire_department</span> Quente!</span>' : ''}
                ${decisionBadge}
                ${showInsight ? `<span class="wh-confronto-status wh-insight--${insight.level}"><span class="material-icons" style="font-size:10px">${insight.icon}</span> ${insight.text}</span>` : ''}
            </div>
        ` : '';

        return `
            <div class="wh-confronto wh-mm-confronto ${isHot ? "hot" : ""} ${isMyGame ? "mine" : ""} ${isDecided ? "decided" : ""}" data-navigate="mata-mata">
                <div class="wh-confronto-scoreboard">
                    <img class="wh-confronto-escudo" src="${resolverEscudo({timeId: idA, escudo: c.timeA?.escudo || c.timeA?.url_escudo_png})}" onerror="this.src='/escudos/default.png'" alt="">
                    <span class="wh-confronto-nome">${escapeHtml(c.timeA?.nome_time || c.timeA?.nome || "Time A")}</span>
                    <span class="wh-confronto-pts ${aWinning ? "winning" : ""}">${(Math.trunc((pontosA||0) * 10) / 10).toFixed(1)}</span>
                    <span class="wh-confronto-x">x</span>
                    <span class="wh-confronto-pts ${bWinning ? "winning" : ""}">${(Math.trunc((pontosB||0) * 10) / 10).toFixed(1)}</span>
                    <span class="wh-confronto-nome wh-confronto-nome--away">${escapeHtml(c.timeB?.nome_time || c.timeB?.nome || "Time B")}</span>
                    <img class="wh-confronto-escudo" src="${resolverEscudo({timeId: idB, escudo: c.timeB?.escudo || c.timeB?.url_escudo_png})}" onerror="this.src='/escudos/default.png'" alt="">
                </div>
                ${badgesHtml}
            </div>
        `;
    }

    const allMmHtml = sorted.map(c => renderMmConfronto(c)).join("");
    const useCarouselMm = sorted.length > 2;

    const hotCount = confrontosFase.filter(c => {
        const diff = Math.abs((c.timeA?.pontos || 0) - (c.timeB?.pontos || 0));
        return diff < 15 && !c.vencedor;
    }).length;

    // Dots do carrossel
    const dotsHtml = useCarouselMm ? `
        <div class="wh-carousel-dots" id="wh-mm-dots">
            ${sorted.map((_, i) => `<span class="wh-carousel-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
        </div>
    ` : '';

    const swipeHint = useCarouselMm ? `
        <div class="wh-swipe-hint">
            <span class="material-icons">swipe</span>
            Arraste para ver ${sorted.length} confrontos
        </div>
    ` : '';

    return `
        <div class="wh-section wh-section--mata-mata">
            <div class="wh-section-header" data-navigate="mata-mata">
                <div class="wh-section-icon">
                    <span class="material-icons">emoji_events</span>
                </div>
                <div class="wh-section-title">Mata-Mata - ${faseLabel}</div>
                ${hotCount > 0 ? `<span class="wh-section-badge wh-badge--hot">${hotCount} quente${hotCount > 1 ? 's' : ''}</span>` : ''}
                <span class="material-icons wh-navigate-hint">open_in_new</span>
            </div>
            <div class="wh-section-body ${useCarouselMm ? 'wh-section-body--carousel' : ''}" ${useCarouselMm ? 'id="wh-mm-carousel"' : ''}>
                ${allMmHtml}
            </div>
            ${dotsHtml}
            ${swipeHint}
        </div>
    `;
}

/**
 * Renderiza seção genérica de ranking por módulo (tabela compacta)
 * v3.0 - Redesign: tabela inline sem boxes aninhados + badge separado
 */
function renderModuleRankingSection(opts) {
    const { data, title, icon, sectionClass, navigateTo, getValue, getLabel } = opts;
    if (!data?.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) return null;

    const leader = data.ranking[0];
    const meuId = String(WHState.timeId);
    const matchId = (r) => String(r.timeId || r.time_id || r.participanteId || '') === meuId;
    const meuIndex = data.ranking.findIndex(matchId);

    // Líder #1 — sempre visível (single-line compacto)
    const leaderHtml = `
        <div class="wh-compact-leader ${meuIndex === 0 ? 'me' : ''}">
            <span class="wh-compact-pos">1</span>
            <img class="wh-compact-escudo" src="${resolverEscudo(leader)}" onerror="this.src='/escudos/default.png'" alt="">
            <span class="wh-compact-nome">${getLabel(leader)}</span>
            <span class="wh-compact-valor">${getValue(leader)}</span>
        </div>
    `;

    // Minha posição (se não sou o #1)
    let myHtml = '';
    if (meuIndex > 0) {
        const meuItem = data.ranking[meuIndex];
        myHtml = `
            <div class="wh-compact-leader wh-compact-leader--me">
                <span class="wh-compact-pos">${meuIndex + 1}</span>
                <img class="wh-compact-escudo" src="${resolverEscudo(meuItem)}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-compact-nome">${getLabel(meuItem)}</span>
                <span class="wh-compact-valor">${getValue(meuItem)}</span>
            </div>
        `;
    }

    return `
        <div class="wh-section wh-section--${sectionClass} wh-section--compact">
            <div class="wh-section-header" ${navigateTo ? `data-navigate="${navigateTo}"` : ''}>
                <div class="wh-section-icon">
                    <span class="material-icons">${icon}</span>
                </div>
                <div class="wh-section-title">${title}</div>
                ${navigateTo ? '<span class="material-icons wh-navigate-hint">open_in_new</span>' : ''}
            </div>
            <div class="wh-section-body wh-section-body--compact">
                ${leaderHtml}
                ${myHtml}
            </div>
        </div>
    `;
}

function renderArtilheiroSection() {
    return renderModuleRankingSection({
        data: WHState.data.artilheiro,
        title: 'Artilheiro Campeão',
        icon: 'sports_soccer',
        sectionClass: 'artilheiro',
        navigateTo: 'artilheiro',
        getValue: (r) => `${r.golsPro || r.gols || 0} gols`,
        getLabel: (r) => r.nome || r.nome_cartola || r.nomeCartola || 'Jogador'
    });
}

function renderLuvaOuroSection() {
    return renderModuleRankingSection({
        data: WHState.data.luvaOuro,
        title: 'Luva de Ouro',
        icon: 'sports_handball',
        sectionClass: 'luva-ouro',
        navigateTo: 'luva-de-ouro',
        getValue: (r) => `${(Math.trunc((r.pontosTotais || r.pontos || 0) * 10) / 10).toFixed(1)} pts`,
        getLabel: (r) => r.participanteNome || r.nome_cartola || r.nomeCartola || 'Jogador'
    });
}

function renderCapitaoSection() {
    return renderModuleRankingSection({
        data: WHState.data.capitao,
        title: 'Capitão de Luxo',
        icon: 'military_tech',
        sectionClass: 'capitao',
        navigateTo: 'capitao',
        getValue: (r) => `${(r.pontuacao_total || r.total || 0).toFixed(0)} pts`,
        getLabel: (r) => r.nome_cartola || r.nomeCartola || 'Jogador'
    });
}

function renderRestaUmSection() {
    const data = WHState.data.restaUm;
    if (!data || !data.vivos || data.vivos.length === 0) return null;

    const meuId = String(WHState.timeId);
    const vivos = data.vivos;
    const totalVivos = vivos.length;
    const totalEliminados = data.eliminados?.length || 0;
    const total = data.totalParticipantes || (totalVivos + totalEliminados);

    const meu = vivos.find(p => String(p.timeId) === meuId)
        || data.eliminados?.find(p => String(p.timeId) === meuId);

    const leader = vivos[0];
    const lanterna = vivos.length > 1 ? vivos[vivos.length - 1] : null;

    // Líder #1 sobrevivente (compact)
    const leaderIsMe = String(leader.timeId) === meuId;
    const leaderHtml = `
        <div class="wh-compact-leader ${leaderIsMe ? 'me' : ''}">
            <span class="wh-compact-pos">1</span>
            <img class="wh-compact-escudo" src="${resolverEscudo(leader)}" onerror="this.src='/escudos/default.png'" alt="">
            <span class="wh-compact-nome">${escapeHtml(leader.nomeTime || leader.nomeCartoleiro || 'Time')}</span>
            <span class="wh-compact-valor" style="color:var(--app-success)">Vivo</span>
        </div>
    `;

    // Lanterna alert (zona de eliminação)
    let lanternaHtml = '';
    if (lanterna) {
        const isMe = String(lanterna.timeId) === meuId;
        lanternaHtml = `
            <div class="wh-ru-lanterna ${isMe ? 'is-me' : ''}">
                <span class="material-icons">warning</span>
                <span style="flex:1">${isMe ? 'VOCE esta na zona!' : escapeHtml(lanterna.nomeTime || 'Time')}</span>
                <span>Zona de eliminacao</span>
            </div>
        `;
    }

    // Minha posição (se não sou o #1)
    let myHtml = '';
    if (meu && !leaderIsMe) {
        const meuIndex = vivos.findIndex(p => String(p.timeId) === meuId);
        const isElim = meu.status === 'eliminado';
        myHtml = `
            <div class="wh-compact-leader wh-compact-leader--me">
                <span class="wh-compact-pos">${isElim ? '-' : (meuIndex + 1)}</span>
                <img class="wh-compact-escudo" src="${resolverEscudo(meu)}" onerror="this.src='/escudos/default.png'" alt="">
                <span class="wh-compact-nome">${escapeHtml(meu.nomeTime || 'Meu Time')}</span>
                <span class="wh-compact-valor" style="color:${isElim ? 'var(--app-danger)' : 'var(--app-success)'}">
                    ${isElim ? `Elim. R${meu.rodadaEliminacao || '?'}` : 'Vivo'}
                </span>
            </div>
        `;
    }

    // v5.0: Barra de progresso de sobrevivência
    const pctVivos = total > 0 ? Math.round((totalVivos / total) * 100) : 0;
    const progressHtml = `
        <div class="wh-ru-progress">
            <div class="wh-ru-bar" style="width:${pctVivos}%"></div>
        </div>
    `;

    return `
        <div class="wh-section wh-section--resta-um wh-section--compact">
            <div class="wh-section-header" data-navigate="resta-um">
                <div class="wh-section-icon">
                    <span class="material-icons">person_off</span>
                </div>
                <div class="wh-section-title">Resta Um</div>
                <div style="display:flex;align-items:center;gap:4px;font-size:var(--app-font-xs);color:var(--app-text-muted);">
                    <span style="color:var(--app-success);font-weight:700;">${totalVivos}</span>/<span>${total}</span> vivos
                </div>
                <span class="material-icons wh-navigate-hint">open_in_new</span>
            </div>
            ${progressHtml}
            <div class="wh-section-body wh-section-body--compact">
                ${leaderHtml}
                ${lanternaHtml}
                ${myHtml}
            </div>
        </div>
    `;
}

// ============================================
// MEU CONFRONTO - PONTOS CORRIDOS
// ============================================
function renderMeuConfrontoPontosCorridos() {
    const confronto = WHState.data.meuConfrontoPc;
    if (!confronto) return null;

    const { eu, adversario, rodada } = confronto;

    // Buscar pontuação atual das parciais (se disponível)
    const parciais = WHState.data.parciais?.ranking || [];
    const minhaParcial = parciais.find((p) => String(p.timeId) === String(WHState.timeId));
    const advParcial = parciais.find((p) => String(p.timeId) === String(adversario.id));

    const meusPontos = minhaParcial?.pontos_rodada_atual || eu?.pontos || 0;
    const pontosAdv = advParcial?.pontos_rodada_atual || adversario?.pontos || 0;
    const diff = meusPontos - pontosAdv;

    const vencendo = diff > 0;
    const perdendo = diff < 0;

    const statusClass = vencendo ? "winning" : perdendo ? "losing" : "tied";
    const statusText = vencendo ? "Vencendo" : perdendo ? "Perdendo" : "Empatado";

    const isLive = isJogosAoVivo();

    return `
        <div class="wh-section wh-section--meu-confronto wh-section--pontos-corridos ${statusClass}" data-navigate="pontos-corridos">
            <div class="wh-section-header">
                <div class="wh-section-icon">
                    <span class="material-icons">swap_horiz</span>
                </div>
                <div class="wh-section-title">Seu Confronto</div>
                <span class="wh-module-badge wh-module-badge--pc">PC · R${rodada}</span>
                ${isLive ? '<span class="wh-live-badge"><span class="material-icons" style="font-size:12px; color: var(--app-danger)">sensors</span> AO VIVO</span>' : ''}
            </div>
            <div class="wh-section-body">
                <div class="wh-meu-confronto">
                    <div class="wh-mc-scoreboard">
                        <div class="wh-mc-side ${vencendo ? 'winning' : perdendo ? 'losing' : ''}">
                            <img class="wh-mc-escudo" src="${eu?.escudo || '/escudos/default.png'}" onerror="this.src='/escudos/default.png'" alt="">
                            <div class="wh-mc-label">VOCÊ</div>
                            <div class="wh-mc-nome">${escapeHtml(eu?.nome || 'Meu Time')}</div>
                        </div>

                        <div class="wh-mc-score-center">
                            <div class="wh-mc-score-row">
                                <span class="wh-mc-pontos ${vencendo ? 'winning' : ''}">${(Math.trunc((meusPontos||0) * 10) / 10).toFixed(1)}</span>
                                <span class="wh-mc-score-x">x</span>
                                <span class="wh-mc-pontos ${perdendo ? 'winning' : ''}">${(Math.trunc((pontosAdv||0) * 10) / 10).toFixed(1)}</span>
                            </div>
                            <div class="wh-mc-vs-diff ${statusClass}">${diff > 0 ? '+' : ''}${(Math.trunc(diff * 10) / 10).toFixed(1)}</div>
                        </div>

                        <div class="wh-mc-side ${perdendo ? 'winning' : vencendo ? 'losing' : ''}">
                            <img class="wh-mc-escudo" src="${adversario?.escudo || '/escudos/default.png'}" onerror="this.src='/escudos/default.png'" alt="">
                            <div class="wh-mc-label">ADVERSÁRIO</div>
                            <div class="wh-mc-nome">${escapeHtml(adversario?.nome || adversario?.nome_cartola || 'Rival')}</div>
                        </div>
                    </div>

                    <div class="wh-mc-status ${statusClass}">
                        <span class="material-icons">${vencendo ? 'trending_up' : perdendo ? 'trending_down' : 'trending_flat'}</span>
                        ${statusText} por ${(Math.trunc(Math.abs(diff) * 10) / 10).toFixed(1)} pts
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// MEU CONFRONTO - MATA-MATA
// ============================================
function renderMeuConfrontoMataMata() {
    const confronto = WHState.data.meuConfrontoMm;
    if (!confronto) return null;

    const { eu, adversario, fase } = confronto;

    // Buscar pontuação atual das parciais (se disponível)
    const parciais = WHState.data.parciais?.ranking || [];
    const minhaParcial = parciais.find((p) => String(p.timeId) === String(WHState.timeId));
    const advParcial = parciais.find((p) => String(p.timeId) === String(adversario?.timeId || adversario?.time_id));

    const meusPontos = minhaParcial?.pontos_rodada_atual || eu?.pontos || 0;
    const pontosAdv = advParcial?.pontos_rodada_atual || adversario?.pontos || 0;
    const diff = meusPontos - pontosAdv;

    const vencendo = diff > 0;
    const perdendo = diff < 0;

    const statusClass = vencendo ? "winning" : perdendo ? "losing" : "tied";

    const faseLabel = {
        primeira: "1ª Fase",
        oitavas: "Oitavas",
        quartas: "Quartas",
        semis: "Semifinal",
        final: "FINAL"
    }[fase] || fase;

    const isLive = isJogosAoVivo();
    const statusText = vencendo ? 'Avançando' : perdendo ? 'Em risco' : 'Equilibrado';

    return `
        <div class="wh-section wh-section--meu-confronto wh-section--mata-mata ${statusClass}" data-navigate="mata-mata">
            <div class="wh-section-header">
                <div class="wh-section-icon">
                    <span class="material-icons">emoji_events</span>
                </div>
                <div class="wh-section-title">Seu Confronto</div>
                <span class="wh-module-badge wh-module-badge--mm">MM · ${faseLabel}</span>
                ${isLive ? '<span class="wh-live-badge"><span class="material-icons" style="font-size:12px; color: var(--app-danger)">sensors</span> AO VIVO</span>' : ''}
            </div>
            <div class="wh-section-body">
                <div class="wh-meu-confronto">
                    <div class="wh-mc-scoreboard">
                        <div class="wh-mc-side ${vencendo ? 'winning' : perdendo ? 'losing' : ''}">
                            <img class="wh-mc-escudo" src="${eu?.url_escudo_png || '/escudos/default.png'}" onerror="this.src='/escudos/default.png'" alt="">
                            <div class="wh-mc-label">VOCÊ</div>
                            <div class="wh-mc-nome">${escapeHtml(eu?.nome_time || eu?.nome_cartola || 'Meu Time')}</div>
                        </div>

                        <div class="wh-mc-score-center">
                            <div class="wh-mc-score-row">
                                <span class="wh-mc-pontos ${vencendo ? 'winning' : ''}">${(Math.trunc((meusPontos||0) * 10) / 10).toFixed(1)}</span>
                                <span class="wh-mc-score-x">x</span>
                                <span class="wh-mc-pontos ${perdendo ? 'winning' : ''}">${(Math.trunc((pontosAdv||0) * 10) / 10).toFixed(1)}</span>
                            </div>
                            <div class="wh-mc-vs-diff ${statusClass}">${diff > 0 ? '+' : ''}${(Math.trunc(diff * 10) / 10).toFixed(1)}</div>
                        </div>

                        <div class="wh-mc-side ${perdendo ? 'winning' : vencendo ? 'losing' : ''}">
                            <img class="wh-mc-escudo" src="${adversario?.url_escudo_png || '/escudos/default.png'}" onerror="this.src='/escudos/default.png'" alt="">
                            <div class="wh-mc-label">ADVERSÁRIO</div>
                            <div class="wh-mc-nome">${escapeHtml(adversario?.nome_time || adversario?.nome_cartola || 'Rival')}</div>
                        </div>
                    </div>

                    <div class="wh-mc-status ${statusClass}">
                        <span class="material-icons">${vencendo ? 'trending_up' : perdendo ? 'trending_down' : 'trending_flat'}</span>
                        ${statusText} por ${(Math.trunc(Math.abs(diff) * 10) / 10).toFixed(1)} pts
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// DESTRUIR WIDGET
// ============================================
export function destroyWhatsHappeningWidget() {
    stopPolling();

    // Limpar timer de game-status
    if (WHState.gameStatusPollTimer) {
        clearInterval(WHState.gameStatusPollTimer);
        WHState.gameStatusPollTimer = null;
    }

    // Reset estado
    WHState.fabState = FAB_GAME_STATE.HIDDEN;
    WHState.fabPreviousState = null;
    WHState.gameStatusData = null;

    const fab = document.getElementById("wh-fab");
    const panel = document.getElementById("wh-panel");
    const backdrop = document.getElementById("wh-backdrop");

    if (fab) fab.remove();
    if (panel) panel.remove();
    if (backdrop) backdrop.remove();

    if (window.Log) Log.info("[WHATS-HAPPENING] 🗑️ Widget destruído");
}

// ============================================
// EXPOR GLOBALMENTE (para debug)
// ============================================
if (typeof window !== "undefined") {
    window.WhatsHappeningWidget = {
        init: initWhatsHappeningWidget,
        destroy: destroyWhatsHappeningWidget,
        open: openPanel,
        close: closePanel,
        refresh: fetchAllData,
        syncState: syncFabGameState,
        openModal: openCardModal,
        closeModal: closeCardModal,
        state: WHState,
        FAB_GAME_STATE,
    };
}

if (window.Log) Log.info("[WHATS-HAPPENING] ✅ Widget v3.1 carregado");
