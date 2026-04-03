#!/usr/bin/env node
// =====================================================================
// FIX PONTUAL: Corrigir pontuação incorreta de Paulinett Miranda na rodada 9/2026
//
// DIAGNÓSTICO:
//   - timeId: 13935277, rodada 9, temporada 2026
//   - Pontos gravados: 56.300048828125 (idêntico ao da rodada 8 — dado stale)
//   - Pontos reais (Cartola API consultada em 2026-04-03): 28.5799560546875
//   - Causa: populate rodou antes do Cartola processar os scores da R9
//   - Afeta 2 documentos: liga 684cb1c8af923da7c7df51de e 6977a62071dee12036bb163e
//
// Uso:
//   node scripts/fix-rodada9-paulinett.js --dry-run
//   node scripts/fix-rodada9-paulinett.js --force
// =====================================================================

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // fix DNS no Windows
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Rodada from '../models/Rodada.js';
import { CURRENT_SEASON } from '../config/seasons.js';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
  console.error('❌ Use --dry-run para simular ou --force para executar');
  process.exit(1);
}

const TIME_ID = 13935277;
const RODADA = 9;

// Dados reais obtidos da API Cartola em 2026-04-03T12:13 (rodada 10 já aberta = R9 finalizada)
// GET https://api.cartola.globo.com/time/id/13935277/9
const DADOS_REAIS = {
  pontos: 28.5799560546875,
  capitao_id: 90302,          // Pedro Rocha (estava 94583=Pedro — errado)
  reserva_luxo_id: 90302,     // Pedro Rocha
  atletas_pontos: [
    { atleta_id: 84339,  pontos_num: 2.8,   status_id: 7, entrou_em_campo: true },   // Bruno Melo
    { atleta_id: 101254, pontos_num: 2.4,   status_id: 7, entrou_em_campo: true },   // Alef Manga
    { atleta_id: 104118, pontos_num: -0.4,  status_id: 7, entrou_em_campo: true },   // Lucas Arcanjo
    { atleta_id: 97432,  pontos_num: -0.1,  status_id: 7, entrou_em_campo: true },   // Victor Caetano
    { atleta_id: 142004, pontos_num: 2.4,   status_id: 7, entrou_em_campo: true },   // Amuzu
    { atleta_id: 73481,  pontos_num: 2.88,  status_id: 7, entrou_em_campo: true },   // Gilmar Dal Pozzo
    { atleta_id: 90302,  pontos_num: 1.2,   status_id: 7, entrou_em_campo: true },   // Pedro Rocha
    { atleta_id: 145744, pontos_num: 11.4,  status_id: 7, entrou_em_campo: true },   // André
    { atleta_id: 72951,  pontos_num: 5.0,   status_id: 7, entrou_em_campo: true },   // Mercado
    { atleta_id: 105531, pontos_num: -0.8,  status_id: 3, entrou_em_campo: true },   // Matheus Bidu
    { atleta_id: 116034, pontos_num: 0.5,   status_id: 7, entrou_em_campo: true },   // Victor Hugo
    { atleta_id: 102911, pontos_num: 0.7,   status_id: 3, entrou_em_campo: true },   // Zé Ricardo
    // reservas
    { atleta_id: 107554, pontos_num: 17.7,  status_id: 2, entrou_em_campo: true },   // Natanael
    { atleta_id: 122441, pontos_num: 0,     status_id: 6, entrou_em_campo: false },  // Kayky Almeida
    { atleta_id: 99552,  pontos_num: 0.9,   status_id: 7, entrou_em_campo: true },   // Rossi
    { atleta_id: 93790,  pontos_num: 19.1,  status_id: 7, entrou_em_campo: true },   // Marlon Freitas
    { atleta_id: 94583,  pontos_num: 0.5,   status_id: 7, entrou_em_campo: true },   // Pedro
  ],
};

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
  }

  // Garantir conexão ao banco cartola-manager (produção)
  const mongoUri = MONGO_URI.includes('/cartola-manager')
    ? MONGO_URI
    : MONGO_URI.replace(/\/[^/?]+(\?|$)/, '/cartola-manager$1');
  await mongoose.connect(mongoUri);
  console.log(`🔌 MongoDB conectado (temporada ${CURRENT_SEASON})`);
  console.log(`🔧 Modo: ${isDryRun ? 'DRY RUN' : 'FORCE'}\n`);

  const docs = await Rodada.find({
    timeId: TIME_ID,
    rodada: RODADA,
    temporada: CURRENT_SEASON,
  }).lean();

  if (docs.length === 0) {
    console.error(`❌ Nenhum documento encontrado para timeId=${TIME_ID} rodada=${RODADA} temporada=${CURRENT_SEASON}`);
    process.exit(1);
  }

  console.log(`📋 ${docs.length} documento(s) encontrado(s):\n`);

  for (const doc of docs) {
    console.log(`  Liga: ${doc.ligaId}`);
    console.log(`  _id:  ${doc._id}`);
    console.log(`  pontos:    ${doc.pontos} → ${DADOS_REAIS.pontos}`);
    console.log(`  capitao:   ${doc.capitao_id} → ${DADOS_REAIS.capitao_id}`);
    console.log(`  rsv_luxo:  ${doc.reserva_luxo_id} → ${DADOS_REAIS.reserva_luxo_id}`);

    const atletasAlterados = DADOS_REAIS.atletas_pontos.filter(a => {
      const stored = doc.atletas.find(x => x.atleta_id === a.atleta_id);
      return stored && stored.pontos_num !== a.pontos_num;
    });
    console.log(`  atletas com pontos alterados: ${atletasAlterados.length}/${DADOS_REAIS.atletas_pontos.length}`);

    if (!isDryRun) {
      await Rodada.updateOne(
        { _id: doc._id },
        {
          $set: {
            pontos: DADOS_REAIS.pontos,
            capitao_id: DADOS_REAIS.capitao_id,
            reserva_luxo_id: DADOS_REAIS.reserva_luxo_id,
          },
        }
      );

      for (const atletaReal of DADOS_REAIS.atletas_pontos) {
        await Rodada.updateOne(
          { _id: doc._id, 'atletas.atleta_id': atletaReal.atleta_id },
          {
            $set: {
              'atletas.$.pontos_num': atletaReal.pontos_num,
              'atletas.$.status_id': atletaReal.status_id,
              'atletas.$.entrou_em_campo': atletaReal.entrou_em_campo,
            },
          }
        );
      }
      console.log(`  ✅ Corrigido\n`);
    } else {
      console.log(`  🔍 [DRY RUN] seria corrigido\n`);
    }
  }

  console.log(`📊 ${isDryRun ? 'Simulação' : 'Correção'} concluída em ${docs.length} documento(s).`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
