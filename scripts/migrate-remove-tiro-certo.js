/**
 * Migration: remove-tiro-certo
 * Remove a collection tirocertocaches e o campo modulos_ativos.tiroCerto de todas as ligas.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  MIGRATION: remove-tiro-certo                               ║
 * ║  DESTRUTIVO — rodar apenas após deploy do código            ║
 * ║  Use --force para executar. Default: --dry-run              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Uso:
 *   node scripts/migrate-remove-tiro-certo.js           # dry-run
 *   node scripts/migrate-remove-tiro-certo.js --force   # executa
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const isDryRun = !process.argv.includes('--force');
const DB_NAME = 'cartola-manager';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  MIGRATION: remove-tiro-certo                               ║');
console.log('║  DESTRUTIVO — rodar apenas após deploy do código            ║');
console.log(`║  Modo: ${isDryRun ? '--dry-run (nenhuma escrita)         ' : '--force  (EXECUTANDO WRITES)      '}║`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

const uri = process.env.MONGO_URI;
if (!uri) {
    console.error('❌ MONGO_URI não definida no .env');
    process.exit(1);
}

const client = new MongoClient(uri);

async function run() {
    await client.connect();
    const db = client.db(DB_NAME);

    // 1. Contar documentos na collection tirocertocaches
    const collections = await db.listCollections({ name: 'tirocertocaches' }).toArray();
    const collectionExists = collections.length > 0;
    const docCount = collectionExists
        ? await db.collection('tirocertocaches').countDocuments()
        : 0;

    // 2. Contar ligas com tiroCerto em modulos_ativos
    const ligasComTiroCerto = await db.collection('ligas').countDocuments({
        'modulos_ativos.tiroCerto': { $exists: true }
    });

    console.log(`tirocertocaches — collection existe: ${collectionExists}`);
    console.log(`tirocertocaches — documentos: ${docCount}`);
    console.log(`ligas com modulos_ativos.tiroCerto: ${ligasComTiroCerto}`);
    console.log('');

    if (isDryRun) {
        console.log('[DRY-RUN] Nenhuma alteração feita. Use --force para executar.');
        return;
    }

    // 3. Dropar collection tirocertocaches
    if (collectionExists) {
        await db.collection('tirocertocaches').drop();
        console.log(`✅ Collection tirocertocaches dropada (${docCount} documentos removidos)`);
    } else {
        console.log('ℹ️  tirocertocaches não existe — nada a dropar');
    }

    // 4. Remover tiroCerto de modulos_ativos em todas as ligas
    const result = await db.collection('ligas').updateMany(
        { 'modulos_ativos.tiroCerto': { $exists: true } },
        { $unset: { 'modulos_ativos.tiroCerto': '' } }
    );
    console.log(`✅ modulos_ativos.tiroCerto removido de ${result.modifiedCount} ligas`);

    console.log('');
    console.log('✅ Migration concluída com sucesso.');
}

run()
    .catch(err => {
        console.error('❌ Erro na migration:', err.message);
        process.exit(1);
    })
    .finally(() => client.close());
