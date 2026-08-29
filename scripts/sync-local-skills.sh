#!/usr/bin/env bash
# Regenerate .claude/skills/ from the vendored skill collections.
#
# skills/                    - taste-skill, upstream directory names, plugin root
# vendor/superpowers/skills/ - superpowers, upstream directory names
# vendor/ego-lite/skills/    - ego-browser, upstream directory names
# .claude/skills/            - the auto-loaded copy for sessions opened in this
#                              repo; directory names match each SKILL.md `name:`
#
# Run this after changing anything under either source tree.
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCES=(skills vendor/superpowers/skills vendor/ego-lite/skills)

rm -rf .claude/skills
mkdir -p .claude/skills

for src in "${SOURCES[@]}"; do
  for dir in "$src"/*/; do
    [ -f "$dir/SKILL.md" ] || continue
    name=$(sed -n 's/^name: *//p' "$dir/SKILL.md" | head -1 | tr -d '"')
    if [ -z "$name" ]; then
      echo "no name: field in $dir/SKILL.md" >&2
      exit 1
    fi
    if [ -e ".claude/skills/$name" ]; then
      echo "duplicate skill name '$name' (second one from $dir)" >&2
      exit 1
    fi
    mkdir -p ".claude/skills/$name"
    cp -R "$dir"* ".claude/skills/$name/"
    echo "$dir -> .claude/skills/$name/"
  done
done

echo "total: $(find .claude/skills -maxdepth 1 -mindepth 1 -type d | wc -l) skills"
