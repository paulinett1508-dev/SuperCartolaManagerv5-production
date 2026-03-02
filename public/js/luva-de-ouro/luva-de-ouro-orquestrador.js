// public/js/luva-de-ouro/luva-de-ouro-orquestrador.js - V2.1 COM UI AGUARDANDO DADOS
console.log("🎯 [LUVA-ORQUESTRADOR] Módulo orquestrador v2.1 carregando...");

const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

const LuvaDeOuroOrquestrador = {
  estado: {
    ranking: [],
    inativos: [], // ✅ Participantes inativos
    estatisticas: {},
    ultimaRodada: 0,
    rodadaDetectada: null,
    carregando: false,
    statusMap: {}, // ✅ Status de inatividade
    mercadoStatus: null, // v2.1: Cache do status do mercado
  },

  /**
   * v2.1: Verifica se está aguardando dados (pré-temporada ou rodada 1 não finalizada)
   * @returns {Promise<boolean>}
   */
  async isAguardandoDados() {
    try {
      const res = await fetch("/api/cartola/mercado/status");
      if (!res.ok) return false;

      const status = await res.json();
      this.estado.mercadoStatus = status;

      const rodadaAtual = status.rodada_atual || 1;
      const mercadoAberto = status.status_mercado === 1;
      const temporadaAPI = status.temporada || new Date().getFullYear();
      const anoAtual = new Date().getFullYear();

      // Pré-temporada: API retorna ano anterior
      if (temporadaAPI < anoAtual) {
        console.log("[LUVA-ORQ] 🕐 Pré-temporada detectada");
        return true;
      }

      // Rodada 1 com mercado aberto = ainda não começou
      if (rodadaAtual === 1 && mercadoAberto) {
        console.log("[LUVA-ORQ] 🕐 Rodada 1 ainda não iniciada");
        return true;
      }

      return false;
    } catch (error) {
      console.warn("[LUVA-ORQ] Erro ao verificar status:", error.message);
      return false;
    }
  },

  /**
   * v2.1: Renderiza mensagem de aguardando dados
   */
  renderizarAguardandoDados() {
    const config = window.LuvaDeOuroConfig;
    const contentSelector = config?.SELECTORS?.CONTENT || "#luvaDeOuroContent";
    const container = document.getElementById(contentSelector.replace("#", ""));

    if (!container) return;

    container.innerHTML = `
      <div class="luva-aguardando-container" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
        border-radius: 16px;
        border: 1px solid rgba(255, 136, 0, 0.2);
        min-height: 300px;
        margin: 20px;
      ">
        <span class="material-icons" style="
          font-size: 64px;
          color: var(--laranja, #ff8800);
          margin-bottom: 20px;
          animation: luvaPulse 2s ease-in-out infinite;
        ">sports_soccer</span>

        <h2 style="
          font-family: 'Russo One', sans-serif;
          font-size: 1.5rem;
          color: var(--text-primary, #ffffff);
          margin: 0 0 12px 0;
        ">Aguardando Início do Campeonato</h2>

        <p style="
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          color: var(--text-secondary, #94a3b8);
          margin: 0 0 24px 0;
          max-width: 320px;
          line-height: 1.5;
        ">O ranking de Luva de Ouro estará disponível após a primeira rodada ser finalizada.</p>

        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: rgba(255, 136, 0, 0.1);
          border-radius: 8px;
          border: 1px solid rgba(255, 136, 0, 0.3);
        ">
          <span class="material-icons" style="color: var(--laranja, #ff8800); font-size: 20px;">info</span>
          <span style="font-size: 0.85rem; color: var(--text-secondary, #94a3b8);">
            Goleiros precisam jogar para pontuar
          </span>
        </div>
      </div>

      <style>
        @keyframes luvaPulse {
          0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.7; transform: scale(1.1) rotate(5deg); }
        }
      </style>
    `;

    console.log("[LUVA-ORQ] ✅ Renderizado estado de aguardando dados");
  },

  async inicializar() {
    console.log("🥅 [LUVA-ORQUESTRADOR] Inicializando módulo...");

    try {
      // v2.1: Verificar se está aguardando dados antes de qualquer coisa
      const aguardando = await this.isAguardandoDados();
      if (aguardando) {
        console.log("[LUVA-ORQ] 🕐 Modo aguardando dados ativado");
        this.renderizarAguardandoDados();
        return;
      }

      const config = window.LuvaDeOuroConfig;

      // ✅ Usar ID direto do seletor (remover #)
      const contentSelector = config.SELECTORS?.CONTENT || "#luvaDeOuroContent";
      let container = document.getElementById(
        contentSelector.replace("#", ""),
      );

      // ✅ Se container nao existe, criar dentro do dynamic-content-area
      if (!container) {
        const dynamicArea = document.getElementById("dynamic-content-area");
        if (dynamicArea) {
          dynamicArea.innerHTML = '<div id="luvaDeOuroContent"></div>';
          container = document.getElementById("luvaDeOuroContent");
          console.log("🥅 [LUVA-ORQUESTRADOR] Container criado dinamicamente");
        } else {
          // Nenhum container disponivel - comportamento normal
          return;
        }
      }

      container.innerHTML = window.LuvaDeOuroUI.criarLayoutPrincipal();

      this.configurarEventos();

      // ✅ AUTO-CARREGAR RANKING (igual Artilheiro Campeão)
      await this.carregarRanking(false);

      console.log("✅ Luva de Ouro inicializado com sucesso");
    } catch (error) {
      console.error("❌ Erro ao inicializar:", error);
      this.mostrarErro("Erro na inicialização", error.message);
    }
  },

  configurarEventos() {
    const config = window.LuvaDeOuroConfig;

    const btnRanking = document.getElementById("luvaRankingBtn");
    if (btnRanking) {
      btnRanking.addEventListener("click", () => this.carregarRanking(false));
    }

    const btnUltimaRodada = document.getElementById("luvaUltimaRodadaBtn");
    if (btnUltimaRodada) {
      btnUltimaRodada.addEventListener("click", () =>
        this.detectarUltimaRodada(),
      );
    }

    const btnForcarColeta = document.getElementById("luvaForcarColetaBtn");
    if (btnForcarColeta) {
      btnForcarColeta.addEventListener("click", () =>
        this.carregarRanking(true),
      );
    }

    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-detalhes")) {
        const id = e.target.dataset.participanteId;
        const nome = e.target.dataset.participanteNome;
        if (id && nome) {
          this.mostrarDetalhes(parseInt(id), nome);
        }
      }
    });

    console.log("📋 Eventos configurados");
  },

  async carregarRanking(forcarColeta = false) {
    const config = window.LuvaDeOuroConfig;

    // ✅ Usar IDs diretos
    const contentSelector = config.SELECTORS?.CONTENT || "#luvaDeOuroContent";
    const container = document.getElementById(contentSelector.replace("#", ""));

    if (!container) return;

    try {
      this.estado.carregando = true;

      const inicio =
        parseInt(document.getElementById("luvaRodadaInicio")?.value) ||
        config.RODADAS.DEFAULT_INICIO;
      const fim =
        parseInt(document.getElementById("luvaRodadaFim")?.value) || null;

      console.log(`🎯 Carregando ranking: ${inicio} a ${fim || "atual"}`);

      const mensagem = forcarColeta
        ? config.MESSAGES.LOADING_COLETA
        : config.MESSAGES.LOADING_RANKING;

      // ✅ mostrarLoading manipula DOM direto, não retorna HTML
      window.LuvaDeOuroUI.mostrarLoading(mensagem);

      let dados = null;
      if (!forcarColeta) {
        const cacheResult = window.LuvaDeOuroCache.get("ranking", {
          inicio,
          fim,
        });
        // ✅ Verificar se é Promise e resolver
        if (cacheResult instanceof Promise) {
          dados = await cacheResult;
        } else {
          dados = cacheResult;
        }
        if (dados) {
          console.log("[LUVA-ORQ] 📦 Dados do cache:", dados);
        }
      }

      if (!dados) {
        dados = await window.LuvaDeOuroCore.buscarRankingGoleiros(
          inicio,
          fim,
          forcarColeta,
        );
        console.log("[LUVA-ORQ] 📦 Dados recebidos da API:", dados);
        if (dados && dados.ranking) {
          window.LuvaDeOuroCache.set("ranking", { inicio, fim }, dados);
        }
      }

      // ✅ Verificar se dados tem ranking
      if (!dados || !dados.ranking || !Array.isArray(dados.ranking)) {
        console.warn("[LUVA-ORQ] ⚠️ Dados inválidos ou ranking vazio");
        window.LuvaDeOuroUI.mostrarErro(
          "Nenhum dado encontrado",
          "Tente forçar a coleta de dados.",
        );
        return;
      }

      // ✅ BUSCAR ESCUDOS CORRETOS ANTES DE RENDERIZAR
      console.log("[LUVA-ORQ] 🎨 Buscando escudos corretos...");
      const escudosParticipantes =
        await window.LuvaDeOuroUtils.buscarEscudosParticipantes();

      if (escudosParticipantes) {
        console.log("[LUVA-ORQ] ✅ Aplicando escudos ao ranking...");
        dados.ranking = dados.ranking.map((item) => ({
          ...item,
          clubeId:
            escudosParticipantes[item.participanteId] ||
            item.clubeId ||
            "default",
        }));
      }

      // ✅ BUSCAR STATUS DE INATIVIDADE (igual ranking.js)
      const timeIds = dados.ranking.map((p) => p.participanteId);
      let statusMap = {};

      try {
        const statusRes = await fetch("/api/times/batch/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeIds }),
        });

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          statusMap = statusData.status || {};
          console.log(`[LUVA-ORQ] ✅ Status de inatividade carregado`);
        }
      } catch (error) {
        console.warn("[LUVA-ORQ] ⚠️ Falha ao buscar status:", error.message);
      }

      this.estado.statusMap = statusMap;

      // ✅ Adicionar status a cada participante
      dados.ranking = dados.ranking.map((p) => {
        const status = statusMap[p.participanteId] || {
          ativo: true,
          rodada_desistencia: null,
        };
        return {
          ...p,
          ativo: status.ativo,
          rodada_desistencia: status.rodada_desistencia,
        };
      });

      // ✅ Separar ativos e inativos
      const ativos = dados.ranking.filter((p) => p.ativo !== false);
      const inativos = dados.ranking.filter((p) => p.ativo === false);

      // Ordenar ativos por pontos (decrescente)
      ativos.sort((a, b) => b.pontosTotais - a.pontosTotais);

      // Ordenar inativos por rodada de desistência (mais recente primeiro)
      inativos.sort(
        (a, b) => (b.rodada_desistencia || 0) - (a.rodada_desistencia || 0),
      );

      // Guardar no estado
      this.estado.ranking = { ...dados, ranking: ativos };
      this.estado.inativos = inativos;

      console.log(
        `[LUVA-ORQ] ✅ Ranking: ${ativos.length} ativos, ${inativos.length} inativos`,
      );

      // ✅ Configurar navegação com rodada atual (mercado)
      let rodadaAtual = dados.rodadaFim || 38;
      let mercadoAberto = true;

      try {
        const mercadoRes = await fetch("/api/cartola/mercado/status");
        if (mercadoRes.ok) {
          const mercadoData = await mercadoRes.json();
          rodadaAtual = mercadoData.rodada_atual || dados.rodadaFim || 38;
          mercadoAberto = mercadoData.mercado_aberto === true;
          window.LuvaDeOuroUI.configurarNavegacao(rodadaAtual, mercadoAberto);
          console.log(
            `[LUVA-ORQ] ✅ Navegação configurada: rodada ${rodadaAtual}, mercado ${mercadoAberto ? "aberto" : "fechado"}`,
          );
        }
      } catch (e) {
        // Fallback: usar rodadaFim dos dados
        window.LuvaDeOuroUI.configurarNavegacao(dados.rodadaFim || 38, false);
        mercadoAberto = false;
      }

      // ✅ SIMPLIFICADO: Backend já inclui parciais automaticamente
      // Apenas usar dados.rodadaParcial se existir (vem do backend)
      if (dados.rodadaParcial) {
        console.log(
          `[LUVA-ORQ] 🔥 Dados incluem parciais da R${dados.rodadaParcial}`,
        );
      }

      // ✅ Renderizar ranking com ativos e inativos
      // NOTA: renderizarRanking manipula elementos DOM existentes, NÃO retorna HTML
      window.LuvaDeOuroUI.renderizarRanking({
        ...dados,
        ranking: ativos,
        inativos: inativos,
        totalAtivos: ativos.length,
        totalInativos: inativos.length,
      });

      // ✅ Atualizar status no header (remover "Carregando...")
      let rodadaInfo;
      const rodadaFinal = dados.rodadaFim || rodadaAtual;
      if (rodadaFinal >= RODADA_FINAL_CAMPEONATO) {
        rodadaInfo = `R1-R${RODADA_FINAL_CAMPEONATO} (Temporada Encerrada)`;
      } else if (dados.rodadaParcial) {
        rodadaInfo = `R1-R${rodadaFinal} (R${dados.rodadaParcial} em andamento)`;
      } else {
        rodadaInfo = `R1-R${rodadaFinal}`;
      }
      window.LuvaDeOuroUI.atualizarInfoStatus(rodadaInfo);

      console.log(
        "✅ Ranking carregado com escudos corretos e suporte a inativos",
      );
    } catch (error) {
      console.error("❌ Erro ao carregar ranking:", error);
      this.mostrarErro(error.message);
    } finally {
      this.estado.carregando = false;
    }
  },

  async detectarUltimaRodada() {
    try {
      const config = window.LuvaDeOuroConfig;

      // ✅ Usar IDs diretos
      const infoContainer = document.getElementById("luvaInfoTexto");
      const fimInput = document.getElementById("luvaRodadaFim");

      if (infoContainer) {
        infoContainer.textContent = config.MESSAGES.DETECTANDO_RODADA;
      }

      const deteccao = await window.LuvaDeOuroCore.detectarUltimaRodada();
      this.estado.rodadaDetectada = deteccao;

      if (fimInput) {
        fimInput.value = deteccao.recomendacao;
      }

      if (infoContainer) {
        infoContainer.innerHTML = `<strong>Rodada atual:</strong> ${deteccao.rodadaAtualCartola} | <strong>Mercado:</strong> ${deteccao.mercadoFechado ? "Fechado" : "Aberto"} | <strong>Recomendado:</strong> até rodada ${deteccao.recomendacao}`;
      }

      console.log("✅ Última rodada detectada:", deteccao);
    } catch (error) {
      console.error("❌ Erro ao detectar rodada:", error);
      this.mostrarErro("Erro ao detectar rodada", error.message);
    }
  },

  async mostrarDetalhes(participanteId, participanteNome) {
    console.log(`📊 Buscando detalhes para ${participanteNome}...`);

    try {
      // ✅ Usar IDs diretos
      const inicio =
        parseInt(document.getElementById("luvaRodadaInicio")?.value) || 1;
      const fim =
        parseInt(document.getElementById("luvaRodadaFim")?.value) || 38;

      // Verificar se temos dados em cache/estado
      let dadosParticipante = null;

      if (
        this.estado.ranking &&
        this.estado.ranking.ranking &&
        Array.isArray(this.estado.ranking.ranking)
      ) {
        dadosParticipante = this.estado.ranking.ranking.find(
          (p) => p.participanteId === participanteId,
        );
      }

      // Se não encontrou nos ativos, procurar nos inativos
      if (
        !dadosParticipante &&
        this.estado.inativos &&
        Array.isArray(this.estado.inativos)
      ) {
        dadosParticipante = this.estado.inativos.find(
          (p) => p.participanteId === participanteId,
        );
      }

      // Chamar UI para mostrar modal
      window.LuvaDeOuroUI.mostrarModalDetalhes({
        participante: {
          id: participanteId,
          nome: participanteNome,
          pontosTotais: dadosParticipante?.pontosTotais || 0,
          totalJogos: dadosParticipante?.totalJogos || 0,
          ativo: dadosParticipante?.ativo !== false,
          rodada_desistencia: dadosParticipante?.rodada_desistencia || null,
        },
        rodadaInicio: inicio,
        rodadaFim: fim,
        historico: dadosParticipante?.historico || [],
      });
    } catch (error) {
      console.error("❌ Erro ao mostrar detalhes:", error);
      this.mostrarErro("Erro ao carregar detalhes", error.message);
    }
  },

  mostrarErro(titulo, mensagem = "") {
    // ✅ mostrarErro manipula DOM direto, não retorna HTML
    window.LuvaDeOuroUI.mostrarErro(titulo, mensagem);
  },
};

// Expor globalmente
window.LuvaDeOuroOrquestrador = LuvaDeOuroOrquestrador;

console.log(
  "✅ [LUVA-ORQUESTRADOR] Módulo orquestrador v2.1 carregado (UI aguardando dados + suporte a inativos)",
);
