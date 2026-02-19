#!/usr/bin/env bash
# Initialize a new skill directory with template SKILL.md
# Usage: init_skill.sh <skill-name> --path <output-directory>

set -euo pipefail

if [ $# -lt 3 ] || [ "$2" != "--path" ]; then
  echo "Usage: init_skill.sh <skill-name> --path <output-directory>"
  exit 1
fi

SKILL_NAME="$1"
OUTPUT_PATH="$3"
SKILL_DIR="${OUTPUT_PATH}/${SKILL_NAME}"

if [ -d "$SKILL_DIR" ]; then
  echo "[x] Error: Skill directory already exists: $SKILL_DIR"
  exit 1
fi

# Convert skill-name to Title Case
SKILL_TITLE=$(echo "$SKILL_NAME" | sed 's/-/ /g; s/\b\(.\)/\u\1/g')

mkdir -p "$SKILL_DIR/scripts" "$SKILL_DIR/references" "$SKILL_DIR/assets"

cat > "$SKILL_DIR/SKILL.md" << TEMPLATE
---
name: ${SKILL_NAME}
description: |
  TODO: What the skill does AND when to trigger it. Include specific scenarios, file types, or tasks.
---

# ${SKILL_TITLE}

TODO: Instructions for using this skill. Keep under 500 lines.

## Resources

- scripts/ — Executable code for deterministic operations
- references/ — Documentation loaded into context as needed
- assets/ — Files used in output (templates, images, etc.)

Delete any unneeded resource directories.
TEMPLATE

echo "[OK] Skill '${SKILL_NAME}' initialized at ${SKILL_DIR}"
echo ""
echo "Next steps:"
echo "1. Edit SKILL.md — complete the frontmatter description and add instructions"
echo "2. Add scripts, references, or assets as needed"
echo "3. Delete unneeded resource directories"
echo "4. Validate: bash .claude/skills/skill-creator/scripts/validate_skill.sh ${SKILL_DIR}"
