# Week Planning

**Load this file when:** Creating or updating weekly training schedule, client asks "what's coming up?", or adjusting for constraints.

**This file is about:** Scheduling and adherence - when to do what based on constraints and timing to maximize adherence to the program.

---

## What is a Week?

The 7-day schedule showing when to do what, this week's goals, and how to stay on track despite constraints.

**Timeframe:** 7 days (specific ISO week)

**Hierarchy:**
- **Program** (PROGRAM.md): Comprehensive playbook for 1-3 months
- **Week** (this file): Scheduling & adherence - when to do what this week
- **Workout** (WORKOUT.md): Execute from program - apply details to today's session

**Saved to:** `fitness/weeks/YYYY-week-NN.md` with front matter

**Content must include:**
- **Daily schedule**: Type + location + time + session focus/target
- **Week goal**: What to accomplish this 7 days
- **Deviations**: Any changes from normal program
- **Rationale**: Why adjustments make sense

**Length:** 200-600 chars

---

## Week Planning Workflow

### Step 1: Review Program

**Load context:**
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs overview
```

Then read the program:
```
Read fitness/program.md
```

**Extract from program:**
- Training frequencies (4x strength, 3x cardio, etc.)
- Split structure (upper/lower, full-body, etc.)
- Equipment context (which gym which days)
- Hard/easy distribution
- Special protocols (daily prehab, deload schedule)

**If program stale (3+ months) or doesn't match goals:**
→ Load PROGRAM.md to update comprehensive playbook first

### Step 2: Identify This Week's Constraints

**Check recent logs and conversation for constraints BEFORE asking:**
- User may have already mentioned travel, work deadlines, etc.
- Recent logs may show missed sessions, lower RPE, pain notes
- Program may note known travel weeks, deload schedule

**Only ask about constraints if:**
1. Creating first-ever week
2. Significant change from last week
3. Genuinely unclear

**Brief constraint check (if needed):**
"Creating week plan. Any travel, schedule conflicts, or recovery concerns this week?"

### Step 3: Map Program to 7 Days

From program frequencies:
- Which days for which modality?
- Match to equipment availability
- Match to schedule preferences
- Apply hard/easy distribution
- Schedule around fixed activities (yoga, climbing, etc.)

### Step 4: Set Week Goal

Examples:
- "Week 3 of strength block - hit all 4 sessions at prescribed loads"
- "Travel week - maintain 3x training despite hotel gym limitations"
- "Deload - dissipate fatigue, maintain movement patterns"

### Step 5: Plan for Adherence

- Put hard sessions on days with best sleep/recovery
- Schedule at consistent times (habit building)
- Set specific times ("Mon 6am" not "Mon morning")
- Identify backup options if miss a session

### Step 6: Propose & Save

Present 7-day schedule, get approval, then:
```
Write fitness/weeks/YYYY-week-NN.md (with front matter)
```

---

## Week Examples

### Standard Week (No Constraints)

```markdown
---
week: 2026-week-08
phase: strength-block-week-4
deload: false
---

# Week 08

Mon: Upper @ Office 6am - bench 5x5, rows 4x8.
Tue: Lower @ Home 6am - squat 4x5, RDL 3x8.
Wed: Easy run 6:30am Z2 30min.
Thu: Upper @ Office 6am - OHP focus, pull-ups 3x8.
Fri: Lower @ Home 6am - deadlift focus, Bulgarian 3x8.
Sat: Tempo run 7am 4mi @ threshold.
Sun: Yoga 9am with partner.

Week goal: Complete Week 4 at prescribed loads (bench 185, squat 250, deadlift 285).
Why: Normal schedule, no constraints. Standard split following program.
```

### Travel Week (Thu-Sat Disrupted)

```markdown
---
week: 2026-week-09
phase: strength-block-week-5
deload: false
---

# Week 09

Mon: Upper @ Office 6am - full session.
Tue: Lower @ Home 6am - full session.
Wed: Easy run + pack for travel.
Thu: OFF (flight, travel day).
Fri: Hotel bodyweight 30min - push-ups, inverted rows, pistol progression.
Sat: Easy run 3mi.
Sun: Return + full-body @ Home 9am (catch-up: squat 3x5, bench 3x5, rows 3x8).

Week goal: Maintain 3x strength despite travel. Adherence over perfection.
Why: Conference Thu-Sat, hotel gym limited. Sun catch-up before normal Mon.
```

### Deload Week

```markdown
---
week: 2026-week-10
phase: deload
deload: true
---

# Week 10

Mon: Light upper 40min - bench 3x5 @ 180 (vs 5x5 @ 185), rows 3x8.
Tue: Easy run 3mi Z2.
Wed: Light lower 40min - squat 2x5 @ 250 (vs 4x5), RDL 2x8.
Thu: OFF.
Fri: Easy run 3mi Z2.
Sat: Mobility 30min.
Sun: OFF.

Week goal: Dissipate fatigue, arrive fresh for next block. 50% volume method.
```

### Reactive Adaptation (Stress/Illness/Injury)

**Stress:** Reduce volume, prioritize sleep, conditional sessions (IF RECOVERED)
**Illness:** Update week mid-stream, rest until better, light return
**Injury:** Increase prehab, modify affected exercises, focus unaffected areas

---

## Week Updates Mid-Week

**When plans change:** Write the same week file with updates

**Pattern:** Mark completed (✓), show changes, revise week goal, explain why

---

## Quick Reference

**Week planning is about:**
1. **When**: Map program to 7 specific days
2. **Where**: Assign gym/location based on equipment context
3. **What**: This week's goal
4. **How**: Maximize adherence despite constraints

**Not about:**
- Exercise selection (in program)
- Sets/reps/loads (in program & workout)
- Training principles (in program)

**Process:**
1. Run query script overview + read program
2. Identify this week's constraints
3. Map program to 7 days
4. Set week goal
5. Plan for adherence
6. Propose → approve → Write fitness/weeks/YYYY-week-NN.md
