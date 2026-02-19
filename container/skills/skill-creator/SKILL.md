---
name: skill-creator
description: Create or update skills that extend agent capabilities with specialized knowledge, workflows, or tool integrations. Use when asked to create a new skill, build a skill, make a skill, or update an existing skill.
---

# Skill Creator

Create skills following the Anthropic standard. Skills are modular packages with a SKILL.md and optional bundled resources (scripts, references, assets).

## Skill Anatomy

```
skill-name/
├── SKILL.md          (required - YAML frontmatter + markdown instructions)
├── scripts/          (optional - executable code)
├── references/       (optional - docs loaded into context as needed)
└── assets/           (optional - files used in output, not loaded into context)
```

### SKILL.md Frontmatter (required)

```yaml
---
name: skill-name
description: What the skill does AND when to trigger it. This is the primary triggering mechanism — include all "when to use" info here, not in the body.
---
```

- `name`: hyphen-case, lowercase, max 64 chars
- `description`: max 1024 chars, no angle brackets. Be comprehensive about triggers.

### Body

Instructions for using the skill. Keep under 500 lines. Use imperative form.

## Core Principles

1. **Concise is key** — Claude is already smart. Only add context it doesn't have. Prefer examples over explanations.
2. **Progressive disclosure** — Keep SKILL.md lean. Move detailed reference material to `references/` files and link from SKILL.md.
3. **Match freedom to fragility** — Strict scripts for fragile operations, flexible guidance for open-ended tasks.
4. **No auxiliary files** — No README.md, CHANGELOG.md, etc. Only files the agent needs.

## Design Patterns

- **Multi-step processes**: See [references/workflows.md](references/workflows.md)
- **Output format/quality standards**: See [references/output-patterns.md](references/output-patterns.md)

## Creation Process

### 1. Understand the skill

Ask what functionality to support, get concrete usage examples, identify triggers.

### 2. Plan contents

For each example, identify what reusable scripts, references, or assets would help.

### 3. Initialize

```bash
bash .claude/skills/skill-creator/scripts/init_skill.sh <skill-name> --path .claude/skills
```

This creates the directory with SKILL.md template and example resource directories.

### 4. Edit

- Implement scripts, references, assets identified in step 2
- Delete unneeded example files from init
- Write SKILL.md with comprehensive frontmatter description and concise body
- Test any scripts by running them

### 5. Validate

```bash
bash .claude/skills/skill-creator/scripts/validate_skill.sh .claude/skills/<skill-name>
```

### 6. Iterate

Use the skill on real tasks, notice struggles, update accordingly.

## Removing a Skill

Delete the skill directory to remove it:

```bash
rm -rf .claude/skills/<skill-name>
```

The skill will no longer be available in future sessions. Active sessions retain skills already loaded into context.
