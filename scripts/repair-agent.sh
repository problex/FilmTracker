#!/usr/bin/env bash
#
# Scheduled repair agent (PLAN.md Phase 4d).
#
# Runs the health check; if it reports errors, asks Claude Code to investigate and
# open a pull request. It never merges, never deploys, and never writes to the
# database — the only outward action it can take is opening a PR for you to read.
#
# Authentication: this deliberately does NOT use `--bare`, because bare mode ignores
# the subscription login and requires an ANTHROPIC_API_KEY. Running without it uses
# the Claude Code login on this machine, so a Pro/Max subscription is enough. That
# also means this must run somewhere you have logged in — your own machine, not the
# NAS. Note the docs say `--bare` will become the default for `-p` in a future
# release; if this script starts failing on authentication, that is the likely cause,
# and the fix is to pass the mode explicitly or provide an API key.
#
# Usage:
#   scripts/repair-agent.sh          # only acts when health reports an error
#   scripts/repair-agent.sh --force  # investigate even if health is clean
#
# Cron (daily at 07:00, after the 00:00 scrape):
#   0 7 * * * cd /path/to/FilmTracker && scripts/repair-agent.sh >> /tmp/filmtracker-agent.log 2>&1
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

BASE="${FILMTRACKER_URL:-http://192.168.0.9:4000}"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH" >&2
  exit 2
fi

health=$(curl -sS -m 30 "$BASE/api/stores/health" 2>/dev/null) || {
  echo "$(date -Is) health endpoint unreachable at $BASE" >&2
  exit 2
}

errors=$(jq -r '[.issues[] | select(.severity=="error")] | length' <<<"$health")
if [[ "$errors" -eq 0 && "$FORCE" -eq 0 ]]; then
  echo "$(date -Is) health ok, nothing to do"
  exit 0
fi

echo "$(date -Is) health reports $errors error(s), starting investigation"

# Work on a branch so the repair never touches main directly.
branch="repair/$(date +%Y%m%d-%H%M%S)"
git checkout -q -b "$branch" || exit 2

PROMPT=$(cat <<'EOP'
You are maintaining FilmTracker, a Canadian 35mm film price tracker. A scheduled
health check has reported errors. Investigate and, if you find a real fix, open a
pull request.

The health report is below. Work through it in this order:

1. Read PLAN.md for how the scrapers are built and which failures are already known.
2. Reproduce the failure before changing anything. Store adapters fail silently — a
   broken selector returns zero rows, which looks identical to a store having no
   stock — so confirm what is actually happening against the live store rather than
   inferring it from the code.
3. Fix the cause, not the symptom.
4. Run `npm test` in server/. Every fix to a parsing or matching bug must come with a
   regression test using the real listing title that exposed it; that is the
   convention in server/src/stores/shared.test.ts.
5. Commit on the current branch and open a PR with `gh pr create`, explaining what
   failed, how you reproduced it, and what you changed.

Constraints:
- Do NOT merge the PR, deploy, or run any scrape against production.
- Do NOT modify the database.
- Do NOT widen a film alias to make a match happen. Aliases are the matching key and
  a loose one silently reassigns other films' listings; that has caused several
  production data bugs already. Every alias must pin the ISO.
- If you cannot reproduce the failure, or the cause is a store changing its site in a
  way that needs a judgement call, open no PR. Write a short summary of what you found
  and stop. A wrong fix is worse than an open issue.
EOP
)

printf '%s\n\nHealth report:\n%s\n' "$PROMPT" "$health" | claude -p \
  --permission-mode acceptEdits \
  --permission-prompts none \
  --allowedTools "Read,Edit,Write,Grep,Glob,Bash(npm test*),Bash(npx *),Bash(git *),Bash(gh pr *),Bash(curl *),WebFetch" \
  --output-format json \
  | jq -r '.result // .'

# Leave the branch in place only if the agent committed to it; otherwise return to main.
if git diff --quiet HEAD 2>/dev/null && [[ -z "$(git log main.."$branch" --oneline 2>/dev/null)" ]]; then
  git checkout -q main && git branch -q -D "$branch"
  echo "$(date -Is) no changes made; branch discarded"
else
  echo "$(date -Is) changes left on branch $branch"
fi
