# Tarefas Pendentes

> Última atualização: 2026-04-06 — Correções Resta Um R8/R9/R10 concluídas

---

## ✅ CONCLUÍDO — Bug de 3 saldos diferentes (Antonio Luis / FloriMengo FC)

**Commit:** `46ca751` — `fix(extrato): porta v7.2 FIX para verificarCacheValido`

Causa raiz: `verificarCacheValido` ignorava taxa de inscrição quando `INSCRICAO_TEMPORADA` não estava no cache. Fix aplicado em `extratoFinanceiroCacheController.js:1516`. Saldo convergiu para −R$151 nas 3 telas.

---

## ✅ CONCLUÍDO — Validação visual e decisão de ajustes inativos

Validação confirmada pelo usuário. Ajustes com `ativo: false` tratados como testes descartados — saldo −R$151 considerado correto.

---

## ✅ CONCLUÍDO — Eliminações Resta Um R8, R9, R10 (liga 684cb1c8af923da7c7df51de)

**Commits:** `0d00d124`, `c94b60d3`

**Causa raiz:** `onConsolidate` usava `Rodada` records com scores parciais da fase live (populate step pula registros existentes sem `repopular: true`). Resultado: R8 e R10 não processados; R9 eliminou Chamex com score parcial (28.5 live vs 79.24 final).

**Correções aplicadas:**
- R8 → Chamex F.C. (8188312) — 28.50 pts ✅
- R9 → BarrosB (1113367) — 63.58 pts ✅
- R10 → Invictus Patamar S.A.F. (25324292) — 64.86 pts ✅

`historicoEliminacoes` (7 entradas), `debitosLancados` ([8,9,10]) e `rodadaAtual: 10` salvos via `updateOne + $set`.

**Causa raiz pendente (código):** `rodadaController.js processarRodada()` deve passar `repopular: true` na consolidação final para evitar recorrência. A corrigir em sessão futura.

---

## 🔲 OPCIONAL — Consolidar saldo-calculator.js

Refatoração maior: unificar os 3 paths de cálculo em `saldo-calculator.js`. Não urgente. Abordar em sessão futura quando houver espaço.
