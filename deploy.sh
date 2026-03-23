#!/bin/bash
#
# Deploy Script - Super Cartola Manager
# Executa: git pull, docker compose build, docker compose up
#

set -e

APP_DIR="/var/www/cartola"
CONTAINER="scm-prod"
LOG_FILE="$APP_DIR/deploy.log"

cd "$APP_DIR"

echo "========================================" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy iniciado" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Git pull
echo "[STEP 1/3] Git pull origin main..." | tee -a "$LOG_FILE"
git pull origin main 2>&1 | tee -a "$LOG_FILE"

# Docker build
echo "[STEP 2/3] docker compose build $CONTAINER..." | tee -a "$LOG_FILE"
docker compose build "$CONTAINER" 2>&1 | tee -a "$LOG_FILE"

# Docker up
echo "[STEP 3/3] docker compose up -d $CONTAINER..." | tee -a "$LOG_FILE"
docker compose up -d "$CONTAINER" 2>&1 | tee -a "$LOG_FILE"

echo "========================================" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy concluido!" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Mostrar logs recentes
echo ""
echo "Logs recentes:"
docker logs "$CONTAINER" --tail 15
