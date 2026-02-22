# Prompt Padrao para Google Stitch

Templates otimizados para gerar designs no Stitch que ja saem proximos do design system do Super Cartola Manager.

**Uso:** Copie o prompt da variante desejada ao usar `generate_screen_from_text` no Stitch MCP ou ao solicitar designs no browser do Stitch.

---

## Variante App Participante (Mobile 390px)

```
Crie uma tela mobile (390x844px) para um app de fantasy football brasileiro (Super Cartola Manager).

OBRIGATORIO:
- Dark mode estrito: background principal #0a0a0a, cards #1a1a1a, elevados #1c1c1c
- Texto principal branco #ffffff, secundario rgba(255,255,255,0.7), muted rgba(255,255,255,0.5)
- Cor primaria: laranja #FF5500 (botoes, destaques, CTAs)
- Cores de status: verde #10b981 (positivo), vermelho #ef4444 (negativo), amarelo #eab308 (alerta), azul #3b82f6 (info)
- Tipografia: Russo One para titulos e stats, Inter para corpo de texto, JetBrains Mono para valores numericos
- Icones: usar texto descritivo entre colchetes [icon-name] (serao convertidos para Material Icons)
- Border radius arredondado (12-16px para cards, 8px para botoes)
- Sombras dramaticas para profundidade
- Touch-friendly: botoes e areas clicaveis minimo 44px de altura
- Mobile-first: sem sidebar, navegacao por bottom bar

ESTETICA:
- Visual premium de dashboard esportivo (inspiracao: apps de fantasy como Sofascore, FotMob)
- Densidade de informacao otimizada (muitos dados em pouco espaco)
- Hierarquia visual clara com tipografia e cores
- Glassmorphism sutil onde apropriado
- Gradients sutis, nunca fundos solidos genericos
- Animacoes de entrada sugeridas com classes CSS

CONTEUDO DA TELA:
[DESCREVER AQUI O QUE A TELA DEVE MOSTRAR]
```

---

## Variante Admin (Desktop 1280px)

```
Crie uma tela desktop (1280x800px) para o painel administrativo de um sistema de fantasy football brasileiro.

OBRIGATORIO:
- Dark mode estrito: background #121212, cards #1a1a1a, elevados #2a2a2a
- Texto principal branco #ffffff, secundario #e0e0e0, muted #a0a0a0
- Cor primaria: laranja #FF5500
- Cores de status: verde #10b981, vermelho #ef4444, amarelo #eab308, azul #3b82f6
- Cores de ranking: ouro #ffd700, prata #c0c0c0, bronze #cd7f32
- Tipografia: Russo One para titulos, Inter para corpo, JetBrains Mono para numeros/stats
- Icones: texto descritivo entre colchetes [icon-name]
- Layout com sidebar esquerda (250px) + area principal
- Border radius: 4-8px para cards, botoes compactos

ESTETICA:
- Dashboard administrativo profissional
- Tabelas com dados financeiros e esportivos
- Graficos e stats cards com numeros grandes
- Visual limpo mas com personalidade (nao generico)
- Hover states nos elementos interativos

CONTEUDO DA TELA:
[DESCREVER AQUI O QUE A TELA DEVE MOSTRAR]
```

---

## Cores dos Modulos (usar quando aplicavel)

| Modulo | Cor | Hex |
|--------|-----|-----|
| Artilheiro Campeao | Verde | #22c55e |
| Capitao de Luxo | Roxo | #8b5cf6 |
| Luva de Ouro | Dourado | #ffd700 |
| Saude do Time | Verde esmeralda | #10b981 |

Ao gerar telas de modulos especificos, incluir no prompt:
```
Cor tematica do modulo: [COR] [HEX]
Usar como accent color em headers, badges e destaques do modulo.
```

---

## Dicas para Melhor Resultado

1. **Seja especifico** sobre o conteudo: liste cada secao, card e dado que deve aparecer
2. **Inclua dados de exemplo** realisticos (nomes de times, pontuacoes, valores em R$)
3. **Mencione referencia visual** se tiver (ex: "layout similar ao Sofascore")
4. **Peca variantes** depois com `generate_variants` para explorar alternativas
5. **Use deviceType MOBILE** para app e **DESKTOP** para admin

---

**Referencia:** Este prompt e usado pela skill `stitch-adapter` (docs/skills/03-utilities/stitch-adapter.md)
