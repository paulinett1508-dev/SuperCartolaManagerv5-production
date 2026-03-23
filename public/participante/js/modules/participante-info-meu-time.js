// participante-info-meu-time.js - v1.0
// Inicializador da tela Info do Meu Time
// Fix: modulo ES6 substituindo dead script inline que nunca executava via innerHTML

if (window.Log) Log.info('INFO-MEU-TIME', 'Inicializando...');

function _renderMensagem(containerId, icone, texto) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Limpar conteudo atual
    while (container.firstChild) container.removeChild(container.firstChild);
    const div = document.createElement('div');
    div.className = 'text-center py-16';
    const icon = document.createElement('span');
    icon.className = 'material-icons text-4xl';
    icon.style.color = 'var(--app-text-dim)';
    icon.textContent = icone;
    const p = document.createElement('p');
    p.className = 'text-gray-400 mt-3 text-sm';
    p.textContent = texto;
    div.appendChild(icon);
    div.appendChild(p);
    container.appendChild(div);
}

export async function inicializarInfoMeuTimeParticipante(payload) {
    const subtitle = document.getElementById('info-meu-time-subtitle');

    // clubeId nao esta no payload — fonte: window.participanteAuth
    // (mesmo padrao de participante-home.js e participante-agenda-tabelas.js)
    const clubeId = window.participanteAuth?.participante?.participante?.clube_id
                 || window.participanteAuth?.participante?.clube_id
                 || null;

    // Atualizar subtitle com nome do clube
    if (clubeId && subtitle && window.getClubesNomeMap) {
        const nomeClube = window.getClubesNomeMap()[Number(clubeId)];
        if (nomeClube && nomeClube !== 'Seu Time') {
            subtitle.textContent = 'Noticias do ' + nomeClube;
        }
    }

    // Sem clube configurado
    if (!clubeId) {
        _renderMensagem('info-meu-time-noticias', 'newspaper', 'Nenhum time do coracao configurado');
        return;
    }

    // Componente de noticias nao carregado (falha de script defer)
    if (!window.NoticiasTime) {
        _renderMensagem('info-meu-time-noticias', 'newspaper', 'Componente de noticias nao disponivel');
        return;
    }

    // Renderizar noticias
    await window.NoticiasTime.renderizar({
        clubeId,
        containerId: 'info-meu-time-noticias',
        limite: 15,
        modo: 'completo',
        pagina: true,
    });
}
