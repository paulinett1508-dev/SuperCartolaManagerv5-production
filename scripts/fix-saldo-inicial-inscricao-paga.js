/**
 * Script GENÉRICO para corrigir saldo_inicial_temporada quando pagou_inscricao: true
 *
 * Problema: Inscrições criadas com saldo_inicial_temporada = -taxa, mesmo quando
 * pagou_inscricao: true. O frontend usa saldo_inicial_temporada diretamente,
 * então participantes aparecem como "DEVE" mesmo tendo pago.
 *
 * Lógica correta:
 * - Se pagou_inscricao: true → saldo_inicial_temporada = saldo_transferido (sem débito de taxa)
 * - Se pagou_inscricao: false → saldo_inicial_temporada = saldo_transferido - taxa_inscricao
 *
 * Uso:
 *   node scripts/fix-saldo-inicial-inscricao-paga.js --dry-run           # Simula
 *   node scripts/fix-saldo-inicial-inscricao-paga.js --force             # Executa (requer flag explícita)
 *   node scripts/fix-saldo-inicial-inscricao-paga.js --liga 6977a62...   # Liga específica
 *   node scripts/fix-saldo-inicial-inscricao-paga.js --temporada 2026    # Temporada específica
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Parsear argumentos
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const ligaIndex = args.indexOf('--liga');
const temporadaIndex = args.indexOf('--temporada');

// ✅ J2 FIX: Safety guard — exige --dry-run ou --force
if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

const LIGA_ID = ligaIndex !== -1 ? args[ligaIndex + 1] : null;
const TEMPORADA = temporadaIndex !== -1 ? parseInt(args[temporadaIndex + 1]) : 2026;

async function main() {
    console.log('='.repeat(60));
    console.log('Corrigir saldo_inicial_temporada para Inscrições Pagas');
    console.log('='.repeat(60));
    console.log(`Temporada: ${TEMPORADA}`);
    console.log(`Liga: ${LIGA_ID || 'TODAS'}`);
    console.log(`Modo: ${isDryRun ? 'DRY-RUN (simulação)' : 'EXECUÇÃO REAL'}`);
    console.log('='.repeat(60));

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado ao MongoDB\n');

        const InscricaoTemporada = mongoose.connection.collection('inscricoestemporada');

        // Buscar inscrições pagas que têm saldo negativo (errado)
        const filtro = {
            temporada: TEMPORADA,
            pagou_inscricao: true,
            saldo_inicial_temporada: { $lt: 0 }  // Negativo = incorreto
        };
        if (LIGA_ID) {
            filtro.liga_id = LIGA_ID;
        }

        const inscricoes = await InscricaoTemporada.find(filtro).toArray();
        console.log(`📋 Encontradas ${inscricoes.length} inscrições pagas com saldo negativo incorreto\n`);

        if (inscricoes.length === 0) {
            console.log('✅ Nenhuma inscrição precisa de correção.');
            return;
        }

        let corrigidos = 0;
        let erros = 0;

        for (const inscricao of inscricoes) {
            const nomeCartoleiro = inscricao.dados_participante?.nome_cartoleiro || inscricao.time_id;
            const nomeTime = inscricao.dados_participante?.nome_time || '';

            // Calcular saldo correto: saldo_transferido (sem desconto de taxa, pois já pagou)
            const saldoCorreto = inscricao.saldo_transferido || 0;
            const saldoAtual = inscricao.saldo_inicial_temporada;

            console.log(`${nomeCartoleiro} (${nomeTime})`);
            console.log(`   Saldo atual: R$ ${saldoAtual} (INCORRETO)`);
            console.log(`   Saldo correto: R$ ${saldoCorreto}`);

            if (!isDryRun) {
                try {
                    await InscricaoTemporada.updateOne(
                        { _id: inscricao._id },
                        {
                            $set: {
                                saldo_inicial_temporada: saldoCorreto,
                                atualizado_em: new Date(),
                                observacoes: (inscricao.observacoes || '') +
                                    ` | Saldo corrigido em ${new Date().toISOString()} (era ${saldoAtual})`
                            }
                        }
                    );
                    console.log(`   ✅ Corrigido para R$ ${saldoCorreto}\n`);
                    corrigidos++;
                } catch (err) {
                    console.error(`   ❌ Erro ao corrigir: ${err.message}\n`);
                    erros++;
                }
            } else {
                console.log(`   [DRY-RUN] Corrigiria para R$ ${saldoCorreto}\n`);
                corrigidos++;
            }
        }

        console.log('='.repeat(60));
        console.log('RESUMO:');
        console.log(`  ✅ Corrigidos: ${corrigidos}`);
        console.log(`  ❌ Erros: ${erros}`);
        console.log('='.repeat(60));

        if (isDryRun) {
            console.log('\n⚠️  Modo DRY-RUN: Nenhuma alteração foi feita.');
            console.log('   Execute sem --dry-run para aplicar as mudanças.');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado do MongoDB');
    }
}

main();
