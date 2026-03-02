/**
 * Consolidacao Page - Consolidacao manual de rodadas
 * Redesign v2 - Mobile-first, sem headers duplicados, sem links externos
 */
const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

import API from '../api.js';
import { showLoading, showError, showToast } from '../app.js';

let ligaSelecionada = null;
let rodadaSelecionada = null;
let consolidando = false;

export async function render(params = {}) {
  const container = document.getElementById('page-content');

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = 'Consolidacao';
  if (subtitleEl) subtitleEl.textContent = 'Consolidar rodadas';
  if (backBtn) backBtn.classList.remove('hidden');

  if (params.ligaId) {
    ligaSelecionada = parseInt(params.ligaId);
  }

  await loadConsolidacaoPage(container);
}

async function loadConsolidacaoPage(container) {
  showLoading(container);

  try {
    const response = await API.getLigas();
    const ligas = Array.isArray(response) ? response : (response.ligas || []);
    renderConsolidacaoPage(container, ligas);

    if (ligaSelecionada) {
      await carregarHistorico(ligaSelecionada);
    }
  } catch (error) {
    console.error('Erro ao carregar pagina de consolidacao:', error);
    showError(container, error.message || 'Erro ao carregar pagina.');
  }
}

function renderConsolidacaoPage(container, ligas) {
  container.innerHTML = `
    <div class="container">
      <!-- Formulario de Consolidacao -->
      <div class="card">
        <h3 class="card-title" style="font-size:16px;margin-bottom:var(--spacing-md);">
          <span class="material-icons mi-inline">sync</span> Nova Consolidacao
        </h3>

        <div class="form-group">
          <label class="form-label" style="font-size:13px;">Liga</label>
          <select id="liga-select" class="form-input" style="font-size:14px;">
            <option value="">Selecione uma liga...</option>
            ${ligas.map(liga => `
              <option value="${liga.id}" ${ligaSelecionada === liga.id ? 'selected' : ''}>
                ${escapeHtml(liga.nome)} (${liga.temporada})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" style="font-size:13px;">Rodada</label>
          <input type="number" id="rodada-input" class="form-input" style="font-size:14px;"
            min="1" max="38" placeholder="1-38" value="${rodadaSelecionada || ''}">
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--spacing-md);">
          <input type="checkbox" id="forcar-checkbox" style="width:20px;height:20px;">
          <label for="forcar-checkbox" style="font-size:13px;cursor:pointer;color:var(--text-secondary);">
            Forcar reconsolidacao
          </label>
        </div>

        <button id="btn-consolidar" class="btn btn-primary btn-block" onclick="window.consolidarRodadaManual()" disabled>
          <span class="material-icons mi-inline">sync</span> Consolidar
        </button>

        <div id="consolidacao-status" style="margin-top:var(--spacing-md);display:none;">
          <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-md);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div class="spinner" id="consolidacao-spinner" style="display:none;width:20px;height:20px;border-width:2px;"></div>
              <p id="status-text" class="text-muted" style="font-size:13px;margin:0;">Aguardando...</p>
            </div>
            <div class="progress-bar" style="display:none;" id="consolidacao-progress">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Historico -->
      <div id="historico-container"></div>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const ligaSelect = document.getElementById('liga-select');
  const rodadaInput = document.getElementById('rodada-input');

  ligaSelect.addEventListener('change', async (e) => {
    ligaSelecionada = e.target.value ? parseInt(e.target.value) : null;
    rodadaSelecionada = null;
    rodadaInput.value = '';
    validateForm();
    if (ligaSelecionada) {
      await carregarHistorico(ligaSelecionada);
    } else {
      document.getElementById('historico-container').innerHTML = '';
    }
  });

  rodadaInput.addEventListener('input', (e) => {
    rodadaSelecionada = e.target.value ? parseInt(e.target.value) : null;
    validateForm();
  });

  window.consolidarRodadaManual = consolidarRodadaManual;
}

function validateForm() {
  const btnConsolidar = document.getElementById('btn-consolidar');
  const isValid = ligaSelecionada && rodadaSelecionada && rodadaSelecionada >= 1 && rodadaSelecionada <= RODADA_FINAL_CAMPEONATO;
  btnConsolidar.disabled = !isValid || consolidando;
}

async function consolidarRodadaManual() {
  if (!ligaSelecionada || !rodadaSelecionada || consolidando) return;

  consolidando = true;
  validateForm();

  const forcar = document.getElementById('forcar-checkbox').checked;
  const statusContainer = document.getElementById('consolidacao-status');
  const statusText = document.getElementById('status-text');
  const spinner = document.getElementById('consolidacao-spinner');
  const progressBar = document.getElementById('consolidacao-progress');
  const progressFill = document.getElementById('progress-fill');

  statusContainer.style.display = 'block';
  spinner.style.display = 'block';
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';
  statusText.textContent = 'Iniciando consolidacao...';
  statusText.className = 'text-muted';

  try {
    progressFill.style.width = '10%';
    statusText.textContent = 'Validando dados...';

    const result = await API.consolidarRodada(ligaSelecionada, rodadaSelecionada, forcar);

    progressFill.style.width = '50%';
    statusText.textContent = 'Consolidando rodada...';
    await sleep(500);

    progressFill.style.width = '80%';
    statusText.textContent = 'Finalizando...';
    await sleep(300);

    progressFill.style.width = '100%';

    if (result.success) {
      if (result.jaConsolidada) {
        statusText.innerHTML = '<span class="material-icons mi-inline">check_circle</span> Rodada ja consolidada';
        statusText.className = 'text-warning';
        showToast('Rodada ja consolidada anteriormente', 'warning');
      } else {
        statusText.innerHTML = '<span class="material-icons mi-inline">check_circle</span> Consolidacao concluida!';
        statusText.className = 'text-success';
        showToast('Rodada consolidada com sucesso!', 'success');
      }

      await sleep(1000);
      await carregarHistorico(ligaSelecionada);

      document.getElementById('rodada-input').value = '';
      document.getElementById('forcar-checkbox').checked = false;
      rodadaSelecionada = null;
    } else {
      throw new Error(result.error || 'Erro desconhecido na consolidacao');
    }
  } catch (error) {
    console.error('Erro ao consolidar rodada:', error);
    progressFill.style.width = '100%';
    progressFill.style.background = 'var(--accent-danger)';
    statusText.innerHTML = '<span class="material-icons mi-inline">error</span> Erro: ' + error.message;
    statusText.className = 'text-danger';
    showToast('Erro ao consolidar: ' + error.message, 'error');
  } finally {
    consolidando = false;
    spinner.style.display = 'none';
    validateForm();

    setTimeout(() => {
      statusContainer.style.display = 'none';
      progressFill.style.width = '0%';
      progressFill.style.background = '';
    }, 5000);
  }
}

async function carregarHistorico(ligaId) {
  const historicoContainer = document.getElementById('historico-container');

  try {
    historicoContainer.innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div class="spinner"></div>
        <p class="text-muted" style="margin-top:12px;font-size:13px;">Carregando historico...</p>
      </div>
    `;

    const historico = await API.getConsolidacaoHistorico(ligaId);
    renderHistorico(historicoContainer, historico);
  } catch (error) {
    console.error('Erro ao carregar historico:', error);
    historicoContainer.innerHTML = `
      <div class="card">
        <p class="text-danger" style="margin:0;font-size:14px;">
          <span class="material-icons mi-inline">error</span> Erro ao carregar historico
        </p>
      </div>
    `;
  }
}

function renderHistorico(container, historico) {
  const { ligaNome, totalConsolidadas, rodadasPendentes, historico: items } = historico;

  if (totalConsolidadas === 0) {
    container.innerHTML = `
      <div class="empty-state" style="margin-top:var(--spacing-lg);">
        <div class="empty-state-icon"><span class="material-icons">assignment</span></div>
        <h3 class="empty-state-title">Nenhuma rodada consolidada</h3>
        <p class="empty-state-text">Consolide a primeira rodada acima</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="margin-top:var(--spacing-md);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--spacing-sm);">
        <span class="section-header" style="margin-bottom:0;">Historico - ${escapeHtml(ligaNome)}</span>
        <span class="badge badge-info" style="font-size:10px;">${totalConsolidadas}</span>
      </div>

      ${rodadasPendentes.length > 0 ? `
        <div class="alert-banner" style="margin-bottom:10px;">
          <div class="alert-banner-item">
            <span class="material-icons">warning</span>
            <span>${rodadasPendentes.length} pendente${rodadasPendentes.length > 1 ? 's' : ''}: ${rodadasPendentes.slice(0, 5).join(', ')}${rodadasPendentes.length > 5 ? '...' : ''}</span>
          </div>
        </div>
      ` : ''}

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map(item => renderHistoricoItem(item)).join('')}
      </div>
    </div>
  `;
}

function renderHistoricoItem(item) {
  const { rodada, dataConsolidacao, totalParticipantes, campeaoRodada, liderGeral, mito, mico } = item;

  const dataFormatada = new Date(dataConsolidacao).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  return `
    <div class="card" style="padding:12px;margin-bottom:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <h4 style="font-size:15px;font-weight:700;margin:0;font-family:var(--font-mono);">R${rodada}</h4>
        <span class="text-muted" style="font-size:11px;">${dataFormatada}</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${campeaoRodada ? `
          <div>
            <p class="text-muted" style="font-size:11px;margin:0;">Campeao</p>
            <p style="font-size:12px;font-weight:600;margin:2px 0 0 0;">${escapeHtml(campeaoRodada.nome)}</p>
            <p class="text-success" style="font-size:11px;font-weight:600;margin:0;font-family:var(--font-mono);">
              ${(Math.trunc((campeaoRodada.pontos||0) * 100) / 100).toFixed(2)} pts
            </p>
          </div>
        ` : '<div></div>'}
        ${liderGeral ? `
          <div>
            <p class="text-muted" style="font-size:11px;margin:0;">Lider</p>
            <p style="font-size:12px;font-weight:600;margin:2px 0 0 0;">${escapeHtml(liderGeral.nome)}</p>
            <p style="font-size:11px;font-weight:600;margin:0;font-family:var(--font-mono);color:var(--accent-primary);">
              ${(Math.trunc((liderGeral.pontos||0) * 100) / 100).toFixed(2)} pts
            </p>
          </div>
        ` : '<div></div>'}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-color);">
        <span class="text-muted" style="font-size:11px;">${totalParticipantes} part.</span>
        <div style="display:flex;gap:6px;">
          ${mito ? `<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">${escapeHtml(mito.nome_time || mito.nome)}</span>` : ''}
          ${mico ? `<span class="badge badge-danger" style="font-size:10px;padding:2px 6px;">${escapeHtml(mico.nome_time || mico.nome)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
