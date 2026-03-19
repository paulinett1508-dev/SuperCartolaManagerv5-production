/**
 * FIX: Recalcular cache MataMata Edição 5 (2025)
 *
 * PROBLEMA: O cache da Ed5 foi criado com calendário antigo (rodadaInicial=31),
 * mas o calendário foi corrigido para rodadaInicial=27 (commit 0797f0f, 04/fev/2026).
 * O cache nunca foi recalculado, resultando em confrontos com pontos das rodadas erradas.
 *
 * USO:
 *   node scripts/fix-matamata-ed5-2025.js --dry-run   (apenas mostra diff)
 *   node scripts/fix-matamata-ed5-2025.js --force      (aplica correção)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA = 2025;
const EDICAO = 5;

// Calendário CORRETO (após fix commit 0797f0f)
const ED5_CORRETO = {
    rodadaDefinicao: 26,
    rodadaInicial: 27,
    rodadaFinal: 31,
    fases: ['primeira', 'oitavas', 'quartas', 'semis', 'final'],
    rodadasFases: { primeira: 27, oitavas: 28, quartas: 29, semis: 30, final: 31 }
};

const isDryRun = !process.argv.includes('--force');

async function main() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`FIX MATAMATA ED5 2025 — ${isDryRun ? '🔍 DRY-RUN (sem alterações)' : '⚡ FORCE (vai alterar o banco)'}`);
    console.log(`${'='.repeat(60)}\n`);

    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const ligaIdObj = new mongoose.Types.ObjectId(LIGA_ID);

    // 1. Buscar ranking da rodada de definição (R26)
    const rankingBase = await db.collection('rodadas').find({
        ligaId: ligaIdObj, rodada: ED5_CORRETO.rodadaDefinicao, temporada: TEMPORADA
    }).sort({ pontos: -1 }).toArray();

    console.log(`Ranking R${ED5_CORRETO.rodadaDefinicao}: ${rankingBase.length} participantes`);
    if (rankingBase.length < 32) {
        console.error('ERRO: Menos de 32 participantes no ranking base');
        process.exit(1);
    }

    const classificados = rankingBase.slice(0, 32).map((r, idx) => ({
        timeId: String(r.timeId),
        nome: r.nome_time || r.nome_cartola,
        nome_cartola: r.nome_cartola,
        nome_time: r.nome_time,
        pontos: r.pontos,
        rankR2: idx + 1
    }));

    // 2. Calcular cada fase com rodadas CORRETAS
    const novosDadosTorneio = {};
    let vencedoresAnteriores = classificados;

    for (const fase of ED5_CORRETO.fases) {
        const rodada = ED5_CORRETO.rodadasFases[fase];

        // Buscar pontos da rodada
        const rodadaData = await db.collection('rodadas').find({
            ligaId: ligaIdObj, rodada, temporada: TEMPORADA
        }).toArray();

        const pontosMap = {};
        rodadaData.forEach(r => { pontosMap[String(r.timeId)] = r.pontos; });

        console.log(`\n--- ${fase.toUpperCase()} (R${rodada}) — ${rodadaData.length} participantes ---`);

        let confrontos;
        if (fase === 'primeira') {
            confrontos = montarConfrontosPrimeiraFase(classificados, pontosMap, 32);
        } else {
            const numJogos = Math.ceil(vencedoresAnteriores.length / 2);
            const vencedoresOrdenados = [...vencedoresAnteriores].sort(
                (a, b) => (a.jogoAnterior || 0) - (b.jogoAnterior || 0)
            );
            confrontos = montarConfrontosFase(vencedoresOrdenados, pontosMap, numJogos);
        }

        novosDadosTorneio[fase] = confrontos;

        // Determinar vencedores
        const proximosVencedores = [];
        for (const c of confrontos) {
            const { vencedor, perdedor } = determinarVencedor(c);
            const result = vencedor === c.timeA ? 'A VENCE' : 'B VENCE';
            console.log(`  J${c.jogo}: ${c.timeA.nome} (pts:${c.timeA.pontos} rk:${c.timeA.rankR2}) vs ${c.timeB.nome} (pts:${c.timeB.pontos} rk:${c.timeB.rankR2}) → ${result}`);

            if (vencedor) {
                vencedor.jogoAnterior = c.jogo;
                proximosVencedores.push(vencedor);
            }
        }

        vencedoresAnteriores = proximosVencedores;

        // Se final, registrar campeão
        if (fase === 'final' && confrontos.length > 0) {
            const { vencedor } = determinarVencedor(confrontos[0]);
            if (vencedor) novosDadosTorneio.campeao = vencedor;
        }
    }

    // 3. Comparar com cache atual
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPARAÇÃO: CACHE ATUAL vs RECALCULADO');
    console.log(`${'='.repeat(60)}`);

    const cacheAtual = await db.collection('matamatacaches').findOne({
        liga_id: LIGA_ID, edicao: EDICAO, temporada: TEMPORADA
    });

    if (cacheAtual) {
        const dtAtual = cacheAtual.dados_torneio || {};
        for (const fase of ED5_CORRETO.fases) {
            const atual = dtAtual[fase] || [];
            const novo = novosDadosTorneio[fase] || [];
            console.log(`\n${fase.toUpperCase()}:`);
            for (let i = 0; i < Math.max(atual.length, novo.length); i++) {
                const ca = atual[i];
                const cn = novo[i];
                if (ca && cn) {
                    const mesmoA = ca.timeA?.timeId === cn.timeA?.timeId;
                    const mesmoB = ca.timeB?.timeId === cn.timeB?.timeId;
                    const mesmoPtsA = ca.timeA?.pontos === cn.timeA?.pontos;
                    const mesmoPtsB = ca.timeB?.pontos === cn.timeB?.pontos;
                    const icon = (mesmoA && mesmoB && mesmoPtsA && mesmoPtsB) ? '✅' : '❌';
                    console.log(`  ${icon} J${i + 1}:`);
                    if (!mesmoA || !mesmoPtsA) {
                        console.log(`     timeA: ANTES=${ca.timeA?.nome}(${ca.timeA?.pontos}) → DEPOIS=${cn.timeA?.nome}(${cn.timeA?.pontos})`);
                    }
                    if (!mesmoB || !mesmoPtsB) {
                        console.log(`     timeB: ANTES=${ca.timeB?.nome}(${ca.timeB?.pontos}) → DEPOIS=${cn.timeB?.nome}(${cn.timeB?.pontos})`);
                    }
                    // Check winner change
                    const winAtual = determinarVencedor(ca);
                    const winNovo = determinarVencedor(cn);
                    if (winAtual.vencedor?.timeId !== winNovo.vencedor?.timeId) {
                        console.log(`     🔄 VENCEDOR MUDOU: ${winAtual.vencedor?.nome} → ${winNovo.vencedor?.nome}`);
                    }
                }
            }
        }

        // Campeão
        const campeaoAtual = dtAtual.campeao?.timeId || dtAtual.campeao?.nome;
        const campeaoNovo = novosDadosTorneio.campeao?.timeId || novosDadosTorneio.campeao?.nome;
        console.log(`\n🏆 CAMPEÃO: ANTES=${campeaoAtual} → DEPOIS=${campeaoNovo} ${campeaoAtual === campeaoNovo ? '✅ MESMO' : '❌ MUDOU'}`);
    }

    // 4. Aplicar correção se --force
    if (!isDryRun) {
        console.log(`\n${'='.repeat(60)}`);
        console.log('APLICANDO CORREÇÃO...');
        console.log(`${'='.repeat(60)}`);

        novosDadosTorneio.metadata = {
            tamanhoTorneio: 32,
            participantesAtivos: rankingBase.length,
            calculadoEm: new Date().toISOString(),
            fonte: 'fix-matamata-ed5-2025',
            motivo: 'Recálculo após correção de calendário (commit 0797f0f)'
        };

        // Atualizar ambos os documentos (string e ObjectId liga_id)
        const resultStr = await db.collection('matamatacaches').updateOne(
            { liga_id: LIGA_ID, edicao: EDICAO, temporada: TEMPORADA },
            {
                $set: {
                    dados_torneio: novosDadosTorneio,
                    tamanhoTorneio: 32,
                    participantesAtivos: rankingBase.length,
                    ultima_atualizacao: new Date()
                }
            }
        );
        console.log(`Cache string: matched=${resultStr.matchedCount}, modified=${resultStr.modifiedCount}`);

        const resultObj = await db.collection('matamatacaches').updateOne(
            { liga_id: ligaIdObj, edicao: EDICAO, temporada: TEMPORADA },
            {
                $set: {
                    dados_torneio: novosDadosTorneio,
                    tamanhoTorneio: 32,
                    participantesAtivos: rankingBase.length,
                    ultima_atualizacao: new Date()
                }
            }
        );
        console.log(`Cache ObjectId: matched=${resultObj.matchedCount}, modified=${resultObj.modifiedCount}`);

        console.log('\n✅ Correção aplicada com sucesso!');
    } else {
        console.log('\n🔍 DRY-RUN completo. Para aplicar: node scripts/fix-matamata-ed5-2025.js --force');
    }

    await mongoose.disconnect();
}

// ============================================================================
// FUNÇÕES DE CÁLCULO (espelho do mata-mata-backend.js)
// ============================================================================

function montarConfrontosPrimeiraFase(rankingBase, pontosRodadaAtual, tamanhoTorneio) {
    const confrontos = [];
    const metade = tamanhoTorneio / 2;
    for (let i = 0; i < metade; i++) {
        const timeA = rankingBase[i];
        const timeB = rankingBase[tamanhoTorneio - 1 - i];
        if (!timeA || !timeB) continue;
        confrontos.push({
            jogo: i + 1,
            timeA: { ...timeA, pontos: pontosRodadaAtual[timeA.timeId] ?? null, rankR2: i + 1 },
            timeB: { ...timeB, pontos: pontosRodadaAtual[timeB.timeId] ?? null, rankR2: tamanhoTorneio - i }
        });
    }
    return confrontos;
}

function montarConfrontosFase(vencedoresAnteriores, pontosRodadaAtual, numJogos) {
    const confrontos = [];
    for (let i = 0; i < numJogos; i++) {
        const timeA = vencedoresAnteriores[i * 2];
        const timeB = vencedoresAnteriores[i * 2 + 1];
        if (!timeA || !timeB) continue;
        confrontos.push({
            jogo: i + 1,
            jogoAnteriorA: timeA.jogoAnterior || '?',
            jogoAnteriorB: timeB.jogoAnterior || '?',
            timeA: { ...timeA, pontos: pontosRodadaAtual[timeA.timeId] ?? null },
            timeB: { ...timeB, pontos: pontosRodadaAtual[timeB.timeId] ?? null }
        });
    }
    return confrontos;
}

function determinarVencedor(confronto) {
    const { timeA, timeB } = confronto;
    const pontosAValidos = typeof timeA.pontos === 'number';
    const pontosBValidos = typeof timeB.pontos === 'number';
    let vencedor, perdedor;

    if (pontosAValidos && pontosBValidos) {
        if (timeA.pontos > timeB.pontos) { vencedor = timeA; perdedor = timeB; }
        else if (timeB.pontos > timeA.pontos) { vencedor = timeB; perdedor = timeA; }
        else {
            if ((timeA.rankR2 || 999) < (timeB.rankR2 || 999)) { vencedor = timeA; perdedor = timeB; }
            else { vencedor = timeB; perdedor = timeA; }
        }
    } else {
        if ((timeA.rankR2 || 999) < (timeB.rankR2 || 999)) { vencedor = timeA; perdedor = timeB; }
        else { vencedor = timeB; perdedor = timeA; }
    }
    return { vencedor, perdedor };
}

main().catch(err => { console.error('ERRO FATAL:', err); process.exit(1); });
