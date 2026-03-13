#!/usr/bin/env node
// =====================================================================
// FIX: Marcar registros com falha de população como populacaoFalhou=true
//
// Detecta registros que foram gravados com rodadaNaoJogada=true + pontos=0
// mas que na verdade são falhas de API (time deveria ter jogado).
//
// Heurística: Se >50% dos times de uma rodada têm pontos=0 com
// rodadaNaoJogada=true, provavelmente houve falha na API.
// Marca esses registros com populacaoFalhou=true para que o scheduler
// os re-popule automaticamente.
//
// Uso:
//   node scripts/fix-rodadas-populacao-falha.js --dry-run
//   node scripts/fix-rodadas-populacao-falha.js --force
// =====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Rodada from '../models/Rodada.js';
import { CURRENT_SEASON } from '../config/seasons.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
  console.error('❌ Use --dry-run para simular ou --force para executar');
  process.exit(1);
}

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada. Configure via .env ou variável de ambiente.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log(`🔌 Conectado ao MongoDB (temporada ${CURRENT_SEASON})`);
  console.log(`🔧 Modo: ${isDryRun ? 'DRY RUN (simulação)' : 'FORCE (executando)'}\n`);

  // Buscar todas as rodadas da temporada atual agrupadas por liga+rodada
  const pipeline = [
    { $match: { temporada: CURRENT_SEASON } },
    {
      $group: {
        _id: { ligaId: '$ligaId', rodada: '$rodada' },
        total: { $sum: 1 },
        totalNaoJogou: {
          $sum: { $cond: [{ $and: [{ $eq: ['$rodadaNaoJogada', true] }, { $eq: ['$pontos', 0] }] }, 1, 0] }
        },
        totalJogou: {
          $sum: { $cond: [{ $or: [{ $ne: ['$rodadaNaoJogada', true] }, { $gt: ['$pontos', 0] }] }, 1, 0] }
        },
      }
    },
    { $match: { totalNaoJogou: { $gt: 0 } } },
    { $sort: { '_id.rodada': 1 } }
  ];

  const grupos = await Rodada.aggregate(pipeline);

  let totalMarcados = 0;

  for (const grupo of grupos) {
    const { ligaId, rodada } = grupo._id;
    const percentNaoJogou = Math.round((grupo.totalNaoJogou / grupo.total) * 100);

    // Se >50% dos times "não jogaram", é muito provável que foi falha de API
    if (percentNaoJogou > 50) {
      console.log(
        `🚨 Liga ${ligaId} R${rodada}: ${grupo.totalNaoJogou}/${grupo.total} com pontos=0 (${percentNaoJogou}%) — PROVÁVEL FALHA DE API`
      );

      if (!isDryRun) {
        const result = await Rodada.updateMany(
          {
            ligaId,
            rodada,
            temporada: CURRENT_SEASON,
            rodadaNaoJogada: true,
            pontos: 0,
          },
          {
            $set: { populacaoFalhou: true, rodadaNaoJogada: false }
          }
        );
        console.log(`   ✅ ${result.modifiedCount} registros marcados como populacaoFalhou=true`);
        totalMarcados += result.modifiedCount;
      } else {
        console.log(`   🔍 [DRY RUN] ${grupo.totalNaoJogou} registros seriam marcados`);
        totalMarcados += grupo.totalNaoJogou;
      }
    } else {
      // Proporção baixa — pode ser legítimo (times realmente não escalaram)
      console.log(
        `ℹ️  Liga ${ligaId} R${rodada}: ${grupo.totalNaoJogou}/${grupo.total} com pontos=0 (${percentNaoJogou}%) — provavelmente legítimo`
      );
    }
  }

  console.log(`\n📊 Resumo: ${totalMarcados} registros ${isDryRun ? 'seriam' : 'foram'} marcados como populacaoFalhou=true`);
  console.log('💡 Após deploy, o scheduler vai re-popular esses registros automaticamente na próxima execução.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
