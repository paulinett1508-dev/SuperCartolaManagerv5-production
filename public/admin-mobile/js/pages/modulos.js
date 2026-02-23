/**
 * Toggle Modulos - Ligar/desligar modulos por liga
 * Toggle switches com feedback instantaneo
 */

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

let currentLigaId = null;

export async function render(params = {}) {
  const container = document.getElementById('page-content');
  updateTopBar('Modulos', 'Ativar / Desativar');
  await loadLigaSelector(container);
}

function updateTopBar(title, subtitle) {
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle || '';
  if (backBtn) backBtn.classList.remove('hidden');
}

async function loadLigaSelector(container) {
  showLoading(container);
  try {
    const data = await API.getLigas({ ativo: true });
    const ligas = data.ligas || data || [];

    if (ligas.length === 0) {
      showError(container, 'Nenhuma liga ativa encontrada.');
      return;
    }

    // If only 1 liga, go directly
    if (ligas.length === 1) {
      currentLigaId = ligas[0]._id || ligas[0].id;
      await loadModulos(container, currentLigaId);
      return;
    }

    // Show liga selector
    container.innerHTML = `
      <div class="container">
        <div class="section-header">Selecione a Liga</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${ligas.map(liga => {
            const id = liga._id || liga.id;
            return `
              <div class="card card-clickable" style="padding:16px;margin-bottom:0;cursor:pointer;" onclick="window._selectLiga('${id}')">
                <div style="display:flex;align-items:center;gap:14px;">
                  <div style="width:42px;height:42px;border-radius:var(--radius-md);background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;">
                    ${mi('groups', '')}
                  </div>
                  <div style="flex:1;">
                    <div style="font-size:15px;font-weight:600;color:var(--text-primary);">${liga.nome}</div>
                    <div style="font-size:12px;color:var(--text-muted);">Temporada ${liga.temporada || ''}</div>
                  </div>
                  <span class="material-icons" style="color:var(--text-muted);">chevron_right</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    window._selectLiga = async (ligaId) => {
      currentLigaId = ligaId;
      await loadModulos(container, ligaId);
    };
  } catch (error) {
    console.error('Erro modulos:', error);
    showError(container, error.message || 'Erro ao carregar ligas.');
  }
}

async function loadModulos(container, ligaId) {
  showLoading(container);
  try {
    const data = await API.get(`/modulos/${ligaId}`);
    renderModulos(container, data);
  } catch (error) {
    console.error('Erro modulos:', error);
    showError(container, error.message || 'Erro ao carregar modulos.');
  }
}

function renderModulos(container, data) {
  const { liga, modulos = [] } = data;
  const baseModules = modulos.filter(m => m.base);
  const optionalModules = modulos.filter(m => !m.base);

  container.innerHTML = `
    <div class="container">
      <!-- Liga Header -->
      <div class="card" style="padding:14px;margin-bottom:16px;border:1px solid var(--border-color);">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:var(--radius-md);background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;">
            ${mi('groups', '')}
          </div>
          <div style="flex:1;">
            <div style="font-family:var(--font-russo);font-size:15px;color:var(--text-primary);">${liga.nome}</div>
            <div style="font-size:12px;color:var(--text-muted);">${modulos.filter(m => m.ativo).length} de ${modulos.length} modulos ativos</div>
          </div>
        </div>
      </div>

      <!-- Base Modules (always on) -->
      <div class="section-header">Modulos Base</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
        ${baseModules.map(m => renderModuleRow(m, liga.id, true)).join('')}
      </div>

      <!-- Optional Modules (toggleable) -->
      <div class="section-header">Modulos Opcionais</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${optionalModules.map(m => renderModuleRow(m, liga.id, false)).join('')}
      </div>
    </div>
  `;
}

function renderModuleRow(mod, ligaId, isBase) {
  const activeColor = mod.ativo ? 'var(--accent-success)' : 'var(--text-muted)';
  const activeBg = mod.ativo ? 'rgba(34,197,94,0.10)' : 'rgba(148,163,184,0.08)';

  return `
    <div class="card" style="padding:12px 14px;margin-bottom:0;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;border-radius:var(--radius-md);background:${activeBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.2s;">
          <span class="material-icons" style="font-size:20px;color:${activeColor};transition:color 0.2s;">${mod.icon}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${mod.label}</span>
        </div>
        ${isBase ? `
          <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:var(--radius-full);background:rgba(59,130,246,0.12);color:var(--accent-primary);text-transform:uppercase;letter-spacing:0.5px;">Base</span>
        ` : `
          <label class="toggle-switch" style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;">
            <input type="checkbox" class="toggle-input" data-liga="${ligaId}" data-modulo="${mod.id}" ${mod.ativo ? 'checked' : ''}
              style="opacity:0;width:0;height:0;position:absolute;">
            <span class="toggle-slider" style="
              position:absolute;cursor:pointer;inset:0;
              background:${mod.ativo ? 'var(--accent-success)' : 'var(--bg-tertiary)'};
              border-radius:var(--radius-full);transition:background 0.25s;
            ">
              <span style="
                position:absolute;content:'';height:18px;width:18px;left:${mod.ativo ? '23px' : '3px'};bottom:3px;
                background:white;border-radius:50%;transition:left 0.25s;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);
              "></span>
            </span>
          </label>
        `}
      </div>
    </div>
  `;
}

// Event delegation for toggles
document.addEventListener('change', async (e) => {
  const input = e.target.closest('.toggle-input');
  if (!input) return;

  const ligaId = input.dataset.liga;
  const modulo = input.dataset.modulo;
  const ativo = input.checked;

  // Optimistic UI: update slider immediately
  const slider = input.nextElementSibling;
  const dot = slider?.querySelector('span');
  if (slider) slider.style.background = ativo ? 'var(--accent-success)' : 'var(--bg-tertiary)';
  if (dot) dot.style.left = ativo ? '23px' : '3px';

  try {
    await API.post(`/modulos/${ligaId}/${modulo}/toggle`, { ativo });
    showToast(`${modulo} ${ativo ? 'ativado' : 'desativado'}`, 'success');
  } catch (error) {
    // Revert on error
    input.checked = !ativo;
    if (slider) slider.style.background = !ativo ? 'var(--accent-success)' : 'var(--bg-tertiary)';
    if (dot) dot.style.left = !ativo ? '23px' : '3px';
    showToast(error.message || 'Erro ao alterar modulo', 'error');
  }
});
