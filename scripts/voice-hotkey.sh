#!/usr/bin/env bash
# Voice hotkey: toggle recording. First press starts, second press stops and sends.
# Bind to a global hotkey (e.g. Super+V) in your desktop environment.
#
# Requires: pw-record (pipewire-utils), curl, notify-send (libnotify)
#
# Environment:
#   NANOCLAW_URL   — default http://localhost:8765
#   NANOCLAW_TOKEN — bearer token (optional, for remote use)

set -euo pipefail

NANOCLAW_URL="${NANOCLAW_URL:-http://localhost:8765}"
PID_FILE="/tmp/nanoclaw-voice.pid"
AUDIO_FILE="/tmp/nanoclaw-voice.wav"
NOTIFY_ID_FILE="/tmp/nanoclaw-voice-notify"

notify() {
  local opts=(-a "NanoClaw" -t "$2")
  # Replace previous notification if we have its ID
  if [[ -f "$NOTIFY_ID_FILE" ]]; then
    opts+=(-r "$(cat "$NOTIFY_ID_FILE")")
  fi
  # Use -p to print notification ID for replacement
  local id
  id=$(notify-send "${opts[@]}" -p "NanoClaw" "$1" 2>/dev/null) || true
  if [[ -n "$id" ]]; then
    echo "$id" > "$NOTIFY_ID_FILE"
  fi
}

if [[ -f "$PID_FILE" ]]; then
  # Stop recording
  PID=$(cat "$PID_FILE")
  kill "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  sleep 0.2

  if [[ ! -f "$AUDIO_FILE" || ! -s "$AUDIO_FILE" ]]; then
    notify "No audio recorded" 3000
    rm -f "$NOTIFY_ID_FILE"
    exit 0
  fi

  notify "Sending..." 3000

  CURL_ARGS=(-s -o /dev/null -w "%{http_code}" -X POST "$NANOCLAW_URL/voice"
    -H "Content-Type: audio/wav" --data-binary "@$AUDIO_FILE")

  if [[ -n "${NANOCLAW_TOKEN:-}" ]]; then
    CURL_ARGS+=(-H "Authorization: Bearer $NANOCLAW_TOKEN")
  fi

  HTTP_STATUS=$(curl "${CURL_ARGS[@]}")
  rm -f "$AUDIO_FILE"

  if [[ "$HTTP_STATUS" == "202" ]]; then
    notify "Voice message sent ✓" 3000
  else
    notify "Send failed (HTTP $HTTP_STATUS)" 5000
  fi
  rm -f "$NOTIFY_ID_FILE"
else
  # Start recording (16kHz mono WAV — optimal for Whisper)
  rm -f "$AUDIO_FILE"
  pw-record --format=s16 --rate=16000 --channels=1 "$AUDIO_FILE" &
  echo $! > "$PID_FILE"
  # Persistent notification (0 = stays until replaced)
  notify "🎙 Recording..." 0
fi
