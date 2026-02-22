# Skills - Agentes Especializados do Sistema

Este diretório contém todas as **skills** (agentes especializados) do Super Cartola Manager, organizadas por categoria funcional.

---

## 🚨 REGRA ABSOLUTA: AGNOSTICISMO DE AMBIENTE

**PRIORIDADE MÁXIMA** — Skills DEVEM ser portáteis entre ambientes.

### Proibido

- ❌ Criar skills em `~/.claude/skills/`
- ❌ Criar skills em `~/.agents/skills/`
- ❌ Criar skills fora do repositório do projeto
- ❌ Referenciar paths externos no CLAUDE.md

### Obrigatório

- ✅ Todas skills em `/docs/skills/[categoria]/`
- ✅ Versionadas no git
- ✅ Funcionam no VS Code, Antigravity, Terminal, Web

### Por quê?

O codebase deve funcionar em **QUALQUER ambiente** Claude Code sem dependências de arquivos locais do usuário. Se você abrir o projeto em outra máquina ou IDE, TODAS as skills devem estar disponíveis.

**Ao criar nova skill:** Use `skill-creator` que já inclui esta regra como prioridade máxima.

---

## 📁 Estrutura de Diretórios

```
skills/
├── 01-core-workflow/      # High Senior Protocol - Workflow principal
├── 02-specialists/        # Agentes especialistas técnicos
├── 03-utilities/          # Ferramentas auxiliares
├── 04-project-specific/   # Skills específicas do Super Cartola
└── 05-meta/              # Skills para gerenciar skills
```

---

## 🔄 01 - Core Workflow (High Senior Protocol)

Skills que formam o **protocolo de desenvolvimento profissional** - fluxo completo de pesquisa → especificação → implementação:

| Skill | Fase | Descrição | Quando Usar |
|-------|------|-----------|-------------|
| **workflow** | Maestro | Detecta fase automaticamente e orquestra o fluxo | `/workflow` no início de cada sessão |
| **pesquisa** | Fase 1 | Busca autônoma no codebase, gera PRD.md | Quando receber nova tarefa |
| **spec** | Fase 2 | Mapeia dependências, define mudanças cirúrgicas | Após ter PRD completo |
| **code** | Fase 3 | Aplica mudanças linha por linha | Após ter SPEC aprovada |

**Fluxo:**
```
/workflow → FASE 1: /pesquisa → PRD.md
         → FASE 2: /spec → SPEC.md
         → FASE 3: /code → Código implementado
```

---

## 🎯 02 - Specialists (Especialistas Técnicos)

Agentes com expertise profunda em áreas específicas:

| Skill | Expertise | Quando Usar |
|-------|-----------|-------------|
| **frontend-design** | Autoridade Estética Máxima | "redesign", "nova tela", "visual do app", "deixar bonito" |
| **anti-frankenstein** | Governança CSS/Frontend | "já existe esse CSS?", "antes de criar CSS", "blindar frontend" |
| **code-inspector** | Auditoria Sênior de Código | "auditar código", "security review", "OWASP check" |
| **db-guardian** | MongoDB, Segurança de Dados, Migrations | Scripts DB, limpeza, manutenção, snapshots |
| **frontend-crafter** | Frontend Mobile-First, UX, Cache Offline | Criar/ajustar telas, componentes, CSS/JS |
| **league-architect** | Regras de Negócio, Lógica de Ligas | Criar configs de liga, calcular finanças |
| **system-scribe** | Documentação Viva do Sistema | "explique módulo X", "como funciona Y?" |

---

## 🛠️ 03 - Utilities (Ferramentas Auxiliares)

Skills utilitárias para tarefas específicas:

| Skill | Função | Quando Usar |
|-------|--------|-------------|
| **ai-problems-detection** | Detecta 5 problemas comuns da IA | Antes de implementar: overengineering, duplicação, etc |
| **fact-checker** | Protocolo Anti-Alucinação | "verifique se", "confirme que" |
| **git-commit-push** | Commits e push automatizados | "git push", "commite tudo" |
| **Refactor-Monolith** | Decomposição de arquivos grandes | "refatorar arquivo grande", "separar em módulos" |
| **replit-pull** | Sincronização GitHub ↔ Replit | "pull no replit", "atualizar replit", "deploy" |
| **restart-server** | Reiniciar servidor Node.js | "reiniciar servidor", "restart" |
| **stitch-adapter** | Adapta código do Google Stitch para stack do projeto | "adaptar código do stitch", "html do google stitch" |
| **newsession** | Handover entre sessões | Transferir contexto para nova sessão |

---

## ⚽ 04 - Project-Specific (Específicas do Projeto)

Skills desenvolvidas especificamente para o Super Cartola Manager:

| Skill | Função | Quando Usar |
|-------|--------|-------------|
| **cartola-api** | Base de conhecimento da API Cartola FC | Consultar endpoints, schemas, scouts, autenticação |
| **auditor-module** | Auditoria de módulos do sistema | Validar implementação de novos módulos |
| **cache-auditor** | Auditoria de cache (3 ambientes) | Detectar cache stale/morto, validar coerência, otimizar velocidade |
| **cache-sentinel** | Monitoramento proativo de cache participante | "cache stale", "cache antigo prevalecendo", "vasculhar caches" |
| **ux-auditor-app** | Auditoria UX do app participante | "auditar UX do app", "revisar design participante" |
| **live-experience** | Auditoria de experiência ao vivo | "auditar live", "parciais ao vivo", "pre-flight rodada" |
| **context7-monthly-audit** | Auditoria mensal preventiva | "auditoria mensal", "verificar mudanças API" |
| **analise-branches** | Análise de branches Git | Comparar branches, identificar divergências |

---

## 🎓 05 - Meta (Skills sobre Skills)

Skills para gerenciar e criar outras skills:

| Skill | Função | Quando Usar |
|-------|--------|-------------|
| **skill-creator** | Guia para criar skills efetivas | "criar skill", "fazer skill" |
| **skill-installer** | Instalar skills do catálogo | "instalar skill", "listar skills" |

---

## 🔌 MCPs + Skills (Integrações Padronizadas)

MCPs (Model Context Protocol servers) fornecem **ferramentas externas** que se integram com as skills do projeto. A integração segue pipelines padronizados.

### Stitch MCP → Skills Frontend (Pipeline de Design)

O pipeline mais complexo do projeto — transforma designs visuais em código production-ready:

```
Stitch MCP (gerar/iterar design)
    ↓
frontend-design (validar direção estética)
    ↓
stitch-adapter (avaliar score 0-100 + adaptar para design system)
    ↓
anti-frankenstein (governança: duplicação, tokens, convenções)
    ↓
frontend-crafter (implementar production-ready)
```

**Guia completo:** [`docs/guides/STITCH-MCP-PIPELINE.md`](../guides/STITCH-MCP-PIPELINE.md)
**Prompt padrão:** `.claude/STITCH-DESIGN-PROMPT.md`

### Outros MCPs

| MCP | Skills Relacionadas | Integração |
|-----|---------------------|------------|
| **Mongo** | `db-guardian`, `cache-sentinel` | Consultas diretas ao banco |
| **Context7** | `pesquisa`, `context7-monthly-audit`, `fact-checker` | Docs atualizadas de frameworks |
| **Perplexity** | `pesquisa`, `fact-checker`, `cartola-api` | Pesquisa web, notícias recentes |
| **Stitch** | `stitch-adapter`, `frontend-design`, `frontend-crafter` | Design-to-code pipeline |

---

## 🤝 Filosofia Agnóstica

Esta estrutura foi projetada para ser **agnóstica em relação à IA**:

- ✅ **Markdown puro** - legível por qualquer sistema
- ✅ **Sem dependências** do formato Claude/.skills
- ✅ **Documentação clara** - outras IAs podem colaborar
- ✅ **Hierarquia funcional** - organização por propósito

---

## 🔑 Ativação por Keywords

Skills são ativadas automaticamente por **palavras-chave contextuais** na mensagem do usuário.
Não é necessário chamar pelo nome direto - o sistema identifica a skill pela intenção.

**Mapeamento completo:** [`SKILL-KEYWORD-MAP.md`](SKILL-KEYWORD-MAP.md)

### Para Qualquer IA
1. Leia [`SKILL-KEYWORD-MAP.md`](SKILL-KEYWORD-MAP.md) para identificar a skill pela mensagem
2. Carregue o `.md` da skill correspondente em `docs/skills/[categoria]/`
3. Siga o protocolo descrito na skill
4. Use as ferramentas disponíveis (Glob, Grep, Read, etc)

### Invocação Direta (também funciona)
```bash
# Via slash command
/workflow
/pesquisa
/code-inspector
```

---

## 🔄 Atualização e Manutenção

- **Adicionar nova skill:** Coloque no diretório apropriado, atualize este README E o `SKILL-KEYWORD-MAP.md`
- **Modificar skill:** Edite o arquivo `.md` correspondente
- **Deprecar skill:** Mova para `docs/archives/skills/deprecated/` e remova do mapa de keywords

---

## 📚 Recursos Relacionados

- **Keyword Map:** [`SKILL-KEYWORD-MAP.md`](SKILL-KEYWORD-MAP.md) - Mapeamento keywords → skills
- **PRDs/SPECs:** `/docs/specs/` - Especificações de funcionalidades
- **Arquitetura:** `/docs/architecture/` - Documentos técnicos do sistema
- **Guias:** `/docs/guides/` - Tutoriais e workflows
- **Regras:** `/docs/rules/` - Regras de negócio configuradas
