#!/usr/bin/env node
/**
 * kobo-sync.mjs — Convert a markdown note to epub and upload to Dropbox
 *
 * Usage:
 *   node kobo-sync.mjs --file /path/to/note.md
 *   node kobo-sync.mjs --file /path/to/note.md --title "My Note" --folder "/Kobo"
 *
 * Requires: pandoc, DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET env vars
 */

import { execSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === '--title' && argv[i + 1]) args.title = argv[++i];
    else if (argv[i] === '--folder' && argv[i + 1]) args.folder = argv[++i];
    else if (argv[i] === '--format' && argv[i + 1]) args.format = argv[++i];
  }
  return args;
}

async function getAccessToken() {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;

  if (!refreshToken || !appKey || !appSecret) {
    console.error('Error: DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, and DROPBOX_APP_SECRET must be set');
    process.exit(1);
  }

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Token refresh failed (${res.status}): ${body}`);
    process.exit(1);
  }

  const { access_token } = await res.json();
  return access_token;
}

const args = parseArgs(process.argv);

if (!args.file) {
  console.error('Usage: node kobo-sync.mjs --file <path> [--title <title>] [--folder <dropbox-folder>] [--format epub|pdf]');
  process.exit(1);
}

const format = args.format || 'epub';
const srcName = basename(args.file, '.md');
const title = args.title || srcName;
const dropboxFolder = (args.folder || '/Apps/Rakuten Kobo').replace(/\/$/, '');
const outFile = join(tmpdir(), `${srcName}.${format}`);

// Convert markdown → epub/pdf via pandoc
try {
  execSync(
    `pandoc "${args.file}" -o "${outFile}" --metadata title="${title.replace(/"/g, '\\"')}"`,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
} catch (err) {
  console.error(`pandoc failed: ${err.stderr?.toString() || err.message}`);
  process.exit(1);
}

// Get fresh access token and upload
const token = await getAccessToken();
const fileData = readFileSync(outFile);
const dropboxPath = `${dropboxFolder}/${srcName}.${format}`;

try {
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: dropboxPath,
        mode: 'overwrite',
        autorename: false,
      }),
      'Content-Type': 'application/octet-stream',
    },
    body: fileData,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Dropbox upload failed (${res.status}): ${body}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`Uploaded to Dropbox: ${result.path_display} (${result.size} bytes)`);
} finally {
  try { unlinkSync(outFile); } catch {}
}
