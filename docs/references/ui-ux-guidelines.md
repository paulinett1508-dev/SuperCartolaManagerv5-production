# UI/UX Guidelines (Dark + Light Mode)

## Theme
- **Dark Mode** (default): OLED-safe `#0a0a0a` bg, `#1a1a1a` surface
- **Light Mode** (v2.0): `#f5f5f5` bg, `#ffffff` surface — ativado via toggle em Configuracoes
- Toggle: `[data-theme="light"]` no `<html>`, persistido em `localStorage('scm-theme')`
- Auto-detect: `@media (prefers-color-scheme: light)` quando sem preferencia salva
- Text: Primary `var(--app-text-primary)`, Muted `var(--app-text-muted)`
- Cards: `var(--app-surface)` com `var(--app-border)`
- Buttons: Explicit feedback (hover/active states)

## Module Strip (Header Padrao v2.0)
- **Slim strip 56px** para todos os modulos (substitui hero card grande)
- Accent border-left 3px na cor do modulo (`--lp-primary`)
- Icone Material 20px + Titulo Russo One 14px uppercase + Tagline Inter 10px
- Accordions flat estilo iOS (sem card, sem border-radius)
- Detalhes: [`docs/references/redesign-modulos-v2.md`](redesign-modulos-v2.md)

## Tipografia

| Uso | Fonte | CSS |
|-----|-------|-----|
| Títulos, Badges, Stats | Russo One | `font-family: 'Russo One', sans-serif;` |
| Corpo de texto | Inter | `font-family: 'Inter', -apple-system, sans-serif;` |
| Valores numéricos | JetBrains Mono | `font-family: 'JetBrains Mono', monospace;` |

## Cores dos Módulos (Identidade Visual)

Cada módulo possui sua paleta de cores padronizada. **Sempre use variáveis CSS** (definidas em `/css/_admin-tokens.css`):

| Módulo | Cor Primária | Variável CSS | Simbolismo |
|--------|--------------|--------------|------------|
| **Artilheiro Campeão** | Verde `#22c55e` | `--module-artilheiro-primary` | Gols / Vitória |
| **Capitão de Luxo** | Roxo `#8b5cf6` | `--module-capitao-primary` | Liderança / Capitania |
| **Luva de Ouro** | Dourado `#ffd700` | `--module-luva-primary` | Luva de Ouro / Goleiros |

**Exemplo de uso:**
```css
/* Header do módulo */
.artilheiro-header {
    background: var(--gradient-artilheiro);
    border: 1px solid var(--module-artilheiro-border);
}

/* Backgrounds sutis */
.capitao-card {
    background: var(--module-capitao-muted);
}
```

**Regra:** NUNCA use cores hardcoded (`#22c55e`) diretamente. Sempre use as variáveis CSS.

## Ícones (REGRA CRÍTICA)

**NUNCA use emojis no código.** Sempre use Material Icons com cores tematizadas via variáveis CSS.

| Contexto | Errado | Correto |
|----------|--------|---------|
| Indicador ganho | `🟢` | `<span class="material-icons" style="color: var(--app-success)">check_circle</span>` |
| Indicador perda | `🔴` | `<span class="material-icons" style="color: var(--app-danger)">cancel</span>` |
| Estrela/MITO | `⭐` | `<span class="material-icons" style="color: var(--app-warning)">star</span>` |
| Troféu | `🏆` | `<span class="material-icons" style="color: var(--app-danger)">emoji_events</span>` |
| Futebol | `⚽` | `<span class="material-icons" style="color: var(--app-indigo)">sports_soccer</span>` |
| Alvo/Posição | `🎯` | `<span class="material-icons" style="color: var(--app-primary)">casino</span>` |

**Motivos:**
1. Emojis renderizam diferente em cada OS/browser
2. Material Icons são vetoriais (escaláveis sem perda)
3. Cores podem ser tematizadas via CSS variables
4. Consistência visual em todo o sistema

## Skill frontend-design (AUTORIDADE ESTÉTICA MÁXIMA)

> Prioridade absoluta em qualquer decisão de design visual. Sobrepõe preferências genéricas.

Documentação completa: `docs/skills/02-specialists/frontend-design.md`

### Gatilhos de Ativação

| Categoria | Keywords |
|-----------|----------|
| **Telas / Entregáveis** | redesign, nova tela, nova página, nova home, landing, dashboard, painel, componente visual, card, banner, hero, layout |
| **Ações de design** | criar interface, redesenhar, melhorar visual, modernizar, deixar mais bonito, estilizar, visual do app |
| **Referências estéticas** | dark mode, tema, paleta, tipografia, animação, motion, responsivo, mobile-first, UX premium |
| **Specs do projeto** | SPEC-HOME-REDESIGN, redesign participante, redesign admin, nova home 2026 |

### Pilares estéticos obrigatórios

| Pilar | Diretriz do Projeto |
|-------|-------------------|
| **Tipografia** | Russo One (títulos/stats) + JetBrains Mono (números) + Inter (corpo). Nunca Arial, Roboto ou fontes genéricas. |
| **Cor & Tema** | Dark mode estrito. Usar variáveis CSS de `_admin-tokens.css`. Cores dos módulos (Verde Artilheiro, Roxo Capitão, Dourado Luva). |
| **Motion** | Animações de entrada escalonadas. Hover states que surpreendem. CSS-only por padrão. |
| **Composição** | Densidade visual otimizada (inspiração: dashboards fantasy premium). Hierarquia clara de dados. |
| **Fundos/Detalhes** | Gradients sutis, noise textures, sombras dramáticas, glassmorphism onde couber. Nunca fundo sólido genérico. |

### Proibições absolutas
- Fontes genéricas (Inter como display, Arial, system fonts)
- Gradientes roxos em fundo branco (clichê AI)
- Layouts previsíveis sem caráter
- Emojis no código (usar Material Icons com `var(--css-var)`)
- Cores hardcoded — sempre variáveis CSS

### Integração com outros protocolos

```
frontend-design (AESTHETICS)     ← autoridade estética, define direção visual
    ↓
anti-frankenstein (GOVERNANCE)   ← verifica o que já existe antes de criar CSS
    ↓
frontend-crafter (IMPLEMENTATION) ← executa o código seguindo design system
```
