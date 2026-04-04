// =====================================================================
// PARTICIPANTE NAVIGATION v4.9 - Sistema de Navegação entre Módulos
// =====================================================================
// v4.9: FEAT - Widget "O que tá rolando?" para engajamento ao vivo
// v4.3: TEMPORADA 2026 ATIVA - Rodada 1+ em andamento
//       - Módulo inicial agora é "home" (não mais "boas-vindas")
//       - Bloqueio de pré-temporada desativado (só ativa se isPreparando=true)
//       - Referências de "boas-vindas" atualizadas para "home"
//       - Modal de bloqueio genérico (sem hardcode de ano)
// v4.2: FIX CRÍTICO - Sincronização auth/nav para evitar renderização perdida
//       - Aguarda auth estar 100% pronto antes de navegar
//       - Garante opacity restore em finally block
//       - Double RAF para garantir DOM renderizado
// v4.1: Cache-busting nos imports dinâmicos (evita erros por cache antigo)
// v4.0: Bloqueio de modulos em pre-temporada com modal amigavel
// v3.1: Feedback visual imediato durante navegação (opacity transition)
// v3.0: REFATORAÇÃO COMPLETA - Remove flag _navegando que travava
//       Usa apenas debounce por tempo (mais confiável)
//       Navegação NUNCA trava, sempre responde a cliques
// v2.8: Permite recarregar mesmo módulo (cache-first é instantâneo)
// v2.7: Fix transição suave com cache-first (não limpar container)
// v2.6: Fix primeira navegação - não ignorar se container está vazio
// v2.5: Loading inteligente (só primeira vez ou após 24h)
// v2.4: Integração com RefreshButton (temporada encerrada)
// v2.3: Polling fallback para auth
// v2.2: Debounce e controle de navegações duplicadas
// =====================================================================

const CAMPINHO_TARGET_KEY = 'scm_campinho_target';

// ✅ v4.9.1: Versão estável por sessão — permite cache de módulos dentro da mesma sessão,
// mas força re-download após reload de página (deploy). Evita re-download a cada navegação.
const _MODULE_SESSION_V = (() => {
    const KEY = 'scm_nav_module_v';
    let v = sessionStorage.getItem(KEY);
    if (!v) { v = Date.now().toString(); sessionStorage.setItem(KEY, v); }
    return v;
})();

if (window.Log) Log.info('PARTICIPANTE-NAV', '🚀 Carregando sistema de navegação v4.9...');

class ParticipanteNavigation {
    constructor() {
        // ✅ v4.3: Módulo inicial agora é "home" (temporada 2026 em andamento)
        this.moduloAtual = "home";
        this.participanteData = null;
        this.modulosAtivos = {};
        this._isPremium = false; // ✅ v4.10: Premium bypass para módulos em manutenção
        this.historicoNavegacao = []; // Histórico interno de navegação
        this.modulos = {
            "boas-vindas": "/participante/fronts/boas-vindas.html",
            home: "/participante/fronts/home.html",
            extrato: "/participante/fronts/extrato.html",
            ranking: "/participante/fronts/ranking.html",
            rodadas: "/participante/fronts/rodadas.html",
            historico: "/participante/fronts/historico.html",
            top10: "/participante/fronts/top10.html",
            "melhor-mes": "/participante/fronts/melhor-mes.html",
            "pontos-corridos": "/participante/fronts/pontos-corridos.html",
            "mata-mata": "/participante/fronts/mata-mata.html",
            artilheiro: "/participante/fronts/artilheiro.html",
            "luva-ouro": "/participante/fronts/luva-ouro.html",
            campinho: "/participante/fronts/campinho.html",
            dicas: "/participante/fronts/dicas.html",
            capitao: "/participante/fronts/capitao.html",
            configuracoes: "/participante/fronts/configuracoes.html",
            "copa-times-sc": "/participante/fronts/copa-times-sc.html",
            "copa-2026-mundo": "/participante/fronts/copa-2026-mundo.html",
            regras: "/participante/fronts/regras.html",
            "rodada-xray": "/participante/fronts/rodada-xray.html",
            "tiro-certo": "/participante/fronts/tiro-certo.html",
            "resta-um": "/participante/fronts/resta-um.html",
            "info-meu-time": "/participante/fronts/info-meu-time.html",
            "agenda-tabelas": "/participante/fronts/agenda-tabelas.html",
            "brasileirao": "/participante/fronts/brasileirao.html",
            "jogos-do-dia": "/participante/fronts/jogos-do-dia.html",
            "libertadores": "/participante/fronts/libertadores.html",
            "copa-brasil": "/participante/fronts/copa-brasil.html",
            "copa-nordeste": "/participante/fronts/copa-nordeste.html",
        };

        // ✅ v3.0: Controles simplificados (apenas debounce por tempo)
        this._inicializando = false;
        this._ultimaNavegacao = 0;
        this._debounceMs = 100; // ✅ v3.0: Reduzido para 100ms (super responsivo)
        this._navegacaoEmAndamento = null; // ID da navegação atual (para cancelar se necessário)
        this._carregandoModulo = null; // ✅ v5.8: Módulo em carregamento ativo (previne double-init)
        this._abortController = null; // ✅ v5.9: AbortController para cancelar fetch de navegação anterior
        this._campinhoTarget = null;
    }

    async inicializar() {
        // ✅ v2.2: Evitar inicialização duplicada
        if (this._inicializando) {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⏸️ Inicialização já em andamento, ignorando...');
            return;
        }
        this._inicializando = true;

        if (window.Log) Log.info('PARTICIPANTE-NAV', 'Inicializando navegação...');

        // Aguardar dados do participante
        await this.aguardarDadosParticipante();

        this._campinhoTarget = this._extrairCampinhoTarget();

        // ✅ v4.2: CORREÇÃO CRÍTICA - Garantir que auth realmente carregou dados
        if (!this.participanteData || !this.participanteData.ligaId) {
            if (window.Log) Log.warn('PARTICIPANTE-NAV', '⏳ Auth incompleto - aguardando evento...');
            await new Promise((resolve) => {
                const onAuthReady = (event) => {
                    if (event.detail) {
                        this.participanteData = {
                            timeId: event.detail.timeId,
                            ligaId: event.detail.ligaId,
                            nomeCartola: event.detail.participante?.participante?.nome_cartola || "Participante",
                            nomeTime: event.detail.participante?.participante?.nome_time || "Meu Time",
                        };
                        if (event.detail.ligaData) {
                            this._ligaDataFromEvent = event.detail.ligaData;
                            this._resolverPremium(event.detail.ligaData, event.detail.timeId);
                        }
                    }
                    resolve();
                };
                window.addEventListener('participante-auth-ready', onAuthReady, { once: true });
                // ✅ FIX MOBILE: 15s (era 5s) - compatível com mobile lento pós-Republish
                setTimeout(() => {
                    window.removeEventListener('participante-auth-ready', onAuthReady);
                    if (window.Log) Log.warn('PARTICIPANTE-NAV', '⚠️ Timeout aguardando auth (15s) - continuando');
                    resolve();
                }, 15000);
            });
        }

        // Buscar módulos ativos da liga
        await this.carregarModulosAtivos();

        // Renderizar menu dinâmico
        this.renderizarMenuDinamico();

        // Configurar event listeners
        this.configurarEventListeners();

        // ✅ v4.3: Recuperar módulo salvo ou usar home (temporada em andamento)
        const moduloSalvo =
            sessionStorage.getItem("participante_modulo_atual") ||
            "home";

        // ✅ v4.9: Deep linking via hash (#ranking, #extrato, etc.)
        const hashModulo = window.location.hash ? window.location.hash.replace('#', '') : null;
        const moduloViaHash = hashModulo && this.modulos[hashModulo] ? hashModulo : null;
        if (moduloViaHash && window.Log) Log.info('PARTICIPANTE-NAV', `🔗 Deep link detectado: #${moduloViaHash}`);

        // ✅ v4.4: Liga aposentada → direto para Hall da Fama
        const moduloInicial = window.isLigaAposentada ? 'historico'
            : this._campinhoTarget ? 'campinho' : moduloViaHash || moduloSalvo;

        // ✅ Sincronizar botão ativo do menu com módulo salvo
        if (moduloSalvo) {
            const navButtons = document.querySelectorAll(".nav-item-modern");
            navButtons.forEach((btn) => {
                btn.classList.remove("active");
                if (btn.dataset.module === moduloSalvo) {
                    btn.classList.add("active");
                }
            });
        }

        // ✅ v4.2: Aguardar próximo frame para garantir DOM estável antes de navegar
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Navegar para módulo (salvo ou inicial)
        await this.navegarPara(moduloInicial);

        // ✅ v4.8: Refresh modulosAtivos via endpoint correto (com defaults)
        // ⚠️ IMPORTANTE: Aguardar para que o Widget tenha os módulos corretos
        await this.refreshModulosAtivos();

        // ✅ v4.9: Inicializar Widget "O que tá rolando?" (engajamento ao vivo)
        this.inicializarWhatsHappeningWidget();

        // ✅ Inicializar Widget "Raio-X da Rodada" (análise pós-rodada)
        this.inicializarRaioXWidget();

        // ✅ Pré-carregar Widget "Campeão" (celebração de campeões)
        this.inicializarCampeaoWidget();

        // ✅ Modal Mito & Mico (celebração pós-rodada, 1x por rodada)
        this.inicializarMitoMicoModal();

        // ✅ v4.8: Atualizar módulos ao retornar do background (app resume)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.refreshModulosAtivos();
            }
        });
    }

    _extrairCampinhoTarget() {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(CAMPINHO_TARGET_KEY);
        if (!raw) return null;

        localStorage.removeItem(CAMPINHO_TARGET_KEY);

        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.timeId) return null;
            const target = { ...parsed };
            if (!target.ligaId && this.participanteData?.ligaId) {
                target.ligaId = this.participanteData.ligaId;
            }
            if (target.ligaId && this.participanteData?.ligaId && target.ligaId !== this.participanteData.ligaId) {
                return null;
            }
            return target;
        } catch (error) {
            return null;
        }
    }

    async aguardarDadosParticipante() {
        if (window.Log) Log.debug('PARTICIPANTE-NAV', 'Aguardando dados do participante...');

        // ✅ v2.0: PRIMEIRO tentar obter dados do participanteAuth (já carregado)
        if (window.participanteAuth && window.participanteAuth.participante) {
            this.participanteData = {
                timeId: window.participanteAuth.timeId,
                ligaId: window.participanteAuth.ligaId,
                nomeCartola: window.participanteAuth.participante.participante?.nome_cartola || "Participante",
                nomeTime: window.participanteAuth.participante.participante?.nome_time || "Meu Time",
            };
            if (window.participanteAuth.ligaDataCache) {
                this._resolverPremium(window.participanteAuth.ligaDataCache, window.participanteAuth.timeId);
            }
            if (window.Log) Log.info('PARTICIPANTE-NAV', '✅ Dados obtidos do Auth (sem requisição extra)');
            return;
        }

        // ✅ v2.3: Se Auth ainda não terminou, aguardar evento com polling de fallback
        return new Promise((resolve, reject) => {
            // Polling a cada 200ms para verificar se dados chegaram
            const pollInterval = setInterval(() => {
                if (window.participanteAuth && window.participanteAuth.participante) {
                    clearInterval(pollInterval);
                    clearTimeout(timeout);
                    this.participanteData = {
                        timeId: window.participanteAuth.timeId,
                        ligaId: window.participanteAuth.ligaId,
                        nomeCartola: window.participanteAuth.participante.participante?.nome_cartola || "Participante",
                        nomeTime: window.participanteAuth.participante.participante?.nome_time || "Meu Time",
                    };
                    if (window.participanteAuth.ligaDataCache) {
                        this._resolverPremium(window.participanteAuth.ligaDataCache, window.participanteAuth.timeId);
                    }
                    if (window.Log) Log.info('PARTICIPANTE-NAV', '✅ Dados obtidos via polling');
                    resolve();
                }
            }, 200);

            // ✅ FIX MOBILE: 15s (era 5s) - no mobile pós-Republish com caches limpos,
            // auth pode demorar >5s em 3G/4G. O timeout de 5s causava redirect
            // indevido para login mesmo com sessão válida.
            const timeout = setTimeout(() => {
                clearInterval(pollInterval);
                // ✅ ÚLTIMA CHANCE: Verificar se dados chegaram durante o timeout
                if (window.participanteAuth && window.participanteAuth.participante) {
                    this.participanteData = {
                        timeId: window.participanteAuth.timeId,
                        ligaId: window.participanteAuth.ligaId,
                        nomeCartola: window.participanteAuth.participante.participante?.nome_cartola || "Participante",
                        nomeTime: window.participanteAuth.participante.participante?.nome_time || "Meu Time",
                    };
                    if (window.participanteAuth.ligaDataCache) {
                        this._resolverPremium(window.participanteAuth.ligaDataCache, window.participanteAuth.timeId);
                    }
                    if (window.Log) Log.info('PARTICIPANTE-NAV', '✅ Dados obtidos no timeout final');
                    resolve();
                    return;
                }
                if (window.Log) Log.error('PARTICIPANTE-NAV', '❌ Timeout aguardando auth (15s)');
                window.location.href = "/participante-login.html";
                reject(new Error('Timeout'));
            }, 15000);

            window.addEventListener('participante-auth-ready', (event) => {
                clearInterval(pollInterval);
                clearTimeout(timeout);
                const { participante, ligaId, timeId, ligaData } = event.detail;
                this.participanteData = {
                    timeId: timeId,
                    ligaId: ligaId,
                    nomeCartola: participante.participante?.nome_cartola || "Participante",
                    nomeTime: participante.participante?.nome_time || "Meu Time",
                };
                // ✅ v2.1: Guardar dados da liga para evitar requisição extra
                if (ligaData) {
                    this._ligaDataFromEvent = ligaData;
                    this._resolverPremium(ligaData, timeId);
                }
                if (window.Log) Log.info('PARTICIPANTE-NAV', '✅ Dados obtidos via evento Auth');
                resolve();
            }, { once: true });
        });
    }

    async carregarModulosAtivos() {
        if (window.Log) Log.debug('PARTICIPANTE-NAV', '🔍 Buscando configuração de módulos...');

        try {
            // ✅ v2.1: PRIMEIRO tentar usar dados da liga do Auth (já carregados)
            if (window.participanteAuth && window.participanteAuth.ligaDataCache) {
                const liga = window.participanteAuth.ligaDataCache;
                this.modulosAtivos = liga.modulos_ativos || {};
                if (window.Log) Log.debug('PARTICIPANTE-NAV', '💾 Módulos obtidos do cache Auth (sem requisição)');
                return;
            }

            // ✅ v2.1: Se Auth já passou os dados via evento, usar ligaData
            if (this._ligaDataFromEvent) {
                this.modulosAtivos = this._ligaDataFromEvent.modulos_ativos || {};
                if (window.Log) Log.debug('PARTICIPANTE-NAV', '💾 Módulos obtidos via evento Auth');
                return;
            }

            // Fallback: buscar da API (só se cache não disponível)
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '📡 Buscando módulos da API (fallback)...');
            const response = await fetch(
                `/api/ligas/${this.participanteData.ligaId}`,
            );
            if (!response.ok) {
                throw new Error("Erro ao buscar configuração da liga");
            }

            const liga = await response.json();
            this.modulosAtivos = liga.modulos_ativos || {};

            if (window.Log) Log.debug('PARTICIPANTE-NAV', '📋 Módulos ativos recebidos (API)');
        } catch (error) {
            if (window.Log) Log.error('PARTICIPANTE-NAV', '❌ Erro ao buscar módulos:', error);
            this.modulosAtivos = {
                extrato: true,
                ranking: true,
                rodadas: true,
                top10: false,
                melhorMes: false,
                pontosCorridos: false,
                mataMata: false,
                artilheiro: false,
                luvaOuro: false,
                capitao: false,
            };
        }
    }

    /**
     * ✅ v4.8: Atualiza modulosAtivos via endpoint dedicado (com merge de defaults)
     * Resolve BUG onde app lia dados crus sem defaults e nunca atualizava após init.
     * Chamado: ao abrir menu, ao retornar do background, após inicialização.
     */
    async refreshModulosAtivos() {
        if (!this.participanteData?.ligaId) return;

        try {
            const response = await fetch(`/api/ligas/${this.participanteData.ligaId}/modulos-ativos`);
            if (!response.ok) return;

            const data = await response.json();
            this.modulosAtivos = data.modulos || {};

            // Notificar Quick Access Bar
            if (window.quickAccessBar) {
                window.quickAccessBar.atualizarModulosAtivos(this.modulosAtivos);
            }

            if (window.Log) Log.debug('PARTICIPANTE-NAV', '🔄 Módulos ativos atualizados via API');
        } catch (error) {
            if (window.Log) Log.warn('PARTICIPANTE-NAV', '⚠️ Erro ao atualizar módulos:', error);
        }
    }

    /**
     * ✅ v5.0: FAB "Big Cartola IA" - Coming soon
     * Mostra FAB com ícone de IA e toast "Em breve"
     */
    async inicializarWhatsHappeningWidget() {
        // Só inicializar se não for liga aposentada
        if (window.isLigaAposentada) {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⏭️ FAB IA ignorado (liga aposentada)');
            return;
        }

        try {
            const module = await import('/participante/js/widgets/whats-happening-widget.js?v=' + Date.now());

            if (module.initWhatsHappeningWidget) {
                await module.initWhatsHappeningWidget();
                if (window.Log) Log.info('PARTICIPANTE-NAV', 'FAB "Big Cartola IA" inicializado');
            }
        } catch (error) {
            if (window.Log) Log.warn('PARTICIPANTE-NAV', '⚠️ Erro ao inicializar FAB IA:', error);
        }
    }

    /**
     * ✅ Widget "Raio-X da Rodada" - Análise pós-rodada
     * Mostra análise de disputas quando rodada encerra
     */
    async inicializarRaioXWidget() {
        // Só inicializar se não for liga aposentada
        if (window.isLigaAposentada) {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⏭️ Widget Raio-X ignorado (liga aposentada)');
            return;
        }

        // Verificar se módulo está ativo na liga
        if (!this.verificarModuloAtivo('raioX')) {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⏭️ Widget Raio-X ignorado (módulo desativado)');
            return;
        }

        try {
            const module = await import('/participante/js/widgets/round-xray-widget.js');

            if (module.inicializarRaioXWidget) {
                // Buscar status do mercado
                const mercadoStatus = await fetch('/api/cartola/mercado-status').then(r => r.json()).catch(() => null);

                await module.inicializarRaioXWidget({
                    ligaId: this.participanteData?.ligaId,
                    timeId: this.participanteData?.timeId,
                    temporada: new Date().getFullYear(),
                }, mercadoStatus);

                if (window.Log) Log.info('PARTICIPANTE-NAV', '⚽ Widget "Raio-X da Rodada" inicializado');
            }
        } catch (error) {
            if (window.Log) Log.warn('PARTICIPANTE-NAV', '⚠️ Erro ao inicializar Widget Raio-X:', error);
        }
    }

    /**
     * Widget "Campeao" - Celebracao de campeoes
     * Pre-carrega o modulo para que window.CampeaoWidget fique disponivel
     * para qualquer modulo que precise disparar celebracoes.
     */
    async inicializarCampeaoWidget() {
        try {
            await import('/participante/js/widgets/campeao-widget.js');
            if (window.Log) Log.info('PARTICIPANTE-NAV', 'Widget "Campeao" pre-carregado');
        } catch (error) {
            if (window.Log) Log.warn('PARTICIPANTE-NAV', 'Erro ao pre-carregar Widget Campeao:', error);
        }
    }

    /**
     * ✅ Modal Mito & Mico — exibe resultado divertido pós-rodada (1x por rodada).
     * Import dinâmico para não bloquear navegação principal.
     * Delay de 800ms para garantir que o módulo inicial já renderizou.
     */
    inicializarMitoMicoModal() {
        if (window.isLigaAposentada) return;

        const { ligaId, timeId } = this.participanteData || {};
        if (!ligaId) return;

        setTimeout(() => {
            import('/participante/js/modules/participante-mito-mico-modal.js?v=2')
                .then(({ initMitoMicoModal }) => initMitoMicoModal({
                    ligaId,
                    timeId,
                    temporada: new Date().getFullYear(),
                }))
                .catch(() => {});
        }, 800);
    }

    renderizarMenuDinamico() {
        // ✅ QUICK ACCESS BAR: Não renderizar bottom-nav-modern (foi substituído)
        // A Quick Access Bar gerencia a navegação agora
        if (window.Log) Log.info('PARTICIPANTE-NAV', '✅ Quick Access Bar ativa - bottom-nav desabilitado');
        
        // Notificar Quick Bar sobre módulos ativos (se já estiver carregada)
        if (window.quickAccessBar) {
            window.quickAccessBar.atualizarModulosAtivos(this.modulosAtivos);
        }
        
        return;
    }

    verificarModuloAtivo(configKey) {
        // Módulos base sempre ativos (historico é Hall da Fama)
        const modulosBase = ["extrato", "ranking", "rodadas", "historico"];

        if (!this.modulosAtivos || Object.keys(this.modulosAtivos).length === 0) {
            return modulosBase.includes(configKey);
        }

        // Módulos base sempre ativos no menu (aparecem, mas podem estar em manutenção)
        if (modulosBase.includes(configKey)) {
            return true;
        }

        return this.modulosAtivos[configKey] === true;
    }

    /**
     * ✅ v4.10: Resolve flag premium do participante a partir dos dados da liga.
     * Participantes premium (ex: owner Paulinett) bypassam módulos em manutenção.
     */
    _resolverPremium(ligaData, timeId) {
        if (!ligaData?.participantes || !timeId) return;
        const p = ligaData.participantes.find(
            (part) => String(part.time_id) === String(timeId)
        );
        this._isPremium = p?.premium === true;
        if (this._isPremium && window.Log) {
            Log.info('PARTICIPANTE-NAV', '👑 Participante premium detectado - bypass de manutenção ativo');
        }
    }

    /**
     * Verifica se um módulo base foi desativado pelo admin (em manutenção)
     * Módulos opcionais desativados simplesmente não aparecem no menu.
     * Módulos base desativados aparecem opaco com "Em manutenção".
     * v2.0: Agora também verifica modo manutenção com bloqueio pontual de módulos
     */
    isModuloEmManutencao(moduloId) {
        // Verificar se módulo está bloqueado por modo manutenção pontual
        if (window.participanteModulosBloqueados && Array.isArray(window.participanteModulosBloqueados)) {
            if (window.participanteModulosBloqueados.includes(moduloId)) {
                return true;
            }
        }

        // Verificação original (módulos base desativados definitivamente)
        const modulosBase = ["extrato", "ranking", "rodadas", "historico"];
        if (!modulosBase.includes(moduloId)) return false;
        if (!this.modulosAtivos) return false;
        return this.modulosAtivos[moduloId] === false;
    }

    /**
     * ✅ v4.8: Verifica se módulo opcional foi desativado pelo admin.
     * Módulos base e de sistema sempre passam. Módulos opcionais precisam
     * estar explicitamente ativos em modulosAtivos.
     */
    _isModuloOpcionalInativo(moduloId) {
        // Módulos de sistema/base: sempre permitidos (inclui sub-módulos como rodada-xray)
        const modulosPermitidos = ['home', 'boas-vindas', 'extrato', 'ranking', 'rodadas', 'rodada-xray', 'historico', 'configuracoes', 'copa-times-sc', 'copa-2026-mundo', 'regras', 'libertadores', 'copa-brasil', 'copa-nordeste', 'info-meu-time', 'agenda-tabelas', 'brasileirao', 'jogos-do-dia'];
        if (modulosPermitidos.includes(moduloId)) return false;

        // Sem dados de módulos carregados: permitir (graceful degradation)
        if (!this.modulosAtivos || Object.keys(this.modulosAtivos).length === 0) return false;

        // Mapear kebab-case (ID de navegação) para camelCase (key do modulosAtivos)
        const configKeyMap = {
            'mata-mata': 'mataMata',
            'pontos-corridos': 'pontosCorridos',
            'melhor-mes': 'melhorMes',
            'luva-ouro': 'luvaOuro',
            'capitao': 'capitaoLuxo',
            'resta-um': 'restaUm',
        };
        const configKey = configKeyMap[moduloId] || moduloId;

        return this.modulosAtivos[configKey] !== true;
    }

    configurarEventListeners() {
        // ✅ QUICK ACCESS BAR: Event listeners não são mais necessários aqui
        // A Quick Access Bar gerencia os cliques nos módulos
        
        // Configurar interceptação do botão Voltar (History API) - ainda necessário
        this.configurarHistoryAPI();

        if (window.Log) Log.debug('PARTICIPANTE-NAV', '✅ Event listeners configurados (History API apenas)');
    }

    // =====================================================================
    // HISTORY API - Interceptar botão Voltar do navegador/celular
    // =====================================================================
    configurarHistoryAPI() {
        // Adicionar estado inicial ao histórico
        if (!history.state || !history.state.modulo) {
            history.replaceState({ modulo: this.moduloAtual, index: 0 }, '', window.location.href);
        }

        // Listener para o evento popstate (botão voltar)
        window.addEventListener('popstate', (event) => {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⬅️ Popstate detectado:', event.state);
            this.tratarBotaoVoltar(event);
        });

        if (window.Log) Log.debug('PARTICIPANTE-NAV', '✅ History API configurada');
    }

    tratarBotaoVoltar(event) {
        const moduloAtual = this.moduloAtual;
        // ✅ v4.3: Home é a página inicial principal agora
        const paginasIniciais = ['home'];

        // Se estiver na página inicial, mostrar modal de confirmação
        if (paginasIniciais.includes(moduloAtual)) {
            // Impedir a navegação - voltar ao estado atual
            history.pushState({ modulo: moduloAtual, index: this.historicoNavegacao.length }, '', window.location.href);

            // Mostrar modal de confirmação
            this.mostrarModalSairApp();
            return;
        }

        // Nas outras páginas, voltar normalmente
        if (this.historicoNavegacao.length > 0) {
            const moduloAnterior = this.historicoNavegacao.pop();
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⬅️ Voltando para:', moduloAnterior);

            // Navegar sem adicionar ao histórico
            this.navegarPara(moduloAnterior, false, true);
            // Sincronizar estado ativo da Quick Access Bar
            if (window.quickAccessBar) {
                window.quickAccessBar.atualizarNavAtivo(moduloAnterior);
            }
        } else {
            // ✅ v4.3: Se não há histórico, ir para home
            history.pushState({ modulo: 'home', index: 0 }, '', window.location.href);
            this.navegarPara('home', false, true);
            // Sincronizar estado ativo da Quick Access Bar
            if (window.quickAccessBar) {
                window.quickAccessBar.atualizarNavAtivo('home');
            }
        }
    }

    mostrarModalSairApp() {
        // Verificar se já existe um modal
        let modal = document.getElementById('modalSairApp');

        if (!modal) {
            // Criar modal
            modal = document.createElement('div');
            modal.id = 'modalSairApp';
            modal.innerHTML = `
                <div class="modal-sair-overlay" onclick="window.participanteNav.fecharModalSairApp()">
                    <div class="modal-sair-content" onclick="event.stopPropagation()">
                        <div class="modal-sair-icon">
                            <span class="material-symbols-outlined">logout</span>
                        </div>
                        <h3 class="modal-sair-titulo">Deseja fechar o app?</h3>
                        <p class="modal-sair-texto">Você está prestes a sair do Super Cartola.</p>
                        <div class="modal-sair-botoes">
                            <button class="modal-sair-btn cancelar" onclick="window.participanteNav.fecharModalSairApp()">
                                <span class="material-symbols-outlined">close</span>
                                Cancelar
                            </button>
                            <button class="modal-sair-btn confirmar" onclick="window.participanteNav.confirmarSairApp()">
                                <span class="material-symbols-outlined">exit_to_app</span>
                                Sair
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Adicionar estilos do modal
            if (!document.getElementById('estilosModalSair')) {
                const estilos = document.createElement('style');
                estilos.id = 'estilosModalSair';
                estilos.textContent = `
                    .modal-sair-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.8);
                        backdrop-filter: blur(4px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 9999;
                        animation: fadeIn 0.2s ease;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    .modal-sair-content {
                        background: var(--app-surface-elevated);
                        border-radius: 16px;
                        padding: 24px;
                        max-width: 320px;
                        width: 90%;
                        text-align: center;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                        animation: slideUp 0.3s ease;
                    }
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    .modal-sair-icon {
                        width: 64px;
                        height: 64px;
                        background: rgba(255, 69, 0, 0.15);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 16px;
                    }
                    .modal-sair-icon .material-symbols-outlined {
                        font-size: 32px;
                        color: #ff4500;
                    }
                    .modal-sair-titulo {
                        color: white;
                        font-size: 18px;
                        font-weight: 600;
                        margin-bottom: 8px;
                    }
                    .modal-sair-texto {
                        color: #9ca3af;
                        font-size: 14px;
                        margin-bottom: 24px;
                    }
                    .modal-sair-botoes {
                        display: flex;
                        gap: 12px;
                    }
                    .modal-sair-btn {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: 12px 16px;
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: none;
                    }
                    .modal-sair-btn .material-symbols-outlined {
                        font-size: 18px;
                    }
                    .modal-sair-btn.cancelar {
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                    }
                    .modal-sair-btn.cancelar:active {
                        background: rgba(255, 255, 255, 0.15);
                        transform: scale(0.98);
                    }
                    .modal-sair-btn.confirmar {
                        background: #ff4500;
                        color: white;
                    }
                    .modal-sair-btn.confirmar:active {
                        background: #e63e00;
                        transform: scale(0.98);
                    }
                `;
                document.head.appendChild(estilos);
            }
        }

        modal.style.display = 'block';
        if (window.Log) Log.info('PARTICIPANTE-NAV', '📱 Modal "Sair do App" exibido');
    }

    fecharModalSairApp() {
        const modal = document.getElementById('modalSairApp');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    confirmarSairApp() {
        if (window.Log) Log.info('PARTICIPANTE-NAV', '👋 Usuário confirmou sair do app');
        // ✅ v4.4: Fazer logout real (limpar sessão + redirecionar para login)
        if (typeof logout === 'function') {
            logout();
        } else {
            // Fallback: redirecionar direto para login
            window.location.href = '/participante-login.html';
        }
    }

    async navegarPara(moduloId, forcarReload = false, voltandoHistorico = false) {
        // ✅ v4.7: Bloqueio de módulos em manutenção (admin desativou via toggle)
        // ✅ v4.10: Premium bypass - participantes premium acessam módulos em manutenção
        if (this.isModuloEmManutencao(moduloId) && !this._isPremium) {
            if (window.Log) Log.info('PARTICIPANTE-NAV', `🔧 Modulo em manutenção: ${moduloId}`);
            this.mostrarModalManutencaoModulo(moduloId);
            return;
        }
        if (this.isModuloEmManutencao(moduloId) && this._isPremium) {
            if (window.Log) Log.info('PARTICIPANTE-NAV', `👑 Premium bypass: acessando ${moduloId} em manutenção`);
        }

        // ✅ v4.8: Bloqueio de módulos opcionais desativados pelo admin
        // ✅ v4.10: Premium bypass também para módulos opcionais inativos
        if (this._isModuloOpcionalInativo(moduloId) && !this._isPremium) {
            if (window.Log) Log.info('PARTICIPANTE-NAV', `🚫 Módulo opcional inativo: ${moduloId}`);
            this.mostrarModalManutencaoModulo(moduloId);
            return;
        }

        // ✅ v4.3: Bloqueio de pré-temporada DESATIVADO (temporada 2026 em andamento - Rodada 1+)
        // O verificarBloqueioPreTemporada só é ativado em pré-temporada (antes da rodada 1)
        // Mantemos o código para futuras pré-temporadas, mas desativado por padrão
        // ✅ v4.4: Liga aposentada - bloqueio SEMPRE ativo (independe de pré-temporada)
        const isLigaAposentada = window.isLigaAposentada === true;
        const isPreTemporada = window.ParticipanteConfig?.isPreparando?.() ?? false;
        if ((isLigaAposentada || isPreTemporada) && this.verificarBloqueioPreTemporada(moduloId)) {
            if (window.Log) Log.info('PARTICIPANTE-NAV', `🚫 Modulo bloqueado (pre-temporada): ${moduloId}`);
            this.mostrarModalBloqueioPreTemporada(moduloId);
            return;
        }

        // ✅ v3.0: APENAS debounce por tempo (sem flag que pode travar)
        const agora = Date.now();
        const navegacaoId = `nav_${agora}_${moduloId}`;

        // Debounce simples: ignorar cliques muito rápidos (< 100ms)
        if (agora - this._ultimaNavegacao < this._debounceMs) {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', '⏸️ Debounce: ignorando clique muito rápido');
            return;
        }

        // ✅ v5.8: Prevenir double-init — ignorar se o mesmo módulo já está carregando
        if (this._carregandoModulo === moduloId && !forcarReload) {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', `⏸️ Double-init bloqueado: ${moduloId} já em carregamento`);
            return;
        }

        // Registrar esta navegação
        this._ultimaNavegacao = agora;
        this._navegacaoEmAndamento = navegacaoId;
        this._carregandoModulo = moduloId;

        // ✅ v4.11: Verificação fresca de manutenção para módulos base (fecha gap de 45s do polling)
        // Evita que o participante carregue um módulo bloqueado durante o gap entre ciclos de polling
        const MODULOS_BASE_VERIFICACAO_MANUT = ['extrato', 'ranking', 'rodadas'];
        if (MODULOS_BASE_VERIFICACAO_MANUT.includes(moduloId) && !this._isPremium) {
            try {
                const resMt = await fetch('/api/participante/manutencao/status', { cache: 'no-store' });
                if (resMt.ok) {
                    const dataMt = await resMt.json();
                    const anteriormenteBloqueado = (window.participanteModulosBloqueados || []).includes(moduloId);
                    // Atualizar estado global com dados frescos
                    if (dataMt.ativo && dataMt.modo === 'modulos' && Array.isArray(dataMt.modulos_bloqueados)) {
                        window.participanteModulosBloqueados = dataMt.modulos_bloqueados;
                    } else if (!dataMt.ativo || dataMt.modo !== 'modulos') {
                        window.participanteModulosBloqueados = [];
                    }
                    // Bloquear se ainda em manutenção
                    if (this.isModuloEmManutencao(moduloId)) {
                        if (window.Log) Log.info('PARTICIPANTE-NAV', `[CHECK-FRESCO] ${moduloId} em manutencao — bloqueando`);
                        this._carregandoModulo = null; // ✅ v5.9: Liberar guard antes de early return
                        this.mostrarModalManutencaoModulo(moduloId);
                        return;
                    }
                    // Se o módulo estava bloqueado e agora está liberado: registrar para UX de transição
                    if (anteriormenteBloqueado && !this.isModuloEmManutencao(moduloId)) {
                        window.participanteModulosReativados = window.participanteModulosReativados || {};
                        if (!window.participanteModulosReativados[moduloId]) {
                            window.participanteModulosReativados[moduloId] = Date.now();
                            if (window.Log) Log.info('PARTICIPANTE-NAV', `[CHECK-FRESCO] ${moduloId} recém-liberado de manutencao`);
                        }
                    }
                }
            } catch (_) { /* falha silenciosa — continuar com estado atual do cache */ }
        }

        const container = document.getElementById("moduleContainer");

        if (window.Log) Log.info('PARTICIPANTE-NAV', `🧭 Navegando para: ${moduloId}`);

        // Reset scroll ao topo ao trocar de módulo
        window.scrollTo(0, 0);

        // container já foi obtido acima para verificar isFirstLoad
        if (!container) {
            if (window.Log) Log.error('PARTICIPANTE-NAV', '❌ Container não encontrado');
            this._carregandoModulo = null; // ✅ v5.9: Liberar guard antes de early return
            return;
        }

        // ✅ CORREÇÃO: Timeout de segurança para evitar tela preta
        const timeoutId = setTimeout(() => {
            if (window.Log) Log.warn('PARTICIPANTE-NAV', '⏱️ Timeout de carregamento atingido');
            this._carregandoModulo = null; // ✅ v5.9: Liberar guard no timeout
            if (window.LoadingOverlay) window.LoadingOverlay.hide(); // ✅ v5.9: Esconder overlay no timeout
            this.mostrarErroCarregamento(container, moduloId, 'Timeout de carregamento');
        }, 15000); // 15 segundos

        // Gerenciar histórico de navegação (se não estiver voltando)
        if (!voltandoHistorico && this.moduloAtual && this.moduloAtual !== moduloId) {
            this.historicoNavegacao.push(this.moduloAtual);
            history.pushState({ modulo: moduloId, index: this.historicoNavegacao.length }, '', window.location.href);
        }

        const nomeModulo = this.obterNomeModulo(moduloId);

        // ✅ v4.3: Feedback visual IMEDIATO - fade + translate para transição suave
        container.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
        container.style.opacity = '0.6';
        container.style.transform = 'translateY(4px)';

        // ✅ v2.5: Loading inteligente - só mostra se não tem cache recente (24h)
        const cacheKey = `modulo_loaded_${moduloId}`;
        const lastLoaded = localStorage.getItem(cacheKey);
        const TTL_24H = 24 * 60 * 60 * 1000;
        const temCacheRecente = lastLoaded && (agora - parseInt(lastLoaded)) < TTL_24H;

        // ✅ v2.7: NÃO limpar container durante navegação (cache-first renderiza instantâneo)
        // Apenas mostrar loading se não tem cache recente
        if (!temCacheRecente && window.LoadingOverlay) {
            window.LoadingOverlay.show(`Carregando ${nomeModulo}...`);
        }

        // ✅ v2.7: REMOVIDO - Não limpar container antes de carregar
        // Isso causava tela em branco e necessidade de clique duplo
        // O conteúdo antigo permanece visível até o novo ser carregado

        // ✅ v5.9: Cancelar fetch anterior se houver navegação em andamento
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();
        const signal = this._abortController.signal;

        try {
            const htmlPath = this.modulos[moduloId];
            if (!htmlPath) {
                throw new Error(`Módulo "${moduloId}" não encontrado`);
            }

            const response = await fetch(htmlPath, { signal });
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`O módulo "${nomeModulo}" ainda não está disponível`);
                }
                throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
            }

            const html = await response.text();

            // ✅ v5.9: Descartar resposta se outra navegação já começou (stale response)
            if (this._navegacaoEmAndamento !== navegacaoId) {
                if (window.Log) Log.debug('PARTICIPANTE-NAV', `⏸️ Resposta stale descartada: ${moduloId} (navegação mudou)`);
                clearTimeout(timeoutId);
                return;
            }

            // ✅ CORREÇÃO: Limpar timeout de segurança
            clearTimeout(timeoutId);

            // ✅ v5.5: Cleanup do módulo anterior (parar timers, polling, etc)
            if (this.moduloAtual && window[`destruir${this.moduloAtual.replace(/-./g, c => c[1].toUpperCase()).replace(/^./, c => c.toUpperCase())}Participante`]) {
                try {
                    window[`destruir${this.moduloAtual.replace(/-./g, c => c[1].toUpperCase()).replace(/^./, c => c.toUpperCase())}Participante`]();
                } catch (e) { /* ignore cleanup errors */ }
            }

            container.innerHTML = html;

            // ✅ v4.2: Aguardar DOM renderizar antes de carregar JS do módulo
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            // ✅ v4.9.2: Setar ANTES de carregarModuloJS — timers órfãos se auto-cancelam imediatamente
            window.moduloAtualParticipante = moduloId;

            await this.carregarModuloJS(moduloId);

            this.moduloAtual = moduloId;
            sessionStorage.setItem("participante_modulo_atual", moduloId);

            // ✅ v4.9: Atualizar hash para deep linking
            if (moduloId === 'home') {
                history.replaceState(history.state, '', window.location.pathname + window.location.search);
            } else {
                history.replaceState(history.state, '', `#${moduloId}`);
            }

            // ✅ v2.5: Salvar timestamp do carregamento para loading inteligente
            localStorage.setItem(`modulo_loaded_${moduloId}`, Date.now().toString());

            if (window.Log) Log.info('PARTICIPANTE-NAV', `✅ Módulo ${moduloId} carregado`);

            // ✅ v2.4: Adicionar botão de atualização manual (temporada encerrada)
            // Versão simplificada: ícone único, não ocupa linha inteira (discreto no header)
            if (moduloId !== 'home' && window.RefreshButton?.shouldShow()) {
                window.RefreshButton.addTo(container, { text: '', ariaLabel: 'Atualizar dados' });
            }

        } catch (error) {
            // ✅ CORREÇÃO: Limpar timeout de segurança
            clearTimeout(timeoutId);

            // ✅ v5.9: Ignorar AbortError — navegação foi cancelada intencionalmente
            if (error.name === 'AbortError') {
                if (window.Log) Log.debug('PARTICIPANTE-NAV', `⏸️ Fetch cancelado (navegação mudou): ${moduloId}`);
                return;
            }

            if (window.Log) Log.error('PARTICIPANTE-NAV', `❌ Erro ao carregar ${moduloId}:`, error);

            this.mostrarErroCarregamento(container, moduloId, error);
        } finally {
            // ✅ v5.8: Liberar guard de double-init ao terminar (sucesso ou erro)
            if (this._carregandoModulo === moduloId) {
                this._carregandoModulo = null;
            }

            // ✅ v4.2: SEMPRE restaurar opacity e esconder overlays (evita UI travada)
            // ✅ v4.3: Restaurar com transição suave de entrada
            container.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            // ✅ v4.4: Limpar transform após animação — transform: translateY(0) cria
            // containing block para position:fixed, quebrando modais/bottom-sheets
            setTimeout(() => { container.style.transform = ''; }, 250);

            if (window.SplashScreen) {
                window.SplashScreen.hide();
            }

            if (window.LoadingOverlay) {
                window.LoadingOverlay.hide();
            }
        }
    }

    // ✅ NOVO: Função para mostrar erro de carregamento
    mostrarErroCarregamento(container, moduloId, mensagem) {
        const erroObj = typeof mensagem === 'string' ? { message: mensagem } : mensagem;
        const mensagemErro = this.obterMensagemErroAmigavel(erroObj);
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; max-width: 500px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05)); border-radius: 16px; padding: 40px; border: 2px solid rgba(239, 68, 68, 0.2);">
                    <span class="material-symbols-outlined" style="font-size: 64px; color: #facc15; margin-bottom: 20px; display: block;">warning</span>
                    <h3 style="color: #dc2626; margin-bottom: 16px; font-size: 20px; font-weight: 600;">Ops! Algo deu errado</h3>
                    <p style="color: #999; margin-bottom: 24px; line-height: 1.6;">${mensagemErro}</p>
                    <p style="color: #555; font-size: 11px; margin-bottom: 16px; word-break: break-all;">Detalhe: ${(erroObj.message || mensagem || 'desconhecido').substring(0, 200)}</p>
                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="window.participanteNav.navegarPara('${moduloId}', true)"
                                style="background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255, 255, 255, 0.2); padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">refresh</span>
                            Tentar Novamente
                        </button>
                        <button onclick="window.participanteNav.navegarPara('home')"
                                style="background: #ff4500; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">home</span>
                            Voltar ao Início
                        </button>
                    </div>
                </div>
            </div>
        `;

        // ✅ Esconder splash se ainda visível
        if (window.SplashScreen) {
            window.SplashScreen.hide();
        }
    }

    obterNomeModulo(moduloId) {
        const nomes = {
            "boas-vindas": "Início",
            home: "Início",
            extrato: "Extrato Financeiro",
            ranking: "Ranking Geral",
            rodadas: "Rodadas",
            historico: "Hall da Fama",
            top10: "Top 10",
            "melhor-mes": "Melhor Mês",
            "pontos-corridos": "Pontos Corridos",
            "mata-mata": "Mata-Mata",
            artilheiro: "Artilheiro Campeão",
            "luva-ouro": "Luva de Ouro",
            capitao: "Capitão de Luxo",
            "resta-um": "Resta Um",
            regras: "Regras",
            configuracoes: "Configurações",
            "copa-2026-mundo": "Copa do Mundo 2026",
            "libertadores": "Libertadores 2026",
            "copa-brasil": "Copa do Brasil 2026",
        };
        return nomes[moduloId] || moduloId;
    }

    obterMensagemErroAmigavel(error) {
        const mensagem = (error.message || '').toLowerCase();
        const nome = (error.name || '').toLowerCase();

        if (mensagem.includes("não foi encontrado") || mensagem.includes("404")) {
            return "Este módulo ainda não está disponível. Entre em contato com o administrador da liga.";
        }
        // ✅ v4.4: Distinguir timeout (AbortError) de erro de rede real
        if (nome === 'aborterror' || mensagem.includes("aborted")) {
            return "A conexão está lenta. Tente novamente em instantes.";
        }
        if (mensagem.includes("timeout")) {
            return "A requisição demorou muito. Tente novamente em instantes.";
        }
        // ✅ v4.4: Só mostrar "falha de conexão" para erros genuínos de rede
        if (mensagem.includes("failed to fetch") || mensagem.includes("networkerror") || (mensagem.includes("network") && !mensagem.includes("module"))) {
            return "Falha na conexão. Verifique sua internet e tente novamente.";
        }
        // ✅ v4.4: Erro de import de módulo (syntax error, dependência)
        if (mensagem.includes("import") || mensagem.includes("module") || mensagem.includes("unexpected token") || mensagem.includes("syntax")) {
            return `Erro ao carregar módulo. Limpe o cache do navegador e tente novamente. (${error.message})`;
        }
        return error.message || "Ocorreu um erro inesperado. Tente novamente.";
    }

    async carregarModuloJS(modulo) {
        if (window.Log) Log.debug('PARTICIPANTE-NAV', `📦 Importando JS: ${modulo}`);

        const modulosPaths = {
            "boas-vindas": "/participante/js/modules/participante-boas-vindas.js",
            home: "/participante/js/modules/participante-home.js",
            extrato: "/participante/js/modules/participante-extrato.js",
            ranking: "/participante/js/modules/participante-ranking.js",
            rodadas: "/participante/js/modules/participante-rodadas.js",
            historico: "/participante/js/modules/participante-historico.js",
            top10: "/participante/js/modules/participante-top10.js",
            "melhor-mes": "/participante/js/modules/participante-melhor-mes.js",
            "pontos-corridos": "/participante/js/modules/participante-pontos-corridos.js",
            "mata-mata": "/participante/js/modules/participante-mata-mata.js",
            artilheiro: "/participante/js/modules/participante-artilheiro.js",
            "luva-ouro": "/participante/js/modules/participante-luva-ouro.js",
            campinho: "/participante/js/modules/participante-campinho.js",
            dicas: "/participante/js/modules/participante-dicas.js",
            capitao: "/participante/js/modules/participante-capitao.js",
            configuracoes: "/participante/js/modules/participante-notifications.js",
            "copa-times-sc": "/participante/js/modules/participante-copa-sc.js",
            "copa-2026-mundo": "/participante/js/modules/participante-copa-2026-mundo.js",
            regras: "/participante/js/modules/participante-regras.js",
            "rodada-xray": "/participante/js/modules/participante-rodada-xray.js",
            "resta-um": "/participante/js/modules/participante-resta-um.js",
            "tiro-certo": "/participante/js/modules/participante-tiro-certo.js",
            "libertadores": "/participante/js/modules/participante-libertadores.js",
            "copa-brasil": "/participante/js/modules/participante-copa-brasil.js",
            "copa-nordeste": "/participante/js/modules/participante-copa-nordeste.js",
            "agenda-tabelas": "/participante/js/modules/participante-agenda-tabelas.js",
            "brasileirao": "/participante/js/modules/participante-brasileirao.js",
            "jogos-do-dia": "/participante/js/modules/participante-jogos-do-dia.js",
            "info-meu-time": "/participante/js/modules/participante-info-meu-time.js",
        };

        const jsPath = modulosPaths[modulo];
        if (jsPath) {
            try {
                // ✅ v4.6: Import direto - SW não intercepta mais /js/modules/ (v4.0)
                // ✅ v4.9.1: Versão estável por sessão (não Date.now() a cada nav)
                const moduloJS = await import(jsPath + '?v=' + _MODULE_SESSION_V);

                const moduloCamelCase = modulo
                    .split("-")
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join("");

                const possibleFunctionNames = [
                    `inicializar${moduloCamelCase}Participante`,
                    `inicializar${moduloCamelCase}`,
                    `inicializar${modulo}Participante`,
                    `inicializar${modulo}`,
                ];

                let functionExecuted = false;
                for (const funcName of possibleFunctionNames) {
                    if (moduloJS[funcName]) {
                        if (window.Log) Log.debug('PARTICIPANTE-NAV', `🚀 Executando: ${funcName}()`);
                        try {
                            const payload = this.participanteData
                                ? {
                                      participante: this.participanteData,
                                      ligaId: this.participanteData.ligaId,
                                      timeId: this.participanteData.timeId,
                                  }
                                : {};

                            if (modulo === 'campinho' && this._campinhoTarget) {
                                payload.timeId = this._campinhoTarget.timeId;
                                payload.ligaId = this._campinhoTarget.ligaId || payload.ligaId;
                                delete payload.participante;
                                this._campinhoTarget = null;
                            }

                            if (Object.keys(payload).length > 0) {
                                await moduloJS[funcName](payload);
                            } else {
                                await moduloJS[funcName]();
                            }
                            if (window.Log) Log.debug('PARTICIPANTE-NAV', `✅ ${funcName}() executada`);
                            functionExecuted = true;
                            break;
                        } catch (error) {
                            if (window.Log) Log.error('PARTICIPANTE-NAV', `❌ Erro em ${funcName}():`, error);
                            // ✅ v4.4: Propagar erro real para mostrar mensagem útil ao usuário
                            throw error;
                        }
                    }
                }

                if (!functionExecuted) {
                    if (window.Log) Log.debug('PARTICIPANTE-NAV', `ℹ️ Sem função de init para '${modulo}'`);
                }
            } catch (error) {
                if (window.Log) Log.error('PARTICIPANTE-NAV', `❌ Erro ao importar '${jsPath}':`, error);
                throw error;
            }
        } else {
            if (window.Log) Log.debug('PARTICIPANTE-NAV', `ℹ️ Sem JS para '${modulo}'`);
        }
    }

    // =====================================================================
    // BLOQUEIO DE MODULOS EM PRE-TEMPORADA
    // =====================================================================

    /**
     * Verifica se o modulo esta bloqueado por conta da pre-temporada
     * Modulos que dependem de dados de rodadas ficam bloqueados ate o Brasileirao iniciar
     * ✅ v4.2: Liga estreante - bloquear Hall da Fama (sem historico)
     */
    verificarBloqueioPreTemporada(moduloId) {
        const config = window.ParticipanteConfig;

        // ✅ v4.4: Liga aposentada - só permite Hall da Fama
        if (window.isLigaAposentada) {
            if (moduloId === 'historico') return false; // Liberado
            if (window.Log) Log.info('PARTICIPANTE-NAV', `🏛️ Módulo ${moduloId} bloqueado - liga aposentada`);
            return true;
        }

        // ✅ v4.2: Liga estreante - bloquear Hall da Fama (sem historico para mostrar)
        if (window.isLigaEstreante && moduloId === 'historico') {
            if (window.Log) Log.info('PARTICIPANTE-NAV', '🚫 Hall da Fama bloqueado para liga estreante');
            return true;
        }

        // Se nao estiver em "preparando", nenhum modulo esta bloqueado
        if (!config || !config.isPreparando || !config.isPreparando()) {
            return false;
        }

        // Modulos que funcionam mesmo em pre-temporada
        // ✅ v4.1: Adicionado 'home' - mostra dados basicos do participante
        const modulosLiberados = ['boas-vindas', 'home', 'extrato', 'historico', 'configuracoes', 'regras'];

        // Se o modulo esta na lista de liberados, nao bloquear
        if (modulosLiberados.includes(moduloId)) {
            return false;
        }

        // Todos os outros modulos estao bloqueados em pre-temporada
        return true;
    }

    /**
     * Mostra modal amigavel informando que o modulo esta bloqueado
     */
    mostrarModalBloqueioPreTemporada(moduloId) {
        const config = window.ParticipanteConfig;
        const diasRestantes = config && config.getCountdownDays ? config.getCountdownDays() : 0;

        // Mapeamento de nomes amigaveis dos modulos
        const nomesModulos = {
            'ranking': 'Ranking',
            'rodadas': 'Rodadas',
            'top10': 'Top 10',
            'melhor-mes': 'Melhor do Mes',
            'pontos-corridos': 'Pontos Corridos',
            'mata-mata': 'Mata-Mata',
            'artilheiro': 'Artilheiro',
            'luva-ouro': 'Luva de Ouro',
            'capitao': 'Capitão de Luxo'
        };

        const nomeModulo = nomesModulos[moduloId] || moduloId;

        // Remover modal existente se houver
        const modalExistente = document.getElementById('modalBloqueioPreTemporada');
        if (modalExistente) {
            modalExistente.remove();
        }

        // Criar modal
        const modal = document.createElement('div');
        modal.id = 'modalBloqueioPreTemporada';

        // ✅ v4.4: Modal específico para liga aposentada
        if (window.isLigaAposentada) {
            modal.innerHTML = `
                <div class="modal-bloqueio-overlay" onclick="window.participanteNav.fecharModalBloqueio()">
                    <div class="modal-bloqueio-content modal-aposentada" onclick="event.stopPropagation()">
                        <div class="modal-bloqueio-icon modal-aposentada-icon">
                            <span class="material-symbols-outlined">emoji_events</span>
                        </div>
                        <h3 class="modal-bloqueio-titulo">Liga não renovada</h3>
                        <p class="modal-bloqueio-texto">
                            Essa liga <strong>não foi renovada</strong> para a temporada atual.
                        </p>
                        <div class="modal-bloqueio-dica">
                            <span class="material-symbols-outlined">history</span>
                            <span>Veja como foi sua última participação clicando abaixo</span>
                        </div>
                        <div class="modal-bloqueio-botoes">
                            <button class="modal-bloqueio-btn primario" onclick="window.participanteNav.irParaHistorico()" style="flex:1">
                                <span class="material-symbols-outlined">emoji_events</span>
                                Ver Hall da Fama
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            modal.innerHTML = `
            <div class="modal-bloqueio-overlay" onclick="window.participanteNav.fecharModalBloqueio()">
                <div class="modal-bloqueio-content" onclick="event.stopPropagation()">
                    <div class="modal-bloqueio-icon">
                        <span class="material-symbols-outlined">hourglass_top</span>
                    </div>
                    <h3 class="modal-bloqueio-titulo">Aguarde o Brasileirão</h3>
                    <p class="modal-bloqueio-texto">
                        O modulo <strong>${nomeModulo}</strong> estara disponivel quando a temporada comecar.
                    </p>
                    ${diasRestantes > 0 ? `
                    <div class="modal-bloqueio-countdown">
                        <span class="countdown-numero">${diasRestantes}</span>
                        <span class="countdown-label">${diasRestantes === 1 ? 'dia' : 'dias'} restantes</span>
                    </div>
                    ` : ''}
                    <div class="modal-bloqueio-dica">
                        <span class="material-symbols-outlined">lightbulb</span>
                        <span>Enquanto isso, explore seu <strong>Historico</strong> e veja suas conquistas anteriores!</span>
                    </div>
                    <div class="modal-bloqueio-botoes">
                        <button class="modal-bloqueio-btn secundario" onclick="window.participanteNav.fecharModalBloqueio()">
                            <span class="material-symbols-outlined">close</span>
                            Fechar
                        </button>
                        <button class="modal-bloqueio-btn primario" onclick="window.participanteNav.irParaHistorico()">
                            <span class="material-symbols-outlined">emoji_events</span>
                            Ver Historico
                        </button>
                    </div>
                </div>
            </div>
        `;
        }

        // Adicionar estilos se nao existirem
        if (!document.getElementById('estilosModalBloqueio')) {
            const estilos = document.createElement('style');
            estilos.id = 'estilosModalBloqueio';
            estilos.textContent = `
                .modal-bloqueio-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.9);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    padding: 20px;
                    animation: fadeIn 0.2s ease;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .modal-bloqueio-content {
                    background: linear-gradient(180deg, var(--app-surface) 0%, #0f0f0f 100%);
                    border-radius: 20px;
                    padding: 28px 24px;
                    max-width: 340px;
                    width: 100%;
                    text-align: center;
                    border: 1px solid rgba(255, 85, 0, 0.3);
                    box-shadow: 0 20px 60px rgba(255, 85, 0, 0.15);
                    animation: slideUp 0.3s ease;
                }
                @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .modal-bloqueio-icon {
                    width: 72px;
                    height: 72px;
                    background: rgba(255, 85, 0, 0.15);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                .modal-bloqueio-icon .material-symbols-outlined {
                    font-size: 36px;
                    color: var(--app-primary);
                }
                .modal-bloqueio-titulo {
                    color: white;
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0 0 12px 0;
                }
                .modal-bloqueio-texto {
                    color: #9ca3af;
                    font-size: 14px;
                    margin: 0 0 20px 0;
                    line-height: 1.5;
                }
                .modal-bloqueio-texto strong {
                    color: var(--app-primary);
                }
                .modal-bloqueio-countdown {
                    background: rgba(255, 85, 0, 0.1);
                    border: 1px solid rgba(255, 85, 0, 0.3);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 20px;
                }
                .modal-bloqueio-countdown .countdown-numero {
                    display: block;
                    font-size: 36px;
                    font-weight: 800;
                    color: var(--app-primary);
                    line-height: 1;
                }
                .modal-bloqueio-countdown .countdown-label {
                    font-size: 12px;
                    color: #9ca3af;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .modal-bloqueio-dica {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    padding: 12px;
                    margin-bottom: 20px;
                    text-align: left;
                }
                .modal-bloqueio-dica .material-symbols-outlined {
                    font-size: 20px;
                    color: #fbbf24;
                    flex-shrink: 0;
                }
                .modal-bloqueio-dica span:last-child {
                    font-size: 12px;
                    color: #9ca3af;
                    line-height: 1.4;
                }
                .modal-bloqueio-dica strong {
                    color: var(--app-primary);
                }
                .modal-bloqueio-botoes {
                    display: flex;
                    gap: 10px;
                }
                .modal-bloqueio-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 14px 16px;
                    border-radius: 12px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .modal-bloqueio-btn .material-symbols-outlined {
                    font-size: 18px;
                }
                .modal-bloqueio-btn.secundario {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }
                .modal-bloqueio-btn.secundario:active {
                    background: rgba(255, 255, 255, 0.15);
                    transform: scale(0.98);
                }
                .modal-bloqueio-btn.primario {
                    background: linear-gradient(135deg, var(--app-primary) 0%, #ff8800 100%);
                    color: white;
                }
                .modal-bloqueio-btn.primario:active {
                    transform: scale(0.98);
                    filter: brightness(0.9);
                }
                /* v4.4: Liga aposentada - tema cinza/prata */
                .modal-aposentada {
                    border-color: rgba(156, 163, 175, 0.3) !important;
                    box-shadow: 0 20px 60px rgba(107, 114, 128, 0.15) !important;
                }
                .modal-aposentada-icon {
                    background: rgba(156, 163, 175, 0.15) !important;
                }
                .modal-aposentada-icon .material-symbols-outlined {
                    color: #fbbf24 !important;
                    font-size: 36px;
                }
            `;
            document.head.appendChild(estilos);
        }

        document.body.appendChild(modal);
        if (window.Log) Log.info('PARTICIPANTE-NAV', `🚫 Modal bloqueio exibido para: ${moduloId}`);
    }

    fecharModalBloqueio() {
        const modal = document.getElementById('modalBloqueioPreTemporada');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * v4.7: Modal amigável para módulo em manutenção
     */
    mostrarModalManutencaoModulo(moduloId) {
        const nomeModulo = this.obterNomeModulo(moduloId);
        const existente = document.getElementById('modalManutencaoModulo');
        if (existente) existente.remove();

        const modal = document.createElement('div');
        modal.id = 'modalManutencaoModulo';
        modal.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;animation:fadeIn .2s ease"
                 onclick="document.getElementById('modalManutencaoModulo')?.remove()">
                <div style="background:#1e293b;border-radius:20px;padding:32px 24px;max-width:340px;width:100%;text-align:center;border:1px solid rgba(255,85,0,0.2);box-shadow:0 20px 60px rgba(255,85,0,0.1)"
                     onclick="event.stopPropagation()">
                    <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,85,0,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                        <span class="material-symbols-outlined" style="font-size:32px;color:var(--app-primary)">engineering</span>
                    </div>
                    <h3 style="color:var(--app-text-primary);font-family:'Russo One',sans-serif;font-size:18px;margin-bottom:8px">Em Manutenção</h3>
                    <p style="color:#9ca3af;font-size:14px;line-height:1.5;margin-bottom:20px">
                        O módulo <strong style="color:var(--app-primary)">${nomeModulo}</strong> está passando por ajustes e estará disponível em breve.
                    </p>
                    <button onclick="document.getElementById('modalManutencaoModulo')?.remove()"
                            style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--app-primary),#ff8800);color:var(--app-text-primary);font-size:14px;font-weight:600;cursor:pointer">
                        Entendi
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    irParaHistorico() {
        this.fecharModalBloqueio();
        this.navegarPara('historico');
    }
}

// Instância global
const participanteNav = new ParticipanteNavigation();

// ✅ Expor globalmente para integração com SplashScreen
window.participanteNavigation = participanteNav;
window.participanteNav = participanteNav;

// Inicializar
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
        await participanteNav.inicializar();
    });
} else {
    participanteNav.inicializar();
}

if (window.Log) Log.info('PARTICIPANTE-NAV', '✅ Sistema v4.3 pronto (temporada 2026 ativa - home como módulo inicial)');
