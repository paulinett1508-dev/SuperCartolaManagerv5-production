/**
 * scripts/melhor-mes-registrar-premio.js
 *
 * Script único para registrar o prêmio Melhor do Mês no extrato do campeão.
 * Usa forcarReconsolidacao para re-disparar _premiarCampeao com o código atual.
 *
 * Uso:
 *   node scripts/melhor-mes-registrar-premio.js --dry-run     (simulação)
 *   node scripts/melhor-mes-registrar-premio.js --force       (executa)
 *
 * Parâmetros ajustáveis:
 *   LIGA_ID   — ID da liga alvo
 *   TEMPORADA — temporada alvo
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const LIGA_ID = "684cb1c8af923da7c7df51de";
const TEMPORADA = 2026;

const isDryRun = process.argv.includes("--dry-run");
const isForce = process.argv.includes("--force");

if (!isDryRun && !isForce) {
    console.error("❌ Uso: node scripts/melhor-mes-registrar-premio.js --dry-run | --force");
    process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("❌ MONGO_URI não definida no ambiente");
    process.exit(1);
}

async function main() {
    console.log(`\n🏆 REGISTRO DE PRÊMIO MELHOR DO MÊS`);
    console.log(`   Liga:     ${LIGA_ID}`);
    console.log(`   Temporada: ${TEMPORADA}`);
    console.log(`   Modo:     ${isDryRun ? "DRY-RUN (simulação)" : "FORCE (execução real)"}`);
    console.log("─".repeat(60));

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB conectado");

    // Importar o service (agora com _premiarCampeao)
    const { forcarReconsolidacao } = await import("../services/melhorMesService.js");

    // Verificar estado atual do cache antes de agir
    const MelhorMesCache = (await import("../models/MelhorMesCache.js")).default;
    const cache = await MelhorMesCache.findOne({
        ligaId: new mongoose.Types.ObjectId(LIGA_ID),
        temporada: TEMPORADA,
    }).lean();

    if (!cache) {
        console.error("❌ Cache melhor_mes não encontrado para esta liga/temporada");
        process.exit(1);
    }

    const edicao1 = cache.edicoes.find((e) => e.id === 1);
    if (!edicao1) {
        console.error("❌ Edição 01 não encontrada no cache");
        process.exit(1);
    }

    console.log(`\n📊 Estado atual da Edição 01:`);
    console.log(`   inicio: ${edicao1.inicio} | fim: ${edicao1.fim}`);
    console.log(`   status: ${edicao1.status}`);
    console.log(`   rodada_atual: ${edicao1.rodada_atual}`);
    if (edicao1.campeao) {
        console.log(`   campeão: ${edicao1.campeao.nome_cartola} (${edicao1.campeao.nome_time}) — timeId ${edicao1.campeao.timeId}`);
        console.log(`   pontos: ${edicao1.campeao.pontos_total}`);
    } else {
        console.log(`   campeão: nenhum`);
    }

    // Verificar se prêmio já está no extrato
    const ExtratoFinanceiroCache = (await import("../models/ExtratoFinanceiroCache.js")).default;
    const extratoComPremio = edicao1.campeao ? await ExtratoFinanceiroCache.findOne({
        liga_id: LIGA_ID,
        time_id: Number(edicao1.campeao.timeId),
        temporada: TEMPORADA,
        historico_transacoes: {
            $elemMatch: { tipo: "MELHOR_MES", rodada: edicao1.fim },
        },
    }).lean() : null;

    if (extratoComPremio) {
        console.log(`\n✅ Prêmio JÁ REGISTRADO no extrato do campeão. Nada a fazer.`);
        await mongoose.disconnect();
        process.exit(0);
    } else {
        console.log(`\n⚠️  Prêmio NÃO encontrado no extrato do campeão.`);
    }

    if (isDryRun) {
        console.log(`\n🔍 DRY-RUN: Reconsolidação seria executada com rodada_sistema=${cache.rodada_sistema}`);
        console.log(`   Prêmio seria registrado no extrato de time_id=${edicao1.campeao?.timeId}`);
        console.log(`\n   Use --force para executar de verdade.`);
        await mongoose.disconnect();
        process.exit(0);
    }

    // Executar forçar reconsolidação (vai resetar, reconsolidar e chamar _premiarCampeao)
    console.log(`\n🔄 Executando forcarReconsolidacao(rodada=${cache.rodada_sistema}, temporada=${TEMPORADA})...`);
    try {
        const resultado = await forcarReconsolidacao(LIGA_ID, cache.rodada_sistema, TEMPORADA);
        console.log(`✅ Reconsolidação concluída — ${resultado.edicoes?.length || 0} edições processadas`);

        // Verificar se o prêmio foi registrado
        const extratoPos = edicao1.campeao ? await ExtratoFinanceiroCache.findOne({
            liga_id: LIGA_ID,
            time_id: Number(edicao1.campeao.timeId),
            temporada: TEMPORADA,
            historico_transacoes: {
                $elemMatch: { tipo: "MELHOR_MES", rodada: edicao1.fim },
            },
        }).lean() : null;

        if (extratoPos) {
            const transacao = extratoPos.historico_transacoes.find(
                (t) => t.tipo === "MELHOR_MES" && t.rodada === edicao1.fim,
            );
            console.log(`\n💰 PRÊMIO REGISTRADO com sucesso!`);
            console.log(`   time_id:   ${edicao1.campeao.timeId}`);
            console.log(`   campeão:   ${edicao1.campeao.nome_cartola}`);
            console.log(`   rodada:    ${transacao?.rodada}`);
            console.log(`   valor:     R$ ${transacao?.valor}`);
            console.log(`   descrição: ${transacao?.descricao}`);
        } else {
            console.warn(`\n⚠️  Prêmio NÃO encontrado no extrato após reconsolidação.`);
            console.warn(`   Possível causa: extrato do participante ainda não existe ou liga_id diverge.`);
        }
    } catch (err) {
        console.error("❌ Erro durante reconsolidação:", err.message);
        process.exit(1);
    }

    await mongoose.disconnect();
    console.log("\n✅ Concluído.");
}

main().catch((err) => {
    console.error("❌ Erro fatal:", err);
    mongoose.disconnect();
    process.exit(1);
});
