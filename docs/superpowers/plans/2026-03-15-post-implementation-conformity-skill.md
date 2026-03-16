# Post-Implementation Conformity Skill — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma skill de auditoria de conformidade pós-implementação — versão agnóstica (agnostic-core) + wrapper project-specific (Super Cartola)

**Architecture:** Skill agnóstica em `.agnostic-core/skills/audit/` com checklist genérico reutilizável. Wrapper project-specific em `docs/skills/04-project-specific/` que estende a agnóstica com checks do Super Cartola (cache busting, css-registry, LESSONS→regras, SKILL-KEYWORD-MAP). Integração no mapa de keywords.

**Tech Stack:** Markdown puro (skills agnósticas de IA)

---

## Contexto — O Gap Identificado

### O que já existe

| Skill existente | O que cobre | O que NÃO cobre |
|----------------|-------------|-----------------|
| `audit/validation-checklist.md` (agnostic-core) | Checklist pré-deploy genérico | Conformidade de docs, cross-refs |
| `audit/pre-implementation.md` (agnostic-core) | Verificação ANTES de codar | Verificação DEPOIS de codar |
| `audit/code-review.md` (agnostic-core) | Revisão de código | Revisão de processo/documentação |
| `workflow/context-audit.md` (agnostic-core) | Auditoria de tokens/contexto | Nada pós-implementação |
| `devops/pre-deploy-checklist.md` (agnostic-core) | Infraestrutura pré-deploy | Conformidade de regras |
| `auditor-module` (project) | 5 dimensões por módulo | Conformidade entre docs |
| `code-inspector` (project) | SPARC framework código | Processo e documentação |

### O que falta (cenário real)

> "Implementei algo. Documentei. Atualizei regras. Agora preciso validar que **tudo está consistente entre si**: cache busting aplicado, cross-references corretas, keywords atualizadas no mapa, workflows sem furos, lições gerando regras, regras refletidas no CLAUDE.md."

Nenhuma skill cobre essa auditoria de **conformidade cruzada pós-implementação**.

---

## Chunk 1: Skill Agnóstica (agnostic-core)

### Task 1: Criar skill agnóstica

**Files:**
- Create: `.agnostic-core/skills/audit/post-implementation-conformity.md`

- [ ] **Step 1: Escrever a skill agnóstica**

Conteúdo da skill (agnóstica, sem referências ao Super Cartola):

```markdown
# Conformidade Pós-Implementação

Auditoria de consistência entre código implementado, documentação atualizada e regras do projeto.
Roda DEPOIS de implementar e documentar — verifica que tudo está coeso e nada ficou para trás.

Diferente de code review (olha código) ou pre-deploy (olha infra): esta skill olha a
CONSISTÊNCIA CRUZADA entre todos os artefatos tocados.

---

QUANDO USAR

- Após implementar feature/fix + atualizar documentação
- Antes de considerar uma tarefa "completa"
- Quando múltiplos arquivos de configuração/docs foram modificados
- Após adicionar regras, lições aprendidas ou convenções

QUANDO NÃO USAR

- Para revisar código (usar code-review)
- Para validar infra pré-deploy (usar pre-deploy-checklist)
- Para auditar tokens/contexto de IA (usar context-audit)

---

CHECKLIST UNIVERSAL

  1. Cross-References
  - [ ] Todos os arquivos de docs referenciados existem nos paths indicados
  - [ ] Links internos entre docs apontam para conteúdo que existe
  - [ ] Nomes de funções/variáveis mencionados em docs correspondem ao código real
  - [ ] Exemplos em docs usam a API/interface atual (não versão antiga)

  2. Regras e Convenções
  - [ ] Novas regras adicionadas ao arquivo de configuração principal (CLAUDE.md, AGENTS.md, etc.)
  - [ ] Regras não contradizem regras existentes
  - [ ] Regras têm escopo claro (não ambíguas)
  - [ ] Lições aprendidas que geraram regras estão documentadas com rastreabilidade

  3. Índices e Mapas
  - [ ] Índices/catálogos atualizados com novos artefatos
  - [ ] Mapas de keywords/routing incluem novos termos
  - [ ] Tabelas de referência rápida refletem estado atual
  - [ ] Workflows/pipelines incluem nova skill/etapa onde aplicável

  4. Versionamento de Assets
  - [ ] Assets modificados têm cache busting atualizado (query strings, hashes, versões)
  - [ ] Registros/manifestos de assets refletem mudanças (ex: css-registry, package.json)
  - [ ] Imports/requires apontam para versões corretas

  5. Consistência de Nomenclatura
  - [ ] Novos termos seguem convenção do projeto (idioma, casing, formato)
  - [ ] Nomes em docs = nomes no código = nomes em configs
  - [ ] Sem termos sinônimos criando ambiguidade (ex: "user" e "usuario" para o mesmo conceito)

  6. Completude
  - [ ] Todos os TODOs criados durante implementação foram resolvidos ou registrados no backlog
  - [ ] Nenhum arquivo temporário/debug ficou no commit
  - [ ] Nenhuma funcionalidade implementada ficou sem documentação
  - [ ] Nenhuma documentação criada ficou sem implementação correspondente

---

COMO EXECUTAR

  1. Listar todos os arquivos modificados/criados nesta implementação
  2. Para cada arquivo de documentação: verificar cross-references
  3. Para cada regra nova: verificar consistência com existentes
  4. Para cada índice/mapa: verificar completude
  5. Para cada asset modificado: verificar cache busting
  6. Gerar relatório com: OK / WARNING / FAIL por categoria

SEVERITY

  FAIL: Cross-reference quebrada, regra contraditória, asset sem cache busting
  WARNING: Índice desatualizado, nomenclatura inconsistente, TODO pendente
  OK: Tudo verificado e consistente

---

SKILLS RELACIONADAS

  skills/audit/code-review.md          Revisão de código (complementar)
  skills/audit/validation-checklist.md Checklist pré-deploy (complementar)
  skills/audit/pre-implementation.md   Verificação pré-implementação (anterior no pipeline)
  skills/devops/pre-deploy-checklist.md Infraestrutura (posterior no pipeline)
```

- [ ] **Step 2: Verificar conformidade com CONTRIBUTING.md do agnostic-core**

O CONTRIBUTING.md pede:
- Categoria correta? → `skills/audit/` ✓
- Aplica a mais de um contexto? → Sim, qualquer projeto com docs + regras ✓
- Formato claro? → Checklist com seções ✓

- [ ] **Step 3: Commit no submodule**

```bash
cd .agnostic-core
git add skills/audit/post-implementation-conformity.md
git commit -m "feat: add post-implementation conformity audit skill"
```

---

## Chunk 2: Skill Project-Specific (Super Cartola)

### Task 2: Criar wrapper project-specific

**Files:**
- Create: `docs/skills/04-project-specific/post-implementation-conformity.md`

- [ ] **Step 1: Escrever a skill project-specific**

Conteúdo (estende a agnóstica com checks do Super Cartola):

```markdown
# Conformidade Pós-Implementação — Super Cartola

Auditoria de consistência cruzada entre código implementado, documentação e regras do projeto.
Roda DEPOIS de implementar e documentar — verifica que tudo está coeso.

Skill base agnóstica: `.agnostic-core/skills/audit/post-implementation-conformity.md`
Esta versão adiciona checks específicos do Super Cartola Manager.

---

QUANDO ATIVAR

- Após implementar feature/fix + atualizar CLAUDE.md, LESSONS.md ou SKILL-KEYWORD-MAP
- Antes de considerar uma tarefa "completa"
- Quando múltiplos MDs foram modificados numa sessão
- Após adicionar lições ou gerar regras em CLAUDE.md

---

CHECKLIST SUPER CARTOLA

  1. CLAUDE.md
  - [ ] Novas regras adicionadas na seção correta
  - [ ] Não contradiz regras existentes
  - [ ] Referências a docs/ apontam para arquivos que existem
  - [ ] Formato consistente com regras vizinhas (marcadores, estilo)

  2. LESSONS.md
  - [ ] Lições categorizadas (DADOS, FRONTEND, LOGICA, PROCESSO)
  - [ ] Padrões recorrentes (3+) têm proposta de regra
  - [ ] Tabela "Regras Geradas" atualizada com rastreabilidade
  - [ ] Cross-reference com CLAUDE.md: regra gerada existe lá

  3. SKILL-KEYWORD-MAP.md
  - [ ] Novas skills têm entrada no mapa
  - [ ] Keywords primárias cobrem termos reais que o usuário usaria
  - [ ] Frases PT-BR naturais e variadas
  - [ ] Tabela Rápida de Resolução atualizada
  - [ ] Workflows/Combinações de Skills atualizados
  - [ ] Seção "NÃO confundir" diferencia de skills similares

  4. Cache Busting (CSS/JS)
  - [ ] CSS modificado → ?v=X incrementado no <link> correspondente em index.html
  - [ ] JS admin modificado → ADMIN_JS_VERSION incrementado em detalhe-liga-orquestrador.js
  - [ ] css-registry.json atualizado se novo CSS criado

  5. config/css-registry.json
  - [ ] Novos arquivos CSS registrados
  - [ ] Keyframes novos no registry de keyframes
  - [ ] Load order correto se dependências existem
  - [ ] Versão do registry incrementada se modificado

  6. Regras Críticas (Critical Rules)
  - [ ] Nenhuma critical rule foi violada pela implementação
  - [ ] Se lição crítica → adicionada às Critical Rules
  - [ ] Todas as queries MongoDB incluem liga_id
  - [ ] Pontos truncados (nunca arredondados)
  - [ ] gemini_audit.py intacto

  7. Anti-Frankenstein (se CSS/HTML tocado)
  - [ ] anti-frankenstein foi ativado ANTES de criar CSS
  - [ ] Cores usam variáveis CSS de _admin-tokens.css (zero hardcoded)
  - [ ] Keyframes reutilizam existentes ou registram novos
  - [ ] Material Icons (nunca emojis)

---

COMO EXECUTAR

  1. git diff --name-only HEAD~N (listar arquivos da implementação)
  2. Para cada .md modificado: verificar cross-references
  3. Para cada .css modificado: verificar cache busting + css-registry
  4. Para cada regra nova: cruzar CLAUDE.md ↔ LESSONS.md
  5. Se skill nova: verificar SKILL-KEYWORD-MAP.md
  6. Gerar relatório: OK / WARNING / FAIL

SEVERITY

  FAIL: Cache busting ausente, regra contraditória, cross-ref quebrada, critical rule violada
  WARNING: Keyword map desatualizado, workflow incompleto, nomenclatura inconsistente
  OK: Tudo verificado e consistente

---

PIPELINE DE USO

  Implementação → Documentação → post-implementation-conformity → git-commit-push

  Cenários típicos:
  - Feature nova: code → system-scribe → post-implementation-conformity → git-commit-push
  - Bug fix com lição: systematic-debugging → code → LESSONS.md → post-implementation-conformity → git-commit-push
  - Nova skill: skill-creator → post-implementation-conformity → git-commit-push
  - CSS novo: anti-frankenstein → frontend-crafter → post-implementation-conformity → git-commit-push
```

- [ ] **Step 2: Commit**

```bash
git add docs/skills/04-project-specific/post-implementation-conformity.md
git commit -m "feat: add post-implementation-conformity skill (project-specific)"
```

---

## Chunk 3: Integração no SKILL-KEYWORD-MAP.md

### Task 3: Adicionar entrada no SKILL-KEYWORD-MAP

**Files:**
- Modify: `docs/skills/SKILL-KEYWORD-MAP.md`

- [ ] **Step 1: Adicionar entrada na seção 04 - Project-Specific**

Inserir após a entrada `live-experience`:

```markdown
#### post-implementation-conformity
| Tipo | Keywords |
|------|----------|
| **Primárias** | `conformidade`, `auditoria pós-implementação`, `verificar conformidade`, `checar consistência`, `validar documentação`, `cross-reference`, `tudo consistente?` |
| **Frases PT-BR** | "tá tudo consistente?", "verificar se nada ficou pra trás", "auditar conformidade", "checar cross-references", "LESSONS gerou regra?", "keyword map atualizado?", "cache busting tá ok?", "validar que tudo bate", "conferir documentação", "auditoria pós-implementação", "antes de fechar a tarefa" |
| **Contexto** | Auditoria de consistência cruzada APÓS implementar e documentar. Verifica CLAUDE.md ↔ LESSONS.md ↔ SKILL-KEYWORD-MAP ↔ css-registry ↔ cache busting |
| **NÃO confundir** | Auditoria de código → `code-inspector`; Auditoria de módulo → `auditor-module`; Checklist pré-deploy → agnostic-core; Auditoria UX → `ux-auditor-app` |
| **Localização** | `docs/skills/04-project-specific/post-implementation-conformity.md` |
| **Base agnóstica** | `.agnostic-core/skills/audit/post-implementation-conformity.md` |
```

- [ ] **Step 2: Adicionar na Tabela Rápida de Resolução**

```markdown
| "tá tudo consistente?" | `post-implementation-conformity` | Auditoria pós-implementação |
| "nada ficou pra trás?" | `post-implementation-conformity` | Conformidade cruzada |
| "auditar conformidade" | `post-implementation-conformity` | Cross-references + docs |
| "antes de fechar a tarefa" | `post-implementation-conformity` | Validação final |
```

- [ ] **Step 3: Adicionar nos Workflows/Combinações**

Novos workflows:

```markdown
| Feature completa (com docs) | `workflow` → `code` → `system-scribe` → `post-implementation-conformity` → `git-commit-push` |
| Bug fix com lição | `systematic-debugging` → `code` → `post-implementation-conformity` → `git-commit-push` |
| Nova skill | `skill-creator` → `post-implementation-conformity` → `git-commit-push` |
| CSS novo (pipeline completo) | `frontend-design` → `anti-frankenstein` → `frontend-crafter` → `post-implementation-conformity` → `git-commit-push` |
```

- [ ] **Step 4: Commit**

```bash
git add docs/skills/SKILL-KEYWORD-MAP.md
git commit -m "feat: add post-implementation-conformity to skill keyword map"
```

---

## Chunk 4: Push Final

### Task 4: Push para branch e remote

- [ ] **Step 1: Push do branch principal**

```bash
git push -u origin claude/add-live-round-card-lwRnm
```

- [ ] **Step 2: Push do submodule agnostic-core (se possível)**

Nota: o push para o submodule depende de permissões no repo `paulinett1508-dev/agnostic-core`. Se não tiver permissão direta, o commit fica local e pode ser incluído via PR separado.

```bash
cd .agnostic-core
git push origin main
```

---

## Resumo de Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| **Create** | `.agnostic-core/skills/audit/post-implementation-conformity.md` | Skill agnóstica reutilizável |
| **Create** | `docs/skills/04-project-specific/post-implementation-conformity.md` | Wrapper Super Cartola |
| **Modify** | `docs/skills/SKILL-KEYWORD-MAP.md` | Keywords + workflows + tabela rápida |
