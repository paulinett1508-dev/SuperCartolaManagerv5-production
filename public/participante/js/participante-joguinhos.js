// =====================================================================
// participante-joguinhos.js — Módulo de Joguinhos Premium v1.0
// =====================================================================
// Disponibiliza window.abrirJoguinhos() para o botão na home.
// Conteúdo:
//   1. Pênaltis  — integrado ao ManutencaoScreen existente
//   2. Escorpião — canvas interativo: bicho segue o mouse
//
// SPA Init Pattern (CLAUDE.md): usa if(readyState) para evitar problema
// com DOMContentLoaded em navegação SPA.
// =====================================================================

(function () {
    'use strict';

    // =================================================================
    // HELPERS
    // =================================================================

    function _lerp(a, b, t) { return a + (b - a) * t; }

    // =================================================================
    // MODAL DE SELEÇÃO DE JOGO
    // =================================================================

    function abrirJoguinhos() {
        fecharJoguinhos();

        const overlay = document.createElement('div');
        overlay.id = 'joguinhos-overlay';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.82)',
            'z-index:9998',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-family:Inter,-apple-system,sans-serif',
            'backdrop-filter:blur(5px)',
            '-webkit-backdrop-filter:blur(5px)',
        ].join(';');

        overlay.innerHTML = `
            <div style="
                background:#1e293b;
                border-radius:20px;
                padding:28px 24px;
                max-width:400px;
                width:92%;
                box-shadow:0 25px 60px rgba(0,0,0,0.72);
                border:1px solid #334155;
            ">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;">
                    <div>
                        <h2 style="font-family:'Russo One',sans-serif;color:#f1f5f9;font-size:1.25rem;margin:0 0 4px;">
                            Joguinhos
                        </h2>
                        <p style="color:#64748b;font-size:0.78rem;margin:0;">Escolha um jogo</p>
                    </div>
                    <button id="jog-btn-fechar" style="
                        background:#334155;border:none;color:#94a3b8;
                        width:36px;height:36px;border-radius:50%;cursor:pointer;
                        display:flex;align-items:center;justify-content:center;
                        flex-shrink:0;transition:background 0.2s;
                    ">
                        <span class="material-icons" style="font-size:18px;">close</span>
                    </button>
                </div>

                <!-- Pênaltis -->
                <button id="jog-btn-penaltis" style="
                    width:100%;background:linear-gradient(135deg,#10b981,#059669);
                    border:none;border-radius:14px;padding:18px 20px;
                    cursor:pointer;text-align:left;transition:transform 0.15s;
                    display:flex;align-items:center;gap:16px;margin-bottom:12px;
                ">
                    <div style="
                        width:48px;height:48px;border-radius:12px;
                        background:rgba(255,255,255,0.15);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;
                    ">
                        <span class="material-icons" style="font-size:26px;color:white;">sports_soccer</span>
                    </div>
                    <div>
                        <div style="font-family:'Russo One',sans-serif;color:white;font-size:0.95rem;margin-bottom:3px;">
                            Pênaltis
                        </div>
                        <div style="color:rgba(255,255,255,0.72);font-size:0.73rem;line-height:1.4;">
                            Cobra ou defende — você escolhe
                        </div>
                    </div>
                </button>

                <!-- Escorpião -->
                <button id="jog-btn-escorpiao" style="
                    width:100%;background:linear-gradient(135deg,#f59e0b,#b45309);
                    border:none;border-radius:14px;padding:18px 20px;
                    cursor:pointer;text-align:left;transition:transform 0.15s;
                    display:flex;align-items:center;gap:16px;
                ">
                    <div style="
                        width:48px;height:48px;border-radius:12px;
                        background:rgba(255,255,255,0.15);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;
                    ">
                        <span class="material-icons" style="font-size:26px;color:white;">pest_control</span>
                    </div>
                    <div>
                        <div style="font-family:'Russo One',sans-serif;color:white;font-size:0.95rem;margin-bottom:3px;">
                            Escorpião
                        </div>
                        <div style="color:rgba(255,255,255,0.72);font-size:0.73rem;line-height:1.4;">
                            Guie o escorpião com o mouse
                        </div>
                    </div>
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#jog-btn-fechar').addEventListener('click', fecharJoguinhos);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharJoguinhos(); });

        const btnPen = overlay.querySelector('#jog-btn-penaltis');
        btnPen.addEventListener('click', () => { fecharJoguinhos(); _abrirPenaltis(); });
        btnPen.addEventListener('mouseenter', () => { btnPen.style.transform = 'scale(1.02)'; });
        btnPen.addEventListener('mouseleave', () => { btnPen.style.transform = ''; });

        const btnEsc = overlay.querySelector('#jog-btn-escorpiao');
        btnEsc.addEventListener('click', () => { fecharJoguinhos(); ESC.abrir(); });
        btnEsc.addEventListener('mouseenter', () => { btnEsc.style.transform = 'scale(1.02)'; });
        btnEsc.addEventListener('mouseleave', () => { btnEsc.style.transform = ''; });
    }

    function fecharJoguinhos() {
        const el = document.getElementById('joguinhos-overlay');
        if (el) el.remove();
    }

    // =================================================================
    // PÊNALTIS — Integração com ManutencaoScreen
    // =================================================================
    // Estratégia: reutiliza o canvas e a lógica existentes em
    // ManutencaoScreen sem duplicar código. Exibimos a tela de
    // manutenção com os elementos de contexto (logo, mensagens)
    // escondidos — só o container do jogo fica visível.
    // =================================================================

    function _abrirPenaltis() {
        const manutScreen = document.getElementById('manutencaoScreen');
        if (!manutScreen || !window.ManutencaoScreen) {
            if (window.Log) Log.warn('JOGUINHOS', 'ManutencaoScreen não disponível');
            return;
        }

        // Elementos de contexto de manutenção que serão ocultados
        const seletores = [
            '.manutencao-logo',
            '.manutencao-imagem',
            '.manutencao-card-mensagem',
            '#manutencaoNoticias',
            '.manutencao-footer',
            '#devBypassLink',
        ];
        const escondidos = [];
        seletores.forEach((sel) => {
            const el = manutScreen.querySelector(sel) || document.querySelector(sel);
            if (el) {
                escondidos.push({ el, display: el.style.display });
                el.style.display = 'none';
            }
        });

        // Exibe a tela de manutenção como overlay do jogo
        manutScreen.style.display = 'flex';

        // Header do jogo de pênaltis com botão fechar
        const header = document.createElement('div');
        header.id = 'jog-penaltis-header';
        header.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'margin-bottom:16px',
            'width:100%',
            'max-width:420px',
            'flex-shrink:0',
        ].join(';');
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="material-icons" style="color:#10b981;font-size:22px;">sports_soccer</span>
                <span style="font-family:'Russo One',sans-serif;color:#f1f5f9;font-size:1.05rem;">
                    Pênaltis
                </span>
            </div>
            <button id="jog-penaltis-close" style="
                background:#1e293b;border:1px solid #334155;color:#94a3b8;
                border-radius:50%;width:40px;height:40px;cursor:pointer;
                display:flex;align-items:center;justify-content:center;
                transition:background 0.2s;
            ">
                <span class="material-icons" style="font-size:18px;">close</span>
            </button>
        `;

        const card = manutScreen.querySelector('.manutencao-card-principal');
        if (card) card.insertBefore(header, card.firstChild);

        function fecharPenaltis() {
            // Para animação do jogo
            if (window.ManutencaoScreen) {
                window.ManutencaoScreen._fecharPenaltyGame();
                window.ManutencaoScreen._painelAtivo = null;
            }

            // Oculta container do jogo
            const pen = document.getElementById('manutencaoPenaltyContainer');
            if (pen) pen.style.display = 'none';

            // Restaura elementos de contexto
            escondidos.forEach(({ el, display }) => { el.style.display = display; });

            // Remove header e esconde tela de manutenção
            header.remove();
            manutScreen.style.display = '';
        }

        const closeBtn = document.getElementById('jog-penaltis-close');
        closeBtn.addEventListener('click', fecharPenaltis);
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = '#334155'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = '#1e293b'; });

        // Abre o jogo de pênaltis
        window.ManutencaoScreen.abrirPenaltyGame();
    }

    // =================================================================
    // ESCORPIÃO — Canvas interativo (mouse-driven)
    // =================================================================
    // O escorpião é composto por uma cadeia de segmentos:
    //   [0]        = cabeça (segue o mouse com lerp)
    //   [1..9]     = corpo (8 segmentos, com patas)
    //   [10..15]   = cauda (6 segmentos, terminando no ferrão)
    //
    // Cada segmento segue o anterior mantendo distância fixa (SEG_DIST).
    // =================================================================

    const CONF = {
        TOTAL_SEGS: 16,
        BODY_START: 1,
        BODY_END: 10,   // indices 1..9
        TAIL_START: 10, // indices 10..15
        HEAD_LERP: 0.13,
        SEG_DIST: 22,
        C: {
            LIGHT:  '#fde047',
            MID:    '#d97706',
            DARK:   '#78350f',
            AMBER:  '#fbbf24',
            LEG:    'rgba(180,118,18,0.75)',
            BG:     '#050a14',
            GRID:   '#0a1628',
        },
    };

    const ESC = {
        segs: [],
        mouseX: 0,
        mouseY: 0,
        animFrame: null,
        frameCount: 0,
        ctx: null,
        canvas: null,
        _onKey: null,
        _onResize: null,

        abrir() {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;

            // Inicializa segmentos empilhados verticalmente no centro
            this.segs = [];
            for (let i = 0; i < CONF.TOTAL_SEGS; i++) {
                this.segs.push({ x: cx, y: cy + i * CONF.SEG_DIST });
            }
            this.mouseX = cx;
            this.mouseY = cy;
            this.frameCount = 0;

            // Overlay principal
            const overlay = document.createElement('div');
            overlay.id = 'escorpiao-overlay';
            overlay.style.cssText = [
                'position:fixed',
                'inset:0',
                `background:${CONF.C.BG}`,
                'z-index:9999',
                'overflow:hidden',
                'cursor:none',
            ].join(';');

            // Canvas
            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            canvas.style.cssText = 'display:block;';
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');

            // Botão fechar
            const closeBtn = document.createElement('button');
            closeBtn.style.cssText = [
                'position:absolute',
                'top:20px',
                'right:20px',
                'background:#0f172a',
                'border:1px solid #1e3a5f',
                'color:#475569',
                'border-radius:50%',
                'width:44px',
                'height:44px',
                'cursor:pointer',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'z-index:10',
                'transition:all 0.2s',
                'cursor:auto',
            ].join(';');
            closeBtn.innerHTML = '<span class="material-icons" style="font-size:20px;">close</span>';
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = '#1e293b';
                closeBtn.style.color = '#94a3b8';
                closeBtn.style.borderColor = '#334155';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = '#0f172a';
                closeBtn.style.color = '#475569';
                closeBtn.style.borderColor = '#1e3a5f';
            });
            closeBtn.addEventListener('click', () => ESC.fechar());

            // Label instrução
            const label = document.createElement('div');
            label.style.cssText = [
                'position:absolute',
                'bottom:28px',
                'left:50%',
                'transform:translateX(-50%)',
                'font-family:Inter,-apple-system,sans-serif',
                'font-size:0.75rem',
                'color:#1e3a5f',
                'white-space:nowrap',
                'pointer-events:none',
                'transition:opacity 1.5s',
                'user-select:none',
            ].join(';');
            label.textContent = 'Mova o mouse para guiar o escorpião  •  ESC para sair';

            overlay.appendChild(canvas);
            overlay.appendChild(closeBtn);
            overlay.appendChild(label);
            document.body.appendChild(overlay);

            // Fade da instrução depois de 3.5s
            setTimeout(() => { label.style.opacity = '0'; }, 3500);

            // Tracking de mouse e touch
            overlay.addEventListener('mousemove', (e) => {
                ESC.mouseX = e.clientX;
                ESC.mouseY = e.clientY;
            });
            overlay.addEventListener('touchmove', (e) => {
                e.preventDefault();
                ESC.mouseX = e.touches[0].clientX;
                ESC.mouseY = e.touches[0].clientY;
            }, { passive: false });

            // ESC fecha
            this._onKey = (e) => { if (e.key === 'Escape') ESC.fechar(); };
            document.addEventListener('keydown', this._onKey);

            // Redimensionamento
            this._onResize = () => {
                if (ESC.canvas) {
                    ESC.canvas.width = window.innerWidth;
                    ESC.canvas.height = window.innerHeight;
                }
            };
            window.addEventListener('resize', this._onResize);

            // Game loop
            const loop = () => {
                if (!ESC.ctx) return;
                ESC.frameCount++;
                ESC._atualizar();
                ESC._renderizar();
                ESC.animFrame = requestAnimationFrame(loop);
            };
            loop();
        },

        fechar() {
            if (this.animFrame) {
                cancelAnimationFrame(this.animFrame);
                this.animFrame = null;
            }
            if (this._onKey) {
                document.removeEventListener('keydown', this._onKey);
                this._onKey = null;
            }
            if (this._onResize) {
                window.removeEventListener('resize', this._onResize);
                this._onResize = null;
            }
            const overlay = document.getElementById('escorpiao-overlay');
            if (overlay) overlay.remove();
            this.ctx = null;
            this.canvas = null;
        },

        // ---- Física: atualiza posição da cadeia de segmentos ----
        _atualizar() {
            const segs = this.segs;

            // Cabeça acompanha o mouse com lerp
            segs[0].x += (this.mouseX - segs[0].x) * CONF.HEAD_LERP;
            segs[0].y += (this.mouseY - segs[0].y) * CONF.HEAD_LERP;

            // Cada segmento segue o anterior mantendo SEG_DIST
            for (let i = 1; i < segs.length; i++) {
                const dx = segs[i].x - segs[i - 1].x;
                const dy = segs[i].y - segs[i - 1].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > CONF.SEG_DIST) {
                    const f = (dist - CONF.SEG_DIST) / dist;
                    segs[i].x -= dx * f;
                    segs[i].y -= dy * f;
                }
            }
        },

        // ---- Renderização ----
        _renderizar() {
            const ctx = this.ctx;
            const W = this.canvas.width;
            const H = this.canvas.height;
            const segs = this.segs;
            const t = this.frameCount;

            // Fundo
            ctx.fillStyle = CONF.C.BG;
            ctx.fillRect(0, 0, W, H);

            // Grade de pontos decorativa
            ctx.fillStyle = CONF.C.GRID;
            for (let x = 21; x < W; x += 42) {
                for (let y = 21; y < H; y += 42) {
                    ctx.beginPath();
                    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Ângulo de direção da cabeça
            const dx = segs[0].x - segs[1].x;
            const dy = segs[0].y - segs[1].y;
            const headAngle = Math.atan2(dy, dx);

            // Ordem de pintura: corpo → cauda → cabeça
            this._desenharCorpo(ctx, segs, t);
            this._desenharCauda(ctx, segs, t);
            this._desenharCabeca(ctx, segs[0], headAngle, t);
        },

        // Cria gradiente radial com 3 paradas de cor
        _rg(ctx, cx, cy, r, c0, c1, c2) {
            const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.08, cx, cy, r);
            g.addColorStop(0, c0);
            g.addColorStop(0.55, c1);
            g.addColorStop(1, c2);
            return g;
        },

        // ---- Corpo: segmentos 1..9 com patas ----
        _desenharCorpo(ctx, segs, t) {
            for (let i = CONF.BODY_START; i < CONF.BODY_END; i++) {
                const s = segs[i];
                const prog = (i - 1) / (CONF.BODY_END - CONF.BODY_START - 1); // 0..1
                const rx = _lerp(12, 7.5, prog);
                const ry = _lerp(9.5, 6, prog);

                // Elipse do segmento
                ctx.beginPath();
                ctx.ellipse(s.x, s.y, rx * 1.15, ry, 0, 0, Math.PI * 2);
                ctx.fillStyle = this._rg(ctx, s.x, s.y, rx, CONF.C.AMBER, CONF.C.MID, CONF.C.DARK);
                ctx.fill();
                ctx.strokeStyle = 'rgba(120,53,15,0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Patas (segmentos 1..8 têm par de patas)
                const wiggle = Math.sin(t * 0.10 + i * 0.88) * 9;
                for (const side of [-1, 1]) {
                    const legTipX = s.x + side * (rx * 1.15 + 13);
                    const legTipY = s.y + wiggle * side * 0.45;

                    ctx.beginPath();
                    ctx.moveTo(s.x + side * rx * 0.85, s.y);
                    ctx.lineTo(legTipX, legTipY);
                    ctx.strokeStyle = CONF.C.LEG;
                    ctx.lineWidth = 1.8;
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Ponta da pata
                    ctx.beginPath();
                    ctx.arc(legTipX, legTipY, 2, 0, Math.PI * 2);
                    ctx.fillStyle = CONF.C.AMBER;
                    ctx.fill();
                }
            }
        },

        // ---- Cauda: segmentos 10..15 terminando no ferrão ----
        _desenharCauda(ctx, segs, t) {
            const total = segs.length;
            ctx.save();

            for (let i = CONF.TAIL_START; i < total; i++) {
                const s = segs[i];
                const prog = (i - CONF.TAIL_START) / (total - CONF.TAIL_START - 1); // 0..1
                const r = _lerp(6, 2.5, prog);
                const isSting = (i === total - 1);

                if (isSting) {
                    ctx.shadowColor = 'rgba(253,224,71,0.85)';
                    ctx.shadowBlur = 14;
                }

                ctx.beginPath();
                ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
                ctx.fillStyle = this._rg(ctx, s.x, s.y, r, CONF.C.LIGHT, CONF.C.MID, CONF.C.DARK);
                ctx.fill();

                // Ferrão na ponta final
                if (isSting) {
                    ctx.shadowBlur = 0;
                    const prev = segs[i - 1];
                    const stingAngle = Math.atan2(s.y - prev.y, s.x - prev.x);

                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.rotate(stingAngle);
                    ctx.beginPath();
                    ctx.moveTo(r + 13, 0);
                    ctx.lineTo(-r, -4.5);
                    ctx.lineTo(-r, 4.5);
                    ctx.closePath();
                    ctx.fillStyle = CONF.C.LIGHT;
                    ctx.shadowColor = 'rgba(253,224,71,0.9)';
                    ctx.shadowBlur = 12;
                    ctx.fill();
                    ctx.restore();
                }
            }

            ctx.restore();
        },

        // ---- Cabeça com olhos e garras ----
        _desenharCabeca(ctx, head, angle, t) {
            const r = 14;
            ctx.save();
            ctx.translate(head.x, head.y);
            ctx.rotate(angle);

            // Brilho suave ao redor da cabeça
            ctx.shadowColor = 'rgba(251,191,36,0.32)';
            ctx.shadowBlur = 24;

            // Oval da cabeça
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.38, r, 0, 0, Math.PI * 2);
            ctx.fillStyle = this._rg(ctx, 0, 0, r * 1.38, CONF.C.LIGHT, CONF.C.MID, CONF.C.DARK);
            ctx.fill();
            ctx.strokeStyle = 'rgba(120,53,15,0.48)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Olhos
            for (const ey of [-r * 0.38, r * 0.38]) {
                ctx.beginPath();
                ctx.arc(r * 0.36, ey, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#0f172a';
                ctx.fill();
                // Reflexo de luz
                ctx.beginPath();
                ctx.arc(r * 0.36 + 1.1, ey - 1.1, 1.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.62)';
                ctx.fill();
            }

            // Garras / quelíceras
            const clawWiggle = Math.sin(t * 0.07) * 5;
            for (const side of [-1, 1]) {
                const bx = r * 1.22;
                const by = side * 5;
                const ex = bx + 14;
                const spread = side * (7 + clawWiggle * side);

                // Braço
                ctx.beginPath();
                ctx.moveTo(r * 0.9, side * 4);
                ctx.lineTo(bx, by);
                ctx.strokeStyle = 'rgba(217,119,6,0.92)';
                ctx.lineWidth = 3.5;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Pinça superior
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(ex, by + spread * 0.58);
                ctx.strokeStyle = CONF.C.AMBER;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Pinça inferior
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(ex - 3, by - spread * 0.38);
                ctx.strokeStyle = CONF.C.LIGHT;
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            ctx.restore();
        },
    };

    // =================================================================
    // EXPOSIÇÃO GLOBAL
    // =================================================================

    window.abrirJoguinhos = abrirJoguinhos;
    window.fecharJoguinhos = fecharJoguinhos;

})();
