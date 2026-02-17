/**
 * Helper de Resposta Padronizada - Super Cartola Manager
 *
 * Garante formato consistente em todas as APIs:
 * { success, data, error, message }
 *
 * Uso:
 *   import { ok, fail, notFound, unauthorized } from '../utils/apiResponse.js';
 *   return ok(res, data, 'Operação concluída');
 *   return fail(res, 'Algo deu errado', 400);
 *
 * @version 1.0.0
 */

/**
 * Resposta de sucesso (2xx)
 */
export function ok(res, data = null, message = 'OK', statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        data,
        message
    });
}

/**
 * Resposta de erro do cliente (4xx)
 */
export function fail(res, message = 'Erro na requisição', statusCode = 400, data = null) {
    return res.status(statusCode).json({
        success: false,
        error: message,
        data
    });
}

/**
 * 404 Not Found
 */
export function notFound(res, message = 'Recurso não encontrado') {
    return res.status(404).json({
        success: false,
        error: message
    });
}

/**
 * 401 Unauthorized
 */
export function unauthorized(res, message = 'Não autorizado') {
    return res.status(401).json({
        success: false,
        error: message
    });
}

/**
 * 403 Forbidden
 */
export function forbidden(res, message = 'Acesso negado') {
    return res.status(403).json({
        success: false,
        error: message
    });
}

/**
 * 500 Internal Server Error
 */
export function serverError(res, message = 'Erro interno do servidor', err = null) {
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(500).json({
        success: false,
        error: message,
        ...((!isProd && err) && { details: err.message })
    });
}

export default { ok, fail, notFound, unauthorized, forbidden, serverError };
