# Tarefas Pendentes

> Última atualização: 2026-03-18 — Bug de saldo divergente resolvido e commitado

---

## ✅ CONCLUÍDO — Bug de 3 saldos diferentes (Antonio Luis / FloriMengo FC)

**Commit:** `46ca751` — `fix(extrato): porta v7.2 FIX para verificarCacheValido`
**Branch:** `main`

### Causa Raiz
`verificarCacheValido` não tinha o v7.2 FIX que `getExtratoCache` já possuía.
Quando `INSCRICAO_TEMPORADA` não está no cache, o admin extrato ignorava a taxa
de inscrição (−R$180), retornando saldo incorreto.

### Fix Aplicado
`controllers/extratoFinanceiroCacheController.js:1516` — após
`adicionarLancamentosIniciaisAoResumo`, verifica se inscrição está no cache;
se não, busca `InscricaoTemporada` via Mongoose e aplica taxa/transferido/dívida.

### Resultado
- Admin extrato: **−R$151** (antes: +R$29 — bug)
- App participante: **−R$151** (inalterado)
- Admin tabela: **−R$151** (inalterado)

---

## 🔲 PENDENTE — Validação visual (usuário)

Confirmar nas 3 telas que os saldos convergem para −R$151:
- [ ] Admin tabela (coluna Saldo)
- [ ] Admin "Ver Extrato" (modal)
- [ ] App participante

---

## 🔲 DECISÃO DE NEGÓCIO — Ajustes financeiros inativos

Existem 3 ajustes com `ativo: false` para Antonio Luis / liga `684cb1c8af923da7c7df51de`:

| Ajuste | Valor | ativo |
|--------|-------|-------|
| Entrada Inscrição 2026 | +R$60 | false |
| Teste ajuste via API | −R$25 | false |
| Teste ajuste via API | −R$25 | false |

Se o ajuste de +R$60 for um pagamento parcial legítimo da inscrição,
deve ser reativado no admin → saldo seria −R$91.
Se foram testes descartados, saldo de −R$151 está correto.

---

## 🔲 OPCIONAL — Fase 5: Consolidar saldo-calculator.js

Refatoração maior: unificar os 3 paths de cálculo em `saldo-calculator.js`.
Não urgente. Abordar em sessão futura quando houver espaço.
