// PARTICIPANTE-JOGOS-DO-DIA.JS - v1.0
// Controller da página "Jogos do Dia"
// Carrega jogos ao vivo via participante-jogos.js

if (window.Log) Log.info('JOGOS-DO-DIA', 'Carregando modulo v1.0...');

let _jogosModule = null;

export async function inicializarJogosDoDiaParticipante() {
    try {
        const mod = await import('/participante/js/modules/participante-jogos.js');
        _jogosModule = mod;

        const result = await mod.obterJogosAoVivo();
        const container = document.getElementById('jogos-dia-lista');
        if (!container) return;

        if (result.jogos && result.jogos.length > 0) {
            // Resolver clube do participante
            const clubeId = window.participanteAuth?.participante?.participante?.clube_id
                          || window.participanteAuth?.participante?.clube_id
                          || null;
            let clubeInfo = null;
            if (clubeId && window.getClubesNomeMap) {
                const map = window.getClubesNomeMap?.() || {};
                const nome = map[Number(clubeId)];
                if (nome && nome !== 'Seu Time') clubeInfo = { clubeId, clubeNome: nome };
            }

            container.innerHTML = mod.renderizarJogosAoVivo(
                result.jogos, result.fonte, result.aoVivo, result.atualizadoEm, clubeInfo, { semHeader: true }
            );

            // Auto-refresh se tem jogos ao vivo
            if (result.aoVivo) {
                mod.iniciarAutoRefresh((novoResult) => {
                    const c = document.getElementById('jogos-dia-lista');
                    if (c) {
                        c.innerHTML = mod.renderizarJogosAoVivo(
                            novoResult.jogos, novoResult.fonte, novoResult.aoVivo, novoResult.atualizadoEm, clubeInfo, { semHeader: true }
                        );
                    }
                });
            }
        } else {
            const msg = result.mensagem || 'Sem jogos brasileiros hoje';
            container.innerHTML = `
                <div class="rounded-xl p-4 text-center" style="background: var(--app-glass-bg); border: 1px solid var(--app-glass-border);">
                    <div class="flex items-center justify-center gap-2" style="color: var(--app-text-muted);">
                        <span class="material-icons text-base" style="color: var(--app-primary);">sports_soccer</span>
                        <span class="text-xs font-medium">${typeof window.escapeHtml === 'function' ? window.escapeHtml(msg) : msg}</span>
                    </div>
                </div>
            `;
        }
    } catch (err) {
        if (window.Log) Log.warn('JOGOS-DO-DIA', 'Erro ao carregar jogos:', err);
        const container = document.getElementById('jogos-dia-lista');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-6">
                    <span class="material-icons text-2xl" style="color: var(--app-text-dim);">sports_soccer</span>
                    <p class="text-gray-500 mt-2 text-xs">Erro ao carregar jogos</p>
                </div>
            `;
        }
    }
}

export function destruirJogosDoDiaParticipante() {
    if (_jogosModule && typeof _jogosModule.pararAutoRefresh === 'function') {
        _jogosModule.pararAutoRefresh();
    }
    _jogosModule = null;
}
