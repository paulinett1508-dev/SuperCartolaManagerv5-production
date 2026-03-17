# Tarefas Pendentes

---

## 🚨 CRÍTICO — Bug Pontos Corridos: Bruno Barros ausente do bracket (2026-03-17)

### Contexto
Liga Super Cartola 2026 (`684cb1c8af923da7c7df51de`) tem **35 participantes**, mas os
4 caches do módulo Pontos Corridos foram gerados com **34 participantes** (Bruno Barros ausente).

**time_id Bruno Barros:** `1113367`

### Causa Raiz (confirmada)
- Bruno Barros foi inscrito via **InscricaoTemporada** (fluxo 2026), mas nunca sincronizado para `liga.participantes`
- O bracket foi gerado quando a liga tinha 34 times → caches salvos com `cache_permanente: true` → jamais regenerados
- O frontend detecta 35 times (lê InscricaoTemporada), o backend usa 34 (lê liga.participantes) → bracket completamente diferente entre admin e DB
- Consequência visual: Antonio Luis some da R4 no admin, Bruno Barros aparece jogando contra times errados

### Impacto
- R1–R4: 4 caches com 34 times, Bruno ausente de todos os 17 confrontos de cada rodada
- Classificação exibe Bruno com 0V/0D/0E/0pts — nunca jogou
- 0 extratos financeiros para Bruno no módulo PC
- R5 ainda não salva → se consolidada sem fix, herda o bracket errado para sempre
- Antonio Luis e outros times têm pairings errados no admin

### Decisão aprovada pelo usuário
**Opção A — Regeneração total:** Deletar os 4 caches, gerar novo bracket com 35 times, repopular R1–R4 com scores reais da collection `rodadas`. Bruno tem pontos confirmados na collection `rodadas` desde R1.

### Script criado
`scripts/regenerar-bracket-pontos-corridos.js` — commit `3cb9f38`

### PROBLEMA ATUAL DO SCRIPT
O script foi executado no Replit mas FALHOU:
```
Bracket gerado: 35 times → 35 rodadas | rodadaInicial BR: 7
Nenhuma rodada BR >= 7 com dados — nada a regenerar.
4 anomalias detectadas (auditoria correta), mas 0 caches regenerados
```

### Diagnóstico do bug no script (investigação incompleta)
Causa suspeita — uma das seguintes:
1. rodadaInicial lido como 7 mas caches foram criados com valor diferente
2. Query em `rodadas` com `ligaId: ObjectId` quando está salvo como String (ou vice-versa)
3. Temporada ausente nos docs da collection `rodadas`
4. Scores estão em `rodadas` para BR < 7, sendo todos filtrados pelo filter(br >= 7)

### Próximos passos obrigatórios

**1. Diagnóstico DB (Replit ou MCP Mongo):**
```
db.moduleconfigs.findOne({ liga_id: "684cb1c8af923da7c7df51de", modulo_id: "pontos_corridos", temporada: 2026 })
db.rodadas.find({ ligaId: ObjectId("684cb1c8af923da7c7df51de"), temporada: 2026 }).limit(3)
db.rodadas.distinct("rodada", { temporada: 2026 })
```

**2. Ver função reconstruirCacheDeRodadas** no controller (~linha 520+) — essa função SÁ FUNCIONA para reconstruir caches, o script deve usar a mesma lógica

**3. Corrigir o script** com base no diagnóstico e re-testar no Replit

**4. Validação pós-fix:**
- Admin PC mostra 35 times com confrontos consistentes em todas as rodadas
- Bruno Barros aparece em R1–R4 com pontos reais
- Antonio Luis aparece em R4 normalmente
- R5 consolida corretamente

### Arquivos-chave
| Arquivo | Relevância |
|---------|-----------|
| `controllers/pontosCorridosCacheController.js` | reconstruirCacheDeRodadas (~linha 520+) |
| `utils/moduleConfigHelper.js` | buscarConfigSimplificada — como rodadaInicial é lido |
| `scripts/regenerar-bracket-pontos-corridos.js` | Script com bug (commit 3cb9f38) |
| `models/Rodada.js` | ligaId: ObjectId, rodada: Number |
| `models/PontosCorridosCache.js` | liga_id: String (não ObjectId!) |

### Fix sistêmico pendente (após resolver o imediato)
Atualizar `pontosCorridosCacheController.js` para buscar participantes via `InscricaoTemporada`
além de `liga.participantes` — evita recorrência para futuros inscritos pelo fluxo 2026.
