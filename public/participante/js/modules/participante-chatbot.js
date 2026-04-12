/**
 * PARTICIPANTE CHATBOT — Big Cartola IA v3.0
 * Multiplas conversas por liga, historico enviado ao LLM, cache inteligente.
 *
 * Storage v2: { versao, conversaAtualId, conversas: [{ id, nome, mensagens, criadaEm, atualizadaEm }] }
 * Migracao automatica de v1 (array simples) para v2.
 *
 * Seguranca: conteudo do usuario inserido exclusivamente via textContent (sem innerHTML).
 */

const LOG_TAG = 'PARTICIPANTE-CHATBOT';
const API_URL = '/api/chatbot/ask';
const API_STATUS_URL = '/api/chatbot/status';
const API_MODULOS_URL = (ligaId) => `/api/liga/${ligaId}/modulos`;
const MAX_HISTORICO = 50;
const MAX_CONVERSAS = 20;
const HISTORICO_LLM = 6;        // msgs enviadas ao LLM por request
const DIAS_LIMPAR_ANTIGAS = 30;
const FETCH_TIMEOUT = 30000;    // tool calling pode levar mais tempo
const STORAGE_KEY_V2 = 'scm_chatbot_v2';

// Sugestoes padrao por modulo. So aparecem se o modulo estiver ativo.
// Chaves: mesmas do modulos_ativos no Liga.
const SUGESTOES_POR_MODULO = {
    pontosCorridos: [
        { rotulo: 'Minha disputa', pergunta: 'Como esta minha disputa no Pontos Corridos?' },
        { rotulo: 'Meu proximo jogo', pergunta: 'Contra quem estou jogando no Pontos Corridos?' },
    ],
    ranking: [
        { rotulo: 'Minha posicao', pergunta: 'Qual minha posicao no ranking geral?' },
    ],
    extrato: [
        { rotulo: 'Meu saldo', pergunta: 'Qual meu saldo financeiro na liga?' },
    ],
    turnoReturno: [
        { rotulo: 'Meu turno', pergunta: 'Como estou no turno?' },
    ],
    restaUm: [
        { rotulo: 'Resta Um', pergunta: 'Estou vivo no Resta Um?' },
    ],
};

// Sugestoes sempre presentes.
const SUGESTOES_UNIVERSAIS = [
    { rotulo: 'Rodada atual', pergunta: 'Em qual rodada estamos e o mercado esta aberto?' },
    { rotulo: 'Modulos ativos', pergunta: 'Quais modulos estao ativos na minha liga?' },
];

let conversas = [];
let conversaAtualId = null;
let mensagens = [];
let enviando = false;
let _ligaId = null;
let _cooldownAtivo = null; // { ateEpochMs, intervalId }

// =====================================================================
// STORAGE
// =====================================================================

function getStorageKey() {
    return _ligaId ? `${STORAGE_KEY_V2}_${_ligaId}` : STORAGE_KEY_V2;
}

function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function carregarStorage() {
    try {
        const raw = localStorage.getItem(getStorageKey());
        if (!raw) return { versao: 2, conversaAtualId: null, conversas: [] };
        const data = JSON.parse(raw);
        if (data.versao === 2 && Array.isArray(data.conversas)) return data;
        return _migrarV1();
    } catch {
        return { versao: 2, conversaAtualId: null, conversas: [] };
    }
}

function salvarStorage(data) {
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(data));
    } catch { /* localStorage cheio — ignorar */ }
}

function _migrarV1() {
    try {
        const legacyKey = _ligaId ? `scm_chatbot_historico_${_ligaId}` : 'scm_chatbot_historico';
        const legacyRaw = localStorage.getItem(legacyKey);
        if (!legacyRaw) return { versao: 2, conversaAtualId: null, conversas: [] };

        const msgs = JSON.parse(legacyRaw);
        if (!Array.isArray(msgs) || msgs.length === 0) return { versao: 2, conversaAtualId: null, conversas: [] };

        const conv = {
            id: gerarId(),
            nome: 'Conversa anterior',
            mensagens: msgs,
            criadaEm: msgs[0]?.timestamp || Date.now(),
            atualizadaEm: Date.now(),
        };
        const data = { versao: 2, conversaAtualId: conv.id, conversas: [conv] };
        salvarStorage(data);
        try { localStorage.removeItem(legacyKey); } catch {}
        return data;
    } catch {
        return { versao: 2, conversaAtualId: null, conversas: [] };
    }
}

// =====================================================================
// GESTAO DE CONVERSAS
// =====================================================================

function criarNovaConversa() {
    const id = gerarId();
    const conv = { id, nome: 'Nova conversa', mensagens: [], criadaEm: Date.now(), atualizadaEm: Date.now() };

    const data = carregarStorage();
    data.conversas.unshift(conv);
    data.conversaAtualId = id;
    if (data.conversas.length > MAX_CONVERSAS) data.conversas = data.conversas.slice(0, MAX_CONVERSAS);
    salvarStorage(data);

    conversas = data.conversas;
    conversaAtualId = id;
    mensagens = [];

    renderizarChatAtual();
    fecharPainelConversas();

    const sugestoes = document.getElementById('chatbot-suggestions');
    if (sugestoes) sugestoes.style.display = '';
    const input = document.getElementById('chatbot-input');
    if (input) input.focus();
}

function selecionarConversa(id) {
    const data = carregarStorage();
    const conv = data.conversas.find(c => c.id === id);
    if (!conv) return;

    data.conversaAtualId = id;
    salvarStorage(data);

    conversaAtualId = id;
    mensagens = conv.mensagens || [];

    renderizarChatAtual();
    fecharPainelConversas();
}

function apagarConversa(id) {
    const data = carregarStorage();
    data.conversas = data.conversas.filter(c => c.id !== id);
    const eraAtual = data.conversaAtualId === id;
    if (eraAtual) {
        data.conversaAtualId = data.conversas.length > 0 ? data.conversas[0].id : null;
    }
    salvarStorage(data);
    conversas = data.conversas;

    if (eraAtual) {
        if (data.conversaAtualId) selecionarConversa(data.conversaAtualId);
        else criarNovaConversa();
    }
    renderizarListaConversas();
}

function autoLimparAntigas() {
    const limiteMs = DIAS_LIMPAR_ANTIGAS * 24 * 60 * 60 * 1000;
    const agora = Date.now();
    const data = carregarStorage();
    const antes = data.conversas.length;
    data.conversas = data.conversas.filter(c =>
        c.id === data.conversaAtualId || (agora - (c.atualizadaEm || c.criadaEm || 0)) < limiteMs
    );
    if (data.conversas.length < antes) salvarStorage(data);
}

function limparConversa() {
    mensagens = [];
    const data = carregarStorage();
    const conv = data.conversas.find(c => c.id === conversaAtualId);
    if (conv) {
        conv.mensagens = [];
        conv.nome = 'Nova conversa';
        conv.atualizadaEm = Date.now();
        salvarStorage(data);
    }
    renderizarChatAtual();
    if (window.ErrorToast) window.ErrorToast.show('Conversa limpa', { tipo: 'info', duracao: 1500 });
}

// =====================================================================
// RENDERIZACAO — DOM methods para conteudo do usuario (sem innerHTML)
// =====================================================================

function renderizarChatAtual() {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    container.textContent = ''; // limpa sem innerHTML

    // Mensagem de boas-vindas (estatica — sem conteudo do usuario)
    const bemVindo = _criarMsgBotEstatica([
        'Ola! Sou o Big Cartola IA, seu assistente do Super Cartola Manager.',
        'Pergunte sobre rankings, modulos ativos, regras, rodada atual e mais.',
    ]);
    container.appendChild(bemVindo);

    for (const msg of mensagens) {
        _appendMensagem(container, msg.tipo, msg.texto, msg.fontes || [], msg.isError || false);
    }

    const sugestoes = document.getElementById('chatbot-suggestions');
    if (sugestoes) sugestoes.style.display = mensagens.length === 0 ? '' : 'none';

    container.scrollTop = container.scrollHeight;
}

function renderizarListaConversas() {
    const lista = document.getElementById('chatbot-conv-list');
    if (!lista) return;

    lista.textContent = '';

    const data = carregarStorage();
    if (data.conversas.length === 0) {
        const vazio = document.createElement('p');
        vazio.className = 'chatbot-conv-empty';
        vazio.textContent = 'Nenhuma conversa salva';
        lista.appendChild(vazio);
        return;
    }

    for (const conv of data.conversas) {
        const isAtiva = conv.id === data.conversaAtualId;

        const item = document.createElement('div');
        item.className = 'chatbot-conv-item' + (isAtiva ? ' active' : '');

        // Info (clicavel)
        const infoDiv = document.createElement('div');
        infoDiv.className = 'chatbot-conv-item-info';

        const nomeSpan = document.createElement('span');
        nomeSpan.className = 'chatbot-conv-item-nome';
        nomeSpan.textContent = conv.nome || 'Conversa';

        const dataStr = new Date(conv.atualizadaEm || conv.criadaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const metaSpan = document.createElement('span');
        metaSpan.className = 'chatbot-conv-item-data';
        metaSpan.textContent = dataStr + ' \u00b7 ' + (conv.mensagens?.length || 0) + ' msgs';

        infoDiv.appendChild(nomeSpan);
        infoDiv.appendChild(metaSpan);
        infoDiv.addEventListener('click', () => selecionarConversa(conv.id));

        // Botao apagar
        const btnDel = document.createElement('button');
        btnDel.className = 'chatbot-conv-item-delete';
        btnDel.setAttribute('aria-label', 'Apagar conversa');
        btnDel.title = 'Apagar';
        const iconDel = document.createElement('span');
        iconDel.className = 'material-icons';
        iconDel.textContent = 'delete';
        btnDel.appendChild(iconDel);
        btnDel.addEventListener('click', (e) => { e.stopPropagation(); apagarConversa(conv.id); });

        item.appendChild(infoDiv);
        item.appendChild(btnDel);
        lista.appendChild(item);
    }
}

function abrirPainelConversas() {
    const painel = document.getElementById('chatbot-conversations-panel');
    if (!painel) return;
    renderizarListaConversas();
    painel.style.display = '';
}

function fecharPainelConversas() {
    const painel = document.getElementById('chatbot-conversations-panel');
    if (painel) painel.style.display = 'none';
}

// =====================================================================
// INICIALIZACAO
// =====================================================================

export async function inicializarChatbotParticipante(payload) {
    if (window.Log) Log.debug(LOG_TAG, 'Inicializando v3.0...');

    const container = document.getElementById('chatbot-container');
    if (!container) { if (window.Log) Log.warn(LOG_TAG, 'Container nao encontrado'); return; }

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';
    container.style.height = '100vh';
    container.style.maxHeight = '100dvh';

    _ligaId = payload?.ligaId || payload?.participante?.ligaId || null;

    // Inicializar storage
    autoLimparAntigas();
    const storageData = carregarStorage();
    conversas = storageData.conversas;

    if (!storageData.conversaAtualId || !storageData.conversas.find(c => c.id === storageData.conversaAtualId)) {
        criarNovaConversa();
    } else {
        conversaAtualId = storageData.conversaAtualId;
        mensagens = storageData.conversas.find(c => c.id === conversaAtualId)?.mensagens || [];
        renderizarChatAtual();
    }

    // Status do bot
    try {
        const statusResp = await fetchComTimeout(API_STATUS_URL, { method: 'GET' }, 5000);
        const statusData = await statusResp.json();
        if (!statusData.success) { mostrarIndisponivel(container); return; }

        const d = statusData.data || {};
        const statusEl = document.getElementById('chatbot-status');
        if (statusEl) {
            if (d.modo === 'indisponivel' || d.disponivel === false) {
                mostrarIndisponivel(container);
                return;
            }
            statusEl.textContent = 'Pronto para ajudar';
        }
    } catch { /* Status check falhou — continuar */ }

    // Event listeners
    const input     = document.getElementById('chatbot-input');
    const btnEnviar = document.getElementById('chatbot-send');
    const btnConvs  = document.getElementById('chatbot-conversations');
    const btnNova   = document.getElementById('chatbot-new');
    const btnLimpar = document.getElementById('chatbot-clear');
    const btnClose  = document.getElementById('chatbot-conv-close');

    if (input && btnEnviar) {
        btnEnviar.addEventListener('click', () => enviarPergunta());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta(); } });
    }

    // Popular sugestoes dinamicamente baseado nos modulos ativos da liga
    await popularSugestoesDinamicas();

    const registrarHandlerChips = () => {
        document.querySelectorAll('.chatbot-suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const pergunta = chip.dataset.pergunta;
                if (pergunta && input) { input.value = pergunta; enviarPergunta(); }
            });
        });
    };
    registrarHandlerChips();

    if (btnConvs)  btnConvs.addEventListener('click', () => abrirPainelConversas());
    if (btnNova)   btnNova.addEventListener('click', () => criarNovaConversa());
    if (btnLimpar) btnLimpar.addEventListener('click', () => limparConversa());
    if (btnClose)  btnClose.addEventListener('click', () => fecharPainelConversas());

    if (input) input.focus();
    if (window.Log) Log.info(LOG_TAG, `Chatbot v3 inicializado | conversa=${conversaAtualId}`);
}

// =====================================================================
// SUGESTOES DINAMICAS (baseadas nos modulos ativos da liga)
// =====================================================================

async function popularSugestoesDinamicas() {
    const container = document.getElementById('chatbot-suggestions');
    if (!container) return;

    container.textContent = '';

    const sugestoes = [...SUGESTOES_UNIVERSAIS];

    if (_ligaId) {
        try {
            const resp = await fetchComTimeout(API_MODULOS_URL(_ligaId), { method: 'GET' }, 4000);
            if (resp.ok) {
                const data = await resp.json();
                // Endpoint real retorna: { sucesso, modulos: [{ id, ativo, ... }] }
                const listaMod = Array.isArray(data?.modulos) ? data.modulos
                               : Array.isArray(data?.data?.modulos) ? data.data.modulos
                               : [];

                // Map id -> chave camelCase usada em SUGESTOES_POR_MODULO
                const MAP_ID = {
                    pontos_corridos: 'pontosCorridos',
                    ranking_geral: 'ranking',
                    extrato_financeiro: 'extrato',
                    extrato: 'extrato',
                    turno_returno: 'turnoReturno',
                    resta_um: 'restaUm',
                };

                for (const m of listaMod) {
                    if (m?.ativo !== true) continue;
                    const chave = MAP_ID[m.id] || m.id;
                    const lista = SUGESTOES_POR_MODULO[chave];
                    if (Array.isArray(lista)) sugestoes.push(...lista);
                }
            }
        } catch { /* fallback silencioso */ }
    }

    // Deduplicar por pergunta (preservando ordem)
    const vistas = new Set();
    const unicas = sugestoes.filter(s => {
        if (vistas.has(s.pergunta)) return false;
        vistas.add(s.pergunta);
        return true;
    });

    for (const s of unicas.slice(0, 6)) {
        const btn = document.createElement('button');
        btn.className = 'chatbot-suggestion-chip';
        btn.dataset.pergunta = s.pergunta;
        btn.textContent = s.rotulo;
        container.appendChild(btn);
    }
}

// =====================================================================
// COOLDOWN UI (bloqueio temporario apos rate limit 429)
// =====================================================================

function iniciarCooldown(segundos) {
    const ateMs = Date.now() + segundos * 1000;

    // Parar countdown anterior se houver
    if (_cooldownAtivo?.intervalId) clearInterval(_cooldownAtivo.intervalId);

    const input = document.getElementById('chatbot-input');
    const btn = document.getElementById('chatbot-send');
    const status = document.getElementById('chatbot-status');

    if (input) input.disabled = true;
    if (btn) btn.disabled = true;

    const tick = () => {
        const restantes = Math.max(0, Math.ceil((ateMs - Date.now()) / 1000));
        if (restantes <= 0) {
            encerrarCooldown();
            return;
        }
        if (status) status.textContent = `Aguardando liberacao... ${restantes}s`;
        if (input) input.placeholder = `Aguarde ${restantes}s para perguntar novamente`;
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    _cooldownAtivo = { ateEpochMs: ateMs, intervalId };
}

function encerrarCooldown() {
    if (_cooldownAtivo?.intervalId) clearInterval(_cooldownAtivo.intervalId);
    _cooldownAtivo = null;

    const input = document.getElementById('chatbot-input');
    const btn = document.getElementById('chatbot-send');
    const status = document.getElementById('chatbot-status');

    if (input) {
        input.disabled = false;
        input.placeholder = 'Pergunte algo sobre o app...';
        input.focus();
    }
    if (btn) btn.disabled = false;
    if (status) status.textContent = 'Pronto para ajudar';
}

// =====================================================================
// ENVIAR PERGUNTA
// =====================================================================

async function enviarPergunta() {
    if (enviando) return;
    if (_cooldownAtivo && Date.now() < _cooldownAtivo.ateEpochMs) return;

    const input    = document.getElementById('chatbot-input');
    const pergunta = input?.value?.trim();

    if (!pergunta || pergunta.length < 3) {
        if (window.ErrorToast) window.ErrorToast.show('Digite uma pergunta (minimo 3 caracteres)', { tipo: 'info', duracao: 2000 });
        return;
    }

    enviando = true;
    const btnEnviar = document.getElementById('chatbot-send');
    if (btnEnviar) btnEnviar.disabled = true;
    if (input) input.value = '';

    const sugestoes = document.getElementById('chatbot-suggestions');
    if (sugestoes) sugestoes.style.display = 'none';

    // Historico ANTES de adicionar a pergunta atual
    const historicoParaEnvio = mensagens.slice(-HISTORICO_LLM).map(m => ({ tipo: m.tipo, texto: m.texto }));

    adicionarMensagem('user', pergunta);
    const typingId = mostrarDigitando();

    try {
        const resp = await fetchComTimeout(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pergunta, historico: historicoParaEnvio }),
        }, FETCH_TIMEOUT);

        removerDigitando(typingId);

        if (!resp.ok) {
            // Tratamento especial do 429: extrair cooldownSegundos e iniciar countdown
            if (resp.status === 429) {
                let cooldownSegundos = 120;
                try {
                    const j = await resp.json();
                    if (j?.cooldownSegundos && Number.isFinite(j.cooldownSegundos)) {
                        cooldownSegundos = Number(j.cooldownSegundos);
                    }
                    const msg = j?.error || `Voce fez 5 perguntas muito rapido. Aguarde ${cooldownSegundos}s.`;
                    adicionarMensagem('bot', msg, [], true);
                } catch {
                    adicionarMensagem('bot', `Voce fez 5 perguntas muito rapido. Aguarde ${cooldownSegundos}s.`, [], true);
                }
                iniciarCooldown(cooldownSegundos);
                return;
            }

            const msg = resp.status === 401 ? 'Sua sessao expirou. Faca login novamente.'
                      : 'Desculpe, ocorreu um erro. Tente novamente.';
            adicionarMensagem('bot', msg, [], true);
            return;
        }

        const data = await resp.json();
        if (data.success && data.data) {
            // toolsUsadas = [{ name, ok }]. Renderiza como chips discretos.
            const fontes = Array.isArray(data.data.toolsUsadas)
                ? data.data.toolsUsadas.filter(t => t.ok !== false).map(t => t.name)
                : (data.data.fontes || []);
            adicionarMensagem('bot', data.data.resposta, fontes);
        } else {
            adicionarMensagem('bot', data.error || 'Erro ao processar resposta.', [], true);
        }
    } catch (error) {
        removerDigitando(typingId);
        const msg = error.name === 'AbortError'
            ? 'A resposta demorou demais. Tente uma pergunta mais simples.'
            : 'Erro de conexao. Verifique sua internet e tente novamente.';
        adicionarMensagem('bot', msg, [], true);
        if (window.Log) Log.warn(LOG_TAG, `Erro ao enviar: ${error.message}`);
    } finally {
        enviando = false;
        if (btnEnviar) btnEnviar.disabled = false;
        if (input) input.focus();
    }
}

// =====================================================================
// MENSAGENS
// =====================================================================

function adicionarMensagem(tipo, texto, fontes = [], isError = false) {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    const msg = { tipo, texto, fontes, timestamp: Date.now(), isError };
    mensagens.push(msg);
    if (mensagens.length > MAX_HISTORICO) mensagens.shift();

    // Persistir na conversa atual
    const data = carregarStorage();
    const conv = data.conversas.find(c => c.id === conversaAtualId);
    if (conv) {
        if (tipo === 'user' && (conv.nome === 'Nova conversa' || !conv.nome)) {
            conv.nome = texto.substring(0, 45) + (texto.length > 45 ? '...' : '');
        }
        conv.mensagens = mensagens.slice(-MAX_HISTORICO);
        conv.atualizadaEm = Date.now();
        salvarStorage(data);
    }

    _appendMensagem(container, tipo, texto, fontes, isError);
}

/**
 * Constroi e appenda uma mensagem ao container via DOM methods (sem innerHTML para conteudo do usuario).
 */
function _appendMensagem(container, tipo, texto, fontes = [], isError = false) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chatbot-msg chatbot-msg-' + tipo + (isError ? ' chatbot-msg-error' : '');

    // Avatar
    const avatarEl = document.createElement('span');
    avatarEl.className = 'material-icons chatbot-msg-avatar';
    avatarEl.textContent = tipo === 'bot' ? 'smart_toy' : 'person';

    // Conteudo
    const contentEl = document.createElement('div');
    contentEl.className = 'chatbot-msg-content';

    // Paragrafos (conteudo do usuario via textContent — XSS-safe)
    const linhas = texto.split('\n').filter(l => l.trim());
    for (const linha of linhas) {
        const p = document.createElement('p');
        p.textContent = linha;
        contentEl.appendChild(p);
    }

    // Chips de fonte (tool names / arquivos — via textContent)
    if (fontes.length > 0) {
        const fontesDiv = document.createElement('div');
        fontesDiv.className = 'chatbot-msg-fontes';
        for (const f of fontes) {
            const bruto = String(f).split('/').pop().replace(/\.(json|md)$/, '');
            const legivel = bruto
                .replace(/_/g, ' ')
                .replace(/^\w/, c => c.toUpperCase());
            const chip = document.createElement('span');
            chip.className = 'chatbot-fonte-chip';
            chip.textContent = legivel;
            fontesDiv.appendChild(chip);
        }
        contentEl.appendChild(fontesDiv);
    }

    msgEl.appendChild(avatarEl);
    msgEl.appendChild(contentEl);
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
}

/** Cria a mensagem estatica de boas-vindas (sem conteudo do usuario). */
function _criarMsgBotEstatica(linhas) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chatbot-msg chatbot-msg-bot';

    const avatarEl = document.createElement('span');
    avatarEl.className = 'material-icons chatbot-msg-avatar';
    avatarEl.textContent = 'smart_toy';

    const contentEl = document.createElement('div');
    contentEl.className = 'chatbot-msg-content';

    for (const linha of linhas) {
        const p = document.createElement('p');
        p.textContent = linha;
        contentEl.appendChild(p);
    }

    msgEl.appendChild(avatarEl);
    msgEl.appendChild(contentEl);
    return msgEl;
}

function mostrarDigitando() {
    const container = document.getElementById('chatbot-messages');
    if (!container) return null;

    const id = 'typing-' + Date.now();

    const el = document.createElement('div');
    el.id = id;
    el.className = 'chatbot-msg chatbot-msg-bot';

    const avatar = document.createElement('span');
    avatar.className = 'material-icons chatbot-msg-avatar';
    avatar.textContent = 'smart_toy';

    const typing = document.createElement('div');
    typing.className = 'chatbot-typing';
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'chatbot-typing-dot';
        typing.appendChild(dot);
    }

    el.appendChild(avatar);
    el.appendChild(typing);
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    const statusEl = document.getElementById('chatbot-status');
    if (statusEl) statusEl.textContent = 'Pensando...';

    return id;
}

function removerDigitando(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
    const statusEl = document.getElementById('chatbot-status');
    if (statusEl) statusEl.textContent = 'Pronto para ajudar';
}

function mostrarIndisponivel(container) {
    const messagesEl = container.querySelector('.chatbot-messages');
    const inputArea  = container.querySelector('.chatbot-input-area');
    const sugestoes  = container.querySelector('.chatbot-suggestions');

    if (messagesEl) {
        messagesEl.textContent = '';
        const wrap = document.createElement('div');
        wrap.className = 'chatbot-unavailable';

        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'cloud_off';

        const p1 = document.createElement('p');
        p1.textContent = 'Big Cartola IA indisponivel no momento.';
        const p2 = document.createElement('p');
        p2.textContent = 'O servico sera ativado em breve.';

        wrap.appendChild(icon);
        wrap.appendChild(p1);
        wrap.appendChild(p2);
        messagesEl.appendChild(wrap);
    }

    if (inputArea) inputArea.style.display = 'none';
    if (sugestoes) sugestoes.style.display = 'none';
}

// =====================================================================
// UTILITARIOS
// =====================================================================

function fetchComTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

function destruirChatbotParticipante() {
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = '';
}

window.inicializarChatbotParticipante = inicializarChatbotParticipante;
window.destruirChatbotParticipante = destruirChatbotParticipante;
