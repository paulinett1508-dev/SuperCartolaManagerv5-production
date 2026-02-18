/**
 * Raio-X Analytics - Frontend Module
 * Análises internas via MongoDB (sem dependência de IA externa)
 */

import { CURRENT_SEASON } from '../../config/seasons-client.js';

const API_BASE = '/api/admin/raio-x';

// ============================================
// INICIALIZAÇÃO (SPA-safe)
// ============================================
function init() {
    carregarLigas();
    setupEventListeners();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    document.querySelectorAll('.rx-card').forEach(card => {
        card.addEventListener('click', () => handleAnalise(card));
    });
}

// ============================================
// CARREGAR LIGAS
// ============================================
async function carregarLigas() {
    const select = document.getElementById('selectLiga');
    try {
        const res = await fetch(`${API_BASE}/ligas-disponiveis?temporada=${CURRENT_SEASON}`);
        const data = await res.json();
        if (data.success && data.ligas.length > 0) {
            select.innerHTML = '<option value="">Selecione uma liga...</option>' +
                data.ligas.map(l => `<option value="${l._id}">${l.nome}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Nenhuma liga encontrada</option>';
        }
    } catch (e) {
        console.error('[RAIO-X] Erro ao carregar ligas:', e);
        select.innerHTML = '<option value="">Erro ao carregar ligas</option>';
    }
}

// ============================================
// EXECUTAR ANÁLISE
// ============================================
async function handleAnalise(card) {
    const tipo = card.dataset.tipo;
    const requerLiga = card.dataset.requerLiga === 'true';
    const ligaId = document.getElementById('selectLiga').value;

    if (requerLiga && !ligaId) {
        SuperModal.toast.warning('Selecione uma liga para esta análise');
        return;
    }

    // UI feedback
    document.querySelectorAll('.rx-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const spinner = document.getElementById('loadingSpinner');
    const container = document.getElementById('resultadoContainer');
    spinner.classList.add('active');
    container.innerHTML = '';

    try {
        const params = new URLSearchParams({ temporada: CURRENT_SEASON });
        if (ligaId) params.set('ligaId', ligaId);

        const res = await fetch(`${API_BASE}/${tipo}?${params}`);
        const data = await res.json();

        if (!data.success) throw new Error(data.error || 'Erro na análise');

        // Renderizar resultado
        const renderers = {
            'visao-geral': renderVisaoGeral,
            'raio-x-financeiro': renderRaioXFinanceiro,
            'saude-liga': renderSaudeLiga,
            'performance': renderPerformance,
            'diagnostico': renderDiagnostico
        };

        const renderer = renderers[tipo];
        if (renderer) {
            container.innerHTML = renderer(data.dados, data.tempoMs);
        }
    } catch (e) {
        console.error('[RAIO-X] Erro:', e);
        container.innerHTML = `<div class="rx-erro"><span class="material-icons">error</span> ${e.message}</div>`;
    } finally {
        spinner.classList.remove('active');
    }
}

// ============================================
// RENDERERS
// ============================================

function renderVisaoGeral(d, tempoMs) {
    return `
        <div class="rx-resultado">
            <div class="rx-resultado-header">
                <h3><span class="material-icons">dashboard</span> Visão Geral — Temporada ${d.temporada}</h3>
                <span class="rx-tempo">${tempoMs}ms</span>
            </div>
            <div class="rx-kpi-grid">
                ${kpiCard('groups', 'Ligas Ativas', d.ligas_ativas)}
                ${kpiCard('people', 'Participantes', d.total_participantes)}
                ${kpiCard('sports_soccer', 'Rodada Atual', d.rodada_atual)}
                ${kpiCard('trending_up', 'Vol. Ganhos', formatMoeda(d.financeiro.volume_ganhos))}
                ${kpiCard('trending_down', 'Vol. Perdas', formatMoeda(d.financeiro.volume_perdas))}
                ${kpiCard('receipt_long', 'Extratos', d.financeiro.total_extratos)}
            </div>
            <div class="rx-section">
                <h4><span class="material-icons">visibility</span> Engajamento (30 dias)</h4>
                <div class="rx-stats-row">
                    <div class="rx-stat"><span class="rx-stat-value">${d.engajamento.acessos_30d}</span><span class="rx-stat-label">Acessos</span></div>
                    <div class="rx-stat"><span class="rx-stat-value">${d.engajamento.usuarios_unicos_30d}</span><span class="rx-stat-label">Usuários Únicos</span></div>
                    <div class="rx-stat"><span class="rx-stat-value">${d.engajamento.ligas_com_acesso}</span><span class="rx-stat-label">Ligas com Acesso</span></div>
                </div>
            </div>
        </div>`;
}

function renderRaioXFinanceiro(d, tempoMs) {
    const r = d.resumo;
    return `
        <div class="rx-resultado">
            <div class="rx-resultado-header">
                <h3><span class="material-icons">account_balance</span> Raio-X Financeiro — ${d.ligaNome}</h3>
                <span class="rx-tempo">${tempoMs}ms</span>
            </div>
            <div class="rx-kpi-grid">
                ${kpiCard('people', 'Participantes', r.total_participantes)}
                ${kpiCard('arrow_upward', 'Saldo Positivo', formatMoeda(r.total_saldo_positivo), 'green')}
                ${kpiCard('arrow_downward', 'Saldo Negativo', formatMoeda(r.total_saldo_negativo), 'red')}
                ${kpiCard('balance', 'Balanço Geral', formatMoeda(r.balanco_geral), r.balanco_geral >= 0 ? 'green' : 'red')}
                ${kpiCard('payments', 'Pagamentos', formatMoeda(r.total_pagamentos))}
                ${kpiCard('check_circle', 'Quitação', r.taxa_quitacao + '%')}
            </div>
            ${d.maiores_devedores.length > 0 ? `
            <div class="rx-section">
                <h4><span class="material-icons">warning</span> Maiores Devedores</h4>
                <table class="rx-table">
                    <thead><tr><th>Participante</th><th>Saldo</th><th>Pago</th><th>Quitado</th></tr></thead>
                    <tbody>${d.maiores_devedores.map(p => `
                        <tr>
                            <td>${p.nome}</td>
                            <td class="rx-val-neg">${formatMoeda(p.saldo_consolidado)}</td>
                            <td>${formatMoeda(p.total_pago)}</td>
                            <td>${p.quitado ? '<span class="rx-badge green">Sim</span>' : '<span class="rx-badge red">Não</span>'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}
            ${d.maiores_credores.length > 0 ? `
            <div class="rx-section">
                <h4><span class="material-icons">star</span> Maiores Credores</h4>
                <table class="rx-table">
                    <thead><tr><th>Participante</th><th>Saldo</th><th>Ganhos</th></tr></thead>
                    <tbody>${d.maiores_credores.map(p => `
                        <tr>
                            <td>${p.nome}</td>
                            <td class="rx-val-pos">${formatMoeda(p.saldo_consolidado)}</td>
                            <td>${formatMoeda(p.ganhos)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}
            ${d.anomalias.length > 0 ? `
            <div class="rx-section">
                <h4><span class="material-icons">bug_report</span> Anomalias (${d.anomalias.length})</h4>
                <p class="rx-text-muted">Participantes com rodadas jogadas mas saldo/ganhos/perdas zerados</p>
                <ul class="rx-list">${d.anomalias.map(a => `<li>${a.nome} (rodada ${a.ultima_rodada})</li>`).join('')}</ul>
            </div>` : ''}
        </div>`;
}

function renderSaudeLiga(d, tempoMs) {
    const p = d.participantes;
    const ins = d.inscricoes;
    return `
        <div class="rx-resultado">
            <div class="rx-resultado-header">
                <h3><span class="material-icons">favorite</span> Saúde da Liga — ${d.ligaNome}</h3>
                <span class="rx-tempo">${tempoMs}ms</span>
            </div>
            <div class="rx-kpi-grid">
                ${kpiCard('people', 'Total', p.total)}
                ${kpiCard('check_circle', 'Ativos', p.ativos, 'green')}
                ${kpiCard('cancel', 'Inativos', p.inativos, 'red')}
                ${kpiCard('exit_to_app', 'Desistentes', p.desistentes, 'orange')}
                ${kpiCard('percent', 'Taxa Atividade', p.taxa_atividade + '%', parseFloat(p.taxa_atividade) >= 70 ? 'green' : 'orange')}
                ${kpiCard('visibility', 'Acessos 30d', d.engajamento.acessos_30d)}
            </div>
            ${ins.total > 0 ? `
            <div class="rx-section">
                <h4><span class="material-icons">how_to_reg</span> Inscrições</h4>
                <div class="rx-stats-row">
                    <div class="rx-stat"><span class="rx-stat-value">${ins.renovados}</span><span class="rx-stat-label">Renovados</span></div>
                    <div class="rx-stat"><span class="rx-stat-value">${ins.novos}</span><span class="rx-stat-label">Novos</span></div>
                    <div class="rx-stat"><span class="rx-stat-value">${ins.pendentes}</span><span class="rx-stat-label">Pendentes</span></div>
                    <div class="rx-stat"><span class="rx-stat-value">${ins.nao_participa}</span><span class="rx-stat-label">Não Participa</span></div>
                </div>
            </div>` : ''}
            <div class="rx-section">
                <h4><span class="material-icons">extension</span> Módulos (${d.modulos.total_ativos}/${d.modulos.total_disponiveis})</h4>
                <div class="rx-tags">
                    ${d.modulos.ativos.map(m => `<span class="rx-badge green">${m}</span>`).join('')}
                    ${d.modulos.inativos.map(m => `<span class="rx-badge muted">${m}</span>`).join('')}
                </div>
            </div>
            ${p.lista_desistentes.length > 0 ? `
            <div class="rx-section">
                <h4><span class="material-icons">person_off</span> Desistentes</h4>
                <table class="rx-table">
                    <thead><tr><th>Participante</th><th>Rodada Desistência</th></tr></thead>
                    <tbody>${p.lista_desistentes.map(d => `
                        <tr><td>${d.nome}</td><td>Rodada ${d.rodada_desistencia}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}
        </div>`;
}

function renderPerformance(d, tempoMs) {
    const r = d.resumo;
    return `
        <div class="rx-resultado">
            <div class="rx-resultado-header">
                <h3><span class="material-icons">emoji_events</span> Performance — ${d.ligaNome}</h3>
                <span class="rx-tempo">${tempoMs}ms</span>
            </div>
            <div class="rx-kpi-grid">
                ${kpiCard('people', 'Participantes', r.total_participantes)}
                ${kpiCard('sports_soccer', 'Rodadas', r.total_rodadas)}
                ${kpiCard('analytics', 'Média Geral', r.media_geral)}
            </div>
            <div class="rx-section">
                <h4><span class="material-icons">leaderboard</span> Top 5</h4>
                ${rankingTable(d.top_5)}
            </div>
            <div class="rx-section">
                <h4><span class="material-icons">trending_down</span> Bottom 5</h4>
                ${rankingTable(d.bottom_5)}
            </div>
            <div class="rx-section">
                <h4><span class="material-icons">straighten</span> Mais Consistentes (menor desvio padrão)</h4>
                ${rankingTable(d.mais_consistentes)}
            </div>
        </div>`;
}

function renderDiagnostico(d, tempoMs) {
    const scoreColor = d.health_score >= 80 ? 'green' : d.health_score >= 50 ? 'orange' : 'red';
    return `
        <div class="rx-resultado">
            <div class="rx-resultado-header">
                <h3><span class="material-icons">monitor_heart</span> Diagnóstico do Sistema</h3>
                <span class="rx-tempo">${tempoMs}ms</span>
            </div>
            <div class="rx-health-score ${scoreColor}">
                <div class="rx-health-number">${d.health_score}</div>
                <div class="rx-health-label">Health Score</div>
            </div>
            <div class="rx-kpi-grid">
                ${kpiCard('storage', 'Banco', d.banco.status, d.banco.status === 'conectado' ? 'green' : 'red')}
                ${kpiCard('dns', 'Collections', d.banco.total_collections)}
                ${kpiCard('memory', 'Heap', d.memoria.heap_usado_mb + 'MB')}
                ${kpiCard('data_usage', 'Uso Heap', d.memoria.uso_percentual + '%', d.memoria.uso_percentual < 85 ? 'green' : 'red')}
                ${kpiCard('schedule', 'Uptime', d.processo.uptime_horas + 'h')}
                ${kpiCard('code', 'Node', d.processo.node_version)}
            </div>
            <div class="rx-section">
                <h4><span class="material-icons">sync</span> Consolidação (${d.consolidacao.ligas_ativas} ligas, ${d.consolidacao.com_gap} com gap)</h4>
                <table class="rx-table">
                    <thead><tr><th>Liga</th><th>Última Rodada</th><th>Consolidada</th><th>Gap</th></tr></thead>
                    <tbody>${d.consolidacao.detalhes.map(c => `
                        <tr>
                            <td>${c.ligaNome}</td>
                            <td>${c.ultima_rodada_dados}</td>
                            <td>${c.ultima_rodada_consolidada}</td>
                            <td class="${c.gap > 0 ? 'rx-val-neg' : ''}">${c.gap > 0 ? '+' + c.gap : '0'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="rx-section">
                <h4><span class="material-icons">storage</span> Maiores Collections</h4>
                <table class="rx-table">
                    <thead><tr><th>Collection</th><th>Documentos</th></tr></thead>
                    <tbody>${d.banco.collections.slice(0, 15).map(c => `
                        <tr><td>${c.nome}</td><td>${c.documentos.toLocaleString('pt-BR')}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

// ============================================
// HELPERS
// ============================================

function kpiCard(icon, label, value, color = '') {
    return `
        <div class="rx-kpi ${color}">
            <span class="material-icons rx-kpi-icon">${icon}</span>
            <div class="rx-kpi-value">${value}</div>
            <div class="rx-kpi-label">${label}</div>
        </div>`;
}

function rankingTable(items) {
    if (!items || items.length === 0) return '<p class="rx-text-muted">Sem dados</p>';
    return `
        <table class="rx-table">
            <thead><tr><th>#</th><th>Participante</th><th>Pontos</th><th>Média</th><th>DP</th><th>Mitos</th><th>Micos</th></tr></thead>
            <tbody>${items.map(r => `
                <tr>
                    <td>${r.posicao}</td>
                    <td>${r.nome}</td>
                    <td><strong>${(Math.trunc((r.total_pontos || 0) * 10) / 10).toFixed(1)}</strong></td>
                    <td>${r.media_pontos}</td>
                    <td>${r.desvio_padrao}</td>
                    <td>${r.mitos || 0}</td>
                    <td>${r.micos || 0}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

function formatMoeda(valor) {
    if (valor == null) return 'R$ 0,00';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
