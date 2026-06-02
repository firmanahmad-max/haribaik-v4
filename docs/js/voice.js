// voice.js — input suara via Web Speech API (Bahasa Indonesia), dengan fallback.

export function initVoice(btn, textarea, toast) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.style.display = 'none'; // tidak didukung → sembunyikan
    return;
  }

  const recog = new SR();
  recog.lang = 'id-ID';
  recog.interimResults = true;
  recog.continuous = false;

  let recording = false;
  let baseText = '';

  btn.addEventListener('click', () => {
    if (recording) {
      recog.stop();
      return;
    }
    baseText = textarea.value ? textarea.value + ' ' : '';
    try {
      recog.start();
    } catch {
      /* start ganda diabaikan */
    }
  });

  recog.onstart = () => {
    recording = true;
    btn.classList.add('recording');
  };
  recog.onend = () => {
    recording = false;
    btn.classList.remove('recording');
  };
  recog.onerror = (e) => {
    recording = false;
    btn.classList.remove('recording');
    if (e.error === 'not-allowed') toast?.('Izin mikrofon ditolak');
  };
  recog.onresult = (e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
    textarea.value = baseText + transcript;
    textarea.dispatchEvent(new Event('input'));
  };
}
