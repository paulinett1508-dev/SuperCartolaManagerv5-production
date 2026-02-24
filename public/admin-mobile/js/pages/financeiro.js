/**
 * Financeiro Page - Acertos financeiros
 * Redesign v2 - Sem header duplicado, sem links externos, layout mobile-first
 */

import API from '../api.js';
import { showLoading, showError, showToast, showEmptyState } from '../app.js';

let ligaSelecionada = null;
let ligas = [];

export async function render(params = {}) {
  const container = document.getElementById('page-content');

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = 'Acertos';
  if (subtitleEl) subtitleEl.textContent = 'Pagamentos e recebimentos';
  if (backBtn) backBtn.classList.remove('hidden');

  if (params.ligaId) {
    ligaSelecionada = parseInt(params.ligaId);
  }

  await loadFinanceiroPage(container);
}

async function loadFinanceiroPage(container) {
  showLoading(container);

  try {
    const response = await API.getLigas();
    ligas = Array.isArray(response) ? response : (response.ligas || []);
    renderFinanceiroPage(container);
    if (ligaSelecionada) {
      await carregarAcertos(ligaSelecionada);
    }
  } catch (error) {
    console.error('Erro ao carregar financeiro:', error);
    showError(container, error.message || 'Erro ao carregar pagina.');
  }
}

function renderFinanceiroPage(container) {
  container.innerHTML = `
    <div class="container">
      <!-- Liga Selector -->
      <div class="card">
        <label class="form-label" style="font-size:13px;">Liga</label>
        <select id="fin-liga-select" class="form-input" style="font-size:14px;">
          <option value="">Selecione uma liga...</option>
          ${ligas.map(liga => `
            <option value="${liga.id}" ${ligaSelecionada === liga.id ? 'selected' : ''}>
              ${escapeHtml(liga.nome)} (${liga.temporada})
            </option>
          `).join('')}
        </select>
      </div>

      <!-- Resumo Financeiro -->
      <div id="resumo-financeiro" style="display:none;"></div>

      <!-- Formulario Novo Acerto -->
      <div id="form-acerto" style="display:none;">
        <div class="card">
          <h3 class="card-title" style="font-size:16px;margin-bottom:var(--spacing-md);">
            <span class="material-icons mi-inline">add_circle</span> Novo Acerto
          </h3>

          <div class="form-group">
            <label class="form-label" style="font-size:13px;">Participante</label>
            <select id="fin-time-select" class="form-input" style="font-size:14px;">
              <option value="">Selecione...</option>
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
              <label class="form-label" style="font-size:13px;">Tipo</label>
              <select id="fin-tipo-select" class="form-input" style="font-size:14px;">
                <option value="pagamento">Pagamento</option>
                <option value="recebimento">Recebimento</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:13px;">Valor (R$)</label>
              <input type="number" id="fin-valor-input" class="form-input" style="font-size:14px;"
                min="0.01" step="0.01" placeholder="0,00">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
              <label class="form-label" style="font-size:13px;">Metodo</label>
              <select id="fin-metodo-select" class="form-input" style="font-size:14px;">
                <option value="pix">PIX</option>
                <option value="transferencia">Transferencia</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:13px;">Descricao</label>
              <input type="text" id="fin-descricao-input" class="form-input" style="font-size:14px;"
                placeholder="Opcional">
            </div>
          </div>

          <button id="btn-registrar-acerto" class="btn btn-primary btn-block" onclick="window.registrarNovoAcerto()" disabled>
            <span class="material-icons mi-inline">savings</span> Registrar
          </button>
        </div>
      </div>

      <!-- Lista de Acertos -->
      <div id="acertos-lista"></div>
    </div>
  `;

  setupFinanceiroListeners();
}

function setupFinanceiroListeners() {
  const ligaSelect = document.getElementById('fin-liga-select');
  const timeSelect = document.getElementById('fin-time-select');
  const valorInput = document.getElementById('fin-valor-input');

  ligaSelect.addEventListener('change', async (e) => {
    ligaSelecionada = e.target.value ? parseInt(e.target.value) : null;
    if (ligaSelecionada) {
      document.getElementById('form-acerto').style.display = 'block';
      await carregarParticipantes(ligaSelecionada);
      await carregarAcertos(ligaSelecionada);
    } else {
      document.getElementById('form-acerto').style.display = 'none';
      document.getElementById('resumo-financeiro').style.display = 'none';
      document.getElementById('acertos-lista').innerHTML = '';
    }
  });

  timeSelect.addEventListener('change', validarFormAcerto);
  valorInput.addEventListener('input', validarFormAcerto);

  window.registrarNovoAcerto = registrarNovoAcerto;
}

function validarFormAcerto() {
  const timeId = document.getElementById('fin-time-select').value;
  const valor = parseFloat(document.getElementById('fin-valor-input').value);
  const btn = document.getElementById('btn-registrar-acerto');
  btn.disabled = !timeId || !valor || valor <= 0;
}

async function carregarParticipantes(ligaId) {
  try {
    const liga = await API.getLiga(ligaId);
    const timeSelect = document.getElementById('fin-time-select');

    if (liga.participantes && liga.participantes.length > 0) {
      const participantesAtivos = liga.participantes.filter(p => p.ativo);
      timeSelect.innerHTML = `
        <option value="">Selecione...</option>
        ${participantesAtivos.map(p => `
          <option value="${p.id}">${escapeHtml(p.nome)} - ${escapeHtml(p.nomeTime)}</option>
        `).join('')}
      `;
    } else {
      timeSelect.innerHTML = '<option value="">Nenhum participante</option>';
    }
  } catch (error) {
    console.error('Erro ao carregar participantes:', error);
  }
}

async function carregarAcertos(ligaId) {
  const listaContainer = document.getElementById('acertos-lista');
  const resumoContainer = document.getElementById('resumo-financeiro');

  try {
    const data = await API.getAcertos(ligaId);

    if (data.resumo) {
      resumoContainer.style.display = 'block';
      resumoContainer.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:var(--spacing-md);">
          <div class="card" style="padding:12px;text-align:center;margin-bottom:0;">
            <p class="text-muted" style="font-size:11px;margin:0;">
              <span class="material-icons" style="font-size:14px;vertical-align:-2px;color:var(--accent-success);">north_east</span> Pagamentos
            </p>
            <p class="text-success" style="font-size:18px;font-weight:700;margin:4px 0 0;font-family:var(--font-mono);">
              R$ ${data.resumo.totalPagamentos.toFixed(2)}
            </p>
          </div>
          <div class="card" style="padding:12px;text-align:center;margin-bottom:0;">
            <p class="text-muted" style="font-size:11px;margin:0;">
              <span class="material-icons" style="font-size:14px;vertical-align:-2px;color:var(--accent-warning);">south_west</span> Recebimentos
            </p>
            <p class="text-warning" style="font-size:18px;font-weight:700;margin:4px 0 0;font-family:var(--font-mono);">
              R$ ${data.resumo.totalRecebimentos.toFixed(2)}
            </p>
          </div>
        </div>
      `;
    }

    if (!data.acertos || data.acertos.length === 0) {
      listaContainer.innerHTML = `
        <div class="empty-state" style="margin-top:var(--spacing-lg);">
          <div class="empty-state-icon"><span class="material-icons mi-xl">receipt_long</span></div>
          <h3 class="empty-state-title">Nenhum acerto</h3>
          <p class="empty-state-text">Registre o primeiro acerto acima</p>
        </div>
      `;
      return;
    }

    listaContainer.innerHTML = `
      <div style="margin-top:var(--spacing-sm);">
        <div class="section-header">Historico (${data.acertos.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${data.acertos.map(acerto => renderAcertoItem(acerto)).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Erro ao carregar acertos:', error);
    listaContainer.innerHTML = `
      <div class="card">
        <p class="text-danger" style="margin:0;">Erro ao carregar acertos</p>
      </div>
    `;
  }
}

function renderAcertoItem(acerto) {
  const isPagamento = acerto.tipo === 'pagamento';
  const dataFormatada = new Date(acerto.dataAcerto || acerto.createdAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  return `
    <div class="card" style="padding:12px;margin-bottom:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge ${isPagamento ? 'badge-success' : 'badge-warning'}" style="font-size:10px;padding:2px 8px;">
            ${isPagamento ? 'Pag.' : 'Rec.'}
          </span>
          <span style="font-size:13px;font-weight:600;">${escapeHtml(acerto.nomeTime)}</span>
        </div>
        <span style="font-size:15px;font-weight:700;font-family:var(--font-mono);color:${isPagamento ? 'var(--accent-success)' : 'var(--accent-warning)'};">
          R$ ${acerto.valor.toFixed(2)}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="text-muted" style="font-size:11px;">${acerto.metodoPagamento || 'pix'}${acerto.descricao ? ' - ' + escapeHtml(acerto.descricao) : ''}</span>
        <span class="text-muted" style="font-size:11px;">${dataFormatada}</span>
      </div>
    </div>
  `;
}

async function registrarNovoAcerto() {
  const timeId = document.getElementById('fin-time-select').value;
  const tipo = document.getElementById('fin-tipo-select').value;
  const valor = parseFloat(document.getElementById('fin-valor-input').value);
  const metodoPagamento = document.getElementById('fin-metodo-select').value;
  const descricao = document.getElementById('fin-descricao-input').value;

  if (!ligaSelecionada || !timeId || !valor || valor <= 0) return;

  const btn = document.getElementById('btn-registrar-acerto');
  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    await API.registrarAcerto({ ligaId: ligaSelecionada, timeId, tipo, valor, descricao, metodoPagamento });
    showToast('Acerto registrado!', 'success');

    document.getElementById('fin-valor-input').value = '';
    document.getElementById('fin-descricao-input').value = '';
    document.getElementById('fin-time-select').value = '';

    await carregarAcertos(ligaSelecionada);
  } catch (error) {
    console.error('Erro ao registrar acerto:', error);
    showToast('Erro: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons mi-inline">savings</span> Registrar';
    validarFormAcerto();
  }
}
