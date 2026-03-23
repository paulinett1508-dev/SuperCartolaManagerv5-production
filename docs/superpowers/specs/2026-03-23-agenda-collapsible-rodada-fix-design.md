# Design: Agenda do Dia Collapsivel + Fix Rodada Atual + Fix Info do Meu Time

**Data:** 2026-03-23
**Branch:** fix/premium-auth-oidc-ropc-deprecated (base para nova branch)
**Status:** Aprovado pelo usuario

---

## Contexto

A tela "Agenda e Tabelas" (`/participante/fronts/agenda-tabelas.html`) exibe dois blocos:

1. **Agenda do Dia** — jogos do dia via `/api/jogos-ao-vivo` (module `participante-jogos.js`)
2. **Tabela do Brasileirao** — colapsivel completo via `brasileirao-tabela.js` v2.2

**Problema 1:** A Agenda do Dia e um container plano — sem header, sem collapsible.
**Problema 2:** A Tabela do Brasileirao exibe Rodada N+1 quando o campeonato esta na Rodada N. Causa raiz: `obterRodadaAtual()` usa `dataFimRodada < hoje` para pular rodadas, mas dados stale (sync as 6h) mantem jogos da rodada atual como `agendado` mesmo apos realizados. Data passada pula rodada atual e retorna a proxima.
**Problema 3:** "Info do Meu Time" fica eternamente no estado "Carregando...". Causa raiz: o modulo nao esta registrado em `modulosPaths` em `participante-navigation.js`. O HTML e inserido via `container.innerHTML`, o que impede a execucao do `<script type="module">` inline (comportamento padrao do browser). Sem JS ativo, o spinner nunca e substituido.

---

## Feature 1: Collapsible "Agenda do Dia"

### Estrutura HTML — `agenda-tabelas.html`

Substituir o container plano pelo wrapper colapsivel:

```html
<section id="agenda-section" class="agenda-section mx-4 mb-2">
  <button class="agenda-header" id="agenda-header">
    <div class="agenda-header-left">
      <div class="agenda-icon">
        <span class="material-icons">today</span>
      </div>
      <div class="agenda-header-info">
        <h2 class="agenda-header-title">Agenda do Dia</h2>
        <span class="agenda-header-sub" id="agenda-header-sub">Carregando...</span>
      </div>
    </div>
    <div class="agenda-header-right" id="agenda-header-right">
      <!-- badge "N AO VIVO" injetado via JS quando aoVivo=true -->
      <span class="material-icons agenda-chevron" id="agenda-chevron">expand_more</span>
    </div>
  </button>

  <div class="agenda-content collapsed" id="agenda-content">
    <div id="agenda-jogos-container">
      <!-- loading spinner inicial preservado aqui -->
    </div>
  </div>
</section>
```

### Logica JS — `participante-agenda-tabelas.js`

**1. Bind collapse/expand** (executar no inicio de `inicializarAgendaTabelasParticipante`):

Bind click no `agenda-header` que faz toggle da classe `collapsed` em `agenda-content` e `expanded` em `agenda-section`.

**2. Funcao `_atualizarHeaderAgenda(result)`** — chamada tanto no load inicial quanto no callback do auto-refresh:

- Contar jogos ao vivo: filtrar `result.jogos` por `statusRaw` nos valores `['1H','2H','HT','ET','P','BT','LIVE']`
- Sub-label (via `element.textContent` — nao innerHTML):
  - Se `jogosAoVivo > 0`: `"N ao vivo agora"`
  - Se `totalJogos > 0`: `"N jogo(s) hoje"`
  - Caso contrario: `result.mensagem || "Sem jogos brasileiros hoje"`
- Badge AO VIVO: remover badge existente antes de re-inserir (evita duplicatas no auto-refresh). Construir com `document.createElement` + `textContent`, nao com innerHTML. Inserir antes do chevron via `insertBefore`. Remover se nao ha jogos ao vivo.

**Importante:** `_atualizarHeaderAgenda` deve ser chamada tanto apos o render inicial quanto dentro do callback de auto-refresh — garantindo que o badge suma se os jogos encerrarem.

### CSS — `brasileirao-tabela.css`

Adicionar ao final do arquivo as classes `.agenda-*`, espelhando exatamente as `.brasileirao-*` existentes:

| Classe nova | Espelha |
|---|---|
| `.agenda-section` | `.brasileirao-section` |
| `.agenda-header` | `.brasileirao-header` |
| `.agenda-header-left` | `.brasileirao-header-left` |
| `.agenda-header-right` | `.brasileirao-header-right` |
| `.agenda-header-title` | `.brasileirao-header-title` |
| `.agenda-header-sub` | `.brasileirao-header-sub` |
| `.agenda-icon` | `.brasileirao-icon` |
| `.agenda-chevron` | `.brasileirao-chevron` (rotate 180 graus ao expandir via `.agenda-section.expanded .agenda-chevron`) |
| `.agenda-content` | `.brasileirao-content` |
| `.agenda-content.collapsed` | `max-height: 0; overflow: hidden` |

**Expanded max-height:** `max-height: 800px` com `transition: max-height 0.35s ease` (igual a `.brasileirao-content`).

Zero cores hardcoded. Todos os tokens via variaveis CSS existentes.

### Cache busting

Incrementar `?v=X` no `<link rel="stylesheet">` de `brasileirao-tabela.css` em `public/participante/index.html`.

---

## Feature 2: Fix Rodada Atual — Cartola FC como Fonte de Verdade

### Campo correto da API Cartola FC

`GET https://api.cartola.globo.com/mercado/status` retorna:

```json
{ "rodada_atual": 8, "status_mercado": 1, ... }
```

O campo e `rodada_atual` no **nivel raiz** (nao aninhado).

### Implementacao — `services/brasileirao-tabela-service.js`

Adicionar funcao `obterRodadaCartola()` antes das funcoes de API publica:

- Cache em memoria: objeto `rodadaCartolaCache = { valor, timestamp }`, TTL 5 minutos
- Timeout via `AbortController` + `setTimeout` de 5000ms (node-fetch v3 nao suporta `timeout` nativo nas opcoes)
- Buscar `https://api.cartola.globo.com/mercado/status`
- Validar: `Number.isInteger(rodada) && rodada >= 1 && rodada <= 38`
- Se API retornar resposta valida mas campo invalido: `console.warn` (nao silencioso)
- Se falhar por rede/abort: `console.warn` com mensagem (nao silencioso)
- Retornar `null` em caso de falha (triggering fallback)

### Aplicar fix em DUAS funcoes

**`obterResumoParaExibicao(temporada)`** (usada pela faixa home):
- Calcular `rodadaAtual` pelo algoritmo atual
- Sobrescrever com `await obterRodadaCartola()` se nao nulo

**`obterTodasRodadas(temporada)`** (usada pelo LP tabela completa):
- `_renderTabelaCompletaConteudo` usa `data.stats?.rodada_atual` para destacar rodada atual nos acordeoes
- Apos montar stats, sobrescrever `stats.rodada_atual` com `await obterRodadaCartola()` se nao nulo

### Fallback chain

```
Cartola FC API (TTL 5min, timeout 5s)
  -> obterRodadaAtual() do model (se API falhar/retornar invalido)
    -> rodada 1 (se banco vazio)
```

---

## Feature 3: Fix "Info do Meu Time" — Spinner Eterno

### Causa raiz

`info-meu-time` nao esta em `modulosPaths` em `participante-navigation.js`. O HTML e injetado via `container.innerHTML = html`, que nao executa scripts. O `<script type="module">` inline no HTML e dead code — nunca roda.

### Solucao

**1. Criar `public/participante/js/modules/participante-info-meu-time.js`**

Exportar `inicializarInfoMeuTimeParticipante(payload)`:

- Obter `clubeId` — padrao igual a `participante-home.js` e `participante-agenda-tabelas.js` (payload NAO contem clube_id; unica fonte confiavel e `window.participanteAuth`):
  ```
  window.participanteAuth?.participante?.participante?.clube_id
  || window.participanteAuth?.participante?.clube_id
  || null
  ```
- Obter nome do clube (para atualizar subtitle):
  - Via `window.getClubesNomeMap()` se disponivel, usando `clubeId` como chave
- Se `clubeId` nulo: substituir container por mensagem "Nenhum time do coracao configurado" (sem spinner)
- Se `window.NoticiasTime` indefinido: substituir container por mensagem "Componente de noticias nao disponivel" (sem spinner — evita spinner eterno em caso de falha de carga do script)
- Se `window.NoticiasTime` disponivel: chamar `renderizar({ clubeId, containerId: 'info-meu-time-noticias', limite: 15, modo: 'completo' })`
- Apos render bem-sucedido: atualizar `#info-meu-time-subtitle` com o nome do clube via `element.textContent`

**2. Registrar em `participante-navigation.js`**

Adicionar entrada em `modulosPaths`:
```
"info-meu-time": "/participante/js/modules/participante-info-meu-time.js"
```

**3. Limpar `info-meu-time.html`**

Remover o bloco `<script type="module">` inteiro (dead code confirmado).

### Arquivos tocados

- `public/participante/js/modules/participante-info-meu-time.js` — novo arquivo
- `public/participante/js/participante-navigation.js` — adicionar 1 linha em `modulosPaths`
- `public/participante/fronts/info-meu-time.html` — remover script inline

---

## Arquivos Modificados (Resumo Completo)

| Arquivo | Mudanca |
|---|---|
| `public/participante/fronts/agenda-tabelas.html` | Substituir container plano por wrapper colapsivel |
| `public/participante/js/modules/participante-agenda-tabelas.js` | Bind collapse + `_atualizarHeaderAgenda` em load e auto-refresh |
| `public/participante/css/brasileirao-tabela.css` | Adicionar classes `.agenda-*` no final |
| `public/participante/index.html` | Bump `?v=X` no link CSS |
| `services/brasileirao-tabela-service.js` | `obterRodadaCartola` + aplicar nas duas funcoes |
| `public/participante/js/modules/participante-info-meu-time.js` | **NOVO** — modulo de inicializacao |
| `public/participante/js/participante-navigation.js` | Registrar `info-meu-time` em `modulosPaths` |
| `public/participante/fronts/info-meu-time.html` | Remover `<script type="module">` inline |

---

## Fora de Escopo

- `participante-jogos.js` — logica de busca inalterada
- `brasileirao-tabela.js` — colapsivel do Brasileirao inalterado
- `CalendarioBrasileirao.js` (model) — nao alterar `obterRodadaAtual()` (mantido como fallback)
- Nenhum novo endpoint de backend
- Bugs de 401 em `api/inscricoes` e 404 em `api/ligas/ranking` vistos no log sao de outros widgets (whats-happening-widget, home) — fora deste escopo

---

## Criterios de Aceitacao

1. Ao navegar para "Agenda e Tabelas", o bloco "Agenda do Dia" aparece colapsado
2. Clicar no header expande com animacao; clicar novamente recolhe
3. Apos load dos jogos, sub-label exibe contagem correta (ao vivo / total / sem jogos)
4. Badge "N AO VIVO" aparece no header quando ha jogos ao vivo; desaparece no proximo auto-refresh se nao houver mais
5. `rodada_atual` na faixa Tabela do Brasileirao bate com o campo `rodada_atual` de `https://api.cartola.globo.com/mercado/status`
6. Simulando falha da API Cartola (via mock ou desconexao), o sistema usa fallback sem erro visivel — apenas `console.warn` no servidor
7. Nenhuma cor hardcoded nova no CSS (verificar linhas adicionadas em `brasileirao-tabela.css`)
8. Ao navegar para "Info do Meu Time", as noticias do time do coracao carregam (spinner desaparece)
9. O subtitle da tela exibe o nome do clube do usuario
10. Se o usuario nao tiver `clube_id` configurado, exibe mensagem amigavel (sem spinner eterno)
