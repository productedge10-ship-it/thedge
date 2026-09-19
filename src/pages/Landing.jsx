import { lazy, Suspense, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { useEdgeFonts } from '../lib/theme';
import { C, F, A, Cat, KEYFRAMES } from '../components/landing/v3/base';
import Hero, { Ticker } from '../components/landing/v3/Hero';

/* Дев'ять секцій нижче першого екрана плюс підвал — окремим шматком.
   Подробиці, чому саме так, — у самому BelowFold.jsx. */
const BelowFold = lazy(() => import('../components/landing/v3/BelowFold'));

/* ==================================================================
   Landing.

   Дванадцять блоків, і жоден не повторює форму сусіднього: живий
   журнал, стрічка, рейка кроків, машина дисципліни, конвеєр імпорту,
   вікно застосунку, розбір від коуча, таймлайн дня, тихий блок
   заперечень, ціни, питання, футер.

   Це не прикраса, а спосіб тримати сторінку короткою: коли кожен
   екран виглядає інакше, людина гортає далі, бо цікаво, а не тому
   що ще не дійшла до кнопки.
================================================================== */

const NAV = [
  ['#product', 'Продукт'],
  ['#coach', 'Коуч'],
  ['#pricing', 'Ціни'],
  ['/uk/blog', 'Блог'],
  ['#faq', 'Питання'],
];

function Header() {
  const [shrunk, setShrunk] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lang, setLang] = useState('UA');
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setShrunk(y > 400);
      setProgress(h > 0 ? Math.min(1, y / h) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!langOpen) return undefined;
    const away = () => setLangOpen(false);
    document.addEventListener('click', away);
    return () => document.removeEventListener('click', away);
  }, [langOpen]);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 60, background: 'rgba(8,8,12,.78)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, transition: 'height .25s ease', height: shrunk ? 56 : 64 }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Cat size={36} />
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 15.5, letterSpacing: '2.4px', color: '#fff', whiteSpace: 'nowrap' }}>
            THE <span style={{ color: C.acc }}>EDGE</span>
          </span>
        </a>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 26, fontFamily: F.sans, fontSize: 14.5, fontWeight: 500 }}>
          {NAV.map(([href, label]) => (
            <a
              key={href}
              href={href}
              style={{ color: '#b8b8c8', whiteSpace: 'nowrap', transition: 'color .16s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#b8b8c8'; }}
            >
              {label}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLangOpen((v) => !v); }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: '#c9c9d8', borderRadius: 999, padding: '7px 13px', fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, letterSpacing: '.6px', cursor: 'pointer', transition: 'all .16s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.45); e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = '#c9c9d8'; }}
            >
              <Globe size={13} strokeWidth={2} />
              {lang}
            </button>

            {langOpen && (
              <div style={{ position: 'absolute', top: 44, right: 0, background: '#101016', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: 6, minWidth: 78, boxShadow: '0 24px 60px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 5 }}>
                {['UA', 'EN', 'RU'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => { setLang(code); setLangOpen(false); }}
                    style={{ textAlign: 'left', background: 'transparent', border: 0, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', color: lang === code ? '#fff' : '#7d7d90' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = A(0.14); }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {code}
                  </button>
                ))}
              </div>
            )}
          </div>

          <a href="/auth" style={{ fontFamily: F.sans, fontSize: 14.5, fontWeight: 600, color: '#c9c9d8', whiteSpace: 'nowrap' }}>Вхід</a>

          <a
            href="/auth"
            style={{ background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, color: '#fff', fontFamily: F.sans, fontSize: 14, fontWeight: 700, padding: '10px 18px', borderRadius: 11, whiteSpace: 'nowrap', boxShadow: '0 10px 28px rgba(74,59,245,.34)', transition: 'box-shadow .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 14px 36px rgba(74,59,245,.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 10px 28px rgba(74,59,245,.34)'; }}
          >
            Почати безкоштовно
          </a>
        </div>
      </div>

      <div style={{ height: 2, background: `linear-gradient(90deg,${C.accDeep},${C.acc})`, transition: 'width .1s linear', width: `${(progress * 100).toFixed(2)}%` }} />
    </header>
  );
}

export default function Landing() {
  useEdgeFonts();

  /* Прапорець «перший кадр уже намальовано».

     Ефекти виконуються після того, як браузер розклав сторінку, а
     requestIdleCallback чекає ще й на вільну мить. Разом це означає:
     герой встигає з'явитись на екрані раніше, ніж React візьметься
     за решту сторінки.

     timeout — страховка. Без нього на завантаженому процесорі
     «вільна мить» може не настати зовсім, і низ сторінки не приїде
     ніколи. Півтори секунди — стеля, після якої малюємо в будь-якому
     разі. Де requestIdleCallback немає (Safari донедавна) — звичайний
     таймер. */
  const [belowReady, setBelowReady] = useState(false);

  useEffect(() => {
    const w = window;
    const show = () => setBelowReady(true);

    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(show, { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(show, 200);
    return () => clearTimeout(t);
  }, []);

  /* Вхід одразу на якір.

     Посилання виду /#pricing приходять із реклами й із власного
     підвалу. У момент завантаження цієї секції в DOM ще немає, тож
     браузер нікуди не переходить і людина лишається на початку
     сторінки. Тому доводимо її самі — коли блоки вже на місці. */
  useEffect(() => {
    if (!belowReady) return;
    const { hash } = window.location;
    if (!hash || hash.length < 2) return;

    /* Хеш приходить із адреси, тобто ним керує хто завгодно:
       querySelector на кшталт `#1` кидає виняток і зносить рендер. */
    let target = null;
    try {
      target = document.querySelector(hash);
    } catch {
      target = null;
    }
    target?.scrollIntoView();
  }, [belowReady]);

  return (
    <div className="ln-root" style={{ background: C.bg, minHeight: '100vh', overflowX: 'hidden', color: C.text }}>
      <style>{`
        ${KEYFRAMES}
        html{scroll-behavior:smooth;scroll-padding-top:96px;}
      `}</style>

      <Header />
      <Hero />
      <Ticker />

      {/* fallback порожній навмисне: усе, що сюди приходить, лежить
          за межею першого екрана, і будь-яка заглушка була б
          мерехтінням у місці, куди ніхто ще не дивиться. */}
      {belowReady && (
        <Suspense fallback={null}>
          <BelowFold />
        </Suspense>
      )}
    </div>
  );
}
