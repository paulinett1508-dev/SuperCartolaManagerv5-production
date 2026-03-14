// =============================================
// COMPONENTE: TurnoGroup v1.0
// Agrupa rodadas em 1º Turno (R1-R19) e 2º Turno (R20-R38)
// com headers colapsáveis e subtotais
// Reutilizável por todos os módulos premium
// =============================================

const TurnoGroup = {
    TURNO_1_MAX: 19,

    /**
     * Agrupa rodadas em turnos
     * @param {Array} rodadas - Array de objetos com campo `rodada`
     * @returns {{ turno1: Array, turno2: Array }}
     */
    agrupar(rodadas) {
        if (!rodadas || rodadas.length === 0) return { turno1: [], turno2: [] };

        const sorted = [...rodadas].sort((a, b) => a.rodada - b.rodada);
        return {
            turno1: sorted.filter(r => r.rodada <= this.TURNO_1_MAX),
            turno2: sorted.filter(r => r.rodada > this.TURNO_1_MAX)
        };
    },

    /**
     * Calcula subtotais de um grupo de rodadas
     * @param {Array} rodadas - Array de rodadas
     * @param {string} campoValor - Nome do campo numérico (ex: 'pontuacao')
     * @returns {{ total: number, media: number, melhor: object|null, count: number }}
     */
    calcularSubtotais(rodadas, campoValor = 'pontuacao') {
        if (!rodadas || rodadas.length === 0) {
            return { total: 0, media: 0, melhor: null, count: 0 };
        }

        let total = 0;
        let melhor = null;

        rodadas.forEach(r => {
            const val = r[campoValor] || 0;
            total += val;
            if (!melhor || val > (melhor[campoValor] || 0)) {
                melhor = r;
            }
        });

        // Truncar (NUNCA arredondar)
        total = Math.trunc(total * 100) / 100;
        const media = rodadas.length > 0 ? Math.trunc((total / rodadas.length) * 100) / 100 : 0;

        return { total, media, melhor, count: rodadas.length };
    },

    /**
     * Renderiza HTML de um grupo de turnos com headers colapsáveis
     * @param {Array} rodadas - Array de rodadas
     * @param {Object} options
     * @param {string} options.campoValor - Campo numérico (default: 'pontuacao')
     * @param {Function} options.renderRow - Função que recebe (rodada, index) e retorna HTML da linha
     * @param {string} options.idPrefix - Prefixo para IDs únicos (default: 'turno')
     * @param {string} options.moduleCssClass - Classe CSS do módulo (ex: 'capitao', 'artilheiro')
     * @returns {string} HTML completo
     */
    renderizar(rodadas, options = {}) {
        const {
            campoValor = 'pontuacao',
            renderRow = null,
            idPrefix = 'turno',
            moduleCssClass = ''
        } = options;

        const { turno1, turno2 } = this.agrupar(rodadas);
        let html = '';

        // Renderizar cada turno
        [
            { label: '1\u00ba Turno', sublabel: 'R1 \u2013 R19', data: turno1, id: `${idPrefix}-1` },
            { label: '2\u00ba Turno', sublabel: 'R20 \u2013 R38', data: turno2, id: `${idPrefix}-2` }
        ].forEach(turno => {
            if (turno.data.length === 0) return;

            const stats = this.calcularSubtotais(turno.data, campoValor);
            const totalFormatted = stats.total.toFixed(2);
            const mediaFormatted = stats.media.toFixed(2);

            // Gerar linhas
            let rowsHtml = '';
            if (renderRow) {
                turno.data.forEach((r, i) => {
                    rowsHtml += renderRow(r, i);
                });
            }

            html += `
                <div class="turno-group ${moduleCssClass}" id="${turno.id}">
                    <button class="turno-group-header" aria-expanded="false"
                            onclick="TurnoGroup._toggle('${turno.id}')">
                        <div class="turno-group-header-left">
                            <span class="material-icons turno-group-chevron">expand_more</span>
                            <span class="turno-group-label">${turno.label}</span>
                            <span class="turno-group-sublabel">${turno.sublabel}</span>
                        </div>
                        <div class="turno-group-header-stats">
                            <span class="turno-group-stat">
                                <span class="turno-group-stat-label">PTS</span>
                                <span class="turno-group-stat-value">${totalFormatted}</span>
                            </span>
                            <span class="turno-group-stat">
                                <span class="turno-group-stat-label">M\u00c9D</span>
                                <span class="turno-group-stat-value turno-group-stat-muted">${mediaFormatted}</span>
                            </span>
                            <span class="turno-group-stat">
                                <span class="turno-group-stat-label">ROD</span>
                                <span class="turno-group-stat-value turno-group-stat-muted">${stats.count}</span>
                            </span>
                        </div>
                    </button>
                    <div class="turno-group-body">
                        <div class="turno-group-body-inner">
                            ${rowsHtml}
                        </div>
                    </div>
                </div>
            `;
        });

        return html;
    },

    /**
     * Toggle colapsável
     * @param {string} turnoId - ID do container
     */
    _toggle(turnoId) {
        const container = document.getElementById(turnoId);
        if (!container) return;

        const header = container.querySelector('.turno-group-header');
        const body = container.querySelector('.turno-group-body');
        const isExpanded = header.getAttribute('aria-expanded') === 'true';

        header.setAttribute('aria-expanded', !isExpanded);

        if (!isExpanded) {
            // Expandir
            const inner = body.querySelector('.turno-group-body-inner');
            body.style.maxHeight = inner.scrollHeight + 'px';
        } else {
            // Colapsar
            body.style.maxHeight = '0';
        }
    }
};

// Exportar globalmente
window.TurnoGroup = TurnoGroup;
