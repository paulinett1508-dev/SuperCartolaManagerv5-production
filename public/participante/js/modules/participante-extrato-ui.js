// =====================================================
// MÓDULO: UI DO EXTRATO PARTICIPANTE — v12.0 THERMAL TICKET
// =====================================================
// Estilo: ticket de impressora térmica (papel branco off-white)
// Substitui o redesign "banco digital" (v11.x). Mantém data contract intacto.
// =====================================================

if (window.Log) Log.info("[EXTRATO-UI] v12.0 THERMAL TICKET");

// ===== CONSTANTES =====
const DEFAULT_TOTAL_PARTICIPANTES = 32;

// ===== CONFIG CACHE =====
let ligaConfigCache = null;
let statusRenovacaoParticipante = null;

// ===== PRÉ-TEMPORADA DETECTION =====
function isPreTemporada(rodadas) {
    if (!rodadas || rodadas.length === 0) return true;
    return rodadas.filter(r => r.rodada && r.rodada > 0).length === 0;
}

// ===== VERIFICAR RENOVAÇÃO =====
async function verificarStatusRenovacao() {
    if (window.verificarRenovacaoParticipante) {
        const ligaId = window.PARTICIPANTE_IDS?.ligaId || window.participanteData?.ligaId;
        const timeId = window.PARTICIPANTE_IDS?.timeId || window.participanteData?.timeId;
        if (ligaId && timeId) {
            statusRenovacaoParticipante = await window.verificarRenovacaoParticipante(ligaId, timeId);
            return statusRenovacaoParticipante;
        }
    }
    return { renovado: false };
}

// ===== LIGA CONFIG =====
async function fetchLigaConfigSilent(ligaId) {
    if (ligaConfigCache?.liga_id === ligaId) return ligaConfigCache;
    try {
        const response = await fetch(`/api/ligas/${ligaId}/configuracoes`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                ligaConfigCache = data;
                window.ligaConfigCache = data;
                return data;
            }
        }
    } catch (e) { /* silencioso */ }
    return null;
}

// ===== FAIXAS E CLASSIFICAÇÃO =====
function getFaixasParaRodada(ligaId, rodada) {
    const config = ligaConfigCache || window.ligaConfigCache;
    if (!config?.ranking_rodada) return detectarFaixasPorTotal(DEFAULT_TOTAL_PARTICIPANTES);
    const rankingConfig = config.ranking_rodada;

    let faixas, totalTimes;

    if (rankingConfig.temporal) {
        const rodadaTransicao = rankingConfig.rodada_transicao || 30;
        const fase = rodada < rodadaTransicao ? "fase1" : "fase2";
        const faseConfig = rankingConfig[fase];
        faixas = faseConfig?.faixas;
        totalTimes = faseConfig?.total_participantes || DEFAULT_TOTAL_PARTICIPANTES;
    } else {
        faixas = rankingConfig.faixas;
        totalTimes = rankingConfig.total_participantes || DEFAULT_TOTAL_PARTICIPANTES;
    }

    if (faixas?.credito && faixas?.debito) {
        return { nome: config.liga_nome, totalTimes, ...faixas };
    }
    return detectarFaixasPorTotal(totalTimes);
}

function detectarFaixasPorTotal(totalTimes) {
    if (totalTimes <= 6) {
        return {
            totalTimes,
            credito: { inicio: 1, fim: 2 },
            neutro: { inicio: 3, fim: Math.floor(totalTimes / 2) },
            debito: { inicio: Math.floor(totalTimes / 2) + 1, fim: totalTimes },
        };
    }
    const terco = Math.floor(totalTimes / 3);
    return {
        totalTimes,
        credito: { inicio: 1, fim: terco },
        neutro: { inicio: terco + 1, fim: totalTimes - terco },
        debito: { inicio: totalTimes - terco + 1, fim: totalTimes },
    };
}

// ===== HELPERS =====
function formatarMoeda(valor) {
    return `R$ ${Math.abs(valor).toFixed(2).replace(".", ",")}`;
}

function preencherTodasRodadas(rodadasExistentes) {
    if (!rodadasExistentes || rodadasExistentes.length === 0) return [];
    const rodadasMap = new Map();
    rodadasExistentes.forEach(r => {
        if (r.rodada && r.rodada > 0) rodadasMap.set(r.rodada, r);
    });
    if (rodadasMap.size === 0) return [];
    const ultimaRodada = Math.max(...Array.from(rodadasMap.keys()));
    const todasRodadas = [];
    for (let i = 1; i <= ultimaRodada; i++) {
        if (rodadasMap.has(i)) {
            todasRodadas.push(rodadasMap.get(i));
        } else {
            todasRodadas.push({ rodada: i, posicao: null, bonusOnus: 0, pontosCorridos: 0, mataMata: 0, top10: 0, restaUm: 0, _preenchida: true });
        }
    }
    return todasRodadas;
}

// Defensivo — fallback caso window.escapeHtml não esteja disponível
function safeEscapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================================
// THERMAL TICKET — RENDER HELPERS
// =====================================================================

function getNomeLancamento(l, temporada) {
    if (l.tipo === 'INSCRICAO_TEMPORADA') return `INSCRIÇÃO ${temporada}`;
    if (l.tipo === 'TRANSFERENCIA_SALDO' || l.tipo === 'SALDO_TEMPORADA_ANTERIOR') return 'SALDO ANTERIOR';
    return safeEscapeHtml((l.descricao || l.tipo || 'LANÇAMENTO')).toUpperCase();
}

function valorTextWithSign(valor) {
    if (valor === 0) return formatarMoeda(0);
    return `${valor > 0 ? '+ ' : '− '}${formatarMoeda(valor)}`;
}

function signKey(valor) {
    if (valor > 0) return '+';
    if (valor < 0) return '-';
    return '0';
}

function renderRow({ name, detail = '', valor = 0, isZero = false, allowHtmlInName = false }) {
    const sign = signKey(valor);
    const valueText = isZero ? '—' : valorTextWithSign(valor);
    const nameHtml = allowHtmlInName ? name : safeEscapeHtml(name);
    const detailHtml = detail
        ? `<span class="thermal-ticket__row-name-detail">${safeEscapeHtml(detail)}</span>`
        : '';
    const rowClass = (valor === 0 || isZero)
        ? 'thermal-ticket__row thermal-ticket__row--zero'
        : 'thermal-ticket__row';

    return `
        <li class="${rowClass}">
            <span class="thermal-ticket__row-name">${nameHtml}${detailHtml}</span>
            <span class="thermal-ticket__row-leader" aria-hidden="true"></span>
            <span class="thermal-ticket__row-value" data-sign="${sign}">${valueText}</span>
        </li>
    `;
}

function renderSubtotal(label, valor) {
    return `
        <div class="thermal-ticket__subtotal">
            <span class="thermal-ticket__subtotal-label">${safeEscapeHtml(label)}</span>
            <span class="thermal-ticket__subtotal-value" data-sign="${signKey(valor)}">${valorTextWithSign(valor)}</span>
        </div>
    `;
}

// =====================================================================
// THERMAL TICKET — MAIN RENDERER
// =====================================================================

function renderThermalTicket(extrato, acertos, ligaId, options = {}) {
    const { isPreTemporadaMode = false } = options;

    // ===== Identidade do time/liga =====
    // Cadeia de fallbacks segue paths usados em participante-auth.js, participante-navigation.js
    // e o source-of-truth no DOM (#nomeTime, atualizado pelo auth ao trocar de liga).
    const timeNome = safeEscapeHtml(
        extrato.time?.nome
        || extrato.nome_time
        || extrato.timeNome
        || window.participanteData?.nomeTime
        || window.participanteData?.participante?.participante?.nome_time
        || window.participanteAuth?.participante?.participante?.nome_time
        || document.getElementById('nomeTime')?.textContent?.trim()
        || 'Meu Time'
    );

    const temporada = window.seasonSelector?.getTemporadaSelecionada?.()
        || window.ParticipanteConfig?.CURRENT_SEASON
        || 2026;

    const ligaNomeRaw = extrato.ligaConfig?.nome
        || extrato.ligaConfig?.liga_nome
        || extrato.ligaNome
        || (ligaId ? `Liga #${ligaId}` : 'Liga');

    const dataEmissao = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const saldoFinal = extrato.saldo
        ?? extrato.resumo?.saldo_atual
        ?? extrato.resumo?.saldo
        ?? 0;

    // ===== Build sections =====
    const lancamentos = extrato.lancamentosIniciais || [];
    const entradas = lancamentos.filter(l => l.tipo !== 'AJUSTE' && l.tipo !== 'AJUSTE_MANUAL');
    const ajustes = lancamentos.filter(l => l.tipo === 'AJUSTE' || l.tipo === 'AJUSTE_MANUAL');

    const rodadasCompletas = isPreTemporadaMode ? [] : preencherTodasRodadas(extrato.rodadas || []);
    const rodadasOrdenadas = [...rodadasCompletas].sort((a, b) => a.rodada - b.rodada);

    const listaAcertos = acertos?.lista || [];

    const sections = [];

    // --- Inscrição ---
    if (entradas.length > 0) {
        const total = entradas.reduce((s, l) => s + (l.valor || 0), 0);
        const rowsHtml = entradas.map(l => renderRow({
            name: getNomeLancamento(l, temporada),
            valor: l.valor || 0,
            allowHtmlInName: true
        })).join('');

        sections.push(`
            <section class="thermal-ticket__section" data-section="inscricao">
                <h2 class="thermal-ticket__section-title">Inscrição</h2>
                <ul class="thermal-ticket__rows" role="list">${rowsHtml}</ul>
                ${renderSubtotal('Subtotal', total)}
            </section>
        `);
    }

    // --- Rodadas (com breakdown de componentes) ---
    if (rodadasOrdenadas.length > 0) {
        let totalRodadas = 0;
        const rowsHtml = rodadasOrdenadas.map(r => {
            const bonusOnus = r.bonusOnus || 0;
            const pontosCorridos = r.pontosCorridos || 0;
            const mataMata = r.mataMata || 0;
            const top10 = r.top10 || 0;
            const restaUm = r.restaUm || 0;
            const saldoR = bonusOnus + pontosCorridos + mataMata + top10 + restaUm;
            totalRodadas += saldoR;

            const faixas = getFaixasParaRodada(ligaId, r.rodada);
            const isMito = r.posicao === 1;
            const debitoFim = faixas?.debito?.fim || faixas?.totalTimes;
            const isMico = r.posicao && debitoFim && r.posicao === debitoFim;
            const tier = isMito ? 'mito' : isMico ? 'mico' : 'normal';

            const numStr = String(r.rodada).padStart(2, '0');
            const posBadge = r.posicao
                ? `<span class="thermal-ticket__pos-badge" data-pos-tier="${tier}">${r.posicao}º</span>`
                : '';

            const sign = signKey(saldoR);
            const valueText = saldoR === 0 ? '—' : valorTextWithSign(saldoR);
            const rowClass = saldoR === 0
                ? 'thermal-ticket__row thermal-ticket__row--zero'
                : 'thermal-ticket__row';

            // Compor breakdown de componentes != 0
            const breakdown = [];
            if (bonusOnus !== 0) {
                let label;
                if (isMito) label = 'MITO DA RODADA';
                else if (isMico) label = 'MICO DA RODADA';
                else label = bonusOnus > 0 ? 'BONUS POSICAO' : 'ONUS POSICAO';
                breakdown.push({ label, valor: bonusOnus });
            }
            if (pontosCorridos !== 0) breakdown.push({ label: 'PONTOS CORRIDOS', valor: pontosCorridos });
            if (mataMata !== 0) breakdown.push({ label: 'MATA-MATA', valor: mataMata });
            if (top10 !== 0) breakdown.push({ label: top10 > 0 ? 'TOP10 MITO' : 'TOP10 MICO', valor: top10 });
            if (restaUm !== 0) breakdown.push({ label: 'RESTA UM', valor: restaUm });

            // Mostrar breakdown apenas se houver 2+ componentes (single-component é redundante)
            const breakdownHtml = breakdown.length > 1 ? `
                <ul class="thermal-ticket__row-breakdown" role="list">
                    ${breakdown.map(b => {
                        const bSign = signKey(b.valor);
                        const bValor = `${b.valor > 0 ? '+' : '−'}${formatarMoeda(b.valor).replace('R$ ', '')}`;
                        return `
                            <li class="thermal-ticket__row-breakdown-item">
                                <span class="thermal-ticket__row-breakdown-label">${safeEscapeHtml(b.label)}</span>
                                <span class="thermal-ticket__row-breakdown-leader" aria-hidden="true"></span>
                                <span class="thermal-ticket__row-breakdown-value" data-sign="${bSign}">${bValor}</span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            ` : '';

            return `
                <li class="thermal-ticket__row-wrap">
                    <div class="${rowClass}">
                        <span class="thermal-ticket__row-name">RODADA ${numStr}${posBadge}</span>
                        <span class="thermal-ticket__row-leader" aria-hidden="true"></span>
                        <span class="thermal-ticket__row-value" data-sign="${sign}">${valueText}</span>
                    </div>
                    ${breakdownHtml}
                </li>
            `;
        }).join('');

        sections.push(`
            <section class="thermal-ticket__section" data-section="rodadas">
                <h2 class="thermal-ticket__section-title">Rodadas — Temporada ${temporada}</h2>
                <ul class="thermal-ticket__rows" role="list">${rowsHtml}</ul>
                ${renderSubtotal('Subtotal Rodadas', totalRodadas)}
            </section>
        `);
    }

    // --- Premiações & Ajustes (manuais lançados pelo admin) ---
    // Engloba: Melhor do Mês, Campeão de Turnos, Artilheiro, Luva, Capitão,
    // Top10, Copa SC, multas, ajustes manuais. Ordenado cronologicamente por `data`.
    if (ajustes.length > 0) {
        const ajustesOrdenados = [...ajustes].sort((a, b) => {
            const tA = a.data ? new Date(a.data).getTime() : 0;
            const tB = b.data ? new Date(b.data).getTime() : 0;
            return tA - tB; // mais antigo primeiro
        });

        const total = ajustesOrdenados.reduce((s, l) => s + (l.valor || 0), 0);
        const rowsHtml = ajustesOrdenados.map(l => {
            const dataFormatada = l.data
                ? new Date(l.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '';
            return renderRow({
                name: (l.descricao || 'Ajuste').toUpperCase(),
                detail: dataFormatada,
                valor: l.valor || 0
            });
        }).join('');

        sections.push(`
            <section class="thermal-ticket__section" data-section="premiacoes">
                <h2 class="thermal-ticket__section-title">Premiações &amp; Ajustes</h2>
                <ul class="thermal-ticket__rows" role="list">${rowsHtml}</ul>
                ${renderSubtotal('Subtotal Premiações', total)}
            </section>
        `);
    }

    // --- Acertos ---
    if (listaAcertos.length > 0) {
        const acertosOrdenados = [...listaAcertos].sort((a, b) =>
            new Date(b.dataAcerto || b.data || 0) - new Date(a.dataAcerto || a.data || 0));

        let total = 0;
        const rowsHtml = acertosOrdenados.map(a => {
            const isPagamento = a.tipo === 'pagamento';
            const valorAbs = Math.abs(a.valor || 0);
            const valorSinal = isPagamento ? valorAbs : -valorAbs;
            total += valorSinal;

            const metodos = { pix: 'PIX', transferencia: 'TED', dinheiro: 'DINHEIRO', outro: 'OUTRO' };
            const metodo = metodos[a.metodoPagamento] || '';
            const data = (a.dataAcerto || a.data)
                ? new Date(a.dataAcerto || a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : '';
            const detailParts = [metodo, data].filter(Boolean);
            const detail = detailParts.join(' · ');
            const baseLabel = isPagamento ? 'PAGAMENTO' : 'RECEBIMENTO';
            const desc = (a.descricao || baseLabel).toUpperCase();

            return renderRow({ name: desc, detail, valor: valorSinal });
        }).join('');

        sections.push(`
            <section class="thermal-ticket__section" data-section="acertos">
                <h2 class="thermal-ticket__section-title">Acertos</h2>
                <ul class="thermal-ticket__rows" role="list">${rowsHtml}</ul>
                ${renderSubtotal('Subtotal Acertos', total)}
            </section>
        `);
    }

    const sectionsWithDividers = sections.length > 0
        ? sections.join('<div class="thermal-ticket__divider thermal-ticket__divider--dashed" aria-hidden="true"></div>')
        : '';

    const emptyNote = (sections.length === 0)
        ? `<p class="thermal-ticket__note">// Sem movimentações registradas até o momento.</p>`
        : (isPreTemporadaMode && rodadasOrdenadas.length === 0)
            ? `<p class="thermal-ticket__note">// Movimentações por rodada aparecerão a partir da rodada 1.</p>`
            : '';

    // ===== Display final =====
    const isCredito = saldoFinal > 0;
    const isDebito = saldoFinal < 0;
    let displayLabel, displayValueText, displayValueSign, displayStatusText, displayStatusKey;

    if (isPreTemporadaMode) {
        displayLabel = 'Aguardando início';
        displayValueText = valorTextWithSign(saldoFinal);
        displayValueSign = signKey(saldoFinal);
        displayStatusText = 'PRÉ-TEMPORADA';
        displayStatusKey = 'aguardando';
    } else {
        displayLabel = 'Saldo Final';
        displayValueText = valorTextWithSign(saldoFinal);
        displayValueSign = signKey(saldoFinal);
        if (isCredito) {
            displayStatusText = 'CRÉDITO';
            displayStatusKey = 'credito';
        } else if (isDebito) {
            displayStatusText = 'DÉBITO';
            displayStatusKey = 'debito';
        } else {
            displayStatusText = 'QUITADO';
            displayStatusKey = 'quitado';
        }
    }

    // ===== Barcode (decorativo) =====
    const timeId = window.PARTICIPANTE_IDS?.timeId || window.participanteData?.timeId || '0';
    const barcodeNum = `SCM-${temporada}-L${ligaId || '0'}-T${timeId}`.toUpperCase();

    return `
        <section class="thermal-stage">
            <article class="thermal-ticket" role="region" aria-label="Extrato financeiro de ${timeNome}">
                <span class="thermal-ticket__edge thermal-ticket__edge--top" aria-hidden="true"></span>
                <span class="thermal-ticket__pin" aria-hidden="true"></span>

                <header class="thermal-ticket__header">
                    <p class="thermal-ticket__store">Super Cartola Manager</p>
                    <h1 class="thermal-ticket__title"><span>Extrato ${temporada}</span></h1>
                    <p class="thermal-ticket__subtitle">${timeNome}</p>
                    <p class="thermal-ticket__meta">${safeEscapeHtml(ligaNomeRaw)} · ${dataEmissao}</p>
                </header>

                <div class="thermal-ticket__divider thermal-ticket__divider--asterisks" aria-hidden="true">**********************************</div>

                ${sectionsWithDividers}
                ${emptyNote}

                <div class="thermal-ticket__divider thermal-ticket__divider--asterisks" aria-hidden="true">**********************************</div>

                <div class="thermal-ticket__display">
                    <p class="thermal-ticket__display-label">${displayLabel}</p>
                    <p class="thermal-ticket__display-value" data-sign="${displayValueSign}">${displayValueText}</p>
                    <p class="thermal-ticket__display-status" data-status="${displayStatusKey}">${displayStatusText}</p>
                </div>

                <div class="thermal-ticket__barcode" aria-hidden="true">
                    <span class="thermal-ticket__barcode-bars"></span>
                    <span class="thermal-ticket__barcode-num">${barcodeNum}</span>
                </div>

                <footer class="thermal-ticket__footer">
                    <p class="thermal-ticket__footer-thanks">Obrigado por jogar</p>
                    <p>Emitido em ${dataEmissao}</p>
                    <p>Super Cartola Manager</p>
                </footer>

                <span class="thermal-ticket__edge thermal-ticket__edge--bottom" aria-hidden="true"></span>
            </article>
        </section>
    `;
}

// =====================================================================
// ORQUESTRADORES
// =====================================================================

window.renderizarConteudoCompleto = function renderizarConteudoCompleto(container, extrato) {
    const acertos = extrato.acertos || { lista: [], resumo: {} };
    const ligaId = extrato.liga_id
        || extrato.ligaId
        || window.PARTICIPANTE_IDS?.ligaId
        || window.participanteData?.ligaId
        || '';
    window.ligaIdAtual = ligaId;

    if (window.Log) Log.info("[EXTRATO-UI] 🎫 Ticket térmico:", {
        saldo: extrato.saldo,
        rodadas: extrato.rodadas?.length,
        acertos: acertos.lista?.length || 0
    });

    container.innerHTML = renderThermalTicket(extrato, acertos, ligaId, { isPreTemporadaMode: false });
};

function renderizarConteudoRenovadoPreTemporada(container, extrato) {
    const resumoBase = extrato.resumo || {};
    const inscricaoInfo = statusRenovacaoParticipante || {};

    const taxaInscricao = inscricaoInfo.taxaInscricao || resumoBase.taxaInscricao || 180;
    const pagouInscricao = inscricaoInfo.pagouInscricao === true || resumoBase.pagouInscricao === true;
    const saldoAnteriorTransferido = resumoBase.saldoAnteriorTransferido || 0;

    // Construir lançamentos iniciais se ausentes
    const lancamentosIniciais = Array.isArray(extrato.lancamentosIniciais) && extrato.lancamentosIniciais.length > 0
        ? [...extrato.lancamentosIniciais]
        : [];

    if (lancamentosIniciais.length === 0) {
        if (!pagouInscricao && taxaInscricao > 0) {
            lancamentosIniciais.push({
                tipo: 'INSCRICAO_TEMPORADA',
                descricao: 'Taxa de inscrição',
                valor: -taxaInscricao
            });
        }
        if (saldoAnteriorTransferido !== 0) {
            lancamentosIniciais.push({
                tipo: 'SALDO_TEMPORADA_ANTERIOR',
                descricao: saldoAnteriorTransferido > 0 ? 'Crédito da temporada anterior' : 'Dívida da temporada anterior',
                valor: saldoAnteriorTransferido
            });
        }
    }

    const acertos = extrato.acertos || { lista: [], resumo: {} };
    const ligaId = extrato.liga_id
        || extrato.ligaId
        || window.PARTICIPANTE_IDS?.ligaId
        || '';

    const extratoComLancamentos = {
        ...extrato,
        lancamentosIniciais,
        rodadas: [], // força modo pré-temporada
    };

    container.innerHTML = renderThermalTicket(extratoComLancamentos, acertos, ligaId, { isPreTemporadaMode: true });
}

// =====================================================================
// EXPORTED: ENTRY POINT
// =====================================================================

export async function renderizarExtratoParticipante(extrato, participanteId) {
    const container = document.getElementById("fluxoFinanceiroContent");
    if (!container) {
        if (window.Log) Log.error("[EXTRATO-UI] ❌ Container não encontrado!");
        return;
    }

    if (!extrato || !extrato.rodadas || !Array.isArray(extrato.rodadas)) {
        container.innerHTML = renderizarErro();
        return;
    }

    // ✅ Popular ligaConfigCache (zone classification — preservado da v11)
    if (extrato.ligaConfig?.zonaConfig) {
        const zonaConfig = extrato.ligaConfig.zonaConfig;
        ligaConfigCache = {
            liga_id: extrato.ligaId || window.PARTICIPANTE_IDS?.ligaId,
            liga_nome: extrato.ligaConfig.nome || extrato.ligaConfig.liga_nome,
            ranking_rodada: {
                total_participantes: zonaConfig.totalParticipantes || DEFAULT_TOTAL_PARTICIPANTES,
                faixas: zonaConfig.faixas || null,
                temporal: zonaConfig.temporal || false,
                valores: zonaConfig.valores || {},
            },
            modulos_ativos: extrato.ligaConfig.modulosAtivos || {},
        };
        window.ligaConfigCache = ligaConfigCache;
        if (window.Log) Log.debug("[EXTRATO-UI] ✅ ligaConfigCache populado:", { totalParticipantes: zonaConfig.totalParticipantes });
    } else {
        const ligaId = extrato.ligaId || window.PARTICIPANTE_IDS?.ligaId;
        if (ligaId && (!ligaConfigCache || ligaConfigCache.liga_id !== ligaId)) {
            await fetchLigaConfigSilent(ligaId);
            if (window.Log) Log.debug("[EXTRATO-UI] 🔄 ligaConfigCache via fallback API:", { ligaId, populado: !!ligaConfigCache });
        }
    }

    await verificarStatusRenovacao();
    const renovado = statusRenovacaoParticipante?.renovado || false;
    const preTemporada = isPreTemporada(extrato.rodadas);

    const temporadaSelecionada = window.seasonSelector?.getTemporadaSelecionada?.();
    const CONFIG = window.ParticipanteConfig || {};
    const temporadaAtual = CONFIG.CURRENT_SEASON || 2026;
    const visualizandoHistorico = temporadaSelecionada && temporadaSelecionada < temporadaAtual;

    if (window.Log) Log.info("[EXTRATO-UI] 📊 Status:", {
        renovado, preTemporada, rodadas: extrato.rodadas.length,
        temporadaSelecionada, visualizandoHistorico
    });

    window.extratoAtual = extrato;

    if (!visualizandoHistorico && renovado && preTemporada) {
        renderizarConteudoRenovadoPreTemporada(container, extrato);
    } else {
        window.renderizarConteudoCompleto(container, extrato);
    }
}

// =====================================================================
// ERRO STATE
// =====================================================================
function renderizarErro() {
    return `
        <section class="thermal-stage">
            <article class="thermal-ticket" role="alert">
                <header class="thermal-ticket__header">
                    <p class="thermal-ticket__store">Super Cartola Manager</p>
                    <h1 class="thermal-ticket__title"><span>Extrato — Erro</span></h1>
                </header>
                <div class="thermal-ticket__divider thermal-ticket__divider--asterisks" aria-hidden="true">**********************************</div>
                <div class="thermal-ticket__empty">
                    <p style="font-weight:700;margin-bottom:8px">Erro ao carregar extrato</p>
                    <p>Tente novamente em alguns instantes</p>
                    <button onclick="window.forcarRefreshExtratoParticipante && window.forcarRefreshExtratoParticipante()" style="
                        margin-top:16px;padding:10px 20px;
                        background:var(--thermal-ink);color:var(--thermal-paper);
                        border:none;border-radius:2px;
                        font-family:inherit;font-size:11px;font-weight:700;
                        letter-spacing:2px;text-transform:uppercase;cursor:pointer;
                    ">Tentar Novamente</button>
                </div>
            </article>
        </section>
    `;
}

// =====================================================================
// PROJEÇÃO FINANCEIRA EM TEMPO REAL
// Card exibido durante rodada em andamento (status_mercado === 2).
// Importado por participante-extrato.js — manter assinatura.
// Insere card como overlay informacional ABOVE do ticket no container principal.
// =====================================================================

export function renderizarProjecaoFinanceira(projecaoData) {
    if (!projecaoData || !projecaoData.projecao) return;

    let card = document.getElementById("projecaoFinanceiraCard");

    if (!card) {
        const mainContainer = document.getElementById("fluxoFinanceiroContent");
        if (!mainContainer) return;
        card = document.createElement("div");
        card.id = "projecaoFinanceiraCard";
        // Inserir antes do ticket térmico
        mainContainer.insertBefore(card, mainContainer.firstChild);
    }

    const { rodada, time, financeiro, saldo, atualizado_em } = projecaoData;
    const horaAtualizada = atualizado_em
        ? new Date(atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

    const saldoProjetado = saldo?.projetado || 0;
    const saldoCor = saldoProjetado >= 0 ? 'var(--app-success-light, #22c55e)' : 'var(--app-danger-light, #f87171)';
    const sinal = saldoProjetado > 0 ? '+' : saldoProjetado < 0 ? '−' : '';
    const valorAbs = Math.abs(saldoProjetado).toFixed(2).replace('.', ',');
    const posParcial = time?.posicao_parcial || '-';
    const nomeTime = time?.nome_time || 'Meu Time';

    card.innerHTML = `
        <div style="
            margin: 16px 12px 0;
            padding: 14px 16px;
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%);
            border: 1.5px dashed rgba(34, 197, 94, 0.4);
            border-radius: 12px;
            color: var(--app-text-primary, #e5e5e5);
            font-family: 'Inter', sans-serif;
        ">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;animation:app-pulse 2s ease-in-out infinite"></span>
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#22c55e">
                        Projeção R${rodada} ao vivo
                    </span>
                </div>
                <span style="font-size:10px;color:var(--app-text-dim,#9ca3af)">${horaAtualizada}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                <div>
                    <div style="font-size:13px;font-weight:600">${safeEscapeHtml(nomeTime)}</div>
                    <div style="font-size:10px;color:var(--app-text-dim,#9ca3af);margin-top:2px">Posição parcial: ${posParcial}º</div>
                </div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:800;color:${saldoCor}">
                    ${sinal} R$ ${valorAbs}
                </div>
            </div>
        </div>
    `;
}
