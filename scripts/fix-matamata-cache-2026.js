/**
 * FIX: Limpar transações MATA_MATA espúrias do cache 2026
 *
 * Bug: Quando a API Cartola estava inacessível, o fallback rodada_atual:38
 * fez o sistema calcular mata-mata para todas as edições usando rankings
 * potencialmente de outra temporada, gerando cobranças indevidas no cache.
 *
 * Este script remove TODAS as transações tipo "MATA_MATA" do cache 2026,
 * recalcula o saldo_consolidado sem elas, e salva.
 *
 * Uso:
 *   node scripts/fix-matamata-cache-2026.js --dry-run   # Simular
 *   node scripts/fix-matamata-cache-2026.js --force      # Executar
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const TEMPORADA = 2026;

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

async function main() {
    console.log(`\n🔧 FIX: Limpar transações MATA_MATA espúrias da temporada ${TEMPORADA}`);
    console.log(`   Modo: ${isDryRun ? '🔍 DRY-RUN (simulação)' : '⚡ FORCE (execução real)'}\n`);

    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('extratofinanceirocaches');

    // Buscar todos os caches da temporada 2026 que tenham transações MATA_MATA
    const caches = await collection.find({
        temporada: TEMPORADA,
        'historico_transacoes.tipo': 'MATA_MATA'
    }).toArray();

    console.log(`📊 Encontrados ${caches.length} caches com transações MATA_MATA na temporada ${TEMPORADA}\n`);

    if (caches.length === 0) {
        console.log('✅ Nenhuma transação MATA_MATA espúria encontrada. Nada a fazer.');
        await mongoose.disconnect();
        return;
    }

    let totalTransacoesRemovidas = 0;
    let totalSaldoAjustado = 0;

    for (const cache of caches) {
        const mmTransacoes = cache.historico_transacoes.filter(t => t.tipo === 'MATA_MATA');
        const saldoMM = mmTransacoes.reduce((acc, t) => acc + (t.valor || 0), 0);
        const novoHistorico = cache.historico_transacoes.filter(t => t.tipo !== 'MATA_MATA');
        const novoSaldoConsolidado = (cache.saldo_consolidado || 0) - saldoMM;

        // Recalcular ganhos e perdas sem MATA_MATA
        const novosGanhos = novoHistorico
            .filter(t => (t.valor || 0) > 0)
            .reduce((acc, t) => acc + t.valor, 0);
        const novasPerdas = novoHistorico
            .filter(t => (t.valor || 0) < 0)
            .reduce((acc, t) => acc + t.valor, 0);

        console.log(`  Time ${cache.time_id} (liga: ${cache.liga_id}):`);
        console.log(`    - ${mmTransacoes.length} transações MATA_MATA (saldo: ${saldoMM >= 0 ? '+' : ''}${saldoMM})`);
        mmTransacoes.forEach(t => {
            console.log(`      → R${t.rodada} | ${t.descricao || t.tipo} | ${t.valor >= 0 ? '+' : ''}${t.valor}`);
        });
        console.log(`    - Saldo: ${cache.saldo_consolidado} → ${novoSaldoConsolidado}`);

        totalTransacoesRemovidas += mmTransacoes.length;
        totalSaldoAjustado += saldoMM;

        if (isForce) {
            await collection.updateOne(
                { _id: cache._id },
                {
                    $set: {
                        historico_transacoes: novoHistorico,
                        saldo_consolidado: novoSaldoConsolidado,
                        ganhos_consolidados: novosGanhos,
                        perdas_consolidadas: novasPerdas,
                        data_ultima_atualizacao: new Date(),
                    }
                }
            );
            console.log(`    ✅ Atualizado\n`);
        } else {
            console.log(`    🔍 (dry-run, nada alterado)\n`);
        }
    }

    console.log('─'.repeat(50));
    console.log(`📊 Resumo:`);
    console.log(`   Caches afetados: ${caches.length}`);
    console.log(`   Transações removidas: ${totalTransacoesRemovidas}`);
    console.log(`   Saldo total ajustado: ${totalSaldoAjustado >= 0 ? '+' : ''}${totalSaldoAjustado}`);

    if (isDryRun) {
        console.log(`\n💡 Para executar: node scripts/fix-matamata-cache-2026.js --force`);
    } else {
        console.log(`\n✅ Correção aplicada com sucesso!`);
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Erro:', err);
    mongoose.disconnect();
    process.exit(1);
});
