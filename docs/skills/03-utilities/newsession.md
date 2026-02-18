# Skill: newsession

Handover para nova sessao - carrega contexto do trabalho em andamento e instrui proximos passos.

---

## STATUS ATUAL: 2026 A PLENO VAPOR — INSCRICOES CORRIGIDAS

**Data:** 18/02/2026 (tarde)
**Ultima acao:** Fix bug inscricao 2026 — debitos faltantes inseridos + codigo corrigido + nao-renovantes inativos. Commit `5343052`.
**Sessao atual (tarde):** Auditoria inscricoes 2026: 6 participantes sem INSCRICAO_TEMPORADA no cache, bug `=== false` em controller/calculator, 3 nao-renovantes com `ativo=true` incorreto.
**Sessao 18/02/2026 (manha):** AUDIT-011..014 + Investigacao cache MM + AUDIT-001 Fase 3 + Auditoria sincronismo + Virada temporada
**Sessao 18/02/2026:** AUDIT-009 (mata-mata, 3 fixes) + AUDIT-010 (pontos corridos, 4 fixes)
**Sessao 17/02/2026:** AUDIT-006 (artilheiro, 12 fixes) + AUDIT-007 (capitao, 4 fixes) + AUDIT-008 (luva, 5 fixes) + Stitch simplificado
**Sessao 14/02/2026:** AUDIT-005: faixas dinamicas ranking, 3 bugs
**Sessao 13/02/2026:** AUDIT-004: 4 bugs ranking corrigidos + AUDIT-001/002/003 financeiras + cache stale resolvido

---

## AUDIT-011: MODULO TOP 10 (18/02/2026)

**Problema:** Auditoria completa do modulo Top 10 revelou score 82/100. Config com `ligas_habilitadas` hardcoded (Super Cartola + Sobral) e `temporada: 2025` stale. Financeiro per-liga hardcoded (deveria vir do ModuleConfig). Manager sem docs de stub.

### Fixes aplicados

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | `ligas_habilitadas` hardcoded + `temporada: 2025` stale | **CRITICAL** | `config/rules/top_10.json` | Removido ligas_habilitadas, removido temporada |
| 2 | Financeiro per-liga hardcoded (Super Cartola + Sobral) | **MODERATE** | `config/rules/top_10.json` | Substituido por valores_defaults de referencia |
| 3 | Top10Manager hooks sem `stub: true`, com console.logs | **MODERATE** | `services/orchestrator/managers/Top10Manager.js` | v1.1.0: JSDoc, `stub: true`, removidos console.logs |
| 4 | Config sem nota ModuleConfig | **LOW** | `config/rules/top_10.json` | Adicionada nota |

### O que ja estava correto

| Item | Detalhe |
|------|---------|
| `verificarAdmin` em POST/DELETE | Rotas protegidas |
| CURRENT_SEASON no backend | Importado de `config/seasons.js` |
| Config dinamica via wizard | Valores reais por liga do ModuleConfig |

### Resultado final
- **Score:** 82/100 → ~92/100
- **Commit:** `fd14c11`

---

## AUDIT-012: MODULO MELHOR MES (18/02/2026)

**Problema:** Auditoria completa do modulo Melhor Mes revelou score 78/100. Config com `ligas_habilitadas` hardcoded e `temporada: 2025` stale. Manager sem docs de stub. Fallback `|| 38` no core frontend.

### Fixes aplicados

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | `ligas_habilitadas` hardcoded + `temporada: 2025` stale | **CRITICAL** | `config/rules/melhor_mes.json` | Removido ligas_habilitadas, removido temporada |
| 2 | MelhorMesManager hooks sem `stub: true`, com console.logs | **MODERATE** | `services/orchestrator/managers/MelhorMesManager.js` | v1.1.0: JSDoc, `stub: true`, removidos console.logs, removido _estimarProximaRodadaMes |
| 3 | `mercadoStatus.rodada_final \|\| 38` hardcoded no core | **MODERATE** | `public/js/melhor-mes/melhor-mes-core.js` | v1.5: import `RODADA_FINAL_CAMPEONATO` de `season-config.js` |
| 4 | Config sem nota ModuleConfig | **LOW** | `config/rules/melhor_mes.json` | Adicionada nota |

### O que ja estava correto

| Item | Detalhe |
|------|---------|
| CURRENT_SEASON no backend | Model e Service importam de `config/seasons.js` |
| Pre-temporada no core v1.4 | Detecta se API retorna ano anterior |
| Segregacao temporal completa | Cache por liga/temporada |
| Sem rotas proprias de escrita expostas | Usa service interno |

### Resultado final
- **Score:** 78/100 → ~90/100
- **Commit:** `fd14c11`

---

## AUDIT-013: MODULO CAMPINHO (18/02/2026) — SEM FIXES

**Score:** 88/100. Modulo de visualizacao puro (participant-only). Consome dados existentes (Rodada, Cartola API, Data Lake). Sem Manager (correto), sem rotas de escrita, CSS usa tokens, offline fallback v2.1, XSS prevention. Nenhuma acao necessaria.

---

## AUDIT-014: MODULO DICAS PREMIUM (18/02/2026) — SEM FIXES

**Score:** 87/100. Modulo API-only stateless. Consulta Cartola API em tempo real. Auth propria (`verificarParticipantePremium`). Sem RODADA_FINAL hardcoded, sem temporada stale, zero debug logs. Nenhuma acao necessaria.

---

## AUDIT-010: MODULO PONTOS CORRIDOS (18/02/2026)

**Problema:** Auditoria completa do modulo pontos corridos revelou score 82/100. Duas rotas POST (cache e migracao) sem verificarAdmin — qualquer participante logado podia salvar cache ou executar migracao. Manager sem docs de stub, fallback hardcoded no orquestrador.

### Fixes aplicados (commit `ec2a48f`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | POST `/cache/:ligaId` e POST `/migrar/:ligaId` sem auth | **CRITICAL** | `routes/pontosCorridosCacheRoutes.js`, `routes/pontosCorridosMigracaoRoutes.js` | v1.1: `verificarAdmin` adicionado em ambas |
| 2 | PontosCorridosManager hooks sem `stub: true` | **MODERATE** | `services/orchestrator/managers/PontosCorridosManager.js` | v1.1.0: JSDoc completo, `stub: true`, removidos console.logs |
| 3 | `status.rodada_final \|\| 38` hardcoded no orquestrador | **MODERATE** | `public/js/pontos-corridos/pontos-corridos-orquestrador.js` | v3.3: import `RODADA_FINAL_CAMPEONATO` de `season-config.js` |
| 4 | Config sem nota ModuleConfig | **LOW** | `config/rules/pontos_corridos.json` | Adicionada nota |

### O que ja estava correto (nao precisou fix)

| Item | Detalhe |
|------|---------|
| Zero `ligas_habilitadas` no config | Usa ModuleConfig corretamente |
| Zero `temporada` stale | Sem campo hardcoded |
| `CURRENT_SEASON` no backend | Model e Controller importam de `config/seasons.js` |
| Validacao temporada nas rotas GET | Range 2020-2030 obrigatorio |
| Config dinamica via wizard | `buscarConfigSimplificada()` do ModuleConfig |
| Zero `[DEBUG-*]` em participante | Nenhum debug log |
| Segregacao temporal completa | Caches indexados por `{liga_id, rodada, temporada}` |
| 6 modulos frontend bem organizados | config, core, orquestrador, ui, cache, utils |

### Resultado final
- **Score:** 82/100 → ~93/100
- **Bug seguranca:** 2 rotas POST agora protegidas com verificarAdmin
- **Commit:** `ec2a48f`

---

## AUDIT-009: MODULO MATA-MATA (18/02/2026)

**Problema:** Auditoria completa do modulo mata-mata revelou score 91/100 — significativamente mais maduro que os outros 3 modulos auditados. Ja tinha verificarAdmin em todas rotas mutantes, rate limiter, validacao de input, CURRENT_SEASON no backend. Restavam: Manager sem docs de stub, fallbacks `= 38` hardcoded no orquestrador frontend, config sem nota ModuleConfig.

### Fixes aplicados (commit `21d8e5d`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | MataMataManager hooks sem `stub: true` e com console.logs | **MODERATE** | `services/orchestrator/managers/MataMataManager.js` | v1.1.0: JSDoc completo, `stub: true`, removidos console.logs |
| 2 | 4x fallback `= 38` hardcoded no orquestrador | **MODERATE** | `public/js/mata-mata/mata-mata-orquestrador.js` | v1.5: import `RODADA_FINAL_CAMPEONATO` de `season-config.js` |
| 3 | Config sem nota ModuleConfig | **LOW** | `config/rules/mata_mata.json` | Adicionada nota sobre habilitacao via ModuleConfig |

### O que ja estava correto (nao precisou fix)

| Item | Detalhe |
|------|---------|
| `verificarAdmin` em POST/DELETE | Todas rotas mutantes protegidas |
| Rate limiter escrita | 30 req/min por IP customizado |
| Validacao de params | `validarLigaIdParam` + `validarEdicaoParam` |
| `CURRENT_SEASON` no backend | Importado de `config/seasons.js` |
| Rota debug protegida | `verificarAdmin` ja presente |
| Zero `[DEBUG-*]` no participante | Nenhum debug log encontrado |
| Zero `ligas_habilitadas` no config | Usa ModuleConfig corretamente |
| Config JSON completo | Wizard, regras, calendario, financeiro — tudo estruturado |

### Resultado final
- **Score:** 91/100 → ~95/100
- **Modulo mais maduro** dos 4 auditados (artilheiro 70→90, capitao 80→92, luva 73→91, mata-mata 91→95)
- **Commit:** `21d8e5d`

---

## AUDIT-008: MODULO LUVA DE OURO (17/02/2026)

**Problema:** Auditoria completa do modulo luva de ouro revelou score 73/100. Config apontava para liga Sobral com temporada 2025 (stale), rota diagnostico sem auth, debug logs em producao, stubs sem documentacao.

### Fixes aplicados (commit `012ede2`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | Config: `ligas_habilitadas` Sobral + `temporada: 2025` + `restricao` | **CRITICAL** | `config/rules/luva_ouro.json` | Removido tudo, temporada→2026, nota ModuleConfig |
| 2 | LuvaOuroManager hooks sem `stub: true` | **HIGH** | `services/orchestrator/managers/LuvaOuroManager.js` | v1.1.0: JSDoc completo, `stub: true`, removidos 5 console.logs |
| 3 | `RODADA_FINAL = 38` hardcoded no admin UI | **HIGH** | `public/js/luva-de-ouro/luva-de-ouro-ui.js` | v4.2.0: import de `season-config.js` |
| 4 | 4x `[DEBUG-LUVA]` console.logs em producao | **MODERATE** | `participante-luva-ouro.js` | Removidos (~30 linhas debug) |
| 5 | Rota `diagnostico` sem auth | **MODERATE** | `routes/luva-de-ouro-routes.js` | v2.1: `verificarAdmin` adicionado |

### Issues reclassificados como nao-issues

| Issue | Motivo |
|-------|--------|
| `obterEstatisticas` stub | Feature gap, endpoint existe mas retorna placeholder (LOW) |
| `RODADA_FINAL = 38` em participante-luva-ouro.js | Padrao projeto, cross-dir import arriscado |

### Resultado final
- **Score:** 73/100 → ~91/100
- **Bug seguranca:** Rota diagnostico agora protegida com verificarAdmin
- **Commit:** `012ede2`

---

## AUDIT-007: MODULO CAPITAO DE LUXO (17/02/2026)

**Problema:** Auditoria completa do modulo capitao de luxo revelou score 80/100. ranking-live retornava dados errados (pontos totais em vez de pontos do capitao), config hardcoded, Manager sem documentacao de stubs.

### Fase 1 - Criticos (commit `6412d2b`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | `ligas_habilitadas` hardcoded no JSON | **CRITICAL** | `config/rules/capitao_luxo.json` | Removido (habilitacao via ModuleConfig no MongoDB) |
| 2 | `ranking-live` retornava pontos TOTAIS do time | **CRITICAL** | `controllers/capitaoController.js` | v1.1.0: reescrito com `buscarCapitaoRodada` + `pontuadosMap` em paralelo. Retorna pontos reais do capitao |

### Fase 2 - HIGH (commit `6b214c9`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 3 | CapitaoManager hooks sem `stub: true` | **HIGH** | `services/orchestrator/managers/CapitaoManager.js` | v1.1.0: JSDoc completo, `stub: true`, removidos 4 console.logs |
| 4 | `RODADA_FINAL: 38` hardcoded no admin JS | **HIGH** | `public/js/capitao-luxo.js` | v1.1.0: import de `season-config.js` |

### Issues reclassificados como nao-issues

| Issue | Motivo |
|-------|--------|
| Backend `\|\| 38` defaults (service/controller) | Safety nets razoaveis, padrao do projeto |
| Frontend `38` em participante-capitao.js | Padrao de outros modulos, cross-dir import arriscado |
| 402 linhas CSS inline em capitao.html | Convencao projeto: 12+ fronts participante usam inline CSS |
| console.logs estruturados | Todos com prefixo `[CAPITAO-*]`, production-ready |

### Resultado final
- **Score:** 80/100 → ~92/100
- **Bug funcional corrigido:** ranking-live agora mostra pontos reais do capitao
- **Commits:** `6412d2b`, `6b214c9`

---

## AUDIT-006: MODULO ARTILHEIRO CAMPEAO (17/02/2026)

**Problema:** Auditoria completa do modulo artilheiro revelou score 70/100. Dead code extensivo, bug de seguranca nas rotas, configs hardcoded.

### Fase 1 - Criticos (commit `68acaaf`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | `public/gols.js` importava controller inexistente | **CRITICAL** | `public/gols.js` | DELETADO (arquivo orfao) |
| 2 | Config hardcoded para liga Sobral (aposentada) + participantes fixos | **CRITICAL** | `config/rules/artilheiro.json` | Removido hardcodes, temporada 2025→2026, nota sobre ModuleConfig |
| 3 | ArtilheiroManager stubs sem documentacao (parecia broken) | **CRITICAL** | `services/orchestrator/managers/ArtilheiroManager.js` | v1.1.0: JSDoc completo, `stub: true` em todos hooks |

### Fase 2 - Significativos (commit `0824f17`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 4 | `golsService.js` dead code (556 linhas, zero imports) | **HIGH** | `services/golsService.js` | DELETADO |
| 5 | 6 sub-modulos orfaos em `public/js/artilheiro-campeao/` (~2.565 linhas) | **HIGH** | `public/js/artilheiro-campeao/` | DIRETORIO INTEIRO DELETADO |
| 6 | Rotas admin sem `verificarAdmin` (qualquer participante podia chamar) | **SECURITY** | `routes/artilheiro-campeao-routes.js` | v5.3: middleware aplicado em 4 rotas POST/DELETE |

**Nota:** `models/ArtilheiroCampeao.js` preservado - importado por `disputasService.js` e `rodadaContextoController.js`.

### Fase 3 - Menores (commit `900b38e`)

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 7 | 4x `console.log('[DEBUG-ARTILHEIRO]')` em producao | LOW | `participante-artilheiro.js` | Removidos (~30 linhas debug) |
| 8 | `gols-por-rodada.js` orfao (52 linhas, zero imports) | LOW | `public/js/gols-por-rodada.js` | DELETADO |
| 9 | `RODADA_FINAL: 38` hardcoded em artilheiro-campeao.js | LOW | `public/js/artilheiro-campeao.js` | v4.7.0: import de `season-config.js` |

### Issues reclassificados como nao-issues

| Issue | Motivo |
|-------|--------|
| `temporadaEncerrada: true` init | Feature implementada corretamente (15+ refs), nao bug |
| `assistencias` em artilheiro_def.json | Nao pertence ao modulo artilheiro, so ao modulo Jogos |
| `ESCUDOS_CLUBES` hardcoded no controller | Fallback intencional quando API nao retorna URL |
| Shared state (`_coletaAtiva`) | Correto para single-process Node.js |

### Resultado final
- **Score:** 70/100 → ~90/100
- **Dead code removido:** ~3.260 linhas em 9 arquivos deletados
- **Bug seguranca:** Auth corrigida em 4 rotas admin
- **Commits:** `68acaaf`, `0824f17`, `900b38e`

---

## Stitch Adapter simplificado (17/02/2026)

**Decisao:** Plan B (HTML manual) mantido. Plan A (MCP auto) e Plan C (Figma) descartados.
- Skill `stitch-adapter.md` v2.0 → v3.0 (modo manual unico)
- MCPs Stitch e Figma removidos de `settings.local.json`
- Commit `d6674b2`

---

## AUDIT-004: RANKING GERAL - R3 NAO APARECIA (13/02/2026)

**Problema:** Pontos da Rodada 3 nao somavam no Ranking Geral (Classificacao). Ranking da Rodada individual funcionava OK.

### Bugs encontrados e corrigidos

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | `reconsolidarTodosOsTurnos` sem filtro `temporada` | **CRITICAL** | `services/rankingTurnoService.js` | Adicionado param `temporada` na query e nas chamadas a `consolidarRankingTurno` |
| 2 | `rodadas_jogadas` excluia rodadas com pontos <= 0 | MODERATE | `services/rankingTurnoService.js` | Removido `&& pontos > 0` da condicao |
| 3 | Snapshot stale "consolidado" nao reconsolidava apos repopulacao | **HIGH** | `services/rankingTurnoService.js` | Deletar snapshot stale (`RankingTurno.deleteOne`) em vez de so mudar status |
| 4 | `popularRodadas` usava `Time.ativo` (global) em vez de `Liga.participantes[].ativo` (per-league) | MODERATE | `controllers/rodadaController.js` | Criado `participantesMap` de `liga.participantes` como fonte primaria |

### Root cause detalhado

**Bug 1 (CRITICAL):** `reconsolidarTodosOsTurnos` buscava `Rodada.findOne({ ligaId })` SEM temporada. Encontrava R38 de 2025, calculava `rodadaAtualGeral = 38 >= fim (38)` e marcava snapshot como "consolidado". Snapshot consolidado = imutavel = R3 de 2026 nunca era incluida.

**Bug 3 (HIGH):** Mesmo apos fix do Bug 1, quando snapshot stale era detectado (consolidado com `rodadaAtual < fim`), o codigo so mudava status para "em_andamento". Mas `precisaConsolidar` checava `snapshot.rodada_atual < rodadaAtual` → se ambos = 3, nao reconsolidava. Fix: deletar snapshot stale para forcar `!snapshot = true`.

**Bug 4 (Data quality):** `totalParticipantesAtivos: 1` nos registros da R3. Causado por `Time.ativo = false` para 34/35 times no momento da populacao (provavel acao bulk de inativar via inscricoes). `obterRodadas` GET recalcula on-the-fly (self-healing) mas dados stored ficavam errados.

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `services/rankingTurnoService.js` | Bug 1: filtro temporada em `reconsolidarTodosOsTurnos`. Bug 2: `rodadas_jogadas` fix. Bug 3: deleteOne snapshot stale |
| `controllers/rodadaController.js` | Bug 4: `participantesMap` de `Liga.participantes` como fonte de `ativo` |

### Acao manual pendente

- ~~**Repopular R3** via painel admin com `repopular: true`~~ ✅ FEITO (14/02)
- ~~**Reconsolidar ranking**~~ ✅ FEITO (auto-reconsolidacao apos repopulacao)
- ~~**Deploy** das mudancas~~ ✅ DEPLOYED (commits 213012d, 5c52818 "Published your App")

---

## AUDIT-005: FAIXAS DINAMICAS RANKING (14/02/2026)

**Problema:** Ranking da rodada exibia faixas financeiras (MITO/G2-G11/Z1-Z11/MICO) e valores hardcoded para 32 times, ignorando a configuracao do wizard (`gerenciar-modulos.html`). Liga com menos participantes via valores errados.

### Bugs encontrados e corrigidos

| # | Bug | Severidade | Arquivo | Fix |
|---|-----|-----------|---------|-----|
| 1 | `rodadas-ui.js` usava `getBancoPorRodada` (sync/hardcoded) ignorando config do wizard | **HIGH** | `public/js/rodadas/rodadas-ui.js` | Migrado para `getBancoPorRodadaAsync` + `getFaixasPorRodadaAsync` com cache `preCarregarConfigRodada()` |
| 2 | `getPosLabel` hardcoded por liga (32 times SuperCartola, 6/4 Sobral) | **HIGH** | `public/js/rodadas/rodadas-ui.js` | Reescrita para usar faixas dinamicas do servidor, fallback hardcoded |
| 3 | `buscarConfiguracoes` retornava `liga.times.length` em vez de config do wizard | MODERATE | `controllers/ligaController.js` | Prioriza `config.ranking_rodada.total_participantes` sobre `liga.times.length` |

### Root cause

O wizard de modulos (`gerenciar-modulos.html`) salvava corretamente no `ModuleConfig` e propagava para `liga.configuracoes.ranking_rodada` via `propagarRankingRodadaParaLiga()`. Porem o frontend (`rodadas-ui.js`) NUNCA consumia esses dados — usava funcoes sync com valores hardcoded. O endpoint `buscarConfiguracoes` tambem retornava `total_participantes` errado (contagem bruta de times em vez do valor configurado).

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `public/js/rodadas/rodadas-ui.js` | Bug 1+2: imports async, `preCarregarConfigRodada()` com cache, `getPosLabel` dinamico, `exibirRanking`/`exibirRankingParciais` agora async |
| `public/js/rodadas/rodadas-orquestrador.js` | Added `await` nas chamadas a `exibirRanking` (agora async) |
| `controllers/ligaController.js` | Bug 3: `total_participantes` prioriza config wizard L1189 |

### Deploy
- Commit `9564750` - fix(rodadas): usar configs dinamicas do wizard
- Pushed e deployado em 14/02/2026

---

## RESULTADO DA AUDITORIA AUDIT-002 (12/02/2026)

### Frontend (participante-extrato-ui.js) - 10/10 PASS

| Item | Status |
|------|--------|
| Pontos Corridos = indigo (`--app-indigo` #6366f1) | PASS L386 |
| Mata-Mata = vermelho (`--app-danger` #ef4444) | PASS L387 |
| Top10 = amarelo (`--app-warning` #eab308) | PASS L391 |
| Banco/posicao = roxo (`--app-pos-tec` #a855f7) | PASS L383 |
| MITO = dourado (`--app-gold` #ffd700) | PASS L383 |
| MICO = vermelho (`--app-danger` #ef4444) | PASS L383 |
| Labels descritivos (Bonus/Onus posicao, MITO/MICO da Rodada) | PASS L379-382 |
| Expand universal (`subitems.length > 0`) | PASS L396 |
| Contagem modulos (filtra `icon !== 'casino'`) | PASS L395 |
| Posicao como titulo (`Xo lugar`) | PASS L454 |

### Backend - OK com ressalvas

| Item | Status |
|------|--------|
| Owner/premium isento inscricao (Paulinett 13935277) | PASS (dual mechanism) |
| Nao-premium COM debito inscricao | PASS (Felipe Barbosa, Felipe Jokstay) |
| Fix `lancamentosIniciais` na API | PASS (aplicado L961 e L1583) |
| fluxoFinanceiroController v8.12.0 | PASS |

### Reconciliacao Financeira - BUG ENCONTRADO

| Participante | Saldo Cache | Soma Real | Delta | Causa |
|---|---|---|---|---|
| China Guardiola | R$248,54 | R$243,54 | -R$5 | Cache stale |
| Diego Barbosa | R$20,00 | R$25,00 | +R$5 | Cache stale |
| Felipe Barbosa | R$15,00 | R$20,00 | +R$5 | Cache stale |
| Paulinett Miranda | R$-27,00 | R$-32,00 | -R$5 | Cache stale |
| Daniel Barbosa (Sobral 2025) | R$183,00 | R$183,00 | 0 | OK |
| Matheus Coutinho (Sobral 2025) | R$-63,00 | R$-63,00 | 0 | OK |

**Multi-liga:** Extratos independentes confirmados (Paulinett tem 4 registros em 3 ligas/2 temporadas).

---

## ~~BUG SISTEMATICO: Cache Stale~~ ✅ RESOLVIDO (13/02/2026)

**Status:** RESOLVIDO
**Investigacao:** Ambos code paths (Path A L835-841, Path B L1285-1291) JA recalculam ganhos/perdas corretamente.
**Root cause real:** Caches criados antes das fixes v8.9/v8.11/v8.12 tinham saldo_consolidado divergente.

**Resolucao:**
1. Fix script reconciliacao: `t.saldo` → `t.valor` (campo correto para format 2026)
2. Enhanced: --force agora tambem corrige ganhos_consolidados e perdas_consolidadas
3. Executado `--force --temporada=2026`: 15/15 saldos corrigidos
4. Verificado `--dry-run --temporada=2026`: 43/43 corretos, ZERO divergencias

**Padroes encontrados:** Delta ±R$5 (PC, 10 casos) e delta ~R$175-185 (inscricao, 5 casos)

---

## OUTROS PENDENTES

### ~~Stitch MCP~~ DESCARTADO (2026-02-17) ✅
- MCP Stitch e Figma removidos. Skill stitch-adapter v3.0 opera em modo manual (HTML colado).

### ~~Auditoria Modulo Artilheiro~~ ✅ AUDIT-006 COMPLETO (2026-02-17)
- 3 criticos + 6 significativos + 3 menores corrigidos
- ~3.260 linhas dead code removidas, 1 bug seguranca (auth rotas), configs hardcoded limpos

### ~~Trabalho nao commitado (encontrado 12/02)~~ ✅ Resolvido
- 4/5 arquivos ja commitados (verificado 13/02)
- `public/dashboard-analytics.html` nao existe (removido ou nunca criado)

### AUDIT-001 (Extrato V2 Admin) - Fase 3 CODE pendente
- PRD e SPEC prontos em `.claude/docs/`
- Fix `lancamentosIniciais` ja aplicado (era o bug critico)
- Restam: footer actions (CSS pronto, HTML nao gerado), dark mode OLED parcial, sparkline nao implementado
- Estes sao cosmeticos/baixa prioridade

---

## ARQUIVOS CRITICOS

| Arquivo | Papel | Status |
|---------|-------|--------|
| `utils/saldo-calculator.js` | FONTE DA VERDADE financeira | FIXADO (`!= false` → `=== true`, linhas 158+287) |
| `routes/tesouraria-routes.js` | 4 endpoints financeiros | FIXADO v3.3 |
| `controllers/fluxoFinanceiroController.js` | Calculo real-time | v8.12.0 OK |
| `controllers/extratoFinanceiroCacheController.js` | Cache + funcoes compartilhadas | v6.9 (lancamentosIniciais fix aplicado) |
| `controllers/ligaController.js` | buscarConfiguracoes + CRUD liga | FIXADO (total_participantes dinamico) |
| `public/js/rodadas/rodadas-ui.js` | Render ranking rodada + faixas financeiras | FIXADO (async dinamico, AUDIT-005) |
| `public/js/rodadas/rodadas-config.js` | Config sync/async faixas e valores | Correto (fonte das funcoes async) |
| `public/js/rodadas/rodadas-orquestrador.js` | Orquestracao fluxo rodadas | FIXADO (awaits adicionados) |
| `public/participante/js/modules/participante-extrato-ui.js` | Render extrato app | v11.0 AUDITADO OK |
| `public/participante/css/_app-tokens.css` | Tokens CSS cores | Correto |
| `scripts/auditoria-financeira-completa.js` | Script auditoria completa | Correto v1.1 |
| `controllers/artilheiroCampeaoController.js` | Controller artilheiro (1297 linhas) | v5.2.0 AUDITADO OK |
| `routes/artilheiro-campeao-routes.js` | Rotas artilheiro com verificarAdmin | FIXADO v5.3 (AUDIT-006) |
| `public/js/artilheiro-campeao.js` | Admin UI artilheiro | v4.7.0 (RODADA_FINAL centralizado) |
| `config/rules/artilheiro.json` | Regras artilheiro | LIMPO (sem hardcodes, temporada 2026) |
| `controllers/capitaoController.js` | Controller capitao de luxo | v1.1.0 (ranking-live corrigido, AUDIT-007) |
| `services/capitaoService.js` | Service capitao (API Cartola) | OK |
| `public/js/capitao-luxo.js` | Admin UI capitao | v1.1.0 (RODADA_FINAL centralizado) |
| `config/rules/capitao_luxo.json` | Regras capitao | LIMPO (sem ligas_habilitadas hardcoded) |
| `controllers/luvaDeOuroController.js` | Controller luva de ouro | v3.0.0 SaaS OK |
| `services/goleirosService.js` | Service goleiros (API Cartola) | v3.0.0 OK |
| `routes/luva-de-ouro-routes.js` | Rotas luva com verificarAdmin | FIXADO v2.1 (diagnostico auth, AUDIT-008) |
| `config/rules/luva_ouro.json` | Regras luva | LIMPO (sem hardcodes, temporada 2026) |
| `routes/mataMataCacheRoutes.js` | Rotas mata-mata cache CRUD | OK (verificarAdmin, rate limiter, validacao) |
| `public/js/mata-mata/mata-mata-orquestrador.js` | Orquestrador frontend mata-mata | v1.5 (RODADA_FINAL centralizado, AUDIT-009) |
| `config/rules/mata_mata.json` | Regras mata-mata | LIMPO (nota ModuleConfig, AUDIT-009) |
| `routes/pontosCorridosCacheRoutes.js` | Rotas PC cache + config | FIXADO v1.1 (verificarAdmin POST, AUDIT-010) |
| `routes/pontosCorridosMigracaoRoutes.js` | Rota migracao PC | FIXADO v1.1 (verificarAdmin POST, AUDIT-010) |
| `public/js/pontos-corridos/pontos-corridos-orquestrador.js` | Orquestrador frontend PC | v3.3 (RODADA_FINAL centralizado, AUDIT-010) |
| `config/rules/pontos_corridos.json` | Regras pontos corridos | LIMPO (nota ModuleConfig, AUDIT-010) |
| `config/rules/top_10.json` | Regras top 10 | LIMPO (sem hardcodes, nota ModuleConfig, AUDIT-011) |
| `config/rules/melhor_mes.json` | Regras melhor mes | LIMPO (sem hardcodes, nota ModuleConfig, AUDIT-012) |
| `public/js/melhor-mes/melhor-mes-core.js` | Core business logic melhor mes | v1.5 (RODADA_FINAL centralizado, AUDIT-012) |

---

## DADOS DE REFERENCIA

**Liga principal:** Super Cartola 2026
- Liga ID: `684cb1c8af923da7c7df51de`
- Inscricao: R$ 180,00
- Owner: Paulinett Miranda (time_id: 13935277, premium: true)

**Liga secundaria:** Cartoleiros do Sobral
- Liga ID: `684d821cf1a7ae16d1f89572`
- Sem caches 2026 ainda

**Como rodar auditoria:**
```bash
node scripts/auditoria-financeira-completa.js --dry-run
node scripts/auditoria-financeira-completa.js --dry-run --liga=684cb1c8af923da7c7df51de
node scripts/auditoria-financeira-completa.js --dry-run --temporada=2025
```

---

**PROXIMA SESSAO:**

### ~~🔴 PRIORIDADE 1 - Invalidar cache MATA_MATA~~ ✅ RESOLVIDO (18/02/2026)

**Investigacao:** Nao havia caches de 2026 para invalidar. Todos os 38 caches sao de 2025 e estao balanceados (mataMata = R$0 liquido para Paullinett). O codigo fix `5cbf001` ja resolveu o calculo ao vivo.
**Nota tecnica:** Script `invalidar-cache-mata-mata.js` tinha bug (buscava `tipo: 'MATA_MATA'` mas o schema usa campo `mataMata` numerico) — irrelevante pois nao ha caches a invalidar.

### Pendencias resolvidas (historico)
1. ~~Investigar e corrigir bug cache stale financeiro~~ ✅ RESOLVIDO
2. ~~Rodar script reconciliacao~~ ✅ EXECUTADO (15/15 corrigidos)
3. ~~Decidir sobre trabalho nao commitado~~ ✅ Resolvido
4. ~~Auditoria Ranking Geral (R3 nao aparecia)~~ ✅ AUDIT-004 (4 bugs)
5. ~~Deploy dos fixes do ranking~~ ✅ DEPLOYED
6. ~~Repopular R3 + reconsolidar ranking~~ ✅ FEITO via painel admin (14/02)
7. ~~Commitar todos os fixes pendentes~~ ✅ Tudo commitado
8. ~~Auditoria faixas ranking (valores errados)~~ ✅ AUDIT-005 (3 bugs, commit 9564750)
9. ~~Simplificar FASE 6 skill git-commit-push~~ ✅ FEITO (commit b4e9c88)
10. ~~Stitch simplificado para modo manual~~ ✅ FEITO (commit d6674b2)
11. ~~Auditoria modulo artilheiro~~ ✅ AUDIT-006 (12 fixes, 3 commits)
12. ~~Auditoria modulo capitao de luxo~~ ✅ AUDIT-007 (4 fixes, 2 commits)
13. ~~Auditoria modulo luva de ouro~~ ✅ AUDIT-008 (5 fixes, 1 commit)
14. ~~Auditoria modulo mata-mata~~ ✅ AUDIT-009 (3 fixes, 1 commit)
15. ~~Auditoria modulo pontos corridos~~ ✅ AUDIT-010 (4 fixes, 1 commit)
16. ~~Auditoria modulo top 10~~ ✅ AUDIT-011 (4 fixes)
17. ~~Auditoria modulo melhor mes~~ ✅ AUDIT-012 (4 fixes)
18. ~~Auditoria modulo campinho~~ ✅ AUDIT-013 (0 fixes — modulo de visualizacao)
19. ~~Auditoria modulo dicas~~ ✅ AUDIT-014 (0 fixes — modulo API stateless)
20. ~~Invalidar cache Mata-Mata~~ ✅ RESOLVIDO (nao havia caches 2026)
21. ~~Verificar temporada 2025 caches~~ ✅ RESOLVIDO (49 auditados, 0 divergencias)
22. ~~AUDIT-001 Fase 3~~ ✅ RESOLVIDO (Fix A1 ja estava aplicado; CSS dead code -14 linhas)
23. ~~Auditoria sincronismo 2025/2026~~ ✅ RESOLVIDO (commit `8323eab`)
24. ~~Consolidacao banco unico~~ ✅ RESOLVIDO (commit `84ce387`, MONGO_URI_DEV deletada)
25. ~~Fix bug inscricao 2026 (6 debitos faltantes + codigo)~~ ✅ RESOLVIDO (commit `5343052`)
26. ~~3 nao-renovantes com times.ativo=true incorreto~~ ✅ RESOLVIDO (update direto no banco)

---

## TEMPORADA 2026 — ESTADO REAL DO BANCO (18/02/2026)

**IMPORTANTE:** Esta sessao descobriu que havia 2 bancos MongoDB. Os fixes de DB da sessao anterior rodaram no banco ORFAO (`cartola-manager-dev`). O banco real do app e scripts agora e exclusivamente `cartola-manager`.

### Banco real: cartola-manager (producao)

| Collection | 2025 | 2026 | Observacao |
|-----------|------|------|------------|
| ligas | 1 (Sobral) | 1 (Super Cartola) | nome "Super Cartola 2026" ✅ |
| rodadas | 1438 (R1..R38) | 141 (R1=49, R2=49, R3=43) | R4 em andamento |
| extratofinanceirocaches | 38 | 43 | Caches 2026 existem |
| inscricoestemporada | 0 | 46 | Sistema de inscricao em uso |
| acertofinanceiros | 25 | 5 | Pagamentos registrados |
| times | 2 | 42 | 35 participantes ativos |
| rankingturnos | 4 | 5 | 0 sem temporada (ok) |

**Liga producao:** `temporada:2026`, `participantes:35`, `times:35`, `nome:"Super Cartola 2026"` ✅
**Rodada atual Cartola:** R4 (mercado_status:1 aberto, fechamento 25/02/2026 18:59)
**Inscricoes 2026:** 46 docs — 38 Super Cartola + 8 Os Fuleros. Todos os debitos corretos ✅

### Setup 2026 ja executado (confirmado no banco real)

✅ Participantes: 35 na liga (32 renovados + 3 novatos)
✅ Financeiro: renovacoes processadas via Tesouraria + acertos manuais
✅ Rodadas: R1, R2, R3 populadas e consolidadas
✅ Inscricoes: 46 docs InscricaoTemporada 2026

### Banco orfao descontinuado

- `cartola-manager-dev` — dados travados em dez/2025 (nao reflete realidade)
- `MONGO_URI_DEV` deletada dos Replit Secrets pelo admin (18/02/2026)
- Scripts que rodaram nele esta sessao (`backfill`, `virada`) eram no orfao — sem impacto (producao ja estava correta)

## FIX INSCRICAO 2026 — EXECUTADO (18/02/2026 tarde)

### Problema raiz
`criarTransacoesIniciais` usava `ObjectId` para `liga_id` na query de `extratofinanceirocaches`, mas caches existentes armazenam `liga_id` como **String**. O `updateOne` nao encontrava o doc existente, o debito nunca era inserido.

Bug secundario: `=== false` em `inscricoesController.js:74` e `!= false` em `saldo-calculator.js:158,287` falham silenciosamente quando `pagou_inscricao` e `undefined`.

### DB corrigido diretamente

| Participante | Liga | Taxa | Acao |
|---|---|---|---|
| Paulinett Miranda (13935277) | Os Fuleros | -R$100 | INSCRICAO_TEMPORADA inserida |
| Pade Papito (9232824) | Os Fuleros | -R$100 | INSCRICAO_TEMPORADA inserida |
| jhones Prado (25330294) | Os Fuleros | -R$100 | INSCRICAO_TEMPORADA inserida |
| bruno (4223845) | Os Fuleros | -R$100 | INSCRICAO_TEMPORADA inserida |
| Thyago Martins (4021507) | Os Fuleros | -R$100 | INSCRICAO_TEMPORADA inserida |
| Lucas Sousa (476869) | Super Cartola | -R$180 | INSCRICAO_TEMPORADA inserida |
| Emerson (22623329) | Super Cartola | — | `times.ativo` false (nao renovou) |
| JB Oliveira (164131) | Super Cartola | — | `times.ativo` false (nao renovou) |
| Wildemar Silva (1233737) | Super Cartola | — | `times.ativo` false (nao renovou) |

### Codigo corrigido — commit `5343052`

| Arquivo | Fix |
|---------|-----|
| `controllers/inscricoesController.js` | `=== false` → `!== true`; liga_id como String (nao ObjectId); `perdas_consolidadas` adicionado ao `$inc` |
| `utils/saldo-calculator.js` | `!= false` → `=== true` em 2 pontos (linhas 158 e 287) |
| `scripts/fix-inscricao-pendente-2026.js` | Script que aplicou os 6 debitos faltantes (keepable para auditoria futura) |

### Descobertas de schema importantes

| Collection | Campo liga | Tipo armazenado |
|---|---|---|
| `extratofinanceirocaches` | `liga_id` | String |
| `inscricoestemporada` | `liga_id` | ObjectId |
| `times` | `id` | Number |

**Nunca usar ObjectId em queries de `extratofinanceirocaches`.** Sempre String.

### Estado atual Os Fuleros (6977a62071dee12036bb163e)
- 8 inscritos: 2 pagaram (Enderson, Erivaldo) + 6 devem (debitos inseridos) ✅
- Paulinett Miranda e owner mas SEM isencao nesta liga (isenta apenas no Super Cartola)

### Estado atual Super Cartola (684cb1c8af923da7c7df51de)
- 38 inscritos: 17 pagaram + 21 devem — todos com INSCRICAO_TEMPORADA no cache ✅
- 3 com `status: nao_participa` (encerraram 2025): `times.ativo=false` ✅
- Paulinett Miranda: `pagou_inscricao=true` (isenta de taxa nesta liga) ✅

---

## AUDITORIA SINCRONISMO 2025/2026 + BANCO UNICO — EXECUTADA (18/02/2026)

### Fixes de codigo — commit `8323eab`

| Fix | Arquivo | Mudanca |
|-----|---------|---------|
| B1 | `utils/saldo-calculator.js` | `>= 2026` → `>= CURRENT_SEASON` (1x) |
| B2 | `routes/tesouraria-routes.js` | `>= 2026` → `>= CURRENT_SEASON` (20x) |
| B4 | `utils/seasonGuard.js` | Remove propriedade LEAGUES hardcoded com IDs 2025 |

### Consolidacao banco unico — commit `84ce387`

| Arquivo | Mudanca |
|---------|---------|
| `mongo-server.js` (MCP) | Removida logica dev/prod, sempre usa MONGO_URI |
| `scripts/virada-temporada-liga-2026.js` | MONGO_URI_DEV removido |
| `scripts/backfill-rankingturnos-temporada.js` | MONGO_URI_DEV removido |
| `scripts/invalidar-cache-mata-mata.js` | MONGO_URI_DEV removido |
| `scripts/invalidar-cache-time.js` | MONGO_URI_DEV removido |
| `scripts/limpar-dumps-invalidos.js` | MONGO_URI_DEV removido |
| `scripts/applied-fixes/fix-acertos-tipo.js` | MONGO_URI_DEV removido |
| `scripts/backupJson.js` | Logica IS_PRODUCTION removida, banco unico |
| `scripts/migrar-temporada-2025.js` | Logica IS_PRODUCTION removida, banco unico |
| `CLAUDE.md` | Documenta banco unico, stack dev/prod, padrao correto |
| Liga producao | nome "Super Cartola" → "Super Cartola 2026" (update direto) |
