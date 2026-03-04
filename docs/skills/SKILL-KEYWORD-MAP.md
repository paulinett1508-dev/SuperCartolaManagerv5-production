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

#### replit-pull
| Tipo | Keywords |
|------|----------|
| **Primárias** | `replit pull`, `replit`, `deploy`, `sincronizar replit`, `produção` |
| **Frases PT-BR** | "pull no replit", "atualizar replit", "puxa no replit", "sincroniza o replit", "manda pro replit", "deploy replit", "publicar", "subir pra produção" |
| **Contexto** | Enviar código do GitHub para ambiente Replit (produção) |
| **NÃO confundir** | Git push (GitHub) ≠ Replit pull (deploy para produção) |
| **Localização** | `docs/skills/03-utilities/replit-pull.md` |

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
| **Primárias** | `referencia projeto`, `detalhes MCPs`, `collections`, `tipos de ID`, `keyword map`, `slash commands detalhados` |
| **Frases PT-BR** | "quais MCPs temos?", "detalhes das collections", "tabela de keywords", "como usar Perplexity", "como usar Stitch MCP", "sistema de renovacao", "backlog helper" |
| **Contexto** | Referencia detalhada do projeto: MCPs, collections MongoDB, keyword→skill map completo, slash commands, sistema de renovacao, versionamento, backlog |
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
| "atualize o replit" | `replit-pull` | Deploy |
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
| "quais MCPs temos?" | `project-reference` | Referencia detalhada |
| "detalhes das collections" | `project-reference` | Tipos de ID, divida tecnica |
| "tabela de keywords completa" | `project-reference` | Keyword→Skill map |

---

## Combinações de Skills (Workflows Comuns)

| Cenário | Sequência de Skills |
|---------|---------------------|
| Feature nova completa | `workflow` → `pesquisa` → `spec` → `ai-problems-detection` → `code` → `git-commit-push` |
| Feature com frontend | `workflow` → `pesquisa` → `spec` → `anti-frankenstein` → `frontend-crafter` → `code` → `git-commit-push` |
| Bug report | `fact-checker` → `code-inspector` → `code` → `git-commit-push` |
| Refatoração | `Refactor-Monolith` → `code-inspector` → `git-commit-push` |
| Deploy completo | `git-commit-push` → `replit-pull` → `restart-server` |
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
| Documentação | `system-scribe` |
| Deploy completo | `git-commit-push` → `replit-pull` |
| Consulta API Cartola | `cartola-api` → `fact-checker` |

---

## Notas Técnicas

- **Localização canônica:** Todas as skills residem em `docs/skills/[categoria]/`
- **Formato:** Markdown puro, agnóstico de IA (Claude, GPT, Gemini, etc.)
- **Manutenção:** Ao criar nova skill, adicionar entrada neste mapa E no `README.md`
- **Prioridade de match:** Keyword primária > frase PT-BR > contexto implícito
