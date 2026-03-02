# Auditoria de Hardcoding Multi-Liga - 02/03/2026

## Sumario Executivo

O backend (controllers, orchestrator, consolidacao) esta **correto e SaaS-ready** — busca configs dinamicamente do MongoDB por liga. Porem, o **frontend inteiro** e os **config/rules JSON** estao repletos de **hardcoding que discrimina ligas**.

A liga "Os Fuleros" (`6977a62071dee12036bb163e`) e tratada como cidada de segunda classe pelo codigo: nao aparece em nenhum fallback, nenhum `ligas_habilitadas`, e herda defaults pensados para SuperCartola (32 times, zonas G1-G11/Z1-Z11).

---

## A. Causa Raiz do Bug Reportado (Rodada presa no financeiro do App)

### Fluxo do bug

Quando o endpoint `/api/cartola/mercado/status` retorna `rodada_atual` corretamente, funciona para todas as ligas (API global). Porem, quando ha qualquer falha de rede, timeout ou cache stale, o fallback `= 38` assume e o sistema fica "preso" na rodada 38 (temporada anterior).

Para SuperCartola, isso passa despercebido (temporada 2025 teve 38 rodadas). Para Os Fuleros (liga nova, temporada 2026), rodada 38 nao existe e o financeiro nao tem dados.

### Arquivos criticos

| Arquivo | Linha | Hardcode |
|---------|-------|----------|
| `public/js/fluxo-financeiro/fluxo-financeiro-core.js` | 235 | `ultimaRodadaConsolidada = 38` |
| `public/js/fluxo-financeiro/fluxo-financeiro-core.js` | 245,364 | `rodadaFinal \|\| 38` |
| `public/participante/js/modules/participante-rodadas.js` | 26 | `rodadaAtualCartola = 38` |
| `public/participante/js/modules/participante-rodadas.js` | 103 | `fim=38` hardcoded na URL |
| `public/participante/js/modules/participante-rodadas.js` | 153 | `data.rodada_atual \|\| 38` |
| `public/js/fluxo-financeiro.js` | 187-188 | `rodadaAtual = 38; ultimaRodadaCompleta = 38` |

---

## B. Inventario Completo de Hardcoding

### CRITICO (Causa anomalia direta)

| # | Arquivo | Linha | Hardcode | Impacto |
|---|---------|-------|----------|---------|
| 1 | `fluxo-financeiro-core.js` | 235 | `ultimaRodadaConsolidada = 38` | MataMataMap carrega dados errados |
| 2 | `fluxo-financeiro-core.js` | 245,364 | `rodadaFinal \|\| 38` | Fallback assume 38 rodadas |
| 3 | `participante-extrato.js` | 69 | `RODADA_FINAL_CAMPEONATO = 38` | Constante global fixa |
| 4 | `participante-rodadas.js` | 26 | `rodadaAtualCartola = 38` | Default pre-fetch |
| 5 | `participante-rodadas.js` | 103 | `fim=38` hardcoded na URL | Busca ate R38 sempre |
| 6 | `fluxo-financeiro.js` (admin) | 187-188 | `= 38` no catch block | Assume 38 |
| 7 | `rodadas-config.js` | 221-254 | Funcoes sincronas so reconhecem 2 ligas | Os Fuleros pega 32 times |
| 8 | `config/rules/ranking_rodada.json` | 10 | `ligas_habilitadas` sem Os Fuleros | Regras nao se aplicam |
| 9 | `config/rules/ranking_geral.json` | 10 | `ligas_habilitadas` sem Os Fuleros | Idem |
| 10 | `config/rules/turno_returno.json` | 10 | `ligas_habilitadas` sem Os Fuleros | Idem |

### ALTO (Problema quando mais ligas entrarem)

| # | Arquivo | Linha | Hardcode |
|---|---------|-------|----------|
| 11 | `fluxo-financeiro-utils.js` | 9-10 | `ID_SUPERCARTOLA_2025`, `ID_CARTOLEIROS_SOBRAL` |
| 12 | `rodadas-config.js` | 80 | `RODADA_TRANSICAO_SOBRAL = 29` |
| 13 | `rodadas-config.js` | 98-100 | `LIGAS_CONFIG` com 2 IDs |
| 14 | `participante-historico.js` | 714-729 | `LIGA_SOBRAL_ID` + valores Top10 hardcoded |
| 15 | `participante-cache.js` | 11 | `RODADA_MAXIMA = 38` |
| 16 | `rodadas-ui.js` | 161 | `for (i = 1; i <= 38; i++)` |
| 17 | `analisar-participantes.js` | 745,866,881 | 3x loops ate 38 |
| 18 | `capitao-luxo.js` | 414 | `totalRodadas = 38` |
| 19 | `brasileirao-tabela.js` | 521 | Loop ate 38 |
| 20 | `participante-top10.js` | 17 | `RODADA_FINAL = 38` |
| 21 | `participante-artilheiro.js` | 16 | `RODADA_FINAL = 38` |
| 22 | `participante-luva-ouro.js` | 18 | `RODADA_FINAL = 38` |
| 23 | `participante-capitao.js` | 132,264 | `rodada >= 38`, `totalRodadas = 38` |
| 24 | `participante-home.js` | 1012 | `totalRodadas = 38` |
| 25 | `index.html` | 2009,2858 | `LIGA_SUPER_CARTOLA_ID` hardcoded 2x |
| 26 | `admin-resta-um.js` | 125,141,145,221 | 4x `38` hardcoded |

### MEDIO (Fallbacks que funcionam mas nao escalam)

| # | Arquivo | Linha | Hardcode |
|---|---------|-------|----------|
| 27 | `rodadas-config.js` | 52-69 | Fallback valores SuperCartola/Sobral |
| 28 | `POSICAO_CONFIG` | 286-341 | Labels MITO/MICO fixos por liga |
| 29 | `fluxo-financeiro-utils.js` | 11 | `RODADA_INICIAL_PONTOS_CORRIDOS = 7` |
| 30 | `participante-extrato-ui.js` | 68,78,81,165 | Fallback `\|\| 32` (4 locais) |
| 31 | `season-config.js` | 27 | `RODADA_FINAL_CAMPEONATO = 38` |
| 32 | `admin-config.js` | 143-148 | Faixas credito/debito para 32 |

---

## C. Backend (Correto)

| Componente | Status |
|-----------|--------|
| Orchestrator | OK — Consolida TODAS as ligas ativas |
| ConsolidacaoController | OK — Busca `liga.configuracoes` do MongoDB |
| Endpoint `/api/ligas/:id/configuracoes` | OK — Retorna config dinamica per-liga |
| `isModuloHabilitado()` | OK — Verifica `configuracoes + modulos_ativos` |
| ExtratoFinanceiroCache | OK — `ultima_rodada_consolidada` per-liga |
| Frontend `fetchLigaConfig()` | OK — Busca do servidor com cache TTL |

---

## D. Diagnostico "Os Fuleros"

A liga `6977a62071dee12036bb163e`:

1. **NAO esta em nenhum** `config/rules/*.json`
2. **NAO tem constantes** no frontend (so logo em `liga-logos.js`)
3. **NAO tem fallback** — cai nos defaults de SuperCartola (32 times)
4. **Orchestrator** a consolida normalmente
5. **Backend** retorna configs corretas via API
6. **Frontend funcoes sincronas** ignoram a API e retornam SuperCartola

---

## E. Recomendacao

### Fase 1 — Corrigir anomalia (URGENTE)
1. Substituir `= 38` defaults por valor da API
2. Funcoes sincronas de `rodadas-config.js` devem usar cache da config do servidor
3. Adicionar Os Fuleros aos `ligas_habilitadas` dos rules JSON

### Fase 2 — Eliminar hardcoding de 38
4. Criar constante `TOTAL_RODADAS_CAMPEONATO` vinda da API
5. Substituir todos os `38` literais

### Fase 3 — SaaS-ready
6. Eliminar constantes de liga no frontend
7. Tornar funcoes de `rodadas-config.js` assincronas
8. Remover logica `if (ligaId === SOBRAL)`
9. Mover `POSICAO_CONFIG` para o endpoint
