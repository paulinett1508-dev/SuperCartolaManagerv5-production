#!/usr/bin/env node
// =====================================================================
// FIX BRASILEIRÃO DUPLICATAS - v2.0
// Corrige três problemas no CalendarioBrasileirao:
//
// 1. IDs errados de Coritiba (270 → 294) e Remo (1044 → 364)
//    Causados por mapeamento inconsistente entre syncs ESPN.
//
// 2. Partidas duplicadas (mesmo par mandante_id + visitante_id)
//    Causadas por falhas no merge durante re-syncs com IDs divergentes.
//
// 3. [v2.0] Contaminação de Copa do Brasil / Supercopa
//    ESPN retorna múltiplas competições no mesmo endpoint. Jogos anteriores
//    a BRASILEIRAO_INICIO são de outras competições e devem ser removidos.
//    Resulta em rodadas com 30-48 jogos (deveria ser 10) e classificação errada.
//
// Uso:
//   node scripts/fix-brasileirao-duplicatas.js           (dry-run)
//   node scripts/fix-brasileirao-duplicatas.js --force   (aplica)
// =====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = !process.argv.includes('--force');

if (DRY_RUN) {
    console.log('⚠️  DRY-RUN — nenhuma alteração será feita. Use --force para aplicar.\n');
} else {
    console.log('🚀 MODO FORCE — alterações serão aplicadas ao banco.\n');
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('❌ MONGO_URI não configurada'); process.exit(1); }

// IDs incorretos → ID correto do Cartola
const ID_FIX_MAP = {
    270: 294,   // Coritiba: ID legado ESPN → ID Cartola correto
    1044: 364,  // Remo: ID legado ESPN → ID Cartola correto
};

// Data de início real do Brasileirão por temporada.
// Jogos ANTERIORES a essa data são Copa do Brasil / Supercopa / Libertadores
// e devem ser removidos do CalendarioBrasileirao.
// 2026: adiantado por causa da Copa do Mundo 2026 (jun-jul) — início em janeiro.
const BRASILEIRAO_INICIO = {
    2025: '2025-04-12',
    2026: '2026-01-01',
};

const STATUS_PRIORIDADE = { ao_vivo: 3, encerrado: 2, agendado: 1, a_definir: 1, adiado: 0, cancelado: 0 };

await mongoose.connect(MONGO_URI);
console.log('✅ Conectado ao MongoDB\n');

try {
    const db = mongoose.connection.db;
    const col = db.collection('calendariobrasileiraos');

    const doc = await col.findOne({ temporada: 2026 });
    if (!doc) { console.error('❌ Documento temporada 2026 não encontrado'); process.exit(1); }

    console.log(`📊 Estado inicial: ${doc.partidas.length} partidas no banco`);

    // ─────────────────────────────────────────────────────────────
    // PASSO 1: Normalizar IDs incorretos
    // ─────────────────────────────────────────────────────────────
    let idsCorrigidos = 0;
    const partidas = doc.partidas.map(p => {
        let alterado = false;
        const nova = { ...p };

        if (ID_FIX_MAP[nova.mandante_id]) {
            console.log(`  🔧 ID mandante: ${nova.mandante} ${nova.mandante_id} → ${ID_FIX_MAP[nova.mandante_id]} (R${nova.rodada} ${nova.data})`);
            nova.mandante_id = ID_FIX_MAP[nova.mandante_id];
            alterado = true;
        }
        if (ID_FIX_MAP[nova.visitante_id]) {
            console.log(`  🔧 ID visitante: ${nova.visitante} ${nova.visitante_id} → ${ID_FIX_MAP[nova.visitante_id]} (R${nova.rodada} ${nova.data})`);
            nova.visitante_id = ID_FIX_MAP[nova.visitante_id];
            alterado = true;
        }
        if (alterado) idsCorrigidos++;
        return nova;
    });

    console.log(`\n📝 IDs corrigidos: ${idsCorrigidos}`);

    // ─────────────────────────────────────────────────────────────
    // PASSO 1.5: Remover contaminação de Copa do Brasil / Supercopa
    // Jogos anteriores à data de início do Brasileirão são de outras
    // competições que a ESPN retorna no mesmo endpoint bra.1/scoreboard.
    // ─────────────────────────────────────────────────────────────
    const temporada = doc.temporada;
    const dataInicio = BRASILEIRAO_INICIO[temporada] || `${temporada}-04-01`;
    const partidasAntes = partidas.length;
    const partidasSemContaminacao = partidas.filter(p => p.data && p.data >= dataInicio);
    const contaminadas = partidasAntes - partidasSemContaminacao.length;

    console.log(`\n🧪 Limpeza de contaminação (Copa do Brasil / Supercopa):`);
    console.log(`   Data de início do Brasileirão ${temporada}: ${dataInicio}`);
    console.log(`   Partidas antes: ${partidasAntes}`);
    console.log(`   Partidas removidas (anteriores a ${dataInicio}): ${contaminadas}`);
    console.log(`   Partidas após limpeza: ${partidasSemContaminacao.length}`);

    if (contaminadas > 0) {
        // Mostrar distribuição de rodadas ANTES da limpeza para diagnóstico
        const rodadasAntes = {};
        for (const p of partidas) {
            rodadasAntes[p.rodada] = (rodadasAntes[p.rodada] || 0) + 1;
        }
        const rodadasContaminadas = Object.entries(rodadasAntes)
            .filter(([, count]) => count > 12)
            .map(([r, count]) => `R${r}(${count})`);
        if (rodadasContaminadas.length > 0) {
            console.log(`   Rodadas contaminadas removidas: ${rodadasContaminadas.join(', ')}`);
        }
    }

    // Continuar com partidas limpas
    const partidasLimpas = partidasSemContaminacao;

    // ─────────────────────────────────────────────────────────────
    // PASSO 2: Deduplicar por par mandante_id + visitante_id
    // Para cada par, manter a entrada com maior prioridade de status.
    // Desempate: preferir a que tem placar (não null) → data mais recente
    // ─────────────────────────────────────────────────────────────
    const pares = new Map(); // chave → melhor partida

    for (const p of partidasLimpas) {
        // Chave inclui rodada para não confundir turno com returno
        // (turno: FLA-BOT rodada 1 ≠ returno: BOT-FLA rodada X)
        // mas em duplicatas puras, mesmo par na mesma rodada
        const chave = `${p.mandante_id}-${p.visitante_id}`;

        if (!pares.has(chave)) {
            pares.set(chave, p);
            continue;
        }

        const existente = pares.get(chave);
        const prioNova = STATUS_PRIORIDADE[p.status] ?? 0;
        const prioExist = STATUS_PRIORIDADE[existente.status] ?? 0;

        const novaTemPlacar = p.placar_mandante !== null && p.placar_visitante !== null;
        const existTemPlacar = existente.placar_mandante !== null && existente.placar_visitante !== null;

        // Preferir: status maior > tem placar > data mais recente
        const novaEMelhor =
            prioNova > prioExist ||
            (prioNova === prioExist && novaTemPlacar && !existTemPlacar) ||
            (prioNova === prioExist && novaTemPlacar === existTemPlacar && (p.data || '') > (existente.data || ''));

        if (novaEMelhor) {
            // Preservar rodada do melhor se nova não tem rodada válida
            if (!p.rodada || p.rodada === 0) p.rodada = existente.rodada;
            pares.set(chave, p);
        }
    }

    const partidasDedup = [...pares.values()];
    const removidas = partidasLimpas.length - partidasDedup.length;

    console.log(`\n🧹 Deduplicação:`);
    console.log(`   Antes:    ${partidasLimpas.length} partidas`);
    console.log(`   Depois:   ${partidasDedup.length} partidas`);
    console.log(`   Removidas: ${removidas} duplicatas`);

    // ─────────────────────────────────────────────────────────────
    // PASSO 3: Recalcular stats
    // ─────────────────────────────────────────────────────────────
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const total = partidasDedup.length;
    const realizados = partidasDedup.filter(p => p.status === 'encerrado').length;
    let rodadaAtual = 0;
    let ultimaCompleta = 0;

    for (let r = 1; r <= 38; r++) {
        const jogosR = partidasDedup.filter(p => p.rodada === r);
        if (jogosR.length === 0) continue;

        const todosEnc = jogosR.every(p => p.status === 'encerrado');
        if (todosEnc) { ultimaCompleta = r; continue; }

        const datas = jogosR.map(p => p.data).filter(Boolean).sort();
        const dataFim = datas[datas.length - 1];
        if (dataFim && dataFim < hoje) continue;

        if (!rodadaAtual) rodadaAtual = r;
    }
    if (!rodadaAtual) rodadaAtual = Math.min(ultimaCompleta + 1, 38);

    const novasStats = {
        total_jogos: total,
        jogos_realizados: realizados,
        jogos_restantes: total - realizados,
        rodada_atual: rodadaAtual,
        ultima_rodada_completa: ultimaCompleta,
    };

    console.log(`\n📈 Stats recalculadas:`);
    console.log(`   total_jogos:          ${doc.stats.total_jogos} → ${novasStats.total_jogos}`);
    console.log(`   jogos_realizados:     ${doc.stats.jogos_realizados} → ${novasStats.jogos_realizados}`);
    console.log(`   rodada_atual:         ${doc.stats.rodada_atual} → ${novasStats.rodada_atual}`);
    console.log(`   ultima_rodada_completa: ${doc.stats.ultima_rodada_completa} → ${novasStats.ultima_rodada_completa}`);

    // ─────────────────────────────────────────────────────────────
    // PASSO 4: Rodadas breakdown pós-fix
    // ─────────────────────────────────────────────────────────────
    console.log('\n📋 Rodadas pós-fix (primeiras 10):');
    for (let r = 1; r <= 10; r++) {
        const jogosR = partidasDedup.filter(p => p.rodada === r);
        if (jogosR.length === 0) continue;
        const enc = jogosR.filter(p => p.status === 'encerrado').length;
        const datas = jogosR.map(p => p.data).sort();
        console.log(`   R${r}: ${jogosR.length} jogos, ${enc} enc [${datas[0]} → ${datas[datas.length-1]}]`);
    }

    if (DRY_RUN) {
        console.log('\n⚠️  DRY-RUN concluído — nenhuma alteração foi feita.');
        console.log('   Execute com --force para aplicar as correções.');
        process.exit(0);
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 5: Aplicar ao banco
    // ─────────────────────────────────────────────────────────────
    await col.updateOne(
        { temporada: 2026 },
        {
            $set: {
                partidas: partidasDedup,
                stats: novasStats,
                ultima_atualizacao: new Date(),
            }
        }
    );

    console.log('\n✅ Banco atualizado com sucesso!');
    console.log(`   ${doc.partidas.length} → ${partidasDedup.length} partidas (${doc.partidas.length - partidasDedup.length} removidas)`);

} finally {
    await mongoose.disconnect();
}
