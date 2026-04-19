# Tesouraria Admin — Redesign (Lista Compacta + Chips Inline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tabela de 13+ colunas da tesouraria admin por uma lista compacta com chips inline, summary bar e filtros rápidos — mantendo o modal de extrato detalhado intacto.

**Architecture:** Alterar apenas camada de apresentação do módulo Fluxo Financeiro (admin). O pipeline de dados (`fluxo-financeiro-core.js` → API `/api/fluxo-financeiro`) já fornece `breakdown` com todos os valores por módulo e totais agregados; o trabalho é estritamente remoção de colunas + nova camada visual (chips, summary bar, filter pills) consumindo esse mesmo dataset client-side.

**Tech Stack:** Vanilla JS (ES6 modules), CSS custom properties (tokens em `public/css/_admin-tokens.css`), Material Icons. Zero novas dependências.

**Spec de referência:** [`docs/superpowers/specs/2026-04-17-tesouraria-admin-redesign.md`](../specs/2026-04-17-tesouraria-admin-redesign.md)

---

## Contexto crítico (leia antes de começar)

### Arquivos-alvo

| Arquivo | Papel | Linhas aprox. |
|---|---|---|
| `public/js/fluxo-financeiro/fluxo-financeiro-ui.js` | Render da tabela tesouraria — método `renderizarTabela` (cabeçalho inline ~L697-806) e `_renderizarLinhaTabela` (L1006-1130). | 5198 |
| `public/css/modules/fluxo-financeiro.css` | CSS do módulo tesouraria admin. | 3495 |
| `public/js/fluxo-financeiro/fluxo-financeiro-core.js` | Fonte da verdade financeira client-side — consome API e alimenta UI. | 1473 |
| `public/detalhe-liga.html` | Entry HTML do admin — carrega o CSS do módulo. | — |
| `public/js/detalhe-liga-orquestrador.js` | Carrega `fluxo-financeiro.js` via import dinâmico versionado. | — |

### Fluxo de render atual

- `renderizarTabela(ligaId, participantes, dadosSaldo)` (método em `FluxoFinanceiroUI`, L566+) escolhe entre duas variantes de linha conforme a temporada:
  - `temporadaNum >= 2026 && !this._temRodadasConsolidadas` → `_renderizarLinhaTabela2026` (**FORA DO ESCOPO** — layout de pré-temporada, 7 colunas, já enxuto).
  - caso contrário → `_renderizarLinhaTabela` (**ESTE É O ALVO** — 13+ colunas, muitos módulos).
- `this._temRodadasConsolidadas` é `true` quando **qualquer** participante tem `breakdown.banco/pontosCorridos/mataMata/top10 != 0` (L623-627). Na liga Super Cartola 2026 (temporada atual com rodadas em andamento) esse flag é `true`.
- O cabeçalho da tabela **não é um método separado** — está inline dentro do template literal de `renderizarTabela` (`else` branch em L756-782). Este plano trata header + linha como uma unidade lógica.

### Dados já disponíveis em `p` (participante) no render

```js
p = {
  time_id, id, nome_cartola, nome_time, url_escudo_png, contato, clube_id,
  saldoTemporada, saldoAcertos, saldoFinal, saldoFinalIntegrado,
  situacao,                       // 'devedor' | 'credor' | 'quitado'
  situacaoIntegrada,              // idem, após _aplicarIntegracoesTabela
  quantidadeAcertos,
  quitacao,                       // { quitado, data_quitacao, tipo, admin_responsavel }
  breakdown: {
    banco, pontosCorridos, mataMata, top10, melhorMes, artilheiro,
    luvaOuro, restaUm, capitaoLuxo, campos, acertos,
    saldoAnteriorTransferido,     // ← valor do 2025 transferido (+/−)
    taxaInscricao, pagouInscricao // ← campos de inscrição 2026
  }
}
```

**Totais já agregados** estão em `totaisIntegrados` (retornado por `_aplicarIntegracoesTabela` em L674): `totalAReceber`, `totalAPagar`, `quantidadeDevedores`, `quantidadeCredores`, `quantidadeQuitados`, `totalParticipantes`. A summary bar do spec mapeia 1:1 nesses campos — **não é necessário adicionar novo cálculo**.

### Derivação dos chips a partir de `breakdown`

| Chip (spec) | Fonte no código | Regra de aparição |
|---|---|---|
| `2025 ±X` | `breakdown.saldoAnteriorTransferido` | `Math.abs(valor) >= 1` |
| `Insc ✓` | `breakdown.pagouInscricao === true` OU `breakdown.saldoAnteriorTransferido >= breakdown.taxaInscricao` | booleano |
| `Insc −X` | `!inscricaoQuitada && breakdown.taxaInscricao > 0` | mostrar `−${taxaInscricao}` |
| `PC ±X` | `breakdown.pontosCorridos` | `Math.abs(valor) >= 1` |
| `MM ±X` | `breakdown.mataMata` | `Math.abs(valor) >= 1` |
| `RU −X` | `breakdown.restaUm` (só se < 0) | `breakdown.restaUm < -0.01` |
| `Pag +X` | `breakdown.acertos` (subtrair `taxaInscricao` se `pagouInscricao === true` p/ evitar contagem dupla com `Insc ✓`) | `valor > 0.01` |

> **Se algum campo de breakdown acima não existir para a temporada em teste**, tratar como `0` (chip não renderiza). Não tentar buscar de outra fonte — se faltar, é problema de backend fora do escopo deste plano.

### Regras do projeto (obrigatórias)

1. **Truncamento de pontos** — usar `truncarPontosNum()` em `window` ou `truncarPontos()`. NUNCA `Math.round`, `toFixed`, `parseFloat(x.toFixed(2))`. Para o saldo visível na linha usar `.toLocaleString('pt-BR', {maximumFractionDigits: 0})` após truncar.
2. **Multi-tenant** — nenhuma mudança aqui afeta queries; tudo é client-side.
3. **Tokens CSS** — zero cores hardcoded. Usar variáveis de `_admin-tokens.css` + novas vars definidas neste plano (Tarefa 1).
4. **Nunca `alert()`** — não aplicável aqui (não há alerts novos); se precisar sinalizar erro, usar toast existente.
5. **Cache busting** — após mudar CSS, bumpar `?v=` no `<link>` em `detalhe-liga.html`; após mudar JS carregado via import dinâmico, bumpar `?v10.3` em `detalhe-liga-orquestrador.js:1271` (`./fluxo-financeiro.js?v10.3`).
6. **Material Icons** — nunca emojis.
7. **Anti-Frankenstein** — antes de escrever CSS novo, conferir que as animações/tokens propostos não duplicam algo já existente em `_admin-tokens.css` e nas seções atuais de `fluxo-financeiro.css`.

### Ambiente

- Rodar admin localmente: `npm run dev` → acessar `http://localhost:PORT/detalhe-liga.html?id=684cb1c8af923da7c7df51de` (Liga Super Cartola 2026, 35 participantes).
- Para forçar reload após mudança de CSS/JS: **Ctrl+Shift+R** no navegador.

---

## Plano de Execução

### Task 1: Anti-Frankenstein Pre-Flight (tokens + registry)

**Files:**
- Read: `public/css/_admin-tokens.css`
- Read: `config/css-registry.json`

- [ ] **Step 1: Auditar tokens existentes**

Ler `public/css/_admin-tokens.css` e listar quais variáveis já cobrem:
- Verde sucesso / credor
- Vermelho erro / devedor
- Azul info
- Laranja destaque
- Cinza neutro/border

Comparar com as 15 variáveis de chip do spec. Reaproveitar tokens existentes sempre que cobrirem o mesmo valor semântico.

Produzir uma tabela em markdown (inline, nesta task) tipo:

```
--chip-crédito-bg        → reaproveitar --color-success-bg se existir
--chip-crédito-text      → reaproveitar --color-success-text
--chip-débito-bg         → reaproveitar --color-danger-bg
(...)
```

Não criar variáveis novas que dupliquem tokens já disponíveis.

- [ ] **Step 2: Verificar que `fluxo-financeiro.css` está no registry**

Confirmar linha 147 de `config/css-registry.json`:
```json
{ "path": "public/css/modules/fluxo-financeiro.css", "loadedBy": ["detalhe-liga.html"], ... }
```
Se estiver OK, nada a fazer. Se não estiver, abortar e sinalizar — o registry é fonte da verdade.

- [ ] **Step 3: Commit da auditoria (vazio — só planejamento)**

Não há commit — isto é uma leitura. A saída da Task 1 é a lista consolidada de tokens a usar na Task 2.

---

### Task 2: CSS — Tokens e Chips

**Files:**
- Modify: `public/css/modules/fluxo-financeiro.css` (anexar seção nova ao final)

- [ ] **Step 1: Adicionar seção de tokens de chips**

Anexar ao final de `public/css/modules/fluxo-financeiro.css` (antes de qualquer block de media queries finais, se houver):

```css
/* ============================================================
   TESOURARIA V10 — CHIPS INLINE
   Adicionado em 2026-04-18 — redesign tesouraria admin
   ============================================================ */

:root {
    --chip-credito-bg:      rgba(34, 197, 94, 0.12);
    --chip-credito-text:    #86efac;
    --chip-credito-border:  rgba(34, 197, 94, 0.25);

    --chip-debito-bg:       rgba(239, 68, 68, 0.15);
    --chip-debito-text:     #f87171;
    --chip-debito-border:   rgba(239, 68, 68, 0.30);

    --chip-neutro-bg:       rgba(148, 163, 184, 0.10);
    --chip-neutro-text:     #94a3b8;
    --chip-neutro-border:   rgba(148, 163, 184, 0.20);

    --chip-2025-bg:         rgba(99, 102, 241, 0.15);
    --chip-2025-text:       #818cf8;
    --chip-2025-border:     rgba(99, 102, 241, 0.30);

    --chip-ru-bg:           rgba(249, 115, 22, 0.12);
    --chip-ru-text:         #fdba74;
    --chip-ru-border:       rgba(249, 115, 22, 0.25);
}

[data-theme="light"] {
    --chip-credito-bg:      rgba(22, 163, 74, 0.10);
    --chip-credito-text:    #15803d;
    --chip-credito-border:  rgba(22, 163, 74, 0.25);

    --chip-debito-bg:       rgba(220, 38, 38, 0.10);
    --chip-debito-text:     #b91c1c;
    --chip-debito-border:   rgba(220, 38, 38, 0.25);

    --chip-neutro-bg:       rgba(71, 85, 105, 0.08);
    --chip-neutro-text:     #475569;
    --chip-neutro-border:   rgba(71, 85, 105, 0.18);

    --chip-2025-bg:         rgba(79, 70, 229, 0.10);
    --chip-2025-text:       #4338ca;
    --chip-2025-border:     rgba(79, 70, 229, 0.25);

    --chip-ru-bg:           rgba(234, 88, 12, 0.10);
    --chip-ru-text:         #c2410c;
    --chip-ru-border:       rgba(234, 88, 12, 0.25);
}
```

> Se na Task 1 você identificou que `--color-success-bg` (ou equivalente) já existe e cobre o mesmo valor, **substitua o literal** pela `var(--color-success-bg)` na declaração dos tokens `--chip-*`. Só crie literais novos para cores que não têm equivalente no sistema.

- [ ] **Step 2: Adicionar classes de chip**

Ainda em `fluxo-financeiro.css`, imediatamente após a seção de tokens:

```css
/* Container de chips dentro da linha */
.participante-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex: 1;
    min-width: 0;
}

/* Chip base */
.chip-tes {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    border: 1px solid var(--chip-neutro-border);
    background: var(--chip-neutro-bg);
    color: var(--chip-neutro-text);
    transition: transform 0.15s ease;
}

.chip-tes:hover {
    transform: translateY(-1px);
}

.chip-tes .chip-label {
    opacity: 0.7;
    font-weight: 500;
}

/* Variantes */
.chip-tes.chip-credito {
    background: var(--chip-credito-bg);
    color: var(--chip-credito-text);
    border-color: var(--chip-credito-border);
}

.chip-tes.chip-debito {
    background: var(--chip-debito-bg);
    color: var(--chip-debito-text);
    border-color: var(--chip-debito-border);
}

.chip-tes.chip-2025 {
    background: var(--chip-2025-bg);
    color: var(--chip-2025-text);
    border-color: var(--chip-2025-border);
}

.chip-tes.chip-ru {
    background: var(--chip-ru-bg);
    color: var(--chip-ru-text);
    border-color: var(--chip-ru-border);
}

.chip-tes .material-icons {
    font-size: 12px;
    line-height: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/css/modules/fluxo-financeiro.css
git commit -m "feat(tesouraria): adicionar tokens e classes de chips inline"
```

---

### Task 3: CSS — Summary Bar e Filter Pills

**Files:**
- Modify: `public/css/modules/fluxo-financeiro.css`

- [ ] **Step 1: Adicionar CSS da summary bar**

Anexar após a seção de chips criada na Task 2:

```css
/* ============================================================
   TESOURARIA V10 — SUMMARY BAR (4 stat-boxes)
   ============================================================ */

.tesouraria-summary-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 16px 0 12px;
}

.tesouraria-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    border-radius: 10px;
    background: var(--bg-secondary, rgba(255,255,255,0.03));
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
}

.tesouraria-stat__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #9ca3af);
}

.tesouraria-stat__value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.1;
}

.tesouraria-stat.is-areceber   .tesouraria-stat__value { color: var(--chip-credito-text); }
.tesouraria-stat.is-apagar     .tesouraria-stat__value { color: var(--chip-debito-text); }
.tesouraria-stat.is-devedores  .tesouraria-stat__value { color: var(--chip-ru-text); }
.tesouraria-stat.is-credores   .tesouraria-stat__value { color: var(--chip-2025-text); }

@media (max-width: 768px) {
    .tesouraria-summary-bar {
        grid-template-columns: repeat(2, 1fr);
    }
}
```

- [ ] **Step 2: Adicionar CSS dos filter pills**

Anexar logo abaixo:

```css
/* ============================================================
   TESOURARIA V10 — FILTER PILLS
   ============================================================ */

.tesouraria-filtros {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 12px;
    padding: 8px;
    border-radius: 10px;
    background: var(--bg-secondary, rgba(255,255,255,0.02));
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
}

.tesouraria-filtro {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary, #94a3b8);
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.tesouraria-filtro:hover {
    background: var(--chip-neutro-bg);
    color: var(--text-primary, #e2e8f0);
}

.tesouraria-filtro.is-active {
    background: var(--laranja, #FF5500);
    color: #fff;
    border-color: var(--laranja, #FF5500);
}

.tesouraria-filtro .contador {
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(0,0,0,0.25);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
}
```

- [ ] **Step 3: Adicionar estilos da linha compacta**

Anexar:

```css
/* ============================================================
   TESOURARIA V10 — LINHA COMPACTA (substitui 13 colunas)
   ============================================================ */

.fluxo-participantes-tabela.tesouraria-v10 tbody tr {
    transition: background 0.15s ease;
}

.fluxo-participantes-tabela.tesouraria-v10 tbody tr:hover {
    background: var(--chip-neutro-bg);
}

.fluxo-participantes-tabela.tesouraria-v10 .col-chips {
    padding: 8px 12px;
}

.fluxo-participantes-tabela.tesouraria-v10 .col-saldo-v10 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 700;
    text-align: right;
    min-width: 90px;
    white-space: nowrap;
}

.fluxo-participantes-tabela.tesouraria-v10 .col-saldo-v10.val-positivo { color: var(--chip-credito-text); }
.fluxo-participantes-tabela.tesouraria-v10 .col-saldo-v10.val-negativo { color: var(--chip-debito-text); }

/* Ocultar filter pills quando não aplicáveis (ex: pré-temporada) */
.tesouraria-filtros[hidden] { display: none !important; }
```

- [ ] **Step 4: Commit**

```bash
git add public/css/modules/fluxo-financeiro.css
git commit -m "feat(tesouraria): adicionar estilos summary bar, filter pills e linha v10"
```

---

### Task 4: JS — Helper `_derivarChips(p)` em ui.js

**Files:**
- Modify: `public/js/fluxo-financeiro/fluxo-financeiro-ui.js` (adicionar método privado logo acima de `_renderizarLinhaTabela`, ~L1005)

- [ ] **Step 1: Adicionar método helper**

Inserir novo método na classe `FluxoFinanceiroUI`, imediatamente antes de `_renderizarLinhaTabela(p, idx, ligaId) {`:

```js
    /**
     * v10: Deriva array de chips para uma linha a partir do breakdown.
     * Cada chip renderiza somente se valor relevante (|v| >= 1 ou flag boolean).
     * Truncamento: usa Math.trunc para não arredondar.
     * @param {object} p - participante
     * @returns {string} HTML dos chips concatenados
     */
    _derivarChips(p) {
        const b = p.breakdown || {};
        const fmtInt = (v) => {
            const truncado = Math.trunc(v);
            const sinal = truncado > 0 ? '+' : truncado < 0 ? '−' : '';
            const abs = Math.abs(truncado).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
            return `${sinal}${abs}`;
        };
        const chip = (cls, label, valorTxt) =>
            `<span class="chip-tes ${cls}"><span class="chip-label">${label}</span>${valorTxt}</span>`;
        const chips = [];

        // 2025 transferido
        const v2025 = b.saldoAnteriorTransferido || 0;
        if (Math.abs(v2025) >= 1) {
            const cls = v2025 > 0 ? 'chip-2025' : 'chip-debito';
            chips.push(chip(cls, '2025', fmtInt(v2025)));
        }

        // Inscrição
        const taxa = b.taxaInscricao || 0;
        const pagouDireto = b.pagouInscricao === true;
        const saldoCobriu = v2025 >= taxa && taxa > 0;
        const quitada = pagouDireto || saldoCobriu;
        if (taxa > 0) {
            if (quitada) {
                chips.push(chip('chip-credito', 'Insc', '<span class="material-icons">check</span>'));
            } else {
                chips.push(chip('chip-debito', 'Insc', fmtInt(-taxa)));
            }
        }

        // Pontos Corridos
        const pc = b.pontosCorridos || 0;
        if (Math.abs(pc) >= 1) {
            chips.push(chip(pc > 0 ? 'chip-credito' : 'chip-debito', 'PC', fmtInt(pc)));
        }

        // Mata-Mata
        const mm = b.mataMata || 0;
        if (Math.abs(mm) >= 1) {
            chips.push(chip(mm > 0 ? 'chip-credito' : 'chip-debito', 'MM', fmtInt(mm)));
        }

        // Resta Um (só aparece se negativo — é punição)
        const ru = b.restaUm || 0;
        if (ru < -0.01) {
            chips.push(chip('chip-ru', 'RU', fmtInt(ru)));
        }

        // Pagamentos (acertos) — desconta taxa se já foi paga diretamente (evita double)
        let pag = b.acertos || 0;
        if (pagouDireto) pag = pag - taxa;
        if (pag > 0.01) {
            chips.push(chip('chip-credito', 'Pag', fmtInt(pag)));
        }

        return chips.join('');
    }
```

- [ ] **Step 2: Verificação manual — smoke test do helper**

No console do navegador (após recarga), rodar:
```js
const ui = window._fluxoUI || null;
const mockP = { breakdown: { saldoAnteriorTransferido: 150, taxaInscricao: 180, pagouInscricao: true, pontosCorridos: -51, mataMata: 0, restaUm: -2.27, acertos: 180 } };
console.log(ui?._derivarChips(mockP));
```

Esperado: string HTML com 4 chips (2025 +150, Insc ✓, PC −51, RU −2) e sem chip `Pag` (porque pagouDireto zerou o excedente).

> Se `window._fluxoUI` não existir, expor temporariamente via breakpoint ou logar dentro de `_derivarChips`. Não adicionar `window._fluxoUI` em código permanente — é só para debug.

- [ ] **Step 3: Commit**

```bash
git add public/js/fluxo-financeiro/fluxo-financeiro-ui.js
git commit -m "feat(tesouraria): adicionar helper _derivarChips para tesouraria v10"
```

---

### Task 5: JS — Substituir `_renderizarLinhaTabela` (versão v10 compacta)

**Files:**
- Modify: `public/js/fluxo-financeiro/fluxo-financeiro-ui.js` (L1006-1130, substituir corpo do método)

- [ ] **Step 1: Trocar o return statement do método**

Substituir todo o bloco de L1044-1128 (cálculo de `modulosCols` + return) por uma versão nova que produz a linha compacta. Manter intacta a preparação (L1007-1043: `timeId`, `saldoFinal`, `situacao`, `isNovato`, `badgeQuitado`, `escudoTimeCoracao`, `badges`).

Substituir **a partir da linha onde começa `// Colunas de módulos...` até o final do método `}` (antes do próximo `}` de classe)**:

```js
        // v10: Chips inline substituem colunas de módulos
        const chipsHtml = this._derivarChips(p);

        // Saldo: TRUNCAR (nunca arredondar) e formatar compacto em BRL sem casas decimais
        const saldoTruncado = Math.trunc(saldoFinal);
        const saldoSinal = saldoTruncado > 0 ? '+' : saldoTruncado < 0 ? '−' : '';
        const saldoAbs = Math.abs(saldoTruncado).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const saldoFormatado = `${saldoSinal}${saldoAbs}`;
        const classeSaldoV10 = saldoTruncado > 0 ? 'val-positivo' : saldoTruncado < 0 ? 'val-negativo' : '';

        // Flag para filtro "Insc. Pendente"
        const taxaInsc = p.breakdown?.taxaInscricao || 0;
        const pagouInsc = p.breakdown?.pagouInscricao === true;
        const saldoCobriuInsc = (p.breakdown?.saldoAnteriorTransferido || 0) >= taxaInsc && taxaInsc > 0;
        const inscPendente = taxaInsc > 0 && !pagouInsc && !saldoCobriuInsc;

        return `
            <tr class="linha-participante ${situacao === 'devedor' ? 'row-devedor' : ''} ${isNovato ? 'row-novato' : ''}"
                data-nome="${escapeHtml((p.nome_cartola || '').toLowerCase())}"
                data-time="${escapeHtml((p.nome_time || '').toLowerCase())}"
                data-time-id="${timeId}"
                data-saldo="${saldoTruncado}"
                data-situacao="${situacao}"
                data-insc-pendente="${inscPendente}"
                data-novato="${isNovato}">
                <td class="col-num">${idx + 1}</td>
                <td class="col-participante">
                    <div class="participante-cell" onclick="window.selecionarParticipante('${timeId}')">
                        <div class="avatar-mini">
                            ${p.url_escudo_png
                                ? `<img src="${p.url_escudo_png}" alt="" onerror="this.style.display='none'">`
                                : `<span class="material-icons">person</span>`
                            }
                        </div>
                        <div class="info-participante">
                            <span class="nome">${escapeHtml(p.nome_cartola || 'N/D')} ${badgeNovato}</span>
                            <span class="time">${escapeHtml(p.nome_time || '-')}</span>
                        </div>
                    </div>
                </td>
                <td class="col-chips">
                    <div class="participante-chips">${chipsHtml}</div>
                </td>
                <td class="col-saldo-v10 ${isQuitado ? 'quitado' : classeSaldoV10}">
                    ${isQuitado
                        ? `<strong>0</strong> ${badgeQuitado}`
                        : `<strong>${saldoFormatado}</strong>`
                    }
                </td>
                <td class="col-acoes">
                    <div class="acoes-row">
                        <button onclick="window.selecionarParticipante('${timeId}')"
                                class="btn-acao btn-extrato" title="Ver Extrato">
                            <span class="material-icons">receipt_long</span>
                        </button>
                        <button onclick="window.abrirAuditoriaFinanceira('${timeId}', '${ligaId}', '${escapeHtml((p.nome_cartola || '').replace(/'/g, "\\'"))}')"
                                class="btn-acao btn-auditoria" title="Auditoria Financeira">
                            <span class="material-icons">fact_check</span>
                        </button>
                        ${(() => {
                            const tempAtual = window.temporadaAtual || CURRENT_SEASON;
                            const tempRenovacao = window.temporadaRenovacao || CURRENT_SEASON;
                            const isTemporadaRenovacao = tempAtual >= (tempRenovacao - 1);
                            const mostrarBotaoQuitar = !isQuitado && Math.abs(saldoFinal) >= 0.01 && !isTemporadaRenovacao;
                            return mostrarBotaoQuitar ? `
                            <button onclick="window.abrirModalQuitacao('${ligaId}', '${timeId}', ${saldoFinal}, ${tempAtual}, '${escapeHtml((p.nome_cartola || '').replace(/'/g, "\\'"))}')"
                                    class="btn-acao btn-quitar" title="Quitar ${tempAtual}">
                                <span class="material-icons">lock</span>
                            </button>
                            ` : '';
                        })()}
                        ${p.contato ? `
                        <button onclick="window.abrirWhatsApp('${p.contato.replace(/'/g, "\\'")}', '${escapeHtml((p.nome_cartola || '').replace(/'/g, "\\'"))}')"
                                class="btn-acao btn-whatsapp" title="Enviar WhatsApp para ${escapeHtml(p.nome_cartola || 'participante')}">
                            <span class="material-icons">chat</span>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }
```

> **Importante:** o método `_renderizarLinhaTabela` original tem também o bloco opcional `${(window.temporadaAtual || 0) < 2026 ? '<td class="col-2026">...'}`. Este bloco foi **removido** na versão v10 porque a coluna "2026" (badge de renovação) também entra no escopo das 11 colunas removidas pelo spec. Se o usuário quiser preservá-la, é fora de escopo — levantar e perguntar antes de removê-la.

- [ ] **Step 2: Verificar visualmente**

Reiniciar servidor dev, Ctrl+Shift+R. Abrir `detalhe-liga.html?id=684cb1c8af923da7c7df51de`, aba Financeiro, temporada 2026. Confirmar:
- Linhas aparecem com avatar + nome + chips + saldo + botões.
- Chips têm cores corretas (verde/vermelho/azul/laranja).
- Saldo está truncado (sem casas decimais — ex: `+1.394`, não `+1.394,29`).
- Nenhum `alert()` disparado ao abrir a página.

Se aparecer erro no console (`_derivarChips is not a function` ou similar), revisar Task 4 (método não foi salvo no mesmo arquivo).

- [ ] **Step 3: Commit**

```bash
git add public/js/fluxo-financeiro/fluxo-financeiro-ui.js
git commit -m "feat(tesouraria): substituir linha por layout compacto com chips inline (v10)"
```

---

### Task 6: JS — Novo header + summary bar + filter pills no `renderizarTabela`

**Files:**
- Modify: `public/js/fluxo-financeiro/fluxo-financeiro-ui.js` (método `renderizarTabela`, ~L697-806)

- [ ] **Step 1: Substituir o header de 13+ colunas (branch do `else`)**

Localizar o template literal inline no método `renderizarTabela`. O branch do `else` (quando NÃO é pré-temporada 2026) começa em L756 (`<!-- Header com colunas de módulos ... -->`) e vai até L782 (`</tr>`). **Substituir esse bloco inteiro** por:

```html
                        <!-- Header Tesouraria V10 — compacto -->
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-participante sortable" onclick="window.ordenarTabelaFinanceiro('nome')" data-sort="nome">
                                <span class="th-sort">Participante <span class="material-icons sort-icon">unfold_more</span></span>
                            </th>
                            <th class="col-chips">Movimentação</th>
                            <th class="col-saldo-v10 sortable" onclick="window.ordenarTabelaFinanceiro('saldo')" data-sort="saldo">
                                <span class="th-sort">Saldo <span class="material-icons sort-icon">unfold_more</span></span>
                            </th>
                            <th class="col-acoes">Ações</th>
                        </tr>
```

- [ ] **Step 2: Adicionar class `tesouraria-v10` à tabela**

Na mesma função, encontrar:
```js
<table class="fluxo-participantes-tabela tabela-financeira">
```
(aprox. L736) e trocar por:
```js
<table class="fluxo-participantes-tabela tabela-financeira ${temporadaNum >= 2026 && this._temRodadasConsolidadas ? 'tesouraria-v10' : ''}">
```

> A classe só é aplicada quando estamos no novo layout v10 (temporada corrente com rodadas) — evita quebrar o pré-temporada (que continua usando layout 2026 antigo).

- [ ] **Step 3: Inserir summary bar e filter pills entre o toolbar e a tabela**

Localizar, ainda dentro de `renderizarTabela`, o fim do bloco `<div class="module-toolbar fluxo-toolbar-v9">...</div>` (~L732) e o começo do `<!-- Tabela Financeira v4.2 ... -->` (~L734). Inserir entre eles:

```js
            ${temporadaNum >= 2026 && this._temRodadasConsolidadas ? `
            <!-- Tesouraria V10: summary bar + filtros -->
            <div class="tesouraria-summary-bar">
                <div class="tesouraria-stat is-areceber">
                    <span class="tesouraria-stat__label">A Receber</span>
                    <span class="tesouraria-stat__value">${formatarMoedaBR(totais.totalAReceber)}</span>
                </div>
                <div class="tesouraria-stat is-apagar">
                    <span class="tesouraria-stat__label">A Pagar</span>
                    <span class="tesouraria-stat__value">${formatarMoedaBR(totais.totalAPagar)}</span>
                </div>
                <div class="tesouraria-stat is-devedores">
                    <span class="tesouraria-stat__label">Devedores</span>
                    <span class="tesouraria-stat__value">${totais.quantidadeDevedores || 0}</span>
                </div>
                <div class="tesouraria-stat is-credores">
                    <span class="tesouraria-stat__label">Credores</span>
                    <span class="tesouraria-stat__value">${totais.quantidadeCredores || 0}</span>
                </div>
            </div>
            <div class="tesouraria-filtros" role="group" aria-label="Filtros rápidos">
                <button type="button" class="tesouraria-filtro is-active" data-filtro="todos" onclick="window.filtrarTesouraria('todos')">
                    Todos <span class="contador">${totais.totalParticipantes || 0}</span>
                </button>
                <button type="button" class="tesouraria-filtro" data-filtro="devedores" onclick="window.filtrarTesouraria('devedores')">
                    Devedores <span class="contador">${totais.quantidadeDevedores || 0}</span>
                </button>
                <button type="button" class="tesouraria-filtro" data-filtro="credores" onclick="window.filtrarTesouraria('credores')">
                    Credores <span class="contador">${totais.quantidadeCredores || 0}</span>
                </button>
                <button type="button" class="tesouraria-filtro" data-filtro="insc-pendente" onclick="window.filtrarTesouraria('insc-pendente')">
                    Insc. Pendente
                </button>
                <button type="button" class="tesouraria-filtro" data-filtro="saldo-desc" onclick="window.filtrarTesouraria('saldo-desc')">
                    <span class="material-icons" style="font-size:14px">sort</span> Saldo ↓
                </button>
            </div>
            ` : ''}
```

- [ ] **Step 4: Verificação visual**

Recarregar página. Confirmar:
- Summary bar aparece com 4 boxes — A Receber, A Pagar, Devedores, Credores — com números coerentes.
- Filter pills aparecem logo abaixo, "Todos" destacado.
- Tabela abaixo tem só 5 colunas: #, Participante, Movimentação, Saldo, Ações.
- Nenhum erro de console. Dark mode preserva cores.

- [ ] **Step 5: Commit**

```bash
git add public/js/fluxo-financeiro/fluxo-financeiro-ui.js
git commit -m "feat(tesouraria): header compacto + summary bar + filter pills v10"
```

---

### Task 7: JS — Handler `window.filtrarTesouraria` (client-side)

**Files:**
- Modify: `public/js/fluxo-financeiro/fluxo-financeiro-ui.js` (adicionar registro de handler no final de `renderizarTabela` ou em `_registrarFuncoesGlobais*`)

- [ ] **Step 1: Criar handler global**

Procurar onde outros `window.xxx` são registrados (ex: `window.ordenarTabelaFinanceiro` já existe — busque por `window.ordenarTabelaFinanceiro =` ou similar). Adicionar bloco de código no mesmo lugar (preferencialmente dentro de `_registrarFuncoesGlobaisAcerto` para manter padrão, OU em método novo `_registrarFuncoesGlobaisTesouraria()` chamado a partir de `renderizarTabela`):

```js
    /**
     * v10: Filtros client-side da tesouraria.
     * Aplica visibilidade via data-attributes na <tbody>.
     */
    _registrarFuncoesGlobaisTesouraria() {
        if (window._filtrarTesourariaRegistered) return;
        window._filtrarTesourariaRegistered = true;

        let filtroAtual = 'todos';

        const aplicar = () => {
            const tbody = document.getElementById('participantesTableBody');
            if (!tbody) return;
            const linhas = [...tbody.querySelectorAll('tr.linha-participante')];

            // Visibilidade
            linhas.forEach((tr) => {
                const sit = tr.dataset.situacao || '';
                const inscPend = tr.dataset.inscPendente === 'true';
                let visivel = true;
                if (filtroAtual === 'devedores')     visivel = sit === 'devedor';
                else if (filtroAtual === 'credores') visivel = sit === 'credor';
                else if (filtroAtual === 'insc-pendente') visivel = inscPend;
                tr.style.display = visivel ? '' : 'none';
            });

            // Ordenação (toggle)
            if (filtroAtual === 'saldo-desc') {
                const ordenadas = linhas.sort((a, b) => {
                    const sa = Math.abs(Number(a.dataset.saldo) || 0);
                    const sb = Math.abs(Number(b.dataset.saldo) || 0);
                    return sb - sa;
                });
                ordenadas.forEach((tr) => tbody.appendChild(tr));
            }
        };

        window.filtrarTesouraria = (filtro) => {
            filtroAtual = filtro;
            document.querySelectorAll('.tesouraria-filtro').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.filtro === filtro);
            });
            aplicar();
        };
    }
```

- [ ] **Step 2: Invocar o registrador**

Ao final de `renderizarTabela`, após o `injetarEstilosWrapper()` / `_aplicarStickyHeader()` (~L812-818), adicionar:

```js
        this._registrarFuncoesGlobaisTesouraria();
```

- [ ] **Step 3: Verificação manual**

Recarregar página, clicar em cada filter pill. Esperado:
- "Todos" → todas as linhas visíveis.
- "Devedores" → só linhas `row-devedor` visíveis, contagem bate com `totais.quantidadeDevedores`.
- "Credores" → só credores.
- "Insc. Pendente" → só quem tem `data-insc-pendente="true"`.
- "Saldo ↓" → linhas reordenam por saldo absoluto decrescente.

- [ ] **Step 4: Commit**

```bash
git add public/js/fluxo-financeiro/fluxo-financeiro-ui.js
git commit -m "feat(tesouraria): handler de filtros client-side v10"
```

---

### Task 8: Cache Busting

**Files:**
- Modify: `public/detalhe-liga.html`
- Modify: `public/js/detalhe-liga-orquestrador.js`

- [ ] **Step 1: Bumpar CSS do módulo**

Em `public/detalhe-liga.html` L36, trocar:
```html
<link rel="stylesheet" href="css/modules/fluxo-financeiro.css" />
```
por:
```html
<link rel="stylesheet" href="css/modules/fluxo-financeiro.css?v=10.0" />
```

- [ ] **Step 2: Bumpar JS do fluxo**

Em `public/js/detalhe-liga-orquestrador.js` L1271, trocar:
```js
"./fluxo-financeiro.js?v10.3"
```
por:
```js
"./fluxo-financeiro.js?v10.4"
```

- [ ] **Step 3: Verificar**

Recarregar com Ctrl+Shift+R. Abrir DevTools → Network → procurar `fluxo-financeiro.css?v=10.0` e `fluxo-financeiro.js?v10.4`. Ambas devem retornar 200 (não 304 de cache estável).

- [ ] **Step 4: Commit**

```bash
git add public/detalhe-liga.html public/js/detalhe-liga-orquestrador.js
git commit -m "chore(tesouraria): cache-bust CSS v=10.0 e JS v10.4"
```

---

### Task 9: Verificação end-to-end

**Files:** nenhum — só verificação.

- [ ] **Step 1: Checklist visual (dark mode)**

Acessar `http://localhost:PORT/detalhe-liga.html?id=684cb1c8af923da7c7df51de`, aba **Financeiro**, temporada **2026**. Confirmar:

- [ ] Summary bar com 4 stats; valores batem com toolbar antigo (totalAReceber/totalAPagar/devedores/credores).
- [ ] Filter pills clicáveis; estado ativo aplica classe `is-active` (pill fica laranja).
- [ ] Tabela com **5 colunas** exatas: #, Participante, Movimentação, Saldo, Ações.
- [ ] Nenhuma das 11 colunas antigas (Timeline, P.Corridos, Mata-Mata, Top 10, Melhor Mês, Artilheiro, Luva Ouro, Resta Um, Cap. Luxo, Aj. Manuais, Acertos) aparece no DOM. Verificar no DevTools → Elements → procurar `data-modulo="pontosCorridos"` etc. Não deve haver.
- [ ] Chips aparecem apenas quando valor != 0. Exemplo: Urubu Play F.C. (SEM_INSCRICAO) NÃO deve ter chip `Insc`. FloriMengo FC deve ter `Insc −180` + `Pag +60`.
- [ ] Saldo truncado (sem casas decimais): Vitim `+1.394`, Mauricio `+1.129`, Raylson `−491`.
- [ ] Botão "Extrato" (ícone `receipt_long`) abre o modal existente de extrato detalhado — sem regressão.
- [ ] Nenhum `console.error`. Nenhum `alert()` disparado.

- [ ] **Step 2: Checklist visual (light mode)**

Abrir Configurações → Tema → Light. Voltar para Financeiro. Confirmar:
- [ ] Tokens `[data-theme="light"]` aplicados. Chips têm contrastes legíveis (ex: verde `#15803d` em fundo claro, não verde neon).
- [ ] Summary bar mantém legibilidade.
- [ ] Filter pills ativos visíveis.

- [ ] **Step 3: Checklist funcional — filtros**

- [ ] Clicar "Devedores": contagem visível bate com `totais.quantidadeDevedores`.
- [ ] Clicar "Credores": idem.
- [ ] Clicar "Insc. Pendente": apenas linhas com `data-insc-pendente="true"` visíveis. Validar contra script de auditoria anterior — devem ser participantes com `Insc −X` sem `Insc ✓`.
- [ ] Clicar "Saldo ↓": linhas reordenam por `|saldo|` decrescente. Raylson (−491) aparece antes de Jonney (−398), que aparece antes de Sir Gegé (−37). Vitim (+1.394) fica no topo junto com os maiores devedores (por absoluto).

- [ ] **Step 4: Sanidade com extrato modal**

Clicar no botão Extrato de Vitim. Modal abre com os mesmos dados de antes (Pontos Corridos, Mata-Mata, etc.) — redesign **não tocou** o modal. Se aparecer error ou dados incorretos, regredir e investigar — o modal não foi modificado.

- [ ] **Step 5: Pré-temporada não quebrou**

Clicar tab "2025" (se existir) ou forçar temporada onde `_temRodadasConsolidadas === false`. O layout antigo de pré-temporada (`_renderizarLinhaTabela2026`) deve continuar funcionando sem mudança visual.

Se todos os checks passam, prosseguir para commit final de release notes (se aplicável) ou abrir PR.

- [ ] **Step 6: Commit final (opcional — release note)**

Se o projeto usa CHANGELOG ou similar:

```bash
# (apenas se existir CHANGELOG.md — não criar arquivo se não houver)
git add CHANGELOG.md
git commit -m "docs: nota de release — redesign tesouraria v10"
```

Se não houver CHANGELOG no projeto, pular esta etapa.

---

## Resumo de Commits

| # | Task | Mensagem |
|---|------|----------|
| 1 | Task 2 | `feat(tesouraria): adicionar tokens e classes de chips inline` |
| 2 | Task 3 | `feat(tesouraria): adicionar estilos summary bar, filter pills e linha v10` |
| 3 | Task 4 | `feat(tesouraria): adicionar helper _derivarChips para tesouraria v10` |
| 4 | Task 5 | `feat(tesouraria): substituir linha por layout compacto com chips inline (v10)` |
| 5 | Task 6 | `feat(tesouraria): header compacto + summary bar + filter pills v10` |
| 6 | Task 7 | `feat(tesouraria): handler de filtros client-side v10` |
| 7 | Task 8 | `chore(tesouraria): cache-bust CSS v=10.0 e JS v10.4` |

## Critérios de Aceite Cobertos

| Critério (spec) | Task |
|---|---|
| Summary bar mostra totais corretos | Task 6 |
| Filtros funcionam client-side | Task 7 |
| Chips aparecem/somem por valor != 0 | Task 4 + 5 |
| Saldo usa truncagem (sem arredondamento) | Task 5 (usa `Math.trunc`) |
| Botão Extrato abre modal existente | Task 5 (preservado) |
| 11 colunas removidas do DOM | Task 5 + 6 |
| Dark + light mode | Task 2 (tokens duplicados) + Task 9 |
| Apenas tokens de `_admin-tokens.css` | Task 1 (auditoria) + Task 2 |
