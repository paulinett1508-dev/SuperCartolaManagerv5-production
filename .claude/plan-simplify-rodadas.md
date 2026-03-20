# Plano: Simplificar Módulo Rodadas do App Participante

## Diagnóstico da Auditoria

### Problema 1: Muitos atalhos levando ao mesmo lugar
A tela **Início** tem **5 caminhos** para "rodadas":
1. **Hero Card** inteiro (onclick na section) → rodadas
2. **CTA "Ver detalhes da rodada"** dentro do Hero Card → rodadas
3. **Card "Rodadas" no grid de módulos** → rodadas
4. **Alerta "Rodada em Andamento"** (status=2) → rodadas
5. **Alerta "Fim de Rodada"** (status=4) → rodadas

**Solução:** Remover o CTA redundante do Hero Card (item 2). O Hero Card inteiro já é clicável, e o CTA com texto "Ver detalhes da rodada" + chevron é redundante. Os alertas (4, 5) são contextuais e faz sentido manter.

### Problema 2: Cards analíticos excessivos e redundantes dentro do módulo Rodadas
Quando o participante entra em Rodadas, vê **6 seções/cards** empilhados:

1. **Grid de 38 mini-cards** (seletor de rodada) → MANTER (é a navegação principal)
2. **Gráfico Evolutivo** (barras de desempenho por rodada) → MANTER (visual rápido, útil)
3. **Card "Sua Temporada"** (pontos total, média, posição média, melhor/pior rodada, conquistas Top3/AcimaMedia/Ultimo, barra aproveitamento) → **SIMPLIFICAR** — é verboso e repete info
4. **Card "Destaques da Rodada"** (capitão, maior pontuador, menor pontuador) → **REMOVER** — é redundante com "Minha Escalação" que já mostra tudo isso
5. **Detalhamento da Rodada** (ao clicar num mini-card): "Meu Resumo" + "Minha Escalação" + Ranking por zona → MANTER
6. **Botão "Raio-X da Rodada"** → MANTER (é funcionalidade adicional, não redundância)

### Problema 3: "Meu Resumo" dentro do detalhamento é redundante
Ao clicar numa rodada, aparece:
- **"Meu Resumo"** (card colapsável com posição, pontos, zona, valor financeiro)
- **"Minha Escalação"** (card colapsável com todos atletas, pontos, scouts)

O "Meu Resumo" repete informação que já está no header do detalhamento (`rodadaResumo`) e no toggle da "Minha Escalação" (que mostra "nome • pontos • posição/total").

**Solução:** Remover "Meu Resumo" como card separado e consolidar a info essencial (posição + zona + valor financeiro) numa **linha compacta** acima do ranking.

---

## Mudanças Propostas

### 1. Home: Remover CTA redundante do Hero Card
- **Arquivo:** `public/participante/fronts/home.html`
- **Ação:** Remover o div `.home-hero-cta` (linhas 67-70) e seu CSS correspondente
- **Resultado:** Hero Card fica mais limpo, ainda é clicável inteiro

### 2. Rodadas: Remover card "Destaques da Rodada"
- **Arquivo:** `public/participante/fronts/rodadas.html`
- **Ação:** Remover o bloco `#rodadas-destaques-card` (linha 3102+) e todo seu CSS (~110 linhas)
- **Arquivo:** `public/participante/js/modules/participante-rodadas.js`
- **Ação:** Remover funções: `_carregarDestaquesRodada()`, `_setupDestaquesRodadasAutoRefresh()`, `_renderizarDestaquesRodadas()`, `_popularDestaquesCard()`, `toggleRodadasDestaques()` e chamadas a elas em `renderizarInterface()` e `selecionarRodada()`
- **Justificativa:** "Minha Escalação" já mostra capitão, maior/menor pontuador, scouts — card redundante

### 3. Rodadas: Simplificar card "Sua Temporada"
- **Arquivo:** `public/participante/fronts/rodadas.html`
- **Ação:** Remover a seção colapsável de detalhes (melhor/pior rodada, conquistas Top3/AcimaMedia/Ultimo, barra de aproveitamento). Manter apenas a **primeira linha** (Pontos Total, Média/Rodada, Posição Média) que é o resumo essencial.
- **Arquivo:** `public/participante/js/modules/participante-rodadas.js`
- **Ação:** Simplificar `renderizarCardDesempenho()` — remover cálculos de vezesTop3, vezesUltimo, vezesAcimaMedia, aproveitamento, e os setEl correspondentes. Remover `toggleTemporadaDetalhes()`.
- **Justificativa:** Os dados detalhados são cansativos e raramente consultados. O resumo de 3 números (total, média, posição) é suficiente.

### 4. Rodadas: Remover card "Meu Resumo" do detalhamento
- **Arquivo:** `public/participante/js/modules/participante-rodadas.js`
- **Ação:** Na função `renderizarDetalhamentoRodada()`, em vez de gerar o `meuResumoHTML` como card colapsável separado, incorporar apenas a info financeira (zona badge + valor) como uma **linha inline compacta** acima do ranking.
- **Remover:** `toggleMeuResumo()`, CSS do `.meu-resumo-*`
- **Justificativa:** O header do detalhamento (`rodadaTitulo` + `rodadaResumo`) + o toggle da Escalação já mostram pontos e posição

### 5. CSS cleanup
- **Arquivo:** `public/participante/fronts/rodadas.html`
- **Ação:** Remover CSS orphan dos componentes removidos (destaques, meu-resumo completo, conquistas, aproveitamento)

---

## Arquivos Afetados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `public/participante/fronts/home.html` | Remover CTA Hero |
| `public/participante/fronts/rodadas.html` | Remover HTML + CSS (destaques, temporada detalhes) |
| `public/participante/js/modules/participante-rodadas.js` | Remover funções, simplificar renderização |

## O que NÃO muda
- Grid de 38 mini-cards (navegação principal)
- Gráfico evolutivo (visual útil e compacto)
- "Minha Escalação" com atletas, scouts, substituições
- Ranking por zona (Ganho/Neutra/Perda)
- Botão Raio-X
- Modal "Curiosar"
- Parciais ao vivo
- Home Hero Card (mantém clicável, apenas remove CTA texto)
- Alertas contextuais da Home (rodada em andamento, fim de rodada)
