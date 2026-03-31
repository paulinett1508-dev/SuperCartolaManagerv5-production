// eruda-debug.js v2.0
// Mobile DevTools + Debug Report para Claude Code
// Carrega: staging/localhost = sempre, prod = ?debug=true
// Uso: <script src="/js/eruda-debug.js"></script> antes de </body>

(function() {
  var isStaging = location.hostname.includes('staging') || location.hostname === 'localhost';
  var hasDebugFlag = new URLSearchParams(location.search).has('debug');
  if (!isStaging && !hasDebugFlag) return;

  // ═══════════════════════════════════════════
  // 1. CONSOLE INTERCEPTOR
  // ═══════════════════════════════════════════
  var _logs = [];
  var _origConsole = {};
  ['log','warn','error','info'].forEach(function(type) {
    _origConsole[type] = console[type];
    console[type] = function() {
      var args = Array.prototype.slice.call(arguments);
      _logs.push({
        type: type,
        time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        msg: args.map(function(a) {
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); } }
          return String(a);
        }).join(' ')
      });
      _origConsole[type].apply(console, arguments);
    };
  });

  // ═══════════════════════════════════════════
  // 2. ERROR HANDLERS
  // ═══════════════════════════════════════════
  window.addEventListener('error', function(e) {
    _logs.push({ type: 'error', time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), msg: (e.error && e.error.stack) || e.message || 'Unknown error' });
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    _logs.push({ type: 'error', time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), msg: (reason && reason.stack) || String(reason) || 'Unhandled promise rejection' });
  });
  // Resource load failures (img, script, link)
  window.addEventListener('error', function(e) {
    var t = e.target;
    if (t && t !== window && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
      _logs.push({ type: 'warn', time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), msg: '[Resource] Failed to load ' + t.tagName + ': ' + (t.src || t.href || 'unknown') });
    }
  }, true);

  // ═══════════════════════════════════════════
  // 3. FETCH INTERCEPTOR
  // ═══════════════════════════════════════════
  var _networkLog = [];
  var _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    var startTs = Date.now();
    var method = (opts && opts.method) || 'GET';
    var urlStr = typeof url === 'string' ? url : (url && url.url) || String(url);
    if (urlStr.includes('cdn.jsdelivr.net')) return _origFetch.apply(this, arguments);
    return _origFetch.apply(this, arguments).then(function(response) {
      var entry = {
        time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        method: method,
        url: urlStr.length > 80 ? urlStr.substring(0, 77) + '...' : urlStr,
        status: response.status,
        ms: Date.now() - startTs,
        ok: response.ok
      };
      _networkLog.push(entry);
      if (_networkLog.length > 50) _networkLog.shift();
      if (!response.ok) {
        _logs.push({ type: 'warn', time: entry.time, msg: '[Network] ' + method + ' ' + urlStr + ' \u2192 ' + response.status + ' (' + entry.ms + 'ms)' });
      }
      return response;
    }).catch(function(err) {
      var entry = {
        time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        method: method,
        url: urlStr.length > 80 ? urlStr.substring(0, 77) + '...' : urlStr,
        status: 'FAIL',
        ms: Date.now() - startTs,
        ok: false
      };
      _networkLog.push(entry);
      if (_networkLog.length > 50) _networkLog.shift();
      _logs.push({ type: 'error', time: entry.time, msg: '[Network] ' + method + ' ' + urlStr + ' \u2192 FAILED: ' + (err.message || err) });
      throw err;
    });
  };

  // ═══════════════════════════════════════════
  // 4. APP CONTEXT COLLECTOR
  // ═══════════════════════════════════════════
  function getAppContext() {
    var ctx = {};
    try {
      // Detectar se é admin ou participante
      var isAdmin = !!window.adminSession || location.pathname.includes('detalhe-liga') || location.pathname.includes('painel') || location.pathname.includes('gerenciar');
      ctx.ambiente = isAdmin ? 'Admin' : 'Participante';

      // Contexto do participante
      var auth = window.participanteAuth;
      if (auth) {
        ctx.ligaId = auth.ligaId || '?';
        ctx.ligaNome = auth.ligaNome || '?';
        ctx.timeId = auth.timeId || '?';
        ctx.timeNome = auth.timeNome || auth.nomeTime || '?';
        ctx.temporada = auth.temporada || '?';
        ctx.premium = auth._isPremium || false;
      }

      // Contexto do admin
      if (isAdmin) {
        var ligaEl = document.querySelector('[data-liga-id]');
        if (ligaEl) ctx.ligaId = ligaEl.dataset.ligaId;
        var tituloEl = document.querySelector('.liga-titulo, .nome-liga, h1');
        if (tituloEl) ctx.ligaNome = tituloEl.textContent.trim().substring(0, 50);
      }

      // Navegação SPA
      var nav = window.participanteNav;
      if (nav) ctx.moduloAtual = nav.moduloAtual || '?';

      // Mercado
      var qb = window.quickAccessBar || window.QuickBar;
      if (qb) ctx.mercadoAberto = qb.mercadoAberto || false;

      ctx.online = navigator.onLine;
      ctx.sw = ('serviceWorker' in navigator) ? 'sim' : 'nao';
      ctx.pathname = location.pathname;
    } catch(e) { ctx.erro = e.message; }
    return ctx;
  }

  // ═══════════════════════════════════════════
  // 5. BUILD REPORT (Markdown)
  // ═══════════════════════════════════════════
  function buildReport() {
    var now = new Date();
    var ua = navigator.userAgent;
    var device = /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /iPad/.test(ua) ? 'iPad' : 'Desktop';
    var browser = /Chrome\/([\d.]+)/.test(ua) ? 'Chrome ' + RegExp.$1 : /Safari\/([\d.]+)/.test(ua) ? 'Safari' : /Firefox\/([\d.]+)/.test(ua) ? 'Firefox ' + RegExp.$1 : 'Unknown';
    var ctx = getAppContext();
    var errors = _logs.filter(function(l) { return l.type === 'error'; });
    var warnings = _logs.filter(function(l) { return l.type === 'warn'; });
    var infos = _logs.filter(function(l) { return l.type === 'log' || l.type === 'info'; });
    var failedReqs = _networkLog.filter(function(n) { return !n.ok; });

    var lines = [];
    lines.push('## Debug Report \u2014 Super Cartola Manager');
    lines.push('');

    lines.push('### Contexto');
    lines.push('| Campo | Valor |');
    lines.push('|-------|-------|');
    lines.push('| Ambiente | ' + (ctx.ambiente || '?') + ' |');
    lines.push('| URL | ' + location.href + ' |');
    lines.push('| Pathname | ' + ctx.pathname + ' |');
    lines.push('| Data | ' + now.toLocaleString('pt-BR') + ' |');
    lines.push('| Device | ' + device + ' / ' + browser + ' |');
    lines.push('| Viewport | ' + window.innerWidth + 'x' + window.innerHeight + ' |');
    lines.push('| Online | ' + (ctx.online ? 'Sim' : 'NAO') + ' |');
    lines.push('| Service Worker | ' + ctx.sw + ' |');
    if (ctx.ligaId) {
      lines.push('| Liga | ' + (ctx.ligaNome || '?') + ' (ID: ' + ctx.ligaId + ') |');
    }
    if (ctx.timeId) {
      lines.push('| Time | ' + (ctx.timeNome || '?') + ' (ID: ' + ctx.timeId + ') |');
    }
    if (ctx.temporada) lines.push('| Temporada | ' + ctx.temporada + ' |');
    if (ctx.premium !== undefined) lines.push('| Premium | ' + (ctx.premium ? 'Sim' : 'Nao') + ' |');
    if (ctx.moduloAtual) lines.push('| Modulo Atual | ' + ctx.moduloAtual + ' |');
    if (ctx.mercadoAberto !== undefined) lines.push('| Mercado | ' + (ctx.mercadoAberto ? 'ABERTO' : 'Fechado') + ' |');
    lines.push('');

    if (failedReqs.length) {
      lines.push('### Network Errors (' + failedReqs.length + ')');
      lines.push('```');
      failedReqs.forEach(function(n) { lines.push('[' + n.time + '] ' + n.method + ' ' + n.url + ' -> ' + n.status + ' (' + n.ms + 'ms)'); });
      lines.push('```');
      lines.push('');
    }

    if (_networkLog.length) {
      lines.push('### Network Log (ultimos ' + Math.min(_networkLog.length, 20) + ')');
      lines.push('```');
      _networkLog.slice(-20).forEach(function(n) { lines.push('[' + n.time + '] ' + n.method + ' ' + n.url + ' -> ' + n.status + ' (' + n.ms + 'ms)'); });
      lines.push('```');
      lines.push('');
    }

    if (errors.length) { lines.push('### Errors (' + errors.length + ')'); lines.push('```'); errors.forEach(function(l) { lines.push('[' + l.time + '] ' + l.msg); }); lines.push('```'); lines.push(''); }
    if (warnings.length) { lines.push('### Warnings (' + warnings.length + ')'); lines.push('```'); warnings.forEach(function(l) { lines.push('[' + l.time + '] ' + l.msg); }); lines.push('```'); lines.push(''); }
    if (infos.length) { lines.push('### Console Logs (' + infos.length + ')'); lines.push('```'); infos.slice(-30).forEach(function(l) { lines.push('[' + l.time + '] ' + l.msg); }); if (infos.length > 30) lines.push('... (' + (infos.length - 30) + ' anteriores omitidos)'); lines.push('```'); }

    if (!errors.length && !warnings.length && !infos.length && !failedReqs.length) { lines.push('_Nenhum log capturado._'); }

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════
  // 6. FLOATING COPY BUTTON
  // ═══════════════════════════════════════════
  function criarBotaoFlutuante() {
    var fab = document.createElement('button');
    fab.id = 'eruda-fab-copy';
    fab.innerHTML = '<span style="font-size:18px;">&#128203;</span>';
    fab.title = 'Copiar Debug Report';
    fab.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483646;width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,85,0,0.6);background:rgba(20,20,20,0.92);color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,0.5);backdrop-filter:blur(8px);transition:transform 0.15s,background 0.2s;-webkit-tap-highlight-color:transparent;';

    fab.addEventListener('touchstart', function() { fab.style.transform = 'scale(0.9)'; }, {passive:true});
    fab.addEventListener('touchend', function() { fab.style.transform = 'scale(1)'; }, {passive:true});

    fab.addEventListener('click', function() {
      var report = buildReport();
      navigator.clipboard.writeText(report).then(function() {
        fab.innerHTML = '<span style="font-size:18px;color:#22C55E;">&#10003;</span>';
        fab.style.borderColor = '#22C55E';
        setTimeout(function() {
          fab.innerHTML = '<span style="font-size:18px;">&#128203;</span>';
          fab.style.borderColor = 'rgba(255,85,0,0.6)';
        }, 1500);
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = report;
        ta.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;font-size:10px;background:#111;color:#ccc;padding:12px;border:none;';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = 'Fechar (selecione tudo e copie)';
        closeBtn.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 24px;background:#E10600;color:#fff;border:none;border-radius:8px;font-weight:700;';
        closeBtn.addEventListener('click', function() { ta.remove(); closeBtn.remove(); });
        document.body.appendChild(ta);
        document.body.appendChild(closeBtn);
        ta.select();
      });
    });

    document.body.appendChild(fab);
  }

  // ═══════════════════════════════════════════
  // 7. INIT ERUDA + PLUGINS
  // ═══════════════════════════════════════════
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda';
  s.onload = function() {
    eruda.init();
    eruda.add({
      name: 'Report',
      init: function($el) {
        this._$el = $el;
        $el.html(
          '<div style="padding:16px;">' +
          '<h2 style="color:#fff;font-size:16px;margin:0 0 4px;">Debug Report</h2>' +
          '<p style="color:#999;font-size:11px;margin:0 0 12px;">Markdown para colar no Claude Code</p>' +
          '<button id="eruda-copy-report" style="width:100%;padding:12px;border:none;border-radius:8px;background:#E10600;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Copiar Relat\u00f3rio Completo</button>' +
          '<div style="margin-top:12px;display:flex;gap:8px;">' +
            '<button id="eruda-copy-errors" style="flex:1;padding:8px;border:1px solid #444;border-radius:6px;background:#1a1a1a;color:#ef4444;font-size:11px;cursor:pointer;">S\u00f3 Errors</button>' +
            '<button id="eruda-copy-network" style="flex:1;padding:8px;border:1px solid #444;border-radius:6px;background:#1a1a1a;color:#f59e0b;font-size:11px;cursor:pointer;">S\u00f3 Network</button>' +
            '<button id="eruda-copy-context" style="flex:1;padding:8px;border:1px solid #444;border-radius:6px;background:#1a1a1a;color:#3b82f6;font-size:11px;cursor:pointer;">S\u00f3 Contexto</button>' +
          '</div>' +
          '<div id="eruda-report-stats" style="margin-top:12px;padding:8px;background:#1a1a1a;border-radius:6px;font-size:11px;color:#888;"></div>' +
          '<pre id="eruda-report-preview" style="margin-top:8px;padding:12px;background:#111;border-radius:8px;color:#ccc;font-size:9px;white-space:pre-wrap;word-break:break-all;max-height:250px;overflow:auto;display:none;"></pre>' +
          '</div>'
        );

        // Buscar elementos dentro do container do plugin Eruda (não document global)
        var container = $el.get ? $el.get(0) : ($el[0] || null);
        function qsel(id) {
          if (container && container.querySelector) return container.querySelector('#' + id);
          return document.getElementById(id);
        }
        var btnReport = qsel('eruda-copy-report');
        var btnErrors = qsel('eruda-copy-errors');
        var btnNetwork = qsel('eruda-copy-network');
        var btnContext = qsel('eruda-copy-context');
        var elStats = qsel('eruda-report-stats');
        var elPreview = qsel('eruda-report-preview');

        function copyAndFeedback(btn, text) {
          navigator.clipboard.writeText(text).then(function() {
            var orig = btn.textContent;
            btn.textContent = '\u2713 Copiado!'; btn.style.borderColor = '#22C55E';
            setTimeout(function() { btn.textContent = orig; btn.style.borderColor = '#444'; }, 1500);
          }).catch(function() { alert('Falha ao copiar. Use o bot\u00e3o flutuante.'); });
        }

        function updateStats() {
          if (!elStats) return;
          var errs = _logs.filter(function(l) { return l.type === 'error'; }).length;
          var warns = _logs.filter(function(l) { return l.type === 'warn'; }).length;
          var netFails = _networkLog.filter(function(n) { return !n.ok; }).length;
          elStats.innerHTML = '<span style="color:#ef4444;">' + errs + ' errors</span> \u00b7 <span style="color:#f59e0b;">' + warns + ' warns</span> \u00b7 <span style="color:#3b82f6;">' + _networkLog.length + ' requests (' + netFails + ' failed)</span> \u00b7 <span>' + _logs.length + ' logs</span>';
        }
        setInterval(updateStats, 2000);
        updateStats();

        if (btnReport) btnReport.addEventListener('click', function() {
          var report = buildReport();
          if (elPreview) { elPreview.textContent = report; elPreview.style.display = 'block'; }
          copyAndFeedback(this, report);
        });
        if (btnErrors) btnErrors.addEventListener('click', function() {
          var errs = _logs.filter(function(l) { return l.type === 'error'; });
          copyAndFeedback(this, errs.length ? errs.map(function(l) { return '[' + l.time + '] ' + l.msg; }).join('\n') : 'Nenhum erro.');
        });
        if (btnNetwork) btnNetwork.addEventListener('click', function() {
          copyAndFeedback(this, _networkLog.length ? _networkLog.map(function(n) { return '[' + n.time + '] ' + n.method + ' ' + n.url + ' -> ' + n.status + ' (' + n.ms + 'ms)'; }).join('\n') : 'Nenhum request.');
        });
        if (btnContext) btnContext.addEventListener('click', function() {
          var ctx = getAppContext();
          copyAndFeedback(this, Object.keys(ctx).map(function(k) { return k + ': ' + ctx[k]; }).join('\n'));
        });
      },
      show: function() { this._$el.show(); },
      hide: function() { this._$el.hide(); },
      destroy: function() {}
    });

    criarBotaoFlutuante();
  };
  document.body.appendChild(s);
})();
