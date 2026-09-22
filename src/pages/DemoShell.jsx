import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ArrowLeft, Lightbulb, LightbulbOff, RotateCcw } from 'lucide-react';
import { SettingsProvider } from '../context/SettingsContext';
import Layout from '../components/core/Layout';
import TourOverlay from '../components/demo/TourOverlay';
import { STEPS } from '../components/demo/steps';
import { resetDemoDb } from '../lib/demoDb';
import { C, F, A } from '../components/landing/v3/base';

/* ==================================================================
   Оболонка демо.

   Усередині — справжній Layout зі справжніми сторінками: та сама
   бічна панель, ті самі модалки, ті самі кнопки. Відрізняється рівно
   одне — клієнт бази підмінений на localStorage, тож «Новий план»
   справді створює план, який лишається до перезавантаження.

   Зверху — тонка смуга демо-режиму: повернення на сайт, вимикач
   підказок і скидання пісочниці. Вона не всередині застосунку, а
   над ним, щоб не змішуватись із його власним інтерфейсом.
================================================================== */

const BAR_H = 46;

/* Раз пройдений або пропущений тур не має повертати людину на
   /plan щоразу, коли вона просто оновлює сторінку чи заходить
   напряму в /demo/analytics — без цього прапорця кожен свіжий
   рендер DemoShell забуває прогрес і смикає назад на перший крок. */
const HINTS_KEY = 'edge.demo.hints.on';

function readHintsOn() {
  try {
    const raw = localStorage.getItem(HINTS_KEY);
    return raw === null ? true : raw === '1';
  } catch { return true; }
}

export default function DemoShell() {
  const [hints, setHintsState] = useState(readHintsOn);
  const setHints = useCallback((next) => {
    setHintsState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(HINTS_KEY, value ? '1' : '0'); } catch { /* no-op */ }
      return value;
    });
  }, []);

  /* Прихід із лендінга: там уже розкрилось коло й крутився кіт, тож
     пісочниця не має клацати новим екраном. Вона проявляється з-під
     того самого темного шару — перехід читається як одна дія, а не
     як дві сторінки поспіль. */
  const [entering, setEntering] = useState(() => {
    try {
      const flag = sessionStorage.getItem('edge.demo.enter') === '1';
      if (flag) sessionStorage.removeItem('edge.demo.enter');
      return flag;
    } catch { return false; }
  });

  useEffect(() => {
    if (!entering) return undefined;
    const t = setTimeout(() => setEntering(false), 60);
    return () => clearTimeout(t);
  }, [entering]);
  const [stepIdx, setStepIdx] = useState(0);
  const nav = useNavigate();
  const { pathname } = useLocation();

  const step = hints && stepIdx < STEPS.length ? STEPS[stepIdx] : null;

  /* Крок сам приводить людину туди, де живе його ціль: інакше
     підказка вказувала б на елемент з іншої сторінки. */
  useEffect(() => {
    if (!step?.route) return;
    const want = `/demo${step.route}`;
    if (pathname !== want) nav(want);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [stepIdx, hints]);

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i + 1 >= STEPS.length) { setHints(false); return 0; }
      return i + 1;
    });
  }, []);

  const skip = useCallback(() => setHints(false), []);

  const btn = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, padding: '6px 12px',
    fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    background: active ? A(0.16) : 'rgba(255,255,255,.05)',
    border: `1px solid ${active ? A(0.42) : 'rgba(255,255,255,.09)'}`,
    color: active ? '#c4baff' : C.text2, transition: 'all .16s', whiteSpace: 'nowrap',
  });

  return (
    <SettingsProvider>
      <Toaster position="bottom-right" reverseOrder={false} />

      {/* Смуга — рівно BAR_H заввишки на будь-якій ширині: Layout
          нижче відступає від неї фіксованим paddingTop, і якщо смуга
          хоч раз перенесе рядок (довгий підпис + чотири елементи не
          влазять у 320px), вона стає вищою за свій відступ і лягає
          просто на шапку застосунку. Тому нижче 560px підпис і
          підписи кнопок ховаються, лишаються тільки іконки — сама
          висота смуги ніколи не змінюється. */}
      <style>{`
        .demo-bar-label{ display: inline; }
        .demo-bar-desc{ display: inline; }
        .demo-bar-badge{ display: none; }
        @media (max-width: 560px){
          .demo-bar-label{ display: none; }
          .demo-bar-desc{ display: none; }
          .demo-bar-badge{ display: inline; }
          .demo-bar-btn{ padding: 6px !important; }
          .demo-bar-cta{ padding: 7px 10px !important; }
        }
      `}</style>

      <div
        style={{
          /* z-index нижче за будь-яку модалку застосунку (найменша — 500):
             раніше 2500 сидів НАД модалками, і в демо-режимі ця смуга
             перекривала верх кожного вікна — заголовок, хрестик закриття. */
          position: 'fixed', top: 0, left: 0, right: 0, height: BAR_H, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '0 10px', background: 'rgba(10,10,14,.92)', backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${A(0.22)}`, overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <a href="/" className="demo-bar-btn" style={btn(false)} title="На сайт">
            <ArrowLeft size={14} strokeWidth={2.2} />
            <span className="demo-bar-label">На сайт</span>
          </a>
          <span className="demo-bar-desc" style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.6px', color: C.accSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ДЕМО · ДАНІ ВИГАДАНІ Й ЖИВУТЬ ЛИШЕ В ЦЬОМУ БРАУЗЕРІ
          </span>
          <span className="demo-bar-badge" style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: C.accSoft, flexShrink: 0 }}>
            ДЕМО
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="demo-bar-btn"
            onClick={() => { resetDemoDb(); window.location.reload(); }}
            style={btn(false)}
            title="Повернути демо у початковий стан"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            <span className="demo-bar-label">Скинути</span>
          </button>

          <button type="button" className="demo-bar-btn" onClick={() => { setHints((v) => !v); setStepIdx(0); }} style={btn(hints)} title={hints ? 'Підказки увімкнені' : 'Підказки вимкнені'}>
            {hints ? <Lightbulb size={14} strokeWidth={2} /> : <LightbulbOff size={14} strokeWidth={2} />}
            <span className="demo-bar-label">{hints ? 'Підказки увімкнені' : 'Підказки вимкнені'}</span>
          </button>

          <a
            href="/auth"
            className="demo-bar-cta"
            style={{
              fontFamily: F.sans, fontSize: 12.5, fontWeight: 700, color: '#fff',
              background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 9,
              padding: '7px 14px', whiteSpace: 'nowrap', boxShadow: '0 8px 22px rgba(74,59,245,.32)',
            }}
          >
            <span className="demo-bar-label">Почати безкоштовно</span>
            <span className="demo-bar-badge">Почати</span>
          </a>
        </div>
      </div>

      {/* Застосунок цілком: сайдбар, шапка, сторінки, модалки */}
      <div
        style={{
          paddingTop: BAR_H, height: '100dvh', boxSizing: 'border-box',
          opacity: entering ? 0 : 1,
          transform: entering ? 'scale(.985)' : 'none',
          transition: 'opacity .5s ease .1s, transform .6s cubic-bezier(.22,1,.36,1) .1s',
        }}
      >
        <Layout />
      </div>

      {/* Завіса, що лишилась із лендінга: гасне поверх уже готового
          застосунку, тому між сторінками немає ані спалаху, ані
          порожнього кадру. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 4500, pointerEvents: 'none',
          background: '#08080c',
          opacity: entering ? 1 : 0,
          transition: 'opacity .55s ease',
        }}
      />

      <TourOverlay step={step} index={stepIdx} total={STEPS.length} onNext={next} onSkip={skip} />
    </SettingsProvider>
  );
}
