#!/bin/bash
# Syncs notes tagged with #public from kurukshetra vault to the notes repo docs/

VAULT_DIR="${VAULT_DIR:-$HOME/projects/obsidian/kurukshetra}"
NOTES_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs"

# Clean old content (keep static assets)
find "$NOTES_DIR" -name "*.md" -delete
find "$NOTES_DIR" -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" | xargs rm -f 2>/dev/null
find "$NOTES_DIR" -mindepth 1 -type d -not -name "fonts" -empty -delete

find "$VAULT_DIR" -name "*.md" -not -path "*/.obsidian/*" -not -path "*/.git/*" -not -path "*/copilot/*" -not -path "*/daily-notes/*" -not -path "*/assets/templates/*" -not -path "*/notes-site/*" | while read -r file; do
    if grep -q "#public" "$file"; then
        rel_path="${file#$VAULT_DIR/}"
        dest="$NOTES_DIR/$rel_path"
        mkdir -p "$(dirname "$dest")"
        cp "$file" "$dest"

        # Copy Obsidian-style image embeds ![[filename]]
        grep -oP '!\[\[([^\]]+)\]\]' "$file" 2>/dev/null | sed 's/!\[\[//;s/\]\]//' | while read -r asset; do
            asset_file=$(find "$VAULT_DIR" -name "$asset" -not -path "*/.git/*" 2>/dev/null | head -1)
            if [ -n "$asset_file" ]; then
                asset_rel="${asset_file#$VAULT_DIR/}"
                asset_dest="$NOTES_DIR/$asset_rel"
                mkdir -p "$(dirname "$asset_dest")"
                cp "$asset_file" "$asset_dest"
            fi
        done

        # Copy markdown-style images ![alt](path)
        grep -oP '!\[[^\]]*\]\(([^)]+)\)' "$file" 2>/dev/null | grep -oP '\(([^)]+)\)' | tr -d '()' | while read -r asset; do
            if [[ ! "$asset" =~ ^https?:// ]]; then
                asset_file="$(dirname "$file")/$asset"
                if [ -f "$asset_file" ]; then
                    asset_rel="${asset_file#$VAULT_DIR/}"
                    asset_dest="$NOTES_DIR/$asset_rel"
                    mkdir -p "$(dirname "$asset_dest")"
                    cp "$asset_file" "$asset_dest"
                fi
            fi
        done
    fi
done

# Generate manifest.json for the file tree
cd "$NOTES_DIR"
python3 -c "
import os, json

def build_tree(root):
    tree = {}
    for entry in sorted(os.listdir(root)):
        path = os.path.join(root, entry)
        if entry.startswith('.') or entry in ('index.html', 'style.css', 'app.js', 'manifest.json'):
            continue
        if os.path.isdir(path):
            subtree = build_tree(path)
            if subtree:
                tree[entry] = subtree
        elif entry.endswith('.md'):
            rel = os.path.relpath(path, '$NOTES_DIR')
            tree[entry] = rel
        elif entry.endswith(('.png','.jpg','.jpeg','.gif','.svg','.webp')):
            rel = os.path.relpath(path, '$NOTES_DIR')
            tree[entry] = rel
    return tree

tree = build_tree('$NOTES_DIR')
with open('$NOTES_DIR/manifest.json', 'w') as f:
    json.dump(tree, f, indent=2)
print(f'Generated manifest with {len(tree)} top-level entries')
"

count=$(find "$NOTES_DIR" -name "*.md" | wc -l)
echo "Synced $count public notes"
