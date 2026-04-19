# Copa de Times SC — Design Spec
**Data:** 2026-04-19  
**Status:** Aprovado pelo usuário  
**Módulo:** `copa_sc` (novo)

---

## 1. Visão Geral

Disputa eliminatória estilo Copa do Mundo integrada à Liga SuperCartola (35 times).  
Formato: Fase Classificatória → 8 Grupos de 4 → Oitavas → Quartas → Semis → 3º Lugar + Final.  
Inicia na rodada 20 do Brasileirão (1ª rodada do 2º turno).

---

## 2. Regras de Negócio

### 2.1 Participantes
- Liga SuperCartola: 35 times fixos.
- **Fase Classificatória** elimina 3 → 32 classificados para os grupos.

### 2.2 Fase Classificatória (rodadas 20–23)
- Os times 33°, 34° e 35° do Pontos Corridos disputam 2 confrontos eliminatórios sequenciais.
- Cada confronto = 2 rodadas do Cartola (soma de pontos).
- **Confronto 1** (rod. 20–21): 33° vs 34° do PC — pior pontuação eliminado.
- **Confronto 2** (rod. 22–23): Vencedor do C1 vs 35° — pior pontuação eliminado.
- Empate: desempate por melhor posição no Ranking Geral da temporada.
- 1 sobrevivente completa os 31 qualificados diretos = 32 classificados.

### 2.3 Sorteio dos Grupos
- Realizado após a rodada 23 ser processada (32 classificados definidos).
- **Cabeças-de-chave:** top 8 do Ranking Geral — 1 por grupo (Grupos A–H).
- **Demais 24:** sorteio aleatório nas posições restantes de cada grupo.
- Admin dispara o sorteio pela tela de administração.

### 2.4 Fase de Grupos (rodadas 24–26)
- 8 grupos de 4 times; cada time joga 3 partidas (round-robin).
- Cada partida = 1 rodada do Cartola.
- **Standings — critérios em ordem:**
  1. Pontos (V=3, E=1, D=0)
  2. Vitórias
  3. Saldo de pontos Cartola (marcados − sofridos)
  4. Pontos marcados
  5. Posição no Ranking Geral
- Os **2 primeiros** de cada grupo avançam (16 classificados para oitavas).
- **Sem impacto financeiro** na fase de grupos.

### 2.5 Mata-Mata (rodadas 27–34)
- Cada confronto = soma de pontos em 2 rodadas consecutivas do Cartola.
- Empate: desempate por melhor posição no Ranking Geral.
- **Chaveamento (oitavas):** 1° Grupo A vs 2° Grupo B, 1° Grupo B vs 2° Grupo A, etc. (formato Copa do Mundo).
- 3° lugar e Final disputados simultaneamente nas rodadas 33–34.

### 2.6 Premiação Financeira
- Apenas ao encerramento do torneio (rodada 34 processada).
- Valores configurados pelo admin antes do início.
- Posições premiadas: Campeão, Vice, 3° Lugar.
- Lançamento via `tipo: "AJUSTE"` com `rodada: null` (padrão do sistema de módulos).

---

## 3. Calendário

| Fase | Rodadas Cartola | Ação |
|---|---|---|
| Classificatória — Confronto 1 | 20–21 | 33° vs 34° do PC |
| Classificatória — Confronto 2 | 22–23 | Vencedor vs 35° |
| **Sorteio dos Grupos** | após rod. 23 | Admin dispara |
| Grupos — Jornada 1 | 24 | Round-robin |
| Grupos — Jornada 2 | 25 | Round-robin |
| Grupos — Jornada 3 | 26 | Standings finais |
| Oitavas de Final | 27–28 | 16 → 8 |
| Quartas de Final | 29–30 | 8 → 4 |
| Semifinais | 31–32 | 4 → 2 |
| 3° Lugar + Final | 33–34 | Simultâneos |
| Encerrado | 35–38 | 4 rodadas livres |

---

## 4. Arquitetura de Dados

### 4.1 Collection `copascconfigs`
Um documento por liga por temporada.

```json
{
  "liga_id": "ObjectId",
  "temporada": "2026",
  "status": "pre_sorteio | classificatorio | grupos | oitavas | quartas | semis | terceiro_lugar | final | encerrado",
  "cabecas_de_chave": ["ObjectId"],
  "grupos": [
    {
      "nome": "A",
      "times": ["ObjectId"],
      "standings": [
        {
          "participante_id": "ObjectId",
          "pontos": 0,
          "jogos": 0,
          "vitorias": 0,
          "empates": 0,
          "derrotas": 0,
          "pontos_marcados": 0,
          "pontos_sofridos": 0,
          "saldo": 0
        }
      ]
    }
  ],
  "calendario": {
    "classificatorio": [20, 21, 22, 23],
    "grupos": [24, 25, 26],
    "oitavas": [27, 28],
    "quartas": [29, 30],
    "semis": [31, 32],
    "terceiro_lugar": [33, 34],
    "final": [33, 34]
  },
  "premiacao": {
    "campeao": 0,
    "vice": 0,
    "terceiro": 0
  },
  "sorteio_realizado_em": "Date | null",
  "encerrado_em": "Date | null"
}
```

### 4.2 Collection `copascmatches`
Um documento por confronto.

```json
{
  "liga_id": "ObjectId",
  "temporada": "2026",
  "fase": "classificatorio | grupos | oitavas | quartas | semis | terceiro_lugar | final",
  "rodadas_cartola": [20, 21],
  "pontos_por_rodada": "array length = len(rodadas_cartola): 1 nos grupos, 2 no mata-mata",
  "grupo": "A | null",
  "confronto_num": 1,
  "mandante_id": "ObjectId",
  "visitante_id": "ObjectId",
  "pontos": {
    "mandante": [0, 0],
    "visitante": [0, 0]
  },
  "total": {
    "mandante": 0,
    "visitante": 0
  },
  "vencedor_id": "ObjectId | null",
  "status": "agendado | em_andamento | finalizado"
}
```

---

## 5. Componentes Backend

| Arquivo | Responsabilidade |
|---|---|
| `models/CopaSCConfig.js` | Schema copascconfigs |
| `models/CopaSCMatch.js` | Schema copascmatches |
| `controllers/copaSCController.js` | Endpoints REST (config, sorteio, leitura de fases, admin) |
| `services/copaSCService.js` | Lógica de negócio (avançar fase, calcular vencedor, sorteio, premiação) |
| `services/copaSCProcessorService.js` | Job pós-rodada: atualiza pontos, avança fase quando completa |
| `services/orchestrator/managers/CopaSCManager.js` | Integração com orchestrator existente |
| `routes/copa-sc-routes.js` | Registro de rotas (participante + admin) |

---

## 6. Componentes Frontend

### 6.0 Teaser "Em Breve" (fase atual — pré-rodada 20)
A tela teaser existente em `copa-times-sc.html` permanece como está, com um único acréscimo:
- **Botão "Regras"** discreto (outline, pequeno) abaixo do badge "Em Breve".
- Ao clicar: abre um **bottom-sheet/modal** com o resumo das regras da Copa (texto extraído desta spec, formatado em seções simples).
- Conteúdo do modal: formato (grupos → oitavas → ... → final), como classificar (top 2 por grupo), mata-mata (soma de 2 rodadas), desempate (Ranking Geral), premiação (apenas finalistas).
- Sem backend — conteúdo estático injetado via JS no próprio módulo.

### App Participante (fase pós-sorteio)
- `public/participante/js/modules/participante-copa-sc.js` — substituir teaser por módulo completo com 4 abas:
  - **Minha Copa:** próximo adversário, fase atual, caminho percorrido
  - **Grupos:** todos os 8 grupos com standings em tempo real
  - **Chaveamento:** bracket visual do mata-mata
  - **Classificatória:** confrontos dos 3 times (visível para todos)
- `public/participante/fronts/copa-times-sc.html` — atualizar estrutura HTML
- `public/participante/css/copa-sc.css` — evoluir tema dourado existente

### Admin
- Nova seção em `public/detalhe-liga.html` (módulo copa_sc)
- Ações: configurar calendário, definir premiação, disparar sorteio
- `public/js/detalhe-liga-orquestrador.js` — registrar módulo copa_sc

---

## 7. Fluxo de Processamento (Automático)

```
Rodada Cartola fechada (rodadas 20–34)
  → OrchestratorManager chama CopaSCManager.processarRodada(rodada, liga_id)
    → CopaSCProcessorService:
        1. Busca confrontos da fase atual com rodada_cartola inclui rodada atual
        2. Atualiza pontos de cada confronto (pontuação Cartola de cada time)
        3. Se confronto de 2 rodadas: verifica se ambas foram processadas
        4. Se confronto finalizado: calcula vencedor, marca status = 'finalizado'
        5. Se TODOS os confrontos da fase finalizados:
            a. Grupos: atualiza standings, identifica 2 primeiros de cada grupo
            b. Mata-mata: registra eliminados
            c. Gera confrontos da próxima fase
            d. Avança copascconfig.status
            e. Se fase = 'final': aplica premiação financeira (tipo AJUSTE)
```

---

## 8. APIs

```
GET  /api/copa-sc/:ligaId/config                      — config + fase atual
GET  /api/copa-sc/:ligaId/grupos                      — todos os grupos com standings
GET  /api/copa-sc/:ligaId/bracket                     — chaveamento mata-mata
GET  /api/copa-sc/:ligaId/classificatorio             — confrontos da fase classificatória
GET  /api/copa-sc/:ligaId/minha-copa/:participanteId  — visão do participante

POST /api/copa-sc/:ligaId/admin/configurar            — salvar calendário e premiação
POST /api/copa-sc/:ligaId/admin/sortear               — disparar sorteio dos grupos
POST /api/copa-sc/:ligaId/admin/processar/:rodada     — processar rodada manualmente
```

---

## 9. Segurança e Multi-Tenant

- Toda query em `copascconfigs` e `copascmatches` inclui `liga_id`.
- Rotas admin protegidas por `verificarAdmin` middleware.
- Rotas participante protegidas por `verificarParticipante` middleware.
- Sorteio idempotente: se já realizado, retorna erro 409.

---

## 10. Integração com Módulos Existentes

- `modulos_ativos.copa_sc: false` adicionado a `models/Liga.js`
- `ModuleConfig` aceita `'copa_sc'` como módulo válido
- `config/definitions/index.js` e `config/rules/index.js` incluem copa_sc
- `services/orchestrator/managers/index.js` instancia `CopaSCManager`
- Premiação via `tipo: "AJUSTE"` integra automaticamente com o financeiro existente

---

## 11. Edge Cases

- Time com pontuação 0 na Classificatória: válido — confronto acontece normalmente.
- Empate em qualquer confronto: desempate por Ranking Geral.
- Sorteio pós-rodada 23: sistema bloqueia sorteio se Classificatória não concluída.
- Participante adicionado após início da Copa: não entra (Copa é fechada após sorteio).
- Rodada não processada pelo Cartola (adiamento): confronto permanece `em_andamento` até a rodada ser processada.
