import express from "express";
import mongoose from "mongoose";
import { CURRENT_SEASON } from "../config/seasons.js";
import { verificarAdmin } from "../middleware/auth.js";
import {
    salvarCacheMataMata,
    lerCacheMataMata,
    deletarCacheMataMata,
} from "../controllers/mataMataCacheController.js";

const router = express.Router();

// ============================================================================
// Rate limiter especifico para operacoes de escrita do mata-mata
// Mais restritivo que o global: 30 req/min por IP
// ============================================================================
const writeLimitCounts = new Map();
const WRITE_LIMIT_WINDOW = 60 * 1000;
const WRITE_LIMIT_MAX = 30;

function mataMataWriteLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.ip || 'unknown';
    const now = Date.now();

    if (!writeLimitCounts.has(ip)) {
        writeLimitCounts.set(ip, { count: 1, startTime: now });
        return next();
    }

    const data = writeLimitCounts.get(ip);
    if (now - data.startTime > WRITE_LIMIT_WINDOW) {
        writeLimitCounts.set(ip, { count: 1, startTime: now });
        return next();
    }

    data.count++;
    if (data.count > WRITE_LIMIT_MAX) {
        console.log(`[MATA-CACHE] 🚫 Rate limit de escrita excedido: ${ip}`);
        return res.status(429).json({
            error: "Muitas operações de escrita",
            retryAfter: Math.ceil((WRITE_LIMIT_WINDOW - (now - data.startTime)) / 1000),
        });
    }

    next();
}

// Middleware de validacao de params para rotas com :ligaId
function validarLigaIdParam(req, res, next) {
    const { ligaId } = req.params;
    if (!ligaId || !mongoose.Types.ObjectId.isValid(ligaId)) {
        return res.status(400).json({ error: "ligaId invalido" });
    }
    next();
}

// Middleware de validacao de params para rotas com :edicao
function validarEdicaoParam(req, res, next) {
    const edicao = Number(req.params.edicao);
    if (!Number.isInteger(edicao) || edicao < 1 || edicao > 10) {
        return res.status(400).json({ error: "edicao invalida (esperado: 1-10)" });
    }
    next();
}

// ============================================================================
// 📋 ROTA PARA LISTAR TODAS AS EDIÇÕES DISPONÍVEIS
// ✅ FIX: Cruza MataMataCache com calendario_efetivo da ModuleConfig
//    para que edições sem cache (ainda não consolidadas) apareçam no dropdown
// ⚠️ IMPORTANTE: Esta rota DEVE vir ANTES da rota com parâmetro :edicao
// ============================================================================
router.get("/cache/:ligaId/edicoes", validarLigaIdParam, async (req, res) => {
    try {
        const { ligaId } = req.params;
        const { temporada } = req.query;
        const temporadaFiltro = temporada ? parseInt(temporada) : CURRENT_SEASON;

        console.log(
            `[MATA-CACHE] 📋 Listando edições para liga ${ligaId}, temporada ${temporadaFiltro}`,
        );

        const MataMataCache = (await import("../models/MataMataCache.js"))
            .default;
        const ModuleConfig = (await import("../models/ModuleConfig.js")).default;

        // 1. Buscar edições existentes no cache
        const edicoesCache = await MataMataCache.find({
            liga_id: ligaId,
            temporada: temporadaFiltro
        })
            .select("edicao rodada_atual ultima_atualizacao")
            .sort({ edicao: 1 })
            .lean();

        // Mapa de edições com cache para lookup rápido
        const cacheMap = new Map();
        edicoesCache.forEach(ed => cacheMap.set(ed.edicao, ed));

        // 2. Buscar calendario_efetivo da ModuleConfig (fonte de verdade do admin)
        let edicoesCalendario = [];
        try {
            const moduleConfig = await ModuleConfig.findOne({
                liga_id: ligaId,
                modulo: 'mata_mata',
                temporada: temporadaFiltro
            }).lean();

            if (moduleConfig?.calendario_override?.length > 0) {
                edicoesCalendario = moduleConfig.calendario_override;
            } else if (moduleConfig?.wizard_respostas?.total_times && moduleConfig?.wizard_respostas?.qtd_edicoes) {
                // Gerar dinamicamente (mesmo algoritmo de module-config-routes.js)
                const totalTimes = Number(moduleConfig.wizard_respostas.total_times);
                const qtdEdicoes = Number(moduleConfig.wizard_respostas.qtd_edicoes);
                let numFases;
                if (totalTimes >= 32) numFases = 5;
                else if (totalTimes >= 16) numFases = 4;
                else if (totalTimes >= 8) numFases = 3;
                else numFases = 0;

                if (numFases > 0) {
                    let rodadaAtual = 2;
                    for (let i = 0; i < qtdEdicoes; i++) {
                        const rodadaDefinicao = rodadaAtual;
                        const rodadaInicial = rodadaDefinicao + 1;
                        const rodadaFinal = rodadaInicial + numFases - 1;
                        if (rodadaFinal > 38) break;
                        edicoesCalendario.push({
                            edicao: i + 1,
                            nome: `${i + 1}ª Edição`,
                            rodada_inicial: rodadaInicial,
                            rodada_final: rodadaFinal,
                            rodada_definicao: rodadaDefinicao
                        });
                        rodadaAtual = rodadaFinal + 1;
                    }
                }
            }
        } catch (err) {
            console.warn(`[MATA-CACHE] ⚠️ Erro ao buscar calendario_efetivo:`, err.message);
        }

        // 3. Mesclar: todas as edições do calendário, enriquecidas com dados do cache
        let resumo;
        if (edicoesCalendario.length > 0) {
            resumo = edicoesCalendario.map(cal => {
                const edicaoNum = cal.edicao;
                const cached = cacheMap.get(edicaoNum);
                return {
                    edicao: edicaoNum,
                    rodada_salva: cached?.rodada_atual || null,
                    ultima_atualizacao: cached?.ultima_atualizacao || null,
                    cache_id: cached?._id || null,
                    cache_disponivel: !!cached,
                };
            });
        } else {
            // Fallback: retornar apenas edições do cache (sem ModuleConfig)
            resumo = edicoesCache.map(ed => ({
                edicao: ed.edicao,
                rodada_salva: ed.rodada_atual,
                ultima_atualizacao: ed.ultima_atualizacao,
                cache_id: ed._id,
                cache_disponivel: true,
            }));
        }

        if (resumo.length === 0) {
            return res.json({
                liga_id: ligaId,
                total: 0,
                edicoes: [],
                mensagem: "Nenhuma edição encontrada",
            });
        }

        console.log(`[MATA-CACHE] ✅ ${resumo.length} edições (${edicoesCache.length} com cache, ${edicoesCalendario.length} no calendário)`);

        res.json({
            liga_id: ligaId,
            total: resumo.length,
            edicoes: resumo,
        });
    } catch (error) {
        console.error("[MATA-CACHE] ❌ Erro ao listar edições:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// 🔍 ROTA DE DEBUG - INSPECIONAR ESTRUTURA DO MONGODB
// ⚠️ IMPORTANTE: Esta rota DEVE vir ANTES da rota com parâmetro :edicao
// 🔒 Protegida: requer sessão admin
// ============================================================================
router.get("/debug/:ligaId", verificarAdmin, validarLigaIdParam, async (req, res) => {
    try {
        const { ligaId } = req.params;

        console.log(
            `[MATA-DEBUG] 🔍 Inspecionando estrutura para liga ${ligaId}`,
        );

        const MataMataCache = (await import("../models/MataMataCache.js"))
            .default;

        // Buscar um documento de exemplo
        const exemplo = await MataMataCache.findOne({ liga_id: ligaId }).lean();

        if (!exemplo) {
            return res.json({
                error: "Nenhum documento encontrado",
                liga_id: ligaId,
            });
        }

        // Extrair estrutura do dados_torneio
        const dadosTorneio = exemplo.dados_torneio || {};

        // Análise detalhada da estrutura
        const analise = {
            documento_id: exemplo._id,
            liga_id: exemplo.liga_id,
            edicao: exemplo.edicao,
            rodada_atual: exemplo.rodada_atual,
            ultima_atualizacao: exemplo.ultima_atualizacao,

            dados_torneio_keys: Object.keys(dadosTorneio),

            estrutura_confrontos: null,
            exemplo_confronto: null,
            estrutura_time: null,

            campos_detectados: {
                tem_confrontos: !!dadosTorneio.confrontos,
                tem_jogos: !!dadosTorneio.jogos,
                tem_fases: !!dadosTorneio.fases,
                tem_rounds: !!dadosTorneio.rounds,
                tem_matches: !!dadosTorneio.matches,
            },
        };

        // Detectar array de confrontos
        let confrontos = null;
        if (dadosTorneio.confrontos && Array.isArray(dadosTorneio.confrontos)) {
            confrontos = dadosTorneio.confrontos;
            analise.estrutura_confrontos = "dados_torneio.confrontos (array)";
        } else if (dadosTorneio.jogos && Array.isArray(dadosTorneio.jogos)) {
            confrontos = dadosTorneio.jogos;
            analise.estrutura_confrontos = "dados_torneio.jogos (array)";
        } else if (dadosTorneio.fases && Array.isArray(dadosTorneio.fases)) {
            // Tentar extrair de fases
            if (dadosTorneio.fases[0]?.confrontos) {
                confrontos = dadosTorneio.fases[0].confrontos;
                analise.estrutura_confrontos =
                    "dados_torneio.fases[0].confrontos (array)";
            } else if (dadosTorneio.fases[0]?.jogos) {
                confrontos = dadosTorneio.fases[0].jogos;
                analise.estrutura_confrontos =
                    "dados_torneio.fases[0].jogos (array)";
            }
        }

        // Analisar primeiro confronto
        if (confrontos && confrontos.length > 0) {
            const primeiroConfronto = confrontos[0];
            analise.exemplo_confronto = {
                keys: Object.keys(primeiroConfronto),
                estrutura_completa: primeiroConfronto,
            };

            // Detectar estrutura dos times
            const timeA =
                primeiroConfronto.timeA ||
                primeiroConfronto.time1 ||
                primeiroConfronto.team1;
            const timeB =
                primeiroConfronto.timeB ||
                primeiroConfronto.time2 ||
                primeiroConfronto.team2;

            if (timeA) {
                analise.estrutura_time = {
                    campo_usado: primeiroConfronto.timeA
                        ? "timeA"
                        : primeiroConfronto.time1
                          ? "time1"
                          : "team1",
                    keys_do_time: Object.keys(timeA),
                    exemplo_time_completo: timeA,

                    campos_id: {
                        tem_timeId: !!timeA.timeId,
                        tem_time_id: !!timeA.time_id,
                        tem_id: !!timeA.id,
                        valor_id: timeA.timeId || timeA.time_id || timeA.id,
                    },

                    campos_nome: {
                        tem_nomeTime: !!timeA.nomeTime,
                        tem_nome_time: !!timeA.nome_time,
                        tem_nome: !!timeA.nome,
                        tem_name: !!timeA.name,
                        valor_nome:
                            timeA.nomeTime ||
                            timeA.nome_time ||
                            timeA.nome ||
                            timeA.name,
                    },

                    campos_pontos: {
                        tem_pontos: !!timeA.pontos,
                        tem_pontos_total: !!timeA.pontos_total,
                        tem_score: !!timeA.score,
                        tem_points: !!timeA.points,
                        valor_pontos:
                            timeA.pontos ||
                            timeA.pontos_total ||
                            timeA.score ||
                            timeA.points,
                    },

                    campos_escudo: {
                        tem_escudo: !!timeA.escudo,
                        tem_url_escudo_png: !!timeA.url_escudo_png,
                        tem_foto: !!timeA.foto,
                        tem_logo: !!timeA.logo,
                        valor_escudo:
                            timeA.escudo ||
                            timeA.url_escudo_png ||
                            timeA.foto ||
                            timeA.logo,
                    },

                    campos_cartoleiro: {
                        tem_nomeCartoleiro: !!timeA.nomeCartoleiro,
                        tem_nome_cartola: !!timeA.nome_cartola,
                        tem_cartoleiro: !!timeA.cartoleiro,
                        valor_cartoleiro:
                            timeA.nomeCartoleiro ||
                            timeA.nome_cartola ||
                            timeA.cartoleiro,
                    },
                };
            }
        }

        console.log("[MATA-DEBUG] ✅ Análise completa gerada");

        res.json(analise);
    } catch (error) {
        console.error("[MATA-DEBUG] ❌ Erro:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// 📦 ROTAS CRUD COM PARÂMETRO :edicao
// ⚠️ IMPORTANTE: Estas rotas DEVEM vir DEPOIS das rotas específicas acima
// 🔒 POST e DELETE protegidos: requerem sessão admin
// ============================================================================
router.post("/cache/:ligaId/:edicao", verificarAdmin, mataMataWriteLimiter, validarLigaIdParam, validarEdicaoParam, salvarCacheMataMata);
router.get("/cache/:ligaId/:edicao", validarLigaIdParam, validarEdicaoParam, lerCacheMataMata);
router.delete("/cache/:ligaId/:edicao", verificarAdmin, mataMataWriteLimiter, validarLigaIdParam, validarEdicaoParam, deletarCacheMataMata);

export default router;
