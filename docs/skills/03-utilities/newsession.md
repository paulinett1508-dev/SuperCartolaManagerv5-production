# Skill: newsession

Handover para nova sessão — carrega contexto do trabalho em andamento e instrui próximos passos.

---

## STATUS ATUAL: 2026 — SISTEMA ESTÁVEL

**Data:** 01/03/2026
**Última ação:** Sessão de fixes Copa 2026 + CSP + imagens estádios. Commits `255fc01`, `dde4e3a`, `34550a5`, `e2d3290`.

**Pendências abertas:** Nenhuma. Ver `.claude/pending-tasks.md`.

---

## SESSÃO 01/03/2026 — FIXES COPA 2026 + CSP

| Fix | Arquivo | Commit |
|-----|---------|--------|
| CSP `font-src` + `db.onlinewebfonts.com` (fontes F1 Tiro Certo) | `middleware/security.js` | `255fc01` |
| `copa-mundo-2026.css` ausente no SPA | `public/participante/index.html` | `dde4e3a` |
| Imagens estádios — URLs Wikipedia com 404, baixadas localmente via API+proxy | `public/img/estadios/` + `config/copa-do-mundo-2026.js` + SW v29 | `34550a5` |
| `pending-tasks.md` zerado | `.claude/pending-tasks.md` | `e2d3290` |

---

## SESSÃO 18/02/2026 — AUDITORIA INSCRIÇÕES + BANCO ÚNICO

**Última ação:** Fix bug inscrição 2026 — débitos faltantes inseridos + código corrigido + não-renovantes inativos. Commit `5343052`.

### Fixes aplicados (resumo)

| Módulo | Score antes → depois | Commits |
|--------|---------------------|---------|
| Top 10 | 82→92 | `fd14c11` |
| Melhor Mês | 78→90 | `fd14c11` |
| Campinho | 88/100 — sem fixes | — |
| Dicas Premium | 87/100 — sem fixes | — |
| Pontos Corridos | 82→93 | `ec2a48f` |
| Mata-Mata | 91→95 | `21d8e5d` |
| Luva de Ouro | 73→91 | `012ede2` |
| Capitão de Luxo | 80→92 | `6412d2b`, `6b214c9` |
| Artilheiro | 70→90 | `68acaaf`, `0824f17`, `900b38e` |

### Correções financeiras / infraestrutura

- Fix `criarTransacoesIniciais` — `liga_id` como String em `extratofinanceirocaches`
- `saldo-calculator.js` — `!= false` → `=== true` (linhas 158 e 287)
- Banco único `cartola-manager` — `MONGO_URI_DEV` descontinuada
- Sincronismo 2025/2026 — `>= 2026` → `>= CURRENT_SEASON`

---

## DADOS DE REFERÊNCIA

**Liga principal:** Super Cartola 2026
- Liga ID: `684cb1c8af923da7c7df51de`
- Inscrição: R$ 180,00
- Owner: Paulinett Miranda (time_id: 13935277, premium: true)
- 35 participantes ativos

**Liga secundária:** Cartoleiros do Sobral — `684d821cf1a7ae16d1f89572`

**Liga Os Fuleros:** `6977a62071dee12036bb163e` — 8 inscritos

**Rodada atual Cartola:** R4 (temporada 2026)

---

## ARQUIVOS CRÍTICOS

| Arquivo | Papel | Status |
|---------|-------|--------|
| `utils/saldo-calculator.js` | Fonte da verdade financeira | OK (`=== true`) |
| `middleware/security.js` | CSP headers produção | OK (db.onlinewebfonts.com adicionado) |
| `config/copa-do-mundo-2026.js` | Dados Copa 2026 | OK (paths locais `/img/estadios/`) |
| `public/img/estadios/` | 16 imagens estádios | OK (baixadas 01/03/2026) |
| `public/participante/service-worker.js` | SW PWA | v29-20260301 |
| `public/participante/index.html` | SPA entry | OK (copa-mundo-2026.css incluído) |
| `public/participante/css/copa-mundo-2026.css` | CSS flip cards sedes | OK |
| `config/seasons.js` | Fonte da verdade temporada | CURRENT_SEASON = 2026 |
| `controllers/inscricoesController.js` | Inscrições temporada | OK (`!== true`, liga_id String) |

---

## SCHEMA CRÍTICO — TIPOS DE ID

| Collection | Campo liga | Tipo |
|---|---|---|
| `extratofinanceirocaches` | `liga_id` | **String** |
| `inscricoestemporada` | `liga_id` | ObjectId |
| `times` | `id` | Number |

**Regra:** NUNCA usar ObjectId em queries de `extratofinanceirocaches`. Sempre String.
