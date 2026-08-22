import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Lock, ArrowRight, ImageDown, Printer } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { renderCardSvg, svgToPng, download, loadPublicCard } from '../lib/statCard';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';

/* ==================================================================
   Публічна картка статистики.

   Показує зліпок, а не поточний стан журналу: цифри такі, якими вони
   були в момент експорту. Тому сторінка нічого не рахує — вона лише
   малює те, що вже збережено.
================================================================== */

export default function SharedStats() {
  useEdgeFonts();

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await loadPublicCard(id);
        if (!alive) return;
        if (!c) setError('missing');
        else setCard(c);
      } catch {
        if (alive) setError('missing');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const svg = useMemo(() => (card ? renderCardSvg(card) : ''), [card]);

  const savePng = async () => {
    try {
      const blob = await svgToPng(svg, 2);
      download(blob, 'edge-stats.png');
    } catch { /* мовчки: це не критична дія */ }
  };

  const TopBar = () => (
    <div
      className="sticky top-0 z-40"
      style={{
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${T.line}`,
      }}
    >
      <div className="mx-auto flex w-full max-w-[1000px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link to={user ? '/app' : '/auth'} className="flex items-center gap-2.5">
          <EdgeMonogram />
          <span className="hidden sm:block"><EdgeWordmark /></span>
        </Link>

        <span
          className="ml-1 hidden rounded-lg px-2.5 py-1 text-[12px] font-semibold sm:block"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }}
        >
          статистика
        </span>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <button
              onClick={() => navigate('/analytics')}
              className="group flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
            >
              Моя аналітика
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
              Картки не існує
            </h1>
            <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              Посилання застаріло або автор видалив цю статистику.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen" style={{ background: T.bg }}>
      <PlanBackdrop />

      <div className="relative z-10">
        <TopBar />

        <div className="mx-auto w-full max-w-[1000px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
          <motion.div
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.55, ease: EASE }}
            className="overflow-hidden rounded-3xl"
            style={{
              border: `1px solid ${T.line}`,
              boxShadow: '0 40px 100px -40px rgba(0,0,0,0.95)',
            }}
          >
            {/* Інлайн, а не <img>: інакше до картки не застосовується
                Space Grotesk і логотип на ній перестає бути логотипом. */}
            <div
              className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </motion.div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="mr-auto text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Зліпок від {new Date(card.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}цифри тут більше не змінюються
            </span>

            <button
              onClick={() => window.print()}
              className="flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200 no-print"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
            >
              <Printer size={14} strokeWidth={2.2} />
              PDF
            </button>

            <button
              onClick={savePng}
              className="flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200 no-print"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
            >
              <ImageDown size={14} strokeWidth={2.2} />
              Картинка
            </button>
          </div>

          {!user && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
              className="mt-14 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-7 no-print"
              style={{
                background: `linear-gradient(120deg, rgba(${T.accRgb},0.06), ${T.surface} 60%)`,
                border: `1px solid ${T.line}`,
              }}
            >
              <EdgeMonogram />
              <div className="min-w-0 flex-1">
                <EdgeWordmark size={12} tracking={3.2} color={T.text4} />
                <p className="mt-1.5 text-[16px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                  Така картка збирається за два кліки
                </p>
                <p className="mt-1 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                  Журнал рахує статистику сам — лишається обрати, які цифри показати.
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

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #0A0A0C; }
        }
      `}</style>
    </div>
  );
}
