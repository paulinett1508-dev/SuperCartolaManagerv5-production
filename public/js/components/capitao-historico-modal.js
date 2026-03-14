// =============================================
// COMPONENTE: Modal de Histórico de Capitães
// Reutilizável em Admin e App
// v2.0: Redesign — Turnos agrupados, sem coluna STATUS
//       Resumo compacto (3 métricas + melhor/pior highlight)
// =============================================

// Fallback: garante escapeHtml disponível mesmo se escape-html.js não carregou antes
const _escapeHtml = (typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : function(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, function(ch) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
        });
    };

const CapitaoHistoricoModal = {
    /**
     * Renderiza modal com histórico completo de um participante
     * v2.0: Agrupado por turnos, layout mais sintético
     */
    abrir(participante) {
        // Criar/atualizar container do modal
        let modalContainer = document.getElementById('capitaoHistoricoModalContainer');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'capitaoHistoricoModalContainer';
            document.body.appendChild(modalContainer);
        }

        const historico = participante.historico_rodadas || [];
        const nomeCartola = participante.nome_cartola || 'Participante';
        const nomeTime = participante.nome_time || '';
        const pontuacaoTotal = (Math.trunc((participante.pontuacao_total || 0) * 100) / 100).toFixed(2);
        const mediaCapitao = (Math.trunc((participante.media_capitao || 0) * 100) / 100).toFixed(2);
        const rodadasJogadas = historico.length;

        // Melhor/Pior highlight cards
        const melhor = participante.melhor_capitao;
        const pior = participante.pior_capitao;

        let highlightsHtml = '';
        if (melhor || pior) {
            highlightsHtml = '<div class="modal-highlights-capitao">';
            if (melhor) {
                const melhorPts = (Math.trunc((melhor.pontuacao || 0) * 100) / 100).toFixed(2);
                highlightsHtml += `
                    <div class="highlight-card highlight-melhor">
                        <span class="material-icons" style="font-size: 16px;">arrow_upward</span>
                        <div class="highlight-info">
                            <span class="highlight-label">Melhor</span>
                            <span class="highlight-detail">${_escapeHtml(melhor.atleta_nome || '---')} (R${melhor.rodada})</span>
                        </div>
                        <span class="highlight-pts">${melhorPts}</span>
                    </div>`;
            }
            if (pior) {
                const piorPts = (Math.trunc((pior.pontuacao || 0) * 100) / 100).toFixed(2);
                highlightsHtml += `
                    <div class="highlight-card highlight-pior">
                        <span class="material-icons" style="font-size: 16px;">arrow_downward</span>
                        <div class="highlight-info">
                            <span class="highlight-label">Pior</span>
                            <span class="highlight-detail">${_escapeHtml(pior.atleta_nome || '---')} (R${pior.rodada})</span>
                        </div>
                        <span class="highlight-pts">${piorPts}</span>
                    </div>`;
            }
            highlightsHtml += '</div>';
        }

        // Gerar turnos agrupados via TurnoGroup (se disponível) ou fallback
        let turnosHtml = '';
        if (window.TurnoGroup) {
            turnosHtml = window.TurnoGroup.renderizar(historico, {
                campoValor: 'pontuacao',
                idPrefix: 'cap-hist-turno',
                moduleCssClass: 'capitao',
                renderRow: function(r, index) {
                    const pontosNum = Math.trunc((r.pontuacao || 0) * 100) / 100;
                    const pts = pontosNum.toFixed(2);
                    const isParcial = r.parcial === true;

                    // Cor de pontuação
                    let corPontuacao = 'var(--app-text-muted, #999)';
                    if (pontosNum >= 15) corPontuacao = 'var(--app-success-light, #22c55e)';
                    else if (pontosNum >= 10) corPontuacao = 'var(--app-success, #10b981)';
                    else if (pontosNum >= 5) corPontuacao = 'var(--app-warning, #eab308)';
                    else if (pontosNum < 0) corPontuacao = 'var(--app-danger, #ef4444)';

                    // Status badge apenas para parciais (rodada atual)
                    let statusBadge = '';
                    if (isParcial) {
                        if (r.jogou === false) {
                            statusBadge = '<span class="cap-modal-badge cap-modal-badge-pendente"><span class="material-icons" style="font-size: 12px;">schedule</span></span>';
                        } else {
                            statusBadge = '<span class="cap-modal-badge cap-modal-badge-live"><span class="material-icons" style="font-size: 12px;">circle</span></span>';
                        }
                    }

                    return `
                        <div class="cap-modal-row ${index % 2 === 0 ? 'cap-modal-row-alt' : ''}">
                            <span class="cap-modal-rod">R${r.rodada}</span>
                            <span class="cap-modal-atleta">${_escapeHtml(r.atleta_nome || 'N/A')}</span>
                            <span class="cap-modal-pts" style="color: ${corPontuacao};">${pts}</span>
                            ${statusBadge}
                        </div>`;
                }
            });
        } else {
            // Fallback: lista simples se TurnoGroup não carregou
            const sorted = [...historico].sort((a, b) => a.rodada - b.rodada);
            turnosHtml = '<div style="padding: 12px;">';
            sorted.forEach(r => {
                const pts = (Math.trunc((r.pontuacao || 0) * 100) / 100).toFixed(2);
                turnosHtml += `<div class="cap-modal-row">
                    <span class="cap-modal-rod">R${r.rodada}</span>
                    <span class="cap-modal-atleta">${_escapeHtml(r.atleta_nome || 'N/A')}</span>
                    <span class="cap-modal-pts">${pts}</span>
                </div>`;
            });
            turnosHtml += '</div>';
        }

        // Template do modal
        modalContainer.innerHTML = `
            <div class="capitao-historico-modal-overlay" onclick="CapitaoHistoricoModal.fechar()">
                <div class="capitao-historico-modal-content" onclick="event.stopPropagation()">
                    <!-- Header -->
                    <div class="modal-header-capitao">
                        <div class="modal-header-info">
                            <h2 class="modal-title-capitao">
                                <span class="material-icons" style="vertical-align: middle; margin-right: 8px;">military_tech</span>
                                Histórico de Capitães
                            </h2>
                            <p class="modal-subtitle-capitao">${_escapeHtml(nomeCartola)}${nomeTime ? ` - ${_escapeHtml(nomeTime)}` : ''}</p>
                        </div>
                        <button class="modal-close-btn" onclick="CapitaoHistoricoModal.fechar()" aria-label="Fechar">
                            <span class="material-icons">close</span>
                        </button>
                    </div>

                    <!-- Resumo compacto (3 métricas) -->
                    <div class="modal-resumo-capitao">
                        <div class="resumo-item">
                            <span class="resumo-label">Pontos</span>
                            <span class="resumo-valor" style="color: var(--capitao-primary, #8b5cf6);">${pontuacaoTotal}</span>
                        </div>
                        <div class="resumo-item">
                            <span class="resumo-label">Média</span>
                            <span class="resumo-valor" style="color: var(--capitao-primary-light, #a78bfa);">${mediaCapitao}</span>
                        </div>
                        <div class="resumo-item">
                            <span class="resumo-label">Rodadas</span>
                            <span class="resumo-valor">${rodadasJogadas}</span>
                        </div>
                    </div>

                    <!-- Highlights: Melhor/Pior -->
                    ${highlightsHtml}

                    <!-- Turnos agrupados -->
                    <div class="modal-turnos-container">
                        ${turnosHtml || '<p style="text-align: center; padding: 40px; color: var(--app-text-muted, #666);">Sem dados disponíveis</p>'}
                    </div>

                    <!-- Footer -->
                    <div class="modal-footer-capitao">
                        <button class="btn-modal-fechar" onclick="CapitaoHistoricoModal.fechar()">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Adicionar estilos (inline para garantir funcionamento)
        this._adicionarEstilos();

        // Animar entrada
        requestAnimationFrame(() => {
            modalContainer.querySelector('.capitao-historico-modal-overlay').classList.add('show');
        });
    },

    /**
     * Fecha o modal
     */
    fechar() {
        const modalContainer = document.getElementById('capitaoHistoricoModalContainer');
        if (!modalContainer) return;

        const overlay = modalContainer.querySelector('.capitao-historico-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                modalContainer.innerHTML = '';
            }, 300); // Esperar animação
        }
    },

    /**
     * Adiciona estilos do modal (caso ainda não existam)
     */
    _adicionarEstilos() {
        if (document.getElementById('capitaoHistoricoModalStyles')) return;

        const style = document.createElement('style');
        style.id = 'capitaoHistoricoModalStyles';
        style.textContent = `
            /* Modal Overlay */
            .capitao-historico-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.85);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .capitao-historico-modal-overlay.show {
                opacity: 1;
            }

            /* Modal Content */
            .capitao-historico-modal-content {
                background: var(--app-surface, #1a1a1a);
                border-radius: 16px;
                width: 100%;
                max-width: 600px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(139, 92, 246, 0.2);
            }

            /* Header */
            .modal-header-capitao {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
            }

            .modal-header-info { flex: 1; }

            .modal-title-capitao {
                font-family: 'Russo One', sans-serif;
                font-size: 18px;
                color: #fff;
                margin: 0 0 4px 0;
                display: flex;
                align-items: center;
            }

            .modal-subtitle-capitao {
                font-size: 13px;
                color: var(--app-text-muted, #9ca3af);
                margin: 0;
            }

            .modal-close-btn {
                background: transparent;
                border: none;
                color: var(--app-text-muted, #9ca3af);
                cursor: pointer;
                padding: 8px;
                border-radius: 8px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .modal-close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }

            /* Resumo compacto */
            .modal-resumo-capitao {
                display: flex;
                gap: 16px;
                padding: 16px 20px;
                background: rgba(0, 0, 0, 0.2);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                justify-content: center;
            }

            .resumo-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }

            .resumo-label {
                font-size: 10px;
                color: var(--app-text-muted, #9ca3af);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
            }

            .resumo-valor {
                font-family: 'JetBrains Mono', monospace;
                font-size: 16px;
                font-weight: 700;
                color: #fff;
            }

            /* Highlights Melhor/Pior */
            .modal-highlights-capitao {
                display: flex;
                gap: 8px;
                padding: 10px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .highlight-card {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
            }

            .highlight-melhor {
                border-color: rgba(34, 197, 94, 0.2);
                color: var(--app-success-light, #22c55e);
            }

            .highlight-pior {
                border-color: rgba(239, 68, 68, 0.2);
                color: var(--app-danger, #ef4444);
            }

            .highlight-info {
                flex: 1;
                min-width: 0;
            }

            .highlight-label {
                display: block;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
                opacity: 0.8;
            }

            .highlight-detail {
                display: block;
                font-size: 11px;
                color: var(--app-text-primary, #e5e7eb);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .highlight-pts {
                font-family: 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 700;
                flex-shrink: 0;
            }

            /* Turnos container */
            .modal-turnos-container {
                flex: 1;
                overflow-y: auto;
                padding: 12px 20px;
            }

            /* Rows dentro do turno expandido */
            .cap-modal-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 6px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            }

            .cap-modal-row-alt {
                background: rgba(0, 0, 0, 0.1);
                border-radius: 4px;
            }

            .cap-modal-rod {
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                font-weight: 600;
                color: var(--app-purple, #8b5cf6);
                min-width: 30px;
            }

            .cap-modal-atleta {
                flex: 1;
                font-size: 12px;
                color: var(--app-text-primary, #e5e7eb);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .cap-modal-pts {
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                font-weight: 700;
                min-width: 50px;
                text-align: right;
            }

            .cap-modal-badge {
                display: inline-flex;
                align-items: center;
                flex-shrink: 0;
            }

            .cap-modal-badge-pendente { color: var(--app-warning, #eab308); }
            .cap-modal-badge-live { color: var(--app-danger, #ef4444); }

            /* Footer */
            .modal-footer-capitao {
                padding: 16px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: flex-end;
            }

            .btn-modal-fechar {
                background: rgba(139, 92, 246, 0.2);
                color: #a78bfa;
                border: 1px solid rgba(139, 92, 246, 0.3);
                padding: 8px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .btn-modal-fechar:hover {
                background: rgba(139, 92, 246, 0.3);
                color: #c4b5fd;
                border-color: rgba(139, 92, 246, 0.5);
            }

            /* Mobile */
            @media (max-width: 768px) {
                .capitao-historico-modal-content {
                    max-width: 100%;
                    max-height: 95vh;
                    border-radius: 12px;
                    margin: 0 10px;
                }

                .modal-header-capitao { padding: 14px; }
                .modal-title-capitao { font-size: 15px; }
                .modal-resumo-capitao { padding: 10px 14px; gap: 10px; }
                .resumo-valor { font-size: 14px; }
                .modal-highlights-capitao { padding: 8px 14px; flex-direction: column; }
                .modal-turnos-container { padding: 10px 14px; }
            }
        `;

        document.head.appendChild(style);
    }
};

// Exportar globalmente
window.CapitaoHistoricoModal = CapitaoHistoricoModal;
