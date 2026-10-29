import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown, ExternalLink, History, Radar } from 'lucide-react';
import { T } from '../../lib/theme';
import { openPropChange } from '../../lib/propRules';

/* ==================================================================
   «Оновлення»: що проп міняв у правилах, простою мовою.

   Три джерела, одна стрічка (свіжі зверху):
     approved — зміна, яку знайшов щоденний монітор і схвалив адмін
                (висновок «що це значить» — як у модалці);
     version  — різниця в числах між попередньою і поточною версією
                наших правил (ліміти, просадка, етапи);
     firm     — що проп сам писав про зміни (trading updates, довідка).
   Клік по запису розгортає детальне пояснення: що було і що стало,
   кого стосується, що робити, і посилання на джерело.
================================================================== */

const fmt = (at) => (at ? new Date(at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const val = (v) => (v == null || v === '' ? '—' : typeof v === 'number' ? `${v}%` : String(v));
const KIND = { approved: 'Наш монітор', version: 'Числа в правилах', firm: 'Повідомлення пропа' };

function Diff({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="grid gap-1.5 rounded-xl p-3" style={{ background: 'var(--edge-sunken)' }}>
      {rows.slice(0, 10).map((d, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" style={{ fontFamily: T.sans }}>
          <span style={{ color: T.text3 }}>{[d.program, d.label || d.field].filter(Boolean).join(' · ')}</span>
          <span className="tabular-nums line-through" style={{ color: T.text3 }}>{val(d.old)}</span>
          <ArrowRight size={12} style={{ color: T.text3 }} />
          <span className="font-semibold tabular-nums" style={{ color: T.text }}>{val(d.new)}</span>
        </div>
      ))}
    </div>
  );
}

function Item({ u, first, open, onToggle }) {
  const more = !!(u.details || u.diff?.length || u.affects?.length || u.source || u.change);
  return (
    <div className="relative">
      <span className="absolute -left-6 top-[18px] h-[11px] w-[11px] rounded-full" style={{ background: first ? T.acc : 'var(--edge-surface)', border: `2px solid ${first ? T.acc : 'var(--edge-line)'}` }} />
      <button type="button" onClick={more ? onToggle : undefined} aria-expanded={open}
        className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${more ? 'hover:bg-[var(--edge-nav-hover)]' : 'cursor-default'}`}
        style={{ background: open ? `rgba(${T.accRgb},0.06)` : 'transparent', boxShadow: open ? `inset 0 0 0 1px rgba(${T.accRgb},0.22)` : 'none' }}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ fontFamily: T.mono, color: T.text3 }}>
          <span className="font-semibold tabular-nums">{fmt(u.at) || 'без дати'}</span>
          <span className="rounded-md px-1.5 py-px" style={{ background: 'var(--edge-sunken)', fontFamily: T.sans }}>{KIND[u.kind]}</span>
          {u.program && <span style={{ fontFamily: T.sans }}>{u.program}</span>}
        </div>
        <div className="mt-1 flex items-start gap-3">
          <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.6]" style={{ color: T.text, fontFamily: T.sans }}>{u.text || 'Змінились числа в правилах'}</p>
          {more && <ChevronDown size={16} className="mt-1 shrink-0" style={{ color: T.text3, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="grid gap-3 px-3 pb-3 pt-2">
              {u.details && <p className="m-0 text-[13.5px] leading-[1.65]" style={{ color: T.text2, fontFamily: T.sans }}>{u.details}</p>}
              <Diff rows={u.diff} />
              {u.affects?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]" style={{ fontFamily: T.sans }}>
                  <span style={{ color: T.text3 }}>Стосується:</span>
                  {u.affects.map((a) => <span key={a} className="rounded-md px-2 py-0.5" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)', color: T.text2 }}>{a}</span>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 text-[12.5px]" style={{ fontFamily: T.sans }}>
                {u.change && <button type="button" onClick={() => openPropChange(u.change)} className="font-semibold" style={{ color: T.acc }}>Що це значить для мене</button>}
                {u.source && /^https?:/.test(u.source) && (
                  <a href={u.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline" style={{ color: T.text3 }}>Джерело на сайті пропа <ExternalLink size={11} /></a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PropUpdates({ firm, items, checkedAt }) {
  const [open, setOpen] = useState(0);
  return (
    <section className="p-5 sm:p-6" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 20 }}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${T.accRgb},0.12)` }}>
          <History size={18} style={{ color: T.acc }} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[17px] font-bold" style={{ color: T.text, fontFamily: T.display }}>Останні зміни на {firm}</h3>
          <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>
            <Radar size={13} style={{ color: T.ok }} />Перевіряємо сайт пропа щодня{checkedAt ? ` · правила зібрано ${fmt(checkedAt)}` : ''} · натисни, щоб розгорнути
          </p>
        </div>
      </div>

      {!items.length && (
        <div className="rounded-xl px-4 py-4 text-[13.5px]" style={{ background: 'var(--edge-sunken)', color: T.text2, fontFamily: T.sans }}>
          Поки змін не було. Щойно {firm} щось поміняє, напишемо тут і покажемо віконце, коли зайдеш.
        </div>
      )}

      {items.length > 0 && (
        <div className="relative grid gap-1 pl-6">
          <span className="absolute bottom-4 left-[5px] top-4 w-px" style={{ background: 'var(--edge-line)' }} />
          {items.map((u, i) => <Item key={i} u={u} first={!i} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />)}
        </div>
      )}
    </section>
  );
}
