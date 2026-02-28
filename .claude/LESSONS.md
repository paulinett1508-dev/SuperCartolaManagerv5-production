# Licoes Aprendidas - Super Cartola Manager

> **Proposito:** Registrar erros e licoes apos correcoes do usuario para evitar repeticao.
> **Quando atualizar:** Apos QUALQUER correcao do usuario (erro, abordagem errada, padrao violado).
> **Quando revisar:** No inicio de cada sessao nova.

---

## Registro de Licoes

| Data | Categoria | Erro Cometido | Licao Aprendida | Regra Adicionada ao CLAUDE.md? |
|------|-----------|---------------|-----------------|-------------------------------|
| 2026-02-26 | LOGICA | Capitão com multiplicador 2x — sistema inteiro calculava errado | Cartola FC 2026 usa **1.5x** para capitão (não 2x). Comprovado: soma 1x titulares + cap 1.5x = valor API oficial. Nunca confiar em docs genéricos, validar com dados reais. | Sim — regra adicionada |
| 2026-02-28 | FRONTEND | Ícones de zona (X/○/✓) mostravam errado — posições >32 eram "neutro" | Backend já envia `ligaConfig.zonaConfig.totalParticipantes` mas UI não consumia. `ligaConfigCache` ficava null e fallback de 32 era usado. **Sempre verificar se dados do backend estão sendo consumidos pela UI antes de criar fetch extra.** | Não |
| 2026-02-28 | FRONTEND | `const isLive` usada antes de ser declarada em `_renderizarDisputa` — ReferenceError temporal dead zone | Ao mover/reordenar código em funções JS, verificar se todas as `const`/`let` são declaradas ANTES de serem usadas. `var` tem hoisting, `const`/`let` não. Revisão de ordem de declarações é obrigatória após edições que movem blocos de código. | Não |
| 2026-02-28 | FRONTEND | `escapeHtml` usada sem estar definida em `top10.js` — ReferenceError | Módulos JS isolados (carregados via import dinâmico no admin) devem definir funções utilitárias como `escapeHtml` localmente. Padrão: copiar de `rodadas-ui.js`. Não depender de `window.escapeHtml` que pode não estar carregado. | Não |
| 2026-02-28 | FRONTEND | `escapeHtml` usada sem estar definida em `capitao-luxo.js` — mesmo erro recorrente | **2ª ocorrência** — padrão confirmado: TODO módulo admin deve ter `escapeHtml` local. Checklist ao criar/editar módulo admin: verificar se usa `escapeHtml` e se está definida. | Não |

### Categorias Validas
- **DADOS** — Queries erradas, tipos de ID, collections incorretas
- **FRONTEND** — CSS duplicado, emoji no codigo, cores hardcoded, SPA init
- **LOGICA** — Regra de negocio mal interpretada, calculo errado, arredondamento
- **PROCESSO** — Violou planejamento, nao verificou, nao perguntou antes

---

## Padroes Recorrentes

> Quando 3+ licoes da mesma categoria aparecerem, documentar o padrao aqui e propor regra no CLAUDE.md.

_(vazio)_

---

## Regras Geradas por Licoes

> Regras que foram adicionadas ao CLAUDE.md como resultado direto de licoes aprendidas.

| Data | Regra | Secao do CLAUDE.md | Licao Origem |
|------|-------|--------------------|--------------|
| — | _(vazio)_ | — | — |
