#!/bin/bash
# git-push.sh — Push inteligente com detecção automática de credenciais
#
# Uso:
#   bash scripts/git-push.sh              # push da branch atual
#   bash scripts/git-push.sh main         # push de branch específica
#   bash scripts/git-push.sh --force      # force push (com confirmação)

set -e

BRANCH="${1:-$(git branch --show-current)}"
FORCE=""

if [ "$1" = "--force" ]; then
    BRANCH="$(git branch --show-current)"
    read -p "⚠️  Force push em '$BRANCH'? (s/N): " CONFIRM
    [ "$CONFIRM" = "s" ] || { echo "Cancelado."; exit 0; }
    FORCE="--force"
fi

REPO_URL=$(git remote get-url origin 2>/dev/null)
REPO_PATH=$(echo "$REPO_URL" | sed -E 's|https?://[^/]+/||' | sed 's/\.git$//')

echo "📦 Branch: $BRANCH"
echo "📍 Repo:   $REPO_PATH"

# --- Opção 1: GITHUB_TOKEN (env var) ---
if [ -n "$GITHUB_TOKEN" ]; then
    echo "🔑 Usando GITHUB_TOKEN"
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_PATH}.git"
    git push origin "$BRANCH" $FORCE
    # Restaurar URL limpa (sem token)
    git remote set-url origin "https://github.com/${REPO_PATH}.git"
    echo "✅ Push concluído com sucesso!"
    exit 0
fi

# --- Opção 2: GH_TOKEN (GitHub CLI pattern) ---
if [ -n "$GH_TOKEN" ]; then
    echo "🔑 Usando GH_TOKEN"
    git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${REPO_PATH}.git"
    git push origin "$BRANCH" $FORCE
    git remote set-url origin "https://github.com/${REPO_PATH}.git"
    echo "✅ Push concluído com sucesso!"
    exit 0
fi

# --- Fallback: instruções manuais ---
echo "❌ Nenhum token encontrado (GITHUB_TOKEN ou GH_TOKEN)"
echo ""
echo "Configure uma das opções:"
echo "  export GITHUB_TOKEN=ghp_seu_token_aqui"
echo "  bash scripts/git-push.sh"
echo ""
echo "Ou faça push manual:"
echo "  git push origin $BRANCH"
exit 1
