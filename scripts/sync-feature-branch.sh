#!/bin/bash
# =================================================================
# sync-feature-branch.sh - Sincronizar feature branch via Git
# =================================================================
# Uso: bash scripts/sync-feature-branch.sh [branch-name]
# Se não informar branch, detecta automaticamente a branch atual
# =================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Sincronizando Feature Branch${NC}"
echo "================================================"

# 1. Detectar branch atual ou usar argumento
if [ -n "$1" ]; then
    BRANCH="$1"
    echo -e "${YELLOW}📍 Branch especificada: ${BRANCH}${NC}"
else
    BRANCH=$(git branch --show-current)
    echo -e "${YELLOW}📍 Branch atual detectada: ${BRANCH}${NC}"
fi

# 2. Verificar se é uma feature branch válida
if [[ ! "$BRANCH" =~ ^claude/ ]]; then
    echo -e "${RED}❌ ERRO: Branch '$BRANCH' não é uma feature branch (deve começar com 'claude/')${NC}"
    echo -e "${YELLOW}💡 Use: bash scripts/sync-feature-branch.sh claude/nome-da-branch${NC}"
    exit 1
fi

# 3. Verificar se há mudanças locais
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}📦 Mudanças locais detectadas${NC}"
    echo ""
    git status --short
    echo ""
    read -p "Deseja fazer stash das mudanças locais? (s/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo -e "${BLUE}💾 Salvando mudanças locais (stash)...${NC}"
        git stash push -m "Auto-stash before sync $(date +%Y-%m-%d_%H:%M:%S)"
        STASHED=true
    else
        echo -e "${RED}❌ Cancelado: Commit ou stash suas mudanças primeiro${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Sem mudanças locais${NC}"
    STASHED=false
fi

# 4. Fetch remoto
echo -e "${BLUE}🌐 Buscando atualizações do remoto...${NC}"
git fetch --all --prune

# 5. Verificar se branch existe no remoto
if ! git ls-remote --heads origin "$BRANCH" | grep -q "$BRANCH"; then
    echo -e "${RED}❌ ERRO: Branch '$BRANCH' não existe no remoto${NC}"
    echo -e "${YELLOW}💡 Branches disponíveis:${NC}"
    git branch -r | grep "claude/" | head -10
    exit 1
fi

# 6. Checkout na branch se não estiver nela
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo -e "${BLUE}🔀 Mudando para branch ${BRANCH}...${NC}"
    git checkout "$BRANCH"
fi

# 7. Pull com rebase
echo -e "${BLUE}⬇️  Sincronizando com origin/${BRANCH}...${NC}"
if git pull --rebase origin "$BRANCH"; then
    echo -e "${GREEN}✅ Pull com rebase concluído${NC}"
else
    echo -e "${RED}❌ ERRO: Conflitos detectados no rebase${NC}"
    echo -e "${YELLOW}💡 Resolva os conflitos manualmente e execute:${NC}"
    echo "   git rebase --continue"
    echo "   ou"
    echo "   git rebase --abort (para cancelar)"
    exit 1
fi

# 8. Restaurar mudanças locais
if [ "$STASHED" = true ]; then
    echo -e "${BLUE}📦 Restaurando mudanças locais...${NC}"
    if git stash pop; then
        echo -e "${GREEN}✅ Mudanças restauradas${NC}"
    else
        echo -e "${RED}⚠️  Conflito ao restaurar stash${NC}"
        echo -e "${YELLOW}💡 Resolva os conflitos manualmente${NC}"
        echo "   Mudanças estão em: git stash list"
    fi
fi

# 9. Mostrar resumo
echo ""
echo "================================================"
echo -e "${GREEN}✅ SINCRONIZAÇÃO CONCLUÍDA${NC}"
echo ""
echo -e "${BLUE}📋 Últimos 5 commits:${NC}"
git log --oneline --graph -5
echo ""

echo -e "${BLUE}📊 Status atual:${NC}"
git status --short
echo ""

echo -e "${BLUE}🌿 Branch ativa:${NC} $(git branch --show-current)"
echo -e "${BLUE}🔗 Tracking:${NC} $(git config branch.$(git branch --show-current).remote)/$(git config branch.$(git branch --show-current).merge | sed 's|refs/heads/||')"
echo ""

# 10. Verificar se precisa restart do servidor
if false; then
    # bloco legado removido (era específico do Replit)
    echo ""
fi

echo -e "${GREEN}🎉 Pronto! Suas mudanças estão atualizadas.${NC}"
