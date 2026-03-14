/**
 * PARTICIPANTE TIRO CERTO - Controller v1.0
 *
 * Modulo Survival: escolher time vencedor do Brasileirao.
 * Vitoria = avanca. Empate/Derrota = eliminado.
 *
 * Modos:
 * - TEASER: sem edicao ativa, exibe landing page "EM BREVE"
 * - ATIVO: edicao em andamento, exibe UI de escolha + participantes
 */

// Estado do modulo
let _ligaId = null;
let _timeId = null;
let _participante = null;

// Times do Brasileirao Serie A (IDs Cartola)
const TIMES_SERIE_A = [
    { id: 262, nome: 'Flamengo' },
    { id: 263, nome: 'Botafogo' },
    { id: 264, nome: 'Corinthians' },
    { id: 265, nome: 'Bahia' },
    { id: 266, nome: 'Fluminense' },
    { id: 267, nome: 'Vasco' },
    { id: 275, nome: 'Palmeiras' },
    { id: 276, nome: 'São Paulo' },
    { id: 277, nome: 'Santos' },
    { id: 280, nome: 'Bragantino' },
    { id: 282, nome: 'Atlético-MG' },
    { id: 283, nome: 'Cruzeiro' },
    { id: 284, nome: 'Grêmio' },
    { id: 285, nome: 'Internacional' },
    { id: 286, nome: 'Juventude' },
    { id: 287, nome: 'Vitória' },
    { id: 290, nome: 'Goiás' },
    { id: 292, nome: 'Sport' },
    { id: 293, nome: 'Athletico-PR' },
    { id: 354, nome: 'Ceará' },
    { id: 356, nome: 'Fortaleza' },
    { id: 1371, nome: 'Cuiabá' },
    { id: 2305, nome: 'Mirassol' },
];

let _timeSelecionado = null;

/**
 * Funcao principal — chamada pelo participante-navigation.js
 */
export async function inicializarTiroCertoParticipante({ participante, ligaId, timeId }) {
    // Fallback para auth global
    if (!ligaId || !timeId) {
        if (window.participanteAuth) {
            ligaId = ligaId || window.participanteAuth.ligaId;
            timeId = timeId || window.participanteAuth.timeId;
        }
    }

    _ligaId = ligaId;
    _timeId = parseInt(timeId);
    _participante = participante;
    _timeSelecionado = null;

    // Detectar premium via participante-navigation (com fallbacks)
    const isPremiumNav = window.participanteNav?._isPremium === true;
    const isPremiumParticipante = participante?.premium === true;
    const isPremiumAuth = (() => {
        const ligaData = window.participanteAuth?.ligaDataCache;
        const participantes = ligaData?.participantes || [];
        const p = participantes.find(pt => String(pt.time_id) === String(timeId));
        return p?.premium === true;
    })();
    const isPremium = isPremiumNav || isPremiumParticipante || isPremiumAuth;

    if (window.Log) Log.info('TIRO-CERTO', `Inicializando: liga=${ligaId} time=${timeId} premium=${isPremium}`);

    // Aguardar DOM estar renderizado (double RAF — padrao SPA)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Verificar se container existe
    const container = document.getElementById('tiro-certo-container');
    if (!container) {
        if (window.Log) Log.error('TIRO-CERTO', 'Container #tiro-certo-container nao encontrado');
        return;
    }

    // Tentar carregar estado da edicao
    try {
        const status = await fetchStatus(ligaId);
        if (status && status.edicao && status.edicao.status !== 'pendente') {
            await ativarModoAtivo(status);
        } else if (isPremium) {
            // Premium sem edicao ativa: exibir modo ativo com banner de teste
            await ativarModoTestePremium();
        } else {
            ativarModoTeaser();
        }
    } catch (err) {
        if (isPremium) {
            // Premium: mesmo sem API, mostrar modo teste
            if (window.Log) Log.info('TIRO-CERTO', 'Premium sem edicao, ativando modo teste');
            await ativarModoTestePremium();
        } else {
            if (window.Log) Log.warn('TIRO-CERTO', 'Sem edicao ativa, exibindo teaser:', err.message);
            ativarModoTeaser();
        }
    }
}

// =====================================================================
// FETCH HELPERS
// =====================================================================

async function fetchStatus(ligaId) {
    const res = await fetch(`/api/tiro-certo/${ligaId}/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function fetchMinhasEscolhas(ligaId, timeId) {
    const res = await fetch(`/api/tiro-certo/${ligaId}/minhas-escolhas?timeId=${timeId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function fetchParticipantes(ligaId) {
    const res = await fetch(`/api/tiro-certo/${ligaId}/participantes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function postEscolha(ligaId, payload) {
    const res = await fetch(`/api/tiro-certo/${ligaId}/escolher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return await res.json();
}

// =====================================================================
// MODO TEASER (sem edicao)
// =====================================================================

function ativarModoTeaser() {
    const modoAtivo = document.getElementById('tc-modo-ativo');
    const modoTeaser = document.getElementById('tc-modo-teaser');
    if (modoAtivo) modoAtivo.style.display = 'none';
    if (modoTeaser) modoTeaser.style.display = '';
}

// =====================================================================
// MODO TESTE PREMIUM (sem edicao ativa, usuario premium)
// =====================================================================

async function ativarModoTestePremium() {
    const modoAtivo = document.getElementById('tc-modo-ativo');
    const modoTeaser = document.getElementById('tc-modo-teaser');
    if (modoAtivo) modoAtivo.style.display = '';
    if (modoTeaser) modoTeaser.style.display = 'none';

    // Header
    const edicaoNome = document.getElementById('tc-edicao-nome');
    if (edicaoNome) edicaoNome.textContent = 'Modo Teste Premium';

    // Badge premium
    const badge = document.getElementById('tc-status-badge');
    if (badge) {
        badge.className = 'tc-status-badge vivo';
        badge.innerHTML = '<span class="material-icons" style="font-size:14px;margin-right:2px;">star</span> PREMIUM';
    }

    // Meu status: mensagem informativa
    const statusContent = document.getElementById('tc-meu-status-content');
    if (statusContent) {
        statusContent.innerHTML = `
            <div style="text-align:center;padding:var(--app-space-4);">
                <span class="material-icons" style="color:var(--app-warning);font-size:2.5rem;">star</span>
                <p style="font-family:var(--app-font-brand);font-size:1.1rem;color:white;margin-top:0.5rem;">
                    Acesso Antecipado Premium
                </p>
                <p style="font-size:var(--app-font-sm);color:var(--app-text-secondary);margin-top:0.5rem;">
                    Voce tem acesso exclusivo ao Tiro Certo antes da abertura oficial no 2o turno.
                </p>
                <p style="font-size:var(--app-font-xs);color:var(--app-text-muted);margin-top:0.75rem;">
                    Nenhuma edicao foi iniciada ainda pelo admin da liga.
                    Quando a disputa comecar, voce podera fazer suas escolhas aqui.
                </p>
            </div>
        `;
    }

    // Esconder secao de escolha
    const escolhaSection = document.getElementById('tc-escolha-section');
    if (escolhaSection) escolhaSection.style.display = 'none';

    // Historico vazio
    const historicoContent = document.getElementById('tc-historico-content');
    if (historicoContent) {
        historicoContent.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;">Nenhuma escolha registrada</p>';
    }

    // Participantes vazio
    const participantesContent = document.getElementById('tc-participantes-content');
    if (participantesContent) {
        participantesContent.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;">Participantes aparecerao quando a edicao iniciar</p>';
    }

    const vivosCount = document.getElementById('tc-vivos-count');
    if (vivosCount) vivosCount.textContent = '';
}

// =====================================================================
// MODO ATIVO (edicao em andamento)
// =====================================================================

async function ativarModoAtivo(status) {
    const modoAtivo = document.getElementById('tc-modo-ativo');
    const modoTeaser = document.getElementById('tc-modo-teaser');
    if (modoAtivo) modoAtivo.style.display = '';
    if (modoTeaser) modoTeaser.style.display = 'none';

    // Header
    const edicaoNome = document.getElementById('tc-edicao-nome');
    if (edicaoNome) edicaoNome.textContent = `${status.edicao.nome} | R${status.edicao.rodadaInicial}-R${status.edicao.rodadaFinal}`;

    // Carregar dados em paralelo
    const [escolhasData, participantesData] = await Promise.allSettled([
        fetchMinhasEscolhas(_ligaId, _timeId),
        fetchParticipantes(_ligaId),
    ]);

    const escolhas = escolhasData.status === 'fulfilled' ? escolhasData.value : null;
    const participantes = participantesData.status === 'fulfilled' ? participantesData.value : null;

    renderizarMeuStatus(escolhas, status);
    renderizarEscolhaRodada(escolhas, status);
    renderizarHistorico(escolhas);
    renderizarParticipantes(participantes);
}

// =====================================================================
// RENDERIZADORES
// =====================================================================

function renderizarMeuStatus(escolhas, status) {
    const container = document.getElementById('tc-meu-status-content');
    const badge = document.getElementById('tc-status-badge');
    if (!container) return;

    if (!escolhas) {
        container.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;">Voce nao esta inscrito nesta edicao</p>';
        return;
    }

    const meuStatus = escolhas.status || 'vivo';
    const rodadasVivas = escolhas.rodadasSobrevividas || 0;
    const timesUsados = (escolhas.timesUsados || []).length;

    // Badge no header
    if (badge) {
        badge.className = `tc-status-badge ${meuStatus}`;
        const labels = { vivo: 'VIVO', eliminado: 'ELIMINADO', campeao: 'CAMPEAO' };
        badge.textContent = labels[meuStatus] || meuStatus.toUpperCase();
    }

    const icons = {
        vivo: '<span class="material-icons" style="color:var(--tc-vivo);font-size:2.5rem;">favorite</span>',
        eliminado: '<span class="material-icons" style="color:var(--tc-eliminado);font-size:2.5rem;">heart_broken</span>',
        campeao: '<span class="material-icons" style="color:var(--app-warning);font-size:2.5rem;">emoji_events</span>',
    };

    container.innerHTML = `
        <div style="text-align:center;padding:var(--app-space-4);">
            ${icons[meuStatus] || icons.vivo}
            <p style="font-family:var(--app-font-brand);font-size:1.25rem;color:white;margin-top:0.5rem;">
                ${meuStatus === 'vivo' ? 'Voce esta VIVO!' : meuStatus === 'campeao' ? 'CAMPEAO!' : 'Eliminado'}
            </p>
            <div style="display:flex;justify-content:center;gap:2rem;margin-top:1rem;">
                <div>
                    <p style="font-family:var(--app-font-mono);font-size:1.5rem;color:white;font-weight:700;">${rodadasVivas}</p>
                    <p style="font-size:var(--app-font-xs);color:var(--app-text-muted);">Rodadas</p>
                </div>
                <div>
                    <p style="font-family:var(--app-font-mono);font-size:1.5rem;color:white;font-weight:700;">${timesUsados}</p>
                    <p style="font-size:var(--app-font-xs);color:var(--app-text-muted);">Times usados</p>
                </div>
            </div>
            ${escolhas.motivoEliminacao ? `<p style="font-size:var(--app-font-xs);color:var(--tc-eliminado);margin-top:0.75rem;">Motivo: ${traduzirMotivo(escolhas.motivoEliminacao)} na R${escolhas.rodadaEliminacao}</p>` : ''}
        </div>
    `;
}

function renderizarEscolhaRodada(escolhas, status) {
    const section = document.getElementById('tc-escolha-section');
    const container = document.getElementById('tc-escolha-content');
    const rodadaLabel = document.getElementById('tc-rodada-label');
    if (!section || !container) return;

    // So exibir se estiver vivo e edicao em andamento
    if (!escolhas || escolhas.status !== 'vivo' || status.edicao.status !== 'em_andamento') {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    const rodadaAtual = status.edicao.rodadaAtual || status.edicao.rodadaInicial;
    if (rodadaLabel) rodadaLabel.textContent = `R${rodadaAtual}`;

    // Verificar se ja escolheu nesta rodada
    const escolhaFeita = (escolhas.escolhas || []).find(e => e.rodada === rodadaAtual);
    if (escolhaFeita) {
        container.innerHTML = `
            <div class="tc-escolha-atual">
                <p class="tc-escolha-atual-label">Sua escolha para a R${rodadaAtual}</p>
                <div style="display:flex;align-items:center;justify-content:center;gap:0.75rem;margin-top:0.75rem;">
                    <img src="/escudos/${escolhaFeita.timeEscolhidoId}.png" class="tc-time-escudo"
                         onerror="this.src='/escudos/default.png'" alt="">
                    <span class="tc-escolha-atual-time">${escapeHtml(escolhaFeita.timeEscolhidoNome)}</span>
                </div>
                <p style="font-size:var(--app-font-xs);color:var(--app-text-muted);margin-top:0.75rem;">
                    Aguardando resultado...
                </p>
            </div>
        `;
        return;
    }

    // Renderizar grid de times para escolha
    const timesUsados = escolhas.timesUsados || [];

    container.innerHTML = `
        <p style="font-size:var(--app-font-sm);color:var(--app-text-secondary);margin-bottom:var(--app-space-3);">
            Escolha o time que vai <strong style="color:var(--tc-vivo);">VENCER</strong> na rodada ${rodadaAtual}:
        </p>
        <div class="tc-time-grid" id="tc-times-grid">
            ${TIMES_SERIE_A.map(t => {
                const usado = timesUsados.includes(t.id);
                return `
                    <div class="tc-time-card ${usado ? 'usado' : ''}"
                         data-time-id="${t.id}" data-time-nome="${escapeHtml(t.nome)}"
                         ${usado ? '' : `onclick="window._tcSelecionarTime(${t.id}, '${escapeHtml(t.nome)}')"` }>
                        <img src="/escudos/${t.id}.png" class="tc-time-escudo"
                             onerror="this.src='/escudos/default.png'" alt="${escapeHtml(t.nome)}">
                        <span class="tc-time-nome">${escapeHtml(t.nome)}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <button id="tc-btn-confirmar" class="tc-btn-confirmar" disabled
                onclick="window._tcConfirmarEscolha()">
            Confirmar Escolha
        </button>
    `;
}

function renderizarHistorico(escolhas) {
    const container = document.getElementById('tc-historico-content');
    if (!container) return;

    if (!escolhas || !escolhas.escolhas || escolhas.escolhas.length === 0) {
        container.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;">Nenhuma escolha registrada</p>';
        return;
    }

    // Ordenar por rodada decrescente
    const lista = [...escolhas.escolhas].sort((a, b) => b.rodada - a.rodada);

    const renderEscolhaRow = (e) => `
        <div class="tc-escolha-historico ${e.resultado}">
            <span class="tc-escolha-rodada">R${e.rodada}</span>
            <img src="/escudos/${e.timeEscolhidoId}.png" style="width:20px;height:20px;object-fit:contain;"
                 onerror="this.src='/escudos/default.png'" alt="">
            <span class="tc-escolha-time">${escapeHtml(e.timeEscolhidoNome || 'Time')}</span>
            ${e.placarMandante != null ? `<span style="font-family:var(--app-font-mono);font-size:var(--app-font-xs);color:var(--app-text-muted);">${e.placarMandante}-${e.placarVisitante}</span>` : ''}
            <span class="tc-escolha-resultado ${e.resultado}">${traduzirResultado(e.resultado)}</span>
        </div>
    `;

    if (lista.length <= 3) {
        container.innerHTML = lista.map(renderEscolhaRow).join('');
    } else {
        const recentes = lista.slice(0, 3);
        const antigos = lista.slice(3);
        const toggleId = 'tc-historico-antigos-' + Date.now();
        container.innerHTML = recentes.map(renderEscolhaRow).join('') + `
            <div style="text-align:center;margin:8px 0;">
                <span onclick="(function(el){var sec=document.getElementById('${toggleId}');if(sec.style.display==='none'){sec.style.display='block';el.innerHTML='<span class=\\'material-icons\\' style=\\'font-size:14px;vertical-align:middle;margin-right:4px;\\'>expand_less</span>Ocultar historico anterior';}else{sec.style.display='none';el.innerHTML='<span class=\\'material-icons\\' style=\\'font-size:14px;vertical-align:middle;margin-right:4px;\\'>expand_more</span>Ver historico completo (${antigos.length} anteriores)';}})(this)"
                      style="cursor:pointer;font-size:var(--app-font-xs, 0.75rem);color:var(--app-text-muted);display:inline-flex;align-items:center;">
                    <span class="material-icons" style="font-size:14px;vertical-align:middle;margin-right:4px;">expand_more</span>Ver historico completo (${antigos.length} anteriores)
                </span>
            </div>
            <div id="${toggleId}" style="display:none;">
                ${antigos.map(renderEscolhaRow).join('')}
            </div>
        `;
    }
}

function renderizarParticipantes(data) {
    const container = document.getElementById('tc-participantes-content');
    const vivosCount = document.getElementById('tc-vivos-count');
    if (!container) return;

    if (!data || !data.participantes || data.participantes.length === 0) {
        container.innerHTML = '<p style="color:var(--app-text-muted);text-align:center;">Nenhum participante</p>';
        return;
    }

    if (vivosCount) vivosCount.textContent = `${data.vivosCount} vivos`;

    container.innerHTML = data.participantes.map(p => `
        <div class="tc-participante-card ${p.status} ${p.timeId === _timeId ? 'border-2' : ''}"
             style="${p.timeId === _timeId ? 'border-color:var(--tc-primary);' : ''}">
            <img src="/escudos/${p.escudoId || 'default'}.png" class="tc-participante-escudo"
                 onerror="this.src='/escudos/default.png'" alt="">
            <span class="tc-participante-nome">${escapeHtml(p.nomeTime || p.nomeCartoleiro || 'Time')}</span>
            <span style="font-family:var(--app-font-mono);font-size:var(--app-font-xs);color:var(--app-text-muted);">
                ${p.rodadasSobrevividas || 0}R
            </span>
            <span class="tc-participante-status ${p.status}">${traduzirStatus(p.status)}</span>
        </div>
    `).join('');
}

// =====================================================================
// INTERACAO: SELECIONAR E CONFIRMAR
// =====================================================================

window._tcSelecionarTime = function(timeId, timeNome) {
    _timeSelecionado = { id: timeId, nome: timeNome };

    // Atualizar visual
    const cards = document.querySelectorAll('.tc-time-card');
    cards.forEach(c => c.classList.remove('selecionado'));

    const card = document.querySelector(`.tc-time-card[data-time-id="${timeId}"]`);
    if (card) card.classList.add('selecionado');

    const btn = document.getElementById('tc-btn-confirmar');
    if (btn) {
        btn.disabled = false;
        btn.textContent = `Confirmar: ${timeNome}`;
    }
};

window._tcConfirmarEscolha = async function() {
    if (!_timeSelecionado || !_ligaId || !_timeId) return;

    const btn = document.getElementById('tc-btn-confirmar');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Enviando...';
    }

    try {
        const status = await fetchStatus(_ligaId);
        const rodada = status.edicao.rodadaAtual || status.edicao.rodadaInicial;

        const resultado = await postEscolha(_ligaId, {
            timeId: _timeId,
            rodada,
            timeEscolhidoId: _timeSelecionado.id,
            timeEscolhidoNome: _timeSelecionado.nome,
        });

        if (resultado.success) {
            if (window.Log) Log.info('TIRO-CERTO', `Escolha confirmada: ${_timeSelecionado.nome}`);
            // Recarregar tela
            await inicializarTiroCertoParticipante({
                participante: _participante,
                ligaId: _ligaId,
                timeId: _timeId,
            });
        } else {
            alert(resultado.error || 'Erro ao registrar escolha');
            if (btn) {
                btn.disabled = false;
                btn.textContent = `Confirmar: ${_timeSelecionado.nome}`;
            }
        }
    } catch (err) {
        if (window.Log) Log.error('TIRO-CERTO', 'Erro ao confirmar:', err.message);
        alert('Erro ao enviar escolha. Tente novamente.');
        if (btn) {
            btn.disabled = false;
            btn.textContent = `Confirmar: ${_timeSelecionado.nome}`;
        }
    }
};

// =====================================================================
// HELPERS
// =====================================================================

function traduzirResultado(resultado) {
    const map = { vitoria: 'VITORIA', empate: 'EMPATE', derrota: 'DERROTA', pendente: 'PENDENTE' };
    return map[resultado] || resultado?.toUpperCase() || '-';
}

function traduzirStatus(status) {
    const map = { vivo: 'VIVO', eliminado: 'ELIMINADO', campeao: 'CAMPEAO' };
    return map[status] || status?.toUpperCase() || '-';
}

function traduzirMotivo(motivo) {
    const map = { derrota: 'Derrota', empate: 'Empate', wo: 'W.O. (sem escolha)' };
    return map[motivo] || motivo || '-';
}

// Log de carregamento
if (window.Log) Log.info('TIRO-CERTO', 'Modulo participante-tiro-certo.js carregado');
