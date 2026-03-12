# Estratégia de Banco de Dados

## Configuração
- **Banco único:** `cartola-manager` (MongoDB Atlas) — mesmo banco para dev e prod
- **Variável:** Apenas `MONGO_URI` — `MONGO_URI_DEV` foi descontinuada e deletada
- **NODE_ENV:** Diferencia apenas logs e labels (`[DEV]` vs `[PROD]`), NÃO o banco
- **Razão:** Micro SaaS — dados perpétuos, time pequeno, sem necessidade de ambientes separados

## Stack de Desenvolvimento
- `npm run dev` → `NODE_ENV=development` → conecta ao mesmo banco real
- Replit link temporário → admin valida mudanças sem afetar usuários
- Replit Republish → usuários em `supercartolamanager.com.br` recebem as mudanças

## Scripts — Padrão Correto
```javascript
// CORRETO — todos os scripts devem usar apenas MONGO_URI
const MONGO_URI = process.env.MONGO_URI;

// ERRADO — MONGO_URI_DEV foi descontinuada
// const MONGO_URI = process.env.MONGO_URI_DEV || process.env.MONGO_URI;
```

## Proteções em Scripts
```javascript
// Para scripts destrutivos: sempre exigir --dry-run ou --force
if (!isDryRun && !isForce) {
    console.error('Use --dry-run para simular ou --force para executar');
    process.exit(1);
}
```

## Comandos
```bash
node scripts/[script].js --dry-run  # Validar
node scripts/[script].js --force    # Executar
```

## Estrutura de Dados

### Collection "times"
**IMPORTANTE:** Sistema NÃO usa collection "users". Todos participantes em **"times"**
- Schema: `id` (Number), `nome_time`, `nome_cartoleiro`, `ativo`, `temporada`

### Tipos de ID por Collection
**Cuidado:** Collections usam tipos mistos (`time_id: Number` vs `timeId: String`). Detalhes: skill `project-reference`.

### Escudos
Localização: `/public/escudos/{clube_id}.png` — Fallback: `onerror="this.src='/escudos/default.png'"`

## Sistema de Autenticação Admin

**Arquitetura:** Replit Auth (OpenID Connect)

### Ordem de Autorização (`isAdminAuthorizado()`)
1. Verifica collection `admins` no MongoDB
2. Se vazio → usa `ADMIN_EMAILS` da env
3. Se existe mas email não está → **NEGA**
4. Sem restrição → permite (dev mode)

**Rota de Debug:** `/api/admin/auth/debug`
