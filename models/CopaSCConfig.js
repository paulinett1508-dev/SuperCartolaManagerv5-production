/**
 * CopaSCConfig Model
 * Armazena configurações da Copa SC de uma liga
 * Inclui status, sorteio, grupos e calendário de fases
 */

import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const standingSchema = new mongoose.Schema({
    participante_id: { type: Number, required: true },
    pontos: { type: Number, default: 0 },
    jogos: { type: Number, default: 0 },
    vitorias: { type: Number, default: 0 },
    empates: { type: Number, default: 0 },
    derrotas: { type: Number, default: 0 },
    pontos_marcados: { type: Number, default: 0 },
    pontos_sofridos: { type: Number, default: 0 },
    saldo: { type: Number, default: 0 }
}, { _id: false });

const grupoSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    times: [{ type: Number }],
    standings: [standingSchema]
}, { _id: false });

const CopaSCConfigSchema = new mongoose.Schema({
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
    status: {
        type: String,
        enum: [
            'pre_sorteio', 'classificatorio', 'grupos',
            'oitavas', 'quartas', 'semis',
            'terceiro_lugar', 'final', 'encerrado'
        ],
        default: 'pre_sorteio'
    },
    cabecas_de_chave: [{ type: Number }],
    grupos: [grupoSchema],
    calendario: {
        classificatorio: { type: [Number], default: [20, 21, 22, 23] },
        grupos:          { type: [Number], default: [24, 25, 26] },
        oitavas:         { type: [Number], default: [27, 28] },
        quartas:         { type: [Number], default: [29, 30] },
        semis:           { type: [Number], default: [31, 32] },
        terceiro_lugar:  { type: [Number], default: [33, 34] },
        final:           { type: [Number], default: [33, 34] }
    },
    premiacao: {
        campeao:  { type: Number, default: 0 },
        vice:     { type: Number, default: 0 },
        terceiro: { type: Number, default: 0 }
    },
    sorteio_realizado_em: { type: Date, default: null },
    encerrado_em: { type: Date, default: null }
}, {
    timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    collection: 'copascconfigs'
});

CopaSCConfigSchema.index({ liga_id: 1, temporada: 1 }, { unique: true });

const CopaSCConfig = mongoose.model('CopaSCConfig', CopaSCConfigSchema);

export default CopaSCConfig;
