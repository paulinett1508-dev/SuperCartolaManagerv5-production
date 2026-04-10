---
name: skill-router
description: Roteador inteligente de skills. Dado o input do usuário, analisa keywords, detecta contexto e retorna as skills corretas a ativar — na ordem correta. Keywords: skill-router, qual skill usar, roteamento de skill, ativar skill, detectar skill, keyword map
trigger:
  - skill-router
  - qual skill usar
  - qual skill ativar
  - roteamento de skill
  - qual skill devo usar
  - que skill usar aqui
  - keyword map
---

# Skill Router — Roteador Inteligente de Skills

**Papel:** Analisar o input do usuário, mapear keywords para skills corretas e retornar as skills a ativar com a sequência adequada.

---

## Protocolo de Execução

Ao ser invocado (ou antes de qualquer ação significativa), executar:

1. **Extrair keywords** da mensagem do usuário — palavras-chave primárias, frases em PT-BR, contexto implícito
2. **Consultar o mapeamento abaixo** para encontrar skills correspondentes
3. **Resolver conflitos** por prioridade (ver regras)
4. **Retornar** lista de skills a ativar, na sequência correta
5. **Ativar** carregando o `.md` da skill identificada antes de prosseguir

### Regras de Resolução de Conflitos

- **Match exato** (keyword primária) > **match contextual** (frase PT-BR) > **contexto implícito**
- Se 2+ skills matcham com mesma prioridade → skill de categoria mais específica vence: `04-project` > `02-specialists` > `03-utilities`
- Se ambiguidade persiste → perguntar ao usuário qual ação deseja

### Ativações Automáticas (sem perguntar)

| Gatilho | Skill obrigatória |
|---------|-------------------|
| Qualquer CSS/HTML novo ou modificado | `anti-frankenstein` ANTES |
| Bug report, erro, crash, tela quebrada | `systematic-debugging` |
| Decisão visual / redesign / nova tela | `frontend-design` ANTES |
| Início de feature nova complexa | `workflow` |
| Antes de escrever código novo significativo | `ai-problems-detection` |

---

## Mapeamento Completo Keywords → Skills

### 01 — Core Workflow

#### workflow
- **Keywords primárias:** `workflow`, `high senior protocol`, `qual fase`, `iniciar sessão de trabalho`, `começar desenvolvimento`
- **Frases PT-BR:** "como fazer essa feature", "preciso implementar", "por onde começar", "iniciar protocolo", "qual a fase atual"
- **Contexto:** Início de sessão, planejamento de features complexas, dúvida sobre qual passo seguir
- **Localização:** `docs/skills/01-core-workflow/workflow.md`

#### pesquisa
- **Keywords primárias:** `pesquisa`, `pesquisar`, `PRD`, `research`, `mapear codebase`, `levantar requisitos`
- **Frases PT-BR:** "analise o código", "gere um PRD", "faça o levantamento", "pesquise no projeto", "mapeie os arquivos", "entenda o contexto", "fase 1"
- **Contexto:** Nova tarefa sem PRD, necessidade de entender escopo antes de implementar
- **Localização:** `docs/skills/01-core-workflow/pesquisa.md`

#### spec
- **Keywords primárias:** `spec`, `especificação`, `especificar`, `SPEC`, `mudanças cirúrgicas`, `dependências`
- **Frases PT-BR:** "mapeie as dependências", "defina as mudanças", "crie a spec", "especifique linha por linha", "planeje as alterações", "fase 2"
- **Contexto:** PRD já existe, precisa transformar em plano técnico
- **Localização:** `docs/skills/01-core-workflow/spec.md`

#### code
- **Keywords primárias:** `implementar`, `implementação`, `aplicar mudanças`, `executar spec`, `codificar`
- **Frases PT-BR:** "aplique as mudanças", "implemente a spec", "execute a implementação", "desenvolva o código", "fase 3", "hora de codar"
- **Contexto:** SPEC já existe, pronto para aplicar mudanças no código
- **NAO confundir:** Pedidos genéricos de "escrever código" sem SPEC prévia → usar `workflow` primeiro
- **Localização:** `docs/skills/01-core-workflow/code.md`

---

### 02 — Specialists (Especialistas Técnicos)

#### frontend-design
- **Keywords primárias:** `frontend-design`, `design visual`, `autoridade estética`, `criar interface`, `redesign`, `nova tela`, `nova home`, `landing`, `dashboard`
- **Frases PT-BR:** "redesenhar tela", "melhorar visual", "deixar bonito", "modernizar interface", "visual do app", "estilizar", "UX premium", "dark mode", "paleta de cores", "tipografia", "animação", "motion"
- **Contexto:** Criação ou redesign de interfaces. Ativada ANTES de qualquer outra skill de frontend quando o assunto envolve design visual
- **Prioridade:** MAXIMA — sobrepõe `frontend-crafter` em decisões estéticas
- **Localização:** `docs/skills/02-specialists/frontend-design.md`

#### dead-code-auditor
- **Keywords primárias:** `dead code`, `código órfão`, `código morto`, `arquivo não usado`, `função não chamada`, `script órfão`, `dependência não usada`, `vasculhar codebase`, `limpar codebase`, `orphan code`
- **Frases PT-BR:** "tem código morto?", "vasculha o código", "quais arquivos não são usados", "limpa o que não é mais usado", "tem imports não usados?", "tem função que ninguém chama?", "audita o que é orfão", "remove o que está órfão", "tem script sem uso?"
- **Contexto:** Limpeza de codebase, refactor, pré-release, redução de debt técnico, auditoria de dependências
- **NAO confundir:** Auditoria de qualidade geral → `code-inspector`; Refatorar arquivo grande → `refactor-monolith`
- **Localização:** `.claude/skills/dead-code-auditor/SKILL.md`

#### code-inspector
- **Keywords primárias:** `auditar código`, `code review`, `auditoria de código`, `security review`, `OWASP`, `inspeção`, `inspecionar código`
- **Frases PT-BR:** "revise o código", "análise de segurança", "verifique vulnerabilidades", "débito técnico", "qualidade do código", "auditoria profunda", "code audit"
- **Contexto:** Revisão pós-implementação, análise de segurança, troubleshooting, dívida técnica
- **NAO confundir:** Auditoria de módulo específico → `auditor-module`; Auditoria de cache → `cache-auditor`; Código órfão/morto → `dead-code-auditor`
- **Localização:** `docs/skills/02-specialists/code-inspector.md`

#### db-guardian
- **Keywords primárias:** `migration`, `banco de dados`, `MongoDB`, `backup`, `snapshot`, `limpeza de dados`, `índices`, `schema`
- **Frases PT-BR:** "script de banco", "limpar collection", "fazer backup", "criar índice", "validar schema", "manutenção do banco", "otimizar queries", "dados corrompidos", "recovery"
- **Contexto:** Operações no MongoDB, manutenção de dados, migrations, scripts de limpeza
- **NAO confundir:** Consultas rápidas de dados → usar MongoDB MCP diretamente
- **Localização:** `docs/skills/02-specialists/db-guardian.md`

#### frontend-crafter
- **Keywords primárias:** `frontend`, `tela`, `UI`, `UX`, `CSS`, `componente`, `interface`, `layout`, `design`, `mobile-first`
- **Frases PT-BR:** "criar tela", "ajustar CSS", "consertar layout", "navegação SPA", "componente visual", "responsivo", "dark mode", "estilizar", "botão", "modal", "formulário", "menu"
- **Contexto:** Criação/ajuste de interfaces, styling, componentes visuais, PWA frontend
- **NAO confundir:** Cache de frontend → `cache-auditor`; Lógica de negócio em tela → `league-architect`
- **Localização:** `docs/skills/02-specialists/frontend-crafter.md`

#### league-architect
- **Keywords primárias:** `regra de negócio`, `regras`, `liga`, `configuração de liga`, `cálculo financeiro`, `premiação`, `punição`, `formato de disputa`
- **Frases PT-BR:** "como calcular", "regra do mata-mata", "configurar liga", "taxa de inscrição", "parcelamento", "multa", "pontuação", "classificação", "fórmula", "extrato financeiro"
- **Contexto:** Definição/ajuste de regras de negócio, cálculos financeiros, formatos de competição
- **NAO confundir:** Implementar regra já definida → `code`; UI de regras → `frontend-crafter`
- **Localização:** `docs/skills/02-specialists/league-architect.md`

#### system-scribe
- **Keywords primárias:** `explicar`, `como funciona`, `documentar`, `wiki`, `ensinar`, `guia`
- **Frases PT-BR:** "explique o módulo", "como funciona o sistema de", "documente essa feature", "quais as regras de", "me ensine como", "o que faz o", "descreva o fluxo de"
- **Contexto:** Entender sistema existente, documentação, aprendizado sobre módulos
- **NAO confundir:** Gerar PRD (pesquisa) != explicar sistema (system-scribe)
- **Localização:** `docs/skills/02-specialists/system-scribe.md`

#### anti-frankenstein
- **Keywords primárias:** `anti-frankenstein`, `anti-frank`, `modo anti-frank`, `blindar frontend`, `governança CSS`, `validar CSS`, `antes de criar CSS`, `já existe?`, `css registry`
- **Frases PT-BR:** "ative modo anti-frank", "já existe esse componente?", "antes de criar esse CSS", "tem algum CSS parecido?", "vou criar um novo arquivo CSS", "checar se já existe", "posso criar arquivo CSS?", "validar criação frontend", "governança de frontend"
- **Contexto:** Checkpoint PREVENTIVO obrigatório antes de criar/modificar CSS, HTML, inline styles ou componentes visuais
- **Ativação automática:** ANTES de qualquer criação de CSS/HTML
- **NAO confundir:** Criar tela nova → `frontend-crafter` (mas anti-frankenstein roda ANTES)
- **Localização:** `docs/skills/02-specialists/anti-frankenstein.md`

#### financial-operations
- **Keywords primárias:** `operação financeira`, `idempotência`, `auditoria financeira`, `saldo`, `extrato`, `follow the money`, `transação financeira`, `débito`, `crédito`
- **Frases PT-BR:** "validar operação financeira", "checar idempotência", "auditoria do extrato", "follow the money", "operação de saldo", "transação duplicada?", "race condition no saldo", "atomic operation"
- **Contexto:** Revisão ou criação de código que movimenta saldo, cria transações financeiras
- **NAO confundir:** Regras de negócio de premiação → `league-architect`
- **Localização:** `docs/skills/02-specialists/financial-operations.md`

#### express-best-practices
- **Keywords primárias:** `express`, `middleware`, `rotas`, `controller`, `CORS`, `rate limit`, `ordem de middleware`, `service layer`
- **Frases PT-BR:** "ordem dos middlewares", "separar controller e service", "configurar CORS", "rate limiting", "error handler middleware", "estrutura Express", "padronizar rotas"
- **Contexto:** Criação ou revisão de rotas, controllers, middlewares Express
- **NAO confundir:** Segurança de endpoint → `api-hardening`; Performance → `performance-audit`
- **Localização:** `docs/skills/02-specialists/express-best-practices.md`

#### api-hardening
- **Keywords primárias:** `hardening`, `endpoint seguro`, `validação de input`, `segurança de API`, `proteger endpoint`, `blindar API`, `injection`, `IDOR`
- **Frases PT-BR:** "endpoint tá seguro?", "validar input", "proteger contra injection", "blindar endpoint", "verificar autenticação de rota", "prevenir IDOR", "sanitizar input"
- **Contexto:** Criação de novos endpoints, revisão de segurança de rotas existentes, hardening pré-deploy
- **NAO confundir:** Auditoria completa → `code-inspector`; Padrões Express → `express-best-practices`
- **Localização:** `docs/skills/02-specialists/api-hardening.md`

#### performance-audit
- **Keywords primárias:** `performance`, `lento`, `otimizar`, `N+1`, `índice`, `benchmark`, `query lenta`, `explain`, `profiling`
- **Frases PT-BR:** "tá lento", "otimizar performance", "query lenta", "N+1 queries", "falta índice", "melhorar velocidade", "benchmark do endpoint", "Promise.all", "lean"
- **Contexto:** Endpoint lento, query demorada, otimização de cache, paralelismo async
- **NAO confundir:** Cache específico → `cache-auditor`; Cache participante → `cache-sentinel`
- **Localização:** `docs/skills/02-specialists/performance-audit.md`

#### ui-ux-quality-gates
- **Keywords primárias:** `quality gate`, `gate de qualidade`, `validar interface`, `pronto para entregar`, `checklist UI`, `hierarquia visual`, `feedback de interação`
- **Frases PT-BR:** "interface tá pronta?", "validar entrega de UI", "checklist de qualidade visual", "passou nos gates?", "interface tá acessível?", "responsivo tá ok?", "empty state?", "hover state?"
- **Contexto:** Validação final antes de entregar interface. 5 gates: Visual Hierarchy, Interaction Feedback, Data Presentation, Responsive, Emotional Design
- **Localização:** `docs/skills/02-specialists/ui-ux-quality-gates.md`

#### architecture-reviewer
- **Keywords primárias:** `revisão arquitetural`, `decisão técnica`, `acoplamento`, `modelagem`, `arquitetura`, `trade-off`, `review de design`
- **Frases PT-BR:** "revisar arquitetura", "decisão técnica", "tá muito acoplado?", "modelagem tá correta?", "review de design do sistema", "avaliar trade-offs", "isso escala?"
- **Contexto:** Avaliar decisões arquiteturais, modelagem de domínio, organização de módulos
- **Localização:** `docs/skills/02-specialists/architecture-reviewer.md`

#### tailwind-patterns
- **Keywords primárias:** `tailwind`, `utility class`, `responsive`, `sm:`, `md:`, `lg:`, `classes CSS tailwind`
- **Frases PT-BR:** "como usar tailwind aqui?", "pattern tailwind", "responsivo com tailwind", "dark mode tailwind", "componente tailwind", "classes de utilidade"
- **Contexto:** Criação de componentes com TailwindCSS, patterns responsivos, dark mode utilities
- **Localização:** `docs/skills/02-specialists/tailwind-patterns.md`

#### error-handling
- **Keywords primárias:** `erro`, `error handling`, `try catch`, `AppError`, `middleware de erro`, `tratamento de erros`
- **Frases PT-BR:** "como tratar esse erro?", "catch vazio", "error handler", "erro genérico", "apiServerError", "hierarquia de erros", "logging de erros"
- **Contexto:** Implementação de tratamento de erros em controllers/services, logging seguro
- **Localização:** `docs/skills/02-specialists/error-handling.md`

---

### 03 — Utilities (Ferramentas Auxiliares)

#### git-commit-push
- **Keywords primárias:** `git push`, `git commit`, `push`, `commit`, `versionar`, `commitar`, `sync total`, `full sync`, `sincronizar tudo`
- **Frases PT-BR:** "faça um push", "commite tudo", "suba as mudanças", "versione isso", "manda pro GitHub", "git e push", "salve no repositório", "sync total", "tá tudo sincronizado?", "verifica sync"
- **Flags:** `--sync` (push + verificação end-to-end), `--verify-only` (apenas checar estado dos 3 ambientes)
- **Localização:** `docs/skills/03-utilities/git-commit-push.md`

#### restart-server
- **Keywords primárias:** `reiniciar servidor`, `restart`, `restartar`, `servidor caiu`, `servidor travou`
- **Frases PT-BR:** "reinicie o server", "aplique as mudanças no backend", "servidor não responde", "npm run dev", "reboot do servidor", "subir servidor"
- **Localização:** `docs/skills/03-utilities/restart-server.md`

#### newsession
- **Keywords primárias:** `nova sessão`, `handover`, `contexto`, `retomar trabalho`, `continuar`
- **Frases PT-BR:** "transferir contexto", "encerrar sessão", "salvar progresso", "resumo da sessão", "o que foi feito", "retomar de onde parei"
- **Localização:** `docs/skills/03-utilities/newsession.md`

#### fact-checker
- **Keywords primárias:** `verificar`, `confirmar`, `validar informação`, `é verdade que`, `checar fato`, `anti-alucinação`
- **Frases PT-BR:** "isso é verdade?", "confirme que existe", "verifique no código", "tem certeza?", "valide essa informação", "confere se", "não invente"
- **Contexto:** Dúvida sobre veracidade, dados críticos que precisam ser 100% corretos
- **Localização:** `docs/skills/03-utilities/fact-checker.md`

#### ai-problems-detection
- **Keywords primárias:** `overengineering`, `código duplicado`, `reinventando a roda`, `arquivo monolítico`, `pré-implementação`
- **Frases PT-BR:** "tá muito complexo", "já existe isso?", "tem mais simples?", "tá duplicado", "esse código já existe", "deveria separar", "antes de implementar", "vamos verificar antes"
- **Ativação automática:** Deve rodar ANTES de qualquer implementação significativa
- **Localização:** `docs/skills/03-utilities/ai-problems-detection.md`

#### systematic-debugging
- **Keywords primárias:** `debug`, `bug`, `investigar`, `reproduzir`, `causa raiz`, `bisect`, `crash`, `não funciona`, `debugging`, `quebrado`, `quebrou`
- **Frases PT-BR:** "como debugar isso?", "investigar esse bug", "encontrar causa raiz", "reproduzir o erro", "por que não funciona?", "erro no sistema", "crash no servidor", "tá quebrando", "renderização quebrada", "não renderiza", "tela quebrada", "layout quebrado", "CSS quebrado", "tá errado", "não aparece", "sumiu", "parou de funcionar"
- **Contexto:** Investigação sistemática de bugs — 4 fases: Reproduzir → Isolar → Entender → Corrigir
- **Localização:** `docs/skills/03-utilities/systematic-debugging.md`

#### Refactor-Monolith
- **Keywords primárias:** `refatorar`, `monolito`, `decomposição`, `arquivo grande`, `separar módulos`, `extrair funções`
- **Frases PT-BR:** "refatorar arquivo grande", "separar em módulos", "esse arquivo tá enorme", "extrair funções", "decompor monolito", "quebrar arquivo", "arquivo com muitas linhas"
- **Contexto:** Arquivos com +500 linhas, necessidade de modularização
- **Localização:** `docs/skills/03-utilities/Refactor-Monolith.md`

#### stitch-adapter
- **Keywords primárias:** `adaptar html`, `converter html`, `html externo`, `html do stitch`, `avaliar html`, `qualidade html`, `stitch`, `stitch mcp`, `gerar tela no stitch`, `design no stitch`, `mockup no stitch`, `variante no stitch`, `usar stitch`
- **Frases PT-BR:** "adaptar esse html", "recebi html externo", "converter html para o projeto", "processar html do stitch", "html do ai studio", "avaliar qualidade do html", "gerar design no stitch", "criar tela no stitch", "abrir stitch", "listar projetos do stitch", "gerar variante no stitch", "editar tela no stitch"
- **MCP Tools:** `generate_screen_from_text`, `edit_screens`, `generate_variants`, `get_screen`, `list_projects`, `list_screens`
- **Localização:** `docs/skills/03-utilities/stitch-adapter.md`

#### delete-merged-branches
- **Keywords primárias:** `deletar branches`, `limpar branches`, `cleanup branches`, `higienizar branches`, `branches mergeadas`, `remover branches antigas`, `limpeza de branches`
- **Frases PT-BR:** "deletar branches mergeadas", "limpar branches que já foram mergeadas", "quais branches já foram mergeadas?", "remover branches antigas", "higienizar repositório", "cleanup de branches"
- **Localização:** `docs/skills/03-utilities/delete-merged-branches.md`

#### project-reference
- **Keywords primárias:** `referencia projeto`, `detalhes MCPs`, `collections`, `tipos de ID`, `keyword map`, `slash commands detalhados`, `github app`, `conectar github`
- **Frases PT-BR:** "quais MCPs temos?", "detalhes das collections", "tabela de keywords", "como usar Perplexity", "como usar Stitch MCP", "instalar github app", "conectar github ao claude"
- **Localização:** `docs/skills/03-utilities/project-reference.md`

---

### 04 — Project-Specific (Super Cartola Manager)

#### cartola-api
- **Keywords primárias:** `API Cartola`, `endpoint cartola`, `scout`, `X-GLB-Token`, `mercado cartola`, `atleta`, `rodada cartola`
- **Frases PT-BR:** "endpoint da API", "como autenticar no cartola", "estrutura do response", "scouts do jogador", "status do mercado", "dados do cartola", "posições dos jogadores", "clubes do brasileirão"
- **Localização:** `docs/skills/04-project-specific/cartola-api.md`

#### cache-auditor
- **Keywords primárias:** `cache`, `auditoria de cache`, `Service Worker`, `IndexedDB`, `TTL`, `cache stale`, `cache morto`
- **Frases PT-BR:** "auditar cache", "cache desatualizado", "limpar cache", "velocidade do app", "performance de cache", "CACHE-APP", "CACHE-WEB", "cache offline"
- **Modos:** `CACHE-APP --participante`, `CACHE-WEB --admin`, `CACHE-APP --admin`
- **NAO confundir:** Cache de backend/MongoDB → `db-guardian`; Monitoramento profundo participante → `cache-sentinel`
- **Localização:** `docs/skills/04-project-specific/cache-auditor.md`

#### cache-sentinel
- **Keywords primárias:** `cache stale`, `cache antigo`, `sentinel`, `cache participante`, `monitorar cache`, `cache prevalecendo`, `dado antigo no app`, `vasculhar caches`
- **Frases PT-BR:** "cache antigo prevalecendo", "dado desatualizado no app", "participante vendo dado antigo", "cache não tá limpando", "monitorar cache do app", "SW desatualizado", "IndexedDB stale", "cache sentinel"
- **Modos:** `--full`, `--mongo`, `--sw`, `--frontend`, `--live`
- **Localização:** `docs/skills/04-project-specific/cache-sentinel.md`

#### auditor-module
- **Keywords primárias:** `auditar módulo`, `auditoria de módulo`, `validar módulo`, `conformidade`, `checklist módulo`
- **Frases PT-BR:** "audite o módulo", "validar implementação do módulo", "checklist do módulo", "módulo tá correto?", "revisar módulo", "auditoria completa do módulo"
- **Dimensões:** segurança, UI/UX, financeiro, performance, regras de negócio
- **Localização:** `docs/skills/04-project-specific/AUDITOR-MODULE.md`

#### ux-auditor-app
- **Keywords primárias:** `auditar UX`, `auditoria UX app`, `auditar design app`, `UX participante`, `design participante`, `checkar UI`, `revisar frontend app`, `auditoria visual`, `consistencia visual`
- **Frases PT-BR:** "auditar UX do app", "revisar design do participante", "checar UI do app", "auditoria visual do app", "tá consistente o app?", "conferir CSS do app", "revisar telas do participante", "design tá ok?", "como tá o visual do app", "auditar experiencia do participante"
- **Contexto:** Auditoria holística de UI/UX/Design de TODAS as telas do app participante (PWA Mobile)
- **Localização:** `docs/skills/04-project-specific/ux-auditor-app.md`

#### analise-branches
- **Keywords primárias:** `branch`, `análise de branch`, `merge`, `comparar branches`, `branches remotas`
- **Frases PT-BR:** "analise as branches", "quais branches existem", "status das branches", "branch pode mergear", "risco do merge", "branches ativas"
- **Localização:** `docs/skills/04-project-specific/SKILL-ANALISE-BRANCHES.md`

#### context7-monthly-audit
- **Keywords primárias:** `auditoria mensal`, `context7 audit`, `auditar mensalmente`, `verificar mudanças`, `auditoria preventiva`, `check mensal`
- **Frases PT-BR:** "executar auditoria mensal", "auditar context7", "verificar mudanças api cartola", "check owasp mensal", "verificar deprecations", "auditoria preventiva do projeto"
- **Localização:** `docs/skills/04-project-specific/context7-monthly-audit.md`

#### live-experience
- **Keywords primárias:** `live experience`, `experiência ao vivo`, `auditoria live`, `rodada ao vivo`, `parciais ao vivo`, `orchestrator`, `managers live`, `ciclo de vida rodada`
- **Frases PT-BR:** "auditar experiência ao vivo", "como tá o live", "parciais tão funcionando?", "auditar rodada ao vivo", "orchestrator tá ok?", "managers estão rodando?", "experiência durante jogos", "pre-flight da rodada", "validar fluxo live"
- **Localização:** `docs/skills/04-project-specific/live-experience.md`

#### post-implementation-conformity
- **Keywords primárias:** `conformidade`, `auditoria pós-implementação`, `verificar conformidade`, `checar consistência`, `validar documentação`, `cross-reference`, `tudo consistente?`
- **Frases PT-BR:** "tá tudo consistente?", "verificar se nada ficou pra trás", "auditar conformidade", "checar cross-references", "LESSONS gerou regra?", "keyword map atualizado?", "cache busting tá ok?", "antes de fechar a tarefa"
- **Localização:** `docs/skills/04-project-specific/post-implementation-conformity.md`

---

### 05 — Meta (Skills sobre Skills)

#### skill-creator
- **Keywords primárias:** `criar skill`, `nova skill`, `skill customizada`, `desenvolver skill`
- **Frases PT-BR:** "quero criar uma skill", "fazer skill nova", "desenvolver um agente", "skill personalizada"
- **Localização:** `docs/skills/05-meta/skill-creator.md`

#### skill-installer
- **Keywords primárias:** `instalar skill`, `catálogo de skills`, `listar skills`, `adicionar skill`
- **Frases PT-BR:** "instalar uma skill", "quais skills disponíveis", "adicionar skill do GitHub"
- **Localização:** `docs/skills/05-meta/skill-installer.md`

---

### Infraestrutura — Context-Mode

#### context-mode
- **Keywords primárias:** `context-mode`, `ctx`, `proteção de contexto`, `economia de tokens`, `janela de contexto`, `output grande`, `ctx-doctor`, `ctx-stats`, `ctx-upgrade`
- **Frases PT-BR:** "output muito grande", "economizar contexto", "proteger contexto", "diagnóstico context-mode", "estatísticas de contexto", "atualizar context-mode", "rodar no sandbox", "analisar output grande"
- **Ferramentas:** `ctx_batch_execute`, `ctx_execute`, `ctx_execute_file`, `ctx_fetch_and_index`, `ctx_search`
- **Ativação automática:** Qualquer operação que possa gerar >20 linhas de output

---

### 06 — Agnostic-Core (Skills Genéricas)

#### unit-testing
- **Keywords primárias:** `unit test`, `teste unitário`, `jest`, `vitest`, `coverage`, `mock`, `AAA`, `padrão AAA`
- **Frases PT-BR:** "escrever teste unitário", "coverage do módulo", "mockar dependência", "testar essa função", "testes passando?", "aumentar cobertura"
- **Localização:** `.claude/skills/unit-testing/SKILL.md`

#### integration-testing
- **Keywords primárias:** `integration test`, `teste de integração`, `supertest`, `banco de teste`, `API test`
- **Frases PT-BR:** "teste com banco real", "testar endpoint completo", "teste de integração", "API test com supertest"
- **Localização:** `.claude/skills/integration-testing/SKILL.md`

#### tdd-workflow
- **Keywords primárias:** `tdd`, `test driven development`, `red green refactor`, `testar primeiro`
- **Frases PT-BR:** "usar TDD", "ciclo TDD", "red-green-refactor", "escrever teste antes de implementar", "quando usar TDD"
- **Localização:** `.claude/skills/tdd-workflow/SKILL.md`

#### e2e-testing
- **Keywords primárias:** `e2e`, `end to end`, `playwright`, `cypress`, `smoke test`, `Page Object Model`
- **Frases PT-BR:** "teste e2e", "testar fluxo completo", "smoke test", "playwright", "teste pós-deploy"
- **Localização:** `.claude/skills/e2e-testing/SKILL.md`

#### owasp-checklist
- **Keywords primárias:** `owasp`, `owasp top 10`, `injection`, `XSS`, `CSRF`, `SSRF`, `checklist de segurança`
- **Frases PT-BR:** "checar owasp", "vulnerabilidades da aplicação", "top 10 owasp", "prevenir injection", "XSS protection"
- **NAO confundir:** Hardening de endpoint específico → `api-hardening`
- **Localização:** `.claude/skills/owasp-checklist/SKILL.md`

#### observabilidade
- **Keywords primárias:** `observabilidade`, `logs estruturados`, `métricas`, `SLO`, `SLA`, `RED`, `USE`, `tracing`, `alertas`
- **Frases PT-BR:** "como monitorar o sistema", "adicionar logs estruturados", "definir SLO", "métricas do app", "alertas de produção", "rastreabilidade"
- **Localização:** `.claude/skills/observabilidade/SKILL.md`

#### pre-deploy-checklist
- **Keywords primárias:** `pre-deploy`, `checklist deploy`, `antes do deploy`, `go-live`, `pré-release`
- **Frases PT-BR:** "checklist antes de fazer deploy", "o que verificar antes de subir", "pré-release checklist", "antes do go-live"
- **Localização:** `.claude/skills/pre-deploy-checklist/SKILL.md`

#### deploy-procedures
- **Keywords primárias:** `procedimento de deploy`, `deploy zero-downtime`, `rollback`, `hotfix deploy`, `5 fases deploy`
- **Frases PT-BR:** "como fazer o deploy com segurança", "procedimento de rollback", "deploy sem downtime", "hotfix em produção"
- **Localização:** `.claude/skills/deploy-procedures/SKILL.md`

#### commit-conventions
- **Keywords primárias:** `conventional commits`, `formato de commit`, `feat`, `fix`, `chore`, `breaking change`, `commitlint`
- **Frases PT-BR:** "formato do commit", "como escrever mensagem de commit", "conventional commits", "tipo de commit correto"
- **NAO confundir:** Fazer commit → `git-commit-push`
- **Localização:** `.claude/skills/commit-conventions/SKILL.md`

#### branching-strategy
- **Keywords primárias:** `estratégia de branch`, `git flow`, `trunk based`, `nomenclatura de branch`, `proteção de branch`
- **Frases PT-BR:** "como nomear a branch", "strategy de branches", "trunk-based vs gitflow", "proteger main", "PR workflow"
- **Localização:** `.claude/skills/branching-strategy/SKILL.md`

#### model-routing
- **Keywords primárias:** `qual modelo usar`, `opus`, `sonnet`, `haiku`, `model routing`, `roteamento de modelo`
- **Frases PT-BR:** "qual Claude usar para isso?", "quando usar Opus?", "quando usar Haiku?", "melhor modelo para essa tarefa"
- **Localização:** `.claude/skills/model-routing/SKILL.md`

#### context-management
- **Keywords primárias:** `context rot`, `handover de contexto`, `sessão longa`, `quando fazer compact`, `contexto cheio`
- **Frases PT-BR:** "contexto tá ficando grande", "quando fazer /compact?", "handover de sessão", "contexto tá poluído", "contexto fresco"
- **NAO confundir:** Handover de sessão → `newsession`; Proteção de output → `context-mode`
- **Localização:** `.claude/skills/context-management/SKILL.md`

#### goal-backward-planning
- **Keywords primárias:** `goal backward`, `planejamento reverso`, `waves`, `checkpoint protocol`, `Goal→Truths→Artifacts`
- **Frases PT-BR:** "planejamento por waves", "planejamento do objetivo para trás", "checkpoint de wave", "definir truths do projeto"
- **Localização:** `.claude/skills/goal-backward-planning/SKILL.md`

#### gestao-de-incidentes
- **Keywords primárias:** `incidente`, `outage`, `produção caiu`, `emergência`, `post-mortem`, `on-call`
- **Frases PT-BR:** "o app caiu em produção", "incidente em prod", "post-mortem do incidente", "como responder ao outage", "sistema indisponível"
- **Localização:** `.claude/skills/gestao-de-incidentes/SKILL.md`

#### nodejs-patterns
- **Keywords primárias:** `padrões node.js`, `graceful shutdown`, `connection pooling`, `env validation`, `MVC node`
- **Frases PT-BR:** "padrão MVC node", "graceful shutdown", "validar env vars", "connection pool", "estrutura node correta"
- **NAO confundir:** Express específico → `express-best-practices`
- **Localização:** `.claude/skills/nodejs-patterns/SKILL.md`

#### pre-implementation
- **Keywords primárias:** `verificar antes de implementar`, `já existe solução`, `solução mais simples`, `DRY check`, `pre-implementation`
- **Frases PT-BR:** "já existe isso no projeto?", "tem solução mais simples?", "verificar antes de criar", "checar duplicação", "antes de implementar"
- **Localização:** `.claude/skills/pre-implementation/SKILL.md`

#### query-compliance
- **Keywords primárias:** `query compliance`, `query segura`, `índice`, `injection prevention`, `transação segura`
- **Frases PT-BR:** "essa query tá segura?", "falta índice nessa query", "injection na query", "otimizar essa query", "transação atômica"
- **Localização:** `.claude/skills/query-compliance/SKILL.md`

#### schema-design
- **Keywords primárias:** `design de schema`, `modelagem`, `normalização`, `schema MongoDB`, `índices de schema`
- **Frases PT-BR:** "modelar esse schema", "normalizar o banco", "como estruturar essa collection", "schema correto para isso", "migrations seguras"
- **Localização:** `.claude/skills/schema-design/SKILL.md`

#### rest-api-design
- **Keywords primárias:** `REST API design`, `nomenclatura de rota`, `HTTP methods`, `status codes`, `paginação API`, `versionamento API`
- **Frases PT-BR:** "nomenclatura das rotas correta?", "qual status code retornar?", "como paginar esse endpoint?", "versionamento de API"
- **Localização:** `.claude/skills/rest-api-design/SKILL.md`

#### caching-strategies
- **Keywords primárias:** `estratégias de cache`, `cache-aside`, `L1 L2 L3`, `stale-while-revalidate`, `Redis keys`, `invalidação de cache`
- **Frases PT-BR:** "qual estratégia de cache usar?", "cache-aside vs write-through", "como invalidar cache", "camadas de cache", "TTL correto"
- **Localização:** `.claude/skills/caching-strategies/SKILL.md`

#### accessibility
- **Keywords primárias:** `acessibilidade`, `wcag`, `aria`, `contraste`, `a11y`, `teclado`, `screen reader`
- **Frases PT-BR:** "app tá acessível?", "contraste ok?", "navegação por teclado", "aria labels", "WCAG 2.1", "acessibilidade do app"
- **Localização:** `.claude/skills/accessibility/SKILL.md`

---

## Tabela Rápida de Decisão

| Usuário disse... | Skill | Motivo |
|------------------|-------|--------|
| "redesenhar a tela" | `frontend-design` | Autoridade estética máxima |
| "deixar bonito" | `frontend-design` | Design visual |
| "nova home" | `frontend-design` | Criação de interface |
| "quero criar uma feature nova" | `workflow` | Início de ciclo completo |
| "pesquise como funciona o extrato" | `pesquisa` | Levantamento exploratório |
| "especifique as mudanças" | `spec` | Planejamento técnico |
| "implemente isso" | `code` | Execução de mudanças |
| "crie uma tela de ranking" | `frontend-crafter` | Criação de UI |
| "antes de criar CSS, valide" | `anti-frankenstein` | Governança preventiva |
| "já existe esse componente?" | `anti-frankenstein` | Check de duplicação |
| "como funciona o mata-mata?" | `system-scribe` | Explicação do sistema |
| "qual a regra de desempate?" | `league-architect` | Regra de negócio |
| "limpe os dados antigos" | `db-guardian` | Operação no banco |
| "revise esse controller" | `code-inspector` | Code review |
| "faça um push" | `git-commit-push` | Versionamento |
| "sync total" / "tá sincronizado?" | `git-commit-push --verify-only` | Verificação de ambientes |
| "reinicie o servidor" | `restart-server` | Operação de infra |
| "salve o contexto" | `newsession` | Handover de sessão |
| "tem certeza disso?" | `fact-checker` | Validação de fatos |
| "antes de codar, verifique" | `ai-problems-detection` | Pré-check |
| "esse arquivo tá enorme" | `Refactor-Monolith` | Decomposição |
| "adaptar esse html pro projeto" | `stitch-adapter` | Conversão HTML externo |
| "gerar tela no stitch" | `stitch-adapter` | MCP: generate_screen_from_text |
| "endpoint do cartola" | `cartola-api` | API externa |
| "cache tá lento" | `cache-auditor` | Performance de cache |
| "cache antigo prevalecendo" | `cache-sentinel` | Monitoramento proativo |
| "dado desatualizado no app" | `cache-sentinel` | Cache stale participante |
| "tem código morto?" | `dead-code-auditor` | Limpeza de codebase |
| "vasculha o que não é usado" | `dead-code-auditor` | Código órfão/morto |
| "tem arquivo orfão?" | `dead-code-auditor` | Arquivos não importados |
| "audite o módulo top 10" | `auditor-module` | Auditoria de módulo |
| "auditar UX do app" | `ux-auditor-app` | Auditoria UX holística |
| "quais branches existem" | `analise-branches` | Análise git |
| "deletar branches mergeadas" | `delete-merged-branches` | Higienização git |
| "executar auditoria mensal" | `context7-monthly-audit` | Auditoria preventiva |
| "auditar experiência ao vivo" | `live-experience` | Auditoria fluxo live |
| "pre-flight da rodada" | `live-experience` | Check antes da rodada |
| "criar uma skill nova" | `skill-creator` | Meta |
| "output muito grande" | `context-mode` | Proteção de contexto |
| "ctx doctor" | `context-mode:ctx-doctor` | Diagnóstico do plugin |
| "validar operação financeira" | `financial-operations` | Idempotência, auditoria |
| "follow the money" | `financial-operations` | Trilha de auditoria |
| "ordem dos middlewares" | `express-best-practices` | Padrões Express |
| "endpoint tá seguro?" | `api-hardening` | Hardening de API |
| "tá lento" | `performance-audit` | Diagnóstico performance |
| "N+1 queries" | `performance-audit` | Otimização de queries |
| "interface tá pronta?" | `ui-ux-quality-gates` | 5 quality gates |
| "revisar arquitetura" | `architecture-reviewer` | Decisões técnicas |
| "como debugar isso?" | `systematic-debugging` | 4 fases debugging |
| "causa raiz" | `systematic-debugging` | 5 Porquês |
| "tá quebrado" / "sumiu" / "não aparece" | `systematic-debugging` | Bug report |
| "pattern tailwind" | `tailwind-patterns` | Utility classes |
| "como tratar esse erro?" | `error-handling` | Try/catch patterns |
| "tá tudo consistente?" | `post-implementation-conformity` | Auditoria pós-implementação |
| "antes de fechar a tarefa" | `post-implementation-conformity` | Validação final |
| "escrever teste unitário" | `unit-testing` | Padrão AAA + coverage |
| "teste de integração" | `integration-testing` | Banco isolado + API test |
| "usar TDD" | `tdd-workflow` | Ciclo Red-Green-Refactor |
| "smoke test" | `e2e-testing` | Teste pós-deploy |
| "checkar owasp" | `owasp-checklist` | OWASP Top 10 |
| "antes do deploy" | `pre-deploy-checklist` | Checklist pré-release |
| "procedimento de rollback" | `deploy-procedures` | Deploy seguro |
| "o app caiu" | `gestao-de-incidentes` | Incidente em produção |
| "logs estruturados" | `observabilidade` | Métricas RED/USE |
| "qual modelo Claude usar?" | `model-routing` | Opus/Sonnet/Haiku |
| "formato de commit correto" | `commit-conventions` | Conventional Commits |
| "nomear a branch" | `branching-strategy` | Trunk-based vs GitFlow |
| "já existe no projeto?" | `pre-implementation` | Checar duplicação |
| "essa query tá segura?" | `query-compliance` | Query compliance |
| "modelar o schema" | `schema-design` | MongoDB schema design |
| "nomenclatura das rotas" | `rest-api-design` | REST API design |
| "qual estratégia de cache?" | `caching-strategies` | Cache-aside, L1-L3 |
| "app tá acessível?" | `accessibility` | WCAG 2.1 AA |
| "contexto tá grande" | `context-management` | Context rot + handover |
| "padrão node correto" | `nodejs-patterns` | MVC, graceful shutdown |

---

## Workflows Compostos (Sequências Comuns)

| Cenário | Sequência de Skills |
|---------|---------------------|
| Feature nova completa | `workflow` → `pesquisa` → `spec` → `ai-problems-detection` → `code` → `post-implementation-conformity` → `git-commit-push` |
| Feature com frontend | `workflow` → `pesquisa` → `spec` → `anti-frankenstein` → `frontend-crafter` → `code` → `post-implementation-conformity` → `git-commit-push` |
| Bug report | `systematic-debugging` → `code` → `git-commit-push` |
| Bug fix com lição | `systematic-debugging` → `code` → LESSONS.md → `post-implementation-conformity` → `git-commit-push` |
| Nova skill | `skill-creator` → `post-implementation-conformity` → `git-commit-push` |
| CSS novo (pipeline completo) | `frontend-design` → `anti-frankenstein` → `frontend-crafter` → `post-implementation-conformity` → `git-commit-push` |
| Refatoração | `Refactor-Monolith` → `code-inspector` → `git-commit-push` |
| Auditoria de módulo | `auditor-module` → `code-inspector` → `cache-auditor` |
| Auditoria UX pré-release | `ux-auditor-app` → `cache-auditor` → `code-inspector` |
| Auditoria live pré-rodada | `live-experience` → `cache-auditor` → `ux-auditor-app` |
| Cache stale participante | `cache-sentinel --full` |
| HTML externo → Código | `stitch-adapter` → `frontend-crafter` |
| Design com Stitch MCP | Stitch MCP → `frontend-design` → `stitch-adapter` → `anti-frankenstein` → `frontend-crafter` |
| Higienização de branches | `analise-branches` → `delete-merged-branches` |
| Operação financeira | `financial-operations` → `code-inspector` → `git-commit-push` |
| Performance profunda | `performance-audit` → `cache-auditor` → `db-guardian` |
| Endpoint novo seguro | `api-hardening` → `express-best-practices` → `code` → `code-inspector` |
| Entrega de interface | `frontend-crafter` → `ui-ux-quality-gates` → `ux-auditor-app` |
| Deploy seguro | `pre-deploy-checklist` → `owasp-checklist` → `deploy-procedures` → `e2e-testing` |
| Incidente em produção | `gestao-de-incidentes` → `observabilidade` → `systematic-debugging` |
| Feature com testes TDD | `tdd-workflow` → `code` → `unit-testing` → `integration-testing` |
| Nova collection MongoDB | `schema-design` → `query-compliance` → `db-guardian` |
| Nova endpoint REST | `rest-api-design` → `api-hardening` → `express-best-practices` → `query-compliance` |
| Mapeamento do codebase | Agente `codebase-mapper` → `architecture-reviewer` |
| Security review completo | `owasp-checklist` → `api-hardening` → Agente `security-reviewer` |

---

## Notas de Manutenção

- Ao criar nova skill: adicionar entrada neste arquivo E atualizar `docs/skills/SKILL-KEYWORD-MAP.md`
- Prioridade de match: keyword primária > frase PT-BR > contexto implícito
- Skills de categoria `04-project` vencem conflitos com `02-specialists` que vencem `03-utilities`
- Fonte canônica: `docs/skills/SKILL-KEYWORD-MAP.md` (sincronizar ao atualizar)
