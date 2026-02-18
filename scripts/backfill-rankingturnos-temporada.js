/**
 * Backfill: adiciona campo `temporada` e `ligaId` nos docs de rankingturnos
 * que foram criados antes do schema incluir esses campos.
 *
 * Uso:
 *   node scripts/backfill-rankingturnos-temporada.js --dry-run
 *   node scripts/backfill-rankingturnos-temporada.js --force
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const isDryRun = process.argv.includes('--dry-run');
const isForce  = process.argv.includes('--force');

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

// Ligas conhecidas (2025) — usadas apenas para backfill histórico
const LIGAS_2025 = {
    SUPER_CARTOLA: new mongoose.Types.ObjectId('684cb1c8af923da7c7df51de'),
    SOBRAL:        new mongoose.Types.ObjectId('684d821cf1a7ae16d1f89572'),
};
const TEMPORADA_BACKFILL = 2025;

async function run() {
    console.log(`🔧 Modo: ${isDryRun ? 'DRY-RUN' : 'FORCE'}`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const col = mongoose.connection.db.collection('rankingturnos');

    // Buscar docs sem temporada OU com temporada undefined/null
    const semTemporada = await col.find({
        $or: [
            { temporada: { $exists: false } },
            { temporada: null }
        ]
    }).toArray();

    console.log(`📊 Docs rankingturnos sem temporada: ${semTemporada.length}\n`);

    if (semTemporada.length === 0) {
        console.log('✅ Nenhum doc para corrigir.');
        await mongoose.disconnect();
        return;
    }

    for (const doc of semTemporada) {
        // Inferir ligaId a partir dos dados do doc (rodadas cobrem R1..R38 = 2025)
        // Se ligaId já está presente, preserva; senão tenta inferir
        const ligaIdExistente = doc.ligaId || doc.liga_id;

        // Determinar ligaId: se existir no doc, usar; senão inferir pelo turno
        // (docs de 2025 da liga Super Cartola — confirmado pela auditoria)
        let ligaIdFinal = ligaIdExistente;
        if (!ligaIdFinal) {
            // Fallback: Super Cartola (liga principal com mais dados)
            ligaIdFinal = LIGAS_2025.SUPER_CARTOLA;
        }

        console.log(`  Doc _id=${doc._id} turno=${doc.turno} rodada_atual=${doc.rodada_atual}`);
        console.log(`    ligaId atual: ${ligaIdExistente || '(ausente)'}`);
        console.log(`    → Setar temporada=${TEMPORADA_BACKFILL}, ligaId=${ligaIdFinal}`);

        if (!isDryRun) {
            await col.updateOne(
                { _id: doc._id },
                { $set: { temporada: TEMPORADA_BACKFILL, ligaId: new mongoose.Types.ObjectId(String(ligaIdFinal)) } }
            );
            console.log(`    ✅ Atualizado`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RESUMO: ${semTemporada.length} docs ${isDryRun ? '(simulado, nada alterado)' : 'atualizados'}`);
    console.log(`${'='.repeat(60)}\n`);

    await mongoose.disconnect();
    console.log('🔌 Desconectado.');
}

run().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
