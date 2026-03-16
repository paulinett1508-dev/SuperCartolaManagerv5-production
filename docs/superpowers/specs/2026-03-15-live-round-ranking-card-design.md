# Live Round Ranking Card — Design Spec

## Problema

O card "Rodada ao Vivo" na home do participante é lento, mostra apenas "Carregando parciais..." e não traz informação útil. O ticker de scroll com top 8 é insuficiente. A experiência de quem acompanha a rodada ao vivo é ruim.

## Solução

Substituir o hero card da home por um **ranking parcial completo inline** quando a rodada está ao vivo. Card compacto, fonte pequena, com todos os participantes, mostrando nome do participante, nome do time, escudo, brasão do clube e atletas em campo. Desaparece quando a rodada consolida.

## Estrutura Visual

```
┌──────────────────────────────────────────────────────────────┐
│ ● RODADA 6 AO VIVO                              há 5s      │
├──────────────────────────────────────────────────────────────┤
│ 1  [brasão][escudo] João Silva · Urubu Play FC   52.31 10/12│
│ 2  [brasão][escudo] Maria Costa · Flamengo FC    48.77  8/12│
│ 3  [brasão][escudo] Pedro Santos · São Paulo     45.02 11/12│
│ ...                                                          │
│ 34 [brasão][escudo] Paulinett · Urubu Play FC    12.50  4/12│ ← highlight
│ 35 [brasão][escudo] Carlos Lima · Águia FC        8.33  6/12│
└──────────────────────────────────────────────────────────────┘
   Ver detalhes da rodada  →
```

**Layout:** Single-line compacto. Fonte pequena (11-12px). Nome do participante + nome do time na mesma linha separados por " · ". Pontos e em-campo alinhados à direita.

## Componentes

### 1. Header
- Dot verde pulsante (`--app-success-light`)
- "RODADA X AO VIVO" — Russo One, 13px, uppercase
- Timestamp relativo à direita — JetBrains Mono, 11px, `--app-text-muted`
- Sem ticker de scroll (substituído pelo ranking inline)

### 2. Row de participante (compacto)
- **Posição:** JetBrains Mono, 11px, bold, width fixo ~24px
- **Brasão do clube:** 16x16, `clube_id` → URL padrão Cartola (com fallback `onerror` para placeholder)
- **Escudo do time:** 16x16, campo `escudo` do participante
- **Nome participante:** Inter, 11px, truncado com ellipsis
- **Separador:** " · " (middle dot)
- **Nome do time:** Inter, 11px, `--app-text-muted`, truncado
- **Pontos parciais da rodada:** JetBrains Mono, 12px, bold, alinhado direita — TRUNCADOS (nunca arredondados)
- **Em campo:** JetBrains Mono, 10px, `--app-text-muted`, formato "X/12"
- **Height:** ~32px por row (compacto)

### 3. Row do usuário logado (highlight)
- Background: `var(--app-primary-muted)` (já definido em `_app-tokens.css`)
- Border-left: 3px solid `var(--app-primary)`
- Mesma estrutura, destaque visual sutil

### 4. Animações de mudança
- Subiu de posição: flash verde `rgba(34, 197, 94, 0.15)` por 0.6s — novo keyframe `live-rank-up`
- Desceu: flash vermelho `rgba(239, 68, 68, 0.15)` por 0.6s — novo keyframe `live-rank-down`
- Apenas background transition, sem translateY (diferente dos keyframes `move-up`/`move-down` existentes que ficam intactos)

### 5. Footer
- Link "Ver detalhes da rodada →" — navega para tela de rodadas
- Inter, 12px, cor accent

### 6. Skeleton loading
- 5 rows skeleton enquanto primeiro fetch não retorna
- Reutiliza animação `skeleton-box` existente e helper `MatchdayService.createSkeletonRanking()`

## Dados e Performance

### Fonte de dados
- **Endpoint único:** `GET /api/matchday/parciais/:ligaId`
- **1 request** retorna ranking completo (vs. 35+ requests do sistema atual)
- **Cache HTTP:** 15s (já configurado no backend)

### Pontuação e Ordenação
- **Exibir:** `pontos_rodada_atual` (pontos parciais da rodada atual) — é o que o usuário quer ver ao vivo
- **Ordenar por:** `pontos_rodada_atual` DESC — ranking da rodada ao vivo
- **Backend:** Alterar sort em `parciaisRankingService.js` para ordenar por `pontos_rodada_atual` quando retornando parciais (ou frontend re-ordena)

### Campo `atletasEmCampo` (backend change)
- **Situação atual:** NÃO existe no response do backend `parciaisRankingService.js`
- **Ação necessária:** Na função `calcularPontuacaoTime()`:
  1. Recebe `escalacao.atletas` (roster do time) e `atletasPontuados` (mapa de pontuações)
  2. Para cada atleta da escalação, cruzar `atleta.atleta_id` com `atletasPontuados[atleta_id]`
  3. Contar quantos têm `entrou_em_campo === true` → campo `atletasEmCampo`
  4. `totalAtletas` = quantidade de titulares na escalação (normalmente 12)
  5. Retornar `{ pontos, calculado, atletasEmCampo, totalAtletas }` (hoje retorna só `{ pontos, calculado }`)
  6. Propagar esses campos no objeto de ranking (linhas 322-334)
- **Fallback DB:** Quando usando path de fallback (sem dados da API Cartola), esconder indicador "X/12" — não exibir dado inventado

### Campo `clube_id` para brasão
- **Situação atual:** Já retornado no response como `clube_id`
- **URL do brasão:** Usar padrão existente no codebase para escudos de clubes, com `onerror` fallback para imagem placeholder

### Polling
- Reutiliza `MatchdayService` existente
- Escuta evento `data:parciais` (emitido a cada 30s)
- **Importante:** O evento não passa dados como argumento. O handler deve acessar `MatchdayService.lastRanking` e `MatchdayService.lastDiff`
- Não cria polling próprio — evita requests duplicados

### Identificação do usuário
- `window.participanteAuth?.timeId` para highlight da row do usuário

## Ciclo de vida

| Evento | Ação |
|--------|------|
| `MatchdayService` state → `LIVE` ou `LOADING` | Esconde hero card normal, renderiza card live |
| Evento `data:parciais` | Atualiza ranking via `MatchdayService.lastRanking`, aplica animações de mudança via `MatchdayService.lastDiff` |
| `MatchdayService` state → `ENDED` ou `matchday:stop` | Remove card live, restaura hero card normal |
| `status_mercado === 1` (mercado abre) | Remove card live |
| Dados indisponíveis | Skeleton loading (5 rows) |
| Erro após 3 tentativas | Mensagem "Parciais indisponíveis" com retry manual |

## Arquivos impactados

### Modificar
1. **`public/participante/js/modules/participante-home.js`**
   - Nova função `renderLiveRankingCard()` — puxa dados de `MatchdayService.lastRanking`
   - Nova função `updateLiveRankingCard()` — atualização incremental com diff
   - Alterar lógica de detecção de rodada ao vivo para usar novo card
   - Esconder hero card (container `#home-hero-card` ou equivalente) quando ao vivo, restaurar quando consolidar
   - Usar `window.participanteAuth?.timeId` para highlight

2. **`public/participante/js/matchday-service.js`**
   - **NÃO remover globalmente** `_injectHeader()` e ticker — são usados por outros módulos/páginas
   - Adicionar flag/opção para suprimir header quando o card live da home está ativo
   - Alternativa: a home simplesmente esconde `#matchday-header-bar` via CSS quando card live está visível

3. **`services/parciaisRankingService.js`**
   - Alterar `calcularPontuacaoTime()` para retornar `atletasEmCampo` e `totalAtletas`
   - Propagar no response de ranking
   - Usar `timeId` como chave de identificação (não `participante_id`)

4. **`public/participante/css/matchday.css`**
   - Novas classes para rows do ranking live (`.live-rank-row`, `.live-rank-row--me`, etc.)
   - Novos keyframes `live-rank-up` e `live-rank-down` (sem conflito com existentes)
   - Reutilizar tokens de `_app-tokens.css`

### Não modificar
- `routes/matchday-routes.js` (endpoint já adequado)
- `home.html` (card renderizado dinamicamente via JS)
- `participante-rodada-parcial.js` (módulo de cálculo frontend — não usado neste fluxo)

## Regras críticas respeitadas
- Pontos TRUNCADOS (`truncarPontosNum` backend / `truncarPontos` frontend) — nunca arredondados
- Queries MongoDB incluem `liga_id`
- Dark mode estrito, cores via variáveis CSS de `_app-tokens.css`
- Material Icons (sem emojis)
- Nomenclatura em português
- Diff tracking usa `timeId` como chave estável
