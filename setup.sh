#!/usr/bin/env bash
# =============================================================================
# setup.sh — Configuração inicial após clone ou pull
# Executar uma vez: bash setup.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "======================================"
echo "  Super Cartola Manager — Setup"
echo "======================================"
echo ""

# --- 1. .env ---
if [ -f ".env" ]; then
  ok ".env já existe"

  # Verificar se falta alguma chave vs .env.example
  MISSING=$(diff <(grep -v "^#\|^$" .env | cut -d= -f1 | sort) \
                 <(grep -v "^#\|^$" .env.example | cut -d= -f1 | sort) \
             2>/dev/null | grep "^>" | sed 's/^> /  - /')

  if [ -n "$MISSING" ]; then
    warn "Variáveis presentes no .env.example mas faltando no seu .env:"
    echo "$MISSING"
    echo "  → Adicione-as ao .env antes de rodar o app."
  else
    ok "Todas as variáveis do .env.example estão no .env"
  fi
else
  cp .env.example .env
  warn ".env criado a partir do .env.example — preencha os valores reais antes de rodar."
fi

echo ""

# --- 2. .mcp.json ---
if [ -f ".mcp.json" ]; then
  ok ".mcp.json já existe"
else
  cp .mcp.json.example .mcp.json
  warn ".mcp.json criado a partir do .mcp.json.example — preencha MONGO_URI e PERPLEXITY_API_KEY."
fi

echo ""

# --- 3. npm install ---
if [ -d "node_modules" ]; then
  ok "node_modules já existe — pulando npm install"
else
  echo "Instalando dependências..."
  npm install
  ok "npm install concluído"
fi

echo ""

# --- Resumo ---
echo "======================================"
echo "  Próximos passos:"
echo "======================================"
if ! grep -q "MONGO_URI=mongodb+srv" .env 2>/dev/null; then
  warn "Preencha MONGO_URI no .env"
fi
if ! grep -q "MONGO_URI=mongodb+srv" .mcp.json 2>/dev/null; then
  warn "Preencha MONGO_URI no .mcp.json"
fi
echo ""
echo "  Para rodar em dev:  npm run dev"
echo "  Para rodar full:    npm run dev:full"
echo ""
