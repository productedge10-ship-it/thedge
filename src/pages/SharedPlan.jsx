import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, CalendarDays, Link as LinkIcon, Book, Crosshair, Clock,
  NotebookPen, Lock, X, ArrowRight, TrendingUp, TrendingDown, Minus, Coffee,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';

/* ==================================================================
   Публічна сторінка плану.
   Її бачить людина, яка ще не знає, що таке Edge Journal: колега,
   ментор, підписник. Тому головне тут — сам план, а знайомство з
   продуктом тримається збоку й не заважає читати.
================================================================== */

const BIAS = {
  Bullish: { color: T.ok, rgb: T.okRgb, icon: TrendingUp },
  Bearish: { color: T.bad, rgb: T.badRgb, icon: TrendingDown },
  Neutral: { color: T.text2, rgb: '180,180,189', icon: Minus },
  'Day off': { color: T.info, rgb: T.infoRgb, icon: Coffee },
};

const fmtDate = (d) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('uk-UA', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return d; }
};

/* ---------- секція ---------- */
function Section({ icon: Icon, title, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <Icon size={14} strokeWidth={2.3} style={{ color: T.acc }} />
        <h2
          className="text-[12px] font-bold uppercase tracking-[0.18em]"
          style={{ fontFamily: T.sans, color: T.text3 }}
        >
          {title}
        </h2>
        <span className="ml-2 h-px flex-1" style={{ background: `linear-gradient(90deg, ${T.line}, transparent)` }} />
      </div>
      {children}
    </motion.section>
  );
}

function Card({ children, className = '' }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl ${className}`}
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      {children}
    </div>
  );
}

function Prose({ text }) {
  return (
    <p
      className="whitespace-pre-wrap p-5 text-[15px]"
      style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.75 }}
    >
      {text}
    </p>
  );
}

/* ---------- блок графіка ---------- */
function ChartBlock({ block, onZoom, eyebrow }) {
  return (
    <Card>
      <div className="flex items-center gap-2 px-4 pt-4">
        <span
          className="rounded-lg px-2.5 py-1 text-[12px] font-bold"
          style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
        >
          {block.tf || eyebrow || 'TF'}
        </span>
      </div>

      {block.image && (
        <button
          onClick={() => onZoom(block.image)}
          className="mt-3 block w-full cursor-zoom-in transition-opacity duration-200 hover:opacity-92"
          style={{ background: T.sunken }}
        >
          <img src={block.image} alt="" className="block h-auto w-full" />
        </button>
      )}

      {block.text && (
        <p
          className="whitespace-pre-wrap px-4 py-4 text-[14px]"
          style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.7 }}
        >
          {block.text}
        </p>
      )}
    </Card>
  );
}

/* ================================================================== */

export default function SharedPlan() {
  useEdgeFonts();

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    async function fetchPlan() {
      try {
        /* Тільки явно відкриті плани. Політика в базі теж це стереже,
           але фільтр тут дає зрозумілу помилку замість порожнечі. */
        const { data, error: e } = await supabase
          .from('trading_plans')
          .select('id, date, pair, narrative, plan_data')
          .eq('id', id)
          .eq('is_public', true)
          .maybeSingle();
        if (e) throw e;
        if (!data) throw new Error('closed');
        setPlan(data);
      } catch (err) {
        setError(err.message === 'closed' ? 'closed' : 'missing');
      } finally {
        setLoading(false);
      }
    }
    fetchPlan();
  }, [id]);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoom(null);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [zoom]);

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
      <div className="mx-auto flex w-full max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link to={user ? '/app' : '/auth'} className="flex items-center gap-2.5">
          <EdgeMonogram />
          <span className="hidden sm:block"><EdgeWordmark /></span>
        </Link>

        <span
          className="ml-1 hidden rounded-lg px-2.5 py-1 text-[12px] font-semibold sm:block"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }}
        >
          спільний план
        </span>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <button
              onClick={() => navigate('/app')}
              className="group flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
            >
              До застосунку
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

  /* ---------- Стани ---------- */
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
            <h1
              className="mb-2 text-[24px] font-bold"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
            >
              {error === 'closed' ? 'План закритий' : 'Плану не існує'}
            </h1>
            <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {error === 'closed'
                ? 'Власник ще не відкрив доступ до цього плану. Попроси його натиснути «поділитись» — і посилання запрацює.'
                : 'Схоже, посилання застаріло або план видалили.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const d = plan.plan_data || {};
  const bias = BIAS[plan.narrative] || null;
  const BiasIcon = bias?.icon;
  const tda = (d.tdaBlocks || []).filter((b) => b.image || b.text?.trim());
  const updates = (d.updates || []).filter((b) => b.image || b.text?.trim());
  const review = (d.reviewBlocks || []).filter((b) => b.image || b.text?.trim());

  return (
    <div className="relative min-h-screen" style={{ background: T.bg }}>
      <PlanBackdrop />

      <div className="relative z-10">
        <TopBar />

        <div className="mx-auto w-full max-w-[1100px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
          {/* ─────────── Шапка плану ─────────── */}
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="mb-10"
          >
            <div
              className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.22em]"
              style={{ fontFamily: T.sans, color: T.acc }}
            >
              Daily plan
            </div>

            <h1
              className="mb-5 text-[32px] font-bold capitalize leading-none sm:text-[44px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              {d.title || plan.pair}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-semibold"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              >
                <CalendarDays size={13} strokeWidth={2.2} style={{ color: T.text4 }} />
                {fmtDate(plan.date)}
              </span>

              <span
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-bold"
                style={{
                  background: `rgba(${T.accRgb},0.09)`,
                  border: `1px solid rgba(${T.accRgb},0.22)`,
                  color: T.acc,
                  fontFamily: T.sans,
                }}
              >
                <LinkIcon size={13} strokeWidth={2.4} />
                {plan.pair}
              </span>

              {plan.narrative && (
                <span
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-bold"
                  style={{
                    background: bias ? `rgba(${bias.rgb},0.09)` : T.surface,
                    border: `1px solid ${bias ? `rgba(${bias.rgb},0.24)` : T.line}`,
                    color: bias ? bias.color : T.text2,
                    fontFamily: T.sans,
                  }}
                >
                  {BiasIcon ? <BiasIcon size={13} strokeWidth={2.5} /> : <Book size={13} strokeWidth={2.2} />}
                  {plan.narrative}
                </span>
              )}
            </div>
          </motion.header>

          <div className="flex flex-col gap-11">
            {tda.length > 0 && (
              <Section icon={Crosshair} title="Top down analysis" delay={0.05}>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {tda.map((b, i) => <ChartBlock key={i} block={b} onZoom={setZoom} />)}
                </div>
              </Section>
            )}

            {d.planText?.trim() && (
              <Section icon={NotebookPen} title="План на день" delay={0.1}>
                <Card><Prose text={d.planText} /></Card>
              </Section>
            )}

            {updates.length > 0 && (
              <Section icon={Clock} title="Оновлення по ходу сесії" delay={0.15}>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {updates.map((u, i) => <ChartBlock key={i} block={u} eyebrow={u.date} onZoom={setZoom} />)}
                </div>
              </Section>
            )}

            {review.length > 0 && (
              <Section icon={Crosshair} title="Як вийшло насправді" delay={0.2}>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {review.map((b, i) => <ChartBlock key={i} block={b} onZoom={setZoom} />)}
                </div>
              </Section>
            )}

            {d.conclusionsText?.trim() && (
              <Section icon={Book} title="Висновки" delay={0.25}>
                <Card><Prose text={d.conclusionsText} /></Card>
              </Section>
            )}
          </div>

          {/* ─────────── Тиха реклама внизу ─────────── */}
          {!user && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
              className="mt-16 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-7"
              style={{
                background: `linear-gradient(120deg, rgba(${T.accRgb},0.06), ${T.surface} 60%)`,
                border: `1px solid ${T.line}`,
              }}
            >
              <EdgeMonogram />
              <div className="min-w-0 flex-1">
                <p
                  className="text-[16px] font-bold"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}
                >
                  Такий план можна вести й собі
                </p>
                <p className="mt-1 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                  Edge Journal — журнал для трейдера: плани по днях, розбір угод,
                  статистика й робота з помилками в одному місці.
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

      {/* ─────────── Лайтбокс ─────────── */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setZoom(null)}
            className="fixed inset-0 z-[400] flex cursor-zoom-out items-center justify-center p-4 sm:p-10"
            style={{ background: 'rgba(6,6,8,0.93)', backdropFilter: 'blur(10px)' }}
          >
            <motion.img
              src={zoom}
              alt=""
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="max-h-full max-w-full rounded-2xl object-contain"
              style={{ border: `1px solid ${T.lineHi}` }}
            />
            <button
              onClick={() => setZoom(null)}
              className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}`, color: T.text2 }}
            >
              <X size={17} strokeWidth={2.4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
