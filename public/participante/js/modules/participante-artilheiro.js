// =====================================================================
// PARTICIPANTE-ARTILHEIRO.JS - v4.3
// =====================================================================
// ✅ v4.3: MatchdayService integration — ranking-live endpoint + auto-refresh
// ✅ v4.2: FIX pull-to-refresh loop — AbortController, scrollY, destrutor
// ✅ v4.1: Reordenação - RODADA X → Seu Desempenho → Seus Artilheiros
// ✅ v4.0: Skeleton loading, pull-to-refresh, MutationObserver
// ✅ v3.7: Cache-first com IndexedDB para carregamento instantâneo
// ✅ v3.5: Detecção de temporada encerrada (R38 + mercado fechado)
// =====================================================================

if (window.Log) Log.info("[PARTICIPANTE-ARTILHEIRO] Carregando módulo v4.3...");

// ✅ v4.0: RODADA_FINAL dinâmico - obtido da API, fallback 38
let RODADA_FINAL = 38;

// Estado do módulo
let estadoArtilheiro = {
    temporadaEncerrada: false,
    rodadaAtual: null,
    mercadoAberto: true,
    modeLive: false, // ✅ v4.3: MatchdayService live mode
};

// =====================================================================
// FUNÇÃO PRINCIPAL - EXPORTADA PARA NAVIGATION
// =====================================================================
// ✅ v4.0: Referência para refresh
let _currentLigaId = null;
let _currentTimeId = null;
let _currentParticipante = null;

// ✅ v4.2: AbortController para cleanup de event listeners do pull-to-refresh
let _pullToRefreshAbortController = null;

export async function inicializarArtilheiroParticipante({
    participante,
    ligaId,
    timeId,
}) {
    if (window.Log) Log.info("[PARTICIPANTE-ARTILHEIRO] 🚀 Inicializando v4.0...", {
        ligaId,
        timeId,
    });

    // ✅ v4.0: Guardar refs para pull-to-refresh
    _currentLigaId = ligaId;
    _currentTimeId = timeId;
    _currentParticipante = participante;

    // ✅ LP: Init acordeons + carregar regras e premiações (non-blocking)
    _initLPAccordions('artilheiro-lp-wrapper');
    _lpCarregarComoFunciona(ligaId, 'artilheiro', 'lp-regras-body-artilheiro');
    _lpCarregarPremiacoesHibrida(ligaId, 'artilheiro', 'artilheiro_premiacao', 'lp-premiacoes-body-artilheiro');

    const container = document.getElementById("artilheiro-content");
    if (!container) {
        if (window.Log) Log.error("[PARTICIPANTE-ARTILHEIRO] ❌ Container não encontrado");
        return;
    }

    // ✅ v4.0: Skeleton loading em vez de spinner genérico
    container.innerHTML = renderSkeleton();

    // ✅ v4.0: Setup pull-to-refresh
    setupPullToRefresh(container);

    // ✅ v3.7: CACHE-FIRST - Tentar carregar do IndexedDB primeiro
    let usouCache = false;
    let dadosCache = null;

    if (window.OfflineCache) {
        try {
            const artCache = await window.OfflineCache.get('artilheiro', ligaId, true);
            if (artCache && artCache.data) {
                usouCache = true;
                dadosCache = artCache;

                if (window.Log)
                    Log.info("[PARTICIPANTE-ARTILHEIRO] ⚡ Cache IndexedDB encontrado");

                await renderizarArtilheiro(container, artCache, timeId);
            }
        } catch (e) {
            if (window.Log) Log.warn("[PARTICIPANTE-ARTILHEIRO] ⚠️ Erro ao ler cache:", e);
        }
    }

    try {
        const ligaRes = await fetch(`/api/ligas/${ligaId}`);
        if (ligaRes.ok) {
            const liga = await ligaRes.json();
            const modulosAtivos =
                liga.modulosAtivos || liga.modulos_ativos || {};
            // v2.0: Módulo OPCIONAL, só habilita se === true
            const artilheiroAtivo = modulosAtivos.artilheiro === true;

            // ✅ v4.3: Verificar matchday (parciais ao vivo)
            if (window.MatchdayService && window.MatchdayService.isActive) {
                estadoArtilheiro.modeLive = true;
                _subscribeMatchdayEvents();
                if (window.Log) Log.info('[PARTICIPANTE-ARTILHEIRO] MatchdayService ATIVO — modo live');
            }

            if (!artilheiroAtivo) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%); border-radius: 12px; border: 2px dashed rgba(34, 197, 94, 0.3);">
                        <span class="material-symbols-outlined" style="font-size: 64px; margin-bottom: 16px; color: var(--app-success-light);">sports_soccer</span>
                        <h3 style="color: var(--app-text-primary); margin-bottom: 12px;">Artilheiro Campeão</h3>
                        <p style="color: #999;">Este módulo não está ativo para esta liga.</p>
                    </div>
                `;
                return;
            }
        }

        // ✅ v4.3: Endpoint live quando MatchdayService ativo
        let endpoint = estadoArtilheiro.modeLive
            ? `/api/artilheiro-campeao/${ligaId}/ranking-live`
            : `/api/artilheiro-campeao/${ligaId}/ranking`;
        let response = await fetch(endpoint);
        if (!response.ok) throw new Error("Dados não disponíveis");

        let responseData = await response.json();

        // ✅ v4.3: Fallback — se live não disponível, buscar ranking consolidado
        if (estadoArtilheiro.modeLive && responseData.disponivel === false) {
            if (window.Log) Log.info('[PARTICIPANTE-ARTILHEIRO] Live indisponível, fallback para ranking consolidado');
            estadoArtilheiro.modeLive = false;
            response = await fetch(`/api/artilheiro-campeao/${ligaId}/ranking`);
            if (!response.ok) throw new Error("Dados não disponíveis");
            responseData = await response.json();
        }

        if (window.Log) Log.info(
            "[PARTICIPANTE-ARTILHEIRO] 📦 Dados recebidos da API",
        );

        // ✅ v3.7: Salvar no IndexedDB para próxima visita
        if (window.OfflineCache) {
            try {
                await window.OfflineCache.set('artilheiro', ligaId, responseData);
                if (window.Log) Log.info("[PARTICIPANTE-ARTILHEIRO] 💾 Cache IndexedDB atualizado");
            } catch (e) {
                if (window.Log) Log.warn("[PARTICIPANTE-ARTILHEIRO] ⚠️ Erro ao salvar cache:", e);
            }
        }

        // Só re-renderizar se dados mudaram ou se não usou cache antes
        const dadosMudaram = !usouCache ||
            !dadosCache ||
            JSON.stringify(dadosCache.data?.ranking?.slice(0,3)) !== JSON.stringify(responseData.data?.ranking?.slice(0,3));

        if (dadosMudaram) {
            await renderizarArtilheiro(container, responseData, timeId);
            if (usouCache && window.Log) {
                Log.info("[PARTICIPANTE-ARTILHEIRO] 🔄 Re-renderizado com dados frescos");
            }
        } else if (window.Log) {
            Log.info("[PARTICIPANTE-ARTILHEIRO] ✅ Dados iguais, mantendo renderização do cache");
        }
    } catch (error) {
        if (window.Log) Log.error("[PARTICIPANTE-ARTILHEIRO] ❌ Erro:", error);
        if (!usouCache) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%); border-radius: 12px; border: 2px dashed rgba(34, 197, 94, 0.3);">
                    <span class="material-symbols-outlined" style="font-size: 64px; margin-bottom: 16px; color: var(--app-success-light);">sports_soccer</span>
                    <h3 style="color: var(--app-text-primary); margin-bottom: 12px;">Artilheiro Campeão</h3>
                    <p style="color: #999;">Dados não disponíveis no momento.</p>
                </div>
            `;
        }
    }
}

window.inicializarArtilheiroParticipante = inicializarArtilheiroParticipante;

// =====================================================================
// HELPERS
// =====================================================================
function getNome(item) {
    return item?.nomeTime || item?.nomeCartoleiro || item?.nome || "N/D";
}

function getTimeId(item) {
    return String(item?.timeId || item?.participanteId || "");
}

function isMyTime(item, meuTimeId) {
    return getTimeId(item) === String(meuTimeId);
}

// =====================================================================
// ✅ v3.5: BANNER RODADA FINAL / CAMPEÃO
// =====================================================================
function renderizarBannerRodadaFinal(
    rodadaAtual,
    mercadoAberto,
    lider,
    temporadaEncerrada,
) {
    if (rodadaAtual !== RODADA_FINAL) return "";

    const liderNome = lider ? getNome(lider) : "---";
    const getGP = (item) => item?.golsPro ?? item?.gols ?? 0;
    const liderGols = lider ? getGP(lider) : 0;

    // ✅ v3.5: Detectar se é campeão confirmado
    if (temporadaEncerrada) {
        return `
            <style>
                @keyframes artCampeaoShine {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                .art-banner-campeao {
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.08) 100%);
                    border: 2px solid rgba(34, 197, 94, 0.5);
                    border-radius: 12px;
                    padding: 14px 16px;
                    margin-bottom: 16px;
                }
                .art-campeao-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }
                .art-campeao-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .art-campeao-badge {
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--app-success-light);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    background: linear-gradient(90deg, var(--app-success-light), #16a34a, var(--app-success-light));
                    background-size: 200% auto;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    animation: artCampeaoShine 3s linear infinite;
                }
                .art-campeao-status {
                    font-size: 9px;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-weight: 600;
                    background: rgba(34, 197, 94, 0.25);
                    color: var(--app-success-light);
                }
                .art-campeao-info {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: rgba(0, 0, 0, 0.25);
                    border-radius: 10px;
                    padding: 12px 14px;
                }
                .art-campeao-nome {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--app-text-primary);
                }
                .art-campeao-label {
                    font-size: 9px;
                    color: var(--app-success-light);
                    font-weight: 600;
                    text-transform: uppercase;
                    margin-bottom: 2px;
                }
                .art-campeao-gols {
                    text-align: right;
                }
                .art-campeao-gols-valor {
                    font-size: 20px;
                    font-weight: 800;
                    color: var(--app-success-light);
                }
                .art-campeao-gols-label {
                    font-size: 8px;
                    color: #888;
                    text-transform: uppercase;
                }
            </style>
            <div class="art-banner-campeao">
                <div class="art-campeao-header">
                    <div class="art-campeao-title">
                        <span class="material-icons" style="font-size: 22px; color: var(--app-success-light);">emoji_events</span>
                        <span class="art-campeao-badge">CAMPEÃO ARTILHEIRO</span>
                    </div>
                    <span class="art-campeao-status"><span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">check</span> CONSOLIDADO</span>
                </div>
                <div class="art-campeao-info">
                    <div>
                        <div class="art-campeao-label">Campeão</div>
                        <div class="art-campeao-nome">${liderNome}</div>
                    </div>
                    <div class="art-campeao-gols">
                        <div class="art-campeao-gols-valor">${liderGols}</div>
                        <div class="art-campeao-gols-label">gols</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Rodada 38 em andamento
    const isParcial = !mercadoAberto;

    return `
        <style>
            @keyframes artBannerPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
            }
            @keyframes artShimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            .art-banner-final {
                background: linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.06) 100%);
                border: 1px solid rgba(34, 197, 94, 0.35);
                border-radius: 12px;
                padding: 12px 16px;
                margin-bottom: 16px;
                ${isParcial ? "animation: artBannerPulse 2s ease-in-out infinite;" : ""}
            }
            .art-banner-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
            }
            .art-banner-title {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .art-banner-text {
                font-size: 11px;
                font-weight: 700;
                color: var(--app-success-light);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .art-banner-status {
                font-size: 9px;
                padding: 3px 8px;
                border-radius: 4px;
                font-weight: 600;
                ${
                    isParcial
                        ? "background: rgba(34, 197, 94, 0.2); color: var(--app-success-light);"
                        : "background: rgba(34, 197, 94, 0.15); color: var(--app-success-light);"
                }
            }
            .art-banner-lider {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 8px;
                padding: 10px 12px;
            }
            .art-banner-lider-badge {
                font-size: 9px;
                font-weight: 700;
                color: var(--app-success-light);
                text-transform: uppercase;
                background: linear-gradient(90deg, var(--app-success-light), #16a34a, var(--app-success-light));
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: artShimmer 3s linear infinite;
            }
            .art-banner-lider-nome {
                font-size: 14px;
                font-weight: 700;
                color: var(--app-text-primary);
            }
            .art-banner-lider-gols {
                text-align: right;
            }
            .art-banner-lider-valor {
                font-size: 18px;
                font-weight: 800;
                color: var(--app-success-light);
            }
            .art-banner-lider-label {
                font-size: 8px;
                color: #888;
                text-transform: uppercase;
            }
        </style>

        <div class="art-banner-final">
            <div class="art-banner-header">
                <div class="art-banner-title">
                    <span class="material-icons" style="font-size: 18px; color: var(--app-success-light); vertical-align: middle;">emoji_events</span>
                    <span class="art-banner-text">Rodada Final</span>
                </div>
                <span class="art-banner-status">${isParcial ? "● Em andamento" : "Última Rodada"}</span>
            </div>
            <div class="art-banner-lider">
                <div>
                    <div class="art-banner-lider-badge">Possível Campeão</div>
                    <div class="art-banner-lider-nome">${liderNome}</div>
                </div>
                <div class="art-banner-lider-gols">
                    <div class="art-banner-lider-valor">${liderGols}</div>
                    <div class="art-banner-lider-label">gols</div>
                </div>
            </div>
        </div>
    `;
}

// =====================================================================
// RENDERIZAÇÃO
// =====================================================================
async function renderizarArtilheiro(container, response, meuTimeId) {
    const data = response.data || response;

    let ranking = [];
    let estatisticas = {};

    if (data.ranking && Array.isArray(data.ranking)) {
        ranking = data.ranking;
        estatisticas = data.estatisticas || {};
    } else if (Array.isArray(data)) {
        ranking = data;
    }

    // ✅ FILTRAR TIMES INATIVOS - NÃO PODEM FIGURAR NO RANKING
    const rankingAtivos = ranking.filter((time) => {
        const isInativo = time.ativo === false || time.status === "inativo";
        return !isInativo;
    });

    if (rankingAtivos.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%); border-radius: 12px; border: 2px dashed rgba(34, 197, 94, 0.3);">
                <span class="material-symbols-outlined" style="font-size: 64px; margin-bottom: 16px; color: var(--app-success-light);">sports_soccer</span>
                <h3 style="color: var(--app-text-primary); margin-bottom: 12px;">Artilheiro Campeão</h3>
                <p style="color: #999;">Nenhum dado disponível ainda.</p>
            </div>
        `;
        return;
    }

    const campeao = rankingAtivos[0];
    const minhaPosicao = rankingAtivos.findIndex((r) => isMyTime(r, meuTimeId));
    const meusDados = minhaPosicao >= 0 ? rankingAtivos[minhaPosicao] : null;
    const minhaColocacao = minhaPosicao >= 0 ? minhaPosicao + 1 : null;

    // Extrair dados
    const getGP = (item) => item?.golsPro ?? item?.gols ?? 0;
    const getGC = (item) => item?.golsContra ?? 0;
    const getSaldo = (item) => item?.saldoGols ?? getGP(item) - getGC(item);

    const distanciaLider =
        campeao && meusDados ? getSaldo(campeao) - getSaldo(meusDados) : 0;

    const rodadaInicio = estatisticas.rodadaInicio || 1;
    const rodadaFim = estatisticas.rodadaFim || estatisticas.rodadaAtual || 36;
    let rodadaAtual = estatisticas.rodadaAtual || null;
    let mercadoAberto = estatisticas.mercadoAberto !== false;
    let temporadaEncerrada = false;

    // ✅ v4.0: BUSCAR STATUS DO MERCADO PARA DETECTAR TEMPORADA ENCERRADA
    try {
        const mercadoRes = await fetch("/api/cartola/mercado/status");
        if (mercadoRes.ok) {
            const mercado = await mercadoRes.json();
            rodadaAtual =
                mercado.rodada_atual || mercado.rodadaAtual || rodadaFim;
            mercadoAberto = mercado.status_mercado === 1;

            // ✅ v4.0: Atualizar RODADA_FINAL dinâmico
            if (mercado.rodada_total) RODADA_FINAL = mercado.rodada_total;

            // Temporada encerrada: status_mercado = 6 OU (rodada >= RODADA_FINAL E mercado fechado)
            temporadaEncerrada =
                mercado.status_mercado === 6 ||
                (rodadaAtual >= RODADA_FINAL && mercado.status_mercado !== 1);

            estadoArtilheiro.rodadaAtual = rodadaAtual;
            estadoArtilheiro.mercadoAberto = mercadoAberto;
            estadoArtilheiro.temporadaEncerrada = temporadaEncerrada;

            if (window.Log) Log.info("[PARTICIPANTE-ARTILHEIRO] 📊 Status:", {
                rodadaAtual,
                mercadoAberto,
                temporadaEncerrada,
                statusMercado: mercado.status_mercado,
            });
        } else {
            rodadaAtual = rodadaFim;
            if (window.Log) Log.warn(
                "[PARTICIPANTE-ARTILHEIRO] ⚠️ API mercado indisponível, usando rodadaFim:",
                rodadaFim,
            );
        }
    } catch (e) {
        if (window.Log) Log.warn(
            "[PARTICIPANTE-ARTILHEIRO] ⚠️ Erro ao obter mercado:",
            e.message,
        );
        rodadaAtual = rodadaFim;
    }

    // Dados ricos
    let ultimaRodada = null;
    let meusArtilheiros = [];
    let historicoRecente = [];

    if (
        meusDados?.detalhePorRodada &&
        Array.isArray(meusDados.detalhePorRodada)
    ) {
        const rodadasOrdenadas = [...meusDados.detalhePorRodada].sort(
            (a, b) => b.rodada - a.rodada,
        );
        // ✅ v3.7: Sempre mostrar a rodada mais recente, independente de ter gols
        ultimaRodada = rodadasOrdenadas[0];
        historicoRecente = rodadasOrdenadas.slice(0, 5);

        const jogadoresMap = {};
        meusDados.detalhePorRodada.forEach((r) => {
            if (r.jogadores && Array.isArray(r.jogadores)) {
                r.jogadores.forEach((j) => {
                    if (j.gols > 0) {
                        if (!jogadoresMap[j.nome])
                            jogadoresMap[j.nome] = { nome: j.nome, gols: 0 };
                        jogadoresMap[j.nome].gols += j.gols;
                    }
                });
            }
        });
        meusArtilheiros = Object.values(jogadoresMap)
            .sort((a, b) => b.gols - a.gols)
            .slice(0, 3);
    }

    // ✅ v3.5: Banner da rodada final com detecção de campeão
    const bannerRodadaFinal = renderizarBannerRodadaFinal(
        rodadaAtual,
        mercadoAberto,
        campeao,
        temporadaEncerrada,
    );

    // ✅ v3.5: Labels dinâmicos
    const labelLider = temporadaEncerrada ? "Campeão" : "Líder";
    const textoVoceELider = temporadaEncerrada
        ? '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">emoji_events</span> Você é o CAMPEÃO!'
        : '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">emoji_events</span> Você é o líder!';

    const html = `
    <div style="padding: 16px;">
        <div style="text-align: center; margin-bottom: 16px;">
            <p style="margin: 0; color: #888; font-size: 12px;">
                Rodadas ${rodadaInicio} - ${rodadaFim}
            </p>
        </div>

        ${bannerRodadaFinal}

        ${
            meusDados
                ? `
        ${
            ultimaRodada
                ? `
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="color: var(--app-info); font-size: 11px; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">calendar_today</span> Rodada ${ultimaRodada.rodada}</span>
                <span style="color: #666; font-size: 10px;">Última atualização</span>
            </div>
            <div style="display: flex; gap: 8px; justify-content: center;">
                <div style="background: rgba(34, 197, 94, 0.15); padding: 10px 16px; border-radius: 8px; text-align: center; flex: 1;">
                    <div style="font-size: 22px; font-weight: 800; color: var(--app-success-light);">${ultimaRodada.golsPro || 0}</div>
                    <div style="font-size: 9px; color: #888;">GP</div>
                </div>
                <div style="background: rgba(239, 68, 68, 0.15); padding: 10px 16px; border-radius: 8px; text-align: center; flex: 1;">
                    <div style="font-size: 22px; font-weight: 800; color: var(--app-danger);">${ultimaRodada.golsContra || 0}</div>
                    <div style="font-size: 9px; color: #888;">GC</div>
                </div>
                <div style="background: rgba(255, 255, 255, 0.05); padding: 10px 16px; border-radius: 8px; text-align: center; flex: 1;">
                    ${(() => {
                        const saldo =
                            (ultimaRodada.golsPro || 0) -
                            (ultimaRodada.golsContra || 0);
                        return `<div style="font-size: 22px; font-weight: 800; color: ${saldo >= 0 ? "var(--app-success-light)" : "var(--app-danger)"};">${saldo >= 0 ? "+" : ""}${saldo}</div>`;
                    })()}
                    <div style="font-size: 9px; color: #888;">SG</div>
                </div>
            </div>
        </div>
        `
                : ""
        }

        <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%); border: 2px solid rgba(34, 197, 94, 0.4); border-radius: 16px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 10px; color: var(--app-success-light); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Seu Desempenho</div>
                    <div style="font-size: 28px; font-weight: 900; color: var(--app-text-primary);">${minhaColocacao}º</div>
                </div>
                <div style="display: flex; gap: 16px; text-align: center;">
                    <div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--app-success-light);">${getGP(meusDados)}</div>
                        <div style="font-size: 9px; color: #888;">GP</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--app-danger);">${getGC(meusDados)}</div>
                        <div style="font-size: 9px; color: #888;">GC</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: 800; color: ${getSaldo(meusDados) >= 0 ? "var(--app-success-light)" : "var(--app-danger)"};">${getSaldo(meusDados) >= 0 ? "+" : ""}${getSaldo(meusDados)}</div>
                        <div style="font-size: 9px; color: #888;">SG</div>
                    </div>
                </div>
            </div>

            ${
                minhaColocacao > 1
                    ? `
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #888; font-size: 11px;">Distância p/ ${labelLider.toLowerCase()}</span>
                <span style="color: var(--app-amber); font-weight: 700; font-size: 13px;">-${distanciaLider} gols</span>
            </div>
            `
                    : `
            <div style="background: linear-gradient(90deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1)); border-radius: 8px; padding: 8px 12px; text-align: center;">
                <span style="color: var(--app-success-light); font-weight: 700; font-size: 13px;">${textoVoceELider}</span>
            </div>
            `
            }
        </div>

        ${
            meusArtilheiros.length > 0
                ? `
        <div style="background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 11px; color: #888; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">sports_soccer</span> Seus Artilheiros</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${meusArtilheiros
                    .map(
                        (j, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: ${idx === 0 ? "var(--app-gold)" : idx === 1 ? "var(--app-silver)" : "var(--app-bronze)"};">workspace_premium</span>
                        <span style="color: var(--app-text-primary); font-size: 12px; font-weight: 500;">${j.nome}</span>
                    </div>
                    <span style="color: var(--app-success-light); font-weight: 800; font-size: 14px;">${j.gols} gols</span>
                </div>
                `,
                    )
                    .join("")}
            </div>
        </div>
        `
                : ""
        }

        ${
            historicoRecente.length > 0
                ? `
        <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 11px; color: #888; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">bar_chart</span> Últimas Rodadas</div>
            <div style="display: flex; gap: 6px; justify-content: space-between;">
                ${historicoRecente
                    .map((r) => {
                        const saldo = (r.golsPro || 0) - (r.golsContra || 0);
                        const bgColor =
                            saldo > 0
                                ? "rgba(34, 197, 94, 0.15)"
                                : saldo < 0
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(255,255,255,0.05)";
                        const textColor =
                            saldo > 0
                                ? "var(--app-success-light)"
                                : saldo < 0
                                  ? "var(--app-danger)"
                                  : "#666";
                        return `
                    <div style="flex: 1; background: ${bgColor}; border-radius: 8px; padding: 8px 4px; text-align: center;">
                        <div style="font-size: 9px; color: #666; margin-bottom: 4px;">R${r.rodada}</div>
                        <div style="font-size: 14px; font-weight: 800; color: ${textColor};">${saldo >= 0 ? "+" : ""}${saldo}</div>
                    </div>
                    `;
                    })
                    .join("")}
            </div>
        </div>
        `
                : ""
        }
        `
                : `
        <div style="background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 20px; margin-bottom: 16px; text-align: center;">
            <span class="material-symbols-outlined" style="font-size: 32px; margin-bottom: 8px; color: #666;">sentiment_dissatisfied</span>
            <p style="color: #888; font-size: 14px; margin: 8px 0 0 0;">Você não está no ranking</p>
        </div>
        `
        }

        ${
            campeao && (!meusDados || minhaColocacao !== 1)
                ? `
        <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.03) 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined" style="font-size: 24px; color: var(--app-success-light);">emoji_events</span>
                <div>
                    <div style="font-size: 10px; color: var(--app-success-light); font-weight: 700; text-transform: uppercase;">${labelLider}</div>
                    <div style="font-size: 14px; font-weight: 700; color: var(--app-text-primary);">${campeao.nomeCartoleiro || campeao.nome_cartola || campeao.nome || 'N/D'}</div>
                    <div style="font-size: 11px; color: #888;">${campeao.nomeTime || campeao.nome_time || ''}</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 18px; font-weight: 800; color: var(--app-success-light);">+${getSaldo(campeao)}</div>
                <div style="font-size: 8px; color: #888;">saldo de gols</div>
            </div>
        </div>
        `
                : ""
        }

        <details style="background: rgba(0,0,0,0.3); border-radius: 12px; overflow: hidden;" open>
            <summary style="background: rgba(34, 197, 94, 0.1); padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(34, 197, 94, 0.2);">
                <span style="font-size: 13px; font-weight: 700; color: var(--app-success-light); display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 16px;">list_alt</span> Ranking Completo</span>
                <span style="font-size: 11px; color: #888;">${rankingAtivos.length} participantes</span>
            </summary>

            <div style="max-height: 300px; overflow-y: auto;">
            ${(() => {
                // Separar ativos e inativos
                const ativos = rankingAtivos;
                const inativos = ranking.filter(
                    (time) => time.ativo === false || time.status === "inativo",
                );

                let html = "";

                // Renderizar ATIVOS
                ativos.forEach((time, idx) => {
                    const isMeuTime = isMyTime(time, meuTimeId);
                    const pos = idx + 1;
                    const posicaoDisplay = pos === 1 ? '<span class="material-symbols-outlined" style="font-size: 16px; color: var(--app-success-light);">emoji_events</span>' : `${pos}º`;
                    const saldo = getSaldo(time);

                    html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); ${isMeuTime ? "background: rgba(34, 197, 94, 0.15);" : ""}">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: ${pos === 1 ? "16px" : "12px"}; width: 26px; ${pos === 1 ? "" : "color: #888;"}">${posicaoDisplay}</span>
                            <div>
                                <div style="color: ${isMeuTime ? "var(--app-success-light)" : "var(--app-text-primary)"}; font-weight: ${isMeuTime ? "700" : "500"}; font-size: 12px;">${time.nomeCartoleiro || time.nome_cartola || time.nome || 'N/D'}</div>
                                <div style="color: #888; font-size: 11px;">${time.nomeTime || time.nome_time || ''}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <span style="color: #888; font-size: 11px;">${getGP(time)}/${getGC(time)}</span>
                            <span style="color: ${saldo >= 0 ? "var(--app-success-light)" : "var(--app-danger)"}; font-weight: 700; font-size: 13px;">${saldo >= 0 ? "+" : ""}${saldo}</span>
                        </div>
                    </div>
                    `;
                });

                // Renderizar INATIVOS (se houver)
                if (inativos.length > 0) {
                    html += `
                    <div style="padding: 8px 14px; background: rgba(100,100,100,0.15); border-top: 1px dashed rgba(100,100,100,0.4); border-bottom: 1px dashed rgba(100,100,100,0.4);">
                        <span style="font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">
                            <span class="material-icons" style="font-size: 12px; vertical-align: middle; margin-right: 4px;">person_off</span>
                            Participantes Inativos
                        </span>
                    </div>
                    `;

                    inativos.forEach((time) => {
                        const isMeuTime = isMyTime(time, meuTimeId);
                        const saldo = getSaldo(time);

                        html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); opacity: 0.5; filter: grayscale(60%);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 12px; width: 26px; color: #555;">—</span>
                                <div>
                                    <div style="color: #666; font-weight: 400; font-size: 12px;">${time.nomeCartoleiro || time.nome_cartola || time.nome || 'N/D'}</div>
                                    <div style="color: #555; font-size: 11px;">${time.nomeTime || time.nome_time || ''}</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <span style="color: #555; font-size: 11px;">${getGP(time)}/${getGC(time)}</span>
                                <span style="color: #555; font-weight: 500; font-size: 13px;">${saldo >= 0 ? "+" : ""}${saldo}</span>
                            </div>
                        </div>
                        `;
                    });
                }

                return html;
            })()}
            </div>
        </details>
    </div>
    `;

    container.innerHTML = html;
}

// =====================================================================
// ✅ v4.0: SKELETON LOADING
// =====================================================================
function renderSkeleton() {
    const shimmer = `background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 200% 100%; animation: artSkeletonShimmer 1.5s ease-in-out infinite;`;
    return `
        <style>
            @keyframes artSkeletonShimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        </style>
        <div style="padding: 16px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="width: 200px; height: 24px; border-radius: 6px; margin: 0 auto 8px; ${shimmer}"></div>
                <div style="width: 120px; height: 14px; border-radius: 4px; margin: 0 auto; ${shimmer}"></div>
            </div>
            <div style="border-radius: 16px; padding: 16px; margin-bottom: 16px; border: 2px solid rgba(34,197,94,0.2); background: rgba(34,197,94,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <div style="width: 80px; height: 12px; border-radius: 4px; margin-bottom: 8px; ${shimmer}"></div>
                        <div style="width: 50px; height: 32px; border-radius: 6px; ${shimmer}"></div>
                    </div>
                    <div style="display: flex; gap: 16px;">
                        <div style="width: 40px; height: 28px; border-radius: 6px; ${shimmer}"></div>
                        <div style="width: 40px; height: 28px; border-radius: 6px; ${shimmer}"></div>
                        <div style="width: 40px; height: 28px; border-radius: 6px; ${shimmer}"></div>
                    </div>
                </div>
                <div style="width: 100%; height: 36px; border-radius: 8px; ${shimmer}"></div>
            </div>
            <div style="border-radius: 12px; background: rgba(0,0,0,0.3); overflow: hidden;">
                <div style="padding: 12px 16px; background: rgba(34,197,94,0.1);">
                    <div style="width: 140px; height: 14px; border-radius: 4px; ${shimmer}"></div>
                </div>
                ${[1,2,3,4,5].map(() => `
                <div style="display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div style="width: 26px; height: 16px; border-radius: 4px; ${shimmer}"></div>
                        <div style="width: 100px; height: 14px; border-radius: 4px; ${shimmer}"></div>
                    </div>
                    <div style="width: 60px; height: 16px; border-radius: 4px; ${shimmer}"></div>
                </div>
                `).join('')}
            </div>
        </div>
    `;
}

// =====================================================================
// ✅ v4.2: PULL-TO-REFRESH (FIX: AbortController + scrollY correto)
// =====================================================================
function setupPullToRefresh(container) {
    // ✅ v4.2: Abortar listeners anteriores para evitar acumulação
    if (_pullToRefreshAbortController) {
        _pullToRefreshAbortController.abort();
    }
    _pullToRefreshAbortController = new AbortController();
    const signal = _pullToRefreshAbortController.signal;

    // ✅ v4.2: Remover indicador órfão que possa existir no DOM
    document.getElementById('art-pull-indicator')?.remove();

    const parentEl = container.closest('.artilheiro-participante') || container;
    let startY = 0;
    let pulling = false;
    let indicator = null;
    let refreshing = false; // ✅ v4.2: Guard contra refresh concorrente

    parentEl.addEventListener('touchstart', (e) => {
        // ✅ v4.2: FIX — usar window.scrollY (scroll container real, não o div)
        if (window.scrollY === 0 && !refreshing) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true, signal });

    parentEl.addEventListener('touchmove', (e) => {
        if (!pulling || refreshing) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 50 && diff < 150) {
            if (!indicator) {
                // ✅ v4.2: Garantir que só exista 1 indicador no DOM
                document.getElementById('art-pull-indicator')?.remove();
                indicator = document.createElement('div');
                indicator.id = 'art-pull-indicator';
                indicator.style.cssText = 'text-align:center;padding:8px;color:var(--app-success-light);font-size:11px;font-weight:600;transition:opacity 0.2s;';
                indicator.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle;animation:spin 1s linear infinite;">refresh</span> Solte para atualizar';
                parentEl.prepend(indicator);
            }
        }
    }, { passive: true, signal });

    parentEl.addEventListener('touchend', async () => {
        if (indicator && !refreshing) {
            refreshing = true;
            indicator.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle;animation:spin 1s linear infinite;">sync</span> Atualizando...';
            try {
                if (_currentLigaId && _currentTimeId) {
                    await inicializarArtilheiroParticipante({
                        participante: _currentParticipante,
                        ligaId: _currentLigaId,
                        timeId: _currentTimeId,
                    });
                }
            } catch (e) {
                if (window.Log) Log.warn("[PARTICIPANTE-ARTILHEIRO] Erro no refresh:", e);
            }
            indicator?.remove();
            indicator = null;
            refreshing = false;
        }
        pulling = false;
    }, { passive: true, signal });
}

// =====================================================================
// ✅ v4.3: MATCHDAY EVENTS — Live experience integration
// =====================================================================
// Referências para cleanup
let _matchdayParciaisHandler = null;
let _matchdayStopHandler = null;

function _subscribeMatchdayEvents() {
    if (!window.MatchdayService) return;

    // Handler: novos dados parciais disponíveis → re-fetch ranking live
    _matchdayParciaisHandler = async () => {
        if (window.Log) Log.info('[PARTICIPANTE-ARTILHEIRO] Atualizando com parciais (MatchdayService)');
        if (!_currentLigaId || !_currentTimeId) return;

        try {
            const container = document.getElementById('artilheiro-content');
            if (!container) return;

            const response = await fetch(`/api/artilheiro-campeao/${_currentLigaId}/ranking-live`);
            if (!response.ok) return;

            const responseData = await response.json();
            if (responseData.disponivel === false) return;

            // Salvar cache
            if (window.OfflineCache) {
                try { await window.OfflineCache.set('artilheiro', _currentLigaId, responseData); } catch (e) { /* silent */ }
            }

            await renderizarArtilheiro(container, responseData, _currentTimeId);
        } catch (e) {
            if (window.Log) Log.warn('[PARTICIPANTE-ARTILHEIRO] Erro ao atualizar parciais:', e);
        }
    };

    // Handler: matchday encerrou → voltar para ranking consolidado
    _matchdayStopHandler = async () => {
        if (window.Log) Log.info('[PARTICIPANTE-ARTILHEIRO] Matchday encerrado — voltando para consolidado');
        estadoArtilheiro.modeLive = false;

        if (!_currentLigaId || !_currentTimeId) return;

        try {
            const container = document.getElementById('artilheiro-content');
            if (!container) return;

            const response = await fetch(`/api/artilheiro-campeao/${_currentLigaId}/ranking`);
            if (!response.ok) return;

            const responseData = await response.json();

            if (window.OfflineCache) {
                try { await window.OfflineCache.set('artilheiro', _currentLigaId, responseData); } catch (e) { /* silent */ }
            }

            await renderizarArtilheiro(container, responseData, _currentTimeId);
        } catch (e) {
            if (window.Log) Log.warn('[PARTICIPANTE-ARTILHEIRO] Erro ao atualizar pós-matchday:', e);
        }
    };

    window.MatchdayService.on('data:parciais', _matchdayParciaisHandler);
    window.MatchdayService.on('matchday:stop', _matchdayStopHandler);
}

// =====================================================================
// ✅ v4.2: DESTRUTOR — Cleanup ao navegar para outro módulo
// =====================================================================
export function destruirArtilheiroParticipante() {
    if (window.Log) Log.info("[PARTICIPANTE-ARTILHEIRO] Destruindo modulo (cleanup)");

    // Abortar todos os listeners do pull-to-refresh
    if (_pullToRefreshAbortController) {
        _pullToRefreshAbortController.abort();
        _pullToRefreshAbortController = null;
    }

    // Remover indicador órfão
    document.getElementById('art-pull-indicator')?.remove();

    // ✅ v4.3: Reset live state
    estadoArtilheiro.modeLive = false;
    _matchdayParciaisHandler = null;
    _matchdayStopHandler = null;

    // Limpar refs
    _currentLigaId = null;
    _currentTimeId = null;
    _currentParticipante = null;
}

window.destruirArtilheiroParticipante = destruirArtilheiroParticipante;

if (window.Log) Log.info("[PARTICIPANTE-ARTILHEIRO] Modulo v4.3 carregado (MatchdayService integration)");

// =====================================================================
// MODULE LP — Landing Page Utils (Artilheiro)
// =====================================================================

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

/** Init accordion toggle behavior for a module LP wrapper */
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

/** Format currency value BRL */
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

    // 1. Tentar ModuleConfig (valores financeiros reais)
    fetch(`/api/liga/${ligaId}/modulos/${moduloSlug}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            const fo = data?.config?.financeiro_override || data?.financeiro_override;
            const html = fo ? _lpRenderFinanceiroHtml(fo) : '';
            if (html) {
                body.innerHTML = html;
                return;
            }
            // 2. Fallback: texto descritivo de regras-modulos
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

/** Render financeiro_override into HTML grid */
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

