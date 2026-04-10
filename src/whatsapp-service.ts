import fs from 'fs';
import path from 'path';

import makeWASocket, {
  Browsers,
  DisconnectReason,
  WAMessage,
  WASocket,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import { ASSISTANT_NAME, GROUPS_DIR, STORE_DIR } from './config.js';
import {
  getLastGroupSync,
  setLastGroupSync,
  updateChatName,
} from './db.js';
import { logger } from './logger.js';
import { isVoiceMessage, transcribeAudioMessage } from './transcription.js';
import { OnInboundMessage, OnChatMetadata, RegisteredGroup } from './types.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function writeHostTrace(groupFolder: string, event: Record<string, unknown>): void {
  try {
    const traceDir = path.join(GROUPS_DIR, groupFolder, 'traces');
    fs.mkdirSync(traceDir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(path.join(traceDir, 'host-events.jsonl'), line);
  } catch { /* best-effort */ }
}

export interface WhatsAppServiceOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

/**
 * Background WhatsApp data service.
 * Connects to WhatsApp, stores incoming messages in the DB for querying,
 * and provides group metadata sync and history fetching.
 * NOT a channel — does not send messages or trigger agent processing.
 */
export class WhatsAppService {
  private sock!: WASocket;
  private connected = false;
  private lidToPhoneMap: Record<string, string> = {};
  private groupSyncTimerStarted = false;

  private opts: WhatsAppServiceOpts;

  constructor(opts: WhatsAppServiceOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connectInternal(resolve).catch(reject);
    });
  }

  private async connectInternal(onFirstOpen?: () => void): Promise<void> {
    const authDir = path.join(STORE_DIR, 'auth');
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const { version } = await fetchLatestWaWebVersion({}).catch((err) => {
      logger.warn({ err }, 'Failed to fetch latest WA Web version, using default');
      return { version: undefined };
    });
    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Chrome'),
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const msg =
          'WhatsApp authentication required. Run /setup in Claude Code.';
        logger.error(msg);
        // Don't exit — WhatsApp is a background service, web channel should still work
        logger.warn('WhatsApp will not be available until authenticated');
        if (onFirstOpen) {
          onFirstOpen();
          onFirstOpen = undefined;
        }
        return;
      }

      if (connection === 'close') {
        this.connected = false;
        const reason = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        logger.info({ reason, shouldReconnect }, 'WhatsApp connection closed');

        if (shouldReconnect) {
          logger.info('WhatsApp reconnecting...');
          try {
            this.sock.ev.removeAllListeners('connection.update');
            this.sock.ev.removeAllListeners('creds.update');
            this.sock.ev.removeAllListeners('messages.upsert');
          } catch { /* ignore */ }
          this.connectInternal(onFirstOpen).catch((err) => {
            logger.error({ err }, 'WhatsApp failed to reconnect, retrying in 5s');
            setTimeout(() => {
              this.connectInternal(onFirstOpen).catch((err2) => {
                logger.error({ err: err2 }, 'WhatsApp reconnection retry failed');
              });
            }, 5000);
          });
        } else {
          logger.warn('WhatsApp logged out. Run /setup to re-authenticate.');
          // Don't exit — web channel should keep running
        }
      } else if (connection === 'open') {
        this.connected = true;
        logger.info('Connected to WhatsApp (background data service)');

        // Announce availability so WhatsApp relays subsequent presence updates
        this.sock.sendPresenceUpdate('available').catch(() => {});

        // Build LID to phone mapping from auth state for self-chat translation
        if (this.sock.user) {
          const phoneUser = this.sock.user.id.split(':')[0];
          const lidUser = this.sock.user.lid?.split(':')[0];
          if (lidUser && phoneUser) {
            this.lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
            logger.debug({ lidUser, phoneUser }, 'LID to phone mapping set');
          }
        }

        // Sync group metadata on startup (respects 24h cache)
        this.syncGroupMetadata().catch((err) =>
          logger.error({ err }, 'Initial group sync failed'),
        );
        // Set up daily sync timer (only once)
        if (!this.groupSyncTimerStarted) {
          this.groupSyncTimerStarted = true;
          setInterval(() => {
            this.syncGroupMetadata().catch((err) =>
              logger.error({ err }, 'Periodic group sync failed'),
            );
          }, GROUP_SYNC_INTERVAL_MS);
        }

        // Signal first connection to caller
        if (onFirstOpen) {
          onFirstOpen();
          onFirstOpen = undefined;
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message) continue;
        const rawJid = msg.key.remoteJid;
        if (!rawJid || rawJid === 'status@broadcast') continue;

        // Translate LID JID to phone JID if applicable
        const chatJid = await this.translateJid(rawJid);

        const timestamp = new Date(
          Number(msg.messageTimestamp) * 1000,
        ).toISOString();

        // Always notify about chat metadata for group discovery
        const isGroup = chatJid.endsWith('@g.us');
        // For 1:1 chats, use pushName as the contact name (groups get names via syncGroupMetadata)
        const chatName = !isGroup && msg.pushName ? msg.pushName : undefined;
        this.opts.onChatMetadata(chatJid, timestamp, chatName, 'whatsapp', isGroup);

        // Store message content for registered groups and 1:1 chats
        const groups = this.opts.registeredGroups();
        const isRegistered = !!groups[chatJid];
        const isPersonalChat = chatJid.endsWith('@s.whatsapp.net');

        if (isRegistered || isPersonalChat) {
          logger.debug({ chatJid, messageKeys: Object.keys(msg.message || {}) }, 'Message type keys');

          let content: string;
          if (isVoiceMessage(msg)) {
            if (isRegistered) {
              const groupFolder = groups[chatJid].folder;
              const startMs = Date.now();
              try {
                const transcript = await transcribeAudioMessage(msg, this.sock);
                content = transcript ? `[Voice: ${transcript}]` : '[Voice Message - transcription unavailable]';
                logger.info({ chatJid, length: content.length }, 'Transcribed voice message');
                writeHostTrace(groupFolder, {
                  event: transcript ? 'transcription.success' : 'transcription.fallback',
                  chatJid,
                  durationMs: Date.now() - startMs,
                  textLength: content.length,
                });
              } catch (err) {
                logger.error({ err }, 'Voice transcription error');
                content = '[Voice Message - transcription failed]';
                writeHostTrace(groupFolder, {
                  event: 'transcription.error',
                  chatJid,
                  durationMs: Date.now() - startMs,
                  error: String(err),
                });
              }
            } else {
              content = '[Voice Message]';
            }
          } else {
            content =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption ||
              '';
          }

          if (!content) continue;

          const sender = msg.key.participant || msg.key.remoteJid || '';
          const senderName = msg.pushName || sender.split('@')[0];
          const fromMe = msg.key.fromMe || false;

          // Detect bot messages by content prefix
          const isBotMessage = content.startsWith(`${ASSISTANT_NAME}:`);

          this.opts.onMessage(chatJid, {
            id: msg.key.id || '',
            chat_jid: chatJid,
            sender,
            sender_name: senderName,
            content,
            timestamp,
            is_from_me: fromMe,
            is_bot_message: isBotMessage,
          });
        }
      }
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.sock?.end(undefined);
  }

  /**
   * Sync group metadata from WhatsApp.
   * Fetches all participating groups and stores their names in the database.
   */
  async syncGroupMetadata(force = false): Promise<void> {
    if (!force) {
      const lastSync = getLastGroupSync();
      if (lastSync) {
        const lastSyncTime = new Date(lastSync).getTime();
        if (Date.now() - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
          logger.debug({ lastSync }, 'Skipping group sync - synced recently');
          return;
        }
      }
    }

    try {
      logger.info('Syncing group metadata from WhatsApp...');
      const groups = await this.sock.groupFetchAllParticipating();

      let count = 0;
      for (const [jid, metadata] of Object.entries(groups)) {
        if (metadata.subject) {
          updateChatName(jid, metadata.subject);
          count++;
        }
      }

      setLastGroupSync();
      logger.info({ count }, 'Group metadata synced');
    } catch (err) {
      logger.error({ err }, 'Failed to sync group metadata');
    }
  }

  /**
   * Fetch older message history from WhatsApp servers.
   */
  async fetchOlderHistory(
    jid: string,
    anchorMsgId: string,
    anchorFromMe: boolean,
    anchorTimestampMs: number,
    count: number,
  ): Promise<WAMessage[]> {
    if (!this.connected) {
      throw new Error('Not connected to WhatsApp');
    }

    const TIMEOUT_MS = 30000;

    return new Promise<WAMessage[]>((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.sock.ev.off('messaging-history.set', handler);
          logger.warn({ jid }, 'fetchOlderHistory timed out');
          resolve([]);
        }
      }, TIMEOUT_MS);

      const handler = (data: {
        messages: WAMessage[];
        syncType?: proto.HistorySync.HistorySyncType | null;
      }) => {
        if (data.syncType !== proto.HistorySync.HistorySyncType.ON_DEMAND) return;

        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.sock.ev.off('messaging-history.set', handler);

          const filtered = data.messages.filter(
            (m) => m.key?.remoteJid === jid,
          );
          logger.info(
            { jid, total: data.messages.length, filtered: filtered.length },
            'Received on-demand history',
          );
          resolve(filtered);
        }
      };

      this.sock.ev.on('messaging-history.set', handler);

      this.sock.fetchMessageHistory(
        count,
        { remoteJid: jid, id: anchorMsgId, fromMe: anchorFromMe },
        anchorTimestampMs,
      ).catch((err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.sock.ev.off('messaging-history.set', handler);
          logger.error({ err, jid }, 'fetchMessageHistory failed');
          resolve([]);
        }
      });
    });
  }

  private async translateJid(jid: string): Promise<string> {
    if (!jid.endsWith('@lid')) return jid;
    const lidUser = jid.split('@')[0].split(':')[0];

    const cached = this.lidToPhoneMap[lidUser];
    if (cached) {
      logger.debug({ lidJid: jid, phoneJid: cached }, 'Translated LID to phone JID (cached)');
      return cached;
    }

    try {
      const pn = await this.sock.signalRepository?.lidMapping?.getPNForLID(jid);
      if (pn) {
        const phoneJid = `${pn.split('@')[0].split(':')[0]}@s.whatsapp.net`;
        this.lidToPhoneMap[lidUser] = phoneJid;
        logger.info({ lidJid: jid, phoneJid }, 'Translated LID to phone JID (signalRepository)');
        return phoneJid;
      }
    } catch (err) {
      logger.debug({ err, jid }, 'Failed to resolve LID via signalRepository');
    }

    return jid;
  }
}
