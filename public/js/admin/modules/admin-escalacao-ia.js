/**
 * ADMIN ESCALAÇÃO IA - Frontend Module v2.0
 * Módulo admin para sugestão inteligente de escalação multi-fonte.
 *
 * Carregado via vImport() pelo detalhe-liga-orquestrador.js.
 * API: /api/admin/escalacao-ia/*
 *
 * v2.0: Salvar/Refresh separados, auto-load, badge disponibilidade real
 */

(function () {
    'use strict';

    const API_BASE = '/api/admin/escalacao-ia';
    let cenarioAtual = null;
    let dadosCompletos = null;
    let patrimonioAlteradoManualmente = false;

    // =====================================================================
    // HELPERS MODO PROFESSOR
    // =====================================================================

    function isModoProfessorAtivo() {
        return document.getElementById('eia-modo-professor')?.checked || false;
    }

    /**
     * Converte **texto** em <strong>texto</strong> (sanitizado).
     * Escapa HTML antes de converter para evitar XSS.
     */
    function formatarJustificativa(texto) {
        if (!texto) return '';
        // Escapar HTML
        const escaped = texto
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Converter **bold**
        return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    /**
     * Extrai a "Lição da Rodada" do texto do resumo.
     * O professorPrompt pede que a IA termine com uma lição.
     */
    function extrairLicaoDaRodada(resumo) {
        if (!resumo) return null;
        // Procurar padrões comuns: "Lição da Rodada:", "Lição:", "Dica do Professor:"
        const regex = /(?:li[çc][aã]o\s*(?:da\s*rodada)?|dica\s*do\s*professor)\s*[:]\s*(.+)/i;
        const match = resumo.match(regex);
        if (match) return match[1].trim();

        // Fallback: última frase após ponto final se resumo longo
        const frases = resumo.split(/\.\s+/);
        if (frases.length >= 3) {
            const ultima = frases[frases.length - 1].trim();
            if (ultima.length > 20) return ultima.replace(/\.$/, '');
        }
        return null;
    }

    // =====================================================================
    // INICIALIZAÇÃO
    // =====================================================================

    async function inicializar() {
        console.log('[ESCALACAO-IA] Inicializando módulo v2.0...');
        configurarTabs();
        configurarToggleProfessor();
        // Rastrear alteração manual do patrimônio pelo usuário
        document.getElementById('eia-patrimonio')?.addEventListener('change', () => {
            patrimonioAlteradoManualmente = true;
        });
        await carregarStatusFontes();
        await tentarAutoLoad();
    }

    // =====================================================================
    // TOGGLE MODO PROFESSOR — estado visual do card
    // =====================================================================

    function configurarToggleProfessor() {
        const checkbox = document.getElementById('eia-modo-professor');
        const card = document.getElementById('eia-professor-card');
        if (!checkbox || !card) return;

        checkbox.addEventListener('change', () => {
            card.classList.toggle('ativo', checkbox.checked);
        });
    }

    // =====================================================================
    // AUTO-LOAD: Carregar escalação salva ao abrir
    // =====================================================================

    async function tentarAutoLoad() {
        try {
            const resp = await fetch(`${API_BASE}/salva`);
            if (!resp.ok) return;

            const data = await resp.json();
            if (!data.success || !data.encontrada) return;

            const dados = data.dados;
            dadosCompletos = dados;

            const modoSugerido = dados.modoSugerido?.modo || 'equilibrado';
            selecionarTab(modoSugerido);

            const cenario = dados.cenarios.find(c => c.modo === modoSugerido) || dados.cenarios[0];
            renderizarCenario(cenario);
            renderizarFontesAtivas(dados.fontesAtivas);
            renderizarFooter(dados);
            renderizarBadgeSalvo(dados.salvoEm);

            esconderElemento('eia-empty');
            mostrarElemento('eia-resultado');
            mostrarBtnSalvar(true);

            // Atualizar inputs com valores salvos
            const elPatrimonio = document.getElementById('eia-patrimonio');
            const elEsquema = document.getElementById('eia-esquema');
            if (elPatrimonio && dados.patrimonio) elPatrimonio.value = dados.patrimonio;
            if (elEsquema && dados.esquemaId) elEsquema.value = dados.esquemaId;

            console.log(`[ESCALACAO-IA] Auto-load: escalacao salva da rodada ${dados.rodada} (${dados.salvoEm})`);
        } catch (error) {
            console.warn('[ESCALACAO-IA] Auto-load falhou (normal se nenhuma salva):', error.message);
        }
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
        // Se o usuário não alterou manualmente, envia vazio → backend busca da conta real do admin
        const patrimonioEl = document.getElementById('eia-patrimonio');
        const patrimonio = patrimonioAlteradoManualmente ? (patrimonioEl?.value || '') : '';
        const esquemaId = document.getElementById('eia-esquema')?.value || 3;

        mostrarLoading(true);
        esconderElemento('eia-empty');
        esconderElemento('eia-resultado');

        try {
            atualizarLoadingStep('Coletando dados da API Cartola...');
            const modoProfessor = isModoProfessorAtivo();
            console.log('[ESCALACAO-IA] Modo Professor:', modoProfessor, '| Checkbox:', document.getElementById('eia-modo-professor')?.checked);
            const params = new URLSearchParams({ esquemaId });
            if (patrimonio) params.set('patrimonio', patrimonio);
            if (modoProfessor) params.set('modoProfessor', 'true');
            const url = `${API_BASE}/gerar?${params}`;
            const resp = await fetch(url);

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            if (!data.success) {
                throw new Error(data.message || 'Erro desconhecido');
            }

            dadosCompletos = data;

            // Atualizar input com patrimônio real retornado pelo backend
            if (data.patrimonio && patrimonioEl) {
                patrimonioEl.value = data.patrimonio;
                patrimonioAlteradoManualmente = false;
            }

            // Selecionar modo sugerido
            const modoSugerido = data.modoSugerido?.modo || 'equilibrado';
            selecionarTab(modoSugerido);

            // Renderizar cenário do modo sugerido
            const cenario = data.cenarios.find(c => c.modo === modoSugerido) || data.cenarios[0];
            renderizarCenario(cenario);
            renderizarFontesAtivas(data.fontesAtivas);
            renderizarFooter(data);

            mostrarElemento('eia-resultado');
            mostrarBtnSalvar(true);
        } catch (error) {
            console.error('[ESCALACAO-IA] Erro ao gerar:', error);
            mostrarErro(error.message);
        } finally {
            mostrarLoading(false);
        }
    }

    // =====================================================================
    // REFRESH (Atualizar Dados)
    // =====================================================================

    async function refresh() {
        // Confirmação antes de limpar cache
        const confirmar = confirm(
            'Atualizar Dados\n\n'
            + 'Isso vai limpar o cache e buscar dados novos de todas as fontes '
            + '(API Cartola, GatoMestre, Perplexity, etc).\n\n'
            + 'Pode levar alguns segundos. Continuar?'
        );
        if (!confirmar) return;

        const patrimonioEl = document.getElementById('eia-patrimonio');
        const patrimonio = patrimonioAlteradoManualmente ? (patrimonioEl?.value || '') : '';
        const esquemaId = document.getElementById('eia-esquema')?.value || 3;

        mostrarLoading(true);
        esconderElemento('eia-empty');

        try {
            atualizarLoadingStep('Limpando cache e re-analisando...');
            const modoProfessor = isModoProfessorAtivo();
            const refreshParams = new URLSearchParams({ esquemaId });
            if (patrimonio) refreshParams.set('patrimonio', patrimonio);
            if (modoProfessor) refreshParams.set('modoProfessor', 'true');
            const refreshUrl = `${API_BASE}/refresh?${refreshParams}`;
            const resp = await fetch(refreshUrl, {
                method: 'POST',
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            if (!data.success) throw new Error(data.message || 'Erro');

            dadosCompletos = data;

            // Atualizar input com patrimônio real retornado pelo backend
            const patrimonioElR = document.getElementById('eia-patrimonio');
            if (data.patrimonio && patrimonioElR) {
                patrimonioElR.value = data.patrimonio;
                patrimonioAlteradoManualmente = false;
            }

            const modoSugerido = data.modoSugerido?.modo || 'equilibrado';
            selecionarTab(modoSugerido);

            const cenario = data.cenarios.find(c => c.modo === modoSugerido) || data.cenarios[0];
            renderizarCenario(cenario);
            renderizarFontesAtivas(data.fontesAtivas);
            renderizarFooter(data);

            mostrarElemento('eia-resultado');
            mostrarBtnSalvar(true);
        } catch (error) {
            console.error('[ESCALACAO-IA] Erro ao refresh:', error);
            mostrarErro(error.message);
        } finally {
            mostrarLoading(false);
        }
    }

    // =====================================================================
    // SALVAR ESCALAÇÃO
    // =====================================================================

    async function salvar() {
        if (!dadosCompletos) {
            mostrarToast('Nenhuma escalação para salvar. Gere uma análise primeiro.', 'warning');
            return;
        }

        const btnSalvar = document.getElementById('eia-btn-salvar');
        if (btnSalvar) btnSalvar.disabled = true;

        try {
            const resp = await fetch(`${API_BASE}/salvar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosCompletos),
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            if (!data.success) throw new Error(data.message || 'Erro ao salvar');

            mostrarToast('Escalação salva com sucesso!', 'success');
            renderizarBadgeSalvo(data.salvoEm);
        } catch (error) {
            console.error('[ESCALACAO-IA] Erro ao salvar:', error);
            mostrarToast(`Erro ao salvar: ${error.message}`, 'error');
        } finally {
            if (btnSalvar) btnSalvar.disabled = false;
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

        // Lição da Rodada (Modo Professor)
        renderizarLicaoDaRodada(cenario.resumo);

        // Badge anti-confronto
        renderizarBadgeAntiConfronto(cenario);

        // Escalação (cards)
        renderizarEscalacao(cenario.escalacao, cenario.justificativas);

        // Banco de reservas
        renderizarReservas(cenario.reservas, cenario.justificativas);
    }

    function renderizarEscalacao(escalacao, justificativas) {
        const container = document.getElementById('eia-escalacao');
        if (!container) return;

        console.log('[ESCALACAO-IA] Renderizando escalação. modoProfessor:', isModoProfessorAtivo(), '| justificativas:', Object.keys(justificativas || {}).length);

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

            // Badge de disponibilidade real
            const disponibilidadeBadge = renderizarBadgeDisponibilidade(jogador);

            return `
                <div class="eia-jogador-card ${isCapitao ? 'eia-jogador-card--capitao' : ''}">
                    <div class="eia-jogador-top">
                        <img class="eia-jogador-foto"
                             src="${jogador.foto || '/img/avatar-default.png'}"
                             alt="${jogador.nome}"
                             onerror="this.src='/img/avatar-default.png'">
                        <div class="eia-jogador-info">
                            <div class="eia-jogador-nome">${jogador.nome}${disponibilidadeBadge}</div>
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
                    ${justificativa ? `<div class="eia-jogador-justificativa">${isModoProfessorAtivo() ? '<div class="eia-professor-badge"><span class="material-icons">school</span>Dica do Professor</div>' : ''}${formatarJustificativa(justificativa)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    // =====================================================================
    // BANCO DE RESERVAS
    // =====================================================================

    function renderizarReservas(reservas, justificativas) {
        const container = document.getElementById('eia-reservas');
        if (!container) return;

        if (!reservas || (!reservas.reservaLuxo && (!reservas.reservasBanca || reservas.reservasBanca.length === 0))) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        // Reserva de Luxo
        const luxoContainer = document.getElementById('eia-reserva-luxo-container');
        if (luxoContainer) {
            if (reservas.reservaLuxo) {
                luxoContainer.innerHTML = renderizarCardReservaLuxo(reservas.reservaLuxo, justificativas);
            } else {
                luxoContainer.innerHTML = '';
            }
        }

        // Banco
        const bancaGrid = document.getElementById('eia-banca-grid');
        if (bancaGrid) {
            if (reservas.reservasBanca && reservas.reservasBanca.length > 0) {
                bancaGrid.innerHTML = reservas.reservasBanca.map(j =>
                    renderizarCardReservaBanca(j, justificativas)
                ).join('');
            } else {
                bancaGrid.innerHTML = `<p class="eia-reservas-empty">Sem reservas adicionais dentro do orçamento disponível.</p>`;
            }
        }
    }

    function renderizarCardReservaLuxo(jogador, justificativas) {
        const justificativa = justificativas?.[jogador.atletaId] || '';
        const confianca = jogador.confianca || 0;
        const adversarioInfo = jogador.fontes?.confrontos?.adversarioNome
            ? `vs ${jogador.fontes.confrontos.adversarioNome}${jogador.fontes?.confrontos?.mandante ? ' (casa)' : ' (fora)'}`
            : '';
        const disponibilidadeBadge = renderizarBadgeDisponibilidade(jogador);

        return `
            <div class="eia-reserva-luxo-card">
                <div class="eia-reserva-luxo-header">
                    <span class="material-icons eia-reserva-luxo-icon">workspace_premium</span>
                    <span class="eia-reserva-luxo-titulo">Reserva de Luxo</span>
                    <span class="eia-reserva-luxo-badge">MELHOR FORA DO 11</span>
                </div>
                <div class="eia-jogador-top">
                    <img class="eia-jogador-foto eia-jogador-foto--lg"
                         src="${jogador.foto || '/img/avatar-default.png'}"
                         alt="${jogador.nome}"
                         onerror="this.src='/img/avatar-default.png'">
                    <div class="eia-jogador-info">
                        <div class="eia-jogador-nome">${jogador.nome}${disponibilidadeBadge}</div>
                        <div class="eia-jogador-meta">
                            <span>${jogador.clubeAbrev || ''}</span>
                            ${adversarioInfo ? `<span>${adversarioInfo}</span>` : ''}
                        </div>
                    </div>
                    <span class="eia-jogador-posicao eia-jogador-posicao--luxo">${jogador.posicaoAbrev || ''}</span>
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
                        <span class="eia-jogador-score-value eia-jogador-score-value--luxo">${jogador.scoreFinal.toFixed(1)}</span>
                    </div>
                    <div class="eia-jogador-score">
                        <span class="eia-jogador-score-label">Confiança</span>
                        <span class="eia-jogador-score-value">${confianca}%</span>
                    </div>
                </div>
                <div class="eia-jogador-confianca">
                    <div class="eia-jogador-confianca-bar eia-jogador-confianca-bar--luxo"
                         style="width: ${confianca}%;"></div>
                </div>
                ${justificativa ? `<div class="eia-jogador-justificativa">${isModoProfessorAtivo() ? '<div class="eia-professor-badge"><span class="material-icons">school</span>Dica do Professor</div>' : ''}${formatarJustificativa(justificativa)}</div>` : ''}
            </div>
        `;
    }

    function renderizarCardReservaBanca(jogador, justificativas) {
        const justificativa = justificativas?.[jogador.atletaId] || '';
        const confianca = jogador.confianca || 0;
        const corConfianca = confianca >= 70 ? 'var(--color-success)' :
            confianca >= 40 ? 'var(--color-warning, #f59e0b)' : 'var(--color-danger)';
        const disponibilidadeBadge = renderizarBadgeDisponibilidade(jogador);

        return `
            <div class="eia-jogador-card eia-jogador-card--reserva">
                <div class="eia-reserva-tag">RESERVA</div>
                <div class="eia-jogador-top">
                    <img class="eia-jogador-foto"
                         src="${jogador.foto || '/img/avatar-default.png'}"
                         alt="${jogador.nome}"
                         onerror="this.src='/img/avatar-default.png'">
                    <div class="eia-jogador-info">
                        <div class="eia-jogador-nome">${jogador.nome}${disponibilidadeBadge}</div>
                        <div class="eia-jogador-meta">
                            <span>${jogador.clubeAbrev || ''}</span>
                        </div>
                    </div>
                    <span class="eia-jogador-posicao">${jogador.posicaoAbrev || ''}</span>
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
                </div>
                <div class="eia-jogador-confianca">
                    <div class="eia-jogador-confianca-bar"
                         style="width: ${confianca}%; background: ${corConfianca};"></div>
                </div>
                ${justificativa ? `<div class="eia-jogador-justificativa">${isModoProfessorAtivo() ? '<div class="eia-professor-badge"><span class="material-icons">school</span>Dica do Professor</div>' : ''}${formatarJustificativa(justificativa)}</div>` : ''}
            </div>
        `;
    }

    // =====================================================================
    // BADGE DE DISPONIBILIDADE REAL
    // =====================================================================

    function renderizarBadgeDisponibilidade(jogador) {
        const disponibilidade = jogador.disponibilidadeReal;
        if (!disponibilidade || !disponibilidade.status) return '';

        const configs = {
            confirmado: {
                icon: 'check_circle',
                label: 'Confirmado',
                cls: 'eia-disp-badge--confirmado',
            },
            duvida: {
                icon: 'help',
                label: 'Dúvida',
                cls: 'eia-disp-badge--duvida',
            },
            descartado: {
                icon: 'cancel',
                label: 'Fora',
                cls: 'eia-disp-badge--descartado',
            },
            poupado: {
                icon: 'airline_seat_recline_normal',
                label: 'Poupado',
                cls: 'eia-disp-badge--poupado',
            },
        };

        const config = configs[disponibilidade.status];
        if (!config) return '';

        const tooltip = disponibilidade.motivo || config.label;
        return ` <span class="eia-disp-badge ${config.cls}" title="${tooltip}">
            <span class="material-icons">${config.icon}</span>${config.label}
        </span>`;
    }

    function renderizarLicaoDaRodada(resumo) {
        // Remover bloco anterior
        const anterior = document.getElementById('eia-licao-rodada');
        if (anterior) anterior.remove();

        if (!isModoProfessorAtivo()) return;

        const licao = extrairLicaoDaRodada(resumo);
        if (!licao) return;

        const container = document.getElementById('eia-resumo');
        if (!container) return;

        const bloco = document.createElement('div');
        bloco.id = 'eia-licao-rodada';
        bloco.className = 'eia-licao-rodada';
        bloco.innerHTML = `
            <div class="eia-licao-header">
                <span class="material-icons">school</span>
                <span>Lição da Rodada</span>
            </div>
            <p class="eia-licao-texto">${formatarJustificativa(licao)}</p>
        `;
        container.appendChild(bloco);
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
        const fontePatrimonio = data.patrimonioFonte === 'conta-admin' ? ' (conta real)' : '';
        const patrimonioInfo = data.patrimonio ? ` | C$ ${data.patrimonio.toFixed(2)}${fontePatrimonio}` : '';
        footer.textContent = `Rodada ${data.rodada || '?'} | ${data.totalAtletasAnalisados || 0} atletas analisados | `
            + `${data.fontesAtivas?.length || 0} fontes ativas | Tempo: ${tempo}${patrimonioInfo} | ${data.geradoEm ? new Date(data.geradoEm).toLocaleString('pt-BR') : ''}`;
    }

    function renderizarBadgeSalvo(salvoEm) {
        // Remover badge anterior
        const anterior = document.getElementById('eia-badge-salvo');
        if (anterior) anterior.remove();

        if (!salvoEm) return;

        const footer = document.getElementById('eia-footer-info');
        if (!footer) return;

        const dataFormatada = new Date(salvoEm).toLocaleString('pt-BR');
        const badge = document.createElement('div');
        badge.id = 'eia-badge-salvo';
        badge.className = 'eia-badge-salvo';
        badge.innerHTML = `<span class="material-icons">cloud_done</span> Salvo em ${dataFormatada}`;
        footer.parentElement.insertBefore(badge, footer);
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
    // TOAST NOTIFICATION
    // =====================================================================

    function mostrarToast(mensagem, tipo = 'info') {
        // Remover toast anterior
        const anterior = document.querySelector('.eia-toast');
        if (anterior) anterior.remove();

        const cores = {
            success: 'var(--color-success)',
            error: 'var(--color-danger)',
            warning: 'var(--color-warning)',
            info: 'var(--color-info)',
        };

        const icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info',
        };

        const toast = document.createElement('div');
        toast.className = 'eia-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: var(--z-toast, 700);
            background: var(--surface-card-elevated, #2a2a2a);
            border: 1px solid ${cores[tipo] || cores.info};
            border-radius: 10px; padding: 12px 20px;
            display: flex; align-items: center; gap: 8px;
            font-family: 'Inter', sans-serif; font-size: 13px;
            color: var(--text-primary, #fff);
            box-shadow: var(--shadow-lg);
            animation: admin-fade-in-up 0.3s ease-out;
        `;
        toast.innerHTML = `<span class="material-icons" style="color: ${cores[tipo]}; font-size: 20px;">${icons[tipo]}</span>${mensagem}`;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
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

        const btnRefresh = document.getElementById('eia-btn-refresh');
        if (btnRefresh) btnRefresh.disabled = show;

        const btnSalvar = document.getElementById('eia-btn-salvar');
        if (btnSalvar) btnSalvar.disabled = show;
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

    function mostrarBtnSalvar(show) {
        const btn = document.getElementById('eia-btn-salvar');
        if (btn) btn.style.display = show ? 'flex' : 'none';
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
        salvar,
    };

    window.inicializarEscalacaoIA = inicializar;
})();
