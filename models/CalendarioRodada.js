// =====================================================================
// CALENDARIO RODADA MODEL - v1.1
// ✅ v1.1: BUG-002 FIX - Timezone America/Sao_Paulo em temJogosAoVivo,
//          obterProximoJogo e calcularProximoDisparo (era UTC misturado com local)
// Schema para armazenar horários oficiais dos jogos por rodada
// =====================================================================

import mongoose from 'mongoose';

const partidaSchema = new mongoose.Schema({
    data: {
        type: String, // Formato: "2026-01-28"
        required: true
    },
    horario: {
        type: String, // Formato: "19:00" (horário de Brasília)
        required: true
    },
    time_casa: {
        type: String,
        required: true
    },
    time_fora: {
        type: String,
        required: true
    },
    clube_casa_id: {
        type: Number, // ID do clube (262=Flamengo, etc)
        required: false
    },
    clube_fora_id: {
        type: Number,
        required: false
    },
    status: {
        type: String,
        enum: ['agendado', 'ao_vivo', 'encerrado', 'adiado', 'cancelado'],
        default: 'agendado'
    },
    fonte: {
        type: String, // "api-football", "cbf", "manual"
        default: 'manual'
    }
}, { _id: false });

const calendarioRodadaSchema = new mongoose.Schema({
    temporada: {
        type: Number,
        required: true
    },
    rodada: {
        type: Number,
        required: true,
        min: 1,
        max: 38
    },
    partidas: [partidaSchema],
    atualizado_em: {
        type: Date,
        default: Date.now
    },
    fonte_principal: {
        type: String,
        default: 'manual'
    }
}, {
    timestamps: true
});

// Índice único por temporada + rodada
calendarioRodadaSchema.index({ temporada: 1, rodada: 1 }, { unique: true });

// Método para verificar se há jogos em andamento AGORA
// ✅ BUG-002 FIX: Usar timezone America/Sao_Paulo (não UTC)
calendarioRodadaSchema.methods.temJogosAoVivo = function() {
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    const minutoAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }));

    return this.partidas.some(partida => {
        if (partida.data !== hoje) return false;
        if (partida.status === 'ao_vivo') return true;

        // Verificar se está no horário (± 2h30 de margem)
        if (partida.status === 'agendado') {
            const [horaJogo, minutoJogo] = partida.horario.split(':').map(Number);
            const minutosJogo = horaJogo * 60 + minutoJogo;
            const minutosAgora = horaAtual * 60 + minutoAtual;
            const diff = minutosAgora - minutosJogo;

            // Se passou do horário mas ainda não encerrou (até 2h30 depois)
            return diff >= 0 && diff <= 150;
        }

        return false;
    });
};

// Método para obter próximo jogo (após agora)
// ✅ BUG-002 FIX: Usar timezone America/Sao_Paulo (não UTC)
calendarioRodadaSchema.methods.obterProximoJogo = function() {
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    const minutoAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }));
    const minutosAgora = horaAtual * 60 + minutoAtual;

    // Filtrar jogos futuros (hoje ou depois, ainda não começaram)
    const jogosFuturos = this.partidas
        .filter(partida => {
            if (partida.status === 'encerrado' || partida.status === 'cancelado') {
                return false;
            }

            // Se for hoje, verificar se ainda não passou
            if (partida.data === hoje) {
                const [horaJogo, minutoJogo] = partida.horario.split(':').map(Number);
                const minutosJogo = horaJogo * 60 + minutoJogo;
                return minutosJogo > minutosAgora;
            }

            // Se for dia futuro, incluir
            return partida.data > hoje;
        })
        .sort((a, b) => {
            // Ordenar por data + horário
            if (a.data !== b.data) {
                return a.data.localeCompare(b.data);
            }
            return a.horario.localeCompare(b.horario);
        });

    return jogosFuturos[0] || null;
};

// Método para calcular quando ativar polling (10min antes do próximo jogo)
// ✅ BUG-002 FIX: Construir Date usando timezone explícito de Brasília
calendarioRodadaSchema.methods.calcularProximoDisparo = function() {
    const proximoJogo = this.obterProximoJogo();
    if (!proximoJogo) return null;

    const agora = new Date();
    // Dados do jogo estão em horário de Brasília - construir Date explicitamente
    const dataJogo = new Date(`${proximoJogo.data}T${proximoJogo.horario}:00-03:00`);
    const dataDisparo = new Date(dataJogo.getTime() - 10 * 60 * 1000); // 10min antes

    // Se já passou, retornar null
    if (dataDisparo <= agora) return null;

    return dataDisparo;
};

// =====================================================================
// STATIC: Determinar rodada atual e status_mercado a partir do calendário
// Substitui a dependência do campo status_mercado da API Cartola
//
// Retorna: { rodada_atual, status_mercado, fonte: 'calendario' } ou null
//
// Lógica de status_mercado (espelha a convenção Cartola FC):
//   1 = mercado aberto     (antes do primeiro jogo da rodada)
//   2 = rodada em andamento (entre o primeiro e o último jogo + 2h30)
//   4 = rodada encerrada   (após o último jogo + 2h30)
// =====================================================================
calendarioRodadaSchema.statics.obterStatusAtual = async function(temporada) {
    const agora = new Date();
    const MARGEM_MS = 150 * 60 * 1000; // 2h30 após o último jogo

    const rodadas = await this.find({ temporada: Number(temporada) })
        .sort({ rodada: 1 })
        .lean();

    if (!rodadas.length) return null;

    // Para cada rodada, calcular janela [inicioJanela, fimJanela]
    const janelas = rodadas
        .map(r => {
            const dts = r.partidas
                .filter(p => p.status !== 'cancelado' && p.status !== 'adiado')
                .map(p => new Date(`${p.data}T${p.horario}:00-03:00`))
                .filter(d => !isNaN(d));

            if (!dts.length) return null;

            return {
                rodada: r.rodada,
                inicio: new Date(Math.min(...dts)),
                fim:    new Date(Math.max(...dts) + MARGEM_MS),
            };
        })
        .filter(Boolean);

    if (!janelas.length) return null;

    // 1. Rodada em andamento agora?
    const emAndamento = janelas.find(j => agora >= j.inicio && agora <= j.fim);
    if (emAndamento) {
        return { rodada_atual: emAndamento.rodada, status_mercado: 2, fonte: 'calendario' };
    }

    // 2. Próxima rodada futura?
    const proximas = janelas.filter(j => agora < j.inicio).sort((a, b) => a.inicio - b.inicio);
    if (proximas.length) {
        return { rodada_atual: proximas[0].rodada, status_mercado: 1, fonte: 'calendario' };
    }

    // 3. Todas encerradas → retorna a última
    const ultima = janelas[janelas.length - 1];
    return { rodada_atual: ultima.rodada, status_mercado: 4, fonte: 'calendario' };
};

const CalendarioRodada = mongoose.model('CalendarioRodada', calendarioRodadaSchema);

export default CalendarioRodada;
