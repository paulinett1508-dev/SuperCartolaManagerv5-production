/**
 * REGENERAR BRACKET PONTOS CORRIDOS
 *
 * Audita todas as ligas com Pontos Corridos ativo e detecta caches gerados com
 * bracket incompleto (participante ausente, ex: adicionado após primeiras rodadas).
 * Quando --force é usado, regera os caches do zero com o bracket correto (todos
 * os participantes ativos ordenados alfabeticamente).
 *
 * Uso:
 *   node scripts/regenerar-bracket-pontos-corridos.js [opções]
 *
 * Opções:
 *   --dry-run          Audita e mostra o que seria feito (padrão sem --force)
 *   --force            Executa a regeneração real no MongoDB
 *   --liga-id <id>     Restringe a uma liga específica
 *   --temporada <ano>  Temporada alvo (padrão: 2026)
 *   --all              Audita/regenera TODAS as ligas com PC ativo
 *
 * Exemplos:
 *   # Auditar todas as ligas
 *   node scripts/regenerar-bracket-pontos-corridos.js
 *
 *   # Auditar liga específica
 *   node scripts/regenerar-bracket-pontos-corridos.js --liga-id abc123 --dry-run
 *
 *   # Regenerar liga específica
 *   node scripts/regenerar-bracket-pontos-corridos.js --liga-id abc123 --force
 *
 *   # Regenerar TODAS as ligas com anomalias
 *   node scripts/regenerar-bracket-pontos-corridos.js --all --force
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// ─── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const LIGA_ID_ARG = (() => {
    const idx = args.indexOf('--liga-id');
    return idx !== -1 ? args[idx + 1] : null;
})();
const TEMPORADA = (() => {
    const idx = args.indexOf('--temporada');
    return idx !== -1 ? Number(args[idx + 1]) : 2026;
})();
const DRY_RUN  = !args.includes('--force');
const ALL_MODE = args.includes('--all');

if (!LIGA_ID_ARG && !ALL_MODE && !DRY_RUN) {
    console.error('❌ Para regenerar TODAS as ligas use --all --force, ou especifique --liga-id <id>');
    process.exit(1);
}

// ─── Algoritmo round-robin (rotação) ─────────────────────────────────────────
// Idêntico ao gerarBracketFromIds do controller — NÃO alterar sem alinhar os dois.
function gerarBracket(ids) {
    const lista = [...ids];
    if (lista.length % 2 !== 0) lista.push(null); // BYE para número ímpar
    const total = lista.length - 1;
    const rodadas = [];
    for (let r = 0; r < total; r++) {
        const jogos = [];
        for (let i = 0; i < lista.length / 2; i++) {
            const a = lista[i];
            const b = lista[lista.length - 1 - i];
            if (a !== null && b !== null) jogos.push({ timeAId: String(a), timeBId: String(b) });
        }
        rodadas.push(jogos);
        lista.splice(1, 0, lista.pop()); // rotação: último → posição 1
    }
    return rodadas;
}

// ─── Truncar pontos (regra do projeto) ───────────────────────────────────────
function truncar(num) {
    return Math.trunc(Number(num) * 100) / 100;
}

// ─── Calcular resultado de um confronto ─────────────────────────────────────
function calcularResultado(p1, p2, config) {
    const diff = Math.abs(p1 - p2);
    const { empateTolerancia, goleadaMinima } = config.criterios;
    const fin = config.financeiro;
    const bonusPts = config.pontuacao_tabela?.bonus_goleada ?? 1;

    if (diff <= empateTolerancia) {
        return { pontosA: 1, pontosB: 1, financeiroA: fin.empate, financeiroB: fin.empate, tipo: 'empate' };
    }
    const goleada = diff >= goleadaMinima;
    if (p1 > p2) {
        return {
            pontosA: goleada ? 3 + bonusPts : 3,
            pontosB: 0,
            financeiroA: goleada ? fin.goleada : fin.vitoria,
            financeiroB: goleada ? -fin.goleada : fin.derrota,
            tipo: goleada ? 'goleada' : 'vitoria',
        };
    }
    return {
        pontosA: 0,
        pontosB: goleada ? 3 + bonusPts : 3,
        financeiroA: goleada ? -fin.goleada : fin.derrota,
        financeiroB: goleada ? fin.goleada : fin.vitoria,
        tipo: goleada ? 'goleada' : 'vitoria',
    };
}

// ─── Calcular classificação acumulada ────────────────────────────────────────
function calcularClassificacao(participantes, confrontosRodada, classificacaoAnterior, config) {
    const tabela = {};

    // Inicializar com todos os participantes
    for (const p of participantes) {
        const tid = String(p.time_id);
        tabela[tid] = {
            timeId: tid,
            nome: p.nome_time || `Time ${tid}`,
            nome_cartola: p.nome_cartola || '',
            escudo: p.url_escudo_png || p.foto_time || p.escudo || '',
            pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
            pontosGoleada: 0, gols_pro: 0, gols_contra: 0, saldo_gols: 0,
            financeiro: 0, ativo: p.ativo !== false,
        };
    }

    // Carregar acumulado da rodada anterior
    if (classificacaoAnterior) {
        for (const t of classificacaoAnterior) {
            const tid = String(t.timeId || t.time_id || t.id);
            if (tabela[tid]) {
                Object.assign(tabela[tid], {
                    pontos:      Number(t.pontos)      || 0,
                    jogos:       Number(t.jogos)       || 0,
                    vitorias:    Number(t.vitorias)    || 0,
                    empates:     Number(t.empates)     || 0,
                    derrotas:    Number(t.derrotas)    || 0,
                    pontosGoleada: Number(t.pontosGoleada) || 0,
                    gols_pro:    Number(t.gols_pro)    || 0,
                    gols_contra: Number(t.gols_contra) || 0,
                    saldo_gols:  Number(t.saldo_gols)  || 0,
                    financeiro:  Number(t.financeiro)  || 0,
                });
            }
        }
    }

    // Aplicar confrontos da rodada atual
    for (const c of confrontosRodada) {
        const t1 = String(c.time1.id);
        const t2 = String(c.time2.id);
        const p1 = Number(c.time1.pontos) || 0;
        const p2 = Number(c.time2.pontos) || 0;
        const res = calcularResultado(p1, p2, config);

        if (tabela[t1]) {
            tabela[t1].jogos       += 1;
            tabela[t1].pontos      += res.pontosA;
            tabela[t1].gols_pro    += p1;
            tabela[t1].gols_contra += p2;
            tabela[t1].saldo_gols   = tabela[t1].gols_pro - tabela[t1].gols_contra;
            tabela[t1].financeiro  += res.financeiroA;
            if (res.pontosA >= 3) { tabela[t1].vitorias += 1; if (res.tipo === 'goleada') tabela[t1].pontosGoleada += 1; }
            else if (res.pontosA === 1) tabela[t1].empates += 1;
            else tabela[t1].derrotas += 1;
        }
        if (tabela[t2]) {
            tabela[t2].jogos       += 1;
            tabela[t2].pontos      += res.pontosB;
            tabela[t2].gols_pro    += p2;
            tabela[t2].gols_contra += p1;
            tabela[t2].saldo_gols   = tabela[t2].gols_pro - tabela[t2].gols_contra;
            tabela[t2].financeiro  += res.financeiroB;
            if (res.pontosB >= 3) { tabela[t2].vitorias += 1; if (res.tipo === 'goleada') tabela[t2].pontosGoleada += 1; }
            else if (res.pontosB === 1) tabela[t2].empates += 1;
            else tabela[t2].derrotas += 1;
        }
    }

    const sortFn = (a, b) =>
        (b.pontos - a.pontos) ||
        (b.gols_pro - a.gols_pro) ||
        (b.saldo_gols - a.saldo_gols) ||
        (b.vitorias - a.vitorias) ||
        (b.pontosGoleada - a.pontosGoleada);

    const ativos   = Object.values(tabela).filter(t => t.ativo !== false).sort(sortFn);
    const inativos = Object.values(tabela).filter(t => t.ativo === false).sort(sortFn);
    const todos    = [...ativos, ...inativos];

    return todos.map((t, idx) => ({
        ...t,
        posicao: t.ativo !== false ? ativos.indexOf(t) + 1 : null,
    }));
}

// ─── Auditar uma liga ─────────────────────────────────────────────────────────
async function auditarLiga(db, liga, temporada) {
    const ligaId = String(liga._id);
    const participantesAtivos = (liga.participantes || []).filter(p => p.ativo !== false);
    const n = participantesAtivos.length;
    const expectedPerRound = n % 2 === 0 ? n / 2 : (n - 1) / 2;

    const caches = await db.collection('pontoscorridoscaches')
        .find({ liga_id: ligaId, temporada })
        .sort({ rodada_consolidada: 1 })
        .toArray();

    const allIds = new Set(participantesAtivos.map(p => String(p.time_id)));
    const problemas = [];

    for (const c of caches) {
        const actual = (c.confrontos || []).length;
        const idsNoCache = new Set();
        for (const cf of (c.confrontos || [])) {
            if (cf.time1?.id) idsNoCache.add(String(cf.time1.id));
            if (cf.time2?.id) idsNoCache.add(String(cf.time2.id));
        }
        const ausentes = [...allIds].filter(id => !idsNoCache.has(id));

        if (actual !== expectedPerRound || ausentes.length > 0) {
            problemas.push({
                rodada: c.rodada_consolidada,
                confrontosEsperados: expectedPerRound,
                confrontosAtuais: actual,
                participantesAusentes: ausentes,
            });
        }
    }

    return { ligaId, nome: liga.nome || ligaId, participantes: n, cachesTotal: caches.length, problemas };
}

// ─── Buscar config do módulo ─────────────────────────────────────────────────
async function buscarConfig(db, ligaId, temporada) {
    try {
        const mc = await db.collection('moduleconfigs').findOne({
            liga_id: String(ligaId),
            modulo: 'pontos_corridos',
            temporada,
        });

        const overrides = mc?.regras_override || mc?.regras || {};
        const finOverrides = mc?.financeiro_override?.valores_simples || mc?.financeiro_override || {};

        return {
            rodadaInicial: overrides.rodada_inicial ?? overrides.rodadaInicial ?? 7,
            criterios: {
                empateTolerancia: overrides.tolerancia_empate ?? 0.3,
                goleadaMinima:    overrides.limite_goleada    ?? 50.0,
            },
            financeiro: {
                vitoria: finOverrides.vitoria ?? overrides.valor_vitoria ?? 5.0,
                empate:  finOverrides.empate  ?? overrides.valor_empate  ?? 3.0,
                derrota: finOverrides.derrota ?? overrides.valor_derrota ?? -5.0,
                goleada: (() => {
                    const base    = finOverrides.vitoria  ?? overrides.valor_vitoria ?? 5.0;
                    const bonus   = mc?.regras_override?.bonus_goleada ?? 2.0;
                    return base + bonus;
                })(),
            },
            pontuacao_tabela: {
                vitoria: 3,
                empate:  1,
                derrota: 0,
                bonus_goleada: overrides.bonus_pontos_goleada ?? 1,
            },
        };
    } catch {
        return {
            rodadaInicial: 7,
            criterios: { empateTolerancia: 0.3, goleadaMinima: 50.0 },
            financeiro: { vitoria: 5.0, empate: 3.0, derrota: -5.0, goleada: 7.0 },
            pontuacao_tabela: { vitoria: 3, empate: 1, derrota: 0, bonus_goleada: 1 },
        };
    }
}

// ─── Regenerar caches de uma liga ────────────────────────────────────────────
async function regenerarLiga(db, liga, temporada, dryRun) {
    const ligaId = String(liga._id);
    const participantesAtivos = (liga.participantes || [])
        .filter(p => p.ativo !== false)
        .sort((a, b) => (a.nome_cartola || '').localeCompare(b.nome_cartola || ''));

    const n = participantesAtivos.length;
    if (n < 2) {
        console.log(`  ⚠️  Menos de 2 participantes ativos — pulando.`);
        return 0;
    }

    const config = await buscarConfig(db, ligaId, temporada);
    // liga.configuracoes é mais confiável que moduleconfigs (sem dependência de tipo de ID)
    const rodadaInicialLiga = liga.configuracoes?.pontos_corridos?.rodadaInicial
        || liga.configuracoes?.temporada_2026?.rodada_inicial;
    if (rodadaInicialLiga) config.rodadaInicial = rodadaInicialLiga;
    const { rodadaInicial } = config;

    // Gerar bracket canônico com todos os participantes ativos
    const ids     = participantesAtivos.map(p => String(p.time_id));
    const bracket = gerarBracket(ids);
    console.log(`  📐 Bracket gerado: ${n} times → ${bracket.length} rodadas | rodadaInicial BR: ${rodadaInicial}`);

    // Buscar todos os dados de pontuação na collection rodadas
    const rodadasDocs = await db.collection('rodadas')
        .find({ ligaId: new mongoose.Types.ObjectId(ligaId), temporada })
        .sort({ rodada: 1 })
        .toArray();

    if (rodadasDocs.length === 0) {
        console.log(`  ℹ️  Nenhum dado na collection rodadas para T${temporada} — nada a regenerar.`);
        return 0;
    }

    // Agrupar scores por rodada BR
    const scoresPorBR = {};
    const timesDataMap = {};
    for (const r of rodadasDocs) {
        const brRound = r.rodada;
        if (!scoresPorBR[brRound]) scoresPorBR[brRound] = {};
        scoresPorBR[brRound][String(r.timeId)] = r.pontos || 0;
        if (!timesDataMap[String(r.timeId)]) {
            timesDataMap[String(r.timeId)] = {
                nome:         r.nome_time     || `Time ${r.timeId}`,
                nome_cartola: r.nome_cartola  || '',
                escudo:       r.foto_time     || r.escudo || '',
            };
        }
    }

    // Também popular timesDataMap dos participantes da liga (fallback)
    for (const p of participantesAtivos) {
        const tid = String(p.time_id);
        if (!timesDataMap[tid]) {
            timesDataMap[tid] = {
                nome:         p.nome_time     || `Time ${tid}`,
                nome_cartola: p.nome_cartola  || '',
                escudo:       p.url_escudo_png || p.foto_time || '',
            };
        }
    }

    // Determinar quais rodadas BR têm dados e caem no módulo PC
    const brRodadasComDados = Object.keys(scoresPorBR)
        .map(Number)
        .filter(br => br >= rodadaInicial)
        .sort((a, b) => a - b);

    if (brRodadasComDados.length === 0) {
        console.log(`  ℹ️  Nenhuma rodada BR >= ${rodadaInicial} com dados — nada a regenerar.`);
        return 0;
    }

    console.log(`  📊 Rodadas BR com dados para PC: ${brRodadasComDados.join(', ')}`);

    if (dryRun) {
        console.log(`  🔍 DRY-RUN: seriam regerados ${brRodadasComDados.length} cache(s) para a liga.`);
        // Mostrar amostra do novo R1
        const br1 = brRodadasComDados[0];
        const ligaRound1 = br1 - rodadaInicial + 1;
        const jogos1 = bracket[ligaRound1 - 1] || [];
        console.log(`  🔍 Novo bracket R${ligaRound1} (BR R${br1}):`);
        for (const j of jogos1) {
            const nA = timesDataMap[j.timeAId]?.nome_cartola || j.timeAId;
            const nB = timesDataMap[j.timeBId]?.nome_cartola || j.timeBId;
            const sA = scoresPorBR[br1]?.[j.timeAId] ?? '?';
            const sB = scoresPorBR[br1]?.[j.timeBId] ?? '?';
            console.log(`     ${nA} (${sA}pts) ×  ${nB} (${sB}pts)`);
        }
        return brRodadasComDados.length;
    }

    // ── EXECUÇÃO REAL ──
    // 1. Deletar todos os caches existentes desta liga/temporada
    const delResult = await db.collection('pontoscorridoscaches').deleteMany({ liga_id: ligaId, temporada });
    console.log(`  🗑️  ${delResult.deletedCount} cache(s) antigo(s) removido(s)`);

    // 2. Regenerar rodada por rodada, acumulando classificação
    let classificacaoAnterior = null;
    let salvos = 0;

    for (const brRound of brRodadasComDados) {
        const ligaRound = brRound - rodadaInicial + 1;
        const jogos     = bracket[ligaRound - 1];

        if (!jogos || jogos.length === 0) {
            console.log(`  ⚠️  Rodada liga ${ligaRound} não existe no bracket (${bracket.length} rodadas) — pulando BR ${brRound}`);
            continue;
        }

        const scores = scoresPorBR[brRound] || {};

        // Montar confrontos com scores reais
        const confrontos = [];
        for (const jogo of jogos) {
            const tid1  = jogo.timeAId;
            const tid2  = jogo.timeBId;
            const p1    = truncar(scores[tid1] ?? 0);
            const p2    = truncar(scores[tid2] ?? 0);
            const res   = calcularResultado(p1, p2, config);
            const dados1 = timesDataMap[tid1] || {};
            const dados2 = timesDataMap[tid2] || {};

            confrontos.push({
                time1: { id: Number(tid1), nome: dados1.nome || `Time ${tid1}`, nome_cartola: dados1.nome_cartola || '', escudo: dados1.escudo || '', pontos: p1 },
                time2: { id: Number(tid2), nome: dados2.nome || `Time ${tid2}`, nome_cartola: dados2.nome_cartola || '', escudo: dados2.escudo || '', pontos: p2 },
                pontos1:      res.pontosA,
                pontos2:      res.pontosB,
                financeiro1:  Math.round(res.financeiroA),
                financeiro2:  Math.round(res.financeiroB),
                tipo:         res.tipo,
                diferenca:    truncar(Math.abs(p1 - p2)),
            });
        }

        // Calcular classificação acumulada
        const classificacao = calcularClassificacao(
            participantesAtivos,
            confrontos,
            classificacaoAnterior,
            config
        );

        // Salvar no MongoDB
        await db.collection('pontoscorridoscaches').updateOne(
            { liga_id: ligaId, rodada_consolidada: ligaRound, temporada },
            {
                $set: {
                    liga_id:            ligaId,
                    rodada_consolidada: ligaRound,
                    temporada,
                    cache_permanente:   true,
                    confrontos,
                    classificacao,
                    ultima_atualizacao: new Date(),
                    regenerado_em:      new Date(),
                    regenerado_por:     'regenerar-bracket-pontos-corridos.js',
                }
            },
            { upsert: true }
        );

        classificacaoAnterior = classificacao;
        salvos++;
        console.log(`  ✅ R${ligaRound} (BR R${brRound}): ${confrontos.length} confrontos salvos`);
    }

    return salvos;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('═'.repeat(70));
    console.log('  REGENERAR BRACKET — PONTOS CORRIDOS');
    console.log(`  Temporada: ${TEMPORADA} | Modo: ${DRY_RUN ? '🔍 DRY-RUN' : '⚡ EXECUÇÃO REAL'}`);
    if (LIGA_ID_ARG) console.log(`  Liga alvo: ${LIGA_ID_ARG}`);
    console.log('═'.repeat(70));

    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI não definida. Configure a variável de ambiente.');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    // Buscar ligas alvo
    const filtro = { 'modulos_ativos.pontosCorridos': true };
    if (LIGA_ID_ARG) filtro._id = new mongoose.Types.ObjectId(LIGA_ID_ARG);
    const ligas = await db.collection('ligas').find(filtro).toArray();

    if (ligas.length === 0) {
        console.log('ℹ️  Nenhuma liga encontrada com Pontos Corridos ativo.');
        await mongoose.disconnect();
        return;
    }

    console.log(`\n🔎 ${ligas.length} liga(s) encontrada(s)\n`);

    let totalProblemas = 0;
    let totalRegenerados = 0;

    for (const liga of ligas) {
        const ligaId = String(liga._id);
        console.log(`\n▸ Liga: ${liga.nome || ligaId}  (${ligaId})`);

        // Auditoria sempre
        const audit = await auditarLiga(db, liga, TEMPORADA);
        if (audit.problemas.length === 0) {
            console.log(`  ✅ Bracket OK — ${audit.cachesTotal} cache(s), ${audit.participantes} participantes ativos`);
            continue;
        }

        totalProblemas += audit.problemas.length;
        console.log(`  ⚠️  ${audit.problemas.length} ANOMALIA(S) DETECTADA(S):`);
        for (const p of audit.problemas) {
            const ausentes = p.participantesAusentes.length > 0
                ? ` | ausentes: [${p.participantesAusentes.join(', ')}]`
                : '';
            console.log(`     Rodada ${p.rodada}: ${p.confrontosAtuais} confrontos (esperado: ${p.confrontosEsperados})${ausentes}`);
        }

        if (!DRY_RUN && (ALL_MODE || LIGA_ID_ARG === ligaId)) {
            console.log(`\n  🔄 Iniciando regeneração...`);
            const salvos = await regenerarLiga(db, liga, TEMPORADA, false);
            totalRegenerados += salvos;
        } else if (DRY_RUN) {
            await regenerarLiga(db, liga, TEMPORADA, true);
        }
    }

    console.log('\n' + '═'.repeat(70));
    if (DRY_RUN) {
        console.log(`📊 RESUMO DRY-RUN: ${totalProblemas} anomalia(s) encontrada(s)`);
        if (totalProblemas > 0) {
            console.log('   Para aplicar a correção: adicione --force ao comando');
        }
    } else {
        console.log(`📊 RESUMO: ${totalProblemas} anomalia(s) encontrada(s) | ${totalRegenerados} cache(s) regenerado(s)`);
    }
    console.log('═'.repeat(70));

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Erro fatal:', err.message || err);
    process.exit(1);
});
