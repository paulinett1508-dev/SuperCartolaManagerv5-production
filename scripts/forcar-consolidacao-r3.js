#!/usr/bin/env node
/**
 * SCRIPT: Forçar Consolidação R3 2026
 * Liga: 684cb1c8af923da7c7df51de
 * Motivo: rodadasnapshot R3 está poluída com dados da temporada 2025 (R36)
 *         bloqueando consolidação 2026 via guard temNovoscampos
 *
 * Uso: node scripts/forcar-consolidacao-r3.js [--dry-run]
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const LIGA_ID = '684cb1c8af923da7c7df51de';
const RODADA = 3;
const IS_DRY_RUN = process.argv.includes('--dry-run');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI não definida. Verifique .env');
    process.exit(1);
}

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log(`  FORÇAR CONSOLIDAÇÃO R${RODADA} - Liga ${LIGA_ID}`);
console.log(`  Modo: ${IS_DRY_RUN ? '🔍 DRY-RUN (sem alterações)' : '⚡ EXECUÇÃO REAL'}`);
console.log('═══════════════════════════════════════════════════════');
console.log('');

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB conectado');

    // Importar o controller APÓS conectar (imports lazy)
    const { consolidarRodada } = await import('../controllers/consolidacaoController.js');

    // Verificar estado atual do snapshot
    const RodadaSnapshot = (await import('../models/RodadaSnapshot.js')).default;
    const snapshotAtual = await RodadaSnapshot.findOne({
        liga_id: LIGA_ID,
        rodada: RODADA,
        status: 'consolidada'
    }).lean();

    if (snapshotAtual) {
        console.log('📋 Snapshot atual encontrado:');
        console.log(`   - _id: ${snapshotAtual._id}`);
        console.log(`   - data_consolidacao: ${snapshotAtual.data_consolidacao}`);
        console.log(`   - versao_schema: ${snapshotAtual.versao_schema}`);
        const rrLen = snapshotAtual.dados_consolidados?.ranking_rodada?.length || 0;
        console.log(`   - ranking_rodada entries: ${rrLen}`);
        if (snapshotAtual.dados_consolidados?.ranking_rodada?.[0]) {
            const first = snapshotAtual.dados_consolidados.ranking_rodada[0];
            console.log(`   - 1º colocado: ${first.nome_time || first.nome_cartola} (${first.pontos_rodada} pts)`);
        }
        console.log('');
        console.log('⚠️  Este snapshot STALE (2025) será SUBSTITUÍDO pela consolidação 2026.');
    } else {
        console.log('ℹ️  Nenhum snapshot R3 existente — será criado do zero.');
    }
    console.log('');

    if (IS_DRY_RUN) {
        console.log('🔍 DRY-RUN: abortando antes de executar. Remova --dry-run para executar.');
        await mongoose.disconnect();
        return;
    }

    // Montar req/res mock
    const req = {
        params: { ligaId: LIGA_ID, rodada: String(RODADA) },
        query: { forcar: 'true' }
    };

    let resolveFn, rejectFn;
    const resultPromise = new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
    });

    const res = {
        _status: 200,
        status(code) {
            this._status = code;
            return this;
        },
        json(data) {
            if (this._status >= 400) {
                rejectFn(Object.assign(new Error(data.error || JSON.stringify(data)), { data, status: this._status }));
            } else {
                resolveFn({ status: this._status, data });
            }
        }
    };

    console.log(`🚀 Chamando consolidarRodada(R${RODADA}, forcar=true)...`);
    console.log('   (pode levar alguns segundos)');
    console.log('');

    // Disparar consolidação
    consolidarRodada(req, res).catch(err => rejectFn(err));

    const timeout = setTimeout(() => {
        rejectFn(new Error('Timeout: consolidação não respondeu em 120s'));
    }, 120_000);

    const result = await resultPromise.finally(() => clearTimeout(timeout));

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    if (result.data.success) {
        console.log('  ✅ CONSOLIDAÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('');
        const d = result.data;
        console.log(`  Rodada: R${d.rodada}`);
        console.log(`  Participantes: ${d.participantes}`);
        if (d.ranking_rodada_count !== undefined) {
            console.log(`  ranking_rodada entries: ${d.ranking_rodada_count}`);
        }
        if (d.top10) {
            console.log(`  Top10 — Mitos: ${d.top10.mitos}, Micos: ${d.top10.micos}`);
        }
        if (d.snapshot_id) {
            console.log(`  Snapshot ID: ${d.snapshot_id}`);
        }
        console.log('');
        console.log('  📌 PRÓXIMOS PASSOS:');
        console.log('     1. Cada participante precisa abrir o extrato para refresh do cache');
        console.log('     2. OU use o endpoint /api/admin/extrato/recalcular-todos para forçar');
        console.log('     3. O snapshot R3 agora reflete dados 2026 corretos');
    } else {
        console.log('  ⚠️  Resposta inesperada:');
        console.log(JSON.stringify(result.data, null, 2));
    }
    console.log('═══════════════════════════════════════════════════════');

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('');
    console.error('❌ ERRO NA CONSOLIDAÇÃO:');
    console.error('   ', err.message);
    if (err.data) {
        console.error('   Resposta:', JSON.stringify(err.data, null, 2));
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
