#!/usr/bin/env node
// =====================================================================
// COLETAR ARTILHEIRO CAMPEÃO — Re-coleta rounds corrompidas
//
// Chama ArtilheiroCampeaoController.coletarDadosRodada() diretamente
// para cada time em cada rodada especificada.
//
// O coletarDadosRodada usa findOneAndUpdate com upsert, então
// SOBRESCREVE registros existentes — sem necessidade de reset prévio.
//
// Uso:
//   # dry-run (mostra o que faria, sem alterar dados)
//   node scripts/coletar-artilheiro.js --dry-run --liga <id> --rodada 9
//   node scripts/coletar-artilheiro.js --dry-run --liga <id> --inicio 9 --fim 10
//
//   # executar coleta (re-coleta com dados atuais da API)
//   node scripts/coletar-artilheiro.js --force --liga <id> --rodada 9
//   node scripts/coletar-artilheiro.js --force --liga <id> --inicio 8 --fim 10
//
//   # coleta para times específicos apenas (útil para R8 com 4/35 corrompidos)
//   node scripts/coletar-artilheiro.js --force --liga <id> --rodada 8 --times 8188312,13935277,25324292,4966295
//
// Exemplos para corrigir dados corrompidos:
//   # Liga principal — R8 (4 times corrompidos)
//   node scripts/coletar-artilheiro.js --force --liga 684cb1c8af923da7c7df51de --rodada 8 --times 8188312,13935277,25324292,4966295
//
//   # Liga principal — R9 e R10 (todos os times)
//   node scripts/coletar-artilheiro.js --force --liga 684cb1c8af923da7c7df51de --inicio 9 --fim 10
//
//   # Os Fuleros — R7 (1 time)
//   node scripts/coletar-artilheiro.js --force --liga 6977a62071dee12036bb163e --rodada 7 --times 51078986
//
//   # Os Fuleros — R8 e R9 (2 times)
//   node scripts/coletar-artilheiro.js --force --liga 6977a62071dee12036bb163e --inicio 8 --fim 9 --times 13935277,25330294
//
//   # Os Fuleros — R10 (2 times)
//   node scripts/coletar-artilheiro.js --force --liga 6977a62071dee12036bb163e --rodada 10 --times 13935277,51078986
// =====================================================================

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // fix DNS no Windows
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ArtilheiroCampeaoController from '../controllers/artilheiroCampeaoController.js';
import Liga from '../models/Liga.js';
import { CURRENT_SEASON } from '../config/seasons.js';
// GolsConsolidados é registrado no mongoose.models quando artilheiroCampeaoController.js é importado

dotenv.config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

if (!isDryRun && !isForce) {
  console.error('❌ Use --dry-run para simular ou --force para executar');
  process.exit(1);
}

// Parâmetros
const ligaIdx = args.indexOf('--liga');
const rodadaIdx = args.indexOf('--rodada');
const inicioIdx = args.indexOf('--inicio');
const fimIdx = args.indexOf('--fim');
const timesIdx = args.indexOf('--times');

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

// Times específicos (opcional)
let timesFilter = null;
if (timesIdx !== -1 && args[timesIdx + 1]) {
  timesFilter = args[timesIdx + 1].split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  if (timesFilter.length === 0) {
    console.error('❌ --times deve conter IDs numéricos separados por vírgula');
    process.exit(1);
  }
}

async function getParticipantes(ligaId) {
  const liga = await Liga.findById(ligaId).lean();
  if (!liga) throw new Error(`Liga ${ligaId} não encontrada`);

  if (liga.participantes && liga.participantes.length > 0) {
    return liga.participantes.filter(p => p.ativo !== false);
  }
  if (liga.times && liga.times.length > 0) {
    return liga.times.map(id => ({ time_id: id, nome: String(id) }));
  }
  return [];
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
  console.log(`🏆 Liga: ${LIGA_ID}`);
  console.log(`📍 Rodadas: R${rodadaInicio}${rodadaInicio !== rodadaFim ? `–R${rodadaFim}` : ''}`);
  if (timesFilter) console.log(`🎯 Times filtrados: ${timesFilter.join(', ')}`);
  console.log('');

  // Buscar participantes da liga
  let participantes = await getParticipantes(LIGA_ID);
  console.log(`👥 Participantes na liga: ${participantes.length}`);

  // Filtrar por times específicos se --times foi passado
  if (timesFilter) {
    participantes = participantes.filter(p => timesFilter.includes(p.time_id));
    console.log(`🎯 Participantes após filtro --times: ${participantes.length}`);
    if (participantes.length === 0) {
      console.warn('⚠️  Nenhum participante encontrado com os --times especificados');
      // Criar registros fictícios com os IDs passados (caso não estejam em liga.participantes)
      participantes = timesFilter.map(id => ({ time_id: id, nome: String(id) }));
      console.log(`   → Usando IDs diretamente: ${participantes.map(p => p.time_id).join(', ')}`);
    }
  }

  if (isDryRun) {
    // Mostrar estado atual de cada rodada
    const GolsModel = mongoose.models.GolsConsolidados;
    if (GolsModel) {
      for (let r = rodadaInicio; r <= rodadaFim; r++) {
        const timeIds = participantes.map(p => p.time_id);
        const total = await GolsModel.countDocuments({
          ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON,
          ...(timesFilter ? { timeId: { $in: timeIds } } : {}),
        });
        const comGols = await GolsModel.countDocuments({
          ligaId: LIGA_ID, rodada: r, temporada: CURRENT_SEASON,
          ...(timesFilter ? { timeId: { $in: timeIds } } : {}),
          $or: [{ golsPro: { $gt: 0 } }, { golsContra: { $gt: 0 } }],
        });
        const zerados = total - comGols;
        console.log(`R${r}: ${total} registros | com gols=${comGols} | zeros=${zerados}`);
        if (zerados > 0) console.log(`   → ${zerados} registro(s) serão re-coletados`);
      }
    }
    console.log('\n🔍 [DRY RUN] Nenhuma alteração realizada.');
    await mongoose.disconnect();
    return;
  }

  // FORCE: re-coletar rodada por rodada, time por time
  let totalRecoletados = 0;
  let totalErros = 0;

  for (let r = rodadaInicio; r <= rodadaFim; r++) {
    console.log(`\n⬇️  Coletando R${r} (${participantes.length} times)...`);
    let rodadaOk = 0;

    for (const p of participantes) {
      try {
        const resultado = await ArtilheiroCampeaoController.coletarDadosRodada(
          LIGA_ID, p.time_id, r
          // sem atletasPontuados → parcial: false (dados definitivos)
        );
        const golsPro = resultado?.golsPro ?? 0;
        const jogadores = resultado?.jogadores?.length ?? 0;
        console.log(`   ✅ ${p.nome || p.time_id}: golsPro=${golsPro}, jogadores=${jogadores}`);
        rodadaOk++;
        totalRecoletados++;
      } catch (err) {
        console.error(`   ❌ ${p.nome || p.time_id}: ${err.message}`);
        totalErros++;
      }

      // Rate limit: 300ms entre chamadas para não sobrecarregar API
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`   📊 R${r}: ${rodadaOk}/${participantes.length} coletados com sucesso`);
  }

  console.log(`\n✅ Concluído: ${totalRecoletados} registros re-coletados, ${totalErros} erros.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
