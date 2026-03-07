# Origem dos Joguinhos

Codigo extraido do repositorio **SuperCartolaManagerv5** em 2026-03-07.

## Mapeamento de Arquivos

### Jogo de Penaltis

| Origem (SuperCartolaManagerv5) | Destino (joguinhos-jose) |
|-------------------------------|--------------------------|
| `public/participante/js/manutencao-screen.js` (linhas 688-1382) | `jogos/penaltis.js` |
| `public/participante/index.html` (linha 975-979) — Botao na tela de manutencao | Integrado no modal |
| `public/participante/index.html` (linha 991-992) — Container `manutencaoPenaltyContainer` | Container criado dinamicamente |

**Contexto original:** O jogo de penaltis era exibido na tela de manutencao do sistema (quando o app ficava offline) como entretenimento para os usuarios. Tambem era acessivel via chip "Joguinhos" na home para usuarios Premium.

### Jogo do Escorpiao

| Origem (SuperCartolaManagerv5) | Destino (joguinhos-jose) |
|-------------------------------|--------------------------|
| `public/participante/js/participante-joguinhos.js` (linhas 249-643) | `jogos/escorpiao.js` |

**Contexto original:** Canvas interativo onde um escorpiao de 16 segmentos segue o mouse. Acessivel apenas para usuarios Premium via chip "Joguinhos" na home.

### Modal de Selecao

| Origem (SuperCartolaManagerv5) | Destino (joguinhos-jose) |
|-------------------------------|--------------------------|
| `public/participante/js/participante-joguinhos.js` (linhas 26-135) | `jogos/joguinhos-modal.js` |

**Contexto original:** Modal overlay que permitia escolher entre Penaltis e Escorpiao. Aberto ao clicar no chip "Joguinhos" na home do participante.

### Pontos de Integracao (nao extraidos)

Estes trechos eram a "cola" que integrava os joguinhos ao SuperCartolaManager. Nao foram extraidos, mas estao documentados aqui para referencia:

| Arquivo | Linha(s) | Funcao |
|---------|----------|--------|
| `public/participante/fronts/home.html` | 21-26 | Botao `btn-joguinhos` com lazy-loading do script |
| `public/participante/js/modules/participante-home.js` | 1187-1191 | Controle de visibilidade do botao (premium only, via `/api/cartola-pro/verificar-premium`) |
| `public/participante/index.html` | 1150 | Script tag `<script src="js/participante-joguinhos.js" defer>` |
| `routes/cartola-pro-routes.js` | — | Endpoint `GET /api/cartola-pro/verificar-premium` |
| `utils/premium-participante.js` | — | Funcao `verificarParticipantePremium()` |

## Modificacoes na Extracao

1. **Penaltis desacoplado do ManutencaoScreen** — No original, o jogo reutilizava o container e metodos de `ManutencaoScreen`. Na versao standalone, o jogo recebe um container DOM qualquer via `PenaltisGame.abrir(containerEl)`.

2. **CSS variables substituidas por cores fixas** — O original usava `var(--app-pos-gol-light)`, `var(--app-success-light)`, etc. Na versao standalone, foram substituidas por cores hex equivalentes (`#fb923c`, `#4ade80`, etc.).

3. **Emojis substituidos por Material Icons** — Seguindo a regra do CLAUDE.md original, emojis foram substituidos por Material Icons onde possivel.

4. **Escorpiao ja era standalone** — O jogo do escorpiao ja criava seu proprio overlay fullscreen, entao foi extraido quase sem modificacoes.
