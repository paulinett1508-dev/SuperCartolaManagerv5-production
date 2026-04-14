/**
 * TOOL REGISTRY — Big Cartola IA v2
 *
 * Registro central das tools (function calling) disponiveis ao LLM.
 * Cada tool exporta:
 *   - name       (string) — identificador unico (snake_case)
 *   - description(string) — descricao para o LLM escolher
 *   - parameters (object) — JSON Schema dos argumentos do LLM
 *   - handler    ({ args, ctx, db }) -> objeto JSON serializavel
 *
 * O `ctx` (SessionContext) e injetado automaticamente pelo openaiClient.
 * Nenhuma tool aceita `ligaId`/`timeId` como argumento do LLM — esses
 * campos vem somente da sessao (isolamento multi-tenant garantido).
 */

import minhaClassificacaoPC from './tools/minhaClassificacaoPC.js';
import meuProximoConfrontoPC from './tools/meuProximoConfrontoPC.js';
import meuSaldoFinanceiro from './tools/meuSaldoFinanceiro.js';
import minhaPosicaoRankingGeral from './tools/minhaPosicaoRankingGeral.js';
import minhasPontuacoesRecentes from './tools/minhasPontuacoesRecentes.js';
import modulosAtivosLiga from './tools/modulosAtivosLiga.js';
import regraDeModulo from './tools/regraDeModulo.js';
import rodadaAtualMercado from './tools/rodadaAtualMercado.js';
import topNLigaGenerico from './tools/topNLigaGenerico.js';
import minhaPosicaoTurnoReturno from './tools/minhaPosicaoTurnoReturno.js';
import minhaPosicaoRestaUm from './tools/minhaPosicaoRestaUm.js';
import melhorDoMes from './tools/melhorDoMes.js';
import meuDesempenhoMelhorMes from './tools/meuDesempenhoMelhorMes.js';
import artilheiroCampeao from './tools/artilheiroCampeao.js';
import luvaDeOuro from './tools/luvaDeOuro.js';
import capitaoDoMes from './tools/capitaoDoMes.js';
// Fase 2 — Desempenho por rodada + mata-mata + top 10
import pontuacaoRodada from './tools/pontuacaoRodada.js';
import rankingRodada from './tools/rankingRodada.js';
import mataMataSituacao from './tools/mataMataSituacao.js';
import topDezMitosMicos from './tools/topDezMitosMicos.js';
import tiroCertoStatus from './tools/tiroCertoStatus.js';
import goleirosTop from './tools/goleirosTop.js';
// Fase 3 — Financeiro detalhado + config + jogos
import meuExtratoDetalhado from './tools/meuExtratoDetalhado.js';
import minhasInscricoes from './tools/minhasInscricoes.js';
import configLigaDetalhada from './tools/configLigaDetalhada.js';
import regrasLigaGerais from './tools/regrasLigaGerais.js';
import jogosDoDia from './tools/jogosDoDia.js';

/**
 * Lista ordenada de tools disponiveis para o LLM.
 * @type {Array<{ name: string, description: string, parameters: object, handler: Function }>}
 */
export const TOOLS = [
    minhaClassificacaoPC,
    meuProximoConfrontoPC,
    meuSaldoFinanceiro,
    minhaPosicaoRankingGeral,
    minhasPontuacoesRecentes,
    modulosAtivosLiga,
    regraDeModulo,
    rodadaAtualMercado,
    topNLigaGenerico,
    minhaPosicaoTurnoReturno,
    minhaPosicaoRestaUm,
    melhorDoMes,
    meuDesempenhoMelhorMes,
    artilheiroCampeao,
    luvaDeOuro,
    capitaoDoMes,
    // Fase 2
    pontuacaoRodada,
    rankingRodada,
    mataMataSituacao,
    topDezMitosMicos,
    tiroCertoStatus,
    goleirosTop,
    // Fase 3
    meuExtratoDetalhado,
    minhasInscricoes,
    configLigaDetalhada,
    regrasLigaGerais,
    jogosDoDia,
];

/**
 * Retorna as tools no formato esperado pela OpenAI Chat Completions API.
 */
export function listarToolsParaOpenAI() {
    return TOOLS.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        },
    }));
}

/**
 * Retorna a tool por nome, ou null se desconhecida.
 */
export function getTool(nome) {
    return TOOLS.find(t => t.name === nome) || null;
}

/**
 * Retorna resumo util para o system prompt (nome + descricao curta).
 */
export function resumoTools() {
    return TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n');
}
