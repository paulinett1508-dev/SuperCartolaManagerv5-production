/**
 * Middleware de Paginacao Universal - Super Cartola Manager
 *
 * Padroniza paginacao em TODOS os endpoints de listagem.
 *
 * Uso como helper (sem middleware):
 *   import { parsePagination, paginatedResponse } from '../middleware/pagination.js';
 *
 *   const pag = parsePagination(req);
 *   const items = await Model.find(query).skip(pag.skip).limit(pag.limit).lean();
 *   const total = await Model.countDocuments(query);
 *   return apiSuccess(res, paginatedResponse(items, total, pag));
 *
 * Uso como middleware Express:
 *   import { paginationMiddleware } from '../middleware/pagination.js';
 *   router.get('/ligas', paginationMiddleware(), controller.listar);
 *   // req.pagination = { page, limit, skip, sort, order }
 *
 * Query params aceitos:
 *   ?page=1&limit=20&sort=nome&order=asc
 *
 * @version 1.0.0
 * @since 2026-02-15
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

/**
 * Parser de paginacao standalone (sem middleware)
 * @param {Request} req - Express request
 * @param {Object} [defaults] - Defaults customizados
 * @param {number} [defaults.limit=20] - Limite padrao
 * @param {string} [defaults.sort] - Campo de ordenacao padrao
 * @param {string} [defaults.order='desc'] - Direcao padrao
 * @returns {{ page: number, limit: number, skip: number, sort: string|null, order: 'asc'|'desc' }}
 */
export function parsePagination(req, defaults = {}) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(MIN_LIMIT, parseInt(req.query.limit) || defaults.limit || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;
  const sort = req.query.sort || defaults.sort || null;
  const order = (req.query.order || defaults.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  return { page, limit, skip, sort, order };
}

/**
 * Formata resposta paginada com metadados
 * @param {Array} data - Array de itens da pagina atual
 * @param {number} total - Total de itens (sem paginacao)
 * @param {{ page: number, limit: number }} pagination - Objeto de paginacao
 * @param {string} [dataKey='data'] - Nome da chave do array de dados
 * @returns {Object} Objeto formatado com dados + metadados de paginacao
 */
export function paginatedResponse(data, total, pagination, dataKey = 'data') {
  const pages = Math.ceil(total / pagination.limit);

  return {
    [dataKey]: data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages,
      hasNext: pagination.page < pages,
      hasPrev: pagination.page > 1
    }
  };
}

/**
 * Middleware Express que injeta req.pagination
 * @param {Object} [defaults] - Defaults customizados (limit, sort, order)
 * @returns {Function} Express middleware
 */
export function paginationMiddleware(defaults = {}) {
  return (req, _res, next) => {
    req.pagination = parsePagination(req, defaults);
    next();
  };
}

/**
 * Helper para construir objeto de sort do Mongoose
 * @param {{ sort: string|null, order: 'asc'|'desc' }} pagination
 * @returns {Object|null} Objeto de sort do Mongoose ({ campo: 1|-1 })
 */
export function buildMongoSort(pagination) {
  if (!pagination.sort) return null;
  return { [pagination.sort]: pagination.order === 'asc' ? 1 : -1 };
}
