# Infraestrutura VPS — Super Cartola Manager

> **Última atualização:** 2026-05-02
> **Responsável:** paulinett1508-dev
> **VPS:** Hostinger — `195.200.5.145`
> **DNS Hosting:** Cloudflare Free (desde 2026-05-02)

---

## Arquitetura Atual

```
Internet (HTTP/HTTPS)
  └── DNS resolvido por Cloudflare
        ns: grant.ns.cloudflare.com / ligia.ns.cloudflare.com
        A   supercartolamanager.com.br      → 195.200.5.145
        A   www.supercartolamanager.com.br  → 195.200.5.145
        proxy: DNS only (cinza) — sem proxy/CDN no momento
  └── nginx (portas 80/443 do HOST — NÃO container)
        └── proxy_pass → localhost:5000
              └── Docker: scm-prod (5000:3000)
                    └── Node.js Express — porta 3000 (interna)

GitHub push → main
  └── webhook GitHub → POST /webhook/deploy (porta 9000)
        └── PM2: cartola-webhook (/var/www/cartola/webhook.cjs)
              └── deploy.sh → git pull + docker compose build + up
```

> Registro do domínio `.com.br` permanece no **Registro.br** (obrigação legal). Apenas os **nameservers** apontam para Cloudflare. A VPS continua na Hostinger; o app continua rodando no Docker do servidor.

---

## DNS Hosting (Cloudflare)

### Por que Cloudflare e não Registro.br

O serviço "DNS automático" do Registro.br (`a.auto.dns.br` / `b.auto.dns.br`) **não oferece editor de zona** — só permite trocar nameservers. Zona DNS fica vazia, sem possibilidade de adicionar registros A/CNAME/MX/TXT pelo painel.

A Hostinger oferece "DNS Zone Editor", **mas só para clientes com plano de Web Hosting** (compartilhado/Cloud) — VPS-only NÃO tem acesso. Tentar adicionar registro retorna `Domínio não encontrado`.

Cloudflare Free Plan resolve sem custo, com painel decente e propagação rápida.

### Configuração atual

**Conta:** `paulinett1508@gmail.com`
**Plano:** Free ($0/mês)
**Zona:** `supercartolamanager.com.br`

**Nameservers (configurados no Registro.br):**
```
grant.ns.cloudflare.com
ligia.ns.cloudflare.com
```
> Cada conta Cloudflare recebe um par diferente — não copiar de outras instalações.

**Registros DNS:**

| Tipo | Nome | Conteúdo | Proxy | TTL |
|---|---|---|---|---|
| A | `@` (apex) | `195.200.5.145` | DNS only (cinza) | Auto |
| A | `www` | `195.200.5.145` | DNS only (cinza) | Auto |
| MX/TXT | (existentes) | Email/SPF/DMARC | — | Auto |

⚠️ **Por que DNS only e não Proxied (laranja):** com proxy ativado, Cloudflare termina TLS no edge dele e refaz a conexão com a origem. Como a VPS já tem nginx + Let's Encrypt configurado pra terminar TLS direto, ativar proxy quebraria SSL/webhooks/IP real. Para ligar Proxied no futuro: configurar mode "Full (strict)" + adicionar regra de origem CA + considerar webhook GitHub que precisa do IP real.

### Onde alterar registros DNS

1. https://dash.cloudflare.com → login com `paulinett1508@gmail.com`
2. Selecionar zona `supercartolamanager.com.br`
3. Aba **DNS → Records**

⚠️ **Nunca tocar nos nameservers no Registro.br** sem antes preparar zona equivalente em outro provedor — quebra resolução em até 48h até propagação.

### DNSSEC

Atualmente **desativado** em ambas as pontas (Registro.br e Cloudflare). Não ativar sem coordenar — Cloudflare exige adicionar DS record no Registro.br (e o Registro.br auto-DNS legacy não suporta).

---

## Multi-projeto na VPS — Regra Crítica

### Princípio

A VPS pode rodar quantos projetos quiser, **desde que apenas o nginx do host ouça nas portas 80/443**. Cada app roda em **porta interna alternativa** (8080, 9000, etc.) e o nginx faz proxy reverso roteando por `server_name`.

```
                    Internet
                       ↓
             [ nginx do host ]   ← único processo em 80/443
                       ├── server_name supercartolamanager.com.br → localhost:5000 (scm-prod)
                       ├── server_name vps.supercartolamanager.com.br → localhost:???
                       └── server_name <novo>.dominio.com.br → localhost:8080 (novo app)
```

### O que NUNCA fazer

❌ Instalar app via script automático que faz `docker run -p 80:80 -p 443:443` ou `docker-compose` com `ports: ["80:80", "443:443"]`
❌ Subir Caddy/Traefik dentro de container fazendo bind nas portas do host
❌ Permitir que outro app gerencie certificados Let's Encrypt do `supercartolamanager.com.br` — só o certbot do host faz isso

### Como instalar app novo corretamente

1. Definir **subdomínio próprio** (ex: `hq.supercartolamanager.com.br` ou outro domínio dedicado)
2. Adicionar registro A na Cloudflare apontando pra `195.200.5.145`
3. Subir app em porta interna alternativa (`docker compose ... ports: ["8080:80"]`, sem bind em 80/443)
4. Criar novo arquivo em `/etc/nginx/sites-available/<projeto>` com:
   ```nginx
   server {
     listen 443 ssl;
     server_name hq.supercartolamanager.com.br;
     ssl_certificate /etc/letsencrypt/live/hq.supercartolamanager.com.br/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/hq.supercartolamanager.com.br/privkey.pem;
     location / { proxy_pass http://127.0.0.1:8080; }
   }
   ```
5. `ln -s /etc/nginx/sites-available/<projeto> /etc/nginx/sites-enabled/`
6. `certbot --nginx -d hq.supercartolamanager.com.br` (gera cert Let's Encrypt)
7. `nginx -t && systemctl reload nginx`

### Sintomas de conflito (quando outro app tomou 80/443)

- HTTPS retorna `ERR_SSL_PROTOCOL_ERROR` ou `tls alert internal error`
- Header HTTP traz `server: Caddy` (ou outro proxy desconhecido) em vez de `nginx/x.x.x (Ubuntu)`
- `ss -tlnp | grep ':443'` mostra `docker-proxy` em vez de `nginx`
- Site responde mas com cert auto-gerado errado para o domínio

**Diagnóstico imediato:** `ss -tlnp | grep -E ':80 |:443 '` — se `docker-proxy` aparecer aí, algum container roubou as portas. Identificar com `docker ps` e parar.

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

### 2026-05-02 — Migração DNS para Cloudflare + remoção do hqplus

**Problemas identificados (em sequência):**

1. **DNS quebrado (NXDOMAIN):** `supercartolamanager.com.br` parou de resolver. Registro.br tinha apenas SOA e nameservers `a.auto.dns.br`/`b.auto.dns.br` — sem registros A/CNAME. Causa: o DNS automático do Registro.br **não oferece editor de zona**. Domínio ficou inalcançável até propagação reverter.

2. **Container externo tomando portas 80/443:** após restaurar DNS, HTTPS retornava `ERR_SSL_PROTOCOL_ERROR`. Diagnóstico via `ss -tlnp` revelou `docker-proxy` ouvindo nas portas 80/443 em vez do nginx. Causa: instalação prévia do app `hqplus` (de outro dev/projeto) usou Caddy próprio dentro de container fazendo bind direto em `0.0.0.0:80,443`, sequestrando todo tráfego HTTPS do servidor — incluindo o do Cartola.

**Ações executadas:**

1. Criada conta Cloudflare (`paulinett1508@gmail.com`), zona `supercartolamanager.com.br` adicionada no plano Free
2. Registros A criados na Cloudflare: apex e `www` → `195.200.5.145` (DNS only, sem proxy)
3. Nameservers no Registro.br trocados de `a.auto.dns.br`/`b.auto.dns.br` para `grant.ns.cloudflare.com`/`ligia.ns.cloudflare.com`
4. Aguardada propagação (~15 min) — DNS confirmado em DoH público
5. `docker compose down --volumes --remove-orphans` em `/opt/hqplus/deploy/` — removidos containers, volumes (`pgdata`, `redisdata`, `caddy_data`, `caddy_config`), networks
6. `rm -rf /opt/hqplus`
7. `systemctl restart nginx` — porta 80/443 reocupadas pelo nginx do host
8. Validação fim-a-fim: `https://supercartolamanager.com.br` → `HTTP/2 200`, `server: nginx/1.24.0`, `x-powered-by: Express` ✅

**Preservado (intocado):**
- `scm-prod`, `scm-mcp` (containers do Cartola)
- `/var/www/cartola/`
- nginx + certbot do host (cert válido até 2026-06-19)
- `/root/antigravity/` (projeto F1, separado)

**Lições documentadas em `.claude/LESSONS.md`:**
- INFRA: `auto.dns.br` do Registro.br não tem editor de zona — domínios `.br` precisam de DNS hosting separado (Cloudflare/Hostinger Web/etc) para qualquer registro A/CNAME
- PROCESSO: instaladores automáticos de "outros devs" (curl ... | bash) frequentemente fazem bind direto em 80/443 — multi-projeto na VPS exige nginx do host como único proxy

---

## Troubleshooting

| Sintoma | Diagnóstico | Solução |
|---|---|---|
| Container `unhealthy` | Healthcheck falhando | `docker exec scm-prod wget --spider http://127.0.0.1:3000/api/app/check-version` |
| Deploy não dispara | Webhook não recebe evento | `pm2 logs cartola-webhook` — verificar se push foi para `main` |
| App não responde em prod | Container parado ou reiniciando | `docker ps` → `docker logs scm-prod --tail 30` |
| Build falha no deploy | Dependência ou sintaxe | `docker logs scm-prod` + `cat deploy.log` |
| VPS desatualizada após PR | Webhook com erro | `cd /var/www/cartola && git pull origin main && docker compose build scm-prod && docker compose up -d scm-prod` |
| `ERR_SSL_PROTOCOL_ERROR` no navegador | nginx não está ouvindo 443 (outro container roubou a porta) | `ss -tlnp \| grep ':443 '` — se aparecer `docker-proxy`, identificar com `docker ps`, parar/remover container conflitante, `systemctl restart nginx` |
| `NXDOMAIN` / domínio não resolve | Registros A removidos ou nameservers errados | Confirmar NS: `curl -s "https://dns.google/resolve?name=supercartolamanager.com.br&type=NS"` — esperado `grant.ns.cloudflare.com`/`ligia.ns.cloudflare.com`. Se sim, abrir Cloudflare → DNS Records e confirmar A apex + www → `195.200.5.145` |
| Header HTTP traz `server: Caddy` (ou outro) | Container externo interceptando antes do nginx | Mesmo procedimento de `ERR_SSL_PROTOCOL_ERROR`: `ss -tlnp` + `docker ps` |
