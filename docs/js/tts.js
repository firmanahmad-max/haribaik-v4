// tts.js — voice affirmation via Web Speech Synthesis API.

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeak() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/**
 * Bacakan beberapa bagian teks secara berurutan.
 * @param {{text:string, lang?:string}[]} parts
 * @param {(speaking:boolean)=>void} [onState]
 */
export function speak(parts, onState) {
  if (!ttsSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel(); // hentikan yang sedang berjalan

  const queue = parts.filter((p) => p && p.text);
  if (!queue.length) return false;

  let i = 0;
  const next = () => {
    if (i >= queue.length) {
      onState?.(false);
      return;
    }
    const p = queue[i++];
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = p.lang || 'id-ID';
    u.rate = 0.96;
    u.onend = next;
    u.onerror = () => onState?.(false);
    synth.speak(u);
  };
  onState?.(true);
  next();
  return true;
}
