---
name: code-inspector
description: Senior Full-Stack Code Auditor - Especialista em Arquitetura, Segurança, Performance, Observabilidade e Qualidade de Software. Focado em Node.js/Express/MongoDB com expertise em sistemas multi-tenant SaaS. Use para auditorias profundas, análise de débito técnico, code review, troubleshooting avançado, refatoração estratégica ou otimização de sistemas.
allowed-tools: Read, Grep, LS, Bash, Edit
---

# Code Inspector Skill (Senior Full-Stack Edition)

## 🎯 Missão
Garantir excelência técnica através de auditorias sistemáticas com visão holística: segurança, performance, manutenibilidade, observabilidade e resiliência.

---

## 1. 🔬 Framework de Auditoria (SPARC)

### S - Security (Segurança)
### P - Performance (Desempenho)
### A - Architecture (Arquitetura)
### R - Reliability (Confiabilidade)
### C - Code Quality (Qualidade)

Toda auditoria deve cobrir essas 5 dimensões com scores de 1-5.

---

## 2. 🛡️ Security Deep Dive

### 2.1 OWASP Top 10 Checklist (Node.js/Express)

| # | Vulnerabilidade | Regex/Busca | Severidade | Mitigação |
|---|-----------------|-------------|------------|-----------|
| A01 | Broken Access Control | Rotas sem middleware auth | 🔴 CRÍTICO | verificarAdmin, verificarParticipante |
| A02 | Cryptographic Failures | md5, sha1 para senhas | 🔴 CRÍTICO | bcrypt com salt rounds >= 10 |
| A03 | Injection | \$where, eval(), new Function | 🔴 CRÍTICO | Sanitização, prepared statements |
| A04 | Insecure Design | Sem rate limiting em auth | 🟡 ALTO | express-rate-limit |
| A05 | Security Misconfiguration | origin: '*', debug em prod | 🟡 ALTO | Helmet, CORS restrito |
| A06 | Vulnerable Components | npm audit --json | 🟡 ALTO | Dependabot, audits regulares |
| A07 | Auth Failures | Sessão sem httpOnly/secure | 🔴 CRÍTICO | Cookie flags corretas |
| A08 | Data Integrity | Sem validação de schema | 🟡 MÉDIO | Joi, Zod, express-validator |
| A09 | Logging Failures | Dados sensíveis em logs | 🟡 MÉDIO | Sanitizar PII |
| A10 | SSRF | fetch com URL user-controlled | 🔴 CRÍTICO | Whitelist de URLs |

### 2.2 Análise de Autenticação/Autorização

```bash
# Rotas POST/PUT/DELETE sem middleware de auth
grep -rn "router\.\(post\|put\|delete\|patch\)" routes/ | grep -v "verificar"

# Sessões sem flags de segurança
grep -rn "cookie:" config/ | grep -v "httpOnly\|secure\|sameSite"

# Secrets expostos
grep -rn "password\s*[:=]\s*['\"][^'\"]*['\"]" --include="*.js" | grep -v "process\.env\|\.example"

# JWT sem expiração
grep -rn "jwt\.sign" --include="*.js" | grep -v "expiresIn"
```

### 2.3 MongoDB Injection Patterns

```javascript
// 🔴 VULNERÁVEL: Query operator injection
const user = await User.findOne({ email: req.body.email }); // Se email = {"$gt": ""}

// 🟢 SEGURO: Sanitização
const email = String(req.body.email).toLowerCase().trim();
const user = await User.findOne({ email });

// 🔴 VULNERÁVEL: $where (executa JS no servidor)
db.collection.find({ $where: "this.name == '" + userInput + "'" });

// 🟢 SEGURO: Usar operadores nativos
db.collection.find({ name: sanitizedInput });

// 🔴 VULNERÁVEL: RegEx injection
const regex = new RegExp(req.query.search); // Se search = ".*"

// 🟢 SEGURO: Escape especial characters
const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(escaped, 'i');
```

### 2.4 Checklist de Segurança - Super Cartola

| Item | Status | Arquivo de Referência | Script Validação |
|------|--------|----------------------|------------------|
| Rate limiting em login | ✓ | routes/admin-auth-routes.js | `grep -rn "rateLimit" routes/*auth*` |
| CSRF protection | ✓ | index.js (csurf) | `grep -rn "csurf\|csrf" index.js` |
| Helmet headers | ✓ | index.js | `grep -rn "helmet" index.js` |
| Session segura | ✓ | config/replit-auth.js | `grep -rn "httpOnly.*secure" config/` |
| Sanitização de inputs | ? | Controllers | `./scripts/audit_input_sanitization.sh` |
| Multi-tenant isolation | 🔴 | Todas queries com liga_id | `./scripts/audit_multitenant.sh` |
| Google OAuth tokens | ✓ | config/google-auth.js | `grep -rn "GOOGLE_CLIENT" config/` |
| Admin vs Participante | ✓ | middleware/auth.js | `grep -rn "verificarAdmin\|verificarParticipante" middleware/` |

### 2.5 Scripts de Auditoria Automática

Crie `/scripts/audit_security.sh`:
```bash
#!/bin/bash
echo "🔐 AUDITORIA DE SEGURANÇA - Super Cartola"
echo "=========================================="
echo ""

# Rotas desprotegidas
echo "🔴 ROTAS POST/PUT/DELETE SEM AUTH:"
find routes/ -name "*.js" -exec grep -l "router\.\(post\|put\|delete\)" {} \; | while read file; do
  if ! grep -q "verificar" "$file"; then
    echo "  ⚠️  $file"
  fi
done
echo ""

# Queries sem liga_id
echo "🔴 QUERIES SEM MULTI-TENANT ISOLATION:"
grep -rn "\.find({" controllers/ routes/ | grep -v "liga_id\|ligaId" | head -10
echo ""

# Console.logs em produção
echo "🟡 CONSOLE.LOGS (remover em produção):"
find controllers/ routes/ services/ -name "*.js" -exec grep -Hn "console\.log" {} \; | wc -l
echo ""

# Secrets hardcoded
echo "🔴 SECRETS HARDCODED:"
grep -rn "password\s*[:=]\s*['\"][^'\"]*['\"]" --include="*.js" | grep -v "process\.env\|\.example\|\.sample" | wc -l
echo ""

# npm audit
echo "🟡 VULNERABILIDADES NPM:"
npm audit --json 2>/dev/null | jq '.metadata | {vulnerabilities, totalDependencies}'
```

---

## 3. ⚡ Performance Engineering

### 3.1 Database Performance

#### N+1 Query Detection
```bash
# Encontrar loops com queries
grep -rn "for.*await\|forEach.*await\|\.map.*await" controllers/ --include="*.js"

# Queries sem .lean()
grep -rn "find\|findOne" controllers/ | grep -v "\.lean()"

# Agregações complexas sem índices
grep -rn "\.aggregate\|\.pipeline" controllers/ services/
```

#### Otimizações MongoDB

| Anti-Pattern | Impacto | Solução | Script Detecção |
|--------------|---------|---------|-----------------|
| N+1 Queries | 100x mais lento | \$in, \$lookup, bulk | `grep -rn "for.*await.*find"` |
| Sem .lean() | 5x mais memória | Adicionar .lean() em reads | `grep "find.*{" \| grep -v "lean"` |
| Sem índices | Scan completo | createIndex em campos filtrados | `mongo --eval "db.collection.getIndexes()"` |
| Select * | I/O desnecessário | .select('campo1 campo2') | `grep "find.*{" \| grep -v "select"` |
| Sort sem índice | In-memory sort | Índice composto incluindo sort | Ver explain plan |
| Skip grande | Lento em paginação | Cursor-based pagination | `grep "skip.*[0-9]{3,}"` |
| $where | Execução JS | Operadores nativos | `grep "\$where"` |
| Regex sem âncora | Full scan | /^prefixo/ com índice | `grep "RegExp.*\$" \| grep -v "\\^"` |

#### Query Analysis (Super Cartola Specific)
```javascript
// Habilitar profiling temporário
db.setProfilingLevel(1, { slowms: 100 });

// Ver queries lentas
db.system.profile.find({ ns: /^super_cartola\./ }).sort({ ts: -1 }).limit(10);

// Explain de query suspeita
db.participantes.find({ liga_id: "684cb1c8af923da7c7df51de" })
  .sort({ pontos_acumulados: -1 })
  .explain("executionStats");

// Verificar uso de índices
db.participantes.getIndexes();
db.rodadas.getIndexes();
db.financeiro.getIndexes();
```

### 3.2 Node.js Performance

#### Event Loop Blocking
```bash
# Operações síncronas que bloqueiam
grep -rn "readFileSync\|writeFileSync\|execSync" --include="*.js" | grep -v "node_modules"

# JSON.parse em payloads grandes sem stream
grep -rn "JSON\.parse" controllers/ services/

# Loops síncronos pesados
grep -rn "for.*length\|while.*true" --include="*.js" | grep -v "node_modules"
```

#### Memory Leaks Patterns
```javascript
// 🔴 LEAK: Listeners acumulando
emitter.on('event', handler); // Sem removeListener

// 🔴 LEAK: Closures retendo referências
const cache = {};
function process(data) {
  cache[data.id] = data; // Cresce infinitamente
}

// 🔴 LEAK: Timers não limpos
setInterval(() => {}, 1000); // Sem clearInterval

// 🔴 LEAK: Arrays crescendo indefinidamente
global.requestLog = [];
app.use((req, res, next) => {
  global.requestLog.push({ url: req.url, time: Date.now() });
  next();
});

// 🟢 SOLUÇÃO: WeakMap para cache
const cache = new WeakMap();

// 🟢 SOLUÇÃO: LRU Cache com limite
const LRU = require('lru-cache');
const cache = new LRU({ max: 500 });

// 🟢 SOLUÇÃO: Circular buffer
const requestLog = new CircularBuffer(1000);
```

### 3.3 Frontend Performance (Super Cartola Mobile)

| Métrica | Target | Como Medir | Arquivo Referência |
|---------|--------|------------|-------------------|
| FCP (First Contentful Paint) | < 1.8s | Lighthouse | participante-navigation.js |
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse | index.html (splash screen) |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse | Evitar height/width dinâmicos |
| TTI (Time to Interactive) | < 3.8s | Lighthouse | Lazy load modules |
| IndexedDB Read | < 50ms | Performance API | cache-manager.js |
| API Response | < 200ms | Network tab | Todas routes |

#### Checklist Frontend
```bash
# Bundles grandes (>100KB)
find public/js -name "*.js" -size +100k -exec ls -lh {} \;

# Imagens não otimizadas (>200KB)
find public/img -type f \( -name "*.png" -o -name "*.jpg" \) -size +200k

# Scripts sem defer/async
grep -rn "<script" public/ views/ | grep -v "defer\|async\|type=\"module\""

# CSS inline excessivo (>1KB)
find public/ -name "*.html" -exec grep -l "style>" {} \; | while read f; do
  size=$(sed -n '/<style>/,/<\/style>/p' "$f" | wc -c)
  if [ $size -gt 1024 ]; then echo "$f: ${size}B"; fi
done

# Requests sem cache headers
grep -rn "res\.json\|res\.send" routes/ | grep -v "Cache-Control"
```

### 3.4 Cache Strategy (Super Cartola)

#### Frontend - IndexedDB
```javascript
// Pattern Cache-First (correto)
async function loadParticipante() {
  // 1. Tentar cache primeiro (instantâneo)
  const cached = await db.participante.get(userId);
  if (cached && !isStale(cached)) {
    renderUI(cached);
  }
  
  // 2. Atualizar em background
  const fresh = await fetch('/api/participante').then(r => r.json());
  await db.participante.put(fresh);
  
  // 3. Re-render se mudou
  if (JSON.stringify(cached) !== JSON.stringify(fresh)) {
    renderUI(fresh);
  }
}

// TTL por módulo
const TTL = {
  participante: 24 * 60 * 60 * 1000, // 24h
  ranking: 60 * 60 * 1000,           // 1h
  extrato: 30 * 60 * 1000,           // 30min
  liga: 24 * 60 * 60 * 1000          // 24h
};
```

#### Backend - MongoDB + Memory
```javascript
// Pattern para dados calculados (NÃO persistir)
class FluxoFinanceiroService {
  async calcularSaldo(participanteId, ligaId, temporada) {
    // NUNCA salvar em DB - sempre calcular fresh
    const rodadas = await Rodada.find({ participante_id, liga_id, temporada });
    const acertos = await AcertoFinanceiro.find({ participante_id, liga_id, temporada });
    
    return this.somarTudo(rodadas, acertos); // Cálculo em tempo real
  }
}

// Pattern para dados estáticos (persistir com cache)
class RankingService {
  async getRankingRodada(ligaId, rodadaNum) {
    const cacheKey = `ranking:${ligaId}:${rodadaNum}`;
    
    // Memory cache (Node)
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // DB cache
    const cached = await RankingCache.findOne({ liga_id: ligaId, rodada: rodadaNum });
    if (cached) {
      this.cache.set(cacheKey, cached.data);
      return cached.data;
    }
    
    // Calcular e cachear
    const ranking = await this.calcular(ligaId, rodadaNum);
    await RankingCache.create({ liga_id: ligaId, rodada: rodadaNum, data: ranking });
    this.cache.set(cacheKey, ranking);
    
    return ranking;
  }
}
```

---

## 4. 🏗️ Architecture Analysis

### 4.1 SOLID Principles Check

| Princípio | Violação Comum | Como Detectar | Threshold |
|-----------|----------------|---------------|-----------|
| **S**ingle Responsibility | Controller com lógica de negócio | Arquivo > 300 linhas | 300 LOC |
| **O**pen/Closed | Switch/case crescendo | switch.*case em múltiplos lugares | 3+ ocorrências |
| **L**iskov Substitution | Herança quebrada | Override que muda comportamento | Manual review |
| **I**nterface Segregation | Models muito grandes | Schema > 50 campos | 50 fields |
| **D**ependency Inversion | Import direto de implementação | Sem camada de abstração | Manual review |

### 4.2 Layer Violations

```
✅ CORRETO:
Route → Controller → Service → Model → Database

❌ VIOLAÇÃO:
Route → Database (skip controller/service)
Controller → Database (skip model)
Frontend → Database (exposição direta)
```

```bash
# Routes acessando Model diretamente (pular controller)
grep -rn "import.*from.*models" routes/

# Controllers com lógica que deveria estar em Service
grep -rn "\.aggregate\|\.bulkWrite" controllers/

# Frontend com lógica de negócio
grep -rn "function.*calcular\|function.*processar" public/js/ | grep -v "UI\|render\|format"
```

### 4.3 Arquitetura Multi-Tenant (Crítico - Super Cartola)

```bash
# TODAS as queries devem filtrar por liga_id
# Buscar queries sem filtro de tenant
grep -rn "\.find({" controllers/ routes/ | grep -v "liga_id\|ligaId" | head -20

# Verificar rotas que recebem ligaId
grep -rn "req\.params\.ligaId\|req\.body\.liga_id" routes/

# Validar middleware de tenant
grep -rn "tenantFilter\|verificarAcesso" middleware/
```

| Camada | Responsabilidade | Validação | Arquivo |
|--------|------------------|-----------|---------|
| Route | Extrair ligaId dos params | req.params.ligaId | routes/*.js |
| Middleware | Injetar liga_id no req | tenantFilter.js | middleware/tenant.js |
| Controller | Sempre passar para Service | Não assumir default | controllers/*.js |
| Model | Índice composto com liga_id | Schema index | models/*.js |

#### Script de Auditoria Multi-Tenant
```bash
#!/bin/bash
# /scripts/audit_multitenant.sh

echo "🔍 AUDITORIA MULTI-TENANT"
echo "========================="
echo ""

# Queries perigosas (sem liga_id)
echo "🔴 QUERIES SEM LIGA_ID:"
grep -rn "\.find({}\|\.findOne({})" controllers/ routes/ services/
grep -rn "\.find({" controllers/ routes/ services/ | grep -v "liga_id\|ligaId" | grep -v "system_config\|users" | head -20
echo ""

# Rotas sem validação de tenant
echo "🟡 ROTAS SEM VALIDAÇÃO DE TENANT:"
find routes/ -name "*.js" | while read file; do
  if grep -q "router\.\(post\|put\|delete\)" "$file"; then
    if ! grep -q "ligaId\|liga_id" "$file"; then
      echo "  ⚠️  $file"
    fi
  fi
done
echo ""

# Modelos sem índice de liga_id
echo "🟡 MODELS SEM ÍNDICE DE LIGA_ID:"
find models/ -name "*.js" | while read file; do
  if ! grep -q "liga_id.*index\|index.*liga_id" "$file"; then
    echo "  ⚠️  $file"
  fi
done
```

### 4.4 Modular Architecture (Super Cartola)

```
public/
├── js/
│   ├── fluxo-financeiro/          # Módulo isolado
│   │   ├── config.js               # Configurações
│   │   ├── core.js                 # Lógica de negócio
│   │   ├── ui.js                   # Renderização
│   │   └── orchestrator.js         # Orquestração
│   ├── participante/
│   │   ├── fronts/                 # Templates SPA
│   │   ├── modules/                # Módulos isolados
│   │   └── core/                   # Shared utilities
│   └── admin/
│       └── modules/                # Módulos admin
```

**Validação de Modularidade:**
```bash
# Módulos que violam isolamento (importam de outros módulos)
grep -rn "import.*from.*\.\./\.\." public/js/*/

# Código duplicado entre módulos
find public/js -name "*.js" -exec grep -l "function calcularSaldo" {} \;

# Módulos sem orchestrator
find public/js -type d -name "*-*" | while read dir; do
  if [ ! -f "$dir/orchestrator.js" ]; then
    echo "Sem orchestrator: $dir"
  fi
done
```

### 4.5 Dependency Graph Analysis

Crie `/scripts/analyze_dependencies.js`:
```javascript
const fs = require('fs');
const path = require('path');

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
  const exports = content.match(/module\.exports\s*=|exports\./g) || [];
  
  return {
    file: filePath,
    imports: imports.map(i => i.match(/['"]([^'"]+)['"]/)[1]),
    hasExports: exports.length > 0
  };
}

function findCircularDeps(graph) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];
  
  function dfs(node, path = []) {
    if (stack.has(node)) {
      cycles.push([...path, node]);
      return;
    }
    if (visited.has(node)) return;
    
    visited.add(node);
    stack.add(node);
    path.push(node);
    
    (graph[node] || []).forEach(dep => dfs(dep, [...path]));
    
    stack.delete(node);
  }
  
  Object.keys(graph).forEach(node => dfs(node));
  return cycles;
}

// Executar
const files = require('glob').sync('**/*.js', { ignore: 'node_modules/**' });
const graph = {};

files.forEach(file => {
  const analysis = analyzeFile(file);
  graph[file] = analysis.imports;
});

const cycles = findCircularDeps(graph);
if (cycles.length > 0) {
  console.log('🔴 DEPENDÊNCIAS CIRCULARES ENCONTRADAS:');
  cycles.forEach(cycle => console.log('  ->', cycle.join(' → ')));
} else {
  console.log('✅ Sem dependências circulares');
}
```

---

## 5. 🔄 Reliability & Resilience

### 5.1 Error Handling Patterns

```javascript
// 🔴 RUIM: Engolir erros
try { await operation(); } catch (e) { }

// 🔴 RUIM: Throw genérico
throw new Error('Erro');

// 🔴 RUIM: Não propagar contexto
catch (error) {
  console.error(error);
  res.status(500).json({ error: 'Erro interno' });
}

// 🟢 BOM: Error handling completo
try {
  const result = await operation();
  return result;
} catch (error) {
  // 1. Log estruturado
  console.error('[FLUXO-FINANCEIRO] Operation failed', { 
    error: error.message,
    stack: error.stack,
    context: { userId, ligaId, temporada }
  });
  
  // 2. Error classification
  if (error instanceof ValidationError) {
    throw new AppError('Dados inválidos', 400, 'VALIDATION_ERROR');
  }
  if (error instanceof NotFoundError) {
    throw new AppError('Recurso não encontrado', 404, 'NOT_FOUND');
  }
  
  // 3. Fallback e retry
  if (error.code === 'ECONNREFUSED') {
    return await this.retryWithBackoff(operation, 3);
  }
  
  // 4. Throw com contexto
  throw new AppError('Erro interno', 500, 'INTERNAL_ERROR', { originalError: error.message });
}
```

### 5.2 Graceful Degradation

```bash
# Operações sem timeout
grep -rn "await.*fetch\|await.*axios" --include="*.js" | grep -v "timeout"

# Sem circuit breaker em integrações externas
grep -rn "cartolaApi\|fetch.*cartola" services/

# Sem fallback em features não-críticas
grep -rn "await.*Service\." controllers/ | grep -v "catch\|try"
```

```javascript
// Pattern de graceful degradation
async function loadRanking(ligaId, rodada) {
  try {
    // Tentar fonte primária (API Cartola)
    const data = await cartolaService.getRanking(ligaId, rodada);
    return data;
  } catch (error) {
    console.warn('[RANKING] API Cartola falhou, usando cache', error.message);
    
    // Fallback 1: Cache MongoDB
    const cached = await RankingCache.findOne({ liga_id: ligaId, rodada });
    if (cached) return cached.data;
    
    // Fallback 2: Dados parciais
    console.warn('[RANKING] Sem cache, retornando dados parciais');
    return { status: 'degraded', data: await this.getPartialData(ligaId) };
  }
}
```

### 5.3 Idempotency Check (Super Cartola Financial)

```javascript
// ✅ Operações financeiras DEVEM ser idempotentes
class AcertoFinanceiroService {
  async registrarPagamento(participanteId, ligaId, valor, descricao) {
    // Gerar ID idempotente baseado em dados únicos
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${participanteId}-${ligaId}-${valor}-${descricao}-${Date.now()}`)
      .digest('hex');
    
    // Verificar se já foi processado
    const existing = await AcertoFinanceiro.findOne({ 
      idempotency_key: idempotencyKey
    });
    
    if (existing) {
      console.log('[ACERTO] Operação já processada (idempotente)', idempotencyKey);
      return { success: true, message: 'Já processado', idempotent: true, data: existing };
    }
    
    // Processar apenas uma vez
    const acerto = await AcertoFinanceiro.create({
      idempotency_key: idempotencyKey,
      participante_id: participanteId,
      liga_id: ligaId,
      tipo: 'pagamento',
      valor,
      descricao,
      data: new Date()
    });
    
    return { success: true, data: acerto, idempotent: false };
  }
}
```

**Script de validação de idempotência:**
```bash
# Verificar operações financeiras sem idempotency_key
grep -rn "AcertoFinanceiro\.create\|\.insertOne" controllers/ services/ | grep -v "idempotency"
```

### 5.4 Retry & Backoff (External APIs)

```javascript
// Para integrações externas (Cartola API)
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { 
        ...options, 
        timeout: 5000,
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) return response;
      
      // Retry em erros 5xx
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(`[RETRY] Tentativa ${attempt}/${maxRetries} falhou, retry em ${delay}ms`);
        await sleep(delay);
        continue;
      }
      
      // Erro 4xx não faz retry
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`[RETRY] Todas ${maxRetries} tentativas falharam`, error);
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[RETRY] Erro na tentativa ${attempt}, retry em ${delay}ms`, error.message);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 6. 📊 Observability (Logs, Metrics, Tracing)

### 6.1 Logging Best Practices

| Level | Quando Usar | Exemplo | Arquivo |
|-------|-------------|---------|---------|
| error | Falhas que precisam ação | DB connection failed | Toda operação crítica |
| warn | Situações anômalas | Rate limit approaching | Features degradadas |
| info | Eventos de negócio | Participante inscrito | Transações importantes |
| debug | Troubleshooting | Query params recebidos | Desenvolvimento |

```javascript
// 🔴 RUIM
console.log('erro', error);
console.log(participante);

// 🟢 BOM - Structured logging
console.error('[FLUXO-FINANCEIRO] Falha ao calcular saldo', {
  ligaId,
  timeId,
  temporada,
  error: error.message,
  stack: error.stack
});

console.info('[INSCRICAO] Participante inscrito com sucesso', {
  participanteId: participante._id,
  ligaId: liga._id,
  temporada: '2026',
  timestamp: new Date().toISOString()
});

// 🟢 MELHOR - Logger com níveis
const logger = require('./config/logger');
logger.error('Falha ao calcular saldo', { ligaId, timeId, error });
logger.info('Participante inscrito', { participanteId, ligaId });
```

### 6.2 Audit Trail (Operações Sensíveis)

```javascript
// Toda operação financeira deve ser logada
class AuditLogService {
  async log(action, actor, target, payload, req) {
    await AuditLog.create({
      action,                              // 'ACERTO_FINANCEIRO', 'DELETE_PARTICIPANTE'
      actor: actor || 'system',            // Email do admin ou 'system'
      target,                              // { ligaId, timeId, participanteId }
      payload,                             // { valor, tipo, descricao }
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
      timestamp: new Date()
    });
  }
}

// Usar em controllers críticos
router.post('/acerto-financeiro', verificarAdmin, async (req, res) => {
  const { participanteId, valor, tipo } = req.body;
  
  // Executar operação
  const result = await acertoService.registrar(participanteId, valor, tipo);
  
  // Auditar SEMPRE
  await auditLog.log(
    'ACERTO_FINANCEIRO',
    req.session.admin.email,
    { participanteId, ligaId: req.params.ligaId },
    { valor, tipo },
    req
  );
  
  res.json(result);
});
```

**Script de análise de audit logs:**
```bash
# Encontrar operações financeiras sem audit
grep -rn "AcertoFinanceiro\|\.updateMany\|\.deleteMany" controllers/ | grep -v "auditLog"
```

### 6.3 Health Checks

```javascript
// Endpoint de health para monitoramento
router.get('/health', async (req, res) => {
  const checks = {
    database: await checkMongoDB(),
    cartolaApi: await checkCartolaAPI(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    },
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV
  };
  
  const healthy = checks.database.status === 'ok' && checks.cartolaApi.status === 'ok';
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});

async function checkMongoDB() {
  try {
    await mongoose.connection.db.admin().ping();
    return { status: 'ok', latency: '< 50ms' };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

async function checkCartolaAPI() {
  try {
    const start = Date.now();
    await fetch('https://api.cartolafc.globo.com/auth/time/info', { timeout: 3000 });
    const latency = Date.now() - start;
    return { status: 'ok', latency: `${latency}ms` };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}
```

### 6.4 Métricas de Negócio (Super Cartola)

```javascript
// Métricas importantes para monitorar
class MetricsCollector {
  async collect() {
    return {
      // Métricas de uso
      totalLigas: await Liga.countDocuments(),
      totalParticipantes: await Participante.countDocuments(),
      participantesAtivos: await Participante.countDocuments({ 
        active_seasons: { $in: ['2026'] } 
      }),
      
      // Métricas financeiras
      saldoTotalPositivo: await this.getSaldoTotal('positivo'),
      saldoTotalNegativo: await this.getSaldoTotal('negativo'),
      
      // Métricas de performance
      avgQueryTime: await this.getAvgQueryTime(),
      cacheHitRate: await this.getCacheHitRate(),
      
      // Métricas de API externa
      cartolaApiCalls: this.cartolaApiCallsCount,
      cartolaApiErrors: this.cartolaApiErrorsCount,
      
      timestamp: new Date()
    };
  }
}

// Endpoint de métricas (protegido)
router.get('/metrics', verificarAdmin, async (req, res) => {
  const metrics = await metricsCollector.collect();
  res.json(metrics);
});
```

---

## 7. 🧹 Code Quality & Technical Debt

### 7.1 Code Smells Severity Matrix

| Smell | Severidade | Threshold | Ação | Script Detecção |
|-------|------------|-----------|------|-----------------|
| Função > 50 linhas | 🟡 Médio | 50 LOC | Extrair funções | `./scripts/check_function_length.sh` |
| Arquivo > 500 linhas | 🟡 Médio | 500 LOC | Dividir módulo | `find . -name "*.js" -exec wc -l {} \; \| sort -n` |
| Cyclomatic complexity > 10 | 🔴 Alto | 10 | Simplificar lógica | `npx complexity-report` |
| Duplicação > 10 linhas | 🟡 Médio | 10 LOC | Extrair função | `npx jscpd` |
| Nesting > 4 níveis | 🟡 Médio | 4 | Early return | Grep com regex |
| Parâmetros > 5 | 🟡 Médio | 5 | Object parameter | `grep "function.*(.*, .*, .*, .*, .*, .*)"` |
| TODO/FIXME antigo | 🟢 Baixo | 30 dias | Resolver ou remover | `./scripts/check_todos.sh` |
| Console.log em produção | 🟡 Médio | 0 | Remover | `grep -rn "console\.log" --exclude-dir=node_modules` |

### 7.2 Dead Code Detection

```bash
#!/bin/bash
# /scripts/detect_dead_code.sh

echo "🧹 DETECÇÃO DE CÓDIGO MORTO"
echo "==========================="
echo ""

# Código comentado (> 5 linhas)
echo "📝 CÓDIGO COMENTADO:"
find . -name "*.js" ! -path "./node_modules/*" -exec grep -Pzo '(?s)\/\*.*?\*\/' {} \; | grep -c "function\|const\|let"
echo ""

# Console.logs esquecidos
echo "🖨️  CONSOLE.LOGS (remover antes de deploy):"
grep -rn "console\.log" controllers/ routes/ services/ public/js/ --include="*.js" | wc -l
grep -rn "console\.log" controllers/ routes/ services/ public/js/ --include="*.js" | head -10
echo ""

# TODOs e FIXMEs
echo "📌 TODOs/FIXMEs:"
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.js" ! -path "./node_modules/*" | wc -l
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.js" ! -path "./node_modules/*" | head -10
echo ""

# Funções não exportadas e não usadas
echo "🔇 FUNÇÕES POTENCIALMENTE NÃO USADAS:"
find . -name "*.js" ! -path "./node_modules/*" -exec grep -H "^function\|^const.*= function\|^const.*=>" {} \; | while read line; do
  func=$(echo "$line" | sed 's/.*function \([^(]*\).*/\1/' | sed 's/.*const \([^ =]*\).*/\1/')
  file=$(echo "$line" | cut -d: -f1)
  if ! grep -rq "$func" --exclude="$file" --exclude-dir=node_modules .; then
    echo "  ⚠️  $func em $file"
  fi
done | head -10
echo ""

# Imports não utilizados
echo "📦 IMPORTS NÃO UTILIZADOS:"
find . -name "*.js" ! -path "./node_modules/*" -exec grep -H "^const.*require\|^import" {} \; | while read line; do
  var=$(echo "$line" | sed "s/.*const \([^ =]*\).*/\1/" | sed "s/.*import \([^ ]*\).*/\1/")
  file=$(echo "$line" | cut -d: -f1)
  content=$(cat "$file")
  # Contar ocorrências (deve ter mais de 1 - a própria declaração)
  count=$(echo "$content" | grep -o "$var" | wc -l)
  if [ "$count" -le 1 ]; then
    echo "  ⚠️  $var em $file"
  fi
done | head -10
```

### 7.3 Dependency Health

```bash
#!/bin/bash
# /scripts/check_dependencies.sh

echo "📦 ANÁLISE DE DEPENDÊNCIAS"
echo "========================="
echo ""

# Pacotes desatualizados
echo "🔄 PACOTES DESATUALIZADOS:"
npm outdated 2>/dev/null || echo "Nenhum"
echo ""

# Vulnerabilidades
echo "🔒 VULNERABILIDADES:"
npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities'
echo ""

# Dependências não utilizadas
echo "🗑️  DEPENDÊNCIAS NÃO UTILIZADAS:"
npx depcheck --json 2>/dev/null | jq '.dependencies'
echo ""

# Dependências duplicadas
echo "🔀 DEPENDÊNCIAS DUPLICADAS:"
npm ls 2>&1 | grep -E "├─|└─" | sort | uniq -d
echo ""

# Tamanho do node_modules
echo "📊 TAMANHO NODE_MODULES:"
du -sh node_modules 2>/dev/null || echo "N/A"
```

### 7.4 Complexity Analysis

Crie `/scripts/complexity_report.js`:
```javascript
const fs = require('fs');
const path = require('path');
const glob = require('glob');

function calculateComplexity(code) {
  // Contar estruturas de decisão
  const ifCount = (code.match(/\bif\s*\(/g) || []).length;
  const forCount = (code.match(/\bfor\s*\(/g) || []).length;
  const whileCount = (code.match(/\bwhile\s*\(/g) || []).length;
  const switchCount = (code.match(/\bswitch\s*\(/g) || []).length;
  const caseCount = (code.match(/\bcase\s+/g) || []).length;
  const ternaryCount = (code.match(/\?[^:]+:/g) || []).length;
  const logicalCount = (code.match(/&&|\|\|/g) || []).length;
  
  return 1 + ifCount + forCount + whileCount + switchCount + caseCount + ternaryCount + logicalCount;
}

function analyzeFunctions(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const functions = content.match(/function\s+(\w+)|(\w+)\s*=\s*function|(\w+)\s*=\s*\([^)]*\)\s*=>/g) || [];
  
  return functions.map(func => {
    const name = func.match(/function\s+(\w+)|(\w+)\s*=/)[1] || func.match(/(\w+)\s*=/)[1];
    // Encontrar corpo da função
    const funcStart = content.indexOf(func);
    const funcBody = content.substring(funcStart, content.indexOf('}', funcStart) + 1);
    
    return {
      name,
      complexity: calculateComplexity(funcBody),
      lines: funcBody.split('\n').length
    };
  });
}

// Executar
const files = glob.sync('**/*.js', { 
  ignore: ['node_modules/**', 'test/**', '*.test.js'] 
});

const report = {};
files.forEach(file => {
  const functions = analyzeFunctions(file);
  const highComplexity = functions.filter(f => f.complexity > 10);
  
  if (highComplexity.length > 0) {
    report[file] = highComplexity;
  }
});

console.log('🔴 FUNÇÕES COM ALTA COMPLEXIDADE (>10):');
Object.entries(report).forEach(([file, functions]) => {
  console.log(`\n📄 ${file}`);
  functions.forEach(f => {
    console.log(`  ⚠️  ${f.name}: complexity=${f.complexity}, lines=${f.lines}`);
  });
});
```

### 7.5 Refactoring Priorities (Quadrant)

```
                    IMPACTO ALTO
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │   QUICK WINS       │    MAJOR PROJECTS  │
    │   (Fazer agora)    │    (Planejar)      │
    │   - Console.logs   │    - Multi-tenant  │
    │   - TODOs antigos  │    - Cache strategy│
    │   - Duplicação     │    - Refactor APIs │
────┼────────────────────┼────────────────────┼──── ESFORÇO
    │                    │                    │
    │   FILL-INS         │    THANKLESS       │
    │   (Tempo livre)    │    (Evitar)        │
    │   - Renomear vars  │    - Over-engineer │
    │   - Comentários    │    - Micro-optim.  │
    └────────────────────┼────────────────────┘
                         │
                    IMPACTO BAIXO
```

**Script de priorização:**
```bash
#!/bin/bash
# /scripts/refactor_priorities.sh

echo "📊 PRIORIDADES DE REFATORAÇÃO"
echo "=============================="
echo ""

# QUICK WINS (Alto impacto, Baixo esforço)
echo "🟢 QUICK WINS:"
echo "  1. Remover console.logs: $(grep -rn 'console\.log' controllers/ routes/ | wc -l) ocorrências"
echo "  2. Resolver TODOs: $(grep -rn 'TODO\|FIXME' --include='*.js' | wc -l) itens"
echo "  3. Adicionar .lean() em queries: $(grep -rn '\.find\|\.findOne' controllers/ | grep -v 'lean' | wc -l) queries"
echo ""

# MAJOR PROJECTS (Alto impacto, Alto esforço)
echo "🔴 MAJOR PROJECTS:"
echo "  1. Auditoria multi-tenant completa"
echo "  2. Implementar cache strategy unificada"
echo "  3. Refatorar serviços externos (retry + circuit breaker)"
echo ""

# FILL-INS (Baixo impacto, Baixo esforço)
echo "🟡 FILL-INS:"
echo "  1. Padronizar nomes de variáveis"
echo "  2. Adicionar JSDoc em funções públicas"
echo "  3. Organizar imports"
```

---

## 8. 🧪 Testing Coverage

### 8.1 Test Strategy Matrix

| Tipo | Cobertura Ideal | Foco | Ferramentas |
|------|-----------------|------|-------------|
| Unit | 80%+ | Services, Utils, Core logic | Jest, Mocha |
| Integration | 60%+ | Controllers, Routes, DB | Supertest |
| E2E | Fluxos críticos | Login, Pagamentos, Inscrição | Playwright, Cypress |
| Contract | APIs externas | Cartola API | Pact, MSW |
| Performance | Endpoints críticos | Ranking, Tesouraria | Artillery, k6 |

### 8.2 Verificar Cobertura de Testes

```bash
#!/bin/bash
# /scripts/check_test_coverage.sh

echo "🧪 COBERTURA DE TESTES"
echo "====================="
echo ""

# Rodar testes com coverage
npm test -- --coverage 2>/dev/null || echo "Sem testes configurados"
echo ""

# Verificar arquivos sem testes
echo "📝 ARQUIVOS SEM TESTES:"
find controllers services -name "*.js" ! -name "*.test.js" | while read f; do
  basename=$(basename "$f" .js)
  testfile="tests/${basename}.test.js"
  if [ ! -f "$testfile" ]; then
    echo "  ⚠️  $f"
  fi
done
echo ""

# Contar testes por módulo
echo "📊 TESTES POR MÓDULO:"
find tests/ -name "*.test.js" 2>/dev/null | while read f; do
  count=$(grep -c "describe\|it\|test" "$f")
  echo "  $f: $count testes"
done
```

### 8.3 Test Smells

| Smell | Problema | Solução | Como Detectar |
|-------|----------|---------|---------------|
| Teste > 50 linhas | Difícil manutenção | Dividir em cenários | `grep -A50 "it('"`  |
| Muitos mocks | Acoplamento | Refatorar código | `grep -c "jest.mock\|sinon.stub"` |
| Teste flaky | Dependência externa | Isolar com mocks | Executar 10x e ver falhas |
| Sleep em teste | Lento e frágil | Usar eventos/promises | `grep "sleep\|setTimeout" tests/` |
| Sem assertions | Teste inútil | Verificar retorno | `grep -L "expect\|assert" tests/*.test.js` |
| Setup duplicado | Manutenção difícil | beforeEach | `grep -c "const.*new" tests/*.test.js` |

### 8.4 Test Templates (Super Cartola)

```javascript
// Template para testes de Controller
describe('FluxoFinanceiroController', () => {
  let req, res, controller;
  
  beforeEach(() => {
    req = {
      params: { ligaId: '684cb1c8af923da7c7df51de' },
      session: { participante: { _id: 'participante123' } }
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    controller = new FluxoFinanceiroController();
  });
  
  describe('getSaldo', () => {
    it('deve retornar saldo calculado corretamente', async () => {
      // Arrange
      const expectedSaldo = 105.40;
      jest.spyOn(controller.service, 'calcularSaldo').mockResolvedValue(expectedSaldo);
      
      // Act
      await controller.getSaldo(req, res);
      
      // Assert
      expect(res.json).toHaveBeenCalledWith({ saldo: expectedSaldo });
    });
    
    it('deve retornar erro 500 em falha', async () => {
      // Arrange
      jest.spyOn(controller.service, 'calcularSaldo').mockRejectedValue(new Error('DB error'));
      
      // Act
      await controller.getSaldo(req, res);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
  });
});

// Template para testes de Service
describe('FluxoFinanceiroService', () => {
  let service, mockDB;
  
  beforeEach(() => {
    mockDB = {
      Rodada: { find: jest.fn() },
      AcertoFinanceiro: { find: jest.fn() }
    };
    service = new FluxoFinanceiroService(mockDB);
  });
  
  describe('calcularSaldo', () => {
    it('deve somar rodadas e acertos corretamente', async () => {
      // Arrange
      mockDB.Rodada.find.mockResolvedValue([
        { ganho_rodada: 20.00 },
        { ganho_rodada: -10.00 }
      ]);
      mockDB.AcertoFinanceiro.find.mockResolvedValue([
        { tipo: 'pagamento', valor: 100.00 }
      ]);
      
      // Act
      const saldo = await service.calcularSaldo('participante123', 'liga123', '2026');
      
      // Assert
      expect(saldo).toBe(110.00); // 20 - 10 + 100
    });
  });
});
```

---

## 9. 🛠️ Comandos de Diagnóstico Avançado

### 9.1 Análise Completa (Master Script)

Crie `/scripts/audit_full.sh`:
```bash
#!/bin/bash
echo "╔══════════════════════════════════════════════╗"
echo "║   AUDITORIA COMPLETA - SUPER CARTOLA         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "📅 Data: $(date)"
echo "🔍 Escopo: $(pwd)"
echo ""

# ========== MÉTRICAS GERAIS ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 MÉTRICAS GERAIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total_js=$(find . -name '*.js' ! -path './node_modules/*' | wc -l)
total_lines=$(find . -name '*.js' ! -path './node_modules/*' -exec cat {} \; | wc -l)
echo "  📄 Arquivos JS: $total_js"
echo "  📝 Linhas totais: $total_lines"
echo "  📦 Dependencies: $(cat package.json | jq '.dependencies | length')"
echo "  🛠️  DevDependencies: $(cat package.json | jq '.devDependencies | length')"
echo ""

# ========== SEGURANÇA ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 SEGURANÇA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
rotas_desprotegidas=$(grep -rn "router\.\(post\|put\|delete\)" routes/ 2>/dev/null | grep -v "verificar" | wc -l)
console_logs=$(grep -rn "console\.log" controllers/ routes/ services/ 2>/dev/null | wc -l)
secrets=$(grep -rn "password\s*[:=]\s*['\"]" --include="*.js" 2>/dev/null | grep -v "process\.env\|\.example" | wc -l)

echo "  🔴 Rotas sem auth: $rotas_desprotegidas"
echo "  🟡 Console.logs: $console_logs"
echo "  🔴 Secrets hardcoded: $secrets"
echo "  🔒 Vulnerabilidades NPM:"
npm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities | to_entries[] | "    \(.key): \(.value)"'
echo ""

# ========== MULTI-TENANT ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏢 MULTI-TENANT ISOLATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
queries_sem_tenant=$(grep -rn "\.find({" controllers/ routes/ 2>/dev/null | grep -v "liga_id\|ligaId\|system_config\|users" | wc -l)
echo "  🔴 Queries sem liga_id: $queries_sem_tenant"
if [ $queries_sem_tenant -gt 0 ]; then
  echo "  📋 Exemplos:"
  grep -rn "\.find({" controllers/ routes/ 2>/dev/null | grep -v "liga_id\|ligaId\|system_config\|users" | head -5 | sed 's/^/    /'
fi
echo ""

# ========== PERFORMANCE ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ PERFORMANCE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
queries_sem_lean=$(grep -rn "\.find\|\.findOne" controllers/ 2>/dev/null | grep -v "\.lean()" | wc -l)
n_plus_one=$(grep -rn "for.*await.*find\|forEach.*await" controllers/ 2>/dev/null | wc -l)
echo "  🟡 Queries sem .lean(): $queries_sem_lean"
echo "  🔴 Possíveis N+1: $n_plus_one"
echo "  📦 Bundles grandes (>100KB):"
find public/js -name "*.js" -size +100k -exec ls -lh {} \; 2>/dev/null | awk '{print "    " $9 " - " $5}'
echo ""

# ========== QUALIDADE DE CÓDIGO ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 QUALIDADE DE CÓDIGO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
todos=$(grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.js" 2>/dev/null | wc -l)
arquivos_grandes=$(find . -name "*.js" ! -path "./node_modules/*" -exec wc -l {} \; | awk '$1 > 500 {print $0}' | wc -l)
echo "  📌 TODOs/FIXMEs: $todos"
echo "  📄 Arquivos >500 linhas: $arquivos_grandes"
if [ $arquivos_grandes -gt 0 ]; then
    echo "  📋 Arquivos grandes:"
    find . -name "*.js" ! -path "./node_modules/*" -exec wc -l {} \; | awk '$1 > 500 {print "    " $2 " - " $1 " linhas"}' | sort -t'-' -k2 -nr | head -5
fi
echo ""

# ========== TESTES ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 COBERTURA DE TESTES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total_tests=$(find tests/ -name "*.test.js" 2>/dev/null | wc -l)
total_controllers=$(find controllers/ -name "*.js" 2>/dev/null | wc -l)
echo "  📊 Arquivos de teste: $total_tests"
echo "  📊 Controllers: $total_controllers"
if [ $total_controllers -gt 0 ]; then
  coverage=$((total_tests * 100 / total_controllers))
  echo "  📈 Cobertura estimada: ${coverage}%"
fi
echo ""

# ========== SCORE FINAL ==========
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 SCORE SPARC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Cálculo de scores (1-5)
security_score=5
[ $rotas_desprotegidas -gt 5 ] && security_score=3
[ $secrets -gt 0 ] && security_score=2
[ $queries_sem_tenant -gt 10 ] && security_score=1

performance_score=5
[ $queries_sem_lean -gt 20 ] && performance_score=3
[ $n_plus_one -gt 5 ] && performance_score=2

architecture_score=5
[ $queries_sem_tenant -gt 5 ] && architecture_score=3
[ $arquivos_grandes -gt 10 ] && architecture_score=2

reliability_score=4 # Placeholder

quality_score=5
[ $console_logs -gt 50 ] && quality_score=3
[ $todos -gt 100 ] && quality_score=2

total_score=$((security_score + performance_score + architecture_score + reliability_score + quality_score))

echo "  🛡️  Security:     $security_score/5"
echo "  ⚡ Performance:  $performance_score/5"
echo "  🏗️  Architecture: $architecture_score/5"
echo "  🔄 Reliability:  $reliability_score/5"
echo "  🧹 Code Quality: $quality_score/5"
echo "  ═══════════════════════"
echo "  📊 TOTAL:        $total_score/25"
echo ""

# Status final
if [ $total_score -ge 20 ]; then
  echo "✅ STATUS: EXCELENTE"
elif [ $total_score -ge 15 ]; then
  echo "🟡 STATUS: BOM (melhorias recomendadas)"
elif [ $total_score -ge 10 ]; then
  echo "🟠 STATUS: REGULAR (ação necessária)"
else
  echo "🔴 STATUS: CRÍTICO (refatoração urgente)"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "📝 Relatório completo salvo em: audit_$(date +%Y%m%d).log"
```

Executar: `bash scripts/audit_full.sh | tee audit_$(date +%Y%m%d).log`

### 9.2 Busca por Padrões Específicos (Super Cartola)

```bash
#!/bin/bash
# /scripts/audit_super_cartola_patterns.sh

echo "🔍 PADRÕES ESPECÍFICOS - SUPER CARTOLA"
echo "======================================"
echo ""

# Inconsistência de tipos (liga_id String vs ObjectId)
echo "🔴 INCONSISTÊNCIA DE TIPOS:"
grep -rn "liga_id.*String\|String.*liga_id" controllers/ routes/ models/
echo ""

# Queries multi-tenant sem filtro
echo "🔴 QUERIES SEM MULTI-TENANT:"
grep -rn "\.find({" controllers/ | grep -v "liga_id\|ligaId" | grep -v "system_config\|users" | head -10
echo ""

# Cache sem invalidação
echo "🟡 CACHE SEM INVALIDAÇÃO:"
grep -rn "\.findOneAndUpdate\|\.updateMany" controllers/ | grep -v "invalidar\|limpar.*cache\|clearCache"
echo ""

# Temporada hardcoded
echo "🟡 TEMPORADA HARDCODED:"
grep -rn "temporada.*2025\|temporada.*2026\|'2025'\|'2026'" controllers/ routes/ | grep -v "CURRENT_SEASON\|seasons\.js"
echo ""

# Acertos financeiros sem idempotência
echo "🔴 OPERAÇÕES FINANCEIRAS SEM IDEMPOTÊNCIA:"
grep -rn "AcertoFinanceiro\.create" controllers/ services/ | grep -v "idempotency"
echo ""

# Exports sem padrão Mobile Dark HD
echo "🟡 EXPORTS SEM PADRÃO:"
grep -rn "html2canvas\|exportar" public/js/ controllers/ | grep -v "mobileDarkHD\|exportConfig"
echo ""

# IndexedDB sem TTL
echo "🟡 INDEXEDDB SEM TTL:"
grep -rn "db\..*\.put\|db\..*\.add" public/js/ | grep -v "timestamp\|ttl\|expiresAt"
```

---

## 10. 📋 Templates de Relatório

### 10.1 Relatório Executivo (SPARC)

```markdown
# 📊 Auditoria de Código - Super Cartola Manager

**Data:** 2026-01-16
**Auditor:** Code Inspector (Senior)
**Escopo:** Sistema completo (Backend + Frontend)
**Versão:** 2026.1

---

## Scores SPARC

| Dimensão | Score | Status | Prioridade |
|----------|-------|--------|------------|
| 🛡️ Security | 3/5 | 🟡 ATENÇÃO | P1 |
| ⚡ Performance | 4/5 | 🟢 BOM | P2 |
| 🏗️ Architecture | 3/5 | 🟡 ATENÇÃO | P1 |
| 🔄 Reliability | 4/5 | 🟢 BOM | P3 |
| 🧹 Code Quality | 3/5 | 🟡 ATENÇÃO | P2 |
| **TOTAL** | **17/25** | 🟡 **BOM** | - |

**Tendência:** ⬆️ Melhorando (vs mês anterior: 15/25)

---

## 🔴 Achados Críticos (Bloqueia Deploy)

### CRIT-001: Queries sem Multi-Tenant Isolation
- **Severidade:** 🔴 CRÍTICO
- **Impacto:** Data leakage entre ligas
- **Localização:** 
  - `controllers/rankingController.js:42`
  - `routes/participante-routes.js:78`
- **Ação:** Adicionar filtro `liga_id` em TODAS as queries
- **Prazo:** Imediato

### CRIT-002: Operações Financeiras sem Idempotência
- **Severidade:** 🔴 CRÍTICO
- **Impacto:** Duplicação de pagamentos
- **Localização:** `controllers/acertoFinanceiroController.js`
- **Ação:** Implementar `idempotency_key` pattern
- **Prazo:** 24h

---

## 🟡 Achados Importantes (Resolver em 48h)

### IMPT-001: Queries sem .lean() (Performance)
- **Severidade:** 🟡 ALTO
- **Impacto:** 5x mais memória em reads
- **Quantidade:** 47 ocorrências
- **Ação:** Adicionar `.lean()` em queries read-only
- **Esforço:** Médio (2h)

### IMPT-002: Console.logs em Produção
- **Severidade:** 🟡 MÉDIO
- **Impacto:** Poluição de logs, possível leak de dados
- **Quantidade:** 84 ocorrências
- **Ação:** Remover ou substituir por logger estruturado
- **Esforço:** Baixo (1h)

---

## 📊 Débito Técnico Identificado

| ID | Item | Esforço | Impacto | Prioridade | Módulo |
|----|------|---------|---------|------------|--------|
| TD-001 | Unificar cache strategy | L (3 dias) | Alto | P1 | Cache |
| TD-002 | Implementar retry em Cartola API | M (1 dia) | Médio | P2 | Services |
| TD-003 | Padronizar exports Mobile HD | M (1 dia) | Baixo | P3 | Frontend |
| TD-004 | Adicionar testes unitários | L (1 semana) | Alto | P2 | Global |
| TD-005 | Refatorar fluxo-financeiro.js (800 LOC) | L (2 dias) | Médio | P2 | Frontend |

**Legenda:** S (Small: <1 dia) | M (Medium: 1-3 dias) | L (Large: >3 dias)

---

## ✅ Recomendações Prioritárias

### 1. Segurança (Imediato)
```bash
# Executar auditoria multi-tenant
bash scripts/audit_multitenant.sh

# Adicionar middleware global de tenant
# Implementar em: middleware/tenant-enforcer.js
```

### 2. Performance (Curto prazo)
- Adicionar `.lean()` em queries read-only
- Implementar índices compostos em MongoDB
- Otimizar bundles frontend (code splitting)

### 3. Arquitetura (Médio prazo)
- Criar camada de Service para lógica de negócio
- Refatorar controllers grandes (>500 LOC)
- Implementar padrão Repository para acesso a dados

### 4. Observabilidade (Curto prazo)
- Implementar logger estruturado (Winston/Pino)
- Criar dashboard de métricas (/admin/metrics)
- Adicionar health checks (/health, /ready)

---

## 📈 Progresso vs Roadmap 2026

| Feature | Status | Prioridade | Débito Técnico |
|---------|--------|------------|----------------|
| Multi-tenant isolation | 🟡 70% | P1 | TD-001 |
| Cache unificado | 🔴 30% | P1 | TD-001 |
| API resilience | 🔴 20% | P2 | TD-002 |
| Testes automatizados | 🔴 15% | P2 | TD-004 |

---

## 🎯 Próximos Passos

1. **Semana 1:** Resolver CRIT-001 e CRIT-002
2. **Semana 2:** Implementar TD-001 (cache strategy)
3. **Semana 3:** Adicionar testes para módulos críticos
4. **Semana 4:** Refatoração de controllers grandes

---

**Assinatura:** Code Inspector v2.0
**Próxima auditoria:** 2026-02-16
```

### 10.2 Pull Request Review Template

```markdown
## Code Review: PR #123 - Implementar Retry em Cartola API

### Decisão: ✅ Aprovado com Mudanças | 🔄 Mudanças Necessárias | ❌ Rejeitado

### Score Geral: 7/10

---

### Checklist SPARC

- [x] 🛡️ Sem vulnerabilidades de segurança
- [x] ⚡ Performance adequada
- [ ] 🏗️ Arquitetura mantida (violação em services/cartolaService.js)
- [x] 🔄 Error handling completo
- [ ] 🧹 Code quality (console.log não removido)
- [ ] 🧪 Testes incluídos

---

### 🟢 Pontos Positivos

1. ✅ Implementação correta de exponential backoff
2. ✅ Timeout configurável por request
3. ✅ Logging estruturado de retries

---

### 🔴 Mudanças Obrigatórias

#### 1. services/cartolaService.js:42
```javascript
// ❌ ANTES
console.log('Retry attempt:', attempt);

// ✅ DEPOIS
logger.warn('[CARTOLA-API] Retry attempt', { 
  attempt, 
  maxRetries, 
  url, 
  error: error.message 
});
```

#### 2. services/cartolaService.js:78
```javascript
// ❌ ANTES - Lógica de retry no controller
async function getRanking() {
  const result = await this.fetchWithRetry('/api/ranking');
  return result.data;
}

// ✅ DEPOIS - Extrair para service layer
class CartolaService {
  async getRanking(ligaId) {
    const result = await this.fetchWithRetry('/api/ranking', {
      params: { liga_id: ligaId }
    });
    return result.data;
  }
}
```

---

### 🟡 Sugestões (Não-bloqueantes)

1. Adicionar circuit breaker pattern para falhas persistentes
2. Implementar cache de fallback para quando API estiver down
3. Adicionar métrica de taxa de retry (/metrics)

---

### 📝 Comentários por Arquivo

**services/cartolaService.js**
- L42: Remover console.log
- L78: Adicionar validação de ligaId
- L105: Considerar usar AbortController para timeout

**tests/cartolaService.test.js**
- ⚠️ Arquivo não incluído - Adicionar testes unitários

---

### 🎯 Próximos Passos

1. Fazer as mudanças obrigatórias
2. Adicionar testes unitários
3. Re-submeter para review
4. Após merge: Monitorar logs de retry em produção

---

**Reviewer:** Code Inspector  
**Data:** 2026-01-16  
**Próximo review:** Após mudanças
```

---

## 11. 🔧 Workflow de Correção (Senior)

### Antes de Corrigir
1. **Entender impacto** - Quem consome esse código?
2. **Verificar testes** - Existem? Vão quebrar?
3. **Avaliar rollback** - Como reverter se der errado?
4. **Criar branch** - `git checkout -b fix/issue-description`

### Durante a Correção
1. **Branch específica** - `fix/security-auth-middleware`
2. **Commits atômicos** - Um commit por mudança lógica
3. **Manter backward compat** - Não quebrar contratos
4. **Seguir S.D.A.** - Mapear dependências antes de modificar

### Após Corrigir
1. **Testar localmente** - `npm test && npm run dev`
2. **Validar em staging** - Se disponível
3. **Monitorar após deploy** - Logs, métricas, errors
4. **Documentar** - Atualizar CHANGELOG.md

### Commit Message Convention
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Tipos:**
- `fix`: Correção de bug
- `feat`: Nova funcionalidade
- `refactor`: Refatoração sem mudar comportamento
- `perf`: Melhoria de performance
- `security`: Correção de segurança
- `docs`: Documentação
- `test`: Adicionar/corrigir testes
- `chore`: Manutenção (deps, build, etc)

**Escopos:** auth, financeiro, participante, liga, cache, api, frontend, etc.

**Exemplo:**
```
fix(security): adicionar verificarAdmin em rotas de escrita

- Adiciona middleware verificarAdmin em POST/PUT/DELETE
- Previne acesso não autorizado a operações sensíveis
- Ref: CRIT-001 da auditoria 2026-01-16

Closes #123
```

---

## 12. 🚨 Incident Response

### Quando Encontrar Vulnerabilidade Crítica

#### Classificação de Severidade

| Nível | Critério | Tempo de Resposta | Ação |
|-------|----------|-------------------|------|
| 🔴 P0 - CRÍTICO | Exposição de dados, RCE, SQL Injection | Imediato (0-2h) | Deploy emergencial |
| 🟡 P1 - ALTO | Bypass de auth, XSS, CSRF | 4-8h | Hotfix prioritário |
| 🟢 P2 - MÉDIO | Info disclosure, DoS | 24-48h | Fix no próximo sprint |
| ⚪ P3 - BAIXO | Configuração sub-ótima | 1 semana | Backlog normal |

#### Protocolo de Resposta

**1. Conter (Imediato)**
```bash
# Exemplo: Se encontrou SQL injection em /api/search
# Opção A: Desabilitar feature temporariamente
# - Comentar rota no código
# - Deploy imediato

# Opção B: Rate limit agressivo
# - Adicionar rate-limit específico
# - Monitorar tentativas
```

**2. Avaliar (0-30min)**
- ✅ A vulnerabilidade já foi explorada? (checar logs)
- ✅ Quantos usuários/dados estão expostos?
- ✅ Existe POC público?

**3. Fix (Depende do P-level)**
```javascript
// Exemplo: Fix de SQL Injection
// ❌ ANTES (vulnerável)
const query = `SELECT * FROM users WHERE email = '${req.body.email}'`;

// ✅ DEPOIS (seguro)
const query = 'SELECT * FROM users WHERE email = ?';
db.execute(query, [req.body.email]);
```

**4. Comunicar**
- **Interno:** Notificar equipe técnica imediatamente
- **Externo:** Se houve exposição, notificar usuários afetados
- **Log:** Documentar incidente no `docs/incidents/YYYY-MM-DD-description.md`

**5. Post-Mortem**
```markdown
# Incident: SQL Injection em /api/search

**Data:** 2026-01-16
**Severidade:** P0 - CRÍTICO
**Tempo de resolução:** 2h 15min

## Timeline
- 14:00 - Vulnerabilidade descoberta por auditoria
- 14:10 - Rota desabilitada (contenção)
- 15:30 - Fix desenvolvido e testado
- 16:15 - Deploy em produção
- 16:20 - Validação e rollback plan

## Root Cause
Falta de sanitização de input em query dinâmica.

## Impact
- Nenhum exploit confirmado
- 0 usuários afetados

## Fix
- Implementado prepared statements
- Adicionado input validation com Joi
- Adicionado teste específico

## Prevention
- [ ] Adicionar SAST no CI/CD
- [ ] Code review obrigatório para queries SQL
- [ ] Treinamento da equipe em secure coding
```

**6. Prevenir Recorrência**
- ✅ Adicionar teste específico
- ✅ Atualizar checklist de code review
- ✅ Documentar pattern correto
- ✅ Executar auditoria similar em código relacionado

### Escalation Matrix

| Situação | Ação | Responsável |
|----------|------|-------------|
| P0 descoberto | Deploy emergencial dentro de 2h | Tech Lead |
| Exploit ativo | Notificar usuários + autoridades | CEO/CTO |
| Data breach | Seguir LGPD/GDPR compliance | Legal + Tech |
| DDoS | Ativar CloudFlare/WAF | DevOps |

---

## 13. 📚 Recursos e Ferramentas

### Ferramentas Recomendadas

| Categoria | Ferramenta | Uso |
|-----------|------------|-----|
| SAST | SonarQube, ESLint Security | Análise estática |
| DAST | OWASP ZAP, Burp Suite | Testes dinâmicos |
| Dependency Scan | npm audit, Snyk | Vulnerabilidades em deps |
| Performance | Lighthouse, k6 | Benchmarks |
| Monitoring | New Relic, Datadog | APM |
| Logging | Winston, Pino | Logs estruturados |

### Scripts Úteis (Resumo)

```bash
# Auditoria completa
bash scripts/audit_full.sh

# Segurança
bash scripts/audit_security.sh

# Multi-tenant
bash scripts/audit_multitenant.sh

# Performance
bash scripts/audit_performance.sh

# Qualidade
bash scripts/detect_dead_code.sh

# Dependencies
bash scripts/check_dependencies.sh

# Complexidade
node scripts/complexity_report.js

# Análise de dependências
node scripts/analyze_dependencies.js
```

---

## 14. 🎓 Knowledge Base

### Padrões Comuns - Super Cartola

#### 1. Multi-Tenant Query Pattern
```javascript
// ✅ SEMPRE incluir liga_id
async function getParticipantes(ligaId) {
  return await Participante.find({ liga_id: ligaId }).lean();
}

// ❌ NUNCA fazer queries globais
async function getAllParticipantes() {
  return await Participante.find({}); // ERRADO!
}
```

#### 2. Financial Calculation Pattern
```javascript
// ✅ SEMPRE calcular, NUNCA persistir saldo
async function getSaldo(participanteId, ligaId, temporada) {
  const rodadas = await Rodada.find({ participante_id, liga_id, temporada });
  const acertos = await AcertoFinanceiro.find({ participante_id, liga_id, temporada });
  
  return calcularSaldoFromRaw(rodadas, acertos); // Cálculo fresh
}

// ❌ NUNCA salvar saldo calculado
async function saveSaldo(participanteId, saldo) {
  // ERRADO - Vai ficar desatualizado
  await Participante.updateOne({ _id: participanteId }, { saldo });
}
```

#### 3. Cache Pattern (IndexedDB Frontend)
```javascript
// ✅ Cache-First com Background Refresh
async function loadData() {
  // 1. Render cache imediatamente
  const cached = await db.table.get(key);
  if (cached && !isStale(cached, TTL)) {
    renderUI(cached);
  }
  
  // 2. Fetch fresh em background
  const fresh = await fetch('/api/data').then(r => r.json());
  await db.table.put({ ...fresh, timestamp: Date.now() });
  
  // 3. Re-render se mudou
  if (JSON.stringify(cached) !== JSON.stringify(fresh)) {
    renderUI(fresh);
  }
}
```

#### 4. Export Pattern (Mobile Dark HD)
```javascript
// ✅ Padrão unificado de export
const exportConfig = {
  backgroundColor: '#000',
  scale: 2,
  useCORS: true,
  logging: false,
  width: 1080,
  height: 1920
};

async function exportarModulo(elementId) {
  const element = document.getElementById(elementId);
  const canvas = await html2canvas(element, exportConfig);
  
  // Download
  const link = document.createElement('a');
  link.download = `${elementId}-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

---

## 15. 🔄 Continuous Improvement

### Monthly Audit Checklist

```markdown
## Auditoria Mensal - Super Cartola

**Mês:** Janeiro/2026
**Auditor:** [Nome]

### SPARC Scores
- [ ] Security: __/5
- [ ] Performance: __/5
- [ ] Architecture: __/5
- [ ] Reliability: __/5
- [ ] Code Quality: __/5

### Tarefas
- [ ] Executar `bash scripts/audit_full.sh`
- [ ] Verificar npm audit (vulnerabilidades)
- [ ] Revisar TODO/FIXME antigos (>30 dias)
- [ ] Analisar logs de erro (ultimas 4 semanas)
- [ ] Revisar métricas de performance
- [ ] Atualizar documentação técnica
- [ ] Code review de PRs pendentes

### Findings
| ID | Descrição | Severidade | Status |
|----|-----------|------------|--------|
| | | | |

### Action Items
1. [ ] ...
2. [ ] ...

**Próxima auditoria:** [Data]
```

---

## OWASP Deep Dive — Mitigacoes Detalhadas (Novo - agnostic-core)

Complemento a tabela OWASP 2.1 com acoes especificas para o projeto.

### A01 — Broken Access Control (Detalhado)

```markdown
□ Todo endpoint POST/PUT/DELETE tem middleware de auth (verificarAdmin ou verificarParticipante)
□ Participante so acessa dados da propria liga (liga_id no filtro)
□ Admin so acessa ligas que administra (admin_id check)
□ Sem IDOR: participante nao altera dados de outro (time_id validado contra sessao)
□ Rotas admin nao acessiveis por participante
□ API de debug/diagnostico protegida em producao
```

```bash
# Auditoria automatica
grep -rn "router\.\(post\|put\|delete\|patch\)" routes/ | grep -v "verificar\|isAdmin\|isAuth" | head -20
```

### A03 — Injection (Detalhado para MongoDB)

```markdown
□ Sem $where em queries (executa JS no servidor)
□ Sem eval() ou new Function() com input de usuario
□ RegExp criado a partir de input tem caracteres escapados
□ req.body nao usado diretamente como filtro de query (sanitizar campos)
□ Operadores MongoDB ($gt, $ne, $exists) bloqueados em input de usuario
```

```javascript
// RISCO: req.body usado direto como query
const user = await User.findOne(req.body); // Se body = {"$gt": ""} → retorna qualquer user

// SEGURO: Extrair campos esperados
const { email } = req.body;
const user = await User.findOne({ email: String(email), liga_id: ligaId });
```

### A05 — Security Misconfiguration (Detalhado para Express)

```markdown
□ CORS nao usa origin: '*' em producao (middleware/security.js)
□ Headers de seguranca ativos (X-Content-Type-Options, X-Frame-Options, HSTS)
□ X-Powered-By removido (nao expor Express)
□ Debug/stack traces desabilitados em producao
□ Rate limiting ativo (500 req/min conforme middleware/security.js)
□ Session cookie com httpOnly, secure, sameSite
```

### A09 — Logging Failures (Detalhado)

```markdown
□ Falhas de autenticacao logadas (quem tentou, quando)
□ Operacoes financeiras logadas (follow the money)
□ Sem dados sensiveis em logs (emails de admin OK, senhas/tokens NUNCA)
□ Logs incluem contexto suficiente para debug (liga_id, time_id, rodada)
□ Logs estruturados (utils/logger.js) em vez de console.log solto
```

---

**STATUS:** Code Inspector - ARMED & READY

**Versao:** 3.0 (Enriquecido com OWASP Deep Dive do agnostic-core)

**Ultima atualizacao:** 2026-03-12
