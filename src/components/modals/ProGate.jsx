import { Lock, Sparkles } from 'lucide-react';
import { T } from '../trading/planTheme';
import { PRO_FEATURES, TRIAL_DAYS } from '../../lib/billing';

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
export default function ProGate({ feature, onStart }) {
  const f = PRO_FEATURES[feature] || {};

  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl"
        style={{ background: `rgba(${T.accRgb},0.12)`, border: `1px solid rgba(${T.accRgb},0.26)` }}
      >
        <Lock size={19} strokeWidth={2} style={{ color: T.acc }} />
      </span>

      <h3
        className="mt-4 text-[19px] font-bold"
        style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
      >
        {f.title}
      </h3>

      <p
        className="mt-2 max-w-[380px] text-[14px] leading-[21px]"
        style={{ fontFamily: T.sans, color: T.text3 }}
      >
        {f.hint}
      </p>

      <p
        className="mt-5 max-w-[380px] text-[13px] leading-[19px]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        Журнал, аналітика й калькулятор лишаються безкоштовними назавжди.
        Платне — те, що працює, поки ти спиш: термінал, який тягне угоди,
        і бот, який пише в чат.
      </p>

      <button
        type="button"
        onClick={onStart}
        className="mt-6 flex h-11 items-center gap-2 rounded-xl px-5 text-[14.5px] font-bold transition-all duration-200 active:scale-[0.98]"
        style={{ fontFamily: T.sans, background: T.acc, color: 'var(--edge-on-acc)' }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
      >
        <Sparkles size={15} strokeWidth={2.4} />
        Спробувати {TRIAL_DAYS} днів
      </button>

      {/* Сказати про списання ДО оплати, а не в листі через два тижні.
          Людина, яку списання заскочило зненацька, не продовжує
          підписку — вона пише в підтримку й лишає одну зірку. */}
      <span className="mt-2.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
        1 ₴ за перевірку картки. Перше списання — через {TRIAL_DAYS} днів, скасувати можна раніше.
      </span>
    </div>
  );
}
