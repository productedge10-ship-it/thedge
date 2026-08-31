import { motion } from 'framer-motion';
import { X, Share2, Globe } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { EMOTIONS, fmtRange, fmtR, isoWeek } from '../../lib/reviewsData';

/* ==================================================================
   Розбір у списку.

   Три поверхи: смуга з ідентифікацією тижня, сама зміна великим
   текстом, і цифри стрічкою внизу. Головне — середній поверх: розбір
   роблять заради висновку, а не заради статистики, тому вона під ним
   і дрібнішим кеглем.

   Геометрія з макета редизайну, кольори — проєктні токени.
================================================================== */

const scoreColor = (n) => (n >= 4 ? T.ok : n === 3 ? T.warn : T.bad);

/* Клітинка нижньої стрічки. */
function Cell({ label, value, tone, last }) {
  return (
    <div style={{ padding: '20px 26px', borderRight: last ? 'none' : `1px solid ${T.line}` }}>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 9.5,
          letterSpacing: '1.6px',
          color: T.text4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontFamily: T.mono,
          marginTop: 9,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.6px',
          color: tone || T.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ReviewRow({ review, index, onOpen, onDelete, onShare }) {
  const s = review.stats || {};
  const c = scoreColor(review.score);
  const week = isoWeek(review.from);
  const kept = (review.promises || []).filter((p) => p.done).length;
  const promises = (review.promises || []).length;
  const allKept = promises > 0 && kept === promises;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.32, delay: Math.min(index, 6) * 0.04, ease: EASE }}
      whileHover={{ y: -2 }}
      onClick={() => onOpen(review)}
      className="group cursor-pointer overflow-hidden"
      style={{
        borderRadius: 22,
        border: `1px solid ${T.line}`,
        background: T.surface,
        boxShadow: '0 26px 64px -34px rgba(0,0,0,0.9)',
        transition: 'border-color .2s, box-shadow .2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.lineHi;
        e.currentTarget.style.boxShadow = '0 36px 84px -34px rgba(0,0,0,0.95)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = '0 26px 64px -34px rgba(0,0,0,0.9)';
      }}
    >
      {/* ─────────── смуга ідентифікації ─────────── */}
      <div
        className="flex flex-wrap items-center justify-between"
        style={{
          gap: 20,
          padding: '18px 26px',
          background: T.surfaceHi,
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div className="flex min-w-0 flex-wrap items-center" style={{ gap: 16 }}>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: 9,
              background: `rgba(${T.accRgb},0.13)`,
              border: `1px solid rgba(${T.accRgb},0.28)`,
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: '1.4px',
              color: T.acc,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            Тиждень {week}
          </span>

          <span style={{ fontFamily: T.sans, fontSize: 14.5, color: T.text2, whiteSpace: 'nowrap' }}>
            {fmtRange(review.from, review.to)}
          </span>

          <span style={{ width: 1, height: 16, background: T.lineHi }} />

          <span className="flex items-baseline" style={{ gap: 6 }}>
            <span
              className="tabular-nums"
              style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 600, color: T.text }}
            >
              {s.trades ?? 0}
            </span>
            <span style={{ fontFamily: T.sans, fontSize: 13, color: T.text3 }}>угод</span>
          </span>
        </div>

        <div className="flex items-center" style={{ gap: 18 }}>
          <div className="flex flex-wrap items-center" style={{ gap: 14 }}>
            {(review.emotions || []).map((id) => {
              const e = EMOTIONS.find((x) => x.id === id);
              if (!e) return null;
              const ec = e.good ? T.ok : T.warn;
              return (
                <span
                  key={id}
                  className="flex items-center"
                  style={{ gap: 8, fontFamily: T.sans, fontSize: 13.5, color: ec }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: ec }} />
                  {e.label}
                </span>
              );
            })}
          </div>

          {promises > 0 && (
            <span
              title="Виконані домовленості з попереднього розбору"
              style={{
                fontFamily: T.mono,
                fontSize: 12,
                letterSpacing: '.6px',
                color: allKept ? T.ok : T.text3,
                /* Закреслення лишається тільки поки не всі виконані:
                   домовленість, якої дотримались, закреслювати немає за що. */
                textDecoration: allKept ? 'none' : 'line-through',
                textDecorationColor: T.lineHi,
                whiteSpace: 'nowrap',
              }}
            >
              {kept} / {promises} обіцянок
            </span>
          )}

          {/* Дії. Місце під них зайняте завжди, видимість зʼявляється на
              наведенні — інакше смуга сіпалася б під курсором. */}
          <span className="flex shrink-0 items-center" style={{ gap: 6 }}>
            {review.isPublic && (
              <span
                title="Відкритий за посиланням"
                className="grid place-items-center"
                style={{
                  width: 26, height: 26, borderRadius: 8,
                  color: T.acc, background: `rgba(${T.accRgb},0.10)`,
                }}
              >
                <Globe size={12} strokeWidth={2.4} />
              </span>
            )}

            {onShare && (
              <button
                onClick={(e) => { e.stopPropagation(); onShare(review); }}
                title={review.isPublic ? 'Скопіювати посилання' : 'Поділитись розбором'}
                className="grid place-items-center opacity-0 transition-all duration-200 group-hover:opacity-100"
                style={{ width: 26, height: 26, borderRadius: 8, color: T.text4 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
              >
                <Share2 size={12.5} strokeWidth={2.4} />
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); onDelete(review.id); }}
              title="Видалити розбір"
              className="grid place-items-center opacity-0 transition-all duration-200 group-hover:opacity-100"
              style={{ width: 26, height: 26, borderRadius: 8, color: T.text4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </span>
        </div>
      </div>

      {/* ─────────── сама зміна ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3px 1fr' }}>
        {/* Смужка бере колір оцінки, а не постійний акцент: у макеті це
            декор, а тут ще й єдине місце, де оцінка видно на картці. */}
        <div style={{ background: `linear-gradient(180deg, ${c}, ${c}1f)` }} />

        <div className="px-6 py-7 sm:px-10 sm:pb-8 sm:pt-[34px]">
          <p
            style={{
              fontFamily: T.display,
              fontSize: 22,
              lineHeight: '36px',
              fontWeight: 600,
              letterSpacing: '-0.4px',
              color: T.text,
              maxWidth: 880,
            }}
          >
            {review.lesson}
          </p>

          {review.answers?.pattern && (
            <div className="flex" style={{ marginTop: 16, gap: 12, maxWidth: 820 }}>
              <span style={{ width: 2, flex: 'none', borderRadius: 99, background: T.lineHi }} />
              <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: '25px', color: T.text3 }}>
                {review.answers.pattern}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─────────── цифри ─────────── */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4"
        style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}
      >
        <Cell
          label="Net R"
          value={fmtR(s.netR ?? 0)}
          tone={(s.netR ?? 0) >= 0 ? T.ok : T.bad}
        />
        <Cell label="Win rate" value={`${Math.round(s.winrate ?? 0)}%`} />
        <Cell
          label="За планом"
          value={`${Math.round(s.planRate ?? 0)}%`}
          tone={(s.planRate ?? 0) >= 70 ? T.ok : T.warn}
        />
        <Cell label="Помилок" value={s.mistakes ?? 0} last />
      </div>
    </motion.article>
  );
}
