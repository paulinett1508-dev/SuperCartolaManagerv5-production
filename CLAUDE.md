# SUPER CARTOLA MANAGER - PROJECT RULES

## Protocolo de Planejamento Obrigatório

NUNCA programe sem ANTES: planejar, listar tarefas (TaskCreate), questionar o usuário, aguardar aprovação.
Exceções: bypass explícito, tarefa trivial (1 ação), continuação de plano aprovado.

**Sub-passo obrigatório — Cruzamento com Skills:**
Ao listar tarefas no plano, cruzar CADA tarefa com [`SKILL-KEYWORD-MAP.md`](docs/skills/SKILL-KEYWORD-MAP.md).
Se QUALQUER tarefa envolve CSS/HTML/visual (mesmo "acessório" de feature backend) → incluir no plano:
- Ativar `anti-frankenstein` antes de escrever CSS (verificar `config/css-registry.json`, tokens, animações existentes)
- Ativar `frontend-design` se houver decisão estética (cores, layout, motion)
- Skills não ativadas no plano = skills que serão esquecidas na execução

Detalhes completos: [`docs/references/protocolo-planejamento.md`](docs/references/protocolo-planejamento.md)

## Tech Stack

Node.js (Docker/VPS) · MongoDB (Native Driver) · HTML5/CSS3/Vanilla JS (ES6 Modules) · TailwindCSS (CDN) · MVC

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
- **Cache busting obrigatório:** ao criar ou modificar CSS significativamente, incrementar `?v=X` no `<link>` correspondente em `index.html`. CSS sem `?v=` em PROD = bug invisível (browser serve versão antiga)
- **Seletores CSS descendentes + DOM injetado:** antes de usar `.parent .child {}`, verificar se o child está realmente dentro do parent na árvore DOM. Elementos injetados via JS (`insertBefore`, `prepend`) podem estar fora do container esperado — preferir toggle via JS direto

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
Pipeline design: `frontend-design` → `anti-frankenstein` → `frontend-crafter`
**Anti-Frankenstein é OBRIGATÓRIO antes de qualquer CSS/HTML novo** — mesmo 3 linhas. Verificar `config/css-registry.json`, reutilizar tokens/animações existentes, NUNCA cores hardcoded.
**Skill antes de ação — SEMPRE:** Bug report → `systematic-debugging`. CSS/HTML → `anti-frankenstein`. Decisão visual → `frontend-design`. NUNCA racionalizar "é simples" ou "deixa investigar primeiro" para pular skill. (3 ocorrências de skill ignorada levaram a bugs em PROD)
Commands: `/liste-pr-github` (filtro por período), `/security-review` (diff contra origin/HEAD), `/github-profile` (busca perfil GitHub por username)

### Catálogo de Skills Instaladas

**Workflow / Processo**
- `workflow` — Maestro do protocolo Pesquisa → Spec → Code; detecta fase automaticamente
- `pesquisa` — Fase 1: busca autônoma no codebase, gera PRD.md
- `spec` — Fase 2: lê PRD.md, mapeia dependências, gera Spec.md
- `code` — Fase 3: lê Spec.md, aplica mudanças cirúrgicas linha por linha
- `newsession` — Handover entre sessões; carrega contexto do trabalho em andamento
- `fact-checker` — Anti-alucinação: valida afirmações antes de responder
- `ai-problems-detection` — Detecta overengineering, duplicação, reinvenção da roda
- `post-implementation-conformity` — Auditoria cruzada entre código implementado e plano

**Frontend / UI**
- `frontend-design` — Autoridade estética máxima; cria interfaces de alta qualidade
- `anti-frankenstein` — Guardião de CSS/HTML; previne duplicação e cores hardcoded
- `frontend-crafter` — Especialista mobile-first, SPA, cache offline, navegação
- `stitch-adapter` — Adapta HTML externo (Stitch/outro) ao design system do projeto
- `tailwind-patterns` — Padrões e boas práticas de TailwindCSS no projeto
- `ui-ux-quality-gates` — 5 Quality Gates de validação de interface
- `ux-auditor-app` — Auditoria completa UI/UX/CSS do app participante (PWA)
- `theme-factory` — Toolkit de temas para artefatos (slides, docs, landing pages)
- `webapp-testing` — Testa app local com Playwright; captura screenshots e logs

**Backend / API / Segurança**
- `express-best-practices` — Padrões Express: middleware, CORS, rate limit, controllers
- `api-hardening` — Hardening de APIs: auth, validação, headers, injection, sessions
- `error-handling` — Hierarquia de erros, middleware centralizado, logging seguro
- `financial-operations` — Operações financeiras seguras: idempotência, audit trail, atomicidade
- `cartola-api` — Base de conhecimento de todas as APIs públicas do Cartola FC

**Banco de Dados**
- `db-guardian` — Operações seguras MongoDB: migrations, backup, indexes, integridade

**Performance / Cache**
- `performance-audit` — Auditoria de queries, N+1, cache, payload, benchmarks
- `cache-auditor` — Auditoria completa da infraestrutura de cache dos 3 ambientes
- `cache-sentinel` — Monitoramento proativo de caches stale no app participante

**Arquitetura / Qualidade**
- `architecture-reviewer` — Revisão de decisões arquiteturais: multi-tenant, módulos, API
- `system-scribe` — Documentador oficial; explica como o sistema funciona baseado no código
- `refactor-monolith` — Decomposição segura de arquivos monolíticos com zero quebra
- `code-inspector` — Auditoria senior: arquitetura, segurança, performance, observabilidade
- `auditor-module` — Auditoria automatizada de módulos: segurança, UI, performance, financeiro

**Módulos de Negócio**
- `league-architect` — Regras de liga, formatos SaaS, lógica financeira, premiações
- `live-experience` — Auditoria da experiência durante rodadas ao vivo
- `systematic-debugging` — Debugging em 4 fases: reproduzir, isolar, entender, corrigir
- `context7-monthly-audit` — Auditoria mensal via Context7: mudanças de API, deprecations

**Utilitários / DevOps**
- `git-commit-push` — Commits e pushes automatizados com mensagens descritivas
- `delete-merged-branches` — Higienização de branches remotas já mergeadas
- `skill-analise-branches` — Análise de branches do GitHub
- `skill-creator` — Cria, edita e avalia skills
- `skill-installer` — Instala skills de lista curada ou repositório GitHub
- `project-reference` — Referência do projeto: MCPs, collections, keyword map
- `claude-code-project-structure` — Audita e reorganiza a estrutura Claude Code do projeto (`.claude/`, CLAUDE.md, hooks, skills, Migration Mode)

**Agnostic-Core — Skills Genéricas (via `.agnostic-core/`)**
- `unit-testing` — Padrão AAA, coverage 80%+, mocking, casos de borda
- `integration-testing` — Banco isolado, testes de API, contratos
- `tdd-workflow` — Ciclo Red-Green-Refactor, quando aplicar TDD
- `e2e-testing` — Pirâmide de testes, Playwright, smoke tests pós-deploy
- `owasp-checklist` — OWASP Top 10 com exemplos de correção por categoria
- `observabilidade` — Logs estruturados, métricas RED/USE, tracing, alertas
- `pre-deploy-checklist` — Checklist obrigatório antes de qualquer deploy
- `deploy-procedures` — 5 fases de deploy: rollback, zero-downtime, smoke tests
- `commit-conventions` — Conventional Commits: tipos, breaking changes, commitlint
- `branching-strategy` — Trunk-based vs GitFlow, nomenclatura, proteção de branch
- `model-routing` — Qual modelo Claude usar: Opus/Sonnet/Haiku por tipo de tarefa
- `context-management` — Context rot, contextos frescos, handover protocol
- `goal-backward-planning` — Goal→Truths→Artifacts, waves, checkpoint protocol
- `gestao-de-incidentes` — Detecção, contenção, resolução e post-mortem de incidentes
- `nodejs-patterns` — MVC, graceful shutdown, env validation, connection pooling
- `pre-implementation` — Verificar duplicação e solução mais simples antes de implementar
- `query-compliance` — Queries seguras, índices, injection prevention, transações
- `schema-design` — Modelagem MongoDB, normalização, migrations seguras
- `rest-api-design` — Nomenclatura de rotas, HTTP methods, status codes, paginação
- `caching-strategies` — Camadas L1-L3, cache-aside, TTL, invalidação, Redis keys
- `accessibility` — WCAG 2.1 AA: contraste, teclado, ARIA, formulários

**Agents Disponíveis (.claude/agents/)**
- `security-reviewer` — Revisão de segurança com severidades CRITICA/ALTA/MEDIA/BAIXA
- `frontend-reviewer` — Revisão HTML/CSS/JS com WCAG 2.1 AA e UX guidelines
- `test-reviewer` — Coverage, design de testes, status APROVADO/BLOQUEAR
- `performance-reviewer` — N+1, índices, cache ausente, prioridade por ROI
- `codebase-mapper` — Gera STACK.md, ARCHITECTURE.md, CONVENTIONS.md, CONCERNS.md
- `migration-validator` — Reversibilidade, destrutividade, status APROVADO/AJUSTAR/BLOQUEAR
- `docs-generator` — README, ADR, CHANGELOG, OpenAPI a partir do código
- `database-architect` — Schema design, seleção de plataforma/ORM, índices, migrations
- `devops-engineer` — Deploy, infraestrutura, rollback, zero-downtime, emergência

**Slash Commands (.claude/commands/)**
- `/brainstorm` — Explorar opções antes de implementar
- `/debug` — Investigação sistemática de bugs
- `/deploy` — Processo de deploy seguro e verificável
- `/security-review` — Security review diff-aware do branch atual
- `/liste-pr-github` — Listar PRs do GitHub por período
- `/github-profile` — Busca perfil GitHub por username

## MCPs Disponíveis

Context7 (docs), Perplexity (pesquisa web), Mongo MCP (queries DB), Stitch MCP (design-to-code).
Detalhes: [`docs/skills/03-utilities/project-reference.md`](docs/skills/03-utilities/project-reference.md)

## Pontos Corridos (REGRA CRÍTICA)

Liga com número **ímpar** de times usa sistema de BYE: um time folga por rodada, rotacionando deterministicamente. Time com BYE: `jogos` NÃO é incrementado, pontos/financeiro não alteram.
`rodadaInicial` SEMPRE lido de `liga.configuracoes.pontos_corridos.rodadaInicial` (não de raw `db.collection('moduleconfigs')`).
Participante adicionado após bracket gerado → caches com N-1 times, NUNCA regenerados automaticamente → bracket errado para todos. Detectar divergência e forçar regeneração.
Detalhes: [`docs/references/pontos-corridos.md`](docs/references/pontos-corridos.md)

## Resta Um (REGRA CRÍTICA)

Módulo de eliminação **rodada a rodada** — cada rodada é independente.
SEMPRE exibir e ordenar por `pontosRodada` DESC (live e consolidado). `pontosAcumulados` é apenas metadado de desempate.
Eliminados preservam `pontosRodada` da rodada de eliminação.
Detalhes: [`docs/references/resta-um.md`](docs/references/resta-um.md)

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
8. **PC módulo — algoritmo canônico é `gerarBracket` (rotação), NUNCA fórmula de offset.** O algoritmo existe em 4 locais que DEVEM permanecer sincronizados: `pontosCorridosCacheController.js` (gerarBracketFromIds), `fluxoFinanceiroController.js` (_gerarBracketPC), `scripts/regenerar-bracket-pontos-corridos.js` (gerarBracket), `public/js/pontos-corridos/pontos-corridos-orquestrador.js` (gerarBracketDeIDs). Usar fórmula de offset `(meuIndex + rodadaLiga) % totalTimes` produz confrontos errados e pode causar empates fictícios (+3) em ligas sem empate.

## Auto-Aprendizado

Após correção do usuário: registrar em [`.claude/LESSONS.md`](.claude/LESSONS.md) (categorias: DADOS, FRONTEND, LOGICA, PROCESSO).
3+ lições da mesma categoria → propor nova regra. Lição crítica → adicionar às Critical Rules imediatamente.

## Referência Agnostic-Core

Base de conhecimento agnóstica em `.agnostic-core/` (submodule de `paulinett1508-dev/agnostic-core`).
Skills, agents e workflows reutilizáveis: [`.agnostic-core/README.md`](.agnostic-core/README.md)

Skills instaladas em `.claude/skills/` a partir do agnostic-core (21 novas skills).
Agents disponíveis em `.claude/agents/` (9 agentes especializados).
Guia de integração: [`.agnostic-core/docs/integration-guide.md`](.agnostic-core/docs/integration-guide.md)
Roteamento de agents: [`.agnostic-core/docs/agent-routing-guide.md`](.agnostic-core/docs/agent-routing-guide.md)
