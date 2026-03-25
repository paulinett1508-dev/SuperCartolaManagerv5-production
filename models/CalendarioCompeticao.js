// =====================================================================
// CALENDARIO COMPETICAO MODEL - v1.0
// Schema genérico para armazenar calendário de qualquer competição
// (Copa do Brasil, Copa do Nordeste, Libertadores, Copa do Mundo)
// Segue padrão do CalendarioBrasileirao.js
// =====================================================================

import mongoose from 'mongoose';

// Slugs válidos de competição
const COMPETICOES_VALIDAS = [
    'copa-nordeste',
    'copa-brasil',
    'libertadores',
    'copa-mundo',
];

// Schema de uma partida individual (idêntico ao CalendarioBrasileirao)
const partidaCompeticaoSchema = new mongoose.Schema({
    id_externo: { type: String, required: false },
    fase: { type: String, required: false },       // 'grupos', 'oitavas', 'quartas', 'semis', 'final', '5a-fase', etc.
    grupo: { type: String, required: false },       // 'A', 'B', 'C', 'D' (para fase de grupos)
    rodada: { type: Number, required: false },      // Rodada dentro da fase (1, 2, 3...)
    data: { type: String, required: true },         // Formato: "2026-04-10"
    horario: { type: String, required: true },      // Formato: "16:00" (Brasília)
    mandante: { type: String, required: true },
    visitante: { type: String, required: true },
    mandante_id: { type: Number, required: false }, // ID Cartola (se aplicável)
    visitante_id: { type: Number, required: false },
    placar_mandante: { type: Number, default: null },
    placar_visitante: { type: Number, default: null },
    status: {
        type: String,
        enum: ['agendado', 'ao_vivo', 'encerrado', 'adiado', 'cancelado', 'a_definir'],
        default: 'agendado'
    },
    estadio: { type: String, required: false },
    cidade: { type: String, required: false },
    mando: { type: String, enum: ['ida', 'volta', 'unico', null], default: null },
}, { _id: false });

// Schema de classificação de um grupo
const classificacaoTimeSchema = new mongoose.Schema({
    time: { type: String, required: true },
    pontos: { type: Number, default: 0 },
    jogos: { type: Number, default: 0 },
    vitorias: { type: Number, default: 0 },
    empates: { type: Number, default: 0 },
    derrotas: { type: Number, default: 0 },
    gols_pro: { type: Number, default: 0 },
    gols_contra: { type: Number, default: 0 },
    saldo: { type: Number, default: 0 },
}, { _id: false });

const grupoSchema = new mongoose.Schema({
    nome: { type: String, required: true },         // 'A', 'B', 'C', 'D'
    classificacao: [classificacaoTimeSchema],
}, { _id: false });

// Schema principal — uma entrada por competição + temporada
const calendarioCompeticaoSchema = new mongoose.Schema({
    competicao: {
        type: String,
        required: true,
        enum: COMPETICOES_VALIDAS
    },
    temporada: {
        type: Number,
        required: true
    },
    formato: {
        type: String,
        enum: ['grupos', 'mata-mata', 'misto'],
        default: 'misto'
    },
    grupos: [grupoSchema],
    partidas: [partidaCompeticaoSchema],
    ultima_atualizacao: {
        type: Date,
        default: Date.now
    },
    fonte: {
        type: String,
        enum: ['soccerdata', 'globo', 'manual', 'misto'],
        default: 'globo'
    },
    stats: {
        total_jogos: { type: Number, default: 0 },
        jogos_realizados: { type: Number, default: 0 },
        jogos_restantes: { type: Number, default: 0 },
        fase_atual: { type: String, default: 'grupos' },
    }
}, {
    timestamps: true
});

// Índice único: uma entrada por competição + temporada
calendarioCompeticaoSchema.index({ competicao: 1, temporada: 1 }, { unique: true });

// =====================================================================
// MÉTODOS DE INSTÂNCIA
// =====================================================================

/**
 * Retorna partidas de uma fase específica
 */
calendarioCompeticaoSchema.methods.obterFase = function(fase) {
    return this.partidas
        .filter(p => p.fase === fase)
        .sort((a, b) => {
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return a.horario.localeCompare(b.horario);
        });
};

/**
 * Retorna partidas de um grupo específico
 */
calendarioCompeticaoSchema.methods.obterJogosGrupo = function(grupo) {
    return this.partidas
        .filter(p => p.grupo === grupo)
        .sort((a, b) => {
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return a.horario.localeCompare(b.horario);
        });
};

/**
 * Verifica se há jogos ao vivo AGORA
 */
calendarioCompeticaoSchema.methods.temJogosAoVivo = function() {
    const temStatusAoVivo = this.partidas.some(p => p.status === 'ao_vivo');
    if (temStatusAoVivo) return true;

    // Fallback: heurística de horário
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    const minutoAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }));
    const minutosAgora = horaAtual * 60 + minutoAtual;

    return this.partidas.some(partida => {
        if (partida.data !== hoje || partida.status !== 'agendado') return false;
        const [horaJogo, minutoJogo] = (partida.horario || '0:0').split(':').map(Number);
        const diff = minutosAgora - (horaJogo * 60 + minutoJogo);
        return diff >= 0 && diff <= 150;
    });
};

/**
 * Retorna próximo jogo (após agora)
 */
calendarioCompeticaoSchema.methods.obterProximoJogo = function() {
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    const minutoAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }));
    const minutosAgora = horaAtual * 60 + minutoAtual;

    const jogosFuturos = this.partidas
        .filter(partida => {
            if (partida.status === 'encerrado' || partida.status === 'cancelado') return false;
            if (partida.data === hoje) {
                const [h, m] = (partida.horario || '0:0').split(':').map(Number);
                return (h * 60 + m) > minutosAgora;
            }
            return partida.data > hoje;
        })
        .sort((a, b) => {
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return a.horario.localeCompare(b.horario);
        });

    return jogosFuturos[0] || null;
};

/**
 * Calcula classificação de todos os grupos a partir dos resultados
 */
calendarioCompeticaoSchema.methods.calcularClassificacao = function() {
    const gruposNomes = [...new Set(this.partidas.filter(p => p.grupo).map(p => p.grupo))].sort();

    this.grupos = gruposNomes.map(nomeGrupo => {
        const jogosGrupo = this.partidas.filter(p =>
            p.grupo === nomeGrupo && p.status === 'encerrado' &&
            p.placar_mandante !== null && p.placar_visitante !== null
        );

        // Coletar todos os times do grupo
        const timesSet = new Set();
        this.partidas.filter(p => p.grupo === nomeGrupo).forEach(p => {
            timesSet.add(p.mandante);
            timesSet.add(p.visitante);
        });

        const tabela = {};
        for (const time of timesSet) {
            tabela[time] = { time, pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, gols_pro: 0, gols_contra: 0, saldo: 0 };
        }

        for (const jogo of jogosGrupo) {
            const m = tabela[jogo.mandante];
            const v = tabela[jogo.visitante];
            if (!m || !v) continue;

            m.jogos++;
            v.jogos++;
            m.gols_pro += jogo.placar_mandante;
            m.gols_contra += jogo.placar_visitante;
            v.gols_pro += jogo.placar_visitante;
            v.gols_contra += jogo.placar_mandante;

            if (jogo.placar_mandante > jogo.placar_visitante) {
                m.pontos += 3; m.vitorias++;
                v.derrotas++;
            } else if (jogo.placar_mandante < jogo.placar_visitante) {
                v.pontos += 3; v.vitorias++;
                m.derrotas++;
            } else {
                m.pontos += 1; m.empates++;
                v.pontos += 1; v.empates++;
            }

            m.saldo = m.gols_pro - m.gols_contra;
            v.saldo = v.gols_pro - v.gols_contra;
        }

        // Ordenar: pontos DESC → vitórias DESC → saldo DESC → gols_pro DESC
        const classificacao = Object.values(tabela).sort((a, b) =>
            b.pontos - a.pontos || b.vitorias - a.vitorias || b.saldo - a.saldo || b.gols_pro - a.gols_pro
        );

        return { nome: nomeGrupo, classificacao };
    });

    return this.grupos;
};

/**
 * Atualiza estatísticas após modificar partidas
 */
calendarioCompeticaoSchema.methods.atualizarStats = function() {
    const total = this.partidas.length;
    const realizados = this.partidas.filter(p => p.status === 'encerrado').length;

    // Determinar fase atual
    const fases = [...new Set(this.partidas.filter(p => p.fase).map(p => p.fase))];
    const ordemFases = ['grupos', '5a-fase', 'oitavas', 'quartas', 'semis', 'final'];
    let faseAtual = 'grupos';

    for (const fase of ordemFases) {
        if (!fases.includes(fase)) continue;
        const jogosFase = this.partidas.filter(p => p.fase === fase);
        const todosEncerrados = jogosFase.every(p => p.status === 'encerrado');
        if (!todosEncerrados) {
            faseAtual = fase;
            break;
        }
        faseAtual = fase; // Se todos encerrados, fase atual é a próxima
    }

    this.stats = {
        total_jogos: total,
        jogos_realizados: realizados,
        jogos_restantes: total - realizados,
        fase_atual: faseAtual,
    };

    return this.stats;
};

// =====================================================================
// MÉTODOS ESTÁTICOS
// =====================================================================

/**
 * Busca ou cria calendário de uma competição
 */
calendarioCompeticaoSchema.statics.obterOuCriar = async function(competicao, temporada) {
    let calendario = await this.findOne({ competicao, temporada });

    if (!calendario) {
        calendario = new this({
            competicao,
            temporada,
            partidas: [],
            grupos: [],
            stats: { total_jogos: 0, jogos_realizados: 0, jogos_restantes: 0, fase_atual: 'grupos' }
        });
        await calendario.save();
    }

    return calendario;
};

/**
 * Importa partidas de uma fonte externa (merge inteligente)
 */
calendarioCompeticaoSchema.statics.importarPartidas = async function(competicao, temporada, partidasNovas, fonte) {
    const calendario = await this.obterOuCriar(competicao, temporada);

    for (const nova of partidasNovas) {
        // Buscar partida existente por mandante + visitante + data
        const idx = calendario.partidas.findIndex(p =>
            p.data === nova.data &&
            p.mandante.toLowerCase() === nova.mandante.toLowerCase() &&
            p.visitante.toLowerCase() === nova.visitante.toLowerCase()
        );

        if (idx >= 0) {
            const existente = calendario.partidas[idx];
            calendario.partidas[idx] = {
                ...existente.toObject ? existente.toObject() : existente,
                ...nova,
                mandante_id: nova.mandante_id || existente.mandante_id,
                visitante_id: nova.visitante_id || existente.visitante_id,
            };
        } else {
            calendario.partidas.push(nova);
        }
    }

    calendario.ultima_atualizacao = new Date();
    calendario.fonte = fonte;
    calendario.atualizarStats();
    calendario.calcularClassificacao();

    await calendario.save();
    return calendario;
};

const CalendarioCompeticao = mongoose.model('CalendarioCompeticao', calendarioCompeticaoSchema);

export default CalendarioCompeticao;
export { COMPETICOES_VALIDAS };
