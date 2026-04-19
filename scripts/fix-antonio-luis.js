/**
 * Fix Antonio Luis — Liga 684cb1c8af923da7c7df51de
 *
 * Problema: acertofinanceiro (tipo=pagamento, valor=120) foi criado antes
 * do fix do modal. Contribui +120 ao saldoAcertos em vez de -120.
 *
 * Ações:
 * 1. Desativar acertofinanceiro com tipo=pagamento, valor=120
 * 2. Criar ajustefinanceiro com valor=-120
 *
 * Uso: node scripts/fix-antonio-luis.js [--dry-run]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID = '684cb1c8af923da7c7df51de';
const TIME_ID = 645089;
const TEMPORADA = 2026;
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    console.log(`MongoDB conectado [${DRY_RUN ? 'DRY-RUN' : 'LIVE'}]\n`);

    // Localizar o acertofinanceiro problemático
    const acerto = await db.collection('acertofinanceiros').findOne({
        liga_id: LIGA_ID,
        time_id: TIME_ID,
        temporada: TEMPORADA,
        tipo: 'pagamento',
        valor: 120,
        ativo: true
    });

    if (!acerto) {
        console.log('Acerto não encontrado — listando todos acertos do participante:');
        const todos = await db.collection('acertofinanceiros').find({
            liga_id: LIGA_ID,
            time_id: TIME_ID
        }).toArray();
        console.log(JSON.stringify(todos, null, 2));
        await mongoose.disconnect();
        return;
    }

    console.log('Acerto encontrado:', JSON.stringify(acerto, null, 2));

    if (DRY_RUN) {
        console.log('\n[DRY-RUN] Ação 1: desativar acertofinanceiro', acerto._id.toString());
        console.log('[DRY-RUN] Ação 2: criar ajustefinanceiro { valor: -120, descricao: "Restante Inscrição 2026" }');
    } else {
        const upd = await db.collection('acertofinanceiros').updateOne(
            { _id: acerto._id },
            {
                $set: {
                    ativo: false,
                    observacoes: 'Desativado — lançado como pagamento por engano antes de fix 2026-04-16. Substituído por ajustefinanceiro -120.'
                }
            }
        );
        console.log('Acerto desativado:', upd.modifiedCount, 'doc(s)');

        const ins = await db.collection('ajustesfinanceiros').insertOne({
            liga_id: LIGA_ID,
            time_id: TIME_ID,
            temporada: TEMPORADA,
            descricao: 'Restante Inscrição 2026',
            valor: -120,
            criado_por: 'admin-fix-2026-04-16',
            atualizado_por: '',
            ativo: true,
            criado_em: new Date(),
            atualizado_em: new Date()
        });
        console.log('Ajuste criado:', ins.insertedId);
    }

    // Estado final
    console.log('\n--- ESTADO FINAL ---');
    const acertosAtivos = await db.collection('acertofinanceiros').find({
        liga_id: LIGA_ID, time_id: TIME_ID, temporada: TEMPORADA, ativo: true
    }).toArray();
    const ajustesAtivos = await db.collection('ajustesfinanceiros').find({
        liga_id: LIGA_ID, time_id: TIME_ID, temporada: TEMPORADA, ativo: true
    }).toArray();

    const saldoAcertos = acertosAtivos.reduce((s, a) => s + (a.tipo === 'pagamento' ? a.valor : -a.valor), 0);
    const saldoAjustes = ajustesAtivos.reduce((s, a) => s + a.valor, 0);

    console.log('Acertos ativos:');
    acertosAtivos.forEach(a => console.log(`  ${a.tipo} R$${a.valor} | ${a.descricao}`));
    console.log('Ajustes ativos:');
    ajustesAtivos.forEach(a => console.log(`  R$${a.valor} | ${a.descricao}`));
    console.log(`\nsaldoAcertos: R$${saldoAcertos}`);
    console.log(`saldoAjustes: R$${saldoAjustes}`);
    console.log(`saldoRodadas (estimado): R$16`);
    console.log(`saldoFinal calculado: R$${16 + saldoAcertos + saldoAjustes}  (esperado: -44)`);

    await mongoose.disconnect();
}

run().catch(e => { console.error('ERRO:', e); process.exit(1); });
