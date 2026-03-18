# Tarefas Pendentes

> Última atualização: 2026-03-18 — Sessão de auditoria financeira (discrepâncias de saldo)

---

## 🚨 TAREFA ATIVA — AUDITORIA FINANCEIRA: 3 SALDOS DIFERENTES

### Contexto
Branch: `claude/reset-2026-finances-Hne9m`
Último commit: `dfa41e0 feat: reset financeiro 2026 + auditoria radical 2025`

O participante **Antonio Luis (time_id: 645089, liga: 684cb1c8af923da7c7df51de)** mostra
3 saldos completamente divergentes no sistema:

| Tela | Endpoint | Controller | Valor |
|------|----------|-----------|-------|
| Admin — coluna "Saldo" na tabela | `/api/tesouraria/liga/:id` | `tesourariaController` | **-120,00** |
| Admin — card "Ver Extrato" (modal) | `/api/extrato-cache/.../cache/valido` | `verificarCacheValido` | **+89,00** |
| App participante | `/api/extrato-cache/.../cache` | `getExtratoCache` | **-91,00** |

### Hipótese Confirmada por Análise de Código (falta confirmar no DB)

**Bug 1 (+89 vs -91 = diferença de 180 = taxa de inscrição)**
- O cache do Antonio Luis provavelmente NÃO tem transação `INSCRICAO_TEMPORADA` no `historico_transacoes`
- `getExtratoCache` (app) tem o **v7.2 FIX** que detecta inscrição ausente no cache e aplica via `InscricaoTemporada` doc → aplica -180
- `verificarCacheValido` (admin extrato) usa `adicionarLancamentosIniciaisAoResumo()` que só soma o que JÁ está no cache → se ausente, saldo fica sem a taxa → +89

**Bug 2 (-120 vs -91 = diferença de -29)**
- `tesourariaController` aplica `aplicarAjusteInscricaoBulk()` que considera `divida_anterior`
- Diferença provavelmente vem de `divida_anterior` ou acertos calculados de forma diferente

**Causa Raiz Fundamental:**
`utils/saldo-calculator.js` existe como "fonte única de verdade" mas é usado APENAS por `tesourariaController`.
`verificarCacheValido` e `getExtratoCache` têm implementações divergentes da mesma lógica.

---

## PLANO DE EXECUÇÃO (precisa de .env / MongoDB — usar VS Code + SSH Replit)

### Fase 1 — CONFIRMAR HIPÓTESE (precisa do .env)
```bash
bun run scripts/applied-fixes/audit-antonio-luis-2026.js
```
OU verificar diretamente no MongoDB:
```javascript
// Verificar se INSCRICAO_TEMPORADA está no cache
db.extratofinanceirocaches.findOne(
  { liga_id: "684cb1c8af923da7c7df51de", time_id: 645089, temporada: 2026 },
  { historico_transacoes: 1, saldo_consolidado: 1 }
)
```

### Fase 2 — FIX CRÍTICO: aplicar v7.2 em verificarCacheValido
**Arquivo:** `controllers/extratoFinanceiroCacheController.js`
**Onde:** função `verificarCacheValido`, path normal ativo (linha ~1503)
**O que fazer:** Após `adicionarLancamentosIniciaisAoResumo(resumoCalculado)`, adicionar
verificação de inscrição ausente do cache (mesmo v7.2 que `getExtratoCache` já tem).
**Referência exata:** `getExtratoCache` linhas 915–967 (bloco v7.2 FIX completo)

### Fase 3 — INVESTIGAR diferença de 29 entre tesouraria e app
Comparar `aplicarAjusteInscricaoBulk` (tesouraria) vs v7.2 manual (app).
Ver se `divida_anterior` está sendo aplicada em ambos.

### Fase 4 — VALIDAR: as 3 fontes mostram o mesmo valor
Após os fixes, rodar `audit-antonio-luis-2026.js` novamente e testar as 3 telas.

### Fase 5 — (Opcional, futuro) Consolidar todos os paths em saldo-calculator.js
Refatoração maior — não obrigatória nesta sessão.

---

## ARQUIVOS-CHAVE DESTA TAREFA

| Arquivo | Linha crítica | Papel |
|---------|--------------|-------|
| `controllers/extratoFinanceiroCacheController.js` | ~915 (v7.2 FIX) | App path — CORRETO |
| `controllers/extratoFinanceiroCacheController.js` | ~1503 (verificarCacheValido normal) | Admin extrato — FALTANDO v7.2 |
| `controllers/tesourariaController.js` | ~50 (_calcularSaldoCore) | Admin tabela |
| `utils/saldo-calculator.js` | ~281 (aplicarAjusteInscricaoBulk) | Fonte verdade — referência canônica |
| `scripts/applied-fixes/audit-antonio-luis-2026.js` | — | Script diagnóstico DB |
| `public/js/fluxo-financeiro/fluxo-financeiro-core.js` | ~1328 (_calcularSaldoFinal) | Admin frontend recalculation |
| `public/js/fluxo-financeiro/extrato-render-v2.js` | ~51 (renderHeroCardV2) | Hero card lê saldo_atual ?? saldo |

---

## CONTEXTO ADICIONAL DA SESSÃO

- Branch de trabalho: `claude/reset-2026-finances-Hne9m`
- Não foi feito push desta sessão de investigação (somente leitura de código, sem .env disponível)
- O commit `dfa41e0` (anterior) contém scripts de reset/auditoria 2026 — não relacionado ao bug atual
- A análise foi 100% via leitura de código
- Próxima sessão DEVE começar confirmando hipótese no banco antes de codar
