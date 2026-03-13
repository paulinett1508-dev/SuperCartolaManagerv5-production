// =====================================================================
// BRASILEIRAO TABELA - v2.2
// Faixa "Tabela do Brasileirão" para a home do participante
// Estilo Landing Page, colapsável, com tabela completa
// v2.2: Integração matchday + placares ao vivo via /ao-vivo endpoint
// =====================================================================

// RODADA_FINAL_CAMPEONATO disponível via participante-cache-manager.js (global)

const BrasileiraoTabela = {
    _containerId: null,
    _temporada: null,
    _dados: null,
    _dadosCompletos: null,
    _expanded: false,
    _autoRefreshTimer: null,
    _modalAberto: false,
    _matchdayAtivo: false,
    _temJogosHoje: false,

    /**
     * Renderiza a faixa na home
     */
    async renderizar({ containerId, temporada }) {
        const container = document.getElementById(containerId);
        if (!container) return;

        this._containerId = containerId;
        this._temporada = temporada || new Date().getFullYear();

        container.innerHTML = this._renderLoading();

        try {
            // Consultar matchday status para decidir modo de polling
            await this._verificarMatchdayStatus();

            // Se matchday ativo ou tem jogos ao vivo, buscar dados frescos via /ao-vivo
            const endpoint = this._matchdayAtivo || this._temJogosHoje
                ? `/api/brasileirao/ao-vivo/${this._temporada}`
                : `/api/brasileirao/resumo/${this._temporada}`;

            const response = await fetch(endpoint);
            const data = await response.json();

            if (!data.success) {
                container.innerHTML = this._renderSemDados();
                return;
            }

            this._dados = data;
            container.innerHTML = this._renderFaixa(data);
            this._bindEventos();

            // Ativar auto-refresh se há jogos ao vivo OU matchday ativo
            if (data.tem_jogos_ao_vivo || this._matchdayAtivo) {
                this._iniciarAutoRefresh();
            }

        } catch (error) {
            console.error('[BRASILEIRAO-TABELA] Erro:', error);
            container.innerHTML = this._renderErro();
        }
    },

    /**
     * Verifica status do matchday para polling inteligente
     */
    async _verificarMatchdayStatus() {
        try {
            const response = await fetch('/api/matchday/status');
            const data = await response.json();

            if (data.success) {
                this._matchdayAtivo = data.matchday_ativo || false;
                this._temJogosHoje = data.calendario?.tem_jogos_ao_vivo || false;
            }
        } catch (err) {
            console.warn('[BRASILEIRAO-TABELA] Matchday status indisponível:', err.message);
        }
    },

    _renderLoading() {
        return `
            <section class="brasileirao-section mx-4 mb-2">
                <div class="brasileirao-loading">
                    <div class="brasileirao-spinner"></div>
                    <span>Carregando Brasileirão...</span>
                </div>
            </section>
        `;
    },

    _renderFaixa(data) {
        const {
            rodada_atual,
            tem_jogos_ao_vivo,
            jogos_rodada_atual,
            proximas_rodadas,
            stats,
            ultima_atualizacao
        } = data;

        const totalJogos = stats?.total_jogos || 380;
        const realizados = stats?.jogos_realizados || 0;
        const aoVivo = jogos_rodada_atual?.filter(j => j.status === 'ao_vivo').length || 0;

        return `
            <section id="brasileirao-section" class="brasileirao-section mx-4 mb-2">
                <button class="brasileirao-header" id="brasileirao-header">
                    <div class="brasileirao-header-left">
                        <div class="brasileirao-icon">
                            <span class="material-icons">sports_soccer</span>
                        </div>
                        <div class="brasileirao-header-info">
                            <h2 class="brasileirao-header-title">Tabela do Brasileirão</h2>
                            <span class="brasileirao-header-sub">
                                Rodada ${rodada_atual} • ${realizados}/${totalJogos} jogos
                            </span>
                        </div>
                    </div>
                    <div class="brasileirao-header-right">
                        ${tem_jogos_ao_vivo ? `
                            <span class="brasileirao-live-badge">
                                <span class="brasileirao-live-dot"></span>
                                ${aoVivo} AO VIVO
                            </span>
                        ` : ''}
                        <span class="material-icons brasileirao-chevron">expand_more</span>
                    </div>
                </button>

                <div class="brasileirao-content collapsed" id="brasileirao-content">
                    <!-- Rodada Atual em Destaque -->
                    <div class="brasileirao-rodada-atual">
                        <div class="brasileirao-rodada-header-inner">
                            <span class="brasileirao-rodada-badge">
                                <span class="material-icons" style="font-size:12px;">${tem_jogos_ao_vivo ? 'play_circle' : 'schedule'}</span>
                                RODADA ${rodada_atual}${tem_jogos_ao_vivo ? ' AO VIVO' : ''}
                            </span>
                            ${tem_jogos_ao_vivo ? `
                                <span class="brasileirao-ao-vivo-pill">
                                    <span class="brasileirao-live-dot-sm"></span>
                                    ${aoVivo} ao vivo
                                </span>
                            ` : ''}
                        </div>

                        <div class="brasileirao-jogos-lista">
                            ${this._renderJogosRodada(jogos_rodada_atual || [])}
                        </div>
                    </div>

                    <!-- Próximas Rodadas -->
                    ${proximas_rodadas && proximas_rodadas.length > 0 ? `
                        <div class="brasileirao-proximas">
                            <div class="brasileirao-proximas-header">
                                <span class="material-icons" style="font-size:14px;">event</span>
                                PRÓXIMAS RODADAS
                            </div>
                            <div class="brasileirao-proximas-lista">
                                ${proximas_rodadas.map(r => `
                                    <div class="brasileirao-proxima-item" data-rodada="${r.numero}">
                                        <span class="brasileirao-proxima-num">Rodada ${r.numero}</span>
                                        <span class="brasileirao-proxima-datas">${this._formatarPeriodo(r.data_inicio, r.data_fim)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- CTA Ver Tabela Completa -->
                    <div class="brasileirao-cta">
                        <button class="brasileirao-cta-btn" id="btn-ver-completa">
                            <span class="material-icons">table_chart</span>
                            Ver Tabela Completa
                        </button>
                    </div>

                    <div class="brasileirao-footer">
                        Atualizado ${this._formatarTempoRelativo(ultima_atualizacao)}
                    </div>
                </div>
            </section>
        `;
    },

    _renderJogosRodada(jogos) {
        if (!jogos || jogos.length === 0) {
            return `<div class="brasileirao-sem-jogos">Jogos não divulgados ainda</div>`;
        }

        // Ordenar: ao vivo primeiro, depois agendados por data/hora, encerrados por último
        const jogosOrdenados = [...jogos].sort((a, b) => {
            const prioridadeStatus = { 'ao_vivo': 0, 'agendado': 1, 'a_definir': 2, 'encerrado': 3 };
            const prioA = prioridadeStatus[a.status] ?? 9;
            const prioB = prioridadeStatus[b.status] ?? 9;
            if (prioA !== prioB) return prioA - prioB;
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return a.horario.localeCompare(b.horario);
        });

        return jogosOrdenados.map(jogo => this._renderJogo(jogo)).join('');
    },

    _renderJogo(jogo) {
        const isAoVivo = jogo.status === 'ao_vivo';
        const isEncerrado = jogo.status === 'encerrado';
        const isAdiado = jogo.status === 'adiado';
        const temPlacar = isAoVivo || isEncerrado;

        const statusClass = isAoVivo ? 'brasileirao-jogo-live' :
                           isEncerrado ? 'brasileirao-jogo-encerrado' :
                           isAdiado ? 'brasileirao-jogo-adiado' : '';

        const dataFormatada = this._formatarDataCurta(jogo.data);

        // Info line content based on status
        let infoContent;
        if (isAoVivo) {
            infoContent = `<span class="brasileirao-live-dot-xs"></span><span class="brasileirao-jogo-live-label">AO VIVO</span>`;
        } else if (isEncerrado) {
            infoContent = `<span class="brasileirao-jogo-fim">FIM</span><span class="brasileirao-jogo-data">${dataFormatada}</span>`;
        } else if (isAdiado) {
            infoContent = `<span class="brasileirao-adiado">ADIADO</span><span class="brasileirao-jogo-data">${dataFormatada}</span>`;
        } else {
            infoContent = `<span class="brasileirao-jogo-data">${dataFormatada}</span><span class="brasileirao-horario">${jogo.horario || 'A definir'}</span>`;
        }

        return `
            <div class="brasileirao-jogo ${statusClass}">
                <div class="brasileirao-jogo-linha">
                    ${this._renderEscudo(jogo.mandante_id)}
                    <span class="brasileirao-jogo-nome">${this._abreviarTime(jogo.mandante)}</span>
                    ${temPlacar ? `<span class="brasileirao-jogo-gol">${jogo.placar_mandante ?? 0}</span>` : ''}
                </div>
                <div class="brasileirao-jogo-linha">
                    ${this._renderEscudo(jogo.visitante_id)}
                    <span class="brasileirao-jogo-nome">${this._abreviarTime(jogo.visitante)}</span>
                    ${temPlacar ? `<span class="brasileirao-jogo-gol">${jogo.placar_visitante ?? 0}</span>` : ''}
                </div>
                <div class="brasileirao-jogo-info">
                    ${infoContent}
                </div>
            </div>
        `;
    },

    _renderEscudo(clubeId) {
        if (!clubeId) return '';
        return `<img src="/escudos/${clubeId}.png" alt="" class="brasileirao-escudo" onerror="this.style.display='none'">`;
    },

    _abreviarTime(nome) {
        if (!nome) return '???';
        const abreviacoes = {
            'Atlético Mineiro': 'Atlético-MG',
            'Atlético-MG': 'Atlético-MG',
            'Athletico Paranaense': 'Athletico-PR',
            'Athletico-PR': 'Athletico-PR',
            'Red Bull Bragantino': 'Bragantino',
            'Vasco da Gama': 'Vasco',
            'Internacional': 'Inter',
        };
        return abreviacoes[nome] || nome;
    },

    _formatarPeriodo(dataInicio, dataFim) {
        const inicio = this._formatarDataCurta(dataInicio);
        const fim = this._formatarDataCurta(dataFim);
        return inicio === fim ? inicio : `${inicio} - ${fim}`;
    },

    _formatarDataCurta(dataStr) {
        if (!dataStr) return '';
        const [ano, mes, dia] = dataStr.split('-');
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return `${parseInt(dia, 10)} ${meses[parseInt(mes, 10) - 1]}`;
    },

    _formatarTempoRelativo(isoString) {
        if (!isoString) return 'recentemente';
        const data = new Date(isoString);
        const agora = new Date();
        const diffMs = agora - data;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHoras = Math.floor(diffMin / 60);
        const diffDias = Math.floor(diffHoras / 24);

        if (diffMin < 5) return 'agora';
        if (diffMin < 60) return `há ${diffMin} min`;
        if (diffHoras < 24) return `há ${diffHoras}h`;
        return `há ${diffDias} dia${diffDias > 1 ? 's' : ''}`;
    },

    _renderSemDados() {
        return `
            <section class="brasileirao-section mx-4 mb-2">
                <div class="brasileirao-header brasileirao-header-disabled">
                    <div class="brasileirao-header-left">
                        <div class="brasileirao-icon" style="opacity:0.5;">
                            <span class="material-icons">sports_soccer</span>
                        </div>
                        <div class="brasileirao-header-info">
                            <h2 class="brasileirao-header-title">Tabela do Brasileirão</h2>
                            <span class="brasileirao-header-sub">Calendário será divulgado em breve</span>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    _renderErro() {
        return `
            <section class="brasileirao-section mx-4 mb-2">
                <div class="brasileirao-header brasileirao-header-disabled">
                    <div class="brasileirao-header-left">
                        <div class="brasileirao-icon" style="background:rgba(239,68,68,0.12);">
                            <span class="material-icons" style="color:var(--app-danger);">error</span>
                        </div>
                        <div class="brasileirao-header-info">
                            <h2 class="brasileirao-header-title">Tabela do Brasileirão</h2>
                            <span class="brasileirao-header-sub">Erro ao carregar dados</span>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    _bindEventos() {
        const header = document.getElementById('brasileirao-header');
        const content = document.getElementById('brasileirao-content');
        const section = document.getElementById('brasileirao-section');

        if (header && content && section) {
            header.addEventListener('click', () => {
                this._expanded = !this._expanded;
                content.classList.toggle('collapsed', !this._expanded);
                section.classList.toggle('expanded', this._expanded);
            });
        }

        const btnCompleta = document.getElementById('btn-ver-completa');
        if (btnCompleta) {
            btnCompleta.addEventListener('click', () => {
                this._abrirTabelaCompleta();
            });
        }
    },

    /**
     * Cache helpers para sessionStorage
     */
    _getCacheCompleto() {
        try {
            const raw = sessionStorage.getItem(`brasileirao_completo_${this._temporada}`);
            if (!raw) return null;
            const cached = JSON.parse(raw);
            // TTL de 5 minutos
            if (Date.now() - cached._ts > 5 * 60 * 1000) {
                sessionStorage.removeItem(`brasileirao_completo_${this._temporada}`);
                return null;
            }
            return cached.data;
        } catch { return null; }
    },

    _setCacheCompleto(data) {
        try {
            sessionStorage.setItem(`brasileirao_completo_${this._temporada}`, JSON.stringify({ data, _ts: Date.now() }));
        } catch { /* storage full — ok, sem cache */ }
    },

    /**
     * Abre LP com tabela completa de todas as rodadas
     */
    async _abrirTabelaCompleta() {
        if (this._modalAberto) return;
        this._modalAberto = true;

        // Criar overlay
        const overlay = document.createElement('div');
        overlay.className = 'brasileirao-lp-overlay';
        overlay.innerHTML = `
            <div class="brasileirao-lp-container">
                <div class="brasileirao-lp-header">
                    <button class="brasileirao-lp-back" id="brasileirao-lp-back">
                        <span class="material-icons">arrow_back</span>
                    </button>
                    <div class="brasileirao-lp-title">
                        <span class="material-icons">emoji_events</span>
                        Brasileirão ${this._temporada}
                    </div>
                    <button class="brasileirao-lp-refresh" id="brasileirao-lp-refresh" title="Atualizar dados">
                        <span class="material-icons">refresh</span>
                    </button>
                </div>
                <div class="brasileirao-lp-content" id="brasileirao-lp-content">
                    <div class="brasileirao-lp-loading">
                        <div class="brasileirao-spinner"></div>
                        <span>Carregando rodadas...</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        // Bind close
        overlay.querySelector('#brasileirao-lp-back').addEventListener('click', () => {
            this._fecharTabelaCompleta(overlay);
        });

        // Bind refresh
        overlay.querySelector('#brasileirao-lp-refresh').addEventListener('click', () => {
            this._refreshTabelaCompleta(overlay);
        });

        // Tentar cache primeiro
        const cached = this._getCacheCompleto();
        if (cached) {
            console.log('[BRASILEIRAO-TABELA] Usando cache sessionStorage');
            this._dadosCompletos = cached;
            this._renderTabelaCompletaConteudo(overlay, cached);
            return;
        }

        // Buscar dados completos
        await this._fetchTabelaCompleta(overlay);
    },

    async _fetchTabelaCompleta(overlay) {
        const contentEl = overlay.querySelector('#brasileirao-lp-content');
        try {
            const response = await fetch(`/api/brasileirao/completo/${this._temporada}`);
            const data = await response.json();

            if (data.success) {
                this._dadosCompletos = data;
                this._setCacheCompleto(data);
                this._renderTabelaCompletaConteudo(overlay, data);
            } else {
                contentEl.innerHTML = `
                    <div class="brasileirao-lp-erro">
                        <span class="material-icons">error_outline</span>
                        <p>Não foi possível carregar os dados</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error('[BRASILEIRAO-TABELA] Erro ao carregar completo:', err);
            contentEl.innerHTML = `
                <div class="brasileirao-lp-erro">
                    <span class="material-icons">wifi_off</span>
                    <p>Erro de conexão</p>
                </div>
            `;
        }
    },

    async _refreshTabelaCompleta(overlay) {
        const btn = overlay.querySelector('#brasileirao-lp-refresh');
        if (btn.classList.contains('brasileirao-lp-refresh-spinning')) return; // debounce

        btn.classList.add('brasileirao-lp-refresh-spinning');

        // Invalidar cache
        sessionStorage.removeItem(`brasileirao_completo_${this._temporada}`);

        // Loading no conteúdo
        const contentEl = overlay.querySelector('#brasileirao-lp-content');
        contentEl.innerHTML = `
            <div class="brasileirao-lp-loading">
                <div class="brasileirao-spinner"></div>
                <span>Atualizando...</span>
            </div>
        `;

        await this._fetchTabelaCompleta(overlay);

        setTimeout(() => btn.classList.remove('brasileirao-lp-refresh-spinning'), 600);
    },

    _fecharTabelaCompleta(overlay) {
        overlay.classList.add('brasileirao-lp-closing');
        document.body.style.overflow = '';
        setTimeout(() => {
            overlay.remove();
            this._modalAberto = false;
        }, 300);
    },

    _renderTabelaCompletaConteudo(overlay, data) {
        const rodadas = data.rodadas || {};
        const rodadaAtual = data.stats?.rodada_atual || 1;
        const contentEl = overlay.querySelector('#brasileirao-lp-content');

        // Stats header
        const statsHtml = `
            <div class="brasileirao-lp-stats">
                <div class="brasileirao-lp-stat">
                    <span class="brasileirao-lp-stat-valor">${data.stats?.jogos_realizados || 0}</span>
                    <span class="brasileirao-lp-stat-label">Jogos</span>
                </div>
                <div class="brasileirao-lp-stat brasileirao-lp-stat-destaque">
                    <span class="brasileirao-lp-stat-valor">${rodadaAtual}</span>
                    <span class="brasileirao-lp-stat-label">Rodada Atual</span>
                </div>
                <div class="brasileirao-lp-stat">
                    <span class="brasileirao-lp-stat-valor">${data.stats?.jogos_restantes || 0}</span>
                    <span class="brasileirao-lp-stat-label">Restantes</span>
                </div>
            </div>
        `;

        // Rodadas como acordeões (rodada atual expandida)
        let rodadasHtml = '<div class="brasileirao-lp-rodadas">';

        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        for (let r = 1; r <= RODADA_FINAL_CAMPEONATO; r++) {
            const rodada = rodadas[r];
            if (!rodada) continue;

            // Status baseado em datas + estado real dos jogos
            const temAoVivo = rodada.jogos_ao_vivo > 0;
            const todosEncerrados = rodada.jogos_encerrados === rodada.total_jogos && rodada.total_jogos > 0;
            const rodadaPassou = rodada.data_fim && rodada.data_fim < hoje;
            const isEncerrada = todosEncerrados || (rodadaPassou && !temAoVivo);
            const isAtual = temAoVivo || (r === rodadaAtual && !isEncerrada);
            const isFutura = !isEncerrada && !isAtual;

            let statusClass, statusBadge;
            if (temAoVivo) {
                statusClass = 'brasileirao-lp-rodada-atual';
                statusBadge = '<span class="brasileirao-lp-badge-atual"><span class="brasileirao-live-dot-xs" style="width:6px;height:6px;display:inline-block;vertical-align:middle;margin-right:4px"></span>AO VIVO</span>';
            } else if (isEncerrada) {
                statusClass = 'brasileirao-lp-rodada-passada';
                const jogosFaltando = rodada.total_jogos - rodada.jogos_encerrados;
                statusBadge = '<span class="brasileirao-lp-badge-encerrada">ENCERRADA</span>';
                if (jogosFaltando > 0) {
                    statusBadge += `<span class="brasileirao-lp-badge-concluida">${rodada.jogos_encerrados}/${rodada.total_jogos}</span>`;
                }
            } else if (isAtual) {
                statusClass = 'brasileirao-lp-rodada-atual';
                statusBadge = '<span class="brasileirao-lp-badge-atual">EM ANDAMENTO</span>';
            } else {
                statusClass = 'brasileirao-lp-rodada-futura';
                statusBadge = '';
            }

            const expandido = isAtual ? 'expanded' : '';

            rodadasHtml += `
                <div class="brasileirao-lp-rodada ${statusClass} ${expandido}" data-rodada="${r}">
                    <div class="brasileirao-lp-rodada-header">
                        <div class="brasileirao-lp-rodada-info">
                            <span class="brasileirao-lp-rodada-num">Rodada ${r}</span>
                            <span class="brasileirao-lp-rodada-datas">${this._formatarPeriodo(rodada.data_inicio, rodada.data_fim)}</span>
                        </div>
                        ${statusBadge}
                        <span class="material-icons brasileirao-lp-rodada-chevron">expand_more</span>
                    </div>
                    <div class="brasileirao-lp-rodada-jogos ${isAtual ? '' : 'collapsed'}">
                        ${this._renderJogosRodadaLP(rodada.partidas || [])}
                    </div>
                </div>
            `;
        }

        rodadasHtml += '</div>';

        contentEl.innerHTML = statsHtml + rodadasHtml;

        // Bind acordeões
        contentEl.querySelectorAll('.brasileirao-lp-rodada-header').forEach(header => {
            header.addEventListener('click', () => {
                const rodada = header.closest('.brasileirao-lp-rodada');
                const jogos = rodada.querySelector('.brasileirao-lp-rodada-jogos');
                const isExpanded = rodada.classList.contains('expanded');

                rodada.classList.toggle('expanded', !isExpanded);
                jogos.classList.toggle('collapsed', isExpanded);
            });
        });

        // Scroll para rodada atual
        setTimeout(() => {
            const rodadaAtualEl = contentEl.querySelector('.brasileirao-lp-rodada-atual');
            if (rodadaAtualEl) {
                rodadaAtualEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    },

    _renderJogosRodadaLP(jogos) {
        if (!jogos || jogos.length === 0) {
            return '<div class="brasileirao-lp-sem-jogos">Jogos a definir</div>';
        }

        // Ordenar por data e horário
        const jogosOrdenados = [...jogos].sort((a, b) => {
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return (a.horario || '').localeCompare(b.horario || '');
        });

        return jogosOrdenados.map(jogo => {
            const isAoVivo = jogo.status === 'ao_vivo';
            const isEncerrado = jogo.status === 'encerrado';
            const isAdiado = jogo.status === 'adiado';
            const temPlacar = isAoVivo || isEncerrado;

            const statusClass = isAoVivo ? 'brasileirao-lp-jogo-live' :
                               isEncerrado ? 'brasileirao-lp-jogo-encerrado' :
                               isAdiado ? 'brasileirao-lp-jogo-adiado' : '';

            const dataFormatada = this._formatarDataCurta(jogo.data);

            // Info line content based on status
            let infoContent;
            if (isAoVivo) {
                infoContent = `<span class="brasileirao-lp-live-dot"></span><span class="brasileirao-jogo-live-label">AO VIVO</span>`;
            } else if (isEncerrado) {
                infoContent = `<span class="brasileirao-lp-fim">${dataFormatada}</span>`;
            } else if (isAdiado) {
                infoContent = `<span class="brasileirao-lp-adiado">ADIADO</span><span class="brasileirao-lp-data">${dataFormatada}</span>`;
            } else {
                infoContent = `<span class="brasileirao-lp-data">${dataFormatada}</span><span class="brasileirao-lp-horario">${jogo.horario || 'A definir'}</span>`;
            }

            return `
                <div class="brasileirao-lp-jogo ${statusClass}">
                    <div class="brasileirao-lp-jogo-linha">
                        ${this._renderEscudo(jogo.mandante_id)}
                        <span class="brasileirao-lp-jogo-nome">${this._abreviarTime(jogo.mandante)}</span>
                        ${temPlacar ? `<span class="brasileirao-lp-jogo-gol">${jogo.placar_mandante ?? 0}</span>` : ''}
                    </div>
                    <div class="brasileirao-lp-jogo-linha">
                        ${this._renderEscudo(jogo.visitante_id)}
                        <span class="brasileirao-lp-jogo-nome">${this._abreviarTime(jogo.visitante)}</span>
                        ${temPlacar ? `<span class="brasileirao-lp-jogo-gol">${jogo.placar_visitante ?? 0}</span>` : ''}
                    </div>
                    <div class="brasileirao-lp-jogo-info">
                        ${infoContent}
                    </div>
                </div>
            `;
        }).join('');
    },

    _iniciarAutoRefresh() {
        this._pararAutoRefresh();
        const intervalo = this._matchdayAtivo ? 60000 : 300000; // 60s ao vivo, 5min idle
        console.log(`[BRASILEIRAO-TABELA] Auto-refresh iniciado (${intervalo / 1000}s)`);

        this._autoRefreshTimer = setInterval(async () => {
            try {
                // Sempre usar /ao-vivo durante refresh (dados frescos com placares)
                const response = await fetch(`/api/brasileirao/ao-vivo/${this._temporada}`);
                const data = await response.json();

                if (data.success) {
                    this._dados = data;
                    this._atualizarJogosInline(data);
                    this._atualizarHeaderInline(data);
                }

                // Parar se não há mais jogos ao vivo e matchday não está ativo
                if (!data.tem_jogos_ao_vivo) {
                    // Verificar matchday status antes de parar
                    await this._verificarMatchdayStatus();
                    if (!this._matchdayAtivo) {
                        console.log('[BRASILEIRAO-TABELA] Auto-refresh parado (sem jogos ao vivo)');
                        this._pararAutoRefresh();
                    }
                }
            } catch (err) {
                console.warn('[BRASILEIRAO-TABELA] Erro no auto-refresh:', err.message);
            }
        }, intervalo);
    },

    _pararAutoRefresh() {
        if (this._autoRefreshTimer) {
            clearInterval(this._autoRefreshTimer);
            this._autoRefreshTimer = null;
        }
    },

    _atualizarJogosInline(data) {
        const lista = document.querySelector('.brasileirao-jogos-lista');
        if (lista) {
            lista.innerHTML = this._renderJogosRodada(data.jogos_rodada_atual || []);
        }
    },

    _atualizarHeaderInline(data) {
        const aoVivo = data.jogos_rodada_atual?.filter(j => j.status === 'ao_vivo').length || 0;
        const headerRight = document.querySelector('.brasileirao-header-right');
        if (!headerRight) return;

        // Atualizar live badge no header
        const liveBadgeExistente = headerRight.querySelector('.brasileirao-live-badge');
        if (aoVivo > 0) {
            const badgeHtml = `<span class="brasileirao-live-badge"><span class="brasileirao-live-dot"></span>${aoVivo} AO VIVO</span>`;
            if (liveBadgeExistente) {
                liveBadgeExistente.outerHTML = badgeHtml;
            } else {
                headerRight.insertAdjacentHTML('afterbegin', badgeHtml);
            }
        } else if (liveBadgeExistente) {
            liveBadgeExistente.remove();
        }

        // Atualizar rodada badge e pill
        const rodadaBadge = document.querySelector('.brasileirao-rodada-badge');
        if (rodadaBadge) {
            const iconName = data.tem_jogos_ao_vivo ? 'play_circle' : 'schedule';
            const suffix = data.tem_jogos_ao_vivo ? ' AO VIVO' : '';
            rodadaBadge.innerHTML = `<span class="material-icons" style="font-size:12px;">${iconName}</span> RODADA ${data.rodada_atual}${suffix}`;
        }

        // Atualizar footer timestamp
        const footer = document.querySelector('.brasileirao-footer');
        if (footer) {
            footer.textContent = `Atualizado ${this._formatarTempoRelativo(data.ultima_atualizacao)}`;
        }
    },

    destroy() {
        this._pararAutoRefresh();
    }
};

window.toggleBrasileiraoHome = function() {
    const content = document.getElementById('brasileirao-content');
    const section = document.getElementById('brasileirao-section');
    if (content && section) {
        BrasileiraoTabela._expanded = !BrasileiraoTabela._expanded;
        content.classList.toggle('collapsed', !BrasileiraoTabela._expanded);
        section.classList.toggle('expanded', BrasileiraoTabela._expanded);
    }
};

window.BrasileiraoTabela = BrasileiraoTabela;
console.log('[BRASILEIRAO-TABELA] Componente v2.2 carregado');
