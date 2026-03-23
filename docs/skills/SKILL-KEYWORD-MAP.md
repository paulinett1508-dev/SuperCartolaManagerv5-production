# Mapeamento de Keywords → Skills

Sistema de ativação inteligente de skills baseado em palavras-chave contextuais. Em vez de chamar skills pelo nome, o sistema identifica a skill correta a partir do conteúdo da solicitação.

---

## Como Funciona

1. **Detectar keywords** na mensagem do usuário
2. **Consultar tabela** abaixo para encontrar a skill correspondente
3. **Resolver conflitos** usando prioridade (quando múltiplas skills matcham)
4. **Ativar skill** carregando o `.md` de `docs/skills/[categoria]/[skill].md`

### Regras de Resolução de Conflitos

- **Match exato** (keyword primária) > **match contextual** (keyword secundária)
- Se 2+ skills matcham com mesma prioridade → skill de **categoria mais específica** vence (04-project > 02-specialists > 03-utilities)
- Se ambiguidade persiste → perguntar ao usuário qual ação deseja

---

## Tabela de Mapeamento

### 01 - Core Workflow (High Senior Protocol)

#### workflow
| Tipo | Keywords |
|------|----------|
| **Primárias** | `workflow`, `high senior protocol`, `qual fase`, `iniciar sessão de trabalho`, `começar desenvolvimento` |
| **Frases PT-BR** | "como fazer essa feature", "preciso implementar", "por onde começar", "iniciar protocolo", "qual a fase atual" |
| **Contexto** | Início de sessão, planejamento de features complexas, dúvida sobre qual passo seguir |
| **Localização** | `docs/skills/01-core-workflow/workflow.md` |

#### pesquisa
| Tipo | Keywords |
|------|----------|
| **Primárias** | `pesquisa`, `pesquisar`, `PRD`, `research`, `mapear codebase`, `levantar requisitos` |
| **Frases PT-BR** | "analise o código", "gere um PRD", "faça o levantamento", "pesquise no projeto", "mapeie os arquivos", "entenda o contexto", "fase 1" |
| **Contexto** | Nova tarefa sem PRD, necessidade de entender escopo antes de implementar |
| **Localização** | `docs/skills/01-core-workflow/pesquisa.md` |

#### spec
| Tipo | Keywords |
|------|----------|
| **Primárias** | `spec`, `especificação`, `especificar`, `SPEC`, `mudanças cirúrgicas`, `dependências` |
| **Frases PT-BR** | "mapeie as dependências", "defina as mudanças", "crie a spec", "especifique linha por linha", "planeje as alterações", "fase 2" |
| **Contexto** | PRD já existe, precisa transformar em plano técnico |
| **Localização** | `docs/skills/01-core-workflow/spec.md` |

#### code
| Tipo | Keywords |
|------|----------|
| **Primárias** | `implementar`, `implementação`, `aplicar mudanças`, `executar spec`, `codificar` |
| **Frases PT-BR** | "aplique as mudanças", "implemente a spec", "execute a implementação", "desenvolva o código", "fase 3", "hora de codar" |
| **Contexto** | SPEC já existe, pronto para aplicar mudanças no código |
| **NÃO confundir** | Pedidos genéricos de "escrever código" sem SPEC prévia → usar `workflow` primeiro |
| **Localização** | `docs/skills/01-core-workflow/code.md` |

---

### 02 - Specialists (Especialistas Técnicos)

#### frontend-design
| Tipo | Keywords |
|------|----------|
| **Primárias** | `frontend-design`, `design visual`, `autoridade estética`, `criar interface`, `redesign`, `nova tela`, `nova home`, `landing`, `dashboard` |
| **Frases PT-BR** | "redesenhar tela", "melhorar visual", "deixar bonito", "modernizar interface", "visual do app", "estilizar", "UX premium", "dark mode", "paleta de cores", "tipografia", "animação", "motion" |
| **Contexto** | Criação ou redesign de interfaces. Ativada ANTES de qualquer outra skill de frontend quando o assunto envolve design visual |
| **Prioridade** | MÁXIMA — sobrepõe `frontend-crafter` em decisões estéticas |
| **Localização** | `docs/skills/02-specialists/frontend-design.md` |

#### code-inspector
| Tipo | Keywords |
|------|----------|
| **Primárias** | `auditar código`, `code review`, `auditoria de código`, `security review`, `OWASP`, `inspeção`, `inspecionar código` |
| **Frases PT-BR** | "revise o código", "análise de segurança", "verifique vulnerabilidades", "débito técnico", "qualidade do código", "auditoria profunda", "code audit" |
| **Contexto** | Revisão pós-implementação, análise de segurança, troubleshooting, dívida técnica |
| **NÃO confundir** | Auditoria de módulo específico → `auditor-module`; Auditoria de cache → `cache-auditor` |
| **Localização** | `docs/skills/02-specialists/code-inspector.md` |

#### db-guardian
| Tipo | Keywords |
|------|----------|
| **Primárias** | `migration`, `banco de dados`, `MongoDB`, `backup`, `snapshot`, `limpeza de dados`, `índices`, `schema` |
| **Frases PT-BR** | "script de banco", "limpar collection", "fazer backup", "criar índice", "validar schema", "manutenção do banco", "otimizar queries", "dados corrompidos", "recovery" |
| **Contexto** | Operações no MongoDB, manutenção de dados, migrations, scripts de limpeza |
| **NÃO confundir** | Consultas rápidas de dados → usar MongoDB MCP diretamente |
| **Localização** | `docs/skills/02-specialists/db-guardian.md` |

#### frontend-crafter
| Tipo | Keywords |
|------|----------|
| **Primárias** | `frontend`, `tela`, `UI`, `UX`, `CSS`, `componente`, `interface`, `layout`, `design`, `mobile-first` |
| **Frases PT-BR** | "criar tela", "ajustar CSS", "consertar layout", "navegação SPA", "componente visual", "responsivo", "dark mode", "estilizar", "botão", "modal", "formulário", "menu" |
| **Contexto** | Criação/ajuste de interfaces, styling, componentes visuais, PWA frontend |
| **NÃO confundir** | Cache de frontend → `cache-auditor`; Lógica de negócio em tela → `league-architect` |
| **Localização** | `docs/skills/02-specialists/frontend-crafter.md` |

#### league-architect
| Tipo | Keywords |
|------|----------|
| **Primárias** | `regra de negócio`, `regras`, `liga`, `configuração de liga`, `cálculo financeiro`, `premiação`, `punição`, `formato de disputa` |
| **Frases PT-BR** | "como calcular", "regra do mata-mata", "configurar liga", "taxa de inscrição", "parcelamento", "multa", "pontuação", "classificação", "fórmula", "extrato financeiro" |
| **Contexto** | Definição/ajuste de regras de negócio, cálculos financeiros, formatos de competição |
| **NÃO confundir** | Implementar regra já definida → `code`; UI de regras → `frontend-crafter` |
| **Localização** | `docs/skills/02-specialists/league-architect.md` |

#### system-scribe
| Tipo | Keywords |
|------|----------|
| **Primárias** | `explicar`, `como funciona`, `documentar`, `wiki`, `ensinar`, `guia` |
| **Frases PT-BR** | "explique o módulo", "como funciona o sistema de", "documente essa feature", "quais as regras de", "me ensine como", "o que faz o", "descreva o fluxo de" |
| **Contexto** | Entender sistema existente, documentação, aprendizado sobre módulos |
| **NÃO confundir** | Gerar PRD (pesquisa) ≠ explicar sistema (system-scribe) |
| **Localização** | `docs/skills/02-specialists/system-scribe.md` |

#### anti-frankenstein
| Tipo | Keywords |
|------|----------|
| **Primárias** | `anti-frankenstein`, `anti-frank`, `modo anti-frank`, `ative modo anti-frank`, `blindar frontend`, `governança CSS`, `validar CSS`, `antes de criar CSS`, `já existe?`, `checar antes de criar`, `auditar CSS`, `duplicado CSS`, `prevenir duplicação`, `css registry`, `HTMLs no modo anti-frank` |
| **Frases PT-BR** | "ative modo anti-frank", "sempre pensando no modo anti-frank", "anti-frank", "HTMLs ativado no modo anti-frank", "modo anti-frankenstein ativo", "já existe esse componente?", "antes de criar esse CSS", "tem algum CSS parecido?", "vou criar um novo arquivo CSS", "checar se já existe", "posso criar arquivo CSS?", "validar criação frontend", "governança de frontend", "garantir que não vai duplicar", "blindar o CSS", "revisar antes de criar tela", "governança de código visual", "anti-frankstein" |
| **Contexto** | Checkpoint PREVENTIVO obrigatório antes de criar/modificar CSS, HTML, inline styles ou componentes visuais. Previne código duplicado, cores hardcoded, keyframes repetidos, arquivos órfãos |
| **Ativação automática** | Deve rodar ANTES de qualquer criação de CSS/HTML. Complementa `frontend-crafter` (que cria) e `code-inspector` (que audita pós-facto) |
| **NÃO confundir** | Criar tela nova → `frontend-crafter` (mas anti-frankenstein roda ANTES); Auditar código → `code-inspector`; Auditar UX → `ux-auditor-app` |
| **Localização** | `docs/skills/02-specialists/anti-frankenstein.md` |
| **Referências** | `config/css-registry.json`, `docs/rules/audit-frontend.md` |

#### financial-operations
| Tipo | Keywords |
|------|----------|
| **Primárias** | `operação financeira`, `idempotência`, `auditoria financeira`, `saldo`, `extrato`, `follow the money`, `transação financeira`, `débito`, `crédito` |
| **Frases PT-BR** | "validar operação financeira", "checar idempotência", "auditoria do extrato", "follow the money", "operação de saldo", "transação duplicada?", "race condition no saldo", "atomic operation" |
| **Contexto** | Revisão ou criação de código que movimenta saldo, cria transações financeiras (inscricoestemporada, ajustefinanceiros, acertofinanceiros) |
| **NÃO confundir** | Regras de negócio de premiação → `league-architect`; Auditoria de código → `code-inspector` |
| **Localização** | `docs/skills/02-specialists/financial-operations.md` |

#### express-best-practices
| Tipo | Keywords |
|------|----------|
| **Primárias** | `express`, `middleware`, `rotas`, `controller`, `CORS`, `rate limit`, `ordem de middleware`, `service layer` |
| **Frases PT-BR** | "ordem dos middlewares", "separar controller e service", "configurar CORS", "rate limiting", "error handler middleware", "estrutura Express", "padronizar rotas" |
| **Contexto** | Criação ou revisão de rotas, controllers, middlewares Express. Estruturação da camada HTTP |
| **NÃO confundir** | Segurança de endpoint → `api-hardening`; Performance → `performance-audit` |
| **Localização** | `docs/skills/02-specialists/express-best-practices.md` |

#### api-hardening
| Tipo | Keywords |
|------|----------|
| **Primárias** | `hardening`, `endpoint seguro`, `validação de input`, `segurança de API`, `proteger endpoint`, `blindar API`, `injection`, `IDOR` |
| **Frases PT-BR** | "endpoint tá seguro?", "validar input", "proteger contra injection", "blindar endpoint", "verificar autenticação de rota", "prevenir IDOR", "sanitizar input" |
| **Contexto** | Criação de novos endpoints, revisão de segurança de rotas existentes, hardening pré-deploy |
| **NÃO confundir** | Auditoria completa SPARC → `code-inspector`; Padrões Express → `express-best-practices` |
| **Localização** | `docs/skills/02-specialists/api-hardening.md` |

#### performance-audit
| Tipo | Keywords |
|------|----------|
| **Primárias** | `performance`, `lento`, `otimizar`, `N+1`, `índice`, `benchmark`, `query lenta`, `explain`, `profiling` |
| **Frases PT-BR** | "tá lento", "otimizar performance", "query lenta", "N+1 queries", "falta índice", "melhorar velocidade", "benchmark do endpoint", "Promise.all", "lean" |
| **Contexto** | Endpoint lento, query demorada, otimização de cache, paralelismo async, frontend performance |
| **NÃO confundir** | Cache específico → `cache-auditor`; Cache participante → `cache-sentinel`; DB específico → `db-guardian` |
| **Localização** | `docs/skills/02-specialists/performance-audit.md` |

#### ui-ux-quality-gates
| Tipo | Keywords |
|------|----------|
| **Primárias** | `quality gate`, `gate de qualidade`, `validar interface`, `pronto para entregar`, `checklist UI`, `hierarquia visual`, `feedback de interação` |
| **Frases PT-BR** | "interface tá pronta?", "validar entrega de UI", "checklist de qualidade visual", "passou nos gates?", "interface tá acessível?", "responsivo tá ok?", "empty state?", "hover state?" |
| **Contexto** | Validação final antes de entregar interface. 5 gates: Visual Hierarchy, Interaction Feedback, Data Presentation, Responsive, Emotional Design |
| **NÃO confundir** | Criar interface → `frontend-crafter`; Direção estética → `frontend-design`; Auditoria UX app → `ux-auditor-app` |
| **Localização** | `docs/skills/02-specialists/ui-ux-quality-gates.md` |

#### architecture-reviewer
| Tipo | Keywords |
|------|----------|
| **Primárias** | `revisão arquitetural`, `decisão técnica`, `acoplamento`, `modelagem`, `arquitetura`, `trade-off`, `review de design` |
| **Frases PT-BR** | "revisar arquitetura", "decisão técnica", "tá muito acoplado?", "modelagem tá correta?", "review de design do sistema", "avaliar trade-offs", "isso escala?" |
| **Contexto** | Avaliar decisões arquiteturais, modelagem de domínio, organização de módulos, estratégia de migração |
| **NÃO confundir** | Code review pontual → `code-inspector`; Regras de negócio → `league-architect` |
| **Localização** | `docs/skills/02-specialists/architecture-reviewer.md` |

#### tailwind-patterns
| Tipo | Keywords |
|------|----------|
| **Primárias** | `tailwind`, `utility class`, `responsive`, `sm:`, `md:`, `lg:`, `classes CSS tailwind` |
| **Frases PT-BR** | "como usar tailwind aqui?", "pattern tailwind", "responsivo com tailwind", "dark mode tailwind", "componente tailwind", "classes de utilidade" |
| **Contexto** | Criação de componentes com TailwindCSS, patterns responsivos, dark mode utilities |
| **NÃO confundir** | Governança CSS → `anti-frankenstein`; Criar interface completa → `frontend-crafter` |
| **Localização** | `docs/skills/02-specialists/tailwind-patterns.md` |

#### error-handling
| Tipo | Keywords |
|------|----------|
| **Primárias** | `erro`, `error handling`, `try catch`, `AppError`, `middleware de erro`, `tratamento de erros` |
| **Frases PT-BR** | "como tratar esse erro?", "catch vazio", "error handler", "erro genérico", "apiServerError", "hierarquia de erros", "logging de erros" |
| **Contexto** | Implementação de tratamento de erros em controllers/services, logging seguro, respostas de erro ao cliente |
| **NÃO confundir** | Debugging de bug → `systematic-debugging`; Segurança → `api-hardening` |
| **Localização** | `docs/skills/02-specialists/error-handling.md` |

---

### 03 - Utilities (Ferramentas Auxiliares)

#### git-commit-push
| Tipo | Keywords |
|------|----------|
| **Primárias** | `git push`, `git commit`, `push`, `commit`, `versionar`, `commitar` |
| **Frases PT-BR** | "faça um push", "commite tudo", "suba as mudanças", "versione isso", "manda pro GitHub", "git e push", "salve no repositório" |
| **Contexto** | Após terminar implementação, salvar trabalho no Git |
| **Localização** | `docs/skills/03-utilities/git-commit-push.md` |

#### restart-server
| Tipo | Keywords |
|------|----------|
| **Primárias** | `reiniciar servidor`, `restart`, `restartar`, `servidor caiu`, `servidor travou` |
| **Frases PT-BR** | "reinicie o server", "aplique as mudanças no backend", "servidor não responde", "npm run dev", "reboot do servidor", "subir servidor" |
| **Contexto** | Após mudanças backend, servidor não respondendo |
| **Localização** | `docs/skills/03-utilities/restart-server.md` |

#### newsession
| Tipo | Keywords |
|------|----------|
| **Primárias** | `nova sessão`, `handover`, `contexto`, `retomar trabalho`, `continuar` |
| **Frases PT-BR** | "transferir contexto", "encerrar sessão", "salvar progresso", "resumo da sessão", "o que foi feito", "retomar de onde parei" |
| **Contexto** | Fim de sessão, transferência para novo contexto, resumo de trabalho |
| **Localização** | `docs/skills/03-utilities/newsession.md` |

#### fact-checker
| Tipo | Keywords |
|------|----------|
| **Primárias** | `verificar`, `confirmar`, `validar informação`, `é verdade que`, `checar fato`, `anti-alucinação` |
| **Frases PT-BR** | "isso é verdade?", "confirme que existe", "verifique no código", "tem certeza?", "valide essa informação", "confere se", "não invente" |
| **Contexto** | Dúvida sobre veracidade, dados críticos que precisam ser 100% corretos |
| **NÃO confundir** | Pesquisa exploratória → `pesquisa`; Auditoria de código → `code-inspector` |
| **Localização** | `docs/skills/03-utilities/fact-checker.md` |

#### ai-problems-detection
| Tipo | Keywords |
|------|----------|
| **Primárias** | `overengineering`, `código duplicado`, `reinventando a roda`, `arquivo monolítico`, `pré-implementação` |
| **Frases PT-BR** | "tá muito complexo", "já existe isso?", "tem mais simples?", "tá duplicado", "esse código já existe", "deveria separar", "antes de implementar", "vamos verificar antes" |
| **Contexto** | Antes de escrever código novo, revisão de abordagem, sanity check |
| **Ativação automática** | Deve rodar ANTES de qualquer implementação significativa |
| **Localização** | `docs/skills/03-utilities/ai-problems-detection.md` |

#### systematic-debugging
| Tipo | Keywords |
|------|----------|
| **Primárias** | `debug`, `bug`, `investigar`, `reproduzir`, `causa raiz`, `bisect`, `erro`, `crash`, `não funciona`, `debugging`, `quebrado`, `quebrou` |
| **Frases PT-BR** | "como debugar isso?", "investigar esse bug", "encontrar causa raiz", "reproduzir o erro", "git bisect", "por que não funciona?", "erro no sistema", "crash no servidor", "tá quebrando", "renderização quebrada", "não renderiza", "tela quebrada", "layout quebrado", "CSS quebrado", "tá errado", "não aparece", "sumiu", "parou de funcionar" |
| **Contexto** | Investigação sistemática de bugs usando metodologia 4 fases: Reproduzir → Isolar → Entender → Corrigir |
| **NÃO confundir** | Code review → `code-inspector`; Bug de cache → `cache-sentinel`; Bug de regra → `league-architect` |
| **Localização** | `docs/skills/03-utilities/systematic-debugging.md` |

#### Refactor-Monolith
| Tipo | Keywords |
|------|----------|
| **Primárias** | `refatorar`, `monolito`, `decomposição`, `arquivo grande`, `separar módulos`, `extrair funções` |
| **Frases PT-BR** | "refatorar arquivo grande", "separar em módulos", "esse arquivo tá enorme", "extrair funções", "decompor monolito", "quebrar arquivo", "arquivo com muitas linhas" |
| **Contexto** | Arquivos com +500 linhas, necessidade de modularização |
| **NÃO confundir** | Refactoring pontual → `code`; Refactoring de lógica de negócio → `league-architect` primeiro |
| **Localização** | `docs/skills/03-utilities/Refactor-Monolith.md` |

#### stitch-adapter
| Tipo | Keywords |
|------|----------|
| **Primárias** | `adaptar html`, `converter html`, `html externo`, `html do stitch`, `avaliar html`, `qualidade html`, `stitch`, `stitch mcp`, `gerar tela no stitch`, `design no stitch`, `mockup no stitch`, `variante no stitch`, `usar stitch` |
| **Frases PT-BR** | "adaptar esse html", "recebi html externo", "converter html para o projeto", "processar html do stitch", "html do ai studio", "avaliar qualidade do html", "adaptar codigo externo", "gerar design no stitch", "criar tela no stitch", "abrir stitch", "listar projetos do stitch", "gerar variante no stitch", "editar tela no stitch" |
| **Contexto** | Modo MCP (primario): gera/edita/extrai HTML via Stitch MCP Server. Modo Manual (fallback): recebe HTML colado. Ambos: avalia qualidade, separa HTML/CSS/JS, converte para variaveis CSS, adapta a stack Vanilla JS |
| **Versão** | 4.0 (MCP + Manual + Avaliador de Qualidade) |
| **MCP Tools** | `generate_screen_from_text`, `edit_screens`, `generate_variants`, `get_screen`, `list_projects`, `list_screens` |
| **Pipeline** | `docs/guides/STITCH-MCP-PIPELINE.md` |
| **NÃO confundir** | Criar componente do zero → `frontend-crafter`; Apenas estilizar → `frontend-crafter`; Direção estética → `frontend-design` (roda ANTES) |
| **Localização** | `docs/skills/03-utilities/stitch-adapter.md` |

#### delete-merged-branches
| Tipo | Keywords |
|------|----------|
| **Primárias** | `deletar branches`, `limpar branches`, `cleanup branches`, `higienizar branches`, `branches mergeadas`, `remover branches antigas`, `limpeza de branches` |
| **Frases PT-BR** | "deletar branches mergeadas", "limpar branches que já foram mergeadas", "quais branches já foram mergeadas?", "remover branches antigas", "higienizar repositório", "limpeza de branches", "cleanup de branches", "branches com PR mergeado" |
| **Contexto** | Higienização organizacional de branches remotas cujos PRs já foram mergeados. Remove apenas ponteiros — não afeta histórico, commits ou PRs |
| **NÃO confundir** | Análise de branches (status/funcionalidade) → `analise-branches`; Git push/commit → `git-commit-push` |
| **Localização** | `docs/skills/03-utilities/delete-merged-branches.md` |

#### project-reference
| Tipo | Keywords |
|------|----------|
| **Primárias** | `referencia projeto`, `detalhes MCPs`, `collections`, `tipos de ID`, `keyword map`, `slash commands detalhados`, `github app`, `install-github-app`, `conectar github` |
| **Frases PT-BR** | "quais MCPs temos?", "detalhes das collections", "tabela de keywords", "como usar Perplexity", "como usar Stitch MCP", "sistema de renovacao", "backlog helper", "instalar github app", "conectar github ao claude" |
| **Contexto** | Referencia detalhada do projeto: MCPs, collections MongoDB, keyword→skill map completo, slash commands, sistema de renovacao, versionamento, backlog, GitHub App do Claude Code |
| **NÃO confundir** | Regras de codigo → CLAUDE.md; Skills especificas → skill individual |
| **Localização** | `docs/skills/03-utilities/project-reference.md` |

---

### 04 - Project-Specific (Específicas do Super Cartola)

#### cartola-api
| Tipo | Keywords |
|------|----------|
| **Primárias** | `API Cartola`, `endpoint cartola`, `scout`, `X-GLB-Token`, `mercado cartola`, `atleta`, `rodada cartola` |
| **Frases PT-BR** | "endpoint da API", "como autenticar no cartola", "estrutura do response", "scouts do jogador", "status do mercado", "dados do cartola", "posições dos jogadores", "clubes do brasileirão" |
| **Contexto** | Integração com API oficial do Cartola FC, consulta de dados de jogadores/times |
| **Localização** | `docs/skills/04-project-specific/cartola-api.md` |
| **Referências** | `docs/skills/04-project-specific/cartola-api-references/` |

#### cache-auditor
| Tipo | Keywords |
|------|----------|
| **Primárias** | `cache`, `auditoria de cache`, `Service Worker`, `IndexedDB`, `TTL`, `cache stale`, `cache morto` |
| **Frases PT-BR** | "auditar cache", "cache desatualizado", "limpar cache", "velocidade do app", "performance de cache", "CACHE-APP", "CACHE-WEB", "cache offline" |
| **Modos** | `CACHE-APP --participante`, `CACHE-WEB --admin`, `CACHE-APP --admin` |
| **Contexto** | Problemas de cache, performance, dados desatualizados nos apps |
| **NÃO confundir** | Cache de backend/MongoDB → `db-guardian`; Otimizar JS/CSS → `frontend-crafter`; Monitoramento profundo participante → `cache-sentinel` |
| **Localização** | `docs/skills/04-project-specific/cache-auditor.md` |

#### cache-sentinel
| Tipo | Keywords |
|------|----------|
| **Primárias** | `cache stale`, `cache antigo`, `sentinel`, `cache participante`, `monitorar cache`, `cache prevalecendo`, `dado antigo no app`, `vasculhar caches` |
| **Frases PT-BR** | "cache antigo prevalecendo", "dado desatualizado no app", "participante vendo dado antigo", "cache não tá limpando", "monitorar cache do app", "verificar se cache tá atualizado", "SW desatualizado", "IndexedDB stale", "cache sentinel", "vasculhar caches do participante" |
| **Modos** | `--full`, `--mongo`, `--sw`, `--frontend`, `--live` |
| **Contexto** | Monitoramento proativo de caches stale no app participante, pre-flight de rodada, pos-deploy, investigação de dados antigos |
| **NÃO confundir** | Auditoria broad dos 3 ambientes → `cache-auditor`; Cache de backend puro → `db-guardian` |
| **Localização** | `docs/skills/04-project-specific/cache-sentinel.md` |

#### auditor-module
| Tipo | Keywords |
|------|----------|
| **Primárias** | `auditar módulo`, `auditoria de módulo`, `validar módulo`, `conformidade`, `checklist módulo` |
| **Frases PT-BR** | "audite o módulo", "validar implementação do módulo", "checklist do módulo", "módulo tá correto?", "revisar módulo", "auditoria completa do módulo" |
| **Dimensões** | segurança, UI/UX, financeiro, performance, regras de negócio |
| **Contexto** | Validação completa de um módulo específico (Top 10, Mata-Mata, etc.) |
| **NÃO confundir** | Auditoria de código genérica → `code-inspector`; Auditoria de cache → `cache-auditor` |
| **Localização** | `docs/skills/04-project-specific/AUDITOR-MODULE.md` |

#### ux-auditor-app
| Tipo | Keywords |
|------|----------|
| **Primárias** | `auditar UX`, `auditoria UX app`, `auditar design app`, `UX participante`, `design participante`, `checkar UI`, `revisar frontend app`, `auditoria visual`, `consistencia visual` |
| **Frases PT-BR** | "auditar UX do app", "revisar design do participante", "checar UI do app", "auditoria visual do app", "tá consistente o app?", "conferir CSS do app", "revisar telas do participante", "design tá ok?", "como tá o visual do app", "auditar experiencia do participante", "checar dark mode do app", "revisar tipografia do app", "conferir responsividade do app", "estados visuais do app", "navegação do app tá ok?", "PWA tá acessível?", "tokens CSS do app", "inconsistencia no app" |
| **Contexto** | Auditoria holística de UI/UX/Design de TODAS as telas do app participante (PWA Mobile) |
| **NÃO confundir** | Criar tela nova → `frontend-crafter`; Auditar 1 módulo (backend+frontend) → `auditor-module`; Auditoria de cache → `cache-auditor` |
| **Localização** | `docs/skills/04-project-specific/ux-auditor-app.md` |

#### analise-branches
| Tipo | Keywords |
|------|----------|
| **Primárias** | `branch`, `análise de branch`, `merge`, `comparar branches`, `branches remotas` |
| **Frases PT-BR** | "analise as branches", "quais branches existem", "status das branches", "branch pode mergear", "risco do merge", "branches ativas" |
| **Contexto** | Antes de merge, inventário de branches, análise de risco |
| **NÃO confundir** | Git push/commit → `git-commit-push` |
| **Localização** | `docs/skills/04-project-specific/SKILL-ANALISE-BRANCHES.md` |

#### context7-monthly-audit
| Tipo | Keywords |
|------|----------|
| **Primárias** | `auditoria mensal`, `context7 audit`, `auditar mensalmente`, `verificar mudanças`, `auditoria preventiva`, `check mensal` |
| **Frases PT-BR** | "executar auditoria mensal", "auditar context7", "verificar mudanças api cartola", "check owasp mensal", "verificar deprecations", "auditoria preventiva do projeto", "rodar auditoria automática", "verificar segurança mensal" |
| **Contexto** | Auditoria preventiva mensal de API Cartola, OWASP security, deprecations de dependências e PWA |
| **Auditorias** | API Cartola FC, OWASP Security, Mongoose/Express deprecations, PWA/Service Workers |
| **NÃO confundir** | Auditoria de código específico → `code-inspector`; Auditoria de módulo → `auditor-module` |
| **Localização** | `docs/skills/04-project-specific/context7-monthly-audit.md` |

#### live-experience
| Tipo | Keywords |
|------|----------|
| **Primárias** | `live experience`, `experiência ao vivo`, `auditoria live`, `rodada ao vivo`, `parciais ao vivo`, `orchestrator`, `managers live`, `ciclo de vida rodada` |
| **Frases PT-BR** | "auditar experiência ao vivo", "como tá o live", "parciais tão funcionando?", "auditar rodada ao vivo", "orchestrator tá ok?", "managers estão rodando?", "experiência durante jogos", "pre-flight da rodada", "validar fluxo live", "consolidação tá correta?", "polling tá adequado?", "cache durante live" |
| **Dimensões** | orchestrator, managers, parciais, cache live, frontend live, consolidação |
| **Contexto** | Auditoria do fluxo completo durante rodadas ao vivo: orchestrator, managers, parciais, cache, frontend e consolidação |
| **NÃO confundir** | Auditoria de módulo individual → `auditor-module`; Auditoria de cache geral → `cache-auditor`; Auditoria UX geral → `ux-auditor-app` |
| **Localização** | `docs/skills/04-project-specific/live-experience.md` |

#### post-implementation-conformity
| Tipo | Keywords |
|------|----------|
| **Primárias** | `conformidade`, `auditoria pós-implementação`, `verificar conformidade`, `checar consistência`, `validar documentação`, `cross-reference`, `tudo consistente?` |
| **Frases PT-BR** | "tá tudo consistente?", "verificar se nada ficou pra trás", "auditar conformidade", "checar cross-references", "LESSONS gerou regra?", "keyword map atualizado?", "cache busting tá ok?", "validar que tudo bate", "conferir documentação", "auditoria pós-implementação", "antes de fechar a tarefa" |
| **Contexto** | Auditoria de consistência cruzada APÓS implementar e documentar. Verifica CLAUDE.md ↔ LESSONS.md ↔ SKILL-KEYWORD-MAP ↔ css-registry ↔ cache busting |
| **NÃO confundir** | Auditoria de código → `code-inspector`; Auditoria de módulo → `auditor-module`; Checklist pré-deploy → agnostic-core; Auditoria UX → `ux-auditor-app` |
| **Localização** | `docs/skills/04-project-specific/post-implementation-conformity.md` |
| **Base agnóstica** | `.agnostic-core/skills/audit/post-implementation-conformity.md` |

---

### Infraestrutura — Context-Mode (Proteção de Contexto)

#### context-mode
| Tipo | Keywords |
|------|----------|
| **Primárias** | `context-mode`, `ctx`, `proteção de contexto`, `economia de tokens`, `janela de contexto`, `output grande`, `ctx-doctor`, `ctx-stats`, `ctx-upgrade` |
| **Frases PT-BR** | "output muito grande", "economizar contexto", "proteger contexto", "diagnóstico context-mode", "estatísticas de contexto", "atualizar context-mode", "rodar no sandbox", "analisar output grande", "indexar conteúdo", "quanto contexto economizei", "ctx doctor", "ctx stats" |
| **Contexto** | Qualquer operação que possa gerar >20 linhas de output. Redirecionar para `ctx_batch_execute`, `ctx_execute`, `ctx_execute_file` ou `ctx_fetch_and_index` em vez de Bash/Read direto |
| **Ferramentas** | `ctx_batch_execute` (múltiplos comandos), `ctx_execute` (sandbox JS/Python/Shell), `ctx_execute_file` (análise de arquivo), `ctx_fetch_and_index` (indexar URL), `ctx_search` (follow-up queries) |
| **Skills** | `/context-mode:ctx-doctor` (diagnóstico), `/context-mode:ctx-stats` (economia), `/context-mode:ctx-upgrade` (atualizar), `/context-mode:ctx-cloud-setup` (cloud), `/context-mode:ctx-cloud-status` (status cloud) |
| **Ativação automática** | Hooks PreToolUse e SessionStart já configurados. Roteamento automático via hook quando output estimado >20 linhas |
| **NÃO confundir** | Cache de aplicação → `cache-auditor`; Performance do app → `performance-audit` |

---

### 05 - Meta (Skills sobre Skills)

#### skill-creator
| Tipo | Keywords |
|------|----------|
| **Primárias** | `criar skill`, `nova skill`, `skill customizada`, `desenvolver skill` |
| **Frases PT-BR** | "quero criar uma skill", "fazer skill nova", "desenvolver um agente", "skill personalizada" |
| **Contexto** | Necessidade de nova capacidade especializada |
| **Localização** | `docs/skills/05-meta/skill-creator.md` |

#### skill-installer
| Tipo | Keywords |
|------|----------|
| **Primárias** | `instalar skill`, `catálogo de skills`, `listar skills`, `adicionar skill` |
| **Frases PT-BR** | "instalar uma skill", "quais skills disponíveis", "adicionar skill do GitHub" |
| **Contexto** | Ampliar capacidades com skills externas |
| **Localização** | `docs/skills/05-meta/skill-installer.md` |

#### claude-code-project-structure
| Tipo | Keywords |
|------|----------|
| **Primárias** | `estrutura claude code`, `migration mode`, `auditar .claude`, `reorganizar projeto`, `CLAUDE.md template`, `hooks estrutura`, `skills estrutura` |
| **Frases PT-BR** | "auditar estrutura do projeto Claude", "reorganizar .claude/", "CLAUDE.md tá ok?", "migration mode", "estrutura de pastas Claude Code", "hooks do projeto", "onboarding Claude Code" |
| **Contexto** | Auditar ou reorganizar a infraestrutura Claude Code do projeto (.claude/, CLAUDE.md, hooks, skills, MCP) — não o sistema Super Cartola |
| **Localização** | `/root/.claude/skills/claude-code-project-structure/` (skill global) |

---

### 06 - Agnostic-Core (Skills Genéricas do Ecossistema)

Skills instaladas a partir do `.agnostic-core/` — referência em `.claude/skills/` e `.agnostic-core/skills/`.

#### unit-testing
| Tipo | Keywords |
|------|----------|
| **Primárias** | `unit test`, `teste unitário`, `jest`, `vitest`, `coverage`, `mock`, `AAA`, `padrão AAA` |
| **Frases PT-BR** | "escrever teste unitário", "coverage do módulo", "mockar dependência", "testar essa função", "testes passando?", "aumentar cobertura" |
| **Contexto** | Escrita ou revisão de testes unitários |
| **Localização** | `.claude/skills/unit-testing/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/testing/unit-testing.md` |

#### integration-testing
| Tipo | Keywords |
|------|----------|
| **Primárias** | `integration test`, `teste de integração`, `supertest`, `banco de teste`, `API test` |
| **Frases PT-BR** | "teste com banco real", "testar endpoint completo", "teste de integração", "API test com supertest" |
| **Contexto** | Testes que envolvem múltiplas camadas (API + banco, service + cache) |
| **Localização** | `.claude/skills/integration-testing/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/testing/integration-testing.md` |

#### tdd-workflow
| Tipo | Keywords |
|------|----------|
| **Primárias** | `tdd`, `test driven development`, `red green refactor`, `testar primeiro` |
| **Frases PT-BR** | "usar TDD", "ciclo TDD", "red-green-refactor", "escrever teste antes de implementar", "quando usar TDD" |
| **Contexto** | Desenvolvimento com ciclo TDD, especialmente lógica de negócio complexa |
| **Localização** | `.claude/skills/tdd-workflow/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/testing/tdd-workflow.md` |

#### e2e-testing
| Tipo | Keywords |
|------|----------|
| **Primárias** | `e2e`, `end to end`, `playwright`, `cypress`, `smoke test`, `Page Object Model` |
| **Frases PT-BR** | "teste e2e", "testar fluxo completo", "smoke test", "playwright", "teste pós-deploy" |
| **Contexto** | Testes de fluxo completo, smoke tests pós-deploy |
| **Localização** | `.claude/skills/e2e-testing/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/testing/e2e-testing.md` |

#### owasp-checklist
| Tipo | Keywords |
|------|----------|
| **Primárias** | `owasp`, `owasp top 10`, `injection`, `XSS`, `CSRF`, `SSRF`, `checklist de segurança` |
| **Frases PT-BR** | "checar owasp", "vulnerabilidades da aplicação", "top 10 owasp", "prevenir injection", "XSS protection" |
| **Contexto** | Revisão de segurança, pré-deploy, novos endpoints |
| **NÃO confundir** | Hardening de endpoint específico → `api-hardening`; Auditoria SPARC → `code-inspector` |
| **Localização** | `.claude/skills/owasp-checklist/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/security/owasp-checklist.md` |

#### observabilidade
| Tipo | Keywords |
|------|----------|
| **Primárias** | `observabilidade`, `logs estruturados`, `métricas`, `SLO`, `SLA`, `RED`, `USE`, `tracing`, `alertas` |
| **Frases PT-BR** | "como monitorar o sistema", "adicionar logs estruturados", "definir SLO", "métricas do app", "alertas de produção", "rastreabilidade" |
| **Contexto** | Implementar logging, métricas, alertas e tracing no sistema |
| **Localização** | `.claude/skills/observabilidade/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/devops/observabilidade.md` |

#### pre-deploy-checklist
| Tipo | Keywords |
|------|----------|
| **Primárias** | `pre-deploy`, `checklist deploy`, `antes do deploy`, `go-live`, `pré-release` |
| **Frases PT-BR** | "checklist antes de fazer deploy", "o que verificar antes de subir", "pré-release checklist", "antes do go-live" |
| **Contexto** | Antes de qualquer deploy em produção |
| **NÃO confundir** | Procedimento de deploy → `deploy-procedures` |
| **Localização** | `.claude/skills/pre-deploy-checklist/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/devops/pre-deploy-checklist.md` |

#### deploy-procedures
| Tipo | Keywords |
|------|----------|
| **Primárias** | `procedimento de deploy`, `deploy zero-downtime`, `rollback`, `hotfix deploy`, `5 fases deploy` |
| **Frases PT-BR** | "como fazer o deploy com segurança", "procedimento de rollback", "deploy sem downtime", "hotfix em produção" |
| **Contexto** | Execução segura de deploy, rollback, hotfix |
| **Localização** | `.claude/skills/deploy-procedures/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/devops/deploy-procedures.md` |

#### commit-conventions
| Tipo | Keywords |
|------|----------|
| **Primárias** | `conventional commits`, `formato de commit`, `feat`, `fix`, `chore`, `breaking change`, `commitlint` |
| **Frases PT-BR** | "formato do commit", "como escrever mensagem de commit", "conventional commits", "tipo de commit correto" |
| **Contexto** | Revisão ou padronização de mensagens de commit |
| **NÃO confundir** | Fazer commit → `git-commit-push` |
| **Localização** | `.claude/skills/commit-conventions/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/git/commit-conventions.md` |

#### branching-strategy
| Tipo | Keywords |
|------|----------|
| **Primárias** | `estratégia de branch`, `git flow`, `trunk based`, `nomenclatura de branch`, `proteção de branch` |
| **Frases PT-BR** | "como nomear a branch", "strategy de branches", "trunk-based vs gitflow", "proteger main", "PR workflow" |
| **Contexto** | Definição ou revisão de estratégia de branches |
| **Localização** | `.claude/skills/branching-strategy/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/git/branching-strategy.md` |

#### model-routing
| Tipo | Keywords |
|------|----------|
| **Primárias** | `qual modelo usar`, `opus`, `sonnet`, `haiku`, `model routing`, `roteamento de modelo` |
| **Frases PT-BR** | "qual Claude usar para isso?", "quando usar Opus?", "quando usar Haiku?", "melhor modelo para essa tarefa" |
| **Contexto** | Escolher o modelo Claude adequado para cada tipo de tarefa |
| **Localização** | `.claude/skills/model-routing/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/ai/model-routing.md` |

#### context-management
| Tipo | Keywords |
|------|----------|
| **Primárias** | `context rot`, `handover de contexto`, `sessão longa`, `quando fazer compact`, `contexto cheio` |
| **Frases PT-BR** | "contexto tá ficando grande", "quando fazer /compact?", "handover de sessão", "contexto tá poluído", "contexto fresco" |
| **Contexto** | Gerenciar contexto em sessões longas, decidir quando compactar ou iniciar nova sessão |
| **NÃO confundir** | Handover de sessão → `newsession`; Proteção de output → `context-mode` |
| **Localização** | `.claude/skills/context-management/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/workflow/context-management.md` |

#### goal-backward-planning
| Tipo | Keywords |
|------|----------|
| **Primárias** | `goal backward`, `planejamento reverso`, `waves`, `checkpoint protocol`, `Goal→Truths→Artifacts` |
| **Frases PT-BR** | "planejamento por waves", "planejamento do objetivo para trás", "checkpoint de wave", "definir truths do projeto" |
| **Contexto** | Planejamento de features ou projetos grandes usando abordagem goal-backward |
| **Localização** | `.claude/skills/goal-backward-planning/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/workflow/goal-backward-planning.md` |

#### gestao-de-incidentes
| Tipo | Keywords |
|------|----------|
| **Primárias** | `incidente`, `outage`, `produção caiu`, `emergência`, `post-mortem`, `on-call` |
| **Frases PT-BR** | "o app caiu em produção", "incidente em prod", "post-mortem do incidente", "como responder ao outage", "sistema indisponível" |
| **Contexto** | Resposta a incidentes em produção, post-mortem |
| **Localização** | `.claude/skills/gestao-de-incidentes/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/workflow/gestao-de-incidentes.md` |

#### nodejs-patterns
| Tipo | Keywords |
|------|----------|
| **Primárias** | `padrões node.js`, `graceful shutdown`, `connection pooling`, `env validation`, `MVC node` |
| **Frases PT-BR** | "padrão MVC node", "graceful shutdown", "validar env vars", "connection pool", "estrutura node correta" |
| **Contexto** | Implementar padrões Node.js corretos: shutdown, env, pooling |
| **NÃO confundir** | Express específico → `express-best-practices` |
| **Localização** | `.claude/skills/nodejs-patterns/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/nodejs/nodejs-patterns.md` |

#### pre-implementation
| Tipo | Keywords |
|------|----------|
| **Primárias** | `verificar antes de implementar`, `já existe solução`, `solução mais simples`, `DRY check`, `pre-implementation` |
| **Frases PT-BR** | "já existe isso no projeto?", "tem solução mais simples?", "verificar antes de criar", "checar duplicação", "antes de implementar" |
| **Contexto** | Sanity check antes de escrever código novo — detectar duplicação e overengineering |
| **NÃO confundir** | Detecção de problemas de IA → `ai-problems-detection`; Pré-deploy → `pre-deploy-checklist` |
| **Localização** | `.claude/skills/pre-implementation/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/audit/pre-implementation.md` |

#### query-compliance
| Tipo | Keywords |
|------|----------|
| **Primárias** | `query compliance`, `query segura`, `índice`, `injection prevention`, `transação segura` |
| **Frases PT-BR** | "essa query tá segura?", "falta índice nessa query", "injection na query", "otimizar essa query", "transação atômica" |
| **Contexto** | Revisão de queries MongoDB para segurança e performance |
| **NÃO confundir** | Operações de banco → `db-guardian`; Performance → `performance-audit` |
| **Localização** | `.claude/skills/query-compliance/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/database/query-compliance.md` |

#### schema-design
| Tipo | Keywords |
|------|----------|
| **Primárias** | `design de schema`, `modelagem`, `normalização`, `schema MongoDB`, `índices de schema` |
| **Frases PT-BR** | "modelar esse schema", "normalizar o banco", "como estruturar essa collection", "schema correto para isso", "migrations seguras" |
| **Contexto** | Modelagem de schema MongoDB, definição de índices, migrations seguras |
| **NÃO confundir** | Operações → `db-guardian`; Queries → `query-compliance` |
| **Localização** | `.claude/skills/schema-design/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/database/schema-design.md` |

#### rest-api-design
| Tipo | Keywords |
|------|----------|
| **Primárias** | `REST API design`, `nomenclatura de rota`, `HTTP methods`, `status codes`, `paginação API`, `versionamento API` |
| **Frases PT-BR** | "nomenclatura das rotas correta?", "qual status code retornar?", "como paginar esse endpoint?", "versionamento de API", "design de REST API" |
| **Contexto** | Criação ou revisão de design de endpoints REST |
| **NÃO confundir** | Express middleware → `express-best-practices`; Segurança → `api-hardening` |
| **Localização** | `.claude/skills/rest-api-design/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/backend/rest-api-design.md` |

#### caching-strategies
| Tipo | Keywords |
|------|----------|
| **Primárias** | `estratégias de cache`, `cache-aside`, `L1 L2 L3`, `stale-while-revalidate`, `Redis keys`, `invalidação de cache` |
| **Frases PT-BR** | "qual estratégia de cache usar?", "cache-aside vs write-through", "como invalidar cache", "camadas de cache", "TTL correto" |
| **Contexto** | Definição de estratégia de cache: qual camada, qual padrão, qual TTL |
| **NÃO confundir** | Auditoria de cache existente → `cache-auditor`; Cache stale participante → `cache-sentinel` |
| **Localização** | `.claude/skills/caching-strategies/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/performance/caching-strategies.md` |

#### accessibility
| Tipo | Keywords |
|------|----------|
| **Primárias** | `acessibilidade`, `wcag`, `aria`, `contraste`, `a11y`, `teclado`, `screen reader` |
| **Frases PT-BR** | "app tá acessível?", "contraste ok?", "navegação por teclado", "aria labels", "WCAG 2.1", "acessibilidade do app" |
| **Contexto** | Implementar ou auditar acessibilidade WCAG 2.1 AA |
| **NÃO confundir** | UX completo → `ux-auditor-app`; Quality gates → `ui-ux-quality-gates` |
| **Localização** | `.claude/skills/accessibility/SKILL.md` |
| **Base agnóstica** | `.agnostic-core/skills/frontend/accessibility.md` |

---

### Agents Disponíveis (.claude/agents/)

Agentes especializados instalados do agnostic-core. Referenciar pelo path ou ativar via prompt:

| Agent | Função | Path |
|-------|--------|------|
| `security-reviewer` | Revisão de segurança com severidades CRITICA/ALTA/MEDIA/BAIXA | `.claude/agents/security-reviewer.md` |
| `frontend-reviewer` | Revisão HTML/CSS/JS com WCAG 2.1 AA e UX guidelines | `.claude/agents/frontend-reviewer.md` |
| `test-reviewer` | Coverage, design de testes, status APROVADO/BLOQUEAR | `.claude/agents/test-reviewer.md` |
| `performance-reviewer` | N+1, índices, cache ausente, prioridade por ROI | `.claude/agents/performance-reviewer.md` |
| `codebase-mapper` | Gera STACK.md, ARCHITECTURE.md, CONVENTIONS.md, CONCERNS.md | `.claude/agents/codebase-mapper.md` |
| `migration-validator` | Lock risk, reversibilidade, status APROVADO/AJUSTAR/BLOQUEAR | `.claude/agents/migration-validator.md` |
| `docs-generator` | README, ADR, CHANGELOG, OpenAPI a partir do código | `.claude/agents/docs-generator.md` |
| `database-architect` | Schema design, índices, migrations, seleção de ORM | `.claude/agents/database-architect.md` |
| `devops-engineer` | Deploy, rollback, zero-downtime, emergência | `.claude/agents/devops-engineer.md` |

---

## Tabela Rápida de Resolução

Consulta rápida: "o usuário disse X → qual skill usar?"

| Usuário disse... | Skill | Motivo |
|-------------------|-------|--------|
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
| "reinicie o servidor" | `restart-server` | Operação de infra |
| "salve o contexto" | `newsession` | Handover de sessão |
| "tem certeza disso?" | `fact-checker` | Validação de fatos |
| "antes de codar, verifique" | `ai-problems-detection` | Pré-check |
| "esse arquivo tá enorme" | `Refactor-Monolith` | Decomposição |
| "adaptar esse html pro projeto" | `stitch-adapter` | Conversão HTML externo |
| "recebi html externo" | `stitch-adapter` | Adaptação de código |
| "avalie qualidade deste html" | `stitch-adapter` | Avaliação score 0-100 |
| "gerar tela no stitch" | `stitch-adapter` | MCP: generate_screen_from_text |
| "mockup no stitch" | `stitch-adapter` | MCP: geração de design |
| "variante no stitch" | `stitch-adapter` | MCP: generate_variants |
| "listar projetos do stitch" | `stitch-adapter` | MCP: list_projects |
| "design no stitch" | `stitch-adapter` | MCP: pipeline completo |
| "endpoint do cartola" | `cartola-api` | API externa |
| "cache tá lento" | `cache-auditor` | Performance de cache |
| "cache antigo prevalecendo" | `cache-sentinel` | Monitoramento proativo |
| "dado desatualizado no app" | `cache-sentinel` | Cache stale participante |
| "vasculhar caches" | `cache-sentinel` | Investigação profunda |
| "audite o módulo top 10" | `auditor-module` | Auditoria de módulo |
| "auditar UX do app" | `ux-auditor-app` | Auditoria UX holística do app |
| "revisar design do participante" | `ux-auditor-app` | Consistência visual do app |
| "como tá o visual do app" | `ux-auditor-app` | Estado do design do app |
| "quais branches existem" | `analise-branches` | Análise git |
| "deletar branches mergeadas" | `delete-merged-branches` | Higienização git |
| "limpar branches antigas" | `delete-merged-branches` | Cleanup organizacional |
| "cleanup branches" | `delete-merged-branches` | Remover ponteiros merged |
| "executar auditoria mensal" | `context7-monthly-audit` | Auditoria preventiva |
| "já existe esse CSS?" | `anti-frankenstein` | Checkpoint pré-criação |
| "antes de criar esse componente" | `anti-frankenstein` | Governança de frontend |
| "blindar o CSS do projeto" | `anti-frankenstein` | Prevenção de duplicidade |
| "vou criar um arquivo CSS novo" | `anti-frankenstein` | Validação obrigatória |
| "anti-frank" | `anti-frankenstein` | Alias curto |
| "ative modo anti-frank" | `anti-frankenstein` | Ativação direta por alias |
| "sempre pensando no modo anti-frank" | `anti-frankenstein` | Modo persistente de governança |
| "HTMLs ativado no modo anti-frank" | `anti-frankenstein` | Checkpoint em criação de HTML |
| "verificar mudanças api cartola" | `context7-monthly-audit` | Check mensal automático |
| "auditar experiência ao vivo" | `live-experience` | Auditoria fluxo live completo |
| "parciais tão funcionando?" | `live-experience` | Validação de parciais live |
| "orchestrator tá ok?" | `live-experience` | Saúde do orchestrator |
| "pre-flight da rodada" | `live-experience` | Check antes da rodada |
| "criar uma skill nova" | `skill-creator` | Meta |
| "instalar skill X" | `skill-installer` | Meta |
| "output muito grande" | `context-mode` | Proteção de contexto |
| "economizar contexto" | `context-mode` | Redirecionar para sandbox |
| "ctx doctor" | `context-mode:ctx-doctor` | Diagnóstico do plugin |
| "ctx stats" | `context-mode:ctx-stats` | Economia da sessão |
| "atualizar context-mode" | `context-mode:ctx-upgrade` | Update do plugin |
| "analisar output grande" | `context-mode` | ctx_execute/ctx_batch_execute |
| "quanto contexto economizei" | `context-mode:ctx-stats` | Relatório de economia |
| "quais MCPs temos?" | `project-reference` | Referencia detalhada |
| "detalhes das collections" | `project-reference` | Tipos de ID, divida tecnica |
| "tabela de keywords completa" | `project-reference` | Keyword→Skill map |
| "instalar github app" | `project-reference` | GitHub App do Claude Code |
| "conectar github ao claude" | `project-reference` | GitHub App vs MCP Server |
| "validar operação financeira" | `financial-operations` | Idempotência, auditoria |
| "follow the money" | `financial-operations` | Trilha de auditoria |
| "transação duplicada?" | `financial-operations` | Checklist idempotência |
| "ordem dos middlewares" | `express-best-practices` | Padrões Express |
| "estrutura Express" | `express-best-practices` | Controller/Service |
| "endpoint tá seguro?" | `api-hardening` | Hardening de API |
| "validar input" | `api-hardening` | Sanitização |
| "tá lento" | `performance-audit` | Diagnóstico performance |
| "query lenta" | `performance-audit` | MongoDB explain |
| "N+1 queries" | `performance-audit` | Otimização de queries |
| "interface tá pronta?" | `ui-ux-quality-gates` | 5 quality gates |
| "revisar arquitetura" | `architecture-reviewer` | Decisões técnicas |
| "como debugar isso?" | `systematic-debugging` | 4 fases debugging |
| "causa raiz" | `systematic-debugging` | 5 Porquês |
| "renderização quebrada" | `systematic-debugging` | Bug visual = debugging |
| "tá quebrado" | `systematic-debugging` | Bug report |
| "não aparece" / "sumiu" | `systematic-debugging` | Elemento ausente = bug |
| "parou de funcionar" | `systematic-debugging` | Regressão |
| "pattern tailwind" | `tailwind-patterns` | Utility classes |
| "como tratar esse erro?" | `error-handling` | Try/catch patterns |
| "tá tudo consistente?" | `post-implementation-conformity` | Auditoria pós-implementação |
| "nada ficou pra trás?" | `post-implementation-conformity` | Conformidade cruzada |
| "auditar conformidade" | `post-implementation-conformity` | Cross-references + docs |
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

## Combinações de Skills (Workflows Comuns)

| Cenário | Sequência de Skills |
|---------|---------------------|
| Feature nova completa | `workflow` → `pesquisa` → `spec` → `ai-problems-detection` → `code` → `post-implementation-conformity` → `git-commit-push` |
| Feature com frontend | `workflow` → `pesquisa` → `spec` → `anti-frankenstein` → `frontend-crafter` → `code` → `post-implementation-conformity` → `git-commit-push` |
| Bug report | `systematic-debugging` → `code` → `git-commit-push` |
| Bug fix com lição | `systematic-debugging` → `code` → LESSONS.md → `post-implementation-conformity` → `git-commit-push` |
| Nova skill | `skill-creator` → `post-implementation-conformity` → `git-commit-push` |
| CSS novo (pipeline completo) | `frontend-design` → `anti-frankenstein` → `frontend-crafter` → `post-implementation-conformity` → `git-commit-push` |
| Refatoração | `Refactor-Monolith` → `code-inspector` → `git-commit-push` |
| Deploy completo | `git-commit-push` → `deploy` |
| Auditoria de módulo | `auditor-module` → `code-inspector` → `cache-auditor` |
| Auditoria UX pré-release | `ux-auditor-app` → `cache-auditor` → `code-inspector` |
| Auditoria UX + correção | `ux-auditor-app` → `frontend-crafter` |
| Auditoria live pré-rodada | `live-experience` → `cache-auditor` → `ux-auditor-app` |
| Auditoria live completa | `live-experience --report` → `auditor-module parciais` → `cache-auditor CACHE-APP --participante` |
| Cache stale participante | `cache-sentinel --full` (profundidade no participante) |
| Pre-flight rodada (cache) | `cache-sentinel --live` → `live-experience` |
| Pre-release cache completo | `cache-sentinel --full` → `cache-auditor CACHE-WEB --admin` |
| HTML externo → Código | `stitch-adapter` → `frontend-crafter` (ajustes se necessário) |
| Design com Stitch MCP | Stitch MCP (gerar) → `frontend-design` (validar estetica) → `stitch-adapter` (avaliar + adaptar) → `anti-frankenstein` (governanca) → `frontend-crafter` (implementar) |
| Variantes com Stitch MCP | Stitch MCP (generate_variants) → `frontend-design` (escolher melhor) → `stitch-adapter` → `anti-frankenstein` → `frontend-crafter` |
| Redesign com Stitch MCP | Screenshot atual → Stitch MCP (redesign) → `frontend-design` → `stitch-adapter` → `anti-frankenstein` → `frontend-crafter` |
| Higienização de branches | `analise-branches` → `delete-merged-branches` |
| Operação financeira | `financial-operations` → `code-inspector` → `git-commit-push` |
| Performance profunda | `performance-audit` → `cache-auditor` → `db-guardian` |
| Debugging sistemático | `systematic-debugging` → `code-inspector` (se for bug de segurança) |
| Endpoint novo seguro | `api-hardening` → `express-best-practices` → `code` → `code-inspector` |
| Entrega de interface | `frontend-crafter` → `ui-ux-quality-gates` → `ux-auditor-app` |
| Review arquitetural | `architecture-reviewer` → `code-inspector` → `performance-audit` |
| Documentação | `system-scribe` |
| Deploy completo | `git-commit-push` → `deploy` |
| Consulta API Cartola | `cartola-api` → `fact-checker` |
| Diagnóstico context-mode | `/ctx-doctor` → `/ctx-stats` → `/ctx-upgrade` (se necessário) |
| Análise de output grande | `context-mode` (ctx_batch_execute ou ctx_execute_file) → `ctx_search` (follow-up) |
| Feature com testes TDD | `tdd-workflow` → `code` → `unit-testing` → `integration-testing` |
| Deploy seguro | `pre-deploy-checklist` → `owasp-checklist` → `deploy-procedures` → `e2e-testing` (smoke) |
| Incidente em produção | `gestao-de-incidentes` → `observabilidade` → `systematic-debugging` |
| Nova endpoint REST | `rest-api-design` → `api-hardening` → `express-best-practices` → `query-compliance` |
| Nova collection MongoDB | `schema-design` → `query-compliance` → `db-guardian` |
| Mapeamento do codebase | Agente `codebase-mapper` → `architecture-reviewer` |
| Security review completo | `owasp-checklist` → `api-hardening` → Agente `security-reviewer` |
| Review de testes | Agente `test-reviewer` → `unit-testing` (gaps) |

---

## Notas Técnicas

- **Localização canônica:** Todas as skills residem em `docs/skills/[categoria]/`
- **Formato:** Markdown puro, agnóstico de IA (Claude, GPT, Gemini, etc.)
- **Manutenção:** Ao criar nova skill, adicionar entrada neste mapa E no `README.md`
- **Prioridade de match:** Keyword primária > frase PT-BR > contexto implícito
