# Setup & Clone — Guia de Configuração Inicial

## Fluxo correto após qualquer clone

```bash
# 1. Clonar
git clone https://github.com/paulinett1508-dev/SuperCartolaManagerv5-production.git
cd SuperCartolaManagerv5-production

# 2. Setup automático (cria .env, .mcp.json, instala dependências)
npm run setup

# 3. Preencher credenciais reais
#    - .env           → copiar valores do .env.prod da VPS ou cofre de senhas
#    - .mcp.json      → copiar MONGO_URI e PERPLEXITY_API_KEY

# 4. Rodar
npm run dev          # só app
npm run dev:full     # app + mongo-server (MCP)
```

---

## Arquivos ignorados pelo git (nunca vão ao remoto)

| Arquivo | Descrição | Template disponível |
|---------|-----------|---------------------|
| `.env` | Variáveis de ambiente (dev/local) | `.env.example` |
| `.env.prod` | Variáveis de produção | `.env.example` |
| `.mcp.json` | Config dos MCPs (Mongo, Perplexity, Context7) | `.mcp.json.example` |
| `credentials.json` | Google Service Account | — |

> Estes arquivos **existem na VPS** em `/var/www/cartola/` e devem ser mantidos num cofre de senhas (ex: Bitwarden, 1Password).

---

## O que o `npm run setup` faz

1. **`.env`** — cria a partir do `.env.example` se não existir; se existir, detecta variáveis faltando
2. **`.mcp.json`** — cria a partir do `.mcp.json.example` se não existir
3. **`npm install`** — só executa se `node_modules` não existir

---

## Recuperar arquivos da VPS (quando necessário)

```bash
# Conectar na VPS
ssh root@SEU_VPS_IP

# Ver arquivos disponíveis
ls -la /var/www/cartola/.env /var/www/cartola/.env.prod /var/www/cartola/.mcp.json

# Copiar para a máquina local (rodar localmente, não na VPS)
scp root@SEU_VPS_IP:/var/www/cartola/.mcp.json .
scp root@SEU_VPS_IP:/var/www/cartola/.env.prod .
```

---

## Detectar variáveis faltando após `git pull`

Se alguém adicionou novas variáveis ao projeto, seu `.env` pode estar desatualizado:

```bash
diff <(grep -v "^#\|^$" .env | cut -d= -f1 | sort) \
     <(grep -v "^#\|^$" .env.example | cut -d= -f1 | sort)
```

Linhas com `>` = variáveis no `.env.example` que faltam no seu `.env`.

O `npm run setup` também detecta isso automaticamente.

---

## MCPs disponíveis (requerem .mcp.json)

| MCP | Finalidade |
|-----|-----------|
| `mongo` | Queries diretas no MongoDB Atlas via Claude |
| `perplexity` | Pesquisa web em tempo real |
| `context7` | Documentação atualizada de libs/frameworks |

Sem `.mcp.json`, os MCPs não carregam na sessão do Claude Code.
