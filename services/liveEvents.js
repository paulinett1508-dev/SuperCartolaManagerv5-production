// services/liveEvents.js
// LIVE-002: EventEmitter compartilhado entre liveCacheWarmer (produtor) e getLiveStream (consumidor).
// Evento emitido: `parciais-updated:<ligaId>` com payload {parciais, ranking, atualizadoEm}.
import { EventEmitter } from "events";

const liveEmitter = new EventEmitter();
liveEmitter.setMaxListeners(500); // até 500 conexões SSE simultâneas

export default liveEmitter;
