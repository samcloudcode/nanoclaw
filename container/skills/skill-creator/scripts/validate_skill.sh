#!/usr/bin/env bash
# Validate a skill directory
# Usage: validate_skill.sh <path/to/skill-directory>

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: validate_skill.sh <path/to/skill-directory>"
  exit 1
fi

SKILL_DIR="$1"
ERRORS=0

# Check SKILL.md exists
if [ ! -f "$SKILL_DIR/SKILL.md" ]; then
  echo "[x] SKILL.md not found"
  exit 1
fi

CONTENT=$(cat "$SKILL_DIR/SKILL.md")

# Check frontmatter exists
if [[ ! "$CONTENT" == ---* ]]; then
  echo "[x] No YAML frontmatter found (must start with ---)"
  exit 1
fi

# Extract frontmatter
FRONTMATTER=$(echo "$CONTENT" | sed -n '/^---$/,/^---$/p' | sed '1d;$d')

# Check name field
NAME=$(echo "$FRONTMATTER" | grep -E '^name:' | sed 's/^name:\s*//' | tr -d ' ')
if [ -z "$NAME" ]; then
  echo "[x] Missing 'name' in frontmatter"
  ERRORS=$((ERRORS + 1))
elif ! echo "$NAME" | grep -qE '^[a-z0-9-]+$'; then
  echo "[x] Name '${NAME}' must be hyphen-case (lowercase letters, digits, hyphens only)"
  ERRORS=$((ERRORS + 1))
fi

# Check description field
DESC=$(echo "$FRONTMATTER" | grep -E '^description:' | sed 's/^description:\s*//')
if [ -z "$DESC" ]; then
  echo "[x] Missing 'description' in frontmatter"
  ERRORS=$((ERRORS + 1))
fi

# Check for TODO placeholders
if echo "$FRONTMATTER" | grep -qi 'TODO'; then
  echo "[!] Warning: frontmatter still contains TODO placeholders"
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
  echo "[x] Validation failed with ${ERRORS} error(s)"
  exit 1
fi

echo "[OK] Skill is valid!"
