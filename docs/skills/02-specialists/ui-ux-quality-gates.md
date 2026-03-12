---
name: ui-ux-quality-gates
description: Framework de 5 Quality Gates para validacao de interfaces do Super Cartola Manager. Garante hierarquia visual, feedback de interacao, apresentacao de dados, responsividade e design emocional. Keywords: quality gate, ui review, ux review, checklist visual, validar interface, revisar tela, qualidade visual, acessibilidade, responsivo, mobile
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# UI/UX Quality Gates - Framework de Validacao Visual

## Missao

Garantir que toda interface do Super Cartola Manager passe por 5 portoes de qualidade antes de ser considerada pronta para producao. Cada gate possui criterios objetivos e verificaveis — nao depende de opiniao subjetiva.

---

## Regra de Ouro

```
╔═══════════════════════════════════════════════════════════════════╗
║  NENHUMA INTERFACE VAI PARA PRODUCAO SEM PASSAR NOS 5 GATES.    ║
║                                                                  ║
║  Gate 1: Hierarquia Visual          (Tipografia + Cores)         ║
║  Gate 2: Feedback de Interacao      (Hover + Loading + Status)   ║
║  Gate 3: Apresentacao de Dados      (Pontos + Moeda + Escudos)   ║
║  Gate 4: Responsivo & Acessivel     (Mobile-first + WCAG)        ║
║  Gate 5: Design Emocional           (Motion + Identidade)        ║
║                                                                  ║
║  Se QUALQUER gate falhar → corrigir antes de entregar.           ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Gate 1 — Hierarquia Visual

### Objetivo
O usuario deve entender instantaneamente o que e mais importante na tela, apenas pelo peso visual dos elementos.

### Criterios Obrigatorios

#### Tipografia
| Nivel | Fonte | Uso | Classe/Estilo |
|-------|-------|-----|---------------|
| **Primario** (titulos, stats grandes) | Russo One | Headers, numeros de destaque, badges | `font-family: 'Russo One', sans-serif;` |
| **Secundario** (corpo de texto) | Inter | Paragrafos, descricoes, labels | `font-family: 'Inter', -apple-system, sans-serif;` |
| **Dados** (valores numericos) | JetBrains Mono | Pontos, saldos, posicoes, contadores | `font-family: 'JetBrains Mono', monospace;` |

**Proibido:** Arial, Roboto, system fonts genericas, fontes nao listadas acima.

#### Hierarquia de Cores (Dark Mode)
```
bg-gray-900 (fundo da pagina)
  └── bg-gray-800 (cards, containers)
        └── bg-gray-700 (inputs, elementos internos)
              └── bg-gray-600 (borders sutis)

text-white / text-gray-100  → Conteudo primario (titulos, valores)
text-gray-300               → Conteudo secundario (subtitulos)
text-gray-400               → Conteudo muted (timestamps, labels)
text-gray-500               → Conteudo desabilitado
```

#### Cores via Variaveis CSS
Todas as cores DEVEM vir de `css/_admin-tokens.css`:

```css
/* Cores dos modulos */
var(--module-artilheiro-primary)   /* Verde #22c55e */
var(--module-capitao-primary)      /* Roxo #8b5cf6 */
var(--module-luva-primary)         /* Dourado #ffd700 */

/* Cores de status */
var(--app-success)                 /* Positivo */
var(--app-danger)                  /* Negativo */
var(--app-warning)                 /* Alerta */
var(--app-primary)                 /* Acao principal */
```

**Proibido:** Cores hardcoded (`#22c55e`, `rgb(34, 197, 94)`, etc.) diretamente no HTML ou JS.

### Verificacao Gate 1

```bash
# Detectar fontes proibidas
grep -rn "font-family.*Arial\|font-family.*Roboto\|font-family.*system" \
  --include="*.css" --include="*.html" --include="*.js" public/ css/ views/

# Detectar cores hardcoded (fora de _admin-tokens.css)
grep -rn "color:.*#[0-9a-fA-F]\{3,6\}\|background.*#[0-9a-fA-F]\{3,6\}" \
  --include="*.css" --include="*.html" --include="*.js" public/ \
  | grep -v "_admin-tokens\|node_modules\|\.min\."

# Verificar se fontes estao carregadas
grep -rn "Russo One\|JetBrains Mono" --include="*.html" views/ | head -5
```

### Checklist Gate 1
```markdown
- [ ] Russo One aplicado em todos os titulos e stats
- [ ] JetBrains Mono aplicado em todos os valores numericos
- [ ] Inter aplicado em corpo de texto
- [ ] Hierarquia bg-gray-900 → bg-gray-800 → bg-gray-700 respeitada
- [ ] text-white para conteudo primario, text-gray-400 para muted
- [ ] Zero cores hardcoded — todas via var(--token)
- [ ] Zero fontes proibidas (Arial, Roboto, system)
```

---

## Gate 2 — Feedback de Interacao

### Objetivo
O usuario NUNCA deve ficar sem resposta visual apos uma acao. Todo clique, hover ou operacao assincrona deve ter feedback imediato.

### Criterios Obrigatorios

#### Hover States
Todo elemento interativo DEVE ter estado hover apropriado para dark mode:

```css
/* Botoes */
.btn:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
    transition: all 150ms ease;
}

/* Cards clicaveis */
.card-interativo:hover {
    background: var(--bg-hover, rgba(255,255,255,0.05));
    border-color: var(--border-hover);
    transition: all 200ms ease;
}

/* Links */
a:hover {
    color: var(--app-primary);
    text-decoration: underline;
}
```

#### Loading States
Toda operacao assincrona (fetch, submit, processamento) DEVE mostrar loading:

```javascript
// Pattern obrigatorio para chamadas API
button.disabled = true;
button.innerHTML = '<span class="material-icons animate-spin">sync</span> Carregando...';

try {
    const response = await fetch('/api/endpoint');
    // ... processar resposta
} catch (error) {
    // ... tratar erro com feedback visual
} finally {
    button.disabled = false;
    button.innerHTML = textoOriginal;
}
```

#### Indicadores de Status (Material Icons)
| Status | Icone | Cor |
|--------|-------|-----|
| Sucesso/Ganho | `check_circle` | `var(--app-success)` |
| Erro/Perda | `cancel` | `var(--app-danger)` |
| Alerta | `warning` | `var(--app-warning)` |
| Info | `info` | `var(--app-primary)` |
| Estrela/MITO | `star` | `var(--app-warning)` |
| Trofeu | `emoji_events` | `var(--app-danger)` |

**Proibido:** Emojis como indicadores de status. Sempre Material Icons.

#### Transicoes
- Duracoes permitidas: `150ms` (rapidas), `200ms` (padrao), `300ms` (dramaticas)
- Funcoes: `ease`, `ease-out`, `ease-in-out`
- Sempre CSS-only (nao usar JS para animacoes simples)

#### Acoes Destrutivas
Toda acao que remove dados ou altera saldo financeiro DEVE ter confirmacao:

```javascript
// Pattern obrigatorio
if (!confirm('Tem certeza que deseja excluir este acerto financeiro?')) return;
```

### Verificacao Gate 2

```bash
# Detectar emojis no codigo (proibidos)
grep -rn "[\x{1F300}-\x{1F9FF}]" --include="*.js" --include="*.html" public/ views/ 2>/dev/null

# Verificar se botoes tem hover states
grep -rn ":hover" --include="*.css" public/ css/ | wc -l

# Buscar fetch sem loading state
grep -rn "await fetch" --include="*.js" public/ | head -20
```

### Checklist Gate 2
```markdown
- [ ] Todo botao tem hover state visivel
- [ ] Todo card clicavel muda ao hover
- [ ] Toda chamada API mostra loading indicator
- [ ] Erros de API mostram mensagem visual ao usuario
- [ ] Zero emojis — todos indicadores sao Material Icons
- [ ] Transicoes entre 150ms-300ms, CSS-only
- [ ] Acoes destrutivas pedem confirmacao
- [ ] cursor: pointer em todos os elementos clicaveis
```

---

## Gate 3 — Apresentacao de Dados

### Objetivo
Dados esportivos e financeiros devem ser apresentados com precisao e formatacao padronizada. Erros de formatacao de pontos sao bugs criticos.

### Criterios Obrigatorios

#### Pontuacao (REGRA CRITICA)
**NUNCA arredondar pontos. SEMPRE truncar.**

| Contexto | Funcao | Exemplo |
|----------|--------|---------|
| Backend (Node.js) | `truncarPontosNum(valor)` | `93.78569 → 93.78` |
| Frontend (participante) | `truncarPontos(valor)` | `93.78569 → "93,78"` |
| Frontend (admin, inline) | `(Math.trunc(v*100)/100).toFixed(2)` | `93.78569 → "93.78"` |

**Proibido:**
```javascript
// NUNCA usar — arredonda!
pontos.toFixed(2)
parseFloat(pontos.toFixed(2))
Math.round(pontos * 100) / 100
```

#### Valores Financeiros
```javascript
// Moeda brasileira
new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
// Resultado: "R$ 1.234,56"
```

#### Escudos de Clubes
```html
<!-- Sempre com fallback -->
<img src="/escudos/${clube_id}.png"
     onerror="this.src='/escudos/default.png'"
     alt="${clube_nome}"
     class="w-6 h-6">
```

#### Estados Vazios
Quando nao ha dados para exibir, NUNCA mostrar tela em branco:

```html
<!-- Pattern obrigatorio para listas vazias -->
<div class="text-center py-8 text-gray-400">
    <span class="material-icons text-4xl mb-2">inbox</span>
    <p>Nenhum dado disponivel para esta rodada.</p>
    <p class="text-sm mt-1">Os dados serao atualizados apos o fechamento do mercado.</p>
</div>
```

#### Cores dos Modulos
Cada modulo tem sua identidade visual. Usar SEMPRE variaveis CSS:

| Modulo | Variavel Primaria | Gradiente | Uso |
|--------|-------------------|-----------|-----|
| Artilheiro Campeao | `var(--module-artilheiro-primary)` | `var(--gradient-artilheiro)` | Headers, badges, destaque |
| Capitao de Luxo | `var(--module-capitao-primary)` | `var(--gradient-capitao)` | Headers, badges, destaque |
| Luva de Ouro | `var(--module-luva-primary)` | `var(--gradient-luva)` | Headers, badges, destaque |

### Verificacao Gate 3

```bash
# Detectar arredondamento proibido de pontos
grep -rn "\.toFixed(2)\|Math\.round.*100\|parseFloat.*toFixed" \
  --include="*.js" public/ controllers/ services/ \
  | grep -vi "moeda\|currency\|preco\|valor\|saldo\|financ"

# Detectar escudos sem fallback
grep -rn "escudos/" --include="*.js" --include="*.html" public/ views/ \
  | grep -v "onerror\|default"

# Verificar uso de truncarPontos
grep -rn "truncarPontos\|truncarPontosNum" --include="*.js" . | wc -l
```

### Checklist Gate 3
```markdown
- [ ] Todos os pontos usam truncarPontos/truncarPontosNum (NUNCA toFixed)
- [ ] Valores em R$ formatados com Intl.NumberFormat pt-BR
- [ ] Escudos com fallback para default.png
- [ ] Listas vazias mostram mensagem informativa (nunca tela em branco)
- [ ] Cores dos modulos via variaveis CSS (nao hardcoded)
- [ ] Numeros com JetBrains Mono
- [ ] Posicoes de ranking com destaque visual (ouro/prata/bronze para top 3)
```

---

## Gate 4 — Responsivo & Acessivel

### Objetivo
O sistema e usado primariamente em mobile durante jogos de futebol. A experiencia mobile NAO e secundaria — e a principal.

### Criterios Obrigatorios

#### Breakpoints
```
320px  → Mobile minimo (iPhone SE)
375px  → Mobile padrao
428px  → Mobile grande
768px  → Tablet
1024px → Desktop pequeno
1440px → Desktop padrao
1920px → Desktop grande
```

**Regra:** Mobile-first. CSS base e mobile, media queries expandem para desktop.

#### Touch Targets
```css
/* Minimo 44x44px para elementos tocaveis */
.btn, .card-clicavel, .link-acao {
    min-height: 44px;
    min-width: 44px;
    padding: 12px 16px; /* garante area suficiente */
}
```

#### Contraste (WCAG AA)
| Contexto | Ratio Minimo | Exemplo |
|----------|-------------|---------|
| Texto normal (< 18px) | 4.5:1 | `text-white` em `bg-gray-900` = 15.4:1 |
| Texto grande (>= 18px bold) | 3:1 | `text-gray-400` em `bg-gray-900` = 5.5:1 |
| Elementos interativos | 3:1 | Borders, icones, indicadores |

**Cuidado:** `text-gray-500` em `bg-gray-800` pode NAO passar WCAG AA. Verificar sempre.

#### SPA Init Pattern
Paginas carregadas via SPA (participante-navigation.js) DEVEM usar este pattern:

```javascript
// OBRIGATORIO para modulos SPA
function init() {
    // ... inicializacao do modulo
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // SPA: DOM ja pronto, executar imediatamente
}
```

**Proibido:** Usar apenas `DOMContentLoaded` (nao dispara em navegacao SPA).

#### Overflow Horizontal
```css
/* Prevenir overflow em mobile */
body, .container {
    overflow-x: hidden;
    max-width: 100vw;
}

/* Tabelas responsivas */
.table-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
```

### Verificacao Gate 4

```bash
# Detectar DOMContentLoaded sem readyState check
grep -rn "DOMContentLoaded" --include="*.js" public/ \
  | grep -v "readyState"

# Detectar elementos sem tamanho minimo de touch
grep -rn "min-height:\s*[0-3][0-9]px\|padding:\s*[0-4]px" \
  --include="*.css" public/ css/

# Verificar media queries mobile-first
grep -rn "@media" --include="*.css" public/ css/ | head -20
```

### Checklist Gate 4
```markdown
- [ ] Layout funciona em 320px sem overflow horizontal
- [ ] Layout funciona em 768px com adaptacao adequada
- [ ] Layout funciona em 1440px com aproveitamento de espaco
- [ ] Touch targets minimo 44x44px em todos os interativos
- [ ] Contraste WCAG AA em todos os textos sobre dark background
- [ ] SPA init pattern com readyState check (nunca DOMContentLoaded sozinho)
- [ ] Tabelas com scroll horizontal em mobile
- [ ] Textos legiveis sem zoom (minimo 14px corpo, 12px captions)
```

---

## Gate 5 — Design Emocional

### Objetivo
O Super Cartola Manager nao e uma planilha. E uma experiencia esportiva que deve gerar emocao, engajamento e identidade visual memoravel.

### Criterios Obrigatorios

#### Animacoes de Entrada Escalonadas
```css
/* Cards aparecem com delay incremental */
.card-animado {
    opacity: 0;
    transform: translateY(20px);
    animation: fadeInUp 400ms ease-out forwards;
}

.card-animado:nth-child(1) { animation-delay: 0ms; }
.card-animado:nth-child(2) { animation-delay: 80ms; }
.card-animado:nth-child(3) { animation-delay: 160ms; }
.card-animado:nth-child(4) { animation-delay: 240ms; }

@keyframes fadeInUp {
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

#### Hover States que Surpreendem
```css
/* Cards com elevacao ao hover */
.card-premium:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
    border-color: var(--module-artilheiro-primary);
    transition: all 250ms ease-out;
}
```

#### Fundos com Profundidade
**Proibido:** Fundo solido generico sem textura ou gradiente.

```css
/* Gradientes sutis */
.header-modulo {
    background: var(--gradient-artilheiro);
    /* ou */
    background: linear-gradient(135deg, rgba(34,197,94,0.1), transparent);
}

/* Noise texture overlay */
.bg-textured::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,..."); /* noise pattern */
    opacity: 0.03;
    pointer-events: none;
}

/* Glassmorphism (onde apropriado) */
.card-glass {
    background: rgba(31, 41, 55, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}
```

#### Identidade Visual dos Modulos
Cada modulo deve ter personalidade propria atraves de sua paleta de cores:

```css
/* Headers de modulo com gradiente tematico */
.artilheiro-header {
    background: var(--gradient-artilheiro);
    border-left: 4px solid var(--module-artilheiro-primary);
}

.capitao-header {
    background: var(--gradient-capitao);
    border-left: 4px solid var(--module-capitao-primary);
}

.luva-header {
    background: var(--gradient-luva);
    border-left: 4px solid var(--module-luva-primary);
}
```

### Verificacao Gate 5

```bash
# Verificar se ha animacoes de entrada
grep -rn "@keyframes\|animation:" --include="*.css" public/ css/ | wc -l

# Verificar hover states
grep -rn ":hover" --include="*.css" public/ css/ | wc -l

# Verificar gradientes (vs fundos solidos)
grep -rn "linear-gradient\|radial-gradient" --include="*.css" public/ css/ | wc -l

# Detectar fundos solidos genericos em cards (sinal de alerta)
grep -rn "background:\s*#[0-9a-f]\{6\}\s*;" --include="*.css" public/ css/
```

### Checklist Gate 5
```markdown
- [ ] Animacoes de entrada escalonadas em listas/grids
- [ ] Hover states com elevacao ou destaque em cards interativos
- [ ] Headers de modulo com gradiente tematico (nao fundo solido)
- [ ] Pelo menos 1 elemento com glassmorphism ou textura onde apropriado
- [ ] Cores do modulo criam identidade visual distinta
- [ ] Sombras dramaticas em cards (box-shadow com blur generoso)
- [ ] Transicoes suaves em mudancas de estado (150-300ms)
```

---

## Sinais de Risco Alto

Indicadores de que a interface provavelmente FALHA em multiplos gates:

| Sinal | Gates Afetados | Acao |
|-------|---------------|------|
| Tudo usa a mesma fonte | Gate 1, Gate 5 | Aplicar hierarquia tipografica |
| Nenhum hover state | Gate 2, Gate 5 | Adicionar feedback em todos os interativos |
| Pontos com `.toFixed(2)` | Gate 3 | Substituir por truncarPontos URGENTE |
| Nao testa em 320px | Gate 4 | Redimensionar browser e corrigir |
| Sem animacoes de entrada | Gate 5 | Adicionar fadeInUp escalonado |
| Emojis como indicadores | Gate 2, Gate 3 | Substituir por Material Icons |
| Cores hardcoded | Gate 1, Gate 3, Gate 5 | Migrar para variaveis CSS |
| DOMContentLoaded sem readyState | Gate 4 | Corrigir init pattern SPA |
| Tela em branco sem dados | Gate 3 | Adicionar empty state informativo |
| Fundo `bg-gray-900` sem textura | Gate 5 | Adicionar gradiente sutil ou noise |

---

## Fluxo de Validacao Completo

```
┌──────────────────────────────┐
│  INTERFACE PRONTA PARA       │
│  REVIEW?                     │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  GATE 1: HIERARQUIA VISUAL   │
│  Fontes + Cores + Tokens     │
│  → FALHOU? Corrigir.         │
└──────────┬───────────────────┘
           │ PASSOU
           ▼
┌──────────────────────────────┐
│  GATE 2: FEEDBACK INTERACAO  │
│  Hover + Loading + Icons     │
│  → FALHOU? Corrigir.         │
└──────────┬───────────────────┘
           │ PASSOU
           ▼
┌──────────────────────────────┐
│  GATE 3: DADOS               │
│  Pontos + Moeda + Escudos    │
│  → FALHOU? Corrigir.         │
└──────────┬───────────────────┘
           │ PASSOU
           ▼
┌──────────────────────────────┐
│  GATE 4: RESPONSIVO          │
│  Mobile + Touch + WCAG       │
│  → FALHOU? Corrigir.         │
└──────────┬───────────────────┘
           │ PASSOU
           ▼
┌──────────────────────────────┐
│  GATE 5: EMOCIONAL           │
│  Motion + Identidade         │
│  → FALHOU? Corrigir.         │
└──────────┬───────────────────┘
           │ TODOS PASSARAM
           ▼
┌──────────────────────────────┐
│  PRONTO PARA PRODUCAO        │
└──────────────────────────────┘
```

---

## Integracao com Outras Skills

| Situacao | Skill Complementar |
|----------|--------------------|
| Precisa definir direcao estetica primeiro | `/frontend-design` |
| Verificar se CSS ja existe no registry | `/anti-frankenstein` |
| Implementar componente novo | `/frontend-crafter` |
| Revisar codigo do componente | `/code-inspector` |
| Detectar problemas comuns de IA | `/ai-problems-detection` |
| Validar performance visual | `/ux-auditor-app` |

---

**Versao:** 1.0
**Baseada em:** UI/UX Quality Gates (agnostic-core) adaptada para Super Cartola Manager
**Contexto:** Node.js + Vanilla JS + TailwindCSS + Dark Mode + PWA
