# Super Cache Inteligente — Design Spec

**Data:** 2026-03-15
**Status:** Aprovado pelo usuário
**Abordagem:** #1 — Backend marca cacheHint + Frontend unificado

---

## Problema

O app do participante (PWA) recarrega todos os dados a cada acesso — 7-9 API calls no cold start, 4-5 a cada auto-refresh (60s), e re-fetch completo na navegacao SPA. Dados imutaveis (rodadas consolidadas, rankings historicos) sao buscados repetidamente sem necessidade. A infraestrutura de cache frontend tem 3 sistemas sobrepostos (`ParticipanteCacheDB`, `SuperCartolaOffline`, `ParticipanteCacheManager`) causando inconsistencias.

## Solucao

### 1. Backend: `cacheHint` em todo response

Todo endpoint de API do participante inclui um campo `cacheHint` no response:

```json
{
  "data": { ... },
  "cacheHint": {
    "ttl": 2592000,
    "imutavel": true,
    "motivo": "rodada_consolidada",
    "versao": "r5_t2026"
  }
}
```

#### Campos

| Campo | Tipo | Descricao |
|---|---|---|
| `ttl` | number (segundos) | Tempo sugerido de cache. 0 = nao cachear |
| `imutavel` | boolean | Dado nao vai mudar — frontend cacheia indefinidamente |
| `motivo` | string | `rodada_consolidada`, `rodada_ativa`, `mercado_aberto`, `temporada_encerrada`, `entre_rodadas`, `config` |
| `versao` | string | Fingerprint do dado (ex: `r5_t2026`). Versao no cache === versao do response = dado nao mudou |

#### Regras de classificacao

| Contexto | `ttl` | `imutavel` | `motivo` |
|---|---|---|---|
| Rodada consolidada (< rodada_atual, mercado aberto) | 30 dias | `true` | `rodada_consolidada` |
| Rodada ativa (status_mercado === 2) | 30s | `false` | `rodada_ativa` |
| Mercado aberto (dados da liga, config) | 30 min | `false` | `mercado_aberto` |
| Temporada encerrada | 1 ano | `true` | `temporada_encerrada` |
| Ranking geral (rodada consolidada) | 30 dias | `true` | `rodada_consolidada` |
| Ranking geral (rodada ativa) | 60s | `false` | `rodada_ativa` |
| Extrato financeiro (sem rodada ativa) | 1h | `false` | `entre_rodadas` |
| Config da liga / modulos ativos | 24h | `false` | `config` |

#### Implementacao

Helper centralizado em `utils/cache-hint.js`:

```js
function buildCacheHint({ rodada, rodadaAtual, statusMercado, temporada, temporadaAtual }) {
  if (temporada < temporadaAtual) {
    return { ttl: 31536000, imutavel: true, motivo: 'temporada_encerrada', versao: `t${temporada}` };
  }
  if (statusMercado === 6) {
    return { ttl: 31536000, imutavel: true, motivo: 'temporada_encerrada', versao: `r${rodada}_t${temporada}` };
  }
  if (rodada && rodada < rodadaAtual && statusMercado === 1) {
    return { ttl: 2592000, imutavel: true, motivo: 'rodada_consolidada', versao: `r${rodada}_t${temporada}` };
  }
  if (statusMercado === 2) {
    return { ttl: 30, imutavel: false, motivo: 'rodada_ativa', versao: `r${rodada}_t${temporada}_live` };
  }
  return { ttl: 1800, imutavel: false, motivo: 'mercado_aberto', versao: `r${rodadaAtual}_t${temporada}` };
}
```

Cada controller chama:
```js
const hint = buildCacheHint({ rodada, rodadaAtual, statusMercado, temporada, temporadaAtual });
res.json({ data: resultado, cacheHint: hint });
```

### 2. Frontend: Cache Unificado (`ParticipanteCacheManager` v2)

#### Arquitetura L1 + L2

```
Request de dados
    |
    v
[ L1 — Memoria (JS object) ]     instantaneo, TTL 5min default
    | miss
    v
[ L2 — IndexedDB unico ]         persistente, TTL do cacheHint
    | miss ou expirado
    v
[ Network fetch ]                 API com cacheHint no response
    -> Salva em L2 + L1
```

#### IndexedDB Schema

**DB:** `SuperCartolaCacheV2`, version 1

**Store:** `cache` (keyPath: `key`)

| Campo | Tipo | Descricao |
|---|---|---|
| `key` | string (PK) | Ex: `ranking:684cb1c8:2026` |
| `data` | any | Payload do response |
| `timestamp` | number | `Date.now()` quando salvo |
| `ttl` | number | Segundos, do `cacheHint.ttl` |
| `imutavel` | boolean | Do `cacheHint.imutavel` |
| `versao` | string | Do `cacheHint.versao` |
| `motivo` | string | Do `cacheHint.motivo` |

#### Convencao de chaves

```
{tipo}:{ligaId}:{qualificador}:{temporada}

ranking:684cb1c8:2026              -> ranking geral
rodada:684cb1c8:5:2026             -> rodada 5 especifica
extrato:684cb1c8:timeId:2026       -> extrato do participante
liga:684cb1c8                      -> config da liga
mercado:status                     -> status do mercado
modulos:684cb1c8                   -> modulos ativos
```

#### Estrategia: Stale-While-Revalidate Inteligente

```
get(key, fetchFn, opts):
  1. L1 hit -> retorna imediato
  2. L2 hit:
     a. imutavel === true -> retorna, NAO revalida (nunca)
     b. expirado -> retorna stale imediato + agenda revalidacao background
     c. valido -> retorna, promove para L1
  3. Miss total -> fetch network -> salva L2 + L1 -> retorna
```

**Regra critica:** dados com `imutavel: true` NUNCA disparam fetch de background.

#### API publica

```js
window.Cache = {
  async get(key, fetchFn, opts),   // Busca com SWR inteligente
  getSync(key),                     // Leitura sincrona (L1 only)
  async set(key, data, opts),       // Escrita direta (parciais)
  async invalidate(key),            // Invalida chave especifica
  async invalidatePrefix(prefix),   // Invalida por prefixo
  async preload(ligaId, timeId, temporada),  // Cold start
  getStats()                        // Debug
}
```

#### Preload no cold start

```js
async preload(ligaId, timeId, temporada) {
  // 1. Le TUDO do IndexedDB para L1 (~2ms)
  // 2. Identifica o que expirou e NAO e imutavel
  // 3. Fetch APENAS do que expirou (em paralelo)
  // 4. Retorna imediato com dados do IndexedDB
}
```

#### Arquivo

`public/participante/js/participante-cache-v2.js`

### 3. Migracao do legado

Na primeira carga com v2:
1. Detectar se `ParticipanteCacheDB` e `SuperCartolaOffline` existem
2. Migrar dados validos para `SuperCartolaCacheV2`
3. Deletar DBs antigos (`indexedDB.deleteDatabase()`)
4. Flag `localStorage.scm_cache_v2_migrated = true`

### 4. Integracao com MatchdayService

**Hoje:** Cada modulo faz seu proprio fetch ao receber `data:parciais`.
**Depois:** MatchdayService salva parciais no Cache -> modulos leem do Cache.

```js
// matchday-service.js
_emit('data:parciais');
Cache.set(`ranking:${_ligaId}:${_temporada}`, ranking, { ttl: 30, imutavel: false });

// participante-home.js
MS.on('data:parciais', () => {
    const ranking = Cache.getSync(`ranking:${ligaId}:${temporada}`);
    renderCards(ranking);
});
```

### 5. Ciclo de vida por fase

#### Mercado aberto
- `Cache.preload()` -> rodadas consolidadas = imutaveis, 0 fetches
- Ranking, extrato -> busca se expirou
- **Total: 1-3 requests** (vs 7-9 hoje)

#### Rodada ativa
- Mercado status -> sempre fetch (ttl 0)
- Ranking -> stale-while-revalidate (ttl 60s)
- Parciais -> MatchdayService (30s poll) salva no Cache
- **Total: 2-3 requests + polling**

#### Navegacao SPA (Home -> Rodadas -> Home)
- `Cache.preload()` -> L1 ja tem tudo
- **Total: 0 fetches, render imediato**

### 6. Eventos de invalidacao

| Evento | Acao |
|---|---|
| Rodada consolida (status 2->1) | Proximo fetch traz `cacheHint.imutavel: true` -> atualiza L2 |
| Troca de temporada | `Cache.invalidatePrefix("*")` — limpa tudo |
| Admin altera config | Proximo fetch traz `versao` diferente -> atualiza |
| Acerto financeiro | Proximo fetch do extrato traz `versao` diferente |

### 7. Limpeza

- `cleanExpired()` roda a cada 10 minutos
- Remove: `!imutavel && Date.now() > timestamp + (ttl * 1000 * 2)`
- Imutaveis: limpos apenas por `invalidate()` explicito ou troca de temporada

### 8. Numeros esperados

| Cenario | Requests hoje | Requests depois |
|---|---|---|
| Cold start (primeira vez) | 7-9 | 7-9 |
| Warm start (voltou no dia seguinte) | 7-9 | 1-3 |
| Navegacao SPA | 7-9 | 0 |
| Rodada ativa (polling 60s) | 4-5/ciclo | 1/ciclo |
| Auto-refresh (60s) | 4 | 0-1 |

---

## Endpoints a modificar (adicionar cacheHint)

| Endpoint | Controller |
|---|---|
| `GET /api/ligas/:id` | ligaController |
| `GET /api/ligas/:id/ranking` | rankingController |
| `GET /api/rodadas/:ligaId/rodadas` | rodadaController |
| `GET /api/extrato-cache/:ligaId/times/:timeId/cache` | extratoController |
| `GET /api/fluxo-financeiro/:ligaId/extrato/:timeId` | fluxoFinanceiroController |
| `GET /api/cartola/mercado/status` | cartolaController |
| `GET /api/matchday/parciais/:ligaId` | matchdayRoutes |
| `GET /api/modulos/:ligaId/config` | moduloController |

## Arquivos novos

| Arquivo | Descricao |
|---|---|
| `utils/cache-hint.js` | Helper `buildCacheHint()` — regras de TTL centralizadas |
| `public/participante/js/participante-cache-v2.js` | Cache unificado L1+L2 com SWR inteligente |

## Arquivos a modificar

| Arquivo | Mudanca |
|---|---|
| 8 controllers (listados acima) | Adicionar `cacheHint` ao response |
| `participante-home.js` | Usar `Cache.get()` em vez de fetch direto |
| `matchday-service.js` | Salvar parciais no Cache |
| `participante-cache-manager.js` | Deprecated — redirecionar para v2 |
| `participante-offline-cache.js` | Deprecated — migrar dados e deletar |
| `participante-cache.js` | Deprecated — migrar dados e deletar |
| `index.html` | Trocar script imports |

## Fora de escopo (evolucao futura)

- **Fase B:** Cache por jogo dentro da rodada ativa (jogos encerrados = imutavel)
- **Snapshot MongoDB:** Endpoint unico `/api/participante/state` com tudo pre-computado
- **Push notifications:** Server-sent events para invalidacao proativa (em vez de polling)

---

**Aprovado por:** Usuario (brainstorming 2026-03-15)
