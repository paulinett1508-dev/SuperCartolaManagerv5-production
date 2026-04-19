# Big Cartola IA — Contexto Dinâmico de Todos os Módulos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir `buscarContextoDinamico()` no `ragChatbotService.js` para injetar o estado atual de cada módulo ativo na liga, permitindo que o Big Cartola IA responda perguntas como "quem lidera o ranking?", "em qual fase está o mata-mata?", "quantos restam no Resta Um?".

**Architecture:** Uma função helper `buscarContexto_<modulo>()` por módulo, todas chamadas em paralelo (`Promise.allSettled`) dentro de `buscarContextoDinamico()`. Cada helper retorna uma string formatada ou string vazia em caso de erro/sem dados. Zero impacto em módulos inativos — apenas módulos com `modulos_ativos[modulo] === true` são consultados.

**Tech Stack:** Node.js ES Modules, MongoDB Native Driver (já em uso), sem novas dependências.

---

## Mapeamento de Arquivos

**Modificar apenas:**
- `services/ragChatbotService.js` — adicionar helpers + expandir `buscarContextoDinamico()`

**Collections consultadas (read-only):**

| Módulo | Collection | Campo liga |
|--------|-----------|------------|
| ranking_geral | `rankinggeralcaches` | `ligaId` (ObjectId) |
| ranking_rodada | `rodadas` | `ligaId` (ObjectId) |
| pontos_corridos | `pontoscorridoscaches` | `liga_id` (String) |
| mata_mata | já implementado | `liga_id` (String) |
| top_10 | `top10caches` | `liga_id` (String) |
| melhor_mes | `melhor_mes_cache` | `ligaId` (ObjectId) |
| turno_returno | `rankingturnos` | `ligaId` (ObjectId) |
| artilheiro | `artilheirocampeao` | `ligaId` (String) |
| capitao_luxo | `capitaocaches` | `ligaId` (ObjectId) |
| luva_ouro | `goleiros` (agregação) | `ligaId` (String) |
| tiro_certo | `tirocertocaches` | `liga_id` (String) |
| resta_um | `restaumcaches` | `liga_id` (String) |

**Módulos sem contexto dinâmico:**
- `extrato` — estado por participante (volumoso demais para contexto geral)
- `raio_x` — analytics sem persistência própria

---

### Task 1: Helpers — Ranking Geral e Ranking Rodada

**Files:**
- Modify: `services/ragChatbotService.js` (após `buscarContextoMataMata`, antes de `buscarContextoDinamico`)

- [ ] **Adicionar `buscarContextoRankingGeral()`**

```javascript
async function buscarContextoRankingGeral(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const cache = await db.collection('rankinggeralcaches').findOne(
            { ligaId: new ObjectId(ligaId), temporada },
            { projection: { ranking: { $slice: 3 }, rodadaFinal: 1 } }
        );
        if (!cache || !Array.isArray(cache.ranking) || cache.ranking.length === 0) return '';

        const linhas = [`RANKING GERAL (ate R${cache.rodadaFinal || '?'}):`];
        cache.ranking.slice(0, 3).forEach((t, i) => {
            linhas.push(`- ${i + 1}o ${t.nome_cartola || t.nome_time}: ${t.pontos_totais} pts`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Adicionar `buscarContextoRankingRodada()`**

```javascript
async function buscarContextoRankingRodada(ligaId, rodadaAtual, temporada, db) {
    try {
        if (!rodadaAtual) return '';
        const { ObjectId } = await import('mongodb');
        const docs = await db.collection('rodadas').find(
            { ligaId: new ObjectId(ligaId), rodada: rodadaAtual, temporada },
            { projection: { timeId: 1, nome_cartola: 1, pontos: 1, posicao: 1 } }
        ).sort({ posicao: 1 }).limit(3).toArray();

        if (!docs.length) return '';
        const linhas = [`RANKING RODADA ${rodadaAtual} (top 3):`];
        docs.forEach(t => {
            linhas.push(`- ${t.posicao}o ${t.nome_cartola}: ${t.pontos} pts`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add ranking_geral and ranking_rodada dynamic context helpers"
```

---

### Task 2: Helper — Pontos Corridos

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoPontosCorridos()`**

```javascript
async function buscarContextoPontosCorridos(ligaId, temporada, db) {
    try {
        const cache = await db.collection('pontoscorridoscaches').findOne(
            { liga_id: ligaId, temporada },
            { projection: { classificacao: { $slice: 3 }, rodada_consolidada: 1 } }
        );
        if (!cache || !Array.isArray(cache.classificacao) || cache.classificacao.length === 0) return '';

        const linhas = [`PONTOS CORRIDOS (ate R${cache.rodada_consolidada || '?'}):`];
        cache.classificacao.slice(0, 3).forEach(t => {
            linhas.push(`- ${t.posicao}o ${t.nome_cartola || t.nome}: ${t.pontos} pts (${t.vitorias}V ${t.empates}E ${t.derrotas}D)`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add pontos_corridos dynamic context helper"
```

---

### Task 3: Helper — Top 10

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoTop10()`**

```javascript
async function buscarContextoTop10(ligaId, temporada, db) {
    try {
        const cache = await db.collection('top10caches').findOne(
            { liga_id: ligaId, temporada },
            { projection: { mitos: 1, micos: 1, rodada_consolidada: 1 } }
        );
        if (!cache) return '';

        const linhas = [`TOP 10 (R${cache.rodada_consolidada || '?'}):`];

        if (Array.isArray(cache.mitos) && cache.mitos.length > 0) {
            const top = cache.mitos[0];
            linhas.push(`- Mito #1: ${top.nome_cartola || top.nome_time} — ${top.pontos} pts (R${top.rodada})`);
        }
        if (Array.isArray(cache.micos) && cache.micos.length > 0) {
            const last = cache.micos[cache.micos.length - 1];
            linhas.push(`- Mico #10: ${last.nome_cartola || last.nome_time} — ${last.pontos} pts (R${last.rodada})`);
        }

        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add top_10 dynamic context helper"
```

---

### Task 4: Helper — Melhor Mês

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoMelhorMes()`**

```javascript
async function buscarContextoMelhorMes(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const cache = await db.collection('melhor_mes_cache').findOne(
            { ligaId: new ObjectId(ligaId), temporada },
            { projection: { edicoes: 1 } }
        );
        if (!cache || !Array.isArray(cache.edicoes) || cache.edicoes.length === 0) return '';

        const linhas = ['MELHOR MES:'];
        for (const ed of cache.edicoes) {
            if (ed.status === 'em_andamento') {
                const lider = Array.isArray(ed.ranking) && ed.ranking[0];
                linhas.push(`- ${ed.nome || `Edicao ${ed.id}`}: EM ANDAMENTO (R${ed.inicio}-R${ed.fim})${lider ? ` — Lider: ${lider.nome_cartola || lider.nome_time} (${lider.pontos_total} pts)` : ''}`);
            } else if (ed.status === 'consolidado' && ed.campeao) {
                linhas.push(`- ${ed.nome || `Edicao ${ed.id}`}: Encerrada — Campeao: ${ed.campeao.nome_cartola || ed.campeao.nome_time}`);
            }
        }

        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add melhor_mes dynamic context helper"
```

---

### Task 5: Helper — Turno/Returno

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoTurnoReturno()`**

```javascript
async function buscarContextoTurnoReturno(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const turnos = await db.collection('rankingturnos').find(
            { ligaId: new ObjectId(ligaId), temporada, turno: { $in: ['1', '2'] } },
            { projection: { turno: 1, status: 1, rodada_inicio: 1, rodada_fim: 1, ranking: { $slice: 1 } } }
        ).toArray();

        if (!turnos.length) return '';

        const linhas = ['TURNO/RETURNO:'];
        for (const t of turnos.sort((a, b) => a.turno.localeCompare(b.turno))) {
            const label = t.turno === '1' ? '1o Turno' : '2o Turno';
            const range = `R${t.rodada_inicio}-R${t.rodada_fim}`;
            const lider = Array.isArray(t.ranking) && t.ranking[0];
            if (t.status === 'em_andamento') {
                linhas.push(`- ${label} (${range}): EM ANDAMENTO${lider ? ` — Lider: ${lider.nome_cartola || lider.nome_time} (${lider.pontos} pts)` : ''}`);
            } else if (t.status === 'consolidado') {
                linhas.push(`- ${label} (${range}): Encerrado${lider ? ` — Campeao: ${lider.nome_cartola || lider.nome_time}` : ''}`);
            }
        }

        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add turno_returno dynamic context helper"
```

---

### Task 6: Helpers — Artilheiro, Capitão de Luxo, Luva de Ouro

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoArtilheiro()`**

```javascript
async function buscarContextoArtilheiro(ligaId, temporada, db) {
    try {
        const cache = await db.collection('artilheirocampeao').findOne(
            { ligaId: ligaId, temporada },
            { projection: { dados: { $slice: 3 }, rodadaAtual: 1 } }
        );
        if (!cache || !Array.isArray(cache.dados) || cache.dados.length === 0) return '';

        const linhas = [`ARTILHEIRO (ate R${cache.rodadaAtual || '?'}) — gols dos atletas escalados:`];
        cache.dados.slice(0, 3).forEach((t, i) => {
            linhas.push(`- ${i + 1}o ${t.nomeCartoleiro || t.nomeTime}: ${t.golsPro} gols pro, saldo ${t.saldoGols}`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Adicionar `buscarContextoCapitaoLuxo()`**

```javascript
async function buscarContextoCapitaoLuxo(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const docs = await db.collection('capitaocaches').find(
            { ligaId: new ObjectId(ligaId), temporada },
            { projection: { nome_cartola: 1, nome_time: 1, pontuacao_total: 1, media_capitao: 1 } }
        ).sort({ pontuacao_total: -1 }).limit(3).toArray();

        if (!docs.length) return '';

        const linhas = ['CAPITAO DE LUXO (top 3):'];
        docs.forEach((t, i) => {
            linhas.push(`- ${i + 1}o ${t.nome_cartola || t.nome_time}: ${t.pontuacao_total} pts (media ${(t.media_capitao || 0).toFixed(1)})`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Adicionar `buscarContextoLuvaOuro()`**

```javascript
async function buscarContextoLuvaOuro(ligaId, temporada, db) {
    try {
        const pipeline = [
            { $match: { ligaId: ligaId, temporada, rodadaConcluida: true } },
            { $group: {
                _id: '$participanteId',
                participanteNome: { $first: '$participanteNome' },
                pontosTotais: { $sum: '$pontos' },
                rodadasJogadas: { $sum: 1 },
            }},
            { $sort: { pontosTotais: -1 } },
            { $limit: 3 },
        ];
        const docs = await db.collection('goleiros').aggregate(pipeline).toArray();
        if (!docs.length) return '';

        const linhas = ['LUVA DE OURO (top 3 em pontos de goleiros):'];
        docs.forEach((t, i) => {
            const media = t.rodadasJogadas > 0 ? (t.pontosTotais / t.rodadasJogadas).toFixed(1) : '0.0';
            linhas.push(`- ${i + 1}o ${t.participanteNome}: ${t.pontosTotais} pts (${t.rodadasJogadas} rodadas, media ${media})`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add artilheiro, capitao_luxo, luva_ouro dynamic context helpers"
```

---

### Task 7: Helper — Tiro Certo

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoTiroCerto()`**

```javascript
async function buscarContextoTiroCerto(ligaId, temporada, db) {
    try {
        const edicoes = await db.collection('tirocertocaches').find(
            { liga_id: ligaId, temporada },
            { projection: { edicao: 1, nome: 1, status: 1, rodadaAtual: 1, rodadaFinal: 1, vivosCount: 1, eliminadosCount: 1 } }
        ).sort({ edicao: 1 }).toArray();

        if (!edicoes.length) return '';

        const linhas = ['TIRO CERTO:'];
        for (const ed of edicoes) {
            if (ed.status === 'em_andamento') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: EM ANDAMENTO (R${ed.rodadaAtual}) — ${ed.vivosCount ?? '?'} vivos, ${ed.eliminadosCount ?? '?'} eliminados`);
            } else if (ed.status === 'finalizada') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Finalizada`);
            } else if (ed.status === 'pendente') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Aguardando inicio (ate R${ed.rodadaFinal})`);
            }
        }

        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add tiro_certo dynamic context helper"
```

---

### Task 8: Helper — Resta Um

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Adicionar `buscarContextoRestaUm()`**

```javascript
async function buscarContextoRestaUm(ligaId, temporada, db) {
    try {
        const edicoes = await db.collection('restaumcaches').find(
            { liga_id: ligaId, temporada },
            { projection: { edicao: 1, nome: 1, status: 1, rodadaAtual: 1, rodadaInicial: 1, rodadaFinal: 1, participantes: 1 } }
        ).sort({ edicao: 1 }).toArray();

        if (!edicoes.length) return '';

        const linhas = ['RESTA UM:'];
        for (const ed of edicoes) {
            const participantes = Array.isArray(ed.participantes) ? ed.participantes : [];
            const vivos = participantes.filter(p => p.status === 'vivo' || p.status === 'zona_perigo');
            const emZona = participantes.filter(p => p.status === 'zona_perigo');
            const campeao = participantes.find(p => p.status === 'campeao');

            if (ed.status === 'em_andamento') {
                let info = `EM ANDAMENTO (R${ed.rodadaAtual}, de R${ed.rodadaInicial}-R${ed.rodadaFinal})`;
                if (vivos.length > 0) info += ` — ${vivos.length} vivos`;
                if (emZona.length > 0) info += `, ${emZona.length} na zona de perigo`;
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: ${info}`);
            } else if (ed.status === 'finalizada') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Finalizada${campeao ? ` — Campeao: ${campeao.nomeCartoleiro || campeao.nomeTime}` : ''}`);
            } else if (ed.status === 'pendente') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Aguardando inicio (R${ed.rodadaInicial})`);
            }
        }

        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): add resta_um dynamic context helper"
```

---

### Task 9: Integração Final em `buscarContextoDinamico()`

**Files:**
- Modify: `services/ragChatbotService.js`

- [ ] **Localizar o bloco atual no final de `buscarContextoDinamico()`:**

```javascript
        // Contexto especifico de modulos ativos
        if (liga.modulos_ativos?.mata_mata) {
            const ctxMM = await buscarContextoMataMata(ligaId, rodadaAtualNum, temporada, db);
            if (ctxMM) linhas.push('', ctxMM);
        }

        return linhas.join('\n');
```

- [ ] **Substituir por:**

```javascript
        // Contexto especifico de modulos ativos — chamadas em paralelo
        const ma = liga.modulos_ativos || {};
        const moduloHelpers = [
            ma.ranking_geral   && buscarContextoRankingGeral(ligaId, temporada, db),
            ma.ranking_rodada  && buscarContextoRankingRodada(ligaId, rodadaAtualNum, temporada, db),
            ma.pontos_corridos && buscarContextoPontosCorridos(ligaId, temporada, db),
            ma.mata_mata       && buscarContextoMataMata(ligaId, rodadaAtualNum, temporada, db),
            ma.top_10          && buscarContextoTop10(ligaId, temporada, db),
            ma.melhor_mes      && buscarContextoMelhorMes(ligaId, temporada, db),
            ma.turno_returno   && buscarContextoTurnoReturno(ligaId, temporada, db),
            ma.artilheiro      && buscarContextoArtilheiro(ligaId, temporada, db),
            ma.capitao_luxo    && buscarContextoCapitaoLuxo(ligaId, temporada, db),
            ma.luva_ouro       && buscarContextoLuvaOuro(ligaId, temporada, db),
            ma.tiro_certo      && buscarContextoTiroCerto(ligaId, temporada, db),
            ma.resta_um        && buscarContextoRestaUm(ligaId, temporada, db),
        ].filter(Boolean);

        if (moduloHelpers.length > 0) {
            const resultados = await Promise.allSettled(moduloHelpers);
            for (const r of resultados) {
                if (r.status === 'fulfilled' && r.value) linhas.push('', r.value);
            }
        }

        return linhas.join('\n');
```

- [ ] **Commit**

```bash
git add services/ragChatbotService.js
git commit -m "feat(chatbot): orchestrate all module context helpers in parallel — Big Cartola IA sees all"
```

---

## Notas de Implementação

**Convenção de `liga_id` vs `ligaId`:**
- `liga_id` (String): `pontoscorridoscaches`, `matamatacaches`, `top10caches`, `tirocertocaches`, `restaumcaches`, `artilheirocampeao`, `goleiros`
- `ligaId` (ObjectId): `rankinggeralcaches`, `rodadas`, `melhor_mes_cache`, `rankingturnos`, `capitaocaches`

**Tamanho do contexto:** Cada helper injeta no máximo 4-6 linhas. Com 12 módulos ativos, o contexto dinâmico total será ~60-80 linhas — aceitável para o LLM.

**Tolerância a falhas:** `Promise.allSettled` garante que falha em um módulo não derruba os outros. Cada helper tem `try/catch` com `return ''` como fallback.
