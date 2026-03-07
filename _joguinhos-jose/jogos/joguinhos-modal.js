// =====================================================================
// joguinhos-modal.js — Modal de Selecao de Jogos v1.0
// =====================================================================
// Extraido de SuperCartolaManagerv5 (participante-joguinhos.js)
// Modal overlay para escolher entre os joguinhos disponiveis.
// Depende de: penaltis.js e escorpiao.js carregados antes.
// =====================================================================

(function () {
    'use strict';

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

                <!-- Penaltis -->
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
                            Penaltis
                        </div>
                        <div style="color:rgba(255,255,255,0.72);font-size:0.73rem;line-height:1.4;">
                            Cobra ou defende — voce escolhe
                        </div>
                    </div>
                </button>

                <!-- Escorpiao -->
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
                            Escorpiao
                        </div>
                        <div style="color:rgba(255,255,255,0.72);font-size:0.73rem;line-height:1.4;">
                            Guie o escorpiao com o mouse
                        </div>
                    </div>
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#jog-btn-fechar').addEventListener('click', fecharJoguinhos);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharJoguinhos(); });

        // Penaltis
        const btnPen = overlay.querySelector('#jog-btn-penaltis');
        btnPen.addEventListener('click', () => {
            fecharJoguinhos();
            if (window.PenaltisGame) {
                // Cria container temporario se nao existir
                let container = document.getElementById('joguinhos-game-container');
                if (!container) {
                    container = document.createElement('div');
                    container.id = 'joguinhos-game-container';
                    container.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0f172a;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:20px;';

                    // Botao fechar no container
                    const closeBtn = document.createElement('button');
                    closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:50%;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;';
                    closeBtn.innerHTML = '<span class="material-icons" style="font-size:18px;">close</span>';
                    closeBtn.addEventListener('click', () => {
                        window.PenaltisGame.fechar();
                        container.remove();
                    });
                    container.appendChild(closeBtn);

                    // Inner container para o jogo
                    const inner = document.createElement('div');
                    inner.id = 'penaltis-inner';
                    inner.style.cssText = 'max-width:420px;width:100%;';
                    container.appendChild(inner);

                    document.body.appendChild(container);
                }
                window.PenaltisGame.abrir('penaltis-inner');
            }
        });
        btnPen.addEventListener('mouseenter', () => { btnPen.style.transform = 'scale(1.02)'; });
        btnPen.addEventListener('mouseleave', () => { btnPen.style.transform = ''; });

        // Escorpiao
        const btnEsc = overlay.querySelector('#jog-btn-escorpiao');
        btnEsc.addEventListener('click', () => {
            fecharJoguinhos();
            if (window.EscorpiaoGame) {
                window.EscorpiaoGame.abrir();
            }
        });
        btnEsc.addEventListener('mouseenter', () => { btnEsc.style.transform = 'scale(1.02)'; });
        btnEsc.addEventListener('mouseleave', () => { btnEsc.style.transform = ''; });
    }

    function fecharJoguinhos() {
        const el = document.getElementById('joguinhos-overlay');
        if (el) el.remove();
    }

    // Exposicao global
    window.abrirJoguinhos = abrirJoguinhos;
    window.fecharJoguinhos = fecharJoguinhos;

})();
