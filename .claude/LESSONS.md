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
| 2026-02-28 | FRONTEND | `escapeHtml` usada sem estar definida em `pontos-corridos-ui.js` — 3ª ocorrência | **3ª ocorrência** — escalação obrigatória. Módulos ES6 com `import` (não script global) NUNCA têm acesso a `window.escapeHtml`. Regra: ao criar qualquer módulo com template literals HTML, adicionar `escapeHtml` local imediatamente. Proposta de regra no CLAUDE.md adicionada. | Sim — ver Padroes Recorrentes |
| 2026-03-04 | PROCESSO | Após corrigir `artilheiro-campeao.js`, não atualizei `ADMIN_JS_VERSION` — browser carregou cache antigo e o fix não chegou ao usuário | **Ao editar QUALQUER arquivo JS carregado dinamicamente pelo orquestrador admin, SEMPRE incrementar `ADMIN_JS_VERSION` em `detalhe-liga-orquestrador.js` (linha 9) como último passo do fix.** | Sim |
| 2026-03-04 | LOGICA | `verificarCacheValido` aceitava cache pré-temporada (ultima_rodada=0) mesmo após a temporada ter iniciado com rodadas reais. Fixes v6.8 aplicados só em `getExtratoCache`, esquecendo `verificarCacheValido`. | Quando um fix é aplicado a uma função de um controller, verificar se existem funções irmãs que fazem a mesma operação e precisam do mesmo fix. `verificarCacheValido` e `getExtratoCache` têm lógica duplicada de detecção de pré-temporada. | Não |
| 2026-03-04 | LOGICA | `verificarCacheValido` calculava `lancamentosIniciais` internamente mas não incluía no JSON de resposta, causando timeline vazia. Todos os outros paths da mesma função incluem `lancamentosIniciais`. | Ao adicionar novos fields a um objeto de resposta em um path, verificar TODOS os outros paths da mesma função e garantir consistência. | Não |
| 2026-03-04 | LOGICA | `popularCacheBackend` bloqueava `if (temporada === 2026) return` por todo o ano 2026, impedindo cache de extrato com rodadas reais. Deveria bloquear apenas durante pré-temporada real (`extrato.preTemporada === true`). | Nunca usar o ano hardcoded como proxy de "pré-temporada". Usar a flag `preTemporada` do objeto de dados. Anni passam, a flag persiste correta. | Não |
| 2026-03-06 | LOGICA | Adicionei campos por-rodada (melhorMes, artilheiro, luvaOuro, restaUm) no transformer e renderers, mas esses módulos NÃO geram transações por rodada. | **Módulos de premiação final** (Artilheiro, Luva de Ouro, Capitão, Resta Um, Bolão, Copa, Melhor Mês) premiam apenas ao final da disputa. O admin lança manualmente como Ajuste Financeiro (tipo "AJUSTE", rodada: null). Nunca criar campos por-rodada para esses módulos — eles aparecem na seção "Ajustes" do extrato, não nas rodadas. | Sim |

### Categorias Validas
- **DADOS** — Queries erradas, tipos de ID, collections incorretas
- **FRONTEND** — CSS duplicado, emoji no codigo, cores hardcoded, SPA init
- **LOGICA** — Regra de negocio mal interpretada, calculo errado, arredondamento
- **PROCESSO** — Violou planejamento, nao verificou, nao perguntou antes

---

## Padroes Recorrentes

> Quando 3+ licoes da mesma categoria aparecerem, documentar o padrao aqui e propor regra no CLAUDE.md.

### FRONTEND — `escapeHtml` não definida localmente (3 ocorrências)
- `top10.js` (2026-02-28)
- `capitao-luxo.js` (2026-02-28)
- `pontos-corridos-ui.js` (2026-02-28)

**Padrão:** Módulos JS carregados com `import` (ES6 modules) operam em escopo isolado — nunca enxergam `window.escapeHtml`. O template HTML usa a função mas ela não está definida localmente.

**Regra:** Ao criar ou editar qualquer módulo que usa template literals com dados de usuário, adicionar esta função local no topo:
```javascript
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

---

## Regras Geradas por Licoes

> Regras que foram adicionadas ao CLAUDE.md como resultado direto de licoes aprendidas.

| Data | Regra | Secao do CLAUDE.md | Licao Origem |
|------|-------|--------------------|--------------|
| 2026-03-06 | Módulos de premiação final NUNCA geram campos por-rodada | Seção "Módulos por Rodada vs Módulos de Premiação Final" | Campos per-rodada para Artilheiro/Luva/RestaUm/MelhorMes |
