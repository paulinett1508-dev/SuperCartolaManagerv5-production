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

import mongoose from 'mongoose';
import dataAggregator from '../../services/escalacaoIA/dataAggregator.js';
import lineupOptimizer from '../../services/escalacaoIA/lineupOptimizer.js';
import aiSynthesizer from '../../services/escalacaoIA/aiSynthesizer.js';
import { MODOS } from '../../services/estrategia-sugestao.js';
import marketGate from '../../utils/marketGate.js';
import systemTokenService from '../../services/systemTokenService.js';
import cartolaProService from '../../services/cartolaProService.js';
import perplexityService from '../../services/perplexityAnalysisService.js';
import cartolaAnaliticoScraper from '../../services/scrapers/cartolaAnaliticoScraper.js';
import cartolaWebScraper from '../../services/scrapers/cartolaWebScraper.js';

const LOG_PREFIX = '[ESCALACAO-IA-CTRL]';

// =====================================================================
// GERAR ANALISE SOB DEMANDA
// =====================================================================
async function gerarAnalise(req, res) {
    try {
        const esquemaId = parseInt(req.query.esquemaId) || 3;
        const modoFiltro = req.query.modo || null; // null = gerar todos

        // Tentar usar patrimonio real da conta do admin (token de sistema)
        let patrimonio = parseFloat(req.query.patrimonio) || null;
        let patrimonioFonte = 'manual';

        if (!patrimonio) {
            try {
                const authTime = await systemTokenService.fazerRequisicaoAutenticada('/auth/time');
                if (authTime.success && authTime.data?.time?.patrimonio > 0) {
                    patrimonio = authTime.data.time.patrimonio;
                    patrimonioFonte = 'conta-admin';
                    console.log(`${LOG_PREFIX} Patrimonio real do admin: C$${patrimonio}`);
                }
            } catch (err) { console.warn(`${LOG_PREFIX} Nao foi possivel obter patrimonio real: ${err.message}`); }
        }

        patrimonio = patrimonio || 100;

        if (patrimonio <= 0 || patrimonio > 500) {
            return res.status(400).json({
                success: false,
                message: 'Patrimonio deve ser entre 0 e 500 Cartoletas',
            });
        }

        console.log(`${LOG_PREFIX} Gerando analise: C$${patrimonio} (${patrimonioFonte}), esquema=${esquemaId}`);

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
            patrimonioFonte,
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

// =====================================================================
// SALVAR ESCALACAO GERADA
// =====================================================================
async function salvarEscalacao(req, res) {
    try {
        const { cenarios, modoSugerido, fontesAtivas, rodada, patrimonio, esquemaId, totalAtletasAnalisados, tempoAgregacaoMs, geradoEm } = req.body;

        if (!cenarios || !Array.isArray(cenarios) || cenarios.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dados de escalacao invalidos (cenarios ausentes)',
            });
        }

        if (!rodada) {
            return res.status(400).json({
                success: false,
                message: 'Rodada nao informada',
            });
        }

        const db = mongoose.connection.db;
        if (!db) {
            return res.status(500).json({
                success: false,
                message: 'Conexao com banco indisponivel',
            });
        }

        const documento = {
            rodada: parseInt(rodada),
            patrimonio: parseFloat(patrimonio) || 100,
            esquemaId: parseInt(esquemaId) || 3,
            cenarios,
            modoSugerido,
            fontesAtivas,
            totalAtletasAnalisados,
            tempoAgregacaoMs,
            geradoEm,
            salvoPor: req.session.admin?.email || req.session.admin?.nome || 'admin',
            salvoEm: new Date().toISOString(),
        };

        await db.collection('escalacao_ia_salvas').updateOne(
            { rodada: documento.rodada },
            { $set: documento },
            { upsert: true }
        );

        console.log(`${LOG_PREFIX} Escalacao salva: rodada ${documento.rodada} por ${documento.salvoPor}`);

        return res.json({
            success: true,
            message: 'Escalacao salva com sucesso',
            rodada: documento.rodada,
            salvoEm: documento.salvoEm,
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao salvar escalacao:`, error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao salvar escalacao',
            error: error.message,
        });
    }
}

// =====================================================================
// BUSCAR ESCALACAO SALVA
// =====================================================================
async function buscarSalva(req, res) {
    try {
        const rodada = parseInt(req.query.rodada) || null;

        const db = mongoose.connection.db;
        if (!db) {
            return res.json({ success: true, encontrada: false });
        }

        const filtro = rodada ? { rodada } : {};
        const escalacao = await db.collection('escalacao_ia_salvas').findOne(
            filtro,
            { sort: { salvoEm: -1 } }
        );

        if (!escalacao) {
            return res.json({
                success: true,
                encontrada: false,
                message: 'Nenhuma escalacao salva encontrada',
            });
        }

        return res.json({
            success: true,
            encontrada: true,
            dados: {
                cenarios: escalacao.cenarios,
                modoSugerido: escalacao.modoSugerido,
                fontesAtivas: escalacao.fontesAtivas,
                rodada: escalacao.rodada,
                patrimonio: escalacao.patrimonio,
                esquemaId: escalacao.esquemaId,
                totalAtletasAnalisados: escalacao.totalAtletasAnalisados,
                tempoAgregacaoMs: escalacao.tempoAgregacaoMs,
                geradoEm: escalacao.geradoEm,
                salvoEm: escalacao.salvoEm,
                salvoPor: escalacao.salvoPor,
            },
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao buscar escalacao salva:`, error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao buscar escalacao salva',
        });
    }
}

// =====================================================================
// GATOMESTRE: STATUS DO TOKEN DE SISTEMA
// =====================================================================
async function gatoMestreStatus(req, res) {
    try {
        const status = await systemTokenService.statusToken();
        res.json({ success: true, ...status });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao obter status GatoMestre:`, error.message);
        res.status(500).json({ success: false, message: 'Erro ao verificar status' });
    }
}

// =====================================================================
// GATOMESTRE: CONECTAR (autentica na Globo e salva token de sistema)
// =====================================================================
async function gatoMestreConectar(req, res) {
    try {
        const { glbid } = req.body;

        if (!glbid) {
            return res.status(400).json({ success: false, message: 'Token GLBID obrigatório' });
        }

        const email = req.session.admin?.email || 'admin';

        const auth = {
            glbid,
            email,
            nome: email.split('@')[0],
            expires_at: Math.floor(Date.now() / 1000) + 7200, // 2 horas estimado
        };

        const salvo = await systemTokenService.salvarTokenSistema(auth);
        if (!salvo) {
            return res.status(500).json({ success: false, message: 'Erro ao salvar token' });
        }

        console.log(`${LOG_PREFIX} Token GatoMestre salvo para: ${email}`);
        res.json({ success: true, message: 'Conectado com sucesso', email });

    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao conectar GatoMestre:`, error.message);
        res.status(500).json({ success: false, message: 'Erro interno ao conectar' });
    }
}

// =====================================================================
// GATOMESTRE: DESCONECTAR (revoga token de sistema)
// =====================================================================
async function gatoMestreDesconectar(req, res) {
    try {
        const revogado = await systemTokenService.revogarTokenSistema();
        if (!revogado) {
            return res.status(500).json({ success: false, message: 'Erro ao revogar token' });
        }
        console.log(`${LOG_PREFIX} Token GatoMestre revogado por: ${req.session.admin?.email}`);
        res.json({ success: true, message: 'Desconectado com sucesso' });
    } catch (error) {
        console.error(`${LOG_PREFIX} Erro ao desconectar GatoMestre:`, error.message);
        res.status(500).json({ success: false, message: 'Erro interno ao desconectar' });
    }
}

export default {
    gerarAnalise,
    buscarCached,
    statusFontes,
    refresh,
    preComputar,
    salvarEscalacao,
    buscarSalva,
    gatoMestreStatus,
    gatoMestreConectar,
    gatoMestreDesconectar,
};
