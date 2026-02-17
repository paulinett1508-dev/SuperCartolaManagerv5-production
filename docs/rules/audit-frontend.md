# Regras de Auditoria Frontend

**Contexto:** Usado pela skill `anti-frankenstein` e pelo `auditor-module` para validar qualidade e consistência de código CSS/HTML antes e depois de criação/modificação.

---

## 🚨 Regras Absolutas (Zero Tolerância)

Qualquer violação abaixo é **BLOQUEANTE** — não pode ser ignorada:

| # | Regra | Errado | Correto |
|---|-------|--------|---------|
| 1 | **Sem cores hardcoded** | `color: #22c55e` | `color: var(--module-artilheiro-primary)` |
| 2 | **Sem inline styles** | `<div style="color:red">` | CSS class ou variável |
| 3 | **Sem keyframes duplicados** | `@keyframes fadeIn` em 3 arquivos | Define em tokens, importa onde precisa |
| 4 | **Tokens primeiro** | Carregar módulo antes de tokens | Tokens → Base → Shell → Módulo |
| 5 | **Sem CSS órfão** | CSS sem arquivo pai declarado | Todo CSS deve estar no `css-registry.json` |
| 6 | **Sem recrear o existente** | Novo componente modal quando `super-modal.css` existe | Estender o existente |

---

## ✅ Checklist Pré-Criação de CSS (5 Checkpoints)

Execute na ordem antes de criar **qualquer** arquivo CSS ou bloco `<style>`:

### CHECK 1 — Já existe?
```bash
# Buscar por seletores similares
grep -r "nome-do-componente\|funcionalidade" public/css/ --include="*.css"

# Consultar registry
cat config/css-registry.json | grep -i "palavra-chave"
```
- **SE EXISTE:** Editar o arquivo existente. NUNCA criar duplicata.
- **SE NÃO EXISTE:** Continuar para CHECK 2.

### CHECK 2 — Onde vive?
Determinar o diretório correto baseado no contexto:

| Contexto | Diretório |
|----------|-----------|
| Admin desktop (SPA) | `public/css/modules/` |
| Admin mobile (PWA) | `public/admin-mobile/css/` |
| App participante | `public/css/modules/` |
| Tokens/variáveis | `public/css/_[nome].css` |
| Admin wizard/ferramentas | `public/admin/css/` |
| Global/base | `public/css/` (raiz) |

### CHECK 3 — Usa tokens?
Verificar que **toda** cor, gradiente e animação usa variáveis:

```css
/* ❌ BLOQUEADO */
.card { background: #1a1a1a; color: #FF4500; }

/* ✅ CORRETO */
.card { background: var(--bg-card); color: var(--laranja); }
```

Tokens disponíveis: ver `public/css/_admin-tokens.css` e `config/css-registry.json#tokens_reference`

### CHECK 4 — Segue convenções?

- [ ] Nome em kebab-case
- [ ] Prefixo `_` apenas para arquivos de token/variáveis
- [ ] Seletores com escopo (`.modulo-nome__elemento`, não `.card` genérico)
- [ ] Sem `!important` sem comentário `/* justificativa */`
- [ ] Sem `@keyframes` locais se animação já existe nos tokens
- [ ] Hierarquia de carregamento respeitada (tokens antes de módulo)
- [ ] Arquivo registrado no `css-registry.json`

### CHECK 5 — É necessário?

Critérios para criação de **novo arquivo** CSS:
1. Nenhum arquivo existente cobre o escopo
2. O componente é reutilizável (≥2 páginas) OU grande o suficiente (>50 linhas)
3. Não é override pontual que caberia como extensão em arquivo existente

Se nenhum critério for atendido → adicionar ao arquivo existente mais próximo.

---

## 🔴 Red Flags por Severidade

| Severidade | Red Flag | Ação |
|------------|----------|------|
| **CRÍTICO** | Inline style em componente de módulo | Remover imediatamente, criar class |
| **CRÍTICO** | Cor hardcoded em arquivo de módulo | Substituir por variável CSS |
| **ALTO** | `@keyframes` definido fora de arquivo de tokens | Mover para `_admin-tokens.css` |
| **ALTO** | Arquivo CSS não está no `css-registry.json` | Registrar imediatamente |
| **ALTO** | Seletor genérico (`.btn`, `.card`) sem escopo de módulo | Adicionar prefixo de módulo |
| **MÉDIO** | `!important` sem comentário | Adicionar justificativa ou remover |
| **MÉDIO** | Arquivo CSS duplicado (mesmo nome, propósito similar) | Consolidar |
| **BAIXO** | Comentários desatualizados | Atualizar |

---

## 🌳 Fluxo de Decisão

```
Preciso adicionar/modificar CSS?
├── Já existe seletor/componente similar?
│   ├── SIM → Editar arquivo existente ✅
│   └── NÃO → Continuar
│
├── É override pontual (<10 linhas)?
│   ├── SIM → Adicionar no arquivo de módulo mais próximo ✅
│   └── NÃO → Criar novo arquivo
│
├── Definir: qual contexto? (admin/app/mobile)
├── Usar APENAS tokens CSS (zero hardcode)
├── Registrar em css-registry.json
└── Seguir hierarquia de carregamento ✅
```

---

## 📋 Template Obrigatório para Novo Arquivo CSS

```css
/**
 * [Nome do Módulo/Componente]
 *
 * Contexto: [admin | app | admin-mobile | shared]
 * Carregado em: [lista de HTML que importa este arquivo]
 * Depende de: [tokens: _admin-tokens.css | _app-tokens.css]
 *
 * Criado: YYYY-MM-DD
 * Registry: Registrado em config/css-registry.json ✅
 */

/* === [SEÇÃO 1] === */
.modulo-nome__componente {
  /* Usar SEMPRE variáveis CSS */
  background: var(--bg-card);
  color: var(--laranja);
}
```

---

## 🔗 Referências

- Tokens: `public/css/_admin-tokens.css`
- Registry: `config/css-registry.json`
- Skill: `docs/skills/02-specialists/anti-frankenstein.md`
- Frontend Crafter: `docs/skills/02-specialists/frontend-crafter.md`
