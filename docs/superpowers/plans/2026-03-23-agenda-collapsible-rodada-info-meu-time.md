# Agenda Collapsivel + Rodada Fix + Info do Meu Time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar collapsible na secao Agenda do Dia, corrigir rodada atual do Brasileirao usando Cartola FC API como fonte de verdade, e corrigir o spinner eterno na tela Info do Meu Time.

**Architecture:** Tres fixes independentes e cirurgicos. Backend: injecao de consulta a Cartola FC API em `brasileirao-tabela-service.js` com cache em memoria e fallback. Frontend: (a) wrapper HTML+CSS colapsivel espelhando padrao existente do Brasileirao, (b) novo modulo ES6 registrado no mapa de navegacao do SPA para substituir dead script inline.

**Tech Stack:** Node.js + node-fetch v3 (backend), Vanilla JS ES6 modules (frontend SPA), TailwindCSS + CSS custom properties, Jest (testes de backend)

**Spec:** `docs/superpowers/specs/2026-03-23-agenda-collapsible-rodada-fix-design.md`

---

## File Map

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| `services/brasileirao-tabela-service.js` | Modificar | Adicionar `obterRodadaCartola()` com cache+AbortController; aplicar nas duas funcoes de resumo |
| `public/participante/css/brasileirao-tabela.css` | Modificar | Adicionar classes `.agenda-*` no final do arquivo (nao alterar classes existentes) |
| `public/participante/fronts/agenda-tabelas.html` | Modificar | Substituir container plano por wrapper colapsivel |
| `public/participante/js/modules/participante-agenda-tabelas.js` | Modificar | Bind collapse/expand + funcao `_atualizarHeaderAgenda` no load e auto-refresh |
| `public/participante/index.html` | Modificar | Bump versao do CSS `brasileirao-tabela.css?v=20260322` para `?v=20260323` |
| `public/participante/js/modules/participante-info-meu-time.js` | **CRIAR** | Modulo de inicializacao da tela Info do Meu Time |
| `public/participante/js/participante-navigation.js` | Modificar | Adicionar `"info-meu-time"` em `modulosPaths` |
| `public/participante/fronts/info-meu-time.html` | Modificar | Remover `<script type="module">` inline (dead code) |

---

## Task 1: Backend — funcao `obterRodadaCartola` com cache e AbortController

**Files:**
- Modify: `services/brasileirao-tabela-service.js` (logo antes da secao `API PUBLICA DO SERVICE`)

**Contexto:** node-fetch v3 nao suporta `timeout` nas opcoes do fetch — usar `AbortController` + `setTimeout`. O campo da API Cartola FC e `rodada_atual` no nivel raiz do JSON. Cache de 5 minutos em memoria.

- [ ] **Localizar ponto de insercao**

  Abrir `services/brasileirao-tabela-service.js`. Localizar o comentario `// API PUBLICA DO SERVICE` (por volta da linha 365). Inserir o bloco abaixo imediatamente antes desta secao (apos `sincronizarTabela` e antes de `obterCalendarioCompleto`).

- [ ] **Inserir o modulo de cache e a funcao**

  ```js
  // =====================================================================
  // CARTOLA FC — FONTE DE VERDADE PARA RODADA ATUAL
  // =====================================================================

  let rodadaCartolaCache = { valor: null, timestamp: 0 };
  const RODADA_CARTOLA_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Consulta a API do Cartola FC para obter a rodada atual.
   * Cache de 5min. AbortController para timeout (node-fetch v3).
   * @returns {Promise<number|null>}
   */
  async function obterRodadaCartola() {
      if (rodadaCartolaCache.valor && Date.now() - rodadaCartolaCache.timestamp < RODADA_CARTOLA_TTL) {
          return rodadaCartolaCache.valor;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
          const res = await fetch('https://api.cartola.globo.com/mercado/status', {
              signal: controller.signal,
              headers: { 'User-Agent': 'SuperCartolaManager/1.0' },
          });
          clearTimeout(timeoutId);

          const data = await res.json();
          const rodada = data?.rodada_atual;

          if (Number.isInteger(rodada) && rodada >= 1 && rodada <= 38) {
              rodadaCartolaCache = { valor: rodada, timestamp: Date.now() };
              return rodada;
          }

          console.warn('[BRASILEIRAO-SERVICE] Cartola FC retornou rodada invalida:', rodada);
      } catch (err) {
          clearTimeout(timeoutId);
          if (err.name !== 'AbortError') {
              console.warn('[BRASILEIRAO-SERVICE] Falha ao consultar Cartola FC:', err.message);
          }
      }

      return null;
  }
  ```

- [ ] **Verificar sintaxe**: confirmar que o bloco esta fora de qualquer funcao existente.

- [ ] **Commit parcial**

  ```bash
  git add services/brasileirao-tabela-service.js
  git commit -m "feat(brasileirao): adiciona obterRodadaCartola() com cache 5min e AbortController"
  ```

---

## Task 2: Backend — aplicar `obterRodadaCartola` nas duas funcoes de resumo

**Files:**
- Modify: `services/brasileirao-tabela-service.js` — funcoes `obterResumoParaExibicao` e `obterTodasRodadas`

- [ ] **Fix em `obterResumoParaExibicao`**

  Localizar dentro da funcao a linha:
  ```js
  const rodadaAtual = calendario.obterRodadaAtual();
  ```

  Substituir por:
  ```js
  let rodadaAtual = calendario.obterRodadaAtual();
  const rodadaCartola = await obterRodadaCartola();
  if (rodadaCartola) rodadaAtual = rodadaCartola;
  ```

  > IMPORTANTE: As linhas seguintes da funcao (`calendario.obterRodada(rodadaAtual)`, `for (let r = rodadaAtual + 1 ...)`) ficam exatamente onde estao e ja recebem o valor corrigido — nao mover nada. O override deve ficar no lugar exato da linha original.

- [ ] **Fix em `obterTodasRodadas`**

  Localizar dentro da funcao:
  ```js
  const rodadaAtualDinamica = calendario.obterRodadaAtual();
  ```

  Substituir por:
  ```js
  let rodadaAtualDinamica = calendario.obterRodadaAtual();
  const rodadaCartolaRodadas = await obterRodadaCartola();
  if (rodadaCartolaRodadas) rodadaAtualDinamica = rodadaCartolaRodadas;
  ```

  > IMPORTANTE: Estas tres linhas devem ficar ANTES do bloco `return { ... }` que constroi o objeto stats — o valor de `rodadaAtualDinamica` e usado dentro do return e o override so funciona se vier antes.

- [ ] **Verificacao transitiva: `obterResuvoAoVivo`**

  `obterResumoAoVivo` (linha ~626) chama `obterResumoParaExibicao` internamente como fallback — herda a correcao automaticamente. Confirmar no codigo e nao alterar.

- [ ] **Teste manual de verificacao**

  ```bash
  curl -s "https://api.cartola.globo.com/mercado/status" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('rodada_atual:', j.rodada_atual)"
  ```

  Anotar o valor (ex: 8). Depois acessar `GET /api/brasileirao/resumo/2026` e confirmar que `rodada_atual` no response bate.

- [ ] **Commit**

  ```bash
  git add services/brasileirao-tabela-service.js
  git commit -m "fix(brasileirao): usa Cartola FC API como fonte de verdade para rodada_atual"
  ```

---

## Task 3: CSS — classes `.agenda-*` em `brasileirao-tabela.css`

**Files:**
- Modify: `public/participante/css/brasileirao-tabela.css` (adicionar no final)

**Contexto:** O header do Brasileirao usa um gradiente hardcoded verde. O header da Agenda usa variaveis CSS do design system (`--app-glass-bg`, `--app-glass-border`, `--app-primary`) — sem hardcode de cor.

- [ ] **Adicionar bloco ao final de `brasileirao-tabela.css`**

  ```css
  /* =====================================================================
     AGENDA DO DIA — Colapsavel (espelha padrao .brasileirao-*)
     Zero cores hardcoded — usa tokens do design system
     ===================================================================== */

  .agenda-section {
      padding: 0;
      position: relative;
  }

  .agenda-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 12px 16px;
      background: var(--app-glass-bg);
      border: 1px solid var(--app-glass-border);
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
  }

  .agenda-header:active {
      opacity: 0.85;
      transform: scale(0.995);
  }

  .agenda-section.expanded .agenda-header {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-color: transparent;
  }

  .agenda-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
  }

  .agenda-header-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
  }

  .agenda-header-title {
      font-family: 'Russo One', sans-serif;
      font-size: 13px;
      color: white;
      letter-spacing: 0.3px;
      margin: 0;
  }

  .agenda-header-sub {
      font-size: 10px;
      color: var(--app-text-muted);
  }

  .agenda-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
  }

  .agenda-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--app-glass-bg);
      border: 1px solid var(--app-glass-border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
  }

  .agenda-icon .material-icons {
      font-size: 16px;
      color: var(--app-primary);
  }

  .agenda-chevron {
      font-size: 20px;
      color: var(--app-text-muted);
      transition: transform 0.3s ease;
  }

  .agenda-section.expanded .agenda-chevron {
      transform: rotate(180deg);
  }

  .agenda-content {
      background: var(--app-glass-bg);
      border: 1px solid var(--app-glass-border);
      border-top: none;
      border-bottom-left-radius: 14px;
      border-bottom-right-radius: 14px;
      overflow: hidden;
      max-height: 800px;
      transition: max-height 0.35s ease;
  }

  .agenda-content.collapsed {
      max-height: 0;
      border-width: 0;
  }
  ```

- [ ] **Verificar ausencia de cores hardcoded nas novas linhas**

  ```bash
  grep -n "rgba\(\|rgb\(\|#[0-9a-fA-F]" public/participante/css/brasileirao-tabela.css | tail -30
  ```

  Confirmar que NENHUMA das linhas retornadas pertence as classes `.agenda-*` recentemente adicionadas. As linhas com cores hardcoded devem ser apenas das classes `.brasileirao-*` pre-existentes.

- [ ] **Commit**

  ```bash
  git add public/participante/css/brasileirao-tabela.css
  git commit -m "feat(css): adiciona classes .agenda-* colapsavel ao brasileirao-tabela.css"
  ```

---

## Task 4: HTML — wrapper colapsivel em `agenda-tabelas.html`

**Files:**
- Modify: `public/participante/fronts/agenda-tabelas.html`

- [ ] **Substituir o bloco Jogos do Dia**

  Localizar o bloco COMPLETO (do comentario ao fechamento do div externo):
  ```html
  <!-- Jogos do Dia (Agenda) -->
  <div id="agenda-jogos-container" class="mb-6">
      <div class="flex flex-col items-center justify-center py-10">
          <div class="w-10 h-10 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p class="text-sm text-gray-400">Carregando jogos do dia...</p>
      </div>
  </div>
  ```

  Substituir por:

  ```html
  <!-- Jogos do Dia (Agenda) — colapsavel -->
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
              <span class="material-icons agenda-chevron" id="agenda-chevron">expand_more</span>
          </div>
      </button>

      <div class="agenda-content collapsed" id="agenda-content">
          <div id="agenda-jogos-container">
              <div class="flex flex-col items-center justify-center py-10">
                  <div class="w-10 h-10 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                  <p class="text-sm text-gray-400">Carregando jogos do dia...</p>
              </div>
          </div>
      </div>
  </section>
  ```

- [ ] **Confirmar que `agenda-brasileirao-container` esta intacto** logo abaixo.

- [ ] **Commit**

  ```bash
  git add public/participante/fronts/agenda-tabelas.html
  git commit -m "feat(agenda): adiciona wrapper colapsivel na secao Agenda do Dia"
  ```

---

## Task 5: JS — bind collapse e `_atualizarHeaderAgenda` em `participante-agenda-tabelas.js`

**Files:**
- Modify: `public/participante/js/modules/participante-agenda-tabelas.js`

- [ ] **Ler o arquivo atual completo** para entender a estrutura de `inicializarAgendaTabelasParticipante`.

- [ ] **Inserir bind de collapse no inicio da funcao**

  Logo apos a abertura de `export async function inicializarAgendaTabelasParticipante() {`:

  ```js
  // --- Bind collapse/expand ---
  const _agendaHeader  = document.getElementById('agenda-header');
  const _agendaContent = document.getElementById('agenda-content');
  const _agendaSection = document.getElementById('agenda-section');
  let _agendaExpanded  = false;

  if (_agendaHeader && _agendaContent && _agendaSection) {
      _agendaHeader.addEventListener('click', () => {
          _agendaExpanded = !_agendaExpanded;
          _agendaContent.classList.toggle('collapsed', !_agendaExpanded);
          _agendaSection.classList.toggle('expanded', _agendaExpanded);
      });
  }
  ```

- [ ] **Adicionar a funcao helper `_atualizarHeaderAgenda`** logo apos o bind:

  ```js
  const _STATUS_AO_VIVO_AGENDA = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];

  function _atualizarHeaderAgenda(result) {
      const sub     = document.getElementById('agenda-header-sub');
      const right   = document.getElementById('agenda-header-right');
      const chevron = document.getElementById('agenda-chevron');

      const totalJogos  = result?.jogos?.length || 0;
      const jogosAoVivo = result?.jogos?.filter(
          j => _STATUS_AO_VIVO_AGENDA.includes(j.statusRaw)
      ).length || 0;

      // Sub-label via textContent (seguro, nunca interpreta HTML)
      if (sub) {
          if (jogosAoVivo > 0) {
              sub.textContent = jogosAoVivo + ' ao vivo agora';
          } else if (totalJogos > 0) {
              sub.textContent = totalJogos + ' jogo' + (totalJogos > 1 ? 's' : '') + ' hoje';
          } else {
              sub.textContent = result?.mensagem || 'Sem jogos brasileiros hoje';
          }
      }

      // Badge AO VIVO — sempre recriar do zero (evita duplicatas no auto-refresh)
      if (right && chevron) {
          const badgeExistente = right.querySelector('.agenda-live-badge');
          if (badgeExistente) badgeExistente.remove();

          if (jogosAoVivo > 0) {
              const badge = document.createElement('span');
              badge.className = 'agenda-live-badge brasileirao-live-badge';
              const dot = document.createElement('span');
              dot.className = 'brasileirao-live-dot';
              badge.appendChild(dot);
              badge.appendChild(document.createTextNode(jogosAoVivo + ' AO VIVO'));
              right.insertBefore(badge, chevron);
          }
      }
  }
  ```

- [ ] **Chamar `_atualizarHeaderAgenda(result)` apos o render inicial** (tanto no path de jogos encontrados quanto no path de container vazio — "Sem jogos brasileiros hoje").

- [ ] **Chamar `_atualizarHeaderAgenda(novoResult)` dentro do callback de auto-refresh**, apos re-renderizar o container.

- [ ] **Verificacao manual no browser**

  1. Navegar para "Agenda e Tabelas"
  2. Bloco "Agenda do Dia" deve estar colapsado ao entrar
  3. Clicar no header → expande com animacao
  4. Sub-label mostra contagem de jogos
  5. Clicar novamente → recolhe

- [ ] **Commit**

  ```bash
  git add public/participante/js/modules/participante-agenda-tabelas.js
  git commit -m "feat(agenda): bind collapse + atualizarHeaderAgenda com badge ao vivo"
  ```

---

## Task 6: CSS busting — bump versao em `index.html`

**Files:**
- Modify: `public/participante/index.html`

- [ ] **Localizar e atualizar**

  Localizar:
  ```
  css/brasileirao-tabela.css?v=20260322
  ```
  Substituir por:
  ```
  css/brasileirao-tabela.css?v=20260323
  ```

- [ ] **Commit**

  ```bash
  git add public/participante/index.html
  git commit -m "chore: bump brasileirao-tabela.css version para cache-busting"
  ```

---

## Task 7: Fix Info do Meu Time — criar modulo JS

**Files:**
- Create: `public/participante/js/modules/participante-info-meu-time.js`

**Contexto critico:**
- `clubeId` NAO esta no `payload` da navegacao — usar `window.participanteAuth` (padrao de `participante-home.js` e `participante-agenda-tabelas.js`)
- O sistema busca `inicializarInfoMeuTimeParticipante` — este nome exato deve ser exportado
- Usar `document.createElement` + `textContent` para renderizar mensagens de estado (nunca setando HTML via string diretamente)

- [ ] **Criar o arquivo**

  ```js
  // participante-info-meu-time.js - v1.0
  // Inicializador da tela Info do Meu Time
  // Fix: modulo ES6 substituindo dead script inline que nunca executava via innerHTML

  if (window.Log) Log.info('INFO-MEU-TIME', 'Inicializando...');

  function _renderMensagem(containerId, icone, texto) {
      const container = document.getElementById(containerId);
      if (!container) return;
      // Limpar conteudo atual
      while (container.firstChild) container.removeChild(container.firstChild);
      const div = document.createElement('div');
      div.className = 'text-center py-16';
      const icon = document.createElement('span');
      icon.className = 'material-icons text-4xl';
      icon.style.color = 'var(--app-text-dim)';
      icon.textContent = icone;
      const p = document.createElement('p');
      p.className = 'text-gray-400 mt-3 text-sm';
      p.textContent = texto;
      div.appendChild(icon);
      div.appendChild(p);
      container.appendChild(div);
  }

  export async function inicializarInfoMeuTimeParticipante(payload) {
      const subtitle = document.getElementById('info-meu-time-subtitle');

      // clubeId nao esta no payload — fonte: window.participanteAuth
      // (mesmo padrao de participante-home.js e participante-agenda-tabelas.js)
      const clubeId = window.participanteAuth?.participante?.participante?.clube_id
                   || window.participanteAuth?.participante?.clube_id
                   || null;

      // Atualizar subtitle com nome do clube
      if (clubeId && subtitle && window.getClubesNomeMap) {
          const nomeClube = window.getClubesNomeMap()[Number(clubeId)];
          if (nomeClube && nomeClube !== 'Seu Time') {
              subtitle.textContent = 'Noticias do ' + nomeClube;
          }
      }

      // Sem clube configurado
      if (!clubeId) {
          _renderMensagem('info-meu-time-noticias', 'newspaper', 'Nenhum time do coracao configurado');
          return;
      }

      // Componente de noticias nao carregado (falha de script defer)
      if (!window.NoticiasTime) {
          _renderMensagem('info-meu-time-noticias', 'newspaper', 'Componente de noticias nao disponivel');
          return;
      }

      // Renderizar noticias
      await window.NoticiasTime.renderizar({
          clubeId,
          containerId: 'info-meu-time-noticias',
          limite: 15,
          modo: 'completo',
      });
  }
  ```

- [ ] **Confirmar o nome da funcao exportada**

  O sistema de navegacao em `participante-navigation.js` (linhas ~1135-1145) converte:
  `"info-meu-time"` → camelCase `"InfoMeuTime"` → busca `inicializarInfoMeuTimeParticipante`.
  O arquivo exporta exatamente esse nome. OK.

- [ ] **Commit**

  ```bash
  git add public/participante/js/modules/participante-info-meu-time.js
  git commit -m "feat(info-meu-time): cria modulo JS de inicializacao (fix spinner eterno)"
  ```

---

## Task 8: Registrar modulo na navegacao + limpar HTML morto

**Files:**
- Modify: `public/participante/js/participante-navigation.js`
- Modify: `public/participante/fronts/info-meu-time.html`

- [ ] **Adicionar entrada em `modulosPaths`**

  Localizar o objeto `modulosPaths` (linha ~1100). Encontrar a ultima entrada e adicionar logo apos:

  ```js
  "info-meu-time": "/participante/js/modules/participante-info-meu-time.js",
  ```

- [ ] **Remover script inline de `info-meu-time.html`**

  Localizar e remover o bloco completo (dead code — nunca executava via innerHTML):

  ```html
  <script type="module">
      (async function() {
          ...
      })();
  </script>
  ```

  O arquivo deve terminar com o fechamento `</div>` de `#info-meu-time-container`.

- [ ] **Verificacao manual**

  1. Abrir o app com usuario que tem clube configurado
  2. Navegar para "Info do Meu Time"
  3. Spinner deve desaparecer e noticias aparecer
  4. Subtitle mostra nome do clube
  5. Navegar para home e voltar — funciona na segunda visita tambem

- [ ] **Commit final**

  ```bash
  git add public/participante/js/participante-navigation.js public/participante/fronts/info-meu-time.html
  git commit -m "fix(info-meu-time): registra modulo na navegacao SPA e remove dead script inline"
  ```

---

## Verificacao Final

- [ ] "Agenda e Tabelas": Agenda do Dia colapsada ao entrar, expande/recolhe, badge ao vivo funciona
- [ ] Rodada correta: `GET /api/brasileirao/resumo/2026` retorna `rodada_atual` igual ao da API Cartola FC
- [ ] "Info do Meu Time": noticias carregam sem spinner eterno
- [ ] Console do browser: sem erros novos
- [ ] CSS: nenhuma cor hex hardcoded nas novas classes

---

## Ordem de Commits

1. `feat(brasileirao): adiciona obterRodadaCartola() com cache 5min e AbortController`
2. `fix(brasileirao): usa Cartola FC API como fonte de verdade para rodada_atual`
3. `feat(css): adiciona classes .agenda-* colapsavel ao brasileirao-tabela.css`
4. `feat(agenda): adiciona wrapper colapsivel na secao Agenda do Dia`
5. `feat(agenda): bind collapse + atualizarHeaderAgenda com badge ao vivo`
6. `chore: bump brasileirao-tabela.css version para cache-busting`
7. `feat(info-meu-time): cria modulo JS de inicializacao (fix spinner eterno)`
8. `fix(info-meu-time): registra modulo na navegacao SPA e remove dead script inline`
