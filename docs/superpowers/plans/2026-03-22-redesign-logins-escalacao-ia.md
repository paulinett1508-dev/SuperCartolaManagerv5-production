# Redesign Logins + Premium Flow + Escalação IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar admin-login (split layout), participante-login (fluxo premium discreto), e limpar tokens no escalacao-ia; criar backend para auth de participante premium via conta Globo com verificação de `Liga.participantes[].premium`.

**Architecture:** Backend-first — novo endpoint `/api/participante/auth/premium` em `participante-auth.js` usando `cartolaProService.autenticar` já existente + verificação de `premium=true` em memória após `Liga.findOne`. Frontend em HTML+CSS inline puro (sem frameworks). Tokens CSS de `_admin-tokens.css` e `_app-tokens.css` para zero hardcode.

**Tech Stack:** Node.js/Express, MongoDB/Mongoose, Vanilla JS, CSS3, Material Icons, Jest (testes backend)

**Spec:** `docs/superpowers/specs/2026-03-22-redesign-logins-escalacao-ia.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `routes/participante-auth.js` | Modificar | Adicionar handler `POST /auth/premium` |
| `index.js` | Modificar | Wiring rate limiter para `/auth/premium` |
| `test/participante-auth-premium.test.js` | Criar | Testes do endpoint premium |
| `public/participante-login.html` | Modificar | Fluxo premium (link → flip → form Globo → explicação) |
| `public/admin-login.html` | Modificar | Split layout + migração 100% para tokens CSS |
| `public/css/modules/admin-escalacao-ia.css` | Modificar | Limpar hardcodes → tokens |
| `public/escalacao-ia.html` | Modificar | Incrementar `?v=8` no link CSS |

---

## Task 1: Endpoint `POST /api/participante/auth/premium`

**Arquivos:**
- Modificar: `routes/participante-auth.js` (adicionar após linha com `login-direto`)

- [ ] **1.1 Escrever o teste (falha esperada)**

Criar `test/participante-auth-premium.test.js`:

```javascript
// test/participante-auth-premium.test.js
import { jest } from '@jest/globals';

// Mocks
const mockAutenticar = jest.fn();
const mockBuscarMeuTime = jest.fn();
const mockLigaFindOne = jest.fn();

jest.mock('../services/cartolaProService.js', () => ({
  default: { autenticar: mockAutenticar, buscarMeuTime: mockBuscarMeuTime }
}));
jest.mock('../models/Liga.js', () => ({
  default: { findOne: mockLigaFindOne }
}));

describe('POST /api/participante/auth/premium', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retorna NOT_PREMIUM quando participante não tem premium=true', async () => {
    mockAutenticar.mockResolvedValue({ success: true, glbId: 'glb123' });
    mockBuscarMeuTime.mockResolvedValue({ success: true, time: { timeId: 999 } });
    mockLigaFindOne.mockResolvedValue({
      _id: 'liga1',
      participantes: [{ time_id: 999, premium: false }]
    });

    // Simular chamada ao handler diretamente
    const { handlerAuthPremium } = await import('../routes/participante-auth.js');
    const req = { body: { email: 'x@x.com', senha: 'abc' }, session: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlerAuthPremium(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'NOT_PREMIUM' })
    );
  });

  test('cria sessão com premium=true quando participante é premium', async () => {
    mockAutenticar.mockResolvedValue({ success: true, glbId: 'glb123' });
    mockBuscarMeuTime.mockResolvedValue({ success: true, time: { timeId: 13935277 } });
    mockLigaFindOne.mockResolvedValue({
      _id: 'liga1',
      participantes: [{ time_id: 13935277, premium: true, nome_cartola: 'Paulinett', nome_time: 'Urubu Play' }]
    });

    const { handlerAuthPremium } = await import('../routes/participante-auth.js');
    const req = { body: { email: 'p@p.com', senha: 'abc' }, session: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlerAuthPremium(req, res);

    expect(req.session.participante).toMatchObject({ premium: true, timeId: 13935277 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retorna INVALID_CREDENTIALS quando Globo rejeita', async () => {
    mockAutenticar.mockResolvedValue({ success: false, error: 'Credenciais invalidas' });

    const { handlerAuthPremium } = await import('../routes/participante-auth.js');
    const req = { body: { email: 'x@x.com', senha: 'wrong' }, session: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlerAuthPremium(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' })
    );
  });
});
```

- [ ] **1.2 Rodar o teste — confirmar falha**

```bash
cd /var/www/cartola
npm test -- test/participante-auth-premium.test.js 2>&1 | tail -20
```
Esperado: `Cannot find module` ou `handlerAuthPremium is not a function`

- [ ] **1.3 Implementar o handler em `participante-auth.js`**

Localizar o bloco de exports ou o final do arquivo. Adicionar a função **exportada** e a rota:

```javascript
// ── EXPORT para testes ──────────────────────────────────────────────
export async function handlerAuthPremium(req, res) {
    try {
        const { email, senha } = req.body;
        // NUNCA logar senha
        console.log('[PARTICIPANTE-AUTH] /auth/premium tentativa:', { email });

        if (!email || !senha) {
            return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: 'Email e senha são obrigatórios.' });
        }

        // 1. Autenticar na Globo
        const authResult = await cartolaProService.autenticar(email, senha);
        if (!authResult.success) {
            return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Email ou senha incorretos.' });
        }
        const glbId = authResult.glbId;

        // 2. Obter time_id
        const timeResult = await cartolaProService.buscarMeuTime(glbId);
        if (!timeResult.success || !timeResult.time?.timeId) {
            return res.status(400).json({ success: false, code: 'NO_TIME', message: 'Não foi possível obter seu time da conta Globo.' });
        }
        const timeId = timeResult.time.timeId;

        // 3. Buscar liga onde este time existe
        const { default: Liga } = await import('../models/Liga.js');
        const liga = await Liga.findOne({ 'participantes.time_id': timeId });
        if (!liga) {
            return res.status(404).json({ success: false, code: 'NO_LEAGUE', message: 'Time não encontrado em nenhuma liga.' });
        }

        // 4. Verificar premium em memória ($ operator inválido em filtro)
        const participante = liga.participantes.find(
            p => String(p.time_id) === String(timeId) && p.premium === true
        );
        if (!participante) {
            return res.status(403).json({ success: false, code: 'NOT_PREMIUM', message: 'Conta Globo válida, mas sem acesso Premium neste sistema.' });
        }

        // 5. Criar sessão
        req.session.participante = {
            timeId,
            ligaId: liga._id,
            premium: true,
            nome_cartola: participante.nome_cartola || '',
            nome_time:    participante.nome_time || '',
            foto_perfil:  participante.foto_perfil || '',
            foto_time:    participante.foto_time || '',
            clube_id:     participante.clube_id || null,
        };
        req.session.cartolaProAuth = {
            glbid:      glbId,
            email:      email,
            expires_at: Math.floor(Date.now() / 1000) + 7200,
        };

        console.log('[PARTICIPANTE-AUTH] /auth/premium sucesso:', { email, timeId });
        return res.json({ success: true });

    } catch (error) {
        console.error('[PARTICIPANTE-AUTH] /auth/premium erro:', error.message);
        return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Erro interno. Tente novamente.' });
    }
}

// Rota
router.post('/auth/premium', handlerAuthPremium);
```

> ⚠️ Atenção: `cartolaProService` já está importado no topo do arquivo. Verificar linha 7: `import cartolaProService from "../services/cartolaProService.js";`

- [ ] **1.4 Rodar os testes — confirmar green**

```bash
npm test -- test/participante-auth-premium.test.js 2>&1 | tail -20
```
Esperado: `3 passed`

- [ ] **1.5 Commit**

```bash
git add routes/participante-auth.js test/participante-auth-premium.test.js
git commit -m "feat(auth): endpoint POST /auth/premium para participante premium via Globo"
```

---

## Task 2: Rate limiter wiring em `index.js`

**Arquivos:**
- Modificar: `index.js` (linhas 573-575)

- [ ] **2.1 Adicionar rate limiter para a nova rota**

Localizar em `index.js`:
```javascript
app.use("/api/participante/auth/login", authRateLimiter);
app.use("/api/participante/auth/globo/direct", authRateLimiter);
app.use("/api/participante/auth", participanteAuthRoutes);
```

Adicionar linha antes do `app.use("/api/participante/auth",`:
```javascript
app.use("/api/participante/auth/premium", authRateLimiter);
```

Resultado final:
```javascript
app.use("/api/participante/auth/login", authRateLimiter);
app.use("/api/participante/auth/globo/direct", authRateLimiter);
app.use("/api/participante/auth/premium", authRateLimiter);   // ← novo
app.use("/api/participante/auth", participanteAuthRoutes);
```

- [ ] **2.2 Verificar que o servidor sobe sem erros**

```bash
node --input-type=module < /dev/null || npm run dev &
sleep 3
curl -s http://localhost:3000/api/participante/auth/premium \
  -X POST -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```
Esperado: `{ "success": false, "code": "MISSING_FIELDS" ... }`

- [ ] **2.3 Commit**

```bash
git add index.js
git commit -m "feat(security): rate limit em /api/participante/auth/premium"
```

---

## Task 3: `participante-login.html` — fluxo premium

**Arquivos:**
- Modificar: `public/participante-login.html` (1279 linhas — CSS inline + HTML + JS inline)

> Antes de editar: `Read public/participante-login.html` completo para localizar seções exatas.

- [ ] **3.1 Localizar o botão "Entrar" e adicionar o link discreto**

Encontrar o botão principal de submit (buscar `btn-gradient` ou `type="submit"`).
Após o botão, adicionar:

```html
<div class="premium-link-wrapper">
    <button type="button" id="btn-acesso-premium" class="btn-premium-link"
            onclick="premiumFlow.iniciar()">
        Acesso Premium
        <span class="premium-badge-link">PRO</span>
    </button>
</div>
```

Adicionar no `<style>` inline:
```css
.premium-link-wrapper {
    text-align: center;
    margin-top: 12px;
}
.btn-premium-link {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.28);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    font-family: var(--font-base, 'Inter', sans-serif);
    padding: 4px 8px;
    transition: color 0.2s ease;
}
.btn-premium-link:hover { color: rgba(255, 255, 255, 0.55); }
.premium-badge-link {
    display: inline-block;
    background: linear-gradient(135deg, var(--color-gold, #f59e0b), #d97706);
    color: #000;
    font-size: 8px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 8px;
    letter-spacing: 0.5px;
    vertical-align: middle;
    margin-left: 3px;
}
```

- [ ] **3.2 Criar o card de modo premium (Estado 2 — flip)**

Dentro do mesmo container do card de login, adicionar um segundo painel inicialmente oculto:

```html
<!-- Card Premium (oculto por padrão) -->
<div id="premium-card" class="premium-card" style="display:none;" aria-live="polite">

    <!-- Estado: formulário -->
    <div id="premium-form-panel">
        <div class="premium-card-header">
            <span class="material-symbols-outlined" style="color:var(--color-gold,#f59e0b);font-size:28px;">star</span>
            <h2 class="premium-card-title">Cartola Pro</h2>
            <p class="premium-card-sub">Conta Globo — mesmo login do Cartola FC</p>
        </div>
        <div class="premium-form">
            <input type="email" id="premium-email" class="premium-input"
                   placeholder="email@gmail.com" autocomplete="email" spellcheck="false">
            <input type="password" id="premium-senha" class="premium-input"
                   placeholder="Senha" autocomplete="current-password">
            <div id="premium-error" class="premium-error" style="display:none;"></div>
            <button type="button" id="premium-btn-conectar" class="premium-btn-connect"
                    onclick="premiumFlow.conectar()">
                <span class="material-symbols-outlined" id="premium-btn-icon">login</span>
                <span id="premium-btn-label">Conectar com Globo</span>
            </button>
        </div>
        <button type="button" class="premium-btn-voltar" onclick="premiumFlow.voltar()">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">arrow_back</span>
            Voltar ao login normal
        </button>
    </div>

    <!-- Estado: explicação (não é premium) -->
    <div id="premium-reject-panel" style="display:none;">
        <div class="premium-reject">
            <span class="material-symbols-outlined premium-reject-icon">block</span>
            <h3 class="premium-reject-title">Acesso negado</h3>
            <p class="premium-reject-msg">
                Você autenticou na Globo, mas não é participante Premium neste sistema.
            </p>
            <div class="premium-reject-box">
                <div class="premium-reject-row">
                    <strong>Cartola PRO (Globo)</strong>
                    <span>Assinatura paga no app da Globo</span>
                </div>
                <div class="premium-reject-row">
                    <strong>Premium Super Cartola</strong>
                    <span>Habilitado pelo administrador da sua liga</span>
                </div>
                <p class="premium-reject-contact">Entre em contato com o admin da sua liga.</p>
            </div>
        </div>
        <button type="button" class="premium-btn-voltar" onclick="premiumFlow.voltar()">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">arrow_back</span>
            Voltar ao login normal
        </button>
    </div>

</div>
```

- [ ] **3.3 Adicionar CSS do card premium no `<style>` inline**

```css
/* Card Premium */
.premium-card {
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 20px;
    padding: 32px 24px;
    width: 100%;
}
.premium-card-header { text-align: center; margin-bottom: 20px; }
.premium-card-title { color: #f59e0b; font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
.premium-card-sub { color: rgba(255,255,255,0.4); font-size: 12px; }
.premium-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.premium-input {
    width: 100%; padding: 14px 16px;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(245,158,11,0.2);
    border-radius: 12px; color: #fff; font-size: 15px;
    font-family: var(--font-base, 'Inter', sans-serif);
    transition: border-color 0.2s ease;
}
.premium-input:focus { outline: none; border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.15); }
.premium-input::placeholder { color: rgba(255,255,255,0.25); }
.premium-btn-connect {
    width: 100%; padding: 14px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    border: none; border-radius: 12px;
    color: #000; font-weight: 700; font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: box-shadow 0.2s ease, opacity 0.2s ease;
}
.premium-btn-connect:hover { box-shadow: 0 4px 20px rgba(245,158,11,0.4); }
.premium-btn-connect:disabled { opacity: 0.6; cursor: not-allowed; }
.premium-btn-connect .material-symbols-outlined { font-size: 20px; }
.premium-btn-voltar {
    display: block; width: 100%; padding: 8px;
    background: transparent; border: none;
    color: rgba(245,158,11,0.45); font-size: 12px; cursor: pointer;
    margin-top: 12px; text-align: center;
    font-family: var(--font-base, 'Inter', sans-serif);
}
.premium-btn-voltar:hover { color: rgba(245,158,11,0.7); }
.premium-error {
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
    border-radius: 8px; padding: 10px 14px;
    color: #ef4444; font-size: 13px;
}
/* Rejeição */
.premium-reject { text-align: center; padding: 8px 0 16px; }
.premium-reject-icon { font-size: 40px; color: #ef4444; margin-bottom: 12px; display: block; }
.premium-reject-title { color: #ef4444; font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.premium-reject-msg { color: rgba(255,255,255,0.55); font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
.premium-reject-box {
    background: rgba(255,255,255,0.04); border-radius: 10px;
    padding: 14px; text-align: left; display: flex; flex-direction: column; gap: 10px;
}
.premium-reject-row { display: flex; flex-direction: column; gap: 2px; }
.premium-reject-row strong { color: rgba(255,255,255,0.7); font-size: 12px; }
.premium-reject-row span { color: rgba(255,255,255,0.35); font-size: 11px; }
.premium-reject-contact { color: rgba(255,255,255,0.3); font-size: 11px; margin-top: 8px; text-align: center; }

/* Transição: respeitar prefers-reduced-motion */
.login-container { transition: opacity 0.25s ease; }
@media (prefers-reduced-motion: reduce) {
    .login-container { transition: none; }
}
```

- [ ] **3.4 Adicionar JS do `premiumFlow` no `<script>` existente**

Localizar o `<script>` no final do HTML. Adicionar objeto `premiumFlow`:

```javascript
const premiumFlow = {
    _loginCard: null,
    _premiumCard: null,

    _el(id) { return document.getElementById(id); },

    iniciar() {
        this._loginCard  = document.querySelector('.login-container') || document.querySelector('[class*="login"]');
        this._premiumCard = this._el('premium-card');
        if (!this._premiumCard) return;
        // Mostrar card premium, ocultar card normal
        if (this._loginCard) this._loginCard.style.display = 'none';
        this._premiumCard.style.display = 'block';
        this._el('premium-form-panel').style.display = 'block';
        this._el('premium-reject-panel').style.display = 'none';
        this._el('premium-error').style.display = 'none';
        setTimeout(() => this._el('premium-email')?.focus(), 50);
    },

    voltar() {
        if (this._loginCard) this._loginCard.style.display = '';
        if (this._premiumCard) this._premiumCard.style.display = 'none';
        // Limpar campos
        const emailEl = this._el('premium-email');
        const senhaEl = this._el('premium-senha');
        if (emailEl) emailEl.value = '';
        if (senhaEl) senhaEl.value = '';
    },

    async conectar() {
        const email = this._el('premium-email')?.value.trim();
        const senha = this._el('premium-senha')?.value;
        const btnEl  = this._el('premium-btn-conectar');
        const iconEl = this._el('premium-btn-icon');
        const labelEl = this._el('premium-btn-label');
        const errorEl = this._el('premium-error');

        if (!email || !senha) {
            errorEl.textContent = 'Preencha email e senha.';
            errorEl.style.display = 'block';
            return;
        }

        errorEl.style.display = 'none';
        btnEl.disabled = true;
        iconEl.textContent = 'sync';
        iconEl.style.animation = 'spin 1s linear infinite';
        labelEl.textContent = 'Conectando...';

        try {
            const res = await fetch('/api/participante/auth/premium', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, senha })
            });
            const data = await res.json();

            if (data.success) {
                window.location.href = '/participante/';
                return;
            }

            if (data.code === 'NOT_PREMIUM') {
                // Flip para tela de explicação
                this._el('premium-form-panel').style.display = 'none';
                this._el('premium-reject-panel').style.display = 'block';
                return;
            }

            if (data.code === 'CAPTCHA_REQUIRED') {
                errorEl.textContent = 'Autenticação automática bloqueada pela Globo. Use o método Bookmarklet no painel admin.';
                errorEl.style.display = 'block';
                return;
            }

            // INVALID_CREDENTIALS e outros
            errorEl.textContent = data.message || 'Email ou senha incorretos.';
            errorEl.style.display = 'block';

        } catch (_) {
            errorEl.textContent = 'Erro de rede. Tente novamente.';
            errorEl.style.display = 'block';
        } finally {
            btnEl.disabled = false;
            iconEl.textContent = 'login';
            iconEl.style.animation = '';
            labelEl.textContent = 'Conectar com Globo';
        }
    }
};

// Enter nos inputs do premium form
document.addEventListener('DOMContentLoaded', () => {
    ['premium-email', 'premium-senha'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') premiumFlow.conectar();
        });
    });
});
```

> ⚠️ O `animation: spin` já existe em `_app-tokens.css:453`. Verificar que `@keyframes app-spin` está disponível — se necessário, usar `animation: app-spin 1s linear infinite` em vez de `spin`.

- [ ] **3.5 Teste manual no browser**

```bash
# Servidor deve estar rodando
curl -s http://localhost:3000/participante-login.html | grep "premium-card" | head -3
```
Esperado: encontrar `id="premium-card"`

Testar manualmente:
1. Abrir `/participante-login.html`
2. Verificar link "Acesso Premium PRO" sutil abaixo do botão Entrar
3. Clicar → card deve trocar para form premium dourado
4. Clicar "← Voltar" → deve voltar ao normal
5. Submeter credenciais inválidas → deve mostrar erro inline

- [ ] **3.6 Commit**

```bash
git add public/participante-login.html
git commit -m "feat(participante-login): fluxo premium discreto com card flip e tela de explicação"
```

---

## Task 4: `admin-login.html` — split layout + tokens

**Arquivos:**
- Modificar: `public/admin-login.html` (421 linhas — CSS inline + HTML + JS)

> Antes de editar: `Read public/admin-login.html` para localizar estrutura exata.

- [ ] **4.1 Substituir todo o CSS inline por versão com tokens**

Substituir o bloco `<style>` completo por:

```css
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
        font-family: var(--font-family-base, 'Inter', sans-serif);
        background: var(--surface-bg, #0a0a0a);
        min-height: 100vh;
        display: flex;
        align-items: stretch;
        color: var(--text-primary, #fff);
    }

    /* ── HERO (esquerda) ── */
    .hero {
        width: 240px;
        flex-shrink: 0;
        background: var(--surface-card, #1e1e1e);
        border-right: 1px solid var(--border-subtle, #2a2a2a);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 40px 24px;
        position: relative;
        overflow: hidden;
    }
    .hero::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--color-primary, #ff4500);
        opacity: 0.06;
        pointer-events: none;
    }
    .hero-icon {
        width: 72px; height: 72px;
        border-radius: var(--radius-xl, 18px);
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--border-default, #333);
        display: flex; align-items: center; justify-content: center;
    }
    .hero-icon .material-icons {
        font-size: 36px;
        color: var(--color-primary, #ff4500);
    }
    .hero-name {
        font-family: var(--font-family-brand, 'Russo One', sans-serif);
        font-size: 14px;
        color: var(--text-primary, #fff);
        text-align: center;
        line-height: 1.3;
    }
    .hero-label {
        font-size: 10px;
        color: var(--text-muted, rgba(255,255,255,0.35));
        text-transform: uppercase;
        letter-spacing: 1.5px;
    }

    /* ── FORM (direita) ── */
    .form-side {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        background: var(--surface-bg, #0a0a0a);
    }
    .form-container {
        width: 100%;
        max-width: 360px;
    }
    .form-title {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-primary, #fff);
        margin-bottom: 4px;
    }
    .form-subtitle {
        color: var(--text-muted, rgba(255,255,255,0.4));
        font-size: 13px;
        margin-bottom: 28px;
    }
    .form-group { margin-bottom: 16px; }
    .form-group label {
        display: block;
        color: var(--text-secondary, rgba(255,255,255,0.6));
        font-size: 12px;
        font-weight: 500;
        margin-bottom: 6px;
    }
    .form-group input {
        width: 100%;
        padding: 12px 14px;
        background: var(--surface-card, #1e1e1e);
        border: 1px solid var(--border-subtle, #2a2a2a);
        border-radius: var(--radius-md, 8px);
        color: var(--text-primary, #fff);
        font-size: 14px;
        transition: border-color var(--transition-fast, 0.15s ease);
        font-family: var(--font-family-base, 'Inter', sans-serif);
    }
    .form-group input:focus {
        border-color: var(--color-primary, #ff4500);
        outline: none;
        box-shadow: 0 0 0 3px rgba(255,69,0,0.15);
    }
    .form-group input::placeholder {
        color: var(--text-disabled, rgba(255,255,255,0.2));
    }
    .btn-login {
        width: 100%;
        padding: 13px 20px;
        background: var(--color-primary, #ff4500);
        border: none;
        border-radius: var(--radius-md, 8px);
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: box-shadow var(--transition-fast, 0.15s ease), opacity var(--transition-fast, 0.15s ease);
        font-family: var(--font-family-base, 'Inter', sans-serif);
        margin-bottom: 14px;
    }
    .btn-login:hover { box-shadow: 0 4px 16px rgba(255,69,0,0.35); }
    .btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-login .material-icons { font-size: 18px; }

    .divider {
        display: flex; align-items: center; gap: 12px;
        margin: 18px 0;
        color: var(--text-muted, rgba(255,255,255,0.25));
        font-size: 12px;
    }
    .divider::before, .divider::after {
        content: ''; flex: 1;
        height: 1px;
        background: var(--border-subtle, #222);
    }
    .btn-google {
        width: 100%;
        padding: 12px 20px;
        background: var(--surface-card, #1e1e1e);
        border: 1px solid var(--border-subtle, #2a2a2a);
        border-radius: var(--radius-md, 8px);
        color: var(--text-secondary, rgba(255,255,255,0.6));
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: border-color var(--transition-fast, 0.15s ease);
        text-decoration: none;
        font-family: var(--font-family-base, 'Inter', sans-serif);
    }
    .btn-google:hover { border-color: var(--border-default, #444); }

    .error-message {
        background: var(--color-danger-muted, rgba(239,68,68,0.1));
        border: 1px solid var(--color-danger, rgba(239,68,68,0.3));
        color: var(--color-danger, #ef4444);
        padding: 10px 14px;
        border-radius: var(--radius-md, 8px);
        margin-bottom: 16px;
        font-size: 13px;
        display: none;
    }
    .error-message.show { display: block; }
    .success-message {
        background: var(--color-success-muted, rgba(34,197,94,0.1));
        border: 1px solid var(--color-success, rgba(34,197,94,0.3));
        color: var(--color-success, #22c55e);
        padding: 10px 14px;
        border-radius: var(--radius-md, 8px);
        margin-bottom: 16px;
        font-size: 13px;
        display: none;
    }
    .success-message.show { display: block; }

    /* ── Modal trocar senha (preservado) ── */
    .modal {
        display: none; position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        align-items: center; justify-content: center;
        z-index: 9999;
    }
    .modal.show { display: flex; }
    .modal-content {
        background: var(--surface-card, #1a1a1a);
        border-radius: var(--radius-lg, 12px);
        padding: 24px;
        max-width: 400px; width: 90%;
        border: 2px solid var(--color-warning, #f59e0b);
    }
    .modal-content h3 {
        color: var(--color-warning, #f59e0b);
        margin: 0 0 16px;
        display: flex; align-items: center; gap: 8px;
    }
    .modal-content p {
        color: var(--text-muted, #9ca3af);
        margin: 0 0 20px;
        font-size: 13px;
    }

    /* ── Mobile: hero some, single column ── */
    @media (max-width: 768px) {
        body { flex-direction: column; }
        .hero { display: none; }
        .form-side { padding: 40px 24px; align-items: flex-start; }
    }
</style>
```

- [ ] **4.2 Substituir o HTML `<body>` pelo novo layout split**

Substituir tudo dentro de `<body>` (exceto os `<script>`s que devem ser preservados intactos):

```html
<body>
    <!-- HERO -->
    <aside class="hero">
        <div class="hero-icon">
            <span class="material-icons">admin_panel_settings</span>
        </div>
        <div class="hero-name">Super Cartola<br>Manager</div>
        <div class="hero-label">Admin Panel</div>
    </aside>

    <!-- FORM -->
    <main class="form-side">
        <div class="form-container">
            <h1 class="form-title">Entrar</h1>
            <p class="form-subtitle">Acesse o painel de gestão da sua liga</p>

            <div class="error-message" id="errorMessage"></div>
            <div class="success-message" id="successMessage"></div>

            <form id="loginForm">
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email"
                           placeholder="seu@email.com" autocomplete="email" required />
                </div>
                <div class="form-group">
                    <label for="senha">Senha</label>
                    <input type="password" id="senha" name="senha"
                           placeholder="Sua senha" autocomplete="current-password" required />
                </div>
                <button type="submit" class="btn-login" id="btnLogin">
                    <span class="material-icons">login</span>
                    Entrar
                </button>
            </form>

            <div class="divider">ou</div>

            <a href="/api/admin/auth/login" class="btn-google">
                <span class="material-icons">login</span>
                Entrar com Google
            </a>
        </div>
    </main>

    <!-- Modal Trocar Senha (preservado intacto) -->
    <div class="modal" id="modalTrocarSenha">
        <div class="modal-content">
            <h3>
                <span class="material-icons">warning</span>
                Troque sua Senha
            </h3>
            <p>Voce esta usando uma senha provisoria. Por seguranca, defina uma nova senha.</p>
            <form id="formTrocarSenha">
                <div class="form-group">
                    <label for="novaSenha">Nova Senha (minimo 6 caracteres)</label>
                    <input type="password" id="novaSenha" name="novaSenha"
                           placeholder="Digite nova senha" autocomplete="new-password" minlength="6" required />
                </div>
                <div class="form-group">
                    <label for="confirmarSenha">Confirmar Nova Senha</label>
                    <input type="password" id="confirmarSenha" name="confirmarSenha"
                           placeholder="Confirme a senha" autocomplete="new-password" minlength="6" required />
                </div>
                <button type="submit" class="btn-login">
                    <span class="material-icons">lock</span>
                    Definir Nova Senha
                </button>
            </form>
        </div>
    </div>

    <!-- SCRIPTS: preservados sem alteração -->
    <!-- [manter os <script> existentes aqui] -->
</body>
```

> ⚠️ Os `<script>` existentes (login form, trocar senha, mostrarErro, mostrarSucesso) devem ser copiados sem nenhuma alteração.

- [ ] **4.3 Verificar no browser**

Abrir `/admin-login.html` e confirmar:
- Desktop: hero laranja à esquerda + form à direita
- Mobile (DevTools < 768px): hero some, form full width
- Funcionalidade: login com email/senha deve funcionar normalmente
- Modal "Trocar Senha" deve abrir se necessário

- [ ] **4.4 Commit**

```bash
git add public/admin-login.html
git commit -m "feat(admin-login): split layout com tokens CSS, zero hardcoded colors"
```

---

## Task 5: `escalacao-ia.html` + `admin-escalacao-ia.css` — limpeza de tokens

**Arquivos:**
- Modificar: `public/css/modules/admin-escalacao-ia.css`
- Modificar: `public/escalacao-ia.html` (apenas `?v=`)

- [ ] **5.1 Buscar hardcodes restantes no CSS**

```bash
grep -n "rgba\|#[0-9a-fA-F]\{3,6\}\b" \
  /var/www/cartola/public/css/modules/admin-escalacao-ia.css | \
  grep -v "var(--\|/\*" | head -30
```

- [ ] **5.2 Substituir cada hardcode pelo token equivalente**

Mapeamento padrão:
| Hardcode encontrado | Token correto |
|---------------------|--------------|
| `#0a0a0a`, `#0d0d0d`, `#111` | `var(--surface-bg)` |
| `#1a1a1a`, `#1e1e1e` | `var(--surface-card)` |
| `#252525`, `#2a2a2a` | `var(--surface-card-elevated)` ou `var(--border-subtle)` |
| `#333`, `#444` | `var(--border-default)` |
| `rgba(255,255,255,0.5~0.7)` | `var(--text-secondary)` |
| `rgba(255,255,255,0.3~0.4)` | `var(--text-muted)` |
| `rgba(255,255,255,0.1~0.2)` | `var(--text-disabled)` |
| `#ff4500`, `#f97316` | `var(--color-primary)` |
| `#22c55e` | `var(--color-success)` |
| `#ef4444` | `var(--color-danger)` |
| `8px`, `12px` border-radius | `var(--radius-md)`, `var(--radius-lg)` |

> ⚠️ Preservar `rgba()` usados como overlays semi-transparentes se não houver token exato — priorizar os mais visíveis (backgrounds, borders, textos).

- [ ] **5.3 Incrementar `?v=` em `escalacao-ia.html`**

```bash
grep -n "admin-escalacao-ia.css" /var/www/cartola/public/escalacao-ia.html
```
Confirmar que está em `?v=7` (da sessão anterior) e incrementar para `?v=8`:
```
href="css/modules/admin-escalacao-ia.css?v=8"
```

- [ ] **5.4 Validar no browser**

Abrir `/escalacao-ia.html` e confirmar:
- Visual idêntico ao anterior (sem regressão)
- DevTools → Network → `admin-escalacao-ia.css?v=8` deve ser servido (não cached)

- [ ] **5.5 Commit**

```bash
git add public/css/modules/admin-escalacao-ia.css public/escalacao-ia.html
git commit -m "style(escalacao-ia): migrar cores hardcoded para tokens CSS"
```

---

## Checklist final de regressão

Antes de marcar como completo, verificar manualmente:

- [ ] Login normal do participante (ID do time) ainda funciona
- [ ] Login admin com email+senha ainda funciona
- [ ] Login admin com Google OAuth ainda funciona
- [ ] Modal "Trocar Senha" ainda abre no admin-login
- [ ] Escalação IA: gerar análise ainda funciona
- [ ] GatoMestre card: conectar/desconectar ainda funciona (email+senha e bookmarklet)
- [ ] Participante comum não vê nenhuma opção premium além do link discreto
