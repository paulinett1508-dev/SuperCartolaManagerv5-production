/**
 * TOOL: jogos_do_dia
 *
 * Retorna os jogos do Brasileirao agendados/ao vivo/encerrados do dia atual.
 * Consome o cache de processo do api-orchestrator (API-Football / SoccerDataAPI).
 *
 * Nao requer ligaId/timeId — e informacao global, nao por-liga.
 * Multi-tenant: sem filtro de liga (dado publico do Cartola FC).
 */

import apiOrchestrator from '../../../services/api-orchestrator.js';

/**
 * Mapa de status raw -> descricao amigavel em PT-BR.
 */
const STATUS_PT = {
    '1H': 'Primeiro tempo',
    '2H': 'Segundo tempo',
    'HT': 'Intervalo',
    'ET': 'Prorrogacao',
    'BT': 'Intervalo prorrogacao',
    'P': 'Penaltis',
    'FT': 'Encerrado',
    'AET': 'Encerrado (prorrogacao)',
    'PEN': 'Encerrado (penaltis)',
    'NS': 'Nao iniciado',
    'PST': 'Adiado',
    'CANC': 'Cancelado',
    'SUSP': 'Suspenso',
    'LIVE': 'Ao vivo',
};

function traduzirStatus(raw) {
    return STATUS_PT[raw] || raw || 'Desconhecido';
}

export default {
    name: 'jogos_do_dia',
    description:
        'Retorna os jogos do Brasileirao (e outras competicoes brasileiras) agendados para hoje, incluindo ao vivo e encerrados. Use quando perguntarem "tem jogo hoje", "quais jogos tem hoje", "quem joga hoje no Cartola", "jogos ao vivo", "resultado do jogo de hoje".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler() {
        try {
            const resultado = await apiOrchestrator.buscarFixturesDoDia();
            const jogos = Array.isArray(resultado?.jogos) ? resultado.jogos : [];

            if (!jogos.length) {
                return {
                    fonte: resultado?.fonte ?? 'sem-dados',
                    mensagem: 'Nao ha jogos brasileiros registrados para hoje.',
                    jogos: [],
                };
            }

            const formatados = jogos.map(j => ({
                mandante: j.mandante || j.homeTeam || null,
                visitante: j.visitante || j.awayTeam || null,
                placar_mandante: j.placar_mandante ?? j.homeScore ?? null,
                placar_visitante: j.placar_visitante ?? j.awayScore ?? null,
                status: traduzirStatus(j.statusRaw || j.status),
                ao_vivo: !!j.aoVivo,
                horario: j.horario || j.hora || null,
                competicao: j.competicao || j.league || null,
            }));

            const aoVivo = formatados.filter(j => j.ao_vivo);
            const encerrados = formatados.filter(j =>
                ['Encerrado', 'Encerrado (prorrogacao)', 'Encerrado (penaltis)'].includes(j.status)
            );
            const agendados = formatados.filter(
                j => !j.ao_vivo && !encerrados.includes(j)
            );

            return {
                fonte: resultado?.fonte ?? 'api',
                total_jogos: formatados.length,
                ao_vivo: aoVivo,
                agendados,
                encerrados,
            };
        } catch (err) {
            return {
                erro: 'falha_ao_buscar_jogos',
                detalhe: err.message,
                mensagem: 'Nao foi possivel buscar os jogos do dia no momento.',
            };
        }
    },
};
