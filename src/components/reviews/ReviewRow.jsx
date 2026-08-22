import { motion } from 'framer-motion';
import { ArrowUpRight, Quote, Check, X, Share2, Globe } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { EMOTIONS, SCORE_LABELS, fmtRange, fmtR } from '../../lib/reviewsData';

/* ==================================================================
   Розбір у списку.
   Не картка-плитка, а розворот: зліва оцінка великою цифрою, по
   центру — сама зміна, заради якої розбір і робиться, справа —
   цифри періоду вузькою колонкою. Читається як запис у книзі, а не
   як плитка в каталозі.
================================================================== */

const scoreColor = (n) => (n >= 4 ? T.ok : n === 3 ? T.warn : T.bad);

function Metric({ label, value, tone, fill }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {label}
        </span>
        <span className="shrink-0 text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: tone || T.text2 }}>
          {value}
        </span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full" style={{ background: T.sunken }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          whileInView={{ width: `${Math.min(1, Math.max(0, fill)) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ background: tone || T.lineHi }}
        />
      </div>
    </div>
  );
}

export default function ReviewRow({ review, index, onOpen, onDelete, onShare }) {
  const s = review.stats || {};
  const c = scoreColor(review.score);
  const netUp = (s.netR ?? 0) >= 0;
  const kept = (review.promises || []).filter((p) => p.done).length;
  const promises = (review.promises || []).length;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.32, delay: Math.min(index, 6) * 0.04, ease: EASE }}
      whileHover={{ y: -2 }}
      onClick={() => onOpen(review)}
      className="group relative grid cursor-pointer grid-cols-1 overflow-hidden rounded-2xl lg:grid-cols-[132px_1fr_240px]"
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        transition: 'border-color 240ms ease, box-shadow 240ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${c}44`;
        e.currentTarget.style.boxShadow = '0 22px 48px -30px rgba(0,0,0,0.95)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* ─── оцінка ─── */}
      <div
        className="relative flex items-center gap-4 px-5 py-5 lg:flex-col lg:items-start lg:justify-center lg:gap-1"
        style={{ background: `linear-gradient(160deg, ${c}0f, transparent 70%)` }}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c, opacity: 0.6 }} />

        <span
          className="text-[38px] font-black leading-none tabular-nums transition-transform duration-300 group-hover:-translate-y-0.5 sm:text-[46px]"
          style={{ fontFamily: T.display, color: c, letterSpacing: '-0.04em' }}
        >
          {review.score}
        </span>
        <span className="flex flex-col">
          <span className="text-[13px] font-bold" style={{ fontFamily: T.sans, color: c }}>
            {SCORE_LABELS[review.score]}
          </span>
          <span className="text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
            {fmtRange(review.from, review.to)}
          </span>
        </span>
      </div>

      {/* ─── головна зміна ─── */}
      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-5" style={{ borderLeft: `1px solid ${T.line}` }}>
        <div className="flex items-start gap-3">
          <Quote size={16} strokeWidth={2.4} className="mt-1 shrink-0 rotate-180" style={{ color: `${c}88` }} />
          <p
            className="text-[17px] font-bold leading-snug"
            style={{
              fontFamily: T.display, color: T.text, letterSpacing: '-0.015em',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {review.lesson}
          </p>
        </div>

        {review.answers?.pattern && (
          <p
            className="pl-7 text-[13.5px]"
            style={{
              fontFamily: T.sans, color: T.text3, lineHeight: 1.6,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {review.answers.pattern}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pl-7">
          {(review.emotions || []).map((id) => {
            const e = EMOTIONS.find((x) => x.id === id);
            if (!e) return null;
            const ec = e.good ? T.ok : T.warn;
            return (
              <span
                key={id}
                className="rounded-md px-2 py-0.5 text-[12px] font-semibold"
                style={{ fontFamily: T.sans, color: ec, background: `${ec}14` }}
              >
                {e.label}
              </span>
            );
          })}

          {promises > 0 && (
            <span
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold"
              style={{
                fontFamily: T.sans,
                color: kept === promises ? T.ok : T.text3,
                background: kept === promises ? `rgba(${T.okRgb},0.10)` : T.sunken,
              }}
              title="Виконані домовленості з попереднього розбору"
            >
              {kept === promises ? <Check size={11} strokeWidth={3.4} /> : <X size={11} strokeWidth={3.4} />}
              {kept}/{promises} обіцянок
            </span>
          )}
        </div>
      </div>

      {/* ─── цифри періоду ─── */}
      <div
        className="flex flex-col justify-center gap-2.5 px-5 py-5"
        style={{ borderLeft: `1px solid ${T.line}`, background: T.sunken }}
      >
        <Metric
          label="Net R"
          value={fmtR(s.netR ?? 0)}
          tone={netUp ? T.ok : T.bad}
          fill={Math.min(1, Math.abs(s.netR ?? 0) / 10)}
        />
        <Metric
          label="Win rate"
          value={`${Math.round(s.winrate ?? 0)}%`}
          tone={(s.winrate ?? 0) >= 50 ? T.ok : T.text2}
          fill={(s.winrate ?? 0) / 100}
        />
        <Metric
          label="За планом"
          value={`${Math.round(s.planRate ?? 0)}%`}
          tone={(s.planRate ?? 0) >= 70 ? T.ok : T.warn}
          fill={(s.planRate ?? 0) / 100}
        />
        <Metric
          label="Помилок"
          value={s.mistakes ?? 0}
          tone={(s.mistakes ?? 0) > 0 ? T.warn : T.ok}
          fill={Math.min(1, (s.mistakes ?? 0) / 5)}
        />
      </div>

      {/* дії */}
      <span className="absolute right-3 top-3 flex items-center gap-1.5">
        {/* Відкритий розбір позначаємо завжди — щоб не забути, що він
            лежить у публічному доступі */}
        {review.isPublic && (
          <span
            title="Відкритий за посиланням"
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ color: T.acc, background: `rgba(${T.accRgb},0.10)` }}
          >
            <Globe size={12} strokeWidth={2.4} />
          </span>
        )}

        {onShare && (
          <button
            onClick={(e) => { e.stopPropagation(); onShare(review); }}
            title={review.isPublic ? 'Скопіювати посилання' : 'Поділитись розбором'}
            className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
            style={{ color: T.text4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
          >
            <Share2 size={12.5} strokeWidth={2.4} />
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(review.id); }}
          title="Видалити розбір"
          className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <X size={13} strokeWidth={2.6} />
        </button>
        <ArrowUpRight
          size={16}
          strokeWidth={2.4}
          className="shrink-0 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
          style={{ color: c }}
        />
      </span>
    </motion.article>
  );
}
