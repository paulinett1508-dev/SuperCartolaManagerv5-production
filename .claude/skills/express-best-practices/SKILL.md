---
name: express-best-practices
description: Especialista em Express.js Best Practices - Middleware, Seguranca, CORS, Rate Limiting, Controller/Service Separation, API Response Standardization, Error Handling e SPA Serving. Adaptado para o stack Node.js/Express/MongoDB do Super Cartola Manager. Keywords: express, middleware, rota, route, controller, service, cors, rate limit, seguranca, headers, error handling, api response, SPA, catch-all, static files
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# Express Best Practices Skill (Super Cartola Manager)

## Missao

Garantir que o servidor Express do Super Cartola Manager siga padroes de seguranca, performance e manutenibilidade. Toda rota, middleware e controller deve seguir convencoes consistentes e documentadas.

---

## 1. Ordem de Middleware (Pipeline de Request)

### 1.1 Ordem Correta no server.js

A ordem dos middlewares importa. Um middleware fora de posicao pode causar falhas silenciosas ou brechas de seguranca.

```javascript
// === ORDEM OBRIGATORIA ===

// 1. SEGURANCA (antes de tudo)
// Referencia: middleware/security.js
// - Headers de seguranca (CSP, X-Frame-Options, etc.)
// - Rate limiting (500 req/min padrao)
app.use(securityMiddleware);

// 2. BODY PARSING
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. CORS
app.use(corsMiddleware);

// 4. SESSAO
app.use(sessionMiddleware);

// 5. ARQUIVOS ESTATICOS (antes de rotas de API)
app.use(express.static('public'));

// 6. ACTIVITY TRACKER (apos sessao)
// Referencia: middleware/activityTracker.js
app.use(activityTrackerMiddleware);

// 7. TENANT (identifica liga do contexto)
// Referencia: middleware/tenant.js
// Seta req.liga_id para uso nos controllers
app.use('/api', tenantMiddleware);

// 8. ROTAS DE API
app.use('/api/admin', verificarAdmin, adminRoutes);
app.use('/api/participante', verificarParticipante, participanteRoutes);
app.use('/api/public', publicRoutes);

// 9. CATCH-ALL SPA (apos todas as rotas)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 10. ERROR HANDLER (sempre por ultimo)
app.use(errorHandlerMiddleware);
```

### 1.2 Por que esta Ordem

| Posicao | Middleware | Motivo |
|---------|-----------|--------|
| 1 | security.js | Bloquear requests maliciosos antes de qualquer processamento |
| 2 | body parsing | Necessario para ler req.body nas rotas |
| 3 | CORS | Definir headers antes de processar resposta |
| 4 | sessao | Necessario para auth nos proximos middlewares |
| 5 | static | Servir arquivos sem processar rotas desnecessariamente |
| 6 | activityTracker | Registrar atividade apos sessao estar disponivel |
| 7 | tenant | Identificar liga antes de chegar aos controllers |
| 8 | rotas | Logica de negocio |
| 9 | catch-all | SPA fallback — so se nenhuma rota de API matchou |
| 10 | error handler | Capturar erros de qualquer etapa anterior |

---

## 2. Seguranca

### 2.1 Referencia: middleware/security.js

O projeto ja implementa headers de seguranca e rate limiting neste middleware. Ao criar novas rotas, garantir que passem por ele.

### 2.2 Headers de Seguranca Obrigatorios

```javascript
// Ja configurados em middleware/security.js
{
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; ...",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}
```

### 2.3 Rate Limiting

```javascript
// Configuracao atual: 500 requests por minuto por IP
// Referencia: middleware/security.js

// Para rotas sensiveis (login, financeiro), considerar rate limit mais restrito:
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 20,                    // 20 tentativas
    message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

app.use('/api/auth/login', authLimiter);
```

### 2.4 CORS

```javascript
// Configuracao CORS do projeto
const corsOptions = {
    origin: [
        'https://supercartolamanager.com.br',
        'https://www.supercartolamanager.com.br',
        process.env.REPLIT_DEV_DOMAIN  // Dev URL do Replit
    ].filter(Boolean),
    credentials: true,  // Necessario para cookies de sessao
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// NUNCA usar origin: '*' — quebra sessoes e expoe APIs
```

---

## 3. Controller / Service Separation

### 3.1 Principio

**Controllers** lidam com HTTP (req/res). **Services** lidam com logica de negocio e dados. Controllers NAO devem conter queries MongoDB diretamente.

### 3.2 Estrutura do Projeto

```
controllers/
  ├── ajusteFinanceiroController.js   # HTTP layer
  ├── rankingController.js
  └── inscricaoController.js

services/
  ├── orchestrator/                    # Pattern de orquestracao
  │   ├── managers/                    # Managers especializados
  │   └── index.js
  ├── saldoService.js
  └── rankingService.js
```

### 3.3 Pattern Correto

```javascript
// === CONTROLLER (HTTP concern only) ===
// controllers/rankingController.js
import { getRankingByLiga } from '../services/rankingService.js';
import { apiSuccess, apiError, apiServerError } from '../utils/apiResponse.js';

export async function listarRanking(req, res) {
    try {
        // 1. Extrair parametros da request
        const { liga_id } = req.params;
        const { temporada, rodada } = req.query;

        // 2. Validar entrada
        if (!liga_id) {
            return apiError(res, 'liga_id obrigatorio', 400);
        }

        // 3. Chamar service
        const ranking = await getRankingByLiga(liga_id, temporada, rodada);

        // 4. Responder
        return apiSuccess(res, { ranking });

    } catch (error) {
        console.error('[RankingController] Erro:', error);
        return apiServerError(res, 'Erro ao buscar ranking');
    }
}

// === SERVICE (Business logic) ===
// services/rankingService.js
import { getDb } from '../config/database.js';

export async function getRankingByLiga(liga_id, temporada, rodada) {
    const db = getDb();

    const ranking = await db.collection('rankings')
        .find({ liga_id, temporada })  // SEMPRE liga_id
        .sort({ pontos_total: -1 })
        .lean()                         // SEMPRE .lean() em leituras
        .toArray();

    return ranking;
}
```

### 3.4 O que vai em cada camada

| Camada | Responsabilidades | NAO deve fazer |
|--------|-------------------|----------------|
| **Route** | Definir path, metodo HTTP, middleware de auth | Logica de negocio |
| **Controller** | Extrair params, validar entrada, chamar service, formatar resposta | Queries diretas ao DB |
| **Service** | Logica de negocio, queries ao DB, calculos | Acessar req/res |
| **Model/Utils** | Schema, validacao de dados, helpers | Logica de negocio |

---

## 4. Padronizacao de Respostas API

### 4.1 Referencia: utils/apiResponse.js

Todas as rotas DEVEM usar as funcoes padronizadas de resposta. NUNCA usar `res.json()` ou `res.status().send()` diretamente.

```javascript
import {
    apiSuccess,       // 200 — { success: true, data, message }
    apiError,         // 4xx — { success: false, error: message }
    apiServerError,   // 500 — { success: false, error: message } (sem stack trace)
    apiUnauthorized,  // 401 — { success: false, error: message }
    apiConflict       // 409 — { success: false, error: message }
} from '../utils/apiResponse.js';
```

### 4.2 Exemplos de Uso

```javascript
// Sucesso
return apiSuccess(res, { participantes: lista }, 'Participantes carregados');

// Erro de validacao
return apiError(res, 'Campo "valor" deve ser numerico', 400);

// Nao encontrado
return apiError(res, 'Liga nao encontrada', 404);

// Nao autorizado
return apiUnauthorized(res, 'Sessao expirada');

// Conflito (ex: duplicata)
return apiConflict(res, 'Inscricao ja existe para esta temporada');

// Erro interno (NUNCA expor detalhes)
console.error('[Controller] Detalhes:', error);  // Logar para debug
return apiServerError(res, 'Erro ao processar operacao');
```

---

## 5. Tratamento de Erros

### 5.1 Async Error Handling em Controllers

```javascript
// Todo controller async DEVE ter try/catch
export async function meuController(req, res) {
    try {
        // ... logica
        return apiSuccess(res, data);
    } catch (error) {
        console.error('[MeuController] Erro:', error.message);
        return apiServerError(res, 'Erro interno');
    }
}
```

### 5.2 Error Handler Global (Middleware Final)

```javascript
// Deve ser o ULTIMO middleware registrado
function errorHandlerMiddleware(err, req, res, next) {
    // Logar erro completo (para debug)
    console.error('[ErrorHandler]', {
        method: req.method,
        url: req.originalUrl,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Responder sem expor detalhes internos
    const status = err.status || 500;
    const message = status === 500
        ? 'Erro interno do servidor'
        : err.message;

    res.status(status).json({
        success: false,
        error: message
    });
}
```

### 5.3 Erros Comuns a Prevenir

| Erro | Causa | Prevencao |
|------|-------|-----------|
| `Cannot read property of undefined` | Acessar campo de documento nulo | Sempre verificar `if (!doc)` antes de acessar |
| Resposta dupla (`headers already sent`) | Esquecer `return` antes de `apiSuccess`/`apiError` | SEMPRE usar `return apiSuccess(...)` |
| Timeout sem resposta | Esqueceu de chamar `res` em algum branch | Todo branch deve terminar com resposta |
| Stack trace no response | `res.status(500).json({ error: err })` | Usar `apiServerError` que sanitiza |

---

## 6. Rastreabilidade de Requests

### 6.1 Request ID

```javascript
// Adicionar ID unico a cada request para rastreamento em logs
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});
```

### 6.2 Logging Padronizado

```javascript
// Referencia: utils/logger.js
// Sempre incluir contexto nas mensagens de log

console.log(`[${req.requestId}] [RankingController] GET /api/ranking/${liga_id}`);
console.error(`[${req.requestId}] [AjusteController] Erro:`, error.message);
```

---

## 7. SPA (Single Page Application)

### 7.1 Servir Arquivos Estaticos

```javascript
// Servir ANTES das rotas de API
app.use(express.static('public', {
    maxAge: '1d',          // Cache de assets estaticos
    etag: true,
    lastModified: true
}));
```

### 7.2 Catch-All para SPA

```javascript
// APOS todas as rotas de API
// Redireciona qualquer rota nao-API para o index.html (SPA routing)
app.get('*', (req, res) => {
    // Nao interceptar requests de API que nao matcharam
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'Rota nao encontrada' });
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

### 7.3 SPA Init Pattern (REGRA DO PROJETO)

Paginas em `supportedPages` (layout.html) NUNCA devem usar `DOMContentLoaded` sozinho:

```javascript
// CORRETO — funciona tanto na carga inicial quanto na navegacao SPA
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // SPA: DOM ja pronto, executar imediatamente
}
```

---

## 8. Definicao de Rotas

### 8.1 Convencoes de Nomenclatura

```javascript
// RESTful + nomenclatura em portugues
router.get('/api/admin/ligas',             listarLigas);       // Listar
router.get('/api/admin/ligas/:liga_id',    obterLiga);         // Obter um
router.post('/api/admin/ligas',            criarLiga);         // Criar
router.put('/api/admin/ligas/:liga_id',    atualizarLiga);     // Atualizar
router.delete('/api/admin/ligas/:liga_id', removerLiga);       // Remover

// Acoes especificas
router.post('/api/admin/ligas/:liga_id/processar-rodada', processarRodada);
router.get('/api/admin/ligas/:liga_id/extrato/:time_id',  obterExtrato);
```

### 8.2 Middleware de Autenticacao por Grupo

```javascript
// Referencia: middleware/auth.js

// Rotas admin — verificarAdmin
router.use('/api/admin', verificarAdmin);

// Rotas participante — verificarParticipante
router.use('/api/participante', verificarParticipante);

// Rotas publicas — sem auth
router.use('/api/public', publicRoutes);
```

### 8.3 Paginacao

```javascript
// Referencia: middleware/pagination.js
// Aplicar em rotas que retornam listas

router.get('/api/admin/participantes',
    verificarAdmin,
    paginationMiddleware,  // Seta req.pagination = { page, limit, skip }
    listarParticipantes
);

// No controller:
const { page, limit, skip } = req.pagination;
const results = await db.collection('participantes')
    .find({ liga_id })
    .skip(skip)
    .limit(limit)
    .lean()
    .toArray();

const total = await db.collection('participantes').countDocuments({ liga_id });

return apiSuccess(res, {
    dados: results,
    paginacao: { page, limit, total, totalPages: Math.ceil(total / limit) }
});
```

---

## 9. Checklist para Nova Rota

```markdown
[ ] Rota segue convencao RESTful?
[ ] Middleware de auth aplicado (verificarAdmin ou verificarParticipante)?
[ ] Controller usa try/catch com apiServerError?
[ ] Respostas usam apiSuccess/apiError (nao res.json direto)?
[ ] Toda query inclui liga_id?
[ ] Queries de leitura usam .lean()?
[ ] Validacao de entrada antes de processar?
[ ] Verificou req.session.usuario antes de acao sensivel?
[ ] Rota registrada ANTES do catch-all SPA?
[ ] Paginacao aplicada em rotas de listagem?
```

---

**STATUS:** Express Best Practices Skill — ATIVO

**Versao:** 1.0

**Ultima atualizacao:** 2026-03-12
