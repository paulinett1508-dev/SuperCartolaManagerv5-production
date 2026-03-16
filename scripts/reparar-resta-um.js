/**
 * SCRIPT DE REPARO — RESTA UM
 *
 * Recalcula pontosAcumulados, pontosRodada e status dos participantes
 * a partir dos dados reais da collection Rodada (fonte de verdade).
 *
 * Uso:
 *   node scripts/reparar-resta-um.js                   # dry-run (mostra o que faria)
 *   node scripts/reparar-resta-um.js --force            # aplica as correções
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const FORCE = process.argv.includes('--force');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  REPARO RESTA UM — ${FORCE ? '⚠️  MODO FORCE (vai gravar!)' : '🔍 DRY-RUN (apenas simulação)'}`);
    console.log(`${'='.repeat(60)}\n`);

    // 1) Buscar todas as edições em_andamento
    const edicoes = await db.collection('restaumcaches').find({
        status: { $in: ['em_andamento'] },
    }).toArray();

    if (edicoes.length === 0) {
        console.log('Nenhuma edição em_andamento encontrada.');
        await mongoose.disconnect();
        return;
    }

    for (const edicao of edicoes) {
        console.log(`\n--- Liga: ${edicao.liga_id} | Edição: ${edicao.edicao} | Temporada: ${edicao.temporada} ---`);
        console.log(`    Status: ${edicao.status} | RodadaInicial: ${edicao.rodadaInicial} | RodadaAtual: ${edicao.rodadaAtual}`);
        console.log(`    Participantes: ${edicao.participantes?.length || 0}`);
        console.log(`    EliminadosPorRodada: ${edicao.eliminadosPorRodada || 1}`);
        console.log(`    ProtecaoPrimeiraRodada: ${edicao.protecaoPrimeiraRodada || false}`);

        const ligaOid = new mongoose.Types.ObjectId(edicao.liga_id);
        const rodadaInicial = edicao.rodadaInicial;
        const rodadaAtual = edicao.rodadaAtual || rodadaInicial;
        const eliminadosPorRodada = edicao.eliminadosPorRodada || 1;
        const protecao = edicao.protecaoPrimeiraRodada || false;

        // 2) Carregar TODAS as rodadas desta liga (rodadaInicial até rodadaAtual)
        const rodadasRange = [];
        for (let r = rodadaInicial; r <= rodadaAtual; r++) rodadasRange.push(r);

        console.log(`    Rodadas a processar: ${rodadasRange.join(', ')}`);

        const rodadasData = {};
        for (const r of rodadasRange) {
            const docs = await db.collection('rodadas').find({
                ligaId: ligaOid,
                rodada: r,
                temporada: edicao.temporada,
            }).toArray();
            rodadasData[r] = new Map();
            docs.forEach(d => rodadasData[r].set(String(d.timeId), d.pontos || 0));
            console.log(`    R${r}: ${docs.length} registros na collection Rodada`);
        }

        // 3) Simular a eliminação rodada a rodada (reconstrução completa)
        const participantes = (edicao.participantes || []).map(p => ({
            timeId: p.timeId,
            nomeTime: p.nomeTime,
            nomeCartoleiro: p.nomeCartoleiro,
            escudoId: p.escudoId,
            status: 'vivo', // reset — vamos recalcular
            pontosAcumulados: 0,
            pontosRodada: 0,
            rodadaEliminacao: null,
            rodadasSobrevividas: 0,
            vezesNaZona: p.vezesNaZona || 0, // manter contagem existente
        }));

        const historicoNovo = [];
        let vivosCount = participantes.length;

        for (const r of rodadasRange) {
            const pontosMap = rodadasData[r];
            const vivos = participantes.filter(p => p.status === 'vivo');

            // Atualizar pontos de todos os vivos
            for (const p of vivos) {
                const pts = pontosMap.get(String(p.timeId)) || 0;
                p.pontosAcumulados += pts;
                p.pontosRodada = pts;
                p.rodadasSobrevividas += 1;
            }

            // Proteção da primeira rodada: sem eliminações
            if (protecao && r === rodadaInicial) {
                console.log(`    R${r}: Proteção ativa — sem eliminações`);
                continue;
            }

            // Se só resta 1, não eliminar
            if (vivos.length <= 1) {
                if (vivos.length === 1) {
                    vivos[0].status = 'campeao';
                    console.log(`    R${r}: CAMPEÃO! ${vivos[0].nomeCartoleiro}`);
                }
                break;
            }

            // Ordenar por pontosRodada ASC (piores primeiro) para eliminação
            const vivosOrdenados = [...vivos].sort((a, b) => {
                const ptsA = pontosMap.get(String(a.timeId)) || 0;
                const ptsB = pontosMap.get(String(b.timeId)) || 0;
                if (ptsA !== ptsB) return ptsA - ptsB;
                if (a.pontosAcumulados !== b.pontosAcumulados) return a.pontosAcumulados - b.pontosAcumulados;
                return (b.vezesNaZona || 0) - (a.vezesNaZona || 0);
            });

            const qtdEliminar = Math.min(eliminadosPorRodada, vivos.length - 1);
            const eliminadosRodada = [];

            for (let i = 0; i < qtdEliminar; i++) {
                const el = vivosOrdenados[i];
                const part = participantes.find(p => p.timeId === el.timeId);
                if (part) {
                    part.status = 'eliminado';
                    part.rodadaEliminacao = r;
                    eliminadosRodada.push({
                        rodada: r,
                        timeId: part.timeId,
                        nomeTime: part.nomeTime,
                        pontosRodada: pontosMap.get(String(part.timeId)) || 0,
                        criterioDesempate: null,
                        dataEliminacao: new Date(),
                    });
                    vivosCount--;
                }
            }

            console.log(`    R${r}: ${eliminadosRodada.map(e => `${e.nomeTime} (${e.pontosRodada.toFixed(2)}pts)`).join(', ')} eliminado(s) | ${vivosCount} vivos`);
            historicoNovo.push(...eliminadosRodada);

            // Checar campeão após eliminação
            const vivosApos = participantes.filter(p => p.status === 'vivo');
            if (vivosApos.length === 1) {
                vivosApos[0].status = 'campeao';
                console.log(`    R${r}: CAMPEÃO! ${vivosApos[0].nomeCartoleiro}`);
            }
        }

        // 4) Comparar com dados atuais
        const vivosFinais = participantes.filter(p => p.status === 'vivo' || p.status === 'campeao')
            .sort((a, b) => b.pontosAcumulados - a.pontosAcumulados);
        const elimFinais = participantes.filter(p => p.status === 'eliminado')
            .sort((a, b) => (b.rodadaEliminacao || 0) - (a.rodadaEliminacao || 0));

        console.log(`\n    === RANKING CORRETO (recalculado) ===`);
        vivosFinais.forEach((p, i) => {
            console.log(`    ${String(i + 1).padStart(3)}. ${(p.nomeCartoleiro || '').padEnd(25)} | acum: ${p.pontosAcumulados.toFixed(2).padStart(8)} | R${rodadaAtual}: ${(p.pontosRodada || 0).toFixed(2).padStart(8)} | ${p.status}`);
        });
        elimFinais.forEach(p => {
            console.log(`      X  ${(p.nomeCartoleiro || '').padEnd(25)} | acum: ${p.pontosAcumulados.toFixed(2).padStart(8)} | elimR${p.rodadaEliminacao}`);
        });

        // 5) Comparar com DB atual
        console.log(`\n    === DIFERENÇAS COM DB ATUAL ===`);
        let diffs = 0;
        const dbParts = edicao.participantes || [];
        for (const novo of participantes) {
            const antigo = dbParts.find(p => p.timeId === novo.timeId);
            if (!antigo) { console.log(`    NOVO: ${novo.nomeCartoleiro} (não estava no DB)`); diffs++; continue; }

            const changes = [];
            if (Math.abs((antigo.pontosAcumulados || 0) - novo.pontosAcumulados) > 0.01) {
                changes.push(`acum: ${(antigo.pontosAcumulados || 0).toFixed(2)} → ${novo.pontosAcumulados.toFixed(2)}`);
            }
            if (Math.abs((antigo.pontosRodada || 0) - novo.pontosRodada) > 0.01) {
                changes.push(`rodada: ${(antigo.pontosRodada || 0).toFixed(2)} → ${novo.pontosRodada.toFixed(2)}`);
            }
            if (antigo.status !== novo.status) {
                changes.push(`status: ${antigo.status} → ${novo.status}`);
            }
            if ((antigo.rodadaEliminacao || null) !== (novo.rodadaEliminacao || null)) {
                changes.push(`elimR: ${antigo.rodadaEliminacao} → ${novo.rodadaEliminacao}`);
            }
            if (changes.length > 0) {
                console.log(`    ${(novo.nomeCartoleiro || '').padEnd(25)} | ${changes.join(' | ')}`);
                diffs++;
            }
        }
        console.log(`    Total diferenças: ${diffs}`);

        // 6) Aplicar se --force
        if (FORCE && diffs > 0) {
            console.log(`\n    ⚡ Aplicando correções...`);

            await db.collection('restaumcaches').updateOne(
                { _id: edicao._id },
                {
                    $set: {
                        participantes: participantes,
                        historicoEliminacoes: historicoNovo,
                        ultima_atualizacao: new Date(),
                    },
                },
            );
            console.log(`    ✅ Atualizado com sucesso! ${diffs} participantes corrigidos.`);
        } else if (!FORCE && diffs > 0) {
            console.log(`\n    ℹ️  Execute com --force para aplicar as correções.`);
        } else {
            console.log(`\n    ✅ Dados já estão corretos — nenhuma alteração necessária.`);
        }
    }

    await mongoose.disconnect();
    console.log(`\n${'='.repeat(60)}`);
    console.log('  Concluído.');
    console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
    console.error('ERRO FATAL:', err);
    process.exit(1);
});
