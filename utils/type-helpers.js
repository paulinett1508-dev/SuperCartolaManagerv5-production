/**
 * TYPE HELPERS - Conversão padronizada de tipos para queries MongoDB
 *
 * Resolve inconsistência de tipos entre models:
 * - ExtratoFinanceiroCache: liga_id=Mixed, time_id=Number
 * - AcertoFinanceiro: liga_id=String, time_id=Number  (G2/G3)
 * - AjusteFinanceiro: liga_id=ObjectId, time_id=Number
 * - FluxoFinanceiroCampos: liga_id=String, time_id=Number  (G2/G3)
 * - InscricaoTemporada: liga_id=ObjectId, time_id=Number
 *
 * @version 1.0.0
 */

import mongoose from "mongoose";

/**
 * Converte liga_id para String (formato universal)
 * @param {string|ObjectId} id
 * @returns {string}
 */
export const toLigaId = (id) => String(id);

/**
 * Converte time_id para Number
 * @param {string|number} id
 * @returns {number}
 */
export const toTimeId = (id) => Number(id);

/**
 * Converte temporada para Number
 * @param {string|number} t
 * @returns {number}
 */
export const toTemporada = (t) => Number(t);

/**
 * Tenta converter liga_id para ObjectId, com fallback para String
 * Útil para models que usam ObjectId (AjusteFinanceiro, InscricaoTemporada)
 *
 * @param {string|ObjectId} id
 * @returns {ObjectId|string}
 */
export function toLigaObjectId(id) {
    try {
        return new mongoose.Types.ObjectId(id);
    } catch {
        return String(id);
    }
}

/**
 * Cria query $or para liga_id que funciona com String E ObjectId
 * Resolve o problema de dados mistos no MongoDB
 *
 * @param {string} ligaId
 * @returns {object} Query MongoDB para liga_id
 */
export function ligaIdQuery(ligaId) {
    try {
        const oid = new mongoose.Types.ObjectId(ligaId);
        return { $or: [{ liga_id: oid }, { liga_id: String(ligaId) }] };
    } catch {
        return { liga_id: String(ligaId) };
    }
}

/**
 * Trunca pontos para 2 casas decimais SEM arredondar.
 * REGRA ABSOLUTA: pontos de participantes NUNCA devem ser arredondados.
 * Ex: 93.78569 → 93.78 (nunca 93.79)
 * Ex: 105.456  → 105.45 (nunca 105.46)
 *
 * Use esta função em QUALQUER operação backend que envolva pontos de participantes.
 * NUNCA use toFixed(), Math.round() ou parseFloat(x.toFixed(N)) em pontos.
 *
 * @param {number|string} valor - Pontuação a truncar
 * @returns {number} Valor truncado com 2 casas decimais (tipo Number)
 */
export function truncarPontosNum(valor) {
    const num = parseFloat(valor) || 0;
    return Math.trunc(num * 100) / 100;
}

export default {
    toLigaId,
    toTimeId,
    toTemporada,
    toLigaObjectId,
    ligaIdQuery,
    truncarPontosNum,
};
