// ============================================================================
// 🛠️ FUNÇÕES AUXILIARES PARA CONSOLIDAÇÃO DE RODADAS
// ============================================================================

/**
 * Calcula os confrontos de Pontos Corridos para uma rodada específica
 * @param {string} ligaId - ID da liga
 * @param {number} rodadaNum - Número da rodada do Cartola
 * @param {Array} dadosRodada - Dados de pontuação da rodada
 * @param {Object} liga - Documento da liga com participantes
 * @returns {Array} Lista de confrontos com resultados
 */
export async function calcularConfrontosDaRodada(
    ligaId,
    rodadaNum,
    dadosRodada,
    liga,
) {
    const confrontos = [];

    if (!liga.modulos_ativos?.pontosCorridos) {
        return confrontos;
    }

    const configPC = liga.configuracoes?.pontos_corridos || {};
    const RODADA_INICIAL = configPC.rodadaInicial || 7;

    // Verificar se esta rodada faz parte do pontos corridos
    const rodadaLiga = rodadaNum - (RODADA_INICIAL - 1);
    if (rodadaLiga < 1) {
        return confrontos;
    }

    // Ordenar participantes alfabeticamente para garantir consistência
    // ✅ v8.8.0 FIX: Filtrar apenas participantes ativos no round-robin do PC
    const participantesOrdenados = [...(liga.participantes || [])]
        .filter(p => p.ativo !== false)
        .sort((a, b) => a.nome_cartola.localeCompare(b.nome_cartola));

    const totalTimes = participantesOrdenados.length;
    if (totalTimes < 2) return confrontos;

    // Criar mapa de pontuações
    const pontuacoes = {};
    dadosRodada.forEach((d) => {
        pontuacoes[d.timeId] = d.pontos || 0;
    });

    // Para cada time, encontrar seu oponente usando o algoritmo round-robin
    const processados = new Set();

    for (let i = 0; i < totalTimes; i++) {
        const participante = participantesOrdenados[i];
        const timeId = participante.time_id;

        if (processados.has(timeId)) continue;

        // Calcular índice do oponente
        const oponenteIndex = (i + rodadaLiga) % totalTimes;
        if (oponenteIndex === i) continue; // Bye

        const oponente = participantesOrdenados[oponenteIndex];

        const pontosA = pontuacoes[timeId] || 0;
        const pontosB = pontuacoes[oponente.time_id] || 0;
        const diferenca = Math.abs(pontosA - pontosB);

        let resultado = "empate";
        let goleada = false;

        if (diferenca <= 0.3) {
            resultado = "empate";
        } else if (pontosA > pontosB) {
            resultado = "vitoria_a";
            goleada = diferenca >= 50;
        } else {
            resultado = "vitoria_b";
            goleada = diferenca >= 50;
        }

        confrontos.push({
            rodada_liga: rodadaLiga,
            time_a: {
                id: timeId,
                nome: participante.nome_time,
                pontos: pontosA,
            },
            time_b: {
                id: oponente.time_id,
                nome: oponente.nome_time,
                pontos: pontosB,
            },
            resultado,
            goleada,
        });

        processados.add(timeId);
        processados.add(oponente.time_id);
    }

    return confrontos;
}

/**
 * Busca ranking de artilheiro e campeão da rodada
 * @param {string} ligaId - ID da liga
 * @param {number} rodadaNum - Número da rodada
 * @returns {Object} Dados do artilheiro e campeão
 */
export async function getRankingArtilheiroCampeao(ligaId, rodadaNum) {
    try {
        // Importa dinamicamente para evitar dependência circular
        const { default: Gols } = await import("../models/Gols.js");

        // Buscar todos os gols até esta rodada
        const gols = await Gols.find({
            ligaId: ligaId,
            rodada: { $lte: rodadaNum },
        }).lean();

        // Agrupar por time
        // ✅ Fix: Campos corrigidos para corresponder ao schema Gols.js (nome, gols, timeId)
        const golsPorTime = {};
        gols.forEach((g) => {
            const timeId = g.timeId;
            if (!golsPorTime[timeId]) {
                golsPorTime[timeId] = {
                    time_id: timeId,
                    nome_time: g.nomeTime || "",
                    nome_cartola: g.nomeCartola || "",
                    gols: 0,
                    jogadores: {},
                };
            }
            golsPorTime[timeId].gols += g.gols || 1; // ✅ Fix: era "quantidade" (inexistente) → "gols"

            // Contar por jogador
            const jogador = g.nome || "Desconhecido"; // ✅ Fix: era "jogadorNome" (inexistente) → "nome"
            golsPorTime[timeId].jogadores[jogador] =
                (golsPorTime[timeId].jogadores[jogador] || 0) +
                (g.gols || 1); // ✅ Fix: era "quantidade" → "gols"
        });

        // Converter para array e ordenar
        const ranking = Object.values(golsPorTime).sort(
            (a, b) => b.gols - a.gols,
        );

        if (ranking.length === 0) {
            return { artilheiro: null, campeao_rodada: null };
        }

        // Encontrar jogador destaque do líder
        const lider = ranking[0];
        let jogadorDestaque = "";
        let maxGols = 0;
        Object.entries(lider.jogadores).forEach(([nome, qtd]) => {
            if (qtd > maxGols) {
                maxGols = qtd;
                jogadorDestaque = nome;
            }
        });

        return {
            artilheiro: {
                time_id: lider.time_id,
                nome_time: lider.nome_time,
                nome_cartola: lider.nome_cartola,
                gols: lider.gols,
                jogador_destaque: jogadorDestaque,
            },
            campeao_rodada: null, // Será preenchido pelo consolidacaoController
        };
    } catch (error) {
        console.warn("[ARTILHEIRO] Erro ao buscar dados:", error.message);
        return { artilheiro: null, campeao_rodada: null };
    }
}

/**
 * Formata dados do ranking para snapshot
 * @param {Array} ranking - Array de times com pontuação
 * @returns {Array} Ranking formatado
 */
export function formatarRankingParaSnapshot(ranking) {
    return ranking.map((t, index) => ({
        time_id: t.time_id || t.timeId,
        nome_time: t.nome_time || t.nomeTime || "",
        nome_cartola: t.nome_cartola || t.nomeCartola || "",
        escudo_url: t.escudo_url || t.escudoUrl || "",
        pontos_totais: t.pontos_totais || t.pontosTotais || t.pontos || 0,
        patrimonio: t.patrimonio || 0,
        posicao: index + 1,
        variacao: t.variacao || 0,
    }));
}
