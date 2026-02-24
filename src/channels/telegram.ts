import fs from 'fs';
import path from 'path';

import { Bot } from 'grammy';

import { ASSISTANT_NAME, GROUPS_DIR, TELEGRAM_ALLOWED_USERS, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import { transcribeBuffer } from '../transcription.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

function writeHostTrace(groupFolder: string, event: Record<string, unknown>): void {
  try {
    const traceDir = path.join(GROUPS_DIR, groupFolder, 'traces');
    fs.mkdirSync(traceDir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(path.join(traceDir, 'host-events.jsonl'), line);
  } catch { /* best-effort */ }
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);

    // Command to get chat ID (useful for registration)
    // Left open to all users — needed for initial setup and only returns public info
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status — restricted to registered chats
    this.bot.command('ping', (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      if (!this.opts.registeredGroups()[chatJid]) return;
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Sender allowlist: when configured, only specified Telegram user IDs can interact
      if (TELEGRAM_ALLOWED_USERS.length > 0 && !TELEGRAM_ALLOWED_USERS.includes(ctx.from?.id ?? 0)) {
        logger.debug({ sender: ctx.from?.id, chatJid }, 'Telegram sender not in allowlist');
        return;
      }

      // Store chat metadata only for registered chats
      this.opts.onChatMetadata(chatJid, timestamp, chatName);

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      // Sender allowlist check for non-text messages too
      if (TELEGRAM_ALLOWED_USERS.length > 0 && !TELEGRAM_ALLOWED_USERS.includes(ctx.from?.id ?? 0)) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      this.opts.onChatMetadata(chatJid, timestamp);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      if (TELEGRAM_ALLOWED_USERS.length > 0 && !TELEGRAM_ALLOWED_USERS.includes(ctx.from?.id ?? 0)) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id?.toString() || 'Unknown';
      const msgId = ctx.message.message_id.toString();
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      // Try to download and save the photo so the agent can view it
      let content = `[Photo]${caption}`;
      try {
        // Get the largest photo size (last in array)
        const photos = ctx.message.photo;
        const largest = photos[photos.length - 1];
        const file = await ctx.api.getFile(largest.file_id);
        const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
        const response = await fetch(url);

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const mediaDir = path.join(GROUPS_DIR, group.folder, 'media');
          fs.mkdirSync(mediaDir, { recursive: true });
          const filename = `${msgId}.jpg`;
          fs.writeFileSync(path.join(mediaDir, filename), buffer);
          content = `[Photo: media/${filename}]${caption}`;
          logger.info({ chatJid, filename }, 'Saved Telegram photo');
        }
      } catch (err) {
        logger.warn({ chatJid, err }, 'Failed to download Telegram photo, using placeholder');
      }

      this.opts.onChatMetadata(chatJid, timestamp);
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    this.bot.on('message:voice', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      if (TELEGRAM_ALLOWED_USERS.length > 0 && !TELEGRAM_ALLOWED_USERS.includes(ctx.from?.id ?? 0)) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id?.toString() || 'Unknown';

      let content = '[Voice message]';
      const startMs = Date.now();
      try {
        // Retry file download with exponential backoff
        let buffer: Buffer | null = null;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const file = await ctx.getFile();
            const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
            const response = await fetch(url);
            if (response.ok) {
              buffer = Buffer.from(await response.arrayBuffer());
              break;
            }
            logger.warn({ chatJid, status: response.status, attempt }, 'Telegram voice download failed');
          } catch (downloadErr) {
            logger.warn({ chatJid, attempt, err: downloadErr }, 'Telegram voice download error');
          }
          if (attempt < maxRetries) {
            const delay = Math.min(2 ** attempt * 500, 8000) + Math.random() * 500;
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        if (buffer && buffer.length > 0) {
          const transcript = await transcribeBuffer(buffer);
          if (transcript) {
            content = `[Voice: ${transcript}]`;
            logger.info({ chatJid, length: content.length }, 'Transcribed Telegram voice message');
            writeHostTrace(group.folder, {
              event: 'transcription.success',
              chatJid,
              durationMs: Date.now() - startMs,
              textLength: content.length,
            });
          } else {
            writeHostTrace(group.folder, {
              event: 'transcription.fallback',
              chatJid,
              durationMs: Date.now() - startMs,
            });
          }
        } else {
          logger.error({ chatJid }, 'Failed to download Telegram voice file after retries');
          writeHostTrace(group.folder, {
            event: 'transcription.download_failed',
            chatJid,
            durationMs: Date.now() - startMs,
          });
        }
      } catch (err) {
        logger.error({ chatJid, err }, 'Failed to transcribe Telegram voice message');
        writeHostTrace(group.folder, {
          event: 'transcription.error',
          chatJid,
          durationMs: Date.now() - startMs,
          error: String(err),
        });
      }

      this.opts.onChatMetadata(chatJid, timestamp);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    });
    this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Clear any stale polling session from a previous instance
    try {
      await this.bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch (err) {
      logger.warn('Failed to clear Telegram webhook: ' + String(err));
    }

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        logger.error('Telegram bot start timed out after 30s');
        resolve(); // don't block startup
      }, 30_000);

      this.bot!.start({
        onStart: (botInfo) => {
          clearTimeout(timeout);
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      }).catch((err: Error) => {
        clearTimeout(timeout);
        logger.error({ err: err.message }, 'Telegram bot.start() failed');
        resolve(); // don't block startup
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      const chunks =
        text.length <= MAX_LENGTH
          ? [text]
          : Array.from({ length: Math.ceil(text.length / MAX_LENGTH) }, (_, i) =>
              text.slice(i * MAX_LENGTH, (i + 1) * MAX_LENGTH),
            );

      for (const chunk of chunks) {
        try {
          await this.bot.api.sendMessage(numericId, chunk, {
            parse_mode: 'Markdown',
          });
        } catch {
          // Markdown parse failed — send as plain text
          await this.bot.api.sendMessage(numericId, chunk);
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}
