# SUPER CARTOLA MANAGER - PROJECT RULES

## Orquestração do Fluxo de Trabalho

Índice das 6 práticas que disciplinam toda sessão neste repo. Detalhes nas seções referenciadas — este bloco é apenas o mapa.

1. **Modo de Planejamento (padrão).** Plan mode obrigatório para qualquer tarefa não trivial (3+ etapas ou decisão arquitetural). Especificações detalhadas antecipadas reduzem ambiguidade. Plan mode também para verificação, não só construção. Se algo der errado durante a execução, PARE e replanejeje. Detalhes: §"Protocolo de Planejamento Obrigatório".
2. **Estratégia de Subagentes.** Use subagents liberalmente para preservar a janela de contexto principal — pesquisa, exploração e análise paralela. Uma tarefa por subagent, prompt auto-contido. Detalhes: §"Uso de Subagents".
3. **Verificação Antes de Concluir.** Nunca marque done sem provar — diff, log, teste, screenshot. *"Um senior engineer aprovaria esse diff?"* Se não puder verificar, declare explicitamente em vez de afirmar sucesso. Detalhes: §"Verificação antes de Concluir".
4. **Exigência de Elegância (balanceada).** Mudanças que tocam 3+ arquivos: pause e pergunte "há solução mais elegante?". Pule isso para fixes simples e óbvios — não over-engenheirar. Detalhes: §"Elegância (features não-triviais)".
5. **Correção de Bugs Autônoma.** Recebeu bug? Resolva. Persiga logs/erros/testes falhando até a causa raiz. Zero troca de contexto exigida do usuário. Detalhes: §"Bug Fix Protocol".
6. **Loop de Auto-aperfeiçoamento.** Após qualquer correção do usuário: registre o padrão em `.claude/LESSONS.md` com regra concreta que previna a repetição. Revisar no início de cada sessão. Detalhes: §"Auto-Aprendizado".

<!-- BEGIN agnostic-core/response-contract -->
@.agnostic-core/skills/communication/response-contract.md
<!-- END agnostic-core/response-contract -->

## Auditoria de Interface — Protocolo Menos é Mais

Antes de revisar qualquer frontend, carregar:

@https://raw.githubusercontent.com/paulinett1508-dev/agnostic-core/main/skills/ux-ui/navegacao-sem-redundancia.md
@https://raw.githubusercontent.com/paulinett1508-dev/agnostic-core/main/skills/frontend/menos-e-mais.md

Aplicar sempre que: componente novo, PR de frontend, reclamação de "tela poluída".

## Protocolo de Planejamento Obrigatório

NUNCA programe sem ANTES: planejar, listar tarefas (TaskCreate), questionar o usuário, aguardar aprovação.
Exceções: bypass explícito, tarefa trivial (1 ação), continuação de plano aprovado.

**Sub-passo obrigatório — Cruzamento com Skills:**
Ao listar tarefas no plano, cruzar CADA tarefa com a skill `skill-router` (invocar via `/skill-router` para obter o mapeamento de keywords → skills).
Se QUALQUER tarefa envolve CSS/HTML/visual (mesmo "acessório" de feature backend) → incluir no plano:
- Ativar `anti-frankenstein` antes de escrever CSS (verificar `config/css-registry.json`, tokens, animações existentes)
- Ativar `frontend-design` se houver decisão estética (cores, layout, motion)
- Skills não ativadas no plano = skills que serão esquecidas na execução
- **Plan mode também para verificação, não só construção.** Especificações detalhadas antecipadas reduzem ambiguidade — invista em escopo claro antes de codar. Se algo der errado durante a execução, PARE e replanejeje imediatamente
- Skills relacionadas: `goal-backward-planning` (Goal→Truths→Artifacts), `workflow` (maestro Pesquisa→Spec→Code), `pre-implementation` (checklist anti-duplicação)

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
- **NUNCA `alert()` nativo do browser** — usar toasts do design system: `window.ErrorToast.show(msg, { tipo, duracao })` (app participante) ou equivalente no admin. `alert()` é visual amador e quebra a experiência dark mode
- **Honestidade técnica:** se não pode verificar (UI sem dev server, ambiente externo indisponível, dependência ausente) — declare explicitamente em vez de afirmar sucesso. Type check e suíte de testes verificam corretude do código, não corretude da feature

## UI/UX (resumo)

Dark + Light mode (toggle em Configurações, `[data-theme="light"]`). Fontes: Russo One (títulos), Inter (corpo), JetBrains Mono (números).
Cores de módulos via variáveis CSS de `_admin-tokens.css` (admin) e `_app-tokens.css` (app) — NUNCA hardcoded.
Material Icons — NUNCA emojis no código.
**Module Strip 56px** — header padrão de todos os módulos do app participante (accent border + icon + título). Detalhes: [`docs/references/redesign-modulos-v2.md`](docs/references/redesign-modulos-v2.md)
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

## Bug Fix Protocol

Recebeu bug? Resolva. Investigar → Corrigir (cirúrgico, S.A.I.S) → Verificar (FASE 3.5) → Reportar.
O usuário NÃO deve guiar passo a passo. Se teste/lint falhar após fix, corrija sem esperar instrução.
**Zero troca de contexto exigida do usuário** — persiga logs, mensagens de erro e testes falhando até a causa raiz. Skill: `audit-systematic-debugging` (4 fases: reproduzir, isolar, entender com 5 Porquês, corrigir).

## Uso de Subagents

- Use subagents para pesquisa, exploração e análise paralela — mantém o contexto principal limpo
- Offload investigação de codebase, leitura de logs e tarefas independentes para subagents
- Uma tarefa por subagent para execução focada; prefira paralelismo a execução sequencial
- Para problemas complexos: jogue mais compute via subagents antes de travar o contexto principal
- **Prompt auto-contido:** o subagent não vê o histórico desta sessão — inclua todo contexto necessário (paths exatos, snippets relevantes, restrições, formato esperado de resposta)
- **Use subagents liberalmente** para preservar a janela de contexto principal — leituras grandes, varreduras amplas e análises paralelas devem rodar em subagent

## Verificação antes de Concluir

- Nunca marque tarefa como concluída sem provar que funciona (diff, log, teste, screenshot)
- Checagem mental obrigatória: *"Um senior engineer aprovaria esse diff?"*
- Aplica-se a features e refactors — não apenas ao Bug Fix Protocol
- Se algo parece incerto: demonstre a correção, não apenas afirme
- **Se não puder verificar** (UI sem dev server, ambiente externo, dependência indisponível) — declare explicitamente em vez de afirmar sucesso. Type checks e testes provam corretude do código, não corretude da feature em PROD

## Elegância (features não-triviais)

- Para mudanças que tocam 3+ arquivos: pause e pergunte "há solução mais elegante?"
- Se a solução parece hack: "sabendo tudo o que sei agora, qual é a implementação elegante?"
- **Exceção obrigatória:** fixes simples e óbvios — não over-engenheirar, não buscar elegância onde ela não agrega

## Skills & Commands

Skills ativadas por keywords. Roteamento automático via skill `skill-router` — invocar para mapear tarefa → skill correta
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
- `autoresearch` — Loop autônomo de experimentação ML (karpathy/autoresearch)
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
Detalhes: skill `project-reference` (`.claude/skills/project-reference/SKILL.md`)

**Mongo MCP Remoto (Claude Code Web):**
No CCW, o Mongo MCP está disponível como conector HTTP em `https://supercartolamanager.com.br/mcp-mongo/mcp`.
Ferramentas: `list_collections`, `find_documents`, `get_collection_schema`, `insert_document`.
Container: `scm-mcp` (Docker, porta 3099 interna). Antes de qualquer código que toque dados → consultar este MCP.
Token e URL completa: ver `MCP_SECRET_TOKEN` no `.env.prod` da VPS.

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

## Setup & Clone

Após qualquer clone: `npm run setup` → preencher `.env` e `.mcp.json` → `npm run dev`.
Detalhes completos: [`docs/references/setup-clone.md`](docs/references/setup-clone.md)

## Deploy (GitHub Actions → VPS)

Push para `main` dispara deploy automático via `.github/workflows/main.yml`:
1. **Test:** `npm ci` + validação básica (Ubuntu, Node 20)
2. **Deploy:** SSH na VPS → `git pull origin main` → `docker compose build scm-prod` → `docker compose up -d scm-prod`
3. **Diretório VPS:** `/var/www/cartola`

**Outros pipelines:**
- `deploy-staging.yml`: push para `develop` → deploy em `/opt/super-cartola-manager` (container `scm-staging`)
- `deploy-production.yml`: tags `v*` → deploy em `/opt/super-cartola-manager` (container `scm-prod`)

**REGRA:** Após merge para `main`, o deploy é AUTOMÁTICO. Não precisa de ação manual na VPS.
Sempre verificar aba Actions no GitHub após push para confirmar sucesso do pipeline.
Após deploy, sugerir **Ctrl+Shift+R** no navegador para limpar cache do frontend.

## Git Auto-Push Workflow

Hook `PostToolUse` (`.claude/hooks/post-tool-use-autopush`) faz push automático após cada `git commit` via Bash tool.

- **NÃO faça `git push` manual** — o hook cuida automaticamente
- Deploy é via **GitHub Actions → VPS Docker** (não Vercel). Push para `main` = deploy automático
- Retry com backoff exponencial (2s/4s/8s/16s, até 4 tentativas) em falha de rede
- O hook só ativa quando `tool_name == Bash` e o comando contém `git commit`

## Gerenciamento de Tarefas

Adaptação do ritual de `tasks/todo.md` à infraestrutura JÁ existente neste projeto — não criar diretório novo:

- **Plano primeiro:** Plan Mode é forçado por [`.claude/hooks/session-start-planning-enforcer`](.claude/hooks/session-start-planning-enforcer) e [`.claude/hooks/pre-tool-use-planning-gate`](.claude/hooks/pre-tool-use-planning-gate). Plan files vão para `/root/.claude/plans/<slug>.md` — verifique o plano antes de iniciar
- **Tracking em sessão:** `TodoWrite` com itens `pending`/`in_progress`/`completed`. Apenas UMA task `in_progress` por vez. Marcar `completed` IMEDIATAMENTE ao terminar — nunca em lote
- **Backlog persistente:** [`BACKLOG.md`](BACKLOG.md), priorizado CRÍTICO/ALTA/MÉDIA/BAIXA. CLI: `node scripts/backlog-helper.js`
- **Lições aprendidas:** [`.claude/LESSONS.md`](.claude/LESSONS.md) (NÃO `tasks/lessons.md` — o projeto já tem o seu, em formato tabular). Atualizar após CADA correção do usuário
- **Resumo de alto nível** em cada checkpoint (PR, fim de fase, fim de sessão) + seção "Revisão" no final do plan file

## Princípios Básicos

- **Simplicidade:** mudança mais simples possível, sem melhorias além do pedido
- **Causa raiz:** investigar o problema real, zero fixes temporários ou paliativos
- **Impacto mínimo:** toque só no necessário; sem efeitos colaterais ou refactor oportunista
- **Sem over-engineering:** nada de features/abstrações/error handling que a tarefa não pediu
- **Honestidade técnica:** se não pode verificar, declare; nunca finja sucesso
- **S.A.I.S:** Solicitar (ler) → Analisar → Identificar dependências → Alterar (mínimo)
- **Autonomia:** NUNCA pergunte "onde fica o arquivo?" — busque sozinho (Grep, Glob, Read)
- **Exceção:** decisões de negócio ou ambiguidade de requisito — aí sim, pergunte

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

Após correção do usuário: registrar em [`.claude/LESSONS.md`](.claude/LESSONS.md) (categorias: DADOS, FRONTEND, LOGICA, PROCESSO) com regra concreta que previna a repetição do erro.
3+ lições da mesma categoria → propor nova regra. Lição crítica → adicionar às Critical Rules imediatamente.
**Revisar `.claude/LESSONS.md` no início de cada sessão** (a skill `newsession` faz handover automático carregando contexto e lições recentes).

## Referência Agnostic-Core

Base de conhecimento agnóstica em `.agnostic-core/` (submodule de `paulinett1508-dev/agnostic-core`).
Skills, agents e workflows reutilizáveis: [`.agnostic-core/README.md`](.agnostic-core/README.md)

Skills instaladas em `.claude/skills/` a partir do agnostic-core (21 novas skills).
Agents disponíveis em `.claude/agents/` (9 agentes especializados).
Guia de integração: [`.agnostic-core/docs/integration-guide.md`](.agnostic-core/docs/integration-guide.md)
Roteamento de agents: [`.agnostic-core/docs/agent-routing-guide.md`](.agnostic-core/docs/agent-routing-guide.md)

> ⚠️ Se `.agnostic-core/` estiver vazio em algum clone (submódulo não inicializado), rodar `git submodule update --init --recursive`. As skills críticas estão também espelhadas em `.claude/skills/` (162 skills) e podem ser usadas diretamente sem o submódulo.
