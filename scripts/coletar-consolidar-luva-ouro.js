#!/usr/bin/env node
// =====================================================================
// COLETAR E CONSOLIDAR RODADAS — Luva de Ouro
//
// Chama coletarDadosGoleiros() e consolidarRodada() diretamente,
// sem precisar de sessão HTTP autenticada.
//
// Uso:
//   # dry-run (mostra o que faria, sem gravar)
//   node scripts/coletar-consolidar-luva-ouro.js --dry-run --liga <id> --inicio 2 --fim 6
//
//   # executar coleta + consolidação
//   node scripts/coletar-consolidar-luva-ouro.js --force --liga <id> --inicio 2 --fim 6
//
//   # rodada única
//   node scripts/coletar-consolidar-luva-ouro.js --force --liga <id> --rodada 9
//
// Exemplos prontos para o bug atual:
//   node scripts/coletar-consolidar-luva-ouro.js --force --liga 684cb1c8af923da7c7df51de --inicio 2 --fim 6
//   node scripts/coletar-consolidar-luva-ouro.js --force --liga 684cb1c8af923da7c7df51de --inicio 9 --fim 10
//   node scripts/coletar-consolidar-luva-ouro.js --force --liga 6977a62071dee12036bb163e --inicio 2 --fim 6
//   node scripts/coletar-consolidar-luva-ouro.js --force --liga 6977a62071dee12036bb163e --inicio 9 --fim 10
// =====================================================================

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // fix DNS no Windows
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { coletarDadosGoleiros, consolidarRodada } from '../services/goleirosService.js';
import Goleiros from '../models/Goleiros.js';
import { CURRENT_SEASON } from '../config/seasons.js';

dotenv.config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

if (!isDryRun && !isForce) {
  console.error('❌ Use --dry-run para simular ou --force para executar');
  process.exit(1);
}

// Ler parâmetros
const ligaIdx = args.indexOf('--liga');
const rodadaIdx = args.indexOf('--rodada');
const inicioIdx = args.indexOf('--inicio');
const fimIdx = args.indexOf('--fim');

const LIGA_ID = ligaIdx !== -1 ? args[ligaIdx + 1] : null;

if (!LIGA_ID) {
  console.error('❌ Parâmetro --liga <id> é obrigatório');
  process.exit(1);
}

let rodadaInicio, rodadaFim;
if (rodadaIdx !== -1) {
  rodadaInicio = rodadaFim = parseInt(args[rodadaIdx + 1]);
} else if (inicioIdx !== -1 && fimIdx !== -1) {
  rodadaInicio = parseInt(args[inicioIdx + 1]);
  rodadaFim = parseInt(args[fimIdx + 1]);
} else {
  console.error('❌ Use --rodada <n> ou --inicio <n> --fim <n>');
  process.exit(1);
}

if (isNaN(rodadaInicio) || isNaN(rodadaFim) || rodadaInicio > rodadaFim) {
  console.error('❌ Rodadas inválidas');
  process.exit(1);
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
  console.log(`🔌 MongoDB conectado (temporada ${CURRENT_SEASON})`);
  console.log(`🔧 Modo: ${isDryRun ? 'DRY RUN' : 'FORCE'}`);
  console.log(`🏆 Liga:    ${LIGA_ID}`);
  console.log(`📍 Rodadas: R${rodadaInicio}${rodadaInicio !== rodadaFim ? `–R${rodadaFim}` : ''}\n`);

  if (isDryRun) {
    // Dry-run: mostrar estado atual de cada rodada
    for (let r = rodadaInicio; r <= rodadaFim; r++) {
      const total = await Goleiros.countDocuments({ ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON });
      const concluidas = await Goleiros.countDocuments({ ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON, rodadaConcluida: true });
      const comPontos = await Goleiros.countDocuments({
        ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON,
        $or: [{ pontos: { $gt: 0 } }, { pontos: { $lt: 0 } }],
      });
      console.log(`R${r}: ${total} registros | concluida=${concluidas}/${total} | pontos≠0=${comPontos}/${total}`);
      if (total === 0) console.log(`     → será coletada do zero (sem registros no banco)`);
      else if (concluidas === total) console.log(`     → será re-coletada (rodadaConcluida já resetado) e consolidada`);
      else console.log(`     → será coletada e consolidada`);
    }
    console.log('\n🔍 [DRY RUN] Nenhuma alteração realizada.');
    await mongoose.disconnect();
    return;
  }

  // COLETA (todas as rodadas de uma vez — mais eficiente)
  console.log(`⬇️  Coletando R${rodadaInicio}–R${rodadaFim}... (pode levar ~${(rodadaFim - rodadaInicio + 1) * 8 * 0.5}s)`);
  try {
    const resultadoColeta = await coletarDadosGoleiros(LIGA_ID, rodadaInicio, rodadaFim);
    console.log(`✅ Coleta concluída: ${resultadoColeta.totalColetados ?? resultadoColeta.coletados ?? JSON.stringify(resultadoColeta)} registros\n`);
  } catch (err) {
    console.error('❌ Erro na coleta:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  // CONSOLIDAÇÃO (rodada por rodada — obrigatório)
  for (let r = rodadaInicio; r <= rodadaFim; r++) {
    console.log(`🔒 Consolidando R${r}...`);
    try {
      // Verificar se há pontos antes de consolidar
      const total = await Goleiros.countDocuments({ ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON });
      const comPontos = await Goleiros.countDocuments({
        ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON,
        $or: [{ pontos: { $gt: 0 } }, { pontos: { $lt: 0 } }],
      });

      if (total > 0 && comPontos === 0) {
        console.warn(`   ⚠️  R${r}: 100% zeros — consolidação pulada (API pode não ter retornado pontos ainda)`);
        continue;
      }

      const resultado = await consolidarRodada(LIGA_ID, r);
      console.log(`   ✅ R${r}: ${resultado.registrosAtualizados} registros consolidados`);
    } catch (err) {
      console.error(`   ❌ R${r}: erro na consolidação — ${err.message}`);
    }
  }

  console.log('\n✅ Concluído.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
