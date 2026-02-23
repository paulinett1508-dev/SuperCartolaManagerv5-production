/**
 * Checklist Pre-Rodada - Verificacao de prontidao do sistema
 * Agrega multiplas verificacoes em uma lista visual
 */

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

let refreshInterval = null;

export async function render(params = {}) {
  const container = document.getElementById('page-content');
  updateTopBar('Checklist', 'Prontidao pre-rodada');
  await loadPage(container);

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => loadPage(container, true), 60000);
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
    const data = await API.get('/checklist');
    renderPage(container, data);
  } catch (error) {
    console.error('Erro checklist:', error);
    if (!silent) showError(container, error.message || 'Erro ao gerar checklist.');
  }
}

function renderPage(container, data) {
  const { ready, score, checks = [] } = data;

  const okCount = checks.filter(c => c.status === 'ok').length;
  const total = checks.length;
  const pct = total > 0 ? Math.round((okCount / total) * 100) : 0;

  // Determine overall color
  const overallColor = ready ? 'var(--accent-success)' : (okCount >= total - 1 ? 'var(--accent-warning)' : 'var(--accent-danger)');
  const overallLabel = ready ? 'Pronto' : (okCount >= total - 1 ? 'Quase' : 'Atencao');
  const overallBg = ready ? 'rgba(34,197,94,0.08)' : (okCount >= total - 1 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)');

  container.innerHTML = `
    <div class="container">
      <!-- Readiness Score -->
      <div class="card" style="text-align:center;padding:24px;border:1px solid ${overallColor}20;background:linear-gradient(180deg, var(--bg-secondary), ${overallBg});">
        <div style="position:relative;width:88px;height:88px;margin:0 auto 12px;">
          <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bg-tertiary)" stroke-width="8"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="${overallColor}" stroke-width="8"
              stroke-dasharray="${Math.PI * 100}" stroke-dashoffset="${Math.PI * 100 * (1 - pct / 100)}"
              stroke-linecap="round" style="transition:stroke-dashoffset 0.6s ease;"/>
          </svg>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
            <span style="font-size:24px;font-weight:700;font-family:var(--font-mono);color:${overallColor};">${okCount}</span>
            <span style="font-size:14px;color:var(--text-muted);">/${total}</span>
          </div>
        </div>
        <span style="font-family:var(--font-russo);font-size:16px;color:${overallColor};">${overallLabel}</span>
        <p class="text-muted" style="font-size:11px;margin-top:4px;">para a rodada</p>
      </div>

      <!-- Checks List -->
      <div class="section-header">Verificacoes</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${checks.map((check, i) => renderCheckItem(check, i)).join('')}
      </div>

      <!-- Refresh Button -->
      <button class="btn btn-ghost btn-block" id="btn-recheck" style="margin-top:16px;">
        ${mi('refresh')} Verificar novamente
      </button>

      <p class="text-muted" style="font-size:11px;text-align:center;margin-top:8px;">
        Auto-refresh a cada 60s
      </p>
    </div>
  `;

  container.querySelector('#btn-recheck').addEventListener('click', () => loadPage(container));
}

function renderCheckItem(check, index) {
  const statusConfig = {
    ok: { icon: 'check_circle', color: 'var(--accent-success)', bg: 'rgba(34,197,94,0.10)' },
    warning: { icon: 'warning', color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.10)' },
    error: { icon: 'cancel', color: 'var(--accent-danger)', bg: 'rgba(239,68,68,0.10)' }
  };

  const s = statusConfig[check.status] || statusConfig.error;

  return `
    <div class="card" style="padding:14px;margin-bottom:0;animation:fadeSlideUp 0.3s ease ${index * 0.05}s both;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:40px;height:40px;border-radius:var(--radius-md);background:${s.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span class="material-icons" style="font-size:22px;color:${s.color};">${check.icon}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${check.label}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${check.description}</div>
        </div>
        <span class="material-icons" style="font-size:24px;color:${s.color};">${s.icon}</span>
      </div>
    </div>
  `;
}
