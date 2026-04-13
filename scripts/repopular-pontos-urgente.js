/**
 * Script: repopular-pontos-urgente.js
 * Re-busca dados.pontos do Cartola FC para todas as ligas ativas
 * e sobrescreve os valores armazenados na collection Rodada.
 *
 * USO:
 *   node scripts/repopular-pontos-urgente.js --rodada=3 --dry-run
 *   node scripts/repopular-pontos-urgente.js --rodada=3 --force
 *   node scripts/repopular-pontos-urgente.js --force            ← detecta a rodada mais recente automaticamente
 *   node scripts/repopular-pontos-urgente.js --rodada=3 --force --ligaId=<id>
 *
 * O que faz:
 *   1. Para cada liga ativa (ou ligaId específico)
 *   2. Busca todos os times da liga
 *   3. Chama https://api.cartola.globo.com/time/id/{timeId}/{rodada}
 *   4. Sobrescreve Rodada.pontos com dados.pontos retornado pela API
 *   5. Recalcula posições e valorFinanceiro
 *
 * Por que é necessário:
 *   processar_rodada() pode ser chamado antes do Cartola finalizar
 *   a pontuação com substituições de reserva. Este script re-sincroniza
 *   com o valor atual da API (já com reservas computadas).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const rodadaArg = args.find(a => a.startsWith('--rodada='));
const ligaIdArg = args.find(a => a.startsWith('--ligaId='));

const rodadaNum = rodadaArg ? parseInt(rodadaArg.split('=')[1]) : null;
const filtroLigaId = ligaIdArg ? ligaIdArg.split('=')[1] : null;

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI não definida no .env');
    process.exit(1);
}

// Rate limit entre chamadas à API Cartola
const DELAY_MS = 300;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── helpers ───────────────────────────────────────────────────────────────

function getValorFinanceiroPosicao(configRanking, posicao) {
    const valores = configRanking?.valores || {};
    return valores[posicao] || valores[String(posicao)] || 0;
}

function getConfigRankingRodada(liga, rodada) {
    const config = liga?.configuracoes?.ranking_rodada;
    if (!config) return { valores: {} };
    if (config.temporal) {
        const fase = rodada < (config.rodada_transicao || 30) ? 'fase1' : 'fase2';
        return { valores: (config[fase] || {}).valores || {} };
    }
    return { valores: config.valores || {} };
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB conectado');

    const db = mongoose.connection.db;
    const Rodada = db.collection('rodadas');
    const Ligas = db.collection('ligas');
    const Times = db.collection('times');

    // 1. Descobrir rodada a re-popular (arg ou última populada)
    let rodada = rodadaNum;
    if (!rodada) {
        const ultimo = await Rodada.find(
            { temporada: CURRENT_SEASON },
            { projection: { rodada: 1 } }
        ).sort({ rodada: -1 }).limit(1).toArray();

        if (!ultimo.length) {
            console.error('❌ Nenhuma rodada encontrada na temporada', CURRENT_SEASON);
            process.exit(1);
        }
        rodada = ultimo[0].rodada;
        console.log(`ℹ️  Rodada não informada — usando a mais recente: rodada ${rodada}`);
    }

    console.log(`\n🔄 Re-populando rodada ${rodada} (temporada ${CURRENT_SEASON})`);
    if (isDryRun) console.log('   [DRY-RUN — nenhuma escrita será feita]');

    // 2. Buscar ligas
    const filtroLiga = filtroLigaId
        ? { _id: new mongoose.Types.ObjectId(filtroLigaId) }
        : {};

    const ligas = await Ligas.find(filtroLiga).toArray();
    console.log(`\n📋 Ligas encontradas: ${ligas.length}`);

    let totalAlteracoes = 0;
    let totalSemMudanca = 0;
    let totalErros = 0;

    for (const liga of ligas) {
        const ligaId = liga._id;
        const ligaNome = liga.nome || String(ligaId);
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🏆 Liga: ${ligaNome} (${ligaId})`);

        // Verificar se esta liga tem registros nesta rodada
        const registrosExistentes = await Rodada.find({
            ligaId,
            rodada,
            temporada: CURRENT_SEASON,
        }).toArray();

        if (!registrosExistentes.length) {
            console.log(`   ⚠️  Nenhum registro encontrado para rodada ${rodada} — pulando`);
            continue;
        }

        console.log(`   📊 ${registrosExistentes.length} registros encontrados`);

        // Mapear timeIds desta liga nesta rodada
        const timeIds = registrosExistentes
            .filter(r => r.timeId != null)
            .map(r => r.timeId);

        if (!timeIds.length) {
            console.log(`   ⚠️  Sem timeIds válidos — pulando`);
            continue;
        }

        // Re-buscar pontos do Cartola para cada time
        const dadosAtualizados = [];

        for (const timeId of timeIds) {
            try {
                const url = `https://api.cartola.globo.com/time/id/${timeId}/${rodada}`;
                const res = await fetch(url);

                if (!res.ok) {
                    console.log(`   ⚠️  API retornou ${res.status} para time ${timeId}`);
                    totalErros++;
                    await sleep(DELAY_MS);
                    continue;
                }

                const dados = await res.json();
                const pontosFresh = dados.pontos || 0;

                // Encontrar registro atual
                const registroAtual = registrosExistentes.find(r => r.timeId === timeId);
                const pontosAntigo = registroAtual?.pontos || 0;

                const mudou = Math.abs(pontosFresh - pontosAntigo) > 0.001;

                if (mudou) {
                    console.log(`   🔄 Time ${timeId} (${registroAtual?.nome_cartola || '?'}): ${pontosAntigo.toFixed(2)} → ${pontosFresh.toFixed(2)} pts`);
                } else {
                    console.log(`   ✓  Time ${timeId} (${registroAtual?.nome_cartola || '?'}): ${pontosFresh.toFixed(2)} pts (sem mudança)`);
                }

                dadosAtualizados.push({ timeId, pontos: pontosFresh, nome_cartola: registroAtual?.nome_cartola, mudou });
            } catch (err) {
                console.log(`   ❌ Erro time ${timeId}: ${err.message}`);
                totalErros++;
            }

            await sleep(DELAY_MS);
        }

        if (!dadosAtualizados.length) {
            console.log(`   ⚠️  Nenhum dado obtido da API — pulando atualização`);
            continue;
        }

        // Recalcular posições com pontos atualizados
        const configRanking = getConfigRankingRodada(liga, rodada);
        dadosAtualizados.sort((a, b) => b.pontos - a.pontos);

        const ligaAlteracoes = dadosAtualizados.filter(d => d.mudou).length;
        const ligaSemMudanca = dadosAtualizados.length - ligaAlteracoes;
        totalAlteracoes += ligaAlteracoes;
        totalSemMudanca += ligaSemMudanca;

        if (!isDryRun) {
            for (let i = 0; i < dadosAtualizados.length; i++) {
                const time = dadosAtualizados[i];
                const posicao = i + 1;
                const valorFinanceiro = getValorFinanceiroPosicao(configRanking, posicao);

                await Rodada.updateOne(
                    { ligaId, rodada, timeId: time.timeId, temporada: CURRENT_SEASON },
                    {
                        $set: {
                            pontos: time.pontos,
                            posicao,
                            valorFinanceiro,
                            totalParticipantesAtivos: dadosAtualizados.length,
                        }
                    }
                );
            }
            console.log(`   ✅ ${ligaAlteracoes} registros atualizados, ${ligaSemMudanca} sem mudança`);
        } else {
            console.log(`   [DRY-RUN] Atualizaria ${ligaAlteracoes} registros, ${ligaSemMudanca} sem mudança`);
        }
    }

    // Resumo final
    console.log(`\n${'═'.repeat(42)}`);
    console.log(`📊 RESUMO`);
    console.log(`   Rodada:          ${rodada}`);
    console.log(`   Temporada:       ${CURRENT_SEASON}`);
    console.log(`   Ligas:           ${ligas.length}`);
    console.log(`   Pontos alterados: ${totalAlteracoes}`);
    console.log(`   Sem mudança:     ${totalSemMudanca}`);
    console.log(`   Erros API:       ${totalErros}`);
    if (isDryRun) {
        console.log(`\n   ⚠️  DRY-RUN — nada foi gravado. Execute com --force para aplicar.`);
    } else {
        console.log(`\n   ✅ Banco atualizado com pontos finais do Cartola FC.`);
        console.log(`   💡 Limpe o cache do servidor para que os dados novos apareçam:`);
        console.log(`      Acesse /api/parciais/cache/clear no admin, ou reinicie o container.`);
    }

    await mongoose.disconnect();
    console.log('Desconectado do MongoDB.\n');
}

main().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
