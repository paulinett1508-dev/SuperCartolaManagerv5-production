# Redesign Completo: Admin App Mobile

## Filosofia

**Desktop = Central de comando robusta | Mobile = Torre de controle portátil**

O admin mobile deve responder a 3 perguntas rápidas:
1. "Tá tudo OK?" (monitoramento)
2. "Preciso fazer algo agora?" (alertas + ações rápidas)
3. "Como estão minhas ligas?" (visão geral)

## Resumo das Mudanças

### Dashboard (Home)
- Remove TODOS os 7 blocos external (desktop-only)
- Remove categorias Analytics e Sistema
- Card de status unificado: mercado + health + orchestrator
- Seção de alertas contextuais (inadimplentes, rodadas pendentes)
- Apenas 4 ações rápidas: Consolidar, Notificar, Manutenção, Auditoria
- Liga cards mais ricos

### Todas as Páginas Internas
- Remove headers duplicados (back button inline quando top bar já tem)
- Remove TODOS os links "versão completa (Web)" / external
- Layout mais compacto e mobile-first
- Orchestrator: modal em vez de prompt() nativo

### CSS
- Novo componente: status-card unificado
- Novo componente: alert-banner
- Limpeza de estilos não utilizados

### Arquivos Afetados (14 arquivos)
- `js/pages/dashboard.js` — Redesign completo
- `js/pages/consolidacao.js` — Header + links
- `js/pages/financeiro.js` — Header + layout
- `js/pages/health.js` — Header
- `js/pages/orchestrator.js` — prompt() → modal
- `js/pages/notificador.js` — Link externo
- `js/pages/manutencao.js` — Link externo
- `js/pages/auditoria.js` — Link externo
- `js/pages/ligas.js` — Header
- `js/pages/ligas-gerenciar.js` — Links externos
- `js/pages/admin-gestao.js` — Link externo
- `js/pages/profile.js` — Info atualizada
- `css/components.css` — Novos componentes
- `js/app.js` — Limpeza

### Backend: ZERO mudanças (APIs já existem)
