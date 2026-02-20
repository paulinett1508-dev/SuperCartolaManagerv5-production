# SUPER CARTOLA MANAGER - PROJECT RULES

## 🎯 PROTOCOLO DE PLANEJAMENTO OBRIGATÓRIO

**PRIORIDADE MÁXIMA - APLICÁVEL EM TODOS OS AMBIENTES (Web, Terminal, VS Code, Antigravity)**

### Regra de Ouro

**NUNCA inicie a programação ou tome decisões sem ANTES:**

1. **CRIAR UM PLANEJAMENTO COMPLETO** da tarefa solicitada
2. **LISTAR TODAS AS TAREFAS** usando `TodoWrite` tool
3. **QUESTIONAR O USUÁRIO** se o planejamento faz sentido
4. **AGUARDAR APROVAÇÃO EXPLÍCITA** antes de executar

### Fluxo Obrigatório

```
Solicitação do Usuário
    ↓
📋 FASE 1: PLANEJAMENTO
    • Analisar requisitos
    • Identificar dependências
    • Mapear riscos
    • Listar todos os passos
    ↓
✅ FASE 2: VALIDAÇÃO COM USUÁRIO
    • Apresentar plano completo
    • Questionar se faz sentido
    • Aguardar confirmação
    ↓
⚡ FASE 3: EXECUÇÃO (Modo Bypass)
    • Executar tarefas listadas
    • Marcar progresso em tempo real
    • Auto-accept edits (se configurado)
```

### Formato de Apresentação

Sempre use este template ao planejar:

```markdown
## 📋 Planejamento da Tarefa: [NOME DA TAREFA]

### Contexto
[Breve resumo do que foi solicitado]

### Análise
[O que precisa ser feito e por quê]

### Tarefas Identificadas
1. [Tarefa 1] - [Justificativa]
2. [Tarefa 2] - [Justificativa]
...

### Riscos/Considerações
- [Risco 1]
- [Risco 2]

### Arquivos Afetados
- `/caminho/arquivo1.js` - [O que será alterado]
- `/caminho/arquivo2.md` - [O que será alterado]

---

**⚠️ Este planejamento faz sentido? Posso prosseguir?**
```

### Exceções (RARAS)

Este protocolo pode ser IGNORADO apenas se:

1. **Comando explícito de bypass**: Usuário diz "execute direto", "pule o planejamento"
2. **Tarefa trivial óbvia**: Ex: "leia o arquivo X.js" (1 ação simples)
3. **Continuação de tarefa aprovada**: Já está em execução de plano validado

### Configuração Auto-accept

Se `autoAcceptEdits: true` está configurado:

- **AINDA ASSIM** faça o planejamento primeiro
- Após aprovação, execute sem pausas
- Use `TodoWrite` para mostrar progresso

### Penalidades por Violação

Se você violar este protocolo:

1. **PARE IMEDIATAMENTE** a execução
2. **DESFAÇA** mudanças se possível
3. **CRIE O PLANEJAMENTO** que deveria ter feito
4. **PEÇA DESCULPAS** e recomece corretamente

---

**🚨 ESTA REGRA É ABSOLUTA E INEGOCIÁVEL 🚨**

## 🧠 Tech Stack & Constraints
- **Runtime:** Node.js (Replit Environment)
- **Database:** MongoDB (Native Driver)
- **Frontend:** HTML5, CSS3, Vanilla JS (ES6 Modules)
- **Styling:** TailwindCSS (via CDN)
- **Architecture:** MVC (Models, Controllers, Views/Public)

## 🎨 UI/UX Guidelines (Dark Mode First)
- **Theme:** Strict Dark Mode (`bg-gray-900`, `bg-slate-900`)
- **Text:** Primary `text-white`/`text-gray-100`, Muted `text-gray-400`
- **Components:**
  - Cards: `bg-gray-800 rounded-lg shadow-lg`
  - Buttons: Explicit feedback (hover/active states)
  - Inputs: `bg-gray-700 text-white border-gray-600`

### Tipografia
| Uso | Fonte | CSS |
|-----|-------|-----|
| Títulos, Badges, Stats | Russo One | `font-family: 'Russo One', sans-serif;` |
| Corpo de texto | Inter | `font-family: 'Inter', -apple-system, sans-serif;` |
| Valores numéricos | JetBrains Mono | `font-family: 'JetBrains Mono', monospace;` |

### Cores dos Módulos (Identidade Visual)
Cada módulo possui sua paleta de cores padronizada. **Sempre use variáveis CSS** (definidas em `/css/_admin-tokens.css`):

| Módulo | Cor Primária | Variável CSS | Simbolismo |
|--------|--------------|--------------|------------|
| **Artilheiro Campeão** | Verde `#22c55e` | `--module-artilheiro-primary` | Gols / Vitória |
| **Capitão de Luxo** | Roxo `#8b5cf6` | `--module-capitao-primary` | Liderança / Capitania |
| **Luva de Ouro** | Dourado `#ffd700` | `--module-luva-primary` | Luva de Ouro / Goleiros |

**Exemplo de uso:**
```css
/* Header do módulo */
.artilheiro-header {
    background: var(--gradient-artilheiro);
    border: 1px solid var(--module-artilheiro-border);
}

/* Backgrounds sutis */
.capitao-card {
    background: var(--module-capitao-muted);
}
```

**⚠️ Regra:** NUNCA use cores hardcoded (`#22c55e`) diretamente. Sempre use as variáveis CSS para manter consistência e facilitar manutenção futura.

### Ícones (REGRA CRÍTICA)
**NUNCA use emojis no código.** Sempre use Material Icons com cores tematizadas via variáveis CSS.

| Contexto | Errado | Correto |
|----------|--------|---------|
| Indicador ganho | `🟢` | `<span class="material-icons" style="color: var(--app-success)">check_circle</span>` |
| Indicador perda | `🔴` | `<span class="material-icons" style="color: var(--app-danger)">cancel</span>` |
| Estrela/MITO | `⭐` | `<span class="material-icons" style="color: var(--app-warning)">star</span>` |
| Troféu | `🏆` | `<span class="material-icons" style="color: var(--app-danger)">emoji_events</span>` |
| Futebol | `⚽` | `<span class="material-icons" style="color: var(--app-indigo)">sports_soccer</span>` |
| Alvo/Posição | `🎯` | `<span class="material-icons" style="color: var(--app-primary)">casino</span>` |

**Motivos:**
1. Emojis renderizam diferente em cada OS/browser
2. Material Icons são vetoriais (escaláveis sem perda)
3. Cores podem ser tematizadas via CSS variables
4. Consistência visual em todo o sistema

## 🛡️ Coding Standards
- **Idempotency:** Financial functions MUST be idempotent (prevent double-charging)
- **Safety:** Always validate `req.session.usuario` before sensitive actions
- **Error Handling:** Use `try/catch` in async controllers
- **No React/Vue:** Pure JavaScript for frontend
- **Nomenclatura em Português:** Use `autorizado` (not `authorized`), `usuario` (not `user`), `senha` (not `password`)
- **SPA Init Pattern:** Páginas em `supportedPages` (layout.html) NUNCA devem usar `DOMContentLoaded` sozinho. O evento só dispara uma vez — na navegação SPA o DOM já está pronto e o listener nunca executa. Sempre usar:
```javascript
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // SPA: DOM já pronto, executar imediatamente
}
```

## 🎨 REGRA Nº 1 — Skill `frontend-design` (AUTORIDADE ESTÉTICA MÁXIMA)

> **Prioridade absoluta em qualquer decisão de design visual. Sobrepõe preferências genéricas. Respeita o design system do projeto.**

A skill `frontend-design` (instalada em `~/.claude/skills/frontend-design/`) define a **filosofia estética** de todas as telas do projeto. Sempre que o assunto envolver criação ou redesign de interface, ela é ativada **antes** de qualquer outra skill de frontend.

### Gatilhos de Ativação (frontend-design)

| Categoria | Keywords |
|-----------|----------|
| **Telas / Entregáveis** | redesign, nova tela, nova página, nova home, landing, dashboard, painel, componente visual, card, banner, hero, layout |
| **Ações de design** | criar interface, redesenhar, melhorar visual, modernizar, deixar mais bonito, estilizar, visual do app |
| **Referências estéticas** | dark mode, tema, paleta, tipografia, animação, motion, responsivo, mobile-first, UX premium |
| **Specs do projeto** | SPEC-HOME-REDESIGN, redesign participante, redesign admin, nova home 2026 |

### O que a skill determina (adaptado ao projeto)

**Antes de qualquer código, definir:**
- Propósito da tela no contexto do Super Cartola Manager
- Tom estético dentro da identidade do projeto (dark mode, foco em dados esportivos)
- O que tornará a tela **inesquecível** para o usuário do fantasy

**Pilares estéticos obrigatórios:**

| Pilar | Diretriz do Projeto |
|-------|-------------------|
| **Tipografia** | Russo One (títulos/stats) + JetBrains Mono (números) + Inter (corpo). Nunca Arial, Roboto ou fontes genéricas. |
| **Cor & Tema** | Dark mode estrito. Usar variáveis CSS de `_admin-tokens.css`. Cores dos módulos (Verde Artilheiro, Roxo Capitão, Dourado Luva). |
| **Motion** | Animações de entrada escalonadas. Hover states que surpreendem. CSS-only por padrão. |
| **Composição** | Densidade visual otimizada (inspiração: dashboards fantasy premium). Hierarquia clara de dados. |
| **Fundos/Detalhes** | Gradients sutis, noise textures, sombras dramáticas, glassmorphism onde couber. Nunca fundo sólido genérico. |

**Proibições absolutas:**
- Fontes genéricas (Inter como display, Arial, system fonts)
- Gradientes roxos em fundo branco (clichê AI)
- Layouts previsíveis sem caráter
- Emojis no código (usar Material Icons com `var(--css-var)`)
- Cores hardcoded — sempre variáveis CSS

### Integração com outros protocolos

```
frontend-design (AESTHETICS)     ← autoridade estética, define direção visual
    ↓
anti-frankenstein (GOVERNANCE)   ← verifica o que já existe antes de criar CSS
    ↓
frontend-crafter (IMPLEMENTATION) ← executa o código seguindo design system
```

---

## 🤖 Skills com Ativação por Keywords

Skills são ativadas automaticamente por **palavras-chave contextuais** em vez de nome direto.
Mapeamento completo: [`docs/skills/SKILL-KEYWORD-MAP.md`](docs/skills/SKILL-KEYWORD-MAP.md)
Documentação das skills: [`docs/skills/`](docs/skills/) (agnóstico, Markdown puro)

### Protocolo de Ativação
1. Detectar keywords na mensagem do usuário
2. Se keyword de design/visual → ativar **frontend-design** primeiro
3. Consultar [`SKILL-KEYWORD-MAP.md`](docs/skills/SKILL-KEYWORD-MAP.md) para skills complementares
4. Executar protocolo na ordem: frontend-design → anti-frankenstein → skill específica

### Tabela Rápida - Keyword → Skill

| Quando o usuário diz... | Skill Ativada | Categoria |
|--------------------------|---------------|-----------|
| "redesign", "nova tela", "nova home", "visual do app", "deixar bonito", "UX premium" | **frontend-design** | Design (PRIORIDADE 1) |
| "quero criar feature", "como fazer", "por onde começar" | **workflow** | Core |
| "pesquise", "analise o código", "gere PRD" | **pesquisa** | Core |
| "especifique", "mapeie dependências", "fase 2" | **spec** | Core |
| "implemente", "aplique mudanças", "fase 3" | **code** | Core |
| "crie tela", "ajuste CSS", "layout", "componente" | **frontend-crafter** | Specialist |
| "como funciona", "explique módulo", "documente" | **system-scribe** | Specialist |
| "regra de negócio", "cálculo", "config liga" | **league-architect** | Specialist |
| "script DB", "backup", "migration", "limpeza" | **db-guardian** | Specialist |
| "auditar código", "security review", "OWASP" | **code-inspector** | Specialist |
| "já existe esse CSS?", "anti-frank", "ative modo anti-frank", "antes de criar CSS", "blindar frontend" | **anti-frankenstein** | Specialist |
| "git push", "commit", "suba mudanças" | **git-commit-push** | Utility |
| "reiniciar servidor", "restart" | **restart-server** | Utility |
| "pull no replit", "deploy", "sincronizar" | **replit-pull** | Utility |
| "nova sessão", "handover", "retomar" | **newsession** | Utility |
| "verifique se", "confirme que", "é verdade?" | **fact-checker** | Utility |
| "tá complexo", "duplicado", "antes de codar" | **ai-problems-detection** | Utility |
| "refatorar arquivo grande", "separar módulos" | **Refactor-Monolith** | Utility |
| "adaptar html", "converter html externo", "html do stitch" | **stitch-adapter** | Utility |
| "API Cartola", "endpoint", "scout", "mercado" | **cartola-api** | Project |
| "auditar cache", "cache lento", "Service Worker" | **cache-auditor** | Project |
| "auditar módulo", "checklist módulo" | **auditor-module** | Project |
| "auditar UX app", "revisar design participante", "visual do app" | **ux-auditor-app** | Project |
| "auditar live", "experiência ao vivo", "parciais ao vivo", "orchestrator ok", "pre-flight rodada" | **live-experience** | Project |
| "análise de branches", "comparar branches" | **analise-branches** | Project |
| "auditoria mensal", "verificar mudanças", "check context7" | **context7-monthly-audit** | Project |
| "criar skill", "skill nova" | **skill-creator** | Meta |
| "instalar skill", "listar skills" | **skill-installer** | Meta |

### High Senior Protocol (Workflow Completo)
```
workflow → FASE 1: pesquisa → PRD.md
         → FASE 2: spec → SPEC.md
         → FASE 3: [frontend-design se visual] → [anti-frankenstein] → code → Implementado
```

### Anti-Frankenstein Protocol (Governança Frontend)
```
Qualquer criação/modificação CSS/HTML
    ↓
CHECK 1: Já existe? (consultar css-registry.json)
CHECK 2: Onde vive? (diretório correto)
CHECK 3: Usa tokens? (zero hardcoded)
CHECK 4: Segue convenções? (naming, escopo, header)
CHECK 5: É necessário? (editar existente vs criar novo)
    ↓
Todos passaram? → Prosseguir
Algum falhou? → PARAR e corrigir
```
**Arquivos:** `config/css-registry.json`, `docs/rules/audit-frontend.md`

**Diretório:** `.claude/docs/PRD-[nome].md` e `SPEC-[nome].md`

## 🔌 MCPs Disponíveis

### Context7 - Documentação Técnica
Busca docs sempre atualizadas de frameworks/APIs (Mongoose, Express, MDN, OWASP)
- **✅ USE:** Verificar mudanças API, security audits, implementar features novas
- **❌ NÃO USE:** Lógica de negócio interna, debug de código custom
- **Limitação:** Repositórios nicho não indexados (usar Perplexity)

### Perplexity - Pesquisa Web Inteligente
| Tool | Quando Usar |
|------|-------------|
| `perplexity_ask` | Dúvidas rápidas, info factual |
| `perplexity_search` | URLs, notícias recentes |
| `perplexity_research` | Análises extensas |
| `perplexity_reason` | Raciocínio complexo |

**Context7 vs Perplexity:**
- Docs oficiais frameworks → Context7
- API Cartola FC não-documentada → Perplexity
- Notícias últimas 48h → Perplexity

### Mongo MCP - Acesso Direto ao Banco
| Tool | Função |
|------|--------|
| `list_collections` | Listar collections |
| `find_documents` | Buscar com query JSON |
| `get_collection_schema` | Analisar estrutura |

**Quando usar:** Consultas rápidas, debug. **Não usar:** Operações destrutivas (usar scripts com `--dry-run`)

## 🎯 Slash Commands & Ativação por Keywords

Skills podem ser invocadas por `/nome` OU por keywords naturais na conversa.
As keywords ativam a mesma skill automaticamente (ver tabela acima).

| Comando Direto | Keywords Equivalentes |
|----------------|----------------------|
| `/workflow` | "como fazer feature", "por onde começar" |
| `/pesquisa` | "pesquise no código", "gere PRD" |
| `/spec` | "especifique mudanças", "mapeie dependências" |
| `/code` | "implemente", "aplique spec" |
| `/auditor-module [modulo]` | "audite o módulo X", "checklist módulo" |
| `/cache-auditor [modo]` | "auditar cache", "cache desatualizado" |
| `/ux-auditor-app` | "auditar UX do app", "revisar design participante", "visual do app tá ok?" |
| `/live-experience` | "auditar experiência ao vivo", "parciais tão ok?", "orchestrator tá rodando?", "pre-flight rodada" |
| `/anti-frankenstein` | "anti-frank", "ative modo anti-frank", "antes de criar CSS", "já existe?", "blindar frontend", "HTMLs no modo anti-frank" |
| `/newsession` | "nova sessão", "salvar contexto" |
| `/liste-pr-github [período]` | "listar PRs", "PRs de hoje", "merges da semana" |

> **`/liste-pr-github`** - Lista PRs do GitHub via API. Períodos: `hoje`, `ontem`, `semana`, `mes`, `YYYY-MM-DD` ou range `YYYY-MM-DD YYYY-MM-DD`. Sem argumento lista os últimos 10.

## 🔄 Sistema de Renovação de Temporada

**Documentação Completa:** [`docs/SISTEMA-RENOVACAO-TEMPORADA.md`](docs/SISTEMA-RENOVACAO-TEMPORADA.md)

### Princípios
1. **Zero hardcode** - Regras configuráveis via `ligarules`
2. **Independência por liga** - Cada liga tem regras diferentes
3. **Auditoria completa** - Registro em `inscricoestemporada`
4. **Separação de temporadas** - Extratos independentes

### Collections
- `ligarules` - Regras configuráveis (taxa, prazo, parcelamento)
- `inscricoestemporada` - Registro de inscrições/renovações

### Flag `pagouInscricao`
- `true` → Taxa registrada, NÃO vira débito
- `false` → Taxa VIRA DÉBITO no extrato

## 🕐 Pré-Temporada (Conceito Crítico)

Período entre fim de temporada e início da próxima:
- **API Cartola** retorna `temporada: [ano anterior]`
- **Brasileirão** não começou (sem rodadas)
- **Participantes** podem renovar/inscrever

### Detecção
```javascript
// Frontend
const isPreTemporada = temporadaSelecionada > mercadoData.temporada;

// Backend
const preTemporada = temporada > statusMercado.temporada;
```

### Terminologia Financeira
| Termo | Descrição |
|-------|-----------|
| **Ajustes** | Campos editáveis (campo1-4) para valores extras |
| **Acertos** | Pagamentos/recebimentos que movimentam saldo |
| **Legado** | Saldo transferido da temporada anterior |
| **Inscrição** | Taxa para nova temporada |

## 🧩 Sistema de Módulos

### Estrutura de Controle
- `Liga.modulos_ativos` → On/Off simples
- `ModuleConfig` → Config granular por liga/temporada
- `participante-navigation.js` → Carrega dinamicamente

### Módulos Existentes

**Base (sempre ativos):** Extrato, Ranking, Rodadas, Hall da Fama

**Opcionais:** Top 10, Melhor Mês, Pontos Corridos, Mata-Mata, Artilheiro, Luva de Ouro, Campinho, Dicas

**Planejados 2026:** Tiro Certo, Bolão Copa & Liberta, Resta Um, Capitão de Luxo

### Estados vs Módulos (NÃO confundir)
- **Parciais** → Estado da rodada (jogos em andamento)
- **Pré-Temporada** → Condição temporal
- **Mercado Aberto/Fechado** → Estado do Cartola
- **Rodada Finalizada** → Estado consolidado

## 📊 Estrutura de Dados

### Collection "times"
**IMPORTANTE:** Sistema NÃO usa collection "users". Todos participantes em **"times"**
- Schema: `id` (Number), `nome_time`, `nome_cartoleiro`, `ativo`, `temporada`

### Tipos de ID por Collection
| Collection | Campo | Tipo | Por quê |
|------------|-------|------|---------|
| `extratofinanceirocaches` | `time_id` | Number | Performance |
| `fluxofinanceirocampos` | `timeId` | String | Flexibilidade |
| `acertofinanceiros` | `timeId` | String | Consistência |

**Mongoose faz coerção:** `String("13935277") == 13935277`

### Escudos
Localização: `/public/escudos/{clube_id}.png` (262=Flamengo, 263=Botafogo, etc.)
Fallback: `onerror="this.src='/escudos/default.png'"`

## 🔐 Sistema de Autenticação Admin

**Arquitetura:** Replit Auth (OpenID Connect)

### Ordem de Autorização (`isAdminAuthorizado()`)
1. Verifica collection `admins` no MongoDB
2. Se vazio → usa `ADMIN_EMAILS` da env
3. Se existe mas email não está → **NEGA**
4. Sem restrição → permite (dev mode)

**Rota de Debug:** `/api/admin/auth/debug`

## 🔌 Estratégia de Banco de Dados

### Configuração
- **Banco único:** `cartola-manager` (MongoDB Atlas) — mesmo banco para dev e prod
- **Variável:** Apenas `MONGO_URI` — `MONGO_URI_DEV` foi descontinuada e deletada
- **NODE_ENV:** Diferencia apenas logs e labels (`[🔵 DEV]` vs `[🔴 PROD]`), NÃO o banco
- **Razão:** Micro SaaS — dados perpétuos, time pequeno, sem necessidade de ambientes separados

### Stack de Desenvolvimento
- `npm run dev` → `NODE_ENV=development` → conecta ao mesmo banco real
- Replit link temporário → admin valida mudanças sem afetar usuários
- Replit Republish → usuários em `supercartolamanager.com.br` recebem as mudanças

### Scripts — Padrão Correto
```javascript
// ✅ CORRETO — todos os scripts devem usar apenas MONGO_URI
const MONGO_URI = process.env.MONGO_URI;

// ❌ ERRADO — MONGO_URI_DEV foi descontinuada
// const MONGO_URI = process.env.MONGO_URI_DEV || process.env.MONGO_URI;
```

### Proteções em Scripts
```javascript
// Para scripts destrutivos: sempre exigir --dry-run ou --force
if (!isDryRun && !isForce) {
    console.error('❌ Use --dry-run para simular ou --force para executar');
    process.exit(1);
}
```

### Comandos
```bash
node scripts/[script].js --dry-run  # Validar
node scripts/[script].js --force    # Executar
```

## ⚽ Jogos do Dia (API-Football + Fallbacks)

**Documentação:** [`docs/JOGOS-DO-DIA-API.md`](docs/JOGOS-DO-DIA-API.md)

**Cobertura:** Brasileirão A/B/C/D, Copa do Brasil, TODOS Estaduais, Copinha

**Fallback:** API-Football → SoccerDataAPI → Cache Stale → Globo Esporte

**Endpoints:**
- `GET /api/jogos-ao-vivo` → Jogos do dia
- `GET /api/jogos-ao-vivo/status` → Diagnóstico APIs
- `GET /api/jogos-ao-vivo/invalidar` → Força refresh

## 📦 Sistema de Versionamento

**Propósito:** Força atualizações no app quando há mudanças
**API:** `/api/app/check-version` (versões independentes admin/app)

**Funcionamento:**
1. App verifica versão ao iniciar/voltar do background
2. Compara local vs servidor
3. Se diferente → modal obrigatório
4. Atualizar → limpa cache + reload

**Arquivos:** `config/appVersion.js`, `public/js/app/app-version.js`

## 📝 Sistema de Gestão de Ideias e Backlog

### Sistema Híbrido
- **BACKLOG.md** → Backlog central único (fonte da verdade)
- **TODOs no código** → Padrão: `// TODO-[LEVEL]: [descrição]`
- **.cursorrules** → Regras que instruem IA

### Padrões
```javascript
// TODO-CRITICAL: Bugs graves, segurança
// TODO-HIGH: Features importantes, performance
// TODO-MEDIUM: Melhorias UX, refatorações
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

## 🚫 Regra Absoluta: Zero Arredondamento de Pontos

**PONTOS DE PARTICIPANTES NUNCA DEVEM SER ARREDONDADOS. SEMPRE TRUNCAR.**

### Por que truncar, não arredondar?
- `93.78569` arredondado → `93.79` (ERRADO — o participante não fez esse ponto)
- `93.78569` truncado → `93.78` (CORRETO — apenas o que foi conquistado)

### Funções Canônicas Obrigatórias

**Backend (Node.js) — retorna `number`:**
```javascript
import { truncarPontosNum } from '../utils/type-helpers.js';
// Ex: truncarPontosNum(93.78569) → 93.78
```

**Frontend participante — retorna `string` formatada pt-BR:**
```javascript
// truncarPontos() já está disponível via window.truncarPontos (participante-utils.js)
// Ex: truncarPontos(93.78569) → "93,78"
```

**Frontend admin (sem truncarPontos no escopo) — inline:**
```javascript
// 2 casas decimais:
(Math.trunc(valor * 100) / 100).toFixed(2)
// 1 casa decimal:
(Math.trunc(valor * 10) / 10).toFixed(1)
```

### O que é PROIBIDO
```javascript
// NUNCA — arredonda: 93.785 → 93.79
pontos.toFixed(2)

// NUNCA — arredonda: 93.785 → 93.79
parseFloat(pontos.toFixed(2))

// NUNCA — arredonda: Math.round(93.785 * 100) / 100 → 93.79
Math.round(pontos * 100) / 100
```

### O que é OBRIGATÓRIO
```javascript
// Backend → number
truncarPontosNum(pontos)              // 93.785 → 93.78

// Frontend com truncarPontos disponível → string pt-BR
truncarPontos(pontos)                 // 93.785 → "93,78"

// Frontend sem truncarPontos (inline) → string
(Math.trunc(pontos * 100) / 100).toFixed(2)  // 93.785 → "93.78"
```

### Implementação de `truncarPontosNum`
```javascript
// utils/type-helpers.js
export function truncarPontosNum(valor) {
    const num = parseFloat(valor) || 0;
    return Math.trunc(num * 100) / 100;
}
```

### Implementação canônica de `truncarPontos` (frontend)
```javascript
// Usar Math.trunc — trunca em direção ao zero (correto para negativos)
function truncarPontos(valor) {
    const num = parseFloat(valor) || 0;
    const truncado = Math.trunc(num * 100) / 100;
    return truncado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

### Escopo da Regra
Aplica-se a **qualquer valor de pontuação de participante**, incluindo:
- Pontos da rodada (`pontos`, `pontos_rodada`)
- Pontos acumulados (`pontos_total`, `pontuacao_total`)
- Médias de pontos (`media_pontos`, `media_capitao`)
- Diferenças (`diferenca_media`, `diferenca_melhor`, `vs_media`)
- Pontos de módulos (Artilheiro, Luva de Ouro, Pontos Corridos, Mata-Mata, etc.)

**NÃO se aplica** a valores financeiros (R$), percentuais (%), tempos (ms/s), tamanhos (MB), contagens inteiras.

---

## ⚠️ Critical Rules
1. NEVER remove `gemini_audit.py`
2. NEVER break "Follow the Money" audit trail in financial controllers
3. Always check variable existence before accessing properties (avoid `undefined`)
4. NEVER round participant points — always TRUNCATE using `truncarPontosNum()` (backend) or `truncarPontos()` (frontend)
