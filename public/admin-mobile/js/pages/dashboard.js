/**
 * Dashboard Page - Torre de Controle Admin
 * Redesign v3 - Monitoramento + Acoes Rapidas
 *
 * Filosofia: O admin mobile responde 3 perguntas:
 * 1. "Ta tudo OK?" (status card)
 * 2. "Preciso fazer algo?" (alertas)
 * 3. "Como estao minhas ligas?" (liga cards)
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

      ${ligas.length > 0 ? `
        <div class="section-header">Suas Ligas</div>
        ${ligas.map(liga => renderLigaCard(liga)).join('')}
      ` : ''}

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

// ========== LIGA CARD ========== //
function renderLigaCard(liga) {
  const saldoFormatted = (liga.saldoTotal || 0).toFixed(2).replace('.', ',');
  const saldoColor = (liga.saldoTotal || 0) >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)';
  const inadimplentes = liga.inadimplentes || 0;

  return `
    <div class="liga-card" onclick="window.router.navigate('/ligas', { ligaId: '${liga.id}' })">
      <div class="liga-card-header">
        <div class="liga-card-name">
          ${mi('emoji_events', 'mi-sm')}
          <span>${liga.nome}</span>
        </div>
        ${inadimplentes > 0 ? `<span class="badge badge-warning" style="font-size:10px;padding:2px 8px;">${inadimplentes} inadimpl.</span>` : ''}
      </div>
      <div class="liga-card-stats">
        <span class="liga-card-stat">${mi('groups')} ${liga.participantesAtivos}/${liga.participantesTotais}</span>
        <span class="liga-card-stat">${mi('calendar_month')} R${liga.rodadaAtual}</span>
        <span class="liga-card-stat">${mi('date_range')} T${liga.temporada}</span>
      </div>
      <div class="liga-card-footer">
        <span class="liga-card-saldo" style="color:${saldoColor};">R$ ${saldoFormatted}</span>
        <span class="material-icons" style="color:var(--text-muted);font-size:18px;">chevron_right</span>
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
