/**
 * SESSION CONTEXT — Big Cartola IA v2
 *
 * Extrai o contexto imutavel do participante logado (timeId, ligaId, etc.)
 * a partir de req.session.participante. Esse objeto e passado para o
 * chatbot service e injetado automaticamente em cada tool — o LLM NUNCA
 * controla esses valores, garantindo isolamento multi-tenant.
 */

/**
 * Monta o contexto de sessao a partir do request.
 *
 * @param {import('express').Request} req
 * @returns {{
 *   timeId: number,
 *   ligaId: string,
 *   nomeCartola: string|null,
 *   nomeTime: string|null,
 *   temporada: number|null
 * }|null}  null se a sessao nao existe ou esta incompleta
 */
export function extrairSessionContext(req) {
    const p = req?.session?.participante;
    if (!p) return null;

    const timeId = Number(p.timeId || p.time_id);
    const ligaId = p.ligaId ? String(p.ligaId) : null;

    if (!timeId || !ligaId) return null;

    return {
        timeId,
        ligaId,
        nomeCartola: p.nome_cartola || p.nomeCartola || null,
        nomeTime: p.nome_time || p.nomeTime || null,
        temporada: p.temporada ? Number(p.temporada) : null,
    };
}

/**
 * Retorna uma string resumida do contexto para logging.
 * @param {ReturnType<typeof extrairSessionContext>} ctx
 */
export function resumoCtx(ctx) {
    if (!ctx) return 'ctx=null';
    return `ctx{ liga=${ctx.ligaId} time=${ctx.timeId} "${ctx.nomeTime || '?'}" }`;
}
