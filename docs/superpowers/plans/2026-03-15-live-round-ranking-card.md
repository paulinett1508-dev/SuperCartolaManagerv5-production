# Live Round Ranking Card — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero card on the participant home page with a compact, full-participant live ranking card during matchday, showing real-time partial scores and athletes on field.

**Architecture:** The backend endpoint `/api/matchday/parciais/:ligaId` is enhanced to include `atletasEmCampo`/`totalAtletas` per participant. The frontend `participante-home.js` renders an inline ranking card that subscribes to `MatchdayService` events (`data:parciais`). The existing hero card (`.home-hero-section`) is hidden during live mode and restored when the round consolidates. The matchday header/ticker is hidden on the home page via CSS when the live card is active.

**Tech Stack:** Vanilla JS (ES6), CSS3, Node.js backend, existing MatchdayService event system

**Spec:** `docs/superpowers/specs/2026-03-15-live-round-ranking-card-design.md`

---

## Chunk 1: Backend — Add `atletasEmCampo` to parciais response

### Task 1: Enhance `calcularPontuacaoTime()` and ranking response

**Files:**
- Modify: `services/parciaisRankingService.js`

- [ ] **Step 1: Modify `calcularPontuacaoTime()` to count athletes on field**

The function at line 122 currently returns `{ pontos: pontosTotais, calculado: true }` (line 147). Add counting logic inside the existing loop and add a second counter. Insert this code **before** the return at line 147:

```javascript
// Count athletes on field (starters only)
let atletasEmCampo = 0;
const totalAtletas = escalacao.atletas.length; // normally 12

for (const atleta of escalacao.atletas) {
    const pontuado = atletasPontuados[atleta.atleta_id];
    if (pontuado && pontuado.entrou_em_campo === true) {
        atletasEmCampo++;
    }
}

return { pontos: pontosTotais, calculado: true, atletasEmCampo, totalAtletas };
```

Also update the early return at line 124 to include the new fields:
```javascript
return { pontos: 0, calculado: false, atletasEmCampo: 0, totalAtletas: 0 };
```

- [ ] **Step 2: Propagate new fields to the ranking response object**

At line 295, the existing code is:
```javascript
let pontos, calculado;
```
Change to:
```javascript
let pontos, calculado, atletasEmCampo, totalAtletas;
```

At line 299, the existing destructuring is:
```javascript
({ pontos, calculado } = calcularPontuacaoTime(escalacao, atletasPontuados));
```
Change to:
```javascript
({ pontos, calculado, atletasEmCampo, totalAtletas } = calcularPontuacaoTime(escalacao, atletasPontuados));
```

In the DB fallback else branches (lines 300-311), add explicit null assignments so the variables are set:
```javascript
} else {
    const fallback = fallbackRodadaMap.get(participante.time_id);
    if (fallback && !fallback.rodadaNaoJogada) {
        pontos = fallback.pontos || 0;
        calculado = true;
    } else {
        pontos = 0;
        calculado = false;
    }
    // No API data in fallback — hide "X/12" on frontend
    atletasEmCampo = null;
    totalAtletas = null;
}
```

In the response object (lines 323-334), add after the `ativo` line:
```javascript
atletasEmCampo: atletasEmCampo ?? null,
totalAtletas: totalAtletas ?? null,
```

- [ ] **Step 3: Commit backend changes**

```bash
git add services/parciaisRankingService.js
git commit -m "feat(parciais): add atletasEmCampo and totalAtletas to ranking response

Enhanced calcularPontuacaoTime() to cross-reference team roster with
scored athletes API to count how many starters entered the field.
Returns null for DB fallback path (no API data available)."
```

---

## Chunk 2: Fix diff key in MatchdayService

### Task 2: Update diff key computation to use `timeId`

**Files:**
- Modify: `public/participante/js/matchday-service.js`

The diff key at lines 298 and 303 uses `r.participante_id || r.nome`, but the backend response has `timeId` and `nome_cartola` — neither `participante_id` nor `nome` exist. This means diff keys are `undefined` for all rows, breaking position change animations.

- [ ] **Step 1: Fix the diff key computation**

At line 298, change:
```javascript
const key = r.participante_id || r.nome;
```
To:
```javascript
const key = r.timeId || r.participante_id || r.nome;
```

At line 303, change the same pattern:
```javascript
const key = r.participante_id || r.nome;
```
To:
```javascript
const key = r.timeId || r.participante_id || r.nome;
```

- [ ] **Step 2: Also fix the `.toFixed(1)` truncation violation in the ticker**

At line 390, the ticker uses `r.pontos.toFixed(1)` which violates the truncation rule. Change to:
```javascript
// Change: r.pontos.toFixed(1)
// To: String(Math.trunc((r.pontos || 0) * 10) / 10)
```

- [ ] **Step 3: Commit matchday-service changes**

```bash
git add public/participante/js/matchday-service.js
git commit -m "fix(matchday): use timeId as diff key and fix toFixed truncation violation

The ranking response uses timeId, not participante_id or nome.
Also replaced .toFixed(1) with proper truncation in ticker."
```

---

## Chunk 3: Frontend CSS — Live ranking card styles

### Task 3: Add CSS classes for the live ranking card

**Files:**
- Modify: `public/participante/css/matchday.css` (append new styles)

- [ ] **Step 1: Add live ranking card CSS to matchday.css**

Append these styles at the end of `matchday.css` (after line ~227). All colors use CSS variables from `_app-tokens.css`.

```css
/* ============================================
   LIVE RANKING CARD (Home Hero Replacement)
   ============================================ */

.live-ranking-card {
    background: var(--participante-card, var(--app-surface));
    border: 1px solid var(--participante-border, rgba(255,255,255,0.08));
    border-radius: var(--app-card-radius, 12px);
    overflow: hidden;
    margin: 0 16px 12px;
}

.live-ranking-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--participante-border, rgba(255,255,255,0.08));
}

.live-ranking-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.live-ranking-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--app-success-light, #22c55e);
    animation: matchday-pulse 2s ease-in-out infinite;
}

.live-ranking-title {
    font-family: var(--app-font-brand, 'Russo One', sans-serif);
    font-size: 13px;
    color: var(--app-text-primary, #fff);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.live-ranking-ts {
    font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--app-text-muted, #9ca3af);
}

.live-ranking-list {
    padding: 4px 0;
}

.live-rank-row {
    display: flex;
    align-items: center;
    padding: 5px 14px;
    gap: 8px;
    min-height: 32px;
    transition: background 0.3s ease;
}

.live-rank-row:not(:last-child) {
    border-bottom: 1px solid var(--participante-border, rgba(255,255,255,0.04));
}

/* User's own row */
.live-rank-row--me {
    background: var(--app-primary-muted, rgba(255, 85, 0, 0.1));
    border-left: 3px solid var(--app-primary, #FF5500);
    padding-left: 11px;
}

.live-rank-pos {
    font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--app-text-muted, #9ca3af);
    min-width: 24px;
    text-align: right;
    flex-shrink: 0;
}

.live-rank-shields {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
}

.live-rank-shields img {
    width: 16px;
    height: 16px;
    border-radius: 2px;
    object-fit: contain;
}

.live-rank-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
}

.live-rank-nome {
    font-family: var(--app-font-base, 'Inter', sans-serif);
    font-size: 11px;
    color: var(--app-text-primary, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.live-rank-sep {
    font-size: 11px;
    color: var(--app-text-muted, #9ca3af);
    margin: 0 4px;
    flex-shrink: 0;
}

.live-rank-time {
    font-family: var(--app-font-base, 'Inter', sans-serif);
    font-size: 11px;
    color: var(--app-text-muted, #9ca3af);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.live-rank-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: auto;
}

.live-rank-pts {
    font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--app-text-primary, #fff);
    text-align: right;
    min-width: 48px;
}

.live-rank-campo {
    font-family: var(--app-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--app-text-muted, #9ca3af);
    min-width: 32px;
    text-align: right;
}

/* Position change animations */
@keyframes live-rank-up {
    0% { background: rgba(34, 197, 94, 0.15); }
    100% { background: transparent; }
}

@keyframes live-rank-down {
    0% { background: rgba(239, 68, 68, 0.15); }
    100% { background: transparent; }
}

.live-rank-row--up {
    animation: live-rank-up 0.8s ease-out;
}

.live-rank-row--down {
    animation: live-rank-down 0.8s ease-out;
}

.live-rank-row--me.live-rank-row--up,
.live-rank-row--me.live-rank-row--down {
    animation: none;
}

/* Footer link */
.live-ranking-footer {
    padding: 8px 14px 10px;
    border-top: 1px solid var(--participante-border, rgba(255,255,255,0.08));
    text-align: center;
}

.live-ranking-footer a {
    font-family: var(--app-font-base, 'Inter', sans-serif);
    font-size: 12px;
    color: var(--app-primary, #FF5500);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.live-ranking-footer a .material-icons {
    font-size: 16px;
}

/* Skeleton rows */
.live-rank-skeleton {
    display: flex;
    align-items: center;
    padding: 5px 14px;
    gap: 8px;
    min-height: 32px;
}

.live-rank-skeleton .skel-block {
    border-radius: 4px;
    height: 12px;
}

.live-rank-skeleton .skel-pos { width: 24px; }
.live-rank-skeleton .skel-shield { width: 16px; height: 16px; border-radius: 2px; }
.live-rank-skeleton .skel-name { flex: 1; }
.live-rank-skeleton .skel-pts { width: 48px; }

/* Error state */
.live-ranking-error {
    padding: 16px;
    text-align: center;
    color: var(--app-text-muted, #9ca3af);
    font-family: var(--app-font-base, 'Inter', sans-serif);
    font-size: 12px;
}

.live-ranking-error button {
    margin-top: 8px;
    padding: 6px 16px;
    background: var(--app-primary, #FF5500);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
}

/* Hide matchday header bar when live card is active on home */
.home-live-active #matchday-header-bar {
    display: none;
}
```

- [ ] **Step 2: Commit CSS changes**

```bash
git add public/participante/css/matchday.css
git commit -m "style(matchday): add live ranking card CSS classes

Compact row design (32px height, 11-12px fonts), position change
animations, user highlight row, skeleton loading, error state.
All colors via CSS variables from _app-tokens.css."
```

---

## Chunk 4: Frontend JS — Render and update the live ranking card

### Task 4: Implement live ranking card rendering in participante-home.js

**Files:**
- Modify: `public/participante/js/modules/participante-home.js`

**Critical context:**
- Hero card section: `<section class="home-hero-section">` (home.html line 26)
- User ID: `window.participanteAuth?.timeId`
- MatchdayService API: `.lastRanking`, `.lastDiff`, `.lastUpdateTs`, `.on(event, fn)`, `.off(event, fn)`, `.isActive`, `.currentState`, `.STATES`
- `data:parciais` event passes NO arguments — read `MatchdayService.lastRanking`
- Diff keys now use `timeId` (fixed in Chunk 2) — matches `data-time-id` on rows
- Points: TRUNCATE with `truncarPontos()` from participante-utils.js
- Ranking data: `{ timeId, nome_time, nome_cartola, escudo, clube_id, pontos, pontos_rodada_atual, atletasEmCampo, totalAtletas, posicao }`
- Round number (`rodada`) is at response level, NOT per-item. The `_lastRanking` is the raw array — round number is NOT included. Must be obtained from `MatchdayService` state or stored separately.

- [ ] **Step 1: Check how to get the current round number**

Read `matchday-service.js` to find if the current round number is exposed. Search for `rodada` in the public API. If not exposed, we need to add a getter. The parciais response has `rodada` at the top level, but `_lastRanking` only stores the `ranking` array.

If no getter exists, add one to `matchday-service.js`:
```javascript
// In the public API object (around line 420+):
get currentRodada() { return _currentRodada; },
```
And store it when parciais data arrives:
```javascript
// Where _lastRanking is set (line ~293), also store:
_currentRodada = data.rodada;
```

- [ ] **Step 2: Add the live ranking card functions to participante-home.js**

Place these functions after `atualizarCardsHomeComParciais()` (after line ~1436):

```javascript
// ============================================
// LIVE RANKING CARD
// ============================================

let _liveCardActive = false;
let _liveCardUnsubscribers = [];
let _prevLiveRanking = null; // For computing our own position diff

/**
 * Gera o HTML do card de ranking ao vivo
 */
function _buildLiveRankingHTML(ranking, rodada, meuTimeId) {
    const rows = ranking.map((p, idx) => {
        const isMe = p.timeId === meuTimeId;
        const meClass = isMe ? ' live-rank-row--me' : '';
        const pos = p._livePos || (idx + 1);

        // Brasão do clube (Cartola CDN)
        const brasaoImg = p.clube_id
            ? `<img src="https://s.sde.globo.com/media/escudo/time/${p.clube_id}.png" alt="" onerror="this.style.display='none'" loading="lazy">`
            : '';

        // Escudo do time fantasy
        const escudoImg = p.escudo
            ? `<img src="${p.escudo}" alt="" onerror="this.style.display='none'" loading="lazy">`
            : '';

        // Pontos da rodada (TRUNCAR, nunca arredondar)
        const pts = typeof window.truncarPontos === 'function'
            ? window.truncarPontos(p.pontos_rodada_atual ?? p.pontos ?? 0)
            : String(Math.trunc((p.pontos_rodada_atual ?? p.pontos ?? 0) * 100) / 100);

        // Atletas em campo
        const campoText = (p.atletasEmCampo != null && p.totalAtletas != null)
            ? `${p.atletasEmCampo}/${p.totalAtletas}`
            : '';

        const nome = p.nome_cartola || 'N/D';
        const nomeTime = p.nome_time || '';

        return `<div class="live-rank-row${meClass}" data-time-id="${p.timeId}">
            <span class="live-rank-pos">${pos}</span>
            <span class="live-rank-shields">${brasaoImg}${escudoImg}</span>
            <span class="live-rank-info">
                <span class="live-rank-nome">${nome}</span>
                <span class="live-rank-sep">·</span>
                <span class="live-rank-time">${nomeTime}</span>
            </span>
            <span class="live-rank-stats">
                <span class="live-rank-pts">${pts}</span>
                <span class="live-rank-campo">${campoText}</span>
            </span>
        </div>`;
    }).join('');

    return `<div class="live-ranking-card" id="live-ranking-card">
        <div class="live-ranking-header">
            <div class="live-ranking-header-left">
                <span class="live-ranking-dot"></span>
                <span class="live-ranking-title">Rodada ${rodada || ''} ao vivo</span>
            </div>
            <span class="live-ranking-ts" id="live-ranking-ts"></span>
        </div>
        <div class="live-ranking-list" id="live-ranking-list">
            ${rows}
        </div>
        <div class="live-ranking-footer">
            <a href="#" onclick="event.preventDefault(); window.participanteNav?.navegarPara('rodadas'); return false;">
                Ver detalhes da rodada
                <span class="material-icons">chevron_right</span>
            </a>
        </div>
    </div>`;
}

function _buildLiveRankingSkeleton() {
    const row = `<div class="live-rank-skeleton">
        <div class="skel-block skel-pos skeleton-box"></div>
        <div class="skel-block skel-shield skeleton-box"></div>
        <div class="skel-block skel-name skeleton-box"></div>
        <div class="skel-block skel-pts skeleton-box"></div>
    </div>`;
    return `<div class="live-ranking-card" id="live-ranking-card">
        <div class="live-ranking-header">
            <div class="live-ranking-header-left">
                <span class="live-ranking-dot"></span>
                <span class="live-ranking-title">Rodada ao vivo</span>
            </div>
            <span class="live-ranking-ts">carregando...</span>
        </div>
        <div class="live-ranking-list">${row.repeat(5)}</div>
    </div>`;
}

function _buildLiveRankingError() {
    return `<div class="live-ranking-card" id="live-ranking-card">
        <div class="live-ranking-header">
            <div class="live-ranking-header-left">
                <span class="live-ranking-dot" style="background:var(--app-danger)"></span>
                <span class="live-ranking-title">Rodada ao vivo</span>
            </div>
        </div>
        <div class="live-ranking-error">
            Parciais indisponíveis
            <br>
            <button onclick="window.MatchdayService?._fetchParciais?.()">Tentar novamente</button>
        </div>
    </div>`;
}

function _updateLiveTimestamp() {
    const el = document.getElementById('live-ranking-ts');
    if (!el || !window.MatchdayService) return;
    const ts = window.MatchdayService.lastUpdateTs;
    if (!ts) { el.textContent = ''; return; }
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) el.textContent = 'agora';
    else if (diff < 60) el.textContent = `há ${diff}s`;
    else el.textContent = `há ${Math.floor(diff / 60)}min`;
}

/**
 * Ordena ranking por pontos_rodada_atual DESC e calcula diff próprio
 * (não usa MS.lastDiff pois o backend ordena por pontos acumulados)
 */
function _sortAndDiffRanking(ranking) {
    const sorted = [...ranking].sort((a, b) =>
        (b.pontos_rodada_atual ?? b.pontos ?? 0) - (a.pontos_rodada_atual ?? a.pontos ?? 0)
    );
    sorted.forEach((p, i) => { p._livePos = i + 1; });

    // Compute own diff based on previous sorted positions
    const diffs = [];
    if (_prevLiveRanking) {
        const prevMap = {};
        _prevLiveRanking.forEach((p, i) => { prevMap[p.timeId] = i + 1; });
        for (const p of sorted) {
            const prev = prevMap[p.timeId];
            const cur = p._livePos;
            if (prev != null && prev !== cur) {
                diffs.push({
                    timeId: p.timeId,
                    direction: prev > cur ? 'up' : 'down'
                });
            }
        }
    }
    _prevLiveRanking = sorted;
    return { sorted, diffs };
}

/**
 * Ativa o card de ranking ao vivo, substituindo o hero card
 */
function ativarLiveRankingCard() {
    if (_liveCardActive) return;

    const heroSection = document.querySelector('.home-hero-section');
    if (!heroSection) return;

    const meuTimeId = window.participanteAuth?.timeId;
    const MS = window.MatchdayService;

    // Esconder hero card original
    heroSection.style.display = 'none';

    // Esconder matchday header bar na home
    document.getElementById('home-container')?.classList.add('home-live-active');

    // Criar container
    let container = document.getElementById('live-ranking-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'live-ranking-container';
        heroSection.parentNode.insertBefore(container, heroSection);
    }

    // Render inicial
    const ranking = MS?.lastRanking;
    if (ranking && ranking.length > 0) {
        const { sorted } = _sortAndDiffRanking(ranking);
        const rodada = MS.currentRodada || '';
        container.innerHTML = _buildLiveRankingHTML(sorted, rodada, meuTimeId);
        _updateLiveTimestamp();
    } else {
        container.innerHTML = _buildLiveRankingSkeleton();
    }

    // Event: novos dados parciais
    const onParciais = () => {
        const r = MS.lastRanking;
        if (!r || r.length === 0) return;

        const { sorted, diffs } = _sortAndDiffRanking(r);
        const rodada = MS.currentRodada || '';
        container.innerHTML = _buildLiveRankingHTML(sorted, rodada, meuTimeId);

        // Animações de mudança de posição
        for (const d of diffs) {
            const row = container.querySelector(`[data-time-id="${d.timeId}"]`);
            if (!row || row.classList.contains('live-rank-row--me')) continue;
            const cls = d.direction === 'up' ? 'live-rank-row--up' : 'live-rank-row--down';
            row.classList.add(cls);
            setTimeout(() => row.classList.remove(cls), 900);
        }

        _updateLiveTimestamp();
    };

    // Event: rodada encerrou
    const onStop = () => desativarLiveRankingCard();

    // Event: estado mudou (para capturar ERROR)
    const onState = () => {
        const state = MS.currentState;
        if (state === MS.STATES.ERROR) {
            container.innerHTML = _buildLiveRankingError();
        } else if (state === MS.STATES.ENDED) {
            desativarLiveRankingCard();
        }
    };

    MS?.on('data:parciais', onParciais);
    MS?.on('matchday:stop', onStop);
    MS?.on('matchday:state', onState);
    _liveCardUnsubscribers.push(
        () => MS?.off('data:parciais', onParciais),
        () => MS?.off('matchday:stop', onStop),
        () => MS?.off('matchday:state', onState)
    );

    // Timestamp updater a cada 10s
    const tsTimer = setInterval(_updateLiveTimestamp, 10000);
    _liveCardUnsubscribers.push(() => clearInterval(tsTimer));

    _liveCardActive = true;
}

/**
 * Desativa o card de ranking ao vivo, restaurando o hero card
 */
function desativarLiveRankingCard() {
    if (!_liveCardActive) return;

    _liveCardUnsubscribers.forEach(fn => fn());
    _liveCardUnsubscribers = [];
    _prevLiveRanking = null;

    const container = document.getElementById('live-ranking-container');
    if (container) container.remove();

    const heroSection = document.querySelector('.home-hero-section');
    if (heroSection) heroSection.style.display = '';

    document.getElementById('home-container')?.classList.remove('home-live-active');

    _liveCardActive = false;
}
```

- [ ] **Step 3: Integrate with home page initialization**

Find where the home module initializes (around the init/main function). Add this integration code:

```javascript
// Check if matchday is already active on load
if (window.MatchdayService?.isActive) {
    ativarLiveRankingCard();
}

// Listen for matchday state changes after home loads
if (window.MatchdayService) {
    window.MatchdayService.on('matchday:state', () => {
        const state = window.MatchdayService.currentState;
        const STATES = window.MatchdayService.STATES;
        if ((state === STATES.LIVE || state === STATES.LOADING) && !_liveCardActive) {
            ativarLiveRankingCard();
        }
    });
}
```

- [ ] **Step 4: Commit frontend JS changes**

```bash
git add public/participante/js/modules/participante-home.js public/participante/js/matchday-service.js
git commit -m "feat(home): add live ranking card replacing hero card during matchday

Shows all participants with position, club badge, team shield, name,
team name, partial round points (truncated), and athletes on field (X/12).
Computes its own position diff based on pontos_rodada_atual sort order.
Subscribes to MatchdayService events for 30s auto-updates.
Handles ERROR state with retry button.
Card auto-hides when round consolidates, restoring normal hero card."
```

---

## Chunk 5: Manual test and push

### Task 5: Verify and push

- [ ] **Step 1: Verify no syntax errors**

```bash
node -c services/parciaisRankingService.js && echo "Backend: OK"
node -c public/participante/js/matchday-service.js && echo "MatchdayService: OK"
node -c public/participante/js/modules/participante-home.js && echo "Home: OK"
```

Expected: All three files print "OK" with no syntax errors.

- [ ] **Step 2: Push all commits to feature branch**

```bash
git push -u origin claude/add-live-round-card-lwRnm
```

If push fails due to network, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).
