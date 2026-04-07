/**
 * FIX: Deleta cache PC R9 corrompido de uma liga específica.
 *
 * Problema: cache R9 foi salvo com scores do BR R9 em vez do BR R10.
 * Solução: deletar o documento → próxima requisição dispara reconstrução
 *          a partir da collection rodadas (dados corretos).
 *
 * Uso:
 *   node scripts/fix-pc-cache-r9-liga.js --liga-id <id> [--rodada <n>] [--dry-run]
 *
 * Exemplos:
 *   node scripts/fix-pc-cache-r9-liga.js --liga-id 684cb1c8af923da7c7df51de --dry-run
 *   node scripts/fix-pc-cache-r9-liga.js --liga-id 684cb1c8af923da7c7df51de --force
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const LIGA_ID = (() => { const i = args.indexOf('--liga-id'); return i !== -1 ? args[i + 1] : null; })();
const RODADA  = (() => { const i = args.indexOf('--rodada');  return i !== -1 ? Number(args[i + 1]) : 9; })();
const TEMPORADA = (() => { const i = args.indexOf('--temporada'); return i !== -1 ? Number(args[i + 1]) : 2026; })();
const DRY_RUN = !args.includes('--force');

if (!LIGA_ID) {
    console.error('❌ Informe --liga-id <id>');
    process.exit(1);
}

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) { console.error('❌ MONGO_URI não definida'); process.exit(1); }

    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const col = db.collection('pontoscorridoscaches');

    const filtro = {
        liga_id: LIGA_ID,
        rodada_consolidada: RODADA,
        temporada: TEMPORADA,
    };

    const doc = await col.findOne(filtro);
    if (!doc) {
        console.log(`ℹ️  Cache R${RODADA} não encontrado para liga ${LIGA_ID} / T${TEMPORADA}. Nada a fazer.`);
        await mongoose.disconnect();
        return;
    }

    console.log(`\n📋 Cache encontrado:`);
    console.log(`   liga_id          : ${doc.liga_id}`);
    console.log(`   rodada_consolidada: ${doc.rodada_consolidada}`);
    console.log(`   cache_permanente  : ${doc.cache_permanente}`);
    console.log(`   ultima_atualizacao: ${doc.ultima_atualizacao}`);
    console.log(`   regenerado_em     : ${doc.regenerado_em || 'N/A'}`);
    console.log(`\n   Confrontos:`);
    (doc.confrontos || []).forEach(c => {
        console.log(`     ${c.time1?.nome || c.time1?.id} (${c.time1?.pontos}) vs ${c.time2?.nome || c.time2?.id} (${c.time2?.pontos})`);
    });

    if (DRY_RUN) {
        console.log(`\n⚠️  DRY-RUN: o documento acima seria DELETADO. Use --force para confirmar.`);
        await mongoose.disconnect();
        return;
    }

    const res = await col.deleteOne(filtro);
    if (res.deletedCount === 1) {
        console.log(`\n✅ Cache R${RODADA} deletado com sucesso. A próxima requisição reconstruirá a partir dos dados reais.`);
    } else {
        console.error(`\n❌ Deleção não confirmada (deletedCount=${res.deletedCount})`);
    }

    await mongoose.disconnect();
}

main().catch(e => { console.error('❌ Erro fatal:', e.message); process.exit(1); });
