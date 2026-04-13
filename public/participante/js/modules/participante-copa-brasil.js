// participante-copa-brasil.js
// v3.0 - Controller da Landing Page "Copa do Brasil 2026"
// v3.0: Simplificado — apenas confrontos da fase atual com dados dinâmicos via API
// v2.0: Dados dinâmicos via /api/competicao/copa-brasil (SoccerDataAPI + Globo)
//
// Fontes de dados:
//   - API: /api/competicao/copa-brasil/resumo (resultados dinâmicos para enriquecer confrontos)
//   - Fallback: confrontos hardcoded abaixo
//
// Segurança: innerHTML usado apenas com dados hardcoded (CONFRONTOS_5A_FASE) ou
// valores numéricos de placar. Strings de nomes são escapadas via escapeHtml().

// Dados dinâmicos da API
let dadosAPICopaBR = null;

// Confrontos da 5ª Fase — Sorteio realizado em 23/03/2026 na CBF
const CONFRONTOS_5A_FASE = [
    { mandanteIda: 'Ceará',          visitanteIda: 'Atlético-MG' },
    { mandanteIda: 'Goiás',          visitanteIda: 'Cruzeiro' },
    { mandanteIda: 'Atlético-GO',    visitanteIda: 'Athletico-PR' },
    { mandanteIda: 'Vitória',        visitanteIda: 'Flamengo' },
    { mandanteIda: 'Confiança',      visitanteIda: 'Grêmio' },
    { mandanteIda: 'Paysandu',       visitanteIda: 'Vasco' },
    { mandanteIda: 'CRB',            visitanteIda: 'Fortaleza' },
    { mandanteIda: 'Remo',           visitanteIda: 'Bahia' },
    { mandanteIda: 'Chapecoense',    visitanteIda: 'Botafogo' },
    { mandanteIda: 'Mirassol',       visitanteIda: 'RB Bragantino' },
    { mandanteIda: 'Barra-SC',       visitanteIda: 'Corinthians' },
    { mandanteIda: 'Operário-PR',    visitanteIda: 'Fluminense' },
    { mandanteIda: 'Jacuipense',     visitanteIda: 'Palmeiras' },
    { mandanteIda: 'Athletic-MG',    visitanteIda: 'Internacional' },
    { mandanteIda: 'Coritiba',       visitanteIda: 'Santos' },
    { mandanteIda: 'Juventude',      visitanteIda: 'São Paulo' },
];

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Gera sigla de 2-3 letras para badge visual do time.
 * Input: constante hardcoded CONFRONTOS_5A_FASE ou string escapada.
 * Ex: "Atlético-MG" → "ATL", "RB Bragantino" → "RBB", "Flamengo" → "FLA"
 */
function _gerarSigla(nome) {
    if (!nome) return '?';
    const palavras = nome.trim().split(/[\s\-]+/).filter(p => p.length > 0);
    if (palavras.length === 1) return nome.substring(0, 3).toUpperCase();
    if (palavras.length === 2) return (palavras[0].substring(0, 2) + palavras[1][0]).toUpperCase();
    return palavras.slice(0, 3).map(p => p[0]).join('').toUpperCase();
}

// ═══════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

export async function inicializarCopaBrasilParticipante(params) {
    if (window.Log) Log.info('COPA-BRASIL', 'Inicializando LP Copa do Brasil 2026 v3.0...');

    window.destruirCopaBrasilParticipante = destruirCopaBrasilParticipante;

    try {
        dadosAPICopaBR = await carregarDadosAPICopaBR();
        renderizarConfrontos5aFase();
        if (window.Log) Log.info('COPA-BRASIL', dadosAPICopaBR ? 'LP com dados dinâmicos' : 'LP com dados estáticos');
    } catch (erro) {
        console.error('[COPA-BRASIL] Erro na inicialização:', erro);
        renderizarConfrontos5aFase();
    }
}

export function destruirCopaBrasilParticipante() {
    dadosAPICopaBR = null;
}

// ═══════════════════════════════════════════════════
// API DINÂMICA
// ═══════════════════════════════════════════════════

async function carregarDadosAPICopaBR() {
    try {
        const res = await fetch('/api/competicao/copa-brasil/resumo');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.success && (data.ultimos_resultados?.length > 0 || data.proximos_jogos?.length > 0)) ? data : null;
    } catch (err) {
        if (window.Log) Log.warn('COPA-BRASIL', 'API indisponível, usando fallback:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// CONFRONTOS 5ª FASE
// ═══════════════════════════════════════════════════

function renderizarConfrontos5aFase() {
    const container = document.getElementById('copabr-confrontos-5fase');
    if (!container) return;

    const resultadosAPI = dadosAPICopaBR?.ultimos_resultados || [];

    // Construir HTML — nomes de times são hardcoded (CONFRONTOS_5A_FASE)
    // e valores da API são numéricos (placar) ou escapados via escapeHtml()
    const itens = CONFRONTOS_5A_FASE.map(c => {
        const resultadoIda = resultadosAPI.find(r =>
            r.mandante?.toLowerCase().includes(c.mandanteIda.toLowerCase()) &&
            r.visitante?.toLowerCase().includes(c.visitanteIda.toLowerCase())
        );
        const resultadoVolta = resultadosAPI.find(r =>
            r.mandante?.toLowerCase().includes(c.visitanteIda.toLowerCase()) &&
            r.visitante?.toLowerCase().includes(c.mandanteIda.toLowerCase())
        );

        const temIda   = resultadoIda   && resultadoIda.placar_mandante   !== null;
        const temVolta = resultadoVolta && resultadoVolta.placar_mandante !== null;
        const aoVivo   = resultadoIda?.status === 'ao_vivo' || resultadoVolta?.status === 'ao_vivo';

        // Siglas a partir dos nomes hardcoded — sem risco XSS
        const siglaM = escapeHtml(_gerarSigla(c.mandanteIda));
        const siglaV = escapeHtml(_gerarSigla(c.visitanteIda));
        const nomeM  = escapeHtml(c.mandanteIda);
        const nomeV  = escapeHtml(c.visitanteIda);

        // Placar: valores são Number.isInteger, sem HTML livre
        let placarHtml;
        if (temIda || temVolta) {
            const pIdaM = temIda   ? Number(resultadoIda.placar_mandante)   : null;
            const pIdaV = temIda   ? Number(resultadoIda.placar_visitante)  : null;
            const pVltM = temVolta ? Number(resultadoVolta.placar_mandante) : null;
            const pVltV = temVolta ? Number(resultadoVolta.placar_visitante): null;
            const idaNum   = temIda   ? `${pIdaM}&ndash;${pIdaV}` : '&ndash;';
            const voltaNum = temVolta ? `${pVltM}&ndash;${pVltV}` : '&ndash;';
            placarHtml = `<div class="copabr-placar-jogos">
                <span class="copabr-placar-leg">Ida</span>
                <span class="copabr-placar-num${temIda   ? '' : ' copabr-placar-num--pend'}">${idaNum}</span>
                <span class="copabr-placar-leg">Volta</span>
                <span class="copabr-placar-num${temVolta ? '' : ' copabr-placar-num--pend'}">${voltaNum}</span>
            </div>`;
        } else {
            placarHtml = `<div class="copabr-placar-vs">vs</div>`;
        }

        const liveClass = aoVivo ? ' copabr-confronto-card--live' : '';
        const liveDot   = aoVivo ? '<span class="copabr-live-dot"></span>' : '';

        return `<div class="copabr-confronto-card${liveClass}">
            <div class="copabr-confronto-team">
                <div class="copabr-confronto-badge">${siglaM}</div>
                <span class="copabr-confronto-nome">${nomeM}</span>
            </div>
            <div class="copabr-confronto-meio">${liveDot}${placarHtml}</div>
            <div class="copabr-confronto-team copabr-confronto-team--away">
                <span class="copabr-confronto-nome">${nomeV}</span>
                <div class="copabr-confronto-badge">${siglaV}</div>
            </div>
        </div>`;
    });

    container.innerHTML = itens.join('');
}
