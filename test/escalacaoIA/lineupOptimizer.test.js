// test/escalacaoIA/lineupOptimizer.test.js
import lineupOptimizer from '../../services/escalacaoIA/lineupOptimizer.js';

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

// Esquema 1 = 3-4-3: 1 GOL, 3 ZAG, 4 MEI, 3 ATA, 1 TEC = exatamente 12 titulares
// Base tem exatamente 12 atletas (preenche todos os slots).
// Extras com scores < mínimo da posição (6) → nunca viram titulares.
function buildRankeados(extras = []) {
    return [
        makeAtleta({ atletaId: 1,  posicaoId: 1, preco: 15, scoreFinal: 9,  media: 9,  clubeId: 1 }), // GOL  C$15  ← único GOL
        makeAtleta({ atletaId: 2,  posicaoId: 3, preco: 12, scoreFinal: 8,  media: 8,  clubeId: 2 }), // ZAG  C$12
        makeAtleta({ atletaId: 3,  posicaoId: 3, preco: 10, scoreFinal: 7,  media: 7,  clubeId: 3 }), // ZAG  C$10
        makeAtleta({ atletaId: 4,  posicaoId: 3, preco: 8,  scoreFinal: 6,  media: 6,  clubeId: 4 }), // ZAG  C$8  ← min ZAG
        makeAtleta({ atletaId: 5,  posicaoId: 4, preco: 11, scoreFinal: 7,  media: 7,  clubeId: 1 }), // MEI  C$11
        makeAtleta({ atletaId: 6,  posicaoId: 4, preco: 9,  scoreFinal: 6,  media: 6,  clubeId: 2 }), // MEI  C$9
        makeAtleta({ atletaId: 7,  posicaoId: 4, preco: 7,  scoreFinal: 5,  media: 5,  clubeId: 3 }), // MEI  C$7
        makeAtleta({ atletaId: 8,  posicaoId: 4, preco: 6,  scoreFinal: 4,  media: 4,  clubeId: 4 }), // MEI  C$6  ← min MEI
        makeAtleta({ atletaId: 9,  posicaoId: 5, preco: 14, scoreFinal: 10, media: 10, clubeId: 1 }), // ATA  C$14
        makeAtleta({ atletaId: 10, posicaoId: 5, preco: 10, scoreFinal: 8,  media: 8,  clubeId: 2 }), // ATA  C$10
        makeAtleta({ atletaId: 11, posicaoId: 5, preco: 8,  scoreFinal: 6,  media: 6,  clubeId: 3 }), // ATA  C$8  ← min ATA
        makeAtleta({ atletaId: 12, posicaoId: 6, preco: 5,  scoreFinal: 5,  media: 5,  clubeId: 4 }), // TEC  C$5
        ...extras,
    ].sort((a, b) => b.scoreFinal - a.scoreFinal);
}

// =============================================================================
// Bug 1: operador <= — preço igual ao mínimo deve ser válido como reserva
// =============================================================================
describe('gerarReservas — Bug 1: operador <= (preço igual ao min titular é permitido)', () => {
    test('reserva com preço IGUAL ao min titular deve ser sugerido; mais caro deve ser excluído', () => {
        // Extras com scores baixos → nunca viram titulares
        const zagIgual = makeAtleta({ atletaId: 98, posicaoId: 3, preco: 8, scoreFinal: 0.5, clubeId: 5 }); // C$8 = minZAG(8) → válido
        const zagCaro  = makeAtleta({ atletaId: 99, posicaoId: 3, preco: 9, scoreFinal: 0.4, clubeId: 6 }); // C$9 > minZAG(8) → inválido

        const cenario = montarEscalacao(buildRankeados([zagIgual, zagCaro]), 1, 200, 'mitar');

        // Garantir que não viraram titulares
        const titularIds = cenario.escalacao.map(a => a.atletaId);
        expect(titularIds).not.toContain(zagIgual.atletaId);
        expect(titularIds).not.toContain(zagCaro.atletaId);

        const todos = [cenario.reservas.reservaLuxo, ...cenario.reservas.reservasBanca].filter(Boolean);

        expect(todos.some(r => r.atletaId === zagIgual.atletaId)).toBe(true);  // C$8 = min → válido
        expect(todos.some(r => r.atletaId === zagCaro.atletaId)).toBe(false);  // C$9 > min → inválido
    });
});

// =============================================================================
// Bug 2: reservas são gratuitos — não devem ser filtrados por sobra de cartoletas
// =============================================================================
describe('gerarReservas — Bug 2: reservas são gratuitos, filtro por sobra é inválido', () => {
    test('reserva em banca deve aparecer mesmo quando preco > sobra (reservas são gratuitos)', () => {
        // luxoDummy ocupa o slot de reservaLuxo (score maior, não filtrado por sobra)
        // Assim ataValido cai no reservasBanca (onde está o filtro de sobra bugado)
        const luxoDummy = makeAtleta({ atletaId: 99, posicaoId: 1, preco: 1, scoreFinal: 3, clubeId: 5 }); // GOL, C$1 <= minGOL(15) → válido
        const ataValido = makeAtleta({ atletaId: 100, posicaoId: 5, preco: 7, scoreFinal: 2, clubeId: 6 }); // ATA, C$7 <= minATA(8) → válido

        const rankeados = buildRankeados([luxoDummy, ataValido]);
        // Patrimonho = custo base (115) + sobra pequena (3) → sobra real ≈ 3
        // ataValido.preco=7 > sobra≈3 → atual código bloqueia; não deveria após fix
        const cenario = montarEscalacao(rankeados, 1, 118, 'mitar');

        // Verificar que o cenário tem sobra < ataValido.preco (valida a premissa do teste)
        expect(cenario.sobra).toBeLessThan(ataValido.preco);

        // luxoDummy (score=3 > ataValido score=2) deve ser reservaLuxo
        expect(cenario.reservas.reservaLuxo?.atletaId).toBe(luxoDummy.atletaId);

        // ataValido (C$7 <= minATA=8, mas preco > sobra) deve aparecer em banca após fix
        expect(cenario.reservas.reservasBanca.some(r => r.atletaId === ataValido.atletaId)).toBe(true);
    });

    test('reserva mais caro que min titular NÃO deve aparecer (posicaoId filter)', () => {
        // ataCaro: não será titular (score baixo), preco=20 > minATA(8) → inválido
        const ataCaro = makeAtleta({ atletaId: 101, posicaoId: 5, preco: 20, scoreFinal: 0.5, clubeId: 5 });

        const cenario = montarEscalacao(buildRankeados([ataCaro]), 1, 200, 'mitar');

        // Confirmar que não é titular
        expect(cenario.escalacao.map(a => a.atletaId)).not.toContain(ataCaro.atletaId);

        const todos = [cenario.reservas.reservaLuxo, ...cenario.reservas.reservasBanca].filter(Boolean);

        // C$20 > minATA(8) → não deve aparecer independente de sobra
        expect(todos.some(r => r.atletaId === ataCaro.atletaId)).toBe(false);
    });
});
