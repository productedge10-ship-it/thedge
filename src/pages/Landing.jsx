import { useEffect, useState } from 'react';
import { Globe, Menu, X } from 'lucide-react';
import { useEdgeFonts } from '../lib/theme';
import { C, F, A, Cat, KEYFRAMES } from '../components/landing/v3/base';
import Hero, { Ticker } from '../components/landing/v3/Hero';
import Steps from '../components/landing/v3/Steps';
import Difference from '../components/landing/v3/Difference';
import AutoImport from '../components/landing/v3/AutoImport';
import Product from '../components/landing/v3/Product';
import Coach from '../components/landing/v3/Coach';
import { Rhythm, NotDoing, Pricing, FinalFaq } from '../components/landing/v3/Closing';
import FontLab from '../components/landing/FontLab';

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

const FOOTER_COLS = [
  { title: 'ПРОДУКТ', links: [['#product', 'Що всередині'], ['#autoimport', 'Автоімпорт'], ['#coach', 'AI-коуч']] },
  { title: 'ТАРИФИ', links: [['#pricing', 'Ціни'], ['#pricing', 'Free'], ['#pricing', 'Pro']] },
  { title: 'ДОВІДКА', links: [['#faq', 'Питання'], ['/uk/blog', 'Блог'], ['#autoimport', 'Твої дані'], ['#faq', 'Підключення MT5']] },
  /* Окрема колонка, а не рядок дрібним шрифтом унизу. Умови шукають
     тоді, коли вже щось сталося, — і знаходити їх мають там, де
     шукають решту посилань, а не в підвалі підвалу. */
  { title: 'ПРАВО', links: [['/terms', 'Умови користування']] },
];

/* Брейкпоінт хедера: нижче нього навігація, мова, «Вхід» і CTA не
   вміщаються поруч із логотипом (перевірено від 320px), тож ховаємо
   їх за бургером. CTA в самому хедері на мобільному теж прибираємо —
   такий самий, тільки більший, і так стоїть у героя першим екраном
   нижче, дублювати його тут нема сенсу, а місця він забирає багато. */
const HEADER_BP = 880;

function Header() {
  const [shrunk, setShrunk] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lang, setLang] = useState('UA');
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <style>{`
        .ln-h-desktop{display:flex}
        .ln-h-burger{display:none}
        @media (max-width:${HEADER_BP}px){
          .ln-h-desktop{display:none !important}
          .ln-h-burger{display:flex !important}
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 clamp(16px,4vw,32px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, transition: 'height .25s ease', height: shrunk ? 56 : 64 }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 0 }} onClick={() => setMobileOpen(false)}>
          <Cat size={32} />
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 14.5, letterSpacing: '2px', color: '#fff', whiteSpace: 'nowrap' }}>
            THE <span style={{ color: C.acc }}>EDGE</span>
          </span>
        </a>

        <nav className="ln-h-desktop" style={{ alignItems: 'center', gap: 26, fontFamily: F.sans, fontSize: 14.5, fontWeight: 500 }}>
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

        <div className="ln-h-desktop" style={{ alignItems: 'center', gap: 14, flexShrink: 0 }}>
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

        <button
          type="button"
          className="ln-h-burger"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Закрити меню' : 'Відкрити меню'}
          style={{ alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 10, color: '#e9e9f2', cursor: 'pointer' }}
        >
          {mobileOpen ? <X size={18} strokeWidth={2.2} /> : <Menu size={18} strokeWidth={2.2} />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="ln-h-burger"
          style={{
            flexDirection: 'column', gap: 3, position: 'absolute', top: '100%', left: 0, right: 0,
            maxHeight: 'calc(100vh - 56px)', overflowY: 'auto', padding: '10px 16px 22px',
            background: '#0a0a0e', borderBottom: '1px solid rgba(255,255,255,.08)',
            boxShadow: '0 26px 60px rgba(0,0,0,.55)', animation: 'lnFadeUp .2s ease-out',
          }}
        >
          {NAV.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              style={{ padding: '13px 6px', fontFamily: F.sans, fontSize: 15.5, fontWeight: 600, color: '#e4e4ee', borderBottom: '1px solid rgba(255,255,255,.05)' }}
            >
              {label}
            </a>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            {['UA', 'EN', 'RU'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                style={{
                  flex: 1, textAlign: 'center', fontFamily: F.sans, fontSize: 13, fontWeight: 700,
                  padding: '9px 0', borderRadius: 9, cursor: 'pointer',
                  background: lang === code ? A(0.16) : 'rgba(255,255,255,.04)',
                  border: `1px solid ${lang === code ? A(0.4) : 'rgba(255,255,255,.08)'}`,
                  color: lang === code ? '#fff' : '#8a8a9c',
                }}
              >
                {code}
              </button>
            ))}
          </div>

          <a
            href="/auth"
            onClick={() => setMobileOpen(false)}
            style={{ textAlign: 'center', marginTop: 14, fontFamily: F.sans, fontSize: 14.5, fontWeight: 600, color: '#c9c9d8', padding: '12px 0' }}
          >
            Вхід
          </a>

          <a
            href="/auth"
            onClick={() => setMobileOpen(false)}
            style={{ textAlign: 'center', marginTop: 6, background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, color: '#fff', fontFamily: F.sans, fontSize: 15, fontWeight: 700, padding: '15px 0', borderRadius: 13, boxShadow: '0 10px 28px rgba(74,59,245,.34)' }}
          >
            Почати безкоштовно
          </a>
        </div>
      )}

      <div style={{ height: 2, background: `linear-gradient(90deg,${C.accDeep},${C.acc})`, transition: 'width .1s linear', width: `${(progress * 100).toFixed(2)}%` }} />
    </header>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', background: '#0a0a0e' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(28px,7vw,40px) clamp(16px,4vw,32px)', display: 'flex', gap: 44, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 220px', minWidth: 'min(220px,100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Cat size={34} />
            <div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 14.5, letterSpacing: '2.2px', color: '#fff' }}>
                THE <span style={{ color: C.acc }}>EDGE</span>
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '1.5px', color: C.dim, marginTop: 3 }}>
                PLAN THE TRADE — TRADE THE PLAN
              </div>
            </div>
          </div>
        </div>

        {FOOTER_COLS.map((col) => (
          <div key={col.title} style={{ flex: '0 1 150px' }}>
            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.6px', color: C.dim, marginBottom: 14 }}>{col.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map(([href, label]) => (
                <a
                  key={label}
                  href={href}
                  style={{ fontFamily: F.sans, fontSize: 13.5, color: '#8a8a9c', transition: 'color .16s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.accSoft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#8a8a9c'; }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        ))}

        <div style={{ flex: '0 1 150px', textAlign: 'right', fontFamily: F.mono, fontSize: 12, color: C.dim }}>
          © 2026 Edge Journal
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEdgeFonts();

  return (
    <div className="ln-root" style={{ background: C.bg, minHeight: '100vh', overflowX: 'hidden', color: C.text }}>
      <style>{`
        ${KEYFRAMES}
        html{scroll-behavior:smooth;scroll-padding-top:96px;}
      `}</style>

      <Header />
      <Hero />
      <Ticker />
      <Steps />
      <Difference />
      <AutoImport />
      <Product />
      <Coach />
      <Rhythm />
      <NotDoing />
      <Pricing />
      <FinalFaq />
      <Footer />

      {/* Примірочна шрифтів. Інструмент вибору, не функція для
          відвідувача: щойно гарнітура затверджена — значення переїжджає
          в theme.js, а цей рядок зникає. */}
      <FontLab />
    </div>
  );
}
