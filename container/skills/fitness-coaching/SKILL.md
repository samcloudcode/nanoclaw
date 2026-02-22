---
name: fitness-coaching
description: Personal fitness coaching — plan workouts, log sessions, track progress, manage programs and training knowledge. Use when the user mentions exercise, training, workouts, gym, running, mobility, fitness goals, or asks what to train today. Provides MCP-free data persistence via markdown files with YAML front matter.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node:*)
---

# Fitness Coaching

**What This Skill Does:**
- Manages fitness data (programs, workouts, knowledge, metrics) via markdown files
- Provides a query script for context loading and progress tracking
- Tracks 4-level hierarchy: Goals (LifeOS) → Program → Week → Plan
- Integrates with LifeOS for goal management (Energy life area)

**This file contains:**
- File layout and data model
- When to save vs propose (critical rules)
- Operations reference (read, write, query)
- Bootstrap procedure

**For creating programs and workouts, load:**
- **PROGRAM.md** - Creating overall training program strategy
- **WEEK.md** - Planning weekly training schedule
- **WORKOUT.md** - Creating individual workouts and plans
- **COACHING.md** - Real-time workout coaching and execution (when client is actively training)
- **knowledge/*.md** - Domain-specific expertise (knee health, exercise selection, etc.)

---

## System Overview

**Data directory:** `/workspace/extra/vault/health/fitness/` (Obsidian vault — files appear in Obsidian instantly)

All paths below are relative to this directory. Use the full path when calling Read/Write tools.

**Core Approach**: Track fitness data at 4 hierarchical planning levels:
1. **Goals** - Long-term targets in LifeOS (Energy life area via `/lifeos-db` skill)
2. **Program** - Overall strategy (`fitness/program.md`)
3. **Week** - This week's schedule (`fitness/weeks/YYYY-week-NN.md`)
4. **Plan** - Today's workout (`fitness/plans/YYYY-MM-DD-type.md`)

**Plus supporting data:**
- **Logs** - Completed workout records (`fitness/logs/YYYY-MM-DD-type.md`)
- **Metrics** - Point-in-time measurements (`fitness/metrics.md`)
- **Knowledge** - User-specific observations (`fitness/knowledge.md`)
- **Preferences** - Equipment, timing, style (`fitness/preferences.md`)

---

## Critical Rules: When to Save vs Propose

**ALWAYS act on these principles:**

1. **Extract & Save New Information IMMEDIATELY**: During ANY conversation, if user mentions new preferences, completed workouts, injuries, equipment changes, activity preferences, or constraints → save to the appropriate file right away
2. **Load Correct Instructions First**: Before creating programs/weeks/workouts → load appropriate .md file (PROGRAM.md/WEEK.md/WORKOUT.md) for detailed workflows
3. **Propose Before Saving Your Ideas**: When YOU suggest a workout/plan → propose first, save only after client agrees
4. **Keep Data Current**: Review program freshness at session start - update if stale (3+ months) or strategy changed

**The pattern:** Client provides = save now. You suggest = propose first, then save.

### Extract & Save Pattern

**During conversations, actively listen for and save:**

**New goals mentioned:**
```
User: "I want to bench 225 by June"
→ Create in LifeOS via /lifeos-db skill (Energy life area, goal_type='standard')
→ Also note in fitness/knowledge.md if it affects programming
```

**Activity preferences:**
```
User: "I do yoga every Sunday morning at 9am with my partner"
→ Read fitness/preferences.md, add the new preference, Write the complete updated file
```

**Completed workouts:**
```
User: "I just did squats 5x5 at 265, felt great"
→ Write fitness/logs/2026-02-22-lower.md with front matter and content
```

**Injuries/limitations:**
```
User: "My right shoulder clicks when I press overhead"
→ Read fitness/knowledge.md, add the new observation, Write the complete updated file
```

**Preferences/constraints:**
```
User: "I prefer morning workouts around 6am, and I can do 60 minutes max"
→ Read fitness/preferences.md, add/update, Write the complete file
```

**Then continue conversation** - the key is **capture data FIRST**, use later.

---

## File Layout

All fitness data lives in `/workspace/extra/vault/health/fitness/`:

```
fitness/
├── program.md              # Current training program (living document)
├── knowledge.md            # User-specific observations (injuries, cues, patterns)
├── preferences.md          # Equipment, timing, style, activities
├── metrics.md              # Append-only: timestamped measurements
├── weeks/
│   └── 2026-week-08.md     # One file per week plan
├── plans/
│   └── 2026-02-22-upper.md # One file per session plan
└── logs/
    └── 2026-02-22-upper.md # One file per workout log
```

### Single Files (Read whole file, Write whole file)

These files are read every session for context and updated by reading the current content, modifying it, then writing the complete updated file:

- **program.md** — Current training strategy. Single living document, rewritten when strategy changes.
- **knowledge.md** — User-specific observations organized by topic (injuries, cues, recovery patterns). NOT general fitness knowledge (that's in the skill's knowledge/ files).
- **preferences.md** — Equipment, schedule, activities, style preferences.
- **metrics.md** — Append-only. Each entry on its own line with date prefix.

### Individual Dated Files (Write per file)

These use YAML front matter for queryability:

- **logs/YYYY-MM-DD-type.md** — Completed workout records
- **plans/YYYY-MM-DD-type.md** — Planned workout sessions
- **weeks/YYYY-week-NN.md** — Weekly training schedules

---

## Front Matter Format

All dated files use YAML front matter for the query script:

### Log file example
```markdown
---
date: 2026-02-22
type: upper
duration: 75min
exercises: [bench, ohp, rows, face-pulls]
rpe_avg: 7.5
---

# Upper Session

Bench 5x5 @ 185 RPE 7 — chest up, leg drive, bar path clean.
OHP 3x12 @ 115 RPE 8 — landmine variation per shoulder constraint.
Rows 4x8 @ 135 RPE 7. Face pulls 3x20.

Felt strong, good session. Shoulder stable.
```

### Plan file example
```markdown
---
date: 2026-02-23
type: lower
exercises: [squat, rdl, bulgarian, leg-curl]
goal_ref: p1-squat-315
---

# Lower Session Plan

6am Home Gym. Warmup: knee protocol 10min, goblet squats 2x10.
Main: Squat 5x5 @ 210 (last: 205x5 RPE 8, +5lb per program).
RDL 4x8 @ 160. Bulgarian split 3x8/leg @ 35.
Leg curl 3x12, calf 3x15.
```

### Week file example
```markdown
---
week: 2026-week-08
phase: strength-block-week-4
deload: false
---

# Week 08

Mon: Upper @ Office 6am — bench 5x5 focus.
Tue: Lower @ Home 6am — squat 4x5, RDL 3x8.
Wed: Easy run 6:30am Z2 30min.
Thu: Upper @ Office 6am — OHP focus, pull-ups.
Fri: Lower @ Home 6am — deadlift focus.
Sat: Tempo run 7am.
Sun: Yoga 9am with partner.

Week goal: Complete Week 4 at prescribed loads.
```

---

## Operations Reference

### Loading Context (Start of Session)

**Quick context scan:**
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs overview
```
Returns: program summary, current week, recent logs (7), upcoming plans, recent metrics.

**Then read specific files as needed:**
- Planning a workout → Read `fitness/program.md`, `fitness/knowledge.md`
- Reviewing constraints → Read `fitness/preferences.md`, `fitness/knowledge.md`
- Full history → Use query script with filters

### Writing Data

**Single files (program, knowledge, preferences):**
1. Read the current file
2. Incorporate the new information
3. Write the complete updated file

```
→ Read fitness/knowledge.md
→ (Add new section about shoulder clicking)
→ Write fitness/knowledge.md (complete file with new section added)
```

**Dated files (logs, plans, weeks):**
Write a new file directly:
```
→ Write fitness/logs/2026-02-22-upper.md (with front matter)
```

**Metrics (append):**
Read metrics.md, append new line, Write complete file:
```
2026-02-22 | weight | 73.5kg
2026-02-22 | sleep | 7.5hrs
```

**Incremental workout updates (same session):**
Write the same file again with accumulated data:
```
User: "Just did squats 5x5 at 225"
→ Write fitness/logs/2026-02-22-lower.md (squats only)

User: "Also did RDL 3x8 at 185"
→ Write fitness/logs/2026-02-22-lower.md (squats + RDL)
```

### Querying Data

```bash
# Recent logs
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs logs --last 10

# Exercise-specific history
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs logs --exercise bench

# Date-filtered
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs logs --since 2026-01-01

# Exercise progression
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs progress --exercise squat

# All metrics
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs metrics
```

### Archiving

Move content to an `## Archived` section at the bottom of the file. For dated files, simply leave them — old logs/plans don't need archiving.

---

## Goals Integration with LifeOS

Fitness goals live in LifeOS as goals tagged with the **Energy** life area. Use the `/lifeos-db` skill to create/query/update fitness goals.

**Creating a fitness goal:**
Use lifeos-db to INSERT INTO goal with life_area tag = 'Energy'.

**Referencing goals in fitness files:**
Use the goal title as a reference in program.md, plans, and logs (e.g., "squat-315 p1" or "sub-20-5k p2").

---

## Naming Conventions

**File names:**
- Logs/plans: `YYYY-MM-DD-{type}.md` → `2026-02-22-upper.md`, `2026-02-22-intervals.md`
- Weeks: `YYYY-week-NN.md` → `2026-week-08.md`
- Type labels: `upper`, `lower`, `full-body`, `intervals`, `tempo`, `easy-run`, `long-run`, `yoga`, `climbing`, `mtb`

**Front matter exercises:** kebab-case array → `[bench, ohp, squat, rdl, pull-ups]`

**Content guidelines:**
- Be concise, include "why" for decisions
- Logs: actual sets/reps/load/RPE + how it felt
- Plans: prescribed sets/reps/load + cues + contingencies
- Knowledge: user-specific observations only (NOT general fitness knowledge)

---

## Knowledge Storage: User-Specific Only

**Store USER-SPECIFIC observations, not general fitness knowledge.**

General exercise science lives in the skill's `knowledge/*.md` files. `fitness/knowledge.md` is for the user's unique situation.

**DO store:**
- "Right shoulder clicks at 90° — avoid dips, behind-neck press"
- "Wider squat stance eliminated knee pain (Sept 2024)"
- "Need 72hr between heavy lower days or back tightens"
- "152bpm lactate threshold tested March 2025"

**DON'T store:**
- "Progressive overload is important" (general principle)
- "Squats are a compound movement" (general knowledge)

---

## Bootstrap (First Use)

If `/workspace/extra/vault/health/fitness/` doesn't exist, create the directory structure:

```
mkdir -p fitness/logs fitness/plans fitness/weeks
```

Then create empty starter files:

**fitness/program.md:**
```markdown
# Training Program

No program set yet. Tell me about your goals, schedule, and equipment to get started.
```

**fitness/knowledge.md:**
```markdown
# Training Knowledge

User-specific observations, injury history, and what works.
```

**fitness/preferences.md:**
```markdown
# Training Preferences

Equipment, schedule, activities, and style preferences.
```

**fitness/metrics.md:**
```markdown
# Metrics

Date | Metric | Value
```

---

## Load Files Based on Task

| Task | Load |
|------|------|
| Creating overall training program | PROGRAM.md |
| Planning weekly schedule | WEEK.md |
| Creating individual workout | WORKOUT.md |
| Client actively doing workout | COACHING.md |
| Domain-specific questions | knowledge/*.md as needed |
| Simple data entry (logging, saving info) | This file only |

---

## Quick Reference

```
ANY user mention of new info → Extract & save immediately (preferences, activities, injuries, equipment)
User shares completed workout → Write log file immediately
User asks question → Run query script → Read relevant files → Load knowledge/*.md if needed → Answer
User wants program → Run overview → Read program/preferences/knowledge → Load PROGRAM.md → Design → Propose → Save
User wants weekly plan → Run overview → Read program → Load WEEK.md → Design → Propose → Save
User wants workout → Run overview → Load WORKOUT.md → Design → Propose → Save
User is training now → Load COACHING.md → Guide → Log incrementally
Plans need adjustment → Update immediately when agreed
Old data no longer relevant → Move to Archived section
```

**Critical Pattern:**
1. **Listen & Extract**: Actively listen for new preferences, activities, equipment, injuries, constraints
2. **Save Immediately**: Write to appropriate file right away (read file → add info → write complete file)
3. **Use Later**: Query script and file reads will return all saved data when planning

**Remember:**
- Extract & save ANY new info user mentions (don't wait, don't ask for confirmation)
- Same dated file = update (write replaces the file)
- Single files (knowledge, preferences, program) = read, modify, write complete file
- Your ideas = propose first, save after approval
- User's info = save immediately
- Goals live in LifeOS (Energy life area)
