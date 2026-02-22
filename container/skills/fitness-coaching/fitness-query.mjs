#!/usr/bin/env node

/**
 * Fitness data query script — parses YAML front matter from fitness markdown files.
 * Used by the fitness-coaching skill to load context without reading every file.
 *
 * Usage:
 *   node fitness-query.mjs --dir /workspace/extra/vault/health/fitness overview
 *   node fitness-query.mjs --dir /workspace/extra/vault/health/fitness logs --last 10
 *   node fitness-query.mjs --dir /workspace/extra/vault/health/fitness logs --exercise bench
 *   node fitness-query.mjs --dir /workspace/extra/vault/health/fitness logs --since 2026-01-01
 *   node fitness-query.mjs --dir /workspace/extra/vault/health/fitness metrics
 *   node fitness-query.mjs --dir /workspace/extra/vault/health/fitness progress --exercise squat
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

// --- Front matter parser (no dependencies) ---

function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (!m) continue;
    let val = m[2].trim();
    // Parse arrays: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim());
    }
    meta[m[1]] = val;
  }
  return { meta, body: match[2] };
}

function readFilesWithMeta(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse() // newest first
    .map(f => {
      const content = readFileSync(join(dir, f), 'utf-8');
      const { meta, body } = parseFrontMatter(content);
      return { file: f, meta, body: body.trim() };
    });
}

function truncate(text, words = 50) {
  const w = text.split(/\s+/);
  return w.length <= words ? text : w.slice(0, words).join(' ') + '...';
}

// --- Commands ---

function overview(dir) {
  const lines = [];

  // Program summary
  const progPath = join(dir, 'program.md');
  if (existsSync(progPath)) {
    const content = readFileSync(progPath, 'utf-8');
    lines.push('## Current Program');
    lines.push(truncate(content, 80));
    lines.push('');
  }

  // Current week (most recent)
  const weeks = readFilesWithMeta(join(dir, 'weeks'));
  if (weeks.length > 0) {
    lines.push('## Current Week');
    lines.push(`**${weeks[0].file.replace('.md', '')}**`);
    lines.push(truncate(weeks[0].body, 60));
    lines.push('');
  }

  // Recent logs
  const logs = readFilesWithMeta(join(dir, 'logs')).slice(0, 7);
  if (logs.length > 0) {
    lines.push('## Recent Logs');
    for (const log of logs) {
      const d = log.meta.date || log.file.replace('.md', '');
      const t = log.meta.type || '';
      const dur = log.meta.duration || '';
      const ex = Array.isArray(log.meta.exercises) ? log.meta.exercises.join(', ') : '';
      const rpe = log.meta.rpe_avg ? `RPE ${log.meta.rpe_avg}` : '';
      const detail = [t, dur, ex, rpe].filter(Boolean).join(' | ');
      lines.push(`- **${d}**: ${detail}`);
    }
    lines.push('');
  }

  // Recent plans
  const plans = readFilesWithMeta(join(dir, 'plans')).slice(0, 3);
  if (plans.length > 0) {
    lines.push('## Upcoming Plans');
    for (const plan of plans) {
      const d = plan.meta.date || plan.file.replace('.md', '');
      const t = plan.meta.type || '';
      lines.push(`- **${d}** (${t}): ${truncate(plan.body, 30)}`);
    }
    lines.push('');
  }

  // Metrics (last 5)
  const metricsPath = join(dir, 'metrics.md');
  if (existsSync(metricsPath)) {
    const content = readFileSync(metricsPath, 'utf-8');
    const metricLines = content.split('\n').filter(l => l.match(/^\d{4}-/));
    if (metricLines.length > 0) {
      lines.push('## Recent Metrics');
      for (const ml of metricLines.slice(-5)) {
        lines.push(`- ${ml.trim()}`);
      }
      lines.push('');
    }
  }

  console.log(lines.join('\n') || 'No fitness data found. Run a bootstrap first.');
}

function queryLogs(dir, opts) {
  let logs = readFilesWithMeta(join(dir, 'logs'));

  if (opts.exercise) {
    const ex = opts.exercise.toLowerCase();
    logs = logs.filter(l => {
      const exercises = Array.isArray(l.meta.exercises) ? l.meta.exercises : [];
      return exercises.some(e => e.toLowerCase().includes(ex)) ||
        l.body.toLowerCase().includes(ex);
    });
  }

  if (opts.since) {
    logs = logs.filter(l => (l.meta.date || '') >= opts.since);
  }

  if (opts.last) {
    logs = logs.slice(0, parseInt(opts.last, 10));
  }

  if (logs.length === 0) {
    console.log('No matching logs found.');
    return;
  }

  for (const log of logs) {
    const d = log.meta.date || log.file.replace('.md', '');
    const t = log.meta.type || '';
    const dur = log.meta.duration || '';
    console.log(`### ${d} — ${t} (${dur})`);
    console.log(log.body);
    console.log('');
  }
}

function metrics(dir) {
  const metricsPath = join(dir, 'metrics.md');
  if (!existsSync(metricsPath)) {
    console.log('No metrics file found.');
    return;
  }
  console.log(readFileSync(metricsPath, 'utf-8'));
}

function progress(dir, opts) {
  if (!opts.exercise) {
    console.log('Usage: progress --exercise <name>');
    return;
  }

  const ex = opts.exercise.toLowerCase();
  const logs = readFilesWithMeta(join(dir, 'logs')).reverse(); // chronological

  const matches = [];
  for (const log of logs) {
    // Search body for exercise-specific lines (e.g., "Bench 5x5 @ 185")
    const bodyLines = log.body.split('\n');
    for (const line of bodyLines) {
      if (line.toLowerCase().includes(ex)) {
        matches.push({ date: log.meta.date || log.file.replace('.md', ''), line: line.trim() });
      }
    }
  }

  if (matches.length === 0) {
    console.log(`No entries found for "${opts.exercise}".`);
    return;
  }

  console.log(`## ${opts.exercise} Progression\n`);
  for (const m of matches) {
    console.log(`- **${m.date}**: ${m.line}`);
  }
}

// --- CLI ---

const args = process.argv.slice(2);
let dir = '/workspace/extra/vault/health/fitness';
let command = '';
const opts = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; continue; }
  if (args[i] === '--last' && args[i + 1]) { opts.last = args[++i]; continue; }
  if (args[i] === '--exercise' && args[i + 1]) { opts.exercise = args[++i]; continue; }
  if (args[i] === '--since' && args[i + 1]) { opts.since = args[++i]; continue; }
  if (!args[i].startsWith('-')) command = args[i];
}

switch (command) {
  case 'overview': overview(dir); break;
  case 'logs': queryLogs(dir, opts); break;
  case 'metrics': metrics(dir); break;
  case 'progress': progress(dir, opts); break;
  default:
    console.log('Commands: overview, logs, metrics, progress');
    console.log('Options: --dir <path>, --last <N>, --exercise <name>, --since <date>');
}
