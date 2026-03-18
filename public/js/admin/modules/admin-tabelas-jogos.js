/**
 * ADMIN TABELAS DE JOGOS - Controller (Web/Desktop)
 * Arquivo: public/js/admin/modules/admin-tabelas-jogos.js
 * Visualizacao web nativa do calendario do Brasileirao
 * Usa /api/brasileirao/completo/:temporada
 */

(function () {
    'use strict';

    const TEMPORADA = new Date().getFullYear();
    const RODADA_FINAL_CAMPEONATO = 38; // Brasileirão (centralizado em config/seasons.js)

    async function carregarDados() {
        const container = document.getElementById('tjRodadasContainer');
        if (!container) return;

        try {
            const res = await fetch(`/api/brasileirao/completo/${TEMPORADA}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (!data.success || !data.rodadas) {
                container.innerHTML = '<div class="tj-empty"><span class="material-icons" style="font-size:3rem;opacity:0.3;">sports_soccer</span><p>Nenhum dado disponivel para ' + TEMPORADA + '</p></div>';
                return;
            }

            atualizarStats(data);
            renderizarRodadas(container, data);

        } catch (err) {
            console.error('[TABELAS-JOGOS] Erro:', err);
            container.innerHTML = '<div class="tj-empty"><span class="material-icons" style="font-size:2rem;color:var(--color-danger);">wifi_off</span><p>Erro ao carregar dados</p></div>';
        }
    }

    function atualizarStats(data) {
        const stats = data.stats || {};
        const el = (id) => document.getElementById(id);

        if (el('tjStatRodada')) el('tjStatRodada').textContent = stats.rodada_atual || '--';
        if (el('tjStatJogos')) el('tjStatJogos').textContent = stats.jogos_realizados || 0;
        if (el('tjStatRestantes')) el('tjStatRestantes').textContent = stats.jogos_restantes || 0;
        if (el('tjStatFonte')) {
            const fonte = data.fonte || 'api';
            el('tjStatFonte').textContent = fonte.charAt(0).toUpperCase() + fonte.slice(1);
        }
    }

    function renderizarRodadas(container, data) {
        const rodadas = data.rodadas;
        const rodadaAtual = data.stats?.rodada_atual || 1;

        let html = '';

        for (let r = 1; r <= RODADA_FINAL_CAMPEONATO; r++) {
            const rodada = rodadas[r];
            if (!rodada) continue;

            const isAtual = r === rodadaAtual;
            const isPassada = r < rodadaAtual;
            const expanded = isAtual;

            // Detectar rodadas com jogos adiados (passadas mas com pendências)
            const temAdiados = (rodada.partidas || []).some(p => p.status === 'adiado');

            const statusClass = isAtual ? 'tj-rodada-atual' : isPassada ? (temAdiados ? 'tj-rodada-pendente' : 'tj-rodada-passada') : 'tj-rodada-futura';
            const expandedClass = expanded ? 'tj-expanded' : '';

            let badge = '';
            if (isAtual) {
                badge = '<span class="tj-badge tj-badge-atual">EM ANDAMENTO</span>';
            } else if (isPassada) {
                if (temAdiados) {
                    const nAdiados = (rodada.partidas || []).filter(p => p.status === 'adiado').length;
                    badge = '<span class="tj-badge tj-badge-pendente">PENDENTE</span>';
                    badge += ' <span class="tj-badge tj-badge-pendente-count">' + nAdiados + ' jogo' + (nAdiados > 1 ? 's' : '') + ' adiado' + (nAdiados > 1 ? 's' : '') + '</span>';
                } else {
                    badge = '<span class="tj-badge tj-badge-concluida">ENCERRADA</span>';
                }
            } else {
                badge = '<span class="tj-badge tj-badge-futura">A JOGAR</span>';
            }

            const periodo = formatarPeriodo(rodada.data_inicio, rodada.data_fim);

            html += '<div class="tj-rodada ' + statusClass + ' ' + expandedClass + '" data-rodada="' + r + '">';
            html += '  <div class="tj-rodada-header">';
            html += '    <span class="tj-rodada-num">R' + r + '</span>';
            html += '    <span class="tj-rodada-datas">' + periodo + '</span>';
            html += '    ' + badge;
            html += '    <span class="material-icons tj-rodada-chevron">expand_more</span>';
            html += '  </div>';
            html += '  <div class="tj-jogos">';
            html += '    <div class="tj-jogos-grid">';
            html += renderizarJogos(rodada.partidas || []);
            html += '    </div>';
            html += '  </div>';
            html += '</div>';
        }

        container.innerHTML = html;
        bindAccordions(container);

        // Scroll para rodada atual
        setTimeout(() => {
            const atual = container.querySelector('.tj-rodada-atual');
            if (atual) atual.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
    }

    function renderizarJogos(partidas) {
        if (!partidas || partidas.length === 0) {
            return '<div class="tj-empty" style="grid-column:1/-1;padding:var(--app-space-3);">Jogos a definir</div>';
        }

        const ordenados = [...partidas].sort((a, b) => {
            if (a.data !== b.data) return (a.data || '').localeCompare(b.data || '');
            return (a.horario || '').localeCompare(b.horario || '');
        });

        return ordenados.map(jogo => {
            const isAoVivo = jogo.status === 'ao_vivo';
            const isEncerrado = jogo.status === 'encerrado';
            const isAdiado = jogo.status === 'adiado';
            const temPlacar = isAoVivo || isEncerrado;

            const statusClass = isAoVivo ? 'tj-jogo-live' : isEncerrado ? 'tj-jogo-encerrado' : '';

            let centro;
            if (temPlacar) {
                const placar = (jogo.placar_mandante ?? 0) + ' x ' + (jogo.placar_visitante ?? 0);
                centro = '<span class="tj-jogo-placar">' + placar + '</span>';
            } else if (isAdiado) {
                centro = '<span class="tj-jogo-adiado">ADIADO</span>';
            } else {
                centro = '<span class="tj-jogo-horario">' + (jogo.horario || 'A def.') + '</span>';
            }

            const dataFormatada = formatarDataCurta(jogo.data);

            let html = '<div class="tj-jogo ' + statusClass + '">';
            html += '  <div class="tj-jogo-mandante">' + (jogo.time_casa || jogo.mandante || '?') + '</div>';
            html += '  <div class="tj-jogo-centro">' + centro + '</div>';
            html += '  <div class="tj-jogo-visitante">' + (jogo.time_fora || jogo.visitante || '?') + '</div>';
            if (dataFormatada) {
                html += '  <div class="tj-jogo-meta">' + dataFormatada + '</div>';
            }
            html += '</div>';

            return html;
        }).join('');
    }

    function bindAccordions(container) {
        container.querySelectorAll('.tj-rodada-header').forEach(header => {
            header.addEventListener('click', () => {
                const rodada = header.closest('.tj-rodada');
                rodada.classList.toggle('tj-expanded');
            });
        });
    }

    function formatarPeriodo(inicio, fim) {
        if (!inicio && !fim) return '';
        const fmt = (d) => {
            if (!d) return '';
            const parts = d.split('-');
            if (parts.length === 3) return parts[2] + '/' + parts[1];
            return d;
        };
        if (inicio === fim || !fim) return fmt(inicio);
        return fmt(inicio) + ' - ' + fmt(fim);
    }

    function formatarDataCurta(data) {
        if (!data) return '';
        const parts = data.split('-');
        if (parts.length === 3) return parts[2] + '/' + parts[1];
        return data;
    }

    async function carregarStatusSync() {
        try {
            const res = await fetch('/api/brasileirao/status');
            if (!res.ok) return;
            const data = await res.json();

            const infoEl = document.getElementById('tjSyncInfo');
            const textEl = document.getElementById('tjSyncInfoText');
            if (!infoEl || !textEl) return;

            const job = data.job || {};
            const service = data.stats || {};

            const partes = [];

            if (job.ultimoSync) {
                partes.push('Sync completo: ' + formatarDataHora(job.ultimoSync));
            }
            if (job.ultimoMiniSync) {
                partes.push('Mini-sync: ' + formatarDataHora(job.ultimoMiniSync));
            }
            if (job.horaSyncProgramado) {
                partes.push('Próximo: ' + job.horaSyncProgramado);
            }
            if (data.fonteAtual) {
                partes.push('Fonte: ' + data.fonteAtual);
            }

            if (partes.length > 0) {
                textEl.textContent = partes.join(' · ');
                infoEl.classList.add('visible');
            }
        } catch (e) {
            // silencioso
        }
    }

    async function sincronizar() {
        const btn = document.getElementById('tjBtnSync');
        if (!btn) return;

        const iconEl = btn.querySelector('.material-icons');
        btn.disabled = true;
        if (iconEl) iconEl.style.animation = 'spin 1s linear infinite';
        btn.style.opacity = '0.7';

        try {
            const res = await fetch(`/api/brasileirao/sync/${TEMPORADA}`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                btn.style.background = 'var(--color-success, #22c55e)';
                if (iconEl) iconEl.textContent = 'check';
                setTimeout(() => {
                    btn.style.background = '';
                    if (iconEl) iconEl.textContent = 'sync';
                }, 2000);
                // Recarregar dados e status
                await Promise.all([carregarDados(), carregarStatusSync()]);
            } else {
                btn.style.background = 'var(--color-danger, #ef4444)';
                if (iconEl) iconEl.textContent = 'error';
                console.error('[TABELAS-JOGOS] Sync falhou:', data.erro);
                setTimeout(() => {
                    btn.style.background = '';
                    if (iconEl) iconEl.textContent = 'sync';
                }, 3000);
            }
        } catch (err) {
            console.error('[TABELAS-JOGOS] Erro no sync:', err);
            btn.style.background = 'var(--color-danger, #ef4444)';
            if (iconEl) iconEl.textContent = 'error';
            setTimeout(() => {
                btn.style.background = '';
                if (iconEl) iconEl.textContent = 'sync';
            }, 3000);
        } finally {
            btn.disabled = false;
            if (iconEl) iconEl.style.animation = '';
            btn.style.opacity = '';
        }
    }

    function formatarDataHora(isoStr) {
        if (!isoStr) return '';
        try {
            return new Date(isoStr).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return isoStr;
        }
    }

    // Expor para o botão inline do HTML
    window.tjSincronizar = sincronizar;

    function init() {
        console.log('[TABELAS-JOGOS] Inicializando...');
        carregarDados();
        carregarStatusSync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
