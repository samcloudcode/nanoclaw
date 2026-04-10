#!/usr/bin/env node
/**
 * clean-vtt.mjs — Clean VTT subtitle files into plain text transcripts
 *
 * Usage:
 *   node clean-vtt.mjs <file.vtt>
 *   cat file.vtt | node clean-vtt.mjs
 *
 * Handles YouTube's auto-sub VTT format where each cue has two lines:
 *   line 1: repeated previous text (plain)
 *   line 2: new words with <c> timestamp tags
 * Extracts only the new words from each cue and outputs clean paragraphs.
 */

import { readFileSync } from 'fs';

const input = process.argv[2]
  ? readFileSync(process.argv[2], 'utf-8')
  : readFileSync(0, 'utf-8');

// Split into cue blocks (separated by blank lines)
const blocks = input.split(/\n\n+/);

// Detect auto-sub format: if any block has <c> tags, it's YouTube auto-generated
const isAutoSub = blocks.some((b) => /<c>/.test(b));
const fragments = [];

for (const block of blocks) {
  const lines = block.trim().split('\n');

  // Skip non-cue blocks (WEBVTT header, NOTE, STYLE, etc.)
  if (!lines.some((l) => /-->/.test(l))) continue;

  // Get text lines (skip timestamp line and metadata)
  const textLines = lines.filter((l) => {
    const t = l.trim();
    return t && !/-->/.test(t) && !/^\d+$/.test(t) && !/^Kind:|^Language:/.test(t);
  });

  if (textLines.length === 0) continue;

  // YouTube auto-subs: lines with <c> tags contain new words.
  // Lines without tags are repeated previous text — skip them.
  const taggedLines = textLines.filter((l) => /<[^>]+>/.test(l));
  const hasTaggedContent = taggedLines.length > 0;

  let text;
  if (hasTaggedContent) {
    // Extract only tagged lines (new content), strip all tags
    text = taggedLines
      .map((l) => l.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .join(' ');
  } else {
    // No tagged lines. Could be a manual sub cue OR a YouTube echo cue
    // (zero-duration cue that just repeats previous text).
    // Detect auto-sub format: if ANY block in the file has <c> tags, treat
    // untagged blocks as echo cues and skip them.
    if (isAutoSub) continue;
    // Manual subs (no tags anywhere) — take all text lines
    text = textLines
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l)
      .join(' ');
  }

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  if (text) fragments.push(text);
}

// Join all fragments and split into paragraphs at sentence boundaries
const fullText = fragments.join(' ').replace(/\s+/g, ' ');
const sentences = fullText.match(/[^.!?]+[.!?]+\s*/g) || [fullText];

const paragraphs = [];
let para = '';

for (const sentence of sentences) {
  para += sentence;
  if (para.split(/\s+/).length >= 80) {
    paragraphs.push(para.trim());
    para = '';
  }
}
if (para.trim()) paragraphs.push(para.trim());

process.stdout.write(paragraphs.join('\n\n') + '\n');
