# Protocolo de Planejamento Obrigatório

**PRIORIDADE MÁXIMA - APLICÁVEL EM TODOS OS AMBIENTES (Web, Terminal, VS Code, Antigravity)**

## Regra de Ouro

**NUNCA inicie a programação ou tome decisões sem ANTES:**

1. **CRIAR UM PLANEJAMENTO COMPLETO** da tarefa solicitada
2. **LISTAR TODAS AS TAREFAS** usando `TodoWrite` tool
3. **QUESTIONAR O USUÁRIO** se o planejamento faz sentido
4. **AGUARDAR APROVAÇÃO EXPLÍCITA** antes de executar

## Fluxo Obrigatório

```
Solicitação do Usuário
    ↓
📋 FASE 1: PLANEJAMENTO
    • Analisar requisitos
    • Identificar dependências
    • Mapear riscos
    • Listar todos os passos
    ↓
✅ FASE 2: VALIDAÇÃO COM USUÁRIO
    • Apresentar plano completo
    • Questionar se faz sentido
    • Aguardar confirmação
    ↓
⚡ FASE 3: EXECUÇÃO (Modo Bypass)
    • Executar tarefas listadas
    • Marcar progresso em tempo real
    • Auto-accept edits (se configurado)
    • Se algo sair dos trilhos → PARE e re-planeje (nunca force)
    • Ao concluir cada tarefa → resumo curto do que mudou
```

## Formato de Apresentação

Sempre use este template ao planejar:

```markdown
## 📋 Planejamento da Tarefa: [NOME DA TAREFA]

### Contexto
[Breve resumo do que foi solicitado]

### Análise
[O que precisa ser feito e por quê]

### Tarefas Identificadas
1. [Tarefa 1] - [Justificativa]
2. [Tarefa 2] - [Justificativa]
...

### Riscos/Considerações
- [Risco 1]
- [Risco 2]

### Arquivos Afetados
- `/caminho/arquivo1.js` - [O que será alterado]
- `/caminho/arquivo2.md` - [O que será alterado]

---

**⚠️ Este planejamento faz sentido? Posso prosseguir?**
```

## FASE 3.5: Verificação Antes de Concluir

**NUNCA marque uma tarefa como concluída sem PROVAR que funciona.**

| Tipo de Mudança | Verificação Mínima |
|-----------------|-------------------|
| **Backend** (controller/route/model) | Testar endpoint (curl/Postman), verificar logs do servidor |
| **Frontend** (JS/HTML) | Verificar console do browser, testar interação. **Se arquivo carregado via `vImport()` no orquestrador admin → incrementar `ADMIN_JS_VERSION` em `detalhe-liga-orquestrador.js`** |
| **Script** (migration/cron) | Rodar com `--dry-run` primeiro |
| **CSS/Visual** | Confirmar render visual, checar responsivo |
| **Config/DB** | Validar schema, testar query |

**Checklist obrigatório:**
- [ ] Funciona? (testei/demonstrei)
- [ ] Diff correto? (reli `git diff` — só contém o pedido)
- [ ] Sem regressão? (nada existente quebrou)
- [ ] Staff engineer aprovaria este PR?

**Se algo sair dos trilhos durante execução:**
1. **PARE** imediatamente — não force uma solução
2. **Comunique** ao usuário o que mudou
3. **Re-planeje** com as novas informações
4. **Nunca** continue empurrando uma abordagem que não está funcionando

## Exceções (RARAS)

Este protocolo pode ser IGNORADO apenas se:

1. **Comando explícito de bypass**: Usuário diz "execute direto", "pule o planejamento"
2. **Tarefa trivial óbvia**: Ex: "leia o arquivo X.js" (1 ação simples)
3. **Continuação de tarefa aprovada**: Já está em execução de plano validado

## Configuração Auto-accept

Se `autoAcceptEdits: true` está configurado:

- **AINDA ASSIM** faça o planejamento primeiro
- Após aprovação, execute sem pausas
- Use `TodoWrite` para mostrar progresso

## Penalidades por Violação

Se você violar este protocolo:

1. **PARE IMEDIATAMENTE** a execução
2. **DESFAÇA** mudanças se possível
3. **CRIE O PLANEJAMENTO** que deveria ter feito
4. **PEÇA DESCULPAS** e recomece corretamente
