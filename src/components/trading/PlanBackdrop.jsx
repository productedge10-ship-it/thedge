import { T } from './planTheme';
import StarField from '../ui/StarField';

/* ==================================================================
   Фон сторінки: глибокий чорний + крапкова сітка (як на FAQ)
   + м'який фіолетовий ореол зверху. Нічого не рухається — фон
   не має конкурувати з контентом і не жере кадри при скролі.
================================================================== */

export default function PlanBackdrop({ live = false }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      {/* базовий колір */}
      <div className="absolute inset-0" style={{ background: T.bg }} />

      {/* ореол зверху */}
      <div
        className="absolute left-1/2 top-0 h-[620px] w-[1400px] -translate-x-1/2"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, rgba(${T.accRgb},0.10) 0%, transparent 68%)`,
          filter: 'blur(50px)',
        }}
      />

      {/* Крапкова сітка. Жива всюди: точки дрейфують і розходяться
          хвилею від курсора.

          На робочих екранах вона тихіша — те саме поле, але на третину
          менш помітне. Причина проста: там людина читає таблиці й
          цифри, і фон, однаково яскравий на всіх сторінках, починає
          конкурувати з текстом замість того, щоб тримати глибину.

          Малюється на canvas одним циклом, тому ціна цього — частки
          відсотка процесора, а не кадри при скролі. */}
      {live !== 'off' ? (
        <div
          className="pointer-events-auto absolute inset-0"
          style={{ opacity: live ? 0.55 : 0.34 }}
        >
          <StarField />
        </div>
      ) : (
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, var(--edge-dot, rgba(255,255,255,0.9)) 1px, transparent 0)',
            backgroundSize: '32px 32px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 85%)',
          }}
        />
      )}

      {/* легке віньєтування знизу — тримає фокус по центру */}
      <div
        className="absolute inset-x-0 bottom-0 h-[40vh]"
        style={{ background: `linear-gradient(to top, ${T.bg}, transparent)` }}
      />
    </div>
  );
}
