/**
 * Force Update - Forcar atualizacao do app participante/admin
 * Gera nova versao que invalida cache de todos os clientes
 */

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

export async function render(params = {}) {
  const container = document.getElementById('page-content');
  updateTopBar('Force Update', 'Forcar atualizacao');
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
    const data = await API.get('/version-status');
    renderPage(container, data);
  } catch (error) {
    console.error('Erro force-update:', error);
    showError(container, error.message || 'Erro ao carregar versoes.');
  }
}

function renderPage(container, data) {
  const { participante, admin, override } = data;

  container.innerHTML = `
    <div class="container">
      <!-- Version Cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        ${renderVersionCard('App', participante, 'phone_iphone', '#22c55e')}
        ${renderVersionCard('Admin', admin, 'desktop_windows', '#3b82f6')}
      </div>

      ${override ? renderOverrideBanner(override) : ''}

      <!-- Force Update Actions -->
      <div class="section-header">Forcar Atualizacao</div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <!-- App Participante -->
        <div class="card" style="padding:16px;margin-bottom:0;border:1px solid rgba(34,197,94,0.15);">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:44px;height:44px;border-radius:var(--radius-lg);background:rgba(34,197,94,0.12);display:flex;align-items:center;justify-content:center;">
              <span class="material-icons" style="color:#22c55e;font-size:24px;">phone_iphone</span>
            </div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">App Participante</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Todos participantes recarregam o app</div>
            </div>
            <button class="btn btn-sm btn-force" data-scope="app" style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);padding:8px 14px;min-height:36px;">
              ${mi('system_update')} Forcar
            </button>
          </div>
        </div>

        <!-- Admin Panel -->
        <div class="card" style="padding:16px;margin-bottom:0;border:1px solid rgba(59,130,246,0.15);">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:44px;height:44px;border-radius:var(--radius-lg);background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;">
              <span class="material-icons" style="color:#3b82f6;font-size:24px;">desktop_windows</span>
            </div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Painel Admin</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Admins recarregam o painel</div>
            </div>
            <button class="btn btn-sm btn-force" data-scope="admin" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);padding:8px 14px;min-height:36px;">
              ${mi('system_update')} Forcar
            </button>
          </div>
        </div>

        <!-- All -->
        <div class="card" style="padding:16px;margin-bottom:0;border:1px solid rgba(245,158,11,0.2);background:linear-gradient(135deg, var(--bg-secondary), rgba(245,158,11,0.03));">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:44px;height:44px;border-radius:var(--radius-lg);background:rgba(245,158,11,0.12);display:flex;align-items:center;justify-content:center;">
              <span class="material-icons" style="color:#f59e0b;font-size:24px;">published_with_changes</span>
            </div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Todos os Clientes</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">App + Admin recarregam simultaneamente</div>
            </div>
            <button class="btn btn-sm btn-force" data-scope="all" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);padding:8px 14px;min-height:36px;">
              ${mi('system_update')} Forcar
            </button>
          </div>
        </div>
      </div>

      <!-- Info -->
      <div class="card" style="margin-top:16px;padding:14px;background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.15);">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <span class="material-icons" style="color:var(--accent-info);font-size:20px;margin-top:1px;">info</span>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Ao forcar, todos os clientes do escopo selecionado verao um modal de atualizacao obrigatoria na proxima abertura do app. O cache local sera limpo e a pagina recarregada.
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind force buttons
  container.querySelectorAll('.btn-force').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scope = btn.dataset.scope;
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;"></div>';

      try {
        const result = await API.post('/force-update', { scope });
        showToast(`Atualizacao forcada: v${result.version} (${scope})`, 'success');
        await loadPage(container);
      } catch (error) {
        showToast(error.message || 'Erro ao forcar atualizacao', 'error');
        btn.disabled = false;
        btn.innerHTML = `${mi('system_update')} Forcar`;
      }
    });
  });
}

function renderVersionCard(label, versionData, icon, color) {
  const version = versionData?.version || '---';
  const lastFile = versionData?.lastModifiedFile || '';
  const shortFile = lastFile ? lastFile.split('/').pop() : '';

  return `
    <div class="card" style="padding:14px;margin-bottom:0;text-align:center;">
      <span class="material-icons" style="font-size:28px;color:${color};margin-bottom:6px;">${icon}</span>
      <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${version}</div>
      <div style="font-size:11px;color:var(--text-muted);">${label}</div>
      ${shortFile ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${lastFile}">${shortFile}</div>` : ''}
    </div>
  `;
}

function renderOverrideBanner(override) {
  return `
    <div class="alert-banner" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);margin-bottom:16px;">
      <div class="alert-banner-item" style="cursor:default;">
        ${mi('warning')}
        <div>
          <span style="font-weight:600;">Override ativo:</span> v${override.version} (${override.scope})
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
            Por ${override.by} em ${new Date(override.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          </div>
        </div>
      </div>
    </div>
  `;
}
