/**
 * TIRO CERTO CACHE - Model para persistência do estado da disputa Survival
 *
 * Armazena o estado de cada edição do Tiro Certo por liga/temporada.
 * Cada documento representa uma edição completa com todos os participantes,
 * suas escolhas e status (vivo, eliminado, campeão).
 *
 * Mecânica: Escolher 1 time que vai VENCER no Brasileirão.
 * Vitória = avança. Empate/Derrota = eliminado.
 *
 * @version 1.0.0
 */
import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const EscolhaSchema = new mongoose.Schema({
    rodada: { type: Number, required: true },
    timeEscolhidoId: { type: Number, required: true },
    timeEscolhidoNome: { type: String },
    adversarioId: { type: Number },
    adversarioNome: { type: String },
    resultado: {
        type: String,
        enum: ['pendente', 'vitoria', 'empate', 'derrota'],
        default: 'pendente',
    },
    placarMandante: { type: Number, default: null },
    placarVisitante: { type: Number, default: null },
    mandanteId: { type: Number },
    dataEscolha: { type: Date, default: Date.now },
    dataResultado: { type: Date, default: null },
}, { _id: false });

const ParticipanteTiroCertoSchema = new mongoose.Schema({
    timeId: { type: Number, required: true },
    nomeTime: { type: String },
    nomeCartoleiro: { type: String },
    escudoId: { type: Number },
    status: {
        type: String,
        enum: ['vivo', 'eliminado', 'campeao'],
        default: 'vivo',
    },
    escolhas: [EscolhaSchema],
    timesUsados: [{ type: Number }],
    rodadaEliminacao: { type: Number, default: null },
    rodadasSobrevividas: { type: Number, default: 0 },
    motivoEliminacao: {
        type: String,
        enum: [null, 'derrota', 'empate', 'wo'],
        default: null,
    },
}, { _id: false });

const TiroCertoCacheSchema = new mongoose.Schema({
    liga_id: { type: String, required: true, index: true },
    edicao: { type: Number, required: true, default: 1 },
    temporada: {
        type: Number,
        required: true,
        default: CURRENT_SEASON,
        index: true,
    },

    // Configuracao da edicao
    nome: { type: String, default: '1a Edicao' },
    rodadaInicial: { type: Number, required: true },
    rodadaFinal: { type: Number },

    // Estado atual
    status: {
        type: String,
        enum: ['pendente', 'em_andamento', 'finalizada'],
        default: 'pendente',
    },
    rodadaAtual: { type: Number, default: null },

    // Participantes
    participantes: [ParticipanteTiroCertoSchema],

    // Contadores rapidos
    vivosCount: { type: Number, default: 0 },
    eliminadosCount: { type: Number, default: 0 },

    // Premiacao (configuravel por liga)
    premiacao: {
        campeao: { type: Number, default: 100 },
        bonusInvicto: { type: Number, default: 50 },
    },

    // Regras desta edicao
    permitirRepeticaoTime: { type: Boolean, default: false },
    woAutomatico: { type: Boolean, default: true },

    ultima_atualizacao: { type: Date, default: Date.now },
}, {
    timestamps: true,
    strict: false,
});

// Composite index: liga + edicao + temporada (UNIQUE)
TiroCertoCacheSchema.index(
    { liga_id: 1, edicao: 1, temporada: 1 },
    { unique: true }
);

const TiroCertoCache = mongoose.models.TiroCertoCache ||
    mongoose.model('TiroCertoCache', TiroCertoCacheSchema, 'tirocertocaches');

export default TiroCertoCache;
