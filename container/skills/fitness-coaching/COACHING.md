# Real-Time Workout Coaching

**Load this file when:** Client is actively doing a workout right now.

**Signals:**
- "I'm doing [workout] now" or "I'm at the gym"
- Mid-workout questions: "How's my form?" "Should I add weight?" "This feels too hard"
- Real-time issues: "My knee hurts" "Equipment is busy" "Running out of time"
- Incremental logging: Client reports sets as completed

**DON'T load for:** Planning workouts (use WORKOUT.md) or designing programs (use PROGRAM.md)

---

## Coaching Workflow

**1. Fetch context:**
```bash
node /home/node/.claude/skills/fitness-coaching/fitness-query.mjs overview
```
Then read today's plan and any relevant knowledge:
```
Read fitness/plans/YYYY-MM-DD-{type}.md
Read fitness/knowledge.md  # for constraints
```

**2. Guide execution:**
- Connect to goals: "This builds toward squat-315 goal"
- Reference program phase: "Week 4 of hypertrophy block - fatigue is expected"
- Use plan's cues and RPE targets
- Apply knowledge constraints (injuries, form cues)
- Encourage and calibrate

**3. Log incrementally:**
Write the same log file as they progress:
```
Write fitness/logs/YYYY-MM-DD-{type}.md
→ Update with accumulated sets as they report them
```

**4. Adapt on the fly:**
- **Pain** → Reference knowledge, swap exercises if needed (sharp pain = stop, dull ache = monitor)
- **Fatigue** → Reduce load/volume if recovery compromised
- **Equipment busy** → Reorder or substitute per plan's contingencies
- **Time short** → Prioritize main work, drop accessories

---

## What to Coach

**Reference the plan's execution details:**
- Form cues: "Remember: chest up, knees track toes per knowledge"
- Tempo: "2sec eccentric, explode up"
- RPE calibration: "RPE 8 = 2 reps left, bar speed consistent"
- Rest activities: "Hip 90/90 stretches during 3min rest per plan"

**Apply knowledge constraints:**
- Use saved cues that work for them
- Avoid movements/positions from injury history
- Adapt based on their specific responses

**Support & motivate:**
- Connect to goals: "This volume builds toward squat-315" or "You're 10lbs closer to bench-225 than last month"
- Calibrate expectations: "Week 4 of hypertrophy - fatigue means you're adapting"
- Celebrate progress: PRs, better form, consistency ("showing up is 90% of progress")

---

## Progressive Logging Pattern

**Write the same file with accumulated data:**

After warmup:
```
Write fitness/logs/2026-02-22-lower.md
→ Front matter + "Lower (in progress): Warmup done, ready to squat."
```

After main work:
```
Write fitness/logs/2026-02-22-lower.md
→ Front matter + "Lower (in progress): Squat 5×5 @ 210 RPE 8, RDL 4×8 @ 160 RPE 7. Starting accessories..."
```

Session complete:
```
Write fitness/logs/2026-02-22-lower.md
→ Final front matter (duration, rpe_avg) + complete log with all exercises and notes
```

---

## Quick Reference

**Workflow:** Fetch plan/knowledge → Guide execution → Log incrementally → Adapt as needed

**Key principles:**
- **Real-time only** - this file is for active training sessions
- **Reference plan + knowledge** - they contain the cues, targets, and constraints
- **Log as you go** - same file, rewritten with accumulated data
- **Adapt intelligently** - pain/fatigue/equipment issues require on-the-fly changes
