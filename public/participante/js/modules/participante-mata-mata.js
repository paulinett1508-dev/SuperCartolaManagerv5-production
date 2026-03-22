// =====================================================================
// PARTICIPANTE MATA-MATA v8.1 (Resultados em Tempo Real)
// ✅ v8.1: FIX - Auto-refresh inicia sempre que fase está em andamento (corrige bug de parciais não atualizando)
// ✅ v8.0: FEAT - Auto-polling 60s com parciais AO VIVO nas fases ativas
// ✅ v8.0: FEAT - Badge AO VIVO + indicador de última atualização
// ✅ v8.0: FEAT - Cleanup lifecycle (Page Visibility, AbortController)
// ✅ v7.5: FEAT - Botão "Classificados" mostra os N classificados e seus adversários
// ✅ v7.4: FIX - Mostra mensagem adequada quando não há edições na temporada
// ✅ v7.3: FIX - Fases dinâmicas baseadas no tamanho real do torneio
// ✅ v7.3: FIX - Contador de participantes usa tamanhoTorneio real
// ✅ v7.2: FEAT - Parciais ao vivo na rodada de classificação
// ✅ v7.0: FIX - Double RAF para garantir container no DOM após refresh
// ✅ v6.9: FIX Escudo placeholder não usa mais logo do sistema
// ✅ v6.8: FIX Comparação de tipos (string vs number) em timeId
// ✅ v6.7: Cache-first com IndexedDB para carregamento instantâneo
// Integrado com HTML template - Layout Cards + Correção "não está nesta fase"
// Nota: Mata-mata não requer tratamento especial de inativos pois é por eliminação
// =====================================================================

import { CURRENT_SEASON } from "/js/config/seasons-client.js";

// ✅ FIX: Edições carregadas dinamicamente da API (gerenciar-modulos)
// Antes: hardcoded com dados de 2025 para 32 times → colide com regras do admin
// Agora: populado em inicializarMataMata() via calendario_efetivo da API
let EDICOES_MATA_MATA = [];

// ✅ v7.3: Fases dinâmicas baseadas no tamanho do torneio
const TODAS_FASES = ["primeira", "oitavas", "quartas", "semis", "final"];

// ✅ v7.3: Retorna fases aplicáveis para o tamanho do torneio (espelho do admin)
function getFasesParaTamanho(tamanho) {
  if (tamanho >= 32) return ["primeira", "oitavas", "quartas", "semis", "final"];
  if (tamanho >= 16) return ["oitavas", "quartas", "semis", "final"];
  if (tamanho >= 8)  return ["quartas", "semis", "final"];
  return [];
}

// ✅ v7.3: Getter para fases atuais (usa tamanhoTorneio do estado)
function getFasesAtuais() {
  return getFasesParaTamanho(estado.tamanhoTorneio);
}

// ✅ FIX: FASES não deve mais ser usado para iterar dados — usar getFasesAtuais()
// Mantido para retrocompatibilidade de código que precisa de todas as fases
const FASES = TODAS_FASES;

// ✅ v8.2: Retorna a edição atual baseada na rodadaAtual
// Prioridade: edição em andamento > última encerrada > última disponível
function getEdicaoAtual() {
  const rodada = estado.rodadaAtual;
  const disponiveis = estado.edicoesDisponiveis;
  if (!disponiveis.length) return null;

  // Buscar edição cuja faixa cobre a rodada atual (inclui classificatória = rodadaInicial - 1)
  for (const ed of [...disponiveis].reverse()) {
    const config = EDICOES_MATA_MATA.find(e => e.id === ed.edicao);
    if (!config) continue;
    if (rodada >= config.rodadaInicial - 1 && rodada <= config.rodadaFinal) {
      return ed.edicao;
    }
  }

  // Entre edições: retornar última encerrada
  for (const ed of [...disponiveis].reverse()) {
    const config = EDICOES_MATA_MATA.find(e => e.id === ed.edicao);
    if (config && rodada > config.rodadaFinal) {
      return ed.edicao;
    }
  }

  // Fallback: última disponível
  return disponiveis[disponiveis.length - 1].edicao;
}

// ✅ v8.2: Retorna a fase mais avançada liberada para a edição
// Ex: rodadaAtual=5, edicao1 (rodadaInicial=3) → fase idx 2 (quartas)
function getFaseAtual(edicaoId) {
  const config = EDICOES_MATA_MATA.find(e => e.id === edicaoId);
  const fasesAtivas = getFasesAtuais();
  if (!config || !fasesAtivas.length) return fasesAtivas[0] || "quartas";

  let ultimaLiberada = null;
  for (let idx = 0; idx < fasesAtivas.length; idx++) {
    if (estado.rodadaAtual >= config.rodadaInicial + idx) {
      ultimaLiberada = fasesAtivas[idx];
    }
  }
  return ultimaLiberada || fasesAtivas[0];
}

// ✅ v6.8: FIX - Sempre retorna number para comparação consistente
// Banco tem timeId inconsistente: às vezes string "1323370", às vezes number 1323370
function extrairTimeId(time) {
  if (!time) return null;
  const id = time.time_id || time.timeId || time.id || null;
  return id ? parseInt(id, 10) : null;
}

// ✅ v6.9: FIX - Fallback de escudo não usa logo do sistema
// Placeholder: círculo cinza com ícone de escudo (data URI SVG)
const ESCUDO_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%232a2a2a' stroke='%233a3a3a' stroke-width='2'/%3E%3Cpath d='M50 20 L70 30 L70 50 C70 65 60 75 50 80 C40 75 30 65 30 50 L30 30 Z' fill='%234a4a4a' stroke='%235a5a5a' stroke-width='1'/%3E%3C/svg%3E";

function getEscudoUrl(time) {
  const escudo = time?.url_escudo_png || time?.escudo;
  // Se escudo existe e não é string vazia, usar
  if (escudo && escudo.trim() !== '') {
    return escudo;
  }
  // Fallback: placeholder SVG
  return ESCUDO_PLACEHOLDER;
}

// ✅ v6.8: Recalcular historico de participação a partir do cache em memória
// Isso corrige o bug onde historicoParticipacao foi salvo com comparação de tipos errada
function recalcularHistoricoEdicao(edicao) {
  const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;
  if (!meuTimeId) return;

  let ultimaFaseParticipada = null;
  let foiEliminado = false;

  // ✅ FIX: Iterar apenas fases válidas para o tamanho do torneio (ignora stale "primeira"/"oitavas")
  getFasesAtuais().forEach((f) => {
    const cacheKey = `${edicao}-${f}`;
    const confrontos = estado.cacheConfrontos[cacheKey];

    if (confrontos && Array.isArray(confrontos)) {
      const participou = confrontos.some(
        (c) =>
          extrairTimeId(c.timeA) === meuTimeId ||
          extrairTimeId(c.timeB) === meuTimeId,
      );

      if (participou) {
        ultimaFaseParticipada = f;

        const meuConfronto = confrontos.find(
          (c) =>
            extrairTimeId(c.timeA) === meuTimeId ||
            extrairTimeId(c.timeB) === meuTimeId,
        );

        if (meuConfronto) {
          const souTimeA = extrairTimeId(meuConfronto.timeA) === meuTimeId;
          const meusPts = parseFloat(
            souTimeA ? meuConfronto.timeA?.pontos : meuConfronto.timeB?.pontos,
          ) || 0;
          const advPts = parseFloat(
            souTimeA ? meuConfronto.timeB?.pontos : meuConfronto.timeA?.pontos,
          ) || 0;

          if (meusPts < advPts) foiEliminado = true;
        }
      }
    }
  });

  estado.historicoParticipacao[edicao] = {
    ultimaFase: ultimaFaseParticipada,
    eliminado: foiEliminado,
  };

  if (window.Log)
    Log.debug(`[MATA-MATA] 📊 Historico recalculado edição ${edicao}:`, estado.historicoParticipacao[edicao]);
}

let estado = {
  ligaId: null,
  timeId: null,
  rodadaAtual: 1,
  edicaoSelecionada: null,
  faseSelecionada: null, // ✅ v7.3: Será definida dinamicamente baseada no tamanhoTorneio
  edicoesDisponiveis: [],
  cacheConfrontos: {},
  historicoParticipacao: {},
  tamanhoTorneio: 8, // ✅ v7.2: Carregado da config do módulo
  // ✅ v8.0: Estado de mercado e polling
  mercadoAberto: true,
  _refreshInterval: null,
  _refreshAtivo: false,
  _abortController: null,
  _ultimaAtualizacao: null,
};

// =====================================================================
// INICIALIZAÇÃO
// =====================================================================
export async function inicializarMataMata(params) {
  if (window.Log) Log.info("[MATA-MATA] 🚀 Inicializando v7.0...", params);

  // ✅ v7.0: Aguardar DOM estar renderizado (double RAF)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // ✅ CORREÇÃO: Usar participanteAuth como fallback em vez de localStorage (evita dados cruzados entre ligas)
  estado.ligaId = params?.ligaId || window.participanteAuth?.ligaId;
  estado.timeId = params?.timeId || window.participanteAuth?.timeId;

  if (!estado.ligaId) {
    if (window.Log) Log.error("[MATA-MATA] ❌ Liga ID não encontrado");
    renderErro("Sessão inválida. Faça login novamente.");
    return;
  }

  // ✅ v9.0: Carregar config do admin (gerenciar-modulos) — fonte de verdade
  try {
    const configRes = await fetch(`/api/liga/${estado.ligaId}/modulos/mata_mata`);
    if (configRes.ok) {
      const configData = await configRes.json();
      const totalTimes = configData?.config?.wizard_respostas?.total_times;
      if (totalTimes) estado.tamanhoTorneio = Number(totalTimes);
      if (window.Log) Log.info(`[MATA-MATA] ⚙️ Tamanho torneio: ${estado.tamanhoTorneio}`);

      // ✅ FIX: Carregar edições do calendario_efetivo (gerado pelo admin)
      // Substitui o hardcoded EDICOES_MATA_MATA (dados de 2025, 32 times)
      const calendario = configData?.calendario_efetivo;
      if (Array.isArray(calendario) && calendario.length > 0) {
        // ✅ v9.1: Coerção Number() para prevenir concatenação de string em cálculos de rodada
        EDICOES_MATA_MATA = calendario.map(e => ({
          id: Number(e.id),
          nome: e.nome,
          rodadaInicial: Number(e.rodadaInicial),
          rodadaFinal: Number(e.rodadaFinal),
          rodadaDefinicao: Number(e.rodadaDefinicao)
        }));
        if (window.Log) Log.info(`[MATA-MATA] 📅 ${EDICOES_MATA_MATA.length} edições carregadas do admin config`);
      } else {
        if (window.Log) Log.warn("[MATA-MATA] ⚠️ Nenhuma edição no calendario_efetivo");
      }
    }
  } catch (e) {
    if (window.Log) Log.warn("[MATA-MATA] ⚠️ Config não carregada, usando default:", estado.tamanhoTorneio);
  }

  // ✅ v8.2: Carregar rodadaAtual ANTES da navegação (senão fases ficam todas liberadas/bloqueadas com rodadaAtual=1)
  await carregarStatusMercado();

  // ✅ v7.3: Atualizar navegação de fases após carregar tamanho do torneio e rodadaAtual
  atualizarNavegacaoFases();
  atualizarContador();

  // ✅ v6.8: CACHE-FIRST - Tentar carregar do IndexedDB primeiro
  // ⚠️ v6.8: NÃO usar historicoParticipacao do cache (pode estar com bug de tipos antigo)
  let usouCache = false;

  if (window.OfflineCache) {
    try {
      const mmCache = await window.OfflineCache.get('mataMata', estado.ligaId, true);
      if (mmCache && mmCache.edicoes && mmCache.confrontos) {
        usouCache = true;
        estado.edicoesDisponiveis = mmCache.edicoes;
        estado.cacheConfrontos = mmCache.confrontos;
        // ✅ v6.8: IGNORAR historico do cache - será recalculado com fix de tipos
        estado.historicoParticipacao = {};

        // Renderizar IMEDIATAMENTE com dados do cache
        if (window.Log)
          Log.info(`[MATA-MATA] ⚡ Cache IndexedDB: ${mmCache.edicoes.length} edições`);

        popularSelectEdicoes();
        atualizarContador();
        setupEventListeners();

        // ✅ v6.8: Recalcular historicoParticipacao ANTES de renderizar
        if (estado.edicoesDisponiveis.length > 0) {
          for (const ed of estado.edicoesDisponiveis) {
            await recalcularHistoricoEdicao(ed.edicao);
          }

          // ✅ v8.2: Foco na edição e fase atuais
          estado.edicaoSelecionada = getEdicaoAtual();

          const select = document.getElementById("mmEditionSelect");
          if (select) select.value = estado.edicaoSelecionada;

          const faseAtual = getFaseAtual(estado.edicaoSelecionada);
          estado.faseSelecionada = faseAtual;
          atualizarNavegacaoFases();
          atualizarBotoesFases();
          await carregarFase(estado.edicaoSelecionada, faseAtual);
        }
      }
    } catch (e) {
      if (window.Log) Log.warn("[MATA-MATA] ⚠️ Erro ao ler cache:", e);
    }
  }

  try {
    await carregarEdicoesDisponiveis(usouCache);
    if (!usouCache) {
      setupEventListeners();
    }

    // ✅ v8.0: Iniciar auto-refresh se parciais ao vivo disponíveis
    iniciarAutoRefresh();
    setupVisibilityListener();
  } catch (error) {
    if (window.Log) Log.error("[MATA-MATA] Erro:", error);
    if (!usouCache) {
      renderErro("Erro ao carregar mata-mata");
    }
  }
}

export const inicializarMataMataParticipante = inicializarMataMata;

// =====================================================================
// CARREGAR STATUS DO MERCADO
// =====================================================================
async function carregarStatusMercado() {
  try {
    // ✅ v9.1: Usar /api/matchday/status (detecção inteligente 3-tier via cartolaApiService)
    // Antes: /api/cartola/mercado/status (proxy básico, sem fallback inteligente)
    const res = await fetch("/api/matchday/status");
    if (res.ok) {
      const data = await res.json();
      estado.rodadaAtual = Number(data.rodada_atual) || 1;
      estado.mercadoAberto = data.mercado_aberto === true || data.status_mercado === 1;
      if (window.Log) Log.info(`[MATA-MATA] 📡 Status: rodada=${estado.rodadaAtual}, mercadoAberto=${estado.mercadoAberto}`);
    }
  } catch (e) {
    if (window.Log) Log.warn("[MATA-MATA] ⚠️ Erro ao buscar status mercado:", e.message);
    // Manter valores anteriores se já existirem — não sobrescrever com defaults
    if (estado.rodadaAtual <= 1) {
      estado.rodadaAtual = 1;
    }
  }
}

// =====================================================================
// AUTO-REFRESH PARCIAIS AO VIVO - v8.0
// =====================================================================

const REFRESH_INTERVAL_MS = 60000; // 60 segundos

function isParciaisAoVivo() {
  // Mercado fechado = jogos em andamento
  if (estado.mercadoAberto) return false;
  // Precisa ter edição selecionada
  if (!estado.edicaoSelecionada) return false;
  // Verificar se a fase atual está em andamento (rodada não consolidada)
  const faseAtiva = getFaseRodada(estado.edicaoSelecionada, estado.faseSelecionada);
  if (!faseAtiva) return false;
  // Rodada da fase deve ser >= rodadaAtual (ainda não consolidou)
  return estado.rodadaAtual >= faseAtiva.rodadaInicial && estado.rodadaAtual <= faseAtiva.rodadaPontos;
}

// Retorna info da rodada de pontos para a fase selecionada
function getFaseRodada(edicao, fase) {
  const config = EDICOES_MATA_MATA.find(e => e.id === edicao);
  if (!config) return null;
  const fasesAtivas = getFasesAtuais();
  const faseIndex = fasesAtivas.indexOf(fase);
  if (faseIndex < 0) return null;
  const rodadaPontos = config.rodadaInicial + faseIndex;
  return { rodadaInicial: config.rodadaInicial, rodadaPontos };
}

// Verifica se a fase atual tem confrontos definidos mas rodada ainda em andamento
function isFaseEmAndamento(edicao, fase) {
  const faseInfo = getFaseRodada(edicao, fase);
  if (!faseInfo) return false;
  // Rodada atual é igual à rodada de pontos da fase (em andamento)
  return estado.rodadaAtual === faseInfo.rodadaPontos && !estado.mercadoAberto;
}

function iniciarAutoRefresh() {
  pararAutoRefresh();

  if (!isParciaisAoVivo()) {
    if (window.Log) Log.info("[MATA-MATA] ⏸️ Auto-refresh não necessário");
    return;
  }

  estado._refreshAtivo = true;
  if (window.Log) Log.info(`[MATA-MATA] 🔄 Auto-refresh ativado (${REFRESH_INTERVAL_MS / 1000}s)`);

  estado._refreshInterval = setInterval(async () => {
    if (!isParciaisAoVivo()) {
      pararAutoRefresh();
      return;
    }

    try {
      if (window.Log) Log.info("[MATA-MATA] 🔄 Atualizando parciais...");

      // Verificar se mercado mudou
      await carregarStatusMercado();
      if (estado.mercadoAberto) {
        if (window.Log) Log.info("[MATA-MATA] ✅ Mercado abriu, parando auto-refresh");
        pararAutoRefresh();
        return;
      }

      // Recarregar fase atual com parciais frescos
      if (estado.edicaoSelecionada && estado.faseSelecionada) {
        await carregarFase(estado.edicaoSelecionada, estado.faseSelecionada);
        estado._ultimaAtualizacao = new Date();
        atualizarIndicadorAtualizacao();
        if (window.Log) Log.info("[MATA-MATA] ✅ Parciais atualizadas");
      }
    } catch (e) {
      if (window.Log) Log.warn("[MATA-MATA] ⚠️ Erro no auto-refresh:", e.message);
    }
  }, REFRESH_INTERVAL_MS);
}

function pararAutoRefresh() {
  if (estado._refreshInterval) {
    clearInterval(estado._refreshInterval);
    estado._refreshInterval = null;
  }
  if (estado._abortController) {
    estado._abortController.abort();
    estado._abortController = null;
  }
  if (estado._refreshAtivo) {
    estado._refreshAtivo = false;
    if (window.Log) Log.info("[MATA-MATA] ⏹️ Auto-refresh parado");
  }
}

// ✅ v8.0: Page Visibility API - pausa/retoma polling
function setupVisibilityListener() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pararAutoRefresh();
    } else {
      // Ao voltar, recarregar e reiniciar polling
      if (estado.edicaoSelecionada && estado.faseSelecionada) {
        carregarStatusMercado().then(() => {
          carregarFase(estado.edicaoSelecionada, estado.faseSelecionada);
          iniciarAutoRefresh();
        });
      }
    }
  });
}

function atualizarIndicadorAtualizacao() {
  const el = document.getElementById("mmLastUpdate");
  if (!el || !estado._ultimaAtualizacao) return;
  const agora = new Date();
  const diffSeg = Math.round((agora - estado._ultimaAtualizacao) / 1000);
  if (diffSeg < 60) {
    el.textContent = `Atualizado há ${diffSeg}s`;
  } else {
    el.textContent = `Atualizado há ${Math.round(diffSeg / 60)}min`;
  }
}

// ✅ v8.0: Buscar parciais para fase ativa e enriquecer confrontos com pontos ao vivo
async function buscarParciaisFaseAtiva(confrontos) {
  try {
    estado._abortController = new AbortController();
    const res = await fetch(`/api/matchday/parciais/${estado.ligaId}`, {
      signal: estado._abortController.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data.disponivel || !data.ranking) return null;

    // Criar mapa de pontos por timeId (usar pontos_rodada_atual, não acumulado)
    const pontosMap = new Map();
    data.ranking.forEach(t => {
      pontosMap.set(String(t.timeId), t.pontos_rodada_atual ?? t.pontos ?? 0);
    });

    // Enriquecer confrontos com pontos parciais
    const confrontosAoVivo = confrontos.map(c => {
      const timeAId = String(extrairTimeId(c.timeA));
      const timeBId = String(extrairTimeId(c.timeB));

      return {
        ...c,
        timeA: {
          ...c.timeA,
          pontos: pontosMap.get(timeAId) ?? c.timeA?.pontos ?? 0,
        },
        timeB: {
          ...c.timeB,
          pontos: pontosMap.get(timeBId) ?? c.timeB?.pontos ?? 0,
        },
        _aoVivo: true,
      };
    });

    estado._ultimaAtualizacao = new Date();
    return { confrontos: confrontosAoVivo, rodada: data.rodada };
  } catch (e) {
    if (e.name === "AbortError") return null;
    if (window.Log) Log.warn("[MATA-MATA] ⚠️ Erro ao buscar parciais fase:", e.message);
    return null;
  }
}

// ✅ v8.0: Destruir módulo (chamado externamente ao navegar para fora)
export function destruirMataMata() {
  pararAutoRefresh();
  if (window.Log) Log.info("[MATA-MATA] 🧹 Módulo destruído");
}

// =====================================================================
// CARREGAR EDIÇÕES DISPONÍVEIS DO MONGODB
// =====================================================================
async function carregarEdicoesDisponiveis(usouCache = false) {
  try {
    const temporada = window.participanteAuth?.temporadaSelecionada || CURRENT_SEASON;
    const res = await fetch(`/api/mata-mata/cache/${estado.ligaId}/edicoes?temporada=${temporada}`);
    if (!res.ok) throw new Error("Erro ao buscar edições");

    const data = await res.json();
    const edicoesNovas = data.edicoes || [];

    // Verificar se dados mudaram
    const dadosMudaram = !usouCache ||
      estado.edicoesDisponiveis.length !== edicoesNovas.length;

    estado.edicoesDisponiveis = edicoesNovas;

    if (window.Log)
      Log.info(
        `[MATA-MATA] ✅ ${estado.edicoesDisponiveis.length} edições encontradas`,
      );

    if (!usouCache) {
      popularSelectEdicoes();
      atualizarContador();
    }

    if (estado.edicoesDisponiveis.length > 0) {
      // Carregar histórico de TODAS as edições
      for (const ed of estado.edicoesDisponiveis) {
        await carregarTodasFases(ed.edicao);
      }

      // ✅ v6.7: Salvar no IndexedDB para próxima visita
      if (window.OfflineCache) {
        try {
          await window.OfflineCache.set('mataMata', estado.ligaId, {
            edicoes: estado.edicoesDisponiveis,
            confrontos: estado.cacheConfrontos,
            historico: estado.historicoParticipacao
          });
          if (window.Log) Log.info("[MATA-MATA] 💾 Cache IndexedDB atualizado");
        } catch (e) {
          if (window.Log) Log.warn("[MATA-MATA] ⚠️ Erro ao salvar cache:", e);
        }
      }

      if (!usouCache) {
        // ✅ v8.2: Foco na edição e fase atuais
        estado.edicaoSelecionada = getEdicaoAtual();

        const select = document.getElementById("mmEditionSelect");
        if (select) select.value = estado.edicaoSelecionada;

        const faseAtual = getFaseAtual(estado.edicaoSelecionada);
        estado.faseSelecionada = faseAtual;
        atualizarNavegacaoFases();
        atualizarBotoesFases();
        await carregarFase(estado.edicaoSelecionada, faseAtual);
      } else if (dadosMudaram) {
        // Re-renderizar se dados mudaram — manter foco inteligente
        popularSelectEdicoes();
        const edicaoAtual = getEdicaoAtual();
        const faseAtual = getFaseAtual(edicaoAtual);
        estado.edicaoSelecionada = edicaoAtual;
        estado.faseSelecionada = faseAtual;
        atualizarNavegacaoFases();
        atualizarBotoesFases();
        await carregarFase(edicaoAtual, faseAtual);
        if (window.Log) Log.info("[MATA-MATA] 🔄 Re-renderizado com dados frescos");
      }
    } else {
      // ✅ v7.4: Tratar caso de zero edições disponíveis
      if (!usouCache) {
        const temporada = window.participanteAuth?.temporadaSelecionada || CURRENT_SEASON;
        renderSemEdicoes(temporada);
      }
    }
  } catch (error) {
    if (window.Log) Log.error("[MATA-MATA] Erro ao carregar edições:", error);
    if (!usouCache) {
      renderErro("Nenhuma edição disponível");
    }
  }
}

// =====================================================================
// CARREGAR TODAS AS FASES PARA MAPEAR PARTICIPAÇÃO
// =====================================================================
async function carregarTodasFases(edicao) {
  try {
    const temporada = window.participanteAuth?.temporadaSelecionada || CURRENT_SEASON;
    const res = await fetch(`/api/mata-mata/cache/${estado.ligaId}/${edicao}?temporada=${temporada}`);
    if (!res.ok) {
      if (window.Log) Log.warn(`[MATA-MATA] ⚠️ Resposta não OK: ${res.status}`);
      return;
    }

    const data = await res.json();
    if (window.Log) Log.info("[MATA-MATA] 📦 Dados recebidos:", data);

    const dadosFases = data.dados || data.dados_torneio || data;

    if (!dadosFases || typeof dadosFases !== "object") {
      if (window.Log) Log.warn("[MATA-MATA] ⚠️ Estrutura de dados inválida");
      return;
    }

    const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;
    let ultimaFaseParticipada = null;
    let foiEliminado = false;

    // ✅ FIX: Iterar apenas fases válidas para o tamanho do torneio (ignora stale)
    getFasesAtuais().forEach((f) => {
      if (dadosFases[f]) {
        estado.cacheConfrontos[`${edicao}-${f}`] = dadosFases[f];

        const confrontos = dadosFases[f];
        const participou = confrontos.some(
          (c) =>
            extrairTimeId(c.timeA) === meuTimeId ||
            extrairTimeId(c.timeB) === meuTimeId,
        );

        if (participou) {
          ultimaFaseParticipada = f;

          const meuConfronto = confrontos.find(
            (c) =>
              extrairTimeId(c.timeA) === meuTimeId ||
              extrairTimeId(c.timeB) === meuTimeId,
          );

          if (meuConfronto) {
            const souTimeA = extrairTimeId(meuConfronto.timeA) === meuTimeId;
            const meusPts =
              parseFloat(
                souTimeA
                  ? meuConfronto.timeA?.pontos
                  : meuConfronto.timeB?.pontos,
              ) || 0;
            const advPts =
              parseFloat(
                souTimeA
                  ? meuConfronto.timeB?.pontos
                  : meuConfronto.timeA?.pontos,
              ) || 0;

            if (meusPts < advPts) foiEliminado = true;
          }
        }
      }
    });

    estado.historicoParticipacao[edicao] = {
      ultimaFase: ultimaFaseParticipada,
      eliminado: foiEliminado,
    };

    if (window.Log)
      Log.info(
        `[MATA-MATA] 📊 Histórico edição ${edicao}:`,
        estado.historicoParticipacao[edicao],
      );
  } catch (error) {
    if (window.Log) Log.error("[MATA-MATA] Erro ao carregar histórico:", error);
  }
}

// =====================================================================
// POPULAR SELECT DE EDIÇÕES
// =====================================================================
function popularSelectEdicoes() {
  const select = document.getElementById("mmEditionSelect");
  if (!select) return;

  select.innerHTML = estado.edicoesDisponiveis
    .map((ed) => {
      const config = EDICOES_MATA_MATA.find((e) => e.id === ed.edicao);
      const nome = config ? config.nome : `${ed.edicao}ª Edição`;
      return `<option value="${ed.edicao}">${nome}</option>`;
    })
    .join("");
}

// =====================================================================
// ATUALIZAR CONTADOR DE PARTICIPANTES
// =====================================================================
function atualizarContador() {
  const el = document.getElementById("mmTimesCount");
  // ✅ v7.3: Usar tamanho real do torneio em vez de hardcoded
  if (el) el.textContent = `${estado.tamanhoTorneio} participante(s)`;
}

// =====================================================================
// SETUP EVENT LISTENERS
// =====================================================================
function setupEventListeners() {
  const select = document.getElementById("mmEditionSelect");
  if (select) {
    select.addEventListener("change", async (e) => {
      pararAutoRefresh(); // ✅ v8.0: Parar polling ao mudar edição
      estado.edicaoSelecionada = parseInt(e.target.value);
      // ✅ v8.2: Re-renderizar navegação com bloqueio correto para nova edição
      atualizarNavegacaoFases();
      // ✅ v7.3: Usar primeira fase válida e liberada para o tamanho do torneio
      const primeiraFaseValida = estado.faseSelecionada || getFasesAtuais()[0] || "quartas";
      estado.faseSelecionada = primeiraFaseValida;
      atualizarBotoesFases();
      await carregarTodasFases(estado.edicaoSelecionada);
      await carregarFase(estado.edicaoSelecionada, primeiraFaseValida);
      iniciarAutoRefresh(); // ✅ v8.0: Reiniciar se aplicável
    });
  }

  const phasesNav = document.getElementById("mmPhasesNav");
  if (phasesNav) {
    phasesNav.addEventListener("click", async (e) => {
      const btn = e.target.closest(".mm-phase-btn");
      if (!btn) return;
      // ✅ v8.2: Bloquear clique em fases cuja rodada não chegou
      if (btn.classList.contains("disabled")) {
        if (window.Log) Log.warn(`[MATA-MATA] 🔒 Fase bloqueada: ${btn.dataset.fase}`);
        return;
      }

      const fase = btn.dataset.fase;
      if (!fase) return;

      pararAutoRefresh(); // ✅ v8.0: Parar polling ao mudar fase
      estado.faseSelecionada = fase;
      atualizarBotoesFases();
      await carregarFase(estado.edicaoSelecionada, fase);
      iniciarAutoRefresh(); // ✅ v8.0: Reiniciar se aplicável
    });
  }

  const buttons = document.querySelectorAll(".mm-phase-btn");
  // ✅ FIX: Usar fases válidas para o tamanho do torneio ao atribuir dataset
  getFasesAtuais().forEach((fase, i) => {
    if (buttons[i]) buttons[i].dataset.fase = fase;
  });

  // ✅ v7.4: Botão Classificados
  const btnClassificados = document.getElementById("btnClassificados");
  if (btnClassificados) {
    btnClassificados.addEventListener("click", () => {
      if (estado.edicaoSelecionada) {
        toggleClassificados();
      } else {
        if (window.Log) Log.warn("[MATA-MATA] Nenhuma edição selecionada");
      }
    });
  }
}

// =====================================================================
// ATUALIZAR BOTÕES DE FASES
// =====================================================================
function atualizarBotoesFases() {
  const buttons = document.querySelectorAll(".mm-phase-btn");
  buttons.forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.fase === estado.faseSelecionada) {
      btn.classList.add("active");
    }
  });
}

// =====================================================================
// ✅ v7.3: ATUALIZAR NAVEGAÇÃO DE FASES DINAMICAMENTE
// ✅ v8.2: Desabilitar botões de fases cuja rodada não chegou
// =====================================================================
function atualizarNavegacaoFases() {
  const phasesNav = document.getElementById("mmPhasesNav");
  if (!phasesNav) return;

  const fasesAtivas = getFasesAtuais();
  const faseLabels = {
    primeira: "1ª FASE",
    oitavas: "OITAVAS",
    quartas: "QUARTAS",
    semis: "SEMIFINAL",
    final: "FINAL",
  };

  // ✅ v8.2: Calcular bloqueio baseado na rodadaAtual e edição selecionada
  const edicaoConfig = estado.edicaoSelecionada
    ? EDICOES_MATA_MATA.find(e => e.id === estado.edicaoSelecionada)
    : null;

  // Recriar botões com apenas as fases válidas
  phasesNav.innerHTML = fasesAtivas
    .map((fase, idx) => {
      // ✅ Verificar se a rodada desta fase já chegou
      let isDisabled = false;
      if (edicaoConfig && estado.rodadaAtual > 0) {
        const rodadaDaFase = edicaoConfig.rodadaInicial + idx;
        isDisabled = estado.rodadaAtual < rodadaDaFase;
      }
      const disabledClass = isDisabled ? ' disabled' : '';
      const lockIcon = isDisabled ? ' 🔒' : '';
      return `
      <button class="mm-phase-btn${idx === 0 && !isDisabled ? ' active' : ''}${disabledClass}" data-fase="${fase}" ${isDisabled ? 'title="Aguardando rodada"' : ''}>
        ${faseLabels[fase] || fase.toUpperCase()}${lockIcon}
      </button>
    `;
    })
    .join('');

  // Definir primeira fase como selecionada se não houver ou se está bloqueada
  const fasesLiberadas = fasesAtivas.filter((fase, idx) => {
    if (!edicaoConfig || estado.rodadaAtual <= 0) return true;
    return estado.rodadaAtual >= edicaoConfig.rodadaInicial + idx;
  });

  if (!estado.faseSelecionada || !fasesLiberadas.includes(estado.faseSelecionada)) {
    estado.faseSelecionada = fasesLiberadas[0] || fasesAtivas[0];
  }

  if (window.Log) Log.info(`[MATA-MATA] 🔄 Navegação atualizada: ${fasesAtivas.join(', ')} (liberadas: ${fasesLiberadas.join(', ')})`);
}

// =====================================================================
// ✅ v7.4: TOGGLE CLASSIFICADOS
// =====================================================================
let classificadosAberto = false;

function toggleClassificados() {
  const container = document.getElementById("mata-mata-container");
  if (!container) return;

  // Se já está aberto, fechar
  const existente = document.querySelector(".mm-classificados-container");
  if (existente) {
    existente.remove();
    classificadosAberto = false;
    return;
  }

  // Buscar classificados da fase "primeira" da edição selecionada
  const primeiraFase = getFasesAtuais()[0] || "primeira";
  const cacheKey = `${estado.edicaoSelecionada}-${primeiraFase}`;
  const confrontos = estado.cacheConfrontos[cacheKey];

  if (!confrontos || confrontos.length === 0) {
    if (window.Log) Log.warn("[MATA-MATA] Sem dados de classificados para esta edição");
    return;
  }

  // Extrair todos os times únicos e ordenar por rankR2 (posição na classificação)
  const classificados = [];
  confrontos.forEach(c => {
    if (c.timeA) classificados.push({ ...c.timeA, adversario: c.timeB });
    if (c.timeB) classificados.push({ ...c.timeB, adversario: c.timeA });
  });

  // Ordenar por rankR2 (posição na rodada de classificação)
  classificados.sort((a, b) => (a.rankR2 || 999) - (b.rankR2 || 999));

  // Renderizar lista
  renderClassificados(classificados, container);
  classificadosAberto = true;

  if (window.Log) Log.info(`[MATA-MATA] 📋 ${classificados.length} classificados exibidos`);
}

function renderClassificados(classificados, container) {
  const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;
  const config = EDICOES_MATA_MATA.find(e => e.id === estado.edicaoSelecionada);
  const nomeEdicao = config ? config.nome : `${estado.edicaoSelecionada}ª Edição`;
  const rodadaClass = config ? config.rodadaInicial - 1 : "?"; // Rodada anterior à 1ª Fase é a classificatória

  let html = `
    <div class="mm-classificados-container">
      <div class="mm-classificados-header">
        <div class="mm-classificados-title">
          <span class="material-symbols-outlined">format_list_numbered</span>
          <span>Classificados - ${nomeEdicao}</span>
        </div>
        <button class="mm-classificados-close" id="btnFecharClassificados">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <p class="mm-classificados-info">
        Top ${estado.tamanhoTorneio} da Rodada ${rodadaClass} (Classificatória)
        <br><small>1º enfrenta ${estado.tamanhoTorneio}º, 2º enfrenta ${estado.tamanhoTorneio - 1}º...</small>
      </p>
      <div class="mm-classificados-list">
  `;

  classificados.forEach(time => {
    const isMeuTime = extrairTimeId(time) === meuTimeId;
    const posAdv = time.adversario?.rankR2 || "?";

    html += `
      <div class="mm-classificado-item ${isMeuTime ? 'meu-time' : ''}">
        <span class="mm-classificado-pos">${time.rankR2 || "?"}</span>
        <img class="mm-classificado-escudo" src="${getEscudoUrl(time)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
        <div class="mm-classificado-info">
          <div class="mm-classificado-nome">${escapeHtml(truncate(time.nome_time || time.nome || "Time", 18))}</div>
          <div class="mm-classificado-cartola">${escapeHtml(truncate(time.nome_cartola || time.nome_cartoleiro || "", 20))}</div>
        </div>
        <div class="mm-classificado-adversario">
          vs <strong>${posAdv}º</strong>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  // Inserir antes do conteúdo existente
  container.insertAdjacentHTML("afterbegin", html);

  // Event listener para fechar
  document.getElementById("btnFecharClassificados")?.addEventListener("click", () => {
    document.querySelector(".mm-classificados-container")?.remove();
    classificadosAberto = false;
  });
}

// =====================================================================
// ATUALIZAR INFO DA FASE
// =====================================================================
function atualizarInfoFase(fase) {
  const infoEl = document.getElementById("mmPhaseInfo");
  if (!infoEl) return;

  const config = EDICOES_MATA_MATA.find(
    (e) => e.id === estado.edicaoSelecionada,
  );
  const nomeEdicao = config
    ? config.nome
    : `${estado.edicaoSelecionada}ª Edição`;

  const nomeFase =
    {
      primeira: "1ª FASE",
      oitavas: "OITAVAS",
      quartas: "QUARTAS",
      semis: "SEMIFINAL",
      final: "FINAL",
    }[fase] || fase.toUpperCase();

  let rodadaFase = estado.rodadaAtual;
  if (config) {
    // ✅ v7.3: Usar fases dinâmicas para calcular índice
    const fasesAtivas = getFasesAtuais();
    const faseIndex = fasesAtivas.indexOf(fase);
    rodadaFase = config.rodadaInicial + (faseIndex >= 0 ? faseIndex : 0);
  }

  infoEl.innerHTML = `
    <p class="mm-edition-name">${nomeEdicao}</p>
    <p class="mm-phase-name">${nomeFase}</p>
    <p class="mm-round-info">Rodada ${rodadaFase}</p>
  `;
}

// =====================================================================
// CARREGAR FASE
// =====================================================================
async function carregarFase(edicao, fase) {
  const container = document.getElementById("mata-mata-container");
  if (!container) return;

  // ✅ v8.3: Bloquear fases cujos classificados ainda não são conhecidos
  // Se a fase anterior já aconteceu, exibir classificados em modo pendente
  const edicaoConfig = EDICOES_MATA_MATA.find(e => e.id === edicao);
  if (edicaoConfig && estado.rodadaAtual > 0) {
    const fasesAtivas = getFasesAtuais();
    const faseIndex = fasesAtivas.indexOf(fase);
    if (faseIndex >= 0) {
      const rodadaDaFase = edicaoConfig.rodadaInicial + faseIndex;
      if (estado.rodadaAtual <= rodadaDaFase) {
        const prevRodada = faseIndex > 0 ? edicaoConfig.rodadaInicial + faseIndex - 1 : null;
        const faseAnteriorFeita = prevRodada && estado.rodadaAtual > prevRodada;
        if (!faseAnteriorFeita) {
          if (window.Log) Log.info(`[MATA-MATA] 🔒 Fase ${fase} bloqueada - Rodada ${rodadaDaFase} não aconteceu (atual: ${estado.rodadaAtual})`);
          const nomeFase = { primeira: "1ª FASE", oitavas: "OITAVAS", quartas: "QUARTAS", semis: "SEMIFINAL", final: "FINAL" }[fase] || fase.toUpperCase();
          container.innerHTML = `
            <div class="mm-vazio mm-fase-bloqueada">
              <span class="material-symbols-outlined" style="font-size:48px;color:#6b7280;">lock</span>
              <h3>Fase Bloqueada</h3>
              <p>A fase <strong>${nomeFase}</strong> será disputada na <strong>Rodada ${rodadaDaFase}</strong> do Brasileirão.</p>
              <p style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:4px;">Os confrontos serão exibidos quando a rodada for iniciada.</p>
            </div>
          `;
          atualizarInfoFase(fase);
          return;
        }
        if (window.Log) Log.info(`[MATA-MATA] ⏳ Fase ${fase} pendente - exibindo classificados da fase anterior (rodada ${prevRodada})`);
      }
    }
  }

  atualizarInfoFase(fase);

  container.innerHTML = `
    <div class="mm-loading">
      <div class="mm-spinner"></div>
      <p>Carregando confrontos...</p>
    </div>
  `;

  try {
    const cacheKey = `${edicao}-${fase}`;
    let confrontos = estado.cacheConfrontos[cacheKey];

    if (!confrontos) {
      const temporada = window.participanteAuth?.temporadaSelecionada || CURRENT_SEASON;
      const res = await fetch(
        `/api/mata-mata/cache/${estado.ligaId}/${edicao}?temporada=${temporada}`,
      );
      if (!res.ok) throw new Error("Erro ao buscar dados");

      const data = await res.json();
      if (window.Log)
        Log.info("[MATA-MATA] 📦 Resposta carregarFase:", Object.keys(data));

      const dadosFases = data.dados || data.dados_torneio || data;

      if (!dadosFases || typeof dadosFases !== "object") {
        throw new Error("Dados não encontrados");
      }

      // ✅ FIX: Iterar apenas fases válidas para o tamanho do torneio (ignora stale)
      getFasesAtuais().forEach((f) => {
        if (dadosFases[f]) {
          estado.cacheConfrontos[`${edicao}-${f}`] = dadosFases[f];
        }
      });

      confrontos = dadosFases[fase];
    }

    if (!confrontos || confrontos.length === 0) {
      // ✅ v7.2: Se é a primeira fase, mostrar opções de parciais
      const primeiraFaseValida = getFasesAtuais()[0] || "primeira";
      if (fase === primeiraFaseValida) {
        renderParciaisOptionsApp(container, edicao);
        return;
      }

      // ✅ v8.4: Fase pendente — mostrar classificados projetados da fase anterior
      // Quando a fase anterior já aconteceu mas esta ainda não, os vencedores já são conhecidos
      const fasesAtivas = getFasesAtuais();
      const faseIdx = fasesAtivas.indexOf(fase);
      const edicaoCfg = EDICOES_MATA_MATA.find((e) => e.id === edicao);
      if (faseIdx > 0 && edicaoCfg && estado.rodadaAtual > 0) {
        const rodadaDaFase = edicaoCfg.rodadaInicial + faseIdx;
        if (estado.rodadaAtual <= rodadaDaFase) {
          const fasePrev = fasesAtivas[faseIdx - 1];
          const confrontosPrev = estado.cacheConfrontos[`${edicao}-${fasePrev}`];
          if (confrontosPrev && confrontosPrev.length > 0) {
            if (window.Log) Log.info(`[MATA-MATA] ⏳ Fase ${fase} pendente — exibindo confrontos projetados (vencedores de ${fasePrev})`);
            renderConfrontosProjetados(confrontosPrev, fase, rodadaDaFase);
            return;
          }
        }
      }

      container.innerHTML = `
        <div class="mm-vazio">
          <span class="material-symbols-outlined">sports_mma</span>
          <h3>Aguardando</h3>
          <p>Confrontos desta fase ainda não disponíveis</p>
        </div>
      `;
      return;
    }

    // ✅ v8.0: Se fase está em andamento, enriquecer confrontos com parciais ao vivo
    const faseAoVivo = isFaseEmAndamento(edicao, fase);
    if (faseAoVivo) {
      // ✅ FIX: SEMPRE iniciar auto-refresh se fase está em andamento
      // Mesmo que parciais não estejam disponíveis AGORA, elas podem ficar disponíveis depois
      const parciais = await buscarParciaisFaseAtiva(confrontos);
      if (parciais && parciais.confrontos) {
        // Parciais disponíveis: renderizar com dados ao vivo
        renderConfrontosCards(parciais.confrontos, fase, true, parciais.rodada);
      } else {
        // Parciais ainda não disponíveis: renderizar confrontos normais mas com indicador AO VIVO
        // O auto-refresh vai buscar parciais periodicamente até ficarem disponíveis
        if (window.Log) Log.info("[MATA-MATA] 🔄 Fase ao vivo mas parciais indisponíveis - iniciando polling...");
        renderConfrontosCards(confrontos, fase, true, null); // true = ao vivo, null = sem rodada ainda
      }
      // ✅ FIX CRÍTICO: Iniciar auto-refresh SEMPRE que fase está em andamento
      iniciarAutoRefresh();
      return;
    }

    // Fase não está em andamento: renderizar normalmente sem auto-refresh
    renderConfrontosCards(confrontos, fase, false);
  } catch (error) {
    if (window.Log) Log.error("[MATA-MATA] Erro:", error);
    container.innerHTML = `
      <div class="mm-vazio">
        <span class="material-symbols-outlined">error_outline</span>
        <h3>Erro</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// =====================================================================
// RENDERIZAR CONFRONTOS EM CARDS
// =====================================================================
function renderConfrontosCards(confrontos, fase, aoVivo = false, rodadaParciais = null) {
  const container = document.getElementById("mata-mata-container");
  if (!container) return;

  const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;

  const meuConfronto = confrontos.find(
    (c) =>
      extrairTimeId(c.timeA) === meuTimeId ||
      extrairTimeId(c.timeB) === meuTimeId,
  );

  let html = "";

  // ✅ v8.0: Header AO VIVO quando fase em andamento
  if (aoVivo) {
    const edicaoConfig = EDICOES_MATA_MATA.find(e => e.id === estado.edicaoSelecionada);
    const edicaoNome = edicaoConfig ? edicaoConfig.nome : `${estado.edicaoSelecionada}ª Edição`;
    const nomeFase = { primeira: "1ª Fase", oitavas: "Oitavas", quartas: "Quartas", semis: "Semifinal", final: "Final" }[fase] || fase;
    html += `
      <div class="mm-parciais-live-header">
        <span class="mm-live-dot"></span>
        <span class="mm-live-text">AO VIVO</span>
        <span class="mm-live-info">${nomeFase} — ${edicaoNome}${rodadaParciais ? ` (R${rodadaParciais})` : ""}</span>
      </div>
      <div class="mm-live-update-bar">
        <span id="mmLastUpdate" class="mm-last-update">${estado._ultimaAtualizacao ? "Atualizado agora" : ""}</span>
        <button class="mm-refresh-btn" id="mmRefreshBtn" title="Atualizar agora">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </div>
    `;
  }

  // ✅ v9.1: Removido card "Seu Confronto" redundante — o confronto do participante
  // já aparece destacado em "Todos os Confrontos" com classe .minha + badge de status
  if (!meuConfronto) {
    const historico = estado.historicoParticipacao[estado.edicaoSelecionada];

    if (historico && historico.ultimaFase && historico.eliminado) {
      const nomeFaseEliminacao =
        {
          primeira: "1ª Fase",
          oitavas: "Oitavas",
          quartas: "Quartas",
          semis: "Semifinal",
          final: "Final",
        }[historico.ultimaFase] || historico.ultimaFase;

      html += `
        <div class="mm-eliminado-card">
          <span class="material-symbols-outlined">block</span>
          <div class="mm-elim-texto">
            <p class="mm-elim-titulo">Você foi eliminado</p>
            <p class="mm-elim-fase">na ${nomeFaseEliminacao}</p>
          </div>
        </div>
      `;
    } else if (historico && historico.ultimaFase) {
      html += `
        <div class="mm-nao-classificado">
          <span class="material-symbols-outlined">sports_soccer</span>
          <p>Você não está nesta fase</p>
        </div>
      `;
    } else {
      html += `
        <div class="mm-nao-classificado">
          <span class="material-symbols-outlined">person_off</span>
          <p>Você não participou desta edição</p>
        </div>
      `;
    }
  }

  html += renderConfrontosListaCards(confrontos, meuTimeId, fase, aoVivo);
  html += renderCardDesempenho();

  container.innerHTML = html;

  // ✅ v8.0: Bind refresh manual quando AO VIVO
  if (aoVivo) {
    atualizarIndicadorAtualizacao();
    document.getElementById("mmRefreshBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("mmRefreshBtn");
      if (btn) btn.classList.add("mm-spinning");
      await carregarFase(estado.edicaoSelecionada, estado.faseSelecionada);
      if (btn) btn.classList.remove("mm-spinning");
    });
  }
}

// =====================================================================
// RENDER CONFRONTOS PROJETADOS (fase futura — classificados conhecidos)
// =====================================================================
function renderConfrontosProjetados(confrontosFaseAnterior, fase, rodadaDaFase) {
  const container = document.getElementById("mata-mata-container");
  if (!container) return;

  const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;
  const nomeFase = { primeira: "1ª Fase", oitavas: "Oitavas", quartas: "Quartas", semis: "Semifinal", final: "Final" }[fase] || fase.toUpperCase();

  // Extrair vencedores da fase anterior, mantendo ordem do bracket
  const sorted = [...confrontosFaseAnterior].sort((a, b) => (a.jogo || 0) - (b.jogo || 0));
  const vencedores = [];
  sorted.forEach((confronto) => {
    const { timeA, timeB } = confronto;
    if (!timeA || !timeB) return;
    const ptsA = typeof timeA.pontos === "number" ? timeA.pontos : -1;
    const ptsB = typeof timeB.pontos === "number" ? timeB.pontos : -1;
    let vencedor;
    if (ptsA >= 0 && ptsB >= 0) {
      if (ptsA > ptsB) vencedor = timeA;
      else if (ptsB > ptsA) vencedor = timeB;
      else vencedor = (timeA.rankR2 || 999) < (timeB.rankR2 || 999) ? timeA : timeB;
    } else {
      vencedor = (timeA.rankR2 || 999) < (timeB.rankR2 || 999) ? timeA : timeB;
    }
    if (vencedor) vencedores.push({ ...vencedor, _jogoAnterior: confronto.jogo });
  });

  if (vencedores.length === 0) {
    container.innerHTML = `
      <div class="mm-vazio">
        <span class="material-symbols-outlined">sports_mma</span>
        <h3>Aguardando</h3>
        <p>Confrontos desta fase ainda não disponíveis</p>
      </div>
    `;
    return;
  }

  // Montar confrontos projetados: pareamento bracket (1v2, 3v4, ...)
  const confrontosProjetados = [];
  for (let i = 0; i < vencedores.length; i += 2) {
    confrontosProjetados.push({ jogo: Math.floor(i / 2) + 1, timeA: vencedores[i], timeB: vencedores[i + 1] || null });
  }

  let html = `
    <div class="mm-proxima-fase-banner">
      <span class="material-symbols-outlined">schedule</span>
      <div>
        <p class="mm-prox-titulo">${nomeFase} — Confrontos Projetados</p>
        <p class="mm-prox-sub">Disputa na Rodada ${rodadaDaFase} · Com base nos classificados da fase anterior</p>
      </div>
    </div>
  `;

  // Card "Seu próximo confronto"
  const meuConfronto = confrontosProjetados.find(
    (c) => extrairTimeId(c.timeA) === meuTimeId || (c.timeB && extrairTimeId(c.timeB) === meuTimeId)
  );
  if (meuConfronto) {
    const souTimeA = extrairTimeId(meuConfronto.timeA) === meuTimeId;
    const eu = souTimeA ? meuConfronto.timeA : meuConfronto.timeB;
    const adv = souTimeA ? meuConfronto.timeB : meuConfronto.timeA;
    html += `
      <div class="mm-meu-card mm-meu-card-previsto">
        <div class="mm-meu-status empatando">
          <span class="material-symbols-outlined">schedule</span>
          <span>Seu próximo confronto</span>
        </div>
        <div class="mm-meu-times">
          <div class="mm-meu-time">
            <img src="${getEscudoUrl(eu)}" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
            <span class="mm-meu-nome">${escapeHtml(truncate(eu?.nome_time || eu?.nome || "Você", 12))}</span>
            <span class="mm-meu-pts mm-pts-pendente">—</span>
          </div>
          <div class="mm-meu-vs">VS</div>
          <div class="mm-meu-time">
            ${adv
              ? `<img src="${getEscudoUrl(adv)}" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
                 <span class="mm-meu-nome">${escapeHtml(truncate(adv?.nome_time || adv?.nome || "Adversário", 12))}</span>
                 <span class="mm-meu-pts mm-pts-pendente">—</span>`
              : `<span class="mm-meu-nome">A definir</span>`
            }
          </div>
        </div>
      </div>
    `;
  }

  html += `
    <div class="mm-outros-header">
      <span>Todos os Confrontos Previstos</span>
    </div>
    <div class="mm-confrontos-lista">
  `;

  confrontosProjetados.forEach((c, idx) => {
    const timeA = c.timeA || {};
    const timeB = c.timeB || {};
    const isMinha = extrairTimeId(timeA) === meuTimeId || extrairTimeId(timeB) === meuTimeId;
    html += `
      <div class="mm-confronto-card mm-confronto-previsto ${isMinha ? "minha" : ""}">
        <div class="mm-conf-numero">${idx + 1}</div>
        <div class="mm-conf-times">
          <div class="mm-conf-time">
            <img class="mm-conf-escudo" src="${getEscudoUrl(timeA)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
            <div class="mm-conf-info">
              <span class="mm-conf-nome">${escapeHtml(truncate(timeA.nome_time || timeA.nome || "A definir", 14))}</span>
              <span class="mm-conf-cartola">${escapeHtml(truncate(timeA.nome_cartola || timeA.nome_cartoleiro || "", 16))}</span>
            </div>
            <span class="mm-conf-pts empate">—</span>
          </div>
          <div class="mm-conf-vs">×</div>
          <div class="mm-conf-time">
            ${timeB
              ? `<img class="mm-conf-escudo" src="${getEscudoUrl(timeB)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
                 <div class="mm-conf-info">
                   <span class="mm-conf-nome">${escapeHtml(truncate(timeB.nome_time || timeB.nome || "A definir", 14))}</span>
                   <span class="mm-conf-cartola">${escapeHtml(truncate(timeB.nome_cartola || timeB.nome_cartoleiro || "", 16))}</span>
                 </div>
                 <span class="mm-conf-pts empate">—</span>`
              : `<div class="mm-conf-info"><span class="mm-conf-nome">A definir</span></div>`
            }
          </div>
        </div>
        <div class="mm-conf-diff mm-conf-pendente">Rodada ${rodadaDaFase}</div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// =====================================================================
// RENDER LISTA DE CONFRONTOS EM CARDS
// =====================================================================
function renderConfrontosListaCards(confrontos, meuTimeId, fase, aoVivo = false) {
  let html = "";

  if (fase === "final" && confrontos.length > 0) {
    const finalConfronto = confrontos[0];
    const timeA = finalConfronto.timeA || {};
    const timeB = finalConfronto.timeB || {};
    const ptsA = (timeA.pontos != null) ? parseFloat(timeA.pontos) : null;
    const ptsB = (timeB.pontos != null) ? parseFloat(timeB.pontos) : null;

    if (ptsA != null && ptsB != null && (ptsA > 0 || ptsB > 0)) {
      const campeao = ptsA >= ptsB ? timeA : timeB;
      const ptsCampeao = ptsA >= ptsB ? ptsA : ptsB;
      const campeaoId = extrairTimeId(campeao);
      const souCampeao = campeaoId === meuTimeId;

      html += `
        <div class="mm-campeao-card ${souCampeao ? "sou-eu" : ""}">
          <div class="mm-campeao-trofeu">🏆</div>
          <p class="mm-campeao-titulo">${souCampeao ? "Você é o Campeão!" : "Campeão"}</p>
          <div class="mm-campeao-time">
            <img class="mm-campeao-escudo" src="${getEscudoUrl(campeao)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
            <div class="mm-campeao-info">
              <p class="mm-campeao-nome">${escapeHtml(campeao.nome_time || campeao.nome || "Time")}</p>
              <p class="mm-campeao-cartola">${escapeHtml(campeao.nome_cartola || campeao.nome_cartoleiro || "")}</p>
              <p class="mm-campeao-pts">${typeof truncarPontos === 'function' ? truncarPontos(ptsCampeao) : ptsCampeao.toFixed(2)} pts</p>
            </div>
          </div>
          <div class="mm-campeao-badge">
            <span class="material-symbols-outlined">emoji_events</span>
            <span>${estado.edicaoSelecionada}ª Edição</span>
          </div>
        </div>
      `;
    }
  }

  html += `
    <div class="mm-outros-header">
      <span>${fase === "final" ? "A Grande Final" : "Todos os Confrontos"}</span>
    </div>
    <div class="mm-confrontos-lista">
  `;

  confrontos.forEach((c, idx) => {
    const timeA = c.timeA || {};
    const timeB = c.timeB || {};
    const ptsA = (timeA.pontos != null) ? parseFloat(timeA.pontos) : null;
    const ptsB = (timeB.pontos != null) ? parseFloat(timeB.pontos) : null;
    const ptsDispo = ptsA != null && ptsB != null;
    const diff = ptsDispo
      ? (typeof truncarPontos === 'function' ? truncarPontos(Math.abs(ptsA - ptsB)) : Math.abs(ptsA - ptsB).toFixed(2))
      : '\u2014';

    const vencedorA = ptsDispo && ptsA > ptsB;
    const vencedorB = ptsDispo && ptsB > ptsA;
    const isMinha =
      extrairTimeId(timeA) === meuTimeId || extrairTimeId(timeB) === meuTimeId;

    html += `
      <div class="mm-confronto-card ${isMinha ? "minha" : ""}">
        <div class="mm-conf-numero">${idx + 1}</div>

        <div class="mm-conf-times">
          <!-- Time A -->
          <div class="mm-conf-time ${vencedorA ? "vencedor" : vencedorB ? "perdedor" : ""}">
            <img class="mm-conf-escudo" src="${getEscudoUrl(timeA)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
            <div class="mm-conf-info">
              <span class="mm-conf-nome">${escapeHtml(truncate(timeA.nome_time || timeA.nome || "A definir", 14))}</span>
              <span class="mm-conf-cartola">${escapeHtml(truncate(timeA.nome_cartola || timeA.nome_cartoleiro || "", 16))}</span>
            </div>
            <span class="mm-conf-pts ${vencedorA ? "vencedor" : vencedorB ? "perdedor" : "empate"}">${ptsA != null ? (typeof truncarPontos === 'function' ? truncarPontos(ptsA) : ptsA.toFixed(2)) : '\u2014'}</span>
          </div>

          <div class="mm-conf-vs">×</div>

          <!-- Time B -->
          <div class="mm-conf-time ${vencedorB ? "vencedor" : vencedorA ? "perdedor" : ""}">
            <img class="mm-conf-escudo" src="${getEscudoUrl(timeB)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
            <div class="mm-conf-info">
              <span class="mm-conf-nome">${escapeHtml(truncate(timeB.nome_time || timeB.nome || "A definir", 14))}</span>
              <span class="mm-conf-cartola">${escapeHtml(truncate(timeB.nome_cartola || timeB.nome_cartoleiro || "", 16))}</span>
            </div>
            <span class="mm-conf-pts ${vencedorB ? "vencedor" : vencedorA ? "perdedor" : "empate"}">${ptsB != null ? (typeof truncarPontos === 'function' ? truncarPontos(ptsB) : ptsB.toFixed(2)) : '\u2014'}</span>
          </div>
        </div>

        <div class="mm-conf-diff">Diferença: ${diff} pts</div>
        ${isMinha && ptsDispo ? `
          <div class="mm-minha-status ${vencedorA && extrairTimeId(timeA) === meuTimeId || vencedorB && extrairTimeId(timeB) === meuTimeId ? 'passando' : (vencedorA || vencedorB) ? 'eliminado' : 'empate'}">
            <span class="material-symbols-outlined">${
              (vencedorA && extrairTimeId(timeA) === meuTimeId) || (vencedorB && extrairTimeId(timeB) === meuTimeId)
                ? 'check_circle' : (vencedorA || vencedorB) ? 'warning' : 'drag_handle'
            }</span>
            <span>${
              (vencedorA && extrairTimeId(timeA) === meuTimeId) || (vencedorB && extrairTimeId(timeB) === meuTimeId)
                ? 'Você está passando!'
                : (vencedorA || vencedorB)
                  ? (aoVivo ? 'Você está sendo eliminado' : 'Você foi eliminado')
                  : 'Empate técnico'
            }</span>
          </div>
        ` : ''}
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

// =====================================================================
// RENDER CARD "SEU DESEMPENHO" - VERSÃO 2
// =====================================================================
function renderCardDesempenho() {
  if (window.Log) Log.info("[MATA-MATA] 🎯 Renderizando card de desempenho...");

  const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;
  if (!meuTimeId) {
    if (window.Log) Log.warn("[MATA-MATA] ⚠️ TimeId não encontrado");
    return "";
  }

  if (window.Log) Log.info("[MATA-MATA] 📊 TimeId:", meuTimeId);

  let vitoriasTotal = 0;
  let derrotasTotal = 0;
  let pontosTotal = 0;
  const historicoEdicoes = [];

  // Percorrer todas as edições para montar histórico completo
  Object.keys(estado.historicoParticipacao).forEach((edicao) => {
    const historico = estado.historicoParticipacao[edicao];

    if (historico && historico.ultimaFase) {
      let vitoriasEdicao = 0;
      let derrotasEdicao = 0;
      let pontosEdicao = 0;

      // ✅ FIX: Iterar apenas fases válidas para o tamanho do torneio (ignora stale)
      getFasesAtuais().forEach((f) => {
        const chaveCache = `${edicao}-${f}`;
        const confrontos = estado.cacheConfrontos[chaveCache];

        if (confrontos) {
          const meuConfronto = confrontos.find(
            (c) =>
              extrairTimeId(c.timeA) === meuTimeId ||
              extrairTimeId(c.timeB) === meuTimeId,
          );

          if (meuConfronto) {
            const souTimeA = extrairTimeId(meuConfronto.timeA) === meuTimeId;
            const meusPts =
              parseFloat(
                souTimeA
                  ? meuConfronto.timeA?.pontos
                  : meuConfronto.timeB?.pontos,
              ) || 0;
            const advPts =
              parseFloat(
                souTimeA
                  ? meuConfronto.timeB?.pontos
                  : meuConfronto.timeA?.pontos,
              ) || 0;

            pontosEdicao += meusPts;

            if (meusPts > advPts) vitoriasEdicao++;
            else if (meusPts < advPts) derrotasEdicao++;
          }
        }
      });

      // Mapear fase para badge
      const faseMap = {
        primeira: { label: "1ª Fase", class: "primeira" },
        oitavas: { label: "Oitavas", class: "oitavas" },
        quartas: { label: "Quartas", class: "quartas" },
        semis: { label: "Semis", class: "semis" },
        final: { label: "Campeão", class: "campeao" },
      };

      const faseInfo = faseMap[historico.ultimaFase] || {
        label: historico.ultimaFase,
        class: "primeira",
      };

      historicoEdicoes.push({
        edicao: edicao,
        vitorias: vitoriasEdicao,
        derrotas: derrotasEdicao,
        pontos: pontosEdicao,
        fase: faseInfo.label,
        faseClass: faseInfo.class,
      });

      vitoriasTotal += vitoriasEdicao;
      derrotasTotal += derrotasEdicao;
      pontosTotal += pontosEdicao;
    }
  });

  // Ordenar edições por número
  historicoEdicoes.sort((a, b) => parseInt(a.edicao) - parseInt(b.edicao));

  if (window.Log)
    Log.info("[MATA-MATA] 📊 Stats Totais:", {
      vitoriasTotal,
      derrotasTotal,
      pontosTotal,
      edicoes: historicoEdicoes.length,
    });

  const aproveitamento =
    vitoriasTotal + derrotasTotal > 0
      ? ((vitoriasTotal / (vitoriasTotal + derrotasTotal)) * 100).toFixed(0)
      : 0;

  // Renderizar histórico de edições
  let historicoHTML = "";
  if (historicoEdicoes.length > 0) {
    historicoHTML = `
      <div class="mm-desemp-history">
        <div class="mm-desemp-history-title">
          <span class="material-symbols-outlined">history</span>
          <span>Histórico por Edição</span>
        </div>
        <div class="mm-desemp-edition-list">
          ${historicoEdicoes
            .map(
              (ed) => `
            <div class="mm-desemp-edition-item">
              <span class="mm-desemp-edition-name">${ed.edicao}ª Edição</span>
              <div class="mm-desemp-edition-stats">
                <span class="mm-desemp-edition-record">${ed.vitorias}V-${ed.derrotas}D</span>
                <span class="mm-desemp-edition-phase ${ed.faseClass}">${ed.fase}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  return `
    <div class="mm-desempenho-card">
      <div class="mm-desemp-header">
        <span class="material-symbols-outlined">bar_chart</span>
        <span>Seu Desempenho</span>
      </div>

      <div class="mm-desemp-main-stats">
        <div class="mm-desemp-main-stat">
          <span class="mm-desemp-main-icon win material-symbols-outlined">emoji_events</span>
          <div class="mm-desemp-main-info">
            <span class="mm-desemp-main-label">Vitórias</span>
            <span class="mm-desemp-main-value">${vitoriasTotal}</span>
          </div>
        </div>

        <div class="mm-desemp-main-stat">
          <span class="mm-desemp-main-icon loss material-symbols-outlined">close</span>
          <div class="mm-desemp-main-info">
            <span class="mm-desemp-main-label">Derrotas</span>
            <span class="mm-desemp-main-value">${derrotasTotal}</span>
          </div>
        </div>
      </div>

      <div class="mm-desemp-secondary-stats">
        <div class="mm-desemp-secondary-stat">
          <div class="mm-desemp-secondary-value success">${aproveitamento}%</div>
          <div class="mm-desemp-secondary-label">Aproveit.</div>
        </div>
        <div class="mm-desemp-secondary-stat">
          <div class="mm-desemp-secondary-value">${typeof truncarPontos === 'function' ? truncarPontos(pontosTotal) : pontosTotal.toFixed(2)}</div>
          <div class="mm-desemp-secondary-label">Pts Total</div>
        </div>
        <div class="mm-desemp-secondary-stat">
          <div class="mm-desemp-secondary-value highlight">${historicoEdicoes.length}</div>
          <div class="mm-desemp-secondary-label">Edições</div>
        </div>
      </div>

      ${historicoHTML}
    </div>
  `;
}

// =====================================================================
// PARCIAIS AO VIVO (v7.2)
// =====================================================================

function renderParciaisOptionsApp(container, edicao) {
  const edicaoConfig = EDICOES_MATA_MATA.find(e => e.id === edicao);
  const edicaoNome = edicaoConfig ? edicaoConfig.nome : `${edicao}ª Edição`;

  container.innerHTML = `
    <div class="mm-vazio mm-parciais-menu">
      <span class="material-symbols-outlined" style="font-size:40px;color:var(--app-amber);">sports_score</span>
      <h3>Rodada de Classificação</h3>
      <p>As chaves serão definidas ao final da rodada.</p>
      <div class="mm-parciais-actions">
        <button class="mm-parciais-btn" id="btnParcClassificados">
          <span class="material-symbols-outlined">leaderboard</span>
          <span>Classificados da ${edicaoNome}</span>
          <span class="mm-parciais-badge">PARCIAIS</span>
        </button>
        <button class="mm-parciais-btn" id="btnParcConfrontos">
          <span class="material-symbols-outlined">account_tree</span>
          <span>Confrontos da 1ª Fase</span>
          <span class="mm-parciais-badge">PARCIAIS</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById("btnParcClassificados")?.addEventListener("click", () => {
    carregarClassificadosParciais(container, edicao);
  });
  document.getElementById("btnParcConfrontos")?.addEventListener("click", () => {
    carregarConfrontosParciais(container, edicao);
  });
}

async function carregarClassificadosParciais(container, edicao) {
  container.innerHTML = `
    <div class="mm-loading">
      <div class="mm-spinner"></div>
      <p>Buscando parciais...</p>
    </div>`;

  try {
    const res = await fetch(`/api/matchday/parciais/${estado.ligaId}`);
    const data = res.ok ? await res.json() : null;

    if (!data || !data.disponivel) {
      const msg = data?.message || "Parciais não disponíveis no momento.";
      container.innerHTML = `
        <div class="mm-vazio">
          <span class="material-symbols-outlined">info</span>
          <h3>${msg}</h3>
          <div class="mm-parciais-voltar">
            <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
          </div>
        </div>`;
      document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
        renderParciaisOptionsApp(container, edicao);
      });
      return;
    }

    // Re-ordenar por pontos da rodada atual (não acumulado) para classificação MM
    const ranking = (data.ranking || [])
      .map(t => ({ ...t, _pontosRodada: t.pontos_rodada_atual ?? t.pontos ?? 0 }))
      .sort((a, b) => b._pontosRodada - a._pontosRodada);
    const tamanho = estado.tamanhoTorneio;
    const classificados = ranking.slice(0, tamanho);
    const eliminados = ranking.slice(tamanho, tamanho + 5);
    const edicaoConfig = EDICOES_MATA_MATA.find(e => e.id === edicao);
    const edicaoNome = edicaoConfig ? edicaoConfig.nome : `${edicao}ª Edição`;
    const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;

    let html = `
      <div class="mm-parciais-live-header">
        <span class="mm-live-dot"></span>
        <span class="mm-live-text">AO VIVO</span>
        <span class="mm-live-info">Classificados — ${edicaoNome} (Rodada ${data.rodada})</span>
      </div>
      <p class="mm-parciais-sub">Top ${tamanho} classificam para o Mata-Mata</p>
      <div class="mm-parciais-ranking">`;

    classificados.forEach((t, i) => {
      const isMeu = parseInt(t.timeId) === meuTimeId;
      const isCutoff = i === tamanho - 1;
      html += `
        <div class="mm-parciais-rank-item ${isMeu ? "meu" : ""} ${isCutoff ? "cutoff" : ""}">
          <span class="mm-parciais-pos">${i + 1}º</span>
          <img class="mm-parciais-escudo" src="/escudos/${t.clube_id}.png" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
          <div class="mm-parciais-rank-info">
            <span class="mm-parciais-rank-nome">${escapeHtml(truncate(t.nome_time || "—", 16))}</span>
            <span class="mm-parciais-rank-cartola">${escapeHtml(truncate(t.nome_cartola || "—", 18))}</span>
          </div>
          <span class="mm-parciais-rank-pts">${typeof truncarPontos === 'function' ? truncarPontos(t.pontos_rodada_atual ?? t.pontos ?? 0) : ((t.pontos_rodada_atual ?? t.pontos)?.toFixed(2) || "0.00")}</span>
        </div>`;
    });

    if (eliminados.length > 0) {
      html += `<div class="mm-parciais-eliminados-label">Fora do corte</div>`;
      eliminados.forEach((t, i) => {
        html += `
          <div class="mm-parciais-rank-item eliminado">
            <span class="mm-parciais-pos">${tamanho + i + 1}º</span>
            <img class="mm-parciais-escudo" src="/escudos/${t.clube_id}.png" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
            <div class="mm-parciais-rank-info">
              <span class="mm-parciais-rank-nome">${escapeHtml(truncate(t.nome_time || "—", 16))}</span>
              <span class="mm-parciais-rank-cartola">${escapeHtml(truncate(t.nome_cartola || "—", 18))}</span>
            </div>
            <span class="mm-parciais-rank-pts">${typeof truncarPontos === 'function' ? truncarPontos(t.pontos_rodada_atual ?? t.pontos ?? 0) : ((t.pontos_rodada_atual ?? t.pontos)?.toFixed(2) || "0.00")}</span>
          </div>`;
      });
    }

    html += `</div>
      <div class="mm-parciais-voltar">
        <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
      </div>`;

    container.innerHTML = html;
    document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
      renderParciaisOptionsApp(container, edicao);
    });

    if (window.Log) Log.info(`[MATA-MATA] 📊 Parciais classificados: ${classificados.length}/${ranking.length}`);
  } catch (err) {
    if (window.Log) Log.error("[MATA-MATA] Erro parciais:", err);
    container.innerHTML = `
      <div class="mm-vazio">
        <span class="material-symbols-outlined">error_outline</span>
        <h3>Erro ao buscar parciais</h3>
        <p>${err.message}</p>
        <div class="mm-parciais-voltar">
          <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
        </div>
      </div>`;
    document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
      renderParciaisOptionsApp(container, edicao);
    });
  }
}

async function carregarConfrontosParciais(container, edicao) {
  container.innerHTML = `
    <div class="mm-loading">
      <div class="mm-spinner"></div>
      <p>Montando confrontos parciais...</p>
    </div>`;

  try {
    const res = await fetch(`/api/matchday/parciais/${estado.ligaId}`);
    const data = res.ok ? await res.json() : null;

    if (!data || !data.disponivel) {
      const msg = data?.message || "Parciais não disponíveis no momento.";
      container.innerHTML = `
        <div class="mm-vazio">
          <span class="material-symbols-outlined">info</span>
          <h3>${msg}</h3>
          <div class="mm-parciais-voltar">
            <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
          </div>
        </div>`;
      document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
        renderParciaisOptionsApp(container, edicao);
      });
      return;
    }

    // Re-ordenar por pontos da rodada atual (não acumulado) para classificação MM
    const ranking = (data.ranking || [])
      .map(t => ({ ...t, _pontosRodada: t.pontos_rodada_atual ?? t.pontos ?? 0 }))
      .sort((a, b) => b._pontosRodada - a._pontosRodada);
    const tamanho = estado.tamanhoTorneio;

    if (ranking.length < tamanho) {
      container.innerHTML = `
        <div class="mm-vazio">
          <span class="material-symbols-outlined">group</span>
          <h3>Dados insuficientes</h3>
          <p>${ranking.length} de ${tamanho} times nas parciais.</p>
          <div class="mm-parciais-voltar">
            <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
          </div>
        </div>`;
      document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
        renderParciaisOptionsApp(container, edicao);
      });
      return;
    }

    // Montar confrontos 1vs último, 2vs penúltimo, etc.
    const classificados = ranking.slice(0, tamanho);
    const metade = tamanho / 2;
    const confrontos = [];

    for (let i = 0; i < metade; i++) {
      const timeA = classificados[i];
      const timeB = classificados[tamanho - 1 - i];
      confrontos.push({
        timeA: {
          time_id: timeA.timeId,
          timeId: timeA.timeId,
          nome_time: timeA.nome_time || timeA.nome,
          nome_cartola: timeA.nome_cartola,
          nome_cartoleiro: timeA.nome_cartola,
          clube_id: timeA.clube_id,
          url_escudo_png: `/escudos/${timeA.clube_id}.png`,
          pontos: 0,
        },
        timeB: {
          time_id: timeB.timeId,
          timeId: timeB.timeId,
          nome_time: timeB.nome_time || timeB.nome,
          nome_cartola: timeB.nome_cartola,
          nome_cartoleiro: timeB.nome_cartola,
          clube_id: timeB.clube_id,
          url_escudo_png: `/escudos/${timeB.clube_id}.png`,
          pontos: 0,
        },
      });
    }

    const edicaoConfig = EDICOES_MATA_MATA.find(e => e.id === edicao);
    const edicaoNome = edicaoConfig ? edicaoConfig.nome : `${edicao}ª Edição`;

    // Renderizar com header AO VIVO + confrontos em cards
    let html = `
      <div class="mm-parciais-live-header">
        <span class="mm-live-dot"></span>
        <span class="mm-live-text">AO VIVO</span>
        <span class="mm-live-info">Confrontos da 1ª Fase — ${edicaoNome} (Rodada ${data.rodada})</span>
      </div>
      <p class="mm-parciais-sub">Baseado nas parciais. Sujeito a alteração.</p>`;

    html += `
      <div class="mm-outros-header">
        <span>Confrontos Projetados</span>
      </div>
      <div class="mm-confrontos-lista">`;

    const meuTimeId = estado.timeId ? parseInt(estado.timeId) : null;

    confrontos.forEach((c, idx) => {
      const timeA = c.timeA || {};
      const timeB = c.timeB || {};
      const posA = idx + 1;
      const posB = tamanho - idx;
      const isMinha = extrairTimeId(timeA) === meuTimeId || extrairTimeId(timeB) === meuTimeId;

      html += `
        <div class="mm-confronto-card ${isMinha ? "minha" : ""}">
          <div class="mm-conf-numero">${idx + 1}</div>
          <div class="mm-conf-times">
            <div class="mm-conf-time">
              <img class="mm-conf-escudo" src="${getEscudoUrl(timeA)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
              <div class="mm-conf-info">
                <span class="mm-conf-nome">${escapeHtml(truncate(timeA.nome_time || timeA.nome || "A definir", 14))}</span>
                <span class="mm-conf-cartola">${escapeHtml(truncate(timeA.nome_cartola || "", 16))}</span>
              </div>
              <span class="mm-conf-pts empate">${posA}º</span>
            </div>
            <div class="mm-conf-vs">×</div>
            <div class="mm-conf-time">
              <img class="mm-conf-escudo" src="${getEscudoUrl(timeB)}" alt="" onerror="this.onerror=null;this.src='${ESCUDO_PLACEHOLDER}'">
              <div class="mm-conf-info">
                <span class="mm-conf-nome">${escapeHtml(truncate(timeB.nome_time || timeB.nome || "A definir", 14))}</span>
                <span class="mm-conf-cartola">${escapeHtml(truncate(timeB.nome_cartola || "", 16))}</span>
              </div>
              <span class="mm-conf-pts empate">${posB}º</span>
            </div>
          </div>
          <div class="mm-conf-diff">Parcial: ${posA}º vs ${posB}º</div>
        </div>`;
    });

    html += `</div>
      <div class="mm-parciais-voltar">
        <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
      </div>`;

    container.innerHTML = html;
    document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
      renderParciaisOptionsApp(container, edicao);
    });

    if (window.Log) Log.info(`[MATA-MATA] ⚔️ Confrontos parciais: ${confrontos.length} jogos montados`);
  } catch (err) {
    if (window.Log) Log.error("[MATA-MATA] Erro confrontos parciais:", err);
    container.innerHTML = `
      <div class="mm-vazio">
        <span class="material-symbols-outlined">error_outline</span>
        <h3>Erro ao montar confrontos</h3>
        <p>${err.message}</p>
        <div class="mm-parciais-voltar">
          <button class="mm-parciais-voltar-btn" id="btnVoltarParc">← Voltar</button>
        </div>
      </div>`;
    document.getElementById("btnVoltarParc")?.addEventListener("click", () => {
      renderParciaisOptionsApp(container, edicao);
    });
  }
}

// =====================================================================
// ✅ v7.4: RENDER SEM EDIÇÕES DISPONÍVEIS
// =====================================================================
function renderSemEdicoes(temporada) {
  const container = document.getElementById("mata-mata-container");
  if (!container) return;

  // Esconder select de edições e info quando não há edições
  const selectWrapper = document.querySelector(".mm-edition-select-wrapper");
  const phaseInfo = document.getElementById("mmPhaseInfo");
  if (selectWrapper) selectWrapper.style.display = "none";
  if (phaseInfo) phaseInfo.innerHTML = "";

  container.innerHTML = `
    <div class="mm-vazio">
      <span class="material-symbols-outlined">sports_kabaddi</span>
      <h3>Mata-Mata ainda não calculado</h3>
      <p>As chaves do Mata-Mata ${temporada} ainda não foram geradas pelo administrador.</p>
      <p class="mm-vazio-sub">Aguarde a publicação dos confrontos!</p>
    </div>
  `;

  if (window.Log) Log.info(`[MATA-MATA] 📭 Sem edições para temporada ${temporada}`);
}

// =====================================================================
// RENDER ERRO
// =====================================================================
function renderErro(msg) {
  const container = document.getElementById("mata-mata-container");
  if (!container) return;

  container.innerHTML = `
    <div class="mm-vazio">
      <span class="material-symbols-outlined">error_outline</span>
      <h3>Erro</h3>
      <p>${msg}</p>
    </div>
  `;
}

// =====================================================================
// UTILS
// =====================================================================
function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "..." : str;
}

if (window.Log) Log.info("[MATA-MATA] ✅ Módulo v8.0 carregado (Tempo Real + Auto-Polling)");
