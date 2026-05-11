// scripts/fix-mm-supercartola-2026-calendar.js
//
// Cria/atualiza ModuleConfig do mata_mata para Liga Super Cartola 2026
// com calendario_override corrigido (shift -1 vs JSON padrão).
//
// Calendário REAL observado no MataMataCache (consolidação automática):
//   Ed.1: definição=R2, primeira=R3, ..., final=R7  (já encerrada)
//   Ed.2: definição=R8, primeira=R9, ..., final=R13 (já encerrada)
//   Ed.3: definição=R14, primeira=R15, ..., final=R19 (em andamento, primeira já no cache)
//   Ed.4: definição=R20, primeira=R21, ..., final=R25
//   Ed.5: definição=R26, primeira=R27, ..., final=R31
//
// Idempotente: usa ativarModulo (upsert).
// NÃO regenera cache.

import mongoose from "mongoose";
import dotenv from "dotenv";
import ModuleConfig from "../models/ModuleConfig.js";

dotenv.config();

const LIGA_ID = "684cb1c8af923da7c7df51de"; // Super Cartola 2026
const TEMPORADA = 2026;

const calendario_override = [
  {
    edicao: 1,
    nome: "1ª Edição",
    rodada_inicial: 3,
    rodada_final: 7,
    rodada_definicao: 2,
    fases: { primeira: 3, oitavas: 4, quartas: 5, semis: 6, final: 7 },
  },
  {
    edicao: 2,
    nome: "2ª Edição",
    rodada_inicial: 9,
    rodada_final: 13,
    rodada_definicao: 8,
    fases: { primeira: 9, oitavas: 10, quartas: 11, semis: 12, final: 13 },
  },
  {
    edicao: 3,
    nome: "3ª Edição",
    rodada_inicial: 15,
    rodada_final: 19,
    rodada_definicao: 14,
    fases: { primeira: 15, oitavas: 16, quartas: 17, semis: 18, final: 19 },
  },
  {
    edicao: 4,
    nome: "4ª Edição",
    rodada_inicial: 21,
    rodada_final: 25,
    rodada_definicao: 20,
    fases: { primeira: 21, oitavas: 22, quartas: 23, semis: 24, final: 25 },
  },
  {
    edicao: 5,
    nome: "5ª Edição",
    rodada_inicial: 27,
    rodada_final: 31,
    rodada_definicao: 26,
    fases: { primeira: 27, oitavas: 28, quartas: 29, semis: 30, final: 31 },
  },
];

const wizard_respostas = {
  total_times: 32,
  qtd_edicoes: 5,
  total_participantes: 35,
  formato: "1x32, 2x31, ...",
  origem: "fix-mm-supercartola-2026-calendar.js",
};

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI ausente no .env");
    process.exit(1);
  }
  console.log("🔌 Conectando ao MongoDB...");
  await mongoose.connect(uri);
  console.log("✅ Conectado.");

  const antes = await ModuleConfig.buscarConfig(LIGA_ID, "mata_mata", TEMPORADA);
  console.log(`\n📋 Estado ANTES: ${antes ? "EXISTE" : "INEXISTENTE"}`);
  if (antes) {
    console.log(`   - ativo: ${antes.ativo}`);
    console.log(`   - calendario_override: ${antes.calendario_override?.length || 0} edições`);
    console.log(`   - wizard_respostas: ${JSON.stringify(antes.wizard_respostas || {})}`);
  }

  console.log("\n💾 Aplicando ativarModulo (upsert idempotente)...");
  const result = await ModuleConfig.ativarModulo(
    LIGA_ID,
    "mata_mata",
    { calendario_override, wizard_respostas },
    "fix-mm-supercartola-2026-calendar.js",
    TEMPORADA,
  );

  console.log("\n✅ Salvo. Estado DEPOIS:");
  console.log(`   - _id: ${result._id}`);
  console.log(`   - ativo: ${result.ativo}`);
  console.log(`   - ativado_em: ${result.ativado_em}`);
  console.log(`   - calendario_override: ${result.calendario_override.length} edições`);
  console.log(`   - Ed.3 primeira=R${result.calendario_override[2].fases.primeira}, definição=R${result.calendario_override[2].rodada_definicao}`);

  await mongoose.disconnect();
  console.log("\n👋 Desconectado.");
}

main().catch((err) => {
  console.error("❌ ERRO:", err);
  process.exit(1);
});
