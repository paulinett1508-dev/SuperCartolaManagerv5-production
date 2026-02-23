/**
 * Activity Logs - Feed de acoes recentes do admin
 * Timeline visual com filtros por tipo de acao
 */

import API from '../api.js';
import { showLoading, showError } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

const ACTION_CONFIG = {
  login:              { icon: 'login', color: 'var(--accent-info)', label: 'Login' },
  consolidacao_manual:{ icon: 'sync', color: 'var(--accent-primary)', label: 'Consolidacao' },
  cache_flush:        { icon: 'delete_sweep', color: 'var(--accent-warning)', label: 'Cache Flush' },
  force_app_update:   { icon: 'system_update', color: 'var(--accent-success)', label: 'Force Update' },
  modulo_toggle:      { icon: 'toggle_on', color: '#8b5cf6', label: 'Modulo Toggle' },
  manutencao_ativar:  { icon: 'build', color: 'var(--accent-danger)', label: 'Manutencao ON' },
  manutencao_desativar:{ icon: 'build', color: 'var(--accent-success)', label: 'Manutencao OFF' },
  notification_send:  { icon: 'notifications_active', color: '#ec4899', label: 'Notificacao' },
};

const DEFAULT_ACTION = { icon: 'event_note', color: 'var(--text-muted)', label: 'Acao' };

let currentOffset = 0;
let currentFilter = null;
let allLogs = [];

export async function render(params = {}) {
  const container = document.getElementById('page-content');
  updateTopBar('Logs', 'Atividade do admin');
  currentOffset = 0;
  currentFilter = null;
  allLogs = [];
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

async function loadPage(container, append = false) {
  if (!append) {
    showLoading(container);
    currentOffset = 0;
    allLogs = [];
  }

  try {
    const params = { limit: 30, offset: currentOffset };
    if (currentFilter) params.action = currentFilter;

    const data = await API.get('/logs', params);
    const { logs = [], total, hasMore } = data;

    if (append) {
      allLogs = [...allLogs, ...logs];
    } else {
      allLogs = logs;
    }

    renderPage(container, { logs: allLogs, total, hasMore });
  } catch (error) {
    console.error('Erro logs:', error);
    if (!append) showError(container, error.message || 'Erro ao carregar logs.');
  }
}

function renderPage(container, data) {
  const { logs = [], total = 0, hasMore = false } = data;

  // Unique actions for filter chips
  const actions = [...new Set(logs.map(l => l.action).filter(Boolean))];

  container.innerHTML = `
    <div class="container">
      <!-- Counter -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted);">${total} registros</span>
        <button class="btn btn-ghost btn-sm" id="btn-refresh-logs" style="padding:6px 10px;min-height:32px;">
          ${mi('refresh')}
        </button>
      </div>

      <!-- Filter Chips -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:2px;overflow-x:auto;">
        <button class="filter-chip ${!currentFilter ? 'active' : ''}" data-filter="">Todos</button>
        ${Object.entries(ACTION_CONFIG).map(([key, cfg]) => `
          <button class="filter-chip ${currentFilter === key ? 'active' : ''}" data-filter="${key}">
            ${cfg.label}
          </button>
        `).join('')}
      </div>

      <!-- Timeline -->
      <div class="logs-timeline" style="position:relative;">
        ${logs.length === 0 ? `
          <div style="text-align:center;padding:32px 16px;">
            <span class="material-icons" style="font-size:40px;color:var(--text-muted);margin-bottom:8px;">event_busy</span>
            <p style="color:var(--text-muted);font-size:14px;">Nenhum log encontrado</p>
          </div>
        ` : logs.map((log, i) => renderLogEntry(log, i)).join('')}
      </div>

      ${hasMore ? `
        <button class="btn btn-ghost btn-block" id="btn-load-more" style="margin-top:12px;">
          Carregar mais
        </button>
      ` : ''}
    </div>

    <style>
      .filter-chip {
        display:inline-flex;align-items:center;gap:4px;
        padding:5px 12px;border-radius:var(--radius-full);
        font-size:12px;font-weight:600;white-space:nowrap;
        background:var(--bg-tertiary);color:var(--text-muted);
        border:1px solid transparent;cursor:pointer;
        transition:all 0.15s;
      }
      .filter-chip:active { transform:scale(0.96); }
      .filter-chip.active {
        background:rgba(59,130,246,0.15);
        color:var(--accent-primary);
        border-color:rgba(59,130,246,0.3);
      }
      @keyframes fadeSlideUp {
        from { opacity:0; transform:translateY(8px); }
        to { opacity:1; transform:translateY(0); }
      }
    </style>
  `;

  // Bind events
  container.querySelector('#btn-refresh-logs').addEventListener('click', () => loadPage(container));

  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter || null;
      currentFilter = filter;
      currentOffset = 0;
      loadPage(container);
    });
  });

  const loadMoreBtn = container.querySelector('#btn-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      currentOffset += 30;
      loadPage(container, true);
    });
  }
}

function renderLogEntry(log, index) {
  const cfg = ACTION_CONFIG[log.action] || DEFAULT_ACTION;
  const ts = log.timestamp ? new Date(log.timestamp) : null;
  const timeStr = ts ? ts.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const email = log.email || '???';
  const shortEmail = email.split('@')[0];

  // Build detail string
  let detail = '';
  if (log.details) {
    if (log.action === 'cache_flush') {
      detail = `Targets: ${(log.details.targets || []).join(', ')}`;
    } else if (log.action === 'modulo_toggle') {
      detail = `${log.details.modulo}: ${log.details.ativo ? 'ON' : 'OFF'}`;
    } else if (log.action === 'force_app_update') {
      detail = `v${log.details.version} (${log.details.scope})`;
    } else if (log.action === 'consolidacao_manual') {
      detail = `Liga: ${log.details.ligaNome || log.details.ligaId || ''}`;
    } else if (typeof log.details === 'object') {
      const keys = Object.keys(log.details).slice(0, 2);
      detail = keys.map(k => `${k}: ${log.details[k]}`).join(', ');
    }
  }

  return `
    <div class="card" style="padding:12px 14px;margin-bottom:6px;animation:fadeSlideUp 0.25s ease ${Math.min(index, 10) * 0.03}s both;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:34px;height:34px;border-radius:var(--radius-md);background:${cfg.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
          <span class="material-icons" style="font-size:18px;color:${cfg.color};">${cfg.icon}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${cfg.label}</span>
            <span style="font-size:10px;padding:2px 6px;border-radius:var(--radius-full);background:${cfg.color}15;color:${cfg.color};">${log.result || ''}</span>
          </div>
          ${detail ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;">${detail}</div>` : ''}
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <span style="font-size:11px;color:var(--text-muted);">${shortEmail}</span>
            <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">${timeStr}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}
