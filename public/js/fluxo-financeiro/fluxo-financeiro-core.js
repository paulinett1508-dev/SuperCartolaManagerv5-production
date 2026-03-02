// FLUXO-FINANCEIRO-CORE.JS v6.10 - FIX DEFAULTS INCONSISTENTES
// ✅ v6.10: FIX CRÍTICO - Defaults inconsistentes (|| 2025 → || CURRENT_SEASON)
//           Problema: Se window.temporadaAtual não definido, buscava cache 2025
//           Solução: Todos os defaults agora usam 2026 (consistente com init)
// ✅ v6.9: FIX CRÍTICO - Usar resumo do backend em pré-temporada
//          Antes: calculava localmente só campos+acertos, ignorava inscrição
//          Agora: usa resumo do backend que inclui inscrição+acertos corretamente
// ✅ v6.8: FIX CRÍTICO - Detectar pré-temporada quando API já virou para nova temporada
//          Agora detecta: temporada=2026, rodada=1, bola_rolando=false
// ✅ v6.7: FIX CRÍTICO - Detectar pré-temporada e NÃO calcular rodadas inexistentes
//          Temporada 2026 não começou → retorna apenas inscrições, sem rodada fantasma
// ✅ v6.6: FIX CRÍTICO - Separar saldo_temporada (histórico) de saldo (pendente)
//          Resultado da temporada é IMUTÁVEL, acertos apenas quitam dívida
// ✅ v6.5: FIX - Temporada histórica (2025) usa rodada 38, não rodada atual do mercado (2026)
// ✅ v6.2: FIX - Detecta cache com Timeline (bonusOnus) zerado anormalmente e força recálculo
// ✅ v6.1: FIX - Inclui acertos financeiros no cálculo do saldo final
// ✅ v4.1: Trava extrato para inativos na rodada_desistencia
// ✅ v4.2: Tabelas contextuais corrigidas
// ✅ v4.3: Fix await no _carregarMataMataMap + logs debug
// ✅ v4.4: Fix posição usando apenas ranking de ativos
// ✅ v4.5: Filtrar registros antigos de inativos via posicao > totalParticipantesAtivos
// ✅ v5.0: Cache permanente para temporadas finalizadas (sem recálculos no app)
// ✅ v6.0: SaaS Dinamico - configs do endpoint /api/ligas/:id/configuracoes

// ============================================================================
// ⚽ IMPORTS E CONFIGURAÇÕES
// ============================================================================
import { CURRENT_SEASON, RODADA_FINAL_CAMPEONATO } from "../config/seasons-client.js";
import { seasonStatus } from "../core/season-status-manager.js";
import { calcularFinanceiroConfronto } from "../pontos-corridos-utils.js";
import { obterLigaId } from "../pontos-corridos-utils.js";
import { FluxoFinanceiroCampos } from "./fluxo-financeiro-campos.js";
import {
    RODADA_INICIAL_PONTOS_CORRIDOS,
    normalizarTimeId,
} from "./fluxo-financeiro-utils.js";
import {
    fetchLigaConfig,
    getBancoPorRodadaAsync,
    isModuloHabilitadoAsync,
    getBancoPorRodada,
} from "../rodadas/rodadas-config.js";

const API_BASE_URL = window.location.origin;

export class FluxoFinanceiroCore {
    constructor(cache) {
        this.cache = cache;
        this.mataMataIntegrado = false;
        this.mataMataMap = new Map();
        this.ligaConfig = null; // v6.0: Config dinamica da liga
        this._integrarMataMata();
    }

    // ✅ v6.1: Buscar acertos financeiros do participante
    // ✅ v6.2 FIX: Passar temporada para sincronização
    async _buscarAcertosFinanceiros(ligaId, timeId) {
        try {
            // ✅ FIX v6.10: Default 2026 (temporada atual) - consistente com fluxo-financeiro.js
            const temporada = window.temporadaAtual || CURRENT_SEASON;
            const response = await fetch(`${API_BASE_URL}/api/acertos/${ligaId}/${timeId}?temporada=${temporada}`);
            const result = await response.json();

            if (!result.success || !result.acertos || result.acertos.length === 0) {
                return {
                    lista: [],
                    resumo: { totalPago: 0, totalRecebido: 0, saldo: 0 },
                };
            }

            console.log(`[FLUXO-CORE] 💰 Acertos carregados: ${result.acertos.length} registros | Saldo: R$ ${result.resumo?.saldo?.toFixed(2) || 0}`);

            return {
                lista: result.acertos,
                resumo: result.resumo || { totalPago: 0, totalRecebido: 0, saldo: 0 },
            };
        } catch (error) {
            console.warn(`[FLUXO-CORE] ⚠️ Erro ao buscar acertos:`, error.message);
            return {
                lista: [],
                resumo: { totalPago: 0, totalRecebido: 0, saldo: 0 },
            };
        }
    }

    _isAcertoInscricao(acerto) {
        const descricao = (acerto?.descricao || "").toLowerCase();
        return descricao.includes("inscri") || descricao.includes("renova");
    }

    _filtrarAcertosInscricao(acertos, ignorar) {
        if (!ignorar || !acertos || !Array.isArray(acertos.lista) || acertos.lista.length === 0) {
            return { acertos, ignorados: [] };
        }

        const ignorados = [];
        const listaFiltrada = [];
        acertos.lista.forEach((a) => {
            if (this._isAcertoInscricao(a)) {
                ignorados.push(a);
            } else {
                listaFiltrada.push(a);
            }
        });

        if (ignorados.length === 0) {
            return { acertos, ignorados };
        }

        let totalPago = 0;
        let totalRecebido = 0;
        listaFiltrada.forEach((a) => {
            const valor = Number(a.valor) || 0;
            if (a.tipo === "pagamento") totalPago += valor;
            else if (a.tipo === "recebimento") totalRecebido += valor;
        });

        const saldoAcertos = parseFloat((totalPago - totalRecebido).toFixed(2));

        return {
            acertos: {
                ...acertos,
                lista: listaFiltrada,
                resumo: {
                    ...(acertos.resumo || {}),
                    totalPago: parseFloat(totalPago.toFixed(2)),
                    totalRecebido: parseFloat(totalRecebido.toFixed(2)),
                    saldo: saldoAcertos,
                    saldoAcertos: saldoAcertos,
                    quantidadeAcertos: listaFiltrada.length,
                },
            },
            ignorados,
        };
    }

    _calcularSaldoInicialInscricao(inscricao, camposEditaveis, pagouInscricao) {
        if (inscricao) {
            if (typeof inscricao.saldo_inicial_temporada === "number") {
                return inscricao.saldo_inicial_temporada;
            }

            const taxa = Number(inscricao.taxa_inscricao) || 0;
            const divida = Number(inscricao.divida_anterior) || 0;
            const saldoTransferido = Number(inscricao.saldo_transferido) || 0;
            const pagou = pagouInscricao || inscricao.pagou_inscricao === true;

            return (pagou ? 0 : taxa) + divida - saldoTransferido;
        }

        return (
            (parseFloat(camposEditaveis.campo1?.valor) || 0) +
            (parseFloat(camposEditaveis.campo2?.valor) || 0) +
            (parseFloat(camposEditaveis.campo3?.valor) || 0) +
            (parseFloat(camposEditaveis.campo4?.valor) || 0)
        );
    }

    // ✅ v6.0: Carregar config da liga
    async _carregarLigaConfig(ligaId) {
        if (this.ligaConfig && this.ligaConfig.liga_id === ligaId) {
            return this.ligaConfig;
        }
        try {
            this.ligaConfig = await fetchLigaConfig(ligaId);
            console.log(`[FLUXO-CORE] ✅ Config carregada: ${this.ligaConfig?.liga_nome}`);
            return this.ligaConfig;
        } catch (error) {
            console.warn(`[FLUXO-CORE] Erro ao carregar config:`, error.message);
            return null;
        }
    }

    // ✅ v6.0: Verificar se modulo esta habilitado
    _isModuloHabilitado(modulo) {
        if (!this.ligaConfig) return true; // fallback: habilitado
        const configModulo = this.ligaConfig.configuracoes?.[modulo];
        if (configModulo?.habilitado !== undefined) {
            return configModulo.habilitado;
        }
        const moduloCamel = modulo.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return this.ligaConfig.modulos_ativos?.[moduloCamel] || false;
    }

    // ✅ v6.0: Obter valores de banco para uma rodada
    async _getValoresBanco(ligaId, rodada) {
        const config = await this._carregarLigaConfig(ligaId);
        if (!config?.ranking_rodada) {
            // Fallback para funcao sincrona
            return getBancoPorRodada(ligaId, rodada);
        }
        const rankingConfig = config.ranking_rodada;
        if (rankingConfig.temporal) {
            const rodadaTransicao = rankingConfig.rodada_transicao || 30;
            const fase = rodada < rodadaTransicao ? 'fase1' : 'fase2';
            return rankingConfig[fase]?.valores || {};
        }
        return rankingConfig.valores || {};
    }

    // ✅ v6.0: Obter valores de Top10
    _getValoresTop10() {
        if (!this.ligaConfig?.top10) {
            // Fallback para valores padrao (SuperCartola)
            return {
                mitos: { 1: 30, 2: 28, 3: 26, 4: 24, 5: 22, 6: 20, 7: 18, 8: 16, 9: 14, 10: 12 },
                micos: { 1: -30, 2: -28, 3: -26, 4: -24, 5: -22, 6: -20, 7: -18, 8: -16, 9: -14, 10: -12 }
            };
        }
        return {
            mitos: this.ligaConfig.top10.valores_mito || {},
            micos: this.ligaConfig.top10.valores_mico || {}
        };
    }

    async _integrarMataMata() {
        try {
            const { getRankingRodadaEspecifica } = await import(
                "../rodadas.js"
            );
            const { setRankingFunction } = await import(
                "../mata-mata/mata-mata-financeiro.js"
            );
            setRankingFunction(getRankingRodadaEspecifica);
            this.mataMataIntegrado = true;
            console.log("[FLUXO-CORE] ✅ Mata-mata integrado");
        } catch (error) {
            console.error("[FLUXO-CORE] Erro ao integrar mata-mata:", error);
            this.mataMataIntegrado = false;
        }
    }

    async _carregarMataMataMap(resultadosMataMata) {
        this.mataMataMap.clear();
        let ultimaRodadaConsolidada = RODADA_FINAL_CAMPEONATO; // Fallback: última rodada do campeonato

        try {
            const mercadoResponse = await fetch("/api/cartola/mercado/status");
            if (mercadoResponse.ok) {
                const mercadoData = await mercadoResponse.json();
                const mercadoAberto =
                    mercadoData.mercado_aberto ||
                    mercadoData.status_mercado === 1;
                const temporadaEncerrada = mercadoData.game_over === true;
                const rodadaFinal = mercadoData.rodada_final || RODADA_FINAL_CAMPEONATO;

                // ✅ FIX: Só usar rodada-1 se mercado aberto E temporada NÃO encerrada
                if (temporadaEncerrada || mercadoData.rodada_atual >= rodadaFinal) {
                    ultimaRodadaConsolidada = rodadaFinal;
                } else if (mercadoAberto) {
                    ultimaRodadaConsolidada = Math.max(1, mercadoData.rodada_atual - 1);
                } else {
                    ultimaRodadaConsolidada = mercadoData.rodada_atual;
                }
            }
        } catch (error) {
            console.warn("[FLUXO-CORE] Erro ao verificar mercado:", error);
        }

        console.log(
            `[FLUXO-CORE] 🎯 Carregando MataMataMap: ${resultadosMataMata.length} registros, até R${ultimaRodadaConsolidada}`,
        );

        let carregados = 0;
        resultadosMataMata.forEach((r) => {
            if (r.rodadaPontos <= ultimaRodadaConsolidada) {
                const timeIdNormalizado = normalizarTimeId(r.timeId);
                const key = `${timeIdNormalizado}_${r.rodadaPontos}`;
                this.mataMataMap.set(key, r.valor);
                carregados++;
            }
        });

        console.log(
            `[FLUXO-CORE] ✅ MataMataMap: ${carregados} entradas carregadas (Map size: ${this.mataMataMap.size})`,
        );
    }

    // =====================================================================
    // ✅ v4.1: BUSCAR STATUS DO PARTICIPANTE (ativo/rodada_desistencia)
    // =====================================================================
    async _buscarStatusParticipante(timeId) {
        try {
            const ligaId = obterLigaId();
            const response = await fetch(`/api/ligas/${ligaId}/times`);
            if (!response.ok) return { ativo: true, rodada_desistencia: null };

            const times = await response.json();
            const time = (Array.isArray(times) ? times : []).find(
                (t) => String(t.id || t.time_id) === String(timeId),
            );

            if (!time) return { ativo: true, rodada_desistencia: null };

            return {
                ativo: time.ativo !== false,
                rodada_desistencia: time.rodada_desistencia || null,
            };
        } catch (error) {
            console.warn(
                "[FLUXO-CORE] Erro ao buscar status do participante:",
                error,
            );
            return { ativo: true, rodada_desistencia: null };
        }
    }

    // =====================================================================
    // ✅ MÉTODO PRINCIPAL - CALCULAR EXTRATO COM SUPORTE A INATIVOS
    // =====================================================================
    async calcularExtratoFinanceiro(
        timeId,
        ultimaRodadaCompleta,
        forcarRecalculo = false,
    ) {
        const ligaId = obterLigaId();
        let rodadaParaCalculo = ultimaRodadaCompleta;
        let mercadoAberto = false;

        // ✅ v6.5: Verificar temporada selecionada
        // ✅ FIX v6.10: Default 2026 (temporada atual) - consistente com fluxo-financeiro.js
        const temporadaSelecionada = window.temporadaAtual || CURRENT_SEASON;
        const temporadaAtualReal = new Date().getFullYear(); // 2026
        const isTemporadaHistorica = temporadaSelecionada < temporadaAtualReal;

        // ✅ v6.5: Temporada histórica (2025) sempre usa rodada final
        if (isTemporadaHistorica) {
            rodadaParaCalculo = RODADA_FINAL_CAMPEONATO; // 38
            console.log(
                `[FLUXO-CORE] 📅 Temporada histórica ${temporadaSelecionada}: usando R${rodadaParaCalculo}`,
            );
        }

        // ✅ v4.1: Buscar status do participante
        const statusParticipante = await this._buscarStatusParticipante(timeId);
        const isInativo = statusParticipante.ativo === false;
        const rodadaDesistencia = statusParticipante.rodada_desistencia;

        // ✅ v4.1: Limitar rodada de cálculo para inativos
        if (isInativo && rodadaDesistencia) {
            const rodadaLimite = rodadaDesistencia - 1;
            rodadaParaCalculo = Math.min(rodadaParaCalculo, rodadaLimite);
            console.log(
                `[FLUXO-CORE] 🔒 Inativo: limitando cálculo até R${rodadaLimite}`,
            );
        }

        // ✅ v6.7: Flag de pré-temporada (temporada selecionada ainda não começou)
        let isPreTemporada = false;
        let temporadaMercado = null;

        // ✅ v6.5: Só verificar mercado para temporada ATUAL (não histórica)
        if (!isTemporadaHistorica) {
            // Verificar status do mercado
            try {
                const mercadoResponse = await fetch("/api/cartola/mercado/status");
                if (mercadoResponse.ok) {
                    const mercadoData = await mercadoResponse.json();
                    mercadoAberto =
                        mercadoData.mercado_aberto ||
                        mercadoData.status_mercado === 1;
                    const rodadaAtualMercado = mercadoData.rodada_atual;
                    const temporadaEncerrada = mercadoData.game_over === true;
                    const rodadaFinal = mercadoData.rodada_final || RODADA_FINAL_CAMPEONATO;
                    temporadaMercado = mercadoData.temporada; // Ex: 2025

                    // ✅ v6.8: DETECTAR PRÉ-TEMPORADA (MELHORADO)
                    // Cenário 1: temporada selecionada > temporada do mercado (ex: 2026 > 2025)
                    // Cenário 2: API já virou para nova temporada mas campeonato não começou
                    //            (temporada igual, rodada 1, bola_rolando = false)
                    const isPreTemporadaVirada =
                        temporadaSelecionada === temporadaMercado &&
                        rodadaAtualMercado === 1 &&
                        mercadoData.bola_rolando === false;

                    if (temporadaMercado && (temporadaSelecionada > temporadaMercado || isPreTemporadaVirada)) {
                        isPreTemporada = true;
                        rodadaParaCalculo = 0; // Nenhuma rodada existe ainda
                        console.log(
                            `[FLUXO-CORE] ⏳ PRÉ-TEMPORADA ${temporadaSelecionada}: mercado=${temporadaMercado}, rodada=${rodadaAtualMercado}, bola_rolando=${mercadoData.bola_rolando}. NÃO calcular rodadas.`,
                        );
                    }
                    // ✅ FIX: Só usar rodada-1 se mercado aberto E temporada NÃO encerrada E NÃO pré-temporada
                    else if (mercadoAberto && !isInativo && !temporadaEncerrada) {
                        rodadaParaCalculo = Math.max(1, rodadaAtualMercado - 1);
                    } else if (temporadaEncerrada || rodadaAtualMercado >= rodadaFinal) {
                        // Temporada encerrada: usar rodada final
                        rodadaParaCalculo = rodadaFinal;
                    }
                    // ✅ v6.11 FIX: Mercado fechado mid-season (jogos rolando ou rodada não disputada)
                    // Quando status_mercado=2, a rodada atual pode não ter dados ainda.
                    // Usar rodada anterior como limite seguro.
                    else if (!mercadoAberto && !temporadaEncerrada) {
                        rodadaParaCalculo = Math.max(1, rodadaAtualMercado - 1);
                        console.log(
                            `[FLUXO-CORE] ⚠️ Mercado fechado mid-season, usando R${rodadaParaCalculo} ao invés de R${rodadaAtualMercado}`,
                        );
                    }
                }
            } catch (error) {
                console.warn("[FLUXO-CORE] Erro ao verificar mercado:", error);
            }
        }

        console.log(
            `[FLUXO-CORE] 🎯 Extrato time ${timeId} até R${rodadaParaCalculo} | Temporada: ${temporadaSelecionada} | Inativo: ${isInativo}`,
        );

        // =====================================================================
        // VERIFICAR CACHE MONGODB
        // =====================================================================
        if (!forcarRecalculo) {
            const cacheValido = await this._verificarCacheMongoDB(
                ligaId,
                timeId,
                rodadaParaCalculo,
                mercadoAberto,
            );

            if (cacheValido && cacheValido.valido) {
                const rodadasArray = cacheValido.rodadas || [];

                // ✅ v6.14 FIX: Usar resumo do backend quando cache é de pré-temporada
                // Cenário: backend marcou preTemporada=true (inscrição + acertos calculados),
                // mas frontend diz isPreTemporada=false (rodada_atual > 1).
                // Sem este fix, o frontend ignora o resumo e recalcula do zero,
                // perdendo a inscrição (-180) e mostrando apenas rodadas + acertos.
                const cacheEhPreTemporada = isPreTemporada || cacheValido.preTemporada === true;
                if (cacheEhPreTemporada && cacheValido.resumo) {
                    console.log(`[FLUXO-CORE] ✅ PRÉ-TEMPORADA (backend=${cacheValido.preTemporada}, frontend=${isPreTemporada}): Usando resumo do backend cache`);

                    // Usar campos e acertos do cache
                    let camposEditaveis;
                    if (cacheValido.camposManuais && Array.isArray(cacheValido.camposManuais)) {
                        const campos = cacheValido.camposManuais;
                        camposEditaveis = {
                            campo1: campos[0] || { nome: "Campo 1", valor: 0 },
                            campo2: campos[1] || { nome: "Campo 2", valor: 0 },
                            campo3: campos[2] || { nome: "Campo 3", valor: 0 },
                            campo4: campos[3] || { nome: "Campo 4", valor: 0 },
                        };
                    } else {
                        // ✅ v6.10 FIX: Passar temporada correta para buscar campos da temporada selecionada
                        camposEditaveis = await FluxoFinanceiroCampos.carregarTodosCamposEditaveis(timeId, temporadaSelecionada);
                    }

                    const acertos = cacheValido.acertos || await this._buscarAcertosFinanceiros(ligaId, timeId);

                    // ✅ v6.14: Ajustar mensagem se temporada já começou mas cache é de pré-temporada
                    const avisoPre = isPreTemporada
                        ? `Temporada ${temporadaSelecionada} ainda não iniciou. Exibindo apenas inscrições.`
                        : `Dados de pré-temporada (inscrição + acertos). Atualize parciais para incluir rodadas.`;

                    return {
                        rodadas: [],
                        resumo: {
                            ...cacheValido.resumo,
                            campo1: parseFloat(camposEditaveis.campo1?.valor) || 0,
                            campo2: parseFloat(camposEditaveis.campo2?.valor) || 0,
                            campo3: parseFloat(camposEditaveis.campo3?.valor) || 0,
                            campo4: parseFloat(camposEditaveis.campo4?.valor) || 0,
                        },
                        totalTimes: 0,
                        camposEditaveis: camposEditaveis,
                        acertos: acertos,
                        inativo: isInativo,
                        rodadaDesistencia: rodadaDesistencia,
                        extratoTravado: false,
                        preTemporada: cacheEhPreTemporada,
                        temporadaMercado: temporadaMercado,
                        inscricao: cacheValido.inscricao,
                        updatedAt: cacheValido.updatedAt,
                        fonte: cacheValido.fonte || 'cache',
                        avisoPreTemporada: avisoPre,
                    };
                }

                if (Array.isArray(rodadasArray) && rodadasArray.length > 0) {
                    const primeiraRodada = rodadasArray[0];

                    // ✅ v6.2 FIX: Detectar cache com Timeline zerado anormalmente
                    // Se banco habilitado E muitas rodadas E todos bonusOnus = 0, é anomalia
                    const cacheIncompleto = this._detectarCacheIncompleto(rodadasArray, primeiraRodada, ligaId);

                    if (!cacheIncompleto) {
                        console.log(`[FLUXO-CORE] ⚡ CACHE VÁLIDO!`);

                        // ✅ v4.1: FILTRAR rodadas do cache para inativos
                        let rodadasFiltradas = rodadasArray;
                        if (isInativo && rodadaDesistencia) {
                            const rodadaLimite = rodadaDesistencia - 1;
                            rodadasFiltradas = rodadasArray.filter(
                                (r) => r.rodada <= rodadaLimite,
                            );
                            console.log(
                                `[FLUXO-CORE] 🔒 Inativo: filtrando cache ${rodadasArray.length} → ${rodadasFiltradas.length} rodadas (até R${rodadaLimite})`,
                            );
                        }

                        // ✅ v6.3 FIX: Usar campos que já vêm do cache (elimina chamada redundante)
                        // Backend retorna camposManuais como array, transformar para objeto
                        let camposEditaveis;
                        if (cacheValido.camposManuais && Array.isArray(cacheValido.camposManuais)) {
                            const campos = cacheValido.camposManuais;
                            camposEditaveis = {
                                campo1: campos[0] || { nome: "Campo 1", valor: 0 },
                                campo2: campos[1] || { nome: "Campo 2", valor: 0 },
                                campo3: campos[2] || { nome: "Campo 3", valor: 0 },
                                campo4: campos[3] || { nome: "Campo 4", valor: 0 },
                            };
                            console.log(`[FLUXO-CORE] ✅ Usando campos do cache (${campos.length} itens)`);
                        } else {
                            // Fallback: buscar do servidor se não veio no cache
                            // ✅ v6.10 FIX: Passar temporada correta
                            camposEditaveis =
                                await FluxoFinanceiroCampos.carregarTodosCamposEditaveis(
                                    timeId,
                                    temporadaSelecionada,
                                );
                        }

                        // ✅ v6.3 FIX: Usar acertos que já vêm do cache (elimina chamada redundante)
                        const acertos = cacheValido.acertos || await this._buscarAcertosFinanceiros(ligaId, timeId);

        const resumoRecalculado = this._recalcularResumoDoCache(
            rodadasFiltradas,
            camposEditaveis,
        );
                        this._calcularSaldoAcumulado(rodadasFiltradas);

                        // Montar resumo com campos editáveis
                        const resumoCompleto = {
                            ...resumoRecalculado,
                            campo1:
                                parseFloat(camposEditaveis.campo1?.valor) || 0,
                            campo2:
                                parseFloat(camposEditaveis.campo2?.valor) || 0,
                            campo3:
                                parseFloat(camposEditaveis.campo3?.valor) || 0,
                            campo4:
                                parseFloat(camposEditaveis.campo4?.valor) || 0,
                            // ✅ v6.1: Incluir saldo de acertos no resumo
                            saldo_acertos: acertos?.resumo?.saldo ?? 0,
                            // ✅ v6.9: Incluir lançamentos iniciais (inscrição, legado) do backend
                            saldo_lancamentos_iniciais: cacheValido?.resumo?.saldo_lancamentos_iniciais || 0,
                            // ✅ I6 FIX: Propagar saldoAjustes do backend (AjusteFinanceiro 2026+)
                            // Frontend não conhece AjusteFinanceiro — confiar no valor já calculado pelo backend
                            saldoAjustes: cacheValido?.resumo?.saldoAjustes ?? 0,
                            // ✅ v6.12: Preservar módulos opcionais do cache (quando existirem)
                            melhorMes: cacheValido?.resumo?.melhorMes ?? resumoRecalculado.melhorMes ?? 0,
                            artilheiro: cacheValido?.resumo?.artilheiro ?? resumoRecalculado.artilheiro ?? 0,
                            luvaOuro: cacheValido?.resumo?.luvaOuro ?? resumoRecalculado.luvaOuro ?? 0,
                        };

                        // ✅ v6.6: CALCULAR AMBOS OS SALDOS (histórico e pendente)
                        resumoCompleto.saldo_temporada =
                            this._calcularSaldoTemporada(resumoCompleto); // Histórico (imutável)
                        resumoCompleto.saldo =
                            this._calcularSaldoFinal(resumoCompleto); // Pendente (com acertos)

                        const extratoDoCache = {
                            rodadas: rodadasFiltradas,
                            resumo: resumoCompleto,
                            camposEditaveis: camposEditaveis,
                            acertos: acertos, // ✅ v6.1: Incluir acertos no extrato
                            totalTimes: rodadasFiltradas[0]?.totalTimes || 32,
                            updatedAt: cacheValido.updatedAt,
                            // ✅ v4.1: Informações de inativo
                            inativo: isInativo,
                            rodadaDesistencia: rodadaDesistencia,
                            extratoTravado: isInativo && rodadaDesistencia,
                            rodadaTravada: rodadaDesistencia
                                ? rodadaDesistencia - 1
                                : null,
                        };

                        const saldoAcertosLog = acertos?.resumo?.saldo ?? 0;
                        // ✅ v6.6: Log mostra ambos os saldos
                        console.log(
                            `[FLUXO-CORE] ✅ Extrato do cache: ${rodadasFiltradas.length} rodadas | RESULTADO TEMPORADA: R$ ${extratoDoCache.resumo.saldo_temporada.toFixed(2)} | SALDO PENDENTE: R$ ${extratoDoCache.resumo.saldo.toFixed(2)} (acertos: R$ ${saldoAcertosLog.toFixed(2)})${isInativo ? " | TRAVADO" : ""}`,
                        );

                        return extratoDoCache;
                    }
                }
            }
        }

        // =====================================================================
        // CALCULAR DO ZERO
        // =====================================================================

        // ✅ v6.5: PROTEÇÃO - Temporadas históricas NÃO devem ser recalculadas
        // O frontend não tem dados de ranking de temporadas anteriores
        // Recalcular criaria caches corrompidos (tudo zerado)
        if (isTemporadaHistorica) {
            console.warn(`[FLUXO-CORE] ⚠️ Temporada histórica ${temporadaSelecionada} sem cache válido. Retornando extrato vazio.`);
            console.warn(`[FLUXO-CORE] ⚠️ Execute o script de correção de caches para reconstruir.`);

            // Retornar extrato vazio em vez de calcular com dados incorretos
            return {
                rodadas: [],
                resumo: {
                    totalGanhos: 0, totalPerdas: 0, bonus: 0, onus: 0,
                    pontosCorridos: 0, mataMata: 0, top10: 0,
                    melhorMes: 0, artilheiro: 0, luvaOuro: 0,
                    saldo: 0,
                    campo1: 0, campo2: 0, campo3: 0, campo4: 0,
                    saldo_acertos: 0
                },
                totalTimes: 0,
                camposEditaveis: {},
                acertos: { lista: [], resumo: { totalPago: 0, totalRecebido: 0, saldo: 0 } },
                inativo: isInativo,
                rodadaDesistencia: rodadaDesistencia,
                extratoTravado: false,
                temporadaHistorica: true,
                avisoSemCache: `Extrato de ${temporadaSelecionada} não disponível. Cache não encontrado.`
            };
        }

        // ✅ v6.7: PROTEÇÃO PRÉ-TEMPORADA - Não calcular rodadas inexistentes
        // Temporada 2026 ainda não começou, retornar apenas dados de inscrição
        if (isPreTemporada) {
            console.log(`[FLUXO-CORE] ⏳ PRÉ-TEMPORADA ${temporadaSelecionada}: retornando extrato sem rodadas.`);
            console.log(`[FLUXO-CORE] ⏳ Apenas inscrições e campos manuais serão exibidos.`);

            // Buscar campos editáveis e acertos (únicos dados válidos na pré-temporada)
            // ✅ v6.10 FIX: Passar temporada correta para buscar campos da temporada selecionada
            const camposEditaveis = await FluxoFinanceiroCampos.carregarTodosCamposEditaveis(timeId, temporadaSelecionada);
            const acertosRaw = await this._buscarAcertosFinanceiros(ligaId, timeId);

            // ✅ v6.8: Buscar status de inscrição para determinar se pagou
            const statusInscricao = this.cache?.getStatusInscricao2026?.(timeId) || {};
            const pagouInscricao = statusInscricao.pagouInscricao === true || statusInscricao.inscricaoQuitada === true;
            console.log(`[FLUXO-CORE] 📋 Status inscrição time ${timeId}: pagouInscricao=${pagouInscricao}`);

            // ✅ v6.11: Garantir que inscrições 2026 estejam carregadas para cálculo correto
            if (this.cache?.carregarInscricoes2026) {
                await this.cache.carregarInscricoes2026();
            }
            const inscricaoDetalhe = this.cache?.inscricoes2026?.get(String(timeId));

            // Calcular saldo inicial (inscrição + legado) com base na inscrição real
            const saldoInscricao = this._calcularSaldoInicialInscricao(
                inscricaoDetalhe,
                camposEditaveis,
                pagouInscricao,
            );

            // ✅ v6.11: Se pagou inscrição, ignorar acertos de "inscrição" no saldo
            const { acertos, ignorados } = this._filtrarAcertosInscricao(
                acertosRaw,
                pagouInscricao,
            );
            if (ignorados.length > 0) {
                console.log(
                    `[FLUXO-CORE] 🧹 ${ignorados.length} acerto(s) de inscrição ignorado(s) no saldo (pré-temporada)`,
                );
            }

            return {
                rodadas: [],
                resumo: {
                    totalGanhos: 0, totalPerdas: 0, bonus: 0, onus: 0,
                    pontosCorridos: 0, mataMata: 0, top10: 0,
                    melhorMes: 0, artilheiro: 0, luvaOuro: 0,
                    campo1: parseFloat(camposEditaveis.campo1?.valor) || 0,
                    campo2: parseFloat(camposEditaveis.campo2?.valor) || 0,
                    campo3: parseFloat(camposEditaveis.campo3?.valor) || 0,
                    campo4: parseFloat(camposEditaveis.campo4?.valor) || 0,
                    saldo_acertos: acertos?.resumo?.saldo ?? 0,
                    saldo_temporada: saldoInscricao,
                    saldo: saldoInscricao + (acertos?.resumo?.saldo ?? 0),
                    pagouInscricao: pagouInscricao // ✅ v6.8: Flag para UI determinar label
                },
                totalTimes: 0,
                camposEditaveis: camposEditaveis,
                acertos: acertos,
                inativo: isInativo,
                rodadaDesistencia: rodadaDesistencia,
                extratoTravado: false,
                preTemporada: true,
                temporadaMercado: temporadaMercado,
                inscricao: statusInscricao, // ✅ v6.8: Dados completos da inscrição
                avisoPreTemporada: `Temporada ${temporadaSelecionada} ainda não iniciou. Exibindo apenas inscrições.`
            };
        }

        console.log(`[FLUXO-CORE] 🔄 Calculando extrato completo...`);

        // ✅ v6.0: Carregar config da liga e verificar modulos
        await this._carregarLigaConfig(ligaId);
        const hasPontosCorridos = this._isModuloHabilitado('pontos_corridos');

        // ✅ LAZY LOADING: Carregar dados completos sob demanda (primeira vez que clica)
        await this.cache.carregarDadosCompletos();

        // ✅ v6.10 FIX: Passar temporada correta para buscar campos da temporada selecionada
        const camposEditaveis =
            await FluxoFinanceiroCampos.carregarTodosCamposEditaveis(timeId, temporadaSelecionada);

        // ✅ v6.1: Buscar acertos financeiros
        const acertos = await this._buscarAcertosFinanceiros(ligaId, timeId);

        // ✅ v4.3: AWAIT no _carregarMataMataMap
        const resultadosMataMata = this.mataMataIntegrado
            ? this.cache.getResultadosMataMata()
            : [];

        console.log(
            `[FLUXO-CORE] 📊 Mata-Mata do cache: ${resultadosMataMata.length} registros`,
        );

        if (resultadosMataMata.length > 0) {
            await this._carregarMataMataMap(resultadosMataMata); // ✅ FIX: adicionado await
        } else {
            console.warn(
                `[FLUXO-CORE] ⚠️ Nenhum resultado de Mata-Mata encontrado no cache`,
            );
        }

        const extrato = {
            rodadas: [],
            resumo: {
                totalGanhos: 0,
                totalPerdas: 0,
                bonus: 0,
                onus: 0,
                pontosCorridos: hasPontosCorridos ? 0 : null, // v6.0: config dinamica
                mataMata: 0,
                melhorMes: 0,
                artilheiro: 0,
                luvaOuro: 0,
                campo1: parseFloat(camposEditaveis.campo1?.valor) || 0,
                campo2: parseFloat(camposEditaveis.campo2?.valor) || 0,
                campo3: parseFloat(camposEditaveis.campo3?.valor) || 0,
                campo4: parseFloat(camposEditaveis.campo4?.valor) || 0,
                vezesMito: 0,
                vezesMico: 0,
                saldo: 0,
                top10: 0,
                // ✅ v6.1: Incluir saldo de acertos
                saldo_acertos: acertos?.resumo?.saldo ?? 0,
            },
            totalTimes: 0,
            camposEditaveis: camposEditaveis,
            acertos: acertos, // ✅ v6.1: Incluir acertos no extrato
            // ✅ v4.1: Informações de inativo
            inativo: isInativo,
            rodadaDesistencia: rodadaDesistencia,
            extratoTravado: isInativo && rodadaDesistencia,
            rodadaTravada: rodadaDesistencia ? rodadaDesistencia - 1 : null,
        };

        const dadosTop10 = await this.buscarDadosTop10(timeId);
        const top10Map = new Map(dadosTop10.map((item) => [item.rodada, item]));

        // ✅ v4.1: Loop até rodadaParaCalculo (já limitada para inativos)
        // ✅ v6.0: Usar config dinamica em vez de IDs hardcoded
        const rodadasProcessadas = [];
        for (let rodada = 1; rodada <= rodadaParaCalculo; rodada++) {
            const rodadaData = await this._processarRodadaIntegrada(
                timeId,
                rodada,
                ligaId,
                hasPontosCorridos,
            );

            if (rodadaData) {
                const top10Data = top10Map.get(rodada);
                rodadaData.top10 = top10Data ? top10Data.valor || 0 : 0;
                rodadaData.top10Status = top10Data ? top10Data.status : null;
                rodadaData.top10Posicao = top10Data ? top10Data.posicao : null;

                rodadasProcessadas.push(rodadaData);
                extrato.totalTimes = Math.max(
                    extrato.totalTimes,
                    rodadaData.totalTimes,
                );
                this._acumularValoresIntegrados(
                    extrato.resumo,
                    rodadaData,
                    hasPontosCorridos,
                );
            }
        }

        extrato.rodadas = rodadasProcessadas;
        this._calcularSaldoAcumulado(extrato.rodadas, camposEditaveis);
        // ✅ v6.6: Calcular AMBOS os saldos separadamente
        extrato.resumo.saldo_temporada = this._calcularSaldoTemporada(extrato.resumo); // Histórico (imutável)
        extrato.resumo.saldo = this._calcularSaldoFinal(extrato.resumo); // Pendente (com acertos)
        this._calcularTotaisConsolidados(extrato.resumo, extrato.rodadas);

        // ✅ v4.3: Log de debug para verificar valores de Mata-Mata
        const totalMataMata = rodadasProcessadas.reduce(
            (sum, r) => sum + (r.mataMata || 0),
            0,
        );
        console.log(
            `[FLUXO-CORE] 📊 Total Mata-Mata calculado: R$ ${totalMataMata.toFixed(2)}`,
        );

        // Salvar no cache
        await this._salvarCacheMongoDB(
            ligaId,
            timeId,
            extrato,
            rodadaParaCalculo,
            "calculo_completo",
        );

        const saldoAcertosLogFinal = acertos?.resumo?.saldo ?? 0;
        // ✅ v6.6: Log mostra ambos os saldos (histórico vs pendente)
        console.log(
            `[FLUXO-CORE] ✅ Extrato: ${extrato.rodadas.length} rodadas | RESULTADO TEMPORADA: R$ ${extrato.resumo.saldo_temporada.toFixed(2)} | SALDO PENDENTE: R$ ${extrato.resumo.saldo.toFixed(2)} (acertos: R$ ${saldoAcertosLogFinal.toFixed(2)})${isInativo ? " | TRAVADO" : ""}`,
        );

        return extrato;
    }

    // =====================================================================
    // ✅ v5.0: VERIFICAR CACHE MONGODB COM SUPORTE A TEMPORADA FINALIZADA
    // ✅ v6.4: Passa temporada selecionada para API
    // =====================================================================
    async _verificarCacheMongoDB(ligaId, timeId, rodadaAtual, mercadoAberto) {
        try {
            const timestamp = Date.now();
            const temporada = window.temporadaAtual || CURRENT_SEASON;
            const url = `${API_BASE_URL}/api/extrato-cache/${ligaId}/times/${timeId}/cache/valido?rodadaAtual=${rodadaAtual}&mercadoAberto=${mercadoAberto}&temporada=${temporada}&_=${timestamp}`;

            const response = await fetch(url);
            if (!response.ok) return null;

            const cacheData = await response.json();

            if (cacheData.valido && cacheData.cached) {
                const temRodadasArray =
                    Array.isArray(cacheData.rodadas) ||
                    Array.isArray(cacheData.data);
                if (!temRodadasArray) return null;

                const rodadasArray = Array.isArray(cacheData.rodadas)
                    ? cacheData.rodadas
                    : cacheData.data;

                // ✅ v5.0: Detectar cache permanente de temporada finalizada
                const isPermanente = cacheData.permanente || cacheData.temporadaFinalizada;
                const statusMsg = isPermanente ? " | PERMANENTE" : (cacheData.extratoTravado ? " | TRAVADO" : "");

                console.log(
                    `[FLUXO-CORE] ⚡ Cache válido: ${rodadasArray?.length || 0} rodadas${statusMsg}`,
                );

                return { ...cacheData, rodadas: rodadasArray, permanente: isPermanente };
            }

            return null;
        } catch (error) {
            console.warn(
                `[FLUXO-CORE] Erro ao verificar cache:`,
                error.message,
            );
            return null;
        }
    }

    // =====================================================================
    // SALVAR CACHE MONGODB
    // =====================================================================
    async _salvarCacheMongoDB(
        ligaId,
        timeId,
        extrato,
        ultimaRodadaCalculada,
        motivo,
    ) {
        try {
            // ✅ v6.2 FIX: Não salvar cache se parecer incompleto (Timeline zerado sem posições)
            const rodadas = extrato.rodadas || [];
            if (rodadas.length >= 5) {
                const totalBonusOnus = rodadas.reduce((sum, r) => sum + (parseFloat(r.bonusOnus) || 0), 0);
                const temPosicoes = rodadas.some(r => r.posicao !== null && r.posicao !== undefined);

                if (totalBonusOnus === 0 && !temPosicoes) {
                    console.warn(`[FLUXO-CORE] ⚠️ Cache NÃO salvo: dados parecem incompletos (Timeline zerado, sem posições)`);
                    return; // Não salvar cache corrompido
                }
            }

            // ✅ v6.4: Incluir temporada selecionada no payload
            const temporada = window.temporadaAtual || CURRENT_SEASON;

            const payload = {
                historico_transacoes: extrato.rodadas,
                ultimaRodadaCalculada,
                motivoRecalculo: motivo,
                temporada, // ✅ v6.4: Temporada selecionada
                resumo: {
                    saldo: extrato.resumo.saldo,
                    totalGanhos: extrato.resumo.totalGanhos,
                    totalPerdas: extrato.resumo.totalPerdas,
                    bonus: extrato.resumo.bonus,
                    onus: extrato.resumo.onus,
                    pontosCorridos: extrato.resumo.pontosCorridos,
                    mataMata: extrato.resumo.mataMata,
                    top10: extrato.resumo.top10,
                    melhorMes: extrato.resumo.melhorMes,
                    artilheiro: extrato.resumo.artilheiro,
                    luvaOuro: extrato.resumo.luvaOuro,
                },
                // ✅ v4.1: Salvar info de inativo no cache
                inativo: extrato.inativo,
                rodadaDesistencia: extrato.rodadaDesistencia,
                extratoTravado: extrato.extratoTravado,
                rodadaTravada: extrato.rodadaTravada,
            };

            const response = await fetch(
                `${API_BASE_URL}/api/extrato-cache/${ligaId}/times/${timeId}/cache`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );

            if (response.ok) {
                console.log(
                    `[FLUXO-CORE] 💾 Cache salvo: R${ultimaRodadaCalculada}`,
                );
            }
        } catch (error) {
            console.warn(`[FLUXO-CORE] Erro ao salvar cache:`, error.message);
        }
    }

    // =====================================================================
    // PROCESSAR RODADA - v6.0: Config dinamica
    // =====================================================================
    async _processarRodadaIntegrada(
        timeId,
        rodada,
        ligaId,
        hasPontosCorridos,
    ) {
        const ranking = this.cache.getRankingRodada(rodada);
        if (!ranking || !ranking.length) {
            return this._criarRodadaVazia(rodada, hasPontosCorridos);
        }

        // ✅ v4.5: Obter totalParticipantesAtivos do primeiro registro (calculado pelo backend)
        const totalParticipantesAtivos =
            ranking[0]?.totalParticipantesAtivos || ranking.length;

        // ✅ v4.5: Filtrar apenas registros de participantes ATIVOS
        // Registros antigos de inativos têm posicao > totalParticipantesAtivos ou rodadaNaoJogada === true
        const rankingAtivos = ranking.filter((r) => {
            // Se tem rodadaNaoJogada true, é inativo
            if (r.rodadaNaoJogada === true) return false;
            // Se tem posicao definida e é maior que total de ativos, é registro antigo de inativo
            if (r.posicao && r.posicao > totalParticipantesAtivos) return false;
            return true;
        });

        // ✅ v4.5: Usar totalParticipantesAtivos como referência
        const totalTimes = totalParticipantesAtivos;

        // ✅ v4.5: Buscar o time no ranking de ativos
        const timeIdNorm = normalizarTimeId(timeId);
        const registroTime = rankingAtivos.find((r) => {
            const rTimeId = normalizarTimeId(r.timeId || r.time_id || r.id);
            return rTimeId === timeIdNorm;
        });

        if (!registroTime) {
            // Time não encontrado entre ativos (provavelmente inativo)
            return this._criarRodadaVazia(
                rodada,
                hasPontosCorridos,
                totalTimes,
            );
        }

        // ✅ v4.5: Usar posição já calculada pelo backend quando disponível
        const posicaoReal =
            registroTime.posicao ||
            rankingAtivos.findIndex(
                (r) =>
                    normalizarTimeId(r.timeId || r.time_id || r.id) ===
                    timeIdNorm,
            ) + 1;

        const isMito = posicaoReal === 1;
        const isMico = posicaoReal === totalTimes;

        // ✅ v6.0: Usar config dinamica para bonus/onus
        const bonusOnus = await this._calcularBonusOnus(
            posicaoReal,
            ligaId,
            rodada,
        );
        const pontosCorridos = hasPontosCorridos
            ? this.calcularPontosCorridosParaRodada(timeId, rodada)
            : null;
        const mataMata = this._calcularMataMataOtimizado(timeId, rodada);

        return {
            rodada,
            posicao: posicaoReal,
            totalTimes,
            bonusOnus,
            pontosCorridos,
            mataMata,
            melhorMes: 0,
            artilheiro: 0,
            luvaOuro: 0,
            top10: 0,
            top10Status: null,
            isMito,
            isMico,
        };
    }

    _criarRodadaVazia(rodada, hasPontosCorridos, totalTimes = 0) {
        return {
            rodada,
            posicao: null,
            totalTimes,
            bonusOnus: 0,
            pontosCorridos: hasPontosCorridos ? 0 : null,
            mataMata: 0,
            melhorMes: 0,
            artilheiro: 0,
            luvaOuro: 0,
            top10: 0,
            top10Status: null,
            isMito: false,
            isMico: false,
        };
    }

    _calcularMataMataOtimizado(timeId, rodada) {
        if (!this.mataMataIntegrado || this.mataMataMap.size === 0) {
            return 0;
        }
        const key = `${normalizarTimeId(timeId)}_${rodada}`;
        const valor = this.mataMataMap.get(key) || 0;

        // ✅ v4.3: Log apenas quando encontrar valor
        if (valor !== 0) {
            console.log(
                `[FLUXO-CORE] 🎯 MM R${rodada}: ${valor > 0 ? "+" : ""}${valor}`,
            );
        }

        return valor;
    }

    // =========================================================================
    // ✅ v6.2 FIX: Detectar cache incompleto (Timeline zerado anormalmente)
    // =========================================================================
    _detectarCacheIncompleto(rodadasArray, primeiraRodada, ligaId) {
        // Verificação básica: sem primeira rodada ou bonusOnus undefined
        if (!primeiraRodada || primeiraRodada.bonusOnus === undefined) {
            console.log(`[FLUXO-CORE] ⚠️ Cache incompleto: bonusOnus undefined`);
            return true;
        }

        // ✅ Verificar se módulo banco está habilitado
        // Se config não carregada ainda, assume banco habilitado (default)
        const bancoHabilitado = this.ligaConfig
            ? this._isModuloHabilitado('banco')
            : (this.cache?.modulosAtivos?.banco !== false);

        if (bancoHabilitado === false) {
            // Se banco explicitamente desabilitado, bonusOnus zerado é esperado
            return false;
        }

        // ✅ Verificar anomalia: muitas rodadas com bonusOnus = 0
        const MIN_RODADAS_PARA_VERIFICAR = 5;
        if (rodadasArray.length < MIN_RODADAS_PARA_VERIFICAR) {
            return false; // Poucos dados para detectar anomalia
        }

        // Calcular total de bonusOnus
        const totalBonusOnus = rodadasArray.reduce(
            (sum, r) => sum + (parseFloat(r.bonusOnus) || 0),
            0
        );

        // Se TODAS as rodadas têm bonusOnus = 0, provavelmente é anomalia
        // (participantes ativos sempre têm alguns G/Z ao longo da temporada)
        if (totalBonusOnus === 0) {
            // Verificar se há posições definidas
            const temPosicoesDefinidas = rodadasArray.some(
                r => r.posicao !== null && r.posicao !== undefined
            );

            if (!temPosicoesDefinidas) {
                console.log(`[FLUXO-CORE] ⚠️ Cache incompleto detectado: Timeline zerado e sem posições definidas`);
                return true;
            }
        }

        return false;
    }

    _recalcularResumoDoCache(rodadasArray, camposEditaveis) {
        let bonus = 0,
            onus = 0,
            pontosCorridos = 0,
            mataMata = 0,
            top10 = 0,
            melhorMes = 0,
            artilheiro = 0,
            luvaOuro = 0,
            totalGanhos = 0,
            totalPerdas = 0;

        for (const rodada of rodadasArray) {
            const bonusOnusValor = parseFloat(rodada.bonusOnus) || 0;
            if (bonusOnusValor > 0) {
                bonus += bonusOnusValor;
                totalGanhos += bonusOnusValor;
            } else if (bonusOnusValor < 0) {
                onus += bonusOnusValor;
                totalPerdas += Math.abs(bonusOnusValor);
            }

            const pcValor = parseFloat(rodada.pontosCorridos) || 0;
            pontosCorridos += pcValor;
            if (pcValor > 0) totalGanhos += pcValor;
            else if (pcValor < 0) totalPerdas += Math.abs(pcValor);

            const mmValor = parseFloat(rodada.mataMata) || 0;
            mataMata += mmValor;
            if (mmValor > 0) totalGanhos += mmValor;
            else if (mmValor < 0) totalPerdas += Math.abs(mmValor);

            const t10Valor = parseFloat(rodada.top10) || 0;
            top10 += t10Valor;
            if (t10Valor > 0) totalGanhos += t10Valor;
            else if (t10Valor < 0) totalPerdas += Math.abs(t10Valor);

            const melhorMesValor = parseFloat(rodada.melhorMes) || 0;
            melhorMes += melhorMesValor;

            const artilheiroValor = parseFloat(rodada.artilheiro) || 0;
            artilheiro += artilheiroValor;

            const luvaOuroValor = parseFloat(rodada.luvaOuro) || 0;
            luvaOuro += luvaOuroValor;
        }

        return {
            bonus,
            onus,
            pontosCorridos,
            mataMata,
            top10,
            melhorMes,
            artilheiro,
            luvaOuro,
            totalGanhos,
            totalPerdas,
            saldo: 0,
        };
    }

    // ✅ v6.0: Calcular bonus/onus usando config dinamica
    async _calcularBonusOnus(posicaoReal, ligaId, rodada = null) {
        // Usar valores do config carregado
        const valores = await this._getValoresBanco(ligaId, rodada || 1);
        return valores[posicaoReal] || valores[String(posicaoReal)] || 0;
    }

    calcularPontosCorridosParaRodada(timeId, rodada) {
        if (rodada < RODADA_INICIAL_PONTOS_CORRIDOS) return null;
        const idxRodada = rodada - RODADA_INICIAL_PONTOS_CORRIDOS;
        const confrontos = this.cache.getConfrontosPontosCorridos();
        if (!confrontos || idxRodada >= confrontos.length) return null;

        const jogos = confrontos[idxRodada];
        if (!jogos || jogos.length === 0) return null;

        const timeIdNorm = normalizarTimeId(timeId);
        const confronto = jogos.find(
            (j) =>
                normalizarTimeId(j.timeA?.id || j.timeA?.time_id) ===
                    timeIdNorm ||
                normalizarTimeId(j.timeB?.id || j.timeB?.time_id) ===
                    timeIdNorm,
        );

        if (!confronto) return null;

        const ranking = this.cache.getRankingRodada(rodada);
        if (!ranking) return null;

        const timeA_id = normalizarTimeId(
            confronto.timeA?.id || confronto.timeA?.time_id,
        );
        const timeB_id = normalizarTimeId(
            confronto.timeB?.id || confronto.timeB?.time_id,
        );

        const dadosTimeA = ranking.find(
            (r) => normalizarTimeId(r.timeId || r.time_id || r.id) === timeA_id,
        );
        const dadosTimeB = ranking.find(
            (r) => normalizarTimeId(r.timeId || r.time_id || r.id) === timeB_id,
        );

        if (!dadosTimeA || !dadosTimeB) return null;

        const resultado = calcularFinanceiroConfronto(
            parseFloat(dadosTimeA.pontos),
            parseFloat(dadosTimeB.pontos),
        );
        return timeA_id === timeIdNorm
            ? resultado.financeiroA
            : resultado.financeiroB;
    }

    _acumularValoresIntegrados(resumo, r, hasPontosCorridos) {
        if (r.bonusOnus > 0) resumo.bonus += r.bonusOnus;
        if (r.bonusOnus < 0) resumo.onus += r.bonusOnus;
        if (hasPontosCorridos && typeof r.pontosCorridos === "number")
            resumo.pontosCorridos += r.pontosCorridos;
        resumo.mataMata += r.mataMata || 0;
        resumo.top10 += r.top10 || 0;
        resumo.melhorMes += r.melhorMes || 0;
        resumo.artilheiro += r.artilheiro || 0;
        resumo.luvaOuro += r.luvaOuro || 0;
    }

    // ✅ v6.2 FIX: Corrigido para setar r.saldoAcumulado (não r.saldo)
    // r.saldo = saldo INDIVIDUAL da rodada
    // r.saldoAcumulado = soma progressiva de todas as rodadas
    _calcularSaldoAcumulado(rodadas) {
        let saldoAcumulado = 0;
        rodadas.forEach((r) => {
            // Calcular saldo individual da rodada (se não estiver definido)
            if (r.saldo === undefined || r.saldo === null) {
                r.saldo =
                    (parseFloat(r.bonusOnus) || 0) +
                    (parseFloat(r.pontosCorridos) || 0) +
                    (parseFloat(r.mataMata) || 0) +
                    (parseFloat(r.top10) || 0);
            }
            // Acumular progressivamente
            saldoAcumulado += parseFloat(r.saldo) || 0;
            r.saldoAcumulado = saldoAcumulado;
        });
    }

    /**
     * ✅ v6.6: Calcula RESULTADO DA TEMPORADA (histórico, imutável)
     * NÃO inclui acertos - representa o que o participante ganhou/perdeu
     */
    _calcularSaldoTemporada(resumo) {
        const pontosCorridos =
            resumo.pontosCorridos === null ? 0 : (resumo.pontosCorridos || 0);
        return (
            (resumo.bonus || 0) +
            (resumo.onus || 0) +
            pontosCorridos +
            (resumo.mataMata || 0) +
            (resumo.top10 || 0) +
            // ✅ v6.13 FIX: Incluir módulos opcionais no saldo (casamento com tesouraria)
            (resumo.melhorMes || 0) +
            (resumo.artilheiro || 0) +
            (resumo.luvaOuro || 0) +
            (resumo.campo1 || 0) +
            (resumo.campo2 || 0) +
            (resumo.campo3 || 0) +
            (resumo.campo4 || 0)
        );
    }

    /**
     * ✅ v6.6: Calcula SALDO PENDENTE (operacional)
     * Inclui acertos - representa o que ainda deve/tem a receber
     */
    _calcularSaldoFinal(resumo) {
        // ✅ v6.6: Saldo temporada (histórico) + acertos = saldo pendente
        // ✅ v6.13 FIX: Guard contra NaN (se algum campo do resumo for undefined)
        // ✅ v6.9 FIX: Incluir lançamentos iniciais (inscrição, legado, dívida)
        // ✅ I6 FIX: Incluir saldoAjustes (AjusteFinanceiro 2026+) propagado do backend
        const saldoTemporada = this._calcularSaldoTemporada(resumo);
        const saldoAcertos = resumo.saldo_acertos || 0;
        const saldoLancamentosIniciais = resumo.saldo_lancamentos_iniciais || 0;
        const saldoAjustes = resumo.saldoAjustes || 0;
        return (isNaN(saldoTemporada) ? 0 : saldoTemporada) + saldoAcertos + saldoLancamentosIniciais + saldoAjustes;
    }

    _calcularTotaisConsolidados(resumo, rodadas) {
        resumo.totalGanhos = 0;
        resumo.totalPerdas = 0;

        if (rodadas) {
            rodadas.forEach((r) => {
                const val =
                    (r.bonusOnus || 0) +
                    (r.pontosCorridos || 0) +
                    (r.mataMata || 0) +
                    (r.top10 || 0) +
                    (r.melhorMes || 0) +
                    (r.artilheiro || 0) +
                    (r.luvaOuro || 0);
                if (val > 0) resumo.totalGanhos += val;
                else resumo.totalPerdas += val;
            });
        }

        [1, 2, 3, 4].forEach((i) => {
            const val = resumo[`campo${i}`];
            if (val > 0) resumo.totalGanhos += val;
            else resumo.totalPerdas += val;
        });
    }

    // ✅ v6.0: Usar config dinamica para valores de Top10
    async buscarDadosTop10(timeId) {
        try {
            const { garantirDadosCarregados } = await import("../top10.js");
            const { mitos, micos } = await garantirDadosCarregados();

            const ligaId = obterLigaId();

            // ✅ v6.0: Carregar config e obter valores dinamicos
            await this._carregarLigaConfig(ligaId);
            const { mitos: valoresMitos, micos: valoresMicos } = this._getValoresTop10();

            const timeIdNormalizado = normalizarTimeId(timeId);
            const historico = [];

            mitos.forEach((mito, idx) => {
                if (normalizarTimeId(mito.timeId) === timeIdNormalizado) {
                    const posicao = idx + 1;
                    historico.push({
                        rodada: mito.rodada,
                        valor: valoresMitos[posicao] || valoresMitos[String(posicao)] || 0,
                        status: "MITO",
                        posicao: posicao,
                    });
                }
            });

            micos.forEach((mico, idx) => {
                if (normalizarTimeId(mico.timeId) === timeIdNormalizado) {
                    const posicao = idx + 1;
                    historico.push({
                        rodada: mico.rodada,
                        valor: valoresMicos[posicao] || valoresMicos[String(posicao)] || 0,
                        status: "MICO",
                        posicao: posicao,
                    });
                }
            });

            return historico;
        } catch (e) {
            console.warn("[FLUXO-CORE] Erro ao buscar Top10:", e);
            return [];
        }
    }

    async carregarParticipantes() {
        return await this.cache.carregarParticipantes();
    }

    async buscarParticipante(timeId) {
        const parts = await this.carregarParticipantes();
        return parts.find((p) => String(p.time_id) === String(timeId));
    }
}

window.forcarRefreshExtrato = async function (timeId) {
    const ligaId = window.obterLigaId();
    const temporadaAtual = window.temporadaAtual || CURRENT_SEASON;
    const TEMPORADA_CARTOLA = 2026; // Temporada atual da API Cartola

    console.log(
        `[FLUXO-CORE] 🔄 Forçando refresh do extrato para time ${timeId} (temporada ${temporadaAtual})...`,
    );

    // ✅ v6.6: BLOQUEAR invalidação de cache para temporadas históricas
    // Temporadas anteriores são IMUTÁVEIS - dados congelados permanentemente
    if (temporadaAtual < TEMPORADA_CARTOLA) {
        console.warn(`[FLUXO-CORE] 🔒 Temporada ${temporadaAtual} é histórica - cache protegido (imutável)`);
        SuperModal.toast.info(`Temporada ${temporadaAtual} está encerrada. Os dados são históricos e não podem ser recalculados.`);
        return;
    }

    try {
        await fetch(
            `${API_BASE_URL}/api/extrato-cache/${ligaId}/times/${timeId}/cache`,
            { method: "DELETE" },
        );
        console.log(`[FLUXO-CORE] 🗑️ Cache invalidado`);
    } catch (error) {
        console.warn("[FLUXO-CORE] Erro ao invalidar cache:", error);
    }

    // ✅ v5.1: Recarrega apenas o extrato, sem reload da página
    if (window.selecionarParticipante) {
        await window.selecionarParticipante(timeId);
        console.log(`[FLUXO-CORE] ✅ Extrato recarregado para time ${timeId}`);
    } else {
        // Fallback: reload da página se função não disponível
        window.location.reload();
    }
};

console.log("[FLUXO-CORE] ✅ v6.10 - Fix defaults inconsistentes (|| 2025 → || CURRENT_SEASON) + v6.9 FIX lancamentos iniciais no saldo");
