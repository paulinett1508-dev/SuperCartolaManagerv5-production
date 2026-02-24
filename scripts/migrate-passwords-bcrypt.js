#!/usr/bin/env node

/**
 * MIGRAÇÃO DE SENHAS - Plaintext → Bcrypt
 *
 * Migra todas as senhas de participantes (senha_acesso) de plaintext para bcrypt hash.
 * Seguro para executar múltiplas vezes (idempotente): pula senhas já hashadas.
 *
 * Uso:
 *   node scripts/migrate-passwords-bcrypt.js --dry-run   # Simular (não altera nada)
 *   node scripts/migrate-passwords-bcrypt.js --force      # Executar migração
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

if (!MONGO_URI) {
    console.error('❌ MONGO_URI nao configurada');
    process.exit(1);
}

async function migrate() {
    console.log(`\n🔐 Migração de Senhas → Bcrypt`);
    console.log(`📋 Modo: ${isDryRun ? 'DRY-RUN (simulação)' : 'FORCE (execução real)'}\n`);

    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    const ligasCollection = db.collection('ligas');

    const ligas = await ligasCollection.find({}).toArray();
    console.log(`📊 ${ligas.length} ligas encontradas\n`);

    let totalParticipantes = 0;
    let jaHashadas = 0;
    let semSenha = 0;
    let migradas = 0;
    let erros = 0;

    for (const liga of ligas) {
        const participantes = liga.participantes || [];
        if (participantes.length === 0) continue;

        console.log(`📋 Liga: ${liga.nome || liga._id} (${participantes.length} participantes)`);

        for (const p of participantes) {
            totalParticipantes++;
            const senha = p.senha_acesso;

            if (!senha || senha === '') {
                semSenha++;
                continue;
            }

            // Pular senhas já hashadas (idempotente)
            if (senha.startsWith('$2a$') || senha.startsWith('$2b$')) {
                jaHashadas++;
                continue;
            }

            // Senha em plaintext - precisa migrar
            if (isDryRun) {
                console.log(`  → [DRY-RUN] time_id=${p.time_id}: seria migrada (${senha.length} chars)`);
                migradas++;
                continue;
            }

            try {
                const hash = await bcrypt.hash(senha, 10);
                await ligasCollection.updateOne(
                    { _id: liga._id, 'participantes.time_id': p.time_id },
                    { $set: { 'participantes.$.senha_acesso': hash } }
                );
                migradas++;
                console.log(`  ✅ time_id=${p.time_id}: migrada`);
            } catch (err) {
                erros++;
                console.error(`  ❌ time_id=${p.time_id}: erro - ${err.message}`);
            }
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTADO DA MIGRAÇÃO');
    console.log('='.repeat(50));
    console.log(`  Total participantes: ${totalParticipantes}`);
    console.log(`  Ja hashadas (bcrypt): ${jaHashadas}`);
    console.log(`  Sem senha definida:   ${semSenha}`);
    console.log(`  ${isDryRun ? 'Seriam migradas' : 'Migradas'}:       ${migradas}`);
    console.log(`  Erros:                ${erros}`);
    console.log('='.repeat(50));

    await mongoose.disconnect();
    console.log('\n✅ Conexão encerrada');
}

migrate().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
