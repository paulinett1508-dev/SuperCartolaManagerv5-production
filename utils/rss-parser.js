// utils/rss-parser.js
// v1.0 - Utilitários compartilhados para parse de feeds RSS (Google News)
// Extraído de copa-2026-noticias-routes.js e noticias-time-routes.js

/**
 * Extrai texto limpo de um possível CDATA ou HTML
 */
export function limparTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .trim();
}

/**
 * Extrai conteúdo de uma tag XML (suporta CDATA)
 */
export function extrairTag(xml, tagName) {
    const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'i');
    const cdataMatch = xml.match(cdataRegex);
    if (cdataMatch) return cdataMatch[1];

    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : '';
}

/**
 * Calcula tempo relativo (ex: "há 2h", "há 30min")
 */
export function calcularTempoRelativo(data) {
    const agora = new Date();
    const diff = agora - data;
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(diff / 3600000);
    const dias = Math.floor(diff / 86400000);

    if (minutos < 1) return 'agora';
    if (minutos < 60) return `há ${minutos}min`;
    if (horas < 24) return `há ${horas}h`;
    if (dias === 1) return 'ontem';
    if (dias < 7) return `há ${dias} dias`;
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/**
 * Parse RSS XML e retorna array de notícias
 * @param {string} xml - Conteúdo XML do feed RSS
 * @returns {Array<{titulo, link, fonte, descricao, publicadoEm, tempoRelativo, imagem}>}
 */
export function parseRSSItems(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1];

        const titulo = limparTexto(extrairTag(itemXml, 'title'));
        const link = limparTexto(extrairTag(itemXml, 'link'));
        const pubDate = limparTexto(extrairTag(itemXml, 'pubDate'));
        const fonte = limparTexto(extrairTag(itemXml, 'source'));
        const descricao = limparTexto(extrairTag(itemXml, 'description'));
        const imagem = null; // Google News RSS não fornece thumbnails nos items

        if (titulo && link) {
            items.push({
                titulo,
                link,
                fonte,
                descricao: descricao.substring(0, 200),
                publicadoEm: pubDate ? new Date(pubDate).toISOString() : null,
                tempoRelativo: pubDate ? calcularTempoRelativo(new Date(pubDate)) : null,
                imagem
            });
        }
    }

    return items;
}
