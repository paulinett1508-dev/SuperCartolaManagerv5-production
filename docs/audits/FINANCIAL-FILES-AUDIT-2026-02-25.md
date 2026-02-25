# Auditoria Completa de Arquivos Financeiros

**Data:** 2026-02-25
**Escopo:** Todos os arquivos financeiros do Super Cartola Manager (frontend + backend)
**Branch:** `claude/audit-financial-files-GDz1S`

---

## Sumario Executivo

O sistema financeiro do Super Cartola Manager e composto por **75+ arquivos** distribuidos entre frontend e backend, cobrindo: calculo de extratos, acertos (pagamentos), ajustes manuais, inscricoes de temporada, quitacao, tesouraria, projecoes ao vivo e cache de extratos.

### Resultado Geral

| Categoria | Status | Issues |
|-----------|--------|--------|
| Autenticacao/Autorizacao | PASS | Todas as rotas protegidas corretamente |
| Idempotencia | PASS (com ressalvas) | Guards implementados, 1 gap transacional |
| Validacao de Input | NEEDS ATTENTION | 3 findings HIGH |
| Consistencia de Tipos | MITIGATED | type-helpers.js compensa, mas fragil |
| Regra de Truncamento | FAIL | 18 violacoes em 8 arquivos |
| CSS/Design Tokens | FAIL | 168 cores hardcoded em CSS-in-JS |
| Qualidade de Codigo | NEEDS ATTENTION | Duplicacao, globals, dead code |

---

## 1. Inventario de Arquivos

### 1.1 Frontend (45 arquivos)

#### Core Fluxo Financeiro (`/public/js/fluxo-financeiro/`) - 13 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `fluxo-financeiro-core.js` | Motor de calculo central (v6.10). Calcula extrato completo por participante/temporada |
| `fluxo-financeiro-api.js` | Client REST para CRUD dos 4 campos editaveis (legacy) |
| `fluxo-financeiro-ajustes-api.js` | Client REST para ajustes dinamicos (2026+) |
| `fluxo-financeiro-campos.js` | Gerencia os 4 campos financeiros legados |
| `fluxo-financeiro-ui.js` | Motor de renderizacao (v8.9). Modal de extrato admin |
| `fluxo-financeiro-auditoria.js` | Gera 3 niveis de auditoria financeira. Export PDF/Excel |
| `fluxo-financeiro-cache.js` | Pre-loading de dados para calculo (v5.0 SaaS) |
| `fluxo-financeiro-quitacao.js` | Modal de quitacao de temporada |
| `fluxo-financeiro-utils.js` | Utilitarios: formatarMoedaBR, parseMoedaBR, normalizarTimeId |
| `fluxo-financeiro-pdf.js` | Export PDF/Auditoria |
| `fluxo-financeiro-styles.js` | CSS injection (~1,850 linhas) |
| `fluxo-financeiro-participante.js` | Adaptador read-only para participante |
| `extrato-render-v2.js` | Renderizador banco-style (tema "Banco Inter" dark) |

#### Renovacao/Inscricao (`/public/js/renovacao/`) - 4 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `renovacao-api.js` | Client REST para workflow de renovacao |
| `renovacao-core.js` | Orquestrador de estado da renovacao |
| `renovacao-modals.js` | Templates HTML para modais de decisao |
| `renovacao-ui.js` | Gerenciador de UI (modais, formularios, badges) |

#### Admin Financeiro - 1 arquivo

| Arquivo | Proposito |
|---------|-----------|
| `admin-tesouraria.js` | Dashboard de tesouraria (v3.0.0 SaaS Ready) |

#### Participante (`/public/participante/js/modules/`) - 3 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `participante-extrato.js` | Extrato financeiro do participante (v5.1) |
| `participante-extrato-ui.js` | Renderizador do extrato (v11.0 "Bank Digital Redesign") |
| `participante-historico.js` | Visao historica por temporada |

#### Componentes/Utilidades - 5 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `tooltip-regras-financeiras.js` | Tooltip de regras financeiras por modulo |
| `module-config-modal.js` | Modal de config com integracao financeira |
| `module-config-pdf.js` | Export PDF de configs de modulo |
| `mata-mata-financeiro.js` | Calculo financeiro do Mata-Mata |
| `pontos-corridos-core.js` | Calculo financeiro dos Pontos Corridos |

#### CSS - 5 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `modules/fluxo-financeiro.css` | CSS da pagina financeira admin |
| `modules/extrato-v2.css` | CSS compartilhado extrato v2.0 |
| `modules/admin-tesouraria.css` | CSS da tesouraria admin |
| `participante/css/extrato-bank.css` | CSS banco-style participante |
| `participante/css/_app-tokens.css` | Tokens de design participante |

#### HTML - 6 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `fluxo-financeiro.html` | Pagina admin financeira (standalone) |
| `auditoria-extratos.html` | Pagina de auditoria de extratos |
| `fronts/fluxo-financeiro.html` | Fragmento SPA admin |
| `participante/fronts/extrato.html` | Fragmento extrato participante |
| `participante/fronts/historico.html` | Fragmento historico participante |
| `templates/fluxo-financeiro-tabela.html` | Template de impressao/export |

### 1.2 Backend (30+ arquivos)

#### Controllers - 6 arquivos

| Arquivo | Collections | Proposito |
|---------|-------------|-----------|
| `extratoFinanceiroCacheController.js` | `extratofinanceirocaches`, `rodadas`, `acertos` | Cache de extratos |
| `fluxoFinanceiroController.js` | `fluxofinanceirocampos`, `extratofinanceirocaches`, `ajustefinanceiros`, `acertosfinanceiros`, `inscricoestemporada`, `ligarules` | Motor de calculo principal |
| `quitacaoController.js` | `extratofinanceirocaches`, `inscricoestemporada`, `acertosfinanceiros` | Quitacao de temporada |
| `inscricoesController.js` | `inscricoestemporada`, `ligarules`, `extratofinanceirocaches`, `acertosfinanceiros` | Inscricoes/renovacoes |
| `ajustesController.js` | `ajustefinanceiros` | CRUD de ajustes dinamicos |
| `projecaoFinanceiraController.js` | `extratofinanceirocaches`, `ranking-parcial` | Projecoes ao vivo |

#### Models - 6 arquivos

| Model | Collection | Campo Liga | Tipo Liga | Campo Time | Tipo Time |
|-------|-----------|-----------|-----------|-----------|-----------|
| `ExtratoFinanceiroCache` | `extratofinanceirocaches` | `liga_id` | Mixed | `time_id` | Number |
| `AcertoFinanceiro` | `acertosfinanceiros` | `ligaId` | String | `timeId` | String |
| `FluxoFinanceiroCampos` | `fluxofinanceirocampos` | `ligaId` | String | `timeId` | String |
| `AjusteFinanceiro` | `ajustesfinanceiros` | `liga_id` | Mixed | `time_id` | Number |
| `InscricaoTemporada` | `inscricoestemporada` | `liga_id` | ObjectId | `time_id` | Number |
| `LigaRules` | `ligarules` | `liga_id` | ObjectId | - | - |

#### Routes - 10 arquivos

| Arquivo | Auth | Endpoints Principais |
|---------|------|---------------------|
| `extratoFinanceiroCacheRoutes.js` | Admin (POST) | Cache CRUD, stats, limpeza |
| `fluxoFinanceiroRoutes.js` | AdminOrOwner/Admin | Extrato, campos, projecao |
| `acertos-financeiros-routes.js` | AdminOrOwner/Admin | Pagamentos/recebimentos CRUD |
| `quitacao-routes.js` | Admin | Dados, quitar, status |
| `inscricoes-routes.js` | Admin | Renovacao, novo, nao-participa |
| `ajustes-routes.js` | Admin | Ajustes CRUD por participante/liga |
| `tesouraria-routes.js` | Admin | Dashboard, resumo, bulk |
| `liga-rules-routes.js` | Admin | Config regras por liga/temporada |
| `admin-auditoria-routes.js` | Admin | Auditoria extratos, saldos |
| `renovacoes-routes.js` | Admin | Registry, status |

#### Utilities - 2 arquivos

| Arquivo | Proposito |
|---------|-----------|
| `saldo-calculator.js` | Calculador centralizado de saldo |
| `type-helpers.js` | Conversao de tipos (toLigaId, toTimeId, truncarPontosNum) |

#### Scripts - 6+ arquivos

| Arquivo | Proposito |
|---------|-----------|
| `auditoria-financeira-completa.js` | Auditoria completa (--dry-run/--force) |
| `reconciliar-saldos-financeiros.js` | Reconciliacao de saldos |
| `auditar-extratos.js` | Auditor de cache |
| `auditar-tipos-financeiros.js` | Auditor de tipos |
| `auditoria-renovacao-2026.js` | Auditoria renovacao 2026 |
| `fix-extrato-2026-*.js` (multiplos) | Fixes de extratos 2026 |

---

## 2. Fluxo de Dados Financeiros

```
Estado Financeiro do Participante
    |
[ExtratoFinanceiroCache] <-- Fonte da Verdade (consolidado por temporada)
    |
[Inclui]:
|-- historico_transacoes (pontos por rodada, modulos, bonus/onus)
|-- [FluxoFinanceiroCampos] (campos manuais, legado)
|-- [AjusteFinanceiro] (ajustes dinamicos, 2026+)
|-- [AcertoFinanceiro] (pagamentos/recebimentos)
|-- [InscricaoTemporada] (flag de debito de inscricao)
    |
[Saldo Calculado]
|-- saldoTemporada (cache rodadas)
|-- saldoAcertos (pagamentos/recebimentos)
|-- saldoAjustes (ajustes)
|-- saldoFinal (saldo completo)
    |
[Quitacao] --> [Legado proxima temporada]
```

### Matriz de Interacao entre Collections

| Collection A | Collection B | Relacao | Separacao por Temporada |
|--------------|-------------|---------|------------------------|
| `extratofinanceirocaches` | `acertosfinanceiros` | Pagamentos integrados em query time | Sim |
| `extratofinanceirocaches` | `fluxofinanceirocampos` | Campos manuais combinados para saldo | Sim |
| `extratofinanceirocaches` | `ajustesfinanceiros` | Ajustes dinamicos (2026+) combinados | Sim |
| `inscricoestemporada` | `extratofinanceirocaches` | Flag debito inscricao / transferencia saldo | Sim |
| `ligarules` | `inscricoestemporada` | Regras governam logica de debito | Sim |

---

## 3. Findings de Seguranca

### 3.1 HIGH - Audit Trail Spoofing (AUTH-001)

**Arquivo:** `routes/tesouraria-routes.js`, linha 1101
**Severidade:** HIGH

O campo `registradoPor` e extraido de `req.body`, permitindo que o cliente forje a identidade no trail de auditoria. Comparar com `acertos-financeiros-routes.js` linha 213-214 que corretamente deriva `registradoPor` da sessao.

**Recomendacao:** Derivar `registradoPor` de `req.session` em vez de `req.body`.

### 3.2 HIGH - Missing Numeric Validation na Quitacao (VAL-002)

**Arquivo:** `controllers/quitacaoController.js`, linhas 208-215
**Severidade:** HIGH

`saldo_original`, `valor_legado`, `temporada_origem` e `temporada_destino` de `req.body` NAO tem validacao numerica. Valores invalidos seriam salvos permanentemente no banco.

**Recomendacao:** Adicionar `Number.isFinite()` checks antes de processar.

### 3.3 HIGH - Temporada Type Mismatch Bypassing Idempotency (VAL-003)

**Arquivo:** `routes/tesouraria-routes.js`, linhas 1100 e 1136
**Severidade:** HIGH

`temporada` e mantido como String na tesouraria, mas a collection `acertosfinanceiros` provavelmente armazena como Number. Query com `String("2026")` nunca matchara `Number(2026)`, efetivamente desabilitando o guard de idempotencia.

**Recomendacao:** Usar `Number(temporada)` consistentemente.

### 3.4 MEDIUM - Tesouraria Acerto sem Transaction (IDEM-001)

**Arquivo:** `routes/tesouraria-routes.js`, linhas 1196-1218
**Severidade:** MEDIUM

Acerto + troco salvos separadamente sem MongoDB transaction. Se o servidor falhar entre os dois saves, o pagamento e registrado mas o troco e perdido.

**Recomendacao:** Usar `session.withTransaction()` como em `acertos-financeiros-routes.js`.

### 3.5 MEDIUM - No express-mongo-sanitize (NOSQL-001)

**Arquivo:** `index.js`
**Severidade:** MEDIUM

A aplicacao NAO usa `express-mongo-sanitize`. Embora campos sejam geralmente type-cast, nao ha defesa em profundidade contra NoSQL operator injection.

**Recomendacao:** Instalar e configurar `express-mongo-sanitize`.

### 3.6 MEDIUM - isFinite Missing em Ajustes (VAL-001)

**Arquivo:** `controllers/ajustesController.js`, linhas 69-74
**Severidade:** MEDIUM

Valor nao e validado com `isFinite`. `Infinity` e `-Infinity` passariam a validacao.

### 3.7 LOW - Error Message Leakage (ERR-001)

**Arquivos:** Multiplos controllers
**Severidade:** LOW

`error.message` e exposto em respostas 500. Em producao, pode vazar detalhes de infraestrutura.

---

## 4. Findings de Consistencia de Tipos

### 4.1 HIGH - AjusteFinanceiro.listarPorLiga() ObjectId-only Query

**Arquivo:** `models/AjusteFinanceiro.js`, linha 248
**Severidade:** HIGH

Usa `new mongoose.Types.ObjectId(ligaId)` sem fallback para String. Se `liga_id` foi armazenado como String, esta query NAO encontrara o registro. Outras funcoes do mesmo modelo (`listarPorParticipante`, `calcularTotal`) usam `$in` com ambos os tipos.

### 4.2 MEDIUM - Saldo Calculado em 3 Lugares Diferentes

**Arquivos:** `saldo-calculator.js`, `fluxoFinanceiroController.js`, `tesouraria-routes.js`
**Severidade:** MEDIUM

Logica de calculo de saldo duplicada com implementacoes divergentes:
- `saldo-calculator.js`: Resumo simplificado
- `fluxoFinanceiroController.js`: Extrato completo com breakdown
- `tesouraria-routes.js`: Hibrido com recalculo manual

A inscricao e tratada diferentemente: `saldo-calculator` query `InscricaoTemporada` diretamente, enquanto `fluxoFinanceiroController` usa `participante?.pagouInscricao`.

**Risco:** Atualizacao em um local sem replicar nos outros causa divergencia de saldos.

### 4.3 MEDIUM - ID Type Inconsistencies (Mitigado)

| Model | liga field | tipo | time field | tipo |
|-------|-----------|------|-----------|------|
| ExtratoFinanceiroCache | `liga_id` | Mixed | `time_id` | Number |
| AcertoFinanceiro | `ligaId` | String | `timeId` | String |
| FluxoFinanceiroCampos | `ligaId` | String | `timeId` | String |
| AjusteFinanceiro | `liga_id` | Mixed | `time_id` | Number |
| InscricaoTemporada | `liga_id` | ObjectId | `time_id` | Number |

Mitigado por `type-helpers.js` (`timeIdQuery()` e `ligaIdQuery()` geram `$in` queries), mas fragil se desenvolvedores esquecerem de usar os helpers.

### 4.4 LOW - Dead Code: type-helpers ID functions e id-utils.js

**Arquivos:** `utils/type-helpers.js`, `utils/id-utils.js`
**Severidade:** LOW

As funcoes de conversao de ID em `type-helpers.js` (`toLigaId`, `toTimeId`, `ligaIdQuery`, `timeIdQuery`) NAO sao importadas por nenhum arquivo. Apenas `truncarPontosNum` e usado.

O arquivo `id-utils.js` e completamente dead code - zero imports em todo o codebase.

5+ controllers definem seus proprios `toLigaId()` locais em vez de importar o helper.

### 4.5 LOW - Inverted Dependency

**Arquivo:** `utils/saldo-calculator.js`, linhas 22-24
**Severidade:** LOW

Utilitario importa de controller (`extratoFinanceiroCacheController.js`). Deveria ser o contrario.

---

## 5. Findings de Qualidade Frontend

### 5.1 CRITICAL - 18 Violacoes da Regra de Truncamento

A regra do projeto exige que pontos de participantes NUNCA sejam arredondados, sempre truncados. Foram encontradas **18 violacoes** em **8 arquivos**:

| Arquivo | Linha | Codigo | Impacto |
|---------|-------|--------|---------|
| `luva-de-ouro-ui.js` | 555 | `melhorPontuacao.toFixed(2)` | Pontos arredondados |
| `capitao-luxo.js` | 385 | `(participante.media_capitao).toFixed(2)` | Media arredondada |
| `capitao-luxo.js` | 387 | `participante.melhor_capitao?.pontuacao?.toFixed(2)` | Pontos arredondados |
| `capitao-luxo.js` | 388 | `participante.pior_capitao?.pontuacao?.toFixed(2)` | Pontos arredondados |
| `capitao-luxo.js` | 494 | `(lider?.pontuacao_total).toFixed(2)` | Total arredondado |
| `rodadas-ui.js` | 362 | `parseFloat(rank.totalPontos).toFixed(2)` | Total arredondado |
| `rodadas-ui.js` | 577 | `parseFloat(rank.totalPontos).toFixed(2)` | Total arredondado |
| `participante-rodadas.js` | 520 | `totalPontos.toFixed(2).replace('.', ',')` | Total arredondado |
| `participante-rodadas.js` | 521 | `mediaPontos.toFixed(2).replace('.', ',')` | Media arredondada |
| `participante-rodada-xray.js` | 598 | `Number(valor).toFixed(2)` em `formatarPontos()` | Formatador usa rounding |
| `participante-campinho.js` | 717 | `pontos.toFixed(2)` | Pontos arredondados |
| `participante-campinho.js` | 731 | `pontosExibir.toFixed(2)` | Pontos arredondados |
| `capitao-historico-modal.js` | 31 | `(participante.pontuacao_total).toFixed(2)` | Total arredondado |
| `capitao-historico-modal.js` | 32 | `(participante.media_capitao).toFixed(2)` | Media arredondada |
| `capitao-historico-modal.js` | 40 | `(r.pontuacao).toFixed(2)` | Pontos arredondados |
| `capitao-historico-modal.js` | 110 | `participante.melhor_capitao.pontuacao.toFixed(2)` | Pontos arredondados |
| `capitao-historico-modal.js` | 116 | `participante.pior_capitao.pontuacao.toFixed(2)` | Pontos arredondados |
| `mata-mata-ui.js` | 217 | `points.toFixed(2).replace(".", ",")` | Pontos arredondados |

**Nota:** O core financeiro (`fluxo-financeiro-core.js`) usa `truncarPontosNum()` corretamente em TODOS os calculos de pontos (linhas 274-281). As violacoes estao nas UIs de modulos especificos.

**Correcao necessaria:** Substituir `.toFixed(2)` por `(Math.trunc(valor * 100) / 100).toFixed(2)` ou usar `truncarPontos()` onde disponivel.

### 5.2 HIGH - CSS-in-JS com 168 Cores Hardcoded

**Arquivo:** `public/js/fluxo-financeiro/fluxo-financeiro-styles.js`

- **1,831 linhas** de CSS injetado via JavaScript
- **168 valores hex hardcoded** (ex: `#FF5500`, `#ef4444`, `#10b981`)
- **106 valores `rgba()` hardcoded**
- **1 unica variavel CSS usada** (`var(--laranja, #ff6b35)`)
- **0 referencias** ao design token system

Cores mais repetidas que deveriam ser variaveis:

| Hardcoded | Ocorrencias | Deveria Ser |
|-----------|-------------|-------------|
| `#FF5500` | ~20 | `var(--laranja)` |
| `#10b981` | ~12 | `var(--app-success)` |
| `#ef4444` | ~10 | `var(--app-danger)` |
| `#1a1a1a` | ~8 | `var(--app-bg-secondary)` |
| `#3b82f6` | ~6 | `var(--app-info)` |

**Recomendacao:** Migrar para arquivo `.css` proprio e substituir hardcoded por variaveis CSS.

### 5.3 MEDIUM - 4 Implementacoes Duplicadas de formatarMoeda

| Arquivo | Funcao | Implementacao |
|---------|--------|---------------|
| `fluxo-financeiro-utils.js` | `formatarMoedaBR()` | `toLocaleString("pt-BR", ...)` |
| `fluxo-financeiro-ui.js` | `formatarMoeda()` | `Math.abs(valor).toFixed(2).replace('.', ',')` |
| `extrato-render-v2.js` | `formatarMoeda()` | `Math.abs(v).toFixed(2).replace('.', ',')` |
| `fluxo-financeiro-quitacao.js` | `formatarMoeda()` | `Intl.NumberFormat('pt-BR', {style:'currency'})` |

Tres abordagens diferentes podem produzir resultados sutilmente diferentes em edge cases.

### 5.4 MEDIUM - 72 Globals no window

Os modulos financeiros registram **72 propriedades `window.*`**. Destaque para variaveis de estado expostas:
- `window.temporadaAtual` - qualquer script pode modificar
- `window.ligaId` - qualquer script pode modificar
- `window.participantesFluxo` - array mutavel
- `window.extratoAtual` - dados financeiros expostos

### 5.5 LOW - API Calls sem Timeout

Nenhum dos 11 metodos de API financeira configura timeout. Um servidor lento deixa a UI travada indefinidamente.

---

## 6. O que esta BEM Feito

1. **Autenticacao completa** - Todas as rotas financeiras protegidas com `verificarAdmin` ou `verificarAdminOuDono`
2. **Idempotencia no core** - Guards de 60 segundos implementados em acertos, ajustes, inscricoes e quitacao
3. **MongoDB transactions** - Usadas corretamente em `acertos-financeiros-routes.js` e `quitacaoController.js`
4. **Soft deletes** - Trilha de auditoria preservada em todas as operacoes de delete
5. **try/catch universal** - Todos os controllers async tem tratamento de erro
6. **Truncamento correto no core** - `fluxo-financeiro-core.js` usa `truncarPontosNum()` em todos os calculos de pontos
7. **Separacao por temporada** - Todas as collections financeiras sao separadas por temporada
8. **Protecao de dados historicos** - `resetarCampos` bloqueia operacoes em temporadas passadas
9. **Type helpers** - `type-helpers.js` fornece funcoes de conversao para lidar com tipos mistos

---

## 7. Recomendacoes Priorizadas

### Prioridade 1 - Seguranca (Sprint atual)

1. **AUTH-001**: Derivar `registradoPor` de `req.session` em `tesouraria-routes.js`
2. **VAL-002**: Adicionar validacao numerica em `quitacaoController.js`
3. **VAL-003**: Corrigir tipo de `temporada` em `tesouraria-routes.js` (String -> Number)

### Prioridade 2 - Integridade de Dados (Proximo sprint)

4. **Truncamento**: Corrigir 18 violacoes da regra de truncamento em 8 arquivos
5. **AjusteFinanceiro.listarPorLiga()**: Adicionar fallback String na query
6. **IDEM-001**: Adicionar transaction na tesouraria acerto + troco
7. **VAL-001**: Adicionar `isFinite` check no ajustes controller

### Prioridade 3 - Qualidade de Codigo (Backlog)

8. **Consolidar calculo de saldo**: Unificar `saldo-calculator.js`, `fluxoFinanceiroController.js` e `tesouraria-routes.js`
9. **CSS migration**: Migrar `fluxo-financeiro-styles.js` para arquivo `.css` com design tokens
10. **Consolidar formatarMoeda**: Unificar 4 implementacoes em uma unica
11. **Limpar dead code**: Remover `id-utils.js` e funcoes nao-usadas de `type-helpers.js`
12. **Reduzir globals**: Migrar de IIFE/window para ES6 modules nos modulos de renovacao
13. **NOSQL-001**: Instalar `express-mongo-sanitize`

---

## 8. Metricas do Inventario

| Categoria | Quantidade | Proposito Principal |
|-----------|------------|---------------------|
| Core Fluxo Financeiro JS | 13 | Calculo, API, UI, cache, auditoria, quitacao, estilos |
| Renovacao/Inscricao JS | 4 | Renovacao de temporada, taxa inscricao, novo participante |
| Admin Financeiro JS | 1 | Dashboard tesouraria (fechamento/acerto) |
| Participante Financeiro JS | 3 | Extrato view, UI renderer, historico |
| Componentes Financeiros | 5 | Tooltip, module config, PDF, notificacoes, analytics |
| Modulos de Jogo Financeiro | 3 | Mata-Mata, Pontos Corridos, Melhor Mes |
| CSS | 5 | Fluxo, extrato-v2, tesouraria, bank style, tokens |
| HTML | 6 | Paginas, SPA fronts, template de impressao |
| Controllers Backend | 6 | Cache, fluxo, quitacao, inscricoes, ajustes, projecao |
| Models Backend | 6 | Cache, acertos, campos, ajustes, inscricoes, regras |
| Routes Backend | 10 | Endpoints para todas as operacoes financeiras |
| Utilities Backend | 2 | Calculador de saldo, helpers de tipo |
| Scripts Backend | 6+ | Auditoria, reconciliacao, fixes |
| **TOTAL** | **75+** | |
