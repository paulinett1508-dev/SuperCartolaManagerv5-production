---
name: error-handling
description: Guia de tratamento de erros para o Super Cartola Manager. Hierarquia de erros, middleware centralizado, classificacao operacional vs programacao, logging seguro. Adaptado do agnostic-core para Node.js/Express/MongoDB. Keywords - erro, error, try catch, AppError, middleware de erro, tratamento de erros, error handling.
allowed-tools: Read, Grep, Glob, Bash
---

# Error Handling — Super Cartola Manager

## Contexto do Projeto

- **Stack:** Node.js + Express + MongoDB
- **Response helper:** `utils/apiResponse.js` (apiSuccess, apiError, apiServerError, apiUnauthorized, apiConflict)
- **Logger:** `utils/logger.js`
- **Regra CLAUDE.md:** "Use try/catch in async controllers"
- **Multi-tenant:** Erros nao devem expor dados de outra liga

---

## 1. Classificacao de Erros

### Erros Operacionais (Esperados)

Situacoes previsiveis que o sistema deve tratar graciosamente.

| Tipo | Exemplo no Projeto | Status HTTP | Tratamento |
|------|--------------------|-------------|------------|
| Recurso nao encontrado | Liga, time ou rodada inexistente | 404 | `apiError(res, 'Liga nao encontrada', 404)` |
| Validacao falhou | Campos obrigatorios ausentes | 400 | `apiError(res, 'Campos obrigatorios: nome, valor', 400)` |
| Nao autorizado | Sessao expirada, sem login | 401 | `apiUnauthorized(res, 'Sessao expirada')` |
| Proibido | Admin tentando acessar liga de outro | 403 | `apiError(res, 'Sem permissao', 403)` |
| Conflito | Inscricao duplicada, chave idempotencia | 409 | `apiConflict(res, 'Inscricao ja existe')` |
| Rate limited | Muitas requisicoes | 429 | Tratado por `middleware/security.js` |

### Erros de Programacao (Bugs)

Situacoes inesperadas que indicam bug no codigo.

| Tipo | Exemplo | Tratamento |
|------|---------|------------|
| TypeError | `Cannot read property 'x' of undefined` | Log CRITICO + `apiServerError(res)` |
| ReferenceError | Variavel nao declarada | Log CRITICO + `apiServerError(res)` |
| MongoDB error | Connection lost, timeout | Log CRITICO + retry ou `apiServerError(res)` |
| Unhandled rejection | Promise sem catch | Process-level handler |

---

## 2. Patterns no Projeto

### 2.1 Controller com try/catch (Pattern Atual)

```javascript
// controllers/admin/artilheiro-controller.js (exemplo)
export async function listarArtilheiros(req, res) {
  try {
    const { ligaId } = req.params;
    const { temporada } = req.query;

    if (!ligaId) {
      return apiError(res, 'ligaId obrigatorio', 400);
    }

    const artilheiros = await ArtilheiroCampeao.find({
      liga_id: ligaId,
      temporada
    }).lean();

    return apiSuccess(res, { artilheiros });

  } catch (error) {
    logger.error('Erro ao listar artilheiros', {
      ligaId: req.params.ligaId,
      error: error.message
    });
    return apiServerError(res, error);
  }
}
```

### 2.2 Service com Erro Tipado (Pattern Recomendado)

```javascript
// services/inscricaoService.js (exemplo)
export async function inscreverParticipante(ligaId, timeId, temporada) {
  // Validacao de negocio
  const inscricaoExistente = await InscricaoTemporada.findOne({
    liga_id: ligaId,
    time_id: timeId,
    temporada
  }).lean();

  if (inscricaoExistente) {
    const error = new Error('Participante ja inscrito nesta temporada');
    error.code = 'INSCRICAO_DUPLICADA';
    error.statusCode = 409;
    throw error;
  }

  // Operacao
  return await InscricaoTemporada.create({
    liga_id: ligaId,
    time_id: timeId,
    temporada,
    data_inscricao: new Date()
  });
}
```

### 2.3 Hierarquia de Erro (Futura Melhoria)

```javascript
// utils/AppError.js (proposta para evolucao)
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Erro esperado, nao bug
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} nao encontrado(a)`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Nao autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}
```

---

## 3. Logging Seguro

### O que Logar

```javascript
// CORRETO: Contexto suficiente para debug
logger.error('Erro ao processar inscricao', {
  ligaId,
  timeId,
  temporada,
  error: error.message,
  stack: error.stack  // Apenas em dev, nao em prod
});

// CORRETO: Operacao financeira com audit trail
logger.info('Acerto financeiro registrado', {
  ligaId,
  timeId,
  valor,
  tipo: 'CREDITO',
  operador: req.session.usuario.email
});
```

### O que NUNCA Logar

```javascript
// PROIBIDO: Dados sensiveis
logger.info(`Senha do admin: ${senha}`);           // NUNCA
logger.info(`Token: ${req.session.token}`);         // NUNCA
logger.info(`Cookie: ${req.headers.cookie}`);       // NUNCA
logger.info(`MONGO_URI: ${process.env.MONGO_URI}`); // NUNCA
```

### Niveis de Log

| Nivel | Quando Usar | Exemplo |
|-------|-------------|---------|
| `error` | Falha critica, bug, DB down | `logger.error('MongoDB connection lost')` |
| `warn` | Situacao incomum mas tratada | `logger.warn('Rate limit atingido', { ip })` |
| `info` | Evento de negocio importante | `logger.info('Inscricao realizada', { ligaId })` |
| `debug` | Detalhes para desenvolvimento | `logger.debug('Query result', { count })` |

---

## 4. Respostas ao Cliente

### Regras

```markdown
□ NUNCA expor stack trace em producao
□ NUNCA expor mensagem de erro do MongoDB ao cliente
□ NUNCA expor caminhos internos do servidor
□ Mensagens de erro claras e uteis para o usuario
□ Codigo de erro padronizado quando possivel
```

### Exemplos

```javascript
// ERRADO: Expoe detalhes internos
res.status(500).json({
  error: error.message,     // "MongoServerError: E11000 duplicate key"
  stack: error.stack,        // Caminho completo do servidor
  query: { liga_id: '...' } // Detalhes da query
});

// CORRETO: Mensagem segura
apiServerError(res, error);
// Retorna: { success: false, error: 'Erro interno do servidor' }
// E loga internamente com todos os detalhes
```

---

## 5. Erros de MongoDB Comuns

| Erro | Codigo | Causa | Tratamento |
|------|--------|-------|------------|
| E11000 | Duplicate key | Indice unique violado | 409 Conflict |
| Timeout | — | Query lenta ou DB sobrecarregado | Retry com backoff |
| Connection lost | — | Rede ou DB reiniciou | Reconnect automatico |
| CastError | — | ID invalido (nao e ObjectId) | 400 Bad Request |
| ValidationError | — | Schema do Mongoose violado | 400 com campos invalidos |

```javascript
// Tratamento de erro MongoDB no catch
catch (error) {
  if (error.code === 11000) {
    return apiConflict(res, 'Registro duplicado');
  }
  if (error.name === 'CastError') {
    return apiError(res, 'ID invalido', 400);
  }
  if (error.name === 'ValidationError') {
    const campos = Object.keys(error.errors).join(', ');
    return apiError(res, `Campos invalidos: ${campos}`, 400);
  }
  return apiServerError(res, error);
}
```

---

## 6. Checklist

```markdown
□ Todo controller async tem try/catch
□ Erros operacionais retornam status HTTP adequado (400, 401, 403, 404, 409)
□ Erros de programacao retornam 500 generico (sem detalhes internos)
□ Erros logados com contexto suficiente (liga_id, time_id, operacao)
□ Sem dados sensiveis nos logs (senhas, tokens, MONGO_URI)
□ Erros de MongoDB mapeados para respostas adequadas (E11000 → 409)
□ apiResponse.js usado consistentemente (apiSuccess, apiError, apiServerError)
□ Promises nao ficam sem catch (express-async-errors ou try/catch explicito)
```

---

## Sinais de Risco Alto

| Sinal | Risco | Acao |
|-------|-------|------|
| `catch (e) {}` — catch vazio | Bug silenciado | Logar ou relancar |
| `catch { return null }` onde null e valor valido | Erro mascarado como "nao encontrado" | Distinguir erro de resultado vazio |
| `throw new Error("Something went wrong")` | Sem contexto para debug | Incluir detalhes da operacao |
| Stack trace no response body | Exposicao de internals | Usar apiServerError |
| Console.log com dados financeiros | Exposicao de dados sensiveis | Usar logger com sanitizacao |

---

**Versao:** 1.0 (Adaptado do agnostic-core para SuperCartola)
