// © 2026 Mathew. All rights reserved.
import { existsSync, readFileSync, watchFile } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { helix } from './auth.js';
import { loadTokens } from './store.js';

const commandsPath = join(config.root, 'commands.json');
let book = { commands: {}, timers: [] };

function reload() {
  if (!existsSync(commandsPath)) return;
  try {
    book = JSON.parse(readFileSync(commandsPath, 'utf8'));
    console.log(`[chatbot] loaded ${Object.keys(book.commands ?? {}).length} commands`);
  } catch (e) {
    console.error('[chatbot] commands.json parse error:', e.message);
  }
}

export async function say(text) {
  const tokens = loadTokens();
  const res = await helix('chat/messages', {
    method: 'POST',
    body: { broadcaster_id: tokens.userId, sender_id: tokens.userId, message: text },
  });
  if (!res.ok) console.error(`[chatbot] send failed: ${res.status} ${await res.text()}`);
}

export function startChatbot() {
  reload();
  watchFile(commandsPath, { interval: 2000 }, reload); // hot-reload edits while live

  for (const t of book.timers ?? []) {
    if (t.message && t.minutes) setInterval(() => say(t.message), t.minutes * 60_000);
  }

  return {
    handle(msg) {
      const text = msg.text.trim();
      if (!text.startsWith(config.botPrefix)) return;
      const name = text.slice(config.botPrefix.length).split(/\s+/)[0].toLowerCase();

      if (name === 'commands') {
        const list = Object.keys(book.commands).map((c) => config.botPrefix + c).join(' ');
        return say(`Commands: ${list || '(none yet)'}`);
      }
      const reply = book.commands?.[name];
      if (reply) say(reply.replaceAll('{user}', msg.user));
    },
  };
}
