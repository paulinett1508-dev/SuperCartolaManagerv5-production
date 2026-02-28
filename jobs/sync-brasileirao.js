// =====================================================================
// SYNC BRASILEIRAO JOB - v1.1
// Job de sincronização automática do calendário do Brasileirão
// v1.1: Mini-syncs a cada 2h em dias com jogos (atualizar encerrados)
// =====================================================================

import brasileiraoService from '../services/brasileirao-tabela-service.js';
import CalendarioBrasileirao from '../models/CalendarioBrasileirao.js';

// Configuração
const CONFIG = {
    HORA_SYNC: 6,              // 06:00 de Brasília (sync completo)
    INTERVALO_VERIFICACAO: 60, // Verifica a cada 60 minutos
    MINI_SYNC_INTERVALO: 2,    // Mini-sync a cada 2 horas em dias com jogo
    TEMPORADA_PADRAO: new Date().getFullYear(),
};

let jobTimer = null;
let ultimoSyncDia = null;
let ultimoMiniSync = null; // Timestamp do último mini-sync

/**
 * Verifica se hoje tem jogos agendados no calendário
 */
async function temJogosHoje() {
    try {
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const calendario = await CalendarioBrasileirao.findOne(
            { temporada: CONFIG.TEMPORADA_PADRAO },
            { 'partidas.data': 1, 'partidas.status': 1 }
        ).lean();

        if (!calendario) return false;

        return calendario.partidas.some(p =>
            p.data === hoje && (p.status === 'agendado' || p.status === 'ao_vivo')
        );
    } catch {
        return false;
    }
}

/**
 * Verifica se deve executar sync completo (uma vez por dia às 06:00)
 */
function deveExecutarSync() {
    const agora = new Date();
    const horaAtual = parseInt(agora.toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour: 'numeric',
        hour12: false
    }), 10);

    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Se já executou hoje, não executa de novo
    if (ultimoSyncDia === hoje) {
        return false;
    }

    // Executar se for entre 06:00 e 07:00
    return horaAtual === CONFIG.HORA_SYNC;
}

/**
 * Verifica se deve executar mini-sync (a cada 2h em dias com jogo)
 */
function deveExecutarMiniSync() {
    if (!ultimoMiniSync) return true;

    const diff = Date.now() - ultimoMiniSync;
    return diff >= CONFIG.MINI_SYNC_INTERVALO * 60 * 60 * 1000;
}

/**
 * Executa o sync completo do calendário (via API-Football)
 */
async function executarSync() {
    const temporada = CONFIG.TEMPORADA_PADRAO;
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    console.log(`[SYNC-BRASILEIRAO] Iniciando sync diário da temporada ${temporada}...`);

    try {
        const resultado = await brasileiraoService.sincronizarTabela(temporada, true);

        if (resultado.success) {
            ultimoSyncDia = hoje;
            ultimoMiniSync = Date.now();
            console.log(`[SYNC-BRASILEIRAO] Sync completo: ${resultado.jogosImportados || 0} jogos via ${resultado.fonte}`);
        } else {
            console.error('[SYNC-BRASILEIRAO] Falha no sync:', resultado.erro);
        }

        return resultado;

    } catch (error) {
        console.error('[SYNC-BRASILEIRAO] Erro no sync:', error.message);
        return { success: false, erro: error.message };
    }
}

/**
 * Mini-sync: atualiza apenas status dos jogos de hoje via jogos-ao-vivo
 * Não consome quota da API-Football (usa o endpoint interno)
 */
async function executarMiniSync() {
    const temporada = CONFIG.TEMPORADA_PADRAO;
    console.log(`[SYNC-BRASILEIRAO] Mini-sync: atualizando jogos de hoje...`);

    try {
        const resultado = await brasileiraoService.obterResumoAoVivo(temporada);
        ultimoMiniSync = Date.now();

        if (resultado.success) {
            const aoVivo = resultado.jogos_ao_vivo_count || 0;
            console.log(`[SYNC-BRASILEIRAO] Mini-sync OK (${aoVivo} ao vivo)`);
        }

        return resultado;

    } catch (error) {
        console.warn('[SYNC-BRASILEIRAO] Erro no mini-sync:', error.message);
        return { success: false, erro: error.message };
    }
}

/**
 * Loop de verificação
 */
async function verificarEExecutar() {
    // Sync completo diário às 06:00
    if (deveExecutarSync()) {
        await executarSync();
        return;
    }

    // Mini-sync em dias com jogo (a cada 2h)
    if (deveExecutarMiniSync()) {
        const jogosHoje = await temJogosHoje();
        if (jogosHoje) {
            await executarMiniSync();
        }
    }
}

/**
 * Inicia o job de sync automático
 */
function iniciar() {
    if (jobTimer) {
        console.log('[SYNC-BRASILEIRAO] Job já está rodando');
        return;
    }

    console.log('[SYNC-BRASILEIRAO] Iniciando job (sync 06:00 + mini-sync 2h em dias com jogo)');

    // Verificar imediatamente na inicialização
    verificarEExecutar();

    // Verificar a cada hora
    jobTimer = setInterval(verificarEExecutar, CONFIG.INTERVALO_VERIFICACAO * 60 * 1000);
}

/**
 * Para o job
 */
function parar() {
    if (jobTimer) {
        clearInterval(jobTimer);
        jobTimer = null;
        console.log('[SYNC-BRASILEIRAO] Job parado');
    }
}

/**
 * Força execução imediata (para testes/admin)
 */
async function forcarSync(temporada = null) {
    const temp = temporada || CONFIG.TEMPORADA_PADRAO;
    console.log(`[SYNC-BRASILEIRAO] Forçando sync da temporada ${temp}...`);
    return executarSync();
}

/**
 * Retorna status do job
 */
function getStatus() {
    return {
        ativo: jobTimer !== null,
        ultimoSync: ultimoSyncDia,
        ultimoMiniSync: ultimoMiniSync ? new Date(ultimoMiniSync).toISOString() : null,
        horaSyncProgramado: `${CONFIG.HORA_SYNC}:00 BRT`,
        miniSyncIntervalo: `${CONFIG.MINI_SYNC_INTERVALO}h`,
        temporada: CONFIG.TEMPORADA_PADRAO,
    };
}

export default {
    iniciar,
    parar,
    forcarSync,
    getStatus,
    executarSync,
};

export {
    iniciar,
    parar,
    forcarSync,
    getStatus,
    executarSync,
};
