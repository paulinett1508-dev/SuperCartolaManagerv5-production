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
    _lpCarregarPremiacoes(params.ligaId, 'capitao_luxo', 'lp-premiacoes-body-capitao', 'lp-premiacoes-accordion-capitao');

    // 1. Verificar se módulo está ativo na liga
    const moduloAtivo = await verificarModuloAtivo();
    if (!moduloAtivo) {
        renderizarModuloInativo();
        return;
    }
    estadoCapitao.moduloAtivo = true;

    // 2. Verificar matchday (parciais)
    if (window.MatchdayService && window.MatchdayService.isActive) {
        estadoCapitao.modeLive = true;
        subscribeMatchdayEvents();
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
        _lpRenderRankingStatus({ ranking: dadosCache }, estadoCapitao.timeId, 'capitao', ['pontuacao_total'], 'pts');
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
            const rodada = data.rodada_atual || 1;
            const mercadoAberto = data.status_mercado !== 2;
            estadoCapitao.temporadaEncerrada = rodada >= 38 && mercadoAberto;
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
        // ✅ LP: Atualizar seções de status com dados frescos
        _lpRenderRankingStatus({ ranking: data.ranking }, estadoCapitao.timeId, 'capitao', ['pontuacao_total'], 'pts');

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
function renderizarRanking(ranking) {
    const container = document.getElementById('capitaoContent');
    if (!container) return;

    let html = '';

    ranking.forEach((participante, index) => {
        const posicao = participante.posicao_final || index + 1;
        const isMeuTime = String(participante.timeId) === String(estadoCapitao.timeId);
        const isPodium1 = posicao === 1;
        const isPodium2 = posicao === 2;
        const isPodium3 = posicao === 3;

        const escudoSrc = participante.escudo || `/escudos/${participante.clube_id || 'default'}.png`;
        const pontos = typeof truncarPontos === 'function' ? truncarPontos(participante.pontuacao_total || 0) : (participante.pontuacao_total || 0).toFixed(2);
        const media = typeof truncarPontos === 'function' ? truncarPontos(participante.media_capitao || 0) : (participante.media_capitao || 0).toFixed(2);

        const cardClasses = [
            'capitao-card',
            isMeuTime ? 'meu-time' : '',
            isPodium1 ? 'podium-1' : '',
            isPodium2 ? 'podium-2' : '',
            isPodium3 ? 'podium-3' : '',
        ].filter(Boolean).join(' ');

        const posicaoIcon = isPodium1 ? '🥇' : isPodium2 ? '🥈' : isPodium3 ? '🥉' : `${posicao}º`;

        // Badge de campeão confirmado
        const campeaoBadge = isPodium1 && estadoCapitao.temporadaEncerrada
            ? '<span class="capitao-badge-captain">CAMPEÃO</span>'
            : '<span class="capitao-badge-captain">[C]</span>';

        // ✅ NOVO LAYOUT: Botão "Ver Histórico" compacto
        const historico = participante.historico_rodadas || [];
        const rodadasJogadas = historico.length;
        const totalRodadas = 38;

        // Botão Ver Histórico (somente se tiver dados)
        let btnHistoricoHtml = '';
        if (historico.length > 0) {
            const participanteJson = JSON.stringify(participante).replace(/"/g, '&quot;');
            btnHistoricoHtml = `
                <button class="btn-ver-historico-app"
                        onclick='window._abrirHistoricoCapitao(${participanteJson})'
                        aria-label="Ver histórico completo">
                    <span class="material-icons" style="font-size: 14px;">history</span>
                    ${rodadasJogadas}/${totalRodadas} rodadas
                </button>
            `;
        }

        html += `
            <div class="${cardClasses}" onclick='${historico.length > 0 ? `window._abrirHistoricoCapitao(${JSON.stringify(participante).replace(/"/g, '&quot;')})` : ''}'>
                <div class="capitao-posicao">${posicaoIcon}</div>
                <img src="${escudoSrc}" class="capitao-escudo" alt=""
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
                <span class="material-icons" style="display: none; font-size: 32px; color: #666;">emoji_events</span>
                <div class="capitao-info">
                    <div class="capitao-nome">${participante.nome_cartola || '---'}</div>
                    <div class="capitao-time-nome">${participante.nome_time || ''}</div>
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
    const pontos = typeof truncarPontos === 'function' ? truncarPontos(meusDados.pontuacao_total || 0) : (meusDados.pontuacao_total || 0).toFixed(2);
    const media = typeof truncarPontos === 'function' ? truncarPontos(meusDados.media_capitao || 0) : (meusDados.media_capitao || 0).toFixed(2);
    const rodadas = meusDados.rodadas_jogadas || 0;
    const melhor = meusDados.melhor_capitao;
    const pior = meusDados.pior_capitao;
    const distintos = meusDados.capitaes_distintos || 0;

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
                ${melhor ? `
                <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--capitao-border);">
                    <div style="font-size: 11px;">
                        <span style="color: var(--capitao-success);">Melhor:</span>
                        <span style="color: #e5e7eb;">${melhor.atleta_nome || '---'} (R${melhor.rodada})</span>
                        <span style="font-family: var(--capitao-font-mono); color: var(--capitao-success); font-weight: 700;">${typeof truncarPontos === 'function' ? truncarPontos(melhor.pontuacao || 0) : (melhor.pontuacao || 0).toFixed(2)}</span>
                    </div>
                    ${pior ? `
                    <div style="font-size: 11px;">
                        <span style="color: var(--capitao-danger);">Pior:</span>
                        <span style="color: #e5e7eb;">${pior.atleta_nome || '---'} (R${pior.rodada})</span>
                        <span style="font-family: var(--capitao-font-mono); color: var(--capitao-danger); font-weight: 700;">${typeof truncarPontos === 'function' ? truncarPontos(pior.pontuacao || 0) : (pior.pontuacao || 0).toFixed(2)}</span>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                <div style="margin-top: 8px; font-size: 11px; color: var(--capitao-text-muted);">
                    Capitães distintos utilizados: <strong style="color: #e5e7eb;">${distintos}</strong>
                </div>
                ${_renderHistoricoDesempenho(meusDados.historico_rodadas)}
            </div>
        </div>
    `;
}

// =============================================
// HELPER: CHIP INDIVIDUAL
// =============================================
const MAX_CHIPS_VISIBLE = 5;

function _renderChipHtml(r) {
    const pts = (r.pontuacao || 0).toFixed(1);
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

    return `<span class="cap-chip${isParcial && r.jogou === false ? ' cap-chip-pending' : ''}"><span class="cap-chip-rod">R${r.rodada}</span> ${r.atleta_nome || '?'} <span style="color:${corPts}; font-family:var(--capitao-font-mono); font-weight:600;">${pts}</span>${dotHtml}</span>`;
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

function _lpRenderPremiacoes(fo, bodyId, accordionId) {
    const body = document.getElementById(bodyId);
    const accordion = document.getElementById(accordionId);
    if (!body || !accordion || !fo) return;
    const posLabels = { '1': '1º Lugar', '2': '2º Lugar', '3': '3º Lugar', '4': '4º Lugar', '5': '5º Lugar' };
    const posClasses = { '1': 'pos-1', '2': 'pos-2', '3': 'pos-3' };
    const keyLabels = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', por_gol: 'Por Gol', campeao: 'Campeão' };
    let html = '';
    if (fo.valores_por_posicao && Object.keys(fo.valores_por_posicao).length) {
        Object.entries(fo.valores_por_posicao)
            .sort(([a], [b]) => Number(a) - Number(b))
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
    if (!html) return;
    body.innerHTML = html;
    accordion.style.display = '';
}

function _lpCarregarPremiacoes(ligaId, moduloSlug, bodyId, accordionId) {
    fetch(`/api/liga/${ligaId}/modulos/${moduloSlug}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;
            const fo = data.config?.financeiro_override || data.financeiro_override;
            if (!fo) return;
            _lpRenderPremiacoes(fo, bodyId, accordionId);
        })
        .catch(() => {});
}

function _lpGetValor(item, fields) {
    for (const f of fields) {
        if (item?.[f] !== undefined && item[f] !== null) return item[f];
    }
    return 0;
}

function _lpRenderRankingStatus(data, timeId, module, valueFields, valueUnit) {
    const ranking = data?.ranking || data?.data?.ranking || [];
    if (!ranking.length) return;

    const meuIdx = ranking.findIndex(item =>
        String(item?.timeId || item?.participanteId || item?.time_id || '') === String(timeId)
    );

    const statusEl = document.getElementById(`lp-meu-status-${module}`);
    if (statusEl) {
        const posicao = meuIdx >= 0 ? meuIdx + 1 : null;
        const lider = ranking[0];
        const meu = meuIdx >= 0 ? ranking[meuIdx] : null;
        const liderValor = _lpGetValor(lider, valueFields);
        const meuValor = meu ? _lpGetValor(meu, valueFields) : null;
        const total = ranking.length;
        const iAmLider = meuIdx === 0;
        const diff = (meu && !iAmLider) ? (liderValor - meuValor) : null;

        let html = `<p class="module-lp-section-label"><span class="material-icons">person</span>Meu Desempenho</p>
        <div class="module-lp-status-grid">`;

        if (posicao !== null) {
            html += `<div class="module-lp-stat-card highlight">
                <span class="module-lp-stat-value">${posicao}º</span>
                <span class="module-lp-stat-label">de ${total}</span>
            </div>`;
        } else {
            html += `<div class="module-lp-stat-card">
                <span class="module-lp-stat-value">—</span>
                <span class="module-lp-stat-label">posição</span>
            </div>`;
        }

        const meuValorFormatado = (meuValor !== null && typeof truncarPontos === 'function')
            ? truncarPontos(meuValor) : (meuValor !== null ? meuValor : '—');
        const liderValorFormatado = (typeof truncarPontos === 'function')
            ? truncarPontos(liderValor) : liderValor;

        html += `<div class="module-lp-stat-card">
            <span class="module-lp-stat-value">${meuValorFormatado}</span>
            <span class="module-lp-stat-label">${valueUnit}</span>
        </div>`;

        if (iAmLider) {
            html += `<div class="module-lp-stat-card">
                <span class="module-lp-stat-value" style="font-size:var(--app-font-md);color:var(--lp-primary)">Líder</span>
                <span class="module-lp-stat-label">${liderValorFormatado} ${valueUnit}</span>
            </div>`;
        } else {
            const diffFormatado = (diff !== null && typeof truncarPontos === 'function')
                ? truncarPontos(diff) : diff;
            html += `<div class="module-lp-stat-card">
                <span class="module-lp-stat-value" style="${diff > 0 ? 'color:var(--app-danger)' : ''}">
                    ${diff !== null && diff > 0 ? '-' + diffFormatado : liderValorFormatado}
                </span>
                <span class="module-lp-stat-label">${diff !== null && diff > 0 ? 'do líder' : 'líder'}</span>
            </div>`;
        }
        html += `</div>`;
        statusEl.innerHTML = html;
        statusEl.style.display = '';
    }

    const destaqueEl = document.getElementById(`lp-destaque-${module}`);
    if (destaqueEl) {
        const top3 = ranking.slice(0, 3);
        let html = `<p class="module-lp-section-label"><span class="material-icons">leaderboard</span>Top 3</p>
        <div class="module-lp-destaque-list">`;
        top3.forEach((item, i) => {
            const pos = i + 1;
            const nome = item?.nome_cartola || item?.nomeTime || item?.nomeCartoleiro || item?.nome_time || item?.nome || 'N/D';
            const valor = _lpGetValor(item, valueFields);
            const valorFmt = typeof truncarPontos === 'function' ? truncarPontos(valor) : valor;
            const isMe = String(item?.timeId || item?.participanteId || item?.time_id || '') === String(timeId);
            html += `<div class="module-lp-destaque-item${isMe ? ' is-me' : ''}">
                <span class="module-lp-destaque-pos pos-${pos}">${pos}º</span>
                <span class="module-lp-destaque-nome">${nome}</span>
                <span class="module-lp-destaque-valor">${valorFmt}<span class="module-lp-destaque-unit"> ${valueUnit}</span></span>
            </div>`;
        });
        html += `</div>`;
        destaqueEl.innerHTML = html;
        destaqueEl.style.display = '';
    }
}
