/**
 * migrate-g2g3-schema.js
 *
 * Migração G2/G3: normaliza campos de identificação nas collections
 * acertofinanceiros e fluxofinanceirocampos para alinhar com o padrão
 * snake_case + Number usado pelos demais models financeiros.
 *
 * Mudanças por collection:
 *   acertofinanceiros:    ligaId (String) → liga_id (String)
 *                         timeId (String) → time_id (Number)
 *
 *   fluxofinanceirocampos: ligaId (String) → liga_id (String)
 *                          timeId (String) → time_id (Number)
 *
 * Nota: fluxofinanceirocampos possui índice único composto {ligaId,timeId,temporada}.
 * O script faz drop desse índice ANTES da migração e recria como {liga_id,time_id,temporada}
 * DEPOIS, para evitar E11000 durante o $unset.
 *
 * Uso:
 *   node scripts/migrate-g2g3-schema.js --dry-run   (simula, sem alterar)
 *   node scripts/migrate-g2g3-schema.js --force     (executa)
 *
 * @version 1.1.0
 * @since 2026-02-25
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

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
}

const COLLECTIONS = ['acertofinanceiros', 'fluxofinanceirocampos'];

// fluxofinanceirocampos tem índice único composto que precisa ser dropado antes
// do $unset (caso contrário ligaId/timeId ficam null e violam unicidade)
const FLUXO_COLL = 'fluxofinanceirocampos';
const FLUXO_INDEX_OLD = 'ligaId_1_timeId_1_temporada_1';

// Pipeline de agregação para renomear ligaId→liga_id e converter timeId (String) → time_id (Number)
// $convert com onError/onNull para não quebrar em valores inesperados
const buildPipeline = () => [
    {
        $set: {
            liga_id: '$ligaId',
            time_id: {
                $convert: {
                    input: '$timeId',
                    to: 'int',
                    onError: null,
                    onNull:  null,
                }
            }
        }
    },
    {
        $unset: ['ligaId', 'timeId']
    }
];

async function inspecionar(db, collName) {
    const total = await db.collection(collName).countDocuments();
    const comCamel = await db.collection(collName).countDocuments({ ligaId: { $exists: true } });
    const comSnake = await db.collection(collName).countDocuments({ liga_id: { $exists: true } });
    const semTimeId = await db.collection(collName).countDocuments({
        time_id: { $exists: true },
        timeId:  { $exists: false }
    });
    return { total, comCamel, comSnake, jaComSnake: semTimeId };
}

async function amostrar(db, collName) {
    const docs = await db.collection(collName).find({}, { projection: { ligaId: 1, timeId: 1, liga_id: 1, time_id: 1, temporada: 1 } }).limit(3).toArray();
    docs.forEach(d => console.log('  Amostra:', JSON.stringify(d)));
}

/**
 * Gerencia o índice único em fluxofinanceirocampos:
 * - Antes da migração: dropa o índice camelCase se existir
 * - Depois da migração: cria o índice snake_case
 */
async function gerenciarIndiceFluxo(db, fase) {
    const coll = db.collection(FLUXO_COLL);

    if (fase === 'antes') {
        const indexes = await coll.indexes();
        const existe = indexes.find(idx => idx.name === FLUXO_INDEX_OLD);
        if (existe) {
            console.log(`  [INDEX] Dropando índice antigo: ${FLUXO_INDEX_OLD}`);
            if (!isDryRun) {
                await coll.dropIndex(FLUXO_INDEX_OLD);
                console.log(`  [INDEX] Índice ${FLUXO_INDEX_OLD} removido`);
            } else {
                console.log(`  [DRY-RUN][INDEX] Simularia drop de ${FLUXO_INDEX_OLD}`);
            }
        } else {
            console.log(`  [INDEX] Índice ${FLUXO_INDEX_OLD} não encontrado (já removido ou nunca existiu)`);
        }
        return;
    }

    if (fase === 'depois') {
        const indexes = await coll.indexes();
        const novoJaExiste = indexes.find(idx =>
            idx.key && idx.key.liga_id !== undefined &&
            idx.key.time_id !== undefined &&
            idx.key.temporada !== undefined
        );
        if (novoJaExiste) {
            console.log(`  [INDEX] Índice novo {liga_id,time_id,temporada} já existe`);
        } else {
            console.log(`  [INDEX] Criando índice novo: {liga_id:1, time_id:1, temporada:1} unique`);
            if (!isDryRun) {
                await coll.createIndex(
                    { liga_id: 1, time_id: 1, temporada: 1 },
                    { unique: true, name: 'liga_id_1_time_id_1_temporada_1' }
                );
                console.log(`  [INDEX] Índice liga_id_1_time_id_1_temporada_1 criado`);
            } else {
                console.log(`  [DRY-RUN][INDEX] Simularia criação de índice {liga_id,time_id,temporada} unique`);
            }
        }
    }
}

async function migrar(db, collName) {
    // Migrar apenas documentos que ainda têm os campos camelCase
    const filtro = { ligaId: { $exists: true } };
    const qtd = await db.collection(collName).countDocuments(filtro);

    if (qtd === 0) {
        console.log(`  ✅ ${collName}: nenhum documento com ligaId — já migrado ou vazio`);
        return { matched: 0, modified: 0 };
    }

    console.log(`  → ${qtd} documentos a migrar em ${collName}`);

    if (isDryRun) {
        console.log(`  [DRY-RUN] Simularia updateMany com pipeline de rename+convert`);
        const amostra = await db.collection(collName).aggregate([
            { $match: filtro },
            { $limit: 2 },
            ...buildPipeline()
        ]).toArray();
        console.log('  [DRY-RUN] Resultado esperado (2 docs):');
        amostra.forEach(d => console.log('   ', JSON.stringify({ liga_id: d.liga_id, time_id: d.time_id, temporada: d.temporada })));
        return { matched: qtd, modified: 0 };
    }

    // Executar migração real
    const resultado = await db.collection(collName).updateMany(filtro, buildPipeline());
    return { matched: resultado.matchedCount, modified: resultado.modifiedCount };
}

async function main() {
    const modo = isDryRun ? 'DRY-RUN (sem alterações)' : 'FORCE (executando)';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`migrate-g2g3-schema.js — ${modo}`);
    console.log('='.repeat(60));

    await mongoose.connect(MONGO_URI);
    console.log('Conectado ao MongoDB\n');

    const db = mongoose.connection.db;

    for (const collName of COLLECTIONS) {
        console.log(`\n── ${collName} ──`);

        const antes = await inspecionar(db, collName);
        console.log(`  Antes: total=${antes.total} | com ligaId/timeId=${antes.comCamel} | com liga_id=${antes.comSnake}`);
        await amostrar(db, collName);

        // fluxofinanceirocampos: drop índice antigo antes de migrar
        if (collName === FLUXO_COLL) {
            await gerenciarIndiceFluxo(db, 'antes');
        }

        const resultado = await migrar(db, collName);

        if (!isDryRun) {
            const depois = await inspecionar(db, collName);
            console.log(`  Depois: total=${depois.total} | com ligaId/timeId=${depois.comCamel} | com liga_id=${depois.comSnake}`);
            console.log(`  matched=${resultado.matched} | modified=${resultado.modified}`);

            // Verificar integridade: nenhum doc deve ter time_id null após migração
            const comTimeIdNull = await db.collection(collName).countDocuments({ time_id: null });
            if (comTimeIdNull > 0) {
                console.warn(`  AVISO: ${comTimeIdNull} docs com time_id=null (timeId era inválido?). Verificar manualmente.`);
            }

            // fluxofinanceirocampos: recriar índice com novos campos
            if (collName === FLUXO_COLL) {
                await gerenciarIndiceFluxo(db, 'depois');
            }
        } else if (collName === FLUXO_COLL) {
            // Mesmo no dry-run, simular a fase de recriação de índice
            await gerenciarIndiceFluxo(db, 'depois');
        }
    }

    console.log('\n' + '='.repeat(60));
    if (isDryRun) {
        console.log('DRY-RUN concluído. Nenhuma alteração feita.');
        console.log('Para executar: node scripts/migrate-g2g3-schema.js --force');
    } else {
        console.log('Migracao concluida.');
        console.log('Proximos passos: reiniciar servidor para carregar schemas atualizados.');
    }
    console.log('='.repeat(60) + '\n');

    await mongoose.disconnect();
}

main().catch(e => {
    console.error('Erro fatal:', e.message);
    process.exit(1);
});
