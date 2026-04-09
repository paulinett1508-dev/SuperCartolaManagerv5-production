---
name: performance-audit
description: Especialista em Performance Audit - MongoDB Queries, Indexes, N+1, Cache NodeCache, Async Parallelism, Frontend Lazy Loading, Payload Size, Benchmarks e Diagnostico de Degradacao. Adaptado para Node.js/Express/MongoDB do Super Cartola Manager. Keywords: performance, lento, lentidao, slow, otimizar, otimizacao, cache, index, indice, query lenta, N+1, lean, explain, profiling, benchmark, timeout, payload, paginacao, debounce, throttle
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# Performance Audit Skill (Super Cartola Manager)

## Missao

Identificar e eliminar gargalos de performance no Super Cartola Manager. Toda consulta, renderizacao e interacao deve ser rapida — latencia mata a experiencia do usuario de fantasy.

---

## 1. Benchmarks de Referencia

### 1.1 Metas de Performance

| Metrica | Meta | Critico (acao imediata) |
|---------|------|-------------------------|
| Query MongoDB simples | < 50ms | > 200ms |
| Query MongoDB com aggregation | < 100ms | > 500ms |
| Leitura de cache (NodeCache) | < 5ms | > 50ms |
| Endpoint API (p95) | < 500ms | > 2s |
| Carregamento de pagina (FCP) | < 1s | > 3s |
| Tempo ate interacao (TTI) | < 2s | > 5s |
| Payload de resposta API | < 100KB | > 500KB |
| Startup do servidor | < 5s | > 15s |

### 1.2 Como Medir

```javascript
// Backend — medir tempo de endpoint
const start = Date.now();
// ... operacao
const duration = Date.now() - start;
if (duration > 500) {
    console.warn(`[PERF] Endpoint lento: ${req.method} ${req.path} — ${duration}ms`);
}

// MongoDB — usar explain()
const explanation = await db.collection('rankings')
    .find({ liga_id, temporada })
    .explain('executionStats');

console.log({
    nReturned: explanation.executionStats.nReturned,
    totalDocsExamined: explanation.executionStats.totalDocsExamined,
    executionTimeMs: explanation.executionStats.executionTimeMillis
});
// Se totalDocsExamined >> nReturned → falta indice
```

---

## 2. MongoDB — Queries Otimizadas

### 2.1 .lean() — OBRIGATORIO em Leituras (REGRA CLAUDE.md)

```javascript
// CORRETO — retorna POJO (~3x mais rapido, menos memoria)
const ranking = await db.collection('rankings')
    .find({ liga_id, temporada })
    .lean()
    .toArray();

// ERRADO — retorna documentos Mongoose com metodos (overhead desnecessario)
const ranking = await Ranking.find({ liga_id, temporada });
// So usar sem .lean() quando precisar de .save(), .validate(), etc.
```

### 2.2 Projection — Buscar Apenas Campos Necessarios

```javascript
// CORRETO — busca apenas o necessario
const participantes = await db.collection('times')
    .find(
        { liga_id, temporada },
        { projection: { nome_time: 1, nome_cartoleiro: 1, pontos_total: 1 } }
    )
    .lean()
    .toArray();

// ERRADO — busca TODOS os campos (incluindo arrays pesados)
const participantes = await db.collection('times')
    .find({ liga_id, temporada })
    .lean()
    .toArray();
// Se o documento tem campo "historico_rodadas" com 38 entradas, esta carregando tudo a toa
```

### 2.3 Indexes — Garantir que Existem

```javascript
// Indexes obrigatorios para as queries mais frequentes:

// Rankings por liga e temporada
db.collection('rankings').createIndex({ liga_id: 1, temporada: 1, pontos_total: -1 });

// Times por liga
db.collection('times').createIndex({ liga_id: 1, temporada: 1 });

// Extrato financeiro
db.collection('ajustesfinanceiros').createIndex({ liga_id: 1, time_id: 1, temporada: 1 });

// Idempotencia (unico)
db.collection('ajustesfinanceiros').createIndex(
    { idempotency_key: 1 },
    { unique: true, sparse: true }
);
```

### 2.4 Como Diagnosticar Query Lenta

```javascript
// 1. Ativar profiling temporario (queries > 100ms)
await db.command({ profile: 1, slowms: 100 });

// 2. Executar operacoes normais do app

// 3. Verificar queries lentas
const slow = await db.collection('system.profile')
    .find({ millis: { $gt: 100 } })
    .sort({ millis: -1 })
    .limit(10)
    .toArray();

slow.forEach(q => {
    console.log(`${q.millis}ms | ${q.ns} | ${JSON.stringify(q.command?.filter || q.command)}`);
});

// 4. SEMPRE desativar profiling apos analise
await db.command({ profile: 0 });
```

### 2.5 Verificacao Automatica (Grep)

```bash
# Queries sem .lean() (risco performance)
grep -rn "\.find(\|\.findOne(" --include="*.js" controllers/ services/ | grep -v "\.lean()\|\.save\|\.updateOne\|\.deleteOne\|\.create" | head -20

# Queries sem projecao (retornam todos os campos)
grep -rn "\.find({" --include="*.js" controllers/ services/ | grep -v "\.select(\|, {" | head -20

# Queries sem liga_id (risco multi-tenant + full scan)
grep -rn "\.find(\|\.findOne(\|\.aggregate(" --include="*.js" controllers/ services/ | grep -v "liga_id\|ligaId\|_id:" | head -20
```

---

## 3. Problema N+1

### 3.1 Identificacao

```javascript
// ERRADO — N+1: uma query por participante (30 participantes = 30 queries)
const participantes = await db.collection('times')
    .find({ liga_id })
    .lean()
    .toArray();

for (const p of participantes) {
    // Query individual para cada participante!
    p.saldo = await db.collection('ajustesfinanceiros')
        .find({ liga_id, time_id: p.id })
        .lean()
        .toArray();
}
```

### 3.2 Solucao: Batch com $in + Map

```javascript
// CORRETO — 2 queries total (independente do numero de participantes)
const participantes = await db.collection('times')
    .find({ liga_id })
    .lean()
    .toArray();

const timeIds = participantes.map(p => p.id);

// Uma unica query para todos os ajustes
const todosAjustes = await db.collection('ajustesfinanceiros')
    .find({ liga_id, time_id: { $in: timeIds } })
    .lean()
    .toArray();

// Agrupar em Map para lookup O(1)
const ajustesPorTime = new Map();
for (const ajuste of todosAjustes) {
    if (!ajustesPorTime.has(ajuste.time_id)) {
        ajustesPorTime.set(ajuste.time_id, []);
    }
    ajustesPorTime.get(ajuste.time_id).push(ajuste);
}

// Associar sem queries adicionais
for (const p of participantes) {
    p.ajustes = ajustesPorTime.get(p.id) || [];
}
```

### 3.3 Alternativa: Aggregation com $lookup

```javascript
// Para joins complexos, usar $lookup
const resultado = await db.collection('times').aggregate([
    { $match: { liga_id } },
    {
        $lookup: {
            from: 'ajustesfinanceiros',
            let: { timeId: '$id' },
            pipeline: [
                { $match: { $expr: { $eq: ['$time_id', '$$timeId'] }, liga_id } },
                { $sort: { criadoEm: -1 } },
                { $limit: 10 }
            ],
            as: 'ajustes'
        }
    }
]).toArray();
```

### 3.4 Deteccao via Grep

```bash
# Buscar queries dentro de loops
grep -B3 "\.find\|\.findOne" --include="*.js" controllers/ services/ | grep -A1 "forEach\|for.*of\|\.map(\|while"
```

---

## 4. Cache — NodeCache

### 4.1 TTLs Padrao do Projeto (CLAUDE.md)

| Tipo de Dado | TTL | Justificativa |
|--------------|-----|---------------|
| Rodadas (dados de jogo) | 5 min | Atualiza durante parciais |
| Rankings | 10 min | Recalculado periodicamente |
| Configs (LigaRules, ModuleConfig) | 30 min | Raramente muda |
| Dados estaticos (times, nomes) | 60 min | Muda entre temporadas |
| Mercado Cartola (API externa) | 5 min | Status aberto/fechado |
| Atletas Cartola (API externa) | 15 min | Dados de escalacao |
| Mercado status (para UX) | 1 min | Critico para timer |

### 4.2 Pattern de Cache

```javascript
import NodeCache from 'node-cache';

const cache = new NodeCache({
    stdTTL: 300,         // 5 min padrao
    checkperiod: 60,     // Verificar expirados a cada 60s
    useClones: false      // Performance: nao clonar objetos
});

async function getRankingComCache(liga_id, temporada) {
    const cacheKey = `ranking_${liga_id}_${temporada}`;

    // 1. Tentar cache
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // 2. Buscar no DB
    const ranking = await db.collection('rankings')
        .find({ liga_id, temporada })
        .sort({ pontos_total: -1 })
        .lean()
        .toArray();

    // 3. Armazenar com TTL especifico
    cache.set(cacheKey, ranking, 600);  // 10 min para rankings

    return ranking;
}
```

### 4.3 Invalidacao de Cache (Referencia: utils/cache-invalidator.js)

```javascript
// Invalidar APOS operacoes que alteram dados

// Cache especifico
cache.del(`ranking_${liga_id}_${temporada}`);

// Por padrao (tudo de uma liga)
const keys = cache.keys().filter(k => k.includes(liga_id));
cache.del(keys);

// Tudo (ex: apos processar rodada completa)
cache.flushAll();
```

### 4.4 Checklist de Cache

```markdown
[ ] Dados frequentes estao em cache (rankings, rodadas, configs)?
[ ] TTL configurado EXPLICITAMENTE em todo cache (nunca infinito)?
[ ] Cache invalidado apos operacoes de escrita (cache-invalidator.js)?
[ ] Chave de cache inclui liga_id (multi-tenant)?
[ ] Hit rate monitorado (meta: >80%)?
[ ] Namespace de chaves evita colisoes (prefixo por dominio)?
[ ] Endpoint de recalculo disponivel para correcao manual?
```

### 4.5 Verificacao via Grep

```bash
# TTLs configurados
grep -rn "ttl\|TTL\|maxAge\|stdTTL" --include="*.js" utils/ services/ config/ | grep -v node_modules

# Chaves de cache sem liga_id (risco multi-tenant)
grep -rn "cache\.set\|cache\.get\|cacheKey" --include="*.js" . | grep -v "liga\|ligaId" | grep -v node_modules

# Invalidacao existente
grep -rn "invalidat\|clearCache\|flushCache\|cache\.del" --include="*.js" utils/ services/
```

---

## 5. Paralelismo Async

### 5.1 Promise.all para Operacoes Independentes

```javascript
// LENTO: 3 queries sequenciais (~300ms total se cada leva ~100ms)
const ranking = await getRanking(ligaId);
const extrato = await getExtrato(ligaId, timeId);
const rodadas = await getRodadas(ligaId);

// RAPIDO: 3 queries paralelas (~100ms total)
const [ranking, extrato, rodadas] = await Promise.all([
    getRanking(ligaId),
    getExtrato(ligaId, timeId),
    getRodadas(ligaId)
]);
```

### 5.2 Quando NAO Paralelizar

```javascript
// Se uma operacao depende do resultado da outra — manter sequencial
const liga = await getLiga(liga_id);  // Precisa existir
const regras = await getLigaRules(liga._id, liga.temporada);  // Depende de liga
```

### 5.3 Promise.allSettled para Operacoes Tolerantes a Falha

```javascript
// Se uma falha nao deve impedir as outras
const resultados = await Promise.allSettled([
    carregarRanking(liga_id),
    carregarJogos(liga_id),
    carregarNoticias()  // Se falhar, OK — nao critico
]);

const ranking = resultados[0].status === 'fulfilled' ? resultados[0].value : [];
const jogos = resultados[1].status === 'fulfilled' ? resultados[1].value : [];
const noticias = resultados[2].status === 'fulfilled' ? resultados[2].value : [];
```

### 5.4 Verificacao via Grep

```bash
# Multiplos awaits sequenciais que poderiam ser paralelos
grep -A1 "const.*= await" --include="*.js" controllers/ services/ | grep -B1 "const.*= await" | head -20
```

---

## 6. Frontend Performance

### 6.1 Lazy Loading

```javascript
// Modulos do participante — carregar sob demanda
async function loadModule(page) {
    // So carrega JS do modulo quando navega para a pagina
    const module = await import(`./modules/${page}/${page}.js`);
    await module.init();
}
```

```html
<!-- Imagens — lazy loading nativo -->
<img src="/escudos/262.png" loading="lazy" alt="Escudo"
     onerror="this.src='/escudos/default.png'">
```

### 6.2 Debounce em Busca

```javascript
// Prevenir requests a cada tecla digitada
let debounceTimer;

function buscarParticipante(termo) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        if (termo.length < 2) return;  // Minimo 2 caracteres
        const resultado = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`);
        renderResultados(await resultado.json());
    }, 300);  // Esperar 300ms apos ultima tecla
}
```

### 6.3 Throttle em Scroll

```javascript
// Limitar eventos de scroll (ex: infinite scroll)
let lastScroll = 0;
const THROTTLE_MS = 200;

window.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScroll < THROTTLE_MS) return;
    lastScroll = now;

    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        carregarMaisDados();
    }
});
```

### 6.4 Virtualizacao de Listas Longas

```javascript
// Para listas com > 100 itens, renderizar apenas os visiveis
// Exemplo: ranking com 500 participantes

function renderVirtualList(container, items, itemHeight = 48) {
    const visibleCount = Math.ceil(container.clientHeight / itemHeight) + 5;
    const scrollTop = container.scrollTop;
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(startIndex + visibleCount, items.length);

    // Spacer para manter scroll correto
    container.style.paddingTop = `${startIndex * itemHeight}px`;
    container.style.paddingBottom = `${(items.length - endIndex) * itemHeight}px`;

    // Renderizar apenas itens visiveis
    const visibleItems = items.slice(startIndex, endIndex);
    container.innerHTML = visibleItems.map(renderItem).join('');
}
```

### 6.5 Verificacao via Grep

```bash
# Imagens sem lazy loading
grep -rn "<img" --include="*.html" --include="*.js" public/ | grep -v "loading=" | head -10

# Escudos sem fallback
grep -rn "escudo\|<img" --include="*.js" public/ | grep -v "onerror\|fallback" | head -10

# Fetch sem debounce em handlers de input
grep -rn "addEventListener.*input\|oninput" --include="*.js" public/ | head -10
```

---

## 7. Payload e Paginacao

### 7.1 Referencia: middleware/pagination.js

```javascript
// Aplicar em toda rota que retorna listas
router.get('/api/admin/participantes', paginationMiddleware, async (req, res) => {
    const { page, limit, skip } = req.pagination;

    const [dados, total] = await Promise.all([
        db.collection('times')
            .find({ liga_id })
            .skip(skip)
            .limit(limit)
            .lean()
            .toArray(),
        db.collection('times').countDocuments({ liga_id })
    ]);

    return apiSuccess(res, {
        dados,
        paginacao: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    });
});
```

### 7.2 Compressao

```javascript
// Habilitar gzip/brotli para respostas grandes
import compression from 'compression';

app.use(compression({
    threshold: 1024,  // Comprimir respostas > 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
```

### 7.3 Limites de Payload

```javascript
// Limitar tamanho de request body
app.use(express.json({ limit: '10mb' }));

// Limitar resultados de query (nunca retornar tudo)
const MAX_RESULTS = 1000;
const limit = Math.min(parseInt(req.query.limit) || 50, MAX_RESULTS);
```

---

## 8. Timeouts e Limites

### 8.1 Timeout de Conexao MongoDB

```javascript
// config/database.js
const mongoOptions = {
    serverSelectionTimeoutMS: 5000,   // Timeout para selecionar server
    socketTimeoutMS: 45000,           // Timeout de operacao
    maxPoolSize: 50,                  // Conexoes simultaneas
    minPoolSize: 5,                   // Conexoes minimas mantidas
    maxIdleTimeMS: 60000              // Fechar conexao ociosa apos 60s
};
```

### 8.2 Timeout de Request

```javascript
// Timeout global para requests HTTP
app.use((req, res, next) => {
    req.setTimeout(30000, () => {  // 30 segundos
        res.status(408).json({
            success: false,
            error: 'Request timeout'
        });
    });
    next();
});
```

---

## 9. Sinais de Degradacao

### 9.1 Tabela de Alertas

| Sinal | Indicador | Acao |
|-------|-----------|------|
| Endpoint > 2s | Logs `[PERF]` frequentes | Verificar explain() das queries envolvidas |
| Memory heap > 500MB | `process.memoryUsage().heapUsed` | Buscar memory leaks (cache sem TTL, arrays crescentes) |
| CPU > 80% | `os.loadavg()` | Verificar loops pesados, calculos sincronos no event loop |
| Cache hit rate < 50% | `cache.getStats()` | TTLs muito baixos ou chaves inconsistentes |
| totalDocsExamined >> nReturned | explain() de query | Falta indice — criar imediatamente |
| Connection pool esgotado | Erros de timeout MongoDB | Aumentar maxPoolSize ou otimizar queries lentas |
| Payload > 500KB | Tamanho de resposta | Aplicar paginacao, projection, compressao |
| N+1 detectado em loop | Query dentro de forEach/for..of | Refatorar para batch com $in + Map |
| Await sequencial desnecessario | Multiplos await independentes | Refatorar para Promise.all |

### 9.2 Monitoring Basico

```javascript
// Endpoint de health check com metricas de performance
app.get('/api/health', async (req, res) => {
    const start = Date.now();

    try {
        // Verificar MongoDB
        await db.command({ ping: 1 });
        const dbLatency = Date.now() - start;

        // Verificar memoria
        const mem = process.memoryUsage();

        return apiSuccess(res, {
            status: 'healthy',
            uptime: process.uptime(),
            db: {
                latency: dbLatency,
                status: dbLatency < 100 ? 'ok' : 'slow'
            },
            memory: {
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
                rss: Math.round(mem.rss / 1024 / 1024) + 'MB'
            },
            cache: {
                keys: cache.keys().length,
                stats: cache.getStats()
            }
        });
    } catch (error) {
        return apiServerError(res, 'Health check failed');
    }
});
```

### 9.3 Middleware de Tempo de Resposta

```javascript
// Registrar endpoints lentos automaticamente
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.warn(`[PERF] Slow: ${req.method} ${req.path} - ${duration}ms`);
        }
    });
    next();
});
```

---

## 10. Ferramentas de Diagnostico

### 10.1 MongoDB

```bash
# Explain de query especifica
mongo --eval "db.rankings.find({ liga_id: ObjectId('...'), temporada: '2026' }).explain('executionStats')"

# Indices de uma collection
mongo --eval "db.rankings.getIndexes()"

# Stats de collection (tamanho, documentos, indices)
mongo --eval "db.rankings.stats()"

# Top queries por tempo (com profiling ativo)
mongo --eval "db.system.profile.find({ millis: { \$gt: 100 } }).sort({ millis: -1 }).limit(5).pretty()"
```

### 10.2 Node.js

```bash
# Profiling de CPU
node --prof server.js
# Gerar relatorio legivel
node --prof-process isolate-*.log > profile.txt

# Memory snapshot (via inspector)
node --inspect server.js
# Abrir chrome://inspect no Chrome

# Event loop lag
# Adicionar no server.js para monitorar:
# setInterval(() => {
#   const start = Date.now();
#   setImmediate(() => {
#     const lag = Date.now() - start;
#     if (lag > 100) console.warn(`[PERF] Event loop lag: ${lag}ms`);
#   });
# }, 5000);
```

---

## 11. Checklist Completo de Auditoria

```markdown
## Queries MongoDB
[ ] Todas as queries frequentes tem indice?
[ ] .lean() usado em todas as leituras?
[ ] Projection aplicada (nao buscando campos desnecessarios)?
[ ] Nenhum N+1 (query dentro de loop)?
[ ] explain() mostra totalDocsExamined proximo de nReturned?
[ ] liga_id presente em TODA query (multi-tenant)?

## Cache
[ ] NodeCache configurado com TTLs corretos (Rodadas 5min, Rankings 10min, Configs 30min)?
[ ] Cache invalidado apos operacoes de escrita (cache-invalidator.js)?
[ ] Hit rate > 50%?
[ ] Sem cache sem TTL (memory leak)?
[ ] Chaves incluem liga_id?

## Async
[ ] Operacoes independentes usando Promise.all?
[ ] Sem await sequencial desnecessario?
[ ] Sem operacoes sincronas pesadas no event loop?

## Frontend
[ ] Lazy loading em modulos nao-criticos?
[ ] Debounce em buscas (300ms)?
[ ] Throttle em scroll (200ms)?
[ ] Listas longas virtualizadas (>100 items)?
[ ] Imagens com loading="lazy"?
[ ] Escudos com onerror fallback?

## Payload
[ ] Paginacao em todas as listagens (middleware/pagination.js)?
[ ] Compressao (gzip/brotli) ativa?
[ ] Respostas < 100KB (media)?
[ ] Body limit configurado (10mb)?

## Infraestrutura
[ ] Connection pool adequado (maxPoolSize)?
[ ] Timeouts configurados (request + MongoDB)?
[ ] Health check funcional com metricas?
[ ] Logs de performance ativos ([PERF] para endpoints > 1s)?
```

---

**STATUS:** Performance Audit Skill — ATIVO

**Versao:** 2.0 (Reescrita completa — adaptado para SuperCartola)

**Ultima atualizacao:** 2026-03-12
