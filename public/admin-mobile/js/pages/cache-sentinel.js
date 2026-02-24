/**
 * Cache Sentinel - Painel de controle de caches
 * Flush seletivo por camada com feedback visual
 */

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

export async function render(params = {}) {
  const container = document.getElementById('page-content');
  updateTopBar('Cache Sentinel', 'Controle de caches');
  await loadPage(container);
}

function updateTopBar(title, subtitle) {
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle || '';
  if (backBtn) backBtn.classList.remove('hidden');
}

async function loadPage(container) {
  showLoading(container);
  try {
    const data = await API.get('/cache/status');
    renderPage(container, data);
  } catch (error) {
    console.error('Erro cache-sentinel:', error);
    showError(container, error.message || 'Erro ao carregar status dos caches.');
  }
}

function renderPage(container, data) {
  const { layers = [] } = data;

  const statusColors = {
    cached: { color: 'var(--accent-success)', label: 'Em cache', bg: 'rgba(34,197,94,0.12)' },
    active: { color: 'var(--accent-info)', label: 'Ativo', bg: 'rgba(6,182,212,0.12)' },
    empty: { color: 'var(--text-muted)', label: 'Vazio', bg: 'rgba(148,163,184,0.12)' },
    unknown: { color: 'var(--accent-warning)', label: '?', bg: 'rgba(245,158,11,0.12)' }
  };

  container.innerHTML = `
    <div class="container">
      <!-- Flush All -->
      <div class="card" style="border:1px solid rgba(239,68,68,0.2);background:linear-gradient(135deg, var(--bg-secondary), rgba(239,68,68,0.04));">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:var(--radius-lg);background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;">
            ${mi('delete_sweep', '')}
          </div>
          <div style="flex:1;">
            <div style="font-family:var(--font-russo);font-size:15px;color:var(--text-primary);">Flush Geral</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Limpa TODAS as camadas de cache</div>
          </div>
          <button class="btn btn-danger btn-sm" id="btn-flush-all" style="white-space:nowrap;">
            ${mi('flash_on')} Flush
          </button>
        </div>
      </div>

      <!-- Cache Layers -->
      <div class="section-header" style="margin-top:8px;">Camadas de Cache</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${layers.map(layer => {
          const s = statusColors[layer.status] || statusColors.unknown;
          return `
            <div class="card cache-layer-card" style="padding:14px;margin-bottom:0;position:relative;overflow:hidden;" data-layer-id="${layer.id}">
              <div style="position:absolute;top:0;left:0;width:3px;height:100%;background:${s.color};border-radius:3px 0 0 3px;"></div>
              <div style="display:flex;align-items:center;gap:14px;padding-left:8px;">
                <div style="width:42px;height:42px;border-radius:var(--radius-md);background:${s.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span class="material-icons" style="font-size:22px;color:${s.color};">${layer.icon}</span>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:14px;font-weight:600;color:var(--text-primary);">${layer.label}</span>
                    <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-full);background:${s.bg};color:${s.color};text-transform:uppercase;letter-spacing:0.5px;">${s.label}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${layer.description}</div>
                </div>
                <button class="btn btn-ghost btn-sm btn-flush-single" data-target="${layer.id}" style="padding:8px 12px;min-height:36px;border-color:var(--border-color);">
                  ${mi('refresh')}
                </button>
              </div>
              <!-- Loading overlay -->
              <div class="flush-overlay" style="display:none;position:absolute;inset:0;background:rgba(15,23,42,0.85);display:none;align-items:center;justify-content:center;border-radius:var(--radius-lg);">
                <div class="spinner" style="width:24px;height:24px;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Timestamp -->
      <p class="text-muted" style="font-size:11px;text-align:center;margin-top:16px;">
        Atualizado: ${new Date(data.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </p>
    </div>
  `;

  // Bind events
  const flushAllBtn = container.querySelector('#btn-flush-all');
  flushAllBtn.addEventListener('click', () => flushTargets(container, layers.map(l => l.id)));

  container.querySelectorAll('.btn-flush-single').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.dataset.target;
      flushTargets(container, [target]);
    });
  });
}

async function flushTargets(container, targets) {
  // Show loading on targeted cards
  targets.forEach(t => {
    const card = container.querySelector(`[data-layer-id="${t}"]`);
    if (card) {
      const overlay = card.querySelector('.flush-overlay');
      if (overlay) overlay.style.display = 'flex';
    }
  });

  try {
    const result = await API.post('/cache/flush', { targets });

    if (result.success) {
      const successCount = result.results.filter(r => r.success).length;
      const failCount = result.results.filter(r => !r.success).length;

      if (failCount === 0) {
        showToast(`${successCount} cache${successCount > 1 ? 's' : ''} limpo${successCount > 1 ? 's' : ''}`, 'success');
      } else {
        showToast(`${successCount} ok, ${failCount} erro${failCount > 1 ? 's' : ''}`, 'warning');
      }
    }

    // Reload status
    await loadPage(container);
  } catch (error) {
    showToast(error.message || 'Erro ao limpar cache', 'error');
    // Hide overlays
    container.querySelectorAll('.flush-overlay').forEach(o => o.style.display = 'none');
  }
}
