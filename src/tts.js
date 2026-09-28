// © 2026 Mathew. All rights reserved.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export const ttsDir = join(config.root, 'tts_cache');
mkdirSync(ttsDir, { recursive: true });

// Engine resolution is lazy + memoized so the server can boot instantly.
// 'edge' = edge-tts CLI (pip install edge-tts) — free Microsoft neural voices.
// 'sapi' = Windows built-in System.Speech via PowerShell — always works, robotic.
let enginePromise = null;

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, ...extraEnv } });
    let err = '';
    p.stderr?.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ ok: false, err: e.message }));
    p.on('close', (code) => resolve({ ok: code === 0, err }));
  });
}

async function detectEngine() {
  const want = config.lilyTts; // auto | edge | sapi | off
  if (want === 'off') return null;
  if (want !== 'sapi') {
    const probe = await run('edge-tts', ['--help']);
    if (probe.ok) {
      console.log('[tts] engine: edge-tts (neural)');
      return 'edge';
    }
    if (want === 'edge') {
      console.error('[tts] LILY_TTS=edge but edge-tts not found. Install with: pip install edge-tts');
      return null;
    }
  }
  if (process.platform === 'win32') {
    console.log('[tts] engine: Windows SAPI (fallback — pip install edge-tts for a better voice)');
    return 'sapi';
  }
  console.warn('[tts] no TTS engine available — Lily will be captions-only');
  return null;
}

function edgeSpeak(text, outPath) {
  return run('edge-tts', ['--voice', config.lilyVoice, '--text', text, '--write-media', outPath]);
}

function sapiSpeak(text, outPath) {
  // Text/paths go via env vars so no escaping issues; script is base64 UTF-16LE.
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try { $s.SelectVoice($env:LILY_TTS_VOICE) } catch {}',
    '$s.SetOutputToWaveFile($env:LILY_TTS_OUT)',
    '$s.Speak($env:LILY_TTS_TEXT)',
    '$s.Dispose()',
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    LILY_TTS_TEXT: text,
    LILY_TTS_OUT: outPath,
    LILY_TTS_VOICE: config.lilyVoice,
  });
}

// Returns a URL path like /tts/abc123.mp3, or null if synthesis is unavailable.
export async function synthesize(text) {
  const engine = await (enginePromise ??= detectEngine());
  if (!engine) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const ext = engine === 'edge' ? 'mp3' : 'wav';
  const id = createHash('sha1').update(`${engine}|${config.lilyVoice}|${clean}`).digest('hex').slice(0, 16);
  const file = `${id}.${ext}`;
  const outPath = join(ttsDir, file);

  if (!existsSync(outPath)) {
    const r = engine === 'edge' ? await edgeSpeak(clean, outPath) : await sapiSpeak(clean, outPath);
    if (!r.ok || !existsSync(outPath)) {
      console.error('[tts] synthesis failed:', (r.err || 'no output file').slice(0, 300));
      return null;
    }
  }
  return `/tts/${file}`;
}
