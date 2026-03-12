---
name: performance-audit
description: Auditoria de performance para o Super Cartola Manager. Checklist de queries MongoDB, N+1, cache, paralelismo async, frontend lazy loading e benchmarks de referencia. Adaptado do agnostic-core para Node.js/Express/MongoDB. Keywords - performance, lento, otimizar, N+1, indice, benchmark, query lenta, explain, profiling.
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# Performance Audit — Super Cartola Manager

## Contexto do Projeto

- **Backend:** Node.js + Express + MongoDB (Atlas)
- **Cache:** NodeCache (backend) + Service Worker + IndexedDB (frontend)
- **Regras CLAUDE.md:** `.lean()` em reads, cache TTL (Rodadas 5min, Rankings 10min, Configs 30min)
- **Arquivos-chave:** `utils/cache-invalidator.js`, `utils/smartDataFetcher.js`, `middleware/pagination.js`
- **Frontend:** Vanilla JS, ES6 modules, TailwindCSS via CDN

---

## 1. Queries MongoDB

### Checklist

```markdown
□ Campos usados em WHERE/filtro possuem indice (liga_id, temporada, time_id)
□ Indices compostos para queries com multiplos filtros
□ .explain('executionStats') executado para validar uso de indice
□ Projecao usada — buscar apenas campos necessarios (.select() ou segundo arg)
□ .lean() em TODAS as queries de leitura (REGRA CLAUDE.md — ~3x mais rapido)
□ Paginacao em listagens (middleware/pagination.js — limit + skip)
□ Arrays retornados com limite maximo (nunca 10k+ docs de uma vez)
□ Queries com timeout configurado
```

### Verificacao Automatica

```bash
# Queries sem .lean() (risco performance)
grep -rn "\.find(\|\.findOne(" --include="*.js" controllers/ services/ | grep -v "\.lean()\|\.save\|\.updateOne\|\.deleteOne\|\.create" | head -20

# Queries sem projecao (retornam todos os campos)
grep -rn "\.find({" --include="*.js" controllers/ services/ | grep -v "\.select(\|, {" | head -20

# Queries sem liga_id (risco multi-tenant + full scan em collection grande)
grep -rn "\.find(\|\.findOne(\|\.aggregate(" --include="*.js" controllers/ services/ | grep -v "liga_id\|ligaId\|_id:" | head -20
```

### Como Analisar Query Lenta

```javascript
// No shell MongoDB ou via script
const result = await Collection.find({
  liga_id: ligaId,
  temporada: '2026'
}).explain('executionStats');

// Verificar:
// - executionStats.totalKeysExamined (quantas chaves de indice lidas)
// - executionStats.totalDocsExamined (quantos docs lidos)
// - executionStats.executionTimeMillis (tempo total)
// - Se totalDocsExamined >> nRecords retornados → falta indice
```

---

## 2. Problema N+1

### O que e

Fazer 1 query para listar items + N queries dentro de loop para buscar dados relacionados.

### Deteccao

```bash
# Buscar queries dentro de loops
grep -B3 "\.find\|\.findOne" --include="*.js" controllers/ services/ | grep -A1 "forEach\|for.*of\|\.map(\|while"
```

### Exemplos e Correcoes

```javascript
// N+1: 1 query + N queries no loop
const times = await Time.find({ liga_id: ligaId }).lean();
for (const time of times) {
  time.rodadas = await Rodada.find({ time_id: time.id }).lean(); // N queries!
}

// CORRIGIDO: 2 queries + join em memoria
const times = await Time.find({ liga_id: ligaId }).lean();
const timeIds = times.map(t => t.id);
const todasRodadas = await Rodada.find({ time_id: { $in: timeIds } }).lean();

// Criar Map para join O(1)
const rodadasPorTime = new Map();
for (const rodada of todasRodadas) {
  if (!rodadasPorTime.has(rodada.time_id)) {
    rodadasPorTime.set(rodada.time_id, []);
  }
  rodadasPorTime.get(rodada.time_id).push(rodada);
}

// Associar
for (const time of times) {
  time.rodadas = rodadasPorTime.get(time.id) || [];
}
```

---

## 3. Cache

### TTLs Padrao (CLAUDE.md)

| Tipo | TTL | Arquivo |
|------|-----|---------|
| Rodadas | 5 min | NodeCache backend |
| Rankings | 10 min | NodeCache backend + MongoDB cache |
| Configs | 30 min | NodeCache backend |
| Mercado Cartola | 5 min | API external cache |
| Atletas Cartola | 15 min | API external cache |

### Checklist

```markdown
□ Dados lidos com frequencia estao em cache (rankings, rodadas, configs)
□ TTL configurado EXPLICITAMENTE em todo cache (nunca infinito)
□ Cache invalidado apos atualizacoes (cache-invalidator.js)
□ Chave de cache inclui liga_id (multi-tenant — sem poluicao cross-liga)
□ Hit rate monitorado (meta: >80%)
□ Namespace de chaves evita colisoes (prefixo por dominio/modulo)
□ Endpoint de recalculo disponivel para correcao de cache
```

### Verificacao

```bash
# Verificar TTLs configurados
grep -rn "ttl\|TTL\|maxAge\|stdTTL" --include="*.js" utils/ services/ config/ | grep -v node_modules

# Verificar chaves de cache sem liga_id
grep -rn "cache\.set\|cache\.get\|cacheKey" --include="*.js" . | grep -v "liga\|ligaId" | grep -v node_modules

# Verificar invalidacao
grep -rn "invalidat\|clearCache\|flushCache\|cache\.del" --include="*.js" utils/ services/
```

---

## 4. Paralelismo Async

### Checklist

```markdown
□ Requests independentes executados com Promise.all (nao sequencial)
□ Sem await sequencial desnecessario em operacoes independentes
□ Promise.allSettled quando falha de um nao deve bloquear outros
```

### Exemplos

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

### Verificacao

```bash
# Buscar multiplos awaits sequenciais que poderiam ser paralelos
grep -A1 "const.*= await" --include="*.js" controllers/ services/ | grep -B1 "const.*= await" | head -20
```

---

## 5. Frontend Performance

### Checklist

```markdown
□ Imagens com loading="lazy" (escudos, avatares)
□ Escudos com fallback (onerror="/escudos/default.png")
□ Listas longas com virtualizacao (renderizar apenas items visiveis)
□ Busca em tempo real com debounce (300ms apos ultima tecla)
□ Scroll infinito com throttle (limita chamadas por scroll event)
□ CSS/JS criticos carregados primeiro, modulos lazy-loaded
□ SPA modules carregados sob demanda (participante-navigation.js)
□ Assets estaticos com Cache-Control headers adequados
```

### Verificacao

```bash
# Imagens sem lazy loading
grep -rn "<img" --include="*.html" --include="*.js" public/ | grep -v "loading=" | head -10

# Escudos sem fallback
grep -rn "escudo\|<img" --include="*.js" public/ | grep -v "onerror\|fallback" | head -10

# Fetch sem debounce em handlers de input
grep -rn "addEventListener.*input\|oninput" --include="*.js" public/ | head -10
```

---

## 6. Payload e Compressao

### Checklist

```markdown
□ API retorna apenas campos usados pelo cliente (projecao MongoDB)
□ Compressao gzip/brotli ativada (Express compression middleware)
□ Paginacao: max 50-100 items por pagina (middleware/pagination.js)
□ Sem retornar arrays completos de 10k+ documentos
□ JSON responses sem campos desnecessarios (sem __v, sem metadados Mongoose)
```

---

## 7. Benchmarks de Referencia

| Operacao | Meta (p95) | Limite Aceitavel | Alerta |
|----------|-----------|------------------|--------|
| Query simples com indice | < 50ms | < 200ms | > 200ms |
| Calculo com cache hit | < 100ms | < 500ms | > 500ms |
| Endpoint de API (com DB) | < 500ms | < 2s | > 2s |
| Renderizacao de pagina | < 1s | < 3s | > 3s |
| Startup do servidor | < 5s | < 15s | > 15s |

---

## 8. Sinais de Degradacao

| Sinal | Risco | Severidade |
|-------|-------|-----------|
| Query sem indice em collection grande | Full collection scan | CRITICO |
| N+1 queries em loop | Timeout em producao | CRITICO |
| Sem paginacao retornando 10k+ docs | Out of memory | CRITICO |
| Await sequencial de requests independentes | Latencia multiplicada | ALTO |
| Cache sem TTL (nunca expira) | Dados stale permanentes | ALTO |
| Response > 1MB sem compressao | Banda desperdicada | MEDIO |
| Imagens sem lazy loading | First paint lento | MEDIO |

---

## 9. Ferramentas de Diagnostico

```bash
# MongoDB — analisar query
db.collection.find(query).explain('executionStats')

# MongoDB — ativar profiling temporario (queries > 100ms)
db.setProfilingLevel(1, { slowms: 100 })
# Apos analise:
db.system.profile.find().sort({ millis: -1 }).limit(10)
db.setProfilingLevel(0)

# Node.js — CPU profiling
node --prof server.js
# Apos parar:
node --prof-process isolate-*.log > profile.txt

# Express — medir tempo de endpoints (middleware simples)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`Slow endpoint: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});
```

---

**Versao:** 1.0 (Adaptado do agnostic-core para SuperCartola)
