/**
 * fix-resta-um-r8-r9-r10.js
 *
 * Corrige eliminações faltantes e incorreta da Edição 1 (liga 684cb1c8af923da7c7df51de).
 *
 * Situação detectada:
 *   - R8:  eliminação AUSENTE — onConsolidate falhou (scores parciais da fase live
 *          foram usados; validação de cobertura ou array vazio bloqueou o processamento)
 *   - R9:  eliminação ERRADA — Chamex FC eliminado com score PARCIAL (28.5 pts live).
 *          Score FINAL de Chamex em R9 = 79.24 pts. Verdadeiro eliminado = BarrosB (63.58 pts)
 *   - R10: eliminação AUSENTE — mesma causa raiz de R8
 *
 * Correções (calculadas dos Rodada records com scores FINAIS):
 *   R8  → Chamex FC                   (timeId 8188312)  — 28.50 pts
 *   R9  → BarrosB                     (timeId 1113367)  — 63.58 pts  [troca Chamex → BarrosB]
 *   R10 → Invictus Patamar S.A.F.     (timeId 25324292) — 64.86 pts
 *
 * O que é RECALCULADO:
 *   • pontosAcumulados: recomputado do zero usando Rodada records R4–R10
 *   • rodadasSobrevividas: recomputado baseado na rodada de eliminação correta
 *   • pontosRodada: atualizado com o score da última rodada de cada participante
 *   • historicoEliminacoes: substituído pelo histórico correto
 *
 * O que NÃO é alterado:
 *   • vezesNaZona: campo não recalculado (não crítico para exibição)
 *   • Débito Chamex (chave r9-t8188312): mantido como está para evitar cobrança dupla
 *
 * Débitos lançados pelo script:
 *   • BarrosB R9: chave resta_um-debito-e1-r9-t1113367
 *   • Invictus R10: chave resta_um-debito-e1-r10-t25324292
 *
 * Uso:
 *   node scripts/fix-resta-um-r8-r9-r10.js --dry-run
 *   node scripts/fix-resta-um-r8-r9-r10.js --force
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

const LIGA_ID   = '684cb1c8af923da7c7df51de';
const EDICAO    = 1;
const TEMPORADA = 2026;
const RODADAS_ALVO = [4, 5, 6, 7, 8, 9, 10];

// ── Inline schemas (sem depender do import chain da aplicação) ────────────────
const restaumSchema    = new mongoose.Schema({}, { strict: false });
const rodadaSchema     = new mongoose.Schema({}, { strict: false });
const ajusteSchema     = new mongoose.Schema({}, { strict: false });

const RestaUmCache = mongoose.models.RestaUmCacheFix
    || mongoose.model('RestaUmCacheFix', restaumSchema, 'restaumcaches');
const Rodada = mongoose.models.RodadaFix
    || mongoose.model('RodadaFix', rodadaSchema, 'rodadas');
const AjusteFinanceiro = mongoose.models.AjusteFinanceiroFix
    || mongoose.model('AjusteFinanceiroFix', ajusteSchema, 'ajustesfinanceiros');

// ── Eliminações corretas (fonte: Rodada records com scores finais) ────────────
const ELIMINACOES = {
    4:  { timeId: 476869,   nomeTime: 'Engenhando' },
    5:  { timeId: 20165417, nomeTime: 'RB Ousadia&Alegria 94' },
    6:  { timeId: 13935277, nomeTime: 'Urubu Play F.C.' },
    7:  { timeId: 575856,   nomeTime: 'Feirão do Insta Floriano PI' },
    8:  { timeId: 8188312,  nomeTime: 'Chamex F.C.' },       // CORRIGIDO: era R9
    9:  { timeId: 1113367,  nomeTime: 'BarrosB' },            // NOVO
    10: { timeId: 25324292, nomeTime: 'Invictus Patamar S.A.F.' }, // NOVO
};

// Mapa inverso: timeId → rodada de eliminação
const eliminadosMap = Object.fromEntries(
    Object.entries(ELIMINACOES).map(([r, el]) => [String(el.timeId), Number(r)])
);

async function main() {
    console.log(`\n[FIX] ═══════════════════════════════════════════════════════════════`);
    console.log(`[FIX] Modo: ${isDryRun ? '⚠️  DRY-RUN (nada será alterado)' : '🔴 FORCE (aplicando mudanças)'}`);
    console.log(`[FIX] Liga: ${LIGA_ID} | Edição: ${EDICAO} | Temporada: ${TEMPORADA}`);
    console.log(`[FIX] ═══════════════════════════════════════════════════════════════\n`);

    await mongoose.connect(process.env.MONGO_URI);
    console.log('[FIX] ✅ Conectado ao MongoDB\n');

    // ── 1. Buscar edição ───────────────────────────────────────────────────────
    const edicao = await RestaUmCache.findOne({
        liga_id: LIGA_ID,
        edicao:  EDICAO,
        temporada: TEMPORADA,
    });

    if (!edicao) {
        console.error('❌ Edição não encontrada');
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`[FIX] Edição: "${edicao.nome}"`);
    console.log(`[FIX] Status: ${edicao.status} | rodadaAtual: ${edicao.rodadaAtual}`);
    console.log(`[FIX] Participantes: ${edicao.participantes.length}`);
    console.log(`[FIX] Vivos: ${edicao.participantes.filter(p => p.status === 'vivo').length}`);
    console.log(`[FIX] Eliminados: ${edicao.participantes.filter(p => p.status === 'eliminado').length}`);
    console.log(`[FIX] historicoEliminacoes: ${edicao.historicoEliminacoes.length} entradas`);
    console.log(`[FIX] debitosLancados: [${edicao.debitosLancados}]`);
    console.log(`[FIX] taxaEliminacao: ${edicao.taxaEliminacao}`);
    console.log(`[FIX] fluxoFinanceiroHabilitado: ${edicao.fluxoFinanceiroHabilitado}\n`);

    // ── 2. Buscar pontuações finais R4–R10 ──────────────────────────────────────
    console.log('[FIX] Buscando pontuações finais das rodadas...');
    const ligaIdObj = new mongoose.Types.ObjectId(LIGA_ID);

    const rodadaRecords = await Rodada.find({
        ligaId:    ligaIdObj,
        rodada:    { $in: RODADAS_ALVO },
        temporada: TEMPORADA,
        populacaoFalhou: { $ne: true },
    }).lean();

    // scoreMap[rodada][timeId] = pontos
    const scoreMap = Object.fromEntries(RODADAS_ALVO.map(r => [r, {}]));
    for (const rec of rodadaRecords) {
        if (scoreMap[rec.rodada]) {
            scoreMap[rec.rodada][String(rec.timeId)] = rec.pontos || 0;
        }
    }

    console.log('[FIX] Records encontrados por rodada:');
    for (const r of RODADAS_ALVO) {
        const count = Object.keys(scoreMap[r]).length;
        const ok = count >= 30 ? '✅' : '⚠️ ';
        console.log(`  ${ok} R${r}: ${count} records`);
    }
    console.log();

    // ── 3. Verificar scores dos participantes-chave ────────────────────────────
    const keyChecks = [
        { rodada: 8,  timeId: 8188312,  expectedMin: 28, label: 'Chamex R8 (deve ser ~28.5)' },
        { rodada: 9,  timeId: 1113367,  expectedMin: 60, label: 'BarrosB R9 (deve ser ~63.58)' },
        { rodada: 10, timeId: 25324292, expectedMin: 60, label: 'Invictus R10 (deve ser ~64.86)' },
    ];

    console.log('[FIX] Verificando scores dos participantes-chave:');
    let haProblema = false;
    for (const ck of keyChecks) {
        const score = scoreMap[ck.rodada][String(ck.timeId)];
        if (score === undefined) {
            console.log(`  ❌ ${ck.label}: NÃO ENCONTRADO`);
            haProblema = true;
        } else {
            console.log(`  ✅ ${ck.label}: ${score.toFixed(4)} pts`);
        }
    }

    if (haProblema) {
        console.error('\n❌ Scores obrigatórios ausentes — abortando');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log();

    // ── 4. Calcular novo estado de cada participante ───────────────────────────
    const atualizacoes = edicao.participantes.map(p => {
        const tid        = String(p.timeId);
        const rodadaElim = eliminadosMap[tid] ?? null;

        // Rodadas em que o participante estava vivo (inclusivo na eliminação)
        const rodadasJogadas = rodadaElim
            ? RODADAS_ALVO.filter(r => r <= rodadaElim)
            : RODADAS_ALVO;

        const pontosAcumulados  = rodadasJogadas.reduce((acc, r) => acc + (scoreMap[r][tid] || 0), 0);
        const rodadasSobrevividas = rodadasJogadas.length;
        const ultimaRodada      = rodadasJogadas[rodadasJogadas.length - 1];
        const pontosRodada      = scoreMap[ultimaRodada]?.[tid] || 0;
        const novoStatus        = rodadaElim ? 'eliminado' : 'vivo';

        return {
            timeId:                    p.timeId,
            nomeTime:                  p.nomeTime,
            // campos atuais
            status_atual:              p.status,
            rodadaEliminacao_atual:    p.rodadaEliminacao,
            pontosAcumulados_atual:    p.pontosAcumulados,
            rodadasSobrevividas_atual: p.rodadasSobrevividas,
            pontosRodada_atual:        p.pontosRodada,
            // campos novos
            status_novo:               novoStatus,
            rodadaEliminacao_nova:     rodadaElim,
            pontosAcumulados_novo:     pontosAcumulados,
            rodadasSobrevividas_novo:  rodadasSobrevividas,
            pontosRodada_novo:         pontosRodada,
        };
    });

    // ── 5. Exibir resumo das mudanças ──────────────────────────────────────────
    console.log('[FIX] ── Mudanças de status e eliminação ───────────────────────────────');
    const comMudancaStatus = atualizacoes.filter(u =>
        u.status_atual !== u.status_novo ||
        u.rodadaEliminacao_atual !== u.rodadaEliminacao_nova
    );

    for (const u of comMudancaStatus) {
        const statusTag = u.status_novo === 'eliminado'
            ? (u.status_atual === 'vivo' ? '🔴 NOVO ELIMINADO' : '🔄 RODADA CORRIGIDA')
            : '🟢 REATIVADO/MANTIDO';
        console.log(`  ${statusTag}: ${u.nomeTime} (${u.timeId})`);
        if (u.status_atual !== u.status_novo)
            console.log(`    status:          ${u.status_atual} → ${u.status_novo}`);
        if (u.rodadaEliminacao_atual !== u.rodadaEliminacao_nova)
            console.log(`    rodadaEliminacao: ${u.rodadaEliminacao_atual} → ${u.rodadaEliminacao_nova}`);
        console.log(`    pontosAcumulados: ${u.pontosAcumulados_atual?.toFixed(4)} → ${u.pontosAcumulados_novo.toFixed(4)}`);
        console.log(`    rodadasSobrev.:   ${u.rodadasSobrevividas_atual} → ${u.rodadasSobrevividas_novo}`);
    }
    console.log();

    // ── 6. Novo historicoEliminacoes ───────────────────────────────────────────
    const novoHistorico = Object.entries(ELIMINACOES).map(([rodadaStr, el]) => {
        const rodada = Number(rodadaStr);
        const tid    = String(el.timeId);
        const pontosRodada = scoreMap[rodada]?.[tid] || 0;

        // Preservar data original para R4–R7 (eliminações já corretas)
        const existente = edicao.historicoEliminacoes.find(
            h => h.rodada === rodada && String(h.timeId) === tid
        );
        const dataEliminacao = existente?.dataEliminacao || new Date();

        return { rodada, timeId: el.timeId, nomeTime: el.nomeTime, pontosRodada, criterioDesempate: null, dataEliminacao };
    });

    console.log('[FIX] ── Novo historicoEliminacoes ──────────────────────────────────────');
    for (const h of novoHistorico) {
        const mudou = !edicao.historicoEliminacoes.some(
            old => old.rodada === h.rodada && String(old.timeId) === String(h.timeId)
        );
        const tag = mudou ? '🆕' : '  ';
        console.log(`  ${tag} R${h.rodada}: ${h.nomeTime} — ${h.pontosRodada.toFixed(4)} pts`);
    }
    console.log();

    // ── 7. Débitos a lançar ────────────────────────────────────────────────────
    // Chamex (R8): NÃO relançar — debit existente chave r9-t8188312 já cobre financeiramente
    // BarrosB (R9) e Invictus (R10): lançar débitos novos
    const debitosParaLancar = [
        { rodada: 9,  timeId: 1113367,  nomeTime: 'BarrosB' },
        { rodada: 10, timeId: 25324292, nomeTime: 'Invictus Patamar S.A.F.' },
    ];

    const novoDebitosLancados = [...new Set([...(edicao.debitosLancados || []), 8, 9, 10])].sort();

    console.log(`[FIX] debitosLancados: [${edicao.debitosLancados}] → [${novoDebitosLancados}]`);
    console.log('[FIX] Débitos a lançar:');
    for (const d of debitosParaLancar) {
        const chave = `resta_um-debito-e${EDICAO}-r${d.rodada}-t${d.timeId}`;
        console.log(`  📤 ${d.nomeTime} R${d.rodada}: chave=${chave}`);
    }
    console.log(`[FIX] ℹ️  Chamex (R8): débito existente r9-t8188312 preservado (sem cobrança dupla)`);
    console.log();

    if (isDryRun) {
        console.log('[DRY-RUN] ✅ Simulação concluída. Nenhuma alteração realizada.');
        console.log('[DRY-RUN] Execute com --force para aplicar.\n');
        await mongoose.disconnect();
        return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // APLICAR CORREÇÕES
    // ══════════════════════════════════════════════════════════════════════════

    // 1. Atualizar participantes
    for (const u of atualizacoes) {
        const p = edicao.participantes.find(x => x.timeId === u.timeId);
        if (!p) continue;
        p.status             = u.status_novo;
        p.rodadaEliminacao   = u.rodadaEliminacao_nova;
        p.pontosAcumulados   = u.pontosAcumulados_novo;
        p.rodadasSobrevividas = u.rodadasSobrevividas_novo;
        p.pontosRodada       = u.pontosRodada_novo;
    }

    // 2. Substituir historicoEliminacoes
    edicao.historicoEliminacoes = novoHistorico;

    // 3. Atualizar metadados
    edicao.rodadaAtual       = 10;
    edicao.debitosLancados   = novoDebitosLancados;
    edicao.ultima_atualizacao = new Date();

    edicao.markModified('participantes');
    edicao.markModified('historicoEliminacoes');
    edicao.markModified('debitosLancados');
    await edicao.save();
    console.log('[FIX] ✅ Edição salva (participantes, historicoEliminacoes, debitosLancados)');

    // 4. Lançar débitos financeiros
    if (edicao.fluxoFinanceiroHabilitado && edicao.taxaEliminacao > 0) {
        for (const d of debitosParaLancar) {
            const chave = `resta_um-debito-e${EDICAO}-r${d.rodada}-t${d.timeId}`;

            const jaExiste = await AjusteFinanceiro.findOne({
                liga_id:          LIGA_ID,
                time_id:          Number(d.timeId),
                temporada:        TEMPORADA,
                chaveIdempotencia: chave,
            }).lean();

            if (jaExiste) {
                console.log(`[FIX-FIN] ℹ️  Débito já existe: ${d.nomeTime} R${d.rodada} — pulando`);
                continue;
            }

            await AjusteFinanceiro.create({
                liga_id:          LIGA_ID,
                time_id:          Number(d.timeId),
                temporada:        TEMPORADA,
                descricao:        `Resta Um E${EDICAO} - Eliminado R${d.rodada}`,
                valor:            -Math.abs(edicao.taxaEliminacao),
                criado_por:       'fix-resta-um-r8-r9-r10',
                chaveIdempotencia: chave,
                metadata:         { modulo: 'resta_um', edicao: EDICAO, rodada: d.rodada, fix: true },
            });

            console.log(`[FIX-FIN] ✅ Débito lançado: ${d.nomeTime} R${d.rodada} -R$${edicao.taxaEliminacao}`);
        }
    } else {
        console.log('[FIX-FIN] ℹ️  Fluxo financeiro desabilitado — débitos não lançados');
    }

    // ── Verificação final ────────────────────────────────────────────────────
    const final = await RestaUmCache.findOne({ liga_id: LIGA_ID, edicao: EDICAO, temporada: TEMPORADA }).lean();

    console.log('\n[FIX] ══ Estado final ══════════════════════════════════════════════════');
    console.log(`  rodadaAtual:          ${final.rodadaAtual}`);
    console.log(`  vivos:                ${final.participantes.filter(p => p.status === 'vivo').length}`);
    console.log(`  eliminados:           ${final.participantes.filter(p => p.status === 'eliminado').length}`);
    console.log(`  historicoEliminacoes: ${final.historicoEliminacoes.length} entradas`);
    console.log(`  debitosLancados:      [${final.debitosLancados}]`);
    console.log();
    console.log('  Histórico de eliminações:');
    for (const h of final.historicoEliminacoes) {
        console.log(`    R${h.rodada}: ${h.nomeTime} — ${h.pontosRodada} pts`);
    }
    console.log('\n[FIX] ✅ Correção concluída com sucesso.\n');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('[FIX] ❌ Erro fatal:', err);
    process.exit(1);
});
