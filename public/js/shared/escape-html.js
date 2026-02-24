/**
 * escape-html.js - Sanitização global contra XSS
 *
 * SEC-FIX: Previne Stored XSS ao escapar HTML em strings
 * renderizadas via innerHTML/insertAdjacentHTML.
 *
 * Uso: escapeHtml(valor) ou window.escapeHtml(valor)
 *
 * Deve ser carregado ANTES de qualquer script que renderize
 * dados de usuário (nome_time, nome_cartoleiro, etc.)
 */
(function () {
    'use strict';

    // Mapa de caracteres perigosos para entidades HTML
    const ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    const ESCAPE_REGEX = /[&<>"']/g;

    /**
     * Escapa caracteres HTML perigosos em uma string.
     * Retorna string vazia se valor for null/undefined.
     *
     * @param {*} str - Valor a escapar
     * @returns {string} String segura para innerHTML
     */
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(ESCAPE_REGEX, function (ch) {
            return ESCAPE_MAP[ch];
        });
    }

    // Expor globalmente
    window.escapeHtml = escapeHtml;
})();
