---
name: live-experience
description: Auditoria da experiência do participante durante rodadas ao vivo — parciais, rankings, cache, orquestrador
---

# SKILL: Live Experience Audit (Auditoria de Experiencia ao Vivo)

## Visao Geral

Skill especialista que audita a **experiencia completa do participante durante rodadas ao vivo** do Cartola FC. Valida que parciais, rankings, notificacoes, cache e orquestrador funcionam corretamente quando os jogos estao acontecendo.

**Filosofia:** A rodada ao vivo e o momento de maior engajamento dos participantes. Qualquer falha aqui (dados atrasados, parciais erradas, cache stale, pontuacoes desatualizadas) destroi a confianca no sistema. Esta skill garante que TUDO funcione perfeitamente durante esse momento critico.

---

## Objetivos

1. **Validar o fluxo completo** do ciclo de vida da rodada (mercado fecha -> live -> finaliza -> consolida)
2. **Garantir dados frescos** durante parciais (cache TTLs adequados, polling correto)
3. **Verificar experiencia mobile** (PWA participante durante jogos ao vivo)
4. **Auditar o orchestrator** (managers executando corretamente em cada fase)
5. **Prevenir regressoes** em modulos que dependem de dados live (Top10, Ranking, Parciais, Artilheiro, Luva, Capitao)
6. **Ser agnostico** (funciona com qualquer IA: Claude, GPT, Gemini, etc.)

---

## Arquitetura

```
docs/
  skills/04-project-specific/
    live-experience.md                  # Esta skill (orquestrador da auditoria)
  modules-registry.json                 # Catalogo de modulos (categoria "live")
  rules/
    audit-performance.md                # Checklist performance (reutilizado)
    audit-ui.md                         # Checklist UI/UX (reutilizado)
    audit-business.md                   # Checklist regras de negocio (reutilizado)

services/orchestrator/
  roundMarketOrchestrator.js            # Maquina de estados central
  managers/
    BaseManager.js                      # Classe base (hooks de ciclo de vida)
    ParciaisManager.js                  # Parciais ao vivo
    RodadaManager.js                    # Coleta de dados da rodada
    Top10Manager.js                     # Top 10 da rodada
    RankingGeralManager.js              # Ranking geral
    ArtilheiroManager.js                # Artilheiro Campeao (gols live)
    LuvaOuroManager.js                  # Luva de Ouro (defesas live)
    CapitaoManager.js                   # Capitao de Luxo (capitao live)
    ExtratoManager.js                   # Extrato financeiro pos-rodada
    MataMataManager.js                  # Mata-mata
    PontosCorridosManager.js            # Pontos corridos
    MelhorMesManager.js                 # Melhor mes
    HistoricoManager.js                 # Historico de rodadas
    TurnoManager.js                     # Controle de turnos
    TiroCertoManager.js                 # Tiro Certo (planejado)
    RestaUmManager.js                   # Resta Um (planejado)
```

---

## Contexto: Ciclo de Vida da Rodada

### Estados do Mercado Cartola FC

| Status | Codigo | Significado |
|--------|--------|-------------|
| ABERTO | 1 | Mercado liberado para escalacao |
| FECHADO | 2 | Rodada em andamento (jogos acontecendo) |
| DESBLOQUEADO | 3 | Desbloqueio parcial |
| ENCERRADO | 4 | Rodada finalizou, aguardando mercado abrir |
| FUTURO | 5 | Rodada futura |
| TEMPORADA_ENCERRADA | 6 | Brasileirao acabou |

### Ciclo Normal
```
ABERTO(1) --> FECHADO(2) --> [LIVE UPDATES] --> ENCERRADO(4) --> ABERTO(1)
```

### Fases da Rodada no Orchestrator
```
aguardando --> coletando_dados --> atualizando_live --> finalizando --> consolidando --> concluida
```

### Hooks dos Managers (BaseManager)
```
onMarketOpen()     --> Mercado abriu (limpar estados temporarios)
onMarketClose()    --> Mercado fechou (iniciar coleta de dados)
onLiveUpdate()     --> Atualizacao durante rodada ativa (parciais)
onRoundFinalize()  --> Rodada finalizou (calcular rankings)
onConsolidate()    --> Pos-finalizacao (lancamentos financeiros, snapshots)
onPreSeason()      --> Pre-temporada detectada
```

---

## Como Usar

### Sintaxe

```bash
# Auditoria completa (todas as dimensoes)
/live-experience

# Auditoria especifica por dimensao
/live-experience --orchestrator
/live-experience --parciais
/live-experience --cache
/live-experience --frontend
/live-experience --managers

# Auditoria de um manager especifico
/live-experience --manager artilheiro
/live-experience --manager parciais

# Modo simulacao (simula transicao de estados)
/live-experience --simulate market-close
/live-experience --simulate live-update
/live-experience --simulate round-finalize

# Gerar relatorio detalhado
/live-experience --report
```

### Exemplos Praticos

```bash
# Antes de uma rodada (pre-flight check)
/live-experience --preflight

# Durante debug de parciais
/live-experience --parciais --cache

# Apos implementar novo manager
/live-experience --managers --orchestrator

# Auditoria completa pre-release
/live-experience --report
```

---

## Dimensoes de Auditoria

### 1. Orchestrator (Maquina de Estados)
**Severidade:** CRITICA

### 2. Managers (Gerentes de Modulo)
**Severidade:** CRITICA

### 3. Parciais ao Vivo (Dados Real-Time)
**Severidade:** CRITICA

### 4. Cache durante Live (Frescor dos Dados)
**Severidade:** ALTA

### 5. Frontend Participante (Experiencia Mobile)
**Severidade:** ALTA

### 6. Consolidacao Pos-Rodada
**Severidade:** CRITICA

---

## Checklists de Auditoria

### Dimensao 1: Orchestrator - Maquina de Estados (12 checks)

#### Transicoes de Estado (4 checks)
1. **ORC-01** Verificar que `MARKET_STATUS` mapeia todos os estados (1=ABERTO, 2=FECHADO, 3=DESBLOQUEADO, 4=ENCERRADO, 5=FUTURO, 6=TEMPORADA_ENCERRADA)
2. **ORC-02** Validar que a transicao ABERTO->FECHADO dispara `onMarketClose()` em TODOS os managers habilitados
3. **ORC-03** Validar que a transicao FECHADO->ENCERRADO/ABERTO dispara `onRoundFinalize()` e depois `onConsolidate()`
4. **ORC-04** Verificar que transicoes invalidas sao ignoradas (ex: ABERTO->ENCERRADO sem FECHADO)

#### Polling e Timers (4 checks)
5. **ORC-05** Verificar intervalos de polling: mercado aberto = 5min (`POLL_MERCADO_ABERTO`), rodada ativa = 2min (`POLL_RODADA_ATIVA`), live update = 3min (`POLL_LIVE_UPDATE`)
6. **ORC-06** Validar que o polling ajusta frequencia conforme estado (nao pollar a 2min quando mercado esta aberto)
7. **ORC-07** Verificar que erros de polling NAO interrompem o ciclo (retry com backoff)
8. **ORC-08** Verificar cleanup de timers ao mudar de estado (evitar polling duplicado)

#### Persistencia e Multi-Liga (4 checks)
9. **ORC-09** Verificar que `OrchestratorState` persiste no MongoDB entre restarts do servidor
10. **ORC-10** Verificar que o orchestrator itera por TODAS as ligas ativas (`Liga.find`)
11. **ORC-11** Verificar que cada liga tem seu proprio estado independente
12. **ORC-12** Verificar que `CURRENT_SEASON` esta correto e alinhado com a API Cartola

---

### Dimensao 2: Managers - Ciclo de Vida (16 checks)

#### Registry e Ativacao (4 checks)
13. **MGR-01** Verificar que `managers/index.js` registra TODOS os managers existentes
14. **MGR-02** Verificar que cada manager tem `id`, `nome`, `moduloKey`, `prioridade` configurados
15. **MGR-03** Verificar que `isEnabled(liga)` respeita `liga.modulos_ativos` e `liga.configuracoes.{modulo}.habilitado`
16. **MGR-04** Verificar que managers com `sempreAtivo: true` executam independente de config (RodadaManager, ExtratoManager, etc.)

#### Dependencias e Ordem (4 checks)
17. **MGR-05** Verificar que `dependencias` de cada manager sao respeitadas (ex: Top10 depende de RodadaManager)
18. **MGR-06** Verificar que `prioridade` determina ordem de execucao (menor = primeiro)
19. **MGR-07** Verificar que NAO existem dependencias circulares entre managers
20. **MGR-08** Verificar que managers financeiros (`temFinanceiro: true`) executam APOS managers de dados

#### Hooks Implementados (4 checks)
21. **MGR-09** Para cada manager: listar quais hooks estao implementados (onMarketOpen, onMarketClose, onLiveUpdate, onRoundFinalize, onConsolidate)
22. **MGR-10** Verificar que managers com `temColeta: true` implementam `onLiveUpdate()`
23. **MGR-11** Verificar que managers financeiros implementam `onConsolidate()`
24. **MGR-12** Verificar que NENHUM manager faz operacao financeira em `onLiveUpdate()` (apenas em onConsolidate)

#### Error Handling (4 checks)
25. **MGR-13** Verificar que `executarHook()` do BaseManager faz try/catch em todos os hooks
26. **MGR-14** Verificar que erro em um manager NAO interrompe execucao dos demais
27. **MGR-15** Verificar que erros sao persistidos via `_atualizarStatusDB('erro', error.message)`
28. **MGR-16** Verificar que existe log adequado para debug (`[ORCHESTRATOR] [managerId] hookName`)

---

### Dimensao 3: Parciais ao Vivo (14 checks)

#### API Cartola - Dados Live (4 checks)
29. **PAR-01** Verificar que endpoint `/api/mercado/status` retorna `status_mercado` atualizado
30. **PAR-02** Verificar que dados de parciais incluem: `pontos`, `scouts`, `entrou_em_campo`, `rodada_id`
31. **PAR-03** Verificar que a API do Cartola FC e consultada com frequencia adequada durante jogos (2-3 min)
32. **PAR-04** Verificar tratamento de erro quando API Cartola esta fora do ar (fallback/retry)

#### Calculo de Parciais (4 checks)
33. **PAR-05** Verificar que pontos parciais usam `truncarPontosNum()` (NUNCA arredondar)
34. **PAR-06** Verificar que capitao tem pontos multiplicados corretamente nas parciais
35. **PAR-07** Verificar que jogadores que ainda nao entraram em campo mostram 0 (nao null/undefined)
36. **PAR-08** Verificar que substituicoes (saiu de campo) sao tratadas corretamente

#### Ranking Parcial (3 checks)
37. **PAR-09** Verificar que ranking parcial e recalculado a cada live update
38. **PAR-10** Verificar que ranking parcial filtra apenas participantes ATIVOS da liga/temporada
39. **PAR-11** Verificar que posicoes do ranking sao consistentes (sem empates mal resolvidos)

#### Jogos do Dia (3 checks)
40. **PAR-12** Verificar integracao com API-Football para jogos ao vivo (fallback chain: API-Football -> SoccerDataAPI -> Cache Stale)
41. **PAR-13** Verificar que resultados dos jogos do Brasileirao (gols, status) sao exibidos durante live
42. **PAR-14** Verificar mapeamento de clubes API-Football -> IDs Cartola FC (`_NOMES_PARA_ID_CARTOLA`)

---

### Dimensao 4: Cache durante Live (12 checks)

#### TTLs durante Rodada Ativa (4 checks)
43. **CACHE-01** Verificar que TTLs de cache sao CURTOS durante rodada ativa (parciais: < 3min, ranking: < 5min)
44. **CACHE-02** Verificar que Service Worker NAO cacheia chamadas de API durante live (estrategia: NETWORK-ONLY para APIs)
45. **CACHE-03** Verificar que `CacheManager` respeita TTLs curtos para dados volateis durante jogos
46. **CACHE-04** Verificar que Module Caches (rodadas-cache, artilheiro-cache, luva-cache) tem TTLs adequados para live

#### Invalidacao durante Live (4 checks)
47. **CACHE-05** Verificar que `cache-invalidator.js` dispara invalidacao quando parciais sao atualizadas
48. **CACHE-06** Verificar que `CACHE_DEPENDENCIES` cobre o evento de live update (cascata completa)
49. **CACHE-07** Verificar que MongoDB caches (ranking, top10, extrato) sao invalidados apos cada ciclo live
50. **CACHE-08** Verificar que frontend recebe sinal de invalidacao (ou pollar com TTL curto)

#### Performance de Cache (4 checks)
51. **CACHE-09** Verificar que cache NAO cresce indefinidamente durante rodada (max entries, cleanup)
52. **CACHE-10** Verificar que `cleanExpired()` roda automaticamente entre ciclos de live update
53. **CACHE-11** Verificar que nao ha pattern N+1 (lista no cache, items buscados individualmente)
54. **CACHE-12** Estimar tamanho total de cache durante pico de live (stores x entries x tamanho medio)

---

### Dimensao 5: Frontend Participante - Experiencia Mobile (14 checks)

#### Tela de Parciais (4 checks)
55. **FE-01** Verificar que tela de parciais atualiza automaticamente (polling ou push, nao exigir refresh manual)
56. **FE-02** Verificar que indica visualmente quando dados estao atualizando (loading state, spinner, timestamp)
57. **FE-03** Verificar que mostra "Ultima atualizacao: HH:MM" para o participante saber a frescor
58. **FE-04** Verificar que pontuacao usa `truncarPontos()` (frontend) - NUNCA `.toFixed(2)` ou `Math.round()`

#### Estados Visuais Live (4 checks)
59. **FE-05** Verificar que existe indicador visual de "Rodada ao Vivo" (badge, animacao, cor diferente)
60. **FE-06** Verificar que jogadores em campo tem destaque visual diferente de quem esta no banco
61. **FE-07** Verificar que gols/assistencias/defesas tem feedback visual imediato (icon + animacao)
62. **FE-08** Verificar transicao suave entre estados (mercado aberto -> live -> finalizado)

#### Responsividade e Performance Mobile (3 checks)
63. **FE-09** Verificar que tela de parciais e performatica em mobile (sem jank, scroll suave)
64. **FE-10** Verificar que polling frontend nao drena bateria (intervalo razoavel, `visibilitychange` para pausar)
65. **FE-11** Verificar que funciona offline-first (mostra ultimo dado conhecido se perder conexao)

#### Navegacao SPA durante Live (3 checks)
66. **FE-12** Verificar que navegar entre telas NAO interrompe polling de parciais
67. **FE-13** Verificar que voltar para tela de parciais NAO duplica timers/intervals
68. **FE-14** Verificar padrao SPA init (NAO usar `DOMContentLoaded` sozinho, usar pattern `readyState`)

---

### Dimensao 6: Consolidacao Pos-Rodada (10 checks)

#### Deteccao de Finalizacao (3 checks)
69. **CON-01** Verificar que orchestrator detecta transicao FECHADO->ENCERRADO/ABERTO corretamente
70. **CON-02** Verificar que NAO consolida parciais como se fosse resultado final (aguardar status 4 ou 1)
71. **CON-03** Verificar que consolidacao e IDEMPOTENTE (rodar 2x nao duplica dados)

#### Ordem de Consolidacao (3 checks)
72. **CON-04** Verificar ordem: `onRoundFinalize()` de TODOS os managers -> `onConsolidate()` de TODOS
73. **CON-05** Verificar que managers de dados (Rodada, Ranking, Top10) finalizam ANTES de financeiros (Extrato)
74. **CON-06** Verificar que dependencias entre managers sao respeitadas na consolidacao

#### Dados Finais (4 checks)
75. **CON-07** Verificar que pontos finais usam `truncarPontosNum()` (backend)
76. **CON-08** Verificar que ranking final e salvo/cacheado no MongoDB (`rankinggeralcaches`, `top10caches`)
77. **CON-09** Verificar que lancamentos financeiros (se aplicavel) sao registrados no `extratofinanceiro`
78. **CON-10** Verificar que historico da rodada e persistido para consulta futura

---

## Formato do Relatorio de Saida

```markdown
# AUDITORIA LIVE EXPERIENCE

**Data:** DD/MM/AAAA HH:MM
**Score Geral:** XX/100
**Status:** EXCELENTE | BOM | ATENCAO | CRITICO

---

## Resumo por Dimensao

| Dimensao | Checks | Score | Status |
|----------|--------|-------|--------|
| Orchestrator | X/12 | XX% | Status |
| Managers | X/16 | XX% | Status |
| Parciais ao Vivo | X/14 | XX% | Status |
| Cache durante Live | X/12 | XX% | Status |
| Frontend Participante | X/14 | XX% | Status |
| Consolidacao | X/10 | XX% | Status |

---

## Achados

### CRITICO (X issues)

**[ORC-XX]** Descricao do problema
- Arquivo: caminho/arquivo.js
- Linha: XX
- Acao: Correcao sugerida

### ALTO (X issues)
...

### MEDIO (X issues)
...

---

## Inventario de Managers

| Manager | Hooks Implementados | Ativo | Prioridade | Dependencias |
|---------|-------------------|-------|-----------|--------------|
| RodadaManager | open, close, live, finalize | sempreAtivo | 10 | - |
| ParciaisManager | close, live, finalize | sempreAtivo | 15 | rodada |
| Top10Manager | finalize | condicional | 30 | rodada |
| ... | ... | ... | ... | ... |

---

## Mapa de Polling

| Contexto | Intervalo | Arquivo | Variavel |
|----------|-----------|---------|----------|
| Mercado Aberto (servidor) | 5min | roundMarketOrchestrator.js | POLL_MERCADO_ABERTO |
| Rodada Ativa (servidor) | 2min | roundMarketOrchestrator.js | POLL_RODADA_ATIVA |
| Live Update (servidor) | 3min | roundMarketOrchestrator.js | POLL_LIVE_UPDATE |
| Frontend Parciais | Xmin | parciais.js | POLLING_INTERVAL |
| Cache TTL Live | Xmin | *-cache.js | TTL |

---

## Acoes Recomendadas

**Prioridade CRITICA (corrigir antes da proxima rodada):**
1. [Acao 1]

**Prioridade ALTA (corrigir no sprint):**
2. [Acao 2]

**Prioridade MEDIA (backlog):**
3. [Acao 3]

---

**Auditoria realizada por:** [IA]
**Skill version:** 1.0.0
**Proxima auditoria recomendada:** Antes da proxima rodada
```

---

## Severidades

| Nivel | Criterio | Acao |
|-------|----------|------|
| CRITICO | Dados errados durante live, consolidacao duplicada, orchestrator travado | Corrigir ANTES da proxima rodada |
| ALTO | Cache stale durante live, polling com intervalo errado, UI sem feedback | Corrigir no sprint |
| MEDIO | Performance subotima, falta de indicadores visuais, logs insuficientes | Backlog |
| BAIXO | Otimizacoes de UX, sugestoes de melhoria, nice-to-have | Backlog distante |

---

## Quando Auditar

1. **Antes de cada rodada** (pre-flight) -- Garantir que orchestrator esta saudavel
2. **Apos implementar novo manager** -- Verificar integracao com ciclo de vida
3. **Apos alterar polling/cache** -- Validar TTLs e intervalos
4. **Apos bugs reportados durante live** -- Diagnosticar e prevenir regressao
5. **Antes de releases** -- Auditoria completa de todas as dimensoes
6. **Apos mudancas no frontend de parciais** -- Garantir UX live intacta

---

## Workflow de Auditoria

### Passo 1: Identificar Estado Atual
```bash
# Verificar estado do orchestrator
grep -r "MARKET_STATUS\|FASE_RODADA" services/orchestrator/roundMarketOrchestrator.js

# Verificar managers registrados
cat services/orchestrator/managers/index.js
```

### Passo 2: Inventariar Managers
```bash
# Listar todos os managers e seus hooks
for f in services/orchestrator/managers/*Manager.js; do
    echo "=== $(basename $f) ==="
    grep "async on" "$f"
done
```

### Passo 3: Verificar Cache TTLs
```bash
# Buscar TTLs em caches de modulos
grep -r "TTL\|ttl\|CACHE_DURATION\|maxAge" public/js/**/*cache*.js
```

### Passo 4: Verificar Frontend Live
```bash
# Buscar polling intervals no frontend
grep -r "setInterval\|polling\|POLL\|refresh" public/participante/js/ public/js/
```

### Passo 5: Gerar Relatorio
Compilar achados no formato padrao e salvar em `docs/auditorias/`.

---

## Relacao com Outras Skills

| Skill | Relacao |
|-------|---------|
| `auditor-module` | Audita modulos individuais; `live-experience` audita a INTERACAO entre eles durante live |
| `cache-auditor` | Audita infraestrutura de cache geral; `live-experience` foca em cache DURANTE rodada ativa |
| `ux-auditor-app` | Audita UX geral do app; `live-experience` foca na UX DURANTE jogos ao vivo |
| `code-inspector` | Auditoria de codigo generico; `live-experience` e especifica do fluxo live |

### Combinacoes Recomendadas
```
# Auditoria pre-release completa
/live-experience --report    # Experiencia live
/cache-auditor CACHE-APP --participante   # Cache do app
/ux-auditor-app              # UX geral
/auditor-module parciais     # Modulo parciais especifico
```

---

## Agnostico de IA

### Claude
```bash
/live-experience
/live-experience --orchestrator --managers
/live-experience --report
```

### Outras IAs
```
Audite a experiencia ao vivo do participante usando a skill live-experience
Foque na dimensao de parciais e cache durante rodada ativa
```

**Requisito:** IA deve ter acesso a Read, Grep, Glob e Bash para executar os checks.

---

## Metricas de Qualidade

### Score de Conformidade
```
Score = (Checks Passed / Total Checks) * 100
Total Checks = 78
```

**Benchmarks:**
- **90-100%** (70-78 checks): Excelente -- pronto para rodada ao vivo
- **70-89%** (55-69 checks): Bom -- revisar warnings antes da rodada
- **50-69%** (39-54 checks): Atencao -- corrigir antes de ir ao vivo
- **< 50%** (< 39 checks): Critico -- NAO ir ao vivo sem correcoes

---

**Ultima atualizacao:** 20/02/2026
**Versao:** 1.0.0
**Autor:** Sistema Super Cartola Manager
**Licenca:** Uso interno do projeto
