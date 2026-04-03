import { injectModuleLP } from './module-lp-engine.js';
// PARTICIPANTE PONTOS CORRIDOS - v5.7
// ✅ v5.7: BYE notice — aviso ao participante quando está de folga na rodada
// ✅ v5.6: Rodadas futuras navegáveis (bracket a partir da ordem canônica do admin)
// ✅ v5.5: Auto-refresh 60s para parciais ao vivo (mercado fechado)
// ✅ v5.3: FIX - totalRodadas calculado a partir do número de times (N-1), não dados.length
// ✅ v5.2: FIX - Double RAF para garantir container no DOM após refresh
// ✅ v5.1: Cache-first com IndexedDB para carregamento instantâneo
// ✅ v4.9: Emojis substituídos por Material Icons + Card "Seu Desempenho"
// ✅ v5.0: Posição na liga integrada no card + card ao final da página

if (window.Log) Log.info("[PONTOS-CORRIDOS] 📊 Módulo v5.6 carregando...");

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const estadoPC = {
    ligaId: null,
    timeId: null,
    temporada: null, // ✅ AUDIT-FIX: Adicionar campo temporada
    rodadaAtual: 1,
    rodadaSelecionada: 1,
    totalRodadas: 31,
    dados: [],
    viewMode: "confrontos",
    mercadoRodada: 1,
    mercadoTemporada: null, // ✅ AUDIT-FIX: Temporada da API Cartola
    mercadoAberto: true,
    ligaEncerrou: false,
    rodadaInicial: 2, // ✅ v5.3: Default 2026, será atualizado pela config API
    _refreshInterval: null, // ✅ v5.5: Timer do auto-refresh de parciais
    _refreshAtivo: false,
    desempenhoExpanded: false, // ✅ v5.8: Card Seu Desempenho começa colapsado
};

// ============================================
// ✅ v5.6: BRACKET CANÔNICO — RODADAS FUTURAS
// ============================================

// Extrai a ordem canônica dos times do cache do admin (mesmo algoritmo do backend).
function _extrairOrdemDoCache(dados, allTeamIds) {
    if (!dados || dados.length === 0) return null;
    const cacheBase = [...dados]
        .sort((a, b) => (b.rodada || 0) - (a.rodada || 0))
        .find(r => r.confrontos?.length > 0);
    if (!cacheBase) return null;

    const rodadaNum = cacheBase.rodada;
    const confrontos = cacheBase.confrontos;

    const teamsInConfrontos = new Set();
    confrontos.forEach(c => {
        if (c.time1?.id) teamsInConfrontos.add(String(c.time1.id));
        if (c.time2?.id) teamsInConfrontos.add(String(c.time2.id));
    });
    const byeTeamId = allTeamIds
        ? (allTeamIds.find(id => !teamsInConfrontos.has(String(id))) || null)
        : null;
    const isOdd = byeTeamId !== null;

    let listaRodada, N;
    if (!isOdd) {
        N = confrontos.length * 2;
        listaRodada = new Array(N);
        for (let i = 0; i < confrontos.length; i++) {
            listaRodada[i] = String(confrontos[i].time1?.id);
            listaRodada[N - 1 - i] = String(confrontos[i].time2?.id);
        }
    } else {
        const nTeams = confrontos.length * 2 + 1;
        N = nTeams + 1;
        const nullPos = rodadaNum === 1 ? nTeams : rodadaNum - 1;
        const byePos = N - 1 - nullPos;
        const skipI = Math.min(nullPos, N - 1 - nullPos);
        listaRodada = new Array(N).fill(null);
        listaRodada[nullPos] = null;
        listaRodada[byePos] = String(byeTeamId);
        for (let j = 0; j < confrontos.length; j++) {
            const actualI = j < skipI ? j : j + 1;
            listaRodada[actualI] = String(confrontos[j].time1?.id);
            listaRodada[N - 1 - actualI] = String(confrontos[j].time2?.id);
        }
    }

    const lista = [...listaRodada];
    for (let r = 0; r < rodadaNum - 1; r++) {
        const x = lista.splice(1, 1)[0];
        lista.push(x);
    }
    return lista.filter(x => x !== null);
}

// Gera bracket round-robin a partir de lista de IDs canônicos.
function _gerarBracket(listaIds) {
    const lista = [...listaIds];
    if (lista.length % 2 !== 0) lista.push(null);
    const rodadas = [];
    const total = lista.length - 1;
    for (let r = 0; r < total; r++) {
        const jogos = [];
        for (let i = 0; i < lista.length / 2; i++) {
            const idA = lista[i];
            const idB = lista[lista.length - 1 - i];
            if (idA !== null && idB !== null) jogos.push({ idA: String(idA), idB: String(idB) });
        }
        rodadas.push(jogos);
        lista.splice(1, 0, lista.pop());
    }
    return rodadas;
}

// Completa dados com entradas sintéticas para rodadas futuras (pairings sem scores).
function completarComRodadasFuturas(dados, totalRodadas) {
    if (!dados || dados.length === 0) return dados;

    // Construir timesMap a partir de todos os confrontos conhecidos
    const timesMap = {};
    dados.forEach(r => {
        (r.confrontos || []).forEach(c => {
            if (c.time1?.id) timesMap[String(c.time1.id)] = c.time1;
            if (c.time2?.id) timesMap[String(c.time2.id)] = c.time2;
        });
    });

    const allTeamIds = Object.keys(timesMap);
    if (allTeamIds.length === 0) return dados;

    const idsCanonicos = _extrairOrdemDoCache(dados, allTeamIds);
    if (!idsCanonicos) return dados;

    const bracket = _gerarBracket(idsCanonicos);
    const rodadasExistentes = new Set(dados.map(r => r.rodada));
    const dadosCompletos = [...dados];

    const maxRodadas = Math.max(totalRodadas, bracket.length);
    for (let i = 1; i <= maxRodadas; i++) {
        if (rodadasExistentes.has(i)) continue;
        const jogosRodada = bracket[i - 1];
        if (!jogosRodada) continue;

        const confrontosSinteticos = jogosRodada.map(j => ({
            time1: { ...(timesMap[j.idA] || { id: Number(j.idA) }), pontos: undefined },
            time2: { ...(timesMap[j.idB] || { id: Number(j.idB) }), pontos: undefined },
            pontos1: null,
            pontos2: null,
            diferenca: null,
        }));

        dadosCompletos.push({ rodada: i, confrontos: confrontosSinteticos, classificacao: [], pendente: true });
    }

    dadosCompletos.sort((a, b) => (a.rodada || 0) - (b.rodada || 0));
    if (window.Log) Log.info(`[PONTOS-CORRIDOS] ✅ v5.6: ${dadosCompletos.length} rodadas (${dados.length} com dados + ${dadosCompletos.length - dados.length} futuras)`);
    return dadosCompletos;
}

// ============================================
// ✅ v5.3: Calcula total de rodadas real baseado no número de times (N-1 para par, N para ímpar)
function calcularTotalRodadas(dados) {
    const rodadaComClassificacao = dados.find(r => r.classificacao?.length > 0);
    if (!rodadaComClassificacao) return 31;
    const totalTimes = rodadaComClassificacao.classificacao.length;
    if (totalTimes <= 1) return 31;
    return totalTimes % 2 === 0 ? totalTimes - 1 : totalTimes;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

export async function inicializarPontosCorridosParticipante(params = {}) {
    if (window.Log) Log.info("[PONTOS-CORRIDOS] 🚀 Inicializando v5.5...", params);

    // ✅ v5.5: Parar auto-refresh anterior (re-inicialização)
    pararAutoRefresh();

    // ✅ v5.2: Aguardar DOM estar renderizado (double RAF)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const participante = params.participante || window.participanteData || {};
    estadoPC.ligaId = params.ligaId || participante.ligaId;

    injectModuleLP({
        wrapperId:    'pontos-corridos-lp-wrapper',
        insertBefore: 'pontosCorridosModule',
        ligaId:       estadoPC.ligaId,
        moduloKey:    'pontos_corridos',
        titulo:       'Pontos Corridos',
        tagline:      'Liga interna todos contra todos',
        icon:         'format_list_numbered',
        colorClass:   'module-lp-pontos-corridos',
    });
    estadoPC.timeId = params.timeId || participante.timeId;

    // ✅ AUDIT-FIX: Buscar status mercado ANTES para obter temporada da API
    await buscarStatusMercado();

    // ✅ AUDIT-FIX: Inicializar temporada corretamente
    estadoPC.temporada = params.temporada ||
                         participante.temporada ||
                         estadoPC.mercadoTemporada || // Da API Cartola
                         new Date().getFullYear();

    if (window.Log) Log.info(`[PONTOS-CORRIDOS] 📅 Temporada ativa: ${estadoPC.temporada}`);

    // ✅ v5.3: Buscar rodadaInicial da config do módulo
    await buscarConfigModulo();

    // ✅ v5.1: CACHE-FIRST - Tentar carregar do IndexedDB primeiro
    let usouCache = false;
    let dadosCache = null;

    // FASE 1: CARREGAMENTO INSTANTÂNEO (Cache IndexedDB)
    if (window.OfflineCache) {
        try {
            // ✅ AUDIT-FIX: Chave composta ligaId:temporada para evitar mistura de temporadas
            const cacheKey = `${estadoPC.ligaId}:${estadoPC.temporada}`;
            const pcCache = await window.OfflineCache.get('pontosCorridos', cacheKey, true);
            if (pcCache && Array.isArray(pcCache) && pcCache.length > 0) {
                usouCache = true;
                dadosCache = pcCache;

                // Processar dados do cache
                const rodadasComConfrontos = pcCache.filter((r) => r.confrontos?.length > 0);
                estadoPC.totalRodadas = calcularTotalRodadas(pcCache);
                estadoPC.rodadaAtual = rodadasComConfrontos.length > 0
                    ? Math.max(...rodadasComConfrontos.map((r) => r.rodada))
                    : 1;
                estadoPC.rodadaSelecionada = estadoPC.rodadaAtual;
                // ✅ v5.6: Completar com rodadas futuras (bracket canônico)
                estadoPC.dados = completarComRodadasFuturas(pcCache, estadoPC.totalRodadas);

                const ultimaRodadaPossivel = estadoPC.totalRodadas;
                const ultimaRodadaDisputada = pcCache.find((r) => r.rodada === ultimaRodadaPossivel);
                estadoPC.ligaEncerrou = ultimaRodadaDisputada?.confrontos?.length > 0 &&
                    ultimaRodadaDisputada?.classificacao?.length > 0;

                // Renderizar IMEDIATAMENTE com dados do cache
                if (window.Log)
                    Log.info(`[PONTOS-CORRIDOS] ⚡ Cache IndexedDB: ${pcCache.length} rodadas`);

                renderizarInterface();
            }
        } catch (e) {
            if (window.Log) Log.warn("[PONTOS-CORRIDOS] ⚠️ Erro ao ler cache:", e);
        }
    }

    // Se não tem cache, mostrar loading
    if (!usouCache) {
        mostrarLoading();
    }

    try {
        // FASE 2: ATUALIZAÇÃO EM BACKGROUND (Fetch API)
        await buscarStatusMercado();
        const dados = await carregarDados();

        if (dados.length > 0) {
            estadoPC.totalRodadas = calcularTotalRodadas(dados);
            const rodadasComConfrontos = dados.filter(
                (r) => r.confrontos?.length > 0,
            );
            estadoPC.rodadaAtual =
                rodadasComConfrontos.length > 0
                    ? Math.max(...rodadasComConfrontos.map((r) => r.rodada))
                    : 1;
            estadoPC.rodadaSelecionada = estadoPC.rodadaAtual;

            // ✅ v5.6: Completar com rodadas futuras (bracket canônico do admin, sem scores)
            estadoPC.dados = completarComRodadasFuturas(dados, estadoPC.totalRodadas);

            const ultimaRodadaPossivel = estadoPC.totalRodadas;
            const ultimaRodadaDisputada = dados.find(
                (r) => r.rodada === ultimaRodadaPossivel,
            );
            estadoPC.ligaEncerrou =
                ultimaRodadaDisputada?.confrontos?.length > 0 &&
                ultimaRodadaDisputada?.classificacao?.length > 0;

            // ✅ v5.1: Salvar no IndexedDB para próxima visita
            if (window.OfflineCache) {
                try {
                    // ✅ AUDIT-FIX: Chave composta ligaId:temporada
                    const cacheKey = `${estadoPC.ligaId}:${estadoPC.temporada}`;
                    await window.OfflineCache.set('pontosCorridos', cacheKey, dados);
                    if (window.Log) Log.info(`[PONTOS-CORRIDOS] 💾 Cache IndexedDB atualizado (T${estadoPC.temporada})`);
                } catch (e) {
                    if (window.Log) Log.warn("[PONTOS-CORRIDOS] ⚠️ Erro ao salvar cache:", e);
                }
            }

            // ✅ v5.4: Sempre re-renderizar com dados frescos da API (evita cache stale)
            if (window.Log) Log.info(`[PONTOS-CORRIDOS] ✅ ${dados.length} rodadas carregadas`);
            renderizarInterface();

            // ✅ v5.5: Iniciar auto-refresh se parciais ao vivo
            iniciarAutoRefresh();
        } else {
            // ✅ AUDIT-FIX: API retornou 0 rodadas - limpar cache stale do IndexedDB
            if (usouCache && window.OfflineCache) {
                try {
                    const cacheKey = `${estadoPC.ligaId}:${estadoPC.temporada}`;
                    await window.OfflineCache.delete('pontosCorridos', cacheKey);
                    if (window.Log) Log.warn(`[PONTOS-CORRIDOS] 🗑️ Cache stale removido (T${estadoPC.temporada})`);
                } catch (e) { /* ignore */ }
            }
            // Limpar dados antigos do estado
            estadoPC.dados = [];
            // Verificar se é pré-temporada (rodada BR < rodada inicial do módulo)
            const rodadaBR = estadoPC.mercadoRodada || 0;
            const msgPreTemporada = `Temporada ${estadoPC.temporada} ainda não iniciou para o Pontos Corridos. Aguardando rodada ${rodadaBR > 0 ? `(atual: ${rodadaBR})` : ''} do Brasileirão.`;
            const msgGenerico = "Nenhum dado encontrado para esta temporada. Os dados serão gerados quando houver rodadas disputadas.";
            mostrarErro(rodadaBR < 7 ? msgPreTemporada : msgGenerico);
        }
    } catch (error) {
        if (window.Log) Log.error("[PONTOS-CORRIDOS] ❌ Erro:", error);
        if (!usouCache) {
            mostrarErro(error.message);
        }
    }
}

async function buscarStatusMercado() {
    try {
        const response = await fetch("/api/cartola/mercado/status");
        if (response.ok) {
            const status = await response.json();
            estadoPC.mercadoRodada = status.rodada_atual || 1;
            estadoPC.mercadoAberto = status.status_mercado === 1;
            estadoPC.mercadoTemporada = status.temporada; // ✅ AUDIT-FIX: Salvar temporada da API
            if (window.Log) Log.info(`[PONTOS-CORRIDOS] 📅 Mercado: Temporada ${status.temporada}, Rodada ${status.rodada_atual}`);
        }
    } catch (e) {
        if (window.Log) Log.warn("[PONTOS-CORRIDOS] ⚠️ Falha ao buscar status do mercado");
    }
}

// ✅ v5.3: Buscar rodadaInicial da config do módulo (dinâmico, não hardcoded)
async function buscarConfigModulo() {
    try {
        const response = await fetch(`/api/pontos-corridos/config/${estadoPC.ligaId}?temporada=${estadoPC.temporada}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.config) {
                estadoPC.rodadaInicial = data.config.rodadaInicial || 2;
                if (window.Log) Log.info(`[PONTOS-CORRIDOS] ⚙️ Config: rodadaInicial=${estadoPC.rodadaInicial}`);
            }
        }
    } catch (e) {
        if (window.Log) Log.warn("[PONTOS-CORRIDOS] ⚠️ Falha ao buscar config, usando rodadaInicial padrão");
    }
}

async function carregarDados() {
    // ✅ AUDIT-FIX: Passar temporada na API
    const response = await fetch(`/api/pontos-corridos/${estadoPC.ligaId}?temporada=${estadoPC.temporada}`);
    if (!response.ok) throw new Error("Falha ao carregar dados");
    const data = await response.json();
    if (window.Log) Log.info(`[PONTOS-CORRIDOS] ✅ ${data.length} rodadas carregadas (temporada ${estadoPC.temporada})`);
    return Array.isArray(data) ? data : [];
}

// ============================================
// AUTO-REFRESH PARCIAIS AO VIVO - v5.5
// ============================================

const REFRESH_INTERVAL_MS = 60000; // 60 segundos

function isParciaisAoVivo() {
    // Mercado fechado = jogos em andamento
    if (estadoPC.mercadoAberto) return false;
    // Liga já encerrou todas as rodadas
    if (estadoPC.ligaEncerrou) return false;
    // Rodada atual da liga deve ser > 0
    const rodadaAtualLiga = estadoPC.rodadaAtual;
    if (rodadaAtualLiga <= 0) return false;
    return true;
}

function iniciarAutoRefresh() {
    pararAutoRefresh();

    if (!isParciaisAoVivo()) {
        if (window.Log) Log.info("[PONTOS-CORRIDOS] ⏸️ Auto-refresh não necessário (sem parciais ao vivo)");
        return;
    }

    estadoPC._refreshAtivo = true;
    if (window.Log) Log.info(`[PONTOS-CORRIDOS] 🔄 Auto-refresh ativado (${REFRESH_INTERVAL_MS / 1000}s)`);

    estadoPC._refreshInterval = setInterval(async () => {
        if (!isParciaisAoVivo()) {
            pararAutoRefresh();
            return;
        }

        try {
            if (window.Log) Log.info("[PONTOS-CORRIDOS] 🔄 Atualizando parciais...");

            // Buscar status do mercado (pode ter mudado para aberto)
            await buscarStatusMercado();
            if (estadoPC.mercadoAberto) {
                if (window.Log) Log.info("[PONTOS-CORRIDOS] ✅ Mercado abriu, parando auto-refresh");
                pararAutoRefresh();
                return;
            }

            // Buscar dados frescos da API
            const dados = await carregarDados();
            if (dados.length > 0) {
                estadoPC.dados = dados;

                // Atualizar cache IndexedDB
                if (window.OfflineCache) {
                    try {
                        const cacheKey = `${estadoPC.ligaId}:${estadoPC.temporada}`;
                        await window.OfflineCache.set('pontosCorridos', cacheKey, dados);
                    } catch (e) { /* ignore */ }
                }

                // Re-renderizar apenas as views (sem resetar seletor/header)
                renderizarView();
                renderizarCardDesempenho();

                if (window.Log) Log.info("[PONTOS-CORRIDOS] ✅ Parciais atualizadas");
            }
        } catch (e) {
            if (window.Log) Log.warn("[PONTOS-CORRIDOS] ⚠️ Erro no auto-refresh:", e.message);
        }
    }, REFRESH_INTERVAL_MS);
}

function pararAutoRefresh() {
    if (estadoPC._refreshInterval) {
        clearInterval(estadoPC._refreshInterval);
        estadoPC._refreshInterval = null;
    }
    if (estadoPC._refreshAtivo) {
        estadoPC._refreshAtivo = false;
        if (window.Log) Log.info("[PONTOS-CORRIDOS] ⏹️ Auto-refresh parado");
    }
}

// ============================================
// CONTROLE DE ESTADOS
// ============================================

function mostrarLoading() {
    toggleElemento("pc-loading", true);
    toggleElemento("pc-error", false);
    toggleElemento("pc-content", false);
}

function mostrarErro(msg) {
    toggleElemento("pc-loading", false);
    toggleElemento("pc-error", true);
    toggleElemento("pc-content", false);
    setTexto("pc-error-msg", msg);
}

function mostrarConteudo() {
    toggleElemento("pc-loading", false);
    toggleElemento("pc-error", false);
    toggleElemento("pc-content", true);
}

function toggleElemento(id, mostrar) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !mostrar);
}

function setTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
}

// ============================================
// RENDERIZAÇÃO
// ============================================

function renderizarInterface() {
    mostrarConteudo();
    renderizarBannerCampeao();
    renderizarCardDesempenho(); // ✅ v4.9: Card Seu Desempenho
    atualizarHeader();
    atualizarSeletorRodadas();
    atualizarProgresso();
    atualizarToggle();
    renderizarView();
    scrollParaRodadaSelecionada();
}

// ============================================
// CARD SEU DESEMPENHO - v5.8 (compact + collapsible)
// ============================================

window.toggleDesempenhoPC = function () {
    estadoPC.desempenhoExpanded = !estadoPC.desempenhoExpanded;
    const body = document.getElementById("pc-desempenho-body");
    const chevron = document.getElementById("pc-desempenho-chevron");
    if (body) body.classList.toggle("expanded", estadoPC.desempenhoExpanded);
    if (chevron) chevron.classList.toggle("expanded", estadoPC.desempenhoExpanded);
};

function renderizarCardDesempenho() {
    const cardEl = document.getElementById("pc-card-desempenho");
    if (!cardEl) return;

    const { dados, timeId, ligaEncerrou } = estadoPC;

    // Posição atual na liga
    let posicaoAtual = "-";
    let totalParticipantes = 0;
    const ultimaRodadaComDados = [...dados]
        .reverse()
        .find((r) => r.classificacao?.length > 0);

    if (ultimaRodadaComDados?.classificacao?.length > 0) {
        const classificacaoAtivos = ultimaRodadaComDados.classificacao.filter(
            (t) => t.ativo !== false,
        );
        totalParticipantes = classificacaoAtivos.length;
        const meuTime = classificacaoAtivos.find(
            (t) => String(t.timeId || t.time_id || t.id) === String(timeId),
        );
        if (meuTime) posicaoAtual = classificacaoAtivos.indexOf(meuTime) + 1;
    }

    // Estatísticas acumuladas
    let vitorias = 0, empates = 0, derrotas = 0, goleadasDadas = 0, goleadasSofridas = 0;
    let totalConfrontos = 0;
    let saldoFinanceiro = 0;

    dados.forEach((rodadaData) => {
        if (!rodadaData.confrontos?.length) return;
        const confrontos = processarConfrontos(rodadaData);
        confrontos.forEach((confronto) => {
            const { time1, time2 } = confronto;
            const t1Id = time1.id || time1.timeId || time1.time_id;
            const t2Id = time2.id || time2.timeId || time2.time_id;
            const isMeu1 = String(t1Id) === String(timeId);
            const isMeu2 = String(t2Id) === String(timeId);
            if (!isMeu1 && !isMeu2) return;

            const p1 = time1.pontos ?? null;
            const p2 = time2.pontos ?? null;
            if (p1 === null || p2 === null) return;

            totalConfrontos++;
            const diff = Math.abs(p1 - p2);
            const isGoleada = diff >= 50;
            const isEmpate = diff <= 0.3;
            const meusPontos = isMeu1 ? p1 : p2;
            const pontosAdv = isMeu1 ? p2 : p1;

            if (isEmpate) {
                empates++;
                saldoFinanceiro += 3;
            } else if (meusPontos > pontosAdv) {
                vitorias++;
                if (isGoleada) { goleadasDadas++; saldoFinanceiro += 7; }
                else { saldoFinanceiro += 5; }
            } else {
                derrotas++;
                if (isGoleada) { goleadasSofridas++; saldoFinanceiro -= 7; }
                else { saldoFinanceiro -= 5; }
            }
        });
    });

    if (totalConfrontos === 0) {
        cardEl.innerHTML = "";
        return;
    }

    const aproveitamento = Math.round((vitorias / totalConfrontos) * 100);

    // Saldo formatado
    const saldoAbs = Math.abs(saldoFinanceiro);
    const saldoTexto = saldoFinanceiro >= 0
        ? `+R$ ${saldoAbs.toFixed(2)}`
        : `-R$ ${saldoAbs.toFixed(2)}`;
    const saldoClass = saldoFinanceiro >= 0 ? "positivo" : "negativo";

    // Badge de posição
    const isCampeao = ligaEncerrou && posicaoAtual === 1;
    let posBadgeClass = "pos-low";
    if (posicaoAtual === 1) posBadgeClass = "pos-1";
    else if (posicaoAtual !== "-" && posicaoAtual <= 3) posBadgeClass = "pos-top3";
    else if (posicaoAtual !== "-" && posicaoAtual <= 10) posBadgeClass = "pos-mid";

    const posTexto = isCampeao
        ? '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">emoji_events</span> Campeão'
        : posicaoAtual + "º de " + totalParticipantes;

    const bodyExpandedClass = estadoPC.desempenhoExpanded ? " expanded" : "";
    const chevronExpandedClass = estadoPC.desempenhoExpanded ? " expanded" : "";

    // Monta HTML do card compacto e colapsável
    const partsHeader = [
        '<div class="pc-card-desempenho-wrap">',
        '<div class="pc-desempenho-header" onclick="window.toggleDesempenhoPC()">',
        '<div class="pc-desempenho-header-left">',
        '<span class="material-symbols-outlined pc-desempenho-header-icon">analytics</span>',
        '<span class="pc-desempenho-header-title">Seu Desempenho</span>',
        '</div>',
        '<div class="pc-desempenho-header-right">',
        '<span class="pc-desempenho-pos-badge ' + posBadgeClass + '">' + posTexto + '</span>',
        '<span class="pc-desempenho-ved-summary">',
        '<span class="v">' + vitorias + 'V</span> &middot; ',
        '<span class="e">' + empates + 'E</span> &middot; ',
        '<span class="d">' + derrotas + 'D</span>',
        '</span>',
        '<span class="material-symbols-outlined pc-desempenho-chevron' + chevronExpandedClass + '" id="pc-desempenho-chevron">expand_more</span>',
        '</div>',
        '</div>',
    ];

    const partsBody = [
        '<div class="pc-desempenho-body' + bodyExpandedClass + '" id="pc-desempenho-body">',
        '<div class="pc-desempenho-stats-grid">',
        '<div class="pc-desempenho-stat-cell">',
        '<span class="material-symbols-outlined pc-desempenho-stat-icon" style="color:var(--app-success)">check_circle</span>',
        '<span class="pc-desempenho-stat-value">' + vitorias + '</span>',
        '<span class="pc-desempenho-stat-label">Vit\u00f3rias</span>',
        '</div>',
        '<div class="pc-desempenho-stat-cell">',
        '<span class="material-symbols-outlined pc-desempenho-stat-icon" style="color:var(--app-warning)">drag_handle</span>',
        '<span class="pc-desempenho-stat-value">' + empates + '</span>',
        '<span class="pc-desempenho-stat-label">Empates</span>',
        '</div>',
        '<div class="pc-desempenho-stat-cell">',
        '<span class="material-symbols-outlined pc-desempenho-stat-icon" style="color:var(--app-danger)">cancel</span>',
        '<span class="pc-desempenho-stat-value">' + derrotas + '</span>',
        '<span class="pc-desempenho-stat-label">Derrotas</span>',
        '</div>',
        '<div class="pc-desempenho-stat-cell">',
        '<span class="material-symbols-outlined pc-desempenho-stat-icon" style="color:var(--app-primary)">local_fire_department</span>',
        '<span class="pc-desempenho-stat-value">' + goleadasDadas + '</span>',
        '<span class="pc-desempenho-stat-label">Goleadas</span>',
        '</div>',
        '</div>',
        '<div class="pc-desempenho-progress-area">',
        '<div class="pc-desempenho-progress-row">',
        '<span class="pc-desempenho-progress-label">',
        '<span class="material-symbols-outlined mat-icon" style="color:var(--app-success)">trending_up</span>',
        'Aproveit.',
        '</span>',
        '<div class="pc-desempenho-bar-track">',
        '<div class="pc-desempenho-bar-fill" style="width:' + aproveitamento + '%"></div>',
        '</div>',
        '<span class="pc-desempenho-progress-pct">' + aproveitamento + '%</span>',
        '</div>',
        '</div>',
        '<div class="pc-desempenho-footer">',
        '<span class="pc-desempenho-footer-label">',
        '<span class="material-symbols-outlined mat-icon">account_balance_wallet</span>',
        'Saldo confrontos',
        '</span>',
        '<span class="pc-desempenho-saldo ' + saldoClass + '">' + saldoTexto + '</span>',
        '</div>',
        '</div>',
        '</div>',
    ];

    // eslint-disable-next-line no-unsanitized/property -- dados numéricos + strings controladas, sem input do usuário
    cardEl.innerHTML = partsHeader.concat(partsBody).join("");

    if (window.Log) Log.info(
        "[PONTOS-CORRIDOS] Desempenho: " + vitorias + "V " + empates + "E " + derrotas + "D em " + totalConfrontos + " confrontos | Posição: " + posicaoAtual + "º",
    );
}

// ============================================
// BANNER CAMPEÃO
// ============================================

function renderizarBannerCampeao() {
    const bannerEl = document.getElementById("pc-banner-campeao");

    if (!estadoPC.ligaEncerrou) {
        if (bannerEl) bannerEl.innerHTML = "";
        return;
    }

    const ultimaRodada = estadoPC.dados.find(
        (r) => r.rodada === estadoPC.totalRodadas,
    );
    if (!ultimaRodada?.classificacao?.length) {
        if (bannerEl) bannerEl.innerHTML = "";
        return;
    }

    // Filtrar apenas ativos para o campeão
    const classificacaoAtivos = ultimaRodada.classificacao.filter(
        (t) => t.ativo !== false,
    );
    if (classificacaoAtivos.length === 0) {
        if (bannerEl) bannerEl.innerHTML = "";
        return;
    }

    const campeao = classificacaoAtivos[0];
    const nomeCampeao = campeao.nome || campeao.nome_time || "Campeão";
    const nomeCartoleiro = campeao.nome_cartola || campeao.cartoleiro || "";
    const escudoCampeao =
        campeao.escudo ||
        campeao.url_escudo_png ||
        "/escudos/default.png";
    const pontosCampeao = campeao.pontos || 0;
    const vitoriasCampeao = campeao.vitorias || 0;
    const empatesCampeao = campeao.empates || 0;
    const derrotasCampeao = campeao.derrotas || 0;
    const pontosGoleadaCampeao = campeao.pontosGoleada || 0;
    const campeaoId = campeao.timeId || campeao.time_id || campeao.id;
    const souCampeao = String(campeaoId) === String(estadoPC.timeId);

    bannerEl.innerHTML = `
        <div class="campeao-banner mx-4 mb-4 rounded-2xl overflow-hidden relative">
            <div class="absolute inset-0 bg-gradient-to-r from-yellow-600/20 via-yellow-500/30 to-yellow-600/20"></div>
            <div class="confetti-bg absolute inset-0 opacity-30"></div>
            <div class="relative z-10 p-4">
                <div class="text-center mb-3">
                    <span class="material-symbols-outlined text-yellow-400 animate-bounce-slow" style="font-size: 32px;">emoji_events</span>
                    <h3 class="text-yellow-400 font-bold text-sm tracking-wider">CAMPEÃO DA LIGA!</h3>
                    <p class="text-white/50 text-[10px]">Pontos Corridos ${estadoPC.temporada || new Date().getFullYear()}</p>
                </div>
                <div class="flex items-center justify-center gap-4 bg-black/30 rounded-xl p-3">
                    <div class="relative">
                        <img src="${escudoCampeao}" class="w-16 h-16 rounded-full border-2 border-yellow-500 shadow-lg shadow-yellow-500/30" onerror="this.onerror=null;this.src='/escudos/default.png'">
                        <span class="material-symbols-outlined absolute -bottom-1 -right-1 text-yellow-400" style="font-size: 20px;">military_tech</span>
                    </div>
                    <div class="text-left">
                        <p class="font-bold text-white text-base ${souCampeao ? "text-yellow-400" : ""}">${escapeHtml(nomeCampeao)}</p>
                        ${nomeCartoleiro ? `<p class="text-white/60 text-xs">${escapeHtml(nomeCartoleiro)}</p>` : ""}
                        ${souCampeao ? '<p class="text-yellow-400 text-xs font-semibold mt-1"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">celebration</span> Você é o campeão!</p>' : ""}
                        <div class="flex gap-3 mt-1">
                            <div class="text-center"><span class="text-yellow-400 font-bold text-lg">${pontosCampeao}</span><span class="text-white/50 text-[9px] block">PTS</span></div>
                            <div class="text-center"><span class="text-green-400 font-bold text-lg">${vitoriasCampeao}</span><span class="text-white/50 text-[9px] block">V</span></div>
                            <div class="text-center"><span class="text-blue-400 font-bold text-lg">${empatesCampeao}</span><span class="text-white/50 text-[9px] block">E</span></div>
                            <div class="text-center"><span class="text-red-400 font-bold text-lg">${derrotasCampeao}</span><span class="text-white/50 text-[9px] block">D</span></div>
                            <div class="text-center"><span class="text-orange-400 font-bold text-lg">${pontosGoleadaCampeao}</span><span class="text-white/50 text-[9px] block">PG</span></div>
                        </div>
                    </div>
                </div>
                ${souCampeao ? '<div class="text-center mt-3"><p class="text-white/80 text-xs"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">celebration</span> Parabéns pela conquista! <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">celebration</span></p></div>' : ""}
            </div>
        </div>
        <style>
            .campeao-banner { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border: 1px solid rgba(255, 215, 0, 0.3); box-shadow: 0 0 20px rgba(255, 215, 0, 0.15); }
            .confetti-bg { background-image: radial-gradient(circle at 10% 20%, var(--app-gold) 1px, transparent 1px), radial-gradient(circle at 90% 30%, #ff6b6b 1px, transparent 1px), radial-gradient(circle at 30% 80%, #4ecdc4 1px, transparent 1px); background-size: 80px 80px; animation: confettiMove 4s ease-in-out infinite; }
            @keyframes confettiMove { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
            .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
            @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        </style>
    `;
}

function atualizarHeader() {
    const { dados, timeId, ligaEncerrou } = estadoPC;
    let posicao = "-";

    const ultimaRodada = dados.filter((r) => r.classificacao?.length > 0).pop();
    if (ultimaRodada?.classificacao) {
        const ativos = ultimaRodada.classificacao.filter(
            (t) => t.ativo !== false,
        );
        const meuTime = ativos.find(
            (t) => (t.timeId || t.time_id || t.id) == timeId,
        );
        if (meuTime) posicao = ativos.indexOf(meuTime) + 1;
    }

    // Badge removido do header - posição agora está no card Seu Desempenho
}

function atualizarSeletorRodadas() {
    const {
        dados,
        rodadaSelecionada,
        rodadaAtual,
        totalRodadas,
        ligaEncerrou,
    } = estadoPC;
    const container = document.getElementById("pc-seletor-rodadas");
    if (!container) return;

    const rodadasDisputadas = dados.filter(
        (r) => r.confrontos?.length > 0,
    ).length;

    const infoEl = document.getElementById("pc-rodadas-info");
    if (infoEl) {
        infoEl.innerHTML = ligaEncerrou
            ? `<span class="text-yellow-400"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">emoji_events</span> Liga Encerrada!</span> ${rodadasDisputadas} rodadas`
            : `${rodadasDisputadas} de ${totalRodadas} rodadas disputadas`;
    }

    container.innerHTML = "";

    for (let i = 1; i <= totalRodadas; i++) {
        const rodadaData = dados.find((r) => r.rodada === i);
        const temDados = rodadaData?.confrontos?.length > 0;
        const isPendente = rodadaData?.pendente === true; // ✅ v5.6: rodada futura com bracket
        const isAtual = i === rodadaAtual;
        const isSelecionada = i === rodadaSelecionada;
        const isUltima = i === totalRodadas && ligaEncerrou;

        const btn = document.createElement("button");
        btn.className = buildClassesBotaoRodada(
            isSelecionada,
            isAtual,
            temDados,
            isUltima,
            isPendente,
        );
        btn.disabled = !temDados; // temDados=true para todas (inclusive futuras com bracket)
        btn.onclick = () => selecionarRodada(i);

        btn.innerHTML = `
            <span class="font-bold text-sm ${isSelecionada ? "text-white" : isAtual ? "text-green-400" : isUltima ? "text-yellow-400" : "text-white"}">${i}</span>
            <span class="${isSelecionada ? "text-white/80" : isAtual ? "text-green-400/80" : isUltima ? "text-yellow-400/80" : "text-white/50"}">${isUltima ? "FINAL" : "RODADA"}</span>
            ${isAtual && !isSelecionada && !ligaEncerrou ? '<span class="w-1.5 h-1.5 bg-green-500 rounded-full mt-1 animate-pulse"></span>' : ""}
            ${isUltima ? '<span class="material-symbols-outlined text-yellow-400 mt-0.5" style="font-size: 12px;">emoji_events</span>' : ""}
        `;
        container.appendChild(btn);
    }
}

function buildClassesBotaoRodada(
    selecionada,
    atual,
    temDados,
    isUltima = false,
    isPendente = false,
) {
    let classes =
        "flex flex-col items-center justify-center rounded-lg px-4 py-2 text-[10px] flex-shrink-0 cursor-pointer transition-all ";
    if (selecionada) classes += "bg-primary border border-primary/70 scale-105";
    else if (isUltima && temDados)
        classes += "bg-yellow-500/20 border border-yellow-500";
    else if (atual) classes += "bg-green-500/20 border border-green-500";
    else if (isPendente)
        // ✅ v5.6: rodada futura com bracket — clicável mas visual distinto
        classes += "bg-surface-dark/40 border border-zinc-700/60 opacity-60 hover:opacity-80 hover:border-zinc-500";
    else if (temDados)
        classes +=
            "bg-surface-dark border border-zinc-700 hover:border-zinc-500";
    else
        classes +=
            "bg-surface-dark/50 border border-zinc-800 opacity-50 cursor-not-allowed";
    return classes;
}

function atualizarProgresso() {
    const { dados, totalRodadas, ligaEncerrou } = estadoPC;
    const disputadas = dados.filter((r) => r.confrontos?.length > 0).length;
    const progresso = totalRodadas > 0 ? (disputadas / totalRodadas) * 100 : 0;

    const bar = document.getElementById("pc-progress-bar");
    if (bar) {
        bar.style.width = `${progresso.toFixed(1)}%`;
        if (ligaEncerrou) {
            bar.classList.add(
                "bg-gradient-to-r",
                "from-yellow-500",
                "to-yellow-400",
            );
            bar.classList.remove("bg-primary");
        }
    }
}

function atualizarToggle() {
    const { viewMode } = estadoPC;
    const btnConfrontos = document.getElementById("pc-btn-confrontos");
    const btnClassificacao = document.getElementById("pc-btn-classificacao");

    if (btnConfrontos)
        btnConfrontos.className = `flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${viewMode === "confrontos" ? "bg-primary text-white" : "text-white/70 hover:bg-zinc-800"}`;
    if (btnClassificacao)
        btnClassificacao.className = `flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${viewMode === "classificacao" ? "bg-primary text-white" : "text-white/70 hover:bg-zinc-800"}`;
}

function renderizarView() {
    toggleElemento("pc-view-confrontos", estadoPC.viewMode === "confrontos");
    toggleElemento(
        "pc-view-classificacao",
        estadoPC.viewMode === "classificacao",
    );
    toggleElemento("pc-sem-dados", false);

    if (estadoPC.viewMode === "confrontos") renderizarConfrontos();
    else renderizarClassificacao();
}

// ============================================
// CONFRONTOS
// ============================================

function renderizarConfrontos() {
    const {
        dados,
        rodadaSelecionada,
        timeId,
        mercadoRodada,
        mercadoAberto,
        ligaEncerrou,
        totalRodadas,
    } = estadoPC;
    const container = document.getElementById("pc-lista-confrontos");
    if (!container) return;

    const rodadaData = dados.find((r) => r.rodada === rodadaSelecionada);
    if (!rodadaData) {
        mostrarSemDados("Rodada não encontrada");
        return;
    }

    const confrontos = processarConfrontos(rodadaData);
    if (confrontos.length === 0) {
        mostrarSemDados("Nenhum confronto disponível");
        return;
    }

    // ✅ v5.3: Cálculo dinâmico da rodada do Brasileirão (era hardcoded +6)
    const rodadaBrasileirao = rodadaSelecionada + (estadoPC.rodadaInicial - 1);
    const isPendente = rodadaData?.pendente === true; // ✅ v5.6: rodada futura
    let isEmAndamento = !ligaEncerrou && !isPendente && rodadaBrasileirao >= mercadoRodada;
    const isRodadaFinal = rodadaSelecionada === totalRodadas && ligaEncerrou;

    setTexto(
        "pc-rodada-titulo",
        isRodadaFinal
            ? `Rodada Final da Liga`
            : `${rodadaSelecionada}ª Rodada da Liga`,
    );
    setTexto(
        "pc-rodada-subtitulo",
        `${rodadaBrasileirao}ª Rodada do Brasileirão`,
    );

    // ✅ Material Icon no título da rodada final
    const tituloEl = document.getElementById("pc-rodada-titulo");
    if (tituloEl && isRodadaFinal) {
        tituloEl.innerHTML = `<span class="material-symbols-outlined text-yellow-400 mr-1" style="font-size: 18px; vertical-align: middle;">emoji_events</span> Rodada Final da Liga`;
    }

    const statusEl = document.getElementById("pc-rodada-status");
    if (statusEl) {
        if (isPendente) {
            // ✅ v5.6: Rodada futura — mostra quem vai enfrentar quem
            statusEl.className = "flex items-center space-x-1.5 bg-blue-500/10 text-blue-400 px-2.5 py-1.5 rounded-full text-[10px] font-semibold";
            statusEl.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">schedule</span><span>A REALIZAR</span>`;
        } else if (isRodadaFinal) {
            statusEl.className =
                "flex items-center space-x-1.5 bg-yellow-500/20 text-yellow-400 px-2.5 py-1.5 rounded-full text-[10px] font-semibold";
            statusEl.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">emoji_events</span><span>ENCERRADA</span>`;
        } else {
            statusEl.className = `flex items-center space-x-1.5 ${isEmAndamento ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"} px-2.5 py-1.5 rounded-full text-[10px] font-semibold`;
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 ${isEmAndamento ? "bg-yellow-500 animate-pulse" : "bg-green-500"} rounded-full"></span><span>${isEmAndamento ? "EM ANDAMENTO" : "FINALIZADA"}</span>`;
        }
    }

    // ✅ v5.8: BYE notice — banner âmbar quando o participante está de folga
    let byeNoticeHTML = '';
    if (timeId) {
        const teamsInRound = new Set();
        confrontos.forEach(c => {
            if (c.time1?.id) teamsInRound.add(String(c.time1.id));
            if (c.time2?.id) teamsInRound.add(String(c.time2.id));
        });
        const totalTimes = rodadaData.classificacao?.length || 0;
        const isOddLeague = totalTimes > 0 && totalTimes % 2 !== 0;
        const isUserBye = isOddLeague && !teamsInRound.has(String(timeId));
        if (isUserBye) {
            byeNoticeHTML = [
                '<div class="pc-bye-banner">',
                '<span class="material-symbols-outlined pc-bye-banner-icon">self_improvement</span>',
                '<div class="pc-bye-banner-content">',
                '<p class="pc-bye-banner-title">Voc\u00ea descansa nessa rodada</p>',
                '<p class="pc-bye-banner-desc">Sua liga tem n\u00famero \u00edmpar de times \u2014 um time folga por rodada, em rota\u00e7\u00e3o autom\u00e1tica. Os outros confrontos seguem normalmente.</p>',
                '<span class="pc-bye-pill">',
                '<span class="material-symbols-outlined mat-icon">schedule</span>',
                'Rodada sem jogo para voc\u00ea',
                '</span>',
                '</div>',
                '</div>',
            ].join("");
        }
    }

    container.innerHTML = byeNoticeHTML + confrontos
        .map((c) => buildLinhaConfronto(c, timeId))
        .join("");
}

function processarConfrontos(rodadaData) {
    let confrontos = [];
    if (
        Array.isArray(rodadaData.confrontos) &&
        rodadaData.confrontos.length > 0
    ) {
        const primeiro = rodadaData.confrontos[0];
        if (primeiro?.jogos)
            confrontos = rodadaData.confrontos.flatMap((r) => r.jogos || []);
        else if (primeiro?.time1 || primeiro?.timeA) {
            confrontos = rodadaData.confrontos.map((c) => ({
                time1: c.time1 || c.timeA,
                time2: c.time2 || c.timeB,
                diferenca:
                    c.diferenca ??
                    (c.pontos1 != null && c.pontos2 != null
                        ? Math.abs(c.pontos1 - c.pontos2)
                        : null),
                valor: c.valor || 0,
            }));
        }
    }
    return confrontos.filter((c) => c?.time1 && c?.time2);
}

function buildLinhaConfronto(confronto, meuTimeId) {
    const { time1, time2, diferenca } = confronto;
    const t1Id = time1.id || time1.timeId || time1.time_id;
    const t2Id = time2.id || time2.timeId || time2.time_id;
    const isMeu1 = t1Id == meuTimeId;
    const isMeu2 = t2Id == meuTimeId;
    const p1 = time1.pontos ?? null;
    const p2 = time2.pontos ?? null;

    let vencedor = 0,
        tipoResultado = "empate";
    if (p1 !== null && p2 !== null) {
        const diff = Math.abs(p1 - p2);
        if (diff <= 0.3) {
            vencedor = 0;
            tipoResultado = "empate";
        } else if (diff >= 50) {
            vencedor = p1 > p2 ? 1 : 2;
            tipoResultado = "goleada";
        } else {
            vencedor = p1 > p2 ? 1 : 2;
            tipoResultado = "vitoria";
        }
    }

    const valorFinanceiro =
        tipoResultado === "goleada" ? 7 : tipoResultado === "vitoria" ? 5 : 3;
    const nome1 = time1.nome || time1.nome_time || "Time 1";
    const cartoleiro1 = time1.nome_cartola || "";
    const nome2 = time2.nome || time2.nome_time || "Time 2";
    const cartoleiro2 = time2.nome_cartola || "";
    const esc1 =
        time1.escudo ||
        time1.url_escudo_png ||
        "/escudos/default.png";
    const esc2 =
        time2.escudo ||
        time2.url_escudo_png ||
        "/escudos/default.png";
    const cor1 =
        vencedor === 1
            ? "text-green-500"
            : vencedor === 2
              ? "text-red-500"
              : "text-yellow-500";
    const cor2 =
        vencedor === 2
            ? "text-green-500"
            : vencedor === 1
              ? "text-red-500"
              : "text-yellow-500";
    // Cor do nome: só aplica cor quando há scores reais (não 0 vs 0 = confronto pendente)
    const temScoresReais = (p1 !== null && p2 !== null) && !(p1 === 0 && p2 === 0);
    const corNome1 = temScoresReais ? cor1 : (isMeu1 ? "text-primary" : "text-white");
    const corNome2 = temScoresReais ? cor2 : (isMeu2 ? "text-primary" : "text-white");
    const isMeuJogo = isMeu1 || isMeu2;

    const label1 =
        vencedor === 1 ? "Crédito" : vencedor === 2 ? "Débito" : "Empate";
    const label2 =
        vencedor === 2 ? "Crédito" : vencedor === 1 ? "Débito" : "Empate";
    const sinal1 = vencedor === 1 ? "+" : vencedor === 2 ? "-" : "";
    const sinal2 = vencedor === 2 ? "+" : vencedor === 1 ? "-" : "";

    const modal1 =
        p1 !== null
            ? `<div class="group relative inline-flex"><button class="material-symbols-outlined text-base ${cor1}/80" style="font-size:16px">monetization_on</button><div class="modal hidden opacity-0 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-primary text-white text-xs font-bold px-2.5 py-1.5 rounded-md shadow-lg z-20"><span class="font-normal">${label1}:</span> ${sinal1}R$ ${valorFinanceiro.toFixed(2)}<div class="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-primary"></div></div></div>`
            : "";
    const modal2 =
        p2 !== null
            ? `<div class="group relative inline-flex"><button class="material-symbols-outlined text-base ${cor2}/80" style="font-size:16px">monetization_on</button><div class="modal hidden opacity-0 transition-opacity absolute bottom-full right-1/2 translate-x-1/2 mb-2 w-max bg-primary text-white text-xs font-bold px-2.5 py-1.5 rounded-md shadow-lg z-20"><span class="font-normal">${label2}:</span> ${sinal2}R$ ${valorFinanceiro.toFixed(2)}<div class="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-primary"></div></div></div>`
            : "";

    const outerClass = "py-2.5 px-3 flex items-center justify-between relative" + (isMeuJogo ? " pc-meu-jogo" : "");
    const meuJogoBadge = isMeuJogo
        ? '<span class="pc-meu-jogo-badge">Seu jogo</span>'
        : "";

    const p1Str = p1 !== null ? p1.toFixed(1) : "-";
    const p2Str = p2 !== null ? p2.toFixed(1) : "-";
    const difStr = diferenca != null ? diferenca.toFixed(1) : "-";

    const partsA = [
        '<div class="' + outerClass + '">',
        meuJogoBadge,
        '<div class="flex items-center min-w-0 flex-1' + (vencedor === 2 ? " opacity-60" : "") + '">',
        '<img src="' + esc1 + '" class="w-9 h-9 rounded-full mr-2.5 shrink-0 bg-zinc-700 object-cover" onerror="this.onerror=null;this.src=\'/escudos/default.png\'">',
        '<div class="min-w-0 flex-1">',
        '<p class="font-semibold text-[13px] truncate leading-tight ' + corNome1 + '">' + escapeHtml(nome1) + '</p>',
        '<p class="text-[10px] text-gray-500 truncate leading-none mt-0.5">' + escapeHtml(cartoleiro1) + '</p>',
        '<div class="flex items-center space-x-1.5 mt-1">',
        '<p class="text-[13px] font-bold font-mono ' + cor1 + '">' + p1Str + '</p>',
        modal1,
        '</div>',
        '</div>',
        '</div>',
        '<span class="text-xs text-white/20 mx-1.5 shrink-0">×</span>',
        '<div class="flex items-center min-w-0 flex-1 justify-end' + (vencedor === 1 ? " opacity-60" : "") + '">',
        '<div class="min-w-0 flex-1 text-right">',
        '<p class="font-semibold text-[13px] truncate leading-tight ' + corNome2 + '">' + escapeHtml(nome2) + '</p>',
        '<p class="text-[10px] text-gray-500 truncate leading-none mt-0.5">' + escapeHtml(cartoleiro2) + '</p>',
        '<div class="flex items-center justify-end space-x-1.5 mt-1">',
        '<p class="text-[13px] font-bold font-mono ' + cor2 + '">' + p2Str + '</p>',
        modal2,
        '</div>',
        '</div>',
        '<img src="' + esc2 + '" class="w-9 h-9 rounded-full ml-2.5 shrink-0 bg-zinc-700 object-cover" onerror="this.onerror=null;this.src=\'/escudos/default.png\'">',
        '</div>',
        '<div class="w-14 text-right ml-1.5 shrink-0">',
        '<p class="font-bold text-[13px] font-mono text-white">' + difStr + '</p>',
        '</div>',
        '</div>',
    ];

    return partsA.join("");
}

// ============================================
// CLASSIFICAÇÃO
// ============================================

function renderizarClassificacao() {
    const { dados, timeId, ligaEncerrou } = estadoPC;
    const container = document.getElementById("pc-lista-classificacao");
    if (!container) return;

    const ultimaRodada = dados.filter((r) => r.classificacao?.length > 0).pop();
    if (!ultimaRodada?.classificacao?.length) {
        mostrarSemDados("Classificação não disponível");
        return;
    }

    const infoEl = document.getElementById("pc-classificacao-info");
    if (infoEl)
        infoEl.innerHTML = ligaEncerrou
            ? `<span class="text-yellow-400"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">emoji_events</span> Classificação Final</span>`
            : `Atualizada até a ${ultimaRodada.rodada}ª rodada`;

    // Separar ativos de inativos
    const classificacao = ultimaRodada.classificacao;
    const ativos = classificacao.filter((t) => t.ativo !== false);
    const inativos = classificacao.filter((t) => t.ativo === false);
    const totalAtivos = ativos.length;

    let html = ativos
        .map((t, i) =>
            buildLinhaClassificacao(
                t,
                i + 1,
                totalAtivos,
                timeId,
                ligaEncerrou,
                false,
            ),
        )
        .join("");

    // Divisória de inativos
    if (inativos.length > 0) {
        html += `<div class="flex items-center px-3 py-2 bg-zinc-800/50 border-t border-b border-zinc-700"><span class="material-symbols-outlined text-gray-500 mr-1.5" style="font-size: 14px;">person_off</span><span class="text-[10px] text-gray-500 font-medium">Participantes Inativos (${inativos.length})</span></div>`;
        html += inativos
            .map((t) =>
                buildLinhaClassificacao(
                    t,
                    null,
                    totalAtivos,
                    timeId,
                    ligaEncerrou,
                    true,
                ),
            )
            .join("");
    }

    container.innerHTML = html;
}

function buildLinhaClassificacao(
    time,
    pos,
    total,
    meuTimeId,
    ligaEncerrou = false,
    isInativo = false,
) {
    const tId = time.timeId || time.time_id || time.id;
    const isMeu = tId == meuTimeId;
    const zona = pos ? getZona(pos, total) : { badge: false };
    const isCampeao = pos === 1 && ligaEncerrou;

    const nome = time.nome || time.nome_time || "Time";
    const cartoleiro = time.nome_cartola || "";
    const esc =
        time.escudo || time.url_escudo_png || "/escudos/default.png";
    const inativoStyle = isInativo ? "opacity-50 grayscale-[60%]" : "";
    const bgClass = isCampeao
        ? "bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 border-l-2 border-yellow-500"
        : isMeu && !isInativo
          ? "bg-primary/10"
          : isInativo
            ? "bg-zinc-900/30"
            : "";

    let posicaoBadge = "";
    if (isInativo)
        posicaoBadge = `<span class="text-xs text-gray-600">—</span>`;
    else if (isCampeao)
        posicaoBadge = `<span class="material-symbols-outlined text-yellow-400" style="font-size: 20px;">emoji_events</span>`;
    else if (zona.badge)
        posicaoBadge = `<div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${zona.bg}">${pos}</div>`;
    else
        posicaoBadge = `<span class="text-xs font-bold text-white/70">${pos}</span>`;

    // ✅ Material Icon no nome do campeão
    const nomeSufixo = isCampeao
        ? ` <span class="material-symbols-outlined text-yellow-400" style="font-size: 14px; vertical-align: middle;">celebration</span>`
        : "";

    return `
        <div class="flex items-center px-3 py-2.5 ${bgClass} ${inativoStyle}">
            <div class="w-8 flex items-center justify-center shrink-0">${posicaoBadge}</div>
            <div class="flex items-center gap-2.5 pl-2 min-w-0 flex-1">
                <img src="${esc}" class="w-8 h-8 rounded-full bg-zinc-700 object-cover shrink-0 ${isCampeao ? "ring-2 ring-yellow-500" : ""}" onerror="this.onerror=null;this.src='/escudos/default.png'">
                <div class="min-w-0 flex-1">
                    <span class="text-xs font-medium truncate block ${isCampeao ? "text-yellow-400 font-bold" : isMeu && !isInativo ? "text-primary font-bold" : isInativo ? "text-gray-500" : "text-white"}">${escapeHtml(nome)}${nomeSufixo}</span>
                    <span class="text-[10px] ${isInativo ? "text-gray-600" : "text-gray-500"} truncate block">${escapeHtml(cartoleiro)}</span>
                </div>
            </div>
            <div class="w-6 text-center ${isInativo ? "text-gray-600" : "text-white/60"} text-[10px]">${time.jogos || 0}</div>
            <div class="w-6 text-center ${isInativo ? "text-gray-600" : "text-green-400"} text-[10px]">${time.vitorias || 0}</div>
            <div class="w-6 text-center ${isInativo ? "text-gray-600" : "text-yellow-400"} text-[10px]">${time.empates || 0}</div>
            <div class="w-6 text-center ${isInativo ? "text-gray-600" : "text-red-400"} text-[10px]">${time.derrotas || 0}</div>
            <div class="w-6 text-center ${isInativo ? "text-gray-600" : "text-orange-400"} text-[10px]">${time.pontosGoleada || 0}</div>
            <div class="w-8 text-center ${isInativo ? "text-gray-500" : "text-white"} font-bold text-xs ${isCampeao ? "text-yellow-400" : ""}">${time.pontos || 0}</div>
        </div>
    `;
}

function getZona(pos, total) {
    if (pos === 1) return { badge: true, bg: "bg-yellow-500" };
    if (pos === 2) return { badge: true, bg: "bg-gray-400" };
    if (pos === 3) return { badge: true, bg: "bg-amber-600" };
    if (pos <= Math.ceil(total * 0.25))
        return { badge: true, bg: "bg-green-500" };
    if (pos > Math.floor(total * 0.85))
        return { badge: true, bg: "bg-red-500" };
    return { badge: false };
}

// ============================================
// UTILITÁRIOS
// ============================================

function mostrarSemDados(msg) {
    toggleElemento("pc-view-confrontos", false);
    toggleElemento("pc-view-classificacao", false);
    toggleElemento("pc-sem-dados", true);
    setTexto("pc-sem-dados-msg", msg);
}

function scrollParaRodadaSelecionada() {
    setTimeout(() => {
        const container = document.querySelector(
            "#pc-seletor-rodadas",
        )?.parentElement;
        const selecionado = document.querySelector(
            "#pc-seletor-rodadas .scale-105",
        );
        if (container && selecionado) {
            const cRect = container.getBoundingClientRect();
            const sRect = selecionado.getBoundingClientRect();
            container.scrollBy({
                left:
                    sRect.left - cRect.left - cRect.width / 2 + sRect.width / 2,
                behavior: "smooth",
            });
        }
    }, 100);
}

function selecionarRodada(rodada) {
    estadoPC.rodadaSelecionada = rodada;
    estadoPC.viewMode = "confrontos";
    renderizarInterface();
}

// ============================================
// FUNÇÕES GLOBAIS
// ============================================

window.trocarViewPontosCorridos = function (view) {
    estadoPC.viewMode = view;
    atualizarToggle();
    renderizarView();
};
window.selecionarRodadaPontosCorridos = selecionarRodada;
window.recarregarPontosCorridos = function () {
    inicializarPontosCorridosParticipante({
        ligaId: estadoPC.ligaId,
        timeId: estadoPC.timeId,
    });
};
// ✅ v5.5: Cleanup ao sair do módulo (chamado pela navegação)
window.destruirPontosCorridosParticipante = function () {
    pararAutoRefresh();
    if (window.Log) Log.info("[PONTOS-CORRIDOS] 🧹 Módulo destruído, auto-refresh limpo");
};
window.inicializarPontosCorridosParticipante =
    inicializarPontosCorridosParticipante;

if (window.Log) Log.info(
    "[PONTOS-CORRIDOS] ✅ Módulo v5.5 carregado (Auto-refresh parciais)",
);
