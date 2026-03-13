# SUPER CARTOLA MANAGER - PROJECT RULES

## Protocolo de Planejamento Obrigatório

NUNCA programe sem ANTES: planejar, listar tarefas (TodoWrite), questionar o usuário, aguardar aprovação.
Exceções: bypass explícito, tarefa trivial (1 ação), continuação de plano aprovado.

**Sub-passo obrigatório — Cruzamento com Skills:**
Ao listar tarefas no plano, cruzar CADA tarefa com [`SKILL-KEYWORD-MAP.md`](docs/skills/SKILL-KEYWORD-MAP.md).
Se QUALQUER tarefa envolve CSS/HTML/visual (mesmo "acessório" de feature backend) → incluir no plano:
- Ativar `anti-frankenstein` antes de escrever CSS (verificar `config/css-registry.json`, tokens, animações existentes)
- Ativar `frontend-design` se houver decisão estética (cores, layout, motion)
- Skills não ativadas no plano = skills que serão esquecidas na execução

Detalhes completos: [`docs/references/protocolo-planejamento.md`](docs/references/protocolo-planejamento.md)

## Tech Stack

Node.js (Replit) · MongoDB (Native Driver) · HTML5/CSS3/Vanilla JS (ES6 Modules) · TailwindCSS (CDN) · MVC

## Coding Standards

- Funções financeiras DEVEM ser idempotentes (prevenir double-charging)
- Validar `req.session.usuario` antes de ações sensíveis
- `try/catch` em todo controller async
- Pure JS no frontend — sem React/Vue
- Nomenclatura em português: `autorizado`, `usuario`, `senha`
- MongoDB: `.lean()` em leituras, cache TTL (Rodadas 5min, Rankings 10min, Configs 30min)
- **Toda query MongoDB DEVE incluir `liga_id`** (multi-tenant)
- SPA Init: nunca `DOMContentLoaded` sozinho — usar pattern `readyState === 'loading'` check
- Frontend admin: se arquivo carregado via `vImport()` → incrementar `ADMIN_JS_VERSION` em `detalhe-liga-orquestrador.js`

## UI/UX (resumo)

Dark mode estrito. Fontes: Russo One (títulos), Inter (corpo), JetBrains Mono (números).
Cores de módulos via variáveis CSS de `_admin-tokens.css` — NUNCA hardcoded.
Material Icons — NUNCA emojis no código.
Design visual: skill `frontend-design` tem autoridade estética máxima.
Detalhes completos: [`docs/references/ui-ux-guidelines.md`](docs/references/ui-ux-guidelines.md)

## Truncamento de Pontos

NUNCA arredondar pontos de participantes — sempre TRUNCAR.
Backend: `truncarPontosNum()` (utils/type-helpers.js). Frontend: `truncarPontos()` (participante-utils.js).
PROIBIDO: `.toFixed(2)`, `Math.round()`, `parseFloat(x.toFixed(2))`.
Detalhes e implementações: [`docs/references/truncar-pontos.md`](docs/references/truncar-pontos.md)

## Banco de Dados

Banco único `cartola-manager` (Atlas) — dev e prod no mesmo banco. Apenas `MONGO_URI` (MONGO_URI_DEV descontinuada).
Collection principal: `times` (NÃO `users`). IDs mistos entre collections.
Scripts destrutivos: exigir `--dry-run` ou `--force`.
Detalhes: [`docs/references/database-strategy.md`](docs/references/database-strategy.md)

## Sistema de Módulos

Controle: `Liga.modulos_ativos` (on/off) + `ModuleConfig` (granular).
REGRA CRÍTICA: módulos de premiação final (Artilheiro, Luva, Capitão, etc.) NUNCA geram campos por-rodada — entram como `tipo: "AJUSTE"` com `rodada: null`.
Detalhes: [`docs/references/sistema-modulos.md`](docs/references/sistema-modulos.md)

## Princípios de Engenharia

- **Simplicidade:** mudança mais simples possível, sem melhorias além do pedido
- **Causa raiz:** investigar o problema real, zero fixes temporários
- **S.A.I.S:** Solicitar (ler) → Analisar → Identificar dependências → Alterar (mínimo)
- **Autonomia:** NUNCA pergunte "onde fica o arquivo?" — busque sozinho (Grep, Glob, Read)
- **Exceção:** decisões de negócio ou ambiguidade de requisito — aí sim, pergunte

## Bug Fix Protocol

Recebeu bug? Resolva. Investigar → Corrigir (cirúrgico, S.A.I.S) → Verificar (FASE 3.5) → Reportar.
O usuário NÃO deve guiar passo a passo. Se teste/lint falhar após fix, corrija sem esperar instrução.

## Skills & Commands

Skills ativadas por keywords. Mapeamento: [`docs/skills/SKILL-KEYWORD-MAP.md`](docs/skills/SKILL-KEYWORD-MAP.md)
Pipeline design: frontend-design → anti-frankenstein → frontend-crafter
**Anti-Frankenstein é OBRIGATÓRIO antes de qualquer CSS/HTML novo** — mesmo 3 linhas. Verificar `config/css-registry.json`, reutilizar tokens/animações existentes, NUNCA cores hardcoded.
Commands: `/liste-pr-github` (filtro por período), `/security-review` (diff contra origin/HEAD), `/github-profile` (busca perfil GitHub por username)

## MCPs Disponíveis

Context7 (docs), Perplexity (pesquisa web), Mongo MCP (queries DB), Stitch MCP (design-to-code).
Detalhes: [`docs/skills/03-utilities/project-reference.md`](docs/skills/03-utilities/project-reference.md)

## Sistemas Auxiliares

- **Jogos do Dia:** API-Football → SoccerDataAPI → Cache Stale → Globo Esporte. Docs: [`docs/JOGOS-DO-DIA-API.md`](docs/JOGOS-DO-DIA-API.md)
- **Versionamento:** `config/appVersion.js`, API `/api/app/check-version`
- **Backlog:** `BACKLOG.md` + TODOs (`// TODO-[LEVEL]`). CLI: `node scripts/backlog-helper.js`
- **Renovação Temporada:** [`docs/SISTEMA-RENOVACAO-TEMPORADA.md`](docs/SISTEMA-RENOVACAO-TEMPORADA.md)
- **Pré-Temporada:** detectar com `temporadaSelecionada > mercadoData.temporada`

## Critical Rules

1. NEVER remove `gemini_audit.py`
2. NEVER break "Follow the Money" audit trail in financial controllers
3. Always check variable existence before accessing properties (avoid `undefined`)
4. NEVER round participant points — always TRUNCATE
5. EVERY MongoDB query MUST include `liga_id` filter (multi-tenant)
6. EVERY read query SHOULD use `.lean()` unless document methods are needed
7. After ANY user correction → update `.claude/LESSONS.md` with the lesson learned

## Auto-Aprendizado

Após correção do usuário: registrar em [`.claude/LESSONS.md`](.claude/LESSONS.md) (categorias: DADOS, FRONTEND, LOGICA, PROCESSO).
3+ lições da mesma categoria → propor nova regra. Lição crítica → adicionar às Critical Rules imediatamente.

## Referência Agnostic-Core

Base de conhecimento agnóstica integrada como submodule em `.agnostic-core/`.
Skills, agents e workflows reutilizáveis: [`.agnostic-core/README.md`](.agnostic-core/README.md)
