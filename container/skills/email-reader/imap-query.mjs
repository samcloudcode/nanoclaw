#!/usr/bin/env node

/**
 * IMAP query script for ProtonBridge — read-only email access.
 *
 * Usage:
 *   node imap-query.mjs list --last 10
 *   node imap-query.mjs list --last 5 --folder "Folders/Work"
 *   node imap-query.mjs read --uid 1234
 *   node imap-query.mjs search --query "invoice"
 *   node imap-query.mjs unread
 *   node imap-query.mjs folders
 *
 * Environment:
 *   PROTON_EMAIL    — ProtonBridge login email
 *   PROTON_PASSWORD — ProtonBridge per-client password
 *   IMAP_HOST       — Override host (default: 127.0.0.1)
 *   IMAP_PORT       — Override port (default: 1143)
 */

import { createRequire } from 'node:module';
const require = createRequire('/app/package.json');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

// Read credentials from the original process environment only.
// Reject inline env var overrides by comparing against /proc/self/environ.
import { readFileSync } from 'node:fs';
const _origEnv = {};
try {
  const raw = readFileSync('/proc/self/environ', 'utf-8');
  for (const entry of raw.split('\0')) {
    const eq = entry.indexOf('=');
    if (eq > 0) _origEnv[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
} catch { /* non-Linux fallback: trust process.env */ }
function _safeEnv(key) {
  const orig = _origEnv[key];
  const current = process.env[key];
  if (orig !== undefined && current !== orig) {
    console.error(`Error: ${key} was overridden. This is not allowed.`);
    process.exit(1);
  }
  return current;
}

const EMAIL = _safeEnv('PROTON_EMAIL');
const PASSWORD = _safeEnv('PROTON_PASSWORD');
const HOST = _safeEnv('IMAP_HOST') || '127.0.0.1';
const PORT = parseInt(_safeEnv('IMAP_PORT') || '1143', 10);

// --- Helpers ---

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateWords(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

function formatAddress(addr) {
  if (!addr || !addr[0]) return '(unknown)';
  const a = addr[0];
  if (a.name) return `${a.name} <${a.address}>`;
  return a.address || '(unknown)';
}

function formatDate(date) {
  if (!date) return '(no date)';
  return new Date(date).toISOString().replace('T', ' ').slice(0, 19);
}

function makeClient() {
  return new ImapFlow({
    host: HOST,
    port: PORT,
    secure: false,
    auth: { user: EMAIL, pass: PASSWORD },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

async function withClient(fn) {
  if (!EMAIL || !PASSWORD) {
    console.error('Error: PROTON_EMAIL or PROTON_PASSWORD not set. Add to .env and restart.');
    process.exit(1);
  }

  const client = makeClient();
  try {
    await client.connect();
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error(`Error: Could not connect to ProtonBridge at ${HOST}:${PORT} — ensure ProtonBridge is running.`);
    } else if (err.responseStatus === 'NO' || err.message?.includes('Authentication')) {
      console.error('Error: IMAP authentication failed — check PROTON_EMAIL and PROTON_PASSWORD.');
    } else {
      console.error(`Error connecting to IMAP: ${err.message}`);
    }
    process.exit(1);
  }

  try {
    await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function getBodyText(client, uid) {
  try {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) return '(could not retrieve message body)';

    const parsed = await simpleParser(msg.source);
    return parsed.text || (parsed.html ? stripHtml(parsed.html) : '') || '';
  } catch {
    return '(could not retrieve message body)';
  }
}

// --- Commands ---

async function cmdList(opts) {
  const folder = opts.folder || 'INBOX';
  const last = parseInt(opts.last || '10', 10);

  await withClient(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = client.mailbox.exists;
      if (total === 0) {
        console.log(`${folder} is empty.`);
        return;
      }

      const start = Math.max(1, total - last + 1);
      const range = `${start}:${total}`;

      // Collect metadata first — exhaust the fetch generator before any other IMAP calls
      const messages = [];
      for await (const msg of client.fetch(range, {
        uid: true,
        envelope: true,
      })) {
        messages.push(msg);
      }

      // Newest first
      messages.reverse();

      console.log(`## ${folder} — ${messages.length} of ${total} messages\n`);

      // Now fetch bodies separately (safe — fetch generator is exhausted)
      for (const msg of messages) {
        const from = formatAddress(msg.envelope.from);
        const subject = msg.envelope.subject || '(no subject)';
        const date = formatDate(msg.envelope.date);

        const body = await getBodyText(client, msg.uid);
        const snippet = truncateWords(body, 25);

        console.log(`- **UID ${msg.uid}** | ${date}`);
        console.log(`  From: ${from}`);
        console.log(`  Subject: ${subject}`);
        if (snippet && snippet !== '(could not retrieve message body)') {
          console.log(`  > ${snippet}`);
        }
        console.log('');
      }
    } finally {
      lock.release();
    }
  });
}

async function cmdRead(opts) {
  if (!opts.uid) {
    console.error('Usage: read --uid <number>');
    process.exit(1);
  }
  const uid = parseInt(opts.uid, 10);
  const folder = opts.folder || 'INBOX';

  await withClient(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      let msg;
      try {
        msg = await client.fetchOne(String(uid), {
          uid: true,
          envelope: true,
          source: true,
        }, { uid: true });
      } catch {
        console.error(`Error: Message UID ${uid} not found in ${folder}.`);
        process.exit(1);
      }

      const env = msg.envelope;
      console.log(`## Email — UID ${uid}\n`);
      console.log(`**From:** ${formatAddress(env.from)}`);
      console.log(`**To:** ${formatAddress(env.to)}`);
      console.log(`**Subject:** ${env.subject || '(no subject)'}`);
      console.log(`**Date:** ${formatDate(env.date)}`);

      // Threading headers from parsed message
      const parsed = await simpleParser(msg.source);
      const messageId = parsed.messageId;
      const inReplyTo = parsed.inReplyTo;
      const references = parsed.references;
      if (messageId) console.log(`**Message-ID:** ${messageId}`);
      if (inReplyTo) console.log(`**In-Reply-To:** ${inReplyTo}`);
      if (references) console.log(`**References:** ${Array.isArray(references) ? references.join(' ') : references}`);

      console.log('\n---\n');

      const body = parsed.text || (parsed.html ? stripHtml(parsed.html) : '(no body)');
      console.log(body);
    } finally {
      lock.release();
    }
  });
}

async function cmdSearch(opts) {
  if (!opts.query) {
    console.error('Usage: search --query <text>');
    process.exit(1);
  }
  const folder = opts.folder || 'INBOX';
  const query = opts.query;

  await withClient(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = await client.search({
        or: [{ subject: query }, { from: query }],
      }, { uid: true });

      if (uids.length === 0) {
        console.log(`No messages matching "${query}" in ${folder}.`);
        return;
      }

      // Take last 20 (newest)
      const selected = uids.slice(-20).reverse();
      console.log(`## Search: "${query}" — ${uids.length} results (showing ${selected.length})\n`);

      for (const uid of selected) {
        let msg;
        try {
          msg = await client.fetchOne(String(uid), { uid: true, envelope: true }, { uid: true });
        } catch { continue; }

        const from = formatAddress(msg.envelope.from);
        const subject = msg.envelope.subject || '(no subject)';
        const date = formatDate(msg.envelope.date);

        const body = await getBodyText(client, uid);
        const snippet = truncateWords(body, 25);

        console.log(`- **UID ${uid}** | ${date}`);
        console.log(`  From: ${from}`);
        console.log(`  Subject: ${subject}`);
        if (snippet && snippet !== '(could not retrieve message body)') {
          console.log(`  > ${snippet}`);
        }
        console.log('');
      }
    } finally {
      lock.release();
    }
  });
}

async function cmdUnread(opts) {
  const folder = opts.folder || 'INBOX';

  await withClient(async (client) => {
    const status = await client.status(folder, { unseen: true, messages: true });
    console.log(`${folder}: ${status.unseen} unread of ${status.messages} total`);
  });
}

async function cmdFolders() {
  await withClient(async (client) => {
    const folders = await client.list();
    console.log('## Mail Folders\n');
    for (const folder of folders) {
      const flags = folder.flags?.size > 0 ? ` (${[...folder.flags].join(', ')})` : '';
      console.log(`- ${folder.path}${flags}`);
    }
  });
}

// --- CLI ---

const args = process.argv.slice(2);
let command = '';
const opts = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--last' && args[i + 1]) { opts.last = args[++i]; continue; }
  if (args[i] === '--uid' && args[i + 1]) { opts.uid = args[++i]; continue; }
  if (args[i] === '--query' && args[i + 1]) { opts.query = args[++i]; continue; }
  if (args[i] === '--folder' && args[i + 1]) { opts.folder = args[++i]; continue; }
  if (!args[i].startsWith('-')) command = args[i];
}

switch (command) {
  case 'list': await cmdList(opts); break;
  case 'read': await cmdRead(opts); break;
  case 'search': await cmdSearch(opts); break;
  case 'unread': await cmdUnread(opts); break;
  case 'folders': await cmdFolders(); break;
  default:
    console.log('Commands: list, read, search, unread, folders');
    console.log('Options: --last N, --uid N, --query TEXT, --folder NAME');
}
