// =====================================================================
// sw-cache-name.js — Fonte canônica do nome do cache do Service Worker
// =====================================================================
// ATENÇÃO: Ao atualizar o CACHE_NAME no service-worker.js, atualizar
//          este arquivo também. É a única outra fonte que precisa saber
//          o nome atual do cache para limpar caches obsoletos.
//
// Usado por:
//   - routes/appVersionRoutes.js (expõe via /api/app/check-version)
//   - public/js/app/app-version.js (lê via resposta do servidor)
//   - public/participante/service-worker.js (hardcode inevitável no SW)
// =====================================================================

export const SW_CACHE_NAME = 'super-cartola-v30-20260306';
