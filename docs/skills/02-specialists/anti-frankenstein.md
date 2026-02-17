---
name: anti-frankenstein
description: Guardião de governança CSS/HTML. Atua como checkpoint OBRIGATÓRIO antes de criar ou modificar qualquer CSS, componente ou estrutura HTML. Previne código duplicado, cores hardcoded, inline styles, keyframes repetidos e arquivos órfãos.
allowed-tools: Read, Grep, Glob, Bash
---

# Anti-Frankenstein Skill — Guardião de Frontend

## 🎯 Missão

Ser o **checkpoint obrigatório** antes de qualquer criação ou modificação de CSS/HTML. Eliminar na origem o "código Frankenstein": duplicado, sem pai, sem tokens, sem governança.

> **Regra de Ouro:** Nenhuma linha de CSS nova nasce sem passar pelos 5 checkpoints.

---

## ⚡ Quando Esta Skill É Ativada

Ativa automaticamente quando qualquer mensagem contiver:
- "criar CSS", "novo arquivo CSS", "adicionar estilo"
- "novo componente", "criar tela", "novo HTML"
- "já existe?", "antes de criar", "onde fica o CSS de"
- "blindar frontend", "governança CSS", "anti-frankenstein"
- "checar antes de criar", "auditar CSS"

**Integração com workflow:**
```
frontend-crafter (cria) ← anti-frankenstein valida ANTES
code (implementa)       ← anti-frankenstein valida ANTES de qualquer CSS
```

---

## 🔍 Protocolo de 5 Checkpoints

Execute **na ordem**, sem pular etapas.

---

### ✅ CHECK 1 — Já Existe?

**Objetivo:** Garantir que não estamos recriando algo que já existe.

```bash
# 1a. Buscar seletor/componente por nome
grep -r "nome-do-componente" public/css/ --include="*.css" -l

# 1b. Buscar por funcionalidade (keyframes, animations)
grep -r "@keyframes fadeIn\|animation.*fade" public/css/ --include="*.css" -l

# 1c. Consultar registry
cat config/css-registry.json | grep -i "palavra-chave"
```

**Resultado:**
- **ENCONTROU:** → Editar arquivo existente. Documentar onde está. **PARAR aqui.**
- **NÃO ENCONTROU:** → Continuar para CHECK 2.

---

### ✅ CHECK 2 — Onde Vive?

**Objetivo:** Determinar o diretório correto antes de criar.

| Contexto da Feature | Diretório Correto |
|---------------------|-------------------|
| Admin desktop (SPA orquestrador) | `public/css/modules/` |
| Admin mobile (PWA separado) | `public/admin-mobile/css/` |
| App participante | `public/css/modules/` |
| Variáveis/tokens novos | `public/css/_[nome].css` |
| Admin wizard/configuração | `public/admin/css/` |
| Global/reset/base | `public/css/` (raiz — raramente) |

**Verificar hierarquia de carregamento esperada:**
```
_admin-tokens.css → base.css → admin-shell.css → módulo.css
```
O novo arquivo deve entrar nessa cadeia no lugar correto.

---

### ✅ CHECK 3 — Usa Tokens?

**Objetivo:** Zero cores ou valores hardcoded.

**Tabela de referência rápida:**

| O que precisa | Variável a usar | Arquivo de token |
|---------------|-----------------|------------------|
| Cor artilheiro | `var(--module-artilheiro-primary)` | `_admin-tokens.css` |
| Cor capitão | `var(--module-capitao-primary)` | `_admin-tokens.css` |
| Cor luva | `var(--module-luva-primary)` | `_admin-tokens.css` |
| Laranja admin | `var(--laranja)` | `_admin-tokens.css` |
| Background card | `var(--bg-card)` | `_admin-tokens.css` |
| Background secundário | `var(--bg-secondary)` | `_admin-tokens.css` |
| Gradiente artilheiro | `var(--gradient-artilheiro)` | `_admin-tokens.css` |

**Validação:**
```bash
# Detectar hardcodes no arquivo que será criado/editado
grep -n "#[0-9a-fA-F]\{3,6\}\|rgb(\|rgba(" arquivo.css
```

Se encontrar → substituir por variável antes de prosseguir.

---

### ✅ CHECK 4 — Segue Convenções?

**Checklist de 10 itens:**

- [ ] Nome do arquivo em `kebab-case.css`
- [ ] Prefixo `_` apenas para arquivos de token/variáveis
- [ ] Seletores com escopo de módulo (`.artilheiro-card__header`, não `.card`)
- [ ] Nenhum seletor genérico solto (`.btn`, `.title`, `.card`)
- [ ] `!important` tem comentário `/* justificativa obrigatória */`
- [ ] `@keyframes` não duplica animação já definida nos tokens
- [ ] Hierarquia de carregamento respeitada
- [ ] Sem inline styles no HTML associado (`style="..."`)
- [ ] Header de documentação incluído (ver template abaixo)
- [ ] Arquivo será registrado no `css-registry.json` após criação

---

### ✅ CHECK 5 — É Necessário?

**Critérios para criar NOVO arquivo:**
1. Nenhum arquivo existente cobre o escopo (CHECK 1 confirmou)
2. É reutilizável (≥2 páginas) OU substancial (>50 linhas)
3. Não é override pontual que caberia em arquivo existente

**Se nenhum critério atender:** Adicionar ao arquivo existente mais próximo (ver CHECK 2 para localização).

---

## 📋 Template Obrigatório

Todo CSS novo deve começar com:

```css
/**
 * [Nome do Módulo/Componente]
 *
 * Contexto: [admin | app | admin-mobile | shared]
 * Carregado em: [lista de HTML que importa este arquivo]
 * Depende de: [_admin-tokens.css | _app-tokens.css]
 *
 * Criado: YYYY-MM-DD
 * Registry: Registrado em config/css-registry.json ✅
 */
```

---

## 📝 Pós-Checkpoint: Registro Obrigatório

Após criar arquivo CSS, **imediatamente** atualizar `config/css-registry.json`:

```json
{
  "path": "public/css/modules/novo-modulo.css",
  "description": "Descrição clara do propósito",
  "loaded_in": ["lista de HTML que carrega este arquivo"],
  "note": "Observações relevantes"
}
```

**Atualizar também** `_meta.lastUpdated` com a data atual.

---

## 🚨 Exemplos de Violações Comuns

### Violação 1: Keyframe duplicado
```css
/* ❌ BLOQUEADO — fadeIn já existe em _admin-tokens.css */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ✅ CORRETO — referenciar animação existente */
.artilheiro-card {
  animation: fadeIn 0.3s ease; /* keyframe definido em _admin-tokens.css */
}
```

### Violação 2: Cor hardcoded
```css
/* ❌ BLOQUEADO */
.capitao-badge { background: #8b5cf6; }

/* ✅ CORRETO */
.capitao-badge { background: var(--module-capitao-primary); }
```

### Violação 3: Inline style em HTML
```html
<!-- ❌ BLOQUEADO -->
<div style="background: #1a1a1a; padding: 16px; border-radius: 8px;">

<!-- ✅ CORRETO -->
<div class="artilheiro-card">
```

### Violação 4: Seletor genérico sem escopo
```css
/* ❌ BLOQUEADO — .card afeta toda a aplicação */
.card { background: var(--bg-card); }

/* ✅ CORRETO — escopo de módulo */
.luva-card { background: var(--bg-card); }
```

### Violação 5: Arquivo criado sem registro
```bash
# ❌ BLOQUEADO — criou arquivo sem atualizar registry
touch public/css/modules/novo.css

# ✅ CORRETO — criar E registrar
# 1. Criar arquivo com template
# 2. Adicionar entrada em config/css-registry.json
# 3. Confirmar no CHECK 4
```

---

## 🔗 Integração com Outras Skills

| Skill | Relação |
|-------|---------|
| `frontend-crafter` | Anti-Frankenstein valida **ANTES** do crafter criar |
| `code-inspector` | Inspector audita **DEPOIS** da implementação |
| `auditor-module` | Usa `docs/rules/audit-frontend.md` como checklist |

**Fluxo completo:**
```
Solicitação de CSS/componente
    ↓
anti-frankenstein (5 checkpoints) ← você está aqui
    ↓ aprovado
frontend-crafter (implementa com tokens corretos)
    ↓
code-inspector (valida qualidade final)
```

---

## 📚 Referências

- Registry: `config/css-registry.json`
- Regras detalhadas: `docs/rules/audit-frontend.md`
- Tokens: `public/css/_admin-tokens.css`
- Frontend Crafter: `docs/skills/02-specialists/frontend-crafter.md`
