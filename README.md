# Twitch Stream Kit

A self-hosted Twitch toolkit that replaces third-party alert services: live alerts, a chatbot,
a transparent OBS overlay, and **Lily**, an AI co-host who reacts to events and answers chat
out loud. Everything runs locally with **zero npm dependencies** (Node 22+ built-in `fetch`,
`WebSocket`, and `process.loadEnvFile`).

## Features

- **Twitch OAuth** — authorization-code flow served locally (`/auth`), tokens stored on disk and
  refreshed automatically.
- **EventSub over WebSocket** — subscribes to follows, subs, resubs, bits, raids, and chat
  messages; reports any subscription that fails because of a missing scope.
- **OBS overlay** — a transparent Browser Source page fed by Server-Sent Events (`/events`) that
  animates alerts in a cyberpunk style (`overlay/style.css` is fully themeable).
- **Chatbot** — custom `!commands` and repeating timers defined in `commands.json`, hot-reloaded
  while live; `{user}` substitution and an automatic `!commands` list. Messages are sent through
  the Helix chat API.
- **Lily, the AI co-host**
  - Speaks a randomized, templated line for each alert (`lily.json`, hot-reloaded).
  - Answers `!lily <question>` (and optionally any message mentioning "lily") using the
    Claude Messages API with a rolling 16-message memory; falls back to canned lines without a key.
  - Idle chatter on a configurable interval.
  - Text-to-speech via `edge-tts` neural voices, falling back to Windows SAPI; audio is cached
    by content hash and played through the overlay so it is captured by OBS.
  - Animated avatar in the overlay with captions; supports idle/talk stills or video loops.
- **Test endpoint** — `/test?kind=follow|sub|resub|cheer|raid|speak` fires a fake event through
  the real pipeline for styling and positioning.

## Architecture

```
src/
  server.js     HTTP server: OAuth routes, SSE /events, /tts files, /test, overlay static files
  auth.js       OAuth code exchange, token storage + refresh
  eventsub.js   EventSub WebSocket client + subscriptions
  chatbot.js    commands.json commands and timers
  lily.js       AI co-host: alert reactions, chat replies (Claude API), idle lines
  tts.js        edge-tts / SAPI synthesis with on-disk cache
  config.js     .env loading + required scopes
  store.js      OAuth token persistence (tokens.json)
overlay/        OBS Browser Source (HTML/CSS/JS) + Lily avatar assets
commands.json   chat commands and timers (hot-reload)
lily.json       Lily persona, event lines, idle lines (hot-reload)
```

## Tech stack

Node.js 22 (no dependencies), Twitch Helix API + EventSub WebSocket, OAuth 2.0,
Server-Sent Events, Anthropic Claude Messages API, edge-tts / Windows SAPI, OBS Browser Source.

## Setup

1. Register an application at <https://dev.twitch.tv/console/apps> with the OAuth redirect URL
   `http://localhost:3000/auth/callback`, then copy the Client ID and a Client Secret.
2. Configure:
   ```bash
   cp .env.example .env    # fill TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_CHANNEL
   ```
   Optional: `ANTHROPIC_API_KEY` for Lily's replies, `pip install edge-tts` for a neural voice.
3. Run and authorize:
   ```bash
   npm start               # or START.bat on Windows
   ```
   Open `http://localhost:3000/auth` once and approve.
4. In OBS add a **Browser** source: URL `http://localhost:3000/overlay`, 1920x1080.
5. Try `http://localhost:3000/test?kind=follow` to preview an alert.

## License

© 2026 Mathew Vasilescu. All rights reserved. See [LICENSE](LICENSE).
