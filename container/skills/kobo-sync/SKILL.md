---
name: kobo-sync
description: |
  Convert an Obsidian note to epub and upload to Dropbox for Kobo e-reader.
  Trigger when user asks to send/sync a note to their Kobo.
---

# Kobo Sync

Send an Obsidian note to the user's Kobo e-reader via Dropbox.

## When to use
User asks to "send to Kobo", "sync to Kobo", "put X on my Kobo", or "send X to my e-reader".

## How to use

1. Find the note in the vault at `/workspace/extra/vault/`. Use Glob or Grep to locate it if the user gives a partial name.
2. Run the sync script:

```bash
node /home/node/.claude/skills/kobo-sync/kobo-sync.mjs --file "/workspace/extra/vault/path/to/note.md"
```

### Options
- `--file <path>` — **(required)** Path to the markdown file
- `--title <title>` — Override the epub title (defaults to filename)
- `--folder <path>` — Dropbox destination folder (defaults to `/Apps/Rakuten Kobo`)
- `--format epub|pdf` — Output format (defaults to `epub`)

## Notes
- The script uses `pandoc` for conversion and the Dropbox API for upload
- `DROPBOX_TOKEN` must be set in `.env` on the host
- Kobo syncs from Dropbox automatically when connected to wifi
