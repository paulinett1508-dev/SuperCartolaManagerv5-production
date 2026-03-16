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
| 2026-03-12 | PROCESSO | Ao implementar feature com CSS (parciais AO VIVO), não acionei skills `frontend-design` nem `anti-frankenstein`. Usei cores hardcoded (#22c55e), criei animações sem verificar duplicatas, não consultei `css-registry.json`. | **O planejamento deve cruzar cada tarefa com o SKILL-KEYWORD-MAP.md.** Qualquer tarefa que envolva criação/modificação de CSS/HTML — por menor que seja — DEVE acionar anti-frankenstein (verificar registry, tokens, convenções) ANTES de escrever código. CSS "acessório" de feature backend não é exceção. Furo: o plano não incluía passo de ativação de skills. | Sim — propor regra |
| 2026-03-12 | LOGICA | `fluxoFinanceiroController` usava `!pagouInscricao` como condição para deduzir taxa de inscrição, enquanto `saldo-calculator.js` (fonte de verdade) SEMPRE deduz. Divergência de até R$180 entre tesouraria admin e extrato participante. | **Cálculos financeiros no extrato individual DEVEM espelhar `saldo-calculator.js` (fonte de verdade).** Quando saldo-calculator diz "sempre deduzir taxa", o fluxoFinanceiroController não pode condicionar com `pagouInscricao`. O pattern correto: sempre deduzir taxa, AcertoFinanceiro cancela automaticamente quando pago. Também: `divida_anterior` deve ser deduzida mesmo quando inscrição já está no cache. | Não |
| 2026-03-13 | DADOS | Scheduler populava rodadas sem `repopular:true`. Se API Cartola falhava para N times (429/timeout), registros com `pontos:0, rodadaNaoJogada:true` eram criados e NUNCA corrigidos — `findOne` encontrava registro existente e pulava. R5 com 34/35 times zerados. | **Falha de API externa ≠ dado válido.** Quando um fetch externo falha: (1) NUNCA gravar como dado legítimo (`rodadaNaoJogada`) — usar flag de falha (`populacaoFalhou`), (2) Safety nets que checam "registro existe?" devem verificar QUALIDADE do registro, não apenas existência, (3) Retry automático com backoff é obrigatório para dados críticos. | Sim — padrão novo |
| 2026-03-14 | LOGICA | Resta Um ordenava/exibia `pontosAcumulados` em modo consolidado, mas o módulo é rodada a rodada — cada rodada é independente e `pontosRodada` define o eliminado. Backend e frontend usavam `exibirAcumulado = !isLive` para alternar entre acumulado (consolidado) e rodada (live). | **Resta Um é rodada a rodada, NÃO acumula.** SEMPRE exibir e ordenar por `pontosRodada` DESC. `pontosAcumulados` existe apenas como metadado de desempate. Eliminados preservam `pontosRodada` da rodada de eliminação (não sobrescrever com rodada vigente). Docs: `docs/references/resta-um.md` | Sim — doc criada |
| 2026-03-14 | DADOS | `rodadaContextoController` buscava `ExtratoFinanceiroCache` com `liga_id: ObjectId(...)`, mas o schema define `liga_id` como String (com setter `String(v)`). Query nunca encontrava o documento → card Financeiro do Raio-X sempre zerado. | **ExtratoFinanceiroCache.liga_id é String, não ObjectId.** Ao consultar collections com `liga_id` normalizado para String, usar `String(ligaId)` na query. Verificar o schema/model ANTES de montar queries — campos com `set:` transformers podem ter tipo diferente do esperado. Padrão recorrente: IDs mistos entre collections (ver CLAUDE.md "IDs mistos"). | Não |
| 2026-03-15 | PROCESSO | Ao adicionar live ranking card (CSS novo em matchday.css), não adicionei `?v=` para cache busting no `<link>` do index.html. Browser serviu CSS antigo sem os estilos novos → card renderizou como texto puro, escudos gigantes, layout totalmente quebrado em PROD. | **Todo CSS novo ou modificado significativamente DEVE ter cache busting atualizado (`?v=X`) no `<link>` correspondente em index.html.** Especialmente crítico para arquivos que já estão em PROD sem versão. Checklist pós-deploy: (1) arquivo CSS salvo, (2) `?v=` incrementado, (3) verificar no browser se estilos aplicam. | Sim — regra "Cache busting obrigatório" em Coding Standards |
| 2026-03-15 | PROCESSO | Seletor CSS `.home-live-active #matchday-header-bar { display:none }` nunca funcionou porque `#matchday-header-bar` é injetado FORA de `#home-container` (antes de `#moduleContainer`). Ao escrever seletor CSS descendente, não verifiquei a árvore DOM real onde o elemento é injetado. | **Antes de escrever seletor CSS descendente (`.parent .child`), verificar a árvore DOM real** — elementos injetados via JS podem estar fora do container esperado. Preferir toggle via JS direto quando o parentesco DOM não é garantido. | Sim — regra "Seletores CSS descendentes + DOM injetado" em Coding Standards |
| 2026-03-15 | PROCESSO | Skills `anti-frankenstein` e `frontend-design` deveriam ter sido ativadas ao implementar live ranking card (envolve CSS/HTML novo), mas não foram. 2ª ocorrência deste padrão (1ª em 2026-03-12). Skills de CSS/design precisam ser ativadas AUTOMATICAMENTE, não depender de lembrança manual. | **2ª ocorrência de skills CSS não ativadas.** O protocolo de planejamento JÁ exige cruzamento com SKILL-KEYWORD-MAP.md mas continua sendo ignorado na prática. Reforço: ao criar TODO com qualquer arquivo `.css` ou HTML com `class=`, a skill anti-frankenstein DEVE ser listada como sub-tarefa obrigatória. | Não |
| 2026-03-15 | PROCESSO | Ao receber bug report "renderização quebrada", não ativei `superpowers:systematic-debugging` antes de investigar. Fiz 3 rodadas de perguntas manuais ao usuário em vez de seguir protocolo estruturado de debug. A skill teria guiado a investigação e evitado perguntas desnecessárias (cache busting é causa óbvia para CSS novo não aplicando). **3ª ocorrência de skill não ativada** (1ª: anti-frank 2026-03-12, 2ª: anti-frank/frontend-design 2026-03-15). | **Bug report = ativar `superpowers:systematic-debugging` ANTES de qualquer pergunta ou investigação.** Skills determinam COMO investigar. Perguntas ao usuário vêm DEPOIS do protocolo de debug, não antes. Red flag do `using-superpowers`: "Let me explore the codebase first" → errado, skill primeiro. | Não |
| 2026-03-15 | DADOS | Scraper Globo mapeava `moment:'NOW'` → `statusRaw:'LIVE'`, causando `stats.aoVivo:18` falso (18 jogos "ao vivo" sem nenhum realmente rolando). O `moment:'NOW'` do Globo é bucket de agenda (horário do dia), NÃO indicador real-time. Guard existente (`cache-stale`) não pegava porque fonte era `'globo'` (dados "frescos", porém semanticamente errados). | **Globo é fonte de AGENDA, não livescore.** Nunca confiar em `moment:'NOW'` como "jogo ao vivo". Para fontes sem granularidade real-time: (1) usar janela kickoff+150min para inferir status, (2) guard no endpoint zerando `aoVivo` quando fonte é apenas agenda. Padrão geral: validar a **semântica** dos dados de cada fonte, não apenas o formato. Dado "fresco" ≠ dado "correto". | Não |
| 2026-03-15 | FRONTEND | Banner "RODADA AO VIVO" e badge LIVE apareciam mesmo sem jogos rolando. Card aviso da Home injetava badge LIVE hardcoded (`avisoTitulo.innerHTML = 'RODADA EM ANDAMENTO <span class="live-badge-mini">LIVE</span>'`) sem checar `isJogosAoVivo()`. Toast de ativação do matchday-service sempre dizia "Rodada ao vivo!". | **Todo texto/badge de "AO VIVO" deve ser condicional a `stats.aoVivo > 0`** (fonte real-time confirmada). Quando `aoVivo === 0` mas rodada ativa → usar "EM ANDAMENTO". Checar todas as superfícies: header, cards, FAB, toasts. Nunca hardcodar estado live — sempre consultar ground truth. | Não |
| 2026-03-15 | PROCESSO | App do participante fazia 7-9 fetches a cada acesso (cold/warm start). 3 sistemas de cache sobrepostos (ParticipanteCacheDB, SuperCartolaOffline, ParticipanteCacheManager) causavam inconsistências. Dados imutáveis (rodadas consolidadas) eram re-buscados desnecessariamente. | **Super Cache Inteligente implementado.** Backend envia `cacheHint` (ttl, imutavel, versao) em todo response. Frontend unificado (L1 memória + L2 IndexedDB) com SWR inteligente. Imutáveis NUNCA revalidam. Warm start: 0-3 requests (vs 7-9). Navegação SPA: 0 re-fetches. Referência: `docs/superpowers/specs/2026-03-15-super-cache-inteligente-design.md` | Não |

### Categorias Validas
- **DADOS** — Queries erradas, tipos de ID, collections incorretas
- **FRONTEND** — CSS duplicado, emoji no codigo, cores hardcoded, SPA init
- **LOGICA** — Regra de negocio mal interpretada, calculo errado, arredondamento
- **PROCESSO** — Violou planejamento, nao verificou, nao perguntou antes

---

## Padroes Recorrentes

> Quando 3+ licoes da mesma categoria aparecerem, documentar o padrao aqui e propor regra no CLAUDE.md.

### PROCESSO — Skills não ativadas antes de agir (3 ocorrências)
- `anti-frankenstein` não ativada ao criar CSS do live card (2026-03-12)
- `anti-frankenstein` + `frontend-design` não ativadas ao implementar live ranking card (2026-03-15)
- `systematic-debugging` não ativada ao receber bug report de renderização (2026-03-15)

**Padrão:** Skills existem e são pertinentes, mas são ignoradas por racionalização ("é simples", "deixa eu investigar primeiro", "já sei o que fazer"). O protocolo `using-superpowers` lista isso como red flag explícito, mas continua acontecendo.

**Regra:** Antes de QUALQUER ação (incluindo perguntas ao usuário), verificar se alguma skill se aplica. Bug = `systematic-debugging`. CSS/HTML = `anti-frankenstein`. Decisão visual = `frontend-design`. Skill primeiro, ação depois.

---

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
| 2026-03-12 | Planejamento DEVE cruzar tarefas com SKILL-KEYWORD-MAP; anti-frankenstein obrigatório antes de qualquer CSS | Seções "Protocolo de Planejamento" + "Skills & Commands" | CSS hardcoded sem anti-frank no feature parciais AO VIVO |
| 2026-03-15 | Cache busting obrigatório ao criar/modificar CSS — incrementar `?v=X` no `<link>` | Seção "Coding Standards" | matchday.css sem ?v= quebrou live card em PROD |
| 2026-03-15 | Seletores CSS descendentes: verificar árvore DOM real antes de usar `.parent .child` | Seção "Coding Standards" | Header bar injetado fora do container esperado |
| 2026-03-15 | Skill antes de ação — SEMPRE. Bug→systematic-debugging, CSS→anti-frank, Visual→frontend-design | Seção "Skills & Commands" | 3 ocorrências de skill ignorada (padrão recorrente PROCESSO) |
