// © 2026 Mathew. All rights reserved.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  console.error('\n[config] No .env file found. Copy .env.example to .env and fill it in.\n');
}

export const config = {
  root,
  clientId: process.env.TWITCH_CLIENT_ID ?? '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
  channel: (process.env.TWITCH_CHANNEL ?? '').toLowerCase().trim(),
  port: Number(process.env.PORT ?? 3000),
  botPrefix: process.env.BOT_PREFIX ?? '!',
  // Lily — the AI streamer persona
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  lilyModel: process.env.LILY_MODEL ?? 'claude-opus-4-8',
  lilyTts: (process.env.LILY_TTS ?? 'auto').toLowerCase(),
  lilyVoice: process.env.LILY_VOICE ?? 'en-US-AvaNeural',
  lilyIdleMinutes: Number(process.env.LILY_IDLE_MINUTES ?? 8),
};

export const redirectUri = `http://localhost:${config.port}/auth/callback`;

// Scopes needed for each alert type + chat.
export const scopes = [
  'moderator:read:followers',   // channel.follow
  'channel:read:subscriptions', // channel.subscribe / subscription.message
  'bits:read',                  // channel.cheer
  'user:read:chat',             // read chat (EventSub)
  'user:write:chat',            // send chat (Helix)
  'user:bot',                   // act as a chat bot
  'channel:bot',                // bot in this channel
];

export function assertConfig() {
  const missing = [];
  if (!config.clientId) missing.push('TWITCH_CLIENT_ID');
  if (!config.clientSecret) missing.push('TWITCH_CLIENT_SECRET');
  if (!config.channel) missing.push('TWITCH_CHANNEL');
  if (missing.length) {
    console.error(`[config] Missing required .env values: ${missing.join(', ')}`);
    return false;
  }
  return true;
}
