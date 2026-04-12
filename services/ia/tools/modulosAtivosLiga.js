/**
 * TOOL: modulos_ativos_liga
 *
 * Retorna a lista dos modulos ativos na liga do participante, com
 * nomes humanizados. Le `liga.modulos_ativos` e inclui apenas chaves
 * com valor === true.
 */

import { filtroLiga } from '../mongoHelpers.js';

const MODULO_NOMES = {
    extrato: 'Extrato Financeiro',
    ranking: 'Ranking Geral',
    rodadas: 'Historico de Rodadas',
    historico: 'Historico',
    top10: 'Top 10 Cartoleiros',
    melhorMes: 'Melhor Mes',
    pontosCorridos: 'Pontos Corridos',
    mataMata: 'Mata-Mata',
    artilheiro: 'Artilheiro',
    luvaOuro: 'Luva de Ouro',
    capitaoLuxo: 'Capitao de Luxo',
    campinho: 'Campinho',
    dicas: 'Dicas',
    raioX: 'Raio-X',
    tiroCerto: 'Tiro Certo',
    participantes: 'Lista de Participantes',
    premiacoes: 'Premiacoes',
    regras: 'Regras',
    cartolaPro: 'Cartola Pro',
    turnoReturno: 'Turno e Returno',
    restaUm: 'Resta Um',
};

export default {
    name: 'modulos_ativos_liga',
    description:
        'Retorna a lista dos modulos ativos na liga do participante com nomes legíveis. Use quando perguntarem "quais modulos estao ativos", "quais disputas tem na liga", "o que posso jogar".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtro = filtroLiga('ligas', ctx.ligaId);
        if (!filtro) return { erro: 'liga_invalida' };

        const liga = await db
            .collection('ligas')
            .findOne(filtro, { projection: { nome: 1, modulos_ativos: 1, temporada: 1 } });

        if (!liga) return { erro: 'liga_nao_encontrada' };

        const modulos = liga.modulos_ativos || {};
        const ativos = Object.entries(modulos)
            .filter(([, v]) => v === true)
            .map(([k]) => ({ chave: k, nome: MODULO_NOMES[k] || k }));

        return {
            liga_nome: liga.nome,
            temporada: liga.temporada,
            total_ativos: ativos.length,
            modulos_ativos: ativos,
        };
    },
};
