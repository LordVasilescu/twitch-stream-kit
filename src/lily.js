// © 2026 Mathew. All rights reserved.
import { existsSync, readFileSync, watchFile } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { synthesize } from './tts.js';

const lilyPath = join(config.root, 'lily.json');
let persona = { events: {}, idle: [], fallbackReplies: [] };

function reload() {
  if (!existsSync(lilyPath)) return;
  try {
    persona = JSON.parse(readFileSync(lilyPath, 'utf8'));
    console.log('[lily] persona loaded');
  } catch (e) {
    console.error('[lily] lily.json parse error:', e.message);
  }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (line, vars) => line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function startLily({ broadcast, say }) {
  reload();
  watchFile(lilyPath, { interval: 2000 }, reload); // hot-reload persona edits while live

  const history = []; // rolling chat memory for the Claude brain

  // Synthesize and push to the overlay; Lily "speaks" through the browser source.
  async function speak(text) {
    if (!text) return;
    const audio = await synthesize(text);
    broadcast({ kind: 'speak', text, audio });
  }

  async function onAlert(a) {
    const lines = persona.events?.[a.kind];
    if (lines?.length) await speak(fill(pick(lines), a));
  }

  // Lily answers `!lily <msg>` always, plus any message containing "lily" if enabled.
  function questionFor(text) {
    const cmd = config.botPrefix + 'lily';
    if (text.toLowerCase().startsWith(cmd)) return text.slice(cmd.length).trim() || 'say hi';
    if (persona.replyToMentions && /\blily\b/i.test(text)) return text;
    return null;
  }

  async function onChat(msg) {
    const q = questionFor(msg.text.trim());
    if (q == null) return;
    const reply = await think(msg.user, q);
    if (!reply) return;
    say(reply).catch((e) => console.error('[lily] chat send failed:', e.message));
    await speak(reply);
  }

  async function think(user, text) {
    if (!config.anthropicKey) {
      return persona.fallbackReplies?.length ? fill(pick(persona.fallbackReplies), { user }) : null;
    }
    history.push({ role: 'user', content: `${user}: ${text}` });
    while (history.length > 16) history.shift();
    while (history.length && history[0].role !== 'user') history.shift();
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.lilyModel,
          max_tokens: 300,
          system: persona.systemPrompt ?? 'You are Lily, a friendly AI stream host. Reply in one short sentence.',
          messages: history,
        }),
      });
      if (!res.ok) {
        console.error(`[lily] claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
        history.pop();
        return persona.fallbackReplies?.length ? fill(pick(persona.fallbackReplies), { user }) : null;
      }
      const data = await res.json();
      let reply = data.content?.find((b) => b.type === 'text')?.text?.trim() ?? '';
      if (reply.length > 450) reply = reply.slice(0, 447) + '...'; // Twitch chat cap is 500
      history.push({ role: 'assistant', content: reply });
      return reply;
    } catch (e) {
      console.error('[lily] claude request failed:', e.message);
      history.pop();
      return null;
    }
  }

  if (config.lilyIdleMinutes > 0) {
    setInterval(() => {
      if (persona.idle?.length) speak(pick(persona.idle));
    }, config.lilyIdleMinutes * 60_000);
  }

  return { onAlert, onChat, speak };
}
