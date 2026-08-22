/* ==================================================================
   Сигнал завершення таймера.

   Готовий mp3 не тягнемо навмисно: файл довелось би класти в репо,
   він важить, кешується і рано чи пізно не завантажиться саме тоді,
   коли треба. Замість цього синтезуємо мʼякий дзвіночок через
   Web Audio — три обертони з довгим загасанням. Звучить як
   кришталевий келих, а не як будильник, і не лякає посеред роботи.
================================================================== */

let ctx = null;

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

/* Один удар дзвона: основний тон + два обертони, кожен зі своїм
   загасанням — саме це дає «живе» звучання замість писку. */
function bell(base, when = 0, gain = 0.16) {
  const ac = getCtx();
  if (!ac) return;

  const t0 = ac.currentTime + when;
  const master = ac.createGain();
  master.gain.value = gain;
  master.connect(ac.destination);

  [
    { f: base,        g: 1,    d: 2.6 },
    { f: base * 2.01, g: 0.42, d: 1.8 },
    { f: base * 3.02, g: 0.18, d: 1.1 },
  ].forEach(({ f, g, d }) => {
    const osc = ac.createOscillator();
    const env = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0);

    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(g, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  });
}

/* Кінець фокусу — висхідна пара нот (можна видихнути).
   Кінець паузи — низхідна (пора назад). */
export function playChime(kind = 'focus') {
  if (kind === 'focus') {
    bell(523.25);           // C5
    bell(783.99, 0.16, 0.13); // G5
    bell(1046.5, 0.34, 0.09); // C6
  } else {
    bell(659.25);           // E5
    bell(523.25, 0.18, 0.12); // C5
  }
}

/* Дозвіл треба питати з жесту користувача, тому викликаємо це
   при старті таймера, а не при завантаженні сторінки. */
export function ensureAudio() {
  getCtx();
}

export async function askNotifications() {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch { return false; }
}

export function systemNotify(title, body) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, silent: true, tag: 'edge-pomodoro' });
    setTimeout(() => n.close(), 8000);
  } catch { /* вкладка могла втратити фокус — не критично */ }
}
