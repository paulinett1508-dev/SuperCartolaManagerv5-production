/**
 * MODEL: AcertoFinanceiro
 *
 * Registra pagamentos e recebimentos entre participantes e admin
 * durante a temporada (em tempo real).
 *
 * Diferente do ExtratoFinanceiroCache que consolida pontuações,
 * este model registra transações financeiras REAIS (PIX, transferência, etc).
 *
 * @version 2.0.0 — G2/G3: ligaId→liga_id (String), timeId (String)→time_id (Number)
 */

import mongoose from "mongoose";
import { CURRENT_SEASON } from "../config/seasons.js";

const { Schema } = mongoose;

const AcertoFinanceiroSchema = new Schema(
    {
        liga_id: {
            type: String,
            required: true,
            index: true,
        },
        time_id: {
            type: Number,
            required: true,
            index: true,
        },
        nomeTime: {
            type: String,
            required: true,
        },
        // ✅ TEMPORADA - Segregação de dados por ano
        temporada: {
            type: Number,
            required: true,
            default: CURRENT_SEASON,
            index: true,
        },
        tipo: {
            type: String,
            required: true,
            enum: ["pagamento", "recebimento"],
            // pagamento = participante PAGOU (reduz crédito ou quita dívida)
            // recebimento = participante RECEBEU (aumenta crédito)
        },
        valor: {
            type: Number,
            required: true,
            min: 0.01,
        },
        descricao: {
            type: String,
            required: true,
            default: "Acerto financeiro",
        },
        metodoPagamento: {
            type: String,
            enum: ["pix", "transferencia", "dinheiro", "outro"],
            default: "pix",
        },
        comprovante: {
            type: String,
            default: null,
            // URL ou base64 de comprovante (opcional)
        },
        registradoPor: {
            type: String,
            required: true,
            // ID ou nome do admin que registrou
        },
        observacoes: {
            type: String,
            default: null,
        },
        dataAcerto: {
            type: Date,
            required: true,
            default: Date.now,
            // Data efetiva do acerto (pode ser diferente da data de registro)
        },
        ativo: {
            type: Boolean,
            default: true,
            // Para soft delete (manter histórico)
        },
    },
    {
        timestamps: true,
        // createdAt = quando foi registrado no sistema
        // dataAcerto = quando o acerto realmente aconteceu
        collection: 'acertofinanceiros',
    },
);

// Índices compostos para buscas frequentes
AcertoFinanceiroSchema.index({ liga_id: 1, time_id: 1, temporada: 1 });
AcertoFinanceiroSchema.index({ liga_id: 1, temporada: 1, dataAcerto: -1 });

// ✅ v2.0.0: Virtual impactoSaldo REMOVIDO por contradizer calcularSaldoAcertos.
// A lógica real é: PAGAMENTO aumenta saldo (quita dívida), RECEBIMENTO diminui saldo.
// O virtual dizia o contrário e não era usado em nenhum lugar do código.

// Método estático para buscar acertos de um time
AcertoFinanceiroSchema.statics.buscarPorTime = async function (liga_id, time_id, temporada = CURRENT_SEASON) {
    return this.find({
        liga_id,
        time_id: Number(time_id),
        temporada,
        ativo: true,
    }).sort({ dataAcerto: -1 });
};

// Método estático para calcular saldo de acertos de um time
// ✅ v1.1.0: Correção da lógica de saldo
AcertoFinanceiroSchema.statics.calcularSaldoAcertos = async function (liga_id, time_id, temporada = CURRENT_SEASON) {
    const acertos = await this.find({
        liga_id,
        time_id: Number(time_id),
        temporada,
        ativo: true,
    });

    let totalPago = 0;
    let totalRecebido = 0;

    acertos.forEach(acerto => {
        if (acerto.tipo === "pagamento") {
            totalPago += acerto.valor;
        } else {
            totalRecebido += acerto.valor;
        }
    });

    // ✅ v1.1.0: CORREÇÃO - Saldo = pago - recebido
    // PAGAMENTO = participante PAGOU à liga (quita dívida, AUMENTA saldo)
    // RECEBIMENTO = participante RECEBEU da liga (usa crédito, DIMINUI saldo)
    //
    // Exemplo 1 - Devedor quitando:
    //   - saldoTemporada = -100 (deve R$100)
    //   - Participante PAGA R$100
    //   - saldoAcertos = 100 - 0 = +100
    //   - saldoFinal = -100 + 100 = 0 (quitado!)
    //
    // Exemplo 2 - Credor recebendo:
    //   - saldoTemporada = +100 (tem R$100 a receber)
    //   - Participante RECEBE R$100 da liga
    //   - saldoAcertos = 0 - 100 = -100
    //   - saldoFinal = +100 + (-100) = 0 (recebeu tudo!)
    return {
        totalPago: parseFloat(totalPago.toFixed(2)),
        totalRecebido: parseFloat(totalRecebido.toFixed(2)),
        saldoAcertos: parseFloat((totalPago - totalRecebido).toFixed(2)),
        quantidadeAcertos: acertos.length,
    };
};

// Método estático para buscar todos os acertos de uma liga
AcertoFinanceiroSchema.statics.buscarPorLiga = async function (liga_id, temporada = CURRENT_SEASON) {
    return this.find({
        liga_id,
        temporada,
        ativo: true,
    }).sort({ dataAcerto: -1 });
};

const AcertoFinanceiro = mongoose.model(
    "AcertoFinanceiro",
    AcertoFinanceiroSchema,
);

export default AcertoFinanceiro;
