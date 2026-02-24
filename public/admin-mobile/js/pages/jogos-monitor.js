/**
 * Jogos Monitor - Status das APIs de jogos ao vivo
 * Mostra fallback chain, quotas e status em tempo real
 */

import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

let refreshInterval = null;

export async function render(params = {}) {
  const container = document.getElementById('page-content');
  updateTopBar('Jogos ao Vivo', 'Monitor de APIs');
  await loadPage(container);

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => loadPage(container, true), 30000);
}

export function destroy() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

function updateTopBar(title, subtitle) {
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle || '';
  if (backBtn) backBtn.classList.remove('hidden');
}

async function loadPage(container, silent = false) {
  if (!silent) showLoading(container);
  try {
    const resp = await fetch('/api/jogos-ao-vivo/status');
    const data = await resp.json();
    renderPage(container, data);
  } catch (error) {
    console.error('Erro jogos-monitor:', error);
    if (!silent) showError(container, error.message || 'Erro ao carregar status dos jogos.');
  }
}

function renderPage(container, data) {
  const fontes = data.fontes || {};
  const cacheGeral = data.cacheGeral || data.cache || {};
  const agenda = data.agenda || {};

  // API-Football details
  const apiFb = fontes['api-football'] || {};
  const quota = apiFb.quota || {};
  const quotaUsadas = quota.usadas ?? 0;
  const quotaLimite = quota.limite ?? 90;
  const quotaRestante = quota.restante ?? quotaLimite;
  const quotaPct = quotaLimite > 0 ? Math.round((quotaUsadas / quotaLimite) * 100) : 0;
  const circuitBreaker = quota.circuitBreaker || false;

  // Determine quota color
  const quotaColor = circuitBreaker ? 'var(--accent-danger)' :
    (quotaPct > 80 ? 'var(--accent-warning)' : 'var(--accent-success)');

  // Cache info
  const cacheIdade = cacheGeral.idadeMinutos ?? cacheGeral.idadeEmSegundos ? Math.round((cacheGeral.idadeEmSegundos || 0) / 60) : null;
  const cacheFonte = cacheGeral.fonte || cacheGeral.fonteAtual || 'N/A';
  const cacheJogos = cacheGeral.jogosEmCache ?? 0;
  const temAoVivo = cacheGeral.temJogosAoVivo ?? false;

  container.innerHTML = `
    <div class="container">
      <!-- Live Status Banner -->
      <div class="card" style="padding:16px;border:1px solid ${temAoVivo ? 'rgba(34,197,94,0.25)' : 'var(--border-color)'};background:${temAoVivo ? 'linear-gradient(135deg, var(--bg-secondary), rgba(34,197,94,0.04))' : 'var(--bg-secondary)'};">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:var(--radius-lg);background:${temAoVivo ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.10)'};display:flex;align-items:center;justify-content:center;">
            <span class="material-icons" style="font-size:26px;color:${temAoVivo ? 'var(--accent-success)' : 'var(--text-muted)'};">${temAoVivo ? 'live_tv' : 'tv_off'}</span>
          </div>
          <div style="flex:1;">
            <div style="font-family:var(--font-russo);font-size:16px;color:var(--text-primary);">${temAoVivo ? 'Jogos ao Vivo' : 'Sem Jogos ao Vivo'}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
              ${cacheJogos} jogo${cacheJogos !== 1 ? 's' : ''} em cache
              ${cacheFonte !== 'N/A' ? ` | Fonte: ${cacheFonte}` : ''}
            </div>
          </div>
          ${temAoVivo ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent-success);animation:pulse 2s infinite;"></span>` : ''}
        </div>
      </div>

      <!-- API-Football Quota -->
      <div class="section-header">API-Football Quota</div>
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <!-- Quota Bar -->
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;color:var(--text-primary);">Requisicoes Diarias</span>
          <span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:${quotaColor};">${quotaUsadas}/${quotaLimite}</span>
        </div>
        <div style="width:100%;height:8px;background:var(--bg-tertiary);border-radius:var(--radius-full);overflow:hidden;margin-bottom:12px;">
          <div style="height:100%;width:${quotaPct}%;background:${quotaColor};border-radius:var(--radius-full);transition:width 0.5s ease;"></div>
        </div>
        <!-- Stats Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          ${renderMiniStat('Restantes', quotaRestante, quotaColor)}
          ${renderMiniStat('Circuit Breaker', circuitBreaker ? 'ATIVO' : 'OK', circuitBreaker ? 'var(--accent-danger)' : 'var(--accent-success)')}
          ${renderMiniStat('Rate Limit', apiFb.protecoes?.rateLimitMinuto || '2/min', 'var(--text-secondary)')}
        </div>
      </div>

      <!-- Fallback Chain -->
      <div class="section-header">Cadeia de Fallback</div>
      <div style="display:flex;flex-direction:column;gap:0;position:relative;">
        ${renderFallbackChain(fontes)}
      </div>

      <!-- Cache Details -->
      <div class="section-header" style="margin-top:16px;">Cache</div>
      <div class="card" style="padding:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${renderMiniStat('Idade', cacheIdade != null ? `${cacheIdade} min` : 'N/A', 'var(--text-secondary)')}
          ${renderMiniStat('TTL', temAoVivo ? '30s' : '10min', 'var(--text-secondary)')}
          ${renderMiniStat('Fonte', cacheFonte, 'var(--accent-info)')}
          ${renderMiniStat('Stale', cacheGeral.stale ? 'Sim' : 'Nao', cacheGeral.stale ? 'var(--accent-warning)' : 'var(--accent-success)')}
        </div>
      </div>

      <!-- Refresh -->
      <button class="btn btn-ghost btn-block" id="btn-refresh-jogos" style="margin-top:16px;">
        ${mi('refresh')} Atualizar
      </button>
      <p class="text-muted" style="font-size:11px;text-align:center;margin-top:6px;">Auto-refresh 30s</p>
    </div>

    <style>
      @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    </style>
  `;

  container.querySelector('#btn-refresh-jogos').addEventListener('click', () => loadPage(container));
}

function renderMiniStat(label, value, color) {
  return `
    <div style="text-align:center;padding:8px 4px;">
      <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${color};margin-bottom:2px;">${value}</div>
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
    </div>
  `;
}

function renderFallbackChain(fontes) {
  const chain = [
    { key: 'soccerdata', label: 'SoccerDataAPI', icon: 'speed', tipo: 'Principal' },
    { key: 'api-football', label: 'API-Football', icon: 'sports_soccer', tipo: 'Secundaria' },
    { key: 'agenda-globo', label: 'Agenda Globo', icon: 'calendar_month', tipo: 'Paralelo' },
    { key: 'cache-stale', label: 'Cache Stale', icon: 'cached', tipo: 'Fallback' },
    { key: 'globo-json', label: 'Globo JSON', icon: 'cloud_download', tipo: 'Legado' },
  ];

  return chain.map((source, i) => {
    const config = fontes[source.key] || {};
    const isConfigured = config.configurado !== false;
    const isActive = config.tipo === 'PRINCIPAL' || config.habilitado !== false;
    const color = isConfigured ? (isActive ? 'var(--accent-success)' : 'var(--accent-info)') : 'var(--text-muted)';
    const isLast = i === chain.length - 1;

    return `
      <div style="display:flex;gap:14px;align-items:stretch;">
        <!-- Vertical Line + Dot -->
        <div style="display:flex;flex-direction:column;align-items:center;width:24px;flex-shrink:0;">
          <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid var(--bg-primary);z-index:1;flex-shrink:0;margin-top:16px;"></div>
          ${!isLast ? `<div style="width:2px;flex:1;background:var(--border-color);margin:-2px 0;"></div>` : ''}
        </div>
        <!-- Card -->
        <div class="card" style="flex:1;padding:12px 14px;margin-bottom:${isLast ? '0' : '0'};margin-top:0;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-icons" style="font-size:20px;color:${color};">${source.icon}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${source.label}</div>
              <div style="font-size:11px;color:var(--text-muted);">${source.tipo}</div>
            </div>
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-full);background:${isConfigured ? 'rgba(34,197,94,0.10)' : 'rgba(148,163,184,0.10)'};color:${color};">
              ${isConfigured ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
