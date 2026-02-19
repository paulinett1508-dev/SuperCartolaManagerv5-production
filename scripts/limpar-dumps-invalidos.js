/**
 * Script: limpar-dumps-invalidos.js
 *
 * Remove dumps do CartolaOficialDump que contêm apenas metadados
 * da temporada (game_over: true) em vez de dados reais do participante.
 *
 * Uso:
 *   node scripts/limpar-dumps-invalidos.js          # Modo análise (não apaga)
 *   node scripts/limpar-dumps-invalidos.js --delete # Modo deleção
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Conexão com MongoDB (banco único)
const MONGO_URI = process.env.MONGO_URI;

// Schema simplificado para query direta
const DumpSchema = new mongoose.Schema({
    time_id: Number,
    temporada: Number,
    tipo_coleta: String,
    raw_json: mongoose.Schema.Types.Mixed,
    data_coleta: Date,
    meta: {
        payload_size: Number,
        url_origem: String
    }
}, { collection: 'cartolaoficialdumps' });

const Dump = mongoose.model('CartolaOficialDump', DumpSchema);

/**
 * Verifica se um dump contém dados válidos do participante
 */
function isDumpValido(dump) {
    const raw = dump.raw_json;
    if (!raw) return false;

    // Dumps válidos têm pelo menos um destes campos
    const camposParticipante = ['time', 'atletas', 'patrimonio', 'pontos_campeonato'];
    const temDadosParticipante = camposParticipante.some(campo => raw[campo] !== undefined);

    // Se tem game_over e NÃO tem dados do participante, é inválido
    if (raw.game_over === true && !temDadosParticipante) {
        return false;
    }

    return temDadosParticipante;
}

async function main() {
    const modoDelete = process.argv.includes('--delete');

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     🧹 LIMPEZA DE DUMPS INVÁLIDOS - Data Lake             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`📌 Modo: ${modoDelete ? '🔴 DELEÇÃO (vai apagar!)' : '🟢 ANÁLISE (somente leitura)'}`);
    console.log();

    try {
        // Conectar ao MongoDB
        console.log('🔌 Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado!\n');

        // Buscar todos os dumps
        console.log('🔍 Buscando dumps...');
        const todosDumps = await Dump.find({}).lean();
        console.log(`   Total de dumps no banco: ${todosDumps.length}\n`);

        // Classificar dumps
        const dumpsValidos = [];
        const dumpsInvalidos = [];

        for (const dump of todosDumps) {
            if (isDumpValido(dump)) {
                dumpsValidos.push(dump);
            } else {
                dumpsInvalidos.push(dump);
            }
        }

        console.log('📊 RESULTADO DA ANÁLISE:');
        console.log('────────────────────────────────────────');
        console.log(`   ✅ Dumps válidos (com dados do participante): ${dumpsValidos.length}`);
        console.log(`   ❌ Dumps inválidos (só metadados temporada):  ${dumpsInvalidos.length}`);
        console.log();

        if (dumpsInvalidos.length === 0) {
            console.log('🎉 Nenhum dump inválido encontrado! Banco está limpo.');
            await mongoose.disconnect();
            return;
        }

        // Mostrar amostra dos inválidos
        console.log('📋 AMOSTRA DE DUMPS INVÁLIDOS:');
        console.log('────────────────────────────────────────');

        const amostra = dumpsInvalidos.slice(0, 5);
        for (const dump of amostra) {
            const raw = dump.raw_json || {};
            console.log(`   • Time ID: ${dump.time_id}`);
            console.log(`     Data: ${dump.data_coleta?.toISOString()?.split('T')[0] || 'N/D'}`);
            console.log(`     game_over: ${raw.game_over}`);
            console.log(`     Campos: ${Object.keys(raw).slice(0, 5).join(', ')}...`);
            console.log();
        }

        if (dumpsInvalidos.length > 5) {
            console.log(`   ... e mais ${dumpsInvalidos.length - 5} dumps inválidos\n`);
        }

        // Agrupar por time_id para mostrar impacto
        const timeIds = [...new Set(dumpsInvalidos.map(d => d.time_id))];
        console.log(`📌 Times afetados: ${timeIds.length} times únicos`);
        console.log();

        // Modo deleção
        if (modoDelete) {
            console.log('🔴 INICIANDO DELEÇÃO...');
            console.log('────────────────────────────────────────');

            const idsParaDeletar = dumpsInvalidos.map(d => d._id);
            const resultado = await Dump.deleteMany({ _id: { $in: idsParaDeletar } });

            console.log(`✅ ${resultado.deletedCount} dumps inválidos removidos!`);
            console.log();

            // Estatísticas finais
            const restantes = await Dump.countDocuments({});
            console.log('📊 ESTATÍSTICAS FINAIS:');
            console.log(`   Dumps restantes no banco: ${restantes}`);
        } else {
            console.log('ℹ️  Para deletar, execute com --delete:');
            console.log('   node scripts/limpar-dumps-invalidos.js --delete');
        }

        console.log();
        console.log('✅ Concluído!');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

main();
