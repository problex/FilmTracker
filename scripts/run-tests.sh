#!/usr/bin/env bash
#
# Run the server test suite, wherever this machine keeps its Node.
#
# The repair agent (scripts/repair-agent.sh) must verify a fix before opening a PR,
# but the machine it runs on is whichever one you are logged into Claude Code on —
# not necessarily one with a Node toolchain installed. This project is developed
# through Docker, so `npm` may not exist on the host at all.
#
# Prefers a local npm; falls back to running the same suite in a container.
set -uo pipefail

cd "$(dirname "$0")/../server" || exit 2

if command -v npm >/dev/null 2>&1; then
  exec npm test "$@"
fi

if command -v docker >/dev/null 2>&1; then
  echo "no local npm; running the suite in node:${NODE_IMAGE_TAG:-22-alpine}" >&2
  exec docker run --rm \
    -v "$(cd .. && pwd)":/app \
    -w /app/server \
    "node:${NODE_IMAGE_TAG:-22-alpine}" \
    npm test "$@"
fi

echo "no way to run tests: neither npm nor docker is on PATH" >&2
exit 2
