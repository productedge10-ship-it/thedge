import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { T } from '../../lib/theme';
import { fmtDur } from '../../lib/speech';

/* ==================================================================
   Плеєр голосового.

   Нативний <audio controls> малюється засобами системи: сірий
   прямокутник із чужими пропорціями, який в темному вікні виглядає
   як вставлений з іншої сторінки. Тут той самий набір дій, але
   своїми руками — і на дві дії більше: швидкість і завантаження.

   Хвиля намальована з адреси файла, а не з самого звуку. Читати
   доріжку заради тридцяти стовпчиків означало б тягнути весь файл у
   пам'ять ще до натискання «грати»; а стабільність важливіша за
   правдивість — одне й те саме голосове має виглядати однаково між
   заходами, і воно виглядає.
================================================================== */

const BARS = 42;

/* Детермінований шум з рядка: та сама адреса — та сама хвиля. */
const waveOf = (url) => {
  let h = 0;
  for (let i = 0; i < url.length; i += 1) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < BARS; i += 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    /* Краї тихіші за середину — так виглядає майже будь-яка фраза */
    const shape = Math.sin((i / (BARS - 1)) * Math.PI) * 0.6 + 0.4;
    out.push(0.18 + ((h % 1000) / 1000) * 0.82 * shape);
  }
  return out;
};

const SPEEDS = [1, 1.5, 2];

export default function VoicePlayer({ src, sec, label, color = T.acc }) {
  const ref = useRef(null);
  const barsRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(sec || 0);
  const [speed, setSpeed] = useState(1);
  const [wave] = useState(() => waveOf(src));

  useEffect(() => {
    const a = ref.current;
    if (!a) return undefined;

    const onTime = () => setAt(a.currentTime);
    const onMeta = () => {
      /* У webm із браузера тривалість часто приходить як Infinity,
         поки файл не догравали до кінця. Тоді довіряємо тій, що
         записали при створенні. */
      if (Number.isFinite(a.duration) && a.duration > 0) setDur(a.duration);
    };
    const onEnd = () => { setPlaying(false); setAt(0); };

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  const seek = (e) => {
    const el = barsRef.current;
    const a = ref.current;
    if (!el || !a || !dur) return;
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    a.currentTime = p * dur;
    setAt(p * dur);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  const done = dur ? at / dur : 0;

  return (
    <div
      className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
      style={{ background: `${color}0f`, border: `1px solid ${color}33` }}
    >
      <audio ref={ref} src={src} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={toggle}
        title={playing ? 'Пауза' : 'Слухати'}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{
          background: `linear-gradient(180deg, ${color}, ${color}c4)`,
          boxShadow: `0 10px 22px -12px ${color}, inset 0 1px 0 #ffffff33`,
          transition: 'transform .16s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
      >
        {playing
          ? <Pause size={16} strokeWidth={2.4} style={{ color: '#0b0b10' }} />
          : <Play size={16} strokeWidth={2.4} style={{ color: '#0b0b10', marginLeft: 2 }} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: '#e4e2ec' }}>{label}</span>
          <span className="ml-auto shrink-0 text-[11px]" style={{ fontFamily: T.mono, color: '#8b8998' }}>
            {fmtDur(at)} / {fmtDur(dur)}
          </span>
        </div>

        {/* Хвиля — і показник, і смуга перемотки: клік по ній веде
            туди, куди вказали, без окремого повзунка. */}
        <div
          ref={barsRef}
          onClick={seek}
          className="mt-1.5 flex h-7 cursor-pointer items-center gap-[2px]"
        >
          {wave.map((v, i) => {
            const played = i / BARS <= done;
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.round(v * 100)}%`,
                  borderRadius: 99,
                  background: played ? color : '#2a2a35',
                  opacity: played ? 1 : 0.7,
                  transition: 'background .12s linear',
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={cycleSpeed}
          title="Швидкість"
          className="rounded-md px-1.5 py-[3px] text-[10.5px] font-bold"
          style={{
            fontFamily: T.mono,
            background: speed === 1 ? '#ffffff0a' : `${color}24`,
            border: `1px solid ${speed === 1 ? '#26262f' : `${color}4d`}`,
            color: speed === 1 ? '#8b8998' : color,
          }}
        >
          {speed}×
        </button>

        <a
          href={src}
          download
          title="Завантажити"
          className="grid h-6 w-6 place-items-center rounded-md"
          style={{ color: '#6f6d7d' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#c2c0ce')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#6f6d7d')}
        >
          <Download size={12} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}
