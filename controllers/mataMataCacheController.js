import MataMataCache from "../models/MataMataCache.js";
import ModuleConfig from "../models/ModuleConfig.js";
import { CURRENT_SEASON } from "../config/seasons.js";
import { calcularBracketParaConsolidacao, getFasesParaTamanho, montarConfrontosFase, determinarVencedor } from "./mata-mata-backend.js";
import parciaisService from "../services/parciaisRankingService.js";
import logger from '../utils/logger.js';

export const salvarCacheMataMata = async (req, res) => {
    try {
        const { ligaId, edicao } = req.params;
        const { rodada, dados } = req.body;

        // Validar edicao como número válido
        const edicaoNum = Number(edicao);
        if (isNaN(edicaoNum) || edicaoNum < 1 || edicaoNum > 10) {
            return res.status(400).json({ error: "Edição inválida (deve ser número entre 1 e 10)" });
        }

        if (!rodada || !dados) {
            return res.status(400).json({ error: "Dados incompletos" });
        }

        // Validar estrutura de dados do torneio
        if (typeof dados !== 'object' || Array.isArray(dados)) {
            return res.status(400).json({ error: "Dados do torneio devem ser um objeto" });
        }

        const fasesValidas = ['primeira', 'oitavas', 'quartas', 'semis', 'final', 'campeao', 'metadata'];
        const chavesDados = Object.keys(dados);
        const chavesInvalidas = chavesDados.filter(k => !fasesValidas.includes(k));
        if (chavesInvalidas.length > 0) {
            return res.status(400).json({ error: `Chaves inválidas nos dados: ${chavesInvalidas.join(', ')}` });
        }

        // ✅ Extrair metadata se disponível
        const tamanhoTorneio = dados?.metadata?.tamanhoTorneio || dados?.tamanhoTorneio || null;
        const participantesAtivos = dados?.metadata?.participantesAtivos || dados?.participantesAtivos || null;

        const updateData = {
            rodada_atual: rodada,
            dados_torneio: dados,
            ultima_atualizacao: new Date(),
        };

        // ✅ Adicionar campos opcionais se disponíveis
        if (tamanhoTorneio) updateData.tamanhoTorneio = tamanhoTorneio;
        if (participantesAtivos) updateData.participantesAtivos = participantesAtivos;

        // Upsert: Salva ou Atualiza o estado desta edição (com temporada no filtro)
        await MataMataCache.findOneAndUpdate(
            { liga_id: ligaId, edicao: edicaoNum, temporada: CURRENT_SEASON },
            updateData,
            { new: true, upsert: true },
        );

        logger.log(
            `[CACHE-MATA] Snapshot da Liga ${ligaId} (Edição ${edicao}) salvo.`,
        );
        res.json({ success: true });
    } catch (error) {
        logger.error("[CACHE-MATA] Erro ao salvar:", error);
        res.status(500).json({ error: "Erro interno" });
    }
};

export const lerCacheMataMata = async (req, res) => {
    try {
        const { ligaId, edicao } = req.params;
        const { temporada } = req.query;
        const temporadaFiltro = temporada ? parseInt(temporada) : CURRENT_SEASON;

        const cache = await MataMataCache.findOne({
            liga_id: ligaId,
            edicao: Number(edicao),
            temporada: temporadaFiltro
        });

        if (!cache) {
            return res.status(404).json({ cached: false });
        }

        // ── SISTEMA VIVO: enriquecer fase ao vivo com parciais em tempo real ──
        let dadosTorneio = cache.dados_torneio || {};
        let aoVivo = false;
        let rodadaResposta = cache.rodada_atual;

        try {
            const status = await parciaisService.buscarStatusMercado();
            const mercadoFechado = status && status.status_mercado !== 1;

            if (status && mercadoFechado) {
                const rodadaAtual = status.rodada_atual;
                rodadaResposta = rodadaAtual;

                // Buscar calendário da edição no ModuleConfig
                const moduleConfig = await ModuleConfig.findOne({
                    liga_id: ligaId,
                    modulo: 'mata_mata',
                    temporada: temporadaFiltro,
                    ativo: true,
                }).lean();

                const calendario = moduleConfig?.calendario_override || [];
                const edicaoConfig = calendario.find(e => Number(e.edicao) === Number(edicao));

                if (edicaoConfig) {
                    const tamanhoTorneio = cache.tamanhoTorneio || 8;
                    const fases = getFasesParaTamanho(tamanhoTorneio);
                    const rodadaInicial = Number(edicaoConfig.rodada_inicial);

                    // Mapear rodada de cada fase
                    const rodadasFases = {};
                    fases.forEach((fase, idx) => { rodadasFases[fase] = rodadaInicial + idx; });

                    // Identificar fase ao vivo (rodada da fase === rodada atual)
                    const faseViva = fases.find(f => rodadasFases[f] === rodadaAtual);

                    if (faseViva) {
                        // Buscar confrontos da fase — do cache ou derivados dos vencedores anteriores
                        let confrontosFaseViva = dadosTorneio[faseViva];

                        if (!confrontosFaseViva || confrontosFaseViva.length === 0) {
                            // Fase sem cache: derivar bracket dos vencedores da fase anterior
                            const faseIdx = fases.indexOf(faseViva);
                            if (faseIdx > 0) {
                                const fasePrev = fases[faseIdx - 1];
                                const confrontosPrev = dadosTorneio[fasePrev];
                                if (confrontosPrev && confrontosPrev.length > 0) {
                                    const vencedores = confrontosPrev
                                        .map((c, jogoIdx) => {
                                            const { vencedor } = determinarVencedor(c);
                                            return vencedor ? { ...vencedor, jogoAnterior: jogoIdx + 1 } : null;
                                        })
                                        .filter(Boolean);

                                    if (vencedores.length >= 2) {
                                        const numJogos = Math.ceil(vencedores.length / 2);
                                        confrontosFaseViva = montarConfrontosFase(vencedores, {}, numJogos, tamanhoTorneio);
                                        logger.log(`[CACHE-MATA] 🔨 Semis derivadas de ${fasePrev}: ${vencedores.length} vencedores`);
                                    }
                                }
                            }
                        }

                        // Overlay com pontos ao vivo das parciais
                        if (confrontosFaseViva && confrontosFaseViva.length > 0) {
                            const parciais = await parciaisService.buscarRankingParcial(ligaId);

                            if (parciais && parciais.disponivel && parciais.ranking) {
                                const pontosMap = {};
                                parciais.ranking.forEach(t => {
                                    pontosMap[String(t.timeId)] = t.pontos_rodada_atual ?? 0;
                                });

                                confrontosFaseViva = confrontosFaseViva.map(c => ({
                                    ...c,
                                    timeA: { ...c.timeA, pontos: pontosMap[String(c.timeA?.timeId)] ?? null },
                                    timeB: { ...c.timeB, pontos: pontosMap[String(c.timeB?.timeId)] ?? null },
                                }));

                                logger.log(`[CACHE-MATA] ✅ Parciais ao vivo aplicadas na fase ${faseViva} (R${rodadaAtual})`);
                            } else {
                                // Parciais indisponíveis: manter estrutura com pontos null
                                confrontosFaseViva = confrontosFaseViva.map(c => ({
                                    ...c,
                                    timeA: { ...c.timeA, pontos: null },
                                    timeB: { ...c.timeB, pontos: null },
                                }));
                                logger.log(`[CACHE-MATA] ⏳ Parciais indisponíveis — fase ${faseViva} com pontos null`);
                            }

                            dadosTorneio = { ...dadosTorneio, [faseViva]: confrontosFaseViva };
                            aoVivo = true;
                        }
                    }
                }
            }
        } catch (liveErr) {
            // Falha no enriquecimento ao vivo não deve derrubar a resposta
            logger.warn('[CACHE-MATA] ⚠️ Erro ao enriquecer com parciais ao vivo:', liveErr.message);
        }

        res.json({
            cached: true,
            rodada: rodadaResposta,
            dados: dadosTorneio,
            updatedAt: cache.ultima_atualizacao,
            aoVivo,
        });
    } catch (error) {
        logger.error("[CACHE-MATA] Erro ao ler:", error);
        res.status(500).json({ error: "Erro interno" });
    }
};

export const deletarCacheMataMata = async (req, res) => {
    try {
        const { ligaId, edicao } = req.params;

        await MataMataCache.deleteOne({
            liga_id: ligaId,
            edicao: Number(edicao),
            temporada: CURRENT_SEASON,
        });

        logger.log(
            `[CACHE-MATA] Cache deletado: Liga ${ligaId}, Edição ${edicao}`,
        );
        res.json({ success: true, message: 'Cache deletado' });
    } catch (error) {
        logger.error("[CACHE-MATA] Erro ao deletar:", error);
        res.status(500).json({ error: "Erro interno" });
    }
};

// ============================================================================
// 🔒 FUNÇÃO PARA CONSOLIDAÇÃO DE SNAPSHOTS
// ============================================================================

export const obterConfrontosMataMata = async (ligaId, rodadaNumero, temporada = CURRENT_SEASON) => {
    try {
        logger.log(`[MATA-CONSOLIDAÇÃO] Processando liga ${ligaId} até R${rodadaNumero}, temporada ${temporada}`);

        // ✅ v2.0: CALCULAR confrontos em vez de apenas ler cache
        // Antes: apenas lia MataMataCache (vazio se admin não abriu a tela)
        // Agora: calcula bracket via backend e persiste no cache automaticamente
        const resultados = await calcularBracketParaConsolidacao(ligaId, rodadaNumero);

        logger.log(`[MATA-CONSOLIDAÇÃO] ✅ ${resultados.length} edições processadas (cálculo automático)`);
        return resultados;

    } catch (error) {
        logger.error('[MATA-CONSOLIDAÇÃO] ❌ Erro no cálculo automático, tentando fallback do cache:', error);

        // Fallback: ler cache existente (comportamento anterior)
        try {
            const caches = await MataMataCache.find({
                liga_id: ligaId,
                temporada: temporada
            }).sort({ edicao: 1 });

            return caches.map(cache => ({
                edicao: cache.edicao,
                rodada_atual: cache.rodada_atual,
                dados_torneio: cache.dados_torneio,
                ultima_atualizacao: cache.ultima_atualizacao
            }));
        } catch (fallbackError) {
            logger.error('[MATA-CONSOLIDAÇÃO] ❌ Fallback também falhou:', fallbackError);
            throw error;
        }
    }
};
