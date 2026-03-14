# Fix Reserve Price Rule Implementation Plan (v2)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 2 bugs em `gerarReservas()` que violam regras oficiais do Cartola FC: operador de preço errado (`<` em vez de `<=`) e filtro por `sobra` que não existe no jogo (reservas são gratuitas ao escalar).

**Architecture:**
- Arquivo único: `services/escalacaoIA/lineupOptimizer.js`
- Função única: `gerarReservas()` (linhas 253–288)
- Mudança cirúrgica de ~12 linhas

**Tech Stack:** Node.js / ES6 Modules — Jest (configurado em `package.json`).

---

## Regras Oficiais (fonte: pesquisa 2025/2026)

1. **Preço do reserva**: deve custar **≤** (igual ou menor que) o valor do titular **mais barato** da mesma posição.
   - Exemplo: atacantes titulares custam C$12 e C$8 → reserva ATA pode custar **até C$8** (inclusive C$8).
2. **Custo ao escalar**: reservas são **gratuitos** — não descontam cartoletas. Afetam patrimônio apenas se entram em campo (devolve diferença de preço entre titular e reserva).
   - Portanto: filtrar reservas por `sobra de orçamento` é **semanticamente errado**.

---

## Chunk 1: Fix `gerarReservas` em `lineupOptimizer.js`

**Files:**
- Modify: `services/escalacaoIA/lineupOptimizer.js` — função `gerarReservas` (linhas 253–288)
- Create: `services/escalacaoIA/__tests__/lineupOptimizer.test.js`

---

### Task 1: Escrever os testes com falha

- [ ] **Step 1.1: Criar arquivo de teste**

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

// Esquema 1 = 3-4-3: 1 GOL, 3 ZAG, 4 MEI, 3 ATA, 1 TEC
function buildRankeados(extras = []) {
    return [
        makeAtleta({ atletaId: 1,  posicaoId: 1, preco: 15, scoreFinal: 9,  media: 9,  clubeId: 1 }), // GOL  C$15
        makeAtleta({ atletaId: 2,  posicaoId: 3, preco: 12, scoreFinal: 8,  media: 8,  clubeId: 2 }), // ZAG  C$12
        makeAtleta({ atletaId: 3,  posicaoId: 3, preco: 10, scoreFinal: 7,  media: 7,  clubeId: 3 }), // ZAG  C$10
        makeAtleta({ atletaId: 4,  posicaoId: 3, preco: 8,  scoreFinal: 6,  media: 6,  clubeId: 4 }), // ZAG  C$8 ← min ZAG
        makeAtleta({ atletaId: 5,  posicaoId: 4, preco: 11, scoreFinal: 7,  media: 7,  clubeId: 1 }), // MEI  C$11
        makeAtleta({ atletaId: 6,  posicaoId: 4, preco: 9,  scoreFinal: 6,  media: 6,  clubeId: 2 }), // MEI  C$9
        makeAtleta({ atletaId: 7,  posicaoId: 4, preco: 7,  scoreFinal: 5,  media: 5,  clubeId: 3 }), // MEI  C$7
        makeAtleta({ atletaId: 8,  posicaoId: 4, preco: 6,  scoreFinal: 4,  media: 4,  clubeId: 4 }), // MEI  C$6 ← min MEI
        makeAtleta({ atletaId: 9,  posicaoId: 5, preco: 14, scoreFinal: 10, media: 10, clubeId: 1 }), // ATA  C$14
        makeAtleta({ atletaId: 10, posicaoId: 5, preco: 10, scoreFinal: 8,  media: 8,  clubeId: 2 }), // ATA  C$10
        makeAtleta({ atletaId: 11, posicaoId: 5, preco: 8,  scoreFinal: 6,  media: 6,  clubeId: 3 }), // ATA  C$8  ← min ATA
        makeAtleta({ atletaId: 12, posicaoId: 6, preco: 5,  scoreFinal: 5,  media: 5,  clubeId: 4 }), // TEC  C$5
        ...extras,
    ].sort((a, b) => b.scoreFinal - a.scoreFinal);
}

// Bug 1: operador <= — reserva com MESMO preço que o min titular deve ser válido
describe('gerarReservas — Bug 1: operador <= (preço igual ao min titular é permitido)', () => {
    test('reserva com preço IGUAL ao min titular da posição deve ser sugerido', () => {
        // ZAG com preço = min ZAG (C$8): válido pela regra <=
        const zagIgual = makeAtleta({ atletaId: 98, posicaoId: 3, preco: 8, scoreFinal: 7, clubeId: 5 });
        // ZAG mais caro que min ZAG (C$9): inválido
        const zagCaro  = makeAtleta({ atletaId: 99, posicaoId: 3, preco: 9, scoreFinal: 8, clubeId: 6 });

        const cenario = montarEscalacao(buildRankeados([zagIgual, zagCaro]), 1, 200, 'mitar');
        const todos = [cenario.reservas.reservaLuxo, ...cenario.reservas.reservasBanca].filter(Boolean);

        expect(todos.some(r => r.atletaId === zagIgual.atletaId)).toBe(true);  // C$8 = min → válido
        expect(todos.some(r => r.atletaId === zagCaro.atletaId)).toBe(false);  // C$9 > min → inválido
    });
});

// Bug 2: reservas são gratuitos — não devem ser filtrados por sobra
describe('gerarReservas — Bug 2: reservas são gratuitos, filtro por sobra é inválido', () => {
    test('reserva válido deve aparecer mesmo quando sobra de cartoletas é zero', () => {
        const ataValido = makeAtleta({ atletaId: 100, posicaoId: 5, preco: 7, scoreFinal: 9, media: 9, clubeId: 5 });

        const rankeados = buildRankeados([ataValido]);
        // Somar custo exato dos 11 que serão escalados (sem sobra)
        const custoBase = 15 + 12 + 10 + 8 + 11 + 9 + 7 + 6 + 14 + 10 + 8 + 5; // = 115
        const cenario = montarEscalacao(rankeados, 1, custoBase, 'mitar'); // sobra ≈ 0

        const todos = [cenario.reservas.reservaLuxo, ...cenario.reservas.reservasBanca].filter(Boolean);

        // ataValido (C$7 <= min ATA C$8) deve aparecer mesmo com sobra = 0
        expect(todos.some(r => r.atletaId === ataValido.atletaId)).toBe(true);
    });

    test('reserva mais caro que min titular NÃO deve aparecer', () => {
        const ataCaro = makeAtleta({ atletaId: 101, posicaoId: 5, preco: 20, scoreFinal: 15, clubeId: 5 });

        const cenario = montarEscalacao(buildRankeados([ataCaro]), 1, 200, 'mitar');
        const todos = [cenario.reservas.reservaLuxo, ...cenario.reservas.reservasBanca].filter(Boolean);

        expect(todos.some(r => r.atletaId === ataCaro.atletaId)).toBe(false);
    });
});
```

- [ ] **Step 1.2: Rodar para confirmar FAIL**

```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest services/escalacaoIA/__tests__/lineupOptimizer.test.js --detectOpenHandles --forceExit
```

Esperado: FAILs em "preço IGUAL" (operador `<` rejeita) e "sobra zero" (filtro `sobra` bloqueia).

---

### Task 2: Implementar o fix em `gerarReservas`

**File:** `services/escalacaoIA/lineupOptimizer.js` — substituir corpo da função `gerarReservas` (linhas 253–288)

```javascript
function gerarReservas(atletasRankeados, escalacao, patrimonio, gastoTotal) {
    const idsEscalados = new Set(escalacao.map(a => a.atletaId));

    // Regra oficial Cartola FC: reserva deve custar <= mais barato titular da mesma posição.
    // Fonte: "o valor do jogador reserva deve ser igual ou menor do que o valor do titular mais barato da posição"
    const precoMinPorPosicao = {};
    for (const jogador of escalacao) {
        const pos = jogador.posicaoId;
        if (precoMinPorPosicao[pos] === undefined || jogador.preco < precoMinPorPosicao[pos]) {
            precoMinPorPosicao[pos] = jogador.preco;
        }
    }

    // Reservas válidos: fora do 11, não descartados, respeitam regra de preço por posição.
    // Nota: reservas são GRATUITOS ao escalar — não filtrar por sobra de cartoletas.
    // Fonte: "os reservas não descontam das suas cartoletas"
    const disponiveis = atletasRankeados
        .filter(a => !idsEscalados.has(a.atletaId))
        .filter(a => a.disponibilidadeReal?.status !== 'descartado')
        .filter(a => {
            const precoMax = precoMinPorPosicao[a.posicaoId];
            if (precoMax === undefined) return true; // posição sem titular no esquema: sem restrição
            return a.preco <= precoMax; // <= (igual é permitido, conforme regra oficial)
        })
        .sort((a, b) => b.scoreFinal - a.scoreFinal);

    if (disponiveis.length === 0) {
        return { reservaLuxo: null, reservasBanca: [] };
    }

    // Reserva de Luxo: melhor score entre os reservas válidos
    const reservaLuxo = {
        ...disponiveis[0],
        posicaoNome: POSICOES[disponiveis[0].posicaoId]?.nome || 'N/D',
        posicaoAbrev: POSICOES[disponiveis[0].posicaoId]?.abrev || 'N/D',
    };

    // Banco: próximos 3 melhores reservas válidos (excluindo o reservaLuxo)
    const reservasBanca = disponiveis
        .slice(1)
        .slice(0, 3)
        .map(a => ({
            ...a,
            posicaoNome: POSICOES[a.posicaoId]?.nome || 'N/D',
            posicaoAbrev: POSICOES[a.posicaoId]?.abrev || 'N/D',
        }));

    console.log(`${LOG_PREFIX} Reservas: luxo=${reservaLuxo.nome} (C$${reservaLuxo.preco}), banca=${reservasBanca.length} jogadores`);

    return { reservaLuxo, reservasBanca };
}
```

---

### Task 3: Verificar e commitar

- [ ] **Step 3.1: Rodar testes — esperar todos PASS**

```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest services/escalacaoIA/__tests__/lineupOptimizer.test.js --detectOpenHandles --forceExit
```

Esperado: 3 passing.

- [ ] **Step 3.2: Suite existente não quebrou**

```bash
npm test
```

- [ ] **Step 3.3: Commitar e pushar**

```bash
git add services/escalacaoIA/lineupOptimizer.js services/escalacaoIA/__tests__/lineupOptimizer.test.js
git commit -m "fix(escalacao-ia): corrige 2 bugs em gerarReservas — operador <= e remoção do filtro por sobra"
git push -u origin claude/fix-round-identification-kZBjh
```

---

## Pendente: Anti-confronto como hard block

Aguardando confirmação do usuário: o hard block atual (impede ATAs de times que enfrentam ZAG/GOL/LAT já escalados) é comportamento desejado, ou deveria ser configurável/removível?

A pesquisa confirmou que **não é regra oficial do Cartola FC** — é estratégia de comunidade. O hard block pode estar prejudicando escalações ótimas.
