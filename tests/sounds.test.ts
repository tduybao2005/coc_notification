import { readFileSync } from 'node:fs';

test.each(['voice', 'voice-en', 'ting'])('%s.wav is 16-bit mono PCM under 150 KB', (name) => {
  const wav = readFileSync(`public/sounds/${name}.wav`);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.readUInt16LE(20)).toBe(1); // PCM
  expect(wav.readUInt16LE(22)).toBe(1); // mono
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.length).toBeLessThanOrEqual(150 * 1024);
});
