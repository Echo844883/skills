#!/usr/bin/env bash
# Regenerate .claude/skills/ from skills/.
#
# skills/ is the plugin-marketplace copy and keeps upstream's directory names.
# .claude/skills/ is the auto-loaded copy for sessions opened in this repo, and
# its directory names match each SKILL.md's `name:` field. Run this after
# changing anything under skills/.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .claude/skills
mkdir -p .claude/skills

for dir in skills/*/; do
  [ -f "$dir/SKILL.md" ] || continue
  name=$(sed -n 's/^name: *//p' "$dir/SKILL.md" | head -1)
  if [ -z "$name" ]; then
    echo "no name: field in $dir/SKILL.md" >&2
    exit 1
  fi
  mkdir -p ".claude/skills/$name"
  cp -R "$dir"* ".claude/skills/$name/"
  echo "$dir -> .claude/skills/$name/"
done
