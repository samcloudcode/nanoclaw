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

**Important:** When editing group CLAUDE.md or skill .md files, always edit the **vault copy** (`~/Documents/Life/NanoClaw/`), not the git repo copy (`groups/` or `container/skills/`). The vault is the source of truth — the git copies are outdated.

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

## Troubleshooting WhatsApp

If WhatsApp isn't connecting, check these in order:

1. **`TELEGRAM_ONLY=true` in `.env`** — disables WhatsApp entirely. Set to `false` and restart.
2. **Auth expired (401 / "logged out")** — clear auth and re-scan QR:
   ```bash
   ssh nanoclaw 'rm -rf ~/nanoclaw/store/auth && mkdir -p ~/nanoclaw/store/auth'
   ssh nanoclaw 'cd ~/nanoclaw && node wa-auth.mjs'  # shows QR in terminal
   # Scan with WhatsApp → Settings → Linked Devices → Link a Device
   systemctl --user restart nanoclaw
   ```
   The `wa-auth.mjs` script on the server handles QR display and reconnection. Baileys' `printQRInTerminal` option is deprecated and no longer works.

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

## Desktop App (Tauri v2)

Located in `desktop/`. Wraps `web/index.html` as a native desktop app with global voice hotkey. Product name: "Sam's PA". Installed via RPM as `sam-s-pa`.

| File | Purpose |
|------|---------|
| `desktop/src-tauri/src/lib.rs` | Global shortcut, tray, `set_recording` command, mic permission |
| `desktop/src-tauri/tauri.conf.json` | App config, two windows: `main` + `indicator` |
| `desktop/src-tauri/capabilities/default.json` | Tauri permissions |
| `web/indicator.html` | Floating recording indicator (dark pill, animated bars) |

**Key details:**
- Global shortcut: Ctrl+Shift+R (configurable via `~/.config/nanoclaw/desktop.json`)
- Indicator shown/hidden via Tauri `invoke('set_recording', { active })` from frontend
- Mic permission auto-granted via webkit2gtk `connect_permission_request`
- Indicator window position on Wayland is compositor-controlled (GNOME places it centrally)
- `src/channels/web.ts` has CORS headers on all responses (needed for cross-origin fetch from Tauri)
- Server URL hardcoded for Tauri: `https://chat.life-ops.co` (falls back from `localStorage` → hardcoded default, not `location.origin` which is `tauri://localhost`)
- `web/index.html` suppresses the shortcut key in a `keydown` listener to prevent typing characters into the input
- `stopRecording()` assigns `onstop` before calling `.stop()` to prevent a race condition losing audio
- Service worker is skipped in Tauri (`!window.__TAURI__`)
- JS↔Rust IPC: use `invoke()` (JS→Rust commands), `app.emit()` (Rust→JS events). JS `emit()` does NOT reach Rust listeners in Tauri v2.

**Build gotchas:**
- PNG icons must be 8-bit RGBA: `magick icon.svg -background none -resize 32x32 -depth 8 -define png:color-type=6 icon.png`
- Icons are embedded at compile time. After regenerating, `touch src-tauri/build.rs` to force recompile.
- AppImage bundling fails on Fedora (linuxdeploy issue). Disabled via `"targets": ["rpm", "deb"]` in tauri.conf.json.
- `CARGO_BUILD_JOBS=2` limits RAM usage during compilation.
- `plugins` must be `"plugins": {}` (empty object), not `"plugins": { "global-shortcut": {} }` — the latter causes `invalid type: map, expected unit`.

**Deploy server changes:**
```bash
npm run build && rsync -a dist/ nanoclaw:~/nanoclaw/dist/ && ssh nanoclaw 'systemctl --user restart nanoclaw'
```

**Build and install desktop app:**
```bash
cd desktop && CARGO_BUILD_JOBS=2 cargo tauri build && sudo dnf reinstall "src-tauri/target/release/bundle/rpm/Sam's PA-0.1.0-1.x86_64.rpm"
```

**Run desktop app locally (dev):**
```bash
cd desktop && CARGO_BUILD_JOBS=2 cargo tauri dev
```

**Autostart on login:**
```bash
cp "/usr/share/applications/Sam's PA.desktop" ~/.config/autostart/
```

## Container Build Cache

Docker buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps. To force a truly clean rebuild:

```bash
docker builder prune -f
./container/build.sh
```
