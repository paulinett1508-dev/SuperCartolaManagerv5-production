/**
 * RESTA UM CACHE - Model para persistência do estado da disputa
 *
 * Armazena o estado de cada edição do Resta Um por liga/temporada.
 * Cada documento representa uma edição completa com todos os participantes
 * e seu status atual (vivo, eliminado, campeão).
 *
 * @version 1.0.0
 */
import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const ParticipanteRestaUmSchema = new mongoose.Schema({
    timeId: { type: Number, required: true },
    nomeTime: { type: String },
    nomeCartoleiro: { type: String },
    escudoId: { type: Number },
    status: {
        type: String,
        enum: ['vivo', 'zona_perigo', 'eliminado', 'campeao'],
        default: 'vivo',
    },
    pontosRodada: { type: Number, default: null },
    pontosAcumulados: { type: Number, default: 0 },
    rodadaEliminacao: { type: Number, default: null },
    rodadasSobrevividas: { type: Number, default: 0 },
    vezesNaZona: { type: Number, default: 0 },
}, { _id: false });

const EliminacaoSchema = new mongoose.Schema({
    rodada: { type: Number, required: true },
    timeId: { type: Number, required: true },
    nomeTime: { type: String },
    pontosRodada: { type: Number },
    criterioDesempate: { type: String, default: null },
    dataEliminacao: { type: Date, default: Date.now },
}, { _id: false });

const RestaUmCacheSchema = new mongoose.Schema({
    liga_id: { type: String, required: true, index: true },
    edicao: { type: Number, required: true, default: 1 },
    temporada: {
        type: Number,
        required: true,
        default: CURRENT_SEASON,
        index: true,
    },

    // Configuração da edição
    nome: { type: String, default: '1a Edição' },
    rodadaInicial: { type: Number, required: true },
    rodadaFinal: { type: Number },
    eliminadosPorRodada: { type: Number, default: 1 },
    protecaoPrimeiraRodada: { type: Boolean, default: false },

    // Estado atual
    status: {
        type: String,
        enum: ['pendente', 'em_andamento', 'finalizada'],
        default: 'pendente',
    },
    rodadaAtual: { type: Number, default: null },

    // Participantes e histórico
    participantes: [ParticipanteRestaUmSchema],
    historicoEliminacoes: [EliminacaoSchema],

    // Premiação (configurável por liga)
    premiacao: {
        campeao: { type: Number, default: 100 },
        vice: { type: Number, default: 50 },
        viceHabilitado: { type: Boolean, default: true },
        terceiro: { type: Number, default: 25 },
        terceiroHabilitado: { type: Boolean, default: true },
    },
    bonusSobrevivencia: {
        habilitado: { type: Boolean, default: true },
        valorBase: { type: Number, default: 2 },
        incremento: { type: Number, default: 0.5 },
    },

    // Fluxo financeiro automático
    fluxoFinanceiroHabilitado: { type: Boolean, default: false },
    taxaEliminacao: { type: Number, default: 0 }, // pré-calculado na criação

    ultima_atualizacao: { type: Date, default: Date.now },
}, {
    timestamps: true,
    strict: false,
});

// Composite index: liga + edição + temporada (UNIQUE)
RestaUmCacheSchema.index(
    { liga_id: 1, edicao: 1, temporada: 1 },
    { unique: true }
);

const RestaUmCache = mongoose.models.RestaUmCache ||
    mongoose.model('RestaUmCache', RestaUmCacheSchema, 'restaumcaches');

export default RestaUmCache;
