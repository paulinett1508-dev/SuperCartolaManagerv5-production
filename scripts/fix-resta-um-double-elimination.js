/**
 * fix-resta-um-double-elimination.js
 *
 * Corrige dados corrompidos da Edição 1 do Resta Um (liga 684cb1c8af923da7c7df51de).
 *
 * Problema: onRoundFinalize disparou 2x na R4:
 *   - Run 1 (15:05:49): Cassius United FC eliminado (0 pts — parciais vazias)
 *   - Run 2 (15:06:59): Engenhando eliminado (18.94 pts — dados reais)
 *   eliminadosPorRodada = 1, portanto só Cassius deveria ser eliminado.
 *
 * Correções:
 *   1. Engenhando → status: 'vivo', rodadaEliminacao: null
 *   2. historicoEliminacoes: remover entrada de Engenhando (timeId: 476869)
 *   3. Todos participantes: rodadasSobrevividas → 1
 *
 * Uso:
 *   node scripts/fix-resta-um-double-elimination.js --dry-run
 *   node scripts/fix-resta-um-double-elimination.js --force
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

const LIGA_ID     = '684cb1c8af923da7c7df51de';
const EDICAO_NUM  = 1;
const TEMPORADA   = 2026;
const TIME_ENGENHANDO = 476869;

// ── Inline schema mínimo para não depender de import chain ──────────────────
const restaumSchema = new mongoose.Schema({}, { strict: false });
const RestaUmCache = mongoose.model('RestaUmCache', restaumSchema, 'restaumcaches');

async function main() {
    console.log(`\n[FIX] Modo: ${isDryRun ? 'DRY-RUN (nada será alterado)' : 'FORCE (aplicando mudanças)'}`);
    console.log(`[FIX] Liga: ${LIGA_ID} | Edição: ${EDICAO_NUM} | Temporada: ${TEMPORADA}\n`);

    await mongoose.connect(process.env.MONGO_URI);
    console.log('[FIX] Conectado ao MongoDB\n');

    const edicao = await RestaUmCache.findOne({
        liga_id: LIGA_ID,
        edicao: EDICAO_NUM,
        temporada: TEMPORADA,
    });

    if (!edicao) {
        console.error('❌ Edição não encontrada');
        process.exit(1);
    }

    console.log(`[FIX] Edição encontrada: "${edicao.nome}" | status: ${edicao.status} | rodadaAtual: ${edicao.rodadaAtual}`);
    console.log(`[FIX] Participantes: ${edicao.participantes.length}`);
    console.log(`[FIX] Vivos: ${edicao.participantes.filter(p => p.status === 'vivo').length}`);
    console.log(`[FIX] Eliminados: ${edicao.participantes.filter(p => p.status === 'eliminado').length}`);
    console.log(`[FIX] historicoEliminacoes: ${edicao.historicoEliminacoes.length} entradas\n`);

    // ── 1. Verificar Engenhando ──────────────────────────────────────────────
    const engenhando = edicao.participantes.find(p => p.timeId === TIME_ENGENHANDO);
    if (!engenhando) {
        console.error(`❌ Participante Engenhando (timeId ${TIME_ENGENHANDO}) não encontrado`);
        process.exit(1);
    }

    console.log(`[FIX] Engenhando atual:`);
    console.log(`        status: ${engenhando.status}`);
    console.log(`        rodadaEliminacao: ${engenhando.rodadaEliminacao}`);
    console.log(`        rodadasSobrevividas: ${engenhando.rodadasSobrevividas}`);
    console.log(`        pontosAcumulados: ${engenhando.pontosAcumulados}`);

    if (engenhando.status !== 'eliminado') {
        console.log('[FIX] ⚠️  Engenhando já está vivo — nada a corrigir no status');
    }

    // ── 2. Verificar historicoEliminacoes ────────────────────────────────────
    const histEngenhando = edicao.historicoEliminacoes.filter(h => String(h.timeId) === String(TIME_ENGENHANDO));
    console.log(`\n[FIX] Entradas de Engenhando no historicoEliminacoes: ${histEngenhando.length}`);
    histEngenhando.forEach(h => console.log(`        rodada ${h.rodada} | pts ${h.pontosRodada} | data ${h.dataEliminacao}`));

    // ── 3. Verificar rodadasSobrevividas ─────────────────────────────────────
    const comSobrevividas2 = edicao.participantes.filter(p => p.rodadasSobrevividas === 2);
    const comSobrevividas1 = edicao.participantes.filter(p => p.rodadasSobrevividas === 1);
    console.log(`\n[FIX] rodadasSobrevividas == 2: ${comSobrevividas2.length} participantes`);
    console.log(`[FIX] rodadasSobrevividas == 1: ${comSobrevividas1.length} participantes`);

    // ── Resumo do que será feito ─────────────────────────────────────────────
    console.log(`\n[FIX] ── Mudanças a aplicar ─────────────────────────────────────────`);
    console.log(`  1. Engenhando: status 'eliminado' → 'vivo', rodadaEliminacao ${engenhando.rodadaEliminacao} → null`);
    console.log(`  2. historicoEliminacoes: remover ${histEngenhando.length} entrada(s) de Engenhando`);
    console.log(`  3. ${comSobrevividas2.length} participantes: rodadasSobrevividas 2 → 1`);
    console.log(`─────────────────────────────────────────────────────────────────────`);

    if (isDryRun) {
        console.log('\n[DRY-RUN] Nenhuma alteração realizada. Use --force para aplicar.\n');
        await mongoose.disconnect();
        return;
    }

    // ── APLICAR CORREÇÕES ────────────────────────────────────────────────────
    // 1. Restaurar Engenhando
    engenhando.status = 'vivo';
    engenhando.rodadaEliminacao = null;

    // 2. Remover Engenhando do historicoEliminacoes
    edicao.historicoEliminacoes = edicao.historicoEliminacoes.filter(
        h => String(h.timeId) !== String(TIME_ENGENHANDO)
    );

    // 3. Resetar rodadasSobrevividas para 1 em todos
    for (const p of edicao.participantes) {
        if (p.rodadasSobrevividas === 2) {
            p.rodadasSobrevividas = 1;
        }
    }

    edicao.ultima_atualizacao = new Date();
    edicao.markModified('participantes');
    edicao.markModified('historicoEliminacoes');
    await edicao.save();

    console.log('\n[FIX] ✅ Correções aplicadas com sucesso!');
    console.log(`[FIX] Vivos agora: ${edicao.participantes.filter(p => p.status === 'vivo').length}`);
    console.log(`[FIX] Eliminados agora: ${edicao.participantes.filter(p => p.status === 'eliminado').length}`);
    console.log(`[FIX] historicoEliminacoes agora: ${edicao.historicoEliminacoes.length} entradas\n`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('[FIX] Erro fatal:', err);
    process.exit(1);
});
