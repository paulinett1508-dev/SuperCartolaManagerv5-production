# Spec: Redesign da Tesouraria Admin

**Data:** 2026-04-17
**Status:** Aprovado
**Liga:** Super Cartola Manager — Painel Admin

---

## Contexto

A tabela de tesouraria atual exibe 13+ colunas (Timeline, P.Corridos, Mata-Mata, Top 10, Melhor Mês, Artilheiro, Luva Ouro, Resta Um, Cap. Luxo, Aj. Manuais, Acertos, Saldo, Ações) que na prática não renderizam valores úteis nessa visão. O extrato detalhado (modal) já cobre o breakdown completo por módulo.

O objetivo é substituir esse formato por uma visão de **controle de tesouraria** — densa, visual, acionável — que sirva 3 propósitos simultâneos:
1. Ver rapidamente quem está devendo e quanto (cobrança)
2. Verificar saldo consolidado por participante (conciliação)
3. Navegar direto ao extrato detalhado de qualquer participante

---

## Arquivos Afetados

| Arquivo | Operação |
|---|---|
| `public/js/fluxo-financeiro/fluxo-financeiro-ui.js` | Substituir `_renderizarHeaderTabela()` e `renderizarLinhaTabela()` — remover colunas de módulos, adicionar chips inline |
| `public/css/modules/fluxo-financeiro.css` | Adicionar estilos de chips, summary bar e filtros |
| `public/js/fluxo-financeiro/fluxo-financeiro-core.js` | Adicionar cálculo de totais para summary bar |

---

## Design

### 1. Barra de Resumo (Summary Bar)

4 stat-boxes no topo da tabela, calculados client-side a partir dos dados já carregados:

| Stat | Cálculo | Cor |
|---|---|---|
| A Receber | Soma de saldos positivos | Verde |
| A Pagar | Soma de saldos negativos (abs) | Vermelho |
| Devedores | Count de participantes com saldo < 0 | Laranja |
| Credores | Count de participantes com saldo > 0 | Azul |

### 2. Filtros Rápidos

Pills clicáveis acima da lista — filtram a tabela client-side (sem request ao servidor):

- **Todos (N)** — padrão ativo
- **Devedores (N)**
- **Credores (N)**
- **Insc. Pendente** — participantes com ajuste de inscrição negativo sem acerto de pagamento correspondente
- **Ordenar: Saldo ↓** — toggle que ordena por saldo absoluto decrescente (devedores maiores primeiro)

### 3. Linha por Participante

```
[Avatar] [Nome (130px)] [Chips inline — flex, wrap] [Saldo (72px, right)] [Btn Extrato]
```

**Avatar:** inicial do nome, cor baseada em hash do time_id (reutilizar padrão existente se houver, senão gradient fixo por posição).

**Chips — regras de aparição (só renderiza se valor != 0):**

| Chip | Condição de aparição | Cor | Exemplo |
|---|---|---|---|
| `2025 +X` | ajuste com descricao contém "2025" e valor > 0 | Azul índigo | `2025 +1.524` |
| `2025 −X` | ajuste com descricao contém "2025" e valor < 0 | Vermelho claro | `2025 −209` |
| `Insc ✓` | existe acerto pagamento quitando inscrição integralmente | Verde | `Insc ✓` |
| `Insc −X` | ajuste de inscrição negativo sem quitação total | Vermelho | `Insc −180` |
| `PC ±X` | saldo de transações PONTOS_CORRIDOS no historico | Cinza azulado | `PC +51` |
| `MM ±X` | saldo de transações MATA_MATA no historico | Cinza azulado | `MM −14` |
| `RU −X` | ajuste com descricao contém "Resta Um" e valor < 0 | Laranja | `RU −2` |
| `Pag +X` | total de acertos tipo pagamento (exceto inscrição já mostrada) | Verde | `Pag +100` |

Chips com valor zero são omitidos. Chips com valor positivo mostram `+`, negativo mostram `−`.

**Saldo:** usar `truncarPontosNum()` para o valor numérico, formatar com `toLocaleString('pt-BR', {maximumFractionDigits: 0})` para exibição compacta (ex: `+1.394`). Nunca `Math.round()` nem `toFixed()`. Verde se positivo, vermelho se negativo.

**Botão Extrato:** abre o modal de extrato detalhado já existente — mesma chamada atual, sem mudança de comportamento.

### 4. Interação de Linha

Hover escurece levemente o fundo da linha. Nenhuma expansão inline — todo detalhe fica no modal do extrato.

---

## O Que É Removido

As seguintes colunas são **completamente removidas** da view de tabela (o dado segue acessível via modal do extrato):

Timeline · P.Corridos · Mata-Mata · Top 10 · Melhor Mês · Artilheiro · Luva Ouro · Resta Um · Cap. Luxo · Aj. Manuais · Acertos

---

## O Que É Mantido

- Modal de extrato detalhado (inalterado)
- Ordenação default (alfabética ou por saldo — mantém comportamento existente)
- Seletor de temporada
- Botões de ação existentes (editar ajuste, novo acerto, etc.) — mantidos como ícones compactos à direita do botão Extrato na mesma linha

---

## Tokens CSS

Usar exclusivamente variáveis de `_admin-tokens.css`. Cores de chips:

```css
--chip-crédito-bg:   rgba(34,197,94,0.12);
--chip-crédito-text: #86efac;
--chip-crédito-border: rgba(34,197,94,0.25);
--chip-débito-bg:    rgba(239,68,68,0.15);
--chip-débito-text:  #f87171;
--chip-débito-border: rgba(239,68,68,0.3);
--chip-neutro-bg:    rgba(148,163,184,0.10);
--chip-neutro-text:  #94a3b8;
--chip-neutro-border: rgba(148,163,184,0.20);
--chip-2025-bg:      rgba(99,102,241,0.15);
--chip-2025-text:    #818cf8;
--chip-2025-border:  rgba(99,102,241,0.30);
--chip-ru-bg:        rgba(249,115,22,0.12);
--chip-ru-text:      #fdba74;
--chip-ru-border:    rgba(249,115,22,0.25);
```

---

## Critério de Aceite

- [ ] Summary bar mostra totais corretos calculados do mesmo dataset da tabela
- [ ] Filtros funcionam client-side sem request adicional
- [ ] Chips aparecem/somem conforme regras de valor != 0
- [ ] Saldo usa `truncarPontos()` (sem arredondamento)
- [ ] Botão Extrato abre o mesmo modal existente
- [ ] Nenhuma das 11 colunas removidas aparece no DOM
- [ ] Funciona em dark mode e light mode (`[data-theme="light"]`)
- [ ] CSS usa apenas tokens de `_admin-tokens.css` — zero cores hardcoded

---

## Fora de Escopo

- Redesign do modal de extrato detalhado
- Mudanças no backend / API
- Animações de entrada de linha
- Paginação (35 participantes cabe em uma tela)
