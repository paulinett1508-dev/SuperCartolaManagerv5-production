/**
 * Module Config Controller (Admin)
 *
 * Controller para gerenciar configurações de módulos via admin.
 * Permite visualizar, criar e atualizar configurações de módulos por liga.
 *
 * @version 1.0.0
 * @since 2026-02-03
 */

import ModuleConfig from '../../models/ModuleConfig.js';
import Liga from '../../models/Liga.js';
import { buscarConfigModulo, invalidarCacheModulo } from '../../utils/moduleConfigHelper.js';
import { CURRENT_SEASON } from '../../config/seasons.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Lista todas as configurações de módulos de uma liga
 * GET /api/admin/modulos/config/:ligaId
 */
export const listarConfigs = async (req, res) => {
    try {
        const { ligaId } = req.params;
        const temporada = req.query.temporada ? Number(req.query.temporada) : CURRENT_SEASON;

        logger.log(`[ADMIN-MODULE-CONFIG] 📋 Listando configs: Liga ${ligaId}, Temporada ${temporada}`);

        // Buscar liga
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            return res.status(404).json({
                success: false,
                error: 'Liga não encontrada'
            });
        }

        // Buscar todas as configurações da liga
        const configs = await ModuleConfig.listarTodosModulos(ligaId, temporada);

        res.json({
            success: true,
            liga: {
                id: liga._id,
                nome: liga.nome,
                temporada
            },
            configs,
            total: configs.length
        });

    } catch (error) {
        logger.error('[ADMIN-MODULE-CONFIG] ❌ Erro ao listar configs:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar configurações',
            message: error.message
        });
    }
};

/**
 * Busca configuração específica de um módulo
 * GET /api/admin/modulos/config/:ligaId/:moduloId
 */
export const buscarConfig = async (req, res) => {
    try {
        const { ligaId, moduloId } = req.params;
        const temporada = req.query.temporada ? Number(req.query.temporada) : CURRENT_SEASON;

        logger.log(`[ADMIN-MODULE-CONFIG] 🔍 Buscando config: ${moduloId} | Liga ${ligaId} | Temporada ${temporada}`);

        // Buscar configuração completa (mesclada com defaults)
        const config = await buscarConfigModulo(ligaId, moduloId, temporada);

        // Buscar registro no ModuleConfig (pode não existir)
        const dbConfig = await ModuleConfig.buscarConfig(ligaId, moduloId, temporada);

        res.json({
            success: true,
            config,
            dbConfig: dbConfig || null,
            hasOverrides: dbConfig !== null
        });

    } catch (error) {
        logger.error('[ADMIN-MODULE-CONFIG] ❌ Erro ao buscar config:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar configuração',
            message: error.message
        });
    }
};

/**
 * Busca definições do wizard de um módulo
 * GET /api/admin/modulos/wizard/:moduloId
 */
export const buscarWizard = async (req, res) => {
    try {
        const { moduloId } = req.params;

        logger.log(`[ADMIN-MODULE-CONFIG] 🧙 Buscando wizard: ${moduloId}`);

        // Carregar JSON do módulo
        const jsonPath = path.join(__dirname, '..', '..', 'config', 'rules', `${moduloId}.json`);
        const content = await fs.readFile(jsonPath, 'utf-8');
        const rules = JSON.parse(content);

        if (!rules.wizard) {
            return res.status(404).json({
                success: false,
                error: 'Wizard não encontrado para este módulo'
            });
        }

        res.json({
            success: true,
            wizard: rules.wizard,
            moduloNome: rules.nome,
            moduloDescricao: rules.descricao
        });

    } catch (error) {
        logger.error('[ADMIN-MODULE-CONFIG] ❌ Erro ao buscar wizard:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar wizard',
            message: error.message
        });
    }
};

/**
 * Salva configuração de um módulo
 * POST /api/admin/modulos/config/:ligaId/:moduloId
 */
export const salvarConfig = async (req, res) => {
    try {
        const { ligaId, moduloId } = req.params;
        const { respostas, ativo } = req.body;
        const temporada = req.body.temporada || CURRENT_SEASON;
        const usuario = req.session?.usuario?.email || 'admin';

        logger.log(`[ADMIN-MODULE-CONFIG] 💾 Salvando config: ${moduloId} | Liga ${ligaId}`);
        logger.log(`[ADMIN-MODULE-CONFIG] Respostas:`, respostas);

        // Validar liga
        const liga = await Liga.findById(ligaId).lean();
        if (!liga) {
            return res.status(404).json({
                success: false,
                error: 'Liga não encontrada'
            });
        }

        // Processar respostas do wizard em overrides
        const config = await processarRespostasWizard(moduloId, respostas);

        // Salvar no ModuleConfig
        const resultado = await ModuleConfig.ativarModulo(
            ligaId,
            moduloId,
            {
                ...config,
                wizard_respostas: respostas
            },
            usuario,
            temporada
        );

        // Invalidar cache do módulo
        invalidarCacheModulo(moduloId);

        logger.log(`[ADMIN-MODULE-CONFIG] ✅ Config salva com sucesso: ${resultado._id}`);

        res.json({
            success: true,
            message: 'Configuração salva com sucesso',
            config: resultado,
            configId: resultado._id
        });

    } catch (error) {
        logger.error('[ADMIN-MODULE-CONFIG] ❌ Erro ao salvar config:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao salvar configuração',
            message: error.message
        });
    }
};

/**
 * Ativa/Desativa um módulo
 * PATCH /api/admin/modulos/config/:ligaId/:moduloId/toggle
 */
export const toggleModulo = async (req, res) => {
    try {
        const { ligaId, moduloId } = req.params;
        const { ativo } = req.body;
        const temporada = req.body.temporada || CURRENT_SEASON;
        const usuario = req.session?.usuario?.email || 'admin';

        logger.log(`[ADMIN-MODULE-CONFIG] 🔄 Toggle módulo: ${moduloId} | Ativo: ${ativo}`);

        if (ativo) {
            await ModuleConfig.ativarModulo(ligaId, moduloId, {}, usuario, temporada);
        } else {
            await ModuleConfig.desativarModulo(ligaId, moduloId, usuario, temporada);
        }

        // Invalidar cache
        invalidarCacheModulo(moduloId);

        res.json({
            success: true,
            message: `Módulo ${ativo ? 'ativado' : 'desativado'} com sucesso`,
            ativo
        });

    } catch (error) {
        logger.error('[ADMIN-MODULE-CONFIG] ❌ Erro ao toggle módulo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao ativar/desativar módulo',
            message: error.message
        });
    }
};

/**
 * Reseta configuração de um módulo (volta para defaults)
 * DELETE /api/admin/modulos/config/:ligaId/:moduloId
 */
export const resetarConfig = async (req, res) => {
    try {
        const { ligaId, moduloId } = req.params;
        const temporada = req.query.temporada ? Number(req.query.temporada) : CURRENT_SEASON;
        const usuario = req.session?.usuario?.email || 'admin';

        logger.log(`[ADMIN-MODULE-CONFIG] 🔄 Resetando config: ${moduloId} | Liga ${ligaId}`);

        await ModuleConfig.desativarModulo(ligaId, moduloId, usuario, temporada);

        // Invalidar cache
        invalidarCacheModulo(moduloId);

        res.json({
            success: true,
            message: 'Configuração resetada para padrões'
        });

    } catch (error) {
        logger.error('[ADMIN-MODULE-CONFIG] ❌ Erro ao resetar config:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao resetar configuração',
            message: error.message
        });
    }
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Processa respostas do wizard em estrutura de config
 * @param {string} moduloId - ID do módulo
 * @param {Object} respostas - Respostas do wizard
 * @returns {Object} Config estruturada
 */
async function processarRespostasWizard(moduloId, respostas) {
    const config = {
        regras_override: {},
        financeiro_override: {
            valores_simples: {}
        }
    };

    // Carregar definições do wizard
    const jsonPath = path.join(__dirname, '..', '..', 'config', 'rules', `${moduloId}.json`);
    const content = await fs.readFile(jsonPath, 'utf-8');
    const rules = JSON.parse(content);

    if (!rules.wizard || !rules.wizard.perguntas) {
        return config;
    }

    // Processar cada resposta
    for (const pergunta of rules.wizard.perguntas) {
        const valor = respostas[pergunta.id];
        if (valor === undefined || valor === null) continue;

        const afeta = pergunta.afeta;
        if (!afeta) continue;

        // Determinar onde salvar baseado no campo "afeta"
        if (afeta.startsWith('regras_override.')) {
            const campo = afeta.replace('regras_override.', '');
            config.regras_override[campo] = valor;
        } else if (afeta.startsWith('financeiro_override.valores_por_posicao.')) {
            const pos = afeta.replace('financeiro_override.valores_por_posicao.', '');
            const numVal = Number(valor);
            // Ignorar posições opcionais sem valor ou com valor 0
            if (valor === '' || valor === null || isNaN(numVal)) continue;
            if (numVal === 0 && !pergunta.required) continue;
            if (!config.financeiro_override.valores_por_posicao) {
                config.financeiro_override.valores_por_posicao = {};
            }
            config.financeiro_override.valores_por_posicao[pos] = numVal;
        } else if (afeta.startsWith('financeiro_override.valores_simples.')) {
            const campo = afeta.replace('financeiro_override.valores_simples.', '');
            config.financeiro_override.valores_simples[campo] = Number(valor);
        } else if (afeta.startsWith('regras.')) {
            // Para compatibilidade, mapear regras.X para regras_override.X
            const campo = afeta.replace('regras.', '').replace('.', '_');
            config.regras_override[campo] = valor;
        }
    }

    return config;
}

logger.log('[ADMIN-MODULE-CONFIG] ✅ Controller carregado');
