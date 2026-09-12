import { motion } from 'framer-motion';
import { ArrowRight, Trash2, CalendarRange, TrendingUp, TrendingDown, Minus, Coffee } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { weekRangeLabel, mondayOf } from '../../lib/weekPlan';

/* ==================================================================
   Картка тижневого плану.

   Той самий каркас, що й у денної картки (щоб стрічка «Аналізів» не
   розсипалась на дві різні мови), але питання інше: не «справдився
   план на день», а «за чим стежив і що з цього вийшло по кожному
   активу». Список активів може бути порожнім — це показано чесно,
   а не приховано.
================================================================== */

const BIAS = {
  Bullish: { color: T.ok, rgb: T.okRgb, icon: TrendingUp },
  Bearish: { color: T.bad, rgb: T.badRgb, icon: TrendingDown },
  Neutral: { color: T.warn, rgb: T.warnRgb, icon: Minus },
  'Day off': { color: T.text3, rgb: '122,122,133', icon: Coffee },
};

/* Плановий bias живе в самому розборі — кожен актив свій, тому й
   чіп фарбується власним плановим bias, а не спільним для тижня. */
function AssetChip({ analysis }) {
  const planned = BIAS[analysis.narrative];
  const actual = BIAS[analysis.actualBias];
  const hit = analysis.narrative && analysis.actualBias ? analysis.actualBias === analysis.narrative : null;
  return (
    <span
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
      style={{
        fontFamily: T.mono,
        color: planned?.color || T.text2,
        background: planned ? `rgba(${planned.rgb},0.09)` : T.sunken,
        border: `1px solid ${planned ? `rgba(${planned.rgb},0.22)` : T.line}`,
      }}
    >
      {analysis.pair}
      {actual && (
        <span style={{ color: hit ? T.ok : T.bad, opacity: 0.85 }}>
          {hit ? '✓' : '✕'}
        </span>
      )}
    </span>
  );
}

export default function WeeklyAnalysisCard({ plan, onClick, onDelete }) {
  const data = plan.plan_data || {};
  const named = (data.tdaAnalyses || []).filter((t) => t.pair);
  const rating = data.weekRating || 0;
  const reviewed = named.filter((t) => t.actualBias || t.outcome?.trim()).length;
  const isCurrentWeek = plan.date === mondayOf(new Date().toISOString().slice(0, 10));

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
        e.currentTarget.style.borderColor = `${T.acc}55`;
        e.currentTarget.style.boxShadow = `0 20px 44px -28px rgba(0,0,0,0.95), 0 0 0 1px ${T.acc}22 inset`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = '0 1px 0 rgba(255,255,255,0.03) inset';
      }}
    >
      <span
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 blur-[48px] transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `rgba(${T.accRgb},1)` }}
      />
      <span
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: isCurrentWeek ? T.acc : `linear-gradient(90deg, ${T.acc}, ${T.acc}00)` }}
      />

      {/* шапка */}
      <div className="relative flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
          >
            <CalendarRange size={15} strokeWidth={2.2} style={{ color: T.acc }} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[16px] font-bold tabular-nums" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
              {weekRangeLabel(plan.date)}
            </div>
          </div>
        </div>

        {isCurrentWeek && (
          <span
            className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.06em]"
            style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.14)`, border: `1px solid rgba(${T.accRgb},0.3)` }}
          >
            Зараз
          </span>
        )}
      </div>

      {/* активи */}
      <div className="relative flex-1 px-4">
        {named.length ? (
          <div className="flex flex-wrap gap-1.5">
            {named.map((a) => <AssetChip key={a.id} analysis={a} />)}
          </div>
        ) : (
          <p className="text-[13.5px] italic" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
            Активів на цей тиждень не заплановано
          </p>
        )}
      </div>

      {/* підвал */}
      <div className="relative mt-4 flex min-h-[46px] items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
        {named.length > 0 && (
          <span
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-bold"
            style={{ fontFamily: T.sans, color: reviewed ? T.ok : T.text4, background: reviewed ? `rgba(${T.okRgb},0.10)` : 'transparent' }}
            title="Скільки активів уже розібрано"
          >
            {reviewed}/{named.length} розібрано
          </span>
        )}

        {rating > 0 && (
          <span className="ml-auto flex items-center gap-[3px]" title={`Оцінка тижня ${rating}/5`}>
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
            title="Видалити тижневий план"
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
