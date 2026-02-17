// =====================================================================
// noticias-time.js - Notícias personalizadas do time do coração v1.0
// =====================================================================
// Componente reutilizável que exibe notícias do clube favorito
// Usado na Home e na tela de Manutenção
// =====================================================================

const NoticiasTime = {
    _cache: null,
    _clubeIdAtual: null,
    _carregando: false,

    /**
     * Busca notícias do backend para um clube específico
     * @param {number|string} clubeId - ID do clube no Cartola
     * @returns {Promise<Object>} { noticias, clube, erro }
     */
    async buscarNoticias(clubeId) {
        if (!clubeId) return { noticias: [], clube: null, erro: 'Sem clube' };

        // Cache local (evita requests duplicados na mesma sessão)
        if (this._cache && this._clubeIdAtual === String(clubeId) &&
            (Date.now() - this._cache.timestamp) < 5 * 60 * 1000) { // 5min cache local
            return this._cache.dados;
        }

        try {
            const response = await fetch(`/api/noticias/time/${clubeId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (data.success) {
                const resultado = {
                    noticias: data.noticias || [],
                    clube: data.clube,
                    total: data.total
                };

                // Salvar cache local
                this._cache = { dados: resultado, timestamp: Date.now() };
                this._clubeIdAtual = String(clubeId);

                return resultado;
            }

            return { noticias: [], clube: null, erro: data.erro };
        } catch (error) {
            console.error('[NOTICIAS-TIME] Erro ao buscar:', error);
            return { noticias: [], clube: null, erro: error.message };
        }
    },

    /**
     * Renderiza o componente de notícias
     * @param {Object} options
     * @param {number|string} options.clubeId - ID do clube
     * @param {string} options.containerId - ID do elemento container
     * @param {number} [options.limite=5] - Quantidade máxima de notícias
     * @param {string} [options.modo='completo'] - 'completo' ou 'compacto'
     */
    async renderizar({ clubeId, containerId, limite = 5, modo = 'completo' }) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!clubeId) {
            container.innerHTML = '';
            return;
        }

        // Loading
        container.innerHTML = this._renderLoading(modo);

        const resultado = await this.buscarNoticias(clubeId);

        if (resultado.erro || !resultado.noticias.length) {
            container.innerHTML = this._renderVazio(resultado.clube, modo);
            return;
        }

        const noticias = resultado.noticias.slice(0, limite);
        container.innerHTML = modo === 'compacto'
            ? this._renderCompacto(noticias, resultado.clube, clubeId)
            : this._renderCompleto(noticias, resultado.clube, clubeId);
    },

    /**
     * Renderiza loading state
     */
    _renderLoading(modo) {
        if (modo === 'compacto') {
            return `
                <div style="text-align:center;padding:16px;color:#9ca3af;">
                    <span class="material-icons" style="animation:spin 1s linear infinite;font-size:20px;">autorenew</span>
                    <div style="font-size:0.75rem;margin-top:6px;">Buscando notícias...</div>
                </div>`;
        }
        return `
            <section class="noticias-home-section mx-4 mb-6">
                <div style="text-align:center;padding:24px;background:var(--app-surface);border-radius:12px;border:1px solid var(--app-noticias-border);">
                    <div style="width:32px;height:32px;border:3px solid #374151;border-top-color:#ff6d00;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px;"></div>
                    <p style="font-size:0.8rem;color:#9ca3af;">Buscando notícias do seu time...</p>
                </div>
            </section>`;
    },

    /**
     * Renderiza estado vazio (sem notícias)
     */
    _renderVazio(clube, modo) {
        if (modo === 'compacto') return '';
        return `
            <section class="noticias-home-section mx-4 mb-6">
                <div style="background:#1c1c1e;border-radius:12px;padding:20px;text-align:center;border:1px solid var(--app-noticias-border);">
                    <span class="material-icons" style="font-size:32px;color:#4b5563;">newspaper</span>
                    <p style="font-size:0.8rem;color:#6b7280;margin-top:8px;">
                        Nenhuma notícia encontrada${clube ? ` sobre ${clube}` : ''} no momento
                    </p>
                </div>
            </section>`;
    },

    /**
     * Gera gradient CSS baseado nas cores do clube
     * cor1 → cor1/escuro → cor2 (135deg, mesmo padrão Copa do Mundo)
     */
    _gerarGradientClube(clubeId) {
        const cores = this._CLUBES_CORES[Number(clubeId)];
        if (!cores) return 'var(--app-noticias-fallback-gradient)';

        const cor1 = cores.cor1;
        const cor2 = cores.cor2;
        // Mistura escura no meio para profundidade
        return `linear-gradient(135deg, ${cor1} 0%, ${this._escurecerCor(cor1)} 50%, ${cor2} 100%)`;
    },

    /**
     * Escurece uma cor hex para usar no meio do gradient
     */
    _escurecerCor(hex) {
        if (!hex || hex.startsWith('var(')) return '#111111';
        const limpo = hex.replace('#', '');
        const r = Math.max(0, parseInt(limpo.substring(0, 2), 16) - 50);
        const g = Math.max(0, parseInt(limpo.substring(2, 4), 16) - 50);
        const b = Math.max(0, parseInt(limpo.substring(4, 6), 16) - 50);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    },

    /**
     * Gera cor da borda baseada na cor primária do clube
     */
    _gerarBorderClube(clubeId) {
        const cores = this._CLUBES_CORES[Number(clubeId)];
        if (!cores) return 'var(--app-noticias-border)';
        const cor1 = cores.cor1;
        if (cor1.startsWith('var(')) return 'var(--app-noticias-border)';
        const limpo = cor1.replace('#', '');
        const r = parseInt(limpo.substring(0, 2), 16);
        const g = parseInt(limpo.substring(2, 4), 16);
        const b = parseInt(limpo.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.35)`;
    },

    /**
     * Gera background sutil para o conteúdo baseado na cor primária do clube
     */
    _gerarContentBgClube(clubeId) {
        const cores = this._CLUBES_CORES[Number(clubeId)];
        if (!cores) return 'var(--app-surface)';
        const cor1 = cores.cor1;
        if (cor1.startsWith('var(')) return 'var(--app-surface)';
        const limpo = cor1.replace('#', '');
        const r = parseInt(limpo.substring(0, 2), 16);
        const g = parseInt(limpo.substring(2, 4), 16);
        const b = parseInt(limpo.substring(4, 6), 16);
        return `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.08) 0%, var(--app-surface) 100%)`;
    },

    /**
     * Cores dos clubes (fonte única: clubes-data.js)
     */
    _CLUBES_CORES: {
        262:  { cor1: '#c4161c', cor2: '#1a1a1a' },   // Flamengo
        263:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Botafogo
        264:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Corinthians
        265:  { cor1: '#0056a8', cor2: '#e42527' },     // Bahia
        266:  { cor1: '#8b0042', cor2: '#006633' },     // Fluminense
        267:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Vasco
        275:  { cor1: '#006437', cor2: '#ffffff' },     // Palmeiras
        276:  { cor1: '#e42527', cor2: '#2a2a2a' },     // São Paulo
        277:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Santos
        280:  { cor1: '#e42527', cor2: '#ffffff' },     // Bragantino
        282:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Atlético-MG
        283:  { cor1: '#003399', cor2: '#ffffff' },     // Cruzeiro
        284:  { cor1: '#0c2340', cor2: '#75c4e2' },     // Grêmio
        285:  { cor1: '#e42527', cor2: '#ffffff' },     // Internacional
        286:  { cor1: '#006633', cor2: '#ffffff' },     // Juventude
        287:  { cor1: '#e42527', cor2: '#2a2a2a' },     // Vitória
        290:  { cor1: '#006633', cor2: '#ffffff' },     // Goiás
        292:  { cor1: '#e42527', cor2: '#2a2a2a' },     // Sport
        293:  { cor1: '#c4161c', cor2: '#2a2a2a' },     // Athletico-PR
        354:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Ceará
        356:  { cor1: '#003399', cor2: '#e42527' },     // Fortaleza
        1371: { cor1: '#006633', cor2: '#ffd700' },     // Cuiabá
        2305: { cor1: '#ffd700', cor2: '#006633' },     // Mirassol
        270:  { cor1: '#006633', cor2: '#ffffff' },     // Coritiba
        273:  { cor1: '#006633', cor2: '#ffffff' },     // América-MG
        274:  { cor1: '#006633', cor2: '#ffffff' },     // Chapecoense
        288:  { cor1: '#2a2a2a', cor2: '#ffffff' },     // Ponte Preta
        315:  { cor1: '#ffd700', cor2: '#2a2a2a' },     // Novorizontino
        344:  { cor1: '#e42527', cor2: '#2a2a2a' },     // Santa Cruz
        373:  { cor1: '#e42527', cor2: '#ffffff' },     // CRB
    },

    /**
     * Renderiza modo completo (para Home) - Padrão Copa do Mundo
     */
    _renderCompleto(noticias, clube, clubeId) {
        const gradient = this._gerarGradientClube(clubeId);
        const borderColor = this._gerarBorderClube(clubeId);
        const contentBg = this._gerarContentBgClube(clubeId);

        const noticiasHTML = noticias.map((noticia, idx) => {
            const isFirst = idx === 0;
            const temImagem = noticia.imagem || noticia.thumbnail || noticia.urlImagem;

            return `
                <a href="${this._sanitizeUrl(noticia.link)}" target="_blank" rel="noopener noreferrer"
                   class="noticias-item ${isFirst ? 'noticias-item-destaque' : ''}"
                   style="text-decoration:none;display:block;">
                    ${temImagem ? `
                        <div class="noticias-thumbnail">
                            <img src="${this._sanitizeUrl(temImagem)}"
                                 alt="${this._sanitizeHtml(noticia.titulo)}"
                                 onerror="this.parentElement.style.display='none'"
                                 loading="lazy">
                        </div>
                    ` : ''}
                    <div class="noticias-item-content">
                        <div class="noticias-item-badge">
                            <img src="/escudos/${clubeId}.png" alt="${clube}"
                                 style="width:20px;height:20px;object-fit:contain;"
                                 onerror="this.style.display='none'">
                        </div>
                        <div class="noticias-item-text">
                            <h4 class="noticias-titulo">${this._sanitizeHtml(noticia.titulo)}</h4>
                            <div class="noticias-meta">
                                ${noticia.fonte ? `<span class="noticias-fonte">${this._sanitizeHtml(noticia.fonte)}</span>` : ''}
                                ${noticia.tempoRelativo ? `<span class="noticias-tempo">${noticia.tempoRelativo}</span>` : ''}
                            </div>
                        </div>
                        <span class="material-icons noticias-arrow">chevron_right</span>
                    </div>
                </a>`;
        }).join('');

        return `
            <section id="noticias-home-section" class="noticias-home-section mx-4 mb-6">
                <!-- Header Colapsável Notícias (Degradê Cores do Time) -->
                <button class="noticias-home-header" style="background:${gradient};border-color:${borderColor};" onclick="window.toggleNoticiasHome && window.toggleNoticiasHome()">
                    <div class="noticias-home-header-left">
                        <img src="/escudos/${clubeId}.png" alt="${this._sanitizeHtml(clube)}"
                             class="noticias-home-header-escudo"
                             onerror="this.style.display='none'">
                        <div class="noticias-home-header-info">
                            <h2 class="noticias-home-header-title">Notícias do ${this._sanitizeHtml(clube)}</h2>
                            <span class="noticias-home-header-sub">${noticias.length} notícias recentes</span>
                        </div>
                    </div>
                    <span class="material-icons noticias-home-chevron">expand_more</span>
                </button>

                <!-- Conteúdo Colapsável -->
                <div class="noticias-home-content collapsed" id="noticias-home-content" style="background:${contentBg};border-color:${borderColor};">
                    <div class="noticias-list">
                        ${noticiasHTML}
                    </div>
                </div>
            </section>`;
    },

    /**
     * Renderiza modo compacto (para Manutenção)
     */
    _renderCompacto(noticias, clube, clubeId) {
        const noticiasHTML = noticias.map(noticia => `
            <a href="${this._sanitizeUrl(noticia.link)}" target="_blank" rel="noopener noreferrer"
               style="text-decoration:none;display:flex;align-items:flex-start;gap:10px;padding:12px;background:#111827;border-radius:10px;border:1px solid #1f2937;transition:background 0.2s;">
                <img src="/escudos/${clubeId}.png" alt="${clube}"
                     style="width:24px;height:24px;object-fit:contain;flex-shrink:0;margin-top:2px;"
                     onerror="this.style.display='none'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.82rem;color:#e5e7eb;line-height:1.4;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                        ${this._sanitizeHtml(noticia.titulo)}
                    </div>
                    <div style="display:flex;gap:8px;margin-top:4px;font-size:0.7rem;color:#6b7280;">
                        ${noticia.fonte ? `<span>${this._sanitizeHtml(noticia.fonte)}</span>` : ''}
                        ${noticia.tempoRelativo ? `<span>${noticia.tempoRelativo}</span>` : ''}
                    </div>
                </div>
                <span class="material-icons" style="font-size:16px;color:#4b5563;flex-shrink:0;margin-top:4px;">open_in_new</span>
            </a>
        `).join('');

        return `
            <div style="margin-top:20px;">
                <h3 style="font-family:'Russo One',sans-serif;font-size:1rem;color:var(--app-pos-gol-light);margin:0 0 12px;display:flex;align-items:center;gap:8px;">
                    <span class="material-icons" style="font-size:20px;">newspaper</span>
                    Notícias do ${this._sanitizeHtml(clube)}
                </h3>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${noticiasHTML}
                </div>
            </div>`;
    },

    /**
     * Sanitiza texto para evitar XSS
     */
    _sanitizeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Sanitiza URL
     */
    _sanitizeUrl(url) {
        if (!url) return '#';
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.href;
            }
        } catch (e) {
            // URL inválida
        }
        return '#';
    }
};

// Expor globalmente
window.NoticiasTime = NoticiasTime;

console.log('[NOTICIAS-TIME] Componente v1.0 carregado');
