/**
 * Middleware de Paginação Universal - Super Cartola Manager
 *
 * Adiciona req.pagination com { page, limit, skip } para uso nos controllers.
 *
 * Uso nas rotas:
 *   router.get('/items', paginate(), controller.list);
 *
 * Uso no controller:
 *   const { page, limit, skip } = req.pagination;
 *   const items = await Model.find().skip(skip).limit(limit);
 *   const total = await Model.countDocuments();
 *   res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
 *
 * Query params aceitos:
 *   ?page=1&limit=20
 *
 * @version 1.0.0
 */

/**
 * @param {Object} options
 * @param {number} [options.defaultLimit=20] - Limite padrão por página
 * @param {number} [options.maxLimit=100] - Limite máximo permitido
 */
export function paginate({ defaultLimit = 20, maxLimit = 100 } = {}) {
    return (req, res, next) => {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const rawLimit = parseInt(req.query.limit) || defaultLimit;
        const limit = Math.min(Math.max(1, rawLimit), maxLimit);
        const skip = (page - 1) * limit;

        req.pagination = { page, limit, skip };
        next();
    };
}

export default paginate;
