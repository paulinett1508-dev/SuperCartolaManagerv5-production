---
name: api-hardening
description: Especialista em Hardening de APIs - Autenticacao, Autorizacao Multi-Tenant, Validacao de Input, Security Headers, Protecao contra Injection, Session Security e Data Exposure Prevention. Adaptado para Node.js/Express/MongoDB do Super Cartola Manager. Keywords: seguranca, security, hardening, vulnerabilidade, injection, IDOR, autenticacao, autorizacao, sessao, session, OWASP, pentest, sanitizar, validar input, exposicao de dados
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# API Hardening Skill (Super Cartola Manager)

## Missao

Blindar todas as APIs do Super Cartola Manager contra ataques comuns e avancados. Cada endpoint deve ser seguro por padrao — seguranca nao e feature opcional.

---

## 1. Autenticacao

### 1.1 Referencia: middleware/auth.js

O projeto usa dois middlewares de autenticacao:

| Middleware | Protege | Verifica |
|------------|---------|----------|
| `verificarAdmin` | `/api/admin/*` | Sessao ativa + email no collection `admins` |
| `verificarParticipante` | `/api/participante/*` | Sessao ativa + time vinculado a liga |

### 1.2 Checklist de Autenticacao

```markdown
[ ] Toda rota sensivel tem middleware de auth?
[ ] req.session.usuario e verificado ANTES de qualquer operacao?
[ ] Rotas publicas (/api/public/*) NAO expoe dados sensiveis?
[ ] Rate limiting aplicado em rotas de login (max 20 tentativas / 15min)?
[ ] Sessao invalidada no logout (req.session.destroy)?
[ ] Timeout de sessao configurado (maxAge)?
```

### 1.3 Pattern de Verificacao no Controller

```javascript
export async function operacaoSensivel(req, res) {
    // SEMPRE como primeira verificacao
    if (!req.session?.usuario) {
        return apiUnauthorized(res, 'Sessao invalida ou expirada');
    }

    // Para admin: verificar se e admin da liga
    const liga = await db.collection('ligas').findOne({
        _id: ObjectId(req.params.liga_id),
        admin_id: req.session.usuario._id
    });

    if (!liga) {
        return apiError(res, 'Sem permissao para esta liga', 403);
    }

    // ... continuar operacao
}
```

---

## 2. Autorizacao Multi-Tenant

### 2.1 Principio: Isolamento por liga_id

O Super Cartola Manager e multi-tenant — cada liga e um "tenant" isolado. **Nenhum dado de uma liga deve ser acessivel por admin/participante de outra liga.**

### 2.2 Regras de Isolamento

```javascript
// === REGRA ABSOLUTA ===
// TODA query MongoDB DEVE incluir liga_id

// CORRETO
const participantes = await db.collection('times')
    .find({ liga_id: liga._id, temporada })
    .lean()
    .toArray();

// ERRADO — retorna dados de TODAS as ligas
const participantes = await db.collection('times')
    .find({ temporada })
    .lean()
    .toArray();
```

### 2.3 IDOR Prevention (Insecure Direct Object Reference)

```javascript
// VULNERAVEL — atacante altera liga_id no body
app.get('/api/admin/extrato/:time_id', async (req, res) => {
    const extrato = await db.collection('extratos').findOne({
        time_id: req.params.time_id
        // SEM liga_id — retorna extrato de qualquer liga!
    });
});

// SEGURO — valida que o time pertence a liga do admin
app.get('/api/admin/ligas/:liga_id/extrato/:time_id', async (req, res) => {
    // 1. Validar que admin possui esta liga
    const liga = await db.collection('ligas').findOne({
        _id: ObjectId(req.params.liga_id),
        admin_id: req.session.usuario._id
    });
    if (!liga) return apiError(res, 'Sem permissao', 403);

    // 2. Buscar extrato COM liga_id
    const extrato = await db.collection('extratos').findOne({
        time_id: parseInt(req.params.time_id),
        liga_id: liga._id  // Isolamento garantido
    });

    if (!extrato) return apiError(res, 'Extrato nao encontrado', 404);
    return apiSuccess(res, { extrato });
});
```

### 2.4 Checklist Multi-Tenant

```markdown
[ ] Toda query inclui liga_id?
[ ] liga_id vem do contexto autenticado (nao do body do request)?
[ ] Admin so acessa ligas que ele criou?
[ ] Participante so acessa dados da propria liga?
[ ] Listagens nao vazam dados entre ligas?
[ ] Bulk operations filtram por liga_id?
```

---

## 3. Validacao de Input

### 3.1 Referencia: utils/validators.js

Usar as funcoes de validacao do projeto antes de processar qualquer entrada.

### 3.2 Regras de Validacao

```javascript
// 1. TIPAGEM — nunca confiar no tipo do body
const valor = parseFloat(req.body.valor);
if (isNaN(valor) || valor <= 0) {
    return apiError(res, 'Valor deve ser numero positivo', 400);
}

// 2. LIMITES — prevenir payloads absurdos
if (req.body.descricao && req.body.descricao.length > 500) {
    return apiError(res, 'Descricao excede 500 caracteres', 400);
}

// 3. SANITIZACAO — prevenir injection
const nomeTime = String(req.body.nome_time || '').trim().substring(0, 100);

// 4. ENUM — campos com valores predefinidos
const tiposValidos = ['CREDITO', 'DEBITO', 'AJUSTE', 'INSCRICAO', 'PREMIO'];
if (!tiposValidos.includes(req.body.tipo)) {
    return apiError(res, 'Tipo invalido', 400);
}

// 5. ObjectId — validar formato antes de usar
if (!ObjectId.isValid(req.params.liga_id)) {
    return apiError(res, 'ID de liga invalido', 400);
}
```

### 3.3 Campos Obrigatorios

```javascript
// Pattern: validar campos obrigatorios no inicio
const camposObrigatorios = ['time_id', 'tipo', 'valor'];
const faltando = camposObrigatorios.filter(c => req.body[c] === undefined);

if (faltando.length > 0) {
    return apiError(res, `Campos obrigatorios ausentes: ${faltando.join(', ')}`, 400);
}
```

---

## 4. Security Headers

### 4.1 Referencia: middleware/security.js

O projeto ja configura headers de seguranca. Verificar periodicamente se estao ativos:

| Header | Valor | Protege contra |
|--------|-------|----------------|
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS refletido |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Vazamento de URL em referrer |
| `Content-Security-Policy` | Configurado por rota | XSS, injection de scripts |
| `Strict-Transport-Security` | `max-age=31536000` | Downgrade HTTPS → HTTP |

### 4.2 Verificacao

```bash
# Verificar headers de uma rota
curl -I https://supercartolamanager.com.br/api/public/health

# Deve conter todos os headers acima
```

---

## 5. Prevencao de Exposicao de Dados

### 5.1 Stack Traces

```javascript
// NUNCA em producao
// ERRADO:
res.status(500).json({ error: error.stack });

// CORRETO:
console.error('[Controller] Erro interno:', error); // Log server-side
return apiServerError(res, 'Erro ao processar operacao'); // Mensagem generica ao cliente
```

### 5.2 Campos Sensiveis em Respostas

```javascript
// NUNCA retornar campos sensiveis ao cliente
const usuario = await db.collection('admins').findOne({ email });

// ERRADO — expoe senha hash e dados internos
return apiSuccess(res, { usuario });

// CORRETO — projetar apenas campos necessarios
return apiSuccess(res, {
    usuario: {
        email: usuario.email,
        nome: usuario.nome,
        liga_id: usuario.liga_id
    }
});

// OU usar projection na query
const usuario = await db.collection('admins').findOne(
    { email },
    { projection: { senha: 0, _id: 0, tokens: 0 } }
);
```

### 5.3 Logs — Sanitizar PII

```javascript
// ERRADO — loga dados pessoais
console.log('Login:', { email: req.body.email, senha: req.body.senha });

// CORRETO — mascarar dados sensiveis
console.log('Login:', { email: req.body.email?.substring(0, 3) + '***' });
```

---

## 6. Session Security

### 6.1 Configuracao de Cookies de Sessao

```javascript
const sessionConfig = {
    secret: process.env.SESSION_SECRET,  // NUNCA hardcoded
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,      // Impede acesso via JavaScript (XSS)
        secure: true,        // Apenas HTTPS (producao)
        sameSite: 'lax',     // Protege contra CSRF
        maxAge: 24 * 60 * 60 * 1000  // 24 horas
    }
};

// Em desenvolvimento (Replit):
if (process.env.NODE_ENV === 'development') {
    sessionConfig.cookie.secure = false;  // Replit pode usar HTTP local
}
```

### 6.2 Checklist de Sessao

```markdown
[ ] SESSION_SECRET em variavel de ambiente (nunca no codigo)?
[ ] httpOnly: true (previne roubo de cookie via XSS)?
[ ] secure: true em producao?
[ ] sameSite configurado?
[ ] maxAge definido (sessao nao e eterna)?
[ ] Logout destroi sessao (req.session.destroy)?
[ ] Sessao regenerada apos login (req.session.regenerate)?
```

---

## 7. MongoDB-Specific Security

### 7.1 Operadores Proibidos

```javascript
// NUNCA permitir que input do usuario chegue a estes operadores:

// $where — executa JavaScript no servidor MongoDB
// VULNERAVEL:
db.collection('times').find({ $where: req.body.query });

// eval — executa codigo arbitrario
// NUNCA usar eval() em qualquer contexto

// new Function — equivalente a eval
// NUNCA construir funcoes a partir de input do usuario
```

### 7.2 NoSQL Injection Prevention

```javascript
// VULNERAVEL — objeto malicioso no body
// Atacante envia: { "email": { "$gt": "" } }
const usuario = await db.collection('admins').findOne({
    email: req.body.email  // Se email for objeto, $gt matcha TODOS
});

// SEGURO — forcar tipo string
const email = String(req.body.email || '');
const usuario = await db.collection('admins').findOne({ email });

// SEGURO — sanitizar operadores $
function sanitizeInput(input) {
    if (typeof input === 'object' && input !== null) {
        // Remover chaves que comecam com $
        const keys = Object.keys(input);
        for (const key of keys) {
            if (key.startsWith('$')) {
                delete input[key];
            }
        }
    }
    return input;
}
```

### 7.3 Projection Injection

```javascript
// VULNERAVEL — usuario controla quais campos retornam
const campos = req.query.fields;  // Atacante envia "senha,token"
const doc = await db.collection('admins').findOne(
    { _id: id },
    { projection: campos.split(',').reduce((acc, f) => ({ ...acc, [f]: 1 }), {}) }
);

// SEGURO — whitelist de campos permitidos
const CAMPOS_PERMITIDOS = ['nome', 'email', 'liga_id', 'nome_time'];
const requestedFields = (req.query.fields || '').split(',');
const projection = {};

for (const field of requestedFields) {
    if (CAMPOS_PERMITIDOS.includes(field)) {
        projection[field] = 1;
    }
}
```

---

## 8. Red Flags — Sinais de Alerta em Code Review

### 8.1 Severidade Critica (Bloquear Merge)

| Red Flag | Risco | Correcao |
|----------|-------|----------|
| Rota sem middleware de auth | Acesso anonimo a dados sensiveis | Adicionar `verificarAdmin` ou `verificarParticipante` |
| Query sem `liga_id` | Vazamento entre ligas (multi-tenant) | Adicionar `liga_id` em TODA query |
| `req.body` direto na query MongoDB | NoSQL Injection | Sanitizar e tipar input |
| `origin: '*'` no CORS | Qualquer site acessa a API | Whitelist de dominios |
| `res.json({ error: err })` em catch | Stack trace exposta | Usar `apiServerError` |
| `$where` ou `eval` | Execucao remota de codigo | NUNCA usar |
| Sessao sem `httpOnly` | Cookie acessivel via XSS | Configurar `httpOnly: true` |
| `liga_id` vindo de `req.body` | IDOR — atacante troca liga | Usar `req.params` validado contra sessao |

### 8.2 Severidade Alta (Corrigir Antes de Deploy)

| Red Flag | Risco | Correcao |
|----------|-------|----------|
| Sem rate limiting em rota de auth | Brute force | Aplicar `authLimiter` |
| Campos sensiveis na resposta | Exposicao de dados | Projection ou sanitizacao |
| Sem validacao de ObjectId | Crash por formato invalido | `ObjectId.isValid()` antes de usar |
| `console.log` com dados pessoais | PII em logs | Mascarar dados sensiveis |
| Sem `try/catch` em controller async | Erro 500 nao tratado | Envolver em try/catch |
| Body parsing sem limite de tamanho | DoS via payload grande | `express.json({ limit: '10mb' })` |

### 8.3 Exemplos Especificos do Projeto

```javascript
// RED FLAG: Rota de extrato sem validar liga do admin
app.get('/api/admin/extrato/:time_id', verificarAdmin, async (req, res) => {
    // time_id pode ser de QUALQUER liga — IDOR!
    const extrato = await db.collection('extratos').findOne({
        time_id: parseInt(req.params.time_id)
    });
});

// CORRECAO: Validar que time pertence a liga do admin
app.get('/api/admin/ligas/:liga_id/extrato/:time_id', verificarAdmin, async (req, res) => {
    const liga = await db.collection('ligas').findOne({
        _id: ObjectId(req.params.liga_id),
        admin_id: req.session.usuario._id
    });
    if (!liga) return apiError(res, 'Sem permissao', 403);

    const extrato = await db.collection('extratos').findOne({
        time_id: parseInt(req.params.time_id),
        liga_id: liga._id  // Isolamento garantido
    });
});
```

---

## 9. Checklist de Hardening Completo

### Por Rota (antes de cada deploy)

```markdown
[ ] Auth middleware aplicado?
[ ] liga_id em toda query?
[ ] Input validado e sanitizado?
[ ] Tipos forcados (String, Number, ObjectId)?
[ ] Resposta nao expoe campos sensiveis?
[ ] try/catch com apiServerError?
[ ] Rate limiting em rotas sensiveis?
[ ] Sem $where, eval, new Function?
```

### Por Sprint (revisao periodica)

```markdown
[ ] Todos os headers de seguranca ativos?
[ ] CORS com whitelist (nao '*')?
[ ] Sessao com httpOnly + secure + sameSite?
[ ] Rate limiting funcional?
[ ] Logs nao contem PII?
[ ] Nenhuma rota nova sem auth?
[ ] Projection em queries que retornam ao cliente?
```

---

**STATUS:** API Hardening Skill — ATIVO

**Versao:** 1.0

**Ultima atualizacao:** 2026-03-12
