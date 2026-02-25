import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function extrato() {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    const ligaId = '684cb1c8af923da7c7df51de';
    const ligaObjId = new mongoose.Types.ObjectId(ligaId);
    const timeId = 645089;

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('📊 EXTRATO FINANCEIRO - ANTONIO LUIS (645089) - TEMPORADA 2026');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // 1. Cache
    const cache = await db.collection('extratofinanceirocaches').findOne({
        liga_id: ligaId, time_id: timeId, temporada: 2026
    });

    if (cache) {
        console.log('▓▓▓ HISTÓRICO DE TRANSAÇÕES (cache) ▓▓▓\n');
        const trans = cache.historico_transacoes || [];
        let saldo = 0;
        trans.forEach((t, i) => {
            saldo += (t.valor || 0);
            const sinal = t.valor >= 0 ? '+' : '';
            console.log(`  [${i}] R${t.rodada} | ${t.tipo.padEnd(25)} | ${sinal}R$ ${t.valor.toFixed(2).padStart(8)} | Acum: R$ ${saldo.toFixed(2).padStart(8)} | ${t.descricao || ''}`);
        });
        console.log(`\n  📌 Soma transações: R$ ${saldo.toFixed(2)}`);
        console.log(`  📌 saldo_consolidado (cache): R$ ${cache.saldo_consolidado}`);
    } else {
        console.log('❌ Sem cache 2026');
    }

    // 2. Inscrição
    console.log('\n▓▓▓ INSCRIÇÃO TEMPORADA ▓▓▓\n');
    const inscricao = await db.collection('inscricoestemporada').findOne({
        liga_id: ligaObjId, time_id: timeId, temporada: 2026
    });
    if (inscricao) {
        console.log(`  Status: ${inscricao.status}`);
        console.log(`  Taxa inscrição: R$ ${inscricao.taxa_inscricao}`);
        console.log(`  Pagou inscrição: ${inscricao.pagou_inscricao}`);
        console.log(`  Saldo transferido: R$ ${inscricao.saldo_transferido || 0}`);
        console.log(`  Dívida anterior: R$ ${inscricao.divida_anterior || 0}`);
    }

    // 3. Acertos
    console.log('\n▓▓▓ ACERTOS FINANCEIROS ▓▓▓\n');
    const acertos = await db.collection('acertofinanceiros').find({
        ligaId: ligaId, timeId: String(timeId), temporada: 2026
    }).toArray();
    
    let totalPago = 0, totalRecebido = 0;
    if (acertos.length > 0) {
        acertos.forEach((a, i) => {
            const valor = a.valor || 0;
            if (a.tipo === 'pagamento') totalPago += valor;
            else totalRecebido += valor;
            console.log(`  [${i}] ${a.tipo.padEnd(12)} | R$ ${valor.toFixed(2).padStart(8)} | ${a.descricao || ''}`);
        });
        console.log(`\n  Total pago: R$ ${totalPago.toFixed(2)}`);
        console.log(`  Total recebido: R$ ${totalRecebido.toFixed(2)}`);
        console.log(`  Saldo acertos: R$ ${(totalRecebido - totalPago).toFixed(2)}`);
    } else {
        // Try with number timeId
        const acertos2 = await db.collection('acertofinanceiros').find({
            ligaId: ligaId, timeId: timeId, temporada: 2026
        }).toArray();
        if (acertos2.length > 0) {
            acertos2.forEach((a, i) => {
                const valor = a.valor || 0;
                if (a.tipo === 'pagamento') totalPago += valor;
                else totalRecebido += valor;
                console.log(`  [${i}] ${a.tipo.padEnd(12)} | R$ ${valor.toFixed(2).padStart(8)} | ${a.descricao || ''}`);
            });
            console.log(`\n  Total pago: R$ ${totalPago.toFixed(2)}`);
            console.log(`  Total recebido: R$ ${totalRecebido.toFixed(2)}`);
            console.log(`  Saldo acertos: R$ ${(totalRecebido - totalPago).toFixed(2)}`);
        } else {
            console.log('  Nenhum acerto encontrado');
        }
    }

    // 4. Ajustes
    console.log('\n▓▓▓ AJUSTES FINANCEIROS ▓▓▓\n');
    const ajustes = await db.collection('ajustesfinanceiros').find({
        ligaId: ligaId, timeId: timeId, temporada: 2026, ativo: true
    }).toArray();
    if (ajustes.length > 0) {
        ajustes.forEach(a => console.log(`  ${a.descricao}: R$ ${a.valor}`));
    } else {
        console.log('  Nenhum ajuste ativo');
    }

    // 5. Fluxo Financeiro Campos
    console.log('\n▓▓▓ FLUXO FINANCEIRO CAMPOS ▓▓▓\n');
    const campos = await db.collection('fluxofinanceirocampos').find({
        ligaId: ligaId, timeId: String(timeId), temporada: 2026
    }).toArray();
    if (campos.length > 0) {
        campos.forEach((c, i) => {
            console.log(`  [${i}] Rodada ${c.rodada} | campo1: ${c.campo1 || 0} | campo2: ${c.campo2 || 0} | campo3: ${c.campo3 || 0} | campo4: ${c.campo4 || 0}`);
        });
    } else {
        // Try number timeId
        const campos2 = await db.collection('fluxofinanceirocampos').find({
            ligaId: ligaId, timeId: timeId, temporada: 2026
        }).toArray();
        if (campos2.length > 0) {
            campos2.forEach((c, i) => {
                console.log(`  [${i}] Rodada ${c.rodada} | campo1: ${c.campo1 || 0} | campo2: ${c.campo2 || 0} | campo3: ${c.campo3 || 0} | campo4: ${c.campo4 || 0}`);
            });
        } else {
            console.log('  Nenhum campo encontrado');
        }
    }

    // 6. CÁLCULO FINAL
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('💰 CÁLCULO FINAL DO SALDO');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const trans = cache?.historico_transacoes || [];
    
    // Separar por tipo
    const inscricaoTrans = trans.filter(t => t.tipo === 'INSCRICAO_TEMPORADA');
    const saldoAnteriorTrans = trans.filter(t => t.tipo === 'SALDO_TEMPORADA_ANTERIOR');
    const rodadaTrans = trans.filter(t => t.rodada > 0);
    
    const somaInscricao = inscricaoTrans.reduce((a, t) => a + t.valor, 0);
    const somaSaldoAnterior = saldoAnteriorTrans.reduce((a, t) => a + t.valor, 0);
    const somaRodadas = rodadaTrans.reduce((a, t) => a + t.valor, 0);
    const saldoAcertos = totalRecebido - totalPago;
    
    // Por rodada
    const rodadasMap = {};
    rodadaTrans.forEach(t => {
        if (!rodadasMap[t.rodada]) rodadasMap[t.rodada] = [];
        rodadasMap[t.rodada].push(t);
    });
    
    console.log('  BREAKDOWN POR RODADA:');
    for (const [rod, ts] of Object.entries(rodadasMap).sort((a,b) => a[0]-b[0])) {
        const total = ts.reduce((a, t) => a + t.valor, 0);
        const detalhe = ts.map(t => `${t.tipo}=${t.valor >= 0 ? '+' : ''}${t.valor}`).join(', ');
        console.log(`    R${rod}: ${total >= 0 ? '+' : ''}R$ ${total.toFixed(2)} (${detalhe})`);
    }
    
    console.log('');
    console.log(`  Inscrição:          R$ ${somaInscricao.toFixed(2)}`);
    console.log(`  Saldo anterior:     R$ ${somaSaldoAnterior.toFixed(2)}`);
    console.log(`  Rodadas (B/O + PC): R$ ${somaRodadas.toFixed(2)}`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Saldo temporada:    R$ ${(somaInscricao + somaSaldoAnterior + somaRodadas).toFixed(2)}`);
    console.log(`  Acertos:            R$ ${saldoAcertos.toFixed(2)}`);
    console.log(`  ═════════════════════════════`);
    console.log(`  SALDO FINAL:        R$ ${(somaInscricao + somaSaldoAnterior + somaRodadas + saldoAcertos).toFixed(2)}`);
    console.log('');

    await mongoose.disconnect();
}

extrato();
