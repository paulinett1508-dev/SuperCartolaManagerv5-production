// controllers/liveController.js
// LIVE-001 — Agregador unificado de dados ao vivo da rodada.
//
// Substitui o consumo isolado de /api/parciais e /api/matchday/parciais
// retornando um snapshot coerente (mesmo atualizadoEm) num único request.
//
// Endpoint: GET /api/live/:ligaId?include=parciais,ranking
//   - parciais → snapshot detalhado (atletas, scouts) — usado pela home/live-ranking
//   - ranking  → ranking acumulado (sem atletas) — usado por mata-mata/resta-um
//   - default  → ambos
//
// Endpoints antigos permanecem ativos (migração gradual).

import NodeCache from "node-cache";
import mongoose from "mongoose";
import { computeParciais } from "./parciaisController.js";
import { buscarRankingParcial } from "../services/parciaisRankingService.js";
import liveEmitter from "../services/liveEvents.js";

const liveCache = new NodeCache({ stdTTL: 30, maxKeys: 200 });
const VALID_INCLUDES = ["parciais", "ranking"];

function parseIncludes(query) {
  const raw = (query?.include ?? VALID_INCLUDES.join(",")).toString();
  const seen = new Set();
  const out = [];
  for (const item of raw.split(",")) {
    const norm = item.trim().toLowerCase();
    if (VALID_INCLUDES.includes(norm) && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

export async function getLiveSnapshot(req, res) {
  const { ligaId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(ligaId)) {
    return res.status(400).json({ erro: "ligaId inválido" });
  }

  const includes = parseIncludes(req.query);
  if (!includes.length) {
    return res.status(400).json({
      erro: "include inválido — use parciais e/ou ranking",
      validos: VALID_INCLUDES,
    });
  }

  const cacheKey = `live_${ligaId}_${[...includes].sort().join("-")}`;
  const cached = liveCache.get(cacheKey);
  if (cached) {
    return res.json({ ...cached, _cache: true });
  }

  try {
    const tarefas = [];
    if (includes.includes("parciais")) {
      tarefas.push(computeParciais(ligaId).then((r) => ["parciais", r]));
    }
    if (includes.includes("ranking")) {
      tarefas.push(
        buscarRankingParcial(ligaId)
          .then((r) => ["ranking", { ok: true, payload: r }])
          .catch((err) => ["ranking", { ok: false, status: 500, body: { erro: err.message } }]),
      );
    }

    const resultados = await Promise.all(tarefas);

    const payload = { atualizadoEm: new Date().toISOString() };
    let rodadaDetectada = null;
    let bothOk = true;

    for (const [chave, r] of resultados) {
      if (!r.ok) {
        // Erro em um bloco não derruba o outro — propaga como sub-objeto com erro
        payload[chave] = { disponivel: false, motivo: "erro", erro: r.body?.erro };
        bothOk = false;
        continue;
      }
      payload[chave] = r.payload;
      if (!rodadaDetectada && r.payload?.rodada) rodadaDetectada = r.payload.rodada;
    }

    if (rodadaDetectada) payload.rodada = rodadaDetectada;

    // Cacheia apenas se todos os blocos pedidos vieram OK e com dados disponíveis
    const todosDisponiveis = includes.every((k) => payload[k]?.disponivel !== false);
    if (bothOk && todosDisponiveis) {
      liveCache.set(cacheKey, payload);
    }

    return res.json(payload);
  } catch (err) {
    console.error("[LIVE-CTRL] Erro:", err.message);
    return res.status(500).json({ erro: "Erro ao agregar dados live", detalhe: err.message });
  }
}

// LIVE-002 — SSE endpoint: GET /api/live/:ligaId/stream
// Substitui polling 30s por push (EventSource). Depende de liveEmitter emitido pelo liveCacheWarmer.
const SSE_HEARTBEAT_MS = 20_000;

export function getLiveStream(req, res) {
  const { ligaId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(ligaId)) {
    return res.status(400).json({ erro: "ligaId inválido" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Envia snapshot inicial imediatamente se já estiver quente no cache
  const cachedKey = `live_${ligaId}_parciais-ranking`;
  const snapshot = liveCache.get(cachedKey) ?? liveCache.get(`live_${ligaId}_parciais`);
  if (snapshot) {
    res.write(`event: parciais-update\ndata: ${JSON.stringify(snapshot)}\n\n`);
  }

  const onUpdate = (parciaisPayload) => {
    const envelope = {
      parciais: parciaisPayload,
      atualizadoEm: new Date().toISOString(),
    };
    res.write(`event: parciais-update\ndata: ${JSON.stringify(envelope)}\n\n`);
  };

  const eventName = `parciais-updated:${ligaId}`;
  liveEmitter.on(eventName, onUpdate);

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, SSE_HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    liveEmitter.removeListener(eventName, onUpdate);
  });
}
