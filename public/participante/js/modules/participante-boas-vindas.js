import { renderizarAvisos } from './participante-avisos.js';
import { RODADA_FINAL_CAMPEONATO } from "/js/config/seasons-client.js";

// =====================================================================
// PARTICIPANTE-BOAS-VINDAS.JS - v12.1 (Correção Rodada Disputada)
// =====================================================================
// ✅ v12.1: FIX - Distinguir rodada do mercado vs última rodada disputada
//           - Quando mercado aberto, calcula última rodada disputada
//           - Usa API /mercado/status para obter status real do mercado
//           - Adiciona ultimaRodadaDisputada aos dados processados
// ✅ v12.0: TEMPORADA 2026 EM ANDAMENTO - Rodada 1+ iniciada
//           - Removida lógica de "Aguardando 1ª rodada" (temporada ativa)
//           - Simplificado código para sempre mostrar dados reais
//           - Estado participanteRenovado removido (todos são ativos)
//           - Foco em exibir dados da temporada atual
// ✅ v11.6: FIX - Double RAF para garantir container no DOM após refresh
// ✅ v11.5: totalParticipantes usa liga.participantes como fallback
// ✅ v11.4: Otimização para ligas estreantes
//           - Não busca histórico para ligas novas (evita 404 desnecessário)
//           - Não renderiza Hall da Fama para ligas estreantes
// ✅ v11.3: Logo da liga exibida ao lado do nome na saudação
// ✅ v11.2: Ícones discretos Dicas e Configurações no header
// ✅ v10.9: Jogos ao vivo com API-Football para TODOS os participantes
// ✅ v10.0: Hall da Fama discreto na tela inicial
// ✅ v8.0: Carregamento INSTANTÂNEO com cache offline (IndexedDB)

if (window.Log)
    Log.info("PARTICIPANTE-BOAS-VINDAS", "🔄 Carregando módulo v12.1 (Correção Rodada Disputada)...");

// Configuração de temporada (com fallback seguro)
const TEMPORADA_ATUAL = window.ParticipanteConfig?.CURRENT_SEASON || 2026;
const TEMPORADA_ANTERIOR = window.ParticipanteConfig?.PREVIOUS_SEASON || 2025;
// ✅ v10.1 FIX: Temporada financeira (2025 durante pré-temporada)
const TEMPORADA_FINANCEIRA = window.ParticipanteConfig?.getFinancialSeason
    ? window.ParticipanteConfig.getFinancialSeason()
    : TEMPORADA_ATUAL;

// Estado do histórico
let historicoParticipante = null;

// ✅ v12.0: Temporada 2026 em andamento - sempre mostrar dados reais
// Em pré-temporada, este valor seria alterado pela função verificarStatusRenovacao
let participanteRenovado = false;

// ✅ v12.1: Estado do mercado para cálculo correto de rodada
let mercadoStatus = null;
// Ground truth: jogos realmente ao vivo (não apenas status_mercado=2)
let _aoVivoConfirmado = false;

// =====================================================================
// FUNÇÃO PRINCIPAL
// =====================================================================
export async function inicializarBoasVindasParticipante(params) {
    let ligaId, timeId, participante;

    if (
        typeof params === "object" &&
        params !== null &&
        !Array.isArray(params)
    ) {
        ligaId = params.ligaId;
        timeId = params.timeId;
        participante = params.participante;
    } else {
        ligaId = params;
        timeId = arguments[1];
    }

    // ✅ v7.5: FALLBACK - Buscar dados do auth se não recebeu por parâmetro
    if (!ligaId || !timeId || ligaId === "[object Object]" || timeId === "undefined") {
        if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "🔄 Buscando dados do auth...");

        // Tentar obter do participanteAuth
        if (window.participanteAuth) {
            ligaId = ligaId || window.participanteAuth.ligaId;
            timeId = timeId || window.participanteAuth.timeId;
            participante = participante || window.participanteAuth.participante?.participante;
        }

        // Se ainda não tem, aguardar evento (max 3s)
        if (!ligaId || !timeId) {
            if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "⏳ Aguardando auth-ready...");

            const authData = await new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(null), 3000);

                // Verificar se já tem dados
                if (window.participanteAuth?.ligaId && window.participanteAuth?.timeId) {
                    clearTimeout(timeout);
                    resolve({
                        ligaId: window.participanteAuth.ligaId,
                        timeId: window.participanteAuth.timeId,
                        participante: window.participanteAuth.participante?.participante
                    });
                    return;
                }

                window.addEventListener('participante-auth-ready', (event) => {
                    clearTimeout(timeout);
                    resolve(event.detail);
                }, { once: true });
            });

            if (authData) {
                ligaId = authData.ligaId;
                timeId = authData.timeId;
                participante = authData.participante?.participante || authData.participante;
            }
        }
    }

    // ✅ v11.2 FIX: SEMPRE buscar dados do auth para garantir campos completos
    if (window.participanteAuth) {
        const authData = window.participanteAuth.participante?.participante;
        if (authData && typeof authData === 'object') {
            participante = { ...participante, ...authData };
        }
    }

    ligaId = typeof ligaId === "string" ? ligaId : String(ligaId || "");
    timeId = typeof timeId === "string" ? timeId : String(timeId || "");

    if (window.Log)
        Log.debug("PARTICIPANTE-BOAS-VINDAS", "🚀 Inicializando...", {
            ligaId,
            timeId,
            participante,
        });

    if (!ligaId || ligaId === "[object Object]") {
        if (window.Log)
            Log.error("PARTICIPANTE-BOAS-VINDAS", "❌ Liga ID inválido");
        return;
    }

    if (!timeId || timeId === "undefined") {
        if (window.Log)
            Log.error("PARTICIPANTE-BOAS-VINDAS", "❌ Time ID inválido");
        return;
    }

    await carregarDadosERenderizar(ligaId, timeId, participante);
}

window.inicializarBoasVindasParticipante = inicializarBoasVindasParticipante;

// =====================================================================
// CARREGAR DADOS E RENDERIZAR - v11.6 FIX REFRESH
// =====================================================================
async function carregarDadosERenderizar(ligaId, timeId, participante) {
    // ✅ v11.6: Aguardar DOM estar renderizado (double RAF)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    let container = document.getElementById("boas-vindas-container");

    // ✅ v11.6: Retry com polling se container não encontrado imediatamente
    if (!container) {
        if (window.Log) Log.warn("PARTICIPANTE-BOAS-VINDAS", "Container não encontrado - aguardando...");
        container = await new Promise((resolve) => {
            let tentativas = 0;
            const maxTentativas = 10;
            const interval = setInterval(() => {
                tentativas++;
                const el = document.getElementById("boas-vindas-container");
                if (el) {
                    clearInterval(interval);
                    resolve(el);
                } else if (tentativas >= maxTentativas) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
    }

    if (!container) {
        if (window.Log) Log.error("PARTICIPANTE-BOAS-VINDAS", "Container não encontrado após retry");
        return;
    }

    const cache = window.ParticipanteCache;
    const meuTimeIdNum = Number(timeId);

    // ✅ v12.0: Verificação de renovação removida - temporada em andamento
    // Todos os participantes ativos na liga são considerados válidos
    // await verificarStatusRenovacao(ligaId, timeId); // ARQUIVADO

    // ✅ v12.1: Buscar status do mercado para cálculo correto de rodada
    await buscarStatusMercado();

    // ✅ v11.4: Buscar histórico APENAS para ligas NÃO estreantes
    // Ligas novas não têm histórico - evita 404 desnecessário
    if (!window.isLigaEstreante) {
        buscarHistoricoParticipante(timeId);
    } else {
        if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "⏭️ Liga estreante - pulando busca de histórico");
    }

    // =========================================================================
    // FASE 1: CARREGAMENTO INSTANTÂNEO (Cache IndexedDB)
    // =========================================================================

    // Tentar carregar tudo do cache primeiro
    let liga = null, ranking = [], rodadas = [], extratoData = null;
    let usouCache = false;

    if (cache) {
        // ✅ v12.0: Temporada ativa - sempre usar cache local (dados são da temporada atual)
        const deveBuscarExtratoDoCacheLocal = true;

        // Buscar regras da liga para a temporada
        let ligaRules = null;
        try {
            const resRules = await fetch(`/api/liga-rules/${ligaId}/${TEMPORADA_ATUAL}`);
            if (resRules.ok) {
                ligaRules = await resRules.json();
            }
        } catch (e) {
            ligaRules = null;
        }
        // ✅ v9.1: Temporada para segregar cache de ranking
        const temporadaCacheBV = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();

        // Buscar do cache persistente (IndexedDB) - INSTANTÂNEO
        [liga, ranking, rodadas, extratoData] = await Promise.all([
            cache.getLigaAsync ? cache.getLigaAsync(ligaId) : cache.getLiga(ligaId),
            cache.getRankingAsync ? cache.getRankingAsync(ligaId, null, null, temporadaCacheBV) : cache.getRanking(ligaId, temporadaCacheBV),
            cache.getRodadasAsync ? cache.getRodadasAsync(ligaId, null, null, temporadaCacheBV) : cache.getRodadas(ligaId, temporadaCacheBV),
            deveBuscarExtratoDoCacheLocal
                ? (cache.getExtratoAsync ? cache.getExtratoAsync(ligaId, timeId) : cache.getExtrato(ligaId, timeId))
                : Promise.resolve(null) // ✅ Renovados: ignorar cache local de extrato
        ]);

        if (liga && ranking?.length && rodadas?.length) {
            // Inicializar dadosRenderizados antes de usar
            let dadosRenderizados = processarDadosParaRender(
                liga, ranking, rodadas, extratoData, meuTimeIdNum, participante
            );
            renderizarBoasVindas(container, dadosRenderizados, ligaRules);
            if (window.Log) Log.info("PARTICIPANTE-BOAS-VINDAS", "⚡ INSTANT LOAD - dados do cache!");
        }
    }

    // Se não tem cache, mostrar loading
    if (!usouCache) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center min-h-[300px] py-16">
                    <div class="w-10 h-10 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                    <p class="text-sm text-gray-400">Carregando...</p>
                </div>
            `;
    }

    // =========================================================================
    // FASE 2: ATUALIZAÇÃO EM BACKGROUND (Fetch API)
    // =========================================================================

    try {
        // ✅ v9.0: Passar temporada para segregar dados por ano
        const temporada = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        // Buscar dados frescos da API (mesmo se ja mostrou cache)
        const [ligaFresh, rankingFresh, rodadasFresh] = await Promise.all([
            fetch(`/api/ligas/${ligaId}`).then(r => r.ok ? r.json() : liga),
            fetch(`/api/ligas/${ligaId}/ranking?temporada=${temporada}`).then(r => r.ok ? r.json() : ranking),
            fetch(`/api/rodadas/${ligaId}/rodadas?inicio=1&fim=${RODADA_FINAL_CAMPEONATO}&temporada=${temporada}`).then(r => r.ok ? r.json() : rodadas)
        ]);

        // Atualizar cache com dados frescos
        if (cache) {
            cache.setLiga(ligaId, ligaFresh);
            cache.setRanking(ligaId, rankingFresh, temporada);
            cache.setRodadas(ligaId, rodadasFresh, temporada);
        }

        // Buscar extrato
        const minhasRodadasTemp = (rodadasFresh || []).filter(
            (r) => Number(r.timeId) === meuTimeIdNum || Number(r.time_id) === meuTimeIdNum
        );
        const ultimaRodadaNum = minhasRodadasTemp.length > 0
            ? Math.max(...minhasRodadasTemp.map(r => r.rodada))
            : 1;

        let extratoFresh = null;
        try {
            // ✅ v10.4 FIX: Verificar se participante renovou para determinar temporada correta
            // Se renovou → mostrar extrato 2026 (saldo começa com taxa de inscrição)
            // Se não renovou → mostrar extrato 2025 (saldo da temporada anterior)
            let temporadaExtrato = TEMPORADA_FINANCEIRA;

            try {
                // URL correta: /api/inscricoes/:ligaId/:temporada/:timeId
                const resRenovacao = await fetch(`/api/inscricoes/${ligaId}/${TEMPORADA_ATUAL}/${timeId}`);
                if (resRenovacao.ok) {
                    const data = await resRenovacao.json();
                    // Verificar se tem inscrição com status renovado ou novo
                    const status = data.inscricao?.status;
                    if (status === 'renovado' || status === 'novo') {
                        temporadaExtrato = TEMPORADA_ATUAL; // 2026
                        if (window.Log) Log.info("PARTICIPANTE-BOAS-VINDAS", `✅ Inscrito (${status}) - usando temporada ${temporadaExtrato}`);
                    }
                }
            } catch (e) {
                // Fallback para temporada financeira padrão
                if (window.Log) Log.warn("PARTICIPANTE-BOAS-VINDAS", "Erro ao verificar renovação", e);
            }

            const resCache = await fetch(`/api/extrato-cache/${ligaId}/times/${timeId}/cache?rodadaAtual=${ultimaRodadaNum}&temporada=${temporadaExtrato}`);
            if (resCache.ok) {
                const cacheData = await resCache.json();
                extratoFresh = {
                    saldo_atual: cacheData?.resumo?.saldo_final ?? cacheData?.resumo?.saldo ?? 0,
                    resumo: cacheData?.resumo || {}
                };
            }
        } catch (e) {
            // Fallback
            const resFallback = await fetch(`/api/fluxo-financeiro/${ligaId}/extrato/${timeId}`);
            extratoFresh = resFallback.ok ? await resFallback.json() : null;
        }

        if (cache && extratoFresh) {
            cache.setExtrato(ligaId, timeId, extratoFresh);
        }

        // Se não usou cache antes, renderizar agora
        // Se usou cache, só re-renderizar se dados mudaram significativamente
        if (!usouCache) {
            const dadosRenderizados = processarDadosParaRender(
                ligaFresh, rankingFresh, rodadasFresh, extratoFresh, meuTimeIdNum, participante
            );
            renderizarBoasVindas(container, dadosRenderizados);
        } else {
            // Verificar se precisa atualizar UI
            const dadosFresh = processarDadosParaRender(
                ligaFresh, rankingFresh, rodadasFresh, extratoFresh, meuTimeIdNum, participante
            );
            const dadosCache = processarDadosParaRender(
                liga, ranking, rodadas, extratoData, meuTimeIdNum, participante
            );

            // Só re-renderiza se algo importante mudou
            if (dadosFresh.posicao !== dadosCache.posicao ||
                dadosFresh.pontosTotal !== dadosCache.pontosTotal ||
                dadosFresh.saldoFinanceiro !== dadosCache.saldoFinanceiro) {
                if (window.Log) Log.info("PARTICIPANTE-BOAS-VINDAS", "🔄 Atualizando UI com dados frescos");
                renderizarBoasVindas(container, dadosFresh);
            }
        }

        // ✅ v12.1: Renderizar avisos in-app
        await renderizarAvisos(ligaId, timeId);

        if (window.Log) Log.info("PARTICIPANTE-BOAS-VINDAS", "✅ Dados carregados e cacheados");

    } catch (error) {
        if (window.Log) Log.error("PARTICIPANTE-BOAS-VINDAS", "❌ Erro:", error);

        // Se já mostrou cache, não mostrar erro (dados antigos são melhores que nada)
        if (!usouCache) {
            container.innerHTML = `
                <div class="text-center py-16 px-5">
                    <span class="material-icons text-5xl text-red-500">error</span>
                    <p class="text-white/70 mt-4">Erro ao carregar dados</p>
                </div>
            `;
        }
    }
}

// =====================================================================
// PROCESSAR DADOS PARA RENDERIZAÇÃO
// =====================================================================
function processarDadosParaRender(liga, ranking, rodadas, extratoData, meuTimeIdNum, participante) {
    const meuTime = ranking?.find((t) => Number(t.timeId) === meuTimeIdNum);
    const posicao = meuTime ? meuTime.posicao : null;
    // ✅ v11.5: Em pré-temporada (sem ranking), usar participantes da liga como fallback
    const totalParticipantes = ranking?.length || liga?.participantes?.filter(p => p.ativo !== false)?.length || liga?.times?.length || 0;

    const minhasRodadas = (rodadas || []).filter(
        (r) => Number(r.timeId) === meuTimeIdNum || Number(r.time_id) === meuTimeIdNum
    );

    const pontosTotal = minhasRodadas.reduce((total, rodada) => {
        return total + (parseFloat(rodada.pontos) || 0);
    }, 0);

    const rodadasOrdenadas = [...minhasRodadas].sort((a, b) => b.rodada - a.rodada);
    const ultimaRodada = rodadasOrdenadas[0];
    const rodadaAtualByRodadas = ultimaRodada ? ultimaRodada.rodada : 0;

    // ✅ v12.1: Usar rodada do mercado como fonte primária
    const rodadaMercado = Number(mercadoStatus?.rodada_atual ?? 0) || 0;
    const statusMercadoNum = Number(mercadoStatus?.status_mercado ?? 1) || 1;
    const rodadaAtual = Math.max(rodadaAtualByRodadas, rodadaMercado);

    // ✅ v12.1 FIX: Calcular última rodada DISPUTADA (com dados de escalação)
    // Quando mercado está ABERTO (status=1), a rodada_atual é a PRÓXIMA a ser disputada
    const ultimaRodadaDisputada = window.obterUltimaRodadaDisputada
        ? window.obterUltimaRodadaDisputada(rodadaMercado || rodadaAtual, statusMercadoNum)
        : (statusMercadoNum === 1 || statusMercadoNum === 3 ? Math.max(1, (rodadaMercado || rodadaAtual) - 1) : (rodadaMercado || rodadaAtual));

    // Posição anterior
    let posicaoAnterior = null;
    if (rodadaAtual > 1 && minhasRodadas.length >= 2) {
        const rodadasAteAnterior = (rodadas || []).filter((r) => r.rodada < rodadaAtual);
        const rankingAnterior = calcularRankingManual(rodadasAteAnterior);
        const meuTimeAnterior = rankingAnterior.find((t) => Number(t.timeId) === meuTimeIdNum);
        if (meuTimeAnterior) posicaoAnterior = meuTimeAnterior.posicao;
    }

    // ✅ SYNC FIX: Usar mesma lógica do Admin (saldo_final + acertos)
    const saldoFinanceiro = extratoData?.saldo_atual ?? extratoData?.resumo?.saldo_final ?? 0;
    
    // 🐛 DEBUG: Log para verificar sincronização com Admin
    if (window.Log) {
        Log.info("PARTICIPANTE-BOAS-VINDAS", "💰 Saldo calculado:", {
            saldo_atual: extratoData?.saldo_atual,
            saldo_final: extratoData?.resumo?.saldo_final,
            saldo_usado: saldoFinanceiro,
            fonte: extratoData?.saldo_atual !== undefined ? "saldo_atual (backend)" : "saldo_final (resumo)"
        });
    }
    
    // ✅ v11.2 FIX: Buscar dados do participante com fallback robusto
    // A navegação pode passar camelCase, mas também precisamos do auth
    const authParticipante = window.participanteAuth?.participante?.participante;

    const nomeTime = participante?.nome_time || participante?.nomeTime ||
                     authParticipante?.nome_time || meuTime?.nome_time || "Seu Time";
    const nomeCartola = participante?.nome_cartola || participante?.nomeCartola ||
                        authParticipante?.nome_cartola || meuTime?.nome_cartola || "Cartoleiro";
    const nomeLiga = liga?.nome || "Liga";
    // ✅ v11.3: Logo da liga para exibição nas telas
    const logoLiga = liga?.logo ? `/${liga.logo}` : null;

    return {
        posicao,
        totalParticipantes,
        pontosTotal,
        ultimaRodada,
        rodadaAtual,
        ultimaRodadaDisputada, // ✅ v12.1: Rodada com dados de escalação disponíveis
        nomeTime,
        nomeCartola,
        nomeLiga,
        logoLiga,
        saldoFinanceiro,
        posicaoAnterior,
        minhasRodadas: rodadasOrdenadas,
        timeId: meuTimeIdNum,
    };
}

// =====================================================================
// ✅ v10.5: VERIFICAR SE PARTICIPANTE RENOVOU
// =====================================================================
async function verificarStatusRenovacao(ligaId, timeId) {
    try {
        const url = `/api/inscricoes/${ligaId}/${TEMPORADA_ATUAL}/${timeId}`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.inscricao) {
                const status = data.inscricao.status;
                participanteRenovado = (status === 'renovado' || status === 'novo');
                if (window.Log) Log.info("PARTICIPANTE-BOAS-VINDAS", `✅ Status renovação: ${status} → renovado=${participanteRenovado}`);
            }
        }
    } catch (error) {
        if (window.Log) Log.warn("PARTICIPANTE-BOAS-VINDAS", "⚠️ Erro ao verificar renovação:", error);
        participanteRenovado = false;
    }
}

// =====================================================================
// ✅ v12.1: BUSCAR STATUS DO MERCADO (para cálculo correto de rodada)
// =====================================================================
async function buscarStatusMercado() {
    try {
        const response = await fetch('/api/cartola/mercado/status');
        if (response.ok) {
            mercadoStatus = await response.json();
            if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "📊 Status mercado:", {
                rodada: mercadoStatus?.rodada_atual,
                status: mercadoStatus?.status_mercado
            });
        }
    } catch (error) {
        if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "⚠️ Erro ao buscar status mercado");
        mercadoStatus = null;
    }
    // Ground truth: confirmar jogos ao vivo via calendário (não apenas status_mercado=2)
    if (mercadoStatus?.status_mercado === 2 && window.isRodadaRealmenteAoVivo) {
        _aoVivoConfirmado = await window.isRodadaRealmenteAoVivo();
    } else {
        _aoVivoConfirmado = false;
    }
}

// =====================================================================
// ✅ v9.0: BUSCAR HISTÓRICO DO PARTICIPANTE
// =====================================================================
async function buscarHistoricoParticipante(timeId) {
    try {
        const response = await fetch(`/api/participante/historico/${timeId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                historicoParticipante = data;
                if (window.Log) Log.info("PARTICIPANTE-BOAS-VINDAS", "📜 Histórico carregado:", {
                    temporadas: data.historico?.length || 0
                });
                // Re-renderizar banner se já tem container
                renderizarBannerHistorico();
            }
        }
    } catch (error) {
        if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "⚠️ Histórico não disponível");
    }
}

// =====================================================================
// ✅ v10.0: RENDERIZAR CARD DISCRETO DO HALL DA FAMA
// Pequeno, na parte superior, não chama atenção para temporada anterior
// ✅ v11.4: Não renderiza para ligas estreantes (sem histórico)
// =====================================================================
function renderizarBannerHistorico() {
    const container = document.getElementById("boas-vindas-container");
    if (!container || !historicoParticipante) return;

    // ✅ v11.4: Liga estreante não tem histórico para exibir
    if (window.isLigaEstreante) {
        if (window.Log) Log.debug("PARTICIPANTE-BOAS-VINDAS", "⏭️ Liga estreante - não renderiza Hall da Fama");
        return;
    }

    // Verificar se já existe o card
    if (document.getElementById("card-hall-fama")) return;

    // Filtrar temporadas para exibir apenas até a anterior à atual
    const temporadaAtual = window.ParticipanteConfig?.CURRENT_SEASON || 2026;
    const temporadasPassadas = (historicoParticipante.historico || []).filter(t => Number(t.temporada) < temporadaAtual);
    const totalTemporadas = temporadasPassadas.length;
    // Contar títulos só das temporadas passadas
    const totalTitulos = temporadasPassadas.reduce((acc, t) => acc + (t.titulos || 0), 0);

    if (totalTemporadas === 0) return;

    // ✅ v10.0: Card pequeno e discreto
    const cardHTML = `
        <div id="card-hall-fama" class="mx-4 mb-3">
            <button onclick="window.participanteNav?.navegarPara('historico')"
                    class="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-dark active:scale-[0.98] transition-transform">
                <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style="background: rgba(255, 193, 7, 0.15);">
                    <span class="material-icons text-xl" style="color: #ffc107;">emoji_events</span>
                </div>
                <div class="flex-1 text-left">
                    <p class="text-sm font-semibold text-white">Hall da Fama</p>
                    <p class="text-xs text-white/50">${totalTemporadas} temporada${totalTemporadas > 1 ? 's' : ''}${totalTitulos > 0 ? ` • ${totalTitulos} título${totalTitulos > 1 ? 's' : ''}` : ''}</p>
                </div>
                <span class="material-icons text-white/30 text-lg">chevron_right</span>
            </button>
        </div>
    `;

    // Inserir após a saudação
    const saudacao = container.querySelector(".px-4.py-4");
    if (saudacao) {
        saudacao.insertAdjacentHTML("afterend", cardHTML);
    }
}

// =====================================================================
// HELPERS
// =====================================================================
function calcularRankingManual(rodadas) {
    const timesAgrupados = {};
    rodadas.forEach((rodada) => {
        const timeId = Number(rodada.timeId) || Number(rodada.time_id);
        if (!timesAgrupados[timeId]) {
            timesAgrupados[timeId] = { timeId, pontos_totais: 0 };
        }
        timesAgrupados[timeId].pontos_totais += parseFloat(rodada.pontos) || 0;
    });
    return Object.values(timesAgrupados)
        .sort((a, b) => b.pontos_totais - a.pontos_totais)
        .map((time, index) => ({ ...time, posicao: index + 1 }));
}

function truncarPontos(valor) {
    // Trunca para 2 casas decimais (não arredonda) e formata em pt-BR
    const truncado = Math.floor(valor * 100) / 100;
    return truncado.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatarPontos(valor) {
    return valor.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function getZonaInfo(posicao, total) {
    if (!posicao || !total)
        return {
            texto: "N/D",
            corTexto: "text-white/50",
            corBg: "bg-white/5",
            icon: "help",
        };
    const percentual = (posicao / total) * 100;
    if (percentual <= 33)
        return {
            texto: "Zona de Premiação",
            corTexto: "text-green-400",
            corBg: "bg-green-400/10",
            icon: "emoji_events",
        };
    if (percentual <= 66)
        return {
            texto: "Zona Neutra",
            corTexto: "text-yellow-400",
            corBg: "bg-yellow-400/10",
            icon: "remove",
        };
    return {
        texto: "Zona de Risco",
        corTexto: "text-red-400",
        corBg: "bg-red-400/10",
        icon: "warning",
    };
}

// =====================================================================
// RENDERIZAÇÃO - TAILWIND CLASSES
// =====================================================================
function renderizarBoasVindas(container, data, ligaRules) {
    const {
        posicao,
        totalParticipantes,
        pontosTotal,
        ultimaRodada,
        rodadaAtual,
        ultimaRodadaDisputada, // FIX: Rodada disputada vs rodada do mercado
        nomeTime,
        nomeCartola,
        nomeLiga,
        logoLiga,
        saldoFinanceiro,
        posicaoAnterior,
        minhasRodadas,
        temporada // Adiciona temporada ao destructuring
    } = data;

    const zona = getZonaInfo(posicao, totalParticipantes);
    const primeiroNome = nomeCartola.split(" ")[0];

    // ✅ v10.11: Badge de ambiente movido para o header (próximo à versão)
    const rodadasRestantes = Math.max(0, RODADA_FINAL_CAMPEONATO - rodadaAtual);
    const pontosUltimaRodada = ultimaRodada
        ? truncarPontos(parseFloat(ultimaRodada.pontos))
        : "0,00";

    // Variação posição
    let variacaoPosHTML = "";
    if (posicao && posicaoAnterior) {
        const diff = posicaoAnterior - posicao;
        if (diff > 0)
            variacaoPosHTML = `<span class="text-green-400 text-xs ml-1">▲${diff}</span>`;
        else if (diff < 0)
            variacaoPosHTML = `<span class="text-red-400 text-xs ml-1">▼${Math.abs(diff)}</span>`;
    }

    // Variação pontos
    let variacaoInfo = {
        valor: "--",
        cor: "text-white/50",
        icon: "trending_flat",
    };
    if (minhasRodadas.length >= 2) {
        const ultima = parseFloat(minhasRodadas[0].pontos) || 0;
        const penultima = parseFloat(minhasRodadas[1].pontos) || 0;
        const diff = ultima - penultima;
        if (diff > 0)
            variacaoInfo = {
                valor: `+${diff.toFixed(1)}`,
                cor: "text-green-400",
                icon: "trending_up",
            };
        else if (diff < 0)
            variacaoInfo = {
                valor: diff.toFixed(1),
                cor: "text-red-400",
                icon: "trending_down",
            };
        else
            variacaoInfo = {
                valor: "0.0",
                cor: "text-white/50",
                icon: "trending_flat",
            };
    }

    // Saldo - v7.2: Cores dinâmicas com style inline
    const saldoAbs = Math.abs(saldoFinanceiro);
    const saldoFormatadoNumero = saldoAbs.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const saldoFormatado =
        saldoFinanceiro >= 0
            ? `R$ ${saldoFormatadoNumero}`
            : `-R$ ${saldoFormatadoNumero}`;
    const saldoCorStyle =
        saldoFinanceiro > 0
            ? "color: #4ade80;"
            : saldoFinanceiro < 0
              ? "color: var(--app-danger-light);"
              : "color: rgba(255,255,255,0.5);";

    // =========================================================================
    // ✅ v10.5: RENDERIZAÇÃO CONDICIONAL - RENOVADO vs NÃO RENOVADO
    // =========================================================================

    // ✅ v10.18: Botão Atualizar só para NÃO renovados com temporada encerrada
    // Renovados (2026): não há dados para atualizar ainda
    // Não renovados (2025): podem querer atualizar cache da temporada encerrada
    const botaoAtualizarHTML = `
                    <!-- Botão Atualizar Dados (direita - verde) -->
                    <button onclick="window.RefreshButton && window.RefreshButton.showModal()"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-medium active:scale-95 transition-all hover:bg-green-500/30">
                        <span class="material-icons text-sm">refresh</span>
                        Atualizar
                    </button>`;

    // ✅ v10.19: Ícones discretos de Dicas e Configurações no header (padrão app profissional)
    const modulosAtivos = window.participanteNav?.modulosAtivos || {};
    const dicasAtivo = modulosAtivos.dicas === true;
    const iconeDicas = dicasAtivo ? `
        <button onclick="window.participanteNav?.navegarPara('dicas')"
                class="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all"
                title="Dicas">
            <span class="material-icons text-lg text-white/60">psychology</span>
        </button>` : '';

    // ✅ v11.3: Logo da liga (se existir) ao lado do nome
    const logoLigaHTML = logoLiga ? `
        <img src="${logoLiga}"
             alt="${nomeLiga}"
             class="w-5 h-5 object-contain rounded"
             onerror="this.style.display='none'">` : '';

    if (participanteRenovado) {
        // ✅ PARTICIPANTE RENOVOU - Mostrar dados zerados com "Aguardando 1ª rodada"
        // ✅ v10.18: Sem botão Atualizar (não há dados 2026 para atualizar ainda)
        container.innerHTML = `
            <div class="pb-28">

                <!-- Header com botoes Premiacoes, Participantes e Regras -->
                <div class="px-4 pt-3 pb-2 flex items-center justify-between gap-2 refresh-button-container">
                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- Botao Premiacoes (laranja) -->
                        <button onclick="window.abrirPremiacoes2026 && window.abrirPremiacoes2026()"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium active:scale-95 transition-all hover:bg-primary/30">
                            <span class="material-icons text-sm">emoji_events</span>
                            Premiacoes
                        </button>
                        <!-- Botao Participantes (laranja) -->
                        <button onclick="window.abrirParticipantes2026 && window.abrirParticipantes2026()"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium active:scale-95 transition-all hover:bg-primary/30">
                            <span class="material-icons text-sm">groups</span>
                            Participantes
                        </button>
                        <!-- Botao Regras (azul) -->
                        <button onclick="window.participanteNav?.navegarPara('regras')"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-medium active:scale-95 transition-all hover:bg-blue-500/30">
                            <span class="material-icons text-sm">gavel</span>
                            Regras
                        </button>
                    </div>
                    <!-- Ícones discretos: Dicas e Configurações -->
                    <div class="flex items-center gap-1">
                        ${iconeDicas}
                        <button onclick="window.participanteNav?.navegarPara('configuracoes')"
                                class="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all"
                                title="Configurações">
                            <span class="material-icons text-lg text-orange-500">settings</span>
                        </button>
                    </div>
                </div>

                <!-- Saudação com indicador de temporada -->
                <div class="px-4 pb-4">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl font-bold leading-tight tracking-tight text-white">Olá, ${escapeHtml(primeiroNome)}! 👋</h1>
                        </div>
                        <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide" style="background: var(--app-gradient-primary); color: var(--app-text-white);">
                            ${TEMPORADA_ATUAL}
                        </span>
                    </div>
                    <p class="text-sm font-normal text-white/70 flex items-center gap-1.5">${logoLigaHTML}<span>${escapeHtml(nomeLiga)}</span> • Aguardando 1ª rodada</p>
                </div>

                <!-- Card Principal do Time - Aguardando -->
                <div class="mx-4 mb-4 rounded-xl bg-surface-dark p-4">
                    <h3 class="mb-4 text-center text-base font-bold leading-tight text-white">${escapeHtml(nomeTime)}</h3>
                    <div class="flex items-center justify-around">
                        <div class="text-center">
                            <p class="text-xs font-medium uppercase leading-normal text-white/70">Posição</p>
                            <p class="text-4xl font-bold leading-tight tracking-tighter text-white/30">--</p>
                            <p class="text-xs font-normal leading-normal text-white/50">aguardando</p>
                        </div>
                        <div class="text-center">
                            <p class="text-xs font-medium uppercase leading-normal text-white/70">Pontos</p>
                            <p class="text-4xl font-bold leading-tight tracking-tighter text-white/30">0</p>
                            <p class="text-xs font-normal leading-normal text-white/50">aguardando</p>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center justify-center gap-2 rounded-full bg-primary/10 py-1.5 px-4">
                        <span class="material-icons text-sm text-primary">schedule</span>
                        <p class="text-xs font-medium text-white/90">Aguardando 1ª rodada</p>
                    </div>
                </div>

                <!-- Card Saldo Financeiro -->
                <div class="mx-4 mb-4 rounded-xl bg-surface-dark p-4 cursor-pointer active:scale-[0.98] transition-transform" onclick="window.participanteNav?.navegarPara('extrato')">
                    <div class="flex w-full items-center gap-4 text-left">
                        <div class="flex-shrink-0">
                            <span class="material-icons text-3xl text-primary">paid</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-xs font-medium uppercase text-white/70">Saldo Financeiro</p>
                            <p class="text-lg font-bold" style="${saldoCorStyle}">${saldoFormatado}</p>
                        </div>
                        <div class="flex-shrink-0">
                            <span class="material-icons text-white/70">arrow_forward_ios</span>
                        </div>
                    </div>
                </div>

                <!-- Grid de Estatísticas - Zerado -->
                <div class="mx-4 mb-4 grid grid-cols-3 gap-3">
                        <div class="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-dark p-3">
                            <p class="text-xs font-medium uppercase text-white/70">Rodadas</p>
                            <p class="text-2xl font-bold text-white/30">0</p>
                        </div>
                        <div class="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-dark p-3">
                            <p class="text-xs font-medium uppercase text-white/70">Participantes</p>
                            <p class="text-2xl font-bold text-white">
                                ${typeof totalParticipantes === 'number' && totalParticipantes > 0 ? totalParticipantes : '--'}
                            </p>
                            ${(typeof totalParticipantes !== 'number' || totalParticipantes === 0) ? `<span class="flex items-center gap-1 text-xs text-yellow-400 mt-1"><span class="material-icons text-base align-middle">hourglass_empty</span> Aguardando definição</span>` : ''}
                        </div>
                            <!-- Mini-card FALTAM removido -->
                </div>

                <!-- Card de Desempenho - Aguardando -->
                <div class="mx-4 mb-4 rounded-xl bg-surface-dark p-4">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-icons text-primary">insights</span>
                        <h3 class="text-sm font-bold text-white">Seu Desempenho</h3>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div class="flex items-center gap-2">
                                <span class="material-icons text-white/30 text-xl">bolt</span>
                                <span class="text-xs text-white/50">Última rodada</span>
                            </div>
                            <span class="text-sm font-medium text-white/30">Aguardando</span>
                        </div>
                        <div class="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div class="flex items-center gap-2">
                                <span class="material-icons text-white/30 text-xl">trending_flat</span>
                                <span class="text-xs text-white/50">Variação</span>
                            </div>
                            <span class="text-sm font-medium text-white/30">Aguardando</span>
                        </div>
                        <div class="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div class="flex items-center gap-2">
                                <span class="material-icons text-white/30 text-xl">history</span>
                                <span class="text-xs text-white/50">Posição anterior</span>
                            </div>
                            <span class="text-sm font-medium text-white/30">Aguardando</span>
                        </div>
                    </div>
                </div>

            </div>
        `;
    } else {
        // ✅ PARTICIPANTE NÃO RENOVOU - Mostrar dados da temporada anterior normalmente
        // ✅ v10.18: Mostra botão Atualizar (temporada 2025 encerrada, pode querer atualizar cache)
        container.innerHTML = `
            <div class="pb-28">

                <!-- Header com botoes de acao (Premiacoes + Participantes + Regras + Atualizar) -->
                <div class="px-4 pt-3 pb-2 flex items-center justify-between gap-2 refresh-button-container">
                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- Botao Premiacoes (laranja) -->
                        <button onclick="window.abrirPremiacoes2026 && window.abrirPremiacoes2026()"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium active:scale-95 transition-all hover:bg-primary/30">
                            <span class="material-icons text-sm">emoji_events</span>
                            Premiacoes
                        </button>
                        <!-- Botao Participantes (laranja) -->
                        <button onclick="window.abrirParticipantes2026 && window.abrirParticipantes2026()"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium active:scale-95 transition-all hover:bg-primary/30">
                            <span class="material-icons text-sm">groups</span>
                            Participantes
                        </button>
                        <!-- Botao Regras (azul) -->
                        <button onclick="window.participanteNav?.navegarPara('regras')"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-medium active:scale-95 transition-all hover:bg-blue-500/30">
                            <span class="material-icons text-sm">gavel</span>
                            Regras
                        </button>
                    </div>
                    <!-- Ícones discretos: Atualizar, Dicas e Configurações -->
                    <div class="flex items-center gap-1">
                        ${botaoAtualizarHTML}
                        ${iconeDicas}
                        <button onclick="window.participanteNav?.navegarPara('configuracoes')"
                                class="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all"
                                title="Configurações">
                            <span class="material-icons text-lg text-orange-500">settings</span>
                        </button>
                    </div>
                </div>

                <!-- Saudação com indicador de temporada -->
                <div class="px-4 pb-4">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl font-bold leading-tight tracking-tight text-white">Olá, ${escapeHtml(primeiroNome)}! 👋</h1>
                        </div>
                        <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide" style="background: var(--app-gradient-primary); color: var(--app-text-white);">
                            ${TEMPORADA_ATUAL}
                        </span>
                    </div>
                    <p class="text-sm font-normal text-white/70 flex items-center gap-1.5">${logoLigaHTML}<span>${escapeHtml(nomeLiga)}</span> • Rodada ${rodadaAtual || "--"}${_aoVivoConfirmado ? ' <span class="live-badge-mini" style="font-size:9px;padding:1px 5px;">AO VIVO</span>' : ''}</p>
                </div>

                <!-- Card Principal do Time -->
                <div class="mx-4 mb-4 rounded-xl bg-surface-dark p-4">
                    <h3 class="mb-4 text-center text-base font-bold leading-tight text-white">${escapeHtml(nomeTime)}</h3>
                    <div class="flex items-center justify-around">
                        <div class="text-center">
                            <p class="text-xs font-medium uppercase leading-normal text-white/70">Posição</p>
                            <p class="text-4xl font-bold leading-tight tracking-tighter text-white">${posicao ? `${posicao}º` : "--"}</p>
                            <p class="text-xs font-normal leading-normal text-white/70">de ${totalParticipantes}${variacaoPosHTML}</p>
                        </div>
                        <div class="text-center">
                            <p class="text-xs font-medium uppercase leading-normal text-white/70">Pontos</p>
                            <p class="text-4xl font-bold leading-tight tracking-tighter text-white">${truncarPontos(pontosTotal)}</p>
                            <p class="text-xs font-normal leading-normal text-white/70">total acumulado</p>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center justify-center gap-2 rounded-full ${zona.corBg} py-1.5 px-4">
                        <span class="material-icons text-sm ${zona.corTexto}">${zona.icon}</span>
                        <p class="text-xs font-medium text-white/90">${zona.texto}</p>
                    </div>
                </div>

                <!-- Card Saldo Financeiro -->
                <div class="mx-4 mb-4 rounded-xl bg-surface-dark p-4 cursor-pointer active:scale-[0.98] transition-transform" onclick="window.participanteNav?.navegarPara('extrato')">
                    <div class="flex w-full items-center gap-4 text-left">
                        <div class="flex-shrink-0">
                            <span class="material-icons text-3xl text-primary">paid</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-xs font-medium uppercase text-white/70">Saldo Financeiro</p>
                            <p class="text-lg font-bold" style="${saldoCorStyle}">${saldoFormatado}</p>
                        </div>
                        <div class="flex-shrink-0">
                            <span class="material-icons text-white/70">arrow_forward_ios</span>
                        </div>
                    </div>
                </div>

                <!-- Grid de Estatísticas -->
                <div class="mx-4 mb-4 grid grid-cols-3 gap-3">
                    <div class="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-dark p-3">
                        <p class="text-xs font-medium uppercase text-white/70">Rodadas</p>
                        <p class="text-2xl font-bold text-white">${ultimaRodadaDisputada || rodadaAtual || 0}</p>
                    </div>
                    <div class="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-dark p-3">
                        <p class="text-xs font-medium uppercase text-white/70">Participantes</p>
                        <p class="text-2xl font-bold text-white">${totalParticipantes}</p>
                    </div>
                        <!-- Mini-card FALTAM removido -->
                </div>

                <!-- Card de Desempenho -->
                <div class="mx-4 mb-4 rounded-xl bg-surface-dark p-4">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-icons text-primary">insights</span>
                        <h3 class="text-sm font-bold text-white">Seu Desempenho</h3>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div class="flex items-center gap-2">
                                <span class="material-icons text-primary text-xl">bolt</span>
                                <span class="text-xs text-white/70">${mercadoStatus?.status_mercado === 2 ? 'Parcial R' + rodadaAtual : 'Rodada ' + (ultimaRodadaDisputada || rodadaAtual)}</span>
                            </div>
                            <span class="text-sm font-bold text-white">${mercadoStatus?.status_mercado === 2 ? '--' : pontosUltimaRodada + ' pts'}</span>
                        </div>
                        <div class="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div class="flex items-center gap-2">
                                <span class="material-icons ${variacaoInfo.cor} text-xl">${variacaoInfo.icon}</span>
                                <span class="text-xs text-white/70">Variação</span>
                            </div>
                            <span class="text-sm font-bold ${variacaoInfo.cor}">${variacaoInfo.valor}</span>
                        </div>
                        <div class="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div class="flex items-center gap-2">
                                <span class="material-icons text-primary text-xl">history</span>
                                <span class="text-xs text-white/70">Posição anterior</span>
                            </div>
                            <span class="text-sm font-bold text-white">${posicaoAnterior ? `${posicaoAnterior}º` : "--"}</span>
                        </div>
                    </div>
                </div>

                <!-- Card de Dica -->
                <div class="mx-4 mb-4 flex items-start gap-3 rounded-xl bg-primary/10 p-4">
                    <span class="material-icons mt-0.5 text-primary">lightbulb</span>
                    <div>
                        <p class="text-sm font-bold uppercase text-white/90">Dica</p>
                        <p class="text-sm font-normal text-white/70">Acompanhe seu extrato financeiro para entender sua evolução na liga!</p>
                    </div>
                </div>

            </div>
        `;
    }
}


if (window.Log)
    Log.info("PARTICIPANTE-BOAS-VINDAS", "Modulo v12.1 carregado (Correção Rodada Disputada)");
