# SKILL: Frontend Design (Autoridade Estética)

## Visão Geral

Skill que guia a criação de interfaces frontend distintivas e production-grade, evitando estética genérica de "AI slop". Implementa código real e funcional com atenção excepcional a detalhes estéticos e escolhas criativas.

**Prioridade:** MÁXIMA — Esta skill é ativada ANTES de qualquer outra skill de frontend quando o assunto envolve design visual.

---

## Quando Usar

O usuário fornece requisitos de frontend: um componente, página, aplicação ou interface para construir. Pode incluir contexto sobre propósito, audiência ou restrições técnicas.

### Gatilhos de Ativação

| Categoria | Keywords |
|-----------|----------|
| **Entregáveis** | landing page, site, webapp, componente, dashboard, banner, hero, layout, card, modal, form |
| **Ações** | criar interface, redesenhar, melhorar visual, modernizar, deixar bonito, estilizar, visual do app |
| **Tech** | HTML, CSS, JavaScript, React, Next.js, Vue, Tailwind, styled-components |
| **Design** | dark mode, tema, paleta, tipografia, animação, motion, responsivo, UX premium |
| **Specs** | SPEC-HOME-REDESIGN, redesign participante, nova home 2026 |

---

## Design Thinking

Antes de codar, entender o contexto e comprometer-se com uma direção estética BOLD:

- **Propósito**: Qual problema essa interface resolve? Quem usa?
- **Tom**: Escolher um extremo: brutalmente minimal, caos maximalista, retro-futurista, orgânico/natural, luxo/refinado, playful/toy-like, editorial/magazine, brutalista/raw, art déco/geométrico, soft/pastel, industrial/utilitário, etc.
- **Restrições**: Requisitos técnicos (framework, performance, acessibilidade)
- **Diferenciação**: O que torna isso INESQUECÍVEL? O que alguém vai lembrar?

**CRÍTICO**: Escolher uma direção conceitual clara e executar com precisão. Maximalismo bold e minimalismo refinado ambos funcionam — a chave é intencionalidade, não intensidade.

Então implementar código funcional (HTML/CSS/JS, React, Vue, etc.) que é:
- Production-grade e funcional
- Visualmente marcante e memorável
- Coeso com um ponto de vista estético claro
- Meticulosamente refinado em cada detalhe

---

## Pilares Estéticos

### 1. Tipografia

Escolher fontes que são bonitas, únicas e interessantes. **Evitar fontes genéricas** como Arial e Inter; optar por escolhas distintivas que elevam a estética.

**No contexto Super Cartola Manager:**
- Títulos/Stats: **Russo One**
- Corpo: **Inter** (permitido aqui por ser o design system do projeto)
- Números: **JetBrains Mono**

### 2. Cor & Tema

Comprometer-se com uma estética coesa. Usar CSS variables para consistência. Cores dominantes com acentos nítidos superam paletas tímidas e distribuídas uniformemente.

**No contexto Super Cartola Manager:**
- Dark mode estrito (`bg-gray-900`, `bg-slate-900`)
- Usar variáveis de `_admin-tokens.css`
- Cores dos módulos: Verde Artilheiro, Roxo Capitão, Dourado Luva

### 3. Motion

Usar animações para efeitos e micro-interações. Priorizar soluções CSS-only para HTML. Focar em momentos de alto impacto: uma entrada de página bem orquestrada com reveals escalonados (`animation-delay`) cria mais encantamento do que micro-interações dispersas.

- Scroll-triggering
- Hover states que surpreendem
- Staggered reveals na entrada

### 4. Composição Espacial

- Layouts inesperados
- Assimetria
- Sobreposição
- Fluxo diagonal
- Elementos que quebram a grade
- Espaço negativo generoso OU densidade controlada

### 5. Fundos & Detalhes Visuais

Criar atmosfera e profundidade ao invés de defaultar para cores sólidas:

- Gradient meshes
- Noise textures
- Padrões geométricos
- Transparências em camadas
- Sombras dramáticas
- Bordas decorativas
- Cursores customizados
- Grain overlays

---

## Proibições Absolutas

NUNCA usar estéticas genéricas de AI:

| Proibido | Por quê |
|----------|---------|
| Inter, Roboto, Arial, system fonts | Fontes overused, sem caráter |
| Gradientes roxos em fundo branco | Clichê de AI |
| Layouts previsíveis | Falta de diferenciação |
| Padrões de componentes genéricos | Cookie-cutter design |
| Space Grotesk como padrão | Convergência comum entre gerações |
| Emojis no código | Renderizam diferente por OS (usar Material Icons) |
| Cores hardcoded | Usar variáveis CSS sempre |

---

## Regra de Complexidade

Combinar complexidade de implementação com a visão estética:

| Visão | Implementação |
|-------|---------------|
| **Maximalista** | Código elaborado com animações extensas e efeitos ricos |
| **Minimalista** | Contenção, precisão, atenção cuidadosa a espaçamento, tipografia e detalhes sutis |

A elegância vem de executar bem a visão escolhida.

---

## Integração com Outras Skills

```
frontend-design (AESTHETICS)     ← Autoridade estética, define direção visual
    ↓
anti-frankenstein (GOVERNANCE)   ← Verifica o que já existe antes de criar CSS
    ↓
frontend-crafter (IMPLEMENTATION) ← Executa o código seguindo design system
```

---

## Invocação

### Claude Code
```bash
/frontend-design
```

### Por Keywords (automático)
Qualquer menção a: redesign, nova tela, visual do app, deixar bonito, criar interface, etc.

### Outras IAs
```
Use a skill frontend-design para criar uma interface distintiva.
Evite estética genérica de AI. Comprometa-se com um tom visual bold.
```

---

## Pre-Delivery Checklist

Antes de considerar qualquer interface **pronta para produção**, validar todos os itens:

### Visual
- [ ] Contraste de texto legível em dark mode (mínimo 4.5:1 para texto, 3:1 para elementos grandes)
- [ ] Fontes corretas aplicadas (Russo One em títulos, JetBrains Mono em números, Inter em corpo)
- [ ] Cores exclusivamente via variáveis CSS (`var(--token)`) — zero hardcoded
- [ ] Ícones Material Icons com cores tematizadas — zero emojis
- [ ] Hierarquia visual clara: título > subtítulo > corpo > muted

### Interação
- [ ] Todos os elementos clicáveis têm `cursor: pointer`
- [ ] Hover states definidos em botões, links e cards interativos
- [ ] Touch targets mínimo 44x44px em mobile
- [ ] Loading states visíveis durante operações assíncronas
- [ ] Feedback visual em ações (toast, highlight, animação)

### Responsivo
- [ ] Testado em 360px (mobile mínimo) — sem overflow horizontal
- [ ] Testado em 768px (tablet) — layout adapta sem quebrar
- [ ] Testado em 1440px (desktop) — aproveitamento de espaço adequado
- [ ] Textos legíveis sem zoom em mobile (mínimo 14px corpo, 12px captions)

### Consistência
- [ ] Segue padrões do módulo existente (se editando módulo)
- [ ] Animações de entrada escalonadas onde aplicável
- [ ] Espaçamentos usando tokens ou valores consistentes
- [ ] Sem elementos que "flutuam" sem contexto visual

---

## Anti-Patterns de UI Esportiva

Erros específicos a evitar no contexto de aplicativos de fantasy football / gestão esportiva:

| Anti-Pattern | Por que é ruim | Alternativa correta |
|-------------|----------------|---------------------|
| **Dashboard genérico de SaaS** | Parece planilha corporativa, não app esportivo | Cards com identidade visual forte, cores dos módulos, tipografia bold |
| **Excesso de tabelas sem hierarquia** | Rankings viram "muro de números" ilegível | Destacar top 3, usar cores de posição (ouro/prata/bronze), badges visuais |
| **Gráficos coloridos demais** | Poluição visual, perde o foco no dado importante | Monocromático com accent color no dado-chave, max 3-4 cores por gráfico |
| **Cards todos do mesmo tamanho** | Falta de hierarquia, tudo parece igualmente (des)importante | Card hero para dado principal, cards menores para secundários |
| **Números sem contexto** | "93.78" sozinho não comunica se é bom ou ruim | Sempre acompanhar com indicador visual (seta, cor verde/vermelho, posição) |
| **Animações em dados ao vivo** | Distrai durante acompanhamento de rodada, atrapalha leitura | Animação apenas na entrada; dados ao vivo atualizam com transição suave, sem bounce |
| **Tons pastéis ou claros** | Contrasta com a identidade dark/esportiva do projeto | Dark mode estrito, acentos vibrantes sobre fundo escuro |
| **Layout desktop-first** | 80%+ dos usuários acessam por mobile durante jogos | Mobile-first obrigatório, desktop como adaptação |

---

## Prioridade em Trade-offs UX

Quando uma decisão estética conflita com usabilidade, seguir esta hierarquia (de cima para baixo):

| Prioridade | Categoria | Exemplo de trade-off |
|-----------|-----------|---------------------|
| **1 - CRÍTICA** | **Acessibilidade** | Contraste > estética — se o gradiente bonito torna texto ilegível, ajustar o gradiente |
| **2 - CRÍTICA** | **Touch & Interação** | Área clicável > compactação visual — botão maior mesmo que "quebre" o grid |
| **3 - ALTA** | **Performance** | Carregamento rápido > animação elaborada — reduzir motion se impacta LCP |
| **4 - ALTA** | **Responsividade** | Funcionar em 360px > layout ideal em desktop — mobile é o caso primário |
| **5 - MÉDIA** | **Consistência** | Seguir design system > inovação pontual — coerência entre telas > tela individual bonita |
| **6 - MÉDIA** | **Estética** | Liberdade criativa dentro dos limites acima |

**Regra prática:** Se estiver em dúvida entre "mais bonito" e "mais funcional", escolha funcional. Depois busque torná-lo bonito dentro dessa restrição.

---

**Versão:** 1.1.0
**Baseada em:** Anthropic Skills (https://github.com/anthropics/skills) + conceitos de [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
**Adaptada para:** Super Cartola Manager
