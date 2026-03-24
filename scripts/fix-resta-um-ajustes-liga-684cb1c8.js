/**
 * fix-resta-um-ajustes-liga-684cb1c8.js
 *
 * Correção de AjusteFinanceiro incorretos no Resta Um da liga 684cb1c8af923da7c7df51de.
 *
 * Problema identificado:
 *   - R4: time_id 39786 cobrado (-2.27), mas o eliminado real foi 476869 ✅ (476869 já está correto)
 *         → Soft-delete da cobrança errada de 39786
 *   - R5: time_id 575856 cobrado (-2.27), mas o eliminado real foi 20165417
 *         → Soft-delete da cobrança errada de 575856
 *         → Criar nova cobrança para 20165417 (-2.27)
 *
 * Execução: node scripts/fix-resta-um-ajustes-liga-684cb1c8.js [--dry-run]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA = 2026;

// IDs das cobranças erradas (da auditoria MongoDB)
const ID_ERRADO_39786_R4  = '69a1b2ce682e3cdf67aafb6d'; // time 39786, R4, -2.27
const ID_ERRADO_575856_R5 = '69b39c080a77227777c2f1f5'; // time 575856, R5, -2.27

// Participante que nunca foi cobrado mas deveria (R5)
const TIME_CORRETO_R5 = 20165417;
const VALOR_TAXA = -2.27;

const isDryRun = process.argv.includes('--dry-run');

async function run() {
    console.log(`\n=== FIX Resta Um — Liga ${LIGA_ID} ===`);
    if (isDryRun) console.log('[DRY RUN] Nenhuma alteração será gravada.\n');

    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const ajustesCol = db.collection('ajustesfinanceiros');
    const cacheCol   = db.collection('extratofinanceirocaches');

    // =========================================================================
    // 1. Verificar documentos antes de alterar
    // =========================================================================
    const doc39786 = await ajustesCol.findOne({ _id: new mongoose.Types.ObjectId(ID_ERRADO_39786_R4) });
    const doc575856 = await ajustesCol.findOne({ _id: new mongoose.Types.ObjectId(ID_ERRADO_575856_R5) });

    console.log('--- Documentos a soft-deletar ---');
    console.log('39786 (R4):', doc39786 ? `encontrado | ativo=${doc39786.ativo} | ${doc39786.descricao}` : 'NÃO ENCONTRADO');
    console.log('575856 (R5):', doc575856 ? `encontrado | ativo=${doc575856.ativo} | ${doc575856.descricao}` : 'NÃO ENCONTRADO');

    if (!doc39786 || !doc575856) {
        console.error('\n[ERRO] Documento(s) não encontrados. Abortar.');
        process.exit(1);
    }

    if (!doc39786.ativo) console.log('  ⚠️  39786 já está inativo (soft-deleted) — será ignorado');
    if (!doc575856.ativo) console.log('  ⚠️  575856 já está inativo (soft-deleted) — será ignorado');

    // Verificar se já existe cobrança correta para 20165417 R5
    const jaExiste20165417 = await ajustesCol.findOne({
        liga_id: LIGA_ID,
        time_id: TIME_CORRETO_R5,
        temporada: TEMPORADA,
        descricao: 'Resta Um E1 - Eliminado R5',
        ativo: true
    });
    console.log(`\n20165417 já cobrado R5: ${jaExiste20165417 ? 'SIM — será ignorado' : 'NÃO — será criado'}`);

    // =========================================================================
    // 2. Soft-delete cobranças erradas
    // =========================================================================
    if (!isDryRun) {
        const agora = new Date();

        if (doc39786.ativo) {
            const r1 = await ajustesCol.updateOne(
                { _id: new mongoose.Types.ObjectId(ID_ERRADO_39786_R4) },
                { $set: { ativo: false, atualizado_por: 'AdminCorrection', atualizado_em: agora } }
            );
            console.log(`\n[OK] Soft-delete 39786 R4: modifiedCount=${r1.modifiedCount}`);
        }

        if (doc575856.ativo) {
            const r2 = await ajustesCol.updateOne(
                { _id: new mongoose.Types.ObjectId(ID_ERRADO_575856_R5) },
                { $set: { ativo: false, atualizado_por: 'AdminCorrection', atualizado_em: agora } }
            );
            console.log(`[OK] Soft-delete 575856 R5: modifiedCount=${r2.modifiedCount}`);
        }

        // =====================================================================
        // 3. Criar cobrança correta para 20165417 (R5)
        // =====================================================================
        if (!jaExiste20165417) {
            const novoAjuste = {
                liga_id: LIGA_ID,
                time_id: TIME_CORRETO_R5,
                temporada: TEMPORADA,
                descricao: 'Resta Um E1 - Eliminado R5',
                valor: VALOR_TAXA,
                ativo: true,
                criado_por: 'AdminCorrection',
                atualizado_por: '',
                chaveIdempotencia: `resta_um_E1_${LIGA_ID}_R5_${TIME_CORRETO_R5}`,
                metadata: { modulo: 'resta-um', edicao: 'E1', rodada: 5, correcao: true },
                criado_em: new Date(),
                atualizado_em: new Date(),
            };
            const r3 = await ajustesCol.insertOne(novoAjuste);
            console.log(`[OK] Criado AjusteFinanceiro 20165417 R5: _id=${r3.insertedId}`);
        }

        // =====================================================================
        // 4. Invalidar caches de extrato dos participantes afetados
        // =====================================================================
        const afetados = [39786, 575856, TIME_CORRETO_R5];
        for (const timeId of afetados) {
            const delResult = await cacheCol.deleteMany({
                liga_id: { $in: [LIGA_ID, new mongoose.Types.ObjectId(LIGA_ID)] },
                time_id: timeId
            });
            console.log(`[OK] Cache extrato invalidado time_id=${timeId}: deletedCount=${delResult.deletedCount}`);
        }

    } else {
        console.log('\n[DRY RUN] Operações que seriam executadas:');
        if (doc39786.ativo)  console.log('  - Soft-delete ajuste 39786 R4');
        if (doc575856.ativo) console.log('  - Soft-delete ajuste 575856 R5');
        if (!jaExiste20165417) console.log(`  - Criar ajuste ${TIME_CORRETO_R5} R5 (${VALOR_TAXA})`);
        console.log(`  - Invalidar caches: 39786, 575856, ${TIME_CORRETO_R5}`);
    }

    // =========================================================================
    // 5. Verificação final
    // =========================================================================
    console.log('\n--- Estado final dos ajustes Resta Um desta liga ---');
    const todos = await ajustesCol.find({
        liga_id: LIGA_ID,
        temporada: TEMPORADA,
        descricao: { $regex: /^Resta Um/ }
    }).sort({ time_id: 1, descricao: 1 }).toArray();

    for (const a of todos) {
        const status = a.ativo ? '✅ ativo' : '❌ inativo';
        console.log(`  time_id=${a.time_id} | ${a.descricao} | valor=${a.valor} | ${status}`);
    }

    await mongoose.disconnect();
    console.log('\nConcluído.');
}

run().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
