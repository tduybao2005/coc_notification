// Writes public/sounds/ting.wav: a short decaying bell tone, synthesized here so it carries no licence.
// 22050 Hz, mono, 16-bit PCM, 0.6 s: a 1318.5 Hz sine plus a 2637 Hz overtone at 0.3, decaying as exp(-6t).
import { writeFileSync } from 'node:fs';

const RATE = 22050;
const SECONDS = 0.6;
const PEAK = 0.8;

const count = Math.round(RATE * SECONDS);
const raw = new Float64Array(count);
for (let i = 0; i < count; i += 1) {
  const t = i / RATE;
  raw[i] = (Math.sin(2 * Math.PI * 1318.5 * t) + 0.3 * Math.sin(2 * Math.PI * 2637 * t)) * Math.exp(-6 * t);
}
const scale = PEAK / raw.reduce((max, x) => Math.max(max, Math.abs(x)), 0);

const dataBytes = count * 2;
const wav = Buffer.alloc(44 + dataBytes);
wav.write('RIFF', 0, 'ascii');
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write('WAVE', 8, 'ascii');
wav.write('fmt ', 12, 'ascii');
wav.writeUInt32LE(16, 16); // fmt chunk size
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 2, 28); // byte rate
wav.writeUInt16LE(2, 32); // block align
wav.writeUInt16LE(16, 34); // bits per sample
wav.write('data', 36, 'ascii');
wav.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < count; i += 1) wav.writeInt16LE(Math.round(raw[i] * scale * 32767), 44 + i * 2);

writeFileSync(new URL('../public/sounds/ting.wav', import.meta.url), wav);
console.log(`wrote public/sounds/ting.wav (${wav.length} bytes)`);
