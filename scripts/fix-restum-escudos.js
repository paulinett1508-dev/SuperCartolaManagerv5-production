/**
 * fix-restum-escudos.js
 * Corrige escudoId null nos participantes de edições do Resta Um,
 * preenchendo com clube_id da liga.
 *
 * Uso:
 *   node scripts/fix-restum-escudos.js --dry-run   # Simular
 *   node scripts/fix-restum-escudos.js --force      # Executar
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

async function main() {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    console.log('✅ Conectado ao MongoDB');

    const restaUmCaches = db.collection('restaumcaches');
    const ligas = db.collection('ligas');

    // Buscar todas as edições que tenham participantes com escudoId null
    const edicoes = await restaUmCaches.find({
        'participantes.escudoId': null
    }).toArray();

    console.log(`\n📋 Edições com escudoId null: ${edicoes.length}`);

    let totalCorrigidos = 0;

    for (const edicao of edicoes) {
        console.log(`\n🔄 Edição ${edicao.edicao} | Liga: ${edicao.liga_id} | Status: ${edicao.status}`);

        // Buscar liga para obter clube_id dos participantes
        const liga = await ligas.findOne({ _id: new mongoose.Types.ObjectId(edicao.liga_id) });
        if (!liga) {
            console.log('  ⚠️ Liga não encontrada, pulando...');
            continue;
        }

        // Criar mapa timeId → clube_id
        const mapaClubeId = {};
        for (const p of (liga.participantes || [])) {
            if (p.time_id && p.clube_id) {
                mapaClubeId[p.time_id] = p.clube_id;
            }
        }

        let corrigidosEdicao = 0;
        const participantesAtualizados = edicao.participantes.map(p => {
            if (p.escudoId === null && mapaClubeId[p.timeId]) {
                corrigidosEdicao++;
                return { ...p, escudoId: mapaClubeId[p.timeId] };
            }
            return p;
        });

        console.log(`  📊 ${corrigidosEdicao}/${edicao.participantes.length} participantes a corrigir`);

        if (corrigidosEdicao > 0) {
            if (isForce) {
                await restaUmCaches.updateOne(
                    { _id: edicao._id },
                    { $set: { participantes: participantesAtualizados } }
                );
                console.log(`  ✅ Atualizado no banco`);
            } else {
                // Mostrar amostra
                const amostra = participantesAtualizados.filter(p => p.escudoId !== null).slice(0, 3);
                for (const p of amostra) {
                    console.log(`    → ${p.nomeTime}: escudoId = ${p.escudoId}`);
                }
                console.log('  🔍 [DRY-RUN] Nenhuma alteração feita');
            }
            totalCorrigidos += corrigidosEdicao;
        }
    }

    console.log(`\n✅ Total de participantes ${isDryRun ? 'a corrigir' : 'corrigidos'}: ${totalCorrigidos}`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
