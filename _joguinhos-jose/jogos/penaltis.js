// =====================================================================
// penaltis.js — Jogo de Penaltis Standalone v1.0
// =====================================================================
// Extraido de SuperCartolaManagerv5 (manutencao-screen.js)
// Canvas 360x240, controles mouse/touch + teclado
// Modos: Cobrador (striker) e Goleiro (keeper)
// 4 niveis de dificuldade
// =====================================================================

(function () {
    'use strict';

    const PenaltisGame = {
        _gameMode: 'striker',
        _gameDifficulty: 'medium',
        _penaltyAnimFrame: null,
        _penaltyKeyHandler: null,
        _container: null,

        // ---- API publica ----

        /**
         * Abre o jogo de penaltis no container especificado.
         * @param {string|HTMLElement} containerEl - ID ou elemento DOM do container
         */
        abrir(containerEl) {
            if (typeof containerEl === 'string') {
                containerEl = document.getElementById(containerEl);
            }
            if (!containerEl) {
                console.error('[Penaltis] Container nao encontrado');
                return;
            }
            this._container = containerEl;
            this._container.style.display = 'block';
            this._mostrarSelecaoModo();
        },

        fechar() {
            this._fecharAnimacao();
            if (this._container) {
                this._container.style.display = 'none';
                this._container.innerHTML = '';
            }
        },

        // ---- Selecao de Modo ----

        _mostrarSelecaoModo() {
            if (!this._container) return;

            this._container.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <h3 style="font-family:'Russo One',sans-serif;font-size:1.1rem;color:#34d399;margin:0 0 8px;">
                        <span class="material-icons" style="vertical-align:middle;font-size:22px;">sports_soccer</span>
                        Jogo de Penaltis
                    </h3>
                    <p style="font-size:0.75rem;color:#9ca3af;margin:0;">
                        Escolha seu modo de jogo
                    </p>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px;max-width:320px;margin:0 auto;">
                    <button id="btnModoStriker" style="background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;padding:16px;border-radius:12px;font-family:'Russo One',sans-serif;font-size:0.95rem;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:10px;">
                        <span class="material-icons" style="font-size:24px;">sports_soccer</span>
                        <span>COBRAR PENALTIS</span>
                    </button>
                    <button id="btnModoKeeper" style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;padding:16px;border-radius:12px;font-family:'Russo One',sans-serif;font-size:0.95rem;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:10px;">
                        <span class="material-icons" style="font-size:24px;">sports_handball</span>
                        <span>SER GOLEIRO</span>
                    </button>
                </div>
            `;

            document.getElementById('btnModoStriker')?.addEventListener('click', () => {
                this._gameMode = 'striker';
                this._mostrarSelecaoDificuldade();
            });

            document.getElementById('btnModoKeeper')?.addEventListener('click', () => {
                this._gameMode = 'keeper';
                this._mostrarSelecaoDificuldade();
            });
        },

        // ---- Selecao de Dificuldade ----

        _mostrarSelecaoDificuldade() {
            if (!this._container) return;

            const modoTexto = this._gameMode === 'striker' ? 'Cobrar Penaltis' : 'Ser Goleiro';
            const modoIcon = this._gameMode === 'striker' ? 'sports_soccer' : 'sports_handball';

            this._container.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <h3 style="font-family:'Russo One',sans-serif;font-size:1.1rem;color:#34d399;margin:0 0 4px;">
                        <span class="material-icons" style="vertical-align:middle;font-size:22px;">${modoIcon}</span>
                        ${modoTexto}
                    </h3>
                    <p style="font-size:0.75rem;color:#9ca3af;margin:0;">
                        Escolha a dificuldade
                    </p>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;max-width:320px;margin:0 auto;">
                    <button class="btnDificuldade" data-diff="easy" style="background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;padding:14px;border-radius:10px;font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:space-between;">
                        <span><span class="material-icons" style="vertical-align:middle;font-size:16px;color:#86efac;">check_circle</span> FACIL</span>
                        <span style="font-size:0.7rem;opacity:0.8;">Goleiro lento</span>
                    </button>
                    <button class="btnDificuldade" data-diff="medium" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;padding:14px;border-radius:10px;font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:space-between;">
                        <span><span class="material-icons" style="vertical-align:middle;font-size:16px;color:#fde68a;">change_history</span> MEDIO</span>
                        <span style="font-size:0.7rem;opacity:0.8;">Goleiro padrao</span>
                    </button>
                    <button class="btnDificuldade" data-diff="hard" style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;padding:14px;border-radius:10px;font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:space-between;">
                        <span><span class="material-icons" style="vertical-align:middle;font-size:16px;color:#fdba74;">warning</span> DIFICIL</span>
                        <span style="font-size:0.7rem;opacity:0.8;">Goleiro rapido</span>
                    </button>
                    <button class="btnDificuldade" data-diff="veryhard" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border:none;padding:14px;border-radius:10px;font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:space-between;">
                        <span><span class="material-icons" style="vertical-align:middle;font-size:16px;color:#fca5a5;">error</span> MUITO DIFICIL</span>
                        <span style="font-size:0.7rem;opacity:0.8;">Goleiro expert</span>
                    </button>
                </div>
                <div style="text-align:center;margin-top:16px;">
                    <button id="btnVoltarModo"
                        style="background:none;border:none;color:#6b7280;font-size:0.75rem;cursor:pointer;font-family:'Inter',sans-serif;text-decoration:underline;">
                        <span class="material-icons" style="vertical-align:middle;font-size:14px;">arrow_back</span> Voltar
                    </button>
                </div>
            `;

            document.getElementById('btnVoltarModo')?.addEventListener('click', () => {
                this._mostrarSelecaoModo();
            });

            this._container.querySelectorAll('.btnDificuldade').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._gameDifficulty = btn.dataset.diff;
                    this._iniciarJogo();
                });
                btn.addEventListener('mouseenter', () => {
                    btn.style.transform = 'translateY(-2px)';
                    btn.style.boxShadow = '0 4px 12px rgba(255,255,255,0.15)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.transform = 'translateY(0)';
                    btn.style.boxShadow = 'none';
                });
            });
        },

        // ---- Fechar animacao ----

        _fecharAnimacao() {
            if (this._penaltyAnimFrame) {
                cancelAnimationFrame(this._penaltyAnimFrame);
                this._penaltyAnimFrame = null;
            }
            if (this._penaltyKeyHandler) {
                document.removeEventListener('keydown', this._penaltyKeyHandler);
                this._penaltyKeyHandler = null;
            }
        },

        // ---- Game Loop Principal ----

        _iniciarJogo() {
            if (!this._container) return;

            const modoTexto = this._gameMode === 'striker' ? 'Cobrar Penaltis' : 'Defender Penaltis';
            const modoIcon = this._gameMode === 'striker' ? 'sports_soccer' : 'sports_handball';
            const diffTexto = { easy: 'Facil', medium: 'Medio', hard: 'Dificil', veryhard: 'Muito Dificil' };

            this._container.innerHTML = `
                <div style="text-align:center;margin-bottom:12px;">
                    <h3 style="font-family:'Russo One',sans-serif;font-size:1rem;color:#34d399;margin:0 0 4px;">
                        <span class="material-icons" style="vertical-align:middle;font-size:20px;">${modoIcon}</span>
                        ${modoTexto}
                    </h3>
                    <p style="font-size:0.7rem;color:#9ca3af;margin:0;">
                        ${diffTexto[this._gameDifficulty]} | ${this._gameMode === 'striker' ? 'Clique na zona do gol' : 'Defenda o penalti!'}
                    </p>
                </div>
                <canvas id="penaltyCanvas" width="360" height="240"
                    style="display:block;margin:0 auto;background:#0f172a;border-radius:12px;border:1px solid #374151;max-width:100%;touch-action:none;"></canvas>
                <div id="penaltyScore" style="text-align:center;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:#fbbf24;">
                    ${this._gameMode === 'striker' ? 'Gols: 0' : 'Defesas: 0'} | ${this._gameMode === 'striker' ? 'Cobranca' : 'Penalti'} 1
                </div>
                <div style="text-align:center;margin-top:6px;font-size:0.68rem;color:#6b7280;font-family:'Inter',sans-serif;">
                    <span class="material-icons" style="vertical-align:middle;font-size:14px;">lightbulb</span>
                    Use teclado: Q/W/E (altura) + A/S/D (canto) ou clique no gol
                </div>
                <div style="text-align:center;margin-top:6px;">
                    <button id="btnVoltarDificuldade"
                        style="background:none;border:none;color:#6b7280;font-size:0.75rem;cursor:pointer;font-family:'Inter',sans-serif;text-decoration:underline;">
                        <span class="material-icons" style="vertical-align:middle;font-size:14px;">arrow_back</span> Voltar
                    </button>
                </div>
            `;

            document.getElementById('btnVoltarDificuldade')?.addEventListener('click', () => {
                this._fecharAnimacao();
                this._mostrarSelecaoDificuldade();
            });

            const canvas = document.getElementById('penaltyCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            this._fecharAnimacao();

            const W = canvas.width;
            const H = canvas.height;

            // Layout
            const goalTop = 32;
            const goalH = 75;
            const goalW = 240;
            const goalL = (W - goalW) / 2;
            const goalR = goalL + goalW;
            const goalB = goalTop + goalH;
            const grassY = goalB + 4;
            const zoneW = goalW / 3;
            const zoneH = goalH / 3;

            // Ball
            const ballStartX = W / 2;
            const ballStartY = H - 30;
            const ballR = 7;

            // Keeper
            const kW = 28;
            const kH = 38;
            const kBaseY = goalB - kH - 2;
            const kBaseX = W / 2 - kW / 2;

            // Difficulty settings
            const difficultySettings = {
                easy: { baseAccuracy: 0.15, maxAccuracy: 0.35, saveChance: 0.45 },
                medium: { baseAccuracy: 0.30, maxAccuracy: 0.55, saveChance: 0.60 },
                hard: { baseAccuracy: 0.50, maxAccuracy: 0.75, saveChance: 0.75 },
                veryhard: { baseAccuracy: 0.70, maxAccuracy: 0.90, saveChance: 0.85 }
            };

            const currentDiff = difficultySettings[this._gameDifficulty || 'medium'];

            // State
            let state = 'aiming';
            let gols = 0;
            let cobradas = 0;
            let defesas = 0;
            const totalCobradas = 5;
            let resultado = '';
            let resultTimer = 0;
            let chosenZone = -1;
            let chosenHeight = -1;
            let chosenSide = -1;
            let keeperZone = -1;
            let hoverZone = -1;
            let ballAnim = { sx: 0, sy: 0, tx: 0, ty: 0, p: 0, height: 1 };
            let keeperAnim = { sx: 0, sy: 0, tx: 0, ty: 0, p: 0 };
            let keeperX = kBaseX;
            let keeperY = kBaseY;
            let frame = 0;

            const gameMode = this._gameMode || 'striker';

            const getAccuracy = () => {
                const progress = cobradas / totalCobradas;
                return currentDiff.baseAccuracy + (currentDiff.maxAccuracy - currentDiff.baseAccuracy) * progress;
            };

            const zoneToCoords = (zone) => {
                const row = Math.floor(zone / 3);
                const col = zone % 3;
                const x = goalL + col * zoneW + zoneW / 2;
                const y = goalB - row * zoneH - zoneH / 2;
                return { x, y, row, col };
            };

            const shoot = (zone) => {
                if (state !== 'aiming') return;
                chosenZone = zone;
                const coords = zoneToCoords(zone);
                chosenHeight = coords.row;
                chosenSide = coords.col;

                // Keeper AI
                if (Math.random() < getAccuracy()) {
                    keeperZone = chosenZone;
                } else {
                    const allZones = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                    const opts = allZones.filter(z => z !== chosenZone);
                    keeperZone = opts[Math.floor(Math.random() * opts.length)];
                }

                ballAnim = { sx: ballStartX, sy: ballStartY, tx: coords.x, ty: coords.y, p: 0, height: coords.row };

                const kCoords = zoneToCoords(keeperZone);
                const kTargetX = kCoords.x - kW / 2;
                const kTargetY = kCoords.row === 2 ? kBaseY - 15 : (kCoords.row === 1 ? kBaseY - 5 : kBaseY + 5);
                keeperAnim = { sx: keeperX, sy: keeperY, tx: kTargetX, ty: kTargetY, p: 0 };

                state = 'shooting';
            };

            const aiShoot = () => {
                if (state !== 'aiming') return;

                const allZones = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                let preferredZones = allZones;
                if (this._gameDifficulty === 'hard' || this._gameDifficulty === 'veryhard') {
                    preferredZones = allZones.filter(z => z !== 4);
                }

                chosenZone = preferredZones[Math.floor(Math.random() * preferredZones.length)];
                const coords = zoneToCoords(chosenZone);
                chosenHeight = coords.row;
                chosenSide = coords.col;

                ballAnim = { sx: ballStartX, sy: ballStartY, tx: coords.x, ty: coords.y, p: 0, height: coords.row };
                keeperZone = -1;
                state = 'ai_shooting';
            };

            const defend = (zone) => {
                if (state !== 'ai_shooting') return;
                keeperZone = zone;
                const kCoords = zoneToCoords(zone);
                const kTargetX = kCoords.x - kW / 2;
                const kTargetY = kCoords.row === 2 ? kBaseY - 15 : (kCoords.row === 1 ? kBaseY - 5 : kBaseY + 5);
                keeperAnim = { sx: keeperX, sy: keeperY, tx: kTargetX, ty: kTargetY, p: 0 };
                state = 'defending';
            };

            // Input
            const getCanvasPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const sx = W / rect.width;
                const sy = H / rect.height;
                const cx = e.clientX || e.touches?.[0]?.clientX || 0;
                const cy = e.clientY || e.touches?.[0]?.clientY || 0;
                return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
            };

            const handleClick = (e) => {
                const pos = getCanvasPos(e);

                if (state === 'gameover') {
                    this._mostrarSelecaoDificuldade();
                    return;
                }
                if (state === 'result') {
                    state = 'aiming';
                    keeperX = kBaseX;
                    keeperY = kBaseY;
                    hoverZone = -1;
                    if (gameMode === 'keeper') {
                        setTimeout(() => { if (state === 'aiming') aiShoot(); }, 800);
                    }
                    return;
                }

                if (pos.y >= goalTop && pos.y <= goalB && pos.x >= goalL && pos.x <= goalR) {
                    const col = Math.min(2, Math.max(0, Math.floor((pos.x - goalL) / zoneW)));
                    const row = Math.min(2, Math.max(0, Math.floor((goalB - pos.y) / zoneH)));
                    const zone = row * 3 + col;

                    if (gameMode === 'striker' && state === 'aiming') {
                        shoot(zone);
                    } else if (gameMode === 'keeper' && state === 'ai_shooting') {
                        defend(zone);
                    }
                }
            };

            canvas.addEventListener('click', handleClick);
            canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); });
            canvas.addEventListener('mousemove', (e) => {
                if ((gameMode === 'striker' && state !== 'aiming') || (gameMode === 'keeper' && state !== 'ai_shooting')) {
                    hoverZone = -1;
                    return;
                }
                const pos = getCanvasPos(e);
                if (pos.y >= goalTop && pos.y <= goalB && pos.x >= goalL && pos.x <= goalR) {
                    const col = Math.min(2, Math.max(0, Math.floor((pos.x - goalL) / zoneW)));
                    const row = Math.min(2, Math.max(0, Math.floor((goalB - pos.y) / zoneH)));
                    hoverZone = row * 3 + col;
                } else { hoverZone = -1; }
            });

            const keyHandler = (e) => {
                const keyMap = {
                    'q': 6, 'w': 7, 'e': 8,
                    'a': 3, 's': 4, 'd': 5,
                    'z': 0, 'x': 1, 'c': 2
                };

                if (gameMode === 'striker' && state === 'aiming') {
                    if (keyMap[e.key.toLowerCase()] !== undefined) {
                        e.preventDefault();
                        shoot(keyMap[e.key.toLowerCase()]);
                    }
                } else if (gameMode === 'keeper' && state === 'ai_shooting') {
                    if (keyMap[e.key.toLowerCase()] !== undefined) {
                        e.preventDefault();
                        defend(keyMap[e.key.toLowerCase()]);
                    }
                } else if (state === 'result' || state === 'gameover') {
                    if (e.code === 'Space' || e.key === ' ') {
                        e.preventDefault();
                        if (state === 'gameover') {
                            this._mostrarSelecaoDificuldade();
                        } else {
                            state = 'aiming';
                            keeperX = kBaseX;
                            keeperY = kBaseY;
                            hoverZone = -1;
                            if (gameMode === 'keeper') {
                                setTimeout(() => { if (state === 'aiming') aiShoot(); }, 800);
                            }
                        }
                    }
                }
            };
            document.addEventListener('keydown', keyHandler);
            this._penaltyKeyHandler = keyHandler;

            // Draw helpers
            const px = (x, y, w, h, c) => {
                ctx.fillStyle = c;
                ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
            };

            const drawGoal = () => {
                // Grass
                px(0, grassY, W, H - grassY, '#166534');
                ctx.fillStyle = '#15803d';
                for (let i = 0; i < W; i += 18) px(i, grassY + 4, 9, H - grassY - 4, '#15803d');

                // Penalty spot
                ctx.fillStyle = '#e5e7eb';
                ctx.beginPath();
                ctx.arc(W / 2, ballStartY + 12, 2, 0, Math.PI * 2);
                ctx.fill();

                // Net background
                px(goalL, goalTop, goalW, goalH, '#1e293b');

                // Net mesh
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 0.7;
                for (let x = goalL; x <= goalR; x += 12) {
                    ctx.beginPath(); ctx.moveTo(x, goalTop); ctx.lineTo(x, goalB); ctx.stroke();
                }
                for (let y = goalTop; y <= goalB; y += 10) {
                    ctx.beginPath(); ctx.moveTo(goalL, y); ctx.lineTo(goalR, y); ctx.stroke();
                }

                // Zone highlights
                if (state === 'aiming') {
                    for (let i = 0; i < 3; i++) {
                        const zx = goalL + i * zoneW;
                        if (hoverZone === i) {
                            px(zx + 1, goalTop + 1, zoneW - 2, goalH - 2, 'rgba(251,191,36,0.25)');
                        }
                        if (i > 0) {
                            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                            ctx.setLineDash([3, 3]);
                            ctx.beginPath(); ctx.moveTo(zx, goalTop); ctx.lineTo(zx, goalB); ctx.stroke();
                            ctx.setLineDash([]);
                        }
                    }
                }

                // Posts
                px(goalL - 4, goalTop - 4, goalW + 8, 5, '#e5e7eb');
                px(goalL - 4, goalTop, 5, goalH + 2, '#e5e7eb');
                px(goalR - 1, goalTop, 5, goalH + 2, '#e5e7eb');
            };

            const drawKeeper = (x, y, diving) => {
                const diveDir = keeperZone === 0 ? -1 : keeperZone === 2 ? 1 : 0;
                const dp = diving ? Math.min(keeperAnim.p * 2, 1) : 0;

                // Jersey (orange)
                px(x + 6, y + 10, 16, 14, '#fb923c');
                // Head
                px(x + 8, y + 1, 12, 10, '#fcd34d');
                // Hair
                px(x + 8, y, 12, 3, '#92400e');

                if (diving && diveDir !== 0) {
                    const armX = diveDir < 0 ? x - 10 * dp : x + kW - 2;
                    const armW = 12 * dp;
                    px(armX, y + 8, armW, 5, '#fb923c');
                    const gloveX = diveDir < 0 ? armX - 4 : armX + armW;
                    px(gloveX, y + 6, 5, 7, '#4ade80');
                } else {
                    px(x + 1, y + 4, 5, 14, '#fb923c');
                    px(x + kW - 6, y + 4, 5, 14, '#fb923c');
                    px(x - 1, y + 1, 5, 6, '#4ade80');
                    px(x + kW - 4, y + 1, 5, 6, '#4ade80');
                }

                // Shorts
                px(x + 6, y + 24, 16, 6, '#111827');
                // Legs
                px(x + 7, y + 30, 5, 7, '#fcd34d');
                px(x + 16, y + 30, 5, 7, '#fcd34d');
                // Boots
                px(x + 6, y + 36, 7, 3, '#111827');
                px(x + 15, y + 36, 7, 3, '#111827');
            };

            const drawBall = (x, y, r) => {
                ctx.fillStyle = '#f5f5f5';
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#6b7280';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = '#374151';
                ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
            };

            // Keeper mode: AI starts shooting after delay
            if (gameMode === 'keeper') {
                setTimeout(() => { if (state === 'aiming') aiShoot(); }, 1200);
            }

            // Game loop
            const loop = () => {
                frame++;
                ctx.clearRect(0, 0, W, H);

                // Sky
                px(0, 0, W, H, '#0f172a');

                // Stadium lights
                px(15, 3, 4, 4, '#fbbf24'); px(W - 19, 3, 4, 4, '#fbbf24');
                px(12, 0, 10, 10, 'rgba(251,191,36,0.06)');
                px(W - 22, 0, 10, 10, 'rgba(251,191,36,0.06)');

                // Crowd (pixel dots)
                for (let i = 0; i < W; i += 6) {
                    const crowdH = 8 + Math.sin(i * 0.5 + frame * 0.03) * 2;
                    px(i, goalTop - 12 + (i % 3), 4, crowdH, i % 12 < 6 ? '#1e293b' : '#334155');
                }

                drawGoal();

                // Keeper
                if (state === 'shooting' || state === 'defending' || state === 'result') {
                    keeperAnim.p = Math.min(1, keeperAnim.p + 0.07);
                    const kx = keeperAnim.sx + (keeperAnim.tx - keeperAnim.sx) * keeperAnim.p;
                    drawKeeper(kx, kBaseY, keeperAnim.p > 0.2);
                } else if (state === 'aiming' || state === 'ai_shooting') {
                    const sway = Math.sin(frame * 0.05) * 3;
                    drawKeeper(kBaseX + sway, kBaseY, false);
                }

                // Ball
                if (state === 'aiming') {
                    drawBall(ballStartX, ballStartY, ballR);

                    ctx.fillStyle = '#fbbf24';
                    ctx.font = "bold 11px 'Russo One', sans-serif";
                    ctx.textAlign = 'center';
                    ctx.fillText('ESCOLHA O CANTO!', W / 2, H - 8);

                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.font = "10px 'Inter', sans-serif";
                    ctx.fillText('<', goalL + zoneW * 0.5, goalB + 14);
                    ctx.fillText('^', goalL + zoneW * 1.5, goalB + 14);
                    ctx.fillText('>', goalL + zoneW * 2.5, goalB + 14);
                } else if (state === 'ai_shooting') {
                    // Ball animating toward goal (AI shooting)
                    ballAnim.p = Math.min(1, ballAnim.p + 0.045);
                    const bx = ballAnim.sx + (ballAnim.tx - ballAnim.sx) * ballAnim.p;
                    const arc = Math.sin(ballAnim.p * Math.PI) * 30;
                    const by = ballAnim.sy + (ballAnim.ty - ballAnim.sy) * ballAnim.p - arc;
                    const br = ballR * (1 - ballAnim.p * 0.35);
                    drawBall(bx, by, br);

                    ctx.fillStyle = '#fbbf24';
                    ctx.font = "bold 11px 'Russo One', sans-serif";
                    ctx.textAlign = 'center';
                    ctx.fillText('DEFENDA! Clique no canto!', W / 2, H - 8);
                } else if (state === 'shooting' || state === 'defending') {
                    ballAnim.p = Math.min(1, ballAnim.p + 0.055);
                    const bx = ballAnim.sx + (ballAnim.tx - ballAnim.sx) * ballAnim.p;
                    const arc = Math.sin(ballAnim.p * Math.PI) * 30;
                    const by = ballAnim.sy + (ballAnim.ty - ballAnim.sy) * ballAnim.p - arc;
                    const br = ballR * (1 - ballAnim.p * 0.35);

                    drawBall(bx, by, br);

                    if (ballAnim.p >= 1) {
                        cobradas++;
                        if (gameMode === 'striker') {
                            if (chosenZone === keeperZone && Math.random() < 0.65) {
                                resultado = 'DEFESA!';
                                defesas++;
                            } else {
                                resultado = 'GOOOL!';
                                gols++;
                            }
                        } else {
                            // Keeper mode
                            if (chosenZone === keeperZone && Math.random() < currentDiff.saveChance) {
                                resultado = 'DEFESA!';
                                defesas++;
                            } else {
                                resultado = 'GOL DO ADVERSARIO!';
                            }
                        }
                        resultTimer = 0;
                        state = cobradas >= totalCobradas ? 'gameover' : 'result';
                    }
                }

                // Result flash
                if (state === 'result') {
                    resultTimer++;
                    const isGol = resultado === 'GOOOL!' || resultado === 'DEFESA!';
                    const flash = Math.sin(resultTimer * 0.15) * 0.15 + 0.15;
                    px(0, 0, W, H, isGol ? `rgba(34,197,94,${flash})` : `rgba(239,68,68,${flash})`);

                    drawBall(ballAnim.tx, ballAnim.ty, ballR * 0.65);

                    ctx.fillStyle = isGol ? '#86efac' : '#ef4444';
                    ctx.font = "bold 26px 'Russo One', sans-serif";
                    ctx.textAlign = 'center';
                    ctx.fillText(resultado, W / 2, H / 2 + 30);

                    ctx.fillStyle = '#9ca3af';
                    ctx.font = "11px 'Inter', sans-serif";
                    ctx.fillText('Toque para continuar', W / 2, H / 2 + 50);
                }

                // Game over
                if (state === 'gameover') {
                    px(0, 0, W, H, 'rgba(0,0,0,0.75)');

                    let rating, ratingColor;
                    const score = gameMode === 'striker' ? gols : defesas;
                    if (score === 5) { rating = 'CRAQUE!'; ratingColor = '#fbbf24'; }
                    else if (score === 4) { rating = 'Muito bom!'; ratingColor = '#86efac'; }
                    else if (score === 3) { rating = 'Bom!'; ratingColor = '#34d399'; }
                    else if (score === 2) { rating = 'Precisa treinar...'; ratingColor = '#fbbf24'; }
                    else if (score === 1) { rating = 'Perna de pau!'; ratingColor = '#fca5a5'; }
                    else { rating = 'Caneleiro!'; ratingColor = '#ef4444'; }

                    ctx.fillStyle = '#34d399';
                    ctx.font = "bold 20px 'Russo One', sans-serif";
                    ctx.textAlign = 'center';
                    ctx.fillText('FIM DE JOGO', W / 2, H / 2 - 25);

                    ctx.fillStyle = '#fbbf24';
                    ctx.font = "bold 28px 'JetBrains Mono', monospace";
                    ctx.fillText(`${score} / ${totalCobradas}`, W / 2, H / 2 + 8);

                    ctx.fillStyle = ratingColor;
                    ctx.font = "bold 14px 'Russo One', sans-serif";
                    ctx.fillText(rating, W / 2, H / 2 + 30);

                    ctx.fillStyle = '#9ca3af';
                    ctx.font = "11px 'Inter', sans-serif";
                    ctx.fillText('Toque para jogar novamente', W / 2, H / 2 + 52);
                }

                // HUD
                if (state !== 'gameover') {
                    px(0, 0, W, 18, 'rgba(0,0,0,0.6)');
                    ctx.font = "bold 10px 'JetBrains Mono', monospace";
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#86efac';
                    ctx.fillText(`Gols: ${gols}`, 8, 13);

                    // Round dots
                    ctx.textAlign = 'center';
                    const dotStartX = W / 2 - (totalCobradas * 14) / 2;
                    for (let i = 0; i < totalCobradas; i++) {
                        const dx = dotStartX + i * 14 + 7;
                        ctx.beginPath();
                        ctx.arc(dx, 10, 4, 0, Math.PI * 2);
                        if (i < cobradas) {
                            ctx.fillStyle = '#e5e7eb';
                            ctx.fill();
                        } else {
                            ctx.strokeStyle = '#6b7280';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    }

                    ctx.fillStyle = '#ef4444';
                    ctx.textAlign = 'right';
                    ctx.font = "bold 10px 'JetBrains Mono', monospace";
                    ctx.fillText(`Def: ${defesas}`, W - 8, 13);
                }

                // Score div
                const scoreEl = document.getElementById('penaltyScore');
                if (scoreEl) {
                    const atual = cobradas + (state === 'aiming' ? 1 : 0);
                    if (gameMode === 'striker') {
                        scoreEl.textContent = state === 'gameover'
                            ? `${gols} de ${totalCobradas} gols`
                            : `Gols: ${gols} | Cobranca ${atual} de ${totalCobradas}`;
                    } else {
                        scoreEl.textContent = state === 'gameover'
                            ? `${defesas} defesas em ${totalCobradas} penaltis`
                            : `Defesas: ${defesas} | Penalti ${atual} de ${totalCobradas}`;
                    }
                }

                this._penaltyAnimFrame = requestAnimationFrame(loop);
            };

            this._penaltyAnimFrame = requestAnimationFrame(loop);
        },
    };

    // Exposicao global
    window.PenaltisGame = PenaltisGame;

})();
