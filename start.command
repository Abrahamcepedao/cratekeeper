#!/bin/bash
# Double-click this file in Finder to start Cratekeeper.
cd "$(dirname "$0")"
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  echo "Installing Bun (one-time)…"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
[ -d node_modules ] || bun install
bun start
