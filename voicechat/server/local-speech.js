import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function piperLengthScale(playbackRate) {
  const value = Number(playbackRate);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.5, Math.min(2, 1 / value));
}

export async function synthesizeLocalEnglish(text, playbackRate = 1) {
  const normalized = String(text || '').trim().slice(0, 1800);
  if (!normalized) throw new Error('Practice text is required.');
  const binary = process.env.PIPER_BIN || '';
  const model = process.env.PIPER_VOICE_EN || process.env.PIPER_VOICE || '';
  const config = process.env.PIPER_CONFIG_EN || process.env.PIPER_CONFIG || '';
  if (!binary || !model || !existsSync(binary) || !existsSync(model)) {
    throw new Error('Piper is not configured for English practice. Set PIPER_BIN and PIPER_VOICE_EN.');
  }

  const directory = mkdtempSync(join(tmpdir(), 'word-garden-piper-'));
  const output = join(directory, 'reference.wav');
  const args = ['--model', model, '--output_file', output, '--length_scale', String(piperLengthScale(playbackRate))];
  if (config && existsSync(config)) args.push('--config', config);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args);
    let stderr = '';
    let settled = false;
    const cleanup = () => rmSync(directory, { recursive: true, force: true });
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        callback();
      } finally {
        cleanup();
      }
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error('Piper timed out after 10 seconds.')));
    }, 10000);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => {
      finish(() => {
        const audio = code === 0 && existsSync(output) ? readFileSync(output) : null;
        if (!audio || audio.subarray(0, 4).toString('ascii') !== 'RIFF') {
          reject(new Error(stderr.trim() || `Piper exited with code ${code}.`));
          return;
        }
        resolve({ audio: audio.toString('base64'), mimeType: 'audio/wav' });
      });
    });
    child.stdin.end(`${normalized}\n`);
  });
}
