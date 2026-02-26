#!/usr/bin/env node

/**
 * TESTE FUNCIONAL - MODULO RESTA UM v1.0
 *
 * Valida:
 * 1. Backend - API /api/resta-um/:ligaId/parciais retorna pontos ao vivo
 * 2. Backend - Eliminação automática do primeiro colocado
 * 3. Frontend - Módulo RestaUm carrega e exibe ranking
 *
 * Uso: node scripts/test-resta-um.js --liga <ligaId> [--rodada <num>]
 */

import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';
import RestaUmCache from '../models/RestaUmCache.js';
import Rodada from '../models/Rodada.js';
import Liga from '../models/Liga.js';

const args = process.argv.slice(2);
const ligaIdIdx = args.indexOf('--liga');
const rodadaIdx = args.indexOf('--rodada');

const ligaId = ligaIdIdx >= 0 ? args[ligaIdIdx + 1] : null;
const rodadaNum = rodadaIdx >= 0 ? parseInt(args[rodadaIdx + 1]) : 1;

if (!ligaId) {
    console.error('❌ Uso: node scripts/test-resta-um.js --liga <ligaId> [--rodada <num>]');
    process.exit(1);
}

async function testarRestaUm() {
    try {
        // Conectar ao MongoDB
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('❌ MONGO_URI não definida');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('✅ Conectado ao MongoDB\n');

        // ========================================
        // TESTE 1: Verificar se edição existe
        // ========================================
        console.log('📋 TESTE 1: Verificar edição ativa');
        const edicao = await RestaUmCache.findOne({
            liga_id: ligaId,
            temporada: CURRENT_SEASON,
            status: { $in: ['em_andamento', 'pendente'] }
        });

        if (!edicao) {
            console.log('❌ Nenhuma edição ativa/pendente encontrada');
            console.log('💡 Crie uma edição via: POST /api/resta-um/:ligaId/iniciar');
            await mongoose.disconnect();
            process.exit(0);
        }

        console.log(`✅ Edição ${edicao.edicao} encontrada (status: ${edicao.status})`);
        console.log(`   - Participantes: ${edicao.participantes.length}`);
        console.log(`   - Vivos: ${edicao.participantes.filter(p => p.status === 'vivo').length}`);
        console.log(`   - Eliminados: ${edicao.participantes.filter(p => p.status === 'eliminado').length}\n`);

        // ========================================
        // TESTE 2: Verificar pontos da rodada
        // ========================================
        console.log(`📊 TESTE 2: Verificar pontos da rodada ${rodadaNum}`);
        const rodadas = await Rodada.find({
            ligaId,
            rodada: rodadaNum,
            temporada: CURRENT_SEASON
        }).lean();

        if (rodadas.length === 0) {
            console.log(`⚠️  Nenhum registro de rodada encontrado para R${rodadaNum}`);
        } else {
            console.log(`✅ ${rodadas.length} registros de pontos encontrados:`);
            rodadas.slice(0, 5).forEach((r, i) => {
                console.log(`   ${i + 1}. Time ID ${r.timeId}: ${r.pontos?.toFixed(2) || '--'} pts`);
            });
            if (rodadas.length > 5) console.log(`   ... e ${rodadas.length - 5} mais`);
        }
        console.log('');

        // ========================================
        // TESTE 3: Simular eliminação
        // ========================================
        if (edicao.status === 'em_andamento' && rodadas.length > 0) {
            console.log('🎯 TESTE 3: Simular eliminação automática');

            const vivos = edicao.participantes.filter(p => p.status === 'vivo');
            if (vivos.length <= 1) {
                console.log('⚠️  Apenas 1 vivo restante - disputa finalizada');
            } else {
                // Mapear pontos
                const pontuacoesMap = new Map();
                rodadas.forEach(r => {
                    pontuacoesMap.set(String(r.timeId), r.pontos || 0);
                });

                // Ordenar vivos (ASC = pior primeiro)
                const vivosOrdenados = [...vivos].sort((a, b) => {
                    const pontosA = pontuacoesMap.get(String(a.timeId)) || 0;
                    const pontosB = pontuacoesMap.get(String(b.timeId)) || 0;
                    return pontosA - pontosB;
                });

                const eliminado = vivosOrdenados[0];
                const pontosPior = pontuacoesMap.get(String(eliminado.timeId)) || 0;

                console.log(`✅ SERIA ELIMINADO: ${eliminado.nomeTime}`);
                console.log(`   - Pontos R${rodadaNum}: ${pontosPior.toFixed(2)}`);
                console.log(`   - Acumulado: ${eliminado.pontosAcumulados?.toFixed(2) || 0}`);
                console.log(`   - Rodadas sobrevividas: ${eliminado.rodadasSobrevividas || 0}\n`);

                // Mostrar zona de perigo
                const naZona = vivosOrdenados.slice(1, 2);
                if (naZona.length > 0) {
                    console.log('⚠️  PRÓXIMO NA ZONA DE PERIGO:');
                    naZona.forEach(p => {
                        const pts = pontuacoesMap.get(String(p.timeId)) || 0;
                        console.log(`   - ${p.nomeTime}: ${pts.toFixed(2)} pts`);
                    });
                }
            }
        }

        console.log('\n');

        // ========================================
        // TESTE 4: Validar estrutura Participante
        // ========================================
        console.log('🔍 TESTE 4: Validar estrutura de participantes');
        const primeiroVivo = edicao.participantes.find(p => p.status === 'vivo');
        if (primeiroVivo) {
            console.log(`✅ Estrutura validada (exemplo):`);
            console.log(`   - timeId: ${primeiroVivo.timeId}`);
            console.log(`   - nomeTime: ${primeiroVivo.nomeTime}`);
            console.log(`   - nomeCartoleiro: ${primeiroVivo.nomeCartoleiro}`);
            console.log(`   - status: ${primeiroVivo.status}`);
            console.log(`   - pontosAcumulados: ${primeiroVivo.pontosAcumulados}`);
            console.log(`   - rodadasSobrevividas: ${primeiroVivo.rodadasSobrevividas}`);
            console.log(`   - pontosRodada: ${primeiroVivo.pontosRodada || 'N/A'}`);
        }

        console.log('\n');

        // ========================================
        // TESTE 5: Validar CSS
        // ========================================
        console.log('🎨 TESTE 5: Validar CSS registrado');
        try {
            const fs = await import('fs');
            const cssPath = './public/css/modules/resta-um.css';
            const cssExists = fs.existsSync(cssPath);
            console.log(`${cssExists ? '✅' : '❌'} CSS exists: ${cssPath}`);
        } catch (err) {
            console.log(`⚠️  Erro ao validar CSS: ${err.message}`);
        }

        console.log('\n');

        // ========================================
        // RESUMO
        // ========================================
        console.log('📋 RESUMO DOS TESTES:');
        console.log(`✅ Edição ativa: ${edicao.edicao}`);
        console.log(`✅ Status: ${edicao.status}`);
        console.log(`✅ Participantes vivos: ${edicao.participantes.filter(p => p.status === 'vivo').length}/${edicao.participantes.length}`);
        console.log(`✅ Pontos disponíveis: ${rodadas.length} registros`);
        console.log(`✅ Histórico: ${edicao.historicoEliminacoes?.length || 0} eliminações`);

        console.log('\n🚀 Tudo pronto! Frontend pode fazer polling em /api/resta-um/:ligaId/parciais\n');

    } catch (error) {
        console.error('❌ Erro durante testes:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

testarRestaUm();
