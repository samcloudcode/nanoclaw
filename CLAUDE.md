# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Runs on **Linux (Fedora)**. Single Node.js process that connects to WhatsApp, routes messages to Claude Agent SDK running in Docker containers. Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp connection, auth, send/receive |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations (messages, chats, tasks) |
| `src/voice-server.ts` | HTTP endpoint for voice hotkey input |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/` | Agent skills synced to all groups (see below) |

## Agent Skills

Skills in `container/skills/<name>/SKILL.md` are automatically synced into each group's `.claude/skills/` directory at container start (`container-runner.ts`). The container agents have the `Skill` tool enabled, so they can invoke any skill placed here.

To add a new agent skill, create `container/skills/<name>/SKILL.md`. It will be available to all groups on next container run.

Existing skills:
- `agent-browser` — Browser automation via Bash
- `email-reader` — Read emails via IMAP
- `fitness-coaching` — Fitness guidance
- `lifeos-db` — Query/manage Life OS PostgreSQL database (requires `psql`, `DATABASE_URL`, `USER_ID`)
- `skill-creator` — Guide for creating new skills

## Host Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management (systemd user service):
```bash
systemctl --user restart nanoclaw    # Restart
systemctl --user stop nanoclaw       # Stop
systemctl --user start nanoclaw      # Start
journalctl --user -u nanoclaw -f     # Tail logs
```

## Container Secrets & Environment

Secrets from `.env` are passed to containers via stdin (never mounted as files). The allowlist lives in `readSecrets()` in `src/container-runner.ts`. To add a new secret, add its key there.

Inside the container, secrets go into `sdkEnv` only (not `process.env`) so Bash subprocesses can't leak them. Exception: keys listed in `TOOL_ENV_KEYS` in `container/agent-runner/src/index.ts` are exported to `process.env` so Bash tools (e.g. `psql`) can use them.

**To make a new `.env` var available to container Bash tools:** add it to both `readSecrets()` and `TOOL_ENV_KEYS`.

## Container Build Cache

Docker buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps. To force a truly clean rebuild:

```bash
docker builder prune -f
./container/build.sh
```
