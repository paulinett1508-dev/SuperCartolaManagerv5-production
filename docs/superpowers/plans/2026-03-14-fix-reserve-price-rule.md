# Fix Reserve Price Rule Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the Cartola FC game rule that bench (reserve) players must always cost less than the cheapest active player of the same position.

**Architecture:** Single-function edit in `lineupOptimizer.js`. The `gerarReservas()` function currently has no position-based price cap — it picks `reservaLuxo` as best-score regardless of price, and `reservasBanca` only by total remaining budget. The fix adds a pre-filter: for each reserve candidate, compare their price against the cheapest active player of the same position in the starting 11.

**Tech Stack:** Node.js / ES6 Modules — Jest (already configured in project).

---

## Chunk 1: Fix `gerarReservas` in `lineupOptimizer.js`

**Files:**
- Modify: `services/escalacaoIA/lineupOptimizer.js` (function `gerarReservas`, lines 253–287)
- Create: `services/escalacaoIA/__tests__/lineupOptimizer.test.js`

---

### Task 1: Escrever os testes com falha

**File:** `services/escalacaoIA/__tests__/lineupOptimizer.test.js`

Regra de negócio: **reserve da mesma posição deve custar estritamente menos que o mais barato titular daquela posição.**

- [ ] **Step 1.1: Criar o arquivo de teste**

```javascript
// services/escalacaoIA/__tests__/lineupOptimizer.test.js
import lineupOptimizer from '../lineupOptimizer.js';

const { montarEscalacao } = lineupOptimizer;

function makeAtleta(overrides) {
    return {
        atletaId: Math.random(),
        posicaoId: 5,
        clubeId: 1,
        preco: 10,
        media: 5,
        scoreFinal: 5,
        jogos: 5,
        variacao: 0,
        fontes: {},
        disponibilidadeReal: { status: 'confirmado' },
        ...overrides,
    };
}

// Esquema 1 = 3-4-3: 1 GOL, 0 LAT, 3 ZAG, 4 MEI, 3 ATA, 1 TEC = 12 jogadores
function buildRankeados(extras = []) {
    return [
        makeAtleta({ atletaId: 1, posicaoId: 1, preco: 15, scoreFinal: 9,  media: 9,  clubeId: 1 }), // GOL C$15
        makeAtleta({ atletaId: 2, posicaoId: 3, preco: 12, scoreFinal: 8,  media: 8,  clubeId: 2 }), // ZAG C$12
        makeAtleta({ atletaId: 3, posicaoId: 3, preco: 10, scoreFinal: 7,  media: 7,  clubeId: 3 }), // ZAG C$10
        makeAtleta({ atletaId: 4, posicaoId: 3, preco: 8,  scoreFinal: 6,  media: 6,  clubeId: 4 }), // ZAG C$8 (min ZAG)
        makeAtleta({ atletaId: 5, posicaoId: 4, preco: 11, scoreFinal: 7,  media: 7,  clubeId: 1 }), // MEI C$11
        makeAtleta({ atletaId: 6, posicaoId: 4, preco: 9,  scoreFinal: 6,  media: 6,  clubeId: 2 }), // MEI C$9
        makeAtleta({ atletaId: 7, posicaoId: 4, preco: 7,  scoreFinal: 5,  media: 5,  clubeId: 3 }), // MEI C$7
        makeAtleta({ atletaId: 8, posicaoId: 4, preco: 6,  scoreFinal: 4,  media: 4,  clubeId: 4 }), // MEI C$6 (min MEI)
        makeAtleta({ atletaId: 9, posicaoId: 5, preco: 14, scoreFinal: 10, media: 10, clubeId: 1 }), // ATA C$14
        makeAtleta({ atletaId: 10, posicaoId: 5, preco: 10, scoreFinal: 8, media: 8,  clubeId: 2 }), // ATA C$10
        makeAtleta({ atletaId: 11, posicaoId: 5, preco: 8,  scoreFinal: 6, media: 6,  clubeId: 3 }), // ATA C$8 (min ATA)
        makeAtleta({ atletaId: 12, posicaoId: 6, preco: 5,  scoreFinal: 5, media: 5,  clubeId: 4 }), // TEC C$5
        ...extras,
    ].sort((a, b) => b.scoreFinal - a.scoreFinal);
}

describe('gerarReservas — regra de preço por posição', () => {
    test('reservaLuxo não deve custar mais que o mais barato da mesma posição no 11', () => {
        // ATA candidato inválido: C$20 > min ATA C$8
        const ataInvalido = makeAtleta({ atletaId: 99, posicaoId: 5, preco: 20, scoreFinal: 15, clubeId: 5 });
        // ATA candidato válido: C$7 < min ATA C$8
        const ataValido  = makeAtleta({ atletaId: 100, posicaoId: 5, preco: 7,  scoreFinal: 12, clubeId: 5 });

        const cenario = montarEscalacao(buildRankeados([ataInvalido, ataValido]), 1, 200, 'mitar');
        const { reservaLuxo } = cenario.reservas;

        if (reservaLuxo) {
            const mesmaPos = cenario.escalacao.filter(e => e.posicaoId === reservaLuxo.posicaoId);
            if (mesmaPos.length > 0) {
                const precoMin = Math.min(...mesmaPos.map(e => e.preco));
                expect(reservaLuxo.preco).toBeLessThan(precoMin);
            }
        }
    });

    test('reservasBanca não deve conter jogador mais caro que o mais barato da mesma posição no 11', () => {
        // ZAG inválido: C$9 > min ZAG C$8
        const zagInvalido = makeAtleta({ atletaId: 98, posicaoId: 3, preco: 9, scoreFinal: 5, clubeId: 5 });
        // ZAG válido: C$5 < min ZAG C$8
        const zagValido   = makeAtleta({ atletaId: 97, posicaoId: 3, preco: 5, scoreFinal: 4, clubeId: 6 });

        const cenario = montarEscalacao(buildRankeados([zagInvalido, zagValido]), 1, 200, 'mitar');
        const { reservasBanca } = cenario.reservas;

        for (const reserva of reservasBanca) {
            const mesmaPos = cenario.escalacao.filter(e => e.posicaoId === reserva.posicaoId);
            if (mesmaPos.length > 0) {
                const precoMin = Math.min(...mesmaPos.map(e => e.preco));
                expect(reserva.preco).toBeLessThan(precoMin);
            }
        }
    });
});
```

- [ ] **Step 1.2: Rodar para confirmar FAIL**

```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest services/escalacaoIA/__tests__/lineupOptimizer.test.js --detectOpenHandles --forceExit
```

Esperado: FAIL — `zagInvalido` (C$9) passa pelo filtro atual (`a.preco <= sobra`).

---

### Task 2: Implementar o fix em `gerarReservas`

**File:** `services/escalacaoIA/lineupOptimizer.js`

A mudança é cirúrgica: dentro de `gerarReservas`, logo após `const sobra = ...`:

- [ ] **Step 2.1: Inserir cálculo do preço mínimo por posição**

```javascript
// Regra do jogo: reserva deve custar MENOS que o mais barato titular da mesma posição
const precoMinPorPosicao = {};
for (const jogador of escalacao) {
    const pos = jogador.posicaoId;
    if (precoMinPorPosicao[pos] === undefined || jogador.preco < precoMinPorPosicao[pos]) {
        precoMinPorPosicao[pos] = jogador.preco;
    }
}
```

- [ ] **Step 2.2: Adicionar filtro na lista `disponiveis`**

Substituir o bloco `const disponiveis = ...` atual:

```javascript
// ANTES
const disponiveis = atletasRankeados
    .filter(a => !idsEscalados.has(a.atletaId))
    .filter(a => a.disponibilidadeReal?.status !== 'descartado')
    .sort((a, b) => b.scoreFinal - a.scoreFinal);

// DEPOIS
const disponiveis = atletasRankeados
    .filter(a => !idsEscalados.has(a.atletaId))
    .filter(a => a.disponibilidadeReal?.status !== 'descartado')
    .filter(a => {
        // Se não há titular dessa posição no 11, sem restrição de preço
        if (precoMinPorPosicao[a.posicaoId] === undefined) return true;
        // Reserva deve custar MENOS que o mais barato titular da mesma posição
        return a.preco < precoMinPorPosicao[a.posicaoId];
    })
    .sort((a, b) => b.scoreFinal - a.scoreFinal);
```

---

### Task 3: Verificar e commitar

- [ ] **Step 3.1: Rodar os testes — esperar PASS**

```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest services/escalacaoIA/__tests__/lineupOptimizer.test.js --detectOpenHandles --forceExit
```

Esperado: 2 passing.

- [ ] **Step 3.2: Garantir que suite existente não quebrou**

```bash
npm test
```

- [ ] **Step 3.3: Commitar**

```bash
git add services/escalacaoIA/lineupOptimizer.js services/escalacaoIA/__tests__/lineupOptimizer.test.js
git commit -m "fix(escalacao-ia): reservas devem custar menos que o mais barato titular da mesma posição"
git push -u origin claude/fix-round-identification-kZBjh
```

---

## Pendente: Outras lógicas erradas

O usuário mencionou "algumas lógicas erradas" — este plano cobre apenas a **regra de preço das reservas** (único issue confirmado até agora).

**Aguardando confirmação do usuário** sobre quais outros problemas existem antes de expandir o plano.
