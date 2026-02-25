/**
 * MODEL: FluxoFinanceiroCampos
 *
 * Armazena os campos manuais (campo1-4) do extrato financeiro por time/temporada.
 *
 * @version 2.0.0 — G2/G3: ligaId→liga_id (String), timeId (String)→time_id (Number)
 */

import mongoose from "mongoose";
import { CURRENT_SEASON } from "../config/seasons.js";

const { Schema } = mongoose;

const FluxoFinanceiroCamposSchema = new Schema(
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
        // ✅ TEMPORADA - Segregação de dados por ano
        temporada: {
            type: Number,
            required: true,
            default: CURRENT_SEASON,
            index: true,
        },
        campos: [
            {
                nome: {
                    type: String,
                    required: true,
                    default: function () {
                        const index = this.parent().campos.indexOf(this) + 1;
                        return `Campo ${index}`;
                    },
                },
                valor: {
                    type: Number,
                    required: true,
                    default: 0,
                },
            },
        ],
        // ✅ v2.0.0: Removido campo updatedAt manual (duplicava timestamps: true do Mongoose)
    },
    {
        timestamps: {
            createdAt: 'criado_em',
            updatedAt: 'atualizado_em',
        },
        collection: 'fluxofinanceirocampos',
    },
);

// Índice composto para busca rápida (incluindo temporada)
// Corresponde ao índice criado pela migração G2/G3
FluxoFinanceiroCamposSchema.index({ liga_id: 1, time_id: 1, temporada: 1 }, { unique: true });

// Garantir que sempre tenha 4 campos
FluxoFinanceiroCamposSchema.pre("save", function (next) {
    if (!this.campos || this.campos.length === 0) {
        this.campos = [
            { nome: "Campo 1", valor: 0 },
            { nome: "Campo 2", valor: 0 },
            { nome: "Campo 3", valor: 0 },
            { nome: "Campo 4", valor: 0 },
        ];
    }
    next();
});

const FluxoFinanceiroCampos = mongoose.model(
    "FluxoFinanceiroCampos",
    FluxoFinanceiroCamposSchema,
);

export default FluxoFinanceiroCampos;
