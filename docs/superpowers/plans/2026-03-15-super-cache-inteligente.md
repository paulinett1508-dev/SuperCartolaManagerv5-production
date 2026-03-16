# Super Cache Inteligente — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir 3 sistemas de cache sobrepostos por um cache unificado L1+L2 com cacheHint do backend, reduzindo requests de 7-9 para 0-3 em warm start.

**Architecture:** Backend adiciona `cacheHint` (ttl, imutavel, versao) em todo response de API. Frontend unificado (`participante-cache-v2.js`) com L1 memoria + L2 IndexedDB respeita esses hints. Dados imutaveis (rodadas consolidadas) nunca sao re-buscados.

**Tech Stack:** Node.js/Express (backend), Vanilla JS + IndexedDB (frontend), MongoDB (market status via MarketGate)

**Spec:** `docs/superpowers/specs/2026-03-15-super-cache-inteligente-design.md`

---

## Chunk 1: Backend — `buildCacheHint` helper

### Task 1: Criar `utils/cache-hint.js`

**Files:**
- Create: `utils/cache-hint.js`

- [ ] **Step 1: Criar o helper buildCacheHint**

```js
// utils/cache-hint.js
'use strict';

const MarketGate = require('./marketGate');

// TTLs em segundos
const TTL = {
  TEMPORADA_ENCERRADA: 365 * 24 * 3600,  // 1 ano
  RODADA_CONSOLIDADA: 30 * 24 * 3600,     // 30 dias
  CONFIG: 24 * 3600,                       // 24h
  MERCADO_ABERTO: 30 * 60,                // 30 min
  ENTRE_RODADAS: 3600,                     // 1h
  RODADA_ATIVA: 30,                        // 30s
  RANKING_ATIVA: 60,                       // 60s
  NAO_CACHEAR: 0
};

/**
 * Gera cacheHint para responses de API do participante.
 * O frontend usa ttl/imutavel para decidir quanto tempo cachear.
 *
 * @param {Object} params
 * @param {number} [params.rodada] - Rodada dos dados retornados
 * @param {number} [params.rodadaAtual] - Rodada atual do mercado
 * @param {number} [params.statusMercado] - Status do mercado (1=aberto, 2=fechado, 4=encerrado, 6=temporada)
 * @param {number} [params.temporada] - Temporada dos dados
 * @param {number} [params.temporadaAtual] - Temporada atual
 * @param {string} [params.tipo] - Tipo de dado: 'ranking', 'rodada', 'extrato', 'config', 'mercado'
 * @returns {{ ttl: number, imutavel: boolean, motivo: string, versao: string }}
 */
function buildCacheHint({ rodada, rodadaAtual, statusMercado, temporada, temporadaAtual, tipo } = {}) {
  // Temporada passada = totalmente imutavel
  if (temporada && temporadaAtual && temporada < temporadaAtual) {
    return {
      ttl: TTL.TEMPORADA_ENCERRADA,
      imutavel: true,
      motivo: 'temporada_encerrada',
      versao: `t${temporada}`
    };
  }

  // Temporada encerrada (status 6)
  if (statusMercado === 6) {
    return {
      ttl: TTL.TEMPORADA_ENCERRADA,
      imutavel: true,
      motivo: 'temporada_encerrada',
      versao: `r${rodada || rodadaAtual}_t${temporada}`
    };
  }

  // Rodada consolidada (rodada < atual e mercado aberto)
  if (rodada && rodadaAtual && rodada < rodadaAtual && statusMercado === 1) {
    return {
      ttl: TTL.RODADA_CONSOLIDADA,
      imutavel: true,
      motivo: 'rodada_consolidada',
      versao: `r${rodada}_t${temporada}`
    };
  }

  // Config de liga / modulos
  if (tipo === 'config') {
    return {
      ttl: TTL.CONFIG,
      imutavel: false,
      motivo: 'config',
      versao: `cfg_${rodadaAtual || 0}_t${temporada}`
    };
  }

  // Rodada ativa (mercado fechado)
  if (statusMercado === 2) {
    const ttl = tipo === 'ranking' ? TTL.RANKING_ATIVA : TTL.RODADA_ATIVA;
    return {
      ttl,
      imutavel: false,
      motivo: 'rodada_ativa',
      versao: `r${rodada || rodadaAtual}_t${temporada}_live`
    };
  }

  // Extrato entre rodadas
  if (tipo === 'extrato') {
    return {
      ttl: TTL.ENTRE_RODADAS,
      imutavel: false,
      motivo: 'entre_rodadas',
      versao: `ext_r${rodadaAtual}_t${temporada}`
    };
  }

  // Default: mercado aberto
  return {
    ttl: TTL.MERCADO_ABERTO,
    imutavel: false,
    motivo: 'mercado_aberto',
    versao: `r${rodadaAtual || 0}_t${temporada}`
  };
}

/**
 * Helper para obter contexto do mercado atual (para controllers que nao tem)
 */
async function getMercadoContext() {
  try {
    const status = await MarketGate.getStatus();
    return {
      rodadaAtual: status?.rodada_atual,
      statusMercado: status?.status_mercado,
      temporadaAtual: status?.temporada
    };
  } catch {
    return { rodadaAtual: null, statusMercado: null, temporadaAtual: null };
  }
}

module.exports = { buildCacheHint, getMercadoContext, TTL };
```

- [ ] **Step 2: Verificar que importa corretamente**

Run: `node -e "const { buildCacheHint } = require('./utils/cache-hint'); console.log(buildCacheHint({ rodada: 5, rodadaAtual: 6, statusMercado: 1, temporada: 2026, temporadaAtual: 2026 }))"`
Expected: `{ ttl: 2592000, imutavel: true, motivo: 'rodada_consolidada', versao: 'r5_t2026' }`

- [ ] **Step 3: Commit**

```bash
git add utils/cache-hint.js
git commit -m "feat: criar buildCacheHint helper para TTLs inteligentes de cache"
```

---

## Chunk 2: Backend — Adicionar cacheHint aos 8 endpoints

### Task 2: Endpoint `/api/cartola/mercado/status`

**Files:**
- Modify: `controllers/cartolaController.js` (ou rota que serve mercado status)
- Reference: `utils/cache-hint.js`

- [ ] **Step 1: Localizar o handler de mercado/status**

Run: `grep -rn "mercado/status\|mercado.*status" routes/ controllers/ --include="*.js" | head -10`

- [ ] **Step 2: Adicionar cacheHint ao response**

No handler, apos montar o response, adicionar:
```js
const { buildCacheHint } = require('../utils/cache-hint');
// ...dentro do handler:
const cacheHint = buildCacheHint({
  rodadaAtual: data.rodada_atual,
  statusMercado: data.status_mercado,
  temporada: data.temporada,
  temporadaAtual: data.temporada,
  tipo: 'mercado'
});
// Adicionar ao response existente:
res.json({ ...responseAtual, cacheHint });
```

- [ ] **Step 3: Testar via curl**

Run: `curl -s http://localhost:3000/api/cartola/mercado/status | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cacheHint', 'MISSING'))"`
Expected: Objeto com ttl, imutavel, motivo, versao

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: adicionar cacheHint ao endpoint mercado/status"
```

### Task 3: Endpoint `/api/ligas/:id`

**Files:**
- Modify: controller que serve `GET /api/ligas/:id`

- [ ] **Step 1: Localizar handler**

Run: `grep -rn "router.get.*ligas.*:id\b" routes/ --include="*.js" | head -5`

- [ ] **Step 2: Adicionar cacheHint**

```js
const { buildCacheHint, getMercadoContext } = require('../utils/cache-hint');
// ...no handler:
const ctx = await getMercadoContext();
const cacheHint = buildCacheHint({ ...ctx, tipo: 'config' });
res.json({ ...response, cacheHint });
```

- [ ] **Step 3: Testar e commit**

```bash
curl -s http://localhost:3000/api/ligas/LIGA_ID | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cacheHint', 'MISSING'))"
git commit -am "feat: adicionar cacheHint ao endpoint ligas/:id"
```

### Task 4: Endpoint `/api/ligas/:id/ranking`

**Files:**
- Modify: controller de ranking

- [ ] **Step 1: Localizar handler e adicionar cacheHint**

O ranking depende de rodada e temporada. Usar:
```js
const cacheHint = buildCacheHint({
  rodada: rodadaConsultada,
  rodadaAtual: ctx.rodadaAtual,
  statusMercado: ctx.statusMercado,
  temporada: temporadaConsultada,
  temporadaAtual: ctx.temporadaAtual,
  tipo: 'ranking'
});
```

- [ ] **Step 2: Testar e commit**

```bash
git commit -am "feat: adicionar cacheHint ao endpoint ranking"
```

### Task 5: Endpoint `/api/rodadas/:ligaId/rodadas`

**Files:**
- Modify: `controllers/rodadaController.js`

- [ ] **Step 1: Adicionar cacheHint**

Rodadas retornam multiplas rodadas (1 a 38). O cacheHint deve considerar:
- Se todas as rodadas retornadas sao < rodadaAtual e mercado aberto → imutavel
- Se inclui rodada ativa → nao imutavel

```js
const todasConsolidadas = rodadaFim < ctx.rodadaAtual && ctx.statusMercado === 1;
const cacheHint = todasConsolidadas
  ? buildCacheHint({ rodada: rodadaFim, ...ctx })
  : buildCacheHint({ rodada: ctx.rodadaAtual, ...ctx });
```

- [ ] **Step 2: Testar e commit**

```bash
git commit -am "feat: adicionar cacheHint ao endpoint rodadas"
```

### Task 6: Endpoints de extrato (2 endpoints)

**Files:**
- Modify: `controllers/extratoController.js` (ou equivalente)
- Modify: `controllers/fluxoFinanceiroController.js`

- [ ] **Step 1: Adicionar cacheHint a ambos com tipo 'extrato'**

```js
const cacheHint = buildCacheHint({ ...ctx, tipo: 'extrato' });
```

- [ ] **Step 2: Testar e commit**

```bash
git commit -am "feat: adicionar cacheHint aos endpoints de extrato"
```

### Task 7: Endpoint parciais e modulos config

**Files:**
- Modify: `routes/matchday-routes.js` (parciais)
- Modify: controller de modulos config

- [ ] **Step 1: Parciais — cacheHint com ttl curto (rodada ativa)**

```js
const cacheHint = buildCacheHint({ rodada: rodadaAtual, ...ctx, tipo: 'ranking' });
// Forcar rodada_ativa:
cacheHint.motivo = 'rodada_ativa';
cacheHint.imutavel = false;
```

- [ ] **Step 2: Modulos config — cacheHint com tipo 'config'**

```js
const cacheHint = buildCacheHint({ ...ctx, tipo: 'config' });
```

- [ ] **Step 3: Testar e commit**

```bash
git commit -am "feat: adicionar cacheHint a parciais e modulos config"
```

---

## Chunk 3: Frontend — Cache Unificado v2

### Task 8: Criar `participante-cache-v2.js` — Core L1+L2

**Files:**
- Create: `public/participante/js/participante-cache-v2.js`

- [ ] **Step 1: Criar o modulo com IndexedDB + L1 memory**

Implementar:
- `_openDB()` — abre IndexedDB `SuperCartolaCacheV2`
- `_getL1(key)` — busca em memoria
- `_setL1(key, entry)` — salva em memoria com TTL 5min
- `_getL2(key)` — busca no IndexedDB
- `_setL2(key, entry)` — salva no IndexedDB
- `_isExpired(entry)` — verifica se `!imutavel && Date.now() > timestamp + ttl*1000`

- [ ] **Step 2: Implementar `get(key, fetchFn, opts)` com SWR**

Logica:
1. L1 hit → retorna
2. L2 hit + imutavel → retorna (nunca revalida)
3. L2 hit + expirado → retorna stale + `_refreshInBackground(key, fetchFn)`
4. L2 hit + valido → retorna, promove para L1
5. Miss → await fetchFn() → salva L2+L1 → retorna

- [ ] **Step 3: Implementar `set`, `invalidate`, `invalidatePrefix`**

- [ ] **Step 4: Implementar `getSync(key)` — L1 only, sincrono**

- [ ] **Step 5: Implementar `preload(ligaId, timeId, temporada)`**

1. Abre IndexedDB, le TODAS as entries com getAll()
2. Popula L1 com tudo
3. Identifica entries expiradas e nao imutaveis
4. Retorna imediato (promessa de refresh em background)

- [ ] **Step 6: Implementar `cleanExpired()` com setInterval 10min**

Remove entries: `!imutavel && Date.now() > timestamp + (ttl * 1000 * 2)`

- [ ] **Step 7: Implementar `getStats()` para debug**

Retorna: total entries, imutaveis, expiradas, L1 size, L2 size

- [ ] **Step 8: Expor como `window.Cache` e testar no browser console**

```js
// Teste manual no console:
await Cache.set('test:1', { foo: 'bar' }, { ttl: 60, imutavel: false });
console.log(await Cache.get('test:1', () => fetch('/api/test')));
console.log(Cache.getStats());
```

- [ ] **Step 9: Commit**

```bash
git add public/participante/js/participante-cache-v2.js
git commit -m "feat: criar participante-cache-v2 com L1 memoria + L2 IndexedDB + SWR inteligente"
```

### Task 9: Adicionar script ao index.html

**Files:**
- Modify: `public/participante/index.html`

- [ ] **Step 1: Adicionar `<script>` do cache v2 ANTES dos outros scripts do participante**

O cache v2 deve carregar antes de `participante-home.js` e `matchday-service.js`.

- [ ] **Step 2: Commit**

```bash
git commit -am "feat: carregar participante-cache-v2.js no index.html"
```

---

## Chunk 4: Integracao — Home usa Cache v2

### Task 10: Migrar `participante-home.js` para usar `Cache.get()`

**Files:**
- Modify: `public/participante/js/modules/participante-home.js`

- [ ] **Step 1: Identificar todos os fetch diretos na inicializacao da Home**

Buscar: `fetch('/api/ligas`, `fetch('/api/rodadas`, `fetch('/api/extrato`, `fetch('/api/cartola/mercado`
Listar cada um com linha e contexto.

- [ ] **Step 2: Substituir cada fetch por `Cache.get()`**

Exemplo para ranking:
```js
// ANTES:
const res = await fetch(`/api/ligas/${ligaId}/ranking?temporada=${temporada}`);
const data = await res.json();

// DEPOIS:
const data = await Cache.get(
  `ranking:${ligaId}:${temporada}`,
  async () => {
    const res = await fetch(`/api/ligas/${ligaId}/ranking?temporada=${temporada}`);
    return res.json();
  }
);
```

O `Cache.get()` extrai `cacheHint` do response e usa para TTL/imutavel.

- [ ] **Step 3: Substituir `inicializarHomeParticipante()` para usar `Cache.preload()` no inicio**

```js
// No topo da inicializacao:
if (window.Cache) {
  await Cache.preload(ligaId, timeId, temporada);
}
```

- [ ] **Step 4: Testar cold start e warm start — contar requests no DevTools Network**

Expected cold start: 7-9 requests (igual)
Expected warm start: 1-3 requests (melhoria)

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: participante-home usa Cache.get() com SWR inteligente"
```

### Task 11: Migrar `matchday-service.js` para salvar parciais no Cache

**Files:**
- Modify: `public/participante/js/matchday-service.js`

- [ ] **Step 1: Apos fetch de parciais, salvar no Cache**

Em `_fetchParciais()`, apos receber dados:
```js
if (window.Cache && ranking.length) {
  Cache.set(`ranking:${_ligaId}:${_temporada}`, ranking, {
    ttl: 30, imutavel: false, motivo: 'rodada_ativa'
  });
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat: matchday-service salva parciais no Cache unificado"
```

---

## Chunk 5: Migracao e Limpeza

### Task 12: Migrar dados do legado para Cache v2

**Files:**
- Modify: `public/participante/js/participante-cache-v2.js` (adicionar funcao de migracao)

- [ ] **Step 1: Criar `_migrateLegacy()` dentro do cache v2**

```js
async function _migrateLegacy() {
  if (localStorage.getItem('scm_cache_v2_migrated')) return;
  try {
    // Tentar ler dados de SuperCartolaOffline
    // Migrar entries validas para SuperCartolaCacheV2
    // Deletar DBs antigos
    indexedDB.deleteDatabase('SuperCartolaOffline');
    indexedDB.deleteDatabase('ParticipanteCacheDB');
    localStorage.setItem('scm_cache_v2_migrated', 'true');
  } catch (e) {
    // Falha silenciosa — cache limpo e ok
    localStorage.setItem('scm_cache_v2_migrated', 'true');
  }
}
```

- [ ] **Step 2: Chamar `_migrateLegacy()` no init do cache v2**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: migracao automatica de caches legados para v2"
```

### Task 13: Deprecar sistemas antigos

**Files:**
- Modify: `public/participante/js/participante-cache-manager.js`
- Modify: `public/participante/js/participante-offline-cache.js`
- Modify: `public/participante/js/participante-cache.js`
- Modify: `public/participante/index.html`

- [ ] **Step 1: Redirecionar `ParticipanteCacheManager` para Cache v2**

No topo de `participante-cache-manager.js`:
```js
// DEPRECATED — redirecionado para Cache v2
// Manter shim para codigo que ainda referencia window.ParticipanteCache
if (window.Cache) {
  window.ParticipanteCache = {
    get: (key) => Cache.get(key, null),
    set: (key, data) => Cache.set(key, data, { ttl: 300 }),
    // ... shims minimos
  };
}
```

- [ ] **Step 2: Remover imports dos scripts legados do index.html (se possivel)**

Verificar se algum outro modulo depende diretamente. Se sim, manter shim. Se nao, remover `<script>`.

- [ ] **Step 3: Testar que nada quebra — navegar por todas as telas do app**

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: deprecar 3 sistemas de cache legados em favor do Cache v2"
```

---

## Chunk 6: Validacao e Metricas

### Task 14: Adicionar logging de metricas de cache

**Files:**
- Modify: `public/participante/js/participante-cache-v2.js`

- [ ] **Step 1: Adicionar contadores internos**

```js
const _metrics = { l1Hits: 0, l2Hits: 0, l2Immutable: 0, networkFetches: 0, swr: 0 };
```

Incrementar em cada path do `get()`.

- [ ] **Step 2: Expor via `getStats()` e log no console**

```js
// A cada 60s, se Log disponivel:
if (window.Log) Log.info('[CACHE-V2]', `L1:${_metrics.l1Hits} L2:${_metrics.l2Hits} Immutable:${_metrics.l2Immutable} Network:${_metrics.networkFetches} SWR:${_metrics.swr}`);
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: metricas de cache v2 para monitoramento de performance"
```

### Task 15: Teste end-to-end completo

- [ ] **Step 1: Cold start — limpar IndexedDB e localStorage, recarregar app**

Verificar: 7-9 requests, dados salvos no IndexedDB com cacheHint

- [ ] **Step 2: Warm start — recarregar app sem limpar cache**

Verificar: 1-3 requests, dados imutaveis servidos do IndexedDB

- [ ] **Step 3: Navegacao SPA — Home -> Rodadas -> Home**

Verificar: 0 requests adicionais na volta

- [ ] **Step 4: Rodada ativa — simular mercado fechado**

Verificar: parciais polled a cada 30s, salvos no Cache, modulos leem do Cache

- [ ] **Step 5: Verificar getStats() no console**

```js
Cache.getStats()
// Deve mostrar: total entries, imutaveis, L1 size, etc.
```

- [ ] **Step 6: Commit final**

```bash
git commit -am "test: validacao end-to-end do Super Cache Inteligente v2"
```

---

## Resumo de Commits Esperados

| # | Mensagem | Chunk |
|---|---|---|
| 1 | `feat: criar buildCacheHint helper para TTLs inteligentes` | 1 |
| 2 | `feat: adicionar cacheHint ao endpoint mercado/status` | 2 |
| 3 | `feat: adicionar cacheHint ao endpoint ligas/:id` | 2 |
| 4 | `feat: adicionar cacheHint ao endpoint ranking` | 2 |
| 5 | `feat: adicionar cacheHint ao endpoint rodadas` | 2 |
| 6 | `feat: adicionar cacheHint aos endpoints de extrato` | 2 |
| 7 | `feat: adicionar cacheHint a parciais e modulos config` | 2 |
| 8 | `feat: criar participante-cache-v2 L1+L2+SWR` | 3 |
| 9 | `feat: carregar cache-v2 no index.html` | 3 |
| 10 | `feat: participante-home usa Cache.get()` | 4 |
| 11 | `feat: matchday-service salva parciais no Cache` | 4 |
| 12 | `feat: migracao automatica de caches legados` | 5 |
| 13 | `refactor: deprecar 3 sistemas de cache legados` | 5 |
| 14 | `feat: metricas de cache v2` | 6 |
| 15 | `test: validacao end-to-end` | 6 |

---

**Ordem de execucao recomendada:** Chunk 1 → 2 → 3 → 4 → 5 → 6 (sequencial, cada chunk depende do anterior)

**Estimativa de tasks:** 15 tasks, cada uma com 2-6 steps
