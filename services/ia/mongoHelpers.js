/**
 * MONGO HELPERS — Big Cartola IA v2
 *
 * Centraliza normalizacao de `liga_id`/`ligaId` entre collections.
 * No projeto, diferentes collections armazenam o ID da liga em formatos diferentes:
 *   - ObjectId: ligas._id, rodadas.ligaId, pontoscorridoscaches.liga_id, capitaocaches.ligaId
 *   - String:   moduleconfigs.liga_id, rankinggeralcaches.ligaId, melhor_mes_cache.ligaId,
 *               rankingturnos.ligaId, top10caches.liga_id, artilheirocampeaos.ligaId,
 *               tirocertocaches.liga_id, goleiros.ligaId, restaumcaches.liga_id,
 *               matamatacaches.liga_id
 *
 * Este modulo exporta helpers para obter o filtro correto por collection.
 */

import { ObjectId } from 'mongodb';

/**
 * Retorna um ObjectId a partir de string/ObjectId, ou null se invalido.
 */
export function toObjectId(id) {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    try {
        return new ObjectId(String(id));
    } catch {
        return null;
    }
}

/**
 * Mapa de formato esperado do identificador da liga em cada collection.
 *   'objectId' -> filtrar com new ObjectId(ligaId)
 *   'string'   -> filtrar com String(ligaId)
 */
const LIGA_ID_FORMAT = {
    ligas: { field: '_id', format: 'objectId' },
    rodadas: { field: 'ligaId', format: 'objectId' },
    pontoscorridoscaches: { field: 'liga_id', format: 'objectId' },
    capitaocaches: { field: 'ligaId', format: 'objectId' },
    moduleconfigs: { field: 'liga_id', format: 'string' },
    rankinggeralcaches: { field: 'ligaId', format: 'string' },
    melhor_mes_cache: { field: 'ligaId', format: 'string' },
    rankingturnos: { field: 'ligaId', format: 'string' },
    top10caches: { field: 'liga_id', format: 'string' },
    artilheirocampeaos: { field: 'ligaId', format: 'string' },
    tirocertocaches: { field: 'liga_id', format: 'string' },
    goleiros: { field: 'ligaId', format: 'string' },
    restaumcaches: { field: 'liga_id', format: 'string' },
    fluxofinanceirocampos: { field: 'liga_id', format: 'string' },
    extratofinanceirocaches: { field: 'liga_id', format: 'string' },
    matamatacaches: { field: 'liga_id', format: 'string' },
};

/**
 * Retorna o filtro `{ [campo]: valor }` pronto para usar em `findOne`/`find`,
 * respeitando o formato (ObjectId ou String) esperado pela collection.
 *
 * @param {string} collectionName - nome da collection (ex: 'pontoscorridoscaches')
 * @param {string} ligaId - ID da liga (pode vir como string ou ObjectId)
 * @returns {Object|null} filtro pronto ou null se collection desconhecida
 */
export function filtroLiga(collectionName, ligaId) {
    const meta = LIGA_ID_FORMAT[collectionName];
    if (!meta) return null;

    if (meta.format === 'objectId') {
        const oid = toObjectId(ligaId);
        if (!oid) return null;
        return { [meta.field]: oid };
    }

    return { [meta.field]: String(ligaId) };
}
