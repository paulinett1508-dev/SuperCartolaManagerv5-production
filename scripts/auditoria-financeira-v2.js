/**
 * Auditoria Financeira v2 — Liga Super Cartola
 * Liga: 684cb1c8af923da7c7df51de
 *
 * Mostra para cada participante:
 * - saldo_consolidado (rodadas; para alguns inclui inscricao/transfer no historico)
 * - inscricao já no cache? (INSCRICAO_TEMPORADA no historico_transacoes)
 * - saldo_anterior no cache? (SALDO_TEMPORADA_ANTERIOR no historico)
 * - ajustes existentes (inscrição manual ou outros)
 * - acertos (pagamentos/recebimentos)
 * - SALDO CORRIGIDO ESTIMADO = saldo_consolidado + ajuste_inscricao_faltante + acertos
 *
 * Fórmula correta:
 *   saldoFinal = saldo_consolidado
 *              + (se inscrição NÃO no cache E NÃO tem ajuste inscricao) → -180
 *              + totalAjustes2026
 *              + saldoAcertos2026
 *
 * Uso: node scripts/auditoria-financeira-v2.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID = '684cb1c8af923da7c7df51de';
const TAXA_INSCRICAO = 180;

// Palavras-chave que indicam ajuste de inscrição
const INSCRICAO_KEYWORDS = ['inscri', 'taxa', 'mensalidade', 'entrada', 'restante inscri'];

function isAjusteInscricao(descricao = '') {
    const d = descricao.toLowerCase();
    return INSCRICAO_KEYWORDS.some(k => d.includes(k));
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    console.log('MongoDB conectado\n');

    const times = await db.collection('times').find({
        liga_id: LIGA_ID, temporada: 2026, ativo: true
    }).sort({ nome: 1 }).toArray();
    console.log(`Participantes ativos 2026: ${times.length}\n`);

    // Carregar todos os dados de uma vez
    const extratos26 = await db.collection('extratofinanceirocaches').find({ liga_id: LIGA_ID, temporada: 2026 }).toArray();
    const ex26 = {};
    extratos26.forEach(e => { ex26[e.time_id] = e; });

    const aj26all = await db.collection('ajustesfinanceiros').find({ liga_id: LIGA_ID, temporada: 2026, ativo: true }).toArray();
    const aj26 = {};
    aj26all.forEach(a => { if (!aj26[a.time_id]) aj26[a.time_id] = []; aj26[a.time_id].push(a); });

    const ac26all = await db.collection('acertofinanceiros').find({ liga_id: LIGA_ID, temporada: 2026, ativo: true }).toArray();
    const ac26 = {};
    ac26all.forEach(a => { if (!ac26[a.time_id]) ac26[a.time_id] = []; ac26[a.time_id].push(a); });

    const resultados = [];

    for (const time of times) {
        const tid = time.id;
        const nome = time.nome || 'N/A';

        const extrato = ex26[tid] || {};
        const saldoConsolidado = extrato.saldo_consolidado || 0;
        const historico = extrato.historico_transacoes || [];

        // Verificar se inscrição e saldo anterior já estão no cache
        const inscricaoNoCache = historico.some(t => t.tipo === 'INSCRICAO_TEMPORADA');
        const saldoAnteriorNoCache = historico.some(t => t.tipo === 'SALDO_TEMPORADA_ANTERIOR');
        const tInscricaoCache = historico.find(t => t.tipo === 'INSCRICAO_TEMPORADA');
        const tSaldoAnteriorCache = historico.find(t => t.tipo === 'SALDO_TEMPORADA_ANTERIOR');

        // Ajustes existentes
        const listaAj = aj26[tid] || [];
        const totalAjustes = listaAj.reduce((s, a) => s + (a.valor || 0), 0);
        const ajusteInscricaoExistente = listaAj.filter(a => isAjusteInscricao(a.descricao));
        const totalAjusteInscricao = ajusteInscricaoExistente.reduce((s, a) => s + a.valor, 0);
        const ajustesOutros = listaAj.filter(a => !isAjusteInscricao(a.descricao));

        // Acertos
        const listaAc = ac26[tid] || [];
        const totalPago = listaAc.filter(a => a.tipo === 'pagamento').reduce((s, a) => s + a.valor, 0);
        const totalRecebido = listaAc.filter(a => a.tipo === 'recebimento').reduce((s, a) => s + a.valor, 0);
        const saldoAcertos = totalPago - totalRecebido;

        // Determinar se inscrição está contabilizada
        const inscricaoContabilizada =
            inscricaoNoCache ||
            ajusteInscricaoExistente.length > 0;

        // Ajuste de inscrição faltante (se não contabilizada)
        const ajusteInscricaoFaltante = inscricaoContabilizada ? 0 : -TAXA_INSCRICAO;

        // Saldo corrigido estimado
        const saldoCorrigido = saldoConsolidado + ajusteInscricaoFaltante + totalAjustes + saldoAcertos;

        // Status
        const status = saldoCorrigido > 0.01 ? 'CREDOR' : saldoCorrigido < -0.01 ? 'DEVEDOR' : 'ZERADO';
        const pfx = saldoCorrigido > 0.01 ? '>>' : saldoCorrigido < -0.01 ? '!!' : '--';

        resultados.push({
            time_id: tid, nome, pfx, status,
            saldoConsolidado,
            inscricaoNoCache, saldoAnteriorNoCache,
            tInscricaoCache, tSaldoAnteriorCache,
            listaAj, totalAjustes, ajusteInscricaoExistente, ajustesOutros,
            listaAc, totalPago, totalRecebido, saldoAcertos,
            inscricaoContabilizada, ajusteInscricaoFaltante,
            saldoCorrigido: +saldoCorrigido.toFixed(2),
            // Sistema atual (sem correção)
            saldoAtual: +(saldoConsolidado + totalAjustes + saldoAcertos).toFixed(2)
        });
    }

    const SEP = '='.repeat(110);
    console.log(SEP);
    console.log('AUDITORIA FINANCEIRA v2 — Liga Super Cartola (com diagnóstico de inscrição)');
    console.log(SEP);

    for (const r of resultados) {
        console.log(`\n${r.pfx} [${r.time_id}] ${r.nome}`);
        console.log(`   saldo_consolidado: R$${r.saldoConsolidado.toFixed(2)}`);

        if (r.inscricaoNoCache) {
            console.log(`   [OK] Inscrição no cache: ${r.tInscricaoCache.valor} (já deduzida no saldo_consolidado)`);
        }
        if (r.saldoAnteriorNoCache) {
            console.log(`   [OK] Saldo anterior no cache: ${r.tSaldoAnteriorCache.valor}`);
        }

        if (r.listaAj.length) {
            r.ajusteInscricaoExistente.forEach(a => console.log(`   [AJ-INSCRICAO] ${a.valor >= 0 ? '+' : ''}${a.valor} — ${a.descricao}`));
            r.ajustesOutros.forEach(a => console.log(`   [AJ-OUTRO] ${a.valor >= 0 ? '+' : ''}${a.valor} — ${a.descricao}`));
        }

        if (r.listaAc.length) {
            r.listaAc.forEach(a => console.log(`   [ACERTO] ${a.tipo}:${a.valor} — ${a.descricao}`));
        }

        if (!r.inscricaoContabilizada) {
            console.log(`   [FALTA] ajuste inscrição: -${TAXA_INSCRICAO} (não contabilizado)`);
        }

        console.log(`   Sistema atual: R$${r.saldoAtual.toFixed(2)}  →  Corrigido (com -180 inscricao): R$${r.saldoCorrigido.toFixed(2)}  [${r.status}]`);
    }

    console.log('\n' + SEP);
    console.log('RESUMO — SALDO CORRIGIDO (inscrição -180 aplicada onde faltava)');
    console.log(SEP);

    const semInscricao = resultados.filter(r => !r.inscricaoContabilizada);
    console.log(`\nParticipantes SEM inscrição contabilizada (precisam ajuste): ${semInscricao.length}`);
    semInscricao.forEach(r => {
        const pagouTotal = r.totalPago;
        const pagouMsg = pagouTotal > 0 ? ` | pagou ${pagouTotal} (acerto)` : '';
        console.log(`  [${r.time_id}] ${r.nome}${pagouMsg} → ajuste faltante: ${-TAXA_INSCRICAO}`);
    });

    const comInscricao = resultados.filter(r => r.inscricaoContabilizada);
    console.log(`\nParticipantes COM inscrição já contabilizada: ${comInscricao.length}`);
    comInscricao.forEach(r => {
        if (r.inscricaoNoCache) console.log(`  [${r.time_id}] ${r.nome} — via historico_transacoes`);
        else console.log(`  [${r.time_id}] ${r.nome} — via ajustefinanceiro (${r.ajusteInscricaoExistente.map(a => a.valor).join(', ')})`);
    });

    console.log('\n' + SEP);
    console.log('POSIÇÃO FINANCEIRA CORRIGIDA — todos os 35');
    console.log(SEP);
    const credores = resultados.filter(r => r.saldoCorrigido > 0.01);
    const devedores = resultados.filter(r => r.saldoCorrigido < -0.01);
    const zerados = resultados.filter(r => Math.abs(r.saldoCorrigido) <= 0.01);
    console.log(`\n>> Credores (${credores.length}):`);
    credores.forEach(r => console.log(`  +R$${r.saldoCorrigido.toFixed(2)}  ${r.nome} [${r.time_id}]`));
    console.log(`\n!! Devedores (${devedores.length}):`);
    devedores.forEach(r => console.log(`   R$${r.saldoCorrigido.toFixed(2)}  ${r.nome} [${r.time_id}]`));
    console.log(`\n-- Zerados (${zerados.length}):`);
    zerados.forEach(r => console.log(`   ${r.nome}`));
    console.log('');

    await mongoose.disconnect();
}

run().catch(e => { console.error('ERRO:', e); process.exit(1); });
