# Claude Code Memory - Super Cartola Manager

## IDs das Ligas (MongoDB)
| Liga | ID | Participantes |
|------|-----|---------------|
| Super Cartola 2025 | 684cb1c8af923da7c7df51de | 32 |
| Cartoleiros do Sobral | 684d821cf1a7ae16d1f89572 | 6 (4 ativos apos R30) |

## Collections MongoDB Importantes

| Collection | Funcao |
|------------|--------|
| `rankinggeralcaches` | Cache do ranking geral por liga |
| `ranking_turno_caches` | Ranking por turno (turno1, turno2, geral) |
| `rodadasnapshots` | Snapshots de rodadas por participante |
| `extratofinanceirocaches` | Cache do extrato financeiro |

## Regras de Negocio - Liga Sobral

1. **Participantes:** Comeca com 6, cai para 4 apos R30
2. **Inativos:** Marcados com `ativo: false` e `rodada_desistencia`
3. **Ranking:** Dados em `ranking_turno_caches` (nao em `rodadas`)
4. **TOP10 Valores:** Menores que SuperCartola (R$10/9/8... vs R$30/28/26...)

---

*Ultima atualizacao: 2026-03-04*
