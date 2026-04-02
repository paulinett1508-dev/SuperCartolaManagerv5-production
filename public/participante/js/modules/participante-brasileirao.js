// PARTICIPANTE-BRASILEIRAO.JS - v1.0
// Controller da Landing Page "Brasileirão Série A 2026"
// Renderiza tabela de classificação via BrasileiraoTabela global

if (window.Log) Log.info('BRASILEIRAO-LP', 'Carregando modulo v1.1...');

let _ultimaAtualizacao = null;
let _statusInterval = null;

export async function inicializarBrasileraoParticipante() {
    try {
        // Lazy-load do BrasileiraoTabela se ainda não foi carregado
        if (!window.BrasileiraoTabela) {
            try {
                await import('../brasileirao-tabela.js');
            } catch (importErr) {
                if (window.Log) Log.warn('BRASILEIRAO-LP', 'Falha no lazy-load:', importErr.message);
            }
        }

        if (!window.BrasileiraoTabela) {
            const container = document.getElementById('brasileirao-classificacao-container');
            if (container) {
                container.innerHTML = `
                    <div class="text-center py-6">
                        <span class="material-icons text-2xl" style="color: var(--app-text-dim);">table_chart</span>
                        <p class="text-gray-500 mt-2 text-xs">Tabela não disponível</p>
                    </div>
                `;
            }
            return;
        }

        // Renderizar classificação e jogos da rodada em paralelo
        await Promise.all([
            window.BrasileiraoTabela.renderizarClassificacao('brasileirao-classificacao-container'),
            window.BrasileiraoTabela.renderizar({
                containerId: 'brasileirao-tabela-container',
                temporada: new Date().getFullYear()
            })
        ]);

        _ultimaAtualizacao = Date.now();
        _atualizarStatus();
        _setupRefreshButton();
        _statusInterval = setInterval(_atualizarStatus, 60000);
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', 'Erro ao renderizar:', err);

        // Limpar spinners que ficaram presos
        const classContainer = document.getElementById('brasileirao-classificacao-container');
        if (classContainer && classContainer.querySelector('[role="status"]')) {
            classContainer.innerHTML = `
                <div class="text-center py-6">
                    <span class="material-icons text-2xl" style="color: var(--app-danger);">error_outline</span>
                    <p class="text-gray-500 mt-2 text-xs">Erro ao carregar dados</p>
                </div>
            `;
        }

        const tabelaContainer = document.getElementById('brasileirao-tabela-container');
        if (tabelaContainer && !tabelaContainer.innerHTML.trim()) {
            tabelaContainer.innerHTML = `
                <div class="text-center py-6">
                    <span class="material-icons text-2xl" style="color: var(--app-danger);">error_outline</span>
                    <p class="text-gray-500 mt-2 text-xs">Erro ao carregar jogos</p>
                </div>
            `;
        }
    }
}

export function destruirBrasileraoParticipante() {
    if (window.BrasileiraoTabela && typeof window.BrasileiraoTabela.destruir === 'function') {
        window.BrasileiraoTabela.destruir();
    }
    if (_statusInterval) { clearInterval(_statusInterval); _statusInterval = null; }
    _ultimaAtualizacao = null;
}

function _setupRefreshButton() {
    const btn = document.getElementById('brasileirao-refresh');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const icon = btn.querySelector('.material-icons');
        if (!icon || btn.disabled) return;
        btn.disabled = true;
        icon.classList.add('spinning');
        try {
            if (window.BrasileiraoTabela) {
                await Promise.all([
                    window.BrasileiraoTabela.renderizarClassificacao('brasileirao-classificacao-container'),
                    window.BrasileiraoTabela.renderizar({
                        containerId: 'brasileirao-tabela-container',
                        temporada: new Date().getFullYear()
                    })
                ]);
                _ultimaAtualizacao = Date.now();
                _atualizarStatus();
            }
        } finally { icon.classList.remove('spinning'); btn.disabled = false; }
    });
}

function _atualizarStatus() {
    const el = document.getElementById('brasileirao-status');
    if (!el || !_ultimaAtualizacao) { if (el) el.textContent = ''; return; }
    const diffMin = Math.floor((Date.now() - _ultimaAtualizacao) / 60000);
    if (diffMin < 1) el.textContent = 'Atualizado agora';
    else if (diffMin < 60) el.textContent = `Atualizado há ${diffMin} min`;
    else el.textContent = `Atualizado há ${Math.floor(diffMin / 60)}h`;
}
