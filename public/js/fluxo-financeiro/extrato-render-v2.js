/**
 * EXTRATO RENDER v2.0 - Renderização do Modal de Extrato (Admin)
 * ==============================================================
 * Inspirado no Banco Inter | Dark Theme
 *
 * USO: Importado pelo fluxo-financeiro-ui.js
 *
 * FUNÇÕES EXPORTADAS:
 * - renderExtratoV2(data, temporada) -> HTML string
 */

// ===== HELPERS =====

// ✅ C5 FIX: alias para formatarMoedaBR canônico (window exposto por fluxo-financeiro-utils.js)
const formatarMoeda = (valor) => (window.formatarMoedaBR || ((v) => { const n = parseFloat(v)||0; return (n<0?'-':'')+'R$ '+Math.abs(n).toFixed(2).replace('.',','); }))(valor);

function sinalMoeda(valor) {
    const v = parseFloat(valor) || 0;
    if (v > 0) return `+${formatarMoeda(v)}`;
    if (v < 0) return `-${formatarMoeda(Math.abs(v))}`;
    return formatarMoeda(0);
}

function getStatusClass(valor) {
    const v = parseFloat(valor) || 0;
    if (v > 0.01) return 'positive';
    if (v < -0.01) return 'negative';
    return 'neutral';
}

function getStatusTexto(saldo) {
    const v = parseFloat(saldo) || 0;
    if (v < -0.01) return { texto: 'VOCÊ DEVE', classe: 'deve' };
    if (v > 0.01) return { texto: 'A RECEBER', classe: 'receber' };
    return { texto: 'QUITADO', classe: 'quitado' };
}

function getStatusIcon(saldo) {
    const v = parseFloat(saldo) || 0;
    if (v < -0.01) return 'trending_down';
    if (v > 0.01) return 'trending_up';
    return 'check_circle';
}

// ===== COMPONENTES =====

/**
 * Renderiza o Hero Card (saldo principal)
 */
function renderHeroCardV2(resumo, temporada, rodadaParcial) {
    const saldo = resumo.saldo_atual ?? resumo.saldo ?? 0;
    const status = getStatusTexto(saldo);
    const statusIcon = getStatusIcon(saldo);
    const heroClass = `extrato-hero-v2--${status.classe === 'deve' ? 'negative' : status.classe === 'receber' ? 'positive' : 'neutral'}`;
    const valorClass = `extrato-hero-v2__valor--${getStatusClass(saldo)}`;

    // Stats rápidas
    const rodadas = resumo.rodadas_jogadas || 0;
    const totalGanhos = resumo.totalGanhos || 0;
    const totalPerdas = Math.abs(resumo.totalPerdas || 0);
    const acertosTotal = resumo.saldo_acertos || 0;

    // Projeção parcial
    const temParcial = rodadaParcial && rodadaParcial.status === 'ao_vivo';
    const saldoProjetado = temParcial ? rodadaParcial.saldo_projetado : null;
    const impactoProjetado = temParcial ? rodadaParcial.impacto_projetado : 0;

    return `
        <div class="extrato-hero-v2 ${heroClass} extrato-animate-in">
            <div class="extrato-hero-v2__header">
                <div class="extrato-hero-v2__label">
                    <span class="material-icons">account_balance_wallet</span>
                    SALDO FINANCEIRO · ${temporada}
                </div>
                <div class="extrato-hero-v2__actions">
                    ${temParcial ? `<span class="extrato-hero-v2__live-badge"><span class="extrato-hero-v2__live-dot"></span>AO VIVO</span>` : ''}
                    <button class="extrato-hero-v2__action-btn" onclick="window.toggleExtratoValorVisibility()" title="Mostrar/ocultar valor">
                        <span class="material-icons" id="eyeToggleIconAdmin">visibility</span>
                    </button>
                    <button class="extrato-hero-v2__action-btn" onclick="window.refreshExtratoModal()" title="Atualizar">
                        <span class="material-icons">sync</span>
                    </button>
                </div>
            </div>

            <div class="extrato-hero-v2__valor ${valorClass}" id="extratoValorAdmin">
                ${saldo < 0 ? '-' : saldo > 0 ? '+' : ''}${formatarMoeda(saldo)}
            </div>

            ${temParcial ? `
                <div class="extrato-hero-v2__projecao">
                    <span class="material-icons" style="font-size: 14px">trending_flat</span>
                    Projeção R${rodadaParcial.rodada}: <strong style="color: ${saldoProjetado >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">${saldoProjetado < 0 ? '-' : saldoProjetado > 0 ? '+' : ''}${formatarMoeda(saldoProjetado)}</strong>
                    <span style="opacity: 0.6">(${impactoProjetado >= 0 ? '+' : ''}${formatarMoeda(impactoProjetado)})</span>
                </div>
            ` : ''}

            <div class="extrato-hero-v2__status extrato-hero-v2__status--${status.classe}">
                <span class="material-icons">${statusIcon}</span>
                ${status.texto}
            </div>

            <div class="extrato-stats-v2">
                <div class="extrato-stat-pill-v2">
                    <span class="material-icons extrato-stat-pill-v2__icon">bar_chart</span>
                    <div class="extrato-stat-pill-v2__content">
                        <span class="extrato-stat-pill-v2__label">Rodadas</span>
                        <span class="extrato-stat-pill-v2__value">${rodadas}</span>
                    </div>
                </div>
                <div class="extrato-stat-pill-v2">
                    <span class="material-icons extrato-stat-pill-v2__icon" style="color: var(--extrato-icon-positive)">trending_up</span>
                    <div class="extrato-stat-pill-v2__content">
                        <span class="extrato-stat-pill-v2__label">Ganhos</span>
                        <span class="extrato-stat-pill-v2__value extrato-stat-pill-v2__value--positive">${sinalMoeda(totalGanhos)}</span>
                    </div>
                </div>
                <div class="extrato-stat-pill-v2">
                    <span class="material-icons extrato-stat-pill-v2__icon" style="color: var(--extrato-icon-negative)">trending_down</span>
                    <div class="extrato-stat-pill-v2__content">
                        <span class="extrato-stat-pill-v2__label">Perdas</span>
                        <span class="extrato-stat-pill-v2__value extrato-stat-pill-v2__value--negative">-${formatarMoeda(totalPerdas)}</span>
                    </div>
                </div>
                <div class="extrato-stat-pill-v2">
                    <span class="material-icons extrato-stat-pill-v2__icon">payments</span>
                    <div class="extrato-stat-pill-v2__content">
                        <span class="extrato-stat-pill-v2__label">Acertos</span>
                        <span class="extrato-stat-pill-v2__value ${acertosTotal >= 0 ? 'extrato-stat-pill-v2__value--positive' : 'extrato-stat-pill-v2__value--negative'}">${sinalMoeda(acertosTotal)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Renderiza o Gráfico de Evolução
 */
function renderChartV2(rodadas) {
    const hasRodadas = rodadas && rodadas.length > 0;

    return `
        <div class="extrato-chart-v2 extrato-animate-in">
            <div class="extrato-chart-v2__header">
                <div class="extrato-chart-v2__title">
                    <span class="material-icons">show_chart</span>
                    Evolução
                </div>
                <div class="extrato-chart-v2__filters">
                    <button class="extrato-chart-v2__filter-btn extrato-chart-v2__filter-btn--active" data-range="all">Tudo</button>
                    <button class="extrato-chart-v2__filter-btn" data-range="10">10R</button>
                    <button class="extrato-chart-v2__filter-btn" data-range="5">5R</button>
                </div>
            </div>
            <div class="extrato-chart-v2__container">
                ${hasRodadas ? `
                    <svg class="extrato-chart-v2__svg" id="extratoChartSvgAdmin" viewBox="0 0 300 140" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="chartGradAdmin" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#FF5500" stop-opacity="0.3"></stop>
                                <stop offset="100%" stop-color="#FF5500" stop-opacity="0"></stop>
                            </linearGradient>
                        </defs>
                        <line x1="0" x2="300" y1="70" y2="70" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4 4"></line>
                        <path id="chartAreaAdmin" fill="url(#chartGradAdmin)" d=""></path>
                        <path id="chartPathAdmin" fill="none" stroke="#FF5500" stroke-width="2" stroke-linecap="round" d=""></path>
                    </svg>
                ` : `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">
                        <span>Sem dados de rodadas</span>
                    </div>
                `}
            </div>
            ${hasRodadas ? `
                <div class="extrato-chart-v2__labels" id="chartLabelsAdmin"></div>
            ` : ''}
        </div>
    `;
}

/**
 * Renderiza Card de Acertos
 */
function renderAcertosCardV2(acertos) {
    const lista = acertos?.lista || [];
    const total = acertos?.resumo?.saldo || 0;

    const acertosHtml = lista.length > 0 ? lista.map(acerto => {
        const isPagamento = acerto.tipo === 'pagamento';
        const valor = Math.abs(acerto.valor || 0);
        const dataFormatada = acerto.dataAcerto || acerto.data
            ? new Date(acerto.dataAcerto || acerto.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            : '--/--';
        const metodos = { pix: 'PIX', transferencia: 'TED', dinheiro: 'Dinheiro', outro: 'Outro' };
        const metodo = metodos[acerto.metodoPagamento] || 'Outro';

        return `
            <div class="extrato-acertos-v2__item">
                <div class="extrato-acertos-v2__item-icon extrato-acertos-v2__item-icon--${isPagamento ? 'pagamento' : 'recebimento'}">
                    <span class="material-icons">${isPagamento ? 'arrow_upward' : 'arrow_downward'}</span>
                </div>
                <div class="extrato-acertos-v2__item-content">
                    <div class="extrato-acertos-v2__item-title">${acerto.descricao || (isPagamento ? 'Pagamento' : 'Recebimento')}</div>
                    <div class="extrato-acertos-v2__item-meta">
                        <span>${metodo}</span>
                        <span>·</span>
                        <span>${dataFormatada}</span>
                    </div>
                </div>
                <div class="extrato-acertos-v2__item-value" style="color: ${isPagamento ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                    ${isPagamento ? '+' : '-'}${formatarMoeda(valor)}
                </div>
            </div>
        `;
    }).join('') : `
        <div class="extrato-acertos-v2__empty">
            <span class="material-icons">receipt_long</span>
            <p>Nenhum acerto registrado</p>
        </div>
    `;

    return `
        <div class="extrato-acertos-v2 extrato-animate-in">
            <div class="extrato-acertos-v2__header">
                <div class="extrato-acertos-v2__title">
                    <span class="material-icons">payments</span>
                    Acertos
                </div>
                <span class="extrato-acertos-v2__count">${lista.length}</span>
            </div>
            <div class="extrato-acertos-v2__list">
                ${acertosHtml}
            </div>
        </div>
    `;
}

/**
 * Renderiza Timeline de Rodadas
 */
function renderTimelineV2(rodadas, resumo, acertos, lancamentosIniciais, rodadaParcial) {
    const groups = [];

    // 1. Lançamentos iniciais (inscrição, legado) + Ajustes financeiros (Resta Um, multas)
    if (lancamentosIniciais && lancamentosIniciais.length > 0) {
        // Separar inscrição/legado dos ajustes financeiros
        const entradas = lancamentosIniciais.filter(l => l.tipo !== 'AJUSTE' && l.tipo !== 'AJUSTE_MANUAL');
        const ajustes = lancamentosIniciais.filter(l => l.tipo === 'AJUSTE' || l.tipo === 'AJUSTE_MANUAL');

        const renderDetailItem = (l) => `
            <div class="extrato-timeline-v2__detail-item">
                <div class="extrato-timeline-v2__detail-label">
                    <span class="material-icons">${l.tipo === 'INSCRICAO_TEMPORADA' ? 'receipt_long' : (l.tipo === 'AJUSTE' || l.tipo === 'AJUSTE_MANUAL') ? 'gavel' : 'savings'}</span>
                    ${l.descricao || l.tipo}
                </div>
                <div class="extrato-timeline-v2__detail-value extrato-timeline-v2__detail-value--${getStatusClass(l.valor)}">
                    ${sinalMoeda(l.valor)}
                </div>
            </div>
        `;

        // 1a. Grupo inscrição/legado
        if (entradas.length > 0) {
            const totalInicial = entradas.reduce((s, l) => s + (l.valor || 0), 0);
            groups.push({
                order: 0,
                html: `
                    <div class="extrato-timeline-v2__group">
                        <div class="extrato-timeline-v2__group-header" onclick="window.toggleTimelineGroupV2(this)">
                            <div class="extrato-timeline-v2__group-left">
                                <div class="extrato-timeline-v2__group-icon extrato-timeline-v2__group-icon--inscricao">
                                    <span class="material-icons">receipt_long</span>
                                </div>
                                <div class="extrato-timeline-v2__group-info">
                                    <div class="extrato-timeline-v2__group-title">Inscrição</div>
                                    <div class="extrato-timeline-v2__group-subtitle">${entradas.length} lançamento(s)</div>
                                </div>
                            </div>
                            <div class="extrato-timeline-v2__group-right">
                                <div class="extrato-timeline-v2__group-value extrato-timeline-v2__group-value--${getStatusClass(totalInicial)}">
                                    ${sinalMoeda(totalInicial)}
                                </div>
                                <span class="material-icons extrato-timeline-v2__expand-icon">expand_more</span>
                            </div>
                        </div>
                        <div class="extrato-timeline-v2__group-details">
                            ${entradas.map(renderDetailItem).join('')}
                        </div>
                    </div>
                `
            });
        }

        // 1b. Grupo ajustes financeiros (Resta Um, multas, etc.)
        if (ajustes.length > 0) {
            const totalAjustes = ajustes.reduce((s, l) => s + (l.valor || 0), 0);
            groups.push({
                order: 0.5,
                html: `
                    <div class="extrato-timeline-v2__group">
                        <div class="extrato-timeline-v2__group-header" onclick="window.toggleTimelineGroupV2(this)">
                            <div class="extrato-timeline-v2__group-left">
                                <div class="extrato-timeline-v2__group-icon extrato-timeline-v2__group-icon--${totalAjustes < 0 ? 'negative' : 'positive'}">
                                    <span class="material-icons">gavel</span>
                                </div>
                                <div class="extrato-timeline-v2__group-info">
                                    <div class="extrato-timeline-v2__group-title">Ajustes</div>
                                    <div class="extrato-timeline-v2__group-subtitle">${ajustes.length} lançamento(s)</div>
                                </div>
                            </div>
                            <div class="extrato-timeline-v2__group-right">
                                <div class="extrato-timeline-v2__group-value extrato-timeline-v2__group-value--${getStatusClass(totalAjustes)}">
                                    ${sinalMoeda(totalAjustes)}
                                </div>
                                <span class="material-icons extrato-timeline-v2__expand-icon">expand_more</span>
                            </div>
                        </div>
                        <div class="extrato-timeline-v2__group-details">
                            ${ajustes.map(renderDetailItem).join('')}
                        </div>
                    </div>
                `
            });
        }
    }

    // 2. Rodadas
    const rodadasValidas = (rodadas || []).filter(r => r.rodada && r.rodada > 0);

    // ✅ Gap-filling: preencher rodadas sem movimentação (alinhado com app participante)
    const maxRodada = rodadasValidas.length > 0
        ? Math.max(...rodadasValidas.map(r => r.rodada))
        : 0;
    const rodadasExistentes = new Map(rodadasValidas.map(r => [r.rodada, r]));
    const rodadasCompletas = [];
    for (let i = 1; i <= maxRodada; i++) {
        rodadasCompletas.push(rodadasExistentes.get(i) || {
            rodada: i, posicao: null, bonusOnus: 0, pontosCorridos: 0,
            mataMata: 0, top10: 0,
            _preenchida: true,
        });
    }

    const rodadasOrdenadas = [...rodadasCompletas].sort((a, b) => b.rodada - a.rodada); // Mais recente primeiro

    let saldoAcumulado = lancamentosIniciais ? lancamentosIniciais.reduce((s, l) => s + (l.valor || 0), 0) : 0;

    // Calcular saldo acumulado para cada rodada (ordem cronológica)
    const saldosPorRodada = {};
    [...rodadasCompletas].sort((a, b) => a.rodada - b.rodada).forEach(r => {
        const saldoRodada = (r.bonusOnus || 0) + (r.pontosCorridos || 0) + (r.mataMata || 0) + (r.top10 || 0);
        saldoAcumulado += saldoRodada;
        saldosPorRodada[r.rodada] = saldoAcumulado;
    });

    rodadasOrdenadas.forEach(r => {
        const bonusOnus = r.bonusOnus || 0;
        const pontosCorridos = r.pontosCorridos || 0;
        const mataMata = r.mataMata || 0;
        const top10 = r.top10 || 0;
        const saldoRodada = bonusOnus + pontosCorridos + mataMata + top10;
        const saldoAcum = saldosPorRodada[r.rodada] || 0;

        // Badges — isMito/isMico (posição na rodada) TEM PRIORIDADE sobre top10 (valor financeiro do módulo Top10)
        let badgeHtml = '';
        if (r.isMito) {
            badgeHtml = '<span class="extrato-timeline-v2__group-badge extrato-timeline-v2__group-badge--mito">MITO</span>';
        } else if (r.isMico) {
            badgeHtml = '<span class="extrato-timeline-v2__group-badge extrato-timeline-v2__group-badge--mico">MICO</span>';
        } else if (r.top10 > 0) {
            badgeHtml = '<span class="extrato-timeline-v2__group-badge extrato-timeline-v2__group-badge--mito">MITO</span>';
        } else if (r.top10 < 0) {
            badgeHtml = '<span class="extrato-timeline-v2__group-badge extrato-timeline-v2__group-badge--mico">MICO</span>';
        } else if (r.posicao && r.posicao <= 10) {
            badgeHtml = `<span class="extrato-timeline-v2__group-badge extrato-timeline-v2__group-badge--zona-g">G${r.posicao}</span>`;
        }

        // Detalhes
        const details = [];
        if (bonusOnus !== 0) details.push({ icon: 'casino', label: 'Bônus/Ônus', valor: bonusOnus });
        if (pontosCorridos !== 0) details.push({ icon: 'sports_soccer', label: 'Pontos Corridos', valor: pontosCorridos });
        if (mataMata !== 0) details.push({ icon: 'emoji_events', label: 'Mata-Mata', valor: mataMata });
        if (top10 !== 0) details.push({ icon: top10 > 0 ? 'military_tech' : 'sentiment_dissatisfied', label: r.top10Status ? `Top 10 (${r.top10Status})` : 'Top 10', valor: top10 });

        const detailsHtml = details.length > 0 ? details.map(d => `
            <div class="extrato-timeline-v2__detail-item">
                <div class="extrato-timeline-v2__detail-label">
                    <span class="material-icons">${d.icon}</span>
                    ${d.label}
                </div>
                <div class="extrato-timeline-v2__detail-value extrato-timeline-v2__detail-value--${getStatusClass(d.valor)}">
                    ${sinalMoeda(d.valor)}
                </div>
            </div>
        `).join('') : `
            <div class="extrato-timeline-v2__detail-item">
                <div class="extrato-timeline-v2__detail-label">
                    <span class="material-icons">remove</span>
                    Sem movimentação
                </div>
                <div class="extrato-timeline-v2__detail-value extrato-timeline-v2__detail-value--neutral">—</div>
            </div>
        `;

        const iconClass = saldoRodada > 0 ? 'positive' : saldoRodada < 0 ? 'negative' : 'rodada';

        groups.push({
            order: r.rodada,
            html: `
                <div class="extrato-timeline-v2__group">
                    <div class="extrato-timeline-v2__group-header" onclick="window.toggleTimelineGroupV2(this)">
                        <div class="extrato-timeline-v2__group-left">
                            <div class="extrato-timeline-v2__group-icon extrato-timeline-v2__group-icon--${iconClass}">
                                <span class="material-icons">${saldoRodada > 0 ? 'trending_up' : saldoRodada < 0 ? 'trending_down' : 'sports_soccer'}</span>
                            </div>
                            <div class="extrato-timeline-v2__group-info">
                                <div class="extrato-timeline-v2__group-title">
                                    Rodada ${r.rodada}
                                    ${r.posicao ? ` · ${r.posicao}º` : ''}
                                    ${badgeHtml}
                                </div>
                                <div class="extrato-timeline-v2__group-subtitle">${details.length > 0 ? `${details.length} módulo(s)` : 'Sem movimentação'}</div>
                            </div>
                        </div>
                        <div class="extrato-timeline-v2__group-right">
                            <div class="extrato-timeline-v2__group-value extrato-timeline-v2__group-value--${getStatusClass(saldoRodada)}">
                                ${saldoRodada === 0 ? '—' : sinalMoeda(saldoRodada)}
                            </div>
                            <span class="material-icons extrato-timeline-v2__expand-icon">expand_more</span>
                        </div>
                    </div>
                    <div class="extrato-timeline-v2__group-details">
                        ${detailsHtml}
                    </div>
                    <div class="extrato-timeline-v2__accumulated">
                        <span class="extrato-timeline-v2__accumulated-label">Saldo:</span>
                        <span class="extrato-timeline-v2__accumulated-value" style="color: ${saldoAcum >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                            ${sinalMoeda(saldoAcum)}
                        </span>
                    </div>
                </div>
            `
        });
    });

    // ✅ v8.20.0: Injetar rodada parcial AO VIVO no topo
    if (rodadaParcial && rodadaParcial.status === 'ao_vivo') {
        const rp = rodadaParcial;
        const impacto = rp.impacto_projetado || 0;
        const hora = rp.atualizado_em
            ? new Date(rp.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '--:--';

        const parcialDetails = [];
        if (rp.banco && rp.banco.valor !== 0) {
            parcialDetails.push({ icon: 'casino', label: rp.banco.descricao || 'Bônus/Ônus', valor: rp.banco.valor });
        }
        if (rp.pontosCorridos && rp.pontosCorridos.valor !== 0) {
            parcialDetails.push({ icon: 'sports_soccer', label: rp.pontosCorridos.descricao || 'Pontos Corridos', valor: rp.pontosCorridos.valor });
        }

        const parcialDetailsHtml = parcialDetails.length > 0 ? parcialDetails.map(d => `
            <div class="extrato-timeline-v2__detail-item">
                <div class="extrato-timeline-v2__detail-label">
                    <span class="material-icons">${d.icon}</span>
                    ${d.label}
                </div>
                <div class="extrato-timeline-v2__detail-value extrato-timeline-v2__detail-value--${getStatusClass(d.valor)}">
                    ${sinalMoeda(d.valor)}
                </div>
            </div>
        `).join('') : `
            <div class="extrato-timeline-v2__detail-item">
                <div class="extrato-timeline-v2__detail-label">
                    <span class="material-icons">hourglass_empty</span>
                    Aguardando jogos
                </div>
                <div class="extrato-timeline-v2__detail-value extrato-timeline-v2__detail-value--neutral">—</div>
            </div>
        `;

        groups.push({
            order: rp.rodada + 0.5, // Acima de todas as rodadas consolidadas
            html: `
                <div class="extrato-timeline-v2__group extrato-timeline-v2__group--live">
                    <div class="extrato-timeline-v2__group-header" onclick="window.toggleTimelineGroupV2(this)">
                        <div class="extrato-timeline-v2__group-left">
                            <div class="extrato-timeline-v2__group-icon extrato-timeline-v2__group-icon--live">
                                <span class="material-icons">sports_soccer</span>
                            </div>
                            <div class="extrato-timeline-v2__group-info">
                                <div class="extrato-timeline-v2__group-title">
                                    Rodada ${rp.rodada}
                                    ${rp.posicao_parcial ? ` · ${rp.posicao_parcial}º` : ''}
                                    <span class="extrato-timeline-v2__live-badge">
                                        <span class="extrato-timeline-v2__live-dot"></span>
                                        AO VIVO
                                    </span>
                                </div>
                                <div class="extrato-timeline-v2__group-subtitle">${rp.pontos_parciais ? rp.pontos_parciais.toFixed(2) + ' pts' : ''} · ${hora}</div>
                            </div>
                        </div>
                        <div class="extrato-timeline-v2__group-right">
                            <div class="extrato-timeline-v2__group-value extrato-timeline-v2__group-value--${getStatusClass(impacto)}">
                                ${impacto === 0 ? '—' : sinalMoeda(impacto)}
                            </div>
                            <span class="material-icons extrato-timeline-v2__expand-icon">expand_more</span>
                        </div>
                    </div>
                    <div class="extrato-timeline-v2__group-details">
                        ${parcialDetailsHtml}
                    </div>
                    <div class="extrato-timeline-v2__accumulated">
                        <span class="extrato-timeline-v2__accumulated-label">Saldo projetado:</span>
                        <span class="extrato-timeline-v2__accumulated-value" style="color: ${rp.saldo_projetado >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                            ${sinalMoeda(rp.saldo_projetado)}
                        </span>
                    </div>
                </div>
            `
        });
    }

    // Ordenar do mais recente para mais antigo
    groups.sort((a, b) => b.order - a.order);

    // Totais
    const totaisHtml = `
        <div class="extrato-timeline-v2__totals">
            <div class="extrato-timeline-v2__totals-title">Totais da Temporada</div>
            <div class="extrato-timeline-v2__totals-grid">
                <div class="extrato-timeline-v2__total-item">
                    <div class="extrato-timeline-v2__total-label">Bônus/Ônus</div>
                    <div class="extrato-timeline-v2__total-value" style="color: ${(resumo.bonus || 0) + (resumo.onus || 0) >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                        ${sinalMoeda((resumo.bonus || 0) + (resumo.onus || 0))}
                    </div>
                </div>
                <div class="extrato-timeline-v2__total-item">
                    <div class="extrato-timeline-v2__total-label">P. Corridos</div>
                    <div class="extrato-timeline-v2__total-value" style="color: ${(resumo.pontosCorridos || 0) >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                        ${sinalMoeda(resumo.pontosCorridos || 0)}
                    </div>
                </div>
                <div class="extrato-timeline-v2__total-item">
                    <div class="extrato-timeline-v2__total-label">Mata-Mata</div>
                    <div class="extrato-timeline-v2__total-value" style="color: ${(resumo.mataMata || 0) >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                        ${sinalMoeda(resumo.mataMata || 0)}
                    </div>
                </div>
                <div class="extrato-timeline-v2__total-item">
                    <div class="extrato-timeline-v2__total-label">Top 10</div>
                    <div class="extrato-timeline-v2__total-value" style="color: ${(resumo.top10 || 0) >= 0 ? 'var(--extrato-icon-positive)' : 'var(--extrato-icon-negative)'}">
                        ${sinalMoeda(resumo.top10 || 0)}
                    </div>
                </div>
            </div>
        </div>
    `;

    return `
        <div class="extrato-timeline-v2 extrato-animate-in">
            <div class="extrato-timeline-v2__header">
                <div class="extrato-timeline-v2__title">
                    <span class="material-icons">format_list_bulleted</span>
                    Detalhamento
                </div>
                <div class="extrato-timeline-v2__filters">
                    <button class="extrato-timeline-v2__filter-btn extrato-timeline-v2__filter-btn--active" data-filter="all">Todos</button>
                    <button class="extrato-timeline-v2__filter-btn" data-filter="credito">Créditos</button>
                    <button class="extrato-timeline-v2__filter-btn" data-filter="debito">Débitos</button>
                </div>
            </div>
            <div class="extrato-timeline-v2__content">
                ${groups.length > 0 ? groups.map(g => g.html).join('') : `
                    <div class="extrato-empty-v2">
                        <span class="material-icons extrato-empty-v2__icon">inbox</span>
                        <p class="extrato-empty-v2__title">Sem movimentações</p>
                        <p class="extrato-empty-v2__text">O extrato será gerado após a primeira rodada</p>
                    </div>
                `}
            </div>
            ${groups.length > 0 ? totaisHtml : ''}
        </div>
    `;
}

/**
 * Renderiza Performance Card
 */
function renderPerformanceV2(rodadas) {
    if (!rodadas || rodadas.length === 0) {
        return '';
    }

    let mitos = 0, micos = 0, zonaG = 0, zonaZ = 0;
    let melhorRodada = { rodada: 0, saldo: -Infinity };
    let piorRodada = { rodada: 0, saldo: Infinity };

    rodadas.filter(r => r.rodada > 0).forEach(r => {
        const saldo = (r.bonusOnus || 0) + (r.pontosCorridos || 0) + (r.mataMata || 0) + (r.top10 || 0);

        // isMito/isMico (posição) tem prioridade; top10 é fallback (módulo Top10)
        if (r.isMito) mitos++;
        else if (r.isMico) micos++;
        else if (r.top10 > 0) mitos++;
        else if (r.top10 < 0) micos++;
        if (r.posicao && r.posicao <= 10) zonaG++;
        if (r.posicao && r.posicao >= 25) zonaZ++; // Assumindo ~32 participantes

        if (saldo > melhorRodada.saldo) melhorRodada = { rodada: r.rodada, saldo };
        if (saldo < piorRodada.saldo) piorRodada = { rodada: r.rodada, saldo };
    });

    return `
        <div class="extrato-performance-v2 extrato-animate-in">
            <div class="extrato-performance-v2__title">
                <span class="material-icons">emoji_events</span>
                Desempenho
            </div>
            <div class="extrato-performance-v2__grid">
                <div class="extrato-performance-v2__stat">
                    <div class="extrato-performance-v2__stat-value extrato-performance-v2__stat-value--mito">${mitos}</div>
                    <div class="extrato-performance-v2__stat-label">Mitos</div>
                </div>
                <div class="extrato-performance-v2__stat">
                    <div class="extrato-performance-v2__stat-value extrato-performance-v2__stat-value--mico">${micos}</div>
                    <div class="extrato-performance-v2__stat-label">Micos</div>
                </div>
                <div class="extrato-performance-v2__stat">
                    <div class="extrato-performance-v2__stat-value extrato-performance-v2__stat-value--zona-g">${zonaG}</div>
                    <div class="extrato-performance-v2__stat-label">Zona G</div>
                </div>
                <div class="extrato-performance-v2__stat">
                    <div class="extrato-performance-v2__stat-value extrato-performance-v2__stat-value--zona-z">${zonaZ}</div>
                    <div class="extrato-performance-v2__stat-label">Zona Z</div>
                </div>
            </div>
            <div class="extrato-performance-v2__best-worst">
                <div class="extrato-performance-v2__bw-item">
                    <div class="extrato-performance-v2__bw-label">Melhor Rodada</div>
                    <div class="extrato-performance-v2__bw-value" style="color: var(--extrato-icon-positive)">
                        R${melhorRodada.rodada} (${sinalMoeda(melhorRodada.saldo)})
                    </div>
                </div>
                <div class="extrato-performance-v2__bw-item">
                    <div class="extrato-performance-v2__bw-label">Pior Rodada</div>
                    <div class="extrato-performance-v2__bw-value" style="color: var(--extrato-icon-negative)">
                        R${piorRodada.rodada} (${sinalMoeda(piorRodada.saldo)})
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===== FUNÇÃO PRINCIPAL =====

/**
 * Renderiza o extrato completo v2
 * @param {Object} data - Dados do extrato
 * @param {number} temporada - Ano da temporada
 * @returns {string} HTML do extrato
 */
window.renderExtratoV2 = function(data, temporada) {
    const resumo = data.resumo || {};
    const rodadas = data.rodadas || data.historico || [];
    const acertos = data.acertos || { lista: [], resumo: {} };
    const lancamentosIniciais = data.lancamentosIniciais || [];
    const rodadaParcial = data.rodada_parcial || null;

    // Calcular rodadas jogadas se não existir
    if (!resumo.rodadas_jogadas) {
        resumo.rodadas_jogadas = rodadas.filter(r => r.rodada > 0).length;
    }

    // Calcular saldo de acertos se não existir
    if (!resumo.saldo_acertos && acertos.resumo) {
        resumo.saldo_acertos = acertos.resumo.saldo || 0;
    }

    return `
        ${renderHeroCardV2(resumo, temporada, rodadaParcial)}

        <div class="extrato-admin-grid">
            <div class="extrato-admin-grid__sidebar">
                ${renderChartV2(rodadas)}
                ${renderAcertosCardV2(acertos)}
                ${renderPerformanceV2(rodadas)}
            </div>
            <div class="extrato-admin-grid__main">
                ${renderTimelineV2(rodadas, resumo, acertos, lancamentosIniciais, rodadaParcial)}
            </div>
        </div>
    `;
};

// ===== FUNÇÕES GLOBAIS (INTERATIVIDADE) =====

/**
 * Toggle visibilidade do valor do extrato
 */
window.toggleExtratoValorVisibility = function() {
    const valorEl = document.getElementById('extratoValorAdmin');
    const iconEl = document.getElementById('eyeToggleIconAdmin');
    if (valorEl && iconEl) {
        valorEl.classList.toggle('extrato-hero-v2__valor--hidden');
        iconEl.textContent = valorEl.classList.contains('extrato-hero-v2__valor--hidden') ? 'visibility_off' : 'visibility';
    }
};

/**
 * Toggle grupo da timeline
 */
window.toggleTimelineGroupV2 = function(headerEl) {
    const group = headerEl.closest('.extrato-timeline-v2__group');
    const details = group.querySelector('.extrato-timeline-v2__group-details');
    const icon = headerEl.querySelector('.extrato-timeline-v2__expand-icon');

    if (details) {
        details.classList.toggle('extrato-timeline-v2__group-details--open');
    }
    if (icon) {
        icon.classList.toggle('extrato-timeline-v2__expand-icon--open');
    }
};

/**
 * Renderiza gráfico de evolução
 */
window.renderExtratoChartV2 = function(rodadas, range = 'all') {
    const path = document.getElementById('chartPathAdmin');
    const area = document.getElementById('chartAreaAdmin');
    const labels = document.getElementById('chartLabelsAdmin');

    if (!path || !area) return;

    let dados = [...rodadas].filter(r => r.rodada > 0).sort((a, b) => a.rodada - b.rodada);
    if (range !== 'all') {
        dados = dados.slice(-parseInt(range));
    }

    if (dados.length === 0) {
        path.setAttribute('d', '');
        area.setAttribute('d', '');
        if (labels) labels.innerHTML = '';
        return;
    }

    let saldoAcumulado = 0;
    const pontos = dados.map(r => {
        saldoAcumulado += (r.bonusOnus || 0) + (r.pontosCorridos || 0) + (r.mataMata || 0) + (r.top10 || 0);
        return { rodada: r.rodada, saldo: saldoAcumulado };
    });

    const valores = pontos.map(p => p.saldo);
    const min = Math.min(...valores, 0);
    const max = Math.max(...valores, 0);
    const amplitude = Math.max(Math.abs(max), Math.abs(min)) || 1;
    const width = 300, height = 140, paddingY = 15;

    const mapY = val => {
        const normalized = (val + amplitude) / (amplitude * 2);
        return height - paddingY - normalized * (height - paddingY * 2);
    };

    let pathD = '', areaD = '';
    pontos.forEach((p, i) => {
        const x = (i / (pontos.length - 1 || 1)) * width;
        const y = mapY(p.saldo);
        if (i === 0) {
            pathD = `M ${x} ${y}`;
            areaD = `M ${x} ${height - paddingY}`;
        }
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
    });
    areaD += ` L ${width} ${height - paddingY} Z`;

    path.setAttribute('d', pathD);
    area.setAttribute('d', areaD);

    // Labels
    if (labels) {
        const step = Math.ceil(pontos.length / 6);
        labels.innerHTML = pontos
            .filter((_, i) => i % step === 0 || i === pontos.length - 1)
            .map(p => `<span>R${p.rodada}</span>`)
            .join('');
    }
};

/**
 * Configura filtros do gráfico
 */
window.setupExtratoChartFiltersV2 = function(rodadas) {
    const buttons = document.querySelectorAll('.extrato-chart-v2__filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('extrato-chart-v2__filter-btn--active'));
            btn.classList.add('extrato-chart-v2__filter-btn--active');
            window.renderExtratoChartV2(rodadas, btn.dataset.range);
        });
    });
};

/**
 * Configura filtros da timeline
 */
window.setupExtratoTimelineFiltersV2 = function() {
    const buttons = document.querySelectorAll('.extrato-timeline-v2__filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('extrato-timeline-v2__filter-btn--active'));
            btn.classList.add('extrato-timeline-v2__filter-btn--active');

            const filter = btn.dataset.filter;
            const groups = document.querySelectorAll('.extrato-timeline-v2__group');

            groups.forEach(group => {
                const value = group.querySelector('.extrato-timeline-v2__group-value');
                let show = true;

                if (filter === 'credito') {
                    show = value && value.textContent.includes('+');
                } else if (filter === 'debito') {
                    show = value && value.textContent.includes('-');
                }

                group.style.display = show ? '' : 'none';
            });
        });
    });
};

console.log('[EXTRATO-RENDER-V2] Módulo carregado');
