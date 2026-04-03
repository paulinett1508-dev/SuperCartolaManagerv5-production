// MATA-MATA ORQUESTRADOR - Coordenador Principal v2.1
// ✅ v2.1: FIX CRÍTICO - Não salvar fase com pontos null no MongoDB (evita cache stale que bloqueia final)
// ✅ v1.8: FIX - Persistir fases intermediárias no MongoDB (evita oitavas/primeira órfãs)
// ✅ v1.5: Importa RODADA_FINAL_CAMPEONATO de season-config.js (elimina hardcode 38)
// Responsável por: coordenação de módulos, carregamento dinâmico, cache
// ✅ v1.4: FIX CRÍTICO - Verifica temporada da API antes de assumir dados anteriores
// ✅ v1.3: Detecção dinâmica de temporada (R1 + mercado aberto = temporada anterior)
// ✅ v1.2: Adiciona persistência no MongoDB ao calcular fases

import {
  edicoes,
  setEdicoes,
  getFaseInfo,
  getLigaId,
  getRodadaPontosText,
  getEdicaoMataMata,
  getFasesParaTamanho,
  getRodadaDaFase,
  TAMANHO_TORNEIO_DEFAULT,
  FASE_LABELS,
  FASE_NUM_JOGOS,
  setValoresFase,
  calcularTamanhoIdeal,
} from "./mata-mata-config.js";
import {
  setRankingFunction as setRankingConfronto,
  getPontosDaRodada,
  montarConfrontosPrimeiraFase,
  montarConfrontosFase,
  calcularValoresConfronto,
  extrairVencedores as extrairVencedoresFunc,
} from "./mata-mata-confrontos.js";
import { setRankingFunction as setRankingFinanceiro, setTamanhoTorneio as setTamanhoTorneioFinanceiro } from "./mata-mata-financeiro.js";
import {
  renderizarInterface,
  renderLoadingState,
  renderInstrucaoInicial,
  renderErrorState,
  renderTabelaMataMata,
  renderRodadaPendente,
  renderBannerCampeao,
  renderFaseBloqueada,
} from "./mata-mata-ui.js";
import { cacheManager } from "../core/cache-manager.js";
import { RODADA_FINAL_CAMPEONATO } from "../core/season-config.js";

// Fallback: garante escapeHtml disponível mesmo se escape-html.js não carregou antes
const _escapeHtml = (typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : function(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, function(ch) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
        });
    };

// Variáveis dinâmicas para rodadas
let getRankingRodadaEspecifica = null;
let rodadasCarregados = false;
let rodadasCarregando = false;

// Cache de módulos
const moduleCache = new Map();

// ✅ CACHE LOCAL DE PONTOS POR RODADA (evita buscas duplicadas)
const pontosRodadaCache = new Map();

// ✅ CACHE LOCAL DE RANKING BASE POR EDIÇÃO (evita buscas duplicadas)
const rankingBaseCache = new Map();

// ✅ CACHE LOCAL DE TAMANHO DO TORNEIO POR EDIÇÃO
const tamanhoTorneioCache = new Map();

// Configuração de cache persistente
const CACHE_CONFIG = {
  ttl: {
    confrontos: 30 * 60 * 1000, // 30 minutos
    edicao: 60 * 60 * 1000, // 1 hora
    rodadaConsolidada: Infinity, // Cache permanente para rodadas fechadas
  },
};

// Estado atual
let edicaoAtual = null;
let tamanhoTorneio = TAMANHO_TORNEIO_DEFAULT;
let rodadaAtualGlobal = 0; // ✅ Rodada atual do Brasileirão (para bloqueio de fases futuras)
let statusMercadoGlobal = null; // ✅ v2.2: Status do mercado para detecção de rodada ao vivo

// ✅ Cache de status do mercado (evita fetches duplicados)
let mercadoStatusCache = null;
let mercadoStatusTimestamp = 0;
const MERCADO_CACHE_TTL = 60 * 1000; // 1 minuto

async function getMercadoStatusCached() {
  const now = Date.now();
  if (mercadoStatusCache && (now - mercadoStatusTimestamp) < MERCADO_CACHE_TTL) {
    return mercadoStatusCache;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch("/api/cartola/mercado/status", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      mercadoStatusCache = await response.json();
      mercadoStatusTimestamp = now;
      return mercadoStatusCache;
    }
  } catch (err) {
    console.warn("[MATA-ORQUESTRADOR] Erro ao buscar status do mercado:", err.message);
  }
  return null;
}

// =====================================================================
// ✅ NOVA FUNÇÃO: PERSISTIR FASE NO MONGODB
// =====================================================================
async function salvarFaseNoMongoDB(
  ligaId,
  edicao,
  fase,
  confrontos,
  rodadaAtual,
) {
  try {
    console.log(`[MATA-ORQUESTRADOR] 💾 Salvando fase ${fase} no MongoDB...`);

    // 1. Buscar dados atuais do MongoDB
    let dadosAtuais = {};
    try {
      const resGet = await fetch(`/api/mata-mata/cache/${ligaId}/${edicao}`);
      if (resGet.ok) {
        const cacheAtual = await resGet.json();
        if (cacheAtual.cached && cacheAtual.dados) {
          dadosAtuais = cacheAtual.dados;
        }
      }
    } catch (err) {
      console.warn("[MATA-ORQUESTRADOR] Cache não existe ainda, criando novo");
    }

    // 2. Limpar fases stale que não pertencem ao tamanho atual do torneio
    // Ex: se reconfigurou de 32 para 8 times, remover "primeira" e "oitavas" stale
    const fasesValidas = getFasesParaTamanho(tamanhoTorneio);
    const todasFases = ["primeira", "oitavas", "quartas", "semis", "final"];
    for (const f of todasFases) {
      if (!fasesValidas.includes(f) && dadosAtuais[f]) {
        console.warn(`[MATA-ORQUESTRADOR] 🧹 Removendo fase stale "${f}" do cache (não pertence a torneio de ${tamanhoTorneio} times)`);
        delete dadosAtuais[f];
      }
    }

    // 3. Atualizar a fase calculada
    dadosAtuais[fase] = confrontos;

    // 5. Se for a final e tiver vencedor, salvar o campeão
    if (fase === "final" && confrontos.length > 0) {
      const confrontoFinal = confrontos[0];
      const pontosA = parseFloat(confrontoFinal.timeA?.pontos) || 0;
      const pontosB = parseFloat(confrontoFinal.timeB?.pontos) || 0;

      if (pontosA > 0 || pontosB > 0) {
        const campeao =
          pontosA > pontosB ? confrontoFinal.timeA : confrontoFinal.timeB;
        dadosAtuais.campeao = campeao;
      }
    }

    // 6. Adicionar metadata do tamanho calculado
    if (tamanhoTorneio) {
      dadosAtuais.metadata = {
        tamanhoTorneio: tamanhoTorneio,
        calculadoEm: new Date().toISOString()
      };
    }

    // 7. Salvar no MongoDB
    const resPost = await fetch(`/api/mata-mata/cache/${ligaId}/${edicao}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rodada: rodadaAtual,
        dados: dadosAtuais,
      }),
    });

    if (resPost.ok) {
      console.log(
        `[MATA-ORQUESTRADOR] ✅ Fase ${fase} salva no MongoDB com sucesso`,
      );
    } else {
      console.error(
        `[MATA-ORQUESTRADOR] ❌ Erro ao salvar fase ${fase}:`,
        await resPost.text(),
      );
    }
  } catch (error) {
    console.error(
      `[MATA-ORQUESTRADOR] ❌ Erro ao persistir fase ${fase}:`,
      error,
    );
  }
}

// ✅ FUNÇÃO PARA OBTER PONTOS COM CACHE LOCAL
async function getPontosDaRodadaCached(ligaId, rodada) {
  const cacheKey = `${ligaId}_${rodada}`;

  if (pontosRodadaCache.has(cacheKey)) {
    console.log(`[MATA-ORQUESTRADOR] 💾 Cache hit: pontos rodada ${rodada}`);
    return pontosRodadaCache.get(cacheKey);
  }

  const pontos = await getPontosDaRodada(ligaId, rodada);
  pontosRodadaCache.set(cacheKey, pontos);
  return pontos;
}

// ============================================================================
// BOTÃO CLASSIFICADOS — Admin
// Exibe o ranking da rodadaDefinicao da edição selecionada
// ============================================================================
async function mostrarClassificadosAdmin(ligaId) {
  const edicaoId = parseInt(document.getElementById('edicao-select')?.value);
  const edicaoSel = edicoes.find(e => e.id === edicaoId);
  const content = document.getElementById('mataMataContent');
  if (!edicaoSel || !content) return;

  const loading = document.createElement('div');
  loading.className = 'loading-state';
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  const loadingTxt = document.createElement('p');
  loadingTxt.textContent = 'Carregando classificados...';
  loading.append(spinner, loadingTxt);
  content.replaceChildren(loading);

  try {
    const ranking = await getRankingBaseCached(ligaId, edicaoSel.rodadaDefinicao);
    if (!ranking || ranking.length === 0) {
      const msg = document.createElement('p');
      msg.style.cssText = 'text-align:center;padding:24px;color:var(--text-secondary,#aaa)';
      msg.textContent = `Sem dados para a Rodada ${edicaoSel.rodadaDefinicao}.`;
      content.replaceChildren(msg);
      return;
    }

    const classificados = ranking.slice(0, tamanhoTorneio);

    const titulo = document.createElement('h3');
    titulo.style.cssText = 'text-align:center;margin-bottom:16px;color:var(--text-primary,#fff)';
    titulo.textContent = `Classificados — ${edicaoSel.nome} (R${edicaoSel.rodadaDefinicao})`;

    const subtitulo = document.createElement('p');
    subtitulo.style.cssText = 'text-align:center;font-size:0.85rem;color:var(--text-secondary,#aaa);margin-bottom:16px';
    subtitulo.textContent = `${classificados.length} de ${ranking.length} participantes classificados`;

    const ol = document.createElement('ol');
    ol.style.cssText = 'max-width:480px;margin:0 auto;padding:0 16px;list-style:none';

    classificados.forEach((t, idx) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.1))';

      const nome = document.createElement('span');
      nome.textContent = `${idx + 1}. ${t.nome_time || t.nome || '—'}`;

      const pts = document.createElement('span');
      pts.style.cssText = 'font-family:var(--font-mono,"JetBrains Mono",monospace);color:var(--text-secondary,#aaa);font-size:0.85rem';
      const v = t.pontos ?? 0;
      pts.textContent = `${(Math.trunc(v * 100) / 100).toFixed(2).replace('.', ',')} pts`;

      li.append(nome, pts);
      ol.appendChild(li);
    });

    content.replaceChildren(titulo, subtitulo, ol);
  } catch (e) {
    console.error('[MATA-ORQUESTRADOR] Erro ao carregar classificados:', e.message);
    const msg = document.createElement('p');
    msg.style.cssText = 'text-align:center;padding:24px;';
    msg.textContent = 'Erro ao carregar classificados.';
    content.replaceChildren(msg);
  }
}

// ✅ FUNÇÃO PARA OBTER RANKING BASE COM CACHE LOCAL
async function getRankingBaseCached(ligaId, rodadaDefinicao) {
  const cacheKey = `${ligaId}_base_${rodadaDefinicao}`;

  if (rankingBaseCache.has(cacheKey)) {
    console.log(
      `[MATA-ORQUESTRADOR] 💾 Cache hit: ranking base rodada ${rodadaDefinicao}`,
    );
    return rankingBaseCache.get(cacheKey);
  }

  console.log(
    `[MATA-ORQUESTRADOR] Buscando ranking base da Rodada ${rodadaDefinicao}...`,
  );

  const rankingBase = await Promise.race([
    getRankingRodadaEspecifica(ligaId, rodadaDefinicao),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao buscar ranking")), 10000),
    ),
  ]);

  rankingBaseCache.set(cacheKey, rankingBase);
  return rankingBase;
}

// ✅ FUNÇÃO PARA OBTER TAMANHO DO TORNEIO
// ✅ FIX: wizard_respostas.total_times é a FONTE DE VERDADE (teto autoritativo).
// O cache MongoDB pode ter valor stale (ex: 32) quando o admin já reconfigurou para 8.
async function getTamanhoTorneioCached(ligaId, edicao) {
  const cacheKey = `${ligaId}_tamanho_${edicao}`;

  // 0. Limite autoritativo: wizard total_times (se disponível)
  // tamanhoTorneio global já foi setado de wizard_respostas em carregarMataMata()
  const tetoWizard = (tamanhoTorneio && [8, 16, 32].includes(tamanhoTorneio))
    ? tamanhoTorneio
    : null;

  // 1. Verificar cache local
  if (tamanhoTorneioCache.has(cacheKey)) {
    const cached = tamanhoTorneioCache.get(cacheKey);
    // Respeitar teto do wizard (cache local pode estar stale)
    const resultado = tetoWizard ? Math.min(cached, tetoWizard) : cached;
    console.log(`[MATA-ORQUESTRADOR] 💾 Cache hit: tamanho edição ${edicao} = ${resultado}${tetoWizard && cached !== resultado ? ` (limitado pelo wizard: ${tetoWizard})` : ''}`);
    tamanhoTorneioCache.set(cacheKey, resultado);
    return resultado;
  }

  // 2. Buscar do MongoDB
  try {
    const resCache = await fetch(`/api/mata-mata/cache/${ligaId}/${edicao}`);
    if (resCache.ok) {
      const cacheData = await resCache.json();
      if (cacheData.cached) {
        let tamanhoDoMongo = Number(cacheData.dados?.tamanhoTorneio) ||
                               Number(cacheData.dados?.metadata?.tamanhoTorneio);

        if (tamanhoDoMongo && tamanhoDoMongo >= 8) {
          // ✅ FIX: Respeitar teto do wizard — cache pode ter valor stale
          if (tetoWizard && tamanhoDoMongo > tetoWizard) {
            console.warn(`[MATA-ORQUESTRADOR] ⚠️ Cache MongoDB tem tamanho ${tamanhoDoMongo} mas wizard diz ${tetoWizard} — usando wizard`);
            tamanhoDoMongo = tetoWizard;
          }
          tamanhoTorneioCache.set(cacheKey, tamanhoDoMongo);
          console.log(`[MATA-ORQUESTRADOR] Tamanho (MongoDB): ${tamanhoDoMongo}`);
          return tamanhoDoMongo;
        }
      }
    }
  } catch (err) {
    console.warn(`[MATA-ORQUESTRADOR] Erro ao buscar tamanho do MongoDB:`, err.message);
  }

  // 3. Se wizard tem valor, usar diretamente (sem precisar calcular)
  if (tetoWizard) {
    tamanhoTorneioCache.set(cacheKey, tetoWizard);
    console.log(`[MATA-ORQUESTRADOR] Tamanho do wizard: ${tetoWizard} (sem cache MongoDB)`);
    return tetoWizard;
  }

  // 4. Fallback: calcular localmente
  console.log(`[MATA-ORQUESTRADOR] Calculando tamanho localmente...`);
  const edicaoData = edicoes.find(e => e.id === edicao);
  if (!edicaoData) {
    console.warn(`[MATA-ORQUESTRADOR] Edição ${edicao} não encontrada`);
    return TAMANHO_TORNEIO_DEFAULT;
  }

  try {
    const rankingCompleto = await getRankingRodadaEspecifica(ligaId, edicaoData.rodadaDefinicao);
    const timesAtivos = rankingCompleto.filter(t => t.ativo !== false).length;
    const tamanhoCalculado = calcularTamanhoIdeal(timesAtivos);

    if (tamanhoCalculado > 0) {
      tamanhoTorneioCache.set(cacheKey, tamanhoCalculado);
      console.log(`[MATA-ORQUESTRADOR] Tamanho calculado: ${tamanhoCalculado} (${timesAtivos} ativos)`);
      return tamanhoCalculado;
    } else {
      console.warn(`[MATA-ORQUESTRADOR] Participantes insuficientes (${timesAtivos}), mínimo: 8`);
      return 0;
    }
  } catch (err) {
    console.error(`[MATA-ORQUESTRADOR] Erro ao calcular tamanho:`, err);
    return TAMANHO_TORNEIO_DEFAULT;
  }
}

// Função de carregamento dinâmico das rodadas
async function carregarRodadas() {
  if (rodadasCarregados) return true;
  if (rodadasCarregando) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (rodadasCarregados || !rodadasCarregando) {
          clearInterval(checkInterval);
          resolve(rodadasCarregados);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 5000);
    });
  }

  rodadasCarregando = true;

  try {
    if (moduleCache.has("rodadas")) {
      const cached = moduleCache.get("rodadas");
      getRankingRodadaEspecifica = cached.getRankingRodadaEspecifica;
      rodadasCarregados = true;
      return true;
    }

    console.log("[MATA-ORQUESTRADOR] Carregando módulo rodadas...");
    const rodadasModule = await import("../rodadas.js");

    if (rodadasModule && rodadasModule.getRankingRodadaEspecifica) {
      getRankingRodadaEspecifica = rodadasModule.getRankingRodadaEspecifica;

      // Injetar dependência nos módulos
      setRankingConfronto(getRankingRodadaEspecifica);
      setRankingFinanceiro(getRankingRodadaEspecifica);

      moduleCache.set("rodadas", { getRankingRodadaEspecifica });
      rodadasCarregados = true;
      console.log("[MATA-ORQUESTRADOR] Módulo rodadas carregado com sucesso");
      return true;
    } else {
      throw new Error("Função getRankingRodadaEspecifica não encontrada");
    }
  } catch (error) {
    console.error(
      "[MATA-ORQUESTRADOR] Erro ao carregar módulo rodadas:",
      error,
    );
    rodadasCarregados = false;
    return false;
  } finally {
    rodadasCarregando = false;
  }
}

// Função principal para carregar mata-mata
export async function carregarMataMata() {
  const container = document.getElementById("mata-mata");
  if (!container) return;

  console.log("[MATA-ORQUESTRADOR] Iniciando carregamento do mata-mata...");

  try {
    console.log("[MATA-ORQUESTRADOR] Pré-carregando dependências...");
    const rodadasOk = await carregarRodadas();
    if (!rodadasOk) {
      console.warn("[MATA-ORQUESTRADOR] Módulo rodadas não carregou");
    }
  } catch (error) {
    console.warn("[MATA-ORQUESTRADOR] Erro no pré-carregamento:", error);
  }

  const ligaId = getLigaId();

  // ✅ v3.0: Buscar config do admin (gerenciar-modulos) — fonte de verdade
  try {
    const resConfig = await fetch(`/api/liga/${ligaId}/modulos/mata_mata`);
    if (resConfig.ok) {
      const configData = await resConfig.json();
      const wizardRespostas = configData?.config?.wizard_respostas;

      console.log(`[MATA-ORQUESTRADOR] Config carregada do admin (gerenciar-modulos)`);

      // ✅ Valores financeiros da config da liga
      const valorVitoria = Number(wizardRespostas?.valor_vitoria);
      const valorDerrota = Number(wizardRespostas?.valor_derrota);
      if (valorVitoria > 0 && valorDerrota < 0) {
        setValoresFase(valorVitoria, valorDerrota);
        console.log(`[MATA-ORQUESTRADOR] Valores financeiros: vitória=${valorVitoria}, derrota=${valorDerrota}`);
      }

      // ✅ FIX: Usar total_times do wizard para definir tamanhoTorneio ANTES do render
      // Não mais defaultar para 32 (que mostra 5 fases ao invés de 3 para 8 times)
      const totalTimesWizard = Number(wizardRespostas?.total_times);
      if (totalTimesWizard && [8, 16, 32].includes(totalTimesWizard)) {
        tamanhoTorneio = totalTimesWizard;
        console.log(`[MATA-ORQUESTRADOR] tamanhoTorneio do wizard: ${tamanhoTorneio}`);
      }

      // ✅ FIX: Carregar edições do calendario_efetivo (gerado pelo admin)
      // Prioridade: calendario_override (dinâmico) > JSON default
      // Antes: lia de paths errados (configData.config.configuracao_override.calendario.edicoes → undefined)
      const calendario = configData?.calendario_efetivo;
      const qtdEdicoes = Number(wizardRespostas?.qtd_edicoes);
      if (Array.isArray(calendario) && calendario.length > 0) {
        const edicoesParaUsar = qtdEdicoes && qtdEdicoes >= 1 && qtdEdicoes <= 10
          ? calendario.slice(0, qtdEdicoes)
          : calendario;
        setEdicoes(edicoesParaUsar);
        console.log(`[MATA-ORQUESTRADOR] ${edicoesParaUsar.length} edições carregadas do admin config`);
      }
    }
  } catch (err) {
    console.warn("[MATA-ORQUESTRADOR] Erro ao buscar config do mata-mata:", err.message);
  }

  try {
    const data = await getMercadoStatusCached();

    if (data) {
      let rodadaAtual = data.rodada_atual || 1;
      const mercadoAberto = data.status_mercado === 1;
      const temporadaAPI = data.temporada || new Date().getFullYear();
      const anoAtual = new Date().getFullYear();
      // ✅ FIX: Usar nome diferente para evitar TDZ (const local não pode referenciar a si mesma)
      const rodadaFinalCamp = data.rodada_final || RODADA_FINAL_CAMPEONATO;

      // v1.4: Detecção dinâmica de temporada com verificação do ano
      if (rodadaAtual === 1 && mercadoAberto) {
        // Se API já retorna ano atual, NÃO há dados anteriores
        if (temporadaAPI >= anoAtual) {
          console.log("[MATA-ORQUESTRADOR] Temporada iniciando - nenhuma edição ativa ainda");
          edicoes.forEach((edicao) => {
            edicao.ativo = false;
          });
          renderizarAguardandoDados(container, ligaId);
          return;
        }
        // Pré-temporada real: usar rodada 38 da anterior
        console.log("[MATA-ORQUESTRADOR] Pré-temporada - usando rodada 38 da temporada anterior");
        rodadaAtual = rodadaFinalCamp;
      }

      // ✅ Guardar rodada atual global para bloqueio de fases futuras
      rodadaAtualGlobal = rodadaAtual;

      edicoes.forEach((edicao) => {
        edicao.ativo = rodadaAtual >= edicao.rodadaDefinicao;
      });
    } else {
      // Fallback: ativar todas as edições para temporada anterior
      rodadaAtualGlobal = RODADA_FINAL_CAMPEONATO;
      edicoes.forEach((edicao) => {
        edicao.ativo = true;
      });
    }
  } catch (error) {
    console.warn(
      "[MATA-ORQUESTRADOR] Erro ao verificar status do mercado:",
      error.message,
    );
    rodadaAtualGlobal = RODADA_FINAL_CAMPEONATO;
    edicoes.forEach((edicao) => {
      edicao.ativo = true;
    });
  }

  const fasesAtivas = getFasesParaTamanho(tamanhoTorneio);
  renderizarInterface(container, ligaId, handleEdicaoChange, handleFaseClick, fasesAtivas);

  // Wiring do botão Classificados do admin (injetado por renderizarInterface)
  document.getElementById('btnClassificadosAdmin')
    ?.addEventListener('click', () => mostrarClassificadosAdmin(ligaId));
}

// v1.4: Renderizar UI de aguardando dados
function renderizarAguardandoDados(container, ligaId) {
  if (!container) return;

  container.innerHTML = `
    <div class="mata-mata-aguardando">
      <span class="material-symbols-outlined mata-mata-aguardando-icon">account_tree</span>
      <h2 class="mata-mata-aguardando-titulo">Aguardando Início do Campeonato</h2>
      <p class="mata-mata-aguardando-texto">
        As chaves do Mata-Mata serão definidas quando as rodadas de classificação forem concluídas.
      </p>
    </div>
  `;
}

// =====================================================================
// PARCIAIS - Rodada de classificação em andamento
// =====================================================================

function renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao) {
  const edicaoNome = edicaoSelecionada.nome || `Edição ${edicaoId}`;

  contentElement.innerHTML = `
    <div class="mata-mata-aguardando-fase">
      <span class="material-symbols-outlined">schedule</span>
      <h4>Rodada de Classificação em Andamento</h4>
      <p>As chaves definitivas serão definidas após a Rodada ${rodadaDefinicao}.</p>
      <div class="parciais-actions">
        <button class="fase-btn parciais-btn" id="btnClassificadosParciais">
          <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">leaderboard</span>
          Classificados da ${edicaoNome}
          <span class="parciais-badge">PARCIAIS</span>
        </button>
        <button class="fase-btn parciais-btn" id="btnConfrontosParciais">
          <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">account_tree</span>
          Confrontos da 1ª Fase
          <span class="parciais-badge">PARCIAIS</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById("btnClassificadosParciais")?.addEventListener("click", () => {
    carregarClassificadosParciais(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
  });

  document.getElementById("btnConfrontosParciais")?.addEventListener("click", () => {
    carregarConfrontosParciais(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
  });
}

async function carregarClassificadosParciais(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao) {
  contentElement.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Buscando parciais...</p>
    </div>`;

  try {
    const res = await fetch(`/api/matchday/parciais/${ligaId}`);
    const data = res.ok ? await res.json() : null;

    if (!data || !data.disponivel) {
      const msg = data?.message || "Parciais não disponíveis no momento.";
      contentElement.innerHTML = `
        <div class="mata-mata-aguardando-fase">
          <span class="material-symbols-outlined">info</span>
          <h4>${msg}</h4>
          <div class="parciais-voltar">
            <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
          </div>
        </div>`;
      document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
        renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
      });
      return;
    }

    // Re-ordenar por pontos da rodada atual (não acumulado) para classificação MM
    const ranking = (data.ranking || [])
      .map(t => ({ ...t, _pontosRodada: t.pontos_rodada_atual ?? t.pontos ?? 0 }))
      .sort((a, b) => b._pontosRodada - a._pontosRodada);
    const classificados = ranking.slice(0, tamanhoTorneioVal);
    const eliminados = ranking.slice(tamanhoTorneioVal);
    const edicaoNome = edicaoSelecionada.nome || `Edição ${edicaoId}`;

    const rowsClassificados = classificados.map((t, i) => `
      <tr class="${i === tamanhoTorneioVal - 1 ? "parciais-cutoff" : ""}">
        <td class="jogo-cell">${i + 1}º</td>
        <td class="time-cell">
          <div class="time-info">
            <img src="/escudos/${t.clube_id}.png" class="escudo-img" onerror="this.onerror=null;this.src='/escudos/default.png'">
            <div class="time-details">
              <span class="time-nome">${_escapeHtml(t.nome_time || "—")}</span>
              <span class="time-cartoleiro">${_escapeHtml(t.nome_cartola || "—")}</span>
            </div>
          </div>
        </td>
        <td class="pontos-cell valor-positivo">
          <div class="pontos-valor">${(Math.trunc((t._pontosRodada||0) * 100) / 100).toFixed(2).replace(".", ",") || "0,00"}</div>
        </td>
      </tr>`).join("");

    const rowsEliminados = eliminados.slice(0, 5).map((t, i) => `
      <tr style="opacity:0.4;">
        <td class="jogo-cell">${tamanhoTorneioVal + i + 1}º</td>
        <td class="time-cell">
          <div class="time-info">
            <img src="/escudos/${t.clube_id}.png" class="escudo-img" onerror="this.onerror=null;this.src='/escudos/default.png'">
            <div class="time-details">
              <span class="time-nome">${_escapeHtml(t.nome_time || "—")}</span>
              <span class="time-cartoleiro">${_escapeHtml(t.nome_cartola || "—")}</span>
            </div>
          </div>
        </td>
        <td class="pontos-cell">
          <div class="pontos-valor">${(Math.trunc((t._pontosRodada||0) * 100) / 100).toFixed(2).replace(".", ",") || "0,00"}</div>
        </td>
      </tr>`).join("");

    contentElement.innerHTML = `
      <div class="parciais-header">
        <span class="parciais-live-badge">AO VIVO</span>
        <h4>Classificados — ${edicaoNome}</h4>
        <p>Top ${tamanhoTorneioVal} classificam para o Mata-Mata (Rodada ${data.rodada})</p>
      </div>
      <div class="mata-mata-table-container">
        <table class="mata-mata-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th class="pontos-cell">Pts</th>
            </tr>
          </thead>
          <tbody>
            ${rowsClassificados}
            ${rowsEliminados}
          </tbody>
        </table>
      </div>
      <div class="parciais-voltar">
        <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
      </div>`;

    document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
      renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
    });

    console.log(`[MATA-ORQUESTRADOR] Classificados parciais: ${classificados.length}/${ranking.length} times`);
  } catch (err) {
    console.error("[MATA-ORQUESTRADOR] Erro ao buscar parciais:", err);
    contentElement.innerHTML = `
      <div class="mata-mata-aguardando-fase">
        <span class="material-symbols-outlined">error</span>
        <h4>Erro ao buscar parciais</h4>
        <p>${err.message}</p>
        <div class="parciais-voltar">
          <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
        </div>
      </div>`;
    document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
      renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
    });
  }
}

async function carregarConfrontosParciais(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao) {
  contentElement.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Buscando parciais para montar confrontos...</p>
    </div>`;

  try {
    const res = await fetch(`/api/matchday/parciais/${ligaId}`);
    const data = res.ok ? await res.json() : null;

    if (!data || !data.disponivel) {
      const msg = data?.message || "Parciais não disponíveis no momento.";
      contentElement.innerHTML = `
        <div class="mata-mata-aguardando-fase">
          <span class="material-symbols-outlined">info</span>
          <h4>${msg}</h4>
          <div class="parciais-voltar">
            <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
          </div>
        </div>`;
      document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
        renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
      });
      return;
    }

    // Re-ordenar por pontos da rodada atual (não acumulado) para classificação MM
    const ranking = (data.ranking || [])
      .map(t => ({ ...t, _pontosRodada: t.pontos_rodada_atual ?? t.pontos ?? 0 }))
      .sort((a, b) => b._pontosRodada - a._pontosRodada);
    if (ranking.length < tamanhoTorneioVal) {
      contentElement.innerHTML = `
        <div class="mata-mata-aguardando-fase">
          <span class="material-symbols-outlined">group</span>
          <h4>Dados insuficientes</h4>
          <p>${ranking.length} de ${tamanhoTorneioVal} times encontrados nas parciais.</p>
          <div class="parciais-voltar">
            <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
          </div>
        </div>`;
      document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
        renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
      });
      return;
    }

    // Transformar ranking parcial para formato do montarConfrontosPrimeiraFase
    const rankingSlice = ranking.slice(0, tamanhoTorneioVal).map((t, i) => ({
      timeId: String(t.timeId),
      nome_time: t.nome_time,
      nome_cartoleiro: t.nome_cartola,
      clube_id: t.clube_id,
      pontos: t._pontosRodada,
      posicao: i + 1,
    }));

    const confrontos = montarConfrontosPrimeiraFase(rankingSlice, {}, tamanhoTorneioVal);
    const fasesAtivas = getFasesParaTamanho(tamanhoTorneioVal);
    const primeiraFase = fasesAtivas[0];
    calcularValoresConfronto(confrontos, true, primeiraFase);

    const faseLabel = FASE_LABELS[primeiraFase] || primeiraFase.toUpperCase();
    renderTabelaMataMata(confrontos, "mataMataContent", faseLabel, edicaoId, true);

    // Inserir badge AO VIVO antes da tabela
    contentElement.insertAdjacentHTML("afterbegin", `
      <div class="parciais-header">
        <span class="parciais-live-badge">AO VIVO</span>
        <h4>Confrontos da ${faseLabel} — ${_escapeHtml(edicaoSelecionada.nome || "Edição " + edicaoId)} (Rodada ${edicaoSelecionada.rodadaInicial})</h4>
        <p>Projeção baseada nas parciais da Rodada ${data.rodada} (classificatória). Sujeito a alteração.</p>
      </div>
    `);

    // Inserir botão Voltar
    contentElement.insertAdjacentHTML("beforeend", `
      <div class="parciais-voltar">
        <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
      </div>
    `);

    document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
      renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
    });

    console.log(`[MATA-ORQUESTRADOR] Confrontos parciais: ${confrontos.length} jogos montados`);
  } catch (err) {
    console.error("[MATA-ORQUESTRADOR] Erro ao montar confrontos parciais:", err);
    contentElement.innerHTML = `
      <div class="mata-mata-aguardando-fase">
        <span class="material-symbols-outlined">error</span>
        <h4>Erro ao montar confrontos</h4>
        <p>${err.message}</p>
        <div class="parciais-voltar">
          <button class="fase-btn" id="btnVoltarParciais">← Voltar</button>
        </div>
      </div>`;
    document.getElementById("btnVoltarParciais")?.addEventListener("click", () => {
      renderParciaisOptions(contentElement, ligaId, edicaoId, edicaoSelecionada, tamanhoTorneioVal, rodadaDefinicao);
    });
  }
}

// Handler para mudança de edição
async function handleEdicaoChange(novaEdicao, _faseIgnorada, ligaId) {
  edicaoAtual = novaEdicao;
  // ✅ Limpar caches locais ao trocar de edição
  pontosRodadaCache.clear();
  rankingBaseCache.clear();

  // Mostrar botão Classificados ao selecionar uma edição
  const btnClassif = document.getElementById('btnClassificadosAdmin');
  if (btnClassif) btnClassif.style.display = '';

  // ✅ v1.5: Calcular tamanho ANTES de carregar fase para atualizar navegação
  const tamanhoCalculado = await getTamanhoTorneioCached(ligaId, novaEdicao);

  if (tamanhoCalculado > 0 && tamanhoCalculado !== tamanhoTorneio) {
    console.log(`[MATA-ORQUESTRADOR] Tamanho mudou: ${tamanhoTorneio} → ${tamanhoCalculado}`);
    tamanhoTorneio = tamanhoCalculado;
  }

  // ✅ FIX: Sempre atualizar nav com disabled states corretos para a nova edição.
  // Antes: só atualizava se tamanho mudasse → fase vinda do UI era calculada com nav desatualizado.
  const fasesReais = getFasesParaTamanho(tamanhoTorneio);
  atualizarNavegacaoFases(fasesReais);

  // ✅ FIX: Recomputar fase a partir do nav já atualizado (não usar _faseIgnorada do UI).
  // _faseIgnorada foi calculada antes do update → poderia ser "final" mesmo estando em rodada 9.
  const faseNav = document.querySelector('.fase-nav');
  const botoesDisponiveis = faseNav
    ? Array.from(faseNav.querySelectorAll('.fase-btn:not(.disabled)'))
    : [];
  const fase = botoesDisponiveis.length > 0
    ? botoesDisponiveis[botoesDisponiveis.length - 1].getAttribute('data-fase')
    : (fasesReais[0] || 'primeira');

  // Marcar botão ativo
  faseNav?.querySelectorAll('.fase-btn').forEach(b => b.classList.remove('active'));
  faseNav?.querySelector(`.fase-btn[data-fase="${fase}"]`)?.classList.add('active');

  console.log(`[MATA-ORQUESTRADOR] Edição ${novaEdicao}: carregando fase=${fase} (rodadaAtual=${rodadaAtualGlobal})`);
  carregarFase(fase, ligaId);
}

// ✅ v1.5: Atualizar botões de navegação de fases dinamicamente
// ✅ v1.7: Desabilitar botões de fases cuja rodada não chegou (bloqueio visual)
function atualizarNavegacaoFases(fasesAtivas) {
  const faseNav = document.querySelector('.fase-nav');
  if (!faseNav) return;

  // Calcular rodada de cada fase para bloqueio
  const edicaoSelect = document.getElementById('edicao-select');
  const edicaoId = edicaoSelect ? parseInt(edicaoSelect.value) : null;
  const edicaoSelecionada = edicaoId ? edicoes.find(e => e.id === edicaoId) : null;

  const botoesHtml = fasesAtivas
    .map((fase, idx) => {
      // ✅ Verificar se a rodada desta fase já chegou
      let isDisabled = false;
      if (edicaoSelecionada && rodadaAtualGlobal > 0) {
        // ✅ Ler rodada do calendário fixo salvo no banco (não recalcular)
        const rodadaDaFase = getRodadaDaFase(edicaoSelecionada, fase, tamanhoTorneio);
        isDisabled = rodadaAtualGlobal < rodadaDaFase;
      }
      const disabledClass = isDisabled ? " disabled" : "";
      const lockIcon = isDisabled ? ' 🔒' : '';
      return `<button class="fase-btn${idx === 0 && !isDisabled ? " active" : ""}${disabledClass}" data-fase="${fase}" ${isDisabled ? 'title="Aguardando rodada"' : ''}>${FASE_LABELS[fase] || fase.toUpperCase()}${lockIcon}</button>`;
    })
    .join("\n");

  faseNav.innerHTML = botoesHtml;

  // Re-bind event listeners
  faseNav.querySelectorAll('.fase-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // ✅ Bloquear clique em fases desabilitadas
      if (this.classList.contains('disabled')) {
        console.warn(`[MATA-ORQUESTRADOR] Fase bloqueada: ${this.getAttribute('data-fase')}`);
        return;
      }

      const edicaoSelect = document.getElementById('edicao-select');
      const edicao = edicaoSelect ? parseInt(edicaoSelect.value) : null;

      if (!edicao) {
        console.warn('[MATA-ORQUESTRADOR] Nenhuma edição selecionada');
        return;
      }

      faseNav.querySelectorAll('.fase-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const fase = this.getAttribute('data-fase');
      handleFaseClick(fase, edicao);
    });
  });

  // Atualizar data attribute da primeira fase
  const container = document.getElementById('mata-mata');
  if (container) {
    container.dataset.primeiraFase = fasesAtivas[0];
  }

  console.log(`[MATA-ORQUESTRADOR] Navegação atualizada: ${fasesAtivas.join(', ')} (rodadaAtual=${rodadaAtualGlobal})`);
}

// Handler para clique em fase
function handleFaseClick(fase, edicao) {
  edicaoAtual = edicao;
  const ligaId = getLigaId();
  carregarFase(fase, ligaId);
}

// Função auxiliar para cache de confrontos
async function getCachedConfrontos(ligaId, edicao, fase, rodadaPontos) {
  const cacheKey = `matamata_confrontos_${ligaId}_${edicao}_${fase}_${rodadaPontos}`;

  return await cacheManager.get("rodadas", cacheKey, null, {
    ttl: CACHE_CONFIG.ttl.confrontos,
  });
}

async function setCachedConfrontos(
  ligaId,
  edicao,
  fase,
  rodadaPontos,
  confrontos,
) {
  const cacheKey = `matamata_confrontos_${ligaId}_${edicao}_${fase}_${rodadaPontos}`;

  await cacheManager.set("rodadas", cacheKey, confrontos);
  console.log(
    `[MATA-ORQUESTRADOR] Confrontos salvos em cache local: ${cacheKey}`,
  );
}

// Função para carregar uma fase específica
async function carregarFase(fase, ligaId) {
  const contentId = "mataMataContent";
  const contentElement = document.getElementById(contentId);

  if (!contentElement) {
    console.error("[MATA-ORQUESTRADOR] Elemento de conteúdo não encontrado");
    return;
  }

  console.log(`[MATA-ORQUESTRADOR] Carregando fase: ${fase}`);

  renderLoadingState(contentId, fase, edicaoAtual);

  try {
    const rodadasOk = await carregarRodadas();

    if (!rodadasOk) {
      throw new Error(
        "Módulo rodadas não disponível - não é possível calcular confrontos",
      );
    }

    if (!edicaoAtual) {
      renderInstrucaoInicial(contentId);
      return;
    }

    let rodada_atual = 1;
    let isTemporadaAnterior = false;
    try {
      const data = await getMercadoStatusCached();

      if (data) {
        rodada_atual = data.rodada_atual || 1;
        const mercadoAberto = data.status_mercado === 1;
        statusMercadoGlobal = data.status_mercado; // ✅ v2.2: Capturar para detecção isLive
        const temporadaAPI = data.temporada || new Date().getFullYear();
        const anoAtual = new Date().getFullYear();
        // ✅ FIX: Usar nome diferente para evitar TDZ (const local não pode referenciar a si mesma)
        const rodadaFinalCamp = data.rodada_final || RODADA_FINAL_CAMPEONATO;

        // v1.4: Detecção dinâmica de temporada com verificação do ano
        if (rodada_atual === 1 && mercadoAberto) {
          if (temporadaAPI >= anoAtual) {
            console.log("[MATA-ORQUESTRADOR] Temporada iniciando - sem dados para calcular fases");
            rodada_atual = 0;
            isTemporadaAnterior = false;
          } else {
            console.log("[MATA-ORQUESTRADOR] Pré-temporada - usando rodada 38 para cálculo de fases");
            rodada_atual = rodadaFinalCamp;
            isTemporadaAnterior = true;
          }
        }
      } else {
        // ✅ v2.1 FIX: Fallback para rodadaAtualGlobal quando mercado indisponível
        statusMercadoGlobal = null; // ✅ v2.2: Desconhecido = conservador (não isLive)
        if (rodadaAtualGlobal > 0) {
          rodada_atual = rodadaAtualGlobal;
          console.warn(`[MATA-ORQUESTRADOR] Mercado indisponível, usando rodadaAtualGlobal=${rodadaAtualGlobal}`);
        } else {
          rodada_atual = 0;
        }
      }
    } catch (err) {
      console.warn("[MATA-ORQUESTRADOR] Erro ao buscar mercado:", err.message);
      // ✅ v2.1 FIX: Fallback para rodadaAtualGlobal quando mercado dá timeout
      statusMercadoGlobal = null; // ✅ v2.2: Desconhecido = conservador (não isLive)
      if (rodadaAtualGlobal > 0) {
        rodada_atual = rodadaAtualGlobal;
        console.warn(`[MATA-ORQUESTRADOR] Usando rodadaAtualGlobal=${rodadaAtualGlobal} como fallback`);
      } else {
        rodada_atual = 0;
      }
      isTemporadaAnterior = false;
    }

    // ✅ v1.7: Sincronizar rodada global para bloqueio de fases
    if (rodada_atual > 0) {
      rodadaAtualGlobal = rodada_atual;
    }

    const edicaoSelecionada = edicoes.find((e) => e.id === edicaoAtual);
    if (!edicaoSelecionada) {
      throw new Error(`Edição ${edicaoAtual} não encontrada.`);
    }

    const rodadaDefinicao = edicaoSelecionada.rodadaDefinicao;

    // FIX-1: Guard pré-temporada - não buscar ranking se temporada não iniciou
    if (rodada_atual === 0) {
      contentElement.innerHTML = `
        <div class="mata-mata-aguardando-fase">
          <span class="material-symbols-outlined">hourglass_empty</span>
          <h4>Temporada ainda não iniciou</h4>
          <p>Os confrontos serão calculados quando as rodadas começarem.</p>
        </div>`;
      return;
    }

    // ✅ v2.0: Buscar tamanho calculado do cache MongoDB ANTES de qualquer cálculo
    const tamanhoCalculado = await getTamanhoTorneioCached(ligaId, edicaoAtual);
    if (tamanhoCalculado === 0) {
      contentElement.innerHTML = `
        <div class="mata-mata-aguardando-fase">
          <span class="material-symbols-outlined">group_off</span>
          <h4>Participantes insuficientes</h4>
          <p>O Mata-Mata requer no mínimo 8 participantes ativos.</p>
        </div>`;
      return;
    }

    // Atualizar tamanho global
    tamanhoTorneio = tamanhoCalculado;
    setTamanhoTorneioFinanceiro(tamanhoTorneio);

    if (rodada_atual <= rodadaDefinicao) {
      renderParciaisOptions(contentElement, ligaId, edicaoAtual, edicaoSelecionada, tamanhoTorneio, rodadaDefinicao);
      return;
    }

    // ✅ USA CACHE LOCAL PARA RANKING BASE
    const rankingBase = await getRankingBaseCached(ligaId, rodadaDefinicao);

    console.log(
      `[MATA-ORQUESTRADOR] Ranking base recebido: ${rankingBase?.length || 0} times`,
    );

    if (!Array.isArray(rankingBase) || rankingBase.length < tamanhoTorneio) {
      throw new Error(
        `Ranking base inválido: ${rankingBase?.length || 0}/${tamanhoTorneio} times encontrados`,
      );
    }

    const faseInfo = getFaseInfo(edicaoAtual, edicaoSelecionada, tamanhoTorneio);
    const currentFaseInfo = faseInfo[fase.toLowerCase()];
    if (!currentFaseInfo) throw new Error(`Fase desconhecida: ${fase}`);

    const {
      label: faseLabel,
      pontosRodada: rodadaPontosNum,
      numJogos,
      prevFaseRodada,
    } = currentFaseInfo;

    let isPending = rodada_atual < rodadaPontosNum;
    // ✅ v2.3: 3 estados — isPending (futura), isLive (não finalizada), isConcluded (encerrada)
    // status_mercado: 1=aberto (não jogou), 2=jogos rolando, 3=processando, 4=finalizada, 6=temporada fim
    // Quando rodada_atual === rodadaPontosNum, só é "concluída" se status=4/6 ou fallback (null)
    const isLive = !isPending && rodada_atual === rodadaPontosNum && [1, 2, 3].includes(statusMercadoGlobal);
    const isConcluded = !isPending && !isLive;
    console.log(
      `[MATA-ORQUESTRADOR] Rodada ${rodadaPontosNum} - Status: ${isPending ? "Pendente" : isLive ? "AO VIVO" : "Concluída"}`,
    );

    // ✅ v1.9: BLOQUEAR fases cujos classificados ainda não são conhecidos
    // Se prevFaseRodada já aconteceu, podemos mostrar os classificados em modo pendente
    if (isPending) {
      if (!prevFaseRodada || rodada_atual <= prevFaseRodada) {
        console.log(`[MATA-ORQUESTRADOR] 🔒 Fase ${fase} bloqueada - Rodada ${rodadaPontosNum} ainda não aconteceu (atual: ${rodada_atual})`);
        renderFaseBloqueada("mataMataContent", faseLabel, rodadaPontosNum);
        return;
      }
      console.log(`[MATA-ORQUESTRADOR] ⏳ Fase ${fase} pendente - exibindo classificados (fase anterior encerrada na rodada ${prevFaseRodada})`);
    }

    // ✅ TENTAR CACHE PRIMEIRO (apenas para rodadas consolidadas, NUNCA ao vivo)
    if (isConcluded) {
      const cachedConfrontos = await getCachedConfrontos(
        ligaId,
        edicaoAtual,
        fase,
        rodadaPontosNum,
      );

      if (cachedConfrontos) {
        console.log(`[MATA-ORQUESTRADOR] 💾 Confrontos recuperados do cache`);
        calcularValoresConfronto(cachedConfrontos, false, fase);
        renderTabelaMataMata(
          cachedConfrontos,
          contentId,
          faseLabel,
          edicaoAtual,
          isPending,
          rodadaPontosNum,
          false, // isLive=false — dados do cache são sempre de rodadas concluídas
        );

        if (fase === "final" && cachedConfrontos.length > 0) {
          const edicaoNome = edicaoSelecionada.nome;
          renderBannerCampeao(
            contentId,
            cachedConfrontos[0],
            edicaoNome,
            isPending,
            false, // isLive=false
          );
        }

        return; // ✅ RETORNA CEDO COM CACHE (MongoDB já tem os dados se cache local existe)
      }
    }

    // ❌ CACHE MISS - CALCULAR
    let timesParaConfronto = rankingBase;
    if (prevFaseRodada) {
      let vencedoresAnteriores = rankingBase;

      const fasesDoTorneio = getFasesParaTamanho(tamanhoTorneio);
      const primeiraFaseKey = fasesDoTorneio[0];

      for (let r = edicaoSelecionada.rodadaInicial; r <= prevFaseRodada; r++) {
        // ✅ USAR CACHE LOCAL PARA EVITAR BUSCAS DUPLICADAS
        const pontosDaRodadaAnterior = await getPontosDaRodadaCached(ligaId, r);
        const idxRodada = r - edicaoSelecionada.rodadaInicial;
        const faseAnterior = fasesDoTorneio[idxRodada];
        const jogosFaseAnterior = FASE_NUM_JOGOS[faseAnterior] || 1;
        const confrontosAnteriores =
          r === edicaoSelecionada.rodadaInicial && faseAnterior === primeiraFaseKey
            ? montarConfrontosPrimeiraFase(rankingBase, pontosDaRodadaAnterior, tamanhoTorneio)
            : montarConfrontosFase(
                vencedoresAnteriores,
                pontosDaRodadaAnterior,
                jogosFaseAnterior,
              );
        // ✅ v1.8: Persistir fase intermediária no MongoDB (evita fases órfãs quando admin pula fases)
        await salvarFaseNoMongoDB(ligaId, edicaoAtual, faseAnterior, confrontosAnteriores, rodada_atual);
        vencedoresAnteriores = await extrairVencedores(confrontosAnteriores);
      }
      timesParaConfronto = vencedoresAnteriores;
    }

    // ✅ v1.9: Fase pendente com classificados conhecidos usa pontos vazios
    // Fase concluída busca pontos normalmente
    const pontosRodadaAtual = isPending ? {} : await getPontosDaRodadaCached(ligaId, rodadaPontosNum);

    const fasesDoTorneioCalc = getFasesParaTamanho(tamanhoTorneio);
    const primeiraFaseCalc = fasesDoTorneioCalc[0];
    const confrontos =
      fase === primeiraFaseCalc
        ? montarConfrontosPrimeiraFase(rankingBase, pontosRodadaAtual, tamanhoTorneio)
        : montarConfrontosFase(timesParaConfronto, pontosRodadaAtual, numJogos);

    // ✅ v1.9/v2.2: Session cache apenas para rodadas concluídas (nunca isPending ou isLive)
    if (isConcluded) {
      await setCachedConfrontos(
        ligaId,
        edicaoAtual,
        fase,
        rodadaPontosNum,
        confrontos,
      );
    }

    // ✅ v2.1 FIX: NÃO salvar no MongoDB quando a fase atual tem pontos null
    // Confrontos com pts null (rodada ao vivo/pendente) bloqueiam o recálculo posterior
    // Fases anteriores (já consolidadas no loop acima) são salvas normalmente via salvarFaseNoMongoDB
    const confrontosTemPontosReais = confrontos.every(c =>
      typeof c.timeA?.pontos === 'number' && typeof c.timeB?.pontos === 'number'
    );

    if (confrontosTemPontosReais && !isLive) {
      await salvarFaseNoMongoDB(
        ligaId,
        edicaoAtual,
        fase,
        confrontos,
        rodada_atual,
      );
    } else {
      console.warn(`[MATA-ORQUESTRADOR] ⚠️ Fase ${fase} com pontos null — NÃO salvando no MongoDB (evita cache stale)`);
    }

    // Calcular valores dos confrontos (isPending ou isLive → valores=0)
    calcularValoresConfronto(confrontos, isPending || isLive, fase);

    // Renderizar tabela (rodadaPontosNum garante texto correto independente do tamanho do torneio)
    renderTabelaMataMata(
      confrontos,
      contentId,
      faseLabel,
      edicaoAtual,
      isPending,
      rodadaPontosNum,
      isLive,
    );

    // Renderizar banner do campeão na FINAL apenas quando rodada CONCLUÍDA (nunca ao vivo)
    if (fase === "final" && confrontos.length > 0 && isConcluded) {
      const edicaoNome = edicaoSelecionada.nome;
      renderBannerCampeao(contentId, confrontos[0], edicaoNome, false, false);
      console.log(
        `[MATA-ORQUESTRADOR] Banner do campeão renderizado para ${edicaoNome}`,
      );
    }

    console.log(`[MATA-ORQUESTRADOR] Fase ${fase} carregada com sucesso`);
  } catch (err) {
    console.error(`[MATA-ORQUESTRADOR] Erro ao carregar fase ${fase}:`, err);
    renderErrorState(contentId, fase, err);
  }
}

// Função wrapper para extrair vencedores (usa import estático)
function extrairVencedores(confrontos) {
  return extrairVencedoresFunc(confrontos);
}

// Cleanup global para evitar memory leaks
function setupCleanup() {
  window.addEventListener("beforeunload", () => {
    moduleCache.clear();
    pontosRodadaCache.clear();
    rankingBaseCache.clear();
    mercadoStatusCache = null;
    statusMercadoGlobal = null;
    rodadasCarregados = false;
    console.log("[MATA-ORQUESTRADOR] Cleanup executado");
  });

  // Interceptar erros de Promise não tratadas
  window.addEventListener("unhandledrejection", (event) => {
    if (
      event.reason &&
      event.reason.message &&
      event.reason.message.includes("message channel closed")
    ) {
      event.preventDefault();
    }
  });
}

// ✅ v1.9: Escutar evento de consolidação para invalidar caches e recalcular
window.addEventListener('consolidacao-detectada', (event) => {
  const rodadaConsolidada = event.detail?.rodada;
  console.log(`[MATA-ORQUESTRADOR] 🔄 Consolidação detectada: R${rodadaConsolidada} — invalidando caches`);

  // Limpar todos os caches locais para forçar recálculo
  pontosRodadaCache.clear();
  rankingBaseCache.clear();
  tamanhoTorneioCache.clear();
  mercadoStatusCache = null;
  mercadoStatusTimestamp = 0;
  statusMercadoGlobal = null;

  // Recarregar mata-mata se a tela estiver visível
  const container = document.getElementById("mata-mata");
  if (container && container.offsetParent !== null) {
    console.log(`[MATA-ORQUESTRADOR] 🔄 Tela visível — recarregando mata-mata`);
    carregarMataMata();
  }
});

// Inicialização do módulo
setupCleanup();

console.log("[MATA-ORQUESTRADOR] Módulo v1.9 carregado - Consolidação automática + bloqueio de fases futuras");
