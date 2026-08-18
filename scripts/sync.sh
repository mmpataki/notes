#!/bin/bash
# Syncs notes tagged with #public from kurukshetra vault to the notes repo docs/

VAULT_DIR="${VAULT_DIR:-$HOME/projects/obsidian/kurukshetra}"
NOTES_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs"

sanitize() {
    # Sanitize filename: lowercase, replace non-alphanumeric with dash, collapse dashes
    local name="${1%.md}"
    echo "$name" | sed 's/[^a-zA-Z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | tr '[:upper:]' '[:lower:]'
}

# Nuke everything except static site files
find "$NOTES_DIR" -mindepth 1 -not -name "index.html" -not -name "style.css" -not -name "app.js" -not -name "manifest.json" -not -path "*/fonts/*" -not -name "fonts" -delete
find "$NOTES_DIR" -mindepth 1 -type d -empty -delete

# Copy #public notes and their assets
find "$VAULT_DIR" -name "*.md" -not -path "*/.obsidian/*" -not -path "*/.git/*" -not -path "*/copilot/*" -not -path "*/daily-notes/*" -not -path "*/assets/templates/*" -not -path "*/notes-site/*" | while read -r file; do
    if grep -q "#public" "$file"; then
        rel_path="${file#$VAULT_DIR/}"
        orig_name="$(basename "$rel_path" .md)"
        safe_name="$(sanitize "$(basename "$rel_path")").md"
        dir_path="$(dirname "$rel_path")"

        # Sanitize directory names too
        safe_dir=$(echo "$dir_path" | sed 's/[^a-zA-Z0-9/]/-/g' | sed 's/--*/-/g' | sed 's/-\//\//g' | sed 's/\/-/\//g' | tr '[:upper:]' '[:lower:]')

        dest="$NOTES_DIR/$safe_dir/$safe_name"
        mkdir -p "$(dirname "$dest")"

        # Prepend title metadata if not already present
        if head -1 "$file" | grep -q "^title:"; then
            cp "$file" "$dest"
        else
            echo "title: $orig_name" > "$dest"
            cat "$file" >> "$dest"
        fi

        # Copy Obsidian-style image embeds ![[filename]]
        grep -oP '!\[\[([^\]]+)\]\]' "$file" 2>/dev/null | sed 's/!\[\[//;s/\]\]//' | while read -r asset; do
            asset_file=$(find "$VAULT_DIR" -name "$asset" -not -path "*/.git/*" 2>/dev/null | head -1)
            if [ -n "$asset_file" ]; then
                asset_rel="${asset_file#$VAULT_DIR/}"
                asset_dir=$(echo "$(dirname "$asset_rel")" | sed 's/[^a-zA-Z0-9/]/-/g' | sed 's/--*/-/g' | tr '[:upper:]' '[:lower:]')
                asset_dest="$NOTES_DIR/$asset_dir/$(basename "$asset_file")"
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
                    asset_dir=$(echo "$(dirname "$asset_rel")" | sed 's/[^a-zA-Z0-9/]/-/g' | sed 's/--*/-/g' | tr '[:upper:]' '[:lower:]')
                    asset_dest="$NOTES_DIR/$asset_dir/$(basename "$asset_file")"
                    mkdir -p "$(dirname "$asset_dest")"
                    cp "$asset_file" "$asset_dest"
                fi
            fi
        done
    fi
done

# Generate manifest.json
cd "$NOTES_DIR"
python3 -c "
import os, json

def get_title(filepath):
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if line.startswith('title:'):
                    return line[6:].strip()
                if line and not line.startswith(('date:', 'tags:')):
                    break
    except:
        pass
    return None

def build_tree(root):
    tree = {}
    for entry in sorted(os.listdir(root)):
        path = os.path.join(root, entry)
        if entry.startswith('.') or entry in ('index.html', 'style.css', 'app.js', 'manifest.json', 'fonts'):
            continue
        if os.path.isdir(path):
            subtree = build_tree(path)
            if subtree:
                tree[entry] = subtree
        elif entry.endswith('.md'):
            rel = os.path.relpath(path, '$NOTES_DIR')
            title = get_title(path)
            tree[entry] = {'path': rel, 'title': title} if title else rel
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
