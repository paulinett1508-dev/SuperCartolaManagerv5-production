# Infraestrutura VPS — Super Cartola Manager

> **Última atualização:** 2026-03-23
> **Responsável:** paulinett1508-dev
> **VPS:** Hostinger — `195.200.5.145`

---

## Arquitetura Atual

```
Internet (HTTP/HTTPS)
  └── nginx (portas 80/443)
        └── proxy_pass → localhost:5000
              └── Docker: scm-prod (5000:3000)
                    └── Node.js Express — porta 3000 (interna)

GitHub push → main
  └── webhook GitHub → POST /webhook/deploy (porta 9000)
        └── PM2: cartola-webhook (/var/www/cartola/webhook.cjs)
              └── deploy.sh → git pull + docker compose build + up
```

---

## Processos em Execução

| Processo | Runtime | Porta | Responsabilidade |
|---|---|---|---|
| `scm-prod` | Docker | `5000→3000` | App principal Node.js |
| `cartola-webhook` | PM2 | `9000` | Receiver de webhooks GitHub |
| `nginx` | systemd | `80`, `443` | Reverse proxy + SSL |

---

## Pipeline de Deploy Automático

### Fluxo completo

```
1. Developer faz push / merge PR → main no GitHub

2. GitHub dispara webhook para:
   POST http://195.200.5.145:9000/webhook/deploy
   Header: X-Hub-Signature-256 (HMAC validado)

3. webhook.cjs (PM2) valida assinatura e branch (apenas main)
   → executa deploy.sh em background
   → responde 200 imediatamente ao GitHub

4. deploy.sh executa:
   [STEP 1/3] git pull origin main
   [STEP 2/3] docker compose build scm-prod
   [STEP 3/3] docker compose up -d scm-prod

5. Container antigo é substituído pelo novo (zero-downtime via --no-deps)
   Logs disponíveis em: /var/www/cartola/deploy.log
```

### Configuração do webhook no GitHub

**URL:** `http://195.200.5.145:9000/webhook/deploy`
**Content-Type:** `application/json`
**Events:** `push`
**Secret:** variável `GITHUB_WEBHOOK_SECRET` no `.env` da VPS

### GitHub Actions (redundância)

O `main.yml` também dispara SSH deploy via `appleboy/ssh-action` em pushes para `main`.
Requer 3 repository secrets configurados:

| Secret | Valor |
|---|---|
| `VPS_HOST` | `195.200.5.145` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Chave privada `/root/.ssh/github_actions` |

A chave pública correspondente está em `/root/.ssh/authorized_keys` na VPS.

---

## Docker

### Serviços definidos em `docker-compose.yml`

| Serviço | Host:Container | Env file | Uso |
|---|---|---|---|
| `scm-prod` | `5000:3000` | `.env.prod` | Produção ativa |
| `scm-staging` | `3001:3000` | `.env.staging` | Staging (não ativo) |

### Volumes

```yaml
scm-prod:
  volumes:
    - ./data:/app/data   # arquivos runtime persistidos no host
```

### Comandos operacionais

```bash
# Ver status do container
docker ps

# Ver logs ao vivo
docker logs scm-prod -f

# Ver health check
docker inspect scm-prod --format='{{.State.Health.Status}}'

# Rebuild manual (sem webhook)
cd /var/www/cartola
git pull origin main
docker compose build scm-prod
docker compose up -d scm-prod

# Rollback para imagem anterior
docker compose stop scm-prod
docker compose up -d --no-build scm-prod  # usa imagem cached anterior
```

### Health Check

O container verifica a cada 30s se o app responde:
```
GET http://127.0.0.1:3000/api/app/check-version
```
> **Nota:** usar `127.0.0.1` — `localhost` resolve para IPv6 `[::1]` dentro do Alpine Linux e falha.

---

## PM2

### Processos gerenciados

```bash
pm2 list         # listar processos
pm2 logs cartola-webhook --lines 50   # logs do webhook receiver
pm2 save         # salvar lista para sobreviver reboot
pm2 startup      # garantir que PM2 inicia no boot da VPS
```

> `cartola-manager` foi removido do PM2 em 2026-03-23. O app agora roda via Docker (`scm-prod`).

---

## Estrutura de arquivos relevantes

```
/var/www/cartola/
├── deploy.sh           # script executado a cada deploy
├── webhook.cjs         # servidor HTTP que recebe webhooks do GitHub
├── webhook.log         # log de todos os eventos webhook
├── deploy.log          # log detalhado de cada deploy
├── docker-compose.yml  # definição dos containers
├── Dockerfile          # imagem multi-stage (base → builder → runtime)
├── .env                # variáveis de ambiente (git-ignored)
├── .env.prod           # cópia do .env para o container (git-ignored)
└── data/               # arquivos runtime (montado como volume Docker)
    ├── jogos-globo.json
    ├── audit-report.json
    └── history/
```

---

## Histórico de Mudanças

### 2026-03-23 — Dockerização e correção do pipeline

**Problema identificado:**
- `main.yml` (GitHub Actions) chamava webhook do Replit (plataforma abandonada) — deploy nunca chegava à VPS
- Workflows `deploy-staging.yml` e `deploy-production.yml` apontavam para path inexistente `/opt/super-cartola-manager`
- App rodava diretamente via PM2 sem isolamento de container

**Ações executadas:**
1. VPS sincronizada manualmente com `main` (14 commits atrasados)
2. App migrado de PM2 para Docker (`scm-prod`)
3. `docker-compose.yml`: porta ajustada para `5000:3000`, volume `./data` adicionado
4. `Dockerfile`: adicionado `jobs/` que estava faltando (causava crash)
5. `deploy.sh`: substituído `pm2 restart` por `docker compose build/up`
6. Healthcheck corrigido: `localhost` → `127.0.0.1` (problema IPv6 no Alpine)
7. `main.yml`: webhook Replit substituído por SSH deploy via `appleboy/ssh-action`
8. Todos os workflows: paths corrigidos para `/var/www/cartola`
9. `.gitignore`: adicionado `.env.prod` (contém segredos)
10. Chave SSH dedicada gerada (`/root/.ssh/github_actions`) para GitHub Actions

**Commits:**
- `bdf00e54` — chore(infra): dockeriza app e corrige pipeline de deploy
- `8e0ba13f` — fix(docker): corrige healthcheck — localhost → 127.0.0.1

---

## Troubleshooting

| Sintoma | Diagnóstico | Solução |
|---|---|---|
| Container `unhealthy` | Healthcheck falhando | `docker exec scm-prod wget --spider http://127.0.0.1:3000/api/app/check-version` |
| Deploy não dispara | Webhook não recebe evento | `pm2 logs cartola-webhook` — verificar se push foi para `main` |
| App não responde em prod | Container parado ou reiniciando | `docker ps` → `docker logs scm-prod --tail 30` |
| Build falha no deploy | Dependência ou sintaxe | `docker logs scm-prod` + `cat deploy.log` |
| VPS desatualizada após PR | Webhook com erro | `cd /var/www/cartola && git pull origin main && docker compose build scm-prod && docker compose up -d scm-prod` |
