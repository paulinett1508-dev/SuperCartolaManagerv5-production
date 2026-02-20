/**
 * TIRO CERTO MANAGER v2.0.0
 * Modulo Survival 2026 - Acertar vencedor do Brasileirao
 * Usa resultados REAIS (API-Football), nao pontos Cartola
 */
import BaseManager from './BaseManager.js';
import TiroCertoCache from '../../../models/TiroCertoCache.js';

export default class TiroCertoManager extends BaseManager {
    constructor() {
        super({
            id: 'tiro_certo',
            nome: 'Tiro Certo',
            moduloKey: 'tiro_certo',
            sempreAtivo: false,
            dependencias: ['rodada'],
            prioridade: 70,
            temColeta: true,
            temFinanceiro: true,
        });
    }

    /**
     * Mercado fechou - verificar WO automatico
     * Participantes vivos que nao escolheram sao eliminados
     */
    async onMarketClose(ctx) {
        const { ligaId, rodada, temporada } = ctx;
        console.log(`[TIRO-CERTO] onMarketClose R${rodada} liga=${ligaId}`);

        const edicao = await TiroCertoCache.findOne({
            liga_id: ligaId,
            temporada,
            status: 'em_andamento',
        });

        if (!edicao) {
            return { skip: true, motivo: 'Nenhuma edicao em andamento' };
        }

        // Rodada fora do intervalo desta edicao
        if (rodada < edicao.rodadaInicial || rodada > edicao.rodadaFinal) {
            return { skip: true, motivo: `R${rodada} fora do intervalo` };
        }

        // Aplicar WO automatico
        let woCount = 0;
        if (edicao.woAutomatico) {
            for (const p of edicao.participantes) {
                if (p.status !== 'vivo') continue;
                const jaEscolheu = p.escolhas.some(e => e.rodada === rodada);
                if (!jaEscolheu) {
                    p.status = 'eliminado';
                    p.rodadaEliminacao = rodada;
                    p.motivoEliminacao = 'wo';
                    woCount++;
                }
            }
        }

        if (woCount > 0) {
            edicao.vivosCount = edicao.participantes.filter(p => p.status === 'vivo').length;
            edicao.eliminadosCount = edicao.participantes.filter(p => p.status === 'eliminado').length;
            edicao.ultima_atualizacao = new Date();
            await edicao.save();
        }

        console.log(`[TIRO-CERTO] WO aplicado: ${woCount} eliminados por ausencia`);
        return { woCount, vivosRestantes: edicao.vivosCount };
    }

    /**
     * Atualizacao ao vivo - marcar status das escolhas com placares parciais
     * Nao elimina ninguem ainda, apenas atualiza status visual (SAFE/DANGER/CRITICAL)
     */
    async onLiveUpdate(ctx) {
        const { ligaId, rodada, temporada, resultadosBrasileirao } = ctx;
        console.log(`[TIRO-CERTO] onLiveUpdate R${rodada} liga=${ligaId}`);

        if (!resultadosBrasileirao || !Array.isArray(resultadosBrasileirao)) {
            return { skip: true, motivo: 'Sem resultados do Brasileirao no contexto' };
        }

        const edicao = await TiroCertoCache.findOne({
            liga_id: ligaId,
            temporada,
            status: 'em_andamento',
        });

        if (!edicao) return { skip: true };

        let atualizados = 0;
        for (const p of edicao.participantes) {
            if (p.status !== 'vivo') continue;

            const escolha = p.escolhas.find(e => e.rodada === rodada && e.resultado === 'pendente');
            if (!escolha) continue;

            // Encontrar jogo do time escolhido nos resultados
            const jogo = resultadosBrasileirao.find(
                j => j.mandanteId === escolha.timeEscolhidoId ||
                     j.visitanteId === escolha.timeEscolhidoId
            );

            if (jogo) {
                escolha.placarMandante = jogo.placarMandante;
                escolha.placarVisitante = jogo.placarVisitante;
                escolha.mandanteId = jogo.mandanteId;
                escolha.adversarioId = jogo.mandanteId === escolha.timeEscolhidoId
                    ? jogo.visitanteId : jogo.mandanteId;
                escolha.adversarioNome = jogo.mandanteId === escolha.timeEscolhidoId
                    ? jogo.visitanteNome : jogo.mandanteNome;
                atualizados++;
            }
        }

        if (atualizados > 0) {
            edicao.ultima_atualizacao = new Date();
            await edicao.save();
        }

        return { atualizados };
    }

    /**
     * Rodada finalizada - processar resultados e eliminar perdedores
     */
    async onRoundFinalize(ctx) {
        const { ligaId, rodada, temporada, resultadosBrasileirao } = ctx;
        console.log(`[TIRO-CERTO] onRoundFinalize R${rodada} liga=${ligaId}`);

        if (!resultadosBrasileirao || !Array.isArray(resultadosBrasileirao)) {
            return { skip: true, motivo: 'Sem resultados finais do Brasileirao' };
        }

        const edicao = await TiroCertoCache.findOne({
            liga_id: ligaId,
            temporada,
            status: 'em_andamento',
        });

        if (!edicao) return { skip: true };
        if (rodada < edicao.rodadaInicial || rodada > edicao.rodadaFinal) {
            return { skip: true, motivo: `R${rodada} fora do intervalo` };
        }

        let eliminados = 0;
        let sobreviventes = 0;

        for (const p of edicao.participantes) {
            if (p.status !== 'vivo') continue;

            const escolha = p.escolhas.find(e => e.rodada === rodada);
            if (!escolha) continue; // WO ja tratado no onMarketClose

            // Encontrar resultado final do jogo
            const jogo = resultadosBrasileirao.find(
                j => j.mandanteId === escolha.timeEscolhidoId ||
                     j.visitanteId === escolha.timeEscolhidoId
            );

            if (!jogo) {
                console.log(`[TIRO-CERTO] Jogo nao encontrado para time ${escolha.timeEscolhidoId}`);
                continue;
            }

            // Determinar resultado
            const eMandante = jogo.mandanteId === escolha.timeEscolhidoId;
            const golsTime = eMandante ? jogo.placarMandante : jogo.placarVisitante;
            const golsAdversario = eMandante ? jogo.placarVisitante : jogo.placarMandante;

            escolha.placarMandante = jogo.placarMandante;
            escolha.placarVisitante = jogo.placarVisitante;
            escolha.mandanteId = jogo.mandanteId;
            escolha.dataResultado = new Date();

            if (golsTime > golsAdversario) {
                // VITORIA - avanca
                escolha.resultado = 'vitoria';
                p.rodadasSobrevividas++;
                sobreviventes++;
            } else if (golsTime === golsAdversario) {
                // EMPATE - eliminado
                escolha.resultado = 'empate';
                p.status = 'eliminado';
                p.rodadaEliminacao = rodada;
                p.motivoEliminacao = 'empate';
                eliminados++;
            } else {
                // DERROTA - eliminado
                escolha.resultado = 'derrota';
                p.status = 'eliminado';
                p.rodadaEliminacao = rodada;
                p.motivoEliminacao = 'derrota';
                eliminados++;
            }
        }

        // Atualizar contadores
        edicao.vivosCount = edicao.participantes.filter(p => p.status === 'vivo').length;
        edicao.eliminadosCount = edicao.participantes.filter(p => p.status === 'eliminado').length;
        edicao.rodadaAtual = rodada;

        // Verificar se edicao acabou
        const vivos = edicao.participantes.filter(p => p.status === 'vivo');
        if (vivos.length <= 1 || rodada >= edicao.rodadaFinal) {
            edicao.status = 'finalizada';
            // Marcar campeao(es)
            for (const v of vivos) {
                v.status = 'campeao';
            }
            console.log(`[TIRO-CERTO] Edicao ${edicao.edicao} finalizada! Campeoes: ${vivos.length}`);
        }

        edicao.ultima_atualizacao = new Date();
        await edicao.save();

        console.log(`[TIRO-CERTO] R${rodada}: ${eliminados} eliminados, ${sobreviventes} sobreviventes, ${edicao.vivosCount} vivos total`);
        return { eliminados, sobreviventes, vivosTotal: edicao.vivosCount, edicaoFinalizada: edicao.status === 'finalizada' };
    }

    /**
     * Consolidacao final - registrar premiacoes se edicao finalizou
     */
    async onConsolidate(ctx) {
        const { ligaId, rodada, temporada } = ctx;
        console.log(`[TIRO-CERTO] onConsolidate R${rodada} liga=${ligaId}`);

        const edicao = await TiroCertoCache.findOne({
            liga_id: ligaId,
            temporada,
            status: 'finalizada',
        }).sort({ edicao: -1 });

        if (!edicao) return { skip: true };

        const campeoes = edicao.participantes.filter(p => p.status === 'campeao');
        if (campeoes.length === 0) return { skip: true, motivo: 'Sem campeoes' };

        // Premiacao sera tratada pelo sistema financeiro existente
        // Aqui apenas logamos os resultados
        console.log(`[TIRO-CERTO] Edicao ${edicao.edicao} consolidada: ${campeoes.length} campeao(es)`);
        for (const c of campeoes) {
            console.log(`  - ${c.nomeTime} (${c.timeId}) | ${c.rodadasSobrevividas} rodadas`);
        }

        return {
            consolidado: true,
            campeoes: campeoes.map(c => ({
                timeId: c.timeId,
                nomeTime: c.nomeTime,
                rodadasSobrevividas: c.rodadasSobrevividas,
            })),
        };
    }
}
