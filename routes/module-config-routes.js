/**
 * Routes: Module Config
 *
 * API para gerenciar configuracao de modulos por liga.
 * Permite ativar/desativar modulos e configurar via wizard.
 *
 * @version 1.0.0
 * @since 2026-01-04
 */

import express from 'express';
import mongoose from 'mongoose';
import { verificarAdmin } from '../middleware/auth.js';
import ModuleConfig, { MODULOS_DISPONIVEIS } from '../models/ModuleConfig.js';
import { getRuleById, allRules } from '../config/rules/index.js';
import { CURRENT_SEASON } from '../config/seasons.js';
import Liga from '../models/Liga.js';
import Top10Cache from '../models/Top10Cache.js';

const router = express.Router();

// =============================================================================
// GERAÇÃO DINÂMICA DE CALENDÁRIO MATA-MATA
// =============================================================================

/**
 * Gera calendario_override dinâmico para o mata-mata baseado nos parâmetros do wizard.
 * Elimina dependência do JSON hardcoded (2025, 32 times).
 *
 * @param {number} totalTimes - Tamanho do torneio (8, 16 ou 32)
 * @param {number} qtdEdicoes - Número de edições desejadas (1-10)
 * @param {number} rodadaFinalCampeonato - Última rodada do campeonato (default: 38)
 * @returns {Array} Array de edições com rodada_inicial, rodada_final, rodada_definicao
 */
/**
 * Retorna nomes das fases para o tamanho do torneio.
 */
function getFasesParaTamanho(totalTimes) {
    if (totalTimes >= 32) return ['primeira', 'oitavas', 'quartas', 'semis', 'final'];
    if (totalTimes >= 16) return ['oitavas', 'quartas', 'semis', 'final'];
    if (totalTimes >= 8)  return ['quartas', 'semis', 'final'];
    return [];
}

function gerarCalendarioMataMata(totalTimes, qtdEdicoes, rodadaFinalCampeonato = 38) {
    const fasesNomes = getFasesParaTamanho(totalTimes);
    const numFases = fasesNomes.length;
    if (numFases === 0) return [];

    // Cada edição precisa: 1 rodada de definição + N rodadas de fases
    const calendario = [];
    let rodadaAtual = 2; // Rodada 1 é aquecimento; definição começa na rodada 2

    for (let i = 0; i < qtdEdicoes; i++) {
        const rodadaDefinicao = rodadaAtual;
        const rodadaInicial = rodadaDefinicao + 1;
        const rodadaFinal = rodadaInicial + numFases - 1;

        // Validar que cabe no campeonato
        if (rodadaFinal > rodadaFinalCampeonato) {
            console.warn(`[CALENDARIO-MM] Edição ${i + 1} excede rodada ${rodadaFinalCampeonato} (rodadaFinal=${rodadaFinal}). Parando em ${i} edições.`);
            break;
        }

        // ✅ Mapeamento fixo fase→rodada (salvo no banco como fonte de verdade)
        const fases = {};
        fasesNomes.forEach((fase, idx) => {
            fases[fase] = rodadaInicial + idx;
        });

        calendario.push({
            edicao: i + 1,
            nome: `${i + 1}ª Edição`,
            rodada_inicial: rodadaInicial,
            rodada_final: rodadaFinal,
            rodada_definicao: rodadaDefinicao,
            fases
        });

        // Próxima edição: definição começa na rodada seguinte ao final
        rodadaAtual = rodadaFinal + 1;
    }

    return calendario;
}

// =============================================================================
// PROPAGAÇÃO: moduleconfigs → liga.configuracoes (ranking_rodada)
// =============================================================================

/**
 * Propaga valores_manual do moduleconfig para liga.configuracoes.ranking_rodada
 * Necessário para que o backend (rodadaController) encontre os valores financeiros
 */
async function propagarRankingRodadaParaLiga(ligaId, wizardRespostas) {
    const valoresManuais = wizardRespostas?.valores_manual;
    if (!valoresManuais || Object.keys(valoresManuais).length === 0) {
        console.warn('[MODULE-CONFIG] Sem valores_manual para propagar');
        return false;
    }

    const valores = {};
    let inicioCredito = null, fimCredito = null;
    let inicioNeutro = null, fimNeutro = null;
    let inicioDebito = null, fimDebito = null;

    const posicoes = Object.keys(valoresManuais).map(Number).sort((a, b) => a - b);
    const totalParticipantes = posicoes.length;

    for (const pos of posicoes) {
        const val = Number(valoresManuais[pos]) || 0;
        valores[String(pos)] = val;

        if (val > 0) {
            if (inicioCredito === null) inicioCredito = pos;
            fimCredito = pos;
        } else if (val < 0) {
            if (inicioDebito === null) inicioDebito = pos;
            fimDebito = pos;
        } else {
            if (inicioNeutro === null) inicioNeutro = pos;
            fimNeutro = pos;
        }
    }

    const faixas = {
        credito: { inicio: inicioCredito || 1, fim: fimCredito || 1 },
        neutro: { inicio: inicioNeutro || (fimCredito || 0) + 1, fim: fimNeutro || (inicioDebito || totalParticipantes) - 1 },
        debito: { inicio: inicioDebito || totalParticipantes, fim: fimDebito || totalParticipantes }
    };

    const rankingRodadaConfig = {
        descricao: 'Bônus/ônus por posição na rodada',
        configurado: true,
        total_participantes: totalParticipantes,
        valores,
        faixas
    };

    const result = await Liga.updateOne(
        { _id: ligaId },
        { $set: { 'configuracoes.ranking_rodada': rankingRodadaConfig } }
    );

    console.log(`[MODULE-CONFIG] ranking_rodada propagado para liga ${ligaId}: ${totalParticipantes} posições, ${result.modifiedCount} doc atualizado`);
    return result.modifiedCount > 0;
}

// =============================================================================
// PROPAGAÇÃO: moduleconfigs → liga.configuracoes (top_10)
// =============================================================================

/**
 * Propaga valores do wizard top_10 para liga.configuracoes.top10
 * Necessário para que top10.js encontre valores_mito e valores_mico
 */
async function propagarTop10ParaLiga(ligaId, wizardRespostas) {
    const {
        qtd_mitos = 10,
        qtd_micos = 10,
        valor_mito_1 = 30,
        valor_mico_1 = -30,
        decremento_valor = 2
    } = wizardRespostas || {};

    const qtdM = Number(qtd_mitos);
    const qtdC = Number(qtd_micos);
    const vMito1 = Number(valor_mito_1);
    const vMico1 = Number(valor_mico_1);
    const dec = Number(decremento_valor);

    // Gerar mapa posição → valor para mitos (decresce a cada posição)
    const valores_mito = {};
    for (let i = 1; i <= qtdM; i++) {
        valores_mito[String(i)] = vMito1 - dec * (i - 1);
    }

    // Gerar mapa posição → valor para micos (valor negativo, cresce em módulo)
    // mico_1 é negativo (ex: -30), cada próxima posição fica menos negativa (+dec)
    const valores_mico = {};
    for (let i = 1; i <= qtdC; i++) {
        valores_mico[String(i)] = vMico1 + dec * (i - 1);
    }

    const top10Config = {
        valores_mito,
        valores_mico,
        qtd_mitos: qtdM,
        qtd_micos: qtdC,
        configurado: true,
        // ✅ Timestamp para invalidação de cache: verificarCacheValido compara com data_ultima_atualizacao
        atualizado_em: new Date()
    };

    const result = await Liga.updateOne(
        { _id: ligaId },
        { $set: { 'configuracoes.top10': top10Config } }
    );

    // ✅ Invalidar top10caches para forçar recálculo com novos valores financeiros
    // Só caches sem cache_permanente (temporadas ativas) são removidos
    const ligaIdQuery = mongoose.Types.ObjectId.isValid(ligaId) ? new mongoose.Types.ObjectId(ligaId) : ligaId;
    const top10Deleted = await Top10Cache.deleteMany({
        liga_id: ligaIdQuery,
        cache_permanente: { $ne: true }
    });

    console.log(`[MODULE-CONFIG] top10 propagado para liga ${ligaId}: ${qtdM} mitos / ${qtdC} micos, dec=${dec}, ${result.modifiedCount} doc atualizado, ${top10Deleted.deletedCount} top10caches invalidados`);
    return result.modifiedCount > 0;
}

// =============================================================================
// LISTAR MODULOS
// =============================================================================

/**
 * GET /api/liga/:ligaId/modulos
 * Lista todos os modulos disponiveis e seu status para a liga
 */
router.get('/liga/:ligaId/modulos', async (req, res) => {
    try {
        const { ligaId } = req.params;
        const temporada = Number(req.query.temporada) || CURRENT_SEASON;

        // Buscar configs existentes para a liga
        const configsExistentes = await ModuleConfig.listarTodosModulos(ligaId, temporada);

        // Mapear configs por modulo
        const configMap = {};
        configsExistentes.forEach(cfg => {
            configMap[cfg.modulo] = cfg;
        });

        // Montar lista completa com todos os modulos disponiveis
        const modulos = MODULOS_DISPONIVEIS.map(moduloId => {
            const regrasJson = getRuleById(moduloId);
            const configDb = configMap[moduloId];

            return {
                id: moduloId,
                nome: regrasJson?.nome || moduloId,
                descricao: regrasJson?.descricao || '',
                tipo: regrasJson?.tipo || 'desconhecido',
                status_json: regrasJson?.status || 'desconhecido',
                ativo: configDb?.ativo ?? false,
                ativado_em: configDb?.ativado_em || null,
                configurado: !!configDb,
                wizard_disponivel: !!regrasJson?.wizard,
                wizard: regrasJson?.wizard || null
            };
        });

        // cacheHint para o frontend
        const { buildCacheHint, getMercadoContext } = await import('../utils/cache-hint.js');
        const ctx = await getMercadoContext();
        const cacheHint = buildCacheHint({ ...ctx, temporada, tipo: 'config' });

        res.json({
            sucesso: true,
            liga_id: ligaId,
            temporada,
            total: modulos.length,
            ativos: modulos.filter(m => m.ativo).length,
            modulos,
            cacheHint
        });

    } catch (error) {
        console.error('[MODULE-CONFIG] Erro ao listar modulos:', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao listar modulos',
            detalhes: error.message
        });
    }
});

/**
 * GET /api/liga/:ligaId/modulos/:modulo
 * Retorna config detalhada de um modulo especifico
 */
router.get('/liga/:ligaId/modulos/:modulo', async (req, res) => {
    try {
        const { ligaId, modulo } = req.params;
        const temporada = Number(req.query.temporada) || CURRENT_SEASON;

        // Validar modulo
        if (!MODULOS_DISPONIVEIS.includes(modulo)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Modulo invalido',
                modulos_validos: MODULOS_DISPONIVEIS
            });
        }

        // Buscar regras do JSON
        const regrasJson = getRuleById(modulo);
        if (!regrasJson) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Regras do modulo nao encontradas'
            });
        }

        // Buscar config do banco
        const configDb = await ModuleConfig.buscarConfig(ligaId, modulo, temporada);

        // ✅ FIX: Construir calendario_efetivo normalizado (camelCase)
        // Prioridade 1: calendario_override do DB (salvo pelo admin)
        // Prioridade 2: gerado dinamicamente de wizard_respostas (fix PR#176 incompleto)
        // Prioridade 3: fallback JSON hardcoded (último recurso)
        let calendario_efetivo = null;
        if (configDb?.calendario_override?.length > 0) {
            calendario_efetivo = configDb.calendario_override.map(e => ({
                id: e.edicao,
                nome: e.nome,
                rodadaInicial: e.rodada_inicial,
                rodadaFinal: e.rodada_final,
                rodadaDefinicao: e.rodada_definicao,
                fases: e.fases || null  // ✅ Mapeamento fixo fase→rodada salvo no banco
            }));
        } else if (modulo === 'mata_mata' && configDb?.wizard_respostas?.total_times && configDb?.wizard_respostas?.qtd_edicoes) {
            // Gerar dinamicamente quando calendario_override está vazio mas wizard foi configurado
            const gerado = gerarCalendarioMataMata(
                Number(configDb.wizard_respostas.total_times),
                Number(configDb.wizard_respostas.qtd_edicoes)
            );
            if (gerado.length > 0) {
                calendario_efetivo = gerado.map(e => ({
                    id: e.edicao,
                    nome: e.nome,
                    rodadaInicial: e.rodada_inicial,
                    rodadaFinal: e.rodada_final,
                    rodadaDefinicao: e.rodada_definicao,
                    fases: e.fases || null  // ✅ Mapeamento fixo fase→rodada
                }));
                console.log(`[MODULE-CONFIG] calendario_efetivo gerado de wizard_respostas: ${gerado.length} edições (${configDb.wizard_respostas.total_times} times)`);
            }
        } else if (regrasJson?.calendario?.edicoes?.length > 0) {
            calendario_efetivo = regrasJson.calendario.edicoes;
        }

        res.json({
            sucesso: true,
            liga_id: ligaId,
            temporada,
            modulo: {
                id: modulo,
                nome: regrasJson.nome,
                descricao: regrasJson.descricao,
                tipo: regrasJson.tipo,
                status_json: regrasJson.status
            },
            config: configDb || {
                ativo: false,
                configurado: false
            },
            regras_default: regrasJson,
            wizard: regrasJson.wizard || null,
            calendario_efetivo
        });

    } catch (error) {
        console.error('[MODULE-CONFIG] Erro ao buscar modulo:', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar modulo',
            detalhes: error.message
        });
    }
});

// =============================================================================
// ATIVAR / DESATIVAR MODULO
// =============================================================================

/**
 * POST /api/liga/:ligaId/modulos/:modulo/ativar
 * Ativa um modulo para a liga com as configuracoes do wizard
 */
router.post('/liga/:ligaId/modulos/:modulo/ativar', verificarAdmin, async (req, res) => {
    try {
        const { ligaId, modulo } = req.params;
        const temporada = Number(req.body.temporada) || CURRENT_SEASON;
        const { wizard_respostas, financeiro_override, regras_override } = req.body;

        // Validar modulo
        if (!MODULOS_DISPONIVEIS.includes(modulo)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Modulo invalido',
                modulos_validos: MODULOS_DISPONIVEIS
            });
        }

        // Usuario que está ativando (se autenticado)
        const usuario = req.session?.usuario?.email || 'sistema';

        // Montar config
        const config = {
            wizard_respostas: wizard_respostas || {},
            financeiro_override: financeiro_override || null,
            regras_override: regras_override || null
        };

        // Ativar modulo
        const resultado = await ModuleConfig.ativarModulo(
            ligaId,
            modulo,
            config,
            usuario,
            temporada
        );

        // Propagar ranking_rodada para liga.configuracoes (se aplicável)
        if (modulo === 'ranking_rodada' && wizard_respostas?.valores_manual) {
            await propagarRankingRodadaParaLiga(ligaId, wizard_respostas);
        }

        // Propagar top_10 para liga.configuracoes
        if (modulo === 'top_10') {
            await propagarTop10ParaLiga(ligaId, wizard_respostas);
        }

        // ✅ FIX: Gerar calendario_override para mata_mata ao ativar (mesma lógica do PUT /config)
        // Sem isso, o calendario_override fica vazio e o sistema cai no JSON default (32 times)
        if (modulo === 'mata_mata' && wizard_respostas?.total_times && wizard_respostas?.qtd_edicoes) {
            const calendarioGerado = gerarCalendarioMataMata(
                Number(wizard_respostas.total_times),
                Number(wizard_respostas.qtd_edicoes)
            );
            if (calendarioGerado.length > 0) {
                await ModuleConfig.findOneAndUpdate(
                    { liga_id: new mongoose.Types.ObjectId(ligaId), modulo, temporada: Number(temporada) },
                    { $set: { calendario_override: calendarioGerado } }
                );
                console.log(`[MODULE-CONFIG] calendario_override gerado ao ativar mata_mata: ${calendarioGerado.length} edições`);
            }
        }

        console.log(`[MODULE-CONFIG] Modulo ${modulo} ativado para liga ${ligaId} por ${usuario}`);

        res.json({
            sucesso: true,
            mensagem: `Modulo ${modulo} ativado com sucesso`,
            config: resultado
        });

    } catch (error) {
        console.error('[MODULE-CONFIG] Erro ao ativar modulo:', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao ativar modulo',
            detalhes: error.message
        });
    }
});

/**
 * POST /api/liga/:ligaId/modulos/:modulo/desativar
 * Desativa um modulo para a liga
 */
router.post('/liga/:ligaId/modulos/:modulo/desativar', verificarAdmin, async (req, res) => {
    try {
        const { ligaId, modulo } = req.params;
        const temporada = Number(req.body.temporada) || CURRENT_SEASON;

        // Validar modulo
        if (!MODULOS_DISPONIVEIS.includes(modulo)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Modulo invalido'
            });
        }

        // Usuario
        const usuario = req.session?.usuario?.email || 'sistema';

        // Desativar
        const resultado = await ModuleConfig.desativarModulo(
            ligaId,
            modulo,
            usuario,
            temporada
        );

        if (!resultado) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Modulo nao estava configurado'
            });
        }

        console.log(`[MODULE-CONFIG] Modulo ${modulo} desativado para liga ${ligaId} por ${usuario}`);

        res.json({
            sucesso: true,
            mensagem: `Modulo ${modulo} desativado`,
            config: resultado
        });

    } catch (error) {
        console.error('[MODULE-CONFIG] Erro ao desativar modulo:', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao desativar modulo',
            detalhes: error.message
        });
    }
});

// =============================================================================
// ATUALIZAR CONFIGURACAO
// =============================================================================

/**
 * PUT /api/liga/:ligaId/modulos/:modulo/config
 * Atualiza configuracao de um modulo (sem mudar status ativo/inativo)
 */
router.put('/liga/:ligaId/modulos/:modulo/config', verificarAdmin, async (req, res) => {
    try {
        const { ligaId, modulo } = req.params;
        const temporada = Number(req.body.temporada) || CURRENT_SEASON;
        const { wizard_respostas, financeiro_override, regras_override, calendario_override } = req.body;

        // Validar modulo
        if (!MODULOS_DISPONIVEIS.includes(modulo)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Modulo invalido'
            });
        }

        // Usuario
        const usuario = req.session?.usuario?.email || 'sistema';

        // Atualizar apenas respostas wizard
        if (wizard_respostas) {
            await ModuleConfig.salvarRespostasWizard(
                ligaId,
                modulo,
                wizard_respostas,
                usuario,
                temporada
            );

            // Propagar ranking_rodada para liga.configuracoes
            if (modulo === 'ranking_rodada' && wizard_respostas.valores_manual) {
                await propagarRankingRodadaParaLiga(ligaId, wizard_respostas);
            }

            // Propagar top_10 para liga.configuracoes
            if (modulo === 'top_10') {
                await propagarTop10ParaLiga(ligaId, wizard_respostas);
            }

            // ✅ FIX: Gerar calendario_override dinâmico para mata_mata
            // Quando admin configura total_times + qtd_edicoes, o calendário deve ser
            // gerado automaticamente adaptado ao número de fases do torneio.
            // Isso elimina a dependência do JSON hardcoded (2025, 32 times).
            if (modulo === 'mata_mata' && wizard_respostas.total_times && wizard_respostas.qtd_edicoes) {
                const calendarioGerado = gerarCalendarioMataMata(
                    Number(wizard_respostas.total_times),
                    Number(wizard_respostas.qtd_edicoes)
                );
                if (calendarioGerado.length > 0) {
                    await ModuleConfig.findOneAndUpdate(
                        { liga_id: new mongoose.Types.ObjectId(ligaId), modulo, temporada: Number(temporada) },
                        { $set: { calendario_override: calendarioGerado } }
                    );
                    console.log(`[MODULE-CONFIG] calendario_override gerado para mata_mata: ${calendarioGerado.length} edições (${wizard_respostas.total_times} times)`);
                }

                // ✅ FIX: Invalidar MataMataCache ao reconfigurar wizard
                // Caches antigos podem ter dados baseados em rodadas de calendário anterior
                const MataMataCache = (await import('../models/MataMataCache.js')).default;
                const ligaIdQuery = mongoose.Types.ObjectId.isValid(ligaId) ? new mongoose.Types.ObjectId(ligaId) : ligaId;
                const mmDeleted = await MataMataCache.deleteMany({
                    liga_id: String(ligaIdQuery),
                    temporada: Number(temporada)
                });
                console.log(`[MODULE-CONFIG] MataMataCache invalidado para liga ${ligaId}: ${mmDeleted.deletedCount} entradas removidas`);
            }

            // ✅ v11.0: Invalidar cache do melhor_mes quando edições são reconfiguradas
            // Evita colisão 2025/2026 e garante que o cache seja recriado com a nova config
            if (modulo === 'melhor_mes' && wizard_respostas.edicoes_intervalos) {
                const melhorMesService = (await import('../services/melhorMesService.js')).default;
                await melhorMesService.invalidarCache(ligaId, temporada);
                console.log(`[MODULE-CONFIG] melhor_mes cache invalidado (temporada ${temporada}) — será recriado com nova config`);
            }

            // ✅ Auto-build financeiro_override.valores_por_posicao a partir do wizard
            // Lê os campos com afeta = "financeiro_override.valores_por_posicao.N"
            // e respeita flags vice_habilitado / terceiro_habilitado
            const regrasJson = getRuleById(modulo);
            const perguntas = regrasJson?.wizard?.perguntas || [];
            const valores_por_posicao = {};

            for (const p of perguntas) {
                if (!p.afeta?.startsWith('financeiro_override.valores_por_posicao.')) continue;
                const posicao = p.afeta.split('.').pop(); // '1', '2', '3'
                const val = Number(wizard_respostas[p.id]) || 0;

                // Derivar nome da flag (ex: valor_vice → vice_habilitado)
                const flagKey = p.id.replace('valor_', '') + '_habilitado';
                const flagVal = wizard_respostas[flagKey];

                // Incluir posição apenas se: flag não é false E valor > 0
                if (flagVal === false) continue;
                if (val > 0) {
                    valores_por_posicao[posicao] = val;
                }
            }

            if (Object.keys(valores_por_posicao).length > 0) {
                await ModuleConfig.findOneAndUpdate(
                    { liga_id: new mongoose.Types.ObjectId(ligaId), modulo, temporada: Number(temporada) },
                    { $set: { 'financeiro_override.valores_por_posicao': valores_por_posicao } }
                );
                console.log(`[MODULE-CONFIG] financeiro_override.valores_por_posicao construído para ${modulo}:`, valores_por_posicao);
            }
        }

        // ✅ FIX: Sincronizar com liga.modulos_ativos para remover "Em manutenção"
        // Mapear ID do módulo para frontend (extrato, ranking_geral → ranking, etc.)
        const mapearModuloParaFrontend = (moduloBackend) => {
            const mapeamento = {
                'extrato': 'extrato',
                'ranking_geral': 'ranking',
                'ranking_rodada': 'rodadas',
                'top_10': 'top10',
                'melhor_mes': 'melhorMes',
                'pontos_corridos': 'pontosCorridos',
                'mata_mata': 'mataMata',
                'artilheiro': 'artilheiro',
                'luva_ouro': 'luvaOuro',
                'capitao_luxo': 'capitaoLuxo',
                'campinho': 'campinho',
                'dicas': 'dicas'
            };
            return mapeamento[moduloBackend] || moduloBackend;
        };

        const moduloFrontendKey = mapearModuloParaFrontend(modulo);
        await Liga.updateOne(
            { _id: ligaId },
            { $set: { [`modulos_ativos.${moduloFrontendKey}`]: true } }
        );
        console.log(`[MODULE-CONFIG] Sincronizado liga.modulos_ativos.${moduloFrontendKey} = true`);

        // Buscar config atualizada
        const configAtualizada = await ModuleConfig.buscarConfig(ligaId, modulo, temporada);

        res.json({
            sucesso: true,
            mensagem: 'Configuracao atualizada',
            config: configAtualizada
        });

    } catch (error) {
        console.error('[MODULE-CONFIG] Erro ao atualizar config:', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao atualizar configuracao',
            detalhes: error.message
        });
    }
});

// =============================================================================
// VERIFICAR STATUS
// =============================================================================

/**
 * GET /api/liga/:ligaId/modulos/:modulo/status
 * Verifica se modulo esta ativo
 */
router.get('/liga/:ligaId/modulos/:modulo/status', async (req, res) => {
    try {
        const { ligaId, modulo } = req.params;
        const temporada = Number(req.query.temporada) || CURRENT_SEASON;

        const ativo = await ModuleConfig.isModuloAtivo(ligaId, modulo, temporada);

        res.json({
            sucesso: true,
            modulo,
            liga_id: ligaId,
            temporada,
            ativo
        });

    } catch (error) {
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao verificar status',
            detalhes: error.message
        });
    }
});

// =============================================================================
// WIZARD - OBTER PERGUNTAS
// =============================================================================

/**
 * GET /api/modulos/:modulo/wizard
 * Retorna as perguntas do wizard para um modulo
 */
router.get('/modulos/:modulo/wizard', async (req, res) => {
    try {
        const { modulo } = req.params;

        // Validar modulo
        if (!MODULOS_DISPONIVEIS.includes(modulo)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Modulo invalido'
            });
        }

        // Buscar regras do JSON
        const regrasJson = getRuleById(modulo);
        if (!regrasJson) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Regras do modulo nao encontradas'
            });
        }

        if (!regrasJson.wizard) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Modulo nao possui wizard configurado'
            });
        }

        res.json({
            sucesso: true,
            modulo: {
                id: modulo,
                nome: regrasJson.nome,
                descricao: regrasJson.descricao
            },
            wizard: regrasJson.wizard
        });

    } catch (error) {
        console.error('[MODULE-CONFIG] Erro ao buscar wizard:', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar wizard',
            detalhes: error.message
        });
    }
});

export default router;
