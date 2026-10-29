import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Ban, BellRing, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { useAuth } from '../../context/AuthContext';
import { brokerById } from '../../lib/brokers';
import { fetchWeek } from '../../lib/newsStore';
import { loadPropContext } from '../../lib/propRules';
import { POLICY, restrictedEvents, ymdLocal } from '../../lib/propNews';
import { loadPropRules, myFirmIds } from '../../lib/propRulesData';
import { supabase } from '../../lib/supabase';
import useSubscription from '../../hooks/useSubscription';
import useCloudState from '../../hooks/useCloudState';
import { guessProfile, newsApplies } from '../../lib/propPolicy';
import { sameFirm } from '../../lib/propRules';

/* ==================================================================
   Нагадування про заборонені новини твого пропа — на будь-якій сторінці.

   Дивимось лише пропи, де в людини є активний рахунок. За 15 хв до
   вікна — тиха плашка зверху й сповіщення браузера (якщо дозволені),
   у самому вікні — червона «зараз не торгуй». Закрити можна, але лише
   цю подію: наступна покажеться знову. На «Правилах пропа» плашки нема —
   там своє попередження.
================================================================== */

const LEAD = 15;
const SEEN = 'edge_prop_news_seen';
const LIVE = true; // розділ відкритий для Pro
const clock = (ms) => new Date(ms).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN)) || {}; } catch { return {}; } };

function notify(key, title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, tag: key, icon: '/favicon.png' }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* без service worker — тиша */ }
}

export default function PropNewsWatcher() {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(null); // { firms, rules, rows, db }
  const [now, setNow] = useState(() => Date.now());
  const [seen, setSeen] = useState(readSeen);
  const [profiles] = useCloudState('prop_profiles_v1', {});

  useEffect(() => {
    if (!LIVE || !user?.id || !isPro) return undefined;
    let off = false;
    (async () => {
      const ctx = await loadPropContext(user.id);
      const firms = myFirmIds(ctx?.accounts);
      if (!firms.length) return;
      const [{ rules }, rows] = await Promise.all([loadPropRules(), fetchWeek(0).catch(() => [])]);
      const dbFirms = [...new Set(firms.map((f) => POLICY[f]?.db).filter(Boolean))];
      const { data } = dbFirms.length
        ? await supabase.from('prop_restricted_news').select('firm,day,currency,title').in('firm', dbFirms).gte('day', ymdLocal(new Date(Date.now() - 2 * 864e5)))
        : { data: [] };
      if (!off) setState({ firms: firms.filter((f) => rules[f]), rules, rows, db: data || [], accounts: ctx?.accounts || [] });
    })().catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => { off = true; clearInterval(t); };
  }, [user?.id, isPro]);

  /* Найближче вікно серед усіх твоїх пропів, яке або вже йде, або почнеться за LEAD хв. */
  const hit = useMemo(() => {
    if (!state) return null;
    /* Лише пропи, де заборона справді діє на рахунку людини (Swing, оцінка тощо — пропускаємо). */
    const on = state.firms.filter((f) => {
      let prof = profiles?.[f];
      if (!prof?.program) {
        const acc = state.accounts.find((a) => sameFirm(a.firm_name, brokerById(f)?.name));
        const g = guessProfile(f, state.rules[f]?.structured?.programs, `${acc?.firm_name || ''} ${acc?.rules_program || ''}`);
        prof = g.sure ? g.profile : null; // не впевнені — краще попередити зайвий раз
      }
      return newsApplies(f, state.rules[f], prof) !== false;
    });
    const all = on.flatMap((f) => restrictedEvents(f, state.rules[f], state.rows, state.db.filter((r) => r.firm === POLICY[f]?.db), now)
      .filter((x) => !x.past && x.mins <= LEAD).map((x) => ({ ...x, firm: f })));
    return all.sort((a, b) => a.start - b.start)[0] || null;
  }, [state, now, profiles]);

  const key = hit ? `${hit.firm}|${hit.ev.id}|${hit.live ? 'live' : 'soon'}` : null;
  useEffect(() => {
    if (!hit || seen[`n:${key}`]) return;
    const firm = brokerById(hit.firm).name;
    notify(key, hit.live ? `Зараз не торгуй — ${firm}` : `Через ${Math.max(hit.mins, 0)} хв заборонена новина — ${firm}`,
      `${hit.ev.ccy} · ${hit.ev.title}. Вікно ${clock(hit.start)}–${clock(hit.end)}.`);
    const next = { ...seen, [`n:${key}`]: Date.now() };
    setSeen(next);
    try { localStorage.setItem(SEEN, JSON.stringify(next)); } catch { /* приватне вікно */ }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    const next = Object.fromEntries(Object.entries({ ...seen, [`x:${key}`]: Date.now() }).filter(([, v]) => Date.now() - v < 2 * 864e5));
    setSeen(next);
    try { localStorage.setItem(SEEN, JSON.stringify(next)); } catch { /* приватне вікно */ }
  };

  const show = hit && !seen[`x:${key}`] && !pathname.startsWith('/prop-rules');
  const firm = hit ? brokerById(hit.firm).name : '';
  const rgb = hit?.live ? T.badRgb : T.warnRgb;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div key={key} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.2 }}
          className="fixed left-1/2 z-[200] w-[min(560px,calc(100vw-24px))] -translate-x-1/2"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }} role="status">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur"
            style={{ background: 'color-mix(in srgb, var(--edge-surface) 88%, transparent)', border: `1px solid rgba(${rgb},0.45)`, boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}>
            {hit.live ? <Ban size={18} style={{ color: T.bad }} className="shrink-0" /> : <BellRing size={18} style={{ color: T.warn }} className="shrink-0" />}
            <button type="button" onClick={() => navigate('/prop-rules')} className="min-w-0 flex-1 text-left" style={{ fontFamily: T.sans }}>
              <span className="block truncate text-[13.5px] font-bold" style={{ color: hit.live ? T.bad : T.text }}>
                {hit.live ? `Зараз не торгуй на ${firm} — до ${clock(hit.end)}` : `Через ${Math.max(hit.mins, 0)} хв заборона на ${firm}`}
              </span>
              <span className="block truncate text-[12.5px]" style={{ color: T.text2 }}>{hit.ev.ccy} · {hit.ev.title} · {clock(hit.start)}–{clock(hit.end)}</span>
            </button>
            <button type="button" onClick={dismiss} aria-label="Сховати" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-[var(--edge-nav-hover)]" style={{ color: T.text3 }}><X size={16} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
