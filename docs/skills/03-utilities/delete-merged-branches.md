---
name: Delete-Merged-Branches
description: >
  Skill para higienização de branches remotas já mergeadas via PRs.
  Analisa branches com PRs merged, lista para confirmação e deleta ponteiros remotos.
  Apenas organizacional — não afeta histórico, commits ou PRs.
  Keywords: deletar branches, limpar branches, cleanup branches, higienizar branches, branches mergeadas
allowed-tools: Read, Glob, Grep, Bash, TodoWrite
---

# DELETE MERGED BRANCHES — Higienização de Branches

## Objetivo

Identificar e deletar branches remotas que já foram mergeadas via Pull Requests fechados/merged. Operação puramente organizacional — remove apenas ponteiros de branches, mantendo intacto todo o histórico de commits, PRs, diffs e reviews.

---

## Ativação

### Comandos Diretos
- `/delete-merged-branches`
- `delete-merged-branches`

### Keywords
- "deletar branches mergeadas"
- "limpar branches"
- "cleanup branches"
- "higienizar branches"
- "branches mergeadas"
- "remover branches antigas"
- "limpeza de branches"
- "branches que já foram mergeadas"

---

## O que é Afetado vs. O que NÃO é Afetado

### Remove (ponteiros organizacionais)
- Referência da branch no remote (`refs/heads/nome-da-branch`)
- Entrada na listagem de branches do GitHub

### NÃO remove (histórico permanente)
- Pull Requests (continuam visíveis com discussão, reviews, commits)
- Commits (estão no `main` via merge — parte permanente do grafo Git)
- Diffs (acessíveis pela PR)
- Tags
- Git log / histórico

---

## Protocolo de Execução

### FASE 1: Listar Branches com PRs Mergeadas

```bash
# Buscar todas as branches remotas com PRs no estado "merged"
gh pr list --state merged --limit 200 --json number,title,headRefName,mergedAt,author --jq '.[] | "\(.headRefName)\t\(.number)\t\(.title)\t\(.mergedAt)\t\(.author.login)"'
```

**Output esperado:** Lista de branches cujo PR foi mergeado com sucesso.

### FASE 2: Filtrar Branches Protegidas

Branches que NUNCA devem ser deletadas:
- `main`
- `master`
- `develop`
- `staging`
- `production`
- Branch atual (`git branch --show-current`)

```bash
# Verificar quais dessas branches ainda existem no remote
git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||'
```

**Cruzamento:** Apenas branches que:
1. Existem no remote (ainda não foram deletadas)
2. Têm PR mergeado
3. NÃO são protegidas

### FASE 3: Apresentar ao Usuário (Dry-Run)

Formato de apresentação:

```
## Branches Mergeadas — Candidatas a Deleção

| # | Branch | PR | Mergeado em | Autor |
|---|--------|----|-------------|-------|
| 1 | claude/feature-xyz-abc123 | #42 | 2026-02-15 | user1 |
| 2 | fix/bug-login | #38 | 2026-02-10 | user2 |
| ... | ... | ... | ... | ... |

**Total:** X branches para deletar
**Protegidas (ignoradas):** main, master

Deseja prosseguir com a deleção? (Sim / Não / Selecionar específicas)
```

**OBRIGATÓRIO:** Aguardar confirmação explícita do usuário antes de prosseguir.

### FASE 4: Executar Deleção

```bash
# Para cada branch confirmada:
gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/{branch_name}"

# Alternativa via git:
git push origin --delete {branch_name}
```

### FASE 5: Relatório Final

```
## Relatório de Higienização

### Deletadas com sucesso (X)
- claude/feature-xyz-abc123 (PR #42)
- fix/bug-login (PR #38)

### Falhas (Y)
- nome-branch — Motivo: [erro retornado]

### Protegidas (ignoradas)
- main, master
```

---

## Proteções de Segurança

### Branches Protegidas (hardcoded)
```
main, master, develop, staging, production
```

### Regras de Segurança
1. **NUNCA** deletar branch sem PR mergeado confirmado
2. **NUNCA** deletar a branch atual de trabalho
3. **SEMPRE** apresentar lista completa antes de executar
4. **SEMPRE** aguardar confirmação explícita do usuário
5. **NUNCA** deletar branches com PRs apenas "closed" (sem merge) — só "merged"
6. Se houver erro em qualquer deleção, continuar com as demais e reportar falhas no final

### Modo Dry-Run (padrão)
Por padrão, a skill opera em **dry-run** (apenas lista, não deleta). A deleção só acontece após confirmação explícita.

---

## Exemplos de Uso

### Caso 1: Limpeza geral
```
USUARIO: "deletar branches mergeadas"
SKILL EXECUTA:
1. Lista todas branches com PR merged
2. Filtra protegidas
3. Apresenta tabela ao usuário
4. Aguarda confirmação
5. Deleta confirmadas
6. Relatório final
```

### Caso 2: Verificação sem deleção
```
USUARIO: "quais branches já foram mergeadas?"
SKILL EXECUTA:
1. Lista todas branches com PR merged
2. Apresenta tabela (dry-run)
3. Pergunta se deseja deletar
```

---

## Anti-Patterns (Nunca Faça)

### Deletar sem confirmação
```
# ERRADO — nunca automatizar deleção sem approval
git push origin --delete $(git branch -r --merged | grep -v main)
```

### Ignorar status do PR
```
# ERRADO — branches "closed" sem merge podem ter trabalho importante
gh pr list --state closed  # Inclui PRs que foram fechados SEM merge
```

### Deletar pelo merge status do Git (sem verificar PR)
```
# ERRADO — branch pode ter sido mergeada manualmente sem PR
git branch -r --merged main  # Não garante que teve PR
```

### Correto
```
# CERTO — verificar especificamente PRs no estado "merged"
gh pr list --state merged --json headRefName,number,mergedAt
```

---

## Checklist

- [ ] `gh` CLI está autenticado (`gh auth status`)
- [ ] Repositório tem remote configurado (`git remote -v`)
- [ ] Branches protegidas estão na lista de exclusão
- [ ] Lista apresentada ao usuário antes de deletar
- [ ] Confirmação explícita recebida
- [ ] Relatório final gerado com sucessos e falhas

---

## Skills Relacionadas

- [`analise-branches`](../04-project-specific/SKILL-ANALISE-BRANCHES.md) — Análise detalhada de branches (status, funcionalidade, commits). Complementa esta skill com dados mais ricos sobre cada branch.
- [`git-commit-push`](./git-commit-push.md) — Versionamento. Não confundir: push/commit ≠ cleanup de branches.

---

**STATUS:** Versão 1.0 (Estável)
**Última atualização:** 2026-02-28
