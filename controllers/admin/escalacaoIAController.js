/**
 * ESCALACAO IA CONTROLLER v1.0
 * Controller admin para sugestao inteligente de escalacao.
 *
 * Orquestra: dataAggregator -> scoringEngine -> lineupOptimizer -> aiSynthesizer
 *
 * Endpoints:
 *   GET  /api/admin/escalacao-ia/gerar    - Gerar analise sob demanda
 *   GET  /api/admin/escalacao-ia/cached   - Buscar ultima analise pre-computada
 *   GET  /api/admin/escalacao-ia/status   - Status das fontes de dados
 *   POST /api/admin/escalacao-ia/refresh  - Forcar re-analise (limpa cache)
 */

import dataAggregator from '../../services/escalacaoIA/dataAggregator.js';
import lineupOptimizer from '../../services/escalacaoIA/lineupOptimizer.js';
import aiSynthesizer from '../../services/escalacaoIA/aiSynthesizer.js';
import { MODOS } from '../../services/estrategia-sugestao.js';
import marketGate from '../../utils/marketGate.js';
import systemTokenService from '../../services/systemTokenService.js';
import perplexityService from '../../services/perplexityAnalysisService.js';
import cartolaAnaliticoScraper from '../../services/scrapers/cartolaAnaliticoScraper.js';
import cartolaWebScraper from '../../services/scrapers/cartolaWebScraper.js';

const LOG_PREFIX = '[ESCALACAO-IA-CTRL]';

// =====================================================================
// GERAR ANALISE SOB DEMANDA
// =====================================================================
async function gerarAnalise(req, res) {
    try {
        const patrimonio = parseFloat(req.query.patrimonio) || 100;
        const esquemaId = parseInt(req.query.esquemaId) || 3;
        const modoFiltro = req.query.modo || null; // null = gerar todos

        if (patrimonio <= 0 || patrimonio > 500) {
            return res.status(400).json({
                success: false,
                message: 'Patrimonio deve ser entre 0 e 500 Cartoletas',
            });
        }

        console.log(`${LOG_PREFIX} Gerando analise: C$${patrimonio}, esquema=${esquemaId}`);

        // 1. Agregar dados multi-fonte
        const dadosAgregados = await dataAggregator.agregarDados();

        // 2. Gerar cenarios
        let resultado;
        if (modoFiltro && MODOS[modoFiltro.toUpperCase()]) {
            // Gerar cenario unico
            const cenario = lineupOptimizer.gerarCenarioUnico(
                dadosAgregados.atletas,
                patrimonio,
                esquemaId,
                MODOS[modoFiltro.toUpperCase()]
            );
            resultado = {
                cenarios: [cenario],
                modoSugerido: { modo: modoFiltro },
            };
        } else {
            // Gerar 3 cenarios
            resultado = lineupOptimizer.gerarCenarios(
                dadosAgregados.atletas,
                patrimonio,
                esquemaId
            );
        }

        // 3. Gerar justificativas IA para cada cenario
        const cenariosComJustificativa = [];
        for (const cenario of resultado.cenarios) {
            const justificativas = await aiSynthesizer.gerarJustificativas(cenario, {
                rodada: dadosAgregados.rodada,
                patrimonio,
                fontesAtivas: dadosAgregados.fontesAtivas,
            });

            cenariosComJustificativa.push({
                ...cenario,
                justificativas: justificativas.justificativas,
                resumo: justificativas.resumo,
                usouIA: justificativas.usouIA,
            });
        }

        return res.json({
            success: true,
            cenarios: cenariosComJustificativa,
            modoSugerido: resultado.modoSugerido,
            fontesAtivas: dadosAgregados.fontesAtivas,
            rodada: dadosAgregados.rodada,
            patrimonio,
            esquemaId,
            totalAtletasAnalisados: dadosAgregados.totalAtletas,
            tempoAgregacaoMs: dadosAgregados.tempoMs,
            geradoEm: new Date().toISOString(),
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao gerar analise:`, error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao gerar analise de escalacao',
            error: error.message,
        });
    }
}

// =====================================================================
// BUSCAR ANALISE CACHED
// =====================================================================
async function buscarCached(req, res) {
    try {
        const rodada = parseInt(req.query.rodada) || null;

        // Tentar buscar do cache MongoDB
        if (rodada) {
            const snapshot = await dataAggregator.buscarUltimoSnapshot(rodada);
            if (snapshot) {
                return res.json({
                    success: true,
                    cached: true,
                    snapshot,
                    geradoEm: snapshot.geradoEm,
                });
            }
        }

        return res.json({
            success: true,
            cached: false,
            message: 'Nenhuma analise pre-computada disponivel. Use /gerar para criar uma.',
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao buscar cache:`, error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao buscar analise cached',
        });
    }
}

// =====================================================================
// STATUS DAS FONTES
// =====================================================================
async function statusFontes(req, res) {
    try {
        const [tokenStatus, analiticoStatus, webStatus, mercadoStatus] = await Promise.allSettled([
            systemTokenService.statusToken(),
            cartolaAnaliticoScraper.verificarDisponibilidade(),
            cartolaWebScraper.verificarDisponibilidade(),
            marketGate.fetchStatus ? marketGate.fetchStatus() : Promise.resolve(null),
        ]);

        return res.json({
            success: true,
            fontes: {
                cartolaApi: {
                    disponivel: true,
                    status: 'ALWAYS_ON',
                    descricao: 'API publica do Cartola FC',
                },
                gatoMestrePremium: {
                    disponivel: tokenStatus.status === 'fulfilled' && tokenStatus.value?.disponivel,
                    status: tokenStatus.status === 'fulfilled'
                        ? (tokenStatus.value?.disponivel ? 'ATIVO' : 'SEM_TOKEN')
                        : 'ERRO',
                    email: tokenStatus.value?.email || null,
                    descricao: 'Endpoints autenticados (GatoMestre)',
                },
                cartolaAnalitico: {
                    disponivel: analiticoStatus.status === 'fulfilled' && analiticoStatus.value?.disponivel,
                    status: analiticoStatus.status === 'fulfilled'
                        ? analiticoStatus.value?.status
                        : 'ERRO',
                    descricao: 'Scraper cartolaanalitico.com',
                },
                webScraper: {
                    disponivel: true,
                    status: 'CONFIGURADO',
                    sites: webStatus.status === 'fulfilled' ? webStatus.value : {},
                    descricao: 'Scraper de blogs (Cartoleiros, etc)',
                },
                perplexity: {
                    disponivel: perplexityService.isDisponivel(),
                    status: perplexityService.isDisponivel() ? 'ATIVO' : 'SEM_API_KEY',
                    descricao: 'Pesquisa web inteligente via Perplexity',
                },
                confrontos: {
                    disponivel: true,
                    status: 'ALWAYS_ON',
                    descricao: 'Analise de confrontos e defesas vulneraveis',
                },
            },
            mercado: mercadoStatus.status === 'fulfilled' ? mercadoStatus.value : null,
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao verificar status:`, error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao verificar status das fontes',
        });
    }
}

// =====================================================================
// REFRESH (limpar cache e re-gerar)
// =====================================================================
async function refresh(req, res) {
    try {
        dataAggregator.limparCache();
        console.log(`${LOG_PREFIX} Cache limpo, re-gerando analise...`);

        // Redirecionar para gerar
        return gerarAnalise(req, res);
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao fazer refresh:`, error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao fazer refresh da analise',
        });
    }
}

// =====================================================================
// PRE-COMPUTAR (chamado pelo cron)
// =====================================================================
async function preComputar(patrimonioDefault = 100) {
    try {
        // Verificar se mercado esta aberto
        let mercadoAberto = true;
        try {
            const status = await marketGate.fetchStatus();
            mercadoAberto = status?.mercado_aberto ?? true;
        } catch {
            // Se nao conseguir verificar, assumir aberto
        }

        if (!mercadoAberto) {
            console.log(`${LOG_PREFIX} Mercado fechado, pulando pre-computacao`);
            return null;
        }

        console.log(`${LOG_PREFIX} Pre-computando analise (C$${patrimonioDefault})...`);

        const dadosAgregados = await dataAggregator.agregarDados();
        const resultado = lineupOptimizer.gerarCenarios(
            dadosAgregados.atletas,
            patrimonioDefault,
            3 // 4-3-3 default
        );

        console.log(`${LOG_PREFIX} Pre-computacao concluida: rodada ${dadosAgregados.rodada}`);
        return resultado;
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro na pre-computacao:`, error);
        return null;
    }
}

export default {
    gerarAnalise,
    buscarCached,
    statusFontes,
    refresh,
    preComputar,
};
