---
name: add-telegram
description: Add Telegram as a channel. Can replace WhatsApp entirely or run alongside it. Also configurable as a control-only channel (triggers actions) or passive channel (receives notifications only).
---

# Add Telegram Channel

This skill adds Telegram support to NanoClaw, then walks through interactive setup.

**Principle:** Do the work. Only pause when user action is required (creating a bot in BotFather, providing a token, sending /chatid). Use `AskUserQuestion` for all user-facing questions.

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/telegram.ts` exists. If it does, skip to Phase 3 (Setup). The code changes are already in place.

### Detect platform

Determine the platform for service management commands later:

```bash
uname -s
```

- `Darwin` → macOS: use `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` to restart
- `Linux` → Linux: use `systemctl --user restart nanoclaw` to restart

Also detect the container runtime:

```bash
docker info >/dev/null 2>&1 && echo "docker" || (container --version >/dev/null 2>&1 && echo "apple-container" || echo "none")
```

### Ask the user

1. **Mode**: Replace WhatsApp or add alongside it?
   - Replace → will set `TELEGRAM_ONLY=true`
   - Alongside → both channels active (default)

2. **Do they already have a bot token?** If yes, collect it now. If no, we'll create one in Phase 3.

## Phase 2: Code Changes

The Telegram channel implementation lives in these files:

- `src/channels/telegram.ts` — TelegramChannel class (grammy library, long-polling)
- `src/config.ts` — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ONLY`, `TELEGRAM_ALLOWED_USERS` exports
- `src/index.ts` — Conditional channel initialization

### Key implementation details

- **JID format:** `tg:<numeric-chat-id>` (e.g., `tg:123456789`, `tg:-1001234567890` for supergroups)
- **`ownsJid`:** `jid.startsWith('tg:')`
- **@mention translation:** Telegram `@bot_username` mentions are translated to `@ASSISTANT_NAME` to match `TRIGGER_PATTERN`
- **Message splitting:** Telegram's 4096 char limit — auto-splits long messages
- **Voice transcription:** Downloads voice files via Telegram Bot API, transcribes using the shared `transcribeBuffer()` from `src/transcription.ts` (same Whisper pipeline as WhatsApp). Requires voice transcription to be set up first (see `/add-voice-transcription`).
- **Non-text messages:** Photo, video, audio, document, sticker, location, contact get placeholder strings

### Security features

- **`/ping` restricted:** Only responds in registered chats (prevents confirming bot identity to strangers)
- **`/chatid` open:** Left open for setup — only returns the chat's own public ID
- **`TELEGRAM_ALLOWED_USERS`:** Optional comma-separated list of numeric Telegram user IDs. When set, only these users can trigger the agent — even in registered group chats. Applied to both text and non-text message handlers.
- **Metadata gating:** `onChatMetadata` only called for registered chats — unregistered strangers don't get written to SQLite
- **Chat-level gating:** Only registered `tg:` JIDs in the `registered_groups` table receive responses

### If code is not yet in place

Install the grammy dependency:

```bash
npm install grammy --legacy-peer-deps
```

Create `src/channels/telegram.ts` implementing the `Channel` interface from `src/types.ts`. Add config exports to `src/config.ts` (read `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ONLY`, `TELEGRAM_ALLOWED_USERS` via `readEnvFile`). Update `src/index.ts` to conditionally initialize TelegramChannel when `TELEGRAM_BOT_TOKEN` is set, and skip WhatsApp when `TELEGRAM_ONLY` is true.

Reference the existing `src/channels/whatsapp.ts` for the Channel interface pattern.

### Validate

```bash
npm run build
```

## Phase 3: Setup

### Create Telegram Bot (if needed)

If the user doesn't have a bot token, tell them:

> I need you to create a Telegram bot:
>
> 1. Open Telegram and search for `@BotFather`
> 2. Send `/newbot` and follow prompts:
>    - Bot name: Something friendly (e.g., "My Assistant")
>    - Bot username: Must end with "bot" (e.g., "my_assistant_bot")
> 3. Copy the bot token (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

Wait for the user to provide the token.

### Validate the token

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
```

Check that `result.is_bot` is true. If it fails, the token is invalid.

### Configure environment

Add to `.env`:

```bash
TELEGRAM_BOT_TOKEN=<their-token>
```

If they chose to replace WhatsApp:

```bash
TELEGRAM_ONLY=true
```

**Note:** The Telegram bot runs on the host process, not inside containers. No need to sync to `data/env/env` for Telegram-specific config.

### Sender allowlist (security)

Use `AskUserQuestion`: Do you want to restrict who can message the bot?

- **Yes (recommended for personal use):** Tell the user to find their Telegram user ID by messaging `@userinfobot` on Telegram. Add `TELEGRAM_ALLOWED_USERS=<numeric-id>` to `.env`. Multiple IDs can be comma-separated.
- **No:** Skip. Any user in a registered chat can interact.

**Important:** `TELEGRAM_ALLOWED_USERS` must contain numeric user IDs (e.g., `123456789`), NOT usernames. Setting it to a non-numeric value will silently block all users.

### Disable Group Privacy (for group chats)

Use `AskUserQuestion`: Will you use the bot in group chats?

**If yes:** Tell the user:

> **Important for group chats**: By default, Telegram bots only see @mentions and commands in groups. To let the bot see all messages:
>
> 1. Open Telegram and search for `@BotFather`
> 2. Send `/mybots` and select your bot
> 3. Go to **Bot Settings** > **Group Privacy** > **Turn off**
>
> After changing this, remove and re-add the bot to any existing groups for it to take effect.

**If no:** Skip — the bot works fine in private chats without this.

### Build and restart

```bash
npm run build
```

Restart the service (use the platform-appropriate command from Phase 1):

- **macOS:** `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- **Linux:** `systemctl --user restart nanoclaw`

If using Docker, kill orphaned containers first:
```bash
docker ps --filter "name=nanoclaw" -q | xargs -r docker kill 2>/dev/null
```

If using Apple Container, kill orphaned containers first:
```bash
container ls -a --format json | python3 -c "
import sys, json
data = json.load(sys.stdin)
nc = [c['configuration']['id'] for c in data if c['configuration']['id'].startswith('nanoclaw-')]
if nc: print(' '.join(nc))
" | xargs -r container stop 2>/dev/null
```

Verify the bot connected:

```bash
sleep 3 && tail -20 logs/nanoclaw.log | grep -i telegram
```

Should show `Telegram bot connected` with the bot username.

## Phase 4: Registration

### Get Chat ID

Tell the user:

> 1. Open your bot in Telegram (search for its username)
> 2. Send `/chatid` — it will reply with the chat ID
> 3. For groups: add the bot to the group first, then send `/chatid` in the group

Wait for the user to provide the chat ID (format: `tg:123456789` or `tg:-1001234567890`). Accept with or without the `tg:` prefix — normalize it.

### Register the chat

Use `AskUserQuestion`: Main chat (responds to everything) or secondary (trigger-only)?

Read `ASSISTANT_NAME` from `src/config.ts` or `.env` to use the correct trigger pattern.

Register directly via Node:

```bash
node -e "
const { initDatabase, setRegisteredGroup } = require('./dist/db.js');
initDatabase();
setRegisteredGroup('<JID>', {
  name: '<NAME>',
  folder: '<FOLDER>',
  trigger: '@<ASSISTANT_NAME>',
  added_at: new Date().toISOString(),
  requiresTrigger: <true|false>
});
console.log('Registered');
"
```

**Note:** If registering as main (`folder: 'main'`), this shares context with the WhatsApp main chat if one exists. Both channels route to the same agent workspace.

Restart to pick up the registration (use platform-appropriate command).

## Phase 5: Verify

### Test the connection

Tell the user:

> Send a message to your registered Telegram chat:
> - For main chat: Any message works
> - For non-main: `@<trigger> hello` or @mention the bot
>
> The bot should respond within a few seconds.

### Check logs if needed

```bash
tail -30 logs/nanoclaw.log | grep -E "Telegram message stored|Processing messages|Agent output"
```

## Troubleshooting

### Bot not responding

1. Check `TELEGRAM_BOT_TOKEN` is set in `.env`
2. Check chat is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'tg:%'"`
3. Check `TELEGRAM_ALLOWED_USERS` — must be numeric user IDs, not usernames. If set to a non-numeric value, all messages are silently dropped.
4. For non-main chats: message must include trigger pattern
5. Service is running: check with platform-appropriate command (`launchctl list | grep nanoclaw` on macOS, `systemctl --user status nanoclaw` on Linux)

### Bot only responds to @mentions in groups

Group Privacy is enabled (default). Fix:
1. `@BotFather` > `/mybots` > select bot > **Bot Settings** > **Group Privacy** > **Turn off**
2. Remove and re-add the bot to the group (required for the change to take effect)

### Voice messages not transcribed

1. Ensure voice transcription is set up (`/add-voice-transcription`)
2. Check `.transcription.config.json` exists with `"enabled": true` and a valid OpenAI API key
3. Check logs: `tail -50 logs/nanoclaw.log | grep -i voice`
4. Telegram file downloads may time out — usually transient, retry

### Service hangs on restart

An orphaned container may block shutdown. Kill it first (see Build and restart section above), then restart the service.

### Getting chat ID

If `/chatid` doesn't work:
- Verify token: `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"`
- Check bot is started: `tail -f logs/nanoclaw.log`

## After Setup

Ask the user:

> Would you like to add Agent Swarm support? Each subagent appears as a different bot in the Telegram group. If interested, run `/add-telegram-swarm`.
