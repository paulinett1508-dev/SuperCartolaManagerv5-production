/**
 * TOOL: config_liga_detalhada
 *
 * Retorna as configuracoes customizadas da liga:
 *   - Liga.configuracoes (por modulo: pontos_corridos, mata_mata, etc.)
 *   - ModuleConfig.wizard_respostas de cada modulo ativo (customizacoes do wizard)
 *
 * Util para responder perguntas como "qual e o formato do mata-mata da minha liga",
 * "quantas edicoes tem o melhor do mes aqui", "qual a premiacao do pontos corridos".
 * Multi-tenant: ligaId vem do ctx.
 */

import { filtroLiga } from '../mongoHelpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

export default {
    name: 'config_liga_detalhada',
    description:
        'Retorna as configuracoes customizadas desta liga: formato do mata-mata, numero de edicoes do melhor do mes, premiacao dos modulos, etc. Use quando perguntarem "como e o mata-mata aqui", "quantas edicoes tem o melhor do mes", "qual o formato da liga", "qual a premiacao do X", "como esta configurado o Y nesta liga".',
    parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },

    async handler({ ctx, db }) {
        const filtroLigas = filtroLiga('ligas', ctx.ligaId);
        if (!filtroLigas) return { erro: 'liga_invalida' };

        const temporada = Number(ctx.temporada || CURRENT_SEASON);

        // Buscar configuracoes da liga
        const liga = await db
            .collection('ligas')
            .findOne(filtroLigas, {
                projection: {
                    nome: 1,
                    configuracoes: 1,
                    modulos_ativos: 1,
                    status: 1,
                    temporada: 1,
                },
            });

        if (!liga) return { erro: 'liga_nao_encontrada' };

        // Buscar wizard_respostas de todos os modulos configurados
        const filtroMod = filtroLiga('moduleconfigs', ctx.ligaId);
        let modulosConfig = [];
        if (filtroMod) {
            const docs = await db
                .collection('moduleconfigs')
                .find({ ...filtroMod, temporada })
                .project({ modulo: 1, ativo: 1, wizard_respostas: 1 })
                .toArray();

            modulosConfig = docs
                .filter(d => d.wizard_respostas && Object.keys(d.wizard_respostas).length > 0)
                .map(d => ({
                    modulo: d.modulo,
                    ativo: !!d.ativo,
                    configuracoes_wizard: d.wizard_respostas,
                }));
        }

        // Modulos ativos (chaves true)
        const modulosAtivos = liga.modulos_ativos
            ? Object.entries(liga.modulos_ativos)
                  .filter(([, v]) => v === true)
                  .map(([k]) => k)
            : [];

        return {
            liga: liga.nome || null,
            temporada: liga.temporada ?? temporada,
            status: liga.status ?? null,
            modulos_ativos: modulosAtivos,
            configuracoes_por_modulo: liga.configuracoes ?? {},
            wizard_respostas_por_modulo: modulosConfig,
        };
    },
};
