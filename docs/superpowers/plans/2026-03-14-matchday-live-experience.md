# Matchday Live Experience — Pacote Completo

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a experiência do participante durante partidas ao vivo com feedback visual rico (animações, toasts, skeletons, indicadores de tempo) e resiliência robusta (rate limiting matchday, circuit breaker, alertas de dados obsoletos, empty states diferenciados).

**Architecture:** Evolução incremental do `matchday-service.js` (event emitter central) + novos helpers no frontend. Backend: middleware de rate limiting específico para matchday + endpoint de health. CSS: reutilização máxima de tokens e animações existentes em `_app-tokens.css` e `matchday.css`.

**Tech Stack:** Vanilla JS (ES6) · CSS com tokens `_app-tokens.css` · Express middleware · Node.js

**Anti-Frankenstein Checklist (pré-implementação):**
- `_app-tokens.css` já tem: `app-fade-in-up`, `app-pulse`, `app-skeleton-shimmer`, `.skeleton-box`, z-index toast (700)
- `matchday.css` já tem: `live-update-flash`, `move-up`, `move-down`, `matchday-pulse`, `live-blink` — NÃO duplicar
- `error-toast.css` já tem: toast container, 4 estados (error/warning/info/success), animação enter/exit
- Cores: SEMPRE `var(--app-*)` tokens, NUNCA hardcoded
- Animações novas: apenas as que NÃO existem ainda (stale-pulse, countdown)

---

## Chunk 1: UX Visual — Feedback de Transição e Loading States

### Task 1: Toast de ativação/desativação do matchday

**Files:**
- Modify: `public/participante/js/matchday-service.js:103-119` (hooks de start/stop)
- Reference: `public/participante/css/error-toast.css` (componente toast existente)

**Contexto:** Quando o matchday ativa (`_onMatchdayStart`) ou desativa (`_onMatchdayStop`), o header aparece/desaparece silenciosamente. O participante não percebe a transição.

- [ ] **Step 1: Identificar o sistema de toast existente**

Verificar como o toast é chamado no app. Procurar por `showToast`, `mostrarToast`, `errorToast` no frontend participante.

- [ ] **Step 2: Adicionar toast na ativação do matchday**

Em `matchday-service.js`, na função `_onMatchdayStart()`, após `_injectHeader()`:

```javascript
// Notificar participante
if (window.AppToast) {
    window.AppToast.show({
        tipo: 'info',
        mensagem: 'Rodada ao vivo! Acompanhe as parciais em tempo real.',
        icone: 'sports_soccer',
        duracao: 4000
    });
}
```

- [ ] **Step 3: Adicionar toast na desativação do matchday**

Em `_onMatchdayStop()`, antes de `_emit('matchday:stop')`:

```javascript
if (window.AppToast) {
    window.AppToast.show({
        tipo: 'success',
        mensagem: 'Rodada encerrada! Resultados sendo consolidados.',
        icone: 'check_circle',
        duracao: 5000
    });
}
```

- [ ] **Step 4: Testar manualmente — verificar que toast aparece nas transições**

Verificar no browser que o toast utiliza o sistema existente de `error-toast.css`, sem CSS novo.

- [ ] **Step 5: Commit**

```bash
git add public/participante/js/matchday-service.js
git commit -m "feat(matchday): add toast notifications on matchday start/stop transitions"
```

---

### Task 2: Indicador de tempo relativo ("Atualizado há X min")

**Files:**
- Modify: `public/participante/js/matchday-service.js` (tracking de timestamp + emit)
- Modify: `public/participante/css/matchday.css` (estilos do indicador)

**Contexto:** Atualmente mostra "Atualizado às 19:34" em texto fixo. Participante precisa calcular mentalmente há quanto tempo foi. Melhor: "há 30s", "há 2 min".

- [ ] **Step 1: Adicionar tracking de timestamp no matchday-service**

No estado interno, adicionar:

```javascript
let _lastUpdateTs = null;
```

Em `_fetchParciais()`, após atualizar `_lastRanking`:

```javascript
_lastUpdateTs = Date.now();
```

Expor na API pública:

```javascript
get lastUpdateTs() { return _lastUpdateTs; },
```

- [ ] **Step 2: Criar helper de tempo relativo**

No `matchday-service.js`, função interna:

```javascript
function _formatTempoRelativo(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'agora';
    if (diff < 60) return `há ${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `há ${min} min`;
    return `há ${Math.floor(min / 60)}h`;
}
```

- [ ] **Step 3: Adicionar indicador no header do matchday**

Modificar `_injectHeader()` para incluir span de timestamp:

```javascript
<span class="matchday-header-ts" id="matchday-update-ts"></span>
```

Criar função `_updateTimestamp()` que atualiza o span a cada 10s:

```javascript
let _tsTimer = null;

function _updateTimestamp() {
    const el = document.getElementById('matchday-update-ts');
    if (el && _lastUpdateTs) {
        el.textContent = _formatTempoRelativo(_lastUpdateTs);
    }
}
```

Iniciar timer em `_onMatchdayStart`, limpar em `_onMatchdayStop`.

- [ ] **Step 4: Adicionar CSS para o indicador de timestamp**

Em `matchday.css`, adicionar (usando tokens existentes):

```css
.matchday-header-ts {
    font-family: var(--app-font-mono);
    font-size: var(--app-text-xs);
    color: var(--app-text-muted);
    margin-left: var(--app-space-sm);
    opacity: 0.7;
}
```

- [ ] **Step 5: Testar — verificar que "há Xs" atualiza corretamente**

- [ ] **Step 6: Commit**

```bash
git add public/participante/js/matchday-service.js public/participante/css/matchday.css
git commit -m "feat(matchday): add relative time indicator in live header"
```

---

### Task 3: Alerta visual de dados obsoletos (stale data)

**Files:**
- Modify: `public/participante/js/matchday-service.js` (detecção de stale)
- Modify: `public/participante/css/matchday.css` (estilo stale)

**Contexto:** Se a API não responde por >2 minutos durante live, o participante continua vendo dados antigos sem saber. Precisa de alerta visual.

- [ ] **Step 1: Detectar dados obsoletos no matchday-service**

Definir threshold e lógica:

```javascript
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 min sem atualizar = stale
let _isStale = false;
```

Na função `_updateTimestamp()`, verificar:

```javascript
function _updateTimestamp() {
    const el = document.getElementById('matchday-update-ts');
    if (!el || !_lastUpdateTs) return;

    const diff = Date.now() - _lastUpdateTs;
    const wasStale = _isStale;
    _isStale = diff > STALE_THRESHOLD_MS;

    el.textContent = _formatTempoRelativo(_lastUpdateTs);

    const header = document.getElementById('matchday-header-bar');
    if (header) {
        header.classList.toggle('matchday-stale', _isStale);
    }

    // Toast apenas na transição para stale
    if (_isStale && !wasStale && window.AppToast) {
        window.AppToast.show({
            tipo: 'warning',
            mensagem: 'Dados podem estar desatualizados. Verificando conexão...',
            icone: 'wifi_off',
            duracao: 6000
        });
    }
}
```

Expor na API: `get isStale() { return _isStale; }`

- [ ] **Step 2: Resetar stale quando dados chegam**

Em `_fetchParciais()`, após atualizar `_lastUpdateTs`:

```javascript
if (_isStale) {
    _isStale = false;
    const header = document.getElementById('matchday-header-bar');
    if (header) header.classList.remove('matchday-stale');
    if (window.AppToast) {
        window.AppToast.show({
            tipo: 'success',
            mensagem: 'Conexão restabelecida! Dados atualizados.',
            icone: 'wifi',
            duracao: 3000
        });
    }
}
```

- [ ] **Step 3: Adicionar CSS para estado stale**

Em `matchday.css`:

```css
.matchday-header.matchday-stale {
    background: var(--app-warning-dark, rgba(234, 179, 8, 0.15));
    border-color: var(--app-warning);
}

.matchday-header.matchday-stale .matchday-header-ts {
    color: var(--app-warning);
    opacity: 1;
    animation: app-pulse 2s ease-in-out infinite;
}
```

Nota: reutiliza `app-pulse` de `_app-tokens.css` — NÃO criar animação nova.

- [ ] **Step 4: Testar — simular rede lenta para validar stale e recovery**

- [ ] **Step 5: Commit**

```bash
git add public/participante/js/matchday-service.js public/participante/css/matchday.css
git commit -m "feat(matchday): add stale data detection with visual alert and recovery toast"
```

---

### Task 4: Skeleton loading para parciais

**Files:**
- Modify: `public/participante/js/matchday-service.js` (injetar skeleton antes dos dados)
- Modify: `public/participante/css/matchday.css` (skeleton styles)

**Contexto:** Quando parciais estão carregando pela primeira vez, mostra apenas "Carregando parciais...". Skeleton shimmer dá feedback visual superior.

- [ ] **Step 1: Criar template de skeleton ranking**

No `matchday-service.js`, função helper:

```javascript
function _createSkeletonRanking(count = 5) {
    return Array.from({ length: count }, (_, i) => `
        <div class="matchday-skeleton-row">
            <div class="skeleton-box" style="width:24px;height:24px;border-radius:50%"></div>
            <div class="skeleton-box" style="width:${120 - i * 10}px;height:14px;border-radius:4px"></div>
            <div class="skeleton-box" style="width:48px;height:14px;border-radius:4px;margin-left:auto"></div>
        </div>
    `).join('');
}
```

Nota: `.skeleton-box` já existe em `_app-tokens.css` com animação `app-skeleton-shimmer`.

- [ ] **Step 2: Injetar skeleton no início do matchday**

Em `_onMatchdayStart()`, emitir evento com skeleton:

```javascript
// Emitir skeleton para módulos que escutam
_emit('matchday:loading');
```

- [ ] **Step 3: Adicionar CSS mínimo para skeleton row**

Em `matchday.css`:

```css
.matchday-skeleton-row {
    display: flex;
    align-items: center;
    gap: var(--app-space-sm);
    padding: var(--app-space-sm) var(--app-space-md);
}
```

- [ ] **Step 4: Commit**

```bash
git add public/participante/js/matchday-service.js public/participante/css/matchday.css
git commit -m "feat(matchday): add skeleton loading state for parciais"
```

---

### Task 5: Ativar animações de mudança de posição (moving-up/moving-down)

**Files:**
- Modify: `public/participante/js/matchday-service.js` (tracking de posições + diff)

**Contexto:** CSS para `.moving-up`, `.moving-down`, `.live-updating` já existe em `matchday.css` mas NENHUM JS aplica essas classes. O `_updateTicker` calcula posições anteriores mas não emite dados de diff para os módulos consumidores.

- [ ] **Step 1: Enriquecer evento data:parciais com diff de posições**

Em `_fetchParciais()`, calcular diff antes de emitir:

```javascript
if (hash && hash !== _lastParciaisHash) {
    _lastParciaisHash = hash;
    const prevRanking = _lastRanking;
    _lastRanking = ranking;

    // Calcular diff de posições
    const prevMap = {};
    (prevRanking || []).forEach((r, i) => {
        const key = r.participante_id || r.nome;
        if (key) prevMap[key] = i + 1;
    });

    _lastDiff = ranking.map((r, i) => {
        const key = r.participante_id || r.nome;
        const prevPos = prevMap[key];
        const curPos = i + 1;
        return {
            key,
            prevPos: prevPos || null,
            curPos,
            direction: prevPos == null ? null
                : prevPos > curPos ? 'up'
                : prevPos < curPos ? 'down'
                : null
        };
    });

    _updateTicker(ranking, prevRanking);
    _lastUpdateTs = Date.now();
    // ... stale reset ...
    _emit('data:parciais');
}
```

Adicionar ao estado: `let _lastDiff = [];`

Expor na API pública:

```javascript
get lastDiff() { return _lastDiff; },
get lastRanking() { return _lastRanking; },
```

- [ ] **Step 2: Criar helper para aplicar classes de animação**

Expor como método utilitário na API pública:

```javascript
applyPositionAnimations(containerEl) {
    if (!containerEl || !_lastDiff.length) return;
    const rows = containerEl.querySelectorAll('[data-participant-key]');
    rows.forEach(row => {
        const key = row.dataset.participantKey;
        const diff = _lastDiff.find(d => d.key === key);
        if (!diff || !diff.direction) return;

        row.classList.add(diff.direction === 'up' ? 'moving-up' : 'moving-down');
        row.classList.add('live-updating');

        // Auto-remove após animação
        setTimeout(() => {
            row.classList.remove('moving-up', 'moving-down', 'live-updating');
        }, 800);
    });
},
```

- [ ] **Step 3: Documentar integração para módulos consumidores**

Os módulos que escutam `data:parciais` (artilheiro, capitão, luva) podem chamar:

```javascript
window.MatchdayService.on('data:parciais', () => {
    const container = document.querySelector('.meu-ranking-container');
    window.MatchdayService.applyPositionAnimations(container);
});
```

Nota: isso requer que os módulos adicionem `data-participant-key` nos seus ranking rows. Essa integração será feita caso a caso depois — nesta task, apenas o serviço central fica pronto.

- [ ] **Step 4: Commit**

```bash
git add public/participante/js/matchday-service.js
git commit -m "feat(matchday): expose position diff data and animation helper for ranking modules"
```

---

### Task 6: Empty states diferenciados

**Files:**
- Modify: `public/participante/js/matchday-service.js` (emitir estados tipados)
- Modify: `public/participante/css/matchday.css` (estilos de empty state)

**Contexto:** Hoje o mesmo visual genérico serve para "jogo não começou", "erro de API", e "carregando". Participante não sabe o que está acontecendo.

- [ ] **Step 1: Definir enum de estados e emitir via evento**

```javascript
const MATCHDAY_STATES = {
    LOADING: 'loading',          // Buscando dados pela primeira vez
    WAITING: 'waiting',          // Mercado fechado, jogos ainda não começaram
    LIVE: 'live',                // Dados fluindo normalmente
    STALE: 'stale',              // Sem atualização há >2min
    ERROR: 'error',              // Falha na API
    ENDED: 'ended'               // Rodada encerrada
};

let _currentState = null;
```

Emitir `matchday:state` com o estado atual sempre que mudar:

```javascript
function _setState(newState) {
    if (newState === _currentState) return;
    _currentState = newState;
    _emit('matchday:state');
}
```

Expor: `get currentState() { return _currentState; }`

- [ ] **Step 2: Integrar estados nos fluxos existentes**

- `_onMatchdayStart()`: `_setState(MATCHDAY_STATES.LOADING)`
- `_fetchParciais()` com dados: `_setState(MATCHDAY_STATES.LIVE)`
- `_fetchParciais()` sem atletas: `_setState(MATCHDAY_STATES.WAITING)`
- `_fetchParciais()` catch error: `_setState(MATCHDAY_STATES.ERROR)`
- `_updateTimestamp()` stale: `_setState(MATCHDAY_STATES.STALE)`
- `_onMatchdayStop()`: `_setState(MATCHDAY_STATES.ENDED)`

- [ ] **Step 3: Criar CSS para ícones de estado no ticker**

```css
.matchday-state-icon {
    font-size: var(--app-text-sm);
    margin-right: var(--app-space-xs);
}

.matchday-state-icon.state-loading { color: var(--app-info); }
.matchday-state-icon.state-waiting { color: var(--app-text-muted); }
.matchday-state-icon.state-live { color: var(--app-success); }
.matchday-state-icon.state-stale { color: var(--app-warning); }
.matchday-state-icon.state-error { color: var(--app-danger); }
```

- [ ] **Step 4: Commit**

```bash
git add public/participante/js/matchday-service.js public/participante/css/matchday.css
git commit -m "feat(matchday): add differentiated empty states with typed state machine"
```

---

## Chunk 2: Resiliência — Rate Limiting, Circuit Breaker, Error Feedback

### Task 7: Rate limiter específico para endpoints matchday

**Files:**
- Modify: `middleware/security.js` (adicionar limiter matchday)
- Modify: `routes/matchday-routes.js` (aplicar middleware)

**Contexto:** O rate limiter global permite 500 req/min por IP. Durante live com muitos participantes, os endpoints `/api/matchday/*` recebem carga desproporcional. Precisa de limite dedicado mais restritivo.

- [ ] **Step 1: Criar factory de rate limiter no security.js**

Em `middleware/security.js`, exportar nova função:

```javascript
function createMatchdayRateLimiter() {
    const store = new Map();
    const WINDOW_MS = 60 * 1000; // 1 min
    const MAX_REQUESTS = 30;     // 30 req/min por IP (suficiente para polling 30s)

    // Cleanup a cada 5 min
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (now - entry.start > WINDOW_MS * 2) store.delete(key);
        }
    }, 5 * 60 * 1000);

    return (req, res, next) => {
        const ip = _getClientIP(req);
        const now = Date.now();
        let entry = store.get(ip);

        if (!entry || now - entry.start > WINDOW_MS) {
            entry = { count: 0, start: now };
            store.set(ip, entry);
        }

        entry.count++;

        if (entry.count > MAX_REQUESTS) {
            const retryAfter = Math.ceil((entry.start + WINDOW_MS - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Muitas requisições de parciais',
                message: 'Aguarde antes de atualizar novamente',
                retryAfter
            });
        }

        next();
    };
}
```

Exportar: `module.exports = { setupSecurity, createAuthRateLimiter, createMatchdayRateLimiter };`

- [ ] **Step 2: Aplicar na rota matchday**

Em `routes/matchday-routes.js`:

```javascript
import { createMatchdayRateLimiter } from '../middleware/security.js';

const matchdayLimiter = createMatchdayRateLimiter();
router.use(matchdayLimiter);
```

- [ ] **Step 3: Testar — simular burst de requests**

```bash
# Enviar 35 requests rápidos ao endpoint
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/matchday/status; done
# Esperar: primeiros 30 retornam 200, últimos 5 retornam 429
```

- [ ] **Step 4: Commit**

```bash
git add middleware/security.js routes/matchday-routes.js
git commit -m "feat(matchday): add dedicated rate limiter for matchday endpoints (30 req/min)"
```

---

### Task 8: Cache headers nos endpoints matchday

**Files:**
- Modify: `routes/matchday-routes.js` (adicionar Cache-Control)

**Contexto:** Endpoints matchday não enviam cache headers. Browsers podem cachear agressivamente ou nunca cachear, desperdiçando bandwidth.

- [ ] **Step 1: Adicionar cache headers adequados**

No handler de `/api/matchday/status`:

```javascript
res.set({
    'Cache-Control': 'no-cache, must-revalidate',
    'X-Data-Freshness': 'live'
});
```

No handler de `/api/matchday/parciais/:ligaId`:

```javascript
res.set({
    'Cache-Control': 'private, max-age=15',
    'X-Data-Freshness': data?.parcial ? 'partial' : 'consolidated'
});
```

- [ ] **Step 2: Commit**

```bash
git add routes/matchday-routes.js
git commit -m "feat(matchday): add appropriate cache headers to matchday endpoints"
```

---

### Task 9: Tratamento de erros visíveis ao participante

**Files:**
- Modify: `public/participante/js/matchday-service.js` (error handling com feedback)

**Contexto:** Atualmente os catches em `_checkStatus()` e `_fetchParciais()` são silenciosos (`// Falha silenciosa`). O participante nunca sabe que algo falhou.

- [ ] **Step 1: Adicionar tracking de falhas consecutivas**

```javascript
let _consecutiveFailures = 0;
const MAX_SILENT_FAILURES = 3; // Após 3 falhas, notificar
```

- [ ] **Step 2: Modificar catch de _fetchParciais**

```javascript
async function _fetchParciais() {
    if (!_isActive || !_ligaId || _destroyed) return;
    try {
        const res = await fetch(`/api/matchday/parciais/${_ligaId}`, { cache: 'no-store' });

        if (res.status === 429) {
            // Rate limited — backoff automático
            clearInterval(_parciaisTimer);
            const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
            _parciaisTimer = setTimeout(() => {
                _startParciaisPolling();
            }, retryAfter * 1000);
            return;
        }

        if (!res.ok) {
            _consecutiveFailures++;
            if (_consecutiveFailures >= MAX_SILENT_FAILURES) {
                _setState(MATCHDAY_STATES.ERROR);
            }
            return;
        }

        _consecutiveFailures = 0; // Reset on success
        // ... rest of existing logic ...
    } catch (e) {
        _consecutiveFailures++;
        if (_consecutiveFailures >= MAX_SILENT_FAILURES) {
            _setState(MATCHDAY_STATES.ERROR);
            if (window.AppToast) {
                window.AppToast.show({
                    tipo: 'error',
                    mensagem: 'Erro ao buscar parciais. Tentando reconectar...',
                    icone: 'cloud_off',
                    duracao: 5000
                });
            }
        }
    }
}
```

- [ ] **Step 3: Adicionar recovery toast quando erros param**

Dentro do bloco de sucesso (após `_consecutiveFailures = 0`):

```javascript
if (_currentState === MATCHDAY_STATES.ERROR) {
    _setState(MATCHDAY_STATES.LIVE);
    if (window.AppToast) {
        window.AppToast.show({
            tipo: 'success',
            mensagem: 'Parciais reconectadas!',
            icone: 'cloud_done',
            duracao: 3000
        });
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add public/participante/js/matchday-service.js
git commit -m "feat(matchday): add visible error feedback with consecutive failure tracking"
```

---

### Task 10: Validação de input no endpoint parciais

**Files:**
- Modify: `routes/matchday-routes.js` (validar ligaId, tratar null response)

**Contexto:** Se `buscarRankingParcial()` retorna `null`, o frontend recebe `null` como JSON e crash. O `ligaId` não é validado como ObjectId.

- [ ] **Step 1: Adicionar validação de ligaId**

```javascript
router.get('/parciais/:ligaId', async (req, res) => {
    try {
        const { ligaId } = req.params;

        if (!ligaId || ligaId.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'ligaId inválido'
            });
        }

        const parciais = await buscarRankingParcial(ligaId);

        // Garantir resposta válida mesmo se service retornar null
        if (!parciais) {
            return res.json({
                disponivel: false,
                motivo: 'sem_dados',
                ranking: [],
                message: 'Parciais indisponíveis no momento'
            });
        }

        res.set({
            'Cache-Control': 'private, max-age=15',
            'X-Data-Freshness': parciais?.parcial ? 'partial' : 'consolidated'
        });

        res.json(parciais);
    } catch (err) {
        console.error('[Matchday] Erro parciais:', err.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar parciais',
            disponivel: false,
            ranking: []
        });
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add routes/matchday-routes.js
git commit -m "fix(matchday): add input validation and null-safe response in parciais endpoint"
```

---

### Task 11: Registro no css-registry.json

**Files:**
- Modify: `config/css-registry.json` (registrar novas classes)

**Contexto:** Anti-frankenstein exige que toda classe CSS nova seja registrada no registry.

- [ ] **Step 1: Adicionar entradas das novas classes**

Registrar em `css-registry.json` na seção de módulos de matchday:
- `.matchday-header-ts` (indicador de tempo)
- `.matchday-stale` (estado obsoleto)
- `.matchday-skeleton-row` (skeleton loading)
- `.matchday-state-icon` + variantes (empty states)

- [ ] **Step 2: Commit**

```bash
git add config/css-registry.json
git commit -m "chore: register new matchday CSS classes in css-registry.json"
```

---

### Task 12: Verificação final e push

**Files:**
- All modified files

- [ ] **Step 1: Rodar verificação de sintaxe JS**

```bash
node --check public/participante/js/matchday-service.js
node --check routes/matchday-routes.js
node --check middleware/security.js
```

- [ ] **Step 2: Verificar que server inicia sem erros**

```bash
timeout 10 node index.js 2>&1 | head -20
```

- [ ] **Step 3: Push para branch**

```bash
git push -u origin claude/matchday-live-experience-check-PRYOQ
```

---

## Resumo de Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Modify | `public/participante/js/matchday-service.js` | Tasks 1-6, 9 — Core UX + error handling |
| Modify | `public/participante/css/matchday.css` | Tasks 2-4, 6 — Estilos visuais |
| Modify | `routes/matchday-routes.js` | Tasks 7-8, 10 — Backend resilience |
| Modify | `middleware/security.js` | Task 7 — Rate limiter factory |
| Modify | `config/css-registry.json` | Task 11 — Registry anti-frankenstein |

**Nenhum arquivo novo criado.** Todas as mudanças são evoluções dos arquivos existentes.
