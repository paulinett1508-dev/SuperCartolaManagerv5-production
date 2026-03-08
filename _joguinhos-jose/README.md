# Joguinhos

Mini-games extraidos do [Super Cartola Manager](https://github.com/paulinett1508-dev/SuperCartolaManagerv5).

## Jogos Disponiveis

### Penaltis
Jogo arcade 8-bit de cobranca de penaltis em canvas.

- **Modos:** Cobrador (striker) e Goleiro (keeper)
- **Dificuldades:** Facil, Medio, Dificil, Muito Dificil
- **Controles:** Mouse/touch (clique nas zonas do gol) + Teclado (Q/W/E + A/S/D = grid 3x3)
- **Canvas:** 360x240px

### Escorpiao
Canvas interativo fullscreen onde um escorpiao segue o mouse.

- **Estrutura:** 16 segmentos (1 cabeca + 8 corpo com patas + 6 cauda com ferrao)
- **Controles:** Mouse/touch para guiar, ESC para sair
- **Efeitos:** Patas animadas, ferrao com glow, olhos com reflexo, garras articuladas

## Como Usar

### Demo rapida
Abra `jogos/index.html` no navegador.

### Integracao em projeto
```html
<!-- Dependencias: Google Fonts + Material Icons -->
<link href="https://fonts.googleapis.com/css2?family=Russo+One&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">

<!-- Scripts dos jogos -->
<script src="jogos/penaltis.js"></script>
<script src="jogos/escorpiao.js"></script>
<script src="jogos/joguinhos-modal.js"></script>
```

### API

```javascript
// Abrir modal de selecao de jogos
window.abrirJoguinhos();

// Penaltis direto (passar ID ou elemento DOM do container)
window.PenaltisGame.abrir('meu-container');
window.PenaltisGame.fechar();

// Escorpiao direto (fullscreen)
window.EscorpiaoGame.abrir();
window.EscorpiaoGame.fechar();
```

## Estrutura

```
jogos/
  index.html          # Pagina demo
  penaltis.js         # Jogo de Penaltis standalone
  escorpiao.js        # Jogo Escorpiao standalone
  joguinhos-modal.js  # Modal de selecao de jogos
docs/
  ORIGEM.md           # Referencia de onde cada codigo veio
```

## Origem

Codigo extraido de `SuperCartolaManagerv5` onde os joguinhos apareciam em dois contextos:
1. **Tela de manutencao** — Penaltis disponivel para todos os usuarios quando o sistema estava em manutencao
2. **Chip "Joguinhos" na home** — Penaltis + Escorpiao disponiveis para usuarios Premium (Cartola PRO)

Detalhes completos em [`docs/ORIGEM.md`](docs/ORIGEM.md).

## Tech Stack

- Vanilla JS (zero dependencias)
- Canvas 2D API
- Material Icons (via CDN)
- Google Fonts: Russo One, Inter, JetBrains Mono
