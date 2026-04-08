/**
 * PARTICIPANTE CHATBOT — Big Cartola IA v1.0
 * Modulo frontend para o chatbot RAG.
 * Carregado via SPA navigation (participante-navigation.js).
 */

const LOG_TAG = 'PARTICIPANTE-CHATBOT';
const API_URL = '/api/chatbot/ask';
const API_STATUS_URL = '/api/chatbot/status';
const MAX_HISTORICO = 20;
const FETCH_TIMEOUT = 15000; // 15s (LLM pode demorar)

let mensagens = [];
let enviando = false;

/**
 * Inicializa o modulo chatbot.
 */
export async function inicializarChatbotParticipante() {
    if (window.Log) Log.debug(LOG_TAG, 'Inicializando v1.0...');

    const container = document.getElementById('chatbot-container');
    if (!container) {
        if (window.Log) Log.warn(LOG_TAG, 'Container nao encontrado');
        return;
    }

    // Verificar status do bot
    try {
        const statusResp = await fetchComTimeout(API_STATUS_URL, { method: 'GET' }, 5000);
        const statusData = await statusResp.json();

        if (!statusData.success || !statusData.data?.disponivel) {
            mostrarIndisponivel(container);
            return;
        }

        const statusEl = document.getElementById('chatbot-status');
        if (statusEl) {
            const chunks = statusData.data.totalChunks || 0;
            statusEl.textContent = chunks > 0
                ? `Pronto | ${chunks} docs indexados`
                : 'Pronto (base de conhecimento vazia)';
        }
    } catch {
        // Status check falhou, continuar com UI normal
    }

    // Configurar event listeners
    const input = document.getElementById('chatbot-input');
    const btnEnviar = document.getElementById('chatbot-send');
    const sugestoes = document.querySelectorAll('.chatbot-suggestion-chip');

    if (input && btnEnviar) {
        btnEnviar.addEventListener('click', () => enviarPergunta());

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarPergunta();
            }
        });
    }

    // Sugestoes rapidas
    sugestoes.forEach(chip => {
        chip.addEventListener('click', () => {
            const pergunta = chip.dataset.pergunta;
            if (pergunta) {
                const inputEl = document.getElementById('chatbot-input');
                if (inputEl) inputEl.value = pergunta;
                enviarPergunta();
            }
        });
    });

    // Focus no input
    if (input) input.focus();

    if (window.Log) Log.info(LOG_TAG, 'Chatbot inicializado');
}

/**
 * Envia pergunta ao backend e exibe resposta.
 */
async function enviarPergunta() {
    if (enviando) return;

    const input = document.getElementById('chatbot-input');
    const pergunta = input?.value?.trim();

    if (!pergunta || pergunta.length < 3) {
        if (window.ErrorToast) {
            window.ErrorToast.show('Digite uma pergunta (minimo 3 caracteres)', { tipo: 'info', duracao: 2000 });
        }
        return;
    }

    enviando = true;
    const btnEnviar = document.getElementById('chatbot-send');
    if (btnEnviar) btnEnviar.disabled = true;
    if (input) input.value = '';

    // Esconder sugestoes apos primeira pergunta
    const sugestoes = document.getElementById('chatbot-suggestions');
    if (sugestoes) sugestoes.style.display = 'none';

    // Adicionar mensagem do usuario
    adicionarMensagem('user', pergunta);

    // Mostrar indicador de digitando
    const typingId = mostrarDigitando();

    try {
        const resp = await fetchComTimeout(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pergunta }),
        }, FETCH_TIMEOUT);

        // Remover indicador de digitando
        removerDigitando(typingId);

        if (!resp.ok) {
            if (resp.status === 429) {
                adicionarMensagem('bot', 'Voce fez muitas perguntas. Aguarde 1 minuto e tente novamente.', [], true);
            } else if (resp.status === 401) {
                adicionarMensagem('bot', 'Sua sessao expirou. Faca login novamente.', [], true);
            } else {
                adicionarMensagem('bot', 'Desculpe, ocorreu um erro. Tente novamente.', [], true);
            }
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

        if (error.name === 'AbortError') {
            adicionarMensagem('bot', 'A resposta demorou demais. Tente uma pergunta mais simples.', [], true);
        } else {
            adicionarMensagem('bot', 'Erro de conexao. Verifique sua internet e tente novamente.', [], true);
        }

        if (window.Log) Log.warn(LOG_TAG, `Erro ao enviar: ${error.message}`);
    } finally {
        enviando = false;
        if (btnEnviar) btnEnviar.disabled = false;
        if (input) input.focus();
    }
}

/**
 * Adiciona mensagem a area de chat.
 */
function adicionarMensagem(tipo, texto, fontes = [], isError = false) {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    // Limitar historico
    mensagens.push({ tipo, texto, fontes, timestamp: Date.now() });
    if (mensagens.length > MAX_HISTORICO) mensagens.shift();

    const msgEl = document.createElement('div');
    msgEl.className = `chatbot-msg chatbot-msg-${tipo}${isError ? ' chatbot-msg-error' : ''}`;

    const iconName = tipo === 'bot' ? 'smart_toy' : 'person';
    const avatarHtml = `<span class="material-icons chatbot-msg-avatar">${iconName}</span>`;

    let fontesHtml = '';
    if (fontes.length > 0) {
        const chips = fontes.map(f => {
            const nome = f.split('/').pop().replace(/\.(json|md)$/, '');
            return `<span class="chatbot-fonte-chip">${nome}</span>`;
        }).join('');
        fontesHtml = `<div class="chatbot-msg-fontes">${chips}</div>`;
    }

    // Converter quebras de linha em paragrafos
    const paragrafos = texto.split('\n').filter(l => l.trim()).map(l => `<p>${escapeHtml(l)}</p>`).join('');

    msgEl.innerHTML = `
        ${avatarHtml}
        <div class="chatbot-msg-content">
            ${paragrafos}
            ${fontesHtml}
        </div>
    `;

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
}

/**
 * Mostra indicador de "digitando..."
 */
function mostrarDigitando() {
    const container = document.getElementById('chatbot-messages');
    if (!container) return null;

    const id = `typing-${Date.now()}`;
    const el = document.createElement('div');
    el.id = id;
    el.className = 'chatbot-msg chatbot-msg-bot';
    el.innerHTML = `
        <span class="material-icons chatbot-msg-avatar">smart_toy</span>
        <div class="chatbot-typing">
            <div class="chatbot-typing-dot"></div>
            <div class="chatbot-typing-dot"></div>
            <div class="chatbot-typing-dot"></div>
        </div>
    `;

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    // Atualizar status
    const statusEl = document.getElementById('chatbot-status');
    if (statusEl) statusEl.textContent = 'Pensando...';

    return id;
}

/**
 * Remove indicador de digitando.
 */
function removerDigitando(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();

    const statusEl = document.getElementById('chatbot-status');
    if (statusEl) statusEl.textContent = 'Pronto para ajudar';
}

/**
 * Mostra estado indisponivel.
 */
function mostrarIndisponivel(container) {
    const messagesEl = container.querySelector('.chatbot-messages');
    const inputArea = container.querySelector('.chatbot-input-area');
    const sugestoes = container.querySelector('.chatbot-suggestions');

    if (messagesEl) {
        messagesEl.innerHTML = `
            <div class="chatbot-unavailable">
                <span class="material-icons">cloud_off</span>
                <p>Big Cartola IA indisponivel no momento.</p>
                <p>O servico sera ativado em breve.</p>
            </div>
        `;
    }

    if (inputArea) inputArea.style.display = 'none';
    if (sugestoes) sugestoes.style.display = 'none';
}

/**
 * Fetch com timeout (AbortController).
 */
function fetchComTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}

/**
 * Escape HTML para prevenir XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exportar para o sistema de navegacao
window.inicializarChatbotParticipante = inicializarChatbotParticipante;
