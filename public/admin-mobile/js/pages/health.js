/**
 * Health Page - Dashboard de saude do sistema
 * Redesign v2 - Sem header duplicado, auto-refresh
 */

import API from '../api.js';
import { showLoading, showError } from '../app.js';

let refreshInterval = null;

export async function render(params = {}) {
  const container = document.getElementById('page-content');

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = 'Saude';
  if (subtitleEl) subtitleEl.textContent = 'Monitoramento do sistema';
  if (backBtn) backBtn.classList.remove('hidden');

  await loadHealthPage(container);

  // Auto-refresh a cada 30s
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => loadHealthPage(container, true), 30000);
}

export function destroy() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

async function loadHealthPage(container, silent = false) {
  if (!silent) showLoading(container);

  try {
    const data = await API.getHealth();
    renderHealthPage(container, data);
  } catch (error) {
    console.error('Erro ao carregar health:', error);
    if (!silent) showError(container, error.message || 'Erro ao carregar dashboard de saude.');
  }
}

function renderHealthPage(container, data) {
  const { healthScore, status, components, timestamp } = data;

  const scoreColor = status === 'healthy' ? 'var(--accent-success)' :
                     status === 'warning' ? 'var(--accent-warning)' : 'var(--accent-danger)';

  const statusLabel = status === 'healthy' ? 'Saudavel' :
                      status === 'warning' ? 'Atencao' : 'Critico';

  const statusBadge = status === 'healthy' ? 'badge-success' :
                      status === 'warning' ? 'badge-warning' : 'badge-danger';

  container.innerHTML = `
    <div class="container">
      <!-- Score Principal -->
      <div class="card" style="text-align:center;padding:24px;">
        <div style="position:relative;width:100px;height:100px;margin:0 auto 12px;">
          <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bg-tertiary)" stroke-width="10"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="${scoreColor}" stroke-width="10"
              stroke-dasharray="${Math.PI * 100}" stroke-dashoffset="${Math.PI * 100 * (1 - healthScore / 100)}"
              stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
            <span style="font-size:28px;font-weight:700;font-family:var(--font-mono);color:${scoreColor};">${healthScore}</span>
          </div>
        </div>
        <span class="badge ${statusBadge}" style="font-size:13px;padding:5px 14px;">${statusLabel}</span>
        ${timestamp ? `<p class="text-muted" style="font-size:11px;margin-top:8px;">Atualizado: ${new Date(timestamp).toLocaleString('pt-BR')}</p>` : ''}
      </div>

      <!-- Componentes -->
      <div class="section-header">Componentes</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${(components || []).map(comp => renderComponentCard(comp)).join('')}
      </div>
    </div>
  `;

  window.recarregarHealth = () => loadHealthPage(container);
}

function renderComponentCard(comp) {
  const statusColor = comp.status === 'healthy' ? 'var(--accent-success)' :
                      comp.status === 'warning' ? 'var(--accent-warning)' : 'var(--accent-danger)';

  return `
    <div class="card" style="padding:12px;margin-bottom:0;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="material-icons" style="font-size:22px;color:var(--text-muted);">${comp.icone || 'analytics'}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;"></span>
            <span style="font-size:13px;font-weight:600;">${comp.nome}</span>
          </div>
          <p class="text-muted" style="font-size:11px;margin:0;">${comp.detalhes}</p>
        </div>
        ${comp.valor ? `<span style="font-size:12px;font-weight:600;font-family:var(--font-mono);color:var(--text-muted);">${comp.valor}</span>` : ''}
      </div>
    </div>
  `;
}
