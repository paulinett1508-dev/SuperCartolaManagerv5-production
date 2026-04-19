/**
 * CopaSCMatch Model
 * Armazena partidas individuais da Copa SC
 * Rastreia placar, fases, rodadas Cartola e status
 */

import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const CopaSCMatchSchema = new mongoose.Schema({
    liga_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Liga',
        required: true,
        index: true
    },
    temporada: {
        type: Number,
        required: true,
        default: CURRENT_SEASON,
        index: true
    },
    fase: {
        type: String,
        enum: ['classificatorio', 'grupos', 'oitavas', 'quartas', 'semis', 'terceiro_lugar', 'final'],
        required: true,
        index: true
    },
    rodadas_cartola: [{ type: Number }],
    grupo: { type: String, default: null },
    confronto_num: { type: Number, default: 1 },
    jornada: { type: Number, default: null },
    mandante_id: {
        type: Number,
        required: true
    },
    visitante_id: {
        type: Number,
        required: true
    },
    pontos: {
        mandante:  { type: [Number], default: [] },
        visitante: { type: [Number], default: [] }
    },
    total: {
        mandante:  { type: Number, default: 0 },
        visitante: { type: Number, default: 0 }
    },
    vencedor_id: { type: Number, default: null },
    status: {
        type: String,
        enum: ['agendado', 'em_andamento', 'finalizado'],
        default: 'agendado',
        index: true
    }
}, {
    timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    collection: 'copascmatches'
});

CopaSCMatchSchema.index({ liga_id: 1, temporada: 1, fase: 1 });
CopaSCMatchSchema.index({ liga_id: 1, temporada: 1, status: 1 });

const CopaSCMatch = mongoose.model('CopaSCMatch', CopaSCMatchSchema);

export default CopaSCMatch;
