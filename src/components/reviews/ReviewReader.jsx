import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Trash2, Check, Share2, Globe, Link2Off } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { PROMPTS, EMOTIONS, SCORE_LABELS, fmtRange, fmtR, isoWeek } from '../../lib/reviewsData';

/* ==================================================================
   Читалка розбору.

   Дві колонки: вузька рейка з цифрами й станом ліворуч, розповідь
   праворуч. Цифри поруч, а не зверху — перечитуючи висновок через
   тиждень, хочеться бачити, з чого він виріс, не гортаючи вгору.

   Малюється через портал у body. Без нього вікно лишалось усередині
   <main>, а на ньому висить `z-0` — це створює власний контекст
   накладання, і будь-який z-index усередині вже не може піднятись над
   бічною панеллю. Плюс сторінка анімує себе через transform, а
   елемент із transform стає системою координат для position: fixed —
   тому «на весь екран» перетворювалось на «на весь блок контенту», і
   вікно вилазило за нижній край.

   У макеті це була шухляда, що виїжджає справа. Тут вікно по центру:
   шухляда шириною 880px на ноутбуці зʼїдає більшу частину екрана й
   лишає марну смугу зліва, а на телефоні перетворюється на ту саму
   повноекранну сторінку — тобто вся її ідея працює лише на одній
   ширині. Стилі при цьому взяті з макета один в один.
================================================================== */

/* Колір заголовка кожного питання. Три відповіді — це «добре»,
   «погано» і «спостереження», і колір робить цю різницю видимою
   раніше, ніж людина дочитає підпис. */
const PROMPT_TONE = { worked: T.ok, broke: T.bad, pattern: T.acc };

function Eyebrow({ children, color, size = 9.5, tracking = 1.8 }) {
  return (
    <div
      style={{
        fontFamily: T.mono,
        fontSize: size,
        letterSpacing: `${tracking}px`,
        color: color || T.text4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

/* Рядок рейки: підпис ліворуч, число праворуч, лінія згори. */
function Row({ label, value, tone, last }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        gap: 12,
        padding: '14px 0',
        borderTop: `1px solid ${T.line}`,
        borderBottom: last ? `1px solid ${T.line}` : 'none',
      }}
    >
      <span style={{ fontFamily: T.sans, fontSize: 13, color: T.text3 }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ fontFamily: T.mono, fontSize: 17, fontWeight: 600, color: tone || T.text }}
      >
        {value}
      </span>
    </div>
  );
}

function IconButton({ onClick, title, children, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid shrink-0 place-items-center transition-all duration-200 active:scale-95"
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        border: `1px solid ${T.line}`,
        color: T.text3,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? `rgba(${T.badRgb},0.12)` : T.surfaceHi;
        e.currentTarget.style.borderColor = danger ? `rgba(${T.badRgb},0.35)` : T.lineHi;
        e.currentTarget.style.color = danger ? T.bad : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.color = T.text3;
      }}
    >
      {children}
    </button>
  );
}

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
  const c = review.score >= 4 ? T.ok : review.score === 3 ? T.warn : T.bad;
  const week = isoWeek(review.from);
  const promises = review.promises || [];
  const kept = promises.filter((p) => p.done).length;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[220] flex items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(8,8,11,0.74)', backdropFilter: 'blur(8px)' }}
    >
      <motion.article
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex h-full w-full max-w-[1040px] flex-col overflow-hidden sm:h-auto sm:max-h-full sm:rounded-[22px]"
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 40px 120px -40px rgba(0,0,0,0.92)',
        }}
      >
        {/* ─────────── шапка ─────────── */}
        <div
          className="flex shrink-0 items-center justify-between"
          style={{
            gap: 20,
            padding: '22px 20px',
            borderBottom: `1px solid ${T.line}`,
            background: T.surfaceHi,
          }}
        >
          <div className="min-w-0 sm:pl-3">
            <Eyebrow color={T.acc} size={10} tracking={2.2}>
              Тиждень {week} · Розбір
            </Eyebrow>
            {/* Без обрізання: на телефоні кнопки зʼїдають половину рядка,
                і «13 лип. — 1…» не каже нічого. Хай переноситься. */}
            <div
              className="text-[18px] sm:text-[22px]"
              style={{
                fontFamily: T.display,
                marginTop: 7,
                fontWeight: 600,
                letterSpacing: '-0.4px',
                color: T.text,
              }}
            >
              {fmtRange(review.from, review.to)}
            </div>
          </div>

          <div className="flex shrink-0 items-center" style={{ gap: 8 }}>
            {onShare && (
              <button
                onClick={() => onShare(review)}
                title={review.isPublic ? 'Скопіювати посилання' : 'Поділитись розбором'}
                className="flex items-center transition-all duration-200 active:scale-95"
                style={{
                  gap: 8,
                  height: 38,
                  padding: '0 15px',
                  borderRadius: 11,
                  background: `rgba(${T.accRgb},0.13)`,
                  border: `1px solid rgba(${T.accRgb},0.32)`,
                  color: T.acc,
                  fontFamily: T.sans,
                  fontSize: 13.5,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.accRgb},0.22)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${T.accRgb},0.13)`; }}
              >
                {review.isPublic ? <Globe size={15} strokeWidth={2.2} /> : <Share2 size={15} strokeWidth={2.2} />}
                <span className="hidden sm:inline">{review.isPublic ? 'Лінк' : 'Поділитись'}</span>
              </button>
            )}

            {onUnshare && review.isPublic && (
              <IconButton onClick={() => onUnshare(review)} title="Закрити публічний доступ">
                <Link2Off size={16} strokeWidth={1.9} />
              </IconButton>
            )}

            {onDelete && (
              <IconButton onClick={() => onDelete(review.id)} title="Видалити" danger>
                <Trash2 size={16} strokeWidth={1.9} />
              </IconButton>
            )}

            <IconButton onClick={onClose} title="Закрити (Esc)">
              <X size={16} strokeWidth={2} />
            </IconButton>
          </div>
        </div>

        {/* ─────────── дві колонки ─────────── */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="grid items-start lg:grid-cols-[236px_1fr]">

            {/* рейка цифр */}
            <div
              className="px-6 pb-8 pt-7 sm:px-8 lg:sticky lg:top-0 lg:pb-10 lg:pl-8 lg:pr-6"
              style={{ borderBottom: `1px solid ${T.line}` }}
            >
              <Eyebrow>Цифри тижня</Eyebrow>

              <div className="flex flex-col" style={{ marginTop: 18 }}>
                <Row label="Угод" value={s.trades ?? 0} />
                <Row label="Net R" value={fmtR(s.netR ?? 0)} tone={(s.netR ?? 0) >= 0 ? T.ok : T.bad} />
                <Row label="Win rate" value={`${Math.round(s.winrate ?? 0)}%`} />
                <Row
                  label="За планом"
                  value={`${Math.round(s.planRate ?? 0)}%`}
                  tone={(s.planRate ?? 0) >= 70 ? T.ok : T.warn}
                />
                <Row label="Помилок" value={s.mistakes ?? 0} tone={(s.mistakes ?? 0) > 0 ? T.warn : T.text} />
                {/* Оцінка тижня. У макеті її не було, але це єдине число,
                    яке ставить людина, а не рахує застосунок — губити
                    його не можна. */}
                <Row label="Оцінка" value={SCORE_LABELS[review.score]} tone={c} last />
              </div>

              {(review.emotions || []).length > 0 && (
                <>
                  <div style={{ marginTop: 28 }}>
                    <Eyebrow>Стан</Eyebrow>
                  </div>
                  <div className="flex flex-col" style={{ marginTop: 14, gap: 11 }}>
                    {review.emotions.map((id) => {
                      const e = EMOTIONS.find((x) => x.id === id);
                      if (!e) return null;
                      const ec = e.good ? T.ok : T.warn;
                      return (
                        <span
                          key={id}
                          className="flex items-center"
                          style={{ gap: 9, fontFamily: T.sans, fontSize: 14, color: ec }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: 99, background: ec }} />
                          {e.label}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* розповідь */}
            <div
              className="min-w-0 px-6 pb-14 pt-7 sm:px-8 lg:border-l lg:pb-[60px] lg:pl-8 lg:pr-[34px] lg:pt-[30px]"
              style={{ borderColor: T.line }}
            >
              <div style={{ paddingLeft: 22, borderLeft: `2px solid ${T.acc}` }}>
                <Eyebrow color={T.acc} size={10} tracking={2.2}>
                  Зміна на наступний період
                </Eyebrow>
                <p
                  style={{
                    fontFamily: T.display,
                    marginTop: 14,
                    fontSize: 23,
                    lineHeight: '37px',
                    fontWeight: 600,
                    letterSpacing: '-0.35px',
                    color: T.text,
                  }}
                >
                  {review.lesson}
                </p>
              </div>

              <div className="flex flex-col" style={{ marginTop: 38, gap: 30 }}>
                {PROMPTS.map((p, i) => {
                  const text = review.answers?.[p.id];
                  if (!text) return null;
                  return (
                    <div key={p.id} className="flex flex-col" style={{ gap: 30 }}>
                      {i > 0 && <div style={{ height: 1, background: T.line }} />}
                      <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 18 }}>
                        <div style={{ fontFamily: T.mono, fontSize: 15, color: T.text4, paddingTop: 3 }}>
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="min-w-0">
                          <Eyebrow color={PROMPT_TONE[p.id]} tracking={2}>{p.label}</Eyebrow>
                          <p
                            className="whitespace-pre-wrap"
                            style={{ fontFamily: T.sans, marginTop: 11, fontSize: 16, lineHeight: '28px', color: T.text2 }}
                          >
                            {text}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {promises.length > 0 && (
                <div
                  style={{
                    marginTop: 40,
                    padding: '22px 24px',
                    borderRadius: 16,
                    background: T.surfaceHi,
                    border: `1px solid ${T.line}`,
                  }}
                >
                  <div className="flex items-center justify-between" style={{ gap: 16 }}>
                    <Eyebrow color={T.text3} size={10} tracking={2}>Домовленості з собою</Eyebrow>
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ fontFamily: T.mono, fontSize: 12, color: T.text3 }}
                    >
                      {kept}/{promises.length} виконано
                    </span>
                  </div>

                  <div className="flex flex-col" style={{ marginTop: 16, gap: 8 }}>
                    {promises.map((p) => (
                      <div
                        key={p.text}
                        className="flex items-center"
                        style={{
                          gap: 14,
                          padding: '14px 16px',
                          borderRadius: 12,
                          background: p.done ? `rgba(${T.okRgb},0.06)` : T.sunken,
                          border: `1px solid ${p.done ? `rgba(${T.okRgb},0.25)` : T.line}`,
                        }}
                      >
                        <span
                          className="grid shrink-0 place-items-center"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            background: p.done ? T.ok : 'transparent',
                            border: `1.7px solid ${p.done ? T.ok : T.lineHi}`,
                          }}
                        >
                          {p.done && <Check size={12} strokeWidth={3.4} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
                        </span>

                        <span
                          className="min-w-0 flex-1"
                          style={{ fontFamily: T.sans, fontSize: 14.5, lineHeight: '22px', color: p.done ? T.text2 : T.text }}
                        >
                          {p.text}
                        </span>

                        <span
                          className="shrink-0"
                          style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.6px', color: p.done ? T.ok : T.text4 }}
                        >
                          {p.done ? 'виконано' : 'не виконано'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.article>
    </motion.div>,
    document.body,
  );
}
