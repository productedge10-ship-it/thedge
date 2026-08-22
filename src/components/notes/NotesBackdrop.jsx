import { T } from '../../lib/theme';

/* ==================================================================
   Фон сторінки нотаток.
   Той самий чорний, що на решті сайту, але спокійніший: сітка ледь
   помітна, ореол зверху майже нейтральний. Сторінку читають довго —
   фон не має тягнути погляд на себе.
================================================================== */

export default function NotesBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <div className="absolute inset-0" style={{ background: T.bg }} />

      {/* м'яке світло згори — тепліше й слабше за робочі сторінки */}
      <div
        className="absolute left-1/2 top-0 h-[560px] w-[1500px] -translate-x-1/2"
        style={{
          background:
            `radial-gradient(ellipse at 50% 0%, rgba(${T.accRgb},0.055) 0%, rgba(255,236,214,0.022) 45%, transparent 72%)`,
          filter: 'blur(60px)',
        }}
      />

      {/* сітка — вдвічі тихіша, ніж на /plan */}
      <div
        className="absolute inset-0 opacity-[0.09]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
          backgroundSize: '34px 34px',
          maskImage: 'linear-gradient(to bottom, black 0%, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 70%)',
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 h-[45vh]"
        style={{ background: `linear-gradient(to top, ${T.bg}, transparent)` }}
      />
    </div>
  );
}
