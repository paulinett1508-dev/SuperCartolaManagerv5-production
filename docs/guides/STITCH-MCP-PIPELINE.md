# Pipeline Design-to-Code: Stitch MCP + Skills Frontend

Guia centralizado do fluxo completo de design-to-code usando o Google Stitch MCP integrado com as skills do projeto.

**Versao:** 1.0.0
**Ultima atualizacao:** 2026-02-22

---

## Visao Geral

O pipeline transforma **ideias visuais** em **codigo production-ready** passando por 7 fases padronizadas. Cada fase tem um responsavel claro (MCP ou skill) e criterios de saida definidos.

```
Stitch MCP (IDEACAO)
    |
    v
frontend-design (DIRECAO ESTETICA)
    |
    v
Stitch MCP ou HTML colado (OBTER HTML)
    |
    v
stitch-adapter (AVALIACAO score 0-100)
    |
    v
stitch-adapter (ADAPTACAO para design system)
    |
    v
anti-frankenstein (GOVERNANCA CSS)
    |
    v
frontend-crafter (IMPLEMENTACAO production-ready)
```

---

## Tabela de Responsabilidades

| Componente | Tipo | Papel | Analogia |
|------------|------|-------|----------|
| **Stitch MCP** | MCP Server | Gera mockups visuais rapidos, variantes, iteracoes | Desenhista rapido |
| **frontend-design** | Skill (02-specialists) | Define direcao estetica, veta generico ("AI slop") | Diretor de arte |
| **stitch-adapter** | Skill (03-utilities) | Avalia qualidade (score 0-100), converte para design system | Tradutor tecnico |
| **anti-frankenstein** | Skill (02-specialists) | Evita duplicacao, garante governanca CSS | Auditor preventivo |
| **frontend-crafter** | Skill (02-specialists) | Implementa codigo final production-ready | Desenvolvedor |

---

## Fase 0: Ideacao (Stitch MCP)

**Responsavel:** Stitch MCP
**Objetivo:** Gerar mockups visuais rapidamente para iterar ideias

### Comandos MCP Disponiveis

| Comando | Funcao | Quando Usar |
|---------|--------|-------------|
| `create_project` | Cria projeto novo | Inicio de redesign, nova feature |
| `list_projects` | Lista projetos existentes | Localizar trabalho anterior |
| `list_screens` | Lista telas de um projeto | Ver telas disponiveis |
| `get_screen` | Obter detalhes + HTML de uma tela | Extrair codigo gerado |
| `generate_screen_from_text` | Gerar tela a partir de prompt | Criar design novo |
| `edit_screens` | Editar telas existentes | Iterar sobre design |
| `generate_variants` | Gerar variacoes de telas | Explorar alternativas |

### Exemplo: Gerar Design Novo

```
1. create_project(title: "Raio-X Rodada Redesign")
2. generate_screen_from_text(
     projectId: "ID_DO_PROJETO",
     prompt: "[usar prompt de .claude/STITCH-DESIGN-PROMPT.md]",
     deviceType: "MOBILE"
   )
3. get_screen(name: "projects/ID/screens/SCREEN_ID")
4. Se htmlCode vazio → copiar HTML do browser do Stitch
5. Se htmlCode preenchido → extrair e enviar para avaliacao
```

### Exemplo: Gerar Variantes

```
1. generate_variants(
     projectId: "ID_DO_PROJETO",
     selectedScreenIds: ["SCREEN_ID"],
     prompt: "Variacao com layout de cards em grid ao inves de lista",
     variantOptions: {
       variantCount: 3,
       creativeRange: "EXPLORE",
       aspects: ["LAYOUT", "COLOR_SCHEME"]
     }
   )
2. list_screens() → comparar variantes
3. get_screen() → extrair a melhor
```

### Dica: Prompt Padrao

Sempre use o template de `.claude/STITCH-DESIGN-PROMPT.md` ao gerar designs no Stitch. Ele direciona o output para ser mais proximo do design system do projeto (dark mode, tipografia, cores).

---

## Fase 1: Direcao Estetica (frontend-design)

**Responsavel:** Skill `frontend-design` (docs/skills/02-specialists/frontend-design.md)
**Objetivo:** Avaliar se o design gerado segue os pilares esteticos do projeto

### Criterios de Avaliacao

| Pilar | Diretriz | Aceito | Rejeitado |
|-------|----------|--------|-----------|
| **Tipografia** | Russo One + Inter + JetBrains Mono | Fontes do projeto | Arial, Roboto, system fonts |
| **Cor & Tema** | Dark mode estrito, variaveis CSS | Backgrounds escuros, cores de modulo | Fundo branco, gradientes roxos |
| **Motion** | Animacoes de entrada escalonadas | CSS-only, hover states | Animacoes pesadas com JS |
| **Composicao** | Densidade otimizada, hierarquia clara | Layouts memoraveis | Layouts previsíveis e genericos |
| **Fundos** | Gradients sutis, glassmorphism | Atmosfera e profundidade | Fundo solido generico |

### Poder de Veto

A skill `frontend-design` tem **autoridade maxima** em decisoes esteticas. Se o design gerado pelo Stitch e considerado "AI slop" (generico, sem carater), ela pode:

1. **Rejeitar** o design e pedir nova geracao com prompt melhor
2. **Ajustar direcao** especificando tom estetico (brutalist, editorial, maximalista, etc.)
3. **Aprovar com ressalvas** indicando pontos que o stitch-adapter deve corrigir

---

## Fase 2: Obter HTML

**Responsavel:** Stitch MCP ou usuario
**Objetivo:** Extrair o codigo HTML para processamento

### Decision Tree: MCP vs HTML Colado

```
O HTML esta acessivel?
    |
    +-- SIM: get_screen() retorna htmlCode preenchido
    |       → Usar HTML do MCP (MODO MCP)
    |
    +-- NAO: htmlCode vazio ({})
            |
            +-- Stitch browser acessivel?
            |       → Copiar HTML do browser (MODO MANUAL)
            |
            +-- Fonte externa (AI Studio, ChatGPT, etc.)?
                    → Colar HTML na conversa (MODO MANUAL)
```

### Fontes de HTML Suportadas

| Fonte | Modo | Qualidade Tipica |
|-------|------|------------------|
| Stitch MCP (htmlCode) | MCP | Variavel (depende do prompt) |
| Stitch browser (copiar) | Manual | Variavel |
| Google AI Studio | Manual | Boa (dark mode comum) |
| ChatGPT/Claude | Manual | Media (requer mais adaptacao) |
| HTML escrito manualmente | Manual | Depende do autor |

---

## Fase 3: Avaliacao (stitch-adapter)

**Responsavel:** Skill `stitch-adapter` (docs/skills/03-utilities/stitch-adapter.md)
**Objetivo:** Avaliar qualidade do HTML recebido (score 0-100)

### 8 Dimensoes de Avaliacao

| Dimensao | Peso | O que Avalia |
|----------|------|--------------|
| Stack Compliance | 20pts | Sem React/Vue/Angular, sem npm imports |
| Dark Mode | 15pts | Backgrounds escuros, texto claro |
| Design Tokens | 15pts | Uso de variaveis CSS ou cores mapeáveis |
| Tipografia | 10pts | Russo One/Inter/JetBrains Mono |
| Responsividade | 10pts | Viewport, media queries, flexbox/grid |
| Acessibilidade | 10pts | aria-labels, alt text, semantica HTML |
| JavaScript | 10pts | ES6+, sem jQuery, try/catch |
| Performance | 10pts | Lazy loading, GPU-friendly transitions |

### Interpretacao do Score

| Score | Nivel | Acao |
|-------|-------|------|
| 85-100 | EXCELENTE | Adaptacao minima, quase production-ready |
| 70-84 | BOM | Ajustes moderados automaticos |
| 50-69 | ACEITAVEL | Muitos ajustes mas adaptavel |
| 30-49 | PRECISA MELHORAR | Adaptavel com alertas criticos |
| 0-29 | CRITICO | Framework incompativel, reescrita necessaria |

---

## Fase 4: Adaptacao (stitch-adapter)

**Responsavel:** Skill `stitch-adapter`
**Objetivo:** Converter HTML generico para o design system do projeto

### Conversoes Realizadas (Automaticas)

| Categoria | De | Para |
|-----------|----|------|
| **Cores** | `#FF5500`, `#121212`, etc. | `var(--color-primary)`, `var(--surface-bg)` |
| **Espacamento** | `padding: 16px` | `padding: var(--space-4)` |
| **Border Radius** | `border-radius: 8px` | `border-radius: var(--radius-md)` |
| **Fontes** | `font-family: 'Arial'` | `font-family: var(--font-family-base)` |
| **Sombras** | `box-shadow: 0 4px 16px rgba(...)` | `box-shadow: var(--shadow-md)` |
| **Transicoes** | `transition: all 0.3s ease` | `transition: var(--transition-normal)` |
| **Icones** | `fa-trophy`, `fa-star` | `<span class="material-icons">emoji_events</span>` |
| **Tailwind** | `bg-gray-900`, `text-white` | Classes semanticas (`bg-surface`, `text-primary`) |

### Destino: Admin vs App

O stitch-adapter classifica automaticamente o destino:

| Indicador | Destino | Tokens Usados |
|-----------|---------|---------------|
| dashboard, sidebar, desktop, tabela | **Admin** | `var(--color-*)`, `var(--surface-*)` |
| mobile, touch, bottom-nav, PWA | **App** | `var(--app-*)` |
| Ambiguo | **Perguntar** ao usuario |

---

## Fase 5: Governanca (anti-frankenstein)

**Responsavel:** Skill `anti-frankenstein` (docs/skills/02-specialists/anti-frankenstein.md)
**Objetivo:** Garantir que o codigo adaptado nao cria duplicacao ou violacoes

### 5 Checkpoints Obrigatorios

| # | Check | Pergunta | Referencia |
|---|-------|----------|------------|
| 1 | Ja existe? | Componente similar no `css-registry.json`? | `config/css-registry.json` |
| 2 | Onde vive? | Diretorio correto (admin/app/mobile)? | Estrutura de pastas |
| 3 | Usa tokens? | Zero cores/fontes/sombras hardcoded? | `_admin-tokens.css` ou `_app-tokens.css` |
| 4 | Segue convencoes? | Naming kebab-case, escopo correto, header? | `docs/rules/audit-frontend.md` |
| 5 | E necessario? | Editar existente e melhor que criar novo? | Principio de minimalismo |

### Resultado

- **Todos passaram** → Prosseguir para implementacao
- **Algum falhou** → PARAR, corrigir, re-avaliar

---

## Fase 6: Implementacao (frontend-crafter)

**Responsavel:** Skill `frontend-crafter` (docs/skills/02-specialists/frontend-crafter.md)
**Objetivo:** Gerar arquivos finais production-ready

### Output Admin

```
public/admin-[nome].html          # Pagina completa
public/css/admin-[nome].css       # CSS com tokens admin
public/js/admin-[nome].js         # JS como ES6 module
```

### Output App Participante

```
public/participante/fronts/[nome].html           # Fragmento HTML
public/participante/modules/[nome]/[nome].css     # CSS com tokens app
public/participante/modules/[nome]/[nome].js      # JS como ES6 module
```

### Checklist Final

```
[ ] Dark mode consistente (sem backgrounds claros)
[ ] Todas cores via variaveis CSS (zero hardcoded)
[ ] Fontes: Russo One (titulos), Inter (corpo), JetBrains Mono (numeros)
[ ] Icones: Material Icons (zero emojis, zero FontAwesome)
[ ] Mobile-first (se app): touch targets >= 44px
[ ] JavaScript: ES6 module, try/catch em async
[ ] Acessibilidade: aria-labels, alt text, tags semanticas
[ ] Performance: lazy loading, GPU-friendly transitions
[ ] Registrado no css-registry.json (se CSS novo)
[ ] Registrado no participante-navigation.js (se app)
```

---

## Fase 7: Relatorio

**Responsavel:** stitch-adapter (gera automaticamente)
**Conteudo:** Score de qualidade, arquivos gerados, conversoes realizadas, instrucoes de integracao

Template completo em: `docs/skills/03-utilities/stitch-adapter.md` (secao 6)

---

## Fluxos Padronizados

### Fluxo 1: Novo Design do Zero

```
1. [Stitch MCP] create_project → generate_screen_from_text
2. [Stitch MCP] get_screen → extrair HTML
3. [frontend-design] Avaliar direcao estetica
4. [stitch-adapter] Avaliar qualidade (score)
5. [stitch-adapter] Adaptar para design system
6. [anti-frankenstein] 5 checkpoints
7. [frontend-crafter] Implementar production-ready
```

### Fluxo 2: Redesign de Tela Existente

```
1. [Screenshot] Capturar tela atual do projeto
2. [Stitch MCP] create_project → usar screenshot como referencia
3. [Stitch MCP] generate_screen_from_text (com prompt de redesign)
4. [Stitch MCP] generate_variants (explorar alternativas)
5. [frontend-design] Escolher melhor variante
6. [stitch-adapter] Avaliar + Adaptar
7. [anti-frankenstein] Checkpoints
8. [frontend-crafter] Implementar (substituir tela existente)
```

### Fluxo 3: Variantes de Design

```
1. [Stitch MCP] list_projects → encontrar projeto
2. [Stitch MCP] list_screens → escolher tela base
3. [Stitch MCP] generate_variants (creativeRange: EXPLORE/REIMAGINE)
4. [frontend-design] Comparar e escolher
5. [stitch-adapter] Adaptar escolhida
6. Continuar com anti-frankenstein → frontend-crafter
```

### Fluxo 4: Apenas Avaliar HTML (sem implementar)

```
1. Usuario cola HTML na conversa
2. [stitch-adapter] Avaliar qualidade (score 0-100)
3. Apresentar relatorio com problemas e sugestoes
4. Parar aqui (sem adaptar ou implementar)
```

---

## Quando Usar MCP vs HTML Colado

| Cenario | Recomendacao | Motivo |
|---------|--------------|--------|
| Ideacao rapida | **MCP** | Gera designs sem sair do terminal |
| Iterar sobre design | **MCP** | edit_screens e generate_variants |
| HTML do Stitch browser | **Manual** | Quando htmlCode do MCP esta vazio |
| HTML de outra fonte (AI Studio, ChatGPT) | **Manual** | MCP so funciona com Stitch |
| Screenshot como referencia | **MCP** | Stitch aceita imagens como input |
| Avaliar qualidade apenas | **Manual** | Colar HTML + pedir score |

---

## Referencias Cruzadas

| Recurso | Localizacao |
|---------|-------------|
| **Stitch MCP Config** | `.mcp.json` (server "stitch") |
| **Design Prompt Padrao** | `.claude/STITCH-DESIGN-PROMPT.md` |
| **Stitch Adapter Skill** | `docs/skills/03-utilities/stitch-adapter.md` |
| **Frontend Design Skill** | `docs/skills/02-specialists/frontend-design.md` |
| **Anti-Frankenstein Skill** | `docs/skills/02-specialists/anti-frankenstein.md` |
| **Frontend Crafter Skill** | `docs/skills/02-specialists/frontend-crafter.md` |
| **CSS Registry** | `config/css-registry.json` |
| **Admin Tokens** | `public/css/_admin-tokens.css` |
| **App Tokens** | `public/participante/css/_app-tokens.css` |
| **Keyword Map** | `docs/skills/SKILL-KEYWORD-MAP.md` |

---

## Keywords que Ativam este Pipeline

Qualquer uma destas keywords ativa automaticamente o fluxo Stitch + Skills:

- "gerar tela no stitch", "design no stitch", "mockup no stitch"
- "stitch mcp", "usar stitch", "abrir stitch"
- "gerar variante", "variante no stitch"
- "adaptar html", "converter html", "html do stitch"
- "redesign", "nova tela", "visual do app"

Mapeamento completo: `docs/skills/SKILL-KEYWORD-MAP.md`
