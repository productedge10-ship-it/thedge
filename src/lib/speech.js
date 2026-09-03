/* ==================================================================
   Голос у текст.

   Робимо на вбудованому в браузер розпізнаванні (Web Speech API), а
   не на зовнішньому сервісі. Причин дві, і обидві важать більше за
   точність:

   · нічого не треба піднімати й нічим не треба платити — ані ключа,
     ані сервера, ані ліміту на хвилини;
   · голос не їде на чужий бекенд. Нотатка може бути про що завгодно,
     і відправляти її вміст третій стороні заради зручності — надто
     висока ціна.

   Плата за це — залежність від браузера: у Chrome і Edge працює,
   у Safari частково, у Firefox немає. Тому все, що тут є, вміє
   чесно сказати «не підтримується», а запис голосу як такий працює
   всюди — він іде через MediaRecorder і від розпізнавання не
   залежить.
================================================================== */

export const SPEECH_LANGS = [
  { id: 'uk-UA', short: 'UA', name: 'Українська' },
  { id: 'en-US', short: 'EN', name: 'English' },
  { id: 'ru-RU', short: 'RU', name: 'Русский' },
];

const Recognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const speechSupported = () => !!Recognition;
export const recordSupported = () => typeof window !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && typeof window.MediaRecorder !== 'undefined';

/* Пам'ятаємо мову між сеансами: людина диктує тією самою, якою
   говорить, і питати про це щоразу — зайвий крок. */
const LANG_KEY = 'edge.voice.lang';
export const savedLang = () => {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return SPEECH_LANGS.some((l) => l.id === v) ? v : 'uk-UA';
  } catch { return 'uk-UA'; }
};
export const rememberLang = (id) => {
  try { localStorage.setItem(LANG_KEY, id); } catch { /* приватний режим */ }
};

/* ------------------------------------------------------------------
   Розпізнавання.

   `continuous` тримає сесію відкритою — інакше браузер зупиняється
   після першої ж паузи, і довга думка розпадається на шматки.
   `interimResults` дає текст ще під час говоріння: без нього
   здається, що нічого не працює.
------------------------------------------------------------------ */
export function createRecognizer({ lang, onPartial, onFinal, onError, onEnd }) {
  if (!Recognition) return null;

  const rec = new Recognition();
  rec.lang = lang || 'uk-UA';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let stopped = false;

  rec.onresult = (e) => {
    let partial = '';
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (r.isFinal) onFinal?.(r[0].transcript.trim());
      else partial += r[0].transcript;
    }
    onPartial?.(partial.trim());
  };

  rec.onerror = (e) => {
    /* `no-speech` і `aborted` — не помилки, а звичайні події: людина
       мовчить або сама зупинила. Показувати їх як збій означало б
       лякати там, де все гаразд. */
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    onError?.(e.error === 'not-allowed'
      ? 'Браузер не дав доступ до мікрофона'
      : `Розпізнавання не вдалось: ${e.error}`);
  };

  /* Браузер сам завершує сесію через кілька десятків секунд.
     Перезапускаємо, поки людина не натиснула «стоп», інакше диктовка
     тихо обривається на півслові. */
  rec.onend = () => {
    if (stopped) { onEnd?.(); return; }
    try { rec.start(); } catch { onEnd?.(); }
  };

  return {
    start: () => { stopped = false; try { rec.start(); } catch { /* вже запущено */ } },
    stop: () => { stopped = true; try { rec.stop(); } catch { /* вже зупинено */ } },
    abort: () => { stopped = true; try { rec.abort(); } catch { /* байдуже */ } },
  };
}

export const fmtDur = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
