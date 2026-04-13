// controllers/parciaisController.js
// ✅ v1.0: Endpoint unificado de parciais — substitui padrão N+1 do frontend
//
// Antes: frontend fazia 1 req (atletas) + N req (escalações) por usuário, a cada 30s
// Agora:  backend faz tudo 1 vez, cacheia 30s, todos os usuários compartilham
//
// Frozen layer: atletas de partidas encerradas há 12h+ vêm do MongoDB (não da API Cartola)

import NodeCache from "node-cache";
import axios from "axios";
import mongoose from "mongoose";
import Liga from "../models/Liga.js";
import Time from "../models/Time.js";
import scoutSnapshotService from "../services/scoutSnapshotService.js";
import { CURRENT_SEASON } from "../config/seasons.js";
import { truncarPontosNum } from "../utils/type-helpers.js";

const CARTOLA_API_BASE = "https://api.cartola.globo.com";
const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 8;

// Cache do resultado computado: 30s por ligaId
const parciaisCache = new NodeCache({ stdTTL: 30, maxKeys: 200 });
// Cache de escalações por timeId+rodada: 5min (espelha o escalacaoProxyCache do cartola-proxy)
const escCache = new NodeCache({ stdTTL: 300, maxKeys: 1000 });

// ──────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ──────────────────────────────────────────────────────────────────────────────

async function fetchCartola(url) {
  const resp = await axios.get(url, {
    timeout: TIMEOUT_MS,
    headers: {
      "User-Agent": "Super-Cartola-Manager/1.0.0",
      "Cache-Control": "no-cache",
    },
  });
  return resp.data;
}

async function buscarAtletasPontuados() {
  try {
    const data = await fetchCartola(`${CARTOLA_API_BASE}/atletas/pontuados`);
    return data?.atletas || {};
  } catch {
    return {};
  }
}

async function buscarEscalacao(timeId, rodada) {
  const key = `esc_${timeId}_${rodada}`;
  const cached = escCache.get(key);
  if (cached) return cached;

  try {
    const data = await fetchCartola(`${CARTOLA_API_BASE}/time/id/${timeId}/${rodada}`);
    if (data) escCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CÁLCULO DE PONTUAÇÃO
// Porta fiel da lógica de participante-rodada-parcial.js::buscarECalcularPontuacao()
// Regras: capitão 1.5x | reserva comum entra se titular ausente na posição
//         reserva de luxo: Cenário A (ausente) ou Cenário B (pior titular)
// ──────────────────────────────────────────────────────────────────────────────

function calcularPontuacao(dadosEscalacao, atletasPontuados, time) {
  if (!dadosEscalacao?.atletas?.length) {
    return _timeVazio(time, true);
  }

  let pontos = 0;
  let atletasEmCampo = 0;
  const atletasDetalhes = [];

  // ── FASE 1: Titulares ──
  const titularesProcessados = [];
  dadosEscalacao.atletas.forEach((atleta) => {
    const ap = atletasPontuados[atleta.atleta_id];
    const pontuacao = ap?.pontuacao || 0;
    const entrouEmCampo = ap?.entrou_em_campo;
    // Conservador: só ausente quando confirmado false; null/undefined = jogo não iniciado
    const jogou = entrouEmCampo !== false || pontuacao !== 0;
    if (entrouEmCampo === true) atletasEmCampo++;

    const isCapitao = atleta.atleta_id === dadosEscalacao.capitao_id;
    const pontosEfetivos = isCapitao ? pontuacao * 1.5 : pontuacao;
    pontos += pontosEfetivos;

    const info = {
      atleta_id: atleta.atleta_id,
      apelido: atleta.apelido || ap?.apelido || "",
      posicao_id: atleta.posicao_id,
      clube_id: atleta.clube_id || ap?.clube_id,
      pontos: pontuacao,
      pontos_num: pontuacao,
      pontos_efetivos: pontosEfetivos,
      entrou_em_campo: jogou,
      entrou_em_campo_real: entrouEmCampo === true,
      is_capitao: isCapitao,
      is_reserva: false,
      foto: atleta.foto || ap?.foto || null,
      scout: ap?.scout || {},
      substituido_por: null,
      substituido_por_luxo: false,
    };
    titularesProcessados.push(info);
    atletasDetalhes.push(info);
  });

  // ── FASE 2: Mapear ausentes por posição ──
  const ausentesPorPosicao = {};
  titularesProcessados.forEach((t) => {
    if (!t.entrou_em_campo) {
      if (!ausentesPorPosicao[t.posicao_id]) ausentesPorPosicao[t.posicao_id] = [];
      ausentesPorPosicao[t.posicao_id].push(t);
    }
  });

  // ── FASE 3: Reservas ──
  if (dadosEscalacao.reservas?.length) {
    const reservaLuxoId = dadosEscalacao.reserva_luxo_id;

    // 3a. Reservas comuns (não-luxo)
    dadosEscalacao.reservas.forEach((atleta) => {
      if (atleta.atleta_id === reservaLuxoId) return;

      const ap = atletasPontuados[atleta.atleta_id];
      const pontuacao = ap?.pontuacao || 0;
      const entrouEmCampo = ap?.entrou_em_campo;
      // Estrito para reservas: só entra quando confirmadamente jogou
      const jogou = entrouEmCampo === true || pontuacao !== 0;
      let pontosEfetivos = 0;
      let contribuiu = false;
      let substituiuApelido = null;

      if (jogou && ausentesPorPosicao[atleta.posicao_id]?.length > 0) {
        const titSub = ausentesPorPosicao[atleta.posicao_id].shift();
        pontosEfetivos = pontuacao;
        pontos += pontosEfetivos;
        atletasEmCampo++;
        contribuiu = true;
        substituiuApelido = titSub.apelido;
        titSub.substituido_por = atleta.apelido || "Reserva";
      }

      atletasDetalhes.push({
        atleta_id: atleta.atleta_id,
        apelido: atleta.apelido || ap?.apelido || "",
        posicao_id: atleta.posicao_id,
        clube_id: atleta.clube_id || ap?.clube_id,
        pontos: pontuacao,
        pontos_num: pontuacao,
        pontos_efetivos: pontosEfetivos,
        entrou_em_campo: jogou,
        entrou_em_campo_real: entrouEmCampo === true,
        is_capitao: false,
        is_reserva: true,
        is_reserva_luxo: false,
        contribuiu,
        substituiu_apelido: substituiuApelido,
        foto: atleta.foto || ap?.foto || null,
        scout: ap?.scout || {},
      });
    });

    // 3b. Reserva de Luxo
    const luxoAtleta = dadosEscalacao.reservas.find((a) => a.atleta_id === reservaLuxoId);
    if (luxoAtleta) {
      const ap = atletasPontuados[luxoAtleta.atleta_id];
      const pontuacao = ap?.pontuacao || 0;
      const entrouEmCampo = ap?.entrou_em_campo;
      const jogou = entrouEmCampo === true || pontuacao !== 0;
      let pontosEfetivos = 0;
      let contribuiu = false;
      let substituiuApelido = null;
      let luxoAtivado = false;
      let luxoHerdouCapitao = false;

      // Cenário A: entra como reserva comum (titular ausente na posição)
      if (jogou && ausentesPorPosicao[luxoAtleta.posicao_id]?.length > 0) {
        const titSub = ausentesPorPosicao[luxoAtleta.posicao_id].shift();
        pontosEfetivos = pontuacao;
        pontos += pontosEfetivos;
        atletasEmCampo++;
        contribuiu = true;
        substituiuApelido = titSub.apelido;
        titSub.substituido_por = luxoAtleta.apelido || "Reserva de Luxo";
      }
      // Cenário B: habilidade especial — substitui pior titular se pontuou mais
      else if (jogou) {
        const titularesDaPosicao = titularesProcessados.filter(
          (t) =>
            t.posicao_id === luxoAtleta.posicao_id &&
            (t.pontos > 0 || atletasPontuados[t.atleta_id]?.entrou_em_campo === true),
        );
        if (titularesDaPosicao.length > 0) {
          const piorTitular = titularesDaPosicao.reduce(
            (pior, t) => (t.pontos < pior.pontos ? t : pior),
            titularesDaPosicao[0],
          );
          if (pontuacao > piorTitular.pontos) {
            pontos -= piorTitular.pontos_efetivos;
            if (piorTitular.is_capitao) {
              pontosEfetivos = pontuacao * 1.5;
              luxoHerdouCapitao = true;
            } else {
              pontosEfetivos = pontuacao;
            }
            pontos += pontosEfetivos;
            contribuiu = true;
            luxoAtivado = true;
            substituiuApelido = piorTitular.apelido;
            piorTitular.substituido_por_luxo = true;
            piorTitular.substituido_por = luxoAtleta.apelido || "Reserva de Luxo";
          }
        }
      }

      atletasDetalhes.push({
        atleta_id: luxoAtleta.atleta_id,
        apelido: luxoAtleta.apelido || ap?.apelido || "",
        posicao_id: luxoAtleta.posicao_id,
        clube_id: luxoAtleta.clube_id || ap?.clube_id,
        pontos: pontuacao,
        pontos_num: pontuacao,
        pontos_efetivos: pontosEfetivos,
        entrou_em_campo: jogou,
        entrou_em_campo_real: entrouEmCampo === true,
        is_capitao: luxoHerdouCapitao,
        is_reserva: true,
        is_reserva_luxo: true,
        contribuiu,
        luxo_ativado: luxoAtivado,
        luxo_herdou_capitao: luxoHerdouCapitao,
        substituiu_apelido: substituiuApelido,
        foto: luxoAtleta.foto || ap?.foto || null,
        scout: ap?.scout || {},
      });
    }
  }

  const totalAtletas = dadosEscalacao.atletas?.length || 0;

  return {
    timeId: time.timeId,
    nome_time: dadosEscalacao.time?.nome || time.nome_time || "N/D",
    nome_cartola: dadosEscalacao.time?.nome_cartola || time.nome_cartola || "N/D",
    escudo: dadosEscalacao.time?.url_escudo_png || time.escudo || null,
    clube_id: time.clube_id || null,
    pontos: truncarPontosNum(pontos),
    pontos_parcial: truncarPontosNum(pontos),
    patrimonio: dadosEscalacao.time?.patrimonio || 0,
    rodadaNaoJogada: false,
    ativo: true,
    atletasEmCampo,
    totalAtletas,
    capitao_id: dadosEscalacao.capitao_id || null,
    reserva_luxo_id: dadosEscalacao.reserva_luxo_id || null,
    atletas: atletasDetalhes,
  };
}

function _timeVazio(time, rodadaNaoJogada = false) {
  return {
    timeId: time.timeId,
    nome_time: time.nome_time,
    nome_cartola: time.nome_cartola,
    escudo: time.escudo,
    clube_id: time.clube_id,
    pontos: 0,
    pontos_parcial: 0,
    patrimonio: 0,
    rodadaNaoJogada,
    ativo: true,
    atletasEmCampo: 0,
    totalAtletas: 0,
    capitao_id: null,
    reserva_luxo_id: null,
    atletas: [],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// GET /api/parciais/:ligaId
// ──────────────────────────────────────────────────────────────────────────────

export async function getParciais(req, res) {
  const { ligaId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(ligaId)) {
    return res.status(400).json({ erro: "ligaId inválido" });
  }

  // Cache hit — compartilhado entre todos os usuários da liga
  const cacheKey = `parciais_${ligaId}`;
  const cached = parciaisCache.get(cacheKey);
  if (cached) {
    return res.json({ ...cached, _cache: true });
  }

  try {
    // 1. Status do mercado
    let statusMercado, rodadaAtual, temporada;
    try {
      const statusData = await fetchCartola(`${CARTOLA_API_BASE}/mercado/status`);
      statusMercado = statusData?.status_mercado;
      rodadaAtual = statusData?.rodada_atual;
      temporada = statusData?.temporada || CURRENT_SEASON;
    } catch {
      return res.status(503).json({ erro: "API Cartola indisponível" });
    }

    // Status 2 = rodada em andamento | Status 3 = desbloqueado (jogos parcialmente encerrados,
    // mercado parcialmente reaberto — dados live ainda válidos). Status 4+ = round finalizado.
    const rodadaAoVivo = statusMercado === 2 || statusMercado === 3;
    if (!rodadaAoVivo) {
      return res.json({
        disponivel: false,
        motivo: statusMercado === 4 ? "rodada_encerrada" : "mercado_aberto",
        rodada: rodadaAtual,
        participantes: [],
        inativos: [],
      });
    }

    // 2. Buscar times da liga (MongoDB)
    const liga = await Liga.findById(ligaId).lean();
    if (!liga) return res.status(404).json({ erro: "Liga não encontrada" });

    const timesRaw = liga.times?.length
      ? await Time.find({ id: { $in: liga.times } }).lean()
      : [];

    console.log(`[PARCIAIS-CTRL] Liga ${ligaId}: liga.times=${liga.times?.length || 0}, timesRaw=${timesRaw.length}`);

    // Mapa clube_id a partir de liga.participantes
    const clubeIdMap = {};
    (liga.participantes || []).forEach((p) => {
      const id = p.time_id || p.id;
      if (id && p.clube_id) clubeIdMap[String(id)] = p.clube_id;
    });

    // Inativos
    const { obterParticipantesInativos } = await import(
      "./participanteStatusController.js"
    );
    const inativosRaw = await obterParticipantesInativos(ligaId);
    const inativosMap = new Map(
      inativosRaw.map((p) => [
        String(p.timeId),
        { rodada_inativo: p.rodada_inativo || null },
      ]),
    );

    const timesAtivos = [];
    const timesInativosArr = [];

    timesRaw.forEach((t) => {
      const id = String(t.id);
      const entry = {
        timeId: t.id,
        nome_time: t.nome_time || t.nome || "N/D",
        nome_cartola: t.nome_cartola || t.cartoleiro || "N/D",
        escudo: t.url_escudo_png || t.escudo || null,
        clube_id: t.clube_id || clubeIdMap[id] || null,
        rodada_desistencia: inativosMap.get(id)?.rodada_inativo || null,
      };

      if (inativosMap.has(id) || t.ativo === false) {
        timesInativosArr.push(entry);
      } else {
        timesAtivos.push(entry);
      }
    });

    console.log(`[PARCIAIS-CTRL] Liga ${ligaId}: ativos=${timesAtivos.length}, inativos=${timesInativosArr.length}`);

    // 3. Scouts: frozen (MongoDB) + live (API Cartola)
    const [scoutsFrozen, atletasLive] = await Promise.all([
      scoutSnapshotService.buscarScoutsFrozen(rodadaAtual),
      buscarAtletasPontuados(),
    ]);

    // Persistência assíncrona (não bloqueia resposta)
    if (Object.keys(atletasLive).length > 0) {
      scoutSnapshotService.salvarScouts(rodadaAtual, temporada, atletasLive).catch(() => {});
      scoutSnapshotService
        .detectarClubesCongelados(rodadaAtual, temporada)
        .then((clubes) => scoutSnapshotService.congelarAtletasDeClubes(rodadaAtual, clubes))
        .catch(() => {});
    }

    // Frozen tem prioridade: dados definitivos do banco sobrescrevem a API live
    const atletasPontuados = { ...atletasLive, ...scoutsFrozen };

    // 4. Buscar escalações e calcular pontuações (concorrência ≤8)
    const resultados = [];
    let idx = 0;
    let ativos = 0;

    await new Promise((resolve) => {
      if (!timesAtivos.length) return resolve();
      const next = () => {
        while (ativos < MAX_CONCURRENT && idx < timesAtivos.length) {
          const time = timesAtivos[idx++];
          ativos++;
          buscarEscalacao(time.timeId, rodadaAtual)
            .then((esc) => resultados.push(esc ? calcularPontuacao(esc, atletasPontuados, time) : _timeVazio(time, true)))
            .catch(() => resultados.push(_timeVazio(time, true)))
            .finally(() => {
              ativos--;
              if (idx >= timesAtivos.length && ativos === 0) resolve();
              else next();
            });
        }
      };
      next();
    });

    resultados.sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
    resultados.forEach((r, i) => { r.posicao = i + 1; });

    const inativos = timesInativosArr
      .sort((a, b) => (b.rodada_desistencia || 0) - (a.rodada_desistencia || 0))
      .map((t) => ({
        timeId: t.timeId,
        nome_time: t.nome_time,
        nome_cartola: t.nome_cartola,
        escudo: t.escudo,
        clube_id: t.clube_id,
        ativo: false,
        rodada_desistencia: t.rodada_desistencia,
      }));

    const temResultados = resultados.length > 0;

    if (!temResultados) {
      console.warn(`[PARCIAIS-CTRL] 0 resultados para liga ${ligaId}. ` +
        `liga.times: ${liga.times?.length || 0}, timesRaw: ${timesRaw.length}, ` +
        `timesAtivos: ${timesAtivos.length}, timesInativos: ${timesInativosArr.length}, ` +
        `atletasLive: ${Object.keys(atletasLive).length}`);
    }

    const payload = {
      disponivel: temResultados,
      rodada: rodadaAtual,
      participantes: resultados,
      inativos,
      totalTimes: resultados.length,
      totalInativos: inativos.length,
      atualizadoEm: new Date(),
      // Diagnóstico quando vazio — ajuda frontend a mostrar mensagem útil
      ...(!temResultados && {
        motivo: "sem_dados_parciais",
        diagnostico: {
          timesNaLiga: liga.times?.length || 0,
          timesEncontrados: timesRaw.length,
          timesAtivos: timesAtivos.length,
          timesInativos: timesInativosArr.length,
          atletasPontuados: Object.keys(atletasLive).length,
        },
      }),
    };

    // Não cachear resposta vazia — evitar cache poisoning
    if (temResultados) {
      parciaisCache.set(cacheKey, payload);
    }
    return res.json(payload);
  } catch (err) {
    console.error("[PARCIAIS-CTRL] Erro:", err.message);
    return res.status(500).json({ erro: "Erro ao calcular parciais", detalhe: err.message });
  }
}
