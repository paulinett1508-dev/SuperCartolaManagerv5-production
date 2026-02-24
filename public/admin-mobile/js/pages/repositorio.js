/**
 * Repositorio Page - Gerenciamento de Branches
 * Painel mobile para limpeza de branches stale/orfas
 */

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

let branchesData = [];
let statsData = {};
let selectedBranches = new Set();

export async function render() {
  const container = document.getElementById('page-content');

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = 'Repositorio';
  if (subtitleEl) subtitleEl.textContent = 'Branches & Limpeza';
  if (backBtn) backBtn.classList.remove('hidden');

  selectedBranches.clear();
  await loadPage(container);
}

async function loadPage(container) {
  showLoading(container);
  try {
    const data = await API.getAnalyticsResumo();
    branchesData = data.branches || [];
    statsData = data.stats || {};
    renderPage(container, data);
  } catch (error) {
    console.error('Erro ao carregar repositorio:', error);
    showError(container, error.message || 'Erro ao carregar dados do repositorio.');
  }
}

// ========== MAIN RENDER ========== //
function renderPage(container, data) {
  const { stats, branches } = data;

  // Separar branches por categoria
  const stale = branches.filter(b => b.passivDeletacao);
  const orfas = branches.filter(b => b.orfa && !b.passivDeletacao);
  const ativas = branches.filter(b => !b.passivDeletacao && !b.orfa);

  container.innerHTML = `
    <div class="container">

      ${renderKPIs(stats)}

      ${stale.length > 0 ? `
        <div class="section-header">Limpeza Necessaria</div>
        <div id="stale-section">
          ${renderBranchList(stale, 'stale')}
        </div>
        <div id="batch-actions" style="margin-bottom:var(--spacing-md);${selectedBranches.size > 0 ? '' : 'display:none;'}">
          ${renderBatchActions()}
        </div>
      ` : `
        <div class="card" style="text-align:center;padding:24px;">
          ${mi('check_circle', 'mi-lg')}
          <p style="margin-top:8px;color:var(--text-muted);font-size:13px;">Nenhuma branch para limpar</p>
        </div>
      `}

      ${orfas.length > 0 ? `
        <div class="section-header">Orfas (sem PR)</div>
        ${renderBranchList(orfas, 'orfa')}
      ` : ''}

      ${ativas.length > 0 ? `
        <div class="section-header">Ativas</div>
        ${renderBranchList(ativas, 'ativa')}
      ` : ''}

    </div>

    <!-- Modal de confirmacao -->
    <div id="modal-confirm" class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Confirmar Exclusao</span>
          <button class="modal-close" onclick="window._repoCloseModal()">${mi('close')}</button>
        </div>
        <div class="modal-body" id="modal-confirm-body"></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" style="flex:1;" onclick="window._repoCloseModal()">Cancelar</button>
          <button class="btn btn-danger" style="flex:1;" id="btn-confirm-delete" onclick="window._repoConfirmDelete()">
            ${mi('delete')} Deletar
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind global handlers
  window._repoToggleBranch = toggleBranch;
  window._repoSelectAll = selectAllStale;
  window._repoDeleteSelected = deleteSelected;
  window._repoDeleteSingle = deleteSingle;
  window._repoCloseModal = closeModal;
  window._repoConfirmDelete = confirmDelete;
}

// ========== KPIs ========== //
function renderKPIs(stats) {
  const kpis = [
    { icon: 'account_tree', label: 'Branches', value: stats.totalBranches || 0, color: 'var(--accent-primary)' },
    { icon: 'merge_type', label: 'Mergeadas', value: stats.branchesMergeadas || 0, color: 'var(--accent-success)' },
    { icon: 'warning', label: 'Limpeza', value: stats.branchesPassivDeletacao || 0, color: 'var(--accent-danger)' },
    { icon: 'link_off', label: 'Orfas', value: stats.branchesOrfas || 0, color: 'var(--accent-warning)' },
  ];

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:var(--spacing-md);">
      ${kpis.map(k => `
        <div class="card" style="padding:14px;margin-bottom:0;text-align:center;">
          <span class="material-icons" style="font-size:22px;color:${k.color};display:block;margin-bottom:4px;">${k.icon}</span>
          <span style="font-size:24px;font-weight:700;font-family:var(--font-mono);color:var(--text-primary);display:block;">${k.value}</span>
          <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${k.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ========== BRANCH LIST ========== //
function renderBranchList(branches, tipo) {
  return branches.map(branch => {
    const nome = branch.nome;
    const isStale = tipo === 'stale';
    const diasDesatualizada = branch.diasDesatualizada || 0;
    const checked = selectedBranches.has(nome);

    // Badge de status
    let badge = '';
    if (branch.mergeada) {
      badge = '<span class="badge badge-success" style="font-size:10px;">Mergeada</span>';
    } else if (branch.passivDeletacao) {
      badge = '<span class="badge badge-danger" style="font-size:10px;">Stale</span>';
    } else if (branch.orfa) {
      badge = '<span class="badge badge-warning" style="font-size:10px;">Orfa</span>';
    }

    // Info PR
    let prInfo = '';
    if (branch.pr) {
      prInfo = `<span style="font-size:11px;color:var(--text-muted);">${mi('call_merge', 'mi-xs')} PR #${branch.pr.numero}</span>`;
    }

    return `
      <div class="card" style="padding:12px;margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          ${isStale ? `
            <label style="display:flex;align-items:center;padding-top:2px;cursor:pointer;">
              <input type="checkbox" ${checked ? 'checked' : ''}
                onchange="window._repoToggleBranch('${nome.replace(/'/g, "\\'")}')"
                style="width:20px;height:20px;accent-color:var(--accent-danger);cursor:pointer;">
            </label>
          ` : ''}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;color:var(--text-primary);word-break:break-all;">${nome}</span>
              ${badge}
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:6px;flex-wrap:wrap;">
              ${prInfo}
              <span style="font-size:11px;color:var(--text-muted);">${mi('commit', 'mi-xs')} ${branch.totalCommits || 0} commits</span>
              ${diasDesatualizada > 0 ? `<span style="font-size:11px;color:var(--accent-warning);">${mi('schedule', 'mi-xs')} ${diasDesatualizada}d</span>` : ''}
            </div>
          </div>
          ${isStale || tipo === 'orfa' ? `
            <button class="btn btn-sm btn-ghost" style="padding:8px;min-height:36px;"
              onclick="window._repoDeleteSingle('${nome.replace(/'/g, "\\'")}')">
              ${mi('delete')}
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ========== BATCH ACTIONS ========== //
function renderBatchActions() {
  return `
    <div style="display:flex;gap:8px;">
      <button class="btn btn-sm btn-ghost" style="flex:1;" onclick="window._repoSelectAll()">
        ${mi('select_all')} Selecionar Todas
      </button>
      <button class="btn btn-sm btn-danger" style="flex:1;" id="btn-delete-selected" onclick="window._repoDeleteSelected()">
        ${mi('delete_sweep')} Deletar (<span id="count-selected">${selectedBranches.size}</span>)
      </button>
    </div>
  `;
}

// ========== SELECTION HANDLERS ========== //
function toggleBranch(nome) {
  if (selectedBranches.has(nome)) {
    selectedBranches.delete(nome);
  } else {
    selectedBranches.add(nome);
  }
  updateBatchUI();
}

function selectAllStale() {
  const stale = branchesData.filter(b => b.passivDeletacao);
  const allSelected = stale.every(b => selectedBranches.has(b.nome));

  if (allSelected) {
    stale.forEach(b => selectedBranches.delete(b.nome));
  } else {
    stale.forEach(b => selectedBranches.add(b.nome));
  }

  // Re-render stale section checkboxes
  const staleSection = document.getElementById('stale-section');
  if (staleSection) {
    staleSection.innerHTML = renderBranchList(stale, 'stale');
  }
  updateBatchUI();
}

function updateBatchUI() {
  const batchActions = document.getElementById('batch-actions');
  const countEl = document.getElementById('count-selected');
  const btnDelete = document.getElementById('btn-delete-selected');

  if (batchActions) {
    batchActions.style.display = selectedBranches.size > 0 ? 'block' : 'none';
  }
  if (countEl) {
    countEl.textContent = selectedBranches.size;
  }
  if (btnDelete) {
    btnDelete.disabled = selectedBranches.size === 0;
  }
}

// ========== DELETE HANDLERS ========== //
let pendingDeleteBranches = [];

function deleteSingle(nome) {
  pendingDeleteBranches = [nome];
  openModal([nome]);
}

function deleteSelected() {
  if (selectedBranches.size === 0) return;
  pendingDeleteBranches = [...selectedBranches];
  openModal(pendingDeleteBranches);
}

function openModal(branches) {
  const body = document.getElementById('modal-confirm-body');
  const modal = document.getElementById('modal-confirm');

  body.innerHTML = `
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:12px;">
      Tem certeza que deseja deletar ${branches.length === 1 ? 'esta branch' : `estas ${branches.length} branches`}?
    </p>
    <div style="max-height:200px;overflow-y:auto;">
      ${branches.map(b => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);">
          <span class="material-icons" style="font-size:16px;color:var(--accent-danger);">delete</span>
          <span style="font-size:13px;color:var(--text-primary);word-break:break-all;">${b}</span>
        </div>
      `).join('')}
    </div>
    <p style="color:var(--accent-danger);font-size:12px;margin-top:12px;">
      ${mi('warning', 'mi-xs')} Esta acao e irreversivel. As branches serao removidas do GitHub.
    </p>
  `;

  modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('modal-confirm');
  modal.classList.remove('open');
  pendingDeleteBranches = [];
}

async function confirmDelete() {
  if (pendingDeleteBranches.length === 0) return;

  const btnConfirm = document.getElementById('btn-confirm-delete');
  btnConfirm.disabled = true;
  btnConfirm.innerHTML = `${mi('hourglass_empty')} Deletando...`;

  try {
    let result;
    if (pendingDeleteBranches.length === 1) {
      result = await API.deleteBranch(pendingDeleteBranches[0]);
      showToast(`Branch "${pendingDeleteBranches[0]}" deletada`, 'success');
    } else {
      result = await API.deleteBranchesBatch(pendingDeleteBranches);
      const deletadas = result.deletadas || 0;
      const falhas = result.falhas || 0;
      if (falhas > 0) {
        showToast(`${deletadas} deletada(s), ${falhas} falha(s)`, 'warning');
      } else {
        showToast(`${deletadas} branch(es) deletada(s)`, 'success');
      }
    }

    // Limpar selecao e recarregar
    selectedBranches.clear();
    closeModal();
    const container = document.getElementById('page-content');
    await loadPage(container);
  } catch (error) {
    console.error('Erro ao deletar branches:', error);
    showToast(error.message || 'Erro ao deletar', 'error');
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = `${mi('delete')} Deletar`;
  }
}
