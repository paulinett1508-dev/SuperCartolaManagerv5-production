// PARTICIPANTE-JOGOS.JS - v5.7 (TEMPO + REFRESH OTIMIZADO)
// ✅ v5.7: Exibe período (1º T/2º T) quando minutos não disponíveis
//          Polling reduzido de 60s para 30s (alinha com cache backend)
//          Indicador de última atualização no footer
// ✅ v5.6: Jogos agrupados por campeonato em menus expandíveis
// ✅ v5.5: Botão "Fechar" visível no footer do modal de detalhes
// ✅ v5.4: Separação correta em 3 seções
//          - "Ao Vivo": apenas jogos realmente ao vivo (1H, 2H, HT, etc.)
//          - "Hoje": jogos agendados que ainda não começaram
//          - "Encerrados": jogos finalizados
// ✅ v5.3: Separação em seções "Em Andamento" e "Encerrados"
//          - Jogos ao vivo + agendados em "Em Andamento"
//          - Jogos finalizados em "Encerrados"
// ✅ v5.2: Layout compacto - reducao de fontes, paddings, escudos (~15-25%)
// ✅ v5.1: Font-brand (Russo One) aplicado corretamente:
//          - Nome da liga no header do card
//          - Placar (ao vivo e encerrado)
//          - VS em jogos agendados
// ✅ v5.0: Modal com tabs (Eventos | Estatisticas | Escalacoes)
//          - Barras comparativas de posse, chutes, escanteios
//          - Lista de titulares com formacao tatica
//          - Nomes de campeonatos melhorados (backend v3.2)
// ✅ v4.1: Russo One (font-brand) nos titulos e placar
// ✅ v4.0: Eventos em tempo real (gols, cartoes), auto-refresh, modal de detalhes
// ✅ v3.0: Suporte a jogos ao vivo, agendados e encerrados
//          - Mostra placar para jogos ao vivo E encerrados
//          - Badge de status individual por jogo
//          - Ordenação: Ao vivo > Agendados > Encerrados
// ✅ v2.1: FIX - Container do placar com min-w e shrink-0
// Exibe jogos do dia na tela inicial (API-Football + Globo fallback)

// Icones Material para eventos
const EVENTO_ICONES = {
  gol: { icon: 'sports_soccer', cor: 'text-green-400' },
  gol_penalti: { icon: 'sports_soccer', cor: 'text-green-400', badge: 'P' },
  gol_contra: { icon: 'sports_soccer', cor: 'text-red-400', badge: 'GC' },
  cartao_amarelo: { icon: 'style', cor: 'text-yellow-400' },
  cartao_vermelho: { icon: 'style', cor: 'text-red-500' },
  cartao_segundo_amarelo: { icon: 'style', cor: 'text-red-500', badge: '2A' },
  substituicao: { icon: 'swap_horiz', cor: 'text-blue-400' },
  var: { icon: 'videocam', cor: 'text-purple-400' }
};

// Intervalo de auto-refresh (ms)
// v5.7: Reduzido de 60s para 30s para acompanhar TTL do cache backend
const AUTO_REFRESH_INTERVAL = 30000; // 30 segundos
let refreshTimer = null;

// Status que indicam jogo ao vivo
const STATUS_AO_VIVO = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const STATUS_ENCERRADO = ['FT', 'AET', 'PEN'];
const STATUS_AGENDADO = ['NS', 'TBD'];

/**
 * Busca jogos do dia
 * @returns {Promise<{jogos: Array, fonte: string, aoVivo: boolean, estatisticas: Object}>}
 */
export async function obterJogosAoVivo() {
    try {
        const res = await fetch('/api/jogos-ao-vivo');
        const data = await res.json();

        return {
            jogos: data.jogos || [],
            fonte: data.fonte || 'soccerdata',
            aoVivo: data.aoVivo || false,
            estatisticas: data.estatisticas || {},
            mensagem: data.mensagem || null,
            atualizadoEm: data.atualizadoEm || new Date().toISOString(),
            copa: data.copa || null, // Copa do Mundo 2026 - seção separada
        };
    } catch (err) {
        console.error('[JOGOS] Erro ao buscar jogos:', err);
        return { jogos: [], fonte: 'erro', aoVivo: false, estatisticas: {}, copa: null };
    }
}

/**
 * Alias para compatibilidade com codigo antigo
 */
export async function obterJogosDoDia(timeId) {
    return obterJogosAoVivo();
}

/**
 * Verifica se jogo está ao vivo
 */
function isJogoAoVivo(jogo) {
    return STATUS_AO_VIVO.includes(jogo.statusRaw);
}

/**
 * Verifica se jogo está encerrado
 */
function isJogoEncerrado(jogo) {
    return STATUS_ENCERRADO.includes(jogo.statusRaw);
}

/**
 * Verifica se jogo está agendado
 */
function isJogoAgendado(jogo) {
    return STATUS_AGENDADO.includes(jogo.statusRaw);
}

/**
 * Formata ISO timestamp para hora local (HH:MM)
 * @param {string} isoString - ISO timestamp
 * @returns {string} Hora formatada (ex: "14:35")
 */
function formatarTimestamp(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });
    } catch {
        return '';
    }
}

/**
 * Renderiza card de jogos do dia - v5.8 (Colapsável + Meu Time)
 * @param {Array} jogos - Lista de jogos
 * @param {string} fonte - Fonte dos dados (soccerdata, cache-stale, globo)
 * @param {boolean} aoVivo - Se ha jogos ao vivo
 * @param {string} atualizadoEm - ISO timestamp da última atualização
 * @param {Object|null} clubeInfo - { clubeId, clubeNome } do participante (opcional)
 */
export function renderizarJogosAoVivo(jogos, fonte = 'soccerdata', aoVivo = false, atualizadoEm = null, clubeInfo = null) {
    if (!jogos || !jogos.length) return '';

    // ✅ v5.6: Agenda do dia (agendados) em bloco separado
    const jogosAgendados = jogos
        .filter(j => isJogoAgendado(j))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // ✅ v5.6: Agrupar por campeonato (liga)
    const jogosPorLiga = jogos.reduce((acc, jogo) => {
        const liga = jogo.liga || 'Outros';
        if (!acc[liga]) acc[liga] = [];
        acc[liga].push(jogo);
        return acc;
    }, {});

    // Fonte dos dados para footer
    const fonteTexto = fonte === 'soccerdata' ? 'SoccerDataAPI'
        : fonte === 'cache-stale' ? 'Cache Stale'
        : fonte === 'globo' ? 'Globo Esporte'
        : fonte === 'api-football' ? 'API-Football'
        : fonte?.includes('+') ? fonte.replace('soccerdata', 'SoccerData').replace('api-football', 'API-Football').replace('globo', 'Globo')
        : fonte || 'Fonte desconhecida';

    // ✅ v5.8: Seção "Meu Time" - jogos do clube do participante
    const meuTimeHtml = clubeInfo ? _renderizarMeuTime(jogos, clubeInfo) : '';

    // Contagem para badge no header
    const totalJogos = jogos.length;
    const jogosAoVivoCount = jogos.filter(j => isJogoAoVivo(j)).length;

    return `
    <section id="jogos-home-section" class="jogos-home-section mx-4 mb-2">
        <!-- Header Colapsável Agenda do Dia (Padrão Copa) -->
        <button class="jogos-home-header" onclick="window.toggleJogosHome && window.toggleJogosHome()">
            <div class="jogos-home-header-left">
                <span class="material-icons" style="font-size:1.25rem;color:var(--app-success);">sports_soccer</span>
                <div>
                    <h2 class="font-brand text-white text-sm tracking-wide" style="margin:0;line-height:1.2;">Agenda do Dia</h2>
                    <span class="text-[10px] text-white/70">${totalJogos} jogos · Brasileirão e mais</span>
                </div>
                ${jogosAoVivoCount > 0 ? `
                    <span class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 ml-2">
                        <span class="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                        ${jogosAoVivoCount} AO VIVO
                    </span>
                ` : ''}
            </div>
            <span class="material-icons jogos-home-chevron">expand_more</span>
        </button>

        <!-- Conteúdo Colapsável -->
        <div class="jogos-home-content collapsed" id="jogos-home-content">
            <div class="space-y-3 p-3">
                ${meuTimeHtml}
                ${jogosAgendados.length > 0
                    ? renderizarSecaoJogos(jogosAgendados, 'Próximos Jogos', 'agendados')
                    : ''}
                ${Object.entries(jogosPorLiga).map(([liga, lista]) => {
                    const ligaAoVivo = lista.filter(j => isJogoAoVivo(j));
                    const ligaEncerrados = lista.filter(j => isJogoEncerrado(j));

                    if (ligaAoVivo.length === 0 && ligaEncerrados.length === 0) return '';

                    const total = ligaAoVivo.length + ligaEncerrados.length;
                    const abertoPorPadrao = ligaAoVivo.length > 0 ? 'open' : '';

                    return `
                    <details class="rounded-xl border border-gray-800/60 bg-gradient-to-br from-gray-800 to-gray-900 shadow-lg" ${abertoPorPadrao}>
                        <summary class="list-none cursor-pointer select-none px-3 py-2 flex items-center justify-between">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="material-icons text-primary text-base">sports_soccer</span>
                                <h3 class="text-xs font-brand text-white tracking-wide truncate">${liga}</h3>
                            </div>
                            <div class="flex items-center gap-2">
                                ${ligaAoVivo.length > 0 ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">${ligaAoVivo.length} ao vivo</span>` : ''}
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-300">${total} jogos</span>
                                <span class="material-icons text-white/40 text-base">expand_more</span>
                            </div>
                        </summary>
                        <div class="px-3 pb-3 space-y-2">
                            ${renderizarSecaoJogos(ligaAoVivo, 'Ao Vivo', 'aoVivo')}
                            ${renderizarSecaoJogos(ligaEncerrados, 'Encerrados', 'encerrados')}
                        </div>
                    </details>
                    `;
                }).join('')}
                <div class="text-center flex flex-col gap-0.5">
                    <span class="text-[10px] text-white/30">Dados: ${fonteTexto}</span>
                    ${atualizadoEm ? `<span class="text-[9px] text-white/20">Atualizado: ${formatarTimestamp(atualizadoEm)}</span>` : ''}
                </div>
            </div>
        </div>
    </section>
    `;
}

/**
 * Renderiza seção "Meu Time" com jogos do clube do participante
 * @param {Array} jogos - Todos os jogos do dia
 * @param {Object} clubeInfo - { clubeId, clubeNome }
 */
function _renderizarMeuTime(jogos, clubeInfo) {
    if (!clubeInfo?.clubeNome) return '';

    const nomeClube = clubeInfo.clubeNome.toLowerCase();
    const jogosMeuTime = jogos.filter(j => {
        const mandante = (j.mandante || '').toLowerCase();
        const visitante = (j.visitante || '').toLowerCase();
        return mandante.includes(nomeClube) || visitante.includes(nomeClube);
    });

    if (jogosMeuTime.length === 0) return '';

    return `
    <div class="meu-time-section rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent p-3 mb-2">
        <div class="flex items-center gap-2 mb-2">
            <img src="/escudos/${clubeInfo.clubeId}.png" class="w-5 h-5 object-contain" onerror="this.style.display='none'" alt="">
            <span class="text-[11px] font-brand text-white/90 tracking-wide">Jogos do ${clubeInfo.clubeNome}</span>
        </div>
        <div class="space-y-1.5">
            ${jogosMeuTime.map(j => renderizarCardJogo(j)).join('')}
        </div>
    </div>
    `;
}

/**
 * Renderiza uma seção de jogos - v5.6
 * @param {Array} jogos - Lista de jogos da seção
 * @param {string} titulo - Título da seção
 * @param {string} tipo - Tipo da seção: 'aoVivo', 'agendados', 'encerrados'
 */
function renderizarSecaoJogos(jogos, titulo, tipo) {
    if (!jogos || !jogos.length) return '';

    // Configurações visuais baseadas no tipo de seção
    let tituloIcone, tagClass, tagTexto, borderClass, iconColor;

    switch (tipo) {
        case 'aoVivo':
            tituloIcone = 'sports_soccer';
            tagClass = 'bg-green-500/20 text-green-400 animate-pulse';
            tagTexto = `${jogos.length} ao vivo`;
            borderClass = 'border-green-500/30';
            iconColor = 'text-green-400';
            break;
        case 'agendados':
            tituloIcone = 'schedule';
            tagClass = 'bg-yellow-400/20 text-yellow-400';
            tagTexto = `${jogos.length} ${jogos.length === 1 ? 'jogo' : 'jogos'}`;
            borderClass = 'border-yellow-500/20';
            iconColor = 'text-yellow-400';
            break;
        case 'encerrados':
        default:
            tituloIcone = 'verified';
            tagClass = 'bg-gray-500/20 text-gray-400';
            tagTexto = `${jogos.length} ${jogos.length === 1 ? 'jogo' : 'jogos'}`;
            borderClass = 'border-gray-700/20';
            iconColor = 'text-gray-400';
            break;
    }

    return `
    <div class="rounded-lg bg-gray-900/40 p-2 border ${borderClass}">
        <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-1.5">
                <span class="material-icons ${iconColor} text-sm">${tituloIcone}</span>
                <h4 class="text-[11px] font-brand text-white/90 tracking-wide">${titulo}</h4>
            </div>
            <span class="text-[9px] px-1.5 py-0.5 rounded ${tagClass}">${tagTexto}</span>
        </div>
        <div class="space-y-1.5">
            ${jogos.map(jogo => renderizarCardJogo(jogo)).join('')}
        </div>
    </div>
    `;
}

/**
 * Renderiza um card de jogo individual - v4.0
 * Suporta: escudos, placar, tempo pulsante, eventos inline, halftime
 */
function renderizarCardJogo(jogo) {
    const aoVivo = isJogoAoVivo(jogo);
    const encerrado = isJogoEncerrado(jogo);
    const agendado = isJogoAgendado(jogo);

    // Classes do container baseado no status
    const containerClass = aoVivo
        ? 'ring-1 ring-green-500/30 bg-gradient-to-r from-green-500/5 to-transparent'
        : encerrado
            ? 'bg-gray-700/30 opacity-80'
            : 'bg-gray-700/50';

    // Se tem logo (API-Football), renderizar com escudos
    if (jogo.logoMandante && jogo.logoVisitante) {
        return `
        <div class="jogo-card flex flex-col py-1.5 px-2.5 rounded-lg ${containerClass} cursor-pointer"
             data-fixture-id="${jogo.id}"
             onclick="window.expandirJogo && window.expandirJogo(${jogo.id})">
            <!-- Header: Liga + Status -->
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-[9px] font-brand text-white/50 truncate max-w-[60%] tracking-wide" title="ID:${jogo.ligaId} | API:${jogo.ligaOriginal}">${escapeHtml(jogo.liga)}</span>
                ${renderizarBadgeStatus(jogo, aoVivo, encerrado)}
            </div>

            <!-- Linha principal: Times e Placar -->
            <div class="flex items-center">
                <!-- Time Mandante -->
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <img src="${jogo.logoMandante}" alt="${escapeHtml(jogo.mandante)}"
                         class="w-6 h-6 object-contain shrink-0"
                         onerror="this.style.display='none'">
                    <span class="text-white font-medium text-[11px] truncate">${escapeHtml(jogo.mandante)}</span>
                </div>

                <!-- Placar Central -->
                <div class="flex flex-col items-center justify-center min-w-[60px] shrink-0 px-1.5">
                    ${renderizarPlacar(jogo, aoVivo, encerrado, agendado)}
                </div>

                <!-- Time Visitante -->
                <div class="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span class="text-white font-medium text-[11px] truncate text-right">${escapeHtml(jogo.visitante)}</span>
                    <img src="${jogo.logoVisitante}" alt="${escapeHtml(jogo.visitante)}"
                         class="w-6 h-6 object-contain shrink-0"
                         onerror="this.style.display='none'">
                </div>
            </div>

            <!-- Footer: Estadio (se encerrado ou ao vivo) -->
            ${jogo.estadio && (aoVivo || encerrado) ? `
                <div class="mt-1.5 text-center">
                    <span class="text-[8px] text-white/25">${escapeHtml(jogo.estadio)}${jogo.cidade ? `, ${escapeHtml(jogo.cidade)}` : ''}</span>
                </div>
            ` : ''}
        </div>
        `;
    }

    // Fallback para dados do Globo (sem logo) - manter comportamento anterior
    return `
    <div class="flex items-center py-2 px-3 bg-gray-700/50 rounded-lg">
        <div class="flex-1 min-w-0">
            <span class="text-white font-medium text-xs truncate block">${escapeHtml(jogo.mandante)}</span>
        </div>
        <div class="flex flex-col items-center justify-center min-w-[60px] shrink-0 px-1">
            ${encerrado ? `
                <span class="text-white/80 font-bold text-sm">${jogo.placar || '-'}</span>
                <span class="text-[9px] text-gray-400">Encerrado</span>
            ` : `
                <span class="text-primary font-bold text-xs">vs</span>
                <span class="text-white/60 text-[10px]">${jogo.horario}</span>
            `}
        </div>
        <div class="flex-1 min-w-0">
            <span class="text-white font-medium text-xs truncate block text-right">${escapeHtml(jogo.visitante)}</span>
        </div>
    </div>
    `;
}

/**
 * Renderiza badge de status (AO VIVO, Intervalo, Encerrado)
 * v5.7: Exibe período (1º T / 2º T) quando minutos não disponíveis
 */
function renderizarBadgeStatus(jogo, aoVivo, encerrado) {
    if (aoVivo) {
        // Ao vivo: badge pulsante com tempo
        let tempoDisplay;

        if (jogo.tempo) {
            // Tem minutos: exibir "45'" ou "45+2'"
            tempoDisplay = jogo.tempoExtra
                ? `${jogo.tempo}+${jogo.tempoExtra}'`
                : `${jogo.tempo}'`;
        } else {
            // Sem minutos: exibir período baseado no statusRaw
            tempoDisplay = jogo.statusRaw === '1H' ? '1º T'
                : jogo.statusRaw === '2H' ? '2º T'
                : jogo.statusRaw === 'LIVE' ? 'AO VIVO'
                : 'AO VIVO';
        }

        const statusTexto = jogo.statusRaw === 'HT' ? 'Intervalo'
            : jogo.statusRaw === 'ET' ? 'Prorrog.'
            : jogo.statusRaw === 'P' ? 'Penaltis'
            : jogo.statusRaw === 'BT' ? 'Interv. Prorr.'
            : tempoDisplay;

        return `
            <span class="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
                <span class="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                ${statusTexto}
            </span>
        `;
    }

    if (encerrado) {
        return `
            <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400">
                Encerrado
            </span>
        `;
    }

    // Agendado
    return `
        <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
            ${jogo.horario}
        </span>
    `;
}

/**
 * Renderiza area do placar
 */
function renderizarPlacar(jogo, aoVivo, encerrado, agendado) {
    if (agendado) {
        return `
            <span class="text-primary font-brand text-base">vs</span>
            <span class="text-white/50 text-[9px]">${jogo.horario}</span>
        `;
    }

    // Ao vivo ou encerrado: mostrar placar com Russo One
    const placarClass = aoVivo ? 'text-white' : 'text-white/70';
    const sizeClass = aoVivo ? 'text-lg' : 'text-base';

    return `
        <span class="${placarClass} ${sizeClass} font-brand leading-tight tabular-nums">
            ${jogo.golsMandante ?? 0} - ${jogo.golsVisitante ?? 0}
        </span>
        ${jogo.placarHT ? `
            <span class="text-[9px] text-white/40">${jogo.placarHT}</span>
        ` : ''}
    `;
}

/**
 * Retorna classe CSS do badge de status
 */
function getStatusBadgeClass(jogo) {
    if (isJogoAoVivo(jogo)) return 'bg-green-500/20 text-green-400 animate-pulse';
    if (isJogoEncerrado(jogo)) return 'bg-gray-500/20 text-gray-400';
    return 'bg-yellow-500/20 text-yellow-400';
}

/**
 * Retorna texto do badge de status
 */
function getStatusBadgeText(jogo) {
    if (isJogoAoVivo(jogo)) return jogo.tempo || 'Ao vivo';
    if (isJogoEncerrado(jogo)) return 'FIM';
    return jogo.horario || 'Agendado';
}

// =====================================================================
// COPA DO MUNDO 2026 - Seção separada
// =====================================================================

/** Data de abertura da Copa do Mundo 2026 (11 Jun 2026 às 17:00 UTC-3) */
const COPA_2026_ABERTURA = new Date('2026-06-11T20:00:00Z');

/** Interval ID do countdown da Copa (para cleanup) */
let _copaCountdownInterval = null;

/**
 * Calcula countdown até a abertura da Copa
 * @returns {{ dias: number, horas: number, minutos: number, expirado: boolean }}
 */
function calcularCountdownCopa() {
    const agora = Date.now();
    const diff = COPA_2026_ABERTURA.getTime() - agora;
    if (diff <= 0) return { dias: 0, horas: 0, minutos: 0, expirado: true };
    const dias = Math.floor(diff / 86400000);
    const horas = Math.floor((diff % 86400000) / 3600000);
    const minutos = Math.floor((diff % 3600000) / 60000);
    return { dias, horas, minutos, expirado: false };
}

/**
 * Atualiza o elemento de countdown inline na faixa Copa (home)
 */
function atualizarCountdownCopaHome() {
    const el = document.getElementById('copa-home-countdown');
    if (!el) {
        pararCountdownCopa();
        return;
    }
    const { dias, horas, minutos, expirado } = calcularCountdownCopa();
    if (expirado) {
        el.textContent = '';
        pararCountdownCopa();
        return;
    }
    el.innerHTML =
        `${dias}<span class="copa-home-countdown-sep">d</span> ` +
        `${String(horas).padStart(2, '0')}<span class="copa-home-countdown-sep">h</span> ` +
        `${String(minutos).padStart(2, '0')}<span class="copa-home-countdown-sep">m</span>`;
}

/**
 * Inicia o interval do countdown Copa (60s). Idempotente.
 */
function iniciarCountdownCopa() {
    pararCountdownCopa();
    atualizarCountdownCopaHome();
    _copaCountdownInterval = setInterval(atualizarCountdownCopaHome, 60000);
}

/**
 * Para o interval do countdown Copa. Idempotente.
 */
function pararCountdownCopa() {
    if (_copaCountdownInterval) {
        clearInterval(_copaCountdownInterval);
        _copaCountdownInterval = null;
    }
}

/**
 * Renderiza seção completa da Copa do Mundo (separada dos jogos brasileiros)
 * @param {Object} copa - Dados da Copa retornados pela API { fase, jogosDoDia, proximosJogos, jogosBrasil, grupos }
 * @returns {string} HTML da seção Copa ou '' se inativa
 */
export function renderizarSecaoCopa(copa) {
    if (!copa || !copa.fase) return '';

    const isPreTorneio = copa.fase === 'pre-torneio';
    const jogosExibir = copa.jogosDoDia?.length > 0 ? copa.jogosDoDia : copa.proximosJogos || [];
    const jogosBrasil = copa.jogosBrasil || [];

    // Título baseado na fase
    const faseTitulo = isPreTorneio ? 'Agenda'
        : copa.fase === 'fase-grupos' ? 'Fase de Grupos'
        : copa.fase === 'mata-mata' ? 'Fase Eliminatória'
        : 'Copa do Mundo';

    // Meta badge: AO VIVO > Countdown (pre-torneio) > fase badge
    let metaBadgeHtml;
    if (copa.temAoVivo) {
        metaBadgeHtml = `<span class="copa-home-live-badge"><span class="copa-home-live-dot"></span>AO VIVO</span>`;
    } else if (isPreTorneio) {
        metaBadgeHtml = `<span id="copa-home-countdown" class="copa-home-countdown"></span>`;
    } else {
        metaBadgeHtml = `<span class="copa-home-phase-badge">${faseTitulo}</span>`;
    }

    const html = `
    <section id="copa-home-section" class="copa-home-section" style="margin:0 1rem 0.5rem;">
        <!-- Header -->
        <button class="copa-home-header" onclick="window.toggleCopaHome && window.toggleCopaHome()">
            <div class="copa-home-header-left">
                <div class="copa-home-icon">
                    <span class="material-icons" style="font-size:1.1rem;color:var(--app-copa-secondary,#D4AF37);">emoji_events</span>
                </div>
                <div class="copa-home-titles">
                    <span class="copa-home-title">Copa do Mundo 2026</span>
                    <span class="copa-home-subtitle">EUA · México · Canadá</span>
                </div>
            </div>
            <div class="copa-home-meta">
                ${metaBadgeHtml}
                <span class="material-icons copa-home-chevron">expand_more</span>
            </div>
        </button>

        <!-- Content -->
        <div class="copa-home-content collapsed" id="copa-home-content">
            ${jogosBrasil.length > 0 ? renderizarJogosBrasilCopa(jogosBrasil) : ''}
            ${jogosExibir.length > 0 ? renderizarJogosCopaLista(jogosExibir, copa.jogosDoDia?.length > 0 ? 'Jogos do Dia' : 'Próximos Jogos') : ''}
            ${jogosExibir.length === 0 && jogosBrasil.length === 0 ? `
                <div class="copa-home-empty">
                    <span class="material-icons">sports_soccer</span>
                    <p>Sem jogos da Copa hoje</p>
                </div>
            ` : ''}
            <div class="copa-home-cta">
                <button
                    onclick="window.participanteNav && window.participanteNav.navegarPara('copa-2026-mundo')"
                    class="copa-home-cta-btn">
                    <span class="material-icons">public</span>
                    HUB COPA 2026
                    <span class="material-icons">arrow_forward</span>
                </button>
            </div>
        </div>
    </section>
    `;

    // Iniciar countdown após render (próximo tick para garantir DOM pronto)
    if (isPreTorneio && !copa.temAoVivo) {
        setTimeout(iniciarCountdownCopa, 0);
    } else {
        pararCountdownCopa();
    }

    return html;
}

/**
 * Renderiza subseção "Jogos do Brasil" na Copa
 * @param {Array} jogos - Jogos do Brasil
 */
function renderizarJogosBrasilCopa(jogos) {
    if (!jogos || !jogos.length) return '';

    return `
    <div class="copa-fx-section">
        <div class="copa-fx-section-header">
            <span class="material-icons" style="font-size:0.8rem;color:var(--app-success);">flag</span>
            Brasil · Grupo C
        </div>
        <div class="copa-fx-table">
            ${jogos.map(j => renderizarCardJogoCopa(j)).join('')}
        </div>
    </div>
    `;
}

/**
 * Renderiza lista de jogos da Copa (genérica)
 * @param {Array} jogos - Lista de jogos
 * @param {string} titulo - Título da seção
 */
function renderizarJogosCopaLista(jogos, titulo) {
    if (!jogos || !jogos.length) return '';

    // Agrupar por data
    const jogosPorData = jogos.reduce((acc, jogo) => {
        const data = jogo.data || 'Hoje';
        if (!acc[data]) acc[data] = [];
        acc[data].push(jogo);
        return acc;
    }, {});

    return `
    <div class="copa-fx-section">
        <div class="copa-fx-section-header">
            <span class="material-icons" style="font-size:0.8rem;color:var(--app-copa-secondary);">calendar_today</span>
            ${titulo}
        </div>
        ${Object.entries(jogosPorData).map(([data, lista]) => `
            <div>
                ${data !== 'Hoje' ? `<div class="copa-fx-data-label">${formatarDataCopa(data)}</div>` : ''}
                <div class="copa-fx-table">
                    ${lista.map(j => renderizarCardJogoCopa(j)).join('')}
                </div>
            </div>
        `).join('')}
    </div>
    `;
}

/**
 * Renderiza card individual de jogo da Copa (com bandeiras emoji)
 * @param {Object} jogo - Dados do jogo
 */
function renderizarCardJogoCopa(jogo) {
    const aoVivo = isJogoAoVivo(jogo);
    const encerrado = isJogoEncerrado(jogo);
    const agendado = isJogoAgendado(jogo);

    const bandeiraMandante = jogo.bandeirasMandante || '🏳️';
    const bandeiraVisitante = jogo.bandeirasVisitante || '🏳️';

    const nomeMandante  = jogo.mandante  || '?';
    const nomeVisitante = jogo.visitante || '?';

    const isBrasilMandante  = /brasil|brazil/i.test(nomeMandante);
    const isBrasilVisitante = /brasil|brazil/i.test(nomeVisitante);
    const isBrasil = isBrasilMandante || isBrasilVisitante;

    // Centro: horário (agendado), placar ao vivo, placar final
    let centro;
    if (agendado) {
        centro = `<span class="copa-fx-score-time">${jogo.horario}</span>`;
    } else if (aoVivo) {
        centro = `<span class="copa-fx-score-num">${jogo.golsMandante ?? 0}<span style="color:rgba(255,255,255,0.25);margin:0 2px">-</span>${jogo.golsVisitante ?? 0}</span>`;
    } else {
        centro = `<span class="copa-fx-score-num" style="color:rgba(255,255,255,0.5)">${jogo.golsMandante ?? 0}<span style="color:rgba(255,255,255,0.18);margin:0 2px">-</span>${jogo.golsVisitante ?? 0}</span>`;
    }

    // Status (coluna direita)
    let status;
    if (aoVivo) {
        status = `<div class="copa-fx-live-dot"></div>`;
    } else if (encerrado) {
        status = `<span class="copa-fx-fim-label">FIM</span>`;
    } else {
        status = '';
    }

    const rowClass = [
        'copa-fx-row',
        aoVivo   ? 'ao-vivo'    : '',
        encerrado? 'encerrado'  : '',
        isBrasil ? 'brasil-jogo': '',
    ].filter(Boolean).join(' ');

    return `
    <div class="${rowClass}">
        <div class="copa-fx-home">
            <span class="copa-fx-name${isBrasilMandante ? ' destaque' : ''}">${nomeMandante}</span>
            <span class="copa-fx-flag">${bandeiraMandante}</span>
        </div>
        <div class="copa-fx-score">${centro}</div>
        <div class="copa-fx-away">
            <span class="copa-fx-flag">${bandeiraVisitante}</span>
            <span class="copa-fx-name${isBrasilVisitante ? ' destaque' : ''}">${nomeVisitante}</span>
        </div>
        <div class="copa-fx-status">${status}</div>
    </div>
    `;
}

/**
 * Formata data YYYY-MM-DD para exibição amigável
 * @param {string} data - Data YYYY-MM-DD
 * @returns {string} Data formatada (ex: "13 Jun, Sábado")
 */
function formatarDataCopa(data) {
    if (!data) return '';
    try {
        const d = new Date(data + 'T12:00:00');
        const dia = d.getDate();
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        return `${dia} ${meses[d.getMonth()]}, ${diasSemana[d.getDay()]}`;
    } catch {
        return data;
    }
}

/**
 * Alias para compatibilidade
 */
export function renderizarJogosDoDia(jogos, isMock = false) {
    return renderizarJogosAoVivo(jogos, isMock ? 'mock' : 'globo', false);
}

// =====================================================================
// LIBERTADORES 2026 - Faixa de Notícias
// =====================================================================

/**
 * Notícias estáticas da Libertadores (fallback se API falhar)
 */
const LIBERTA_NOTICIAS_FALLBACK = [
    {
        icone: 'calendar_today',
        titulo: 'Libertadores 2026 come\u00e7a em abril com fase preliminar',
        meta: 'CONMEBOL',
        badge: 'AGENDA'
    },
    {
        icone: 'groups',
        titulo: 'Fase de grupos ter\u00e1 32 times - veja os classificados at\u00e9 agora',
        meta: 'CONMEBOL',
        badge: 'CLASSIFICADOS'
    },
    {
        icone: 'stadium',
        titulo: 'Final \u00fanica ser\u00e1 em novembro - sede ainda ser\u00e1 definida',
        meta: 'CONMEBOL',
        badge: 'FINAL'
    },
    {
        icone: 'emoji_events',
        titulo: 'Campe\u00e3o garante vaga no Mundial de Clubes 2027',
        meta: 'CONMEBOL',
        badge: 'MUNDIAL'
    }
];

/**
 * Renderiza faixa de notícias da Libertadores
 * @param {Array|null} noticiasApi - Notícias vindas da API (ou null para fallback estático)
 * @returns {string} HTML da seção
 */
export function renderizarSecaoLibertadores(noticiasApi) {
    const usandoApi = Array.isArray(noticiasApi) && noticiasApi.length > 0;

    // Renderiza cards dinâmicos (API) ou estáticos (fallback)
    const cardsHtml = usandoApi
        ? noticiasApi.map(n => {
            const linkSafe = n.link ? n.link.replace(/"/g, '&quot;') : '';
            const tituloSafe = (n.titulo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const fonteTxt = n.fonte || 'Fonte';
            const tempoTxt = n.tempoRelativo || '';
            return `
                <div class="liberta-news-card liberta-news-card--clickable"
                     onclick="window.open('${linkSafe}', '_blank')" role="link" tabindex="0">
                    <div class="liberta-news-icon">
                        <span class="material-icons">article</span>
                    </div>
                    <div class="liberta-news-text">
                        <p class="liberta-news-title">${tituloSafe}</p>
                        <div class="liberta-news-meta">
                            <span class="liberta-news-fonte">${fonteTxt}</span>
                            ${tempoTxt ? `<span class="liberta-news-tempo">${tempoTxt}</span>` : ''}
                        </div>
                    </div>
                    <span class="material-icons liberta-news-chevron">chevron_right</span>
                </div>`;
        }).join('')
        : LIBERTA_NOTICIAS_FALLBACK.map(n => `
                <div class="liberta-news-card">
                    <div class="liberta-news-icon">
                        <span class="material-icons">${n.icone}</span>
                    </div>
                    <div class="liberta-news-text">
                        <p class="liberta-news-title">${n.titulo}</p>
                        <div class="liberta-news-meta">
                            <span class="liberta-news-badge">${n.badge}</span>
                            ${n.meta}
                        </div>
                    </div>
                </div>`).join('');

    return `
    <section id="liberta-home-section" class="liberta-home-section mx-4 mb-2">
        <!-- Header Colaps\u00e1vel Libertadores -->
        <button class="liberta-home-header" onclick="window.toggleLibertaHome && window.toggleLibertaHome()">
            <div class="liberta-home-header-left">
                <span class="material-icons" style="font-size:22px;color:var(--app-liberta-secondary);">emoji_events</span>
                <div>
                    <h2 class="font-brand text-white text-sm tracking-wide">Libertadores 2026</h2>
                    <span class="text-[10px] text-white/70">CONMEBOL Libertadores da Am\u00e9rica</span>
                </div>
            </div>
            <span class="material-icons liberta-home-chevron">expand_more</span>
        </button>

        <!-- Conte\u00fado Colaps\u00e1vel -->
        <div class="liberta-home-content collapsed" id="liberta-home-content">
            ${cardsHtml}
            <div style="text-align:center;padding:8px 0 4px;">
                <span class="text-[10px] text-white/30" style="font-style:italic;">
                    ${usandoApi ? 'Not\u00edcias via Google News' : 'Sorteio dos grupos em breve'}
                </span>
            </div>
        </div>
    </section>
    `;
}

// =====================================================================
// AUTO-REFRESH PARA JOGOS AO VIVO - v4.0
// =====================================================================

/**
 * Inicia auto-refresh quando ha jogos ao vivo
 */
export function iniciarAutoRefresh(callback) {
    pararAutoRefresh(); // Limpar timer anterior

    if (typeof callback !== 'function') {
        console.warn('[JOGOS] Callback de refresh invalido');
        return;
    }

    refreshTimer = setInterval(async () => {
        if (window.Log) Log.debug('JOGOS', 'Auto-refresh executando...');

        try {
            const result = await obterJogosAoVivo();

            // So atualizar se tem jogos ao vivo
            if (result.aoVivo) {
                callback(result);
            } else {
                // Se nao tem mais jogos ao vivo, parar refresh
                pararAutoRefresh();
                if (window.Log) Log.info('JOGOS', 'Auto-refresh parado (sem jogos ao vivo)');
            }
        } catch (err) {
            if (window.Log) Log.error('JOGOS', 'Erro no auto-refresh:', err);
        }
    }, AUTO_REFRESH_INTERVAL);

    if (window.Log) Log.info('JOGOS', `Auto-refresh iniciado (${AUTO_REFRESH_INTERVAL/1000}s)`);
}

/**
 * Para o auto-refresh
 */
export function pararAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Busca eventos de um jogo especifico
 */
export async function obterEventosJogo(fixtureId) {
    try {
        const res = await fetch(`/api/jogos-ao-vivo/${fixtureId}/eventos`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('[JOGOS] Erro ao buscar eventos:', err);
        return { eventos: [], escalacoes: [], estatisticas: [] };
    }
}

/**
 * Renderiza modal de detalhes do jogo com sistema de tabs
 * Tabs: Eventos | Estatisticas | Escalacoes
 * @param {Object} jogo - Dados do jogo
 * @param {Object} detalhes - Detalhes retornados pelo backend (eventos, escalacoes, resumoStats)
 */
export function renderizarModalJogo(jogo, detalhes) {
    const { eventos, escalacoes, resumoStats, fixture } = detalhes;

    // Separar eventos por tipo
    const gols = eventos.filter(e => e.tipo.startsWith('gol'));
    const cartoes = eventos.filter(e => e.tipo.startsWith('cartao'));

    // Verificar dados disponiveis para tabs
    const temEstatisticas = resumoStats && resumoStats.mandante?.posse;
    const temEscalacoes = escalacoes && escalacoes.length === 2 && escalacoes[0]?.titulares?.length > 0;

    // IDs unicos para tabs
    const tabPrefix = `modal-jogo-${jogo.id}`;

    return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onclick="window.fecharModalJogo && window.fecharModalJogo()">
        <div class="w-full max-w-sm bg-gray-900 rounded-xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
             onclick="event.stopPropagation()">

            <!-- Header Fixo -->
            <div class="sticky top-0 bg-gray-900 border-b border-gray-700/50 px-3 py-2 z-10">
                <div class="flex items-center justify-between">
                    <span class="text-xs text-white/60 tracking-wide truncate flex-1">${escapeHtml(jogo.liga)}</span>
                    <button onclick="window.fecharModalJogo()"
                            class="p-1 rounded-full hover:bg-gray-700 transition-colors ml-2">
                        <span class="material-icons text-white/40 text-lg">close</span>
                    </button>
                </div>
            </div>

            <!-- Placar Compacto -->
            <div class="px-3 py-3 text-center bg-gradient-to-b from-gray-800/30 to-transparent">
                <div class="flex items-center justify-center gap-3">
                    <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
                        <img src="${jogo.logoMandante}" class="w-10 h-10 object-contain" alt="" onerror="this.style.display='none'">
                        <span class="text-[10px] font-medium text-white/80 truncate max-w-[70px]">${escapeHtml(jogo.mandante)}</span>
                    </div>
                    <div class="text-2xl font-brand text-white tabular-nums px-2">
                        ${jogo.golsMandante ?? 0} - ${jogo.golsVisitante ?? 0}
                    </div>
                    <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
                        <img src="${jogo.logoVisitante}" class="w-10 h-10 object-contain" alt="" onerror="this.style.display='none'">
                        <span class="text-[10px] font-medium text-white/80 truncate max-w-[70px]">${escapeHtml(jogo.visitante)}</span>
                    </div>
                </div>
                ${jogo.placarHT ? `<p class="text-[10px] text-white/30 mt-1">(HT: ${jogo.placarHT})</p>` : ''}
            </div>

            <!-- Sistema de Tabs -->
            <div class="border-b border-gray-700/50">
                <div class="flex">
                    <button id="${tabPrefix}-tab-eventos"
                            class="flex-1 py-2 text-[11px] font-medium text-white border-b-2 border-primary transition-colors"
                            onclick="window.trocarTabModal('${tabPrefix}', 'eventos')">
                        <span class="material-icons text-sm align-middle mr-0.5">sports_soccer</span>
                        Eventos
                    </button>
                    ${temEstatisticas ? `
                    <button id="${tabPrefix}-tab-stats"
                            class="flex-1 py-2 text-[11px] font-medium text-white/50 border-b-2 border-transparent hover:text-white/80 transition-colors"
                            onclick="window.trocarTabModal('${tabPrefix}', 'stats')">
                        <span class="material-icons text-sm align-middle mr-0.5">bar_chart</span>
                        Stats
                    </button>
                    ` : ''}
                    ${temEscalacoes ? `
                    <button id="${tabPrefix}-tab-escalacoes"
                            class="flex-1 py-2 text-[11px] font-medium text-white/50 border-b-2 border-transparent hover:text-white/80 transition-colors"
                            onclick="window.trocarTabModal('${tabPrefix}', 'escalacoes')">
                        <span class="material-icons text-sm align-middle mr-0.5">groups</span>
                        Times
                    </button>
                    ` : ''}
                </div>
            </div>

            <!-- Conteudo das Tabs (scrollable) -->
            <div class="flex-1 overflow-y-auto">
                <!-- Tab Eventos -->
                <div id="${tabPrefix}-content-eventos" class="p-3">
                    ${gols.length > 0 ? `
                        <h4 class="text-[10px] text-white/40 uppercase tracking-wide mb-1.5">Gols</h4>
                        <div class="space-y-1.5 mb-3">
                            ${gols.map(e => renderizarEvento(e, jogo)).join('')}
                        </div>
                    ` : ''}

                    ${cartoes.length > 0 ? `
                        <h4 class="text-[10px] text-white/40 uppercase tracking-wide mb-1.5">Cartões</h4>
                        <div class="space-y-1.5 mb-3">
                            ${cartoes.map(e => renderizarEvento(e, jogo)).join('')}
                        </div>
                    ` : ''}

                    ${eventos.length === 0 ? `
                        <div class="flex flex-col items-center justify-center py-8 text-white/30">
                            <span class="material-icons text-2xl mb-1">sports</span>
                            <p class="text-xs">Nenhum evento</p>
                        </div>
                    ` : ''}
                </div>

                <!-- Tab Estatisticas -->
                ${temEstatisticas ? `
                <div id="${tabPrefix}-content-stats" class="p-3 hidden">
                    ${renderizarEstatisticas(resumoStats, jogo)}
                </div>
                ` : ''}

                <!-- Tab Escalacoes -->
                ${temEscalacoes ? `
                <div id="${tabPrefix}-content-escalacoes" class="p-3 hidden">
                    ${renderizarEscalacoes(escalacoes, jogo)}
                </div>
                ` : ''}
            </div>

            <!-- Footer com Estadio/Arbitro -->
            ${fixture?.estadio || fixture?.arbitro ? `
                <div class="border-t border-gray-700/50 px-3 py-2 bg-gray-800/30">
                    <div class="flex items-center justify-center gap-3 text-[10px] text-white/30">
                        ${fixture.estadio ? `
                            <span class="flex items-center gap-0.5">
                                <span class="material-icons text-xs">stadium</span>
                                ${escapeHtml(fixture.estadio)}
                            </span>
                        ` : ''}
                        ${fixture.arbitro ? `
                            <span class="flex items-center gap-0.5">
                                <span class="material-icons text-xs">sports</span>
                                ${escapeHtml(fixture.arbitro)}
                            </span>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

            <!-- Botão Fechar (v5.4) -->
            <div class="border-t border-gray-700/50 p-3 bg-gray-900">
                <button onclick="window.fecharModalJogo()"
                        class="w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                    <span class="material-icons text-lg">close</span>
                    Fechar
                </button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Renderiza um evento individual
 */
function renderizarEvento(evento, jogo) {
    const iconeConfig = EVENTO_ICONES[evento.tipo] || { icon: 'info', cor: 'text-gray-400' };
    const isMandante = evento.time === jogo.mandante;

    return `
    <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800/40 ${isMandante ? '' : 'flex-row-reverse'}">
        <span class="text-[10px] text-white/40 w-6 text-center">${evento.tempo}'${evento.tempoExtra ? `+${evento.tempoExtra}` : ''}</span>
        <span class="material-icons ${iconeConfig.cor} text-sm">${iconeConfig.icon}</span>
        <div class="flex-1 ${isMandante ? '' : 'text-right'}">
            <span class="text-xs text-white/90">${escapeHtml(evento.jogador || 'Desconhecido')}</span>
            ${evento.assistencia ? `<span class="text-[10px] text-white/30 ml-0.5">(${escapeHtml(evento.assistencia)})</span>` : ''}
        </div>
    </div>
    `;
}

/**
 * Renderiza tab de estatisticas com barras comparativas
 * @param {Object} resumoStats - Stats do mandante e visitante
 * @param {Object} jogo - Dados do jogo para nomes dos times
 */
function renderizarEstatisticas(resumoStats, jogo) {
    if (!resumoStats) return '<p class="text-center text-white/40 py-8">Estatísticas não disponíveis</p>';

    const { mandante, visitante } = resumoStats;

    /**
     * Renderiza barra comparativa
     */
    const renderBarra = (label, valorM, valorV, icon) => {
        // Extrair valor numerico (ex: "65%" -> 65)
        const numM = parseFloat(String(valorM).replace('%', '')) || 0;
        const numV = parseFloat(String(valorV).replace('%', '')) || 0;
        const total = numM + numV || 1;
        const percM = (numM / total) * 100;
        const percV = (numV / total) * 100;

        return `
        <div class="mb-4">
            <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-white">${valorM ?? '-'}</span>
                <span class="text-xs text-white/50 flex items-center gap-1">
                    <span class="material-icons text-sm text-primary">${icon}</span>
                    ${label}
                </span>
                <span class="text-sm font-medium text-white">${valorV ?? '-'}</span>
            </div>
            <div class="flex h-2 rounded-full overflow-hidden bg-gray-700">
                <div class="bg-primary transition-all" style="width: ${percM}%"></div>
                <div class="bg-gray-500 transition-all" style="width: ${percV}%"></div>
            </div>
        </div>
        `;
    };

    return `
        <div class="space-y-1">
            <!-- Header com escudos -->
            <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                <div class="flex items-center gap-2">
                    <img src="${jogo.logoMandante}" class="w-6 h-6 object-contain" alt="">
                    <span class="text-xs text-white/70 truncate max-w-[80px]">${escapeHtml(jogo.mandante)}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-white/70 truncate max-w-[80px]">${escapeHtml(jogo.visitante)}</span>
                    <img src="${jogo.logoVisitante}" class="w-6 h-6 object-contain" alt="">
                </div>
            </div>

            ${renderBarra('Posse de Bola', mandante.posse, visitante.posse, 'sports_soccer')}
            ${renderBarra('Chutes Totais', mandante.chutesTotal, visitante.chutesTotal, 'gps_fixed')}
            ${renderBarra('Chutes no Gol', mandante.chutesGol, visitante.chutesGol, 'adjust')}
            ${renderBarra('Escanteios', mandante.escanteios, visitante.escanteios, 'flag')}
            ${renderBarra('Faltas', mandante.faltas, visitante.faltas, 'front_hand')}
            ${mandante.defesas !== null ? renderBarra('Defesas', mandante.defesas, visitante.defesas, 'sports_handball') : ''}
            ${mandante.impedimentos !== null ? renderBarra('Impedimentos', mandante.impedimentos, visitante.impedimentos, 'block') : ''}
        </div>
    `;
}

/**
 * Renderiza tab de escalacoes com titulares e formacao
 * @param {Array} escalacoes - Array com 2 objetos (mandante e visitante)
 * @param {Object} jogo - Dados do jogo
 */
function renderizarEscalacoes(escalacoes, jogo) {
    if (!escalacoes || escalacoes.length < 2) {
        return '<p class="text-center text-white/40 py-8">Escalações não disponíveis</p>';
    }

    const [mandante, visitante] = escalacoes;

    /**
     * Renderiza lista de jogadores
     */
    const renderTimeJogadores = (time, logo, nomeTime) => {
        return `
        <div class="flex-1 min-w-0">
            <!-- Header do time -->
            <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
                <img src="${logo}" class="w-6 h-6 object-contain" alt="" onerror="this.style.display='none'">
                <div class="flex-1 min-w-0">
                    <span class="text-xs font-medium text-white truncate block">${escapeHtml(nomeTime)}</span>
                    ${time.formacao ? `<span class="text-[10px] text-primary">${time.formacao}</span>` : ''}
                </div>
            </div>

            <!-- Tecnico -->
            ${time.tecnico ? `
                <div class="flex items-center gap-2 mb-2 px-2 py-1 rounded bg-gray-800/50">
                    <span class="material-icons text-xs text-white/30">person</span>
                    <span class="text-[10px] text-white/50">${escapeHtml(time.tecnico)}</span>
                </div>
            ` : ''}

            <!-- Titulares -->
            <div class="space-y-1">
                ${(time.titulares || []).slice(0, 11).map((jogador, idx) => `
                    <div class="flex items-center gap-2 px-2 py-1.5 rounded ${idx % 2 === 0 ? 'bg-gray-800/30' : ''}">
                        <span class="text-[10px] text-white/30 w-5 text-center">${jogador.numero || '-'}</span>
                        <span class="text-xs text-white truncate flex-1">${escapeHtml(jogador.nome)}</span>
                        <span class="text-[9px] text-white/30 uppercase">${jogador.posicao || ''}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    };

    return `
    <div class="flex gap-4">
        ${renderTimeJogadores(mandante, jogo.logoMandante, jogo.mandante)}
        ${renderTimeJogadores(visitante, jogo.logoVisitante, jogo.visitante)}
    </div>
    `;
}

/**
 * Funcao global para trocar tabs do modal
 * @param {string} prefix - Prefixo do modal (ex: "modal-jogo-123456")
 * @param {string} tab - Nome da tab (eventos, stats, escalacoes)
 */
window.trocarTabModal = function(prefix, tab) {
    const tabs = ['eventos', 'stats', 'escalacoes'];

    tabs.forEach(t => {
        const tabBtn = document.getElementById(`${prefix}-tab-${t}`);
        const content = document.getElementById(`${prefix}-content-${t}`);

        if (tabBtn && content) {
            if (t === tab) {
                // Ativar tab
                tabBtn.classList.add('text-white', 'border-primary');
                tabBtn.classList.remove('text-white/50', 'border-transparent');
                content.classList.remove('hidden');
            } else {
                // Desativar tab
                tabBtn.classList.remove('text-white', 'border-primary');
                tabBtn.classList.add('text-white/50', 'border-transparent');
                content.classList.add('hidden');
            }
        }
    });
};

// Expor funcoes globais para onclick
window.expandirJogo = async function(fixtureId) {
    console.log('[JOGOS] expandirJogo chamado:', fixtureId);

    let container = document.getElementById('modal-jogo-container');
    if (!container) {
        // Criar container se nao existe
        const div = document.createElement('div');
        div.id = 'modal-jogo-container';
        document.body.appendChild(div);
        container = div;
    }

    // Buscar jogo do cache
    const jogos = window._jogosCache || [];
    console.log('[JOGOS] Cache tem', jogos.length, 'jogos');

    // Comparar como numero (API retorna number)
    const jogo = jogos.find(j => j.id === Number(fixtureId));
    if (!jogo) {
        console.warn('[JOGOS] Jogo nao encontrado no cache:', fixtureId);
        console.log('[JOGOS] IDs disponiveis:', jogos.map(j => j.id));
        return;
    }

    console.log('[JOGOS] Jogo encontrado:', jogo.mandante, 'x', jogo.visitante);

    // Mostrar loading
    container.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
    `;

    // Buscar detalhes
    const detalhes = await obterEventosJogo(fixtureId);
    console.log('[JOGOS] Detalhes recebidos:', detalhes.eventos?.length, 'eventos');

    // Renderizar modal
    container.innerHTML = renderizarModalJogo(jogo, detalhes);
    console.log('[JOGOS] Modal renderizado');
};

window.fecharModalJogo = function() {
    const container = document.getElementById('modal-jogo-container');
    if (container) container.innerHTML = '';
};

/**
 * Abre modal com TODOS os jogos do dia
 * Chamado pelo botão "Ver Mais" do módulo home
 */
window.abrirModalJogos = async function() {
    console.log('[JOGOS] abrirModalJogos chamado');

    let container = document.getElementById('modal-jogos-lista');
    if (!container) {
        const div = document.createElement('div');
        div.id = 'modal-jogos-lista';
        document.body.appendChild(div);
        container = div;
    }

    // Buscar jogos atualizados
    const { jogos, fonte, aoVivo } = await obterJogosAoVivo();

    if (!jogos || jogos.length === 0) {
        container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                <div class="bg-gray-900 rounded-xl p-6 max-w-sm w-full text-center">
                    <span class="material-icons text-5xl text-gray-600 mb-4">sports_soccer</span>
                    <h3 class="text-lg font-brand text-white mb-2">Sem jogos</h3>
                    <p class="text-sm text-gray-400 mb-6">Nenhum jogo encontrado para hoje.</p>
                    <button onclick="window.fecharModalJogosLista()"
                            class="px-6 py-2 bg-primary rounded-lg text-white font-medium">
                        Fechar
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Renderizar modal com todos os jogos
    const jogosHTML = renderizarJogosAoVivo(jogos, fonte, aoVivo);

    container.innerHTML = `
        <div class="fixed inset-0 z-50 bg-black/80 overflow-y-auto">
            <div class="min-h-screen flex flex-col">
                <!-- Header fixo -->
                <div class="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-gray-800 px-4 py-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-primary">sports_soccer</span>
                            <h2 class="text-lg font-brand text-white">Jogos do Dia</h2>
                        </div>
                        <button onclick="window.fecharModalJogosLista()"
                                class="p-2 rounded-lg hover:bg-gray-800 transition-colors">
                            <span class="material-icons text-white">close</span>
                        </button>
                    </div>
                </div>

                <!-- Conteúdo scrollável -->
                <div class="flex-1 pb-6">
                    ${jogosHTML}
                </div>

                <!-- Footer fixo -->
                <div class="sticky bottom-0 bg-gradient-to-t from-black via-black/95 to-transparent px-4 py-4">
                    <button onclick="window.fecharModalJogosLista()"
                            class="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    `;

    console.log('[JOGOS] Modal de lista renderizado com', jogos.length, 'jogos');
};

/**
 * Fecha modal de lista de jogos
 */
window.fecharModalJogosLista = function() {
    const container = document.getElementById('modal-jogos-lista');
    if (container) container.innerHTML = '';
};

if (window.Log) Log.info('PARTICIPANTE-JOGOS', 'Modulo v5.6 carregado (modal de listagem completa)');

// ✅ DEBUG: Confirmar funções globais disponíveis
console.log('[JOGOS-DEBUG] ✅ Versão 5.6 carregada.');
console.log('[JOGOS-DEBUG] Funções disponíveis:', {
    expandirJogo: typeof window.expandirJogo,
    abrirModalJogos: typeof window.abrirModalJogos,
    fecharModalJogosLista: typeof window.fecharModalJogosLista
});
