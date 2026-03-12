/**
 * INVALIDAR-CACHE-EXTRATOS.js - Limpa caches de ExtratoFinanceiroCache
 *
 * Necessário após fix v8.19.0 que alinha inscrição com InscricaoTemporada.
 * Caches antigos podem ter inscrição calculada com fonte legacy (pagouInscricao).
 *
 * Uso:
 *   node scripts/invalidar-cache-extratos.js --dry-run          # Simular
 *   node scripts/invalidar-cache-extratos.js --force             # Executar (todas as ligas, temporada atual)
 *   node scripts/invalidar-cache-extratos.js --force --liga=ID   # Uma liga específica
 *   node scripts/invalidar-cache-extratos.js --force --temporada=2026
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const ligaArg = args.find(a => a.startsWith('--liga='))?.split('=')[1];
const temporadaArg = args.find(a => a.startsWith('--temporada='))?.split('=')[1];
const temporada = temporadaArg ? parseInt(temporadaArg) : 2026;

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

async function main() {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    const db = mongoose.connection.db;
    const collection = db.collection('extratofinanceirocaches');

    const filter = { temporada };
    if (ligaArg) {
        filter.liga_id = ligaArg;
    }

    // Contar documentos afetados
    const total = await collection.countDocuments(filter);
    console.log(`📊 Caches encontrados: ${total}`);
    console.log(`   Filtro: temporada=${temporada}${ligaArg ? `, liga=${ligaArg}` : ' (todas as ligas)'}`);

    if (total === 0) {
        console.log('\n✅ Nenhum cache para invalidar.');
        await mongoose.disconnect();
        return;
    }

    if (isDryRun) {
        // Mostrar resumo por liga
        const porLiga = await collection.aggregate([
            { $match: filter },
            { $group: { _id: '$liga_id', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('\n📋 Resumo por liga:');
        for (const liga of porLiga) {
            console.log(`   Liga ${liga._id}: ${liga.count} caches`);
        }
        console.log(`\n⚠️  --dry-run: nada foi alterado. Use --force para deletar.`);
    } else {
        console.log(`\n🗑️  Deletando ${total} caches...`);
        const result = await collection.deleteMany(filter);
        console.log(`✅ ${result.deletedCount} caches removidos.`);
        console.log(`   Próximo acesso de cada participante vai recalcular com InscricaoTemporada.`);
    }

    await mongoose.disconnect();
    console.log('\n🔌 Desconectado.');
}

main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
