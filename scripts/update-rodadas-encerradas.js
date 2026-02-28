#!/usr/bin/env node
// =====================================================================
// UPDATE RODADAS ENCERRADAS - Atualiza rodadas 1-4 com placares
// Inclui jogos adiados para simular cenário real
// =====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI não configurada');
    process.exit(1);
}

// Placares fictícios realistas (baseados em médias do Brasileirão)
function gerarPlacar() {
    const opcoes = [
        [1, 0], [2, 1], [0, 0], [1, 1], [2, 0], [3, 1], [2, 2],
        [1, 2], [0, 1], [3, 0], [0, 2], [1, 3], [4, 1], [3, 2]
    ];
    return opcoes[Math.floor(Math.random() * opcoes.length)];
}

// Jogos adiados por rodada (simulando chuva, jogos de copa, etc.)
const JOGOS_ADIADOS = {
    1: [2],   // Jogo 3 da rodada 1 adiado (índice 2)
    2: [],    // Rodada 2 completa
    3: [5, 7], // Jogos 6 e 8 da rodada 3 adiados
    4: [9],   // Jogo 10 da rodada 4 adiado
};

async function atualizarRodadas() {
    console.log('🔄 Atualizando rodadas 1-4 com placares...');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('calendariobrasileiraos');

        // Buscar calendário 2026
        const calendario = await collection.findOne({ temporada: 2026 });
        if (!calendario) {
            console.error('❌ Calendário 2026 não encontrado');
            process.exit(1);
        }

        console.log(`📅 Encontrado calendário com ${calendario.partidas.length} jogos`);

        let jogosAtualizados = 0;
        let jogosAdiados = 0;

        // Atualizar partidas das rodadas 1-4
        const partidasAtualizadas = calendario.partidas.map((partida, idx) => {
            if (partida.rodada > 4) return partida;

            // Verificar se é jogo adiado
            const indiceNaRodada = idx % 10;
            const adiados = JOGOS_ADIADOS[partida.rodada] || [];
            
            if (adiados.includes(indiceNaRodada)) {
                jogosAdiados++;
                return {
                    ...partida,
                    status: 'adiado',
                    placar_mandante: null,
                    placar_visitante: null,
                };
            }

            // Gerar placar
            const [gols_mandante, gols_visitante] = gerarPlacar();
            jogosAtualizados++;

            return {
                ...partida,
                status: 'encerrado',
                placar_mandante: gols_mandante,
                placar_visitante: gols_visitante,
            };
        });

        // Calcular stats
        const jogosRealizados = partidasAtualizadas.filter(p => p.status === 'encerrado').length;
        const jogosRestantes = partidasAtualizadas.filter(p => p.status !== 'encerrado').length;

        // Atualizar no banco
        await collection.updateOne(
            { temporada: 2026 },
            {
                $set: {
                    partidas: partidasAtualizadas,
                    ultima_atualizacao: new Date(),
                    stats: {
                        total_jogos: 380,
                        jogos_realizados: jogosRealizados,
                        jogos_restantes: jogosRestantes,
                        rodada_atual: 5, // Próxima rodada
                        ultima_rodada_completa: 2, // Rodada 2 é a última 100% completa
                    },
                },
            }
        );

        console.log('✅ Atualização completa!');
        console.log(`   - Jogos com placar: ${jogosAtualizados}`);
        console.log(`   - Jogos adiados: ${jogosAdiados}`);
        console.log(`   - Rodada atual: 5`);
        console.log(`   - Última rodada completa: 2`);

        // Mostrar alguns resultados
        console.log('\n📊 Alguns resultados da Rodada 1:');
        partidasAtualizadas
            .filter(p => p.rodada === 1)
            .slice(0, 5)
            .forEach(p => {
                if (p.status === 'adiado') {
                    console.log(`   ${p.mandante} x ${p.visitante} - ADIADO`);
                } else {
                    console.log(`   ${p.mandante} ${p.placar_mandante} x ${p.placar_visitante} ${p.visitante}`);
                }
            });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado do MongoDB');
    }
}

atualizarRodadas();
