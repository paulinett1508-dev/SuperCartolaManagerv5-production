/**
 * FIX HERANÇA 2025 → InscricaoTemporada 2026
 *
 * Corrige saldo_transferido e divida_anterior para todos os participantes
 * cujo saldo real 2025 (rodadas + campos manuais + acertos) diverge do
 * que foi declarado na inscrição 2026.
 *
 * Uso:
 *   bun run scripts/applied-fixes/fix-heranca-2025.js           → dry-run (só mostra)
 *   bun run scripts/applied-fixes/fix-heranca-2025.js --force   → aplica no banco
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const TEMPORADA = 2026;
const TEMPORADA_ANT = 2025;
const DRY_RUN = !process.argv.includes('--force');
const TOLERANCIA = 0.5; // diferença mínima para considerar divergente

function fmt(v) {
    if (v === undefined || v === null) return 'N/A';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(2);
}

function calcularSaldoCampos(doc) {
    if (!doc) return 0;
    if (Array.isArray(doc.campos)) {
        return doc.campos.reduce((acc, c) => acc + (c.valor || 0), 0);
    }
    return (doc.campo1 || 0) + (doc.campo2 || 0) + (doc.campo3 || 0) + (doc.campo4 || 0);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`🔧 FIX HERANÇA 2025 — ${DRY_RUN ? '🔍 DRY-RUN (nenhum dado alterado)' : '⚡ APLICANDO NO BANCO'}`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    // ── Bulk load ──────────────────────────────────────────────────────────
    const [inscricoes2026, caches2025, campos2025, acertos2025] = await Promise.all([
        db.collection('inscricoestemporada').find({ temporada: TEMPORADA }).toArray(),
        db.collection('extratofinanceirocaches').find({ temporada: TEMPORADA_ANT }).toArray(),
        db.collection('fluxofinanceirocampos').find({ temporada: TEMPORADA_ANT }).toArray(),
        db.collection('acertofinanceiros').find({ temporada: TEMPORADA_ANT, ativo: true }).toArray(),
    ]);

    const mkKey = (ligaId, timeId) => `${String(ligaId)}_${Number(timeId)}`;

    const cacheMap2025 = new Map(caches2025.map(c => [mkKey(c.liga_id, c.time_id), c]));
    const camposMap2025 = new Map(campos2025.map(c => [mkKey(c.liga_id || c.ligaId, c.time_id || c.timeId), c]));
    const acertosIdx2025 = acertos2025.reduce((m, a) => {
        const k = mkKey(a.liga_id, a.time_id);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(a);
        return m;
    }, new Map());

    // ── Calcular correções ─────────────────────────────────────────────────
    const correcoes = [];
    const semDivergencia = [];

    for (const insc of inscricoes2026) {
        const ligaId = String(insc.liga_id);
        const timeId = Number(insc.time_id);
        const key = mkKey(ligaId, timeId);
        const nome = `${insc.dados_participante?.nome_cartoleiro || '?'} (${insc.dados_participante?.nome_time || '?'})`;

        const cache2025 = cacheMap2025.get(key);
        const camposDoc = camposMap2025.get(key);
        const acertosP = acertosIdx2025.get(key) || [];

        const saldoRodadas = cache2025?.saldo_consolidado || 0;
        const saldoCampos  = calcularSaldoCampos(camposDoc);
        const saldoAcertos = acertosP.reduce((acc, a) => {
            if (a.tipo === 'pagamento')   return acc + (a.valor || 0);
            if (a.tipo === 'recebimento') return acc - (a.valor || 0);
            return acc;
        }, 0);

        const saldoReal2025 = parseFloat((saldoRodadas + saldoCampos + saldoAcertos).toFixed(2));

        // Valores corretos
        const novoTransferido = parseFloat(Math.max(0, saldoReal2025).toFixed(2));
        const novaDivida      = parseFloat(Math.max(0, -saldoReal2025).toFixed(2));

        // Valores atuais
        const atualTransferido = insc.saldo_transferido || 0;
        const atualDivida      = insc.divida_anterior   || 0;

        const diffTransf = Math.abs(novoTransferido - atualTransferido);
        const diffDivida = Math.abs(novaDivida - atualDivida);

        if (diffTransf > TOLERANCIA || diffDivida > TOLERANCIA) {
            correcoes.push({
                _id: insc._id,
                ligaId, timeId, nome, key,
                saldoRodadas, saldoCampos, saldoAcertos, saldoReal2025,
                atualTransferido, atualDivida,
                novoTransferido, novaDivida,
                diffTransf, diffDivida,
            });
        } else {
            semDivergencia.push({ ligaId, timeId, nome, saldoReal2025 });
        }
    }

    // ── Relatório ──────────────────────────────────────────────────────────
    console.log(`📊 Inscrições analisadas: ${inscricoes2026.length}`);
    console.log(`✅ Sem divergência       : ${semDivergencia.length}`);
    console.log(`⚠️  Com divergência       : ${correcoes.length}\n`);

    if (correcoes.length === 0) {
        console.log('✅ Nada a corrigir.');
        await mongoose.disconnect();
        return;
    }

    console.log('── CORREÇÕES ' + (DRY_RUN ? '(simuladas)' : 'APLICADAS') + ' ──────────────────────────────────────────\n');

    let totalAplicadas = 0;
    let totalErros = 0;

    for (const c of correcoes) {
        console.log(`[${c.ligaId.slice(-8)}] time=${c.timeId} | ${c.nome}`);
        console.log(`  saldo real 2025: rodadas=${fmt(c.saldoRodadas)} + campos=${fmt(c.saldoCampos)} + acertos=${fmt(c.saldoAcertos)} = ${fmt(c.saldoReal2025)}`);
        console.log(`  transferido: ${fmt(c.atualTransferido)} → ${fmt(c.novoTransferido)}  (diff=${fmt(c.diffTransf)})`);
        console.log(`  divida:      ${fmt(c.atualDivida)} → ${fmt(c.novaDivida)}  (diff=${fmt(c.diffDivida)})`);

        if (!DRY_RUN) {
            try {
                const result = await db.collection('inscricoestemporada').updateOne(
                    { _id: c._id },
                    {
                        $set: {
                            saldo_transferido: c.novoTransferido,
                            divida_anterior:   c.novaDivida,
                            'legado_manual.fix_heranca_2025': {
                                aplicado_em: new Date(),
                                origem: 'fix-heranca-2025.js',
                                valores_anteriores: {
                                    saldo_transferido: c.atualTransferido,
                                    divida_anterior:   c.atualDivida,
                                },
                                saldo_real_2025: c.saldoReal2025,
                            },
                        },
                    }
                );
                if (result.modifiedCount === 1) {
                    console.log(`  ✅ Atualizado`);
                    totalAplicadas++;
                } else {
                    console.log(`  ⚠️  Nenhum doc modificado`);
                }
            } catch (e) {
                console.error(`  ❌ Erro: ${e.message}`);
                totalErros++;
            }
        }
        console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    if (DRY_RUN) {
        console.log(`🔍 DRY-RUN completo. ${correcoes.length} correções pendentes.`);
        console.log(`   Para aplicar: bun run scripts/applied-fixes/fix-heranca-2025.js --force`);
    } else {
        console.log(`✅ Aplicadas: ${totalAplicadas} | ❌ Erros: ${totalErros}`);
    }
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(e => { console.error('❌', e.message, e.stack); process.exit(1); });
