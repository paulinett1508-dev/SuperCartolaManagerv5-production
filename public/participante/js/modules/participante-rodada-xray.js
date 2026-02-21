// =====================================================
// MÓDULO: RAIO-X DA RODADA - v1.1
// v1.1: Botão refresh — refaz ambas as APIs
// =====================================================

if (window.Log) Log.info('PARTICIPANTE-XRAY', 'Módulo v1.1 carregando...');

// Estado do módulo
let _ligaId = null;
let _timeId = null;
let _rodada = null;
let _temporada = null;
let _dados = null;
let _refreshBtn = null;

/**
 * Inicializa o módulo Raio-X da Rodada
 * Pode receber rodada via payload.params ou via window.xrayParams
 */
export async function inicializarRodadaXrayParticipante(payload) {
    if (window.Log) Log.info('PARTICIPANTE-XRAY', '🚀 Inicializando módulo v1.0...');

    try {
        // Obter dados do participante
        const participante = payload?.participante;
        _ligaId = payload?.ligaId || participante?.ligaId;
        _timeId = payload?.timeId || participante?.timeId;

        // Parâmetros da rodada (passados via window.xrayParams pelo módulo de rodadas)
        const params = window.xrayParams || {};
        _rodada = params.rodada || null;
        _temporada = params.temporada || null;

        if (!_ligaId || !_timeId || !_rodada) {
            mostrarEstadoVazio('Parâmetros insuficientes para gerar o raio-x.');
            return;
        }

        // Setup back button
        const backBtn = document.getElementById('xrayBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                delete window.xrayParams;
                window.participanteNav?.navegarPara('rodadas');
            });
        }

        // Setup refresh button
        _refreshBtn = document.getElementById('xrayRefreshBtn');
        if (_refreshBtn) {
            _refreshBtn.addEventListener('click', async () => {
                if (_refreshBtn.disabled) return;
                await carregarRaioX(true);
            });
        }

        // Setup collapsible sections
        inicializarCollapsible();

        // Carregar dados
        await carregarRaioX();

    } catch (error) {
        if (window.Log) Log.error('PARTICIPANTE-XRAY', '❌ Erro:', error);
        mostrarEstadoVazio(error.message || 'Erro ao carregar raio-x.');
    }
}

/**
 * Busca dados do backend e renderiza
 * @param {boolean} isRefresh - true quando disparado pelo botão refresh
 */
async function carregarRaioX(isRefresh = false) {
    // Animar botão refresh
    if (_refreshBtn) {
        _refreshBtn.disabled = true;
        _refreshBtn.classList.add('spinning');
    }

    if (!isRefresh) mostrarLoading(true);

    try {
        const url = `/api/rodada-xray/${_ligaId}/${_rodada}/${_timeId}${_temporada ? `?temporada=${_temporada}` : ''}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro ${response.status}`);
        }

        _dados = await response.json();

        if (_dados.time.rodadaNaoJogada) {
            mostrarEstadoVazio('Você não jogou esta rodada.');
            return;
        }

        renderizar(_dados, isRefresh);
        mostrarLoading(false);

        // Atualizar subtitle com timestamp após refresh
        if (isRefresh) {
            const sub = document.getElementById('xraySubtitulo');
            if (sub) {
                const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const textoAtual = sub.textContent.replace(/ • Atualizado.*$/, '');
                sub.textContent = `${textoAtual} • Atualizado às ${hora}`;
            }
        }

    } catch (error) {
        if (window.Log) Log.error('PARTICIPANTE-XRAY', 'Erro ao carregar:', error);
        mostrarEstadoVazio(error.message);
    } finally {
        if (_refreshBtn) {
            _refreshBtn.classList.remove('spinning');
            _refreshBtn.disabled = false;
        }
    }
}

/**
 * Renderiza todos os componentes do raio-x
 * @param {Object} dados
 * @param {boolean} forceRefresh - força bypass de cache no upcoming
 */
function renderizar(dados, forceRefresh = false) {
    renderizarSubtitulo(dados);
    renderizarScoreCard(dados);
    renderizarComparacao(dados);
    renderizarCapitao(dados);
    renderizarPosicoes(dados);
    renderizarDistribuicao(dados);
    carregarEExibirUpcoming(forceRefresh);
}

function renderizarSubtitulo(dados) {
    const el = document.getElementById('xraySubtitulo');
    if (el) {
        el.textContent = `Rodada ${dados.rodada} • ${dados.time.nome_cartola}`;
    }
}

function renderizarScoreCard(dados) {
    const { time } = dados;

    setTextById('xrayPontos', formatarPontos(time.pontos));
    setTextById('xrayPosicao', `${time.posicao}º`);
    setTextById('xrayParticipantes', `de ${time.totalParticipantes}`);

    // Financeiro
    const finEl = document.getElementById('xrayFinanceiro');
    if (finEl) {
        const valor = time.valorFinanceiro;
        finEl.textContent = formatarDinheiro(valor);
        finEl.className = 'xray-score-meta-value ' + (
            valor > 0 ? 'xray-financeiro-positivo' :
            valor < 0 ? 'xray-financeiro-negativo' :
            'xray-financeiro-neutro'
        );
    }
}

function renderizarComparacao(dados) {
    const container = document.getElementById('xrayCompBars');
    if (!container) return;

    const { time, liga } = dados;
    const maxPontos = Math.max(time.pontos, liga.melhor, liga.media, 1);

    const rows = [
        { label: 'Você', value: time.pontos, cls: 'meu', diff: null },
        { label: 'Média', value: liga.media, cls: 'media', diff: liga.diferenca_media },
        { label: 'Melhor', value: liga.melhor, cls: 'melhor', diff: liga.diferenca_melhor },
    ];

    container.innerHTML = rows.map(row => {
        const pct = maxPontos > 0 ? (Math.max(row.value, 0) / maxPontos) * 100 : 0;
        const diffHtml = row.diff !== null
            ? `<span class="xray-comp-diff ${row.diff >= 0 ? 'positivo' : 'negativo'}">${row.diff >= 0 ? '+' : ''}${row.diff.toFixed(1)}</span>`
            : '';

        return `
            <div class="xray-comp-row">
                <span class="xray-comp-label">${row.label}</span>
                <div class="xray-comp-bar-track">
                    <div class="xray-comp-bar-fill ${row.cls}" style="width:${pct.toFixed(1)}%"></div>
                </div>
                <span class="xray-comp-value">${formatarPontos(row.value)}</span>
                ${diffHtml}
            </div>
        `;
    }).join('');
}

function renderizarCapitao(dados) {
    const container = document.getElementById('xrayCapitaoSection');
    if (!container) return;

    if (!dados.capitao) {
        container.innerHTML = '';
        return;
    }

    const cap = dados.capitao;

    container.innerHTML = `
        <div class="xray-capitao-card">
            <div class="xray-capitao-badge">
                <span class="material-icons">star</span>
            </div>
            <div class="xray-capitao-info">
                <div class="xray-capitao-nome">${escapeHtml(cap.apelido)}</div>
                <div class="xray-capitao-pos">${cap.posicao} • Capitão</div>
            </div>
            <div class="xray-capitao-stats">
                <div class="xray-capitao-pontos">${formatarPontos(cap.pontos_base * 2)}</div>
                <div class="xray-capitao-bonus">+${formatarPontos(cap.bonus)} bônus (${cap.impacto_percentual}%)</div>
            </div>
        </div>
    `;
}

function renderizarPosicoes(dados) {
    const container = document.getElementById('xrayPosicaoGrid');
    if (!container) return;

    const posicoes = dados.analise_posicao;
    const maxPontosPosicao = Math.max(
        ...Object.values(posicoes).map(p => Math.abs(p.pontos_total)),
        1
    );

    // Ordem fixa: GOL, LAT, ZAG, MEI, ATA, TEC
    const ordem = ['1', '2', '3', '4', '5', '6'];

    container.innerHTML = ordem.map(posId => {
        const pos = posicoes[posId];
        if (!pos || pos.quantidade === 0) return '';

        const pct = maxPontosPosicao > 0
            ? (Math.abs(pos.pontos_total) / maxPontosPosicao) * 100
            : 0;

        return `
            <div class="xray-posicao-row">
                <span class="xray-posicao-badge" style="background:${pos.cor}">${pos.sigla}</span>
                <div class="xray-posicao-bar-track">
                    <div class="xray-posicao-bar-fill" style="width:${pct.toFixed(1)}%;background:${pos.cor}">
                        <span class="xray-posicao-bar-label">${pos.atletas.join(', ')}</span>
                    </div>
                </div>
                <span class="xray-posicao-value">${formatarPontos(pos.pontos_total)}</span>
            </div>
        `;
    }).join('');
}

function renderizarDistribuicao(dados) {
    const container = document.getElementById('xrayDistribBars');
    if (!container || !dados.distribuicao || dados.distribuicao.length === 0) return;

    const maxCount = Math.max(...dados.distribuicao.map(f => f.count), 1);

    container.innerHTML = dados.distribuicao.map(faixa => {
        const heightPct = maxCount > 0 ? (faixa.count / maxCount) * 100 : 0;
        const cls = faixa.is_minha_faixa ? 'destaque' : 'normal';

        return `
            <div class="xray-distrib-bar-col">
                <span class="xray-distrib-count">${faixa.count}</span>
                <div class="xray-distrib-bar ${cls}" style="height:${Math.max(heightPct, 4)}%"></div>
                <span class="xray-distrib-label">${faixa.label}</span>
            </div>
        `;
    }).join('');
}

/**
 * Busca dados de contexto/disputas e renderiza Performance Geral + O que vem por aí
 * @param {boolean} forceRefresh - quando true, bypassa cache do browser
 */
async function carregarEExibirUpcoming(forceRefresh = false) {
    try {
        const url = `/api/rodada-contexto/${_ligaId}/${_rodada}/${_timeId}${_temporada ? `?temporada=${_temporada}` : ''}`;
        const response = await fetch(url, forceRefresh ? { cache: 'no-store' } : {});

        if (!response.ok) return;

        const contexto = await response.json();
        const disputas = contexto.disputas || {};

        // Seção 1: Performance Geral (módulos individuais)
        renderizarPerformanceGeral(disputas);

        // Seção 2: O que vem por aí (competições + em breve)
        renderizarUpcoming(disputas);
    } catch (error) {
        if (window.Log) Log.error('PARTICIPANTE-XRAY', 'Erro ao carregar contexto:', error);
    }
}

/**
 * Renderiza cards compactos de performance individual na grid 2x2
 * Módulos: Capitão de Luxo, Artilheiro Campeão, Luva de Ouro, TOP 10
 */
async function renderizarPerformanceGeral(disputas) {
    const section = document.getElementById('xrayPerfSection');
    const grid = document.getElementById('xrayPerfGrid');
    if (!section || !grid) return;

    const cards = [];

    // Capitão de Luxo
    if (disputas.capitao_luxo) {
        const cap = disputas.capitao_luxo;
        cards.push(`
            <div class="xray-perf-card mod-capitao">
                <div class="xray-perf-icon"><span class="material-icons" style="color: var(--module-capitao-primary, #8b5cf6)">diamond</span></div>
                <div class="xray-perf-info">
                    <div class="xray-perf-title">Capitão de Luxo</div>
                    <div class="xray-perf-value">${cap.sua_posicao}º</div>
                    <div class="xray-perf-sub">${(Math.trunc((cap.seus_pontos||0) * 10) / 10).toFixed(1)} pts acumulados</div>
                </div>
            </div>
        `);
    }

    // Artilheiro Campeão
    if (disputas.artilheiro) {
        const art = disputas.artilheiro;
        cards.push(`
            <div class="xray-perf-card mod-artilheiro">
                <div class="xray-perf-icon"><span class="material-icons" style="color: var(--module-artilheiro-primary, #22c55e)">sports_soccer</span></div>
                <div class="xray-perf-info">
                    <div class="xray-perf-title">Artilheiro Campeão</div>
                    <div class="xray-perf-value">${art.sua_posicao}º</div>
                    <div class="xray-perf-sub">${art.seus_gols} gols • saldo ${art.seu_saldo || 0}</div>
                </div>
            </div>
        `);
    }

    // Luva de Ouro
    if (disputas.luva_ouro) {
        const luva = disputas.luva_ouro;
        cards.push(`
            <div class="xray-perf-card mod-luva">
                <div class="xray-perf-icon"><span class="material-icons" style="color: var(--module-luva-primary, #ffd700)">sports_mma</span></div>
                <div class="xray-perf-info">
                    <div class="xray-perf-title">Luva de Ouro</div>
                    <div class="xray-perf-value">${luva.sua_posicao}º</div>
                    <div class="xray-perf-sub">${luva.seus_pontos ? (Math.trunc(luva.seus_pontos * 10) / 10).toFixed(1) : 0} pts</div>
                </div>
            </div>
        `);
    }

    // TOP 10 - buscar separadamente se módulo ativo
    try {
        const top10Card = await buscarTop10Card();
        if (top10Card) cards.push(top10Card);
    } catch (e) {
        // Silencioso se TOP 10 não disponível
    }

    if (cards.length === 0) {
        section.style.display = 'none';
        return;
    }

    grid.innerHTML = cards.join('');
    section.style.display = '';
}

/**
 * Busca cache do TOP 10 e retorna card HTML se participante está nos Mitos ou Micos
 */
async function buscarTop10Card() {
    try {
        // Busca o cache TOP 10 mais recente (sem rodada = backend retorna último)
        const url = `/api/top10/cache/${_ligaId}?temporada=${_temporada || new Date().getFullYear()}`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.cached) return null;

        const mitos = data.mitos || [];
        const micos = data.micos || [];

        // Verificar se participante está nos Mitos
        const meuMito = mitos.find(m => m.timeId === _timeId);
        if (meuMito) {
            return `
                <div class="xray-perf-card mod-top10">
                    <div class="xray-perf-icon"><span class="material-icons" style="color: var(--xray-primary)">military_tech</span></div>
                    <div class="xray-perf-info">
                        <div class="xray-perf-title">TOP 10 - Mito</div>
                        <div class="xray-perf-value">${meuMito.posicao}º</div>
                        <div class="xray-perf-sub">${meuMito.pontos ? (Math.trunc(meuMito.pontos * 10) / 10).toFixed(1) : 0} pts</div>
                    </div>
                </div>
            `;
        }

        // Verificar se está nos Micos
        const meuMico = micos.find(m => m.timeId === _timeId);
        if (meuMico) {
            return `
                <div class="xray-perf-card mod-top10">
                    <div class="xray-perf-icon"><span class="material-icons" style="color: var(--xray-danger)">trending_down</span></div>
                    <div class="xray-perf-info">
                        <div class="xray-perf-title">TOP 10 - Mico</div>
                        <div class="xray-perf-value">${meuMico.posicao}º</div>
                        <div class="xray-perf-sub">${meuMico.pontos ? (Math.trunc(meuMico.pontos * 10) / 10).toFixed(1) : 0} pts</div>
                    </div>
                </div>
            `;
        }

        return null; // Participante não está no TOP 10
    } catch (e) {
        return null;
    }
}

/**
 * Renderiza "O que vem por aí..." - apenas competições/ligas
 * PC, Mata-Mata (ativos) + placeholders "Em breve"
 */
function renderizarUpcoming(disputas) {
    const container = document.getElementById('xrayUpcomingLista');
    if (!container) return;

    const cards = [];

    // Pontos Corridos - foco no PRÓXIMO jogo
    if (disputas.pontos_corridos) {
        const pc = disputas.pontos_corridos;

        if (pc.proximo_confronto) {
            // Próximo jogo disponível - destaque principal
            const resultIcon = pc.seu_confronto.resultado === 'vitoria'
                ? '<span class="material-icons xray-inline-icon success">check_circle</span>'
                : pc.seu_confronto.resultado === 'derrota'
                ? '<span class="material-icons xray-inline-icon danger">cancel</span>'
                : '<span class="material-icons xray-inline-icon neutral">balance</span>';

            cards.push(`
                <div class="xray-upcoming-card">
                    <div class="xray-upcoming-icon"><span class="material-icons" style="color: var(--xray-success)">sports_soccer</span></div>
                    <div class="xray-upcoming-info">
                        <div class="xray-upcoming-title">PONTOS CORRIDOS • Rodada ${pc.proximo_confronto.rodada}</div>
                        <div class="xray-upcoming-desc">
                            Próximo: vs ${escapeHtml(pc.proximo_confronto.adversario.nome)}
                        </div>
                        <div class="xray-upcoming-meta">
                            ${pc.minha_posicao}º lugar • ${pc.zona}
                        </div>
                        <div class="xray-upcoming-meta" style="margin-top:2px;">
                            ${resultIcon} Última: ${(Math.trunc((pc.seu_confronto.voce||0) * 10) / 10).toFixed(1)} × ${(Math.trunc((pc.seu_confronto.adversario.pontos||0) * 10) / 10).toFixed(1)} ${escapeHtml(pc.seu_confronto.adversario.nome)}
                        </div>
                    </div>
                    <span class="xray-upcoming-badge posicao">${pc.minha_posicao}º</span>
                </div>
            `);
        } else {
            // Sem próximo jogo definido - mostra status atual
            cards.push(`
                <div class="xray-upcoming-card">
                    <div class="xray-upcoming-icon"><span class="material-icons" style="color: var(--xray-success)">sports_soccer</span></div>
                    <div class="xray-upcoming-info">
                        <div class="xray-upcoming-title">PONTOS CORRIDOS</div>
                        <div class="xray-upcoming-desc">
                            ${pc.minha_posicao}º lugar • ${pc.zona}
                        </div>
                        <div class="xray-upcoming-meta">
                            Próximo adversário será definido em breve
                        </div>
                    </div>
                    <span class="xray-upcoming-badge posicao">${pc.minha_posicao}º</span>
                </div>
            `);
        }
    }

    // Mata-Mata
    if (disputas.mata_mata) {
        const mm = disputas.mata_mata;
        const isClassificado = mm.seu_confronto.resultado === 'classificado';
        const statusText = isClassificado ? 'Classificado!' : mm.seu_confronto.resultado === 'eliminado' ? 'Eliminado' : 'Aguardando';
        const statusIcon = isClassificado
            ? '<span class="material-icons xray-inline-icon success">emoji_events</span>'
            : mm.seu_confronto.resultado === 'eliminado'
            ? '<span class="material-icons xray-inline-icon danger">heart_broken</span>'
            : '<span class="material-icons xray-inline-icon neutral">hourglass_empty</span>';

        let descExtra = '';
        if (isClassificado && mm.proxima_fase) {
            descExtra = `<div class="xray-upcoming-meta" style="margin-top:4px;"><span class="material-icons" style="font-size:14px;vertical-align:middle;color:var(--xray-info)">arrow_forward</span> Próxima fase: ${escapeHtml(mm.proxima_fase)}</div>`;
        }

        cards.push(`
            <div class="xray-upcoming-card">
                <div class="xray-upcoming-icon"><span class="material-icons" style="color: var(--xray-warning)">emoji_events</span></div>
                <div class="xray-upcoming-info">
                    <div class="xray-upcoming-title">MATA-MATA (${escapeHtml(mm.fase_atual)}) • Edição ${mm.edicao}</div>
                    <div class="xray-upcoming-desc">
                        ${statusIcon} ${statusText} — vs ${escapeHtml(mm.seu_confronto.adversario.nome)}
                    </div>
                    <div class="xray-upcoming-meta">
                        Você ${(Math.trunc((mm.seu_confronto.voce||0) * 10) / 10).toFixed(1)} × ${(Math.trunc((mm.seu_confronto.adversario.pontos||0) * 10) / 10).toFixed(1)} ${escapeHtml(mm.seu_confronto.adversario.nome)}
                    </div>
                    ${descExtra}
                </div>
                <span class="xray-upcoming-badge ${isClassificado ? 'classificado' : 'eliminado'}">${statusText}</span>
            </div>
        `);
    }

    // Melhor do Mês (ativo se existir)
    if (disputas.melhor_mes) {
        const mes = disputas.melhor_mes;
        const nomesMes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        cards.push(`
            <div class="xray-upcoming-card">
                <div class="xray-upcoming-icon"><span class="material-icons" style="color: var(--xray-info)">calendar_month</span></div>
                <div class="xray-upcoming-info">
                    <div class="xray-upcoming-title">MELHOR DO MÊS (${nomesMes[mes.mes]}/${mes.ano})</div>
                    <div class="xray-upcoming-desc">
                        ${mes.sua_posicao}º lugar • ${(Math.trunc((mes.seus_pontos||0) * 10) / 10).toFixed(1)} pts
                    </div>
                    ${mes.rodadas_restantes > 0 ? `<div class="xray-upcoming-meta">${mes.rodadas_restantes} rodada(s) restante(s) no mês</div>` : ''}
                </div>
                <span class="xray-upcoming-badge posicao">${mes.sua_posicao}º</span>
            </div>
        `);
    }

    // === PLACEHOLDERS "EM BREVE" ===
    const emBreve = [
        { icon: 'public', nome: 'Bolão Copa do Mundo', desc: 'Palpites nos jogos da Copa' },
        { icon: 'casino', nome: 'Tiro Certo', desc: 'Acerte o placar exato' },
        { icon: 'swords', nome: 'Copa de Times SC', desc: 'Torneio eliminatório entre times' },
        { icon: 'casino', nome: 'RestaUM', desc: 'Sobrevivência rodada a rodada' },
    ];

    emBreve.forEach(item => {
        cards.push(`
            <div class="xray-upcoming-card em-breve">
                <div class="xray-upcoming-icon"><span class="material-icons">${item.icon}</span></div>
                <div class="xray-upcoming-info">
                    <div class="xray-upcoming-title">${item.nome}</div>
                    <div class="xray-upcoming-desc">${item.desc}</div>
                </div>
                <span class="xray-upcoming-badge breve">Em breve</span>
            </div>
        `);
    });

    container.innerHTML = cards.join('');
}

// === HELPERS ===

function mostrarLoading(show) {
    const loading = document.getElementById('xrayLoading');
    const content = document.getElementById('xrayContent');
    if (loading) loading.style.display = show ? 'flex' : 'none';
    if (content) content.style.display = show ? 'none' : 'block';
}

function mostrarEstadoVazio(mensagem) {
    const loading = document.getElementById('xrayLoading');
    const content = document.getElementById('xrayContent');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'none';

    const container = document.getElementById('xrayContainer');
    if (container) {
        // Manter o back button funcional
        container.innerHTML = `
            <button class="xray-back-btn" onclick="delete window.xrayParams; window.participanteNav?.navegarPara('rodadas')">
                <span class="material-icons">arrow_back</span>
                Voltar para Rodadas
            </button>
            <div class="xray-empty">
                <span class="material-icons">search_off</span>
                <p>${escapeHtml(mensagem)}</p>
            </div>
        `;
    }
}

function formatarPontos(valor) {
    if (valor === null || valor === undefined) return '0.00';
    return Number(valor).toFixed(2);
}

function formatarDinheiro(valor) {
    if (!valor || valor === 0) return 'R$ 0';
    const prefix = valor > 0 ? '+R$ ' : '-R$ ';
    return prefix + Math.abs(valor).toFixed(0);
}

function setTextById(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Inicializa seções colapsáveis — todas começam ABERTAS,
 * usuário clica no título para recolher/expandir.
 */
function inicializarCollapsible() {
    const toggles = document.querySelectorAll('.xray-toggle');
    toggles.forEach(toggle => {
        if (toggle._xrayToggleInit) return;
        toggle._xrayToggleInit = true;

        // Default: expandido
        toggle.classList.add('expanded');

        toggle.addEventListener('click', () => {
            const targetId = toggle.dataset.target;
            const target = targetId ? document.getElementById(targetId) : null;
            if (!target) return;

            const isExpanded = toggle.classList.contains('expanded');
            if (isExpanded) {
                target.style.display = 'none';
                toggle.classList.remove('expanded');
            } else {
                target.style.display = '';
                toggle.classList.add('expanded');
            }
        });
    });
}

export default { inicializarRodadaXrayParticipante };
