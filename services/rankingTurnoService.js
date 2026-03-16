// services/rankingTurnoService.js
// ✅ v3.0: Suporte a parciais em tempo real (rodada em andamento)
// ✅ v2.0: Suporte a participantes inativos (separação no ranking)
import RankingTurno from "../models/RankingTurno.js";
import Rodada from "../models/Rodada.js";
import Liga from "../models/Liga.js";
import mongoose from "mongoose";
import { buscarRankingParcial } from "./parciaisRankingService.js";

const LOG_PREFIX = "[RANKING-TURNO-SERVICE]";

/**
 * Busca ranking de um turno específico
 * Se não existir ou estiver desatualizado, consolida automaticamente
 * @param {string} ligaId - ID da liga
 * @param {string} turno - Turno (1, 2 ou geral)
 * @param {number} temporada - Ano da temporada (opcional, default: ano atual)
 */
export async function buscarRankingTurno(ligaId, turno, temporada = new Date().getFullYear()) {
    console.log(
        `${LOG_PREFIX} Buscando ranking turno ${turno} para liga ${ligaId} - Temporada: ${temporada}`,
    );

    // Validar turno
    if (!["1", "2", "geral"].includes(turno)) {
        throw new Error("Turno inválido. Use: 1, 2 ou geral");
    }

    // Converter ligaId para ObjectId se necessário
    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    // Buscar snapshot existente (filtrado por temporada)
    let snapshot = await RankingTurno.findOne({ ligaId: ligaObjectId, turno, temporada });

    // Se não existe ou está em andamento, verificar se precisa atualizar
    const { inicio, fim } = RankingTurno.getRodadasTurno(turno);

    // Buscar última rodada processada da liga (filtrada por temporada)
    const ultimaRodada = await Rodada.findOne({ ligaId: ligaObjectId, temporada })
        .sort({ rodada: -1 })
        .select("rodada")
        .lean();

    const rodadaAtual = ultimaRodada?.rodada || 0;

    // ✅ v3.3: Validar snapshots "consolidados" - forçar reconsolidação se stale
    // Um turno "geral" (1-38) só pode ser consolidado se rodadaAtual >= 38
    if (snapshot && snapshot.status === "consolidado") {
        if (rodadaAtual < fim) {
            // Snapshot incorretamente marcado como consolidado - deletar para forçar reconsolidação
            console.log(`${LOG_PREFIX} ⚠️ Snapshot consolidado stale detectado (R${snapshot.rodada_atual} vs rodadaAtual R${rodadaAtual}, fim R${fim}), deletando para reconsolidar...`);
            await RankingTurno.deleteOne({ _id: snapshot._id });
            snapshot = null;
        } else if (turno !== "geral") {
            // Turnos 1 e 2 consolidados podem retornar direto (são imutáveis)
            console.log(`${LOG_PREFIX} ✅ Retornando snapshot consolidado turno ${turno}`);
            return snapshot;
        }
        // turno "geral" consolidado: continuar para checar parciais antes de retornar
    }

    // ✅ v3.4: Verificar se precisa consolidar — check robusto por contagem de registros
    // Além do número da rodada, verifica se a quantidade de registros no banco mudou
    // Isso detecta repopulações e populações parciais (rodada populada em batches)
    let precisaConsolidar =
        !snapshot ||
        snapshot.rodada_atual < rodadaAtual ||
        (rodadaAtual >= fim && snapshot.status !== "consolidado");

    // ✅ v3.4: Check extra — contar registros atuais vs quando o snapshot foi criado
    if (!precisaConsolidar && snapshot && snapshot.status !== "consolidado") {
        const totalRegistrosAtual = await Rodada.countDocuments({
            ligaId: ligaObjectId,
            temporada,
            rodada: { $gte: inicio, $lte: fim },
            rodadaNaoJogada: { $ne: true },
        });
        const totalRegistrosSnapshot = (snapshot.ranking || []).reduce(
            (acc, r) => acc + (r.rodadas_jogadas || 0), 0
        );
        if (totalRegistrosAtual !== totalRegistrosSnapshot) {
            console.log(`${LOG_PREFIX} ⚠️ Contagem de registros diverge (DB: ${totalRegistrosAtual} vs Snapshot: ${totalRegistrosSnapshot}), forçando reconsolidação...`);
            precisaConsolidar = true;
        }
    }

    if (precisaConsolidar) {
        console.log(`${LOG_PREFIX} 🔄 Consolidando ranking turno ${turno} - Temporada ${temporada}...`);
        snapshot = await consolidarRankingTurno(
            ligaObjectId,
            turno,
            rodadaAtual,
            temporada,
        );
    }

    // ✅ v3.1: Buscar parciais SEMPRE que turno=geral (mesmo com snapshot)
    // Isso garante que durante rodada em andamento, o ranking mostre acumulado + parciais
    if (turno === "geral") {
        console.log(`${LOG_PREFIX} 🔴 Verificando parciais em tempo real... (Temporada: ${temporada})`);
        const parciais = await buscarRankingParcial(ligaId);

        console.log(`${LOG_PREFIX} 📊 Resposta de parciais:`, parciais ? {
            disponivel: parciais.disponivel,
            motivo: parciais.motivo,
            rodada: parciais.rodada,
            message: parciais.message,
            total_times: parciais.total_times,
        } : 'NULL');

        if (parciais && parciais.disponivel) {
            console.log(`${LOG_PREFIX} ✅ Parciais encontradas: ${parciais.total_times} times (acumulado + rodada ao vivo)`);
            return {
                ligaId: ligaObjectId,
                turno: "geral",
                temporada,
                status: "parcial",
                rodada_inicio: 1,
                rodada_fim: 38,
                rodada_atual: parciais.rodada,
                ranking: parciais.ranking,
                parcial: true,
                atualizado_em: parciais.atualizado_em,
                message: parciais.message,
            };
        } else if (parciais && !parciais.disponivel) {
            // Mercado aberto ou sem pontuação: retornar snapshot consolidado se existir
            if (snapshot) {
                console.log(`${LOG_PREFIX} ℹ️ ${parciais.motivo} - retornando snapshot consolidado (R1-${rodadaAtual})`);
                return snapshot;
            }
            // Sem snapshot nem parciais: retornar estado contextualizado
            console.log(`${LOG_PREFIX} ⚠️ Sem snapshot e sem parciais: ${parciais.motivo}`);
            return {
                ligaId: ligaObjectId,
                turno: "geral",
                temporada,
                status: parciais.motivo || "aguardando",
                rodada_inicio: 1,
                rodada_fim: 38,
                rodada_atual: parciais.rodada || 0,
                ranking: [],
                parcial: false,
                message: parciais.message,
            };
        }
    }

    return snapshot;
}

/**
 * Consolida ranking de um turno calculando pontos das rodadas
 * ✅ v2.0: Inclui informações de participantes inativos
 * @param {ObjectId} ligaId - ID da liga
 * @param {string} turno - Turno (1, 2 ou geral)
 * @param {number} rodadaAtualGeral - Rodada atual geral
 * @param {number} temporada - Ano da temporada (opcional, default: ano atual)
 */
export async function consolidarRankingTurno(ligaId, turno, rodadaAtualGeral, temporada = new Date().getFullYear()) {
    const { inicio, fim } = RankingTurno.getRodadasTurno(turno);

    console.log(
        `${LOG_PREFIX} Consolidando turno ${turno} (rodadas ${inicio}-${fim}) - Temporada ${temporada}`,
    );

    // ✅ v2.0: Buscar liga para obter status de participantes
    const liga = await Liga.findById(ligaId).lean();
    const participantesMap = new Map();
    if (liga && liga.participantes) {
        liga.participantes.forEach((p) => {
            participantesMap.set(p.time_id, {
                rodada_desistencia: p.rodada_desistencia || null,
                ativo: p.ativo !== false && !p.rodada_desistencia,
            });
        });
    }

    // Buscar todas as rodadas do turno (filtradas por temporada)
    const rodadas = await Rodada.find({
        ligaId,
        temporada,
        rodada: { $gte: inicio, $lte: fim },
        populacaoFalhou: { $ne: true }, // ✅ v3.2: Excluir registros com falha de API
    }).lean();

    if (!rodadas || rodadas.length === 0) {
        console.log(
            `${LOG_PREFIX} ⚠️ Nenhuma rodada encontrada para turno ${turno}`,
        );
        return null;
    }

    console.log(`${LOG_PREFIX} 📊 Processando ${rodadas.length} registros`);

    // Agrupar por timeId e somar pontos
    const timesPontos = {};

    rodadas.forEach((registro) => {
        const timeId = registro.timeId;
        const pontos = registro.rodadaNaoJogada ? 0 : registro.pontos || 0;

        // ✅ v2.0: Obter status do participante
        const statusPart = participantesMap.get(timeId) || { ativo: true, rodada_desistencia: null };

        if (!timesPontos[timeId]) {
            timesPontos[timeId] = {
                timeId,
                nome_time: registro.nome_time || "N/D",
                nome_cartola: registro.nome_cartola || "N/D",
                escudo: registro.escudo || "",
                clube_id: registro.clube_id,
                pontos: 0,
                rodadas_jogadas: 0,
                // ✅ v2.0: Campos de status
                ativo: statusPart.ativo,
                rodada_desistencia: statusPart.rodada_desistencia,
                inativo: !statusPart.ativo,
            };
        }

        timesPontos[timeId].pontos += pontos;
        if (!registro.rodadaNaoJogada) {
            timesPontos[timeId].rodadas_jogadas++;
        }
    });

    // ✅ v2.0: Separar ativos e inativos
    const todosParticipantes = Object.values(timesPontos);
    const ativos = todosParticipantes.filter((t) => t.ativo);
    const inativos = todosParticipantes.filter((t) => !t.ativo);

    // Ordenar cada grupo por pontos
    ativos.sort((a, b) => b.pontos - a.pontos);
    inativos.sort((a, b) => b.pontos - a.pontos);

    // ✅ v2.0: Atribuir posições separadas
    // Ativos: posição normal de 1 a N
    ativos.forEach((time, index) => {
        time.posicao = index + 1;
        time.posicao_grupo = index + 1;
    });

    // Inativos: posição após os ativos (apenas para ordenação visual)
    inativos.forEach((time, index) => {
        time.posicao = ativos.length + index + 1;
        time.posicao_grupo = index + 1;
    });

    // ✅ v2.0: Combinar ranking (ativos primeiro, depois inativos)
    const ranking = [...ativos, ...inativos];

    console.log(`${LOG_PREFIX} 📊 Ranking: ${ativos.length} ativos, ${inativos.length} inativos`);

    // Determinar rodada atual do turno
    const rodadaAtualTurno = Math.min(
        Math.max(...rodadas.map((r) => r.rodada)),
        fim,
    );

    // Determinar status
    const deveConsolidar = rodadaAtualGeral >= fim;
    const status = deveConsolidar ? "consolidado" : "em_andamento";

    // Salvar snapshot (upsert) - filtrado por temporada
    const snapshot = await RankingTurno.findOneAndUpdate(
        { ligaId, turno, temporada },
        {
            ligaId,
            turno,
            temporada,
            status,
            rodada_inicio: inicio,
            rodada_fim: fim,
            rodada_atual: rodadaAtualTurno,
            ranking,
            consolidado_em: deveConsolidar ? new Date() : null,
            atualizado_em: new Date(),
        },
        { upsert: true, new: true },
    );

    console.log(
        `${LOG_PREFIX} ✅ Turno ${turno} ${status} - ${ranking.length} times`,
    );

    return snapshot;
}

/**
 * Força reconsolidação de todos os turnos de uma liga
 * @param {string|ObjectId} ligaId - ID da liga
 * @param {number} temporada - Ano da temporada (opcional, default: ano atual)
 */
export async function reconsolidarTodosOsTurnos(ligaId, temporada = new Date().getFullYear()) {
    console.log(
        `${LOG_PREFIX} 🔄 Reconsolidando todos os turnos para liga ${ligaId} - Temporada: ${temporada}`,
    );

    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    // Buscar última rodada (filtrada por temporada para não misturar dados de anos anteriores)
    const ultimaRodada = await Rodada.findOne({ ligaId: ligaObjectId, temporada })
        .sort({ rodada: -1 })
        .select("rodada")
        .lean();

    const rodadaAtual = ultimaRodada?.rodada || 0;

    // Consolidar cada turno
    const resultados = {
        turno1: await consolidarRankingTurno(ligaObjectId, "1", rodadaAtual, temporada),
        turno2: await consolidarRankingTurno(ligaObjectId, "2", rodadaAtual, temporada),
        geral: await consolidarRankingTurno(ligaObjectId, "geral", rodadaAtual, temporada),
    };

    return resultados;
}

/**
 * Invalida cache de um turno (força recálculo na próxima busca)
 */
export async function invalidarCacheTurno(ligaId, turno = null) {
    const ligaObjectId =
        typeof ligaId === "string"
            ? new mongoose.Types.ObjectId(ligaId)
            : ligaId;

    const filtro = { ligaId: ligaObjectId };

    // Se turno específico e NÃO consolidado, pode invalidar
    if (turno) {
        filtro.turno = turno;
        filtro.status = { $ne: "consolidado" }; // Não invalida consolidados
    } else {
        filtro.status = { $ne: "consolidado" };
    }

    const resultado = await RankingTurno.deleteMany(filtro);

    console.log(
        `${LOG_PREFIX} 🗑️ Cache invalidado: ${resultado.deletedCount} registros`,
    );

    return resultado;
}

export default {
    buscarRankingTurno,
    consolidarRankingTurno,
    reconsolidarTodosOsTurnos,
    invalidarCacheTurno,
};
