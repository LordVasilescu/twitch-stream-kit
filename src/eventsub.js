// © 2026 Mathew. All rights reserved.
import { config } from './config.js';
import { helix } from './auth.js';
import { loadTokens } from './store.js';

const WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

// Subscriptions to create once we have a session. condition() receives the
// authorized user id (broadcaster == bot, single-user setup).
function subscriptionPlan(uid) {
  return [
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: uid, moderator_user_id: uid } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: uid } },
    { type: 'channel.subscription.message', version: '1', condition: { broadcaster_user_id: uid } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: uid } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: uid } },
    { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: uid, user_id: uid } },
  ];
}

export function startEventSub({ onAlert, onChat }) {
  let ws;
  let reconnectUrl = null;
  let backoff = 1000;

  function connect(url = WS_URL) {
    ws = new WebSocket(url);

    ws.addEventListener('open', () => console.log('[eventsub] socket open'));

    ws.addEventListener('message', async (ev) => {
      const msg = JSON.parse(ev.data);
      const type = msg.metadata?.message_type;

      if (type === 'session_welcome') {
        backoff = 1000;
        const sessionId = msg.payload.session.id;
        // If this is a reconnect handshake, subscriptions carry over; skip re-subscribe.
        if (!reconnectUrl) await createSubscriptions(sessionId);
        reconnectUrl = null;
        console.log('[eventsub] session ready');
      } else if (type === 'session_reconnect') {
        reconnectUrl = msg.payload.session.reconnect_url;
        console.log('[eventsub] reconnect requested');
        try { ws.close(); } catch {}
        connect(reconnectUrl);
      } else if (type === 'notification') {
        handleNotification(msg.metadata.subscription_type, msg.payload.event, { onAlert, onChat });
      } else if (type === 'revocation') {
        console.warn('[eventsub] subscription revoked:', msg.payload.subscription.type);
      }
    });

    ws.addEventListener('close', () => {
      const url2 = reconnectUrl ?? WS_URL;
      console.warn(`[eventsub] socket closed, reconnecting in ${backoff}ms`);
      setTimeout(() => connect(url2), backoff);
      backoff = Math.min(backoff * 2, 30000);
    });

    ws.addEventListener('error', (e) => console.error('[eventsub] error', e.message ?? e));
  }

  async function createSubscriptions(sessionId) {
    const uid = loadTokens().userId;
    for (const sub of subscriptionPlan(uid)) {
      const res = await helix('eventsub/subscriptions', {
        method: 'POST',
        body: { ...sub, transport: { method: 'websocket', session_id: sessionId } },
      });
      if (!res.ok) {
        console.error(`[eventsub] subscribe ${sub.type} failed: ${res.status} ${await res.text()}`);
      } else {
        console.log(`[eventsub] subscribed ${sub.type}`);
      }
    }
  }

  connect();
}

function handleNotification(type, event, { onAlert, onChat }) {
  switch (type) {
    case 'channel.follow':
      onAlert({ kind: 'follow', user: event.user_name });
      break;
    case 'channel.subscribe':
      // Skip gifted here — the recipient event fires; gifter handled below.
      if (event.is_gift) break;
      onAlert({ kind: 'sub', user: event.user_name, tier: tierName(event.tier) });
      break;
    case 'channel.subscription.message':
      onAlert({
        kind: 'resub',
        user: event.user_name,
        tier: tierName(event.tier),
        months: event.cumulative_months,
        message: event.message?.text ?? '',
      });
      break;
    case 'channel.cheer':
      onAlert({
        kind: 'cheer',
        user: event.is_anonymous ? 'Anonymous' : event.user_name,
        bits: event.bits,
        message: event.message ?? '',
      });
      break;
    case 'channel.raid':
      onAlert({ kind: 'raid', user: event.from_broadcaster_user_name, viewers: event.viewers });
      break;
    case 'channel.chat.message':
      onChat({
        user: event.chatter_user_name,
        userId: event.chatter_user_id,
        text: event.message?.text ?? '',
        badges: event.badges ?? [],
      });
      break;
  }
}

function tierName(tier) {
  if (tier === '2000') return 'Tier 2';
  if (tier === '3000') return 'Tier 3';
  return 'Tier 1';
}
