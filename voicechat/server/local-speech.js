import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCRIPT = `
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$english = $speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
if ($english) { $speaker.SelectVoice($english.VoiceInfo.Name) }
$speaker.Rate = [Math]::Max(-5, [Math]::Min(5, [int]$env:PRACTICE_TTS_RATE))
$stream = New-Object IO.MemoryStream
$speaker.SetOutputToWaveStream($stream)
$speaker.Speak($env:PRACTICE_TTS_TEXT)
$speaker.Dispose()
[Convert]::ToBase64String($stream.ToArray())
`;
const ENCODED_SCRIPT = Buffer.from(SCRIPT, 'utf16le').toString('base64');

export function sapiRate(playbackRate) {
  const value = Number(playbackRate);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-5, Math.min(5, Math.round((value - 1) * 7)));
}

export async function synthesizeLocalEnglish(text, playbackRate = 1) {
  const normalized = String(text || '').trim().slice(0, 1800);
  if (!normalized) throw new Error('Practice text is required.');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED_SCRIPT], {
    env: { ...process.env, PRACTICE_TTS_TEXT: normalized, PRACTICE_TTS_RATE: String(sapiRate(playbackRate)) },
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const audio = stdout.trim();
  if (!audio || Buffer.from(audio, 'base64').subarray(0, 4).toString('ascii') !== 'RIFF') throw new Error('Local English voice did not return valid WAV audio.');
  return { audio, mimeType: 'audio/wav' };
}
