# Program Creation

**Load this file when:** Creating or updating the overall training program strategy.

**This file contains:**
- Data-driven workflow extracting from fitness files
- p1/p2/p3 priority-based programming framework
- Activity integration strategies (scheduling around preferences)
- Examples showing context → program derivation

---

## What is a Program?

**The self-aware strategic document** showing how all goals fit together and the comprehensive framework to achieve them. Contains everything needed to plan weeks and create workouts. Single living document updated when strategy changes or becomes stale (3+ months).

**Timeframe:** 1-3 months (can reference longer-term progression but focus on current mesocycle)

**Hierarchy:**
- **Program** (this file): Comprehensive strategy - exercise types, mobility protocols, recovery approach, sequencing rules, rationale
- **Week** (WEEK.md): This week's specific schedule derived from program strategy, travel/life adaptations
- **Workout** (WORKOUT.md): Today's session details - exact exercises, sets/reps/weights within program framework

**Saved to:** `fitness/program.md` (Write replaces entire file)

**Required Strategic Elements (comprehensive):**

1. **Goals & Priorities**: Which goals (p1/p2/p3), current state, targets, deadlines, why this priority order
2. **Training Split & Frequencies**: Sessions per modality with contexts (e.g., "4x strength: upper Mon/Thu @ office, lower Tue/Fri @ home")
3. **Exercise Architecture**:
   - Main lifts (movements, intensity/rep ranges, specific exercises if constraint-driven)
   - Secondary work (volume focus, examples)
   - Accessories (isolation, prehab, specific protocols)
4. **Mobility & Prehab**:
   - Daily protocols (e.g., "knee protocol 10min AM: backward sled, Nordics, tibialis - why: knee injury history")
   - Integrated mobility (e.g., "hip work during squat rest - accumulate 60min/week")
   - Stretching targets (e.g., "hip ER for yoga lotus goal")
5. **Recovery Strategy**:
   - Deload schedule (every X weeks, method)
   - Hard/easy distribution (total hard days, sequencing)
   - Sleep/nutrition if critical constraint
6. **Progression Framework**:
   - Current phase (hypertrophy/strength/peak week X of Y)
   - Rep/set schemes per phase
   - How to progress (e.g., "add 2.5lb/week bench, 5lb/week squat")
   - Timeline milestones
7. **Activity Integration**:
   - Fixed activities (yoga, MTB, climbing - when, with whom, non-negotiable)
   - How they fit (recovery aid vs interference source)
   - Scheduling rules
8. **Constraint Management**:
   - Injury accommodations (what to avoid, what to emphasize)
   - Equipment per context (office DBs only, home full rack)
   - Travel adaptations
   - Time constraints
9. **Sequencing & Interference**:
   - Separation rules (e.g., "6hr minimum heavy lower → hard cardio")
   - Antagonist balance (e.g., "push:pull 1:1 for shoulder health")
   - Fatigue management between sessions
10. **Rationale & Why**:
    - Why this approach for these goals
    - How modalities combine/interact
    - Trade-offs accepted (e.g., "concurrent = slower gains but maintains both p1 goals")
    - What makes this sustainable for this person

**Length:** As comprehensive as needed (600-1500 chars typical).

---

## Knowledge Files Reference

Load these when relevant to user's context (Step 2):

- **KNEE-HEALTH.md**: Mechanisms and principles for knee health programming (VMO stabilization, eccentric loading, tissue adaptation, modification decision trees)

---

## Program Creation Workflow

### Step 1: Extract All Context

**Load fitness data:**
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs overview
```

Then read the relevant files:
```
Read fitness/program.md        # Current program (if exists)
Read fitness/preferences.md    # Equipment, timing, activities
Read fitness/knowledge.md      # Injuries, constraints, what works
```

For recent training details, query logs:
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs logs --last 10
```

**What to extract and how it informs programming (adapt to actual data):**

**From Goals (LifeOS)** - Check priorities, targets, deadlines:
- Priorities (p1/p2/p3) → Determines volume/frequency allocation
- Target metrics → Sets progression timeline
- Deadlines → Determines periodization urgency

**From Preferences** - Check equipment, time, activities, style:
- Equipment access → Exercise selection per day
- Time available → Volume/superset strategy
- Activity preferences → Schedule around fixed activities
- Training style → Exercise selection

**From Knowledge** - Check injury history, limitations, recovery patterns:
- Injury history → Exercise modifications, prehab protocols
- Movement limitations → Alternative exercises
- Recovery patterns → Frequency decisions

**From Recent Logs** - Check weights, volume responses, frequency patterns:
- Current working weights → Starting loads for program
- Volume tolerance → Volume targets
- Exercise responses → Exercise selection
- Frequency patterns → Programming frequency

**From Current Program (if exists)** - Check performance and feedback:
- What's working → Keep and build on
- What's not working → Modify or replace
- How long running → Determine if need variation
- Staleness → If 3+ months, refresh approach

**IMPORTANT:** Always extract from ACTUAL data, not assumptions.

### Step 2: Think Deeply to Optimize for Goals Based on Priority

**This is where coaching expertise matters most.**

**Process:**
1. **Load relevant knowledge files** based on goals and context:
   - Injury/limitation mentioned? Load relevant knowledge file (e.g., KNEE-HEALTH.md)
   - Specific training goal? Load relevant expertise

2. **Analyze current status deeply:**
   - Where are they NOW? (from logs)
   - Where do they want to be? (from goals)
   - What's the gap? (realistic progression rate)
   - What are constraints? (from knowledge)
   - What are preferences? (from preferences)

3. **Design comprehensive plan** using frameworks below

4. **Critically evaluate your plan:**
   - Does this ACTUALLY get them to their goals in the timeline?
   - Does it account for ALL limitations?
   - Does it fit their life constraints?

5. **Refine and improve**

### Step 3: Propose Program

Present strategy with:
- Training frequencies and approach
- How it integrates preferences
- Main/secondary/accessory breakdown
- Starting weights/loads from recent logs
- Injury prevention protocols from knowledge
- Progression timeline toward goals
- Equipment strategy
- Hard/easy distribution
- Constraint management

**Not prescriptive daily schedule** - that's for WEEK.md.

### Step 4: Ask Clarifying Questions (Only If Critical Gaps)

**MINIMIZE QUESTIONS.** Only ask if:
- Context has conflicting info
- Critical detail missing that fundamentally changes program
- Need to choose between two valid approaches

### Step 5: Get Approval & Save

Refine based on feedback, then:
```
Write fitness/program.md (complete program document)
```

---

## Program Design Framework

### Goal-Driven Programming

**Prioritize by p-value:**
- **p1 goals:** Primary focus - most volume, highest frequency, best recovery
- **p2 goals:** Secondary - maintain, don't progress aggressively
- **p3 goals:** Minimal viable dose - don't interfere with p1/p2

**Handling Multiple p1 Goals:**
- **Option 1:** Sequential blocks - 12 weeks focus A, then 12 weeks focus B
- **Option 2:** Concurrent - Train both, accept 30% slower progress
- **Option 3:** Redefine priorities - Make one p1, other p2

### Deload Protocols

**When:** Every 4-8 weeks scheduled, or reactive (strength regressing, persistent soreness)

**How (choose ONE):**
- 50% volume (keep intensity, reduce sets)
- 50% intensity (keep volume, reduce load)
- 50% frequency (keep session work, train fewer days)

---

## Efficiency Techniques

**Rest-Period Mobility Integration:**
- Upper session rest → lower body mobility
- Lower session rest → upper body mobility
- Result: 15min mobility per workout = 60min/week accumulated

**Superset Strategies:**
- Antagonist pairs (push/pull), non-competing muscle groups
- Never main lifts (compromises adaptation)
- Result: 15-20min time savings per session

---

## Program Examples

### Example: Zero Questions Asked - Complete Derivation from Context

**CONTEXT FROM FILES:**
- Goals (LifeOS): p1-bench-225 (currently 185x5, June = 5mo), p2-sub-21-5K (currently 22:30)
- Preferences: Office gym Mon/Wed (DBs to 75lbs), Home gym Fri/Sat (full rack), 60min max, 6am
- Knowledge: Rotator cuff strain 2024 (healed, avoid behind-neck press), need 72hr between heavy lower
- Recent logs: Bench 4x8 @ 175 RPE 7, Squat 4x6 @ 245, Running 3x/week 25min

**PROGRAM (all from context, zero questions):**
```
As of Jan 2025: Bench-225 primary (p1, 185x5 → 225x1 by June, 20 weeks). Strength 4x/week upper/lower. Running secondary (p2, maintain sub-21 5K) 3x/week easy Z2. Shoulder prehab daily 5min (rotator cuff 2024, face pulls mandatory). Equipment: Office Mon/Wed (DBs - upper), Home Fri/Sat (rack - lower + heavy upper).

EXERCISE ARCHITECTURE:
- Main: Bench 5x5 (DB @ office, BB @ home), Squat 4x5 @ 250 (home), Deadlift 3x4 @ 285
- Secondary: Incline DB 3x10, Front squat 3x6, RDL 3x8, Cable rows 3x10
- Accessories: Bulgarian 3x8/leg, Leg curl 3x12, Tricep/Bicep 3x12
- Prehab: Face pulls 3x20 daily, band pull-aparts 3x20

PROGRESSION (20 weeks): Bench +2.5lb/week, Squat +5lb/week first 8 weeks then maintain.
RECOVERY: Deload every 4 weeks (50% volume). 72hr minimum between heavy lower days.
```

---

## Program Staleness & Updates

**Check "As of" date:** Stale if 3+ months old

**Update when:** Goals changed, strategy not working, life change, approaching 3 months

**Update process:** Note staleness → check goal changes → propose updated program → get approval → Write fitness/program.md
