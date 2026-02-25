/**
 * Script para restaurar dumps de rodadas de um time específico
 * Busca dados da API Cartola e salva na collection cartola_oficial_dumps
 *
 * Uso:
 *   node scripts/restaurar-dumps-time.js <time_id> [--dry-run] [--force]
 *   node scripts/restaurar-dumps-time.js 645089 --force
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CartolaOficialDump from '../models/CartolaOficialDump.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const LIGA_ID = '684cb1c8af923da7c7df51de'; // Super Cartola 2025

// Delay entre requests para não sobrecarregar a API
const DELAY_MS = 500;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function buscarDadosRodada(timeId, rodada) {
    const url = `https://api.cartola.globo.com/time/id/${timeId}/${rodada}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return {
                success: false,
                status: response.status,
                error: `HTTP ${response.status}`
            };
        }

        const data = await response.json();
        return {
            success: true,
            status: response.status,
            data,
            url
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function restaurarDumps() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔄 RESTAURAR DUMPS - Cartola Oficial');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const timeId = parseInt(args[0]) || 645089;
    const isDryRun = process.argv.includes('--dry-run');
    const isForce = process.argv.includes('--force');

    console.log(`📋 Time ID: ${timeId}`);
    console.log(`📋 Liga: ${LIGA_ID}`);

    if (isDryRun) {
        console.log('🔍 MODO DRY-RUN - Nenhuma alteração será feita\n');
    }

    if (!isDryRun && !isForce) {
        console.log('\n⚠️  Use --dry-run para simular ou --force para executar');
        return;
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB\n');

        // Verificar dumps existentes
        const dumpsExistentes = await CartolaOficialDump.find({
            time_id: timeId,
            tipo_coleta: 'time_rodada',
            temporada: 2025
        }).select('rodada').lean();

        const rodadasExistentes = new Set(dumpsExistentes.map(d => d.rodada));
        console.log(`📊 Dumps existentes (time_rodada): ${dumpsExistentes.length}`);

        // Determinar rodadas faltantes
        const todasRodadas = Array.from({ length: 38 }, (_, i) => i + 1);
        const rodadasFaltantes = todasRodadas.filter(r => !rodadasExistentes.has(r));

        console.log(`📊 Rodadas faltantes: ${rodadasFaltantes.length}`);
        if (rodadasFaltantes.length > 0 && rodadasFaltantes.length <= 10) {
            console.log(`   Rodadas: ${rodadasFaltantes.join(', ')}`);
        }

        if (rodadasFaltantes.length === 0) {
            console.log('\n✅ Todas as 38 rodadas já estão salvas!');
            await mongoose.disconnect();
            return;
        }

        console.log('\n🔄 Buscando dados da API Cartola...\n');

        let salvos = 0;
        let erros = 0;

        for (const rodada of rodadasFaltantes) {
            process.stdout.write(`   Rodada ${rodada.toString().padStart(2)}... `);

            const resultado = await buscarDadosRodada(timeId, rodada);

            if (resultado.success) {
                const raw = resultado.data;

                // Verificar se tem dados válidos (não apenas status do mercado)
                if (raw.time && raw.time.time_id) {
                    if (!isDryRun) {
                        await CartolaOficialDump.salvarDump({
                            time_id: timeId,
                            temporada: 2025,
                            rodada: rodada,
                            tipo_coleta: 'time_rodada',
                            raw_json: raw,
                            meta: {
                                url_origem: resultado.url,
                                http_status: resultado.status,
                                origem_trigger: 'manual',
                                liga_id: new mongoose.Types.ObjectId(LIGA_ID)
                            }
                        });
                    }

                    const pontos = raw.pontos?.toFixed(2) || 'N/A';
                    console.log(`✅ ${raw.time.nome} - ${pontos} pts`);
                    salvos++;
                } else {
                    console.log(`⚠️ Dados incompletos (sem time.time_id)`);
                    erros++;
                }
            } else {
                console.log(`❌ ${resultado.error}`);
                erros++;
            }

            // Delay para não sobrecarregar a API
            await delay(DELAY_MS);
        }

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`📊 RESULTADO:`);
        console.log(`   ✅ Rodadas salvas: ${salvos}`);
        console.log(`   ❌ Erros: ${erros}`);
        console.log(`   📁 Total na collection: ${dumpsExistentes.length + salvos}`);
        console.log('═══════════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

restaurarDumps();
