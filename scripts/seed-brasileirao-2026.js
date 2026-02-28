#!/usr/bin/env node
// =====================================================================
// SEED BRASILEIRÃO 2026 - Dados iniciais para a temporada
// Como o Brasileirão 2026 ainda não começou (Abril), popula com datas previstas
// =====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
}

// Times do Brasileirão 2026 (previstos)
const TIMES_BRASILEIRAO_2026 = [
    { nome: 'Palmeiras', id: 275 },
    { nome: 'Botafogo', id: 263 },
    { nome: 'Flamengo', id: 262 },
    { nome: 'Fortaleza', id: 356 },
    { nome: 'Internacional', id: 285 },
    { nome: 'São Paulo', id: 276 },
    { nome: 'Bahia', id: 265 },
    { nome: 'Cruzeiro', id: 283 },
    { nome: 'Corinthians', id: 264 },
    { nome: 'Atlético-MG', id: 282 },
    { nome: 'Grêmio', id: 284 },
    { nome: 'Vasco', id: 267 },
    { nome: 'Vitória', id: 287 },
    { nome: 'Fluminense', id: 266 },
    { nome: 'Athletico-PR', id: 293 },
    { nome: 'Juventude', id: 286 },
    { nome: 'Bragantino', id: 280 },
    { nome: 'Cuiabá', id: 1371 },
    { nome: 'Santos', id: 277 },
    { nome: 'Mirassol', id: 2305 },
];

// Gerar rodadas fictícias (serão atualizadas quando CBF divulgar)
function gerarRodadas() {
    const partidas = [];
    const dataBase = new Date('2026-04-12'); // Início previsto do Brasileirão

    // Gerar 38 rodadas
    for (let rodada = 1; rodada <= 38; rodada++) {
        // Data da rodada (aproximada - domingos)
        const dataRodada = new Date(dataBase);
        dataRodada.setDate(dataBase.getDate() + (rodada - 1) * 7);
        const dataStr = dataRodada.toISOString().split('T')[0];

        // Gerar 10 jogos por rodada (embaralhar times)
        const timesRodada = [...TIMES_BRASILEIRAO_2026].sort(() => Math.random() - 0.5);

        for (let i = 0; i < 10; i++) {
            const mandante = timesRodada[i * 2];
            const visitante = timesRodada[i * 2 + 1];

            // Horários variados
            const horarios = ['16:00', '18:30', '20:00', '21:30'];
            const horario = horarios[i % horarios.length];

            partidas.push({
                id_externo: `seed_${rodada}_${i}`,
                rodada,
                data: dataStr,
                horario,
                mandante: mandante.nome,
                visitante: visitante.nome,
                mandante_id: mandante.id,
                visitante_id: visitante.id,
                placar_mandante: null,
                placar_visitante: null,
                status: 'agendado',
                estadio: null,
                cidade: null,
            });
        }
    }

    return partidas;
}

async function seed() {
    console.log('🌱 Iniciando seed do Brasileirão 2026...');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('calendariobrasileiras');

        // Verificar se já existe
        const existente = await collection.findOne({ temporada: 2026 });
        if (existente && existente.partidas?.length > 0) {
            console.log(`⚠️ Calendário 2026 já existe com ${existente.partidas.length} jogos`);
            console.log('   Use --force para substituir');

            if (!process.argv.includes('--force')) {
                await mongoose.disconnect();
                process.exit(0);
            }
            console.log('   Forçando substituição...');
        }

        // Gerar dados
        const partidas = gerarRodadas();
        console.log(`📅 Gerados ${partidas.length} jogos em 38 rodadas`);

        // Stats
        const stats = {
            total_jogos: partidas.length,
            jogos_realizados: 0,
            jogos_restantes: partidas.length,
            rodada_atual: 1,
            ultima_rodada_completa: 0,
        };

        // Upsert no banco
        const resultado = await collection.updateOne(
            { temporada: 2026 },
            {
                $set: {
                    temporada: 2026,
                    liga_id: 71,
                    partidas,
                    ultima_atualizacao: new Date(),
                    fonte: 'manual',
                    stats,
                },
            },
            { upsert: true }
        );

        console.log('✅ Seed completo!');
        console.log(`   - Jogos: ${partidas.length}`);
        console.log(`   - Rodada inicial: 1`);
        console.log(`   - Data início: 2026-04-12`);

        if (resultado.upsertedCount) {
            console.log('   - Documento criado');
        } else {
            console.log('   - Documento atualizado');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado do MongoDB');
    }
}

seed();
