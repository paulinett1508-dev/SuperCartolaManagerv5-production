/**
 * URL base do ambiente — utility compartilhada
 * Substitui as copias duplicadas em google-oauth.js e globo-oauth.js
 */
export function getBaseURL() {
    let url;

    if (process.env.BASE_URL) {
        url = process.env.BASE_URL;
    } else if (process.env.NODE_ENV === "production") {
        url = "https://supercartolamanager.com.br";
    } else if (process.env.NODE_ENV === "staging") {
        url = "https://staging.supercartolamanager.com.br";
    } else {
        url = "http://localhost:3000";
    }

    // Normalizar trailing slash
    return url.replace(/\/+$/, '');
}
