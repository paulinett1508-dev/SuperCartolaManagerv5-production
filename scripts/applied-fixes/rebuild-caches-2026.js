/**
 * REBUILD CACHES 2026 — Inserir INSCRICAO_TEMPORADA no historico_transacoes
 *
 * Para cada participante cujo cache 2026 não tem INSCRICAO_TEMPORADA,
 * insere a transação no início do historico_transacoes e recalcula
 * saldo_consolidado para incluir taxa, saldo_transferido e divida_anterior.
 *
 * Uso:
 *   bun run scripts/applied-fixes/rebuild-caches-2026.js           → dry-run
 *   bun run scripts/applied-fixes/rebuild-caches-2026.js --force   → aplica
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const TEMPORADA = 2026;
const DRY_RUN = !process.argv.includes('--force');

function fmt(v) {
    return (v >= 0 ? '+' : '') + Number(v).toFixed(2);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`🔧 REBUILD CACHES 2026 — ${DRY_RUN ? '🔍 DRY-RUN' : '⚡ APLICANDO NO BANCO'}`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const [inscricoes, caches] = await Promise.all([
        db.collection('inscricoestemporada').find({ temporada: TEMPORADA }).toArray(),
        db.collection('extratofinanceirocaches').find({ temporada: TEMPORADA }).toArray(),
    ]);

    const mkKey = (ligaId, timeId) => `${String(ligaId)}_${Number(timeId)}`;
    const cacheMap = new Map(caches.map(c => [mkKey(c.liga_id, c.time_id), c]));
    const inscMap  = new Map(inscricoes.map(i => [mkKey(i.liga_id, i.time_id), i]));

    let pendentes = 0, aplicadas = 0, erros = 0, pulados = 0;

    for (const cache of caches) {
        const key = mkKey(cache.liga_id, cache.time_id);
        const insc = inscMap.get(key);

        if (!insc) { pulados++; continue; }

        const historico = cache.historico_transacoes || [];
        const jaTemInscricao = historico.some(t => t.tipo === 'INSCRICAO_TEMPORADA');

        if (jaTemInscricao) { pulados++; continue; }

        const taxaInsc    = insc.taxa_inscricao    || 0;
        const saldoTransf = insc.saldo_transferido || 0;
        const dividaAnt   = insc.divida_anterior   || 0;
        const pagouInsc   = insc.pagou_inscricao === true;

        // Só inserir se há taxa real e não pagou (ou se há herança)
        if (taxaInsc === 0 && saldoTransf === 0 && dividaAnt === 0) { pulados++; continue; }

        pendentes++;
        const nome = `${insc.dados_participante?.nome_cartoleiro || '?'} (${insc.dados_participante?.nome_time || '?'})`;

        // Montar transações a inserir no início do historico
        const novasTransacoes = [];

        if (taxaInsc > 0 && !pagouInsc) {
            novasTransacoes.push({
                rodada: 0,
                tipo: 'INSCRICAO_TEMPORADA',
                descricao: `Taxa de inscrição ${TEMPORADA}`,
                valor: -taxaInsc,
                data: insc.criado_em || new Date(`${TEMPORADA}-01-01`),
                _id: new mongoose.Types.ObjectId(),
            });
        }
        if (saldoTransf !== 0) {
            novasTransacoes.push({
                rodada: 0,
                tipo: 'SALDO_TEMPORADA_ANTERIOR',
                descricao: saldoTransf > 0 ? `Crédito herdado de ${TEMPORADA - 1}` : `Dívida herdada de ${TEMPORADA - 1}`,
                valor: saldoTransf,
                data: insc.criado_em || new Date(`${TEMPORADA}-01-01`),
                _id: new mongoose.Types.ObjectId(),
            });
        }
        if (dividaAnt > 0) {
            novasTransacoes.push({
                rodada: 0,
                tipo: 'LEGADO_ANTERIOR',
                descricao: `Dívida anterior ${TEMPORADA - 1}`,
                valor: -dividaAnt,
                data: insc.criado_em || new Date(`${TEMPORADA}-01-01`),
                _id: new mongoose.Types.ObjectId(),
            });
        }

        // Novo saldo_consolidado = saldo atual (rodadas) + efeito das transações iniciais
        const efeitoInicial = novasTransacoes.reduce((acc, t) => acc + (t.valor || 0), 0);
        const novoSaldoConsolidado = parseFloat(((cache.saldo_consolidado || 0) + efeitoInicial).toFixed(2));

        const historicoAtualizado = [...novasTransacoes, ...historico];

        console.log(`[${String(cache.liga_id).slice(-8)}] time=${cache.time_id} | ${nome}`);
        console.log(`  saldo_consolidado: ${fmt(cache.saldo_consolidado)} → ${fmt(novoSaldoConsolidado)}`);
        novasTransacoes.forEach(t => {
            console.log(`  + ${t.tipo}: ${fmt(t.valor)} — "${t.descricao}"`);
        });

        if (!DRY_RUN) {
            try {
                const result = await db.collection('extratofinanceirocaches').updateOne(
                    { _id: cache._id },
                    {
                        $set: {
                            historico_transacoes: historicoAtualizado,
                            saldo_consolidado: novoSaldoConsolidado,
                            data_ultima_atualizacao: new Date(),
                        },
                    }
                );
                if (result.modifiedCount === 1) {
                    console.log(`  ✅ Cache atualizado`);
                    aplicadas++;
                } else {
                    console.log(`  ⚠️  Nenhum doc modificado`);
                }
            } catch (e) {
                console.error(`  ❌ Erro: ${e.message}`);
                erros++;
            }
        }
        console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`Pendentes : ${pendentes}`);
    console.log(`Pulados   : ${pulados} (já têm inscrição ou sem taxa/herança)`);
    if (DRY_RUN) {
        console.log(`\n🔍 DRY-RUN. Para aplicar:`);
        console.log(`   bun run scripts/applied-fixes/rebuild-caches-2026.js --force`);
    } else {
        console.log(`✅ Aplicadas: ${aplicadas} | ❌ Erros: ${erros}`);
    }
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(e => { console.error('❌', e.message, e.stack); process.exit(1); });
