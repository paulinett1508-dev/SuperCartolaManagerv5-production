/**
 * fix-resta-um-wrong-eliminated.js
 *
 * Corrige dados corrompidos da Edição 1 do Resta Um (liga 684cb1c8af923da7c7df51de).
 *
 * Problema: Run 1 do orchestrator usou pontuações zeradas (Rodada collection vazia).
 * Com todos em 0 pts, Cassius United FC foi eliminado por desempate (pior no ranking geral).
 * Na verdade, o MICO real da R4 é Engenhando (18,95 pts). Cassius teve 62,13 pts.
 *
 * Estado atual (após fix-resta-um-double-elimination.js):
 *   - Cassius United FC (timeId: 39786): ELIMINADO (ERRADO — 62,13 pts reais)
 *   - Engenhando (timeId: 476869): VIVO (ERRADO — 18,95 pts, deveria ser eliminado)
 *   - Quase Nada Palace (timeId: 1097804): vezesNaZona=1 (ERRADO — run1 inválido)
 *   - Feirão do Insta (timeId: 575856): vezesNaZona=1 (CORRETO — era next-in-danger no run2 real)
 *
 * Correções:
 *   1. Cassius: status → 'vivo', rodadaEliminacao → null, pontosAcumulados → 62.1298828125
 *   2. Engenhando: status → 'eliminado', rodadaEliminacao → 4, rodadasSobrevividas = 1
 *   3. historicoEliminacoes: remover Cassius, adicionar Engenhando
 *   4. vezesNaZona: Quase Nada Palace 1→0, Feirão do Insta mantém 1
 *
 * Uso:
 *   node scripts/fix-resta-um-wrong-eliminated.js --dry-run
 *   node scripts/fix-resta-um-wrong-eliminated.js --force
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

const LIGA_ID          = '684cb1c8af923da7c7df51de';
const EDICAO_NUM       = 1;
const TEMPORADA        = 2026;
const RODADA           = 4;

// Participantes afetados
const TIME_CASSIUS     = 39786;
const TIME_ENGENHANDO  = 476869;
const TIME_QUASE_NADA  = 1097804;
const TIME_FEIRAO      = 575856;

// Pontuação real de R4 (da collection rodadas)
const CASSIUS_PTS_R4       = 62.1298828125;
const ENGENHANDO_PTS_R4    = 18.949951171875;

const restaumSchema = new mongoose.Schema({}, { strict: false });
const RestaUmCache = mongoose.model('RestaUmCache', restaumSchema, 'restaumcaches');

function show(label, p) {
    console.log(`  ${label}:`);
    console.log(`    status: ${p.status}`);
    console.log(`    rodadaEliminacao: ${p.rodadaEliminacao}`);
    console.log(`    pontosAcumulados: ${p.pontosAcumulados}`);
    console.log(`    rodadasSobrevividas: ${p.rodadasSobrevividas}`);
    console.log(`    vezesNaZona: ${p.vezesNaZona}`);
}

async function main() {
    console.log(`\n[FIX-v2] Modo: ${isDryRun ? 'DRY-RUN' : 'FORCE'}`);
    console.log(`[FIX-v2] Liga: ${LIGA_ID} | Edição: ${EDICAO_NUM} | Temporada: ${TEMPORADA}\n`);

    await mongoose.connect(process.env.MONGO_URI);
    console.log('[FIX-v2] Conectado ao MongoDB\n');

    const edicao = await RestaUmCache.findOne({
        liga_id: LIGA_ID,
        edicao: EDICAO_NUM,
        temporada: TEMPORADA,
    });

    if (!edicao) {
        console.error('❌ Edição não encontrada');
        process.exit(1);
    }

    const cassius    = edicao.participantes.find(p => p.timeId === TIME_CASSIUS);
    const engenhando = edicao.participantes.find(p => p.timeId === TIME_ENGENHANDO);
    const quaseNada  = edicao.participantes.find(p => p.timeId === TIME_QUASE_NADA);
    const feirao     = edicao.participantes.find(p => p.timeId === TIME_FEIRAO);

    if (!cassius || !engenhando) {
        console.error('❌ Participantes não encontrados');
        process.exit(1);
    }

    console.log('[FIX-v2] Estado atual:');
    show('Cassius United FC', cassius);
    show('Engenhando', engenhando);
    console.log(`  Quase Nada Palace — vezesNaZona: ${quaseNada?.vezesNaZona}`);
    console.log(`  Feirão do Insta   — vezesNaZona: ${feirao?.vezesNaZona}`);

    const histCassius    = edicao.historicoEliminacoes.filter(h => String(h.timeId) === String(TIME_CASSIUS));
    const histEngenhando = edicao.historicoEliminacoes.filter(h => String(h.timeId) === String(TIME_ENGENHANDO));
    console.log(`\n[FIX-v2] historicoEliminacoes — Cassius: ${histCassius.length} entrada(s), Engenhando: ${histEngenhando.length} entrada(s)`);

    console.log(`\n[FIX-v2] ── Mudanças a aplicar ─────────────────────────────────────────`);
    console.log(`  1. Cassius: 'eliminado' → 'vivo', rodadaEliminacao→null, pontosAcumulados→${CASSIUS_PTS_R4}`);
    console.log(`  2. Engenhando: 'vivo' → 'eliminado', rodadaEliminacao→${RODADA}`);
    console.log(`  3. historicoEliminacoes: remover Cassius, adicionar Engenhando (pts=${ENGENHANDO_PTS_R4})`);
    console.log(`  4. Quase Nada Palace: vezesNaZona ${quaseNada?.vezesNaZona} → 0`);
    console.log(`  5. Feirão do Insta: vezesNaZona ${feirao?.vezesNaZona} → 1 (mantém)`);
    console.log(`─────────────────────────────────────────────────────────────────────`);

    if (isDryRun) {
        console.log('\n[DRY-RUN] Nenhuma alteração realizada. Use --force para aplicar.\n');
        await mongoose.disconnect();
        return;
    }

    // ── 1. Restaurar Cassius ────────────────────────────────────────────────
    cassius.status           = 'vivo';
    cassius.rodadaEliminacao = null;
    cassius.pontosAcumulados = CASSIUS_PTS_R4;
    cassius.rodadasSobrevividas = 1;
    cassius.pontosRodada     = CASSIUS_PTS_R4;

    // ── 2. Eliminar Engenhando ──────────────────────────────────────────────
    engenhando.status           = 'eliminado';
    engenhando.rodadaEliminacao = RODADA;
    engenhando.rodadasSobrevividas = 1;

    // ── 3. Corrigir historicoEliminacoes ────────────────────────────────────
    // Remover Cassius, garantir que Engenhando está (apenas 1 entrada)
    edicao.historicoEliminacoes = edicao.historicoEliminacoes.filter(
        h => String(h.timeId) !== String(TIME_CASSIUS) && String(h.timeId) !== String(TIME_ENGENHANDO)
    );
    edicao.historicoEliminacoes.push({
        rodada: RODADA,
        timeId: TIME_ENGENHANDO,
        nomeTime: engenhando.nomeTime,
        pontosRodada: ENGENHANDO_PTS_R4,
        criterioDesempate: null,
        dataEliminacao: new Date('2026-02-27T15:06:59.062Z'), // data original do run2
    });

    // ── 4. Corrigir vezesNaZona ─────────────────────────────────────────────
    if (quaseNada) quaseNada.vezesNaZona = 0;
    // Feirão do Insta mantém vezesNaZona = 1 (correto)

    edicao.ultima_atualizacao = new Date();
    edicao.markModified('participantes');
    edicao.markModified('historicoEliminacoes');
    await edicao.save();

    // Verificação final
    const vivosFinais     = edicao.participantes.filter(p => p.status === 'vivo').length;
    const eliminadosFinais = edicao.participantes.filter(p => p.status === 'eliminado').length;

    console.log('\n[FIX-v2] ✅ Correções aplicadas!');
    console.log(`  Vivos: ${vivosFinais} | Eliminados: ${eliminadosFinais}`);
    console.log(`  historicoEliminacoes: ${edicao.historicoEliminacoes.length} entrada(s)`);
    console.log(`  Eliminado correto: ${edicao.historicoEliminacoes.map(h => h.nomeTime).join(', ')}`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('[FIX-v2] Erro fatal:', err);
    process.exit(1);
});
