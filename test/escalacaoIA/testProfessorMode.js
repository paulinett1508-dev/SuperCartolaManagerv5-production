/**
 * TESTE DO MODO PROFESSOR v1.0
 * Simula uma escalacao e verifica se o aiSynthesizer chama corretamente
 * o novo fluxo do Modo Professor.
 */

import aiSynthesizer from '../../services/escalacaoIA/aiSynthesizer.js';
import perplexityService from '../../services/perplexityAnalysisService.js';

// Mock do Perplexity Service para evitar chamadas reais de API em teste
const originalPerguntar = perplexityService.perguntarPerplexityCustom;
const originalIsDisponivel = perplexityService.isDisponivel;

perplexityService.isDisponivel = () => true;
perplexityService.perguntarPerplexityCustom = async (pergunta, systemPrompt) => {
    console.log('\n--- MOCK PERPLEXITY RECEBEU ---');
    console.log('SYSTEM PROMPT:', systemPrompt.substring(0, 100) + '...');
    console.log('USER PROMPT:', pergunta);
    
    return {
        resposta: `**Pedro** (FLA) - Escolha obvia para o modo mitar. Ele e o artilheiro do campeonato e joga contra uma defesa que cede muitos pontos.
        
        Resumo: Esta escalacao foca em agressividade ofensiva.
        
        Licao do Professor: Nunca subestime a Lei do Ex em clássicos.`
    };
};

async function runTest() {
    const cenarioMock = {
        modo: 'mitar',
        formacao: '4-3-3',
        escalacao: [
            { atletaId: 1, nome: 'Pedro', clubeAbrev: 'FLA', posicaoAbrev: 'ATA', preco: 20, scoreFinal: 9.5 }
        ],
        gastoTotal: 20,
        sobra: 80,
        pontuacaoEsperada: { min: 5, max: 15 }
    };

    const contextoMock = {
        rodada: 10,
        patrimonio: 100,
        modoProfessor: true
    };

    console.log('Iniciando teste do Modo Professor...');
    const resultado = await aiSynthesizer.gerarJustificativas(cenarioMock, contextoMock);

    console.log('\n--- RESULTADO FINAL ---');
    console.log('Justificativas:', resultado.justificativas);
    console.log('Resumo:', resultado.resumo);
    console.log('Usou IA:', resultado.usouIA);

    // Restaurar original
    perplexityService.perguntarPerplexityCustom = originalPerguntar;
    perplexityService.isDisponivel = originalIsDisponivel;
}

runTest().catch(console.error);
