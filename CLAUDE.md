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
    • Se algo sair dos trilhos → PARE e re-planeje (nunca force)
    • Ao concluir cada tarefa → resumo curto do que mudou
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

### FASE 3.5: Verificação Antes de Concluir

**NUNCA marque uma tarefa como concluída sem PROVAR que funciona.**

| Tipo de Mudança | Verificação Mínima |
|-----------------|-------------------|
| **Backend** (controller/route/model) | Testar endpoint (curl/Postman), verificar logs do servidor |
| **Frontend** (JS/HTML) | Verificar console do browser, testar interação. **Se arquivo carregado via `vImport()` no orquestrador admin → incrementar `ADMIN_JS_VERSION` em `detalhe-liga-orquestrador.js`** |
| **Script** (migration/cron) | Rodar com `--dry-run` primeiro |
| **CSS/Visual** | Confirmar render visual, checar responsivo |
| **Config/DB** | Validar schema, testar query |

**Checklist obrigatório:**
- [ ] Funciona? (testei/demonstrei)
- [ ] Diff correto? (reli `git diff` — só contém o pedido)
- [ ] Sem regressão? (nada existente quebrou)
- [ ] Staff engineer aprovaria este PR?

**Se algo sair dos trilhos durante execução:**
1. **PARE** imediatamente — não force uma solução
2. **Comunique** ao usuário o que mudou
3. **Re-planeje** com as novas informações
4. **Nunca** continue empurrando uma abordagem que não está funcionando

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
- **Performance MongoDB:**
  - Usar `.lean()` em queries de leitura (retorna POJO, ~3x mais rápido)
  - Cache TTL padrão: Rodadas 5min, Rankings 10min, Configs 30min
  - Toda query DEVE incluir `liga_id` (multi-tenant — sem isso, dados de ligas se misturam)
- **SPA Init Pattern:** Páginas em `supportedPages` (layout.html) NUNCA devem usar `DOMContentLoaded` sozinho. O evento só dispara uma vez — na navegação SPA o DOM já está pronto e o listener nunca executa. Sempre usar:
```javascript
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // SPA: DOM já pronto, executar imediatamente
}
```

## 🔧 Correção Autônoma de Bugs

Quando receber um bug report: **resolva**. Não peça "me mostre o arquivo" ou "qual a rota?".

### Protocolo
1. **Investigar** — Grep logs, ler código, rastrear o fluxo, encontrar a causa raiz
2. **Corrigir** — Fix cirúrgico, mínimo impacto, seguindo S.A.I.S
3. **Verificar** — Testar que o fix funciona E não quebra nada (FASE 3.5)
4. **Reportar** — Resumo curto: o que era, onde estava, como foi corrigido

### Zero Context Switch
- O usuário **NÃO** deve precisar guiar você passo a passo
- Use as ferramentas (Grep, Glob, Read) para encontrar tudo sozinho
- Se testes/lint falham após seu fix, corrija sem esperar instrução
- **Exceção:** Decisões de negócio ou trade-offs arquiteturais exigem confirmação do usuário

## 🧱 Princípios de Engenharia

### Simplicidade Primeiro
- Cada mudança deve ser a **mais simples possível**. Impactar o mínimo de código.
- Não adicionar features, refatorar, ou "melhorar" além do pedido.
- 3 linhas similares são melhores que uma abstração prematura.
- Não adicionar docstrings, comments ou type annotations em código que não foi alterado.

### Causa Raiz, Não Paliativo
- Investigar até o **problema real**. Zero fixes temporários. Padrão senior developer.
- Não contornar problemas com hacks — resolver de verdade.
- Se o fix parece gambiarra, pausar e perguntar: _"existe uma solução mais elegante?"_
- Para mudanças não-triviais: desafiar o próprio trabalho antes de apresentar.

### Mudanças Cirúrgicas (Protocolo S.A.I.S)
Antes de QUALQUER alteração em arquivo existente:
1. **S**olicitar — Ler o arquivo original completo
2. **A**nalisar — Entender linha por linha
3. **I**dentificar — Mapear dependências (`grep -r "require.*arquivo"`, IDs CSS, rotas)
4. **A**lterar — Mudança mínima e focada no objetivo

**NUNCA:** Reescrever código funcional sem requisição explícita. Assumir melhorias sem pedido. Fazer múltiplas soluções para o mesmo problema.

### Autonomia Total na Investigação
- **NUNCA** pergunte "onde fica o arquivo?" ou "qual a rota?" — busque sozinho (Grep, Glob, Read).
- **NUNCA** ofereça opções quando pode investigar e resolver.
- Use as ferramentas disponíveis para encontrar tudo antes de perguntar ao usuário.
- **Exceção:** Decisões de negócio ou ambiguidade de requisito — aí sim, pergunte.

## 🎨 REGRA Nº 1 — Skill `frontend-design` (AUTORIDADE ESTÉTICA MÁXIMA)

> **Prioridade absoluta em qualquer decisão de design visual. Sobrepõe preferências genéricas. Respeita o design system do projeto.**

A skill `frontend-design` (documentada em `docs/skills/02-specialists/frontend-design.md`) define a **filosofia estética** de todas as telas do projeto. Sempre que o assunto envolver criação ou redesign de interface, ela é ativada **antes** de qualquer outra skill de frontend.

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

Tabela completa de keywords: [`docs/skills/SKILL-KEYWORD-MAP.md`](docs/skills/SKILL-KEYWORD-MAP.md)

### Anti-Frankenstein Protocol (Governança Frontend)
Antes de criar/modificar CSS/HTML: verificar `config/css-registry.json`, usar tokens, seguir convenções.

**Diretório:** `.claude/docs/PRD-[nome].md` e `SPEC-[nome].md`

## 🔌 MCPs Disponíveis

**Context7** (docs frameworks), **Perplexity** (pesquisa web), **Mongo MCP** (queries DB), **Stitch MCP** (design-to-code).
Detalhes de uso: consultar skill `project-reference` ou [`docs/skills/03-utilities/project-reference.md`](docs/skills/03-utilities/project-reference.md)

## 🎯 Slash Commands

Skills podem ser invocadas por `/nome` OU por keywords naturais na conversa.
Tabela completa de comandos e keywords: skill `project-reference` ou [`docs/skills/03-utilities/project-reference.md`](docs/skills/03-utilities/project-reference.md)

## 🔄 Sistema de Renovação de Temporada

**Documentação:** [`docs/SISTEMA-RENOVACAO-TEMPORADA.md`](docs/SISTEMA-RENOVACAO-TEMPORADA.md) | Detalhes: skill `project-reference`

**Conceitos-chave:** `ligarules` (config por liga), `inscricoestemporada` (registro), `pagouInscricao` (true=pago, false=vira debito)

## 🕐 Pré-Temporada

Periodo entre temporadas: API Cartola retorna ano anterior, sem rodadas. Detectar com `temporadaSelecionada > mercadoData.temporada`.

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
**Cuidado:** Collections usam tipos mistos (`time_id: Number` vs `timeId: String`). Detalhes: skill `project-reference`.

### Escudos
Localização: `/public/escudos/{clube_id}.png` — Fallback: `onerror="this.src='/escudos/default.png'"`

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

## ⚽ Jogos do Dia / 📦 Versionamento / 📝 Backlog

Detalhes destes sistemas: skill `project-reference` ou [`docs/skills/03-utilities/project-reference.md`](docs/skills/03-utilities/project-reference.md)

- **Jogos:** API-Football → SoccerDataAPI → Cache Stale → Globo Esporte. Docs: [`docs/JOGOS-DO-DIA-API.md`](docs/JOGOS-DO-DIA-API.md)
- **Versionamento:** `config/appVersion.js`, API `/api/app/check-version`
- **Backlog:** `BACKLOG.md` + TODOs no codigo (`// TODO-[LEVEL]`). CLI: `node scripts/backlog-helper.js`

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
5. EVERY MongoDB query MUST include `liga_id` filter (sistema multi-tenant — sem isso, dados de ligas se misturam)
6. EVERY read query SHOULD use `.lean()` unless document methods are needed (performance)
7. After ANY user correction → update `.claude/LESSONS.md` with the lesson learned

## 🔄 Loop de Auto-Aprendizado

### Regra
Após **QUALQUER** correção do usuário (erro, abordagem errada, padrão violado):

1. **Registrar** a lição em [`.claude/LESSONS.md`](.claude/LESSONS.md)
2. **Categorizar** — `DADOS`, `FRONTEND`, `LOGICA` ou `PROCESSO`
3. **Escrever regra** que previna o mesmo erro no futuro
4. **Revisar** lições no início de cada sessão nova

### Formato de Registro

```markdown
| Data | Categoria | Erro Cometido | Lição Aprendida | Regra Adicionada ao CLAUDE.md? |
```

### Escalação
- Se **3+ lições da mesma categoria** acumularem → propor nova regra no CLAUDE.md
- Se a lição é **crítica** (perda de dados, bug em produção) → adicionar imediatamente às Critical Rules

### Exemplos de Lições
| Categoria | Erro | Lição |
|-----------|------|-------|
| DADOS | Query sem `liga_id` retornou dados de outra liga | Sempre incluir `liga_id` em toda query MongoDB |
| FRONTEND | Usou emoji `⭐` em vez de Material Icon | Consultar tabela de ícones no CLAUDE.md antes de usar |
| LOGICA | Usou `.toFixed(2)` que arredonda pontos | Usar `truncarPontosNum()` — NUNCA arredondar pontos |
| PROCESSO | Começou a programar sem planejamento | FASE 1 é obrigatória, sem exceções |
