# SKILL: Cache Sentinel (Sentinela de Cache do Participante)

## Visao Geral

Skill especialista em **monitoramento proativo e prevencao de caches stale** no app do participante (PWA Mobile). Diferente do `cache-auditor` (auditoria pontual dos 3 ambientes), o Cache Sentinel foca **exclusivamente no participante** com profundidade total em:

1. **MongoDB** - Vasculha collections de cache, detecta orfaos, valida coerencia temporal
2. **Service Worker** - Garante consistencia de versoes e estrategias
3. **Frontend (IndexedDB + Memory)** - Previne dados stale em todas as camadas
4. **Live Experience** - Comportamento durante rodada ao vivo (mercado fechado, parciais)
5. **Modo Estatico** - Comportamento com mercado aberto e temporada encerrada
6. **Dev vs Prod** - Paridade de comportamento entre ambientes

**Filosofia:** Cache antigo NAO prevalece. A verdade e a realidade atual — qualquer cache que nao reflita o estado correto do sistema DEVE ser detectado e reportado.

---

## Quando Usar

| Situacao | Acao |
|----------|------|
| Antes de rodada ao vivo | `--live` para validar TTLs e invalidacao |
| Apos deploy | `--full` para garantir consistencia |
| Participante reporta dado antigo | `--mongo` + `--frontend` para rastrear |
| Apos alterar SW ou versao | `--sw` para validar cache name sync |
| Debug de performance | `--frontend` para analisar camadas |
| Apos consolidacao de rodada | `--mongo` para verificar limpeza |
| Suspeita de cache stale | `--full` investigacao completa |

---

## 5 Modos de Operacao

| Modo | Comando | Foco |
|------|---------|------|
| `--full` | Auditoria completa | Todos os checks (40+) |
| `--mongo` | MongoDB caches | 9 collections, orfaos, temporadas |
| `--sw` | Service Worker | Versao, cache name, estrategias |
| `--frontend` | IndexedDB + Memory | TTLs, race conditions, camadas |
| `--live` | Live Experience | Comportamento mercado fechado/aberto |

### Combinacoes Validas

```bash
/cache-sentinel --full                    # Auditoria completa
/cache-sentinel --mongo                   # Apenas MongoDB
/cache-sentinel --sw --frontend           # SW + IndexedDB (sem Mongo)
/cache-sentinel --live                    # Modo live (inclui checks criticos de todas camadas)
/cache-sentinel --mongo --live            # Mongo focado em comportamento live
```

---

## Mapa de Camadas de Cache do Participante

```
PARTICIPANTE APP - 6 CAMADAS DE CACHE
=====================================================================

CAMADA 1: Service Worker (Cache API)
  Arquivo: public/participante/service-worker.js
  Cache Name: CACHE_NAME (variavel — verificar valor atual)
  Estrategia:
    /api/*           → NETWORK ONLY (nunca cacheia)
    .html, /         → NETWORK ONLY (sempre fresco)
    /js/modules/*    → NETWORK ONLY (fix ES modules iOS)
    static assets    → NETWORK-FIRST com fallback cache
  Cleanup: activate deleta caches com nome != CACHE_NAME

CAMADA 2: IndexedDB L1 - ParticipanteCacheDB (v3)
  Arquivo: public/participante/js/participante-cache.js
  Stores: modulos, ranking, rodadas, extrato
  TTLs:
    Rodada 1-35 (fechada): 30 dias
    Rodada 36+ / outros: 5 minutos
    expira: null → permanente
  Cleanup: limparExpirados() a cada 5 minutos

CAMADA 3: IndexedDB L2 - SuperCartolaOffline (v2)
  Arquivo: public/participante/js/participante-offline-cache.js
  Stores e TTLs (temporada ativa):
    participante: 24h    | liga: 24h
    ranking: 30min       | extrato: 30min
    rodadas: 1h          | top10: 1h
    pontosCorridos: 1h   | mataMata: 1h
    artilheiro: 1h       | luvaOuro: 1h
    melhorMes: 1h        | config: 24h
  Temporada encerrada: TODOS → 10 anos (imutavel)
  Estrategia: Stale-While-Revalidate
  Cleanup: cleanExpired() remove entries > 2x TTL

CAMADA 4: Memory Cache (JS Object)
  Arquivo: public/participante/js/participante-cache-manager.js
  TTL: 5 minutos (volatil, perdido no reload)
  Exposto como: window.ParticipanteCacheManager

CAMADA 5: Module Caches (Map por modulo)
  Arquivos:
    public/js/rodadas/rodadas-cache.js           → Map, 100 max, 5min
    public/js/artilheiro-campeao/artilheiro-campeao-cache.js → Map, 100 max
    public/js/luva-de-ouro/luva-de-ouro-cache.js → Map
    public/js/pontos-corridos/pontos-corridos-cache.js → Map
    public/js/fluxo-financeiro/fluxo-financeiro-cache.js → Map + cacheManager
  Nota: rodadas-cache tem TTL memory (5min) > IndexedDB (3min) — risco de stale promotion

CAMADA 6: localStorage / sessionStorage
  Uso disperso (preferencias UI, nao dados criticos):
    modulo_loaded_${id}           → timestamp ultimo load
    participante_modulo_atual     → modulo SPA atual (session)
    RXRAY cache keys              → widget data por rodada
    scm_hide_saldo               → preferencia UI
    superCartola_escalacaoExpandida → estado UI

=====================================================================
SERVER-SIDE (alimenta todas as camadas acima)

NodeCache (node-cache):
  marketGate          → 5min (normal) / 2min (mercado fechado)
  cartolaService      → 5min (clubs, times, pontuacao)
  cartolaApiService   → 5min (API Cartola)
  cartolaProService   → 2h (sessao autenticada)
  timeController      → 5min (dados de time)
  projecaoFinanceira  → 2min (projecoes live)

In-Memory Variables (jogos-ao-vivo-routes.js):
  cacheJogosDia       → 30s (ao vivo) / 10min (sem jogos)
  cacheAgendaDia      → 30s (ao vivo) / 5min (sem jogos)
  cacheMesDados       → 4h (agenda mensal)
  CACHE_STALE_MAX     → 30min (fallback maximo)

MongoDB Cache Collections (9):
  extratofinanceirocaches    → { liga_id, time_id, temporada } UNIQUE
  rankinggeralcaches         → { ligaId, rodadaFinal, temporada } UNIQUE
  top10caches                → { liga_id, rodada_consolidada, temporada } UNIQUE
  pontoscorridoscaches       → { liga_id, rodada_consolidada, temporada } UNIQUE
  matamatacaches             → { liga_id, edicao, temporada } UNIQUE
  restaumcaches              → { liga_id, edicao, temporada } UNIQUE
  tirocertocaches            → { liga_id, edicao, temporada } UNIQUE
  capitao_caches             → { ligaId, temporada, timeId } UNIQUE
  melhor_mes_cache           → { ligaId } (sem temporada explicita)

Cache Invalidator (utils/cache-invalidator.js):
  Cascata de dependencias:
    FluxoFinanceiro updated  → ExtratoCache
    AcertoFinanceiro created → ExtratoCache
    Rodada updated           → ExtratoCache + RankingCache + Top10Cache
    Parciais updated (live)  → RankingCache + Top10Cache
    Consolidacao completed   → ExtratoCache + RankingCache + Top10Cache + PontosCorridosCache + MataMataCache
```

---

## Checklists de Auditoria

### MODO 1: `--mongo` (MongoDB Caches) — 14 checks

#### Integridade de Dados (5 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| MG-01 | Docs orfaos de temporadas antigas | Query cada collection filtrando `temporada < temporadaAtual`. Contar docs. Se > 0 e temporada encerrada sem `cache_permanente`, reportar |
| MG-02 | RankingGeralCache acumula docs por rodada | Query `rankinggeralcaches` agrupando por `ligaId, temporada`. Contar docs por liga. Se > 1 doc por liga com `rodadaFinal` < ultima rodada, sao stale |
| MG-03 | Top10Cache acumula docs por rodada | Mesmo pattern do MG-02 para `top10caches` — cada rodada cria novo doc sem deletar anterior |
| MG-04 | PontosCorridosCache docs por rodada | Mesmo pattern para `pontoscorridoscaches` |
| MG-05 | ExtratoCache corrompidos | Buscar docs com `historico_transacoes: []` (array vazio) ou `saldo_atual: null`. Usar endpoint `/api/extrato/:ligaId/corrompidos` |

#### Coerencia Temporal (5 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| MG-06 | `temporada` presente em TODOS os cache docs | Verificar se cada collection tem `temporada` como campo obrigatorio no schema |
| MG-07 | `melhor_mes_cache` sem filtro de temporada | Esta collection usa `{ ligaId }` sem temporada — risco de cross-season contamination |
| MG-08 | `cache_permanente` flag coerente | Se `cache_permanente: true`, verificar se a temporada esta realmente encerrada |
| MG-09 | `ultima_rodada_consolidada` vs rodada real | Comparar campo do ExtratoCache com a ultima rodada real da collection `rodadas` |
| MG-10 | Indices corretos em todas collections | Verificar que compound unique indexes existem e cobrem `temporada` |

#### Invalidacao (4 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| MG-11 | `cache-invalidator.js` cobre todos eventos | Verificar CACHE_DEPENDENCIES cobre: FluxoFinanceiro, Acerto, Rodada, Parciais, Consolidacao |
| MG-12 | `deletarCacheMataMata` filtra temporada | Ler controllers/mataMataCacheController.js — o delete DEVE filtrar por temporada |
| MG-13 | Endpoints de invalidacao existem para todas collections | Listar rotas DELETE/POST de invalidacao — garantir cobertura total |
| MG-14 | Zero TTL indexes no MongoDB | Verificar se alguma collection tem `expireAfterSeconds` — nenhuma tem, tudo e event-driven |

---

### MODO 2: `--sw` (Service Worker) — 8 checks

| ID | Check | Como Verificar |
|----|-------|----------------|
| SW-01 | `CACHE_NAME` no SW esta atualizado | Ler `public/participante/service-worker.js`, extrair valor da const CACHE_NAME |
| SW-02 | `CURRENT_SW_CACHE` em `app-version.js` sincronizado | Ler `public/js/app/app-version.js`, buscar `CURRENT_SW_CACHE`. DEVE ser identico ao SW-01. **BUG CONHECIDO: estava v22 enquanto SW era v25** |
| SW-03 | `CURRENT_SW_CACHE` duplicado no mesmo arquivo | `app-version.js` tem 2 declaracoes de CURRENT_SW_CACHE (linhas ~33 e ~403). AMBAS devem estar sincronizadas |
| SW-04 | Estrategia fetch correta | API = NETWORK-ONLY, HTML = NETWORK-ONLY, /js/modules/ = NETWORK-ONLY, static = NETWORK-FIRST |
| SW-05 | `STATIC_ASSETS` completo | Comparar lista em `install` event com arquivos reais em `/participante/css/` e assets criticos |
| SW-06 | Cleanup de caches antigos no `activate` | Verificar que `activate` deleta TODOS os caches com nome != CACHE_NAME atual |
| SW-07 | `skipWaiting()` presente | Verificar no install event — necessario para atualizacao imediata |
| SW-08 | FORCE_UPDATE via push funcional | Verificar handler de push notification com `forceUpdate` payload type |

---

### MODO 3: `--frontend` (IndexedDB + Memory) — 12 checks

#### IndexedDB (6 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| FE-01 | `ParticipanteCacheDB` versao atualizada | Ler `participante-cache.js`, verificar `DB_VERSION`. Se stores mudaram, versao DEVE ter incrementado |
| FE-02 | `SuperCartolaOffline` TTLs razoaveis | ranking/extrato < 1h durante temporada ativa. config/liga pode ser 24h |
| FE-03 | `TEMPORADA_ENCERRADA` flag coerente | Se true, TTLs viram 10 anos. Verificar logica de deteccao: `ParticipanteConfig.SEASON_STATUS` |
| FE-04 | Cache keys incluem temporada | ranking e extrato DEVEM ter temporada no key (fix v2.3). Verificar todos stores |
| FE-05 | `cleanExpired()` automatico | Verificar setInterval em `participante-offline-cache.js` — deve rodar periodicamente |
| FE-06 | Race condition `_initPromise` | Verificar pattern de inicializacao lazy — deve usar promise singleton para evitar opens multiplos |

#### Memory Cache (3 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| FE-07 | Memory TTL <= IndexedDB TTL | **BUG CONHECIDO:** `rodadas-cache.js` tem memory 5min > IndexedDB 3min. Dado stale promovido ao memory com timestamp fresco, vivendo ate 8min total |
| FE-08 | `ParticipanteCacheManager` L1/L2 consistencia | L1 (memory 5min) e L2 (IndexedDB TTLs variados). Verificar que L1 nunca excede L2 |
| FE-09 | Module caches tem max entries | Verificar eviction em `rodadas-cache.js`, `artilheiro-campeao-cache.js`, etc. Map sem limite = memory leak |

#### localStorage/sessionStorage (3 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| FE-10 | Chaves orfas | Buscar chaves definidas no codigo mas nunca lidas, ou lidas mas nunca escritas |
| FE-11 | Dados criticos em localStorage | Nenhum dado financeiro ou de pontuacao deve estar em localStorage (apenas preferencias UI) |
| FE-12 | Cache bust no sessionStorage | `participante-home.js` usa sessionStorage para clubes — TTL implicitamente = tab lifetime, OK |

---

### MODO 4: `--live` (Live Experience) — 10 checks

#### Mercado Fechado (Rodada Ativa) — 5 checks

| ID | Check | Como Verificar |
|----|-------|----------------|
| LV-01 | `marketGate` TTL reduzido | Quando `mercado_fechado`, TTL deve ser 120s (2min), nao 300s. Verificar `utils/marketGate.js` logica condicional |
| LV-02 | Jogos ao vivo TTL 30s | `cacheJogosDia` deve ser 30s quando `cacheTemJogosAoVivo === true`. Verificar `jogos-ao-vivo-routes.js` |
| LV-03 | Projecao financeira ativa | `projecaoFinanceiraController` deve retornar dados reais (TTL 2min) quando mercado fechado. Se mercado aberto retorna `{ projecao: false }` |
| LV-04 | Invalidacao de ranking/top10 apos parciais | `parciaisRankingService` deve chamar invalidacao de `RankingGeralCache` + `Top10Cache` apos atualizar parciais |
| LV-05 | OfflineCache ranking TTL 30min durante live | Verificar que frontend nao serve ranking stale por mais de 30min durante rodada ativa |

#### Mercado Aberto (Modo Estatico) — 3 checks

| ID | Check | Como Verificar |
|----|-------|----------------|
| LV-06 | `marketGate` TTL padrao 5min | Verificar que nao esta com TTL reduzido quando mercado aberto |
| LV-07 | Jogos ao vivo TTL 10min sem jogos | `cacheJogosDia` deve ser 10min quando nao ha jogos ao vivo |
| LV-08 | Projecao financeira desativada | Deve retornar `{ projecao: false }` quando mercado aberto |

#### Transicoes (2 checks)

| ID | Check | Como Verificar |
|----|-------|----------------|
| LV-09 | Transicao mercado abre→fecha detectada | `marketGate` com TTL 2min garante deteccao em ate 2min. Verificar logica |
| LV-10 | Transicao rodada fecha→consolida limpa caches | Verificar que `consolidacao` dispara invalidacao de ExtratoCache + RankingCache + Top10Cache + PontosCorridosCache + MataMataCache |

---

## Problemas Conhecidos (Baseline)

Estes sao os 10 problemas ja identificados na primeira auditoria. O sentinel deve verificar se foram corrigidos:

| # | ID Sentinel | Severidade | Descricao | Arquivo(s) |
|---|-------------|------------|-----------|------------|
| 1 | SW-02/SW-03 | **CRITICO** | `CURRENT_SW_CACHE` em `app-version.js` referencia versao antiga (v22) enquanto SW esta em v25. Na atualizacao, o cache ativo e deletado como "obsoleto" | `service-worker.js:19`, `app-version.js:33,403` |
| 2 | MG-14 | HIGH | Zero TTL indexes nas 9 collections MongoDB de cache. Docs stale persistem indefinidamente | Todos `models/*Cache.js` |
| 3 | FE-07 | HIGH | Memory cache TTL (5min) > IndexedDB TTL (3min) em rodadas-cache. Dado stale promovido com timestamp fresco | `rodadas-cache.js:118-138` |
| 4 | MG-02/03/04 | MEDIUM | `RankingGeralCache`, `Top10Cache`, `PontosCorridosCache` acumulam docs por rodada sem auto-cleanup | Controllers respectivos |
| 5 | MG-12 | LOW | `deletarCacheMataMata` nao filtra por `temporada` — pode deletar doc de outra temporada | `mataMataCacheController.js:91-108` |
| 6 | -- | HIGH | Hardcoded `rodada_atual: 36` como fallback em `isRodadaConsolidada()` — marca tudo como consolidado se mercado nao carregou | `rodadas-cache.js:187` |
| 7 | -- | HIGH | Sem deduplicacao de requests em `jogos-ao-vivo` — stampede de API calls durante live | `jogos-ao-vivo-routes.js:721` |
| 8 | -- | MEDIUM | `getStatusMercado()` chamado sem import em `pontos-corridos-cache.js` | `pontos-corridos-cache.js:213` |
| 9 | -- | MEDIUM | Frontend IndexedDB/memory serve extrato stale ate 5min apos acerto financeiro admin | `cache-manager.js` + `extratoFinanceiroCacheController.js` |
| 10 | -- | LOW | Server restart gera nova versao → cache-bust espurio para todos usuarios | `appVersion.js:288-297` |

---

## Comportamento por Estado do Sistema

### Matriz de TTLs por Estado

```
                    | Mercado    | Mercado   | Rodada      | Temporada
                    | Aberto     | Fechado   | Consolidada | Encerrada
--------------------+------------+-----------+-------------+-----------
marketGate          | 5 min      | 2 min     | 5 min       | 5 min
jogos-ao-vivo       | 10 min     | 30 seg    | 10 min      | N/A
projecao financeira | OFF        | 2 min     | OFF         | OFF
ranking (IDB)       | 30 min     | 30 min    | 30 min      | 10 anos
extrato (IDB)       | 30 min     | 30 min    | 30 min      | 10 anos
rodadas (IDB)       | 1 hora     | 1 hora    | 30 dias*    | 10 anos
config (IDB)        | 24 horas   | 24 horas  | 24 horas    | 10 anos
ranking (MongoDB)   | Permanente | Invalidado| Permanente  | Permanente
extrato (MongoDB)   | Permanente | Valido    | Permanente  | Permanente

* Rodada fechada e < 36
```

### Dev vs Prod

**NAO ha diferenca de cache entre dev e prod.** O CLAUDE.md documenta:

> "Banco unico: `cartola-manager` (MongoDB Atlas) — mesmo banco para dev e prod. NODE_ENV diferencia apenas logs e labels, NAO o banco."

Todos os TTLs, estrategias e collections sao identicos. O sentinel deve:
1. Confirmar que nenhum `if (NODE_ENV === 'production')` altera comportamento de cache
2. Alertar se encontrar qualquer branching de cache por ambiente

---

## Formato do Relatorio

```markdown
# CACHE SENTINEL: Relatorio de Monitoramento

**Data:** DD/MM/YYYY HH:MM
**Modo:** --full | --mongo | --sw | --frontend | --live
**Estado do Sistema:** Mercado Aberto | Mercado Fechado | Consolidando | Pre-Temporada
**Temporada:** 2026

---

## Score Geral: XX/YY checks OK (ZZ%)

### Status por Camada

| Camada | Checks | OK | FALHA | Status |
|--------|--------|-----|-------|--------|
| MongoDB | 14 | 12 | 2 | ATENCAO |
| Service Worker | 8 | 8 | 0 | OK |
| Frontend (IDB+Memory) | 12 | 10 | 2 | ATENCAO |
| Live Experience | 10 | 10 | 0 | OK |

---

## Achados

### CRITICO (corrigir imediatamente)
[lista de achados criticos com ID, descricao, arquivo, linha, acao]

### ALTO (corrigir antes do proximo deploy)
[lista]

### MEDIO (corrigir no sprint)
[lista]

### BAIXO (backlog)
[lista]

---

## Problemas Conhecidos — Status de Correcao

| # | Baseline ID | Status | Observacao |
|---|-------------|--------|------------|
| 1 | SW-02/SW-03 | CORRIGIDO / PENDENTE | [detalhes] |
| 2 | MG-14 | CORRIGIDO / PENDENTE | [detalhes] |
...

---

## Recomendacoes Prioritarias

1. [Acao 1 — impacto + esforco]
2. [Acao 2 — impacto + esforco]
...
```

---

## Diferenca entre cache-sentinel e cache-auditor

| Aspecto | cache-auditor | cache-sentinel |
|---------|---------------|----------------|
| **Foco** | 3 ambientes (participante, admin web, admin mobile) | Apenas participante |
| **Profundidade** | Inventario + coerencia | Prevencao proativa + problemas conhecidos |
| **MongoDB** | Lista collections e indices | Vasculha dados reais, detecta orfaos, conta stale |
| **Live** | Nao tem modo especifico | Modo `--live` dedicado com checks de transicao |
| **Baseline** | Nao tem | 10 problemas conhecidos rastreados |
| **Dev/Prod** | Menciona paridade | Verifica ativamente branching por NODE_ENV |
| **Objetivo** | "Como esta o cache?" (diagnostico) | "Tem cache antigo prevalecendo?" (prevencao) |

### Quando usar cada um

- **cache-auditor**: Auditoria broad antes de release, cobrindo admin + participante
- **cache-sentinel**: Investigacao profunda quando participante reporta dado stale, antes de rodada ao vivo, apos deploy

### Uso combinado

```bash
# Pre-release completo:
/cache-sentinel --full          # Profundidade no participante
/cache-auditor CACHE-WEB --admin  # Cobertura no admin
```

---

## Ativacao por Keywords

| Tipo | Keywords |
|------|----------|
| **Primarias** | `cache stale`, `cache antigo`, `sentinel`, `cache participante`, `monitorar cache`, `cache prevalecendo`, `dado antigo no app` |
| **Frases PT-BR** | "cache antigo prevalecendo", "dado desatualizado no app", "participante vendo dado antigo", "cache nao ta limpando", "monitorar cache do app", "verificar se cache ta atualizado", "SW desatualizado", "IndexedDB stale", "cache sentinel", "vasculhar caches" |
| **Contexto** | Problemas de dados stale no app participante, pre-flight de rodada, pos-deploy |
| **NAO confundir** | Auditoria broad dos 3 ambientes → `cache-auditor`; Cache de backend puro → `db-guardian` |

---

## Invocacao

### Claude Code
```bash
/cache-sentinel --full
/cache-sentinel --mongo
/cache-sentinel --sw
/cache-sentinel --frontend
/cache-sentinel --live
```

### Outras IAs
```
Vasculhe os caches do app participante usando o Cache Sentinel skill.
Foco em detectar caches antigos prevalecendo.
```

**Requisito:** IA deve ter acesso a Read, Grep, Glob e opcionalmente Bash/MongoDB MCP.

---

**Versao:** 1.0.0
**Data de criacao:** 21/02/2026
**Autor:** Sistema Super Cartola Manager
**Complementa:** cache-auditor (04-project-specific)
