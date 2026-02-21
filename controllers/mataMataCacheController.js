import MataMataCache from "../models/MataMataCache.js";
import { CURRENT_SEASON } from "../config/seasons.js";
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

        res.json({
            cached: true,
            rodada: cache.rodada_atual,
            dados: cache.dados_torneio,
            updatedAt: cache.ultima_atualizacao,
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

        // Buscar caches APENAS da temporada especificada
        const caches = await MataMataCache.find({
            liga_id: ligaId,
            temporada: temporada
        }).sort({ edicao: 1 });
        
        if (caches.length === 0) {
            logger.log('[MATA-CONSOLIDAÇÃO] Nenhum cache encontrado');
            return [];
        }
        
        const confrontosConsolidados = caches.map(cache => ({
            edicao: cache.edicao,
            rodada_atual: cache.rodada_atual,
            dados_torneio: cache.dados_torneio,
            ultima_atualizacao: cache.ultima_atualizacao
        }));
        
        logger.log(`[MATA-CONSOLIDAÇÃO] ✅ ${confrontosConsolidados.length} edições processadas`);
        return confrontosConsolidados;
        
    } catch (error) {
        logger.error('[MATA-CONSOLIDAÇÃO] ❌ Erro:', error);
        throw error;
    }
};
