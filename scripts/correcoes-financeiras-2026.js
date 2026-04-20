/**
 * Correções Financeiras 2026 — Liga Super Cartola
 * Liga: 684cb1c8af923da7c7df51de
 *
 * Cria AjusteFinanceiro e AcertoFinanceiro para todos os participantes:
 *   - Saldo transferido 2025 (positivo ou negativo)
 *   - Inscrição 2026 (-180)
 *   - Pagamentos de inscrição (para quitados parcial/total)
 *
 * Regras de display:
 *   - DEVE INSCRIÇÃO → ajuste -180 aparece no fluxo/Acertos
 *   - PAGO_TOTAL     → ajuste -180 + acerto +180 = net 0, registrado discretamente
 *
 * Uso:
 *   node scripts/correcoes-financeiras-2026.js --dry-run
 *   node scripts/correcoes-financeiras-2026.js
 *
 * Idempotente: verifica existência antes de criar (chaveIdempotencia)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA = 2026;
const DRY_RUN = process.argv.includes('--dry-run');
const ADMIN = 'admin-auditoria-2026-04-17';

// ============================================================
// DADOS DE CORREÇÃO — um objeto por participante
// ============================================================
// ajustes: [{ valor, descricao }]  → AjusteFinanceiro
// acertos: [{ tipo, valor, descricao }] → AcertoFinanceiro
// ============================================================
const CORRECOES = [

  // ── GRUPO A: apenas inscrição -180 (sem saldo 2025, sem pagamento) ──
  { time_id: 8098497,  nome: 'Banege F.C',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 575856,   nome: 'Felipe Jokstay',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 19615809, nome: 'Lúcio de Souza',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 45004009, nome: 'fc.catumbi',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }] },

  // ── GRUPO B: inscrição -180 com pagamento já existente (BarrosB) ──
  // BarrosB já tem AcertoFinanceiro pagamento:180 — só ajuste
  { time_id: 1113367,  nome: 'BarrosB',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }] },

  // ── GRUPO C: inscrição -180 + anotar quitação (PAGO_TOTAL s/ acerto) ──
  { time_id: 476869,   nome: 'Engenhando',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 180, descricao: 'Inscrição 2026 — Quitada' }] },

  { time_id: 8188312,  nome: 'Felipe Santos',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 180, descricao: 'Inscrição 2026 — Quitada' }] },

  { time_id: 1323370,  nome: 'Diego Barbosa',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 180, descricao: 'Inscrição 2026 — Quitada' }] },

  { time_id: 3300583,  nome: 'LEJORA FC',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 180, descricao: 'Inscrição 2026 — Quitada' }] },

  { time_id: 1039496,  nome: 'Randim',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 180, descricao: 'Inscrição 2026 — Quitada' }] },

  { time_id: 5902324,  nome: 'juniel henrique',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 180, descricao: 'Inscrição 2026 — Quitada' }] },

  // ── GRUPO D: saldo 2025 POSITIVO + inscrição -180 ──
  { time_id: 39786,    nome: 'Cássio Marques',
    ajustes: [{ valor: 343.38, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 2718174,  nome: 'Flavio André',
    ajustes: [{ valor: 79, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 5254799,  nome: 'Mauricio Wendel',
    ajustes: [{ valor: 1300.38, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 8183683,  nome: 'Neto Waquim',
    ajustes: [{ valor: 110, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 4966295,  nome: 'Rony Morais',
    ajustes: [{ valor: 51.54, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 1568358,  nome: 'Sir Gegé',
    ajustes: [{ valor: 405.07, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 25371297, nome: 'Tabaca Neon',
    ajustes: [{ valor: 354, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 3027272,  nome: 'Vitim',
    ajustes: [{ valor: 1523.67, descricao: 'Saldo transferido 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  // Wesley: saldo 2025 = 1122.54, já recebeu 600 → transfere 522.54
  { time_id: 7698677,  nome: 'Wesley Oliveira',
    ajustes: [{ valor: 522.54, descricao: 'Saldo transferido 2025 (descontado 600 já recebido)' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  // ── GRUPO E: saldo 2025 NEGATIVO + inscrição -180 (carregar dívida) ──
  { time_id: 715731,   nome: 'Jonney Vojvoda',
    ajustes: [{ valor: -240.46, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 1173066,  nome: 'Mr. Carmilton',
    ajustes: [{ valor: -155, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 14569704, nome: 'Rafael Janderson',
    ajustes: [{ valor: -140, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 25324292, nome: 'Pedro Antônio',
    ajustes: [{ valor: -47, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 20165417, nome: 'Raylson Fernandes',
    ajustes: [{ valor: -209, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 1459952,  nome: 'Sávio C Cavalcante',
    ajustes: [{ valor: -70, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  { time_id: 1932235,  nome: 'VILA LEÃO F.C',
    ajustes: [{ valor: -140, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }] },

  // ── GRUPO F: casos especiais ──

  // Itaueira: inscrição já no cache (-180). Só falta saldo 2025.
  { time_id: 621609,   nome: 'Itaueira Mengão',
    ajustes: [{ valor: 112.54, descricao: 'Saldo transferido 2025' }] },

  // GAAVAZ.FC: pagou 50 de entrada (sem registro) + deve restante
  { time_id: 1649056,  nome: 'GAAVAZ.FC',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 50, descricao: 'Inscrição 2026 — Pagamento parcial (entrada)' }] },

  // Palestra Itália JN: já tem acerto +100. Só o restante -80.
  { time_id: 14003233, nome: 'Palestra Itália JN',
    ajustes: [{ valor: -80, descricao: 'Inscrição 2026 — Restante' }] },

  // Raimundo: saldo 2025 -404.46 + inscrição -180 + pagou 100 abatimento
  { time_id: 14916330, nome: 'Raimundo Pinheiro',
    ajustes: [{ valor: -404.46, descricao: 'Saldo acumulado 2025' }, { valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 100, descricao: 'Abatimento dívida acumulada 2025+2026' }] },

  // Trem Bala Juá: inscrição -180 + pagou 100
  { time_id: 752847,   nome: 'Trem Bala Juá',
    ajustes: [{ valor: -180, descricao: 'Inscrição 2026' }],
    acertos: [{ tipo: 'pagamento', valor: 100, descricao: 'Inscrição 2026 — Pagamento parcial' }] },
];

// ============================================================
// EXECUÇÃO
// ============================================================

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`MongoDB conectado [${DRY_RUN ? 'DRY-RUN' : 'LIVE'}]\n`);

  let criados = 0;
  let pulados = 0;

  const SEP = '─'.repeat(70);

  for (const p of CORRECOES) {
    console.log(`\n${SEP}`);
    console.log(`${p.nome} [${p.time_id}]`);
    console.log(SEP);

    // ── AjusteFinanceiro ──
    for (const aj of (p.ajustes || [])) {
      const chave = `aj-${LIGA_ID}-${p.time_id}-${TEMPORADA}-${aj.descricao.replace(/\s+/g,'_').toLowerCase()}`;
      const existe = await db.collection('ajustesfinanceiros').findOne({
        liga_id: LIGA_ID, time_id: p.time_id, temporada: TEMPORADA,
        descricao: aj.descricao, ativo: true
      });

      if (existe) {
        console.log(`  [SKIP] Ajuste já existe: ${aj.valor >= 0 ? '+' : ''}${aj.valor} — ${aj.descricao}`);
        pulados++;
      } else if (DRY_RUN) {
        console.log(`  [DRY] Criar AjusteFinanceiro: ${aj.valor >= 0 ? '+' : ''}${aj.valor} — ${aj.descricao}`);
        criados++;
      } else {
        const doc = {
          liga_id: LIGA_ID, time_id: p.time_id, temporada: TEMPORADA,
          descricao: aj.descricao, valor: aj.valor,
          criado_por: ADMIN, atualizado_por: '',
          ativo: true, chaveIdempotencia: chave,
          criado_em: new Date(), atualizado_em: new Date()
        };
        const res = await db.collection('ajustesfinanceiros').insertOne(doc);
        console.log(`  [OK] AjusteFinanceiro criado: ${aj.valor >= 0 ? '+' : ''}${aj.valor} — ${aj.descricao} (${res.insertedId})`);
        criados++;
      }
    }

    // ── AcertoFinanceiro ──
    for (const ac of (p.acertos || [])) {
      const existe = await db.collection('acertofinanceiros').findOne({
        liga_id: LIGA_ID, time_id: p.time_id, temporada: TEMPORADA,
        descricao: ac.descricao, tipo: ac.tipo, ativo: true
      });

      if (existe) {
        console.log(`  [SKIP] Acerto já existe: ${ac.tipo}:${ac.valor} — ${ac.descricao}`);
        pulados++;
      } else if (DRY_RUN) {
        console.log(`  [DRY] Criar AcertoFinanceiro: ${ac.tipo}:${ac.valor} — ${ac.descricao}`);
        criados++;
      } else {
        const doc = {
          liga_id: LIGA_ID, time_id: p.time_id, temporada: TEMPORADA,
          nomeTime: p.nome, tipo: ac.tipo, valor: ac.valor,
          descricao: ac.descricao, metodoPagamento: 'outro',
          comprovante: null, registradoPor: ADMIN,
          observacoes: null, dataAcerto: new Date(),
          ativo: true, createdAt: new Date(), updatedAt: new Date()
        };
        const res = await db.collection('acertofinanceiros').insertOne(doc);
        console.log(`  [OK] AcertoFinanceiro criado: ${ac.tipo}:${ac.valor} — ${ac.descricao} (${res.insertedId})`);
        criados++;
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`RESULTADO: ${criados} criados / ${pulados} pulados (já existiam)`);
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n*** DRY-RUN concluído — nenhum dado foi gravado ***');
    console.log('Execute sem --dry-run para aplicar as correções.');
  }

  // ── SALDO ESPERADO ──
  console.log('\n' + '='.repeat(70));
  console.log('SALDO ESPERADO APÓS CORREÇÕES (saldo_consolidado + ajustes + acertos)');
  console.log('='.repeat(70));

  const ex26 = await db.collection('extratofinanceirocaches')
    .find({ liga_id: LIGA_ID, temporada: TEMPORADA })
    .toArray();
  const exMap = {};
  ex26.forEach(e => { exMap[e.time_id] = e.saldo_consolidado || 0; });

  const allAj = await db.collection('ajustesfinanceiros')
    .find({ liga_id: LIGA_ID, temporada: TEMPORADA, ativo: true }).toArray();
  const ajMap = {};
  allAj.forEach(a => { ajMap[a.time_id] = (ajMap[a.time_id] || 0) + a.valor; });

  const allAc = await db.collection('acertofinanceiros')
    .find({ liga_id: LIGA_ID, temporada: TEMPORADA, ativo: true }).toArray();
  const acMap = {};
  allAc.forEach(a => {
    acMap[a.time_id] = (acMap[a.time_id] || 0) + (a.tipo === 'pagamento' ? a.valor : -a.valor);
  });

  const times = await db.collection('times')
    .find({ liga_id: LIGA_ID, temporada: TEMPORADA, ativo: true })
    .sort({ nome: 1 }).toArray();

  for (const t of times) {
    const tid = t.id;
    const rodadas = exMap[tid] || 0;
    const ajustes = ajMap[tid] || 0;
    const acertos = acMap[tid] || 0;
    const saldo = rodadas + ajustes + acertos;
    const status = saldo > 0.01 ? 'CREDOR' : saldo < -0.01 ? 'DEVEDOR' : 'ZERADO';
    const pfx = saldo > 0.01 ? '>>' : saldo < -0.01 ? '!!' : '--';
    console.log(`${pfx} R$${saldo.toFixed(2).padStart(9)}  ${t.nome.padEnd(22)} [rodadas:${rodadas.toFixed(2)} aj:${ajustes.toFixed(2)} ac:${acertos.toFixed(2)}]  ${status}`);
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error('ERRO:', e); process.exit(1); });
