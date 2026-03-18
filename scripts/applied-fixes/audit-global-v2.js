/**
 * AUDITORIA FINANCEIRA GLOBAL v2 — Herança 2025 + Convergência 2026
 * Read-only: não altera nenhum dado.
 *
 * Calcula saldo real 2025 incluindo:
 *   - cache 2025 (rodadas consolidadas)
 *   - FluxoFinanceiroCampos 2025 (campos manuais campo1–campo4)
 *   - AcertoFinanceiro 2025 ativos
 *
 * Compara com o que foi declarado em InscricaoTemporada 2026
 * (saldo_transferido, divida_anterior).
 *
 * Também verifica convergência 2026 entre os 3 paths:
 *   - Tesouraria: rodadas + aplicarAjusteInscricaoBulk + ajustes ativos + acertos ativos
 *   - verificarCacheValido: idem (após fix v7.2)
 *   - getExtratoCache: idem (fix v7.2 original)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const TEMPORADA = 2026;
const TEMPORADA_ANT = 2025;

function fmt(v) {
    if (v === undefined || v === null) return 'N/A';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(2);
}

function calcularSaldoCampos(doc) {
    if (!doc) return 0;
    // Suporte a ambos os formatos: array campos[] ou campos planos campo1-campo4
    if (Array.isArray(doc.campos)) {
        return doc.campos.reduce((acc, c) => acc + (c.valor || 0), 0);
    }
    return (doc.campo1 || 0) + (doc.campo2 || 0) + (doc.campo3 || 0) + (doc.campo4 || 0);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🔍 AUDITORIA FINANCEIRA v2 — Herança 2025 + Convergência 2026');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    // ── Bulk load ──────────────────────────────────────────────────────────
    const [
        inscricoes2026,
        caches2026,
        caches2025,
        campos2025,
        acertos2025,
        acertos2026,
        ajustes2026,
    ] = await Promise.all([
        db.collection('inscricoestemporada').find({ temporada: TEMPORADA }).toArray(),
        db.collection('extratofinanceirocaches').find({ temporada: TEMPORADA }).toArray(),
        db.collection('extratofinanceirocaches').find({ temporada: TEMPORADA_ANT }).toArray(),
        db.collection('fluxofinanceirocampos').find({ temporada: TEMPORADA_ANT }).toArray(),
        db.collection('acertofinanceiros').find({ temporada: TEMPORADA_ANT, ativo: true }).toArray(),
        db.collection('acertofinanceiros').find({ temporada: TEMPORADA, ativo: true }).toArray(),
        db.collection('ajustesfinanceiros').find({ temporada: TEMPORADA }).toArray(),
    ]);

    console.log('📦 Dados carregados:');
    console.log(`   InscricoesTemporada 2026 : ${inscricoes2026.length}`);
    console.log(`   Caches 2026              : ${caches2026.length}`);
    console.log(`   Caches 2025              : ${caches2025.length}`);
    console.log(`   FluxoFinanceiroCampos 2025: ${campos2025.length}`);
    console.log(`   Acertos 2025 ativos      : ${acertos2025.length}`);
    console.log(`   Acertos 2026 ativos      : ${acertos2026.length}`);
    console.log(`   Ajustes 2026 (todos)     : ${ajustes2026.length}\n`);

    // ── Indexar ────────────────────────────────────────────────────────────
    const mkKey = (ligaId, timeId) => `${String(ligaId)}_${Number(timeId)}`;

    const idx = (arr, keyFn) => arr.reduce((m, x) => {
        const k = keyFn(x);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
        return m;
    }, new Map());

    const cacheMap2026 = new Map(caches2026.map(c => [mkKey(c.liga_id, c.time_id), c]));
    const cacheMap2025 = new Map(caches2025.map(c => [mkKey(c.liga_id, c.time_id), c]));
    const camposMap2025 = new Map(campos2025.map(c => [mkKey(c.liga_id || c.ligaId, c.time_id || c.timeId), c]));
    const acertosIdx2025 = idx(acertos2025, a => mkKey(a.liga_id, a.time_id));
    const acertosIdx2026 = idx(acertos2026, a => mkKey(a.liga_id, a.time_id));
    const ajustesIdx2026 = idx(ajustes2026, a => mkKey(a.liga_id, a.time_id));

    // ── Processar ──────────────────────────────────────────────────────────
    const resultados = {
    herancaOk: [],
    herancaDivergente: [],
    sem2025: [],
    convergencia: [],
    };

    for (const insc of inscricoes2026) {
        const ligaId = String(insc.liga_id);
        const timeId = Number(insc.time_id);
        const key = mkKey(ligaId, timeId);
        const nome = `${insc.dados_participante?.nome_cartoleiro || '?'} (${insc.dados_participante?.nome_time || '?'})`;

        const cache2026 = cacheMap2026.get(key);
        const cache2025 = cacheMap2025.get(key);
        const camposDoc = camposMap2025.get(key);
        const acertosP2025 = acertosIdx2025.get(key) || [];
        const acertosP2026 = acertosIdx2026.get(key) || [];
        const ajustesP2026 = ajustesIdx2026.get(key) || [];

        // ── Saldo 2025 real ──────────────────────────────────────────────
        const saldoRodadas2025 = cache2025?.saldo_consolidado || 0;
        const saldoCampos2025  = calcularSaldoCampos(camposDoc);
        const saldoAcertos2025 = acertosP2025.reduce((acc, a) => {
            if (a.tipo === 'pagamento')   return acc + (a.valor || 0);
            if (a.tipo === 'recebimento') return acc - (a.valor || 0);
            return acc;
        }, 0);
        const saldoFinal2025Real = saldoRodadas2025 + saldoCampos2025 + saldoAcertos2025;

        // ── O que foi declarado na inscrição ─────────────────────────────
        const transferidoDeclarado = insc.saldo_transferido || 0;
        const dividaDeclarada      = insc.divida_anterior   || 0;
        // Líquido declarado = transferido - divida (pode ser negativo)
        const liquidoDeclarado = transferidoDeclarado - dividaDeclarada;

        // ── Verificar herança ────────────────────────────────────────────
        if (!cache2025 && !camposDoc && acertosP2025.length === 0) {
            // Sem dados 2025 — não consegue verificar
            if (transferidoDeclarado !== 0 || dividaDeclarada !== 0) {
                resultados.sem2025.push({ key, ligaId, timeId, nome,
                    transferidoDeclarado, dividaDeclarada });
            }
        } else {
            const diff = Math.abs(saldoFinal2025Real - liquidoDeclarado);
            const item = {
                key, ligaId, timeId, nome,
                saldoRodadas2025,
                saldoCampos2025,
                saldoAcertos2025,
                saldoFinal2025Real,
                transferidoDeclarado,
                dividaDeclarada,
                liquidoDeclarado,
                diff,
            };
            if (diff > 0.5) {
                resultados.herancaDivergente.push(item);
            } else {
                resultados.herancaOk.push(item);
            }
        }

        // ── Convergência 2026: calcular saldo pelos 3 paths ──────────────
        if (!cache2026) continue;

        const historico = cache2026.historico_transacoes || [];
        const saldoRodadas2026 = cache2026.saldo_consolidado || 0;
        const inscricaoNoCache = historico.some(t => t.tipo === 'INSCRICAO_TEMPORADA');
        const taxaInsc  = insc.taxa_inscricao    || 0;
        const saldoTransf = insc.saldo_transferido || 0;
        const dividaAnt   = insc.divida_anterior   || 0;
        const ajustesAtivos = ajustesP2026
            .filter(a => a.ativo === true)   // só explicitamente true
            .reduce((acc, a) => acc + (a.valor || 0), 0);
        const ajustesUndefined = ajustesP2026
            .filter(a => a.ativo === undefined)  // sem campo ativo — tratar como ativo
            .reduce((acc, a) => acc + (a.valor || 0), 0);
        const saldoAcertos2026 = acertosP2026.reduce((acc, a) => {
            if (a.tipo === 'pagamento')   return acc + (a.valor || 0);
            if (a.tipo === 'recebimento') return acc - (a.valor || 0);
            return acc;
        }, 0);

        // Path comum: rodadas + acertos + ajustes + inscrição (se não no cache)
        let saldoBase = saldoRodadas2026 + saldoAcertos2026 + ajustesAtivos + ajustesUndefined;
        if (!inscricaoNoCache && taxaInsc > 0 && !insc.pagou_inscricao) {
            saldoBase = saldoBase - taxaInsc + saldoTransf - dividaAnt;
        }

        resultados.convergencia.push({
            key, ligaId, timeId, nome,
            saldoRodadas2026,
            saldoAcertos2026,
            ajustesAtivos,
            ajustesUndefined,
            inscricaoNoCache,
            taxaInsc,
            saldoTransf,
            dividaAnt,
            saldoFinal: saldoBase,
            pagouInscricao: insc.pagou_inscricao,
        });
    }

    // ── Relatório: Herança ─────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`▓▓▓ HERANÇA 2025 — Divergentes: ${resultados.herancaDivergente.length} | OK: ${resultados.herancaOk.length} | Sem dados 2025: ${resultados.sem2025.length} ▓▓▓`);
    console.log('');

    if (resultados.herancaDivergente.length > 0) {
        console.log('⚠️  DIVERGENTES (saldo real 2025 ≠ declarado na inscrição):');
        resultados.herancaDivergente.forEach(p => {
            console.log(`\n   [${p.ligaId.slice(-8)}] time=${p.timeId} | ${p.nome}`);
            console.log(`     Saldo real 2025   : rodadas=${fmt(p.saldoRodadas2025)} + campos=${fmt(p.saldoCampos2025)} + acertos=${fmt(p.saldoAcertos2025)} = ${fmt(p.saldoFinal2025Real)}`);
            console.log(`     Declarado inscrição: transferido=${fmt(p.transferidoDeclarado)} − divida=${fmt(p.dividaDeclarada)} = líquido ${fmt(p.liquidoDeclarado)}`);
            console.log(`     DIFERENÇA         : ${fmt(p.diff)} ${p.diff > 5 ? '🔴 CRÍTICO' : '🟡'}`);

            // Correção sugerida
            const corrigirTransf = Math.max(0, p.saldoFinal2025Real);
            const corrigirDivida = Math.max(0, -p.saldoFinal2025Real);
            console.log(`     Correção sugerida : transferido=${fmt(corrigirTransf)} | divida=${fmt(corrigirDivida)}`);
        });
    }

    if (resultados.sem2025.length > 0) {
        console.log('\n❓ SEM DADOS 2025 (inscrição declara herança mas não há cache/campos):');
        resultados.sem2025.forEach(p => {
            console.log(`   [${p.ligaId.slice(-8)}] time=${p.timeId} | ${p.nome} | transf=${fmt(p.transferidoDeclarado)} divida=${fmt(p.dividaDeclarada)}`);
        });
    }

    // ── Relatório: Convergência 2026 ───────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('▓▓▓ CONVERGÊNCIA 2026 — Saldo unificado após fix ▓▓▓');
    console.log('');

    // Agrupar por liga
    const porLiga = {};
    resultados.convergencia.forEach(p => {
        if (!porLiga[p.ligaId]) porLiga[p.ligaId] = [];
        porLiga[p.ligaId].push(p);
    });

    Object.entries(porLiga).forEach(([ligaId, lista]) => {
        console.log(`\n  Liga ${ligaId.slice(-8)} (${lista.length} participantes com cache):`);
        lista.forEach(p => {
            const flags = [];
            if (!p.inscricaoNoCache && p.taxaInsc > 0) flags.push('insc_faltando_no_cache');
            if (p.ajustesUndefined !== 0) flags.push(`ajuste_sem_ativo_field=${fmt(p.ajustesUndefined)}`);
            if (p.pagouInscricao) flags.push('pagou_inscricao');

            console.log(`    time=${p.timeId} | ${p.nome}`);
            console.log(`      rodadas=${fmt(p.saldoRodadas2026)} acertos=${fmt(p.saldoAcertos2026)} ajustes_ativos=${fmt(p.ajustesAtivos)} taxa=${fmt(-p.taxaInsc)} transf=${fmt(p.saldoTransf)} divida=${fmt(-p.dividaAnt)}`);
            console.log(`      ★ SALDO UNIFICADO: ${fmt(p.saldoFinal)}${flags.length ? '  [' + flags.join(', ') + ']' : ''}`);
        });
    });

    // ── Sumário ────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📋 SUMÁRIO EXECUTIVO v2');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`Herança 2025 OK          : ${resultados.herancaOk.length}`);
    console.log(`Herança 2025 divergente  : ${resultados.herancaDivergente.length}`);
    console.log(`Sem dados 2025           : ${resultados.sem2025.length}`);
    console.log(`Participantes com cache  : ${resultados.convergencia.length}`);
    const comInscFaltando = resultados.convergencia.filter(p => !p.inscricaoNoCache && p.taxaInsc > 0).length;
    console.log(`Cache sem INSCRICAO_TEMP : ${comInscFaltando} (fix v7.2 resolve exibição)`);
    const comAjusteUndef = resultados.convergencia.filter(p => p.ajustesUndefined !== 0).length;
    if (comAjusteUndef > 0) console.log(`⚠️  Ajustes sem campo ativo : ${comAjusteUndef} (tratados como ativos)`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(e => { console.error('❌', e.message, e.stack); process.exit(1); });
