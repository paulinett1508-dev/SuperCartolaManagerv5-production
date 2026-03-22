# Spec: Module LP Engine — Landing Pages para todos os módulos

**Data:** 2026-03-22
**Status:** Aprovado
**Escopo:** Engine reutilizável de Landing Page + implementação em 13 módulos (9 novos + 4 migrados)

---

## 1. Objetivo

Todos os módulos ativos do app do participante devem exibir, antes do conteúdo principal, uma **Landing Page colapsável** composta por:

1. **Hero** — ícone, título e tagline do módulo
2. **Acordeão "Como Funciona"** — texto editável pelo admin via painel `regras.html` (RegraModulo)
3. **Acordeão "Premiação"** — texto editável pelo admin OU tabela de bônus/ônus (Ranking da Rodada)

**Exceção:** módulo Extrato Financeiro não exibe acordeão de Premiação.

Acordeões são colapsáveis. Conteúdo é carregado **ao inicializar o módulo** (eager, consistente com o padrão atual).

---

## 2. Abordagem: LP Engine Compartilhado (Opção A)

Criar `module-lp-engine.js` — um módulo JS que qualquer página de módulo importa e chama com um objeto de config. Elimina a duplicação atual (Artilheiro, Luva, Capitão, Resta Um têm LP duplicada) e padroniza os 9 novos.

---

## 3. Arquitetura

### 3.1 LP Engine — `public/participante/js/modules/module-lp-engine.js`

```js
/**
 * injectModuleLP(config)
 *
 * Cria e injeta o bloco LP (Hero + acordeões) antes do container do módulo.
 * Fetches de conteúdo são feitos EAGERLY no momento da injeção.
 * Idempotente: se wrapper já existe, re-inicializa apenas os listeners.
 */
export function injectModuleLP(config)
```

**Config object:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `wrapperId` | string | sim | ID que a engine atribui ao div LP criado (ex: `'ranking-lp-wrapper'`). Usado no guard de idempotência |
| `insertBefore` | string | sim | ID do container existente do módulo. A engine cria e insere o wrapper LP antes desse elemento. **O HTML não deve pré-declarar o wrapper** |
| `ligaId` | string | sim | ID da liga ativa |
| `moduloKey` | string | sim | Chave para buscar RegraModulo (ex: `'ranking_geral'`) |
| `titulo` | string | sim | Título exibido no Hero |
| `tagline` | string | sim | Subtítulo exibido no Hero |
| `icon` | string | sim | Nome do Material Icon |
| `colorClass` | string | sim | Classe CSS de escopo de cor. **Usar slug curto** (ex: `'module-lp-ranking-geral'`, `'module-lp-capitao'` — não `module-lp-capitao_luxo`) |
| `premiacaoLabel` | string | não | Rótulo do acordeão. Default: `'Premiação'` |
| `premiacaoSource` | string | não | `'regra'` (default) ou `'moduleconfig'` |
| `premiacaoModuleConfigFn` | async fn | não | `async (ligaId) => htmlString` — usada quando `premiacaoSource: 'moduleconfig'` |
| `showPremiacaoAccordion` | boolean | não | Default `true`. Passar `false` somente para Extrato Financeiro |

**Comportamento:**

1. **Guard de idempotência:** Se elemento com `wrapperId` já existe no DOM, apenas re-inicializa os accordion listeners (não reinjecta HTML). Necessário para re-navegação SPA onde o HTML fragment é recarregado mas a init é chamada novamente.
2. Cria o wrapper LP com Hero + acordeões e o insere `before` o elemento `insertBefore`. **O HTML do módulo apenas precisa do elemento âncora `insertBefore` — não pré-declara o wrapper.**
3. Carrega conteúdo de Como Funciona **eagerly**: `GET /api/regras-modulos/{ligaId}/{moduloKey}` → renderiza `data.regra.conteudo_html`
4. Carrega conteúdo de Premiação **eagerly**:
   - `premiacaoSource: 'regra'` → `GET /api/regras-modulos/{ligaId}/{moduloKey}_premiacao`. Se `conteudo_html` vazio ou request falha: renderiza placeholder `"Premiação definida pelo organizador da liga"`
   - `premiacaoSource: 'moduleconfig'` → chama `premiacaoModuleConfigFn(ligaId)`. Se retornar vazio: fallback para RegraModulo `{moduloKey}_premiacao` (ver seção 3.3)
5. Inicializa accordion toggles (click → expand/collapse com `max-height` animation + `aria-expanded`)
6. **Timing:** `injectModuleLP()` deve ser chamado APÓS o elemento `insertBefore` estar presente no DOM. Os módulos chamam a function no init, que já ocorre após DOM pronto (padrão SPA `readyState === 'loading'` check).

---

### 3.2 CSS — `public/participante/css/module-lp.css` (existente, expandir)

Adicionar blocos de color scoping para os 9 novos módulos, seguindo o padrão existente. **Convenção de nomenclatura:** usar slug curto, não o `moduloKey` completo.

| colorClass | Cor primária |
|------------|-------------|
| `.module-lp-ranking-geral` | `var(--app-purple, #8b5cf6)` |
| `.module-lp-ranking-rodada` | `var(--app-success-light, #22c55e)` |
| `.module-lp-top10` | `var(--app-warning, #f59e0b)` |
| `.module-lp-melhor-mes` | `var(--app-info, #06b6d4)` |
| `.module-lp-pontos-corridos` | `var(--app-success-light, #22c55e)` |
| `.module-lp-mata-mata` | `var(--app-danger, #ef4444)` |
| `.module-lp-tiro-certo` | `var(--app-warning-orange, #f97316)` |
| `.module-lp-raio-x` | `var(--app-cyan, #06b6d4)` |
| `.module-lp-campinho` | `var(--app-success, #10b981)` |

Cada entrada usa as mesmas 6 vars: `--lp-primary`, `--lp-muted`, `--lp-muted-strong`, `--lp-border`, `--lp-gradient-hero`, `--lp-glow` — conforme padrão das 4 entradas existentes no arquivo.

---

### 3.3 Premiação especial — Ranking da Rodada

Config: `premiacaoSource: 'moduleconfig'`, `premiacaoModuleConfigFn: buildPremiacaoRodadas`.

```js
async function buildPremiacaoRodadas(ligaId) {
  // Endpoint correto: GET /api/liga/:ligaId/modulos/ranking_rodada
  // (sem "s" em "liga" — padrão do app, confirmado em participante-artilheiro.js)
  //
  // Lê: data.config?.wizard_respostas?.valores_manual
  // Estrutura: flat map { "1": 20, "2": 15, ..., "N": -20 }
  // Positivo = bônus (zona de ganho / Mito), negativo = ônus (zona de perda / Mico), zero = neutro
  //
  // Renderiza tabela: Mito 1°/2°/..., Zona Neutra, ..., Mico último
}
```

**Fallback:** Se `valores_manual` estiver vazio ou não configurado, a função retorna `null` → engine faz fetch de `banco_premiacao` no RegraModulo como fallback. `banco_premiacao` é **somente** acessado nesse caso de fallback — nunca quando `valores_manual` está preenchido.

---

## 4. Backend — `routes/regras-modulos-routes.js`

### 4.1 Entradas "Como Funciona" a adicionar em MODULOS_DEFAULT

Apenas 2 entradas faltam (`top_10` e `tiro_certo` já existem no array):

| moduloKey | Título |
|-----------|--------|
| `raio_x` | Raio-X da Rodada |
| `campinho` | Campinho Virtual |

> `ranking_geral`, `banco` (rodadas), `top_10`, `melhor_mes`, `pontos_corridos`, `mata_mata`, `tiro_certo` já existem.

### 4.2 Entradas `_premiacao` a adicionar (todas novas)

| moduloKey | Conteúdo default |
|-----------|-----------------|
| `ranking_geral_premiacao` | Placeholder editável: "Premiação definida pelo organizador da liga" |
| `banco_premiacao` | Texto complementar / fallback quando wizard não configurado |
| `top_10_premiacao` | Placeholder editável |
| `melhor_mes_premiacao` | Placeholder editável |
| `pontos_corridos_premiacao` | Placeholder editável |
| `mata_mata_premiacao` | Placeholder editável |
| `tiro_certo_premiacao` | Placeholder editável |
| `raio_x_premiacao` | Placeholder editável |
| `campinho_premiacao` | Placeholder editável (módulo de visualização, mas permite premiação admin-configurável) |

> Extrato Financeiro: **sem** entrada `_premiacao` (accordion suprimido via `showPremiacaoAccordion: false`).

---

## 5. Arquivos tocados

### Novos
```
public/participante/js/modules/module-lp-engine.js
```

### Modificados — CSS
```
public/participante/css/module-lp.css         ← +9 color scopes
```

### Modificados — 9 novos módulos (HTML + JS)
```
public/participante/fronts/ranking.html              + participante-ranking.js
public/participante/fronts/rodadas.html              + participante-rodadas.js
public/participante/fronts/top10.html                + participante-top10.js
public/participante/fronts/melhor-mes.html           + participante-melhor-mes.js
public/participante/fronts/pontos-corridos.html      + participante-pontos-corridos.js
public/participante/fronts/mata-mata.html            + participante-mata-mata.js
public/participante/fronts/tiro-certo.html           + participante-tiro-certo.js
public/participante/fronts/rodada-xray.html          + participante-rodada-xray.js
public/participante/fronts/campinho.html             + participante-campinho.js
```

Cada HTML: adicionar `<link>` para `module-lp.css` se ausente. **Não pré-declarar wrapper LP** — a engine o cria. O HTML precisa apenas do elemento âncora `<div id="{modulo}-content">` existente.
Cada JS: importar `injectModuleLP` + chamar com config no init, após DOM pronto.

### Modificados — 4 módulos migrados (remove LP inline, usa engine)
```
public/participante/fronts/artilheiro.html           + participante-artilheiro.js
public/participante/fronts/luva-ouro.html            + participante-luva-ouro.js
public/participante/fronts/capitao.html              + participante-capitao.js
public/participante/fronts/resta-um.html             + participante-resta-um.js
```

LP inline removida de cada JS (`_lpCarregarComoFunciona`, `_lpCarregarPremiacoesHibrida`, `_initLPAccordions` e HTML estático LP no `.html`). `injectModuleLP` passa a ser o único ponto de renderização LP.

### Modificados — Backend
```
routes/regras-modulos-routes.js   ← +2 defaults "Como Funciona" + 9 defaults "_premiacao"
```

---

## 6. Ordem de implementação sugerida

1. **`module-lp-engine.js`** — engine genérico (base de tudo)
2. **`module-lp.css`** — +9 color scopes
3. **`regras-modulos-routes.js`** — +2 "Como Funciona" + 9 `_premiacao`
4. **Ranking Geral** (`ranking.html` + `participante-ranking.js`) — primeiro caso real, valida engine
5. **Ranking da Rodada** (`rodadas.html` + `participante-rodadas.js`) — valida `premiacaoSource: 'moduleconfig'` + `buildPremiacaoRodadas`
6. **7 módulos restantes** em paralelo (top10, melhor-mes, pontos-corridos, mata-mata, tiro-certo, raio-x, campinho)
7. **Migração dos 4 existentes** (artilheiro, luva, capitão, resta-um)

---

## 7. Critérios de aceite

- Todos os 13 módulos exibem Hero + acordeões antes do conteúdo
- Acordeões colapsam/expandem com animação `max-height`
- "Como Funciona" e "Premiação" carregados ao inicializar o módulo (eager)
- Placeholder "Premiação definida pelo organizador da liga" aparece quando admin não configurou
- Ranking da Rodada exibe tabela bônus/ônus de `wizard_respostas.valores_manual`; fallback para `banco_premiacao` se vazio
- Extrato Financeiro: sem acordeão de Premiação (`showPremiacaoAccordion: false`)
- Admin pode editar qualquer texto via `regras.html` + botão Seed gera defaults
- Sem regressão nos 4 módulos migrados (artilheiro, luva, capitão, resta-um)
- Sem cores hardcoded — apenas `var(--lp-*)` e `var(--app-*)`
- SPA-safe: re-navegação re-inicializa listeners sem duplicar HTML
- `injectModuleLP` chamado após elemento âncora `insertBefore` estar no DOM
