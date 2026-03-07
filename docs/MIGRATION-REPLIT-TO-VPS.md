# Guia de Migracao: Replit → VPS Hostinger (Docker)

## Pre-requisitos

### Na VPS Hostinger
```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose (v2 - vem com Docker Engine)
docker compose version

# Nginx
sudo apt install nginx -y

# Certbot (SSL)
sudo apt install certbot python3-certbot-nginx -y
```

### MongoDB Atlas
1. Criar novo cluster (M0 free ou M2/M5 pago)
2. Database: `cartola-manager-v2`
3. Whitelist: IP da VPS + IP local
4. Copiar connection string

### Google Cloud Console
1. Criar projeto: "Super Cartola Manager"
2. Ativar API: Google+ API
3. Credenciais → OAuth 2.0 Client ID → Web Application
4. Authorized redirect URIs:
   - `https://supercartolamanager.com.br/api/oauth/callback`
   - `https://staging.supercartolamanager.com.br/api/oauth/callback`
   - `http://localhost:3000/api/oauth/callback`
5. Copiar Client ID e Client Secret

---

## 1. Migrar Dados MongoDB

```bash
# No computador local (com mongodump instalado)

# Exportar do cluster atual
mongodump --uri="mongodb+srv://USER:PASS@cluster-atual.mongodb.net/cartola-manager" \
  --out=./dump \
  --excludeCollection=sessions

# Importar no cluster novo
mongorestore --uri="mongodb+srv://USER:PASS@cluster-novo.mongodb.net/cartola-manager-v2" \
  --drop \
  ./dump/cartola-manager

# Verificar contagem
mongosh "mongodb+srv://USER:PASS@cluster-novo.mongodb.net/cartola-manager-v2" \
  --eval "db.getCollectionNames().forEach(c => print(c + ': ' + db[c].countDocuments()))"
```

---

## 2. Configurar VPS

### Criar diretorio do projeto
```bash
sudo mkdir -p /opt/super-cartola-manager
sudo chown $USER:$USER /opt/super-cartola-manager
cd /opt/super-cartola-manager
git clone https://github.com/SEU_USUARIO/SuperCartolaManagerv6.git .
```

### Criar arquivos de ambiente
```bash
# Staging
cat > .env.staging << 'EOF'
NODE_ENV=staging
PORT=3000
MONGO_URI=mongodb+srv://USER:PASS@cluster-novo.mongodb.net/cartola-manager-v2
SESSION_SECRET=gerar_com_openssl_rand_hex_32
BASE_URL=https://staging.supercartolamanager.com.br
ADMIN_EMAILS=email1@gmail.com,email2@gmail.com
SUPER_ADMIN_EMAIL=email1@gmail.com
GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
API_FOOTBALL_KEY=sua_chave
SOCCERDATA_API_KEY=sua_chave
CARTOLA_GLB_TOKEN=seu_token
VAPID_PUBLIC_KEY=sua_chave_publica
VAPID_PRIVATE_KEY=sua_chave_privada
EOF

# Producao (copiar de staging e ajustar)
cp .env.staging .env.prod
# Editar: NODE_ENV=production, BASE_URL=https://supercartolamanager.com.br
```

### Build e Start
```bash
# Staging apenas
docker compose up -d scm-staging

# Verificar
docker compose logs -f scm-staging

# Producao
docker compose up -d scm-prod
```

---

## 3. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/scm-staging
```

```nginx
server {
    listen 80;
    server_name staging.supercartolamanager.com.br;

    # Assets estaticos servidos direto pelo Nginx (bypass Express)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|webmanifest)$ {
        root /opt/super-cartola-manager/public;
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri @backend;
    }

    location @backend {
        proxy_pass http://localhost:3001;
    }

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Limitar tamanho de upload
    client_max_body_size 50M;
}
```

```bash
# Producao (mesma config, porta 3000, server_name supercartolamanager.com.br)
sudo cp /etc/nginx/sites-available/scm-staging /etc/nginx/sites-available/scm-prod
sudo nano /etc/nginx/sites-available/scm-prod
# Editar: server_name e porta

# Ativar sites
sudo ln -s /etc/nginx/sites-available/scm-staging /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/scm-prod /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d staging.supercartolamanager.com.br
sudo certbot --nginx -d supercartolamanager.com.br

# Auto-renovacao (ja configurado pelo certbot)
sudo certbot renew --dry-run
```

---

## 5. DNS

### 24h antes da migracao
- Baixar TTL para 300s (5 minutos)

### No momento da migracao
```
A    supercartolamanager.com.br          → IP_DA_VPS
A    staging.supercartolamanager.com.br  → IP_DA_VPS
```

### 48h apos migracao estavel
- Subir TTL para 3600s

---

## 6. GitHub Secrets (para deploy automatico)

No repo GitHub → Settings → Secrets:
- `VPS_HOST`: IP da VPS
- `VPS_USER`: usuario SSH
- `VPS_SSH_KEY`: chave privada SSH

---

## 7. Comandos Uteis

```bash
# Logs em tempo real
docker compose logs -f scm-prod

# Status dos containers
docker compose ps

# Rebuild apos alteracoes
docker compose build --no-cache scm-prod
docker compose up -d scm-prod

# Parar staging (economia de recursos)
docker compose stop scm-staging

# Monitorar recursos
docker stats

# Entrar no container
docker exec -it scm-prod sh

# Backup MongoDB (dentro do container ou local)
mongodump --uri="$MONGO_URI" --out=/tmp/backup-$(date +%Y%m%d)
```

---

## 8. Rollback

Se algo der errado apos a migracao:

1. **DNS**: Reverter A record para IP do Replit
2. **Replit**: Ainda rodando com banco original (manter 48h)
3. **Tempo**: Propagacao DNS 5-30 minutos

---

## 9. Checklist Pre-Migracao

- [ ] Cluster MongoDB novo criado e dados migrados
- [ ] Contagem de documentos validada (origem vs destino)
- [ ] Google OAuth configurado no Google Cloud Console
- [ ] VPS com Docker, Nginx e Certbot instalados
- [ ] `.env.staging` e `.env.prod` criados na VPS
- [ ] Container staging rodando sem erros
- [ ] Login admin via Google OAuth funciona no staging
- [ ] Area participante funciona no staging
- [ ] Cron jobs executando (verificar logs)
- [ ] SSL configurado e funcionando
- [ ] TTL do DNS baixado para 300s
- [ ] Comunicacao aos usuarios sobre re-login

## 10. Checklist Pos-Migracao

- [ ] DNS propagou (verificar via `dig supercartolamanager.com.br`)
- [ ] HTTPS funciona sem erros
- [ ] Login admin funciona em producao
- [ ] Login participante funciona em producao
- [ ] Consolidacao de rodada funciona
- [ ] Push notifications funcionam
- [ ] Replit mantido 48h como rollback
- [ ] TTL DNS restaurado para 3600s
