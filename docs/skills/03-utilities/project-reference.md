# Skill: Project Reference (Referencia Detalhada do Projeto)

> Conteudo de referencia detalhado do Super Cartola Manager. Consulte esta skill quando precisar de detalhes sobre MCPs, collections, keyword map, renovacao de temporada, ou slash commands.

---

## Tabela Completa - Keyword → Skill

| Quando o usuario diz... | Skill Ativada | Categoria |
|--------------------------|---------------|-----------|
| "redesign", "nova tela", "nova home", "visual do app", "deixar bonito", "UX premium" | **frontend-design** | Design (PRIORIDADE 1) |
| "quero criar feature", "como fazer", "por onde começar" | **workflow** | Core |
| "pesquise", "analise o codigo", "gere PRD" | **pesquisa** | Core |
| "especifique", "mapeie dependencias", "fase 2" | **spec** | Core |
| "implemente", "aplique mudanças", "fase 3" | **code** | Core |
| "crie tela", "ajuste CSS", "layout", "componente" | **frontend-crafter** | Specialist |
| "como funciona", "explique modulo", "documente" | **system-scribe** | Specialist |
| "regra de negocio", "calculo", "config liga" | **league-architect** | Specialist |
| "script DB", "backup", "migration", "limpeza" | **db-guardian** | Specialist |
| "auditar codigo", "security review", "OWASP" | **code-inspector** | Specialist |
| "ja existe esse CSS?", "anti-frank", "ative modo anti-frank", "antes de criar CSS", "blindar frontend" | **anti-frankenstein** | Specialist |
| "git push", "commit", "suba mudanças" | **git-commit-push** | Utility |
| "reiniciar servidor", "restart" | **restart-server** | Utility |
| "pull no replit", "deploy", "sincronizar" | **replit-pull** | Utility |
| "nova sessao", "handover", "retomar" | **newsession** | Utility |
| "verifique se", "confirme que", "e verdade?" | **fact-checker** | Utility |
| "ta complexo", "duplicado", "antes de codar" | **ai-problems-detection** | Utility |
| "refatorar arquivo grande", "separar modulos" | **Refactor-Monolith** | Utility |
| "adaptar html", "converter html externo", "html do stitch", "stitch mcp", "gerar tela no stitch", "design no stitch", "mockup no stitch", "variante no stitch" | **stitch-adapter** | Utility |
| "API Cartola", "endpoint", "scout", "mercado" | **cartola-api** | Project |
| "auditar cache", "cache lento", "Service Worker" | **cache-auditor** | Project |
| "cache stale", "cache antigo", "sentinel", "monitorar cache", "dado antigo no app", "vasculhar caches" | **cache-sentinel** | Project |
| "auditar modulo", "checklist modulo" | **auditor-module** | Project |
| "auditar UX app", "revisar design participante", "visual do app" | **ux-auditor-app** | Project |
| "auditar live", "experiencia ao vivo", "parciais ao vivo", "orchestrator ok", "pre-flight rodada" | **live-experience** | Project |
| "analise de branches", "comparar branches" | **analise-branches** | Project |
| "deletar branches mergeadas", "limpar branches", "cleanup branches", "higienizar branches" | **delete-merged-branches** | Utility |
| "auditoria mensal", "verificar mudanças", "check context7" | **context7-monthly-audit** | Project |
| "criar skill", "skill nova" | **skill-creator** | Meta |
| "instalar skill", "listar skills" | **skill-installer** | Meta |
| "referencia projeto", "detalhes MCPs", "collections", "tipos de ID" | **project-reference** | Utility |

---

## MCPs Disponiveis

### Context7 - Documentacao Tecnica
Busca docs sempre atualizadas de frameworks/APIs (Mongoose, Express, MDN, OWASP)
- **USE:** Verificar mudanças API, security audits, implementar features novas
- **NAO USE:** Logica de negocio interna, debug de codigo custom
- **Limitacao:** Repositorios nicho nao indexados (usar Perplexity)

### Perplexity - Pesquisa Web Inteligente
| Tool | Quando Usar |
|------|-------------|
| `perplexity_ask` | Duvidas rapidas, info factual |
| `perplexity_search` | URLs, noticias recentes |
| `perplexity_research` | Analises extensas |
| `perplexity_reason` | Raciocinio complexo |

**Context7 vs Perplexity:**
- Docs oficiais frameworks → Context7
- API Cartola FC nao-documentada → Perplexity
- Noticias ultimas 48h → Perplexity

### Mongo MCP - Acesso Direto ao Banco
| Tool | Funcao |
|------|--------|
| `list_collections` | Listar collections |
| `find_documents` | Buscar com query JSON |
| `get_collection_schema` | Analisar estrutura |

**Quando usar:** Consultas rapidas, debug. **Nao usar:** Operacoes destrutivas (usar scripts com `--dry-run`)

### Stitch MCP - Design-to-Code (Google Stitch)
Gera mockups visuais, variantes e extrai HTML via Google Stitch AI.

| Tool | Funcao |
|------|--------|
| `list_projects` | Listar projetos do usuario |
| `list_screens` | Listar telas de um projeto |
| `get_screen` | Obter detalhes + HTML de uma tela |
| `generate_screen_from_text` | Gerar tela a partir de prompt |
| `edit_screens` | Editar telas existentes |
| `generate_variants` | Gerar variacoes de design |

**Pipeline completo:** [`docs/guides/STITCH-MCP-PIPELINE.md`](docs/guides/STITCH-MCP-PIPELINE.md)
**Prompt padrao:** `.claude/STITCH-DESIGN-PROMPT.md`

**Integracao com skills:**
```
Stitch MCP (gerar) → frontend-design (validar) → stitch-adapter (adaptar) → anti-frankenstein (governar) → frontend-crafter (implementar)
```

---

## Slash Commands Detalhados

| Comando Direto | Keywords Equivalentes |
|----------------|----------------------|
| `/workflow` | "como fazer feature", "por onde começar" |
| `/pesquisa` | "pesquise no codigo", "gere PRD" |
| `/spec` | "especifique mudanças", "mapeie dependencias" |
| `/code` | "implemente", "aplique spec" |
| `/auditor-module [modulo]` | "audite o modulo X", "checklist modulo" |
| `/cache-auditor [modo]` | "auditar cache", "cache desatualizado" |
| `/cache-sentinel [modo]` | "cache stale", "cache antigo prevalecendo", "monitorar cache participante", "vasculhar caches" |
| `/ux-auditor-app` | "auditar UX do app", "revisar design participante", "visual do app ta ok?" |
| `/live-experience` | "auditar experiencia ao vivo", "parciais tao ok?", "orchestrator ta rodando?", "pre-flight rodada" |
| `/anti-frankenstein` | "anti-frank", "ative modo anti-frank", "antes de criar CSS", "ja existe?", "blindar frontend", "HTMLs no modo anti-frank" |
| `/stitch-adapter` | "stitch mcp", "gerar tela no stitch", "design no stitch", "mockup no stitch", "variante no stitch", "adaptar html do stitch" |
| `/newsession` | "nova sessao", "salvar contexto" |
| `/liste-pr-github [periodo]` | "listar PRs", "PRs de hoje", "merges da semana" |
| `/security-review` | "auditoria seguranca", "security review", "revisar seguranca do PR" |
| `/delete-merged-branches` | "deletar branches mergeadas", "limpar branches", "cleanup branches", "higienizar branches" |

> **`/liste-pr-github`** - Lista PRs do GitHub via API. Periodos: `hoje`, `ontem`, `semana`, `mes`, `YYYY-MM-DD` ou range `YYYY-MM-DD YYYY-MM-DD`. Sem argumento lista os ultimos 10.

> **`/security-review`** - Auditoria de seguranca do diff da branch atual. Analisa vulnerabilidades com confianca >80%, gera relatorio com severidade e recomendacoes. Customizado para o projeto: NoSQL injection, XSS innerHTML, session management, idempotencia financeira.

---

## Sistema de Renovacao de Temporada

**Documentacao Completa:** [`docs/SISTEMA-RENOVACAO-TEMPORADA.md`](docs/SISTEMA-RENOVACAO-TEMPORADA.md)

### Principios
1. **Zero hardcode** - Regras configuraveis via `ligarules`
2. **Independencia por liga** - Cada liga tem regras diferentes
3. **Auditoria completa** - Registro em `inscricoestemporada`
4. **Separacao de temporadas** - Extratos independentes

### Collections
- `ligarules` - Regras configuraveis (taxa, prazo, parcelamento)
- `inscricoestemporada` - Registro de inscricoes/renovacoes

### Flag `pagouInscricao`
- `true` → Taxa registrada, NAO vira debito
- `false` → Taxa VIRA DEBITO no extrato

---

## Pre-Temporada (Conceito Critico)

Periodo entre fim de temporada e inicio da proxima:
- **API Cartola** retorna `temporada: [ano anterior]`
- **Brasileirao** nao comecou (sem rodadas)
- **Participantes** podem renovar/inscrever

### Deteccao
```javascript
// Frontend
const isPreTemporada = temporadaSelecionada > mercadoData.temporada;

// Backend
const preTemporada = temporada > statusMercado.temporada;
```

### Terminologia Financeira
| Termo | Descricao |
|-------|-----------|
| **Ajustes** | Campos editaveis (campo1-4) para valores extras |
| **Acertos** | Pagamentos/recebimentos que movimentam saldo |
| **Legado** | Saldo transferido da temporada anterior |
| **Inscricao** | Taxa para nova temporada |

---

## Tipos de ID por Collection (Divida Tecnica)

| Collection | Campo | Tipo | Por que |
|------------|-------|------|---------|
| `extratofinanceirocaches` | `time_id` | Number | Performance |
| `fluxofinanceirocampos` | `timeId` | String | Flexibilidade |
| `acertofinanceiros` | `timeId` | String | Consistencia |
| `ajustefinanceiros` | `time_id` | Number | Historico |
| `inscricoestemporada` | `time_id` | Number | Historico |

**Mongoose faz coercao:** `String("13935277") == 13935277`

**Divida tecnica conhecida (auditoria 2026-02-25):**
- `AcertoFinanceiro`/`FluxoFinanceiroCampos` usam camelCase (`timeId: String`)
- `AjusteFinanceiro`/`ExtratoFinanceiroCache`/`InscricaoTemporada` usam snake_case (`time_id: Number`)
- **Regra de ouro para novas queries:**
  - `extratofinanceirocaches` → `time_id: Number(id)` (raw) / `timeIds.map(Number)` (bulk)
  - `fluxofinanceirocampos` → `timeId: { $in: ids.map(String) }` (Mongoose)
  - `acertofinanceiros` → `timeId: String(id)` (Mongoose)

---

## Jogos do Dia (API-Football + Fallbacks)

**Documentacao:** [`docs/JOGOS-DO-DIA-API.md`](docs/JOGOS-DO-DIA-API.md)

**Cobertura:** Brasileirao A/B/C/D, Copa do Brasil, TODOS Estaduais, Copinha

**Fallback:** API-Football → SoccerDataAPI → Cache Stale → Globo Esporte

**Endpoints:**
- `GET /api/jogos-ao-vivo` → Jogos do dia
- `GET /api/jogos-ao-vivo/status` → Diagnostico APIs
- `GET /api/jogos-ao-vivo/invalidar` → Forca refresh

---

## Sistema de Versionamento

**Proposito:** Forca atualizacoes no app quando ha mudancas
**API:** `/api/app/check-version` (versoes independentes admin/app)

**Funcionamento:**
1. App verifica versao ao iniciar/voltar do background
2. Compara local vs servidor
3. Se diferente → modal obrigatorio
4. Atualizar → limpa cache + reload

**Arquivos:** `config/appVersion.js`, `public/js/app/app-version.js`

---

## Gestao de Backlog

### Sistema Hibrido
- **BACKLOG.md** → Backlog central unico (fonte da verdade)
- **TODOs no codigo** → Padrao: `// TODO-[LEVEL]: [descricao]`

### Padroes
```javascript
// TODO-CRITICAL: Bugs graves, seguranca
// TODO-HIGH: Features importantes, performance
// TODO-MEDIUM: Melhorias UX, refatoracoes
// TODO-LOW: Nice to have
// TODO-FUTURE: Backlog distante
```

### CLI
```bash
node scripts/backlog-helper.js list      # Listar TODOs
node scripts/backlog-helper.js validate  # Validar IDs
node scripts/backlog-helper.js search "termo"  # Buscar
```

### IDs no BACKLOG
`BUG-XXX`, `SEC-XXX`, `FEAT-XXX`, `PERF-XXX`, `UX-XXX`, `REFACTOR-XXX`, `IDEA-XXX`, `NICE-XXX`, `FUTURE-XXX`
