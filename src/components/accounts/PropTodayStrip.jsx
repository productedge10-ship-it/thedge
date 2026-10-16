import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ShieldCheck } from 'lucide-react';
import { T } from '../../lib/theme';
import { fetchWeek } from '../../lib/newsStore';
import { usePropContext, restrictedFor, rulesForAccount, sameFirm } from '../../lib/propRules';

/* ==================================================================
   Смуга «правила пропа на сьогодні» над чеклістом.

   Лише те, що стосується наступних годин: новини, заборонені саме
   твоїм пропом (з його календаря, prop_restricted_news), з точним
   часом з нашого календаря і вікном заборони з правил програми.
   Якщо зараз усередині вікна — червоним «зараз не входь».

   Немає проп-рахунку або заборонених новин сьогодні — смуги немає.
================================================================== */

const DEFAULT_WINDOW = 2;

export default function PropTodayStrip() {
  const ctx = usePropContext();
  const [events, setEvents] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const has = !!ctx?.news?.length;
  useEffect(() => {
    if (!has) return undefined;
    let alive = true;
    fetchWeek(0).then((rows) => { if (alive) setEvents(rows || []); }).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [has]);

  const items = useMemo(() => {
    if (!ctx || !events) return [];
    const until = now + 18 * 3600 * 1000;
    return events
      .filter((ev) => ev.at && ev.at.getTime() > now - 30 * 60 * 1000 && ev.at.getTime() < until)
      .map((ev) => {
        const firms = restrictedFor(ctx, ev);
        if (!firms.length) return null;
        /* Вікно — з правил програми рахунку цієї фірми, інакше 2 хв (FTMO). */
        const win = Math.max(...firms.map((f) => {
          const acc = ctx.accounts.find((a) => sameFirm(a.firm_name, f));
          return Number(rulesForAccount(ctx, acc)?.rules?.news_window_min) || DEFAULT_WINDOW;
        }));
        const start = ev.at.getTime() - win * 60_000;
        const end = ev.at.getTime() + win * 60_000;
        return { ev, firms, win, live: now >= start && now <= end, past: now > end, mins: Math.round((start - now) / 60_000) };
      })
      .filter((x) => x && !x.past);
  }, [ctx, events, now]);

  if (!items.length) return null;
  const live = items.some((i) => i.live);

  return (
    <div className="mb-4 rounded-2xl px-4 py-3.5"
      style={{ background: live ? 'rgba(var(--edge-bad-rgb),0.08)' : 'var(--edge-surface)', border: `1px solid ${live ? 'rgba(var(--edge-bad-rgb),0.35)' : 'var(--edge-line)'}` }}>
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold" style={{ fontFamily: T.sans, color: live ? T.bad : T.text }}>
        {live ? <Ban size={16} /> : <ShieldCheck size={16} style={{ color: T.warn }} />}
        {live ? 'Зараз вікно забороненої новини — не відкривай і не закривай угоди' : 'Заборонені новини твого пропа сьогодні'}
      </div>
      <div className="flex flex-col gap-1">
        {items.slice(0, 4).map(({ ev, firms, win, live: l, mins }) => (
          <div key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]" style={{ fontFamily: T.sans }}>
            <span className="w-[48px] font-bold" style={{ fontFamily: T.mono, color: l ? T.bad : T.text }}>{ev.time}</span>
            <span className="w-[36px] font-bold" style={{ fontFamily: T.mono, color: T.text3 }}>{ev.ccy}</span>
            <span className="min-w-0 flex-1 truncate" style={{ color: T.text2 }}>{ev.title}</span>
            <span className="text-[12px]" style={{ color: l ? T.bad : T.text3 }}>
              {l ? 'зараз' : mins <= 60 ? `заборона через ${Math.max(mins, 0)} хв` : `±${win} хв`} · {firms.join(', ')}
            </span>
          </div>
        ))}
      </div>
      <Link to="/prop-rules" className="mt-2 inline-block text-[12px] underline" style={{ color: T.text3, fontFamily: T.sans }}>Правила мого пропа</Link>
    </div>
  );
}
