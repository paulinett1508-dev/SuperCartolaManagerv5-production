#!/usr/bin/env node
// =====================================================================
// DIAGNÓSTICO READ-ONLY: Verifica dados stale na Rodada 9/2026
//
// Compara pontos gravados no banco (R9) com pontos da R8.
// Se R9.pontos === R8.pontos → dado stale (população rodou antes da API finalizar).
// Também consulta a API Cartola para os pontos reais da R9.
//
// Uso:
//   node scripts/diagnostico-r9-stale.js
//
// Executar na VPS:
//   docker exec scm-prod node scripts/diagnostico-r9-stale.js
// =====================================================================

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Rodada from '../models/Rodada.js';
import { CURRENT_SEASON } from '../config/seasons.js';

dotenv.config();

const LIGAS = ['684cb1c8af923da7c7df51de', '6977a62071dee12036bb163e'];
const RODADA_ALVO = 9;
const RODADA_ANTERIOR = 8;

async function fetchCartolaAPI(timeId, rodada) {
  try {
    const url = `https://api.cartola.globo.com/time/id/${timeId}/${rodada}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pontos ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
  }

  const mongoUri = MONGO_URI.includes('/cartola-manager')
    ? MONGO_URI
    : MONGO_URI.replace(/\/[^/?]+(\?|$)/, '/cartola-manager$1');
  await mongoose.connect(mongoUri);
  console.log(`🔌 MongoDB conectado (temporada ${CURRENT_SEASON})\n`);

  let totalStale = 0;
  let totalOk = 0;
  let totalSemR8 = 0;

  for (const ligaId of LIGAS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📋 Liga: ${ligaId}`);
    console.log(`${'='.repeat(70)}`);

    // Buscar R9 e R8 para todos participantes desta liga
    const docsR9 = await Rodada.find({
      ligaId,
      rodada: RODADA_ALVO,
      temporada: CURRENT_SEASON,
      populacaoFalhou: { $ne: true },
    }).lean();

    const docsR8 = await Rodada.find({
      ligaId,
      rodada: RODADA_ANTERIOR,
      temporada: CURRENT_SEASON,
      populacaoFalhou: { $ne: true },
    }).lean();

    const r8Map = new Map(docsR8.map(d => [String(d.timeId), d.pontos]));

    console.log(`  Total R9: ${docsR9.length} documentos | Total R8: ${docsR8.length} documentos\n`);

    const staleList = [];
    const okList = [];

    for (const doc of docsR9) {
      const pontosR9 = doc.pontos;
      const pontosR8 = r8Map.get(String(doc.timeId));

      if (pontosR8 === undefined) {
        totalSemR8++;
        continue;
      }

      const isStale = pontosR9 === pontosR8;
      if (isStale) {
        staleList.push(doc);
        totalStale++;
      } else {
        okList.push(doc);
        totalOk++;
      }
    }

    // Mostrar stale
    if (staleList.length > 0) {
      console.log(`  ❌ STALE (R9 === R8): ${staleList.length} participantes`);
      console.log(`  ${'─'.repeat(65)}`);

      // Consultar API Cartola para os primeiros 5 stale (rate limit)
      let apiChecked = 0;
      for (const doc of staleList) {
        const pontosR8 = r8Map.get(String(doc.timeId));
        let apiInfo = '';

        if (apiChecked < 5) {
          const pontosAPI = await fetchCartolaAPI(doc.timeId, RODADA_ALVO);
          if (pontosAPI !== null) {
            const diff = pontosAPI !== doc.pontos;
            apiInfo = diff
              ? ` | API Real: ${pontosAPI} ⚠️ DIFERENTE`
              : ` | API Real: ${pontosAPI} ✅`;
          } else {
            apiInfo = ' | API: indisponível';
          }
          apiChecked++;
          // Rate limit
          await new Promise(r => setTimeout(r, 300));
        }

        console.log(`    timeId=${doc.timeId} | ${(doc.nome_time || 'N/D').padEnd(28)} | banco=${doc.pontos} | R8=${pontosR8}${apiInfo}`);
      }
    }

    // Mostrar OK
    if (okList.length > 0) {
      console.log(`\n  ✅ OK (R9 ≠ R8): ${okList.length} participantes`);
      console.log(`  ${'─'.repeat(65)}`);
      for (const doc of okList) {
        const pontosR8 = r8Map.get(String(doc.timeId));
        console.log(`    timeId=${doc.timeId} | ${(doc.nome_time || 'N/D').padEnd(28)} | R9=${doc.pontos} | R8=${pontosR8}`);
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESUMO:`);
  console.log(`   ❌ Stale (R9===R8): ${totalStale}`);
  console.log(`   ✅ OK (R9≠R8):     ${totalOk}`);
  console.log(`   ⚠️  Sem R8:         ${totalSemR8}`);
  console.log(`${'='.repeat(70)}`);

  if (totalStale > 0) {
    console.log(`\n🔧 AÇÃO NECESSÁRIA:`);
    console.log(`   Para cada liga, usar ferramentas-rodadas.html:`);
    console.log(`   → Rodada 9, checkbox "Repopular", executar`);
    console.log(`   → Depois reconsolidar R9`);
  } else {
    console.log(`\n✅ Todos os dados da R9 parecem corretos (diferentes da R8).`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
