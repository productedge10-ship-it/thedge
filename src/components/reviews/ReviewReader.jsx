import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Calendar, Check, Share2, Globe, Link2Off } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { PROMPTS, EMOTIONS, SCORE_LABELS, fmtRange, fmtR } from '../../lib/reviewsData';

/* ==================================================================
   Читалка розбору.
   Спершу цифри періоду, далі головна зміна — саме її перечитують
   через тиждень. Відповіді на питання нижче, спокійною колонкою.
================================================================== */

export default function ReviewReader({ review, onClose, onDelete, onShare, onUnshare }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (!review) return null;
  const s = review.stats || {};
  const scoreColor = review.score >= 4 ? T.ok : review.score === 3 ? T.warn : T.bad;

  const stats = [
    { label: 'Угод', value: s.trades ?? 0 },
    { label: 'Net R', value: fmtR(s.netR ?? 0), color: (s.netR ?? 0) >= 0 ? T.ok : T.bad },
    { label: 'Win rate', value: `${Math.round(s.winrate ?? 0)}%` },
    { label: 'За планом', value: `${Math.round(s.planRate ?? 0)}%`, color: (s.planRate ?? 0) >= 70 ? T.ok : T.warn },
    { label: 'Помилок', value: s.mistakes ?? 0, color: (s.mistakes ?? 0) > 0 ? T.warn : T.text },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.article
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[820px] overflow-hidden rounded-3xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)' }}
      >
        {/* шапка */}
        <div
          className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 sm:px-7"
          style={{ borderBottom: `1px solid ${T.line}`, background: 'rgba(19,19,22,0.94)', backdropFilter: 'blur(14px)' }}
        >
          <Calendar size={14} strokeWidth={2.2} style={{ color: T.text4 }} />
          <span className="truncate text-[13.5px] font-medium tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
            {fmtRange(review.from, review.to)}
          </span>
          <span
            className="ml-1 shrink-0 rounded-lg px-2 py-0.5 text-[12.5px] font-bold"
            style={{ fontFamily: T.sans, color: scoreColor, background: `${scoreColor}14`, border: `1px solid ${scoreColor}2e` }}
          >
            {SCORE_LABELS[review.score]}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Поділитись. Доки не натиснуто — розбір не видно нікому,
                тому кнопка називає дію, а не стан. */}
            {onShare && (
              <button
                onClick={() => onShare(review)}
                title={review.isPublic ? 'Скопіювати посилання' : 'Поділитись розбором'}
                className="flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-all duration-200 active:scale-95"
                style={{
                  background: review.isPublic ? `rgba(${T.accRgb},0.10)` : T.surface,
                  border: `1px solid ${review.isPublic ? T.lineAcc : T.line}`,
                  color: review.isPublic ? T.acc : T.text2,
                  fontFamily: T.sans,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = review.isPublic ? T.acc : T.text2;
                  e.currentTarget.style.borderColor = review.isPublic ? T.lineAcc : T.line;
                }}
              >
                {review.isPublic ? <Globe size={14} strokeWidth={2.3} /> : <Share2 size={14} strokeWidth={2.3} />}
                <span className="hidden sm:inline">{review.isPublic ? 'Лінк' : 'Поділитись'}</span>
              </button>
            )}

            {onUnshare && review.isPublic && (
              <button
                onClick={() => onUnshare(review)}
                title="Закрити публічний доступ"
                className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 active:scale-95"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.warn; e.currentTarget.style.borderColor = `rgba(${T.warnRgb},0.35)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
              >
                <Link2Off size={15} strokeWidth={2.2} />
              </button>
            )}

            {onDelete && (
              <button
                onClick={() => onDelete(review.id)}
                title="Видалити"
                className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 active:scale-95"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.35)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
              >
                <Trash2 size={15} strokeWidth={2.2} />
              </button>
            )}
            <button
              onClick={onClose}
              title="Закрити (Esc)"
              className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 active:scale-95"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="px-5 py-7 sm:px-10">
          <div className="mx-auto w-full" style={{ maxWidth: 640 }}>

            {/* цифри */}
            <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {stats.map((st) => (
                <div key={st.label} className="min-w-0 rounded-xl px-3 py-2.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                  <div className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {st.label}
                  </div>
                  <div className="mt-1 truncate text-[17px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: st.color || T.text }}>
                    {st.value}
                  </div>
                </div>
              ))}
            </div>

            {/* головна зміна */}
            <div
              className="mb-8 rounded-2xl px-5 py-5"
              style={{ background: `rgba(${T.accRgb},0.05)`, border: `1px solid ${T.accLine}` }}
            >
              <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.acc }}>
                Зміна на наступний період
              </div>
              <p className="text-[19px] font-bold leading-snug" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                {review.lesson}
              </p>
            </div>

            {/* стан */}
            {(review.emotions || []).length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {review.emotions.map((id) => {
                  const e = EMOTIONS.find((x) => x.id === id);
                  if (!e) return null;
                  const c = e.good ? T.ok : T.warn;
                  return (
                    <span
                      key={id}
                      className="rounded-lg px-2.5 py-1 text-[13px] font-semibold"
                      style={{ fontFamily: T.sans, color: c, background: `${c}14`, border: `1px solid ${c}2e` }}
                    >
                      {e.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* відповіді */}
            <div className="flex flex-col gap-7">
              {PROMPTS.map((p) => {
                const text = review.answers?.[p.id];
                if (!text) return null;
                return (
                  <div key={p.id}>
                    <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {p.label}
                    </div>
                    <p className="whitespace-pre-wrap" style={{ fontFamily: T.sans, fontSize: 16, lineHeight: 1.8, color: '#E4E4E9' }}>
                      {text}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* обіцянки */}
            {(review.promises || []).length > 0 && (
              <div className="mt-9 pt-7" style={{ borderTop: `1px solid ${T.line}` }}>
                <div className="mb-3 text-[12.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  Домовленості з собою
                </div>
                <div className="flex flex-col gap-2">
                  {review.promises.map((p) => (
                    <div
                      key={p.text}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                    >
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
                        style={{ background: p.done ? T.ok : 'transparent', border: `1.5px solid ${p.done ? T.ok : T.lineHi}` }}
                      >
                        {p.done && <Check size={12} strokeWidth={3.4} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
                      </span>
                      <span className="text-[14px]" style={{ fontFamily: T.sans, color: p.done ? T.text2 : T.text3 }}>
                        {p.text}
                      </span>
                      <span className="ml-auto shrink-0 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: p.done ? T.ok : T.text4 }}>
                        {p.done ? 'виконано' : 'не виконано'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
}
