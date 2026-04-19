/**
 * Auditoria Financeira Completa — Liga Super Cartola
 * Liga: 684cb1c8af923da7c7df51de
 *
 * Cruza extratos, acertos e ajustes de 2025 e 2026 para cada participante.
 * Fórmula: saldoFinal = saldo_consolidado(rodadas) + totalAjustes + saldoAcertos
 *
 * Uso: node scripts/auditoria-financeira.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID = '684cb1c8af923da7c7df51de';

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    console.log('MongoDB conectado\n');

    // times.id = participante ID (número)
    const times = await db.collection('times').find({
        liga_id: LIGA_ID, temporada: 2026, ativo: true
    }).sort({ nome: 1 }).toArray();
    console.log(`Participantes ativos 2026: ${times.length}\n`);

    // Extratos 2026 — saldo_consolidado = saldo ganho/perdido em rodadas
    const extratos2026 = await db.collection('extratofinanceirocaches').find({ liga_id: LIGA_ID, temporada: 2026 }).toArray();
    const ex26 = {};
    extratos2026.forEach(e => { ex26[e.time_id] = e; });

    // Extratos 2025
    const extratos2025 = await db.collection('extratofinanceirocaches').find({ liga_id: LIGA_ID, temporada: 2025 }).toArray();
    const ex25 = {};
    extratos2025.forEach(e => { ex25[e.time_id] = e; });

    // Ajustes 2026
    const aj26all = await db.collection('ajustesfinanceiros').find({ liga_id: LIGA_ID, temporada: 2026, ativo: true }).toArray();
    const aj26 = {};
    aj26all.forEach(a => { if (!aj26[a.time_id]) aj26[a.time_id] = []; aj26[a.time_id].push(a); });

    // Ajustes 2025
    const aj25all = await db.collection('ajustesfinanceiros').find({ liga_id: LIGA_ID, temporada: 2025, ativo: true }).toArray();
    const aj25 = {};
    aj25all.forEach(a => { if (!aj25[a.time_id]) aj25[a.time_id] = []; aj25[a.time_id].push(a); });

    // Acertos 2026
    const ac26all = await db.collection('acertofinanceiros').find({ liga_id: LIGA_ID, temporada: 2026, ativo: true }).toArray();
    const ac26 = {};
    ac26all.forEach(a => { if (!ac26[a.time_id]) ac26[a.time_id] = []; ac26[a.time_id].push(a); });

    // Acertos 2025
    const ac25all = await db.collection('acertofinanceiros').find({ liga_id: LIGA_ID, temporada: 2025, ativo: true }).toArray();
    const ac25 = {};
    ac25all.forEach(a => { if (!ac25[a.time_id]) ac25[a.time_id] = []; ac25[a.time_id].push(a); });

    const resultados = [];

    for (const time of times) {
        const tid = time.id;  // campo correto na collection times

        // 2026
        const extrato26 = ex26[tid] || {};
        const saldoRodadas = extrato26.saldo_consolidado || 0;
        const ganhos26 = extrato26.ganhos_consolidados || 0;
        const perdas26 = extrato26.perdas_consolidadas || 0;

        const listaAj26 = aj26[tid] || [];
        const totalAjustes26 = listaAj26.reduce((s, a) => s + (a.valor || 0), 0);

        const listaAc26 = ac26[tid] || [];
        const pago26 = listaAc26.filter(a => a.tipo === 'pagamento').reduce((s, a) => s + a.valor, 0);
        const recebido26 = listaAc26.filter(a => a.tipo === 'recebimento').reduce((s, a) => s + a.valor, 0);
        const saldoAcertos26 = pago26 - recebido26;

        const saldoFinal26 = saldoRodadas + totalAjustes26 + saldoAcertos26;

        // 2025
        const extrato25 = ex25[tid] || {};
        const saldoRodadas25 = extrato25.saldo_consolidado || 0;

        const listaAj25 = aj25[tid] || [];
        const totalAjustes25 = listaAj25.reduce((s, a) => s + (a.valor || 0), 0);

        const listaAc25 = ac25[tid] || [];
        const pago25 = listaAc25.filter(a => a.tipo === 'pagamento').reduce((s, a) => s + a.valor, 0);
        const recebido25 = listaAc25.filter(a => a.tipo === 'recebimento').reduce((s, a) => s + a.valor, 0);
        const saldoAcertos25 = pago25 - recebido25;

        // Saldo final 2025 (inclui acertos)
        const saldoFinal25 = saldoRodadas25 + totalAjustes25 + saldoAcertos25;

        resultados.push({
            time_id: tid,
            nome: time.nome || 'N/A',
            saldoRodadas, ganhos26, perdas26,
            totalAjustes26, saldoAcertos26, pago26, recebido26,
            saldoFinal26: +saldoFinal26.toFixed(2),
            saldoRodadas25, totalAjustes25, saldoAcertos25, pago25, recebido25,
            saldoFinal25: +saldoFinal25.toFixed(2),
            detAj26: listaAj26.map(a => `${a.valor >= 0 ? '+' : ''}${a.valor}[${a.descricao}]`),
            detAc26: listaAc26.map(a => `${a.tipo}:${a.valor}[${a.descricao}]`),
            detAj25: listaAj25.map(a => `${a.valor >= 0 ? '+' : ''}${a.valor}[${a.descricao}]`),
            detAc25: listaAc25.map(a => `${a.tipo}:${a.valor}[${a.descricao}]`)
        });
    }

    const SEP = '='.repeat(100);
    console.log(SEP);
    console.log('AUDITORIA FINANCEIRA 2026 — Liga Super Cartola');
    console.log(SEP);

    for (const r of resultados) {
        const status = r.saldoFinal26 > 0 ? 'CREDOR' : r.saldoFinal26 < 0 ? 'DEVEDOR' : 'ZERADO';
        const pfx = r.saldoFinal26 > 0 ? '>>' : r.saldoFinal26 < 0 ? '!!' : '--';
        console.log(`\n${pfx} [${r.time_id}] ${r.nome}`);
        console.log(`   Rodadas2026: ${r.saldoRodadas.toFixed(2)} (ganhos:${r.ganhos26} perdas:${r.perdas26})`);
        console.log(`   Ajustes2026: ${r.totalAjustes26.toFixed(2)} | Acertos2026: ${r.saldoAcertos26.toFixed(2)} (pago:${r.pago26} receb:${r.recebido26})`);
        console.log(`   SALDO FINAL 2026: R$${r.saldoFinal26}  [${status}]`);
        if (r.detAj26.length) console.log(`   Ajustes2026: ${r.detAj26.join(' | ')}`);
        if (r.detAc26.length) console.log(`   Acertos2026: ${r.detAc26.join(' | ')}`);
        const tem2025 = r.saldoRodadas25 || r.totalAjustes25 || r.saldoAcertos25;
        if (tem2025) {
            console.log(`   2025 | Rodadas:${r.saldoRodadas25} | Ajustes:${r.totalAjustes25} | Acertos:${r.saldoAcertos25}(pg:${r.pago25} rec:${r.recebido25}) | SALDO2025:${r.saldoFinal25}`);
            if (r.detAj25.length) console.log(`   Ajustes2025: ${r.detAj25.join(' | ')}`);
            if (r.detAc25.length) console.log(`   Acertos2025: ${r.detAc25.join(' | ')}`);
        }
    }

    console.log('\n' + SEP);
    console.log('RESUMO');
    console.log(SEP);
    const credores = resultados.filter(r => r.saldoFinal26 > 0);
    const devedores = resultados.filter(r => r.saldoFinal26 < 0);
    const zerados = resultados.filter(r => r.saldoFinal26 === 0);
    console.log(`\nCredores (a receber da liga): ${credores.length}`);
    credores.forEach(r => console.log(`  +R$${r.saldoFinal26.toFixed(2)}  ${r.nome} [${r.time_id}]`));
    console.log(`\nDevedores (devem à liga): ${devedores.length}`);
    devedores.forEach(r => console.log(`   R$${r.saldoFinal26.toFixed(2)}  ${r.nome} [${r.time_id}]`));
    console.log(`\nZerados/Sem saldo: ${zerados.length}`);
    zerados.forEach(r => console.log(`   R$0  ${r.nome} [${r.time_id}]`));
    console.log('');

    await mongoose.disconnect();
}

run().catch(e => { console.error('ERRO:', e); process.exit(1); });
