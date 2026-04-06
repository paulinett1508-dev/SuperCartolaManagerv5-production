#!/usr/bin/env node
// =====================================================================
// FIX BRASILEIRÃO FULL RESYNC
// Limpa partidas corrompidas (lixo de seed aleatório) e reseta timestamps
// para forçar re-sync completo das fontes externas (API-Football → ESPN).
//
// PROBLEMA: seed-brasileirao-2026-real.js gera confrontos ALEATÓRIOS para
// R6-R38 via Math.random(). importarPartidas() nunca remove entradas stale.
// Resultado: DB com mix de dados reais + lixo, classificação errada.
//
// Uso:
//   node scripts/fix-brasileirao-full-resync.js           (dry-run)
//   node scripts/fix-brasileirao-full-resync.js --force   (aplica)
// =====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = !process.argv.includes('--force');
const TEMPORADA = 2026;

if (DRY_RUN) {
    console.log('⚠️  DRY-RUN — nenhuma alteração será feita. Use --force para aplicar.\n');
} else {
    console.log('🚀 MODO FORCE — partidas serão limpas para forçar re-sync.\n');
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('❌ MONGO_URI não configurada'); process.exit(1); }

try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    const col = db.collection('calendariobrasileiraos');

    const doc = await col.findOne({ temporada: TEMPORADA });
    if (!doc) {
        console.error(`❌ Documento temporada ${TEMPORADA} não encontrado`);
        process.exit(1);
    }

    const totalPartidas = doc.partidas?.length || 0;
    const encerrados = (doc.partidas || []).filter(p => p.status === 'encerrado').length;
    const agendados = (doc.partidas || []).filter(p => p.status === 'agendado').length;
    const adiados = (doc.partidas || []).filter(p => p.status === 'adiado').length;

    console.log(`📊 Estado atual da temporada ${TEMPORADA}:`);
    console.log(`   Total partidas: ${totalPartidas}`);
    console.log(`   Encerrados:     ${encerrados}`);
    console.log(`   Agendados:      ${agendados}`);
    console.log(`   Adiados:        ${adiados}`);
    console.log(`   Fonte:          ${doc.fonte}`);
    console.log(`   Última att:     ${doc.ultima_atualizacao}`);
    console.log(`   Remarcações:    ${doc.remarcacoes?.length || 0}`);

    // Diagnóstico: rodadas com jogos
    const jogosParaRodada = {};
    for (const p of (doc.partidas || [])) {
        jogosParaRodada[p.rodada] = (jogosParaRodada[p.rodada] || 0) + 1;
    }
    console.log('\n📋 Jogos por rodada:');
    for (let r = 1; r <= 15; r++) {
        const count = jogosParaRodada[r] || 0;
        const flag = count !== 10 ? ' ⚠️' : '';
        console.log(`   R${String(r).padStart(2, '0')}: ${count} jogos${flag}`);
    }
    const totalRodadas = Object.keys(jogosParaRodada).length;
    if (totalRodadas > 15) {
        console.log(`   ... (${totalRodadas} rodadas no total)`);
    }

    if (DRY_RUN) {
        console.log('\n⚠️  DRY-RUN concluído. Execute com --force para limpar partidas e forçar re-sync.');
        process.exit(0);
    }

    // Limpar partidas e resetar timestamps
    const seteAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await col.updateOne(
        { temporada: TEMPORADA },
        {
            $set: {
                partidas: [],
                stats: {
                    total_jogos: 0,
                    jogos_realizados: 0,
                    jogos_restantes: 0,
                    rodada_atual: 1,
                    ultima_rodada_completa: 0,
                },
                ultima_atualizacao: seteAtras,
            }
        }
    );

    console.log(`\n✅ Partidas limpas (${totalPartidas} → 0)`);
    console.log(`✅ ultima_atualizacao resetada para ${seteAtras.toISOString()}`);
    console.log('\n📌 Próximo passo: POST /api/brasileirao/sync/2026 (admin) ou clicar Atualizar na LP');
    console.log('   O sistema vai rebuscar tudo das fontes externas (API-Football → ESPN).');

} finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado do MongoDB');
}
