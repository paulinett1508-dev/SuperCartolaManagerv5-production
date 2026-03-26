// PARTICIPANTE-BRASILEIRAO.JS - v1.0
// Controller da Landing Page "Brasileirão Série A 2026"
// Renderiza tabela de classificação via BrasileiraoTabela global

if (window.Log) Log.info('BRASILEIRAO-LP', 'Carregando modulo v1.0...');

export async function inicializarBrasileraoParticipante() {
    try {
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
    } catch (err) {
        if (window.Log) Log.warn('BRASILEIRAO-LP', 'Erro ao renderizar:', err);
    }
}

export function destruirBrasileraoParticipante() {
    if (window.BrasileiraoTabela && typeof window.BrasileiraoTabela.destruir === 'function') {
        window.BrasileiraoTabela.destruir();
    }
}
