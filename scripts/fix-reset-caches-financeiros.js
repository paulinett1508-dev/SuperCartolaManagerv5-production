/**
 * FIX: Resetar caches financeiros de TODAS as ligas para recálculo
 *
 * PROBLEMA:
 *   Rodadas onde o participante ficou em zona neutra ou não participou
 *   eram puladas permanentemente no cache (ultima_rodada_consolidada avançava
 *   mas nenhuma transação era criada para a rodada).
 *
 * SOLUÇÃO:
 *   Resetar ultima_rodada_consolidada para 0 e limpar historico_transacoes,
 *   PRESERVANDO entradas R0 (INSCRICAO_TEMPORADA, SALDO_TEMPORADA_ANTERIOR, LEGADO_ANTERIOR).
 *   Na próxima visualização, o sistema recalcula com a lógica corrigida (v8.19.0).
 *
 * USO:
 *   node scripts/fix-reset-caches-financeiros.js --dry-run    # Simular
 *   node scripts/fix-reset-caches-financeiros.js --force      # Executar
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const TEMPORADA = 2026;

async function fixResetCachesFinanceiros() {
    const isDryRun = process.argv.includes('--dry-run');
    const isForce = process.argv.includes('--force');

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🔧 FIX: Resetar caches financeiros para recálculo (v8.19.0)');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Temporada: ${TEMPORADA}`);
    console.log(`Modo: ${isDryRun ? '🔍 DRY-RUN' : isForce ? '⚡ FORCE (executando!)' : '⚠️  Sem flag'}`);
    console.log('');

    if (!isDryRun && !isForce) {
        console.log('⚠️  Use --dry-run para simular ou --force para executar');
        process.exit(0);
    }

    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Buscar todos os caches da temporada
        const caches = await db.collection('extratofinanceirocaches').find({
            temporada: TEMPORADA
        }).toArray();

        console.log(`📊 Total caches encontrados: ${caches.length}`);

        // Agrupar por liga para relatório
        const porLiga = {};
        caches.forEach(c => {
            const ligaId = String(c.liga_id);
            if (!porLiga[ligaId]) porLiga[ligaId] = [];
            porLiga[ligaId].push(c);
        });

        console.log(`📊 Ligas afetadas: ${Object.keys(porLiga).length}\n`);

        let totalResetados = 0;
        let totalR0Preservadas = 0;

        for (const [ligaId, ligaCaches] of Object.entries(porLiga)) {
            console.log(`--- Liga: ${ligaId} (${ligaCaches.length} participantes) ---`);

            for (const cache of ligaCaches) {
                const transacoes = cache.historico_transacoes || [];

                // Preservar entradas R0 (inscrição, saldo anterior, legado)
                const r0Entries = transacoes.filter(t =>
                    t.rodada === 0 ||
                    t.tipo === 'INSCRICAO_TEMPORADA' ||
                    t.tipo === 'SALDO_TEMPORADA_ANTERIOR' ||
                    t.tipo === 'LEGADO_ANTERIOR' ||
                    t.tipo === 'TRANSFERENCIA_SALDO'
                );

                const saldoR0 = r0Entries.reduce((acc, t) => acc + (parseFloat(t.valor) || 0), 0);
                const rodadasAntes = cache.ultima_rodada_consolidada || 0;
                const transacoesAntes = transacoes.length;

                if (isDryRun) {
                    console.log(`  Time ${cache.time_id}: R0=${r0Entries.length} preservadas, ${transacoesAntes - r0Entries.length} transações removidas, ultima_rodada: ${rodadasAntes} → 0`);
                }

                if (isForce) {
                    await db.collection('extratofinanceirocaches').updateOne(
                        { _id: cache._id },
                        {
                            $set: {
                                ultima_rodada_consolidada: 0,
                                saldo_consolidado: saldoR0,
                                historico_transacoes: r0Entries,
                                updatedAt: new Date(),
                            }
                        }
                    );
                    console.log(`  ✅ Time ${cache.time_id}: resetado (R0=${r0Entries.length}, saldo_r0=${saldoR0.toFixed(2)})`);
                }

                totalResetados++;
                totalR0Preservadas += r0Entries.length;
            }
        }

        console.log('\n═══════════════════════════════════════════════════════════════════');
        console.log(`📊 RESUMO:`);
        console.log(`   Caches ${isDryRun ? 'a resetar' : 'resetados'}: ${totalResetados}`);
        console.log(`   Transações R0 preservadas: ${totalR0Preservadas}`);
        console.log(`   Próximo passo: Cada extrato será recalculado na próxima visualização`);
        console.log('═══════════════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

fixResetCachesFinanceiros();
