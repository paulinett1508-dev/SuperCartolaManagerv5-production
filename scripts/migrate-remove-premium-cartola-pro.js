#!/usr/bin/env node

/**
 * MIGRATION: remove-premium-cartola-pro
 *
 * Remove campos legados da feature Cartola PRO/Premium do MongoDB:
 *   - modulos_ativos.cartolaPro  (collection: ligas)
 *   - participantes[].premium    (collection: ligas)
 *
 * Uso:
 *   node scripts/migrate-remove-premium-cartola-pro.js           # dry-run (padrão)
 *   node scripts/migrate-remove-premium-cartola-pro.js --force   # executa de verdade
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const isDryRun = !process.argv.includes('--force');
const DB_NAME = 'cartola-manager';

// ─── Banner ──────────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════════╗
║  MIGRATION: remove-premium-cartola-pro                  ║
║  DESTRUTIVO — rodar apenas após deploy do código        ║
║  Use --force para executar. Default: --dry-run          ║
╚══════════════════════════════════════════════════════════╝
`);
console.log(`Modo: ${isDryRun ? '[DRY-RUN]' : '[FORCE — escrita real]'}\n`);

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI não definida. Configure o arquivo .env antes de rodar.');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // ── 1. Contagem de documentos afetados (sempre executa) ──────────────────
    const ligasComCartolaPro = await db.collection('ligas').countDocuments({
      'modulos_ativos.cartolaPro': { $exists: true },
    });

    const ligasComParticipantesPremium = await db.collection('ligas').countDocuments({
      'participantes.premium': { $exists: true },
    });

    console.log('Documentos afetados:');
    console.log(`  Ligas com modulos_ativos.cartolaPro: ${ligasComCartolaPro}`);
    console.log(`  Ligas com participantes[].premium:   ${ligasComParticipantesPremium}`);
    console.log('');

    // ── 2. Execução condicional ───────────────────────────────────────────────
    if (isDryRun) {
      console.log('[DRY-RUN] Nenhuma alteração feita. Use --force para executar.');
      return;
    }

    // 2a. Remover cartolaPro de modulos_ativos
    const resultCartolaPro = await db.collection('ligas').updateMany(
      { 'modulos_ativos.cartolaPro': { $exists: true } },
      { $unset: { 'modulos_ativos.cartolaPro': '' } }
    );

    // 2b. Remover campo premium de todos os participantes em todas as ligas
    const resultPremium = await db.collection('ligas').updateMany(
      { 'participantes.premium': { $exists: true } },
      { $unset: { 'participantes.$[].premium': '' } }
    );

    console.log(
      `✅ Migração executada. Ligas atualizadas: ${resultCartolaPro.modifiedCount}. ` +
        `Participantes premium field removido de ${resultPremium.modifiedCount} ligas.`
    );
  } finally {
    await client.close();
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error('❌ Erro durante a migração:', err);
  process.exit(1);
});
