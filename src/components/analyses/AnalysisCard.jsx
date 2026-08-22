import { motion } from 'framer-motion';
import { ArrowRight, RefreshCw, Trash2, Check, X, TrendingUp, TrendingDown, Minus, Coffee } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import AssetIcon from '../ui/AssetIcon';

/* ==================================================================
   Картка аналізу.
   Головне питання, на яке вона відповідає: справдився план чи ні.
   Тому поруч із запланованим біасом одразу видно фактичний — і саме
   ця пара робить журнал аналізів корисним, а не просто списком.
================================================================== */

export const BIAS = {
  BULLISH: { label: 'Bullish', color: T.ok,    rgb: T.okRgb,   icon: TrendingUp },
  BEARISH: { label: 'Bearish', color: T.bad,   rgb: T.badRgb,  icon: TrendingDown },
  NEUTRAL: { label: 'Neutral', color: T.warn,  rgb: T.warnRgb, icon: Minus },
  'DAY OFF': { label: 'Day off', color: T.text3, rgb: '122,122,133', icon: Coffee },
};

export const biasOf = (v) => BIAS[(v || '').toUpperCase()] || null;

/* Чи справдився план: порівнюємо задум із тим, що вийшло */
export function biasResult(plan) {
  const planned = (plan?.narrative || plan?.plan_data?.narrative || '').toUpperCase();
  const actual = (plan?.plan_data?.actualNarrative || '').toUpperCase();
  if (!planned || !actual) return null;
  return planned === actual;
}

export default function AnalysisCard({ plan, onClick, onDelete }) {
  const planned = biasOf(plan.narrative || plan.plan_data?.narrative);
  const hit = biasResult(plan);
  const updates = plan.plan_data?.updates?.length || 0;
  const rating = plan.plan_data?.sessionRating || 0;
  const mistake = !!plan.plan_data?.analysisMistake;
  const text = plan.plan_data?.planText;
  const color = planned?.color || T.text3;
  const Icon = planned?.icon;

  return (
    <motion.article
      onClick={() => onClick(plan)}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl"
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset',
        transition: 'border-color 240ms ease, box-shadow 240ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}55`;
        e.currentTarget.style.boxShadow = `0 20px 44px -28px rgba(0,0,0,0.95), 0 0 0 1px ${color}22 inset`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = '0 1px 0 rgba(255,255,255,0.03) inset';
      }}
    >
      {/* кольорове відлуння біасу */}
      <span
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 blur-[48px] transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: color }}
      />
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, ${color}00)` }} />

      {/* шапка */}
      <div className="relative flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AssetIcon symbol={plan.pair} category={plan.plan_data?.category} />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
              {plan.pair}
            </div>
            <div className="text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
              {plan.date}
            </div>
          </div>
        </div>

        {planned && (
          <span
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
            style={{ fontFamily: T.sans, color, background: `rgba(${planned.rgb},0.10)`, border: `1px solid rgba(${planned.rgb},0.24)` }}
          >
            <Icon size={12} strokeWidth={2.6} />
            {planned.label}
          </span>
        )}
      </div>

      {/* Текст плану. Висота зафіксована під три рядки, щоб картки
         в сітці були однакові — інакше ряд виглядає рваним. */}
      <div className="relative flex-1 px-4">
        <p
          className="text-[13.5px]"
          style={{
            fontFamily: T.sans,
            color: text ? T.text3 : T.text4,
            fontStyle: text ? 'normal' : 'italic',
            lineHeight: 1.62,
            minHeight: 'calc(1.62em * 3)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {text || 'Опис плану не заповнений'}
        </p>
      </div>

      {/* підвал — завжди однакової висоти, навіть якщо порожній */}
      <div className="relative mt-4 flex min-h-[46px] items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
        {/* чи справдився */}
        {hit !== null && (
          <span
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-bold"
            style={{
              fontFamily: T.sans,
              color: hit ? T.ok : T.bad,
              background: hit ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
            }}
            title={hit ? 'Фактичний рух збігся з планом' : 'Ринок пішов інакше'}
          >
            {hit ? <Check size={11} strokeWidth={3.4} /> : <X size={11} strokeWidth={3.4} />}
            {hit ? 'справдився' : 'мимо'}
          </span>
        )}

        {updates > 0 && (
          <span
            className="flex items-center gap-1 text-[12.5px] font-semibold tabular-nums"
            style={{ fontFamily: T.mono, color: T.text4 }}
            title={`${updates} оновлень протягом дня`}
          >
            <RefreshCw size={11} strokeWidth={2.4} />{updates}
          </span>
        )}

        {mistake && (
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.bad }} title="Помилка в аналізі" />
        )}

        {/* оцінка сесії крапками */}
        {rating > 0 && (
          <span className="ml-auto flex items-center gap-[3px]" title={`Оцінка сесії ${rating}/5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
                style={{ background: n <= rating ? (rating >= 4 ? T.ok : rating === 3 ? T.warn : T.bad) : T.line }}
              />
            ))}
          </span>
        )}

        <span className={`flex items-center ${rating > 0 ? '' : 'ml-auto'} gap-1`}>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(e, plan); }}
            title="Видалити аналіз"
            className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
            style={{ color: T.text4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
          >
            <Trash2 size={13} strokeWidth={2.2} />
          </button>
          <span
            className="grid h-7 w-7 place-items-center rounded-lg transition-all duration-300 group-hover:translate-x-0.5"
            style={{ color: T.text4 }}
          >
            <ArrowRight size={14} strokeWidth={2.4} />
          </span>
        </span>
      </div>
    </motion.article>
  );
}
