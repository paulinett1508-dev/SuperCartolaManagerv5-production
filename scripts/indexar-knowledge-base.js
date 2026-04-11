#!/usr/bin/env node

/**
 * INDEXAR KNOWLEDGE BASE — Big Cartola IA
 * Script CLI para indexar documentos no MongoDB Atlas Vector Search.
 *
 * Uso:
 *   node scripts/indexar-knowledge-base.js              # indexar (incremental)
 *   node scripts/indexar-knowledge-base.js --force       # reindexar tudo
 *   node scripts/indexar-knowledge-base.js --dry-run     # listar sem salvar
 *   node scripts/indexar-knowledge-base.js --status      # verificar status
 */

import dotenv from 'dotenv';
dotenv.config();

import ragChatbotService from '../services/ragChatbotService.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const statusOnly = args.includes('--status');

async function main() {
    console.log('='.repeat(60));
    console.log('  BIG CARTOLA IA — Indexacao da Knowledge Base');
    console.log('='.repeat(60));

    if (!ragChatbotService.isLLMDisponivel()) {
        console.error('\n❌ OPENAI_API_KEY nao configurada no .env');
        console.error('   Adicione: OPENAI_API_KEY=sk-proj-...');
        process.exit(1);
    }

    if (statusOnly) {
        const status = await ragChatbotService.getStatus();
        console.log('\n📊 Status:');
        console.log(`   Disponivel: ${status.disponivel ? 'Sim' : 'Nao'}`);
        console.log(`   Indexado: ${status.indexado ? 'Sim' : 'Nao'}`);
        console.log(`   Total chunks: ${status.totalChunks}`);
        console.log(`   Modelo LLM: ${status.modelo}`);
        console.log(`   Modelo Embedding: ${status.embeddingModel}`);
        process.exit(0);
    }

    console.log(`\n🔧 Modo: ${dryRun ? 'DRY RUN (sem salvar)' : force ? 'FORCE (reindexar tudo)' : 'Incremental'}`);

    try {
        const resultado = await ragChatbotService.indexarDocumentos({ force, dryRun });

        console.log('\n✅ Resultado:');
        console.log(`   Documentos fonte: ${resultado.total}`);
        console.log(`   Chunks gerados: ${resultado.chunks}`);
        console.log(`   Duracao: ${resultado.duracao}ms`);

        if (dryRun) {
            console.log('\n⚠️  DRY RUN — nenhum dado foi salvo. Remova --dry-run para indexar.');
        } else {
            console.log('\n📌 Lembrete: Certifique-se de criar o Atlas Vector Search Index:');
            console.log('   Collection: rag_embeddings');
            console.log('   Index Name: vector_index');
            console.log('   Field: embedding (1536 dimensions, cosine)');
        }
    } catch (error) {
        console.error(`\n❌ Erro: ${error.message}`);
        process.exit(1);
    }

    process.exit(0);
}

main();
