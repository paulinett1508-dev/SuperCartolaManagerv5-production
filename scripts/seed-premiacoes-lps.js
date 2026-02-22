/**
 * seed-premiacoes-lps.js
 *
 * Propaga valores de premiação para o accordion "Premiações" de cada LP
 * (Artilheiro, Capitão de Luxo, Luva de Ouro) sem o admin configurar módulo a módulo.
 *
 * MODO 1 — Propagar config existente:
 *   Lê o ModuleConfig.financeiro_override já salvo para cada módulo e grava o HTML
 *   no RegraModulo ({modulo}_premiacao). Útil quando o admin já configurou algum módulo.
 *
 * MODO 2 — Definir valores direto pela linha de comando:
 *   Cria/sobrescreve o ModuleConfig.financeiro_override de todos os módulos LP com
 *   os valores passados como argumento, e em seguida grava o HTML no RegraModulo.
 *   Permite configurar todas as ligas (ou uma) em um único comando.
 *
 * Uso:
 *   # Propagar config existente (dry-run)
 *   node scripts/seed-premiacoes-lps.js --dry-run
 *
 *   # Propagar config existente (gravar)
 *   node scripts/seed-premiacoes-lps.js --force
 *
 *   # Definir valores e gravar para todas as ligas
 *   node scripts/seed-premiacoes-lps.js --force --1lugar=150 --2lugar=80 --3lugar=40
 *
 *   # Definir valores e gravar para uma liga específica
 *   node scripts/seed-premiacoes-lps.js --force --liga-id=XYZ --1lugar=100 --2lugar=60
 *
 *   # Suporte a até 5 posições
 *   node scripts/seed-premiacoes-lps.js --force --1lugar=200 --2lugar=100 --3lugar=50 --4lugar=30 --5lugar=20
 *
 * Módulos LP tratados: artilheiro, capitao_luxo, luva_ouro
 * (resta_um já tem mecanismo próprio e é ignorado)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const TEMPORADA  = 2026;

// ---------------------------------------------------------------------------
// Parse de argumentos
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun  = args.includes('--dry-run');
const isForce   = args.includes('--force');
const ligaIdArg = (args.find(a => a.startsWith('--liga-id=')) || '').replace('--liga-id=', '');

function parseValorArg(nome) {
    const raw = (args.find(a => a.startsWith(`--${nome}=`)) || '').replace(`--${nome}=`, '');
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
}

const valoresArg = {
    1: parseValorArg('1lugar'),
    2: parseValorArg('2lugar'),
    3: parseValorArg('3lugar'),
    4: parseValorArg('4lugar'),
    5: parseValorArg('5lugar')
};

// Remove posições não fornecidas
const valoresInformados = Object.fromEntries(
    Object.entries(valoresArg).filter(([, v]) => v !== null)
);

const modoDefinirValores = Object.keys(valoresInformados).length > 0;

if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar.');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Configuração dos módulos LP
// ---------------------------------------------------------------------------

const LP_MODULOS = [
    {
        modulo:     'artilheiro',
        regraKey:   'artilheiro_premiacao',
        titulo:     'Premiação — Artilheiro Campeão',
        icone:      'emoji_events',
        cor:        '#22c55e',
        ordem:      107,
        labelCampo: 'artilheiro'
    },
    {
        modulo:     'capitao_luxo',
        regraKey:   'capitao_luxo_premiacao',
        titulo:     'Premiação — Capitão de Luxo',
        icone:      'emoji_events',
        cor:        '#8b5cf6',
        ordem:      108,
        labelCampo: 'capitão'
    },
    {
        modulo:     'luva_ouro',
        regraKey:   'luva_ouro_premiacao',
        titulo:     'Premiação — Luva de Ouro',
        icone:      'emoji_events',
        cor:        '#ffd700',
        ordem:      109,
        labelCampo: 'luva de ouro'
    }
];

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function formatBRL(valor) {
    const n = parseFloat(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const POS_LABELS = { '1': '1º Lugar', '2': '2º Lugar', '3': '3º Lugar', '4': '4º Lugar', '5': '5º Lugar' };
const POS_ICONS  = { '1': 'workspace_premium', '2': 'military_tech', '3': 'stars' };
const POS_CORES  = { '1': '#ffd700', '2': '#c0c0c0', '3': '#cd7f32' };

/**
 * Gera HTML de premiações a partir de financeiro_override.
 * Retorna null se não houver dados suficientes.
 */
function gerarHtmlPremiacoes(financeiro_override, labelCampo) {
    if (!financeiro_override) return null;

    const { valores_por_posicao, valores_simples } = financeiro_override;
    let items = [];

    if (valores_por_posicao && typeof valores_por_posicao === 'object') {
        const entries = Object.entries(valores_por_posicao)
            .filter(([, v]) => v !== null && v !== undefined && v !== 0)
            .sort(([a], [b]) => Number(a) - Number(b));

        if (entries.length === 0) return null;

        items = entries.map(([pos, val]) => {
            const label = POS_LABELS[pos] || `${pos}º Lugar`;
            const icon  = POS_ICONS[pos]  || 'emoji_events';
            const cor   = POS_CORES[pos]  || '#888';
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:10px 14px;border-radius:10px;
                        background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
                        margin-bottom:8px;">
                <span style="display:flex;align-items:center;gap:8px;font-weight:600;color:${cor};">
                    <span class="material-icons" style="font-size:18px;color:${cor};">${icon}</span>
                    ${label}
                </span>
                <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#fff;">
                    ${formatBRL(val)}
                </span>
            </div>`;
        });
    } else if (valores_simples && typeof valores_simples === 'object') {
        const KEY_LABELS = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate' };
        const entries = Object.entries(valores_simples)
            .filter(([, v]) => v !== null && v !== undefined);

        if (entries.length === 0) return null;

        items = entries.map(([key, val]) => {
            const label = KEY_LABELS[key] || key;
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:10px 14px;border-radius:10px;
                        background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
                        margin-bottom:8px;">
                <span style="font-weight:600;color:#e2e8f0;">${label}</span>
                <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#fff;">
                    ${formatBRL(val)}
                </span>
            </div>`;
        });
    }

    if (items.length === 0) return null;

    return `<div style="padding:4px 0;">
        ${items.join('')}
        <p style="font-size:12px;color:var(--app-text-muted,#64748b);
                   margin-top:10px;text-align:center;">
            Premiação para o <strong>${labelCampo}</strong> ao fim da temporada.
        </p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Gravar ModuleConfig.financeiro_override (Modo 2)
// ---------------------------------------------------------------------------

async function upsertModuleConfig(db, ligaOid, modulo, valoresPorPosicao) {
    await db.collection('moduleconfigs').updateOne(
        { liga_id: ligaOid, modulo },
        {
            $set: {
                liga_id:    ligaOid,
                temporada:  TEMPORADA,
                modulo,
                ativo:      true,
                'financeiro_override.valores_por_posicao': valoresPorPosicao,
                atualizado_por: 'script:seed-premiacoes-lps',
                atualizado_em:  new Date()
            },
            $setOnInsert: {
                criado_em:        new Date(),
                wizard_respostas: {},
                configurado_por:  'script:seed-premiacoes-lps'
            }
        },
        { upsert: true }
    );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
    console.log(`\n🏆 seed-premiacoes-lps.js — Modo: ${isDryRun ? 'DRY-RUN (sem gravação)' : 'FORCE (gravando)'}`);

    if (modoDefinirValores) {
        console.log('   Estratégia: DEFINIR VALORES por argumento');
        console.log('   Valores informados:');
        Object.entries(valoresInformados).forEach(([pos, val]) =>
            console.log(`     ${pos}º lugar → ${formatBRL(val)}`)
        );
    } else {
        console.log('   Estratégia: PROPAGAR config existente do ModuleConfig');
    }

    if (ligaIdArg) console.log(`   Liga alvo: ${ligaIdArg}`);
    console.log('─'.repeat(60));

    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    const ligaQuery = ligaIdArg
        ? { _id: new mongoose.Types.ObjectId(ligaIdArg) }
        : {};

    const ligas = await db.collection('ligas').find(ligaQuery, {
        projection: { _id: 1, nome: 1, modulos_ativos: 1 }
    }).toArray();

    console.log(`\n📋 Ligas encontradas: ${ligas.length}`);

    let totalAtualizados = 0;
    let totalSemConfig   = 0;
    let totalIgnorados   = 0;

    for (const liga of ligas) {
        const ligaOid       = liga._id;
        const ligaNome      = liga.nome || liga._id.toString();
        const modulosAtivos = liga.modulos_ativos || {};

        console.log(`\n🏟️  Liga: ${ligaNome}`);

        for (const { modulo, regraKey, titulo, icone, cor, ordem, labelCampo } of LP_MODULOS) {
            // Módulo desativado na liga → pular
            if (modulosAtivos[modulo] === false) {
                console.log(`   ⏭️  ${modulo}: desativado na liga — ignorando`);
                totalIgnorados++;
                continue;
            }

            let fo = null;

            if (modoDefinirValores) {
                // Modo 2: valores vieram da linha de comando
                fo = { valores_por_posicao: { ...valoresInformados } };

                if (!isDryRun) {
                    await upsertModuleConfig(db, ligaOid, modulo, { ...valoresInformados });
                    console.log(`   💾 ModuleConfig ${modulo}: financeiro_override gravado`);
                } else {
                    console.log(`   💾 [DRY-RUN] ModuleConfig ${modulo}: seria gravado com ${JSON.stringify(valoresInformados)}`);
                }
            } else {
                // Modo 1: ler ModuleConfig existente do banco
                const mc = await db.collection('moduleconfigs').findOne({ liga_id: ligaOid, modulo });
                fo = mc?.financeiro_override;

                const temDados = fo && (
                    (fo.valores_por_posicao && Object.keys(fo.valores_por_posicao).length > 0) ||
                    (fo.valores_simples && Object.values(fo.valores_simples).some(v => v !== null))
                );

                if (!temDados) {
                    console.log(`   ℹ️  ${modulo}: sem financeiro_override no ModuleConfig — pulando`);
                    totalSemConfig++;
                    continue;
                }
            }

            // Gerar HTML a partir dos valores
            const html = gerarHtmlPremiacoes(fo, labelCampo);

            if (!html) {
                console.log(`   ⚠️  ${modulo}: financeiro_override gerou HTML vazio — pulando`);
                totalSemConfig++;
                continue;
            }

            if (isDryRun) {
                console.log(`   ✅ [DRY-RUN] ${regraKey}: RegraModulo seria atualizado`);
                totalAtualizados++;
                continue;
            }

            // Upsert no RegraModulo (chave de fallback das LPs)
            await db.collection('regrasmodulos').updateOne(
                { liga_id: ligaOid, modulo: regraKey },
                {
                    $set: {
                        liga_id:        ligaOid,
                        modulo:         regraKey,
                        titulo,
                        icone,
                        cor,
                        ordem,
                        ativo:          true,
                        conteudo_html:  html,
                        atualizado_por: 'script:seed-premiacoes-lps',
                        atualizado_em:  new Date()
                    },
                    $setOnInsert: { criado_em: new Date() }
                },
                { upsert: true }
            );

            console.log(`   ✅ ${regraKey}: RegraModulo atualizado`);
            totalAtualizados++;
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('📊 Resumo:');
    console.log(`   ✅ Atualizados : ${totalAtualizados}`);
    console.log(`   ℹ️  Sem config  : ${totalSemConfig}`);
    console.log(`   ⏭️  Ignorados   : ${totalIgnorados}`);

    if (isDryRun) {
        console.log('\n⚠️  Modo DRY-RUN: nenhuma alteração foi gravada.');
        console.log('   Rode com --force para aplicar.');
    } else {
        console.log('\n✅ Concluído. As LPs exibirão os valores no accordion "Premiações".');
        console.log('   (Fallback via RegraModulo usado automaticamente pelas LPs)');
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
