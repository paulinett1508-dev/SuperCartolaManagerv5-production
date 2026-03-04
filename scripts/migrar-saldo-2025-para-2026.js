/**
 * MIGRAÇÃO: Transferir saldo final 2025 → extrato 2026 (Super Cartola)
 *
 * PROBLEMA:
 *   Liga "Super Cartola" (684cb1c8af923da7c7df51de) continuou da temporada 2025 para 2026.
 *   Nenhum participante tem SALDO_TEMPORADA_ANTERIOR no extrato 2026 — os créditos/dívidas
 *   de 2025 não estão visíveis nem contabilizados no extrato da temporada atual.
 *
 * O QUE FAZ:
 *   Para cada participante da liga:
 *   1. Calcula saldo final 2025 = extrato_cache + FluxoFinanceiroCampos + acertos + ajustes
 *   2. Se saldo != 0 e SALDO_TEMPORADA_ANTERIOR ainda não existe no cache 2026:
 *      - Saldo positivo (credor): insere transação SALDO_TEMPORADA_ANTERIOR (positivo) no cache 2026
 *      - Saldo negativo (devedor): NÃO insere no cache; registra em InscricaoTemporada.divida_anterior
 *   3. Cria/atualiza InscricaoTemporada 2026 com auditoria completa do saldo 2025
 *
 * IMPORTANTE — AUSÊNCIA DE DOUBLE-COUNTING:
 *   NÃO usar $inc em saldo_consolidado — saldo-calculator.js recalcula via historico_transacoes.
 *   Dívida não vai para o cache; vai para InscricaoTemporada.divida_anterior (consultado em leitura).
 *
 * USO:
 *   node scripts/migrar-saldo-2025-para-2026.js --dry-run    # Simular (sem gravar)
 *   node scripts/migrar-saldo-2025-para-2026.js --force      # Executar
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

// ID da liga Super Cartola (2025→2026)
const LIGA_ID = '684cb1c8af923da7c7df51de';
const TEMPORADA_ORIGEM = 2025;
const TEMPORADA_DESTINO = 2026;

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo manual do saldo 2025 (sem importar o controller pesado)
// Espelha a lógica de calcularSaldoParticipante() para temporada < CURRENT_SEASON
// ─────────────────────────────────────────────────────────────────────────────
async function calcularSaldo2025(db, ligaId, timeId) {
    // 1. Extrato cache 2025
    const cache2025 = await db.collection('extratofinanceirocaches').findOne({
        liga_id: ligaId,
        time_id: Number(timeId),
        temporada: TEMPORADA_ORIGEM,
    });
    const saldoExtrato = cache2025?.saldo_consolidado ?? null;

    // 2. FluxoFinanceiroCampos 2025 (sistema de campos manuais pre-2026)
    const camposDoc = await db.collection('fluxofinanceirocampos').findOne({
        liga_id: ligaId,
        time_id: Number(timeId),
        temporada: TEMPORADA_ORIGEM,
    });
    const saldoCampos = (camposDoc?.campos || []).reduce((acc, c) => acc + (c.valor || 0), 0);

    // 3. Acertos financeiros 2025 (pagamentos/recebimentos)
    // Schema v2.0.0: liga_id (String), time_id (Number), ativo (Boolean)
    // Lógica: pagamento = participante pagou (+saldo), recebimento = participante recebeu (-saldo)
    const acertos2025 = await db.collection('acertofinanceiros').find({
        liga_id: ligaId,
        time_id: Number(timeId),
        temporada: TEMPORADA_ORIGEM,
        ativo: true,
    }).toArray();

    const saldoAcertos = acertos2025.reduce((acc, a) => {
        const valor = a.valor || 0;
        if (a.tipo === 'pagamento') return acc + valor;    // participante pagou → quita dívida
        if (a.tipo === 'recebimento') return acc - valor;  // participante recebeu → usa crédito
        return acc;
    }, 0);

    // 4. AjusteFinanceiro 2025 (sistema dinâmico — pode existir para 2025 também)
    const ajustes2025 = await db.collection('ajustefinanceiros').find({
        liga_id: ligaId,
        time_id: Number(timeId),
        temporada: TEMPORADA_ORIGEM,
    }).toArray();
    const saldoAjustes = ajustes2025.reduce((acc, a) => acc + (a.valor || 0), 0);

    const saldoFinal = (saldoExtrato || 0) + saldoCampos + saldoAcertos + saldoAjustes;

    return {
        saldoFinal: parseFloat(saldoFinal.toFixed(2)),
        saldoExtrato,
        saldoCampos: parseFloat(saldoCampos.toFixed(2)),
        saldoAcertos: parseFloat(saldoAcertos.toFixed(2)),
        saldoAjustes: parseFloat(saldoAjustes.toFixed(2)),
        temCache2025: cache2025 != null,
        qtdAcertos: acertos2025.length,
        qtdAjustes: ajustes2025.length,
    };
}

async function migrarSaldo() {
    const isDryRun = process.argv.includes('--dry-run');
    const isForce = process.argv.includes('--force');

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🔄 MIGRAÇÃO: Saldo 2025 → Extrato 2026 (Super Cartola)');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`Liga:     ${LIGA_ID}`);
    console.log(`Origem:   temporada ${TEMPORADA_ORIGEM}`);
    console.log(`Destino:  temporada ${TEMPORADA_DESTINO}`);
    console.log(`Modo:     ${isDryRun ? '🔍 DRY-RUN (simulação)' : isForce ? '⚡ FORCE (gravando no banco!)' : '⚠️  Sem flag'}`);
    console.log('');

    if (!isDryRun && !isForce) {
        console.log('⚠️  Use --dry-run para simular ou --force para executar');
        process.exit(0);
    }

    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        const ligaObjId = new mongoose.Types.ObjectId(LIGA_ID);

        // ── Carregar participantes da liga ────────────────────────────────────
        const liga = await db.collection('ligas').findOne({ _id: ligaObjId });
        if (!liga) {
            console.error('❌ Liga não encontrada:', LIGA_ID);
            process.exit(1);
        }

        const participantes = (liga.participantes || []).filter(p => p.ativo !== false);
        console.log(`📊 Participantes ativos na liga: ${participantes.length}\n`);

        // ── Carregar caches 2026 de uma vez para eficiência ───────────────────
        const caches2026 = await db.collection('extratofinanceirocaches').find({
            liga_id: LIGA_ID,
            temporada: TEMPORADA_DESTINO,
        }).toArray();
        const cache2026Map = {};
        caches2026.forEach(c => { cache2026Map[c.time_id] = c; });
        console.log(`📊 Caches 2026 existentes: ${caches2026.length}\n`);

        // ── Resultados ────────────────────────────────────────────────────────
        const resultados = {
            credorMigrado: [],       // saldo > 0: SALDO_TEMPORADA_ANTERIOR inserido no cache
            devedorMigrado: [],      // saldo < 0: divida_anterior em InscricaoTemporada
            quitado: [],             // saldo = 0: sem transferência financeira
            jaProcessado: [],        // SALDO_TEMPORADA_ANTERIOR já existia no cache
            semCache2025: [],        // sem extrato 2025
            erros: [],
        };

        for (const p of participantes) {
            const timeId = p.time_id;
            const nome = p.nome_cartola || p.nome_cartoleiro || `ID:${timeId}`;

            try {
                // 1. Calcular saldo 2025
                const saldo2025 = await calcularSaldo2025(db, LIGA_ID, timeId);

                if (!saldo2025.temCache2025) {
                    console.log(`⚠️  ${nome} (${timeId}): sem extrato 2025 — pulando`);
                    resultados.semCache2025.push({ timeId, nome });
                    continue;
                }

                // 2. Verificar cache 2026
                const cache2026 = cache2026Map[Number(timeId)];
                const transacoes2026 = cache2026?.historico_transacoes || [];
                const temSaldoAnterior = transacoes2026.some(t => t.tipo === 'SALDO_TEMPORADA_ANTERIOR');

                if (temSaldoAnterior) {
                    console.log(`✅ ${nome} (${timeId}): SALDO_TEMPORADA_ANTERIOR já existe — pulando`);
                    resultados.jaProcessado.push({ timeId, nome, saldo2025: saldo2025.saldoFinal });
                    continue;
                }

                const sf = saldo2025.saldoFinal;
                console.log(`\n📝 ${nome} (${timeId}):`);
                console.log(`   Saldo 2025 = R$ ${sf.toFixed(2)}`);
                console.log(`   Breakdown: extrato=${(saldo2025.saldoExtrato || 0).toFixed(2)} + campos=${saldo2025.saldoCampos.toFixed(2)} + acertos=${saldo2025.saldoAcertos.toFixed(2)} + ajustes=${saldo2025.saldoAjustes.toFixed(2)}`);

                // 3. Montar dados para InscricaoTemporada
                const statusQuitacao = sf < -0.01 ? 'devedor' : sf > 0.01 ? 'credor' : 'quitado';
                const saldoTransferido = sf > 0.01 ? sf : 0;   // crédito a transferir (positivo)
                const dividaAnterior   = sf < -0.01 ? Math.abs(sf) : 0;  // dívida a carregar (positivo)

                // 4. Transação SALDO_TEMPORADA_ANTERIOR (somente credores)
                const transacaoSaldoAnterior = saldoTransferido > 0 ? {
                    rodada: 0,
                    tipo: 'SALDO_TEMPORADA_ANTERIOR',
                    valor: saldoTransferido,
                    descricao: `Saldo transferido de ${TEMPORADA_ORIGEM} — crédito R$ ${saldoTransferido.toFixed(2)}`,
                    data: new Date(),
                    _id: new mongoose.Types.ObjectId(),
                    posicao: null,
                    bonusOnus: 0,
                    pontosCorridos: 0,
                    mataMata: 0,
                    top10: 0,
                    saldo: 0,
                    saldoAcumulado: 0,
                    isMito: false,
                    isMico: false,
                    top10Status: null,
                    top10Posicao: null,
                } : null;

                // 5. Dados para InscricaoTemporada 2026
                const inscricaoData = {
                    liga_id: ligaObjId,
                    time_id: Number(timeId),
                    temporada: TEMPORADA_DESTINO,
                    status: 'renovado',
                    origem: 'cadastro_manual',
                    dados_participante: {
                        nome_time: p.nome_time || '',
                        nome_cartoleiro: p.nome_cartola || p.nome_cartoleiro || '',
                        escudo: p.escudo_url || p.foto_time || '',
                        id_cartola_oficial: Number(timeId),
                    },
                    temporada_anterior: {
                        temporada: TEMPORADA_ORIGEM,
                        saldo_final: sf,
                        status_quitacao: statusQuitacao,
                    },
                    saldo_transferido: saldoTransferido,
                    divida_anterior: dividaAnterior,
                    pagou_inscricao: false, // a taxa de -180 já está no cache via INSCRICAO_TEMPORADA
                    taxa_inscricao: 180,
                    observacoes: `Migrado automaticamente por migrar-saldo-2025-para-2026.js em ${new Date().toISOString()}`,
                    processado: true,
                    data_processamento: new Date(),
                    transacoes_criadas: transacaoSaldoAnterior ? [{
                        tipo: 'SALDO_TEMPORADA_ANTERIOR',
                        valor: saldoTransferido,
                        ref_id: String(transacaoSaldoAnterior._id),
                    }] : [],
                };

                if (sf <= 0.01 && sf >= -0.01) {
                    // Quitado: sem transferência financeira
                    console.log(`   Status: QUITADO — nenhuma transferência financeira`);
                    resultados.quitado.push({ timeId, nome, saldo2025: sf });
                } else if (sf > 0.01) {
                    // Credor: inserir SALDO_TEMPORADA_ANTERIOR no cache
                    console.log(`   Status: CREDOR — transferir R$ ${saldoTransferido.toFixed(2)} como crédito`);
                    if (transacaoSaldoAnterior) {
                        console.log(`   Ação cache: inserir SALDO_TEMPORADA_ANTERIOR valor=+${saldoTransferido.toFixed(2)}`);
                    }
                } else {
                    // Devedor: registrar divida_anterior em InscricaoTemporada
                    console.log(`   Status: DEVEDOR — registrar dívida R$ ${dividaAnterior.toFixed(2)} em InscricaoTemporada`);
                    console.log(`   Ação cache: nenhuma (dívida aplicada em leitura via InscricaoTemporada)`);
                }

                if (!isDryRun) {
                    // A) Inserir transação no cache 2026 (somente credores)
                    if (transacaoSaldoAnterior && cache2026) {
                        const updateResult = await db.collection('extratofinanceirocaches').updateOne(
                            { liga_id: LIGA_ID, time_id: Number(timeId), temporada: TEMPORADA_DESTINO },
                            {
                                $push: {
                                    historico_transacoes: {
                                        $each: [transacaoSaldoAnterior],
                                        $position: 0, // inserir no início (antes das rodadas)
                                    },
                                },
                            }
                        );
                        if (updateResult.modifiedCount === 0) {
                            console.log(`   ⚠️  Cache não atualizado (modifiedCount=0)`);
                        } else {
                            console.log(`   ✅ SALDO_TEMPORADA_ANTERIOR inserido no cache 2026`);
                        }
                    } else if (transacaoSaldoAnterior && !cache2026) {
                        console.log(`   ⚠️  Participante sem cache 2026 — não foi possível inserir SALDO_TEMPORADA_ANTERIOR`);
                    }

                    // B) Criar/atualizar InscricaoTemporada 2026
                    await db.collection('inscricoestemporada').updateOne(
                        { liga_id: ligaObjId, time_id: Number(timeId), temporada: TEMPORADA_DESTINO },
                        { $set: inscricaoData },
                        { upsert: true }
                    );
                    console.log(`   ✅ InscricaoTemporada 2026 criada/atualizada`);
                } else {
                    console.log(`   [DRY-RUN] Seria executado`);
                }

                // Registrar resultado
                if (sf > 0.01) {
                    resultados.credorMigrado.push({ timeId, nome, saldo2025: sf, saldoTransferido });
                } else if (sf < -0.01) {
                    resultados.devedorMigrado.push({ timeId, nome, saldo2025: sf, dividaAnterior });
                } else {
                    resultados.quitado.push({ timeId, nome, saldo2025: sf });
                }

            } catch (err) {
                console.log(`   ❌ ERRO em ${nome} (${timeId}): ${err.message}`);
                resultados.erros.push({ timeId, nome, erro: err.message });
            }
        }

        // ── Relatório Final ───────────────────────────────────────────────────
        console.log('\n═══════════════════════════════════════════════════════════════════════');
        console.log('📊 RELATÓRIO FINAL');
        console.log('═══════════════════════════════════════════════════════════════════════\n');

        console.log(`💚 CREDORES migrados: ${resultados.credorMigrado.length}`);
        resultados.credorMigrado.forEach(p => {
            console.log(`   ${p.nome} (${p.timeId}) | saldo 2025: +R$ ${p.saldo2025.toFixed(2)} → crédito transferido`);
        });
        console.log('');

        console.log(`🔴 DEVEDORES migrados: ${resultados.devedorMigrado.length}`);
        resultados.devedorMigrado.forEach(p => {
            console.log(`   ${p.nome} (${p.timeId}) | saldo 2025: -R$ ${p.dividaAnterior.toFixed(2)} → dívida em InscricaoTemporada`);
        });
        console.log('');

        console.log(`⚪ QUITADOS (sem transferência): ${resultados.quitado.length}`);
        resultados.quitado.forEach(p => {
            console.log(`   ${p.nome} (${p.timeId}) | saldo 2025: R$ ${p.saldo2025.toFixed(2)}`);
        });
        console.log('');

        if (resultados.jaProcessado.length > 0) {
            console.log(`✅ JÁ PROCESSADOS (pulados): ${resultados.jaProcessado.length}`);
            resultados.jaProcessado.forEach(p => {
                console.log(`   ${p.nome} (${p.timeId})`);
            });
            console.log('');
        }

        if (resultados.semCache2025.length > 0) {
            console.log(`⚠️  SEM EXTRATO 2025: ${resultados.semCache2025.length}`);
            resultados.semCache2025.forEach(p => {
                console.log(`   ${p.nome} (${p.timeId})`);
            });
            console.log('');
        }

        if (resultados.erros.length > 0) {
            console.log(`❌ ERROS: ${resultados.erros.length}`);
            resultados.erros.forEach(p => {
                console.log(`   ${p.nome} (${p.timeId}): ${p.erro}`);
            });
            console.log('');
        }

        // ── Verificação pós-migração ──────────────────────────────────────────
        if (!isDryRun && resultados.credorMigrado.length > 0) {
            console.log('═══════════════════════════════════════════════════════════════════════');
            console.log('🔍 VERIFICAÇÃO PÓS-MIGRAÇÃO (credores)');
            console.log('═══════════════════════════════════════════════════════════════════════\n');

            for (const p of resultados.credorMigrado) {
                const cache = await db.collection('extratofinanceirocaches').findOne({
                    liga_id: LIGA_ID,
                    time_id: Number(p.timeId),
                    temporada: TEMPORADA_DESTINO,
                });
                const transacoes = cache?.historico_transacoes || [];
                const temSaldo = transacoes.some(t => t.tipo === 'SALDO_TEMPORADA_ANTERIOR');
                console.log(`${temSaldo ? '✅' : '❌'} ${p.nome} (${p.timeId}): SALDO_TEMPORADA_ANTERIOR=${temSaldo}`);
            }

            console.log('');
        }

        const totalMigrados = resultados.credorMigrado.length + resultados.devedorMigrado.length + resultados.quitado.length;
        console.log(`Total processados: ${totalMigrados}/${participantes.length}`);
        if (isDryRun) {
            console.log('\n⚠️  DRY-RUN: nenhuma alteração foi gravada. Use --force para executar.');
        }
        console.log('═══════════════════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Erro fatal:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

migrarSaldo();
