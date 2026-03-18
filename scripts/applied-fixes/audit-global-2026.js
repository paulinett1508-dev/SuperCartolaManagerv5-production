/**
 * AUDITORIA FINANCEIRA GLOBAL — Temporada 2026
 * Read-only: não altera nenhum dado.
 *
 * Verifica por participante:
 *   A) Cache 2026 sem INSCRICAO_TEMPORADA → delta de saldo incorreto
 *   B) Saldo herdado 2025 → 2026 (saldo_transferido vs saldo real 2025)
 *   C) Participantes sem cache 2026
 *   D) Ajustes financeiros inativos que reduzem saldo
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const TEMPORADA = 2026;
const TEMPORADA_ANT = 2025;

function fmt(v) {
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🔍 AUDITORIA FINANCEIRA GLOBAL — Temporada 2026 (+ herança 2025)');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    // ── 1. Carregar dados bulk ──────────────────────────────────────────────

    const [inscricoes2026, caches2026, caches2025, ajustes2026, acertos2026] = await Promise.all([
        db.collection('inscricoestemporada').find({ temporada: TEMPORADA }).toArray(),
        db.collection('extratofinanceirocaches').find({ temporada: TEMPORADA }).toArray(),
        db.collection('extratofinanceirocaches').find({ temporada: TEMPORADA_ANT }).toArray(),
        db.collection('ajustesfinanceiros').find({ temporada: TEMPORADA }).toArray(),
        db.collection('acertofinanceiros').find({ temporada: TEMPORADA, ativo: true }).toArray(),
    ]);

    console.log(`📦 Dados carregados:`);
    console.log(`   InscricoesTemporada 2026 : ${inscricoes2026.length}`);
    console.log(`   Caches 2026              : ${caches2026.length}`);
    console.log(`   Caches 2025              : ${caches2025.length}`);
    console.log(`   Ajustes 2026 (todos)     : ${ajustes2026.length}`);
    console.log(`   Acertos 2026 ativos      : ${acertos2026.length}\n`);

    // ── 2. Indexar por liga_time ───────────────────────────────────────────

    const cacheMap2026 = new Map();
    caches2026.forEach(c => cacheMap2026.set(`${String(c.liga_id)}_${c.time_id}`, c));

    const cacheMap2025 = new Map();
    caches2025.forEach(c => cacheMap2025.set(`${String(c.liga_id)}_${c.time_id}`, c));

    const ajustesMap = new Map();
    ajustes2026.forEach(a => {
        const k = `${String(a.liga_id)}_${a.time_id}`;
        if (!ajustesMap.has(k)) ajustesMap.set(k, []);
        ajustesMap.get(k).push(a);
    });

    const acertosMap = new Map();
    acertos2026.forEach(a => {
        const k = `${String(a.liga_id)}_${a.time_id}`;
        if (!acertosMap.has(k)) acertosMap.set(k, []);
        acertosMap.get(k).push(a);
    });

    // ── 3. Auditar cada inscrição ──────────────────────────────────────────

    const problemas = {
        semCache: [],
        inscricaoFaltandoNoCache: [],
        saldoHerancaDivergente: [],
        ajustesInativos: [],
    };

    let totalAuditados = 0;

    for (const insc of inscricoes2026) {
        const ligaId = String(insc.liga_id);
        const timeId = Number(insc.time_id);
        const key = `${ligaId}_${timeId}`;
        const nome = insc.dados_participante?.nome_cartoleiro || `time_${timeId}`;
        const nomeTime = insc.dados_participante?.nome_time || '';
        totalAuditados++;

        const cache2026 = cacheMap2026.get(key);
        const cache2025 = cacheMap2025.get(key);
        const ajustesParticipante = ajustesMap.get(key) || [];
        const acertosParticipante = acertosMap.get(key) || [];

        // ── A) Sem cache 2026 ──────────────────────────────────────────────
        if (!cache2026) {
            problemas.semCache.push({
                liga_id: ligaId, time_id: timeId, nome, nomeTime,
                taxa_inscricao: insc.taxa_inscricao,
                status: insc.status,
            });
            continue;
        }

        const historico = cache2026.historico_transacoes || [];
        const inscricaoNoCache = historico.some(t => t.tipo === 'INSCRICAO_TEMPORADA');

        // ── B) Inscrição faltando no cache ─────────────────────────────────
        if (!inscricaoNoCache && insc.taxa_inscricao > 0 && !insc.pagou_inscricao) {
            // Calcular saldo rodadas (sem inscrição)
            const saldoCache = cache2026.saldo_consolidado || 0;

            // Calcular saldo correto com inscrição
            const taxaInsc = insc.taxa_inscricao || 0;
            const saldoTransf = insc.saldo_transferido || 0;
            const dividaAnt = insc.divida_anterior || 0;
            const ajustesAtivos = ajustesParticipante
                .filter(a => a.ativo !== false)
                .reduce((acc, a) => acc + (a.valor || 0), 0);
            const saldoAcertos = acertosParticipante.reduce((acc, a) => {
                if (a.tipo === 'pagamento') return acc + a.valor;
                if (a.tipo === 'recebimento') return acc - a.valor;
                return acc;
            }, 0);

            const saldoSemInscricao = saldoCache + ajustesAtivos + saldoAcertos;
            const saldoComInscricao = saldoCache - taxaInsc + saldoTransf - dividaAnt + ajustesAtivos + saldoAcertos;
            const delta = saldoComInscricao - saldoSemInscricao;

            problemas.inscricaoFaltandoNoCache.push({
                liga_id: ligaId, time_id: timeId, nome, nomeTime,
                taxa_inscricao: taxaInsc,
                saldo_transferido: saldoTransf,
                divida_anterior: dividaAnt,
                saldo_cache_rodadas: saldoCache,
                saldo_sem_inscricao: saldoSemInscricao,
                saldo_correto: saldoComInscricao,
                delta,
                ultima_rodada: cache2026.ultima_rodada_consolidada,
            });
        }

        // ── C) Herança 2025: saldo_transferido bate com cache real? ────────
        if (insc.saldo_transferido !== undefined || insc.divida_anterior !== undefined) {
            const saldoTransfDeclarado = insc.saldo_transferido || 0;
            const dividaDeclarada = insc.divida_anterior || 0;

            if (cache2025) {
                const saldoReal2025 = cache2025.saldo_consolidado || 0;
                // saldo_transferido deveria ser max(0, saldoReal2025)
                // divida_anterior deveria ser max(0, -saldoReal2025)
                const saldoTransfEsperado = Math.max(0, saldoReal2025);
                const dividaEsperada = Math.max(0, -saldoReal2025);

                const diffTransf = Math.abs(saldoTransfDeclarado - saldoTransfEsperado);
                const diffDivida = Math.abs(dividaDeclarada - dividaEsperada);

                // Tolerância de R$0.01
                if (diffTransf > 0.01 || diffDivida > 0.01) {
                    problemas.saldoHerancaDivergente.push({
                        liga_id: ligaId, time_id: timeId, nome, nomeTime,
                        saldo_real_2025: saldoReal2025,
                        saldo_transferido_declarado: saldoTransfDeclarado,
                        divida_anterior_declarada: dividaDeclarada,
                        saldo_transferido_esperado: saldoTransfEsperado,
                        divida_esperada: dividaEsperada,
                        diff_transferido: diffTransf,
                        diff_divida: diffDivida,
                    });
                }
            }
        }

        // ── D) Ajustes inativos com impacto relevante ──────────────────────
        const ajustesInativos = ajustesParticipante.filter(a => a.ativo === false);
        if (ajustesInativos.length > 0) {
            const totalInativo = ajustesInativos.reduce((acc, a) => acc + (a.valor || 0), 0);
            if (Math.abs(totalInativo) > 0.01) {
                problemas.ajustesInativos.push({
                    liga_id: ligaId, time_id: timeId, nome, nomeTime,
                    ajustes: ajustesInativos.map(a => ({
                        descricao: a.descricao,
                        valor: a.valor,
                        tipo: a.tipo,
                    })),
                    total_inativo: totalInativo,
                });
            }
        }
    }

    // ── 4. Relatório ───────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`📊 TOTAL AUDITADOS: ${totalAuditados} participantes\n`);

    // A) Sem cache
    console.log(`▓▓▓ A) SEM CACHE 2026 — ${problemas.semCache.length} participantes ▓▓▓`);
    if (problemas.semCache.length > 0) {
        problemas.semCache.forEach(p => {
            console.log(`   [${p.liga_id.slice(-8)}] time=${p.time_id} | ${p.nome} (${p.nomeTime}) | taxa=${p.taxa_inscricao} | status=${p.status}`);
        });
    } else {
        console.log('   ✅ Nenhum');
    }
    console.log('');

    // B) Inscrição faltando no cache
    console.log(`▓▓▓ B) INSCRICAO_TEMPORADA FALTANDO NO CACHE — ${problemas.inscricaoFaltandoNoCache.length} participantes ▓▓▓`);
    if (problemas.inscricaoFaltandoNoCache.length > 0) {
        // Agrupar por liga
        const porLiga = {};
        problemas.inscricaoFaltandoNoCache.forEach(p => {
            if (!porLiga[p.liga_id]) porLiga[p.liga_id] = [];
            porLiga[p.liga_id].push(p);
        });
        Object.entries(porLiga).forEach(([ligaId, lista]) => {
            console.log(`\n   Liga ${ligaId.slice(-8)} (${lista.length} afetados):`);
            lista.forEach(p => {
                console.log(`     time=${p.time_id} | ${p.nome} (${p.nomeTime})`);
                console.log(`       taxa=${fmt(p.taxa_inscricao)} transf=${fmt(p.saldo_transferido)} divida=${fmt(p.divida_anterior)}`);
                console.log(`       saldo cache(rodadas)=${fmt(p.saldo_cache_rodadas)}  sem_insc=${fmt(p.saldo_sem_inscricao)}  CORRETO=${fmt(p.saldo_correto)}  DELTA=${fmt(p.delta)}`);
                console.log(`       ultima_rodada=${p.ultima_rodada}`);
            });
        });
    } else {
        console.log('   ✅ Nenhum (todos os caches têm INSCRICAO_TEMPORADA ou pagou_inscricao=true)');
    }
    console.log('');

    // C) Herança 2025 divergente
    console.log(`▓▓▓ C) HERANÇA 2025 DIVERGENTE — ${problemas.saldoHerancaDivergente.length} participantes ▓▓▓`);
    if (problemas.saldoHerancaDivergente.length > 0) {
        problemas.saldoHerancaDivergente.forEach(p => {
            console.log(`   [${p.liga_id.slice(-8)}] time=${p.time_id} | ${p.nome} (${p.nomeTime})`);
            console.log(`     saldo_real_2025=${fmt(p.saldo_real_2025)}`);
            console.log(`     transferido: declarado=${fmt(p.saldo_transferido_declarado)} esperado=${fmt(p.saldo_transferido_esperado)} diff=${fmt(p.diff_transferido)}`);
            console.log(`     divida:      declarada=${fmt(p.divida_anterior_declarada)} esperada=${fmt(p.divida_esperada)} diff=${fmt(p.diff_divida)}`);
        });
    } else {
        console.log('   ✅ Nenhum');
    }
    console.log('');

    // D) Ajustes inativos com impacto
    console.log(`▓▓▓ D) AJUSTES FINANCEIROS INATIVOS COM IMPACTO — ${problemas.ajustesInativos.length} participantes ▓▓▓`);
    if (problemas.ajustesInativos.length > 0) {
        problemas.ajustesInativos.forEach(p => {
            console.log(`   [${p.liga_id.slice(-8)}] time=${p.time_id} | ${p.nome} (${p.nomeTime}) | total_inativo=${fmt(p.total_inativo)}`);
            p.ajustes.forEach(a => {
                console.log(`     ${a.tipo || 'ajuste'}: ${fmt(a.valor)} — "${a.descricao}"`);
            });
        });
    } else {
        console.log('   ✅ Nenhum');
    }
    console.log('');

    // Sumário executivo
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('📋 SUMÁRIO EXECUTIVO');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`Total auditados : ${totalAuditados}`);
    console.log(`A) Sem cache    : ${problemas.semCache.length}`);
    console.log(`B) Insc. faltando no cache : ${problemas.inscricaoFaltandoNoCache.length}`);
    if (problemas.inscricaoFaltandoNoCache.length > 0) {
        const deltas = problemas.inscricaoFaltandoNoCache.map(p => p.delta);
        const minDelta = Math.min(...deltas);
        const maxDelta = Math.max(...deltas);
        console.log(`   Delta range  : ${fmt(minDelta)} a ${fmt(maxDelta)}`);
        console.log(`   ⚠️  Fix de verificarCacheValido resolve na exibição (não recalcula cache)`);
    }
    console.log(`C) Herança 2025 divergente : ${problemas.saldoHerancaDivergente.length}`);
    console.log(`D) Ajustes inativos c/ impacto: ${problemas.ajustesInativos.length}`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(e => { console.error('❌', e.message, e.stack); process.exit(1); });
