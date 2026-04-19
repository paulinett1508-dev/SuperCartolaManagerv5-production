/**
 * Diagnóstico e correção genérica do MataMataCache.
 *
 * Generaliza `fix-matamata-ed5-2025.js` para qualquer liga/edição/temporada.
 * Compara o cache atual com o recálculo feito a partir da collection `rodadas`
 * e da `ModuleConfig` (calendario_override / wizard_respostas), classificando
 * a causa de eventuais pontuações zeradas:
 *   - CACHE_STALE:        cache difere de dados reais existentes → aplicar correção
 *   - DADO_REAL_ZERO:     participante pontuou 0 de verdade → não é bug
 *   - RODADA_VAZIA:       Rodada collection sem dados para aquela chave → problema upstream
 *   - CALENDARIO_AUSENTE: fase→rodada não resolvível → reconfigurar módulo antes
 *
 * Uso:
 *   node scripts/diagnosticar-matamata.js --liga-nome="Super Cartola" --edicao=2 --dry-run
 *   node scripts/diagnosticar-matamata.js --liga-id=<ObjectId> --edicao=2 --temporada=2026 --dry-run
 *   node scripts/diagnosticar-matamata.js --liga-id=<ObjectId> --edicao=2 --force
 *
 * Dry-run é o default. --force exige argumento explícito.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const FASES_ORDEM = ['primeira', 'oitavas', 'quartas', 'semis', 'final'];

function parseArgs(argv) {
    const out = { dryRun: true, force: false };
    for (const raw of argv.slice(2)) {
        if (raw === '--force') { out.force = true; out.dryRun = false; continue; }
        if (raw === '--dry-run') { out.dryRun = true; out.force = false; continue; }
        const m = raw.match(/^--([^=]+)=(.*)$/);
        if (!m) continue;
        const [, k, v] = m;
        if (k === 'liga-id') out.ligaId = v;
        else if (k === 'liga-nome') out.ligaNome = v;
        else if (k === 'edicao') out.edicao = Number(v);
        else if (k === 'temporada') out.temporada = Number(v);
    }
    return out;
}

function getFasesParaTamanho(tamanho) {
    if (tamanho >= 32) return ['primeira', 'oitavas', 'quartas', 'semis', 'final'];
    if (tamanho >= 16) return ['oitavas', 'quartas', 'semis', 'final'];
    if (tamanho >= 8) return ['quartas', 'semis', 'final'];
    return [];
}

function montarConfrontosPrimeiraFase(rankingBase, pontosRodadaAtual, tamanhoTorneio) {
    const confrontos = [];
    const metade = tamanhoTorneio / 2;
    for (let i = 0; i < metade; i++) {
        const timeA = rankingBase[i];
        const timeB = rankingBase[tamanhoTorneio - 1 - i];
        if (!timeA || !timeB) continue;
        const pontosA = pontosRodadaAtual[timeA.timeId];
        const pontosB = pontosRodadaAtual[timeB.timeId];
        confrontos.push({
            jogo: i + 1,
            timeA: {
                timeId: timeA.timeId,
                nome: timeA.nome_time || timeA.nome_cartola,
                nome_time: timeA.nome_time || null,
                nome_cartola: timeA.nome_cartola || null,
                pontos: typeof pontosA === 'number' ? pontosA : null,
                rankR2: i + 1,
            },
            timeB: {
                timeId: timeB.timeId,
                nome: timeB.nome_time || timeB.nome_cartola,
                nome_time: timeB.nome_time || null,
                nome_cartola: timeB.nome_cartola || null,
                pontos: typeof pontosB === 'number' ? pontosB : null,
                rankR2: tamanhoTorneio - i,
            },
        });
    }
    return confrontos;
}

function montarConfrontosFase(vencedoresAnteriores, pontosRodadaAtual, numJogos) {
    const confrontos = [];
    const ordenados = [...vencedoresAnteriores].sort(
        (a, b) => (a.jogoAnterior || 0) - (b.jogoAnterior || 0),
    );
    for (let i = 0; i < numJogos; i++) {
        const timeA = ordenados[i * 2];
        const timeB = ordenados[i * 2 + 1];
        if (!timeA || !timeB) continue;
        const pontosA = pontosRodadaAtual[timeA.timeId];
        const pontosB = pontosRodadaAtual[timeB.timeId];
        confrontos.push({
            jogo: i + 1,
            jogoAnteriorA: timeA.jogoAnterior ?? null,
            jogoAnteriorB: timeB.jogoAnterior ?? null,
            timeA: {
                ...timeA,
                pontos: typeof pontosA === 'number' ? pontosA : null,
            },
            timeB: {
                ...timeB,
                pontos: typeof pontosB === 'number' ? pontosB : null,
            },
        });
    }
    return confrontos;
}

function determinarVencedor(confronto) {
    const { timeA, timeB } = confronto;
    const pA = typeof timeA?.pontos === 'number';
    const pB = typeof timeB?.pontos === 'number';
    if (pA && pB) {
        if (timeA.pontos > timeB.pontos) return { vencedor: timeA, perdedor: timeB };
        if (timeB.pontos > timeA.pontos) return { vencedor: timeB, perdedor: timeA };
    }
    const rA = timeA?.rankR2 ?? 999;
    const rB = timeB?.rankR2 ?? 999;
    return rA < rB ? { vencedor: timeA, perdedor: timeB } : { vencedor: timeB, perdedor: timeA };
}

async function resolverLiga(db, args) {
    if (args.ligaId) {
        const asObj = mongoose.Types.ObjectId.isValid(args.ligaId)
            ? new mongoose.Types.ObjectId(args.ligaId)
            : null;
        const filtro = asObj ? { $or: [{ _id: asObj }, { _id: args.ligaId }] } : { _id: args.ligaId };
        const liga = await db.collection('ligas').findOne(filtro, { projection: { _id: 1, nome: 1 } });
        if (!liga) throw new Error(`Liga não encontrada pelo _id ${args.ligaId}`);
        return liga;
    }
    if (args.ligaNome) {
        const regex = new RegExp(args.ligaNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const ligas = await db.collection('ligas')
            .find({ nome: regex }, { projection: { _id: 1, nome: 1 } })
            .toArray();
        if (ligas.length === 0) throw new Error(`Nenhuma liga bate com "${args.ligaNome}"`);
        if (ligas.length > 1) {
            console.error('⚠️ Múltiplas ligas encontradas. Desambiguar com --liga-id:');
            ligas.forEach(l => console.error(`   - ${l.nome}  _id=${l._id}`));
            throw new Error('Ambiguidade no nome da liga');
        }
        return ligas[0];
    }
    throw new Error('Informe --liga-id=<ObjectId> ou --liga-nome="..."');
}

async function resolverCalendarioEdicao(db, ligaObjectId, edicaoId, temporada) {
    const modConfig = await db.collection('moduleconfigs').findOne({
        liga_id: ligaObjectId,
        modulo: 'mata_mata',
        temporada,
    });

    // calendario_override (admin wizard) → fonte de verdade
    if (modConfig?.calendario_override?.length > 0) {
        const e = modConfig.calendario_override.find(x => Number(x.edicao) === edicaoId);
        if (e) {
            return {
                id: edicaoId,
                rodadaInicial: Number(e.rodada_inicial),
                rodadaFinal: Number(e.rodada_final),
                rodadaDefinicao: Number(e.rodada_definicao),
                fases: e.fases || null,
                fonte: 'calendario_override',
                wizard: modConfig.wizard_respostas || {},
            };
        }
    }

    // Fallback: reconstruir do wizard_respostas
    if (modConfig?.wizard_respostas?.total_times && modConfig?.wizard_respostas?.qtd_edicoes) {
        const totalTimes = Number(modConfig.wizard_respostas.total_times);
        const qtdEdicoes = Number(modConfig.wizard_respostas.qtd_edicoes);
        const fasesNomes = getFasesParaTamanho(totalTimes);
        const numFases = fasesNomes.length;
        let rodadaAtual = 2;
        for (let i = 0; i < qtdEdicoes; i++) {
            const rodadaDefinicao = rodadaAtual;
            const rodadaInicial = rodadaDefinicao + 1;
            const rodadaFinal = rodadaInicial + numFases - 1;
            if (i + 1 === edicaoId) {
                return {
                    id: edicaoId,
                    rodadaInicial,
                    rodadaFinal,
                    rodadaDefinicao,
                    fases: null,
                    fonte: 'wizard_respostas (reconstruído)',
                    wizard: modConfig.wizard_respostas,
                };
            }
            rodadaAtual = rodadaFinal + 1;
        }
    }

    return null;
}

async function lerCache(db, ligaId, edicao, temporada) {
    // liga_id pode estar como string OU ObjectId no cache — checar ambos
    const candidatos = [
        { liga_id: String(ligaId), edicao, temporada },
    ];
    if (mongoose.Types.ObjectId.isValid(ligaId)) {
        candidatos.push({ liga_id: new mongoose.Types.ObjectId(ligaId), edicao, temporada });
    }
    for (const filtro of candidatos) {
        const doc = await db.collection('matamatacaches').findOne(filtro);
        if (doc) return { doc, filtro };
    }
    return { doc: null, filtro: null };
}

async function getRankingRodada(db, ligaObjectId, rodada, temporada) {
    const registros = await db.collection('rodadas')
        .find({ ligaId: ligaObjectId, rodada, temporada })
        .project({ timeId: 1, pontos: 1, nome_time: 1, nome_cartola: 1 })
        .toArray();
    return registros
        .filter(r => r && r.timeId != null)
        .map(r => ({
            timeId: String(r.timeId),
            pontos: typeof r.pontos === 'number' ? r.pontos : null,
            nome_time: r.nome_time,
            nome_cartola: r.nome_cartola,
        }))
        .sort((a, b) => (b.pontos ?? -Infinity) - (a.pontos ?? -Infinity));
}

function mapaPontos(ranking) {
    const m = {};
    for (const r of ranking) {
        if (typeof r.pontos === 'number') m[r.timeId] = r.pontos;
    }
    return m;
}

function classificarDivergencias(confrontoCache, pontosReaisMapa, rankingRodadaLen) {
    const out = [];
    for (const lado of ['timeA', 'timeB']) {
        const t = confrontoCache?.[lado];
        if (!t) continue;
        const tid = String(t.timeId || t.id || '');
        if (!tid) continue;
        const pCache = typeof t.pontos === 'number' ? t.pontos : null;
        const pReal = pontosReaisMapa[tid];
        const temRegistro = pReal !== undefined;

        let causa;
        if (pCache === null) {
            causa = temRegistro ? 'CACHE_STALE' : (rankingRodadaLen === 0 ? 'RODADA_VAZIA' : 'SEM_REGISTRO');
        } else if (pCache === 0) {
            if (!temRegistro) causa = rankingRodadaLen === 0 ? 'RODADA_VAZIA' : 'SEM_REGISTRO';
            else if (pReal === 0) causa = 'DADO_REAL_ZERO';
            else causa = 'CACHE_STALE';
        } else if (temRegistro && pReal !== pCache) {
            causa = 'CACHE_STALE';
        } else {
            continue; // tudo consistente
        }

        out.push({
            jogo: confrontoCache.jogo,
            lado,
            timeId: tid,
            nome: t.nome || t.nome_time || t.nome_cartola || '?',
            pontosCache: pCache,
            pontosReal: temRegistro ? pReal : null,
            causa,
        });
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv);
    if (!args.edicao || args.edicao < 1) {
        console.error('❌ Informe --edicao=<N>');
        process.exit(1);
    }

    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI não definida no ambiente');
        process.exit(1);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`DIAGNÓSTICO MATA-MATA — ${args.dryRun ? '🔍 DRY-RUN' : '⚡ FORCE (vai alterar o banco)'}`);
    console.log(`${'='.repeat(70)}`);

    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    try {
        const liga = await resolverLiga(db, args);
        const ligaObjectId = liga._id instanceof mongoose.Types.ObjectId ? liga._id : new mongoose.Types.ObjectId(String(liga._id));
        console.log(`\nLiga:     ${liga.nome}  (_id=${ligaObjectId})`);
        console.log(`Edição:   ${args.edicao}`);

        // Descobrir temporada: default do cache, ou argumento explícito
        let temporada = args.temporada;
        if (!temporada) {
            const qualquerCache = await db.collection('matamatacaches')
                .find({ edicao: args.edicao })
                .sort({ temporada: -1 })
                .limit(1)
                .toArray();
            temporada = qualquerCache[0]?.temporada || new Date().getFullYear();
        }
        console.log(`Temporada: ${temporada}`);

        // Calendário
        const edicao = await resolverCalendarioEdicao(db, ligaObjectId, args.edicao, temporada);
        if (!edicao) {
            console.error(`\n❌ CALENDARIO_AUSENTE: ModuleConfig não tem calendario_override nem wizard_respostas válido para edição ${args.edicao}/${temporada}.`);
            console.error(`   Reconfigure o módulo Mata-Mata no admin antes de reexecutar.`);
            await mongoose.disconnect();
            process.exit(2);
        }
        console.log(`Calendário (${edicao.fonte}): definicao=R${edicao.rodadaDefinicao}, inicial=R${edicao.rodadaInicial}, final=R${edicao.rodadaFinal}`);

        // Cache
        const { doc: cache, filtro: filtroCache } = await lerCache(db, ligaObjectId, args.edicao, temporada);
        if (!cache) {
            console.error(`\n❌ Cache matamatacaches não encontrado para liga/edicao/temporada informados.`);
            await mongoose.disconnect();
            process.exit(3);
        }
        console.log(`Cache:    liga_id=${filtroCache.liga_id} (tipo ${typeof filtroCache.liga_id === 'string' ? 'string' : 'ObjectId'}), tamanhoTorneio=${cache.tamanhoTorneio || '?'}, ultima_atualizacao=${cache.ultima_atualizacao}`);

        const tamanhoTorneio = cache.tamanhoTorneio || Number(edicao.wizard?.total_times) || 8;
        const fases = getFasesParaTamanho(tamanhoTorneio);
        console.log(`Fases:    [${fases.join(', ')}] (tamanho ${tamanhoTorneio})`);

        // Resolver rodadasFases
        const rodadasFases = {};
        if (edicao.fases && typeof edicao.fases === 'object') {
            Object.assign(rodadasFases, edicao.fases);
        } else {
            fases.forEach((fase, idx) => { rodadasFases[fase] = edicao.rodadaInicial + idx; });
        }
        console.log(`Mapa fase→rodada:`);
        for (const f of fases) console.log(`   ${f.padEnd(9)} → R${rodadasFases[f]}`);

        // Ranking base (rodada de definição)
        const rankingBaseCompleto = await getRankingRodada(db, ligaObjectId, edicao.rodadaDefinicao, temporada);
        if (rankingBaseCompleto.length < tamanhoTorneio) {
            console.error(`\n❌ Ranking base R${edicao.rodadaDefinicao} tem ${rankingBaseCompleto.length} participantes, insuficiente para torneio de ${tamanhoTorneio}.`);
            await mongoose.disconnect();
            process.exit(4);
        }
        const rankingClassificados = rankingBaseCompleto.slice(0, tamanhoTorneio);

        // Recalcular cada fase
        console.log(`\n${'='.repeat(70)}`);
        console.log(`DIAGNÓSTICO POR FASE`);
        console.log(`${'='.repeat(70)}`);

        const novosDadosTorneio = cache.dados_torneio ? { ...cache.dados_torneio } : {};
        let vencedoresAnteriores = rankingClassificados.map((r, idx) => ({ ...r, rankR2: idx + 1 }));
        let todasDivergencias = [];
        let causaAgregada = new Set();

        for (const fase of fases) {
            const rodadaPontosNum = rodadasFases[fase];
            if (!rodadaPontosNum) continue;

            const rankingRodada = await getRankingRodada(db, ligaObjectId, rodadaPontosNum, temporada);
            const pRodada = mapaPontos(rankingRodada);

            const numJogos = Math.ceil(vencedoresAnteriores.length / 2);
            const confrontosRecalc = fase === fases[0]
                ? montarConfrontosPrimeiraFase(rankingClassificados, pRodada, tamanhoTorneio)
                : montarConfrontosFase(vencedoresAnteriores, pRodada, numJogos);

            const cacheFase = Array.isArray(cache.dados_torneio?.[fase]) ? cache.dados_torneio[fase] : [];
            console.log(`\n── ${fase.toUpperCase()} (R${rodadaPontosNum}) — rodadas registros: ${rankingRodada.length}`);

            if (cacheFase.length === 0 && confrontosRecalc.length === 0) {
                console.log(`   (fase ainda não consolidada)`);
            }

            const divergenciasFase = [];
            for (const cRecalc of confrontosRecalc) {
                const cCache = cacheFase.find(x => Number(x.jogo) === Number(cRecalc.jogo)) || cacheFase[cRecalc.jogo - 1];
                if (!cCache) continue;
                const divs = classificarDivergencias(cCache, pRodada, rankingRodada.length);
                divs.forEach(d => { d.fase = fase; d.rodada = rodadaPontosNum; });
                divergenciasFase.push(...divs);
            }

            if (divergenciasFase.length === 0) {
                console.log(`   ✅ sem divergências`);
            } else {
                for (const d of divergenciasFase) {
                    console.log(`   ${d.causa.padEnd(16)} J${d.jogo} ${d.lado}: ${d.nome} (timeId=${d.timeId})  cache=${d.pontosCache}  real=${d.pontosReal}`);
                    causaAgregada.add(d.causa);
                }
            }
            todasDivergencias.push(...divergenciasFase);
            novosDadosTorneio[fase] = confrontosRecalc;

            const proximosVencedores = [];
            for (const c of confrontosRecalc) {
                const { vencedor } = determinarVencedor(c);
                if (vencedor) {
                    vencedor.jogoAnterior = c.jogo;
                    proximosVencedores.push(vencedor);
                }
            }
            vencedoresAnteriores = proximosVencedores;

            if (fase === 'final' && confrontosRecalc.length > 0) {
                const { vencedor } = determinarVencedor(confrontosRecalc[0]);
                if (vencedor) novosDadosTorneio.campeao = vencedor;
            }
        }

        console.log(`\n${'='.repeat(70)}`);
        console.log(`RESUMO`);
        console.log(`${'='.repeat(70)}`);
        console.log(`Divergências totais: ${todasDivergencias.length}`);
        if (causaAgregada.size > 0) {
            console.log(`Causas detectadas:   ${[...causaAgregada].join(', ')}`);
        }

        const deveAplicar = todasDivergencias.some(d => d.causa === 'CACHE_STALE');
        if (!deveAplicar) {
            console.log(`\nNenhuma divergência classificada como CACHE_STALE.`);
            console.log(`→ Pontos zerados, se existirem, são por DADO_REAL_ZERO / RODADA_VAZIA / SEM_REGISTRO.`);
            console.log(`→ Nenhuma correção automática a aplicar.`);
            await mongoose.disconnect();
            return;
        }

        if (args.dryRun) {
            console.log(`\n🔍 DRY-RUN — cache não foi alterado.`);
            console.log(`   Para aplicar correção:`);
            console.log(`   node scripts/diagnosticar-matamata.js --liga-id=${ligaObjectId} --edicao=${args.edicao} --temporada=${temporada} --force`);
            await mongoose.disconnect();
            return;
        }

        // Aplicar correção
        console.log(`\n⚡ Aplicando correção...`);
        novosDadosTorneio.metadata = {
            ...(cache.dados_torneio?.metadata || {}),
            tamanhoTorneio,
            participantesAtivos: rankingBaseCompleto.length,
            recalculadoEm: new Date().toISOString(),
            fonte: 'scripts/diagnosticar-matamata.js',
            motivo: `Correção de ${todasDivergencias.filter(d => d.causa === 'CACHE_STALE').length} divergência(s) CACHE_STALE`,
        };

        // Atualizar ambos os formatos de liga_id que possam existir
        const updatePayload = {
            $set: {
                dados_torneio: novosDadosTorneio,
                tamanhoTorneio,
                participantesAtivos: rankingBaseCompleto.length,
                ultima_atualizacao: new Date(),
            },
        };

        const rStr = await db.collection('matamatacaches').updateOne(
            { liga_id: String(ligaObjectId), edicao: args.edicao, temporada },
            updatePayload,
        );
        console.log(`   Cache (liga_id string):   matched=${rStr.matchedCount}  modified=${rStr.modifiedCount}`);

        const rObj = await db.collection('matamatacaches').updateOne(
            { liga_id: ligaObjectId, edicao: args.edicao, temporada },
            updatePayload,
        );
        console.log(`   Cache (liga_id ObjectId): matched=${rObj.matchedCount}  modified=${rObj.modifiedCount}`);

        console.log(`\n✅ Correção aplicada.`);
        console.log(`   ⚠️  Se quartas afetava premiação, revisar extratofinanceirocaches separadamente`);
        console.log(`       (ver scripts/fix-matamata-cache-2026.js e scripts/reset-mata-mata-cache.js).`);
    } catch (err) {
        console.error(`\n❌ ERRO: ${err.message}`);
        console.error(err.stack);
        await mongoose.disconnect();
        process.exit(10);
    }

    await mongoose.disconnect();
}

main();
