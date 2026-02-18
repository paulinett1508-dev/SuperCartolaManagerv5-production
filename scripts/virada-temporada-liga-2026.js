/**
 * Script de Virada de Temporada — Liga para 2026
 *
 * Atualiza o documento da liga principal:
 *   - nome: "Super Cartola 2026"
 *   - temporada: 2026
 *
 * IMPORTANTE: Gestão de participantes (novatos, não renovados)
 * deve ser feita via painel admin APÓS rodar este script.
 *
 * Uso:
 *   node scripts/virada-temporada-liga-2026.js --dry-run
 *   node scripts/virada-temporada-liga-2026.js --force
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

const LIGA_ID   = '684cb1c8af923da7c7df51de'; // Super Cartola
const NOME_NOVO = 'Super Cartola 2026';
const TEMP_NOVO = 2026;

async function run() {
    console.log(`🔧 Modo: ${isDryRun ? 'DRY-RUN (nada será alterado)' : 'FORCE (execução real)'}`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const col = mongoose.connection.db.collection('ligas');
    const liga = await col.findOne({ _id: new mongoose.Types.ObjectId(LIGA_ID) });

    if (!liga) {
        console.error(`❌ Liga ${LIGA_ID} não encontrada!`);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log('=== ESTADO ATUAL DA LIGA ===');
    console.log(`  _id:       ${liga._id}`);
    console.log(`  nome:      ${liga.nome}`);
    console.log(`  temporada: ${liga.temporada}`);
    console.log(`  ativa:     ${liga.ativa}`);
    console.log(`  participantes: ${liga.participantes?.length || 0}`);

    const ativos    = liga.participantes?.filter(p => p.ativo !== false) || [];
    const inativos  = liga.participantes?.filter(p => p.ativo === false) || [];
    console.log(`  participantes ativos:   ${ativos.length}`);
    console.log(`  participantes inativos: ${inativos.length}`);

    console.log('\n=== PARTICIPANTES ATIVOS (para revisão) ===');
    ativos.forEach((p, i) => {
        console.log(`  [${i + 1}] time_id=${p.time_id || p.timeId} nome=${p.nome_cartoleiro || p.nome || '?'} ativo=${p.ativo}`);
    });

    console.log('\n=== MUDANÇAS A APLICAR ===');
    console.log(`  nome:      "${liga.nome}" → "${NOME_NOVO}"`);
    console.log(`  temporada: ${liga.temporada} → ${TEMP_NOVO}`);
    console.log('\n  ⚠️  Participantes NÃO serão alterados por este script.');
    console.log('     Após executar, use o painel admin para:');
    console.log('     • Desativar os 2-3 que não renovaram');
    console.log('     • Adicionar os 3 novatos');

    if (isDryRun) {
        console.log('\n🔍 DRY-RUN: nenhuma alteração foi feita.');
    } else {
        await col.updateOne(
            { _id: new mongoose.Types.ObjectId(LIGA_ID) },
            { $set: { nome: NOME_NOVO, temporada: TEMP_NOVO } }
        );

        // Confirmar
        const ligaAtualizada = await col.findOne({ _id: new mongoose.Types.ObjectId(LIGA_ID) });
        console.log('\n✅ Liga atualizada:');
        console.log(`   nome:      ${ligaAtualizada.nome}`);
        console.log(`   temporada: ${ligaAtualizada.temporada}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Modo: ${isDryRun ? '🔍 DRY-RUN (nada alterado)' : '✅ EXECUTADO'}`);
    console.log(`${'='.repeat(60)}\n`);

    await mongoose.disconnect();
    console.log('🔌 Desconectado.');
}

run().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
