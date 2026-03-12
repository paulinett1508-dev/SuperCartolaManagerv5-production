#!/usr/bin/env bash
# fetch-profile.sh — Fetch GitHub user profile data via API
# Usage: ./fetch-profile.sh <username>
#
# Requires: curl, python3
# Optional: GITHUB_TOKEN env var for authenticated requests (higher rate limit)

set -euo pipefail

USERNAME="${1:-}"

if [ -z "$USERNAME" ]; then
  echo "Usage: fetch-profile.sh <github-username>"
  exit 1
fi

# Try to extract token from git remote (Replit pattern)
TOKEN="${GITHUB_TOKEN:-$(git remote get-url origin 2>/dev/null | sed -n 's|https://\(ghp_[^@]*\)@.*|\1|p' || true)}"

TMPFILE=$(mktemp /tmp/gh-profile-XXXXXX.json)
REPOS_FILE=$(mktemp /tmp/gh-repos-XXXXXX.json)
EVENTS_FILE=$(mktemp /tmp/gh-events-XXXXXX.json)
trap 'rm -f "$TMPFILE" "$REPOS_FILE" "$EVENTS_FILE"' EXIT

AUTH_HEADER=""
if [ -n "$TOKEN" ]; then
  AUTH_HEADER="Authorization: token $TOKEN"
fi

# Fetch profile, repos, and recent events in parallel
curl -s ${AUTH_HEADER:+-H "$AUTH_HEADER"} -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/${USERNAME}" -o "$TMPFILE" &
PID1=$!

curl -s ${AUTH_HEADER:+-H "$AUTH_HEADER"} -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/${USERNAME}/repos?sort=updated&per_page=10" -o "$REPOS_FILE" &
PID2=$!

curl -s ${AUTH_HEADER:+-H "$AUTH_HEADER"} -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/${USERNAME}/events/public?per_page=30" -o "$EVENTS_FILE" &
PID3=$!

wait $PID1 $PID2 $PID3

# Parse and format with python3 (jq not available in all environments)
python3 - "$TMPFILE" "$REPOS_FILE" "$EVENTS_FILE" << 'PYEOF'
import json
import sys
from datetime import datetime

def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

profile = load_json(sys.argv[1])
repos = load_json(sys.argv[2])
events = load_json(sys.argv[3])

if not profile or "login" not in profile:
    msg = profile.get("message", "Unknown error") if isinstance(profile, dict) else "Failed to fetch"
    print(f"Error fetching profile: {msg}")
    sys.exit(1)

# === Profile Summary ===
print(f"## GitHub Profile: {profile['login']}")
print()
if profile.get("name"):
    print(f"**Name:** {profile['name']}")
if profile.get("bio"):
    print(f"**Bio:** {profile['bio']}")
if profile.get("company"):
    print(f"**Company:** {profile['company']}")
if profile.get("location"):
    print(f"**Location:** {profile['location']}")
if profile.get("blog"):
    print(f"**Website:** {profile['blog']}")
print(f"**Profile:** https://github.com/{profile['login']}")
print()

# Stats
print("### Stats")
print(f"| Metric | Value |")
print(f"|--------|-------|")
print(f"| Public Repos | {profile.get('public_repos', 0)} |")
print(f"| Public Gists | {profile.get('public_gists', 0)} |")
print(f"| Followers | {profile.get('followers', 0)} |")
print(f"| Following | {profile.get('following', 0)} |")
created = profile.get("created_at", "")
if created:
    dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
    print(f"| Member Since | {dt.strftime('%b %Y')} |")
print()

# === Top Repos ===
if repos and isinstance(repos, list):
    print("### Top Repositories (by recent update)")
    print()
    print("| Repository | Stars | Forks | Language | Updated |")
    print("|------------|-------|-------|----------|---------|")
    for r in repos[:10]:
        name = r.get("name", "?")
        stars = r.get("stargazers_count", 0)
        forks = r.get("forks_count", 0)
        lang = r.get("language") or "-"
        updated = r.get("updated_at", "")
        if updated:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            updated = dt.strftime("%d/%m/%Y")
        fork_badge = " (fork)" if r.get("fork") else ""
        print(f"| {name}{fork_badge} | {stars} | {forks} | {lang} | {updated} |")
    print()

# === Recent Activity ===
if events and isinstance(events, list):
    print("### Recent Activity (last 30 public events)")
    print()
    activity = {}
    for e in events:
        etype = e.get("type", "Unknown")
        activity[etype] = activity.get(etype, 0) + 1

    print("| Event Type | Count |")
    print("|------------|-------|")
    for etype, count in sorted(activity.items(), key=lambda x: -x[1]):
        label = etype.replace("Event", "")
        print(f"| {label} | {count} |")
    print()

    # Most recent events detail
    print("**Last 5 events:**")
    print()
    for e in events[:5]:
        etype = e.get("type", "?").replace("Event", "")
        repo = e.get("repo", {}).get("name", "?")
        created = e.get("created_at", "")
        if created:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            created = dt.strftime("%d/%m %H:%M")
        print(f"- **{etype}** on `{repo}` ({created})")
    print()
PYEOF
