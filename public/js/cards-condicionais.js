// === CARDS-CONDICIONAIS.JS v2.8 ===
// v2.8: Troca /configuracoes por /modulos-ativos (com defaults) — remove workaround MODULOS_OPT_IN
// v2.6: FIX - Invalida cache ao mudar de liga (navegação entre ligas)
// v2.5: FIX BUG-002 - Módulos históricos só ocultados se EXPLICITAMENTE desabilitados
// v2.5: Temporada 2026+ sem restrições automáticas - cards sempre visíveis
// v2.3: FIX - Mapeamento correto de modulos_ativos para data-module dos cards
// v2.2: FIX - Não desabilitar módulos em temporadas históricas
// v2.1: FIX - Remove clonagem que destruia event listeners de navegacao
// v2.0: Refatorado para SaaS - busca config do servidor via API
// Sistema de desativação condicional de cards por liga

console.log("[CARDS-CONDICIONAIS] v2.8 - Carregando sistema...");

// === CACHE DE CONFIG DA LIGA ===
let ligaConfigCache = null;
let cacheTimestamp = 0;
let cachedLigaId = null; // v2.6: Rastrear qual liga está cacheada
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obter ID da liga atual da URL
 */
function getLigaIdAtual() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("id");
}

/**
 * Invalidar cache (útil quando navega entre ligas)
 */
function invalidarCache() {
    ligaConfigCache = null;
    cacheTimestamp = 0;
    cachedLigaId = null;
    console.log('[CARDS-CONDICIONAIS] Cache invalidado');
}

/**
 * Buscar configuração da liga do servidor (v2.8)
 * v2.8: Usa /modulos-ativos (com defaults aplicados) em vez de /configuracoes (sem defaults)
 * v2.6 FIX: Invalida cache se liga mudou
 */
async function fetchLigaConfig(ligaId) {
    // v2.6: Verificar se liga mudou - invalidar cache se sim
    if (cachedLigaId && cachedLigaId !== ligaId) {
        console.log(`[CARDS-CONDICIONAIS] Liga mudou (${cachedLigaId} -> ${ligaId}), invalidando cache...`);
        invalidarCache();
    }

    // Verificar cache
    if (ligaConfigCache && Date.now() - cacheTimestamp < CACHE_TTL) {
        return ligaConfigCache;
    }

    try {
        // v2.8: /modulos-ativos já aplica defaults para todas as keys conhecidas,
        // eliminando a necessidade de listas de módulos opt-in hardcoded
        const response = await fetch(`/api/ligas/${ligaId}/modulos-ativos`);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.modulos) {
            // Normalizar para o shape interno esperado pelo resto do módulo
            ligaConfigCache = {
                modulos_ativos: data.modulos,
                cards_desabilitados: []
            };
            cacheTimestamp = Date.now();
            cachedLigaId = ligaId;
            console.log(`[CARDS-CONDICIONAIS] Config carregada (${Object.keys(data.modulos).length} módulos)`);
            return ligaConfigCache;
        }
    } catch (error) {
        console.warn("[CARDS-CONDICIONAIS] Erro ao buscar config:", error.message);
    }

    return null;
}

/**
 * Verificar se um módulo está desabilitado para a liga atual (async)
 */
async function isModuleDisabledAsync(moduleId) {
    const ligaId = getLigaIdAtual();
    if (!ligaId) return false;

    const config = await fetchLigaConfig(ligaId);
    if (!config) return false;

    // Verificar em cards_desabilitados (array de IDs de cards)
    const cardsDesabilitados = config.cards_desabilitados || [];
    if (cardsDesabilitados.includes(moduleId)) {
        return true;
    }

    // Verificar em modulos_ativos (se habilitado = false)
    const moduloKey = moduleId.replace(/-/g, '_').replace(/([A-Z])/g, '_$1').toLowerCase();
    const moduloCamel = moduleId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    const modulos = config.modulos_ativos || {};
    if (modulos[moduloCamel] === false || modulos[moduloKey] === false) {
        return true;
    }

    return false;
}

/**
 * Verificar se um módulo está desabilitado (sync - usa cache)
 */
function isModuleDisabled(moduleId) {
    if (!ligaConfigCache) return false;

    const cardsDesabilitados = ligaConfigCache.cards_desabilitados || [];
    return cardsDesabilitados.includes(moduleId);
}

/**
 * Aplicar estado desabilitado visual nos cards
 * v2.1 FIX: NAO clonar cards - apenas desabilitar visualmente
 * A clonagem removia os event listeners de navegacao do orquestrador
 */
function aplicarEstadoDesabilitado(card, moduleId) {
    // Adicionar classe CSS para estilo visual
    card.classList.add("disabled");

    // Adicionar atributo data para identificacao
    card.dataset.disabledBy = 'cards-condicionais';

    // Bloquear pointer events via CSS (mais seguro que clonar)
    card.style.pointerEvents = "none";
    card.style.opacity = "0.5";

    console.log(`[CARDS-CONDICIONAIS] Card "${moduleId}" desabilitado (v2.5)`);
    return card; // Retorna o mesmo card, nao um clone
}

/**
 * Verificar se estamos em temporada histórica
 * Temporada histórica = parâmetro ?temporada= menor que a temporada atual da liga
 */
function isTemporadaHistorica() {
    const urlParams = new URLSearchParams(window.location.search);
    const temporadaParam = urlParams.get("temporada");
    if (!temporadaParam) return false;

    const temporadaSelecionada = parseInt(temporadaParam, 10);
    const anoAtual = new Date().getFullYear();

    // Se temporada selecionada é menor que ano atual, é histórica
    return temporadaSelecionada < anoAtual;
}

/**
 * Módulos que NUNCA existiram em 2025 (em nenhuma liga)
 * Estes são sempre ocultados em temporadas históricas
 */
const MODULOS_2026_ONLY = ['tiro-certo', 'bolao-copa'];

/**
 * Mapeamento de chave de modulos_ativos -> data-module do card HTML
 * IMPORTANTE: Os nomes em Liga.modulos_ativos NÃO correspondem diretamente aos data-module
 */
const MODULO_TO_CARD_MAP = {
    // Nomes em modulos_ativos -> data-module no HTML
    'artilheiro': 'artilheiro-campeao',
    'artilheiroCampeao': 'artilheiro-campeao',
    'luvaOuro': 'luva-de-ouro',
    'luva_ouro': 'luva-de-ouro',
    'capitaoLuxo': 'capitao-luxo',
    'capitao_luxo': 'capitao-luxo',
    'top10': 'top10',
    'melhorMes': 'melhor-mes',
    'melhor_mes': 'melhor-mes',
    'pontosCorridos': 'pontos-corridos',
    'pontos_corridos': 'pontos-corridos',
    'mataMata': 'mata-mata',
    'mata_mata': 'mata-mata',
    'fluxoFinanceiro': 'fluxo-financeiro',
    'fluxo_financeiro': 'fluxo-financeiro',
    'restaUm': 'resta-um',
    'resta_um': 'resta-um'
};

/**
 * Mapeamento de chave de config histórica -> data-module do card
 * (Usado para temporadas anteriores)
 */
const CONFIG_TO_MODULE_MAP = {
    'artilheiro': 'artilheiro-campeao',
    'luva_ouro': 'luva-de-ouro',
    'top10': 'top10',
    'melhor_mes': 'melhor-mes',
    'pontos_corridos': 'pontos-corridos',
    'mata_mata': 'mata-mata'
};

/**
 * Obter temporada selecionada da URL
 */
function getTemporadaSelecionada() {
    const urlParams = new URLSearchParams(window.location.search);
    const temporadaParam = urlParams.get("temporada");
    return temporadaParam ? parseInt(temporadaParam, 10) : new Date().getFullYear();
}

/**
 * Ocultar módulos inexistentes em temporadas históricas
 * - Módulos 2026 são SEMPRE ocultados
 * - Outros módulos são ocultados baseado na config histórica da liga
 */
async function ocultarModulosInexistentesEmHistorico() {
    if (!isTemporadaHistorica()) return;

    // Adicionar classe ao body para ativar regra CSS
    document.body.classList.add('temporada-historica');

    const temporada = getTemporadaSelecionada();
    const ligaId = getLigaIdAtual();

    console.log(`[CARDS-CONDICIONAIS] Temporada histórica ${temporada} - Liga ${ligaId}`);

    // 1. SEMPRE ocultar módulos 2026 (não existiam em nenhuma liga em 2025)
    MODULOS_2026_ONLY.forEach(moduleId => {
        const card = document.querySelector(`[data-module="${moduleId}"]`);
        if (card) {
            card.style.display = 'none';
            console.log(`[CARDS-CONDICIONAIS] Módulo 2026 "${moduleId}" oculto`);
        }
    });

    // 2. Buscar configuração histórica da liga para saber quais módulos estavam habilitados
    if (ligaId) {
        try {
            const response = await fetch(`/api/ligas/${ligaId}`);
            if (response.ok) {
                const liga = await response.json();
                const configHistorico = liga.configuracoes_historico?.[temporada];

                if (configHistorico && Object.keys(configHistorico).length > 0) {
                    console.log(`[CARDS-CONDICIONAIS] Config histórica ${temporada} encontrada`);

                    // Verificar cada módulo configurável
                    // v2.5 FIX: Só ocultar se EXPLICITAMENTE desabilitado (habilitado === false)
                    // Módulos sem config assumem habilitado por padrão
                    Object.entries(CONFIG_TO_MODULE_MAP).forEach(([configKey, moduleId]) => {
                        const moduleConfig = configHistorico[configKey];

                        // Só ocultar se explicitamente desabilitado
                        // Se não há config ou habilitado não é false, manter visível
                        const explicitamenteDesabilitado = moduleConfig?.habilitado === false;

                        if (explicitamenteDesabilitado) {
                            const card = document.querySelector(`[data-module="${moduleId}"]`);
                            if (card) {
                                card.style.display = 'none';
                                console.log(`[CARDS-CONDICIONAIS] Módulo "${moduleId}" oculto (desabilitado em ${temporada})`);
                            }
                        }
                    });
                } else {
                    console.log(`[CARDS-CONDICIONAIS] Sem config histórica para ${temporada} - mantendo módulos visíveis`);
                }
            }
        } catch (error) {
            console.warn(`[CARDS-CONDICIONAIS] Erro ao buscar config histórica:`, error.message);
        }
    }

    console.log(`[CARDS-CONDICIONAIS] Processamento de temporada histórica ${temporada} concluído`);
}

/**
 * Aplicar configurações condicionais baseadas na liga (v2.0 - async)
 * v2.8: Simplificado — /modulos-ativos já retorna defaults, sem listas hardcoded
 * v2.2 FIX: Não desabilitar módulos em temporadas históricas
 */
async function aplicarConfiguracaoCards() {
    console.log("[CARDS-CONDICIONAIS] Aplicando configuração dinâmica...");

    try {
        // v2.2: Não aplicar restrições em temporadas históricas
        if (isTemporadaHistorica()) {
            console.log("[CARDS-CONDICIONAIS] Temporada histórica detectada - mantendo todos os módulos habilitados");
            return;
        }

        const ligaId = getLigaIdAtual();

        if (!ligaId) {
            console.warn("[CARDS-CONDICIONAIS] ID da liga não encontrado");
            return;
        }

        console.log(`[CARDS-CONDICIONAIS] Liga atual: ${ligaId}`);

        const config = await fetchLigaConfig(ligaId);

        if (!config) {
            console.log("[CARDS-CONDICIONAIS] Config não encontrada - usando padrão (sem restrições)");
            return;
        }

        // /modulos-ativos já retorna defaults para todos os módulos conhecidos.
        // Qualquer key com false = módulo desativado pelo admin.
        const modulos = config.modulos_ativos || {};
        const modulosDesabilitados = Object.entries(modulos)
            .filter(([_, enabled]) => enabled === false)
            .map(([key]) => MODULO_TO_CARD_MAP[key] || key.replace(/([A-Z])/g, '-$1').toLowerCase());

        const todosDesabilitados = [...new Set(modulosDesabilitados)];

        if (todosDesabilitados.length === 0) {
            console.log("[CARDS-CONDICIONAIS] Nenhuma restrição para esta liga");
            return;
        }

        // Aplicar desabilitações
        todosDesabilitados.forEach((moduleId) => {
            const card = document.querySelector(`[data-module="${moduleId}"]`);

            if (card) {
                aplicarEstadoDesabilitado(card, moduleId);
            } else {
                console.log(`[CARDS-CONDICIONAIS] Card "${moduleId}" não encontrado no DOM`);
            }
        });

        console.log(`[CARDS-CONDICIONAIS] ${todosDesabilitados.length} cards desabilitados`);
    } catch (error) {
        console.error("[CARDS-CONDICIONAIS] Erro ao aplicar configuração:", error);
    }
}

/**
 * Verificar se um card deve ser bloqueado na navegação
 */
function verificarCardBloqueado(card) {
    const moduleId = card?.dataset?.module;

    if (!moduleId) return false;

    if (isModuleDisabled(moduleId)) {
        console.log(
            `🚫 [CARDS-CONDICIONAIS] Clique bloqueado no card: ${moduleId}`,
        );
        return true;
    }

    return false;
}

/**
 * Override da navegação para aplicar verificações condicionais
 */
function aplicarNavegacaoCondicional() {
    console.log(
        "🧭 [CARDS-CONDICIONAIS] Configurando navegação condicional...",
    );

    // Interceptar cliques nos cards
    document.addEventListener(
        "click",
        (e) => {
            const card = e.target.closest(".module-card");

            if (card && card.classList.contains("disabled")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                console.log(
                    "🚫 [CARDS-CONDICIONAIS] Clique bloqueado em card desabilitado",
                );
                return false;
            }
        },
        true,
    ); // useCapture = true para interceptar antes de outros listeners
}

// =============================================
// ✅ FUNÇÃO VOLTAR UNIVERSAL - CORRIGIDA
// =============================================

/**
 * Função universal para voltar aos cards de módulos
 * Delega para o orquestrador se disponível (fonte única de verdade)
 */
function voltarParaCards() {
    // Delegar para orquestrador se disponível (fonte única)
    if (window.orquestrador?.voltarParaCards) {
        return window.orquestrador.voltarParaCards();
    }

    // Fallback básico (caso orquestrador não carregue)
    console.log("[CARDS-CONDICIONAIS] voltarParaCards fallback...");

    const mainScreen = document.getElementById("main-screen");
    const secondaryScreen = document.getElementById("secondary-screen");

    if (secondaryScreen) {
        secondaryScreen.classList.remove("active");
        secondaryScreen.style.display = "none";
    }

    if (mainScreen) {
        mainScreen.style.display = "block";
    }
}

// ✅ REGISTRAR GLOBALMENTE IMEDIATAMENTE
window.voltarParaCards = voltarParaCards;

/**
 * Controlar visibilidade do botão voltar
 * ✅ REFATORADO: Botão removido - usa apenas o header global de detalhe-liga.html
 * O botão "Voltar aos Módulos" no header já cumpre essa função.
 */
function controlarBotaoVoltar() {
    // Limpar qualquer botão .back-button residual que possa existir
    const existingButtons = document.querySelectorAll(".back-button");
    existingButtons.forEach(btn => btn.remove());

    console.log("✅ [CARDS-CONDICIONAIS] Navegação via header global");
}

/**
 * Interceptar navegação - OTIMIZADO
 */
function interceptarNavegacao() {
    // Usar event delegation ao invés de observers para melhor performance
    const mainScreen = document.getElementById("main-screen");
    const secondaryScreen = document.getElementById("secondary-screen");

    if (!mainScreen || !secondaryScreen) return;

    // Observer simplificado apenas para mudanças de classe
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (
                mutation.type === "attributes" &&
                mutation.attributeName === "class"
            ) {
                const target = mutation.target;

                if (
                    target.id === "secondary-screen" &&
                    target.classList.contains("active")
                ) {
                    requestAnimationFrame(() => {
                        if (!target.querySelector(".back-button")) {
                            controlarBotaoVoltar();
                        }
                    });
                }
            }
        }
    });

    // Observar apenas o necessário
    observer.observe(secondaryScreen, {
        attributes: true,
        attributeFilter: ["class"],
    });
}

/**
 * Melhorar experiência visual dos cards - OTIMIZADO
 */
function melhorarExperienciaCards() {
    const cards = document.querySelectorAll(".module-card:not(.disabled)");

    // Usar CSS classes ao invés de inline styles para melhor performance
    cards.forEach((card, index) => {
        card.classList.add("card-animated");
        card.style.setProperty("--card-delay", `${index * 50}ms`);
    });
}

/**
 * Adicionar animações CSS otimizadas
 */
function adicionarAnimacoes() {
    // Verificar se já existe para evitar duplicação
    if (document.getElementById("cards-animations")) return;

    const style = document.createElement("style");
    style.id = "cards-animations";
    style.textContent = `
        @keyframes cardEntrance {
            from {
                opacity: 0;
                transform: translateY(15px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .card-animated {
            animation: cardEntrance 0.3s ease-out forwards;
            animation-delay: var(--card-delay, 0ms);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Inicializar sistema quando DOM estiver pronto (v2.0 - async)
 */
async function inicializar() {
    console.log("[CARDS-CONDICIONAIS] Inicializando v2.5...");

    try {
        // Garantir que voltarParaCards está disponível globalmente
        window.voltarParaCards = voltarParaCards;

        // v2.2: Ocultar módulos inexistentes em temporadas históricas (antes de aplicar configs)
        await ocultarModulosInexistentesEmHistorico();

        // v2.0: Aplicar configurações visuais (agora async)
        await aplicarConfiguracaoCards();

        // Configurar navegação condicional
        aplicarNavegacaoCondicional();

        // Controlar botão voltar
        controlarBotaoVoltar();

        // Interceptar navegação para controle dinâmico
        interceptarNavegacao();

        // Melhorar experiência visual
        adicionarAnimacoes();
        setTimeout(melhorarExperienciaCards, 100);

        console.log("[CARDS-CONDICIONAIS] Sistema v2.5 inicializado");
    } catch (error) {
        console.error("[CARDS-CONDICIONAIS] Erro na inicialização:", error);
    }
}

/**
 * API pública do módulo (v2.6 SaaS)
 */
window.cardsCondicionais = {
    aplicarConfiguracao: aplicarConfiguracaoCards,
    isModuleDisabled: isModuleDisabled,
    isModuleDisabledAsync: isModuleDisabledAsync,
    verificarBloqueado: verificarCardBloqueado,
    controlarBotaoVoltar: controlarBotaoVoltar,
    voltarParaCards: voltarParaCards,
    melhorarUX: melhorarExperienciaCards,
    fetchLigaConfig: fetchLigaConfig,
    getLigaConfigCache: () => ligaConfigCache,
    invalidarCache: invalidarCache, // v2.6: Expor função de invalidação
};

// Auto-inicialização
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        // Aguardar um pouco para outros scripts carregarem
        setTimeout(inicializar, 150);
    });
} else {
    // DOM já carregado
    setTimeout(inicializar, 150);
}

console.log("[CARDS-CONDICIONAIS] Módulo v2.8 carregado");
