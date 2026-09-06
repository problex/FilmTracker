#!/usr/bin/env bash
# FilmTracker scrape health check.
#
# Exits 0 when healthy or only warnings, 1 on errors, 2 if the API is unreachable.
# Cron-friendly: no dependencies beyond curl and jq, and it prints nothing on a clean
# run unless -v is passed, so a quiet cron mailbox means a healthy tracker.
set -uo pipefail

BASE="${FILMTRACKER_URL:-http://192.168.0.9:4000}"
VERBOSE=0
[[ "${1:-}" == "-v" ]] && VERBOSE=1

if ! body=$(curl -sS -m 30 "$BASE/api/stores/health" 2>/dev/null); then
  echo "UNREACHABLE: $BASE" >&2
  exit 2
fi

status=$(jq -r '.status // "unknown"' <<<"$body")
errors=$(jq -r '[.issues[] | select(.severity=="error")] | length' <<<"$body")
warns=$(jq -r '[.issues[] | select(.severity=="warn")] | length' <<<"$body")

if [[ "$VERBOSE" == "1" || "$status" == "error" ]]; then
  jq -r '
    "status: \(.status)",
    "last run: #\(.lastRun.id // "-") \(.lastRun.status // "-")",
    "films with offers: \(.films.withOffers)/\(.films.total)",
    "",
    (.issues[] | "[\(.severity)] \(.kind): \(.detail)")
  ' <<<"$body"
fi

if [[ "$errors" -gt 0 ]]; then
  echo "FilmTracker health: $errors error(s), $warns warning(s)" >&2
  exit 1
fi

[[ "$VERBOSE" == "1" ]] && echo "FilmTracker health: ok ($warns warning(s))"
exit 0
