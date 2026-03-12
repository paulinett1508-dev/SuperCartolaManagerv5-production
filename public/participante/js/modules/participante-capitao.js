// =============================================
// PARTICIPANTE-CAPITAO.JS v2.0.0
// Módulo Capitão de Luxo - App do Participante
// v2.0: Refatoração completa seguindo padrão Artilheiro/Luva de Ouro
//       - Verificação de módulo ativo
//       - Cache IndexedDB (OfflineCache)
//       - Card "Seu Desempenho" individual
//       - Detecção de temporada encerrada
//       - Spinner e loading padronizados
// =============================================
import { RODADA_FINAL_CAMPEONATO } from "/js/config/seasons-client.js";
if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Módulo v2.0 carregando...');

let estadoCapitao = {
    ligaId: null,
    timeId: null,
    temporada: null,
    rankingAtual: null,
    modeLive: false,
    moduloAtivo: false,
    temporadaEncerrada: false,
    inicializado: false,
};

const CACHE_KEY_PREFIX = 'capitao_ranking_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Guard para evitar dupla subscrição de MatchdayService em SPA navigation
let _matchdaySubscribed = false;

// =============================================
// INICIALIZAÇÃO
// =============================================
export async function inicializarCapitaoParticipante(params) {
    if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Inicializando v2.0...', params);

    estadoCapitao.ligaId = params.ligaId;
    estadoCapitao.timeId = params.timeId;
    estadoCapitao.temporada = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();

    // ✅ LP: Init acordeons + carregar regras e premiações (non-blocking)
    _initLPAccordions('capitao-lp-wrapper');
    _lpCarregarComoFunciona(params.ligaId, 'capitao_luxo', 'lp-regras-body-capitao');
    _lpCarregarPremiacoesHibrida(params.ligaId, 'capitao_luxo', 'capitao_luxo_premiacao', 'lp-premiacoes-body-capitao');

    // 1. Verificar se módulo está ativo na liga
    const moduloAtivo = await verificarModuloAtivo();
    if (!moduloAtivo) {
        renderizarModuloInativo();
        return;
    }
    estadoCapitao.moduloAtivo = true;

    // 2. Verificar matchday (parciais)
    // Fallback: se MatchdayService não inicializado, verificar via cartolaState ou fetch direto
    const matchdayAtivo = window.MatchdayService?.isActive;
    const cartolaStateLive = window.cartolaState?.statusMercado === 2 || window.cartolaState?.mercadoFechado === true;
    if (matchdayAtivo || cartolaStateLive) {
        estadoCapitao.modeLive = true;
        if (window.MatchdayService && !_matchdaySubscribed) subscribeMatchdayEvents();
    } else {
        // Último fallback: fetch rápido do status do mercado
        try {
            const resp = await fetch('/api/cartola/mercado/status');
            if (resp.ok) {
                const st = await resp.json();
                if (st?.status_mercado === 2) estadoCapitao.modeLive = true;
            }
        } catch (e) { /* silencioso */ }
    }

    // 3. Verificar temporada encerrada
    await detectarEstadoTemporada();

    // 4. Tentar cache-first
    const dadosCache = await buscarDoCache();
    if (dadosCache) {
        if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Dados do cache disponíveis');
        estadoCapitao.rankingAtual = dadosCache;
        renderizarRanking(dadosCache);
        renderizarCardDesempenho(dadosCache);
    }

    // 5. Buscar dados frescos (sempre, mesmo com cache)
    await carregarRanking();

    estadoCapitao.inicializado = true;
}

// =============================================
// VERIFICAÇÃO DE MÓDULO ATIVO
// =============================================
async function verificarModuloAtivo() {
    try {
        // Tentar obter dados da liga do auth cache
        if (window.participanteAuth?.ligaDataCache) {
            const modulos = window.participanteAuth.ligaDataCache.modulos_ativos || {};
            return modulos.capitaoLuxo === true || modulos.capitao_luxo === true || modulos.capitao === true;
        }

        // Fallback: buscar da API
        if (estadoCapitao.ligaId) {
            const response = await fetch(`/api/ligas/${estadoCapitao.ligaId}`);
            if (response.ok) {
                const liga = await response.json();
                const modulos = liga.modulos_ativos || {};
                return modulos.capitaoLuxo === true || modulos.capitao_luxo === true || modulos.capitao === true;
            }
        }

        // Se não conseguiu verificar, assumir ativo (mais seguro para UX)
        return true;
    } catch (error) {
        if (window.Log) Log.warn('PARTICIPANTE-CAPITAO', 'Erro ao verificar módulo:', error);
        return true;
    }
}

// =============================================
// DETECÇÃO DE TEMPORADA
// =============================================
async function detectarEstadoTemporada() {
    try {
        if (window.SeasonStatusManager) {
            const status = window.SeasonStatusManager.getStatus();
            estadoCapitao.temporadaEncerrada = status === 'encerrada';
            return;
        }

        // Fallback: verificar via status do mercado
        const response = await fetch('/api/cartola/mercado/status');
        if (response.ok) {
            const data = await response.json();
            estadoCapitao.temporadaEncerrada = data.status_mercado === 4 || data.status_mercado === 6;
        }
    } catch (error) {
        if (window.Log) Log.warn('PARTICIPANTE-CAPITAO', 'Erro detectar temporada:', error);
    }
}

// =============================================
// CACHE (IndexedDB via OfflineCache)
// =============================================
async function buscarDoCache() {
    try {
        if (!window.OfflineCache) return null;
        const key = `${CACHE_KEY_PREFIX}${estadoCapitao.ligaId}_${estadoCapitao.temporada}`;
        const cached = await window.OfflineCache.get('ranking', key);
        if (cached && cached.data && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function salvarNoCache(ranking) {
    try {
        if (!window.OfflineCache) return;
        const key = `${CACHE_KEY_PREFIX}${estadoCapitao.ligaId}_${estadoCapitao.temporada}`;
        await window.OfflineCache.set('ranking', key, ranking);
    } catch (error) {
        // Cache falhou, não é crítico
    }
}

// =============================================
// CARREGAR RANKING (API)
// =============================================
async function carregarRanking() {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    // Mostrar loading só se não tem cache
    if (!estadoCapitao.rankingAtual) {
        container.innerHTML = `
            <div class="loading-participante text-center py-10">
                <div class="spinner-capitao"></div>
                <p class="loading-text">Carregando capitães...</p>
            </div>
        `;
    }

    try {
        const endpoint = estadoCapitao.modeLive
            ? `/api/capitao/${estadoCapitao.ligaId}/ranking-live`
            : `/api/capitao/${estadoCapitao.ligaId}/ranking?temporada=${estadoCapitao.temporada}`;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!data.success || !data.ranking || data.ranking.length === 0) {
            if (!estadoCapitao.rankingAtual) {
                renderizarVazio();
            }
            return;
        }

        // ✅ FIX: Limpar flags parciais stale quando mercado está aberto (rodada encerrada)
        if (!estadoCapitao.modeLive && data.ranking) {
            data.ranking.forEach(p => {
                if (p.historico_rodadas) {
                    p.historico_rodadas.forEach(h => {
                        if (h.parcial === true) {
                            h.parcial = false;
                            h.jogou = null;
                        }
                    });
                }
            });
        }

        estadoCapitao.rankingAtual = data.ranking;
        renderizarRanking(data.ranking);
        renderizarCardDesempenho(data.ranking);

        // Salvar no cache (apenas dados consolidados, não live)
        if (!estadoCapitao.modeLive) {
            await salvarNoCache(data.ranking);
        }
    } catch (error) {
        if (window.Log) Log.error('PARTICIPANTE-CAPITAO', 'Erro ao carregar:', error);
        if (!estadoCapitao.rankingAtual) {
            renderizarErro('Erro ao carregar ranking');
        }
    }
}

// =============================================
// RENDER: RANKING
// =============================================

// Cache de participantes para o modal de histórico — evita JSON.stringify inline (XSS)
// Atualizado a cada render via window._capitaoRankingCache para acesso em onclick inline
let _capitaoRankingCache = [];

function renderizarRanking(ranking) {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    _capitaoRankingCache = ranking;
    window._capitaoRankingCache = ranking; // sync para handlers onclick inline
    let html = '';

    ranking.forEach((participante, index) => {
        const posicao = participante.posicao_final || index + 1;
        const isMeuTime = String(participante.timeId) === String(estadoCapitao.timeId);
        const isPodium1 = posicao === 1;

        const escudoSrc = participante.escudo || `/escudos/${participante.clube_id || 'default'}.png`;
        const pontos = typeof truncarPontos === 'function' ? truncarPontos(participante.pontuacao_total || 0) : (Math.trunc((participante.pontuacao_total || 0) * 100) / 100).toFixed(2);
        const media = typeof truncarPontos === 'function' ? truncarPontos(participante.media_capitao || 0) : (Math.trunc((participante.media_capitao || 0) * 100) / 100).toFixed(2);

        const cardClasses = [
            'capitao-card',
            isMeuTime ? 'meu-time' : '',
            isPodium1 ? 'podium-1' : '',
        ].filter(Boolean).join(' ');

        const posicaoIcon = `${posicao}º`;

        // Badge apenas para o campeão (só 1o lugar premia)
        const campeaoBadge = isPodium1
            ? (estadoCapitao.temporadaEncerrada
                ? '<span class="capitao-badge-captain">CAMPEÃO</span>'
                : '<span class="capitao-badge-captain">[C]</span>')
            : '';

        // ✅ NOVO LAYOUT: Botão "Ver Histórico" compacto
        const historico = participante.historico_rodadas || [];
        const rodadasJogadas = historico.length;
        const totalRodadas = RODADA_FINAL_CAMPEONATO;

        // Botão Ver Histórico (somente se tiver dados)
        let btnHistoricoHtml = '';
        if (historico.length > 0) {
            btnHistoricoHtml = `
                <button class="btn-ver-historico-app"
                        onclick="window._abrirHistoricoCapitao(window._capitaoRankingCache[${index}])"
                        aria-label="Ver histórico completo">
                    <span class="material-icons" style="font-size: 14px;">history</span>
                    ${rodadasJogadas}/${totalRodadas} rodadas
                </button>
            `;
        }

        html += `
            <div class="${cardClasses}" onclick="${historico.length > 0 ? `window._abrirHistoricoCapitao(window._capitaoRankingCache[${index}])` : ''}">
                <div class="capitao-posicao">${posicaoIcon}</div>
                <img src="${escudoSrc}" class="capitao-escudo" alt=""
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
                <span class="material-icons" style="display: none; font-size: 32px; color: #666;">emoji_events</span>
                <div class="capitao-info">
                    <div class="capitao-nome">${escapeHtml(participante.nome_cartola || '---')}</div>
                    <div class="capitao-time-nome">${escapeHtml(participante.nome_time || '')}</div>
                    ${btnHistoricoHtml}
                </div>
                <div class="capitao-stats">
                    <div class="capitao-stat">
                        <span class="capitao-stat-label">PTS</span>
                        <span class="capitao-stat-value">${pontos}</span>
                    </div>
                    <div class="capitao-stat">
                        <span class="capitao-stat-label">MED</span>
                        <span class="capitao-stat-value media">${media}</span>
                    </div>
                    ${campeaoBadge}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// =============================================
// RENDER: CARD DESEMPENHO INDIVIDUAL
// =============================================
function renderizarCardDesempenho(ranking) {
    const mainContainer = document.getElementById('capitaoContent');
    if (!mainContainer || !estadoCapitao.timeId) return;

    const meusDados = ranking.find(
        p => String(p.timeId) === String(estadoCapitao.timeId)
    );

    if (!meusDados) return;

    const posicao = meusDados.posicao_final || (ranking.indexOf(meusDados) + 1);
    const pontos = typeof truncarPontos === 'function' ? truncarPontos(meusDados.pontuacao_total || 0) : (Math.trunc((meusDados.pontuacao_total || 0) * 100) / 100).toFixed(2);
    const media = typeof truncarPontos === 'function' ? truncarPontos(meusDados.media_capitao || 0) : (Math.trunc((meusDados.media_capitao || 0) * 100) / 100).toFixed(2);
    const rodadas = meusDados.rodadas_jogadas || 0;
    const melhor = meusDados.melhor_capitao;
    const pior = meusDados.pior_capitao;
    const distintos = meusDados.capitaes_distintos || 0;

    // Extrair HTML nested para evitar backtick nesting (causa SyntaxError)
    const melhorPts = melhor ? (typeof truncarPontos === 'function' ? truncarPontos(melhor.pontuacao || 0) : (Math.trunc((melhor.pontuacao || 0) * 100) / 100).toFixed(2)) : '';
    const piorPts = pior ? (typeof truncarPontos === 'function' ? truncarPontos(pior.pontuacao || 0) : (Math.trunc((pior.pontuacao || 0) * 100) / 100).toFixed(2)) : '';

    let melhorPiorHtml = '';
    if (melhor) {
        const piorHtml = pior
            ? '<div style="font-size: 11px;">'
                + '<span style="color: var(--capitao-danger);">Pior:</span> '
                + '<span style="color: #e5e7eb;">' + escapeHtml(pior.atleta_nome || '---') + ' (R' + pior.rodada + ')</span> '
                + '<span style="font-family: var(--capitao-font-mono); color: var(--capitao-danger); font-weight: 700;">' + piorPts + '</span>'
                + '</div>'
            : '';
        melhorPiorHtml = '<div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--capitao-border);">'
            + '<div style="font-size: 11px;">'
            + '<span style="color: var(--capitao-success);">Melhor:</span> '
            + '<span style="color: #e5e7eb;">' + escapeHtml(melhor.atleta_nome || '---') + ' (R' + melhor.rodada + ')</span> '
            + '<span style="font-family: var(--capitao-font-mono); color: var(--capitao-success); font-weight: 700;">' + melhorPts + '</span>'
            + '</div>'
            + piorHtml
            + '</div>';
    }

    const historicoHtml = _renderHistoricoDesempenho(meusDados.historico_rodadas);

    mainContainer.insertAdjacentHTML('afterbegin', `
        <div class="capitao-card" style="border-color: var(--capitao-primary); background: rgba(139, 92, 246, 0.08);">
            <div style="width: 100%;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span class="material-icons" style="color: var(--capitao-primary); font-size: 20px;">person</span>
                    <span style="font-family: var(--capitao-font-brand); color: var(--app-text-primary); font-size: 14px;">Seu Desempenho</span>
                    <span class="capitao-badge-captain">${posicao}º lugar</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
                    <div>
                        <span style="display: block; font-size: 10px; color: var(--capitao-text-muted);">Pontos</span>
                        <span style="font-family: var(--capitao-font-mono); font-size: 16px; font-weight: 700; color: var(--capitao-primary);">${pontos}</span>
                    </div>
                    <div>
                        <span style="display: block; font-size: 10px; color: var(--capitao-text-muted);">Média</span>
                        <span style="font-family: var(--capitao-font-mono); font-size: 16px; color: var(--capitao-primary-light);">${media}</span>
                    </div>
                    <div>
                        <span style="display: block; font-size: 10px; color: var(--capitao-text-muted);">Rodadas</span>
                        <span style="font-family: var(--capitao-font-mono); font-size: 16px; color: #e5e7eb;">${rodadas}</span>
                    </div>
                </div>
                ${melhorPiorHtml}
                <div style="margin-top: 8px; font-size: 11px; color: var(--capitao-text-muted);">
                    Capitães distintos utilizados: <strong style="color: #e5e7eb;">${distintos}</strong>
                </div>
                ${historicoHtml}
            </div>
        </div>
    `);
}

// =============================================
// HELPER: CHIP INDIVIDUAL
// =============================================
const MAX_CHIPS_VISIBLE = 5;

function _renderChipHtml(r) {
    const pts = (Math.trunc((r.pontuacao || 0) * 10) / 10).toFixed(1);
    const isParcial = r.parcial === true;
    const corPts = r.pontuacao >= 10 ? 'var(--app-success-light)' : r.pontuacao >= 5 ? '#fbbf24' : r.pontuacao < 0 ? 'var(--app-danger)' : '#9ca3af';

    let dotHtml = '';
    if (isParcial) {
        if (r.jogou === false) {
            dotHtml = '<span class="cap-dot cap-dot-pending"></span>';
        } else if (r.pontuacao > 0) {
            dotHtml = '<span class="cap-dot cap-dot-positive"></span>';
        } else if (r.pontuacao < 0) {
            dotHtml = '<span class="cap-dot cap-dot-negative"></span>';
        } else {
            dotHtml = '<span class="cap-dot cap-dot-neutral"></span>';
        }
    }

    return `<span class="cap-chip${isParcial && r.jogou === false ? ' cap-chip-pending' : ''}"><span class="cap-chip-rod">R${r.rodada}</span> ${escapeHtml(r.atleta_nome || '?')} <span style="color:${corPts}; font-family:var(--capitao-font-mono); font-weight:600;">${pts}</span>${dotHtml}</span>`;
}

// =============================================
// HELPER: HISTORICO CHIPS COM COLLAPSE (últimas 5 + expandir)
// =============================================
function _renderHistoricoChips(historico, uniqueId) {
    if (!historico || historico.length === 0) return '';

    const total = historico.length;

    if (total <= MAX_CHIPS_VISIBLE) {
        // Poucos chips: mostrar todos sem toggle
        const chips = historico.map(r => _renderChipHtml(r)).join('');
        return `<div class="cap-historico">${chips}</div>`;
    }

    // Muitos chips: mostrar últimas 5 + botão expandir
    const ultimas = historico.slice(-MAX_CHIPS_VISIBLE);
    const anteriores = historico.slice(0, total - MAX_CHIPS_VISIBLE);
    const chipsVisiveis = ultimas.map(r => _renderChipHtml(r)).join('');
    const chipsOcultos = anteriores.map(r => _renderChipHtml(r)).join('');
    const hiddenCount = anteriores.length;

    return `
        <div class="cap-historico cap-historico-collapsible">
            <div class="cap-historico-hidden" id="capHist_${uniqueId}" style="display:none;">${chipsOcultos}</div>
            ${chipsVisiveis}
            <span class="cap-chip cap-chip-toggle" onclick="(function(el){var h=document.getElementById('capHist_${uniqueId}');var show=h.style.display==='none';h.style.display=show?'flex':'none';el.textContent=show?'▲ fechar':'▼ +${hiddenCount}'})(this)">▼ +${hiddenCount}</span>
        </div>`;
}

// =============================================
// HELPER: HISTORICO CHIPS PARA CARD DESEMPENHO
// =============================================
function _renderHistoricoDesempenho(historico) {
    if (!historico || historico.length === 0) return '';

    const chipsHtml = _renderHistoricoChips(historico, 'desempenho');

    return `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--capitao-border);">
            <div style="font-size: 10px; color: var(--capitao-text-muted); margin-bottom: 6px;">Seus capitães por rodada:</div>
            ${chipsHtml}
        </div>
    `;
}

// =============================================
// RENDER: ESTADOS
// =============================================
function renderizarModuloInativo() {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    container.innerHTML = `
        <div class="capitao-modulo-inativo">
            <span class="material-icons">military_tech</span>
            <p style="font-size: 16px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 8px;">Capitão de Luxo</p>
            <p>Este módulo não está ativo nesta liga.</p>
            <p style="font-size: 12px; margin-top: 8px;">Converse com o administrador da liga para ativá-lo.</p>
        </div>
    `;
}

function renderizarVazio() {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    container.innerHTML = `
        <div class="capitao-empty">
            <span class="material-icons">military_tech</span>
            <p style="font-size: 14px; color: var(--app-text-primary); margin-bottom: 8px;">Sem dados disponíveis</p>
            <p>O ranking de capitães será atualizado após a consolidação das rodadas.</p>
        </div>
    `;
}

function renderizarErro(mensagem) {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    container.innerHTML = `
        <div class="capitao-error">
            <span class="material-icons" style="font-size: 36px;">warning</span>
            <p>${mensagem}</p>
        </div>
    `;
}

// =============================================
// MATCHDAY EVENTS
// =============================================
function subscribeMatchdayEvents() {
    if (!window.MatchdayService) return;
    _matchdaySubscribed = true;

    window.MatchdayService.on('data:parciais', () => {
        if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Atualizando com parciais');
        carregarRanking();
    });

    window.MatchdayService.on('matchday:stop', () => {
        estadoCapitao.modeLive = false;
        carregarRanking();
    });
}

// =============================================
// ABRIR MODAL DE HISTÓRICO
// =============================================
window._abrirHistoricoCapitao = function(participante) {
    if (window.CapitaoHistoricoModal) {
        window.CapitaoHistoricoModal.abrir(participante);
    } else {
        console.error('❌ [PARTICIPANTE-CAPITAO] Modal de histórico não carregado');
        alert('Erro ao carregar histórico. Atualize a página.');
    }
};

// =============================================
// EXPORT GLOBAL
// =============================================
window.inicializarCapitaoParticipante = inicializarCapitaoParticipante;

// =============================================
// DESTRUTOR — Cleanup ao navegar para outro módulo
// =============================================
export function destruirCapitaoParticipante() {
    if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Destruindo módulo (cleanup)');
    estadoCapitao.ligaId = null;
    estadoCapitao.timeId = null;
    estadoCapitao.rankingAtual = null;
    estadoCapitao.modeLive = false;
    estadoCapitao.inicializado = false;
    _matchdaySubscribed = false;
}
window.destruirCapitaoParticipante = destruirCapitaoParticipante;

if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Módulo v2.0 pronto');

// =============================================
// MODULE LP — Landing Page Utils (Capitão)
// =============================================

/** Carrega "Como Funciona" da API regras-modulos (admin editável) */
function _lpCarregarComoFunciona(ligaId, moduloKey, bodyId) {
    const body = document.getElementById(bodyId);
    if (!body || !ligaId) return;
    fetch(`/api/regras-modulos/${ligaId}/${moduloKey}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (data?.regra?.conteudo_html) {
                body.innerHTML = `<div class="module-lp-regras-content">${data.regra.conteudo_html}</div>`;
            } else {
                body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);">Regras ainda nao configuradas pelo admin.</p>';
            }
        })
        .catch(() => {
            body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);">Nao foi possivel carregar as regras.</p>';
        });
}

function _initLPAccordions(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.querySelectorAll('.module-lp-accordion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!isOpen));
        });
    });
}

function _lpFormatCurrency(val) {
    const n = parseFloat(val) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Híbrida: tenta carregar valores reais de financeiro_override (ModuleConfig),
 * se não existir usa texto descritivo de regras-modulos como fallback.
 */
function _lpCarregarPremiacoesHibrida(ligaId, moduloSlug, regraKey, bodyId) {
    const body = document.getElementById(bodyId);
    if (!body || !ligaId) return;

    fetch(`/api/liga/${ligaId}/modulos/${moduloSlug}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            const fo = data?.config?.financeiro_override || data?.financeiro_override;
            const html = fo ? _lpRenderFinanceiroHtml(fo) : '';
            if (html) {
                body.innerHTML = html;
                return;
            }
            return fetch(`/api/regras-modulos/${ligaId}/${regraKey}`)
                .then(r => r.ok ? r.json() : null)
                .then(rd => {
                    if (rd?.regra?.conteudo_html) {
                        body.innerHTML = `<div class="module-lp-premiacoes-content">${rd.regra.conteudo_html}</div>`;
                    } else {
                        body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);text-align:center;">Premiacoes ainda nao configuradas pelo admin.</p>';
                    }
                });
        })
        .catch(() => { body.innerHTML = '<p style="color:var(--app-text-muted);font-size:var(--app-font-sm);text-align:center;">Nao foi possivel carregar as premiacoes.</p>'; });
}

function _lpRenderFinanceiroHtml(fo) {
    const posLabels = { '1': '1º Lugar', '2': '2º Lugar', '3': '3º Lugar', '4': '4º Lugar', '5': '5º Lugar' };
    const posClasses = { '1': 'pos-1', '2': 'pos-2', '3': 'pos-3' };
    const keyLabels = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', por_gol: 'Por Gol', campeao: 'Campeão' };
    let html = '';
    if (fo.valores_por_posicao && Object.keys(fo.valores_por_posicao).length) {
        Object.entries(fo.valores_por_posicao)
            .sort(([a], [b]) => Number(a) - Number(b))
            .filter(([, val]) => Number(val) > 0)
            .forEach(([pos, val]) => {
                html += `<div class="module-lp-premiacoes-item">
                    <span class="module-lp-premiacoes-pos ${posClasses[pos] || ''}">${posLabels[pos] || pos + 'º'}</span>
                    <span class="module-lp-premiacoes-val">${_lpFormatCurrency(val)}</span>
                </div>`;
            });
    } else if (fo.valores_simples && Object.keys(fo.valores_simples).length) {
        Object.entries(fo.valores_simples).forEach(([key, val]) => {
            html += `<div class="module-lp-premiacoes-item">
                <span class="module-lp-premiacoes-pos">${keyLabels[key] || key}</span>
                <span class="module-lp-premiacoes-val">${_lpFormatCurrency(val)}</span>
            </div>`;
        });
    } else if (fo.valores_por_fase) {
        Object.entries(fo.valores_por_fase).forEach(([fase, vals]) => {
            if (vals?.vitoria !== undefined) {
                html += `<div class="module-lp-premiacoes-item">
                    <span class="module-lp-premiacoes-pos">${fase} — Vitória</span>
                    <span class="module-lp-premiacoes-val">${_lpFormatCurrency(vals.vitoria)}</span>
                </div>`;
            }
        });
    }
    return html ? `<div class="module-lp-premiacoes-grid">${html}</div>` : '';
}

