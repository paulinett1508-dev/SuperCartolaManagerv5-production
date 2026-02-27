# Tarefas Pendentes

---

## 🔴 [PRIMEIRA EXECUÇÃO] Widget "O que tá rolando?" — Card Resta Um com infos corretas

**Status:** Pendente — múltiplas tentativas falharam, provavelmente cache do Service Worker impedindo visualização real das mudanças
**Prioridade:** Alta — executar ANTES de qualquer outra tarefa

### Contexto completo

O widget "O que tá rolando?" (`public/participante/js/widgets/whats-happening-widget.js`) tem um card de Resta Um que só mostra `35/35 vivos` (dados agregados). O usuário quer que o card mostre:
1. **Campeão da rodada** (1º lugar nos pontos da rodada)
2. **Minha posição** (se não for líder/quase/eliminado)
3. **Quase!** (penúltimo vivo — em perigo)
4. **ELIMINADO** (último vivo projetado OU eliminado real)
5. Botão **"Ver Resta Um completo"** que navega para o módulo

### O que já foi feito (código já está no arquivo)

O `renderCardRestaUm()` em `whats-happening-widget.js` **JÁ FOI REESCRITO** — ele agora tem:
- `style="grid-column:1/-1"` para span full-width no grid
- linhas de campeão, minha pos, quase, eliminado (classes `wh-compact-leader`)
- botão "Ver Resta Um completo" com `stopPropagation`

O backend `obterParciais` em `controllers/restaUmController.js` **JÁ FOI CORRIGIDO**:
- `rodadaParaBuscar = edicao.rodadaAtual || edicao.rodadaInicial` (restaurado)
- Só chama `_buscarPontosViaParciais` (API lenta) quando `edicao.rodadaAtual` existe
- Para edição pendente (`rodadaAtual: null`), usa `rodadaInicial` (rodada 4) — busca na collection `Rodada`, sem timeout

### Suspeita do problema atual

**Service Worker** (`public/participante/service-worker.js`) está servindo versão antiga do widget em cache. As mudanças no código existem mas o browser recebe o arquivo antigo.

### Diagnóstico para nova sessão

1. **Verificar cache SW**: abrir DevTools → Application → Service Workers → verificar se está registrado e qual CACHE_NAME está ativo
2. **Confirmar que o código mudou**: ler `renderCardRestaUm()` em `whats-happening-widget.js` — deve ter `grid-column:1/-1` e linhas de jogadores
3. **Se SW for o problema**: bumpar `CACHE_NAME` no `public/participante/service-worker.js` para forçar invalidação de todos os caches

### Arquivos chave
- `public/participante/js/widgets/whats-happening-widget.js` — `renderCardRestaUm()` (linha ~1512)
- `public/participante/js/participante-navigation.js` — importa widget com `?v=Date.now()` (linha ~377)
- `public/participante/index.html` — versão atual do navigation: `v=27.02.26.0003`
- `public/participante/service-worker.js` — CACHE_NAME a bumpar se necessário
- `controllers/restaUmController.js` — `obterParciais()` (linha ~379)

### Dados do Resta Um no DB (para referência)
- Edição: `pendente`, `rodadaAtual: null`, `rodadaInicial: 4`
- 35 participantes com `status: 'vivo'`, `pontosAcumulados: 0`
- A ordenação correta vem dos pontos da rodada 4 na collection `Rodada` (ligaId relevante)
- Exemplo esperado: CAMPEÃO: Vitim / QUASE: Rodrigo / ELIMINADO: Lucas Sousa

---

## Baixar imagens dos estádios da Copa 2026

**Status:** Pendente
**Contexto:** O curl do Replit retorna HTTP 429 (rate limit) no Wikipedia. Precisa baixar manualmente no PC e fazer upload para `/public/img/estadios/`.

**Depois do upload:**
1. Atualizar `config/copa-do-mundo-2026.js` — trocar URLs do Wikipedia por paths locais (`/img/estadios/nome.jpg`)
2. Bumpar `CACHE_NAME` no Service Worker (`public/participante/service-worker.js`)

### Arquivos e URLs

| Arquivo | URL |
|---------|-----|
| `metlife-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Metlife_stadium_%28Aerial_view%29.jpg/640px-Metlife_stadium_%28Aerial_view%29.jpg |
| `sofi-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/SoFi_Stadium_exterior_2.jpg/640px-SoFi_Stadium_exterior_2.jpg |
| `att-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Cowboys_Stadium_full_view.jpg/640px-Cowboys_Stadium_full_view.jpg |
| `hard-rock-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Hard_Rock_Stadium_aerial_2023.jpg/640px-Hard_Rock_Stadium_aerial_2023.jpg |
| `mercedes-benz-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Mercedes-Benz_Stadium%2C_October_2017.jpg/640px-Mercedes-Benz_Stadium%2C_October_2017.jpg |
| `nrg-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/NRG_Stadium_-_Houston%2C_Texas.jpg/640px-NRG_Stadium_-_Houston%2C_Texas.jpg |
| `lumen-field.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/CenturyLink_Field_-_MLS_Cup_2016.jpg/640px-CenturyLink_Field_-_MLS_Cup_2016.jpg |
| `lincoln-financial-field.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Lincoln_Financial_Field_%28Aerial_view%29.jpg/640px-Lincoln_Financial_Field_%28Aerial_view%29.jpg |
| `arrowhead-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Arrowhead_Stadium_%2814586858494%29.jpg/640px-Arrowhead_Stadium_%2814586858494%29.jpg |
| `gillette-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Gillette_Stadium_%28Top_View%29.jpg/640px-Gillette_Stadium_%28Top_View%29.jpg |
| `levis-stadium.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Levi%27s_Stadium_aerial.jpg/640px-Levi%27s_Stadium_aerial.jpg |
| `estadio-azteca.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Azteca_Entrance.jpg/640px-Azteca_Entrance.jpg |
| `estadio-bbva.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/EstadioRayados.JPG/640px-EstadioRayados.JPG |
| `estadio-akron.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Estadio_Chivas.jpg/640px-Estadio_Chivas.jpg |
| `bc-place.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Interior_BC_Place_2015.jpg/640px-Interior_BC_Place_2015.jpg |
| `bmo-field.jpg` | https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/BMO_Field_2016_East_Stand.jpg/640px-BMO_Field_2016_East_Stand.jpg |

### Mapeamento Estádio -> Arquivo

| Estádio | Arquivo |
|---------|---------|
| MetLife Stadium | `metlife-stadium.jpg` |
| SoFi Stadium | `sofi-stadium.jpg` |
| AT&T Stadium | `att-stadium.jpg` |
| Hard Rock Stadium | `hard-rock-stadium.jpg` |
| Mercedes-Benz Stadium | `mercedes-benz-stadium.jpg` |
| NRG Stadium | `nrg-stadium.jpg` |
| Lumen Field | `lumen-field.jpg` |
| Lincoln Financial Field | `lincoln-financial-field.jpg` |
| Arrowhead Stadium | `arrowhead-stadium.jpg` |
| Gillette Stadium | `gillette-stadium.jpg` |
| Levi's Stadium | `levis-stadium.jpg` |
| Estadio Azteca | `estadio-azteca.jpg` |
| Estadio BBVA | `estadio-bbva.jpg` |
| Estadio Akron | `estadio-akron.jpg` |
| BC Place | `bc-place.jpg` |
| BMO Field | `bmo-field.jpg` |
