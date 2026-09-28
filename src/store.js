// © 2026 Mathew. All rights reserved.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

const tokenPath = join(config.root, 'tokens.json');

export function loadTokens() {
  if (!existsSync(tokenPath)) return null;
  try {
    return JSON.parse(readFileSync(tokenPath, 'utf8'));
  } catch {
    return null;
  }
}

export function saveTokens(tokens) {
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
}

export function hasTokens() {
  return loadTokens() !== null;
}
