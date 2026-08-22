import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Lock, ArrowRight, CalendarDays, Quote, Check, X, Sparkles,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { PROMPTS, EMOTIONS, SCORE_LABELS, fmtRange, fmtR } from '../lib/reviewsData';
import { loadPublicReview } from '../lib/reviewsStore';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';

/* ==================================================================
   Публічний розбір.
   Людина відкриває чужий тижневий висновок і має за пів хвилини
   зрозуміти: як пройшов період, що трейдер про це думає і що
   вирішив змінити. Тому порядок такий: оцінка — цифри — рішення —
   і аж потім розгорнуті відповіді.
================================================================== */

const scoreColor = (n) => (n >= 4 ? T.ok : n === 3 ? T.warn : T.bad);

function Metric({ label, value, tone }) {
  return (
    <div
      className="min-w-0 rounded-2xl px-4 py-3.5"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <div
        className="mb-1.5 truncate text-[11.5px] font-bold uppercase tracking-[0.12em]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        {label}
      </div>
      <div
        className="text-[20px] font-bold tabular-nums"
        style={{ fontFamily: T.mono, color: tone || T.text }}
      >
        {value}
      </div>
    </div>
  );
}

export default function SharedReview() {
  useEdgeFonts();

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await loadPublicReview(id);
        if (!alive) return;
        if (!r) setError('closed');
        else setReview(r);
      } catch {
        if (alive) setError('missing');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  /* ---------- Верхня смуга ---------- */
  const TopBar = () => (
    <div
      className="sticky top-0 z-40"
      style={{
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${T.line}`,
      }}
    >
      <div className="mx-auto flex w-full max-w-[900px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link to={user ? '/app' : '/auth'} className="flex items-center gap-2.5">
          <EdgeMonogram />
          <span className="hidden sm:block"><EdgeWordmark /></span>
        </Link>

        <span
          className="ml-1 hidden rounded-lg px-2.5 py-1 text-[12px] font-semibold sm:block"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }}
        >
          розбір періоду
        </span>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <button
              onClick={() => navigate('/reviews')}
              className="group flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
            >
              Мої розбори
              <ArrowRight size={14} strokeWidth={2.4} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/auth')}
                className="h-9 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
                style={{ color: T.text3, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                Вхід
              </button>
              <button
                onClick={() => navigate('/auth')}
                className="h-9 rounded-xl px-4 text-[13.5px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0"
                style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                Реєстрація
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: T.bg }}>
        <Loader2 className="animate-spin" size={30} style={{ color: T.acc }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen" style={{ background: T.bg }}>
        <PlanBackdrop />
        <div className="relative z-10">
          <TopBar />
          <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-4 py-24 text-center">
            <div
              className="mb-5 grid h-14 w-14 place-items-center rounded-2xl"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <Lock size={20} strokeWidth={1.9} style={{ color: T.text4 }} />
            </div>
            <h1 className="mb-2 text-[24px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
              {error === 'closed' ? 'Розбір закритий' : 'Розбору не існує'}
            </h1>
            <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {error === 'closed'
                ? 'Автор ще не відкрив доступ до цього розбору або вже його закрив.'
                : 'Схоже, посилання застаріло або розбір видалили.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const s = review.stats || {};
  const c = scoreColor(review.score);
  const emotions = EMOTIONS.filter((e) => (review.emotions || []).includes(e.id));
  const promises = review.promises || [];

  return (
    <div className="relative min-h-screen" style={{ background: T.bg }}>
      <PlanBackdrop />

      <div className="relative z-10">
        <TopBar />

        <div className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
          {/* ─────────── Оцінка періоду ─────────── */}
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="mb-9 overflow-hidden rounded-3xl"
            style={{
              background: `linear-gradient(150deg, ${c}12, ${T.surface} 62%)`,
              border: `1px solid ${T.line}`,
            }}
          >
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
              <div className="flex items-center gap-5">
                <span
                  className="text-[64px] font-black leading-none tabular-nums sm:text-[76px]"
                  style={{ fontFamily: T.display, color: c, letterSpacing: '-0.05em' }}
                >
                  {review.score || '—'}
                </span>
                <span className="h-14 w-px" style={{ background: T.line }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays size={13} strokeWidth={2.2} style={{ color: T.text4 }} />
                  <span className="text-[13.5px] font-medium tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {fmtRange(review.from, review.to)}
                  </span>
                </div>

                <h1
                  className="text-[26px] font-bold leading-tight sm:text-[32px]"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
                >
                  {SCORE_LABELS[review.score] || 'Розбір періоду'}
                </h1>

                {emotions.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {emotions.map((e) => (
                      <span
                        key={e.id}
                        className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold"
                        style={{
                          fontFamily: T.sans,
                          background: e.good ? `rgba(${T.okRgb},0.09)` : `rgba(${T.warnRgb},0.09)`,
                          border: `1px solid ${e.good ? `rgba(${T.okRgb},0.22)` : `rgba(${T.warnRgb},0.22)`}`,
                          color: e.good ? T.ok : T.warn,
                        }}
                      >
                        {e.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.header>

          {/* ─────────── Цифри ─────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
            className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-5"
          >
            <Metric label="Угод" value={s.trades ?? 0} />
            <Metric label="Net R" value={fmtR(s.netR ?? 0)} tone={(s.netR ?? 0) >= 0 ? T.ok : T.bad} />
            <Metric label="Win rate" value={`${Math.round(s.winrate ?? 0)}%`} />
            <Metric label="За планом" value={`${Math.round(s.planRate ?? 0)}%`} tone={(s.planRate ?? 0) >= 70 ? T.ok : T.warn} />
            <Metric label="Помилок" value={s.mistakes ?? 0} tone={(s.mistakes ?? 0) > 0 ? T.warn : T.ok} />
          </motion.div>

          {/* ─────────── Головне рішення ─────────── */}
          {review.lesson && (
            <motion.blockquote
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
              className="relative mb-9 overflow-hidden rounded-3xl p-6 sm:p-8"
              style={{ background: T.surface, border: `1px solid ${T.lineAcc}` }}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: T.acc }} />
              <Quote size={20} strokeWidth={2} style={{ color: T.acc, opacity: 0.5 }} className="mb-3" />
              <p
                className="text-[19px] font-semibold sm:text-[22px]"
                style={{ fontFamily: T.display, color: T.text, lineHeight: 1.5, letterSpacing: '-0.015em' }}
              >
                {review.lesson}
              </p>
              <p className="mt-3 text-[12.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Головна зміна на наступний період
              </p>
            </motion.blockquote>
          )}

          {/* ─────────── Відповіді ─────────── */}
          <div className="flex flex-col gap-4">
            {PROMPTS.map((p, i) => {
              const text = review.answers?.[p.id];
              if (!text) return null;
              return (
                <motion.section
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.15 + i * 0.05 }}
                  className="overflow-hidden rounded-2xl"
                  style={{ background: T.surface, border: `1px solid ${T.line}` }}
                >
                  <div className="px-5 pt-5">
                    <div
                      className="text-[12px] font-bold uppercase tracking-[0.16em]"
                      style={{ fontFamily: T.sans, color: T.acc }}
                    >
                      {p.label}
                    </div>
                    <div className="mt-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      {p.question}
                    </div>
                  </div>
                  <p
                    className="whitespace-pre-wrap px-5 pb-5 pt-3.5 text-[15px]"
                    style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.75 }}
                  >
                    {text}
                  </p>
                </motion.section>
              );
            })}
          </div>

          {/* ─────────── Обіцянки ─────────── */}
          {promises.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.3 }}
              className="mt-4 overflow-hidden rounded-2xl"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <div
                className="px-5 py-4 text-[12px] font-bold uppercase tracking-[0.16em]"
                style={{ fontFamily: T.sans, color: T.text3, borderBottom: `1px solid ${T.line}` }}
              >
                Що обіцяв собі
              </div>
              <div className="flex flex-col gap-2 p-4">
                {promises.map((pr, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
                    style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                  >
                    <span
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
                      style={{
                        background: pr.done ? `rgba(${T.okRgb},0.14)` : `rgba(${T.badRgb},0.10)`,
                        color: pr.done ? T.ok : T.bad,
                      }}
                    >
                      {pr.done ? <Check size={12} strokeWidth={3.4} /> : <X size={12} strokeWidth={3.4} />}
                    </span>
                    <span className="min-w-0 text-[14px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                      {pr.text}
                    </span>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* ─────────── Тиха реклама ─────────── */}
          {!user && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
              className="mt-14 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-7"
              style={{
                background: `linear-gradient(120deg, rgba(${T.accRgb},0.06), ${T.surface} 60%)`,
                border: `1px solid ${T.line}`,
              }}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
              >
                <Sparkles size={18} strokeWidth={2} style={{ color: T.acc }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                  Розбір тижня за пʼятнадцять хвилин
                </p>
                <p className="mt-1 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                  Edge Journal сам збирає угоди, плани й помилки за період — лишається
                  тільки чесно відповісти на три питання.
                </p>
              </div>
              <button
                onClick={() => navigate('/auth')}
                className="group flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0"
                style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                Спробувати
                <ArrowRight size={15} strokeWidth={2.8} className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
