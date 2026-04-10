---
name: tailwind-patterns
description: Padroes e boas praticas de TailwindCSS para o Super Cartola Manager. Guia de utility classes, responsividade, dark mode e componentes comuns. Adaptado do agnostic-core para a stack do projeto (Tailwind via CDN, dark mode obrigatorio, design tokens em _admin-tokens.css). Keywords - tailwind, utility class, responsive, sm, md, lg, dark mode, classes CSS.
allowed-tools: Read, Grep, Glob, Bash
---

# Tailwind Patterns — Super Cartola Manager

## Contexto do Projeto

- **Tailwind via CDN** (nao instalado como dependencia — sem purge/tree-shaking)
- **Dark mode obrigatorio** (`bg-gray-900`, `bg-slate-900`)
- **Design tokens** em `css/_admin-tokens.css` (variaveis CSS customizadas)
- **Regra:** Preferir variaveis CSS (`var(--module-artilheiro-primary)`) a cores Tailwind hardcoded quando for cor de modulo

---

## 1. Hierarquia de Cores (Dark Mode)

### Backgrounds

| Uso | Classes Tailwind | Variavel CSS |
|-----|-----------------|--------------|
| Fundo da pagina | `bg-gray-900` ou `bg-slate-900` | `--app-bg-primary` |
| Cards/Containers | `bg-gray-800` | `--app-bg-secondary` |
| Cards internos | `bg-gray-700` | `--app-bg-tertiary` |
| Inputs/Forms | `bg-gray-700 border-gray-600` | — |
| Hover de card | `hover:bg-gray-700` | — |
| Destaque sutil | `bg-gray-800/50` (com transparencia) | — |

### Textos

| Uso | Classes Tailwind |
|-----|-----------------|
| Texto principal | `text-white` ou `text-gray-100` |
| Texto secundario | `text-gray-400` |
| Texto terciario/muted | `text-gray-500` |
| Links | `text-blue-400 hover:text-blue-300` |
| Valores positivos | `text-green-400` |
| Valores negativos | `text-red-400` |
| Destaque/warning | `text-yellow-400` |

---

## 2. Responsividade (Mobile-First)

### Breakpoints Tailwind

| Prefixo | Min-width | Uso no Projeto |
|---------|-----------|----------------|
| (sem) | 0px | PWA Participante (mobile base) |
| `sm:` | 640px | Tablets pequenos |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Desktop (admin panel) |
| `xl:` | 1280px | Desktop wide |

### Patterns Comuns

```html
<!-- Grid responsivo: 1 col mobile → 2 cols tablet → 3 cols desktop -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- cards -->
</div>

<!-- Sidebar que colapsa em mobile -->
<div class="flex flex-col lg:flex-row">
  <aside class="w-full lg:w-64 lg:min-h-screen"><!-- sidebar --></aside>
  <main class="flex-1 p-4"><!-- conteudo --></main>
</div>

<!-- Texto que muda de tamanho -->
<h1 class="text-xl sm:text-2xl lg:text-3xl font-russo-one">Titulo</h1>

<!-- Esconder/mostrar por breakpoint -->
<div class="hidden lg:block">Visivel so em desktop</div>
<div class="lg:hidden">Visivel so em mobile/tablet</div>
```

### Touch Targets (PWA Participante)

```html
<!-- Botao com area minima de toque (44x44px) -->
<button class="min-h-[44px] min-w-[44px] px-4 py-3 text-sm">
  Acao
</button>

<!-- Item de lista tocavel -->
<li class="py-3 px-4 flex items-center min-h-[48px] cursor-pointer hover:bg-gray-700">
  <!-- conteudo -->
</li>
```

---

## 3. Componentes Comuns

### Card Padrao (Dark Mode)

```html
<div class="bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-700">
  <h3 class="text-white font-russo-one text-lg mb-2">Titulo</h3>
  <p class="text-gray-400 text-sm">Descricao</p>
</div>
```

### Badge/Tag

```html
<!-- Sucesso -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
  Ativo
</span>

<!-- Perigo -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-400">
  Eliminado
</span>

<!-- Modulo Artilheiro (usar variavel CSS) -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
      style="background: var(--module-artilheiro-muted); color: var(--module-artilheiro-primary);">
  Artilheiro
</span>
```

### Botao Padrao

```html
<!-- Primario -->
<button class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
  Confirmar
</button>

<!-- Secundario -->
<button class="bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors duration-200">
  Cancelar
</button>

<!-- Danger -->
<button class="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200">
  Excluir
</button>
```

### Input com Label

```html
<div class="space-y-1">
  <label class="block text-sm font-medium text-gray-300">Nome</label>
  <input type="text" class="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500" placeholder="Digite...">
</div>
```

### Tabela Responsiva

```html
<div class="overflow-x-auto">
  <table class="w-full text-sm text-left">
    <thead class="text-gray-400 uppercase text-xs bg-gray-800">
      <tr>
        <th class="px-4 py-3">Nome</th>
        <th class="px-4 py-3 text-right font-mono">Pontos</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-700">
      <tr class="hover:bg-gray-700/50 transition-colors">
        <td class="px-4 py-3 text-white">Time ABC</td>
        <td class="px-4 py-3 text-right font-mono text-green-400">93,78</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 4. Animacoes e Transicoes

```html
<!-- Transicao de cor (hover) -->
<div class="transition-colors duration-200 hover:bg-gray-700">...</div>

<!-- Transicao de todos (transform + cor) -->
<div class="transition-all duration-300 hover:scale-105 hover:shadow-xl">...</div>

<!-- Fade in ao aparecer (com CSS custom) -->
<div class="animate-fadeIn">...</div>
<!-- Requer @keyframes fadeIn no CSS customizado -->
```

---

## 5. Tipografia (Projeto)

```html
<!-- Titulo principal (Russo One) -->
<h1 class="font-russo-one text-2xl text-white">Ranking Geral</h1>

<!-- Numeros/Stats (JetBrains Mono) -->
<span class="font-mono text-lg text-green-400">93,78</span>

<!-- Corpo de texto (Inter) -->
<p class="font-sans text-sm text-gray-400">Descricao do modulo</p>
```

**Nota:** As fontes `font-russo-one`, `font-mono` (JetBrains Mono), e `font-sans` (Inter) devem estar configuradas no CSS global.

---

## 6. Antipatterns (O que NAO fazer)

```html
<!-- ERRADO: Cor hardcoded para modulo -->
<div class="bg-[#22c55e]">Artilheiro</div>

<!-- CORRETO: Variavel CSS do modulo -->
<div style="background: var(--module-artilheiro-primary)">Artilheiro</div>

<!-- ERRADO: !important para override -->
<div class="!text-red-500">...</div>

<!-- CORRETO: Especificidade adequada ou classe condicional -->
<div class="text-red-400">...</div>

<!-- ERRADO: Fundo branco/claro (dark mode obrigatorio) -->
<div class="bg-white text-black">...</div>

<!-- CORRETO: Dark mode -->
<div class="bg-gray-800 text-white">...</div>
```

---

## 7. Checklist de Uso

```markdown
□ Dark mode: sem bg-white, sem text-black
□ Responsivo: testado de 320px a 1920px
□ Touch targets: min 44x44px em elementos tocaveis
□ Cores de modulo: usando variaveis CSS, nao Tailwind hardcoded
□ Tipografia: Russo One para titulos, JetBrains Mono para numeros, Inter para corpo
□ Transicoes: 150-300ms em hover states
□ Overflow: tabelas com overflow-x-auto
□ Acessibilidade: contraste adequado sobre fundos escuros
```

---

**Versao:** 1.0 (Adaptado do agnostic-core para SuperCartola)
