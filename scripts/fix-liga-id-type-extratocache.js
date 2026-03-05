/**
 * Migration: Normalizar liga_id para String em ExtratoFinanceiroCache
 *
 * Problema: liga_id era Mixed (String|ObjectId), causando queries inconsistentes.
 * Fix: Converter todos os ObjectId para String.
 *
 * Uso:
 *   node scripts/fix-liga-id-type-extratocache.js --dry-run   # Simular
 *   node scripts/fix-liga-id-type-extratocache.js --force      # Executar
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
    console.error('Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('Conectado ao MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('extratofinanceirocaches');

    // Encontrar docs onde liga_id é ObjectId (não String)
    const docsComObjectId = await collection.find({
        liga_id: { $type: 'objectId' }
    }).toArray();

    console.log(`Encontrados ${docsComObjectId.length} docs com liga_id como ObjectId`);

    if (docsComObjectId.length === 0) {
        console.log('Nenhum doc para converter. Tudo OK!');
        await mongoose.disconnect();
        return;
    }

    if (isDryRun) {
        console.log('\n[DRY-RUN] Docs que seriam convertidos:');
        for (const doc of docsComObjectId) {
            console.log(`  _id=${doc._id} liga_id=${doc.liga_id} (${typeof doc.liga_id}) -> "${String(doc.liga_id)}" time_id=${doc.time_id} temp=${doc.temporada}`);
        }
        console.log(`\n[DRY-RUN] ${docsComObjectId.length} docs seriam atualizados`);
    } else {
        let updated = 0;
        for (const doc of docsComObjectId) {
            const newLigaId = String(doc.liga_id);

            // Verificar se ja existe um doc String com mesmo liga_id+time_id+temporada
            const existente = await collection.findOne({
                liga_id: newLigaId,
                time_id: doc.time_id,
                temporada: doc.temporada,
                _id: { $ne: doc._id }
            });

            if (existente) {
                // Doc String ja existe — deletar o ObjectId (duplicata)
                console.log(`  DUPLICATA: _id=${doc._id} (ObjectId) conflita com _id=${existente._id} (String) -> deletando ObjectId`);
                await collection.deleteOne({ _id: doc._id });
            } else {
                // Converter ObjectId -> String
                await collection.updateOne(
                    { _id: doc._id },
                    { $set: { liga_id: newLigaId } }
                );
                console.log(`  CONVERTIDO: _id=${doc._id} liga_id=${newLigaId}`);
            }
            updated++;
        }
        console.log(`\n${updated} docs processados`);
    }

    await mongoose.disconnect();
    console.log('Desconectado');
}

main().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
