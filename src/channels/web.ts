import fs from 'fs';
import http from 'node:http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';

import { ASSISTANT_NAME, GROUPS_DIR, WEB_PORT } from '../config.js';
import { ActivityEvent } from '../container-runner.js';
import { getRecentMessages, storeMessage } from '../db.js';
import { GroupQueue } from '../group-queue.js';
import { logger } from '../logger.js';
import { transcribeBuffer } from '../transcription.js';
import {
  Channel,
  NewMessage,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

const MAX_VOICE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const STATIC_FILES: Record<string, string> = {
  '/manifest.json': 'application/manifest+json',
  '/icon.svg': 'image/svg+xml',
  '/sw.js': 'application/javascript',
};
const WS_PING_INTERVAL = 30_000;
const WEB_GROUP_NAME = 'Web';
const WEB_GROUP_FOLDER = 'web';
const WEB_JID = `web:${WEB_GROUP_FOLDER}`;

export interface WebChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  queue: GroupQueue;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
}

export class WebChannel implements Channel {
  name = 'web';
  private token: string;
  private opts: WebChannelOpts;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private htmlCache: string | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(token: string, opts: WebChannelOpts) {
    this.token = token;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Auto-register the web group if not already registered
    const groups = this.opts.registeredGroups();
    if (!groups[WEB_JID]) {
      this.opts.registerGroup(WEB_JID, {
        name: WEB_GROUP_NAME,
        folder: WEB_GROUP_FOLDER,
        trigger: `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
        requiresTrigger: false,
      });
    }

    this.server = http.createServer((req, res) => this.handleHttp(req, res));

    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws, req) => this.handleWsConnection(ws, req));

    // Keepalive: ping all clients, terminate unresponsive ones
    this.pingTimer = setInterval(() => {
      for (const ws of this.clients) {
        if ((ws as any).__alive === false) {
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }
        (ws as any).__alive = false;
        ws.ping();
      }
    }, WS_PING_INTERVAL);

    return new Promise((resolve) => {
      this.server!.listen(WEB_PORT, () => {
        logger.info({ port: WEB_PORT }, 'Web channel listening');
        resolve();
      });
    });
  }

  async sendMessage(_jid: string, text: string): Promise<void> {
    const timestamp = new Date().toISOString();

    storeMessage({
      id: `web-bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chat_jid: WEB_JID,
      sender: ASSISTANT_NAME,
      sender_name: ASSISTANT_NAME,
      content: text,
      timestamp,
      is_from_me: false,
      is_bot_message: true,
    });

    this.broadcast({
      type: 'message',
      group: WEB_GROUP_FOLDER,
      sender: ASSISTANT_NAME,
      text,
      timestamp,
      isFromMe: true,
    });
  }

  isConnected(): boolean {
    return this.server?.listening === true;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('web:');
  }

  async disconnect(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    this.wss?.close();
    await new Promise<void>((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
    this.server = null;
    this.wss = null;
  }

  async setTyping(_jid: string, isTyping: boolean): Promise<void> {
    this.broadcast({ type: 'typing', group: WEB_GROUP_FOLDER, isTyping });
  }

  broadcastActivity(_jid: string, event: ActivityEvent): void {
    const { type: _, ...rest } = event;
    this.broadcast({ type: 'activity', group: WEB_GROUP_FOLDER, ...rest });
  }

  // --- Private ---

  private broadcast(data: Record<string, unknown>): void {
    const frame = JSON.stringify(data);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame);
      }
    }
  }

  private handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    const url = req.url?.split('?')[0];

    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      this.serveHtml(res);
      return;
    }

    if (req.method === 'GET' && url && STATIC_FILES[url]) {
      this.serveStatic(res, url);
      return;
    }

    if (req.method === 'POST' && url === '/api/voice') {
      this.handleVoice(req, res);
      return;
    }

    if (req.method === 'POST' && url === '/api/upload') {
      this.handleUpload(req, res);
      return;
    }

    if (req.method === 'GET' && url?.startsWith('/media/')) {
      this.serveMedia(req, res, url);
      return;
    }

    // Let WebSocket upgrade through; 404 everything else
    res.writeHead(404);
    res.end('Not found');
  }

  private serveHtml(res: http.ServerResponse): void {
    try {
      const htmlPath = path.resolve(process.cwd(), 'web', 'index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end('web/index.html not found');
    }
  }

  private serveStatic(res: http.ServerResponse, urlPath: string): void {
    const contentType = STATIC_FILES[urlPath];
    if (!contentType) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const filePath = path.resolve(process.cwd(), 'web', urlPath.slice(1));
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private checkAuth(req: http.IncomingMessage): boolean {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7) === this.token;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    return url.searchParams.get('token') === this.token;
  }

  private handleWsConnection(ws: WebSocket, req: http.IncomingMessage): void {
    if (!this.checkAuth(req)) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    this.clients.add(ws);
    (ws as any).__alive = true;
    ws.on('pong', () => { (ws as any).__alive = true; });
    logger.info('Web client connected');

    // Send message history (includes bot messages, reversed to chronological)
    const messages = getRecentMessages(WEB_JID, 50).reverse();
    ws.send(
      JSON.stringify({
        type: 'history',
        group: WEB_GROUP_FOLDER,
        messages: messages.map((m) => ({
          sender: m.sender_name,
          text: m.content,
          timestamp: m.timestamp,
          isFromMe: Boolean(m.is_from_me) || Boolean(m.is_bot_message),
        })),
      }),
    );

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message' && typeof msg.text === 'string') {
          this.handleInboundMessage(msg.text.trim());
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      logger.info('Web client disconnected');
    });
  }

  private handleInboundMessage(text: string): void {
    if (!text) return;

    const timestamp = new Date().toISOString();
    const message: NewMessage = {
      id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chat_jid: WEB_JID,
      sender: 'web-user',
      sender_name: 'User',
      content: text,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    };

    this.opts.onChatMetadata(WEB_JID, timestamp, WEB_GROUP_NAME, 'web', false);
    this.opts.onMessage(WEB_JID, message);

    // Echo to all clients so multi-tab works
    this.broadcast({
      type: 'message',
      group: WEB_GROUP_FOLDER,
      sender: 'User',
      text,
      timestamp,
      isFromMe: false,
    });

    // Immediate processing — don't wait for 2s poll loop
    this.opts.queue.enqueueMessageCheck(WEB_JID);
  }

  private async handleVoice(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.checkAuth(req)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_VOICE_BYTES) {
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

    // Process async
    try {
      const transcript = await transcribeBuffer(
        audioBuffer,
        'voice.webm',
        'audio/webm',
      );
      const text = transcript || '[transcription failed]';

      // Use the same path as text messages — store via onMessage callback
      const timestamp = new Date().toISOString();
      const message: NewMessage = {
        id: `web-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        chat_jid: WEB_JID,
        sender: 'web-user',
        sender_name: 'User',
        content: text,
        timestamp,
        is_from_me: false,
        is_bot_message: false,
      };

      this.opts.onChatMetadata(WEB_JID, timestamp, WEB_GROUP_NAME, 'web', false);
      this.opts.onMessage(WEB_JID, message);

      // Echo to all clients
      this.broadcast({
        type: 'message',
        group: WEB_GROUP_FOLDER,
        sender: 'User',
        text,
        timestamp,
        isFromMe: false,
      });

      this.opts.queue.enqueueMessageCheck(WEB_JID);
      logger.info({ length: text.length }, 'Web voice message injected');
    } catch (err) {
      logger.error({ err }, 'Web voice processing error');
    }
  }

  private async handleUpload(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.checkAuth(req)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    const contentType = req.headers['content-type'] || '';
    const ext = MIME_TO_EXT[contentType];
    if (!ext) {
      res.writeHead(400);
      res.end('Unsupported image type');
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_IMAGE_BYTES) {
        res.writeHead(413);
        res.end('Too large');
        return;
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      res.writeHead(400);
      res.end('Empty body');
      return;
    }

    const mediaDir = path.join(GROUPS_DIR, WEB_GROUP_FOLDER, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    fs.writeFileSync(path.join(mediaDir, filename), buffer);

    const mediaPath = `media/${filename}`;
    logger.info({ mediaPath, bytes: buffer.length }, 'Web image uploaded');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ path: mediaPath }));
  }

  private serveMedia(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: string,
  ): void {
    if (!this.checkAuth(req)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    const filename = path.basename(url.slice('/media/'.length));
    if (!filename || filename.includes('..')) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    const filePath = path.join(GROUPS_DIR, WEB_GROUP_FOLDER, 'media', filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const mime = EXT_TO_MIME[ext] || 'application/octet-stream';

    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(data);
  }
}
