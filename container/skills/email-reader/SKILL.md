---
name: email-reader
description: Read email from ProtonMail inbox via local ProtonBridge IMAP. Use when the user asks to check email, read messages, search inbox, find a specific email, or check for unread mail. Read-only access — cannot send or delete.
allowed-tools: Bash(node:*)
---

# Email Reader

**What This Skill Does:**
- Lists recent inbox messages (sender, subject, date, snippet)
- Reads a specific message by UID (full text + threading headers)
- Searches inbox by keyword (subject or sender)
- Checks unread count
- Lists available mail folders

**Read-only.** Cannot send, delete, or modify emails.

---

## Operations Reference

### List recent messages
```bash
node /home/node/.claude/skills/email-reader/imap-query.mjs list --last 10
```
Returns: UID, from, subject, date, text snippet for each message.

### Read a specific message
```bash
node /home/node/.claude/skills/email-reader/imap-query.mjs read --uid 1234
```
Returns: full headers (from, to, subject, date), threading info (Message-ID, In-Reply-To), and plain text body.

### Search messages
```bash
node /home/node/.claude/skills/email-reader/imap-query.mjs search --query "invoice"
```
Searches subject and sender fields. Returns same format as `list` (up to 20 results).

### Check unread count
```bash
node /home/node/.claude/skills/email-reader/imap-query.mjs unread
```
Fast check — doesn't fetch any messages.

### List folders
```bash
node /home/node/.claude/skills/email-reader/imap-query.mjs folders
```
Shows available IMAP folders (ProtonBridge maps Proton labels to IMAP folders).

### Read from a specific folder
```bash
node /home/node/.claude/skills/email-reader/imap-query.mjs list --last 5 --folder "Folders/Work"
```
Default folder is `INBOX`. Use `folders` command to discover available folders.

---

## Usage Guidelines

- Always run `list` or `unread` first to orient before reading individual messages
- Quote subjects and senders accurately from the output — don't paraphrase
- UIDs are stable identifiers — use them to reference specific messages
- If the user asks to reply or send email, explain this skill is read-only
- Large emails (newsletters, HTML-heavy) are automatically truncated to keep responses manageable
