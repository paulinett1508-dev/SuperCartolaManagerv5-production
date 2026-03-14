// =====================================================================
// matchday-service.js — Live Experience / Modo Matchday (FEAT-026)
// =====================================================================
// Responsável por:
//   1. Detectar quando o mercado está fechado + jogos ao vivo
//   2. Emitir eventos 'data:parciais' e 'matchday:stop' para os módulos
//   3. Injetar header "RODADA AO VIVO" com scout ticker animado
//
// API pública (window.MatchdayService):
//   .isActive          → boolean
//   .on(event, fn)     → subscrever evento
//   .off(event, fn)    → desinscrever evento
//   .setContext({ligaId}) → chamado pelos módulos ao inicializar
//   .destroy()         → cleanup (chamado por Rodadas no SPA destroy)
// =====================================================================

(function () {
    'use strict';

    // ─── Intervalos de polling ────────────────────────────────────────
    const POLL_STATUS_INACTIVE_MS  = 5 * 60 * 1000;   // 5 min (inativo)
    const POLL_STATUS_ANTECIPA_MS  = 2 * 60 * 1000;   // 2 min (mercado fechado, sem live yet)
    const POLL_PARCIAIS_MS         = 30 * 1000;        // 30s (ativo)

    // ─── Estado interno ───────────────────────────────────────────────
    let _isActive        = false;
    let _ligaId          = null;
    let _lastParciaisHash = null;
    let _lastRanking     = [];
    let _statusTimer     = null;
    let _parciaisTimer   = null;
    let _listeners       = {};       // { eventName: Set<fn> }
    let _headerInjected  = false;
    let _destroyed       = false;

    // ─── EventEmitter ────────────────────────────────────────────────
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

    // ─── Hash simples para detectar mudança no ranking ───────────────
    function _hashRanking(ranking) {
        if (!Array.isArray(ranking) || !ranking.length) return '';
        return ranking.slice(0, 10).map(r =>
            `${r.participante_id || r.nome}:${r.pontos || r.pontuacao || 0}`
        ).join('|');
    }

    // ─── Polling de status do mercado ────────────────────────────────
    async function _checkStatus() {
        if (_destroyed) return;
        try {
            const res = await fetch('/api/matchday/status', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();

            const matchdayPotencial = data.matchday_ativo === true;

            if (matchdayPotencial && !_isActive) {
                // Confirmar com ground-truth (jogos realmente ao vivo)
                const aoVivo = window.isRodadaRealmenteAoVivo
                    ? await window.isRodadaRealmenteAoVivo()
                    : matchdayPotencial;

                if (aoVivo) {
                    _onMatchdayStart();
                }
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

    // ─── Início do matchday ───────────────────────────────────────────
    function _onMatchdayStart() {
        if (_isActive) return;
        _isActive = true;
        _injectHeader();
        _startParciaisPolling();
        if (window.Log) Log.info('[MatchdayService] MATCHDAY ATIVO — modo live iniciado');
    }

    // ─── Fim do matchday ─────────────────────────────────────────────
    function _onMatchdayStop() {
        if (!_isActive) return;
        _isActive = false;
        clearInterval(_parciaisTimer);
        _parciaisTimer = null;
        _removeHeader();
        _emit('matchday:stop');
        if (window.Log) Log.info('[MatchdayService] Matchday encerrado');
    }

    // ─── Polling de parciais ──────────────────────────────────────────
    function _startParciaisPolling() {
        clearInterval(_parciaisTimer);
        _fetchParciais(); // imediato
        _parciaisTimer = setInterval(_fetchParciais, POLL_PARCIAIS_MS);
    }

    async function _fetchParciais() {
        if (!_isActive || !_ligaId || _destroyed) return;
        try {
            const res = await fetch(`/api/matchday/parciais/${_ligaId}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            const ranking = data?.data?.ranking || data?.ranking || [];
            const hash = _hashRanking(ranking);

            if (hash && hash !== _lastParciaisHash) {
                _lastParciaisHash = hash;
                const prevRanking = _lastRanking;
                _lastRanking = ranking;
                _updateTicker(ranking, prevRanking);
                _emit('data:parciais');
            }
        } catch (e) {
            // Falha silenciosa
        }
    }

    // ─── Header AO VIVO ──────────────────────────────────────────────
    function _injectHeader() {
        if (_headerInjected || document.getElementById('matchday-header-bar')) return;

        const header = document.createElement('div');
        header.id = 'matchday-header-bar';
        header.className = 'matchday-header';
        header.innerHTML = `
            <div class="matchday-header-inner">
                <span class="material-icons">radio_button_checked</span>
                <span class="matchday-header-label">RODADA AO VIVO</span>
            </div>
            <div class="scout-ticker">
                <div class="scout-ticker-content" id="matchday-ticker-content">
                    Carregando parciais...
                </div>
            </div>`;

        const container = document.getElementById('moduleContainer');
        if (container) {
            container.parentNode.insertBefore(header, container);
        } else {
            document.body.prepend(header);
        }
        _headerInjected = true;
    }

    function _removeHeader() {
        const el = document.getElementById('matchday-header-bar');
        if (el) el.remove();
        _headerInjected = false;
    }

    // ─── Scout Ticker ────────────────────────────────────────────────
    function _updateTicker(ranking, prevRanking) {
        const ticker = document.getElementById('matchday-ticker-content');
        if (!ticker || !ranking.length) return;

        // Construir mapa de posições anteriores
        const prevMap = {};
        (prevRanking || []).forEach((r, i) => {
            const key = r.participante_id || r.nome || i;
            prevMap[key] = i + 1;
        });

        const items = ranking.slice(0, 8).map((r, i) => {
            const pos = i + 1;
            const nome = r.nome || r.participante_nome || '—';
            const pts = typeof r.pontos === 'number'
                ? r.pontos.toFixed(1)
                : (r.pontuacao || '—');
            const key = r.participante_id || nome;
            const prevPos = prevMap[key];
            const seta = prevPos && prevPos > pos ? ' ↑' : '';
            return `${pos}º ${nome} ${pts}pts${seta}`;
        });

        ticker.textContent = items.join('   •   ');
    }

    // ─── API pública ─────────────────────────────────────────────────
    window.MatchdayService = {
        get isActive() { return _isActive; },

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

        destroy() {
            // Chamado por Rodadas no SPA cleanup — apenas para polling de parciais
            // NÃO destruir o serviço inteiro (permanece entre navegações)
            clearInterval(_parciaisTimer);
            _parciaisTimer = null;
            // Se ainda ativo, reiniciar polling no próximo setContext
        },
    };

    // ─── Bootstrap ───────────────────────────────────────────────────
    // Iniciar polling de status imediatamente
    _checkStatus();

    if (window.Log) Log.info('[MatchdayService] Inicializado (FEAT-026 v1.0)');

})();
