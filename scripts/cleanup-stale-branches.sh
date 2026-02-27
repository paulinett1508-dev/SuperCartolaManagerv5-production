#!/bin/bash
# =============================================================
# Script de limpeza de branches remotas obsoletas
# Gerado em: 2026-02-27
# Repositório: SuperCartolaManagerv5
#
# USO:
#   chmod +x scripts/cleanup-stale-branches.sh
#   ./scripts/cleanup-stale-branches.sh --dry-run    # Ver o que será deletado
#   ./scripts/cleanup-stale-branches.sh --force       # Executar de verdade
# =============================================================

set -euo pipefail

MODE="${1:-}"

if [[ "$MODE" != "--dry-run" && "$MODE" != "--force" ]]; then
    echo "❌ Use --dry-run para simular ou --force para executar"
    exit 1
fi

# Lista completa de branches a deletar
BRANCHES=(
    # Grupo 1: Já mergeadas (0 ahead)
    "claude/enhance-claude-md-2d5XW"
    "claude/fix-rounds-score-display-MraLG"
    "claude/redesign-foguinho-fab-widget-CIEwK"

    # Grupo 2: Obsoletas (histórico incompatível, +2900-3200 ahead)
    "claude/adapt-worldcup-design-RF7El"
    "claude/add-module-landing-pages-ffev8"
    "claude/add-world-cup-matches-ydGBp"
    "claude/admin-app-mobile-redesign-mYCrB"
    "claude/analyze-image-492M3"
    "claude/audit-app-bugs-ux-y4YpH"
    "claude/audit-financial-files-GDz1S"
    "claude/audit-system-dependencies-Fy0U4"
    "claude/collapse-highlights-section-MO6XA"
    "claude/fix-market-status-live-z0l5I"
    "claude/fix-matamata-billing-bug-xxilH"
    "claude/fix-mobile-loading-issue-zIozg"
    "claude/fix-modal-team-lineup-QU3F5"
    "claude/fix-mouse-input-events-u3cVD"
    "claude/fix-production-issue-fYnXD"
    "claude/fix-replit-republish-issue-ddsOL"
    "claude/fix-replit-server-error-6YKNz"
    "claude/fix-republish-freeze-hAui1"
    "claude/fix-rounds-grid-obstruction-T8Jen"
    "claude/fix-season-hardcoding-d8fPc"
    "claude/fix-top-scorer-loading-mavWu"
    "claude/fix-xray-widget-points-9xskF"
    "claude/libertadores-news-banner-DTrua"
    "claude/live-experience-audit-skill-DZosz"
    "claude/manage-stale-branches-Bwnc1"
    "claude/new-session-tR8UG"
    "claude/participant-info-display-wleMY"
    "claude/redesign-landing-page-CKShF"
    "claude/remove-financial-section-9yxUE"
    "claude/review-project-instructions-ekdPr"
    "claude/setup-restaumgame-rules-wFzcl"
    "claude/update-tiro-certo-rules-SL87a"
    "claude/update-welcome-screen-logo-Px8h5"

    # Grupo 3: Outros obsoletos
    "claude/analyze-stitch-mcp-Hl3hk"
    "claude/fix-round-data-display-tPJAI"
    "pr-146"
    "replit-agent"
)

TOTAL=${#BRANCHES[@]}
SUCCESS=0
FAILED=0

echo "=================================================="
echo "  Limpeza de Branches - SuperCartolaManagerv5"
echo "  Modo: $MODE"
echo "  Total: $TOTAL branches"
echo "=================================================="
echo ""

for branch in "${BRANCHES[@]}"; do
    if [[ "$MODE" == "--dry-run" ]]; then
        echo "🔍 [DRY-RUN] Deletaria: origin/$branch"
        SUCCESS=$((SUCCESS + 1))
    else
        echo -n "🗑️  Deletando: origin/$branch ... "
        if git push origin --delete "$branch" 2>/dev/null; then
            echo "✅"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "❌ (já deletada ou sem permissão)"
            FAILED=$((FAILED + 1))
        fi
    fi
done

echo ""
echo "=================================================="
echo "  Resultado: $SUCCESS OK / $FAILED falhas / $TOTAL total"
echo "=================================================="

if [[ "$MODE" == "--dry-run" ]]; then
    echo ""
    echo "👆 Nenhuma branch foi deletada (modo dry-run)."
    echo "   Execute com --force para deletar de verdade."
fi
