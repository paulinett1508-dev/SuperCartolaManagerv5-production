// =====================================================================
// matchday-service.js — Live Experience / Modo Matchday (FEAT-026 v2.0)
// =====================================================================
// Responsável por:
//   1. Detectar quando o mercado está fechado + jogos ao vivo
//   2. Emitir eventos 'data:parciais', 'matchday:stop', 'matchday:state',
//      'matchday:loading' para os módulos
//   3. Feedback visual: toasts de transição, indicador de tempo relativo,
//      alerta de dados obsoletos, empty states diferenciados
//   5. Resiliência: tracking de falhas consecutivas, 429 backoff,
//      recovery toast
//
// API pública (window.MatchdayService):
//   .isActive            → boolean
//   .isStale             → boolean
//   .currentState        → string (MATCHDAY_STATES)
//   .lastUpdateTs        → number|null
//   .lastDiff            → Array<{key, prevPos, curPos, direction}>
//   .lastRanking         → Array
//   .on(event, fn)       → subscrever evento
//   .off(event, fn)      → desinscrever evento
//   .setContext({ligaId}) → chamado pelos módulos ao inicializar
//   .destroy()           → cleanup (chamado por Rodadas no SPA destroy)
//   .applyPositionAnimations(containerEl) → aplica moving-up/down nos rows
// =====================================================================

(function () {
    'use strict';

    // ─── Constantes ─────────────────────────────────────────────────
    const POLL_STATUS_INACTIVE_MS  = 5 * 60 * 1000;   // 5 min (inativo)
    const POLL_STATUS_ANTECIPA_MS  = 2 * 60 * 1000;   // 2 min (mercado fechado, sem live yet)
    const POLL_PARCIAIS_MS         = 30 * 1000;        // 30s (ativo)
    const STALE_THRESHOLD_MS       = 2 * 60 * 1000;    // 2 min sem atualizar = stale
    const TS_UPDATE_INTERVAL_MS    = 10 * 1000;        // Atualizar indicador de tempo a cada 10s
    const MAX_SILENT_FAILURES      = 3;                // Após 3 falhas consecutivas, notificar

    // ─── State Machine ──────────────────────────────────────────────
    const MATCHDAY_STATES = {
        LOADING: 'loading',      // Buscando dados pela primeira vez
        WAITING: 'waiting',      // Mercado fechado, jogos ainda não começaram
        LIVE: 'live',            // Dados fluindo normalmente
        STALE: 'stale',          // Sem atualização há >2min
        ERROR: 'error',          // Falha na API
        ENDED: 'ended'           // Rodada encerrada
    };

    // ─── Estado interno ─────────────────────────────────────────────
    let _isActive            = false;
    let _ligaId              = null;
    let _lastParciaisHash    = null;
    let _lastRanking         = [];
    let _lastDiff            = [];
    let _statusTimer         = null;
    let _parciaisTimer       = null;
    let _tsTimer             = null;
    let _listeners           = {};       // { eventName: Set<fn> }
    let _destroyed           = false;
    let _lastUpdateTs        = null;
    let _isStale             = false;
    let _currentState        = null;
    let _consecutiveFailures = 0;
    let _currentRodada       = null;

    // ─── EventEmitter ───────────────────────────────────────────────
    function _on(event, fn) {
        if (!_listeners[event]) _listeners[event] = new Set();
        _listeners[event].add(fn);
    }

    function _off(event, fn) {
        if (_listeners[event]) _listeners[event].delete(fn);
    }

    function _emit(event) {
        if (_listeners[event]) {
            _listeners[event].forEach(fn => {
                try { fn(); } catch (e) {
                    console.warn('[MatchdayService] Handler error:', e);
                }
            });
        }
    }

    // ─── State Machine ──────────────────────────────────────────────
    function _setState(newState) {
        if (newState === _currentState) return;
        _currentState = newState;
        _emit('matchday:state');
    }

    // ─── Toast helper (usa ErrorToast existente) ────────────────────
    function _toast(mensagem, tipo, duracao) {
        if (window.ErrorToast) {
            window.ErrorToast.show(mensagem, { tipo, duracao });
        }
    }

    // ─── Stale detection ────────────────────────────────────────────
    function _updateTimestamp() {
        if (!_lastUpdateTs) return;

        const diff = Date.now() - _lastUpdateTs;
        const wasStale = _isStale;
        _isStale = diff > STALE_THRESHOLD_MS;

        // Toast apenas na transição para stale
        if (_isStale && !wasStale) {
            _setState(MATCHDAY_STATES.STALE);
            _toast('Dados podem estar desatualizados. Verificando conexão...', 'warning', 6000);
        }
    }

    function _startTimestampUpdater() {
        clearInterval(_tsTimer);
        _tsTimer = setInterval(_updateTimestamp, TS_UPDATE_INTERVAL_MS);
    }

    function _stopTimestampUpdater() {
        clearInterval(_tsTimer);
        _tsTimer = null;
    }

    // ─── Skeleton helper ────────────────────────────────────────────
    function _createSkeletonRanking(count) {
        count = count || 5;
        return Array.from({ length: count }, function (_, i) {
            return '<div class="matchday-skeleton-row">' +
                '<div class="skeleton-box" style="width:24px;height:24px;border-radius:50%"></div>' +
                '<div class="skeleton-box" style="width:' + (120 - i * 10) + 'px;height:14px;border-radius:4px"></div>' +
                '<div class="skeleton-box" style="width:48px;height:14px;border-radius:4px;margin-left:auto"></div>' +
            '</div>';
        }).join('');
    }

    // ─── Hash simples para detectar mudança no ranking ──────────────
    function _hashRanking(ranking) {
        if (!Array.isArray(ranking) || !ranking.length) return '';
        return ranking.slice(0, 10).map(r =>
            `${r.participante_id || r.nome}:${r.pontos || r.pontuacao || 0}`
        ).join('|');
    }

    // ─── Polling de status do mercado ───────────────────────────────
    async function _checkStatus() {
        if (_destroyed) return;
        try {
            const res = await fetch('/api/matchday/status', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();

            const matchdayPotencial = data.matchday_ativo === true;

            // Refrescar stats de jogos ao vivo (para labels AO VIVO / EM ANDAMENTO)
            if (matchdayPotencial && window.isRodadaRealmenteAoVivo) {
                await window.isRodadaRealmenteAoVivo();
            }

            if (matchdayPotencial && !_isActive) {
                // Rodada em andamento (mercado fechado) → ativar matchday
                // Mercado fechado → ativar matchday
                _onMatchdayStart();
            } else if (!matchdayPotencial && _isActive) {
                _onMatchdayStop();
            }

            // Ajustar intervalo de polling de status
            _scheduleStatusPoll(matchdayPotencial ? POLL_STATUS_ANTECIPA_MS : POLL_STATUS_INACTIVE_MS);

        } catch (e) {
            // Falha silenciosa — tentar de novo no próximo ciclo
        }
    }

    function _scheduleStatusPoll(interval) {
        clearTimeout(_statusTimer);
        if (!_destroyed) {
            _statusTimer = setTimeout(_checkStatus, interval);
        }
    }

    // ─── Início do matchday ─────────────────────────────────────────
    function _onMatchdayStart() {
        if (_isActive) return;
        _isActive = true;
        _consecutiveFailures = 0;
        _isStale = false;
        _setState(MATCHDAY_STATES.LOADING);
        _startParciaisPolling();
        _startTimestampUpdater();
        _emit('matchday:loading');

        // Toast de ativação — contextual conforme jogos ao vivo
        const aoVivoData = window.getAoVivoData?.();
        const temJogosAgora = (aoVivoData?.stats?.aoVivo || 0) > 0;
        _toast(
            temJogosAgora
                ? 'Rodada ao vivo! Acompanhe as parciais em tempo real.'
                : 'Rodada em andamento! Parciais serão atualizadas quando os jogos começarem.',
            'info',
            4000
        );

        if (window.Log) Log.info('[MatchdayService] MATCHDAY ATIVO — modo live iniciado');
    }

    // ─── Fim do matchday ────────────────────────────────────────────
    function _onMatchdayStop() {
        if (!_isActive) return;
        _isActive = false;
        _consecutiveFailures = 0;
        clearInterval(_parciaisTimer);
        _parciaisTimer = null;
        _stopTimestampUpdater();
        _setState(MATCHDAY_STATES.ENDED);

        // Toast de encerramento
        _toast('Rodada encerrada! Resultados sendo consolidados.', 'success', 5000);

        _emit('matchday:stop');
        if (window.Log) Log.info('[MatchdayService] Matchday encerrado');
    }

    // ─── Polling de parciais ────────────────────────────────────────
    function _startParciaisPolling() {
        clearInterval(_parciaisTimer);
        _fetchParciais(); // imediato
        _parciaisTimer = setInterval(_fetchParciais, POLL_PARCIAIS_MS);
    }

    async function _fetchParciais() {
        if (!_isActive || !_ligaId || _destroyed) return;
        try {
            const res = await fetch(`/api/matchday/parciais/${_ligaId}`, { cache: 'no-store' });

            // Rate limited — backoff automático
            if (res.status === 429) {
                clearInterval(_parciaisTimer);
                _parciaisTimer = null;
                const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
                setTimeout(() => {
                    if (_isActive && !_destroyed) _startParciaisPolling();
                }, retryAfter * 1000);
                return;
            }

            if (!res.ok) {
                _consecutiveFailures++;
                if (_consecutiveFailures >= MAX_SILENT_FAILURES) {
                    _setState(MATCHDAY_STATES.ERROR);
                }
                return;
            }

            // Sucesso — reset falhas
            const wasError = _currentState === MATCHDAY_STATES.ERROR;
            _consecutiveFailures = 0;

            // Recovery toast
            if (wasError) {
                _toast('Parciais reconectadas!', 'success', 3000);
            }

            const data = await res.json();
            const ranking = data?.data?.ranking || data?.ranking || [];
            _currentRodada = data?.data?.rodada || data?.rodada || _currentRodada;
            const hash = _hashRanking(ranking);

            // Sem atletas pontuados ainda
            if (!hash) {
                if (_currentState === MATCHDAY_STATES.LOADING) {
                    _setState(MATCHDAY_STATES.WAITING);
                }
                return;
            }

            // ✅ FIX: Atualizar timestamp em toda resposta válida com dados
            // Antes só atualizava quando hash mudava → "há 34min" mesmo com polling ativo
            _lastUpdateTs = Date.now();
            if (_isStale) {
                _isStale = false;
                _toast('Conexão restabelecida! Dados atualizados.', 'success', 3000);
            }
            _setState(MATCHDAY_STATES.LIVE);

            if (hash !== _lastParciaisHash) {
                _lastParciaisHash = hash;
                const prevRanking = _lastRanking;
                _lastRanking = ranking;

                // Calcular diff de posições
                const prevMap = {};
                (prevRanking || []).forEach((r, i) => {
                    const key = r.timeId || r.participante_id || r.nome;
                    if (key) prevMap[key] = i + 1;
                });

                _lastDiff = ranking.map((r, i) => {
                    const key = r.timeId || r.participante_id || r.nome;
                    const prevPos = prevMap[key];
                    const curPos = i + 1;
                    return {
                        key: key,
                        prevPos: prevPos || null,
                        curPos: curPos,
                        direction: prevPos == null ? null
                            : prevPos > curPos ? 'up'
                            : prevPos < curPos ? 'down'
                            : null
                    };
                });

                // ✅ Super Cache v2: salvar parciais para SWR
                if (window.Cache && _ligaId) {
                    const _temp = window.ParticipanteConfig?.CURRENT_SEASON || new Date().getFullYear();
                    window.Cache.set(`ranking:${_ligaId}:${_temp}`, ranking, {
                        ttl: 30, imutavel: false, motivo: 'rodada_ativa'
                    });
                }

                _emit('data:parciais');
            }
        } catch (e) {
            _consecutiveFailures++;
            if (_consecutiveFailures >= MAX_SILENT_FAILURES) {
                _setState(MATCHDAY_STATES.ERROR);
                _toast('Erro ao buscar parciais. Tentando reconectar...', 'error', 5000);
            }
        }
    }

    // ─── Position Animation Helper ──────────────────────────────────
    function _applyPositionAnimations(containerEl) {
        if (!containerEl || !_lastDiff.length) return;
        var rows = containerEl.querySelectorAll('[data-participant-key]');
        rows.forEach(function (row) {
            var key = row.dataset.participantKey;
            var diff = _lastDiff.find(function (d) { return d.key === key; });
            if (!diff || !diff.direction) return;

            row.classList.add(diff.direction === 'up' ? 'moving-up' : 'moving-down');
            row.classList.add('live-updating');

            // Auto-remove após animação
            setTimeout(function () {
                row.classList.remove('moving-up', 'moving-down', 'live-updating');
            }, 800);
        });
    }

    // ─── API pública ────────────────────────────────────────────────
    window.MatchdayService = {
        get isActive() { return _isActive; },
        get isStale() { return _isStale; },
        get currentState() { return _currentState; },
        get lastUpdateTs() { return _lastUpdateTs; },
        get lastDiff() { return _lastDiff; },
        get lastRanking() { return _lastRanking; },
        get currentRodada() { return _currentRodada; },

        // Constantes para consumidores
        STATES: MATCHDAY_STATES,

        on(event, fn) { _on(event, fn); },

        off(event, fn) { _off(event, fn); },

        setContext({ ligaId } = {}) {
            if (ligaId && ligaId !== _ligaId) {
                _ligaId = ligaId;
                // Se já está ativo e não tinha ligaId antes, iniciar polling
                if (_isActive && !_parciaisTimer) {
                    _startParciaisPolling();
                }
            }
        },

        applyPositionAnimations(containerEl) {
            _applyPositionAnimations(containerEl);
        },

        createSkeletonRanking(count) {
            return _createSkeletonRanking(count);
        },

        destroy() {
            // Chamado por Rodadas no SPA cleanup — apenas para polling de parciais
            // NÃO destruir o serviço inteiro (permanece entre navegações)
            clearInterval(_parciaisTimer);
            _parciaisTimer = null;
            // Se ainda ativo, reiniciar polling no próximo setContext
        },
    };

    // ─── Offline/Online detection ─────────────────────────────────
    let _offlineToastShown = false;

    function _onOffline() {
        if (_offlineToastShown) return;
        _offlineToastShown = true;
        _toast('Sem conexão — dados podem estar desatualizados', 'warning', 8000);
        if (window.Log) Log.warn('[MatchdayService] Dispositivo offline');
    }

    function _onOnline() {
        if (!_offlineToastShown) return;
        _offlineToastShown = false;
        _toast('Conexão restabelecida!', 'success', 3000);
        if (window.Log) Log.info('[MatchdayService] Dispositivo online');
        // Forçar re-check imediato de status
        _checkStatus();
    }

    window.addEventListener('offline', _onOffline);
    window.addEventListener('online', _onOnline);

    // ─── Visibility change (battery saver) ─────────────────────────
    // ✅ Fix LIVE-01: Pausar polling quando tab/app está em background
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            // Tab em background — pausar polling para economizar bateria
            if (_parciaisTimer) {
                clearInterval(_parciaisTimer);
                _parciaisTimer = null;
                if (window.Log) Log.info('[MatchdayService] Polling pausado (tab hidden)');
            }
        } else {
            // Tab visível novamente — refresh imediato + reiniciar polling
            if (_isActive && !_parciaisTimer) {
                if (window.Log) Log.info('[MatchdayService] Polling retomado (tab visible)');
                _fetchParciais(); // refresh imediato ao voltar
                _startParciaisPolling();
            }
        }
    });

    // Verificar estado inicial
    if (!navigator.onLine) {
        _onOffline();
    }

    // ─── Bootstrap ──────────────────────────────────────────────────
    // Iniciar polling de status imediatamente
    _checkStatus();

    if (window.Log) Log.info('[MatchdayService] Inicializado (FEAT-026 v2.1)');

})();
