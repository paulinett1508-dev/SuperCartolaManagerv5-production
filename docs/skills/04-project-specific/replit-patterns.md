---
name: replit-patterns
description: Padroes, limites e boas praticas para deploy no Replit. Guia especifico para o Super Cartola Manager rodando em Replit com Node.js/Express/MongoDB Atlas. Cobre deployment types, secrets, filesystem efemero, configuracao .replit e otimizacao de custos. Keywords - replit, deploy, limites replit, secrets, filesystem, autoscale, producao, republish.
allowed-tools: Read, Grep, Glob, Bash
---

# Replit Patterns — Super Cartola Manager

## Contexto do Projeto

- **Tipo de Deploy:** Reserved VM (Replit Deployments)
- **Dominio:** `supercartolamanager.com.br`
- **Banco:** MongoDB Atlas externo (nao usa Replit Database)
- **Variavel de banco:** Apenas `MONGO_URI` (NUNCA `MONGO_URI_DEV` — descontinuada)
- **Dev vs Prod:** Mesmo banco, apenas `NODE_ENV` diferencia logs (`[DEV]` vs `[PROD]`)
- **Config:** `.replit` + `replit.nix`

---

## 1. Tipos de Deployment no Replit

| Tipo | Quando Usar | Custo | Super Cartola |
|------|-------------|-------|---------------|
| **Reserved VM** | App sempre online, trafego previsivel | $10+/mes | USADO ATUALMENTE |
| **Autoscale** | Trafego variavel, pay-per-use | Variavel | Alternativa futura |
| **Static** | Sites estaticos, CDN gratis | Gratis | N/A (app e dinamico) |
| **Scheduled** | Cron jobs | $0.10/mes + compute | Potencial para consolidacao |

---

## 2. Configuracao do Projeto

### .replit

```toml
# Dev (quando clica Run)
run = "npm run dev"

# Deploy (quando faz Publish)
[deployment]
run = ["sh", "-c", "npm start"]
build = ["sh", "-c", "npm install"]
```

### Regras Criticas

```markdown
□ App escuta em 0.0.0.0 (NUNCA localhost/127.0.0.1)
□ Porta via process.env.PORT (Replit define automaticamente)
□ [deployment] separado do run de dev
□ Build step inclui npm install
```

---

## 3. Secrets (Variaveis de Ambiente)

### Regra do Projeto (CLAUDE.md)

```markdown
□ NUNCA usar .env files (Replit nao trata como seguro)
□ NUNCA commitar secrets no codigo
□ NUNCA usar MONGO_URI_DEV (descontinuada)
□ Usar exclusivamente Secrets Manager do Replit
□ Validar secrets obrigatorios no startup do servidor
```

### Secrets Esperados

| Secret | Obrigatorio | Descricao |
|--------|-------------|-----------|
| `MONGO_URI` | SIM | Connection string MongoDB Atlas |
| `SESSION_SECRET` | SIM | Secret para express-session |
| `GOOGLE_CLIENT_ID` | SIM | OAuth para admin |
| `GOOGLE_CLIENT_SECRET` | SIM | OAuth para admin |
| `NODE_ENV` | NAO | `development` ou `production` (default: production) |
| `ADMIN_EMAILS` | NAO | Emails admin fallback (se collection admins vazia) |

### Validacao no Startup

```javascript
// Padrao recomendado para index.js
const REQUIRED_SECRETS = ['MONGO_URI', 'SESSION_SECRET'];

for (const secret of REQUIRED_SECRETS) {
  if (!process.env[secret]) {
    console.error(`FATAL: Secret ${secret} nao configurado`);
    process.exit(1);
  }
}
```

---

## 4. Filesystem Efemero

### O que Muda entre Deploys

```markdown
EFEMERO (perde entre restarts/deploys):
- Arquivos criados em runtime (uploads, logs temporarios)
- node_modules (recriado no build)
- Cache local em disco
- Qualquer arquivo fora do repositorio

PERSISTENTE:
- Codigo do repositorio (restaurado do git)
- Secrets (configurados no Replit)
- MongoDB Atlas (banco externo)
```

### Implicacoes para o Projeto

```markdown
□ NUNCA depender de arquivos locais para dados criticos
□ Logs devem ir para console/stdout (Replit captura)
□ Cache deve usar NodeCache (memoria) ou MongoDB (persistente)
□ Uploads devem ir para servico externo (nao salvar em disco)
□ Backups de scripts devem ir para MongoDB, nao filesystem
```

---

## 5. Limites e Otimizacao

### Limites por Plano

| Recurso | Free | Hacker ($7/mes) | Pro ($20/mes) |
|---------|------|-----------------|---------------|
| CPU | 0.5 vCPU | 2 vCPU | 4 vCPU |
| RAM | 512 MB | 2 GB | 8 GB |
| Storage | 1 GB | 10 GB | 50 GB |
| Always-on | NAO | SIM | SIM |

### Otimizacao de Memoria

```markdown
□ Usar .lean() em queries MongoDB (evita overhead do Mongoose documents)
□ Limitar arrays retornados (max 100 por pagina)
□ NodeCache com maxKeys configurado (nao crescer indefinidamente)
□ Garbage collection automatico (nao precisa forcar)
□ Monitorar uso no Deployments tab do Replit
```

### Otimizacao de Startup

```markdown
□ npm install no build step (nao no run)
□ Lazy loading de modulos pesados
□ Database connection com retry (MongoDB Atlas pode demorar no cold start)
□ Health check endpoint (/api/health) para Replit validar que app esta rodando
```

---

## 6. Deploy Workflow

### Fluxo Atual

```
Dev (Claude Code Web ou Local)
    ↓ git push
GitHub (main branch)
    ↓ Replit Pull (manual via skill replit-pull)
Replit (development mode)
    ↓ Validar mudancas no link temporario
Replit (Republish)
    ↓ Build + Deploy automatico
Producao (supercartolamanager.com.br)
```

### Checklist Pre-Deploy

```markdown
□ Todas mudancas commitadas e pushadas para main
□ Testes passando localmente (se existirem)
□ Nenhum console.log com dados sensiveis
□ NODE_ENV = production no Replit
□ MONGO_URI aponta para cluster correto
□ Nenhuma referencia a MONGO_URI_DEV no codigo
```

### Checklist Pos-Deploy

```markdown
□ App acessivel via dominio (supercartolamanager.com.br)
□ Login admin funciona (Google OAuth)
□ Login participante funciona
□ Dados carregando corretamente (rankings, rodadas)
□ Console do Replit sem erros criticos
□ Cache invalidado se necessario
```

---

## 7. Monitoramento

### Health Check Endpoint

```javascript
// Recomendado: GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    // Testar conexao com MongoDB
    await mongoose.connection.db.admin().ping();
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed / 1024 / 1024,
      env: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});
```

### Metricas para Observar

| Metrica | Onde | Limite |
|---------|------|--------|
| CPU | Replit Deployments tab | < 80% |
| RAM | Replit Deployments tab | < 85% |
| Restart count | Replit logs | 0 por dia (idealmente) |
| Response time | Console logs | < 2s para endpoints |
| MongoDB latency | Atlas metrics | < 100ms |

---

## 8. Troubleshooting Comum

| Problema | Causa Provavel | Solucao |
|----------|----------------|---------|
| App reinicia em loop | Erro fatal no startup (secret faltando, DB nao conecta) | Verificar logs, validar secrets |
| 502 Bad Gateway | App nao escuta na porta correta | Usar `process.env.PORT` e `0.0.0.0` |
| Lento apos deploy | Cold start + reconexao MongoDB | Normal nos primeiros requests |
| Arquivos desaparecem | Filesystem efemero | Usar MongoDB para persistencia |
| npm install falha | Dependencia incompativel com Node version | Verificar `replit.nix` (node version) |
| CORS bloqueado | Dominio nao na whitelist | Atualizar CORS em `middleware/security.js` |
| Session perdida | Cookie flags incorretas para HTTPS | Verificar httpOnly, secure, sameSite |

---

## 9. Dev vs Producao

| Aspecto | Dev (`npm run dev`) | Producao (Deploy) |
|---------|---------------------|-------------------|
| NODE_ENV | development | production |
| Banco | Mesmo (MONGO_URI) | Mesmo (MONGO_URI) |
| Logs | `[DEV]` prefix, verbose | `[PROD]` prefix, minimal |
| Link | Replit dev URL (temporario) | supercartolamanager.com.br |
| Filesystem | Persistente (workspace) | Efemero |
| Restarts | Manual | Automatico (health check) |

---

**Versao:** 1.0 (Adaptado do agnostic-core para SuperCartola)
