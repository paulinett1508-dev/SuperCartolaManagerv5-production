#!/usr/bin/env node
/**
 * Regenerar Ranking Geral da Liga Sobral
 *
 * A collection rankinggeralcaches estava com dados zerados.
 * Este script regenera usando os dados corretos do ranking_turno_caches.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const LIGA_SOBRAL_ID = '684d821cf1a7ae16d1f89572';

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔄 REGENERAR RANKING GERAL - Liga Sobral');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const isDryRun = process.argv.includes('--dry-run');

    if (isDryRun) {
        console.log('🔍 MODO DRY-RUN - Nenhuma alteração será feita\n');
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB\n');

        const db = mongoose.connection.db;

        // 1. Buscar ranking correto do ranking_turno_caches
        console.log('📊 Buscando dados do ranking_turno_caches...');
        const rankingTurno = await db.collection('ranking_turno_caches').findOne({
            liga_id: LIGA_SOBRAL_ID,
            turno: 'geral'
        });

        if (!rankingTurno || !rankingTurno.ranking) {
            console.log('❌ Ranking turno não encontrado!');
            await mongoose.disconnect();
            return;
        }

        console.log(`✅ Encontrado: ${rankingTurno.ranking.length} participantes`);
        console.log('\n📋 Ranking atual:');
        rankingTurno.ranking.forEach(p => {
            console.log(`   ${p.posicao}º ${p.nome_cartola} (${p.nome_time}) - ${p.pontos.toFixed(2)} pts`);
        });

        // 2. Buscar liga para pegar configurações
        const ligaOid = new mongoose.Types.ObjectId(LIGA_SOBRAL_ID);
        const liga = await db.collection('ligas').findOne({ _id: ligaOid });

        if (!liga) {
            console.log('❌ Liga não encontrada!');
            await mongoose.disconnect();
            return;
        }

        console.log(`\n📋 Liga: ${liga.nome}`);

        // 3. Formatar ranking para o formato do rankinggeralcaches
        const novoRanking = rankingTurno.ranking.map(p => ({
            timeId: p.timeId,
            nome_cartola: p.nome_cartola,
            nome_time: p.nome_time,
            escudo: p.escudo || '',
            clube_id: null,
            pontos_totais: p.pontos,
            rodadas_jogadas: p.rodadas_jogadas,
            posicao: p.posicao
        }));

        console.log('\n📊 Novo ranking formatado:');
        novoRanking.forEach(p => {
            console.log(`   ${p.posicao}º ${p.nome_cartola} - ${p.pontos_totais.toFixed(2)} pts (${p.rodadas_jogadas} rodadas)`);
        });

        if (isDryRun) {
            console.log('\n[DRY-RUN] Seria salvo cache com', novoRanking.length, 'participantes');
            await mongoose.disconnect();
            return;
        }

        // 4. Atualizar ou criar o rankinggeralcaches
        console.log('\n📝 Salvando rankinggeralcaches...');

        // Deletar cache antigo (com dados zerados)
        const deleteResult = await db.collection('rankinggeralcaches').deleteMany({
            ligaId: ligaOid
        });
        console.log(`   🗑️ Caches antigos deletados: ${deleteResult.deletedCount}`);

        // Inserir novo cache
        const insertResult = await db.collection('rankinggeralcaches').insertOne({
            ligaId: ligaOid,
            rodadaFinal: 38,
            temporada: 2025,
            ranking: novoRanking,
            atualizadoEm: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            cache_permanente: true,
            temporada_finalizada: true
        });

        console.log(`   ✅ Novo cache criado: ${insertResult.insertedId}`);

        // 5. Verificação final
        console.log('\n🔍 Verificação final...');
        const cacheVerificacao = await db.collection('rankinggeralcaches').findOne({
            ligaId: ligaOid
        });

        if (cacheVerificacao && cacheVerificacao.ranking) {
            console.log(`✅ Cache verificado: ${cacheVerificacao.ranking.length} participantes`);
            console.log('📋 Campeão: ' + cacheVerificacao.ranking[0]?.nome_cartola);
        }

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('✅ Ranking da Liga Sobral regenerado com sucesso!');
        console.log('═══════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

main();
