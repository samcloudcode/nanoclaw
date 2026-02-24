# Web Chat Channel for NanoClaw

## Context
User wants a slick, modern, lag-free one-on-one chat interface accessible as a web app on phone and desktop. Currently has WhatsApp and Telegram channels. Must be very secure (Cloudflare Access) and feel native/intuitive. Text-only for now — voice/audio support planned as a future native app project (iOS PWA mic permissions are unreliable).

## Approach: Built-in Web Server + Cloudflare Access

NanoClaw serves a web chat UI directly via an embedded HTTP + WebSocket server. Cloudflare Access (Zero Trust) handles authentication at the infrastructure layer — no auth code needed in NanoClaw.

## Implementation

### 1. New channel: `src/channels/webchat.ts`
- Implements `Channel` interface from `src/types.ts` (lines 81-104)
- JID: `web:default` (single 1:1 chat). `ownsJid`: `jid.startsWith('web:')`
- Node.js `http` module + `ws` WebSocket library
- HTTP serves inline single-page app (no build step, no framework)
- WebSocket: real-time messages, typing indicators, connection status
- `sendMessage()`: broadcasts JSON to all connected WS clients
- `setTyping()`: sends typing event over WS
- `connect()`: starts HTTP + WS server on configured port
- `disconnect()`: closes server

### 2. Chat UI Design (inline HTML/CSS/JS in webchat.ts)

**Layout:**
- Flexbox column layout with `100dvh` (dynamic viewport height — handles mobile keyboard correctly)
- Max-width 720px centered, frosted glass header with `backdrop-filter: blur(20px)`
- Auto-growing textarea input (max 120px height), rounded pill shape
- `overscroll-behavior: contain` on message list, `env(safe-area-inset-bottom)` padding
- PWA manifest for "Add to Home Screen" native feel

**Messages:**
- User: right-aligned blue bubbles (#0a84ff), white text, rounded with squared bottom-right corner
- Agent: left-aligned neutral bubbles, full dark/light mode support via `prefers-color-scheme`
- Consecutive same-sender messages group (reduced border radius)
- Slide-in animation: `translateY(8px)` → 0 over 180ms ease-out
- Timestamps shown subtly (11px, 50% opacity)

**Markdown:** Use `marked` + `DOMPurify` loaded from CDN (~32KB total). Render agent messages as markdown with code block styling.

**Performance:**
- Optimistic UI: user messages appear instantly, reconcile with server ack
- Streaming support: update single element's content via `requestAnimationFrame` throttling
- Smart auto-scroll: track distance from bottom, only auto-scroll when user is at bottom. "Scroll to bottom" FAB when scrolled up.
- WebSocket reconnection: exponential backoff with jitter (1s → 30s cap)
- Heartbeat ping every 25s to keep connection alive

**Typing indicator:** Three-dot bounce animation in agent bubble style. Shows until first streaming token arrives.

**Dark/light mode:** Automatic via `prefers-color-scheme`. Dark: black bg, #1c1c1e surfaces. Light: #f5f5f5 bg, white surfaces.

### 3. Config: `src/config.ts`
- `WEB_CHAT_PORT` (default `3420`)
- `WEB_CHAT_ENABLED` flag

### 4. Register in `src/index.ts`
- Import `WebChatChannel`, conditionally create + push to `channels[]`
- Follow same pattern as Telegram registration (lines 442-548)
- Auto-register `web:default` chat in DB via `onChatMetadata`

### 5. Auth: Cloudflare Access (infrastructure only)
- No auth code in NanoClaw
- User configures Cloudflare Access policy to restrict to their email
- Works with Cloudflare Tunnel (local) or DNS proxy (VPS)

## New dependencies
- `ws` + `@types/ws` — WebSocket server

## Files to create/modify
| File | Action |
|------|--------|
| `src/channels/webchat.ts` | **Create** — channel + inline web UI (~400-500 lines) |
| `src/config.ts` | **Edit** — add WEB_CHAT_PORT, WEB_CHAT_ENABLED |
| `src/index.ts` | **Edit** — register webchat channel |
| `package.json` | **Edit** — add `ws` + `@types/ws` |

## Verification
1. `npm install && npm run build` — compiles clean
2. Set `WEB_CHAT_ENABLED=true` in `.env`
3. `npm run dev` — server starts, logs "Web chat listening on port 3420"
4. Open `http://localhost:3420` — chat UI loads, dark/light mode works
5. Send a message — appears instantly (optimistic), triggers agent container
6. Agent response streams back into web UI with markdown rendering
7. Test on mobile viewport — keyboard doesn't break layout, input stays visible
8. Kill server, restart — WebSocket reconnects automatically
