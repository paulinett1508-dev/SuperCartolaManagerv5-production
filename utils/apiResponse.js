/**
 * API Response Helper - Super Cartola Manager
 *
 * Padroniza TODAS as respostas da API com formato consistente.
 * Elimina inconsistencias (erro/error/msg) e garante campos uniformes.
 *
 * Formato de sucesso: { success: true, data: {...}, [message: "..."] }
 * Formato de erro:    { success: false, error: "...", [code: "..."] }
 *
 * Uso:
 *   import { apiSuccess, apiError, apiServerError } from '../utils/apiResponse.js';
 *
 *   // Sucesso
 *   return apiSuccess(res, { ligas: [...] });
 *   return apiSuccess(res, { liga }, 201);
 *   return apiSuccess(res, { total: 5 }, 200, 'Operacao concluida');
 *
 *   // Erro de validacao/cliente
 *   return apiError(res, 'Liga nao encontrada', 404);
 *   return apiError(res, 'Dados invalidos', 400, 'VALIDATION_ERROR');
 *
 *   // Erro de servidor (catch block)
 *   return apiServerError(res, error, 'EXTRATO');
 *
 * @version 1.0.0
 * @since 2026-02-15
 */

/**
 * Resposta de sucesso padronizada
 * @param {Response} res - Express response
 * @param {Object} data - Dados a retornar (spread no body)
 * @param {number} [status=200] - HTTP status code
 * @param {string} [message] - Mensagem opcional
 */
export function apiSuccess(res, data = {}, status = 200, message = null) {
  const body = { success: true, ...data };
  if (message) body.message = message;
  return res.status(status).json(body);
}

/**
 * Resposta de erro de cliente (4xx) padronizada
 * @param {Response} res - Express response
 * @param {string} message - Mensagem de erro
 * @param {number} [status=400] - HTTP status code
 * @param {string} [code] - Codigo de erro (ex: 'VALIDATION_ERROR')
 */
export function apiError(res, message, status = 400, code = null) {
  const body = { success: false, error: message };
  if (code) body.code = code;
  return res.status(status).json(body);
}

/**
 * Resposta de erro de servidor (500) padronizada
 * Loga o erro completo e retorna mensagem generica ao cliente
 * @param {Response} res - Express response
 * @param {Error} error - Objeto de erro capturado no catch
 * @param {string} [context=''] - Contexto/modulo para log (ex: 'EXTRATO', 'QUITACAO')
 */
export function apiServerError(res, error, context = '') {
  const prefix = context ? `[${context}]` : '[API]';
  console.error(`${prefix} Erro:`, error.message || error);

  return res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR'
  });
}

/**
 * Resposta de nao autorizado (401) padronizada
 * @param {Response} res - Express response
 * @param {string} [message='Nao autorizado'] - Mensagem
 */
export function apiUnauthorized(res, message = 'Nao autorizado') {
  return res.status(401).json({
    success: false,
    error: message,
    code: 'UNAUTHORIZED'
  });
}

/**
 * Resposta de conflito/idempotencia (409) padronizada
 * @param {Response} res - Express response
 * @param {string} message - Mensagem de conflito
 * @param {Object} [data] - Dados adicionais (ex: registro existente)
 */
export function apiConflict(res, message, data = null) {
  const body = { success: false, error: message, code: 'CONFLICT' };
  if (data) body.data = data;
  return res.status(409).json(body);
}
