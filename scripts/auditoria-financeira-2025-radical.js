/**
 * AUDITORIA FINANCEIRA 2025 RADICAL — Super Cartola
 *
 * Relatório exaustivo e assertivo de TODA a vida financeira 2025 de cada
 * participante da Liga Super Cartola. Fontes:
 *   • extratofinanceirocaches  (historico_transacoes — 38 rodadas + entradas especiais)
 *   • fluxofinanceirocampos    (4 campos manuais legados)
 *   • acertofinanceiros        (pagamentos / recebimentos)
 *   • ajustesfinanceiros       (ajustes manuais admin)
 *   • inscricoestemporada      (snapshot saldo_final 2025 registrado na virada)
 *
 * Gera HTML auto-contido, otimizado para impressão em PDF (Ctrl+P).
 * READ-ONLY — NÃO ALTERA NENHUM DADO NO BANCO.
 *
 * Uso:
 *   node scripts/auditoria-financeira-2025-radical.js
 *   → Gera: scripts/output/auditoria-financeira-2025-radical.html
 *
 * @version 1.0.0
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA = 2025;
const TOTAL_RODADAS = 38;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(v) {
    const n = Number(v) || 0;
    const abs = Math.abs(n).toFixed(2);
    return n >= 0 ? `R$ ${abs}` : `- R$ ${abs}`;
}

function fmtNum(v) {
    const n = Number(v) || 0;
    return (n >= 0 ? '+' : '') + n.toFixed(2);
}

function corClass(v) {
    const n = Number(v) || 0;
    if (n > 0.005) return 'pos';
    if (n < -0.005) return 'neg';
    return 'zer';
}

function fmtData(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR');
}

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🔍 Auditoria Financeira 2025 Radical — Super Cartola');
    console.log('='.repeat(60));

    try {
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const ligaObjId = new mongoose.Types.ObjectId(LIGA_ID);

        // ─── Carga em paralelo ───────────────────────────────────────────────
        console.log('📡 Carregando dados do MongoDB...');

        const [
            extratos,
            camposDocs,
            acertosDocs,
            ajustesDocs,
            liga,
            inscr2026Obj,
            inscr2026Str,
        ] = await Promise.all([
            db.collection('extratofinanceirocaches')
                .find({ liga_id: LIGA_ID, temporada: TEMPORADA })
                .toArray(),
            db.collection('fluxofinanceirocampos')
                .find({ liga_id: LIGA_ID, temporada: TEMPORADA })
                .toArray(),
            db.collection('acertofinanceiros')
                .find({ liga_id: LIGA_ID, temporada: TEMPORADA, ativo: { $ne: false } })
                .toArray(),
            db.collection('ajustesfinanceiros')
                .find({ liga_id: LIGA_ID, temporada: TEMPORADA })
                .toArray(),
            db.collection('ligas').findOne({ _id: ligaObjId }),
            db.collection('inscricoestemporada')
                .find({ liga_id: ligaObjId, temporada: 2026 })
                .toArray(),
            db.collection('inscricoestemporada')
                .find({ liga_id: LIGA_ID, temporada: 2026 })
                .toArray(),
        ]);

        if (!liga) { console.error('Liga não encontrada.'); process.exit(1); }

        // Participantes da liga
        const participantesMap = new Map();
        for (const p of (liga.participantes || [])) {
            participantesMap.set(Number(p.time_id), p);
        }

        // ─── Indexar por time_id ─────────────────────────────────────────────
        const extratoMap = new Map(extratos.map(e => [e.time_id, e]));
        const camposMap = new Map(camposDocs.map(c => [c.time_id, c]));

        const acertosMap = new Map();
        for (const a of acertosDocs) {
            if (!acertosMap.has(a.time_id)) acertosMap.set(a.time_id, []);
            acertosMap.get(a.time_id).push(a);
        }

        const ajustesMap = new Map();
        for (const a of ajustesDocs) {
            if (!ajustesMap.has(a.time_id)) ajustesMap.set(a.time_id, []);
            ajustesMap.get(a.time_id).push(a);
        }

        // InscricaoTemporada 2026 (snapshot do saldo_final 2025)
        const inscr2026Map = new Map();
        for (const i of [...inscr2026Obj, ...inscr2026Str]) {
            if (!inscr2026Map.has(Number(i.time_id))) {
                inscr2026Map.set(Number(i.time_id), i);
            }
        }

        // ─── Universo de participantes ───────────────────────────────────────
        const allIds = new Set([
            ...[...participantesMap.keys()],
            ...extratos.map(e => e.time_id),
            ...camposDocs.map(c => c.time_id),
            ...acertosDocs.map(a => a.time_id),
            ...ajustesDocs.map(a => a.time_id),
        ]);

        console.log(`👥 Participantes a auditar: ${allIds.size}`);

        // ─── Construir ficha de cada participante ────────────────────────────
        const fichas = [];

        for (const timeId of [...allIds].sort((a, b) => a - b)) {
            const p = participantesMap.get(timeId);
            const nome = p?.nome_cartola || p?.nome_cartoleiro || `ID:${timeId}`;
            const extrato = extratoMap.get(timeId);
            const campos = camposMap.get(timeId);
            const acertos = acertosMap.get(timeId) || [];
            const ajustes = ajustesMap.get(timeId) || [];
            const inscr = inscr2026Map.get(timeId);

            // ── Análise das 38 rodadas ──────────────────────────────────────
            const rodadasInfo = [];
            let saldoAcum = 0;
            let totalRanking = 0, totalPC = 0, totalMM = 0, totalTop10 = 0;
            let rodadasVazias = [];
            let saldoExtrato = 0;

            if (extrato) {
                const hist = extrato.historico_transacoes || [];

                // Índice de entries consolidadas por rodada (tipo===undefined ou tipo==='RODADA')
                const rodadaEntries = new Map();
                for (const t of hist) {
                    if (t.rodada != null && t.rodada > 0) {
                        // Entry consolidada: tem campos bonusOnus, pontosCorridos, etc.
                        if (t.tipo === undefined || t.tipo === null) {
                            rodadaEntries.set(t.rodada, t);
                        }
                    }
                }

                // Acumular Top10 via entries tipadas (MITO/MICO)
                const top10ByRodada = new Map();
                for (const t of hist) {
                    if ((t.tipo === 'MITO' || t.tipo === 'MICO') && t.rodada != null) {
                        const cur = top10ByRodada.get(t.rodada) || 0;
                        top10ByRodada.set(t.rodada, cur + (t.valor || 0));
                    }
                }

                // Acumular MataMata via entries tipadas quando não consolidado
                const mmByRodada = new Map();
                for (const t of hist) {
                    if (t.tipo === 'MATA_MATA' && t.rodada != null) {
                        const cur = mmByRodada.get(t.rodada) || 0;
                        mmByRodada.set(t.rodada, cur + (t.valor || 0));
                    }
                }

                for (let r = 1; r <= TOTAL_RODADAS; r++) {
                    const entry = rodadaEntries.get(r);
                    let ranking = 0, pc = 0, mm = 0, top10 = 0, posicao = null, subtotal = 0;

                    if (entry) {
                        ranking = entry.bonusOnus || 0;
                        pc = entry.pontosCorridos || 0;
                        mm = entry.mataMata || 0;
                        top10 = entry.top10 || 0;
                        posicao = entry.posicao || null;
                        subtotal = entry.saldo || (ranking + pc + mm + top10);
                    }

                    // Complementar com entries tipadas se houver
                    if (!mm && mmByRodada.has(r)) mm = mmByRodada.get(r);
                    if (!top10 && top10ByRodada.has(r)) top10 = top10ByRodada.get(r);

                    saldoAcum += subtotal;

                    const vazia = !entry && !mmByRodada.has(r) && !top10ByRodada.has(r);
                    if (vazia) rodadasVazias.push(r);

                    totalRanking += ranking;
                    totalPC += pc;
                    totalMM += mm;
                    totalTop10 += top10;

                    rodadasInfo.push({ r, posicao, ranking, pc, mm, top10, subtotal, saldoAcum, vazia });
                }

                saldoExtrato = extrato.saldo_consolidado || 0;
            } else {
                // Sem cache: todas rodadas vazias
                for (let r = 1; r <= TOTAL_RODADAS; r++) {
                    rodadasVazias.push(r);
                    rodadasInfo.push({ r, posicao: null, ranking: 0, pc: 0, mm: 0, top10: 0, subtotal: 0, saldoAcum: 0, vazia: true });
                }
            }

            // ── Campos manuais ───────────────────────────────────────────────
            const camposArr = campos?.campos || [];
            const saldoCampos = camposArr.reduce((acc, c) => acc + (c.valor || 0), 0);

            // ── Acertos ──────────────────────────────────────────────────────
            let totalPago = 0, totalRecebido = 0;
            for (const a of acertos) {
                if (a.tipo === 'pagamento') totalPago += (a.valor || 0);
                else if (a.tipo === 'recebimento') totalRecebido += (a.valor || 0);
            }
            const saldoAcertos = totalPago - totalRecebido;

            // ── Ajustes ──────────────────────────────────────────────────────
            const saldoAjustes = ajustes.reduce((acc, a) => acc + (a.valor || 0), 0);

            // ── Saldo calculado ───────────────────────────────────────────────
            const saldoCalculado = parseFloat((saldoExtrato + saldoCampos + saldoAcertos + saldoAjustes).toFixed(2));

            // ── Snapshot InscricaoTemporada ───────────────────────────────────
            const saldoFinalRegistrado = inscr?.temporada_anterior?.saldo_final ?? null;
            const divergencia = saldoFinalRegistrado != null
                ? Math.abs(saldoCalculado - saldoFinalRegistrado)
                : null;

            // ── Flags de integridade ──────────────────────────────────────────
            const flags = [];
            if (!extrato) flags.push({ tipo: 'erro', msg: 'Sem cache 2025' });
            else if ((extrato.ultima_rodada_consolidada || 0) < TOTAL_RODADAS) {
                flags.push({ tipo: 'aviso', msg: `Cache incompleto (R${extrato.ultima_rodada_consolidada || 0}/${TOTAL_RODADAS})` });
            }
            if (rodadasVazias.length > 0) {
                flags.push({ tipo: 'aviso', msg: `${rodadasVazias.length} rodada(s) sem dados: R${rodadasVazias.slice(0, 5).join(', R')}${rodadasVazias.length > 5 ? '...' : ''}` });
            }
            if (divergencia != null && divergencia > 0.10) {
                flags.push({ tipo: 'erro', msg: `Divergência de saldo: calculado=${fmtBRL(saldoCalculado)} vs registrado=${fmtBRL(saldoFinalRegistrado)} (dif=${fmtBRL(divergencia)})` });
            }

            fichas.push({
                timeId,
                nome,
                naLiga: participantesMap.has(timeId),
                temCache: !!extrato,
                ultimaRodadaConsolidada: extrato?.ultima_rodada_consolidada ?? null,
                rodadasInfo,
                rodadasVazias,
                historico: extrato?.historico_transacoes || [],
                totalRanking: parseFloat(totalRanking.toFixed(2)),
                totalPC: parseFloat(totalPC.toFixed(2)),
                totalMM: parseFloat(totalMM.toFixed(2)),
                totalTop10: parseFloat(totalTop10.toFixed(2)),
                saldoExtrato: parseFloat(saldoExtrato.toFixed(2)),
                ganhosExtrato: parseFloat((extrato?.ganhos_consolidados || 0).toFixed(2)),
                perdasExtrato: parseFloat((extrato?.perdas_consolidadas || 0).toFixed(2)),
                camposArr,
                saldoCampos: parseFloat(saldoCampos.toFixed(2)),
                acertos,
                totalPago: parseFloat(totalPago.toFixed(2)),
                totalRecebido: parseFloat(totalRecebido.toFixed(2)),
                saldoAcertos: parseFloat(saldoAcertos.toFixed(2)),
                ajustes,
                saldoAjustes: parseFloat(saldoAjustes.toFixed(2)),
                saldoCalculado,
                saldoFinalRegistrado,
                divergencia,
                inscr,
                flags,
                quitacao: extrato?.quitacao || null,
            });
        }

        // Ordenar por nome para o PDF; separado: ranking por saldo para tabela resumo
        const fichasNome = [...fichas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const fichasSaldo = [...fichas].sort((a, b) => b.saldoCalculado - a.saldoCalculado);

        // ─── Stats gerais ────────────────────────────────────────────────────
        const totalParticipantes = fichas.length;
        const comCache = fichas.filter(f => f.temCache).length;
        const cacheCompleto = fichas.filter(f => f.ultimaRodadaConsolidada >= TOTAL_RODADAS).length;
        const comCampos = fichas.filter(f => f.camposArr.some(c => c.valor !== 0)).length;
        const comAcertos = fichas.filter(f => f.acertos.length > 0).length;
        const comAjustes = fichas.filter(f => f.ajustes.length > 0).length;
        const totalDivergencias = fichas.filter(f => f.flags.some(fl => fl.tipo === 'erro')).length;
        const somaTotal = fichas.reduce((acc, f) => acc + f.saldoCalculado, 0);

        const dataGeracao = new Date().toLocaleString('pt-BR');
        console.log('🖨  Gerando HTML...');

        // ─────────────────────────────────────────────────────────────────────
        // HTML
        // ─────────────────────────────────────────────────────────────────────

        const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#e0e0e0;padding:20px 28px;font-size:11px;line-height:1.45}

/* PRINT */
@media print{
  body{background:#fff;color:#111;padding:8px;font-size:8.5px}
  .ficha{break-inside:avoid;border-color:#ccc!important;background:#fff!important}
  .ficha-hdr{background:#1a1a1a!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page-break{page-break-before:always}
  .no-print{display:none!important}
  .pos{color:#1a7a1a!important}.neg{color:#c00!important}.zer{color:#666!important}
  .saldo-box{border-color:#333!important}
  th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .resumo-tbl th{background:#333!important;color:#fff!important}
  .rodadas-tbl{font-size:7.5px!important}
  .rodadas-tbl td,.rodadas-tbl th{padding:1px 3px!important}
}

/* CORES */
.pos{color:#4ade80}.neg{color:#f87171}.zer{color:#666}

/* TÍTULOS */
h1{font-size:22px;text-align:center;color:#ff6a00;margin-bottom:3px}
.subtitle{text-align:center;color:#777;font-size:11.5px;margin-bottom:20px}
.sec-title{font-size:15px;font-weight:700;color:#ff6a00;margin:28px 0 10px;padding-bottom:5px;border-bottom:2px solid #333}

/* STATS BAR */
.stats-bar{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:22px}
.stat{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:8px 14px;text-align:center;min-width:90px}
.stat-num{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:#ff6a00}
.stat-lbl{font-size:9.5px;color:#888;margin-top:1px}

/* TABELA RESUMO */
.resumo-tbl{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px}
.resumo-tbl th{background:#ff6a00;color:#000;padding:5px 7px;font-weight:700;text-align:right;white-space:nowrap}
.resumo-tbl th:first-child{text-align:left}
.resumo-tbl td{padding:3px 7px;border-bottom:1px solid #222;font-family:'JetBrains Mono',monospace;text-align:right;white-space:nowrap}
.resumo-tbl td:first-child{font-family:'Inter',sans-serif;text-align:left;font-weight:500;white-space:normal}
.resumo-tbl tr:hover{background:#1e1e1e}
.resumo-tbl .tot-row td{border-top:2px solid #ff6a00;font-weight:700;background:#1a1a1a}
.rank-num{display:inline-block;width:18px;text-align:right;color:#888;font-size:9px;margin-right:4px}
.flag-badge{font-size:8px;padding:1px 4px;border-radius:3px;vertical-align:middle;margin-left:3px}
.flag-aviso{background:#3a2d00;color:#fbbf24}
.flag-erro{background:#3a0000;color:#f87171}
.flag-ok{background:#0a2a0a;color:#4ade80}

/* FICHAS */
.ficha{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:16px;overflow:hidden}
.ficha-hdr{background:#222;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #ff6a00}
.ficha-nome{font-size:14px;font-weight:700;color:#fff}
.ficha-meta{font-family:'JetBrains Mono',monospace;font-size:9px;color:#888;margin-top:2px}
.tag{font-size:9px;padding:2px 7px;border-radius:3px;font-weight:600;margin-left:6px}
.tag-liga{background:#0f2a0f;color:#4ade80}
.tag-fora{background:#2a0f0f;color:#f87171}
.tag-cache-ok{background:#0f1f2a;color:#60a5fa}
.tag-cache-inc{background:#2a1f0f;color:#fbbf24}
.tag-sem-cache{background:#2a0f0f;color:#f87171}

.ficha-body{padding:10px 14px}
.subsec{margin-bottom:14px}
.subsec-title{font-size:9.5px;font-weight:700;color:#ff6a00;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #2a2a2a;padding-bottom:3px;margin-bottom:6px}
.nada{color:#555;font-style:italic;font-size:10px}

/* TABELA 38 RODADAS */
.rodadas-tbl{width:100%;border-collapse:collapse;font-size:9px;font-family:'JetBrains Mono',monospace}
.rodadas-tbl th{background:#1f1f1f;color:#aaa;padding:3px 5px;text-align:right;white-space:nowrap;font-weight:600;font-size:8.5px}
.rodadas-tbl th:first-child{text-align:center}
.rodadas-tbl td{padding:2px 5px;border-bottom:1px solid #1e1e1e;text-align:right}
.rodadas-tbl td:first-child{text-align:center;color:#888}
.rodadas-tbl tr.vazia td{color:#3a3a3a}
.rodadas-tbl tr.vazia td:first-child{color:#555}
.rodadas-tbl tr:hover{background:#1e1e1e}
.rodadas-tbl .tot-row td{border-top:1px solid #444;font-weight:700;background:#1f1f1f;color:#fff}
.badge-mito{font-size:7px;background:#1a3a1a;color:#4ade80;padding:0 3px;border-radius:2px;margin-left:2px}
.badge-mico{font-size:7px;background:#3a1a1a;color:#f87171;padding:0 3px;border-radius:2px;margin-left:2px}
.badge-vaz{font-size:7px;background:#2a2a00;color:#fbbf24;padding:0 3px;border-radius:2px;margin-left:2px}

/* LOG DE TRANSAÇÕES */
.log-tbl{width:100%;border-collapse:collapse;font-size:9.5px}
.log-tbl th{background:#1f1f1f;color:#aaa;padding:3px 8px;text-align:left;font-weight:600;font-size:8.5px}
.log-tbl td{padding:2px 8px;border-bottom:1px solid #1e1e1e;font-family:'JetBrains Mono',monospace}
.log-tbl td.desc{font-family:'Inter',sans-serif;color:#ccc;font-size:9px}
.log-tbl tr:hover{background:#1e1e1e}
.tipo-badge{display:inline-block;font-size:7.5px;padding:1px 5px;border-radius:3px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase}
.t-ranking{background:#1a2a3a;color:#60a5fa}
.t-inscricao{background:#1a1a3a;color:#a78bfa}
.t-anterior{background:#2a1a3a;color:#c084fc}
.t-ajuste{background:#1a3a2a;color:#34d399}
.t-acerto{background:#2a2a1a;color:#fbbf24}
.t-top10{background:#3a2a0a;color:#f59e0b}
.t-matamata{background:#2a0a3a;color:#e879f9}
.t-pc{background:#0a2a3a;color:#22d3ee}
.t-outro{background:#2a2a2a;color:#9ca3af}

/* ACERTOS */
.acerto-row{display:flex;gap:8px;align-items:baseline;padding:2px 0;border-bottom:1px solid #1e1e1e}
.acerto-tipo{font-size:8.5px;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:3px;min-width:80px;text-align:center}
.pagamento{background:#0a2a0a;color:#4ade80}
.recebimento{background:#2a0a0a;color:#f87171}
.acerto-val{font-family:'JetBrains Mono',monospace;font-weight:600;min-width:80px;text-align:right}
.acerto-desc{color:#aaa;flex:1}
.acerto-meta{color:#555;font-size:9px;white-space:nowrap}

/* SALDO BOX */
.saldo-box{margin:12px 0 6px;padding:10px 14px;border:2px solid #ff6a00;border-radius:6px;display:flex;justify-content:space-between;align-items:center}
.saldo-lbl{font-size:11px;font-weight:700;color:#ff6a00}
.saldo-val{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700}
.saldo-formula{font-family:'JetBrains Mono',monospace;font-size:8.5px;color:#555;margin-bottom:4px}
.divergencia-box{background:#2a0000;border:1px solid #c00;border-radius:4px;padding:5px 10px;font-size:9.5px;color:#f87171;margin:4px 0}
.ok-box{background:#0a2a0a;border:1px solid #4ade80;border-radius:4px;padding:5px 10px;font-size:9.5px;color:#4ade80;margin:4px 0}

/* FLAGS */
.flags-box{margin:8px 0;padding:8px 12px;background:#1f1f1f;border-radius:5px}
.flag-item{padding:2px 0;font-size:9.5px}
.flag-item.aviso{color:#fbbf24}
.flag-item.erro{color:#f87171}
.flag-item.ok{color:#4ade80}

/* 2 COLUNAS */
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}

/* FOOTER */
.footer{text-align:center;color:#444;font-size:9px;margin-top:30px;padding-top:10px;border-top:1px solid #222}

/* RODADA CARD HIGHLIGHT */
.rodadas-tbl tr.melhor-rodada td{background:#0f2a0f}
.rodadas-tbl tr.pior-rodada td{background:#2a0f0f}
`;

        // ─── Tabela resumo ────────────────────────────────────────────────────
        let somaRanking = 0, somaPC = 0, somaMM = 0, somaTop10 = 0, somaCampos = 0, somaAcertos = 0, somaAjustes = 0, somaSaldo = 0;
        fichasSaldo.forEach(f => {
            somaRanking += f.totalRanking; somaPC += f.totalPC; somaMM += f.totalMM; somaTop10 += f.totalTop10;
            somaCampos += f.saldoCampos; somaAcertos += f.saldoAcertos; somaAjustes += f.saldoAjustes; somaSaldo += f.saldoCalculado;
        });

        const tabelaResumo = `
<table class="resumo-tbl">
<thead>
  <tr>
    <th style="text-align:left">Participante</th>
    <th>Ranking</th>
    <th>PC</th>
    <th>Mata-Mata</th>
    <th>Top10</th>
    <th>Campos</th>
    <th>Acertos</th>
    <th>Ajustes</th>
    <th style="border-left:2px solid #000">SALDO 2025</th>
    <th>Cache</th>
    <th>Flags</th>
  </tr>
</thead>
<tbody>
${fichasSaldo.map((f, idx) => {
    const cacheTag = !f.temCache ? '<span class="flag-badge flag-erro">SEM</span>'
        : f.ultimaRodadaConsolidada >= TOTAL_RODADAS ? '<span class="flag-badge flag-ok">R38</span>'
        : `<span class="flag-badge flag-aviso">R${f.ultimaRodadaConsolidada || 0}</span>`;
    const flagsHtml = f.flags.length === 0
        ? '<span class="flag-badge flag-ok">✓</span>'
        : f.flags.map(fl => `<span class="flag-badge flag-${fl.tipo}">${fl.tipo === 'erro' ? '✕' : '⚠'}</span>`).join('');
    return `  <tr>
    <td><span class="rank-num">${idx + 1}</span>${esc(f.nome)}${f.naLiga ? '' : ' <span class="tag tag-fora" style="font-size:8px">FORA</span>'}</td>
    <td class="${corClass(f.totalRanking)}">${fmtNum(f.totalRanking)}</td>
    <td class="${corClass(f.totalPC)}">${fmtNum(f.totalPC)}</td>
    <td class="${corClass(f.totalMM)}">${fmtNum(f.totalMM)}</td>
    <td class="${corClass(f.totalTop10)}">${fmtNum(f.totalTop10)}</td>
    <td class="${corClass(f.saldoCampos)}">${fmtNum(f.saldoCampos)}</td>
    <td class="${corClass(f.saldoAcertos)}">${fmtNum(f.saldoAcertos)}</td>
    <td class="${corClass(f.saldoAjustes)}">${fmtNum(f.saldoAjustes)}</td>
    <td class="${corClass(f.saldoCalculado)}" style="border-left:2px solid #333;font-weight:700">${fmtNum(f.saldoCalculado)}</td>
    <td style="text-align:center">${cacheTag}</td>
    <td style="text-align:center">${flagsHtml}</td>
  </tr>`;
}).join('\n')}
  <tr class="tot-row">
    <td>TOTAIS (${fichasSaldo.length} participantes)</td>
    <td class="${corClass(somaRanking)}">${fmtNum(somaRanking)}</td>
    <td class="${corClass(somaPC)}">${fmtNum(somaPC)}</td>
    <td class="${corClass(somaMM)}">${fmtNum(somaMM)}</td>
    <td class="${corClass(somaTop10)}">${fmtNum(somaTop10)}</td>
    <td class="${corClass(somaCampos)}">${fmtNum(somaCampos)}</td>
    <td class="${corClass(somaAcertos)}">${fmtNum(somaAcertos)}</td>
    <td class="${corClass(somaAjustes)}">${fmtNum(somaAjustes)}</td>
    <td class="${corClass(somaSaldo)}" style="border-left:2px solid #333;font-weight:700">${fmtNum(somaSaldo)}</td>
    <td></td>
    <td></td>
  </tr>
</tbody>
</table>`;

        // ─── Fichas individuais ───────────────────────────────────────────────
        function tipoClass(tipo) {
            if (!tipo) return 't-ranking';
            switch (tipo) {
                case 'INSCRICAO_TEMPORADA': return 't-inscricao';
                case 'SALDO_TEMPORADA_ANTERIOR': return 't-anterior';
                case 'AJUSTE': case 'AJUSTE_MANUAL': return 't-ajuste';
                case 'ACERTO_FINANCEIRO': return 't-acerto';
                case 'MITO': case 'MICO': return 't-top10';
                case 'MATA_MATA': return 't-matamata';
                case 'PONTOS_CORRIDOS': return 't-pc';
                case 'BONUS': case 'ONUS': case 'NEUTRO': return 't-ranking';
                default: return 't-outro';
            }
        }

        function renderFicha(f) {
            // Header badges
            const cacheStatus = !f.temCache ? 'tag-sem-cache'
                : f.ultimaRodadaConsolidada >= TOTAL_RODADAS ? 'tag-cache-ok'
                : 'tag-cache-inc';
            const cacheLabel = !f.temCache ? 'SEM CACHE'
                : f.ultimaRodadaConsolidada >= TOTAL_RODADAS ? `CACHE R${TOTAL_RODADAS}`
                : `CACHE R${f.ultimaRodadaConsolidada || 0}/${TOTAL_RODADAS}`;

            // ── Tabela 38 rodadas ──────────────────────────────────────────
            const melhorSubtotal = Math.max(...f.rodadasInfo.map(r => r.subtotal));
            const piorSubtotal = Math.min(...f.rodadasInfo.map(r => r.subtotal));
            const rodadasTbl = `
<table class="rodadas-tbl">
<thead>
  <tr>
    <th style="text-align:center;min-width:28px">Rnd</th>
    <th>Posição</th>
    <th>Ranking</th>
    <th>PC</th>
    <th>Mata-Mata</th>
    <th>Top10</th>
    <th>Subtotal</th>
    <th>Saldo Acum.</th>
  </tr>
</thead>
<tbody>
${f.rodadasInfo.map(ri => {
    const rowClass = ri.vazia ? ' class="vazia"'
        : ri.subtotal === melhorSubtotal && melhorSubtotal > 0 ? ' class="melhor-rodada"'
        : ri.subtotal === piorSubtotal && piorSubtotal < 0 ? ' class="pior-rodada"'
        : '';
    // Verificar MITO/MICO nesta rodada
    const mitoMico = f.historico.filter(t =>
        (t.tipo === 'MITO' || t.tipo === 'MICO') && t.rodada === ri.r
    );
    const mitoMicoBadge = mitoMico.map(t =>
        t.tipo === 'MITO' ? '<span class="badge-mito">MITO</span>' : '<span class="badge-mico">MICO</span>'
    ).join('');
    const vazBadge = ri.vazia ? '<span class="badge-vaz">?</span>' : '';
    return `  <tr${rowClass}>
    <td>${ri.r}${mitoMicoBadge}${vazBadge}</td>
    <td>${ri.posicao != null ? `${ri.posicao}º` : '—'}</td>
    <td class="${corClass(ri.ranking)}">${ri.ranking !== 0 ? fmtNum(ri.ranking) : '—'}</td>
    <td class="${corClass(ri.pc)}">${ri.pc !== 0 ? fmtNum(ri.pc) : '—'}</td>
    <td class="${corClass(ri.mm)}">${ri.mm !== 0 ? fmtNum(ri.mm) : '—'}</td>
    <td class="${corClass(ri.top10)}">${ri.top10 !== 0 ? fmtNum(ri.top10) : '—'}</td>
    <td class="${corClass(ri.subtotal)}">${fmtNum(ri.subtotal)}</td>
    <td class="${corClass(ri.saldoAcum)}">${fmtNum(ri.saldoAcum)}</td>
  </tr>`;
}).join('\n')}
  <tr class="tot-row">
    <td colspan="2">TOTAL</td>
    <td class="${corClass(f.totalRanking)}">${fmtNum(f.totalRanking)}</td>
    <td class="${corClass(f.totalPC)}">${fmtNum(f.totalPC)}</td>
    <td class="${corClass(f.totalMM)}">${fmtNum(f.totalMM)}</td>
    <td class="${corClass(f.totalTop10)}">${fmtNum(f.totalTop10)}</td>
    <td class="${corClass(f.saldoExtrato)}">${fmtNum(f.saldoExtrato)}</td>
    <td></td>
  </tr>
</tbody>
</table>`;

            // ── Log completo de transações ─────────────────────────────────
            const logEntries = [...f.historico].sort((a, b) => {
                const ra = a.rodada ?? -1;
                const rb = b.rodada ?? -1;
                return ra - rb;
            });

            const logTbl = logEntries.length > 0 ? `
<table class="log-tbl">
<thead>
  <tr>
    <th>Rodada</th>
    <th>Tipo</th>
    <th>Descrição</th>
    <th style="text-align:right">Valor</th>
    <th>Data</th>
  </tr>
</thead>
<tbody>
${logEntries.map(t => {
    const rodStr = t.rodada == null ? 'null' : t.rodada === 0 ? 'R0' : `R${t.rodada}`;
    const tipoStr = t.tipo || '(consolidado)';
    const valor = t.valor ?? t.saldo ?? 0;
    return `  <tr>
    <td>${rodStr}</td>
    <td><span class="tipo-badge ${tipoClass(t.tipo)}">${esc(tipoStr)}</span></td>
    <td class="desc">${esc(t.descricao || (t.tipo === undefined ? `Rodada ${t.rodada}: ranking+PC+MM` : ''))}</td>
    <td class="${corClass(valor)}" style="text-align:right">${fmtNum(valor)}</td>
    <td>${fmtData(t.data)}</td>
  </tr>`;
}).join('\n')}
</tbody>
</table>` : '<div class="nada">Nenhuma transação no extrato cache.</div>';

            // ── Campos manuais ─────────────────────────────────────────────
            const camposHtml = f.camposArr.length > 0
                ? f.camposArr.map(c => `
<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #1e1e1e">
  <span style="color:#ccc">${esc(c.nome || 'Sem nome')}</span>
  <span class="pos" style="font-family:'JetBrains Mono',monospace;font-weight:600">${fmtBRL(c.valor || 0)}</span>
</div>`).join('')
                : '<div class="nada">Nenhum campo manual registrado (fluxofinanceirocampos).</div>';

            // ── Ajustes ────────────────────────────────────────────────────
            const ajustesHtml = f.ajustes.length > 0
                ? f.ajustes.map(a => `
<div style="display:flex;gap:8px;padding:2px 0;border-bottom:1px solid #1e1e1e;align-items:baseline">
  <span style="font-family:'JetBrains Mono',monospace;font-weight:600;min-width:80px" class="${corClass(a.valor)}">${fmtBRL(a.valor)}</span>
  <span style="flex:1;color:#ccc">${esc(a.descricao || '—')}</span>
  <span style="color:#555;font-size:9px;white-space:nowrap">${esc(a.criado_por || '')} ${fmtData(a.criado_em)}</span>
</div>`).join('')
                : '<div class="nada">Nenhum ajuste financeiro registrado.</div>';

            // ── Acertos ────────────────────────────────────────────────────
            const acertosHtml = f.acertos.length > 0 ? `
<div style="margin-bottom:6px;font-size:9.5px">
  Pago: <strong class="pos">+${f.totalPago.toFixed(2)}</strong> &nbsp;|&nbsp;
  Recebido: <strong class="neg">-${f.totalRecebido.toFixed(2)}</strong> &nbsp;|&nbsp;
  Net: <strong class="${corClass(f.saldoAcertos)}">${fmtNum(f.saldoAcertos)}</strong>
</div>
${f.acertos.map(a => {
    const valDisplay = a.tipo === 'pagamento' ? `+${(a.valor||0).toFixed(2)}` : `+${(a.valor||0).toFixed(2)}`;
    const impact = a.tipo === 'pagamento' ? `+${(a.valor||0).toFixed(2)}` : `-${(a.valor||0).toFixed(2)}`;
    return `<div class="acerto-row">
  <span class="acerto-tipo ${a.tipo}">${a.tipo}</span>
  <span class="acerto-val ${a.tipo === 'pagamento' ? 'pos' : 'neg'}">${impact}</span>
  <span class="acerto-desc">${esc(a.descricao || '—')}</span>
  <span class="acerto-meta">${esc(a.metodoPagamento || '')} ${fmtData(a.dataAcerto)}</span>
</div>`;
}).join('')}` : '<div class="nada">Nenhum acerto financeiro registrado.</div>';

            // ── Saldo final e divergência ──────────────────────────────────
            const divHtml = f.saldoFinalRegistrado != null
                ? f.divergencia > 0.10
                    ? `<div class="divergencia-box">⚠ DIVERGÊNCIA: calculado=${fmtBRL(f.saldoCalculado)} vs registrado em InscricaoTemporada=${fmtBRL(f.saldoFinalRegistrado)} → diferença de ${fmtBRL(f.divergencia)}</div>`
                    : `<div class="ok-box">✓ Saldo confere com InscricaoTemporada (${fmtBRL(f.saldoFinalRegistrado)}) — diferença ≤ R$0.10</div>`
                : `<div style="color:#555;font-size:9px;margin:4px 0">Sem snapshot InscricaoTemporada 2026 para comparação.</div>`;

            // ── Flags de integridade ───────────────────────────────────────
            const flagsHtml = f.flags.length === 0
                ? '<div class="flag-item ok">✓ Nenhuma anomalia detectada</div>'
                : f.flags.map(fl => `<div class="flag-item ${fl.tipo}">${fl.tipo === 'erro' ? '✕' : '⚠'} ${esc(fl.msg)}</div>`).join('');

            return `
<div class="ficha">
  <div class="ficha-hdr">
    <div>
      <span class="ficha-nome">${esc(f.nome)}</span>
      <span class="tag ${f.naLiga ? 'tag-liga' : 'tag-fora'}">${f.naLiga ? 'NA LIGA' : 'FORA'}</span>
      <span class="tag ${cacheStatus}">${cacheLabel}</span>
    </div>
    <div class="ficha-meta">time_id: ${f.timeId} &nbsp;|&nbsp; transações no extrato: ${f.historico.length} &nbsp;|&nbsp; acertos: ${f.acertos.length} &nbsp;|&nbsp; ajustes: ${f.ajustes.length}</div>
  </div>

  <div class="ficha-body">

    <!-- TABELA 38 RODADAS -->
    <div class="subsec">
      <div class="subsec-title">38 Rodadas — Detalhamento por Módulo</div>
      ${rodadasTbl}
    </div>

    <!-- LOG COMPLETO -->
    <div class="subsec">
      <div class="subsec-title">Log Completo de Transações (Extrato Cache)</div>
      ${logTbl}
    </div>

    <div class="two-col">
      <div>
        <!-- CAMPOS MANUAIS -->
        <div class="subsec">
          <div class="subsec-title">Campos Manuais (FluxoFinanceiroCampos)</div>
          ${camposHtml}
          ${f.camposArr.length > 0 ? `<div style="margin-top:4px;font-size:9.5px">Total campos: <strong class="${corClass(f.saldoCampos)}">${fmtBRL(f.saldoCampos)}</strong></div>` : ''}
        </div>

        <!-- AJUSTES -->
        <div class="subsec">
          <div class="subsec-title">Ajustes Financeiros (AjusteFinanceiro)</div>
          ${ajustesHtml}
          ${f.ajustes.length > 0 ? `<div style="margin-top:4px;font-size:9.5px">Total ajustes: <strong class="${corClass(f.saldoAjustes)}">${fmtBRL(f.saldoAjustes)}</strong></div>` : ''}
        </div>
      </div>

      <div>
        <!-- ACERTOS FINANCEIROS -->
        <div class="subsec">
          <div class="subsec-title">Acertos Financeiros (Pagamentos / Recebimentos)</div>
          ${acertosHtml}
        </div>

        <!-- INTELIGÊNCIA CRÍTICA -->
        <div class="subsec">
          <div class="subsec-title">Inteligência Crítica — Flags de Auditoria</div>
          <div class="flags-box">
            ${flagsHtml}
            ${f.rodadasVazias.length > 0 ? `<div class="flag-item aviso" style="font-size:8.5px">Rodadas sem dados: ${f.rodadasVazias.map(r => `R${r}`).join(', ')}</div>` : ''}
          </div>
          ${divHtml}
        </div>
      </div>
    </div>

    <!-- SALDO FINAL 2025 -->
    <div class="saldo-formula">
      = extrato_cache(${f.saldoExtrato.toFixed(2)}) + campos(${f.saldoCampos.toFixed(2)}) + acertos(${f.saldoAcertos.toFixed(2)}) + ajustes(${f.saldoAjustes.toFixed(2)})
    </div>
    <div class="saldo-box">
      <span class="saldo-lbl">SALDO CALCULADO 2025</span>
      <span class="saldo-val ${corClass(f.saldoCalculado)}">${fmtBRL(f.saldoCalculado)}</span>
    </div>

  </div>
</div>`;
        }

        const fichasHtml = fichasNome.map(f => renderFicha(f)).join('\n');

        // ─── HTML FINAL ───────────────────────────────────────────────────────
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditoria Financeira 2025 Radical — Super Cartola</title>
<style>${css}</style>
</head>
<body>

<h1>AUDITORIA FINANCEIRA 2025 — RADICAL</h1>
<div class="subtitle">Liga Super Cartola &mdash; Relatório Exaustivo Gerado em ${dataGeracao}</div>

<div class="stats-bar">
  <div class="stat"><div class="stat-num">${totalParticipantes}</div><div class="stat-lbl">Participantes</div></div>
  <div class="stat"><div class="stat-num">${comCache}</div><div class="stat-lbl">Com Cache 2025</div></div>
  <div class="stat"><div class="stat-num">${cacheCompleto}</div><div class="stat-lbl">Cache Completo R38</div></div>
  <div class="stat"><div class="stat-num">${comCampos}</div><div class="stat-lbl">Com Campos Manuais</div></div>
  <div class="stat"><div class="stat-num">${comAcertos}</div><div class="stat-lbl">Com Acertos</div></div>
  <div class="stat"><div class="stat-num">${comAjustes}</div><div class="stat-lbl">Com Ajustes</div></div>
  <div class="stat"><div class="stat-num ${corClass(-totalDivergencias)}">${totalDivergencias}</div><div class="stat-lbl">Com Erros/Divergências</div></div>
  <div class="stat"><div class="stat-num ${corClass(somaTotal)}" style="font-size:14px">${fmtNum(somaTotal)}</div><div class="stat-lbl">Saldo Total Liga 2025</div></div>
</div>

<!-- TABELA RESUMO -->
<div class="sec-title">Tabela Resumo — Ordenado por Saldo 2025 (DESC)</div>
${tabelaResumo}

<!-- FICHAS INDIVIDUAIS -->
<div class="sec-title page-break">Fichas Individuais — Auditoria Completa (ordem alfabética)</div>

${fichasHtml}

<div class="footer">
  Super Cartola Manager &mdash; Auditoria Financeira 2025 Radical &mdash; ${dataGeracao} &mdash; ${totalParticipantes} participantes &mdash; v1.0.0<br>
  READ-ONLY: Nenhum dado foi alterado. Para gerar PDF: Ctrl+P no browser.
</div>

</body>
</html>`;

        // ─── Escrever arquivo ─────────────────────────────────────────────────
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, 'auditoria-financeira-2025-radical.html');
        fs.writeFileSync(outputPath, html, 'utf-8');

        console.log(`\n✅ Relatório gerado: ${outputPath}`);
        console.log(`   Tamanho: ${(html.length / 1024).toFixed(1)} KB`);
        console.log(`   Participantes: ${totalParticipantes}`);
        console.log(`   Com divergências: ${totalDivergencias}`);
        console.log('\n   → Abra no browser e Ctrl+P para salvar como PDF.');

    } catch (err) {
        console.error('\n❌ Erro fatal:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

main();
