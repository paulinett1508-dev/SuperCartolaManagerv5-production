/**
 * Script: reset-mata-mata-cache.js
 *
 * Resets ultima_rodada_consolidada to -1 for all ExtratoFinanceiroCache documents
 * in ligas with mata_mata module enabled (current season).
 *
 * This forces getExtratoFinanceiro() to rebuild the cache with corrected mataMata
 * values in consolidated summaries (v8.20.0 fix).
 *
 * Usage:
 *   node scripts/reset-mata-mata-cache.js --dry-run   # preview
 *   node scripts/reset-mata-mata-cache.js --force     # execute
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI não definida');
    process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

console.log(`\n🔄 Reset Mata-Mata Cache — modo: ${isDryRun ? 'DRY-RUN' : 'FORCE'}\n`);

await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;

const CURRENT_SEASON = 2026;

// 1. Encontrar ligas com mata_mata habilitado
const ligas = await db.collection('ligas').find(
    { $or: [
        { 'modulos_ativos.mataMata': true },
        { 'configuracoes.mata_mata.habilitado': true }
    ]},
    { projection: { _id: 1, nome: 1 } }
).toArray();

console.log(`📋 Ligas com mata-mata: ${ligas.length}`);
ligas.forEach(l => console.log(`   - ${l.nome} (${l._id})`));

// liga_id in extratofinanceirocaches is stored as STRING
const ligaIds = ligas.map(l => l._id.toString());

// 2. Encontrar caches da temporada atual nessas ligas
const caches = await db.collection('extratofinanceirocaches').find(
    {
        liga_id: { $in: ligaIds },
        temporada: CURRENT_SEASON,
        // Only reset caches that have actual rodada data (>0 means campeonato started)
        // Avoids disturbing pre-season caches (ultima_rodada_consolidada=0)
        ultima_rodada_consolidada: { $gt: 0 }
    },
    { projection: { _id: 1, liga_id: 1, time_id: 1, ultima_rodada_consolidada: 1 } }
).toArray();

console.log(`\n📦 Caches a resetar: ${caches.length}`);
caches.forEach(c => {
    const liga = ligas.find(l => l._id.equals(c.liga_id));
    console.log(`   - Liga: ${liga?.nome || c.liga_id} | time_id: ${c.time_id} | ultima_rodada: ${c.ultima_rodada_consolidada}`);
});

if (isDryRun) {
    console.log('\n🔍 DRY-RUN — nenhuma alteração realizada.');
    await mongoose.disconnect();
    process.exit(0);
}

// 3. Executar reset
const cacheIds = caches.map(c => c._id);
const resultado = await db.collection('extratofinanceirocaches').updateMany(
    { _id: { $in: cacheIds } },
    { $set: { ultima_rodada_consolidada: -1 } }
);

console.log(`\n✅ Caches resetados: ${resultado.modifiedCount}`);
console.log('   Próxima abertura do extrato ou calcularSaldosBulk vai reconstruir com mataMata correto.');

await mongoose.disconnect();
process.exit(0);
