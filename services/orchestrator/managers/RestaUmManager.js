/**
 * RESTA UM MANAGER v1.1.0
 * Módulo 2026 - Eliminação progressiva por menor pontuação
 *
 * Hooks:
 * - onRoundFinalize: Identifica o(s) pior(es) pontuador(es) da rodada entre os vivos
 * - onConsolidate: Efetua a eliminação e atualiza o cache
 *
 * Dependências: rodada (pontuações), ranking_geral (desempate)
 */
import BaseManager from './BaseManager.js';
import RestaUmCache from '../../../models/RestaUmCache.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default class RestaUmManager extends BaseManager {
    constructor() {
        super({
            id: 'resta_um',
            nome: 'Resta Um',
            moduloKey: 'resta_um',
            sempreAtivo: false,
            dependencias: ['rodada', 'ranking_geral'],
            prioridade: 72,
            temColeta: false,
            temFinanceiro: true,
        });
    }

    /**
     * onRoundFinalize - Identifica quem será eliminado nesta rodada
     *
     * @param {Object} ctx - Contexto da rodada
     * @param {string} ctx.ligaId - ID da liga
     * @param {number} ctx.rodada - Número da rodada
     * @param {Array} ctx.pontuacoes - Pontuações da rodada [{timeId, pontos}]
     * @param {Array} ctx.rankingGeral - Ranking geral [{timeId, pontuacaoTotal}]
     */
    async onRoundFinalize(ctx) {
        const { ligaId, rodada, pontuacoes, rankingGeral } = ctx;
        console.log(`[RESTA-UM] Processando R${rodada} para liga ${ligaId}`);

        try {
            // Buscar edição em andamento
            const edicao = await RestaUmCache.findOne({
                liga_id: ligaId,
                temporada: CURRENT_SEASON,
                status: 'em_andamento',
            });

            if (!edicao) {
                // Verificar se existe edição pendente que deve iniciar nesta rodada
                const pendente = await RestaUmCache.findOne({
                    liga_id: ligaId,
                    temporada: CURRENT_SEASON,
                    status: 'pendente',
                    rodadaInicial: { $lte: rodada },
                });

                if (pendente) {
                    pendente.status = 'em_andamento';
                    pendente.rodadaAtual = rodada;
                    await pendente.save();
                    console.log(`[RESTA-UM] Edição ${pendente.edicao} iniciada na R${rodada}`);

                    // Proteção da primeira rodada: não eliminar ninguém
                    if (pendente.protecaoPrimeiraRodada) {
                        console.log(`[RESTA-UM] Proteção da 1ª rodada ativa - sem eliminações`);
                        await this._atualizarPontosParticipantes(pendente, pontuacoes, rodada);
                        return { pronto: true, eliminados: [], protecao: true };
                    }

                    return await this._processarEliminacao(pendente, pontuacoes, rankingGeral, rodada);
                }

                console.log(`[RESTA-UM] Nenhuma edição ativa/pendente para liga ${ligaId}`);
                return { pronto: true, ignorado: true };
            }

            // Verificar se rodada está dentro do range da edição
            if (edicao.rodadaFinal && rodada > edicao.rodadaFinal) {
                console.log(`[RESTA-UM] Rodada ${rodada} fora do range da edição (até R${edicao.rodadaFinal})`);
                return { pronto: true, ignorado: true };
            }

            edicao.rodadaAtual = rodada;
            return await this._processarEliminacao(edicao, pontuacoes, rankingGeral, rodada);

        } catch (error) {
            console.error(`[RESTA-UM] Erro no onRoundFinalize R${rodada}:`, error);
            return { pronto: false, error: error.message };
        }
    }

    /**
     * Processa a eliminação da rodada
     */
    async _processarEliminacao(edicao, pontuacoes, rankingGeral, rodada) {
        const vivos = edicao.participantes.filter(p => p.status === 'vivo');

        if (vivos.length <= 1) {
            // Só resta 1: é o campeão!
            if (vivos.length === 1) {
                vivos[0].status = 'campeao';
                edicao.status = 'finalizada';
                await edicao.save();
                console.log(`[RESTA-UM] CAMPEÃO: ${vivos[0].nomeTime} (edição ${edicao.edicao})`);
            }
            return { pronto: true, finalizada: true, campeao: vivos[0]?.nomeTime };
        }

        // Mapear pontuações da rodada para os vivos
        const pontuacoesMap = new Map();
        if (pontuacoes && Array.isArray(pontuacoes)) {
            pontuacoes.forEach(p => {
                pontuacoesMap.set(String(p.timeId || p.time_id), p.pontos || p.pontuacao || 0);
            });
        }

        // Atualizar pontos dos participantes vivos
        for (const p of vivos) {
            const pontosRodada = pontuacoesMap.get(String(p.timeId)) || 0;
            p.pontosAcumulados = (p.pontosAcumulados || 0) + pontosRodada;
            p.rodadasSobrevividas = (p.rodadasSobrevividas || 0) + 1;
            p.pontosRodada = pontosRodada;
        }

        // Ordenar vivos por pontuação da rodada (ASC = piores primeiro)
        const vivosOrdenados = [...vivos].sort((a, b) => {
            const pontosA = pontuacoesMap.get(String(a.timeId)) || 0;
            const pontosB = pontuacoesMap.get(String(b.timeId)) || 0;

            // 1º critério: menor pontuação da rodada
            if (pontosA !== pontosB) return pontosA - pontosB;

            // 2º critério (desempate): menor pontuação acumulada
            if ((a.pontosAcumulados || 0) !== (b.pontosAcumulados || 0)) {
                return (a.pontosAcumulados || 0) - (b.pontosAcumulados || 0);
            }

            // 3º critério: mais vezes na zona de eliminação
            if ((a.vezesNaZona || 0) !== (b.vezesNaZona || 0)) {
                return (b.vezesNaZona || 0) - (a.vezesNaZona || 0);
            }

            // 4º critério: pior posição no ranking geral
            if (rankingGeral && Array.isArray(rankingGeral)) {
                const posA = rankingGeral.findIndex(r => String(r.timeId || r.time_id) === String(a.timeId));
                const posB = rankingGeral.findIndex(r => String(r.timeId || r.time_id) === String(b.timeId));
                return posB - posA;
            }

            return 0;
        });

        // Determinar quantos serão eliminados (nunca eliminar todos)
        const qtdEliminar = Math.min(
            edicao.eliminadosPorRodada || 1,
            vivos.length - 1
        );

        const eliminadosRodada = [];

        for (let i = 0; i < qtdEliminar; i++) {
            const eliminado = vivosOrdenados[i];
            const participante = edicao.participantes.find(
                p => String(p.timeId) === String(eliminado.timeId)
            );

            if (participante) {
                participante.status = 'eliminado';
                participante.rodadaEliminacao = rodada;

                eliminadosRodada.push({
                    rodada,
                    timeId: participante.timeId,
                    nomeTime: participante.nomeTime,
                    pontosRodada: pontuacoesMap.get(String(participante.timeId)) || 0,
                    dataEliminacao: new Date(),
                });
            }
        }

        // Incrementar vezesNaZona para quem ficou na próxima zona de corte
        const zonaSize = edicao.eliminadosPorRodada || 1;
        const naProximaZona = vivosOrdenados.slice(qtdEliminar, qtdEliminar + zonaSize);
        for (const p of naProximaZona) {
            const participante = edicao.participantes.find(
                pp => String(pp.timeId) === String(p.timeId) && pp.status === 'vivo'
            );
            if (participante) {
                participante.vezesNaZona = (participante.vezesNaZona || 0) + 1;
            }
        }

        // Adicionar ao histórico de eliminações
        edicao.historicoEliminacoes.push(...eliminadosRodada);

        // Verificar se só resta 1 vivo → campeão!
        const vivosAposEliminacao = edicao.participantes.filter(p => p.status === 'vivo');
        if (vivosAposEliminacao.length === 1) {
            vivosAposEliminacao[0].status = 'campeao';
            edicao.status = 'finalizada';
            console.log(`[RESTA-UM] CAMPEÃO: ${vivosAposEliminacao[0].nomeTime}`);
        }

        edicao.ultima_atualizacao = new Date();
        await edicao.save();

        console.log(`[RESTA-UM] R${rodada}: ${eliminadosRodada.length} eliminado(s), ${vivosAposEliminacao.length} vivos restantes`);

        return {
            pronto: true,
            eliminados: eliminadosRodada.map(e => e.nomeTime),
            vivosRestantes: vivosAposEliminacao.length,
            finalizada: edicao.status === 'finalizada',
        };
    }

    /**
     * Atualiza pontos dos participantes sem eliminar (usado na proteção da 1ª rodada)
     */
    async _atualizarPontosParticipantes(edicao, pontuacoes, rodada) {
        const pontuacoesMap = new Map();
        if (pontuacoes && Array.isArray(pontuacoes)) {
            pontuacoes.forEach(p => {
                pontuacoesMap.set(String(p.timeId || p.time_id), p.pontos || p.pontuacao || 0);
            });
        }

        for (const p of edicao.participantes) {
            if (p.status === 'vivo') {
                const pontosRodada = pontuacoesMap.get(String(p.timeId)) || 0;
                p.pontosAcumulados = (p.pontosAcumulados || 0) + pontosRodada;
                p.rodadasSobrevividas = (p.rodadasSobrevividas || 0) + 1;
            }
        }

        edicao.rodadaAtual = rodada;
        edicao.ultima_atualizacao = new Date();
        await edicao.save();
    }

    async onConsolidate(ctx) {
        console.log(`[RESTA-UM] Consolidando eliminação R${ctx.rodada}`);
        // Consolidação já é feita no onRoundFinalize
        // Este hook pode ser usado para gerar lançamentos financeiros futuramente
        return { consolidado: true };
    }
}
