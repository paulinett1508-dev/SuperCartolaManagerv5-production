# Module LP Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `module-lp-engine.js` (engine genérico de Landing Page) e aplicá-lo em 13 módulos do app participante — 9 novos + 4 migrados (artilheiro, luva, capitão, resta-um).

**Architecture:** A função `injectModuleLP(config)` cria e injeta dinamicamente o bloco Hero + acordeões "Como Funciona" + "Premiação" antes do container de conteúdo de cada módulo. Conteúdo carregado eagerly. Ranking da Rodada usa fonte especial: GET /api/liga/:ligaId/modulos/ranking_rodada → wizard_respostas.valores_manual.

**Tech Stack:** Vanilla JS ES6 modules · CSS custom properties · Material Icons · MongoDB via REST API

**Security note:** `conteudo_html` vem de admins autenticados via painel `regras.html` (não de input público). O padrão `element.innerHTML = adminHtml` já é usado em artilheiro, luva, capitão e resta-um. Manter esse padrão para consistência. Se no futuro a origem mudar, avaliar DOMPurify.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `public/participante/js/modules/module-lp-engine.js` | CRIAR | Engine genérico: HTML LP + accordion init + fetches |
| `public/participante/css/module-lp.css` | MODIFICAR | +9 color scope classes |
| `routes/regras-modulos-routes.js` | MODIFICAR | +2 defaults "Como Funciona" + 9 `_premiacao` no seed |
| `public/participante/fronts/ranking.html` | MODIFICAR | +anchor `ranking-lp-anchor` |
| `public/participante/js/modules/participante-ranking.js` | MODIFICAR | chamar `injectModuleLP` no init |
| `public/participante/fronts/rodadas.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-rodadas.js` | MODIFICAR | `injectModuleLP` com premiacaoSource moduleconfig |
| `public/participante/fronts/top10.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-top10.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/melhor-mes.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-melhor-mes.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/pontos-corridos.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-pontos-corridos.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/mata-mata.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-mata-mata.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/tiro-certo.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-tiro-certo.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/rodada-xray.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-rodada-xray.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/campinho.html` | MODIFICAR | +anchor |
| `public/participante/js/modules/participante-campinho.js` | MODIFICAR | `injectModuleLP` |
| `public/participante/fronts/artilheiro.html` | MODIFICAR | remover LP estática |
| `public/participante/js/modules/participante-artilheiro.js` | MODIFICAR | remover _lp* inline, usar engine |
| `public/participante/fronts/luva-ouro.html` | MODIFICAR | remover LP estática |
| `public/participante/js/modules/participante-luva-ouro.js` | MODIFICAR | usar engine |
| `public/participante/fronts/capitao.html` | MODIFICAR | remover LP estática |
| `public/participante/js/modules/participante-capitao.js` | MODIFICAR | usar engine |
| `public/participante/fronts/resta-um.html` | MODIFICAR | remover LP estática |
| `public/participante/js/modules/participante-resta-um.js` | MODIFICAR | usar engine |

---

## Task 1: Criar `module-lp-engine.js`

**Files:**
- Create: `public/participante/js/modules/module-lp-engine.js`

- [ ] **Step 1: Criar o arquivo**

O arquivo exporta uma única função `injectModuleLP(config)`. Config fields:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `wrapperId` | string | sim | ID do div LP criado pela engine |
| `insertBefore` | string | sim | ID do elemento âncora — LP inserida antes dele |
| `ligaId` | string | sim | ID da liga ativa |
| `moduloKey` | string | sim | Chave para RegraModulo (ex: `'ranking_geral'`) |
| `titulo` | string | sim | Título do Hero |
| `tagline` | string | sim | Subtítulo do Hero |
| `icon` | string | sim | Material Icons name |
| `colorClass` | string | sim | Slug CSS ex: `'module-lp-ranking-geral'` |
| `premiacaoLabel` | string | não | Default: `'Premiação'` |
| `premiacaoSource` | string | não | `'regra'` (default) ou `'moduleconfig'` |
| `premiacaoModuleConfigFn` | fn | não | `async(ligaId)=>htmlString` para source moduleconfig |
| `showPremiacaoAccordion` | bool | não | Default `true`. Passar `false` para Extrato |

**Comportamento:**
1. Guard SPA: se `wrapperId` já existe no DOM → re-inicializa apenas listeners (não reinjecta HTML)
2. Cria wrapper LP + divider e insere antes do elemento `insertBefore` via `insertAdjacentHTML('beforebegin', html)`
3. Init accordion listeners — clonar botões para evitar listener leak em SPA
4. Fetch eager "Como Funciona": `GET /api/regras-modulos/{ligaId}/{moduloKey}`
5. Fetch eager "Premiação": source `'regra'` → `GET /api/regras-modulos/{ligaId}/{moduloKey}_premiacao`; source `'moduleconfig'` → chama `premiacaoModuleConfigFn(ligaId)`, fallback para `{moduloKey}_premiacao` se null
6. Placeholder quando premiação vazia: "Premiação definida pelo organizador da liga"

Referência de implementação: `participante-artilheiro.js` linhas 1325–1426 (funções `_lpCarregarComoFunciona`, `_initLPAccordions`, `_lpCarregarPremiacoesHibrida` — estas serão substituídas pelo engine).

- [ ] **Step 2: Testar importação no browser console**

```js
import('/participante/js/modules/module-lp-engine.js').then(m => console.log('ok', Object.keys(m)))
```
Esperado: `ok ['injectModuleLP']` sem erros.

- [ ] **Step 3: Commit**

```bash
git add public/participante/js/modules/module-lp-engine.js
git commit -m "feat(lp-engine): criar module-lp-engine.js com injectModuleLP genérico"
```

---

## Task 2: +9 color scopes em `module-lp.css`

**Files:**
- Modify: `public/participante/css/module-lp.css`

- [ ] **Step 1: Ler o arquivo para confirmar último scope existente (`.module-lp-resta-um` ~linha 55)**

- [ ] **Step 2: Adicionar após `.module-lp-resta-um` os 9 novos scopes**

Seguir o padrão exato das 4 entradas existentes: 7 variáveis por escopo (`--lp-primary`, `--lp-muted`, `--lp-muted-strong`, `--lp-border`, `--lp-gradient-hero`, `--lp-gradient-card`, `--lp-glow`). Sem valores hexadecimais hardcoded — usar `var(--app-*)` com fallback.

Mapeamento de cores:
- `.module-lp-ranking-geral` → `var(--app-purple, #8b5cf6)` / rgb(139,92,246)
- `.module-lp-ranking-rodada` → `var(--app-success-light, #22c55e)` / rgb(34,197,94)
- `.module-lp-top10` → `var(--app-warning, #f59e0b)` / rgb(245,158,11)
- `.module-lp-melhor-mes` → `var(--app-info, #06b6d4)` / rgb(6,182,212)
- `.module-lp-pontos-corridos` → `var(--app-success-light, #22c55e)` / rgb(34,197,94) (opacidade levemente menor que ranking-rodada)
- `.module-lp-mata-mata` → `var(--app-danger, #ef4444)` / rgb(239,68,68)
- `.module-lp-tiro-certo` → `var(--app-warning-orange, #f97316)` / rgb(249,115,22)
- `.module-lp-raio-x` → `var(--app-cyan, #06b6d4)` / rgb(6,182,212)
- `.module-lp-campinho` → `var(--app-success, #10b981)` / rgb(16,185,129)

Também adicionar CSS da tabela bônus/ônus (Ranking da Rodada):
```
.lp-bonus-table, .lp-bonus-row, .lp-bonus-ganho, .lp-bonus-perda,
.lp-bonus-neutro, .lp-bonus-val.ganho, .lp-bonus-val.perda, .lp-bonus-val.neutro
```
Cores: ganho=`var(--app-success-light)`, perda=`var(--app-danger)`, neutro=`var(--app-text-muted)`.

- [ ] **Step 3: Bump cache-bust em `public/participante/index.html` linha 116**

Localizar `href="css/module-lp.css"` e adicionar versão (ex: `href="css/module-lp.css?v=20260322"`). Por CLAUDE.md: modificação significativa de CSS exige incremento do `?v=`.

- [ ] **Step 4: Commit**

```bash
git add public/participante/css/module-lp.css public/participante/index.html
git commit -m "feat(lp-engine): +9 color scopes + .lp-bonus-table em module-lp.css"
```

---

## Task 3: Backend — seed defaults em `regras-modulos-routes.js`

**Files:**
- Modify: `routes/regras-modulos-routes.js`

> Ler o arquivo antes. Entradas JÁ existentes: `banco`, `ranking_geral`, `melhor_mes`, `pontos_corridos`, `mata_mata`, `artilheiro`, `luva_ouro`, `capitao_luxo`, `tiro_certo`, `resta_um`, mais os 4 `_premiacao` (artilheiro, luva_ouro, capitao_luxo, resta_um).

- [ ] **Step 1: Adicionar 2 entradas "Como Funciona" ao array `MODULOS_DEFAULT`**

Após a entrada `tiro_certo`, adicionar entradas para `raio_x` (ordem: 17) e `campinho` (ordem: 18) com texto descritivo em PT-BR explicando como o módulo funciona em linguagem leiga (estilo das entradas existentes).

- [ ] **Step 2: Adicionar 9 entradas `_premiacao` ao array `MODULOS_DEFAULT`**

Após as 4 entradas `_premiacao` existentes, adicionar:
- `ranking_geral_premiacao` (ordem: 116)
- `banco_premiacao` (ordem: 117) — fallback para quando wizard_respostas.valores_manual não configurado
- `top10_premiacao` (ordem: 118) — **sem underscore** (moduloKey existente é `top10`, não `top_10`)
- `melhor_mes_premiacao` (ordem: 119)
- `pontos_corridos_premiacao` (ordem: 120)
- `mata_mata_premiacao` (ordem: 121)
- `tiro_certo_premiacao` (ordem: 122)
- `raio_x_premiacao` (ordem: 123)
- `campinho_premiacao` (ordem: 124)

Cada entrada com texto default em PT-BR: "Premiação — [Módulo]", descrevendo brevemente + nota "Valores definidos pelo administrador da liga".

- [ ] **Step 3: Testar seed**

```bash
curl -s -X POST http://localhost:3000/api/regras-modulos/LIGA_ID/seed \
  -H "Cookie: connect.sid=SEU_COOKIE" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('criados:', d.criados?.length)"
```

- [ ] **Step 4: Commit**

```bash
git add routes/regras-modulos-routes.js
git commit -m "feat(lp-engine): +raio_x, campinho e 9 _premiacao no seed de regras-modulos"
```

---

## Task 4: Ranking Geral (primeiro caso — valida engine)

**Files:**
- Modify: `public/participante/fronts/ranking.html`
- Modify: `public/participante/js/modules/participante-ranking.js`

- [ ] **Step 1: Ler `ranking.html` e identificar o primeiro elemento filho da div raiz**

O anchor LP deve ser o primeiro filho da `<div>` raiz do fragment. Adicionar:
```html
<div id="ranking-lp-anchor"></div>
```

- [ ] **Step 2: Ler `participante-ranking.js` e adicionar `injectModuleLP` no início de `inicializarRankingParticipante`**

```js
import { injectModuleLP } from '/participante/js/modules/module-lp-engine.js';

// No início de inicializarRankingParticipante({ ligaId, ... }):
injectModuleLP({
    wrapperId:    'ranking-geral-lp-wrapper',
    insertBefore: 'ranking-lp-anchor',
    ligaId,
    moduloKey:    'ranking_geral',
    titulo:       'Ranking Geral',
    tagline:      'Classificação acumulada de toda a temporada',
    icon:         'leaderboard',
    colorClass:   'module-lp-ranking-geral',
});
```

- [ ] **Step 3: Verificar se `module-lp.css` é carregado pela página do participante**

Buscar em `index.html` (ou arquivo de layout do app participante) se `module-lp.css` já está incluído. Se não, adicionar `<link rel="stylesheet" href="/participante/css/module-lp.css">`.

- [ ] **Step 4: Testar no browser**

1. Navegar para Ranking Geral
2. Hero roxo com ícone `leaderboard` aparece
3. "Como Funciona" expande — conteúdo carrega
4. "Premiação" expande — placeholder ou texto configurado
5. Navegar para outra aba e voltar — LP não duplica

- [ ] **Step 5: Commit**

```bash
git add public/participante/fronts/ranking.html public/participante/js/modules/participante-ranking.js
git commit -m "feat(lp-engine): LP no Ranking Geral"
```

---

## Task 5: Ranking da Rodada (valida premiacaoSource moduleconfig)

**Files:**
- Modify: `public/participante/fronts/rodadas.html`
- Modify: `public/participante/js/modules/participante-rodadas.js`

- [ ] **Step 1: Ler `rodadas.html` e adicionar anchor `<div id="rodadas-lp-anchor"></div>` como primeiro filho**

- [ ] **Step 2: Ler `participante-rodadas.js` e adicionar função `buildPremiacaoRodadas` + `injectModuleLP`**

```js
// Endpoint: GET /api/liga/:ligaId/modulos/ranking_rodada
// (sem "s" em "liga" — padrão confirmado em participante-artilheiro.js)
// Lê: data.config?.wizard_respostas?.valores_manual
// Estrutura: flat map { "1": 20, "2": 15, ..., "N": -20 }
// Positivo = ganho (mito), negativo = perda (mico), ausente = neutro
// Retorna HTML da tabela .lp-bonus-table ou null se não configurado
async function buildPremiacaoRodadas(ligaId) { ... }
```

Config injectModuleLP:
```js
injectModuleLP({
    wrapperId:    'ranking-rodada-lp-wrapper',
    insertBefore: 'rodadas-lp-anchor',
    ligaId,
    moduloKey:    'banco',
    titulo:       'Ranking da Rodada',
    tagline:      'Ganhe e perca baseado na sua posição a cada rodada',
    icon:         'event',
    colorClass:   'module-lp-ranking-rodada',
    premiacaoLabel: 'Premiação por Rodada',
    premiacaoSource: 'moduleconfig',
    premiacaoModuleConfigFn: buildPremiacaoRodadas,
});
```

- [ ] **Step 3: Testar no browser**

1. Liga com ModuleConfig configurado: tabela bônus/ônus aparece
2. Liga sem configuração: fallback para texto de `banco_premiacao`

- [ ] **Step 4: Commit**

```bash
git add public/participante/fronts/rodadas.html public/participante/js/modules/participante-rodadas.js
git commit -m "feat(lp-engine): LP no Ranking da Rodada com tabela bônus/ônus"
```

---

## Tasks 6–12: TOP 10, Melhor do Mês, Pontos Corridos, Mata-Mata, Tiro Certo, Raio-X, Campinho

Cada task segue o mesmo padrão:

1. Ler HTML do módulo — identificar div raiz
2. Adicionar `<div id="{mod}-lp-anchor"></div>` como primeiro filho da div raiz
3. Ler JS do módulo — localizar função init (verificar assinatura para obter `ligaId`)
4. Adicionar `import { injectModuleLP }` e chamada no início do init
5. Testar no browser — Hero aparece, acordeões funcionam
6. Commit

| Task | HTML | JS | wrapperId | moduloKey | titulo | icon | colorClass |
|------|------|----|-----------|-----------|--------|------|-----------|
| 6 - TOP 10 | top10.html | participante-top10.js | top10-lp-wrapper | top10 | TOP 10 | military_tech | module-lp-top10 |
| 7 - Melhor Mês | melhor-mes.html | participante-melhor-mes.js | melhor-mes-lp-wrapper | melhor_mes | Melhor do Mês | calendar_month | module-lp-melhor-mes |
| 8 - Pontos Corridos | pontos-corridos.html | participante-pontos-corridos.js | pontos-corridos-lp-wrapper | pontos_corridos | Pontos Corridos | format_list_numbered | module-lp-pontos-corridos |
| 9 - Mata-Mata | mata-mata.html | participante-mata-mata.js | mata-mata-lp-wrapper | mata_mata | Mata-Mata | swords | module-lp-mata-mata |
| 10 - Tiro Certo | tiro-certo.html | participante-tiro-certo.js | tiro-certo-lp-wrapper | tiro_certo | Tiro Certo | gps_fixed | module-lp-tiro-certo |
| 11 - Raio-X | rodada-xray.html | participante-rodada-xray.js | raio-x-lp-wrapper | raio_x | Raio-X da Rodada | sensors | module-lp-raio-x |
| 12 - Campinho | campinho.html | participante-campinho.js | campinho-lp-wrapper | campinho | Campinho Virtual | stadium | module-lp-campinho |

Taglines sugeridas:
- TOP 10: "Melhores e piores pontuações da liga"
- Melhor do Mês: "Competição mensal — uma nova chance a cada mês"
- Pontos Corridos: "Campeonato interno estilo Brasileirão"
- Mata-Mata: "Eliminação direta — perca e esteja fora"
- Tiro Certo: "Modo Survival — escolha o vencedor ou seja eliminado"
- Raio-X: "Análise completa após cada rodada"
- Campinho: "Sua escalação no campo, ao vivo"

Commits individuais por módulo:
```bash
git commit -m "feat(lp-engine): LP no [Nome do Módulo]"
```

---

## Tasks 13–16: Migrar Artilheiro, Luva de Ouro, Capitão, Resta Um

Para cada módulo:

- [ ] **Step 1: Ler o HTML e identificar o bloco LP estático**

O bloco começa com `<div class="module-lp module-lp-{slug}" id="{mod}-lp-wrapper">` e termina com `</div><!-- /module-lp-... -->`. Logo abaixo há `<div class="module-lp-divider ...">`. Remover ambos.

- [ ] **Step 2: Ler o JS e verificar as linhas com `_initLPAccordions`, `_lpCarregarComoFunciona`, `_lpCarregarPremiacoesHibrida`**

Substituir as 3 linhas por `injectModuleLP({...})`.

| Módulo | insertBefore | moduloKey | colorClass |
|--------|-------------|-----------|-----------|
| Artilheiro | artilheiro-content | artilheiro | module-lp-artilheiro |
| Luva de Ouro | luvaOuroContainer | luva_ouro | module-lp-luva |
| Capitão de Luxo | capitaoContent | capitao_luxo | module-lp-capitao |
| Resta Um | resta-um-content | resta_um | module-lp-resta-um |

> IDs confirmados lendo os HTMLs — não são placeholders.

- [ ] **Step 3: Remover funções inline `_lp*` do JS**

Todos os 4 módulos têm cópias locais das funções `_lp*` (não importam de outros arquivos).

- **Artilheiro** (~linhas 1325–1426): remover `_lpCarregarComoFunciona`, `_initLPAccordions`, `_lpFormatCurrency`, `_lpCarregarPremiacoesHibrida`, `_lpRenderFinanceiroHtml`
- **Luva de Ouro** e **Capitão de Luxo**: mesmas funções locais — remover todas
- **Resta Um — atenção especial:**
  - REMOVER: `_lpCarregarComoFunciona`, `_lpCarregarPremiacoesDynamic`, `_lpFormatCurrency`
  - **MANTER**: `_lpRenderRestaUmPremiacoes` — esta função sobrescreve o accordeão de Premiação com dados live quando `_carregarDados` encontra `dados.premiacao` (linha ~89: `if (dados.premiacao) _lpRenderRestaUmPremiacoes(dados.premiacao)`)
  - **Atualizar o ID interno** de `_lpRenderRestaUmPremiacoes`: a função busca `document.getElementById('lp-premiacoes-body-resta-um')` (ID do HTML estático). Após a migração o engine cria `id="lp-premiacoes-body-resta_um"` (moduloKey com underscore). Atualizar a linha da função para usar `'lp-premiacoes-body-resta_um'`

- [ ] **Step 4: Testar sem regressão**

Hero aparece idêntico ao anterior. Ranking/conteúdo do módulo continua carregando abaixo.

- [ ] **Step 5: Commits**

```bash
git commit -m "refactor(lp-engine): migrar Artilheiro para module-lp-engine"
git commit -m "refactor(lp-engine): migrar Luva de Ouro para module-lp-engine"
git commit -m "refactor(lp-engine): migrar Capitão de Luxo para module-lp-engine"
git commit -m "refactor(lp-engine): migrar Resta Um para module-lp-engine"
```

---

## Task 17: Verificação final + push

- [ ] **Checklist dos 13 módulos no browser:**
  - [ ] Ranking Geral
  - [ ] Ranking da Rodada (tabela bônus/ônus)
  - [ ] TOP 10
  - [ ] Melhor do Mês
  - [ ] Pontos Corridos
  - [ ] Mata-Mata
  - [ ] Tiro Certo
  - [ ] Raio-X da Rodada
  - [ ] Campinho Virtual
  - [ ] Artilheiro (sem regressão)
  - [ ] Luva de Ouro (sem regressão)
  - [ ] Capitão de Luxo (sem regressão)
  - [ ] Resta Um (sem regressão)

- [ ] **Verificar painel admin `regras.html`** — Seed gera `raio_x`, `campinho`, todos os `_premiacao` novos

- [ ] **Push**

```bash
git push origin main
```

---

## Referências

- Spec: `docs/superpowers/specs/2026-03-22-module-lp-engine.md`
- CSS existente: `public/participante/css/module-lp.css`
- LP pattern atual: `participante-artilheiro.js` linhas 1325–1426
- API regras: `routes/regras-modulos-routes.js`
- Endpoint ModuleConfig: `/api/liga/:ligaId/modulos/:moduloSlug` (sem "s" em liga)
