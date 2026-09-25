import { Sparkles } from 'lucide-react';
import { T } from '../trading/planTheme';
import { PRO_FEATURES, TRIAL_DAYS } from '../../lib/billing';
import GateScene from './GateScene';
import BacktestScene from './BacktestScene';

/* ==================================================================
   Замок на Pro-розділі.

   Не «вимкнено», а «ось що тут буде». Сірий недоступний екран нічого
   не продає: людина бачить, що їй чогось не дали, і не бачить —
   чого саме. Тому замість блокування показуємо зміст розділу
   словами й одну кнопку.

   Розділ при цьому не ховаємо з меню взагалі. Прихований пункт не
   існує: людина ніколи не дізнається, що продукт таке вміє, і
   ніколи не заплатить за те, про що не чула.
================================================================== */
/* Кнопка старту пробного періоду. Окремо, бо тепер вона стоїть у двох
   розкладках: звичайній і повноекранній для бектесту. */
function TrialButton({ onStart, className = '' }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className={`sub-cta inline-flex h-[52px] items-center justify-center rounded-2xl px-8 text-[14.5px] font-bold ${className}`}
      style={{
        background: 'linear-gradient(180deg, var(--edge-surface-hi, #18181C), var(--edge-sunken, #0D0D10))',
        border: `1px solid ${T.lineAcc}`,
        color: T.text,
        fontFamily: T.sans,
        boxShadow: `0 10px 28px -12px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 16px 40px -12px rgba(${T.accRgb},0.85), inset 0 1px 0 rgba(255,255,255,0.07)`;
        e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.6)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 10px 28px -12px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`;
        e.currentTarget.style.borderColor = T.lineAcc;
      }}
    >
      {/* Та сама шкала днів, що й на вкладці Subscription: дві кнопки з
          однаковим призначенням мають поводитись однаково. */}
      <span className="sub-cta-days" aria-hidden>
        {Array.from({ length: TRIAL_DAYS }, (_, i) => (
          <span key={i} className={`sub-cta-day${i === TRIAL_DAYS - 1 ? ' is-charge' : ''}`} />
        ))}
      </span>
      <span className="sub-cta-label inline-flex items-center gap-2">
        <Sparkles size={15} strokeWidth={2.4} style={{ color: T.acc }} />
        {TRIAL_DAYS} днів безкоштовно
      </span>
    </button>
  );
}

export default function ProGate({ feature, onStart }) {
  const f = PRO_FEATURES[feature] || {};

  /* Бектест — окрема сторінка, а не вкладка в налаштуваннях, тож замок
     тут займає весь екран. Замість картинки — справжній програвач
     історії, у який можна потикати; текст і кнопка лежать поверх нього
     склом, щоб не забирати в сцени місце. */
  if (feature === 'backtest') {
    return (
      /* Відступ зверху й знизу — той самий, що в сайдбара, щоб сцена
         стояла з ним на одній лінії, а не впиралась у край вікна. */
      <div className="py-3 lg:py-4">
        <BacktestScene>
          <div
            className="rounded-2xl p-5"
            style={{
              background: 'rgba(12,11,20,0.78)',
              border: '1px solid rgba(139,123,255,0.22)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.18em]"
              style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.14)` }}
            >
              Pro
            </span>
            <h3
              className="mt-3 text-[26px] font-bold leading-tight"
              style={{ fontFamily: T.display, color: '#EDECF7', letterSpacing: '-0.025em' }}
            >
              {f.title}
            </h3>
            <p className="mt-2 text-[14px] leading-[21px]" style={{ fontFamily: T.sans, color: 'rgba(237,236,247,0.62)' }}>
              {f.hint}. Спробуй прямо тут — натисни Long або Short.
            </p>
            <TrialButton onStart={onStart} className="mt-5 w-full" />
            <div className="mt-2.5 text-center text-[12px]" style={{ fontFamily: T.sans, color: 'rgba(237,236,247,0.45)' }}>
              1 ₴ на перевірку картки, одразу повертаємо · скасувати будь-коли
            </div>
          </div>
        </BacktestScene>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {/* Замість замка — сама робота розділу: людина бачить приз, а не
          перешкоду. */}
      <div className="mb-5 w-full">
        <GateScene feature={feature} />
      </div>

      <h3
        className="mt-6 text-[22px] font-bold"
        style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
      >
        {f.title}
      </h3>

      <p
        className="mt-2 max-w-[420px] text-[14px] leading-[21px]"
        style={{ fontFamily: T.sans, color: T.text3 }}
      >
        {f.hint}
      </p>

      <TrialButton onStart={onStart} className="mt-7" />

      {/* Умови списання лишаються: саме цей рядок вирішує, чи буде
          потім повернення й чарджбек. */}
      <span className="mt-3 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        1 ₴ на перевірку картки, одразу повертаємо · скасувати можна будь-коли
      </span>
    </div>
  );
}
