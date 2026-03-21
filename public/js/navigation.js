const urlParams = new URLSearchParams(window.location.search);
const ligaId = urlParams.get("id");

// ✅ v1.2: Registry de cleanups — módulos registram funções de limpeza ao serem carregados
const _sectionCleanups = {};
let _currentSection = null;

/**
 * Registra cleanup para uma seção (chamado pelos módulos ao inicializar)
 * Uso: window.registerSectionCleanup('rodadas', () => clearInterval(myTimer));
 */
window.registerSectionCleanup = function (sectionId, cleanupFn) {
  if (!_sectionCleanups[sectionId]) _sectionCleanups[sectionId] = [];
  _sectionCleanups[sectionId].push(cleanupFn);
};

function _cleanupCurrentSection() {
  if (!_currentSection) return;
  const fns = _sectionCleanups[_currentSection];
  if (fns) {
    fns.forEach(fn => {
      try { fn(); } catch (e) {
        console.warn(`[NAVIGATION] Cleanup error (${_currentSection}):`, e);
      }
    });
    // Limpar para evitar re-registro duplicado
    _sectionCleanups[_currentSection] = [];
  }
}

function _initNavigation() {
  if (!ligaId) {
    if (typeof SuperModal !== 'undefined' && SuperModal.toast) {
      SuperModal.toast.error("Erro: ID da liga não encontrado na URL. Redirecionando para gerenciamento...");
      setTimeout(() => { window.location.href = "gerenciar.html"; }, 3000);
    } else {
      window.location.href = "gerenciar.html";
    }
    return;
  }
  const navButtons = document.querySelectorAll(".nav-menu button");
  const sections = document.querySelectorAll(".content-section");
  navButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const sectionId = button.getAttribute("data-section");
      if (!sectionId) return;
      // ✅ v1.2: Cleanup da seção anterior antes de trocar
      _cleanupCurrentSection();
      _currentSection = sectionId;
      navButtons.forEach((btn) => btn.classList.remove("active"));
      sections.forEach((section) => section.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(sectionId).classList.add("active");
      try {
        if (sectionId === "participantes") {
          const { carregarDetalhesLiga, toggleParticipants } = await import(
            "./participantes.js"
          );
          carregarDetalhesLiga();
          const toggleButton = document.querySelector(".toggle-participants");
          if (toggleButton)
            toggleButton.addEventListener("click", toggleParticipants);
        } else if (sectionId === "rodadas") {
          const { carregarRodadas } = await import("./rodadas.js");
          carregarRodadas();
          const rodadaSelect = document.getElementById("rodadaSelect");
          if (rodadaSelect)
            rodadaSelect.addEventListener("change", () => carregarRodadas());
        } else if (sectionId === "mata-mata") {
          try {
            const module = await import("./mata-mata.js");
            if (typeof module.carregarMataMata === "function") {
              module.carregarMataMata();
            } else {
              throw new Error(
                "Função carregarMataMata não encontrada. Tente limpar o cache do navegador (Ctrl+Shift+R) ou recarregar a página.",
              );
            }
          } catch (importErr) {
            throw new Error(
              `Erro ao carregar o módulo mata-mata.js: ${importErr.message}. Tente limpar o cache do navegador (Ctrl+Shift+R).`,
            );
          }
        } else if (sectionId === "ranking") {
          const { carregarRanking } = await import("./ranking.js");
          carregarRanking();
        } else if (sectionId === "melhor-mes") {
          const { carregarMelhorMes } = await import("./melhor-mes.js");
          carregarMelhorMes();
        } else if (sectionId === "fluxo-financeiro") {
          const { carregarFluxoFinanceiro } = await import(
            "./fluxo-financeiro.js?v7.6"
          );
          carregarFluxoFinanceiro();
        }
      } catch (err) {
        console.error(`Erro ao carregar ${sectionId}:`, err);
        document.getElementById(sectionId).innerHTML =
          `<p style="color: red; text-align: center;">${err.message}</p>`;
      }
    });
  });
  // REMOVIDO: parciaisBtn - módulo substituído por Raio-X da Rodada

  // ✅ v1.1: Suporte a section via URL (para redirect externo)
  const sectionFromUrl = urlParams.get("section");
  if (sectionFromUrl) {
    const targetButton = document.querySelector(`[data-section="${sectionFromUrl}"]`);
    if (targetButton) {
      console.log(`[NAVIGATION] Auto-navegando para seção: ${sectionFromUrl}`);
      // Pequeno delay para garantir que o DOM está pronto
      setTimeout(() => targetButton.click(), 100);
    }
  }
}

// ✅ v1.2: readyState check — garante init mesmo se script carrega após DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _initNavigation);
} else {
  _initNavigation();
}