#!/bin/bash
# Post-commit hook for kurukshetra vault
# Syncs public notes and pushes to the notes repo
# Install: ln -sf ~/projects/notes/scripts/post-commit-hook.sh ~/projects/obsidian/kurukshetra/.git/hooks/post-commit

NOTES_REPO="$HOME/projects/notes"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# If called as git hook, SCRIPT_DIR will be .git/hooks - find sync.sh relative to notes repo
if [ -f "$NOTES_REPO/scripts/sync.sh" ]; then
    SYNC_SCRIPT="$NOTES_REPO/scripts/sync.sh"
else
    SYNC_SCRIPT="$SCRIPT_DIR/sync.sh"
fi

echo "[notes-sync] Syncing public notes..."
bash "$SYNC_SCRIPT"

cd "$NOTES_REPO"
if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "sync: update public notes"
    git push origin main
    echo "[notes-sync] Published updated notes"
else
    echo "[notes-sync] No changes to publish"
fi
