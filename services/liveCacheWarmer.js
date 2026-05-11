// services/liveCacheWarmer.js
// LIVE-004 — Pré-aquecimento do parciaisCache durante rodada ao vivo.
//
// Problema: 1ª request da rodada após cache TTL (30s) leva 17-27s (N+1 escalações).
// Solução: worker dispara computeParciais() a cada 25s nas ligas ativas — usuário
// sempre encontra cache hit (<10ms).
//
// Liga/desliga automaticamente conforme status_mercado da Cartola:
//   status 2/3 (rodada ao vivo) → ativo
//   demais → idle (só checa status a cada 60s)
//
// Desabilita com env LIVE_WARMER_DISABLED=1.

import axios from "axios";
import Liga from "../models/Liga.js";
import { computeParciais } from "../controllers/parciaisController.js";

const CARTOLA_API_BASE = "https://api.cartola.globo.com";
const TICK_AO_VIVO_MS = 25_000;
const TICK_IDLE_MS = 60_000;
const MAX_CONCURRENT_LIGAS = 3;
const STATUS_TIMEOUT_MS = 8_000;

let intervalId = null;
let rodando = false;

async function fetchStatusMercado() {
  try {
    const resp = await axios.get(`${CARTOLA_API_BASE}/mercado/status`, {
      timeout: STATUS_TIMEOUT_MS,
      headers: { "User-Agent": "Super-Cartola-Manager/1.0.0" },
    });
    return resp.data?.status_mercado ?? null;
  } catch {
    return null;
  }
}

async function aquecerLiga(ligaId) {
  try {
    const r = await computeParciais(String(ligaId));
    return r?.ok === true;
  } catch (err) {
    console.warn(`[LIVE-WARMER] Falha ao aquecer ${ligaId}: ${err.message}`);
    return false;
  }
}

async function tickAoVivo() {
  if (rodando) return;
  rodando = true;
  const inicio = Date.now();
  try {
    const ligas = await Liga.find({ ativa: true }, { _id: 1 }).lean();
    if (!ligas.length) return;

    let i = 0;
    let ativos = 0;
    let okCount = 0;
    let failCount = 0;

    await new Promise((resolve) => {
      const next = () => {
        while (ativos < MAX_CONCURRENT_LIGAS && i < ligas.length) {
          const id = ligas[i++]._id;
          ativos++;
          aquecerLiga(id)
            .then((ok) => { ok ? okCount++ : failCount++; })
            .finally(() => {
              ativos--;
              if (i >= ligas.length && ativos === 0) resolve();
              else next();
            });
        }
      };
      next();
    });

    const dur = Date.now() - inicio;
    console.log(`[LIVE-WARMER] tick: ${okCount}/${ligas.length} ligas aquecidas em ${dur}ms (falhas: ${failCount})`);
  } catch (err) {
    console.error("[LIVE-WARMER] Erro no tick:", err.message);
  } finally {
    rodando = false;
  }
}

function agendar(delayMs) {
  if (intervalId) clearTimeout(intervalId);
  intervalId = setTimeout(executar, delayMs);
}

async function executar() {
  const status = await fetchStatusMercado();
  const aoVivo = status === 2 || status === 3;
  if (aoVivo) {
    await tickAoVivo();
    agendar(TICK_AO_VIVO_MS);
  } else {
    agendar(TICK_IDLE_MS);
  }
}

export function start() {
  if (process.env.LIVE_WARMER_DISABLED === "1") {
    console.log("[LIVE-WARMER] Desabilitado via LIVE_WARMER_DISABLED=1");
    return;
  }
  if (intervalId) {
    console.warn("[LIVE-WARMER] Já iniciado — ignorando start() duplicado");
    return;
  }
  console.log("[LIVE-WARMER] 🔥 Iniciando worker de pré-aquecimento de parciais");
  // Primeira execução defasada para não competir com o startup
  agendar(15_000);
}

export function stop() {
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
    console.log("[LIVE-WARMER] Worker parado");
  }
}

export default { start, stop };
