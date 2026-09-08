import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Crosshair, Table2, LineChart, TriangleAlert, Lightbulb, LightbulbOff, X,
} from 'lucide-react';
import { useEdgeFonts } from '../lib/theme';
import { C, F, A, Cat, KEYFRAMES } from '../components/landing/v3/base';
import { PlanScreen, JournalScreen, ErrorsScreen, AnalyticsScreen } from '../components/demo/screens';
import TourOverlay from '../components/demo/TourOverlay';
import { STEPS } from '../components/demo/steps';

/* ==================================================================
   Демо-режим.

   Пісочниця, а не справжній застосунок: реальні сторінки тягнуть
   дані під конкретний акаунт, і показати їх людині без входу
   неможливо, не ламаючи ізоляцію чужих угод. Тому тут ті самі
   рішення на вигаданих цифрах — і перша ж підказка про це чесно
   попереджає.

   Підказки ведуть по дню трейдера: план → угода → помилка →
   аналітика. Їх можна вимкнути назавжди однією кнопкою в шапці:
   тур, з якого не можна вийти, дратує сильніше, ніж його відсутність.
================================================================== */

const NAV = [
  { key: 'plan', title: 'План на день', icon: Crosshair },
  { key: 'journal', title: 'Журнал угод', icon: Table2 },
  { key: 'errors', title: 'Розбір помилок', icon: TriangleAlert },
  { key: 'analytics', title: 'Аналітика', icon: LineChart },
];

function TradeModal({ trade, onClose }) {
  if (!trade) return null;

  const field = (label, value, tour) => (
    <div data-tour={tour} style={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,.07)', borderRadius: 13, padding: '13px 15px' }}>
      <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '1.3px', color: C.dim, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: F.sans, fontSize: 14, color: C.text2, lineHeight: 1.5 }}>{value}</div>
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,10,.8)', backdropFilter: 'blur(6px)', zIndex: 3000 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 3001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}>
        <div
          style={{
            pointerEvents: 'auto', width: 'min(620px,94vw)', maxHeight: '90vh', overflowY: 'auto',
            background: 'linear-gradient(165deg,#12121a,#0b0b10)', border: `1px solid ${A(0.24)}`,
            borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -30px #000',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: F.display, fontSize: 24, fontWeight: 700, letterSpacing: '-.8px', color: '#fff' }}>{trade.sym}</span>
              <span style={{ fontFamily: F.mono, fontSize: 17, fontWeight: 700, color: trade.r.startsWith('−') ? C.bad : C.ok }}>{trade.r}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.text5 }}>{trade.time}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', color: C.text2, cursor: 'pointer' }}
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          <div style={{ display: 'grid', gap: 11 }}>
            {field('ЩО ПРИЇХАЛО З MT5', `${trade.sym} · обсяг 0.42 · ${trade.time} · результат ${trade.r}`)}
            {field('ЧОМУ ЗАЙШОВ', trade.viol === '—'
              ? 'Ціна зняла ліквідність під лоу азійської сесії й закрилась над FVG — вхід за планом, який написаний зранку.'
              : 'Побачив рух і зайшов навздогін. Плану на цю пару не було, сетап не мій.', 'trade-why')}
            {field('СТАН І ПОРУШЕННЯ', `${trade.mood}${trade.viol === '—' ? ' · правил не порушено' : ` · ${trade.viol}`}`)}
          </div>

          <div data-tour="trade-tags" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {[trade.setup, trade.mood, trade.viol === '—' ? 'За планом' : 'Повз план'].map((t, i) => {
              const c = i === 2 && trade.viol !== '—' ? C.bad : i === 1 ? C.warn : C.acc;
              return (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: `${c}ee`, background: `${c}1c`, border: `1px solid ${c}3d`, borderRadius: 999, padding: '7px 13px' }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: c }} />
                  {t}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Demo() {
  useEdgeFonts();

  const [page, setPage] = useState('plan');
  const [trade, setTrade] = useState(null);
  const [hints, setHints] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);

  const step = hints && stepIdx < STEPS.length ? STEPS[stepIdx] : null;

  /* Крок сам ставить сцену: перемикає розділ і за потреби відкриває
     модалку — інакше підказка вказувала б на елемент, якого зараз
     немає на екрані. */
  useEffect(() => {
    if (!step) return;
    if (step.page && step.page !== page) setPage(step.page);
    if (step.open === 'trade' && !trade) setTrade({ sym: 'EURUSD', setup: 'Без сетапу', mood: 'Нудьга', viol: 'Вхід без умов', r: '−1.0R', time: '13:40' });
    if (!step.open && trade) setTrade(null);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [stepIdx, hints]);

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i + 1 >= STEPS.length) { setHints(false); return 0; }
      return i + 1;
    });
  }, []);

  const skip = useCallback(() => setHints(false), []);

  const screen = useMemo(() => {
    if (page === 'plan') return <PlanScreen />;
    if (page === 'journal') return <JournalScreen onOpenTrade={setTrade} />;
    if (page === 'errors') return <ErrorsScreen />;
    return <AnalyticsScreen />;
  }, [page]);

  return (
    <div className="ln-root" style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex' }}>
      <style>{KEYFRAMES}</style>

      {/* ---------- сайдбар ---------- */}
      <aside
        data-tour="nav"
        style={{ width: 236, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,.06)', padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 4, background: '#0a0a0e' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 18px' }}>
          <Cat size={36} />
          <div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 14, letterSpacing: '2.2px', color: '#fff' }}>
              THE <span style={{ color: C.acc }}>EDGE</span>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: '1.4px', color: C.dim, marginTop: 3 }}>ДЕМО-РЕЖИМ</div>
          </div>
        </div>

        {NAV.map((n) => {
          const on = page === n.key;
          const Icon = n.icon;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => setPage(n.key)}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left',
                border: 0, borderRadius: 11, padding: '11px 12px 11px 14px', cursor: 'pointer',
                fontFamily: F.sans, fontSize: 14, fontWeight: 600, transition: 'all .18s',
                background: on ? A(0.12) : 'transparent', color: on ? '#fff' : '#8a8a9c',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = A(0.06); }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, background: C.acc, boxShadow: `0 0 12px ${A(0.8)}`, opacity: on ? 1 : 0, transition: 'opacity .18s' }} />
              <Icon size={15} strokeWidth={1.9} style={{ flexShrink: 0, color: on ? C.accSoft : C.text5 }} />
              {n.title}
            </button>
          );
        })}

        <div style={{ marginTop: 'auto', fontFamily: F.sans, fontSize: 12, lineHeight: 1.5, color: C.text5, padding: '0 8px' }}>
          Дані вигадані й живуть лише у цій вкладці.
        </div>
      </aside>

      {/* ---------- вміст ---------- */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 26px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(10,10,14,.6)', backdropFilter: 'blur(10px)' }}>
          <a
            data-tour="exit"
            href="/"
            style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, color: C.text2, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 11, padding: '9px 15px', transition: 'all .16s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.45); e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.09)'; e.currentTarget.style.color = C.text2; }}
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            Повернутись на сайт
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => { setHints((v) => !v); setStepIdx(0); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600,
                borderRadius: 11, padding: '9px 15px', cursor: 'pointer',
                background: hints ? A(0.14) : 'rgba(255,255,255,.04)',
                border: `1px solid ${hints ? A(0.42) : 'rgba(255,255,255,.09)'}`,
                color: hints ? '#c4baff' : C.text2, transition: 'all .16s',
              }}
            >
              {hints ? <Lightbulb size={15} strokeWidth={2} /> : <LightbulbOff size={15} strokeWidth={2} />}
              {hints ? 'Підказки увімкнені' : 'Увімкнути підказки'}
            </button>

            <a
              href="/auth"
              style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 11, padding: '10px 18px', whiteSpace: 'nowrap', boxShadow: '0 10px 26px rgba(74,59,245,.32)' }}
            >
              Почати безкоштовно
            </a>
          </div>
        </header>

        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '28px 26px 60px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>{screen}</div>
        </main>
      </div>

      <TradeModal trade={trade} onClose={() => setTrade(null)} />

      <TourOverlay
        step={step}
        index={stepIdx}
        total={STEPS.length}
        onNext={next}
        onSkip={skip}
      />
    </div>
  );
}
