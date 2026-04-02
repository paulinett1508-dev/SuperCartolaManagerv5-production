# Redesign Visual dos Modulos - App Participante (v2.0)

> **Data:** 2026-04-02 | **Branch:** `claude/redesign-app-modules-I146h`
> **28 arquivos modificados** | 661 linhas adicionadas, 452 removidas

---

## Contexto

O app participante tinha modulos com visual desproporcional: hero cards grandes (64px icon, dot-grid, radial overlays, glow pulsante), emojis no lugar de icones profissionais, fontes oversized e zero suporte a modo claro.

O redesign profissionaliza ao nivel de apps esportivos de referencia (ESPN, SofaScore, FotMob): **faixa estreita impactante**, tipografia enxuta, cores discretas, suporte dark/light mode.

**Excecoes mantidas:** LPs de competicoes (Copa 2026, Libertadores, Copa Brasil, Copa NE, Copa Times SC) NAO foram alteradas.

---

## 1. Slim Strip (Novo Header de Modulo)

### Antes vs Depois

| Aspecto | Antes (Hero Card) | Depois (Slim Strip) |
|---------|-------------------|---------------------|
| Altura | ~200px+ variavel | 56px fixo |
| Icone | 64px circle wrap com glow | 20px inline, sem wrap |
| Titulo | Russo One 20px centralizado | Russo One 14px, uppercase, left-aligned |
| Tagline | 11px uppercase com letra-spacing 1.5px | 10px normal, truncate |
| Background | Gradiente duplo + dot-grid + radial overlays | `var(--app-surface)` limpo |
| Accent | Glow pulsante + box-shadow pesado | border-left 3px na cor do modulo |
| Fechar | Botao 32px circle | Botao 28px circle |

### Spec Visual

```
+--[3px accent]--[icon 20px]--[NOME DO MODULO (14px)]--[tagline (10px)]--[X]--+
|                              56px height, flex horizontal                     |
+------------------------------------------------------------------------------+
```

### CSS: `.module-lp-strip`

```css
.module-lp-strip {
    display: flex;
    align-items: center;
    gap: var(--app-space-3);          /* 10px */
    height: var(--app-strip-height);  /* 56px */
    padding: 0 var(--app-space-5);    /* 16px */
    background: var(--app-surface);
    border-left: var(--app-strip-accent-width) solid var(--lp-primary);
    border-bottom: 1px solid var(--app-border);
}
```

### Tokens Novos (`_app-tokens.css`)

```css
--app-strip-height: 56px;
--app-strip-icon-size: 20px;
--app-strip-title-size: var(--app-font-md);    /* 14px */
--app-strip-tagline-size: var(--app-font-xs);  /* 10px */
--app-strip-accent-width: 3px;
```

---

## 2. Modulos Afetados

### 2.1 Via LP Engine (12 modulos — mudanca automatica)

O `module-lp-engine.js` gera o strip para todos:

| Modulo | colorClass | `--lp-primary` | Icon |
|--------|-----------|----------------|------|
| Artilheiro | `module-lp-artilheiro` | verde `#22c55e` | `sports_soccer` |
| Capitao de Luxo | `module-lp-capitao` | roxo `#8b5cf6` | `stars` |
| Luva de Ouro | `module-lp-luva` | dourado `#ffd700` | `sports_handball` |
| Resta Um | `module-lp-resta-um` | rose `#f43f5e` | `warning` |
| Tiro Certo | `module-lp-tiro-certo` | laranja `#f97316` | `gps_fixed` |
| Mata-Mata | `module-lp-mata-mata` | vermelho `#ef4444` | `sports_kabaddi` |
| Melhor Mes | `module-lp-melhor-mes` | cyan `#06b6d4` | `calendar_month` |
| Top 10 | `module-lp-top10` | amarelo `#f59e0b` | `military_tech` |
| Ranking Geral | `module-lp-ranking-geral` | roxo `#8b5cf6` | `leaderboard` |
| Rodadas | `module-lp-ranking-rodada` | verde `#22c55e` | `event` |
| Pontos Corridos | `module-lp-pontos-corridos` | verde `#22c55e` | `format_list_numbered` |
| Raio-X | `module-lp-raio-x` | cyan `#06b6d4` | `sensors` |

### 2.2 Headers Proprios (tratados individualmente)

| Modulo | O que mudou |
|--------|-------------|
| **Home** | Hero card compactado: pontos 28px (era 36px), accent border lateral 3px (era blob glow 200px), border-radius 12px (era 16px) |
| **Historico** | Header trophy grande (64px icon) substituido por slim strip dourado (`hall-strip`) |
| **Ranking** | Header `.ranking-header-pro` removido (LP strip cobre); botao Share preservado inline |
| **Melhor Mes** | Header `.mm-header-pro` removido; badge edicoes preservado |
| **Rodadas** | Header `.rodadas-header-pro` + subtitle removidos |
| **Top 10** | Header `.top10-header-pro` + subtitle removidos |
| **Mata-Mata** | Header `.mm-header` removido; contagem participantes preservada |
| **Pontos Corridos** | Header "Liga Pontos Corridos" + subtitle removidos |

---

## 3. Accordions Redesenhados

Os accordions "Como Funciona" e "Premiacao" foram simplificados:

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Background | `var(--app-surface)` com border-radius | Transparente, sem radius |
| Border | `1px solid var(--app-border)` com border-radius | Apenas `border-bottom` |
| Label | Russo One 14px | Inter 11px, uppercase, letter-spacing 0.5px |
| Padding | `12px 16px` | `10px 16px` |
| Icon | 18px | 16px |
| Estilo | Card com cantos arredondados | Flat rows estilo iOS settings |

---

## 4. Color Scoping Simplificado

Cada modulo define apenas 3 variaveis (era 7):

```css
/* ANTES (v1.0) */
.module-lp-artilheiro {
    --lp-primary: ...;
    --lp-muted: ...;
    --lp-muted-strong: ...;     /* REMOVIDO */
    --lp-border: ...;
    --lp-gradient-hero: ...;    /* REMOVIDO */
    --lp-gradient-card: ...;    /* REMOVIDO */
    --lp-glow: ...;             /* REMOVIDO */
}

/* DEPOIS (v2.0) */
.module-lp-artilheiro {
    --lp-primary: var(--app-success-light, #22c55e);
    --lp-muted: rgba(34, 197, 94, 0.12);
    --lp-border: rgba(34, 197, 94, 0.25);
}
```

---

## 5. Light Mode

### Ativacao

- Via `[data-theme="light"]` no `<html>` (toggle manual)
- Via `@media (prefers-color-scheme: light)` (auto-detect se nenhuma preferencia salva)
- Persistencia: `localStorage('scm-theme')`

### Toggle

Localizado em **Configuracoes** (`configuracoes.html`):
- Secao "Aparencia" com switch visual
- Atualiza `data-theme` no `<html>` e `meta[name="theme-color"]`

### Tokens Light Mode (resumo)

| Token | Dark | Light |
|-------|------|-------|
| `--app-bg` | `#0a0a0a` | `#f5f5f5` |
| `--app-surface` | `#1a1a1a` | `#ffffff` |
| `--app-text-primary` | `#ffffff` | `#111111` |
| `--app-text-muted` | `rgba(255,255,255,0.6)` | `rgba(0,0,0,0.55)` |
| `--app-border` | `#333333` | `#e0e0e0` |
| `--app-shadow-md` | `0 4px 16px rgba(0,0,0,0.4)` | `0 2px 8px rgba(0,0,0,0.1)` |
| `--app-header-bg` | `rgba(10,10,10,0.8)` | `rgba(255,255,255,0.9)` |

### Prevencao FOUC

Script inline no `<head>` (antes de qualquer CSS):

```html
<script>
(function(){var t=localStorage.getItem('scm-theme');
if(t)document.documentElement.setAttribute('data-theme',t);})();
</script>
```

---

## 6. Eliminacao de Emojis

### UI Visivel

| Local | Emoji Removido | Substituicao |
|-------|---------------|--------------|
| Mata-mata campeao | `🏆` | `<span class="material-symbols-outlined">emoji_events</span>` |
| BADGES_CONFIG (15 badges) | `🏆🥈🥉⭐💀⚽🧤🎖📅⚔` | Nomes Material Icons |
| Manutencao penaltis | `⚽🧤` | `sports_soccer`, `sports_handball` |
| Manutencao leaderboard | `🥇🥈🥉` | `emoji_events`, `military_tech`, `workspace_premium` |
| Manutencao score | `⚽⭐` | Texto limpo sem emoji |

### BADGES_CONFIG (participante-config.js)

```javascript
// ANTES: icon era emoji string
campeao: { icon: "🏆", nome: "Campeao", cor: "var(--app-gold)" }

// DEPOIS: icon e nome de Material Icon
campeao: { icon: "emoji_events", nome: "Campeao", cor: "var(--app-gold)" }
```

**Consumers devem renderizar:**
```html
<span class="material-icons" style="color: ${badge.cor}">${badge.icon}</span>
```

---

## 7. Taglines Simplificadas

| Modulo | Antes (verboso) | Depois (conciso) |
|--------|-----------------|-------------------|
| Artilheiro | "Quem vai marcar mais gols na temporada?" | "Gols da temporada" |
| Capitao | "Quem vai liderar seu time a vitoria?" | "Pontuacao dos capitaes" |
| Luva de Ouro | "O melhor goleiro da liga" | "Ranking de goleiros" |
| Resta Um | "Sobreviva cada rodada ou seja eliminado" | "Eliminacao progressiva" |
| Tiro Certo | "Modo Survival — escolha o vencedor ou seja eliminado" | "Modo Survival" |
| Mata-Mata | "Eliminacao direta — perca e esteja fora" | "Eliminacao direta" |
| Melhor Mes | "Competicao mensal — uma nova chance a cada mes" | "Competicao mensal" |
| Top 10 | "Melhores e piores pontuacoes da liga" | "Mitos e micos da liga" |
| Ranking | "Classificacao acumulada de toda a temporada" | "Classificacao da temporada" |
| Rodadas | "Ganhe e perca baseado na sua posicao a cada rodada" | "Desempenho por rodada" |
| Pontos Corridos | "Campeonato interno estilo Brasileirao" | "Liga interna todos contra todos" |
| Raio-X | "Analise completa apos cada rodada" | "Analise pos-rodada" |

---

## 8. Arquivos Modificados

### CSS
- `public/participante/css/_app-tokens.css` — +148 linhas (light mode + strip tokens)
- `public/participante/css/module-lp.css` — Reescrito (strip + flat accordions + light mode)

### JS Engine
- `public/participante/js/modules/module-lp-engine.js` — Template HTML hero → strip

### HTML Fronts (8 arquivos)
- `ranking.html`, `melhor-mes.html`, `rodadas.html`, `top10.html`, `mata-mata.html`, `pontos-corridos.html` — Headers duplicados removidos
- `historico.html` — Header trophy → slim strip
- `home.html` — Hero card compactado
- `configuracoes.html` — Toggle de tema adicionado

### JS Modules (12 arquivos)
- Todos os `participante-*.js` — Taglines simplificadas

### Emojis (3 arquivos)
- `participante-config.js` — BADGES_CONFIG
- `participante-mata-mata.js` — Campeao trophy
- `manutencao-screen.js` — ~15 emojis

### Config
- `config/css-registry.json` — Features atualizadas
- `public/participante/index.html` — Theme init + cache bust CSS

---

## 9. Como Adicionar Novo Modulo

Para que um novo modulo use o strip pattern:

```javascript
import { injectModuleLP } from './module-lp-engine.js';

injectModuleLP({
    wrapperId:    'meu-modulo-lp-wrapper',
    insertBefore: 'meu-modulo-content',     // ID do container de conteudo
    ligaId:       ligaId,
    moduloKey:    'meu_modulo',              // chave para API regras-modulos
    titulo:       'Meu Modulo',              // exibido no strip
    tagline:      'Descricao curta',         // 2-3 palavras max
    icon:         'material_icon_name',      // nome do Material Icon
    colorClass:   'module-lp-meu-modulo',    // classe de color-scoping
});
```

E adicionar o color-scoping em `module-lp.css`:

```css
.module-lp-meu-modulo {
    --lp-primary: var(--app-info, #3b82f6);
    --lp-muted: rgba(59, 130, 246, 0.12);
    --lp-border: rgba(59, 130, 246, 0.25);
}
```

---

## 10. Backward Compatibility

O CSS mantem `.module-lp-hero` como alias para strip visuals (mesmas propriedades que `.module-lp-strip`). Pseudo-elements `::before` e `::after` do hero antigo estao desativados (`display: none`). Isso garante que qualquer modulo que ainda referencia classes hero funciona com o novo visual.
