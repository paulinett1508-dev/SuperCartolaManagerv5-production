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
const MAX_HISTORICO = 50;
const MAX_CONVERSAS = 20;
const HISTORICO_LLM = 6;        // msgs enviadas ao LLM por request
const DIAS_LIMPAR_ANTIGAS = 30;
const FETCH_TIMEOUT = 20000;
const STORAGE_KEY_V2 = 'scm_chatbot_v2';

let conversas = [];
let conversaAtualId = null;
let mensagens = [];
let enviando = false;
let _ligaId = null;

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
            if (d.modo === 'basico') statusEl.textContent = 'Modo basico — dados da liga em tempo real';
            else if (d.modo === 'llm') statusEl.textContent = d.totalChunks > 0 ? `IA ativa | ${d.totalChunks} docs indexados` : 'IA ativa';
            else statusEl.textContent = 'Pronto para ajudar';
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

    document.querySelectorAll('.chatbot-suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const pergunta = chip.dataset.pergunta;
            if (pergunta && input) { input.value = pergunta; enviarPergunta(); }
        });
    });

    if (btnConvs)  btnConvs.addEventListener('click', () => abrirPainelConversas());
    if (btnNova)   btnNova.addEventListener('click', () => criarNovaConversa());
    if (btnLimpar) btnLimpar.addEventListener('click', () => limparConversa());
    if (btnClose)  btnClose.addEventListener('click', () => fecharPainelConversas());

    if (input) input.focus();
    if (window.Log) Log.info(LOG_TAG, `Chatbot v3 inicializado | conversa=${conversaAtualId}`);
}

// =====================================================================
// ENVIAR PERGUNTA
// =====================================================================

async function enviarPergunta() {
    if (enviando) return;

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
            const msg = resp.status === 429 ? 'Voce fez muitas perguntas. Aguarde 1 minuto e tente novamente.'
                      : resp.status === 401 ? 'Sua sessao expirou. Faca login novamente.'
                      : 'Desculpe, ocorreu um erro. Tente novamente.';
            adicionarMensagem('bot', msg, [], true);
            return;
        }

        const data = await resp.json();
        if (data.success && data.data) {
            adicionarMensagem('bot', data.data.resposta, data.data.fontes || []);
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

    // Chips de fonte (nomes de arquivos do servidor — via textContent)
    if (fontes.length > 0) {
        const fontesDiv = document.createElement('div');
        fontesDiv.className = 'chatbot-msg-fontes';
        for (const f of fontes) {
            const nome = f.split('/').pop().replace(/\.(json|md)$/, '');
            const chip = document.createElement('span');
            chip.className = 'chatbot-fonte-chip';
            chip.textContent = nome;
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
