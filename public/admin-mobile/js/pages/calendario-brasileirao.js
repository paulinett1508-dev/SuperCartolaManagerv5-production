/**
 * Calendário Brasileirão - Painel Admin
 * Visualização e sincronização da tabela completa do Brasileirão Série A
 * v1.0
 */
const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

import { showLoading, showError, showToast } from '../app.js';

const mi = (name, cls = '') => `<span class="material-icons${cls ? ' ' + cls : ''}">${name}</span>`;

let refreshInterval = null;
let temporadaAtual = new Date().getFullYear();
let dadosCalendario = null;

export async function render(params = {}) {
    const container = document.getElementById('page-content');
    updateTopBar('Brasileirão', 'Calendário Completo');
    temporadaAtual = params.temporada ? parseInt(params.temporada, 10) : new Date().getFullYear();

    await loadPage(container);
}

export function destroy() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function updateTopBar(title, subtitle) {
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    const backBtn = document.getElementById('btn-back');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle || '';
    if (backBtn) backBtn.classList.remove('hidden');
}

async function loadPage(container, silent = false) {
    if (!silent) showLoading(container);

    try {
        const resp = await fetch(`/api/brasileirao/admin/${temporadaAtual}`);
        const data = await resp.json();

        if (!data.success) {
            throw new Error(data.erro || 'Erro ao carregar calendário');
        }

        dadosCalendario = data;
        renderPage(container, data);

    } catch (error) {
        console.error('Erro calendario-brasileirao:', error);
        if (!silent) showError(container, error.message || 'Erro ao carregar calendário.');
    }
}

function renderPage(container, data) {
    const { calendario, fonte, stats, service_status } = data;
    const hasData = calendario && calendario.partidas && calendario.partidas.length > 0;

    // Status do serviço
    const serviceOk = service_status && !service_status.erro;
    const ultimoSync = calendario?.ultima_atualizacao
        ? formatarDataHora(calendario.ultima_atualizacao)
        : 'Nunca';

    // Stats
    const totalJogos = stats?.total_jogos || 0;
    const realizados = stats?.jogos_realizados || 0;
    const rodadaAtual = stats?.rodada_atual || 1;

    container.innerHTML = `
        <div class="container">
            <!-- Header com temporada -->
            <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;">
                <span>Temporada ${temporadaAtual}</span>
                <select id="select-temporada" class="select-mini">
                    ${[2024, 2025, 2026].map(t => `
                        <option value="${t}" ${t === temporadaAtual ? 'selected' : ''}>${t}</option>
                    `).join('')}
                </select>
            </div>

            <!-- Status Card -->
            <div class="card" style="padding:16px;margin-bottom:16px;border:1px solid ${serviceOk ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'};">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:48px;height:48px;border-radius:var(--radius-lg);background:${serviceOk ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'};display:flex;align-items:center;justify-content:center;">
                        ${mi(serviceOk ? 'check_circle' : 'error', '')}
                    </div>
                    <div style="flex:1;">
                        <div style="font-family:var(--font-russo);font-size:14px;color:var(--text-primary);">
                            ${hasData ? `${totalJogos} jogos carregados` : 'Sem dados'}
                        </div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                            Fonte: ${fonte || 'N/A'} | Atualizado: ${ultimoSync}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Stats Grid -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
                ${renderStatCard('Rodada Atual', rodadaAtual, 'var(--accent-info)')}
                ${renderStatCard('Realizados', `${realizados}/${totalJogos}`, 'var(--accent-success)')}
                ${renderStatCard('Restantes', totalJogos - realizados, 'var(--accent-warning)')}
            </div>

            <!-- Botão Sync -->
            <button class="btn btn-primary btn-block" id="btn-sync" style="margin-bottom:20px;">
                ${mi('sync')} Sincronizar Agora
            </button>

            <!-- Lista de Rodadas -->
            <div class="section-header">Rodadas</div>
            <div id="lista-rodadas">
                ${hasData ? renderRodadas(calendario) : renderSemDados()}
            </div>
        </div>

        <style>
            .select-mini {
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-md);
                color: var(--text-primary);
                padding: 4px 8px;
                font-size: 12px;
            }
            .rodada-item {
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-md);
                margin-bottom: 8px;
                overflow: hidden;
            }
            .rodada-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 14px;
                cursor: pointer;
                transition: background 0.15s;
            }
            .rodada-header:active {
                background: rgba(255,255,255,0.05);
            }
            .rodada-header-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .rodada-num {
                font-family: var(--font-russo);
                font-size: 13px;
                color: var(--text-primary);
            }
            .rodada-datas {
                font-size: 11px;
                color: var(--text-muted);
            }
            .rodada-badges {
                display: flex;
                gap: 6px;
            }
            .rodada-badge {
                font-size: 9px;
                font-weight: 600;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .rodada-badge-live {
                background: rgba(239,68,68,0.15);
                color: var(--accent-danger);
            }
            .rodada-badge-done {
                background: rgba(34,197,94,0.15);
                color: var(--accent-success);
            }
            .rodada-badge-pending {
                background: rgba(148,163,184,0.15);
                color: var(--text-muted);
            }
            .rodada-content {
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease;
            }
            .rodada-item.expanded .rodada-content {
                max-height: 600px;
            }
            .rodada-item.expanded .rodada-chevron {
                transform: rotate(180deg);
            }
            .rodada-chevron {
                transition: transform 0.3s;
                color: var(--text-muted);
            }
            .partida-row {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
                gap: 8px;
                padding: 10px 14px;
                border-top: 1px solid var(--border-color);
                font-size: 12px;
            }
            .partida-time {
                color: var(--text-primary);
            }
            .partida-time.casa {
                text-align: right;
            }
            .partida-time.fora {
                text-align: left;
            }
            .partida-placar {
                font-family: var(--font-mono);
                font-size: 13px;
                font-weight: 700;
                color: var(--text-primary);
                min-width: 50px;
                text-align: center;
            }
            .partida-horario {
                font-family: var(--font-mono);
                font-size: 11px;
                color: var(--accent-info);
            }
        </style>
    `;

    // Event listeners
    document.getElementById('select-temporada').addEventListener('change', (e) => {
        temporadaAtual = parseInt(e.target.value, 10);
        loadPage(container);
    });

    document.getElementById('btn-sync').addEventListener('click', async () => {
        const btn = document.getElementById('btn-sync');
        btn.disabled = true;
        btn.innerHTML = `${mi('sync', ' spin-animation')} Sincronizando...`;

        try {
            const resp = await fetch(`/api/brasileirao/sync/${temporadaAtual}`, { method: 'POST' });
            const result = await resp.json();

            if (result.success) {
                showToast(`✅ ${result.jogosImportados || 0} jogos sincronizados via ${result.fonte}`);
                await loadPage(container);
            } else {
                showToast(`❌ ${result.erro || 'Erro no sync'}`);
            }
        } catch (err) {
            showToast(`❌ ${err.message}`);
        }

        btn.disabled = false;
        btn.innerHTML = `${mi('sync')} Sincronizar Agora`;
    });

    // Acordeões das rodadas
    document.querySelectorAll('.rodada-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.rodada-item');
            item.classList.toggle('expanded');
        });
    });
}

function renderStatCard(label, value, color) {
    return `
        <div class="card" style="padding:12px;text-align:center;">
            <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:${color};">${value}</div>
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-top:2px;">${label}</div>
        </div>
    `;
}

function renderRodadas(calendario) {
    // Agrupar partidas por rodada
    const rodadas = {};
    for (let r = 1; r <= RODADA_FINAL_CAMPEONATO; r++) {
        rodadas[r] = calendario.partidas.filter(p => p.rodada === r).sort((a, b) => {
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return a.horario.localeCompare(b.horario);
        });
    }

    return Object.entries(rodadas).map(([num, jogos]) => {
        if (jogos.length === 0) return '';

        const datas = [...new Set(jogos.map(j => j.data))].sort();
        const dataInicio = formatarDataCurta(datas[0]);
        const dataFim = formatarDataCurta(datas[datas.length - 1]);

        const aoVivo = jogos.filter(j => j.status === 'ao_vivo').length;
        const encerrados = jogos.filter(j => j.status === 'encerrado').length;
        const agendados = jogos.filter(j => j.status === 'agendado' || j.status === 'a_definir').length;

        let badge = '';
        if (aoVivo > 0) {
            badge = `<span class="rodada-badge rodada-badge-live">${aoVivo} AO VIVO</span>`;
        } else if (encerrados === jogos.length) {
            badge = `<span class="rodada-badge rodada-badge-done">COMPLETA</span>`;
        } else if (agendados > 0) {
            badge = `<span class="rodada-badge rodada-badge-pending">${agendados} PENDENTES</span>`;
        }

        const partidasHTML = jogos.map(j => {
            const placar = j.status === 'encerrado' || j.status === 'ao_vivo'
                ? `${j.placar_mandante ?? 0} - ${j.placar_visitante ?? 0}`
                : j.horario || '--:--';

            return `
                <div class="partida-row">
                    <div class="partida-time casa">${j.mandante}</div>
                    <div class="${j.status === 'encerrado' || j.status === 'ao_vivo' ? 'partida-placar' : 'partida-horario'}">${placar}</div>
                    <div class="partida-time fora">${j.visitante}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="rodada-item">
                <div class="rodada-header">
                    <div class="rodada-header-left">
                        <span class="rodada-num">Rodada ${num}</span>
                        <span class="rodada-datas">${dataInicio} - ${dataFim}</span>
                    </div>
                    <div class="rodada-badges">
                        ${badge}
                        ${mi('expand_more', 'rodada-chevron')}
                    </div>
                </div>
                <div class="rodada-content">
                    ${partidasHTML}
                </div>
            </div>
        `;
    }).join('');
}

function renderSemDados() {
    return `
        <div class="card" style="padding:40px;text-align:center;">
            ${mi('calendar_today', '')}
            <p style="margin-top:12px;color:var(--text-muted);">Nenhum dado carregado</p>
            <p style="font-size:12px;color:var(--text-muted);">Clique em "Sincronizar Agora" para importar</p>
        </div>
    `;
}

function formatarDataHora(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatarDataCurta(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${dia}/${meses[parseInt(mes, 10) - 1]}`;
}
