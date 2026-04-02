// =====================================================
// MÓDULO: RANKING PARTICIPANTE - v4.0 MOBILE-FIRST
// Redesign completo com hierarquia G12/Z12
// =====================================================

if (window.Log) Log.info('PARTICIPANTE-RANKING', 'Módulo v4.0 MOBILE-FIRST carregando...');

import { injectModuleLP } from './module-lp-engine.js';

// ===== IMPORT DO MÓDULO PRINCIPAL =====
async function inicializarRankingParticipante(payload) {
    if (window.Log) Log.info('PARTICIPANTE-RANKING', '🚀 Inicializando módulo v4.0...');

    const ligaId = payload && payload.ligaId;

    injectModuleLP({
        wrapperId:    'ranking-geral-lp-wrapper',
        insertBefore: 'ranking-geral-content',
        ligaId,
        moduloKey:    'ranking_geral',
        titulo:       'Ranking Geral',
        tagline:      'Classificação da temporada',
        icon:         'leaderboard',
        colorClass:   'module-lp-ranking-geral',
    });

    // Injetar share button no slot de ações da strip (desabilitado até import concluir)
    let shareBtn = null;
    const stripActions = document.querySelector('#ranking-geral-lp-wrapper .module-lp-strip-actions');
    if (stripActions && !stripActions.querySelector('.btn-share')) {
        const shareIcon = document.createElement('span');
        shareIcon.className = 'material-icons';
        shareIcon.textContent = 'share';
        shareBtn = document.createElement('button');
        shareBtn.className = 'btn-share';
        shareBtn.title = 'Compartilhar ranking';
        shareBtn.setAttribute('aria-label', 'Compartilhar ranking');
        shareBtn.disabled = true;
        shareBtn.style.opacity = '0.4';
        shareBtn.appendChild(shareIcon);
        shareBtn.addEventListener('click', () => {
            if (typeof window.compartilharRanking === 'function') window.compartilharRanking();
        });
        stripActions.appendChild(shareBtn);
    }

    try {
        // Importar módulo principal (com cache-busting)
        const moduloRanking = await import(`/participante/modules/ranking/ranking.js?v=${Date.now()}`);

        // Aguardar DOM estar pronto (double RAF)
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // Verificar se container existe
        const container = document.getElementById('rankingLista');
        if (!container) {
            throw new Error('Container #rankingLista não encontrado no DOM');
        }

        // Inicializar módulo
        if (moduloRanking.initRanking) {
            await moduloRanking.initRanking();
            if (shareBtn) { shareBtn.disabled = false; shareBtn.style.opacity = ''; }
            if (window.Log) Log.info('PARTICIPANTE-RANKING', '✅ Módulo v4.0 inicializado com sucesso');
        } else {
            throw new Error('Função initRanking não encontrada no módulo');
        }

    } catch (error) {
        if (window.Log) Log.error('PARTICIPANTE-RANKING', '❌ Erro ao inicializar módulo:', error);
        mostrarErroFallback(error.message);
    }
}

// ===== FALLBACK DE ERRO =====
function mostrarErroFallback(mensagem) {
    const container = document.getElementById('rankingLista');
    if (container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; min-height: 300px;">
                <span class="material-icons" style="font-size: 48px; color: var(--app-danger); margin-bottom: 16px;">warning</span>
                <p style="font-weight: 600; color: var(--app-text-primary); margin-bottom: 8px;">Erro ao carregar ranking</p>
                <p style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-bottom: 20px;">${mensagem}</p>
                <button
                    onclick="location.reload()"
                    style="padding: 10px 20px; background: linear-gradient(135deg, #ff5c00, #ff8c00); color: var(--app-text-primary); border: none; border-radius: 8px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(255,92,0,0.3);">
                    <span class="material-icons" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">refresh</span>
                    Recarregar Página
                </button>
            </div>
        `;
    }
}

// ===== EXPORT =====
export { inicializarRankingParticipante };

if (window.Log) Log.info('PARTICIPANTE-RANKING', '✅ Módulo v4.0 carregado e pronto');
