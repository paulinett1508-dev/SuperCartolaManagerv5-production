/**
 * Orchestrator Page - Monitoramento do Round-Market Orchestrator
 * Redesign v2 - Modal em vez de prompt(), cleanup visual
 */

import { showLoading, showError, showToast } from '../app.js';

const MARKET_LABELS = {
  1: 'ABERTO', 2: 'FECHADO', 3: 'DESBLOQUEADO',
  4: 'ENCERRADO', 5: 'FUTURO', 6: 'TEMPORADA ENCERRADA',
};

const FASES = [
  { id: 'aguardando', label: 'Ocioso', materialIcon: 'hourglass_empty' },
  { id: 'coletando_dados', label: 'Coletando', materialIcon: 'download' },
  { id: 'atualizando_live', label: 'Live', materialIcon: 'sensors' },
  { id: 'finalizando', label: 'Finalizando', materialIcon: 'flag' },
  { id: 'consolidando', label: 'Consolidando', materialIcon: 'bar_chart' },
  { id: 'concluida', label: 'Concluida', materialIcon: 'check_circle' },
];

let eventSource = null;
let refreshInterval = null;

export async function render() {
  const container = document.getElementById('page-content');

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const backBtn = document.getElementById('btn-back');
  if (titleEl) titleEl.textContent = 'Orchestrator';
  if (subtitleEl) subtitleEl.textContent = 'Monitoramento';
  if (backBtn) backBtn.classList.remove('hidden');

  showLoading(container);
  await loadOrchestrator(container);

  conectarSSE(container);
  refreshInterval = setInterval(() => loadOrchestrator(container, true), 60000);
}

export function destroy() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

async function loadOrchestrator(container, silent = false) {
  try {
    const resp = await fetch('/api/orchestrator/status');
    const data = await resp.json();
    if (data.success) {
      renderPage(container, data);
    } else {
      if (!silent) showError(container, 'Orchestrator indisponivel');
    }
  } catch (err) {
    console.error('Erro ao carregar orchestrator:', err);
    if (!silent) showError(container, 'Erro ao conectar ao orchestrator');
  }
}

function conectarSSE(container) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/orchestrator/stream');

  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.tipo === 'transicao' || msg.tipo === 'mercado_abriu' || msg.tipo === 'mercado_fechou') {
        loadOrchestrator(container, true);
        showToast('Status atualizado!', 'info');
      }
    } catch (e) { /* ignore */ }
  };

  eventSource.onerror = () => {
    setTimeout(() => conectarSSE(container), 5000);
  };
}

function renderPage(container, data) {
  const live = data.live || {};
  const db = data.persistido || {};
  const statusNum = live.statusMercado;
  const statusLabel = live.statusMercadoLabel || MARKET_LABELS[statusNum] || 'DESCONHECIDO';
  const faseAtual = live.faseRodada || 'aguardando';
  const eventos = (db.eventos || []).slice().reverse().slice(0, 15);

  const semaforo = getSemaforoConfig(statusNum);
  const acao = getAcaoStatus(live);

  const ultimaConsolidacao = db.ultima_consolidacao
    ? tempoRelativo(new Date(db.ultima_consolidacao))
    : 'Nunca';

  container.innerHTML = `
    <div class="container" style="padding-bottom:20px;">

      <!-- Semaforo -->
      <div class="card" style="text-align:center;padding:var(--spacing-lg);">
        <div style="
          width:64px;height:64px;border-radius:50%;
          background:${semaforo.cor};box-shadow:0 0 20px ${semaforo.sombra};
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 12px;font-size:28px;
          ${statusNum === 2 ? 'animation:pulse-glow 2s infinite;' : ''}
        ">${semaforo.icon}</div>
        <h2 style="font-family:var(--font-russo);font-size:20px;margin:0;">
          Mercado ${statusLabel}
        </h2>
        <p style="color:var(--text-muted);font-size:13px;margin-top:4px;">
          Rodada <span style="font-family:var(--font-mono);color:var(--accent-primary);">${live.rodadaAtual || '?'}</span>
          &middot; T<span style="font-family:var(--font-mono);color:var(--accent-primary);">${live.temporada || '?'}</span>
        </p>
      </div>

      <!-- Acao -->
      <div class="card" style="border-left:4px solid ${acao.cor};display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">${acao.icon}</span>
        <div>
          <div style="font-weight:600;font-size:14px;color:${acao.cor};">${acao.titulo}</div>
          <div style="color:var(--text-muted);font-size:12px;">${acao.descricao}</div>
        </div>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:var(--spacing-md);">
        ${renderStat(db.total_consolidacoes || 0, 'Consolid.')}
        ${renderStat(db.total_transicoes || 0, 'Transicoes')}
        ${renderStat(db.total_erros || 0, 'Erros')}
      </div>

      <div class="card" style="padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-muted);font-size:13px;">Ultima consolidacao</span>
          <span style="font-family:var(--font-mono);font-size:13px;">${ultimaConsolidacao}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <span style="color:var(--text-muted);font-size:13px;">Live updates</span>
          <span class="badge ${live.liveUpdatesAtivos ? 'badge-success' : 'badge-info'}" style="font-size:11px;">
            ${live.liveUpdatesAtivos ? 'ATIVO' : 'INATIVO'}
          </span>
        </div>
      </div>

      <!-- Fase da Rodada -->
      <div class="section-header">Fase da Rodada</div>
      <div class="card" style="padding:12px;">
        <div style="display:flex;gap:4px;overflow-x:auto;">
          ${FASES.map((f, i) => {
            const faseIdx = FASES.findIndex(x => x.id === faseAtual);
            let bg = 'var(--bg-tertiary)';
            let color = 'var(--text-muted)';
            if (f.id === faseAtual) { bg = 'rgba(59,130,246,0.2)'; color = 'var(--accent-primary)'; }
            else if (i < faseIdx) { bg = 'rgba(34,197,94,0.15)'; color = 'var(--accent-success)'; }
            return `<div style="
              flex:1;min-width:0;text-align:center;
              padding:6px 2px;border-radius:var(--radius-md);
              background:${bg};color:${color};
              font-size:10px;font-weight:600;
            ">
              <div style="font-size:16px;"><span class="material-icons">${f.materialIcon}</span></div>
              ${f.label}
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Acoes -->
      <div class="section-header">Acoes</div>
      <div style="display:flex;gap:8px;margin-bottom:var(--spacing-md);">
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="window._orchForcarVerificacao()">
          <span class="material-icons mi-inline">autorenew</span> Verificar
        </button>
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="window._orchAbrirModalConsolidacao()">
          <span class="material-icons mi-inline">build</span> Forcar Consol.
        </button>
      </div>

      <!-- Timeline -->
      <div class="section-header">Eventos Recentes</div>
      <div class="card" style="padding:8px 12px;max-height:350px;overflow-y:auto;">
        ${eventos.length === 0
          ? '<p style="text-align:center;color:var(--text-muted);padding:16px;">Nenhum evento</p>'
          : eventos.map(e => renderEvento(e)).join('')
        }
      </div>

    </div>

    <style>
      @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 20px ${semaforo.sombra}; }
        50% { box-shadow: 0 0 36px ${semaforo.sombra}; }
      }
    </style>
  `;

  // Handlers
  window._orchForcarVerificacao = async () => {
    try {
      const resp = await fetch('/api/orchestrator/forcar-verificacao', { method: 'POST' });
      const result = await resp.json();
      if (result.success) {
        showToast('Verificacao disparada!', 'success');
        loadOrchestrator(container, true);
      } else {
        showToast('Erro: ' + (result.message || 'falha'), 'error');
      }
    } catch (err) {
      showToast('Erro de conexao', 'error');
    }
  };

  window._orchAbrirModalConsolidacao = () => {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
      <div class="modal-backdrop open" onclick="if(event.target===this)this.classList.remove('open')">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Forcar Consolidacao</h3>
            <button class="modal-close" onclick="this.closest('.modal-backdrop').classList.remove('open')">
              <span class="material-icons">close</span>
            </button>
          </div>
          <div class="modal-body" style="text-align:center;">
            <p style="color:var(--text-secondary);font-size:14px;margin-bottom:var(--spacing-md);">
              Informe a rodada para consolidar
            </p>
            <input type="number" id="modal-rodada-input" class="input-modal-field"
              min="1" max="38" placeholder="1-38" autofocus>
          </div>
          <div class="modal-footer" style="justify-content:stretch;">
            <button class="btn btn-ghost" style="flex:1;" onclick="this.closest('.modal-backdrop').classList.remove('open')">
              Cancelar
            </button>
            <button class="btn btn-primary" style="flex:1;" onclick="window._orchExecutarConsolidacao()">
              Consolidar
            </button>
          </div>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('modal-rodada-input')?.focus(), 300);
  };

  window._orchExecutarConsolidacao = async () => {
    const input = document.getElementById('modal-rodada-input');
    const num = parseInt(input?.value);

    if (isNaN(num) || num < 1 || num > 38) {
      showToast('Rodada invalida (1-38)', 'warning');
      return;
    }

    const modalContainer = document.getElementById('modal-container');
    modalContainer.querySelector('.modal-backdrop')?.classList.remove('open');

    try {
      const resp = await fetch('/api/orchestrator/forcar-consolidacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rodada: num }),
      });
      const result = await resp.json();
      if (result.success) {
        showToast(result.message || `Consolidacao R${num} iniciada!`, 'success');
        loadOrchestrator(container, true);
      } else {
        showToast('Erro: ' + (result.message || 'falha'), 'error');
      }
    } catch (err) {
      showToast('Erro de conexao', 'error');
    }
  };
}

// ========== HELPERS ========== //

function getSemaforoConfig(statusNum) {
  switch (statusNum) {
    case 1: return { cor: 'var(--accent-success)', sombra: 'rgba(34,197,94,0.4)', icon: '<span class="mi-dot mi-dot--success"></span>' };
    case 2: return { cor: 'var(--accent-danger)', sombra: 'rgba(239,68,68,0.4)', icon: '<span class="mi-dot mi-dot--danger"></span>' };
    case 4: return { cor: 'var(--accent-warning)', sombra: 'rgba(245,158,11,0.4)', icon: '<span class="mi-dot mi-dot--warning"></span>' };
    case 6: return { cor: 'var(--text-muted)', sombra: 'rgba(148,163,184,0.3)', icon: '<span class="material-icons">flag</span>' };
    default: return { cor: 'var(--bg-tertiary)', sombra: 'rgba(0,0,0,0.2)', icon: '<span class="material-icons">help</span>' };
  }
}

function getAcaoStatus(live) {
  const fase = live.faseRodada;
  if (fase === 'erro') {
    return { icon: '<span class="material-icons">report_problem</span>', titulo: 'Acao necessaria', descricao: 'Erro na consolidacao. Verifique e force manualmente.', cor: 'var(--accent-danger)' };
  }
  if (live.consolidandoAgora) {
    return { icon: '<span class="material-icons">hourglass_empty</span>', titulo: 'Consolidando...', descricao: 'Em andamento. Aguarde.', cor: 'var(--accent-warning)' };
  }
  if (live.statusMercado === 1 && (fase === 'concluida' || fase === 'aguardando')) {
    return { icon: '<span class="material-icons">check_circle</span>', titulo: 'Tudo automatico', descricao: 'Nenhuma acao necessaria.', cor: 'var(--accent-success)' };
  }
  if (live.statusMercado === 2) {
    return { icon: '<span class="material-icons">sports_soccer</span>', titulo: 'Rodada em andamento', descricao: 'Consolidacao automatica ao final.', cor: 'var(--accent-info)' };
  }
  if (live.statusMercado === 4) {
    return { icon: '<span class="material-icons">pause_circle</span>', titulo: 'Rodada encerrada', descricao: 'Aguardando mercado abrir.', cor: 'var(--accent-warning)' };
  }
  return { icon: '<span class="material-icons">sensors</span>', titulo: 'Monitorando', descricao: 'Orchestrator ativo.', cor: 'var(--text-muted)' };
}

function renderStat(value, label) {
  return `
    <div class="card" style="text-align:center;padding:10px 8px;margin-bottom:0;">
      <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--accent-primary);">${value}</div>
      <div style="color:var(--text-muted);font-size:10px;margin-top:2px;">${label}</div>
    </div>
  `;
}

function renderEvento(e) {
  let icon = '<span class="material-icons">edit_note</span>';
  if (e.tipo.includes('transicao')) icon = '<span class="material-icons">notifications</span>';
  else if (e.tipo.includes('consolidacao_completa')) icon = '<span class="material-icons">check_circle</span>';
  else if (e.tipo.includes('erro')) icon = '<span class="material-icons">cancel</span>';
  else if (e.tipo.includes('rodada_encerrada')) icon = '<span class="material-icons">flag</span>';

  const time = e.timestamp
    ? new Date(e.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-color);">
      <span style="font-size:16px;flex-shrink:0;margin-top:2px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;color:var(--text-primary);">${formatEvento(e)}</div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:2px;">${time}</div>
      </div>
    </div>
  `;
}

function formatEvento(e) {
  if (e.tipo === 'transicao_mercado') return `Mercado: ${MARKET_LABELS[e.de] || e.de} → ${MARKET_LABELS[e.para] || e.para} (R${e.rodada})`;
  if (e.tipo === 'consolidacao_completa') return `Consolidacao R${e.rodada} completa (${e.detalhes?.ligas || '?'} ligas)`;
  if (e.tipo === 'erro_consolidacao') return `Erro consolidacao R${e.rodada}: ${e.detalhes?.erro || 'desconhecido'}`;
  if (e.tipo === 'erro_poll') return `Erro poll: ${e.detalhes?.erro || 'desconhecido'}`;
  if (e.tipo === 'rodada_encerrada') return `Rodada ${e.rodada} encerrada`;
  return `${e.tipo} ${e.rodada ? '(R' + e.rodada + ')' : ''}`;
}

function tempoRelativo(date) {
  const diff = Date.now() - date;
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);
  if (minutos < 1) return 'Agora';
  if (minutos < 60) return `ha ${minutos}min`;
  if (horas < 24) return `ha ${horas}h`;
  return `ha ${dias}d`;
}
