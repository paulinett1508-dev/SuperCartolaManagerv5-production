// services/scoutSnapshotService.js
// ✅ v1.1: Fonte de calendário trocada: CalendarioBrasileirao (sync automático 2h/6h)
//          em vez de CalendarioRodada (alimentação manual)
// ✅ v1.0: Gerencia persistência e congelamento de scouts de atletas
//
// Fluxo:
//   1. salvarScouts()        → upsert bulk de todos os atletas pontuados da rodada
//   2. detectarClubesCongelados() → clubes cujas partidas encerraram há 12h+
//                                   Fonte: CalendarioBrasileirao (sync-brasileirao.js, automático)
//                                   Campos: mandante_id / visitante_id (IDs Cartola)
//   3. congelarAtletasDeClubes() → marca frozen=true para esses atletas no banco
//   4. buscarScoutsFrozen()  → retorna mapa { atletaId → dados } para atletas congelados

import ScoutSnapshot from "../models/ScoutSnapshot.js";
import CalendarioBrasileirao from "../models/CalendarioBrasileirao.js";

// Janela de segurança: só congela após 12h do término estimado do jogo
const FREEZE_THRESHOLD_MS = 12 * 60 * 60 * 1000;
// Margem conservadora de duração de partida (início + 2h)
const MATCH_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Detecta IDs de clubes cujas partidas encerraram há ≥12h na rodada informada.
 *
 * Fonte: CalendarioBrasileirao — sincronizado automaticamente pelo sync-brasileirao.js:
 *   • Sync completo: 1x/dia às 06:00 BRT (ESPN + Cartola)
 *   • Mini-sync: a cada 2h em dias com jogos (atualiza status ao vivo → encerrado)
 *
 * Campos usados: partida.mandante_id / partida.visitante_id (IDs Cartola, iguais a clube_id)
 *
 * @param {number} rodada   - número da rodada atual (vem do mercado/status da Cartola)
 * @param {number} temporada
 * @returns {Set<number>} clubeIds cujos atletas devem ser congelados
 */
async function detectarClubesCongelados(rodada, temporada) {
  try {
    const calendario = await CalendarioBrasileirao.findOne({ temporada }).lean();
    if (!calendario?.partidas?.length) return new Set();

    const agora = Date.now();
    const clubesCongelados = new Set();

    // Filtrar apenas as partidas da rodada atual
    const partidasRodada = calendario.partidas.filter((p) => p.rodada === rodada);

    for (const partida of partidasRodada) {
      if (partida.status !== "encerrado") continue;
      if (!partida.data || !partida.horario) continue;

      // Horário de início em Brasília (UTC-3)
      const inicio = new Date(`${partida.data}T${partida.horario}:00-03:00`);
      // Estimativa de término: início + 2h (margem conservadora)
      const estimativaTermino = new Date(inicio.getTime() + MATCH_DURATION_MS);

      if (agora - estimativaTermino.getTime() >= FREEZE_THRESHOLD_MS) {
        // mandante_id / visitante_id = IDs Cartola (mesmo campo clube_id nos atletas)
        if (partida.mandante_id) clubesCongelados.add(partida.mandante_id);
        if (partida.visitante_id) clubesCongelados.add(partida.visitante_id);
      }
    }

    return clubesCongelados;
  } catch (err) {
    console.error("[SCOUT-SNAPSHOT] Erro ao detectar clubes congelados:", err.message);
    return new Set();
  }
}

/**
 * Upsert bulk de todos os atletas pontuados da rodada no banco.
 * Preserva frozen/frozenAt se já existirem (setOnInsert garante que não sobrescreve).
 *
 * @param {number} rodada
 * @param {number} temporada
 * @param {Object} atletasPontuados  { [atletaId]: { pontuacao, entrou_em_campo, scout, clube_id, apelido } }
 */
async function salvarScouts(rodada, temporada, atletasPontuados) {
  const entradas = Object.entries(atletasPontuados);
  if (!entradas.length) return;

  const ops = entradas.map(([idStr, atleta]) => {
    const atletaId = parseInt(idStr, 10);
    return {
      updateOne: {
        filter: { rodada, atletaId },
        update: {
          $set: {
            temporada,
            clubeId:         atleta.clube_id    || 0,
            apelido:         atleta.apelido     || "",
            pontos:          atleta.pontuacao   || 0,
            scout:           atleta.scout       || {},
            entrou_em_campo: atleta.entrou_em_campo ?? null,
            coletadoEm:      new Date(),
          },
          // Só define frozen/frozenAt no primeiro insert; nunca sobrescreve
          $setOnInsert: { frozen: false, frozenAt: null },
        },
        upsert: true,
      },
    };
  });

  try {
    await ScoutSnapshot.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // BulkWrite pode ter erros parciais (ex: E11000 em race condition) — logar e seguir
    console.error("[SCOUT-SNAPSHOT] Erro no bulkWrite:", err.message);
  }
}

/**
 * Marca frozen=true para atletas de clubes que encerraram há ≥12h.
 * Idempotente: só atualiza registros com frozen=false.
 *
 * @param {number} rodada
 * @param {Set<number>} clubesCongelados
 * @returns {number} quantidade de atletas congelados
 */
async function congelarAtletasDeClubes(rodada, clubesCongelados) {
  if (!clubesCongelados.size) return 0;

  try {
    const result = await ScoutSnapshot.updateMany(
      { rodada, clubeId: { $in: [...clubesCongelados] }, frozen: { $ne: true } },
      { $set: { frozen: true, frozenAt: new Date() } },
    );
    if (result.modifiedCount > 0) {
      console.log(`[SCOUT-SNAPSHOT] ❄️  ${result.modifiedCount} atletas congelados (rodada ${rodada})`);
    }
    return result.modifiedCount;
  } catch (err) {
    console.error("[SCOUT-SNAPSHOT] Erro ao congelar atletas:", err.message);
    return 0;
  }
}

/**
 * Retorna mapa { atletaId → dadosAtleta } para atletas frozen da rodada.
 * Usado pelo parciaisController para não consultar a API Cartola para esses atletas.
 *
 * @param {number} rodada
 * @returns {Object} { [atletaId]: { pontuacao, entrou_em_campo, apelido, clube_id, scout, _frozen } }
 */
async function buscarScoutsFrozen(rodada) {
  try {
    const docs = await ScoutSnapshot.find({ rodada, frozen: true }).lean();
    const mapa = {};
    for (const d of docs) {
      mapa[d.atletaId] = {
        pontuacao:       d.pontos,
        entrou_em_campo: d.entrou_em_campo,
        apelido:         d.apelido,
        clube_id:        d.clubeId,
        scout:           d.scout || {},
        _frozen:         true,
      };
    }
    return mapa;
  } catch (err) {
    console.error("[SCOUT-SNAPSHOT] Erro ao buscar scouts frozen:", err.message);
    return {};
  }
}

export default {
  detectarClubesCongelados,
  salvarScouts,
  congelarAtletasDeClubes,
  buscarScoutsFrozen,
};
