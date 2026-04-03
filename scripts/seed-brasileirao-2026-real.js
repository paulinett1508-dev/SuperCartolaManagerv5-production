#!/usr/bin/env node
// =====================================================================
// SEED BRASILEIRÃO 2026 - DADOS REAIS
// Fonte: ge.globo.com, 365scores, cbf.com.br, perplexity
// =====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
}

// =====================================================================
// TIMES DO BRASILEIRÃO 2026 (REAIS)
// Promovidos: Coritiba, Remo (após 32 anos!), Chapecoense
// Rebaixados 2025: Fortaleza, Cuiabá, Juventude
// =====================================================================
const TIMES_2026 = {
    'Palmeiras': 275,
    'São Paulo': 276,
    'Corinthians': 264,
    'Bahia': 265,
    'Fluminense': 266,
    'Athletico-PR': 293,
    'Red Bull Bragantino': 280,
    'Grêmio': 284,
    'Chapecoense': 315,
    'Mirassol': 2305,
    'Flamengo': 262,
    'Coritiba': 294,
    'Santos': 277,
    'Botafogo': 263,
    'Vitória': 287,
    'Remo': 364,
    'Atlético-MG': 282,
    'Internacional': 285,
    'Cruzeiro': 283,
    'Vasco': 267,
};

// =====================================================================
// RODADAS REAIS - DADOS COLETADOS DE FONTES OFICIAIS
// =====================================================================

// RODADA 1 - 28 e 29/01/2026
const RODADA_1 = [
    { mandante: 'Atlético-MG', visitante: 'Palmeiras', placar: [2, 2], data: '2026-01-28', horario: '19:00', status: 'encerrado' },
    { mandante: 'Internacional', visitante: 'Athletico-PR', placar: [0, 1], data: '2026-01-28', horario: '19:00', status: 'encerrado' },
    { mandante: 'Coritiba', visitante: 'Red Bull Bragantino', placar: [0, 1], data: '2026-01-28', horario: '19:00', status: 'encerrado' },
    { mandante: 'Vitória', visitante: 'Remo', placar: [2, 0], data: '2026-01-28', horario: '19:00', status: 'encerrado' },
    { mandante: 'Fluminense', visitante: 'Grêmio', placar: [2, 1], data: '2026-01-28', horario: '19:30', status: 'encerrado' },
    { mandante: 'Corinthians', visitante: 'Bahia', placar: [1, 2], data: '2026-01-28', horario: '20:00', status: 'encerrado' },
    { mandante: 'Chapecoense', visitante: 'Santos', placar: [4, 2], data: '2026-01-28', horario: '20:00', status: 'encerrado' },
    { mandante: 'São Paulo', visitante: 'Flamengo', placar: [2, 1], data: '2026-01-28', horario: '21:30', status: 'encerrado' },
    { mandante: 'Mirassol', visitante: 'Vasco', placar: [2, 1], data: '2026-01-29', horario: '20:00', status: 'encerrado' },
    { mandante: 'Botafogo', visitante: 'Cruzeiro', placar: [4, 0], data: '2026-01-29', horario: '21:30', status: 'encerrado' },
];

// RODADA 2 - 04 e 05/02/2026
const RODADA_2 = [
    { mandante: 'Red Bull Bragantino', visitante: 'Atlético-MG', placar: [1, 0], data: '2026-02-04', horario: '19:00', status: 'encerrado' },
    { mandante: 'Palmeiras', visitante: 'Vitória', placar: [4, 3], data: '2026-02-04', horario: '19:00', status: 'encerrado' },
    { mandante: 'Santos', visitante: 'São Paulo', placar: [1, 1], data: '2026-02-04', horario: '19:30', status: 'encerrado' },
    { mandante: 'Remo', visitante: 'Mirassol', placar: [1, 2], data: '2026-02-04', horario: '20:00', status: 'encerrado' },
    { mandante: 'Flamengo', visitante: 'Internacional', placar: [1, 1], data: '2026-02-04', horario: '20:00', status: 'encerrado' },
    { mandante: 'Grêmio', visitante: 'Botafogo', placar: [3, 2], data: '2026-02-04', horario: '21:30', status: 'encerrado' },
    { mandante: 'Bahia', visitante: 'Fluminense', placar: [1, 1], data: '2026-02-05', horario: '19:00', status: 'encerrado' },
    { mandante: 'Vasco', visitante: 'Chapecoense', placar: [1, 1], data: '2026-02-05', horario: '19:00', status: 'encerrado' },
    { mandante: 'Cruzeiro', visitante: 'Coritiba', placar: [1, 2], data: '2026-02-05', horario: '20:00', status: 'encerrado' },
    // Jogo adiado - jogado em 19/02
    { mandante: 'Athletico-PR', visitante: 'Corinthians', placar: [1, 1], data: '2026-02-19', horario: '20:00', status: 'encerrado', observacao: 'Adiado da R2, jogado 19/02' },
];

// RODADA 3 - 11 e 12/02/2026
const RODADA_3 = [
    { mandante: 'Vitória', visitante: 'Flamengo', placar: [1, 2], data: '2026-02-11', horario: '20:00', status: 'encerrado' },
    { mandante: 'Mirassol', visitante: 'Cruzeiro', placar: [2, 2], data: '2026-02-12', horario: '19:00', status: 'encerrado' },
    { mandante: 'Chapecoense', visitante: 'Coritiba', placar: [3, 3], data: '2026-02-12', horario: '19:00', status: 'encerrado' },
    { mandante: 'Atlético-MG', visitante: 'Remo', placar: [3, 3], data: '2026-02-12', horario: '19:00', status: 'encerrado' },
    { mandante: 'São Paulo', visitante: 'Grêmio', placar: [2, 1], data: '2026-02-12', horario: '19:30', status: 'encerrado' },
    { mandante: 'Fluminense', visitante: 'Botafogo', placar: [1, 0], data: '2026-02-12', horario: '20:00', status: 'encerrado' },
    { mandante: 'Corinthians', visitante: 'Red Bull Bragantino', placar: [2, 0], data: '2026-02-12', horario: '20:00', status: 'encerrado' },
    { mandante: 'Internacional', visitante: 'Palmeiras', placar: [2, 3], data: '2026-02-12', horario: '21:30', status: 'encerrado' },
    { mandante: 'Vasco', visitante: 'Bahia', placar: [0, 1], data: '2026-02-12', horario: '21:30', status: 'encerrado' },
    { mandante: 'Athletico-PR', visitante: 'Santos', placar: [1, 1], data: '2026-02-12', horario: '21:30', status: 'encerrado' },
];

// RODADA 4 - 25 e 26/02/2026 (3 jogos ADIADOS)
const RODADA_4 = [
    { mandante: 'Red Bull Bragantino', visitante: 'Athletico-PR', placar: [1, 1], data: '2026-02-25', horario: '19:00', status: 'encerrado' },
    { mandante: 'Remo', visitante: 'Internacional', placar: [1, 1], data: '2026-02-25', horario: '19:00', status: 'encerrado' },
    { mandante: 'Coritiba', visitante: 'São Paulo', placar: [0, 1], data: '2026-02-26', horario: '20:00', status: 'encerrado' },
    { mandante: 'Cruzeiro', visitante: 'Corinthians', placar: [1, 1], data: '2026-02-25', horario: '20:00', status: 'encerrado' },
    { mandante: 'Grêmio', visitante: 'Atlético-MG', placar: [2, 1], data: '2026-02-25', horario: '21:30', status: 'encerrado' },
    { mandante: 'Palmeiras', visitante: 'Fluminense', placar: [2, 1], data: '2026-02-25', horario: '21:30', status: 'encerrado' },
    { mandante: 'Santos', visitante: 'Vasco', placar: [2, 1], data: '2026-02-26', horario: '19:00', status: 'encerrado' },
    // JOGOS ADIADOS
    { mandante: 'Flamengo', visitante: 'Mirassol', placar: null, data: '2026-02-25', horario: '20:00', status: 'adiado', observacao: 'Adiado - Flamengo na Libertadores' },
    { mandante: 'Botafogo', visitante: 'Vitória', placar: null, data: '2026-02-25', horario: '19:00', status: 'adiado', observacao: 'Adiado - Botafogo na Sul-Americana' },
    { mandante: 'Bahia', visitante: 'Chapecoense', placar: null, data: '2026-02-25', horario: '19:00', status: 'adiado', observacao: 'Adiado - Bahia na Libertadores' },
];

// RODADA 5 - 10, 11 e 12/03/2026 (AGENDADA)
// Fonte: ge.globo.com/cartola - 27/02/2026
const RODADA_5 = [
    { mandante: 'Mirassol', visitante: 'Santos', placar: null, data: '2026-03-10', horario: '21:30', status: 'agendado' },
    { mandante: 'Atlético-MG', visitante: 'Internacional', placar: null, data: '2026-03-11', horario: '19:00', status: 'agendado' },
    { mandante: 'Bahia', visitante: 'Vitória', placar: null, data: '2026-03-11', horario: '20:00', status: 'agendado' },
    { mandante: 'Flamengo', visitante: 'Cruzeiro', placar: null, data: '2026-03-11', horario: '21:30', status: 'agendado' },
    { mandante: 'Corinthians', visitante: 'Coritiba', placar: null, data: '2026-03-11', horario: '21:30', status: 'agendado' },
    { mandante: 'Remo', visitante: 'Fluminense', placar: null, data: '2026-03-12', horario: '19:00', status: 'agendado' },
    { mandante: 'Vasco', visitante: 'Palmeiras', placar: null, data: '2026-03-12', horario: '19:30', status: 'agendado' },
    { mandante: 'São Paulo', visitante: 'Chapecoense', placar: null, data: '2026-03-12', horario: '20:00', status: 'agendado' },
    { mandante: 'Grêmio', visitante: 'Red Bull Bragantino', placar: null, data: '2026-03-12', horario: '21:30', status: 'agendado' },
    { mandante: 'Athletico-PR', visitante: 'Botafogo', placar: null, data: '2026-03-12', horario: '21:30', status: 'agendado' },
];

// Gerar rodadas futuras (6-38) com confrontos aproximados
function gerarRodadasFuturas() {
    const partidas = [];
    const times = Object.keys(TIMES_2026);

    // Datas base das rodadas (aproximadas - serão atualizadas pelo sync)
    const datasRodadas = {
        6: '2026-03-14', 7: '2026-03-18', 8: '2026-03-21', 9: '2026-04-01',
        10: '2026-04-04', 11: '2026-04-11', 12: '2026-04-18', 13: '2026-04-25',
        14: '2026-05-02', 15: '2026-05-09', 16: '2026-05-16', 17: '2026-05-23',
        18: '2026-05-30', 19: '2026-07-22', 20: '2026-07-25', 21: '2026-08-01',
        22: '2026-08-08', 23: '2026-08-15', 24: '2026-08-22', 25: '2026-08-29',
        26: '2026-09-05', 27: '2026-09-12', 28: '2026-09-19', 29: '2026-09-26',
        30: '2026-10-10', 31: '2026-10-17', 32: '2026-10-24', 33: '2026-10-28',
        34: '2026-11-04', 35: '2026-11-18', 36: '2026-11-21', 37: '2026-11-28',
        38: '2026-12-02',
    };

    for (let rodada = 6; rodada <= 38; rodada++) {
        const dataBase = datasRodadas[rodada] || `2026-${String(Math.floor(rodada / 4) + 3).padStart(2, '0')}-15`;
        const timesRodada = [...times].sort(() => Math.random() - 0.5);

        for (let i = 0; i < 10; i++) {
            const mandante = timesRodada[i * 2];
            const visitante = timesRodada[i * 2 + 1];
            const horarios = ['16:00', '18:30', '20:00', '21:30'];

            partidas.push({
                id_externo: `seed_${rodada}_${i}`,
                rodada,
                data: dataBase,
                horario: horarios[i % horarios.length],
                mandante,
                visitante,
                mandante_id: TIMES_2026[mandante],
                visitante_id: TIMES_2026[visitante],
                placar_mandante: null,
                placar_visitante: null,
                status: 'agendado',
            });
        }
    }

    return partidas;
}

// Converter rodada para formato do banco
function converterRodada(rodadaData, numeroRodada) {
    return rodadaData.map((jogo, idx) => ({
        id_externo: `real_${numeroRodada}_${idx}`,
        rodada: numeroRodada,
        data: jogo.data,
        horario: jogo.horario,
        mandante: jogo.mandante,
        visitante: jogo.visitante,
        mandante_id: TIMES_2026[jogo.mandante],
        visitante_id: TIMES_2026[jogo.visitante],
        placar_mandante: jogo.placar ? jogo.placar[0] : null,
        placar_visitante: jogo.placar ? jogo.placar[1] : null,
        status: jogo.status,
        observacao: jogo.observacao || null,
    }));
}

async function seed() {
    console.log('🌱 Iniciando seed do Brasileirão 2026 com DADOS REAIS...');
    console.log('📊 Fonte: ge.globo.com, 365scores, cbf.com.br');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('calendariobrasileiraos');

        // Montar todas as partidas
        const partidas = [
            ...converterRodada(RODADA_1, 1),
            ...converterRodada(RODADA_2, 2),
            ...converterRodada(RODADA_3, 3),
            ...converterRodada(RODADA_4, 4),
            ...converterRodada(RODADA_5, 5),
            ...gerarRodadasFuturas(),
        ];

        console.log(`📅 Total de partidas: ${partidas.length}`);

        // Calcular stats
        const jogosEncerrados = partidas.filter(p => p.status === 'encerrado').length;
        const jogosAdiados = partidas.filter(p => p.status === 'adiado').length;

        // Encontrar rodada atual (última rodada com jogos não realizados)
        const rodadasComJogosRestantes = [...new Set(
            partidas.filter(p => p.status !== 'encerrado').map(p => p.rodada)
        )].sort((a, b) => a - b);
        const rodadaAtual = rodadasComJogosRestantes[0] || 5;

        // Última rodada 100% completa
        const rodadasCompletas = [];
        for (let r = 1; r <= 38; r++) {
            const jogosDaRodada = partidas.filter(p => p.rodada === r);
            const todosEncerrados = jogosDaRodada.every(p => p.status === 'encerrado');
            if (todosEncerrados && jogosDaRodada.length === 10) {
                rodadasCompletas.push(r);
            }
        }
        const ultimaRodadaCompleta = Math.max(...rodadasCompletas, 0);

        const stats = {
            total_jogos: partidas.length,
            jogos_realizados: jogosEncerrados,
            jogos_restantes: partidas.length - jogosEncerrados,
            jogos_adiados: jogosAdiados,
            rodada_atual: rodadaAtual,
            ultima_rodada_completa: ultimaRodadaCompleta,
        };

        console.log('\n📈 Estatísticas:');
        console.log(`   - Jogos realizados: ${jogosEncerrados}`);
        console.log(`   - Jogos adiados: ${jogosAdiados}`);
        console.log(`   - Rodada atual: ${rodadaAtual}`);
        console.log(`   - Última rodada completa: ${ultimaRodadaCompleta}`);

        // Upsert no banco
        await collection.updateOne(
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

        console.log('\n✅ Seed completo!');

        // Mostrar alguns resultados
        console.log('\n⚽ Alguns resultados da Rodada 1:');
        RODADA_1.slice(0, 5).forEach(j => {
            console.log(`   ${j.mandante} ${j.placar[0]} x ${j.placar[1]} ${j.visitante}`);
        });

        console.log('\n⚠️  Jogos ADIADOS na Rodada 4:');
        RODADA_4.filter(j => j.status === 'adiado').forEach(j => {
            console.log(`   ${j.mandante} x ${j.visitante} - ${j.observacao}`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado do MongoDB');
    }
}

seed();
