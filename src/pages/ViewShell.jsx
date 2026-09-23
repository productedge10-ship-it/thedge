import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ArrowLeft, Eye, Link2Off, Loader2 } from 'lucide-react';
import { SettingsProvider } from '../context/SettingsContext';
import Layout from '../components/core/Layout';
import { loadSnapshot } from '../lib/sharedDb';
import { C, F, A } from '../components/landing/v3/base';

/* ==================================================================
   Оболонка перегляду чужого журналу за посиланням.

   Усередині — справжній Layout зі справжніми сторінками, як у демо.
   Відрізняється клієнт бази (lib/sharedDb.js): він відповідає даними
   власника посилання й відхиляє будь-який запис.

   Кнопки «додати» ховаються стилем на корені, а не правкою кожної
   сторінки: сторінок багато, і забута в одній кнопка лише показала б
   помилку «лише перегляд» — нічого не зламала б, бо записати гість
   однаково не може ні тут, ні в базі.

   Вихід звідси — тільки повним переходом (<a href>), не через роутер:
   сесія в AuthContext тут підставна, і перехід без перезавантаження
   забрав би її з собою в справжній застосунок.
================================================================== */

const BAR_H = 46;

const RO_CSS = `
  .edge-view-ro .edge-add-btn { display: none !important; }
  .demo-bar-label{ display: inline; }
  .demo-bar-desc{ display: inline; }
  .view-bar-short{ display: none; }
  @media (max-width: 560px){
    .demo-bar-label{ display: none; }
    .demo-bar-desc{ display: none; }
    .view-bar-short{ display: inline; }
    .demo-bar-btn{ padding: 6px !important; }
  }
`;

function Screen({ children }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: C.bg, color: C.text, padding: 24 }}>
      {children}
    </div>
  );
}

export default function ViewShell() {
  const [state, setState] = useState({ loading: true, snap: null });

  useEffect(() => {
    let alive = true;
    loadSnapshot()
      .then((snap) => { if (alive) setState({ loading: false, snap }); })
      .catch(() => { if (alive) setState({ loading: false, snap: null }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const name = state.snap?.owner?.name;
    document.title = name ? `Журнал ${name} · The Edge` : 'Журнал трейдера · The Edge';
  }, [state.snap]);

  if (state.loading) {
    return (
      <Screen>
        <Loader2 size={26} className="animate-spin" style={{ color: C.accSoft }} />
      </Screen>
    );
  }

  if (!state.snap) {
    return (
      <Screen>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 54, height: 54, borderRadius: 16, background: A(0.12), border: `1px solid ${A(0.3)}`, marginBottom: 18 }}>
            <Link2Off size={22} style={{ color: C.accSoft }} />
          </div>
          <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
            Посилання не працює
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: C.text2, marginBottom: 22 }}>
            Власник закрив доступ до журналу або створив нове посилання. Попроси в нього свіже.
          </div>
          <a href="/" style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 12, padding: '11px 18px', display: 'inline-block' }}>
            На головну
          </a>
        </div>
      </Screen>
    );
  }

  const name = state.snap.owner?.name;

  const btn = {
    display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, padding: '6px 12px',
    fontFamily: F.sans, fontSize: 12.5, fontWeight: 600,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)',
    color: C.text2, whiteSpace: 'nowrap',
  };

  return (
    <SettingsProvider>
      <Toaster position="bottom-right" reverseOrder={false} />
      <style>{RO_CSS}</style>

      {/* z-index нижче за модалки застосунку (від 500) — як у демо,
          щоб смуга не лягала на заголовок відкритої угоди. */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: BAR_H, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '0 10px', background: 'rgba(10,10,14,.92)', backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${A(0.22)}`, overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <a href="/" className="demo-bar-btn" style={btn} title="На сайт">
            <ArrowLeft size={14} strokeWidth={2.2} />
            <span className="demo-bar-label">На сайт</span>
          </a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.6px', color: C.accSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            <Eye size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name ? `ЖУРНАЛ ${name.toUpperCase()}` : 'ЖУРНАЛ ТРЕЙДЕРА'}
            </span>
            <span className="demo-bar-desc">· ЛИШЕ ПЕРЕГЛЯД</span>
          </span>
        </div>

        <a
          href="/auth"
          style={{
            fontFamily: F.sans, fontSize: 12.5, fontWeight: 700, color: '#fff', flexShrink: 0,
            background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 9,
            padding: '7px 14px', whiteSpace: 'nowrap', boxShadow: '0 8px 22px rgba(74,59,245,.32)',
          }}
        >
          <span className="demo-bar-label">Вести свій журнал</span>
          <span className="view-bar-short">Свій журнал</span>
        </a>
      </div>

      <div className="edge-view-ro" style={{ paddingTop: BAR_H, height: '100dvh', boxSizing: 'border-box' }}>
        <Layout />
      </div>
    </SettingsProvider>
  );
}
