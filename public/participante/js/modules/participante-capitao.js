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
import { injectModuleLP } from './module-lp-engine.js';
if (window.Log) Log.info('PARTICIPANTE-CAPITAO', 'Módulo v2.0 carregando...');

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
    window.MatchdayService?.setContext({ ligaId: params.ligaId });

    // ✅ LP: Injetar LP via engine (non-blocking)
    injectModuleLP({
        wrapperId:    'capitao-lp-wrapper',
        insertBefore: 'capitaoContent',
        ligaId:       params.ligaId,
        moduloKey:    'capitao_luxo',
        titulo:       'Capitão de Luxo',
        tagline:      'Quem vai liderar seu time à vitória?',
        icon:         'stars',
        colorClass:   'module-lp-capitao',
    });

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

/** Compacta nome: "Neymar Junior" → "N. Junior" */
function _nomeCompacto(nome) {
    if (!nome) return '?';
    const partes = nome.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].slice(0, 10);
    return partes[0][0] + '. ' + partes[partes.length - 1].slice(0, 9);
}

/** Retorna array de rodadas com capitão compacto para painel colapsável */
function _resumoRodadasCapitao(historico) {
    if (!historico || !Array.isArray(historico)) return [];
    return historico
        .filter(r => r.atleta_nome && r.atleta_nome !== 'Sem capitão')
        .sort((a, b) => a.rodada - b.rodada)
        .map(r => ({
            rodada: r.rodada,
            capitao: escapeHtml(_nomeCompacto(r.atleta_nome)),
            pontos: typeof truncarPontos === 'function'
                ? parseFloat(truncarPontos(r.pontuacao || 0))
                : Math.trunc((r.pontuacao || 0) * 100) / 100,
        }));
}

/**
 * Calcula indicador de tendência: última rodada vs média pessoal
 * @returns {{ icon: string, text: string, cssClass: string }}
 */
function _calcularTendencia(participante) {
    const historico = participante.historico_rodadas || [];
    const media = participante.media_capitao || 0;

    if (historico.length === 0 || media === 0) {
        return { icon: 'trending_flat', text: '', cssClass: 'trend-flat' };
    }

    // Pegar última rodada (maior número)
    const ultimaRodada = historico.reduce((max, r) => r.rodada > max.rodada ? r : max, historico[0]);
    const ultimaPontuacao = ultimaRodada.pontuacao || 0;

    const variacao = Math.trunc(((ultimaPontuacao - media) / Math.abs(media)) * 100);

    if (variacao > 5) {
        return { icon: 'trending_up', text: `+${variacao}%`, cssClass: 'trend-up' };
    } else if (variacao < -5) {
        return { icon: 'trending_down', text: `${variacao}%`, cssClass: 'trend-down' };
    }
    return { icon: 'trending_flat', text: `${variacao}%`, cssClass: 'trend-flat' };
}

function renderizarRanking(ranking) {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    _capitaoRankingCache = ranking;
    window._capitaoRankingCache = ranking; // sync para handlers onclick inline

    // Hint para o usuário
    let html = `
        <div style="font: 400 9px 'Inter', sans-serif; color: #555; text-align: center; padding: 6px 0 10px; border-bottom: 1px solid rgba(255,255,255,0.03); margin-bottom: 8px;">
            <span class="material-icons" style="font-size: 11px; vertical-align: middle;">touch_app</span> toque no participante para ver capitães
        </div>
    `;

    ranking.forEach((participante, index) => {
        const posicao = participante.posicao_final || index + 1;
        const isMeuTime = String(participante.timeId) === String(estadoCapitao.timeId);
        const isPodium1 = posicao === 1;
        const isPodium2 = posicao === 2;
        const isPodium3 = posicao === 3;

        const escudoSrc = participante.escudo || `/escudos/${participante.clube_id || 'default'}.png`;
        const pontos = typeof truncarPontos === 'function' ? truncarPontos(participante.pontuacao_total || 0) : (Math.trunc((participante.pontuacao_total || 0) * 100) / 100).toFixed(2);

        const cardClasses = [
            'capitao-ranking-row',
            isMeuTime ? 'meu-time' : '',
            isPodium1 ? 'podium-1' : '',
            isPodium2 ? 'podium-2' : '',
            isPodium3 ? 'podium-3' : '',
        ].filter(Boolean).join(' ');

        // Badge apenas para o campeão (só 1o lugar premia)
        const campeaoBadge = isPodium1
            ? (estadoCapitao.temporadaEncerrada
                ? '<span class="capitao-badge-captain">CAMPEÃO</span>'
                : '<span class="capitao-badge-captain">[C]</span>')
            : '';

        const historico = participante.historico_rodadas || [];
        const rodadas = _resumoRodadasCapitao(historico);
        const tid = participante.timeId || index;

        // Indicador de tendência (seta + variação %)
        const tendencia = _calcularTendencia(participante);
        const trendHtml = tendencia.text
            ? `<span class="trend-indicator ${tendencia.cssClass}">
                   <span class="material-icons">${tendencia.icon}</span>
                   ${tendencia.text}
               </span>`
            : '';

        // Card/row do ranking
        html += `
            <div class="${cardClasses}" data-timeid="${tid}">
                <div class="capitao-posicao">${posicao}º</div>
                <img src="${escapeHtml(escudoSrc)}" class="capitao-escudo" alt=""
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
                <span class="material-icons" style="display: none; font-size: 32px; color: #666;">emoji_events</span>
                <div class="capitao-info">
                    <div class="capitao-nome">${escapeHtml(participante.nome_cartola || '---')}</div>
                    <div class="capitao-time-nome">${escapeHtml(participante.nome_time || '')}</div>
                </div>
                <div class="capitao-stats">
                    <div class="capitao-stat">
                        <span class="capitao-stat-label">PTS</span>
                        <span class="capitao-stat-value">${pontos}</span>
                    </div>
                    ${trendHtml}
                    ${campeaoBadge}
                    <span class="material-icons capitao-expand-icon">expand_more</span>
                </div>
            </div>
        `;

        // Painel colapsável com histórico de rodadas
        html += `<div class="capitao-collapse-panel" data-panel-timeid="${tid}">`;
        html += '<div class="capitao-collapse-inner">';
        if (rodadas.length > 0) {
            rodadas.forEach(r => {
                const cor = r.pontos >= 10 ? 'var(--capitao-success)' : r.pontos >= 5 ? 'var(--capitao-primary-light)' : r.pontos < 0 ? 'var(--capitao-danger)' : '#888';
                const corPts = r.pontos >= 10 ? 'var(--capitao-success)' : r.pontos >= 5 ? 'var(--capitao-primary-light)' : r.pontos < 0 ? 'var(--capitao-danger)' : '#666';
                html += `<div class="capitao-collapse-rodada">
                    <span class="capitao-collapse-rodada-badge" style="color:${cor};">R${r.rodada}</span>
                    <span class="capitao-collapse-rodada-info">${r.capitao}</span>
                    <span class="capitao-collapse-rodada-pts" style="color:${corPts};">${r.pontos.toFixed(2)}</span>
                </div>`;
            });
        } else {
            html += '<div class="capitao-collapse-vazio">Nenhum capitão registrado</div>';
        }
        html += '</div></div>';
    });

    container.innerHTML = html;

    // Event listeners para toggle dos painéis colapsáveis
    _setupCollapseListeners(container);
}

/** Configura event listeners para os painéis colapsáveis */
function _setupCollapseListeners(container) {
    container.querySelectorAll('.capitao-ranking-row').forEach(row => {
        row.addEventListener('click', () => {
            const tid = row.dataset.timeid;
            const panel = container.querySelector(`.capitao-collapse-panel[data-panel-timeid="${tid}"]`);
            if (!panel) return;

            const isOpen = panel.classList.contains('open');

            // Fechar todos os outros painéis
            container.querySelectorAll('.capitao-collapse-panel.open').forEach(p => {
                p.classList.remove('open');
                p.style.maxHeight = '0';
            });
            container.querySelectorAll('.capitao-ranking-row.expanded').forEach(r => r.classList.remove('expanded'));

            if (!isOpen) {
                row.classList.add('expanded');
                panel.classList.add('open');
                panel.style.maxHeight = panel.scrollHeight + 'px';
            }
        });
    });
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
    const totalRodadas = RODADA_FINAL_CAMPEONATO;

    const melhorPts = melhor ? (typeof truncarPontos === 'function' ? truncarPontos(melhor.pontuacao || 0) : (Math.trunc((melhor.pontuacao || 0) * 100) / 100).toFixed(2)) : '---';

    // Indicador de tendência
    const tendencia = _calcularTendencia(meusDados);
    const trendHtml = tendencia.text
        ? '<span class="trend-indicator ' + tendencia.cssClass + '">'
            + '<span class="material-icons">' + tendencia.icon + '</span>'
            + tendencia.text
            + '</span>'
        : '';

    // Remover card existente anterior (caso de re-render)
    const existente = mainContainer.querySelector('.capitao-desempenho-card');
    if (existente) existente.remove();

    mainContainer.insertAdjacentHTML('afterbegin', `
        <div class="capitao-card capitao-desempenho-card" style="border-color: var(--capitao-primary); background: rgba(139, 92, 246, 0.08); cursor: pointer;"
             onclick="window._abrirHistoricoCapitao(window._capitaoRankingCache[${ranking.indexOf(meusDados)}])">
            <div style="width: 100%;">
                <div class="cap-desemp-header">
                    <div class="cap-desemp-header-left">
                        <span class="material-icons" style="color: var(--capitao-primary); font-size: 20px;">person</span>
                        <span class="cap-desemp-title">Seu Desempenho</span>
                        <span class="capitao-badge-captain">${posicao}º</span>
                    </div>
                    <div class="cap-desemp-pts-wrap">
                        <span class="cap-desemp-pts">${pontos}</span>
                        ${trendHtml}
                    </div>
                </div>
                <div class="cap-desemp-pills">
                    <span class="cap-desemp-pill">Média <strong>${media}</strong></span>
                    <span class="cap-desemp-pill cap-desemp-pill-success">Melhor <strong>${melhorPts}</strong></span>
                    <span class="cap-desemp-pill">${rodadas}/${totalRodadas} rod</span>
                </div>
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
            <p>${escapeHtml(mensagem)}</p>
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

