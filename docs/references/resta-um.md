# Módulo Resta Um

## Regra de Negócio Fundamental

O Resta Um é um módulo de **eliminação rodada a rodada**. Cada rodada é independente:
- Os pontos obtidos **naquela rodada** definem o eliminado (menor pontuação)
- **NÃO existe acumulado** para fins de ranking/exibição
- O campo `pontosAcumulados` existe no cache apenas como metadado de desempate

## Arquitetura

### Arquivos Principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `controllers/restaUmController.js` | Endpoints API (status, parciais, iniciar, editar) |
| `services/orchestrator/managers/RestaUmManager.js` | Consolidação (onConsolidate hook) |
| `models/RestaUmCache.js` | Schema MongoDB do cache |
| `public/participante/js/modules/participante-resta-um.js` | Frontend (renderização, auto-refresh) |
| `public/participante/js/orquestradores/resta-um-orquestrador.js` | Orquestrador (CSS injetado, polling) |
| `scripts/reparar-resta-um.js` | Script de reparo (dry-run/--force) |

### Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/resta-um/:ligaId/status` | GET | Estado atual (rodada consolidada + pontos) |
| `/api/resta-um/:ligaId/parciais` | GET | Ranking parcial ao vivo |
| `/api/resta-um/:ligaId/edicoes` | GET | Listar edições da temporada |
| `/api/resta-um/:ligaId/iniciar` | POST | Admin: iniciar edição |
| `/api/resta-um/:ligaId/editar/:edicao` | PUT | Admin: editar edição |

## Fluxo de Dados

### 1. Rodada ao Vivo (`isLive: true`)
1. `orchestrator_states.status_mercado === 2` (mercado fechado)
2. Pontos carregados da collection `Rodada` (parciais em tempo real)
3. Frontend: auto-refresh a cada **30s**
4. Exibe `pontosRodada`, ordena por `pontosRodada` DESC
5. Zona de perigo visível (últimos N participantes)

### 2. Rodada Consolidada (`isLive: false`)
1. Mercado aberto, rodada finalizada
2. Pontos carregados da collection `Rodada` para `rodadaAtual`
3. Frontend: auto-refresh a cada **60s**
4. Exibe `pontosRodada`, ordena por `pontosRodada` DESC
5. Sem zona de perigo visual

### 3. Consolidação (RestaUmManager.onConsolidate)
1. Carrega pontuações da `Rodada` consolidada
2. Atualiza `pontosAcumulados` e `pontosRodada` no cache
3. Ordena por `pontosRodada` ASC (piores primeiro)
4. Elimina os N piores (`eliminadosPorRodada`)
5. Critérios de desempate: pontosRodada → pontosAcumulados → vezesNaZona → ranking geral
6. Guard de idempotência: `rodadaAtual >= rodada` → ignora

## Ordenação e Exibição (REGRA CRÍTICA)

**SEMPRE** exibir `pontosRodada` e ordenar por `pontosRodada` DESC, tanto em modo live quanto consolidado.

- **Vivos:** ordenados por `pontosRodada` DESC, desempate por `pontosAcumulados`
- **Eliminados:** ordenados por `rodadaEliminacao` DESC (mais recente primeiro)
- **Eliminados preservam** o `pontosRodada` da rodada em que foram eliminados (NÃO é sobrescrito pela rodada vigente)

## Proteções

- **Proteção da 1ª rodada:** `protecaoPrimeiraRodada: true` → sem eliminação na rodada inicial
- **Idempotência:** `rodadaAtual` salvo ANTES do processamento
- **Validação de cobertura:** verifica se todos os vivos têm score antes de eliminar
- **Nunca eliminar todos:** `Math.min(eliminadosPorRodada, vivos.length - 1)`

## Schema (RestaUmCache)

```javascript
{
  liga_id, edicao, temporada,
  nome, rodadaInicial, rodadaFinal,
  eliminadosPorRodada,           // quantos eliminar por rodada
  protecaoPrimeiraRodada,        // boolean
  status,                        // 'pendente' | 'em_andamento' | 'finalizada'
  rodadaAtual,                   // última rodada consolidada
  participantes: [{
    timeId, nomeTime, nomeCartoleiro, escudoId,
    status,                      // 'vivo' | 'eliminado' | 'campeao'
    pontosRodada,                // pontos da última rodada processada
    pontosAcumulados,            // soma total (metadado de desempate)
    rodadaEliminacao,            // rodada em que foi eliminado
    rodadasSobrevividas,
    vezesNaZona,
  }],
  historicoEliminacoes: [{ rodada, timeId, nomeTime, pontosRodada }],
  premiacao: { campeao, vice, terceiro, ... },
  fluxoFinanceiroHabilitado, taxaEliminacao,
}
```

## Script de Reparo

```bash
node scripts/reparar-resta-um.js              # dry-run (simulação)
node scripts/reparar-resta-um.js --force      # aplica correções
```

Recalcula tudo a partir da collection `Rodada` (fonte de verdade): `pontosAcumulados`, `pontosRodada`, `status`, `rodadaEliminacao`, `historicoEliminacoes`.

**Nota:** O script usa `toFixed(2)` para exibição (arredonda), mas os dados reais usam `truncarPontosNum()` (trunca). Diferenças de 0.01 na saída do script são esperadas.
