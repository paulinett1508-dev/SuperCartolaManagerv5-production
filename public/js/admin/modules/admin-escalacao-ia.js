/**
 * ADMIN ESCALAÇÃO IA - Frontend Module v1.0
 * Módulo admin para sugestão inteligente de escalação multi-fonte.
 *
 * Carregado via vImport() pelo detalhe-liga-orquestrador.js.
 * API: /api/admin/escalacao-ia/*
 */

(function () {
    'use strict';

    const API_BASE = '/api/admin/escalacao-ia';
    let cenarioAtual = null;
    let dadosCompletos = null;

    // =====================================================================
    // INICIALIZAÇÃO
    // =====================================================================

    async function inicializar() {
        console.log('[ESCALACAO-IA] Inicializando módulo...');
        configurarTabs();
        await carregarStatusFontes();
    }

    // =====================================================================
    // TABS DE MODO
    // =====================================================================

    function configurarTabs() {
        const tabsContainer = document.getElementById('eia-tabs');
        if (!tabsContainer) return;

        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.eia-tab');
            if (!tab || !dadosCompletos) return;

            // Remover active de todas
            tabsContainer.querySelectorAll('.eia-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const modo = tab.dataset.modo;
            const cenario = dadosCompletos.cenarios.find(c => c.modo === modo);
            if (cenario) {
                renderizarCenario(cenario);
            }
        });
    }

    // =====================================================================
    // CARREGAR STATUS DAS FONTES
    // =====================================================================

    async function carregarStatusFontes() {
        try {
            const resp = await fetch(`${API_BASE}/status`);
            if (!resp.ok) return;

            const data = await resp.json();
            if (!data.success) return;

            renderizarFontesBadges(data.fontes);
        } catch (error) {
            console.warn('[ESCALACAO-IA] Erro ao carregar status fontes:', error);
        }
    }

    function renderizarFontesBadges(fontes) {
        const container = document.getElementById('eia-fontes-status');
        if (!container) return;

        const fontesArr = [
            { key: 'cartolaApi', icon: 'sports_soccer', label: 'API' },
            { key: 'gatoMestrePremium', icon: 'pets', label: 'GatoMestre' },
            { key: 'cartolaAnalitico', icon: 'analytics', label: 'Analítico' },
            { key: 'webScraper', icon: 'language', label: 'Web' },
            { key: 'perplexity', icon: 'psychology', label: 'Perplexity' },
        ];

        container.innerHTML = fontesArr.map(f => {
            const fonte = fontes[f.key];
            const ativo = fonte?.disponivel;
            const cls = ativo ? 'eia-fonte-badge--ativo' : 'eia-fonte-badge--inativo';
            const icon = ativo ? 'check_circle' : 'cancel';
            return `<span class="eia-fonte-badge ${cls}" title="${fonte?.descricao || f.label}">
                <span class="material-icons">${icon}</span>${f.label}
            </span>`;
        }).join('');
    }

    // =====================================================================
    // GERAR ANÁLISE
    // =====================================================================

    async function gerar() {
        const patrimonio = document.getElementById('eia-patrimonio')?.value || 100;
        const esquemaId = document.getElementById('eia-esquema')?.value || 3;

        mostrarLoading(true);
        esconderElemento('eia-empty');
        esconderElemento('eia-resultado');

        try {
            atualizarLoadingStep('Coletando dados da API Cartola...');
            const resp = await fetch(`${API_BASE}/gerar?patrimonio=${patrimonio}&esquemaId=${esquemaId}`);

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            if (!data.success) {
                throw new Error(data.message || 'Erro desconhecido');
            }

            dadosCompletos = data;

            // Selecionar modo sugerido
            const modoSugerido = data.modoSugerido?.modo || 'equilibrado';
            selecionarTab(modoSugerido);

            // Renderizar cenário do modo sugerido
            const cenario = data.cenarios.find(c => c.modo === modoSugerido) || data.cenarios[0];
            renderizarCenario(cenario);
            renderizarFontesAtivas(data.fontesAtivas);
            renderizarFooter(data);

            mostrarElemento('eia-resultado');
        } catch (error) {
            console.error('[ESCALACAO-IA] Erro ao gerar:', error);
            mostrarErro(error.message);
        } finally {
            mostrarLoading(false);
        }
    }

    // =====================================================================
    // REFRESH
    // =====================================================================

    async function refresh() {
        const patrimonio = document.getElementById('eia-patrimonio')?.value || 100;
        const esquemaId = document.getElementById('eia-esquema')?.value || 3;

        mostrarLoading(true);
        esconderElemento('eia-empty');

        try {
            atualizarLoadingStep('Limpando cache e re-analisando...');
            const resp = await fetch(`${API_BASE}/refresh?patrimonio=${patrimonio}&esquemaId=${esquemaId}`, {
                method: 'POST',
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            if (!data.success) throw new Error(data.message || 'Erro');

            dadosCompletos = data;

            const modoSugerido = data.modoSugerido?.modo || 'equilibrado';
            selecionarTab(modoSugerido);

            const cenario = data.cenarios.find(c => c.modo === modoSugerido) || data.cenarios[0];
            renderizarCenario(cenario);
            renderizarFontesAtivas(data.fontesAtivas);
            renderizarFooter(data);

            mostrarElemento('eia-resultado');
        } catch (error) {
            console.error('[ESCALACAO-IA] Erro ao refresh:', error);
            mostrarErro(error.message);
        } finally {
            mostrarLoading(false);
        }
    }

    // =====================================================================
    // RENDERIZAÇÃO
    // =====================================================================

    function renderizarCenario(cenario) {
        cenarioAtual = cenario;

        // Stats
        const elGasto = document.getElementById('eia-gasto');
        const elSobra = document.getElementById('eia-sobra');
        const elPontuacao = document.getElementById('eia-pontuacao');
        const elFontes = document.getElementById('eia-total-fontes');
        const elResumo = document.getElementById('eia-resumo-texto');

        if (elGasto) elGasto.textContent = `C$ ${cenario.gastoTotal.toFixed(2)}`;
        if (elSobra) elSobra.textContent = `C$ ${cenario.sobra.toFixed(2)}`;
        if (elPontuacao) elPontuacao.textContent = `${cenario.pontuacaoEsperada.min} - ${cenario.pontuacaoEsperada.max} pts`;
        if (elFontes) elFontes.textContent = dadosCompletos?.fontesAtivas?.length || 0;
        if (elResumo) elResumo.textContent = cenario.resumo || '';

        // Badge anti-confronto
        renderizarBadgeAntiConfronto(cenario);

        // Escalação (cards)
        renderizarEscalacao(cenario.escalacao, cenario.justificativas);
    }

    function renderizarEscalacao(escalacao, justificativas) {
        const container = document.getElementById('eia-escalacao');
        if (!container) return;

        // Ordenar por posição: GOL, LAT, ZAG, MEI, ATA, TEC
        const ordenada = [...escalacao].sort((a, b) => a.posicaoId - b.posicaoId);

        container.innerHTML = ordenada.map(jogador => {
            const isCapitao = jogador.capitao;
            const justificativa = justificativas?.[jogador.atletaId] || '';
            const confianca = jogador.confianca || 0;
            const corConfianca = confianca >= 70 ? 'var(--color-success)' :
                confianca >= 40 ? 'var(--color-warning, #f59e0b)' : 'var(--color-danger)';

            const adversarioInfo = jogador.fontes?.confrontos?.adversarioNome
                ? `vs ${jogador.fontes.confrontos.adversarioNome}${jogador.fontes?.confrontos?.mandante ? ' (casa)' : ' (fora)'}`
                : '';

            return `
                <div class="eia-jogador-card ${isCapitao ? 'eia-jogador-card--capitao' : ''}">
                    <div class="eia-jogador-top">
                        <img class="eia-jogador-foto"
                             src="${jogador.foto || '/img/avatar-default.png'}"
                             alt="${jogador.nome}"
                             onerror="this.src='/img/avatar-default.png'">
                        <div class="eia-jogador-info">
                            <div class="eia-jogador-nome">${jogador.nome}</div>
                            <div class="eia-jogador-meta">
                                <span>${jogador.clubeAbrev}</span>
                                <span>${adversarioInfo}</span>
                            </div>
                        </div>
                        <span class="eia-jogador-posicao">${jogador.posicaoAbrev || jogador.posicao || ''}</span>
                    </div>
                    <div class="eia-jogador-scores">
                        <div class="eia-jogador-score">
                            <span class="eia-jogador-score-label">Preço</span>
                            <span class="eia-jogador-score-value eia-jogador-score-value--preco">C$ ${jogador.preco.toFixed(2)}</span>
                        </div>
                        <div class="eia-jogador-score">
                            <span class="eia-jogador-score-label">Média</span>
                            <span class="eia-jogador-score-value">${jogador.media.toFixed(1)}</span>
                        </div>
                        <div class="eia-jogador-score">
                            <span class="eia-jogador-score-label">Score IA</span>
                            <span class="eia-jogador-score-value eia-jogador-score-value--score">${jogador.scoreFinal.toFixed(1)}</span>
                        </div>
                        <div class="eia-jogador-score">
                            <span class="eia-jogador-score-label">Confiança</span>
                            <span class="eia-jogador-score-value">${confianca}%</span>
                        </div>
                    </div>
                    <div class="eia-jogador-confianca">
                        <div class="eia-jogador-confianca-bar"
                             style="width: ${confianca}%; background: ${corConfianca};"></div>
                    </div>
                    ${justificativa ? `<div class="eia-jogador-justificativa">${justificativa}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    function renderizarFontesAtivas(fontes) {
        // Atualizar badges com fontes que realmente retornaram dados
        const container = document.getElementById('eia-fontes-status');
        if (!container || !fontes) return;

        const fontesMap = {
            'cartola-api': { icon: 'sports_soccer', label: 'API' },
            'confrontos': { icon: 'compare_arrows', label: 'Confrontos' },
            'cedidos': { icon: 'shield', label: 'Cedidos' },
            'gato-mestre-premium': { icon: 'pets', label: 'GatoMestre' },
            'cartola-analitico': { icon: 'analytics', label: 'Analítico' },
            'web-scraper': { icon: 'language', label: 'Web' },
            'perplexity': { icon: 'psychology', label: 'Perplexity' },
        };

        container.innerHTML = fontes.map(f => {
            const info = fontesMap[f] || { icon: 'check', label: f };
            return `<span class="eia-fonte-badge eia-fonte-badge--ativo">
                <span class="material-icons">${info.icon}</span>${info.label}
            </span>`;
        }).join('');
    }

    function renderizarFooter(data) {
        const footer = document.getElementById('eia-footer-info');
        if (!footer) return;

        const tempo = data.tempoAgregacaoMs ? `${(data.tempoAgregacaoMs / 1000).toFixed(1)}s` : 'N/D';
        footer.textContent = `Rodada ${data.rodada || '?'} | ${data.totalAtletasAnalisados || 0} atletas analisados | `
            + `${data.fontesAtivas?.length || 0} fontes ativas | Tempo: ${tempo} | ${data.geradoEm ? new Date(data.geradoEm).toLocaleString('pt-BR') : ''}`;
    }

    // =====================================================================
    // TRAVA ANTI-CONFRONTO - INDICADOR VISUAL
    // =====================================================================

    function renderizarBadgeAntiConfronto(cenario) {
        // Remover badge anterior se existir
        const anterior = document.getElementById('eia-anti-confronto');
        if (anterior) anterior.remove();

        const total = cenario.totalConfrontosEvitados || 0;
        if (total === 0) return;

        // Container pai dos stats (eia-resumo-stats)
        const container = document.querySelector('.eia-resumo-stats');
        if (!container) return;

        const badge = document.createElement('div');
        badge.id = 'eia-anti-confronto';
        badge.className = 'eia-stat eia-stat--anti-confronto';
        badge.innerHTML = `
            <span class="eia-stat-label" style="display: flex; align-items: center; gap: 4px;">
                <span class="material-icons" style="color: var(--color-warning, #f59e0b); font-size: 14px;">shield</span>
                Conflitos Evitados
            </span>
            <span class="eia-stat-value" style="color: var(--color-warning, #f59e0b);">${total}</span>
        `;

        // Tooltip com detalhes
        const detalhes = (cenario.confrontosEvitados || [])
            .slice(0, 5)
            .map(c => `${c.bloqueado.nome} (${c.bloqueado.posicao} - ${c.bloqueado.clubeAbrev})`)
            .join('\n');
        badge.title = `Trava Anti-Confronto ativa\nJogadores bloqueados por conflito de posicoes antagonicas:\n${detalhes}${total > 5 ? `\n...e mais ${total - 5}` : ''}`;

        container.appendChild(badge);
    }

    // =====================================================================
    // HELPERS UI
    // =====================================================================

    function selecionarTab(modo) {
        const tabs = document.querySelectorAll('.eia-tab');
        tabs.forEach(t => {
            t.classList.toggle('active', t.dataset.modo === modo);
        });
    }

    function mostrarLoading(show) {
        const loading = document.getElementById('eia-loading');
        if (loading) loading.style.display = show ? 'block' : 'none';

        const btn = document.getElementById('eia-btn-gerar');
        if (btn) btn.disabled = show;
    }

    function atualizarLoadingStep(texto) {
        const step = document.getElementById('eia-loading-step');
        if (step) step.textContent = texto;
    }

    function mostrarElemento(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    }

    function esconderElemento(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    function mostrarErro(mensagem) {
        const resultado = document.getElementById('eia-resultado');
        if (resultado) {
            resultado.style.display = 'block';
            resultado.innerHTML = `
                <div class="eia-resumo" style="border-color: var(--color-danger);">
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--color-danger);">
                        <span class="material-icons">error</span>
                        <span>Erro ao gerar análise: ${mensagem}</span>
                    </div>
                </div>
            `;
        }
    }

    // =====================================================================
    // EXPOR API GLOBAL
    // =====================================================================

    window.EscalacaoIA = {
        inicializar,
        gerar,
        refresh,
    };

    window.inicializarEscalacaoIA = inicializar;
})();
