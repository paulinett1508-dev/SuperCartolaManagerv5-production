/**
 * Script: artilheiro-recoletar-rodada.js
 * Limpa GolsConsolidados de uma rodada e re-coleta via API Cartola
 *
 * Uso:
 *   node scripts/artilheiro-recoletar-rodada.js --rodada=3 --dry-run
 *   node scripts/artilheiro-recoletar-rodada.js --rodada=3 --force
 *   node scripts/artilheiro-recoletar-rodada.js --rodada=3 --force --ligaId=<id>
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

if (!rodadaNum) {
    console.error('❌ Informe --rodada=N');
    process.exit(1);
}

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
}

// Rate limiter simples
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchComRetry(url, tentativas = 3) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return res;
            console.warn(`  ⚠️ HTTP ${res.status} em ${url} (tentativa ${i+1})`);
        } catch (e) {
            console.warn(`  ⚠️ Erro fetch ${url}: ${e.message} (tentativa ${i+1})`);
        }
        await sleep(500);
    }
    return null;
}

async function main() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 ARTILHEIRO - Limpar + Re-coletar Rodada ${rodadaNum}`);
    console.log(`📅 Temporada: ${CURRENT_SEASON}`);
    console.log(`🔧 Modo: ${isDryRun ? 'DRY-RUN (simulação)' : 'FORCE (execução real)'}`);
    if (filtroLigaId) console.log(`🎯 Liga: ${filtroLigaId}`);
    console.log(`${'='.repeat(60)}\n`);

    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB conectado\n');

    const db = mongoose.connection.db;

    // Buscar ligas com artilheiro ativo
    const ligas = await db.collection('ligas').find({
        $or: [
            { 'modulos_ativos.artilheiro': true },
            { 'configuracoes.artilheiro.habilitado': true },
        ],
        ...(filtroLigaId ? { _id: new mongoose.Types.ObjectId(filtroLigaId) } : {}),
    }).toArray();

    if (ligas.length === 0) {
        console.log('❌ Nenhuma liga com artilheiro ativo encontrada');
        process.exit(0);
    }

    console.log(`📋 ${ligas.length} liga(s) com artilheiro ativo:\n`);
    ligas.forEach(l => console.log(`   - ${l.nome} (${l._id})`));
    console.log();

    // Verificar status do mercado
    console.log('🌐 Verificando status do mercado Cartola...');
    const statusRes = await fetchComRetry('https://api.cartola.globo.com/mercado/status');
    let atletasPontuados = null;
    let rodadaAtual = null;
    let mercadoAberto = true;

    if (statusRes) {
        const statusData = await statusRes.json();
        rodadaAtual = statusData.rodada_atual;
        mercadoAberto = statusData.status_mercado === 1;
        const rodadaEmAndamento = !mercadoAberto && statusData.status_mercado !== 6 && statusData.status_mercado !== 4;

        console.log(`   Rodada atual: ${rodadaAtual}, Status: ${statusData.status_mercado}, Mercado aberto: ${mercadoAberto}`);

        if (rodadaEmAndamento && rodadaAtual === rodadaNum) {
            console.log(`   🔴 Rodada ${rodadaNum} em andamento - buscando scouts ao vivo...`);
            const pontuadosRes = await fetchComRetry('https://api.cartola.globo.com/atletas/pontuados');
            if (pontuadosRes) {
                const pontuadosData = await pontuadosRes.json();
                atletasPontuados = pontuadosData.atletas || {};
                console.log(`   📊 ${Object.keys(atletasPontuados).length} atletas pontuados ao vivo`);
            }
        } else {
            console.log(`   📋 Rodada ${rodadaNum} não está em andamento - usando scouts históricos`);
        }
    } else {
        console.warn('   ⚠️ Não foi possível verificar status do mercado - continuando com scouts históricos');
    }

    console.log();

    // Processar cada liga
    for (const liga of ligas) {
        const ligaId = String(liga._id);
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`🏆 Liga: ${liga.nome} (${ligaId})`);

        // Buscar times da liga
        const timeIds = liga.times || [];
        console.log(`   👥 ${timeIds.length} times\n`);

        // PASSO 1: Limpar registros da rodada no MongoDB
        const filtroLimpeza = {
            ligaId,
            rodada: rodadaNum,
            temporada: CURRENT_SEASON,
        };

        const existentes = await db.collection('golsconsolidados').countDocuments(filtroLimpeza);
        console.log(`   🗑️  Registros a limpar: ${existentes}`);

        if (!isDryRun && existentes > 0) {
            const del = await db.collection('golsconsolidados').deleteMany(filtroLimpeza);
            console.log(`   ✅ ${del.deletedCount} registros deletados`);
        } else if (isDryRun) {
            console.log(`   [DRY-RUN] Seriam deletados ${existentes} registros`);
        }

        // PASSO 2: Re-coletar via API Cartola para cada time
        console.log(`\n   📥 Re-coletando R${rodadaNum} para ${timeIds.length} times...`);

        let sucesso = 0;
        let falha = 0;
        let totalGolsPro = 0;
        let totalGolsContra = 0;

        for (const timeId of timeIds) {
            await sleep(250); // rate limit

            const url = `https://api.cartola.globo.com/time/id/${timeId}/${rodadaNum}`;
            const res = await fetchComRetry(url);

            if (!res) {
                console.log(`   ❌ time ${timeId}: erro na API`);
                falha++;
                continue;
            }

            const data = await res.json();
            const atletas = data.atletas || [];

            let golsPro = 0;
            let golsContra = 0;
            const jogadores = [];

            for (const atleta of atletas) {
                let gols = 0;
                let gc = 0;

                // Prioridade 1: scouts ao vivo
                if (atletasPontuados && atletasPontuados[atleta.atleta_id]?.scout) {
                    const s = atletasPontuados[atleta.atleta_id].scout;
                    gols = s.G || 0;
                    gc = s.GC || 0;
                }

                // Prioridade 2: scouts históricos
                if (gols === 0 && gc === 0) {
                    const scout = atleta.scout || {};
                    gols = scout.G || 0;
                    gc = scout.GC || 0;
                }

                if (gols > 0 || gc > 0) {
                    golsPro += gols;
                    golsContra += gc;
                    jogadores.push({
                        atletaId: atleta.atleta_id,
                        nome: atleta.apelido,
                        gols,
                        golsContra: gc,
                    });
                }
            }

            const nomeTime = data.time?.nome || `time ${timeId}`;
            const preview = jogadores.length > 0
                ? ` | ${jogadores.map(j => `${j.nome}:${j.gols}G`).join(', ')}`
                : '';

            console.log(`   ${golsPro > 0 || golsContra > 0 ? '⚽' : '·'} ${nomeTime.padEnd(30)} GP:${golsPro} GC:${golsContra}${preview}`);

            if (!isDryRun) {
                await db.collection('golsconsolidados').findOneAndUpdate(
                    { ligaId, timeId, rodada: rodadaNum, temporada: CURRENT_SEASON },
                    {
                        $set: {
                            ligaId,
                            timeId,
                            rodada: rodadaNum,
                            temporada: CURRENT_SEASON,
                            golsPro,
                            golsContra,
                            saldo: golsPro - golsContra,
                            jogadores,
                            parcial: false,
                            dataColeta: new Date(),
                        },
                    },
                    { upsert: true },
                );
            }

            totalGolsPro += golsPro;
            totalGolsContra += golsContra;
            sucesso++;
        }

        console.log(`\n   📊 Resultado: ${sucesso} OK, ${falha} erros`);
        console.log(`   ⚽ Total da liga: ${totalGolsPro} gols pró, ${totalGolsContra} gols contra`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(isDryRun ? '🔍 DRY-RUN concluído — nada foi alterado' : '✅ Coleta concluída!');
    console.log(`${'='.repeat(60)}\n`);

    await mongoose.disconnect();
}

main().catch(e => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
});
