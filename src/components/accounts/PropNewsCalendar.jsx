import { useEffect, useMemo, useState } from 'react';
import { Ban, BellRing, CalendarClock, Info, Search, ShieldCheck, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { POLICY, restrictedEvents, windowOf, ymdLocal } from '../../lib/propNews';
import { describe } from '../../lib/newsStore';
import { touches } from '../../lib/propChecks';

/* ==================================================================
   Календар заборонених новин пропа — як на ForexFactory: день за днем,
   час, валюта, подія. Зверху — попередження: вікно заборони зараз,
   або скільки лишилось до найближчого. Перемикач «лише заборонені /
   усі новини тижня»: у другому режимі заборонені підсвічені червоним.
================================================================== */

const RANGES = [
  { id: 'today', label: 'Сьогодні' },
  { id: 'week', label: 'Цей тиждень' },
  { id: 'next', label: 'Наступний' },
];
const IMPACT = { High: '#f87171', Medium: '#fbbf24', Low: '#7A7A85', Holiday: '#60a5fa' };
const IMPACTS = [['High', 'Високий'], ['Medium', 'Середній'], ['Low', 'Низький'], ['Holiday', 'Свята']];
const CCY_ORDER = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];
const FKEY = 'edge_prop_news_filter';
const loadF = () => { try { return JSON.parse(localStorage.getItem(FKEY)) || {}; } catch { return {}; } };

/* Чип фільтра: вимкнений — тиха рамка, увімкнений — акцентна підкладка (як фільтри в журналі). */
function Chip({ on, onClick, children, dot, title }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors"
      style={{ fontFamily: T.sans, color: on ? T.text : T.text3, background: on ? `rgba(${T.accRgb},0.14)` : 'transparent', border: `1px solid ${on ? `rgba(${T.accRgb},0.4)` : 'var(--edge-line)'}` }}>
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{children}
    </button>
  );
}
const applies_txt = (data) => { const a = data?.structured?.restricted_news?.applies_to || []; return a.length ? ` (${a.join('; ')})` : ''; };
const dayLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const clock = (ms) => new Date(ms).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

export function PropNewsAlert({ items, firm }) {
  const live = items.find((x) => x.live);
  const next = items.find((x) => !x.past && !x.live);
  if (!live && !next) return null;
  const soon = next && next.mins <= 60;
  const today = next && ymdLocal(new Date(next.start)) === ymdLocal(new Date());
  if (!live && !today) return null;
  const tone = live ? T.bad : soon ? T.warn : T.text2;
  const rgb = live ? T.badRgb : soon ? (T.warnRgb || '251,191,36') : T.accRgb;
  const x = live || next;
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5" role="status" style={{ background: `rgba(${rgb},0.09)`, border: `1px solid rgba(${rgb},0.35)` }}>
      {live ? <Ban size={18} style={{ color: tone }} className="mt-0.5 shrink-0" /> : <BellRing size={18} style={{ color: tone }} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 text-[13.5px] leading-[1.5]" style={{ fontFamily: T.sans }}>
        <div className="font-bold" style={{ color: tone }}>
          {live ? `Зараз заборонено торгувати на ${firm} — до ${clock(x.end)}`
            : soon ? `Через ${Math.max(x.mins, 0)} хв заборонена новина на ${firm}`
              : `Сьогодні о ${clock(x.start)} вікно заборони на ${firm}`}
        </div>
        <div style={{ color: T.text2 }}>
          {x.ev.ccy} · {x.ev.title} о {x.ev.time}. Не відкривай і не закривай угоди з {clock(x.start)} до {clock(x.end)}.
        </div>
      </div>
    </div>
  );
}

const INSTR = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US30', 'US100', 'US500', 'GER40', 'UK100', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF', 'JP225'];

/* Розгорнутий рядок: цифри, що це за показник, вікно і що зачіпає. */
function Details({ x, bad }) {
  const ev = x.ev;
  const about = describe(ev.title);
  const hit = INSTR.filter((p) => touches(p, ev.ccy));
  const cell = (k, v, strong) => (
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>
      <div className="text-[11px] uppercase" style={{ color: T.text3, fontFamily: T.mono, letterSpacing: '0.05em' }}>{k}</div>
      <div className="text-[14px] font-bold tabular-nums" style={{ color: strong ? T.text : T.text2, fontFamily: T.mono }}>{v || '—'}</div>
    </div>
  );
  return (
    <div className="grid gap-3 px-4 pb-4 pt-1" style={{ background: 'var(--edge-sunken)' }}>
      <div className="grid grid-cols-3 gap-2 sm:max-w-[420px]">{cell('Факт', ev.actual, true)}{cell('Прогноз', ev.forecast)}{cell('Попереднє', ev.previous)}</div>
      {about && <p className="m-0 text-[13px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>{about}</p>}
      {bad ? (
        <p className="m-0 text-[13px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>
          <b style={{ color: T.bad }}>Заборона {clock(x.start)}–{clock(x.end)}.</b> Не відкривай і не закривай угоди (і не став SL/TP, що можуть спрацювати) на: {hit.join(', ')} та інших інструментах з {ev.ccy}.
        </p>
      ) : (
        <p className="m-0 text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>Цей проп не забороняє торгувати на цій новині. Зачіпає: {hit.slice(0, 6).join(', ')}.</p>
      )}
    </div>
  );
}

export default function PropNewsCalendar({ firmId, firm, data, weeks, dbList, now, forMe = null, who = '' }) {
  const saved = useMemo(loadF, []);
  const [range, setRange] = useState(saved.range || 'week');
  const [all, setAll] = useState(saved.all ?? true);
  const [ccys, setCcys] = useState(saved.ccys || []);       // порожньо = усі валюти
  const [impacts, setImpacts] = useState(saved.impacts || []); // порожньо = будь-яка важливість
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  useEffect(() => { try { localStorage.setItem(FKEY, JSON.stringify({ range, all, ccys, impacts })); } catch { /* приватне вікно */ } }, [range, all, ccys, impacts]);
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const { before, after } = windowOf(data);
  const policy = POLICY[firmId];
  const applies = (data?.structured?.restricted_news?.applies_to || []).join('; ');
  const rows = range === 'next' ? weeks?.[1] : weeks?.[0];

  const list = useMemo(() => {
    if (!rows) return null;
    const todayKey = ymdLocal(new Date(now));
    const needle = q.trim().toLowerCase();
    const scoped = rows.filter((ev) => ev.at && (range !== 'today' || ev.day === todayKey)
      && (!ccys.length || ccys.includes(ev.ccy)) && (!impacts.length || impacts.includes(ev.impact))
      && (!needle || ev.title.toLowerCase().includes(needle)));
    const bad = restrictedEvents(firmId, data, scoped, dbList, now);
    const badIds = new Map(bad.map((b) => [b.ev.id, b]));
    const shown = all ? scoped.map((ev) => badIds.get(ev.id) || { ev }) : bad;
    const by = new Map();
    for (const x of shown) { if (!by.has(x.ev.day)) by.set(x.ev.day, []); by.get(x.ev.day).push(x); }
    return [...by.entries()];
  }, [rows, range, all, firmId, data, dbList, now, ccys, impacts, q]);

  /* Валюти, які взагалі є в цьому періоді: спершу основні, решта за абеткою. */
  const ccyList = useMemo(() => [...new Set((rows || []).map((ev) => ev.ccy).filter(Boolean))]
    .sort((a, b) => ((CCY_ORDER.indexOf(a) + 1 || 99) - (CCY_ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b)), [rows]);
  const filtered = ccys.length || impacts.length || q;

  const count = list ? list.reduce((s, [, xs]) => s + xs.filter((x) => x.start).length, 0) : 0;

  const todayK = ymdLocal(new Date(now));
  const visible = list && range === 'week' && !showPast ? list.filter(([d]) => d >= todayK) : (list || []);
  const pastDays = list ? list.length - visible.length : 0;

  return (
    <section className="p-5 sm:p-6" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 20 }}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${T.badRgb},0.12)` }}>
          <CalendarClock size={18} style={{ color: T.bad }} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[17px] font-bold" style={{ color: T.text, fontFamily: T.display }}>Новини · {firm}</h3>
          <p className="m-0 mt-0.5 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>
            Вікно −{before} / +{after} хв · час твій місцевий{policy?.mode === 'high' ? ' · усі червоні новини' : ' · за списком пропа'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
            {RANGES.map((r) => (
              <button key={r.id} type="button" onClick={() => setRange(r.id)} className="h-8 rounded-lg px-3 text-[13px] font-semibold"
                style={{ fontFamily: T.sans, color: range === r.id ? T.text : T.text3, background: range === r.id ? 'var(--edge-surface)' : 'transparent' }}>
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAll((v) => !v)} className="h-10 rounded-xl px-3 text-[12.5px] font-semibold"
            style={{ fontFamily: T.sans, color: all ? T.text : T.text3, background: 'var(--edge-sunken)', border: `1px solid ${all ? `rgba(${T.accRgb},0.45)` : 'var(--edge-line)'}` }}>
            {all ? 'Усі новини' : 'Лише заборонені'}
          </button>
        </div>
      </div>

      {/* Фільтри */}
      <div className="mt-4 grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 sm:max-w-[260px]" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
            <Search size={14} style={{ color: T.text3 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук події: CPI, NFP…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" style={{ color: T.text, fontFamily: T.sans }} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {IMPACTS.map(([id, label]) => <Chip key={id} dot={IMPACT[id]} on={impacts.includes(id)} onClick={() => toggle(impacts, setImpacts, id)}>{label}</Chip>)}
          </div>
          {filtered && (
            <button type="button" onClick={() => { setCcys([]); setImpacts([]); setQ(''); }} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>
              <X size={13} />Скинути
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
          <Chip on={!ccys.length} onClick={() => setCcys([])}>Усі валюти</Chip>
          {ccyList.map((c) => <Chip key={c} on={ccys.includes(c)} onClick={() => toggle(ccys, setCcys, c)}><span style={{ fontFamily: T.mono }}>{c}</span></Chip>)}
        </div>
      </div>

      {policy?.note && (
        <p className="m-0 mt-3 flex items-start gap-2 text-[12.5px] leading-[1.5]" style={{ color: T.text3, fontFamily: T.sans }}>
          <Info size={14} className="mt-[2px] shrink-0" />{policy.note}
        </p>
      )}

      {forMe === false && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-[13px] leading-[1.55]" style={{ background: `rgba(${T.okRgb},0.08)`, border: `1px solid rgba(${T.okRgb},0.3)`, fontFamily: T.sans }}>
          <ShieldCheck size={16} className="mt-[2px] shrink-0" style={{ color: T.ok }} />
          <span style={{ color: T.text2 }}><b style={{ color: T.ok }}>На твоєму рахунку ({who}) торгувати на новинах можна.</b> Позначені події заборонені лише для інших типів рахунків{applies_txt(data)} — попереджати не будемо.</span>
        </div>
      )}
      {forMe === null && (
        <p className="m-0 mt-3 text-[12.5px]" style={{ color: T.warn, fontFamily: T.sans }}>Заборона діє не на всіх рахунках {firm}. Вкажи свій тип рахунку — і покажемо, чи стосується вона тебе.</p>
      )}

      <div className="mt-4">
        {!list && <div className="py-6 text-center text-[13px]" style={{ color: T.text3 }}>Завантажую календар…</div>}
        {list && !list.length && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-4 text-[13.5px]" style={{ background: 'var(--edge-sunken)', color: T.text2, fontFamily: T.sans }}>
            <ShieldCheck size={16} style={{ color: T.ok }} />
            {filtered ? 'За цими фільтрами нічого нема.' : all ? 'Новин на цей період нема.' : range === 'today' ? 'Сьогодні заборонених новин нема — торгуй за своїм планом.' : 'Заборонених новин на цей період нема.'}
          </div>
        )}
        {list && list.length > 0 && pastDays > 0 && (
          <button type="button" onClick={() => setShowPast(!showPast)} className="mb-2 text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: T.text3, fontFamily: T.sans }}>
            {showPast ? 'Сховати минулі дні' : `Показати минулі дні тижня (${pastDays})`}
          </button>
        )}
        {list && list.length > 0 && (
          <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--edge-line)' }}>
            {visible.map(([day, xs]) => (
              <div key={day}>
                <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-bold uppercase" style={{ background: 'var(--edge-sunken)', color: day === ymdLocal(new Date(now)) ? T.acc : T.text3, fontFamily: T.mono, letterSpacing: '0.06em' }}>
                  {dayLabel(day)}{day === ymdLocal(new Date(now)) && <span className="rounded px-1.5 py-px text-[10px]" style={{ background: `rgba(${T.accRgb},0.14)` }}>сьогодні</span>}
                </div>
                {xs.map((x) => {
                  const bad = !!x.start;
                  return (
                    <div key={x.ev.id} className="border-t" style={{ borderColor: 'var(--edge-line)' }}>
                    <button type="button" onClick={() => setOpenId(openId === x.ev.id ? null : x.ev.id)} aria-expanded={openId === x.ev.id}
                      className="grid w-full grid-cols-[52px_44px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-[var(--edge-nav-hover)] sm:grid-cols-[52px_44px_minmax(0,1fr)_auto]"
                      style={{ opacity: x.past ? 0.45 : 1, boxShadow: bad ? `inset 3px 0 0 ${forMe === false ? 'var(--edge-line)' : T.bad}` : 'none', background: x.live && forMe !== false ? `rgba(${T.badRgb},0.1)` : bad && forMe !== false && openId !== x.ev.id ? `rgba(${T.badRgb},0.04)` : x.live ? `rgba(${T.badRgb},0.1)` : openId === x.ev.id ? `rgba(${T.accRgb},0.05)` : 'transparent' }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: bad ? T.text : T.text3 }}>{x.ev.time}</span>
                      <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: T.text2 }}>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: IMPACT[x.ev.impact] || IMPACT.Low }} />{x.ev.ccy}
                      </span>
                      <span className="min-w-0 truncate text-[13.5px]" style={{ fontFamily: T.sans, color: bad ? T.text : T.text2 }} title={x.ev.title}>{x.ev.title}</span>
                      {bad && (
                        <span className="col-start-3 text-[12px] font-semibold sm:col-start-auto" style={{ fontFamily: T.sans, color: forMe === false ? T.text3 : T.bad }}>
                          {forMe === false ? `для інших рахунків ${clock(x.start)}–${clock(x.end)}` : x.live ? 'зараз заборонено' : `заборона ${clock(x.start)}–${clock(x.end)}`}
                        </span>
                      )}
                      {bad && applies && (
                        <span className="col-span-full text-[11.5px] leading-[1.4] sm:col-start-3" style={{ fontFamily: T.sans, color: T.text3 }}>для: {applies}</span>
                      )}
                    </button>
                    {openId === x.ev.id && <Details x={x} bad={bad} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {list && count > 0 && (
          <p className="m-0 mt-2 text-[12px]" style={{ color: T.text3, fontFamily: T.sans }}>
            Заборонених для торгівлі: {count}. Що саме не можна робити у вікні — на вкладці «Правила», розділ «Червоні новини».
          </p>
        )}
      </div>
    </section>
  );
}
