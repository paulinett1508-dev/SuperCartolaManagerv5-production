/**
 * Script: Fix Top10 R10 - Paulinett Miranda + Cascata (Super Cartola 2026)
 *
 * BUG: Race condition na coleta de dados R10. O trigger da Super Cartola
 * buscou os dados de Paulinett às 16:02:25 quando a API do Cartola ainda
 * retornava scores da R9 (rodada_id:9 nos atletas, pontos:28.58).
 * 15s depois (16:02:40) a outra liga buscou e obteve pontos corretos (60.97).
 *
 * Resultado: Paulinett ficou em posicao 35 (mico errado) com 28.58 pts no
 * cache do Top10. O mico real da R10 é Lucas Sousa com 33.30 pts.
 *
 * Correções necessárias (coleção `rodadas`, liga Super Cartola 2026, R10):
 *   Paulinett Miranda (13935277): pontos 28.58→60.97, pos 35→32, val -15→-12
 *   Felipe Jokstay   (575856):   pos 32→33, val -12→-13
 *   Raylson Fernandes (20165417): pos 33→34, val -13→-14
 *   Lucas Sousa      (476869):   pos 34→35, val -14→-15
 *
 * Também: deletar top10cache R10 para forçar recálculo correto.
 *
 * USO:
 *   node scripts/applied-fixes/fix-top10-r10-paulinett-2026.js --dry-run
 *   node scripts/applied-fixes/fix-top10-r10-paulinett-2026.js --force
 */

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const { ObjectId } = mongoose.Types;
const LIGA_ID     = new ObjectId('684cb1c8af923da7c7df51de'); // ObjectId para coleção rodadas
const LIGA_ID_STR = '684cb1c8af923da7c7df51de';               // string para top10caches
const TEMPORADA = 2026;
const RODADA = 10;

// Dados corretos de Paulinett R10 (do dump com rodada_id:10)
const PAULINETT_CORRECT = {
    timeId: 13935277,
    pontos: 60.969970703125,
    posicao: 32,
    valorFinanceiro: -12,
    atletas: [
        { atleta_id: 98720,  apelido: 'Angileri',       posicao_id: 2, clube_id: 264, pontos_num: 1.5,  status_id: 7 },
        { atleta_id: 113034, apelido: 'Freytes',         posicao_id: 3, clube_id: 266, pontos_num: 0,    status_id: 7 },
        { atleta_id: 71631,  apelido: 'Weverton',        posicao_id: 1, clube_id: 284, pontos_num: 15.9, status_id: 7 },
        { atleta_id: 108133, apelido: 'Isidro Pitta',    posicao_id: 5, clube_id: 280, pontos_num: 8,    status_id: 7 },
        { atleta_id: 93790,  apelido: 'Marlon Freitas',  posicao_id: 4, clube_id: 275, pontos_num: 4.5,  status_id: 7 },
        { atleta_id: 126182, apelido: 'Paulinho',        posicao_id: 4, clube_id: 285, pontos_num: 4.2,  status_id: 7 },
        { atleta_id: 87863,  apelido: 'Arrascaeta',      posicao_id: 4, clube_id: 262, pontos_num: 1.8,  status_id: 7 },
        { atleta_id: 145404, apelido: 'Arthur',          posicao_id: 2, clube_id: 275, pontos_num: 5.6,  status_id: 7 },
        { atleta_id: 105563, apelido: 'Carlos Vinícius', posicao_id: 5, clube_id: 284, pontos_num: 2.8,  status_id: 7 },
        { atleta_id: 102340, apelido: 'Cacá',            posicao_id: 3, clube_id: 287, pontos_num: 0.2,  status_id: 7 },
        { atleta_id: 94583,  apelido: 'Pedro',           posicao_id: 5, clube_id: 262, pontos_num: 9,    status_id: 7 },
        { atleta_id: 88037,  apelido: 'Luís Castro',     posicao_id: 6, clube_id: 284, pontos_num: 6.07, status_id: 7 },
        { atleta_id: 70944,  apelido: 'Bruno Henrique',  posicao_id: 4, clube_id: 285, pontos_num: -0.6, status_id: 6 },
        { atleta_id: 85425,  apelido: 'João Paulo',      posicao_id: 1, clube_id: 265, pontos_num: 0,    status_id: 6 },
        { atleta_id: 86292,  apelido: 'Bolasie',         posicao_id: 5, clube_id: 315, pontos_num: 1.2,  status_id: 7 },
        { atleta_id: 98280,  apelido: 'Bastos',          posicao_id: 3, clube_id: 263, pontos_num: 0,    status_id: 6 },
    ],
};

// Correções de cascata (apenas pos + valorFinanceiro)
const CASCATA = [
    { timeId: 575856,   nome: 'Felipe Jokstay',    posicao: 33, valorFinanceiro: -13 },
    { timeId: 20165417, nome: 'Raylson Fernandes',  posicao: 34, valorFinanceiro: -14 },
    { timeId: 476869,   nome: 'Lucas Sousa',        posicao: 35, valorFinanceiro: -15 },
];

async function main() {
    const isDryRun = process.argv.includes('--dry-run');
    const isForce  = process.argv.includes('--force');

    if (!isDryRun && !isForce) {
        console.error('ERRO: Use --dry-run para simular ou --force para executar');
        process.exit(1);
    }

    const mode = isDryRun ? 'DRY-RUN' : 'EXECUÇÃO REAL';
    console.log('='.repeat(60));
    console.log(`FIX: Top10 R10 Paulinett + Cascata (${mode})`);
    console.log('='.repeat(60));
    console.log(`Liga: ${LIGA_ID} | R${RODADA} | Temp ${TEMPORADA}`);
    console.log();

    // Banco correto é cartola-manager (o .env pode ter supercartolamanager por legado)
    const mongoUri = process.env.MONGO_URI.replace('/supercartolamanager?', '/cartola-manager?');
    await mongoose.connect(mongoUri);
    console.log('MongoDB conectado.');

    const db = mongoose.connection.db;
    const rodadasCol    = db.collection('rodadas');
    const top10Col      = db.collection('top10caches');

    // ─── 1. Verificar estado atual ──────────────────────────────────────────
    console.log('\n── ESTADO ATUAL ──');
    const docAtual = await rodadasCol.findOne({
        ligaId:    LIGA_ID,
        timeId:    PAULINETT_CORRECT.timeId,
        rodada:    RODADA,
        temporada: TEMPORADA,
    });

    if (!docAtual) {
        console.error('ERRO: Documento de Paulinett R10 não encontrado!');
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`Paulinett atual: pontos=${docAtual.pontos}, pos=${docAtual.posicao}, val=${docAtual.valorFinanceiro}`);
    console.log(`Atletas com pontos_num=0: ${docAtual.atletas?.filter(a => a.pontos_num === 0).length}/${docAtual.atletas?.length}`);

    for (const p of CASCATA) {
        const doc = await rodadasCol.findOne({ ligaId: LIGA_ID, timeId: p.timeId, rodada: RODADA, temporada: TEMPORADA });
        if (doc) {
            console.log(`${p.nome}: pos=${doc.posicao}, val=${doc.valorFinanceiro}`);
        } else {
            console.log(`${p.nome}: ⚠️ não encontrado`);
        }
    }

    // ─── 2. Verificar top10cache ───────────────────────────────────────────
    const cacheAtual = await top10Col.findOne({
        liga_id:             LIGA_ID_STR,
        rodada_consolidada:  RODADA,
        temporada:           TEMPORADA,
    });

    if (cacheAtual) {
        const micoR10 = cacheAtual.micos?.find(m => m.rodada === RODADA);
        console.log(`\nTop10Cache R10 mico: ${micoR10?.nome_cartola} (${micoR10?.pontos} pts)`);
    } else {
        console.log('\nTop10Cache R10: não encontrado');
    }

    if (isDryRun) {
        console.log('\n── SIMULAÇÃO (DRY-RUN) ──');
        console.log(`[SERIA] Paulinett: pontos ${docAtual.pontos}→${PAULINETT_CORRECT.pontos}, pos ${docAtual.posicao}→${PAULINETT_CORRECT.posicao}, val ${docAtual.valorFinanceiro}→${PAULINETT_CORRECT.valorFinanceiro}`);
        for (const p of CASCATA) {
            const doc = await rodadasCol.findOne({ ligaId: LIGA_ID, timeId: p.timeId, rodada: RODADA, temporada: TEMPORADA });
            if (doc) console.log(`[SERIA] ${p.nome}: pos ${doc.posicao}→${p.posicao}, val ${doc.valorFinanceiro}→${p.valorFinanceiro}`);
        }
        if (cacheAtual) console.log(`[SERIA] Top10Cache R10 seria deletado (${cacheAtual._id})`);
        console.log('\nDRY-RUN concluído. Nenhuma alteração feita.');
        await mongoose.disconnect();
        return;
    }

    // ─── 3. Corrigir Paulinett ──────────────────────────────────────────────
    console.log('\n── EXECUTANDO CORREÇÕES ──');

    const r1 = await rodadasCol.updateOne(
        { ligaId: LIGA_ID, timeId: PAULINETT_CORRECT.timeId, rodada: RODADA, temporada: TEMPORADA },
        {
            $set: {
                pontos:          PAULINETT_CORRECT.pontos,
                posicao:         PAULINETT_CORRECT.posicao,
                valorFinanceiro: PAULINETT_CORRECT.valorFinanceiro,
                atletas:         PAULINETT_CORRECT.atletas,
            },
        }
    );
    console.log(`✅ Paulinett: ${r1.modifiedCount === 1 ? 'CORRIGIDO' : 'NÃO MODIFICADO (verifique)'}`);
    console.log(`   pontos: ${docAtual.pontos} → ${PAULINETT_CORRECT.pontos}`);
    console.log(`   posicao: ${docAtual.posicao} → ${PAULINETT_CORRECT.posicao}`);
    console.log(`   valorFinanceiro: ${docAtual.valorFinanceiro} → ${PAULINETT_CORRECT.valorFinanceiro}`);

    // ─── 4. Corrigir cascata ───────────────────────────────────────────────
    for (const p of CASCATA) {
        const r = await rodadasCol.updateOne(
            { ligaId: LIGA_ID, timeId: p.timeId, rodada: RODADA, temporada: TEMPORADA },
            { $set: { posicao: p.posicao, valorFinanceiro: p.valorFinanceiro } }
        );
        console.log(`✅ ${p.nome}: ${r.modifiedCount === 1 ? 'CORRIGIDO' : 'NÃO MODIFICADO'} → pos ${p.posicao}, val ${p.valorFinanceiro}`);
    }

    // ─── 5. Deletar top10cache R10 ─────────────────────────────────────────
    if (cacheAtual) {
        const r = await top10Col.deleteOne({ _id: cacheAtual._id });
        console.log(`✅ Top10Cache R10: ${r.deletedCount === 1 ? 'DELETADO' : 'FALHOU'} (id: ${cacheAtual._id})`);
    } else {
        console.log('ℹ️  Top10Cache R10: não existia, nada a deletar');
    }

    // ─── 6. Verificar resultado ────────────────────────────────────────────
    console.log('\n── VERIFICAÇÃO PÓS-CORREÇÃO ──');
    const docs = await rodadasCol
        .find({ ligaId: LIGA_ID, rodada: RODADA, temporada: TEMPORADA, posicao: { $gte: 31 } })
        .sort({ posicao: 1 })
        .toArray();

    for (const d of docs) {
        console.log(`  Pos ${d.posicao} | ${d.nome_cartola} | ${d.pontos} pts | val ${d.valorFinanceiro}`);
    }

    const cachePos = await top10Col.findOne({ liga_id: LIGA_ID_STR, rodada_consolidada: RODADA, temporada: TEMPORADA });
    console.log(`\nTop10Cache R10 após fix: ${cachePos ? '⚠️ AINDA EXISTE' : '✅ REMOVIDO'}`);

    console.log('\n✅ Fix concluído. Ao abrir o Top10 no admin, o cache será recalculado.');
    console.log('   O mico correto da R10 é: Lucas Sousa (33.30 pts)');

    await mongoose.disconnect();
}

main().catch(e => {
    console.error('ERRO FATAL:', e);
    process.exit(1);
});
