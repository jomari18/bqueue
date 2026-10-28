import { announcement, type QueueCalledEvent } from "@bq/shared";

export type AnnouncerDeps = {
  playChime: () => Promise<void>;
  speak: (text: string, voice: SpeechSynthesisVoice | null, lang: string) => Promise<void>;
  voices: () => SpeechSynthesisVoice[];
};

/**
 * The TV's voice (spec 10): every call is the chime, then the sentence, queued so two calls never overlap.
 * Without a Filipino voice on the TV it speaks English; the Filipino sentence stays on screen.
 */
export function createAnnouncer(deps: AnnouncerDeps) {
  const announced = new Set<number>();
  let chain = Promise.resolve();

  function line(ev: QueueCalledEvent, lang: "en" | "fil") {
    const voices = deps.voices();
    if (lang === "fil") {
      const fil = voices.find((v) => /^(fil|tl)/i.test(v.lang));
      if (fil) return { text: announcement(ev.code, ev.counterName, "fil"), voice: fil, lang: "fil-PH" };
    }
    const en = voices.find((v) => /^en/i.test(v.lang)) ?? null;
    return { text: announcement(ev.code, ev.counterName, "en"), voice: en, lang: "en-PH" };
  }

  return {
    announce(ev: QueueCalledEvent, lang: "en" | "fil"): void {
      if (announced.has(ev.version)) return;
      announced.add(ev.version);
      chain = chain.then(async () => {
        // A chime the browser refuses, or speech that fails, must not stop the next call.
        await deps.playChime().catch(() => undefined);
        const { text, voice, lang: speechLang } = line(ev, lang);
        await deps.speak(text, voice, speechLang).catch(() => undefined);
      });
    },
  };
}

/** The real chime and speechSynthesis, each resolving when it has finished. */
export const browserDeps: AnnouncerDeps = {
  playChime: () =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio("/sounds/chime.wav");
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("chime failed"));
      audio.play().catch(reject);
    }),
  speak: (text, voice, lang) =>
    new Promise<void>((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if (voice) u.voice = voice;
      u.rate = 0.9;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    }),
  voices: () => (typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices()),
};
