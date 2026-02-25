/**
 * Serviço compartilhado para operações financeiras de acerto
 *
 * Centraliza a lógica duplicada entre:
 *   - routes/acertos-financeiros-routes.js
 *   - routes/tesouraria-routes.js
 *
 * Cada rota mantém sua lógica específica (saldo, notificações, inscrição).
 * Este serviço encapsula apenas o código literalmente idêntico.
 */

import mongoose from 'mongoose';
import AcertoFinanceiro from '../models/AcertoFinanceiro.js';

/**
 * Persiste acerto principal + troco (opcional) em transação atômica.
 * Previne race condition onde acerto salva mas troco falha (ou vice-versa).
 *
 * @param {AcertoFinanceiro} novoAcerto - documento já construído (não salvo)
 * @param {AcertoFinanceiro|null} acertoTroco - documento de troco (opcional)
 */
export async function salvarAcertoTransacional(novoAcerto, acertoTroco = null) {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await novoAcerto.save({ session });
            if (acertoTroco) {
                await acertoTroco.save({ session });
            }
        });
    } finally {
        await session.endSession();
    }
}

/**
 * Desativa um acerto (soft delete — preserva histórico para auditoria).
 *
 * @param {string} id - ObjectId do acerto
 * @returns {AcertoFinanceiro|null} acerto desativado, ou null se não encontrado
 */
export async function desativarAcerto(id) {
    const acerto = await AcertoFinanceiro.findById(id);
    if (!acerto) return null;
    acerto.ativo = false;
    await acerto.save();
    return acerto;
}
