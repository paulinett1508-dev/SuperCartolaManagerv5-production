/**
 * BIG CARTOLA IA - FAB Widget
 * ============================
 * FAB flutuante "Em breve Big Cartola IA"
 * Substituiu o widget "O que tá rolando?" (fire states)
 *
 * @version 4.0.0 - Big Cartola IA (coming soon)
 */

if (window.Log) Log.info("[BIG-CARTOLA-IA] FAB widget carregando...");

// ============================================
// ESTADO DO WIDGET
// ============================================
const WHState = {
    isDragging: false,
    fabPosition: { right: 16, bottom: 80 },
    toastTimeout: null,
};

// ============================================
// DRAG & DROP - FAB SOLTO
// ============================================
const FAB_STORAGE_KEY = "wh-fab-position";

function loadFabPosition() {
    try {
        const saved = localStorage.getItem(FAB_STORAGE_KEY);
        if (saved) {
            WHState.fabPosition = JSON.parse(saved);
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
    fab.style.left = "auto";
    fab.style.top = "auto";
}

function initFabDrag(fab) {
    let startX, startY, startRight, startBottom;
    let hasMoved = false;
    let touchStartTime = 0;

    // Touch events (mobile)
    fab.addEventListener("touchstart", handleDragStart, { passive: true });
    fab.addEventListener("touchmove", handleDragMove, { passive: false });
    fab.addEventListener("touchend", handleDragEnd);

    // Mouse events (desktop)
    fab.addEventListener("mousedown", handleDragStart);
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);

    function handleDragStart(e) {
        WHState.isDragging = true;
        hasMoved = false;
        touchStartTime = Date.now();
        fab.classList.add("dragging");

        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        startRight = WHState.fabPosition.right;
        startBottom = WHState.fabPosition.bottom;
    }

    function handleDragMove(e) {
        if (!WHState.isDragging) return;

        const touch = e.touches ? e.touches[0] : e;
        const deltaX = startX - touch.clientX;
        const deltaY = startY - touch.clientY;

        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            hasMoved = true;
            if (e.type === "touchmove" && e.cancelable) {
                e.preventDefault();
            }
        }

        if (!hasMoved) return;

        let newRight = startRight + deltaX;
        let newBottom = startBottom + deltaY;

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
            fab.classList.add("just-dropped");
            setTimeout(() => fab.classList.remove("just-dropped"), 400);
            saveFabPosition();
        } else if (e.type === "touchend" && touchDuration < 300) {
            // TAP detectado no mobile
            setTimeout(() => toggleAiToast(), 10);
        }

        hasMoved = false;
    }
}

// ============================================
// TOAST "EM BREVE"
// ============================================
function toggleAiToast() {
    const existing = document.getElementById("wh-ai-toast");

    // Se já existe e está visível → fechar
    if (existing) {
        clearTimeout(WHState.toastTimeout);
        existing.classList.remove("wh-ai-toast--visible");
        setTimeout(() => existing.remove(), 300);
        return;
    }

    // Criar toast
    const toast = document.createElement("div");
    toast.id = "wh-ai-toast";
    toast.className = "wh-ai-toast";
    toast.innerHTML = `
        <span class="material-icons wh-ai-toast-icon">auto_awesome</span>
        <span class="wh-ai-toast-text">Em breve <strong>Big Cartola IA</strong></span>
    `;
    document.body.appendChild(toast);

    // Posicionar o toast próximo ao FAB
    const fab = document.getElementById("wh-fab");
    if (fab) {
        const fabRect = fab.getBoundingClientRect();
        const toastRect = toast.getBoundingClientRect();
        const fabCenterX = fabRect.left + fabRect.width / 2;

        toast.style.bottom = (window.innerHeight - fabRect.top + 8) + "px";

        let left = fabCenterX - toastRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - toastRect.width - 8));
        toast.style.left = left + "px";
        toast.style.transform = "translateY(10px)";
    }

    // Animar entrada
    requestAnimationFrame(() => {
        toast.classList.add("wh-ai-toast--visible");
    });
}

// ============================================
// CRIAR FAB
// ============================================
function createWidgetElements() {
    // Remover elementos existentes (se houver)
    const existingFab = document.getElementById("wh-fab");
    if (existingFab) existingFab.remove();

    // Carregar posição salva
    loadFabPosition();

    // Criar FAB
    const fab = document.createElement("button");
    fab.id = "wh-fab";
    fab.className = "wh-fab wh-fab--ai";
    fab.innerHTML = `
        <span class="material-icons wh-fab-icon">auto_awesome</span>
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
        toggleAiToast();
    });

    document.body.appendChild(fab);

    // Inicializar drag
    initFabDrag(fab);
}

// ============================================
// INICIALIZAÇÃO
// ============================================
export async function initWhatsHappeningWidget(params = {}) {
    if (window.Log) Log.info("[BIG-CARTOLA-IA] Inicializando FAB IA...");

    createWidgetElements();

    if (window.Log) Log.info("[BIG-CARTOLA-IA] FAB IA inicializado");
}
