/**
 * Dashboard Page - Torre de Controle Admin
 * Redesign v3 - Monitoramento + Acoes Rapidas
 *
 * Filosofia: O admin mobile responde 2 perguntas:
 * 1. "Ta tudo OK?" (status card)
 * 2. "Preciso fazer algo?" (alertas + acoes rapidas)
 */

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

const MARKET_LABELS = {
  1: 'Aberto', 2: 'Fechado', 3: 'Desbloqueado',
  4: 'Encerrado', 5: 'Futuro', 6: 'Temporada Encerrada',
};

let orchestratorData = null;

export async function render() {
  const container = document.getElementById('page-content');
  updateTopBar({ title: 'Super Cartola', subtitle: 'Torre de Controle', showBack: false });
  await loadDashboard(container);
  setupScrollToTop();
}

function updateTopBar({ title, subtitle, showBack }) {
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle || '';
  if (backBtn) backBtn.classList.toggle('hidden', !showBack);
}

async function loadDashboard(container) {
  showLoading(container);
  try {
    const [data, orchData] = await Promise.all([
      API.getDashboard(),
      fetchOrchestratorStatus(),
    ]);
    orchestratorData = orchData;
    renderDashboard(container, data);
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    showError(container, error.message || 'Erro ao carregar dashboard.');
  }
}

function renderDashboard(container, data) {
  const { healthScore, healthStatus, ligas } = data;

  const alerts = buildAlerts(ligas, orchestratorData);

  container.innerHTML = `
    <div class="container">

      ${renderStatusCard(healthScore, healthStatus)}

      ${alerts.length > 0 ? renderAlerts(alerts) : ''}

      <div class="section-header">Acoes Rapidas</div>
      ${renderQuickActions()}

    </div>
  `;
}

// ========== STATUS CARD ========== //
function renderStatusCard(healthScore, healthStatus) {
  const live = orchestratorData?.live || {};
  const statusNum = live.statusMercado;
  const statusLabel = live.statusMercadoLabel || MARKET_LABELS[statusNum] || 'Indisponivel';
  const rodada = live.rodadaAtual || '?';

  // Market dot color
  let marketDotColor = 'var(--text-muted)';
  let marketBadgeBg = 'var(--bg-tertiary)';
  let marketBadgeColor = 'var(--text-muted)';
  if (statusNum === 1) { marketDotColor = 'var(--accent-success)'; marketBadgeBg = 'rgba(34,197,94,0.15)'; marketBadgeColor = 'var(--accent-success)'; }
  else if (statusNum === 2) { marketDotColor = 'var(--accent-danger)'; marketBadgeBg = 'rgba(239,68,68,0.15)'; marketBadgeColor = 'var(--accent-danger)'; }
  else if (statusNum === 4) { marketDotColor = 'var(--accent-warning)'; marketBadgeBg = 'rgba(245,158,11,0.15)'; marketBadgeColor = 'var(--accent-warning)'; }

  // Health dot color
  let healthDotColor = 'var(--accent-success)';
  let healthLabel = 'Saudavel';
  if (healthStatus === 'warning') { healthDotColor = 'var(--accent-warning)'; healthLabel = 'Atencao'; }
  else if (healthStatus === 'critical') { healthDotColor = 'var(--accent-danger)'; healthLabel = 'Critico'; }

  // Orchestrator
  const orchAtivo = orchestratorData != null;
  const orchDotColor = orchAtivo ? 'var(--accent-success)' : 'var(--text-muted)';
  const orchLabel = orchAtivo ? 'Ativo' : 'Indisponivel';

  return `
    <div class="status-card" onclick="window.router.navigate('/orchestrator')" role="button" tabindex="0">
      <!-- Mercado -->
      <div class="status-card-row">
        <span class="status-card-dot" style="background:${marketDotColor};"></span>
        <span class="status-card-label">Mercado</span>
        <span class="status-card-badge" style="background:${marketBadgeBg};color:${marketBadgeColor};">${statusLabel}</span>
        <span class="status-card-value">R${rodada}</span>
      </div>
      <!-- Health -->
      <div class="status-card-row" onclick="event.stopPropagation();window.router.navigate('/health')" role="button">
        <span class="status-card-dot" style="background:${healthDotColor};"></span>
        <span class="status-card-label">Sistema</span>
        <span class="status-card-value" style="color:${healthDotColor};">${healthLabel}</span>
        <span class="status-card-value">${healthScore}/100</span>
      </div>
      <!-- Orchestrator -->
      <div class="status-card-row">
        <span class="status-card-dot" style="background:${orchDotColor};"></span>
        <span class="status-card-label">Orchestrator</span>
        <span class="status-card-value">${orchLabel}</span>
      </div>
    </div>
  `;
}

// ========== ALERTS ========== //
function buildAlerts(ligas, orchData) {
  const alerts = [];

  // Inadimplentes
  const totalInadimplentes = ligas.reduce((sum, l) => sum + (l.inadimplentes || 0), 0);
  if (totalInadimplentes > 0) {
    alerts.push({
      icon: 'warning',
      text: `${totalInadimplentes} inadimplente${totalInadimplentes > 1 ? 's' : ''} no total`,
      route: null,
    });
  }

  // Orchestrator em erro
  const orchLive = orchData?.live || {};
  if (orchLive.faseRodada === 'erro') {
    alerts.push({
      icon: 'error',
      text: 'Erro no orchestrator - verificar',
      route: '/orchestrator',
      danger: true,
    });
  }

  return alerts;
}

function renderAlerts(alerts) {
  const hasDanger = alerts.some(a => a.danger);
  return `
    <div class="alert-banner${hasDanger ? ' alert-banner--danger' : ''}">
      ${alerts.map(a => `
        <div class="alert-banner-item"${a.route ? ` onclick="window.router.navigate('${a.route}')"` : ''}>
          ${mi(a.icon)}
          <span>${a.text}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ========== QUICK ACTIONS ========== //
function renderQuickActions() {
  return `
    <div class="action-grid">
      <div class="action-card action-card--blue" onclick="window.router.navigate('/consolidacao')" role="button" tabindex="0">
        <div class="action-card-icon">${mi('sync')}</div>
        <div class="action-card-label">Consolidar</div>
      </div>
      <div class="action-card action-card--pink" onclick="window.router.navigate('/notificador')" role="button" tabindex="0">
        <div class="action-card-icon">${mi('notifications_active')}</div>
        <div class="action-card-label">Notificar</div>
      </div>
      <div class="action-card action-card--red" onclick="window.router.navigate('/manutencao')" role="button" tabindex="0">
        <div class="action-card-icon">${mi('build')}</div>
        <div class="action-card-label">Manutencao</div>
      </div>
      <div class="action-card action-card--orange" onclick="window.router.navigate('/auditoria')" role="button" tabindex="0">
        <div class="action-card-icon">${mi('fact_check')}</div>
        <div class="action-card-label">Auditoria</div>
      </div>
    </div>
  `;
}

// ========== ORCHESTRATOR FETCH ========== //
async function fetchOrchestratorStatus() {
  try {
    const resp = await fetch('/api/orchestrator/status');
    const data = await resp.json();
    return data.success ? data : null;
  } catch (err) {
    console.warn('Orchestrator status indisponivel:', err.message);
    return null;
  }
}

// ========== SCROLL TO TOP ========== //
function setupScrollToTop() {
  const btn = document.getElementById('btn-scroll-top');
  if (!btn) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        btn.classList.toggle('hidden', window.scrollY < 300);
        ticking = false;
      });
      ticking = true;
    }
  });
}
