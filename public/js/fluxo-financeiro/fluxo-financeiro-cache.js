// FLUXO-FINANCEIRO-CACHE.JS v5.0 - SaaS DINAMICO
// ✅ VERSÃO 4.1 - Integração completa com backend cache + verificação de módulos ativos
// ✅ VERSÃO 5.0 - SaaS Dinamico - usa LigaConfigService para configs

import { CURRENT_SEASON } from "../config/seasons-client.js";
import {
    getRankingRodadaEspecifica,
    getRankingsEmLote,
    preCarregarRodadas,
} from "../rodadas.js";
import {
    obterLigaId,
    getConfrontosLigaPontosCorridos,
    gerarConfrontos,
    buscarTimesLiga,
} from "../pontos-corridos-utils.js";
import { getResultadosMelhorMes } from "../melhor-mes.js";
import { filtrarDadosPorTimesLigaEspecial } from "../filtro-liga-especial.js";
import {
    gerarRankingSimulado,
} from "./fluxo-financeiro-utils.js";
import { fetchLigaConfig } from "../rodadas/rodadas-config.js";

import { cacheManager } from "../core/cache-manager.js";

// ===== CONSTANTES =====
const API_BASE_URL = window.location.origin;
const TTL_CACHE_MEMORIA = 30 * 60 * 1000; // 30 minutos para IndexedDB local

// Cache em memória para sessão
const cache = new Map();
let ultimaAtualizacaoManual = null;

export class FluxoFinanceiroCache {
    constructor() {
        this.cacheRankings = {};
        this.cacheConfrontosLPC = [];
        this.cacheResultadosMM = [];
        this.cacheResultadosMelhorMes = [];
        this.cacheFrontosPontosCorridos = [];
        this.timesLiga = [];
        this.participantes = [];
        this.ligaId = null;
        this.ultimaRodadaCompleta = 0;
        this.cacheManager = cacheManager;

        // ✅ v6.0 FIX: Controle de cache MongoDB COM TEMPORADA
        // CRÍTICO: Chave deve incluir temporada para evitar mistura de dados
        this.extratosCacheados = new Map(); // `${timeId}_${temporada}` -> extrato
        this.statusMercado = null;

        // ✅ v5.2: Cache de inscrições 2026
        this.inscricoes2026 = new Map(); // timeId -> inscricao

        // ✅ v5.1: Módulos ativos da liga (defaults corrigidos)
        // IMPORTANTE: Valores alinhados com config/modulos-defaults.js
        this.modulosAtivos = {
            "mata-mata": false,        // Precisa ser habilitado na liga
            "melhor-mes": false,       // Precisa ser habilitado na liga
            "pontos-corridos": false,  // Precisa ser habilitado na liga
            "luva-de-ouro": false,     // Precisa ser habilitado na liga
            "artilheiro-campeao": false, // Precisa ser habilitado na liga
        };
    }

    // ===================================================================
    // ✅ v5.0: BUSCAR MÓDULOS ATIVOS DA LIGA (via configuracoes endpoint)
    // ===================================================================
    async _buscarModulosAtivos() {
        try {
            // v5.0: Usar o endpoint de configuracoes que ja tem modulos_ativos
            const config = await fetchLigaConfig(this.ligaId);

            if (config?.modulos_ativos) {
                // Formato: { mataMata: true, melhorMes: false, pontosCorridos: true, ... }
                const modulos = config.modulos_ativos;

                // Mapear para o formato com hifen
                if (modulos.mataMata !== undefined) this.modulosAtivos["mata-mata"] = modulos.mataMata;
                if (modulos.melhorMes !== undefined) this.modulosAtivos["melhor-mes"] = modulos.melhorMes;
                if (modulos.pontosCorridos !== undefined) this.modulosAtivos["pontos-corridos"] = modulos.pontosCorridos;
                if (modulos.luvaDeOuro !== undefined) this.modulosAtivos["luva-de-ouro"] = modulos.luvaDeOuro;
                if (modulos.artilheiroCampeao !== undefined) this.modulosAtivos["artilheiro-campeao"] = modulos.artilheiroCampeao;

                console.log(
                    "[FLUXO-CACHE] 📋 Módulos ativos (via config):",
                    this.modulosAtivos,
                );
                return;
            }

            // Verificar em configuracoes.{modulo}.habilitado
            if (config?.configuracoes) {
                const cfg = config.configuracoes;
                if (cfg.mata_mata?.habilitado !== undefined) this.modulosAtivos["mata-mata"] = cfg.mata_mata.habilitado;
                if (cfg.melhor_mes?.habilitado !== undefined) this.modulosAtivos["melhor-mes"] = cfg.melhor_mes.habilitado;
                if (cfg.pontos_corridos?.habilitado !== undefined) this.modulosAtivos["pontos-corridos"] = cfg.pontos_corridos.habilitado;
                if (cfg.luva_ouro?.habilitado !== undefined) this.modulosAtivos["luva-de-ouro"] = cfg.luva_ouro.habilitado;
                if (cfg.artilheiro?.habilitado !== undefined) this.modulosAtivos["artilheiro-campeao"] = cfg.artilheiro.habilitado;

                console.log(
                    "[FLUXO-CACHE] 📋 Módulos (via configuracoes):",
                    this.modulosAtivos,
                );
                return;
            }

            console.log("[FLUXO-CACHE] ℹ️ Usando módulos padrão (todos ativos)");
        } catch (error) {
            console.warn("[FLUXO-CACHE] Erro ao buscar módulos:", error.message);
            console.log("[FLUXO-CACHE] ℹ️ Usando módulos padrão (todos ativos)");
        }
    }

    // ✅ NOVO v4.1: Verificar se módulo está ativo
    // v4.2: Diferenciar módulos BASE (sempre ativos) vs OPCIONAIS
    isModuloAtivo(modulo) {
        // Módulos BASE usam !== false (default true)
        const modulosBase = ['banco', 'extrato', 'ranking', 'rodadas', 'historico'];
        if (modulosBase.includes(modulo)) {
            return this.modulosAtivos[modulo] !== false;
        }
        // Módulos OPCIONAIS usam === true (default false)
        return this.modulosAtivos[modulo] === true;
    }

    // ===================================================================
    // ✅ NOVO: BUSCAR EXTRATO DO CACHE MONGODB (PRIORIDADE MÁXIMA)
    // ===================================================================
    async buscarExtratoCacheado(timeId, rodadaAtual, mercadoAberto = false) {
        try {
            // ✅ v5.3: Usar temporada selecionada
            const temporada = window.temporadaAtual || CURRENT_SEASON;
            console.log(
                `[FLUXO-CACHE] 🔍 Verificando cache MongoDB para time ${timeId} (temporada ${temporada})...`,
            );

            const url = `${API_BASE_URL}/api/extrato-cache/${this.ligaId}/times/${timeId}/cache/valido?rodadaAtual=${rodadaAtual}&mercadoAberto=${mercadoAberto}&temporada=${temporada}`;

            const response = await fetch(url);

            if (!response.ok) {
                console.log(
                    `[FLUXO-CACHE] ⚠️ Cache não encontrado (${response.status})`,
                );
                return null;
            }

            const cacheData = await response.json();

            if (cacheData.valido && cacheData.cached) {
                console.log(`[FLUXO-CACHE] ⚡ CACHE MONGODB VÁLIDO!`, {
                    motivo: cacheData.motivo,
                    permanente: cacheData.permanente,
                    rodadas: cacheData.rodadas?.length || 0,
                    saldo: cacheData.resumo?.saldo,
                });

                // ✅ v6.0 FIX: Armazenar com chave composta timeId_temporada
                const cacheKey = `${timeId}_${temporada}`;
                this.extratosCacheados.set(cacheKey, cacheData);

                return cacheData;
            }

            // Cache existe mas não é válido - retornar info para cálculo parcial
            if (!cacheData.valido) {
                console.log(
                    `[FLUXO-CACHE] ⚠️ Cache inválido: ${cacheData.motivo}`,
                    {
                        cacheRodada: cacheData.cacheRodada,
                        rodadaAtual: cacheData.rodadaAtual,
                        rodadasPendentes: cacheData.rodadasPendentes,
                    },
                );

                return {
                    valido: false,
                    parcial: true,
                    cacheRodada: cacheData.cacheRodada || 0,
                    rodadasPendentes: cacheData.rodadasPendentes || rodadaAtual,
                };
            }

            return null;
        } catch (error) {
            console.warn(
                `[FLUXO-CACHE] ❌ Erro ao verificar cache MongoDB:`,
                error.message,
            );
            return null;
        }
    }

    // ===================================================================
    // ✅ NOVO: SALVAR EXTRATO NO CACHE MONGODB
    // ===================================================================
    async salvarExtratoCacheado(
        timeId,
        extrato,
        rodadaCalculada,
        motivo = "calculo_frontend",
    ) {
        try {
            // ✅ v5.3: Usar temporada selecionada
            const temporada = window.temporadaAtual || CURRENT_SEASON;
            console.log(
                `[FLUXO-CACHE] 💾 Salvando cache MongoDB para time ${timeId} (temporada ${temporada})...`,
            );

            const payload = {
                historico_transacoes: extrato.rodadas || [],
                ultimaRodadaCalculada: rodadaCalculada,
                motivoRecalculo: motivo,
                temporada, // ✅ v5.3: Temporada selecionada
                resumo: extrato.resumo || {},
                saldo: extrato.resumo?.saldo || 0,
            };

            const response = await fetch(
                `${API_BASE_URL}/api/extrato-cache/${this.ligaId}/times/${timeId}/cache`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );

            if (response.ok) {
                console.log(`[FLUXO-CACHE] ✅ Cache MongoDB salvo com sucesso`);

                // ✅ v6.0 FIX: Atualizar cache em memória com chave composta
                const cacheKey = `${timeId}_${temporada}`;
                this.extratosCacheados.set(cacheKey, {
                    valido: true,
                    cached: true,
                    rodadas: extrato.rodadas,
                    resumo: extrato.resumo,
                    ultimaRodadaCalculada: rodadaCalculada,
                    temporada: temporada,
                });

                return true;
            }

            console.warn(
                `[FLUXO-CACHE] ⚠️ Erro ao salvar cache: ${response.status}`,
            );
            return false;
        } catch (error) {
            console.error(
                `[FLUXO-CACHE] ❌ Erro ao salvar cache MongoDB:`,
                error,
            );
            return false;
        }
    }

    // ===================================================================
    // ✅ NOVO: INVALIDAR CACHE DE UM TIME
    // ✅ v5.3: Passa temporada para invalidar cache correto
    // ===================================================================
    async invalidarCacheTime(timeId) {
        try {
            const temporada = window.temporadaAtual || CURRENT_SEASON;
            console.log(
                `[FLUXO-CACHE] 🗑️ Invalidando cache do time ${timeId} (temporada ${temporada})...`,
            );

            const response = await fetch(
                `${API_BASE_URL}/api/extrato-cache/${this.ligaId}/times/${timeId}/cache?temporada=${temporada}`,
                { method: "DELETE" },
            );

            // ✅ v6.0 FIX: Limpar cache em memória com chave composta
            const cacheKey = `${timeId}_${temporada}`;
            this.extratosCacheados.delete(cacheKey);

            if (response.ok) {
                console.log(`[FLUXO-CACHE] ✅ Cache invalidado com sucesso`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`[FLUXO-CACHE] ❌ Erro ao invalidar cache:`, error);
            return false;
        }
    }

    // ===================================================================
    // INICIALIZAÇÃO (LAZY LOADING - carrega módulos sob demanda)
    // ===================================================================
    async inicializar(ligaId) {
        console.log("[FLUXO-CACHE] 🚀 Inicializando cache para liga:", ligaId);
        const startTime = performance.now();

        this.ligaId = ligaId || obterLigaId();

        if (!this.ligaId) {
            console.error("[FLUXO-CACHE] ❌ ligaId não disponível");
            return;
        }

        window.ligaId = this.ligaId;

        // ✅ FASE 1: Buscar configs em PARALELO (essenciais)
        await Promise.all([
            this._buscarStatusMercado(),
            this._buscarModulosAtivos(),
        ]);

        console.log("[FLUXO-CACHE] ✅ ligaId confirmado:", this.ligaId);

        // Determinar última rodada completa
        const rodadaAtual = this.statusMercado?.rodada_atual || 38;
        const mercadoAberto = this.statusMercado?.status_mercado === 1;
        this.ultimaRodadaCompleta = mercadoAberto
            ? Math.max(1, rodadaAtual - 1)
            : rodadaAtual;

        console.log(
            `[FLUXO-CACHE] 📊 Rodada atual: ${rodadaAtual}, Mercado: ${mercadoAberto ? "aberto" : "fechado"}, Última completa: ${this.ultimaRodadaCompleta}`,
        );

        // ✅ FASE 2: Carregar participantes + inscrições 2026 (essencial para listagem)
        await this.carregarParticipantes();
        await this.carregarInscricoes2026();

        // ✅ LAZY: Rankings e dados externos serão carregados sob demanda
        // quando o usuário clicar em um participante para ver extrato
        this._dadosExternosCarregados = false;

        // ✅ v5.2: Expor função global para a UI acessar status de inscrição
        window.getStatusInscricao2026 = (timeId) => this.getStatusInscricao2026(timeId);

        const elapsed = Math.round(performance.now() - startTime);
        console.log(`[FLUXO-CACHE] ✅ Cache básico inicializado em ${elapsed}ms (lazy loading ativo)`);
    }

    // ===================================================================
    // ✅ NOVO: Carregar dados completos sob demanda (lazy loading)
    // ===================================================================
    async carregarDadosCompletos() {
        if (this._dadosExternosCarregados) {
            console.log("[FLUXO-CACHE] ⚡ Dados já carregados");
            return;
        }

        console.log("[FLUXO-CACHE] 🔄 Carregando dados completos (sob demanda)...");
        const startTime = performance.now();

        // Carregar tudo em paralelo
        await Promise.all([
            this.carregarCacheRankingsEmLotes(this.ultimaRodadaCompleta, null),
            this.carregarDadosPontosCorridos(),
            this.carregarDadosExternos(),
        ]);

        this._dadosExternosCarregados = true;

        const elapsed = Math.round(performance.now() - startTime);
        console.log(`[FLUXO-CACHE] ✅ Dados completos carregados em ${elapsed}ms`);
    }

    // ===================================================================
    // ✅ NOVO: Buscar status do mercado (usado para validação de cache)
    // ===================================================================
    async _buscarStatusMercado() {
        try {
            const response = await fetch("/api/cartola/mercado/status");
            if (response.ok) {
                this.statusMercado = await response.json();
                console.log("[FLUXO-CACHE] 📡 Status mercado:", {
                    rodada: this.statusMercado.rodada_atual,
                    aberto: this.statusMercado.status_mercado === 1,
                });
            }
        } catch (error) {
            console.warn(
                "[FLUXO-CACHE] ⚠️ Erro ao buscar status mercado:",
                error,
            );
            this.statusMercado = { rodada_atual: 38, status_mercado: 2 };
        }
    }

    getUltimaRodadaCompleta() {
        return this.ultimaRodadaCompleta;
    }

    setUltimaRodadaCompleta(rodada) {
        this.ultimaRodadaCompleta = rodada;
    }

    setParticipantes(participantes) {
        this.participantes = participantes || [];
    }

    // ===================================================================
    // CARREGAR PARTICIPANTES (mantido)
    // ===================================================================
    async carregarParticipantes() {
        const ligaId = this.ligaId || obterLigaId();
        if (!ligaId) {
            this.participantes = [];
            return [];
        }

        const cacheKey = `participantes_${ligaId}`;

        try {
            const data = await this.cacheManager.get(
                "participantes",
                cacheKey,
                async () => {
                    const response = await fetch(`/api/ligas/${ligaId}/times`);
                    if (!response.ok)
                        throw new Error(
                            `Erro ao buscar participantes: ${response.statusText}`,
                        );
                    return await response.json();
                },
            );

            if (!data || !Array.isArray(data) || data.length === 0) {
                this.participantes = [];
                return [];
            }

            this.participantes = data
                .map((p) => {
                    const nomeCartolaFinal =
                        p.nome_cartola || p.nome_cartoleiro || "N/D";
                    const nomeTimeFinal = p.nome_time || "Time S/ Nome";
                    const nomeFinalParaExibir =
                        nomeCartolaFinal === "N/D"
                            ? nomeTimeFinal !== "Time S/ Nome"
                                ? nomeTimeFinal
                                : "Participante S/ Nome"
                            : nomeCartolaFinal;
                    const timeId = String(p.id || p.time_id || p.timeId);

                    return {
                        time_id: timeId,
                        timeId: timeId,
                        id: timeId,
                        nome_cartola: nomeFinalParaExibir,
                        nome_time: nomeTimeFinal,
                        clube_id: p.clube_id,
                        url_escudo_png: p.url_escudo_png,
                        escudo_url: p.escudo_url,
                    };
                })
                .sort((a, b) =>
                    (a.nome_cartola || "").localeCompare(b.nome_cartola || ""),
                );

            return this.participantes;
        } catch (error) {
            console.error(
                "[FLUXO-CACHE] Erro ao carregar participantes:",
                error,
            );
            this.participantes = [];
            return [];
        }
    }

    // ===================================================================
    // ✅ v5.2: Carregar inscrições temporada 2026
    // ===================================================================
    async carregarInscricoes2026() {
        const ligaId = this.ligaId || obterLigaId();
        if (!ligaId) return new Map();

        try {
            const response = await fetch(`/api/inscricoes/${ligaId}/2026`);
            if (!response.ok) {
                console.warn('[FLUXO-CACHE] Nenhuma inscrição 2026 encontrada');
                return this.inscricoes2026;
            }

            const data = await response.json();
            if (data.success && data.inscricoes) {
                this.inscricoes2026.clear();
                data.inscricoes.forEach(insc => {
                    this.inscricoes2026.set(String(insc.time_id), insc);
                });
                console.log(`[FLUXO-CACHE] ✅ ${this.inscricoes2026.size} inscrições 2026 carregadas`);
            }

            return this.inscricoes2026;
        } catch (error) {
            console.error('[FLUXO-CACHE] Erro ao carregar inscrições 2026:', error);
            return this.inscricoes2026;
        }
    }

    /**
     * Retorna o status de inscrição de um participante
     * @param {string|number} timeId
     * @returns {object} { status, pagouInscricao, inscricaoQuitada, badgeClass, badgeIcon, badgeText }
     */
    getStatusInscricao2026(timeId) {
        const inscricao = this.inscricoes2026.get(String(timeId));

        if (!inscricao) {
            return {
                status: 'pendente',
                pagouInscricao: null,
                inscricaoQuitada: false,
                badgeClass: 'badge-2026-pendente',
                badgeIcon: 'schedule',
                badgeText: 'Pendente'
            };
        }

        // ✅ v2.2 FIX: Considerar inscrição quitada se:
        // 1. pagou_inscricao === true (pagou diretamente) OU
        // 2. Saldo transferido >= taxa (crédito cobriu a inscrição)
        // NOTA: legado_manual.tipo_quitacao='zerado' é sobre SALDO 2025, não sobre inscrição 2026
        const pagouDiretamente = inscricao.pagou_inscricao === true;
        const saldoCobriuTaxa = (inscricao.saldo_transferido || 0) >= (inscricao.taxa_inscricao || 0) && (inscricao.taxa_inscricao || 0) > 0;
        const inscricaoQuitada = pagouDiretamente || saldoCobriuTaxa;

        const statusMap = {
            'renovado': {
                status: 'renovado',
                pagouInscricao: inscricao.pagou_inscricao,
                inscricaoQuitada,
                badgeClass: inscricaoQuitada ? 'badge-2026-renovado' : 'badge-2026-renovado-devendo',
                badgeIcon: 'check_circle',
                badgeText: 'Renovado'
            },
            'novo': {
                status: 'novo',
                pagouInscricao: inscricao.pagou_inscricao,
                inscricaoQuitada,
                badgeClass: inscricaoQuitada ? 'badge-2026-novo' : 'badge-2026-novo-devendo',
                badgeIcon: 'person_add',
                badgeText: 'Novo'
            },
            'nao_participa': {
                status: 'nao_participa',
                pagouInscricao: null,
                inscricaoQuitada: true, // Não deve se não participa
                badgeClass: 'badge-2026-nao-participa',
                badgeIcon: 'cancel',
                badgeText: 'Saiu'
            }
        };

        return statusMap[inscricao.status] || {
            status: inscricao.status || 'pendente',
            pagouInscricao: null,
            inscricaoQuitada: false,
            badgeClass: 'badge-2026-pendente',
            badgeIcon: 'schedule',
            badgeText: 'Pendente'
        };
    }

    // ===================================================================
    // ✅ OTIMIZADO: Carregamento de Rankings com BATCH LOADING
    // ===================================================================
    async carregarCacheRankingsEmLotes(ultimaRodadaCompleta, container) {
        console.log(
            `[FLUXO-CACHE] 🚀 Carregando rodadas 1-${ultimaRodadaCompleta} em LOTE...`,
        );

        try {
            // ✅ USAR BATCH LOADING - UMA ÚNICA REQUISIÇÃO!
            const rodadasAgrupadas = await getRankingsEmLote(
                this.ligaId,
                1,
                ultimaRodadaCompleta,
                false,
            );

            // Transferir para cache local
            Object.keys(rodadasAgrupadas).forEach((rodada) => {
                this.cacheRankings[parseInt(rodada)] = rodadasAgrupadas[rodada];
            });

            const totalRodadas = Object.keys(rodadasAgrupadas).length;
            console.log(
                `[FLUXO-CACHE] ✅ ${totalRodadas} rodadas carregadas em 1 requisição!`,
            );

            this._atualizarProgresso(
                container,
                100,
                1,
                ultimaRodadaCompleta,
                ultimaRodadaCompleta,
            );
        } catch (error) {
            console.error(`[FLUXO-CACHE] ❌ Erro no batch loading:`, error);

            // ✅ FALLBACK: Carregar individualmente se batch falhar
            console.log(`[FLUXO-CACHE] 🔄 Tentando fallback individual...`);
            await this._carregarRodadasIndividualmente(
                ultimaRodadaCompleta,
                container,
            );
        }
    }

    // ✅ FALLBACK: Carregamento individual (só se batch falhar)
    async _carregarRodadasIndividualmente(ultimaRodadaCompleta, container) {
        const rodadasFaltantes = [];

        for (let rodada = 1; rodada <= ultimaRodadaCompleta; rodada++) {
            const cacheKey = `ranking_${this.ligaId}_${rodada}`;
            const cached = await this.cacheManager.get(
                "rankings",
                cacheKey,
                null,
                { force: false },
            );

            if (!cached || !Array.isArray(cached) || cached.length === 0) {
                rodadasFaltantes.push(rodada);
            } else {
                this.cacheRankings[rodada] = cached;
            }
        }

        if (rodadasFaltantes.length === 0) {
            console.log(
                `[FLUXO-CACHE] ✅ Todas as ${ultimaRodadaCompleta} rodadas já estão em cache`,
            );
            this._atualizarProgresso(
                container,
                100,
                1,
                ultimaRodadaCompleta,
                ultimaRodadaCompleta,
            );
            return;
        }

        console.log(
            `[FLUXO-CACHE] 📥 Buscando ${rodadasFaltantes.length} rodadas faltantes individualmente`,
        );

        const rodadasPorLote = 5;
        const totalLotes = Math.ceil(rodadasFaltantes.length / rodadasPorLote);

        for (let loteIdx = 0; loteIdx < totalLotes; loteIdx++) {
            const inicio = loteIdx * rodadasPorLote;
            const fim = Math.min(
                inicio + rodadasPorLote,
                rodadasFaltantes.length,
            );
            const rodadasDoLote = rodadasFaltantes.slice(inicio, fim);

            await Promise.all(
                rodadasDoLote.map((rodada) => this._carregarRodada(rodada)),
            );

            const progresso = Math.round((fim / rodadasFaltantes.length) * 100);
            this._atualizarProgresso(
                container,
                progresso,
                rodadasDoLote[0],
                rodadasDoLote[rodadasDoLote.length - 1],
                ultimaRodadaCompleta,
            );
        }

        console.log(
            `[FLUXO-CACHE] ✅ Cache completo com ${ultimaRodadaCompleta} rodadas (fallback)`,
        );
    }

    async _carregarRodada(rodada) {
        const cacheKey = `ranking_${this.ligaId}_${rodada}`;

        try {
            const ranking = await this.cacheManager.get(
                "rankings",
                cacheKey,
                async () => {
                    console.log(
                        `[FLUXO-CACHE] 🌐 Buscando rodada ${rodada} da API...`,
                    );
                    const data = await getRankingRodadaEspecifica(
                        this.ligaId,
                        rodada,
                    );

                    if (!data || !Array.isArray(data) || data.length === 0) {
                        console.warn(
                            `[FLUXO-CACHE] ⚠️ Rodada ${rodada} sem dados - usando simulação`,
                        );
                        return gerarRankingSimulado(rodada, this.participantes);
                    }

                    return data.map((item) => {
                        const timeId = String(
                            item.timeId || item.time_id || item.id,
                        );
                        return {
                            ...item,
                            time_id: timeId,
                            timeId: timeId,
                            id: timeId,
                        };
                    });
                },
                { ttl: TTL_CACHE_MEMORIA },
            );

            this.cacheRankings[rodada] = ranking;
        } catch (error) {
            console.warn(
                `[FLUXO-CACHE] ❌ Erro ao carregar rodada ${rodada}:`,
                error,
            );
            this.cacheRankings[rodada] = gerarRankingSimulado(
                rodada,
                this.participantes,
            );
        }
    }

    _atualizarProgresso(
        container,
        progresso,
        rodadaInicial,
        rodadaFinal,
        ultimaRodadaCompleta,
    ) {
        const barraDeProgresso = document.getElementById(
            "loading-progress-bar",
        );
        if (barraDeProgresso) {
            barraDeProgresso.style.width = `${progresso}%`;
        }

        if (container) {
            const statusText = container.querySelector("p:last-child");
            if (statusText) {
                if (progresso === 100) {
                    statusText.textContent = `✅ Cache completo (${ultimaRodadaCompleta} rodadas)`;
                } else {
                    statusText.textContent = `Buscando rodadas ${rodadaInicial}-${rodadaFinal}... (${progresso}%)`;
                }
            }
        }
    }

    // ===================================================================
    // CARREGAR DADOS PONTOS CORRIDOS (mantido)
    // ===================================================================
    async carregarDadosPontosCorridos() {
        if (!this.ligaId) {
            console.warn(
                "[FLUXO-CACHE] ⚠️ ligaId não disponível, pulando Pontos Corridos",
            );
            this.timesLiga = [];
            this.cacheFrontosPontosCorridos = [];
            return;
        }

        try {
            this.timesLiga = await buscarTimesLiga(this.ligaId);
            this.timesLiga = this.timesLiga.filter(
                (t) => t && typeof t.id === "number",
            );

            if (this.timesLiga.length > 0) {
                this.cacheFrontosPontosCorridos = gerarConfrontos(
                    this.timesLiga,
                );
                console.log(
                    `[FLUXO-CACHE] ✅ Confrontos Pontos Corridos: ${this.cacheFrontosPontosCorridos.length} rodadas para ${this.timesLiga.length} times`,
                );
            } else {
                console.warn(
                    "[FLUXO-CACHE] ⚠️ Nenhum time encontrado para gerar confrontos",
                );
                this.cacheFrontosPontosCorridos = [];
            }
        } catch (error) {
            console.error(
                "[FLUXO-CACHE] ❌ Erro ao carregar Pontos Corridos:",
                error,
            );
            this.timesLiga = [];
            this.cacheFrontosPontosCorridos = [];
        }
    }

    // ===================================================================
    // ✅ v5.1: CARREGAR DADOS EXTERNOS EM PARALELO (Mata-Mata, Melhor Mês)
    // ===================================================================
    async carregarDadosExternos() {
        console.log("[FLUXO-CACHE] Carregando dados externos em PARALELO...");
        const startTime = performance.now();

        // ✅ Preparar promises para execução paralela
        const promises = [];

        // Promise 1: Confrontos LPC (se não carregado)
        if (!this.cacheConfrontosLPC || this.cacheConfrontosLPC.length === 0) {
            promises.push(
                this.carregarConfrontosLPC().then(() => ({ tipo: "lpc" }))
            );
        }

        // Promise 2: Mata-Mata (se módulo ativo)
        if (this.isModuloAtivo("mata-mata")) {
            // Invalidar cache antigo (uma vez)
            const cacheKey = "mataMataFluxo_v2_invalidated";
            if (!localStorage.getItem(cacheKey)) {
                localStorage.removeItem("mataMataFluxo");
                localStorage.setItem(cacheKey, "true");
            }

            promises.push(
                this._carregarMataMataAsync().then((result) => ({
                    tipo: "mata-mata",
                    data: result,
                }))
            );
        } else {
            this.cacheResultadosMM = [];
        }

        // Promise 3: Melhor Mês (se módulo ativo)
        if (this.isModuloAtivo("melhor-mes") && this.ligaId) {
            promises.push(
                getResultadosMelhorMes(this.ligaId)
                    .catch(() => [])
                    .then((result) => ({ tipo: "melhor-mes", data: result }))
            );
        } else {
            this.cacheResultadosMelhorMes = [];
        }

        // ✅ Executar TODAS em paralelo
        const results = await Promise.all(promises);

        // Processar resultados
        for (const result of results) {
            if (result.tipo === "mata-mata") {
                this.cacheResultadosMM = result.data || [];
            } else if (result.tipo === "melhor-mes") {
                this.cacheResultadosMelhorMes = Array.isArray(result.data)
                    ? result.data
                    : [];
            }
        }

        // Aplicar filtro de liga especial (se necessário)
        if (this.cacheResultadosMelhorMes.length > 0) {
            try {
                this.cacheResultadosMelhorMes =
                    await filtrarDadosPorTimesLigaEspecial(
                        this.cacheResultadosMelhorMes,
                    );
            } catch (error) {
                console.warn("[FLUXO-CACHE] Erro ao aplicar filtro:", error);
            }
        }

        const elapsed = Math.round(performance.now() - startTime);
        console.log(`[FLUXO-CACHE] Dados externos carregados em ${elapsed}ms:`);
        console.log(`- Confrontos LPC: ${this.cacheConfrontosLPC?.length || 0}`);
        console.log(
            `- Mata-Mata: ${this.cacheResultadosMM?.length || 0}${!this.isModuloAtivo("mata-mata") ? " (desativado)" : ""}`,
        );
        console.log(
            `- Melhor Mês: ${this.cacheResultadosMelhorMes?.length || 0}${!this.isModuloAtivo("melhor-mes") ? " (desativado)" : ""}`,
        );
    }

    // ✅ NOVO: Helper async para carregar Mata-Mata
    async _carregarMataMataAsync() {
        try {
            const { getResultadosMataMataFluxo, setRankingFunction } =
                await import("../mata-mata/mata-mata-financeiro.js");
            setRankingFunction(getRankingRodadaEspecifica);
            console.log("[FLUXO-CACHE] ✅ Dependência do Mata-Mata injetada");

            const resultadosMataMataFluxo =
                await getResultadosMataMataFluxo(this.ligaId);
            return this._processarResultadosMataMataCorrigido(
                resultadosMataMataFluxo,
            );
        } catch (error) {
            console.warn("[FLUXO-CACHE] Erro ao carregar Mata-Mata:", error);
            return [];
        }
    }

    async carregarConfrontosLPC() {
        try {
            this.cacheConfrontosLPC = await getConfrontosLigaPontosCorridos(
                this.ligaId,
            );
        } catch (error) {
            console.error(
                "[FLUXO-CACHE] Erro ao carregar confrontos LPC:",
                error,
            );
            this.cacheConfrontosLPC = [];
        }
    }

    _processarResultadosMataMataCorrigido(resultadosMM) {
        const processedResults = [];

        if (
            !resultadosMM ||
            !resultadosMM.participantes ||
            !Array.isArray(resultadosMM.participantes)
        ) {
            console.warn("[FLUXO-CACHE] Dados do Mata-Mata inválidos");
            return [];
        }

        resultadosMM.participantes.forEach((participante) => {
            if (!participante.edicoes || !Array.isArray(participante.edicoes))
                return;

            participante.edicoes.forEach((edicao) => {
                const rodadaPontos =
                    edicao.rodadaPontos ||
                    this._calcularRodadaPontosCorrigido(
                        edicao.edicao,
                        edicao.fase,
                    );

                if (rodadaPontos > 0) {
                    processedResults.push({
                        timeId: participante.timeId,
                        fase: edicao.fase,
                        rodadaPontos: rodadaPontos,
                        valor: edicao.valor,
                    });
                }
            });
        });

        console.log(
            `[FLUXO-CACHE] Mata-Mata processado: ${processedResults.length} registros`,
        );
        return processedResults;
    }

    _calcularRodadaPontosCorrigido(edicao, fase) {
        // ✅ FIX: Usar rodadaInicial (primeiro confronto) em vez de rodadaDefinicao (classificação)
        // Antes usava rodadaDefinicao (2, 9, 15...) causando mapeamento errado das rodadas
        const edicaoConfig = {
            1: { rodadaInicial: 3 },
            2: { rodadaInicial: 10 },
            3: { rodadaInicial: 16 },
            4: { rodadaInicial: 22 },
            5: { rodadaInicial: 27 },
            6: { rodadaInicial: 33 },
        };

        // Offset absoluto por fase (correto para torneios de 32 times)
        // NOTA: Para 16/8 times, rodadaPontos é preservado na consolidação (FIX 2A)
        // e este fallback raramente será usado. Se ativado para <32 times,
        // o offset pode ser +1/+2 além do correto, mas é melhor que o bug anterior.
        const todasFases = ["primeira", "oitavas", "quartas", "semis", "final"];
        const config = edicaoConfig[edicao];
        if (!config) return 0;

        const faseIndex = todasFases.indexOf(fase);
        if (faseIndex === -1) return 0;

        return config.rodadaInicial + faseIndex;
    }

    // ===================================================================
    // GETTERS (mantidos)
    // ===================================================================
    getRankingRodada(rodada) {
        return this.cacheRankings[rodada] || [];
    }

    getConfrontosPontosCorridos() {
        return this.cacheFrontosPontosCorridos;
    }

    getResultadosMataMata() {
        return this.cacheResultadosMM;
    }

    getConfrontosLPC() {
        return this.cacheConfrontosLPC;
    }

    getResultadosMelhorMes() {
        return this.cacheResultadosMelhorMes;
    }

    getParticipantes() {
        return this.participantes;
    }

    // ✅ v6.0 FIX: Getter para extrato cacheado COM TEMPORADA
    getExtratoCacheado(timeId, temporada = null) {
        const temp = temporada || window.temporadaAtual || CURRENT_SEASON;
        const cacheKey = `${timeId}_${temp}`;
        return this.extratosCacheados.get(cacheKey) || null;
    }

    // ✅ NOVO: Getter para status do mercado
    getStatusMercado() {
        return this.statusMercado;
    }

    // ✅ NOVO v4.1: Getter para módulos ativos
    getModulosAtivos() {
        return { ...this.modulosAtivos };
    }

    // ✅ v5.3: Limpar todos os caches (para troca de temporada)
    async limparCache() {
        console.log('[FLUXO-CACHE] 🗑️ Limpando todos os caches...');

        // Limpar caches internos
        this.cacheRankings = {};
        this.cacheConfrontosLPC = [];
        this.cacheResultadosMM = [];
        this.cacheResultadosMelhorMes = [];
        this.cacheFrontosPontosCorridos = [];
        this.extratosCacheados.clear();
        this.inscricoes2026.clear();

        // Limpar cache de participantes e rankings no cacheManager (IndexedDB)
        if (this.cacheManager) {
            try {
                await this.cacheManager.invalidateStore('participantes');
                await this.cacheManager.invalidateStore('rankings');
                await this.cacheManager.invalidateStore('extrato');
                console.log('[FLUXO-CACHE] ✅ IndexedDB limpo');
            } catch (error) {
                console.warn('[FLUXO-CACHE] Erro ao limpar IndexedDB:', error);
            }
        }

        // Reset flags
        this._dadosExternosCarregados = false;

        console.log('[FLUXO-CACHE] ✅ Caches limpos com sucesso');
    }

    debugCache() {
        const stats = {
            participantes: this.participantes?.length || 0,
            rankingsCarregados: Object.keys(this.cacheRankings).length,
            confrontosPontosCorridos:
                this.cacheFrontosPontosCorridos?.length || 0,
            resultadosMataMata: this.cacheResultadosMM?.length || 0,
            ultimaRodadaCompleta: this.ultimaRodadaCompleta,
            extratosCacheados: this.extratosCacheados.size,
            statusMercado: this.statusMercado,
            modulosAtivos: this.modulosAtivos,
        };

        console.log("[FLUXO-CACHE] Estado do cache:", stats);
        return stats;
    }
}

// ===================================================================
// FUNÇÕES AUXILIARES EXPORTADAS (compatibilidade)
// ===================================================================

function generateCacheKey(ligaId, participante = null) {
    if (participante) {
        return `${ligaId}-${participante.timeId}`;
    }
    return `${ligaId}-geral`;
}

export async function getCachedFluxoFinanceiro(ligaId, participante = null) {
    const key = generateCacheKey(ligaId, participante);
    const cached = cache.get(key);

    if (cached) {
        console.log("[FLUXO-CACHE] ⚡ Cache memória encontrado");
        return cached.data;
    }

    console.log("[FLUXO-CACHE] ⏱️ Nenhum cache em memória");
    return null;
}

export function setCachedFluxoFinanceiro(ligaId, data, participante = null) {
    const key = generateCacheKey(ligaId, participante);
    cache.set(key, {
        data: data,
        timestamp: ultimaAtualizacaoManual || Date.now(),
    });
    console.log("[FLUXO-CACHE] 💾 Dados armazenados em cache memória:", key);
}

export function invalidateCache(ligaId = null, participante = null) {
    if (!ligaId) {
        cache.clear();
        ultimaAtualizacaoManual = null;
        console.log("[FLUXO-CACHE] 🗑️ Todo cache limpo");
        return;
    }

    const key = generateCacheKey(ligaId, participante);
    cache.delete(key);
    console.log("[FLUXO-CACHE] 🗑️ Cache invalidado para:", key);
}

export function forceRefresh(ligaId, participante = null) {
    invalidateCache(ligaId, participante);
    ultimaAtualizacaoManual = Date.now();
    console.log("[FLUXO-CACHE] 🔄 Refresh manual acionado pelo usuário");
    return true;
}

// ✅ NOVO: Expor função para invalidar cache de time (chamada global)
// ✅ v5.3: Passa temporada para invalidar cache correto
window.invalidarCacheTime = async (ligaId, timeId) => {
    try {
        const temporada = window.temporadaAtual || CURRENT_SEASON;
        const response = await fetch(
            `${API_BASE_URL}/api/extrato-cache/${ligaId}/times/${timeId}/cache?temporada=${temporada}`,
            { method: "DELETE" },
        );
        console.log(
            `[FLUXO-CACHE] 🗑️ Cache MongoDB invalidado para time ${timeId}`,
        );
        return response.ok;
    } catch (error) {
        console.error("[FLUXO-CACHE] Erro ao invalidar cache:", error);
        return false;
    }
};
