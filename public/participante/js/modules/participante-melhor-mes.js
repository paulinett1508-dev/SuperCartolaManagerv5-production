// =====================================================================
// PARTICIPANTE-MELHOR-MES.JS - v3.7 (Cache-First IndexedDB)
// ✅ v3.7: Fix escapeHtml local + comparação de cache robusta
// ✅ v3.6: Cache-first com IndexedDB para carregamento instantâneo
// ✅ v3.4: Scroll automático para última edição com dados
// ✅ v3.5: Card "Seu Desempenho" com estatísticas do participante
// =====================================================================

if (window.Log) Log.info("[MELHOR-MES-PARTICIPANTE] 🏆 Módulo v3.7 carregando...");

// Sanitização XSS — local para não depender de ordem de carregamento
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

let ligaIdAtual = null;
let timeIdAtual = null;

// Ícones numéricos usando Material Icons (consistência visual)
const edicoesIcons = {
    1: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">looks_one</span>',
    2: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">looks_two</span>',
    3: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">looks_3</span>',
    4: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">looks_4</span>',
    5: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">looks_5</span>',
    6: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">looks_6</span>',
    7: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">filter_7</span>',
    8: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">filter_8</span>',
    9: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">filter_9</span>',
    10: '<span class="material-symbols-outlined mm-edicao-num" style="font-size: 20px; color: #ff5c00;">filter_9_plus</span>',
};

// =====================================================================
// FUNÇÃO PRINCIPAL - INICIALIZAR
// =====================================================================
export async function inicializarMelhorMesParticipante({
    participante,
    ligaId,
    timeId,
}) {
    if (window.Log) Log.info("[MELHOR-MES-PARTICIPANTE] 🚀 Inicializando v3.6...", {
        ligaId,
        timeId,
    });

    if (!ligaId) {
        mostrarErro("Dados da liga não encontrados");
        return;
    }

    ligaIdAtual = ligaId;
    timeIdAtual = timeId;

    // ✅ v3.6: CACHE-FIRST - Tentar carregar do IndexedDB primeiro
    let usouCache = false;
    let dadosCache = null;

    if (window.OfflineCache) {
        try {
            const mmCache = await window.OfflineCache.get('melhorMes', ligaId, true);
            if (mmCache && mmCache.edicoes && mmCache.edicoes.length > 0) {
                usouCache = true;
                dadosCache = mmCache;

                // Renderizar IMEDIATAMENTE com dados do cache
                if (window.Log)
                    Log.info(`[MELHOR-MES-PARTICIPANTE] ⚡ Cache IndexedDB: ${mmCache.edicoes.length} edições`);

                renderizarMelhorMes(mmCache.edicoes, timeId);
                setTimeout(() => scrollParaUltimaEdicao(mmCache.edicoes), 150);
            }
        } catch (e) {
            if (window.Log) Log.warn("[MELHOR-MES-PARTICIPANTE] ⚠️ Erro ao ler cache:", e);
        }
    }

    await carregarMelhorMes(ligaId, timeId, usouCache, dadosCache);
}

window.inicializarMelhorMesParticipante = inicializarMelhorMesParticipante;

// =====================================================================
// CARREGAR DADOS DO BACKEND
// =====================================================================
async function carregarMelhorMes(ligaId, timeId, usouCache = false, dadosCache = null) {
    // Se não tem cache, mostrar loading
    if (!usouCache) {
        mostrarLoading(true);
    }

    try {
        // ✅ v9.0: Passar temporada para segregar dados por ano
        const temporada = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
        const response = await fetch(`/api/ligas/${ligaId}/melhor-mes?temporada=${temporada}`);

        if (!response.ok) {
            throw new Error(`Erro ao buscar dados: ${response.status}`);
        }

        const dados = await response.json();
        if (window.Log) Log.info("[MELHOR-MES-PARTICIPANTE] ✅ Dados recebidos da API");

        mostrarLoading(false);

        if (!dados.edicoes || dados.edicoes.length === 0) {
            if (!usouCache) {
                mostrarEstadoVazio(true);
            }
            return;
        }

        // ✅ v3.6: Salvar no IndexedDB para próxima visita
        if (window.OfflineCache) {
            try {
                await window.OfflineCache.set('melhorMes', ligaId, dados);
                if (window.Log) Log.info("[MELHOR-MES-PARTICIPANTE] 💾 Cache IndexedDB atualizado");
            } catch (e) {
                if (window.Log) Log.warn("[MELHOR-MES-PARTICIPANTE] ⚠️ Erro ao salvar cache:", e);
            }
        }

        // v3.7: Comparação robusta — detecta mudanças em ranges, status e campeões
        const edicoesFingerprint = (eds) =>
            (eds || []).map(e => `${e.id}:${e.inicio}-${e.fim}:${e.status}:${e.campeao?.timeId || ''}`).join('|');

        const dadosMudaram = !usouCache ||
            !dadosCache ||
            edicoesFingerprint(dadosCache.edicoes) !== edicoesFingerprint(dados.edicoes);

        if (dadosMudaram) {
            renderizarMelhorMes(dados.edicoes, timeId);
            // ✅ v3.4: Scroll para última edição com dados após renderização
            setTimeout(() => scrollParaUltimaEdicao(dados.edicoes), 150);
            if (usouCache && window.Log) {
                Log.info("[MELHOR-MES-PARTICIPANTE] 🔄 Re-renderizado com dados frescos");
            }
        } else if (window.Log) {
            Log.info("[MELHOR-MES-PARTICIPANTE] ✅ Dados iguais, mantendo renderização do cache");
        }
    } catch (error) {
        if (window.Log) Log.error("[MELHOR-MES-PARTICIPANTE] ❌ Erro:", error);
        mostrarLoading(false);
        if (!usouCache) {
            mostrarErro(error.message);
        }
    }
}

// =====================================================================
// ✅ v3.4: SCROLL AUTOMÁTICO PARA ÚLTIMA EDIÇÃO COM DADOS
// =====================================================================
function scrollParaUltimaEdicao(edicoes) {
    // Encontrar última edição com dados (campeão definido)
    let ultimaEdicaoIndex = -1;

    for (let i = edicoes.length - 1; i >= 0; i--) {
        if (edicoes[i].campeao || edicoes[i].ranking?.length > 0) {
            ultimaEdicaoIndex = i;
            break;
        }
    }

    if (ultimaEdicaoIndex === -1) {
        if (window.Log) Log.info(
            "[MELHOR-MES-PARTICIPANTE] ⚠️ Nenhuma edição com dados para scroll",
        );
        return;
    }

    // Encontrar o card correspondente
    const container = document.getElementById("mesesGrid");
    if (!container) return;

    const cards = container.querySelectorAll(".mm-edicao-card");
    const targetCard = cards[ultimaEdicaoIndex];

    if (targetCard) {
        // Scroll suave para o card
        targetCard.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });

        // Highlight temporário para indicar foco
        targetCard.style.transition = "box-shadow 0.3s ease";
        targetCard.style.boxShadow = "0 0 0 2px #ff5c00";

        setTimeout(() => {
            targetCard.style.boxShadow = "";
        }, 1500);

        if (window.Log) Log.info(
            `[MELHOR-MES-PARTICIPANTE] ✅ Scroll para Edição ${ultimaEdicaoIndex + 1}`,
        );
    }
}

// =====================================================================
// RENDERIZAR MELHOR MÊS
// =====================================================================
function renderizarMelhorMes(edicoes, meuTimeId) {
    const meuTimeIdNum = Number(meuTimeId);

    const countEl = document.getElementById("mmEdicoesCount");
    if (countEl) {
        countEl.textContent = `${edicoes.length} ${edicoes.length === 1 ? "edição" : "edições"}`;
    }

    // Filtrar apenas campeões ativos
    const minhasConquistas = edicoes.filter(
        (e) =>
            e.campeao &&
            Number(e.campeao.timeId) === meuTimeIdNum &&
            e.campeao.ativo !== false,
    );

    renderizarConquistas(minhasConquistas);

    const container = document.getElementById("mesesGrid");
    if (!container) return;

    container.innerHTML = edicoes
        .map((edicao) => renderizarEdicaoCard(edicao, meuTimeIdNum))
        .join("");

    // ✅ v3.5: Renderizar card "Seu Desempenho" ao final
    renderizarCardDesempenho(edicoes, meuTimeIdNum, container);

    if (window.Log) Log.info("[MELHOR-MES-PARTICIPANTE] ✅ Cards renderizados");
}

// =====================================================================
// ✅ v3.5: CARD "SEU DESEMPENHO"
// =====================================================================
function calcularDesempenho(edicoes, meuTimeIdNum) {
    let titulos = 0;
    let podios = 0;
    let posicoes = [];
    let mesesTitulo = [];
    let edicoesParticipadas = 0;

    edicoes.forEach((edicao) => {
        if (!edicao.ranking || edicao.ranking.length === 0) return;

        // Encontrar minha posição nesta edição
        const rankingAtivos = edicao.ranking.filter((t) => t.ativo !== false);
        const minhaPosicao = rankingAtivos.findIndex(
            (t) => Number(t.timeId) === meuTimeIdNum,
        );

        if (minhaPosicao === -1) return; // Não participei desta edição

        edicoesParticipadas++;
        const posicao = minhaPosicao + 1;
        posicoes.push(posicao);

        if (posicao === 1) {
            titulos++;
            mesesTitulo.push(
                edicao.nome?.replace("Edição ", "").replace(" - ", " ") ||
                    `Ed. ${edicao.id}`,
            );
        }
        if (posicao <= 3) {
            podios++;
        }
    });

    const posicaoMedia =
        posicoes.length > 0
            ? (posicoes.reduce((a, b) => a + b, 0) / posicoes.length).toFixed(1)
            : 0;
    const melhorPosicao = posicoes.length > 0 ? Math.min(...posicoes) : 0;
    const piorPosicao = posicoes.length > 0 ? Math.max(...posicoes) : 0;
    const taxaPodio =
        edicoesParticipadas > 0
            ? Math.round((podios / edicoesParticipadas) * 100)
            : 0;

    return {
        titulos,
        podios,
        posicaoMedia,
        melhorPosicao,
        piorPosicao,
        taxaPodio,
        edicoesParticipadas,
        mesesTitulo,
    };
}

function renderizarCardDesempenho(edicoes, meuTimeIdNum, gridContainer) {
    // Remove card anterior se existir
    const existente = document.getElementById("mm-card-desempenho");
    if (existente) existente.remove();

    const stats = calcularDesempenho(edicoes, meuTimeIdNum);

    // Se não participou de nenhuma edição, não mostra o card
    if (stats.edicoesParticipadas === 0) {
        return;
    }

    const cardHTML = `
        <div id="mm-card-desempenho" class="mm-desempenho-card">
            <!-- Header -->
            <div class="mm-desempenho-header">
                <span class="material-symbols-outlined" style="font-size: 22px; color: #ff5c00;">insights</span>
                <span>Seu Desempenho em ${stats.edicoesParticipadas} ${stats.edicoesParticipadas === 1 ? "edição" : "edições"}</span>
            </div>

            <!-- Stats -->
            <div class="mm-desempenho-content">
                <!-- Linha 1: Títulos e Pódios -->
                <div class="mm-desempenho-row">
                    <div class="mm-desempenho-stat ${stats.titulos === 0 ? "empty" : ""}">
                        <span class="material-symbols-outlined ${stats.titulos > 0 ? "text-yellow-400" : "text-zinc-600"}" style="font-size: 28px;">emoji_events</span>
                        <div>
                            <div class="mm-desempenho-valor">${stats.titulos}</div>
                            <div class="mm-desempenho-label">Títulos</div>
                        </div>
                    </div>
                    <div class="mm-desempenho-stat ${stats.podios === 0 ? "empty" : ""}">
                        <span class="material-symbols-outlined ${stats.podios > 0 ? "text-orange-400" : "text-zinc-600"}" style="font-size: 28px;">military_tech</span>
                        <div>
                            <div class="mm-desempenho-valor">${stats.podios}</div>
                            <div class="mm-desempenho-label">Pódios</div>
                        </div>
                    </div>
                </div>

                <!-- Linha 2: Posições -->
                <div class="mm-desempenho-row-3">
                    <div class="mm-desempenho-pos">
                        <div class="mm-desempenho-pos-icon">
                            <span class="material-symbols-outlined text-green-400" style="font-size: 18px;">arrow_upward</span>
                            <span>Melhor</span>
                        </div>
                        <span class="mm-desempenho-pos-valor">${stats.melhorPosicao}º</span>
                    </div>
                    <div class="mm-desempenho-pos">
                        <div class="mm-desempenho-pos-icon">
                            <span class="material-symbols-outlined text-blue-400" style="font-size: 18px;">functions</span>
                            <span>Média</span>
                        </div>
                        <span class="mm-desempenho-pos-valor">${stats.posicaoMedia}º</span>
                    </div>
                    <div class="mm-desempenho-pos">
                        <div class="mm-desempenho-pos-icon">
                            <span class="material-symbols-outlined text-red-400" style="font-size: 18px;">arrow_downward</span>
                            <span>Pior</span>
                        </div>
                        <span class="mm-desempenho-pos-valor">${stats.piorPosicao}º</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inserir ao final do grid
    gridContainer.insertAdjacentHTML("beforeend", cardHTML);
}

// =====================================================================
// RENDERIZAR CONQUISTAS
// =====================================================================
function renderizarConquistas(conquistas) {
    const container = document.getElementById("mmConquistas");
    const texto = document.getElementById("conquistasTexto");
    const meses = document.getElementById("conquistasMeses");

    if (!container || !texto || !meses) return;

    if (conquistas.length === 0) {
        container.style.display = "none";
        return;
    }

    container.style.display = "block";
    texto.textContent = `Você foi campeão ${conquistas.length}x!`;
    meses.innerHTML = conquistas
        .map((e) => `<span class="mes-chip-pro">${e.nome}</span>`)
        .join("");
}

// =====================================================================
// RENDERIZAR EDIÇÃO EM CARD
// =====================================================================
function renderizarEdicaoCard(edicao, meuTimeIdNum) {
    const campeao = edicao.campeao;
    const isConsolidado = edicao.status === "consolidado" || edicao.status === "concluido";
    // Só considerar "sou campeão" se estiver ativo
    const souCampeao =
        campeao &&
        Number(campeao.timeId) === meuTimeIdNum &&
        campeao.ativo !== false;

    let statusIcon = '<span class="material-symbols-outlined" style="font-size: 14px;">schedule</span>';
    let statusText = "PENDENTE";
    let statusBgClass = "bg-zinc-700/50";

    if (edicao.status === "consolidado" || edicao.status === "concluido") {
        statusIcon = '<span class="material-symbols-outlined" style="font-size: 14px;">check_circle</span>';
        statusText = "CONCLUÍDO";
        statusBgClass = "bg-green-500/20 text-green-400";
    } else if (edicao.status === "em_andamento") {
        statusIcon = '<span class="material-symbols-outlined" style="font-size: 14px;">hourglass_empty</span>';
        statusText = "EM ANDAMENTO";
        statusBgClass = "bg-blue-500/20 text-blue-400";
    }

    const edicaoIcon = edicoesIcons[edicao.id] || '<span class="material-symbols-outlined" style="font-size: 20px; color: #ff5c00;">event</span>';
    const rodadasInfo =
        edicao.inicio && edicao.fim ? `R${edicao.inicio} - R${edicao.fim}` : "";

    // Ranking apenas ativos
    const rankingAtivos = edicao.ranking
        ? edicao.ranking.filter((t) => t.ativo !== false)
        : [];
    return `
        <div class="mm-edicao-card ${souCampeao ? "meu-titulo" : ""}">
            <!-- Header do Card -->
            <div class="mm-card-header">
                <div class="mm-card-icon">${edicaoIcon}</div>
                <div class="mm-card-info">
                    <h3 class="mm-card-title">${escapeHtml(edicao.nome)}</h3>
                    ${rodadasInfo ? `<span class="mm-card-rodadas">${rodadasInfo}</span>` : ""}
                </div>
                <span class="mm-card-status ${statusBgClass}">
                    ${statusIcon} ${statusText}
                </span>
            </div>

            <!-- Ranking Completo (só exibe se houver dados) -->
            ${rankingAtivos.length > 0 ? `
                <div class="mm-ranking-list">
                ${(() => {
                    const labelLider = isConsolidado ? 'CAMPEÃO' : 'LÍDER';
                    const inativos = edicao.ranking ? edicao.ranking.filter(t => t.ativo === false) : [];
                    let h = '';
                    rankingAtivos.forEach((time, idx) => {
                        const pos = idx + 1;
                        const isMeu = Number(time.timeId) === meuTimeIdNum && time.ativo !== false;
                        const pts = (Math.trunc(time.pontos_total * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        const posDisplay = pos === 1 ? '<span class="material-symbols-outlined" style="font-size:16px;color:#fbbf24;">emoji_events</span>' : pos + '\u00BA';

                        h += '<div class="mm-ranking-row' + (pos === 1 ? ' mm-ranking-lider' : '') + (isMeu ? ' mm-ranking-meu' : '') + '">'
                            + '<div style="display:flex;align-items:center;gap:10px;">'
                            + '<span class="mm-ranking-pos">' + posDisplay + '</span>'
                            + '<div>'
                            + '<div class="mm-ranking-nome' + (isMeu ? ' meu' : '') + '">' + escapeHtml(time.nome_time || 'N/D') + '</div>'
                            + (time.nome_cartola ? '<div style="font-size:10px;color:#888;margin-top:1px;">' + escapeHtml(time.nome_cartola) + '</div>' : '')
                            + (pos === 1 ? '<div class="mm-ranking-badge-lider">' + labelLider + '</div>' : '')
                            + '</div></div>'
                            + '<span class="mm-ranking-pts' + (pos === 1 ? ' lider' : '') + '">' + pts + '</span>'
                            + '</div>';
                    });

                    if (inativos.length > 0) {
                        h += '<div style="padding:6px 14px;background:rgba(100,100,100,0.15);border-top:1px dashed rgba(100,100,100,0.4);border-bottom:1px dashed rgba(100,100,100,0.4);">'
                            + '<span style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">'
                            + '<span class="material-icons" style="font-size:12px;vertical-align:middle;margin-right:4px;">person_off</span>'
                            + 'Inativos</span></div>';
                        inativos.forEach(time => {
                            const pts = (Math.trunc(time.pontos_total * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            h += '<div class="mm-ranking-row mm-ranking-inativo">'
                                + '<div style="display:flex;align-items:center;gap:10px;">'
                                + '<span class="mm-ranking-pos" style="color:#555;">\u2014</span>'
                                + '<div><div class="mm-ranking-nome" style="color:#666;">' + escapeHtml(time.nome_time || 'N/D') + '</div>'
                                + (time.nome_cartola ? '<div style="font-size:10px;color:#555;margin-top:1px;">' + escapeHtml(time.nome_cartola) + '</div>' : '')
                                + '</div></div>'
                                + '<span class="mm-ranking-pts" style="color:#555;">' + pts + '</span>'
                                + '</div>';
                        });
                    }
                    return h;
                })()}
                </div>
            ` : ''}
        </div>
    `;
}

// =====================================================================
// UTILS
// =====================================================================
function truncarNome(nome, max) {
    if (!nome) return "";
    return nome.length > max ? nome.substring(0, max) + "..." : nome;
}

// =====================================================================
// ESTADOS
// =====================================================================
function mostrarLoading(show) {
    const loading = document.getElementById("mmLoading");
    const grid = document.getElementById("mesesGrid");

    if (loading) loading.style.display = show ? "flex" : "none";
    if (grid) grid.style.display = show ? "none" : "flex";
}

function mostrarEstadoVazio(show) {
    const empty = document.getElementById("mmEmpty");
    const grid = document.getElementById("mesesGrid");

    if (empty) empty.style.display = show ? "block" : "none";
    if (grid) grid.style.display = show ? "none" : "flex";
}

function mostrarErro(mensagem) {
    const grid = document.getElementById("mesesGrid");
    if (grid) {
        grid.style.display = "flex";
        grid.innerHTML = `
            <div style="width: 100%; text-align: center; padding: 40px; color: var(--app-danger);">
                <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px; color: var(--app-danger-light);">error</span></div>
                <h3 style="color: var(--app-danger-light); margin-bottom: 8px;">Erro ao Carregar</h3>
                <p style="color: #9ca3af; margin: 12px 0;">${mensagem}</p>
                <button onclick="window.inicializarMelhorMesParticipante({ligaId: '${ligaIdAtual}', timeId: '${timeIdAtual}'})"
                        style="margin-top: 16px; padding: 12px 24px; background: #E65100;
                               color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">refresh</span> Tentar Novamente
                </button>
            </div>
        `;
    }
}

if (window.Log) Log.info(
    "[MELHOR-MES-PARTICIPANTE] ✅ Módulo v3.7 carregado (Cache-First IndexedDB)",
);
