// controllers/artilheiroCampeaoController.js - VERSÃO 5.3.0 (SaaS DINÂMICO)
// ✅ PERSISTÊNCIA MONGODB + LÓGICA DE RODADA PARCIAL (igual Luva de Ouro)
// ✅ SUPORTE A PARTICIPANTES INATIVOS - FILTRO INTEGRADO
// ✅ CORREÇÃO v4.1: Não incluir rodada atual quando mercado aberto (sem scouts válidos)
// ✅ CORREÇÃO v4.2: Incluir rodadas anteriores mesmo se parcial=true (rodadas passadas são válidas)
// ✅ CORREÇÃO v4.3: Integração com participanteHelper para filtrar inativos
// ✅ CORREÇÃO v4.4: COLETA AUTOMÁTICA de rodadas faltantes no MongoDB
// ✅ v5.0.0: MULTI-TENANT - Busca participantes e configurações do banco (liga.configuracoes)
// ✅ v5.2.0: Campo temporada no GolsConsolidados, validação de sessão, criterio_ranking,
//            RODADA_FINAL dinâmico, rate limiting, audit logging, fallback melhorado
// ✅ v5.3.0: coletarDadosRodada aceita atletasPontuados (scouts ao vivo têm prioridade),
//            re-coleta automática de rodadas zeradas quando mercado fechado,
//            coletarRodada admin busca /atletas/pontuados se rodada em andamento

import mongoose from "mongoose";
import Liga from "../models/Liga.js";
import Time from "../models/Time.js";
import RankingGeralCache from "../models/RankingGeralCache.js";
import ModuleConfig from "../models/ModuleConfig.js";
import { CURRENT_SEASON, SEASON_CONFIG } from "../config/seasons.js";
import {
    buscarStatusParticipantes,
    obterUltimaRodadaValida,
    ordenarRankingComInativos,
} from "../utils/participanteHelper.js";
import { apiError, apiServerError } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

// ========================================
// MODELO MONGODB PARA GOLS CONSOLIDADOS
// ========================================
const GolsConsolidadosSchema = new mongoose.Schema(
    {
        ligaId: { type: String, required: true, index: true },
        timeId: { type: Number, required: true, index: true },
        rodada: { type: Number, required: true, index: true },
        temporada: { type: Number, required: true, default: CURRENT_SEASON, index: true },
        golsPro: { type: Number, default: 0 },
        golsContra: { type: Number, default: 0 },
        saldo: { type: Number, default: 0 },
        jogadores: [
            {
                atletaId: Number,
                nome: String,
                gols: Number,
                golsContra: Number,
            },
        ],
        parcial: { type: Boolean, default: false },
        dataColeta: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    },
);

// ✅ v5.2: Índice inclui temporada para evitar colisão multi-temporada
GolsConsolidadosSchema.index(
    { ligaId: 1, timeId: 1, rodada: 1, temporada: 1 },
    { unique: true },
);

const GolsConsolidados =
    mongoose.models.GolsConsolidados ||
    mongoose.model("GolsConsolidados", GolsConsolidadosSchema);

// =====================================================================
// ✅ v5.0: FUNÇÕES SaaS DINÂMICAS (Multi-Tenant)
// =====================================================================

/**
 * Valida se a liga tem o módulo Artilheiro habilitado
 * @param {string} ligaId - ID da liga
 * @returns {Object} { valid: boolean, liga: Object|null, error: string|null }
 */
async function validarLigaArtilheiro(ligaId) {
    const liga = await Liga.findById(ligaId).lean();
    if (!liga) {
        return { valid: false, liga: null, error: "Liga não encontrada" };
    }

    const artilheiroConfig = liga.configuracoes?.artilheiro;
    const moduloAtivo = liga.modulos_ativos?.artilheiro;

    if (!artilheiroConfig?.habilitado && !moduloAtivo) {
        return {
            valid: false,
            liga,
            error: `Liga "${liga.nome}" não tem o módulo Artilheiro habilitado`,
        };
    }

    return { valid: true, liga, error: null };
}

/**
 * Busca participantes da liga do banco de dados
 * @param {Object} liga - Documento da liga
 * @returns {Array} Lista de participantes formatados
 */
async function getParticipantesLiga(liga) {
    if (!liga.times || liga.times.length === 0) {
        logger.warn(`[ARTILHEIRO] Liga ${liga._id} sem times cadastrados`);
        return [];
    }

    // Buscar dados completos dos times
    // ✅ v5.0.1: Corrigido para buscar campos corretos (nome_cartoleiro, nome_time)
    const times = await Time.find(
        { id: { $in: liga.times } },
        { id: 1, nome_cartoleiro: 1, nome_cartola: 1, nome_time: 1, nome: 1, url_escudo_png: 1, clube_id: 1, ativo: 1 }
    ).lean();

    return times.map((time) => ({
        timeId: time.id,
        // ✅ v5.0.1: Priorizar campos corretos (nome_cartoleiro > nome_cartola)
        nome: time.nome_cartoleiro || time.nome_cartola || "N/D",
        nomeTime: time.nome_time || time.nome || "N/D",
        escudo: time.url_escudo_png || ESCUDOS_CLUBES[time.clube_id] || null,
        clubeId: time.clube_id,
        ativo: time.ativo !== false,
    }));
}

// ========================================
// ✅ v5.2: RATE LIMITER PARA API CARTOLA
// ========================================
const _apiQueue = [];
let _apiProcessing = false;
const API_RATE_LIMIT_MS = 200; // 5 req/s

async function fetchCartolaComRateLimit(url) {
    return new Promise((resolve, reject) => {
        _apiQueue.push({ url, resolve, reject });
        _processApiQueue();
    });
}

async function _processApiQueue() {
    if (_apiProcessing || _apiQueue.length === 0) return;
    _apiProcessing = true;

    while (_apiQueue.length > 0) {
        const { url, resolve, reject } = _apiQueue.shift();
        try {
            const response = await fetch(url);
            resolve(response);
        } catch (error) {
            reject(error);
        }
        if (_apiQueue.length > 0) {
            await new Promise(r => setTimeout(r, API_RATE_LIMIT_MS));
        }
    }

    _apiProcessing = false;
}

// ========================================
// ✅ v5.2: AUDIT LOG HELPER
// ========================================
async function registrarAuditLog(db, { acao, ligaId, usuario, detalhes }) {
    try {
        const collection = db.collection('artilheiro_audit_log');
        await collection.insertOne({
            acao,
            ligaId,
            usuario: usuario || 'sistema',
            detalhes,
            timestamp: new Date(),
        });
    } catch (error) {
        logger.warn(`⚠️ [AUDIT] Erro ao registrar log:`, error.message);
    }
}

// ========================================
// ✅ v5.2: ÚLTIMO STATUS CONHECIDO DO MERCADO (FALLBACK)
// ========================================
let _ultimoStatusMercado = null;

// ========================================
// ESCUDOS DOS CLUBES
// ========================================
const ESCUDOS_CLUBES = {
    262: "https://s.sde.globo.com/media/organizations/2024/08/12/Flamengo.svg",
    263: "https://s.sde.globo.com/media/organizations/2018/03/11/Botafogo-RJ.svg",
    264: "https://s.sde.globo.com/media/organizations/2018/03/11/Fluminense-RJ.svg",
    265: "https://s.sde.globo.com/media/organizations/2018/03/11/vasco.svg",
    266: "https://s.sde.globo.com/media/organizations/2018/03/11/sao-paulo.svg",
    267: "https://s.sde.globo.com/media/organizations/2018/03/11/Corinthians.svg",
    275: "https://s.sde.globo.com/media/organizations/2021/08/13/gremio.svg",
    276: "https://s.sde.globo.com/media/organizations/2018/03/11/Internacional.svg",
    277: "https://s.sde.globo.com/media/organizations/2018/03/11/atletico-mg.svg",
    283: "https://s.sde.globo.com/media/organizations/2018/03/11/Cruzeiro-MG.svg",
    285: "https://s.sde.globo.com/media/organizations/2019/02/13/bahia.svg",
    286: "https://s.sde.globo.com/media/organizations/2018/03/11/Vitoria-BA.svg",
    287: "https://s.sde.globo.com/media/organizations/2020/01/30/sport.svg",
    290: "https://s.sde.globo.com/media/organizations/2018/03/11/Goias.svg",
    292: "https://s.sde.globo.com/media/organizations/2018/03/11/coritiba.svg",
    293: "https://s.sde.globo.com/media/organizations/2018/03/11/Atletico-PR.svg",
    294: "https://s.sde.globo.com/media/organizations/2018/03/12/Santos-SP.svg",
    315: "https://s.sde.globo.com/media/organizations/2018/03/11/Palmeiras-SP.svg",
    354: "https://s.sde.globo.com/media/organizations/2018/03/12/ceara.svg",
    356: "https://s.sde.globo.com/media/organizations/2018/03/11/Fortaleza-CE.svg",
    373: "https://s.sde.globo.com/media/organizations/2018/03/11/Bragantino.svg",
    1371: "https://s.sde.globo.com/media/organizations/2018/03/11/Cuiaba_MT.svg",
    327: "https://s.sde.globo.com/media/organizations/2020/01/30/juventude.svg",
    1335: "https://s.sde.globo.com/media/organizations/2023/03/13/Criciuma-SC.svg",
    1386: "https://s.sde.globo.com/media/organizations/2018/03/14/Operario-Ferroviario-PR.svg",
    341: "https://s.sde.globo.com/media/organizations/2025/01/04/avai_A9FyNlD.svg",
    343: "https://s.sde.globo.com/media/organizations/2025/01/02/Chapecoense.svg",
    352: "https://s.sde.globo.com/media/organizations/2025/01/17/Paysandu_TVYU2Sn.svg",
    364: "https://s.sde.globo.com/media/organizations/2025/01/05/Mirassol.svg",
    1373: "https://s.sde.globo.com/media/organizations/2024/01/18/Botafogo-PB.svg",
};

// ========================================
// CONTROLLER
// ========================================
class ArtilheiroCampeaoController {
    /**
     * ✅ Endpoint principal: Ranking de Artilheiros
     * GET /api/artilheiro-campeao/:ligaId/ranking
     */
    static async obterRanking(req, res) {
        try {
            const { ligaId } = req.params;
            const { inicio, fim, forcar_coleta } = req.query;

            logger.log(
                ` [ARTILHEIRO] Solicitação de ranking - Liga: ${ligaId}`,
            );

            // ✅ v5.0: Validar se liga tem módulo Artilheiro habilitado
            const { valid, liga, error } = await validarLigaArtilheiro(ligaId);
            if (!valid) {
                logger.warn(`[ARTILHEIRO] Liga inválida: ${error}`);
                return res.status(liga ? 400 : 404).json({
                    success: false,
                    error,
                    moduloDesabilitado: !!liga,
                });
            }

            // ✅ v5.0: Buscar participantes dinamicamente do banco
            const participantes = await getParticipantesLiga(liga);
            if (participantes.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "Nenhum participante cadastrado nesta liga",
                });
            }

            logger.log(`[ARTILHEIRO] Liga "${liga.nome}" - ${participantes.length} participantes`);

            // ✅ v5.2: Buscar criterio_ranking do ModuleConfig
            let criterioRanking = 'saldo_gols';
            try {
                const moduleConfig = await ModuleConfig.buscarConfig(ligaId, 'artilheiro', CURRENT_SEASON);
                if (moduleConfig?.wizard_respostas?.criterio_ranking) {
                    criterioRanking = moduleConfig.wizard_respostas.criterio_ranking;
                }
            } catch (e) {
                logger.warn(`[ARTILHEIRO] Erro ao buscar criterio_ranking:`, e.message);
            }

            const rodadaInicio = inicio ? parseInt(inicio) : 1;

            // ✅ v4.4: Detectar status do mercado COM temporada encerrada
            const statusMercado =
                await ArtilheiroCampeaoController.detectarStatusMercado();
            const rodadaAtual = statusMercado.rodadaAtual;
            const mercadoAberto = statusMercado.mercadoAberto;
            const temporadaEncerrada = statusMercado.temporadaEncerrada;
            const rodadaEmAndamento = statusMercado.rodadaEmAndamento;

            // ✅ v5.2: RODADA_FINAL dinâmico (de seasons.js, não hardcoded)
            const RODADA_FINAL = statusMercado.rodadaTotal || SEASON_CONFIG.rodadaFinal || 38;

            // ✅ v4.5: LÓGICA CORRETA DE RODADA FIM
            let rodadaFim;
            if (fim) {
                rodadaFim = parseInt(fim);
                if (mercadoAberto && rodadaFim >= rodadaAtual && rodadaAtual < RODADA_FINAL) {
                    rodadaFim = rodadaAtual - 1;
                    logger.log(
                        `⚠️ Corrigido: fim=${fim} → ${rodadaFim} (mercado aberto, sem scouts)`,
                    );
                }
            } else {
                if (rodadaAtual >= RODADA_FINAL) {
                    rodadaFim = RODADA_FINAL;
                    logger.log(`🏁 Temporada encerrada - usando R${RODADA_FINAL}`);
                } else if (mercadoAberto) {
                    rodadaFim = rodadaAtual - 1;
                } else {
                    rodadaFim = rodadaAtual;
                }
            }

            if (rodadaFim < rodadaInicio) {
                rodadaFim = rodadaInicio;
            }

            // ✅ v5.3: Expandir rodadaFim com última rodada consolidada no DB
            // Garante que coletas manuais do admin sejam sempre exibidas,
            // mesmo que a API Cartola ainda indique um rodadaAtual menor.
            try {
                const ultimaConsolidadaDB = await GolsConsolidados.findOne(
                    { ligaId, temporada: CURRENT_SEASON, parcial: false },
                    { rodada: 1 },
                ).sort({ rodada: -1 }).lean();

                if (ultimaConsolidadaDB?.rodada > rodadaFim) {
                    logger.log(
                        `📦 [ARTILHEIRO] rodadaFim expandido: API=${rodadaFim} → DB=${ultimaConsolidadaDB.rodada} (consolidação manual detectada)`,
                    );
                    rodadaFim = ultimaConsolidadaDB.rodada;
                }
            } catch (e) {
                logger.warn(`⚠️ [ARTILHEIRO] Erro ao verificar última rodada consolidada no DB:`, e.message);
            }

            logger.log(
                `📊 Rodada ${rodadaInicio}-${rodadaFim}, Mercado: ${mercadoAberto ? "Aberto" : "Fechado"}, Temporada: ${temporadaEncerrada ? "ENCERRADA" : "ATIVA"}, Rodada API: ${rodadaAtual}, Critério: ${criterioRanking}`,
            );

            // ✅ v5.0: Gerar ranking - só busca parciais se rodada em andamento
            const ranking = await ArtilheiroCampeaoController.gerarRanking(
                ligaId,
                rodadaInicio,
                rodadaFim,
                !rodadaEmAndamento,
                forcar_coleta === "true",
                participantes,
                criterioRanking, // ✅ v5.2: Passa critério configurado
            );

            // Calcular estatísticas (apenas ativos)
            const ativos = ranking.filter((p) => p.ativo !== false);
            const estatisticas = {
                totalGolsPro: ativos.reduce((s, p) => s + p.golsPro, 0),
                totalGolsContra: ativos.reduce((s, p) => s + p.golsContra, 0),
                totalSaldo: ativos.reduce((s, p) => s + p.saldoGols, 0),
                participantes: ranking.length,
                participantesAtivos: ativos.length,
                participantesInativos: ranking.length - ativos.length,
                rodadaInicio,
                rodadaFim,
                rodadaAtual,
                mercadoAberto,
                temporadaEncerrada,
            };

            res.json({
                success: true,
                data: {
                    ranking,
                    estatisticas,
                    rodadaFim,
                    // ✅ v4.4: Só marca como parcial se rodada EM ANDAMENTO
                    rodadaParcial: rodadaEmAndamento ? rodadaAtual : null,
                    temporadaEncerrada: temporadaEncerrada,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error("❌ [ARTILHEIRO] Erro ao obter ranking:", error);
            res.status(500).json({
                success: false,
                error: "Erro ao gerar ranking",
                message: error.message,
            });
        }
    }

    /**
     * ✅ v5.4: Endpoint LIVE - Ranking com parciais em tempo real
     * GET /api/artilheiro-campeao/:ligaId/ranking-live
     *
     * Segue o mesmo padr\u00e3o do Capit\u00e3o de Luxo:
     * 1. Verifica mercado fechado (status_mercado === 2)
     * 2. Busca /atletas/pontuados (scouts ao vivo) UMA vez
     * 3. Combina dados consolidados (DB) + gols da rodada atual (live)
     * 4. Retorna ranking unificado ordenado
     */
    static async getRankingLive(req, res) {
        try {
            const { ligaId } = req.params;

            // 1. Validar liga
            const { valid, liga, error } = await validarLigaArtilheiro(ligaId);
            if (!valid) {
                return res.status(liga ? 400 : 404).json({ success: false, error });
            }

            // 2. Verificar se mercado est\u00e1 fechado (rodada ativa)
            const statusMercado = await ArtilheiroCampeaoController.detectarStatusMercado();

            if (statusMercado.mercadoAberto || statusMercado.temporadaEncerrada) {
                return res.json({
                    success: false,
                    disponivel: false,
                    motivo: statusMercado.temporadaEncerrada ? 'temporada_encerrada' : 'mercado_aberto',
                });
            }

            const rodadaAtual = statusMercado.rodadaAtual;

            // 3. Buscar atletas pontuados (scores ao vivo) UMA vez
            const atletasPontuados = await ArtilheiroCampeaoController.buscarAtletasPontuados();

            if (!atletasPontuados || Object.keys(atletasPontuados).length === 0) {
                return res.json({
                    success: false,
                    disponivel: false,
                    motivo: 'sem_pontuados',
                });
            }

            // 4. Buscar participantes da liga
            const participantes = await getParticipantesLiga(liga);
            if (participantes.length === 0) {
                return res.json({
                    success: false,
                    disponivel: false,
                    motivo: 'sem_participantes',
                });
            }

            // 5. Buscar criterio_ranking do ModuleConfig
            let criterioRanking = 'saldo_gols';
            try {
                const moduleConfig = await ModuleConfig.buscarConfig(ligaId, 'artilheiro', CURRENT_SEASON);
                if (moduleConfig?.wizard_respostas?.criterio_ranking) {
                    criterioRanking = moduleConfig.wizard_respostas.criterio_ranking;
                }
            } catch (e) {
                // fallback silencioso
            }

            // 6. Buscar status de participa\u00e7\u00e3o (ativos/inativos)
            const statusParticipantes = await buscarStatusParticipantes(ligaId, CURRENT_SEASON);

            // 7. Para cada participante, combinar hist\u00f3rico consolidado + live da rodada atual
            const RODADA_FINAL = statusMercado.rodadaTotal || SEASON_CONFIG.rodadaFinal || 38;
            const rodadaFimHistorico = Math.max(1, rodadaAtual - 1);

            const rankingLive = await Promise.all(
                participantes.map(async (p) => {
                    try {
                        // 7a. Dados consolidados (rodadas anteriores) do MongoDB
                        const consolidados = await GolsConsolidados.find({
                            ligaId,
                            timeId: p.timeId,
                            temporada: CURRENT_SEASON,
                            rodada: { $lte: rodadaFimHistorico },
                        }).lean();

                        let golsProHistorico = 0;
                        let golsContraHistorico = 0;
                        const rodadasProcessadas = consolidados.length;

                        for (const doc of consolidados) {
                            golsProHistorico += doc.golsPro || 0;
                            golsContraHistorico += doc.golsContra || 0;
                        }

                        // 7b. Gols da rodada atual (live via /atletas/pontuados)
                        const golsLive = await ArtilheiroCampeaoController.calcularGolsRodadaParcial(
                            p.timeId,
                            rodadaAtual,
                            atletasPontuados,
                        );

                        const golsProRodada = golsLive?.golsPro || 0;
                        const golsContraRodada = golsLive?.golsContra || 0;

                        // 7c. Totais combinados
                        const golsProTotal = golsProHistorico + golsProRodada;
                        const golsContraTotal = golsContraHistorico + golsContraRodada;
                        const saldoTotal = golsProTotal - golsContraTotal;

                        // 7d. Status do participante (ativo/inativo)
                        const statusP = statusParticipantes.find(s => s.timeId === p.timeId);
                        const ativo = statusP ? statusP.ativo : (p.ativo !== false);
                        const rodada_desistencia = statusP?.rodada_desistencia || null;

                        return {
                            timeId: p.timeId,
                            nome: p.nome,
                            nomeTime: p.nomeTime,
                            escudo: p.escudo,
                            clubeId: p.clubeId,
                            // Hist\u00f3rico (rodadas anteriores)
                            golsPro_historico: golsProHistorico,
                            golsContra_historico: golsContraHistorico,
                            saldo_historico: golsProHistorico - golsContraHistorico,
                            // Rodada atual (live)
                            golsPro_rodada: golsProRodada,
                            golsContra_rodada: golsContraRodada,
                            jogadores_rodada: golsLive?.jogadores || [],
                            // Totais combinados
                            golsPro: golsProTotal,
                            golsContra: golsContraTotal,
                            saldoGols: saldoTotal,
                            rodadasProcessadas: rodadasProcessadas + (golsProRodada > 0 || golsContraRodada > 0 ? 1 : 0),
                            // Status
                            ativo,
                            rodada_desistencia,
                        };
                    } catch (err) {
                        logger.warn(`\u26a0\ufe0f [ARTILHEIRO-LIVE] Erro ao processar time ${p.timeId}:`, err.message);
                        return {
                            timeId: p.timeId,
                            nome: p.nome,
                            nomeTime: p.nomeTime,
                            escudo: p.escudo,
                            clubeId: p.clubeId,
                            golsPro_historico: 0, golsContra_historico: 0, saldo_historico: 0,
                            golsPro_rodada: 0, golsContra_rodada: 0, jogadores_rodada: [],
                            golsPro: 0, golsContra: 0, saldoGols: 0,
                            rodadasProcessadas: 0,
                            ativo: p.ativo !== false,
                            rodada_desistencia: null,
                        };
                    }
                })
            );

            // 8. Separar ativos e inativos
            const ativos = rankingLive.filter(p => p.ativo !== false);
            const inativos = rankingLive.filter(p => p.ativo === false);

            // 9. Ordenar por crit\u00e9rio configurado
            const sortFn = criterioRanking === 'gols_pro'
                ? (a, b) => b.golsPro - a.golsPro || b.saldoGols - a.saldoGols || a.timeId - b.timeId
                : (a, b) => b.saldoGols - a.saldoGols || b.golsPro - a.golsPro || a.timeId - b.timeId;

            ativos.sort(sortFn);
            inativos.sort(sortFn);

            // 10. Atribuir posi\u00e7\u00f5es
            ativos.forEach((p, i) => { p.posicao = i + 1; });
            inativos.forEach((p, i) => { p.posicao = ativos.length + i + 1; });

            const rankingFinal = [...ativos, ...inativos];

            res.json({
                success: true,
                disponivel: true,
                ranking: rankingFinal,
                estatisticas: {
                    totalGolsPro: ativos.reduce((s, p) => s + p.golsPro, 0),
                    totalGolsContra: ativos.reduce((s, p) => s + p.golsContra, 0),
                    totalSaldo: ativos.reduce((s, p) => s + p.saldoGols, 0),
                    participantes: rankingFinal.length,
                    participantesAtivos: ativos.length,
                    participantesInativos: inativos.length,
                },
                rodada: rodadaAtual,
                live: true,
                atualizado_em: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('\u274c [ARTILHEIRO-LIVE] Erro no ranking live:', error);
            res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                message: error.message,
            });
        }
    }

    /**
     * ✅ v4.4: Detectar status do mercado COM DETECÇÃO DE TEMPORADA ENCERRADA
     */
    static async detectarStatusMercado() {
        try {
            const response = await fetch(
                "https://api.cartola.globo.com/mercado/status",
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            const statusMercado = data.status_mercado;
            const temporadaEncerrada =
                statusMercado === 6 || statusMercado === 4;
            const mercadoAberto = statusMercado === 1;
            const rodadaEmAndamento = !mercadoAberto && !temporadaEncerrada;

            logger.log(
                `📊 [MERCADO] Status: ${statusMercado}, Rodada: ${data.rodada_atual}, Temporada: ${temporadaEncerrada ? "ENCERRADA" : "ATIVA"}`,
            );

            const resultado = {
                rodadaAtual: data.rodada_atual || 1,
                rodadaTotal: data.rodada_total || SEASON_CONFIG.rodadaFinal || 38,
                mercadoAberto: mercadoAberto,
                temporadaEncerrada: temporadaEncerrada,
                rodadaEmAndamento: rodadaEmAndamento,
                statusMercado: statusMercado,
            };

            // ✅ v5.2: Salvar último status conhecido para fallback
            _ultimoStatusMercado = { ...resultado, timestamp: Date.now() };

            return resultado;
        } catch (error) {
            logger.warn("⚠️ Erro ao detectar mercado:", error.message);

            // ✅ v5.2: Usar último status conhecido em vez de assumir encerrada
            if (_ultimoStatusMercado && (Date.now() - _ultimoStatusMercado.timestamp) < 30 * 60 * 1000) {
                logger.log(`📊 [MERCADO] Usando último status conhecido (${Math.round((Date.now() - _ultimoStatusMercado.timestamp) / 1000)}s atrás)`);
                return {
                    rodadaAtual: _ultimoStatusMercado.rodadaAtual,
                    rodadaTotal: _ultimoStatusMercado.rodadaTotal,
                    mercadoAberto: _ultimoStatusMercado.mercadoAberto,
                    temporadaEncerrada: _ultimoStatusMercado.temporadaEncerrada,
                    rodadaEmAndamento: _ultimoStatusMercado.rodadaEmAndamento,
                    statusMercado: _ultimoStatusMercado.statusMercado,
                    fallback: true,
                };
            }

            // Sem status conhecido - usar valores seguros (mercado aberto = não processa parciais)
            logger.warn("⚠️ [MERCADO] Sem status conhecido - usando fallback conservador (mercado aberto)");
            return {
                rodadaAtual: SEASON_CONFIG.rodadaFinal || 38,
                rodadaTotal: SEASON_CONFIG.rodadaFinal || 38,
                mercadoAberto: true,
                temporadaEncerrada: false,
                rodadaEmAndamento: false,
                statusMercado: 1,
                fallback: true,
            };
        }
    }

    /**
     * ✅ Endpoint para detectar rodada
     * GET /api/artilheiro-campeao/:ligaId/detectar-rodada
     */
    static async detectarRodada(req, res) {
        try {
            const status =
                await ArtilheiroCampeaoController.detectarStatusMercado();

            res.json({
                success: true,
                data: {
                    rodadaAtual: status.rodadaAtual,
                    mercadoAberto: status.mercadoAberto,
                    temporadaEncerrada: status.temporadaEncerrada,
                    rodadaEmAndamento: status.rodadaEmAndamento,
                    statusMercado: status.statusMercado,
                    ultimaRodadaConsolidada: status.rodadaAtual, // Sempre a atual se temporada encerrada
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ v5.0: Gerar ranking completo COM FILTRO DE INATIVOS (Multi-Tenant)
     */
    static async gerarRanking(
        ligaId,
        rodadaInicio,
        rodadaFim,
        mercadoAberto,
        forcarColeta,
        participantes,
        criterioRanking = 'saldo_gols', // ✅ v5.2: Critério configurável
    ) {
        logger.log(
            `🔄 Processando ${participantes.length} participantes em PARALELO...`,
        );

        // ✅ v4.3: Buscar status de todos os participantes ANTES de processar
        const timeIds = participantes.map((p) => p.timeId);
        const statusMap = await buscarStatusParticipantes(timeIds);

        logger.log(
            `📋 [ARTILHEIRO] Status dos participantes:`,
            Object.entries(statusMap)
                .filter(([_, s]) => s.ativo === false)
                .map(
                    ([id, s]) =>
                        `${id}: inativo R${s.rodada_desistencia || "?"}`,
                ),
        );

        // ✅ Se mercado fechado (rodada parcial), buscar atletas pontuados ANTES
        let atletasPontuados = null;
        if (!mercadoAberto) {
            logger.log(
                `🔴 Mercado FECHADO - buscando scouts em tempo real...`,
            );
            atletasPontuados =
                await ArtilheiroCampeaoController.buscarAtletasPontuados();
            const totalAtletas = Object.keys(atletasPontuados).length;
            logger.log(`📊 ${totalAtletas} atletas com scouts em tempo real`);
        }

        // ✅ v5.0: Processar TODOS os participantes em paralelo
        const ranking = await Promise.all(
            participantes.map(async (participante, i) => {
                const status = statusMap[String(participante.timeId)] || {
                    ativo: true,
                    rodada_desistencia: null,
                };
                const isAtivo = status.ativo !== false;

                // ✅ v4.3: Limitar rodadaFim para inativos
                const rodadaFimParticipante = obterUltimaRodadaValida(
                    status,
                    rodadaFim,
                );

                logger.log(
                    `📊 [${i + 1}/${participantes.length}] ${participante.nome}${!isAtivo ? ` (INATIVO até R${rodadaFimParticipante})` : ""}...`,
                );

                try {
                    const dados =
                        await ArtilheiroCampeaoController.obterDadosParticipante(
                            ligaId,
                            participante.timeId,
                            rodadaInicio,
                            rodadaFimParticipante, // ✅ Usa rodada limitada para inativos
                            isAtivo ? mercadoAberto : true, // ✅ Inativos não processam parciais
                            forcarColeta,
                            isAtivo ? atletasPontuados : null, // ✅ Inativos não usam parciais
                        );

                    logger.log(
                        `✅ ${participante.nome}: ${dados.golsPro} GP, ${dados.golsContra} GC`,
                    );

                    return {
                        timeId: participante.timeId,
                        nome: participante.nome,
                        nomeTime: participante.nomeTime,
                        escudo: participante.escudo || ESCUDOS_CLUBES[participante.clubeId] || null,
                        clubeId: participante.clubeId,
                        golsPro: dados.golsPro,
                        golsContra: dados.golsContra,
                        saldoGols: dados.golsPro - dados.golsContra,
                        rodadasProcessadas: dados.rodadasProcessadas,
                        detalhePorRodada: dados.detalhePorRodada,
                        // ✅ v4.3: Adicionar status
                        ativo: isAtivo,
                        rodada_desistencia: status.rodada_desistencia,
                    };
                } catch (error) {
                    logger.error(
                        `❌ Erro ${participante.nome}:`,
                        error.message,
                    );
                    return {
                        timeId: participante.timeId,
                        nome: participante.nome,
                        nomeTime: participante.nomeTime,
                        escudo: participante.escudo || ESCUDOS_CLUBES[participante.clubeId] || null,
                        clubeId: participante.clubeId,
                        golsPro: 0,
                        golsContra: 0,
                        saldoGols: 0,
                        rodadasProcessadas: 0,
                        detalhePorRodada: [],
                        erro: error.message,
                        ativo: isAtivo,
                        rodada_desistencia: status.rodada_desistencia,
                    };
                }
            }),
        );

        // ✅ v5.1: Buscar ranking geral para usar como 3º critério de desempate
        let posicaoRankingMap = {};
        try {
            const rankingGeralCache = await RankingGeralCache.findOne({
                ligaId: new mongoose.Types.ObjectId(ligaId)
            }).sort({ rodadaFinal: -1 }).lean();

            if (rankingGeralCache && rankingGeralCache.ranking) {
                rankingGeralCache.ranking.forEach((item, index) => {
                    const timeIdStr = String(item.timeId || item.time_id || item.id);
                    posicaoRankingMap[timeIdStr] = index + 1;
                });
                logger.log(`📊 [ARTILHEIRO] Ranking geral carregado: ${Object.keys(posicaoRankingMap).length} posições`);
            }
        } catch (error) {
            logger.warn(`⚠️ [ARTILHEIRO] Erro ao buscar ranking geral:`, error.message);
        }

        // ✅ v5.1: Adicionar posição no ranking geral a cada participante
        ranking.forEach(p => {
            p.posicaoRankingGeral = posicaoRankingMap[String(p.timeId)] || 999;
        });

        // ✅ v5.2: Ordenação respeita criterio_ranking configurado no wizard
        const sortFn = (a, b) => {
            if (criterioRanking === 'gols_pro') {
                // Critério "Apenas Gols Marcados": 1) GP, 2) Saldo, 3) Ranking Geral
                if (b.golsPro !== a.golsPro) return b.golsPro - a.golsPro;
                if (b.saldoGols !== a.saldoGols) return b.saldoGols - a.saldoGols;
                return a.posicaoRankingGeral - b.posicaoRankingGeral;
            }
            // Default "saldo_gols": 1) Saldo, 2) GP, 3) Ranking Geral
            if (b.saldoGols !== a.saldoGols) return b.saldoGols - a.saldoGols;
            if (b.golsPro !== a.golsPro) return b.golsPro - a.golsPro;
            return a.posicaoRankingGeral - b.posicaoRankingGeral;
        };

        return ordenarRankingComInativos(ranking, sortFn);
    }

    /**
     * ✅ v4.4: Obter dados de um participante específico COM COLETA AUTOMÁTICA DE FALTANTES
     */
    static async obterDadosParticipante(
        ligaId,
        timeId,
        rodadaInicio,
        rodadaFim,
        mercadoAberto,
        forcarColeta,
        atletasPontuados = null,
    ) {
        let golsPro = 0;
        let golsContra = 0;
        let rodadasProcessadas = 0;
        const detalhePorRodada = [];

        // ✅ v5.2: Buscar rodadas existentes no MongoDB COM filtro de temporada
        const rodadasDB = await GolsConsolidados.find({
            ligaId: ligaId,
            timeId: timeId,
            temporada: CURRENT_SEASON,
            rodada: { $gte: rodadaInicio, $lte: rodadaFim },
        }).lean();

        // ✅ v4.4: Identificar rodadas que já existem
        const rodadasExistentes = new Set(rodadasDB.map((r) => r.rodada));

        // ✅ v5.3: Re-coletar rodadas com dados zerados quando scouts ao vivo disponíveis
        // Ocorre quando a rodada foi coletada via /time/id sem scouts válidos (histórico vazio)
        if (!mercadoAberto && atletasPontuados && Object.keys(atletasPontuados).length > 0) {
            for (const rodadaDB of rodadasDB) {
                if (
                    rodadaDB.golsPro === 0 &&
                    rodadaDB.golsContra === 0 &&
                    (!rodadaDB.jogadores || rodadaDB.jogadores.length === 0)
                ) {
                    logger.log(
                        `  🔄 R${rodadaDB.rodada} com dados zerados - re-coletando com scouts ao vivo`,
                    );
                    rodadasExistentes.delete(rodadaDB.rodada);
                }
            }
        }

        // ✅ v4.4: Identificar rodadas faltantes (consolidadas, não parciais)
        const rodadasFaltantes = [];

        for (let r = rodadaInicio; r <= rodadaFim; r++) {
            if (!rodadasExistentes.has(r)) {
                rodadasFaltantes.push(r);
            }
        }

        // ✅ v4.4: Coletar rodadas faltantes da API e salvar no MongoDB
        if (rodadasFaltantes.length > 0) {
            logger.log(
                `  📥 Coletando ${rodadasFaltantes.length} rodadas faltantes para time ${timeId}: [${rodadasFaltantes.join(", ")}]`,
            );

            for (const rodada of rodadasFaltantes) {
                try {
                    const dadosColetados =
                        await ArtilheiroCampeaoController.coletarDadosRodada(
                            ligaId,
                            timeId,
                            rodada,
                            atletasPontuados, // ✅ v5.3: Passa scouts ao vivo se disponíveis
                        );

                    // Adicionar aos dados coletados
                    golsPro += dadosColetados.golsPro || 0;
                    golsContra += dadosColetados.golsContra || 0;
                    rodadasProcessadas++;
                    detalhePorRodada.push({
                        rodada: rodada,
                        golsPro: dadosColetados.golsPro,
                        golsContra: dadosColetados.golsContra,
                        jogadores: dadosColetados.jogadores || [],
                        fonte: "api_coletada",
                    });

                    logger.log(
                        `    ✅ R${rodada}: ${dadosColetados.golsPro} GP, ${dadosColetados.golsContra} GC (salvo no MongoDB)`,
                    );
                } catch (error) {
                    logger.warn(
                        `    ⚠️ Erro ao coletar R${rodada} para time ${timeId}:`,
                        error.message,
                    );
                }
            }
        }

        // ✅ Processar rodadas que já estavam no MongoDB
        logger.log(`  💾 ${rodadasDB.length} rodadas do MongoDB`);

        for (const rodada of rodadasDB) {
            golsPro += rodada.golsPro || 0;
            golsContra += rodada.golsContra || 0;
            rodadasProcessadas++;
            detalhePorRodada.push({
                rodada: rodada.rodada,
                golsPro: rodada.golsPro,
                golsContra: rodada.golsContra,
                jogadores: rodada.jogadores || [],
                fonte: "mongodb",
            });
        }

        // ✅ Se mercado FECHADO, adicionar dados parciais da rodada atual (se não existir já)
        if (!mercadoAberto && atletasPontuados) {
            // ✅ v4.4: Verificar ANTES se a rodada já foi processada
            const jaExisteRodadaFim = detalhePorRodada.some(
                (d) => d.rodada === rodadaFim,
            );

            if (!jaExisteRodadaFim) {
                const dadosParciais =
                    await ArtilheiroCampeaoController.calcularGolsRodadaParcial(
                        timeId,
                        rodadaFim,
                        atletasPontuados,
                    );

                if (
                    dadosParciais &&
                    (dadosParciais.golsPro > 0 || dadosParciais.golsContra > 0)
                ) {
                    golsPro += dadosParciais.golsPro;
                    golsContra += dadosParciais.golsContra;
                    rodadasProcessadas++;
                    detalhePorRodada.push({
                        rodada: rodadaFim,
                        golsPro: dadosParciais.golsPro,
                        golsContra: dadosParciais.golsContra,
                        jogadores: dadosParciais.jogadores,
                        fonte: "api_parcial",
                        parcial: true,
                    });
                }
            }
        }

        return {
            golsPro,
            golsContra,
            rodadasProcessadas,
            detalhePorRodada,
        };
    }

    /**
     * ✅ Buscar atletas pontuados (para rodada parcial)
     */
    static async buscarAtletasPontuados() {
        try {
            // ✅ v5.2: Usa rate limiter
            const response = await fetchCartolaComRateLimit(
                "https://api.cartola.globo.com/atletas/pontuados",
            );
            if (!response.ok) return {};

            const data = await response.json();
            return data.atletas || {};
        } catch (error) {
            logger.warn("⚠️ Erro ao buscar atletas pontuados:", error.message);
            return {};
        }
    }

    /**
     * ✅ Calcular gols de uma rodada parcial
     */
    static async calcularGolsRodadaParcial(timeId, rodada, atletasPontuados) {
        try {
            // ✅ v5.2: Usa rate limiter
            const response = await fetchCartolaComRateLimit(
                `https://api.cartola.globo.com/time/id/${timeId}/${rodada}`,
            );
            if (!response.ok) return null;

            const data = await response.json();
            const atletas = data.atletas || [];

            let golsPro = 0;
            let golsContra = 0;
            const jogadores = [];

            for (const atleta of atletas) {
                const atletaId = atleta.atleta_id;
                const pontuado = atletasPontuados[atletaId];

                if (pontuado && pontuado.scout) {
                    const gols = pontuado.scout.G || 0;
                    const gc = pontuado.scout.GC || 0;

                    if (gols > 0 || gc > 0) {
                        golsPro += gols;
                        golsContra += gc;
                        jogadores.push({
                            atletaId,
                            nome: atleta.apelido || pontuado.apelido,
                            gols,
                            golsContra: gc,
                        });
                    }
                }
            }

            return { golsPro, golsContra, jogadores };
        } catch (error) {
            logger.warn(
                `⚠️ Erro ao calcular parcial time ${timeId}:`,
                error.message,
            );
            return null;
        }
    }

    /**
     * ✅ v5.0: Endpoint para forçar coleta de uma rodada específica (Multi-Tenant)
     * POST /api/artilheiro-campeao/:ligaId/coletar/:rodada
     */
    static async coletarRodada(req, res) {
        try {
            // ✅ v5.2: Validação de sessão admin
            if (!req.session?.usuario) {
                return res.status(401).json({ success: false, error: "Não autorizado" });
            }

            const { ligaId, rodada } = req.params;
            const rodadaNum = parseInt(rodada);
            const usuario = req.session.usuario.email || req.session.usuario.nome || 'admin';

            logger.log(
                `🔄 [ARTILHEIRO] Coletando rodada ${rodadaNum} para liga ${ligaId} por ${usuario}...`,
            );

            const { valid, liga, error } = await validarLigaArtilheiro(ligaId);
            if (!valid) {
                return res.status(liga ? 400 : 404).json({ success: false, error });
            }

            const participantes = await getParticipantesLiga(liga);
            if (participantes.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "Nenhum participante cadastrado nesta liga",
                });
            }

            // ✅ v5.3: Buscar scouts ao vivo se mercado fechado para esta rodada
            // Permite capturar gols da rodada em andamento sem depender de atleta.scout histórico
            let atletasPontuadosLive = null;
            try {
                const statusCheck = await ArtilheiroCampeaoController.detectarStatusMercado();
                if (statusCheck.rodadaEmAndamento && statusCheck.rodadaAtual === rodadaNum) {
                    logger.log(
                        `🔴 [ARTILHEIRO] Mercado FECHADO para R${rodadaNum} - usando scouts ao vivo`,
                    );
                    atletasPontuadosLive = await ArtilheiroCampeaoController.buscarAtletasPontuados();
                    logger.log(
                        `📊 [ARTILHEIRO] ${Object.keys(atletasPontuadosLive).length} atletas pontuados`,
                    );
                } else {
                    logger.log(
                        `📋 [ARTILHEIRO] R${rodadaNum} não está em andamento (rodadaAtual=${statusCheck.rodadaAtual}, mercadoAberto=${statusCheck.mercadoAberto}) - usando scouts históricos`,
                    );
                }
            } catch (e) {
                logger.warn(`⚠️ [ARTILHEIRO] Erro ao verificar status para scouts ao vivo:`, e.message);
            }

            const resultados = [];

            for (const participante of participantes) {
                try {
                    const dados =
                        await ArtilheiroCampeaoController.coletarDadosRodada(
                            ligaId,
                            participante.timeId,
                            rodadaNum,
                            atletasPontuadosLive, // ✅ v5.3: Scouts ao vivo se disponíveis
                        );

                    resultados.push({
                        timeId: participante.timeId,
                        nome: participante.nome,
                        ...dados,
                    });
                } catch (error) {
                    resultados.push({
                        timeId: participante.timeId,
                        nome: participante.nome,
                        erro: error.message,
                    });
                }
            }

            // ✅ v5.2: Audit log
            setImmediate(async () => {
                const db = mongoose.connection.db;
                await registrarAuditLog(db, {
                    acao: 'coletar_rodada',
                    ligaId,
                    usuario,
                    detalhes: { rodada: rodadaNum, participantes: resultados.length },
                });
            });

            res.json({
                success: true,
                rodada: rodadaNum,
                resultados,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ Coletar dados de uma rodada específica para um time
     * ✅ v5.3: Aceita atletasPontuados para priorizar scouts ao vivo
     */
    static async coletarDadosRodada(ligaId, timeId, rodada, atletasPontuados = null) {
        try {
            // ✅ v5.2: Usa rate limiter para API Cartola
            const response = await fetchCartolaComRateLimit(
                `https://api.cartola.globo.com/time/id/${timeId}/${rodada}`,
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const atletas = data.atletas || [];

            let golsPro = 0;
            let golsContra = 0;
            const jogadores = [];

            for (const atleta of atletas) {
                let gols = 0;
                let gc = 0;

                // ✅ v5.3: Prioridade 1 - scouts ao vivo (/atletas/pontuados)
                // Resolve o caso de rodadas históricas onde atleta.scout está vazio
                if (atletasPontuados && atletasPontuados[atleta.atleta_id]?.scout) {
                    const s = atletasPontuados[atleta.atleta_id].scout;
                    gols = s.G || 0;
                    gc = s.GC || 0;
                }

                // Prioridade 2: scouts históricos (atleta.scout da lineup)
                if (gols === 0 && gc === 0) {
                    const scout = atleta.scout || {};
                    gols = scout.G || 0;
                    gc = scout.GC || 0;
                }

                if (gols > 0 || gc > 0) {
                    golsPro += gols;
                    golsContra += gc;
                    jogadores.push({
                        atletaId: atleta.atleta_id,
                        nome: atleta.apelido,
                        gols,
                        golsContra: gc,
                    });
                }
            }

            // ✅ v5.2: Inclui temporada no upsert
            await GolsConsolidados.findOneAndUpdate(
                { ligaId, timeId, rodada, temporada: CURRENT_SEASON },
                {
                    ligaId,
                    timeId,
                    rodada,
                    temporada: CURRENT_SEASON,
                    golsPro,
                    golsContra,
                    saldo: golsPro - golsContra,
                    jogadores,
                    parcial: false,
                    dataColeta: new Date(),
                },
                { upsert: true, new: true },
            );

            return { golsPro, golsContra, jogadores, salvo: true };
        } catch (error) {
            throw error;
        }
    }

    /**
     * ✅ Endpoint para limpar cache de uma liga
     * DELETE /api/artilheiro-campeao/:ligaId/cache
     */
    static async limparCache(req, res) {
        try {
            // ✅ v5.2: Validação de sessão admin
            if (!req.session?.usuario) {
                return res.status(401).json({ success: false, error: "Não autorizado" });
            }

            const { ligaId } = req.params;
            const usuario = req.session.usuario.email || req.session.usuario.nome || 'admin';

            const result = await GolsConsolidados.deleteMany({ ligaId, temporada: CURRENT_SEASON });

            // ✅ v5.2: Audit log
            setImmediate(async () => {
                const db = mongoose.connection.db;
                await registrarAuditLog(db, {
                    acao: 'limpar_cache',
                    ligaId,
                    usuario,
                    detalhes: { registrosRemovidos: result.deletedCount },
                });
            });

            res.json({
                success: true,
                message: `Cache limpo: ${result.deletedCount} registros removidos`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ Endpoint para obter detalhes de um time específico
     * GET /api/artilheiro-campeao/:ligaId/time/:timeId
     */
    static async getDetalheTime(req, res) {
        try {
            const { ligaId, timeId } = req.params;

            const rodadas = await GolsConsolidados.find({
                ligaId,
                timeId: parseInt(timeId),
                temporada: CURRENT_SEASON,
            })
                .sort({ rodada: 1 })
                .lean();

            const totais = rodadas.reduce(
                (acc, r) => {
                    acc.golsPro += r.golsPro || 0;
                    acc.golsContra += r.golsContra || 0;
                    return acc;
                },
                { golsPro: 0, golsContra: 0 },
            );

            res.json({
                success: true,
                timeId: parseInt(timeId),
                totais: {
                    ...totais,
                    saldo: totais.golsPro - totais.golsContra,
                },
                rodadas,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ Consolidar rodada (marca dados como não-parciais)
     * POST /api/artilheiro-campeao/:ligaId/consolidar/:rodada
     */
    static async consolidarRodada(req, res) {
        try {
            // ✅ v5.2: Validação de sessão admin
            if (!req.session?.usuario) {
                return res.status(401).json({ success: false, error: "Não autorizado" });
            }

            const { ligaId, rodada } = req.params;
            const usuario = req.session.usuario.email || req.session.usuario.nome || 'admin';

            logger.log(`🔒 [ARTILHEIRO] Consolidando rodada ${rodada} por ${usuario}...`);

            const result = await GolsConsolidados.updateMany(
                { ligaId, rodada: parseInt(rodada), temporada: CURRENT_SEASON, parcial: true },
                { $set: { parcial: false } },
            );

            logger.log(`✅ ${result.modifiedCount} registros consolidados`);

            // ✅ v5.2: Audit log
            setImmediate(async () => {
                const db = mongoose.connection.db;
                await registrarAuditLog(db, {
                    acao: 'consolidar_rodada',
                    ligaId,
                    usuario,
                    detalhes: { rodada: parseInt(rodada), registrosAtualizados: result.modifiedCount },
                });
            });

            res.json({
                success: true,
                message: `Rodada ${rodada} consolidada`,
                registrosAtualizados: result.modifiedCount,
            });
        } catch (error) {
            logger.error("❌ Erro ao consolidar:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ v5.0: Estatísticas do sistema (Multi-Tenant)
     * GET /api/artilheiro-campeao/:ligaId/estatisticas
     */
    static async obterEstatisticas(req, res) {
        try {
            const { ligaId } = req.params;

            // ✅ v5.0: Validar liga e buscar participantes
            const { valid, liga, error } = await validarLigaArtilheiro(ligaId);
            if (!valid) {
                return res.status(liga ? 400 : 404).json({ success: false, error });
            }

            const participantes = await getParticipantesLiga(liga);

            const filtroBase = { ligaId, temporada: CURRENT_SEASON };
            const totalRegistros = await GolsConsolidados.countDocuments(filtroBase);
            const registrosConsolidados = await GolsConsolidados.countDocuments(
                { ...filtroBase, parcial: false },
            );
            const registrosParciais = await GolsConsolidados.countDocuments({
                ...filtroBase,
                parcial: true,
            });
            const rodadasDisponiveis = await GolsConsolidados.distinct(
                "rodada",
                filtroBase,
            );

            res.json({
                success: true,
                data: {
                    totalRegistros,
                    registrosConsolidados,
                    registrosParciais,
                    rodadasDisponiveis: rodadasDisponiveis.sort(
                        (a, b) => a - b,
                    ),
                    participantes: participantes.length,
                    ligaNome: liga.nome,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ v5.0: Listar participantes (Multi-Tenant)
     * GET /api/artilheiro-campeao/:ligaId/participantes
     */
    static async listarParticipantes(req, res) {
        try {
            const { ligaId } = req.params;

            // ✅ v5.0: Validar liga e buscar participantes
            const { valid, liga, error } = await validarLigaArtilheiro(ligaId);
            if (!valid) {
                return res.status(liga ? 400 : 404).json({ success: false, error });
            }

            const participantesBanco = await getParticipantesLiga(liga);

            // ✅ v4.3: Buscar status de todos
            const timeIds = participantesBanco.map((p) => p.timeId);
            const statusMap = await buscarStatusParticipantes(timeIds);

            const participantes = participantesBanco.map((p) => {
                const status = statusMap[String(p.timeId)] || { ativo: true };
                return {
                    ...p,
                    escudo: p.escudo || ESCUDOS_CLUBES[p.clubeId] || null,
                    ativo: status.ativo !== false,
                    rodada_desistencia: status.rodada_desistencia || null,
                };
            });

            res.json({
                success: true,
                data: participantes,
                ligaNome: liga.nome,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * ✅ v5.2: Consolidar premiação no extrato financeiro
     * POST /api/artilheiro-campeao/:ligaId/premiar
     */
    static async consolidarPremiacao(req, res) {
        try {
            // Validação de sessão admin
            if (!req.session?.usuario) {
                return res.status(401).json({ success: false, error: "Não autorizado" });
            }

            const { ligaId } = req.params;
            const usuario = req.session.usuario.email || req.session.usuario.nome || 'admin';

            logger.log(`🏆 [ARTILHEIRO] Consolidando premiação para liga ${ligaId} por ${usuario}...`);

            // Validar liga
            const { valid, liga, error } = await validarLigaArtilheiro(ligaId);
            if (!valid) {
                return res.status(liga ? 400 : 404).json({ success: false, error });
            }

            // Buscar configuração de premiação do ModuleConfig
            let premios = { 1: 30, 2: 20, 3: 10 }; // defaults
            try {
                const moduleConfig = await ModuleConfig.buscarConfig(ligaId, 'artilheiro', CURRENT_SEASON);
                if (moduleConfig?.wizard_respostas) {
                    const wr = moduleConfig.wizard_respostas;
                    if (wr.valor_campeao !== undefined) premios[1] = Number(wr.valor_campeao) || 0;
                    if (wr.valor_vice !== undefined) premios[2] = Number(wr.valor_vice) || 0;
                    if (wr.valor_terceiro !== undefined) premios[3] = Number(wr.valor_terceiro) || 0;
                }
            } catch (e) {
                logger.warn(`[ARTILHEIRO] Usando premiação default:`, e.message);
            }

            // Gerar ranking atual
            const participantes = await getParticipantesLiga(liga);
            if (participantes.length === 0) {
                return res.status(400).json({ success: false, error: "Sem participantes" });
            }

            const statusMercado = await ArtilheiroCampeaoController.detectarStatusMercado();
            const RODADA_FINAL = statusMercado.rodadaTotal || SEASON_CONFIG.rodadaFinal || 38;

            let criterioRanking = 'saldo_gols';
            try {
                const mc = await ModuleConfig.buscarConfig(ligaId, 'artilheiro', CURRENT_SEASON);
                if (mc?.wizard_respostas?.criterio_ranking) criterioRanking = mc.wizard_respostas.criterio_ranking;
            } catch (_) {}

            const ranking = await ArtilheiroCampeaoController.gerarRanking(
                ligaId, 1, RODADA_FINAL, true, false, participantes, criterioRanking,
            );

            // Filtrar apenas ativos
            const ativos = ranking.filter(p => p.ativo !== false);

            // Verificar idempotência - não premiar duas vezes
            const db = mongoose.connection.db;
            const acertosCollection = db.collection('acertofinanceiros');
            const jaPremiou = await acertosCollection.findOne({
                ligaId,
                temporada: CURRENT_SEASON,
                tipo: 'ARTILHEIRO_PREMIACAO',
                ativo: true,
            });

            if (jaPremiou) {
                return res.status(409).json({
                    success: false,
                    error: "Premiação já foi consolidada para esta temporada",
                    premiacaoExistente: jaPremiou._id,
                });
            }

            // Gerar registros de premiação
            const lancamentos = [];
            for (let posicao = 1; posicao <= 3; posicao++) {
                const premiado = ativos[posicao - 1];
                const valor = premios[posicao];
                if (!premiado || !valor) continue;

                const lancamento = {
                    ligaId,
                    timeId: String(premiado.timeId),
                    temporada: CURRENT_SEASON,
                    tipo: 'ARTILHEIRO_PREMIACAO',
                    subtipo: `${posicao}o_lugar`,
                    valor: valor,
                    descricao: `Artilheiro Campeão - ${posicao}º lugar (${premiado.nome})`,
                    ativo: true,
                    createdAt: new Date(),
                    registradoPor: usuario,
                };

                await acertosCollection.insertOne(lancamento);
                lancamentos.push({ posicao, timeId: premiado.timeId, nome: premiado.nome, valor });
            }

            // Audit log
            setImmediate(async () => {
                await registrarAuditLog(db, {
                    acao: 'consolidar_premiacao',
                    ligaId,
                    usuario,
                    detalhes: { lancamentos, premios },
                });
            });

            logger.log(`🏆 [ARTILHEIRO] ${lancamentos.length} premiações registradas`);

            res.json({
                success: true,
                message: `${lancamentos.length} premiações registradas`,
                lancamentos,
            });
        } catch (error) {
            logger.error("❌ [ARTILHEIRO] Erro ao consolidar premiação:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

logger.log("[ARTILHEIRO-CAMPEAO] ✅ v5.3.0 carregado (SaaS Dinâmico + Scouts ao Vivo)");

export default ArtilheiroCampeaoController;
