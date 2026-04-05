// =====================================================================
// CALENDARIO BRASILEIRAO MODEL - v1.0
// Schema para armazenar tabela COMPLETA do Brasileirão (38 rodadas)
// Diferente de CalendarioRodada (1 rodada só), este armazena TUDO
// =====================================================================

import mongoose from 'mongoose';

// Schema de uma partida individual
const partidaBrasileiraoSchema = new mongoose.Schema({
    id_externo: {
        type: String, // ID da API-Football ou outra fonte
        required: false
    },
    rodada: {
        type: Number,
        required: true,
        min: 1,
        max: 38
    },
    data: {
        type: String, // Formato: "2026-04-10"
        required: true
    },
    horario: {
        type: String, // Formato: "16:00" (horário de Brasília)
        required: true
    },
    mandante: {
        type: String,
        required: true
    },
    visitante: {
        type: String,
        required: true
    },
    mandante_id: {
        type: Number, // ID Cartola (262=Flamengo)
        required: false
    },
    visitante_id: {
        type: Number,
        required: false
    },
    placar_mandante: {
        type: Number,
        default: null // null = ainda não jogou
    },
    placar_visitante: {
        type: Number,
        default: null
    },
    status: {
        type: String,
        enum: ['agendado', 'ao_vivo', 'encerrado', 'adiado', 'cancelado', 'a_definir'],
        default: 'agendado'
    },
    estadio: {
        type: String,
        required: false
    },
    cidade: {
        type: String,
        required: false
    }
}, { _id: false });

// Schema principal - uma entrada por temporada
const calendarioBrasileiraoSchema = new mongoose.Schema({
    temporada: {
        type: Number,
        required: true,
        unique: true
    },
    liga_id: {
        type: Number,
        default: 71 // Brasileirão Série A no API-Football
    },
    partidas: [partidaBrasileiraoSchema],
    ultima_atualizacao: {
        type: Date,
        default: Date.now
    },
    fonte: {
        type: String,
        enum: ['api-football', 'espn', 'globo', '365scores', 'manual', 'misto'],
        default: 'espn'
    },
    stats: {
        total_jogos: { type: Number, default: 380 },
        jogos_realizados: { type: Number, default: 0 },
        jogos_restantes: { type: Number, default: 380 },
        rodada_atual: { type: Number, default: 1 },
        ultima_rodada_completa: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// =====================================================================
// MÉTODOS DE INSTÂNCIA
// =====================================================================

/**
 * Retorna todas as partidas de uma rodada específica
 */
calendarioBrasileiraoSchema.methods.obterRodada = function(numeroRodada) {
    return this.partidas
        .filter(p => p.rodada === numeroRodada)
        .sort((a, b) => {
            if (a.data !== b.data) return a.data.localeCompare(b.data);
            return a.horario.localeCompare(b.horario);
        });
};

/**
 * Retorna a rodada atual (baseado em jogos em andamento ou próximos)
 */
calendarioBrasileiraoSchema.methods.obterRodadaAtual = function() {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Encontrar rodada atual usando datas + status
    for (let r = 1; r <= 38; r++) {
        const jogosRodada = this.partidas.filter(p => p.rodada === r);
        if (jogosRodada.length === 0) continue;

        const todosEncerrados = jogosRodada.every(p => p.status === 'encerrado');
        if (todosEncerrados) continue;

        // Jogos ao vivo? Retornar imediatamente, independente da data
        if (jogosRodada.some(p => p.status === 'ao_vivo')) return r;

        // Última data da rodada
        const datas = jogosRodada.map(p => p.data).filter(Boolean).sort();
        const dataFimRodada = datas.length > 0 ? datas[datas.length - 1] : null;

        // Rodada já passou? Pular (encerrada com ressalvas)
        if (dataFimRodada && dataFimRodada < hoje) continue;

        return r;
    }

    return 38; // Todas encerradas
};

/**
 * Verifica se há jogos ao vivo AGORA
 * Prioriza status 'ao_vivo' do DB (atualizado pelo endpoint /ao-vivo).
 * Heurística de horário como fallback defensivo caso sync não tenha rodado.
 */
calendarioBrasileiraoSchema.methods.temJogosAoVivo = function() {
    // Verificação primária: status atualizado pelo sistema jogos-ao-vivo
    const temStatusAoVivo = this.partidas.some(p => p.status === 'ao_vivo');
    if (temStatusAoVivo) return true;

    // Fallback defensivo: heurística de horário para jogos agendados hoje
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
 * Retorna o próximo jogo (após agora)
 */
calendarioBrasileiraoSchema.methods.obterProximoJogo = function() {
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    const minutoAtual = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }));
    const minutosAgora = horaAtual * 60 + minutoAtual;

    const jogosFuturos = this.partidas
        .filter(partida => {
            if (partida.status === 'encerrado' || partida.status === 'cancelado') {
                return false;
            }

            if (partida.data === hoje) {
                const [horaJogo, minutoJogo] = partida.horario.split(':').map(Number);
                const minutosJogo = horaJogo * 60 + minutoJogo;
                return minutosJogo > minutosAgora;
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
 * Calcula quando ativar polling (10min antes do próximo jogo)
 */
calendarioBrasileiraoSchema.methods.calcularProximoDisparo = function() {
    const proximoJogo = this.obterProximoJogo();
    if (!proximoJogo) return null;

    const agora = new Date();
    const dataJogo = new Date(`${proximoJogo.data}T${proximoJogo.horario}:00-03:00`);
    const dataDisparo = new Date(dataJogo.getTime() - 10 * 60 * 1000); // 10min antes

    if (dataDisparo <= agora) return null;

    return dataDisparo;
};

/**
 * Agrupa partidas por rodada para exibição
 */
calendarioBrasileiraoSchema.methods.agruparPorRodada = function() {
    const rodadas = {};

    for (let r = 1; r <= 38; r++) {
        const jogos = this.obterRodada(r);
        if (jogos.length > 0) {
            const datas = [...new Set(jogos.map(j => j.data))].sort();
            rodadas[r] = {
                numero: r,
                data_inicio: datas[0],
                data_fim: datas[datas.length - 1],
                total_jogos: jogos.length,
                jogos_encerrados: jogos.filter(j => j.status === 'encerrado').length,
                jogos_ao_vivo: jogos.filter(j => j.status === 'ao_vivo').length,
                jogos_agendados: jogos.filter(j => j.status === 'agendado' || j.status === 'a_definir').length,
                partidas: jogos
            };
        }
    }

    return rodadas;
};

/**
 * Atualiza estatísticas após modificar partidas
 */
calendarioBrasileiraoSchema.methods.atualizarStats = function() {
    const total = this.partidas.length;
    const realizados = this.partidas.filter(p => p.status === 'encerrado').length;
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Encontrar rodada atual usando datas + status
    let rodadaAtual = 0;
    let ultimaCompleta = 0;

    for (let r = 1; r <= 38; r++) {
        const jogosRodada = this.partidas.filter(p => p.rodada === r);
        if (jogosRodada.length === 0) continue;

        const todosEncerrados = jogosRodada.every(p => p.status === 'encerrado');
        if (todosEncerrados) {
            ultimaCompleta = r;
            continue;
        }

        // Última data da rodada (max das datas dos jogos)
        const datas = jogosRodada.map(p => p.data).filter(Boolean).sort();
        const dataFimRodada = datas.length > 0 ? datas[datas.length - 1] : null;

        // Rodada já passou no calendário? Considerar encerrada mesmo com jogos pendentes
        if (dataFimRodada && dataFimRodada < hoje) {
            continue; // Pular — rodada passada (jogos adiados/não realizados)
        }

        // Tem jogos ao vivo ou agendados com datas futuras → esta é a rodada atual
        if (!rodadaAtual) {
            rodadaAtual = r;
        }
    }

    // Fallback: se nenhuma rodada ativa, próxima após a última completa
    if (!rodadaAtual) {
        rodadaAtual = Math.min(ultimaCompleta + 1, 38);
    }

    this.stats = {
        total_jogos: total,
        jogos_realizados: realizados,
        jogos_restantes: total - realizados,
        rodada_atual: rodadaAtual,
        ultima_rodada_completa: ultimaCompleta
    };

    return this.stats;
};

/**
 * Calcula classificação geral a partir dos jogos encerrados
 * Retorna array de 20 times ordenado por pontos DESC
 */
calendarioBrasileiraoSchema.methods.calcularClassificacao = function() {
    // Coletar todos os times do campeonato
    const timesSet = new Map(); // nome → { time_id }
    for (const p of this.partidas) {
        if (!timesSet.has(p.mandante)) timesSet.set(p.mandante, p.mandante_id || null);
        if (!timesSet.has(p.visitante)) timesSet.set(p.visitante, p.visitante_id || null);
    }

    // Inicializar tabela
    const tabela = {};
    for (const [time, timeId] of timesSet) {
        tabela[time] = {
            time,
            time_id: timeId,
            pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
            gols_pro: 0, gols_contra: 0, saldo: 0,
            ultimos5: []
        };
    }

    // Processar jogos encerrados (ordenados por rodada para ultimos5)
    const jogosEncerrados = this.partidas
        .filter(p => p.status === 'encerrado' && p.placar_mandante !== null && p.placar_visitante !== null)
        .sort((a, b) => a.rodada - b.rodada);

    for (const jogo of jogosEncerrados) {
        const m = tabela[jogo.mandante];
        const v = tabela[jogo.visitante];
        if (!m || !v) continue;

        m.jogos++; v.jogos++;
        m.gols_pro += jogo.placar_mandante;
        m.gols_contra += jogo.placar_visitante;
        v.gols_pro += jogo.placar_visitante;
        v.gols_contra += jogo.placar_mandante;

        if (jogo.placar_mandante > jogo.placar_visitante) {
            m.pontos += 3; m.vitorias++; v.derrotas++;
            m.ultimos5.push('V'); v.ultimos5.push('D');
        } else if (jogo.placar_mandante < jogo.placar_visitante) {
            v.pontos += 3; v.vitorias++; m.derrotas++;
            v.ultimos5.push('V'); m.ultimos5.push('D');
        } else {
            m.pontos += 1; m.empates++;
            v.pontos += 1; v.empates++;
            m.ultimos5.push('E'); v.ultimos5.push('E');
        }

        m.saldo = m.gols_pro - m.gols_contra;
        v.saldo = v.gols_pro - v.gols_contra;
    }

    // Ordenar: pontos DESC → vitórias → saldo → gols_pro
    const sorted = Object.values(tabela)
        .sort((a, b) =>
            b.pontos - a.pontos ||
            b.vitorias - a.vitorias ||
            b.saldo - a.saldo ||
            b.gols_pro - a.gols_pro
        );

    // Zonas baseadas na posição final (Brasileirão 2026 — fonte ESPN)
    // Libertadores: 1º–5º | Sul-Americana: 6º–10º | Rebaixamento: 18º–20º
    const _zona = (pos) => {
        if (pos <= 5) return 'libertadores';
        if (pos <= 10) return 'sul-americana';
        if (pos >= 18) return 'rebaixamento';
        return '';
    };

    const classificacao = sorted.map((t, i) => ({
        posicao: i + 1,
        zona: _zona(i + 1),
        ...t,
        aproveitamento: t.jogos > 0 ? Math.floor((t.pontos / (t.jogos * 3)) * 1000) / 10 : 0,
        ultimos5: t.ultimos5.slice(-5)
    }));

    return classificacao;
};

// =====================================================================
// MÉTODOS ESTÁTICOS
// =====================================================================

/**
 * Busca ou cria calendário da temporada
 */
calendarioBrasileiraoSchema.statics.obterOuCriar = async function(temporada) {
    let calendario = await this.findOne({ temporada });

    if (!calendario) {
        calendario = new this({
            temporada,
            partidas: [],
            stats: {
                total_jogos: 0,
                jogos_realizados: 0,
                jogos_restantes: 0,
                rodada_atual: 1,
                ultima_rodada_completa: 0
            }
        });
        await calendario.save();
    }

    return calendario;
};

/**
 * Importa partidas de uma fonte externa (merge inteligente)
 * Semáforo simples para prevenir race condition entre syncs simultâneos
 */
let _importLock = false;
calendarioBrasileiraoSchema.statics.importarPartidas = async function(temporada, partidasNovas, fonte) {
    if (_importLock) throw new Error('importarPartidas já em andamento — aguarde conclusão');
    _importLock = true;
    try {
    const calendario = await this.obterOuCriar(temporada);

    for (const nova of partidasNovas) {
        // v1.1: Match primário por mandante_id + visitante_id (mais robusto que rodada + nomes).
        // Cada par mandante×visitante aparece exatamente 1x no turno e 1x no returno (invertido).
        // Isso evita duplicatas quando ESPN infere rodada diferente do seed.
        let idx = -1;

        if (nova.mandante_id && nova.visitante_id) {
            idx = calendario.partidas.findIndex(p =>
                p.mandante_id === nova.mandante_id &&
                p.visitante_id === nova.visitante_id
            );
        }

        // Fallback: match por rodada + nomes (caso IDs não estejam disponíveis)
        if (idx < 0 && nova.rodada) {
            idx = calendario.partidas.findIndex(p =>
                p.rodada === nova.rodada &&
                p.mandante.toLowerCase() === nova.mandante.toLowerCase() &&
                p.visitante.toLowerCase() === nova.visitante.toLowerCase()
            );
        }

        if (idx >= 0) {
            // Atualizar partida existente (preservar dados que já temos)
            const existente = calendario.partidas[idx];
            const existenteObj = existente.toObject ? existente.toObject() : existente;
            calendario.partidas[idx] = {
                ...existenteObj,
                ...nova,
                // Preservar IDs do Cartola se já temos
                mandante_id: nova.mandante_id || existente.mandante_id,
                visitante_id: nova.visitante_id || existente.visitante_id,
                // Preservar rodada do MongoDB se nova é 0 (inferência falhou)
                rodada: (nova.rodada >= 1 && nova.rodada <= 38)
                    ? nova.rodada
                    : (existenteObj.rodada || nova.rodada),
            };
        } else {
            // Nova partida
            calendario.partidas.push(nova);
        }
    }

    calendario.ultima_atualizacao = new Date();
    calendario.fonte = fonte;
    calendario.atualizarStats();

    await calendario.save();
    return calendario;
    } finally {
        _importLock = false;
    }
};

const CalendarioBrasileirao = mongoose.model('CalendarioBrasileirao', calendarioBrasileiraoSchema);

export default CalendarioBrasileirao;
