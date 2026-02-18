#!/usr/bin/env node
/**
 * MIGRAÇÃO: Adicionar campo temporada aos documentos existentes
 *
 * Este script adiciona temporada=2025 a todos os documentos que ainda não têm
 * o campo temporada, garantindo compatibilidade com a nova arquitetura.
 *
 * Uso:
 *   node scripts/migrar-temporada-2025.js          # Executar migração
 *   node scripts/migrar-temporada-2025.js --dry    # Apenas simular (não altera dados)
 *
 * @version 1.0.0
 * @date 2025-12-16
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// =========================================================================
// CONFIGURAÇÃO
// =========================================================================
const TEMPORADA_PADRAO = 2025;
const DRY_RUN = process.argv.includes('--dry');

// Collections para migrar (todas que receberam o campo temporada)
const COLLECTIONS_PARA_MIGRAR = [
    'ligas',
    'times',
    'rodadas',
    'extratofinanceirocaches',
    'rodadasnapshots',
    'pontoscorridoscaches',
    'top10caches',
    'matamatacaches',
    'melhor_mes_cache',
    'rankinggeralcaches',
    'fluxofinanceirocampos',
    'rankingturno',
    'gols',
    'goleiros',
    'artilheirocampeaos',
    'acertofinanceiros',
];

// Banco único — cartola-manager
const getMongoURI = () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ ERRO: MONGO_URI não configurada!');
        process.exit(1);
    }
    console.log('MIGRAÇÃO: Conectando ao banco cartola-manager');
    return uri;
};

// =========================================================================
// FUNÇÕES DE MIGRAÇÃO
// =========================================================================

async function migrarCollection(db, collectionName) {
    const collection = db.collection(collectionName);

    // Contar documentos sem temporada
    const countSemTemporada = await collection.countDocuments({
        temporada: { $exists: false }
    });

    if (countSemTemporada === 0) {
        console.log(`   ✅ ${collectionName}: Nenhum documento para migrar`);
        return { collection: collectionName, migrados: 0, total: 0 };
    }

    console.log(`   📦 ${collectionName}: ${countSemTemporada} documentos sem temporada`);

    if (DRY_RUN) {
        console.log(`   ⏸️  ${collectionName}: [DRY RUN] Pulando atualização`);
        return { collection: collectionName, migrados: 0, total: countSemTemporada, dryRun: true };
    }

    // Executar migração
    const result = await collection.updateMany(
        { temporada: { $exists: false } },
        { $set: { temporada: TEMPORADA_PADRAO } }
    );

    console.log(`   ✅ ${collectionName}: ${result.modifiedCount} documentos migrados`);

    return {
        collection: collectionName,
        migrados: result.modifiedCount,
        total: countSemTemporada
    };
}

async function executarMigracao() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  MIGRAÇÃO: Adicionar campo temporada aos documentos');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Temporada padrão: ${TEMPORADA_PADRAO}`);
    console.log(`  Modo: ${DRY_RUN ? '🔍 DRY RUN (simulação)' : '🔧 EXECUÇÃO REAL'}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    const mongoURI = getMongoURI();

    try {
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado ao MongoDB\n');

        const db = mongoose.connection.db;
        const resultados = [];

        console.log('📋 Migrando collections...\n');

        for (const collectionName of COLLECTIONS_PARA_MIGRAR) {
            try {
                const resultado = await migrarCollection(db, collectionName);
                resultados.push(resultado);
            } catch (error) {
                console.log(`   ❌ ${collectionName}: Erro - ${error.message}`);
                resultados.push({
                    collection: collectionName,
                    erro: error.message
                });
            }
        }

        // Resumo
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  RESUMO DA MIGRAÇÃO');
        console.log('═══════════════════════════════════════════════════════════════');

        let totalMigrados = 0;
        let totalPendentes = 0;
        let erros = 0;

        resultados.forEach(r => {
            if (r.erro) {
                erros++;
            } else if (r.dryRun) {
                totalPendentes += r.total;
            } else {
                totalMigrados += r.migrados;
            }
        });

        if (DRY_RUN) {
            console.log(`  📊 Documentos que seriam migrados: ${totalPendentes}`);
            console.log('  ⚠️  Execute sem --dry para aplicar a migração');
        } else {
            console.log(`  ✅ Total de documentos migrados: ${totalMigrados}`);
        }

        if (erros > 0) {
            console.log(`  ❌ Collections com erro: ${erros}`);
        }

        console.log('═══════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Erro fatal na migração:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado do MongoDB');
    }
}

// =========================================================================
// EXECUTAR
// =========================================================================
executarMigracao();
