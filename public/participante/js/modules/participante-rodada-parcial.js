// =====================================================================
// PARTICIPANTE-RODADA-PARCIAL.JS - v4.0
// ✅ v4.0: Endpoint unificado /api/parciais/:ligaId
//          1 request por ciclo (era N+1 — 1 atletas + N escalações)
//          Cálculo de pontos movido para o backend (parciaisController.js)
//          Frozen layer: scouts definitivos persistidos no MongoDB
// ✅ v3.1: AbortController timeout (8s)
// =====================================================================

if (window.Log) Log.info("[PARCIAIS] 📊 Carregando módulo v4.0...");

const FETCH_TIMEOUT_MS = 10000; // 10s (backend pode levar mais que o antigo proxy direto)

async function fetchComTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
            if (window.Log) Log.warn(`[PARCIAIS] ⏱️ Timeout (${timeout}ms) em: ${url}`);
            throw new Error(`Timeout após ${timeout}ms: ${url}`);
        }
        throw error;
    }
}

// Estado do módulo
let estadoParciais = {
    ligaId: null,
    timeId: null,
    rodadaAtual: null,
    mercadoDisponivel: false, // true = backend confirmou rodada em andamento
    dadosParciais: [],
    dadosInativos: [],
    isCarregando: false,
    ultimaAtualizacao: null,
    autoRefresh: {
        ativo: false,
        timer: null,
        intervalMs: 30000,
        minMs: 30000,
        maxMs: 120000,
        step: 1.6,
        slowStep: 1.3,
        failures: 0,
        cycles: 0,
        nextAt: null,
        onUpdate: null,
        onStatus: null,
    },
};

const AUTO_REFRESH_DEFAULTS = {
    minMs: 30000,
    maxMs: 120000,
    baseMs: 30000,
};

aplicarConfigAutoRefresh();

function obterConfigAutoRefresh() {
    const cfg = (typeof window !== "undefined" && window) || {};
    let min = Number(cfg.PARCIAIS_REFRESH_MIN_MS);
    let max = Number(cfg.PARCIAIS_REFRESH_MAX_MS);
    let base = Number(cfg.PARCIAIS_REFRESH_BASE_MS);
    if (!Number.isFinite(min) || min <= 0) min = AUTO_REFRESH_DEFAULTS.minMs;
    if (!Number.isFinite(max) || max <= 0) max = AUTO_REFRESH_DEFAULTS.maxMs;
    if (!Number.isFinite(base) || base <= 0) base = AUTO_REFRESH_DEFAULTS.baseMs;
    if (max < min) max = min;
    base = Math.min(Math.max(base, min), max);
    return { min, max, base };
}

function aplicarConfigAutoRefresh() {
    const cfg = obterConfigAutoRefresh();
    estadoParciais.autoRefresh.minMs = cfg.min;
    estadoParciais.autoRefresh.maxMs = cfg.max;
    estadoParciais.autoRefresh.intervalMs = cfg.base;
}

// =====================================================================
// INICIALIZAÇÃO
// =====================================================================
export async function inicializarParciais(ligaId, timeId) {
    if (window.Log) Log.info("[PARCIAIS] 🚀 Inicializando v4.0...", { ligaId, timeId });

    estadoParciais.ligaId = ligaId;
    estadoParciais.timeId = timeId;

    try {
        // Primeira carga: chama o endpoint unificado para saber se há rodada em andamento
        const dados = await _buscarParciais(ligaId);

        if (!dados) {
            return { disponivel: false, motivo: "erro" };
        }

        if (!dados.disponivel) {
            return {
                disponivel: false,
                motivo: dados.motivo || "mercado_aberto",
                rodada: dados.rodada,
            };
        }

        estadoParciais.rodadaAtual = dados.rodada;
        estadoParciais.mercadoDisponivel = true;
        estadoParciais.dadosParciais = dados.participantes || [];
        estadoParciais.dadosInativos = dados.inativos || [];
        estadoParciais.ultimaAtualizacao = new Date();

        if (window.Log) Log.info(
            `[PARCIAIS] ✅ Pronto: Rodada ${dados.rodada}, ${dados.totalTimes} ativos, ${dados.totalInativos} inativos`,
        );

        return {
            disponivel: true,
            rodada: dados.rodada,
            totalTimes: dados.totalTimes,
            totalInativos: dados.totalInativos,
            bolaRolando: true, // status_mercado===2 implica bola rolando
        };
    } catch (error) {
        if (window.Log) Log.error("[PARCIAIS] ❌ Erro na inicialização:", error);
        return { disponivel: false, motivo: "erro", erro: error.message };
    }
}

// =====================================================================
// BUSCAR PARCIAIS — 1 request ao endpoint unificado do backend
// =====================================================================
async function _buscarParciais(ligaId) {
    try {
        const response = await fetchComTimeout(`/api/parciais/${ligaId}`);
        if (!response.ok) {
            if (response.status === 401) {
                // ✅ v5.8: Sessão expirada — retornar motivo para que caller possa agir
                if (window.Log) Log.warn("[PARCIAIS] 🔒 Sessão expirada (401) — parciais indisponíveis");
                return { disponivel: false, motivo: "sessao_expirada" };
            }
            if (window.Log) Log.warn(`[PARCIAIS] HTTP ${response.status} ao buscar parciais`);
            return null;
        }
        return await response.json();
    } catch (error) {
        if (window.Log) Log.error("[PARCIAIS] Erro ao buscar parciais:", error);
        return null;
    }
}

// =====================================================================
// CARREGAR PARCIAIS (chamado pelo auto-refresh e pela inicialização)
// =====================================================================
export async function carregarParciais() {
    if (estadoParciais.isCarregando) {
        if (window.Log) Log.info("[PARCIAIS] ⏳ Já está carregando...");
        return null;
    }

    if (!estadoParciais.ligaId) {
        if (window.Log) Log.warn("[PARCIAIS] ⚠️ ligaId não definido");
        return null;
    }

    estadoParciais.isCarregando = true;

    try {
        const dados = await _buscarParciais(estadoParciais.ligaId);

        if (!dados || !dados.disponivel) {
            estadoParciais.mercadoDisponivel = false;
            estadoParciais.isCarregando = false;
            return dados || null;
        }

        estadoParciais.rodadaAtual = dados.rodada;
        estadoParciais.mercadoDisponivel = true;
        estadoParciais.dadosParciais = dados.participantes || [];
        estadoParciais.dadosInativos = dados.inativos || [];
        estadoParciais.ultimaAtualizacao = new Date();

        if (window.Log) Log.info(
            `[PARCIAIS] ✅ ${dados.totalTimes} ativos${dados._cache ? " (cache)" : ""}`,
        );

        return {
            rodada: dados.rodada,
            participantes: dados.participantes,
            inativos: dados.inativos,
            totalTimes: dados.totalTimes,
            totalInativos: dados.totalInativos,
            atualizadoEm: estadoParciais.ultimaAtualizacao,
        };
    } catch (error) {
        if (window.Log) Log.error("[PARCIAIS] ❌ Erro ao carregar parciais:", error);
        return null;
    } finally {
        estadoParciais.isCarregando = false;
    }
}

// =====================================================================
// AUTO-REFRESH COM BACKOFF
// =====================================================================
function programarAutoRefresh() {
    if (!estadoParciais.autoRefresh.ativo) return;
    clearTimeout(estadoParciais.autoRefresh.timer);
    estadoParciais.autoRefresh.nextAt = Date.now() + estadoParciais.autoRefresh.intervalMs;
    estadoParciais.autoRefresh.timer = setTimeout(
        executarAutoRefresh,
        estadoParciais.autoRefresh.intervalMs,
    );
    emitirStatusAutoRefresh("schedule");
}

function emitirStatusAutoRefresh(motivo) {
    if (typeof estadoParciais.autoRefresh.onStatus !== "function") return;
    estadoParciais.autoRefresh.onStatus({
        ativo: estadoParciais.autoRefresh.ativo,
        intervalMs: estadoParciais.autoRefresh.intervalMs,
        nextAt: estadoParciais.autoRefresh.nextAt,
        failures: estadoParciais.autoRefresh.failures,
        cycles: estadoParciais.autoRefresh.cycles,
        motivo,
    });
}

async function executarAutoRefresh() {
    if (!estadoParciais.autoRefresh.ativo) return;

    try {
        estadoParciais.autoRefresh.cycles += 1;

        if (!parciaisDisponiveis()) {
            pararAutoRefresh();
            return;
        }

        const dados = await carregarParciais();

        if (dados && Array.isArray(dados.participantes)) {
            if (dados.participantes.length > 0) {
                estadoParciais.autoRefresh.intervalMs = estadoParciais.autoRefresh.minMs;
                estadoParciais.autoRefresh.failures = 0;
            } else {
                estadoParciais.autoRefresh.intervalMs = Math.min(
                    estadoParciais.autoRefresh.maxMs,
                    Math.round(estadoParciais.autoRefresh.intervalMs * estadoParciais.autoRefresh.slowStep),
                );
            }
        } else {
            estadoParciais.autoRefresh.failures += 1;
            estadoParciais.autoRefresh.intervalMs = Math.min(
                estadoParciais.autoRefresh.maxMs,
                Math.round(estadoParciais.autoRefresh.intervalMs * estadoParciais.autoRefresh.step),
            );
        }

        // Só atualiza o display se os dados são válidos — evita sobrescrever
        // a pontuação correta com "Aguardando pontuações" quando o backend
        // retorna disponivel:false (ex: status_mercado=3 transitório).
        if (typeof estadoParciais.autoRefresh.onUpdate === "function" && dados && dados.disponivel !== false) {
            estadoParciais.autoRefresh.onUpdate(dados);
        }
    } catch (error) {
        estadoParciais.autoRefresh.failures += 1;
        estadoParciais.autoRefresh.intervalMs = Math.min(
            estadoParciais.autoRefresh.maxMs,
            Math.round(estadoParciais.autoRefresh.intervalMs * estadoParciais.autoRefresh.step),
        );
        if (window.Log) Log.warn("[PARCIAIS] Auto-refresh falhou:", error?.message || error);
    } finally {
        programarAutoRefresh();
    }
}

export function iniciarAutoRefresh(onUpdate = null, onStatus = null) {
    if (estadoParciais.autoRefresh.ativo) return;
    aplicarConfigAutoRefresh();
    estadoParciais.autoRefresh.ativo = true;
    estadoParciais.autoRefresh.onUpdate = onUpdate;
    estadoParciais.autoRefresh.onStatus = onStatus;
    estadoParciais.autoRefresh.failures = 0;
    estadoParciais.autoRefresh.cycles = 0;
    programarAutoRefresh();
    emitirStatusAutoRefresh("start");
}

export function pararAutoRefresh() {
    estadoParciais.autoRefresh.ativo = false;
    emitirStatusAutoRefresh("stop");
    estadoParciais.autoRefresh.onUpdate = null;
    estadoParciais.autoRefresh.onStatus = null;
    estadoParciais.autoRefresh.nextAt = null;
    if (estadoParciais.autoRefresh.timer) {
        clearTimeout(estadoParciais.autoRefresh.timer);
        estadoParciais.autoRefresh.timer = null;
    }
}

// =====================================================================
// GETTERS DE ESTADO (interface pública mantida para compatibilidade)
// =====================================================================
export function obterDadosParciais() {
    return {
        rodada: estadoParciais.rodadaAtual,
        participantes: estadoParciais.dadosParciais,
        inativos: estadoParciais.dadosInativos,
        totalTimes: estadoParciais.dadosParciais.length,
        totalInativos: estadoParciais.dadosInativos.length,
        atualizadoEm: estadoParciais.ultimaAtualizacao,
        meuTimeId: estadoParciais.timeId,
    };
}

export function obterTimesInativos() {
    return estadoParciais.dadosInativos || [];
}

export function obterAtletasPontuados() {
    // v4.0: scouts agora vêm no payload de cada atleta dentro de participantes
    // Mantido por compatibilidade — retorna mapa derivado dos dados atuais
    const mapa = {};
    for (const p of estadoParciais.dadosParciais) {
        for (const a of p.atletas || []) {
            if (a.atleta_id) {
                mapa[a.atleta_id] = {
                    pontuacao: a.pontos,
                    entrou_em_campo: a.entrou_em_campo_real,
                    apelido: a.apelido,
                    clube_id: a.clube_id,
                    scout: a.scout || {},
                };
            }
        }
    }
    return mapa;
}

export function obterMinhaPosicaoParcial() {
    const meuTimeId = estadoParciais.timeId;
    const dados = estadoParciais.dadosParciais;
    if (!meuTimeId || !dados.length) return null;
    const meuDado = dados.find((d) => String(d.timeId) === String(meuTimeId));
    if (!meuDado) return null;
    return {
        posicao: meuDado.posicao,
        pontos: meuDado.pontos,
        totalTimes: dados.length,
        isMito: meuDado.posicao === 1,
        isMico: meuDado.posicao === dados.length,
    };
}

export function parciaisDisponiveis() {
    return estadoParciais.mercadoDisponivel === true;
}

export function obterRodadaAtual() {
    return estadoParciais.rodadaAtual;
}

// v4.0: escalações não ficam mais em cache local (estão no backend)
export function limparCacheEscalacoes() {
    if (window.Log) Log.info("[PARCIAIS] ℹ️ v4.0: escalações cacheadas no backend");
}

export function obterEscalacaoCacheada(timeId) {
    // v4.0: não disponível localmente — dados de atletas estão dentro de cada participante
    const rodada = estadoParciais.rodadaAtual;
    const participante = estadoParciais.dadosParciais.find(
        (p) => String(p.timeId) === String(timeId),
    );
    if (!participante) return null;
    // Recompõe estrutura esperada pelo código legado (modal "Curiosar")
    return {
        atletas: (participante.atletas || []).filter((a) => !a.is_reserva),
        reservas: (participante.atletas || []).filter((a) => a.is_reserva),
        capitao_id: participante.capitao_id,
        reserva_luxo_id: participante.reserva_luxo_id,
        time: {
            nome: participante.nome_time,
            nome_cartola: participante.nome_cartola,
            url_escudo_png: participante.escudo,
            patrimonio: participante.patrimonio,
        },
        rodada,
    };
}

// Expor no window para debug e compatibilidade
window.ParciaisModule = {
    inicializar: inicializarParciais,
    carregar: carregarParciais,
    obterDados: obterDadosParciais,
    obterInativos: obterTimesInativos,
    obterMinhaPosicao: obterMinhaPosicaoParcial,
    disponivel: parciaisDisponiveis,
    rodadaAtual: obterRodadaAtual,
    iniciarAutoRefresh,
    pararAutoRefresh,
    limparCache: limparCacheEscalacoes,
    obterEscalacaoCacheada,
    obterAtletasPontuados,
};

if (window.Log) Log.info(
    "[PARCIAIS] ✅ Módulo v4.0 carregado (endpoint unificado + frozen layer backend)",
);
