import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Ban, Clock, ShieldCheck, Timer } from 'lucide-react';
import { T } from '../../lib/theme';
import { restrictedEvents, windowOf } from '../../lib/propNews';

/* ==================================================================
   Бокова панель біля календаря: найближча заборонена новина з
   відліком і короткий список заборонених на 7 днів — щоб головне
   було видно одразу, без прокрутки календаря.
================================================================== */

const clock = (ms) => new Date(ms).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dayShort = (ms) => new Date(ms).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const left = (mins) => {
  if (mins < 60) return `${Math.max(0, mins)} хв`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} год ${mins % 60} хв`;
  return `${Math.floor(h / 24)} д ${h % 24} год`;
};

export default function PropNewsSide({ firmId, firm, data, weeks, dbList, now, applies = null }) {
  const { before, after } = windowOf(data);
  const list = useMemo(() => {
    const rows = [...(weeks?.[0] || []), ...(weeks?.[1] || [])];
    return restrictedEvents(firmId, data, rows, dbList, now).filter((x) => !x.past && x.start - now < 7 * 864e5);
  }, [firmId, data, weeks, dbList, now]);
  const next = list[0];
  const days = list.reduce((m, x) => { const k = dayShort(x.start); (m[k] = m[k] || []).push(x); return m; }, {});

  if (applies === false) {
    return (
      <aside className="grid content-start gap-3 xl:sticky xl:top-4">
        <div className="rounded-[20px] p-5" style={{ background: `rgba(${T.okRgb},0.08)`, border: `1px solid rgba(${T.okRgb},0.35)` }}>
          <ShieldCheck size={22} style={{ color: T.ok }} />
          <div className="mt-3 text-[18px] font-bold leading-[1.25]" style={{ color: T.text, fontFamily: T.display }}>Тобі можна торгувати на новинах</div>
          <p className="m-0 mt-2 text-[13px] leading-[1.55]" style={{ color: T.text2, fontFamily: T.sans }}>Заборона {firm} не діє на твоєму типі рахунку, тому нагадувань не буде. Волатильність на новинах ніхто не скасовував — ризик рахуй як завжди.</p>
          {list.length > 0 && <p className="m-0 mt-2 text-[12px]" style={{ color: T.text3, fontFamily: T.sans }}>Для інших рахунків {firm} за 7 днів заборонено: {list.length}.</p>}
        </div>
      </aside>
    );
  }

  return (
    <aside className="grid content-start gap-3 xl:sticky xl:top-4">
      <div className="overflow-hidden rounded-[20px] p-5" style={{ background: next?.live ? `rgba(${T.badRgb},0.1)` : 'var(--edge-surface)', border: `1px solid ${next?.live ? `rgba(${T.badRgb},0.45)` : 'var(--edge-line)'}` }}>
        <div className="flex items-center gap-2 text-[11.5px] font-bold uppercase" style={{ color: T.text3, fontFamily: T.mono, letterSpacing: '0.06em' }}>
          <Timer size={13} style={{ color: next ? T.bad : T.ok }} />{next?.live ? 'Зараз не торгуй' : 'Наступна заборона'}
        </div>
        {next ? (
          <>
            <div className="mt-3 whitespace-nowrap text-[26px] font-bold leading-none tabular-nums" style={{ color: next.live ? T.bad : T.text, fontFamily: T.display, letterSpacing: '-0.03em' }}>
              {next.live ? `ще ${left(Math.round((next.end - now) / 60000))}` : `через ${left(next.mins)}`}
            </div>
            <div className="mt-3 text-[14px] font-semibold leading-[1.4]" style={{ color: T.text, fontFamily: T.sans }}>{next.ev.ccy} · {next.ev.title}</div>
            <div className="mt-1 text-[12.5px] tabular-nums" style={{ color: T.text3, fontFamily: T.sans }}>{dayShort(next.start)} · вікно {clock(next.start)}–{clock(next.end)}</div>
            {!next.live && next.mins < 15 && (
              <motion.div className="mt-3 h-1 rounded-full" style={{ background: T.bad }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }} />
            )}
          </>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-[14px] font-semibold" style={{ color: T.ok, fontFamily: T.sans }}>
            <ShieldCheck size={18} />Тиждень чистий — заборонених новин нема
          </div>
        )}
      </div>

      <div className="rounded-[20px] p-5" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>
        <div className="flex items-center gap-2">
          <Ban size={15} style={{ color: T.bad }} />
          <span className="text-[14px] font-bold" style={{ color: T.text, fontFamily: T.display }}>Заборонено на 7 днів</span>
          <span className="ml-auto rounded-full px-2 text-[11px] font-bold tabular-nums" style={{ background: `rgba(${T.badRgb},0.14)`, color: T.bad, fontFamily: T.mono }}>{list.length}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: T.text3, fontFamily: T.sans }}>
          <Clock size={12} />{firm}: −{before} / +{after} хв навколо події
        </div>
        <div className="mt-3 grid gap-3">
          {Object.entries(days).map(([d, xs]) => (
            <div key={d}>
              <div className="mb-1 text-[11px] font-bold uppercase" style={{ color: T.text3, fontFamily: T.mono, letterSpacing: '0.05em' }}>{d}</div>
              <div className="grid gap-1">
                {xs.map((x, i) => (
                  <div key={i} className="grid grid-cols-[46px_38px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px]" style={{ background: x.live ? `rgba(${T.badRgb},0.12)` : 'var(--edge-sunken)' }}>
                    <span className="tabular-nums" style={{ color: T.text2, fontFamily: T.mono }}>{clock(x.ev.at.getTime())}</span>
                    <span className="font-bold" style={{ color: T.text, fontFamily: T.mono }}>{x.ev.ccy}</span>
                    <span className="truncate" title={x.ev.title} style={{ color: T.text, fontFamily: T.sans }}>{x.ev.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!list.length && <div className="text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>Нічого — можна торгувати за своїм планом.</div>}
        </div>
      </div>
    </aside>
  );
}
