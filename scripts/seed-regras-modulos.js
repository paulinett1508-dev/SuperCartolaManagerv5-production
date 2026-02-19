/**
 * Script: Seed Regras de Módulos
 *
 * Persiste regras iniciais no banco para módulos específicos.
 * Usa upsert — seguro para rodar múltiplas vezes (idempotente).
 *
 * Uso:
 *   node scripts/seed-regras-modulos.js --dry-run        # Simula
 *   node scripts/seed-regras-modulos.js --force           # Executa
 *   node scripts/seed-regras-modulos.js --force --liga=ID  # Liga específica
 *
 * @version 1.0.0
 * @since 2026-02-08
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// ═══════════════════════════════════════════════════════
// MÓDULOS A SEMEAR
// ═══════════════════════════════════════════════════════

const REGRAS_SEED = [
    {
        modulo: 'banco',
        titulo: 'Banco (Ranking da Rodada)',
        icone: 'account_balance',
        cor: '#ff5500',
        ordem: 1,
        conteudo_html: `<h3>💰 Como funciona o Banco?</h3>
<p>Toda rodada, os participantes são ranqueados pela pontuação do Cartola FC. Dependendo da sua posição nesse ranking, você <strong>ganha</strong>, <strong>perde</strong> ou fica <strong>neutro</strong> financeiramente.</p>
<ul>
<li><strong>Zona de Ganho</strong> (primeiros colocados): Você recebe dinheiro no seu saldo!</li>
<li><strong>Zona Neutra</strong> (meio da tabela): Não ganha nem perde.</li>
<li><strong>Zona de Perda</strong> (últimos colocados): Você perde dinheiro do saldo.</li>
</ul>
<p>O <strong>Mito da Rodada</strong> (1º lugar) ganha o valor máximo e o <strong>Mico da Rodada</strong> (último) perde o valor máximo.</p>
<p><em>Mande bem na rodada e ganhe dinheiro. Mande mal e perde. Simples assim!</em></p>`
    },
    {
        modulo: 'top10',
        titulo: 'Top 10 Mitos e Micos',
        icone: 'emoji_events',
        cor: '#f59e0b',
        ordem: 3,
        conteudo_html: `<h3>🌟 Como funciona o Top 10?</h3>
<p>No final da temporada, olhamos <strong>todas as pontuações individuais de todas as rodadas</strong> e separamos:</p>
<ul>
<li><strong>Top 10 Mitos</strong>: As 10 maiores pontuações da temporada. Quem aparece aqui <strong>ganha prêmio</strong>!</li>
<li><strong>Top 10 Micos</strong>: As 10 piores pontuações da temporada. Quem aparece aqui <strong>paga multa</strong>!</li>
</ul>
<p>O 1º Mito ganha o maior prêmio e vai diminuindo até o 10º. O 1º Mico paga a maior multa.</p>
<p><em>Uma única rodada espetacular pode render um prêmio gordo. Mas uma rodada desastrosa pode custar caro!</em></p>`
    },
    {
        modulo: 'melhor_mes',
        titulo: 'Melhor do Mês',
        icone: 'calendar_month',
        cor: '#06b6d4',
        ordem: 4,
        conteudo_html: `<h3>📅 Como funciona o Melhor do Mês?</h3>
<p>A temporada é dividida em <strong>edições mensais</strong>. Em cada edição, quem somar mais pontos nas rodadas daquele período é o <strong>campeão do mês</strong> e leva o prêmio!</p>
<p>No final da temporada, quem acumular <strong>mais títulos mensais</strong> ganha um bônus extra.</p>
<p><em>A cada mês, uma nova chance de brilhar!</em></p>`
    },
    {
        modulo: 'pontos_corridos',
        titulo: 'Pontos Corridos',
        icone: 'sports',
        cor: '#22c55e',
        ordem: 5,
        conteudo_html: `<h3>⚽ Como funciona o Pontos Corridos?</h3>
<p>Funciona igual a um campeonato de futebol! A cada rodada, você é sorteado para enfrentar <strong>um adversário</strong> da liga.</p>
<h4>Pontuação do confronto:</h4>
<ul>
<li><strong>Vitória</strong>: 3 pontos + bônus financeiro</li>
<li><strong>Empate</strong>: 1 ponto + valor menor</li>
<li><strong>Derrota</strong>: 0 pontos + multa</li>
<li><strong>Goleada</strong> (diferença grande): Bônus extra de 1 ponto</li>
</ul>
<p><em>Não basta pontuar bem — você precisa pontuar mais que seu adversário direto!</em></p>`
    },
    {
        modulo: 'extrato',
        titulo: 'Extrato Financeiro',
        icone: 'receipt_long',
        cor: '#10b981',
        ordem: 11,
        conteudo_html: `<h3>📊 Como funciona o Extrato Financeiro?</h3>
<p>O Extrato é o seu "extrato bancário" dentro da liga. Mostra <strong>tudo que você ganhou e perdeu</strong> ao longo da temporada.</p>
<p>Cada módulo com impacto financeiro (Banco, Top 10, Melhor do Mês, Pontos Corridos, etc.) aparece como uma linha no seu extrato.</p>
<ul>
<li><strong>Créditos</strong> (verde): Dinheiro que entrou</li>
<li><strong>Débitos</strong> (vermelho): Dinheiro que saiu</li>
<li><strong>Saldo</strong>: Seu total atual</li>
</ul>
<p><em>É aqui que você acompanha se está no lucro ou no prejuízo!</em></p>`
    },
    {
        modulo: 'bolao_copa_mundo',
        titulo: 'Bolão da Copa do Mundo',
        icone: 'public',
        cor: '#eab308',
        ordem: 12,
        conteudo_html: `<h3>🌍 Como funciona o Bolão da Copa do Mundo?</h3>
<p>Em ano de Copa do Mundo, a liga ganha um módulo especial de <strong>palpites</strong>!</p>
<h4>Mecânica:</h4>
<ul>
<li>Antes de cada jogo, você dá seu <strong>palpite no placar</strong></li>
<li>Acertou o placar exato? Pontuação máxima!</li>
<li>Acertou o resultado (vitória/empate/derrota)? Pontuação parcial</li>
<li>Errou tudo? Zero pontos naquele jogo</li>
</ul>
<p>Quem acumular mais pontos ao longo da Copa é o <strong>campeão do Bolão</strong> e leva o prêmio!</p>
<p><em>Módulo especial — ativado apenas em anos de Copa do Mundo.</em></p>`
    },
    {
        modulo: 'copa_mundo_sc',
        titulo: 'Copa do Mundo do Super Cartola',
        icone: 'stadium',
        cor: '#14b8a6',
        ordem: 14,
        conteudo_html: `<h3>🏟️ Como funciona a Copa do Mundo do Super Cartola?</h3>
<p>Um torneio especial inspirado no formato da Copa do Mundo FIFA, disputado entre os participantes da liga!</p>
<h4>Formato:</h4>
<ul>
<li><strong>Fase de Grupos</strong>: Participantes divididos em grupos, todos se enfrentam</li>
<li><strong>Oitavas, Quartas, Semi e Final</strong>: Eliminação direta pela pontuação do Cartola</li>
<li>Chaveamento clássico (1º do Grupo A vs 2º do Grupo B)</li>
</ul>
<p>O campeão ganha o troféu máximo e o maior prêmio!</p>
<p><em>O torneio mais épico da temporada!</em></p>`
    },
    {
        modulo: 'resta_um',
        titulo: 'Resta Um',
        icone: 'person_off',
        cor: '#f43f5e',
        ordem: 15,
        conteudo_html: `<h3><span class="material-icons" style="color: var(--app-danger); vertical-align: middle; margin-right: 4px;">person_off</span> Como funciona o Resta Um?</h3>
<p>Uma competição de sobrevivência! A cada rodada, o <strong>pior colocado é eliminado</strong> até restar apenas um.</p>
<h4>Regras:</h4>
<ul>
<li>Todos os participantes inscritos começam como <strong>sobreviventes</strong></li>
<li>A cada rodada, quem fizer a <strong>menor pontuação</strong> entre os sobreviventes é eliminado</li>
<li>Uma vez eliminado, <strong>não pode retornar</strong> à competição</li>
<li>Eliminações se acumulam até restar apenas o campeão</li>
</ul>
<h4>Desempate na eliminação:</h4>
<ol>
<li>Menor pontuação acumulada na edição</li>
<li>Mais vezes na zona de eliminação</li>
<li>Pior posição no ranking geral da temporada</li>
</ol>
<h4>Edições:</h4>
<p>Pode haver até <strong>2 edições por temporada</strong> (configurável pelo admin). Cada edição é uma disputa independente.</p>
<h4>Premiação:</h4>
<ul>
<li><span class="material-icons" style="color: var(--app-gold); font-size: 16px; vertical-align: middle;">emoji_events</span> <strong>Campeão (último sobrevivente)</strong> — Prêmio principal</li>
<li><span class="material-icons" style="color: var(--app-silver, #c0c0c0); font-size: 16px; vertical-align: middle;">emoji_events</span> <strong>Vice (último eliminado)</strong> — Prêmio secundário</li>
<li><span class="material-icons" style="color: var(--app-bronze, #cd7f32); font-size: 16px; vertical-align: middle;">emoji_events</span> <strong>3º lugar (penúltimo eliminado)</strong> — Prêmio de consolação</li>
</ul>
<p><em>Cada rodada é uma final. Não dá pra relaxar nunca!</em></p>`
    },
    {
        modulo: 'tiro_certo',
        titulo: 'Tiro Certo',
        icone: 'ads_click',
        cor: '#6366f1',
        ordem: 16,
        conteudo_html: `<h3>🎯 Como funciona o Tiro Certo?</h3>
<p>Aqui a estratégia é diferente! Antes de cada rodada, você define uma <strong>meta de pontuação</strong> para o seu time.</p>
<h4>Como pontua:</h4>
<ul>
<li>Quanto <strong>mais perto da meta</strong> você chegar, mais pontos ganha</li>
<li>Acertou a meta exata (ou muito próximo)? Pontuação máxima!</li>
<li>Passou muito ou ficou muito abaixo? Pontuação menor</li>
</ul>
<p>O ranking é pela soma dos pontos de precisão ao longo da temporada.</p>
<p><em>Não basta pontuar alto — tem que saber prever o próprio desempenho!</em></p>`
    }
];

// ═══════════════════════════════════════════════════════
// EXECUÇÃO
// ═══════════════════════════════════════════════════════

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');
const ligaArg = process.argv.find(a => a.startsWith('--liga='));

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run ou --force');
    process.exit(1);
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('regrasmodulos');

    // Descobrir ligas alvo
    let ligaIds;
    if (ligaArg) {
        ligaIds = [ligaArg.split('=')[1]];
    } else {
        const ligas = await db.collection('ligas').find({}, { projection: { _id: 1, nome: 1 } }).toArray();
        ligaIds = ligas.map(l => l._id.toString());
        console.log(`🏟️  Ligas encontradas: ${ligas.length}`);
        ligas.forEach(l => console.log(`   - ${l.nome} (${l._id})`));
        console.log('');
    }

    // PASSO 1: Limpar registros órfãos (liga_id como string ao invés de ObjectId)
    console.log('🧹 Limpando registros órfãos (liga_id string)...');
    for (const ligaId of ligaIds) {
        const orfaos = await collection.deleteMany({
            liga_id: ligaId, // string match (não ObjectId)
            $expr: { $eq: [{ $type: '$liga_id' }, 'string'] }
        });
        if (orfaos.deletedCount > 0) {
            console.log(`   🗑️  ${orfaos.deletedCount} órfãos removidos da liga ${ligaId}`);
        }
    }
    console.log('');

    // PASSO 2: Upsert dos módulos (ObjectId + preencher campos faltantes)
    let totalCriados = 0;
    let totalAtualizados = 0;
    let totalIntactos = 0;

    for (const ligaId of ligaIds) {
        const objectId = new mongoose.Types.ObjectId(ligaId);
        console.log(`\n🔧 Liga: ${ligaId}`);
        console.log('─'.repeat(50));

        for (const regra of REGRAS_SEED) {
            const existe = await collection.findOne({
                liga_id: objectId,
                modulo: regra.modulo
            });

            if (existe && existe.titulo && existe.ordem !== 0) {
                console.log(`   ⏭️  ${regra.modulo} — completo, pulando`);
                totalIntactos++;
                continue;
            }

            if (existe && (!existe.titulo || existe.ordem === 0)) {
                // Registro incompleto (criado por toggle upsert) — preencher
                if (isDryRun) {
                    console.log(`   🔧 ${regra.modulo} — SERIA atualizado (campos faltantes)`);
                } else {
                    await collection.updateOne(
                        { _id: existe._id },
                        { $set: {
                            titulo: regra.titulo,
                            icone: regra.icone,
                            cor: regra.cor,
                            ordem: regra.ordem,
                            conteudo_html: existe.conteudo_html || regra.conteudo_html,
                            atualizado_em: new Date()
                        }}
                    );
                    console.log(`   🔧 ${regra.modulo} — atualizado (campos faltantes preenchidos)`);
                }
                totalAtualizados++;
                continue;
            }

            // Não existe — criar
            if (isDryRun) {
                console.log(`   🔍 ${regra.modulo} — SERIA criado (dry-run)`);
            } else {
                await collection.insertOne({
                    liga_id: objectId,
                    modulo: regra.modulo,
                    titulo: regra.titulo,
                    icone: regra.icone,
                    cor: regra.cor,
                    ordem: regra.ordem,
                    conteudo_html: regra.conteudo_html,
                    ativo: true,
                    atualizado_em: new Date(),
                    criado_em: new Date()
                });
                console.log(`   ✅ ${regra.modulo} — criado`);
            }
            totalCriados++;
        }
    }

    console.log('\n══════════════════════════════════════');
    console.log(`📊 Resumo:`);
    console.log(`   Ligas processadas: ${ligaIds.length}`);
    console.log(`   Módulos criados: ${totalCriados}${isDryRun ? ' (dry-run)' : ''}`);
    console.log(`   Módulos atualizados: ${totalAtualizados}${isDryRun ? ' (dry-run)' : ''}`);
    console.log(`   Módulos intactos: ${totalIntactos}`);
    console.log('══════════════════════════════════════\n');

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
