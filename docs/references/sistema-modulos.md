# Sistema de Módulos

## Estrutura de Controle
- `Liga.modulos_ativos` → On/Off simples
- `ModuleConfig` → Config granular por liga/temporada
- `participante-navigation.js` → Carrega dinamicamente

## Módulos Existentes

**Base (sempre ativos):** Extrato, Ranking, Rodadas, Hall da Fama

**Opcionais:** Top 10, Melhor Mês, Pontos Corridos, Mata-Mata, Artilheiro, Luva de Ouro, Campinho, Dicas, Resta Um, Capitão de Luxo

**Planejados 2026:** Tiro Certo, Bolão Copa & Liberta

## Módulos por Rodada vs Módulos de Premiação Final (REGRA CRÍTICA)

**Módulos por rodada** (geram transações a cada rodada, aparecem no extrato por rodada):
- Top 10 (MITO/MICO), Pontos Corridos, Mata-Mata, Bônus/Ônus de posição

**Módulos de premiação final** (premiam apenas ao fim da disputa, lançados manualmente pelo admin como Ajuste Financeiro):
- Artilheiro, Luva de Ouro, Capitão de Luxo, Resta Um, Bolão, Copa do Mundo, Melhor Mês, Tiro Certo

**Regra:** NUNCA criar campos por-rodada (`r.artilheiro`, `r.luvaOuro`, etc.) no transformer ou renderer para módulos de premiação final. Essas premiações entram como `tipo: "AJUSTE"` com `rodada: null` e aparecem na seção "Ajustes" do extrato, não nas rodadas individuais.

## Estados vs Módulos (NÃO confundir)
- **Parciais** → Estado da rodada (jogos em andamento)
- **Pré-Temporada** → Condição temporal
- **Mercado Aberto/Fechado** → Estado do Cartola
- **Rodada Finalizada** → Estado consolidado

## Renovação de Temporada

**Documentação completa:** [`docs/SISTEMA-RENOVACAO-TEMPORADA.md`](../SISTEMA-RENOVACAO-TEMPORADA.md)

**Conceitos-chave:** `ligarules` (config por liga), `inscricoestemporada` (registro), `pagouInscricao` (true=pago, false=vira debito)

## Pré-Temporada

Periodo entre temporadas: API Cartola retorna ano anterior, sem rodadas. Detectar com `temporadaSelecionada > mercadoData.temporada`.
