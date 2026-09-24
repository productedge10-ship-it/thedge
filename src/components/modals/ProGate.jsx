import { Sparkles } from 'lucide-react';
import { T } from '../trading/planTheme';
import { PRO_FEATURES, TRIAL_DAYS } from '../../lib/billing';
import GateScene from './GateScene';

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
      {/* Замість замка — сама робота розділу.

          Замок повідомляє «тобі не дали», але не повідомляє, чого
          саме. Людина бачить перешкоду й не бачить призу, а платять
          за приз. Тут за дві секунди видно, що станеться після
          оплати: у MT5 угоди переїжджають із термінала в журнал, у
          Telegram повідомлення прилітають у чат. */}
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

      {/* Абзац про безкоштовні розділи звідси прибрано.

          Він пояснював тарифну політику там, де людина вирішує одне
          конкретне питання: вмикати цей розділ чи ні. Три рядки
          дрібним сірим між обіцянкою й кнопкою — це три рядки, які
          ніхто не читає, але які відсувають кнопку вниз. Повне
          пояснення лишилось на вкладці Subscription, де воно й
          доречне. */}

      <button
        type="button"
        onClick={onStart}
        className="sub-cta mt-7 inline-flex h-[52px] items-center justify-center rounded-2xl px-8 text-[14.5px] font-bold"
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
        {/* Та сама шкала днів, що й на вкладці Subscription: дві
            кнопки з однаковим призначенням мають поводитись однаково,
            інакше друга читається як інша дія. */}
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

      {/* Умови списання лишаються: саме цей рядок вирішує, чи буде
          потім повернення й чарджбек. */}
      <span className="mt-3 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        Лише привʼязка картки, без списання · скасувати можна будь-коли
      </span>
    </div>
  );
}
