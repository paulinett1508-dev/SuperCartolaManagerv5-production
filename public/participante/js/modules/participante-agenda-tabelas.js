// PARTICIPANTE-AGENDA-TABELAS.JS - v1.0
// Inicializador do modulo Agenda e Tabelas
// Carrega jogos do dia (via participante-jogos.js) e tabela do Brasileirao

if (window.Log) Log.info('AGENDA-TABELAS', 'Carregando modulo v1.0...');

export async function inicializarAgendaTabelasParticipante() {
    // --- Bind collapse/expand ---
    const _agendaHeader  = document.getElementById('agenda-header');
    const _agendaContent = document.getElementById('agenda-content');
    const _agendaSection = document.getElementById('agenda-section');
    let _agendaExpanded  = false;

    if (_agendaHeader && _agendaContent && _agendaSection) {
        _agendaHeader.addEventListener('click', () => {
            _agendaExpanded = !_agendaExpanded;
            _agendaContent.classList.toggle('collapsed', !_agendaExpanded);
            _agendaSection.classList.toggle('expanded', _agendaExpanded);
        });
    }

    const _STATUS_AO_VIVO_AGENDA = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];

    function _atualizarHeaderAgenda(result) {
        const sub     = document.getElementById('agenda-header-sub');
        const right   = document.getElementById('agenda-header-right');
        const chevron = document.getElementById('agenda-chevron');

        const totalJogos  = result?.jogos?.length || 0;
        const jogosAoVivo = result?.jogos?.filter(
            j => _STATUS_AO_VIVO_AGENDA.includes(j.statusRaw)
        ).length || 0;

        // Sub-label via textContent (seguro, nunca interpreta HTML)
        if (sub) {
            if (jogosAoVivo > 0) {
                sub.textContent = jogosAoVivo + ' ao vivo agora';
            } else if (totalJogos > 0) {
                sub.textContent = totalJogos + ' jogo' + (totalJogos > 1 ? 's' : '') + ' hoje';
            } else {
                sub.textContent = result?.mensagem || 'Sem jogos brasileiros hoje';
            }
        }

        // Badge AO VIVO — sempre recriar do zero (evita duplicatas no auto-refresh)
        if (right && chevron) {
            const badgeExistente = right.querySelector('.agenda-live-badge');
            if (badgeExistente) badgeExistente.remove();

            if (jogosAoVivo > 0) {
                const badge = document.createElement('span');
                badge.className = 'agenda-live-badge brasileirao-live-badge';
                const dot = document.createElement('span');
                dot.className = 'brasileirao-live-dot';
                badge.appendChild(dot);
                badge.appendChild(document.createTextNode(jogosAoVivo + ' AO VIVO'));
                right.insertBefore(badge, chevron);
            }
        }
    }

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
            _atualizarHeaderAgenda(result);

            // Auto-refresh se tem jogos ao vivo
            if (result.aoVivo) {
                mod.iniciarAutoRefresh((novoResult) => {
                    const c = document.getElementById('agenda-jogos-container');
                    if (c) {
                        c.innerHTML = mod.renderizarJogosAoVivo(
                            novoResult.jogos, novoResult.fonte, novoResult.aoVivo, novoResult.atualizadoEm, clubeInfo
                        );
                        _atualizarHeaderAgenda(novoResult);
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
            _atualizarHeaderAgenda(result);
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
