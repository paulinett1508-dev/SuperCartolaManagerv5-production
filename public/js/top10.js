// TOP10.JS - MÓDULO DE MITOS E MICOS v3.4
// ✅ v2.0: Fix rodada 38 (CAMPEONATO_ENCERRADO)
// ✅ v3.0: SaaS Dinamico - usa configs do endpoint /api/ligas/:id/configuracoes
// ✅ v3.1: Detecção automática de temporada passada (remove hardcode 2025)
// ✅ v3.2: Propagação de temporada para cache e API (fix pré-temporada 2026)
// ✅ v3.3: UI "Aguardando Início do Campeonato" quando sem dados
// ✅ v3.4: FIX CRÍTICO - Não assume dados anteriores se API já retorna ano atual
// ✅ Usando imports dinâmicos para compatibilidade com rodadas.js

import { fetchLigaConfig } from "./rodadas/rodadas-config.js";

// ============================================================================
// CONFIGURAÇÃO DINÂMICA DO CAMPEONATO
// ============================================================================
const RODADA_FINAL_CAMPEONATO = 38; // Última rodada do Brasileirão (constante)

// ==============================
// VARIÁVEIS GLOBAIS E DE ESTADO
// ==============================
let todosOsMitos = [];
let todosOsMicos = [];
let ligaConfigCache = null; // v3.0: Cache da config da liga

// ==============================
// FUNÇÕES DE IMPORTAÇÃO DINÂMICA
// ==============================

/**
 * Obtém função getRankingRodadaEspecifica de forma segura
 * @param {string} ligaId - ID da liga
 * @param {number} rodadaNum - Número da rodada
 * @param {number} temporada - Ano da temporada (opcional, v3.2)
 */
async function getRankingRodadaEspecifica(ligaId, rodadaNum, temporada = null) {
    // Tentar via window primeiro (mais rápido)
    if (window.rodadasDebug?.getRankingRodadaEspecifica) {
        return await window.rodadasDebug.getRankingRodadaEspecifica(
            ligaId,
            rodadaNum,
            temporada,
        );
    }

    // Fallback: import dinâmico
    try {
        const rodadasModule = await import("./rodadas.js");
        if (rodadasModule.getRankingRodadaEspecifica) {
            return await rodadasModule.getRankingRodadaEspecifica(
                ligaId,
                rodadaNum,
                temporada,
            );
        }
    } catch (error) {
        console.warn("[TOP10] Erro ao importar rodadas:", error);
    }

    // Fallback final: API direta (v3.2: incluir temporada)
    try {
        const temporadaParam = temporada ? `&temporada=${temporada}` : '';
        const response = await fetch(
            `/api/rodadas/${ligaId}/rodadas?inicio=${rodadaNum}&fim=${rodadaNum}${temporadaParam}`,
        );
        if (response.ok) {
            const data = await response.json();
            return Array.isArray(data)
                ? data.filter((r) => parseInt(r.rodada) === parseInt(rodadaNum))
                : [];
        }
    } catch (error) {
        console.error("[TOP10] Erro ao buscar rodada:", error);
    }

    return [];
}

/**
 * Obtém status do mercado
 */
async function getMercadoStatus() {
    try {
        const res = await fetch("/api/cartola/mercado/status");
        if (!res.ok) throw new Error("Erro ao buscar status do mercado");
        return await res.json();
    } catch (err) {
        console.error("[TOP10] Erro ao buscar status do mercado:", err);
        return { rodada_atual: 1, status_mercado: 1, temporada: new Date().getFullYear() };
    }
}

/**
 * v3.4: Detecta se estamos visualizando temporada passada
 * Retorna { isTemporadaPassada, ultimaRodadaCompleta, temporadaParaBusca, aguardandoDados }
 *
 * FIX CRÍTICO: Não assume que há dados da temporada anterior se API já retorna ano atual
 */
function detectarTemporadaStatus(status) {
    const rodadaAtual = status.rodada_atual || 1;
    const statusMercado = status.status_mercado;
    const mercadoAberto = statusMercado === 1;
    const temporadaAPI = status.temporada || new Date().getFullYear();
    const anoAtual = new Date().getFullYear();

    // Se mercado está na rodada 1 com status "aberto"
    if (rodadaAtual === 1 && mercadoAberto) {
        // CASO 1: API retorna ano ANTERIOR ao atual (ex: Janeiro/2026, API ainda diz 2025)
        // Isso significa que o Cartola ainda não "virou" para a nova temporada
        // Podemos buscar dados completos da temporada passada
        if (temporadaAPI < anoAtual) {
            console.log(`[TOP10] Pré-temporada ${anoAtual}: buscando 38 rodadas de ${temporadaAPI}`);
            return {
                isTemporadaPassada: true,
                ultimaRodadaCompleta: RODADA_FINAL_CAMPEONATO,
                temporadaParaBusca: temporadaAPI,
                aguardandoDados: false
            };
        }

        // CASO 2: API já retorna o ANO ATUAL (ex: API diz 2026)
        // Temporada nova, mas ainda sem rodadas disputadas
        // NÃO há dados para buscar - mostrar "Aguardando Início"
        console.log(`[TOP10] Temporada ${temporadaAPI} iniciando - aguardando primeira rodada`);
        return {
            isTemporadaPassada: false,
            ultimaRodadaCompleta: 0,  // ZERO = sem dados
            temporadaParaBusca: temporadaAPI,
            aguardandoDados: true
        };
    }

    // Se estamos na rodada 38 com mercado fechado, temporada atual encerrou
    if (rodadaAtual === RODADA_FINAL_CAMPEONATO && !mercadoAberto) {
        console.log(`[TOP10] Temporada ${temporadaAPI} encerrada - usando rodada 38`);
        return {
            isTemporadaPassada: false,
            ultimaRodadaCompleta: RODADA_FINAL_CAMPEONATO,
            temporadaParaBusca: temporadaAPI,
            aguardandoDados: false
        };
    }

    // Temporada em andamento: calcular última rodada completa
    let ultimaRodadaCompleta;
    if (mercadoAberto) {
        // Mercado aberto = rodada atual ainda não começou
        ultimaRodadaCompleta = Math.max(1, rodadaAtual - 1);
    } else {
        // Mercado fechado = rodada atual em andamento ou finalizada
        ultimaRodadaCompleta = rodadaAtual;
    }

    return {
        isTemporadaPassada: false,
        ultimaRodadaCompleta,
        temporadaParaBusca: temporadaAPI,
        aguardandoDados: false
    };
}

/**
 * Obtém ID da liga
 */
function obterLigaId() {
    // Verificar modo participante primeiro
    if (window.participanteData && window.participanteData.ligaId) {
        return window.participanteData.ligaId;
    }
    // Fallback para modo admin (URL) — suporta ?id=, ?liga= e ?ligaId=
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("id") || urlParams.get("liga") || urlParams.get("ligaId") || window._fluxoLigaId || null;
}

// ==============================
// SISTEMA DE CACHE UNIFICADO
// ==============================

/**
 * Tenta buscar o snapshot pronto do servidor
 * @param {string} ligaId - ID da liga
 * @param {number} rodada - Número da rodada
 * @param {number} temporada - Ano da temporada (opcional, usa CURRENT_SEASON se não informado)
 */
async function lerCacheTop10(ligaId, rodada, temporada = null) {
    try {
        const ts = new Date().getTime();
        // v3.2: Incluir temporada na query se fornecida
        const temporadaParam = temporada ? `&temporada=${temporada}` : '';
        const response = await fetch(
            `/api/top10/cache/${ligaId}?rodada=${rodada}${temporadaParam}&_=${ts}`,
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (data.cached && data.mitos && data.micos) {
            // ✅ Validar se o cache está na rodada esperada
            if (data.rodada === rodada) {
                // ✅ CORREÇÃO: Verificar se arrays têm dados
                if (data.mitos.length === 0 || data.micos.length === 0) {
                    console.log(
                        `[TOP10] ⚠️ Cache VAZIO: arrays sem dados, recalculando...`,
                    );
                    return null;
                }

                // ✅ CORREÇÃO: Validar se os itens têm a propriedade 'rodada'
                const mitosValidos = data.mitos.every(
                    (item) =>
                        item.rodada !== undefined &&
                        item.nome_cartola !== undefined &&
                        item.pontos !== undefined,
                );
                const micosValidos = data.micos.every(
                    (item) =>
                        item.rodada !== undefined &&
                        item.nome_cartola !== undefined &&
                        item.pontos !== undefined,
                );

                if (!mitosValidos || !micosValidos) {
                    console.log(
                        `[TOP10] ⚠️ Cache CORROMPIDO: dados incompletos, recalculando...`,
                    );
                    return null;
                }

                console.log(
                    `[TOP10] 💾 Cache VÁLIDO encontrado para Rodada ${rodada} (${data.mitos.length} mitos, ${data.micos.length} micos)`,
                );
                return { mitos: data.mitos, micos: data.micos };
            } else {
                console.log(
                    `[TOP10] ⚠️ Cache DESATUALIZADO: esperava R${rodada}, tinha R${data.rodada}`,
                );
                return null;
            }
        }
        return null;
    } catch (error) {
        console.warn(
            "[TOP10] Falha ao ler cache (prosseguindo com cálculo):",
            error,
        );
        return null;
    }
}

/**
 * Salva o resultado do cálculo para o futuro
 * @param {string} ligaId - ID da liga
 * @param {number} rodada - Número da rodada
 * @param {Array} mitos - Array de mitos
 * @param {Array} micos - Array de micos
 * @param {number} temporada - Ano da temporada (opcional)
 */
async function salvarCacheTop10(ligaId, rodada, mitos, micos, temporada = null) {
    try {
        // ✅ Determinar se é cache permanente (rodada consolidada)
        const status = await getMercadoStatus();
        const campeonatoEncerrado = status && status.rodada_atual === RODADA_FINAL_CAMPEONATO && status.status_mercado !== 1;
        const isPermanent =
            campeonatoEncerrado || (status && status.rodada_atual > rodada);

        const response = await fetch(`/api/top10/cache/${ligaId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                rodada: rodada,
                mitos: mitos,
                micos: micos,
                permanent: isPermanent,
                temporada: temporada, // v3.2: Incluir temporada no body
            }),
        });

        if (response.ok) {
            const msg = isPermanent
                ? `[TOP10] 💾 Cache PERMANENTE salvo (Rodada ${rodada} consolidada)`
                : `[TOP10] 💾 Cache temporário salvo (Rodada ${rodada})`;
            console.log(msg);
        } else {
            console.warn(
                `[TOP10] ❌ Falha ao salvar cache: Servidor respondeu ${response.status}`,
            );
        }
    } catch (error) {
        console.warn("[TOP10] ❌ Erro de conexão ao salvar cache:", error);
    }
}

// ==============================
// CONFIGURAÇÕES - v3.0: Dinamicas via API
// ==============================
// Valores padrao (fallback se API falhar)
const valoresBonusOnusPadrao = {
    mitos: { 1: 30, 2: 28, 3: 26, 4: 24, 5: 22, 6: 20, 7: 18, 8: 16, 9: 14, 10: 12 },
    micos: { 1: -30, 2: -28, 3: -26, 4: -24, 5: -22, 6: -20, 7: -18, 8: -16, 9: -14, 10: -12 },
};

/**
 * v3.0: Obtem valores de Top10 da config da liga
 * @param {string} ligaId - ID da liga
 * @returns {Promise<Object>} { mitos: {...}, micos: {...} }
 */
async function getValoresBonusOnusAsync(ligaId) {
    try {
        const config = await fetchLigaConfig(ligaId);
        ligaConfigCache = config;

        if (config?.top10) {
            const mitos = config.top10.valores_mito || {};
            const micos = config.top10.valores_mico || {};

            // Verificar se tem valores
            if (Object.keys(mitos).length > 0 || Object.keys(micos).length > 0) {
                console.log(`[TOP10] ✅ Valores carregados da config: ${config.liga_nome}`);
                return { mitos, micos };
            }
        }

        console.log(`[TOP10] ℹ️ Usando valores padrao (config sem top10)`);
        return valoresBonusOnusPadrao;
    } catch (error) {
        console.warn(`[TOP10] Erro ao buscar config, usando padrao:`, error.message);
        return valoresBonusOnusPadrao;
    }
}

// ==============================
// INICIALIZAÇÃO
// ==============================
export async function inicializarTop10() {
    console.log("[TOP10] Inicializando módulo...");
    const loadingIndicator = document.getElementById("loadingTop10");
    if (loadingIndicator) loadingIndicator.style.display = "block";

    try {
        await carregarDadosTop10();
        await renderizarTabelasTop10();
    } catch (error) {
        console.error("[TOP10] Erro na inicialização:", error);
        renderizarErro("Erro ao carregar dados do Top 10");
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = "none";
    }
}

// ==============================
// CARREGAMENTO DE DADOS (OTIMIZADO)
// ==============================
async function carregarDadosTop10() {
    console.log("[TOP10] Carregando dados...");

    // 1. Obter ID da Liga
    let ligaId = null;
    if (window.orquestrador?.ligaId) ligaId = window.orquestrador.ligaId;
    if (!ligaId) ligaId = obterLigaId();
    if (!ligaId && window.participanteData?.ligaId)
        ligaId = window.participanteData.ligaId;

    if (!ligaId) throw new Error("ID da Liga não encontrado");
    console.log(`[TOP10] ✅ Liga ID obtido: ${ligaId}`);

    todosOsMitos = [];
    todosOsMicos = [];

    try {
        const status = await getMercadoStatus();
        if (!status || !status.rodada_atual)
            throw new Error("Não foi possível obter a rodada atual");

        // ✅ v3.4: Detecção dinâmica de temporada com flag aguardandoDados
        const { isTemporadaPassada, ultimaRodadaCompleta, temporadaParaBusca, aguardandoDados } = detectarTemporadaStatus(status);

        // ✅ v3.4: Se aguardandoDados=true OU ultimaRodadaCompleta=0, mostrar UI de aguardando
        if (aguardandoDados || ultimaRodadaCompleta === 0) {
            console.log("[TOP10] 🕐 Aguardando início do campeonato - nenhuma rodada completa ainda.");
            renderizarAguardandoDados();
            return;
        }

        console.log(
            `[TOP10] 📊 Calculando Top10 até rodada ${ultimaRodadaCompleta} - Temporada ${temporadaParaBusca}`,
        );

        // ============================================================
        // 🚀 OTIMIZAÇÃO: Tentar ler do Cache primeiro (com temporada correta)
        // ============================================================
        const cache = await lerCacheTop10(ligaId, ultimaRodadaCompleta, temporadaParaBusca);

        if (cache) {
            todosOsMitos = cache.mitos;
            todosOsMicos = cache.micos;
            // Ordenação de segurança
            todosOsMitos.sort((a, b) => b.pontos - a.pontos);
            todosOsMicos.sort((a, b) => a.pontos - b.pontos);
            return; // ✨ SUCESSO RÁPIDO: Sai da função sem loops!
        }

        console.log(
            `[TOP10] ⚠️ Cache Miss. Iniciando cálculo histórico (1 até ${ultimaRodadaCompleta}) - Temporada ${temporadaParaBusca}...`,
        );

        // ============================================================
        // 🐢 LENTO: Cálculo Histórico (Só roda se não tiver cache)
        // v3.2: Passar temporada para getRankingRodadaEspecifica
        // ============================================================
        const promises = [];
        for (let i = 1; i <= ultimaRodadaCompleta; i++) {
            promises.push(
                getRankingRodadaEspecifica(ligaId, i, temporadaParaBusca)
                    .then((ranking) => {
                        if (ranking && ranking.length > 0) {
                            const rankingOrdenado = ranking.sort(
                                (a, b) => b.pontos - a.pontos,
                            );

                            // Mito (Primeiro)
                            const mito = { ...rankingOrdenado[0], rodada: i };
                            todosOsMitos.push(mito);

                            // Mico (Último)
                            const mico = {
                                ...rankingOrdenado[rankingOrdenado.length - 1],
                                rodada: i,
                            };
                            todosOsMicos.push(mico);
                        }
                    })
                    .catch((error) =>
                        console.warn(`[TOP10] Erro rodada ${i}:`, error),
                    ),
            );
        }

        await Promise.all(promises);

        // Ordenar listas finais
        todosOsMitos.sort((a, b) => b.pontos - a.pontos);
        todosOsMicos.sort((a, b) => a.pontos - b.pontos);

        // ============================================================
        // 💾 OTIMIZAÇÃO: Salvar o resultado para a próxima vez (com temporada)
        // ============================================================
        if (todosOsMitos.length > 0) {
            await salvarCacheTop10(
                ligaId,
                ultimaRodadaCompleta,
                todosOsMitos,
                todosOsMicos,
                temporadaParaBusca, // v3.2: Incluir temporada
            );
        }

        console.log(
            `[TOP10] Dados calculados e salvos: ${todosOsMitos.length} mitos, ${todosOsMicos.length} micos`,
        );
    } catch (error) {
        console.error("[TOP10] Erro ao carregar dados:", error);
        throw error;
    }
}

// ==============================
// RENDERIZAÇÃO - v3.0: Usar config dinamica
// ==============================
async function renderizarTabelasTop10() {
    const containerMitos = document.getElementById("top10MitosTable");
    const containerMicos = document.getElementById("top10MicosTable");

    if (!containerMitos || !containerMicos) return;

    // Determinar valores de bônus/ônus via config dinamica
    let ligaId = null;
    if (window.orquestrador?.ligaId) ligaId = window.orquestrador.ligaId;
    if (!ligaId) ligaId = obterLigaId();

    // v3.0: Obter valores dinamicamente da config
    const valoresBonusOnus = await getValoresBonusOnusAsync(ligaId);

    // Renderizar
    containerMitos.innerHTML = gerarTabelaHTML(
        todosOsMitos.slice(0, 10),
        "mitos",
        valoresBonusOnus,
    );
    containerMicos.innerHTML = gerarTabelaHTML(
        todosOsMicos.slice(0, 10),
        "micos",
        valoresBonusOnus,
    );

    console.log("[TOP10] Tabelas renderizadas com sucesso");
}

function gerarTabelaHTML(dados, tipo, valoresBonusOnus) {
    if (!dados || dados.length === 0) {
        return `<div class="error-state"><p class="error-message">Nenhum dado disponível para ${tipo}</p></div>`;
    }

    const valoresBonus =
        tipo === "mitos" ? valoresBonusOnus.mitos : valoresBonusOnus.micos;

    return `
        <table class="tabela-top10">
            <thead class="thead-${tipo}">
                <tr>
                    <th style="width: 40px;">Pos</th>
                    <th style="min-width: 120px; text-align: left;">Cartoleiro</th>
                    <th style="min-width: 100px; text-align: left;">Time</th>
                    <th style="width: 40px;">Escudo</th>
                    <th style="width: 70px;">Pontos</th>
                    <th style="width: 60px;">Rodada</th>
                    <th style="width: 70px;">${tipo === "mitos" ? "Bônus" : "Ônus"}</th>
                </tr>
            </thead>
            <tbody>
                ${dados
                    .map((item, index) => {
                        const posicao = index + 1;
                        const valorBonus = valoresBonus[posicao] ?? 0;
                        const valorClass =
                            valorBonus >= 0
                                ? "valor-positivo"
                                : "valor-negativo";
                        const valorFormatado =
                            valorBonus >= 0
                                ? `+R$ ${valorBonus.toFixed(2)}`
                                : `-R$ ${Math.abs(valorBonus).toFixed(2)}`;
                        const rowClass =
                            posicao <= 3 ? `posicao-${posicao}` : "";

                        return `
                        <tr class="${rowClass}">
                            <td style="text-align: center; font-weight: 700;">
                                ${posicao === 1 ? (tipo === "mitos" ? '<span class="material-symbols-outlined" style="color: var(--color-mito);">crown</span>' : '<span class="material-symbols-outlined" style="color: var(--color-mico);">skull</span>') : posicao + "º"}
                            </td>
                            <td style="text-align: left;">${item.nome_cartola || item.nome_cartoleiro || "N/D"}</td>
                            <td style="text-align: left;">${item.nome_time || "N/D"}</td>
                            <td style="text-align: center;">
                                ${item.clube_id ? `<img src="/escudos/${item.clube_id}.png" alt="" class="time-escudo" onerror="this.style.display='none'"/>` : '<span class="material-symbols-outlined" style="color: var(--color-mico);">favorite</span>'}
                            </td>
                            <td style="text-align: center;" class="pontos-destaque">${(Math.trunc((item.pontos ?? 0) * 100) / 100).toFixed(2)}</td>
                            <td style="text-align: center;">R${item.rodada ?? "?"}</td>
                            <td style="text-align: center;" class="${valorClass}">${valorFormatado}</td>
                        </tr>`;
                    })
                    .join("")}
            </tbody>
        </table>
    `;
}

function renderizarErro(mensagem) {
    const containerMitos = document.getElementById("top10MitosTable");
    const containerMicos = document.getElementById("top10MicosTable");
    const erroHTML = `
        <div class="error-state">
            <p class="error-message">${mensagem}</p>
            <button onclick="window.orquestrador.executeAction('top10')" class="btn-voltar">Tentar Novamente</button>
        </div>`;
    if (containerMitos) containerMitos.innerHTML = erroHTML;
    if (containerMicos) containerMicos.innerHTML = erroHTML;
}

/**
 * v3.3: Renderiza mensagem de aguardando dados quando campeonato ainda não iniciou
 */
function renderizarAguardandoDados() {
    const containerMitos = document.getElementById("top10MitosTable");
    const containerMicos = document.getElementById("top10MicosTable");

    const aguardandoHTML = `
        <div class="aguardando-dados-container" style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
            border-radius: 12px;
            border: 1px solid rgba(255, 136, 0, 0.2);
            min-height: 200px;
        ">
            <span class="material-icons" style="
                font-size: 48px;
                color: var(--laranja, #ff8800);
                margin-bottom: 16px;
                animation: pulse 2s ease-in-out infinite;
            ">hourglass_empty</span>

            <h3 style="
                font-family: 'Russo One', sans-serif;
                font-size: 1.25rem;
                color: var(--text-primary, #ffffff);
                margin: 0 0 8px 0;
            ">Aguardando Início do Campeonato</h3>

            <p style="
                font-family: 'Inter', sans-serif;
                font-size: 0.9rem;
                color: var(--text-secondary, #94a3b8);
                margin: 0;
                max-width: 280px;
            ">Os dados de Mitos e Micos estarão disponíveis após a primeira rodada ser finalizada.</p>
        </div>

        <style>
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(1.05); }
            }
        </style>
    `;

    if (containerMitos) containerMitos.innerHTML = aguardandoHTML;
    if (containerMicos) containerMicos.innerHTML = aguardandoHTML.replace('Mitos e Micos', 'Micos');

    console.log("[TOP10] ✅ Renderizado estado de aguardando dados");
}

// ==============================
// EXPORTAÇÕES DE COMPATIBILIDADE
// ==============================

export async function garantirDadosCarregados() {
    if (todosOsMitos.length > 0 && todosOsMicos.length > 0) {
        return {
            mitos: todosOsMitos.slice(0, 10),
            micos: todosOsMicos.slice(0, 10),
        };
    }
    try {
        await carregarDadosTop10();
        return {
            mitos: todosOsMitos.slice(0, 10),
            micos: todosOsMicos.slice(0, 10),
        };
    } catch (error) {
        console.error("[TOP10] Erro ao carregar dados:", error);
        return { mitos: [], micos: [] };
    }
}

export function getMitosData() {
    return todosOsMitos.slice(0, 10);
}

export function getMicosData() {
    return todosOsMicos.slice(0, 10);
}

export function getTop10Data() {
    return {
        mitos: todosOsMitos.slice(0, 10),
        micos: todosOsMicos.slice(0, 10),
    };
}

// Expor funções globalmente para compatibilidade
if (typeof window !== "undefined") {
    window.inicializarTop10 = inicializarTop10;
    window.getMitosData = getMitosData;
    window.getMicosData = getMicosData;
    window.getTop10Data = getTop10Data;
}

console.log("[TOP10] Módulo v3.4 carregado (UI aguardando dados + temporada propagada para cache e API)");
