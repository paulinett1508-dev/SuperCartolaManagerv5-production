# Estado AO VIVO vs EM ANDAMENTO — Referência

## Regra

O app do participante distingue dois estados visuais durante rodada ativa (`status_mercado === 2`):

- **"AO VIVO"** — `stats.aoVivo > 0` (jogos confirmados por API real-time: SoccerDataAPI ou API-Football)
- **"EM ANDAMENTO"** — `stats.aoVivo === 0` (rodada ativa mas sem jogos rolando agora)

## Ativação do MatchdayService

O MatchdayService ativa quando `matchday_ativo === true` (mercado fechado).
**NÃO depende de jogos ao vivo** — apenas o label AO VIVO/EM ANDAMENTO é condicional.

## Superfícies

| Superfície | Arquivo | Condição "AO VIVO" |
|---|---|---|
| Header matchday | `matchday-service.js` | `getAoVivoData()?.stats?.aoVivo > 0` |
| Live ranking card | `participante-home.js` | `isJogosAoVivo()` |
| Card aviso Home | `participante-home.js` | `isJogosAoVivo()` |
| Card performance | `participante-home.js` | `isJogosAoVivo()` |
| FAB foguinho | `whats-happening-widget.js` | `FAB_GAME_STATE === 'live'` |
| Toast ativação | `matchday-service.js` | `getAoVivoData()?.stats?.aoVivo > 0` |

## Fonte Globo — AGENDA, não livescore

O scraper Globo mapeia `moment:'NOW'` como bucket de horário do dia, NÃO como "jogo ao vivo".

**Proteção dupla:**
1. `scraper-jogos-globo.js`: janela kickoff + 150min para inferir status
2. `jogos-ao-vivo-routes.js`: guard zera `aoVivo` quando `fonte === 'globo'`

## Chain de fontes

```
SoccerDataAPI (real-time) → API-Football (90 req/dia) → Globo (agenda) → Cache stale
```

Apenas SoccerDataAPI e API-Football confirmam jogos ao vivo.

## Função-chave: isJogosAoVivo()

Definida em `whats-happening-widget.js`, acessível como função no escopo compartilhado:
```js
function isJogosAoVivo() {
    return WHState.gameStatusData?.stats?.aoVivo > 0;
}
```

## Data: 2026-03-15
