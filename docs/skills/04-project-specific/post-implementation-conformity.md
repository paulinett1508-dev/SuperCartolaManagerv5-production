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
