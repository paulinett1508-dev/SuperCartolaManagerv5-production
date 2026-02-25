/**
 * AUDITORIA: Inscrições 2026 vs Transações INSCRICAO_TEMPORADA no Cache
 * ======================================================================
 * Verifica consistência entre:
 * - inscricoestemporada (status='renovado' ou 'novo')
 * - extratofinanceirocaches (historico_transacoes com tipo='INSCRICAO_TEMPORADA')
 *
 * Uso: node scripts/tmp-audit-inscricao-cache-2026.js
 */

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const TEMPORADA = 2026;

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function main() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db();

        console.log('═'.repeat(70));
        log(`📊 AUDITORIA: INSCRIÇÕES ${TEMPORADA} vs TRANSAÇÕES INSCRICAO_TEMPORADA`, 'bold');
        console.log('═'.repeat(70));
        log(`Data: ${new Date().toLocaleString('pt-BR')}`, 'cyan');
        console.log('');

        // ============================================
        // 1. Contar inscrições 2026 (renovados + novos)
        // ============================================
        log('📌 1. INSCRIÇÕES TEMPORADA 2026 (status: renovado ou novo)', 'cyan');
        console.log('-'.repeat(50));

        const inscricoesAtivas = await db.collection('inscricoestemporada').find({
            temporada: TEMPORADA,
            status: { $in: ['renovado', 'novo'] }
        }).toArray();

        const inscricoesRenovadas = inscricoesAtivas.filter(i => i.status === 'renovado');
        const inscricoesNovas = inscricoesAtivas.filter(i => i.status === 'novo');

        log(`  Total inscrições ativas: ${inscricoesAtivas.length}`, 'green');
        log(`    - Renovados: ${inscricoesRenovadas.length}`);
        log(`    - Novos: ${inscricoesNovas.length}`);

        // Inscrições que NÃO pagaram (devem ter transação de inscrição no cache)
        const inscricoesNaoPagas = inscricoesAtivas.filter(i => i.pagou_inscricao !== true);
        log(`  Inscrições NÃO pagas (devem ter transação no cache): ${inscricoesNaoPagas.length}`, 'yellow');

        // ============================================
        // 2. Contar extratos 2026 com INSCRICAO_TEMPORADA
        // ============================================
        console.log('');
        log('📌 2. EXTRATOS 2026 COM TRANSAÇÃO INSCRICAO_TEMPORADA', 'cyan');
        console.log('-'.repeat(50));

        // Buscar extratos que tenham transação INSCRICAO_TEMPORADA no histórico
        const extratosComInscricao = await db.collection('extratofinanceirocaches').find({
            temporada: TEMPORADA,
            'historico_transacoes.tipo': 'INSCRICAO_TEMPORADA'
        }).toArray();

        log(`  Extratos com INSCRICAO_TEMPORADA: ${extratosComInscricao.length}`, 'green');

        // Total de extratos 2026
        const totalExtratos2026 = await db.collection('extratofinanceirocaches').countDocuments({
            temporada: TEMPORADA
        });
        log(`  Total de extratos 2026: ${totalExtratos2026}`);

        // ============================================
        // 3. Comparação e Análise
        // ============================================
        console.log('');
        log('📌 3. ANÁLISE DE CONSISTÊNCIA', 'cyan');
        console.log('-'.repeat(50));

        // Criar mapas para comparação
        const inscricoesNaoPagasMap = new Map(
            inscricoesNaoPagas.map(i => [`${i.liga_id.toString()}_${i.time_id}`, i])
        );
        const extratosComInscricaoMap = new Map(
            extratosComInscricao.map(e => [`${e.liga_id.toString()}_${e.time_id}`, e])
        );

        // A) Inscrições NÃO pagas que NÃO têm transação no cache (PROBLEMA)
        const semTransacaoNoCacheList = [];
        for (const [key, inscricao] of inscricoesNaoPagasMap) {
            if (!extratosComInscricaoMap.has(key)) {
                semTransacaoNoCacheList.push(inscricao);
            }
        }

        // B) Extratos com transação mas inscrição marcada como paga (INCONSISTÊNCIA)
        const inscricoesPagasMap = new Map(
            inscricoesAtivas.filter(i => i.pagou_inscricao === true)
                .map(i => [`${i.liga_id.toString()}_${i.time_id}`, i])
        );
        const transacaoIndevidaList = [];
        for (const [key, extrato] of extratosComInscricaoMap) {
            if (inscricoesPagasMap.has(key)) {
                transacaoIndevidaList.push({
                    extrato,
                    inscricao: inscricoesPagasMap.get(key)
                });
            }
        }

        // ============================================
        // 4. RELATÓRIO FINAL
        // ============================================
        console.log('');
        console.log('═'.repeat(70));
        log('📋 RELATÓRIO FINAL', 'bold');
        console.log('═'.repeat(70));

        console.log('');
        log('┌─────────────────────────────────────────────────────────┐', 'cyan');
        log('│  RESUMO DOS NÚMEROS                                     │', 'cyan');
        log('├─────────────────────────────────────────────────────────┤', 'cyan');
        log(`│  Total inscrições 2026 (renovados + novos):     ${String(inscricoesAtivas.length).padStart(5)} │`);
        log(`│    - Renovados:                                  ${String(inscricoesRenovadas.length).padStart(5)} │`);
        log(`│    - Novos:                                      ${String(inscricoesNovas.length).padStart(5)} │`);
        log(`│  Inscrições NÃO pagas (devem ter transação):    ${String(inscricoesNaoPagas.length).padStart(5)} │`);
        log(`│  Extratos com transação INSCRICAO_TEMPORADA:    ${String(extratosComInscricao.length).padStart(5)} │`);
        log('├─────────────────────────────────────────────────────────┤', 'cyan');
        log(`│  ❌ Faltando transação (não pagou, sem registro):${String(semTransacaoNoCacheList.length).padStart(5)} │`,
            semTransacaoNoCacheList.length > 0 ? 'red' : 'green');
        log(`│  ⚠️  Transação indevida (pagou, mas tem registro):${String(transacaoIndevidaList.length).padStart(4)} │`,
            transacaoIndevidaList.length > 0 ? 'yellow' : 'green');
        log('└─────────────────────────────────────────────────────────┘', 'cyan');

        // ============================================
        // 5. DETALHAMENTO DAS INCONSISTÊNCIAS
        // ============================================
        if (semTransacaoNoCacheList.length > 0) {
            console.log('');
            log('❌ PARTICIPANTES SEM TRANSAÇÃO NO CACHE (Problema: devem ter)', 'red');
            console.log('-'.repeat(60));

            // Buscar nomes das ligas
            const ligaIds = [...new Set(semTransacaoNoCacheList.map(i => i.liga_id.toString()))];
            const ligas = await db.collection('ligas').find({
                _id: { $in: ligaIds.map(id => new ObjectId(id)) }
            }).toArray();
            const ligasMap = new Map(ligas.map(l => [l._id.toString(), l.nome]));

            // Listar os primeiros 20
            const maxExibir = 20;
            for (let i = 0; i < Math.min(semTransacaoNoCacheList.length, maxExibir); i++) {
                const inscricao = semTransacaoNoCacheList[i];
                const nomeLiga = ligasMap.get(inscricao.liga_id.toString()) || 'Liga desconhecida';
                const nomeParticipante = inscricao.dados_participante?.nome_cartoleiro ||
                    inscricao.dados_participante?.nome_time ||
                    `ID:${inscricao.time_id}`;

                log(`  ${i + 1}. [${nomeLiga}] ${nomeParticipante} (time_id: ${inscricao.time_id})`, 'red');
                log(`     Taxa: R$ ${inscricao.taxa_inscricao?.toFixed(2) || '180.00'} | Status: ${inscricao.status}`);
            }

            if (semTransacaoNoCacheList.length > maxExibir) {
                log(`  ... e mais ${semTransacaoNoCacheList.length - maxExibir} participantes`, 'yellow');
            }
        }

        if (transacaoIndevidaList.length > 0) {
            console.log('');
            log('⚠️  PARTICIPANTES COM TRANSAÇÃO INDEVIDA (Problema: marcou pagou, mas tem transação)', 'yellow');
            console.log('-'.repeat(60));

            const maxExibir = 20;
            for (let i = 0; i < Math.min(transacaoIndevidaList.length, maxExibir); i++) {
                const { extrato, inscricao } = transacaoIndevidaList[i];
                const nomeParticipante = inscricao.dados_participante?.nome_cartoleiro ||
                    inscricao.dados_participante?.nome_time ||
                    `ID:${extrato.time_id}`;

                const transacao = extrato.historico_transacoes.find(t => t.tipo === 'INSCRICAO_TEMPORADA');
                log(`  ${i + 1}. ${nomeParticipante} (time_id: ${extrato.time_id})`, 'yellow');
                log(`     Valor transação: R$ ${transacao?.valor?.toFixed(2) || 'N/A'}`);
            }

            if (transacaoIndevidaList.length > maxExibir) {
                log(`  ... e mais ${transacaoIndevidaList.length - maxExibir} participantes`, 'yellow');
            }
        }

        // ============================================
        // 6. VERIFICAÇÃO EXTRA: Inscrições pagas
        // ============================================
        console.log('');
        log('📌 VERIFICAÇÃO EXTRA: Distribuição de pagou_inscricao', 'cyan');
        console.log('-'.repeat(50));

        const statsPagamento = await db.collection('inscricoestemporada').aggregate([
            { $match: { temporada: TEMPORADA, status: { $in: ['renovado', 'novo'] } } },
            { $group: { _id: '$pagou_inscricao', count: { $sum: 1 } } }
        ]).toArray();

        for (const stat of statsPagamento) {
            const label = stat._id === true ? 'Pagaram inscrição' :
                stat._id === false ? 'NÃO pagaram inscrição' :
                    'Indefinido (null/undefined)';
            log(`  ${label}: ${stat.count}`);
        }

        // ============================================
        // 7. CONCLUSÃO
        // ============================================
        console.log('');
        console.log('═'.repeat(70));

        const temProblemas = semTransacaoNoCacheList.length > 0 || transacaoIndevidaList.length > 0;

        if (temProblemas) {
            log('❌ INCONSISTÊNCIAS DETECTADAS', 'red');
            log('   Execute o script de correção se necessário:', 'yellow');
            log('   node scripts/fix-inscricao-cache-2026.js', 'cyan');
        } else {
            log('✅ CONSISTÊNCIA OK - Todos os registros estão alinhados!', 'green');
        }

        console.log('═'.repeat(70));

    } catch (error) {
        log(`\n❌ Erro: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await client.close();
    }
}

main();
