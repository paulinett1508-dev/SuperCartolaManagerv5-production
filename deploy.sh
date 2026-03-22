#!/bin/bash
#
# Deploy Script - Super Cartola Manager
# Executa: git pull, npm install, pm2 restart
#

set -e

APP_DIR="/var/www/cartola"
PM2_APP="cartola-manager"
LOG_FILE="$APP_DIR/deploy.log"

cd "$APP_DIR"

echo "========================================" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy iniciado" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Git pull
echo "[STEP 1/3] Git pull origin main..." | tee -a "$LOG_FILE"
git pull origin main 2>&1 | tee -a "$LOG_FILE"

# NPM install (apenas produção)
echo "[STEP 2/3] npm install --production..." | tee -a "$LOG_FILE"
npm install --production 2>&1 | tee -a "$LOG_FILE"

# PM2 restart
echo "[STEP 3/3] pm2 restart $PM2_APP..." | tee -a "$LOG_FILE"
pm2 restart "$PM2_APP" 2>&1 | tee -a "$LOG_FILE"

echo "========================================" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy concluido!" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Mostrar logs recentes
echo ""
echo "Logs recentes:"
pm2 logs "$PM2_APP" --lines 15 --nostream
