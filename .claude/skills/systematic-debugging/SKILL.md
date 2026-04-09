---
name: systematic-debugging
description: Metodologia de debugging sistematico em 4 fases para o Super Cartola Manager. Reproduzir, Isolar, Entender (5 Porques), Corrigir. Especializado em bugs multi-tenant, SPA, cache, pontuacao e modulos. Keywords: bug, debug, erro, problema, nao funciona, quebrou, crash, undefined, NaN, tela branca, dados errados, nao carrega, lento, travou, 500, 404, console error
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# Systematic Debugging - Metodologia de 4 Fases

## Missao

Resolver bugs de forma sistematica, rastreando a causa raiz ao inves de aplicar paliativos. Cada fase DEVE ser completada antes de avancar para a proxima. Nunca pular para a correcao sem entender o problema.

---

## Regra de Ouro

```
╔═══════════════════════════════════════════════════════════════════╗
║  NUNCA corrija um bug que voce nao entende.                      ║
║                                                                  ║
║  Fase 1: REPRODUZIR    → Consigo ver o bug acontecendo?          ║
║  Fase 2: ISOLAR        → Onde exatamente ele mora?               ║
║  Fase 3: ENTENDER      → POR QUE ele acontece? (5 Porques)      ║
║  Fase 4: CORRIGIR      → Fix cirurgico + verificacao            ║
║                                                                  ║
║  Se sair dos trilhos → PARE e re-planeje. Nunca force.           ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Fase 1 — Reproduzir

### Objetivo
Antes de tocar em qualquer codigo, entender EXATAMENTE o que esta acontecendo.

### Coleta de Informacoes

```markdown
## Bug Report Estruturado

### Comportamento Esperado
[O que deveria acontecer]

### Comportamento Observado
[O que realmente acontece]

### Passos para Reproduzir
1. [Passo 1]
2. [Passo 2]
3. [Resultado]

### Ambiente
- [ ] Browser: Chrome / Safari / Firefox
- [ ] Plataforma: Mobile / Desktop
- [ ] Ambiente: Replit (dev) / supercartolamanager.com.br (prod)
- [ ] Versao: [verificar /api/app/check-version]

### Contexto do Cartola
- [ ] Temporada: [ano]
- [ ] Rodada: [numero] — ao vivo / consolidada / pre-temporada
- [ ] Mercado: aberto / fechado
- [ ] Liga: [nome/id]
- [ ] Modulo afetado: [nome]
```

### Distinções Criticas do Projeto

| Contexto | Comportamento Diferente |
|----------|----------------------|
| **Rodada ao vivo** | Dados parciais, pontos mudam, cache curto (parciais) |
| **Rodada consolidada** | Dados finais, pontos fixos, cache longo |
| **Mercado aberto** | Times podem ser alterados, escalacoes em andamento |
| **Mercado fechado** | Times travados, rodada iniciando/em andamento |
| **Pre-temporada** | API Cartola retorna ano anterior, sem rodadas, dados limitados |
| **Multi-tenant** | Bug pode ser especifico de uma liga (config/modulos diferentes) |

### Comandos de Investigacao Inicial

```bash
# Verificar logs recentes do servidor
grep -rn "ERROR\|WARN\|error\|warn" --include="*.log" logs/ 2>/dev/null | tail -30

# Verificar status do servidor
curl -s http://localhost:3000/api/app/check-version 2>/dev/null | head -5

# Verificar se o endpoint responde
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/[endpoint]

# Verificar estado do MongoDB
node -e "
const { MongoClient } = require('mongodb');
const uri = process.env.MONGO_URI;
MongoClient.connect(uri).then(c => {
    console.log('MongoDB OK');
    c.close();
}).catch(e => console.error('MongoDB FALHOU:', e.message));
"
```

---

## Fase 2 — Isolar

### Objetivo
Reduzir o espaco de busca ate encontrar o EXATO ponto onde o bug se manifesta.

### Estrategia de Isolamento

#### 2.1 — Rastrear o Fluxo de Dados

```markdown
## Mapa do Fluxo

Frontend (JS)
  → fetch('/api/endpoint')
    → routes/arquivo.js
      → middleware (auth, validacao)
        → controllers/arquivo.js
          → services/arquivo.js
            → MongoDB query
              → Resposta
            ← Transformacao
          ← Controller
        ← Middleware
      ← Route
    ← Response JSON
  ← Renderizacao no DOM
```

Para cada ponto do fluxo, verificar: **os dados estao corretos aqui?**

#### 2.2 — Git Bisect (quando o bug e regressao)

```bash
# Encontrar o commit que introduziu o bug
git bisect start
git bisect bad                    # commit atual tem o bug
git bisect good [commit-antigo]   # commit onde funcionava

# Para cada commit, testar e marcar
git bisect good  # ou
git bisect bad

# Ao encontrar o commit causador
git bisect reset
git show [commit-causador]
```

#### 2.3 — Testar com Dados Minimos

```bash
# Buscar dados da liga especifica com problema
node -e "
const { MongoClient } = require('mongodb');
MongoClient.connect(process.env.MONGO_URI).then(async c => {
    const db = c.db();
    const liga = await db.collection('ligas').findOne({ _id: 'LIGA_ID' });
    console.log(JSON.stringify(liga, null, 2));
    c.close();
});
"
```

#### 2.4 — Verificar Logs do Servidor

```bash
# Buscar erros no logger do projeto
grep -rn "logger\.\(error\|warn\)" --include="*.js" controllers/ services/ | head -20

# Verificar se ha tratamento de erro no ponto suspeito
grep -rn "catch\|\.catch" --include="*.js" [arquivo-suspeito]
```

#### 2.5 — Verificar Console do Browser (Frontend)

Problemas comuns no frontend:

| Erro no Console | Causa Provavel | Verificar |
|----------------|---------------|-----------|
| `Cannot read property of undefined` | Objeto nao carregado / resposta vazia | Response da API |
| `SyntaxError: Unexpected token` | JSON invalido ou HTML retornado | Content-Type da resposta |
| `Failed to fetch` | CORS, servidor down, URL errada | Network tab, status do servidor |
| `Module not found` | Import path errado, SPA navigation | Caminho do import, participante-navigation.js |
| `init is not a function` | DOMContentLoaded ja disparou | Pattern readyState |

#### 2.6 — Verificar Cache

```bash
# Backend: NodeCache
grep -rn "cache\.\(get\|set\|del\)" --include="*.js" [arquivo-suspeito]

# Frontend: Service Worker
grep -rn "caches\.\|cache\.\|indexedDB" --include="*.js" public/sw.js public/js/

# MongoDB: Collections de cache
node -e "
const { MongoClient } = require('mongodb');
MongoClient.connect(process.env.MONGO_URI).then(async c => {
    const db = c.db();
    const collections = await db.listCollections().toArray();
    const cacheCollections = collections.filter(c => c.name.includes('cache'));
    console.log('Collections de cache:', cacheCollections.map(c => c.name));
    c.close();
});
"
```

---

## Fase 3 — Entender (5 Porques)

### Objetivo
Chegar na CAUSA RAIZ. Nao parar no sintoma. Perguntar "por que?" ate nao poder mais.

### Metodologia dos 5 Porques

Exemplo 1 — Ranking mostra dados de outra liga:
```
Por que o ranking mostra dados errados?
  → Porque a query retorna participantes de todas as ligas.
Por que retorna de todas as ligas?
  → Porque o filtro liga_id nao esta na query.
Por que o liga_id nao esta na query?
  → Porque o controller nao extrai o ligaId dos params.
Por que nao extrai?
  → Porque a rota foi copiada de outro endpoint que nao usava liga.
CAUSA RAIZ: Query MongoDB sem filtro multi-tenant.
```

Exemplo 2 — Pontos aparecem arredondados:
```
Por que os pontos mostram 93.79 ao inves de 93.78?
  → Porque esta usando toFixed(2).
Por que usa toFixed(2)?
  → Porque o desenvolvedor nao conhecia truncarPontosNum.
Por que nao conhecia?
  → Porque nao consultou CLAUDE.md antes de implementar.
CAUSA RAIZ: Uso de toFixed(2) ao inves de truncarPontosNum.
FIX: Substituir toFixed(2) por truncarPontosNum() no backend
     ou truncarPontos() no frontend.
```

Exemplo 3 — Modulo nao carrega no SPA:
```
Por que o modulo nao inicializa?
  → Porque a funcao init() nunca e chamada.
Por que init() nao e chamada?
  → Porque DOMContentLoaded nao dispara.
Por que DOMContentLoaded nao dispara?
  → Porque na navegacao SPA o DOM ja esta pronto.
Por que o DOM ja esta pronto?
  → Porque participante-navigation.js carrega modulos dinamicamente.
CAUSA RAIZ: Falta do pattern readyState antes de DOMContentLoaded.
FIX: Adicionar check de readyState conforme CLAUDE.md.
```

Exemplo 4 — Dados desatualizados apos acao:
```
Por que os dados nao atualizam apos salvar?
  → Porque o frontend mostra dados do cache.
Por que o cache nao foi invalidado?
  → Porque a operacao de escrita nao chama cache.del().
Por que nao chama cache.del()?
  → Porque ninguem adicionou invalidacao ao novo endpoint.
CAUSA RAIZ: Escrita sem invalidacao de cache.
FIX: Adicionar cache.del(key) apos operacao de escrita.
```

Exemplo 5 — Erro 500 intermitente:
```
Por que o endpoint retorna 500?
  → Porque da timeout na query MongoDB.
Por que da timeout?
  → Porque a query faz full collection scan.
Por que faz full scan?
  → Porque nao tem indice no campo filtrado.
Por que nao tem indice?
  → Porque a collection cresceu e ninguem criou indice.
CAUSA RAIZ: Indice faltando no MongoDB.
FIX: db.collection.createIndex({ campo: 1, liga_id: 1 })
```

### Template de Analise

```markdown
## Analise de Causa Raiz

### Sintoma
[O que o usuario ve]

### 5 Porques
1. Por que [sintoma]? → [resposta 1]
2. Por que [resposta 1]? → [resposta 2]
3. Por que [resposta 2]? → [resposta 3]
4. Por que [resposta 3]? → [resposta 4]
5. Por que [resposta 4]? → [CAUSA RAIZ]

### Causa Raiz
[Descricao precisa do problema fundamental]

### Arquivo(s) Afetado(s)
- [caminho/arquivo.js:linha]

### Fix Proposto
[Descricao da correcao minima necessaria]
```

---

## Fase 4 — Corrigir

### Objetivo
Aplicar fix cirurgico seguindo o protocolo S.A.I.S do CLAUDE.md. Minimo impacto, maximo efeito.

### Protocolo S.A.I.S

```markdown
1. Solicitar  → Ler o arquivo original completo
2. Analisar   → Entender linha por linha o que faz
3. Identificar → Mapear dependencias (grep imports, IDs CSS, rotas)
4. Alterar    → Mudanca minima e focada no objetivo
```

### Antes de Aplicar o Fix

```bash
# Verificar quem mais usa o codigo que vai mudar
grep -rn "[funcao_ou_variavel]" --include="*.js" . | grep -v node_modules

# Verificar se ha testes
grep -rn "[funcao_ou_variavel]" --include="*.test.js" --include="*.spec.js" .

# Verificar o estado atual do git
git status
git diff
```

### Apos Aplicar o Fix

```markdown
## Checklist de Verificacao (FASE 3.5 do CLAUDE.md)

- [ ] **Funciona?** Testei/demonstrei que o bug foi corrigido
- [ ] **Diff correto?** Reli git diff — so contem a mudanca necessaria
- [ ] **Sem regressao?** Nada existente quebrou com a mudanca
- [ ] **Staff engineer aprovaria este PR?** Fix e limpo e profissional
```

### Verificacao por Tipo de Mudanca

| Tipo | Como Verificar |
|------|---------------|
| **Backend** (controller/route/model) | `curl` no endpoint, verificar logs do servidor |
| **Frontend** (JS/HTML) | Verificar console do browser, testar interacao |
| **Script** (migration/cron) | Rodar com `--dry-run` primeiro |
| **CSS/Visual** | Confirmar render visual, checar responsivo |
| **Config/DB** | Validar schema, testar query direto no MongoDB |

### Se o Frontend usa vImport (admin)

Se o arquivo alterado e carregado via `vImport()` no orquestrador admin:

```bash
# Incrementar versao para invalidar cache
grep -rn "ADMIN_JS_VERSION" --include="*.js" public/ | head -5
# Editar o arquivo e incrementar o numero
```

---

## Anti-Padroes de Debugging

### O que NUNCA fazer

| Anti-Padrao | Por que e ruim | O que fazer |
|------------|---------------|-------------|
| **Mudancas aleatorias** ("vou tentar mudar isso...") | Introduz novos bugs sem resolver o original | Seguir as 4 fases metodicamente |
| **Forcar solucao que nao funciona** | Viola CLAUDE.md: "se sair dos trilhos, PARE" | Parar, comunicar, re-planejar |
| **Debugar ao vivo em producao** | Usuarios reais veem estados quebrados | Reproduzir em dev (Replit) primeiro |
| **Ignorar multi-tenant** | Testar com uma liga, quebrar outra | Sempre testar com liga_id especifico |
| **Comentar codigo ao inves de corrigir** | Esconde o problema, gera debito tecnico | Entender e corrigir a causa raiz |
| **Adicionar try/catch vazio** | Engole o erro, impossibilita diagnostico | Tratar o erro ou deixar propagar com log |
| **Corrigir sintoma ao inves de causa** | Bug volta de outra forma | Aplicar 5 Porques ate a raiz |
| **Mudar multiplas coisas de uma vez** | Impossivel saber o que resolveu | Uma mudanca por vez, testar entre cada |

### Sinais de que voce esta no caminho errado

```markdown
PARE E RE-PLANEJE se:
- Ja fez 3+ tentativas de fix sem sucesso
- O fix funciona mas voce nao sabe POR QUE
- A mudanca e maior que 20 linhas para um bug simples
- Precisa mexer em mais de 3 arquivos para um fix pontual
- O diff tem mudancas nao relacionadas ao bug
- Voce esta "testando coisas" ao inves de "seguindo evidencias"
```

---

## Bugs Comuns do Projeto (Catalogo)

### Backend

| Sintoma | Causa Comum | Arquivo(s) | Fix |
|---------|------------|-----------|-----|
| Dados de outra liga aparecem | Query sem `liga_id` | controllers/, services/ | Adicionar filtro `liga_id` |
| Pontos arredondados | `toFixed(2)` ou `Math.round` | controllers/, services/ | Usar `truncarPontosNum()` |
| Erro 500 generico | try/catch ausente | controllers/ | Adicionar try/catch com log |
| Dados desatualizados | Cache nao invalidado | services/, utils/cache* | Invalidar cache apos escrita |
| Operacao financeira duplica | Falta idempotencia | controllers/ | Check de existencia antes de inserir |

### Frontend

| Sintoma | Causa Comum | Arquivo(s) | Fix |
|---------|------------|-----------|-----|
| Modulo nao carrega | DOMContentLoaded sem readyState | public/js/ | Pattern readyState |
| Tela em branco | Erro JS nao tratado | public/js/ | try/catch + empty state |
| Dados stale | Service Worker cache | public/sw.js | Verificar estrategia de cache |
| Escudo nao aparece | Caminho errado / sem fallback | public/js/, views/ | `/escudos/{id}.png` + onerror |
| CSS quebrado | Variavel CSS nao definida | css/, public/ | Verificar _admin-tokens.css |
| Pontos com . ao inves de , | Falta truncarPontos() | public/js/ | Usar truncarPontos() (retorna pt-BR) |

### Infraestrutura

| Sintoma | Causa Comum | Arquivo(s) | Fix |
|---------|------------|-----------|-----|
| MongoDB timeout | Indice faltando | MongoDB Atlas | Criar indice adequado |
| Servidor reinicia | Memory leak ou crash | server.js, services/ | Verificar logs, heap dumps |
| API Cartola falha | Rate limit ou manutencao | services/cartolaApi* | Verificar fallback/retry |

---

## Fluxo Completo

```
┌───────────────────────────────┐
│  BUG REPORTADO                │
└──────────┬────────────────────┘
           │
           ▼
┌───────────────────────────────┐
│  FASE 1: REPRODUZIR           │
│  • Coletar informacoes        │
│  • Identificar contexto       │
│  • Confirmar que o bug existe │
│  → NAO REPRODUZ? Pedir mais  │
│    contexto ao usuario.       │
└──────────┬────────────────────┘
           │ REPRODUZIU
           ▼
┌───────────────────────────────┐
│  FASE 2: ISOLAR               │
│  • Rastrear fluxo de dados    │
│  • git bisect se regressao    │
│  • Testar com dados minimos   │
│  • Verificar logs e console   │
│  • Checar cache               │
│  → Encontrou o PONTO exato    │
└──────────┬────────────────────┘
           │ ISOLOU
           ▼
┌───────────────────────────────┐
│  FASE 3: ENTENDER             │
│  • 5 Porques                  │
│  • Documentar causa raiz      │
│  • Mapear arquivos afetados   │
│  → Entendeu POR QUE acontece  │
└──────────┬────────────────────┘
           │ ENTENDEU
           ▼
┌───────────────────────────────┐
│  FASE 4: CORRIGIR             │
│  • Protocolo S.A.I.S          │
│  • Fix cirurgico              │
│  • Verificar (FASE 3.5)       │
│  • Testar regressao           │
│  → Bug resolvido com certeza  │
└──────────┬────────────────────┘
           │ RESOLVIDO
           ▼
┌───────────────────────────────┐
│  REPORTAR                     │
│  • O que era                  │
│  • Onde estava                │
│  • Como foi corrigido         │
│  • Registrar em LESSONS.md    │
│    se foi erro recorrente     │
└───────────────────────────────┘
```

---

## Integracao com Outras Skills

| Situacao | Skill |
|----------|-------|
| Bug envolve query MongoDB suspeita | `/db-guardian` |
| Bug envolve cache stale/inconsistente | `/cache-sentinel` |
| Bug envolve frontend/visual | `/frontend-crafter` + `/ui-ux-quality-gates` |
| Bug envolve seguranca/auth | `/code-inspector` |
| Bug envolve API do Cartola | `/cartola-api` |
| Bug requer refatoracao apos fix | `/Refactor-Monolith` |
| Fix introduziu padrao novo | Registrar em `/ai-problems-detection` |

---

## Comandos Uteis de Debugging

```bash
# Buscar todos os usos de uma funcao/variavel
grep -rn "nomeDaFuncao" --include="*.js" . | grep -v node_modules

# Ver historico recente de mudancas em arquivo
git log --oneline -10 -- [caminho/arquivo.js]

# Ver o que mudou em um arquivo especifico
git diff HEAD~5 -- [caminho/arquivo.js]

# Buscar erros no log
grep -rn "Error\|error\|ERROR\|WARN\|warn" --include="*.log" . 2>/dev/null | tail -50

# Testar endpoint rapidamente
curl -s http://localhost:3000/api/[endpoint] | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)));
"

# Verificar conexao com MongoDB
node -e "require('./config/database.js').then(()=>console.log('OK')).catch(e=>console.error(e))"
```

---

**Versao:** 1.0
**Baseada em:** Systematic Debugging (agnostic-core) adaptada para Super Cartola Manager
**Contexto:** Node.js + Express + MongoDB + Vanilla JS + SPA + Multi-Tenant
**Principio:** "Nunca corrija o que nao entende. Nunca force o que nao funciona."
