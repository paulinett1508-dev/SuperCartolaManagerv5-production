// PARTICIPANTE-AGENDA-TABELAS.JS - v1.0
// Inicializador do modulo Agenda e Tabelas
// Carrega jogos do dia (via participante-jogos.js) e tabela do Brasileirao

if (window.Log) Log.info('AGENDA-TABELAS', 'Carregando modulo v1.0...');

export async function inicializarAgendaTabelasParticipante() {
    // --- Jogos do Dia ---
    try {
        const mod = await import('/participante/js/modules/participante-jogos.js');
        const result = await mod.obterJogosAoVivo();

        const jogosContainer = document.getElementById('agenda-jogos-container');
        if (jogosContainer && result.jogos && result.jogos.length > 0) {
            // Resolver clube do participante
            const clubeId = window.participanteAuth?.participante?.participante?.clube_id
                          || window.participanteAuth?.participante?.clube_id
                          || null;
            let clubeInfo = null;
            if (clubeId && window.getClubesNomeMap) {
                const map = window.getClubesNomeMap();
                const nome = map[Number(clubeId)];
                if (nome && nome !== 'Seu Time') clubeInfo = { clubeId, clubeNome: nome };
            }

            jogosContainer.innerHTML = mod.renderizarJogosAoVivo(
                result.jogos, result.fonte, result.aoVivo, result.atualizadoEm, clubeInfo
            );

            // Auto-refresh se tem jogos ao vivo
            if (result.aoVivo) {
                mod.iniciarAutoRefresh((novoResult) => {
                    const c = document.getElementById('agenda-jogos-container');
                    if (c) {
                        c.innerHTML = mod.renderizarJogosAoVivo(
                            novoResult.jogos, novoResult.fonte, novoResult.aoVivo, novoResult.atualizadoEm, clubeInfo
                        );
                    }
                });
            }
        } else if (jogosContainer) {
            const msg = result.mensagem || 'Sem jogos brasileiros hoje';
            jogosContainer.innerHTML = `
                <div class="rounded-xl p-4 text-center" style="background: var(--app-glass-bg); border: 1px solid var(--app-glass-border);">
                    <div class="flex items-center justify-center gap-2" style="color: var(--app-text-muted);">
                        <span class="material-icons text-base" style="color: var(--app-primary);">sports_soccer</span>
                        <span class="text-xs font-medium">${msg}</span>
                    </div>
                </div>
            `;
        }
    } catch (err) {
        if (window.Log) Log.warn('AGENDA-TABELAS', 'Erro jogos:', err);
        const jogosContainer = document.getElementById('agenda-jogos-container');
        if (jogosContainer) {
            jogosContainer.innerHTML = `
                <div class="text-center py-6">
                    <span class="material-icons text-2xl" style="color: var(--app-text-dim);">sports_soccer</span>
                    <p class="text-gray-500 mt-2 text-xs">Erro ao carregar jogos</p>
                </div>
            `;
        }
    }

    // --- Tabela do Brasileirao ---
    try {
        if (window.BrasileiraoTabela) {
            await window.BrasileiraoTabela.renderizar({
                containerId: 'agenda-brasileirao-container',
                temporada: new Date().getFullYear()
            });
        } else {
            const container = document.getElementById('agenda-brasileirao-container');
            if (container) {
                container.innerHTML = `
                    <div class="text-center py-6">
                        <span class="material-icons text-2xl" style="color: var(--app-text-dim);">table_chart</span>
                        <p class="text-gray-500 mt-2 text-xs">Tabela nao disponivel</p>
                    </div>
                `;
            }
        }
    } catch (err) {
        if (window.Log) Log.warn('AGENDA-TABELAS', 'Erro brasileirao:', err);
    }
}
