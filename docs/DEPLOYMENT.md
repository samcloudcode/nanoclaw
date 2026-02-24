# Deployment Guide

## Infrastructure

| Component | Details |
|-----------|---------|
| Provider | DigitalOcean |
| Region | Singapore (SGP1) |
| OS | Ubuntu 24.04 |
| Spec | 4GB RAM / 2 vCPU / 80GB SSD |
| Cost | $24/mo |
| IP | `165.232.50.199` |
| User | `nanoclaw` (passwordless sudo) |

## Server Access

SSH aliases are configured in `~/.ssh/config`:

```bash
ssh nanoclaw              # Plain SSH
ssh nanoclaw-vnc          # SSH + VNC tunnel (then Remmina VNC → localhost:5901)
```

- SSH: key-only auth, root login disabled, password auth disabled
- Firewall (UFW): ports 22 (SSH) and 3389 (RDP, legacy) only
- Security: fail2ban, unattended-upgrades, linger enabled

## What's Running

### Systemd user services

| Service | Purpose |
|---------|---------|
| `nanoclaw` | Main NanoClaw process |
| `vncserver` | TigerVNC on display `:1` (XFCE desktop) |

```bash
ssh nanoclaw 'systemctl --user status nanoclaw'
ssh nanoclaw 'systemctl --user status vncserver'
ssh nanoclaw 'journalctl --user -u nanoclaw -f'    # Tail logs
```

### Desktop apps (via VNC)

- **Obsidian** — real app with Obsidian Sync, vault at `/home/nanoclaw/Documents/Life`
- **Proton Bridge** — systemd user service, IMAP on `127.0.0.1:1143`, SMTP on `127.0.0.1:1025`. See [PROTON-BRIDGE.md](PROTON-BRIDGE.md)

### Key paths on server

| Path | Purpose |
|------|---------|
| `~/nanoclaw/` | NanoClaw project root |
| `~/nanoclaw/.env` | Environment variables (prod bot token) |
| `~/nanoclaw/.transcription.config.json` | OpenAI transcription config |
| `~/nanoclaw/store/messages.db` | SQLite database |
| `~/nanoclaw/groups/main/` | Main group data, traces, logs |
| `~/Documents/Life/` | Obsidian vault (synced) |
| `~/.config/nanoclaw/mount-allowlist.json` | Container mount allowlist |
| `~/.config/systemd/user/nanoclaw.service` | NanoClaw systemd unit |
| `~/.config/systemd/user/vncserver.service` | VNC systemd unit |

### Telegram

- Prod bot: `@samassistant_prod_bot`
- Registered chat: `tg:2088640248` (DM)
- `TELEGRAM_ONLY=true`, `TELEGRAM_ALLOWED_USERS=2088640248`
- Local dev uses a separate bot token to avoid polling conflicts

## Deploy Updates

### Code changes

```bash
# Push from local
git push

# Deploy on server
ssh nanoclaw 'cd ~/nanoclaw && git pull && npm ci && npm run build && systemctl --user restart nanoclaw'
```

### Agent container changes

```bash
ssh nanoclaw 'cd ~/nanoclaw && ./container/build.sh'
```

### Skill scripts

Scripts (.mjs, .sh) in `container/skills/` don't sync via Obsidian. After changing a skill script, sync to the server:

```bash
rsync -a --exclude='*.md' container/skills/ nanoclaw:~/Documents/Life/NanoClaw/skills/
```

### Files not in git (must copy manually)

```bash
scp .env nanoclaw:~/nanoclaw/.env
scp .transcription.config.json nanoclaw:~/nanoclaw/.transcription.config.json
```

## Maintenance

### Cron jobs (not yet set up)

```
0 5 * * 0 docker system prune -f >> /home/nanoclaw/docker-prune.log 2>&1
0 5 * * 0 find /home/nanoclaw/nanoclaw/groups/*/logs -name "*.log" -mtime +30 -delete 2>/dev/null
```

### Monitoring

- DigitalOcean alerts: CPU > 90%, disk > 80%, memory > 90%
- Dead man's switch: scheduled task pings via Telegram daily (not yet set up)

## Gotchas

### `.npmrc` with `legacy-peer-deps=true`
Required due to zod peer dependency conflict between grammy and openai. Without it, `npm ci` silently skips packages. Committed to repo.

### Telegram JID format is `tg:<user_id>`
When registering a chat, the JID must be prefixed with `tg:`. Example: `tg:2088640248`, not `2088640248`.

### `.transcription.config.json` is not in git
Contains the OpenAI API key for voice transcription. Must be copied to server manually.

### Vault path is `/home/nanoclaw/Documents/Life`
Not `~/vault` as originally planned. Both the mount allowlist and the registered group's `containerConfig.additionalMounts` must use this absolute path. Inside the container it appears at `/workspace/extra/vault`.

### Docker group requires session restart
After adding a user to the `docker` group, systemd user services don't pick up the new group until the user session is restarted: `sudo systemctl restart user@1000.service`

### VNC not xrdp
xrdp + XFCE on Ubuntu 24.04 doesn't work reliably (black/turquoise screen). TigerVNC works. VNC runs on port 5901 behind SSH tunnel (not exposed via firewall). Requires `dbus-x11` package.

### Service restart waits for running containers
`systemctl --user restart nanoclaw` sends SIGTERM, but NanoClaw waits for running agent containers to detach. If it hangs: `docker kill $(docker ps -q --filter "name=nanoclaw-")`

### Dev vs prod bot tokens
Local `.env` uses a dev Telegram bot token, server uses prod. Never run both with the same token — only one can poll Telegram at a time.

## Voice Hotkey (Local Machine)

The voice hotkey (`scripts/voice-hotkey.sh`) sends audio to the server via an SSH tunnel.

**Local services (systemd user on laptop):**

| Service | Purpose |
|---------|---------|
| `nanoclaw-tunnel` | autossh persistent SSH tunnel forwarding port 8765 |

```bash
systemctl --user status nanoclaw-tunnel   # Check tunnel
journalctl --user -u nanoclaw-tunnel -f   # Tunnel logs
```

The tunnel uses the `nanoclaw` SSH config alias (`LocalForward 8765 localhost:8765`). It starts on login, reconnects on drops, and restarts via systemd if the process dies.

The hotkey script defaults to `http://localhost:8765` which routes through the tunnel to the server's voice endpoint.

## Future

- [ ] Web chat via Cloudflare Tunnel to `localhost:3420`
- [x] Proton Bridge on desktop
- [ ] Cron jobs for disk hygiene
- [ ] DigitalOcean monitoring alerts
- [ ] Dead man's switch scheduled task
