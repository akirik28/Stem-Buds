#!/bin/sh
# Mirrors the working tree to an out-of-project scratch directory as a durability
# safety net (this machine has shown the project directory can revert to an
# earlier state — see git history around 2026-08-08). Never includes secrets:
# only files that would also be safe to commit are copied.
set -eu

SRC="/Users/direncagankirik/Stem & Buds/"
DEST="${MIRROR_DEST:?set MIRROR_DEST to the destination directory}"

rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .DS_Store \
  --exclude .env \
  --exclude .env.local \
  --exclude ".env.*.local" \
  --exclude storage/ \
  --exclude coverage/ \
  --exclude playwright-report/ \
  --exclude test-results/ \
  "$SRC" "$DEST"

echo "Mirrored to $DEST ($(find "$DEST" -type f | wc -l | tr -d ' ') files)"
