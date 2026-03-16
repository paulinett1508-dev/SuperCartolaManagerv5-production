/**
 * CONSOLIDAÇÃO-CONTROLLER v3.2.0 (SaaS DINÂMICO + DATA LAKE + TEMPORADA FIX)
 * ✅ v3.2.0: FIX CRÍTICO - Filtro de temporada na query de ranking_rodada
 *   - Evita misturar dados de temporadas diferentes na consolidação
 * ✅ v3.1.0: BACKUP AUTOMÁTICO - Salva dumps permanentes na consolidação
 *   - Hook de backup após consolidação para preservar dados históricos
 *   - Dados salvos em cartola_oficial_dumps para Hall da Fama e restaurações
 * ✅ v3.0.0: MULTI-TENANT - Busca configurações de liga.configuracoes (White Label)
 *   - Remove hardcoded IDs de ligas
 *   - getValoresTop10() agora busca de liga.configuracoes.top10
 *   - Módulos verificados via liga.configuracoes.{modulo}.habilitado
 * ✅ v2.2: Busca extratos com ObjectId E String para compatibilidade
 * ✅ v2.1: Fix escala Top10 por liga
 * ✅ v2.0: Schema versão 2 com ranking_rodada
 */

import mongoose from 'mongoose';
import RodadaSnapshot from '../models/RodadaSnapshot.js';
import RankingGeralCache from '../models/RankingGeralCache.js';
import Top10Cache from '../models/Top10Cache.js';
import Liga from '../models/Liga.js';
import Rodada from '../models/Rodada.js';
import ExtratoFinanceiroCache from '../models/ExtratoFinanceiroCache.js';
import CartolaOficialDump from '../models/CartolaOficialDump.js';
import { calcularRankingCompleto } from './rankingGeralCacheController.js';
import { getFluxoFinanceiroLiga } from './fluxoFinanceiroController.js';
import { obterConfrontosMataMata } from './mataMataCacheController.js';
import { calcularConfrontosDaRodada, getRankingArtilheiroCampeao } from '../utils/consolidacaoHelpers.js';
import { isSeasonFinished, SEASON_CONFIG } from '../utils/seasonGuard.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import { consolidarRankingCapitao } from '../services/capitaoService.js';

// 🔔 PUSH NOTIFICATIONS - Gatilhos automaticos (FASE 5)
import {
  triggerRodadaFinalizada,
  triggerMitoMico
} from '../services/notificationTriggers.js';
import logger from '../utils/logger.js';
import { invalidarCachesLiga } from '../utils/cache-invalidator.js';

// ============================================================================
// ✅ v3.0: FUNÇÕES SaaS DINÂMICAS (Multi-Tenant)
// ============================================================================

/**
 * Obtém configuração de ranking_rodada (BANCO) da liga
 * @param {Object} liga - Documento da liga
 * @param {number} rodada - Número da rodada (para configs temporais)
 * @returns {Object} { valores: {posicao: valor}, faixas: {...} }
 */
function getConfigRankingRodada(liga, rodada = 1) {
    const config = liga?.configuracoes?.ranking_rodada;
    if (!config) return { valores: {}, faixas: null };

    if (config.temporal) {
        const rodadaTransicao = config.rodada_transicao || 30;
        const fase = rodada < rodadaTransicao ? 'fase1' : 'fase2';
        const faseConfig = config[fase] || {};
        return { valores: faseConfig.valores || {}, faixas: faseConfig.faixas || null };
    }

    return { valores: config.valores || {}, faixas: config.faixas || null };
}

/**
 * Obtém configuração de TOP10 (Mitos/Micos) da liga
 * @param {Object} liga - Documento da liga (com configuracoes)
 * @returns {Object} { mitos: {pos: valor}, micos: {pos: valor} }
 */
function getConfigTop10(liga) {
    const config = liga?.configuracoes?.top10;

    if (!config) {
        logger.warn(`[CONSOLIDAÇÃO] Liga ${liga?._id} sem configuracoes.top10`);
        return { mitos: {}, micos: {} };
    }

    return {
        mitos: config.valores_mito || {},
        micos: config.valores_mico || {},
        habilitado: config.habilitado !== false,
    };
}

/**
 * Verifica se um módulo está habilitado para a liga
 * @param {Object} liga - Documento da liga
 * @param {string} modulo - Nome do módulo (pontos_corridos, mata_mata, top10, luva_ouro, etc.)
 * @returns {boolean}
 */
function isModuloHabilitado(liga, modulo) {
    // Primeiro verifica em configuracoes.{modulo}.habilitado
    const configModulo = liga?.configuracoes?.[modulo];
    if (configModulo?.habilitado !== undefined) {
        return configModulo.habilitado;
    }

    // Fallback para modulos_ativos (compatibilidade)
    const moduloKey = modulo.replace(/_/g, ''); // pontos_corridos -> pontoscorridos
    const moduloCamel = modulo.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // pontos_corridos -> pontosCorridos

    if (liga?.modulos_ativos?.[moduloKey] !== undefined) {
        return liga.modulos_ativos[moduloKey];
    }
    if (liga?.modulos_ativos?.[moduloCamel] !== undefined) {
        return liga.modulos_ativos[moduloCamel];
    }

    return false;
}

// ============================================================================
// ✅ v3.1: BACKUP AUTOMÁTICO PARA DATA LAKE
// ============================================================================

/**
 * Salva os dados da rodada consolidada como dumps permanentes
 * Isso preserva os dados históricos para Hall da Fama, restaurações e análises
 *
 * @param {string} ligaId - ID da liga
 * @param {number} rodadaNum - Número da rodada
 * @param {Array} dadosRodada - Dados da rodada (da collection Rodada)
 * @param {number} temporada - Temporada atual
 */
async function backupRodadaParaDataLake(ligaId, rodadaNum, dadosRodada, temporada = new Date().getFullYear()) {
    try {
        logger.log(`[DATA-LAKE] 💾 Salvando backup R${rodadaNum} (${dadosRodada.length} times)...`);

        let salvos = 0;
        let jaExistentes = 0;

        for (const rodadaData of dadosRodada) {
            const timeId = rodadaData.timeId;

            // Verificar se já existe dump para esta rodada/time
            const existente = await CartolaOficialDump.findOne({
                time_id: timeId,
                temporada: temporada,
                rodada: rodadaNum,
                tipo_coleta: 'time_rodada'
            }).lean();

            if (existente) {
                jaExistentes++;
                continue;
            }

            // Criar dump permanente
            await CartolaOficialDump.salvarDump({
                time_id: timeId,
                temporada: temporada,
                rodada: rodadaNum,
                tipo_coleta: 'time_rodada',
                raw_json: {
                    time: {
                        time_id: timeId,
                        nome: rodadaData.nome_time,
                        nome_cartola: rodadaData.nome_cartola,
                        url_escudo_png: rodadaData.escudo,
                        clube_id: rodadaData.clube_id
                    },
                    pontos: rodadaData.pontos,
                    rodada_atual: rodadaNum,
                    rodada_nao_jogada: rodadaData.rodadaNaoJogada || false,
                    _source: 'consolidacao_automatica',
                    _backup_date: new Date().toISOString()
                },
                meta: {
                    url_origem: `consolidacao://${ligaId}/${timeId}/${rodadaNum}`,
                    http_status: 200,
                    origem_trigger: 'consolidacao',
                    liga_id: new mongoose.Types.ObjectId(ligaId)
                }
            });

            salvos++;
        }

        logger.log(`[DATA-LAKE] ✅ Backup R${rodadaNum}: ${salvos} novos, ${jaExistentes} já existentes`);

        return { salvos, jaExistentes };
    } catch (error) {
        logger.error(`[DATA-LAKE] ⚠️ Erro no backup R${rodadaNum}:`, error.message);
        // Não lança erro para não interromper a consolidação
        return { salvos: 0, erro: error.message };
    }
}

// ============================================================================
// 🔒 CONSOLIDA UMA RODADA ESPECÍFICA (com transação) - VERSÃO COMPLETA
// ============================================================================

export const consolidarRodada = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        const { ligaId, rodada } = req.params;
        const forcar = req.query.forcar === 'true'; // ✅ NOVO: Permite forçar reconsolidação
        const rodadaNum = parseInt(rodada);

        logger.log(`[CONSOLIDAÇÃO] 🔒 Iniciando snapshot R${rodadaNum} da liga ${ligaId} (forçar: ${forcar})`);

        // ✅ GUARD: Não consolidar rodada com mercado aberto
        if (!isSeasonFinished()) {
            try {
                const statusMercado = await fetch('https://api.cartola.globo.com/mercado/status').then(r => r.json());
                if (statusMercado?.status_mercado === 1 && rodadaNum >= statusMercado.rodada_atual) {
                    logger.log(`[CONSOLIDAÇÃO] ❌ Bloqueado: R${rodadaNum} com mercado aberto (rodada_atual: ${statusMercado.rodada_atual})`);
                    return res.status(400).json({
                        error: `Rodada ${rodadaNum} não pode ser consolidada com mercado aberto`,
                        rodada_atual: statusMercado.rodada_atual,
                        status_mercado: 'aberto'
                    });
                }
            } catch (e) {
                logger.warn('[CONSOLIDAÇÃO] Falha ao verificar status do mercado, prosseguindo...', e.message);
            }
        }

        // ✅ VERIFICAR SE JÁ CONSOLIDADA (pular se forçar=true)
        if (!forcar) {
            const existente = await RodadaSnapshot.findOne({
                liga_id: ligaId,
                rodada: rodadaNum,
                temporada: CURRENT_SEASON,
                status: "consolidada"
            }).lean();
            
            if (existente) {
                // Verificar se tem os novos campos (versao_schema >= 2)
                const temNovoscampos = existente.versao_schema >= 2 && 
                    existente.dados_consolidados?.ranking_rodada?.length > 0;
                
                if (temNovoscampos) {
                    logger.log(`[CONSOLIDAÇÃO] ⚠️ R${rodadaNum} já consolidada (v2) em ${existente.data_consolidacao}`);
                    return res.json({
                        success: true,
                        jaConsolidada: true,
                        rodada: rodadaNum,
                        consolidadaEm: existente.data_consolidacao,
                        versao: existente.versao_schema || 1
                    });
                }
                
                // Se não tem novos campos, continua para reconsolidar
                logger.log(`[CONSOLIDAÇÃO] ♻️ R${rodadaNum} está na versão antiga, reconsolidando...`);
            }
        } else {
            logger.log(`[CONSOLIDAÇÃO] ⚡ Forçando reconsolidação da R${rodadaNum}`);
        }
        
        session.startTransaction();
        
        // Buscar dados da liga para saber módulos ativos
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) throw new Error('Liga não encontrada');
        
        const modulosAtivos = liga.modulos_ativos || {};
        
        // 1. RANKING GERAL (acumulado até esta rodada)
        logger.log(`[CONSOLIDAÇÃO] Calculando ranking geral...`);
        const rankingGeral = await calcularRankingCompleto(ligaId, rodadaNum);
        
        // 2. RANKING DA RODADA (pontuação específica desta rodada)
        // ✅ v3.2.0: Filtrar por temporada para não misturar dados de temporadas diferentes
        logger.log(`[CONSOLIDAÇÃO] Calculando ranking da rodada (temporada ${CURRENT_SEASON})...`);
        const dadosRodada = await Rodada.find({
            ligaId: new mongoose.Types.ObjectId(ligaId),
            rodada: rodadaNum,
            temporada: CURRENT_SEASON,
            populacaoFalhou: { $ne: true }, // ✅ v3.2: Excluir registros com falha de API
        }).lean();
        
        // ✅ v3.3.0: Buscar config de ranking_rodada para enriquecer com valor_financeiro
        const configRankingRodada = getConfigRankingRodada(liga, rodadaNum);
        const valoresRanking = configRankingRodada.valores || {};
        const faixasRanking = configRankingRodada.faixas || {};

        const rankingRodada = dadosRodada
            .map(d => ({
                time_id: d.timeId,
                nome_time: d.nome_time || 'N/D',           // ✅ Campo correto
                nome_cartola: d.nome_cartola || 'N/D',     // ✅ Campo correto
                escudo: d.escudo || d.url_escudo_png || '', // ✅ Adicionado escudo
                escudo_time_do_coracao: d.escudo_time_do_coracao || '',
                clube_id: d.clube_id || null,
                pontos_rodada: d.pontos || 0
            }))
            .sort((a, b) => b.pontos_rodada - a.pontos_rodada)
            .map((t, i) => {
                const posicao = i + 1;
                const valorFinanceiro = valoresRanking[posicao] || valoresRanking[String(posicao)] || 0;

                // Determinar zona baseada no valor financeiro e faixas configuradas
                let zona = 'Neutro';
                if (valorFinanceiro > 0) {
                    zona = posicao === 1 ? 'MITO' : `G${posicao}`;
                } else if (valorFinanceiro < 0) {
                    const totalTimes = dadosRodada.length;
                    const inicioPerda = faixasRanking.debito?.inicio || totalTimes;
                    if (posicao === totalTimes) {
                        zona = 'MICO';
                    } else {
                        zona = `Z${posicao - inicioPerda + 1}`;
                    }
                }

                return { ...t, posicao, valor_financeiro: valorFinanceiro, zona };
            });

        // 3. FINANCEIRO (resumo por time + extratos individuais)
        logger.log(`[CONSOLIDAÇÃO] Calculando financeiro...`);
        const financeiro = await getFluxoFinanceiroLiga(ligaId, rodadaNum);
        
        // Buscar extratos individuais detalhados
        // ✅ v2.2: Buscar com ObjectId E String para compatibilidade
        const extratosDetalhados = await ExtratoFinanceiroCache.find({
            $or: [
                { liga_id: ligaId },
                { liga_id: new mongoose.Types.ObjectId(ligaId) }
            ]
        }).lean();
        
        const extratosFinanceiros = extratosDetalhados.map(e => ({
            time_id: e.time_id,
            saldo_acumulado: e.saldo_consolidado || 0,
            transacoes: (e.historico_transacoes || []).filter(t => t.rodada <= rodadaNum)
        }));
        
        // 4. CONFRONTOS PONTOS CORRIDOS (calcular desta rodada)
        // v2.0: Módulo OPCIONAL, só habilita se === true
        let confrontosPontosCorridos = [];
        if (modulosAtivos.pontosCorridos === true) {
            logger.log(`[CONSOLIDAÇÃO] Calculando confrontos pontos corridos...`);
            try {
                confrontosPontosCorridos = await calcularConfrontosDaRodada(ligaId, rodadaNum, dadosRodada, liga);
            } catch (e) {
                logger.warn(`[CONSOLIDAÇÃO] ⚠️ Erro ao calcular pontos corridos:`, e.message);
            }
        }
        
        // 5. MATA-MATA
        // v2.0: Módulo OPCIONAL, só habilita se === true
        let confrontosMataMata = [];
        if (modulosAtivos.mataMata === true) {
            logger.log(`[CONSOLIDAÇÃO] Obtendo confrontos mata-mata...`);
            try {
                confrontosMataMata = await obterConfrontosMataMata(ligaId, rodadaNum);
            } catch (e) {
                logger.warn(`[CONSOLIDAÇÃO] ⚠️ Erro ao obter mata-mata:`, e.message);
            }
        }
        
        // 6. TOP 10 (Mitos e Micos da RODADA) - v3.0: Config dinâmica
        logger.log(`[CONSOLIDAÇÃO] Calculando Top 10...`);
        const configTop10 = getConfigTop10(liga);

        const mitos = rankingRodada.slice(0, 10).map((t, i) => ({
            ...t,
            premio: configTop10.mitos[i + 1] || configTop10.mitos[String(i + 1)] || 0
        }));

        const micos = [...rankingRodada]
            .reverse()
            .slice(0, 10)
            .map((t, i) => ({
                ...t,
                posicao: rankingRodada.length - i,
                multa: configTop10.micos[i + 1] || configTop10.micos[String(i + 1)] || 0
            }));
        
        // 7. ARTILHEIRO E CAMPEÃO (se módulo ativo)
        // v2.0: Módulo OPCIONAL, só habilita se === true
        let artilheiroCampeao = { artilheiro: null, campeao_rodada: null };
        if (modulosAtivos.artilheiro === true) {
            logger.log(`[CONSOLIDAÇÃO] Buscando artilheiro/campeão...`);
            try {
                const dadosArtilheiro = await getRankingArtilheiroCampeao(ligaId, rodadaNum);
                if (dadosArtilheiro) {
                    artilheiroCampeao = dadosArtilheiro;
                }
            } catch (e) {
                logger.warn(`[CONSOLIDAÇÃO] ⚠️ Erro ao obter artilheiro:`, e.message);
            }
        }
        
        // Campeão da rodada (maior pontuação)
        if (rankingRodada.length > 0) {
            artilheiroCampeao.campeao_rodada = {
                time_id: rankingRodada[0].time_id,
                nome_time: rankingRodada[0].nome_time,
                pontos: rankingRodada[0].pontos_rodada
            };
        }
        
        // 8. LUVA DE OURO - v3.0: Usa isModuloHabilitado ao invés de hardcoded ID
        let luvaDeOuro = { ranking: [], melhor_goleiro_rodada: null };
        const luvaOuroHabilitado = isModuloHabilitado(liga, 'luva_ouro') || modulosAtivos.luvaOuro;
        if (luvaOuroHabilitado) {
            logger.log(`[CONSOLIDAÇÃO] Buscando Luva de Ouro...`);
            try {
                const { obterRankingGoleiros } = await import('../services/goleirosService.js');
                const rankingGoleiros = await obterRankingGoleiros(ligaId, 1, rodadaNum);
                if (rankingGoleiros && rankingGoleiros.ranking) {
                    luvaDeOuro.ranking = rankingGoleiros.ranking;
                    if (rankingGoleiros.ranking.length > 0) {
                        luvaDeOuro.melhor_goleiro_rodada = rankingGoleiros.ranking[0];
                    }
                }
            } catch (e) {
                logger.warn(`[CONSOLIDAÇÃO] ⚠️ Erro ao obter Luva de Ouro:`, e.message);
            }
        }
        
        // 9. Buscar status do mercado (SEASON GUARD: usar valores fixos se temporada encerrada)
        let statusMercado = { rodada_atual: 38, mes_atual: 12 };
        if (!isSeasonFinished()) {
            statusMercado = await fetch('https://api.cartola.globo.com/mercado/status')
                .then(r => r.json())
                .catch(() => ({ rodada_atual: 38, mes_atual: 12 }));
        }
        
        // 10. MONTAR SNAPSHOT COMPLETO
        const snapshot = {
            liga_id: ligaId,
            rodada: rodadaNum,
            temporada: CURRENT_SEASON,
            status: "consolidada",
            data_consolidacao: new Date(),
            versao_schema: 2,
            dados_consolidados: {
                ranking_geral: rankingGeral,
                ranking_rodada: rankingRodada,
                times_stats: financeiro,
                extratos_financeiros: extratosFinanceiros,
                confrontos_pontos_corridos: confrontosPontosCorridos,
                confrontos_mata_mata: confrontosMataMata,
                top10: { mitos, micos },
                artilheiro_campeao: artilheiroCampeao,
                luva_de_ouro: luvaDeOuro,
                melhor_mes: {},
                destaques: {
                    maior_pontuacao: rankingRodada[0] || null,
                    menor_pontuacao: rankingRodada[rankingRodada.length - 1] || null
                }
            },
            status_mercado: {
                rodada_atual: statusMercado.rodada_atual,
                mes_atual: statusMercado.mes_atual,
                timestamp_consolidacao: new Date()
            },
            atualizado_em: new Date()
        };
        
        // 11. Salvar snapshot (upsert) — filtro DEVE incluir temporada (índice único)
        await RodadaSnapshot.findOneAndUpdate(
            { liga_id: ligaId, rodada: rodadaNum, temporada: CURRENT_SEASON },
            snapshot,
            { upsert: true, new: true, session }
        );
        
        // 12. ATUALIZAR CACHES RELACIONADOS
        
        // 12a. Ranking Geral Cache
        await RankingGeralCache.findOneAndUpdate(
            { ligaId: new mongoose.Types.ObjectId(ligaId), rodadaFinal: rodadaNum, temporada: CURRENT_SEASON },
            {
                ligaId: new mongoose.Types.ObjectId(ligaId),
                rodadaFinal: rodadaNum,
                temporada: CURRENT_SEASON,
                ranking: rankingGeral,
                consolidada: true,
                atualizadoEm: new Date()
            },
            { upsert: true, session }
        );
        
        // 12b. Top10 Cache - v3.1.1: Incluir temporada para segregacao
        const temporadaAtualConsolidacao = SEASON_CONFIG?.current || new Date().getFullYear();
        await Top10Cache.findOneAndUpdate(
            { liga_id: ligaId, rodada_consolidada: rodadaNum, temporada: temporadaAtualConsolidacao },
            {
                mitos,
                micos,
                temporada: temporadaAtualConsolidacao,
                cache_permanente: true,
                ultima_atualizacao: new Date()
            },
            { upsert: true, session }
        );

        await session.commitTransaction();

        // 12c. INVALIDAR CACHES DEPENDENTES (pós-commit)
        try {
            await invalidarCachesLiga(ligaId, CURRENT_SEASON, `Consolidação R${rodadaNum} completada`);
            logger.log(`[CONSOLIDAÇÃO] 🗑️ Caches dependentes invalidados para liga ${ligaId}`);
        } catch (cacheError) {
            logger.error(`[CONSOLIDAÇÃO] ⚠️ Erro ao invalidar caches (não-fatal):`, cacheError.message);
        }

        // 13. BACKUP PARA DATA LAKE (após commit, não bloqueia consolidação)
        // Salva dados permanentes para Hall da Fama e restaurações futuras
        const temporadaAtual = CURRENT_SEASON; // ✅ FIX: SEASON_CONFIG.temporada não existe — usar CURRENT_SEASON
        const backupResult = await backupRodadaParaDataLake(ligaId, rodadaNum, dadosRodada, temporadaAtual);

        logger.log(`[CONSOLIDAÇÃO] ✅ R${rodadaNum} consolidada com sucesso! (${rankingRodada.length} times)`);

        // 14. PUSH NOTIFICATIONS + MÓDULOS DEPENDENTES - Executar em background
        setImmediate(async () => {
            try {
                // Gatilho: Rodada Finalizada (todos da liga)
                await triggerRodadaFinalizada(ligaId, rodadaNum, {
                    times: rankingRodada.length,
                    mitos: mitos.length,
                    micos: micos.length
                });

                // Gatilho: Mito/Mico (apenas top 1 e ultimo)
                await triggerMitoMico(ligaId, rodadaNum, { mitos, micos });

                logger.log(`[CONSOLIDAÇÃO] 🔔 Notificacoes push disparadas para R${rodadaNum}`);
            } catch (notifError) {
                logger.error(`[CONSOLIDAÇÃO] ⚠️ Erro ao enviar notificacoes:`, notifError.message);
            }

            // ✅ FIX: Consolidar Capitão de Luxo automaticamente após rodada
            try {
                const capitaoAtivo = modulosAtivos.capitaoLuxo === true ||
                    modulosAtivos.capitao_luxo === true ||
                    modulosAtivos.capitao === true ||
                    liga?.configuracoes?.capitao_luxo?.habilitado === true;

                if (capitaoAtivo) {
                    const temporadaConsolidacao = CURRENT_SEASON; // ✅ FIX: SEASON_CONFIG.temporada não existe — usar CURRENT_SEASON
                    logger.log(`[CONSOLIDAÇÃO] 🎖️ Consolidando Capitão de Luxo até R${rodadaNum}...`);
                    await consolidarRankingCapitao(ligaId, temporadaConsolidacao, rodadaNum);
                    logger.log(`[CONSOLIDAÇÃO] 🎖️ Capitão de Luxo consolidado com sucesso!`);
                }
            } catch (capitaoError) {
                logger.error(`[CONSOLIDAÇÃO] ⚠️ Erro ao consolidar Capitão de Luxo:`, capitaoError.message);
            }
        });
        
        res.json({
            success: true,
            rodada: rodadaNum,
            status: "consolidada",
            timestamp: new Date(),
            resumo: {
                times: rankingRodada.length,
                confrontos_pc: confrontosPontosCorridos.length,
                confrontos_mm: confrontosMataMata.length,
                mitos: mitos.length,
                micos: micos.length,
                data_lake: backupResult
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        logger.error('[CONSOLIDAÇÃO] ❌ Erro:', error);
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
    }
};

// ============================================================================
// 📊 VERIFICAR STATUS DE CONSOLIDAÇÃO
// ============================================================================

export const verificarStatusConsolidacao = async (req, res) => {
    try {
        const { ligaId } = req.params;
        
        const total = await RodadaSnapshot.countDocuments({ liga_id: ligaId });
        const consolidadas = await RodadaSnapshot.countDocuments({ 
            liga_id: ligaId, 
            status: "consolidada" 
        });
        const abertas = await RodadaSnapshot.countDocuments({ 
            liga_id: ligaId, 
            status: "aberta" 
        });
        
        // Contar versões
        const versaoV2 = await RodadaSnapshot.countDocuments({
            liga_id: ligaId,
            status: "consolidada",
            versao_schema: { $gte: 2 }
        });
        const versaoV1 = consolidadas - versaoV2;
        
        // Buscar detalhes das rodadas
        const snapshots = await RodadaSnapshot.find({ liga_id: ligaId })
            .select('rodada status versao_schema data_consolidacao')
            .sort({ rodada: 1 })
            .lean();
        
        const rodadasDetalhes = snapshots.map(s => ({
            rodada: s.rodada,
            status: s.status,
            versao: s.versao_schema || 1,
            consolidada_em: s.data_consolidacao,
            precisa_atualizar: s.status === 'consolidada' && (!s.versao_schema || s.versao_schema < 2)
        }));
        
        const precisamAtualizar = rodadasDetalhes.filter(r => r.precisa_atualizar).length;
        
        res.json({
            liga_id: ligaId,
            total_snapshots: total,
            consolidadas,
            abertas,
            pendentes: total - consolidadas,
            versoes: {
                v1_legado: versaoV1,
                v2_atual: versaoV2,
                precisam_atualizar: precisamAtualizar
            },
            rodadas: rodadasDetalhes
        });
        
    } catch (error) {
        logger.error('[CONSOLIDAÇÃO] Erro ao verificar status:', error);
        res.status(500).json({ error: error.message });
    }
};

logger.log("[CONSOLIDAÇÃO] ✅ v3.0.0 carregado (SaaS Dinâmico)");
