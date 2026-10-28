// Writes B.Queue's own sounds (spec 10): the TV chime and the resident alert, as small 16-bit mono WAV files made
// from sine tones with a short fade, so no third-party audio is used.
//
//   node tools/make-sounds.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const RATE = 22_050;

function tones(parts) {
  const samples = [];
  for (const { hz, seconds, gap = 0 } of parts) {
    const n = Math.round(seconds * RATE);
    const fade = Math.round(0.02 * RATE);
    for (let i = 0; i < n; i++) {
      const envelope = Math.min(1, i / fade, (n - i) / fade) * Math.exp((-2.5 * i) / n);
      samples.push(Math.sin((2 * Math.PI * hz * i) / RATE) * envelope * 0.6);
    }
    for (let i = 0; i < Math.round(gap * RATE); i++) samples.push(0);
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const out = new URL("../apps/web/public/sounds/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("chime.wav", out), wav(tones([{ hz: 880, seconds: 0.35 }, { hz: 660, seconds: 0.6 }])));
writeFileSync(new URL("alert.wav", out), wav(tones([{ hz: 1000, seconds: 0.15, gap: 0.08 }, { hz: 1000, seconds: 0.15 }])));
console.log("Wrote chime.wav and alert.wav");
