// =====================================================================
// escorpiao.js — Jogo Escorpiao Standalone v1.0
// =====================================================================
// Extraido de SuperCartolaManagerv5 (participante-joguinhos.js)
// Canvas fullscreen, escorpiao segue o mouse com LERP
// 16 segmentos: 1 cabeca + 8 corpo (com patas) + 6 cauda (com ferrao)
// =====================================================================

(function () {
    'use strict';

    function _lerp(a, b, t) { return a + (b - a) * t; }

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

    const EscorpiaoGame = {
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

            // Botao fechar
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
            closeBtn.addEventListener('click', () => EscorpiaoGame.fechar());

            // Label instrucao
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
            label.textContent = 'Mova o mouse para guiar o escorpiao  |  ESC para sair';

            overlay.appendChild(canvas);
            overlay.appendChild(closeBtn);
            overlay.appendChild(label);
            document.body.appendChild(overlay);

            // Fade da instrucao depois de 3.5s
            setTimeout(() => { label.style.opacity = '0'; }, 3500);

            // Tracking de mouse e touch
            overlay.addEventListener('mousemove', (e) => {
                EscorpiaoGame.mouseX = e.clientX;
                EscorpiaoGame.mouseY = e.clientY;
            });
            overlay.addEventListener('touchmove', (e) => {
                e.preventDefault();
                EscorpiaoGame.mouseX = e.touches[0].clientX;
                EscorpiaoGame.mouseY = e.touches[0].clientY;
            }, { passive: false });

            // ESC fecha
            this._onKey = (e) => { if (e.key === 'Escape') EscorpiaoGame.fechar(); };
            document.addEventListener('keydown', this._onKey);

            // Redimensionamento
            this._onResize = () => {
                if (EscorpiaoGame.canvas) {
                    EscorpiaoGame.canvas.width = window.innerWidth;
                    EscorpiaoGame.canvas.height = window.innerHeight;
                }
            };
            window.addEventListener('resize', this._onResize);

            // Game loop
            const loop = () => {
                if (!EscorpiaoGame.ctx) return;
                EscorpiaoGame.frameCount++;
                EscorpiaoGame._atualizar();
                EscorpiaoGame._renderizar();
                EscorpiaoGame.animFrame = requestAnimationFrame(loop);
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

        // ---- Fisica: atualiza posicao da cadeia de segmentos ----
        _atualizar() {
            const segs = this.segs;

            // Cabeca acompanha o mouse com lerp
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

        // ---- Renderizacao ----
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

            // Angulo de direcao da cabeca
            const dx = segs[0].x - segs[1].x;
            const dy = segs[0].y - segs[1].y;
            const headAngle = Math.atan2(dy, dx);

            // Ordem de pintura: corpo -> cauda -> cabeca
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
                const prog = (i - 1) / (CONF.BODY_END - CONF.BODY_START - 1);
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

                // Patas (segmentos 1..8 tem par de patas)
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

        // ---- Cauda: segmentos 10..15 terminando no ferrao ----
        _desenharCauda(ctx, segs, t) {
            const total = segs.length;
            ctx.save();

            for (let i = CONF.TAIL_START; i < total; i++) {
                const s = segs[i];
                const prog = (i - CONF.TAIL_START) / (total - CONF.TAIL_START - 1);
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

                // Ferrao na ponta final
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

        // ---- Cabeca com olhos e garras ----
        _desenharCabeca(ctx, head, angle, t) {
            const r = 14;
            ctx.save();
            ctx.translate(head.x, head.y);
            ctx.rotate(angle);

            // Brilho suave ao redor da cabeca
            ctx.shadowColor = 'rgba(251,191,36,0.32)';
            ctx.shadowBlur = 24;

            // Oval da cabeca
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

            // Garras / queliceras
            const clawWiggle = Math.sin(t * 0.07) * 5;
            for (const side of [-1, 1]) {
                const bx = r * 1.22;
                const by = side * 5;
                const ex = bx + 14;
                const spread = side * (7 + clawWiggle * side);

                // Braco
                ctx.beginPath();
                ctx.moveTo(r * 0.9, side * 4);
                ctx.lineTo(bx, by);
                ctx.strokeStyle = 'rgba(217,119,6,0.92)';
                ctx.lineWidth = 3.5;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Pinca superior
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(ex, by + spread * 0.58);
                ctx.strokeStyle = CONF.C.AMBER;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Pinca inferior
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

    // Exposicao global
    window.EscorpiaoGame = EscorpiaoGame;

})();
