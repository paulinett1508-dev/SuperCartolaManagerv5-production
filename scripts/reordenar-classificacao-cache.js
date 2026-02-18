/**
 * scripts/reordenar-classificacao-cache.js
 * Re-ordena a classificação dos caches de Pontos Corridos com os novos critérios de desempate.
 *
 * Novos critérios (aplicados em 2026-02-18):
 *   1º pontos       - Pts tabela (3V/1E/0D)
 *   2º gols_pro     - Pts Ranking Geral (total Cartola acumulado)  ← era 3º
 *   3º saldo_gols   - Saldo de pontos
 *   4º vitorias     - Vitórias
 *   5º pontosGoleada - Pts Goleada (bônus)                        ← novo
 *
 * Uso:
 *   node scripts/reordenar-classificacao-cache.js --dry-run          # Prévia
 *   node scripts/reordenar-classificacao-cache.js --force            # Executa
 *   node scripts/reordenar-classificacao-cache.js --force --liga=ID  # Liga específica
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const isDryRun = process.argv.includes("--dry-run");
const isForce  = process.argv.includes("--force");
const ligaArg  = process.argv.find(a => a.startsWith("--liga="))?.split("=")[1];

if (!isDryRun && !isForce) {
    console.error("❌ Use --dry-run para simular ou --force para executar");
    process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("❌ MONGO_URI não definida");
    process.exit(1);
}

// ── Sort function com os novos critérios ──────────────────────────────────────
function sortClassificacao(a, b) {
    if (b.pontos !== a.pontos)               return b.pontos - a.pontos;           // 1º
    if (b.gols_pro !== a.gols_pro)           return b.gols_pro - a.gols_pro;       // 2º
    if (b.saldo_gols !== a.saldo_gols)       return b.saldo_gols - a.saldo_gols;   // 3º
    if (b.vitorias !== a.vitorias)           return b.vitorias - a.vitorias;       // 4º
    return (b.pontosGoleada || 0) - (a.pontosGoleada || 0);                        // 5º
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function classificacoesDivergem(antiga, nova) {
    for (let i = 0; i < antiga.length; i++) {
        const a = antiga[i];
        const n = nova[i];
        if (!n) return true;
        const tidA = String(a.timeId || a.time_id || "");
        const tidN = String(n.timeId || n.time_id || "");
        if (tidA !== tidN) return true;
    }
    return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 REORDENAR CLASSIFICAÇÃO — Pontos Corridos`);
    console.log(`Modo: ${isDryRun ? "DRY-RUN (sem alterações)" : "⚡ FORCE (gravando)"}`);
    if (ligaArg) console.log(`Liga filtro: ${ligaArg}`);
    console.log(`${"=".repeat(60)}\n`);

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB conectado\n");

    const db = mongoose.connection.db;
    const col = db.collection("pontoscorridoscaches");

    const query = ligaArg ? { liga_id: ligaArg } : {};
    const caches = await col.find(query).sort({ liga_id: 1, rodada_consolidada: 1 }).toArray();

    console.log(`📦 ${caches.length} cache(s) encontrado(s)\n`);

    let atualizados = 0;
    let semMudanca  = 0;

    for (const cache of caches) {
        const label = `Liga ${cache.liga_id} | T${cache.temporada} | R${cache.rodada_consolidada}`;

        if (!Array.isArray(cache.classificacao) || cache.classificacao.length === 0) {
            console.log(`⚠️  ${label} — classificação vazia, pulando`);
            continue;
        }

        const classificacaoNova = [...cache.classificacao].sort(sortClassificacao);
        // Atualizar posicao
        classificacaoNova.forEach((t, i) => { t.posicao = i + 1; });

        const mudou = classificacoesDivergem(cache.classificacao, classificacaoNova);

        if (!mudou) {
            console.log(`✅  ${label} — ordem já correta (${cache.classificacao.length} times)`);
            semMudanca++;
            continue;
        }

        // Mostrar diff das posições que mudaram
        console.log(`🔄  ${label} — ${cache.classificacao.length} times, reordenando...`);
        for (let i = 0; i < classificacaoNova.length; i++) {
            const antiga = cache.classificacao[i];
            const nova   = classificacaoNova[i];
            const tidAnt = String(antiga?.timeId || antiga?.time_id || "");
            const tidNov = String(nova?.timeId  || nova?.time_id  || "");
            if (tidAnt !== tidNov) {
                console.log(`     ${String(i + 1).padStart(2)}º: ${(antiga?.nome || tidAnt).padEnd(30)} → ${nova?.nome || tidNov}`);
            }
        }

        if (!isDryRun) {
            await col.updateOne(
                { _id: cache._id },
                { $set: {
                    classificacao: classificacaoNova,
                    ultima_atualizacao: new Date()
                }}
            );
        }

        atualizados++;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Resultado:`);
    console.log(`   Reordenados : ${atualizados}`);
    console.log(`   Sem mudança : ${semMudanca}`);
    if (isDryRun) {
        console.log(`\n⚠️  DRY-RUN: nenhuma alteração gravada.`);
        console.log(`   Para aplicar: node scripts/reordenar-classificacao-cache.js --force`);
    } else {
        console.log(`\n✅ ${atualizados} cache(s) atualizado(s) no MongoDB.`);
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error("❌ Erro fatal:", err);
    process.exit(1);
});
