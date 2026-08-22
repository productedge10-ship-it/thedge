import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight, Check, Minus, X as XIcon, Target, BookOpen, BarChart2,
  BrainCircuit, History, Activity, Sparkles, ShieldCheck, MonitorDot, ChevronDown,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { applyTheme } from '../lib/themes';
import { LangProvider, useLang } from '../lib/i18n';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';
import StarField from '../components/ui/StarField';
import ClickBurst from '../components/landing/ClickBurst';
import LangSwitcher from '../components/landing/LangSwitcher';
import Playground from '../components/landing/Playground';
import Mt5Import from '../components/landing/Mt5Import';
import Term from '../components/landing/Term';
import FontLab from '../components/landing/FontLab';

/* ==================================================================
   Landing.

   Один екран, щоб зачепити, і рівно стільки нижче, скільки треба,
   щоб зняти заперечення. Порядок навмисний: спершу обіцянка й
   кнопка, потім «до і після» — бо людина впізнає себе в лівій
   колонці, потім можливість натиснути й перевірити, і аж потім
   розповідь про нас.

   Тексти живуть у lib/i18n, а не тут: вітрина міняється часто, і
   три мови в трьох файлах означали б, що дві версії завжди застарілі.
================================================================== */

/* Скільки трейдерів уже в базі. Цифра йде на перший екран, тому
   вона має бути чесною — постав реальну і піднімай у міру росту. */
const TRADERS = 1980;

/* Девіз. Живе тут, а не в словнику мов, і це навмисно: це цитата з
   трейдерського фольклору, яку впізнають у будь-якій країні. У
   перекладі вона перестає бути цитатою й стає просто реченням —
   «плануй угоду, торгуй за планом» звучить як інструкція, а не як
   те, що трейдери кажуть одне одному двадцять років. */
const MOTTO = 'Plan the trade — Trade the plan';

const SITE = 'https://edgejournal.app';
const TITLE = 'Edge Journal — Measure your edge, find your advantage';
const DESC = 'A trading journal that reads your own trades back to you: which setup pays, which session drains you, and what your worst habit costs in R. Plan, log, and let the analytics find your edge.';

/* ---------- SEO ----------
   Один хук замість зовнішньої бібліотеки: сторінка одна, і тягнути
   заради неї helmet немає сенсу. */
function useSeo(faq) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;

    const tags = [
      ['name', 'description', DESC],
      ['name', 'keywords', 'trading journal, trading analytics, prop firm journal, trading psychology, forex journal, backtesting, trading plan'],
      /* Колір вкладки в браузері — це не CSS, змінна тут не працює */
      ['name', 'theme-color', '#0A0A0C'],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'Edge Journal'],
      ['property', 'og:title', TITLE],
      ['property', 'og:description', DESC],
      ['property', 'og:url', SITE],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', TITLE],
      ['name', 'twitter:description', DESC],
    ];

    const made = tags.map(([attr, key, content]) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute('content');
      el.setAttribute('content', content);
      return { el, prev, created };
    });

    let link = document.head.querySelector('link[rel="canonical"]');
    const linkCreated = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = SITE;

    /* Розмітка для пошуку: без неї Google бачить просто сторінку,
       з нею — застосунок з ціною й категорією */
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Edge Journal',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description: DESC,
      url: SITE,
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Pro monthly', price: '12', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Pro yearly', price: '99', priceCurrency: 'USD' },
      ],
    });
    document.head.appendChild(ld);

    /* Окремий блок під FAQ: з ним Google показує питання прямо у
       видачі, а це найдешевший спосіб зайняти більше місця на екрані
       результатів. */
    const faqLd = document.createElement('script');
    faqLd.type = 'application/ld+json';
    faqLd.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (faq || []).map((x) => ({
        '@type': 'Question',
        name: x.q,
        acceptedAnswer: { '@type': 'Answer', text: x.a },
      })),
    });
    document.head.appendChild(faqLd);

    return () => {
      document.title = prevTitle;
      made.forEach(({ el, prev, created }) => {
        if (created) el.remove();
        else if (prev !== null) el.setAttribute('content', prev);
      });
      if (linkCreated) link.remove();
      ld.remove();
      faqLd.remove();
    };
  }, [faq]);
}

/* ---------- плавний перехід між секціями ----------
   scrollIntoView не вміє відступу під липку шапку, тому рахуємо
   позицію самі: інакше заголовок секції щоразу ховається під меню. */
const HEADER = 76;

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER;
  window.scrollTo({ top, behavior: 'smooth' });
}

/* Яка секція зараз під шапкою */
function useActiveSection(ids) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    const onScroll = () => {
      let cur = null;
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.getBoundingClientRect().top - HEADER - 40 <= 0) cur = id;
      });
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ids]);

  return active;
}

/* ---------- дрібні блоки ---------- */

function Reveal({ children, delay = 0, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }) {
  return (
    <div
      className="mb-3 inline-flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.22em]"
      style={{ fontFamily: T.sans, color: T.acc }}
    >
      <span className="h-px w-6" style={{ background: `rgba(${T.accRgb},0.5)` }} />
      {children}
    </div>
  );
}

function H2({ children, className = '' }) {
  return (
    <h2
      className={`text-[30px] font-bold leading-[1.1] sm:text-[40px] ${className}`}
      style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
    >
      {children}
    </h2>
  );
}

/* Плитка зі світлом за курсором — той самий прийом, що в застосунку */
function track(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function Tile({ icon: Icon, title, text, hue }) {
  return (
    <div
      onPointerMove={track}
      className="ln-tile relative overflow-hidden rounded-2xl p-5"
      style={{ '--hue': hue, border: `1px solid ${T.line}` }}
    >
      <span aria-hidden className="ln-bloom" />
      <span aria-hidden className="ln-edge" />
      <span
        className="relative z-10 mb-4 grid h-11 w-11 place-items-center rounded-xl"
        style={{ background: `rgba(${hue},0.09)`, border: `1px solid rgba(${hue},0.22)` }}
      >
        <Icon size={19} strokeWidth={2} style={{ color: `rgb(${hue})` }} />
      </span>
      <h3 className="relative z-10 text-[16.5px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>
        {title}
      </h3>
      <p className="relative z-10 mt-1.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );
}

/* Цифра, що набігає, коли доїжджає до екрана */
function Stat({ value, suffix = '', label, tone }) {
  const [n, setN] = useState(0);
  const started = useRef(false);

  return (
    <motion.div
      onViewportEnter={() => {
        if (started.current) return;
        started.current = true;
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / 1100);
          setN(Math.round(value * (1 - (1 - k) ** 3)));
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }}
      viewport={{ once: true, margin: '-60px' }}
    >
      <div className="text-[34px] font-bold tabular-nums leading-none sm:text-[42px]" style={{ fontFamily: T.display, color: tone, letterSpacing: '-0.04em' }}>
        {n}{suffix}
      </div>
      <div className="mt-2 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.5 }}>
        {label}
      </div>
    </motion.div>
  );
}

/* Клітинка таблиці порівняння. Три стани замість двох: риска
   чесніша за хрестик там, де щось таки є, але криво. */
function Mark({ v }) {
  if (v === 'yes') {
    return (
      <span
        className="grid h-7 w-7 place-items-center rounded-lg"
        style={{ background: `rgba(${T.okRgb},0.12)`, border: `1px solid rgba(${T.okRgb},0.28)` }}
      >
        <Check size={14} strokeWidth={3} style={{ color: T.ok }} />
      </span>
    );
  }
  if (v === 'part') {
    return (
      <span
        className="grid h-7 w-7 place-items-center rounded-lg"
        style={{ background: `rgba(${T.warnRgb},0.1)`, border: `1px solid rgba(${T.warnRgb},0.24)` }}
      >
        <Minus size={14} strokeWidth={3} style={{ color: T.warn }} />
      </span>
    );
  }
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ border: `1px solid ${T.line}` }}>
      <XIcon size={13} strokeWidth={2.6} style={{ color: T.text4 }} />
    </span>
  );
}

/* Картка бар'єру. Перша відповідь видна одразу — саме вона знімає
   заперечення; друга ховається під розкриттям, щоб чотири картки
   лишались одного розміру й читались як сітка, а не як простирадло. */
function FaqCard({ group, hue }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = group.items;

  return (
    <div
      onPointerMove={track}
      className="ln-tile relative flex h-full flex-col overflow-hidden rounded-2xl p-6"
      style={{ '--hue': hue, border: `1px solid ${T.line}` }}
    >
      <span aria-hidden className="ln-bloom" />
      <span aria-hidden className="ln-edge" />

      <div className="relative z-10 mb-4 flex items-center gap-2.5">
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]"
          style={{ background: `rgba(${hue},0.1)`, border: `1px solid rgba(${hue},0.22)`, color: `rgb(${hue})`, fontFamily: T.sans }}
        >
          {group.tag}
        </span>
      </div>

      <p
        className="relative z-10 mb-4 text-[15.5px] font-bold"
        style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em', lineHeight: 1.35 }}
      >
        {group.lead}
      </p>

      <div className="relative z-10 flex-1">
        <p className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
          {first.q}
        </p>
        <p className="mt-1.5 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
          {first.a}
        </p>

        <AnimatePresence initial={false}>
          {open && rest.map((x) => (
            <motion.div
              key={x.q}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div className="pt-4">
                <p className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                  {x.q}
                </p>
                <p className="mt-1.5 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                  {x.a}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {rest.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative z-10 mt-5 flex items-center gap-1.5 text-[13px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, color: `rgb(${hue})` }}
        >
          {open ? '−' : '+'} {rest.length}
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className="transition-transform duration-300"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      )}
    </div>
  );
}

/* Чи видно на екрані блок, у якому вже є велика кнопка. Плаваючий
   заклик тоді ховається: дві однакові кнопки в одному кадрі — це не
   наполегливість, а шум. */
function useCtaVisible(ids) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      const hit = ids.some((id) => {
        const el = document.getElementById(id);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });
      setVisible(hit);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [ids]);

  return visible;
}

const NAV_IDS = ['product', 'import', 'pricing', 'faq'];

/* Секції, де велика кнопка вже є на екрані */
const CTA_ZONES = ['hero', 'pricing', 'final'];

/* ================================================================== */

function LandingBody() {
  useEdgeFonts();

  /* Вітрина завжди темна.

     Тема застосунку — це вибір користувача для роботи, а лендінг —
     не робота. Він знятий, підсвічений і зверстаний під чорне: у
     світлій темі його градієнти й світіння просто зникають. Тому на
     час, поки людина тут, примусово вмикаємо темні кольори, а на
     виході повертаємо те, що вона собі обрала. */
  useEffect(() => {
    applyTheme('dark');
    return () => {
      let saved = 'dark';
      try {
        saved = JSON.parse(localStorage.getItem('edge_cloud_settings') || '{}')?.theme || 'dark';
      } catch { /* приватний режим */ }
      applyTheme(saved);
    };
  }, []);

  const { t, lang } = useLang();
  useSeo(t.faq.groups.flatMap((g) => g.items));
  /* AuthProvider не рендерить дітей, поки сесія не прочитана —
     тому тут user уже точний, окремий стан завантаження не потрібен */
  const { user } = useAuth();

  const heroRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const active = useActiveSection(NAV_IDS);
  const ctaOnScreen = useCtaVisible(CTA_ZONES);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Паралакс шарів у першому екрані. Рухається тільки картинка —
     текст стоїть, бо текст, що їде під час читання, дратує. */
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const artY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  /* Залогінених не тримаємо на вітрині */
  if (user) return <Navigate to="/app" replace />;

  const navItems = [
    ['import', t.mt5.eyebrow],
    ['product', t.nav.product],
    ['pricing', t.nav.pricing],
    ['faq', t.nav.faq],
  ];

  return (
    /* overflow-x-clip, а не hidden: hidden робить цей блок скрол-
       контейнером, і липкий хедер перестає липнути до вікна —
       саме тому він раніше їхав угору разом зі сторінкою */
    <div className="ln-page relative min-h-screen overflow-x-clip" style={{ background: T.bg }}>
      <ClickBurst />

      <style>{`
        html { scroll-behavior: smooth; }

        .ln-tile {
          --mx: 50%; --my: 50%; --hue: ${T.accRgb};
          isolation: isolate;
          background-color: rgba(255,255,255,0.014);
          transition: background-color .4s ease, border-color .4s ease, box-shadow .45s ease;
        }
        .ln-tile:hover {
          background-color: rgba(255,255,255,0.03);
          border-color: rgba(var(--hue), 0.2) !important;
          box-shadow: 0 26px 60px -40px rgba(var(--hue), 0.7);
        }
        .ln-bloom, .ln-edge {
          position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        }
        .ln-bloom {
          background: radial-gradient(240px circle at var(--mx) var(--my), rgba(var(--hue), .1), transparent 64%);
          opacity: 0; transition: opacity .35s ease;
        }
        .ln-tile:hover .ln-bloom { opacity: 1; }
        .ln-edge {
          padding: 1px;
          background: radial-gradient(200px circle at var(--mx) var(--my),
            rgba(var(--hue), .9), rgba(var(--hue), .22) 36%, transparent 68%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0; transition: opacity .3s ease;
        }
        .ln-tile:hover .ln-edge { opacity: 1; }

        /* Кнопки: відблиск пробігає, а під курсором стоїть м'яка
           пляма світла. Разом дає відчуття скла, а не заливки. */
        .ln-cta { --mx: 50%; --my: 50%; position: relative; overflow: hidden; }

        .ln-cta::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(120px circle at var(--mx) var(--my), rgba(255,255,255,.28), transparent 62%);
          opacity: 0;
          transition: opacity .3s ease;
        }
        .ln-cta:hover::before { opacity: 1; }

        .ln-cta::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,.5) 50%, transparent 62%);
          transform: translateX(-130%);
          transition: transform .8s cubic-bezier(.22,1,.36,1);
        }
        .ln-cta:hover::after { transform: translateX(130%); }

        /* Рядок таблиці порівняння підсвічується цілком */
        .ln-crow { transition: background-color .25s ease; }
        .ln-crow:hover { background-color: rgba(255,255,255,0.022); }

        /* ==========================================================
           Доступність.

           Мінімальна зона натискання 44px — це не про мобільні, а про
           те, що людина не влучає мишею в 20-піксельний прямокутник.
           Там, де зменшувати вигляд не можна, розширюємо зону
           псевдоелементом: візуально нічого не міняється, а промах
           зникає.
        ========================================================== */
        .ln-tap { position: relative; }
        .ln-tap::before {
          content: '';
          position: absolute;
          left: 50%; top: 50%;
          width: max(100%, 44px);
          height: max(100%, 44px);
          transform: translate(-50%, -50%);
        }

        /* Обвід фокуса. Показуємо тільки тим, хто ходить клавіатурою:
           :focus-visible не спрацьовує від кліку мишею. */
        .ln-page a:focus-visible,
        .ln-page button:focus-visible,
        .ln-page [tabindex]:focus-visible {
          outline: 2px solid ${T.acc};
          outline-offset: 3px;
          border-radius: 10px;
        }

        /* Текстові посилання відрізняються від кнопок підкресленням,
           що виїжджає, а не кольором — колір у нас уже зайнятий. */
        .ln-link { position: relative; }
        .ln-link::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -2px;
          height: 1px;
          background: currentColor;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform .28s cubic-bezier(.22,1,.36,1);
        }
        .ln-link:hover::after { transform: scaleX(1); }

        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
        }
      `}</style>

      {/* ─────────── Фон ─────────── */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div
          className="absolute left-1/2 top-0 h-[760px] w-[1500px] -translate-x-1/2"
          style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(${T.accRgb},0.14) 0%, transparent 66%)`, filter: 'blur(60px)' }}
        />
        {/* Ті самі живі крапки, що на Launchpad: дрейфують, розходяться
            хвилею від курсора й дають коло на клік */}
        <div className="absolute inset-0 opacity-[0.55]">
          <StarField />
        </div>
      </div>

      {/* ─────────── Шапка ─────────── */}
      <header
        className="sticky top-0 z-40 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(10,10,12,0.82)' : 'rgba(10,10,12,0.4)',
          backdropFilter: `blur(${scrolled ? 20 : 10}px)`,
          borderBottom: `1px solid ${scrolled ? T.line : 'transparent'}`,
          boxShadow: scrolled ? '0 18px 40px -34px rgba(0,0,0,0.95)' : 'none',
        }}
      >
        <nav className="mx-auto flex w-full max-w-[1480px] items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-10">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5">
            <EdgeMonogram />
            <span className="hidden sm:block"><EdgeWordmark accent /></span>
          </button>

          <div className="ml-auto hidden items-center gap-1 md:flex">
            {navItems.map(([id, label]) => {
              const on = active === id;
              return (
                <button
                  key={id}
                  onClick={() => scrollToId(id)}
                  className="ln-tap relative flex h-11 items-center rounded-lg px-3.5 text-[14px] font-semibold transition-colors duration-200"
                  style={{ fontFamily: T.sans, color: on ? T.text : T.text2 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = on ? T.text : T.text2)}
                >
                  <motion.span
                    key={label}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="inline-block"
                  >
                    {label}
                  </motion.span>
                  {/* Підкреслення переїжджає між пунктами, а не
                      зникає й зʼявляється — так видно, куди ти поїхав */}
                  {on && (
                    <motion.span
                      layoutId="ln-nav-underline"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full"
                      style={{ background: T.acc, boxShadow: `0 0 10px rgba(${T.accRgb},0.7)` }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <LangSwitcher />
            <Link
              to="/auth"
              className="ln-link ln-tap hidden h-11 items-center px-2.5 text-[14px] font-semibold transition-colors duration-200 sm:flex"
              style={{ fontFamily: T.sans, color: T.text2 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
            >
              {t.nav.login}
            </Link>
            {/* Дублікат головної кнопки виходить лише тоді, коли
                героя вже не видно. Два однакові заклики в одному
                екрані ділять увагу, і жоден не виграє. */}
            <AnimatePresence>
              {scrolled && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.26, ease: EASE }}
                >
                  <Link
                    to="/auth"
                    onPointerMove={track}
                    className="ln-cta flex h-11 items-center whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-transform duration-200 active:scale-[0.98]"
                    style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                  >
                    <span className="relative z-10">{t.nav.start}</span>
                  </Link>
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </nav>
      </header>

      {/* Зміна мови — не перезавантаження сторінки, тому вміст
          перетікає: короткий розчин з розмиттям замість підміни
          тексту в кадрі */}
      <motion.main
        key={lang}
        initial={{ opacity: 0, filter: 'blur(5px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative z-10"
      >

        {/* ═══════════ HERO ═══════════ */}
        <section id="hero" ref={heroRef} className="mx-auto w-full max-w-[1480px] px-4 pb-24 pt-16 sm:px-6 lg:px-10 sm:pb-32 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_540px]">

            <motion.div style={{ opacity: fade }}>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                  style={{ background: `rgba(${T.accRgb},0.08)`, border: `1px solid ${T.lineAcc}`, color: T.acc, fontFamily: T.sans }}
                >
                  <Sparkles size={12} strokeWidth={2.4} />
                  {t.hero.badge}
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.06, ease: EASE }}
                className="mt-6 text-[42px] font-bold leading-[0.98] sm:text-[60px] lg:text-[72px]"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.045em' }}
              >
                {t.hero.title1}
                <span className="block" style={{ color: T.acc }}>{t.hero.title2}</span>
              </motion.h1>

              {/* Девіз одразу під заголовком. Він не пояснює продукт —
                  він показує, що ми з тієї ж культури, що й читач.
                  Тонка лінія зліва тримає його як підпис, а не як
                  другий заголовок. */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.14, ease: EASE }}
                className="mt-5 flex items-center gap-3"
              >
                <span className="h-[14px] w-px shrink-0" style={{ background: `rgba(${T.accRgb},0.6)` }} />
                <span
                  className="text-[12.5px] font-bold uppercase tracking-[0.2em] sm:text-[13.5px]"
                  style={{ fontFamily: T.sans, color: T.text3 }}
                >
                  Plan the trade <span style={{ color: T.acc }}>—</span> Trade the plan
                </span>
              </motion.div>

              {/* Перше входження слова edge пояснюємо тут же: далі по
                  сторінці воно вже працює як звичний термін */}
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.14, ease: EASE }}
                className="mt-6 max-w-[560px] text-[16.5px] sm:text-[18px]"
                style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.65 }}
              >
                {(() => {
                  const parts = t.hero.sub.split('edge');
                  if (parts.length < 2) return t.hero.sub;
                  return (
                    <>
                      {parts[0]}
                      <Term id="edge">edge</Term>
                      {parts.slice(1).join('edge')}
                    </>
                  );
                })()}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.22, ease: EASE }}
                className="mt-9 flex flex-wrap items-center gap-3"
              >
                <Link
                  to="/auth"
                  onPointerMove={track}
                  className="ln-cta group flex h-[54px] items-center gap-2.5 rounded-2xl px-7 text-[16px] font-bold transition-transform duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
                  style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans, boxShadow: `0 16px 44px -14px rgba(${T.accRgb},0.85)` }}
                >
                  <span className="relative z-10 flex items-center gap-2.5">
                    {t.hero.cta}
                    <ArrowRight size={18} strokeWidth={3} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>

                {/* Ціна прямо біля кнопки. Людині, яка вирішує «тиснути
                    чи ні», не має бути потрібно скролити вниз, щоб
                    дізнатись, чи це взагалі безкоштовно. */}
                <span
                  className="w-full text-[13px] sm:w-auto sm:pl-1"
                  style={{ fontFamily: T.sans, color: T.text4 }}
                >
                  {t.paths.priceLine}
                </span>
              </motion.div>

              {/* Скільки часу займе старт — головне заперечення після
                  «а що це». Тому рядок стоїть одразу під кнопкою. */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.28 }}
                className="mt-5 max-w-[520px] text-[14px]"
                style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}
              >
                {t.proof.speed}
              </motion.p>

              {/* Смуга довіри. Тут тільки те, що можна перевірити:
                  реальна кількість користувачів, реальна інтеграція і
                  реальні правила доступу. Вигаданих логотипів і цитат
                  тут не буде — на фінансовому продукті це коштує
                  дорожче, ніж дає. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.34 }}
                className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[13.5px]"
                style={{ fontFamily: T.sans, color: T.text3 }}
              >
                <span className="flex items-center gap-2">
                  <span className="flex -space-x-2">
                    {[T.acc, '#4fd1c5', '#a78bfa'].map((c) => (
                      <span
                        key={c}
                        className="h-6 w-6 rounded-full"
                        style={{ background: `linear-gradient(140deg, ${c}, ${T.sunken})`, border: `1.5px solid ${T.bg}` }}
                      />
                    ))}
                  </span>
                  <b style={{ color: T.text2, fontWeight: 600 }}>{t.proof.joined(TRADERS)}</b>
                </span>
                <span className="flex items-center gap-1.5"><MonitorDot size={14} strokeWidth={2.3} style={{ color: T.info }} /> {t.proof.mt5}</span>
                <span className="flex items-center gap-1.5"><Check size={14} strokeWidth={3} style={{ color: T.ok }} /> {t.hero.trust1}</span>
                <span className="flex items-center gap-1.5"><ShieldCheck size={14} strokeWidth={2.4} style={{ color: T.ok }} /> {t.hero.trust2}</span>
              </motion.div>
            </motion.div>

            {/* Праворуч не картинка, а сам продукт. Найсильніший
                аргумент — те, що в ньому можна клікнути, тому він
                стоїть над згином, а не пʼятою секцією нижче. */}
            <motion.div style={{ y: artY }} className="hidden lg:block">
              <Playground compact />
            </motion.div>
          </div>
        </section>



        {/* ═══════════ ЯК ЦЕ ПРАЦЮЄ ═══════════
            Три кроки й підтримувані ринки в одну смугу. Раніше це
            були три великі картки, які переказували словами те, що
            нижче показано живими блоками — анонс того, що й так буде
            через екран. */}
        <section className="mx-auto w-full max-w-[1480px] px-4 pb-6 sm:px-6 lg:px-10">
          <Reveal>
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-5 py-4 sm:px-7"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              {t.steps.items.map((st, i) => (
                <span key={st.title} className="flex items-center gap-2.5">
                  {i > 0 && <ArrowRight size={13} strokeWidth={2.4} className="mr-1.5" style={{ color: T.text4 }} />}
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11.5px] font-bold tabular-nums"
                    style={{
                      background: `rgba(${[T.accRgb, '56,189,248', T.okRgb][i]},0.1)`,
                      color: `rgb(${[T.accRgb, '56,189,248', T.okRgb][i]})`,
                      fontFamily: T.mono,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                    {st.title}
                  </span>
                </span>
              ))}

              <span className="hidden h-5 w-px xl:block" style={{ background: T.line }} />

              <span
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold"
                style={{ background: `rgba(${T.infoRgb},0.1)`, border: `1px solid rgba(${T.infoRgb},0.24)`, color: T.info, fontFamily: T.sans }}
              >
                <MonitorDot size={12} strokeWidth={2.4} /> MetaTrader 5
              </span>

              <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {t.platforms.manual}: {t.platforms.markets.join(' · ')}
              </span>
            </div>
          </Reveal>
        </section>

        {/* ═══════════ ДО / ПІСЛЯ ═══════════ */}
        <section className="mx-auto w-full max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-28">
          <Reveal className="max-w-[760px]">
            <Eyebrow>{t.diff.eyebrow}</Eyebrow>
            <H2>{t.diff.title1}<br />{t.diff.title2}</H2>
            <p className="mt-5 max-w-[760px] text-[16px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {t.diff.sub}
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Reveal delay={0.05}>
              <div className="h-full rounded-3xl p-6 sm:p-8" style={{ background: T.surface, border: `1px solid rgba(${T.badRgb},0.18)` }}>
                <div
                  className="mb-5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.16em]"
                  style={{ background: `rgba(${T.badRgb},0.08)`, color: T.bad, fontFamily: T.sans }}
                >
                  {t.diff.beforeTag}
                </div>
                <ul className="flex flex-col gap-4">
                  {t.diff.before.map((x) => (
                    <li key={x} className="flex gap-3 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: T.bad, opacity: 0.7 }} />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div
                className="h-full rounded-3xl p-6 sm:p-8"
                style={{ background: `linear-gradient(150deg, rgba(${T.okRgb},0.05), ${T.surface} 60%)`, border: `1px solid rgba(${T.okRgb},0.2)` }}
              >
                <div
                  className="mb-5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.16em]"
                  style={{ background: `rgba(${T.okRgb},0.08)`, color: T.ok, fontFamily: T.sans }}
                >
                  {t.diff.afterTag}
                </div>
                <ul className="flex flex-col gap-4">
                  {t.diff.after.map((x) => (
                    <li key={x} className="flex gap-3 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}>
                      <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: T.ok }} />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.18}>
            <div
              className="mt-4 grid grid-cols-2 gap-6 rounded-3xl px-6 py-8 sm:px-10 lg:grid-cols-4"
              style={{ background: `linear-gradient(120deg, rgba(${T.accRgb},0.05), ${T.surface} 58%)`, border: `1px solid ${T.line}` }}
            >
              <Stat value={84} suffix="%" tone={T.ok} label={t.diff.stats[0]} />
              <Stat value={62} suffix="%" tone={T.acc} label={t.diff.stats[1]} />
              <Stat value={9} suffix="R" tone={T.warn} label={t.diff.stats[2]} />
              <Stat value={3} suffix={t.diff.statSuffix[0]} tone={T.text} label={t.diff.stats[3]} />
              <p className="col-span-2 text-[12.5px] lg:col-span-4" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.55 }}>
                {t.diff.note}
              </p>
            </div>
          </Reveal>
        </section>

        {/* ═══════════ АВТОІМПОРТ MT5 ═══════════ */}
        <section id="import" className="mx-auto w-full max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-24">
          <Reveal className="max-w-[760px]">
            <Eyebrow>{t.mt5.eyebrow}</Eyebrow>
            <H2>{t.mt5.title}</H2>
            <p className="mt-5 max-w-[760px] text-[16px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {t.mt5.text}
            </p>
          </Reveal>

          <Reveal delay={0.08} className="mt-10">
            <Mt5Import />
          </Reveal>
        </section>

        {/* ═══════════ ЩО ВСЕРЕДИНІ + ПОРІВНЯННЯ ═══════════
            Раніше це були дві секції поспіль, і обидві перелічували
            можливості: одна плитками, друга таблицею. Тепер спершу
            коротко що є, одразу під ним — чим це відрізняється від
            таблиці й від звичайного журналу. */}
        <section id="product" className="mx-auto w-full max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-24">
          <Reveal className="max-w-[760px]">
            <Eyebrow>{t.product.eyebrow}</Eyebrow>
            <H2>{t.product.title1}<br />{t.product.title2}</H2>
            <p className="mt-5 max-w-[760px] text-[16px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {t.product.sub}
            </p>
          </Reveal>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {[
              { icon: Target, hue: '110,168,254' },
              { icon: BookOpen, hue: '163,230,53' },
              { icon: BarChart2, hue: '167,139,250' },
              { icon: BrainCircuit, hue: '79,209,197' },
              { icon: History, hue: '56,189,248' },
              { icon: Activity, hue: '251,146,60' },
            ].map((f, i) => (
              <Tile key={t.product.tiles[i].title} icon={f.icon} hue={f.hue} title={t.product.tiles[i].title} text={t.product.tiles[i].text} />
            ))}
          </div>

          <Reveal className="mt-16 max-w-[760px]">
            <Eyebrow>{t.compare.eyebrow}</Eyebrow>
            <H2>{t.compare.title}</H2>
          </Reveal>

          <Reveal delay={0.08} className="mt-10">
            <div
              className="overflow-x-auto rounded-3xl"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <div className="min-w-[680px]">
                {/* шапка: третя колонка виділена, бо це ми */}
                <div
                  className="grid grid-cols-[minmax(0,1fr)_110px_140px_150px] items-center gap-3 px-5 py-4 sm:px-7"
                  style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
                >
                  <span />
                  {t.compare.cols.map((c, i) => (
                    <span
                      key={c}
                      className="text-center text-[12px] font-bold uppercase tracking-[0.12em]"
                      style={{ fontFamily: T.sans, color: i === 2 ? T.acc : T.text3 }}
                    >
                      {c}
                    </span>
                  ))}
                </div>

                {t.compare.rows.map((row, i) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
                    className="ln-crow grid grid-cols-[minmax(0,1fr)_110px_140px_150px] items-center gap-3 px-5 py-3.5 sm:px-7"
                    style={{ borderBottom: i === t.compare.rows.length - 1 ? 'none' : `1px solid ${T.line}` }}
                  >
                    <span className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.5 }}>
                      {row.label}
                    </span>
                    <span className="flex justify-center">
                      <Mark v={row.a} />
                    </span>
                    <span className="flex justify-center">
                      <Mark v={row.b} />
                    </span>
                    <span
                      className="flex justify-center rounded-xl py-1.5"
                      style={{ background: `rgba(${T.accRgb},0.045)` }}
                    >
                      <Mark v={row.c} />
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ═══════════ AI КІТ ═══════════ */}
        <section className="mx-auto w-full max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-24">
          <Reveal>
            <div
              className="grid items-center gap-10 overflow-hidden rounded-[32px] p-7 sm:p-12 lg:grid-cols-[minmax(0,1fr)_420px]"
              style={{ background: `linear-gradient(140deg, rgba(${T.accRgb},0.08), ${T.surface} 55%)`, border: `1px solid ${T.line}` }}
            >
              <div>
                <Eyebrow>{t.coach.eyebrow}</Eyebrow>
                <H2>{t.coach.title}</H2>
                <p className="mt-5 max-w-[520px] text-[16px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
                  {t.coach.sub}
                </p>
                <ul className="mt-7 flex flex-col gap-3">
                  {t.coach.bullets.map((x) => (
                    <li key={x} className="flex gap-3 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}>
                      <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: T.acc }} />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-3">
                {t.coach.chat.map((text, i) => {
                  const you = i % 2 === 0;
                  return (
                    <motion.div
                      key={text}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.45, delay: i * 0.12, ease: EASE }}
                      className={`flex gap-2.5 ${you ? 'justify-end' : ''}`}
                    >
                      {!you && <div className="shrink-0"><EdgeMonogram /></div>}
                      <div
                        className="max-w-[86%] rounded-2xl px-4 py-3 text-[13.5px]"
                        style={{
                          background: you ? T.surfaceHi : `rgba(${T.accRgb},0.09)`,
                          border: `1px solid ${you ? T.line : T.lineAcc}`,
                          color: you ? T.text3 : T.text2,
                          fontFamily: T.sans,
                          lineHeight: 1.6,
                        }}
                      >
                        {text}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ═══════════ ЦІНИ ═══════════ */}
        <section id="pricing" className="mx-auto w-full max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-24">
          <Reveal className="max-w-[760px]">
            <Eyebrow>{t.pricing.eyebrow}</Eyebrow>
            <H2>{t.pricing.title}</H2>
            <p className="mt-5 max-w-[760px] text-[16px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {t.pricing.sub}
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Reveal delay={0.05}>
              <div className="flex h-full flex-col rounded-3xl p-7 sm:p-8" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                <div className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text4 }}>{t.pricing.freeName}</div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-[46px] font-bold leading-none" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.04em' }}>$0</span>
                  <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>{t.pricing.forever}</span>
                </div>
                <p className="mt-3 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>{t.pricing.freeNote}</p>

                <ul className="mt-7 flex flex-1 flex-col gap-3">
                  {t.pricing.freeFeatures.map((x) => (
                    <li key={x} className="flex gap-2.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                      <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: T.text3 }} /> {x}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth"
                  className="mt-8 flex h-12 items-center justify-center rounded-xl text-[14.5px] font-bold transition-colors duration-200"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
                >
                  {t.pricing.freeCta}
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div
                className="relative flex h-full flex-col overflow-hidden rounded-3xl p-7 sm:p-8"
                style={{
                  background: `linear-gradient(150deg, rgba(${T.accRgb},0.1), ${T.surface} 58%)`,
                  border: `1px solid ${T.lineAcc}`,
                  boxShadow: `0 40px 90px -50px rgba(${T.accRgb},0.9)`,
                }}
              >
                <span
                  className="absolute right-6 top-7 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  {t.pricing.proBadge}
                </span>

                <div className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.acc }}>{t.pricing.proName}</div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-[46px] font-bold leading-none" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.04em' }}>$12</span>
                  <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>{t.pricing.perMonth}</span>
                </div>
                <p className="mt-3 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
                  {t.pricing.proNote1} <b style={{ color: T.text2 }}>{t.pricing.proNote2}</b> {t.pricing.proNote3}
                </p>

                <ul className="mt-7 flex flex-1 flex-col gap-3">
                  {t.pricing.proFeatures.map((x) => (
                    <li key={x} className="flex gap-2.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                      <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: T.acc }} /> {x}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth"
                  onPointerMove={track}
                  className="ln-cta mt-8 flex h-12 items-center justify-center rounded-xl text-[14.5px] font-bold transition-transform duration-200 active:scale-[0.99]"
                  style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans, boxShadow: `0 12px 32px -12px rgba(${T.accRgb},0.9)` }}
                >
                  <span className="relative z-10">{t.pricing.proCta}</span>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ═══════════ FAQ ═══════════ */}
        <section id="faq" className="mx-auto w-full max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-24">
          <Reveal className="max-w-[760px]">
            <Eyebrow>{t.faq.eyebrow}</Eyebrow>
            <H2>{t.faq.title}</H2>
          </Reveal>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {t.faq.groups.map((g, i) => (
              <Reveal key={g.tag} delay={i * 0.06}>
                <FaqCard group={g} hue={[T.okRgb, '56,189,248', T.accRgb, '251,146,60'][i]} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══════════ ФІНАЛЬНИЙ ЗАКЛИК ═══════════ */}
        <section id="final" className="mx-auto w-full max-w-[1480px] px-4 pb-24 sm:px-6 lg:px-10 sm:pb-32">
          <Reveal>
            <div
              className="relative overflow-hidden rounded-[32px] px-6 py-16 text-center sm:px-12 sm:py-20"
              style={{ background: `linear-gradient(160deg, rgba(${T.accRgb},0.12), ${T.surface} 62%)`, border: `1px solid ${T.lineAcc}` }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2"
                style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(${T.accRgb},0.22), transparent 68%)`, filter: 'blur(50px)' }}
              />
              <div className="relative">
                <div className="mx-auto mb-6 w-fit"><EdgeMonogram /></div>
                <h2
                  className="mx-auto max-w-[760px] text-[32px] font-bold leading-[1.08] sm:text-[46px]"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.04em' }}
                >
                  {t.final.title}
                </h2>
                <p className="mx-auto mt-5 max-w-[540px] text-[16px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                  {t.final.sub}
                </p>
                <Link
                  to="/auth"
                  onPointerMove={track}
                  className="ln-cta group mx-auto mt-9 flex h-[56px] w-fit items-center gap-2.5 rounded-2xl px-8 text-[16px] font-bold transition-transform duration-200 hover:-translate-y-px active:translate-y-0"
                  style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans, boxShadow: `0 18px 50px -14px rgba(${T.accRgb},0.9)` }}
                >
                  <span className="relative z-10 flex items-center gap-2.5">
                    {t.final.cta}
                    <ArrowRight size={18} strokeWidth={3} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </motion.main>


      {/* ─────────── Кіт із хмаринкою ───────────
          Кнопка по центру перекривала вміст і читалась як банер.
          Кіт у кутку робить те саме, але виглядає як хтось, хто
          підійшов і сказав, а не як реклама. Хмаринка виїжджає
          через секунду після появи — інакше вона наздоганяє скрол. */}
      <AnimatePresence>
        {scrolled && !ctaOnScreen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="fixed bottom-5 right-5 z-50 sm:bottom-7 sm:right-7"
          >
            <Link
              to="/auth"
              className="group flex items-end gap-2.5"
              aria-label={t.nav.start}
            >
              {/* хмаринка */}
              <motion.span
                initial={{ opacity: 0, x: 12, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.55, type: 'spring', stiffness: 320, damping: 24 }}
                className="relative mb-2 hidden rounded-2xl rounded-br-md px-4 py-2.5 sm:block"
                style={{
                  background: T.acc,
                  color: 'var(--edge-bg, #0A0A0C)',
                  fontFamily: T.sans,
                  fontWeight: 700,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 18px 44px -14px rgba(${T.accRgb},0.9)`,
                }}
              >
                {t.nav.start}
                {/* хвостик до кота */}
                <span
                  aria-hidden
                  className="absolute -bottom-[5px] right-3 h-3 w-3 rotate-45"
                  style={{ background: T.acc }}
                />
              </motion.span>

              {/* сам кіт */}
              <motion.span
                className="relative block"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span
                  aria-hidden
                  className="absolute -inset-3 rounded-full"
                  style={{ background: `radial-gradient(circle, rgba(${T.accRgb},0.3), transparent 70%)`, filter: 'blur(10px)' }}
                />
                <span className="relative block transition-transform duration-300 group-hover:scale-110">
                  <EdgeMonogram />
                </span>
              </motion.span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────── Футер ─────────── */}
      <footer className="relative z-10" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center gap-x-8 gap-y-4 px-4 py-8 sm:px-6 lg:px-10">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5">
            <EdgeMonogram />
            <span className="flex flex-col items-start gap-1">
              <EdgeWordmark size={12} tracking={3.2} color={T.text3} accent />
              {/* Девіз не перекладається: це цитата з трейдерського
                  фольклору, і в перекладі вона перестає бути цитатою. */}
              <span
                className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ fontFamily: T.sans, color: T.text4 }}
              >
                {MOTTO}
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {navItems.map(([id, label]) => (
              <button
                key={id}
                onClick={() => scrollToId(id)}
                className="ln-link ln-tap inline-flex h-11 items-center text-[13.5px] transition-colors duration-200"
                style={{ fontFamily: T.sans, color: T.text3 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            © {new Date().getFullYear()} Edge Journal
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function Landing() {
  return (
    <LangProvider>
      <LandingBody />
      {/* Примірочна шрифтів. Тимчасова — коли гарнітуру оберемо,
          значення переїде в theme.js, а цей рядок зникне. */}
      <FontLab />
    </LangProvider>
  );
}
