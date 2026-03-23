#!/usr/bin/env node

/**
 * Script de Análise de Participantes
 * 
 * Analisa a collection "times" e fornece estatísticas detalhadas sobre:
 * - Total de participantes
 * - Participantes ativos vs inativos
 * - Times de teste
 * - Distribuição por temporada
 * 
 * Uso:
 *   node scripts/analisar-participantes.js
 *   node scripts/analisar-participantes.js --detalhes
 *   node scripts/analisar-participantes.js --limpar-testes (dry-run)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "../config/database.js";
import Time from "../models/Time.js";

dotenv.config();

// =========================================================================
// CONFIGURAÇÕES
// =========================================================================
const IDS_TESTE = [99999999, 123456]; // IDs conhecidos de times de teste
const PADROES_TESTE = [
    /teste/i,
    /test/i,
    /^time\s*\d+$/i, // "Time 123456"
];

// =========================================================================
// FUNÇÕES AUXILIARES
// =========================================================================

/**
 * Verifica se um time é de teste
 */
function isTimeTeste(time) {
    // Verificar por ID
    if (IDS_TESTE.includes(time.id)) {
        return true;
    }
    
    // Verificar por nome
    const nome = (time.nome_time || "").toLowerCase();
    return PADROES_TESTE.some(padrao => padrao.test(nome));
}

/**
 * Formata número com separador de milhar
 */
function formatarNumero(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formata data
 */
function formatarData(date) {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// =========================================================================
// ANÁLISE PRINCIPAL
// =========================================================================

async function analisarParticipantes(opcoes = {}) {
    const { detalhes = false, limparTestes = false } = opcoes;
    
    console.log("\n" + "=".repeat(80));
    console.log("📊 ANÁLISE DE PARTICIPANTES - Collection 'times'");
    console.log("=".repeat(80) + "\n");
    
    try {
        // Conectar ao banco
        await connectDB();
        
        // Buscar todos os times
        const todosTimes = await Time.find({}).lean().sort({ id: 1 });
        const total = todosTimes.length;
        
        console.log(`📈 Total de registros na collection "times": ${formatarNumero(total)}\n`);
        
        // Classificar times
        const ativos = [];
        const inativos = [];
        const testes = [];
        
        todosTimes.forEach(time => {
            if (isTimeTeste(time)) {
                testes.push(time);
            } else if (time.ativo === false) {
                inativos.push(time);
            } else {
                ativos.push(time);
            }
        });
        
        // Estatísticas gerais
        console.log("📊 ESTATÍSTICAS GERAIS:");
        console.log("─".repeat(80));
        console.log(`   ✅ Participantes ativos:     ${formatarNumero(ativos.length)}`);
        console.log(`   ❌ Participantes inativos:   ${formatarNumero(inativos.length)}`);
        console.log(`   🧪 Times de teste:           ${formatarNumero(testes.length)}`);
        console.log(`   📦 Total:                    ${formatarNumero(total)}`);
        console.log();
        
        // Detalhes dos inativos
        if (inativos.length > 0) {
            console.log("❌ PARTICIPANTES INATIVOS:");
            console.log("─".repeat(80));
            inativos.forEach(time => {
                console.log(`   • ${time.nome_time || "Sem nome"} (ID: ${time.id})`);
                if (time.rodada_desistencia) {
                    console.log(`     └─ Desistiu na rodada ${time.rodada_desistencia}`);
                }
                if (time.createdAt) {
                    console.log(`     └─ Criado em: ${formatarData(time.createdAt)}`);
                }
            });
            console.log();
        }
        
        // Detalhes dos testes
        if (testes.length > 0) {
            console.log("🧪 TIMES DE TESTE:");
            console.log("─".repeat(80));
            testes.forEach(time => {
                console.log(`   • ${time.nome_time || "Sem nome"} (ID: ${time.id})`);
                console.log(`     └─ Status: ${time.ativo ? "Ativo" : "Inativo"}`);
                if (time.createdAt) {
                    console.log(`     └─ Criado em: ${formatarData(time.createdAt)}`);
                }
            });
            console.log();
            
            // Opção de limpeza
            if (limparTestes) {
                console.log("⚠️  MODO DRY-RUN: Os seguintes times seriam removidos:");
                testes.forEach(time => {
                    console.log(`   - ${time.nome_time} (ID: ${time.id})`);
                });
                console.log("\n💡 Para realmente remover, execute com --confirmar");
            }
        }
        
        // Análise por temporada
        const porTemporada = {};
        todosTimes.forEach(time => {
            const temp = time.temporada || "N/A";
            if (!porTemporada[temp]) {
                porTemporada[temp] = { total: 0, ativos: 0, inativos: 0, testes: 0 };
            }
            porTemporada[temp].total++;
            if (isTimeTeste(time)) {
                porTemporada[temp].testes++;
            } else if (time.ativo === false) {
                porTemporada[temp].inativos++;
            } else {
                porTemporada[temp].ativos++;
            }
        });
        
        if (Object.keys(porTemporada).length > 1 || detalhes) {
            console.log("📅 DISTRIBUIÇÃO POR TEMPORADA:");
            console.log("─".repeat(80));
            Object.entries(porTemporada)
                .sort(([a], [b]) => {
                    if (a === "N/A") return 1;
                    if (b === "N/A") return -1;
                    return Number(b) - Number(a);
                })
                .forEach(([temp, stats]) => {
                    console.log(`   Temporada ${temp}:`);
                    console.log(`     Total: ${formatarNumero(stats.total)}`);
                    console.log(`     Ativos: ${formatarNumero(stats.ativos)}`);
                    console.log(`     Inativos: ${formatarNumero(stats.inativos)}`);
                    console.log(`     Testes: ${formatarNumero(stats.testes)}`);
                });
            console.log();
        }
        
        // Informações sobre variáveis de ambiente
        console.log("🔐 CONFIGURAÇÃO DE AMBIENTE:");
        console.log("─".repeat(80));
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        const nodeEnv = process.env.NODE_ENV || "development";

        console.log(`   NODE_ENV: ${nodeEnv}`);
        if (mongoUri) {
            console.log(`   MONGO_URI: Configurada (${mongoUri.substring(0, 20)}...)`);
        } else {
            console.log(`   MONGO_URI: Não encontrada no .env`);
        }
        // ✅ J1 FIX: MONGO_URI_DEV foi descontinuada — banco único cartola-manager
        console.log();
        
        // Resumo final
        console.log("=".repeat(80));
        console.log("✅ Análise concluída!");
        console.log("=".repeat(80) + "\n");
        
        // Retornar dados para uso programático
        return {
            total,
            ativos: ativos.length,
            inativos: inativos.length,
            testes: testes.length,
            detalhes: {
                ativos,
                inativos,
                testes,
                porTemporada,
            },
        };
        
    } catch (error) {
        console.error("❌ Erro ao analisar participantes:", error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log("🔌 Conexão com MongoDB fechada.\n");
    }
}

// =========================================================================
// EXECUÇÃO
// =========================================================================

const args = process.argv.slice(2);
const opcoes = {
    detalhes: args.includes("--detalhes"),
    limparTestes: args.includes("--limpar-testes"),
    confirmar: args.includes("--confirmar"),
};

if (opcoes.confirmar && opcoes.limparTestes) {
    console.log("⚠️  ATENÇÃO: Esta operação irá REMOVER permanentemente os times de teste!");
    console.log("   Pressione Ctrl+C para cancelar ou aguarde 5 segundos...\n");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Implementar remoção real aqui se necessário
    console.log("💡 Funcionalidade de remoção ainda não implementada.");
    console.log("   Use o MongoDB diretamente ou implemente a lógica de remoção.\n");
}

analisarParticipantes(opcoes)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

