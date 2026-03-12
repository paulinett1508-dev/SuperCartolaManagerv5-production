/**
 * RESTA UM - Módulo de Visualização
 *
 * Exibe a disputa com cards de participantes: brasão do clube,
 * nome do time, nome do cartoleiro, pontuação da rodada e acumulado.
 * Polling automático quando rodada ao vivo.
 *
 * @version 2.0.0 — Premium redesign: design system tokens, Material Icons,
 *                   JetBrains Mono stats, brasão do clube, animações staggered
 */

const _RU_CSS_ID = 'ru-orq-style';

function _injetarCSS() {
    if (document.getElementById(_RU_CSS_ID)) return;
    const s = document.createElement('style');
    s.id = _RU_CSS_ID;
    s.textContent = `
        /* ======================================================
           RESTA UM — VIEW MODULE STYLES
           Usa tokens de _admin-tokens.css
           ====================================================== */

        .ruv-wrap {
            font-family: 'Inter', -apple-system, sans-serif;
            color: var(--app-text-primary, #fff);
        }

        /* Header da edição */
        .ruv-header {
            display: flex;
            align-items: center;
            gap: var(--app-space-3, 12px);
            margin-bottom: var(--app-space-4, 16px);
            flex-wrap: wrap;
        }
        .ruv-header-title {
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: var(--font-size-xl, 20px);
            color: var(--app-text-primary, #fff);
            margin: 0;
            flex: 1;
        }
        .ruv-status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: var(--app-font-xs, 10px);
            font-weight: 600;
            letter-spacing: .05em;
            text-transform: uppercase;
        }
        .ruv-status-badge.em_andamento {
            background: rgba(16,185,129,.15);
            color: var(--color-success, #10b981);
            border: 1px solid rgba(16,185,129,.3);
        }
        .ruv-status-badge.finalizada {
            background: rgba(234,179,8,.12);
            color: var(--color-warning, #eab308);
            border: 1px solid rgba(234,179,8,.3);
        }
        .ruv-status-badge.pendente {
            background: rgba(156,163,175,.1);
            color: var(--app-text-muted, #9ca3af);
            border: 1px solid rgba(156,163,175,.2);
        }

        /* Live indicator */
        .ruv-live {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px 4px 8px;
            border-radius: 20px;
            background: rgba(244,63,94,.12);
            border: 1px solid rgba(244,63,94,.3);
            color: var(--module-restaum-primary, #f43f5e);
            font-size: var(--app-font-xs, 10px);
            font-weight: 700;
            letter-spacing: .06em;
            text-transform: uppercase;
            margin-bottom: var(--app-space-4, 16px);
        }
        .ruv-live .material-icons {
            font-size: 14px;
            animation: ruv-pulse 1.4s ease-in-out infinite;
        }
        @keyframes ruv-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: .3; }
        }

        /* Rodada info row */
        .ruv-meta {
            display: flex;
            gap: var(--app-space-3, 12px);
            margin-bottom: var(--app-space-5, 20px);
            flex-wrap: wrap;
        }
        .ruv-meta-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: var(--app-radius-md, 8px);
            font-size: var(--app-font-xs, 10px);
            color: var(--app-text-muted, #9ca3af);
        }
        .ruv-meta-chip .material-icons { font-size: 12px; }
        .ruv-meta-chip strong {
            color: var(--app-text-primary, #fff);
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
        }

        /* Regras de negócio */
        .ruv-regras {
            display: flex;
            gap: var(--app-space-2, 8px);
            margin-bottom: var(--app-space-5, 20px);
            flex-wrap: wrap;
        }
        .ruv-regra-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 20px;
            background: rgba(244,63,94,0.12);
            border: 1px solid rgba(244,63,94,0.25);
            font-size: var(--app-font-xs, 10px);
            color: var(--app-text-secondary, #d1d5db);
            font-weight: 500;
        }
        .ruv-regra-chip.destaque {
            background: rgba(234,179,8,0.12);
            border-color: rgba(234,179,8,0.3);
        }
        .ruv-regra-chip .material-icons { font-size: 12px; color: rgba(244,63,94,0.8); }

        /* === CAMPEÃO card === */
        .ruv-campeao-card {
            display: flex;
            align-items: center;
            gap: var(--app-space-4, 16px);
            padding: var(--app-space-4, 16px) var(--app-space-5, 20px);
            background: linear-gradient(135deg, rgba(234,179,8,.18) 0%, rgba(234,179,8,.06) 100%);
            border: 1px solid rgba(234,179,8,.4);
            border-radius: var(--app-radius-lg, 12px);
            margin-bottom: var(--app-space-5, 20px);
            position: relative;
            overflow: hidden;
        }
        .ruv-campeao-card::before {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at top left, rgba(234,179,8,.12) 0%, transparent 70%);
            pointer-events: none;
        }
        .ruv-campeao-escudo {
            width: 52px;
            height: 52px;
            object-fit: contain;
            filter: drop-shadow(0 2px 8px rgba(234,179,8,.4));
            flex-shrink: 0;
        }
        .ruv-campeao-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: var(--app-font-xs, 10px);
            letter-spacing: .1em;
            color: var(--color-warning, #eab308);
            margin-bottom: 4px;
        }
        .ruv-campeao-label .material-icons { font-size: 16px; }
        .ruv-campeao-time {
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: var(--font-size-xl, 20px);
            color: var(--app-text-primary, #fff);
            line-height: 1.1;
        }
        .ruv-campeao-cartoleiro {
            font-size: var(--app-font-sm, 12px);
            color: var(--app-text-muted, #9ca3af);
            margin-top: 2px;
        }

        /* === SECTION TITLE === */
        .ruv-section-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: var(--app-font-sm, 12px);
            letter-spacing: .08em;
            text-transform: uppercase;
            color: var(--app-text-muted, #9ca3af);
            margin-bottom: var(--app-space-3, 12px);
            padding-bottom: var(--app-space-2, 8px);
            border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .ruv-section-title .material-icons { font-size: 14px; }
        .ruv-section-title .ruv-count {
            margin-left: auto;
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: var(--app-font-xs, 10px);
            background: rgba(255,255,255,.06);
            padding: 1px 7px;
            border-radius: 10px;
        }

        /* === VIVOS GRID === */
        .ruv-vivos-grid {
            display: flex;
            flex-direction: column;
            gap: var(--app-space-2, 8px);
            margin-bottom: var(--app-space-6, 24px);
        }

        .ruv-card {
            display: grid;
            grid-template-columns: 28px 40px 1fr auto;
            align-items: center;
            gap: var(--app-space-3, 12px);
            padding: var(--app-space-3, 12px) var(--app-space-4, 16px);
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.07);
            border-radius: var(--app-radius-md, 8px);
            transition: border-color .2s, background .2s;
            animation: ruv-slide-in .35s ease both;
        }
        .ruv-card:hover {
            background: rgba(255,255,255,.06);
            border-color: rgba(255,255,255,.12);
        }
        /* === PRIMEIRO colocado - Campeão da Rodada === */
        .ruv-card.primeiro {
            background: linear-gradient(135deg, rgba(16,185,129,.13) 0%, rgba(16,185,129,.04) 100%);
            border-color: rgba(16,185,129,.4);
        }
        .ruv-card.primeiro:hover {
            border-color: rgba(16,185,129,.6);
            background: linear-gradient(135deg, rgba(16,185,129,.18) 0%, rgba(16,185,129,.07) 100%);
        }
        .ruv-card.primeiro .ruv-pos {
            color: var(--color-success, #10b981);
            font-size: 14px;
        }

        /* === LANTERNA - efeito "morto / offline" === */
        .ruv-card.lanterna {
            border-color: rgba(255,255,255,.07);
            background: rgba(15,15,15,.55);
            filter: grayscale(0.88) brightness(0.72);
            opacity: 0.82;
            animation: ruv-slide-in .35s ease both, ruv-offline-flicker 4s ease-in-out infinite;
        }
        .ruv-card.lanterna:hover {
            opacity: 0.95;
            filter: grayscale(0.55) brightness(0.85);
        }
        @keyframes ruv-offline-flicker {
            0%, 85%, 100% { opacity: 0.82; }
            90%            { opacity: 0.48; }
            93%            { opacity: 0.72; }
            96%            { opacity: 0.38; }
        }

        @keyframes ruv-slide-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        /* Coluna posição */
        .ruv-pos {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: var(--app-font-sm, 12px);
            color: var(--app-text-muted, #9ca3af);
            text-align: center;
            font-weight: 700;
        }
        .ruv-card.lanterna .ruv-pos {
            color: var(--app-text-muted, #9ca3af);
        }

        /* Coluna escudo */
        .ruv-escudo {
            width: 36px;
            height: 36px;
            object-fit: contain;
        }
        .ruv-escudo-placeholder {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255,255,255,.06);
            border-radius: 50%;
            color: var(--app-text-muted, #9ca3af);
        }
        .ruv-escudo-placeholder .material-icons { font-size: 20px; }

        /* Coluna info */
        .ruv-info { min-width: 0; }
        .ruv-time {
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: var(--font-size-base, 13px);
            color: var(--app-text-primary, #fff);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ruv-cartoleiro {
            font-size: var(--app-font-xs, 10px);
            color: var(--app-text-muted, #9ca3af);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Coluna stats */
        .ruv-stats {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 2px;
            flex-shrink: 0;
        }
        .ruv-pts-rodada {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: var(--font-size-base, 13px);
            font-weight: 700;
            color: var(--color-success, #10b981);
        }
        .ruv-pts-rodada.no-data { color: var(--app-text-muted, #9ca3af); }
        .ruv-pts-acumulado {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: var(--app-font-xs, 10px);
            color: var(--app-text-muted, #9ca3af);
        }

        /* Tag ELIMINADO (lanterna) */
        .ruv-lanterna-tag {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .06em;
            text-transform: uppercase;
            color: rgba(156,163,175,.8);
            border: 1px solid rgba(156,163,175,.25);
            border-radius: 4px;
            padding: 1px 5px;
            margin-top: 2px;
        }
        .ruv-lanterna-tag .material-icons { font-size: 9px; }

        /* Tag Campeão da Rodada (primeiro) */
        .ruv-campeao-rodada-tag {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .06em;
            text-transform: uppercase;
            color: var(--color-success, #10b981);
            border: 1px solid rgba(16,185,129,.4);
            border-radius: 4px;
            padding: 1px 5px;
            margin-top: 2px;
        }
        .ruv-campeao-rodada-tag .material-icons { font-size: 9px; }

        /* === BARRA DE PROGRESSO DE SOBREVIVENTES === */
        .ruv-progress-wrap {
            display: flex;
            align-items: center;
            gap: var(--app-space-3, 12px);
            margin-bottom: var(--app-space-5, 20px);
            padding: var(--app-space-3, 12px) var(--app-space-4, 16px);
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: var(--app-radius-md, 8px);
        }
        .ruv-progress-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex-shrink: 0;
            min-width: 48px;
        }
        .ruv-progress-num {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: 22px;
            font-weight: 700;
            line-height: 1;
        }
        .ruv-progress-num.vivos  { color: var(--color-success, #10b981); }
        .ruv-progress-num.elim   { color: var(--module-restaum-primary, #f43f5e); }
        .ruv-progress-label {
            font-size: 9px;
            letter-spacing: .07em;
            text-transform: uppercase;
            color: var(--app-text-muted, #9ca3af);
            margin-top: 2px;
        }
        .ruv-progress-bar-wrap {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .ruv-progress-bar {
            height: 6px;
            background: rgba(244,63,94,.2);
            border-radius: 3px;
            overflow: hidden;
        }
        .ruv-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--color-success,#10b981), #34d399);
            border-radius: 3px;
            transition: width .6s ease;
        }
        .ruv-progress-sub {
            font-size: 9px;
            color: var(--app-text-muted, #9ca3af);
            text-align: center;
            letter-spacing: .04em;
        }

        /* === HERO CARD DO LÍDER DA RODADA === */
        .ruv-lider-card {
            display: flex;
            align-items: center;
            gap: var(--app-space-4, 16px);
            padding: var(--app-space-4, 16px) var(--app-space-5, 20px);
            background: linear-gradient(135deg, rgba(16,185,129,.16) 0%, rgba(16,185,129,.04) 100%);
            border: 1px solid rgba(16,185,129,.4);
            border-radius: var(--app-radius-lg, 12px);
            margin-bottom: var(--app-space-3, 12px);
            position: relative;
            overflow: hidden;
        }
        .ruv-lider-card::before {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at top left, rgba(16,185,129,.1) 0%, transparent 65%);
            pointer-events: none;
        }
        .ruv-lider-pos {
            position: absolute;
            top: 8px;
            right: 12px;
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: 10px;
            font-weight: 700;
            color: rgba(16,185,129,.5);
        }
        .ruv-lider-escudo {
            width: 48px;
            height: 48px;
            object-fit: contain;
            filter: drop-shadow(0 2px 8px rgba(16,185,129,.3));
            flex-shrink: 0;
        }
        .ruv-lider-info {
            flex: 1;
            min-width: 0;
        }
        .ruv-lider-label {
            display: flex;
            align-items: center;
            gap: 5px;
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: 9px;
            letter-spacing: .1em;
            color: var(--color-success, #10b981);
            margin-bottom: 4px;
        }
        .ruv-lider-label .material-icons { font-size: 13px; }
        .ruv-lider-time {
            font-family: var(--app-font-brand, 'Russo One', sans-serif);
            font-size: 18px;
            color: var(--app-text-primary, #fff);
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ruv-lider-cartoleiro {
            font-size: var(--app-font-xs, 10px);
            color: var(--app-text-muted, #9ca3af);
            margin-top: 2px;
        }
        .ruv-lider-stats {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            flex-shrink: 0;
        }
        .ruv-lider-pts {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: 20px;
            font-weight: 700;
            color: var(--color-success, #10b981);
            line-height: 1;
        }
        .ruv-lider-acum {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: 9px;
            color: rgba(16,185,129,.6);
            margin-top: 3px;
        }
        .ruv-lider-no-pts {
            font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
            font-size: 16px;
            color: var(--app-text-muted, #9ca3af);
        }

        /* === ZONA DE ELIMINAÇÃO (separador inline) === */
        .ruv-zona-perigo {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 4px;
            color: rgba(244,63,94,.7);
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .1em;
            text-transform: uppercase;
        }
        .ruv-zona-perigo::before,
        .ruv-zona-perigo::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(244,63,94,.25);
        }
        .ruv-zona-perigo .material-icons { font-size: 11px; }

        /* === ELIMINADO FIXO (confirmado, estático) === */
        .ruv-card.eliminado-fixo {
            border-color: rgba(255,255,255,.05);
            background: rgba(10,10,10,.5);
            filter: grayscale(0.92) brightness(0.62);
            opacity: 0.62;
        }
        .ruv-card.eliminado-fixo:hover {
            opacity: 0.85;
            filter: grayscale(0.65) brightness(0.8);
        }

        /* Separador inline entre vivos e eliminados */
        .ruv-elim-divider {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 4px;
            color: rgba(156,163,175,.4);
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .1em;
            text-transform: uppercase;
        }
        .ruv-elim-divider::before,
        .ruv-elim-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(255,255,255,.06);
        }

        /* Empty state */
        .ruv-empty {
            text-align: center;
            padding: var(--app-space-10, 40px) var(--app-space-4, 16px);
            color: var(--app-text-muted, #9ca3af);
        }
        .ruv-empty .material-icons { font-size: 40px; margin-bottom: var(--app-space-3, 12px); display: block; opacity: .4; }
        .ruv-empty p { font-size: var(--font-size-base, 13px); }

        /* Error state */
        .ruv-error {
            text-align: center;
            padding: var(--app-space-8, 32px);
            color: var(--app-text-muted, #9ca3af);
        }
        .ruv-error .material-icons { font-size: 32px; color: var(--app-danger, #ef4444); margin-bottom: var(--app-space-2, 8px); display: block; }
    `;
    document.head.appendChild(s);
}

function _fmtPts(val) {
    if (val == null) return '-';
    const num = parseFloat(val) || 0;
    const truncado = Math.trunc(num * 100) / 100;
    return truncado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _escudoEl(escudoId, cls, size) {
    if (escudoId) {
        return `<img src="/escudos/${escudoId}.png" class="${cls}"
                     style="width:${size}px;height:${size}px;object-fit:contain;"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                     alt="">
                <span style="display:none;width:${size}px;height:${size}px;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border-radius:50%;">
                    <span class="material-icons" style="font-size:${Math.round(size * 0.55)}px;color:var(--app-text-muted,#9ca3af)">shield</span>
                </span>`;
    }
    return `<span style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border-radius:50%;">
                <span class="material-icons" style="font-size:${Math.round(size * 0.55)}px;color:var(--app-text-muted,#9ca3af)">shield</span>
            </span>`;
}

class RestaUmModule {
    constructor() {
        this.ligaId = null;
        this.edicaoAtual = null;
        this.participantes = [];
        this.isLive = false;
        this.pollingInterval = null;
        this.pollingIntervalMs = 15000;
        this.container = null;
        this.premiacao = null;
    }

    async init(ligaId, container = null) {
        this.ligaId = ligaId;
        this.container = container || document.getElementById('restaUmDados');

        if (!this.container) {
            console.warn('[RESTA-UM] Container não encontrado');
            return false;
        }

        _injetarCSS();

        try {
            await this.carregarStatus();
            if (this.edicaoAtual?.status === 'em_andamento') {
                this.iniciarPolling();
            }
            return true;
        } catch (error) {
            console.error('[RESTA-UM] Erro ao inicializar:', error);
            this.renderErro();
            return false;
        }
    }

    async carregarStatus() {
        const res = await fetch(`/api/resta-um/${this.ligaId}/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.edicaoAtual = data.edicao;
        this.participantes = data.participantes || [];
        this.isLive = data.isLive || false;
        this.premiacao = data.premiacao || null;
        this.renderizar();
    }

    async carregarParciais() {
        try {
            const res = await fetch(`/api/resta-um/${this.ligaId}/parciais`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.edicaoAtual = data.edicao;
            this.participantes = data.participantes || [];
            this.isLive = data.isLive || false;
            this.premiacao = data.premiacao || null;
            this.renderizar();
        } catch (error) {
            console.error('[RESTA-UM] Erro ao carregar parciais:', error);
        }
    }

    iniciarPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        console.log('[RESTA-UM] Iniciando polling...');
        this.carregarParciais();
        this.pollingInterval = setInterval(() => this.carregarParciais(), this.pollingIntervalMs);
    }

    pararPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    renderizar() {
        if (!this.container) return;

        if (!this.edicaoAtual) {
            this.container.innerHTML = `
                <div class="ruv-wrap">
                    <div class="ruv-empty">
                        <span class="material-icons">person_off</span>
                        <p>Nenhuma edição ativa do Resta Um</p>
                    </div>
                </div>`;
            return;
        }

        const ed = this.edicaoAtual;
        const vivos     = this.participantes.filter(p => p.status === 'vivo');
        const campeao   = this.participantes.find(p => p.status === 'campeao');
        const eliminados = this.participantes
            .filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        const statusMap = { pendente: 'Pendente', em_andamento: 'Em Andamento', finalizada: 'Finalizada' };

        // ── CONTAINER ──────────────────────────────────────────────
        let html = `<div class="ruv-wrap">`;

        // live badge
        if (this.isLive) {
            html += `
                <div class="ruv-live">
                    <span class="material-icons">radio_button_checked</span>
                    Ao Vivo
                </div>`;
        }

        // meta chips (rodada)
        const chips = [];
        if (ed.rodadaInicial) chips.push(`<span class="ruv-meta-chip"><span class="material-icons">flag</span>Início <strong>R${ed.rodadaInicial}</strong></span>`);
        if (ed.rodadaAtual)   chips.push(`<span class="ruv-meta-chip"><span class="material-icons">sports_score</span>Rodada <strong>${ed.rodadaAtual}</strong></span>`);
        if (chips.length) html += `<div class="ruv-meta">${chips.join('')}</div>`;

        // ── REGRAS DE NEGÓCIO ────────────────────────────────────
        const regrasChips = [];
        if (ed.eliminadosPorRodada) {
            regrasChips.push(`<span class="ruv-regra-chip"><span class="material-icons">person_off</span>${ed.eliminadosPorRodada === 1 ? '1 eliminado/rodada' : `${ed.eliminadosPorRodada} eliminados/rodada`}</span>`);
        }
        if (this.premiacao?.campeao > 0) {
            regrasChips.push(`<span class="ruv-regra-chip destaque"><span class="material-icons" style="color:var(--color-warning,#eab308)">emoji_events</span>Campeão R$ ${(Math.trunc(this.premiacao.campeao * 100) / 100).toFixed(2).replace('.', ',')}</span>`);
        }
        if (this.premiacao?.viceHabilitado && this.premiacao?.vice > 0) {
            regrasChips.push(`<span class="ruv-regra-chip"><span class="material-icons">workspace_premium</span>Vice R$ ${(Math.trunc(this.premiacao.vice * 100) / 100).toFixed(2).replace('.', ',')}</span>`);
        }
        if (this.premiacao?.terceiroHabilitado && this.premiacao?.terceiro > 0) {
            regrasChips.push(`<span class="ruv-regra-chip"><span class="material-icons">military_tech</span>3º R$ ${(Math.trunc(this.premiacao.terceiro * 100) / 100).toFixed(2).replace('.', ',')}</span>`);
        }
        if (regrasChips.length) html += `<div class="ruv-regras">${regrasChips.join('')}</div>`;


        // ── CAMPEÃO ──────────────────────────────────────────────
        if (campeao) {
            html += `
                <div class="ruv-campeao-card">
                    ${_escudoEl(campeao.escudoId, 'ruv-campeao-escudo', 52)}
                    <div>
                        <div class="ruv-campeao-label">
                            <span class="material-icons" style="color:var(--color-warning,#eab308)">emoji_events</span>
                            CAMPEÃO
                        </div>
                        <div class="ruv-campeao-time">${campeao.nomeTime || '—'}</div>
                        <div class="ruv-campeao-cartoleiro">${campeao.nomeCartoleiro || ''}</div>
                    </div>
                </div>`;
        }

        // ── LISTA UNIFICADA: VIVOS + ELIMINADOS ──────────────────
        const totalParticipantes = vivos.length + eliminados.length;
        const qtdPerigo = ed.eliminadosPorRodada || 1; // quantos serão eliminados por rodada

        if (totalParticipantes > 0) {

            // ── Hero Card: Líder da rodada ─────────────────────────
            if (vivos.length > 0 && !campeao) {
                const lider = vivos[0];
                const temPtsLider = lider.pontosRodada != null;
                html += `
                    <div class="ruv-lider-card">
                        <div class="ruv-lider-pos">#1</div>
                        <div style="display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            ${_escudoEl(lider.escudoId, 'ruv-lider-escudo', 48)}
                        </div>
                        <div class="ruv-lider-info">
                            <div class="ruv-lider-label">
                                <span class="material-icons">emoji_events</span>
                                ${ed.status === 'em_andamento' ? 'Líder da Rodada' : 'Melhor Colocado'}
                            </div>
                            <div class="ruv-lider-time">${lider.nomeTime || '—'}</div>
                            <div class="ruv-lider-cartoleiro">${lider.nomeCartoleiro || ''}</div>
                        </div>
                        <div class="ruv-lider-stats">
                            ${temPtsLider
                                ? `<div class="ruv-lider-pts">${_fmtPts(lider.pontosRodada)}</div>
                                   <div class="ruv-lider-acum">${_fmtPts(lider.pontosAcumulados)} acum.</div>`
                                : `<div class="ruv-lider-no-pts">—</div>
                                   <div class="ruv-lider-acum">${_fmtPts(lider.pontosAcumulados)} acum.</div>`
                            }
                        </div>
                    </div>`;
            }

            // ── Seção título dos demais ────────────────────────────
            if (vivos.length > 1) {
                html += `
                    <div class="ruv-section-title">
                        <span class="material-icons" style="color:var(--color-success,#10b981);">sports_kabaddi</span>
                        Sobreviventes
                        <span class="ruv-count">${vivos.length}</span>
                    </div>`;
            }

            html += `<div class="ruv-vivos-grid">`;

            // ── Vivos (posição 2 em diante, pois líder já tem hero card) ──
            const vivosRestantes = vivos.slice(1); // pula o líder (já renderizado acima)
            // Clamp: nunca marcar todos os vivos como zona de perigo
            const idxZonaInicio = Math.max(0, vivosRestantes.length - qtdPerigo);

            vivosRestantes.forEach((p, idx) => {
                const posGlobal = idx + 2; // +2 pois pos 1 = líder
                const isLanterna = this.isLive && vivosRestantes.length > 0 && idx >= idxZonaInicio && idxZonaInicio < vivosRestantes.length;
                const temPts = p.pontosRodada != null;
                const animDelay = ((idx + 1) * 40).toFixed(0);

                // Inserir separador "Zona de Eliminação" antes do primeiro em perigo
                if (isLanterna && idx === Math.max(0, idxZonaInicio)) {
                    html += `
                        <div class="ruv-zona-perigo">
                            <span class="material-icons">warning</span>
                            Zona de Eliminação
                            <span class="material-icons">warning</span>
                        </div>`;
                }

                const cardClass = `ruv-card${isLanterna ? ' lanterna' : ''}`;

                html += `
                    <div class="${cardClass}" style="animation-delay:${animDelay}ms">
                        <div class="ruv-pos">${posGlobal}</div>
                        <div style="display:flex;align-items:center;justify-content:center;">
                            ${_escudoEl(p.escudoId, 'ruv-escudo', 36)}
                        </div>
                        <div class="ruv-info">
                            <div class="ruv-time">${p.nomeTime || '—'}</div>
                            <div class="ruv-cartoleiro">${p.nomeCartoleiro || ''}</div>
                            ${isLanterna ? `<div class="ruv-lanterna-tag"><span class="material-icons">warning</span>Em Perigo</div>` : ''}
                        </div>
                        <div class="ruv-stats">
                            <div class="ruv-pts-rodada${temPts ? '' : ' no-data'}">${temPts ? _fmtPts(p.pontosRodada) : '—'}</div>
                            <div class="ruv-pts-acumulado">${_fmtPts(p.pontosAcumulados)} acum.</div>
                        </div>
                    </div>`;
            });

            // ── Separador + Eliminados ────────────────────────────
            if (eliminados.length > 0) {
                html += `<div class="ruv-elim-divider">Eliminados</div>`;

                // Ordem DESC: mais recente (sobreviveu mais) = posição mais alta
                eliminados.forEach((p, idx) => {
                    const posGlobal = vivos.length + idx + 1;
                    const animDelay = ((vivos.length + idx) * 40).toFixed(0);

                    html += `
                        <div class="ruv-card eliminado-fixo" style="animation-delay:${animDelay}ms">
                            <div class="ruv-pos">${posGlobal}</div>
                            <div style="display:flex;align-items:center;justify-content:center;">
                                ${_escudoEl(p.escudoId, 'ruv-escudo', 36)}
                            </div>
                            <div class="ruv-info">
                                <div class="ruv-time">${p.nomeTime || '—'}</div>
                                <div class="ruv-cartoleiro">${p.nomeCartoleiro || ''}</div>
                                <div class="ruv-lanterna-tag">
                                    <span class="material-icons">block</span>
                                    Eliminado R${p.rodadaEliminacao || '?'}
                                </div>
                            </div>
                            <div class="ruv-stats">
                                <div class="ruv-pts-rodada no-data">—</div>
                                <div class="ruv-pts-acumulado">${_fmtPts(p.pontosAcumulados)} acum.</div>
                            </div>
                        </div>`;
                });
            }

            html += `</div>`; // /ruv-vivos-grid
        }

        html += `</div>`; // /ruv-wrap

        this.container.innerHTML = html;
    }

    renderErro() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="ruv-wrap">
                <div class="ruv-error">
                    <span class="material-icons">warning</span>
                    <p>Erro ao carregar o Resta Um. Tente recarregar a página.</p>
                </div>
            </div>`;
    }

    destroy() {
        this.pararPolling();
        if (this.container) this.container.innerHTML = '';
    }
}

// Export para uso global
window.RestaUmModule = RestaUmModule;
