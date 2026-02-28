// services/melhorMesService.js
import MelhorMesCache, {
    MELHOR_MES_EDICOES,
} from "../models/MelhorMesCache.js";
import ModuleConfig from "../models/ModuleConfig.js";
import Rodada from "../models/Rodada.js";
import ExtratoFinanceiroCache from "../models/ExtratoFinanceiroCache.js";
import mongoose from "mongoose";

const LOG_PREFIX = "[MELHOR-MES-SERVICE]";

// =====================================================================
// BUSCAR EDIÇÕES DA LIGA (CONFIG DO ADMIN OU FALLBACK HARDCODED)
// =====================================================================

/**
 * Busca configuração de edições do ModuleConfig da liga.
 * Se existir wizard_respostas.edicoes_intervalos, usa essas.
 * Senão, usa fallback MELHOR_MES_EDICOES (hardcoded).
 *
 * @param {ObjectId|string} ligaId - ID da liga
 * @param {number} temporada - Temporada
 * @returns {Promise<Array>} Array de edições no formato { id, nome, inicio, fim }
 */
async function getEdicoesConfig(ligaId, temporada) {
    try {
        const ligaObjectId = typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

        const config = await ModuleConfig.findOne({
            liga_id: ligaObjectId,
            modulo: "melhor_mes",
            temporada: Number(temporada)
        }).lean();

        // Se existe config com edicoes_intervalos no wizard
        if (config?.wizard_respostas?.edicoes_intervalos) {
            const intervalos = config.wizard_respostas.edicoes_intervalos;
            const edicoes = [];

            // Converter formato do wizard para formato do sistema
            // { "1": { inicio: 1, fim: 4 }, "2": { inicio: 5, fim: 8 }, ... }
            Object.keys(intervalos)
                .map(Number)
                .sort((a, b) => a - b)
                .forEach((id) => {
                    const intervalo = intervalos[id] || intervalos[String(id)];
                    if (intervalo && intervalo.inicio != null && intervalo.fim != null) {
                        edicoes.push({
                            id: Number(id),
                            nome: `Edição ${String(id).padStart(2, "0")}`,
                            inicio: Number(intervalo.inicio),
                            fim: Number(intervalo.fim)
                        });
                    }
                });

            if (edicoes.length > 0) {
                console.log(`${LOG_PREFIX} ✅ Usando ${edicoes.length} edições do ModuleConfig (liga ${ligaId})`);
                return edicoes;
            }
        }
    } catch (err) {
        console.warn(`${LOG_PREFIX} ⚠️ Erro ao buscar config de edições:`, err.message);
    }

    // Fallback para hardcoded
    console.log(`${LOG_PREFIX} ⚠️ Usando edições HARDCODED (fallback)`);
    return MELHOR_MES_EDICOES;
}

/**
 * Determina status de uma edição baseado na rodada atual (sem usar hardcoded).
 * @param {Object} configEdicao - Config da edição { id, inicio, fim }
 * @param {number} rodadaAtual - Rodada atual do sistema
 * @returns {string} "pendente" | "em_andamento" | "consolidado"
 */
function getStatusEdicaoLocal(configEdicao, rodadaAtual) {
    if (rodadaAtual < configEdicao.inicio) return "pendente";
    if (rodadaAtual >= configEdicao.fim) return "consolidado";
    return "em_andamento";
}

// =====================================================================
// BUSCAR MELHOR MÊS (PRINCIPAL)
// =====================================================================

/**
 * Busca dados do Melhor do Mes para uma liga
 * - Se cache consolidado existe, retorna direto (imutavel)
 * - Se nao existe ou desatualizado, consolida automaticamente
 *
 * @param {string} ligaId - ID da liga
 * @param {number} rodadaAtual - Rodada atual do sistema (da API Cartola)
 * @param {number} temporada - Temporada para filtrar (opcional, default CURRENT_SEASON)
 * @returns {Object} Cache com todas as edicoes
 */
export async function buscarMelhorMes(ligaId, rodadaAtual, temporada = null) {
    // ✅ v9.0: Import CURRENT_SEASON para default
    const { CURRENT_SEASON } = await import("../config/seasons.js");
    const temporadaFiltro = temporada || CURRENT_SEASON;

    console.log(
        `${LOG_PREFIX} Buscando Melhor do Mes para liga ${ligaId} (rodada ${rodadaAtual}, temporada ${temporadaFiltro})`,
    );

    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    // ✅ v9.0: Buscar cache existente FILTRANDO por temporada
    let cache = await MelhorMesCache.findOne({ ligaId: ligaObjectId, temporada: temporadaFiltro });

    // Se temporada encerrada, retorna direto (100% imutável)
    if (cache?.temporada_encerrada) {
        console.log(
            `${LOG_PREFIX} ✅ Temporada encerrada - retornando cache permanente`,
        );
        return formatarResposta(cache);
    }

    // Verificar se precisa atualizar
    const precisaAtualizar = verificarNecessidadeAtualizacao(
        cache,
        rodadaAtual,
    );

    if (precisaAtualizar) {
        console.log(`${LOG_PREFIX} Atualizando cache...`);
        cache = await consolidarMelhorMes(ligaObjectId, rodadaAtual, temporadaFiltro);
    }

    return formatarResposta(cache);
}

// =====================================================================
// CONSOLIDAR MELHOR MÊS
// =====================================================================

/**
 * Consolida todas as edicoes do Melhor do Mes
 * - Edicoes ja consolidadas NAO sao recalculadas
 * - Apenas edicoes em andamento ou pendentes sao processadas
 * @param {number} temporada - Temporada para filtrar (opcional)
 */
export async function consolidarMelhorMes(ligaId, rodadaAtual, temporada = null) {
    // ✅ v9.0: Import CURRENT_SEASON para default
    const { CURRENT_SEASON } = await import("../config/seasons.js");
    const temporadaFiltro = temporada || CURRENT_SEASON;

    console.log(
        `${LOG_PREFIX} Consolidando Melhor do Mes (rodada ${rodadaAtual}, temporada ${temporadaFiltro})`,
    );

    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    // ✅ v10.0: Buscar edições da config da liga (ou fallback hardcoded)
    const edicoesConfig = await getEdicoesConfig(ligaObjectId, temporadaFiltro);

    // ✅ v9.0: Buscar cache existente FILTRANDO por temporada
    let cache = await MelhorMesCache.findOne({ ligaId: ligaObjectId, temporada: temporadaFiltro });

    // Criar cache se nao existe
    if (!cache) {
        cache = new MelhorMesCache({
            ligaId: ligaObjectId,
            temporada: temporadaFiltro,
            edicoes: [],
            rodada_sistema: 0,
        });
    }

    // ✅ v10.0: Processar cada edição da CONFIG DA LIGA (não hardcoded)
    for (const configEdicao of edicoesConfig) {
        // Buscar edição no cache
        let edicaoCache = cache.edicoes.find((e) => e.id === configEdicao.id);

        // Se edição já consolidada, pular (IMUTÁVEL)
        if (edicaoCache?.status === "consolidado") {
            console.log(
                `${LOG_PREFIX} ⏭️ ${configEdicao.nome} já consolidada - pulando`,
            );
            continue;
        }

        // ✅ v10.0: Determinar status usando config da liga
        const status = getStatusEdicaoLocal(configEdicao, rodadaAtual);

        // Se pendente (não iniciou), criar/atualizar com dados vazios
        if (status === "pendente") {
            if (!edicaoCache) {
                cache.edicoes.push({
                    id: configEdicao.id,
                    nome: configEdicao.nome,
                    inicio: configEdicao.inicio,
                    fim: configEdicao.fim,
                    status: "pendente",
                    rodada_atual: 0,
                    ranking: [],
                    campeao: null,
                    total_participantes: 0,
                });
            }
            continue;
        }

        // Calcular ranking da edicao
        console.log(`${LOG_PREFIX} Calculando ${configEdicao.nome}...`);
        const dadosEdicao = await calcularRankingEdicao(
            ligaObjectId,
            configEdicao,
            rodadaAtual,
            temporadaFiltro,
        );

        // Atualizar ou criar edição no cache
        if (edicaoCache) {
            Object.assign(edicaoCache, dadosEdicao);
        } else {
            cache.edicoes.push(dadosEdicao);
        }

        // ✅ Registrar prêmio no extrato quando edição é consolidada pela primeira vez
        if (dadosEdicao.status === "consolidado" && dadosEdicao.campeao) {
            await _premiarCampeao(ligaObjectId, configEdicao, dadosEdicao.campeao, temporadaFiltro);
        }
    }

    // Ordenar edições por ID
    cache.edicoes.sort((a, b) => a.id - b.id);

    // ✅ v10.0: Verificar se temporada encerrada (todas consolidadas)
    const todasConsolidadas = cache.edicoes.every(
        (e) => e.status === "consolidado",
    );
    cache.temporada_encerrada =
        todasConsolidadas && cache.edicoes.length === edicoesConfig.length;

    // Atualizar timestamps
    cache.rodada_sistema = rodadaAtual;
    cache.atualizado_em = new Date();

    // Salvar
    await cache.save();

    console.log(
        `${LOG_PREFIX} ✅ Cache salvo - ${cache.edicoes.length} edições`,
    );
    if (cache.temporada_encerrada) {
        console.log(
            `${LOG_PREFIX} 🏁 TEMPORADA ENCERRADA - Cache permanente ativado`,
        );
    }

    return cache;
}

// =====================================================================
// CALCULAR RANKING DE UMA EDIÇÃO
// =====================================================================

/**
 * Calcula ranking de uma edicao especifica
 * @param {number} temporada - Temporada para filtrar
 */
async function calcularRankingEdicao(ligaId, configEdicao, rodadaAtual, temporada) {
    const { id, nome, inicio, fim } = configEdicao;

    // Determinar rodada final para calculo
    const rodadaFinal = Math.min(fim, rodadaAtual);

    // ✅ v9.0: Buscar rodadas da edicao FILTRANDO por temporada
    const rodadas = await Rodada.find({
        ligaId,
        temporada,
        rodada: { $gte: inicio, $lte: rodadaFinal },
    }).lean();

    // Se não há dados
    if (!rodadas || rodadas.length === 0) {
        return {
            id,
            nome,
            inicio,
            fim,
            status: rodadaAtual >= inicio ? "em_andamento" : "pendente",
            rodada_atual: 0,
            ranking: [],
            campeao: null,
            total_participantes: 0,
            atualizado_em: new Date(),
        };
    }

    // Agrupar por time
    const timesPontos = {};

    rodadas.forEach((r) => {
        const timeId = r.timeId;
        const pontos = r.rodadaNaoJogada ? 0 : parseFloat(r.pontos) || 0;

        if (!timesPontos[timeId]) {
            timesPontos[timeId] = {
                timeId,
                nome_time: r.nome_time || r.nome || "N/D",
                nome_cartola: r.nome_cartola || "N/D",
                escudo: r.escudo || "",
                clube_id: r.clube_id,
                pontos_total: 0,
                rodadas_jogadas: 0,
            };
        }

        timesPontos[timeId].pontos_total += pontos;
        if (!r.rodadaNaoJogada && pontos !== 0) {
            timesPontos[timeId].rodadas_jogadas++;
        }
    });

    // Converter para array e ordenar
    const ranking = Object.values(timesPontos)
        .sort((a, b) => b.pontos_total - a.pontos_total)
        .map((time, index) => ({
            posicao: index + 1,
            ...time,
            media:
                time.rodadas_jogadas > 0
                    ? parseFloat(
                          (time.pontos_total / time.rodadas_jogadas).toFixed(2),
                      )
                    : 0,
        }));

    // Determinar status
    const status = rodadaAtual >= fim ? "consolidado" : "em_andamento";

    // Campeão (primeiro lugar)
    const campeao =
        ranking.length > 0
            ? {
                  timeId: ranking[0].timeId,
                  nome_time: ranking[0].nome_time,
                  nome_cartola: ranking[0].nome_cartola,
                  pontos_total: ranking[0].pontos_total,
              }
            : null;

    return {
        id,
        nome,
        inicio,
        fim,
        status,
        rodada_atual: rodadaFinal,
        ranking,
        campeao,
        total_participantes: ranking.length,
        consolidado_em: status === "consolidado" ? new Date() : null,
        atualizado_em: new Date(),
    };
}

// =====================================================================
// FUNÇÕES AUXILIARES
// =====================================================================

/**
 * Verifica se o cache precisa ser atualizado.
 * ✅ v10.0: Usa edições do próprio cache (já com config correta da liga).
 */
function verificarNecessidadeAtualizacao(cache, rodadaAtual) {
    // Se não existe cache, precisa criar
    if (!cache) return true;

    // Se temporada encerrada, não atualiza
    if (cache.temporada_encerrada) return false;

    // Se rodada do sistema avançou, precisa atualizar
    if (cache.rodada_sistema < rodadaAtual) return true;

    // ✅ v10.0: Verificar usando edições do próprio cache (já tem config correta)
    for (const edicaoCache of cache.edicoes) {
        // Se edição deveria estar consolidada mas não está
        if (
            rodadaAtual >= edicaoCache.fim &&
            edicaoCache.status !== "consolidado"
        ) {
            return true;
        }

        // Se edição em andamento e rodada avançou
        if (
            edicaoCache.status === "em_andamento" &&
            edicaoCache.rodada_atual < rodadaAtual
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Formata resposta para a API
 */
function formatarResposta(cache) {
    if (!cache) {
        return {
            edicoes: [],
            totalEdicoes: 0,
            temporada_encerrada: false,
        };
    }

    return {
        edicoes: cache.edicoes.map((e) => ({
            id: e.id,
            nome: e.nome,
            inicio: e.inicio,
            fim: e.fim,
            status: e.status,
            rodada_atual: e.rodada_atual,
            ranking: e.ranking,
            campeao: e.campeao,
            totalParticipantes: e.total_participantes,
        })),
        totalEdicoes: cache.edicoes.length,
        ligaId: cache.ligaId,
        rodada_sistema: cache.rodada_sistema,
        temporada_encerrada: cache.temporada_encerrada,
        atualizado_em: cache.atualizado_em,
    };
}

// =====================================================================
// INTEGRAÇÃO FINANCEIRA — PRÊMIO DO CAMPEÃO
// =====================================================================

/**
 * Registra o prêmio de uma edição no extrato financeiro do campeão.
 * Idempotente: verifica $elemMatch antes de inserir.
 *
 * @param {ObjectId|string} ligaId
 * @param {Object} configEdicao - { id, nome, inicio, fim }
 * @param {Object} campeao      - { timeId, nome_time, ... }
 * @param {number} temporada
 */
async function _premiarCampeao(ligaId, configEdicao, campeao, temporada) {
    try {
        const ligaStr = String(ligaId);
        const timeIdNum = Number(campeao.timeId);
        const rodadaFim = Number(configEdicao.fim);

        // Buscar config do wizard para obter valor do prêmio e flag integrar_extrato
        const ligaObjectId = typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;
        const config = await ModuleConfig.findOne({
            liga_id: ligaObjectId,
            modulo: "melhor_mes",
            temporada: Number(temporada),
        }).lean();

        const integrarExtrato = config?.wizard_respostas?.integrar_extrato !== false;
        const valorPremio = parseFloat(config?.wizard_respostas?.valor_campeao_edicao) || 0;

        if (!integrarExtrato || valorPremio <= 0) {
            console.log(`${LOG_PREFIX} ⏭️ Prêmio da edição ${configEdicao.id} não integrado (integrar_extrato=${integrarExtrato}, valor=${valorPremio})`);
            return;
        }

        // Idempotência: verificar se já existe registro MELHOR_MES para este rodadaFim no extrato
        const jaExiste = await ExtratoFinanceiroCache.findOne({
            liga_id: ligaStr,
            time_id: timeIdNum,
            temporada: Number(temporada),
            historico_transacoes: {
                $elemMatch: { tipo: "MELHOR_MES", rodada: rodadaFim },
            },
        }).lean();

        if (jaExiste) {
            console.log(`${LOG_PREFIX} ✅ Prêmio edição ${configEdicao.id} já registrado para time ${timeIdNum}`);
            return;
        }

        // Montar transação no formato suportado pelo extrato (consolidado + legado)
        const novaTransacao = {
            rodada: rodadaFim,
            bonusOnus: 0,
            pontosCorridos: 0,
            mataMata: 0,
            top10: 0,
            melhorMes: valorPremio,
            saldo: valorPremio,
            saldoAcumulado: 0, // Recalculado pelo controller ao ler
            tipo: "MELHOR_MES",
            valor: valorPremio,
            descricao: `Prêmio Melhor do Mês - ${configEdicao.nome} (Rods. ${configEdicao.inicio}-${configEdicao.fim})`,
            data: new Date(),
        };

        // Inserir apenas se o extrato do participante já existe
        const resultado = await ExtratoFinanceiroCache.updateOne(
            { liga_id: ligaStr, time_id: timeIdNum, temporada: Number(temporada) },
            { $push: { historico_transacoes: novaTransacao } },
        );

        if (resultado.matchedCount === 0) {
            console.warn(`${LOG_PREFIX} ⚠️ Extrato do time ${timeIdNum} não encontrado — prêmio não inserido automaticamente`);
        } else {
            console.log(`${LOG_PREFIX} 💰 Prêmio R$${valorPremio} da edição ${configEdicao.id} registrado no extrato do time ${timeIdNum} (rod. ${rodadaFim})`);
        }
    } catch (err) {
        // Não propaga erro — integração financeira não deve impedir consolidação
        console.error(`${LOG_PREFIX} ❌ Erro ao registrar prêmio no extrato:`, err.message);
    }
}

// =====================================================================
// FUNÇÕES DE MANUTENÇÃO
// =====================================================================

/**
 * Força reconsolidação de uma liga (ignora cache)
 * ✅ v11.0: Aceita temporada para evitar colisão 2025/2026
 *           Reseta TODAS as edições (inclusive consolidadas) para refletir nova config
 */
export async function forcarReconsolidacao(ligaId, rodadaAtual, temporada = null) {
    const { CURRENT_SEASON } = await import("../config/seasons.js");
    const temporadaFiltro = temporada || CURRENT_SEASON;

    console.log(`${LOG_PREFIX} ⚠️ Forçando reconsolidação para liga ${ligaId} (temporada ${temporadaFiltro})`);

    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    // ✅ v11.0: Filtrar por temporada para não afetar cache de outra temporada
    let cache = await MelhorMesCache.findOne({ ligaId: ligaObjectId, temporada: temporadaFiltro });

    if (cache) {
        // ✅ v11.0: Resetar TODAS as edições (inclusive consolidadas)
        // Necessário quando a config de edições mudou — ex: fim mudou de R6 para R4
        cache.edicoes.forEach((e) => {
            e.ranking = [];
            e.campeao = null;
            e.total_participantes = 0;
            e.rodada_atual = 0;
            e.status = "pendente";
            e.consolidado_em = null;
        });

        cache.temporada_encerrada = false;
        await cache.save();
    }

    // ✅ v11.0: Passar temporada para consolidarMelhorMes
    return await consolidarMelhorMes(ligaObjectId, rodadaAtual, temporadaFiltro);
}

/**
 * Invalida cache de uma liga (remove completamente)
 * ✅ v11.0: Aceita temporada para não remover cache de outra temporada (evitar colisão 2025/2026)
 * CUIDADO: Isso remove edições já consolidadas!
 */
export async function invalidarCache(ligaId, temporada = null) {
    const { CURRENT_SEASON } = await import("../config/seasons.js");
    const temporadaFiltro = temporada || CURRENT_SEASON;

    console.log(`${LOG_PREFIX} 🗑️ Invalidando cache para liga ${ligaId} (temporada ${temporadaFiltro})`);

    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    // ✅ v11.0: Filtrar por temporada para não deletar cache de outra temporada
    const resultado = await MelhorMesCache.deleteOne({ ligaId: ligaObjectId, temporada: temporadaFiltro });

    console.log(
        `${LOG_PREFIX} Cache removido: ${resultado.deletedCount} documento(s) (temporada ${temporadaFiltro})`,
    );

    return resultado;
}

/**
 * Busca dados de um participante específico no Melhor do Mês
 */
export async function buscarParticipanteMelhorMes(ligaId, timeId, rodadaAtual) {
    const dados = await buscarMelhorMes(ligaId, rodadaAtual);

    const timeIdNum = parseInt(timeId);

    const resultado = {
        timeId: timeIdNum,
        edicoes: [],
        conquistas: [],
    };

    dados.edicoes.forEach((edicao) => {
        const posicaoTime = edicao.ranking.find((r) => r.timeId === timeIdNum);

        if (posicaoTime) {
            resultado.edicoes.push({
                id: edicao.id,
                nome: edicao.nome,
                status: edicao.status,
                posicao: posicaoTime.posicao,
                pontos_total: posicaoTime.pontos_total,
                rodadas_jogadas: posicaoTime.rodadas_jogadas,
                eh_campeao: edicao.campeao?.timeId === timeIdNum,
            });

            // Se é campeão de edição concluída, adicionar às conquistas
            if (
                edicao.campeao?.timeId === timeIdNum &&
                edicao.status === "consolidado"
            ) {
                resultado.conquistas.push({
                    edicao_id: edicao.id,
                    nome: edicao.nome,
                    pontos: posicaoTime.pontos_total,
                });
            }
        }
    });

    return resultado;
}

// =====================================================================
// EXPORT
// =====================================================================

export default {
    buscarMelhorMes,
    consolidarMelhorMes,
    forcarReconsolidacao,
    invalidarCache,
    buscarParticipanteMelhorMes,
};

console.log(`${LOG_PREFIX} ✅ Service carregado`);
