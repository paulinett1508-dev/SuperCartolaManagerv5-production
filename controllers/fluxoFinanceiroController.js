/**
 * FLUXO-FINANCEIRO-CONTROLLER v8.20.0 (SaaS DINÂMICO)
 * ✅ v8.20.0: FEATURE - Rodada parcial ao vivo no extrato individual
 *   - Quando mercado fechado (rodada em andamento), injeta rodada_parcial no response
 *   - Calcula impacto financeiro projetado (banco + pontos corridos) usando mesmas fórmulas
 *   - Frontend pode renderizar rodada "AO VIVO" na timeline + saldo projetado
 *   - Dados efêmeros (não cacheados) — substituídos pela consolidação real
 * ✅ v8.19.0: FIX CRÍTICO - Inscrição agora usa InscricaoTemporada (fonte canônica)
 *   - Bug: usava liga.participantes[].pagouInscricao (legacy, dessincronizado com tesourariaController)
 *   - Consequência: extrato individual divergia da tabela admin (ex: +R$66 vs -R$114)
 *   - Fix: query InscricaoTemporada.buscarPorParticipante() + saldo_transferido + divida_anterior
 *   - Fallback: ligas legacy sem InscricaoTemporada usam LigaRules (backwards-compatible)
 * ✅ v8.18.0: FIX CRÍTICO - TOP10 agora SEMPRE recalcula (mesmo padrão MM v8.12)
 *   - Bug: guard temTop10NoCache impedia recálculo quando participante saía do Top10
 *   - Transações MITO/MICO ficavam congeladas no cache para sempre
 *   - Fix: remove guard, desconta saldo antigo, recalcula com dados frescos
 * ✅ v8.17.0: FIX CRÍTICO - Inscrição persistida no cache ANTES do save
 *   - Bug: inscrição era calculada após cache.save() → nunca entrava em historico_transacoes
 *   - Consequência: extratoFinanceiroCacheController retornava saldo_lancamentos_iniciais=0
 *   - Admin/participante viam R$55 ao invés de ~-R$125 (faltava dedução -R$180)
 *   - Fix: inscrição adicionada a novasTransacoes antes do save (rodada=0)
 *   - Fix secundário: FluxoFinanceiroCampos query usa liga_id/time_id (snake_case pós G3)
 * ✅ v8.12.0: FIX - Owner/premium isento de inscrição
 *   - Participante com premium=true em liga com owner_email tem inscrição abonada
 *   - Não gera débito de inscrição para o owner da liga
 * ✅ v8.11.0: FIX CRÍTICO - Preservação de entradas R0 durante auto-healing
 *   - Auto-healing agora preserva INSCRICAO_TEMPORADA e SALDO_TEMPORADA_ANTERIOR
 *   - Inscrição dinâmica verifica se já existe no cache (anti-double-count)
 *   - getFluxoFinanceiroLiga busca com fallback String/ObjectId
 * ✅ v8.10.0: FEATURE - Inscrição automática como lançamento inicial
 *   - Adiciona taxa de inscrição da temporada automaticamente no extrato
 *   - Funciona com pagamentos parciais (inscrição -180 + acerto +60 = saldo -120)
 *   - Flag pagouInscricao: true → não adiciona débito (já quitado)
 *   - Flag pagouInscricao: false → adiciona débito (pendente ou parcial)
 *   - Pagamentos parciais registrados via sistema de Acertos
 * ✅ v8.9.1: FIX CRÍTICO - isModuloHabilitado() agora respeita flag 'configurado'
 *   - Ligas com config parcial (configurado: false) usam modulos_ativos como fallback
 *   - Resolve bug onde PC/MM/Top10 ativos em modulos_ativos eram ignorados
 * ✅ v8.9.0: FIX CRÍTICO - AUTO-HEALING de módulos faltantes no cache
 *   - Detecta quando módulos (PC/MM/Top10) estão habilitados mas ausentes no cache consolidado
 *   - Invalida cache automaticamente e força recálculo completo
 *   - Resolve bug onde cache criado antes do módulo ser habilitado nunca era recalculado
 *   - Função detectarModulosFaltantesNoCache() verifica integridade dos dados
 * ✅ v8.7.0: FIX CRÍTICO - Query de rodadas agora filtra por temporada (evita misturar 2025+2026)
 * ✅ v8.6.0: FIX PREVENTIVO - Query TOP10 agora filtra por temporada (evita cache errado)
 * ✅ v8.5.0: PROTEÇÃO DADOS HISTÓRICOS - resetarCampos/deletarCampos só permite temporada atual
 * ✅ v8.4.0: FIX CRÍTICO - Extrato 2026 não calcula rodadas (pré-temporada)
 *   - Temporadas futuras mostram apenas: inscrição + legado + ajustes
 *   - Integração com sistema de Ajustes (substitui campos manuais em 2026+)
 *   - Bloqueia cálculo de rodadas quando temporada > getFinancialSeason()
 * ✅ v8.3.0: FIX CRÍTICO - Temporada em TODAS as queries (campos, acertos)
 *   - Removido hardcoded "2025" nos acertos financeiros
 *   - getCampos(), salvarCampo(), getCamposLiga() agora filtram por temporada
 *   - getFluxoFinanceiroLiga() também inclui temporada
 * ✅ v8.2.0: FIX CRÍTICO - Temporada obrigatória em queries de cache (evita duplicados)
 * ✅ v8.1.0: Invalidação de cache em cascata ao salvar campos manuais
 * ✅ v8.0.0: MULTI-TENANT - Busca configurações de liga.configuracoes (White Label)
 *   - Remove hardcoded IDs e valores de ligas específicas
 *   - getBancoPorRodada() agora busca de liga.configuracoes.ranking_rodada
 *   - getValoresTop10() agora busca de liga.configuracoes.top10
 *   - Módulos verificados via liga.configuracoes.{modulo}.habilitado
 * ✅ v7.5: CORREÇÃO LÓGICA DE ACERTOS
 *   - Pagamento AUMENTA saldo (quita dívida)
 *   - Recebimento DIMINUI saldo (usa crédito)
 * ✅ v7.4: ACERTOS FINANCEIROS - Pagamentos/recebimentos em tempo real
 * ✅ v7.3: FIX TABELA BANCO - Valores corretos para SuperCartola
 * ✅ v7.2: FIX DUPLICAÇÃO - MATA-MATA removido do loop de rodadas
 * ✅ v7.1: FIX - MATA-MATA histórico calculado fora do loop
 * ✅ v7.0: CORREÇÃO CRÍTICA - TOP10 é ranking HISTÓRICO, não por rodada!
 * ✅ v6.1: MATA-MATA COMPLETO (todas as fases)
 * ✅ v6.0: Alinhamento completo com frontend
 */

import fetch from "node-fetch";
import mongoose from "mongoose";
import Liga from "../models/Liga.js";
import Time from "../models/Time.js";
import Rodada from "../models/Rodada.js";
import ExtratoFinanceiroCache from "../models/ExtratoFinanceiroCache.js";
import FluxoFinanceiroCampos from "../models/FluxoFinanceiroCampos.js";
import Top10Cache from "../models/Top10Cache.js";
import AcertoFinanceiro from "../models/AcertoFinanceiro.js";
import AjusteFinanceiro from "../models/AjusteFinanceiro.js";
import LigaRules from "../models/LigaRules.js";
import InscricaoTemporada from "../models/InscricaoTemporada.js";
import { getResultadosMataMataCompleto } from "./mata-mata-backend.js";
// ✅ v8.20.0: Parciais ao vivo no extrato individual
import { buscarRankingParcial } from "../services/parciaisRankingService.js";
// ✅ v8.1.0: Invalidação de cache em cascata
import { onCamposSaved } from "../utils/cache-invalidator.js";
// ✅ v8.2.0: FIX CRÍTICO - Temporada obrigatória em todas as queries de cache
// ✅ v8.3.0: Usa getFinancialSeason() para consistência com quitacaoController
// ✅ v8.4.0: SEASON_CONFIG para verificar status da temporada
import { CURRENT_SEASON, getFinancialSeason, SEASON_CONFIG } from "../config/seasons.js";
import logger from '../utils/logger.js';

// ============================================================================
// 🔧 CONSTANTES DE FALLBACK (usadas apenas se liga.configuracoes não existir)
// ============================================================================

const RODADA_INICIAL_PONTOS_CORRIDOS = 7;

// ✅ v8.15.0: Cache in-memory para Mata-Mata por liga (evita recalcular para cada participante)
// Chave: `${ligaId}:${rodadaParam}` | Valor: { data: resultados[], timestamp: Date.now() }
const _mataMataCache = new Map();
const MATA_MATA_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getResultadosMataMataComCache(ligaId, rodadaParam) {
    const cacheKey = `${ligaId}:${rodadaParam}`;
    const cached = _mataMataCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < MATA_MATA_CACHE_TTL) {
        logger.log(`[FLUXO-CONTROLLER] ⚡ MATA-MATA cache HIT (liga=${ligaId}, age=${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return cached.data;
    }

    const resultados = await getResultadosMataMataCompleto(ligaId, rodadaParam);
    _mataMataCache.set(cacheKey, { data: resultados, timestamp: Date.now() });
    logger.log(`[FLUXO-CONTROLLER] 💾 MATA-MATA cache MISS → calculado e salvo (liga=${ligaId}, ${resultados.length} resultados)`);
    return resultados;
}

// ============================================================================
// ✅ v8.0: FUNÇÕES SaaS DINÂMICAS (Multi-Tenant)
// ============================================================================

/**
 * Obtém configuração de ranking_rodada (BANCO) da liga
 * @param {Object} liga - Documento da liga
 * @param {number} rodada - Número da rodada (para configs temporais)
 * @returns {Object} { valores: {posicao: valor}, temporal: boolean }
 */
export function getConfigRankingRodada(liga, rodada = 1) {
    const config = liga?.configuracoes?.ranking_rodada;

    if (!config) {
        logger.warn(`[FLUXO] Liga ${liga?._id} sem configuracoes.ranking_rodada`);
        return { valores: {}, temporal: false };
    }

    // Config temporal (ex: Sobral com 2 fases)
    if (config.temporal) {
        const rodadaTransicao = config.rodada_transicao || 30;
        const fase = rodada < rodadaTransicao ? 'fase1' : 'fase2';
        const faseConfig = config[fase] || {};

        return {
            valores: faseConfig.valores || {},
            temporal: true,
            rodadaTransicao,
            fase,
        };
    }

    // Config simples
    return {
        valores: config.valores || {},
        temporal: false,
    };
}

/**
 * Obtém configuração de TOP10 (Mitos/Micos) da liga
 * @param {Object} liga - Documento da liga
 * @returns {Object} { mitos: {pos: valor}, micos: {pos: valor} }
 */
function getConfigTop10(liga) {
    const config = liga?.configuracoes?.top10;

    if (!config) {
        logger.warn(`[FLUXO] Liga ${liga?._id} sem configuracoes.top10`);
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
 * @param {string} modulo - Nome do módulo (pontos_corridos, mata_mata, top10, etc.)
 * @returns {boolean}
 */
export function isModuloHabilitado(liga, modulo) {
    // ✅ v8.9.1 FIX: Só usar configuracoes se módulo estiver CONFIGURADO
    // Ligas com config parcial (configurado: false) devem usar modulos_ativos como fallback
    const configModulo = liga?.configuracoes?.[modulo];

    // Se módulo está CONFIGURADO no sistema novo, usar essa config
    if (configModulo?.configurado === true && configModulo?.habilitado !== undefined) {
        return configModulo.habilitado;
    }

    // Fallback para modulos_ativos (compatibilidade com sistema antigo)
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
// 🛠️ FUNÇÕES AUXILIARES
// ============================================================================

async function getStatusMercadoInterno() {
    try {
        // ✅ v8.14.0 FIX: Timeout de 5s para evitar hang pós-republish
        // Sem timeout, a requisição pode bloquear o endpoint por minutos durante cold start
        const response = await fetch(
            "https://api.cartola.globo.com/mercado/status",
            {
                headers: { "User-Agent": "SuperCartolaManager/1.0" },
                signal: AbortSignal.timeout(5000),
            },
        );
        if (!response.ok) throw new Error("Falha na API Cartola");
        const data = await response.json();
        data._fallback = false;
        return data;
    } catch (error) {
        // ✅ v8.15.0 FIX: Fallback inteligente — buscar rodada do DB ao invés de 0
        // Bug: rodada_atual=0 bloqueava TODOS os cálculos (Banco, PC, etc) quando
        // API Cartola falhava, deixando participantes sem dados financeiros.
        // Solução: Consultar última rodada consolidada no DB como fallback confiável.
        try {
            // ✅ v8.16.0: Timeout de 3s para evitar hang se MongoDB estiver lento
            const ultimaRodadaDB = await Rodada.findOne({
                temporada: CURRENT_SEASON,
            }).sort({ rodada: -1 }).select('rodada').lean().maxTimeMS(3000);

            if (ultimaRodadaDB && ultimaRodadaDB.rodada > 0) {
                logger.warn(
                    `[FLUXO-CONTROLLER] API Cartola indisponível, fallback DB: rodada_atual=${ultimaRodadaDB.rodada}`,
                );
                return {
                    rodada_atual: ultimaRodadaDB.rodada,
                    status_mercado: 1, // Assumir mercado aberto (seguro: não consolida rodada atual)
                    _fallback: true,
                    _fallbackSource: 'db',
                };
            }
        } catch (dbError) {
            logger.error("[FLUXO-CONTROLLER] Fallback DB também falhou:", dbError.message);
        }

        logger.warn(
            "[FLUXO-CONTROLLER] Falha ao obter status mercado, usando fallback seguro (rodada_atual: 0).",
        );
        // ✅ v8.13.0 FIX: Fallback seguro — rodada_atual: 0 impede cálculo de módulos
        return { rodada_atual: 0, status_mercado: 2, _fallback: true, _fallbackSource: 'hardcoded' };
    }
}

/**
 * ✅ v8.9.0 FIX CRÍTICO: Detecta módulos habilitados mas ausentes no cache
 * Resolve bug onde cache foi criado antes do módulo ser habilitado
 * @param {Object} cache - Cache de extrato financeiro
 * @param {Object} liga - Documento da liga
 * @param {number} rodadaLimite - Última rodada a verificar
 * @returns {Array<string>} Lista de módulos faltantes (ex: ['PONTOS_CORRIDOS', 'MATA_MATA'])
 */
function detectarModulosFaltantesNoCache(cache, liga, rodadaLimite) {
    const modulosFaltantes = [];
    const transacoes = cache.historico_transacoes || [];

    // 1. Verificar PONTOS CORRIDOS
    const pcHabilitado = isModuloHabilitado(liga, 'pontos_corridos'); // ✅ C6 FIX: modulos_ativos já verificado dentro de isModuloHabilitado
    if (pcHabilitado) {
        const rodadaInicialPC = liga.configuracoes?.pontos_corridos?.rodadaInicial ?? 7;
        // Verificar se deveria ter transações de PC (rodada >= rodadaInicial)
        if (rodadaLimite >= rodadaInicialPC) {
            const temPC = transacoes.some(t => t.tipo === 'PONTOS_CORRIDOS' && t.rodada >= rodadaInicialPC);
            if (!temPC) {
                modulosFaltantes.push('PONTOS_CORRIDOS');
            }
        }
    }

    // 2. Verificar MATA-MATA
    const mmHabilitado = isModuloHabilitado(liga, 'mata_mata'); // ✅ C6 FIX
    if (mmHabilitado) {
        // MM pode ter múltiplas edições, verificar se tem pelo menos uma transação
        const temMM = transacoes.some(t => t.tipo === 'MATA_MATA');
        const edicoes = liga.configuracoes?.mata_mata?.edicoes || [];
        // Se tem edições configuradas e deveria ter rodadas consolidadas, verificar
        if (edicoes.length > 0 && rodadaLimite >= 3) { // MM geralmente começa na R3
            if (!temMM) {
                modulosFaltantes.push('MATA_MATA');
            }
        }
    }

    // 3. Verificar TOP10
    const top10Habilitado = isModuloHabilitado(liga, 'top10'); // ✅ C6 FIX
    if (top10Habilitado) {
        const temTop10 = transacoes.some(t => t.tipo === 'MITO' || t.tipo === 'MICO');
        // Top10 é ranking histórico, só deveria aparecer após várias rodadas
        if (rodadaLimite >= 5 && !temTop10) {
            // Pode não ter Top10 se o time nunca foi Mito/Mico, então é menos crítico
            // Não marcar como faltante (falso positivo comum)
        }
    }

    return modulosFaltantes;
}

// ============================================================================
// 💰 BANCO (BÔNUS/ÔNUS POR POSIÇÃO NA RODADA)
// ============================================================================

/**
 * ✅ v8.0: Calcula bônus/ônus de banco usando configuração dinâmica da liga
 * @param {Object} liga - Documento da liga (com configuracoes)
 * @param {number} timeId - ID do time
 * @param {number} rodadaNumero - Número da rodada
 * @param {Array} pontuacoes - Lista de pontuações da rodada
 * @returns {Object|null} { valor, descricao, posicao, totalTimes }
 */
export function calcularBanco(liga, timeId, rodadaNumero, pontuacoes) {
    const ranking = [...pontuacoes].sort((a, b) => b.pontos - a.pontos);
    const posicao =
        ranking.findIndex((p) => String(p.timeId) === String(timeId)) + 1;

    if (posicao <= 0) return null;

    const totalTimes = ranking.length;

    // ✅ v8.0: Buscar valores do banco da configuração da liga
    const configRanking = getConfigRankingRodada(liga, rodadaNumero);
    const valorBanco = configRanking.valores[posicao] || configRanking.valores[String(posicao)] || 0;

    // ✅ v8.10: Sempre retornar resultado (inclui Zona Neutra com valor 0)
    // Garante que todas as rodadas apareçam no extrato timeline
    const isNeutro = valorBanco === 0;
    return {
        valor: valorBanco,
        descricao: isNeutro
            ? `Banco R${rodadaNumero}: ${posicao}º lugar (Zona Neutra)`
            : `Banco R${rodadaNumero}: ${posicao}º lugar`,
        posicao: posicao,
        totalTimes: totalTimes,
    };
}

// ============================================================================
// 🏆 TOP10 (MITO/MICO)
// ============================================================================

/**
 * ✅ v8.6: Calcula TOP10 baseado no ranking HISTÓRICO (cache de Top10)
 * - Busca o cache de Top10 que contém os 10 maiores mitos e 10 menores micos
 * - Verifica se o time aparece nesse ranking histórico
 * - Retorna array de transações de TOP10 (pode ter múltiplas aparições)
 * @param {Object} liga - Documento da liga (com configuracoes)
 * @param {number} timeId - ID do time
 * @param {number} temporada - Temporada para filtrar o cache
 */
async function calcularTop10Historico(liga, timeId, temporada) {
    try {
        const ligaId = liga._id;
        // ✅ v8.6: FIX - Filtrar TOP10 por temporada (evita retornar cache errado)
        const cache = await Top10Cache.findOne({
            liga_id: String(ligaId),
            temporada: temporada
        })
            .sort({ rodada_consolidada: -1 })
            .lean();

        if (!cache || !cache.mitos?.length || !cache.micos?.length) {
            logger.log(`[FLUXO-CONTROLLER] Top10 cache não encontrado ou vazio para liga ${ligaId}`);
            return [];
        }

        // ✅ v8.0: Buscar valores do TOP10 da configuração da liga
        const configTop10 = getConfigTop10(liga);
        const transacoes = [];

        // Verificar aparições nos TOP 10 MITOS (10 maiores pontuações históricas)
        cache.mitos.slice(0, 10).forEach((m, i) => {
            const mTimeId = m.timeId || m.time_id;
            if (String(mTimeId) === String(timeId)) {
                const pos = i + 1;
                const valor = configTop10.mitos[pos] || configTop10.mitos[String(pos)] || 0;
                // ✅ v8.8.0 FIX: m.rodada pode não existir no cache — usar rodada_consolidada como fallback
                const rodada = m.rodada || cache.rodada_consolidada;
                transacoes.push({
                    rodada: rodada,
                    tipo: "MITO",
                    descricao: `Top10 Mito: ${pos}º maior pontuação histórica (R${rodada})`,
                    valor: valor,
                    posicao: pos,
                    data: new Date(),
                });
            }
        });

        // Verificar aparições nos TOP 10 MICOS (10 menores pontuações históricas)
        cache.micos.slice(0, 10).forEach((m, i) => {
            const mTimeId = m.timeId || m.time_id;
            if (String(mTimeId) === String(timeId)) {
                const pos = i + 1;
                const valor = configTop10.micos[pos] || configTop10.micos[String(pos)] || 0;
                // ✅ v8.8.0 FIX: m.rodada pode não existir no cache — usar rodada_consolidada como fallback
                const rodada = m.rodada || cache.rodada_consolidada;
                transacoes.push({
                    rodada: rodada,
                    tipo: "MICO",
                    descricao: `Top10 Mico: ${pos}º menor pontuação histórica (R${rodada})`,
                    valor: valor,
                    posicao: pos,
                    data: new Date(),
                });
            }
        });

        return transacoes;
    } catch (error) {
        logger.error(`[FLUXO-CONTROLLER] Erro ao calcular Top10 histórico:`, error);
        return [];
    }
}

// ============================================================================
// ⚽ PONTOS CORRIDOS
// ============================================================================

/**
 * Algoritmo round-robin canônico (rotação).
 * IDÊNTICO ao gerarBracketFromIds de pontosCorridosCacheController.js e
 * ao gerarBracket de scripts/regenerar-bracket-pontos-corridos.js.
 * NÃO alterar sem alinhar todos os outros locais onde esta função existe.
 * @param {string[]} ids - IDs ordenados (mesma ordem usada pelo admin)
 * @returns {Array<Array<{a: string|null, b: string|null}>>} bracket por rodada
 */
function _gerarBracketPC(ids) {
    const lista = [...ids];
    if (lista.length % 2 !== 0) lista.push(null); // BYE para número ímpar
    const total = lista.length - 1;
    const rodadas = [];
    for (let r = 0; r < total; r++) {
        const jogos = [];
        for (let i = 0; i < lista.length / 2; i++) {
            const a = lista[i];
            const b = lista[lista.length - 1 - i];
            jogos.push({ a, b }); // null = BYE
        }
        rodadas.push(jogos);
        lista.splice(1, 0, lista.pop()); // rotação: último → posição 1
    }
    return rodadas;
}

export async function calcularConfrontoPontosCorridos(
    liga,
    timeId,
    rodadaCartola,
    pontuacaoTime,
    todasPontuacoes,
) {
    const RODADA_INICIAL_LIGA =
        liga.configuracoes?.pontos_corridos?.rodadaInicial ??
        RODADA_INICIAL_PONTOS_CORRIDOS;
    const rodadaLiga = rodadaCartola - (RODADA_INICIAL_LIGA - 1);

    if (rodadaLiga < 1) return null;

    // ✅ v8.8.0 FIX: Filtrar apenas participantes ativos no round-robin do PC
    // Inativos (desistentes) distorcem os confrontos de todos os participantes
    const participantesOrdenados = liga.participantes
        .filter(p => p.ativo !== false)
        .slice()
        .sort((a, b) => a.nome_cartola.localeCompare(b.nome_cartola));

    const meuTimeId = String(timeId);
    const meuParticipante = participantesOrdenados.find(
        (p) => String(p.time_id) === meuTimeId,
    );
    if (!meuParticipante) return null;

    // Usa o algoritmo canônico de rotação — idêntico ao admin e ao cache controller.
    // NÃO usar fórmula de offset: (meuIndex + rodadaLiga) % totalTimes produz
    // confrontos errados e pode gerar empates fictícios.
    const ids = participantesOrdenados.map((p) => String(p.time_id));
    const bracket = _gerarBracketPC(ids);
    const rodadaIndex = rodadaLiga - 1; // rodadaLiga é 1-indexed
    if (rodadaIndex >= bracket.length) return null;

    const confronto = bracket[rodadaIndex].find(
        (j) => j.a === meuTimeId || j.b === meuTimeId,
    );
    if (!confronto) return null;

    const oponenteId = confronto.a === meuTimeId ? confronto.b : confronto.a;
    if (oponenteId === null) return null; // BYE — time folga nesta rodada

    const oponente = participantesOrdenados.find(
        (p) => String(p.time_id) === oponenteId,
    );
    if (!oponente) return null;

    const pontuacaoOponenteObj = todasPontuacoes.find(
        (p) => String(p.timeId) === String(oponente.time_id),
    );

    // ✅ v8.8.0 FIX: Se oponente não tem dados na rodada, rodada incompleta - não calcular PC
    // Antes: usava 0 pontos → time sempre "ganhava" por WO em rodadas não disputadas
    if (!pontuacaoOponenteObj) {
        return null;
    }
    const pontuacaoOponente = pontuacaoOponenteObj.pontos;

    // ✅ A7 FIX: Valores configuráveis por liga — fallback para padrões se não configurados
    const pcConfig = liga.configuracoes?.pontos_corridos || {};
    const THRESHOLD_EMPATE  = pcConfig.thresholdEmpate  ?? 0.3;
    const THRESHOLD_GOLEADA = pcConfig.thresholdGoleada ?? 50;
    const VALOR_EMPATE      = pcConfig.valorEmpate      ?? 3.0;
    const VALOR_VITORIA     = pcConfig.valorVitoria     ?? 5.0;
    const BONUS_GOLEADA     = pcConfig.bonusGoleada     ?? 2.0;

    const diferenca = Math.abs(pontuacaoTime - pontuacaoOponente);
    let valor = 0;
    let descricao = "";

    // Empate: diferença ≤ THRESHOLD_EMPATE
    if (diferenca <= THRESHOLD_EMPATE) {
        valor = VALOR_EMPATE;
        descricao = `Empate PC vs ${oponente.nome_time}`;
    }
    // Vitória
    else if (pontuacaoTime > pontuacaoOponente) {
        // Goleada: diferença ≥ THRESHOLD_GOLEADA
        if (diferenca >= THRESHOLD_GOLEADA) {
            valor = VALOR_VITORIA + BONUS_GOLEADA;
            descricao = `Vitória Goleada PC vs ${oponente.nome_time}`;
        } else {
            valor = VALOR_VITORIA;
            descricao = `Vitória PC vs ${oponente.nome_time}`;
        }
    }
    // Derrota
    else {
        // Goleada sofrida
        if (diferenca >= THRESHOLD_GOLEADA) {
            valor = -(VALOR_VITORIA + BONUS_GOLEADA);
            descricao = `Derrota Goleada PC vs ${oponente.nome_time}`;
        } else {
            valor = -VALOR_VITORIA;
            descricao = `Derrota PC vs ${oponente.nome_time}`;
        }
    }

    return { valor, descricao, oponente: oponente.nome_time };
}

// ============================================================================
// 🥊 MATA-MATA (via módulo mata-mata-backend.js)
// ============================================================================

// ✅ v7.2: MATA-MATA é calculado via getResultadosMataMataCompleto() em getExtratoFinanceiro()
// Não há mais função por rodada - cálculo é feito historicamente (mesmo padrão TOP10)

// ============================================================================
// 🎯 CÁLCULO PRINCIPAL DE UMA RODADA
// ============================================================================

async function calcularFinanceiroDaRodada(
    liga,
    timeId,
    rodadaNumero,
    rodadaAtual,
    temporada,
) {
    const transacoes = [];
    let saldoRodada = 0;
    const ligaId = liga._id;

    // Buscar pontuações da rodada
    // ✅ v8.7.0 FIX: Filtrar por temporada para não misturar 2025 + 2026
    const queryRodada = {
        ligaId: ligaId,
        rodada: rodadaNumero,
    };
    if (temporada) queryRodada.temporada = temporada;

    const pontuacoes = await Rodada.find(queryRodada)
        .select("timeId pontos nome_time nome_cartola").lean();

    const minhaPontuacaoObj = pontuacoes.find(
        (p) => String(p.timeId) === String(timeId),
    );
    // ✅ v8.19.0 FIX: SEMPRE criar transação para garantir que rodada aparece no extrato
    // Antes: retornava vazio → rodada era pulada permanentemente no cache
    // Agora: cria transação NEUTRO para manter continuidade do extrato
    if (!minhaPontuacaoObj) {
        transacoes.push({
            rodada: rodadaNumero,
            tipo: "NEUTRO",
            descricao: `Banco R${rodadaNumero}: Sem participação`,
            valor: 0,
            posicao: null,
            data: new Date(),
        });
        return { transacoes, saldo: 0 };
    }

    const meusPontos = minhaPontuacaoObj.pontos;

    // 1. BANCO (BÔNUS/ÔNUS)
    // ✅ v8.0: Verifica via configuracoes ou modulos_ativos
    if (liga.modulos_ativos?.banco !== false) {
        const resultadoBanco = calcularBanco(
            liga, // ✅ v8.0: Passa liga ao invés de ligaId
            timeId,
            rodadaNumero,
            pontuacoes,
        );
        if (resultadoBanco) {
            transacoes.push({
                rodada: rodadaNumero,
                tipo: resultadoBanco.valor > 0 ? "BONUS" : resultadoBanco.valor < 0 ? "ONUS" : "NEUTRO",
                descricao: resultadoBanco.descricao,
                valor: resultadoBanco.valor,
                posicao: resultadoBanco.posicao,
                data: new Date(),
            });
            saldoRodada += resultadoBanco.valor;
        }
    }

    // 2. TOP10 (MITO/MICO)
    // ✅ v7.0: TOP10 é calculado SEPARADAMENTE (ranking histórico)
    // NÃO calcular por rodada! Ver calcularTop10Historico()

    // 3. PONTOS CORRIDOS
    // ✅ v8.0: Usa isModuloHabilitado ao invés de hardcoded ID
    if (isModuloHabilitado(liga, 'pontos_corridos')) { // ✅ C6 FIX
        const resultadoPC = await calcularConfrontoPontosCorridos(
            liga,
            timeId,
            rodadaNumero,
            meusPontos,
            pontuacoes,
        );
        if (resultadoPC) {
            transacoes.push({
                rodada: rodadaNumero,
                tipo: "PONTOS_CORRIDOS",
                descricao: resultadoPC.descricao,
                valor: resultadoPC.valor,
                data: new Date(),
            });
            saldoRodada += resultadoPC.valor;
        }
    }

    // 4. MATA-MATA
    // ✅ v7.2: MATA-MATA é calculado SEPARADAMENTE (histórico completo)
    // NÃO calcular por rodada! Ver cálculo histórico em getExtratoFinanceiro()

    return { transacoes, saldo: saldoRodada };
}

// ============================================================================
// 🎮 CONTROLLERS EXPORTADOS
// ============================================================================

export const getExtratoFinanceiro = async (req, res) => {
    try {
        const { ligaId, timeId } = req.params;
        const forcarRecalculo = req.query.refresh === "true";

        // ✅ v8.3.0 FIX: Aceitar temporada via query param para fluxo de renovação
        // Durante pré-temporada (renovação), default é getFinancialSeason() (2025)
        // Mas permite ?temporada=2026 para ver extrato da nova temporada
        const temporadaSolicitada = req.query.temporada ? parseInt(req.query.temporada) : null;
        const temporadaAtual = temporadaSolicitada || getFinancialSeason();

        logger.log(
            `[FLUXO-CONTROLLER] Extrato time ${timeId} | temporada=${temporadaAtual} | refresh=${forcarRecalculo}`,
        );

        const statusMercado = await getStatusMercadoInterno();
        const rodadaAtualCartola = statusMercado.rodada_atual;
        const mercadoAberto = statusMercado.status_mercado === 1;
        // ✅ v8.13.0: Flag que indica se dados do mercado vieram do fallback (API indisponível)
        const usouFallback = statusMercado._fallback === true;
        // ✅ v8.15.0: Distinguir fallback DB (confiável) de fallback hardcoded (rodada=0)
        // Fallback DB permite cálculo de rodadas (Banco, PC) mas bloqueia Mata-Mata/TOP10
        const fallbackConfiavel = usouFallback && statusMercado._fallbackSource === 'db';

        const limiteConsolidacaoBase = mercadoAberto
            ? rodadaAtualCartola - 1
            : rodadaAtualCartola;

        // ✅ v8.8.0 FIX: Validar que a rodada-limite realmente tem dados na collection Rodada
        // Quando status_mercado === 2 (mercado fechado), rodadaAtualCartola pode ser uma rodada
        // que ainda não foi disputada. Verificar se existem dados reais antes de consolidar.
        let limiteConsolidacao = limiteConsolidacaoBase;
        if (!mercadoAberto && limiteConsolidacao > 0) {
            const countRodadaLimite = await Rodada.countDocuments({
                ligaId: ligaId,
                rodada: limiteConsolidacao,
                temporada: temporadaAtual,
            });
            if (countRodadaLimite === 0) {
                limiteConsolidacao = limiteConsolidacao - 1;
                logger.log(
                    `[FLUXO-CONTROLLER] ⚠️ R${limiteConsolidacaoBase} sem dados na collection Rodada, ajustando limite para R${limiteConsolidacao}`,
                );
            }
        }

        // ✅ v8.2.0 FIX: Buscar ou criar cache COM TEMPORADA (evita duplicados)
        // ✅ v8.3.0: Usa temporadaAtual dinâmica (pode ser 2025 ou 2026)

        let cache = await ExtratoFinanceiroCache.findOne({
            liga_id: ligaId,
            time_id: timeId,
            temporada: temporadaAtual,
        });

        // ✅ v8.11.0 FIX: Preservar entradas R0 (INSCRICAO_TEMPORADA, SALDO_TEMPORADA_ANTERIOR)
        // ao recriar cache durante auto-healing ou recálculo forçado
        let r0Preservadas = [];
        let saldoR0Preservado = 0;

        if (forcarRecalculo && cache) {
            // ✅ v8.19.0: NÃO preservar R0 em refresh forçado — InscricaoTemporada recria corretamente
            // Bug anterior: R0 preservadas mantinham inscrição calculada com fonte legacy (pagouInscricao)
            // Fix: limpar cache completamente, deixar o novo código recriar R0 a partir de InscricaoTemporada
            await ExtratoFinanceiroCache.deleteOne({ _id: cache._id });
            cache = null;
            r0Preservadas = [];
            saldoR0Preservado = 0;
            logger.log(`[FLUXO-CONTROLLER] Cache limpo para recálculo completo (R0 será recriado via InscricaoTemporada)`);
        }

        // ✅ v8.8.0 FIX: Auto-healing - se cache consolidou além do limite validado,
        // pode conter dados incorretos de rodadas não finalizadas. Forçar recálculo.
        // ✅ v8.14.0 FIX CRÍTICO: NUNCA acionar auto-healing com dados de fallback!
        // Quando getStatusMercadoInterno() falha (cold start pós-republish), retorna
        // rodada_atual=0 → limiteConsolidacao=0 → cache.ultima_rodada_consolidada(3) > 0
        // → auto-healing falsamente acionado → CACHE DESTRUÍDO → extrato zerado.
        // A flag usouFallback já existe (definida acima) e deve blindar este bloco.
        if (cache && cache.ultima_rodada_consolidada > limiteConsolidacao && !usouFallback) {
            logger.log(
                `[FLUXO-CONTROLLER] ⚠️ Auto-healing: cache consolidado até R${cache.ultima_rodada_consolidada} > limite R${limiteConsolidacao} - forçando recálculo`,
            );
            // Extrair R0 antes de deletar
            if (r0Preservadas.length === 0) {
                r0Preservadas = (cache.historico_transacoes || []).filter(t =>
                    t.rodada === 0 || t.tipo === "INSCRICAO_TEMPORADA" ||
                    t.tipo === "SALDO_TEMPORADA_ANTERIOR" || t.tipo === "LEGADO_ANTERIOR"
                );
                saldoR0Preservado = r0Preservadas.reduce((acc, t) => acc + (t.valor || 0), 0);
            }
            await ExtratoFinanceiroCache.deleteOne({ _id: cache._id });
            cache = null;
        }

        if (!cache) {
            cache = new ExtratoFinanceiroCache({
                liga_id: ligaId,
                time_id: timeId,
                temporada: temporadaAtual,
                ultima_rodada_consolidada: 0,
                saldo_consolidado: saldoR0Preservado,
                historico_transacoes: r0Preservadas,
            });
            if (r0Preservadas.length > 0) {
                logger.log(`[FLUXO-CONTROLLER] ✅ R0 restauradas: ${r0Preservadas.length} entradas (saldo R0: R$ ${saldoR0Preservado})`);
            }
        }

        const liga = await Liga.findById(ligaId).lean();
        if (!liga)
            return res.status(404).json({ error: "Liga não encontrada" });

        // ✅ v8.9.0 FIX CRÍTICO: AUTO-HEALING - Detectar módulos faltantes no cache
        // Bug: Cache criado antes de módulo ser habilitado não recalcula rodadas consolidadas
        // Solução: Detectar módulos habilitados mas ausentes no cache e forçar recálculo
        if (cache && cache.ultima_rodada_consolidada > 0 && !forcarRecalculo) {
            const modulosFaltantes = detectarModulosFaltantesNoCache(cache, liga, limiteConsolidacao);

            if (modulosFaltantes.length > 0) {
                logger.log(
                    `[FLUXO-CONTROLLER] 🔧 AUTO-HEALING: Módulos faltantes detectados (${modulosFaltantes.join(', ')}) - invalidando cache...`
                );
                logger.log(
                    `[FLUXO-CONTROLLER] Cache tinha ${cache.historico_transacoes?.length || 0} transações até R${cache.ultima_rodada_consolidada}`
                );

                // ✅ v8.11.0 FIX: Preservar R0 ao invalidar cache por módulos faltantes
                const r0DoCache = (cache.historico_transacoes || []).filter(t =>
                    t.rodada === 0 || t.tipo === "INSCRICAO_TEMPORADA" ||
                    t.tipo === "SALDO_TEMPORADA_ANTERIOR" || t.tipo === "LEGADO_ANTERIOR"
                );
                const saldoR0DoCache = r0DoCache.reduce((acc, t) => acc + (t.valor || 0), 0);

                // Invalidar cache para forçar recálculo COMPLETO
                await ExtratoFinanceiroCache.deleteOne({ _id: cache._id });
                cache = new ExtratoFinanceiroCache({
                    liga_id: ligaId,
                    time_id: timeId,
                    temporada: temporadaAtual,
                    ultima_rodada_consolidada: 0,
                    saldo_consolidado: saldoR0DoCache,
                    historico_transacoes: r0DoCache,
                });

                logger.log(
                    `[FLUXO-CONTROLLER] ✅ Cache invalidado - recálculo completo será executado (${r0DoCache.length} R0 preservadas)`
                );
            }
        }

        // Verificar se time é inativo
        const participante = liga.participantes.find(
            (p) => String(p.time_id) === String(timeId),
        );
        const isInativo = participante?.ativo === false;
        const rodadaDesistencia = participante?.rodada_desistencia;

        // Limitar rodada para inativos
        let rodadaLimite = limiteConsolidacao;
        if (isInativo && rodadaDesistencia) {
            rodadaLimite = Math.min(limiteConsolidacao, rodadaDesistencia - 1);
            logger.log(
                `[FLUXO-CONTROLLER] Inativo: limitando até R${rodadaLimite}`,
            );
        }

        // ✅ v8.4.0: Verificar se é temporada FUTURA (ainda não começou)
        // Durante pré-temporada (status='preparando'), getFinancialSeason() retorna temporada anterior
        // Se temporadaAtual > getFinancialSeason(), significa que estamos consultando uma temporada futura
        const temporadaFinanceira = getFinancialSeason();
        const isTemporadaFutura = temporadaAtual > temporadaFinanceira;

        if (isTemporadaFutura) {
            logger.log(
                `[FLUXO-CONTROLLER] ⚠️ Temporada FUTURA (${temporadaAtual} > ${temporadaFinanceira}) - NÃO calcular rodadas`
            );
        }

        // Calcular rodadas pendentes
        // ✅ v8.4.0: BLOQUEAR cálculo de rodadas para temporadas futuras
        let novasTransacoes = [];
        let novoSaldo = 0;
        let cacheModificado = false;

        // ✅ v8.15.0: Permitir cálculo de rodadas com fallback DB (confiável)
        // Bloqueia apenas quando fallback é hardcoded (rodada=0, sem dados confiáveis)
        const podeCalcularRodadas = !isTemporadaFutura && (!usouFallback || fallbackConfiavel);
        if (podeCalcularRodadas && cache.ultima_rodada_consolidada < rodadaLimite) {
            logger.log(
                `[FLUXO-CONTROLLER] Calculando R${cache.ultima_rodada_consolidada + 1} → R${rodadaLimite}`,
            );

            for (
                let r = cache.ultima_rodada_consolidada + 1;
                r <= rodadaLimite;
                r++
            ) {
                const resultado = await calcularFinanceiroDaRodada(
                    liga,
                    timeId,
                    r,
                    rodadaAtualCartola,
                    temporadaAtual,
                );

                if (resultado.transacoes.length > 0) {
                    novasTransacoes.push(...resultado.transacoes);
                    novoSaldo += resultado.saldo;
                    cacheModificado = true;
                }
            }
        }

        // ✅ v8.0: Calcular TOP10 histórico (separado do loop de rodadas)
        // ✅ v8.4.0: Só calcular se NÃO for temporada futura
        // ✅ v8.18.0 FIX: SEMPRE recalcular TOP10 (remover guard temTop10NoCache)
        // Mesmo bug corrigido no Mata-Mata v8.12.0:
        // Transações MITO/MICO ficavam congeladas no cache quando participante
        // saía do Top10 (alguém fez pontuação maior/menor).
        const top10Habilitado = isModuloHabilitado(liga, 'top10'); // ✅ C6 FIX: === true já verificado internamente
        if (top10Habilitado && !isTemporadaFutura && !usouFallback) {
            // Sempre remover transações de TOP10 antigas para recalcular com dados frescos
            const top10Antigas = cache.historico_transacoes.filter(
                t => t.tipo === "MITO" || t.tipo === "MICO"
            );
            if (top10Antigas.length > 0) {
                // Descontar saldo das transações antigas antes de recalcular
                const saldoTop10Antigo = top10Antigas.reduce((acc, t) => acc + (t.valor || 0), 0);
                cache.saldo_consolidado -= saldoTop10Antigo;
                cache.historico_transacoes = cache.historico_transacoes.filter(
                    (t) => t.tipo !== "MITO" && t.tipo !== "MICO"
                );
                cacheModificado = true;
                logger.log(`[FLUXO-CONTROLLER] TOP10: ${top10Antigas.length} transações antigas removidas (saldo ajustado: -${saldoTop10Antigo})`);
            }

            logger.log(`[FLUXO-CONTROLLER] Calculando TOP10 histórico para time ${timeId}`);

            // ✅ v8.6: Passa temporada para filtrar cache correto
            const transacoesTop10 = await calcularTop10Historico(liga, timeId, temporadaAtual);
            if (transacoesTop10.length > 0) {
                novasTransacoes.push(...transacoesTop10);
                transacoesTop10.forEach((t) => (novoSaldo += t.valor));
                cacheModificado = true;
                logger.log(
                    `[FLUXO-CONTROLLER] TOP10 histórico: ${transacoesTop10.length} transações`
                );
            }
        }

        // ✅ v8.0: Calcular MATA-MATA histórico (separado do loop de rodadas)
        // Usa isModuloHabilitado ao invés de hardcoded ID
        // ✅ v8.4.0: Só calcular se NÃO for temporada futura
        // ✅ v8.12.0 FIX: SEMPRE recalcular MATA_MATA (remover guard temMataMataNcache)
        // Bug anterior: transações de participantes não classificados ficavam eternamente
        // congeladas no cache porque o guard impedia recálculo. Agora sempre recalcula
        // com dados frescos do bracket real (cross-validação v1.3 no backend).
        // ✅ v8.13.0 FIX: NÃO calcular quando API Cartola está indisponível (fallback)
        // Bug anterior: fallback rodada_atual:38 fazia calcular MM com rankings de outra
        // temporada, gerando cobranças indevidas no cache.
        const mataHabilitado = isModuloHabilitado(liga, 'mata_mata'); // ✅ C6 FIX
        if (mataHabilitado && !isTemporadaFutura && !usouFallback) {
            // ✅ v8.20.0 FIX: Remover tanto transações legacy (tipo=MATA_MATA) quanto
            // resetar o campo mataMata nos summaries consolidados (tipo=undefined)
            let saldoMMantigo = 0;
            const mmAntigas = cache.historico_transacoes.filter(t => t.tipo === "MATA_MATA");
            if (mmAntigas.length > 0) {
                saldoMMantigo += mmAntigas.reduce((acc, t) => acc + (t.valor || 0), 0);
                cache.historico_transacoes = cache.historico_transacoes.filter(
                    (t) => t.tipo !== "MATA_MATA"
                );
                cacheModificado = true;
                logger.log(`[FLUXO-CONTROLLER] MATA-MATA: ${mmAntigas.length} transações legacy removidas`);
            }
            // Resetar mataMata em summaries consolidados (formato 2026+)
            cache.historico_transacoes.forEach(r => {
                if (r.tipo === undefined && (r.mataMata || 0) !== 0) {
                    saldoMMantigo += r.mataMata;
                    r.saldo = (r.saldo || 0) - r.mataMata;
                    r.mataMata = 0;
                    cacheModificado = true;
                }
            });
            if (saldoMMantigo !== 0) {
                cache.saldo_consolidado -= saldoMMantigo;
            }

            logger.log(`[FLUXO-CONTROLLER] Calculando MATA-MATA histórico para time ${timeId}`);

            // ✅ v8.15.0: Usar cache in-memory por liga (evita recalcular para cada participante)
            const resultadosMM = await getResultadosMataMataComCache(ligaId, rodadaAtualCartola + 1);

            // Filtrar apenas resultados deste time E dentro do limite de rodadas
            // ✅ v8.8.0 FIX: rodadaPontos é a rodada do Brasileirão onde a fase é calculada
            // Não incluir resultados de rodadas além do limiteConsolidacao (ainda não disputadas)
            const transacoesMM = resultadosMM
                .filter((r) => String(r.timeId) === String(timeId))
                .filter((r) => r.rodadaPontos <= rodadaLimite)
                .map((r) => {
                    const faseLabel = {
                        primeira: "1ª Fase",
                        oitavas: "Oitavas",
                        quartas: "Quartas",
                        semis: "Semis",
                        final: "Final",
                    }[r.fase] || r.fase;

                    return {
                        rodada: r.rodadaPontos,
                        tipo: "MATA_MATA",
                        descricao: `${r.valor > 0 ? "Vitória" : "Derrota"} M-M ${faseLabel}`,
                        valor: r.valor,
                        fase: r.fase,
                        edicao: r.edicao,
                        data: new Date(),
                    };
                });

            if (transacoesMM.length > 0) {
                // ✅ v8.20.0 FIX: Atualizar summary consolidado in-place (se existir)
                // ao invés de sempre adicionar como transação legacy
                transacoesMM.forEach((t) => {
                    novoSaldo += t.valor;
                    const rodadaSummary = cache.historico_transacoes.find(
                        r => r.tipo === undefined && r.rodada === t.rodada
                    );
                    if (rodadaSummary) {
                        rodadaSummary.mataMata = (rodadaSummary.mataMata || 0) + t.valor;
                        rodadaSummary.saldo = (rodadaSummary.saldo || 0) + t.valor;
                    } else {
                        novasTransacoes.push(t);
                    }
                });
                cacheModificado = true;
                logger.log(
                    `[FLUXO-CONTROLLER] MATA-MATA histórico: ${transacoesMM.length} transações`
                );
            }
        }

        // ✅ v8.19.0 FIX CRÍTICO: Usar InscricaoTemporada como fonte canônica (alinhado com tesourariaController)
        // Bug anterior (v8.10-v8.18): usava liga.participantes[].pagouInscricao (legacy, dessincronizado)
        // Consequência: extrato individual divergia da tesouraria (ex: +R$66 vs -R$114 = R$180 de taxa)
        // Fix: query InscricaoTemporada + gerar SALDO_TEMPORADA_ANTERIOR + divida_anterior
        // Referência canônica: utils/saldo-calculator.js aplicarAjusteInscricaoBulk()
        const inscricaoData = await InscricaoTemporada.buscarPorParticipante(ligaId, timeId, temporadaAtual);

        const inscricaoJaEmCache = (cache.historico_transacoes || []).some(
            t => t.tipo === "INSCRICAO_TEMPORADA"
        );
        const saldoAnteriorJaEmCache = (cache.historico_transacoes || []).some(
            t => t.tipo === "SALDO_TEMPORADA_ANTERIOR"
        );
        const isOwnerPremium = participante?.premium === true && !!liga.owner_email;

        let transacoesInscricao = [];
        const saldoInscricao = 0; // sempre 0: inscrição vai para novasTransacoes (não separada)

        if (isOwnerPremium) {
            logger.log(`[FLUXO-CONTROLLER] 👑 Owner/premium isento de inscrição (${participante.nome_cartola})`);
        }

        if (inscricaoData && !isOwnerPremium) {
            const pagouInscricao = inscricaoData.pagou_inscricao === true;
            const taxaInscricao = inscricaoData.taxa_inscricao || 0;
            const saldoTransferido = inscricaoData.saldo_transferido || 0;
            const dividaAnterior = inscricaoData.divida_anterior || 0;

            // 1) Taxa de inscrição (débito)
            // ✅ v8.21.0 FIX SINCRONIA: SEMPRE deduzir taxa (alinhado com saldo-calculator.js:174)
            // Antes: só deduzia se !pagouInscricao → divergência de até R$180 vs tesouraria
            // Agora: sempre deduz. Quando paga via AcertoFinanceiro, o +taxa cancela (net=0).
            // Quando paga via saldo_transferido, o crédito cobre o débito.
            if (taxaInscricao > 0 && !inscricaoJaEmCache) {
                const inscricaoTx = {
                    rodada: 0,
                    tipo: "INSCRICAO_TEMPORADA",
                    descricao: `Taxa de inscrição ${temporadaAtual}`,
                    valor: -taxaInscricao,
                    data: new Date(`${temporadaAtual}-01-01T00:00:00Z`),
                };
                novasTransacoes.unshift(inscricaoTx);
                novoSaldo -= taxaInscricao;
                cacheModificado = true;
                logger.log(`[FLUXO-CONTROLLER] ✅ Inscrição ${temporadaAtual}: R$ ${-taxaInscricao} (fonte: InscricaoTemporada, pagou: ${pagouInscricao})`);
            } else if (inscricaoJaEmCache) {
                logger.log(`[FLUXO-CONTROLLER] Inscrição ${temporadaAtual}: já no cache R0 (não duplicar)`);
            }

            // 2) Saldo transferido da temporada anterior (crédito ou débito)
            if (saldoTransferido !== 0 && !saldoAnteriorJaEmCache) {
                const saldoTx = {
                    rodada: 0,
                    tipo: "SALDO_TEMPORADA_ANTERIOR",
                    descricao: `Saldo transferido temporada ${temporadaAtual - 1}`,
                    valor: saldoTransferido,
                    data: new Date(`${temporadaAtual}-01-01T00:00:00Z`),
                };
                novasTransacoes.unshift(saldoTx);
                novoSaldo += saldoTransferido;
                cacheModificado = true;
                logger.log(`[FLUXO-CONTROLLER] ✅ Saldo anterior: R$ ${saldoTransferido} (fonte: InscricaoTemporada)`);
            }

            // 3) Dívida anterior (débito adicional — espelhando saldo-calculator.js:204-217)
            // ✅ v8.21.0 FIX SINCRONIA: Deduzir SEMPRE, mesmo quando inscrição já está no cache.
            // Antes: guardava com !inscricaoJaEmCache → divida sumia quando cache tinha R0.
            // saldo-calculator.js sempre busca divida_anterior do InscricaoTemporada.
            if (dividaAnterior > 0) {
                // Verificar se divida já foi contabilizada no cache (evitar double-count)
                const dividaJaNoCache = (cache.historico_transacoes || []).some(
                    t => t.tipo === 'DIVIDA_ANTERIOR' || (t.descricao && t.descricao.includes('Dívida'))
                );
                if (!dividaJaNoCache) {
                    novoSaldo -= dividaAnterior;
                    cacheModificado = true;
                    logger.log(`[FLUXO-CONTROLLER] ✅ Dívida anterior: R$ ${-dividaAnterior}`);
                } else {
                    logger.log(`[FLUXO-CONTROLLER] Dívida anterior: já no cache (não duplicar)`);
                }
            }
        } else if (!inscricaoData && !isOwnerPremium) {
            // Fallback: sem InscricaoTemporada (ligas legacy sem renovação)
            const ligaRulesData = await LigaRules.buscarPorLiga(ligaId, temporadaAtual);
            const valorInscricao = ligaRulesData?.inscricao?.taxa
                ?? liga.parametros_financeiros?.inscricao ?? 0;
            const pagouInscricao = participante?.pagouInscricao === true;

            if (valorInscricao > 0 && !pagouInscricao && !inscricaoJaEmCache) {
                const inscricaoTx = {
                    rodada: 0,
                    tipo: "INSCRICAO_TEMPORADA",
                    descricao: `Taxa de inscrição ${temporadaAtual}`,
                    valor: -valorInscricao,
                    data: new Date(`${temporadaAtual}-01-01T00:00:00Z`),
                };
                novasTransacoes.unshift(inscricaoTx);
                novoSaldo -= valorInscricao;
                cacheModificado = true;
                logger.log(`[FLUXO-CONTROLLER] ✅ Inscrição ${temporadaAtual}: R$ ${-valorInscricao} (fallback LigaRules, pagou: ${pagouInscricao})`);
            }
        }

        // Atualizar cache
        if (cacheModificado) {
            cache.historico_transacoes.push(...novasTransacoes);
            cache.saldo_consolidado += novoSaldo;

            // ✅ v8.21.0 FIX SINCRONIA: Usar (t.valor ?? t.saldo) para suportar formato consolidado
            // Transações consolidadas (tipo=undefined) têm bonusOnus/pontosCorridos mas t.valor pode ser undefined.
            // O campo t.saldo contém o valor líquido da rodada. Alinhado com extratoFinanceiroCacheController.
            cache.ganhos_consolidados = cache.historico_transacoes
                .filter((t) => (t.valor ?? t.saldo ?? 0) > 0)
                .reduce((acc, t) => acc + (t.valor ?? t.saldo ?? 0), 0);

            cache.perdas_consolidadas = cache.historico_transacoes
                .filter((t) => (t.valor ?? t.saldo ?? 0) < 0)
                .reduce((acc, t) => acc + (t.valor ?? t.saldo ?? 0), 0);

            cache.ultima_rodada_consolidada = rodadaLimite;
            cache.data_ultima_atualizacao = new Date();

            await cache.save();
            logger.log(
                `[FLUXO-CONTROLLER] Cache atualizado: ${cache.historico_transacoes.length} transações`,
            );
        } else if (!isTemporadaFutura && cache.ultima_rodada_consolidada < rodadaLimite) {
            // ✅ v8.8.0 FIX: Atualizar rodada consolidada mesmo sem transações novas
            // Evita recálculo desnecessário em requisições futuras (zona neutra)
            cache.ultima_rodada_consolidada = rodadaLimite;
            cache.data_ultima_atualizacao = new Date();
            await cache.save();
        }

        // ✅ v8.4.0: Para temporada 2026+, usar Ajustes. Para anteriores, usar campos manuais
        let saldoCampos = 0;
        let transacoesCampos = [];

        if (temporadaAtual >= 2026) {
            // ✅ v8.4.0: AJUSTES DINÂMICOS (substituem campos manuais em 2026+)
            const ajustes = await AjusteFinanceiro.listarPorParticipante(ligaId, timeId, temporadaAtual);
            const totaisAjustes = await AjusteFinanceiro.calcularTotal(ligaId, timeId, temporadaAtual);

            saldoCampos = totaisAjustes.total || 0;

            if (ajustes && ajustes.length > 0) {
                transacoesCampos = ajustes.map(a => ({
                    rodada: null,
                    tipo: "AJUSTE",
                    descricao: a.descricao,
                    valor: a.valor,
                    data: a.criado_em,
                    _id: a._id,
                }));
                logger.log(`[FLUXO-CONTROLLER] Ajustes 2026+: ${ajustes.length} transações, total R$ ${saldoCampos}`);
            }
        } else {
            // Campos manuais (temporadas anteriores a 2026)
            // ✅ v8.3.0 FIX: Incluir temporada na query (evita mistura de dados entre temporadas)
            // ✅ v8.17.0 FIX: Usar liga_id/time_id (snake_case após migração G3)
            const camposManuais = await FluxoFinanceiroCampos.findOne({
                liga_id: String(ligaId),
                time_id: Number(timeId),
                temporada: temporadaAtual,
            }).lean();

            if (camposManuais?.campos) {
                camposManuais.campos.forEach((campo) => {
                    if (campo.valor !== 0) {
                        saldoCampos += campo.valor;
                        transacoesCampos.push({
                            rodada: null,
                            tipo: "AJUSTE_MANUAL",
                            descricao: campo.nome,
                            valor: campo.valor,
                            data: camposManuais.atualizado_em, // ✅ H5 FIX: FluxoFinanceiroCampos remapeia updatedAt → atualizado_em
                        });
                    }
                });
            }
        }

        // ✅ v7.4: Buscar acertos financeiros (pagamentos/recebimentos em tempo real)
        // ✅ v8.3.0 FIX: Usar temporadaAtual ao invés de hardcoded "2025"
        const acertosInfo = await AcertoFinanceiro.calcularSaldoAcertos(ligaId, timeId, temporadaAtual);
        const acertos = await AcertoFinanceiro.buscarPorTime(ligaId, timeId, temporadaAtual);
        let transacoesAcertos = [];

        if (acertos && acertos.length > 0) {
            // ✅ v7.5: CORREÇÃO - Pagamento AUMENTA saldo (quita dívida)
            // PAGAMENTO → valor positivo (participante pagou, saldo aumenta)
            // RECEBIMENTO → valor negativo (participante recebeu, saldo diminui)
            transacoesAcertos = acertos.map(a => ({
                rodada: null,
                tipo: "ACERTO_FINANCEIRO",
                subtipo: a.tipo, // 'pagamento' ou 'recebimento'
                descricao: a.descricao,
                valor: a.tipo === "pagamento" ? a.valor : -a.valor,
                data: a.dataAcerto,
                metodoPagamento: a.metodoPagamento,
            }));
            logger.log(`[FLUXO-CONTROLLER] Acertos financeiros: ${acertos.length} transações`);
        }

        // Saldo da temporada (inscrição já contabilizada em cache.saldo_consolidado via novasTransacoes)
        const saldoTemporada = cache.saldo_consolidado + saldoCampos + saldoInscricao;

        // Saldo total (temporada + inscrição + acertos)
        // acertosInfo.saldoAcertos: recebido - pago (pagamentos aumentam saldo)
        const saldoTotal = saldoTemporada + acertosInfo.saldoAcertos;

        const todasTransacoes = [
            ...transacoesInscricao,     // ✅ v8.10.0: Inscrição primeiro (lançamento inicial)
            ...cache.historico_transacoes,
            ...transacoesCampos,
            ...transacoesAcertos,
        ].sort((a, b) => {
            // Ordenar por data (mais recente primeiro), rodadas antes de acertos
            const rodadaA = a.rodada || 0;
            const rodadaB = b.rodada || 0;
            if (rodadaA !== rodadaB) return rodadaB - rodadaA;
            // Se mesma rodada (ou null), ordenar por data
            const dataA = new Date(a.data || 0).getTime();
            const dataB = new Date(b.data || 0).getTime();
            return dataB - dataA;
        });

        // ✅ v8.20.0: Injetar dados parciais (rodada em andamento) se mercado fechado
        let rodadaParcial = null;
        const mercadoFechado = statusMercado.status_mercado === 2;
        if (mercadoFechado && !usouFallback && !isInativo) {
            try {
                const rankingParcial = await buscarRankingParcial(ligaId);
                if (rankingParcial?.disponivel) {
                    const meuRanking = rankingParcial.ranking.find(
                        r => String(r.timeId) === String(timeId)
                    );
                    if (meuRanking) {
                        // Calcular impacto financeiro projetado
                        const pontuacoes = rankingParcial.ranking.map(r => ({
                            timeId: r.timeId,
                            pontos: r.pontos_rodada_atual,
                            nome_time: r.nome_time,
                            nome_cartola: r.nome_cartola,
                        }));
                        const resultadoBanco = calcularBanco(liga, timeId, rankingParcial.rodada, pontuacoes);
                        let resultadoPC = null;
                        const pcHabilitado = isModuloHabilitado(liga, 'pontos_corridos') || liga.modulos_ativos?.pontosCorridos;
                        if (pcHabilitado) {
                            resultadoPC = await calcularConfrontoPontosCorridos(
                                liga, timeId, rankingParcial.rodada,
                                meuRanking.pontos_rodada_atual, pontuacoes,
                            );
                        }
                        const impactoBanco = resultadoBanco?.valor || 0;
                        const impactoPC = resultadoPC?.valor || 0;

                        rodadaParcial = {
                            rodada: rankingParcial.rodada,
                            status: 'ao_vivo',
                            pontos_parciais: meuRanking.pontos_rodada_atual,
                            posicao_parcial: meuRanking.posicao,
                            total_times: rankingParcial.total_times,
                            banco: { valor: impactoBanco, descricao: resultadoBanco?.descricao || '', posicao: resultadoBanco?.posicao },
                            pontosCorridos: resultadoPC ? { valor: impactoPC, descricao: resultadoPC.descricao || '', oponente: resultadoPC.oponente } : null,
                            impacto_projetado: impactoBanco + impactoPC,
                            saldo_projetado: saldoTotal + impactoBanco + impactoPC,
                            atualizado_em: rankingParcial.atualizado_em,
                        };
                        logger.log(`[FLUXO-CONTROLLER] ⚽ Parcial R${rankingParcial.rodada}: ${meuRanking.pontos_rodada_atual}pts, impacto R$ ${(impactoBanco + impactoPC).toFixed(2)}`);
                    }
                }
            } catch (parcialError) {
                logger.warn(`[FLUXO-CONTROLLER] ⚠️ Parciais indisponíveis: ${parcialError.message}`);
            }
        }

        res.json({
            success: true,
            saldo_atual: saldoTotal,
            saldo_final: saldoTotal,         // C5: alias canônico (= saldo_atual)
            saldo_temporada: saldoTemporada,
            saldo_acertos: acertosInfo.saldoAcertos,
            situacao: saldoTotal < -0.01 ? 'devedor' : saldoTotal > 0.01 ? 'credor' : 'quitado',
            extrato: todasTransacoes,
            acertos: {
                lista: transacoesAcertos,
                resumo: acertosInfo,
            },
            resumo: {
                ganhos:
                    (cache.ganhos_consolidados || 0) +
                    (saldoCampos > 0 ? saldoCampos : 0),
                perdas:
                    (cache.perdas_consolidadas || 0) +
                    (saldoCampos < 0 ? saldoCampos : 0),
                saldo_temporada: saldoTemporada,
                saldo_acertos: acertosInfo.saldoAcertos,
                saldo_final: saldoTotal,
                // ✅ v8.20.0: Saldo projetado incluindo parcial
                saldo_projetado: rodadaParcial ? rodadaParcial.saldo_projetado : null,
            },
            // ✅ v8.20.0: Rodada parcial ao vivo
            rodada_parcial: rodadaParcial,
            metadados: {
                atualizado_em: cache.data_ultima_atualizacao,
                rodada_consolidada: cache.ultima_rodada_consolidada,
                rodada_atual_cartola: rodadaAtualCartola,
                inativo: isInativo,
                rodada_desistencia: rodadaDesistencia,
                // ✅ v8.16.0: Indicadores de fallback para o frontend
                _fallback: usouFallback,
                _fallbackSource: statusMercado._fallbackSource || null,
                // ✅ v8.20.0: Status do mercado para o frontend
                mercado_fechado: mercadoFechado,
            },
        });
    } catch (error) {
        logger.error("[FLUXO-CONTROLLER] Erro crítico:", error);
        // ✅ v8.16.0: Erro estruturado — frontend pode distinguir tipos de falha
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            error: "Erro interno ao processar financeiro",
            tipo: error.name || 'Error',
            detalhe: isDev ? error.message : undefined,
            _erro: true,
            _retryable: error.name !== 'ValidationError',
        });
    }
};

export const getCampos = async (req, res) => {
    try {
        const { ligaId, timeId } = req.params;
        // ✅ v8.3.0 FIX: Aceitar temporada via query param, default getFinancialSeason()
        const temporadaAtual = req.query.temporada ? parseInt(req.query.temporada) : getFinancialSeason();
        let campos = await FluxoFinanceiroCampos.findOne({ liga_id: String(ligaId), time_id: Number(timeId), temporada: temporadaAtual }).lean();

        if (!campos) {
            logger.log(
                `[FLUXO-CONTROLLER] Criando campos padrão para time ${timeId} (temporada ${temporadaAtual})`,
            );
            campos = await FluxoFinanceiroCampos.create({
                liga_id: String(ligaId),
                time_id: Number(timeId),
                temporada: temporadaAtual,
                campos: [
                    { nome: "Campo 1", valor: 0 },
                    { nome: "Campo 2", valor: 0 },
                    { nome: "Campo 3", valor: 0 },
                    { nome: "Campo 4", valor: 0 },
                ],
            });
        }

        res.json({ success: true, campos: campos.campos });
    } catch (error) {
        logger.error("Erro ao buscar campos:", error);
        res.status(500).json({
            success: false,
            message: "Erro ao buscar campos editáveis",
        });
    }
};

export const salvarCampo = async (req, res) => {
    try {
        const { ligaId, timeId, campoIndex } = req.params;
        const { nome, valor, temporada } = req.body;
        const index = parseInt(campoIndex);
        // ✅ v8.3.0 FIX: Aceitar temporada via body ou query, default getFinancialSeason()
        const temporadaAtual = temporada ? parseInt(temporada) : (req.query.temporada ? parseInt(req.query.temporada) : getFinancialSeason());

        if (isNaN(index) || index < 0 || index > 3) {
            return res.status(400).json({ error: "Índice inválido" });
        }

        let documento = await FluxoFinanceiroCampos.findOne({ liga_id: String(ligaId), time_id: Number(timeId), temporada: temporadaAtual });
        if (!documento) {
            documento = new FluxoFinanceiroCampos({
                liga_id: String(ligaId),
                time_id: Number(timeId),
                temporada: temporadaAtual,
                campos: [{}, {}, {}, {}],
            });
        }

        if (nome !== undefined) documento.campos[index].nome = nome;
        if (valor !== undefined)
            documento.campos[index].valor = parseFloat(valor) || 0;

        // ✅ H5 FIX: FluxoFinanceiroCampos usa timestamps transform atualizado_em — não definir updatedAt manualmente
        await documento.save();

        // ✅ v8.1.0: Invalidar cache para recalcular saldos
        await onCamposSaved(ligaId, timeId);

        res.json(documento);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: "Erro ao salvar campo" });
    }
};

export const getCamposLiga = async (req, res) => {
    try {
        const { ligaId } = req.params;
        // ✅ v8.3.0 FIX: Aceitar temporada via query, default getFinancialSeason()
        const temporadaAtual = req.query.temporada ? parseInt(req.query.temporada) : getFinancialSeason();
        const todosCampos = await FluxoFinanceiroCampos.find({ liga_id: String(ligaId), temporada: temporadaAtual }).lean();
        res.json(todosCampos);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar campos da liga" });
    }
};

export const salvarCampos = async (req, res) => {
    // ✅ B3 FIX: era 200 mas nada era salvo — 410 Gone indica endpoint descontinuado
    res.status(410).json({ message: "Use a rota patch individual para maior precisão" });
};

/**
 * ✅ v8.5.0: PROTEÇÃO DE DADOS HISTÓRICOS
 * Só permite resetar/deletar campos da temporada ATUAL (CURRENT_SEASON)
 * Temporadas anteriores são IMUTÁVEIS (dados históricos congelados)
 */
export const resetarCampos = async (req, res) => {
    try {
        const { ligaId, timeId } = req.params;
        const temporada = Number(req.query.temporada) || CURRENT_SEASON;

        // 🔒 PROTEÇÃO: Só permite operações na temporada atual ou futura
        if (temporada < CURRENT_SEASON) {
            return res.status(403).json({
                error: `Operação bloqueada: temporada ${temporada} é histórica e imutável`,
                temporada_atual: CURRENT_SEASON
            });
        }

        await FluxoFinanceiroCampos.deleteOne({ liga_id: String(ligaId), time_id: Number(timeId), temporada });
        // C4 FIX: Invalidar cache ao resetar campos
        await onCamposSaved(ligaId, timeId, temporada);
        logger.log(`[FLUXO] Campos resetados: liga=${ligaId}, time=${timeId}, temporada=${temporada} (cache invalidado)`);
        res.json({ message: "Campos resetados com sucesso", temporada });
    } catch (error) {
        logger.error('[FLUXO] Erro ao resetar campos:', error);
        res.status(500).json({ error: "Erro ao resetar campos" });
    }
};

export const deletarCampos = async (req, res) => {
    return resetarCampos(req, res);
};

// ============================================================================
// 🔒 FUNÇÃO PARA CONSOLIDAÇÃO DE SNAPSHOTS
// ============================================================================

export const getFluxoFinanceiroLiga = async (ligaId, rodadaNumero) => {
    try {
        logger.log(
            `[FLUXO-CONSOLIDAÇÃO] Processando liga ${ligaId} até R${rodadaNumero}`,
        );

        const liga = await Liga.findById(ligaId).lean();
        if (!liga) throw new Error("Liga não encontrada");

        const financeiroPorTime = [];
        // ✅ v8.2.0 FIX: Usar temporada atual em todas as queries
        const temporadaAtual = CURRENT_SEASON;

        for (const participante of liga.participantes) {
            const timeId = participante.time_id;

            // C7 FIX: liga_id normalizado para String (sem fallback ObjectId)
            let cache = await ExtratoFinanceiroCache.findOne({
                liga_id: String(ligaId),
                time_id: timeId,
                temporada: temporadaAtual,
            });

            if (!cache) {
                cache = new ExtratoFinanceiroCache({
                    liga_id: ligaId,
                    time_id: timeId,
                    temporada: temporadaAtual,
                    ultima_rodada_consolidada: 0,
                    saldo_consolidado: 0,
                    historico_transacoes: [],
                });
            }

            if (cache.ultima_rodada_consolidada < rodadaNumero) {
                for (
                    let r = cache.ultima_rodada_consolidada + 1;
                    r <= rodadaNumero;
                    r++
                ) {
                    // rodadaNumero + 1 como rodadaAtual pois estamos consolidando até rodadaNumero
                    // ✅ v8.7.0: Passa temporada para filtrar rodadas corretamente
                    const resultado = await calcularFinanceiroDaRodada(
                        liga,
                        timeId,
                        r,
                        rodadaNumero + 1,
                        temporadaAtual,
                    );

                    if (resultado.transacoes.length > 0) {
                        cache.historico_transacoes.push(
                            ...resultado.transacoes,
                        );
                        cache.saldo_consolidado += resultado.saldo;
                    }
                }

                // ✅ v8.0: Calcular TOP10 histórico na consolidação
                const top10Habilitado = isModuloHabilitado(liga, 'top10'); // ✅ C6 FIX
                if (top10Habilitado) {
                    // ✅ FIX: Subtrair TOP10 antigos do saldo ANTES de remover do array
                    const top10Antigos = cache.historico_transacoes.filter(
                        (t) => t.tipo === "MITO" || t.tipo === "MICO"
                    );
                    top10Antigos.forEach((t) => (cache.saldo_consolidado -= t.valor));

                    // Remover TOP10 antigos do array
                    cache.historico_transacoes = cache.historico_transacoes.filter(
                        (t) => t.tipo !== "MITO" && t.tipo !== "MICO"
                    );

                    // ✅ v8.6: Passa temporada para filtrar cache correto
                    const transacoesTop10 = await calcularTop10Historico(liga, timeId, temporadaAtual);
                    if (transacoesTop10.length > 0) {
                        cache.historico_transacoes.push(...transacoesTop10);
                        transacoesTop10.forEach((t) => (cache.saldo_consolidado += t.valor));
                    }
                }

                // ✅ v8.0: Calcular MATA-MATA histórico na consolidação
                // Usa isModuloHabilitado ao invés de hardcoded ID
                // ✅ v8.12.0 FIX: SEMPRE recalcular MATA_MATA (mesma lógica do getExtratoFinanceiro)
                // ✅ v8.20.0 FIX: Atualizar summaries consolidados in-place
                const mataHabilitado = isModuloHabilitado(liga, 'mata_mata'); // ✅ C6 FIX
                if (mataHabilitado) {
                    // Remover transações legacy e resetar mataMata em summaries consolidados
                    let saldoMMantigo = 0;
                    const mmAntigas = cache.historico_transacoes.filter(t => t.tipo === "MATA_MATA");
                    if (mmAntigas.length > 0) {
                        saldoMMantigo += mmAntigas.reduce((acc, t) => acc + (t.valor || 0), 0);
                        cache.historico_transacoes = cache.historico_transacoes.filter(
                            (t) => t.tipo !== "MATA_MATA"
                        );
                    }
                    cache.historico_transacoes.forEach(r => {
                        if (r.tipo === undefined && (r.mataMata || 0) !== 0) {
                            saldoMMantigo += r.mataMata;
                            r.saldo = (r.saldo || 0) - r.mataMata;
                            r.mataMata = 0;
                        }
                    });
                    if (saldoMMantigo !== 0) {
                        cache.saldo_consolidado -= saldoMMantigo;
                    }

                    logger.log(`[FLUXO-CONSOLIDAÇÃO] Recalculando MATA-MATA histórico para time ${timeId}`);

                    // ✅ v8.15.0: Usar cache in-memory por liga
                    const resultadosMM = await getResultadosMataMataComCache(ligaId, rodadaNumero + 1);

                    // Filtrar apenas resultados deste time
                    const transacoesMM = resultadosMM
                        .filter((r) => String(r.timeId) === String(timeId))
                        .map((r) => {
                            const faseLabel = {
                                primeira: "1ª Fase",
                                oitavas: "Oitavas",
                                quartas: "Quartas",
                                semis: "Semis",
                                final: "Final",
                            }[r.fase] || r.fase;

                            return {
                                rodada: r.rodadaPontos,
                                tipo: "MATA_MATA",
                                descricao: `${r.valor > 0 ? "Vitória" : "Derrota"} M-M ${faseLabel}`,
                                valor: r.valor,
                                fase: r.fase,
                                edicao: r.edicao,
                                data: new Date(),
                            };
                        });

                    if (transacoesMM.length > 0) {
                        // Atualizar summary consolidado in-place (se existir)
                        transacoesMM.forEach((t) => {
                            const rodadaSummary = cache.historico_transacoes.find(
                                r => r.tipo === undefined && r.rodada === t.rodada
                            );
                            if (rodadaSummary) {
                                rodadaSummary.mataMata = (rodadaSummary.mataMata || 0) + t.valor;
                                rodadaSummary.saldo = (rodadaSummary.saldo || 0) + t.valor;
                                cache.saldo_consolidado += t.valor;
                            } else {
                                cache.historico_transacoes.push(t);
                                cache.saldo_consolidado += t.valor;
                            }
                        });
                        logger.log(`[FLUXO-CONSOLIDAÇÃO] ✅ MATA-MATA: ${transacoesMM.length} transações adicionadas para time ${timeId}`);
                    }
                }

                cache.ganhos_consolidados = cache.historico_transacoes
                    .filter((t) => t.valor > 0)
                    .reduce((acc, t) => acc + t.valor, 0);

                cache.perdas_consolidadas = cache.historico_transacoes
                    .filter((t) => t.valor < 0)
                    .reduce((acc, t) => acc + t.valor, 0);

                cache.ultima_rodada_consolidada = rodadaNumero;
                cache.data_ultima_atualizacao = new Date();

                await cache.save();
            }

            // ✅ A6 FIX: Incluir acertos e ajustes/campos no saldo_total
            // Antes: só cache.saldo_consolidado + saldoCampos — acertos e ajustes 2026+ ignorados
            // Snapshots e Hall da Fama mostravam saldo incompleto

            // Campos manuais (pré-2026) OU Ajustes dinâmicos (2026+) — mutuamente exclusivos (A3)
            let saldoExtras = 0;
            if (temporadaAtual >= 2026) {
                const ajustesInfo = await AjusteFinanceiro.calcularTotal(
                    String(ligaId), Number(timeId), temporadaAtual
                );
                saldoExtras = ajustesInfo?.total || 0;
            } else {
                // ✅ v8.3.0 FIX: Incluir temporada na query (segregação de dados)
                const camposManuais = await FluxoFinanceiroCampos.findOne({
                    ligaId,
                    timeId,
                    temporada: temporadaAtual,
                }).lean();
                if (camposManuais?.campos) {
                    camposManuais.campos.forEach((campo) => {
                        if (campo.valor !== 0) saldoExtras += campo.valor;
                    });
                }
            }

            // Acertos financeiros (pagamentos/recebimentos em tempo real)
            const acertosInfo = await AcertoFinanceiro.calcularSaldoAcertos(
                String(ligaId), String(timeId), temporadaAtual
            );
            const saldoAcertos = acertosInfo?.saldoAcertos || 0;

            financeiroPorTime.push({
                time_id: timeId,
                nome_time: participante.nome_time,
                nome_cartola: participante.nome_cartola,
                saldo_total: cache.saldo_consolidado + saldoExtras + saldoAcertos,
                ganhos: cache.ganhos_consolidados || 0,
                perdas: cache.perdas_consolidadas || 0,
                transacoes: cache.historico_transacoes.length,
            });
        }

        logger.log(
            `[FLUXO-CONSOLIDAÇÃO] ✅ ${financeiroPorTime.length} times processados`,
        );
        return financeiroPorTime;
    } catch (error) {
        logger.error("[FLUXO-CONSOLIDAÇÃO] ❌ Erro:", error);
        throw error;
    }
};

logger.log("[FLUXO-CONTROLLER] ✅ v8.12.0 carregado (Owner premium isento + Preservação R0)");
