// RODADAS UI - Interface e Renderização
// ✅ v2.5: FIX - Usar configs dinâmicas do servidor (wizard) em vez de hardcoded
// ✅ v2.4: FIX - Rodada 38 mostra "Encerrada" quando campeonato acabou
// ✅ v2.3: Tabelas contextuais por rodada (valores de banco e labels de posição)
// Responsável por: renderização de componentes, manipulação DOM, eventos

import {
  POSICAO_CONFIG,
  LIGAS_CONFIG,
  getBancoPorRodada,
  getBancoPorRodadaAsync,
  getFaixasPorRodadaAsync,
  RODADA_TRANSICAO_SOBRAL,
} from "./rodadas-config.js";
import { RODADA_FINAL_CAMPEONATO } from "../config/seasons-client.js";

import { getStatusMercado } from "./rodadas-core.js";

// Cache de elementos DOM para performance
const elementsCache = new Map();

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Estado da interface
let rodadaAtualSelecionada = null;

// Função para cache de elementos DOM
function getElement(id) {
  if (!elementsCache.has(id)) {
    elementsCache.set(id, document.getElementById(id));
  }
  return elementsCache.get(id);
}

// ==============================
// ✅ v2.4: VERIFICAÇÃO DE TEMPORADA ENCERRADA
// ==============================

/**
 * Verifica se a temporada do Cartola está encerrada
 * @param {number} rodada_atual - Rodada atual da API
 * @param {number} status_mercado - Status do mercado (1=aberto, 2=fechado em andamento, 4/6=encerrado)
 * @returns {boolean} - True se temporada encerrada
 */
function isTemporadaEncerrada(rodada_atual, status_mercado) {
  // Se não é a última rodada, temporada não encerrou
  if (rodada_atual < RODADA_FINAL_CAMPEONATO) return false;

  // Status do mercado Cartola FC:
  // 1 = Mercado aberto
  // 2 = Mercado fechado (rodada em andamento - jogos acontecendo)
  // 3 = Rodada em processamento
  // 4 = Mercado fechado (aguardando próxima rodada)
  // 6 = Final de temporada / Temporada encerrada

  // Se é rodada 38 e mercado não está em andamento (status != 2), temporada encerrou
  // Status 2 significa "jogos em andamento", então ainda é parcial
  // Qualquer outro status (4, 6, etc) na rodada 38 significa temporada encerrada
  const mercadoEmAndamento = status_mercado === 2;

  return !mercadoEmAndamento;
}

/**
 * Verifica se uma rodada específica está consolidada (finalizada)
 * @param {number} rodada - Número da rodada
 * @param {number} rodada_atual - Rodada atual da API
 * @param {number} status_mercado - Status do mercado
 * @param {number} temporadaMercado - Temporada do mercado (opcional)
 * @returns {boolean} - True se rodada está consolidada
 */
export function isRodadaConsolidada(rodada, rodada_atual, status_mercado, temporadaMercado = null) {
  // ✅ v2.5: Se visualizando temporada passada, todas rodadas estão consolidadas
  if (temporadaMercado) {
    const urlParams = new URLSearchParams(window.location.search);
    const temporadaParam = urlParams.get("temporada");

    // Param explícito de temporada passada
    if (temporadaParam && parseInt(temporadaParam) < temporadaMercado) {
      return true;
    }

    // ✅ v2.6: Detecção automática - mercado R1 aberto = temporada anterior
    const mercadoAberto = status_mercado === 1;
    if (!temporadaParam && rodada_atual === 1 && mercadoAberto) {
      return true;
    }
  }

  // Rodadas anteriores à atual sempre estão consolidadas
  if (rodada < rodada_atual) return true;

  // Rodada atual só está consolidada se temporada encerrou
  if (rodada === rodada_atual && rodada === RODADA_FINAL_CAMPEONATO) {
    return isTemporadaEncerrada(rodada_atual, status_mercado);
  }

  return false;
}

// ==============================
// RENDERIZAÇÃO DE MINI CARDS
// ==============================

// RENDERIZAR MINI CARDS DAS RODADAS
export async function renderizarMiniCardsRodadas() {
  console.log("[RODADAS-UI] renderizarMiniCardsRodadas iniciada");

  const cardsContainer = getElement("rodadasCards");
  console.log(
    "[RODADAS-UI] Container rodadasCards encontrado:",
    !!cardsContainer,
  );

  if (!cardsContainer) {
    console.error("[RODADAS-UI] Container rodadasCards não encontrado!");
    return;
  }

  const { rodada_atual, status_mercado, temporada: temporadaMercado } = getStatusMercado();
  console.log("[RODADAS-UI] Status do mercado:", {
    rodada_atual,
    status_mercado,
    temporadaMercado,
  });

  // ✅ v2.6: Variáveis de status
  const mercadoAberto = status_mercado === 1;

  // ✅ v2.5: Detectar se está visualizando temporada passada
  const urlParams = new URLSearchParams(window.location.search);
  const temporadaParam = urlParams.get("temporada");
  const temporadaVisualizando = temporadaParam ? parseInt(temporadaParam) : null;

  // Se temporada na URL é menor que temporada do mercado, é temporada passada
  // ✅ v2.6: Se não tem param mas mercado está na rodada 1 com mercado ABERTO,
  // a nova temporada ainda não começou - mostrar dados da temporada anterior
  let isTemporadaPassada = false;
  if (temporadaVisualizando) {
    isTemporadaPassada = temporadaVisualizando < temporadaMercado;
  } else if (temporadaMercado && rodada_atual === 1 && mercadoAberto) {
    // Nova temporada ainda não começou - dados existentes são da anterior
    isTemporadaPassada = true;
    console.log("[RODADAS-UI] Detecção automática: T" + temporadaMercado + " R1 mercado aberto - exibindo temporada " + (temporadaMercado - 1));
  }

  console.log("[RODADAS-UI] Temporada visualizando:", temporadaVisualizando || (isTemporadaPassada ? temporadaMercado - 1 : temporadaMercado), "Passada:", isTemporadaPassada);
  const temporadaEncerrada = isTemporadaEncerrada(rodada_atual, status_mercado);

  console.log("[RODADAS-UI] Temporada encerrada:", temporadaEncerrada);

  let cardsHTML = "";

  for (let i = 1; i <= RODADA_FINAL_CAMPEONATO; i++) {
    let statusClass = "";
    let statusText = "";
    let isDisabled = false;

    // ✅ v2.5: Se visualizando temporada passada, todas rodadas são encerradas
    if (isTemporadaPassada) {
      statusClass = "encerrada";
      statusText = "Encerrada";
      isDisabled = false;
    }
    // ✅ v2.4: Lógica para temporada atual
    else if (i < rodada_atual) {
      // Rodadas anteriores sempre encerradas
      statusClass = "encerrada";
      statusText = "Encerrada";
      isDisabled = false;
    } else if (i === rodada_atual) {
      if (mercadoAberto) {
        // Mercado aberto = rodada ainda não começou
        statusClass = "vigente";
        statusText = "Aberta";
        isDisabled = true;
      } else if (temporadaEncerrada && i === RODADA_FINAL_CAMPEONATO) {
        // ✅ FIX: Rodada 38 com temporada encerrada = ENCERRADA
        statusClass = "encerrada";
        statusText = "Encerrada";
        isDisabled = false;
      } else {
        // Mercado fechado mas jogos em andamento = Parciais
        statusClass = "parcial";
        statusText = "Parciais";
        isDisabled = false;
      }
    } else {
      // Rodadas futuras
      statusClass = "futura";
      statusText = "Futura";
      isDisabled = true;
    }

    cardsHTML += `
      <div class="rodada-mini-card ${isDisabled ? "disabled" : ""}"
           data-rodada="${i}"
           onclick="${isDisabled ? "" : `selecionarRodada(${i})`}">
        <div class="rodada-numero">${i}</div>
        <div class="rodada-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }

  cardsContainer.innerHTML = cardsHTML;
}

// ==============================
// SELEÇÃO DE RODADA
// ==============================

export async function selecionarRodada(rodada, carregarDadosCallback) {
  if (rodadaAtualSelecionada === rodada) return;

  // Atualizar seleção visual
  document.querySelectorAll(".rodada-mini-card").forEach((card) => {
    card.classList.remove("selected");
  });

  const cardSelecionado = document.querySelector(`[data-rodada="${rodada}"]`);
  if (cardSelecionado) {
    cardSelecionado.classList.add("selected");
  }

  rodadaAtualSelecionada = rodada;

  // Mostrar seção de conteúdo
  const contentSection = getElement("rodadaContentSection");
  if (contentSection) {
    contentSection.style.display = "block";
  }

  // Atualizar título
  const titulo = getElement("rodadaTituloAtual");
  if (titulo) {
    titulo.textContent = `Rodada ${rodada}`;
  }

  // Carregar dados da rodada via callback
  if (carregarDadosCallback) {
    await carregarDadosCallback(rodada);
  }
}

// ==============================
// EXIBIÇÃO DE RANKINGS
// ==============================

// ✅ v2.5: Cache local de faixas (evita fetch repetido na mesma renderização)
let _faixasCache = { ligaId: null, rodada: null, faixas: null, valores: null };

/**
 * Pré-carrega faixas e valores do servidor para a rodada.
 * Chamada UMA VEZ antes de renderizar a lista, evitando N fetches por participante.
 */
async function preCarregarConfigRodada(ligaId, rodada) {
  if (_faixasCache.ligaId === ligaId && _faixasCache.rodada === rodada && _faixasCache.faixas) {
    return _faixasCache;
  }

  try {
    const [faixas, valores] = await Promise.all([
      getFaixasPorRodadaAsync(ligaId, rodada),
      getBancoPorRodadaAsync(ligaId, rodada),
    ]);
    _faixasCache = { ligaId, rodada, faixas, valores };
    console.log(`[RODADAS-UI] Config carregada do servidor: ${faixas?.totalTimes || '?'} participantes, ${Object.keys(valores || {}).length} posições`);
  } catch (e) {
    console.warn(`[RODADAS-UI] Fallback hardcoded:`, e.message);
    _faixasCache = {
      ligaId, rodada,
      faixas: null,
      valores: getBancoPorRodada(ligaId, rodada),
    };
  }
  return _faixasCache;
}

// ✅ v2.5: FUNÇÃO PARA OBTER LABEL DE POSIÇÃO (dinâmico via config do servidor)
export function getPosLabel(index, total, ligaId, rodada) {
  const pos = index + 1;
  const faixas = _faixasCache.faixas;

  // Se temos faixas dinâmicas do servidor, usar elas
  if (faixas && faixas.credito && faixas.debito) {
    const totalConfig = faixas.totalTimes || total;

    // 1º lugar = MITO
    if (pos === 1) {
      return `<span style="color:#fff; font-weight:bold; background:#198754; border-radius:4px; padding:1px 8px; font-size:12px;">MITO</span>`;
    }
    // Último ativo = MICO
    if (pos === totalConfig && totalConfig > 1) {
      return `<span style="color:#fff; font-weight:bold; background:#dc3545; border-radius:4px; padding:1px 8px; font-size:12px;">MICO</span>`;
    }
    // Zona de ganho (crédito) - G2, G3...
    if (pos >= faixas.credito.inicio && pos <= faixas.credito.fim) {
      return `<span class="pos-g">G${pos}</span>`;
    }
    // Zona neutra
    if (faixas.neutro && pos >= faixas.neutro.inicio && pos <= faixas.neutro.fim) {
      return `<span class="pos-neutro">${pos}º</span>`;
    }
    // Zona de perda (débito) - Z1, Z2...
    if (pos >= faixas.debito.inicio && pos <= faixas.debito.fim) {
      const zoneIndex = totalConfig - pos;
      return `<span class="pos-z">${pos}º | Z${zoneIndex}</span>`;
    }
    return `${pos}°`;
  }

  // Fallback: lógica hardcoded original (se servidor não respondeu)
  const isLigaCartoleirosSobral = ligaId === LIGAS_CONFIG.CARTOLEIROS_SOBRAL;

  if (isLigaCartoleirosSobral) {
    const isFase1 = rodada < RODADA_TRANSICAO_SOBRAL;

    if (isFase1) {
      if (pos === 1) return `<span style="color:#fff; font-weight:bold; background:#198754; border-radius:4px; padding:1px 8px; font-size:12px;">MITO</span>`;
      if (pos === 2) return `<span class="pos-g">G2</span>`;
      if (pos === 3) return `<span class="pos-neutro">3º</span>`;
      if (pos === 4) return `<span class="pos-z">Z3</span>`;
      if (pos === 5) return `<span class="pos-z">Z2</span>`;
      if (pos === 6) return `<span style="color:#fff; font-weight:bold; background:#dc3545; border-radius:4px; padding:1px 8px; font-size:12px;">MICO</span>`;
    } else {
      if (pos === 1) return `<span style="color:#fff; font-weight:bold; background:#198754; border-radius:4px; padding:1px 8px; font-size:12px;">MITO</span>`;
      if (pos === 2 || pos === 3) return `<span class="pos-neutro">${pos}º</span>`;
      if (pos === 4) return `<span style="color:#fff; font-weight:bold; background:#dc3545; border-radius:4px; padding:1px 8px; font-size:12px;">MICO</span>`;
    }
    return `${pos}°`;
  } else {
    const config = POSICAO_CONFIG.SUPERCARTOLA;
    if (pos === config.mito.pos) return `<span style="${config.mito.style}">${config.mito.label}</span>`;
    if (config.g2_g11.range[0] <= pos && pos <= config.g2_g11.range[1]) return `<span class="${config.g2_g11.className}">${config.g2_g11.getLabel(pos)}</span>`;
    if (config.zona.condition(pos, total)) return `<span class="${config.zona.className}">${config.zona.getLabel(pos, total)}</span>`;
    if (config.mico.condition(pos, total)) return `<span class="${config.mico.className}">${config.mico.label}</span>`;
    return `${pos}°`;
  }
}

// HELPER PARA RENDERIZAR CARD (APP MODE)
function renderizarCardApp(rank, index, posLabel, banco, isParcial = false) {
  const escudoUrl = rank.clube_id
    ? `/escudos/${rank.clube_id}.png`
    : rank.escudo_url || '/escudos/default.png';

  // Informações de Capitão (Mock ou Dados se disponíveis)
  let captainName = "Capitão";
  if (rank.atletas && rank.capitao_id) {
     const cap = rank.atletas.find(a => a.atleta_id === rank.capitao_id);
     if (cap) captainName = cap.apelido;
  } else if (rank.capitao) {
     captainName = rank.capitao;
  }

  // Jogadores jogaram
  let playersPlayed = rank.jogadores_jogaram || 0;
  if (!playersPlayed && rank.atletas) {
      playersPlayed = rank.atletas.filter((a) => a.pontos_num !== 0).length;
  }
  const totalPlayers = 12;

  // Pontuação
  const scoreParcial = (Math.trunc((parseFloat(rank.pontos || 0)) * 100) / 100).toFixed(2);
  const scoreTotal = rank.totalPontos ? (Math.trunc(parseFloat(rank.totalPontos) * 100) / 100).toFixed(2) : null;
  
  // Patrimônio (se disponível)
  const patrimonio = rank.patrimonio ? parseFloat(rank.patrimonio).toFixed(2) : null;

  const bancoClass = banco > 0 ? "positive" : banco < 0 ? "negative" : "neutral";
  const bancoSinal = banco > 0 ? "+" : "";
  const bancoFormatted = banco.toFixed(2);
  
  // Variação de posição (simulada ou real)
  const varPos = rank.variacao_posicao || 0;
  let varPosIcon = '=';
  let varPosClass = 'equal';
  if(varPos > 0) { varPosIcon = '▲'; varPosClass = 'up'; }
  if(varPos < 0) { varPosIcon = '▼'; varPosClass = 'down'; }

  return `
    <div class="ranking-card">
      <div class="rc-pos">
        <div class="rc-pos-num">${index + 1}</div>
        <div class="rc-pos-idx ${varPosClass}">${varPosIcon}</div>
      </div>
      <img src="${escudoUrl}" class="rc-shield" onerror="this.onerror=null;this.src='/escudos/default.png'">
      <div class="rc-team">
        <div class="rc-info">
          <div class="rc-team-name">${escapeHtml(rank.nome_time || "Time Sem Nome")}</div>
          <div class="rc-manager">${escapeHtml(rank.nome_cartola || "Cartoleiro")}</div>
          <div class="rc-captain">
             <div class="rc-captain-icon">C</div> ${escapeHtml(captainName)}
          </div>
        </div>
      </div>
      <div class="rc-stats">
        <div class="rc-score-box">
           <div class="rc-score-main">${scoreParcial}</div>
           ${scoreTotal ? `<div class="rc-score-total">Total: ${scoreTotal}</div>` : ''}
        </div>
        <div class="rc-finance-box">
           ${patrimonio ? `<div class="rc-patrimony">$ ${patrimonio}</div>` : ''}
           <div class="rc-variation ${bancoClass}">${bancoSinal}${bancoFormatted}</div>
        </div>
        <div class="rc-players ${playersPlayed > 0 ? 'playing' : ''}">
           ${playersPlayed}<span class="rc-total-players">/12</span>
        </div>
      </div>
    </div>
  `;
}

// ✅ v2.3: EXIBIR RANKING - TABELAS CONTEXTUAIS POR RODADA
export async function exibirRanking(rankingsDaRodada, rodadaSelecionada, ligaId) {
  const rankingList = getElement("rankingList");

  // Validar se é array
  if (
    !rankingsDaRodada ||
    !Array.isArray(rankingsDaRodada) ||
    rankingsDaRodada.length === 0
  ) {
    console.warn(
      "[RODADAS-UI] Dados inválidos recebidos:",
      typeof rankingsDaRodada,
    );
    if(rankingList) rankingList.innerHTML = `<div style="padding:30px; text-align:center; color:#888;">Nenhum dado encontrado para a rodada ${rodadaSelecionada}.</div>`;
    limparExportContainer();
    return;
  }

  // ✅ v2.2: Separar ativos e inativos CONSIDERANDO A RODADA SELECIONADA
  // Regra: Se rodada < rodada_desistencia, participante era ATIVO nessa rodada
  const ativos = rankingsDaRodada.filter((r) => {
    if (r.ativo === false && r.rodada_desistencia) {
      // Inativo atualmente, mas era ativo ANTES da rodada de desistência
      return rodadaSelecionada < r.rodada_desistencia;
    }
    return r.ativo !== false;
  });

  const inativos = rankingsDaRodada.filter((r) => {
    if (r.ativo === false && r.rodada_desistencia) {
      // Só mostra como inativo se rodada >= rodada_desistencia
      return rodadaSelecionada >= r.rodada_desistencia;
    }
    // Inativo sem rodada_desistencia definida (fallback)
    return r.ativo === false && !r.rodada_desistencia;
  });

  // Ordenar ativos por pontos
  ativos.sort((a, b) => parseFloat(b.pontos || 0) - parseFloat(a.pontos || 0));

  // ✅ v2.5: Pré-carregar config dinâmica do servidor (faixas + valores)
  const configRodada = await preCarregarConfigRodada(ligaId, rodadaSelecionada);
  const bancoValores = configRodada.valores || getBancoPorRodada(ligaId, rodadaSelecionada);
  const totalAtivos = ativos.length;

  console.log(
    `[RODADAS-UI] Rodada ${rodadaSelecionada}: usando tabela de ${Object.keys(bancoValores).length} posições (dinâmico)`,
  );

  // Renderizar ativos
  let listHTML = ativos
    .map((rank, index) => {
      const banco =
        bancoValores[index + 1] !== undefined ? bancoValores[index + 1] : 0.0;
      const posLabel = getPosLabel(
        index,
        totalAtivos,
        ligaId,
        rodadaSelecionada,
      );

      return renderizarCardApp(rank, index, posLabel, banco, false);
    })
    .join("");

  // Renderizar inativos (se houver)
  if (inativos.length > 0) {
    listHTML += `
      <div class="separador-inativos" style="padding: 10px; text-align: center; color: #666; font-size: 12px; background: rgba(0,0,0,0.2);">
          <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">warning</span> Participantes inativos
      </div>
    `;

    inativos.forEach((rank, index) => {
        // Renderizar card simples para inativo
        const escudoUrl = rank.clube_id ? `/escudos/${rank.clube_id}.png` : rank.escudo_url || "";
        listHTML += `
          <div class="ranking-card inativo" style="opacity: 0.6; filter: grayscale(1);">
            <div class="rc-pos"><div class="rc-pos-num">-</div></div>
            <img src="${escudoUrl}" class="rc-shield" onerror="this.onerror=null;this.src='/escudos/default.png'">
            <div class="rc-team">
               <div class="rc-info">
                  <div class="rc-team-name">${escapeHtml(rank.nome_time || "N/D")}</div>
                  <div class="rc-manager">${escapeHtml(rank.nome_cartola || "N/D")} (Inativo)</div>
               </div>
            </div>
            <div class="rc-stats">
               <div class="rc-score-main">${(Math.trunc((parseFloat(rank.pontos || 0)) * 100) / 100).toFixed(2)}</div>
            </div>
          </div>
        `;
    });
  }

  if(rankingList) rankingList.innerHTML = listHTML;

  // Renderizar container de export
  renderizarExportContainer(ativos, rodadaSelecionada, ligaId);
}


// EXIBIR RANKING COM PARCIAIS
export async function exibirRankingParciais(
  rankingsParciais,
  rodadaSelecionada,
  ligaId,
) {
  const rankingList = getElement("rankingList");

  if (!rankingsParciais || rankingsParciais.length === 0) {
    if(rankingList) rankingList.innerHTML = `<div style="padding:30px; text-align:center; color:#888;">Aguardando dados parciais...</div>`;
    limparExportContainer();
    return;
  }

  // Separar ativos e inativos
  const ativos = rankingsParciais.filter((r) => r.ativo !== false);
  const inativos = rankingsParciais.filter((r) => r.ativo === false);

  ativos.sort(
    (a, b) => parseFloat(b.totalPontos || 0) - parseFloat(a.totalPontos || 0),
  );

  // ✅ v2.5: Usar config dinâmica do servidor
  const configRodada = await preCarregarConfigRodada(ligaId, rodadaSelecionada);
  const bancoValores = configRodada.valores || getBancoPorRodada(ligaId, rodadaSelecionada);
  const totalAtivos = ativos.length;

  let listHTML = ativos
    .map((rank, index) => {
      const banco =
        bancoValores[index + 1] !== undefined ? bancoValores[index + 1] : 0.0;
      const posLabel = getPosLabel(
        index,
        totalAtivos,
        ligaId,
        rodadaSelecionada,
      );

      // Pass true for isParcial
      return renderizarCardApp(rank, index, posLabel, banco, true);
    })
    .join("");

  // Inativos
  if (inativos.length > 0) {
    listHTML += `
      <div class="separador-inativos" style="padding: 10px; text-align: center; color: #666; font-size: 12px; background: rgba(0,0,0,0.2);">
          <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">warning</span> Participantes inativos
      </div>
    `;

    inativos.forEach((rank) => {
        const escudoUrl = rank.clube_id ? `/escudos/${rank.clube_id}.png` : rank.escudo_url || "";
        listHTML += `
          <div class="ranking-card inativo" style="opacity: 0.6; filter: grayscale(1);">
            <div class="rc-pos"><div class="rc-pos-num">-</div></div>
            <img src="${escudoUrl}" class="rc-shield" onerror="this.onerror=null;this.src='/escudos/default.png'">
            <div class="rc-team">
               <div class="rc-info">
                  <div class="rc-team-name">${escapeHtml(rank.nome_time || "N/D")}</div>
                  <div class="rc-manager">${escapeHtml(rank.nome_cartola || "N/D")} (Inativo)</div>
               </div>
            </div>
            <div class="rc-stats">
               <div class="rc-score-main">${(Math.trunc(parseFloat(rank.totalPontos || 0) * 100) / 100).toFixed(2)}</div>
            </div>
          </div>
        `;
    });
  }

  if(rankingList) rankingList.innerHTML = listHTML;
  limparExportContainer();
}

// ==============================
// FUNÇÕES DE UI AUXILIARES
// ==============================

export function mostrarLoading(show) {
  const rankingList = getElement("rankingList");
  if (!rankingList) return;

  if (show) {
    rankingList.innerHTML = `
      <div style="padding: 40px; text-align: center;">
          <div class="spinner" style="margin: 0 auto 10px;"></div>
          Carregando dados...
      </div>
    `;
  }
}

export function mostrarMensagemRodada(mensagem, tipo = "info") {
  const rankingList = getElement("rankingList");
  if (!rankingList) return;

  const cor = tipo === 'erro' ? '#ef4444' : (tipo === 'aviso' ? '#facc15' : '#3b82f6');
  const bg = tipo === 'erro' ? 'rgba(239, 68, 68, 0.1)' : (tipo === 'aviso' ? 'rgba(250, 204, 21, 0.1)' : 'rgba(59, 130, 246, 0.1)');

  rankingList.innerHTML = `
    <div style="padding: 30px; text-align: center; margin: 10px; border-radius: 8px; color: ${cor}; background: ${bg};">
        ${mensagem}
    </div>
  `;

  limparExportContainer();
}

export function limparExportContainer() {
  const container = getElement("rodadaExportContainer");
  if (container) {
    container.innerHTML = "";
  }
}

export function getRodadaAtualSelecionada() {
  return rodadaAtualSelecionada;
}

export function limparCacheUI() {
  elementsCache.clear();
  rodadaAtualSelecionada = null;
  console.log("[RODADAS-UI] Cache de UI limpo");
}

// ==============================
// RENDERIZAÇÃO DE EXPORT
// ==============================

function renderizarExportContainer(rankings, rodada, ligaId) {
  const container = getElement("rodadaExportContainer");
  if (!container) return;

  container.innerHTML = `
    <div style="margin-top: 20px; text-align: center;">
      <button onclick="window.exportarRodadaImagem && window.exportarRodadaImagem(${rodada})" 
              class="btn-export" 
              style="background: linear-gradient(135deg, #ff4500, #e8472b); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600;">
        <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 4px;">photo_camera</span> Exportar Imagem
      </button>
    </div>
  `;
}

// ==============================
// EXIBIÇÃO DE RODADAS (DEBUG)
// ==============================

export function exibirRodadas(rodadasAgrupadas) {
  console.log("[RODADAS-UI] exibirRodadas chamada com:", rodadasAgrupadas);

  if (!rodadasAgrupadas || Object.keys(rodadasAgrupadas).length === 0) {
    console.warn("[RODADAS-UI] Nenhuma rodada para exibir");
    return;
  }

  const totalRodadas = Object.keys(rodadasAgrupadas).length;
  const totalRegistros = Object.values(rodadasAgrupadas).reduce(
    (acc, arr) => acc + arr.length,
    0,
  );

  console.log(
    `[RODADAS-UI] 📊 Total: ${totalRodadas} rodadas, ${totalRegistros} registros`,
  );
}

// ==============================
// RELATÓRIO MITOS/MICOS
// ==============================

let filtroAtual = { tipo: "todos", participante: "" };

export function exibirRelatorioMitosMicos(dados) {
  console.log("[RODADAS-UI] Exibindo relatório MITOS/MICOS");

  // Esconder seção de conteúdo normal e cards
  const contentSection = getElement("rodadaContentSection");
  const cardsContainer = getElement("rodadasCards");

  if (contentSection) contentSection.style.display = "none";
  if (cardsContainer?.parentElement) {
    cardsContainer.parentElement.style.display = "none";
  }

  // Mostrar seção do relatório
  let relatorioSection = getElement("relatorioMitosMicos");

  if (!relatorioSection) {
    // Criar seção se não existir
    const rodadasContainer = document.getElementById("rodadas");
    if (rodadasContainer) {
      relatorioSection = document.createElement("div");
      relatorioSection.id = "relatorioMitosMicos";
      relatorioSection.className = "relatorio-mitos-micos";
      rodadasContainer.appendChild(relatorioSection);
      elementsCache.set("relatorioMitosMicos", relatorioSection);
    }
  }

  if (!relatorioSection) {
    console.error("[RODADAS-UI] Não foi possível criar seção do relatório");
    return;
  }

  relatorioSection.style.display = "block";

  // Renderizar estrutura do relatório
  relatorioSection.innerHTML = `
    <div class="relatorio-header">
      <button onclick="window.voltarParaCards()" class="btn-voltar">
        ← Voltar
      </button>
      <h2><span class="material-symbols-outlined" style="vertical-align: middle; color: #ffd700;">emoji_events</span> Relatório MITOS & MICOS <span class="material-symbols-outlined" style="vertical-align: middle; color: #ef4444;">pest_control</span></h2>
    </div>
    <div class="relatorio-filtros" id="relatorioFiltros"></div>
    <div class="relatorio-estatisticas" id="estatisticasResumo"></div>
    <div class="relatorio-conteudo" id="relatorioContent"></div>
  `;

  // Renderizar componentes
  renderizarFiltrosRelatorio(dados);
  renderizarEstatisticasResumo(dados);
  renderizarConteudoRelatorio(dados, filtroAtual);
}

function renderizarFiltrosRelatorio(dados) {
  const container = getElement("relatorioFiltros");
  if (!container) return;

  // Extrair lista única de participantes
  const participantes = new Set();
  dados.mitos.forEach((m) =>
    participantes.add(m.nome_cartola || m.nome_time || "N/D"),
  );
  dados.micos.forEach((m) =>
    participantes.add(m.nome_cartola || m.nome_time || "N/D"),
  );

  const participantesOrdenados = Array.from(participantes).sort();

  container.innerHTML = `
    <button class="filtro-btn active" data-tipo="todos" onclick="window.aplicarFiltroTipo('todos')">
      <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">bar_chart</span> Todos
    </button>
    <button class="filtro-btn" data-tipo="mitos" onclick="window.aplicarFiltroTipo('mitos')">
      <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; color: #ffd700;">emoji_events</span> Apenas MITOS
    </button>
    <button class="filtro-btn" data-tipo="micos" onclick="window.aplicarFiltroTipo('micos')">
      <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; color: #ef4444;">pest_control</span> Apenas MICOS
    </button>
    <select id="filtroParticipante" class="filtro-select" onchange="window.aplicarFiltroParticipante(this.value)">
      <option value="">Todos os Participantes</option>
      ${participantesOrdenados.map((p) => `<option value="${p}">${p}</option>`).join("")}
    </select>
  `;
}

function renderizarEstatisticasResumo(dados) {
  const container = getElement("estatisticasResumo");
  if (!container) return;

  const { mitos, micos, estatisticas } = dados;

  // Calcular estatísticas
  const mitoMaisVezes = calcularMaisVezes(mitos);
  const micoMaisVezes = calcularMaisVezes(micos);

  // Ranking completo de mitos e micos
  const rankingMitos = calcularRankingCompleto(mitos);
  const rankingMicos = calcularRankingCompleto(micos);

  const html = `
    <div class="stat-card">
      <div class="stat-card-title">Total de Rodadas</div>
      <div class="stat-card-value">${estatisticas.totalRodadas}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title"><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; color: #ffd700;">emoji_events</span> Maior MITO</div>
      <div class="stat-card-value">${mitoMaisVezes.count}x</div>
      <div class="stat-card-subtitle">${escapeHtml(mitoMaisVezes.nome)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title"><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; color: #ef4444;">pest_control</span> Maior MICO</div>
      <div class="stat-card-value">${micoMaisVezes.count}x</div>
      <div class="stat-card-subtitle">${escapeHtml(micoMaisVezes.nome)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">Média Pontos MITO</div>
      <div class="stat-card-value">${(Math.trunc(estatisticas.mediaMito * 10) / 10).toFixed(1)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">Média Pontos MICO</div>
      <div class="stat-card-value">${(Math.trunc(estatisticas.mediaMico * 10) / 10).toFixed(1)}</div>
    </div>
  `;

  container.innerHTML = html;
}

function calcularMaisVezes(lista) {
  const contagem = {};

  lista.forEach((item) => {
    const nome = item.nome_cartola || item.nome_time || "N/D";
    contagem[nome] = (contagem[nome] || 0) + 1;
  });

  let maxNome = "N/D";
  let maxCount = 0;

  Object.entries(contagem).forEach(([nome, count]) => {
    if (count > maxCount) {
      maxCount = count;
      maxNome = nome;
    }
  });

  return { nome: maxNome, count: maxCount };
}

function calcularRankingCompleto(lista) {
  const contagem = {};

  lista.forEach((item) => {
    const nome = item.nome_cartola || item.nome_time || "N/D";
    contagem[nome] = (contagem[nome] || 0) + 1;
  });

  return Object.entries(contagem)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count);
}

function renderizarConteudoRelatorio(dados, filtro) {
  const container = getElement("relatorioContent");
  if (!container) return;

  const { mitos, micos } = dados;
  const { tipo, participante } = filtro;

  // Filtrar por participante se selecionado
  let mitosFiltrados = mitos;
  let micosFiltrados = micos;

  if (participante) {
    mitosFiltrados = mitos.filter(
      (m) => (m.nome_cartola || m.nome_time || "N/D") === participante,
    );
    micosFiltrados = micos.filter(
      (m) => (m.nome_cartola || m.nome_time || "N/D") === participante,
    );
  }

  // Agrupar por rodada
  const rodadas = {};

  mitosFiltrados.forEach((item) => {
    if (!rodadas[item.rodada]) {
      rodadas[item.rodada] = { mito: null, mico: null };
    }
    rodadas[item.rodada].mito = item;
  });

  micosFiltrados.forEach((item) => {
    if (!rodadas[item.rodada]) {
      rodadas[item.rodada] = { mito: null, mico: null };
    }
    rodadas[item.rodada].mico = item;
  });

  // Ordenar por rodada
  const rodadasOrdenadas = Object.keys(rodadas)
    .map(Number)
    .sort((a, b) => a - b);

  // Se filtro por participante ativo, mostrar resumo primeiro
  let html = "";

  if (participante) {
    const totalMitos = mitosFiltrados.length;
    const totalMicos = micosFiltrados.length;
    const saldo = totalMitos - totalMicos;
    const saldoClass =
      saldo > 0
        ? "saldo-positivo"
        : saldo < 0
          ? "saldo-negativo"
          : "saldo-neutro";

    html += `
      <div class="participante-resumo">
        <div class="participante-nome"><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">bar_chart</span> ${participante}</div>
        <div class="participante-stats">
          <span class="stat-mito"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; color: #ffd700;">emoji_events</span> ${totalMitos} MITO${totalMitos !== 1 ? "S" : ""}</span>
          <span class="stat-mico"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; color: #ef4444;">pest_control</span> ${totalMicos} MICO${totalMicos !== 1 ? "S" : ""}</span>
          <span class="${saldoClass}">Saldo: ${saldo > 0 ? "+" : ""}${saldo}</span>
        </div>
      </div>
    `;
  }

  if (rodadasOrdenadas.length === 0) {
    html += `<div class="empty-relatorio">Nenhum resultado encontrado para os filtros selecionados.</div>`;
    container.innerHTML = html;
    return;
  }

  rodadasOrdenadas.forEach((numRodada) => {
    const { mito, mico } = rodadas[numRodada];

    // Aplicar filtro de tipo
    const mostrarMito = mito && tipo !== "micos";
    const mostrarMico = mico && tipo !== "mitos";

    if (!mostrarMito && !mostrarMico) return;

    html += `
      <div class="rodada-card">
        <div class="rodada-card-header">Rodada ${numRodada}</div>
    `;

    if (mostrarMito) {
      html += `
        <div class="resultado-row mito">
          <div class="resultado-badge mito"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; color: #ffd700;">emoji_events</span> MITO</div>
          <div class="resultado-info">
            <div>${escapeHtml(mito.nome_cartola || "N/D")}</div>
            <div style="font-size: 9px; color: var(--text-muted);">${escapeHtml(mito.nome_time || "N/D")}</div>
          </div>
          <div class="resultado-pontos">${(Math.trunc((parseFloat(mito.pontos || 0)) * 100) / 100).toFixed(2)}</div>
        </div>
      `;
    }

    if (mostrarMico) {
      html += `
        <div class="resultado-row mico">
          <div class="resultado-badge mico"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; color: #ef4444;">pest_control</span> MICO</div>
          <div class="resultado-info">
            <div>${escapeHtml(mico.nome_cartola || "N/D")}</div>
            <div style="font-size: 9px; color: var(--text-muted);">${escapeHtml(mico.nome_time || "N/D")}</div>
          </div>
          <div class="resultado-pontos">${(Math.trunc((parseFloat(mico.pontos || 0)) * 100) / 100).toFixed(2)}</div>
        </div>
      `;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

export function fecharRelatorioMitosMicos() {
  const relatorioSection = getElement("relatorioMitosMicos");
  const contentSection = getElement("rodadaContentSection");
  const cardsContainer = getElement("rodadasCards");

  if (relatorioSection) relatorioSection.style.display = "none";
  if (contentSection) contentSection.style.display = "block";
  if (cardsContainer?.parentElement) {
    cardsContainer.parentElement.style.display = "block";
  }
}

export function aplicarFiltroRelatorio(filtro, dados) {
  renderizarConteudoRelatorio(dados, filtro);
}

// Funções expostas globalmente para os filtros
export function aplicarFiltroTipo(tipo) {
  filtroAtual.tipo = tipo;

  // Atualizar visual dos botões
  document.querySelectorAll(".filtro-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tipo === tipo);
  });

  // Re-renderizar com novo filtro
  if (window._relatorioMitosMicosData) {
    renderizarConteudoRelatorio(window._relatorioMitosMicosData, filtroAtual);
  }
}

export function aplicarFiltroParticipante(participante) {
  filtroAtual.participante = participante;

  // Re-renderizar com novo filtro
  if (window._relatorioMitosMicosData) {
    renderizarConteudoRelatorio(window._relatorioMitosMicosData, filtroAtual);
  }
}

// Expor funções de filtro no window
if (typeof window !== "undefined") {
  window.aplicarFiltroTipo = aplicarFiltroTipo;
  window.aplicarFiltroParticipante = aplicarFiltroParticipante;
}

console.log("[RODADAS-UI] ✅ Módulo v2.4 carregado (fix rodada 38 encerrada)");
