# Regra Absoluta: Zero Arredondamento de Pontos

**PONTOS DE PARTICIPANTES NUNCA DEVEM SER ARREDONDADOS. SEMPRE TRUNCAR.**

## Por que truncar, não arredondar?
- `93.78569` arredondado → `93.79` (ERRADO — o participante não fez esse ponto)
- `93.78569` truncado → `93.78` (CORRETO — apenas o que foi conquistado)

## Funções Canônicas Obrigatórias

**Backend (Node.js) — retorna `number`:**
```javascript
import { truncarPontosNum } from '../utils/type-helpers.js';
// Ex: truncarPontosNum(93.78569) → 93.78
```

**Frontend participante — retorna `string` formatada pt-BR:**
```javascript
// truncarPontos() já está disponível via window.truncarPontos (participante-utils.js)
// Ex: truncarPontos(93.78569) → "93,78"
```

**Frontend admin (sem truncarPontos no escopo) — inline:**
```javascript
// 2 casas decimais:
(Math.trunc(valor * 100) / 100).toFixed(2)
// 1 casa decimal:
(Math.trunc(valor * 10) / 10).toFixed(1)
```

## O que é PROIBIDO
```javascript
// NUNCA — arredonda: 93.785 → 93.79
pontos.toFixed(2)

// NUNCA — arredonda: 93.785 → 93.79
parseFloat(pontos.toFixed(2))

// NUNCA — arredonda: Math.round(93.785 * 100) / 100 → 93.79
Math.round(pontos * 100) / 100
```

## O que é OBRIGATÓRIO
```javascript
// Backend → number
truncarPontosNum(pontos)              // 93.785 → 93.78

// Frontend com truncarPontos disponível → string pt-BR
truncarPontos(pontos)                 // 93.785 → "93,78"

// Frontend sem truncarPontos (inline) → string
(Math.trunc(pontos * 100) / 100).toFixed(2)  // 93.785 → "93.78"
```

## Implementação de `truncarPontosNum`
```javascript
// utils/type-helpers.js
export function truncarPontosNum(valor) {
    const num = parseFloat(valor) || 0;
    return Math.trunc(num * 100) / 100;
}
```

## Implementação canônica de `truncarPontos` (frontend)
```javascript
function truncarPontos(valor) {
    const num = parseFloat(valor) || 0;
    const truncado = Math.trunc(num * 100) / 100;
    return truncado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

## Escopo da Regra
Aplica-se a **qualquer valor de pontuação de participante**, incluindo:
- Pontos da rodada (`pontos`, `pontos_rodada`)
- Pontos acumulados (`pontos_total`, `pontuacao_total`)
- Médias de pontos (`media_pontos`, `media_capitao`)
- Diferenças (`diferenca_media`, `diferenca_melhor`, `vs_media`)
- Pontos de módulos (Artilheiro, Luva de Ouro, Pontos Corridos, Mata-Mata, etc.)

**NÃO se aplica** a valores financeiros (R$), percentuais (%), tempos (ms/s), tamanhos (MB), contagens inteiras.
