// =============================================
// CAPITÃO DE LUXO - Admin JS v1.1.0
// Tabela detalhada de ranking de capitães
// Padrão: ArtilheiroCampeao (single-file admin module)
// v1.1.0: Import RODADA_FINAL centralizado de season-config.js
// =============================================

import { RODADA_FINAL_CAMPEONATO } from './core/season-config.js';

console.log("🎖️ [CAPITAO-LUXO] Sistema v1.1.0 carregando...");

const CapitaoLuxo = {
    // Configurações
    config: {
        getLigaId: function () {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get("id");
        },
        RODADA_FINAL: RODADA_FINAL_CAMPEONATO,
        API: {
            RANKING: (ligaId) => `/api/capitao/${ligaId}/ranking`,
            RANKING_LIVE: (ligaId) => `/api/capitao/${ligaId}/ranking-live`,
        },
    },

    // Estado
    estado: {
        ranking: [],
        rodadaAtual: 1,
        mercadoAberto: true,
        temporadaEncerrada: false,
        carregando: false,
        inicializado: false,
    },

    // ==============================
    // INICIALIZAÇÃO
    // ==============================
    async inicializar() {
        if (this._isInitializing) {
            console.log("⏳ [CAPITAO-LUXO] Já está inicializando, ignorando...");
            return;
        }

        console.log("🚀 [CAPITAO-LUXO] Inicializando módulo admin v1.0...");
        this._isInitializing = true;

        this.estado = {
            ranking: [],
            rodadaAtual: 1,
            mercadoAberto: true,
            temporadaEncerrada: false,
            carregando: false,
            inicializado: false,
        };

        try {
            await this.detectarEstadoRodada();

            if (this.isAguardandoDados()) {
                console.log("⏳ [CAPITAO-LUXO] Aguardando início do campeonato...");
                this.renderizarAguardandoDados();
                this.estado.inicializado = true;
                return;
            }

            this.renderizarLayout();
            await this.buscarRanking();

            this.estado.inicializado = true;
            console.log("✅ [CAPITAO-LUXO] Módulo admin inicializado!");
        } catch (error) {
            console.error("❌ [CAPITAO-LUXO] Erro na inicialização:", error);
            this.mostrarErro("Erro na inicialização", error.message);
        } finally {
            this._isInitializing = false;
        }
    },

    // ==============================
    // DETECTAR ESTADO DA RODADA
    // ==============================
    async detectarEstadoRodada() {
        try {
            // Usar status do mercado global se disponível
            if (window.statusMercado) {
                this.estado.rodadaAtual = window.statusMercado.rodada_atual || 1;
                this.estado.mercadoAberto = window.statusMercado.status_mercado !== 2; // 2 = fechado
                this.estado.temporadaEncerrada = window.statusMercado.temporada_encerrada || false;
                console.log(
                    `📅 [CAPITAO-LUXO] Rodada: ${this.estado.rodadaAtual}, Mercado: ${this.estado.mercadoAberto ? "Aberto" : "Fechado"}, Temporada: ${this.estado.temporadaEncerrada ? "ENCERRADA" : "ATIVA"}`
                );
                return;
            }

            // Fallback: buscar status do mercado via API
            const response = await fetch("/api/cartola/mercado/status");
            if (response.ok) {
                const data = await response.json();
                this.estado.rodadaAtual = data.rodada_atual || 1;
                this.estado.mercadoAberto = data.status_mercado !== 2;
                this.estado.temporadaEncerrada = data.temporada_encerrada || false;
            }
        } catch (error) {
            console.warn("⚠️ [CAPITAO-LUXO] Erro ao detectar rodada:", error.message);
        }
    },

    // ==============================
    // VERIFICAR SE AGUARDA DADOS
    // ==============================
    isAguardandoDados() {
        const rodada = this.estado.rodadaAtual || 1;
        const mercadoAberto = this.estado.mercadoAberto === true;

        // ✅ MELHORIA: Aguardar APENAS se:
        //    1. Rodada = 1 (primeira rodada ainda não aconteceu)
        //    2. Mercado aberto (rodada não começou ainda)
        // ANTES: rodada <= 1 permitia travar na rodada 2 com mercado aberto
        if (rodada === 1 && mercadoAberto) {
            return true;
        }
        return false;
    },

    // ==============================
    // CONTAINER HELPER
    // ==============================
    _getContainer() {
        let container = document.getElementById("capitao-luxo-content");
        if (!container) container = document.getElementById("capitaoRankingContainer");
        if (!container) container = document.getElementById("modulo-content");
        if (!container) container = document.getElementById("dynamic-content-area");
        return container;
    },

    // ==============================
    // RENDER: AGUARDANDO DADOS
    // ==============================
    renderizarAguardandoDados() {
        const container = this._getContainer();
        if (!container) return;

        container.innerHTML = `
            <div class="capitao-luxo-aguardando">
                <div class="capitao-luxo-aguardando-content">
                    <div class="capitao-luxo-aguardando-icon">
                        <span class="material-icons">military_tech</span>
                    </div>
                    <h2 class="capitao-luxo-aguardando-title">Aguardando Início do Campeonato</h2>
                    <p class="capitao-luxo-aguardando-desc">
                        O ranking de capitães será atualizado após a primeira rodada do campeonato ser finalizada.
                    </p>
                    <div class="capitao-luxo-aguardando-info">
                        <span class="material-icons">info</span>
                        <span>Os dados de capitães serão coletados automaticamente após cada rodada e consolidados pelo administrador.</span>
                    </div>
                </div>
            </div>
        `;
    },

    // ==============================
    // RENDER: LAYOUT PRINCIPAL
    // ==============================
    renderizarLayout() {
        const container = this._getContainer();
        if (!container) {
            console.error("❌ [CAPITAO-LUXO] Container não encontrado!");
            return;
        }

        const rodadaFim = this.estado.mercadoAberto
            ? Math.max(0, this.estado.rodadaAtual - 1)
            : this.estado.rodadaAtual;

        const isParcial = !this.estado.mercadoAberto && !this.estado.temporadaEncerrada;

        container.innerHTML = `
            <div class="capitao-luxo-container">
                <!-- Banner rodada final -->
                <div id="capitaoLuxoBannerFinal"></div>

                <!-- Header -->
                <div class="capitao-luxo-header">
                    <div class="capitao-luxo-title">
                        <span class="material-icons" style="font-size: 20px; color: #fbbf24;">military_tech</span>
                        <h3>Capitão de Luxo</h3>
                        <span class="capitao-luxo-badge">${this.estado.temporadaEncerrada ? "CONSOLIDADO" : "MODULAR"}</span>
                    </div>
                    <div class="capitao-luxo-info-rodada">
                        <span class="material-icons" style="font-size: 14px;">leaderboard</span>
                        <span id="capitaoLuxoInfoStatus">Dados até a ${rodadaFim}ª rodada${isParcial ? " (em andamento)" : this.estado.temporadaEncerrada ? " (TEMPORADA ENCERRADA)" : ""}</span>
                    </div>
                </div>

                <!-- Legenda -->
                <div class="capitao-luxo-legenda">
                    <span class="legenda-item"><span class="legenda-cor pts"></span> PTS = Pontos Capitão</span>
                    <span class="legenda-item"><span class="legenda-cor media"></span> MED = Média</span>
                    <span class="legenda-item"><span class="legenda-cor melhor"></span> Melhor Cap.</span>
                    <span class="legenda-item"><span class="legenda-cor pior"></span> Pior Cap.</span>
                </div>

                <!-- Tabela -->
                <div class="capitao-luxo-table-container">
                    <table class="capitao-luxo-ranking-table">
                        <thead>
                            <tr>
                                <th class="col-pos">#</th>
                                <th class="col-escudo"></th>
                                <th class="col-nome">CARTOLEIRO</th>
                                <th class="col-pts">PTS</th>
                                <th class="col-media">MED</th>
                                <th class="col-rodadas">ROD</th>
                                <th class="col-melhor">MELHOR</th>
                                <th class="col-pior">PIOR</th>
                                <th class="col-distintos">CAP</th>
                            </tr>
                        </thead>
                        <tbody id="capitaoLuxoRankingBody">
                            <tr>
                                <td colspan="9" style="text-align: center; padding: 40px; color: #888;">
                                    <div class="capitao-luxo-loading">
                                        <div class="spinner"></div>
                                        <p>Carregando dados...</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // ==============================
    // BUSCAR RANKING
    // ==============================
    async buscarRanking() {
        const ligaId = this.config.getLigaId();
        if (!ligaId) {
            console.error("❌ [CAPITAO-LUXO] Liga ID não encontrado na URL");
            return;
        }

        this.estado.carregando = true;

        try {
            const temporada = window.temporadaAtual || new Date().getFullYear();
            const url = `${this.config.API.RANKING(ligaId)}?temporada=${temporada}`;

            console.log(`📡 [CAPITAO-LUXO] Buscando ranking: ${url}`);
            const response = await fetch(url);
            const data = await response.json();

            // ✅ FIX: Limpar flags parciais stale quando mercado está aberto (rodada encerrada)
            // Mesmo fix aplicado no app (participante-capitao.js:181-193)
            const mercadoAberto = this.estado.mercadoAberto;
            const temporadaAtiva = !this.estado.temporadaEncerrada;

            if (mercadoAberto && temporadaAtiva && data.ranking) {
                let flagsLimpas = 0;
                data.ranking.forEach(p => {
                    if (p.historico_rodadas) {
                        p.historico_rodadas.forEach(h => {
                            if (h.parcial === true) {
                                h.parcial = false;
                                h.jogou = null;
                                flagsLimpas++;
                            }
                        });
                    }
                });
                if (flagsLimpas > 0) {
                    console.log(`🧹 [CAPITAO-LUXO] Limpou ${flagsLimpas} flags parciais stale`);
                }
            }

            // Verificar se dados precisam de (re)consolidação
            const rankingVazio = !data.success || !data.ranking || data.ranking.length === 0;
            const dadosZerados = !rankingVazio && data.ranking.every(r => (r.pontuacao_total || 0) === 0 && (r.rodadas_jogadas || 0) === 0);
            const semHistorico = !rankingVazio && !dadosZerados && data.ranking.some(r => !r.historico_rodadas || r.historico_rodadas.length === 0);
            const rodadaEmAndamento = !this.estado.mercadoAberto && !this.estado.temporadaEncerrada;

            // ✅ FIX: Detectar dados parciais stale (rodada encerrou mas cache tem parcial: true)
            const temParcialStale = !rankingVazio && this.estado.mercadoAberto &&
                data.ranking.some(r => r.historico_rodadas && r.historico_rodadas.some(h => h.parcial === true));

            if (rankingVazio || dadosZerados || semHistorico || rodadaEmAndamento || temParcialStale) {
                if (dadosZerados) console.warn("⚠️ [CAPITAO-LUXO] Dados zerados, re-consolidando...");
                if (semHistorico) console.warn("⚠️ [CAPITAO-LUXO] Histórico ausente, re-consolidando...");
                if (rodadaEmAndamento) console.log("🔴 [CAPITAO-LUXO] Rodada em andamento, atualizando parciais...");
                if (temParcialStale) console.warn("⚠️ [CAPITAO-LUXO] Dados parciais stale detectados (rodada encerrada mas cache com parcial:true), re-consolidando...");

                // Verificar se há rodadas finalizadas para auto-consolidar
                const rodadaConsolidada = this.estado.mercadoAberto
                    ? Math.max(0, this.estado.rodadaAtual - 1)
                    : this.estado.rodadaAtual;

                if (rodadaConsolidada > 0) {
                    console.log(`🔄 [CAPITAO-LUXO] Cache vazio, auto-consolidando até rodada ${rodadaConsolidada}...`);
                    this._mostrarConsolidando(rodadaConsolidada);

                    const ranking = await this._autoConsolidar(ligaId, temporada, rodadaConsolidada);
                    if (ranking && ranking.length > 0) {
                        this.estado.ranking = ranking;
                        this.renderizarTabela(ranking);
                        this._renderizarBannerFinal();
                        return;
                    }
                }

                this.renderizarVazio();
                return;
            }

            this.estado.ranking = data.ranking;
            this.renderizarTabela(data.ranking);
            this._renderizarBannerFinal();
        } catch (error) {
            console.error("❌ [CAPITAO-LUXO] Erro ao buscar ranking:", error);
            this.mostrarErro("Erro ao carregar ranking", error.message);
        } finally {
            this.estado.carregando = false;
        }
    },

    // ==============================
    // AUTO-CONSOLIDAR (quando cache vazio)
    // ==============================
    async _autoConsolidar(ligaId, temporada, rodadaFinal) {
        try {
            const resp = await fetch(`/api/capitao/${ligaId}/consolidar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ temporada, rodadaFinal })
            });
            const result = await resp.json();
            if (result.success && result.ranking && result.ranking.length > 0) {
                console.log(`✅ [CAPITAO-LUXO] Auto-consolidação OK: ${result.ranking.length} participantes`);
                return result.ranking;
            }
            console.warn(`⚠️ [CAPITAO-LUXO] Auto-consolidação retornou vazio`);
            return null;
        } catch (error) {
            console.error(`❌ [CAPITAO-LUXO] Erro na auto-consolidação:`, error);
            return null;
        }
    },

    _mostrarConsolidando(rodada) {
        const tbody = document.getElementById("capitaoLuxoRankingBody");
        if (!tbody) return;
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #fbbf24;">
                    <div class="capitao-luxo-loading">
                        <div class="spinner"></div>
                        <p>Consolidando dados dos capitães até a rodada ${rodada}...</p>
                        <p style="font-size: 11px; color: #888; margin-top: 8px;">Primeira vez pode demorar alguns segundos</p>
                    </div>
                </td>
            </tr>
        `;
    },

    // ==============================
    // RENDER: TABELA DE RANKING
    // ==============================
    renderizarTabela(ranking) {
        const tbody = document.getElementById("capitaoLuxoRankingBody");
        if (!tbody) return;

        let html = "";

        ranking.forEach((participante, index) => {
            const posicao = participante.posicao_final || index + 1;
            const isPrimeiro = posicao === 1;
            const isPodio2 = posicao === 2;
            const isPodio3 = posicao === 3;

            const escudoSrc = participante.escudo || `/escudos/${participante.clube_id || "default"}.png`;
            const pontos = (participante.pontuacao_total || 0).toFixed(2);
            const media = (participante.media_capitao || 0).toFixed(2);
            const rodadas = participante.rodadas_jogadas || 0;
            const melhor = participante.melhor_capitao?.pontuacao?.toFixed(2) || "-";
            const pior = participante.pior_capitao?.pontuacao?.toFixed(2) || "-";
            const distintos = participante.capitaes_distintos || 0;

            const rowClass = isPrimeiro
                ? "destaque-primeiro"
                : isPodio2
                    ? "podio-2"
                    : isPodio3
                        ? "podio-3"
                        : "";

            const posicaoIcon = isPrimeiro ? "🥇" : isPodio2 ? "🥈" : isPodio3 ? "🥉" : `${posicao}º`;

            // ✅ NOVO LAYOUT: Botão "Ver Histórico" + Barra de progresso
            const historico = participante.historico_rodadas || [];
            const totalRodadas = 38;
            const percentualProgresso = (rodadas / totalRodadas) * 100;

            // Botão Ver Histórico (somente se tiver dados)
            let btnHistoricoHtml = "";
            if (historico.length > 0) {
                // Escapar JSON para onclick (evitar aspas quebradas)
                const participanteJson = JSON.stringify(participante).replace(/"/g, '&quot;');
                btnHistoricoHtml = `
                    <button class="btn-ver-historico"
                            onclick='CapitaoLuxo._abrirHistorico(${participanteJson})'
                            title="Ver histórico completo de capitães">
                        <span class="material-icons" style="font-size: 14px;">history</span>
                        Ver Histórico
                    </button>
                `;
            }

            // Barra de progresso visual
            const progressoHtml = `
                <div class="capitao-progresso-container">
                    <div class="capitao-progresso-bar" style="width: ${percentualProgresso}%"></div>
                    <span class="capitao-progresso-label">${rodadas}/${totalRodadas} rodadas</span>
                </div>
            `;

            html += `
                <tr class="${rowClass}">
                    <td class="col-pos">${posicaoIcon}</td>
                    <td class="col-escudo">
                        <img src="${escudoSrc}" class="escudo-mini" alt=""
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
                        <span class="material-icons" style="display: none; font-size: 20px; color: #666;">emoji_events</span>
                    </td>
                    <td class="col-nome">
                        <span class="nome-cartola">${participante.nome_cartola || "---"}</span>
                        <span class="nome-time">${participante.nome_time || ""}</span>
                        <div class="capitao-linha-info">
                            ${progressoHtml}
                            ${btnHistoricoHtml}
                        </div>
                    </td>
                    <td><span class="val-pts">${pontos}</span></td>
                    <td><span class="val-media">${media}</span></td>
                    <td>${rodadas}</td>
                    <td><span class="val-melhor">${melhor}</span></td>
                    <td><span class="val-pior">${pior}</span></td>
                    <td><span class="val-distintos">${distintos}</span></td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    // ==============================
    // ABRIR MODAL DE HISTÓRICO
    // ==============================
    _abrirHistorico(participante) {
        if (window.CapitaoHistoricoModal) {
            window.CapitaoHistoricoModal.abrir(participante);
        } else {
            console.error('❌ [CAPITAO-LUXO] Modal de histórico não carregado');
            alert('Erro ao carregar histórico. Atualize a página.');
        }
    },

    // ==============================
    // BANNER RODADA FINAL
    // ==============================
    _renderizarBannerFinal() {
        const bannerContainer = document.getElementById("capitaoLuxoBannerFinal");
        if (!bannerContainer) return;

        const { rodadaAtual, mercadoAberto, temporadaEncerrada, ranking } = this.estado;
        const isRodadaFinal = rodadaAtual === this.config.RODADA_FINAL;

        if (!isRodadaFinal) {
            bannerContainer.innerHTML = "";
            return;
        }

        const isParcial = !mercadoAberto && !temporadaEncerrada;
        const statusTexto = temporadaEncerrada
            ? "TEMPORADA ENCERRADA"
            : isParcial
                ? "EM ANDAMENTO"
                : "ÚLTIMA RODADA";

        const lider = ranking[0];
        const liderNome = lider?.nome_cartola || "---";
        const liderPts = (lider?.pontuacao_total || 0).toFixed(2);

        const liderLabel = temporadaEncerrada
            ? "🏆 CAPITÃO DE LUXO"
            : "POSSÍVEL CAMPEÃO";

        bannerContainer.innerHTML = `
            <div class="capitao-luxo-banner-final ${isParcial ? "parcial-ativo" : ""} ${temporadaEncerrada ? "temporada-encerrada" : ""}">
                <div class="banner-content">
                    <span class="material-icons" style="font-size: 2rem; color: #fbbf24;">${temporadaEncerrada ? "emoji_events" : "military_tech"}</span>
                    <div class="banner-info">
                        <span class="banner-titulo">RODADA FINAL</span>
                        <span class="banner-status ${isParcial ? "pulsando" : ""}">${statusTexto}</span>
                    </div>
                    ${lider ? `
                        <div class="banner-lider ${temporadaEncerrada ? "campeao" : ""}">
                            <span class="lider-label">${liderLabel}</span>
                            <span class="lider-nome">${liderNome} (${liderPts} pts)</span>
                        </div>
                    ` : ""}
                </div>
            </div>
        `;
    },

    // ==============================
    // ESTADOS: VAZIO / ERRO
    // ==============================
    renderizarVazio() {
        const tbody = document.getElementById("capitaoLuxoRankingBody");
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="capitao-luxo-empty">
                        <span class="material-icons">military_tech</span>
                        <p>Sem dados de capitães disponíveis</p>
                        <p style="font-size: 11px; margin-top: 8px;">O ranking será populado automaticamente após rodadas finalizadas.</p>
                    </div>
                </td>
            </tr>
        `;
    },

    mostrarErro(titulo, mensagem) {
        const container = this._getContainer();
        if (!container) return;

        container.innerHTML = `
            <div class="capitao-luxo-error">
                <span class="material-icons" style="font-size: 48px;">warning</span>
                <p><strong>${titulo}</strong></p>
                <p style="font-size: 12px;">${mensagem}</p>
            </div>
        `;
    },
};

// Expor globalmente
window.CapitaoLuxo = CapitaoLuxo;

// Função de inicialização compatível com orquestrador
window.inicializarCapitaoLuxoAdmin = async function () {
    await CapitaoLuxo.inicializar();
};

console.log("🎖️ [CAPITAO-LUXO] Módulo admin carregado");
