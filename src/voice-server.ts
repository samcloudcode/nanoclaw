import http from 'node:http';

import {
  VOICE_CHAT_JID,
  VOICE_ENDPOINT_PORT,
  VOICE_SENDER_NAME,
} from './config.js';
import { storeChatMetadata, storeMessage } from './db.js';
import { GroupQueue } from './group-queue.js';
import { logger } from './logger.js';
import { findChannel } from './router.js';
import { transcribeBuffer } from './transcription.js';
import { Channel, RegisteredGroup } from './types.js';

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB

export interface VoiceServerDeps {
  channels: Channel[];
  queue: GroupQueue;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export function startVoiceServer(deps: VoiceServerDeps): void {
  if (!VOICE_CHAT_JID) {
    logger.info('Voice endpoint disabled (VOICE_CHAT_JID not set)');
    return;
  }

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/voice') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Collect body
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        res.writeHead(413);
        res.end('Too large');
        return;
      }
      chunks.push(chunk);
    }

    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length === 0) {
      res.writeHead(400);
      res.end('Empty body');
      return;
    }

    res.writeHead(202);
    res.end('Accepted');

    // Process async — don't block the response
    handleVoice(audioBuffer, deps).catch((err) =>
      logger.error({ err }, 'Voice endpoint processing error'),
    );
  });

  server.listen(VOICE_ENDPOINT_PORT, '127.0.0.1', () => {
    logger.info({ port: VOICE_ENDPOINT_PORT }, 'Voice endpoint listening');
  });
}

async function handleVoice(
  audioBuffer: Buffer,
  deps: VoiceServerDeps,
): Promise<void> {
  const chatJid = VOICE_CHAT_JID;

  const channel = findChannel(deps.channels, chatJid);
  if (!channel) {
    logger.error({ chatJid }, 'Voice: no channel for configured JID');
    return;
  }

  const group = deps.registeredGroups()[chatJid];
  if (!group) {
    logger.error({ chatJid }, 'Voice: JID is not a registered group');
    return;
  }

  // Transcribe
  const transcript = await transcribeBuffer(
    audioBuffer,
    'voice.wav',
    'audio/wav',
  );
  const text = transcript || '[transcription failed]';

  // Echo to Telegram so user sees what was transcribed
  await channel.sendMessage(chatJid, `Audio received: "${text}" — on it!`);

  // Store as user message so the agent processes it
  const timestamp = new Date().toISOString();
  storeChatMetadata(chatJid, timestamp);
  storeMessage({
    id: `voice-${Date.now()}`,
    chat_jid: chatJid,
    sender: 'voice-hotkey',
    sender_name: VOICE_SENDER_NAME,
    content: text,
    timestamp,
    is_from_me: false,
    is_bot_message: false,
  });

  // Wake the agent
  deps.queue.enqueueMessageCheck(chatJid);

  logger.info({ chatJid, length: text.length }, 'Voice message injected');
}
