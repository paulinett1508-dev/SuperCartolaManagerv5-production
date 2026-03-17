# Módulo Pontos Corridos

## Regra de Negócio Fundamental

O Pontos Corridos é um campeonato **todos contra todos (round-robin)** ao longo da temporada.
Cada par de participantes se enfrenta uma vez. A classificação acumula vitórias, empates, derrotas e saldo de gols.

---

## Sistema de BYE (Liga com Número Ímpar de Times)

### Regra crítica

Quando a liga tem **número ímpar de participantes**, o algoritmo round-robin adiciona um slot
virtual `null` (BYE) para fechar o total em par. A cada rodada, **um time diferente** cai no
par com o BYE — esse time **folga** naquela rodada, sem jogo.

### Comportamento esperado

| Propriedade | Comportamento |
|-------------|--------------|
| `jogos` | **NÃO é incrementado** na rodada de folga |
| `pontos` | Permanece igual (não ganha, não perde) |
| `gols_pro / gols_contra` | Não alteram |
| `financeiro` | Não altera |
| `posicao` | Calculado normalmente (pode subir por ordenação) |

### Distribuição das folgas

Com **N** times (ímpar):
- Bracket tem **N rodadas** (ex: 35 times → 35 rodadas)
- Cada time **folga exatamente 1 vez** em todo o campeonato
- A folga rotaciona deterministicamente pela ordem canônica do bracket

### Exemplo — Liga com 35 times

```
R1: Antonio Luis folga (BYE)
R2: próximo na rotação folga
...
R35: último da ordem folga
```

Nenhum time folga duas vezes antes de todos terem folgado uma vez.

---

## Geração de Bracket

### Algoritmo round-robin (rotação)

```js
function gerarBracket(ids) {
    const lista = [...ids];
    if (lista.length % 2 !== 0) lista.push(null); // BYE para número ímpar
    const total = lista.length - 1;
    for (let r = 0; r < total; r++) {
        // confrontos: posições [i] vs [length-1-i]
        lista.splice(1, 0, lista.pop()); // rotação: último → posição 1
    }
}
```

- A **ordem canônica** dos IDs define todos os confrontos de todas as rodadas
- Ordem canônica = `liga.participantes` ordenados por `nome_cartola` (alfabético)
- Uma vez gerado o bracket, a ordem é gravada nos caches e usada como **fonte da verdade absoluta**

### Fonte da verdade do bracket

O backend (`pontosCorridosCacheController.js`) segue esta prioridade:
1. **Extrair ordem do cache já salvo** (confrontos existentes no MongoDB) — garante consistência histórica
2. **Fallback para `liga.participantes`** — apenas quando não há nenhum cache anterior

---

## `rodadaInicial`

Define a partir de qual rodada do Brasileirão o módulo PC começa.

**Fonte correta (em ordem de prioridade):**
```js
// 1. Preferido — já disponível no objeto liga, sem query extra
liga.configuracoes?.pontos_corridos?.rodadaInicial

// 2. Também no liga
liga.configuracoes?.temporada_2026?.rodada_inicial

// 3. ModuleConfig (via ModuleConfig.buscarConfig / buscarConfigSimplificada)
// NUNCA usar raw db.collection('moduleconfigs').findOne({liga_id: ObjectId(...)})
// — o campo liga_id em moduleconfigs pode ser String ou ObjectId dependendo da versão.
// Usar sempre o modelo: ModuleConfig.buscarConfig(ligaId, 'pontos_corridos', temporada)
```

> **Regra:** em scripts standalone, ler `rodadaInicial` de `liga.configuracoes` diretamente.
> Em controllers, usar `buscarConfigSimplificada` do `moduleConfigHelper.js`.

---

## Cache (`pontoscorridoscaches`)

### Schema resumido

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `liga_id` | String | ID da liga (String, não ObjectId) |
| `rodada_consolidada` | Number | Rodada do PC (1, 2, 3...) não do BR |
| `temporada` | Number | Ex: 2026 |
| `cache_permanente` | Boolean | `true` = nunca regenera automaticamente |
| `confrontos` | Array | 17 confrontos (liga 35 times) ou N/2 |
| `classificacao` | Array | 35 entradas, ordenada por pontos |
| `regenerado_por` | String | Rastreabilidade (script ou controller) |

### `cache_permanente: true`

Caches marcados como permanentes **nunca são regerados automaticamente** pelo scheduler.
Isso preserva o histórico de rodadas já disputadas. Para regerá-los, use o script:

```bash
node scripts/regenerar-bracket-pontos-corridos.js --liga-id <id> --force
```

---

## Regra Crítica: Participante Adicionado Após Bracket Gerado

**Problema:** Se um participante é inscrito depois que o bracket já foi gerado e salvo com
`cache_permanente: true`, ele **nunca aparecerá** nos confrontos dos caches existentes.
Ficará na `classificacao` com `jogos: 0 / pontos: 0` para sempre.

**Sintoma no admin:** o JS do admin detecta o participante em `liga.participantes` (35 times)
mas não o encontra nos confrontos do cache (34 times). Ele trata o participante ausente como
"time com BYE em todas as rodadas" e reconstrói um bracket fictício — os confrontos exibidos
no admin são **matematicamente incorretos**.

**Solução:** Regenerar todos os caches da temporada com o script acima.

**Prevenção:** Ao adicionar um participante a uma liga com PC ativo e caches já gerados,
o sistema deve:
1. Detectar a divergência (n_participantes_liga ≠ n_times_no_cache)
2. Alertar o admin
3. Exigir regeneração do bracket antes de prosseguir

---

## Relação entre Rodada do BR e Rodada do PC

```
rodada_pc = rodada_br - rodadaInicial + 1

Exemplo (rodadaInicial = 2):
  BR R2 → PC R1
  BR R3 → PC R2
  BR R4 → PC R3
  ...
  BR R36 → PC R35   (para liga com 35 times)
```

---

## Arquivos Principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `controllers/pontosCorridosCacheController.js` | Endpoints API, geração e reconstrução de cache |
| `utils/moduleConfigHelper.js` | `buscarConfigSimplificada` — lê rodadaInicial do ModuleConfig |
| `models/PontosCorridosCache.js` | Schema MongoDB |
| `models/ModuleConfig.js` | Config do módulo (rodadaInicial, critérios, financeiro) |
| `public/js/pontos-corridos/pontos-corridos-orquestrador.js` | Frontend admin — geração de bracket local |
| `scripts/regenerar-bracket-pontos-corridos.js` | Regeneração de caches com bracket correto |

---

## Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/pontos-corridos/:ligaId` | GET | Todos os caches da temporada |
| `/api/pontos-corridos/cache/:ligaId` | GET/POST | Cache de rodada específica |
| `/api/pontos-corridos/config/:ligaId` | GET | Configuração simplificada do módulo |
