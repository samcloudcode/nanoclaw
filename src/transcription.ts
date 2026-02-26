import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TranscriptionConfig {
  provider: string;
  openai?: {
    apiKey: string;
    model: string;
  };
  enabled: boolean;
  fallbackMessage: string;
}

function loadConfig(): TranscriptionConfig {
  const configPath = path.join(__dirname, '../.transcription.config.json');
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (err) {
    console.error('Failed to load transcription config:', err);
    return {
      provider: 'openai',
      enabled: false,
      fallbackMessage: '[Voice Message - transcription unavailable]',
    };
  }
}

async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  config: TranscriptionConfig,
  filename = 'voice.ogg',
  mimeType = 'audio/ogg',
): Promise<string | null> {
  if (!config.openai?.apiKey || config.openai.apiKey === '') {
    console.warn('OpenAI API key not configured');
    return null;
  }

  const maxRetries = 3;
  const openaiModule = await import('openai');
  const OpenAI = openaiModule.default;
  const toFile = openaiModule.toFile;

  const openai = new OpenAI({
    apiKey: config.openai.apiKey,
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const file = await toFile(audioBuffer, filename, {
        type: mimeType,
      });

      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: config.openai.model || 'gpt-4o-transcribe',
        response_format: 'text',
        language: 'en',
        prompt: 'British English speaker. Use UK English spellings: colour, favourite, organise, realise, centre, defence, etc.',
      });

      // When response_format is 'text', the API returns a plain string
      return transcription as unknown as string;
    } catch (err) {
      const isNetworkError = err instanceof TypeError && (err as any).message?.includes('fetch failed');
      const label = isNetworkError ? 'Network error' : 'API error';
      if (attempt < maxRetries) {
        const delay = Math.min(2 ** attempt * 500, 8000) + Math.random() * 500;
        console.warn(`OpenAI transcription ${label} (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`OpenAI transcription failed after ${maxRetries} attempts (${label}):`, err);
        return null;
      }
    }
  }

  return null;
}

/**
 * Transcribe an audio buffer using the configured provider.
 * Channel-agnostic — works with any audio source.
 */
export async function transcribeBuffer(
  audioBuffer: Buffer,
  filename = 'voice.ogg',
  mimeType = 'audio/ogg',
): Promise<string | null> {
  const config = loadConfig();

  if (!config.enabled) {
    return config.fallbackMessage;
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return config.fallbackMessage;
  }

  let transcript: string | null = null;

  switch (config.provider) {
    case 'openai':
      transcript = await transcribeWithOpenAI(audioBuffer, config, filename, mimeType);
      break;
    default:
      console.error(`Unknown transcription provider: ${config.provider}`);
      return config.fallbackMessage;
  }

  return transcript ? transcript.trim() : config.fallbackMessage;
}

export async function transcribeAudioMessage(
  msg: WAMessage,
  sock: WASocket,
): Promise<string | null> {
  const config = loadConfig();

  if (!config.enabled) {
    console.log('Transcription disabled in config');
    return config.fallbackMessage;
  }

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as any,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      console.error('Failed to download audio message');
      return config.fallbackMessage;
    }

    console.log(`Downloaded audio message: ${buffer.length} bytes`);

    let transcript: string | null = null;

    switch (config.provider) {
      case 'openai':
        transcript = await transcribeWithOpenAI(buffer, config);
        break;
      default:
        console.error(`Unknown transcription provider: ${config.provider}`);
        return config.fallbackMessage;
    }

    if (!transcript) {
      return config.fallbackMessage;
    }

    return transcript.trim();
  } catch (err) {
    console.error('Transcription error:', err);
    return config.fallbackMessage;
  }
}

export function isVoiceMessage(msg: WAMessage): boolean {
  return msg.message?.audioMessage?.ptt === true;
}
