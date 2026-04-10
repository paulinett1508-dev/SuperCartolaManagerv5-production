#!/usr/bin/env node
// =====================================================================
// RESET: rodadaConcluida R9 e R10 na collection Goleiros
//
// PROBLEMA:
//   - Liga 684cb1c8af923da7c7df51de — R9 e R10 foram consolidadas com
//     pontos zerados (coleta prematura antes dos jogos ocorrerem).
//   - rodadaConcluida: true impede re-coleta pelo skip logic.
//   - Este script reseta rodadaConcluida: false, liberando re-coleta
//     e re-consolidação manual via admin panel.
//
// APÓS EXECUTAR COM --force:
//   1. Acesse Admin → Liga → Luva de Ouro
//   2. Clique "Coletar dados" para R9 e R10
//   3. Verifique os pontos coletados
//   4. Clique "Consolidar" para R9 e R10
//
// Uso:
//   node scripts/reset-goleiros-r9-r10.js --dry-run
//   node scripts/reset-goleiros-r9-r10.js --force
//   node scripts/reset-goleiros-r9-r10.js --force --liga <ligaId>
// =====================================================================

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // fix DNS no Windows
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Goleiros from '../models/Goleiros.js';
import { CURRENT_SEASON } from '../config/seasons.js';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
  console.error('❌ Use --dry-run para simular ou --force para executar');
  process.exit(1);
}

// Liga padrão auditada; pode ser sobrescrita via --liga <id>
const ligaArgIdx = process.argv.indexOf('--liga');
const LIGA_ID = ligaArgIdx !== -1 ? process.argv[ligaArgIdx + 1] : '684cb1c8af923da7c7df51de';

const RODADAS = [9, 10];

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
  console.log(`🔌 MongoDB conectado (temporada ${CURRENT_SEASON})`);
  console.log(`🔧 Modo: ${isDryRun ? 'DRY RUN' : 'FORCE'}`);
  console.log(`🏆 Liga: ${LIGA_ID}`);
  console.log(`📍 Rodadas: ${RODADAS.join(', ')}\n`);

  let totalAfetados = 0;

  for (const rodada of RODADAS) {
    const filtro = {
      ligaId: LIGA_ID,
      rodada,
      temporada: CURRENT_SEASON,
    };

    const total = await Goleiros.countDocuments(filtro);
    const jaConcluidas = await Goleiros.countDocuments({ ...filtro, rodadaConcluida: true });
    const comPontos = await Goleiros.countDocuments({
      ...filtro,
      $or: [{ pontos: { $gt: 0 } }, { pontos: { $lt: 0 } }],
    });
    const comZero = total - comPontos;

    console.log(`📋 R${rodada}:`);
    console.log(`   Total registros:   ${total}`);
    console.log(`   rodadaConcluida:   ${jaConcluidas} true / ${total - jaConcluidas} false`);
    console.log(`   Com pontos ≠ 0:    ${comPontos}`);
    console.log(`   Com pontos = 0:    ${comZero} (${total > 0 ? Math.round((comZero / total) * 100) : 0}%)`);

    if (!isDryRun) {
      const resultado = await Goleiros.updateMany(
        { ...filtro, rodadaConcluida: true },
        { $set: { rodadaConcluida: false } }
      );
      console.log(`   ✅ ${resultado.modifiedCount} registros resetados para rodadaConcluida: false\n`);
      totalAfetados += resultado.modifiedCount;
    } else {
      console.log(`   🔍 [DRY RUN] ${jaConcluidas} registros seriam resetados\n`);
      totalAfetados += jaConcluidas;
    }
  }

  console.log(`\n📊 ${isDryRun ? 'Simulação' : 'Reset'} concluído: ${totalAfetados} registro(s) afetado(s).`);

  if (!isDryRun) {
    console.log('\n⚠️  PRÓXIMOS PASSOS:');
    console.log('  1. Admin Panel → Liga → Luva de Ouro');
    console.log('  2. Coletar dados: R9 e R10');
    console.log('  3. Verificar pontos coletados');
    console.log('  4. Consolidar: R9 e R10');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
