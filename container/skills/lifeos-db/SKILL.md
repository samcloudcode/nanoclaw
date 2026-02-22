---
name: lifeos-db
description: Query and manage the user's Life OS database — goals, actions, decisions, thoughts, and plans. Use when the user asks about their goals, tasks, priorities, what to focus on, weekly plan, or wants to create/update items in their life management system. Also use for casual requests like "what should I work on" or "how's my progress".
allowed-tools: Bash(psql:*)
---

# Life OS Database

Access the user's personal life management database (PostgreSQL/Supabase).

**User ID:** `$USER_ID`

**Connection:** `psql "$DATABASE_URL" -t -c "SQL"` — always use `-t` for clean output without headers/borders.

For multi-line queries use `<<"SQL"` heredoc (unquoted so `$USER_ID` expands).

## First Use: Load Context

On your first database interaction in a session, run this to understand the user's current setup:

```sql
-- All available tags (system + user labels)
SELECT tag_type, value, is_system, id FROM lifeos_tag
WHERE (user_id = '$USER_ID' OR user_id IS NULL)
ORDER BY tag_type, value;

-- All active goals (for linking actions)
SELECT id, title, priority, goal_type, parent_goal_id FROM goal
WHERE user_id = '$USER_ID' AND status = 'active' AND deleted_at IS NULL
ORDER BY priority DESC;
```

Cache these results mentally — use them for tagging and linking throughout the session.

## Tagging System

Every action and goal uses tags via `entity_tag` → `lifeos_tag`. There are three tag types:

### Life Area (REQUIRED — exactly one per action/goal)

| Value | Description |
|-------|-------------|
| Love | Relationships, family, friends, home |
| Energy | Health, fitness, vitality, well-being |
| Work | Career, projects, productivity, admin, finance |

### Context (REQUIRED for actions — describes the medium/environment)

| Value | When to use |
|-------|-------------|
| development | Coding, building software |
| web | Browser-based tasks, web apps |
| whatsapp | Messages, calls via WhatsApp |
| admin | Administrative tasks, paperwork |
| research | Investigating, reading, learning |
| writing | Content creation, documentation |
| meeting | Calls, in-person meetings |
| review | Reviewing work, feedback |
| email | Email-related tasks |
| call | Phone calls |
| errand | Physical errands |
| buy | Purchasing items |
| gym | Exercise at the gym |
| teams | Microsoft Teams tasks |

### Labels (user-created, optional)

Discover available labels:

```sql
SELECT id, value FROM lifeos_tag
WHERE user_id = '$USER_ID' AND tag_type = 'label' AND is_system = FALSE;
```

### Focus (optional — type of cognitive work)

admin, creative, dev, devops, learning, ops, planning, writing

### Tagging an entity

```sql
-- Find tag ID and apply it
INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
SELECT '$USER_ID', id, 'action', 'ENTITY_UUID'
FROM lifeos_tag WHERE (user_id = '$USER_ID' OR user_id IS NULL) AND value = 'TAG_VALUE' AND is_system = TRUE;

-- For user labels (is_system = FALSE) — query available labels first
INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
SELECT '$USER_ID', id, 'action', 'ENTITY_UUID'
FROM lifeos_tag WHERE user_id = '$USER_ID' AND value = 'LABEL_VALUE' AND is_system = FALSE;
```

## Relationships (entity_link)

Actions link to goals via `entity_link`. The only relation type currently in use:

| source_type | relation_type | target_type | Meaning |
|-------------|--------------|-------------|---------|
| action | supports | goal | Action contributes to achieving this goal |

```sql
INSERT INTO entity_link (user_id, source_type, source_id, relation_type, target_type, target_id)
VALUES ('$USER_ID', 'action', 'ACTION_UUID', 'supports', 'goal', 'GOAL_UUID');
```

**Always link actions to a goal** — find the most relevant goal first, then link.

## People (person table)

| Column | Type | Description |
|--------|------|-------------|
| name | text | Person's name |
| relationship | text | Relationship description |
| notes | text | Notes about the person |

## Statuses

- **Actions:** active, waiting, backburner, done, archived
- **Goals:** active, paused, achieved, abandoned
- **Decisions:** open, decided, dropped, waiting
- **Thoughts:** inbox, done, discarded

## Goal Hierarchy

Goals form a tree via `parent_goal_id`:

**MTP** (`goal_type='mtp'`, no deadline) → **HHG** (1-5yr) → **Annual** → **Quarterly** → **Monthly** → **Weekly**

Actions are leaf-level "Clear Goals" — linked via `entity_link` with `relation_type='supports'`.

### Query Goal Tree

```sql
WITH RECURSIVE goal_tree AS (
  SELECT id, title, priority, goal_type, parent_goal_id, 0 AS depth
  FROM goal
  WHERE user_id = '$USER_ID' AND parent_goal_id IS NULL
    AND status = 'active' AND deleted_at IS NULL
  UNION ALL
  SELECT g.id, g.title, g.priority, g.goal_type, g.parent_goal_id, gt.depth + 1
  FROM goal g
  JOIN goal_tree gt ON g.parent_goal_id = gt.id
  WHERE g.status = 'active' AND g.deleted_at IS NULL
)
SELECT repeat('  ', depth) || title AS goal, priority, goal_type
FROM goal_tree ORDER BY depth, priority DESC;
```

## Common Queries

### Find a Goal by Name

```sql
SELECT id, title, priority, goal_type FROM goal
WHERE user_id = '$USER_ID' AND title ILIKE '%search term%'
  AND status = 'active' AND deleted_at IS NULL;
```

### Active Goals

```sql
SELECT id, title, priority, goal_type, target_completion FROM goal
WHERE user_id = '$USER_ID' AND status = 'active' AND deleted_at IS NULL
ORDER BY priority DESC, target_completion;
```

### Active Actions (with tags and goal links)

```sql
SELECT a.id, a.title, a.importance, a.urgency, a.effort_estimate, a.energy_level,
  string_agg(DISTINCT lt.value || ' (' || lt.tag_type || ')', ', ') as tags,
  string_agg(DISTINCT g.title, ', ') as goals
FROM action a
LEFT JOIN entity_tag et ON a.id::text = et.entity_id::text AND et.entity_type = 'action' AND et.deleted_at IS NULL
LEFT JOIN lifeos_tag lt ON et.tag_id = lt.id
LEFT JOIN entity_link el ON a.id::text = el.source_id::text AND el.source_type = 'action' AND el.deleted_at IS NULL
LEFT JOIN goal g ON el.target_id::text = g.id::text AND el.target_type = 'goal'
WHERE a.user_id = '$USER_ID' AND a.status = 'active' AND a.deleted_at IS NULL
GROUP BY a.id ORDER BY a.position;
```

### Today's Actions

```sql
SELECT id, title, importance, urgency, effort_estimate FROM action
WHERE user_id = '$USER_ID' AND due_at::date = CURRENT_DATE
  AND status = 'active' AND deleted_at IS NULL
ORDER BY position;
```

### This Week's Plan (Goal Stack)

```sql
SELECT pe.role, COALESCE(g.title, a.title) AS item, pe.notes
FROM plan_entry pe
JOIN plan p ON pe.plan_id = p.id AND pe.user_id = p.user_id
LEFT JOIN goal g ON pe.goal_id = g.id
LEFT JOIN action a ON pe.action_id = a.id
WHERE p.user_id = '$USER_ID' AND p.scope = 'week'
  AND p.start_date = date_trunc('week', CURRENT_DATE)::date
  AND p.deleted_at IS NULL AND pe.deleted_at IS NULL
ORDER BY pe.role, pe.sort_key;
```

Roles: `focus_goal`, `supporting_goal` (goal_id), `weekly_move`, `keep_alive` (action_id).

### Today's Plan

```sql
SELECT pe.role, COALESCE(g.title, a.title) AS item, pe.notes
FROM plan_entry pe
JOIN plan p ON pe.plan_id = p.id AND pe.user_id = p.user_id
LEFT JOIN goal g ON pe.goal_id = g.id
LEFT JOIN action a ON pe.action_id = a.id
WHERE p.user_id = '$USER_ID' AND p.scope = 'day' AND p.start_date = CURRENT_DATE
  AND p.deleted_at IS NULL AND pe.deleted_at IS NULL
ORDER BY pe.sort_key;
```

### Actions for a Goal (Including Child Goals)

```sql
WITH RECURSIVE goal_tree AS (
  SELECT id FROM goal WHERE id = '[GOAL-UUID]' AND deleted_at IS NULL
  UNION ALL
  SELECT g.id FROM goal g JOIN goal_tree gt ON g.parent_goal_id = gt.id WHERE g.deleted_at IS NULL
)
SELECT a.title, a.status, a.importance, a.urgency
FROM action a
JOIN entity_link el ON a.id = el.source_id AND el.source_type = 'action'
JOIN goal_tree gt ON el.target_id = gt.id
WHERE el.target_type = 'goal' AND el.relation_type = 'supports'
  AND a.user_id = '$USER_ID' AND a.deleted_at IS NULL AND el.deleted_at IS NULL
ORDER BY a.position;
```

### Actions by Life Area

```sql
SELECT a.title, a.importance, a.urgency, a.effort_estimate
FROM action a
JOIN entity_tag et ON a.id = et.entity_id AND et.entity_type = 'action'
JOIN lifeos_tag lt ON et.tag_id = lt.id
WHERE lt.value = 'Energy' AND lt.is_system = TRUE
  AND a.user_id = '$USER_ID' AND a.deleted_at IS NULL AND et.deleted_at IS NULL
ORDER BY a.position;
```

### Recent Thoughts (Inbox)

```sql
SELECT id, content, context, captured_at FROM thought
WHERE user_id = '$USER_ID' AND status = 'inbox' AND deleted_at IS NULL
ORDER BY captured_at DESC;
```

### Open Decisions

```sql
SELECT id, title, importance, urgency, due_at FROM decision
WHERE user_id = '$USER_ID' AND status = 'open' AND deleted_at IS NULL
ORDER BY COALESCE(importance, 0) DESC;
```

## AI Metadata Guide

When creating or updating actions, apply these scoring rubrics to match the system's AI metadata standards.

### Importance (1-5) — Strategic value and goal alignment

| Score | Meaning | Example |
|-------|---------|---------|
| 1 | Trivial, could skip entirely | Bookmark a link |
| 2 | Nice to have, low impact | Tidy desk |
| 3 | Should do, moderate value (default) | Reply to routine message |
| 4 | Important, supports key goals | Review Q4 budget proposal |
| 5 | Critical, high-impact on major goals | Ship product launch |

- If linked to a high-priority goal (4-5), increase importance accordingly.
- Most actions are 3. Reserve 4-5 for truly critical items.

### Urgency (1-5) — Time sensitivity

| Score | Meaning |
|-------|---------|
| 1 | No rush, whenever |
| 2 | This week is fine |
| 3 | Soon, within a few days (default) |
| 4 | Today/tomorrow |
| 5 | Immediate, blocking others |

- If has a near due date, increase urgency.
- Habits/recurring tasks are usually steady urgency (2-3).

### Effort Estimate (minutes) — Realistic completion time

| Minutes | Type |
|---------|------|
| 5 | Trivial (quick message, file, note) |
| 15 | Quick task |
| 30 | Moderate task |
| 60 | Substantial work |
| 120+ | Major effort, multi-step |

Range: 1-480 minutes. Be realistic — most single tasks are 15-60 min.

### Energy Level — Required mental state

| Level | When to use |
|-------|-------------|
| low | Routine/mechanical, can do when tired |
| medium | Needs some focus and attention |
| high | Requires creativity, deep focus, or decision-making |

### Life Area Decision Rules

| Area | Covers | Examples |
|------|--------|----------|
| Work | Professional tasks, career, projects, admin, home maintenance, errands, finances, planning | Meetings, code reviews, emails, chores, bills, scheduling, purchases |
| Energy | Health, fitness, rest, recovery, self-care, medical, sleep, nutrition | Exercise, doctor appointments, meal prep, meditation |
| Love | Relationships, family, social connections, community | Calls with friends, family dinners, date nights, gifts |

- Involves another person primarily for relationship reasons → Love
- About physical/mental wellbeing → Energy
- Productive output, logistics, or maintenance → Work
- When in doubt between Work and another area, prefer the more specific area

### Context Decision Rules (priority order)

1. Explicitly names a channel ("email X", "call Y", "teams message") → use that channel
2. Contacting, messaging, texting, reaching out to, following up with a person → **whatsapp** (default communication)
3. "Send", "tell", "ask", "let X know", "check with", "remind" someone → **whatsapp**
4. Coding/fixing bugs/implementing/deploying → **development**
5. "Buy", "order", "purchase" → **buy**
6. "Schedule", "file", "submit form", "organize" → **admin**
7. "Research", "look into", "find out", "compare" → **research**
8. "Write", "draft", "document" → **writing**
9. "Pick up", "go to", "drop off" → **errand**
10. Online tasks (sign up, configure, update settings) → **web**

### Goal Matching

- Always link to the most specific (leaf) goal, not broad parent goals
- Consider keyword/concept overlap between action and goal titles
- Don't link if: no clear match, multiple goals match equally, or it's a generic maintenance task ("check email", "buy groceries")

### Title Quality

Make titles clear, actionable, starting with a verb:
- Bad: "Budget" → Good: "Review and approve Q4 budget"
- Bad: "Dentist" → Good: "Schedule dentist appointment"

## Creating Data

**A well-formed action has:** life area tag + context tag + goal link + all metadata fields. Always create with all of these.

**IMPORTANT:** Every action MUST have both a life_area tag AND a context tag. Actions missing context tags are incomplete. Use the Context Decision Rules above to pick the right context.

### Quick Action

```sql
INSERT INTO action (user_id, title, description, status, action_type, importance, urgency, effort_estimate, energy_level, position)
VALUES (
  '$USER_ID', 'Task title', 'Brief context',
  'active', 'task', 3, 3, 15, 'medium',
  (SELECT COALESCE(MAX(position), 0) + 1 FROM action WHERE user_id = '$USER_ID' AND deleted_at IS NULL)
) RETURNING id;
```

Then tag and link using the returned ID (ALL THREE are expected):

```sql
-- 1. Life area tag (REQUIRED)
INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
SELECT '$USER_ID', id, 'action', 'ACTION_UUID'
FROM lifeos_tag WHERE (user_id = '$USER_ID' OR user_id IS NULL) AND value = 'Work' AND is_system = TRUE;

-- 2. Context tag (REQUIRED — pick the best match from the context list above)
INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
SELECT '$USER_ID', id, 'action', 'ACTION_UUID'
FROM lifeos_tag WHERE (user_id = '$USER_ID' OR user_id IS NULL) AND value = 'development' AND is_system = TRUE;

-- 3. Link to goal (find the most relevant goal first)
INSERT INTO entity_link (user_id, source_type, source_id, relation_type, target_type, target_id)
VALUES ('$USER_ID', 'action', 'ACTION_UUID', 'supports', 'goal', 'GOAL_UUID');
```

### Full Action (Single Transaction)

```sql
WITH new_action AS (
  INSERT INTO action (user_id, title, description, status, action_type, importance, urgency, effort_estimate, energy_level, position)
  VALUES (
    '$USER_ID', 'ACTION_TITLE', 'DESCRIPTION',
    'active', 'task', 4, 3, 30, 'medium',
    (SELECT COALESCE(MAX(position), 0) + 1 FROM action WHERE user_id = '$USER_ID' AND deleted_at IS NULL)
  ) RETURNING id
),
tag_life_area AS (
  INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
  SELECT '$USER_ID', lt.id, 'action', na.id
  FROM new_action na, lifeos_tag lt
  WHERE (lt.user_id = '$USER_ID' OR lt.user_id IS NULL) AND lt.value = 'LIFE_AREA' AND lt.is_system = TRUE
),
tag_context AS (
  INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
  SELECT '$USER_ID', lt.id, 'action', na.id
  FROM new_action na, lifeos_tag lt
  WHERE (lt.user_id = '$USER_ID' OR lt.user_id IS NULL) AND lt.value = 'CONTEXT' AND lt.is_system = TRUE
),
link_goal AS (
  INSERT INTO entity_link (user_id, source_type, source_id, relation_type, target_type, target_id)
  SELECT '$USER_ID', 'action', na.id, 'supports', 'goal', 'GOAL_UUID'::uuid
  FROM new_action na
)
SELECT id FROM new_action;
```

### Create a Goal

```sql
INSERT INTO goal (id, user_id, title, description, status, priority, goal_type, target_completion, parent_goal_id)
VALUES (
  gen_random_uuid(), '$USER_ID',
  'GOAL_TITLE', 'What success looks like',
  'active', 4, 'standard',
  (CURRENT_DATE + INTERVAL '3 months')::date,
  NULL  -- or PARENT_GOAL_UUID
) RETURNING id;

-- Then tag with life area
INSERT INTO entity_tag (user_id, tag_id, entity_type, entity_id)
SELECT '$USER_ID', id, 'goal', 'GOAL_UUID'
FROM lifeos_tag WHERE (user_id = '$USER_ID' OR user_id IS NULL) AND value = 'Work' AND is_system = TRUE;
```

Goal types: `standard` (date-based), `mtp` (vision/purpose), `habit` (ongoing).

### Capture a Thought

```sql
INSERT INTO thought (user_id, content, context, status)
VALUES ('$USER_ID', 'Thought content', 'context', 'inbox')
RETURNING id;
```

### Create a Time Slot (Event / Block)

```sql
INSERT INTO time_slot (user_id, title, slot_type, starts_at, ends_at, duration_minutes, linked_action_id, color)
VALUES (
  '$USER_ID', 'Meeting with John', 'event',
  '2026-02-21 14:00:00+00', '2026-02-21 15:00:00+00', 60,
  NULL, '#4f46e5'
) RETURNING id;
```

- `slot_type`: `block` (focus time, work block) or `event` (meeting, appointment)
- `linked_action_id`: optionally link to an action
- `filter_preset_id`: optionally link to a filter preset (for themed blocks)
- `color`: hex color for display
- `is_template`: set `true` for recurring templates
- `recurrence_rule`: iCal RRULE format for recurring slots

### Query Today's Schedule

```sql
SELECT title, slot_type, starts_at, ends_at, duration_minutes, color
FROM time_slot
WHERE user_id = '$USER_ID' AND starts_at::date = CURRENT_DATE
  AND deleted_at IS NULL AND is_template = false
ORDER BY starts_at;
```

### Schedule an Action into a Time Slot

```sql
INSERT INTO time_slot (user_id, title, slot_type, starts_at, ends_at, duration_minutes, linked_action_id)
SELECT '$USER_ID', a.title, 'block',
  '2026-02-21 14:00:00+00', '2026-02-21 15:00:00+00', 60,
  a.id
FROM action a WHERE a.id = 'ACTION_UUID' AND a.user_id = '$USER_ID';
```

## Snoozing Actions

Snooze hides an action until a future time using the `show_after` column. The action stays `active` but won't appear in filtered views until the time passes.

```sql
-- Snooze until tomorrow 9am
UPDATE action SET show_after = (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '9 hours')::timestamptz
WHERE id = 'UUID' AND user_id = '$USER_ID';

-- Snooze until next Monday 9am
UPDATE action SET show_after = (date_trunc('week', CURRENT_DATE) + INTERVAL '7 days' + INTERVAL '9 hours')::timestamptz
WHERE id = 'UUID' AND user_id = '$USER_ID';

-- Snooze for 3 hours
UPDATE action SET show_after = NOW() + INTERVAL '3 hours'
WHERE id = 'UUID' AND user_id = '$USER_ID';

-- Unsnooze (show immediately)
UPDATE action SET show_after = NULL
WHERE id = 'UUID' AND user_id = '$USER_ID';
```

When querying active actions, exclude snoozed ones:

```sql
SELECT id, title FROM action
WHERE user_id = '$USER_ID' AND status = 'active' AND deleted_at IS NULL
  AND (show_after IS NULL OR show_after <= NOW())
ORDER BY position;
```

## Updating Data

```sql
-- Complete an action
UPDATE action SET status = 'done' WHERE id = 'UUID' AND user_id = '$USER_ID';

-- Update importance/urgency
UPDATE action SET importance = 5, urgency = 4 WHERE id = 'UUID' AND user_id = '$USER_ID';

-- Soft delete (NEVER hard delete)
UPDATE action SET deleted_at = NOW() WHERE id = 'UUID' AND user_id = '$USER_ID';

-- Achieve a goal
UPDATE goal SET status = 'achieved' WHERE id = 'UUID' AND user_id = '$USER_ID';
```

## Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `action` | Tasks and todos | title, status, action_type, importance, urgency, effort_estimate, energy_level, due_at, show_after, position |
| `goal` | Objectives | title, status, priority, goal_type, target_completion, parent_goal_id |
| `person` | People | name, relationship, notes |
| `plan` | Planning periods | scope (day/week/month/quarter/year), start_date, focus_text |
| `plan_entry` | Goal Stack items | plan_id, role, goal_id or action_id, sort_key, notes |
| `entity_link` | Relationships | source_type, source_id, relation_type, target_type, target_id |
| `entity_tag` | Tagging | tag_id, entity_type, entity_id |
| `lifeos_tag` | Tag definitions | tag_type (life_area/context/focus/label), value, is_system |
| `decision` | Decision log | title, status, importance, urgency, outcome_summary, rationale |
| `thought` | Quick capture | content, context, status, goal_id |
| `time_slot` | Calendar blocks/events | title, slot_type (block/event), starts_at, ends_at, linked_action_id, color |

## Important Patterns

- **Always filter**: `WHERE user_id = '$USER_ID' AND deleted_at IS NULL`
- **Soft deletes only**: `SET deleted_at = NOW()`, never hard delete
- **Fractional positioning**: Insert uses `MAX(position) + 1`, reorder uses `(prev + next) / 2`
- **`updated_at` is automatic** — never set manually
- **Use `-t` flag** with psql for clean output without headers
- **Well-formed actions need**: life area tag + context tag + goal link + all metadata (action_type, importance, urgency, effort_estimate, energy_level)
- **System tags**: use `(user_id = '$USER_ID' OR user_id IS NULL) AND is_system = TRUE`
- **User labels**: use `user_id = '$USER_ID' AND is_system = FALSE`
- **NEVER INSERT INTO lifeos_tag** — all tags already exist. Only INSERT INTO `entity_tag` to link existing tags to entities.
