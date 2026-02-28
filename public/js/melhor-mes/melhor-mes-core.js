// MELHOR DO MÊS - CORE BUSINESS LOGIC v2.0
// public/js/melhor-mes/melhor-mes-core.js
// v2.0: Busca dados da API backend (edições dinâmicas do ModuleConfig)
//       Elimina cálculo local + hardcode de edições

import {
  MELHOR_MES_CONFIG,
  getPremiosLiga,
  atualizarEdicoesDinamicas,
} from "./melhor-mes-config.js?v=20260228-3";

console.log("[MELHOR-MES-CORE] Inicializando core business logic...");

// CACHE EM MEMÓRIA
let cacheAPI = null;
let cacheTimestamp = 0;
const CACHE_TTL = MELHOR_MES_CONFIG.cache?.ttl || 300000; // 5 min
let dadosBasicos = null;

export class MelhorMesCore {
  constructor() {
    this.ligaId = null;
    this.ultimaRodadaCompleta = 0;
    this.dadosProcessados = {};
  }

  // INICIALIZAÇÃO DO CORE
  async inicializar(ligaId = null) {
    console.log("[MELHOR-MES-CORE] Inicializando...");

    // Obter ligaId
    this.ligaId = ligaId && ligaId !== "null" ? ligaId : this.obterLigaId();

    if (!this.ligaId || this.ligaId === "null") {
      console.error("[MELHOR-MES-CORE] ❌ Liga ID não encontrado");
      this.dadosProcessados = { resultados: {}, dadosBasicos: null };
      return this.dadosProcessados;
    }

    console.log(`[MELHOR-MES-CORE] ✅ Liga ID obtido: ${this.ligaId}`);

    // Buscar dados da API backend (que já usa edições dinâmicas do ModuleConfig)
    await this.buscarDadosAPI();

    console.log("[MELHOR-MES-CORE] Core inicializado com sucesso");
    return this.dadosProcessados;
  }

  // OBTER LIGA ID - múltiplas tentativas
  obterLigaId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get("id") || urlParams.get("ligaId");
    if (id) return id;

    if (typeof window.obterLigaId === "function") {
      id = window.obterLigaId();
      if (id) return id;
    }

    if (window.ligaIdAtual) return window.ligaIdAtual;
    if (window.currentLigaId) return window.currentLigaId;
    if (window.participanteData?.ligaId) return window.participanteData.ligaId;

    const pathMatch = window.location.pathname.match(/\/liga\/([a-f0-9]+)/i);
    if (pathMatch) return pathMatch[1];

    return null;
  }

  // BUSCAR DADOS DA API BACKEND
  async buscarDadosAPI() {
    const startTime = performance.now();

    // Verificar cache em memória
    if (cacheAPI && (Date.now() - cacheTimestamp) < CACHE_TTL) {
      console.log("[MELHOR-MES-CORE] Cache hit (API)");
      this.dadosProcessados = cacheAPI;
      return;
    }

    try {
      const response = await fetch(`/api/ligas/${this.ligaId}/melhor-mes`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const apiData = await response.json();
      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[MELHOR-MES-CORE] API respondeu em ${elapsed}ms — ${apiData.edicoes?.length || 0} edições`);

      // Atualizar edições dinâmicas no config (para UI usar)
      if (apiData.edicoes?.length > 0) {
        atualizarEdicoesDinamicas(apiData.edicoes);
      }

      // Transformar resposta da API para formato que a UI espera
      this.dadosProcessados = this.transformarRespostaAPI(apiData);

      // Salvar em cache
      cacheAPI = this.dadosProcessados;
      cacheTimestamp = Date.now();

    } catch (error) {
      console.error("[MELHOR-MES-CORE] Erro ao buscar API:", error);

      // Se tem cache expirado, usar como fallback
      if (cacheAPI) {
        console.warn("[MELHOR-MES-CORE] Usando cache expirado como fallback");
        this.dadosProcessados = cacheAPI;
        return;
      }

      this.dadosProcessados = {
        resultados: {},
        dadosBasicos: null,
        aguardandoDados: true,
        timestamp: Date.now(),
      };
    }
  }

  // TRANSFORMAR RESPOSTA DA API PARA FORMATO DA UI
  transformarRespostaAPI(apiData) {
    const premiosLiga = getPremiosLiga(this.ligaId);

    dadosBasicos = {
      ligaId: this.ligaId,
      ultimaRodadaCompleta: apiData.rodada_sistema || 0,
      premiosLiga,
      timestamp: Date.now(),
    };

    this.ultimaRodadaCompleta = apiData.rodada_sistema || 0;

    // Se não há edições, aguardando dados
    if (!apiData.edicoes || apiData.edicoes.length === 0) {
      return {
        resultados: {},
        dadosBasicos,
        aguardandoDados: true,
        timestamp: Date.now(),
      };
    }

    // Converter cada edição da API para formato da UI
    const resultados = {};
    apiData.edicoes.forEach((edicaoAPI, index) => {
      const statusMap = {
        consolidado: "concluida",
        em_andamento: "andamento",
        pendente: "aguardando",
      };

      // Adaptar ranking: API usa pontos_total, UI usa pontos
      const ranking = (edicaoAPI.ranking || []).map((r) => ({
        time_id: String(r.timeId),
        nome_cartola: r.nome_cartola || "N/D",
        nome_time: r.nome_time || "N/D",
        clube_id: r.clube_id || null,
        pontos: r.pontos_total || 0,
        posicao: r.posicao,
      }));

      resultados[index] = {
        edicao: {
          id: edicaoAPI.id,
          nome: edicaoAPI.nome,
          inicio: edicaoAPI.inicio,
          fim: edicaoAPI.fim,
        },
        status: statusMap[edicaoAPI.status] || edicaoAPI.status,
        iniciada: edicaoAPI.status !== "pendente",
        concluida: edicaoAPI.status === "consolidado",
        ranking,
        rodadaFinal: edicaoAPI.rodada_atual || 0,
        estatisticas: this.calcularEstatisticas(ranking, edicaoAPI),
        premios: premiosLiga,
      };
    });

    return {
      resultados,
      dadosBasicos,
      timestamp: Date.now(),
    };
  }

  // CALCULAR ESTATÍSTICAS DA EDIÇÃO
  calcularEstatisticas(ranking, edicao) {
    if (!ranking || ranking.length === 0) {
      return { participantes: 0, pontuacao_total: 0, media_geral: 0 };
    }

    const pontuacoes = ranking.map((t) => t.pontos);

    return {
      participantes: ranking.length,
      pontuacao_total: pontuacoes.reduce((acc, p) => acc + p, 0),
      media_geral: pontuacoes.reduce((acc, p) => acc + p, 0) / ranking.length,
      pontuacao_maxima: Math.max(...pontuacoes),
      pontuacao_minima: Math.min(...pontuacoes),
      vencedor: ranking[0],
      ultimo: ranking[ranking.length - 1],
      rodadas_edicao: (edicao.fim || 0) - (edicao.inicio || 0) + 1,
    };
  }

  // ATUALIZAR DADOS (limpa cache e re-busca)
  async atualizarDados() {
    console.log("[MELHOR-MES-CORE] Atualizando dados...");
    cacheAPI = null;
    cacheTimestamp = 0;
    return await this.inicializar(this.ligaId);
  }

  // OBTER DADOS DE EDIÇÃO ESPECÍFICA
  async obterDadosEdicao(indexEdicao) {
    if (!this.dadosProcessados.resultados) {
      await this.inicializar();
    }
    return this.dadosProcessados.resultados[indexEdicao] || null;
  }

  // OBTER VENCEDORES DE TODAS AS EDIÇÕES
  obterVencedores() {
    if (!this.dadosProcessados.resultados) {
      console.warn("[MELHOR-MES-CORE] Dados não processados ainda");
      return [];
    }

    const vencedores = [];

    Object.values(this.dadosProcessados.resultados).forEach((dados) => {
      if (dados.ranking && dados.ranking.length > 0 && dados.concluida) {
        vencedores.push({
          edicao: dados.edicao,
          vencedor: dados.ranking[0],
          status: dados.status,
          premio: dados.premios?.primeiro,
        });
      }
    });

    console.log(`[MELHOR-MES-CORE] ${vencedores.length} vencedores encontrados`);
    return vencedores;
  }

  // LIMPAR CACHE
  limparCacheAntigo() {
    if (cacheAPI && (Date.now() - cacheTimestamp) > CACHE_TTL) {
      cacheAPI = null;
      cacheTimestamp = 0;
    }
  }

  // DIAGNÓSTICO DO SISTEMA
  diagnosticar() {
    const stats = {
      ligaId: this.ligaId,
      ultimaRodada: this.ultimaRodadaCompleta,
      totalEdicoes: Object.keys(this.dadosProcessados.resultados || {}).length,
      cacheValido: cacheAPI && (Date.now() - cacheTimestamp) < CACHE_TTL,
      edicoesComDados: 0,
      edicoesConcluidas: 0,
    };

    if (this.dadosProcessados.resultados) {
      Object.values(this.dadosProcessados.resultados).forEach((dados) => {
        if (dados.ranking?.length > 0) stats.edicoesComDados++;
        if (dados.concluida) stats.edicoesConcluidas++;
      });
    }

    return stats;
  }
}

// INSTÂNCIA SINGLETON
export const melhorMesCore = new MelhorMesCore();

// FUNÇÕES DE CONVENIÊNCIA
export async function carregarDadosMelhorMes() {
  return await melhorMesCore.inicializar();
}

export async function obterVencedoresEdicoes() {
  return melhorMesCore.obterVencedores();
}

export async function obterDadosEdicao(index) {
  return await melhorMesCore.obterDadosEdicao(index);
}

export function limparCache() {
  cacheAPI = null;
  cacheTimestamp = 0;
  console.log("[MELHOR-MES-CORE] Cache limpo");
}

// AUTO-LIMPEZA DE CACHE
setInterval(() => {
  melhorMesCore.limparCacheAntigo();
}, CACHE_TTL);

console.log("[MELHOR-MES-CORE] ✅ Core business logic v2.0 carregado (API backend + edições dinâmicas)");
