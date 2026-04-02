// models/ScoutSnapshot.js
// ✅ v1.0: Persistência de scouts de atletas pontuados por rodada
// Frozen = scouts definitivos (partida encerrada há 12h+)
// Scout de atleta frozen: não consulta mais a API Cartola

import mongoose from "mongoose";
import { CURRENT_SEASON } from "../config/seasons.js";

const ScoutSnapshotSchema = new mongoose.Schema({
  rodada:      { type: Number, required: true },
  temporada:   { type: Number, required: true, default: CURRENT_SEASON },
  atletaId:    { type: Number, required: true },
  clubeId:     { type: Number, required: true, default: 0 },
  apelido:     { type: String, default: "" },
  pontos:      { type: Number, default: 0 },
  scout:       { type: mongoose.Schema.Types.Mixed, default: {} },
  entrou_em_campo: { type: Boolean, default: null },
  // frozen = true → scouts não mudarão mais; dados do banco têm prioridade sobre API
  frozen:    { type: Boolean, default: false, index: true },
  frozenAt:  { type: Date,    default: null },
  coletadoEm: { type: Date,  default: Date.now },
});

// Índice único por rodada+atleta (scouts são globais — iguais em qualquer liga)
ScoutSnapshotSchema.index({ rodada: 1, atletaId: 1 }, { unique: true });
// Índice para busca de frozen por rodada (endpoint de parciais)
ScoutSnapshotSchema.index({ rodada: 1, temporada: 1, frozen: 1 });

export default mongoose.model("ScoutSnapshot", ScoutSnapshotSchema);
