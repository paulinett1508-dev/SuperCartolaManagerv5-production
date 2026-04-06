// =====================================================================
// BRASILEIRAO TABELA ROUTES - v1.1
// Endpoints para calendário completo do Brasileirão Série A
// v1.1: Endpoint /ao-vivo para placares em tempo real
// =====================================================================

import express from 'express';
import { verificarAdmin } from '../middleware/auth.js';
import brasileiraoService from '../services/brasileirao-tabela-service.js';
import syncBrasileirao from '../jobs/sync-brasileirao.js';

const router = express.Router();

// =====================================================================
// ENDPOINTS PÚBLICOS (Participante)
// =====================================================================

/**
 * GET /api/brasileirao/resumo/:temporada
 * Retorna resumo para exibição na home (rodada atual + próximas)
 */
router.get('/resumo/:temporada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada) || temporada < 2020 || temporada > 2030) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        const resultado = await brasileiraoService.obterResumoParaExibicao(temporada);
        res.json(resultado);

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro resumo:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar resumo do Brasileirão',
        });
    }
});

/**
 * GET /api/brasileirao/rodada/:temporada/:rodada
 * Retorna jogos de uma rodada específica
 */
router.get('/rodada/:temporada/:rodada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);
        const rodada = parseInt(req.params.rodada, 10);

        if (isNaN(temporada) || isNaN(rodada) || rodada < 1 || rodada > 38) {
            return res.status(400).json({
                success: false,
                erro: 'Parâmetros inválidos',
            });
        }

        const resultado = await brasileiraoService.obterTodasRodadas(temporada);

        if (!resultado.success) {
            return res.status(404).json(resultado);
        }

        const dadosRodada = resultado.rodadas[rodada];

        if (!dadosRodada) {
            return res.status(404).json({
                success: false,
                erro: `Rodada ${rodada} não encontrada`,
            });
        }

        res.json({
            success: true,
            temporada,
            rodada: dadosRodada,
        });

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro rodada:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar rodada',
        });
    }
});

/**
 * GET /api/brasileirao/completo/:temporada
 * Retorna calendário completo (todas as 38 rodadas)
 */
router.get('/completo/:temporada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada) || temporada < 2020 || temporada > 2030) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        const resultado = await brasileiraoService.obterTodasRodadas(temporada);
        res.json(resultado);

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro completo:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar calendário completo',
        });
    }
});

/**
 * GET /api/brasileirao/proximo-jogo/:temporada
 * Retorna o próximo jogo (para ativar polling)
 */
router.get('/proximo-jogo/:temporada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);
        const resultado = await brasileiraoService.obterResumoParaExibicao(temporada);

        if (!resultado.success) {
            return res.status(404).json(resultado);
        }

        res.json({
            success: true,
            temporada,
            proximo_jogo: resultado.proximo_jogo,
            tem_jogos_ao_vivo: resultado.tem_jogos_ao_vivo,
            rodada_atual: resultado.rodada_atual,
        });

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro próximo jogo:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar próximo jogo',
        });
    }
});

/**
 * GET /api/brasileirao/ao-vivo/:temporada
 * Retorna resumo com placares ao vivo (busca no jogos-ao-vivo e atualiza MongoDB)
 * Cache: 30s em memória no service
 */
router.get('/ao-vivo/:temporada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada) || temporada < 2020 || temporada > 2030) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        const resultado = await brasileiraoService.obterResumoAoVivo(temporada);
        res.json(resultado);

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro ao-vivo:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar dados ao vivo',
        });
    }
});

/**
 * GET /api/brasileirao/classificacao/:temporada
 * Retorna tabela de classificação calculada a partir dos jogos encerrados
 */
router.get('/classificacao/:temporada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada) || temporada < 2020 || temporada > 2030) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        const resultado = await brasileiraoService.obterClassificacao(temporada);
        res.json(resultado);

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro classificacao:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar classificação',
        });
    }
});

/**
 * POST /api/brasileirao/refresh/:temporada
 * Rebusca dados das fontes externas (API-Football → ESPN), substitui no banco
 * e retorna classificação + jogos da rodada atual — dados 100% frescos.
 * Rate limit: 1 req/2min por IP (proteger quota API-Football)
 */
const _refreshTimestamps = new Map(); // IP → timestamp do último refresh
const REFRESH_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos

router.post('/refresh/:temporada', async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada) || temporada < 2020 || temporada > 2030) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        // Rate limit por IP
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const ultimoRefresh = _refreshTimestamps.get(ip) || 0;
        const agora = Date.now();

        if (agora - ultimoRefresh < REFRESH_COOLDOWN_MS) {
            const restante = Math.ceil((REFRESH_COOLDOWN_MS - (agora - ultimoRefresh)) / 1000);
            return res.status(429).json({
                success: false,
                erro: `Aguarde ${restante}s para atualizar novamente`,
            });
        }

        _refreshTimestamps.set(ip, agora);

        // Force sync: rebusca das fontes externas com replaceMode
        const syncResult = await brasileiraoService.sincronizarTabela(temporada, true);

        if (!syncResult.success) {
            return res.status(503).json(syncResult);
        }

        // Retornar dados frescos: classificação + jogos da rodada atual
        const [classificacao, resumo] = await Promise.all([
            brasileiraoService.obterClassificacao(temporada),
            brasileiraoService.obterResumoParaExibicao(temporada),
        ]);

        res.json({
            success: true,
            fonte: syncResult.fonte,
            jogosImportados: syncResult.jogosImportados,
            classificacao: classificacao.classificacao || [],
            rodada_atual: resumo.rodada_atual,
            jogos_rodada_atual: resumo.jogos_rodada_atual || [],
            ultima_atualizacao: new Date(),
        });

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro refresh:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao atualizar dados do Brasileirão',
        });
    }
});

// =====================================================================
// ENDPOINTS ADMIN (Requer autenticação)
// =====================================================================

/**
 * POST /api/brasileirao/sync/:temporada
 * Força sincronização do calendário (Admin)
 */
router.post('/sync/:temporada', verificarAdmin, async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada) || temporada < 2020 || temporada > 2030) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        console.log(`[BRASILEIRAO-ROUTES] Admin solicitou sync da temporada ${temporada}`);

        const resultado = await brasileiraoService.sincronizarTabela(temporada, true);
        res.json(resultado);

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro sync:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao sincronizar calendário',
        });
    }
});

/**
 * GET /api/brasileirao/status
 * Retorna status do serviço (Admin)
 */
router.get('/status', verificarAdmin, async (req, res) => {
    try {
        const status = brasileiraoService.obterStatus();
        const jobStatus = syncBrasileirao.getStatus();
        res.json({
            success: true,
            ...status,
            job: jobStatus,
        });

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro status:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao obter status',
        });
    }
});

/**
 * GET /api/brasileirao/admin/:temporada
 * Retorna dados completos para painel admin
 */
router.get('/admin/:temporada', verificarAdmin, async (req, res) => {
    try {
        const temporada = parseInt(req.params.temporada, 10);

        if (isNaN(temporada)) {
            return res.status(400).json({
                success: false,
                erro: 'Temporada inválida',
            });
        }

        const [calendario, status] = await Promise.all([
            brasileiraoService.obterCalendarioCompleto(temporada),
            Promise.resolve(brasileiraoService.obterStatus()),
        ]);

        res.json({
            success: true,
            temporada,
            calendario: calendario.calendario || null,
            fonte: calendario.fonte,
            stats: calendario.stats,
            service_status: status,
        });

    } catch (error) {
        console.error('[BRASILEIRAO-ROUTES] Erro admin:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao obter dados admin',
        });
    }
});

export default router;
