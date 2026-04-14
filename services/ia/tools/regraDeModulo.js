/**
 * TOOL: regra_de_modulo
 *
 * Retorna a regra textual de um modulo, lendo diretamente os arquivos
 * JSON em /config/rules/. Substitui o RAG antigo — volume pequeno e
 * leitura direta e mais simples e determinista.
 *
 * v2: cruza a regra estatica com as configuracoes customizadas da liga
 * (ModuleConfig.wizard_respostas), devolvendo overrides especificos da liga.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filtroLiga } from '../mongoHelpers.js';
import { CURRENT_SEASON } from '../../../config/seasons.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RULES_DIR = path.resolve(__dirname, '..', '..', '..', 'config', 'rules');

// Mapa de nomes amigaveis -> arquivo
const MAPA = {
    pontos_corridos: 'pontos_corridos.json',
    pontoscorridos: 'pontos_corridos.json',
    mata_mata: 'mata_mata.json',
    matamata: 'mata_mata.json',
    top_10: 'top_10.json',
    top10: 'top_10.json',
    melhor_mes: 'melhor_mes.json',
    melhormes: 'melhor_mes.json',
    ranking_geral: 'ranking_geral.json',
    ranking: 'ranking_geral.json',
    ranking_rodada: 'ranking_rodada.json',
    turno_returno: 'turno_returno.json',
    turnoreturno: 'turno_returno.json',
    resta_um: 'resta_um.json',
    restaum: 'resta_um.json',
    tiro_certo: 'tiro_certo.json',
    tirocerto: 'tiro_certo.json',
    artilheiro: 'artilheiro.json',
    capitao_luxo: 'capitao_luxo.json',
    capitaoluxo: 'capitao_luxo.json',
    luva_ouro: 'luva_ouro.json',
    luvaouro: 'luva_ouro.json',
    extrato: 'extrato.json',
};

function normalizar(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export default {
    name: 'regra_de_modulo',
    description:
        'Retorna a regra textual e a descricao de um modulo (pontos_corridos, mata_mata, top_10, melhor_mes, ranking_geral, ranking_rodada, turno_returno, resta_um, tiro_certo, artilheiro, capitao_luxo, luva_ouro, extrato). Use quando perguntarem "como funciona o modulo X", "qual a regra do Y", "explique o Z".',
    parameters: {
        type: 'object',
        properties: {
            modulo: {
                type: 'string',
                description:
                    'Nome do modulo (ex: "pontos_corridos", "mata_mata", "resta_um").',
            },
        },
        required: ['modulo'],
        additionalProperties: false,
    },

    async handler({ args, ctx, db }) {
        const chave = normalizar(args?.modulo);
        const arquivo = MAPA[chave];

        if (!arquivo) {
            return {
                erro: 'modulo_desconhecido',
                modulos_disponiveis: Object.keys(MAPA).filter(
                    k => !k.includes('_')
                ),
            };
        }

        // Regra estatica do JSON
        let regraEstatica = {};
        try {
            const caminho = path.join(RULES_DIR, arquivo);
            const raw = fs.readFileSync(caminho, 'utf-8');
            regraEstatica = JSON.parse(raw);
        } catch (error) {
            return {
                erro: 'arquivo_ilegivel',
                detalhe: error.message,
            };
        }

        // Overrides per-liga via ModuleConfig.wizard_respostas
        let wizardRespostas = null;
        if (ctx?.ligaId && db) {
            try {
                const filtroMod = filtroLiga('moduleconfigs', ctx.ligaId);
                if (filtroMod) {
                    const temporada = Number(ctx.temporada || CURRENT_SEASON);
                    // Mapear chave normalizada -> nome do modulo no moduleconfigs
                    const MAPA_MODULO = {
                        pontos_corridos: 'pontos_corridos', pontoscorridos: 'pontos_corridos',
                        mata_mata: 'mata_mata', matamata: 'mata_mata',
                        top_10: 'top10', top10: 'top10',
                        melhor_mes: 'melhor_mes', melhormes: 'melhor_mes',
                        ranking_geral: 'ranking_geral', ranking: 'ranking_geral',
                        turno_returno: 'turno_returno', turnoreturno: 'turno_returno',
                        resta_um: 'resta_um', restaum: 'resta_um',
                        tiro_certo: 'tiro_certo', tirocerto: 'tiro_certo',
                        artilheiro: 'artilheiro',
                        capitao_luxo: 'capitao_luxo', capitaoluxo: 'capitao_luxo',
                        luva_ouro: 'luva_ouro', luvaouro: 'luva_ouro',
                    };
                    const nomeModulo = MAPA_MODULO[chave];
                    if (nomeModulo) {
                        const mc = await db
                            .collection('moduleconfigs')
                            .findOne(
                                { ...filtroMod, modulo: nomeModulo, temporada },
                                { projection: { wizard_respostas: 1 } }
                            );
                        if (mc?.wizard_respostas && Object.keys(mc.wizard_respostas).length > 0) {
                            wizardRespostas = mc.wizard_respostas;
                        }
                    }
                }
            } catch { /* fallback silencioso */ }
        }

        return {
            modulo: regraEstatica.nome || chave,
            descricao: regraEstatica.descricao || null,
            regras: regraEstatica.regras || null,
            pontuacao: regraEstatica.pontuacao || null,
            premiacao: regraEstatica.premiacao || null,
            observacoes: regraEstatica.observacoes || null,
            configuracoes_desta_liga: wizardRespostas,
        };
    },
};
