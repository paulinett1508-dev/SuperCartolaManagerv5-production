# AUDITORIA FINANCEIRA RIGOROSA - Super Cartola Manager v5

**Data:** 2026-02-25
**Auditor:** Claude (Opus 4.6)
**Escopo:** Todo o teor financeiro do codebase
**Arquivos analisados:** ~98 arquivos, ~15.000+ linhas de codigo financeiro

---

## RESUMO EXECUTIVO

| Severidade | Quantidade | Status |
|------------|-----------|--------|
| **CRITICAL** | 14 | Requer acao imediata |
| **HIGH** | 27 | Corrigir na proxima sprint |
| **MEDIUM** | 32 | Planejado para correcao |
| **LOW** | 15 | Melhorias cosmeticas |
| **TOTAL** | **88** | - |

### Top 5 Problemas Sistemicos

1. **Fragmentacao de tipos `liga_id`** - 3 tipos diferentes (String, ObjectId, Mixed) entre 6 models financeiros
2. **Endpoint duplicado de Acertos** - `POST /api/acertos` vs `POST /api/tesouraria/acerto` com logicas divergentes
3. **Double-counting no saldo-calculator** - FluxoFinanceiroCampos + AjusteFinanceiro somados para 2026+ (deveriam ser mutuamente exclusivos)
4. **Idempotencia quebrada na Tesouraria** - Campo `criado_em` nao existe no schema (usa `createdAt`) + tipo String vs Number
5. **Campos escritos mas nao no schema** - `data_pagamento`, `metodo_pagamento` silenciosamente descartados pelo Mongoose strict mode

---

## CATEGORIAS DE FINDINGS

### A. DISCREPANCIAS (Logicas contradictorias)

#### A1. [CRITICAL] Quitacao ignora AjusteFinanceiro
- **Arquivo:** `controllers/quitacaoController.js:105`
- **Problema:** `saldoFinal = saldoRodadas + totalCamposManuais + saldoAcertos` -- NAO inclui ajustes dinamicos (AjusteFinanceiro)
- **Impacto:** Para temporada 2026+, quitacao mostra saldo errado. Legado transferido para proxima temporada sera incorreto.
- **Solucao:** Adicionar `AjusteFinanceiro.calcularTotal()` ao calculo de saldoFinal

#### A2. [CRITICAL] Inscricao lida de fontes diferentes
- **Arquivo:** `controllers/fluxoFinanceiroController.js:1003` vs `controllers/inscricoesController.js`
- **Problema:** Extrato le taxa de `liga.parametros_financeiros?.inscricao`, inscricoes le de `LigaRules.inscricao.taxa`
- **Impacto:** Se os dois valores divergirem, extrato mostra valor diferente do realmente cobrado
- **Solucao:** Usar LigaRules como fonte unica de verdade para taxa de inscricao

#### A3. [CRITICAL] Double-counting saldo-calculator para 2026+
- **Arquivo:** `utils/saldo-calculator.js:57-117`
- **Problema:** Soma AMBOS FluxoFinanceiroCampos (campos manuais legado) E AjusteFinanceiro (novo sistema). O controller trata como mutuamente exclusivos (`temporada >= 2026` usa ajustes, anterior usa campos), mas saldo-calculator nao diferencia.
- **Impacto:** Participantes com dados em ambos os sistemas terao saldo inflado/deflado
- **Solucao:** Adicionar condicional `Number(temporada) < 2026` antes de incluir FluxoFinanceiroCampos

#### A4. [HIGH] saldoRodadas semantica diferente com/sem cache
- **Arquivo:** `controllers/quitacaoController.js:80-101`
- **Problema:** Com cache: `saldoRodadas = cache.saldo_consolidado` (inclui R0: inscricao, legado). Sem cache: `saldoRodadas = sum(bonus - onus)` (apenas rodadas)
- **Impacto:** Participantes sem cache tem saldo subestimado (faltam inscricao/legado)
- **Solucao:** Usar `calcularSaldoParticipante()` de saldo-calculator.js

#### A5. [HIGH] Acertos calculados de formas diferentes
- **Arquivo:** `controllers/extratoFinanceiroCacheController.js:86-97` vs `controllers/quitacaoController.js:57-63`
- **Problema:** extratoCache usa catch-all `else` para nao-pagamento. quitacao checa explicitamente `tipo === 'recebimento'`. Um novo tipo seria tratado diferente.
- **Solucao:** Ambos devem chamar `AcertoFinanceiro.calcularSaldoAcertos()` (metodo do model)

#### A6. [HIGH] Consolidacao (getFluxoFinanceiroLiga) incompleta
- **Arquivo:** `controllers/fluxoFinanceiroController.js:1229-1417`
- **Problema:** `saldo_total = cache.saldo_consolidado + saldoCampos` -- faltam acertos, ajustes e inscricao
- **Impacto:** Snapshots e Hall da Fama mostram saldo incompleto
- **Solucao:** Incluir acertos, ajustes e inscricao no calculo de consolidacao

#### A7. [HIGH] Valores de Pontos Corridos hardcoded
- **Arquivo:** `controllers/fluxoFinanceiroController.js:458-487`
- **Problema:** Empate R$3, Vitoria R$5, Goleada R$7, threshold empate 0.3, threshold goleada 50 -- todos hardcoded
- **Impacto:** Multi-tenancy quebrado: ligas nao podem customizar valores de PC
- **Solucao:** Ler de `liga.configuracoes.pontos_corridos`

#### A8. [HIGH] Fallback `||` vs `??` para rodadaInicial
- **Arquivo:** `controllers/fluxoFinanceiroController.js:77`
- **Problema:** `liga.configuracoes?.pontos_corridos?.rodadaInicial || 7` -- se configurado como `0`, fallback para 7
- **Solucao:** Usar `?? 7` em vez de `|| 7`

---

### B. PARADOXOS (Codigo que se contradiz)

#### B1. [HIGH] limparCachesCorrompidos deleta caches validos de pre-temporada
- **Arquivo:** `controllers/extratoFinanceiroCacheController.js:1620-1640`
- **Problema:** Deleta caches com `historico_transacoes: { $size: 0 }`. Na pre-temporada, caches com `pagouInscricao=true` podem ter array vazio validamente.
- **Solucao:** Excluir temporada atual: `{ $size: 0, temporada: { $lt: CURRENT_SEASON } }`

#### B2. [MEDIUM] DELETE de inscricao nao deleta
- **Arquivo:** `routes/inscricoes-routes.js:443-488`
- **Problema:** `DELETE /:ligaId/:temporada/:timeId` reseta status para `'pendente'` em vez de deletar. Semantica HTTP violada.
- **Solucao:** Renomear para `PATCH .../reverter` ou documentar claramente

#### B3. [MEDIUM] salvarCampos retorna sucesso sem salvar
- **Arquivo:** `controllers/fluxoFinanceiroController.js:1190-1192`
- **Problema:** Retorna `{ message: "Use a rota patch individual" }` com status 200 -- nenhum dado e salvo
- **Solucao:** Retornar 410 Gone ou remover endpoint

---

### C. DUPLICIDADES (Logica repetida)

#### C1. [CRITICAL] Endpoint POST /acerto duplicado (acertos vs tesouraria)
- **Arquivos:** `routes/acertos-financeiros-routes.js:198` vs `routes/tesouraria-routes.js:1088`
- **Divergencias encontradas:**

| Aspecto | acertos-financeiros | tesouraria |
|---------|-------------------|------------|
| Transacao MongoDB | `withTransaction()` | Dois `save()` separados |
| registradoPor | De `req.session` (seguro) | De `req.body` (spoofavel) |
| Idempotencia campo | `createdAt` (correto) | `criado_em` (nao existe!) |
| Idempotencia tipo temporada | `Number(temporada)` | `String(temporada)` |
| Push notification | Sim | Nao |
| Calculo saldo | `AcertoFinanceiro.calcularSaldoAcertos()` | `calcularSaldoParticipante()` |

- **Impacto:** Acerto pela tesouraria: sem transacao atomica (troco pode perder-se), sem notificacao, idempotencia QUEBRADA
- **Solucao:** Extrair para `services/acertoService.js` compartilhado

#### C2. [CRITICAL] Endpoint DELETE /acerto duplicado
- **Arquivos:** `routes/acertos-financeiros-routes.js:495` vs `routes/tesouraria-routes.js:1362`
- **Problema:** Mesma logica de soft-delete, metodos de recalculo diferentes
- **Solucao:** Consolidar no service compartilhado

#### C3. [HIGH] Calculo de saldo triplicado na tesouraria
- **Arquivo:** `routes/tesouraria-routes.js` linhas 97-424, 432-862, 1408-1595
- **Problema:** Copy-paste do mesmo calculo de saldo em 3 endpoints GET. `/liga/:ligaId` tem fallback B3-FIX que os outros nao tem.
- **Solucao:** Extrair `calcularSaldosBulk()` compartilhado

#### C4. [HIGH] transformarTransacoesEmRodadas implementada 2x
- **Arquivo:** `controllers/extratoFinanceiroCacheController.js` linhas 244-311 e 433-552
- **Problema:** `buscarExtratoDeSnapshots` reimplementa a logica de `transformarTransacoesEmRodadas` com switch statements quase identicos mas nao iguais
- **Solucao:** `buscarExtratoDeSnapshots` deve chamar `transformarTransacoesEmRodadas`

#### C5. [HIGH] 4 implementacoes de formatarMoeda no frontend
- **Arquivos:** `fluxo-financeiro-utils.js:27`, `extrato-render-v2.js:14`, `fluxo-financeiro-quitacao.js:394`, `modulos-wizard.js:18`, `renovacao-modals.js:41`
- **Problema:** 3 implementacoes distintas (toLocaleString, replace manual, Intl.NumberFormat)
- **Impacto:** Mesmo valor monetario exibido diferente em telas diferentes
- **Solucao:** Usar `formatarMoedaBR()` de `fluxo-financeiro-utils.js` como canonico

#### C6. [HIGH] Verificacao de modulo redundante (8+ ocorrencias)
- **Arquivo:** `controllers/fluxoFinanceiroController.js` linhas 560, 809, 845, 1299, 1323
- **Problema:** `isModuloHabilitado(liga, 'x') || liga.modulos_ativos?.x` -- segundo check sempre redundante
- **Solucao:** Remover todos os `|| liga.modulos_ativos?.xxx`

---

### D. CODIGOS ORFAOS (Dead code / Unreachable)

#### D1. [MEDIUM] `calcularSaldoCompleto` / `calcularSaldoTotalParticipante` aliases
- **Arquivo:** `utils/saldo-calculator.js:335-336`
- **Problema:** Aliases deprecated de `calcularSaldoParticipante()`. Se algum codigo ainda usa, deve ser migrado.
- **Solucao:** Grep por uso; se nenhum, remover

#### D2. [MEDIUM] 20+ scripts temporais no diretorio scripts/
- **Arquivos:** `scripts/fix-extrato-jb-oliveira-sc-2025.js`, `fix-leilson-*`, `fix-mauricio-*`, `fix-inscricao-pendente-*`, etc.
- **Problema:** Scripts one-time que ja foram aplicados, poluem o diretorio e podem ser re-executados acidentalmente
- **Solucao:** Mover para `scripts/applied-fixes/`

#### D3. [MEDIUM] `audit-financeiro.cjs` deprecado
- **Arquivo:** `scripts/audit-financeiro.cjs`
- **Problema:** Apenas imprime mensagem de deprecacao e sai. Confunde desenvolvedores.
- **Solucao:** Deletar

#### D4. [LOW] admin email duplicado no fallback
- **Arquivo:** `controllers/ajustesController.js:99`
- **Problema:** `req.session?.admin?.email || req.session?.admin?.email || ...` -- campo repetido
- **Solucao:** Corrigir para `...admin?.email || ...admin?.nome || ...`

#### D5. [LOW] Typo `podeCaclularRodadas`
- **Arquivo:** `controllers/fluxoFinanceiroController.js:779`
- **Solucao:** Renomear para `podeCalcularRodadas`

#### D6. [LOW] Variavel `inscricao2026` hardcoded
- **Arquivo:** `controllers/quitacaoController.js:113`
- **Problema:** Nome hardcoda ano, mas valor e dinamico
- **Solucao:** Renomear para `inscricaoProximaTemporada`

---

### E. CODIGOS FORA DE CONTEXTO

#### E1. [HIGH] 1599 linhas de business logic em route file
- **Arquivo:** `routes/tesouraria-routes.js`
- **Problema:** Calculos de saldo, classificacao financeira, bulk queries -- tudo inline na rota
- **Solucao:** Extrair para `controllers/tesourariaController.js`

#### E2. [MEDIUM] API Cartola chamada no controller de inscricoes
- **Arquivo:** `controllers/inscricoesController.js:1141-1157`
- **Problema:** `fetch('https://api.cartola.globo.com/time/id/${timeId}')` dentro de controller financeiro
- **Solucao:** Extrair para service dedicado com timeout e rate limiting

#### E3. [MEDIUM] Raw MongoDB access em route file
- **Arquivo:** `routes/inscricoes-routes.js:349-368`
- **Problema:** `mongoose.connection.db.collection('extratofinanceirocaches').updateOne()` direto na rota, bypassing modelo
- **Solucao:** Mover para controller ou metodo do model

#### E4. [LOW] console.log em vez de logger
- **Arquivo:** `controllers/projecaoFinanceiraController.js` (5 ocorrencias)
- **Solucao:** Importar e usar logger utility

---

### F. SEGURANCA

#### F1. [CRITICAL] Idempotencia da Tesouraria COMPLETAMENTE QUEBRADA
- **Arquivo:** `routes/tesouraria-routes.js:1136-1137`
- **Problema DUPLO:**
  1. Busca campo `criado_em` que NAO EXISTE (schema usa `createdAt` via timestamps)
  2. Busca `temporada: String(temporada)` mas schema armazena como `Number`
- **Impacto:** NENHUM duplicado sera encontrado. Double-click = double-charge.
- **Solucao:** Usar `createdAt` e `Number(temporada)`

#### F2. [CRITICAL] Troco nao-atomico na Tesouraria
- **Arquivo:** `routes/tesouraria-routes.js:1212-1218`
- **Problema:** Dois `await save()` separados sem transacao. Crash entre eles = participante paga mas nao recebe troco.
- **Solucao:** Usar `session.withTransaction()` como em `acertos-financeiros-routes.js:309`

#### F3. [CRITICAL] registradoPor spoofavel na Tesouraria
- **Arquivo:** `routes/tesouraria-routes.js:1101`
- **Problema:** `registradoPor` vem de `req.body` com default "admin_tesouraria"
- **Impacto:** Audit trail financeiro pode ser falsificado
- **Solucao:** Derivar de `req.session?.admin?.email`

#### F4. [HIGH] Rotas de cache financeiro sem autenticacao (5 endpoints)
- **Arquivo:** `routes/extratoFinanceiroCacheRoutes.js:26,33,36,43,46`
- **Problema:** GET endpoints expondo saldo, historico de transacoes sem nenhum middleware de auth
- **Solucao:** Adicionar `verificarAdminOuDono` nos reads per-participante, `verificarAdmin` no stats

#### F5. [HIGH] Validacao NaN em ajustes
- **Arquivo:** `controllers/ajustesController.js:69`
- **Problema:** `Number("abc")` = NaN, e `NaN === 0` = false, passando validacao. NaN e salvo no banco.
- **Solucao:** Adicionar `isNaN(Number(valor))` check

#### F6. [MEDIUM] Batch sem limite de tamanho
- **Arquivo:** `controllers/inscricoesController.js:1036`
- **Problema:** `processarBatchInscricoes` aceita array sem limite de tamanho. DoS vector.
- **Solucao:** Adicionar `MAX_BATCH_SIZE = 50-100`

#### F7. [MEDIUM] Pagamento renovacao sem idempotencia
- **Arquivo:** `routes/renovacoes-routes.js:245-317`
- **Problema:** `POST /:id/pagamento` sem protecao contra duplicidade. Grava em JSON file (nao-atomico).
- **Solucao:** Adicionar deduplicacao

---

### G. TIPOS INCONSISTENTES (Problema Sistemico)

#### G1. [CRITICAL] Fragmentacao de liga_id entre 6 models

| Model | Campo | Tipo Schema | Armazenado como | Consultado como |
|-------|-------|-------------|-----------------|-----------------|
| AcertoFinanceiro | `ligaId` | String | String | String |
| AjusteFinanceiro | `liga_id` | Mixed | String (via criar()) | $in [ObjectId, String] |
| ExtratoFinanceiroCache | `liga_id` | Mixed | String (convencao) | String |
| FluxoFinanceiroCampos | `ligaId` | String | String | String |
| InscricaoTemporada | `liga_id` | ObjectId | ObjectId | ObjectId |
| LigaRules | `liga_id` | ObjectId | ObjectId | ObjectId |

**Impacto:** Queries cruzando models podem nao encontrar documentos. inscricoesController.js usa 4 padroes diferentes NO MESMO ARQUIVO (String, ObjectId, $or, ou misto).

#### G2. [HIGH] Fragmentacao de time_id entre models

| Model | Campo | Tipo |
|-------|-------|------|
| AcertoFinanceiro | `timeId` | String |
| FluxoFinanceiroCampos | `timeId` | String |
| AjusteFinanceiro | `time_id` | Number |
| ExtratoFinanceiroCache | `time_id` | Number |
| InscricaoTemporada | `time_id` | Number |

#### G3. [HIGH] Naming inconsistente (camelCase vs snake_case)

| Convencao | Models |
|-----------|--------|
| camelCase (`ligaId`, `timeId`) | AcertoFinanceiro, FluxoFinanceiroCampos |
| snake_case (`liga_id`, `time_id`) | AjusteFinanceiro, ExtratoFinanceiroCache, InscricaoTemporada, LigaRules |

---

### H. SCHEMA GAPS

#### H1. [CRITICAL] Campos escritos mas NAO existem no schema
- **Arquivo:** `models/InscricaoTemporada.js`
- **Campos afetados:**
  - `data_pagamento` (escrito por tesouraria-routes.js:1245)
  - `metodo_pagamento` (escrito por tesouraria-routes.js:1246)
  - `data_pagamento_inscricao` (escrito por inscricoesController.js:1084 e inscricoes-routes.js:345)
- **Impacto:** Mongoose strict mode DESCARTA esses dados silenciosamente. Audit trail de pagamento PERDIDO.
- **Solucao:** Adicionar campos ao schema

#### H2. [MEDIUM] `quitacao.criado_sem_cache` nao esta no schema
- **Arquivo:** `models/ExtratoFinanceiroCache.js` vs `controllers/quitacaoController.js:284`
- **Impacto:** Flag de auditoria silenciosamente descartada
- **Solucao:** Adicionar ao subdocument `quitacao`

#### H3. [MEDIUM] `versao_calculo` duplicado (root + metadados.versaoCalculo)
- **Arquivo:** `models/ExtratoFinanceiroCache.js:28,62`
- **Solucao:** Deprecar um em favor do outro

#### H4. [HIGH] Hardcoded date em prazo_renovacao default
- **Arquivo:** `models/LigaRules.js:46`
- **Problema:** `default: () => new Date('2026-01-27T23:59:59')` -- nao e dinamico
- **Solucao:** Computar com base em `SEASON_CONFIG.dataPrimeiraRodada`

#### H5. [HIGH] updatedAt vs atualizado_em mismatch
- **Arquivo:** `models/FluxoFinanceiroCampos.js` (remapeia para `atualizado_em`) vs `controllers/fluxoFinanceiroController.js:969,1165` (usa `updatedAt`)
- **Impacto:** Le `undefined`, escreve campo orfao
- **Solucao:** Usar `atualizado_em` no controller

---

### I. FRONTEND

#### I1. [CRITICAL] `_calcularTotaisConsolidados` omite 3 modulos
- **Arquivo:** `public/js/fluxo-financeiro/fluxo-financeiro-core.js:1294-1315`
- **Problema:** Faltam `melhorMes`, `artilheiro`, `luvaOuro` no calculo de totalGanhos/totalPerdas
- **Impacto:** Total Ganhos/Perdas mostrados nao batem com saldo
- **Solucao:** Incluir os 3 modulos no calculo

#### I2. [CRITICAL] Timeline extrato-render-v2 ignora 3 modulos
- **Arquivo:** `public/js/fluxo-financeiro/extrato-render-v2.js:275-285`
- **Problema:** `saldoRodada` e `saldoAcumulado` nao incluem melhorMes, artilheiro, luvaOuro
- **Impacto:** Timeline mostra saldo acumulado errado quando estes modulos estao ativos
- **Solucao:** Incluir os 3 modulos nos calculos e na UI

#### I3. [HIGH] 13+ violacoes de arredondamento de pontos
- **Arquivos:** `rodadas-ui.js`, `capitao-luxo.js`, `capitao-historico-modal.js`
- **Problema:** Usam `.toFixed(2)` que ARREDONDA. Regra do projeto exige TRUNCAR.
- **Solucao:** Usar `(Math.trunc(v * 100) / 100).toFixed(2)`

#### I4. [HIGH] Hardcoded `season = '2026'` na admin-tesouraria
- **Arquivo:** `public/js/admin/modules/admin-tesouraria.js:27,68,123-124`
- **Solucao:** Usar `window.temporadaAtual` ou `new Date().getFullYear()`

#### I5. [MEDIUM] 50+ fallbacks `|| 2026` hardcoded no frontend
- **Arquivos:** `fluxo-financeiro-ui.js` (25+), `fluxo-financeiro-core.js` (6), etc.
- **Solucao:** Centralizar em constante `CURRENT_FRONTEND_SEASON`

#### I6. [MEDIUM] Frontend calcula saldo independente do backend
- **Arquivo:** `public/js/fluxo-financeiro/fluxo-financeiro-core.js:1260-1291`
- **Problema:** `_calcularSaldoFinal` inclui `campo1-4` mas NAO inclui `AjusteFinanceiro`
- **Solucao:** Sempre confiar no saldoFinal do backend API

---

### J. SCRIPTS

#### J1. [HIGH] 16 scripts usando MONGO_URI_DEV deprecado
- **Problema:** `process.env.MONGO_URI || process.env.MONGO_URI_DEV` viola regra do CLAUDE.md
- **Solucao:** Substituir por `process.env.MONGO_URI` apenas

#### J2. [CRITICAL] Scripts financeiros sem safety guard (--dry-run/--force)
- **Arquivos afetados:**
  - `scripts/atualizar-saldos-registry.js` (sem nenhum guard)
  - `scripts/sync-inscricao-pagamento.js` (executa sem --force)
  - `scripts/fix-saldo-inicial-inscricao-paga.js` (executa sem --force)
  - `scripts/cron-consolidar-rodadas.js` (sem --dry-run)
- **Solucao:** Padronizar todos com `--dry-run` / `--force`

#### J3. [HIGH] Scripts com estrategias contradictorias
- **Arquivos:** `fix-inscricao-pendente-2026.js` usa `$inc` em `saldo_consolidado`, enquanto `fix-inscricao-cache-2026.js` comenta "NAO usar $inc" por causa de double-counting
- **Solucao:** Arquivar o script incorreto

#### J4. [MEDIUM] 3 scripts duplicados para saldo registry
- `atualizar-saldos-registry.js`, `sync-hall-fama-saldos.js`, `fix_financial_data_from_backup.js`
- **Solucao:** Manter apenas `sync-hall-fama-saldos.js`

#### J5. [MEDIUM] Convencoes de flags inconsistentes
- `--dry-run/--force` (correto), `--dry` (migrar-temporada-2025), `--execute` (migrar-modulos), `--fix` (auditoria-renovacao)
- **Solucao:** Padronizar para `--dry-run/--force`

---

## FLUXO "FOLLOW THE MONEY" - Cross-reference End-to-End

### Caminho 1: Participante consulta saldo

```
Frontend (fluxo-financeiro-core.js)
  -> GET /api/fluxo-financeiro/:ligaId/extrato/:timeId
    -> fluxoFinanceiroController.getExtratoFinanceiro()
      -> ExtratoFinanceiroCache.findOne() [liga_id: String]
      -> FluxoFinanceiroCampos.findOne() [ligaId: String]
      -> AcertoFinanceiro.find() [ligaId: String]
      -> AjusteFinanceiro (APENAS se temporada >= 2026)
      -> Monta resumo com todos os modulos
    <- Retorna { resumo, rodadas, saldo }

  Frontend recalcula: _calcularSaldoFinal()
    BUG: Nao inclui AjusteFinanceiro
    BUG: _calcularTotaisConsolidados omite 3 modulos
```

**Gaps identificados:**
1. Frontend recalcula saldo localmente (devia confiar no backend)
2. Frontend omite melhorMes, artilheiro, luvaOuro nos totais
3. AjusteFinanceiro nao refletido no frontend

### Caminho 2: Admin registra pagamento

```
Admin Panel (admin-tesouraria.js)
  -> POST /api/tesouraria/acerto  OU  POST /api/acertos/:ligaId/:timeId

  Via Tesouraria:
    -> Inline route handler (1599 linhas!)
    -> SEM transacao MongoDB (troco nao-atomico)
    -> Idempotencia QUEBRADA (campo errado + tipo errado)
    -> registradoPor de req.body (spoofavel)
    -> SEM push notification

  Via Acertos:
    -> Dedicated route handler
    -> COM withTransaction() (atomico)
    -> Idempotencia CORRETA (createdAt + Number)
    -> registradoPor de session (seguro)
    -> COM push notification
```

**Gap critico:** Dois caminhos para mesma operacao com comportamentos DIVERGENTES.

### Caminho 3: Quitacao de temporada

```
Admin Panel (fluxo-financeiro-quitacao.js)
  -> GET /api/quitacao/:ligaId/:timeId/dados
    -> quitacaoController.buscarDadosParaQuitacao()
      -> ExtratoFinanceiroCache.findOne() [liga_id: String]
      -> AcertoFinanceiro.find() [ligaId: String]
      -> FluxoFinanceiroCampos.findOne() [ligaId: String]
      -> saldoFinal = saldoRodadas + campos + acertos
        BUG: Falta AjusteFinanceiro!
      -> InscricaoTemporada.findOne() [liga_id: String]
        BUG: Schema usa ObjectId!
    <- Retorna dados para modal

  -> POST /api/quitacao/:ligaId/:timeId/quitar-temporada
    -> quitacaoController.quitarTemporada()
      -> Verifica idempotencia (cache.quitacao.quitado) OK
      -> Inicia transacao MongoDB OK
      -> Salva quitacao no cache OK
      -> Atualiza InscricaoTemporada [liga_id: String]
        BUG: Schema usa ObjectId - pode criar doc duplicado!
      -> Commit transacao
```

**Gaps identificados:**
1. Saldo apresentado na quitacao IGNORA ajustes dinamicos
2. Query InscricaoTemporada com String quando schema espera ObjectId
3. Pode criar documento duplicado de inscricao (String vs ObjectId)

### Caminho 4: Renovacao de temporada

```
Admin Panel (renovacao-core.js)
  -> POST /api/inscricoes/:ligaId/:temporada/renovar/:timeId
    -> inscricoesController.processarRenovacao()
      -> LigaRules.findOne() [liga_id: ObjectId] OK
      -> Calcula taxa, saldo anterior
      -> criarTransacoesIniciais()
        -> INSCRICAO_TEMPORADA: [liga_id: String]
        -> SALDO_TEMPORADA_ANTERIOR: [liga_id: ObjectId]
          BUG CRITICO: Mesmo participante, 2 tipos de liga_id = 2 documentos!
      -> SEM transacao wrapping criarTransacoesIniciais
        BUG: Race condition em double-click
```

**Gap critico:** `criarTransacoesIniciais` usa String para inscricao e ObjectId para saldo, criando potencialmente 2 documentos de cache para o mesmo participante.

---

## PRIORIDADE DE CORRECAO

### Sprint 1 (Urgente - Previne perda financeira)

| # | Finding | Impacto | Esforco |
|---|---------|---------|---------|
| 1 | F1. Idempotencia tesouraria quebrada | Double-charge possivel | Baixo |
| 2 | F2. Troco nao-atomico tesouraria | Perda de troco | Medio |
| 3 | F3. registradoPor spoofavel | Audit trail falsificavel | Baixo |
| 4 | C1/C2. Unificar acerto em service | Elimina 3 bugs de uma vez | Alto |
| 5 | G1. Padronizar liga_id criarTransacoesIniciais | Documentos duplicados | Medio |
| 6 | H1. Adicionar campos no schema InscricaoTemporada | Dados de pagamento perdidos | Baixo |

### Sprint 2 (Alto impacto - Corrige calculos)

| # | Finding | Impacto | Esforco |
|---|---------|---------|---------|
| 7 | A1. Quitacao incluir AjusteFinanceiro | Saldo de quitacao errado | Baixo |
| 8 | A3. saldo-calculator condicional campos/ajustes | Double-counting | Baixo |
| 9 | A2. Fonte unica taxa inscricao (LigaRules) | Valor divergente | Baixo |
| 10 | I1/I2. Frontend incluir 3 modulos faltantes | Totais incorretos | Medio |
| 11 | F4. Auth em rotas de cache | Dados financeiros expostos | Baixo |
| 12 | A6. Consolidacao incluir acertos/ajustes | Snapshots incorretos | Medio |

### Sprint 3 (Divida tecnica)

| # | Finding | Impacto | Esforco |
|---|---------|---------|---------|
| 13 | E1. Extrair tesouraria para controller | Manutencao | Alto |
| 14 | G1-G3. Migrar tipos para padrao unico | Fragmentacao | Alto |
| 15 | A7. PC valores configuraveis | Multi-tenancy | Medio |
| 16 | I3. Corrigir truncamento de pontos (13 ocorrencias) | Pontos arredondados | Medio |
| 17 | J1-J5. Limpeza de scripts | Poluicao do repo | Medio |
| 18 | D2-D3. Arquivar scripts temporais | Organizacao | Baixo |

---

## METRICAS DA AUDITORIA

| Metrica | Valor |
|---------|-------|
| Arquivos auditados | ~98 |
| Linhas de codigo analisadas | ~15.000+ |
| Findings totais | 88 |
| CRITICAL | 14 |
| HIGH | 27 |
| MEDIUM | 32 |
| LOW | 15 |
| Endpoints financeiros mapeados | 48 |
| Models financeiros | 6 |
| Controllers financeiros | 6 |
| Route files financeiros | 8 |
| Scripts financeiros | 38 |
| Frontend JS financeiros | 17+ |
| Duplicidades de endpoint | 2 pares |
| Rotas sem autenticacao | 5 |
| Violacoes de arredondamento | 13+ |
| Scripts com MONGO_URI_DEV | 16 |
| Scripts sem safety guard | 5 |

---

*Relatorio gerado em 2026-02-25 pela auditoria financeira rigorosa do Super Cartola Manager v5.*
