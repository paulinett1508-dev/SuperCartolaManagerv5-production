/**
 * FIX: Pontos Corridos — Caches gerados com 34 times (sem Bruno Barros)
 *
 * PROBLEMA:
 *   Os 4 caches permanentes da liga foram gerados quando ela tinha 34 participantes.
 *   Bruno Barros foi adicionado como 35º participante DEPOIS da geração.
 *   Como os caches têm `cache_permanente: true`, nunca são recalculados.
 *   O frontend detecta Bruno Barros como ausente e trata a liga como ÍMPAR (35 times),
 *   reconstruindo um bracket diferente do DB — causando Antonio Luis a cair no BYE
 *   da R4 e não aparecer no admin.
 *
 * FIX:
 *   Deletar os 4 caches permanentes. Na próxima abertura do módulo Pontos Corridos
 *   pelo admin, o frontend (pontos-corridos-core.js) recalcula R1–R4 com os 35 times
 *   corretos e salva caches novos.
 *
 * USO:
 *   node scripts/fix-pontos-corridos-caches-35times.js            # dry-run (padrão)
 *   node scripts/fix-pontos-corridos-caches-35times.js --dry-run  # ver o que seria deletado
 *   node scripts/fix-pontos-corridos-caches-35times.js --force    # executar a deleção
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LIGA_ID   = '684cb1c8af923da7c7df51de';
const TEMPORADA = 2026;
const DRY_RUN   = !process.argv.includes('--force');

// Schema inline — evita importar módulos com side-effects do servidor
const PontosCorridosCacheSchema = new mongoose.Schema(
    {
        liga_id:            { type: String  },
        rodada_consolidada: { type: Number  },
        temporada:          { type: Number  },
        cache_permanente:   { type: Boolean },
        confrontos:         [mongoose.Schema.Types.Mixed],
        classificacao:      [mongoose.Schema.Types.Mixed],
        ultima_atualizacao: { type: Date    },
    },
    { strict: false }
);
const PontosCorridosCache = mongoose.models.PontosCorridosCache
    || mongoose.model('PontosCorridosCache', PontosCorridosCacheSchema);

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('❌  MONGO_URI não configurada.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅  MongoDB conectado.\n');

    // 1. Buscar caches da liga
    const caches = await PontosCorridosCache.find({
        liga_id:  LIGA_ID,
        temporada: TEMPORADA,
    }).sort({ rodada_consolidada: 1 }).lean();

    if (caches.length === 0) {
        console.log('ℹ️  Nenhum cache encontrado para esta liga/temporada. Nada a fazer.');
        await mongoose.disconnect();
        return;
    }

    // 2. Exibir diagnóstico
    console.log(`📋  Caches encontrados: ${caches.length} (Liga ${LIGA_ID}, T${TEMPORADA})\n`);
    caches.forEach(c => {
        const nConfrontos    = c.confrontos?.length ?? 0;
        const nClassificacao = c.classificacao?.length ?? 0;
        const permanente     = c.cache_permanente ? '🔒 PERMANENTE' : '  temporário';
        const atualizado     = c.ultima_atualizacao
            ? new Date(c.ultima_atualizacao).toLocaleString('pt-BR')
            : 'desconhecido';

        // Contar times únicos nos confrontos (diagnóstico do bug)
        const ids = new Set();
        (c.confrontos || []).forEach(conf => {
            const id1 = conf.time1?.id ?? conf.time1;
            const id2 = conf.time2?.id ?? conf.time2;
            if (id1) ids.add(String(id1));
            if (id2) ids.add(String(id2));
        });

        console.log(
            `  R${String(c.rodada_consolidada).padStart(2)} | ${permanente}` +
            ` | ${nConfrontos} confrontos (${ids.size} times únicos)` +
            ` | ${nClassificacao} na classificação` +
            ` | ${atualizado}`
        );
    });

    if (DRY_RUN) {
        console.log('\n⚠️   DRY-RUN — nenhum dado foi alterado.');
        console.log('     Para executar a deleção, use: --force\n');
        await mongoose.disconnect();
        return;
    }

    // 3. Deletar caches
    console.log('\n🗑️  Deletando caches...');
    const docIds = caches.map(c => c._id);
    const result = await PontosCorridosCache.deleteMany({ _id: { $in: docIds } });

    console.log(`✅  ${result.deletedCount} cache(s) deletado(s).\n`);
    console.log('📌  Próximos passos:');
    console.log('    1. Acesse o painel admin → Liga → Pontos Corridos.');
    console.log('    2. O frontend recalculará R1–R4 com os 35 times e salvará caches novos.');
    console.log('    3. Confirme que Antonio Luis aparece na R4 e Bruno Barros');
    console.log('       tem seus jogos distribuídos normalmente.\n');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌  Erro:', err.message);
    process.exit(1);
});
