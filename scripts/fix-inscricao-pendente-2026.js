#!/usr/bin/env node
/**
 * FIX: Adicionar INSCRICAO_TEMPORADA faltante nos caches de extrato financeiro
 *
 * Contexto: criarTransacoesIniciais usava ObjectId para liga_id na query,
 * mas caches existentes armazenam liga_id como String → updateOne não encontrava
 * o doc → transação nunca era inserida no cache.
 *
 * Afetados (2026):
 *   Os Fuleros (6977a62071dee12036bb163e, R$100): 5 participantes
 *   Super Cartola (684cb1c8af923da7c7df51de, R$180): 1 participante
 *
 * Uso:
 *   node scripts/fix-inscricao-pendente-2026.js        # dry-run (padrão)
 *   node scripts/fix-inscricao-pendente-2026.js --force # aplica
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = !process.argv.includes('--force');

const PARTICIPANTES = [
    // Os Fuleros
    { timeId: 13935277, ligaId: '6977a62071dee12036bb163e', taxa: 100, nome: 'Paulinett Miranda' },
    { timeId: 9232824,  ligaId: '6977a62071dee12036bb163e', taxa: 100, nome: 'Pade Papito' },
    { timeId: 25330294, ligaId: '6977a62071dee12036bb163e', taxa: 100, nome: 'jhones Prado' },
    { timeId: 4223845,  ligaId: '6977a62071dee12036bb163e', taxa: 100, nome: 'bruno' },
    { timeId: 4021507,  ligaId: '6977a62071dee12036bb163e', taxa: 100, nome: 'Thyago Martins' },
    // Super Cartola
    { timeId: 476869,   ligaId: '684cb1c8af923da7c7df51de', taxa: 180, nome: 'Lucas Sousa' },
];

async function fixParticipante(db, p) {
    const { timeId, ligaId, taxa, nome } = p;

    // Busca o cache usando liga_id como String (forma como estão armazenados)
    const cache = await db.collection('extratofinanceirocaches').findOne({
        liga_id: ligaId,
        time_id: timeId,
        temporada: 2026,
    });

    if (!cache) {
        console.log(`  ⚠️  ${nome} (${timeId}): SEM CACHE — pulando`);
        return { status: 'no_cache' };
    }

    const jaTemInscricao = (cache.historico_transacoes || []).some(
        t => t.tipo === 'INSCRICAO_TEMPORADA'
    );

    if (jaTemInscricao) {
        console.log(`  ✅ ${nome} (${timeId}): já possui INSCRICAO_TEMPORADA — ok`);
        return { status: 'already_ok' };
    }

    const txCount = (cache.historico_transacoes || []).length;
    console.log(`  📋 ${nome} (${timeId}): cache tem ${txCount} tx, sem inscrição — valor=-${taxa}`);

    if (DRY_RUN) {
        console.log(`     [DRY-RUN] Adicionaria INSCRICAO_TEMPORADA (-R$${taxa})`);
        return { status: 'dry_run' };
    }

    const agora = new Date();
    await db.collection('extratofinanceirocaches').updateOne(
        { liga_id: ligaId, time_id: timeId, temporada: 2026 },
        {
            $push: {
                historico_transacoes: {
                    rodada: 0,
                    tipo: 'INSCRICAO_TEMPORADA',
                    valor: -taxa,
                    descricao: `Taxa de inscrição temporada 2026 (pendente)`,
                    data: agora,
                    posicao: null,
                    bonusOnus: 0,
                    pontosCorridos: 0,
                    mataMata: 0,
                    top10: 0,
                    saldo: 0,
                    saldoAcumulado: 0,
                    isMito: false,
                    isMico: false,
                    top10Status: null,
                    top10Posicao: null,
                },
            },
            $inc: {
                saldo_consolidado: -taxa,
                perdas_consolidadas: taxa,
            },
            $set: {
                data_ultima_atualizacao: agora,
            },
        }
    );

    console.log(`  ✅ ${nome} (${timeId}): INSCRICAO_TEMPORADA inserida (-R$${taxa})`);
    return { status: 'fixed' };
}

async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  FIX: INSCRICAO_TEMPORADA faltante nos caches 2026');
    console.log(`  Modo: ${DRY_RUN ? '🔍 DRY-RUN (simulação)' : '🔧 EXECUÇÃO REAL'}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    const resultados = [];

    for (const p of PARTICIPANTES) {
        const resultado = await fixParticipante(db, p);
        resultados.push({ ...p, ...resultado });
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  RESUMO');
    console.log('═══════════════════════════════════════════════════════════════');

    const counts = resultados.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
    }, {});

    if (DRY_RUN) {
        console.log(`  📊 Seriam corrigidos: ${counts.dry_run || 0}`);
        console.log(`  ✅ Já corretos: ${counts.already_ok || 0}`);
        console.log('  ⚠️  Execute com --force para aplicar');
    } else {
        console.log(`  ✅ Corrigidos: ${counts.fixed || 0}`);
        console.log(`  ⚡ Já estavam ok: ${counts.already_ok || 0}`);
        if (counts.no_cache) console.log(`  ⚠️  Sem cache: ${counts.no_cache}`);
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB');
}

main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
