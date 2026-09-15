import { ArrowRight, Trash2, Check, X, RefreshCw, AlertTriangle, Star, ArrowRightLeft } from 'lucide-react';
import { T } from '../../lib/theme';
import AssetIcon from '../ui/AssetIcon';
import { biasOf, biasResult } from './AnalysisCard';

/* ==================================================================
   Аналіз рядком — другий вигляд списку.

   Картка показує головне й ховає решту в ховер-панель: у сітці на
   чотири колонки більше просто не вміщається. Але коли планів багато,
   порівнювати їх картками незручно — очі стрибають, а половина полів
   лишається невидимою, доки не наведеш.

   Рядок вирішує рівно це: усе поле в одній лінії, всі рядки
   вирівняні по колонках, і план порівнюється з планом поглядом
   зверху вниз, а не наведенням по черзі.

   Тому тут НЕМАЄ ховер-панелі: сенс вигляду в тому, що ховати вже
   нічого.
================================================================== */

/* Пігулка напряму. Через rgba-трійку, а не дописування альфи до
   токена: токен теми — це рядок `var(--edge-ok, …)`, і `${color}22`
   на ньому дає невалідний CSS, який браузер мовчки викидає. */
function BiasPill({ value, muted }) {
  const b = biasOf(value);
  if (!b) {
    return (
      <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
        —
      </span>
    );
  }
  const Icon = b.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-bold"
      style={{
        fontFamily: T.sans,
        color: b.color,
        background: `rgba(${b.rgb},${muted ? 0.07 : 0.12})`,
        border: `1px solid rgba(${b.rgb},${muted ? 0.16 : 0.26})`,
      }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {b.label}
    </span>
  );
}

function Cell({ label, children, className = '' }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function AnalysisRow({ plan, onClick, onDelete }) {
  const planned = biasOf(plan.narrative || plan.plan_data?.narrative);
  const actual = plan.plan_data?.actualNarrative;
  const hit = biasResult(plan);
  const updates = plan.plan_data?.updates?.length || 0;
  const rating = plan.plan_data?.sessionRating || 0;
  const mistake = !!plan.plan_data?.analysisMistake;
  const text = (plan.plan_data?.planText || '').trim();

  const rgb = planned?.rgb || T.accRgb;

  return (
    <article
      onClick={() => onClick(plan)}
      className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl px-4 py-3.5"
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        transition: 'border-color 220ms ease, background 220ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `rgba(${rgb},0.4)`;
        e.currentTarget.style.background = T.surfaceHi;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.background = T.surface;
      }}
    >
      {/* Смужка напряму зліва — єдиний колір у рядку, який видно
          периферійним зором при швидкому скролі. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: `rgba(${rgb},0.8)` }}
      />

      {/* актив і дата */}
      <div className="flex w-[190px] shrink-0 items-center gap-2.5 pl-1.5">
        <AssetIcon symbol={plan.pair} category={plan.plan_data?.category} />
        <div className="min-w-0">
          <div
            className="truncate text-[15px] font-bold"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}
          >
            {plan.pair || 'Без активу'}
          </div>
          <div className="text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
            {plan.date}
          </div>
        </div>
      </div>

      {/* задум → факт → вердикт */}
      <Cell label="План → факт" className="w-[290px] shrink-0">
        <div className="flex items-center gap-2">
          <BiasPill value={plan.narrative || plan.plan_data?.narrative} />
          <ArrowRightLeft size={12} strokeWidth={2.4} style={{ color: T.text4 }} className="shrink-0" />
          <BiasPill value={actual} muted />
          {hit !== null && (
            <span
              className="ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md"
              style={{
                background: `rgba(${hit ? T.okRgb : T.badRgb},0.14)`,
                color: hit ? T.ok : T.bad,
              }}
              title={hit ? 'План справдився' : 'Ринок пішов інакше'}
            >
              {hit ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
            </span>
          )}
        </div>
      </Cell>

      {/* текст плану — займає все вільне місце */}
      <Cell label="Опис" className="flex-1">
        <p
          className="line-clamp-2 text-[13.5px]"
          style={{ fontFamily: T.sans, color: text ? T.text2 : T.text4, lineHeight: 1.5 }}
        >
          {text || 'Опис плану не заповнений'}
        </p>
      </Cell>

      {/* оцінка */}
      <Cell label="Оцінка" className="w-[86px] shrink-0">
        <span className="flex items-baseline gap-1 tabular-nums">
          <Star
            size={12}
            strokeWidth={2.4}
            style={{ color: rating ? T.warn : T.text4 }}
            fill={rating ? T.warn : 'none'}
          />
          <span
            className="text-[14px] font-bold"
            style={{ fontFamily: T.mono, color: rating ? T.text : T.text4 }}
          >
            {rating || '—'}
          </span>
          <span className="text-[12px]" style={{ fontFamily: T.mono, color: T.text4 }}>/ 5</span>
        </span>
      </Cell>

      {/* оновлення */}
      <Cell label="Апдейтів" className="w-[86px] shrink-0">
        <span className="flex items-center gap-1.5">
          <RefreshCw size={12} strokeWidth={2.4} style={{ color: updates ? T.info : T.text4 }} />
          <span
            className="text-[14px] font-bold tabular-nums"
            style={{ fontFamily: T.mono, color: updates ? T.text : T.text4 }}
          >
            {updates}
          </span>
        </span>
      </Cell>

      {/* помилка в аналізі */}
      <Cell label="Помилка" className="w-[96px] shrink-0">
        <span
          className="flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ fontFamily: T.sans, color: mistake ? T.warn : T.ok }}
        >
          {mistake ? <AlertTriangle size={12} strokeWidth={2.4} /> : <Check size={12} strokeWidth={3} />}
          {mistake ? 'є' : 'чисто'}
        </span>
      </Cell>

      {/* дії */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(plan); }}
          title="Видалити"
            /* Кнопка видима ЗАВЖДИ, просто приглушена.

             Була `opacity-0` до наведення — тобто існувала тільки
             для миші: на тач-екрані ховера немає взагалі, а з
             клавіатури до неї не дійти. Прихована дія, про яку
             неможливо дізнатись, — це відсутня дія. Під курсором
             вона просто набирає повну яскравість. */
          className="grid h-8 w-8 place-items-center rounded-lg opacity-45 transition-all duration-200 focus-visible:opacity-100 group-hover:opacity-100"
          style={{ color: T.text3 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'transparent'; }}
        >
          <Trash2 size={14} strokeWidth={2.2} />
        </button>
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: T.text3 }}>
          <ArrowRight size={15} strokeWidth={2.4} />
        </span>
      </div>
    </article>
  );
}
