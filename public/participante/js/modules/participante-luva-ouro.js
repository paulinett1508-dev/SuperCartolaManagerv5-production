// =====================================================================
// PARTICIPANTE-LUVA-OURO.JS - v5.0 (UX Premium)
// =====================================================================
// ✅ v5.0: UX elevada — ranking colapsável, card goleiros premium, rodadas interativas
// ✅ v4.1: MatchdayService integration (paridade com Capitão)
//    - modeLive state, subscribeMatchdayEvents, endpoint switching
//    - Fallback live → consolidado se mercado aberto
//    - Cleanup/destrutor para navegação SPA
// ✅ v4.0: Cache-first com IndexedDB para carregamento instantâneo
// ✅ v3.8: Detecção de temporada encerrada (R38 + mercado fechado)
//    - Badge "CAMPEÃO" quando temporada encerrada
//    - Banner ajustado para "CAMPEÃO CONFIRMADO"
// ✅ v3.7: Card Desempenho ao final
// =====================================================================

if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] Carregando módulo v5.0...");

const RODADA_FINAL = 38;

// Estado do módulo
let estadoLuva = {
    ligaId: null,
    timeId: null,
    modeLive: false,
    temporadaEncerrada: false,
    rodadaAtual: null,
    mercadoAberto: true,
    rankingAtual: null,
    _onParciais: null,
    _onMatchdayStop: null,
};

// =====================================================================
// FUNÇÃO PRINCIPAL - EXPORTADA PARA NAVIGATION
// =====================================================================
export async function inicializarLuvaOuroParticipante({
    participante,
    ligaId,
    timeId,
}) {
    if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] 🚀 Inicializando v4.1...", {
        ligaId,
        timeId,
    });

    // Salvar no estado para uso interno
    estadoLuva.ligaId = ligaId;
    estadoLuva.timeId = timeId;
    estadoLuva.modeLive = false;
    estadoLuva.rankingAtual = null;

    // ✅ v4.1: Verificar matchday (parciais) — paridade com Capitão
    if (window.MatchdayService && window.MatchdayService.isActive) {
        estadoLuva.modeLive = true;
        _subscribeMatchdayEvents();
        if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] 🔥 MatchdayService ATIVO — modo live");
    }

    // ✅ LP: Init acordeons + carregar regras e premiações (non-blocking)
    _initLPAccordions('luva-lp-wrapper');
    _lpCarregarComoFunciona(ligaId, 'luva_ouro', 'lp-regras-body-luva');
    _lpCarregarPremiacoesHibrida(ligaId, 'luva_ouro', 'luva_ouro_premiacao', 'lp-premiacoes-body-luva');

    const container = document.getElementById("luvaOuroContainer");
    if (!container) {
        if (window.Log) Log.error("[PARTICIPANTE-LUVA-OURO] ❌ Container não encontrado");
        return;
    }

    // ✅ v4.0: CACHE-FIRST - Tentar carregar do IndexedDB primeiro
    let usouCache = false;
    let dadosCache = null;

    if (window.OfflineCache) {
        try {
            const luvaCache = await window.OfflineCache.get('luvaOuro', ligaId, true);
            if (luvaCache && (luvaCache.ranking || luvaCache.data)) {
                usouCache = true;
                dadosCache = luvaCache;

                // Renderizar IMEDIATAMENTE com dados do cache
                if (window.Log)
                    Log.info("[PARTICIPANTE-LUVA-OURO] ⚡ Cache IndexedDB encontrado");

                await renderizarLuvaOuro(container, luvaCache, timeId);
            }
        } catch (e) {
            if (window.Log) Log.warn("[PARTICIPANTE-LUVA-OURO] ⚠️ Erro ao ler cache:", e);
        }
    }

    // ✅ v4.1: Mostrar loading spinner se não tiver cache
    if (!usouCache) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;">
                <div class="app-spinner"></div>
                <p style="color:var(--app-text-muted);margin-top:16px;font-size:13px;">Carregando Luva de Ouro...</p>
            </div>
        `;
    }

    try {
        const ligaRes = await fetch(`/api/ligas/${ligaId}`);
        if (ligaRes.ok) {
            const liga = await ligaRes.json();
            const modulosAtivos =
                liga.modulosAtivos || liga.modulos_ativos || {};
            // v2.0: Módulo OPCIONAL, só habilita se === true
            const luvaAtiva = modulosAtivos.luvaOuro === true;

            if (!luvaAtiva) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 215, 0, 0.02) 100%); border-radius: 12px; border: 2px dashed rgba(255, 215, 0, 0.3);">
                        <span class="material-symbols-outlined" style="font-size: 64px; margin-bottom: 16px; color: var(--app-gold);">sports_handball</span>
                        <h3 style="color: var(--app-text-primary); margin-bottom: 12px;">Luva de Ouro</h3>
                        <p style="color: #999;">Este módulo não está ativo para esta liga.</p>
                    </div>
                `;
                return;
            }
        }

        // ✅ v4.1: Endpoint dinâmico (live vs consolidado) — paridade com Capitão
        const endpoint = estadoLuva.modeLive
            ? `/api/luva-de-ouro/${ligaId}/ranking-live`
            : `/api/luva-de-ouro/${ligaId}/ranking`;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("Dados não disponíveis");

        let responseData = await response.json();

        // ✅ v4.1: Se live retornou indisponível, fallback para consolidado
        if (estadoLuva.modeLive && responseData.disponivel === false) {
            if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] ⚠️ Live indisponível, fallback consolidado");
            const fallbackResp = await fetch(`/api/luva-de-ouro/${ligaId}/ranking`);
            if (fallbackResp.ok) {
                responseData = await fallbackResp.json();
            }
        }

        if (window.Log) Log.info(
            "[PARTICIPANTE-LUVA-OURO] 📦 Dados recebidos da API",
        );

        // ✅ v4.0: Salvar no IndexedDB para próxima visita
        if (window.OfflineCache) {
            try {
                await window.OfflineCache.set('luvaOuro', ligaId, responseData);
                if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] 💾 Cache IndexedDB atualizado");
            } catch (e) {
                if (window.Log) Log.warn("[PARTICIPANTE-LUVA-OURO] ⚠️ Erro ao salvar cache:", e);
            }
        }

        // Só re-renderizar se dados mudaram ou se não usou cache antes
        const dadosMudaram = !usouCache ||
            !dadosCache ||
            JSON.stringify(dadosCache.ranking?.slice(0,3)) !== JSON.stringify(responseData.ranking?.slice(0,3));

        if (dadosMudaram) {
            await renderizarLuvaOuro(container, responseData, timeId);
            if (usouCache && window.Log) {
                Log.info("[PARTICIPANTE-LUVA-OURO] 🔄 Re-renderizado com dados frescos");
            }
        } else if (window.Log) {
            Log.info("[PARTICIPANTE-LUVA-OURO] ✅ Dados iguais, mantendo renderização do cache");
        }
    } catch (error) {
        if (window.Log) Log.error("[PARTICIPANTE-LUVA-OURO] ❌ Erro:", error);
        if (!usouCache) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 215, 0, 0.02) 100%); border-radius: 12px; border: 2px dashed rgba(255, 215, 0, 0.3);">
                    <span class="material-symbols-outlined" style="font-size: 64px; margin-bottom: 16px; color: var(--app-gold);">sports_handball</span>
                    <h3 style="color: var(--app-text-primary); margin-bottom: 12px;">Luva de Ouro</h3>
                    <p style="color: #999;">Dados não disponíveis no momento.</p>
                </div>
            `;
        }
    }
}

window.inicializarLuvaOuroParticipante = inicializarLuvaOuroParticipante;

// =====================================================================
// HELPERS
// =====================================================================
function getNome(item) {
    return item?.participanteNome || item?.nome || "N/D";
}

function getParticipanteId(item) {
    return String(item?.participanteId || item?.timeId || "");
}

function getPontos(item) {
    const pontos = item?.pontosTotais ?? item?.pontos ?? 0;
    return typeof pontos === "number" ? pontos : parseFloat(pontos) || 0;
}

function isMyTime(item, meuTimeId) {
    return getParticipanteId(item) === String(meuTimeId);
}

// =====================================================================
// ✅ v3.8: BANNER RODADA FINAL / CAMPEÃO
// =====================================================================
function renderizarBannerRodadaFinal(
    rodadaAtual,
    mercadoAberto,
    lider,
    temporadaEncerrada,
) {
    if (rodadaAtual !== RODADA_FINAL) return "";

    const liderNome = lider ? getNome(lider) : "---";
    const liderPontos = lider ? getPontos(lider).toFixed(1) : "0";

    // ✅ v3.8: Detectar se é campeão confirmado
    if (temporadaEncerrada) {
        return `
            <style>
                @keyframes luvaCampeaoShine {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                .luva-banner-campeao {
                    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 180, 0, 0.08) 100%);
                    border: 2px solid rgba(255, 215, 0, 0.5);
                    border-radius: 12px;
                    padding: 14px 16px;
                    margin-bottom: 16px;
                }
                .luva-campeao-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }
                .luva-campeao-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .luva-campeao-badge {
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--app-gold);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    background: linear-gradient(90deg, var(--app-gold), #ffaa00, var(--app-gold));
                    background-size: 200% auto;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    animation: luvaCampeaoShine 3s linear infinite;
                }
                .luva-campeao-status {
                    font-size: 9px;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-weight: 600;
                    background: rgba(255, 215, 0, 0.25);
                    color: var(--app-gold);
                }
                .luva-campeao-info {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: rgba(0, 0, 0, 0.25);
                    border-radius: 10px;
                    padding: 12px 14px;
                }
                .luva-campeao-nome {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--app-text-primary);
                }
                .luva-campeao-label {
                    font-size: 9px;
                    color: var(--app-gold);
                    font-weight: 600;
                    text-transform: uppercase;
                    margin-bottom: 2px;
                }
                .luva-campeao-pontos {
                    text-align: right;
                }
                .luva-campeao-pontos-valor {
                    font-size: 20px;
                    font-weight: 800;
                    color: var(--app-gold);
                }
                .luva-campeao-pontos-label {
                    font-size: 8px;
                    color: #888;
                    text-transform: uppercase;
                }
            </style>
            <div class="luva-banner-campeao">
                <div class="luva-campeao-header">
                    <div class="luva-campeao-title">
                        <span class="material-icons" style="font-size: 22px; color: var(--app-gold);">emoji_events</span>
                        <span class="luva-campeao-badge">CAMPEÃO LUVA DE OURO</span>
                    </div>
                    <span class="luva-campeao-status"><span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">check</span> CONSOLIDADO</span>
                </div>
                <div class="luva-campeao-info">
                    <div>
                        <div class="luva-campeao-label">Campeão</div>
                        <div class="luva-campeao-nome">${escapeHtml(liderNome)}</div>
                    </div>
                    <div class="luva-campeao-pontos">
                        <div class="luva-campeao-pontos-valor">${liderPontos}</div>
                        <div class="luva-campeao-pontos-label">pontos</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Rodada 38 em andamento
    const isParcial = !mercadoAberto;

    return `
        <style>
            @keyframes bannerPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(255, 215, 0, 0); }
            }
            @keyframes shimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            .luva-banner-final {
                background: linear-gradient(135deg, rgba(255, 215, 0, 0.12) 0%, rgba(255, 180, 0, 0.08) 100%);
                border: 1px solid rgba(255, 215, 0, 0.35);
                border-radius: 12px;
                padding: 12px 16px;
                margin-bottom: 16px;
                ${isParcial ? "animation: bannerPulse 2s ease-in-out infinite;" : ""}
            }
            .luva-banner-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
            }
            .luva-banner-title {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .luva-banner-text {
                font-size: 11px;
                font-weight: 700;
                color: var(--app-gold);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .luva-banner-status {
                font-size: 9px;
                padding: 3px 8px;
                border-radius: 4px;
                font-weight: 600;
                ${
                    isParcial
                        ? "background: rgba(34, 197, 94, 0.2); color: var(--app-success-light);"
                        : "background: rgba(255, 215, 0, 0.2); color: var(--app-gold);"
                }
            }
            .luva-banner-lider {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 8px;
                padding: 10px 12px;
            }
            .luva-banner-lider-badge {
                font-size: 9px;
                font-weight: 700;
                color: var(--app-gold);
                text-transform: uppercase;
                background: linear-gradient(90deg, var(--app-gold), #ffaa00, var(--app-gold));
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: shimmer 3s linear infinite;
            }
            .luva-banner-lider-nome {
                font-size: 14px;
                font-weight: 700;
                color: var(--app-text-primary);
            }
            .luva-banner-lider-pontos {
                text-align: right;
            }
            .luva-banner-lider-valor {
                font-size: 18px;
                font-weight: 800;
                color: var(--app-gold);
            }
            .luva-banner-lider-label {
                font-size: 8px;
                color: #888;
                text-transform: uppercase;
            }
        </style>

        <div class="luva-banner-final">
            <div class="luva-banner-header">
                <div class="luva-banner-title">
                    <span class="material-icons" style="font-size: 18px; color: var(--app-gold); vertical-align: middle;">emoji_events</span>
                    <span class="luva-banner-text">Rodada Final</span>
                </div>
                <span class="luva-banner-status">${isParcial ? "● Em andamento" : "Última Rodada"}</span>
            </div>
            <div class="luva-banner-lider">
                <div>
                    <div class="luva-banner-lider-badge">Possível Campeão</div>
                    <div class="luva-banner-lider-nome">${escapeHtml(liderNome)}</div>
                </div>
                <div class="luva-banner-lider-pontos">
                    <div class="luva-banner-lider-valor">${liderPontos}</div>
                    <div class="luva-banner-lider-label">pontos</div>
                </div>
            </div>
        </div>
    `;
}

// =====================================================================
// v5.0: HELPERS
// =====================================================================

/** Compacta nome: "Alisson Becker" → "A. Becker" */
function _nomeCompacto(nome) {
    if (!nome) return '?';
    const partes = nome.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].slice(0, 10);
    return partes[0][0] + '. ' + partes[partes.length - 1].slice(0, 9);
}

/** Retorna array de rodadas com goleiro compacto para painel colapsável */
function _resumoRodadasGoleiro(rodadas) {
    if (!rodadas || !Array.isArray(rodadas)) return [];
    return rodadas
        .filter(r => r.goleiroNome && r.goleiroNome !== 'Sem goleiro' && (r.pontos || 0) > 0)
        .sort((a, b) => a.rodada - b.rodada)
        .map(r => ({
            rodada: r.rodada,
            goleiro: _nomeCompacto(r.goleiroNome),
            pontos: Math.trunc((r.pontos || 0) * 10) / 10,
        }));
}

// =====================================================================
// RENDERIZAÇÃO
// =====================================================================
async function renderizarLuvaOuro(container, response, meuTimeId) {
    const data = response.data || response;

    let ranking = [];
    let rodadaInicio = 1;
    let rodadaFim = 36;
    let rodadaAtual = null;
    let mercadoAberto = true;
    let temporadaEncerrada = false;

    if (data.ranking && Array.isArray(data.ranking)) {
        ranking = data.ranking;
        rodadaInicio = data.rodadaInicio || 1;
        rodadaFim = data.rodadaFim || 36;
        rodadaAtual = data.rodadaAtual || null;
        mercadoAberto = data.mercadoAberto !== false;
    } else if (Array.isArray(data)) {
        ranking = data;
    }

    // ✅ v3.8: BUSCAR STATUS DO MERCADO PARA DETECTAR TEMPORADA ENCERRADA
    try {
        const mercadoRes = await fetch("/api/cartola/mercado/status");
        if (mercadoRes.ok) {
            const mercado = await mercadoRes.json();
            rodadaAtual =
                mercado.rodada_atual || mercado.rodadaAtual || rodadaFim;
            mercadoAberto = mercado.status_mercado === 1;

            // Temporada encerrada: status_mercado = 6 OU (rodada >= 38 E mercado fechado)
            temporadaEncerrada =
                mercado.status_mercado === 6 ||
                (rodadaAtual >= RODADA_FINAL && mercado.status_mercado !== 1);

            estadoLuva.rodadaAtual = rodadaAtual;
            estadoLuva.mercadoAberto = mercadoAberto;
            estadoLuva.temporadaEncerrada = temporadaEncerrada;

            if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] 📊 Status:", {
                rodadaAtual,
                mercadoAberto,
                temporadaEncerrada,
                statusMercado: mercado.status_mercado,
            });
        } else {
            rodadaAtual = rodadaFim;
            if (window.Log) Log.warn(
                "[PARTICIPANTE-LUVA-OURO] ⚠️ API mercado indisponível, usando rodadaFim:",
                rodadaFim,
            );
        }
    } catch (e) {
        if (window.Log) Log.warn(
            "[PARTICIPANTE-LUVA-OURO] ⚠️ Erro ao obter mercado:",
            e.message,
        );
        rodadaAtual = rodadaFim;
    }

    // ✅ FILTRAR TIMES INATIVOS - NÃO PODEM FIGURAR NO RANKING
    const rankingAtivos = ranking.filter((time) => {
        const isInativo = time.ativo === false || time.status === "inativo";
        return !isInativo;
    });

    if (rankingAtivos.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 215, 0, 0.02) 100%); border-radius: 12px; border: 2px dashed rgba(255, 215, 0, 0.3);">
                <span class="material-symbols-outlined" style="font-size: 64px; margin-bottom: 16px; color: var(--app-gold);">sports_handball</span>
                <h3 style="color: var(--app-text-primary); margin-bottom: 12px;">Luva de Ouro Não Disponível</h3>
                <p style="color: #999;">Nenhum dado de goleiros disponível ainda.</p>
            </div>
        `;
        return;
    }

    const campeao = rankingAtivos[0];
    const minhaPosicao = rankingAtivos.findIndex((r) => isMyTime(r, meuTimeId));
    const meusDados = minhaPosicao >= 0 ? rankingAtivos[minhaPosicao] : null;
    const minhaColocacao = minhaPosicao >= 0 ? minhaPosicao + 1 : null;

    const distanciaLider =
        campeao && meusDados ? getPontos(campeao) - getPontos(meusDados) : 0;

    // Dados ricos
    let ultimaRodadaInfo = meusDados?.ultimaRodada || null;
    let meusGoleiros = [];
    let historicoRecente = [];

    if (meusDados?.rodadas && Array.isArray(meusDados.rodadas)) {
        const rodadasOrdenadas = [...meusDados.rodadas].sort(
            (a, b) => b.rodada - a.rodada,
        );
        historicoRecente = rodadasOrdenadas.slice(0, 5);

        const goleirosMap = {};
        meusDados.rodadas.forEach((r) => {
            const nome = r.goleiroNome;
            const pontos = r.pontos || 0;
            if (nome && nome !== "Sem goleiro" && pontos > 0) {
                if (!goleirosMap[nome]) goleirosMap[nome] = { nome, pontos: 0, rodadas: 0 };
                goleirosMap[nome].pontos += pontos;
                goleirosMap[nome].rodadas += 1;
            }
        });
        meusGoleiros = Object.values(goleirosMap)
            .sort((a, b) => b.pontos - a.pontos)
            .slice(0, 3);
    }

    // ✅ v3.8: Banner da rodada final com detecção de campeão
    const bannerRodadaFinal = renderizarBannerRodadaFinal(
        rodadaAtual,
        mercadoAberto,
        campeao,
        temporadaEncerrada,
    );

    // ✅ v3.8: Labels dinâmicos
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
        <div style="background: linear-gradient(135deg, var(--app-surface) 0%, #262626 100%); border-radius: 16px; padding: 16px; margin-bottom: 16px; border: 1px solid rgba(255, 215, 0, 0.3);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--app-gold); font-weight: 600; font-size: 14px;">
                <span class="material-icons" style="font-size: 20px;">insights</span>
                <span>Seu Desempenho</span>
            </div>
            <div style="background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0.05) 100%); border: 2px solid rgba(255, 215, 0, 0.4); border-radius: 16px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 10px; color: var(--app-gold); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Sua Posição</div>
                    <div style="font-size: 28px; font-weight: 900; color: var(--app-text-primary);">${minhaColocacao}º</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 26px; font-weight: 800; color: var(--app-gold);">${getPontos(meusDados).toFixed(1)}</div>
                    <div style="font-size: 9px; color: #888;">pontos</div>
                </div>
            </div>

            ${
                minhaColocacao > 1
                    ? `
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #888; font-size: 11px;">Distância p/ ${labelLider.toLowerCase()}</span>
                <span style="color: var(--app-amber); font-weight: 700; font-size: 13px;">-${distanciaLider.toFixed(1)} pts</span>
            </div>
            `
                    : `
            <div style="background: linear-gradient(90deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.1)); border-radius: 8px; padding: 8px 12px; text-align: center;">
                <span style="color: var(--app-gold); font-weight: 700; font-size: 13px;">${textoVoceELider}</span>
            </div>
            `
            }
            </div>
        </div>

        ${
            meusGoleiros.length > 0
                ? (() => {
                    const maxPts = meusGoleiros[0].pontos;
                    const top1 = meusGoleiros[0];
                    const runners = meusGoleiros.slice(1);
                    const medalColors = ['var(--app-silver, #c0c0c0)', 'var(--app-bronze, #cd7f32)'];
                    return `
        <div class="luva-meus-goleiros">
            <div class="luva-meus-goleiros-header">
                <span class="material-symbols-outlined">sports_handball</span> Seus Goleiros
            </div>
            <div class="luva-top1-card">
                <div class="luva-top1-left">
                    <span class="material-icons luva-top1-medal">workspace_premium</span>
                    <div class="luva-top1-info">
                        <div class="luva-top1-nome">${escapeHtml(top1.nome)}</div>
                        <div class="luva-top1-rodadas">${top1.rodadas} rodada${top1.rodadas !== 1 ? 's' : ''} escalado</div>
                    </div>
                </div>
                <div class="luva-top1-pontos">
                    <div class="luva-top1-pontos-valor">${(Math.trunc((top1.pontos||0) * 10) / 10).toFixed(1)}</div>
                    <div class="luva-top1-pontos-label">pontos</div>
                </div>
            </div>
            ${runners.map((g, idx) => {
                const pct = maxPts > 0 ? Math.round((g.pontos / maxPts) * 100) : 0;
                return `
            <div class="luva-runner">
                <div class="luva-runner-medal"><span class="material-icons" style="color: ${medalColors[idx]};">workspace_premium</span></div>
                <div class="luva-runner-content">
                    <div class="luva-runner-top">
                        <span class="luva-runner-nome">${escapeHtml(g.nome)}</span>
                        <span class="luva-runner-pts">${(Math.trunc((g.pontos||0) * 10) / 10).toFixed(1)} pts</span>
                    </div>
                    <div class="luva-runner-bar-bg"><div class="luva-runner-bar-fill" style="width: ${pct}%;"></div></div>
                </div>
            </div>`;
            }).join('')}
        </div>`;
                })()
                : ""
        }

        ${
            historicoRecente.length > 0
                ? `
        <div class="luva-ultimas-rodadas">
            <div class="luva-ultimas-header">
                <span class="material-symbols-outlined">bar_chart</span> Últimas Rodadas
                <span style="margin-left: auto; font: 400 9px 'Inter', sans-serif; color: #555; text-transform: none; letter-spacing: 0;">toque para ver goleiro</span>
            </div>
            <div class="luva-rodadas-grid">
                ${historicoRecente
                    .map((r) => {
                        const pontos = r.pontos || 0;
                        const bgColor =
                            pontos >= 5
                                ? "rgba(255, 215, 0, 0.2)"
                                : pontos > 0
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : "rgba(255,255,255,0.05)";
                        const textColor =
                            pontos >= 5
                                ? "var(--app-gold)"
                                : pontos > 0
                                  ? "var(--app-info)"
                                  : "#666";
                        return `
                    <div class="luva-rodada-box" style="background: ${bgColor};" data-rodada="${r.rodada}">
                        <div class="luva-rodada-num">R${r.rodada}</div>
                        <div class="luva-rodada-pts" style="color: ${textColor};">${(Math.trunc((pontos||0) * 10) / 10).toFixed(1)}</div>
                    </div>`;
                    })
                    .join("")}
            </div>
            <div class="luva-rodada-detalhe" id="luva-rodada-detalhe"></div>
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
        <div style="background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.03) 100%); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined" style="font-size: 24px; color: var(--app-gold);">emoji_events</span>
                <div>
                    <div style="font-size: 10px; color: var(--app-gold); font-weight: 700; text-transform: uppercase;">${labelLider}</div>
                    <div style="font-size: 14px; font-weight: 700; color: var(--app-text-primary);">${escapeHtml(campeao.participanteNome || campeao.nomeCartoleiro || campeao.nome || 'N/D')}</div>
                    <div style="font-size: 11px; color: #888;">${escapeHtml(campeao.nomeTime || campeao.nome_time || '')}</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 18px; font-weight: 800; color: var(--app-gold);">${getPontos(campeao).toFixed(1)}</div>
                <div style="font-size: 8px; color: #888;">pontos</div>
            </div>
        </div>
        `
                : ""
        }

        <details style="background: rgba(0,0,0,0.3); border-radius: 12px; overflow: hidden;" open>
            <summary style="background: rgba(255, 215, 0, 0.1); padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 215, 0, 0.2);">
                <span style="font-size: 13px; font-weight: 700; color: var(--app-gold); display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 16px;">list_alt</span> Ranking Completo</span>
                <span style="font-size: 11px; color: #888;">${rankingAtivos.length} participantes</span>
            </summary>

            <div style="font: 400 9px 'Inter', sans-serif; color: #555; text-align: center; padding: 6px 0 2px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                <span class="material-icons" style="font-size: 11px; vertical-align: middle;">touch_app</span> toque no participante para ver goleiros
            </div>

            <div style="max-height: 400px; overflow-y: auto;" id="luva-ranking-list">
            ${(() => {
                const ativos = rankingAtivos;
                const inativos = ranking.filter(
                    (time) => time.ativo === false || time.status === "inativo",
                );

                let htmlR = "";

                ativos.forEach((time, idx) => {
                    const isMeuTime = isMyTime(time, meuTimeId);
                    const pos = idx + 1;
                    const posDisplay = pos === 1 ? '<span class="material-symbols-outlined" style="font-size: 16px; color: var(--app-gold);">emoji_events</span>' : pos + '\u00BA';
                    const pts = getPontos(time).toFixed(1);
                    const tid = time.timeId || time.time_id || '';

                    const rodadas = _resumoRodadasGoleiro(time.rodadas);

                    htmlR += '<div class="luva-ranking-row" data-timeid="' + tid + '"' + (isMeuTime ? ' style="background:rgba(255,215,0,0.15);"' : '') + '>'
                        + '<div style="display:flex;align-items:center;gap:10px;">'
                        + '<span style="font-size:' + (pos === 1 ? '16px' : '12px') + ';width:26px;' + (pos === 1 ? '' : 'color:#888;') + '">' + posDisplay + '</span>'
                        + '<div>'
                        + '<div style="color:' + (isMeuTime ? 'var(--app-gold)' : 'var(--app-text-primary)') + ';font-weight:' + (isMeuTime ? '700' : '500') + ';font-size:12px;">' + escapeHtml(time.participanteNome || time.nomeCartoleiro || time.nome || 'N/D') + '</div>'
                        + '<div style="color:#888;font-size:11px;">' + escapeHtml(time.nomeTime || time.nome_time || '') + '</div>'
                        + '</div></div>'
                        + '<div style="display:flex;gap:12px;align-items:center;">'
                        + '<span style="color:var(--app-gold);font-weight:700;font-size:13px;">' + pts + '</span>'
                        + '<span class="material-icons luva-expand-icon">expand_more</span>'
                        + '</div></div>';

                    htmlR += '<div class="luva-collapse-panel" data-panel-timeid="' + tid + '">'
                        + '<div class="luva-collapse-inner">';
                    if (rodadas.length > 0) {
                        rodadas.forEach(r => {
                            const cor = r.pontos >= 5 ? 'var(--app-gold)' : r.pontos > 0 ? 'var(--app-info)' : '#888';
                            htmlR += '<div class="luva-collapse-rodada">'
                                + '<span class="luva-collapse-rodada-badge" style="color:' + cor + ';">R' + r.rodada + '</span>'
                                + '<span class="luva-collapse-rodada-info">' + r.goleiro + '</span>'
                                + '<span class="luva-collapse-rodada-pts">' + r.pontos.toFixed(1) + '</span>'
                                + '</div>';
                        });
                    } else {
                        htmlR += '<div class="luva-collapse-vazio">Nenhum goleiro registrado</div>';
                    }
                    htmlR += '</div></div>';
                });

                if (inativos.length > 0) {
                    htmlR += '<div style="padding:8px 14px;background:rgba(100,100,100,0.15);border-top:1px dashed rgba(100,100,100,0.4);border-bottom:1px dashed rgba(100,100,100,0.4);">'
                        + '<span style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">'
                        + '<span class="material-icons" style="font-size:12px;vertical-align:middle;margin-right:4px;">person_off</span>'
                        + 'Participantes Inativos</span></div>';

                    inativos.forEach((time) => {
                        htmlR += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);opacity:0.5;filter:grayscale(60%);">'
                            + '<div style="display:flex;align-items:center;gap:10px;">'
                            + '<span style="font-size:12px;width:26px;color:#555;">\u2014</span>'
                            + '<div>'
                            + '<div style="color:#666;font-weight:400;font-size:12px;">' + escapeHtml(time.participanteNome || time.nomeCartoleiro || time.nome || 'N/D') + '</div>'
                            + '<div style="color:#555;font-size:11px;">' + escapeHtml(time.nomeTime || time.nome_time || '') + '</div>'
                            + '</div></div>'
                            + '<span style="color:#555;font-weight:500;font-size:13px;">' + getPontos(time).toFixed(1) + '</span>'
                            + '</div>';
                    });
                }

                return htmlR;
            })()}
            </div>
        </details>
    </div>
    `;

    container.innerHTML = html;

    // ✅ v5.0: Event listeners — Ranking colapsável
    container.querySelectorAll('.luva-ranking-row').forEach(row => {
        row.addEventListener('click', () => {
            const tid = row.dataset.timeid;
            const panel = container.querySelector('.luva-collapse-panel[data-panel-timeid="' + tid + '"]');
            if (!panel) return;

            const isOpen = panel.classList.contains('open');

            // Fechar todos os outros painéis
            container.querySelectorAll('.luva-collapse-panel.open').forEach(p => {
                p.classList.remove('open');
                p.style.maxHeight = '0';
            });
            container.querySelectorAll('.luva-ranking-row.expanded').forEach(r => r.classList.remove('expanded'));

            if (!isOpen) {
                row.classList.add('expanded');
                panel.classList.add('open');
                panel.style.maxHeight = panel.scrollHeight + 'px';
            }
        });
    });

    // ✅ v5.0: Event listeners — Últimas Rodadas interativo
    const rodadaBoxes = container.querySelectorAll('.luva-rodada-box');
    const detalheContainer = container.querySelector('#luva-rodada-detalhe');

    if (rodadaBoxes.length > 0 && detalheContainer && meusDados?.rodadas) {
        let selectedRodada = null;

        rodadaBoxes.forEach(box => {
            box.addEventListener('click', () => {
                const rodadaNum = parseInt(box.dataset.rodada, 10);

                // Toggle: se já selecionado, fechar
                if (selectedRodada === rodadaNum) {
                    selectedRodada = null;
                    rodadaBoxes.forEach(b => b.classList.remove('selected'));
                    detalheContainer.classList.remove('open');
                    detalheContainer.style.maxHeight = '0';
                    return;
                }

                selectedRodada = rodadaNum;
                rodadaBoxes.forEach(b => b.classList.remove('selected'));
                box.classList.add('selected');

                // Buscar dados da rodada
                const rodadaData = meusDados.rodadas.find(r => r.rodada === rodadaNum);
                const goleiro = rodadaData?.goleiroNome || 'Sem goleiro';
                const pts = Math.trunc((rodadaData?.pontos || 0) * 10) / 10;

                detalheContainer.innerHTML = `
                    <div class="luva-rodada-detalhe-inner">
                        <div class="luva-rodada-detalhe-goleiro">
                            <span class="material-icons">sports_handball</span>
                            ${escapeHtml(goleiro)}
                        </div>
                        <span class="luva-rodada-detalhe-pts">${pts.toFixed(1)} pts</span>
                    </div>`;

                detalheContainer.classList.add('open');
                detalheContainer.style.maxHeight = detalheContainer.scrollHeight + 'px';
            });
        });
    }
}

// =====================================================================
// ✅ v4.1: MATCHDAY EVENTS — Paridade com Capitão
// =====================================================================
function _subscribeMatchdayEvents() {
    if (!window.MatchdayService) return;

    // Handler para atualização de parciais
    estadoLuva._onParciais = () => {
        if (window.Log) Log.info('[PARTICIPANTE-LUVA-OURO]', 'Atualizando com parciais');
        _recarregarRanking();
    };

    // Handler para fim do matchday (mercado abriu)
    estadoLuva._onMatchdayStop = () => {
        if (window.Log) Log.info('[PARTICIPANTE-LUVA-OURO]', 'Matchday encerrado — voltando p/ consolidado');
        estadoLuva.modeLive = false;
        _recarregarRanking();
    };

    window.MatchdayService.on('data:parciais', estadoLuva._onParciais);
    window.MatchdayService.on('matchday:stop', estadoLuva._onMatchdayStop);
}

/**
 * Recarrega ranking usando o estado salvo (ligaId, timeId).
 * Chamada pelos eventos do MatchdayService.
 */
async function _recarregarRanking() {
    const { ligaId, timeId } = estadoLuva;
    if (!ligaId) return;

    const container = document.getElementById("luvaOuroContainer");
    if (!container) return;

    try {
        const endpoint = estadoLuva.modeLive
            ? `/api/luva-de-ouro/${ligaId}/ranking-live`
            : `/api/luva-de-ouro/${ligaId}/ranking`;

        const response = await fetch(endpoint);
        if (!response.ok) return;

        let responseData = await response.json();

        // Fallback se live indisponível
        if (estadoLuva.modeLive && responseData.disponivel === false) {
            const fallbackResp = await fetch(`/api/luva-de-ouro/${ligaId}/ranking`);
            if (fallbackResp.ok) {
                responseData = await fallbackResp.json();
            }
        }

        // Salvar no cache se consolidado
        if (!estadoLuva.modeLive && window.OfflineCache) {
            try {
                await window.OfflineCache.set('luvaOuro', ligaId, responseData);
            } catch (e) { /* cache não é crítico */ }
        }

        await renderizarLuvaOuro(container, responseData, timeId);
    } catch (error) {
        if (window.Log) Log.error("[PARTICIPANTE-LUVA-OURO] Erro ao recarregar:", error);
    }
}

/**
 * Cleanup — chamado na navegação SPA para evitar memory leaks.
 * Exposto via window para participante-navigation.js.
 */
export function destruirLuvaOuroParticipante() {
    if (window.Log) Log.info('[PARTICIPANTE-LUVA-OURO]', 'Destruindo módulo (cleanup)');

    // Remover listeners do MatchdayService
    if (window.MatchdayService) {
        if (estadoLuva._onParciais) {
            window.MatchdayService.off('data:parciais', estadoLuva._onParciais);
        }
        if (estadoLuva._onMatchdayStop) {
            window.MatchdayService.off('matchday:stop', estadoLuva._onMatchdayStop);
        }
    }

    // Reset estado
    estadoLuva.modeLive = false;
    estadoLuva.ligaId = null;
    estadoLuva.timeId = null;
    estadoLuva.rankingAtual = null;
    estadoLuva._onParciais = null;
    estadoLuva._onMatchdayStop = null;
}
window.destruirLuvaOuroParticipante = destruirLuvaOuroParticipante;

if (window.Log) Log.info("[PARTICIPANTE-LUVA-OURO] Módulo v4.1 carregado (MatchdayService + Cache-First)");

// =====================================================================
// MODULE LP — Landing Page Utils (Luva de Ouro)
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

