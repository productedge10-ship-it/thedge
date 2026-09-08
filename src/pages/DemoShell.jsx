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

export default function DemoShell() {
  const [hints, setHints] = useState(true);

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

      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: BAR_H, zIndex: 2500,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '0 18px', background: 'rgba(10,10,14,.92)', backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${A(0.22)}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={btn(false)}>
            <ArrowLeft size={14} strokeWidth={2.2} />
            На сайт
          </a>
          <span style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.6px', color: C.accSoft }}>
            ДЕМО · ДАНІ ВИГАДАНІ Й ЖИВУТЬ ЛИШЕ В ЦЬОМУ БРАУЗЕРІ
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => { resetDemoDb(); window.location.reload(); }}
            style={btn(false)}
            title="Повернути демо у початковий стан"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            Скинути
          </button>

          <button type="button" onClick={() => { setHints((v) => !v); setStepIdx(0); }} style={btn(hints)}>
            {hints ? <Lightbulb size={14} strokeWidth={2} /> : <LightbulbOff size={14} strokeWidth={2} />}
            {hints ? 'Підказки увімкнені' : 'Підказки вимкнені'}
          </button>

          <a
            href="/auth"
            style={{
              fontFamily: F.sans, fontSize: 12.5, fontWeight: 700, color: '#fff',
              background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 9,
              padding: '7px 14px', whiteSpace: 'nowrap', boxShadow: '0 8px 22px rgba(74,59,245,.32)',
            }}
          >
            Почати безкоштовно
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
