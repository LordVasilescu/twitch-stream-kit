// © 2026 Mathew. All rights reserved.
const el = {
  alert: document.getElementById('alert'),
  tag: document.getElementById('tag'),
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  lily: document.getElementById('lily'),
  lilyCaption: document.getElementById('lily-caption'),
  lilyText: document.getElementById('lily-text'),
};

// Map an event payload to what shows on screen.
function render(a) {
  const map = {
    follow: { tag: 'FOLLOW', title: a.user, sub: 'jacked into the stream' },
    sub:    { tag: 'SUB',    title: a.user, sub: `subscribed — <em>${a.tier}</em>` },
    resub:  { tag: 'RESUB',  title: a.user, sub: `${a.months} months — <em>${a.tier}</em>${a.message ? ` · "${a.message}"` : ''}` },
    cheer:  { tag: 'BITS',   title: a.user, sub: `cheered <em>${a.bits}</em> bits${a.message ? ` · "${a.message}"` : ''}` },
    raid:   { tag: 'RAID',   title: a.user, sub: `incoming raid — <em>${a.viewers}</em> runners` },
  };
  return map[a.kind] ?? { tag: a.kind?.toUpperCase() ?? 'ALERT', title: a.user ?? '', sub: '' };
}

// Short synth sting so alerts are audible without bundling audio files.
let audioCtx;
function blip(kind) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const base = kind === 'raid' || kind === 'cheer' ? 660 : 520;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(base, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(base * 1.6, audioCtx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.5);
  } catch {}
}

const queue = [];
let busy = false;

function enqueue(a) {
  queue.push(a);
  if (!busy) next();
}

async function next() {
  const a = queue.shift();
  if (!a) { busy = false; return; }
  busy = true;

  const v = render(a);
  el.alert.dataset.kind = a.kind;
  el.tag.textContent = v.tag;
  el.title.textContent = v.title;
  el.title.dataset.text = v.title;
  el.subtitle.innerHTML = v.sub;

  blip(a.kind);
  el.alert.classList.add('show');
  await wait(6000);
  el.alert.classList.remove('show');
  await wait(600);
  next();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Lily avatar sprites: drop idle.png (+ optional talk.png) in overlay/lily/.
// If idle.png loads we show the big avatar and hide the hologram. talk.png is
// the open-mouth frame, swapped in sync with her voice.
const avatar = {
  box: document.getElementById('lily-avatar'),
  idle: document.getElementById('lily-img-idle'),
  talk: document.getElementById('lily-img-talk'),
  vidIdle: document.getElementById('lily-vid-idle'),
  vidTalk: document.getElementById('lily-vid-talk'),
  active: false,
  hasTalk: false,     // talk.png exists → amplitude lip flap
  videoMode: false,   // idle.webm exists → animated loops instead of stills
  hasVidTalk: false,  // talk.webm exists → talking loop while speaking
};
function activateAvatar() {
  avatar.active = true;
  avatar.box.hidden = false;
  el.lily.classList.add('has-avatar');
}
avatar.idle.onload = activateAvatar;
avatar.talk.onload = () => { avatar.hasTalk = true; };
// Images may already be loaded from cache before these handlers attach.
if (avatar.idle.complete && avatar.idle.naturalWidth > 0) activateAvatar();
if (avatar.talk.complete && avatar.talk.naturalWidth > 0) avatar.hasTalk = true;

// Video loops trump stills when present.
avatar.vidIdle.addEventListener('loadeddata', () => {
  avatar.videoMode = true;
  avatar.idle.hidden = true;
  avatar.talk.hidden = true;
  avatar.vidIdle.hidden = false;
  activateAvatar();
});
avatar.vidTalk.addEventListener('loadeddata', () => { avatar.hasVidTalk = true; });

// Whole-utterance switch between idle/talk video loops.
function setTalkingVideo(on) {
  if (!avatar.videoMode || !avatar.hasVidTalk) return;
  avatar.vidTalk.hidden = !on;
  avatar.vidIdle.hidden = on;
  if (on) { avatar.vidTalk.currentTime = 0; avatar.vidTalk.play().catch(() => {}); }
  else avatar.vidTalk.pause();
}

// /overlay?preview — dark background so you can see the overlay outside OBS.
if (new URLSearchParams(location.search).has('preview')) {
  document.body.style.background = '#14141f';
}

function setMouth(open) {
  if (!avatar.active || !avatar.hasTalk || avatar.videoMode) return;
  avatar.talk.hidden = !open;
  avatar.idle.hidden = open;
}

// Drive the mouth from real audio amplitude (WebAudio analyser).
let audioCtxLily;
function lipSync(audio) {
  try {
    audioCtxLily ??= new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtxLily.createMediaElementSource(audio);
    const an = audioCtxLily.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    an.connect(audioCtxLily.destination);
    const buf = new Uint8Array(an.fftSize);
    let raf;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      setMouth(Math.sqrt(sum / buf.length) > 0.02);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); setMouth(false); };
  } catch {
    return startMouthFlap(); // analyser unavailable → timer-based flap
  }
}

// Fallback flap when there's no audio to analyse (captions-only mode).
function startMouthFlap() {
  const t = setInterval(() => setMouth(avatar.talk.hidden), 130 + Math.random() * 60);
  return () => { clearInterval(t); setMouth(false); };
}

// ── Lily speech: audio + avatar/hologram + caption, queued independently of alerts ──
const speakQueue = [];
let speaking = false;

function enqueueSpeak(a) {
  speakQueue.push(a);
  if (!speaking) nextSpeak();
}

function playAudio(src, text) {
  // No audio (TTS off/failed) → hold the caption for a reading-time estimate.
  const fallbackMs = Math.min(1500 + text.length * 55, 14000);
  return new Promise((resolve) => {
    let stopMouth = null;
    const done = () => { stopMouth?.(); resolve(); };
    if (!src) {
      stopMouth = startMouthFlap();
      return setTimeout(done, fallbackMs);
    }
    const audio = new Audio(src);
    audio.crossOrigin = 'anonymous';
    audio.onended = done;
    audio.onerror = () => setTimeout(done, fallbackMs);
    audio.play()
      .then(() => { stopMouth = lipSync(audio); })
      .catch(() => { stopMouth = startMouthFlap(); setTimeout(done, fallbackMs); });
  });
}

async function nextSpeak() {
  const a = speakQueue.shift();
  if (!a) { speaking = false; return; }
  speaking = true;

  el.lily.classList.add('talking');
  setTalkingVideo(true);
  el.lilyText.textContent = a.text;
  el.lilyCaption.classList.add('show');

  await playAudio(a.audio, a.text);

  el.lily.classList.remove('talking');
  setTalkingVideo(false);
  el.lilyCaption.classList.remove('show');
  await wait(400);
  nextSpeak();
}

const es = new EventSource('/events');
es.onmessage = (e) => {
  try {
    const a = JSON.parse(e.data);
    if (a.kind === 'speak') enqueueSpeak(a);
    else enqueue(a);
  } catch {}
};
es.onerror = () => {}; // EventSource auto-reconnects
