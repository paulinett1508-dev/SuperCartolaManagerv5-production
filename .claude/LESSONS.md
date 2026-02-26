# Licoes Aprendidas - Super Cartola Manager

> **Proposito:** Registrar erros e licoes apos correcoes do usuario para evitar repeticao.
> **Quando atualizar:** Apos QUALQUER correcao do usuario (erro, abordagem errada, padrao violado).
> **Quando revisar:** No inicio de cada sessao nova.

---

## Registro de Licoes

| Data | Categoria | Erro Cometido | Licao Aprendida | Regra Adicionada ao CLAUDE.md? |
|------|-----------|---------------|-----------------|-------------------------------|
| 2026-02-26 | LOGICA | Capitão com multiplicador 2x — sistema inteiro calculava errado | Cartola FC 2026 usa **1.5x** para capitão (não 2x). Comprovado: soma 1x titulares + cap 1.5x = valor API oficial. Nunca confiar em docs genéricos, validar com dados reais. | Sim — regra adicionada |

### Categorias Validas
- **DADOS** — Queries erradas, tipos de ID, collections incorretas
- **FRONTEND** — CSS duplicado, emoji no codigo, cores hardcoded, SPA init
- **LOGICA** — Regra de negocio mal interpretada, calculo errado, arredondamento
- **PROCESSO** — Violou planejamento, nao verificou, nao perguntou antes

---

## Padroes Recorrentes

> Quando 3+ licoes da mesma categoria aparecerem, documentar o padrao aqui e propor regra no CLAUDE.md.

_(vazio)_

---

## Regras Geradas por Licoes

> Regras que foram adicionadas ao CLAUDE.md como resultado direto de licoes aprendidas.

| Data | Regra | Secao do CLAUDE.md | Licao Origem |
|------|-------|--------------------|--------------|
| — | _(vazio)_ | — | — |
