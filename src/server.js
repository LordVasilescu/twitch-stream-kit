// © 2026 Mathew. All rights reserved.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { config, assertConfig } from './config.js';
import { authorizeUrl, exchangeCode } from './auth.js';
import { hasTokens } from './store.js';
import { startEventSub } from './eventsub.js';
import { startChatbot, say } from './chatbot.js';
import { startLily } from './lily.js';
import { ttsDir } from './tts.js';

const overlayDir = join(config.root, 'overlay');
const sseClients = new Set();

// Push an alert object to every connected overlay.
function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(line);
  console.log('[alert]', payload.kind, payload.user ?? '');
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

let chatbot = null;
// Lily works pre-auth (overlay + TTS are local); chat replies need tokens.
const lily = startLily({
  broadcast,
  say: (text) => (hasTokens() ? say(text) : Promise.resolve()),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${config.port}`);

  // ── OAuth ──────────────────────────────────────────────
  if (url.pathname === '/auth') {
    res.writeHead(302, { Location: authorizeUrl() });
    return res.end();
  }
  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Missing code. Try /auth again.');
      return;
    }
    try {
      const t = await exchangeCode(code);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<body style="background:#0a0a12;color:#0ff;font-family:monospace;padding:40px">
        <h2>✅ Authorized as ${t.login}</h2>
        <p>You can close this tab. StreamKit is now live.</p></body>`);
      bootLive();
    } catch (e) {
      res.writeHead(500).end(`Auth failed: ${e.message}`);
    }
    return;
  }

  // ── SSE stream for the overlay ─────────────────────────
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── TTS audio files for the overlay ────────────────────
  if (url.pathname.startsWith('/tts/')) {
    const file = join(ttsDir, url.pathname.slice(5));
    if (existsSync(file) && file.startsWith(ttsDir)) {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      return res.end(data);
    }
    return res.writeHead(404).end('Not found');
  }

  // ── Test alert: /test?kind=sub&user=Neo  or  /test?kind=speak&text=hello ──
  if (url.pathname === '/test') {
    const kind = url.searchParams.get('kind') ?? 'follow';
    if (kind === 'speak') {
      const text = url.searchParams.get('text') ?? 'Systems online. Lily is on the grid.';
      lily.speak(text);
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('speaking');
      return;
    }
    const samples = {
      follow: { kind: 'follow', user: 'NeoRunner' },
      sub: { kind: 'sub', user: 'NeoRunner', tier: 'Tier 1' },
      resub: { kind: 'resub', user: 'NeoRunner', tier: 'Tier 1', months: 6, message: 'love the stream!' },
      cheer: { kind: 'cheer', user: 'NeoRunner', bits: 500, message: 'pog' },
      raid: { kind: 'raid', user: 'BigStreamer', viewers: 42 },
    };
    const sample = samples[kind] ?? samples.follow;
    broadcast(sample);
    lily.onAlert(sample);
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`fired ${kind}`);
    return;
  }

  // ── Static overlay files ───────────────────────────────
  // Strip only the '/overlay/' directory prefix — a bare replace(/^\/overlay/)
  // also mangles '/overlay.js' into '.js' and 404s the overlay script.
  let pathname = url.pathname === '/' || url.pathname === '/overlay' ? '/index.html' : url.pathname.replace(/^\/overlay\//, '/');
  const file = join(overlayDir, pathname);
  if (existsSync(file) && file.startsWith(overlayDir)) {
    const data = await readFile(file);
    // no-store: overlay files change during development; stale JS hides the avatar
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(data);
  }

  res.writeHead(404).end('Not found');
});

function bootLive() {
  if (!hasTokens()) return;
  if (server.__live) return;
  server.__live = true;
  chatbot = startChatbot();
  startEventSub({
    onAlert: (a) => {
      broadcast(a);
      lily.onAlert(a);
    },
    onChat: (msg) => {
      chatbot?.handle(msg);
      lily.onChat(msg);
    },
  });
  console.log('[server] live — alerts + chatbot + Lily running');
}

server.listen(config.port, () => {
  console.log(`\n⚡ TwitchStreamKit on http://localhost:${config.port}`);
  console.log(`   Overlay URL for OBS:  http://localhost:${config.port}/overlay`);
  if (!assertConfig()) return;
  if (hasTokens()) {
    bootLive();
  } else {
    console.log(`\n   → Not authorized yet. Open this in your browser to connect Twitch:`);
    console.log(`     http://localhost:${config.port}/auth\n`);
  }
});
