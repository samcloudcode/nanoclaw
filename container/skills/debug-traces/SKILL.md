---
name: debug-traces
description: Query agent session traces for debugging. Use when asked to investigate errors, check what happened in a previous session, review tool usage, find failures, or debug agent behavior. Also use proactively when a tool fails or something unexpected happens.
allowed-tools: Bash(jq:*, cat:*, ls:*, head:*, tail:*, wc:*)
---

# Debug Traces

Query JSONL session trace files to understand what happened during agent sessions.

**Trace directory:** `/workspace/group/traces/`
**File format:** `{YYYY-MM-DD}-{HH-MM}-{sessionId-prefix}.jsonl` — one line per event.

## Event Types

| Event | Key Fields |
|-------|------------|
| `session.start` | `group`, `chatJid`, `isMain`, `isScheduled`, `sessionId` |
| `session.end` | `queryCount`, `durationMs` |
| `session.error` | `error` |
| `query.start` | `queryNumber`, `promptLength` |
| `query.end` | `queryNumber`, `durationMs` |
| `query.result` | `subtype` (success/error), `costUsd`, `inputTokens`, `outputTokens`, `numTurns`, `durationMs` |
| `tool.call` | `tool`, `toolUseId`, `input`, `output`, `durationMs` |
| `tool.error` | `tool`, `toolUseId`, `input`, `error` |
| `subagent.start` | `sessionId` |
| `subagent.stop` | `sessionId`, `durationMs` |
| `task.completed` | `sessionId`, `durationMs` |

Every event has a `ts` (ISO timestamp) field.

### Host Events (pre-container)

These are in `/workspace/group/traces/host-events.jsonl` — events from the host process before the container starts.

| Event | Key Fields |
|-------|------------|
| `transcription.success` | `chatJid`, `durationMs`, `textLength` |
| `transcription.fallback` | `chatJid`, `durationMs` — transcription returned null |
| `transcription.error` | `chatJid`, `durationMs`, `error` |

## Common Queries

```bash
# List recent trace files
ls -lt /workspace/group/traces/ | head -20

# Full timeline of the most recent session
cat "$(ls -t /workspace/group/traces/*.jsonl | head -1)" | jq .

# Find all errors across sessions
jq 'select(.event=="tool.error" or .event=="session.error")' /workspace/group/traces/*.jsonl

# Show tool calls in a session (pick a file)
jq -r 'select(.event=="tool.call") | "\(.ts) \(.tool): \(.input.command // .input.file_path // .input.pattern // .input.query // "")"' FILE.jsonl

# Cost and token summary per query
jq -r 'select(.event=="query.result") | "cost=$\(.costUsd) in=\(.inputTokens) out=\(.outputTokens) turns=\(.numTurns)"' FILE.jsonl

# Find slow tool calls (>5 seconds)
jq 'select(.event=="tool.call" and .durationMs > 5000)' /workspace/group/traces/*.jsonl

# Count tool usage by type
jq -r 'select(.event=="tool.call") | .tool' /workspace/group/traces/*.jsonl | sort | uniq -c | sort -rn

# Sessions from today
ls /workspace/group/traces/ | grep "$(date +%Y-%m-%d)"

# Transcription failures
jq 'select(.event=="transcription.error" or .event=="transcription.fallback")' /workspace/group/traces/host-events.jsonl

# Transcription success rate
jq -r '.event' /workspace/group/traces/host-events.jsonl | sort | uniq -c
```

Replace `FILE.jsonl` with the actual trace file path. Tool inputs/outputs over 500/1000 chars are truncated in the trace.
