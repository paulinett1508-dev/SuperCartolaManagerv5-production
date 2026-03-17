/**
 * AUDITORIA FINANCEIRA 2025 — Super Cartola
 *
 * Gera relatório HTML (pronto para PDF via Ctrl+P) da vida financeira 2025
 * de TODOS os participantes, com fichas individuais + tabela resumo.
 *
 * USO:
 *   node scripts/auditoria-financeira-2025.js
 *   → Gera: scripts/output/auditoria-financeira-2025.html
 *   → Abrir no browser e Ctrl+P para salvar como PDF
 *
 * READ-ONLY — NÃO ALTERA NENHUM DADO NO BANCO.
 *
 * @version 3.0.0
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGO_URI = process.env.MONGO_URI;
const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA_2025 = 2025;
const TEMPORADA_2026 = 2026;

function R$(v) { return `R$ ${v.toFixed(2).replace('-', '- ')}`; }
function corValor(v) { return v > 0.01 ? 'positivo' : v < -0.01 ? 'negativo' : 'zero'; }

async function main() {
    console.log('Conectando ao MongoDB...');

    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        const ligaObjId = new mongoose.Types.ObjectId(LIGA_ID);

        const liga = await db.collection('ligas').findOne({ _id: ligaObjId });
        if (!liga) { console.error('Liga nao encontrada'); process.exit(1); }
        const participantesLiga = (liga.participantes || []).filter(p => p.ativo !== false);
        const participantesMap = new Map();
        participantesLiga.forEach(p => participantesMap.set(Number(p.time_id), p));

        // Bulk load 2025
        const [caches2025, camposDocs, acertosDocs, ajustesDocs] = await Promise.all([
            db.collection('extratofinanceirocaches').find({ liga_id: LIGA_ID, temporada: TEMPORADA_2025 }).toArray(),
            db.collection('fluxofinanceirocampos').find({ liga_id: LIGA_ID, temporada: TEMPORADA_2025 }).toArray(),
            db.collection('acertofinanceiros').find({ liga_id: LIGA_ID, temporada: TEMPORADA_2025, ativo: true }).toArray(),
            db.collection('ajustesfinanceiros').find({ liga_id: LIGA_ID, temporada: TEMPORADA_2025 }).toArray(),
        ]);

        // Bulk load 2026
        const [caches2026, inscricoes2026Obj, inscricoes2026Str] = await Promise.all([
            db.collection('extratofinanceirocaches').find({ liga_id: LIGA_ID, temporada: TEMPORADA_2026 }).toArray(),
            db.collection('inscricoestemporada').find({ liga_id: ligaObjId, temporada: TEMPORADA_2026 }).toArray(),
            db.collection('inscricoestemporada').find({ liga_id: LIGA_ID, temporada: TEMPORADA_2026 }).toArray(),
        ]);

        // Index by time_id
        const cache2025Map = new Map(caches2025.map(c => [c.time_id, c]));
        const campos2025Map = new Map(camposDocs.map(c => [c.time_id, c]));
        const cache2026Map = new Map(caches2026.map(c => [c.time_id, c]));
        const inscricao2026Map = new Map();
        [...inscricoes2026Obj, ...inscricoes2026Str].forEach(i => {
            if (!inscricao2026Map.has(Number(i.time_id))) inscricao2026Map.set(Number(i.time_id), i);
        });
        const acertos2025Map = new Map();
        for (const a of acertosDocs) {
            if (!acertos2025Map.has(a.time_id)) acertos2025Map.set(a.time_id, []);
            acertos2025Map.get(a.time_id).push(a);
        }
        const ajustes2025Map = new Map();
        for (const a of ajustesDocs) {
            if (!ajustes2025Map.has(a.time_id)) ajustes2025Map.set(a.time_id, []);
            ajustes2025Map.get(a.time_id).push(a);
        }

        const allTimeIds = new Set([
            ...participantesLiga.map(p => Number(p.time_id)),
            ...caches2025.map(c => c.time_id),
            ...camposDocs.map(c => c.time_id),
            ...acertosDocs.map(a => a.time_id),
        ]);

        console.log(`Processando ${allTimeIds.size} participantes...`);

        // Build fichas
        const fichas = [];
        for (const timeId of [...allTimeIds].sort((a, b) => a - b)) {
            const p = participantesMap.get(timeId);
            const nome = p?.nome_cartola || p?.nome_cartoleiro || `ID:${timeId}`;
            const cache2025 = cache2025Map.get(timeId);
            const campos2025 = campos2025Map.get(timeId);
            const acertos2025 = acertos2025Map.get(timeId) || [];
            const ajustes2025 = ajustes2025Map.get(timeId) || [];
            const cache2026 = cache2026Map.get(timeId);
            const inscricao2026 = inscricao2026Map.get(timeId);

            const saldoExtrato = cache2025?.saldo_consolidado ?? 0;
            const ganhosExtrato = cache2025?.ganhos_consolidados ?? 0;
            const perdasExtrato = cache2025?.perdas_consolidadas ?? 0;
            let modRanking = 0, modPC = 0, modMM = 0, modTop10 = 0, modOutros = 0;
            for (const t of (cache2025?.historico_transacoes || [])) {
                modRanking += (t.bonusOnus || 0);
                modPC += (t.pontosCorridos || 0);
                modMM += (t.mataMata || 0);
                modTop10 += (t.top10 || 0);
                if (t.tipo === 'MELHOR_MES' || t.tipo === 'ARTILHEIRO' || t.tipo === 'LUVA_OURO') modOutros += (t.valor || 0);
            }

            const camposArr = campos2025?.campos || [];
            const saldoCampos = camposArr.reduce((acc, c) => acc + (c.valor || 0), 0);

            let totalPago = 0, totalRecebido = 0;
            for (const a of acertos2025) {
                if (a.tipo === 'pagamento') totalPago += (a.valor || 0);
                if (a.tipo === 'recebimento') totalRecebido += (a.valor || 0);
            }
            const saldoAcertos = totalPago - totalRecebido;
            const saldoAjustes = ajustes2025.reduce((acc, a) => acc + (a.valor || 0), 0);
            const saldoCalculado = parseFloat((saldoExtrato + saldoCampos + saldoAcertos + saldoAjustes).toFixed(2));

            const tSaldo2026 = (cache2026?.historico_transacoes || []).find(t => t.tipo === 'SALDO_TEMPORADA_ANTERIOR');

            fichas.push({
                timeId, nome,
                naLiga: participantesMap.has(timeId),
                temCache2025: cache2025 != null,
                saldoExtrato: parseFloat(saldoExtrato.toFixed(2)),
                ganhosExtrato: parseFloat(ganhosExtrato.toFixed(2)),
                perdasExtrato: parseFloat(perdasExtrato.toFixed(2)),
                modRanking: parseFloat(modRanking.toFixed(2)),
                modPC: parseFloat(modPC.toFixed(2)),
                modMM: parseFloat(modMM.toFixed(2)),
                modTop10: parseFloat(modTop10.toFixed(2)),
                modOutros: parseFloat(modOutros.toFixed(2)),
                qtdTransacoes: (cache2025?.historico_transacoes || []).length,
                ultimaRodada: cache2025?.ultima_rodada_consolidada ?? null,
                camposArr, saldoCampos: parseFloat(saldoCampos.toFixed(2)),
                acertos2025, totalPago: parseFloat(totalPago.toFixed(2)),
                totalRecebido: parseFloat(totalRecebido.toFixed(2)),
                saldoAcertos: parseFloat(saldoAcertos.toFixed(2)),
                ajustes2025, saldoAjustes: parseFloat(saldoAjustes.toFixed(2)),
                saldoCalculado,
                quitacao: cache2025?.quitacao || null,
                temInscricao2026: inscricao2026 != null,
                saldoTransferido2026: inscricao2026?.saldo_transferido ?? 0,
                dividaAnterior2026: inscricao2026?.divida_anterior ?? 0,
                inscricaoSaldoFinal: inscricao2026?.temporada_anterior?.saldo_final ?? null,
                inscricaoStatus: inscricao2026?.temporada_anterior?.status_quitacao ?? null,
                temSaldoAnteriorCache2026: tSaldo2026 != null,
                valorSaldoAnteriorCache2026: tSaldo2026?.valor ?? 0,
            });
        }

        fichas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // ═════════════════════════════════════════════════════════════════════
        // BUILD HTML
        // ═════════════════════════════════════════════════════════════════════
        const dataGeracao = new Date().toLocaleString('pt-BR');
        let somaExtrato = 0, somaCampos = 0, somaAcertos = 0, somaAjustes = 0, somaTotal = 0;
        let somaTransf = 0, somaDivida = 0;
        fichas.forEach(f => {
            somaExtrato += f.saldoExtrato; somaCampos += f.saldoCampos;
            somaAcertos += f.saldoAcertos; somaAjustes += f.saldoAjustes;
            somaTotal += f.saldoCalculado; somaTransf += f.saldoTransferido2026;
            somaDivida += f.dividaAnterior2026;
        });

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Auditoria Financeira 2025 — Super Cartola</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 20px 30px; font-size: 11px; line-height: 1.4; }

  @media print {
    body { background: #fff; color: #111; padding: 10px; font-size: 9px; }
    .ficha { break-inside: avoid; border-color: #ccc !important; background: #fff !important; }
    .ficha-header { background: #222 !important; color: #fff !important; }
    .page-break { page-break-before: always; }
    .no-print { display: none !important; }
    .saldo-box { border-color: #333 !important; }
    .resumo-table th { background: #333 !important; color: #fff !important; }
    .positivo { color: #0a0 !important; } .negativo { color: #c00 !important; }
  }

  h1 { font-size: 22px; text-align: center; color: #ff6a00; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #888; font-size: 12px; margin-bottom: 20px; }
  .stats-bar { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 24px; }
  .stat { background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 8px 14px; text-align: center; }
  .stat-num { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: #ff6a00; }
  .stat-label { font-size: 10px; color: #888; }

  /* Ficha individual */
  .ficha { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
  .ficha-header { background: #222; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ff6a00; }
  .ficha-nome { font-size: 14px; font-weight: 700; color: #fff; }
  .ficha-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #888; }
  .ficha-tag { font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
  .tag-liga { background: #1b3a1b; color: #4ade80; }
  .tag-fora { background: #3a1b1b; color: #f87171; }
  .ficha-body { padding: 10px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ficha-section { }
  .ficha-section-title { font-size: 10px; font-weight: 700; color: #ff6a00; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 2px; }
  .ficha-row { display: flex; justify-content: space-between; padding: 1px 0; }
  .ficha-row-label { color: #999; }
  .ficha-row-value { font-family: 'JetBrains Mono', monospace; font-weight: 500; }
  .positivo { color: #4ade80; } .negativo { color: #f87171; } .zero { color: #888; }

  .saldo-box { margin: 0 14px 10px; padding: 8px 14px; border: 2px solid #ff6a00; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
  .saldo-label { font-size: 11px; font-weight: 700; color: #ff6a00; }
  .saldo-value { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; }
  .saldo-formula { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #666; margin: 0 14px 10px; }

  .acerto-item { font-size: 10px; color: #bbb; padding: 1px 0; }
  .acerto-tipo { font-weight: 600; text-transform: uppercase; font-size: 9px; }
  .acerto-tipo.pagamento { color: #4ade80; } .acerto-tipo.recebimento { color: #f87171; }

  /* Tabela resumo */
  .resumo-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10px; }
  .resumo-table th { background: #ff6a00; color: #000; padding: 6px 8px; font-weight: 700; text-align: right; white-space: nowrap; }
  .resumo-table th:first-child { text-align: left; }
  .resumo-table td { padding: 4px 8px; border-bottom: 1px solid #2a2a2a; font-family: 'JetBrains Mono', monospace; text-align: right; white-space: nowrap; }
  .resumo-table td:first-child { font-family: 'Inter', sans-serif; text-align: left; font-weight: 500; }
  .resumo-table tr:hover { background: #222; }
  .resumo-table .total-row td { border-top: 2px solid #ff6a00; font-weight: 700; background: #1a1a1a; }

  .section-title { font-size: 16px; font-weight: 700; color: #ff6a00; margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #333; }
  .footer { text-align: center; color: #555; font-size: 9px; margin-top: 30px; padding-top: 10px; border-top: 1px solid #333; }
</style>
</head>
<body>

<h1>AUDITORIA FINANCEIRA 2025</h1>
<div class="subtitle">Liga Super Cartola &mdash; ${dataGeracao}</div>

<div class="stats-bar">
  <div class="stat"><div class="stat-num">${fichas.length}</div><div class="stat-label">Participantes</div></div>
  <div class="stat"><div class="stat-num">${fichas.filter(f => f.temCache2025).length}</div><div class="stat-label">Com Extrato Cache</div></div>
  <div class="stat"><div class="stat-num">${fichas.filter(f => f.camposArr.length > 0 && f.saldoCampos !== 0).length}</div><div class="stat-label">Com Campos Manuais</div></div>
  <div class="stat"><div class="stat-num">${fichas.filter(f => f.acertos2025.length > 0).length}</div><div class="stat-label">Com Acertos</div></div>
  <div class="stat"><div class="stat-num">${fichas.filter(f => !f.naLiga).length}</div><div class="stat-label">Fora da Liga</div></div>
</div>

<!-- ═══════════════ TABELA RESUMO ═══════════════ -->
<div class="section-title">Tabela Resumo</div>
<table class="resumo-table">
<thead>
  <tr>
    <th style="text-align:left">Participante</th>
    <th>Extrato</th>
    <th>Campos</th>
    <th>Acertos</th>
    <th>Ajustes</th>
    <th style="border-left:2px solid #000">SALDO 2025</th>
    <th style="border-left:2px solid #000">Inscr. 2026</th>
    <th>Div. 2026</th>
  </tr>
</thead>
<tbody>
${fichas.map(f => `  <tr>
    <td>${f.nome}${f.naLiga ? '' : ' <span style="color:#f87171;font-size:9px">[FORA]</span>'}</td>
    <td class="${corValor(f.saldoExtrato)}">${f.saldoExtrato.toFixed(2)}</td>
    <td class="${corValor(f.saldoCampos)}">${f.saldoCampos.toFixed(2)}</td>
    <td class="${corValor(f.saldoAcertos)}">${f.saldoAcertos.toFixed(2)}</td>
    <td class="${corValor(f.saldoAjustes)}">${f.saldoAjustes.toFixed(2)}</td>
    <td class="${corValor(f.saldoCalculado)}" style="border-left:2px solid #333;font-weight:700">${f.saldoCalculado.toFixed(2)}</td>
    <td class="${corValor(f.saldoTransferido2026)}" style="border-left:2px solid #333">${f.saldoTransferido2026.toFixed(2)}</td>
    <td class="${corValor(-f.dividaAnterior2026)}">${f.dividaAnterior2026.toFixed(2)}</td>
  </tr>`).join('\n')}
  <tr class="total-row">
    <td>TOTAIS</td>
    <td>${somaExtrato.toFixed(2)}</td>
    <td>${somaCampos.toFixed(2)}</td>
    <td>${somaAcertos.toFixed(2)}</td>
    <td>${somaAjustes.toFixed(2)}</td>
    <td style="border-left:2px solid #333">${somaTotal.toFixed(2)}</td>
    <td style="border-left:2px solid #333">${somaTransf.toFixed(2)}</td>
    <td>${somaDivida.toFixed(2)}</td>
  </tr>
</tbody>
</table>

<!-- ═══════════════ FICHAS INDIVIDUAIS ═══════════════ -->
<div class="section-title page-break">Fichas Individuais</div>

${fichas.map(f => {
    const camposAtivos = f.camposArr.filter(c => c.valor !== 0);
    return `
<div class="ficha">
  <div class="ficha-header">
    <div>
      <span class="ficha-nome">${f.nome}</span>
      <span class="ficha-id">time_id: ${f.timeId}</span>
    </div>
    <span class="ficha-tag ${f.naLiga ? 'tag-liga' : 'tag-fora'}">${f.naLiga ? 'NA LIGA' : 'FORA DA LIGA'}</span>
  </div>

  <div class="ficha-body">
    <!-- Coluna esquerda: dados 2025 -->
    <div class="ficha-section">
      <div class="ficha-section-title">Extrato Cache 2025</div>
      ${f.temCache2025 ? `
        <div class="ficha-row"><span class="ficha-row-label">Saldo consolidado</span><span class="ficha-row-value ${corValor(f.saldoExtrato)}">${R$(f.saldoExtrato)}</span></div>
        <div class="ficha-row"><span class="ficha-row-label">Ganhos / Perdas</span><span class="ficha-row-value"><span class="positivo">+${f.ganhosExtrato.toFixed(2)}</span> / <span class="negativo">${f.perdasExtrato.toFixed(2)}</span></span></div>
        <div class="ficha-row"><span class="ficha-row-label">Ranking</span><span class="ficha-row-value ${corValor(f.modRanking)}">${f.modRanking.toFixed(2)}</span></div>
        <div class="ficha-row"><span class="ficha-row-label">Pontos Corridos</span><span class="ficha-row-value ${corValor(f.modPC)}">${f.modPC.toFixed(2)}</span></div>
        <div class="ficha-row"><span class="ficha-row-label">Mata-Mata</span><span class="ficha-row-value ${corValor(f.modMM)}">${f.modMM.toFixed(2)}</span></div>
        <div class="ficha-row"><span class="ficha-row-label">Top 10</span><span class="ficha-row-value ${corValor(f.modTop10)}">${f.modTop10.toFixed(2)}</span></div>
        ${f.modOutros ? `<div class="ficha-row"><span class="ficha-row-label">Outros</span><span class="ficha-row-value ${corValor(f.modOutros)}">${f.modOutros.toFixed(2)}</span></div>` : ''}
        <div class="ficha-row"><span class="ficha-row-label">Transacoes / Ult. rodada</span><span class="ficha-row-value">${f.qtdTransacoes} / R${f.ultimaRodada ?? '?'}</span></div>
      ` : '<div style="color:#666;font-style:italic">Nao existe</div>'}

      <div class="ficha-section-title" style="margin-top:8px">Campos Manuais 2025</div>
      ${camposAtivos.length > 0 ? camposAtivos.map(c =>
        `<div class="ficha-row"><span class="ficha-row-label">${c.nome || 'Sem nome'}</span><span class="ficha-row-value ${corValor(c.valor)}">${R$(c.valor || 0)}</span></div>`
      ).join('') : '<div style="color:#666;font-style:italic">Nenhum</div>'}
    </div>

    <!-- Coluna direita: acertos + migracao -->
    <div class="ficha-section">
      <div class="ficha-section-title">Acertos 2025</div>
      ${f.acertos2025.length > 0 ? `
        <div class="ficha-row"><span class="ficha-row-label">Pago</span><span class="ficha-row-value positivo">+${f.totalPago.toFixed(2)}</span></div>
        <div class="ficha-row"><span class="ficha-row-label">Recebido</span><span class="ficha-row-value negativo">-${f.totalRecebido.toFixed(2)}</span></div>
        ${f.acertos2025.map(a => {
          const data = a.dataAcerto ? new Date(a.dataAcerto).toLocaleDateString('pt-BR') : '';
          return `<div class="acerto-item"><span class="acerto-tipo ${a.tipo}">${a.tipo}</span> ${R$(a.valor || 0)} &mdash; ${a.descricao || ''} <span style="color:#555">(${data}${a.metodoPagamento ? ', ' + a.metodoPagamento : ''})</span></div>`;
        }).join('')}
      ` : '<div style="color:#666;font-style:italic">Nenhum</div>'}

      <div class="ficha-section-title" style="margin-top:8px">Migracao 2026</div>
      ${f.temInscricao2026 ? `
        <div class="ficha-row"><span class="ficha-row-label">Saldo transferido</span><span class="ficha-row-value ${corValor(f.saldoTransferido2026)}">${R$(f.saldoTransferido2026)}</span></div>
        <div class="ficha-row"><span class="ficha-row-label">Divida anterior</span><span class="ficha-row-value ${corValor(-f.dividaAnterior2026)}">${R$(f.dividaAnterior2026)}</span></div>
        ${f.inscricaoSaldoFinal != null ? `<div class="ficha-row"><span class="ficha-row-label">Saldo final registrado</span><span class="ficha-row-value ${corValor(f.inscricaoSaldoFinal)}">${R$(f.inscricaoSaldoFinal)}</span></div>` : ''}
        ${f.inscricaoStatus ? `<div class="ficha-row"><span class="ficha-row-label">Status</span><span class="ficha-row-value">${f.inscricaoStatus}</span></div>` : ''}
      ` : '<div style="color:#666;font-style:italic">Sem InscricaoTemporada</div>'}
    </div>
  </div>

  <div class="saldo-box">
    <span class="saldo-label">SALDO CALCULADO 2025</span>
    <span class="saldo-value ${corValor(f.saldoCalculado)}">${R$(f.saldoCalculado)}</span>
  </div>
  <div class="saldo-formula">= extrato(${f.saldoExtrato.toFixed(2)}) + campos(${f.saldoCampos.toFixed(2)}) + acertos(${f.saldoAcertos.toFixed(2)}) + ajustes(${f.saldoAjustes.toFixed(2)})</div>
</div>`;
}).join('\n')}

<div class="footer">
  Super Cartola Manager &mdash; Auditoria Financeira 2025 &mdash; ${dataGeracao} &mdash; ${fichas.length} participantes
</div>

</body>
</html>`;

        // Write HTML
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'auditoria-financeira-2025.html');
        fs.writeFileSync(outputPath, html, 'utf-8');

        console.log(`\nRelatorio gerado: ${outputPath}`);
        console.log(`Abra no browser e Ctrl+P para salvar como PDF.`);

    } catch (error) {
        console.error('Erro fatal:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

main();
