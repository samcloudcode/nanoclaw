# Workout Creation

**Load this file when:** Client asks for a workout or you need to create a plan for a specific training session.

**This file contains:**
- Workout design workflow
- How to extract program strategy into today's session
- Knowledge file integration
- Plan templates and examples

---

## Workout Design Workflow

When client asks for a workout:

**Fetch context first:**
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs overview
```
Then read program and relevant files:
```
Read fitness/program.md
Read fitness/knowledge.md  # for constraints
```
Check program/week are current (load PROGRAM.md or WEEK.md if stale).

**Extract program → today**: Use program's frameworks to design today's session. Load knowledge files if program mentions constraints.

**Propose → approve → save**: Present workout with rationale. **Only save after approval:**
```
Write fitness/plans/YYYY-MM-DD-{type}.md (with front matter)
```

**After completion**: Log what actually happened:
```
Write fitness/logs/YYYY-MM-DD-{type}.md (with front matter)
```

---

## Data Fetching Rules (Safety First)

**NEVER program a workout without reviewing saved context first.**

### ALWAYS Fetch Before Programming:
- Run query script overview (gets recent logs, current week, program summary)
- Read program.md (full strategy)
- Read knowledge.md (constraints, injuries)
- Read preferences.md if needed (equipment, timing)

### Only Fetch More If:
- User asks for specific analysis ("show me my bench progress over 3 months")
- Investigating patterns requiring deeper history

**Better to over-fetch than miss critical limitations. Injuries happen from incomplete context.**

---

## Creating Today's Plan from Program Strategy

### Extraction Process

**From program → today's plan:**
1. **Goals & exercises**: Which goal (p1/p2/p3), specific movements from program's architecture
2. **Loads & progression**: Last session + program's method → today's prescription
3. **Structure**: Warmup protocols, main work, accessories, cooldown
4. **Modifications**: Apply program's constraint handling (equipment, injuries, time)
5. **Rationale**: How this serves goals, fits phase, progresses from last session

**From recent logs → progression:**
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs logs --exercise squat --last 3
```
- Last similar session → progress appropriately (weight, reps, RPE)

### Execution Details for Great Plans

Plans should coach during the workout, not just list exercises:

**Strategic clarity:**
- Goal connection with current state
- Phase context ("Week 4 of 8 hypertrophy block")
- Specific progression from last session with numbers

**Tactical precision:**
- **Movement cues**: Form priorities from knowledge
- **Tempo**: Where relevant ("2sec eccentric, explode up")
- **RPE calibration**: What it means today
- **Rest activities**: Mobility/antagonist work
- **Contingencies**: Known issues ("knee pain → swap Bulgarian for goblet squat")

---

## Knowledge File Integration

**When program references constraints or protocols, load relevant knowledge files.**

**How to use knowledge files:**
1. Check user's `fitness/knowledge.md` first (their individual responses)
2. If program references domain-specific protocols → load relevant skill knowledge file
3. Extract mechanisms and principles
4. Apply to user's specific context

---

## Plan Template & Examples

### Example 1: Lower Strength

```markdown
---
date: 2026-02-22
type: lower
exercises: [squat, rdl, bulgarian, leg-curl, calf]
goal_ref: p1-squat-315
---

# Lower Session Plan

6am Home Gym (squat-315 p1).

**Warmup:** Knee protocol 10min (step-downs 2x15, terminal knee ext 2x20), goblet squats 2x10, hip 90/90 stretches.

**Main:** Back squat 5x5 @ 210 RPE 8 (last: 205x5 RPE 8, +5lb per program). Cues: chest up, knees track toes, 2sec eccentric, explode up. Hip 90/90 during 3min rest.

**Secondary:** RDL 4x8 @ 160 RPE 7 (stretch bottom, squeeze glutes). Band pull-aparts during rest.

**Accessories:** Bulgarian split 3x8/leg @ 35 (knee stability, control eccentric). Leg curl 3x12. Calf 3x15.

**Contingency:** Knee pain → swap Bulgarian for goblet squat.

**Why:** Week 4 of 8 hypertrophy block. Building squat-315 (currently 225x5). Last lower progressed clean, continue +5lb.
```

### Example 2: Interval Run

```markdown
---
date: 2026-02-23
type: intervals
exercises: [800m-repeats]
goal_ref: p1-sub-20-5k
---

# Interval Session Plan

6am Track (sub-20-5k p1).

**Warmup:** 10min easy, dynamic drills (leg swings, high knees, butt kicks).

**Main:** 6x800m @ 3:45/km (last: 5x800m @ 3:50/km RPE 8, +1 rep +pace). Target HR 175-180, RPE 8-9, 2min jog recovery. First 3 build rhythm, last 3 test fitness. If HR >185 or form breaks → extend recovery to 2:30.

**Cooldown:** 10min easy, walking.

**Why:** Week 5 of 12 VO2max block. Last week 5x800 felt controlled, ready for progression.
```

---

## Logging Completed Workouts

After the workout is done, log what actually happened.

```markdown
---
date: 2026-02-22
type: lower
duration: 62min
exercises: [squat, rdl, bulgarian, leg-curl, calf]
rpe_avg: 7.5
---

# Lower Session

Squat 4x10 @ 205 RPE 8, RDL 3x10 @ 155 RPE 7, Bulgarian 3x8/leg @ 30 RPE 8, leg curls 3x12, calf 3x15. Knee felt stable, no pain. Good pump.
```

**Content**: Session type, duration, actual exercises/sets/reps/loads/RPE, deviations from plan, how it felt.

**Workflow**:
- User provides completed info → Write log file immediately
- Build incrementally → Write same file with accumulated data

---

## Quick Reference

**Workflow**: Run query script → Read program/knowledge → Design from program → Propose → Approve → Write plan → Guide → Write log after completion

**Key reminders:**
- **Propose → approve → Write** (never save before approval, UNLESS user provides completed workout info to log)
- **Program has the strategy** - you apply it to today's context
- **Load knowledge files** for mechanisms when program references constraints
- **Safety first** - always fetch context before programming
- **Length** - 400-800 chars with warmup, main, accessories, cooldown, complete why
