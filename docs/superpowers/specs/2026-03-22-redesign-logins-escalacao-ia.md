# Design Spec — Redesign Logins + Escalação IA (Premium Flow)
**Data:** 2026-03-22
**Status:** Revisado pós-code-review (iteração 2)
**Escopo:** `participante-login.html`, `admin-login.html`, `escalacao-ia.html`

---

## Contexto e distinção crítica

| Conceito | O que é | Campo | Quem controla |
|----------|----------|-------|---------------|
| **Cartola PRO (Globo)** | Assinatura paga no app da Globo | `Time.assinante = true` | A Globo |
| **Premium no Super Cartola** | Acesso especial concedido pelo admin da liga | `Liga.participantes[].premium = true` | O admin da liga |

Ter Cartola PRO **não implica** ser Premium no Super Cartola. São sistemas independentes.
Hoje apenas **Paulinett Miranda** (time ID `13935277`) tem `premium=true` — usado para testes.

---

## 1. participante-login.html

### Visual
- Estrutura atual **preservada** (mobile-first, bem feito)
- Adicionar link discreto abaixo do botão "Entrar":

```
[Entrar]                     ← botão principal inalterado

Acesso Premium ★PRO          ← link pequeno, sutil, abaixo do botão
```

### Estados do card

**Estado 1 — Normal (default)**
Login por ID do time. Sem alterações.

**Estado 2 — Card flip para modo premium**
Ao clicar "Acesso Premium":
- Card faz transição visual para modo premium (cor dourada)
- Título: "Cartola Pro" em dourado
- Form: `[email]` + `[senha]` da conta Globo
- Botão: "Conectar com Globo"
- Link: "← Voltar ao login normal"
- **Acessibilidade:** `@media (prefers-reduced-motion: reduce)` deve usar fade instantâneo em vez de flip 3D

**Estado 3 — Loading**
Durante o POST ao backend:
- Botão fica `disabled`
- Ícone de loading (material icon `sync` girando com `animation: spin`)
- Texto: "Conectando..."
- Inputs ficam `disabled`

**Estado 4 — Sucesso**
Redireciona para `/participante/`

**Estado 5 — Rejeição: não é Premium no Super Cartola**
Card flip para tela de explicação:
- Ícone `block` (Material Icons)
- Título: "Acesso negado"
- Mensagem: "Você autenticou na Globo, mas não é participante Premium neste sistema."
- Box de distinção explícita:
  - **Cartola PRO (Globo):** assinatura paga no app da Globo
  - **Premium Super Cartola:** habilitado pelo administrador da sua liga
  - "Entre em contato com o admin da sua liga."
- Botão "← Voltar ao login normal"

**Estado 6 — Rejeição: credenciais inválidas**
Inline no card premium:
- Banner de erro vermelho
- Mensagem: "Email ou senha incorretos. Use as mesmas credenciais do Cartola FC."
- Form permanece para retry

**Estado 7 — Rejeição: captcha necessário**
Inline no card premium:
- Banner de aviso laranja
- Mensagem: "Não foi possível autenticar automaticamente. Use o método Bookmarklet no painel admin."
- Botão "← Voltar ao login normal"

---

## 2. Backend — Endpoint premium

### Relação com o endpoint existente

O endpoint `POST /api/participante/auth/globo/login-direto` **já existe** e faz:
1. Autentica na Globo → `glbId`
2. Busca `time_id` via `GET /auth/time`
3. Checa `Time.assinante === true` (Cartola PRO da Globo)
4. Cria sessão

O novo endpoint **não deve** checar `assinante`. Deve checar `Liga.participantes[].premium = true`. São checks diferentes e independentes.

### Novo endpoint: `POST /api/participante/auth/premium`

**Segurança obrigatória:**
- Rate limit: usar `authRateLimiter` de `middleware/security.js` — já aplicado a outros endpoints Globo em `index.js`. Adicionar linha em `index.js`: `app.use("/api/participante/auth/premium", authRateLimiter)` antes do `app.use("/api/participante/auth", ...)`
- Campo `senha` nunca deve aparecer em logs — usar `{ email }` apenas nos logs
- `senha` não deve ser serializada em objetos de erro

**Fluxo:**
```
1. Recebe { email, senha }
2. POST login.globo.com/api/authentication
   { payload: { email, password: senha, serviceId: 438, captcha: "" } }
   → glbId | INVALID_CREDENTIALS | CAPTCHA_REQUIRED

3. GET api.cartolafc.globo.com/auth/time
   Header: X-GLB-Token: glbId
   → time_id

4. Liga.findOne({ "participantes.time_id": time_id })
   → liga com o time_id | null (NOT_PREMIUM)

   Após o findOne, verificar em memória:
   const p = liga.participantes.find(p => String(p.time_id) === String(time_id) && p.premium === true)
   → p encontrado → prosseguir | NOT_PREMIUM

   Estratégia multi-liga: usar a PRIMEIRA liga onde o time_id está com premium=true.
   (Operador $ do MongoDB é inválido em filtros — usar findOne + verificação JS em memória,
   padrão já adotado em utils/premium-participante.js)

5. Monta sessão:
   req.session.participante = {
     timeId: time_id,
     ligaId: ligaEncontrada._id,
     premium: true,                    ← flag explícita na sessão
     nome_cartola: ...,
     nome_time: ...,
     foto_perfil: ...,
     foto_time: ...,
     clube_id: ...,
   }
   req.session.cartolaProAuth = {
     glbid: glbId,
     email: email,
     expires_at: now + 7200
   }

6. Retorna { success: true }
```

**Códigos de resposta:**
```json
// Sucesso
{ "success": true }

// Credenciais inválidas (Globo retornou 401)
{ "success": false, "code": "INVALID_CREDENTIALS", "message": "Email ou senha incorretos." }

// Captcha exigido (campo vazio rejeitado)
{ "success": false, "code": "CAPTCHA_REQUIRED", "message": "Autenticação automática bloqueada." }

// Autenticado na Globo mas sem premium no Super Cartola
{ "success": false, "code": "NOT_PREMIUM", "message": "Conta Globo válida, mas sem acesso Premium neste sistema." }

// Time não encontrado em nenhuma liga
{ "success": false, "code": "NO_LEAGUE", "message": "Time não encontrado em nenhuma liga." }
```

---

## 3. admin-login.html

### Layout split

```
┌──────────────────┬────────────────────────────────┐
│  HERO (esquerda) │  FORM (direita)                │
│                  │                                │
│  [ícone admin]   │  Entrar                        │
│                  │  Acesse o painel da sua liga   │
│  Super Cartola   │                                │
│  Manager         │  [email input]                 │
│                  │  [senha input]                 │
│  Admin Panel     │  [Entrar]                      │
│                  │                                │
│                  │  ── ou ──                      │
│                  │  [Entrar com Google]            │
└──────────────────┴────────────────────────────────┘
```

**Hero (esquerda):**
- Background: `var(--surface-card)` com overlay `var(--color-primary)` em 10% opacity
- Borda direita: `1px solid var(--border-subtle)`
- Largura: `240px` fixo em desktop

**Form (direita):**
- Background: `var(--surface-bg)`
- Padding: `var(--space-8)` horizontal

**Breakpoint mobile `< 768px`:**
- Hero some completamente (`display: none`)
- Form ocupa 100% da largura em single column
- Mesmo comportamento do layout atual

**Tokens obrigatórios** (nenhuma cor hardcoded):
- `--color-primary`, `--color-primary-dark`
- `--surface-bg`, `--surface-card`
- `--border-subtle`, `--border-default`
- `--radius-md`, `--radius-lg`
- `--text-primary`, `--text-muted`
- `--transition-fast`

### Funcionalidade preservada
- Form email+senha → `POST /api/admin/cliente/login` — inalterado
- Botão Google → `/api/admin/auth/login` — inalterado
- Modal "Trocar Senha" — preservado intacto, sem alterações

---

## 4. escalacao-ia.html / admin-escalacao-ia.css

### Escopo
- Limpeza de cores hardcoded no CSS inline do HTML e no arquivo `.css`
- Migrar para tokens existentes (`_admin-tokens.css`)
- **Incrementar `?v=`** no `<link>` do CSS para `?v=8` após qualquer mudança

### O que NÃO muda
- Toda a lógica JavaScript
- Estrutura HTML dos cards
- Funcionalidade de escalação, tabs, banco de reservas
- Card GatoMestre (implementado na sessão anterior — email+senha já funcionando)

---

## Arquivos afetados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `public/participante-login.html` | HTML + CSS inline — fluxo premium (link → flip → explicação) |
| `public/admin-login.html` | HTML + CSS inline — split layout + 100% tokens |
| `public/css/modules/admin-escalacao-ia.css` | CSS — limpeza hardcodes → tokens, `?v=8` |
| `routes/participante-auth.js` | Backend — novo endpoint `POST /auth/premium` com rate limit |

**Arquivos explicitamente não alterados:**
- JS de login dos participantes comuns
- `escalacao-ia.html` estrutura
- Qualquer outra página de usuário comum

---

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Globo exige captcha real | Média | Retorna `CAPTCHA_REQUIRED`; login normal por ID não é afetado |
| time_id em múltiplas ligas | Baixa | Usa primeira liga com `premium=true`; aceitável para caso de uso |
| Split layout quebra em mobile | Zero com spec | Hero some em `< 768px` |
| Senha aparece em logs | Prevenido | Log apenas `{ email }`, nunca `{ senha }` |
| Brute force no endpoint premium | Prevenido | Rate limit 5/min/IP |
