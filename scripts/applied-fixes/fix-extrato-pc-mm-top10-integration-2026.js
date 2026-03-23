#!/usr/bin/env node
// =====================================================================
// FIX EXTRATO - INTEGRAÇÃO PC/MM/TOP10 (v1.0.0)
// Recalcula extratos com módulos faltantes (Pontos Corridos, Mata-Mata, Top10)
// =====================================================================
// PROBLEMA: Cache de extrato criado antes de módulo ser habilitado
//           não recalcula rodadas consolidadas, resultando em valores zerados
// SOLUÇÃO: Detectar módulos faltantes e forçar recálculo completo do extrato
// =====================================================================

import mongoose from 'mongoose';
import Liga from '../models/Liga.js';
import ExtratoFinanceiroCache from '../models/ExtratoFinanceiroCache.js';
import dotenv from 'dotenv';

dotenv.config();

// ✅ Configurações
const TEMPORADA_ALVO = 2026;
const isProd = process.env.NODE_ENV === 'production';

// ✅ Parse de argumentos
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForced = args.includes('--force');
const ligaIdFiltro = args.find(a => a.startsWith('--liga-id='))?.split('=')[1];

// ✅ Validações de segurança
if (isProd && !isDryRun && !isForced) {
    console.error('❌ PRODUÇÃO requer --dry-run (simular) ou --force (executar)');
    process.exit(1);
}

// ✅ Estatísticas globais
const stats = {
    ligasAnalisadas: 0,
    participantesAnalisados: 0,
    cachesComProblemas: 0,
    cachesCorrigidos: 0,
    erros: 0,
    detalhes: []
};

/**
 * Detecta módulos faltantes no cache de extrato
 * @param {Object} cache - Cache de extrato
 * @param {Object} liga - Documento da liga
 * @returns {Array} Lista de módulos faltantes
 */
function detectarModulosFaltantes(cache, liga) {
    const modulosFaltantes = [];
    const transacoes = cache.historico_transacoes || [];
    const rodadaConsolidada = cache.ultima_rodada_consolidada || 0;

    // 1. Verificar PONTOS CORRIDOS
    const pcHabilitado = liga.configuracoes?.pontos_corridos?.habilitado ||
                         liga.modulos_ativos?.pontosCorridos;
    if (pcHabilitado) {
        const rodadaInicialPC = liga.configuracoes?.pontos_corridos?.rodadaInicial || 7;
        if (rodadaConsolidada >= rodadaInicialPC) {
            const temPC = transacoes.some(t =>
                t.tipo === 'PONTOS_CORRIDOS' && t.rodada >= rodadaInicialPC
            );
            if (!temPC) {
                modulosFaltantes.push({
                    nome: 'PONTOS_CORRIDOS',
                    rodadaEsperada: rodadaInicialPC,
                    transacoesEncontradas: 0
                });
            }
        }
    }

    // 2. Verificar MATA-MATA
    const mmHabilitado = liga.configuracoes?.mata_mata?.habilitado ||
                         liga.modulos_ativos?.mataMata;
    if (mmHabilitado) {
        const edicoes = liga.configuracoes?.mata_mata?.edicoes || [];
        if (edicoes.length > 0 && rodadaConsolidada >= 3) {
            const transacoesMM = transacoes.filter(t => t.tipo === 'MATA_MATA');
            if (transacoesMM.length === 0) {
                modulosFaltantes.push({
                    nome: 'MATA_MATA',
                    edicoesConfiguradas: edicoes.length,
                    transacoesEncontradas: 0
                });
            }
        }
    }

    // 3. Verificar TOP10 (menos crítico - pode não ter se time nunca foi Mito/Mico)
    const top10Habilitado = liga.configuracoes?.top10?.habilitado ||
                            liga.modulos_ativos?.top10 === true;
    if (top10Habilitado && rodadaConsolidada >= 10) {
        const transacoesTop10 = transacoes.filter(t => t.tipo === 'MITO' || t.tipo === 'MICO');
        // Só marca como faltante se NENHUMA transação de Top10 existe
        // (time pode legit nunca ter sido Mito/Mico)
        if (transacoesTop10.length === 0) {
            // Não adicionar como faltante crítico, apenas warning
            console.log(`    ⚠️  Top10 habilitado mas sem transações (pode ser normal)`);
        }
    }

    return modulosFaltantes;
}

/**
 * Processa uma liga específica
 */
async function processarLiga(liga) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 Liga: ${liga.nome} (ID: ${liga._id})`);
    console.log(`   Participantes: ${liga.participantes?.length || 0}`);
    console.log(`   Módulos: PC=${liga.modulos_ativos?.pontosCorridos ? '✅' : '❌'} | MM=${liga.modulos_ativos?.mataMata ? '✅' : '❌'} | T10=${liga.modulos_ativos?.top10 ? '✅' : '❌'}`);
    console.log(`${'='.repeat(70)}`);

    stats.ligasAnalisadas++;

    const participantes = liga.participantes || [];
    if (participantes.length === 0) {
        console.log(`⚠️  Liga sem participantes - pulando...`);
        return;
    }

    for (const participante of participantes) {
        const timeId = participante.time_id;
        const nomeTime = participante.nome_time || `Time ${timeId}`;

        stats.participantesAnalisados++;

        // Buscar cache de extrato
        const cache = await ExtratoFinanceiroCache.findOne({
            liga_id: String(liga._id),
            time_id: Number(timeId),
            temporada: TEMPORADA_ALVO
        });

        if (!cache) {
            console.log(`   ⏭️  ${nomeTime} - Sem cache (será criado no próximo acesso)`);
            continue;
        }

        // Verificar módulos faltantes
        const modulosFaltantes = detectarModulosFaltantes(cache, liga);

        if (modulosFaltantes.length > 0) {
            stats.cachesComProblemas++;

            console.log(`\n   🔴 PROBLEMA: ${nomeTime} (${timeId})`);
            console.log(`      Cache: ${cache.historico_transacoes?.length || 0} transações até R${cache.ultima_rodada_consolidada}`);
            console.log(`      Saldo: R$ ${(cache.saldo_consolidado || 0).toFixed(2)}`);
            console.log(`      Módulos faltantes:`);

            modulosFaltantes.forEach(m => {
                console.log(`        ❌ ${m.nome} (rodada ${m.rodadaEsperada || 'N/A'})`);
            });

            // Registrar para relatório final
            stats.detalhes.push({
                liga: liga.nome,
                ligaId: String(liga._id),
                time: nomeTime,
                timeId: Number(timeId),
                modulosFaltantes: modulosFaltantes.map(m => m.nome),
                rodadaConsolidada: cache.ultima_rodada_consolidada,
                saldoAtual: cache.saldo_consolidado,
                transacoes: cache.historico_transacoes?.length || 0
            });

            // Executar correção
            if (!isDryRun) {
                try {
                    console.log(`      🔧 Deletando cache corrompido...`);
                    await ExtratoFinanceiroCache.deleteOne({ _id: cache._id });

                    console.log(`      ✅ Cache deletado - será recalculado no próximo acesso`);
                    stats.cachesCorrigidos++;
                } catch (error) {
                    console.error(`      ❌ Erro ao deletar cache:`, error.message);
                    stats.erros++;
                }
            } else {
                console.log(`      🔍 [DRY-RUN] Cache seria deletado e recalculado`);
            }
        } else {
            console.log(`   ✅ ${nomeTime} - Cache OK`);
        }
    }
}

/**
 * Função principal
 */
async function main() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔧 FIX EXTRATO - INTEGRAÇÃO PC/MM/TOP10 (Temporada ${TEMPORADA_ALVO})`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Ambiente: ${isProd ? '🔴 PRODUÇÃO' : '🟡 DESENVOLVIMENTO'}`);
    console.log(`Modo: ${isDryRun ? '🔍 DRY-RUN (simulação)' : '⚡ EXECUÇÃO REAL'}`);
    if (ligaIdFiltro) {
        console.log(`Filtro: Liga ID = ${ligaIdFiltro}`);
    }
    console.log(`${'='.repeat(70)}\n`);

    if (!isDryRun && !isForced) {
        console.error(`\n❌ ATENÇÃO: Modo execução real requer confirmação!\n`);
        console.error(`Execute novamente com:`);
        console.error(`  --dry-run    → Simular sem modificar dados`);
        console.error(`  --force      → Confirmar execução real\n`);
        process.exit(1);
    }

    try {
        // Conectar ao MongoDB
        const MONGO_URI = process.env.MONGO_URI;
        if (!MONGO_URI) {
            console.error(`\n❌ ERRO: Variável MONGO_URI não configurada!`);
            console.error(`Configure a variável MONGO_URI no arquivo .env.\n`);
            process.exit(1);
        }

        console.log(`🔌 Conectando ao MongoDB...`);
        await mongoose.connect(MONGO_URI);
        console.log(`✅ Conectado ao MongoDB\n`);

        // Buscar ligas
        const query = {};
        if (ligaIdFiltro) {
            query._id = ligaIdFiltro;
        }

        const ligas = await Liga.find(query).lean();
        console.log(`📋 ${ligas.length} liga(s) encontrada(s)\n`);

        if (ligas.length === 0) {
            console.log(`⚠️  Nenhuma liga encontrada`);
            return;
        }

        // Processar cada liga
        for (const liga of ligas) {
            await processarLiga(liga);
        }

        // Relatório final
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📊 RELATÓRIO FINAL`);
        console.log(`${'='.repeat(70)}`);
        console.log(`Ligas analisadas:           ${stats.ligasAnalisadas}`);
        console.log(`Participantes analisados:   ${stats.participantesAnalisados}`);
        console.log(`Caches com problemas:       ${stats.cachesComProblemas}`);
        if (!isDryRun) {
            console.log(`Caches corrigidos:          ${stats.cachesCorrigidos}`);
            console.log(`Erros:                      ${stats.erros}`);
        }
        console.log(`${'='.repeat(70)}\n`);

        if (stats.detalhes.length > 0) {
            console.log(`\n📋 DETALHES DOS PROBLEMAS ENCONTRADOS:\n`);
            stats.detalhes.forEach((d, idx) => {
                console.log(`${idx + 1}. ${d.liga} - ${d.time}`);
                console.log(`   Módulos faltantes: ${d.modulosFaltantes.join(', ')}`);
                console.log(`   Rodada consolidada: ${d.rodadaConsolidada} | Transações: ${d.transacoes} | Saldo: R$ ${d.saldoAtual.toFixed(2)}\n`);
            });
        }

        if (isDryRun && stats.cachesComProblemas > 0) {
            console.log(`\n💡 PRÓXIMO PASSO:`);
            console.log(`   Execute sem --dry-run para corrigir os ${stats.cachesComProblemas} cache(s) com problema:\n`);
            console.log(`   NODE_ENV=${isProd ? 'production' : 'development'} node scripts/fix-extrato-pc-mm-top10-integration-2026.js --force\n`);
        } else if (!isDryRun && stats.cachesCorrigidos > 0) {
            console.log(`\n✅ CORREÇÃO CONCLUÍDA!`);
            console.log(`   ${stats.cachesCorrigidos} cache(s) foram deletados`);
            console.log(`   Os extratos serão recalculados automaticamente quando os participantes acessarem\n`);
        }

    } catch (error) {
        console.error(`\n❌ ERRO FATAL:`, error);
        stats.erros++;
    } finally {
        await mongoose.disconnect();
        console.log(`\n🔌 Desconectado do MongoDB`);
        console.log(`\n✅ Script finalizado\n`);
    }
}

// Executar
main().catch(console.error);
