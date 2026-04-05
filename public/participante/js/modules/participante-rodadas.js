// =====================================================================
// PARTICIPANTE-RODADAS.JS - v7.0 CARTOLA-STYLE ESCALATION + CHART
// ✅ v7.0: Minha Escalação estilo Cartola/Globo com escudos, capitão,
//          reserva de luxo, banco de reservas, gráfico evolutivo
// ✅ v6.0: Removido slider redundante, laranja sutil (#FF4500),
//          detalhamento enriquecido com "Meu Resumo" card
// ✅ v5.1: "Curiosar" + Badge "X/12 em campo"
// ✅ v5.0: Redesign completo
// ✅ v4.6: FIX - Double RAF para garantir container no DOM após refresh
// ✅ v4.5: Removido LIGAS_CONFIG hardcoded - configs vêm do servidor
// ✅ v4.4: CACHE-FIRST - Carregamento instantâneo do IndexedDB
// =====================================================================

if (window.Log) Log.info("[PARTICIPANTE-RODADAS] Carregando modulo v7.0...");

// Importar módulo de parciais
import * as ParciaisModule from "./participante-rodada-parcial.js";
// Importar módulo de polling inteligente
import * as PollingInteligenteModule from "./participante-rodadas-polling.js";

import { RODADA_FINAL_CAMPEONATO } from "/js/config/seasons-client.js";
import { injectModuleLP } from './module-lp-engine.js';

// Estado do módulo
let todasRodadasCache = [];
let meuTimeId = null;
let ligaId = null;
let rodadaSelecionada = null;
let rodadaAtualCartola = 1; // Safe default: será atualizado por buscarRodadaAtual()
let statusMercadoAtual = 1;
let parciaisInfo = null;
// Ground truth: jogos realmente ao vivo (não apenas status_mercado=2)
let _aoVivoConfirmado = false;
let _aoVivoRefreshInterval = null;
const TEMPORADA_ATUAL = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();

// =====================================================================
// BUILD PREMIAÇÃO RODADAS - Para LP Engine
// =====================================================================
async function buildPremiacaoRodadas(ligaId) {
    try {
        const resp = await fetch('/api/liga/' + ligaId + '/modulos/ranking_rodada');
        if (!resp.ok) return null;
        const data = await resp.json();
        const valoresManual = data?.config?.wizard_respostas?.valores_manual;
        if (!valoresManual || Object.keys(valoresManual).length === 0) return null;

        // valoresManual is a flat map: { "1": 20, "2": 15, ..., "N": -20 }
        // positive = ganho (mito/Mito), negative = perda (mico/Mico), 0 = neutro
        // Sort by position number
        const entries = Object.entries(valoresManual)
            .map(([pos, val]) => ({ pos: parseInt(pos, 10), val: Number(val) }))
            .sort((a, b) => a.pos - b.pos);

        if (entries.length === 0) return null;

        const totalPos = entries.length;
        let rows = '';
        entries.forEach(({ pos, val }) => {
            const posLabel = pos === 1
                ? '1° (Mito)'
                : pos === totalPos
                    ? pos + '° (Mico)'
                    : pos + '°';
            let valClass, valLabel;
            if (val > 0) {
                valClass = 'ganho';
                valLabel = '+R$ ' + val;
            } else if (val < 0) {
                valClass = 'perda';
                valLabel = '-R$ ' + Math.abs(val);
            } else {
                valClass = 'neutro';
                valLabel = '—';
            }
            rows += '<div class="lp-bonus-row">'
                + '<span class="lp-bonus-pos">' + posLabel + '</span>'
                + '<span class="lp-bonus-val ' + valClass + '">' + (val > 0 ? valLabel : '—') + '</span>'
                + '<span class="lp-bonus-val ' + valClass + '">' + (val < 0 ? valLabel : '—') + '</span>'
                + '</div>';
        });

        return '<div class="lp-bonus-table">'
            + '<div class="lp-bonus-table-header"><span>Posição</span><span>Bônus</span><span>Ônus</span></div>'
            + rows
            + '</div>'
            + '<p class="lp-bonus-nota">Valores configurados pelo admin da liga</p>';
    } catch (_e) {
        return null;
    }
}

// =====================================================================
// FUNÇÃO PRINCIPAL - EXPORTADA PARA NAVIGATION
// =====================================================================
export async function inicializarRodadasParticipante({
    participante,
    ligaId: ligaIdParam,
    timeId,
}) {
    if (window.Log)
        Log.info("[PARTICIPANTE-RODADAS] Inicializando v7.0...", {
            ligaIdParam,
            timeId,
            timeIdType: typeof timeId,
        });

    ligaId = ligaIdParam;
    meuTimeId = timeId;

    // DEBUG: Confirmar valor armazenado
    if (window.Log) {
        Log.info("[PARTICIPANTE-RODADAS]", `🎯 meuTimeId definido: ${meuTimeId} (${typeof meuTimeId})`);
    }

    injectModuleLP({
        wrapperId:               'ranking-rodada-lp-wrapper',
        insertBefore:            'rodadas-content',
        ligaId,
        moduloKey:               'banco',
        titulo:                  'Ranking da Rodada',
        tagline:                 'Desempenho por rodada',
        icon:                    'event',
        colorClass:              'module-lp-ranking-rodada',
        premiacaoLabel:          'Premiação por Rodada',
        premiacaoSource:         'moduleconfig',
        premiacaoModuleConfigFn: buildPremiacaoRodadas,
    });

    // Aguardar DOM estar renderizado (double RAF)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const cache = window.ParticipanteCache;
    let usouCache = false;

    // =========================================================================
    // FASE 1: CARREGAMENTO INSTANTÂNEO (Cache IndexedDB)
    // =========================================================================
    if (cache) {
        const rodadasCache = await (cache.getRodadasAsync
            ? cache.getRodadasAsync(ligaId, null, null, TEMPORADA_ATUAL)
            : cache.getRodadas(ligaId, TEMPORADA_ATUAL));

        if (rodadasCache && Array.isArray(rodadasCache) && rodadasCache.length > 0) {
            usouCache = true;
            if (window.Log) Log.info("[PARTICIPANTE-RODADAS] ⚡ INSTANT LOAD - dados do cache!");

            const rodadasAgrupadas = agruparRodadasPorNumero(rodadasCache);
            todasRodadasCache = rodadasAgrupadas;

            mostrarLoading(false);
            renderizarInterface(rodadasAgrupadas);
        }
    }

    if (!usouCache) {
        mostrarLoading(true);
    }

    // =========================================================================
    // FASE 2: ATUALIZAÇÃO EM BACKGROUND (Fetch API)
    // =========================================================================
    try {
        // 1. Buscar rodada atual e verificar parciais
        await buscarRodadaAtual();

        // 2. Inicializar módulo de parciais + verificar se jogos realmente ao vivo
        [parciaisInfo, _aoVivoConfirmado] = await Promise.all([
            ParciaisModule.inicializarParciais(ligaId, timeId),
            window.isRodadaRealmenteAoVivo ? window.isRodadaRealmenteAoVivo() : Promise.resolve(false)
        ]);
        if (window.Log)
            Log.info("[PARTICIPANTE-RODADAS] 📊 Parciais:", parciaisInfo, "| AO VIVO confirmado:", _aoVivoConfirmado);

        // 2.1. Refresh periódico do status ao vivo (60s) durante rodada ativa
        if (statusMercadoAtual === 2 && !_aoVivoRefreshInterval) {
            _aoVivoRefreshInterval = setInterval(async () => {
                if (statusMercadoAtual !== 2) {
                    clearInterval(_aoVivoRefreshInterval);
                    _aoVivoRefreshInterval = null;
                    return;
                }
                const novoAoVivo = window.isRodadaRealmenteAoVivo ? await window.isRodadaRealmenteAoVivo() : false;
                if (novoAoVivo !== _aoVivoConfirmado) {
                    _aoVivoConfirmado = novoAoVivo;
                    if (todasRodadasCache.length) renderizarCardDesempenho(todasRodadasCache);
                }
            }, 60_000);
        }

        // 3. Buscar rodadas consolidadas
        const response = await fetch(
            `/api/rodadas/${ligaId}/rodadas?inicio=1&fim=${RODADA_FINAL_CAMPEONATO}&temporada=${TEMPORADA_ATUAL}`,
        );
        if (!response.ok) {
            if (!usouCache) throw new Error(`Erro HTTP ${response.status}`);
            return;
        }

        const rodadasRaw = await response.json();
        // Normalizar formato: backend retorna { rodadas: [], cacheHint: {} } desde ba496f8
        const rodadas = Array.isArray(rodadasRaw) ? rodadasRaw : (rodadasRaw?.rodadas || []);
        if (window.Log)
            Log.info(
                `[PARTICIPANTE-RODADAS] 📊 ${rodadas.length} registros recebidos`,
            );

        // 4. Atualizar cache com dados frescos
        if (cache) {
            cache.setRodadas(ligaId, rodadas, TEMPORADA_ATUAL);
        }

        // 5. Agrupar rodadas
        const rodadasAgrupadas = agruparRodadasPorNumero(rodadas);
        todasRodadasCache = rodadasAgrupadas;

        mostrarLoading(false);

        if (rodadasAgrupadas.length === 0 && !parciaisInfo?.disponivel) {
            if (!usouCache) mostrarEstadoVazio(true);
            return;
        }

        // 6. Renderizar interface completa
        renderizarInterface(rodadasAgrupadas);
    } catch (error) {
        if (window.Log) Log.error("[PARTICIPANTE-RODADAS] ❌ Erro:", error);
        if (!usouCache) {
            mostrarLoading(false);
            mostrarErro(error.message);
        }
    }
}

window.inicializarRodadasParticipante = inicializarRodadasParticipante;

// =====================================================================
// BUSCAR RODADA ATUAL
// =====================================================================
async function buscarRodadaAtual() {
    try {
        const response = await fetch("/api/cartola/mercado/status");
        if (response.ok) {
            const data = await response.json();
            rodadaAtualCartola = data.rodada_atual || 1;
            statusMercadoAtual = data.status_mercado || 1;
            if (window.Log)
                Log.info(
                    `[PARTICIPANTE-RODADAS] 📅 Rodada atual: ${rodadaAtualCartola} | status: ${statusMercadoAtual}`,
                );
        }
    } catch (e) {
        if (window.Log)
            Log.warn(
                "[PARTICIPANTE-RODADAS] ⚠️ Não foi possível obter rodada atual",
            );
    }
}

// =====================================================================
// AGRUPAMENTO
// =====================================================================
function agruparRodadasPorNumero(rodadas) {
    const rodadasMap = new Map();
    let matchCount = 0;

    // DEBUG: Log no início do agrupamento
    if (window.Log) {
        Log.info("[PARTICIPANTE-RODADAS]", `📦 AGRUPANDO: meuTimeId=${meuTimeId} | Total registros: ${rodadas.length}`);
        if (rodadas.length > 0) {
            const primeiroReg = rodadas[0];
            Log.info("[PARTICIPANTE-RODADAS]", `Primeiro registro: timeId=${primeiroReg.timeId}, time_id=${primeiroReg.time_id}, id=${primeiroReg.id}`);
        }
    }

    rodadas.forEach((r) => {
        const rodadaNum = r.rodada;
        if (!rodadasMap.has(rodadaNum)) {
            rodadasMap.set(rodadaNum, {
                numero: rodadaNum,
                participantes: [],
                meusPontos: null,
                jogou: false,
                posicaoFinanceira: null,
                valorFinanceiro: null,
            });
        }

        const rodadaData = rodadasMap.get(rodadaNum);
        rodadaData.participantes.push({ ...r });
        if (!rodadaData.totalParticipantesAtivos && r.totalParticipantesAtivos) {
            rodadaData.totalParticipantesAtivos = r.totalParticipantesAtivos;
        }

        const timeId = r.timeId || r.time_id;
        if (String(timeId) === String(meuTimeId)) {
            matchCount++;
            rodadaData.meusPontos = r.pontos || 0;
            rodadaData.jogou = !r.rodadaNaoJogada;
            rodadaData.posicaoFinanceira = r.posicao;
            rodadaData.valorFinanceiro = r.valorFinanceiro;
        }
    });

    // DEBUG: Resultado do agrupamento
    if (window.Log) {
        const rodadasJogadas = Array.from(rodadasMap.values()).filter(r => r.jogou).length;
        Log.info("[PARTICIPANTE-RODADAS]", `📦 AGRUPADO: ${matchCount} matches encontrados | ${rodadasJogadas} rodadas jogadas`);
    }

    return Array.from(rodadasMap.values()).sort((a, b) => a.numero - b.numero);
}

function getTotalParticipantesAtivos(rodada) {
    if (!rodada) return 0;
    if (rodada.totalParticipantesAtivos) return rodada.totalParticipantesAtivos;
    if (!Array.isArray(rodada.participantes)) return 0;
    const ativos = rodada.participantes.filter((p) => p.rodadaNaoJogada !== true);
    return ativos.length || rodada.participantes.length;
}

// =====================================================================
// RENDERIZAR INTERFACE COMPLETA
// =====================================================================
function renderizarInterface(rodadas) {
    // 1. Renderizar Grid de Rodadas
    renderizarGridRodadas(rodadas);

    // 2. Renderizar Gráfico Evolutivo (substitui Mitos/Micos)
    renderizarGraficoEvolutivo(rodadas, null);

    // 3. Renderizar Card de Desempenho (mantido como fallback)
    renderizarCardDesempenho(rodadas);

    // 4. Carregar destaques da rodada (abaixo do card Desempenho)
    _carregarDestaquesRodada();

    // 5. Mostrar container
    const container = document.getElementById('rodadasGruposContainer');
    if (container) container.style.display = 'flex';
}

// =====================================================================
// GRID DE RODADAS (todas as rodadas, sem agrupamento por turno)
// =====================================================================
function renderizarGridRodadas(rodadas) {
    const container = document.getElementById('rodadasGruposContainer');
    if (!container) return;

    const rodadasMap = new Map();
    rodadas.forEach(r => rodadasMap.set(r.numero, r));

    container.innerHTML = `
        <div class="rodadas-mini-grid" id="grid-todas-rodadas">
            ${renderizarMiniCards(1, RODADA_FINAL_CAMPEONATO, rodadasMap)}
        </div>
    `;
}

function renderizarMiniCards(inicio, fim, rodadasMap) {
    let html = '';

    // ✅ v4.0: Pré-calcular posições ANTES do loop (evita 38 sorts O(n log n))
    const posicoesCache = new Map();
    for (let i = inicio; i <= fim; i++) {
        const rodada = rodadasMap.get(i);
        if (!rodada || !rodada.participantes?.length) continue;
        const jogou = rodada?.jogou || false;
        let posicao = rodada?.posicaoFinanceira;
        if (!posicao && jogou && rodada.participantes.length > 1) {
            const ordenados = [...rodada.participantes]
                .filter(p => !p.rodadaNaoJogada)
                .sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
            const idx = ordenados.findIndex(p => compararTimeIds(p.timeId || p.time_id, meuTimeId));
            if (idx >= 0) posicao = idx + 1;
        }
        if (posicao) posicoesCache.set(i, posicao);
    }

    for (let i = inicio; i <= fim; i++) {
        const rodada = rodadasMap.get(i);
        const isParcial = parciaisInfo?.disponivel && i === parciaisInfo.rodada;
        const isFuturo = i > rodadaAtualCartola;
        const temDados = rodada && rodada.participantes.length > 0;
        const jogou = rodada?.jogou || false;
        const valorFinanceiro = rodada?.valorFinanceiro;
        // ✅ Fix: Rodada atual sem dados não é "futuro" — é "atual" (aguardando)
        const isAtual = !isParcial && i === rodadaAtualCartola && !isFuturo;

        // ✅ v4.0: Usar cache pré-calculado (sem sort dentro do loop)
        const posicao = posicoesCache.get(i) || rodada?.posicaoFinanceira;

        let classes = ['rodada-mini-card'];
        let tipoDestaque = null;

            if (isParcial) {
                classes.push('parcial');
            } else if (isAtual && !temDados) {
                classes.push('atual'); // ✅ Fix: visível com estilo diferenciado
            } else if (isFuturo || (!temDados && !isParcial)) {
                classes.push('futuro');
            } else if (jogou) {
                // Cores por saldo
                if (valorFinanceiro > 0) classes.push('saldo-positivo');
                else if (valorFinanceiro < 0) classes.push('saldo-negativo');

                const destaqueRodada = obterMitoMicoDaRodada(rodada);
                const isMito = destaqueRodada && compararTimeIds(destaqueRodada.mito?.timeId, meuTimeId);
                const isMico = destaqueRodada && compararTimeIds(destaqueRodada.mico?.timeId, meuTimeId);

                if (isMito) {
                    classes.push('mito');
                    tipoDestaque = 'mito';
                } else if (isMico) {
                    classes.push('mico');
                    tipoDestaque = 'mico';
                }
            }

        // Formatar posição (em vez de pontos)
        let chipTexto = '';
        if (isParcial) chipTexto = '⏳';
        else if (isAtual && !temDados) chipTexto = '●'; // ✅ Fix: indicador visual na rodada atual
        else if (temDados && jogou && posicao) chipTexto = `${posicao}º`;
        else if (temDados && !jogou) chipTexto = 'N/J';

        const badgeAoVivo = (isParcial && _aoVivoConfirmado) ? '<span class="badge-mini-ao-vivo">●</span>' : '';
        let badgeDestaque = '';
        if (tipoDestaque === 'mito') {
            badgeDestaque = '<span class="badge-mini-destaque"><span class="material-symbols-outlined">emoji_events</span></span>';
        } else if (tipoDestaque === 'mico') {
            badgeDestaque = '<span class="badge-mini-destaque"><span class="material-symbols-outlined">thumb_down</span></span>';
        }

        html += `
            <div class="${classes.join(' ')}" data-rodada="${i}" onclick="window.selecionarRodadaMini(${i}, ${isParcial})">
                ${badgeAoVivo}
                ${badgeDestaque}
                <span class="mini-card-numero">${i}</span>
                ${chipTexto ? `<span class="mini-card-posicao">${chipTexto}</span>` : ''}
            </div>
        `;
    }

    return html;
}

window.selecionarRodadaMini = function(numero, isParcial) {
    const card = document.querySelector(`.rodada-mini-card[data-rodada="${numero}"]`);
    if (card && !card.classList.contains('futuro')) {
        document.querySelectorAll('.rodada-mini-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selecionarRodada(numero, isParcial);
    }
};

// (Grupos expansíveis removidos na v5.1 - rodadas exibidas em grid único)

// =====================================================================
// CARD SUA TEMPORADA v2.0 - Estatísticas reais do participante
// =====================================================================
function renderizarCardDesempenho(rodadas) {
    const card = document.getElementById("cardSuaTemporada");
    if (!card) return;

    // Coletar dados do participante logado
    const meusDados = [];
    let totalPontos = 0;
    let somaPosicoesFinanceiras = 0;
    let rodadasComPosicao = 0;

    rodadas.forEach((rodada, idx) => {
        if (!rodada.jogou || !rodada.participantes?.length) return;

        const numeroRodada = obterNumeroRodada(rodada);
        const meusPontos = rodada.meusPontos ?? 0;

        meusDados.push({ rodada: numeroRodada, pontos: meusPontos });
        totalPontos += meusPontos;

        if (rodada.posicaoFinanceira) {
            somaPosicoesFinanceiras += rodada.posicaoFinanceira;
            rodadasComPosicao++;
        }
    });

    const rodadasJogadas = meusDados.length;

    if (rodadasJogadas === 0) {
        card.style.display = "none";
        return;
    }

    const mediaPontos = totalPontos / rodadasJogadas;
    const posicaoMedia = rodadasComPosicao > 0 ? (somaPosicoesFinanceiras / rodadasComPosicao) : null;

    const setEl = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const badgeEl = document.getElementById("tempBadgeRodadas");
    if (badgeEl) {
        if (statusMercadoAtual === 2 && _aoVivoConfirmado) {
            badgeEl.innerHTML = `${rodadasJogadas + 1} RODADAS <span style="font-size:0.65em;background:#ef4444;color:#fff;padding:1px 5px;border-radius:3px;vertical-align:middle;margin-left:3px;">AO VIVO</span>`;
        } else if (statusMercadoAtual === 2) {
            badgeEl.innerHTML = `${rodadasJogadas + 1} RODADAS <span style="font-size:0.65em;background:#f59e0b;color:#000;padding:1px 5px;border-radius:3px;vertical-align:middle;margin-left:3px;">EM ANDAMENTO</span>`;
        } else {
            badgeEl.textContent = `${rodadasJogadas} RODADAS`;
        }
    }
    setEl("tempPontosTotal", totalPontos.toFixed(2).replace('.', ','));
    setEl("tempMediaPontos", mediaPontos.toFixed(2).replace('.', ','));
    setEl("tempPosicaoMedia", posicaoMedia ? `${posicaoMedia.toFixed(1)}º` : "-");

    card.style.display = "block";
}

function obterNumeroRodada(rodada) {
    return rodada?.numero ?? rodada?.rodada ?? rodada?.rodadaNumero ?? null;
}

function compararTimeIds(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    return String(a) === String(b);
}

function obterMitoMicoDaRodada(rodada) {
    if (!rodada || !Array.isArray(rodada.participantes) || rodada.participantes.length === 0) {
        return null;
    }

    // FIX: Usar apenas rodadaNaoJogada para filtrar (campo 'ativo' pode estar desatualizado)
    const participantesAtivos = rodada.participantes.filter((p) => !p.rodadaNaoJogada);
    if (participantesAtivos.length === 0) {
        return null;
    }

    const ordenados = [...participantesAtivos].sort((a, b) => {
        const pontosA = parseFloat(a.pontos || 0);
        const pontosB = parseFloat(b.pontos || 0);
        if (pontosB === pontosA) {
            const idA = String(a.timeId ?? a.time_id ?? a.id ?? "");
            const idB = String(b.timeId ?? b.time_id ?? b.id ?? "");
            return idA.localeCompare(idB);
        }
        return pontosB - pontosA;
    });

    const primeiro = ordenados[0];
    const ultimo = ordenados[ordenados.length - 1];

    return {
        mito: {
            timeId: primeiro?.timeId ?? primeiro?.time_id,
            pontos: parseFloat(primeiro?.pontos || 0)
        },
        mico: {
            timeId: ultimo?.timeId ?? ultimo?.time_id,
            pontos: parseFloat(ultimo?.pontos || 0)
        }
    };
}

// =====================================================================
// DESTAQUES DA RODADA (Capitão / Maior / Menor pontuador)
// =====================================================================
let _rodadasDestaquesTimer = null;

async function _carregarDestaquesRodada(rodadaAlvo) {
    const card = document.getElementById('rodadas-destaques-card');
    if (!card) return;

    // Se rodadaAlvo é fornecido, usar diretamente; senão, lógica original
    let rodada;
    let isAoVivo;
    if (rodadaAlvo != null) {
        rodada = rodadaAlvo;
        isAoVivo = statusMercadoAtual === 2 && rodada === rodadaAtualCartola;
    } else {
        isAoVivo = statusMercadoAtual === 2;
        rodada = isAoVivo ? rodadaAtualCartola : Math.max(1, rodadaAtualCartola - 1);
    }
    if (!rodada || rodada < 1) return;

    const rodadaBadgeEl = document.getElementById('rod-destaques-rodada');
    const liveBadgeEl = document.getElementById('rod-destaques-live-badge');

    try {
        // ── FONTE 1 (ao vivo): ParciaisModule já tem tudo calculado ──
        if (isAoVivo && ParciaisModule?.obterDadosParciais) {
            const dadosParciais = ParciaisModule.obterDadosParciais();
            const meuTime = dadosParciais?.participantes?.find(
                p => String(p.timeId) === String(meuTimeId)
            );

            if (meuTime?.atletas?.length > 0) {
                const escalacaoLive = {
                    atletas: meuTime.atletas.filter(a => !a.is_reserva),
                    reservas: meuTime.atletas.filter(a => a.is_reserva),
                    capitao_id: meuTime.capitao_id,
                };
                const todosZerados = meuTime.atletas.every(a => !a.pontos && !a.pontos_efetivos);

                _renderizarDestaquesRodadas(escalacaoLive, rodada, todosZerados);
                if (rodadaBadgeEl) rodadaBadgeEl.textContent = `Rodada ${rodada}`;
                if (liveBadgeEl) {
                    liveBadgeEl.textContent = todosZerados ? 'ESCALADO' : 'AO VIVO';
                    liveBadgeEl.style.display = 'inline-flex';
                    liveBadgeEl.classList.toggle('aguardando', todosZerados);
                    liveBadgeEl.classList.toggle('ao-vivo', !todosZerados);
                }
                card.style.display = 'block';
                _setupDestaquesRodadasAutoRefresh(rodada);
                return;
            }
        }

        // ── FONTE 2 (consolidada): Dados do banco local via API interna ──
        if (!isAoVivo && ligaId) {
            const dbResp = await fetch(`/api/rodadas/${ligaId}/rodadas?rodada=${rodada}&temporada=${TEMPORADA_ATUAL}`);
            if (dbResp.ok) {
                const dbRaw = await dbResp.json();
                const dbRodadas = Array.isArray(dbRaw) ? dbRaw : (dbRaw?.rodadas || []);
                const meuRegistro = dbRodadas.find(r => String(r.timeId) === String(meuTimeId));
                if (meuRegistro?.atletas?.length > 0) {
                    const escalacaoDB = {
                        atletas: meuRegistro.atletas.filter(a => a.status_id !== 2),
                        reservas: meuRegistro.atletas.filter(a => a.status_id === 2),
                        capitao_id: meuRegistro.capitao_id,
                    };
                    _renderizarDestaquesRodadas(escalacaoDB, rodada, false);
                    if (rodadaBadgeEl) rodadaBadgeEl.textContent = `Rodada ${rodada}`;
                    if (liveBadgeEl) liveBadgeEl.style.display = 'none';
                    card.style.display = 'block';
                    return;
                }
            }
        }

        // ── FONTE 3 (fallback): Fetch direto da API Cartola ──
        const response = await fetch(`/api/cartola/time/id/${meuTimeId}/${rodada}`);
        if (!response.ok) {
            if (response.status === 404 && rodada > 1 && !rodadaAlvo) {
                const fallbackResp = await fetch(`/api/cartola/time/id/${meuTimeId}/${rodada - 1}`);
                if (fallbackResp.ok) {
                    const fallbackData = await fallbackResp.json();
                    if (fallbackData?.atletas?.length) {
                        _renderizarDestaquesRodadas(fallbackData, rodada - 1, false);
                        if (rodadaBadgeEl) rodadaBadgeEl.textContent = `Rodada ${rodada - 1}`;
                        if (liveBadgeEl) liveBadgeEl.style.display = 'none';
                        card.style.display = 'block';
                        return;
                    }
                }
            }
            return;
        }

        const escalacao = await response.json();
        if (!escalacao?.atletas?.length) return;

        _renderizarDestaquesRodadas(escalacao, rodada, false);
        if (rodadaBadgeEl) rodadaBadgeEl.textContent = `Rodada ${rodada}`;
        if (liveBadgeEl) liveBadgeEl.style.display = 'none';
        card.style.display = 'block';

        if (isAoVivo) _setupDestaquesRodadasAutoRefresh(rodada);

    } catch (error) {
        if (window.Log) Log.warn("[PARTICIPANTE-RODADAS]", "Erro ao carregar destaques:", error);
    }
}

function _setupDestaquesRodadasAutoRefresh(rodada) {
    if (_rodadasDestaquesTimer) clearInterval(_rodadasDestaquesTimer);
    _rodadasDestaquesTimer = setInterval(() => {
        const card = document.getElementById('rodadas-destaques-card');
        if (!card || !document.contains(card)) {
            clearInterval(_rodadasDestaquesTimer);
            _rodadasDestaquesTimer = null;
            return;
        }
        if (statusMercadoAtual !== 2) {
            clearInterval(_rodadasDestaquesTimer);
            _rodadasDestaquesTimer = null;
            return;
        }
        _carregarDestaquesRodada();
    }, 60000);
}

function _renderizarDestaquesRodadas(escalacao, rodada, todosZerados = false) {
    const card = document.getElementById('rodadas-destaques-card');
    const atletas = [
        ...(escalacao.atletas || []),
        ...(escalacao.reservas || [])
    ];
    const capitaoId = escalacao.capitao_id;

    // Normalizar campo de pontos: ParciaisModule usa `pontos`, API raw usa `pontos_num`
    atletas.forEach(a => {
        if (a.pontos_num === undefined && a.pontos !== undefined) a.pontos_num = a.pontos;
    });

    // Verificar se todos os atletas têm 0 pontos
    const _pts = a => parseFloat(a?.pontos_num ?? 0);
    const allZero = todosZerados || atletas.every(a => _pts(a) === 0);

    // Se todos zerados e não é rodada ao vivo: esconder card (dados indisponíveis)
    if (allZero && statusMercadoAtual !== 2) {
        if (card) card.style.display = 'none';
        return;
    }

    const capitao = atletas.find(a => a.atleta_id === capitaoId) || atletas[0];

    // Para maior/menor, usar pontos_efetivos quando disponível (inclui 1.5x do capitão)
    const _ptsEfetivos = a => parseFloat(a?.pontos_efetivos ?? a?.pontos_num ?? 0);
    const maior = atletas.reduce((max, a) => (_ptsEfetivos(a) > _ptsEfetivos(max) ? a : max), atletas[0]);
    const menor = atletas.reduce((min, a) => (_ptsEfetivos(a) < _ptsEfetivos(min) ? a : min), atletas[0]);

    _popularDestaquesCard('capitao', capitao, true);
    _popularDestaquesCard('maior', maior, false);
    _popularDestaquesCard('menor', menor, false);

    const rodadaBadgeEl = document.getElementById('rod-destaques-rodada');
    if (rodadaBadgeEl) rodadaBadgeEl.textContent = `Rodada ${rodada}`;

    if (window.Log) Log.info("[PARTICIPANTE-RODADAS]", `Destaques carregados - Rodada ${rodada}`);
}

function _popularDestaquesCard(tipo, atleta, isCapitao = false) {
    if (!atleta) return;

    const nomeEl = document.getElementById(`rod-nome-${tipo}`);
    const posicaoEl = document.getElementById(`rod-posicao-${tipo}`);
    const pontosEl = document.getElementById(`rod-pontos-${tipo}`);
    const escudoEl = document.getElementById(`rod-escudo-${tipo}`);

    if (nomeEl) nomeEl.textContent = atleta.apelido || atleta.nome || '--';

    if (posicaoEl) {
        const posicoes = { 1: 'GOLEIRO', 2: 'LATERAL', 3: 'ZAGUEIRO', 4: 'MEIA', 5: 'ATACANTE', 6: 'TÉCNICO' };
        posicaoEl.textContent = posicoes[atleta.posicao_id] || 'JOGADOR';
    }

    if (pontosEl) {
        let pontosDisplay;
        if (isCapitao && atleta.pontos_efetivos !== undefined) {
            pontosDisplay = parseFloat(atleta.pontos_efetivos || 0);
        } else if (isCapitao) {
            pontosDisplay = parseFloat(atleta.pontos_num || 0) * 1.5;
        } else {
            pontosDisplay = parseFloat(atleta.pontos_num || 0);
        }
        pontosEl.textContent = (Math.trunc((pontosDisplay || 0) * 100) / 100).toFixed(2);
    }

    if (escudoEl && atleta.clube_id) {
        const escudoImg = escudoEl.querySelector('img');
        if (escudoImg) {
            escudoImg.src = `/escudos/${atleta.clube_id}.png`;
            escudoImg.onerror = () => { escudoImg.src = '/escudos/default.png'; };
        }
    }
}



// =====================================================================
// POSIÇÕES E CORES - Cartola
// =====================================================================
const POSICOES_CARTOLA = {
    1: { nome: 'GOL', slug: 'gol', cor: '#FF4500' },
    2: { nome: 'LAT', slug: 'lat', cor: 'var(--app-info)' },
    3: { nome: 'ZAG', slug: 'zag', cor: 'var(--app-info)' },
    4: { nome: 'MEI', slug: 'mei', cor: 'var(--app-success-light)' },
    5: { nome: 'ATA', slug: 'ata', cor: 'var(--app-danger)' },
    6: { nome: 'TEC', slug: 'tec', cor: '#6b7280' },
};

// =====================================================================
// MINHA ESCALAÇÃO - Mini Campinho v8.0 (Campo de Futebol Inline)
// =====================================================================

// Thresholds para mito/mico de jogador
const MITO_JOGADOR = 12;
const MICO_JOGADOR = -3;

function renderizarMinhaEscalacao(rodadaData, isParcial) {
    const container = document.getElementById('minhaEscalacaoContainer');
    if (!container) return;

    // Encontrar meus dados na rodada
    const meuPart = rodadaData.participantes?.find(
        p => String(p.timeId || p.time_id) === String(meuTimeId)
    );

    if (!meuPart || !meuPart.atletas || meuPart.atletas.length === 0) {
        container.innerHTML = `
            <div class="minha-escalacao-container">
                <div class="me-sem-escalacao">
                    <span class="material-icons">group_off</span>
                    Escalação não disponível para esta rodada
                </div>
            </div>
        `;
        return;
    }

    const atletas = meuPart.atletas || [];
    const capitaoId = meuPart.capitao_id;
    const reservaLuxoId = meuPart.reserva_luxo_id;

    // Normalizar campo de pontos (pode ser pontos, pontos_num ou pontos_efetivos)
    atletas.forEach(a => {
        if (a.pontos_num === undefined && a.pontos !== undefined) {
            a.pontos_num = a.pontos;
        } else if (a.pontos_num === undefined && a.pontos_efetivos !== undefined) {
            a.pontos_num = a.pontos_efetivos;
        }
    });

    // Separar titulares e reservas (suporta is_reserva de parciais E status_id de consolidados)
    const titulares = atletas.filter(a => !a.is_reserva && a.status_id !== 2);
    const reservas = atletas.filter(a => a.is_reserva || a.status_id === 2);

    // Ordenar titulares por posição: GOL → ZAG → LAT → MEI → ATA → TEC
    const ordemPosicoes = { 1: 1, 3: 2, 2: 3, 4: 4, 5: 5, 6: 6 };
    titulares.sort((a, b) => {
        const ordemA = ordemPosicoes[a.posicao_id] || 99;
        const ordemB = ordemPosicoes[b.posicao_id] || 99;
        return ordemA - ordemB;
    });

    // Ordenar reservas também
    reservas.sort((a, b) => {
        const ordemA = ordemPosicoes[a.posicao_id] || 99;
        const ordemB = ordemPosicoes[b.posicao_id] || 99;
        return ordemA - ordemB;
    });

    // Calcular substituições (regras oficiais Cartola FC 2025/2026)
    const substituicoes = new Map();
    const titularesSubstituidos = new Map(); // atleta_id -> 'ausente' | 'luxo'

    // Verificar se dados pré-computados estão disponíveis (parciais)
    const temDadosParciais = atletas.some(a =>
        a.substituido_por !== undefined || a.substituiu_apelido !== undefined || a.luxo_ativado !== undefined
    );

    if (temDadosParciais) {
        // Usar dados pré-computados do módulo de parciais
        atletas.forEach(a => {
            if (a.is_reserva && a.contribuiu) {
                if (a.luxo_ativado) {
                    substituicoes.set(a.atleta_id, {
                        tipo: 'luxo',
                        substituiu: a.substituiu_apelido || '',
                        herdouCapitao: a.luxo_herdou_capitao || false,
                    });
                } else if (a.substituiu_apelido) {
                    substituicoes.set(a.atleta_id, { tipo: 'posicao', substituiu: a.substituiu_apelido });
                }
            }
            if (!a.is_reserva && a.substituido_por_luxo) {
                titularesSubstituidos.set(a.atleta_id, 'luxo');
            } else if (!a.is_reserva && a.substituido_por) {
                titularesSubstituidos.set(a.atleta_id, 'ausente');
            }
        });
    } else {
        // Fallback: computar localmente para dados consolidados
        const titularesSemJogo = new Map();
        titulares.forEach(t => {
            if (t.entrou_em_campo === false) {
                if (!titularesSemJogo.has(t.posicao_id)) {
                    titularesSemJogo.set(t.posicao_id, []);
                }
                titularesSemJogo.get(t.posicao_id).push(t);
            }
        });

        // Reservas comuns primeiro
        reservas.forEach(r => {
            const isLuxo = r.atleta_id === reservaLuxoId || r.is_reserva_luxo;
            if (isLuxo) return;
            const entrou = r.entrou_em_campo === true || r.contribuiu === true;
            if (!entrou) return;

            if (titularesSemJogo.has(r.posicao_id)) {
                const tits = titularesSemJogo.get(r.posicao_id);
                if (tits.length > 0) {
                    const titular = tits.shift();
                    substituicoes.set(r.atleta_id, { tipo: 'posicao', substituiu: titular.apelido || 'Titular' });
                    titularesSubstituidos.set(titular.atleta_id, 'ausente');
                }
            }
        });

        // Depois o Luxo
        const luxoReserva = reservas.find(r => r.atleta_id === reservaLuxoId || r.is_reserva_luxo);
        if (luxoReserva) {
            const entrou = luxoReserva.entrou_em_campo === true || luxoReserva.contribuiu === true;
            if (entrou) {
                if (titularesSemJogo.has(luxoReserva.posicao_id) && titularesSemJogo.get(luxoReserva.posicao_id).length > 0) {
                    // Luxo como reserva comum
                    const tits = titularesSemJogo.get(luxoReserva.posicao_id);
                    const titular = tits.shift();
                    substituicoes.set(luxoReserva.atleta_id, { tipo: 'posicao', substituiu: titular.apelido || 'Titular' });
                    titularesSubstituidos.set(titular.atleta_id, 'ausente');
                } else {
                    // Luxo special: encontrar pior titular da posição que jogou
                    const titularesNaPosicao = titulares.filter(
                        t => t.posicao_id === luxoReserva.posicao_id && t.entrou_em_campo !== false
                    );
                    if (titularesNaPosicao.length > 0) {
                        const luxoPts = Number(luxoReserva.pontos_num ?? luxoReserva.pontos ?? 0);
                        const pior = titularesNaPosicao.reduce((p, t) => {
                            const ptsP = Number(p.pontos_num ?? p.pontos ?? 0);
                            const ptsT = Number(t.pontos_num ?? t.pontos ?? 0);
                            return ptsT < ptsP ? t : p;
                        }, titularesNaPosicao[0]);
                        const piorPts = Number(pior.pontos_num ?? pior.pontos ?? 0);
                        if (luxoPts > piorPts) {
                            substituicoes.set(luxoReserva.atleta_id, { tipo: 'luxo', substituiu: pior.apelido || 'Titular' });
                            titularesSubstituidos.set(pior.atleta_id, 'luxo');
                        }
                    }
                }
            }
        }
    }

    // Estatísticas
    const pontos = Number(meuPart.pontos || 0);
    const posicao = meuPart.posicao || '-';
    const totalPart = rodadaData.totalParticipantesAtivos || rodadaData.participantes?.length || 0;

    // Nome do time
    const nomeTime = meuPart.nome || meuPart.nome_time || 'Meu Time';
    const nomeCartola = meuPart.nome_cartola || '';

    // Pontos formatados (truncar, nunca arredondar)
    const pontosFormatados = typeof window.truncarPontos === 'function'
        ? window.truncarPontos(pontos)
        : (Math.trunc(pontos * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Posições do Cartola
    const POSICOES = {
        1: { nome: 'GOL', cor: 'var(--app-pos-gol, #FF4500)' },
        2: { nome: 'LAT', cor: 'var(--app-info)' },
        3: { nome: 'ZAG', cor: 'var(--app-info)' },
        4: { nome: 'MEI', cor: 'var(--app-success-light)' },
        5: { nome: 'ATA', cor: 'var(--app-danger)' },
        6: { nome: 'TEC', cor: 'var(--app-text-muted)' },
    };

    // Siglas dos clubes (fallback para display compacto)
    const CLUBES_SIGLA = {
        262: 'FLA', 263: 'BOT', 264: 'COR', 265: 'BAH', 266: 'FLU', 267: 'VAS',
        275: 'PAL', 276: 'SAO', 277: 'SAN', 280: 'RBB', 282: 'CAM', 283: 'CRU',
        284: 'GRE', 285: 'INT', 286: 'JUV', 287: 'VIT', 290: 'GOI', 292: 'SPT',
        293: 'CAP', 354: 'CEA', 356: 'FOR', 1371: 'CUI', 2305: 'MIR',
        270: 'CFC', 273: 'AME', 274: 'CHA', 288: 'PON', 315: 'NOV', 344: 'STA', 373: 'CRB',
    };
    // Nomes completos dos clubes (para display na meta line)
    const CLUBES_NOME = {
        262: 'Flamengo', 263: 'Botafogo', 264: 'Corinthians', 265: 'Bahia',
        266: 'Fluminense', 267: 'Vasco', 275: 'Palmeiras', 276: 'São Paulo',
        277: 'Santos', 280: 'Bragantino', 282: 'Atlético-MG', 283: 'Cruzeiro',
        284: 'Grêmio', 285: 'Internacional', 286: 'Juventude', 287: 'Vitória',
        290: 'Goiás', 292: 'Sport', 293: 'Athletico-PR', 354: 'Ceará',
        356: 'Fortaleza', 1371: 'Cuiabá', 2305: 'Mirassol',
        270: 'Coritiba', 273: 'América-MG', 274: 'Chapecoense', 288: 'Ponte Preta',
        315: 'Novorizontino', 344: 'Santa Cruz', 373: 'CRB',
    };

    // Scouts — labels e classificação (positivo/negativo para cor)
    const SCOUTS_CONFIG = {
        G:  { label: 'G',  positivo: true },
        A:  { label: 'A',  positivo: true },
        FD: { label: 'FD', positivo: true },
        FS: { label: 'FS', positivo: true },
        PE: { label: 'PE', positivo: true },
        DS: { label: 'DS', positivo: true },
        SG: { label: 'SG', positivo: true },
        DE: { label: 'DE', positivo: true },
        FF: { label: 'FF', positivo: false },
        FC: { label: 'FC', positivo: false },
        FT: { label: 'FT', positivo: false },
        CA: { label: 'CA', positivo: false },
        CV: { label: 'CV', positivo: false },
        GC: { label: 'GC', positivo: false },
        GS: { label: 'GS', positivo: false },
        I:  { label: 'I',  positivo: false },
        PP: { label: 'PP', positivo: false },
    };

    // Renderizar scouts compactos
    function renderScouts(scout) {
        if (!scout || typeof scout !== 'object') return '';
        const entries = Object.entries(scout).filter(([k]) => SCOUTS_CONFIG[k]);
        if (entries.length === 0) return '';

        const badges = entries.map(([key, val]) => {
            const cfg = SCOUTS_CONFIG[key];
            const qtyPrefix = val > 1 ? `${val}` : '';
            const cssClass = cfg.positivo ? 'me-scout-pos' : 'me-scout-neg';
            return `<span class="${cssClass}">${qtyPrefix}${cfg.label}</span>`;
        }).join(' ');

        return `<div class="me-card-scouts">${badges}</div>`;
    }

    // Função para determinar status do jogo baseado em data/hora
    function obterStatusJogo(atleta) {
        if (!isParcial) {
            return 'finished';
        }
        if (atleta.entrou_em_campo === true || (atleta.pontos_num != null && atleta.pontos_num !== 0)) {
            return 'played';
        }
        if (atleta.entrou_em_campo === false) {
            return 'absent';
        }

        const jogoInfo = atleta.jogo || {};
        const dataJogo = jogoInfo.data_jogo || jogoInfo.data || null;
        const horaJogo = jogoInfo.hora || null;

        if (!dataJogo) return 'upcoming';

        try {
            const horaStr = horaJogo ? horaJogo.substring(0, 5) : '00:00';
            const dataHoraJogo = new Date(`${dataJogo}T${horaStr}:00-03:00`);
            const agora = new Date();
            const diffMinutos = (agora - dataHoraJogo) / (1000 * 60);

            if (diffMinutos < -10) return 'upcoming';
            if (diffMinutos <= 150) return 'playing';
            return 'finished';
        } catch (err) {
            if (window.Log) Log.warn('[RODADAS] Erro ao processar data do jogo:', err);
            return 'upcoming';
        }
    }

    // Renderizar atleta como card compacto (estilo Cartola FC)
    function renderAtleta(a, isReserva = false, subInfo = null) {
        const pos = POSICOES[a.posicao_id] || { nome: '???', cor: 'var(--app-text-muted)' };
        const pontosRaw = a.pontos_num ?? 0;
        const pontosAtl = (Math.trunc(Number(pontosRaw) * 100) / 100).toFixed(2);
        const pontosColorClass = pontosRaw > 0 ? 'me-pts-pos' : pontosRaw < 0 ? 'me-pts-neg' : 'me-pts-zero';

        const isCapitao = a.atleta_id === capitaoId;
        const isLuxo = a.atleta_id === reservaLuxoId && isReserva;

        const capitaoBadge = isCapitao ? '<span class="me-badge me-badge-cap">C</span>' : '';
        const luxoBadge = isLuxo ? '<span class="me-badge me-badge-luxo">L</span>' : '';

        // Badge de substituição
        let subBadge = '';
        if (subInfo) {
            if (subInfo.tipo === 'luxo') {
                const textoLuxo = subInfo.herdouCapitao
                    ? `Luxo ativado (C 1.5x) por ${subInfo.substituiu}`
                    : `Luxo ativado por ${subInfo.substituiu}`;
                subBadge = `<div class="me-card-sub me-card-sub-luxo"><span class="material-icons me-card-sub-icon">star</span> ${textoLuxo}</div>`;
            } else if (subInfo.tipo === 'posicao') {
                subBadge = `<div class="me-card-sub me-card-sub-pos"><span class="material-icons me-card-sub-icon">swap_vert</span> Entrou por ${subInfo.substituiu}</div>`;
            } else if (subInfo.tipo === 'substituido') {
                subBadge = '<div class="me-card-sub me-card-sub-out">Não entrou em campo</div>';
            } else if (subInfo.tipo === 'substituido_luxo') {
                subBadge = '<div class="me-card-sub me-card-sub-luxo"><span class="material-icons me-card-sub-icon">swap_vert</span> Substituído pelo Luxo</div>';
            }
        }

        const clubeId = a.clube_id || extrairClubeIdDaFoto(a.foto) || null;
        const escudoSrc = clubeId ? `/escudos/${clubeId}.png` : '/escudos/default.png';
        const clubeNome = CLUBES_NOME[clubeId] || '';

        const csAtl = a.variacao_num ?? 0;
        const csColorClass = csAtl > 0 ? 'me-cs-pos' : csAtl < 0 ? 'me-cs-neg' : 'me-cs-zero';
        const csTexto = csAtl > 0 ? `$+${(Math.trunc(csAtl * 100) / 100).toFixed(2)}` : `$${(Math.trunc(csAtl * 100) / 100).toFixed(2)}`;

        // Scouts do atleta
        const scoutsHTML = renderScouts(a.scout);

        // Status do jogo
        const status = obterStatusJogo(a);
        const statusDot = status === 'playing' ? '<span class="me-card-live"></span>' : '';

        // Multiplicador de capitão
        const capMulti = isCapitao ? '<span class="me-cap-multi">x1,5</span>' : '';

        return `
            <div class="me-card${status === 'absent' ? ' me-card-absent' : ''}">
                <img class="me-card-escudo" src="${escudoSrc}" alt="" onerror="this.onerror=null;this.src='/escudos/default.png'">
                <div class="me-card-info">
                    <div class="me-card-nome">${statusDot}${escapeHtml(a.apelido || 'Atleta')}${capitaoBadge}${luxoBadge}</div>
                    <div class="me-card-meta"><span class="me-pos-badge" style="color:${pos.cor}">${pos.nome}</span> | ${escapeHtml(clubeNome)}</div>
                    ${subBadge}
                </div>
                <div class="me-card-stats">
                    <div class="me-card-pts ${pontosColorClass}">${capMulti}${pontosAtl}</div>
                    <div class="me-card-cs ${csColorClass}">${csTexto}</div>
                    ${scoutsHTML}
                </div>
            </div>
        `;
    }

    const titularesHTML = titulares.length > 0
        ? titulares.map(a => {
            let subInfo = null;
            if (titularesSubstituidos.has(a.atleta_id)) {
                const tipo = titularesSubstituidos.get(a.atleta_id);
                subInfo = tipo === 'luxo' ? { tipo: 'substituido_luxo' } : { tipo: 'substituido' };
            }
            return renderAtleta(a, false, subInfo);
        }).join("")
        : '<div class="me-card-empty">Sem titulares</div>';

    const reservasHTML = reservas.length > 0
        ? reservas.map(a => renderAtleta(a, true, substituicoes.get(a.atleta_id) || null)).join("")
        : '';

    // Verificar se escalação está expandida (padrão: colapsado)
    const isExpanded = localStorage.getItem('superCartola_escalacaoExpandida') === 'true';
    const expandedClass = isExpanded ? 'expanded' : '';

    container.innerHTML = `
        <div class="minha-escalacao-container me-container">
            <!-- Toggle Header (sempre visível) -->
            <div class="me-toggle-header ${expandedClass}" onclick="window.toggleMinhaEscalacao()">
                <div class="me-toggle-header-left">
                    <span class="material-icons">sports_soccer</span>
                    <div>
                        <div class="me-toggle-title">Minha Escalação</div>
                        <div class="me-toggle-subtitle">${escapeHtml(nomeTime)} • ${pontosFormatados} pts • ${posicao}º/${totalPart}</div>
                    </div>
                </div>
                <span class="material-icons me-toggle-chevron">expand_more</span>
            </div>

            <!-- Conteúdo Colapsável -->
            <div class="me-collapsible-content ${expandedClass}" id="minhaEscalacaoContent">
                <!-- Header com info do time -->
                <div class="me-header-info">
                    <div class="me-header-nome">${escapeHtml(nomeTime)}</div>
                    <div class="me-header-cartola">${escapeHtml(nomeCartola)}</div>
                </div>

                <!-- Stats -->
                <div class="me-stats-grid">
                    <div class="me-stat-box">
                        <div class="me-stat-label">Pontos</div>
                        <div class="me-stat-value me-stat-pontos">${pontosFormatados}</div>
                    </div>
                    <div class="me-stat-box">
                        <div class="me-stat-label">Posição</div>
                        <div class="me-stat-value">${posicao}º <span class="me-stat-total">/${totalPart}</span></div>
                    </div>
                </div>

                <!-- Titulares -->
                <div class="me-section">
                    <div class="me-section-title">Titulares (${titulares.length})</div>
                    ${titularesHTML}
                </div>

                <!-- Separador Banco de Reservas -->
                ${reservas.length > 0 ? `
                    <div class="me-banco-divider">
                        <div class="me-banco-line"></div>
                        <span class="me-banco-label">
                            <span class="material-icons me-banco-icon">event_seat</span>
                            Reservas
                        </span>
                        <div class="me-banco-line"></div>
                    </div>
                    <div class="me-section me-section-reservas">
                        ${reservasHTML}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Toggle para expandir/colapsar Minha Escalação
window.toggleMinhaEscalacao = function() {
    const header = document.querySelector('.me-toggle-header');
    const content = document.getElementById('minhaEscalacaoContent');

    if (!header || !content) return;

    const isExpanded = header.classList.contains('expanded');

    if (isExpanded) {
        header.classList.remove('expanded');
        content.classList.remove('expanded');
        localStorage.setItem('superCartola_escalacaoExpandida', 'false');
    } else {
        header.classList.add('expanded');
        content.classList.add('expanded');
        localStorage.setItem('superCartola_escalacaoExpandida', 'true');
    }
};


// Helper para extrair clube_id da foto do atleta (fallback)
function extrairClubeIdDaFoto(foto) {
    if (!foto) return null;
    // Foto formato: https://s.sde.globo.com/media/organizations/2024/04/11/ESCUDO.png
    // ou: https://s3.glbimg.com/v1/AUTH_.../escudos/65x65/CLUBE_ID.png
    const match = foto.match(/\/escudos\/\d+x\d+\/(\d+)\.png/);
    if (match) return parseInt(match[1]);
    
    // Outro formato possível
    const match2 = foto.match(/clube[_-]?(\d+)/i);
    if (match2) return parseInt(match2[1]);
    
    return null;
}

// =====================================================================
// GRÁFICO EVOLUTIVO DE DESEMPENHO
// =====================================================================
function renderizarGraficoEvolutivo(rodadas, rodadaSelecionadaNum) {
    const chartContainer = document.getElementById('chartDesempenhoEvolutivo');
    const barsContainer = document.getElementById('chartBarsContainer');
    if (!chartContainer || !barsContainer) return;

    // Buscar pontos do meu time em cada rodada
    const meusDados = [];
    let maxPontos = 0;

    rodadas.forEach(rodada => {
        const meuPart = rodada.participantes?.find(
            p => String(p.timeId || p.time_id) === String(meuTimeId)
        );
        const pontos = meuPart ? Number(meuPart.pontos || 0) : 0;
        const jogou = meuPart && !meuPart.rodadaNaoJogada;
        meusDados.push({
            rodada: rodada.numero,
            pontos,
            jogou,
        });
        if (Math.abs(pontos) > maxPontos) maxPontos = Math.abs(pontos);
    });

    if (meusDados.length === 0 || maxPontos === 0) {
        chartContainer.style.display = 'none';
        return;
    }

    const barHeight = 60; // px
    let barsHTML = '';

    meusDados.forEach(d => {
        const isActive = d.rodada === rodadaSelecionadaNum;
        const height = d.jogou ? Math.max(4, (Math.abs(d.pontos) / maxPontos) * barHeight) : 4;
        const cls = !d.jogou ? 'nao-jogou' : d.pontos > 0 ? 'positivo' : d.pontos < 0 ? 'negativo' : 'neutro';

        barsHTML += `<div class="me-chart-bar ${cls} ${isActive ? 'active' : ''}"
            style="height:${height}px"
            data-rodada="${d.rodada}"
            title="R${d.rodada}: ${d.jogou ? (Math.trunc((d.pontos||0) * 10) / 10).toFixed(1) + ' pts' : 'Não jogou'}"
            onclick="window.selecionarRodadaMini(${d.rodada}, false)"></div>`;
    });

    barsContainer.innerHTML = barsHTML;
    chartContainer.style.display = 'block';
}

// =====================================================================
// SELEÇÃO DE RODADA
// =====================================================================
async function selecionarRodada(numeroRodada, isParcial = false) {
    if (window.Log)
        Log.info(`[PARTICIPANTE-RODADAS] 📌 Selecionando rodada ${numeroRodada} (parcial: ${isParcial})`);
    if (window.Log)
        Log.info(`[PARTICIPANTE-RODADAS] 📊 Cache: ${todasRodadasCache.length} rodadas em cache`);

    rodadaSelecionada = numeroRodada;

    // ✅ FIX: Atualizar título EAGERLY — garante "Rodada N" em TODOS os paths (sucesso e erro)
    const tituloEl = document.getElementById("rodadaTitulo");
    if (tituloEl) tituloEl.textContent = `Rodada ${numeroRodada}`;

    ParciaisModule.pararAutoRefresh?.();
    PollingInteligenteModule.parar?.();
    atualizarIndicadorAutoRefresh({ ativo: false });

    const detalhamento = document.getElementById("rodadaDetalhamento");
    if (detalhamento) {
        detalhamento.style.display = "block";
    }

    const rankingContainer = document.getElementById("rankingListPro");
    if (rankingContainer) {
        rankingContainer.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="loading-spinner-rodadas"></div>
                <p style="color: var(--app-text-muted); margin-top: 16px;">Carregando...</p>
            </div>
        `;
    }

    const isRodadaParcial = parciaisInfo?.disponivel && numeroRodada === parciaisInfo.rodada;

    try {
        if (isRodadaParcial) {
            await carregarERenderizarParciais(numeroRodada);

            // ✅ FEAT-026: Usar Polling Inteligente baseado em calendário
            PollingInteligenteModule.inicializar({
                temporada: TEMPORADA_ATUAL,
                rodada: numeroRodada,
                ligaId: ligaId,
                timeId: meuTimeId,
                onUpdate: (dados) => {
                    if (rodadaSelecionada !== numeroRodada) return;
                    renderizarParciaisDados(numeroRodada, dados);
                },
                onStatus: atualizarIndicadorAutoRefresh
            });
        } else {
            const rodadaData = todasRodadasCache.find((r) => r.numero === numeroRodada);
            if (window.Log)
                Log.info(`[PARTICIPANTE-RODADAS] 🔍 Rodada ${numeroRodada}: ${rodadaData ? rodadaData.participantes.length + ' participantes' : 'NÃO ENCONTRADA'}`);

            if (!rodadaData || rodadaData.participantes.length === 0) {
                // Fallback: buscar diretamente da API se cache falhou
                if (window.Log) Log.warn(`[PARTICIPANTE-RODADAS] ⚠️ Cache vazio, buscando da API...`);
                try {
                    const res = await fetch(`/api/rodadas/${ligaId}/rodadas?rodada=${numeroRodada}&temporada=${TEMPORADA_ATUAL}`);
                    if (res.ok) {
                        const rodadasRaw = await res.json();
                        // Normalizar formato: backend retorna { rodadas: [], cacheHint: {} } desde ba496f8
                        const rodadas = Array.isArray(rodadasRaw) ? rodadasRaw : (rodadasRaw?.rodadas || []);
                        if (rodadas.length > 0) {
                            const agrupadas = agruparRodadasPorNumero(rodadas);
                            const dadosFresh = agrupadas.find(r => r.numero === numeroRodada);
                            if (dadosFresh && dadosFresh.participantes.length > 0) {
                                renderizarDetalhamentoRodada(dadosFresh, false);
                                setTimeout(() => detalhamento?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                                return;
                            }
                        }
                    }
                } catch (fetchErr) {
                    if (window.Log) Log.error(`[PARTICIPANTE-RODADAS] ❌ Fallback API falhou:`, fetchErr);
                }

                if (rankingContainer) {
                    rankingContainer.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: var(--app-text-muted);">
                            <span class="material-icons" style="font-size: 48px; margin-bottom: 16px;">inbox</span>
                            <p>Dados desta rodada não disponíveis</p>
                            <button onclick="selecionarRodada(${numeroRodada}, false)"
                                    style="margin-top: 16px; padding: 10px 20px; background: var(--app-primary); color: white; border: none; border-radius: 8px; cursor: pointer;">
                                Tentar Novamente
                            </button>
                        </div>
                    `;
                }
                return;
            }

            renderizarDetalhamentoRodada(rodadaData, false);
        }
    } catch (error) {
        if (window.Log) Log.error(`[PARTICIPANTE-RODADAS] ❌ Erro ao selecionar rodada:`, error);
        if (rankingContainer) {
            rankingContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--app-danger);">
                    <span class="material-icons" style="font-size: 48px; margin-bottom: 16px;">error_outline</span>
                    <p>Erro ao carregar rodada. Tente novamente.</p>
                </div>
            `;
        }
    }

    // ✅ FIX: Atualizar destaques da rodada para a rodada selecionada
    _carregarDestaquesRodada(numeroRodada);

    setTimeout(() => {
        detalhamento?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
}

window.selecionarRodada = selecionarRodada;

// =====================================================================
// CARREGAR E RENDERIZAR PARCIAIS
// =====================================================================
async function carregarERenderizarParciais(numeroRodada) {
    const titulo = document.getElementById("rodadaTitulo");
    if (titulo) {
        titulo.innerHTML = `Rodada ${numeroRodada} <span class="badge-parcial">EM ANDAMENTO</span>`;
    }

    const resumo = document.getElementById("rodadaResumo");
    if (resumo) {
        resumo.textContent = "Carregando pontuações parciais...";
    }

    try {
        const dados = await ParciaisModule.carregarParciais();
        renderizarParciaisDados(numeroRodada, dados);
    } catch (error) {
        if (window.Log)
            Log.error("[PARTICIPANTE-RODADAS] Erro ao carregar parciais:", error);
        const rankingContainer = document.getElementById("rankingListPro");
        if (rankingContainer) {
            rankingContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--app-danger);">
                    <span class="material-icons" style="font-size: 48px; margin-bottom: 16px;">error_outline</span>
                    <p>Erro ao carregar parciais</p>
                    <button onclick="selecionarRodada(${numeroRodada}, true)"
                            style="margin-top: 16px; padding: 10px 20px; background: var(--app-primary); color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Tentar Novamente
                    </button>
                </div>
            `;
        }
    }
}

function renderizarParciaisDados(numeroRodada, dados) {
    const titulo = document.getElementById("rodadaTitulo");
    if (titulo) {
        titulo.innerHTML = `Rodada ${numeroRodada} <span class="badge-parcial">EM ANDAMENTO</span>`;
    }

    const resumo = document.getElementById("rodadaResumo");
    const rankingContainer = document.getElementById("rankingListPro");
    const participantes = dados?.participantes || [];
    const inativos = dados?.inativos || [];

    const minhaPosicao = ParciaisModule.obterMinhaPosicaoParcial();

    if (!dados || !Array.isArray(participantes) || participantes.length === 0) {
        if (rankingContainer) {
            let html = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <span class="material-icons" style="font-size: 48px; margin-bottom: 16px;">hourglass_empty</span>
                    <p>Aguardando pontuações...</p>
                    <p style="font-size: 12px; margin-top: 8px;">Os dados aparecerão quando os jogos começarem</p>
                </div>
            `;
            if (inativos.length > 0) {
                html += renderizarSecaoInativos(inativos, numeroRodada);
            }
            rankingContainer.innerHTML = html;
        }

        if (resumo) {
            const infoInativos = inativos.length > 0 ? ` • ${inativos.length} inativo${inativos.length > 1 ? "s" : ""}` : "";
            resumo.innerHTML = `0 participantes • Sua posição: ${minhaPosicao?.posicao || "-"}º${infoInativos}`;
        }

        return;
    }

    const rodadaData = {
        numero: numeroRodada,
        participantes: participantes,
        isParcial: true,
        atualizadoEm: dados?.atualizadoEm,
    };

    if (minhaPosicao) {
        rodadaData.posicaoFinanceira = minhaPosicao.posicao;
        rodadaData.meusPontos = minhaPosicao.pontos;
    }

    renderizarDetalhamentoRodada(rodadaData, true, inativos);

    if (resumo) {
        const horaAtualizacao = dados?.atualizadoEm
            ? new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "--:--";
        const infoInativos = inativos.length > 0 ? ` • ${inativos.length} inativo${inativos.length > 1 ? "s" : ""}` : "";
        resumo.innerHTML = `${dados?.totalTimes || participantes.length} participantes • Sua posição: ${minhaPosicao?.posicao || "-"}º${infoInativos}
            <span style="color: #6b7280; font-size: 11px;"> • Atualizado às ${horaAtualizacao}</span>`;
    }
}

// =====================================================================
// ZONA LABELS - MITO, G2-G12, Neutro, Z1-Z11, MICO
// =====================================================================
function calcularZonaLabel(posicao, totalParticipantes, valorFinanceiro, totalPerda) {
    if (!posicao || !totalParticipantes) return '';

    // Derivar zona a partir do valorFinanceiro
    if (valorFinanceiro > 0) {
        // Zona de Ganho
        if (posicao === 1) {
            return '<span class="zona-badge zona-mito">MITO</span>';
        }
        return `<span class="zona-badge zona-g">G${posicao}</span>`;
    } else if (valorFinanceiro < 0) {
        // Zona de Risco - MICO é o último, Z numera de cima pra baixo
        if (posicao === totalParticipantes) {
            return '<span class="zona-badge zona-mico">MICO</span>';
        }
        // Z1 = primeiro da zona de perda (mais perto do neutro)
        // ZN = penúltimo (mais perto do MICO)
        const perdaEfetiva = totalPerda || 1;
        const inicioPerda = totalParticipantes - perdaEfetiva + 1;
        const zNum = posicao - inicioPerda + 1;
        return `<span class="zona-badge zona-z">Z${zNum}</span>`;
    }

    // Neutro - sem label
    return '';
}

// =====================================================================
// DETALHAMENTO DA RODADA
// =====================================================================
function renderizarDetalhamentoRodada(rodadaData, isParcial = false, inativos = []) {
    const titulo = document.getElementById("rodadaTitulo");
    if (titulo) {
        if (isParcial) {
            titulo.innerHTML = `Rodada ${rodadaData.numero} <span class="badge-parcial">EM ANDAMENTO</span>`;
        } else {
            titulo.textContent = `Rodada ${rodadaData.numero}`;
        }
    }

    const todosParticipantes = rodadaData.participantes || [];
    let participantesAtivos = [];
    let participantesInativos = inativos.length > 0 ? inativos : [];
    const rodadaNum = rodadaData.numero;

    if (inativos.length === 0) {
        todosParticipantes.forEach((p) => {
            if (p.ativo === false && p.rodada_desistencia) {
                if (rodadaNum < p.rodada_desistencia) {
                    participantesAtivos.push(p);
                } else {
                    participantesInativos.push(p);
                }
            } else if (p.ativo === false && !p.rodada_desistencia) {
                participantesInativos.push(p);
            } else {
                participantesAtivos.push(p);
            }
        });
    } else {
        participantesAtivos = todosParticipantes;
    }

    const resumo = document.getElementById("rodadaResumo");
    if (resumo && !isParcial) {
        const totalAtivos = participantesAtivos.length;

        let minhaPosicao = rodadaData.posicaoFinanceira;
        if (minhaPosicao == null) {
            const ordenados = [...participantesAtivos].sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
            const meuIndex = ordenados.findIndex((p) => String(p.timeId || p.time_id) === String(meuTimeId));
            minhaPosicao = meuIndex >= 0 ? meuIndex + 1 : "-";
        }

        const infoInativos = participantesInativos.length > 0 ? ` • ${participantesInativos.length} inativo${participantesInativos.length > 1 ? "s" : ""}` : "";
        resumo.textContent = `${totalAtivos} participantes • Sua posição: ${minhaPosicao}º${infoInativos}`;
    }

    const participantesOrdenados = [...participantesAtivos].sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
    const totalParticipantes = participantesOrdenados.length;
    const totalPerda = participantesOrdenados.filter(p => (p.valorFinanceiro || 0) < 0).length;
    const container = document.getElementById("rankingListPro");

    if (!container) return;

    // === Linha compacta "Meu Status" acima do ranking ===
    let meuResumoHTML = '';
    const meuPartIndex = participantesOrdenados.findIndex(
        (p) => String(p.timeId || p.time_id) === String(meuTimeId)
    );
    if (meuPartIndex >= 0) {
        const meuPart = participantesOrdenados[meuPartIndex];
        const minhaPosicaoCalc = meuPart.posicao || meuPartIndex + 1;
        const meusValor = meuPart.valorFinanceiro || 0;
        const meusValorAbs = Math.abs(meusValor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const meusValorTexto = meusValor > 0 ? `+R$ ${meusValorAbs}` : meusValor < 0 ? `-R$ ${meusValorAbs}` : '';
        const meusValorCor = meusValor > 0 ? 'var(--app-success-light)' : meusValor < 0 ? 'var(--app-danger)' : 'var(--app-text-muted)';

        const meuZonaBadge = !isParcial ? calcularZonaLabel(minhaPosicaoCalc, totalParticipantes, meusValor, totalPerda) : '';

        if (meuZonaBadge || meusValorTexto) {
            meuResumoHTML = `
                <div class="meu-status-inline">
                    ${meuZonaBadge}
                    ${meusValorTexto ? `<span class="meu-status-fin" style="color:${meusValorCor}">${meusValorTexto}</span>` : ''}
                </div>
            `;
        }
    }

    // ✅ v8.0: Agrupar participantes por zona financeira
    const zonaGanho = participantesOrdenados.filter(p => (p.valorFinanceiro || 0) > 0);
    const zonaNeutra = participantesOrdenados.filter(p => (p.valorFinanceiro || 0) === 0);
    const zonaPerda = participantesOrdenados.filter(p => (p.valorFinanceiro || 0) < 0);

    // Função para renderizar um item compacto
    function renderItemCompacto(participante, index) {
        const timeId = participante.timeId || participante.time_id;
        const isMeuTime = String(timeId) === String(meuTimeId);
        const posicao = participante.posicao || index + 1;
        const valorFinanceiro = participante.valorFinanceiro || 0;

        const valorFormatado = Math.abs(valorFinanceiro).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        const financeiroTexto = valorFinanceiro > 0 ? `+${valorFormatado}` : valorFinanceiro < 0 ? `-${valorFormatado}` : "0,00";
        const financeiroClass = valorFinanceiro > 0 ? "positivo" : valorFinanceiro < 0 ? "negativo" : "neutro";

        const isMito = posicao === 1;
        const isMico = posicao === totalParticipantes && totalParticipantes > 1;

        const pontosRaw = Number(participante.pontos || 0);
        const pontosFormatados = typeof window.truncarPontos === 'function'
            ? window.truncarPontos(pontosRaw)
            : (Math.trunc(pontosRaw * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // ✅ v8.1: Fallback robusto para nome — nunca exibir "N/D"
        let nomeTime = participante.nome || participante.nome_time || "";
        if (!nomeTime || nomeTime === "N/D") {
            nomeTime = participante.nome_cartola && participante.nome_cartola !== "N/D"
                ? participante.nome_cartola
                : `Time #${timeId}`;
        }
        const naoJogouBadge = participante.rodadaNaoJogada ? '<span class="badge-nao-jogou">N/E</span>' : "";

        // ✅ v8.0: Escudo do time do coração
        const clubeId = participante.clube_id;
        const escudoSrc = clubeId ? `/escudos/${clubeId}.png` : null;
        const escudoHTML = escudoSrc
            ? `<img src="${escudoSrc}" alt="" class="rk-escudo" onerror="this.onerror=null;this.src='/escudos/default.png'">`
            : '<span class="rk-escudo-placeholder"></span>';

        // Badge "X/12 em campo" para parciais
        const escalados = participante.atletas ? participante.atletas.filter(a => !a.is_reserva).length : 0;
        const jogandoAoVivo = participante.atletas ? participante.atletas.filter(a => !a.is_reserva && a.entrou_em_campo_real === true).length : 0;
        const badgeEmCampo = isParcial && escalados > 0
            ? `<span class="rk-em-campo ${jogandoAoVivo > 0 ? 'ativo' : ''}">${jogandoAoVivo}/${escalados}</span>`
            : "";

        const curiosarAttr = !participante.rodadaNaoJogada
            ? `data-curiosar-time-id="${timeId}"`
            : "";

        // Ícone especial para MITO
        let posicaoContent = `${posicao}º`;
        let itemExtraClass = '';
        if (isMito && !isParcial) {
            posicaoContent = '<span class="material-icons rk-trophy">emoji_events</span>';
            itemExtraClass = 'rk-item-mito';
        } else if (isMico && !isParcial) {
            itemExtraClass = 'rk-item-mico';
        }

        const finHtml = !isParcial && financeiroTexto !== "0,00"
            ? `<div class="rk-fin ${financeiroClass}">${financeiroTexto}</div>`
            : '';

        return `
            <div class="rk-item ${isMeuTime ? "rk-meu-time" : ""} ${itemExtraClass}" ${curiosarAttr}>
                <div class="rk-pos">${posicaoContent}</div>
                ${escudoHTML}
                <div class="rk-info">
                    <div class="rk-nome-row">
                        <div class="rk-nome">${escapeHtml(nomeTime)}</div>
                        ${naoJogouBadge}
                        ${badgeEmCampo}
                    </div>
                    <div class="rk-cartola">${escapeHtml(participante.nome_cartola || "")}</div>
                </div>
                <div class="rk-stats">
                    <div class="rk-pts">${pontosFormatados}</div>
                    ${finHtml}
                </div>
            </div>
        `;
    }

    // Botão Raio-X da Rodada (somente se não for parcial e tiver dados do meu time)
    let xrayBtnHTML = '';
    if (!isParcial && meuPartIndex >= 0) {
        xrayBtnHTML = `
            <button class="rodada-xray-btn" onclick="window.xrayParams={rodada:${rodadaNum},temporada:${TEMPORADA_ATUAL}};window.participanteNav?.navegarPara('rodada-xray')">
                <span class="material-icons" style="font-size:16px">biotech</span>
                Raio-X da Rodada
            </button>
        `;
    }

    // Construir HTML com separadores de zona
    let html = meuResumoHTML + xrayBtnHTML;

    // Zona de Ganho
    if (zonaGanho.length > 0 && !isParcial) {
        html += `
            <div class="rk-zona-header rk-zona-ganho">
                <span class="material-icons">trending_up</span>
                <span>Zona de Ganho</span>
                <span class="rk-zona-count">${zonaGanho.length}</span>
            </div>
            <div class="rk-zona-container rk-bg-ganho">
                ${zonaGanho.map((p, i) => renderItemCompacto(p, i)).join("")}
            </div>
        `;
    }

    // Zona Neutra
    if (zonaNeutra.length > 0 && !isParcial) {
        html += `
            <div class="rk-zona-header rk-zona-neutra">
                <span class="material-icons">remove</span>
                <span>Zona Neutra</span>
                <span class="rk-zona-count">${zonaNeutra.length}</span>
            </div>
            <div class="rk-zona-container rk-bg-neutra">
                ${zonaNeutra.map((p, i) => renderItemCompacto(p, i)).join("")}
            </div>
        `;
    }

    // Zona de Perda
    if (zonaPerda.length > 0 && !isParcial) {
        html += `
            <div class="rk-zona-header rk-zona-perda">
                <span class="material-icons">trending_down</span>
                <span>Zona de Perda</span>
                <span class="rk-zona-count">${zonaPerda.length}</span>
            </div>
            <div class="rk-zona-container rk-bg-perda">
                ${zonaPerda.map((p, i) => renderItemCompacto(p, i)).join("")}
            </div>
        `;
    }

    // Para parciais, renderizar sem agrupamento de zona
    if (isParcial) {
        html += `
            <div class="rk-zona-container">
                ${participantesOrdenados.map((p, i) => renderItemCompacto(p, i)).join("")}
            </div>
        `;
    }

    if (participantesInativos.length > 0) {
        html += renderizarSecaoInativos(participantesInativos, rodadaData.numero);
    }

    container.innerHTML = html || '<div style="text-align: center; padding: 40px; color: #6b7280;">Nenhum dado disponível</div>';

    // ✅ v7.0: Renderizar Minha Escalação estilo Cartola
    renderizarMinhaEscalacao(rodadaData, isParcial);

    // ✅ v7.0: Atualizar gráfico evolutivo
    renderizarGraficoEvolutivo(todasRodadasCache, rodadaData.numero);

    // ✅ v8.0: Event listener para "Curiosar" - disponível em TODAS rodadas
    container.querySelectorAll("[data-curiosar-time-id]").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const targetTimeId = el.getAttribute("data-curiosar-time-id");
            if (targetTimeId) abrirCampinhoModal(targetTimeId, rodadaData.numero, rodadaData);
        });
    });

    if (isParcial) {
        container.insertAdjacentHTML("beforeend", `
            <div style="text-align: center; padding: 20px;">
                <button onclick="selecionarRodada(${rodadaData.numero}, true)" class="btn-atualizar-parciais">
                    <span class="material-icons">refresh</span>
                    Atualizar Parciais
                </button>
            </div>
        `);
    }
}

// =====================================================================
// MODAL "CURIOSAR" - VER ESCALAÇÃO DE OUTRO TIME
// =====================================================================
async function abrirCampinhoModal(targetTimeId, rodada, rodadaData = null) {
    if (window.Log) Log.info("[RODADAS] 👀 Curiosar time:", targetTimeId);

    // ── Fonte 1: Dados enriquecidos do parciais (ao vivo) ──
    const dadosParciais = ParciaisModule.obterDadosParciais?.();
    const timeDados = dadosParciais?.participantes?.find(
        (p) => String(p.timeId) === String(targetTimeId)
    );

    // ── Fonte 2: Escalação cacheada do parciais (dados RAW da API — NÃO processados) ──
    const escalacaoCacheada = ParciaisModule.obterEscalacaoCacheada?.(targetTimeId);

    // ── Fonte 3: Dados consolidados da rodada (rodadas finalizadas) ──
    const partConsolidado = rodadaData?.participantes?.find(
        (p) => String(p.timeId || p.time_id) === String(targetTimeId)
    );

    // Determinar fonte prioritária e extrair dados
    // Prioridade: parciais processados > consolidado > cache raw
    // NOTA: escalacaoCacheada é RAW da API — .atletas só tem titulares, .pontos não existe
    let fonte = 'nenhuma';
    let nomeTime, nomeCartola, pontos, emCampo, atletas, capitaoId;
    const totalAtl = 12;
    const isMeuTime = String(targetTimeId) === String(meuTimeId);

    if (timeDados?.atletas?.length > 0) {
        // Fonte 1: ParciaisModule — dados já processados (capitão 1.5x, reservas, luxo)
        fonte = 'parciais';
        nomeTime = timeDados.nome_time || "Time";
        nomeCartola = timeDados.nome_cartola || "";
        pontos = timeDados.pontos || 0;
        emCampo = timeDados.atletasEmCampo || 0;
        atletas = timeDados.atletas;
        capitaoId = timeDados.capitao_id;
    } else if (partConsolidado?.atletas?.length > 0) {
        // Fonte 3: Dados consolidados (rodada finalizada)
        fonte = 'consolidado';
        nomeTime = partConsolidado.nome || partConsolidado.nome_time || "Time";
        nomeCartola = partConsolidado.nome_cartola || "";
        pontos = partConsolidado.pontos || 0;
        emCampo = 0; // Calcular abaixo
        atletas = partConsolidado.atletas;
        capitaoId = partConsolidado.capitao_id;
    } else if (escalacaoCacheada?.atletas?.length > 0) {
        // Fonte 2: Cache raw — mesclar titulares + reservas manualmente
        fonte = 'cache';
        nomeTime = escalacaoCacheada.time?.nome || "Time";
        nomeCartola = escalacaoCacheada.time?.nome_cartola || "";
        pontos = 0; // Raw não tem pontos calculados — será 0 até parciais processarem
        emCampo = 0;
        // Mesclar titulares + reservas marcando is_reserva
        atletas = [
            ...(escalacaoCacheada.atletas || []).map(a => ({ ...a, is_reserva: false })),
            ...(escalacaoCacheada.reservas || []).map(a => ({ ...a, is_reserva: true })),
        ];
        capitaoId = escalacaoCacheada.capitao_id;
    } else {
        // Preservar dados básicos do consolidado quando disponíveis (nome, pontos)
        // atletas será buscado via API logo abaixo (bulk query exclui atletas por performance)
        nomeTime = partConsolidado?.nome || partConsolidado?.nome_time || "Time";
        nomeCartola = partConsolidado?.nome_cartola || "";
        pontos = partConsolidado?.pontos || 0;
        emCampo = 0;
        atletas = [];
        capitaoId = partConsolidado?.capitao_id || null;
    }

    // ── Fonte 4: API de escalação (fallback para rodadas consolidadas sem atletas) ──
    // Rodadas são carregadas em bulk com { atletas: 0 } por performance.
    // Para o modal, buscamos individualmente quando atletas não estão disponíveis.
    if (atletas.length === 0 && rodada) {
        try {
            const resp = await fetch(
                `/api/cartola/time/${targetTimeId}/${rodada}/escalacao`,
                { signal: AbortSignal.timeout(8000) }
            );
            if (resp.ok) {
                const apiData = await resp.json();
                const atletasApi = [
                    ...(apiData.titulares || []).map(a => ({ ...a, is_reserva: false })),
                    ...(apiData.reservas || []).map(a => ({ ...a, is_reserva: true })),
                ];
                if (atletasApi.length > 0) {
                    fonte = 'api-escalacao';
                    atletas = atletasApi;
                    capitaoId = capitaoId || apiData.capitao_id;
                    // Preservar pontos do consolidado (mais preciso — aplica regras da liga)
                    if (!pontos) pontos = apiData.pontos || 0;
                    if (nomeTime === 'Time') {
                        nomeTime = apiData.nome || "Time";
                        nomeCartola = apiData.nome_cartoleiro || "";
                    }
                }
            }
        } catch (err) {
            if (window.Log) Log.warn('[RODADAS] ⚠️ Escalação API fallback falhou:', err?.message);
        }
    }

    // Calcular emCampo quando não veio dos parciais processados
    const emCampoCalc = emCampo || atletas.filter(a =>
        (!a.is_reserva && a.status_id !== 2) && (a.entrou_em_campo === true || (a.pontos_num && a.pontos_num !== 0))
    ).length;

    if (window.Log) {
        Log.info("[RODADAS] 📊 Curiosar fonte:", fonte, "atletas:", atletas.length, "emCampo:", emCampoCalc);
    }

    // Truncar pontos (nunca arredondar)
    const pontosTrunc = Math.trunc(Number(pontos) * 100) / 100;
    const pontosFormatados = pontosTrunc.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    // Posições do Cartola
    const POSICOES = {
        1: { nome: 'GOL', cor: '#FF4500' },
        2: { nome: 'LAT', cor: 'var(--app-info)' },
        3: { nome: 'ZAG', cor: 'var(--app-info)' },
        4: { nome: 'MEI', cor: 'var(--app-success-light)' },
        5: { nome: 'ATA', cor: 'var(--app-danger)' },
        6: { nome: 'TEC', cor: '#6b7280' },
    };

    // Normalizar campo de pontos: ParciaisModule usa `pontos`, API raw usa `pontos_num`
    atletas.forEach(a => {
        if (a.pontos_num === undefined && a.pontos !== undefined) {
            a.pontos_num = a.pontos;
        }
    });

    // Separar titulares e reservas (support both is_reserva and status_id fields)
    const titulares = atletas.filter(a => !a.is_reserva && a.status_id !== 2);
    const reservas = atletas.filter(a => a.is_reserva || a.status_id === 2);

    // Ordenar titulares por posição: GOL → ZAG → LAT → MEI → ATA → TEC
    const ordemPosicoes = { 1: 1, 3: 2, 2: 3, 4: 4, 5: 5, 6: 6 };
    titulares.sort((a, b) => {
        const ordemA = ordemPosicoes[a.posicao_id] || 99;
        const ordemB = ordemPosicoes[b.posicao_id] || 99;
        return ordemA - ordemB;
    });

    // Ordenar reservas também
    reservas.sort((a, b) => {
        const ordemA = ordemPosicoes[a.posicao_id] || 99;
        const ordemB = ordemPosicoes[b.posicao_id] || 99;
        return ordemA - ordemB;
    });

    // Calcular substituições (modal - regras oficiais Cartola FC 2025/2026)
    const substituicoesModal = new Map();
    const titularesSubstituidosModal = new Map(); // atleta_id -> 'ausente' | 'luxo'
    const reservaLuxoIdModal = timeDados?.reserva_luxo_id || escalacaoCacheada?.reserva_luxo_id || partConsolidado?.reserva_luxo_id;

    // Verificar se dados pré-computados estão disponíveis
    const temDadosParciaisModal = atletas.some(a =>
        a.substituido_por !== undefined || a.substituiu_apelido !== undefined || a.luxo_ativado !== undefined
    );

    if (temDadosParciaisModal) {
        atletas.forEach(a => {
            if (a.is_reserva && a.contribuiu) {
                if (a.luxo_ativado) {
                    substituicoesModal.set(a.atleta_id, {
                        tipo: 'luxo',
                        substituiu: a.substituiu_apelido || '',
                        herdouCapitao: a.luxo_herdou_capitao || false,
                    });
                } else if (a.substituiu_apelido) {
                    substituicoesModal.set(a.atleta_id, { tipo: 'posicao', substituiu: a.substituiu_apelido });
                }
            }
            if (!a.is_reserva && a.substituido_por_luxo) {
                titularesSubstituidosModal.set(a.atleta_id, 'luxo');
            } else if (!a.is_reserva && a.substituido_por) {
                titularesSubstituidosModal.set(a.atleta_id, 'ausente');
            }
        });
    } else {
        const titularesSemJogoModal = new Map();
        titulares.forEach(t => {
            if (t.entrou_em_campo === false) {
                if (!titularesSemJogoModal.has(t.posicao_id)) {
                    titularesSemJogoModal.set(t.posicao_id, []);
                }
                titularesSemJogoModal.get(t.posicao_id).push(t);
            }
        });

        // Reservas comuns primeiro
        reservas.forEach(r => {
            const isLuxo = r.is_reserva_luxo || r.atleta_id === reservaLuxoIdModal;
            if (isLuxo) return;
            const entrou = r.entrou_em_campo === true || r.contribuiu === true;
            if (!entrou) return;

            if (titularesSemJogoModal.has(r.posicao_id)) {
                const tits = titularesSemJogoModal.get(r.posicao_id);
                if (tits.length > 0) {
                    const titular = tits.shift();
                    substituicoesModal.set(r.atleta_id, { tipo: 'posicao', substituiu: titular.apelido || 'Titular' });
                    titularesSubstituidosModal.set(titular.atleta_id, 'ausente');
                }
            }
        });

        // Depois o Luxo
        const luxoReserva = reservas.find(r => r.is_reserva_luxo || r.atleta_id === reservaLuxoIdModal);
        if (luxoReserva) {
            const entrou = luxoReserva.entrou_em_campo === true || luxoReserva.contribuiu === true;
            if (entrou) {
                if (titularesSemJogoModal.has(luxoReserva.posicao_id) && titularesSemJogoModal.get(luxoReserva.posicao_id).length > 0) {
                    const tits = titularesSemJogoModal.get(luxoReserva.posicao_id);
                    const titular = tits.shift();
                    substituicoesModal.set(luxoReserva.atleta_id, { tipo: 'posicao', substituiu: titular.apelido || 'Titular' });
                    titularesSubstituidosModal.set(titular.atleta_id, 'ausente');
                } else {
                    const titularesNaPosicao = titulares.filter(
                        t => t.posicao_id === luxoReserva.posicao_id && t.entrou_em_campo !== false
                    );
                    if (titularesNaPosicao.length > 0) {
                        const luxoPts = Number(luxoReserva.pontos_efetivos ?? luxoReserva.pontos_num ?? 0);
                        const pior = titularesNaPosicao.reduce((p, t) => {
                            const ptsP = Number(p.pontos_efetivos ?? p.pontos_num ?? 0);
                            const ptsT = Number(t.pontos_efetivos ?? t.pontos_num ?? 0);
                            return ptsT < ptsP ? t : p;
                        }, titularesNaPosicao[0]);
                        const piorPts = Number(pior.pontos_efetivos ?? pior.pontos_num ?? 0);
                        if (luxoPts > piorPts) {
                            substituicoesModal.set(luxoReserva.atleta_id, { tipo: 'luxo', substituiu: pior.apelido || 'Titular' });
                            titularesSubstituidosModal.set(pior.atleta_id, 'luxo');
                        }
                    }
                }
            }
        }
    }

    // Posições do Cartola (modal)
    const POSICOES_MODAL = {
        1: { nome: 'GOL', cor: 'var(--app-pos-gol, #FF4500)' },
        2: { nome: 'LAT', cor: 'var(--app-info)' },
        3: { nome: 'ZAG', cor: 'var(--app-info)' },
        4: { nome: 'MEI', cor: 'var(--app-success-light)' },
        5: { nome: 'ATA', cor: 'var(--app-danger)' },
        6: { nome: 'TEC', cor: 'var(--app-text-muted)' },
    };

    // Siglas dos clubes (modal)
    const CLUBES_NOME_MODAL = {
        262: 'Flamengo', 263: 'Botafogo', 264: 'Corinthians', 265: 'Bahia',
        266: 'Fluminense', 267: 'Vasco', 275: 'Palmeiras', 276: 'São Paulo',
        277: 'Santos', 280: 'Bragantino', 282: 'Atlético-MG', 283: 'Cruzeiro',
        284: 'Grêmio', 285: 'Internacional', 286: 'Juventude', 287: 'Vitória',
        290: 'Goiás', 292: 'Sport', 293: 'Athletico-PR', 354: 'Ceará',
        356: 'Fortaleza', 1371: 'Cuiabá', 2305: 'Mirassol',
        270: 'Coritiba', 273: 'América-MG', 274: 'Chapecoense',
    };

    // Scouts config (modal)
    const SCOUTS_MODAL = {
        G:  { label: 'G',  positivo: true },  A:  { label: 'A',  positivo: true },
        FD: { label: 'FD', positivo: true },   FS: { label: 'FS', positivo: true },
        PE: { label: 'PE', positivo: true },   DS: { label: 'DS', positivo: true },
        SG: { label: 'SG', positivo: true },   DE: { label: 'DE', positivo: true },
        FF: { label: 'FF', positivo: false },  FC: { label: 'FC', positivo: false },
        FT: { label: 'FT', positivo: false },  CA: { label: 'CA', positivo: false },
        CV: { label: 'CV', positivo: false },  GC: { label: 'GC', positivo: false },
        GS: { label: 'GS', positivo: false },  I:  { label: 'I',  positivo: false },
        PP: { label: 'PP', positivo: false },
    };

    function renderScoutsModal(scout) {
        if (!scout || typeof scout !== 'object') return '';
        const entries = Object.entries(scout).filter(([k]) => SCOUTS_MODAL[k]);
        if (entries.length === 0) return '';
        const badges = entries.map(([key, val]) => {
            const cfg = SCOUTS_MODAL[key];
            const qtyPrefix = val > 1 ? `${val}` : '';
            const cssClass = cfg.positivo ? 'me-scout-pos' : 'me-scout-neg';
            return `<span class="${cssClass}">${qtyPrefix}${cfg.label}</span>`;
        }).join(' ');
        return `<div class="me-card-scouts">${badges}</div>`;
    }

    function obterStatusJogoModal(atleta) {
        const jogoInfo = atleta.jogo || {};
        const dataJogo = jogoInfo.data_jogo || jogoInfo.data || null;
        const horaJogo = jogoInfo.hora || null;

        if (atleta.entrou_em_campo === false) return 'absent';
        if (atleta.entrou_em_campo === true || (atleta.pontos_num != null && atleta.pontos_num !== 0)) return 'played';
        if (!dataJogo) return 'upcoming';

        try {
            const horaStr = horaJogo ? horaJogo.substring(0, 5) : '00:00';
            const dataHoraJogo = new Date(`${dataJogo}T${horaStr}:00-03:00`);
            const agora = new Date();
            const diffMinutos = (agora - dataHoraJogo) / (1000 * 60);
            if (diffMinutos < -10) return 'upcoming';
            if (diffMinutos <= 150) return 'playing';
            return 'finished';
        } catch (err) {
            if (window.Log) Log.warn('[RODADAS] Erro ao processar data do jogo:', err);
            return 'upcoming';
        }
    }

    // Renderizar atleta como card compacto (modal - estilo Cartola FC)
    function renderAtleta(a, isReserva = false, subInfo = null) {
        const pos = POSICOES_MODAL[a.posicao_id] || { nome: '???', cor: 'var(--app-text-muted)' };
        const pontosRaw = a.pontos_efetivos ?? a.pontos_num ?? 0;
        const pontosAtl = (Math.trunc(Number(pontosRaw) * 100) / 100).toFixed(2);
        const pontosColorClass = pontosRaw > 0 ? 'me-pts-pos' : pontosRaw < 0 ? 'me-pts-neg' : 'me-pts-zero';

        const isCapitao = String(a.atleta_id) === String(capitaoId);
        const isLuxo = isReserva && (a.is_reserva_luxo || a.atleta_id === reservaLuxoIdModal);

        const capitaoBadge = isCapitao ? '<span class="me-badge me-badge-cap">C</span>' : '';
        const luxoBadge = isLuxo ? '<span class="me-badge me-badge-luxo">L</span>' : '';

        let subBadge = '';
        if (subInfo) {
            if (subInfo.tipo === 'luxo') {
                const textoLuxo = subInfo.herdouCapitao
                    ? `Luxo ativado (C 1.5x) por ${subInfo.substituiu}`
                    : `Luxo ativado por ${subInfo.substituiu}`;
                subBadge = `<div class="me-card-sub me-card-sub-luxo"><span class="material-icons me-card-sub-icon">star</span> ${textoLuxo}</div>`;
            } else if (subInfo.tipo === 'posicao') {
                subBadge = `<div class="me-card-sub me-card-sub-pos"><span class="material-icons me-card-sub-icon">swap_vert</span> Entrou por ${subInfo.substituiu}</div>`;
            } else if (subInfo.tipo === 'substituido') {
                subBadge = '<div class="me-card-sub me-card-sub-out">Não entrou em campo</div>';
            } else if (subInfo.tipo === 'substituido_luxo') {
                subBadge = '<div class="me-card-sub me-card-sub-luxo"><span class="material-icons me-card-sub-icon">swap_vert</span> Substituído pelo Luxo</div>';
            }
        }

        const clubeId = a.clube_id || extrairClubeIdDaFoto(a.foto) || null;
        const escudoSrc = clubeId ? `/escudos/${clubeId}.png` : '/escudos/default.png';
        const clubeNome = CLUBES_NOME_MODAL[clubeId] || '';

        const csAtl = a.variacao_num ?? 0;
        const csColorClass = csAtl > 0 ? 'me-cs-pos' : csAtl < 0 ? 'me-cs-neg' : 'me-cs-zero';
        const csTexto = csAtl > 0 ? `$+${(Math.trunc(csAtl * 100) / 100).toFixed(2)}` : `$${(Math.trunc(csAtl * 100) / 100).toFixed(2)}`;

        const scoutsHTML = renderScoutsModal(a.scout);
        const status = obterStatusJogoModal(a);
        const statusDot = status === 'playing' ? '<span class="me-card-live"></span>' : '';
        const capMulti = isCapitao ? '<span class="me-cap-multi">x1,5</span>' : '';

        return `
            <div class="me-card${status === 'absent' ? ' me-card-absent' : ''}">
                <img class="me-card-escudo" src="${escudoSrc}" alt="" onerror="this.onerror=null;this.src='/escudos/default.png'">
                <div class="me-card-info">
                    <div class="me-card-nome">${statusDot}${escapeHtml(a.apelido || 'Atleta')}${capitaoBadge}${luxoBadge}</div>
                    <div class="me-card-meta"><span class="me-pos-badge" style="color:${pos.cor}">${pos.nome}</span> | ${escapeHtml(clubeNome)}</div>
                    ${subBadge}
                </div>
                <div class="me-card-stats">
                    <div class="me-card-pts ${pontosColorClass}">${capMulti}${pontosAtl}</div>
                    <div class="me-card-cs ${csColorClass}">${csTexto}</div>
                    ${scoutsHTML}
                </div>
            </div>
        `;
    }

    const titularesHTML = titulares.length > 0
        ? titulares.map(a => {
            let subInfo = null;
            if (titularesSubstituidosModal.has(a.atleta_id)) {
                const tipo = titularesSubstituidosModal.get(a.atleta_id);
                subInfo = tipo === 'luxo' ? { tipo: 'substituido_luxo' } : { tipo: 'substituido' };
            }
            return renderAtleta(a, false, subInfo);
        }).join("")
        : '<div class="me-card-empty">Sem dados de escalação</div>';

    const reservasHTML = reservas.length > 0
        ? reservas.map(a => renderAtleta(a, true, substituicoesModal.get(a.atleta_id) || null)).join("")
        : '';

    // Criar modal
    const existente = document.getElementById("campinhoModal");
    if (existente) existente.remove();

    const modal = document.createElement("div");
    modal.id = "campinhoModal";
    modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.7);animation:fadeIn 0.2s ease;";

    modal.innerHTML = `
        <div style="background:#111827;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;padding:0;animation:slideUp 0.3s ease;">
            <!-- Header -->
            <div style="position:sticky;top:0;background:#111827;padding:16px 20px;border-bottom:1px solid #1f2937;display:flex;align-items:center;justify-content:space-between;z-index:1;">
                <div>
                    <div style="font-family:'Russo One',sans-serif;font-size:16px;color:var(--app-text-white);">${escapeHtml(nomeTime)}</div>
                    <div style="font-size:12px;color:var(--app-text-muted);">${escapeHtml(nomeCartola)}${isMeuTime ? ' (Meu Time)' : ''}</div>
                </div>
                <button id="fecharCampinhoModal" style="background:none;border:none;color:var(--app-text-muted);cursor:pointer;padding:8px;">
                    <span class="material-icons">close</span>
                </button>
            </div>

            <!-- Stats -->
            <div style="display:flex;gap:12px;padding:12px 20px;">
                <div style="flex:1;background:#1f2937;border-radius:8px;padding:10px;text-align:center;">
                    <div style="font-size:11px;color:var(--app-text-muted);text-transform:uppercase;">Pontos</div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:bold;color:var(--app-primary);">${pontosFormatados}</div>
                </div>
                <div style="flex:1;background:#1f2937;border-radius:8px;padding:10px;text-align:center;">
                    <div style="font-size:11px;color:var(--app-text-muted);text-transform:uppercase;">Em Campo</div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:bold;color:${emCampoCalc > 0 ? 'var(--app-success-light)' : '#6b7280'};">${Math.min(emCampoCalc, totalAtl)}/${totalAtl}</div>
                </div>
            </div>

            <!-- Titulares -->
            <div class="me-section" style="padding-left:20px;padding-right:20px;">
                <div class="me-section-title">Titulares (${titulares.length})</div>
                ${titularesHTML}
            </div>

            ${reservas.length > 0 ? `
                <!-- Separador Banco de Reservas -->
                <div class="me-banco-divider" style="margin:0 20px;">
                    <div class="me-banco-line"></div>
                    <span class="me-banco-label">
                        <span class="material-icons me-banco-icon">event_seat</span>
                        Reservas
                    </span>
                    <div class="me-banco-line"></div>
                </div>
                <div class="me-section me-section-reservas" style="padding-left:20px;padding-right:20px;padding-bottom:24px;">
                    ${reservasHTML}
                </div>
            ` : ''}
        </div>
    `;

    // Estilos de animação
    if (!document.getElementById("campinhoModalStyles")) {
        const style = document.createElement("style");
        style.id = "campinhoModalStyles";
        style.textContent = `
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .badge-em-campo {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 4px;
                background: #1f2937;
                color: #6b7280;
                margin-left: 6px;
                font-weight: bold;
            }
            .badge-em-campo.ativo {
                background: rgba(34, 197, 94, 0.15);
                color: var(--app-success-light);
                animation: pulseEmCampo 2s infinite;
            }
            @keyframes pulseEmCampo {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
            .curiosar-icon {
                transition: color 0.2s;
            }
            [data-curiosar-time-id]:hover .curiosar-icon,
            [data-curiosar-time-id]:active .curiosar-icon {
                color: var(--app-primary) !important;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    // Fechar modal
    document.getElementById("fecharCampinhoModal").addEventListener("click", () => {
        modal.remove();
    });
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });
}

// =====================================================================
// RENDERIZAR SEÇÃO DE INATIVOS
// =====================================================================
function renderizarSecaoInativos(inativos, rodadaNum) {
    if (!inativos || inativos.length === 0) return "";

    const inativosOrdenados = [...inativos].sort((a, b) => (b.pontos || 0) - (a.pontos || 0));

    const items = inativosOrdenados.map((p) => {
        // ✅ v8.1: Fallback robusto — nunca exibir "N/D"
        let nomeTime = p.nome || p.nome_time || "";
        const nomeCartola = p.nome_cartola || "";
        if (!nomeTime || nomeTime === "N/D") {
            nomeTime = (nomeCartola && nomeCartola !== "N/D") ? nomeCartola : `Time #${p.timeId || p.time_id || '?'}`;
        }
        const rodadaDesist = p.rodada_desistencia;
        const rodadaInfo = rodadaDesist ? `Saiu na R${rodadaDesist}` : "Inativo";

        const pontosFormatados = Number(p.pontos || 0).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        return `
            <div class="ranking-item-pro inativo">
                <div class="posicao-badge-pro pos-inativo">
                    <span class="material-icons" style="font-size: 14px;">person_off</span>
                </div>
                <div class="ranking-info-pro">
                    <div class="ranking-nome-time">${escapeHtml(nomeTime)}</div>
                    <div class="ranking-nome-cartola">${escapeHtml(nomeCartola)}</div>
                </div>
                <div class="ranking-stats-pro">
                    <div class="ranking-pontos-pro" style="color: #6b7280;">${pontosFormatados}</div>
                    <div class="ranking-inativo-info">${rodadaInfo}</div>
                </div>
            </div>
        `;
    }).join("");

    return `
        <div class="secao-inativos">
            <div class="secao-inativos-header">
                <span class="material-icons">person_off</span>
                <span>Participantes Inativos (${inativos.length})</span>
            </div>
            ${items}
        </div>
    `;
}

// =====================================================================
// VOLTAR
// =====================================================================
window.voltarParaCards = function () {
    ParciaisModule.pararAutoRefresh?.();
    PollingInteligenteModule.parar?.();
    atualizarIndicadorAutoRefresh({ ativo: false });

    const detalhamento = document.getElementById("rodadaDetalhamento");
    if (detalhamento) {
        detalhamento.style.display = "none";
    }

    // Limpar escalação
    const escalacao = document.getElementById("minhaEscalacaoContainer");
    if (escalacao) escalacao.innerHTML = '';

    // Limpar seleções
    document.querySelectorAll(".rodada-mini-card").forEach((card) => {
        card.classList.remove("selected");
    });

    rodadaSelecionada = null;

    // Scroll para o grid
    const grid = document.getElementById('rodadasGruposContainer');
    if (grid) {
        grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
};

// =====================================================================
// TOGGLE CAMPINHO (EXPAND/COLLAPSE)
// =====================================================================
window.toggleCampinho = function () {
    const header = document.getElementById('meToggleHeader');
    const content = document.getElementById('meCollapsibleContent');
    if (!header || !content) return;

    const isExpanded = content.classList.contains('expanded');
    if (isExpanded) {
        content.classList.remove('expanded');
        header.classList.remove('expanded');
    } else {
        content.classList.add('expanded');
        header.classList.add('expanded');
    }
};

// =====================================================================
// INDICADOR DE AUTO-REFRESH
// =====================================================================
function atualizarIndicadorAutoRefresh(status) {
    const indicador = document.getElementById("autoRefreshIndicator");
    const texto = document.getElementById("autoRefreshText");
    if (!indicador || !texto) return;

    if (!status?.ativo) {
        indicador.style.display = "none";
        return;
    }

    const intervaloSeg = Math.max(1, Math.round((status.intervalMs || 0) / 1000));
    const nextAt = status.nextAt || (Date.now() + (status.intervalMs || 0));
    const restanteSeg = Math.max(0, Math.round((nextAt - Date.now()) / 1000));

    texto.textContent = `Auto-refresh ativo • ${intervaloSeg}s (próx. ${restanteSeg}s)`;
    indicador.style.display = "inline-flex";
}

// =====================================================================
// TOAST
// =====================================================================
window.mostrarEmDesenvolvimento = function (funcionalidade) {
    mostrarToast(`${funcionalidade} em desenvolvimento`);
};

function mostrarToast(msg) {
    const toast = document.getElementById("toastDesenvolvimento");
    const mensagem = document.getElementById("toastMensagem");

    if (toast && mensagem) {
        mensagem.textContent = msg;
        toast.classList.add("show");

        setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }
}

// =====================================================================
// ESTADOS
// =====================================================================
function mostrarLoading(show) {
    const loading = document.getElementById("rodadasLoading");
    const grupos = document.getElementById("rodadasGruposContainer");

    if (loading) loading.style.display = show ? "flex" : "none";
    if (grupos) grupos.style.display = show ? "none" : "flex";
}

function mostrarEstadoVazio(show) {
    const empty = document.getElementById("rodadasEmpty");
    const grupos = document.getElementById("rodadasGruposContainer");

    if (empty) empty.style.display = show ? "flex" : "none";
    if (grupos) grupos.style.display = show ? "none" : "flex";
}

function mostrarErro(mensagem) {
    const container = document.getElementById("rodadasGruposContainer");
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--app-danger);">
                <span class="material-icons" style="font-size: 48px; margin-bottom: 16px;">error_outline</span>
                <h3 style="margin-bottom: 8px;">Erro ao Carregar</h3>
                <p style="color: #9ca3af;">${mensagem}</p>
            </div>
        `;
        container.style.display = "flex";
    }
}

// Cleanup para navegação SPA — chamado por participante-navigation.js ao sair do módulo
window.destruirRodadasParticipante = function () {
    ParciaisModule.pararAutoRefresh?.();
    PollingInteligenteModule.parar?.();
    if (_rodadasDestaquesTimer) {
        clearInterval(_rodadasDestaquesTimer);
        _rodadasDestaquesTimer = null;
    }
    if (window.MatchdayService?.destroy) {
        window.MatchdayService.destroy();
    }
};

if (window.Log)
    Log.info("[PARTICIPANTE-RODADAS] Modulo v7.0 carregado (CARTOLA-STYLE + CHART)");
