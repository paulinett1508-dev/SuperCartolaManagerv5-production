/**
 * Script: reset-financeiro-2026.js
 * Objetivo: Bloquear carry-forward automático de saldos 2025→2026.
 *
 * O fluxoFinanceiroController.js insere SALDO_TEMPORADA_ANTERIOR no extrato 2026
 * quando InscricaoTemporada.saldo_transferido !== 0. Este script zera esse campo,
 * impedindo a injeção automática. O admin inserirá manualmente os valores via
 * AjusteFinanceiro, participante a participante.
 *
 * O que este script faz (com --force):
 *   1. InscricaoTemporada (temporada:2026): zera saldo_transferido e divida_anterior
 *   2. ExtratoFinanceiroCache (temporada:2026): DELETA todos para forçar recalculation
 *      limpa, sem SALDO_TEMPORADA_ANTERIOR nas próximas requisições
 *
 * Uso:
 *   node scripts/reset-financeiro-2026.js --dry-run    # Simula (read-only)
 *   node scripts/reset-financeiro-2026.js --force      # Executa
 *
 * READ-ONLY em dry-run. --force é DESTRUTIVO para os caches 2026.
 * Dados 2025 NÃO são tocados.
 *
 * @version 1.0.0
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const isDryRun = process.argv.includes('--dry-run');
const isForced = process.argv.includes('--force');

if (!isDryRun && !isForced) {
    console.error('❌ Uso: node scripts/reset-financeiro-2026.js [--dry-run|--force]');
    console.error('');
    console.error('   --dry-run   Simula a operação sem modificar dados (SEGURO)');
    console.error('   --force     Executa a operação real (DESTRUTIVO para caches 2026)');
    console.error('');
    console.error('   Recomendação: rode --dry-run primeiro para revisar o impacto.');
    process.exit(1);
}

const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA_2026 = 2026;

function fmt(v) {
    if (v == null) return 'null';
    return `R$ ${Number(v).toFixed(2)}`;
}

async function main() {
    console.log('💰 Reset Financeiro 2026 — Liga Super Cartola');
    console.log('='.repeat(60));
    console.log(`Modo: ${isDryRun ? '🔍 DRY-RUN (simulação — nenhum dado alterado)' : '⚡ FORCE (execução real)'}`);
    console.log('');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado ao MongoDB\n');

        const db = mongoose.connection.db;
        const ligaObjId = new mongoose.Types.ObjectId(LIGA_ID);

        // Carrega liga para exibir nome
        const liga = await db.collection('ligas').findOne({ _id: ligaObjId });
        if (!liga) throw new Error('Liga não encontrada: ' + LIGA_ID);

        const participantesMap = new Map();
        for (const p of (liga.participantes || [])) {
            participantesMap.set(String(p.time_id), p.nome_cartola || p.nome_cartoleiro || `ID:${p.time_id}`);
        }

        console.log(`📋 Liga: ${liga.nome || 'Super Cartola'}`);
        console.log(`🗓  Temporada alvo: ${TEMPORADA_2026}`);
        console.log('');

        // ─────────────────────────────────────────────────────────────────────
        // ETAPA 1: InscricaoTemporada — listar saldo_transferido e divida_anterior
        // ─────────────────────────────────────────────────────────────────────
        const inscricoesObjId = await db.collection('inscricoestemporada')
            .find({ liga_id: ligaObjId, temporada: TEMPORADA_2026 }).toArray();
        const inscricoesStr = await db.collection('inscricoestemporada')
            .find({ liga_id: LIGA_ID, temporada: TEMPORADA_2026 }).toArray();

        // Dedup por time_id
        const inscricoesMap = new Map();
        for (const i of [...inscricoesObjId, ...inscricoesStr]) {
            const tid = String(i.time_id);
            if (!inscricoesMap.has(tid)) inscricoesMap.set(tid, i);
        }

        const inscricoes = [...inscricoesMap.values()];
        const comSaldo = inscricoes.filter(i => (i.saldo_transferido || 0) !== 0 || (i.divida_anterior || 0) !== 0);

        console.log(`📊 InscricaoTemporada 2026 encontradas: ${inscricoes.length}`);
        console.log(`   → Com saldo_transferido ou divida_anterior ≠ 0: ${comSaldo.length}`);
        console.log('');

        if (comSaldo.length === 0) {
            console.log('✅ Nenhum saldo_transferido ou divida_anterior para zerar. Nada a fazer na Etapa 1.');
        } else {
            console.log('📋 ETAPA 1 — InscricaoTemporada a ser zerada:');
            console.log('─'.repeat(70));
            console.log(`${'Nome'.padEnd(30)} ${'saldo_transferido'.padStart(18)} ${'divida_anterior'.padStart(16)}`);
            console.log('─'.repeat(70));
            for (const i of comSaldo) {
                const nome = participantesMap.get(String(i.time_id)) || `ID:${i.time_id}`;
                const saldo = fmt(i.saldo_transferido);
                const divida = fmt(i.divida_anterior);
                console.log(`${nome.padEnd(30)} ${saldo.padStart(18)} ${divida.padStart(16)}`);
            }
            console.log('─'.repeat(70));
            console.log('');
        }

        // ─────────────────────────────────────────────────────────────────────
        // ETAPA 2: ExtratoFinanceiroCache 2026 — listar caches a deletar
        // ─────────────────────────────────────────────────────────────────────
        const cachesStr = await db.collection('extratofinanceirocaches')
            .find({ liga_id: LIGA_ID, temporada: TEMPORADA_2026 }, { projection: { time_id: 1, saldo_consolidado: 1, ultima_rodada_consolidada: 1 } })
            .toArray();
        const cachesObjId = await db.collection('extratofinanceirocaches')
            .find({ liga_id: ligaObjId, temporada: TEMPORADA_2026 }, { projection: { time_id: 1, saldo_consolidado: 1, ultima_rodada_consolidada: 1 } })
            .toArray();

        const cachesSet = new Map();
        for (const c of [...cachesStr, ...cachesObjId]) {
            cachesSet.set(String(c._id), c);
        }
        const caches = [...cachesSet.values()];

        console.log(`🗄  ExtratoFinanceiroCache 2026 encontrados: ${caches.length}`);
        console.log('');

        if (caches.length > 0) {
            console.log('📋 ETAPA 2 — Caches 2026 que serão DELETADOS (recalculação limpa):');
            console.log('─'.repeat(65));
            console.log(`${'Nome'.padEnd(30)} ${'Saldo'.padStart(12)} ${'Ult.Rodada'.padStart(12)}`);
            console.log('─'.repeat(65));
            for (const c of caches) {
                const nome = participantesMap.get(String(c.time_id)) || `ID:${c.time_id}`;
                const saldo = fmt(c.saldo_consolidado);
                const rodada = c.ultima_rodada_consolidada != null ? `R${c.ultima_rodada_consolidada}` : '-';
                console.log(`${nome.padEnd(30)} ${saldo.padStart(12)} ${rodada.padStart(12)}`);
            }
            console.log('─'.repeat(65));
            console.log('');
        }

        // ─────────────────────────────────────────────────────────────────────
        // RESUMO PRÉ-EXECUÇÃO
        // ─────────────────────────────────────────────────────────────────────
        console.log('📌 RESUMO DO QUE SERÁ FEITO:');
        console.log(`   • InscricaoTemporada 2026: ${comSaldo.length} registros → saldo_transferido=0, divida_anterior=0`);
        console.log(`   • ExtratoFinanceiroCache 2026: ${caches.length} registros → DELETADOS`);
        console.log('');
        console.log('   ℹ  O sistema recalculará automaticamente os caches 2026 na próxima');
        console.log('      requisição, desta vez SEM SALDO_TEMPORADA_ANTERIOR.');
        console.log('   ℹ  O admin deve usar AjusteFinanceiro para inserir saldos 2025');
        console.log('      manualmente, participante a participante.');
        console.log('');

        if (isDryRun) {
            console.log('🔍 DRY-RUN concluído — nenhum dado foi alterado.');
            console.log('   Execute com --force para aplicar as alterações.');
            return;
        }

        // ─────────────────────────────────────────────────────────────────────
        // EXECUÇÃO --force
        // ─────────────────────────────────────────────────────────────────────
        console.log('⚡ Executando operações...');
        console.log('');

        // Etapa 1: Zerar saldo_transferido e divida_anterior
        let inscAtual = 0;
        for (const i of inscricoes) {
            const filtro = { _id: i._id };
            const update = { $set: { saldo_transferido: 0, divida_anterior: 0 } };
            await db.collection('inscricoestemporada').updateOne(filtro, update);
            const nome = participantesMap.get(String(i.time_id)) || `ID:${i.time_id}`;
            const hadSaldo = (i.saldo_transferido || 0) !== 0 || (i.divida_anterior || 0) !== 0;
            console.log(`   ${hadSaldo ? '✅' : '  '} InscricaoTemporada: ${nome} — saldo_transferido: ${fmt(i.saldo_transferido)} → R$ 0.00  |  divida_anterior: ${fmt(i.divida_anterior)} → R$ 0.00`);
            inscAtual++;
        }
        console.log(`\n   → ${inscAtual} InscricaoTemporada atualizadas.\n`);

        // Etapa 2: Deletar caches 2026
        const delResultStr = await db.collection('extratofinanceirocaches')
            .deleteMany({ liga_id: LIGA_ID, temporada: TEMPORADA_2026 });
        const delResultObjId = await db.collection('extratofinanceirocaches')
            .deleteMany({ liga_id: ligaObjId, temporada: TEMPORADA_2026 });

        const totalDeletados = delResultStr.deletedCount + delResultObjId.deletedCount;
        console.log(`   🗑  ExtratoFinanceiroCache 2026 deletados: ${totalDeletados}`);
        console.log('');

        console.log('✅ Reset financeiro 2026 concluído com sucesso!');
        console.log('');
        console.log('   Próximos passos:');
        console.log('   1. Gere o relatório de auditoria 2025:');
        console.log('      node scripts/auditoria-financeira-2025-radical.js');
        console.log('   2. Use o HTML gerado para saber o saldo real de cada participante em 2025.');
        console.log('   3. No painel admin → Ficha Financeira → AjusteFinanceiro:');
        console.log('      Insira o saldo 2025 de cada participante individualmente.');

    } catch (err) {
        console.error('\n❌ Erro fatal:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

main();
