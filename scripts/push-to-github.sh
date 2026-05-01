#!/usr/bin/env bash
# Create the GitHub repo (if missing) and push main. Requires GitHub CLI + login.
# Usage: bash scripts/push-to-github.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI, then authenticate:"
  echo "  sudo apt update && sudo apt install -y gh"
  echo "  gh auth login"
  echo "Then run: bash scripts/push-to-github.sh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged in. Run: gh auth login"
  exit 1
fi

REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$REMOTE_URL" ]]; then
  echo "No git remote 'origin'. Add it first, e.g.:"
  echo "  git remote add origin https://github.com/YOUR_USER/FilmTracker.git"
  exit 1
fi

# Repo slug from origin (…github.com/OWNER/REPO.git)
if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
else
  echo "Could not parse owner/repo from origin: $REMOTE_URL"
  exit 1
fi

if gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
  echo "Repository ${OWNER}/${REPO} already exists; pushing…"
else
  echo "Creating ${OWNER}/${REPO} on GitHub…"
  gh repo create "${REPO}" --public --confirm-owner-permission=false \
    --description "Canadian 35mm film price tracker" || true
  # If create failed (e.g. name taken), you may need to create it manually on github.com/new
fi

git push -u origin main
echo "Done."
