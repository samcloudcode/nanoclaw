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
| `groups/{name}/CLAUDE.md` | Per-group memory (overlay from vault) |

## Agent Skills & Vault Sync

Skills and group CLAUDE.md files live in the **Obsidian vault** at `~/Documents/Life/NanoClaw/`, synced across devices via Obsidian Sync. The vault is the single source of truth.

### How it works

**Markdown files** (SKILL.md, references/) live in the vault, synced via Obsidian Sync. **Scripts** (.mjs, .sh) live in `container/skills/` in the git repo and must be scp'd to the server vault when changed:

```bash
rsync -a --exclude='*.md' container/skills/ nanoclaw:~/Documents/Life/NanoClaw/skills/
```

The vault skills dir is **directly mounted** into containers at `/home/node/.claude/skills/`. Config: `VAULT_SKILLS_DIR` in `src/config.ts`, mount in `src/container-runner.ts`.

Group CLAUDE.md files are mounted as **single-file overlays** from vault. Agent edits write directly to the vault. Logs, traces, and conversations stay in `groups/`.

Fallback: if vault paths don't exist, falls back to `container/skills/` and `groups/` in the repo.

### Vault structure
```
~/Documents/Life/NanoClaw/
  skills/           → mounted at /home/node/.claude/skills/ (read-write)
    <name>/SKILL.md       ← vault (Obsidian Sync)
    <name>/*.mjs, *.sh    ← git repo (scp'd to server)
  groups/
    main/CLAUDE.md  → overlaid at /workspace/group/CLAUDE.md
    global/CLAUDE.md → overlaid at /workspace/global/CLAUDE.md (read-only for non-main)
```

### Adding a skill
Create `~/Documents/Life/NanoClaw/skills/<name>/SKILL.md` (or ask the agent to use the `skill-creator` skill). If the skill includes scripts, add them to `container/skills/<name>/` in the repo and sync to server.

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

## Production Server

DigitalOcean Droplet at `165.232.50.199` (Singapore), Ubuntu 24.04, 4GB/2vCPU.

SSH aliases (in `~/.ssh/config`):
```bash
ssh nanoclaw              # Plain SSH
ssh nanoclaw-vnc          # SSH + VNC tunnel (then connect Remmina VNC to localhost:5901)
```

Desktop: XFCE via TigerVNC on display `:1` (systemd user service `vncserver`). Used for Obsidian and Proton Bridge.

Key services (systemd user):
```bash
ssh nanoclaw 'systemctl --user status nanoclaw'      # NanoClaw
ssh nanoclaw 'systemctl --user status vncserver'      # VNC desktop
```

## Container Build Cache

Docker buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps. To force a truly clean rebuild:

```bash
docker builder prune -f
./container/build.sh
```
