import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Loader2, Type, AudioLines } from 'lucide-react';
import { T } from '../../lib/theme';
import {
  SPEECH_LANGS, createRecognizer, speechSupported, recordSupported,
  savedLang, rememberLang, fmtDur,
} from '../../lib/speech';

/* ==================================================================
   Диктовка.

   Одна кнопка, під нею — те, що вже почуто. Поки людина говорить,
   текст зʼявляється сам: без цього неможливо зрозуміти, чи тебе
   взагалі чують, і доводиться спершу наговорити хвилину, а потім
   з'ясувати, що мікрофон вимкнений.

   Смуга рівня — не прикраса з тієї ж причини. Вона реагує на голос
   миттєво, тоді як текст приходить із затримкою в пів секунди, і
   саме вона відповідає на питання «мене чути?».

   Голос і текст беруться незалежно: розпізнавання — з Web Speech
   API, сам запис — з MediaRecorder. Тому навіть у браузері без
   розпізнавання голосове збережеться, просто без розшифровки.
================================================================== */

const A = (a) => `rgba(${T.accRgb}, ${a})`;

export default function VoiceCapture({ onInsert, onAttach, onClose, busy }) {
  const [lang, setLang] = useState(savedLang);
  const [state, setState] = useState('idle');   // idle | rec | done
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [level, setLevel] = useState(0);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState(null);
  const [clip, setClip] = useState(null);       // { blob, url, sec }

  const recRef = useRef(null);
  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const tickRef = useRef(null);
  const chunksRef = useRef([]);
  const secRef = useRef(0);

  const canHear = speechSupported();
  const canRecord = recordSupported();

  /* Прибираємо все, що тримає мікрофон: браузер лишає індикатор
     запису увімкненим, поки живий бодай один трек. */
  const teardown = () => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(tickRef.current);
    try { recRef.current?.abort(); } catch { /* байдуже */ }
    try { mediaRef.current?.state === 'recording' && mediaRef.current.stop(); } catch { /* байдуже */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close?.();
    streamRef.current = null;
    audioCtxRef.current = null;
  };

  useEffect(() => () => teardown(), []);

  const start = async () => {
    setErr(null);
    setText('');
    setPartial('');
    setClip(null);
    setSec(0);

    let stream = null;
    if (canRecord) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch {
        setErr('Браузер не дав доступ до мікрофона');
        return;
      }
    }

    /* ---- сам запис ---- */
    if (stream) {
      chunksRef.current = [];
      /* Формат просимо той, який браузер справді вміє: Safari пише
         mp4, решта — webm/opus. Без цього MediaRecorder мовчки бере
         своє, і на виході тип, якого сховище може не прийняти. */
      const want = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((t) => window.MediaRecorder.isTypeSupported?.(t));
      const mr = new MediaRecorder(stream, want ? { mimeType: want } : undefined);
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setClip({ blob, url: URL.createObjectURL(blob), sec: Math.round(secRef.current) });
      };
      mediaRef.current = mr;
      mr.start();

      /* ---- рівень звуку ---- */
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);

      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i] - 128));
        setLevel(Math.min(1, (peak / 128) * 1.6));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    }

    /* ---- розпізнавання ---- */
    if (canHear) {
      const rec = createRecognizer({
        lang,
        onPartial: setPartial,
        onFinal: (t) => { setPartial(''); setText((prev) => (prev ? `${prev} ${t}` : t)); },
        onError: setErr,
      });
      recRef.current = rec;
      rec?.start();
    }

    secRef.current = 0;
    tickRef.current = setInterval(() => { secRef.current += 1; setSec(secRef.current); }, 1000);
    setState('rec');
  };

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(tickRef.current);
    setLevel(0);
    try { recRef.current?.stop(); } catch { /* байдуже */ }
    try { mediaRef.current?.state === 'recording' && mediaRef.current.stop(); } catch { /* байдуже */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState('done');
  };

  const reset = () => {
    teardown();
    setState('idle');
    setText('');
    setPartial('');
    setClip(null);
    setSec(0);
    setErr(null);
  };

  const full = [text, partial].filter(Boolean).join(' ').trim();

  return (
    <div
      className="w-[440px] overflow-hidden rounded-2xl"
      style={{ background: '#14141b', border: '1px solid #2c2c38', boxShadow: `0 28px 60px -20px #000, 0 0 0 1px ${A(0.1)}` }}
    >
      {/* ─── мова ─── */}
      <div className="flex items-center gap-2 px-3.5 pb-0 pt-3.5">
        <span className="mr-1 text-[10px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: '#9a98ab' }}>
          Мова
        </span>
        {SPEECH_LANGS.map((l) => {
          const on = lang === l.id;
          return (
            <button
              key={l.id}
              type="button"
              disabled={state === 'rec'}
              onClick={() => { setLang(l.id); rememberLang(l.id); }}
              title={l.name}
              className="rounded-lg px-2.5 py-1 text-[11.5px] font-bold"
              style={{
                fontFamily: T.mono,
                background: on ? A(0.17) : '#ffffff08',
                border: `1px solid ${on ? A(0.5) : '#22222c'}`,
                color: on ? '#ffffff' : '#a3a1b2',
                opacity: state === 'rec' && !on ? 0.4 : 1,
                cursor: state === 'rec' ? 'not-allowed' : 'pointer',
                transition: 'all .16s',
              }}
            >
              {l.short}
            </button>
          );
        })}

        <span className="ml-auto text-[11.5px]" style={{ fontFamily: T.mono, color: state === 'rec' ? '#ff9d9d' : '#7d7b8e' }}>
          {fmtDur(sec)}
        </span>
      </div>

      {/* ─── кнопка й рівень ─── */}
      <div className="flex items-center gap-3.5 px-3.5 py-3.5">
        <button
          type="button"
          onClick={state === 'rec' ? stop : start}
          disabled={busy}
          className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full"
          style={{
            background: state === 'rec' ? 'linear-gradient(180deg,#ff6b6b,#e04141)' : 'linear-gradient(180deg,#5546f8,#3f30e8)',
            boxShadow: state === 'rec'
              ? `0 0 0 ${6 + level * 14}px rgba(224,65,65,0.14), 0 12px 26px -12px #e0414199`
              : `0 12px 26px -12px ${A(0.8)}, inset 0 1px 0 #ffffff33`,
            transition: 'box-shadow .12s linear, background .2s',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {state === 'rec'
            ? <Square size={18} strokeWidth={2.4} style={{ color: '#fff' }} />
            : <Mic size={22} strokeWidth={1.9} style={{ color: '#fff' }} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold" style={{ fontFamily: T.sans, color: '#e4e2ec' }}>
            {state === 'rec' ? 'Слухаю…' : state === 'done' ? 'Готово' : 'Натисни і говори'}
          </div>

          {/* Смуги рівня: відповідь на «мене чути?» швидша за текст */}
          <div className="mt-2 flex h-6 items-end gap-[3px]">
            {Array.from({ length: 28 }).map((_, i) => {
              const wave = state === 'rec'
                ? Math.max(0.12, level * (0.55 + 0.45 * Math.sin((i / 28) * Math.PI)))
                : 0.12;
              return (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: `${wave * 100}%`,
                    borderRadius: 99,
                    background: state === 'rec' ? `rgba(255,107,107,${0.35 + wave * 0.65})` : '#22222c',
                    transition: 'height .09s linear, background .2s',
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── розшифровка ─── */}
      <div
        className="mx-3.5 mb-3.5 max-h-[168px] min-h-[86px] overflow-auto rounded-[14px] px-3.5 py-3"
        style={{ background: '#ffffff05', border: '1px solid #1e1e27' }}
      >
        {full ? (
          <span style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.65, color: '#eceaf4' }}>
            {text}
            {partial && <span style={{ color: '#8b8998' }}> {partial}</span>}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-[13px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
            {state === 'rec'
              ? <><Loader2 size={13} className="animate-spin" /> чекаю на голос…</>
              : canHear
                ? 'Тут зʼявиться текст, поки ти говориш'
                : 'Цей браузер не вміє розпізнавати мову — запис голосу все одно працює'}
          </span>
        )}
      </div>

      {err && (
        <div className="mx-3.5 mb-3.5 rounded-[10px] px-3 py-2 text-[12px]" style={{ background: '#ff8f8f14', border: '1px solid #ff8f8f3d', color: '#ff9d9d', fontFamily: T.sans }}>
          {err}
        </div>
      )}

      {/* ─── дії ─── */}
      <div className="flex items-center gap-2 px-3.5 pb-3.5" style={{ borderTop: '1px solid #1c1c25', paddingTop: 12 }}>
        {state === 'done' ? (
          <>
            <button
              type="button"
              onClick={reset}
              title="Записати ще раз"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
              style={{ background: '#ffffff08', border: '1px solid #22222c', color: '#a3a1b2' }}
            >
              <Trash2 size={14} strokeWidth={1.9} />
            </button>

            {clip && (
              <button
                type="button"
                onClick={() => onAttach(clip)}
                disabled={busy}
                className="flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12.5px] font-semibold"
                style={{ background: '#ffffff08', border: '1px solid #22222c', color: '#c2c0ce', fontFamily: T.sans, opacity: busy ? 0.5 : 1 }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <AudioLines size={13} strokeWidth={1.9} />}
                Додати голосове
              </button>
            )}

            <button
              type="button"
              onClick={() => onInsert(full)}
              disabled={!full}
              className="ml-auto flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-[12.5px] font-bold"
              style={{
                background: full ? 'linear-gradient(180deg,#5546f8,#3f30e8)' : '#ffffff08',
                border: full ? 'none' : '1px solid #22222c',
                color: full ? '#ffffff' : '#6f6d7d',
                fontFamily: T.sans,
                cursor: full ? 'pointer' : 'not-allowed',
              }}
            >
              <Type size={13} strokeWidth={2.2} />
              Вставити текст
            </button>
          </>
        ) : (
          <>
            <span className="text-[11.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
              {state === 'rec' ? 'Натисни квадрат, коли договориш' : 'Текст і голос беруться одночасно'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto flex h-9 items-center rounded-[10px] px-3 text-[12.5px] font-semibold"
              style={{ background: '#ffffff08', border: '1px solid #22222c', color: '#a3a1b2', fontFamily: T.sans }}
            >
              Закрити
            </button>
          </>
        )}
      </div>
    </div>
  );
}
