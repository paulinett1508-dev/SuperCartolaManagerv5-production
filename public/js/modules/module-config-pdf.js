/**
 * MODULE-CONFIG-PDF.JS - Relatório PDF de Parametrizações de Módulos
 *
 * Gera um PDF completo com todas as configurações dos módulos de uma liga,
 * incluindo módulos ativos, desativados e suas respectivas regras.
 *
 * @version 1.0.0
 * @date 2026-01-28
 */

import { CURRENT_SEASON } from "../config/seasons-client.js";

// =============================================================================
// CONFIGURAÇÕES DO RELATÓRIO
// =============================================================================

const PDF_CONFIG = {
    margemEsquerda: 15,
    margemDireita: 15,
    margemTopo: 15,
    margemRodape: 20,
    corPrimaria: [255, 69, 0],      // Laranja Super Cartola
    corSecundaria: [26, 26, 26],    // Fundo escuro
    corTexto: [255, 255, 255],
    corTextoSecundario: [150, 150, 150],
    corVerde: [34, 197, 94],
    corVermelha: [239, 68, 68],
    corAmarela: [250, 204, 21],
    fonteNormal: 'helvetica',
    tamTitulo: 18,
    tamSubtitulo: 12,
    tamTexto: 9,
    tamPequeno: 7,
    alturaLinha: 5
};

// Mapeamento de módulos para nomes amigáveis e ícones
const MODULOS_INFO = {
    extrato: { nome: 'Extrato Financeiro', icone: '💰', tipo: 'Base' },
    ranking_geral: { nome: 'Ranking Geral', icone: '🏆', tipo: 'Base' },
    ranking_rodada: { nome: 'Banco (Por Rodadas)', icone: '📊', tipo: 'Base' },
    top_10: { nome: 'TOP 10', icone: '🥇', tipo: 'Opcional' },
    melhor_mes: { nome: 'Melhor do Mês', icone: '📅', tipo: 'Opcional' },
    pontos_corridos: { nome: 'Pontos Corridos', icone: '📋', tipo: 'Opcional' },
    mata_mata: { nome: 'Mata-Mata', icone: '⚔️', tipo: 'Opcional' },
    artilheiro: { nome: 'Artilheiro', icone: '⚽', tipo: 'Opcional' },
    luva_ouro: { nome: 'Luva de Ouro', icone: '🧤', tipo: 'Opcional' },
    turno_returno: { nome: 'Turno e Returno', icone: '🔄', tipo: 'Opcional' },
    capitao_luxo: { nome: 'Capitão de Luxo', icone: '👑', tipo: 'Planejado' },
    resta_um: { nome: 'Resta Um', icone: '🃏', tipo: 'Planejado' }
};

// =============================================================================
// CLASSE PRINCIPAL
// =============================================================================

class ModuleConfigPDF {
    constructor() {
        this.doc = null;
        this.paginaAtual = 1;
        this.y = 0;
        this.ligaData = null;
        this.modulosConfigs = [];
        this.modulosAtivos = {};
    }

    /**
     * Gera o relatório PDF completo
     * @param {string} ligaId - ID da liga
     */
    async gerarRelatorio(ligaId) {
        try {
            console.log('[PDF] 1. Carregando dados...');
            await this.carregarDados(ligaId);
            console.log('[PDF] 1. OK - Dados carregados:', this.ligaData?.nome);

            console.log('[PDF] 2. Inicializando PDF...');
            this.inicializarPDF();
            console.log('[PDF] 2. OK - PDF inicializado');

            console.log('[PDF] 3. Desenhando capa...');
            this.desenharCapa();
            console.log('[PDF] 3. OK - Capa desenhada');

            console.log('[PDF] 4. Nova página...');
            this.novaPagina();
            console.log('[PDF] 4. OK');

            console.log('[PDF] 5. Resumo módulos...');
            this.desenharResumoModulos();
            console.log('[PDF] 5. OK');

            console.log('[PDF] 6. Detalhes módulos...');
            this.desenharDetalhesModulos();
            console.log('[PDF] 6. OK');

            console.log('[PDF] 7. Módulos desativados...');
            this.desenharModulosDesativados();
            console.log('[PDF] 7. OK');

            console.log('[PDF] 8. Rodapé final...');
            this.desenharRodapeFinal();
            console.log('[PDF] 8. OK');

            console.log('[PDF] 9. Salvando...');
            const nomeArquivo = `parametrizacoes_${this.ligaData.nome.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            this.doc.save(nomeArquivo);
            console.log('[PDF] 9. OK - Arquivo salvo:', nomeArquivo);

            return { success: true, arquivo: nomeArquivo };

        } catch (error) {
            console.error('[MODULE-CONFIG-PDF] Erro completo:', {
                message: error?.message,
                name: error?.name,
                stack: error?.stack,
                error: error
            });
            throw error;
        }
    }

    /**
     * Carrega todos os dados necessários
     */
    async carregarDados(ligaId) {
        // Carregar dados da liga
        const ligaRes = await fetch(`/api/ligas/${ligaId}`);
        if (!ligaRes.ok) throw new Error('Erro ao carregar liga');
        this.ligaData = await ligaRes.json();

        // Carregar módulos ativos
        const modulosRes = await fetch(`/api/ligas/${ligaId}/modulos-ativos`);
        if (modulosRes.ok) {
            const data = await modulosRes.json();
            this.modulosAtivos = data.modulos || {};
        }

        // Carregar configurações de cada módulo
        const modulosParaBuscar = [
            'extrato', 'ranking_geral', 'ranking_rodada', 'top_10',
            'melhor_mes', 'pontos_corridos', 'mata_mata', 'artilheiro', 'luva_ouro'
        ];

        this.modulosConfigs = [];
        for (const modulo of modulosParaBuscar) {
            try {
                const res = await fetch(`/api/liga/${ligaId}/modulos/${modulo}`);
                if (res.ok) {
                    const config = await res.json();
                    this.modulosConfigs.push({ modulo, config, ativo: this.isModuloAtivo(modulo) });
                }
            } catch (e) {
                // Módulo não configurado - usar defaults
                this.modulosConfigs.push({ modulo, config: null, ativo: this.isModuloAtivo(modulo) });
            }
        }
    }

    /**
     * Verifica se módulo está ativo
     */
    isModuloAtivo(modulo) {
        // Mapear nomes de módulos
        const keyMap = {
            'ranking_rodada': 'rodadas',
            'ranking_geral': 'ranking',
            'top_10': 'top10',
            'melhor_mes': 'melhorMes',
            'pontos_corridos': 'pontosCorridos',
            'mata_mata': 'mataMata',
            'luva_ouro': 'luvaOuro'
        };

        const key = keyMap[modulo] || modulo;

        // Módulos base sempre ativos
        if (['extrato', 'ranking', 'rodadas', 'ranking_geral', 'ranking_rodada'].includes(modulo) ||
            ['extrato', 'ranking', 'rodadas'].includes(key)) {
            return true;
        }

        return this.modulosAtivos[key] === true;
    }

    /**
     * Inicializa o documento PDF
     */
    inicializarPDF() {
        // Verificar se jsPDF está disponível (CDN UMD usa window.jspdf.jsPDF)
        const jsPDFCtor = (typeof jsPDF !== 'undefined')
            ? jsPDF
            : (window.jspdf && window.jspdf.jsPDF);

        if (!jsPDFCtor) {
            throw new Error('jsPDF não está carregado. Adicione a biblioteca ao projeto.');
        }

        this.doc = new jsPDFCtor({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        this.paginaAtual = 1;
        this.y = PDF_CONFIG.margemTopo;
    }

    /**
     * Desenha a capa do relatório
     */
    desenharCapa() {
        const doc = this.doc;
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();

        // Fundo escuro
        doc.setFillColor(...PDF_CONFIG.corSecundaria);
        doc.rect(0, 0, pw, ph, 'F');

        // Barra laranja no topo
        doc.setFillColor(...PDF_CONFIG.corPrimaria);
        doc.rect(0, 0, pw, 8, 'F');

        // Logo/Título
        doc.setTextColor(...PDF_CONFIG.corPrimaria);
        doc.setFontSize(28);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text('SUPER CARTOLA', pw / 2, 50, { align: 'center' });

        doc.setTextColor(...PDF_CONFIG.corTexto);
        doc.setFontSize(14);
        doc.setFont(PDF_CONFIG.fonteNormal, 'normal');
        doc.text('MANAGER', pw / 2, 60, { align: 'center' });

        // Título do relatório
        doc.setFontSize(22);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text('RELATÓRIO DE PARAMETRIZAÇÕES', pw / 2, 100, { align: 'center' });

        doc.setFontSize(16);
        doc.setFont(PDF_CONFIG.fonteNormal, 'normal');
        doc.text('Configurações dos Módulos', pw / 2, 112, { align: 'center' });

        // Box com informações da liga
        const boxY = 140;
        doc.setFillColor(40, 40, 45);
        doc.roundedRect(30, boxY, pw - 60, 50, 3, 3, 'F');

        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(10);
        doc.text('LIGA', pw / 2, boxY + 12, { align: 'center' });

        doc.setTextColor(...PDF_CONFIG.corTexto);
        doc.setFontSize(18);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text(this.ligaData.nome || 'Liga', pw / 2, boxY + 25, { align: 'center' });

        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(10);
        doc.setFont(PDF_CONFIG.fonteNormal, 'normal');
        doc.text(`Temporada ${this.ligaData.temporada || CURRENT_SEASON}`, pw / 2, boxY + 38, { align: 'center' });

        // Contadores de módulos
        const ativos = this.modulosConfigs.filter(m => m.ativo).length;
        const inativos = this.modulosConfigs.filter(m => !m.ativo).length;

        doc.setFontSize(12);
        doc.setTextColor(...PDF_CONFIG.corVerde);
        doc.text(`${ativos} Módulos Ativos`, pw / 2 - 30, boxY + 48, { align: 'center' });

        doc.setTextColor(...PDF_CONFIG.corVermelha);
        doc.text(`${inativos} Inativos`, pw / 2 + 40, boxY + 48, { align: 'center' });

        // Data de geração
        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(9);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pw / 2, ph - 30, { align: 'center' });

        // Rodapé
        doc.setFillColor(...PDF_CONFIG.corPrimaria);
        doc.rect(0, ph - 8, pw, 8, 'F');
    }

    /**
     * Cria uma nova página
     */
    novaPagina() {
        this.doc.addPage();
        this.paginaAtual++;
        this.y = PDF_CONFIG.margemTopo;
        this.desenharCabecalhoPagina();
    }

    /**
     * Desenha cabeçalho das páginas internas
     */
    desenharCabecalhoPagina() {
        const doc = this.doc;
        const pw = doc.internal.pageSize.getWidth();

        // Fundo do cabeçalho
        doc.setFillColor(...PDF_CONFIG.corSecundaria);
        doc.rect(0, 0, pw, 25, 'F');

        // Barra laranja
        doc.setFillColor(...PDF_CONFIG.corPrimaria);
        doc.rect(0, 0, pw, 3, 'F');

        // Título
        doc.setTextColor(...PDF_CONFIG.corTexto);
        doc.setFontSize(12);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text('PARAMETRIZAÇÕES DOS MÓDULOS', PDF_CONFIG.margemEsquerda, 14);

        // Liga e página
        doc.setFontSize(9);
        doc.setFont(PDF_CONFIG.fonteNormal, 'normal');
        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.text(this.ligaData.nome, pw - PDF_CONFIG.margemDireita, 10, { align: 'right' });
        doc.text(`Página ${this.paginaAtual}`, pw - PDF_CONFIG.margemDireita, 18, { align: 'right' });

        this.y = 32;
    }

    /**
     * Desenha resumo dos módulos
     */
    desenharResumoModulos() {
        const doc = this.doc;
        const pw = doc.internal.pageSize.getWidth();

        // Título da seção
        this.desenharTituloSecao('RESUMO DOS MÓDULOS');

        // Grid de módulos
        const modulosAtivos = this.modulosConfigs.filter(m => m.ativo);
        const modulosInativos = this.modulosConfigs.filter(m => !m.ativo);

        // Cards de ativos
        doc.setFillColor(30, 60, 30);
        doc.roundedRect(PDF_CONFIG.margemEsquerda, this.y, pw - 30, 8, 2, 2, 'F');
        doc.setTextColor(...PDF_CONFIG.corVerde);
        doc.setFontSize(10);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text(`MÓDULOS ATIVOS (${modulosAtivos.length})`, PDF_CONFIG.margemEsquerda + 5, this.y + 5.5);
        this.y += 12;

        modulosAtivos.forEach((m, idx) => {
            const info = MODULOS_INFO[m.modulo] || { nome: m.modulo, icone: '📦', tipo: 'Outro' };
            doc.setTextColor(...PDF_CONFIG.corTexto);
            doc.setFontSize(9);
            doc.setFont(PDF_CONFIG.fonteNormal, 'normal');
            doc.text(`• ${info.nome} (${info.tipo})`, PDF_CONFIG.margemEsquerda + 5, this.y);
            this.y += 5;
        });

        this.y += 8;

        // Cards de inativos
        if (modulosInativos.length > 0) {
            doc.setFillColor(60, 30, 30);
            doc.roundedRect(PDF_CONFIG.margemEsquerda, this.y, pw - 30, 8, 2, 2, 'F');
            doc.setTextColor(...PDF_CONFIG.corVermelha);
            doc.setFontSize(10);
            doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
            doc.text(`MÓDULOS DESATIVADOS (${modulosInativos.length})`, PDF_CONFIG.margemEsquerda + 5, this.y + 5.5);
            this.y += 12;

            modulosInativos.forEach((m) => {
                const info = MODULOS_INFO[m.modulo] || { nome: m.modulo, icone: '📦', tipo: 'Outro' };
                doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
                doc.setFontSize(9);
                doc.text(`• ${info.nome}`, PDF_CONFIG.margemEsquerda + 5, this.y);
                this.y += 5;
            });
        }

        this.y += 10;
    }

    /**
     * Desenha detalhes de cada módulo ativo
     */
    desenharDetalhesModulos() {
        const modulosAtivos = this.modulosConfigs.filter(m => m.ativo);

        for (const modulo of modulosAtivos) {
            // Verificar se precisa nova página
            if (this.y > 220) {
                this.novaPagina();
            }

            this.desenharDetalheModulo(modulo);
        }
    }

    /**
     * Desenha detalhe de um módulo específico
     */
    desenharDetalheModulo(moduloData) {
        const doc = this.doc;
        const pw = doc.internal.pageSize.getWidth();
        const info = MODULOS_INFO[moduloData.modulo] || { nome: moduloData.modulo, icone: '📦', tipo: 'Outro' };

        // Cabeçalho do módulo
        doc.setFillColor(40, 40, 45);
        doc.roundedRect(PDF_CONFIG.margemEsquerda, this.y, pw - 30, 12, 2, 2, 'F');

        doc.setTextColor(...PDF_CONFIG.corPrimaria);
        doc.setFontSize(11);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text(`${info.nome}`, PDF_CONFIG.margemEsquerda + 5, this.y + 8);

        // Badge de tipo
        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(8);
        doc.text(`[${info.tipo}]`, pw - PDF_CONFIG.margemDireita - 5, this.y + 8, { align: 'right' });

        this.y += 16;

        // Configurações do módulo
        const config = moduloData.config;

        if (config && config.wizard_respostas && Object.keys(config.wizard_respostas).length > 0) {
            this.desenharConfiguracoes(config.wizard_respostas, moduloData.modulo);
        } else if (config && config.financeiro_override) {
            this.desenharConfiguracoes(config.financeiro_override, moduloData.modulo);
        } else {
            doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
            doc.setFontSize(9);
            doc.text('Configuração padrão (sem personalizações)', PDF_CONFIG.margemEsquerda + 5, this.y);
            this.y += 6;
        }

        // Buscar regras do módulo na liga.configuracoes
        if (this.ligaData.configuracoes && this.ligaData.configuracoes[moduloData.modulo]) {
            this.desenharRegrasLiga(this.ligaData.configuracoes[moduloData.modulo], moduloData.modulo);
        }

        this.y += 8;
    }

    /**
     * Desenha configurações de um módulo
     */
    desenharConfiguracoes(config, modulo) {
        const doc = this.doc;

        Object.entries(config).forEach(([chave, valor]) => {
            if (this.y > 270) {
                this.novaPagina();
            }

            // Formatar chave para legibilidade
            const chaveFormatada = this.formatarChave(chave);
            const valorFormatado = this.formatarValor(valor, chave);

            doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
            doc.setFontSize(8);
            doc.text(`${chaveFormatada}:`, PDF_CONFIG.margemEsquerda + 5, this.y);

            doc.setTextColor(...PDF_CONFIG.corTexto);
            doc.setFontSize(9);

            // Se valor for muito longo, quebrar em múltiplas linhas
            const maxWidth = 120;
            const linhas = doc.splitTextToSize(valorFormatado, maxWidth);
            doc.text(linhas, PDF_CONFIG.margemEsquerda + 60, this.y);

            this.y += 5 * Math.max(linhas.length, 1);
        });
    }

    /**
     * Desenha regras da liga para um módulo
     */
    desenharRegrasLiga(configLiga, modulo) {
        const doc = this.doc;

        if (!configLiga || typeof configLiga !== 'object') return;

        // Verificar se tem valores configurados
        if (configLiga.valores || configLiga.valores_mito || configLiga.premiacao || configLiga.edicoes) {
            doc.setTextColor(...PDF_CONFIG.corAmarela);
            doc.setFontSize(8);
            doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
            doc.text('REGRAS CONFIGURADAS NA LIGA:', PDF_CONFIG.margemEsquerda + 5, this.y);
            this.y += 5;

            doc.setFont(PDF_CONFIG.fonteNormal, 'normal');

            // Valores de ranking_rodada
            if (configLiga.valores && typeof configLiga.valores === 'object') {
                this.desenharTabelaValores(configLiga.valores, 'Valores por Posição');
            }

            // Valores TOP 10
            if (configLiga.valores_mito) {
                this.desenharTabelaValores(configLiga.valores_mito, 'Prêmios Mito');
            }
            if (configLiga.valores_mico) {
                this.desenharTabelaValores(configLiga.valores_mico, 'Penalidades Mico');
            }

            // Edições (melhor mês)
            if (configLiga.edicoes && Array.isArray(configLiga.edicoes)) {
                this.desenharEdicoes(configLiga.edicoes);
            }

            // Premiações
            if (configLiga.premiacao && typeof configLiga.premiacao === 'object') {
                doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
                doc.setFontSize(8);
                doc.text('Premiação:', PDF_CONFIG.margemEsquerda + 5, this.y);
                this.y += 4;
                Object.entries(configLiga.premiacao).forEach(([pos, val]) => {
                    doc.setTextColor(...PDF_CONFIG.corTexto);
                    doc.text(`  ${this.formatarChave(pos)}: R$ ${val}`, PDF_CONFIG.margemEsquerda + 10, this.y);
                    this.y += 4;
                });
            }
        }
    }

    /**
     * Desenha tabela de valores compacta
     */
    desenharTabelaValores(valores, titulo) {
        const doc = this.doc;
        const entries = Object.entries(valores).slice(0, 20); // Limitar a 20 posições

        if (entries.length === 0) return;

        if (this.y > 250) {
            this.novaPagina();
        }

        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(8);
        doc.text(`${titulo}:`, PDF_CONFIG.margemEsquerda + 5, this.y);
        this.y += 4;

        // Renderizar em formato compacto (4 colunas)
        const colunas = 4;
        const larguraColuna = 40;
        let col = 0;
        let startY = this.y;

        entries.forEach(([pos, val], idx) => {
            const x = PDF_CONFIG.margemEsquerda + 10 + (col * larguraColuna);
            const y = startY + Math.floor(idx / colunas) * 4;

            doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
            doc.setFontSize(7);
            doc.text(`${pos}º:`, x, y);

            const corValor = val > 0 ? PDF_CONFIG.corVerde : val < 0 ? PDF_CONFIG.corVermelha : PDF_CONFIG.corTextoSecundario;
            doc.setTextColor(...corValor);
            const sinal = val > 0 ? '+' : '';
            doc.text(`${sinal}R$${val}`, x + 8, y);

            col = (col + 1) % colunas;
        });

        this.y = startY + Math.ceil(entries.length / colunas) * 4 + 4;
    }

    /**
     * Desenha edições do melhor mês
     */
    desenharEdicoes(edicoes) {
        const doc = this.doc;

        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(8);
        doc.text('Edições:', PDF_CONFIG.margemEsquerda + 5, this.y);
        this.y += 4;

        edicoes.forEach((ed, idx) => {
            if (this.y > 270) {
                this.novaPagina();
            }
            doc.setTextColor(...PDF_CONFIG.corTexto);
            doc.setFontSize(7);
            const nome = ed.nome || `Edição ${idx + 1}`;
            const rodadas = `Rodadas ${ed.inicio || ed.rodada_inicial} - ${ed.fim || ed.rodada_final}`;
            doc.text(`  ${nome}: ${rodadas}`, PDF_CONFIG.margemEsquerda + 10, this.y);
            this.y += 4;
        });
    }

    /**
     * Desenha seção de módulos desativados
     */
    desenharModulosDesativados() {
        const modulosInativos = this.modulosConfigs.filter(m => !m.ativo);

        if (modulosInativos.length === 0) return;

        if (this.y > 200) {
            this.novaPagina();
        }

        this.desenharTituloSecao('MÓDULOS DESATIVADOS');

        const doc = this.doc;

        modulosInativos.forEach((m) => {
            const info = MODULOS_INFO[m.modulo] || { nome: m.modulo, tipo: 'Outro' };

            doc.setFillColor(50, 35, 35);
            doc.roundedRect(PDF_CONFIG.margemEsquerda, this.y, doc.internal.pageSize.getWidth() - 30, 10, 2, 2, 'F');

            doc.setTextColor(...PDF_CONFIG.corVermelha);
            doc.setFontSize(9);
            doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
            doc.text(`✗ ${info.nome}`, PDF_CONFIG.margemEsquerda + 5, this.y + 6.5);

            doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
            doc.setFontSize(8);
            doc.setFont(PDF_CONFIG.fonteNormal, 'normal');
            doc.text(`[${info.tipo}] - Não configurado`, doc.internal.pageSize.getWidth() - PDF_CONFIG.margemDireita - 5, this.y + 6.5, { align: 'right' });

            this.y += 14;
        });
    }

    /**
     * Desenha título de seção
     */
    desenharTituloSecao(titulo) {
        const doc = this.doc;

        doc.setFillColor(...PDF_CONFIG.corPrimaria);
        doc.rect(PDF_CONFIG.margemEsquerda, this.y, 3, 10, 'F');

        doc.setTextColor(...PDF_CONFIG.corTexto);
        doc.setFontSize(12);
        doc.setFont(PDF_CONFIG.fonteNormal, 'bold');
        doc.text(titulo, PDF_CONFIG.margemEsquerda + 8, this.y + 7);

        this.y += 15;
    }

    /**
     * Desenha rodapé final
     */
    desenharRodapeFinal() {
        const doc = this.doc;
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();

        // Linha de separação
        doc.setDrawColor(...PDF_CONFIG.corPrimaria);
        doc.setLineWidth(0.5);
        doc.line(PDF_CONFIG.margemEsquerda, ph - 15, pw - PDF_CONFIG.margemDireita, ph - 15);

        // Texto do rodapé
        doc.setTextColor(...PDF_CONFIG.corTextoSecundario);
        doc.setFontSize(7);
        doc.text('Super Cartola Manager - Relatório de Parametrizações', PDF_CONFIG.margemEsquerda, ph - 8);
        doc.text(`Página ${this.paginaAtual} | Gerado em ${new Date().toLocaleString('pt-BR')}`, pw - PDF_CONFIG.margemDireita, ph - 8, { align: 'right' });
    }

    /**
     * Formata chave para exibição
     */
    formatarChave(chave) {
        return chave
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Formata valor para exibição
     */
    formatarValor(valor, chave) {
        if (valor === null || valor === undefined) return 'Não definido';
        if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
        if (typeof valor === 'number') {
            if (chave.includes('valor') || chave.includes('premio')) {
                return `R$ ${valor.toFixed(2)}`;
            }
            return valor.toString();
        }
        if (typeof valor === 'object') {
            if (Array.isArray(valor)) {
                return valor.length > 3 ? `${valor.length} itens configurados` : valor.join(', ');
            }
            return `${Object.keys(valor).length} configurações`;
        }
        return String(valor);
    }
}

// =============================================================================
// EXPORTAÇÃO GLOBAL
// =============================================================================

/**
 * Função global para exportar PDF de parametrizações
 * @param {string} ligaId - ID da liga
 */
window.exportarParametrizacoesPDF = async function(ligaId) {
    if (!ligaId) {
        const urlParams = new URLSearchParams(window.location.search);
        ligaId = urlParams.get('id');
    }

    if (!ligaId) {
        SuperModal.toast.warning('ID da liga não encontrado');
        return;
    }

    try {
        // Mostrar loading
        const btn = document.getElementById('btnExportarPDF');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons spin">hourglass_empty</span> Gerando PDF...';
        }

        const pdf = new ModuleConfigPDF();
        await pdf.gerarRelatorio(ligaId);

        // Restaurar botão
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons">picture_as_pdf</span> Exportar PDF';
        }

    } catch (error) {
        console.error('[EXPORT-PDF] Erro:', error?.message || error, error?.stack || '');
        SuperModal.toast.error('Erro ao gerar PDF: ' + (error?.message || 'Erro desconhecido'));

        const btn = document.getElementById('btnExportarPDF');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons">picture_as_pdf</span> Exportar PDF';
        }
    }
};

// Exportar classe para uso externo
export { ModuleConfigPDF };
